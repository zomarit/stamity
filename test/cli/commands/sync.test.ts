import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE,
  NEXT_AFTER_WRITE_LINE,
  NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE,
  dirtyTreeWarning,
  syncClosingLines,
  syncCommand,
} from "../../../src/cli/commands/sync.ts";
import { planSync, type SyncApplyReport, type SyncPlan } from "../../../src/cli/commands/sync/engine.ts";
import type * as clientModelsModule from "../../../src/cli/engine/clientModels.ts";
import type * as emissionModule from "../../../src/cli/engine/emission.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { VERSION } from "../../../src/index.ts";
import { createManifest, manifestPath, readManifest, writeManifest } from "../../../src/manifest/manifest.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import type { AdapterOutput, ContentSelection } from "../../../src/types/content.ts";
import type { Tool } from "../../../src/types/core.ts";
import { MANIFEST_FILE, MANIFEST_VERSION, type ModelConfig } from "../../../src/types/manifest.ts";
import type * as PathsApi from "../../../src/shared/paths.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import { resolveAutonomy } from "../../../src/config/autonomy.ts";
import { buildPersonOnlyGuardScript } from "../../../src/hooks/scripts.ts";
import type { AutonomyConfig } from "../../../src/types/manifest.ts";
import { seedGitRepo } from "../../support/repoFixtures.ts";
import { canonical, npxCommand, registryArgument } from "../../support/identity.ts";
import { makeCliFixture } from "../../support/cliHarness.ts";
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

/**
 * The client lister, substituted: the real one starts the account's own client
 * CLI (`cursor-agent models`, `codex debug models`, `copilot help config`),
 * which no test may read and which a CI machine does not have. Each case sets
 * what a client answers; a client with no answer is `absent`, as on a machine
 * without its CLI, so every other case here runs as it did before the probe.
 * The parsers and the process handling behind the real lister are covered by
 * `test/cli/engine/clientModels.test.ts`.
 */
const listerAnswers = vi.hoisted(() => ({
  value: {} as Partial<Record<string, clientModelsModule.ModelListOutcome>>,
  asked: [] as string[],
  /** Set by the one case that runs the real lister against a stand-in program it planted. */
  real: false,
}));
vi.mock("../../../src/cli/engine/clientModels.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof clientModelsModule>();
  return {
    ...actual,
    listClientModels: async (
      ...args: Parameters<typeof actual.listClientModels>
    ): Promise<clientModelsModule.ModelListOutcome> => {
      const [tool] = args;
      listerAnswers.asked.push(tool);
      if (listerAnswers.real) return actual.listClientModels(...args);
      return listerAnswers.value[tool] ?? { kind: "absent" };
    },
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
  listerAnswers.value = {};
  listerAnswers.asked = [];
  listerAnswers.real = false;
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

/** A managed-block output with the bare marker the emitters write, so a re-run
 *  against unchanged content classifies `unchanged` exactly as in production. */
function managedOutput(path: string, body: string): AdapterOutput {
  return {
    path,
    // TEST CHANGE, justified: REQ-FLOW-032 — the emitters write the bare BEGIN
    // marker now and the writer merges to it, so an output stamped with the
    // version, as this helper wrapped it, no longer matches production and is
    // rewritten once on the second run.
    content: wrapInManagedBlock(body, path),
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
    // TEST CHANGE, justified: this read `toContain(NEXT_AFTER_WRITE_LINE)`. The fixture is a
    // folder with no repository, where git does not answer, and the step that names `git diff`
    // is now the step for a folder git answered in ("sync — where git did not answer", below).
    expect(first.stdout).toContain(`${NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE}\n`);
    const onDisk = await readManifest(root);
    expect(onDisk?.updatedAt).not.toBe(T0.toISOString());
    expect(new Date(onDisk?.updatedAt ?? 0).getTime()).toBeGreaterThan(T0.getTime());
    expect(existsSync(join(root, GUIDE_PATH))).toBe(true);

    const second = await runSync(root);

    expect(second.code).toBe(0);
    expect(second.stdout).toContain("synced: 0 created, 0 updated, 1 unchanged, 0 skipped");
    // Nothing changed on disk, so the review next-step would be noise.
    expect(second.stdout).not.toContain(NEXT_AFTER_WRITE_LINE);
    expect(second.stdout).not.toContain("next: review");
  });

  it("a --json re-run that changes nothing reports manifestWritten false and leaves the manifest byte-identical (REQ-FLOW-032)", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const first = parseSingleDoc((await runSync(root, ["--json"])).stdout);
    expect(first["manifestWritten"]).toBe(true);
    const bytes = await readFile(join(root, ".stamity", "manifest.json"), "utf8");

    const second = parseSingleDoc((await runSync(root, ["--json"])).stdout);
    expect(second["manifestWritten"]).toBe(false);
    expect(await readFile(join(root, ".stamity", "manifest.json"), "utf8")).toBe(bytes);
    // The provenance the payload carries is the stamp on disk, not the run's clock.
    expect((second["provenance"] as { updatedAt: string }).updatedAt).toBe((await readManifest(root))?.updatedAt);

    // One emitted file changed: the manifest's ledger hash moves, so it is written and stamped.
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body, revised")];
    const third = parseSingleDoc((await runSync(root, ["--json"])).stdout);
    expect(third["manifestWritten"]).toBe(true);
    expect(await readFile(join(root, ".stamity", "manifest.json"), "utf8")).not.toBe(bytes);
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
    // TEST CHANGE, justified: REQ-FLOW-016 — the ledger also records the .gitignore lines this run appended.
    expect(ledger.map((row) => row.path).toSorted()).toEqual([...written, ".gitignore"].toSorted());
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

  // TEST CHANGE, justified: this case ran in a folder with no repository and held the step to
  // `NEXT_AFTER_WRITE_LINE`, "however long the list". That folder is one git does not answer in,
  // and its step no longer names `git diff` ("sync — where git did not answer", below). What the
  // case is for is the step where the look refused nothing and the list is long, so it now runs
  // where git answers: a repository made for it, which is the one place the line it pins prints.
  it("keeps the step as it was where git answers, however long the list", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    plannerOutputs.value = guideOutputs(21);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("\n  … and 1 more\n");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_LINE}\n`);
    expect(result.stdout).not.toContain("cut short");
  });
});

// A sync that wrote files closed on "next: git diff to review" wherever the look before git
// refused nothing, a folder git did not answer in included: no repository, no git the engine
// found, or a git too slow for the probe. There is no diff from git to read there, and a git
// typed at a prompt is found by the shell's rules, not by the engine's walk
// (`src/shared/programPath.ts`). The step now names no git command wherever git did not answer,
// and points at `check`'s `git-available` row, which says what the engine found. The fixture is a
// folder with no repository; under an empty `PATH` it is also one where the engine finds no git.
describe("sync — where git did not answer", () => {
  function guideOutputs(count: number): AdapterOutput[] {
    return Array.from({ length: count }, (_unused, index) =>
      managedOutput(`.claude/rules/stamity-guide-${String(index + 1).padStart(2, "0")}.md`, `guide body ${index + 1}`),
    );
  }

  it.each([
    { name: "in a folder with no repository", path: undefined },
    { name: "under a PATH with no entry the engine takes git from", path: "" },
  ])("closes on a review step that names no git command, $name", async ({ path }) => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    if (path !== undefined) vi.stubEnv("PATH", path);
    let result: Awaited<ReturnType<typeof runSync>>;
    try {
      result = await runSync(root);
    } finally {
      vi.unstubAllEnvs();
    }

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("synced: 1 created, 0 updated, 0 unchanged, 0 skipped");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE}\n`);
    expect(result.stdout).not.toContain(NEXT_AFTER_WRITE_LINE);
    expect(result.stdout).not.toContain(NEXT_AFTER_WRITE_KEPT_FROM_GIT_LINE);
    for (const call of ["git diff", "git status", "git log", "git rev-parse", "git init", "git --"]) {
      expect(result.stdout, `the run names ${call}`).not.toContain(call);
    }
    // Unknown is still not dirty: no warning on stderr either.
    expect(result.stderr).not.toContain("working tree");
  });

  it("says the list was cut short there too, past twenty rows", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    plannerOutputs.value = guideOutputs(21);

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("\n  … and 1 more\n");
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE} ${listCutShortText(1)}\n`);
    expect(result.stdout).not.toContain("git diff");
  });

  it("keeps the step that names git diff where git answers", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    plannerOutputs.value = [managedOutput(GUIDE_PATH, "guide body")];

    const result = await runSync(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`${NEXT_AFTER_WRITE_LINE}\n`);
    expect(result.stdout).not.toContain("review without git");
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

  // v16-manifest-plugin-block (REQ-PLUGIN-014, REQ-LADDER-005, inbox rows 266 and 279): a manifest
  // a 1.14 setup wrote, generation 1.0.0 and the `plugin` block, read by this engine.
  it("says what a live run would do with a 1.14 manifest, writes nothing, and the live run says it once", async () => {
    const handle = tempDir();
    const root = await seedRepo(handle);
    const path = manifestPath(root);
    const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    const plugin = { mode: "plugin-backed", clients: { claude: { version: "1.14.0", classes: ["skill"] } } };
    await writeFile(path, `${JSON.stringify({ ...current, version: "1.0.0", plugin }, null, 2)}\n`, "utf8");
    const before = await readFile(path, "utf8");

    const dry = await runSync(root, ["--dry-run"]);

    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("manifest schema would be migrated to 2.0.0");
    expect(dry.stdout).not.toContain("manifest schema migrated");
    expect(dry.stdout).toContain("manifest: would drop the `plugin` key a 1.14 setup recorded");
    expect(await readFile(path, "utf8")).toBe(before);

    const live = await runSync(root);

    expect(live.code).toBe(0);
    expect(live.stdout).toContain("manifest schema migrated to 2.0.0");
    expect(live.stdout).toContain("manifest: dropped the `plugin` key a 1.14 setup recorded");
    expect(Object.keys(JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>)).not.toContain("plugin");

    const again = await runSync(root);

    expect(again.code).toBe(0);
    expect(again.stdout).not.toContain("manifest schema");
    expect(again.stdout).not.toContain("plugin");
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
    // TEST CHANGE, justified: this read `toContain(NEXT_AFTER_WRITE_LINE)`. The fixture is a
    // folder with no repository, and the close there no longer names `git diff`.
    expect(forced.stdout).toContain(NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE);
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
    // TEST CHANGE, justified: REQ-FLOW-022 — the line names `upgrade --to <version>` first and
    // the pinned `sync` second, on either branch; both calls are asserted.
    const call = canonical().npmChannel
      ? ["npx -y", registryArgument(canonical()), `${canonical().name}@<version>`].filter(Boolean).join(" ")
      : `npx --no ${canonical().name}`;
    expect(result.stdout).toContain(`${call} upgrade --to <version> — `);
    expect(result.stdout).toContain(`${call} sync regenerates without moving it.`);
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

    // TEST CHANGE, justified: REQ-FLOW-022 — `upgrade --to <version>` is the update now, and
    // the pinned `sync` follows as the regenerate-only form; this branch keeps `npx --no`.
    expect(stdout).toContain(
      "update = install the newer release into this project, then npx --no @acme/stamity upgrade " +
        "--to <version> — runs that release's sync and moves the package.json pin; " +
        "npx --no @acme/stamity sync regenerates without moving it.",
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
    // TEST CHANGE, justified: REQ-FLOW-022 — the channel line names `upgrade --to <version>`
    // first and the pinned `sync` second; the channel against no-channel contrast is unchanged.
    expect(stdout).toContain(
      "update = npx -y @acme/stamity@<version> upgrade --to <version> — runs that release's sync " +
        "and moves the package.json pin; npx -y @acme/stamity@<version> sync regenerates without moving it.",
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

    // TEST CHANGE, justified: REQ-FLOW-022 — both calls of the update line carry the fork's
    // registry word now, `upgrade --to <version>` first and the pinned `sync` second.
    expect(stdout).toContain(
      "update = npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@<version> upgrade " +
        "--to <version> — runs that release's sync and moves the package.json pin; " +
        "npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@<version> sync regenerates without moving it.",
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
    // TEST CHANGE, justified: REQ-FLOW-032 — the report gained a required `manifestWritten`.
    manifestWritten: false,
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

  // Inbox row 266: a dry run writes nothing, so its migration line says what the live run would do.
  it("words the migration line as what a live run would do on a dry run", () => {
    const lines = syncClosingLines(planFixture({ manifestMigrated: true }), reportFixture({ dryRun: true }));

    expect(lines).toEqual([`manifest schema would be migrated to ${MANIFEST_VERSION}`]);
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
  // review step names no git command and says how to review without one. Where git answered, the
  // step is the line it was; a git that did not answer for another cause has the next case's.
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

    // TEST CHANGE, justified: this read "A git that did not answer for any other cause keeps the
    // line byte for byte" and held that plan to `NEXT_AFTER_WRITE_LINE`. Such a plan now gets a
    // step of its own, the next case's; the line that names `git diff` is the one for a plan whose
    // working-tree read answered, and it is the string it was.
    expect(syncClosingLines(planFixture({ dirty: unavailable }), reportFixture({ created: 1 }))).not.toEqual([
      NEXT_AFTER_WRITE_LINE,
    ]);
    expect(syncClosingLines(planFixture(), reportFixture({ created: 1 }))).toEqual([NEXT_AFTER_WRITE_LINE]);
    expect(NEXT_AFTER_WRITE_LINE).toBe("next: git diff to review, stamity check to verify");
  });

  // The step named `git diff` wherever the look refused nothing, a working-tree read that did
  // not answer included. There git gave the engine no answer, so there is no diff from it to
  // read, and a git typed at a prompt is found by the shell's rules. The step for that state
  // names no git command and gives no cause of its own: it points at `check`'s row, which says
  // what the engine found.
  it("names no git command in the review next-step wherever else git did not answer", () => {
    const unanswered = planFixture({ dirty: { available: false, dirty: false, changedCount: 0 } });

    expect(syncClosingLines(unanswered, reportFixture({ created: 1 }))).toEqual([NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE]);
    expect(syncClosingLines(unanswered, reportFixture({ updated: 2 }))).toEqual([NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE]);
    // The same two silences as everywhere: nothing written, nothing to review.
    expect(syncClosingLines(unanswered, reportFixture({ unchanged: 5 }))).toEqual([]);
    expect(syncClosingLines(unanswered, reportFixture({ created: 1, dryRun: true }))).toEqual([]);

    expect(NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE).toBe(
      "next: review without git, stamity check to verify — git did not answer here, and the " +
        "git-available row of stamity check says what the engine found. To review, read the files " +
        "listed above, and compare a file with the .bak a warning above names for it.",
    );
    for (const call of ["git diff", "git status", "git log", "git rev-parse", "git init", "git --"]) {
      expect(NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE, `the step names ${call}`).not.toContain(call);
    }
    // No cause of its own: neither a missing repository nor a missing git.
    expect(NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE).not.toContain("repository");
    expect(NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE).not.toContain("no git");
  });

  // review/66: the report lists twenty rows and folds the rest, so past twenty "the files listed
  // above" are not all of them. Wherever the step says to read that list, at such a folder and
  // wherever else git did not answer, it says so after the sentence it had. Unchanged rows are
  // not listed and do not count.
  it("says the list was cut short where the report folded rows, at such a folder and wherever else git did not answer", () => {
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
    // TEST CHANGE, justified: a plan whose working-tree read did not answer was held to
    // `NEXT_AFTER_WRITE_LINE` here. Its step now says to read the listed files too, so past
    // twenty rows it carries the same added words; at twenty it carries none.
    expect(
      syncClosingLines(planFixture({ dirty: unavailable }), reportFixture({ created: 12, updated: 24, wrote: thirtySeven })),
    ).toEqual([`${NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE} ${listCutShortText(17)}`]);
    expect(
      syncClosingLines(planFixture({ dirty: unavailable }), reportFixture({ created: 12, updated: 7, wrote: twenty })),
    ).toEqual([NEXT_AFTER_WRITE_NO_GIT_ANSWER_LINE]);
  });
});

describe("sync — the client model lists (REQ-LADDER-006)", () => {
  const CURSOR_LIST: clientModelsModule.ModelListOutcome = {
    kind: "listed",
    ids: ["claude-opus-5-5-high", "claude-sonnet-5-5-medium"],
    source: "cursor-agent-models",
  };

  /** A repo selecting `tools`, its manifest carrying `models` when given. */
  async function seedClients(handle: TempDirHandle, tools: Tool[], models?: ModelConfig): Promise<string> {
    __setContentRootForTests(handle.path("corpus"));
    const root = handle.path("repo");
    const manifest = createManifest({ tools, selection: emptySelection(), generatorVersion: VERSION, now: T0 });
    await writeManifest(root, models === undefined ? manifest : { ...manifest, models }, { now: T0 });
    return root;
  }

  /** TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the lists a run keeps, read from the git-ignored cache the manifest no longer carries them in. */
  async function cachedLists(root: string): Promise<unknown> {
    return (JSON.parse(await readFile(join(root, ".stamity", "client-models.json"), "utf8")) as { listed: unknown }).listed;
  }

  /** TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): a list kept by an earlier run, seeded in the cache, where `writeManifest` no longer puts it. */
  async function seedCache(root: string, listed: ModelConfig["listed"]): Promise<void> {
    await mkdir(join(root, ".stamity"), { recursive: true });
    await writeFile(join(root, ".stamity", "client-models.json"), `${JSON.stringify({ listed })}\n`);
  }

  /** The manifest's bytes without the one stamp every live run moves. */
  async function manifestWithoutStamp(root: string): Promise<string> {
    return (await readFile(manifestPath(root), "utf8")).replace(/"updatedAt": "[^"]*"/, '"updatedAt": "-"');
  }

  /** `sync` under an environment with no probe switch set, as an operator's shell has. */
  function runSyncIn(root: string, env: Record<string, string>, argv: readonly string[] = []): ReturnType<typeof runInProcess> {
    return runInProcess([syncCommand], ["sync", ...argv], { cwd: root, env });
  }

  it("keeps what a selected client listed in the cache, and a second sync moves no byte", async () => {
    const root = await seedClients(tempDir(), ["claude", "cursor"]);
    listerAnswers.value = { cursor: CURSOR_LIST };

    const first = await runSyncIn(root, {});

    expect(first.code).toBe(0);
    expect(listerAnswers.asked).toEqual(["cursor"]);
    // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): kept in the cache, and the manifest holds no `listed`.
    expect(await cachedLists(root)).toEqual({
      cursor: { ids: ["claude-opus-5-5-high", "claude-sonnet-5-5-medium"], source: "cursor-agent-models" },
    });
    expect((await readManifest(root))?.models?.listed).toBeUndefined();
    const after = await manifestWithoutStamp(root);

    const second = await runSyncIn(root, {});

    expect(second.code).toBe(0);
    expect(await manifestWithoutStamp(root)).toBe(after);
  });

  it("keeps a client's saved list when it times out, beside a fresh list from another", async () => {
    const saved = { ids: ["claude-opus-5-high"], source: "cursor-agent-models" } as const;
    // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the saved list is seeded in the cache.
    const root = await seedClients(tempDir(), ["cursor", "codex"]);
    await seedCache(root, { cursor: { ...saved, ids: [...saved.ids] } });
    listerAnswers.value = {
      cursor: { kind: "timeout" },
      codex: { kind: "listed", ids: ["gpt-6-sol"], source: "codex-debug-models" },
    };

    expect((await runSyncIn(root, {})).code).toBe(0);

    expect(listerAnswers.asked.toSorted()).toEqual(["codex", "cursor"]);
    // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): read from the cache, clients in sort order.
    expect(await cachedLists(root)).toEqual({
      codex: { ids: ["gpt-6-sol"], source: "codex-debug-models" },
      cursor: { ids: ["claude-opus-5-high"], source: "cursor-agent-models" },
    });
  });

  it("starts no probe under STAMITY_NO_CLIENT_PROBE=1", async () => {
    const root = await seedClients(tempDir(), ["cursor", "codex", "copilot"]);
    listerAnswers.value = { cursor: CURSOR_LIST };

    expect((await runSyncIn(root, { STAMITY_NO_CLIENT_PROBE: "1" })).code).toBe(0);

    expect(listerAnswers.asked).toEqual([]);
    expect((await readManifest(root))?.models).toBeUndefined();
  });

  it("reads the lists under --dry-run and writes nothing", async () => {
    const root = await seedClients(tempDir(), ["cursor"]);
    listerAnswers.value = { cursor: CURSOR_LIST };
    const before = await readFile(manifestPath(root), "utf8");

    const result = await runSyncIn(root, {}, ["--dry-run"]);

    expect(result.code).toBe(0);
    expect(listerAnswers.asked).toEqual(["cursor"]);
    expect(await readFile(manifestPath(root), "utf8")).toBe(before);
  });

  it("plans from the saved lists with a fresh one laid over them, without starting a client", async () => {
    // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): the saved list is seeded in the cache.
    const root = await seedClients(tempDir(), ["cursor", "codex"]);
    await seedCache(root, { codex: { ids: ["gpt-6-sol"], source: "codex-debug-models" } });

    const plan = await planSync(root, VERSION, {
      listedOverlay: { cursor: { ids: ["claude-opus-5-5-high"], source: "cursor-agent-models" } },
    });

    expect(listerAnswers.asked).toEqual([]);
    expect(plan.manifest.models?.listed).toEqual({
      codex: { ids: ["gpt-6-sol"], source: "codex-debug-models" },
      cursor: { ids: ["claude-opus-5-5-high"], source: "cursor-agent-models" },
    });
    // Without an overlay the plan is the saved copy, untouched.
    expect((await planSync(root, VERSION)).manifest.models?.listed).toEqual({
      codex: { ids: ["gpt-6-sol"], source: "codex-debug-models" },
    });
  });

  // REQ-LADDER-009, edge: a 1.15.0 manifest saved the lists under `models.listed`. With the probe
  // off, the next sync moves them to the cache once, and no later write carries the key again.
  it("moves a 1.15.0 manifest's lists to the cache once under STAMITY_NO_CLIENT_PROBE=1, and writes them no more", async () => {
    const root = await seedClients(tempDir(), ["cursor", "codex"]);
    const old = {
      codex: { ids: ["gpt-6-sol", "gpt-5.6-luna"], source: "codex-debug-models" },
      cursor: { ids: ["claude-opus-5-high"], source: "cursor-agent-models" },
    };
    const onDisk = JSON.parse(await readFile(manifestPath(root), "utf8")) as Record<string, unknown>;
    await writeFile(manifestPath(root), `${JSON.stringify({ ...onDisk, models: { listed: old } }, null, 2)}\n`);

    expect((await runSyncIn(root, { STAMITY_NO_CLIENT_PROBE: "1" })).code).toBe(0);

    expect(listerAnswers.asked).toEqual([]);
    expect(await cachedLists(root)).toEqual(old);
    expect(await readFile(manifestPath(root), "utf8")).not.toContain('"listed"');
    expect((await readManifest(root))?.models).toBeUndefined();
    const cache = await readFile(join(root, ".stamity", "client-models.json"), "utf8");

    expect((await runSyncIn(root, { STAMITY_NO_CLIENT_PROBE: "1" })).code).toBe(0);

    expect(await readFile(manifestPath(root), "utf8")).not.toContain('"listed"');
    expect(await readFile(join(root, ".stamity", "client-models.json"), "utf8")).toBe(cache);
  });

  // REQ-LADDER-009, edge: a cache that cannot be written leaves the fresh list in memory for the
  // run, which the plan resolves with, and a warning; the run itself succeeds.
  it("keeps a fresh list for the run and warns when the cache cannot be written", async () => {
    const root = await seedClients(tempDir(), ["codex"]);
    await mkdir(join(root, ".stamity", "client-models.json"), { recursive: true });
    listerAnswers.value = { codex: { kind: "listed", ids: ["gpt-5.6-terra"], source: "codex-debug-models" } };

    const result = await runSyncIn(root, {});

    expect(result.code).toBe(0);
    expect(result.stderr).toContain("warning: the client model lists could not be kept in .stamity/client-models.json");
    expect(result.stderr).toContain("held for this run only");
    expect((await readManifest(root))?.models).toBeUndefined();
    // The plan of the same run reads the fresh list in memory.
    const plan = await planSync(root, VERSION, {
      listedOverlay: { codex: { ids: ["gpt-5.6-terra"], source: "codex-debug-models" } },
    });
    expect(plan.manifest.models?.listed?.codex?.ids).toEqual(["gpt-5.6-terra"]);
    expect(plan.modelListCache).toEqual({ codex: { ids: ["gpt-5.6-terra"], source: "codex-debug-models" } });
  });

  it("keeps the lists in a file git check-ignore reports ignored", async () => {
    const root = await seedClients(tempDir(), ["cursor"]);
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    listerAnswers.value = { cursor: CURSOR_LIST };

    expect((await runSyncIn(root, {})).code).toBe(0);

    expect(existsSync(join(root, ".stamity", "client-models.json"))).toBe(true);
    expect(() => execFileSync("git", ["check-ignore", "--quiet", ".stamity/client-models.json"], { cwd: root })).not.toThrow();
  });
});

/**
 * review/126: run in a workspace member, `sync` keeps the WORKSPACE root out of the lister's
 * reach, as `workspace sync` does, not only the member: a folder another repository of the
 * workspace can write into supplies no client program. The real lister runs here against a
 * stand-in `codex` that leaves a marker when started; the control run before `workspace.json`
 * exists starts it, which is what makes the second answer mean anything. POSIX only: a Windows
 * PATH would need a `.cmd` shim, which the lister does not start.
 */
describe("sync — in a workspace member, the lister keeps the workspace out", () => {
  it.skipIf(process.platform === "win32")("never starts a stand-in codex placed inside the workspace but outside the member", async () => {
    const handle = tempDir();
    __setContentRootForTests(handle.path("corpus"));
    const marker = handle.path("codex-started");
    await handle.seedFiles({
      "ws/tools/bin/codex": `#!/bin/sh\n: > '${marker}'\nprintf '%s' '{"models":[{"slug":"gpt-6-sol"}]}'\n`,
    });
    await chmod(handle.path("ws", "tools", "bin", "codex"), 0o755);
    const member = handle.path("ws", "apps", "api");
    const manifest = createManifest({ tools: ["codex"], selection: emptySelection(), generatorVersion: VERSION, now: T0 });
    await writeManifest(member, manifest, { now: T0 });
    listerAnswers.real = true;
    const env = { PATH: handle.path("ws", "tools", "bin") };

    // Control: with no workspace around the member, the folder lies outside its tree and the program starts.
    expect((await runInProcess([syncCommand], ["sync", "--dry-run"], { cwd: member, env })).code).toBe(0);
    expect(existsSync(marker)).toBe(true);

    await rm(marker);
    await handle.seedFiles({
      "ws/workspace.json": `${JSON.stringify({ version: "1.0.0", defaults: { tools: ["codex"] }, repos: [{ path: "apps/api" }] })}\n`,
    });

    const result = await runInProcess([syncCommand], ["sync"], { cwd: member, env });

    expect(result.code, result.stderr).toBe(0);
    expect(listerAnswers.asked).toEqual(["codex", "codex"]);
    expect(existsSync(marker)).toBe(false);
    expect((await readManifest(member))?.models).toBeUndefined();
  });
});

/**
 * review/90: the child-process harness builds its env fresh, so the test
 * config's switch does not reach a spawned CLI on its own; the harness sets it
 * beside `STAMITY_NO_UPDATE_CHECK`. Proved against a stand-in `codex` OUTSIDE
 * the fixture's tree that leaves a marker when started: a harness `sync`
 * selecting codex leaves none, and the same run with the switch removed does,
 * which is what makes the first answer mean anything. POSIX only: a Windows
 * PATH would need a `.cmd` shim, which the lister does not start.
 */
describe("sync — the child-process harness starts no client program", () => {
  const programDir = useTempDir("stamity-sync-stand-in");

  it.skipIf(process.platform === "win32")("leaves a stand-in codex on PATH unstarted unless the switch is removed", async () => {
    const outside = programDir();
    const marker = outside.path("started");
    await outside.seedFiles({
      "bin/codex": `#!/bin/sh\n: > '${marker}'\nprintf '%s' '{"models":[{"slug":"gpt-6-sol"}]}'\n`,
    });
    await chmod(outside.path("bin", "codex"), 0o755);
    const manifest = createManifest({ tools: ["codex"], selection: emptySelection(), generatorVersion: VERSION, now: T0 });
    const fixture = await makeCliFixture({ seed: { [`${STATE_DIR}/${MANIFEST_FILE}`]: `${JSON.stringify(manifest, null, 2)}\n` } });
    try {
      const path = `${outside.path("bin")}${delimiter}${process.env["PATH"] ?? ""}`;

      const quiet = await fixture.run(["sync"], { env: { PATH: path } });

      expect(quiet.code, quiet.stderr).toBe(0);
      expect(existsSync(marker)).toBe(false);

      const probed = await fixture.run(["sync"], { env: { PATH: path, STAMITY_NO_CLIENT_PROBE: undefined } });

      expect(probed.code, probed.stderr).toBe(0);
      expect(existsSync(marker)).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});

/**
 * The loosen gate (REQ-FLOW-138), through the command: the planned guard copy
 * is the guard builder's own output for the autonomy the case names, at
 * Claude Code's copy path, so the marker the gate compares is the real one.
 */
describe("sync — loosening the autonomy setting needs --loosen", () => {
  const GUARD_COPY = ".claude/hooks/stamity/stamity-person-only-guard.mjs";

  const CODEX_COPY = ".stamity/generated/hooks/codex/stamity-person-only-guard.mjs";

  function guardOutput(autonomy?: AutonomyConfig, path = GUARD_COPY): AdapterOutput {
    const setting = resolveAutonomy(autonomy === undefined ? {} : { autonomy });
    return {
      path,
      content: buildPersonOnlyGuardScript({ tool: "claude", layout: "claude", autonomy: setting }),
      owner: { adapter: "claude", artifactId: "stamity-person-only-guard", artifactType: "infra" },
    };
  }

  /** The manifest on disk, re-written with `autonomy` (or without the key). */
  async function setAutonomy(root: string, autonomy?: AutonomyConfig): Promise<void> {
    const current = await readManifest(root);
    if (current === null) throw new Error("no manifest");
    const { autonomy: _dropped, ...rest } = current;
    await writeManifest(root, autonomy === undefined ? rest : { ...rest, autonomy }, { now: T0 });
  }

  /** A first sync that bakes `autonomy` into the guard copy, recorded in the ledger as the engine's. */
  async function seedBaked(autonomy?: AutonomyConfig): Promise<string> {
    const root = await seedRepo(tempDir());
    await setAutonomy(root, autonomy);
    plannerOutputs.value = [guardOutput(autonomy), managedOutput(GUIDE_PATH, "guide body")];
    const first = await runSync(root);
    expect(first.code, first.stderr).toBe(0);
    return root;
  }

  it("refuses a manifest looser than the baked mode `ask` with AUTONOMY_LOOSENED and writes nothing; --loosen writes", async () => {
    const root = await seedBaked({ mode: "ask" });
    await setAutonomy(root);
    plannerOutputs.value = [guardOutput(), managedOutput(GUIDE_PATH, "a changed guide body")];
    const before = await Promise.all([GUARD_COPY, GUIDE_PATH, `${STATE_DIR}/${MANIFEST_FILE}`].map((rel) => readFile(join(root, rel), "utf8")));

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    const doc = parseSingleDoc(refused.stdout);
    expect(doc["ok"]).toBe(false);
    expect((doc["error"] as { code: string }).code).toBe("AUTONOMY_LOOSENED");
    expect((doc["error"] as { next: string }).next).toContain("sync --loosen");
    const after = await Promise.all([GUARD_COPY, GUIDE_PATH, `${STATE_DIR}/${MANIFEST_FILE}`].map((rel) => readFile(join(root, rel), "utf8")));
    expect(after).toEqual(before);

    const loosened = await runSync(root, ["--loosen"]);

    expect(loosened.code, loosened.stderr).toBe(0);
    expect(await readFile(join(root, GUARD_COPY), "utf8")).toContain('// stamity-autonomy {"mode":"autonomous"');
  });

  it("previews the same refusal under --dry-run", async () => {
    const root = await seedBaked({ mode: "ask" });
    await setAutonomy(root);
    plannerOutputs.value = [guardOutput()];

    const preview = await runSync(root, ["--dry-run", "--json"]);

    expect(preview.code).toBe(1);
    expect((parseSingleDoc(preview.stdout)["error"] as { code: string }).code).toBe("AUTONOMY_LOOSENED");
  });

  it("tightens with no flag: mode `ask` over a baked `autonomous`", async () => {
    const root = await seedBaked();
    await setAutonomy(root, { mode: "ask" });
    plannerOutputs.value = [guardOutput({ mode: "ask" })];

    const tightened = await runSync(root);

    expect(tightened.code, tightened.stderr).toBe(0);
    expect(await readFile(join(root, GUARD_COPY), "utf8")).toContain('// stamity-autonomy {"mode":"ask"');
  });

  it("refuses removing `workflow-dispatch` from the deploying acts", async () => {
    const root = await seedBaked({ deployingActs: ["workflow-dispatch"] });
    await setAutonomy(root);
    plannerOutputs.value = [guardOutput()];

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    expect((parseSingleDoc(refused.stdout)["error"] as { code: string }).code).toBe("AUTONOMY_LOOSENED");
  });

  it("refuses a committed looser manifest once the guard copies are deleted", async ({ skip }) => {
    // TEST CHANGE, justified: REQ-FLOW-138 — with no copy on disk the baseline now reads the copies committed at HEAD (review/56 sign-off), so the copy is baked `ask` and the looser manifest committed beside it; a default copy at HEAD is no stricter.
    const root = await seedBaked({ mode: "ask" });
    await setAutonomy(root);
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    await rm(join(root, GUARD_COPY));
    plannerOutputs.value = [guardOutput()];

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    expect((parseSingleDoc(refused.stdout)["error"] as { code: string }).code).toBe("AUTONOMY_LOOSENED");
    expect(existsSync(join(root, GUARD_COPY))).toBe(false);
  });

  it("refuses a committed manifest that drops the deploying lists once the guard copy is deleted (review/56, review/64)", async ({ skip }) => {
    const root = await seedBaked({ deployingActs: ["workflow-dispatch"], deployingBranches: ["production"] });
    // The manifest drops the lists and is committed with the copy that still names them.
    await setAutonomy(root);
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    await rm(join(root, GUARD_COPY));
    plannerOutputs.value = [guardOutput()];

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    const error = parseSingleDoc(refused.stdout)["error"] as { code: string; why: string };
    expect(error.code).toBe("AUTONOMY_LOOSENED");
    expect(error.why).toContain(`the guard copy \`${GUARD_COPY}\` committed at \`HEAD\``);
    expect(existsSync(join(root, GUARD_COPY))).toBe(false);
  });

  it("refuses a committed client switch that drops the deploying lists, and keeps the stricter copy (review/85, review/86)", async ({ skip }) => {
    const root = await seedBaked({ mode: "ask", deployingBranches: ["production"] });
    // The manifest keeps mode `ask`, drops the list, and is committed; the write now plans another client's copy.
    await setAutonomy(root, { mode: "ask" });
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    const stricter = await readFile(join(root, GUARD_COPY), "utf8");
    plannerOutputs.value = [guardOutput({ mode: "ask" }, CODEX_COPY)];

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    const error = parseSingleDoc(refused.stdout)["error"] as { code: string; why: string };
    expect(error.code).toBe("AUTONOMY_LOOSENED");
    expect(error.why).toContain(`the guard copy \`${GUARD_COPY}\` on disk`);
    expect(await readFile(join(root, GUARD_COPY), "utf8")).toBe(stricter);
    expect(existsSync(join(root, CODEX_COPY))).toBe(false);
  });

  it("passes a switch from a committed claude-only default setup to another client (review/86)", async ({ skip }) => {
    const root = await seedBaked();
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    plannerOutputs.value = [guardOutput(undefined, CODEX_COPY)];

    const switched = await runSync(root);

    expect(switched.code, switched.stderr).toBe(0);
    expect(await readFile(join(root, CODEX_COPY), "utf8")).toContain('// stamity-autonomy {"mode":"autonomous"');
  });

  it("refuses a looser sync over a planted copy that a forged ledger row vouches for, with nothing committed (review/88)", async ({ skip }) => {
    const root = await seedBaked({ mode: "ask" });
    // A repository that does not commit its copies: the looser manifest is committed, the copy is not.
    await setAutonomy(root);
    await rm(join(root, GUARD_COPY));
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    // A default-reading guard text at another client's path, and a ledger row for its bytes in the manifest on disk.
    const planted = guardOutput(undefined, CODEX_COPY).content;
    await mkdir(join(root, ".stamity/generated/hooks/codex"), { recursive: true });
    await writeFile(join(root, CODEX_COPY), planted, "utf8");
    const current = await readManifest(root);
    if (current === null) throw new Error("no manifest");
    const forged = {
      path: CODEX_COPY,
      adapter: "codex" as const,
      artifactId: "stamity-person-only-guard",
      artifactType: "infra" as const,
      contentHash: createHash("sha256").update(planted).digest("hex"),
    };
    await writeManifest(root, { ...current, ledger: [...current.ledger, forged] }, { now: T0 });
    plannerOutputs.value = [guardOutput()];

    const refused = await runSync(root, ["--json"]);

    expect(refused.code).toBe(1);
    const error = parseSingleDoc(refused.stdout)["error"] as { code: string; why: string };
    expect(error.code).toBe("AUTONOMY_LOOSENED");
    expect(error.why).toContain("no guard copy found");
    expect(existsSync(join(root, GUARD_COPY))).toBe(false);
  });

  it("names on stderr each guard copy a --loosen run loosened, and what it dropped (review/67)", async () => {
    const root = await seedBaked({ mode: "ask", deployingBranches: ["production"] });
    await setAutonomy(root);
    plannerOutputs.value = [guardOutput()];

    const loosened = await runSync(root, ["--loosen"]);

    expect(loosened.code, loosened.stderr).toBe(0);
    expect(loosened.stderr).toContain(
      `loosened \`${GUARD_COPY}\` with --loosen: mode \`ask\` → \`autonomous\`; \`pr-ready\` now runs unasked; \`tag\` now runs unasked; the deploying branch "production" is no longer named`,
    );
  });

  it("gates nothing when the guard copy's marker stays as it is, even with HEAD stricter", async ({ skip }) => {
    const root = await seedBaked({ mode: "ask" });
    try {
      await seedGitRepo(root);
    } catch (error) {
      if (error instanceof Error && error.name === "GitUnavailableError") skip();
      throw error;
    }
    await setAutonomy(root);
    plannerOutputs.value = [guardOutput()];
    expect((await runSync(root, ["--loosen"])).code).toBe(0);
    plannerOutputs.value = [guardOutput(), managedOutput(GUIDE_PATH, "a later guide body")];

    const again = await runSync(root);

    expect(again.code, again.stderr).toBe(0);
  });

  it("names --loosen in its help", async () => {
    const help = await runSync(tempDir().path("anywhere"), ["--help"]);
    expect(help.stdout).toContain("--loosen");
  });
});
