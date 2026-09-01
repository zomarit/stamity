import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { syncCommand } from "../../../src/cli/commands/sync.ts";
import { propagationPatch, workspaceCommand } from "../../../src/cli/commands/workspace.ts";
import { runCli, type CommandIo } from "../../../src/cli/kit/program.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { createManifest, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import type { MaturityTier, Tool } from "../../../src/types/core.ts";
import { MANIFEST_FILE, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { readWorkspaceManifest } from "../../../src/workspace/manifest.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  WORKSPACE_MANIFEST_VERSION,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
} from "../../../src/workspace/model.ts";
import type { ResolvedRepoConfig } from "../../../src/workspace/resolve.ts";
import { WORKSPACE_SYNC_JOURNAL_FILE } from "../../../src/workspace/sync.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { MENU_KEYS, MenuTtyInput, waitForOutput } from "../../support/menuTty.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * Real-filesystem lane, no mocks anywhere: every row `workspace status` prints
 * is a statement about a directory — present, holding a setup manifest, gone,
 * or reached through a link that leaves the tree — and the last three of those
 * only a real volume produces. The journal cases are the same argument: the
 * tail read is byte arithmetic over a file, so a fixture that is not a file
 * would test the parser and not the read.
 *
 * The workspace root is a SUBDIRECTORY of the temp handle rather than the
 * handle itself, so `outside/` can be a real sibling the escape case links to
 * and the cleanup still owns both.
 */

/** `mkfifo` and a directory symlink under test both need a real POSIX filesystem. */
const WINDOWS = process.platform === "win32";

const getTemp = useTempDir("stamity-workspace");

function manifestOf(
  repos: WorkspaceRepoEntry[],
  overrides: Partial<WorkspaceManifest> = {},
): WorkspaceManifest {
  return {
    version: WORKSPACE_MANIFEST_VERSION,
    defaults: { tools: ["claude"] },
    repos,
    ...overrides,
  };
}

/** Writes `workspace.json` into `<temp>/ws` and answers the root's absolute path. */
async function seedWorkspace(temp: TempDirHandle, manifest: WorkspaceManifest): Promise<string> {
  const root = temp.path("ws");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, WORKSPACE_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return root;
}

/**
 * A member directory under `root`. `configured` writes the setup manifest whose
 * presence is the whole difference between an `ok` row and an `unconfigured`
 * one — status probes for the file and never parses it, so the minimal
 * document is the honest fixture.
 */
async function seedMember(root: string, path: string, configured: boolean): Promise<string> {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  if (configured) {
    await mkdir(join(dir, STATE_DIR), { recursive: true });
    await writeFile(
      join(dir, STATE_DIR, MANIFEST_FILE),
      `${JSON.stringify({ version: "1.0.0", tools: ["claude"] }, null, 2)}\n`,
      "utf8",
    );
  }
  return dir;
}

/** Appends raw journal lines verbatim, so a truncated fragment stays truncated. */
async function seedJournal(root: string, lines: readonly string[]): Promise<void> {
  await mkdir(join(root, STATE_DIR), { recursive: true });
  await writeFile(join(root, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE), lines.join(""), "utf8");
}

function journalLine(entry: Record<string, unknown>): string {
  return `${JSON.stringify(entry)}\n`;
}

async function runWorkspace(
  cwd: string,
  args: readonly string[] = [],
  opts: { tty?: { stdout?: boolean; stdin?: boolean }; stdinLines?: readonly string[] } = {},
): ReturnType<typeof runInProcess> {
  return runInProcess([workspaceCommand], ["workspace", ...args], {
    cwd,
    // NO_COLOR pins the one difference that is a terminal fact rather than a
    // dispatch fact, so a TTY run and a piped run are comparable byte for byte.
    env: { NO_COLOR: "1" },
    ...(opts.tty === undefined ? {} : { tty: opts.tty }),
    ...(opts.stdinLines === undefined ? {} : { stdinLines: opts.stdinLines }),
  });
}

/**
 * A directory `detectSubRepos` counts as a candidate: `.git`, a setup manifest,
 * or both — the two markers the scan qualifies on.
 *
 * `tools` writes a REAL setup manifest through the engine's own
 * `createManifest`/`writeManifest` pair rather than a hand-rolled document,
 * because `workspace init` derives `defaults.tools` by READING those manifests
 * back through the validating reader: a minimal `{version, tools}` fixture
 * would be refused by that reader and the union case would then pass on the
 * fallback path instead of the path it claims to cover.
 */
async function seedCandidate(
  root: string,
  path: string,
  opts: { git?: boolean; tools?: readonly Tool[] } = {},
): Promise<string> {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  if (opts.git !== false) await mkdir(join(dir, ".git"), { recursive: true });
  if (opts.tools !== undefined) {
    await writeManifest(
      dir,
      createManifest({
        tools: [...opts.tools],
        selection: { items: { agent: [], skill: [], rule: [], command: [] } },
        generatorVersion: "0.0.0-test",
      }),
    );
  }
  return dir;
}

/** The workspace manifest at `root`, or `null` — read back through the engine's own reader. */
async function readBack(root: string): Promise<WorkspaceManifest | null> {
  return readWorkspaceManifest(root);
}

interface InitDoc {
  ok: boolean;
  path: string;
  created: boolean;
  dryRun: boolean;
  members: string[];
  defaults: { tools: string[] } | null;
  manifest: WorkspaceManifest | null;
  // `why` and `next` are the two optional lines a CliFailure carries into the
  // envelope; the refusal cases below read them because that is where the
  // remedy and the second named path actually land.
  error?: { code: string; message: string; why?: string; next?: string };
}

/** The single init document; same one-document rule the status helper enforces. */
function singleInitDocument(stdout: string): InitDoc {
  const lines = stdout.trimEnd().split("\n");
  expect(lines, "a --json run emits exactly one document").toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as InitDoc;
}

interface StatusDoc {
  ok: boolean;
  command: string;
  root: { path: string; hasSetupManifest: boolean };
  members: {
    path: string;
    state: string;
    tools?: string[];
    groups?: string[];
    lockedApplied?: string[];
    error?: { code: string; message: string };
  }[];
  journal: { repo: string; run: string; ts: string }[];
  error?: { code: string; message: string };
}

/** The single JSON document the run emitted; fails loudly if it emitted two. */
function singleDocument(stdout: string): StatusDoc {
  const lines = stdout.trimEnd().split("\n");
  expect(lines, "a --json run emits exactly one document").toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as StatusDoc;
}

describe("workspace status — member rows", () => {
  it("reads ok, unconfigured and absent in declaration order and still exits 0", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "a" }, { path: "b" }, { path: "c" }]),
    );
    await seedMember(root, "a", true);
    await seedMember(root, "b", false);

    const result = await runWorkspace(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/ok\s+a\s/);
    expect(result.stdout).toMatch(/unconfigured\s+b\s/);
    expect(result.stdout).toMatch(/absent\s+c\s/);
    // Declaration order, read off the member rows alone — the row lines are the
    // ones whose first token is a state.
    const rows = result.stdout
      .split("\n")
      .map((line) => line.trim().split(/\s+/))
      .filter((cells) => ["ok", "unconfigured", "absent"].includes(cells[0] ?? ""));
    expect(rows.map((cells) => cells[1])).toEqual(["a", "b", "c"]);
  });

  it("reads escaped for a member linked outside the workspace root, and exits 0", async () => {
    const temp = getTemp();
    const outside = temp.path("outside");
    await mkdir(outside, { recursive: true });
    const root = await seedWorkspace(temp, manifestOf([{ path: "gone" }]));
    await symlink(outside, join(root, "gone"), "dir");

    const result = await runWorkspace(root, ["status", "--json"]);

    expect(result.code).toBe(0);
    // Resolution is pure and says nothing about disk, so an escaped member
    // still reports what the workspace owes it — the state is the disk half.
    expect(singleDocument(result.stdout).members).toEqual([
      { path: "gone", state: "escaped", tools: ["claude"] },
    ]);
  });

  it("keeps a member linked to a directory inside the root out of the escaped state", async () => {
    // Containment, not link-phobia: the same distinction the cascade draws.
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "linked" }]));
    await seedMember(root, "real/web", true);
    await symlink(join(root, "real/web"), join(root, "linked"), "dir");

    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(doc.members[0]?.state).toBe("ok");
  });

  it("reads unresolved and carries resolveRepoConfig's own message for an undefined group", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "web", groups: ["frontend"] }]));
    await seedMember(root, "web", true);

    const result = await runWorkspace(root, ["status", "--json"]);
    const doc = singleDocument(result.stdout);

    expect(result.code).toBe(0);
    expect(doc.members[0]?.state).toBe("unresolved");
    expect(doc.members[0]?.error?.code).toBe("VALIDATION_ERROR");
    expect(doc.members[0]?.error?.message).toContain('references group "frontend"');
    expect(doc.members[0]?.tools).toBeUndefined();
  });

  it("reads unresolved rather than absent for a member naming an undefined group whose directory is also missing", async () => {
    // Resolution runs FIRST and its refusal wins the row: an entry the resolver
    // rejects has no tools, groups or locks to report, so `classifyMemberDir`
    // is never even reached, whatever the filesystem says about the path.
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "ghost", groups: ["frontend"] }]));
    // `ghost` is never seeded — no directory exists at that path.

    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(doc.members[0]?.state).toBe("unresolved");
    expect(doc.members[0]?.state).not.toBe("absent");
    expect(doc.members[0]?.error?.code).toBe("VALIDATION_ERROR");
    expect(doc.members[0]?.error?.message).toContain('references group "frontend"');
    expect(doc.members[0]?.tools).toBeUndefined();
  });

  it("reports the RESOLVED tool list for a member whose group replaces it", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "web", groups: ["frontend" ] }, { path: "api" }], {
        groups: [{ name: "frontend", toolOverrides: ["claude", "codex"] }],
      }),
    );
    await seedMember(root, "web", true);
    await seedMember(root, "api", true);

    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(doc.members[0]).toEqual({
      path: "web",
      state: "ok",
      tools: ["claude", "codex"],
      groups: ["frontend"],
    });
    // The sibling with no group keeps the defaults, so the row above is the
    // group's doing rather than a manifest-wide change.
    expect(doc.members[1]?.tools).toEqual(["claude"]);
  });

  it("carries lockedApplied for a member whose removal the lock refused", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(
      temp,
      manifestOf(
        [{ path: "web", overrides: { removeItems: { agent: ["reviewer"] } } }],
        {
          defaults: {
            tools: ["claude"],
            selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
          },
          lockedContent: ["reviewer"],
        },
      ),
    );
    await seedMember(root, "web", true);

    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(doc.members[0]?.lockedApplied).toEqual(["reviewer"]);
  });

  it("exits 1 at the read, printing no row, when repos[] spells one directory twice", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "api" }, { path: "./api" }]));
    await seedMember(root, "api", true);

    const result = await runWorkspace(root, ["status"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('"api"');
    expect(result.stderr).toContain('"./api"');
    expect(result.stdout).not.toContain("ok");
  });
});

describe("workspace status — the root line", () => {
  it("reports the root's own setup manifest and never rows the root as a member", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "web" }]));
    await seedMember(root, "web", true);
    await mkdir(join(root, STATE_DIR), { recursive: true });
    await writeFile(join(root, STATE_DIR, MANIFEST_FILE), "{}\n", "utf8");

    const result = await runWorkspace(root, ["status", "--json"]);
    const doc = singleDocument(result.stdout);

    expect(doc.root).toEqual({ path: root, hasSetupManifest: true });
    expect(doc.members.map((row) => row.path)).toEqual(["web"]);
  });

  it("says so when the root carries no setup manifest of its own", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([]));

    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(doc.root.hasSetupManifest).toBe(false);
  });

  it("resolves the enclosing workspace when run from a member directory", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    const member = await seedMember(root, "apps/web", true);

    const doc = singleDocument((await runWorkspace(member, ["status", "--json"])).stdout);

    expect(doc.root.path).toBe(root);
    expect(doc.members[0]?.state).toBe("ok");
  });

  it("reports the NESTED workspace, not the outer one, when one sits between the root and the cwd", async () => {
    const temp = getTemp();
    // Outer workspace rooted at `ws`, one of whose members (`apps/web`) is
    // ITSELF a nested workspace root over its own packages — the nearest
    // manifest to `cwd` wins, shadowing the outer one for everything below it.
    const outerRoot = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    const nestedRoot = join(outerRoot, "apps/web");
    await mkdir(nestedRoot, { recursive: true });
    await writeFile(
      join(nestedRoot, WORKSPACE_MANIFEST_FILE),
      `${JSON.stringify(manifestOf([{ path: "packages/a" }]), null, 2)}\n`,
      "utf8",
    );
    await seedMember(nestedRoot, "packages/a", true);
    const cwd = join(nestedRoot, "packages/a");
    await mkdir(cwd, { recursive: true });

    const doc = singleDocument((await runWorkspace(cwd, ["status", "--json"])).stdout);

    expect(doc.root.path).toBe(nestedRoot);
    expect(doc.root.path).not.toBe(outerRoot);
    expect(doc.members).toEqual([{ path: "packages/a", state: "ok", tools: ["claude"] }]);
  });
});

describe("workspace status — the crash journal", () => {
  const RUN = "run-2026-08-31-0001";

  it("names the member left in flight by a started line with no terminal line", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/api" }, { path: "apps/web" }]));
    await seedMember(root, "apps/api", true);
    await seedMember(root, "apps/web", true);
    await seedJournal(root, [
      journalLine({ ts: "2026-08-31T10:00:00.000Z", run: RUN, repo: "apps/api", event: "started" }),
      journalLine({
        ts: "2026-08-31T10:00:01.000Z",
        run: RUN,
        repo: "apps/api",
        event: "finished",
        status: "ok",
      }),
      journalLine({ ts: "2026-08-31T10:00:02.000Z", run: RUN, repo: "apps/web", event: "started" }),
    ]);

    const result = await runWorkspace(root, ["status"]);
    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("apps/web");
    expect(result.stdout).toContain(RUN);
    expect(result.stdout).toContain("2026-08-31T10:00:02.000Z");
    expect(result.stdout).toContain("half-written");
    // TEST CHANGE, justified (D2): `journal` is now an ARRAY of every live
    // flight rather than at most one — see the "multiple flights" and "a
    // later clean run" cases below for why a single object can no longer
    // state the contract. One live flight is still one element.
    expect(doc.journal).toEqual([
      {
        repo: "apps/web",
        run: RUN,
        ts: "2026-08-31T10:00:02.000Z",
      },
    ]);
  });

  it("strips control bytes out of a journal line's ts before it renders", async () => {
    // Fragment-assembled rather than a literal escape byte in the source: the
    // journal is content this process did not author, and `ts` goes through
    // the same `sanitizeLabel` sink `repo` and `run` already did -- an ESC
    // sequence in it could otherwise clear or forge the status screen.
    const esc = String.fromCharCode(27);
    const hostileTs = esc + "[2J" + esc + "[31mFORGED";
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    await seedMember(root, "apps/web", true);
    await seedJournal(root, [
      journalLine({ ts: hostileTs, run: RUN, repo: "apps/web", event: "started" }),
    ]);

    const result = await runWorkspace(root, ["status"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("half-written");
    expect(result.stdout).not.toContain(esc);
    // The bytes that are not control codes survive -- only the escapes go --
    // so the rendered line still names what the journal carried, inert.
    expect(result.stdout).toContain("started at [2J[31mFORGED in");
  });

  it("prints nothing when every started line has its terminal line", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    await seedMember(root, "apps/web", true);
    await seedJournal(root, [
      journalLine({ ts: "2026-08-31T10:00:00.000Z", run: RUN, repo: "apps/web", event: "started" }),
      journalLine({
        ts: "2026-08-31T10:00:01.000Z",
        run: RUN,
        repo: "apps/web",
        event: "finished",
        status: "ok",
      }),
      journalLine({
        ts: "2026-08-31T10:00:02.000Z",
        run: RUN,
        repo: "apps/legacy",
        event: "skipped",
        reason: "duplicate",
      }),
    ]);

    const result = await runWorkspace(root, ["status"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("half-written");
    // TEST CHANGE, justified (D2): "no live flight" is now the empty array
    // rather than `null` — see the array-shape note on the case above.
    expect(singleDocument((await runWorkspace(root, ["status", "--json"])).stdout).journal).toEqual(
      [],
    );
  });

  it("prints nothing, exits 0 and writes nothing when the last line is truncated mid-JSON", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    await seedMember(root, "apps/web", true);
    const lines = [
      journalLine({ ts: "2026-08-31T10:00:00.000Z", run: RUN, repo: "apps/web", event: "started" }),
      journalLine({
        ts: "2026-08-31T10:00:01.000Z",
        run: RUN,
        repo: "apps/web",
        event: "finished",
        status: "ok",
      }),
      '{"ts":"2026-08-31T10:00:02.000Z","run":"run-2","repo":"apps/we',
    ];
    await seedJournal(root, lines);

    const result = await runWorkspace(root, ["status"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("half-written");
    expect(
      await readFile(join(root, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE), "utf8"),
      "status never writes the journal back",
    ).toBe(lines.join(""));
  });

  it("prints nothing when there is no journal at all", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    await seedMember(root, "apps/web", true);

    const result = await runWorkspace(root, ["status"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("half-written");
  });

  // D1: a FIFO planted at the journal's name must never make `open(path, "r")`
  // block forever. `mkfifo` is POSIX-only, so this case is skipped on Windows
  // rather than made to pass there — there is no FIFO to plant.
  it.skipIf(WINDOWS)(
    "returns instead of hanging when a FIFO sits at the journal's name",
    async () => {
      const temp = getTemp();
      const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
      await seedMember(root, "apps/web", true);
      await mkdir(join(root, STATE_DIR), { recursive: true });
      execFileSync("mkfifo", [join(root, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE)]);

      // The vitest timeout IS the red signal for this case: before the fix,
      // `open(fifo, "r")` blocks forever with nothing on the write end, and
      // this `await` never resolves. The assertion below only runs because the
      // command returned at all.
      const result = await runWorkspace(root, ["status"]);

      expect(result.code).toBe(0);
      expect(result.stdout).not.toContain("half-written");
    },
  );

  // D2(a): a stale flight must not survive a LATER, unrelated clean run for the
  // same repo — only hand-deleting the journal should have cleared it before
  // this fix, which is exactly the undocumented trap the finding names.
  it("suppresses a stale flight once a LATER run writes a terminal line for the same repo", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/web" }]));
    await seedMember(root, "apps/web", true);
    await seedJournal(root, [
      // A run that died mid-flight on apps/web...
      journalLine({ ts: "2026-08-31T09:00:00.000Z", run: "run-A", repo: "apps/web", event: "started" }),
      // ...followed by a LATER, DIFFERENT run that completed apps/web cleanly.
      journalLine({ ts: "2026-08-31T10:00:00.000Z", run: "run-B", repo: "apps/web", event: "started" }),
      journalLine({
        ts: "2026-08-31T10:00:01.000Z",
        run: "run-B",
        repo: "apps/web",
        event: "finished",
        status: "ok",
      }),
    ]);

    const result = await runWorkspace(root, ["status"]);
    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("half-written");
    expect(doc.journal).toEqual([]);
  });

  // D2(b): default concurrency runs several members at once, so more than one
  // flight can be genuinely live — every one of them has to be named, not just
  // the newest.
  it("names every member still in flight when more than one is unterminated", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/web" }, { path: "apps/db" }]),
    );
    await seedMember(root, "apps/api", true);
    await seedMember(root, "apps/web", true);
    await seedMember(root, "apps/db", true);
    await seedJournal(root, [
      journalLine({ ts: "2026-08-31T10:00:00.000Z", run: RUN, repo: "apps/api", event: "started" }),
      journalLine({ ts: "2026-08-31T10:00:01.000Z", run: RUN, repo: "apps/web", event: "started" }),
      journalLine({
        ts: "2026-08-31T10:00:02.000Z",
        run: RUN,
        repo: "apps/db",
        event: "finished",
        status: "ok",
      }),
    ]);

    const result = await runWorkspace(root, ["status"]);
    const doc = singleDocument((await runWorkspace(root, ["status", "--json"])).stdout);

    expect(result.code).toBe(0);
    expect(result.stdout.match(/in flight:/g)).toHaveLength(2);
    expect(doc.journal.map((flight) => flight.repo).toSorted()).toEqual(["apps/api", "apps/web"]);
  });
});

describe("workspace — dispatch and refusals", () => {
  it("refuses with CONFIG_ERROR when no workspace.json sits at or above the cwd", async () => {
    const temp = getTemp();
    const lonely = temp.path("lonely");
    await mkdir(lonely, { recursive: true });

    const result = await runWorkspace(lonely, ["status", "--json"]);
    const doc = singleDocument(result.stdout);

    expect(result.code).toBe(1);
    expect(doc.ok).toBe(false);
    expect(doc.error?.code).toBe("CONFIG_ERROR");
    expect(doc.error?.message).toContain("no workspace");
  });

  it("refuses an unknown subcommand with a USAGE failure naming the closed set", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([]));

    const result = await runWorkspace(root, ["frobnicate"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("frobnicate");
    expect(result.stderr).toContain("status");
    expect(result.stderr).toContain("init");
    expect(result.stderr).toContain("sync");
  });

  it("renders bare `workspace` as status, byte for byte, on a TTY and on a pipe", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "web" }]));
    await seedMember(root, "web", true);

    const bareTty = await runWorkspace(root, [], { tty: { stdout: true, stdin: true } });
    const barePipe = await runWorkspace(root, []);
    const explicit = await runWorkspace(root, ["status"]);

    expect(bareTty.stdout).toBe(barePipe.stdout);
    expect(barePipe.stdout).toBe(explicit.stdout);
    expect(bareTty.code).toBe(0);
  });

  it("leaves --dry-run inert on status: a read previews as itself", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "web" }]));
    await seedMember(root, "web", true);

    const plain = await runWorkspace(root, ["status"]);
    const preview = await runWorkspace(root, ["status", "--dry-run"]);

    expect(preview.stdout).toBe(plain.stdout);
    expect(preview.code).toBe(0);
  });

  /*
   * REPLACED, not weakened: the case that stood here asserted `workspace sync`
   * refuses as "not wired in this build". That refusal WAS the contract while
   * the cascade was unimplemented and this unit implements it, so the behaviour
   * it gated no longer exists — the `workspace sync` blocks below are the
   * replacement, and they assert the cascade the refusal was a placeholder for.
   * The interim arm's own claim (a member set that syncs nothing still reports
   * rather than pretending) survives as the empty-workspace case here.
   */
  it("reports an empty member set as a passed cascade rather than a refusal", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([]));

    const result = await runWorkspace(root, ["sync"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no members registered");
    expect(result.stderr).toBe("");
  });
});

describe("workspace init — guided creation", () => {
  it("writes a manifest registering every candidate in detection order, valid on read-back", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "tools/cli");
    await seedCandidate(root, "apps/web");
    await seedCandidate(root, "apps/api");

    const result = await runWorkspace(root, ["init"]);

    expect(result.code).toBe(0);
    // Read back through the engine's own reader: it re-validates, so a manifest
    // that parses here is one every other workspace subcommand will accept.
    const written = await readBack(root);
    expect(written?.repos.map((entry) => entry.path)).toEqual([
      "apps/api",
      "apps/web",
      "tools/cli",
    ]);
    expect(written?.version).toBe(WORKSPACE_MANIFEST_VERSION);
    expect(Object.keys(written ?? {})).toEqual(["version", "defaults", "repos"]);
  });

  it("proceeds on exactly one candidate — one member is a workspace with room to grow", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "only");

    const result = await runWorkspace(root, ["init"]);

    expect(result.code).toBe(0);
    expect((await readBack(root))?.repos.map((entry) => entry.path)).toEqual(["only"]);
  });

  it("creates unattended, naming the written path, the member count and every member", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api");
    await seedCandidate(root, "apps/web");

    // -y on a non-TTY: the deliberate asymmetry with `stamity init`, which
    // refuses to create a workspace unattended. The verb was named here.
    const result = await runWorkspace(root, ["init", "-y"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(join(root, WORKSPACE_MANIFEST_FILE));
    expect(result.stdout).toContain("2 members");
    expect(result.stdout).toContain("apps/api");
    expect(result.stdout).toContain("apps/web");
    expect(result.stdout).toContain("stamity workspace sync");
    expect((await readBack(root))?.repos).toHaveLength(2);
  });

  it("emits one --json document describing what was written", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api", { tools: ["claude"] });
    await seedCandidate(root, "apps/web");

    const doc = singleInitDocument((await runWorkspace(root, ["init", "--json"])).stdout);

    expect(doc.ok).toBe(true);
    expect(doc.created).toBe(true);
    expect(doc.dryRun).toBe(false);
    expect(doc.path).toBe(join(root, WORKSPACE_MANIFEST_FILE));
    expect(doc.members).toEqual(["apps/api", "apps/web"]);
    expect(doc.defaults).toEqual({ tools: ["claude"] });
    expect(doc.manifest?.repos).toEqual([{ path: "apps/api" }, { path: "apps/web" }]);
  });

  it("previews under --dry-run: the whole manifest is printed and no file lands", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api");
    await seedCandidate(root, "apps/web");

    const result = await runWorkspace(root, ["init", "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`"version": "${WORKSPACE_MANIFEST_VERSION}"`);
    expect(result.stdout).toContain('"path": "apps/web"');
    expect(result.stdout).toContain("nothing was written");
    expect(await readBack(root)).toBeNull();
  });

  it("scans four levels down — the depth its zero-candidate refusal names", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "l1/l2/l3/l4");
    await seedCandidate(root, "d1/d2/d3/d4/d5");

    const result = await runWorkspace(root, ["init"]);

    expect(result.code).toBe(0);
    // The fifth level is out of reach, so the message's "4 levels" is a fact
    // about the scan rather than a number copied into prose.
    expect((await readBack(root))?.repos.map((entry) => entry.path)).toEqual(["l1/l2/l3/l4"]);
  });
});

describe("workspace init — the refusal matrix", () => {
  it("refuses when a workspace.json already sits at the cwd, leaving it untouched", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "stale" }]));
    await seedCandidate(root, "apps/web");
    const before = await readFile(join(root, WORKSPACE_MANIFEST_FILE), "utf8");

    const result = await runWorkspace(root, ["init", "--json"]);
    const doc = singleInitDocument(result.stdout);

    expect(result.code).toBe(1);
    expect(doc.error?.code).toBe("VALIDATION_ERROR");
    expect(doc.error?.message).toContain(join(root, WORKSPACE_MANIFEST_FILE));
    expect(await readFile(join(root, WORKSPACE_MANIFEST_FILE), "utf8")).toBe(before);
  });

  it("overwrites that manifest under --force with the new selection", async () => {
    const temp = getTemp();
    const root = await seedWorkspace(temp, manifestOf([{ path: "stale" }]));
    await seedCandidate(root, "apps/api");
    await seedCandidate(root, "apps/web");

    const result = await runWorkspace(root, ["init", "--force"]);

    expect(result.code).toBe(0);
    expect((await readBack(root))?.repos.map((entry) => entry.path)).toEqual([
      "apps/api",
      "apps/web",
    ]);
  });

  it("refuses inside an outer workspace, naming the outer root and its manifest", async () => {
    const temp = getTemp();
    const outer = await seedWorkspace(temp, manifestOf([{ path: "team" }]));
    const inner = join(outer, "team");
    await seedCandidate(inner, "apps/api");
    await seedCandidate(inner, "apps/web");

    const result = await runWorkspace(inner, ["init", "--json"]);
    const doc = singleInitDocument(result.stdout);

    expect(result.code).toBe(1);
    expect(doc.error?.code).toBe("VALIDATION_ERROR");
    expect(doc.error?.message).toContain(outer);
    expect(doc.error?.why).toContain(join(outer, WORKSPACE_MANIFEST_FILE));
    expect(doc.error?.next).toContain("--force");
    expect(await readBack(inner)).toBeNull();
  });

  it("nests a workspace under --force — the nearest manifest wins for what is below it", async () => {
    const temp = getTemp();
    const outer = await seedWorkspace(temp, manifestOf([{ path: "team" }]));
    const inner = join(outer, "team");
    await seedCandidate(inner, "apps/api");
    await seedCandidate(inner, "apps/web");

    const result = await runWorkspace(inner, ["init", "--force"]);

    expect(result.code).toBe(0);
    expect((await readBack(inner))?.repos.map((entry) => entry.path)).toEqual([
      "apps/api",
      "apps/web",
    ]);
    // The outer manifest is a different file and stays as it was.
    expect((await readBack(outer))?.repos.map((entry) => entry.path)).toEqual(["team"]);
  });

  it("refuses zero candidates, naming the scan depth and both markers — and --force does not lift it", async () => {
    const temp = getTemp();
    const root = temp.path("empty");
    await mkdir(join(root, "docs/notes"), { recursive: true });

    const plain = await runWorkspace(root, ["init"]);
    const forced = await runWorkspace(root, ["init", "--force"]);

    for (const result of [plain, forced]) {
      expect(result.code).toBe(1);
      expect(result.stderr).toContain("4");
      expect(result.stderr).toContain(".git");
      expect(result.stderr).toContain(`${STATE_DIR}/${MANIFEST_FILE}`);
    }
    expect(await readBack(root)).toBeNull();
  });
});

describe("workspace init — defaults.tools", () => {
  it("unions the members' own tool lists into TOOLS order", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    // Two members, two different lists: the union has to merge rather than take
    // the first, and TOOLS order has to reorder rather than echo scan order.
    await seedCandidate(root, "apps/api", { tools: ["codex"] });
    await seedCandidate(root, "apps/web", { tools: ["claude", "codex"] });

    await runWorkspace(root, ["init"]);

    expect((await readBack(root))?.defaults.tools).toEqual(["claude", "codex"]);
  });

  it("falls back to claude when no selected member carries a setup manifest", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api");
    await seedCandidate(root, "apps/web");

    await runWorkspace(root, ["init"]);

    expect((await readBack(root))?.defaults.tools).toEqual(["claude"]);
  });

  it("lets --tools override what the members carry", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api", { tools: ["claude"] });
    await seedCandidate(root, "apps/web", { tools: ["cursor"] });

    await runWorkspace(root, ["init", "--tools", "codex"]);

    expect((await readBack(root))?.defaults.tools).toEqual(["codex"]);
  });

  it("refuses an unknown --tools value before anything is written, listing the valid ids", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/web");

    const result = await runWorkspace(root, ["init", "--tools", "claude,frobnicate"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("frobnicate");
    expect(result.stderr).toContain("claude");
    expect(await readBack(root)).toBeNull();
  });
});

describe("workspace init — the one question", () => {
  it("labels each row with its path and markers, preselects all, and writes the subset picked", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api", { tools: ["claude"] });
    await seedCandidate(root, "apps/web");

    const result = await runWorkspace(root, ["init"], {
      tty: { stdin: true },
      stdinLines: ["2"],
    });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`apps/api — .git, ${STATE_DIR}`);
    expect(result.stdout).toContain("apps/web — .git");
    // Every candidate preselected: the typed path renders the default set in
    // brackets, so `[1,2]` is the assertion that both boxes started ticked.
    expect(result.stdout).toContain("[1,2]");
    expect((await readBack(root))?.repos.map((entry) => entry.path)).toEqual(["apps/web"]);
  });

  it("writes nothing and exits 0 when every box is cleared", async () => {
    const temp = getTemp();
    const root = temp.path("ws");
    await mkdir(root, { recursive: true });
    await seedCandidate(root, "apps/api");
    await seedCandidate(root, "apps/web");

    /*
     * The raw menu, not the typed list: an EMPTY selection is only expressible
     * by clearing boxes, because a blank typed answer means "keep the
     * defaults". The stdin double is `test/support/menuTty.ts` — substitute for
     * one reason, the device: a vitest worker has no terminal on either stream,
     * and the kit draws the menu only where stdin can leave line mode. The
     * frames, the keypress decoding and the toggle bookkeeping are the shipped
     * kit driven by real escape bytes.
     */
    const chunks: string[] = [];
    const io: CommandIo = {
      out: (text) => {
        chunks.push(text);
      },
      err: (text) => {
        chunks.push(text);
      },
    };
    const input = new MenuTtyInput();
    const promptOut = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        chunks.push(String(chunk));
        callback();
      },
    }) as Writable & { isTTY?: boolean };
    promptOut.isTTY = true;

    const run = runCli(["workspace", "init"], [workspaceCommand], {
      cwd: root,
      env: { NO_COLOR: "1" },
      io,
      promptIo: { input, output: promptOut },
      terminal: { stdoutIsTTY: false, stderrIsTTY: false, stdinIsTTY: true },
    });
    const transcript = (): string => chunks.join("");

    await waitForOutput(transcript, "> [x] apps/api", "the member menu");
    input.write(MENU_KEYS.space);
    await waitForOutput(transcript, "> [ ] apps/api", "the first box cleared");
    input.write(MENU_KEYS.down);
    input.write(MENU_KEYS.space);
    await waitForOutput(transcript, "> [ ] apps/web", "the second box cleared");
    input.write(MENU_KEYS.enter);

    expect(await run).toBe(0);
    expect(transcript()).toContain("nothing was created");
    expect(await readBack(root)).toBeNull();
  });
});

// ── workspace sync: the cascade ────────────────────────────────────────────

/**
 * Real temp trees and the real emission engine, no mocks: the cascade's whole
 * claim is that a member's OWN `.stamity/manifest.json` and its OWN generated
 * tree move, and both of those are statements about bytes on a volume. The
 * planner is the shipped one — a substituted planner would leave "the member's
 * tree holds the codex emission" asserting a fixture rather than the engine.
 *
 * The one pin is the corpus ROOT: `__setContentRootForTests` aims the bundled
 * content at a seeded minimal charter beside the workspace rather than at the
 * dev checkout's real corpus, so a member's emission is small, deterministic,
 * and owned by this test. Core emission requires a charter, so the fixture is
 * the smallest corpus a member can legitimately sync from.
 */

const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Test Charter",
  "",
  "Charter guidance body.",
  "",
].join("\n");

/** The clock every cascade run below is driven by: a fixed stamp is what makes
 *  "these bytes did not move" an exact assertion rather than a timing race. */
const T0 = new Date("2026-08-31T09:00:00.000Z");

afterEach(() => {
  __resetContentRootCacheForTests();
});

/**
 * Pins the corpus to `<temp>/corpus` — a SIBLING of the workspace root, never a
 * child, so the fixture never joins a member's repo analysis or a `readdir` the
 * cascade walks.
 */
async function seedCorpus(temp: TempDirHandle): Promise<void> {
  __setContentRootForTests(temp.path("corpus"));
  await temp.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });
}

/** A member repo carrying a REAL setup manifest, written through the validating writer. */
async function seedSyncMember(
  root: string,
  path: string,
  opts: {
    tools?: readonly Tool[];
    maturityTier?: MaturityTier;
    patch?: Partial<SetupManifest>;
  } = {},
): Promise<string> {
  const dir = join(root, path);
  await mkdir(dir, { recursive: true });
  const base = createManifest({
    tools: [...(opts.tools ?? ["claude"])],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: "0.0.0-test",
    now: T0,
    ...(opts.maturityTier === undefined ? {} : { maturityTier: opts.maturityTier }),
  });
  await writeManifest(dir, { ...base, ...opts.patch }, { now: T0 });
  return dir;
}

/** `workspace sync` through the funnel, on the fixed clock. */
async function runSync(
  cwd: string,
  args: readonly string[] = [],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CommandIo = {
    out: (text) => {
      stdout.push(text);
    },
    err: (text) => {
      stderr.push(text);
    },
  };
  const code = await runCli(["workspace", "sync", ...args], [workspaceCommand], {
    cwd,
    env: { NO_COLOR: "1" },
    io,
    // The kit's own clock seam. `runInProcess` does not forward one, and a
    // fixed stamp is exactly what the no-op-write case needs: both writers on a
    // member manifest (this bridge and `applySync`'s commit point) stamp
    // `updatedAt` from it, so byte equality across two runs isolates the
    // bridge's patch from the wall clock.
    clock: { now: () => T0 },
  });
  return { code, stdout: stdout.join(""), stderr: stderr.join("") };
}

interface SyncDoc {
  ok: boolean;
  root: string;
  dryRun: boolean;
  outcome: string;
  counts: { total: number; succeeded: number; failed: number; skipped: number };
  repos: {
    repoPath: string;
    ok: boolean;
    state: string;
    patched?: string[];
    lockedApplied?: string[];
    error?: { code: string; message: string };
  }[];
  journalWarnings: string[];
  error?: { code: string; message: string };
}

function singleSyncDocument(stdout: string): SyncDoc {
  const lines = stdout.trimEnd().split("\n");
  expect(lines, "a --json run emits exactly one document").toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as SyncDoc;
}

/** Whether a path exists — the emission assertions are about presence. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** A member's manifest bytes exactly as they sit on disk. */
async function manifestBytes(memberDir: string): Promise<string> {
  return readFile(join(memberDir, STATE_DIR, MANIFEST_FILE), "utf8");
}

describe("workspace sync — the bridge", () => {
  it("writes the workspace's tools into each member's manifest and regenerates its tree", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/web" }], {
        defaults: { tools: ["claude", "codex"] },
      }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    const web = await seedSyncMember(root, "apps/web", { tools: ["claude"] });

    const result = await runSync(root);

    expect(result.code).toBe(0);
    // The patch is PERSISTED: each member is now correct when synced alone.
    expect((await readManifest(api))?.tools).toEqual(["claude", "codex"]);
    expect((await readManifest(web))?.tools).toEqual(["claude", "codex"]);
    // And the emission followed it: the codex tree exists in both members,
    // which is the half a manifest-only patch would leave undone.
    expect(await exists(join(api, ".codex/config.toml"))).toBe(true);
    expect(await exists(join(web, ".codex/config.toml"))).toBe(true);
    expect(result.stdout).toContain("patched tools");
    expect(result.stdout).toContain("2 members: 2 synced, 0 failed");
  });

  it("leaves a member the workspace declares no maturityTier for on its own tier", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/api" }]));
    const api = await seedSyncMember(root, "apps/api", { maturityTier: "scaleup" });

    expect((await runSync(root)).code).toBe(0);

    expect((await readManifest(api))?.maturityTier).toBe("scaleup");
  });

  it("propagates a declared maturityTier and mcp block, and names both in the row", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], {
        defaults: {
          tools: ["claude"],
          maturityTier: "enterprise",
          mcp: { servers: ["filesystem"] },
        },
      }),
    );
    const api = await seedSyncMember(root, "apps/api", { maturityTier: "solo" });

    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    const written = await readManifest(api);
    expect(written?.maturityTier).toBe("enterprise");
    expect(written?.mcp?.servers).toEqual(["filesystem"]);
    // `tools` already matched, so it is NOT in the patch — the three fields are
    // decided one by one rather than written as a block.
    expect(doc.repos[0]?.patched).toEqual(["maturityTier", "mcp"]);
  });

  it("carries a member's ledger and importChoice through the patch byte for byte", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }),
    );
    const api = await seedSyncMember(root, "apps/api", {
      tools: ["claude"],
      patch: { importChoice: [{ path: "AGENTS.md", mode: "supplement" }] },
    });

    expect((await runSync(root)).code).toBe(0);

    const written = await readManifest(api);
    expect(written?.importChoice).toEqual([{ path: "AGENTS.md", mode: "supplement" }]);
    // The ledger the run rebuilt is non-empty, which is the property a composed
    // (rather than patched) manifest would have destroyed: every emitted path
    // would be unowned and the reclaim sweep would act on that emptiness.
    expect((written?.ledger ?? []).length).toBeGreaterThan(0);
    expect(written?.createdAt).toBe(T0.toISOString());
  });

  it("skips the manifest write when the patch changes nothing — the bytes do not move", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude"] } }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });

    // The first cascade brings the member fully current; the second is the one
    // under test, and on the fixed clock every writer that DOES run reproduces
    // its own bytes — so a byte difference across it can only be a patch.
    expect((await runSync(root)).code).toBe(0);
    const before = await manifestBytes(api);
    const emittedBefore = await stat(join(api, ".claude/settings.json"));

    const result = await runSync(root);
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(result.code).toBe(0);
    expect(await manifestBytes(api)).toBe(before);
    expect(doc.repos[0]?.patched, "nothing to patch means nothing written").toEqual([]);
    expect(result.stdout).toContain("manifest already matched");
    // REQ-WS-014's other half: a full re-run is genuinely idempotent because
    // the member's own apply is only-when-stale.
    expect((await stat(join(api, ".claude/settings.json"))).mtimeMs).toBe(emittedBefore.mtimeMs);
  });

  it("moves the bytes when the same run has a patch to apply — the control for the case above", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude"] } }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    expect((await runSync(root)).code).toBe(0);
    const before = await manifestBytes(api);

    // Same fixed clock, same member, same corpus — only the workspace's tool
    // list changed, so a byte difference here isolates the bridge's write.
    await writeFile(
      join(root, WORKSPACE_MANIFEST_FILE),
      `${JSON.stringify(manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }), null, 2)}\n`,
      "utf8",
    );
    expect((await runSync(root)).code).toBe(0);

    expect(await manifestBytes(api)).not.toBe(before);
    expect((await readManifest(api))?.tools).toEqual(["claude", "codex"]);
  });

  it("never touches the workspace root's own manifest or tree", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }),
    );
    await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    // The root is itself an initialised repository — the case where mistaking
    // it for a member would be invisible.
    await seedSyncMember(root, ".", { tools: ["claude"] });
    const before = await manifestBytes(root);

    expect((await runSync(root)).code).toBe(0);

    expect(await manifestBytes(root)).toBe(before);
    expect(await exists(join(root, ".codex/config.toml"))).toBe(false);
  });
});

describe("workspace sync — the root pre-flight line", () => {
  // D3: the resolved root and member count must be visible BEFORE the cascade
  // writes a single member's manifest, not only in the report printed after
  // every write already landed.
  it("prints the resolved root, ahead of every per-member result, before any member is written", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/web" }], {
        defaults: { tools: ["claude"] },
      }),
    );
    await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    await seedSyncMember(root, "apps/web", { tools: ["claude"] });

    const result = await runSync(root);

    expect(result.code).toBe(0);
    const rootLineIndex = result.stdout.indexOf(root);
    const firstMemberResultIndex = result.stdout.indexOf("apps/api");
    expect(rootLineIndex).toBeGreaterThanOrEqual(0);
    expect(firstMemberResultIndex).toBeGreaterThan(rootLineIndex);
    expect(result.stdout).toContain("2 members declared");
  });
});

describe("workspace sync — a symlink alias between two members is refused", () => {
  // D5: duplicate detection at manifest-read time is textual
  // (`normalizeRepoPathKey`), while containment is realpath-resolved. A
  // `repos[]` entry that is a symlink to a SIBLING member passes both, so two
  // rows would otherwise cascade concurrently into one real directory.
  it.skipIf(WINDOWS)(
    "refuses before either row is attempted, naming both declared paths",
    async () => {
      const temp = getTemp();
      await seedCorpus(temp);
      const root = await seedWorkspace(
        temp,
        manifestOf([{ path: "apps/web" }, { path: "apps/web-alias" }], {
          defaults: { tools: ["claude"] },
        }),
      );
      const web = await seedSyncMember(root, "apps/web", { tools: ["claude"] });
      await symlink(web, join(root, "apps/web-alias"), "dir");

      const result = await runSync(root);
      const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain("apps/web");
      expect(result.stderr).toContain("apps/web-alias");
      expect(doc.error?.code).toBe("VALIDATION_ERROR");
      expect(doc.error?.message).toContain("apps/web");
      expect(doc.error?.message).toContain("apps/web-alias");
      // Neither row was ever attempted — the manifest is untouched from what
      // `seedSyncMember` wrote, and nothing describes it as patched.
      expect((await readManifest(web))?.tools).toEqual(["claude"]);
    },
  );
});

describe("workspace sync — selection and locks are reported, not written", () => {
  it("leaves each member's selection to that member's own sync", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], {
        defaults: {
          tools: ["claude"],
          selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
        },
      }),
    );
    const api = await seedSyncMember(root, "apps/api");

    expect((await runSync(root)).code).toBe(0);

    // The workspace declared `reviewer`; the member's selection is whatever its
    // own planSync derived from the corpus, and this corpus has no such agent.
    expect((await readManifest(api))?.selection.items.agent).not.toContain("reviewer");
  });

  it("names a locked id whose removal the lock refused on the member's row, and says it is inert", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api", overrides: { removeItems: { agent: ["reviewer"] } } }], {
        defaults: {
          tools: ["claude"],
          selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
        },
        lockedContent: ["reviewer"],
      }),
    );
    await seedSyncMember(root, "apps/api");

    const result = await runSync(root);
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(result.code).toBe(0);
    expect(doc.repos[0]?.lockedApplied).toEqual(["reviewer"]);
    expect(result.stdout).toContain("locked: reviewer");
    expect(result.stdout).toContain("do not yet change an emitted file");
    // The pin that actually bites: a workspace declaring `defaults.selection`
    // and `lockedContent` never shows either field in `patched` — only the
    // three fields emission reads (`tools`, `maturityTier`, `mcp`) may appear
    // there, whatever the manifest resolves for selection or locks.
    expect(doc.repos[0]?.patched).not.toContain("selection");
    expect(doc.repos[0]?.patched).not.toContain("lockedContent");
  });
});

describe("propagationPatch — the field set the bridge writes", () => {
  it("never puts selection or lockedApplied in the patch, even when both are populated", () => {
    const manifest = createManifest({
      tools: ["claude"],
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "0.0.0-test",
      maturityTier: "solo",
    });
    const resolved: ResolvedRepoConfig = {
      repoPath: "apps/api",
      tools: ["claude", "codex"],
      selection: { items: { agent: ["reviewer"], skill: [], rule: [], command: [] } },
      maturityTier: "enterprise",
      mcp: { servers: ["filesystem"], protocolVersion: "2024-11-05" },
      lockedApplied: ["reviewer"],
    };

    const { patch, fields } = propagationPatch(manifest, resolved);

    // Exactly the three fields emission reads, whatever ResolvedRepoConfig
    // carries beside them — `selection` and `lockedApplied` never surface as
    // patch keys, because the manifest shape they would land on
    // (`SetupManifest`) has no `lockedContent` field at all and `selection` is
    // deliberately excluded from this function's own field list.
    expect(fields.toSorted()).toEqual(["maturityTier", "mcp", "tools"]);
    expect(Object.keys(patch).toSorted()).toEqual(["maturityTier", "mcp", "tools"]);
    expect(patch).not.toHaveProperty("selection");
    expect(patch).not.toHaveProperty("lockedContent");
  });
});

describe("workspace sync — one member's failure is one row", () => {
  it("fails an unconfigured member by name while its siblings sync, and exits 1 on partial", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/orphan" }, { path: "apps/web" }], {
        defaults: { tools: ["claude", "codex"] },
      }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    const orphan = join(root, "apps/orphan");
    await mkdir(orphan, { recursive: true });
    const web = await seedSyncMember(root, "apps/web", { tools: ["claude"] });

    const result = await runSync(root);
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(result.code).toBe(1);
    expect(doc.outcome).toBe("partial");
    expect(doc.counts).toEqual({ total: 3, succeeded: 2, failed: 1, skipped: 0 });
    const failed = doc.repos[1];
    expect(failed?.state).toBe("failed");
    expect(failed?.error?.code).toBe("VALIDATION_ERROR");
    expect(failed?.error?.message).toContain('"apps/orphan"');
    expect(failed?.error?.message).toContain("stamity init");
    // Never an implicit init: the orphan is exactly as it was.
    expect(await exists(join(orphan, STATE_DIR, MANIFEST_FILE))).toBe(false);
    expect(await exists(join(orphan, "AGENTS.md"))).toBe(false);
    // The outer two are unaffected — isolation is the whole posture.
    expect((await readManifest(api))?.tools).toEqual(["claude", "codex"]);
    expect((await readManifest(web))?.tools).toEqual(["claude", "codex"]);
  });

  it("fails a member whose apply refuses a colliding path, naming it, while the sibling syncs", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/web" }], {
        defaults: { tools: ["claude"] },
      }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    // Foreign content the engine did not write and has no ledger entry for:
    // `applySync` refuses to overwrite it without `--force`, which is exactly
    // the condition `refusedPaths` (workspace.ts:942-950) exists to report.
    await writeFile(join(api, "AGENTS.md"), "hand-written, not the engine's\n", "utf8");
    const web = await seedSyncMember(root, "apps/web", { tools: ["claude"] });

    const result = await runSync(root);
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(result.code).toBe(1);
    expect(doc.outcome).toBe("partial");
    const failed = doc.repos[0];
    expect(failed?.state).toBe("failed");
    expect(failed?.error?.code).toBe("ADAPTER_ERROR");
    expect(failed?.error?.message).toContain("AGENTS.md");
    // The foreign file was never overwritten — a refusal is not a partial apply.
    expect(await readFile(join(api, "AGENTS.md"), "utf8")).toBe("hand-written, not the engine's\n");
    // The sibling with no collision synced clean.
    expect(doc.repos[1]?.state).toBe("synced");
    expect((await readManifest(web))?.tools).toEqual(["claude"]);
  });

  // D4: `--force` on `sync` had zero coverage — the flag could be unwired and
  // the suite would stay green. This is the WITH-force control for the case
  // directly above: the same collision, overwritten behind a verified `.bak`.
  it("overwrites a colliding unmanaged file under --force, behind a verified .bak", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude"] } }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    await writeFile(join(api, "AGENTS.md"), "hand-written, not the engine's\n", "utf8");

    const result = await runSync(root, ["--force"]);
    const doc = singleSyncDocument((await runSync(root, ["--force", "--json"])).stdout);

    expect(result.code).toBe(0);
    expect(doc.outcome).toBe("passed");
    expect(doc.repos[0]?.state).toBe("synced");
    // The engine's generated content landed at the path that collided...
    expect(await readFile(join(api, "AGENTS.md"), "utf8")).not.toBe(
      "hand-written, not the engine's\n",
    );
    // ...and the hand-written original survives, verified, one directory over.
    expect(await readFile(join(api, "AGENTS.md.bak"), "utf8")).toBe(
      "hand-written, not the engine's\n",
    );
  });

  it("surfaces the cascade's own refusal for a member directory that is not there", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/gone" }]),
    );
    await seedSyncMember(root, "apps/api");

    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(doc.outcome).toBe("partial");
    expect(doc.repos[1]?.state).toBe("failed");
    expect(doc.repos[1]?.error?.code).toBe("FS_ERROR");
    expect(doc.repos[1]?.error?.message).toContain("does not exist");
    // A row the bridge never reached reports no patch rather than an empty one.
    expect(doc.repos[1]?.patched).toBeUndefined();
    expect(doc.repos[0]?.state).toBe("synced");
  });

  it("carries the reader's own CONFIG_ERROR for a member manifest that does not parse", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/api" }]));
    const api = join(root, "apps/api");
    await mkdir(join(api, STATE_DIR), { recursive: true });
    await writeFile(join(api, STATE_DIR, MANIFEST_FILE), "{ not json", "utf8");

    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(doc.outcome).toBe("failed");
    expect(doc.repos[0]?.error?.code).toBe("CONFIG_ERROR");
  });

  it("reports `failed` and exits 1 when no attempted member succeeded", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, manifestOf([{ path: "a" }, { path: "b" }]));
    await mkdir(join(root, "a"), { recursive: true });
    await mkdir(join(root, "b"), { recursive: true });

    const result = await runSync(root);
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(result.code).toBe(1);
    expect(doc.outcome).toBe("failed");
    expect(doc.counts.failed).toBe(2);
  });
});

describe("workspace sync — --dry-run and the JSON contract", () => {
  it("writes nothing anywhere and journals nothing", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }, { path: "apps/web" }], {
        defaults: { tools: ["claude", "codex"] },
      }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });
    const web = await seedSyncMember(root, "apps/web", { tools: ["claude"] });
    const before = { api: await manifestBytes(api), web: await manifestBytes(web) };

    const result = await runSync(root, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(await manifestBytes(api)).toBe(before.api);
    expect(await manifestBytes(web)).toBe(before.web);
    // No emission either, and no journal line claiming a run happened — a dry
    // run appending `started` would manufacture the crash signal `status` reads.
    expect(await exists(join(api, ".codex/config.toml"))).toBe(false);
    expect(await exists(join(api, "AGENTS.md"))).toBe(false);
    expect(await exists(join(root, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE))).toBe(false);
    expect(result.stdout).toContain("nothing was written");
  });

  it("names the patch it would apply per member", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }),
    );
    await seedSyncMember(root, "apps/api", { tools: ["claude"] });

    const result = await runSync(root, ["--dry-run"]);
    const doc = singleSyncDocument((await runSync(root, ["--dry-run", "--json"])).stdout);

    expect(result.stdout).toContain("would patch tools");
    expect(doc.dryRun).toBe(true);
    expect(doc.repos[0]?.patched).toEqual(["tools"]);
  });

  it("emits one document carrying the cascade's own outcome, counts and rows", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }),
    );
    await seedSyncMember(root, "apps/api", { tools: ["claude"] });

    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);

    expect(doc.ok).toBe(true);
    expect(doc.root).toBe(root);
    expect(doc.outcome).toBe("passed");
    expect(doc.counts).toEqual({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(doc.repos).toEqual([
      { repoPath: "apps/api", ok: true, state: "synced", patched: ["tools"] },
    ]);
    expect(doc.journalWarnings).toEqual([]);
  });

  it("leaves a journal a later status run can read, and re-runs every member regardless of it", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(temp, manifestOf([{ path: "apps/api" }]));
    const api = await seedSyncMember(root, "apps/api");

    expect((await runSync(root)).code).toBe(0);
    const journal = await readFile(join(root, STATE_DIR, WORKSPACE_SYNC_JOURNAL_FILE), "utf8");
    expect(journal).toContain('"event":"started"');
    expect(journal).toContain('"status":"ok"');

    // A completed run in the journal changes nothing about the next run's set.
    const doc = singleSyncDocument((await runSync(root, ["--json"])).stdout);
    expect(doc.repos.map((row) => row.repoPath)).toEqual(["apps/api"]);
    expect(doc.repos[0]?.state).toBe("synced");
    expect(await exists(join(api, "AGENTS.md"))).toBe(true);
  });
});

describe("REQ-WS-011's persistence capstone — a plain sync inside a cascaded member", () => {
  it("keeps the codex emission and reclaims nothing when `stamity sync` runs directly inside the member", async () => {
    const temp = getTemp();
    await seedCorpus(temp);
    const root = await seedWorkspace(
      temp,
      manifestOf([{ path: "apps/api" }], { defaults: { tools: ["claude", "codex"] } }),
    );
    const api = await seedSyncMember(root, "apps/api", { tools: ["claude"] });

    // The cascade: the workspace writes codex into the member's own manifest
    // and its tree gains the codex emission.
    expect((await runSync(root)).code).toBe(0);
    expect(await exists(join(api, ".codex/config.toml"))).toBe(true);
    const afterCascade = await readManifest(api);
    expect(afterCascade?.tools).toEqual(["claude", "codex"]);
    const codexLedgerBefore = (afterCascade?.ledger ?? []).filter(
      (entry) => entry.adapter === "codex",
    );
    expect(codexLedgerBefore.length).toBeGreaterThan(0);

    // Plain `stamity sync`, run WITH ITS CWD INSIDE THE MEMBER — the single
    // most likely next thing to happen, and REQ-WS-011's whole argument for
    // patching rather than composing: the member's manifest already IS the
    // propagated policy, so this run reads it back exactly as any other sync
    // would and has no workspace context of its own.
    const plain = await runInProcess([syncCommand], ["sync"], { cwd: api });

    expect(plain.code).toBe(0);
    expect(plain.stdout.toLowerCase()).not.toContain("reclaim");
    // The codex emission survives, and the entries that own it are still on
    // the ledger — nothing was swept as unowned.
    expect(await exists(join(api, ".codex/config.toml"))).toBe(true);
    const afterPlain = await readManifest(api);
    expect(afterPlain?.tools).toEqual(["claude", "codex"]);
    const codexLedgerAfter = (afterPlain?.ledger ?? []).filter(
      (entry) => entry.adapter === "codex",
    );
    expect(codexLedgerAfter.length).toBe(codexLedgerBefore.length);
  });
});
