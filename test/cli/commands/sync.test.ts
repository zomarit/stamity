import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_AFTER_WRITE_LINE,
  dirtyTreeWarning,
  syncClosingLines,
  syncCommand,
} from "../../../src/cli/commands/sync.ts";
import type { SyncApplyReport, SyncPlan } from "../../../src/cli/commands/sync/engine.ts";
import type * as emissionModule from "../../../src/cli/engine/emission.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { VERSION } from "../../../src/index.ts";
import { createManifest, manifestPath, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import type { AdapterOutput, ContentSelection } from "../../../src/types/content.ts";
import { MANIFEST_VERSION } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";

/**
 * Command-layer suite for `stamity sync`, run through the in-process CLI funnel
 * so every assertion covers the UX seams the wrapper owns: exit codes 0/1, the
 * single JSON envelope, the stderr dirty-tree warning, spinner gating, and the
 * help text.
 *
 * The shipped emission planner is the no-op, so the wrapper's write-bearing
 * paths (create/unchanged runs, collisions, --force) are unreachable through
 * the real module. The mock below swaps the planner at `getEmissionPlanner` —
 * the module's documented "single dispatch point the adapter phase swaps" —
 * which is the same seam the engine suite substitutes via synthetic plan
 * objects; everything downstream of the planner runs real.
 */
const plannerOutputs = vi.hoisted(() => ({ value: [] as AdapterOutput[] }));
/** The planner's findings channel. `planSync` reads `planWithWarnings`, so a
 *  mock defining `plan` alone would not answer the call the engine makes. */
const plannerWarnings = vi.hoisted(() => ({ value: [] as string[] }));
vi.mock("../../../src/cli/engine/emission.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof emissionModule>();
  return {
    ...actual,
    // Keeps the shipped planner id, so zero-output tests exercise the exact
    // empty-corpus honesty path production users see today.
    getEmissionPlanner: () => ({
      id: "noop",
      plan: async () => structuredClone(plannerOutputs.value),
      planWithWarnings: async () => ({
        outputs: structuredClone(plannerOutputs.value),
        warnings: structuredClone(plannerWarnings.value),
      }),
    }),
  };
});

const tempDir = useTempDir("stamity-sync-cmd");

const T0 = new Date("2026-01-01T00:00:00.000Z");
const GUIDE_PATH = ".claude/stamity-guide.md";
const USER_DOC = "docs/USER.md";
const USER_BYTES = "my notes\n";
const HONESTY_LINE = "no generated outputs in this build yet";

beforeEach(() => {
  plannerOutputs.value = [];
  plannerWarnings.value = [];
});

afterEach(() => {
  __resetContentRootCacheForTests();
});

function emptySelection(): ContentSelection {
  return { items: { agent: [], skill: [], rule: [], command: [] } };
}

/** Seeds a valid manifest under `<handle>/<sub>` and pins the bundled-content
 *  root to `<handle>/corpus` (absent — the legitimate empty-corpus state). */
async function seedRepo(handle: TempDirHandle, sub = "repo"): Promise<string> {
  __setContentRootForTests(handle.path("corpus"));
  const root = handle.path(sub);
  const manifest = createManifest({
    tools: ["claude"],
    selection: emptySelection(),
    generatorVersion: VERSION,
    now: T0,
  });
  await writeManifest(root, manifest, { now: T0 });
  return root;
}

/** A managed-block output stamped with the live engine version, so a re-run
 *  against unchanged content classifies `unchanged` exactly as in production. */
function managedOutput(path: string, body: string): AdapterOutput {
  return {
    path,
    content: wrapInManagedBlock(body, path, VERSION),
    owner: { adapter: "claude", artifactId: "guide", artifactType: "rule" },
  };
}

/** A whole-file output (no managed block): collides with existing user bytes. */
function wholeFileOutput(path: string, content: string): AdapterOutput {
  return { path, content, owner: { adapter: "claude", artifactId: "user-doc", artifactType: "infra" } };
}

function runSync(
  root: string,
  argv: readonly string[] = [],
  opts?: { tty?: { stdout?: boolean; stdin?: boolean } },
): ReturnType<typeof runInProcess> {
  return runInProcess([syncCommand], ["sync", ...argv], {
    cwd: root,
    ...(opts?.tty !== undefined ? { tty: opts.tty } : {}),
  });
}

function parseSingleDoc(stdout: string): Record<string, unknown> {
  const lines = stdout.split("\n").filter((line) => line !== "");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0] ?? "") as Record<string, unknown>;
}

/** ISO timestamps normalized, so two runs of the same shape compare equal. */
function maskTimestamps(text: string): string {
  return text.replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, "<ts>");
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("sync — initialised repo", () => {
  it("exits 0, bumps the manifest, renders the report, and a second run is all-unchanged", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const first = await runSync(root);

    expect(first.code).toBe(0);
    expect(first.stdout).toContain("synced: 1 created, 0 updated, 0 unchanged, 0 skipped");
    expect(first.stdout).toContain(GUIDE_PATH);
    expect(first.stdout).toContain("provenance");
    expect(first.stdout).toContain(NEXT_AFTER_WRITE_LINE);
    const onDisk = await readManifest(root);
    expect(onDisk?.updatedAt).not.toBe(T0.toISOString());
    expect(new Date(onDisk?.updatedAt ?? 0).getTime()).toBeGreaterThan(T0.getTime());
    expect(existsSync(join(root, GUIDE_PATH))).toBe(true);

    const second = await runSync(root);

    expect(second.code).toBe(0);
    expect(second.stdout).toContain("synced: 0 created, 0 updated, 1 unchanged, 0 skipped");
    // Nothing changed on disk, so the review next-step would be noise.
    expect(second.stdout).not.toContain(NEXT_AFTER_WRITE_LINE);
  });
});

describe("sync — planner findings reach the operator", () => {
  /**
   * The findings channel at the command seam. These are PLANNING findings with no output row
   * of their own — a hook rejected at parse time emits nothing, which is the
   * defect — so they can only arrive through `SyncPlan.warnings`. The
   * substituted planner supplies the channel here; `./syncEngine.test.ts`
   * proves the same lines against the real composed planner over a genuinely
   * malformed hook file on disk.
   */
  const REJECTED = "user hook .stamity/hooks/broken.json [INVALID_JSON]: not valid JSON";

  it("prints them on an applied run, on a dry run, and carries them in the JSON payload", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];
    plannerWarnings.value = [REJECTED];

    const dry = await runSync(root, ["--dry-run"]);
    expect(dry.code).toBe(0);
    // A preview that hid a rejected hook would hide it at the one moment the
    // operator is still deciding whether to apply.
    expect(dry.stdout).toContain(`warning: ${REJECTED}`);

    const applied = await runSync(root);
    expect(applied.code).toBe(0);
    expect(applied.stdout).toContain(`warning: ${REJECTED}`);

    const json = await runSync(root, ["--json"]);
    expect(parseSingleDoc(json.stdout)["warnings"]).toEqual([REJECTED]);
  });

  it("prints nothing when the plan found nothing", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const result = await runSync(root);

    expect(result.stdout).not.toContain("warning:");
  });
});

describe("sync — uninitialised repo", () => {
  it("exits 1 and points at npx @zomarit/stamity init", async () => {
    const handle = tempDir();
    __setContentRootForTests(handle.path("corpus"));

    const result = await runSync(handle.dir);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("npx @zomarit/stamity init");
  });
});

describe("sync — dirty working tree", () => {
  it("warns on stderr and still succeeds", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    await handle.seedFiles({ "repo/note.md": "uncommitted\n" });

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("uncommitted change(s)");
    expect(result.stderr).toContain("commit first");
    // Warning only, never a gate: the run proceeded to the manifest refresh.
    expect((await readManifest(root))?.updatedAt).not.toBe(T0.toISOString());
  });

  it("emits no warning when git cannot answer at all (unknown is not dirty)", async () => {
    const handle = tempDir();
    // No `git init`: `git status` fails here, so the status reads
    // {available: false} — the same branch a missing git binary takes.
    const root = await seedRepo(handle);
    await handle.seedFiles({ "repo/note.md": "uncommitted\n" });

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("working tree");
  });
});

describe("sync --dry-run", () => {
  it("exits 0 on a would-collision plan, marks it 'would refuse', and writes nothing", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    await handle.seedFiles({ [`repo/${USER_DOC}`]: USER_BYTES });
    plannerOutputs.value = [wholeFileOutput(USER_DOC, "generated whole-file\n")];
    const manifestBytesBefore = await readFile(manifestPath(root), "utf8");

    const result = await runSync(root, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("plan: 0 create, 0 update, 0 unchanged, 1 collision");
    expect(result.stdout).toContain("would refuse");
    expect(await readFile(join(root, USER_DOC), "utf8")).toBe(USER_BYTES);
    expect(existsSync(join(root, `${USER_DOC}.bak`))).toBe(false);
    expect(await readFile(manifestPath(root), "utf8")).toBe(manifestBytesBefore);
  });
});

describe("sync — collision refusal and --force", () => {
  it("refuses without --force naming the path and the flag; --force overwrites behind a .bak", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    await handle.seedFiles({ [`repo/${USER_DOC}`]: USER_BYTES });
    plannerOutputs.value = [wholeFileOutput(USER_DOC, "generated whole-file\n")];

    const refused = await runSync(root);

    // TEST CHANGE, justified: the refusal is per PATH now, so it is
    // reported on stdout beside the writes that DID land rather than thrown as
    // a whole-run error on stderr. Exit 1 is unchanged — that is what keeps a
    // CI probe failing — and the two things the operator needs are still
    // asserted: the path is named and the flag that clears it is named.
    expect(refused.code).toBe(1);
    expect(refused.stdout).toContain(USER_DOC);
    expect(refused.stdout).toContain("--force");
    expect(refused.stdout).toContain("were NOT written");
    expect(await readFile(join(root, USER_DOC), "utf8")).toBe(USER_BYTES);

    const forced = await runSync(root, ["--force"]);

    expect(forced.code).toBe(0);
    expect(await readFile(join(root, USER_DOC), "utf8")).toBe("generated whole-file\n");
    expect(await readFile(join(root, `${USER_DOC}.bak`), "utf8")).toBe(USER_BYTES);
    // Collisions resolved → the continuous-onboarding close.
    expect(forced.stdout).toContain(NEXT_AFTER_WRITE_LINE);
  });
});

describe("sync --json", () => {
  it("emits exactly one envelope whose counts match a parallel human-mode run", async () => {
    const handle = tempDir();
    const humanRoot = await seedRepo(handle, "human");
    const jsonRoot = await seedRepo(handle, "machine");
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const human = await runSync(humanRoot);
    const machine = await runSync(jsonRoot, ["--json"]);

    expect(human.code).toBe(0);
    expect(machine.code).toBe(0);
    const humanCounts = /synced: (\d+) created, (\d+) updated, (\d+) unchanged, (\d+) skipped/.exec(
      human.stdout,
    );
    expect(humanCounts).not.toBeNull();

    const doc = parseSingleDoc(machine.stdout);
    expect(doc["ok"]).toBe(true);
    expect(doc["command"]).toBe("sync");
    expect(doc["dryRun"]).toBe(false);
    const counts = doc["counts"] as Record<string, number>;
    expect(counts["created"]).toBe(Number(humanCounts?.[1]));
    expect(counts["updated"]).toBe(Number(humanCounts?.[2]));
    expect(counts["unchanged"]).toBe(Number(humanCounts?.[3]));
    expect(counts["skipped"]).toBe(Number(humanCounts?.[4]));
  });
});

describe("sync — help text", () => {
  it("carries the npx @zomarit/stamity@latest sync update guidance and the --force flag", async () => {
    const result = await runSync(process.cwd(), ["--help"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("npx @zomarit/stamity@latest sync");
    expect(result.stdout).toContain("--force");
  });
});

describe("sync — spinner gating", () => {
  it("prints no spinner frames when piped: the text lands once as a plain line", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("\r");
    expect(countOccurrences(result.stdout, "syncing…")).toBe(1);
  });

  it("renders frames only on a TTY", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);

    const result = await runSync(root, [], { tty: { stdout: true } });

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("\r");
    expect(result.stdout).toContain("syncing…");
  });

  it("prints nothing but the envelope in --json mode", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);

    const result = await runSync(root, ["--json"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("\r");
    expect(result.stdout).not.toContain("syncing");
    expect(parseSingleDoc(result.stdout)["ok"]).toBe(true);
  });
});

describe("sync — empty-corpus honesty", () => {
  it("prints the honesty line exactly once (the report owns it; the command adds no duplicate)", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(countOccurrences(result.stdout, HONESTY_LINE)).toBe(1);
    expect(result.stdout).not.toContain("synced:");
    // Nothing was written, so no review next-step either.
    expect(result.stdout).not.toContain(NEXT_AFTER_WRITE_LINE);
  });
});

describe("sync — newer manifest schema", () => {
  it("passes the engine's CONFIG_ERROR upgrade guidance through as exit 1", async () => {
    const handle = tempDir();
    __setContentRootForTests(handle.path("corpus"));
    await handle.seedFiles({
      [`repo/${STATE_DIR}/manifest.json`]: '{\n  "version": "99.0.0"\n}\n',
    });

    const result = await runSync(handle.path("repo"));

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Upgrade to a release");
  });

  it("codes the failure CONFIG_ERROR in the JSON error document", async () => {
    const handle = tempDir();
    __setContentRootForTests(handle.path("corpus"));
    await handle.seedFiles({
      [`repo/${STATE_DIR}/manifest.json`]: '{\n  "version": "99.0.0"\n}\n',
    });

    const result = await runSync(handle.path("repo"), ["--json"]);

    expect(result.code).toBe(1);
    const doc = parseSingleDoc(result.stdout);
    expect(doc["ok"]).toBe(false);
    expect((doc["error"] as { code: string }).code).toBe("CONFIG_ERROR");
  });
});

describe("sync -y", () => {
  it("is accepted and inert: identical output modulo timestamps", async () => {
    const handle = tempDir();
    const plainRoot = await seedRepo(handle, "plain");
    const yesRoot = await seedRepo(handle, "yes");
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const plain = await runSync(plainRoot);
    const withYes = await runSync(yesRoot, ["-y"]);

    expect(plain.code).toBe(0);
    expect(withYes.code).toBe(0);
    expect(maskTimestamps(withYes.stdout)).toBe(maskTimestamps(plain.stdout));
    expect(withYes.stderr).toBe(plain.stderr);
  });
});

describe("dirtyTreeWarning", () => {
  it("is null when git could not answer — unknown is not dirty", () => {
    expect(dirtyTreeWarning({ available: false, dirty: false, changedCount: 0 })).toBeNull();
  });

  it("is null for a clean tree", () => {
    expect(dirtyTreeWarning({ available: true, dirty: false, changedCount: 0 })).toBeNull();
  });

  it("names the change count and the git-revert restore path when dirty", () => {
    const line = dirtyTreeWarning({ available: true, dirty: true, changedCount: 3 });

    expect(line).toContain("3 uncommitted change(s)");
    expect(line).toContain("git-revert");
  });
});

function planFixture(overrides: Partial<SyncPlan> = {}): SyncPlan {
  return {
    manifest: createManifest({
      tools: ["claude"],
      selection: emptySelection(),
      generatorVersion: VERSION,
      now: T0,
    }),
    entries: [],
    collisions: [],
    reclaim: [],
    dirty: { available: true, dirty: false, changedCount: 0 },
    manifestMigrated: false,
    plannerId: "noop",
    outputs: [],
    warnings: [],
    ...overrides,
  };
}

function reportFixture(overrides: Partial<SyncApplyReport> = {}): SyncApplyReport {
  return {
    wrote: [],
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    refused: [],
    reclaimed: null,
    manifestPath: "unused/manifest.json",
    dryRun: false,
    manifest: null,
    ...overrides,
  };
}

describe("syncClosingLines", () => {
  it("surfaces the migration line when the reader migrated the manifest schema", () => {
    // The migration registry is empty at generation 1, so a migrated=true plan
    // cannot be produced through the funnel yet — the line is pinned here at
    // the unit level against the future first migration.
    const lines = syncClosingLines(planFixture({ manifestMigrated: true }), reportFixture());

    expect(lines).toEqual([`manifest schema migrated to ${MANIFEST_VERSION}`]);
  });

  it("adds the review next-step only when a live run changed files", () => {
    expect(syncClosingLines(planFixture(), reportFixture({ created: 1 }))).toEqual([
      NEXT_AFTER_WRITE_LINE,
    ]);
    expect(syncClosingLines(planFixture(), reportFixture({ updated: 2 }))).toEqual([
      NEXT_AFTER_WRITE_LINE,
    ]);
    // All-unchanged: nothing to review.
    expect(syncClosingLines(planFixture(), reportFixture({ unchanged: 5 }))).toEqual([]);
    // Dry run: nothing was written, whatever the plan tallies say.
    expect(syncClosingLines(planFixture(), reportFixture({ created: 1, dryRun: true }))).toEqual([]);
  });
});
