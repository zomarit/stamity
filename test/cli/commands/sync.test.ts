import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE,
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
import type * as PathsApi from "../../../src/shared/paths.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { canonical, npxCommand, registryArgument } from "../../support/identity.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { useTempDir, type TempDirHandle } from "../../support/tempDir.ts";
/**
 * TEST CHANGE, justified (audit FORK-3): every `npx @zomarit/stamity …` literal below
 * became `npxCommand("…")`, which reads the running checkout's own `package.json`.
 * The assertion is unchanged on this tree — the derived string is byte-for-byte the
 * literal it replaced — and a downstream that renamed the package as
 * `docs/enterprise-forks.md` instructs now reads its own remedy instead of failing on
 * a registry name it cannot install. Nothing here proves the production string: that
 * is `test/cli/kit/packageName.test.ts`, against a pseudo package root.
 */

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
// TEST CHANGE, justified: REQ-PLUGIN-045 — the planned-row check now holds
// every planner output to the owned-path bound: a `rule` row directly under
// `.claude/` and an `infra` row at `docs/USER.md` lie outside it and are
// refused before any write. The guide moved into a rule folder, and the
// whole-file output to a platform file the engine writes whole at a name it
// did not mint — the same lanes, the same collisions.
const GUIDE_PATH = ".claude/rules/stamity-guide.md";
const USER_DOC = ".github/hooks/stamity.json";
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
    expect(result.stderr).toContain(npxCommand("init"));
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

// Run 2026-10-11_release-1-14-0, review/58. Before the engine starts git it looks at the setup
// root and the folders above it, and a folder there with the layout of a bare repository is not
// handed to git (`gitDiscoveryMeetsBareShape`, `src/merge/safeWrite.ts`). A sync that wrote files
// there still closed on "next: git diff to review": plain git, typed in the folder the engine had
// just kept from git, opens that folder and takes its configuration. The fixture is the shape the
// look's own cases seed: an empty `HEAD` beside `objects` and `refs`, with no `.git`. No git
// opens it, and none is started.
describe("sync — a folder the look before git refused", () => {
  const SHAPE = { "HEAD": "", "objects/keep": "", "refs/keep": "" };

  async function seedShaped(handle: TempDirHandle, sub: string): Promise<string> {
    const root = await seedRepo(handle, sub);
    await handle.seedFiles(Object.fromEntries(Object.entries(SHAPE).map(([name, body]) => [`${sub}/${name}`, body])));
    return root;
  }

  it("closes on a review step that names no git command, and says why", async () => {
    const handle = tempDir();
    const root = await seedShaped(handle, "repo");
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("synced: 1 created, 0 updated, 0 unchanged, 0 skipped");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE}\n`);
    expect(result.stdout).not.toContain(NEXT_AFTER_WRITE_LINE);
    expect(result.stdout).not.toContain("git diff");
    // Unknown is still not dirty: no warning on stderr either.
    expect(result.stderr).not.toContain("working tree");
  });

  it("keeps the --json document's keys, and its dirty block's, as they are outside such a folder", async () => {
    const handle = tempDir();
    const shapedRoot = await seedShaped(handle, "shaped");
    const plainRoot = await seedRepo(handle, "plain");
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const shaped = await runSync(shapedRoot, ["--json"]);
    const plain = await runSync(plainRoot, ["--json"]);

    expect(shaped.code).toBe(0);
    const shapedDoc = parseSingleDoc(shaped.stdout);
    const plainDoc = parseSingleDoc(plain.stdout);
    expect(Object.keys(shapedDoc).toSorted()).toEqual(Object.keys(plainDoc).toSorted());
    expect(shapedDoc["dirty"]).toEqual({ available: false, dirty: false, changedCount: 0 });
    expect(shapedDoc["dirty"]).toEqual(plainDoc["dirty"]);
  });

  // Run 2026-10-11_release-1-14-0, review/66. The step says to read "the files listed above", and
  // the report lists twenty rows and folds the rest into `… and N more`. Past twenty the step now
  // says so, and says what the tree holds instead. These cases run the real report beside the step,
  // so the number the step counts to and the number the report folds at cannot part unseen: twenty
  // rows fold nothing and keep the step, one more folds one and moves it.
  function guideOutputs(count: number): AdapterOutput[] {
    return Array.from({ length: count }, (_unused, index) =>
      managedOutput(`.claude/rules/stamity-guide-${String(index + 1).padStart(2, "0")}.md`, `guide body ${index + 1}`),
    );
  }

  it("says the list was cut short, and what the tree holds instead, past twenty rows", async () => {
    const handle = tempDir();
    const root = await seedShaped(handle, "repo");
    plannerOutputs.value = guideOutputs(21);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("synced: 21 created, 0 updated, 0 unchanged, 0 skipped");
    expect(result.stdout).toContain("\n  … and 1 more\n");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE} ${listCutShortText(1)}\n`);
    for (const call of ["git diff", "git status", "git log", "git rev-parse", "git init"]) {
      expect(result.stdout, `the run names ${call}`).not.toContain(call);
    }

    // What the added words rest on. The ledger names every file the run wrote, and marks none as
    // changed by it: a row holds a path, its owner and a hash.
    const ledger = (await readManifest(root))?.ledger ?? [];
    const written = plannerOutputs.value.map((output) => output.path);
    expect(ledger.map((row) => row.path).toSorted()).toEqual(written.toSorted());
    expect(Object.keys(ledger[0] ?? {}).toSorted()).toEqual(
      ["adapter", "artifactId", "artifactType", "contentHash", "path", "stampedVersion"],
    );
    // And a `--json` run given now reports the files this run wrote as unchanged.
    const again = parseSingleDoc((await runSync(root, ["--json"])).stdout);
    const rows = again["wrote"] as { path: string; action: string }[];
    expect(rows.map((row) => row.path).toSorted()).toEqual(written.toSorted());
    expect(rows.every((row) => row.action === "unchanged")).toBe(true);
  });

  it("holds every row under `wrote` in the --json document of the run that wrote them", async () => {
    const handle = tempDir();
    const root = await seedShaped(handle, "repo");
    plannerOutputs.value = guideOutputs(21);

    const doc = parseSingleDoc((await runSync(root, ["--json"])).stdout);

    const rows = doc["wrote"] as { path: string; action: string }[];
    expect(rows).toHaveLength(21);
    expect(rows.every((row) => row.action === "created")).toBe(true);
  });

  it("keeps the step as it was at twenty rows, unchanged files not counted", async () => {
    const handle = tempDir();
    const root = await seedShaped(handle, "repo");
    plannerOutputs.value = guideOutputs(1);
    expect((await runSync(root)).code).toBe(0);
    plannerOutputs.value = guideOutputs(21);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("synced: 20 created, 0 updated, 1 unchanged, 0 skipped");
    expect(result.stdout).not.toContain("more\n");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE}\n`);
    expect(result.stdout).not.toContain("cut short");
  });

  it("keeps the step as it was outside such a folder, however long the list", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = guideOutputs(21);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("\n  … and 1 more\n");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_LINE}\n`);
    expect(result.stdout).not.toContain("cut short");
  });
});

/** The words the step adds where the report's list was cut short, whole (review/66). */
function listCutShortText(folded: number): string {
  return (
    `That list was cut short at \`… and ${folded} more\`, and the engine keeps no record of which ` +
    `files those are. The \`ledger\` in ${STATE_DIR}/manifest.json names every file the engine ` +
    "manages, each file this run wrote among them, and does not say which of them changed; " +
    "sync --json prints every row under `wrote`, but only for the run it is given on, and a run " +
    "now reports the files this one wrote as unchanged."
  );
}

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
  it("carries the exact-version npx sync update guidance and the --force flag", async () => {
    const result = await runSync(process.cwd(), ["--help"]);

    expect(result.code).toBe(0);
    // TEST CHANGE, justified (audit FORK-3): the update line names the package that is
    // running, and `sync.ts` composes it from `packageName()`. Derived here from the
    // manifest so a renamed private copy reads its own guidance rather than failing on a
    // registry name it cannot install; the canonical checkout asserts the same bytes.
    // TEST CHANGE (sw26 fix round 2, review/109): a checkout with no npm channel
    // (a registry-less fork) prints the no-fetch line instead; the canonical
    // checkout asserts the same bytes as before.
    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): the channel line named
    // `@latest`; it now names the exact-version pinned form with a placeholder, the
    // spelling the update notice prints. The no-channel line is unchanged.
    // TEST CHANGE, justified: REQ-PLUGIN-048 — a `--registry` fork's checkout names its
    // registry ahead of the spec; the canonical checkout asserts the same bytes as before.
    expect(result.stdout).toContain(
      canonical().npmChannel
        ? ["npx -y", registryArgument(canonical()), `${canonical().name}@<version> sync`].filter(Boolean).join(" ")
        : `then npx --no ${canonical().name} sync`,
    );
    expect(result.stdout).not.toContain("@latest");
    expect(result.stdout).toContain("--force");
  });
});

/**
 * The update line against a pseudo package root (security review/109): a
 * package with no npm channel names no registry fetch, and one with a channel
 * keeps the line byte for byte. Only the kit's own root walk is redirected, as
 * in `test/cli/kit/packageName.test.ts`; the manifest read and the rendering are real.
 */
describe("sync — help text, by npm channel", () => {
  const kitDir = join("src", "cli", "kit");

  async function helpFor(manifest: Record<string, unknown>): Promise<string> {
    const handle = tempDir();
    await handle.seedFiles({ "package.json": `${JSON.stringify(manifest)}\n` });
    vi.resetModules();
    vi.doMock("../../../src/shared/paths.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof PathsApi>();
      return {
        ...actual,
        findPackageRoot: (from: string): string =>
          from.endsWith(kitDir) ? handle.dir : actual.findPackageRoot(from),
      };
    });
    try {
      const fresh = await import("../../../src/cli/commands/sync.ts");
      const result = await runInProcess([fresh.syncCommand], ["sync", "--help"], { cwd: handle.dir });
      expect(result.code).toBe(0);
      return result.stdout;
    } finally {
      vi.doUnmock("../../../src/shared/paths.ts");
      vi.resetModules();
    }
  }

  it("names no registry fetch for a registry-less fork (private, no publishConfig.registry)", async () => {
    const stdout = await helpFor({ name: "@acme/stamity", version: "1.8.0", private: true });

    expect(stdout).toContain(
      "update = install the newer release into this project, then npx --no @acme/stamity sync — " +
        "regenerating from the newest release is the update; no separate update command exists.",
    );
    expect(stdout).not.toContain("@latest");
    expect(stdout).not.toContain("npx @acme/stamity");
  });

  // TEST CHANGE, justified: REQ-PLUGIN-048 — a registry fork names its registry. The it.each
  // is split: the registry-less public fork keeps this case's bare pinned form unedited, and the
  // `publishConfig.registry` manifest it used to share moves to the case below, whose line now
  // carries `--@acme:registry=<url>`.
  it.each([
    { name: "@acme/stamity", version: "1.8.0" },
  ])("names the exact-version pinned sync for a package with a channel (%j)", async (manifest) => {
    const stdout = await helpFor(manifest);

    // TEST CHANGE (sw10-first-run-output, REQ-FLOW-022): the channel line moved
    // from `npx <name>@latest sync` to the pinned exact-version form; what this case
    // pins, the channel line against the no-channel line, is unchanged.
    expect(stdout).toContain(
      "update = npx -y @acme/stamity@<version> sync, with <version> the release to move to — " +
        "regenerating from that release is the update; no separate update command exists.",
    );
    expect(stdout).not.toContain("@latest");
    expect(stdout).not.toContain("npx --no");
    expect(stdout).not.toContain("registry=");
  });

  it("names the fork's registry for its scope in the pinned sync (REQ-PLUGIN-048)", async () => {
    const stdout = await helpFor({
      name: "@acme/stamity",
      version: "1.8.0",
      publishConfig: { registry: "https://npm.pkg.github.com" },
    });

    expect(stdout).toContain(
      "update = npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@<version> sync, " +
        "with <version> the release to move to — " +
        "regenerating from that release is the update; no separate update command exists.",
    );
    expect(stdout).not.toContain("npx -y @acme/stamity@");
    expect(stdout).not.toContain("npx --no");
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

  // review/58: where the working-tree read says the look before git kept the folder from git, the
  // review step names no git command and says how to review without one. Everywhere else, a git
  // that did not answer for another cause included, the step is the line it was.
  it("names no git command in the review next-step where the folder was kept from git", () => {
    const unavailable = { available: false, dirty: false, changedCount: 0 } as const;
    const kept = planFixture({ dirty: { ...unavailable, reason: "bare-layout" } });

    expect(syncClosingLines(kept, reportFixture({ created: 1 }))).toEqual([NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE]);
    expect(syncClosingLines(kept, reportFixture({ updated: 2 }))).toEqual([NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE]);
    // The same two silences as everywhere: nothing written, nothing to review.
    expect(syncClosingLines(kept, reportFixture({ unchanged: 5 }))).toEqual([]);
    expect(syncClosingLines(kept, reportFixture({ created: 1, dryRun: true }))).toEqual([]);

    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toMatch(/^next: /);
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain("stamity check to verify");
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain("git was not started here");
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain(
      "this folder, or a folder above it, has the layout of a bare repository",
    );
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain("do not run git in it or in any folder under it, this one included");
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain("read the files listed above");
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toContain(".bak");
    for (const call of ["git diff", "git status", "git log", "git rev-parse", "git init"]) {
      expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE, `the step names ${call}`).not.toContain(call);
    }

    // A git that did not answer for any other cause keeps the line byte for byte.
    expect(syncClosingLines(planFixture({ dirty: unavailable }), reportFixture({ created: 1 }))).toEqual([
      NEXT_AFTER_WRITE_LINE,
    ]);
    expect(NEXT_AFTER_WRITE_LINE).toBe("next: git diff to review, stamity check to verify");
  });

  // review/66: the report lists twenty rows and folds the rest, so past twenty "the files listed
  // above" are not all of them. There, and only at such a folder, the step says so after the
  // sentence it had. Unchanged rows are not listed and do not count.
  it("says the list was cut short where the report folded rows at such a folder, and nowhere else", () => {
    const unavailable = { available: false, dirty: false, changedCount: 0 } as const;
    const kept = planFixture({ dirty: { ...unavailable, reason: "bare-layout" } });
    const rows = (count: number, action: "created" | "updated" | "skipped" | "unchanged") =>
      Array.from({ length: count }, (_unused, index) => ({ path: `.claude/rules/${action}-${index}.md`, action }));
    const twenty = [...rows(12, "created"), ...rows(7, "updated"), ...rows(1, "skipped"), ...rows(5, "unchanged")];
    const thirtySeven = [...twenty, ...rows(17, "updated")];

    expect(syncClosingLines(kept, reportFixture({ created: 12, updated: 7, wrote: twenty }))).toEqual([
      NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE,
    ]);
    expect(syncClosingLines(kept, reportFixture({ created: 12, updated: 24, wrote: thirtySeven }))).toEqual([
      `${NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE} ${listCutShortText(17)}`,
    ]);
    for (const call of ["git diff", "git status", "git log", "git rev-parse", "git init"]) {
      expect(listCutShortText(17), `the step names ${call}`).not.toContain(call);
    }
    // The step it had is the string it was.
    expect(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE).toBe(
      "next: review without git, stamity check to verify — git was not started here: this folder, or a " +
        "folder above it, has the layout of a bare repository, so do not run git in it or in any folder " +
        "under it, this one included. To review, read the files listed above, and compare a file with " +
        "the .bak a warning above names for it.",
    );

    // Everywhere else the step is the line it was, however long the list.
    expect(syncClosingLines(planFixture(), reportFixture({ created: 12, updated: 24, wrote: thirtySeven }))).toEqual([
      NEXT_AFTER_WRITE_LINE,
    ]);
    expect(
      syncClosingLines(planFixture({ dirty: unavailable }), reportFixture({ created: 12, updated: 24, wrote: thirtySeven })),
    ).toEqual([NEXT_AFTER_WRITE_LINE]);
  });
});
