import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { delimiter, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkClaudeHookShell,
  checkCloudInstall,
  checkCommand,
  checkModelPins,
  checkNodeVersion,
  evaluateExpectations,
  resolveCharterGates,
  runDoctor,
  runDriftGate,
  type DoctorCheck,
  type ModelLister,
} from "../../../src/cli/commands/check.ts";
import type { ModelListOutcome } from "../../../src/cli/engine/clientModels.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { AGENTS_MD_FILE } from "../../../src/emit/agentsMd.ts";
import { createApp, createEngine } from "../../../src/index.ts";
import { applyPackInstall, planPackInstall } from "../../../src/pack/install.ts";
import { receiptRelPath } from "../../../src/pack/receipt.ts";
import {
  createManifest,
  manifestPath,
  readManifest,
  writeManifest,
} from "../../../src/manifest/manifest.ts";
import { OWNED_PATHS } from "../../../src/manifest/ownedPaths.ts";
import { wrapInManagedBlock } from "../../../src/merge/managedBlocks.ts";
import { pinsFor, resolveModelValue } from "../../../src/roster/modelLadder.ts";
import type { Tool } from "../../../src/types/core.ts";
import { EngineError } from "../../../src/types/errors.ts";
import {
  packOwner,
  type GatesConfig,
  type LedgerEntry,
  type SetupManifest,
} from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import type * as PathsApi from "../../../src/shared/paths.ts";
import type * as ChildProcessApi from "node:child_process";
import { canonical, npxCommand, npxCommandOf } from "../../support/identity.ts";
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
 * Real-filesystem lane: check's whole subject is what is on disk — a manifest,
 * state directories, ledgered files that may or may not still exist, temp-file
 * litter — and every gate it drives reads the filesystem directly, with no fs
 * seam a virtual volume could occupy.
 *
 * Two fixture rules make the assertions mean something:
 *
 * - the bundled content root is pinned at `<repo>/corpus` and seeded with a
 *   minimal charter. It was pinned ABSENT while the emission planner was the
 *   no-op; with emission live, check's drift gate runs `planSync`, and core
 *   emission refuses an absent charter outright (`src/content/charter.ts`), so
 *   an absent corpus now models a broken install rather than a clean repo. The
 *   corpus stays minimal so an empty ledger still reads "clean", never drift;
 * - each fixture carries exactly the one defect its test names, so a doctor row
 *   or an exit code is a statement about check's logic rather than about how
 *   much a fixture happened to trip.
 */

const getRepo = useTempDir("stamity-check");

afterEach(() => {
  __resetContentRootCacheForTests();
});

const T0 = new Date("2026-01-01T00:00:00.000Z");

/** Minimal viable corpus: the charter is the only artifact core emission requires. */
const CHARTER_FIXTURE = [
  "---",
  "id: charter",
  "type: charter",
  "description: fixture charter",
  "tags: [orchestration]",
  "load: always",
  "obsolete_when: fixture trigger",
  // The doctor's `invariants` row reads these three off the installed corpus,
  // which the content-root seam points at this fixture. Deliberately NOT the
  // shipped charter's values: a row that repeated the real version would pass
  // against a hard-coded string as readily as against a real read.
  "invariants_version: 4.5.6",
  "invariants_ratified: 2026-02-03",
  "invariants_amended: 2026-04-05",
  "---",
  "",
  "# Test Charter",
  "",
  "Charter guidance body.",
  "",
].join("\n");

/**
 * A minimal corpus agent, so a native `.claude/agents/stamity-reviewer.md` has
 * an emitted id to collide with. The duplicate probe asks the catalog what ids
 * a plugin built from this corpus would carry, and a corpus with no agent in it
 * would make the unmanaged case pass vacuously.
 */
/** One corpus skill — a directory artifact, so it projects into `.agents/skills/st-verify/`. */
const SKILL_FIXTURE = [
  "---",
  "id: verify",
  "type: skill",
  "description: fixture skill",
  "tags: [orchestration]",
  "load: on-demand",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Verify",
  "",
  "Skill body.",
  "",
].join("\n");

/** One corpus command, emitted as `st-work` — the `cmd-` id renders with the `st-` prefix. */
const COMMAND_FIXTURE = [
  "---",
  "id: cmd-work",
  "type: command",
  "description: fixture command",
  "tags: [orchestration]",
  "load: on-demand",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Work",
  "",
  "Command body.",
  "",
].join("\n");

const AGENT_FIXTURE = [
  "---",
  "id: reviewer",
  "type: agent",
  "description: fixture agent",
  "tags: [review]",
  "load: on-demand",
  "obsolete_when: fixture trigger",
  "---",
  "",
  "# Reviewer",
  "",
  "Review guidance body.",
  "",
].join("\n");

/** The same fixture with no version at all — a template that predates versioning. */
const UNVERSIONED_CHARTER_FIXTURE = CHARTER_FIXTURE.split("\n")
  .filter((line) => !line.startsWith("invariants_"))
  .join("\n");

interface DriftDoc {
  clean: boolean;
  changes: { path: string; action: string }[];
  missing: string[];
  reclaimPending: number;
  reclaim: { path: string; reason: string; action: string; proof?: string; why?: string }[];
}

interface ProvenanceDoc {
  generatedBy: string;
  updatedAt: string;
  manifestVersion: string;
  perAdapter: { adapter: string; files: number; stampedVersion: string | null }[];
  packs: { packId: string; files: number }[];
}

interface Envelope {
  ok: boolean;
  command: string;
  version: string;
  doctor: DoctorCheck[];
  drift: DriftDoc | null;
  driftStatus: "evaluated" | "no-manifest" | "failed";
  provenance: ProvenanceDoc | null;
  /** Absent when there is no readable manifest to read the charter's gates from. */
  gates?: { notRun: string[]; unresolved: string[] };
  /** The owned-path bound, on every run (REQ-PLUGIN-045). */
  ownedPaths?: unknown;
  error?: unknown;
}

interface SeedOptions {
  tools?: Tool[];
  ledger?: LedgerEntry[];
  /** Manifest schema version override, for the generation-tolerance case. */
  version?: string;
  /** Engine version stamped as `generatedBy`. */
  generatedBy?: string;
  mcpServers?: string[];
  /** `false` leaves `.stamity/learnings` and `.stamity/handoffs` absent. */
  stateDirs?: boolean;
  files?: Record<string, string>;
  /**
   * A `plugin` block written into the manifest file after the fixture sync, as a 1.14
   * `stamity plugin setup` persisted it: the writer refuses the key, and the reader drops it.
   */
  plugin?: unknown;
  /**
   * Files seeded BEFORE the fixture sync. Sync re-detects the repository and persists what it
   * found as the manifest's `detected` block, so this is how a fixture chooses what detection
   * records; `files` lands after the sync and is never read by it.
   */
  repoFiles?: Record<string, string>;
  /** The manifest's `gates` pins, as `config set gates.<key>` persists them. */
  gates?: GatesConfig;
}

/**
 * A setup whose Claude agents are deselected while their bytes are still the
 * running engine's rendering: the agents `ids` name join the fixture corpus, a
 * sync for claude and cursor writes each as Claude's
 * `.claude/agents/stamity-<id>.md` and records it, a sync for cursor alone
 * reclaims the claude rows, and those agents' files and rows are put back. The
 * proof plan renders every client a ledger row names, so each one previews as a
 * `deselected` delete with a `hash` proof, and it is the only candidate.
 *
 * TEST CHANGE, justified (2026-10-08, row 560, unit d1a-rendering-proof-core):
 * an engine-named file in a content folder is now deleted only when its bytes
 * are a rendering the running engine produces at the path; a made-up agent no
 * corpus renders is kept as a retired artifact. The reclaim-preview cases whose
 * subject is a deselected engine file's delete seed it this way, so the preview
 * still names the delete, the reason and the proof they assert.
 *
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): this
 * helper recorded a `plugin-backed` block carrying Claude's agents; 1.15.0
 * deleted that mode, so the deselection is a client the setup no longer
 * targets, the common reason a content file becomes a candidate.
 */
async function seedDeselectedAgents(ids: readonly string[]): Promise<string> {
  const handle = getRepo();
  await handle.seedFiles(
    Object.fromEntries(ids.map((id) => [`corpus/agents/stamity-${id}.md`, AGENT_FIXTURE.replace("id: reviewer", `id: ${id}`)])),
  );
  const root = await seedRepo(handle, { tools: ["claude", "cursor"] });
  const paths = new Set(ids.map((id) => `.claude/agents/stamity-${id}.md`));
  const both = await readManifest(root);
  const kept = (both?.ledger ?? []).filter((entry) => entry.adapter === "claude" && paths.has(entry.path));
  const bytes = await Promise.all([...paths].map(async (path) => [path, await readFile(join(root, path), "utf8")] as const));

  const engineVersion = createApp().version;
  await writeManifest(root, { ...(both as SetupManifest), tools: ["cursor"] }, { now: T0 });
  await applySync(root, await planSync(root, engineVersion), { engineVersion, force: false, dryRun: false, now: T0 });

  await handle.seedFiles(Object.fromEntries(bytes));
  const cursorOnly = await readManifest(root);
  await writeManifest(
    root,
    { ...(cursorOnly as SetupManifest), generatedBy: engineVersion, ledger: [...(cursorOnly?.ledger ?? []), ...kept] },
    { now: T0 },
  );
  return root;
}

/**
 * An initialised repository: seeded corpus, a valid manifest, the state
 * directories, and — new with live emission — the emitted files themselves,
 * so every doctor row except the ones a test deliberately breaks reads `pass`
 * and the drift gate reads clean.
 *
 * Why the sync run: `runDriftGate` calls `planSync` and counts every plan entry
 * that is not `unchanged`. While the planner was the no-op it planned nothing,
 * so a manifest with an empty ledger and no generated files on disk was
 * indistinguishable from a synced repo. It no longer is — that repo is now
 * genuinely drifted (`stamity sync` would create eight files), and asserting it
 * reads "clean" would assert a falsehood. The fixture therefore performs the
 * sync it always implied, which is also what makes the `.claude/settings.json`
 * trace real rather than a hand-seeded `{}` stub.
 *
 * Ordering: the sync runs against the manifest WITHOUT `opts.ledger`, because
 * apply rewrites each tool's ledger rows from what it emitted; the caller's
 * extra rows (missing files, pack rows, deselected adapters) are appended
 * afterwards, and `opts.files` is seeded last so a test's deliberate defect
 * always wins over generated bytes.
 */
async function seedRepo(handle: TempDirHandle, opts: SeedOptions = {}): Promise<string> {
  __setContentRootForTests(handle.path("corpus"));
  await handle.seedFiles({ "corpus/charter/stamity-charter.md": CHARTER_FIXTURE });

  // The sync always runs at THIS build's version, so the emitted files are
  // current; `opts.generatedBy` re-stamps only the manifest's provenance field
  // below. Syncing at a stale version instead would stamp every managed block
  // stale too, which is real drift and not the "manifest says it was generated
  // by an older engine" state the skew test is about.
  const engineVersion = createApp().version;
  const base = createManifest({
    tools: opts.tools ?? ["claude"],
    selection: { items: { agent: [], skill: [], rule: [], command: [] } },
    generatorVersion: engineVersion,
    now: T0,
    ...(opts.mcpServers === undefined ? {} : { mcp: { servers: opts.mcpServers } }),
  });
  // Pinned before the sync, so the emitted files are rendered against the same
  // gates the manifest carries and the drift gate reads clean.
  if (opts.gates !== undefined) base.gates = opts.gates;
  await writeManifest(handle.dir, base, { now: T0 });
  if (opts.repoFiles !== undefined) await handle.seedFiles(opts.repoFiles);

  if (opts.stateDirs !== false) {
    await Promise.all(
      ["learnings", "handoffs"].map((name) =>
        mkdir(join(handle.dir, STATE_DIR, name), { recursive: true }),
      ),
    );
  }

  const plan = await planSync(handle.dir, engineVersion);
  await applySync(handle.dir, plan, { engineVersion, force: false, dryRun: false, now: T0 });

  // Re-stamp what apply refreshed (`generatedBy`, `updatedAt`, schema version)
  // back to the fixture's pinned values, and append the caller's ledger rows.
  const synced = await readManifest(handle.dir);
  const manifest: SetupManifest = {
    ...(synced ?? base),
    generatedBy: opts.generatedBy ?? engineVersion,
    ...(opts.version === undefined ? {} : { version: opts.version }),
    ledger: [...(synced?.ledger ?? []), ...(opts.ledger ?? [])],
  };
  await writeManifest(handle.dir, manifest, { now: T0 });
  if (opts.plugin !== undefined) {
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014): the writer refuses a
    // `plugin` key now, so the 1.14 block is added to the bytes on disk, where a repository holds it.
    const path = join(handle.dir, STATE_DIR, "manifest.json");
    const onDisk = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    await writeFile(path, `${JSON.stringify({ ...onDisk, plugin: opts.plugin }, null, 2)}\n`, "utf8");
  }

  if (opts.files !== undefined) await handle.seedFiles(opts.files);
  return handle.dir;
}

/**
 * Every file under `root`, POSIX-relative, with the sha-256 of its bytes —
 * the whole-tree equality a non-mutation claim needs.
 */
async function hashTree(root: string): Promise<Record<string, string>> {
  const names = (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  const tree: Record<string, string> = {};
  await Promise.all(
    names.map(async (path) => {
      tree[relative(root, path).split(sep).join("/")] = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
    }),
  );
  return tree;
}

/** Runs `check --json` and parses the single document the funnel emits. */
async function runJson(
  cwd: string,
  env?: Record<string, string | undefined>,
): Promise<{ code: number; doc: Envelope }> {
  const result = await runInProcess([checkCommand], ["check", "--json"], {
    cwd,
    ...(env === undefined ? {} : { env }),
  });
  const lines = result.stdout.trim().split("\n");
  // One run, one document: a second line would mean human output leaked past
  // the funnel's JSON suppression.
  expect(lines).toHaveLength(1);
  return { code: result.code, doc: JSON.parse(lines[0] ?? "") as Envelope };
}

function runHuman(
  cwd: string,
  env?: Record<string, string | undefined>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return runInProcess([checkCommand], ["check"], { cwd, ...(env === undefined ? {} : { env }) });
}

function row(doc: Envelope, id: string): DoctorCheck {
  const found = doc.doctor.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no doctor row ${id} in ${JSON.stringify(doc.doctor)}`);
  return found;
}

describe("checkNodeVersion", () => {
  // The failing branch is unreachable in-process — the suite runs on a Node
  // that already satisfies the floor — so the comparison is exercised as the
  // pure function it is, with the version injected.

  it("passes a version inside the range", () => {
    expect(checkNodeVersion("22.22.2", ">=22.22.2")).toEqual({
      id: "node-version",
      status: "pass",
      detail: "Node 22.22.2 satisfies >=22.22.2",
    });
  });

  it("fails a version below the floor, naming the range and the fix", () => {
    const check = checkNodeVersion("20.19.4", ">=22.22.2");

    expect(check.status).toBe("fail");
    expect(check.detail).toContain("20.19.4");
    expect(check.detail).toContain(">=22.22.2");
    expect(check.detail).toContain("re-run");
  });

  it("accepts a prerelease build of a satisfying major", () => {
    // semver excludes prereleases from a plain range by default; a Node nightly
    // on a satisfying major is a real installation, not a floor violation.
    expect(checkNodeVersion("24.0.0-nightly20260101abcdef", ">=22.22.2").status).toBe("pass");
  });

  it("warns rather than fails on an unparseable version or an unreadable range", () => {
    const unparseable = checkNodeVersion("not-a-version", ">=22.22.2");
    expect(unparseable.status).toBe("warn");
    expect(unparseable.detail).toContain("not-a-version");

    const noRange = checkNodeVersion("22.14.0", null);
    expect(noRange.status).toBe("warn");
    expect(noRange.detail).toContain("engines.node");
  });
});

/**
 * Every direct `runDoctor` call in this file pins `env: {}`, so a suite's
 * verdict never depends on the shell it was started from. The command-level
 * cases go through `runInProcess`, whose env already defaults to `{}` for the
 * same reason.
 */

describe("check — a healthy repository", () => {
  it("exits 0 with no failing row, clean drift, and the manifest as provenance", async () => {
    const root = await seedRepo(getRepo());

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(doc.doctor.filter((entry) => entry.status === "fail")).toEqual([]);
    expect(row(doc, "manifest").status).toBe("pass");
    // A freshly synced repo is the honest clean state; it was an empty ledger
    // over an empty corpus while emission was a no-op.
    // TEST CHANGE, justified: REQ-PLUGIN-045 — check names each reclaim path
    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(doc.provenance?.generatedBy).toBe(createApp().version);
    // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e1-pins-contract, REQ-LADDER-005):
    // the manifest generation moved from 1.0.0 to 2.0.0 with per-client pins, so a fresh sync
    // writes 2.0.0; e1 left this expectation behind and this lane owns the file.
    expect(doc.provenance?.manifestVersion).toBe("2.0.0");
    // Was `files: 0`. Counted off the ledger rather than pinned to a literal so
    // the rollup stays asserted without this suite owning the adapter's file
    // count; the guard below keeps it from passing vacuously at zero.
    const ledgerRows = (await readManifest(root))?.ledger ?? [];
    expect(ledgerRows.length).toBeGreaterThan(0);
    expect(doc.provenance?.perAdapter).toEqual([
      // `null` because the emitted set mixes stamped (managed-block) and
      // unstamped (whole-file) artifacts, which is what a null stamp means.
      { adapter: "claude", files: ledgerRows.length, stampedVersion: null },
    ]);
  });

  it("counts managed paths once and names the ledger rows beside them (REQ-FLOW-022)", async () => {
    // Two clients share `AGENTS.md`, so the ledger holds more rows than the repo
    // holds files. The row used to print the row count alone, which disagreed with
    // init's file count for the same setup.
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });

    const { doc } = await runJson(root);

    const ledger = (await readManifest(root))?.ledger ?? [];
    const paths = new Set(ledger.map((entry) => entry.path)).size;
    expect(paths).toBeGreaterThan(0);
    expect(paths).toBeLessThan(ledger.length);
    expect(row(doc, "manifest").detail).toContain(
      `tools claude, codex, ${paths} managed path(s) (${ledger.length} ledger rows across 2 client(s))`,
    );
    expect(row(doc, "manifest").detail).not.toContain("ledger row(s)");
  });

  it("prints the doctor table, the drift verdict, provenance, and a closing line", async () => {
    const root = await seedRepo(getRepo());

    const result = await runHuman(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("node-version");
    expect(result.stdout).toContain("drift: clean");
    expect(result.stdout).toContain("provenance (the manifest is the record)");
    // TEST CHANGE, justified (REQ-FLOW-008, plan 013 sw04-check-names-unrun-gates): the
    // closing line's contract moved. It said "nothing to do", which read as "all verified"
    // while check runs no gate at all; it now names the three charter gates it did not run.
    // The assertion still pins that a green run ends on its closing line.
    expect(result.stdout).toContain("gates not run: lint, typecheck, test (check runs no gate)");
    expect(result.stdout).not.toMatch(/all green/);
    expect(result.stderr).toBe("");
  });

  // TEST CHANGE, justified (2026-10-03, REQ-PLUGIN-016, run 2026-10-03_pack-engine-defects
  // unit u4b-pack-reach-row): the title's count moved from fourteen to fifteen with the
  // `pack-reach` row below; the assertion is the array, which names every row.
  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): fifteen to
  // fourteen — the `plugin-runtime` row left with the plugin route.
  // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row,
  // REQ-LADDER-008): fourteen to fifteen with the `model-pins` row below.
  // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): fifteen to fourteen —
  // the `plugin-duplicates` row left with the held `plugin` block it warned about.
  it("returns the fourteen doctor rows in a fixed order", async () => {
    const root = await seedRepo(getRepo());

    const doctor = await runDoctor(root, createEngine(), createApp({ cwd: root, env: {} }));

    // Grew by one again: `preserved-duplicate` reads the ledgered managed files
    // and asks whether any of them repeats its block below the END marker. It
    // sits beside `tool-traces` because both answer off the ledger, and
    // `pack-integrity` stays last — it is the row whose cost scales with what
    // the repo installed, and reading order puts the environment probes first.
    //
    // TEST CHANGE, justified (2026-09-15): `invariants` appended, after
    // `pack-integrity` rather than beside it. Every row above answers about
    // THIS repository's state; this one answers about the installed corpus —
    // which version of the floor invariants a sync would write. The pin is a
    // literal array, so it moves with the surface it guards rather than
    // silently agreeing with a shorter one.
    expect(doctor.map((entry) => entry.id)).toEqual([
      "node-version",
      "git-available",
      "manifest",
      "state-dirs",
      "learnings",
      "tmp-hygiene",
      "env-mcp",
      "tool-traces",
      // TEST CHANGE, justified (2026-09-22, prove/190 and prove/242): `claude-hook-shell`
      // joined the doctor beside `tool-traces` — both answer about the targeted tools' emitted
      // rows, and this one asks whether the Claude rows can LAUNCH on this host: on a Windows
      // host with no Git Bash the anchored hook commands fall to PowerShell and never run, which
      // is a guard silently disarmed. The row is present on every host (a pass with the note that
      // released it elsewhere), so the pin grows by one and no row above or below it moved.
      "claude-hook-shell",
      "preserved-duplicate",
      "pack-integrity",
      // TEST CHANGE, justified (2026-09-20, REQ-PLUGIN-016): the two plugin rows
      // joined the doctor after the repository-state probes and before `invariants`,
      // which alone reads the installed corpus. No row above moved, and the pin
      // stays a literal array so the next one has to be placed here too.
      // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine):
      // `plugin-runtime` left with the plugin route; `plugin-duplicates` stays one
      // release as the leftover-plugin warning, in the same place.
      // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): `plugin-duplicates`
      // left after that release; `pack-reach` keeps its place before `invariants`.
      // TEST CHANGE, justified (2026-10-03, REQ-PLUGIN-016, run 2026-10-03_pack-engine-defects
      // unit u4b-pack-reach-row): `pack-reach` joined the doctor after the plugin rows. It reads
      // the same plugin boundary from the other side — not what the repository holds twice, but
      // what an installed pack ships that no selected client receives — and it answers about
      // this repository, so it sits before `invariants`, which alone reads the installed corpus.
      // No other row moved.
      "pack-reach",
      // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row,
      // REQ-LADDER-008): `model-pins` joined after `pack-reach`. It answers about this
      // repository's pins against the account's model list, so it sits with the repository
      // rows, before `invariants`, which alone reads the installed corpus. No other row moved.
      "model-pins",
      "invariants",
    ]);
  });

  it("reports the installed charter's invariants version, read rather than restated", async () => {
    const root = await seedRepo(getRepo());

    const doctor = await runDoctor(root, createEngine(), createApp({ cwd: root, env: {} }));
    const invariantsRow = doctor.find((entry) => entry.id === "invariants");

    // The fixture's own values, not the shipped charter's: the row is a read.
    expect(invariantsRow).toEqual({
      id: "invariants",
      status: "pass",
      detail: "invariants 4.5.6 · ratified 2026-02-03 · last amended 2026-04-05",
    });
  });

  it("warns, rather than failing, when the installed charter predates versioning", async () => {
    const repo = getRepo();
    const root = await seedRepo(repo);
    await repo.seedFiles({ "corpus/charter/stamity-charter.md": UNVERSIONED_CHARTER_FIXTURE });

    const doctor = await runDoctor(root, createEngine(), createApp({ cwd: root, env: {} }));
    const invariantsRow = doctor.find((entry) => entry.id === "invariants");

    expect(invariantsRow?.status).toBe("warn");
    expect(invariantsRow?.detail).toContain("invariants_version");
    // A warn alone does not take the command down: the exit rule is fails only.
    expect(doctor.filter((entry) => entry.status === "fail")).toEqual([]);
  });

  it("notes engine-version skew on the manifest row without failing it", async () => {
    const root = await seedRepo(getRepo(), { generatedBy: "0.9.0" });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "manifest").status).toBe("pass");
    expect(row(doc, "manifest").detail).toContain("0.9.0");
    expect(row(doc, "manifest").detail).toContain("this build is");
  });
});

describe("check — an un-initialised repository", () => {
  it("fails the manifest row with the init next step and exits 1", async () => {
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    const { code, doc } = await runJson(handle.dir);

    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    expect(row(doc, "manifest").status).toBe("fail");
    expect(row(doc, "manifest").detail).toContain(npxCommand("init"));
    // The gate could not run, and check says so rather than claiming a verdict.
    expect(doc.drift).toBeNull();
    expect(doc.provenance).toBeNull();
  });

  it("names the same next step in human output", async () => {
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    const result = await runHuman(handle.dir);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("fail");
    expect(result.stdout).toContain("drift: not evaluated");
    expect(result.stdout).toContain("next:");
    expect(result.stdout).toContain(npxCommand("init"));
  });

  it("names the installation's own package in the remedy, never a hardcoded one", async () => {
    const handle = getRepo();
    const pseudoInstall = handle.path("pseudo-install");
    await mkdir(pseudoInstall, { recursive: true });
    // The identity a downstream leaves behind after the bootstrap block in
    // docs/enterprise-forks.md: its own scope, and private.
    await writeFile(
      join(pseudoInstall, "package.json"),
      `${JSON.stringify({ name: "@acme/stamity", version: "1.8.0", private: true })}\n`,
    );

    // The rename cannot be applied to THIS checkout in-process: the self-read
    // behind the remedy anchors on the kit module's own `import.meta.url`, and
    // anchoring it on the cwd instead would be the bug (the cwd is the user's
    // repository, never the package being named). So only the root walk is
    // redirected, and only for the kit's own call — every other caller of
    // `findPackageRoot`, check's own Node-range probe included, keeps the real
    // answer — leaving the manifest read, the name and the rendering real.
    const kitDir = join("src", "cli", "kit");
    vi.resetModules();
    vi.doMock("../../../src/shared/paths.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof PathsApi>();
      return {
        ...actual,
        findPackageRoot: (from: string): string =>
          from.endsWith(kitDir) ? pseudoInstall : actual.findPackageRoot(from),
      };
    });
    try {
      const renamed = await import("../../../src/cli/commands/check.ts");
      const result = await runInProcess([renamed.checkCommand], ["check"], { cwd: handle.dir });

      expect(result.code).toBe(1);
      // Both seams: the manifest doctor row and the closing next-steps block.
      // TEST CHANGE (sw26-engine-cli-call-form, REQ-FLOW-002): the remedy is the
      // pinned call — the fork's name AND its version — and the negative widens
      // to any canonical spelling, pinned or not.
      // TEST CHANGE (sw26 fix round 1, review/94): this fixture is the registry-less
      // fork (private, no publishConfig.registry), so the remedy fails closed with
      // `--no` — it runs an installed copy and never fetches one — and never `-y`.
      expect(result.stdout).toContain("npx --no @acme/stamity@1.8.0 init");
      expect(result.stdout).toContain("npx --no @acme/stamity@1.8.0 init — this repository has no usable");
      expect(result.stdout).not.toContain("npx -y ");
      expect(result.stdout).not.toContain("@zomarit/stamity");
    } finally {
      vi.doUnmock("../../../src/shared/paths.ts");
      vi.resetModules();
    }
  });

  it("fails the same way when .stamity exists but the manifest was hand-deleted", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle);
    await rm(manifestPath(root));

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    // The state directories survive, so the ONLY failing row is the manifest —
    // a half-deleted state dir must not read as a broken environment.
    expect(doc.doctor.filter((entry) => entry.status === "fail").map((entry) => entry.id)).toEqual([
      "manifest",
    ]);
    expect(row(doc, "manifest").detail).toContain(npxCommand("init"));
    expect(row(doc, "state-dirs").status).toBe("pass");
  });

  it("fails with the engine's own field messages when the manifest is corrupt", async () => {
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));
    await handle.seedFiles({ [`${STATE_DIR}/manifest.json`]: '{"version": 1, "tools": []}\n' });

    const { code, doc } = await runJson(handle.dir);

    expect(code).toBe(1);
    expect(row(doc, "manifest").status).toBe("fail");
    // Passed through verbatim: re-wording the engine's field list here would
    // put a second, staler copy of every rule in the CLI.
    expect(row(doc, "manifest").detail).toContain("`version` must be a semantic version string");
    expect(row(doc, "manifest").detail).toContain("`tools` must name at least one target tool");
    expect(doc.drift).toBeNull();
  });
});

describe("check — the drift gate", () => {
  // TEST CHANGE, justified: REQ-PLUGIN-045 — a pack row lies only in its own
  // pack folder and is `infra` there, as every release records one; the row
  // sat at `docs/pack-guide.md` as a `skill`, which the manifest now refuses.
  const PACK_GUIDE = ".stamity/packs/demo/guide.md";
  const packRow: LedgerEntry = {
    path: PACK_GUIDE,
    adapter: packOwner("demo"),
    artifactId: "guide",
    artifactType: "infra",
  };

  it("names a ledgered file that is gone, and goes clean again once it is back", async () => {
    // A pack row, not an adapter row: pack content is excluded from the reclaim
    // sweep by construction, so this fixture isolates the missing-file source of
    // drift from the reclaim source exercised below.
    const handle = getRepo();
    const root = await seedRepo(handle, {
      ledger: [packRow],
      files: { [PACK_GUIDE]: "# Guide\n" },
    });

    const before = await runJson(root);
    expect(before.code).toBe(0);
    expect(before.doc.drift?.clean).toBe(true);

    await rm(join(root, PACK_GUIDE));
    const during = await runJson(root);
    expect(during.code).toBe(1);
    expect(during.doc.ok).toBe(false);
    expect(during.doc.drift?.missing).toEqual([PACK_GUIDE]);
    expect(during.doc.drift?.clean).toBe(false);

    await writeFile(join(root, PACK_GUIDE), "# Guide\n", "utf8");
    const after = await runJson(root);
    expect(after.code).toBe(0);
    // TEST CHANGE, justified: REQ-PLUGIN-045 — check names each reclaim path
    expect(after.doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
  });

  it("prints the missing path and the sync next step in human output", async () => {
    const root = await seedRepo(getRepo(), { ledger: [packRow] });

    const result = await runHuman(root);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledgered file(s) missing");
    expect(result.stdout).toContain(PACK_GUIDE);
    expect(result.stdout).toContain(npxCommand("sync"));
    // Pack rows still appear in the provenance rollup, missing file or not.
    expect(result.stdout).toContain("pack demo: 1 file(s)");
  });

  it("counts a deselected adapter row as reclaim-pending drift", async () => {
    // An adapter-owned ledger row at a path the planner does NOT emit has
    // nothing re-emitting it: the row is queued for reclaim, which is drift even
    // though the file itself is present and unchanged. The path was `CLAUDE.md`
    // while the planner was the no-op and emitted nothing; claude now emits
    // exactly that file, so the row would be re-emitted rather than reclaimed —
    // a path outside the emitted set is what the scenario actually needs.
    // TEST CHANGE, justified: REQ-PLUGIN-045 — an `infra` row at
    // `docs/legacy-guide.md` names a path no release writes and the manifest is
    // now refused; a deselected engine agent, recorded with its hash as every
    // release records one, is the same reclaim-pending drift.
    // TEST CHANGE, justified (2026-10-08, row 560, unit d1a-rendering-proof-core):
    // a made-up agent no corpus renders is now kept as a retired artifact, so
    // the deselected engine agent is one the sync wrote for a client the setup
    // no longer targets (`seedDeselectedAgents`); its row and hash are the sync's own.
    const legacy = ".claude/agents/stamity-legacy-guide.md";
    const root = await seedDeselectedAgents(["legacy-guide"]);

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    // TEST CHANGE, justified: REQ-PLUGIN-045 — check names each reclaim path
    expect(doc.drift).toMatchObject({
      clean: false,
      missing: [],
      reclaimPending: 1,
      // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
      // reason reads `adapter-removed`, not `deselected` — the agent's client is
      // no longer targeted, now that no plugin-backed record can take one class
      // from a targeted client (`seedDeselectedAgents`).
      reclaim: [{ path: legacy, reason: "adapter-removed", action: "delete", proof: "hash" }],
    });
    expect(doc.drift?.changes).toEqual([]);

    // A queued reclaim is drift with no changed and no missing path, so the
    // human report has nothing to list — the next step is the only thing that
    // tells the reader what to do about it, and sync is what drains the queue.
    const human = await runHuman(root);
    expect(human.stdout).toContain("queued for reclaim");
    expect(human.stdout).toContain(npxCommand("sync"));
  });

  it("counts a path claimed twice in the ledger as one missing file", async () => {
    const root = await seedRepo(getRepo(), {
      tools: ["claude", "cursor"],
      ledger: [
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the pack row moved into its
        // own pack folder as `infra`; `docs/shared.md` as a `rule` is refused.
        {
          path: ".stamity/packs/alpha/shared.md",
          adapter: packOwner("alpha"),
          artifactId: "shared",
          artifactType: "infra",
        },
      ],
    });

    const report = await runDriftGate(root, "1.0.0");

    expect(report.missing).toEqual([".stamity/packs/alpha/shared.md"]);
  });

  it("propagates the engine's un-initialised failure to a direct caller", async () => {
    // The command collapses this to `drift: null` on purpose; the gate itself
    // stays honest so any other caller sees the real failure.
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    await expect(runDriftGate(handle.dir, "1.0.0")).rejects.toBeInstanceOf(EngineError);
  });
});

/**
 * REQ-PLUGIN-045: `check` names every path a sync would reclaim, with the
 * action and the proof, where it used to print only a count beside `sync` as
 * the remedy — the one moment the operator can still decide not to run it.
 */
describe("check — the reclaim preview", () => {
  const sha = (content: string): string => createHash("sha256").update(content).digest("hex");
  const agentRow = (path: string, content: string): LedgerEntry => ({
    path,
    adapter: "claude",
    artifactId: path,
    artifactType: "agent",
    contentHash: sha(content),
  });

  it("names a deselected engine file with its action and proof, in --json and in the text", async () => {
    // TEST CHANGE, justified (2026-10-08, row 560, unit d1a-rendering-proof-core):
    // the deselected engine agent is one the sync wrote for a client the setup
    // no longer targets (`seedDeselectedAgents`), where a made-up agent no
    // corpus renders stood; that one is now kept as a retired artifact.
    const gone = ".claude/agents/stamity-gone.md";
    const root = await seedDeselectedAgents(["gone"]);

    const { code, doc } = await runJson(root);
    const human = await runHuman(root);

    expect(code).toBe(1);
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
    // reason reads `adapter-removed` (`seedDeselectedAgents`); the action and the
    // proof this case is about are unchanged.
    expect(doc.drift?.reclaim).toEqual([{ path: gone, reason: "adapter-removed", action: "delete", proof: "hash" }]);
    expect(doc.drift?.reclaimPending).toBe(1);
    expect(human.stdout).toContain(`  delete    ${gone} (hash)`);
    // A preview: the file is still there.
    expect(existsSync(join(root, gone))).toBe(true);
  });

  it("prints every delete line, never folding one into the overflow row", async () => {
    // TEST CHANGE, justified (2026-10-08, row 560, unit d1a-rendering-proof-core):
    // 25 engine agents the sync wrote for a client the setup no longer targets
    // (`seedDeselectedAgents`), where made-up agents no corpus renders
    // stood; those are now kept as retired artifacts.
    const ids = Array.from({ length: 25 }, (_, index) => `gone-${String(index).padStart(2, "0")}`);
    const paths = ids.map((id) => `.claude/agents/stamity-${id}.md`);
    const root = await seedDeselectedAgents(ids);

    const human = await runHuman(root);

    for (const path of paths) expect(human.stdout).toContain(`  delete    ${path} (hash)`);
    expect(human.stdout).not.toContain("more\n");
  });

  // TEST CHANGE, justified: REQ-PLUGIN-045 — `check` names every path a sync
  // would reclaim in its text, so no reclaim line folds past the bound; this
  // case used to pin the keep and refuse lines folding into "… and 2 more".
  it("names a kept, a refused and a stripped file with the sweep's reason, and folds none of them past the bound", async () => {
    const edited = ".claude/agents/stamity-edited.md";
    const hashless = ".claude/agents/stamity-hashless.md";
    const stripped = ".claude/agents/stamity-noted.md";
    const missing = Array.from({ length: 21 }, (_, index) => `.stamity/packs/demo/m-${String(index).padStart(2, "0")}.md`);
    const root = await seedRepo(getRepo(), {
      ledger: [
        agentRow(edited, "engine agent\n"),
        { path: hashless, adapter: "claude", artifactId: "hashless", artifactType: "agent" },
        { path: stripped, adapter: "claude", artifactId: "noted", artifactType: "agent" },
        ...missing.map((path) => ({ path, adapter: packOwner("demo"), artifactId: path, artifactType: "infra" as const })),
      ],
      files: {
        [edited]: "my own agent\n",
        [hashless]: "engine agent\n",
        [stripped]: `${wrapInManagedBlock("engine body")}my notes\n`,
      },
    });

    const { doc } = await runJson(root);
    const human = await runHuman(root);

    expect(doc.drift?.reclaim).toEqual([
      expect.objectContaining({ path: edited, action: "keep", why: expect.stringContaining("edited since") }),
      expect.objectContaining({ path: hashless, action: "refuse", why: expect.stringContaining("records no content hash") }),
      { path: stripped, reason: "deselected", action: "strip", proof: "block" },
    ]);
    expect(doc.drift?.reclaim.map((preview) => preview.proof)).toEqual([undefined, undefined, "block"]);
    // Twenty-one missing lines overflow the bound by one, and only that one folds.
    expect(human.stdout).toContain("… and 1 more");
    expect(human.stdout).toContain(`  keep      ${edited} — `);
    expect(human.stdout).toContain(`  refuse    ${hashless} — `);
    expect(human.stdout).toContain(`  strip     ${stripped} (block)`);
  });

  it("spells control and escape characters in a reclaim path visibly in the text, and keeps --json as recorded", async () => {
    const esc = String.fromCodePoint(0x1b);
    const rlo = String.fromCodePoint(0x202e);
    const hostile = `.claude/agents/stamity-${esc}[1A${esc}[2K${rlo}x.md`;
    // Ledger only: Windows refuses such a file name, and the preview prints the
    // recorded path whatever the disk holds.
    const root = await seedRepo(getRepo(), {
      ledger: [{ path: hostile, adapter: "claude", artifactId: "hostile", artifactType: "agent" }],
    });

    const { doc } = await runJson(root);
    const human = await runHuman(root);

    expect(doc.drift?.reclaim.map((preview) => preview.path)).toEqual([hostile]);
    const backslash = String.fromCodePoint(0x5c);
    const spelled = `.claude/agents/stamity-${backslash}u{1b}[1A${backslash}u{1b}[2K${backslash}u{202e}x.md`;
    expect(human.stdout).toContain(`  missing   ${spelled}\n`);
    expect(human.stdout).toContain(`  gone      ${spelled} — `);
    expect(human.stdout).not.toContain(esc);
    expect(human.stdout).not.toContain(rlo);
  });

  it("prints a keep line with the sweep's reason when there is room", async () => {
    const edited = ".claude/agents/stamity-edited.md";
    const root = await seedRepo(getRepo(), {
      ledger: [agentRow(edited, "engine agent\n")],
      files: { [edited]: "my own agent\n" },
    });

    const human = await runHuman(root);

    expect(human.stdout).toContain(`  keep      ${edited} — The bytes no longer hash`);
  });

  it("names a strip with the block as its proof", async () => {
    const stripped = ".claude/agents/stamity-noted.md";
    const root = await seedRepo(getRepo(), {
      ledger: [{ path: stripped, adapter: "claude", artifactId: "noted", artifactType: "agent" }],
      files: { [stripped]: `${wrapInManagedBlock("engine body")}my notes\n` },
    });

    const { doc } = await runJson(root);

    expect(doc.drift?.reclaim).toEqual([{ path: stripped, reason: "deselected", action: "strip", proof: "block" }]);
  });

  it("names a file already gone", async () => {
    const gone = ".claude/agents/stamity-already-gone.md";
    const root = await seedRepo(getRepo(), { ledger: [agentRow(gone, "x\n")] });

    const { doc } = await runJson(root);

    expect(doc.drift?.reclaim).toEqual([
      expect.objectContaining({ path: gone, action: "gone" }),
    ]);
  });

  it("publishes the owned-path bound on every run, with or without a manifest", async () => {
    const root = await seedRepo(getRepo());
    expect((await runJson(root)).doc.ownedPaths).toEqual(OWNED_PATHS);

    const bare = getRepo();
    __setContentRootForTests(bare.path("corpus"));
    await mkdir(bare.path("empty"), { recursive: true });
    expect((await runJson(bare.path("empty"))).doc.ownedPaths).toEqual(OWNED_PATHS);
  });
});

/** The client's project-scope install write, appended to the engine's real settings bytes. */
async function appendClientKey(root: string): Promise<void> {
  const path = join(root, ".claude", "settings.json");
  const doc = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  doc["enabledPlugins"] = { "stamity@stamity": true };
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
}

describe("check — key-level ownership of .claude/settings.json", () => {
  const SETTINGS = ".claude/settings.json";

  // Retitled 2026-10-08 (build/40): it named the engine's permissions, which no setup renders since the allow rows left.
  it("reads the client's enabledPlugins beside the engine's hook entries as clean, and exits 0", async () => {
    // The documented consumer route: `plugin install --scope project` writes
    // this key into the engine's file, and a sync would leave it there — so
    // neither drift nor a collision is true of it.
    const root = await seedRepo(getRepo());
    await appendClientKey(root);

    const { code, doc } = await runJson(root);

    // TEST CHANGE, justified: REQ-PLUGIN-045 — check names each reclaim path
    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(code).toBe(0);
    expect((await runHuman(root)).stdout).toContain("drift: clean");
  });

  it("reads a hand-written permissions key the ledger does not claim as an update the merge keeps, not as a collision", async () => {
    const root = await seedRepo(getRepo());
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(
      root,
      { ...manifest, ledger: manifest.ledger.filter((entry) => entry.path !== SETTINGS) },
      { now: T0 },
    );
    await getRepo().seedFiles({
      [SETTINGS]: `${JSON.stringify({ permissions: { allow: ["Bash"] }, model: "opus" }, null, 2)}\n`,
    });

    const { code, doc } = await runJson(root);

    // TEST CHANGE, justified: REQ-FLOW-036 — an owner's `permissions` is merged entry by entry, so
    // the plan is an `update` that keeps the `Bash` row; it was a collision
    // whose step offered `sync --force`.
    expect(code).toBe(1);
    expect(doc.drift?.changes).toEqual([{ path: SETTINGS, action: "update" }].map((entry) => expect.objectContaining(entry)));
    const human = await runHuman(root);
    expect(human.stdout).not.toContain("collide");
    expect(human.stdout).not.toContain("--force");
  });

  it("reports a permissions member of another type as a co-owned-shape collision whose step names the member, and no line offers --force", async () => {
    const root = await seedRepo(getRepo());
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(
      root,
      { ...manifest, ledger: manifest.ledger.filter((entry) => entry.path !== SETTINGS) },
      { now: T0 },
    );
    await getRepo().seedFiles({ [SETTINGS]: `{"permissions":"allow-all"}\n` });

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    expect(doc.drift?.changes).toEqual([
      expect.objectContaining({ path: SETTINGS, action: "collision", collisionKind: "co-owned-shape" }),
    ]);
    expect(JSON.stringify(doc)).not.toContain("--force");
    const human = await runHuman(root);
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("permissions is a string, not an object");
    for (const line of `${human.stdout}${human.stderr}`.split("\n")) expect(line).not.toContain("--force");
  });
});

describe("check — advisory warnings", () => {
  it("exits 0 when the only findings are a missing state subdir and an absent git repo", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { stateDirs: false });
    // FIXTURE CHANGE: `stateDirs: false` used to be enough, because the
    // write verbs left these directories to the stores. Both verbs scaffold
    // them now — with a `.gitkeep`, so a clone keeps them — so the warning
    // state has to be produced the way a repository actually reaches it: by
    // something removing them after the setup was written.
    await rm(join(root, STATE_DIR, "learnings"), { recursive: true, force: true });
    await rm(join(root, STATE_DIR, "handoffs"), { recursive: true, force: true });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(row(doc, "state-dirs").status).toBe("warn");
    expect(row(doc, "state-dirs").detail).toContain(`${STATE_DIR}/learnings`);
    expect(row(doc, "state-dirs").detail).toContain(`${STATE_DIR}/handoffs`);
    // ASSERTION ADDED: the remedy has to be a command that does the
    // thing. This row named `npx @zomarit/stamity init`, which refuses an initialised
    // repo with exit 1 and recreates nothing — so the warning was permanent for
    // every teammate who cloned the repository.
    expect(row(doc, "state-dirs").detail).toContain(npxCommand("sync"));
    expect(row(doc, "state-dirs").detail).not.toContain(npxCommand("init"));
    // A temp directory is not a git repository; git-less repos are legal, so the
    // row is never a failure whichever way the probe answers.
    expect(row(doc, "git-available").status).not.toBe("fail");
  });

  /**
   * REPLACES "warns about a target tool with no config on disk".
   *
   * That test deleted `.cursor/` and asserted the warning. The warning was real
   * for cursor and permanently WRONG for copilot: the probe read the repo
   * analyzer's vendor-indicator table, where copilot's trace is
   * `.github/copilot-instructions.md` — a file the adapter deliberately never
   * emits, because copilot reads the root `AGENTS.md` natively. So every
   * copilot-targeting repo warned forever and was told `sync` would fix it,
   * which sync cannot do: no such output exists in the plan. Deleting a tool's
   * directory is now the DRIFT gate's finding (it names the missing paths), and
   * this row answers the question it can answer from the ledger: has anything
   * been emitted for this tool at all.
   */
  it("gives a copilot-only repo no tool-traces warning, because none is true", async () => {
    const root = await seedRepo(getRepo(), { tools: ["copilot"] });

    const { doc } = await runJson(root);

    expect(row(doc, "tool-traces").status).toBe("pass");
    expect(row(doc, "tool-traces").detail).not.toContain("copilot-instructions");
    // And the remedy that could never have worked is gone with it.
    expect(row(doc, "tool-traces").detail).not.toContain("stamity sync");
  });

  it("still warns when a target tool has no emitted files at all", async () => {
    // The state the row exists for, and the one sync genuinely fixes: cursor is
    // targeted but nothing was ever emitted for it, so it holds no ledger rows.
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    const manifest = await readManifest(root);
    await writeManifest(
      root,
      { ...(manifest as SetupManifest), tools: ["claude", "cursor"] },
      { now: T0 },
    );

    const { doc } = await runJson(root);

    expect(row(doc, "tool-traces").status).toBe("warn");
    expect(row(doc, "tool-traces").detail).toContain("cursor");
    expect(row(doc, "tool-traces").detail).toContain(npxCommand("sync"));
  });

  it("passes tool-traces once every target tool has emitted files", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "cursor"] });

    const { doc } = await runJson(root);

    expect(row(doc, "tool-traces").status).toBe("pass");
  });

  it("reports writer temp-file litter without deleting it", async () => {
    // Fixture corrected, not weakened: the writer's temp name carries the
    // engine's own token (`<file>.tmp.<token><8hex>`, `src/merge/atomicWrite.ts`)
    // so the repo-wide sweep can prove it owns what it matches. The old
    // `notes.md.tmp.deadbeef` fixture is a shape several tools share and the
    // sweep correctly no longer claims it — the litter this row reports has to
    // be litter this engine actually left.
    const root = await seedRepo(getRepo(), {
      files: { "notes.md.tmp.stamity-deadbeef": "half-written\n" },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "tmp-hygiene").status).toBe("warn");
    expect(row(doc, "tmp-hygiene").detail).toContain("notes.md.tmp.stamity-deadbeef");
    // Report-only: check is a read verb, so the sweep it drives must leave the
    // file exactly where it found it.
    expect(existsSync(join(root, "notes.md.tmp.stamity-deadbeef"))).toBe(true);
  });

  it("warns on invalid learnings and points at validate for the detail", async () => {
    const root = await seedRepo(getRepo(), {
      files: { [`${STATE_DIR}/learnings/broken.md`]: "no frontmatter, no sections\n" },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "learnings").status).toBe("warn");
    expect(row(doc, "learnings").detail).toContain(npxCommand("validate"));
  });

  it("names the two verbs that need git on the git-available row where git does not answer", async () => {
    // The row said "Nothing in stamity requires it". Two verbs do: `worktree` refuses outside a
    // repository, and `gate scan` exits 1 there, so a flow's report lists the secret scan as not
    // run (run 2026-10-11_release-1-14-0, build/12 — both exits read on the built CLI in a
    // directory with no repository). This row is where an operator with no git lands, so it is
    // the one that has to say so. The temp fixture is not a git repository; the `warn` status is
    // asserted first so the detail under test is the no-git branch's and not the passing one's.
    //
    // The same `warn` fires when git is there and the status read outran the probe's bound
    // (`readWorkingTreeStatus`, `src/cli/engine/gitStatus.ts`), where `gate` and `worktree`, which
    // wait longer on git, may still run (review/29). So the row names that third cause, and what
    // the two verbs lose is conditional on git being absent.
    const root = await seedRepo(getRepo());

    const { code, doc } = await runJson(root);
    const git = row(doc, "git-available");

    expect(code).toBe(0);
    expect(git.status).toBe("warn");
    expect(git.detail).not.toContain("Nothing in stamity requires it");
    expect(git.detail).toContain("or git was only slow to answer this check");
    // TEST CHANGE, justified (run 2026-10-18_cloud-runs-2, review/245, review/247): the row named two verbs;
    // `plan check` and the `run` verbs exit 1 with no git work tree too (`src/cli/commands/plan.ts`
    // repositoryRoot, `src/cli/commands/run.ts`), so it names four, as README and getting-started do.
    expect(git.detail).toContain("Four verbs need git");
    expect(git.detail).toContain("plan and run exit 1 without it");
    expect(git.detail).toContain("worktree refuses without it");
    // TEST CHANGE, justified: the clause read "so with no git or no repository gate scan exits 1".
    // On this text the engine has found a git binary, so the loss is conditional on the
    // repository alone; a git the engine did not find has the row's third text, the next case's.
    expect(git.detail).toContain("so with no repository gate scan exits 1");
    expect(git.detail).toContain("/st-quick and /st-work list `secret scan: not run` under `Not done:`");
    expect(git.detail).toContain("where git was only slow, all four may still run");
    // The sentence the row already carried stays: what `sync` loses without git.
    expect(git.detail).toContain("sync's dirty-tree warning simply stays silent while git does not answer");
    // review/61: the row said "git status here tells which". This text also prints where git itself
    // refused a folder the engine's look passed (a leftover `.git` git cannot open beside or below a
    // folder with the layout of a bare repository), and plain git typed there opens that folder. So
    // the row tells the causes apart by a step that looks for no repository, and names no git
    // command.
    expect(git.detail).not.toContain("tells which");
    // TEST CHANGE, justified: the row said "`git --version` shows whether a binary is there", and
    // this case held it to that sentence. A git typed at a prompt is found by the shell's rules,
    // which are not the engine's: the engine takes git only from a `PATH` entry that is a full
    // path to a folder other than this one (`src/shared/programPath.ts`), so the typed command
    // can answer for a program the engine never starts. The row now says what the engine itself
    // found, and names no git command at all. The fixture is a folder with no repository on a
    // host that has git on `PATH`, so this is the text for a git that was found.
    expect(git.detail).not.toContain("git --version");
    expect(git.detail).toContain("the engine found a git binary on PATH");
    expect(git.detail).not.toContain("no binary on PATH");
    expect(git.detail).toContain(
      "a .git entry in this folder or in a folder above it, found by name, shows whether a repository is",
    );
    for (const call of ["git status", "git diff", "git log", "git rev-parse", "git init", "git --"]) {
      expect(git.detail, `the row names ${call}`).not.toContain(call);
    }
    // review/72 moved the other text of this row; this one is compared whole.
    expect(git.detail).toBe(
      "git did not answer here — the engine found a git binary on PATH, so this directory is not a " +
        "repository, or git was only slow to answer this check. To tell which with no git " +
        "command: a .git entry in this folder or in a folder above it, found by name, shows " +
        "whether a repository is. " +
        "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, and gate reads every change from it, " +
        "so with no repository gate scan exits 1 and /st-quick and /st-work list " +
        "`secret scan: not run` under `Not done:`; where git was only slow, all four may still run. " +
        "sync's dirty-tree warning simply stays silent while git does not answer.",
    );
  });

  it("says the engine found no git to start, and names no other cause, where no PATH entry it takes git from holds one", async () => {
    // The row had one text for three causes, "no binary on PATH" among them, and sent the reader
    // to `git --version` to tell them apart. The engine takes git only from a `PATH` entry that is
    // a full path to a folder other than the one git runs in (`resolveProgramOnPath`,
    // `src/shared/programPath.ts`). Where git is reachable through no such entry, the typed
    // command can still find a binary, and the row then pointed at a missing repository or a
    // slow git, neither of which was the cause. The engine knows whether it found a git to
    // start, so the row says so, in words of its own, and names no command to type.
    //
    // Two `PATH` values, each read by the row from the process environment, as the read itself
    // reads it: an empty one, and one whose only entry is the setup root, which holds files
    // of git's program names (`git` for POSIX, `git.exe` for Windows). The engine skips an entry
    // that is the folder git runs in, so neither file is started; their bodies never run.
    //
    // A Copilot-only setup, so the run's exit code does not hang on another row: on Windows the
    // `claude-hook-shell` row reads the same `PATH` to find Git Bash, and fails a Claude setup
    // where Git sits in no default install location.
    const root = await seedRepo(getRepo(), { tools: ["copilot"] });
    await writeFile(join(root, "git"), "#!/bin/sh\nexit 1\n", "utf8");
    await chmod(join(root, "git"), 0o755);
    await writeFile(join(root, "git.exe"), "not a program\n", "utf8");

    // One run at a time: the row reads the process's own `PATH`, which the two runs set in turn.
    const runWith = async (path: string): Promise<{ path: string; code: number; git: DoctorCheck }> => {
      vi.stubEnv("PATH", path);
      try {
        const { code, doc } = await runJson(root);
        return { path, code, git: row(doc, "git-available") };
      } finally {
        vi.unstubAllEnvs();
      }
    };
    const empty = await runWith("");
    const ownFolder = await runWith(root);

    for (const { path, code, git } of [empty, ownFolder]) {
      expect(code, `PATH=${path}`).toBe(0);
      expect(git.status, `PATH=${path}`).toBe("warn");
      expect(git.detail, `PATH=${path}`).toContain("the engine found no git to start");
      // None of the causes that are not this one, and no command to type.
      expect(git.detail, `PATH=${path}`).not.toContain("not a repository");
      expect(git.detail, `PATH=${path}`).not.toContain("slow to answer");
      expect(git.detail, `PATH=${path}`).not.toContain("git --version");
      expect(git.detail, `PATH=${path}`).not.toContain(".git entry");
      // With no git the two verbs' loss is stated outright, as on the row's text for a folder
      // kept from git.
      expect(git.detail, `PATH=${path}`).toBe(
        "git did not answer here — the engine found no git to start. It takes git only from a PATH " +
          "entry that is a full path to a folder other than this one, and no such entry holds a git " +
          "binary: install git, or put the folder that holds it on PATH by its full path. " +
          "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, and gate reads every change from it, " +
          "so here gate scan exits 1 and /st-quick and /st-work list " +
          "`secret scan: not run` under `Not done:`. " +
          "sync's dirty-tree warning simply stays silent while git does not answer.",
      );
    }
  });

  it("says the folder was kept from git, with no hint to run git there, where the look before git refused it", async () => {
    // Run 2026-10-11_release-1-14-0, review/55, review/54 and review/44. Before the engine starts
    // git it looks at the folder and the folders above it, and a folder there with the layout of a
    // bare repository is not handed to git (`gitDiscoveryMeetsBareShape`,
    // `src/merge/safeWrite.ts`). The row then read the working tree as unavailable, named three
    // other causes and said "git status here tells which": a plain git, typed in the folder the
    // engine had just kept from git. So the row states this cause as its own and gives no such
    // hint. The fixture is the shape the look's own cases seed (`test/merge/safeWrite.test.ts`):
    // an empty `HEAD` file beside empty `objects` and `refs` folders, with no `.git`. No git
    // opens it, and none is started.
    const root = await seedRepo(getRepo());
    await writeFile(join(root, "HEAD"), "", "utf8");
    await mkdir(join(root, "objects"));
    await mkdir(join(root, "refs"));

    const { code, doc } = await runJson(root);
    const git = row(doc, "git-available");

    expect(code).toBe(0);
    expect(git.status).toBe("warn");
    expect(git.detail).toContain("git was not started here");
    expect(git.detail).toContain("this folder, or a folder above it, has the layout of a bare repository");
    expect(git.detail).toContain("Look at the entries of this folder and of each folder above it by name");
    // review/57 and review/56: the row said "do not run git in it", the folder with the layout.
    // Git started in any folder under that one finds it as the engine's look does (the look refuses
    // a start folder two levels below it, `test/cli/engine/gitStatus.test.ts`), so the row covers
    // those folders too, the one the operator stands in included.
    expect(git.detail).toContain("do not run git in it or in any folder under it, this one included");
    // No hint to run git there, and none of the causes that are not this one.
    expect(git.detail).not.toContain("git status");
    expect(git.detail).not.toContain("tells which");
    expect(git.detail).not.toContain("no binary on PATH");
    expect(git.detail).not.toContain("slow to answer");
    // What follows from git not answering stays, in the row's own words.
    // TEST CHANGE, justified (run 2026-10-18_cloud-runs-2, review/245, review/247): the row named two verbs;
    // `plan check` and the `run` verbs exit 1 with no git work tree too (`src/cli/commands/plan.ts`
    // repositoryRoot, `src/cli/commands/run.ts`), so it names four, as README and getting-started do.
    expect(git.detail).toContain("Four verbs need git");
    expect(git.detail).toContain("plan and run exit 1 without it");
    expect(git.detail).toContain("worktree refuses without it");
    expect(git.detail).toContain("gate scan exits 1");
    // TEST CHANGE, justified (run 2026-10-14_cli-native, reattest/9): the row said the flows list
    // `secret scan: not run` here and that neither flow stops at this cause. Since 1.15.0 both
    // stop on the scan's reason (`content/commands/st-work.md`, BLOCKED_DEPENDENCY;
    // `content/commands/st-quick.md`, step 1, the batch), so the row now says they stop.
    expect(git.detail).toContain("/st-work stops the run as BLOCKED_DEPENDENCY and /st-quick stops the batch");
    expect(git.detail).not.toContain("secret scan: not run");
    expect(git.detail).not.toContain("Neither flow stops");
    expect(git.detail).toContain("sync's dirty-tree warning simply stays silent while git does not answer");
    // review/72: the row said what the flows list there, and not that a flow started there runs
    // git of its own: a flow's session and its sub-agents start git the engine does not, with no
    // look and neither option. The pages said to start no flow there; the row now says it too,
    // beside what it says of the scan. The row is compared whole.
    // TEST CHANGE, justified (reattest/9): the whole-row comparison moves with the sentence on
    // the flows above; the stop comes at the gate call, so git started before it still runs there.
    expect(git.detail).toBe(
      "git was not started here — this folder, or a folder above it, has the layout of a bare " +
        "repository (HEAD beside objects and refs, or beside commondir), met before any .git that " +
        "git stops at, so the engine did not hand it to git. Look at the entries of this folder " +
        "and of each folder above it by name to find that folder, and do not run git in it or in " +
        "any folder under it, this one included. " +
        "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, and gate reads every change from it, " +
        "so here gate scan exits 1 saying git was not started, and on that reason " +
        "/st-work stops the run as BLOCKED_DEPENDENCY and /st-quick stops the batch. " +
        "That stop comes at the gate call, and the git a flow's session and its sub-agents start " +
        "before it is not set to refuse such a folder as the engine's is, so start no flow here " +
        "until that folder is moved off this path. " +
        "sync's dirty-tree warning simply stays silent while git does not answer.",
    );
  });

  it("passes the git-available row, and warns of nothing, for a folder of that layout below the setup root", async () => {
    // Run 2026-10-11_release-1-14-0, review/79. The look is taken from the folder a verb runs in
    // and walks upward only, so a folder of the layout that sits below the setup root is met by no
    // look: git answers at the root and the row passes, with no word of that folder. The pages say
    // so, and this case holds them to it. The fixture is the shape above, one level down, in a
    // repository git opens at the root (made as the `setup green` case below makes its own); no
    // git is started in the folder with the layout.
    const root = await seedRepo(getRepo());
    await new Promise<void>((settle, reject) => {
      execFile("git", ["init", "-q"], { cwd: root }, (error) => (error === null ? settle() : reject(error)));
    });
    const below = join(root, "vendor", "mirror");
    await mkdir(join(below, "objects"), { recursive: true });
    await mkdir(join(below, "refs"));
    await writeFile(join(below, "HEAD"), "", "utf8");

    const { code, doc } = await runJson(root);
    const git = row(doc, "git-available");

    expect(code).toBe(0);
    expect(git.status).toBe("pass");
    expect(git.detail).not.toContain("bare repository");
    expect(git.detail).not.toContain("git was not started here");
  });
});

describe("check — a managed block copied into the preserved region", () => {
  /** The body of the block, and therefore the text a duplicate has to repeat. */
  const BODY = [
    "# Charter",
    "",
    "First paragraph of the block.",
    "",
    "Second paragraph of the block.",
  ].join("\n");

  /**
   * A managed file: the stamped block, then whatever the operator kept below
   * the END marker. The stamp is deliberately not this build's version — the
   * comparison strips the BEGIN line, so a duplicate is found whatever the
   * block was stamped with.
   */
  function managedFile(preserved: string): string {
    return [
      "<!-- STAMITY:BEGIN v0.0.1 -->",
      BODY,
      "<!-- STAMITY:END -->",
      "",
      preserved,
      "",
    ].join("\n");
  }

  /**
   * A pack-owned row, so the extra ledger entry is excluded from the reclaim
   * sweep and carries no recorded hash for `pack-integrity` to check. The
   * fixture's only finding is then the one each test names.
   */
  // TEST CHANGE, justified: REQ-PLUGIN-045 — the pack row moved into its own
  // pack folder as `infra`; `docs/managed-note.md` as a `rule` is refused.
  const MANAGED_NOTE = ".stamity/packs/demo/managed-note.md";
  const managedRow: LedgerEntry = {
    path: MANAGED_NOTE,
    adapter: packOwner("demo"),
    artifactId: "note",
    artifactType: "infra",
  };

  function seedManagedNote(preserved: string): Promise<string> {
    return seedRepo(getRepo(), {
      ledger: [managedRow],
      files: { [MANAGED_NOTE]: managedFile(preserved) },
    });
  }

  it("warns naming the file, the line the copy starts at, and the remedy", async () => {
    const root = await seedManagedNote(BODY);

    const { doc } = await runJson(root);

    // Line 9: the block occupies 1-7 (BEGIN, five body lines, END), line 8 is
    // the blank the preserved region opens with, and the copy starts under it.
    expect(row(doc, "preserved-duplicate").status).toBe("warn");
    expect(row(doc, "preserved-duplicate").detail).toContain(`${MANAGED_NOTE}:9`);
    expect(row(doc, "preserved-duplicate").detail).toContain("delete the copy");
  });

  it("finds a copy that was re-indented and re-wrapped", async () => {
    // Whitespace-insensitive on purpose: a paste that picked up indentation, or
    // a formatter that rewrapped it, is the same duplicate loaded twice.
    const root = await seedManagedNote(
      "  # Charter\n\n  First paragraph\n  of the block.\n\n  Second paragraph of the block.",
    );

    const { doc } = await runJson(root);

    expect(row(doc, "preserved-duplicate").status).toBe("warn");
    expect(row(doc, "preserved-duplicate").detail).toContain(`${MANAGED_NOTE}:9`);
  });

  it("passes a managed file whose preserved region is the operator's own text", async () => {
    const root = await seedManagedNote("Operator notes the engine never rewrites.");

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "preserved-duplicate").status).toBe("pass");
    expect(row(doc, "preserved-duplicate").detail).toContain("carry their block once");
  });

  it("passes a preserved region that quotes one paragraph of the block", async () => {
    // A reference, not a second copy: the whole body has to appear before the
    // row speaks, or every file that cites its own charter would warn forever.
    const root = await seedManagedNote("As the block above says: First paragraph of the block.");

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "preserved-duplicate").status).toBe("pass");
  });

  it("ignores a ledgered file that carries no managed block at all", async () => {
    const root = await seedRepo(getRepo(), {
      ledger: [managedRow],
      files: { [MANAGED_NOTE]: `${BODY}\n` },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "preserved-duplicate").status).toBe("pass");
    expect(row(doc, "preserved-duplicate").detail).not.toContain(MANAGED_NOTE);
  });

  it("never fails the run — deleting the copy is the operator's call", async () => {
    // The engine is contractually forbidden to touch the preserved region, so a
    // row that gated the exit code would be a permanent red nothing here can
    // clear.
    const root = await seedManagedNote(BODY);

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(row(doc, "preserved-duplicate").status).not.toBe("fail");
    expect(doc.doctor.filter((entry) => entry.status === "fail")).toEqual([]);
  });
});

describe("check — MCP credentials", () => {
  it("stays quiet when no MCP servers are selected", async () => {
    const root = await seedRepo(getRepo());

    const { doc } = await runJson(root);

    expect(row(doc, "env-mcp").status).toBe("pass");
    expect(row(doc, "env-mcp").detail).toContain("no MCP servers selected");
  });

  it("warns — and still exits 0 — while placeholders are unfilled", async () => {
    const root = await seedRepo(getRepo(), {
      mcpServers: ["github"],
      files: { ".env.mcp": "GITHUB_TOKEN=\nOTHER_TOKEN=\n" },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "env-mcp").status).toBe("warn");
    expect(row(doc, "env-mcp").detail).toContain("2 of 2");
    expect(row(doc, "env-mcp").detail).toContain("GITHUB_TOKEN");
  });

  it("passes once the credentials are filled, and never prints a value", async () => {
    const secret = "ghp_0123456789abcdefghijklmnopqrstuvwxyzAB";
    const root = await seedRepo(getRepo(), {
      mcpServers: ["github"],
      files: { ".env.mcp": `GITHUB_TOKEN=${secret}\n` },
    });

    const { code, doc } = await runJson(root);
    const human = await runHuman(root);

    expect(code).toBe(0);
    expect(row(doc, "env-mcp").status).toBe("pass");
    expect(JSON.stringify(doc)).not.toContain(secret);
    expect(human.stdout).not.toContain(secret);
  });

  it("warns when servers are selected but the credential file is absent", async () => {
    const root = await seedRepo(getRepo(), { mcpServers: ["github"] });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "env-mcp").status).toBe("warn");
    expect(row(doc, "env-mcp").detail).toContain(".env.mcp is absent");
  });
});

describe("check — the JSON envelope", () => {
  it("carries all four payload keys, and ok tracks the exit code in both directions", async () => {
    // The CI contract in one assertion: a pipeline reads `ok`, so `ok` and the
    // exit code must never be able to disagree. One repository, one mutation
    // between the two runs, so the flip is attributable to that mutation.
    const root = await seedRepo(getRepo(), {
      ledger: [
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the pack row moved into its own
        // pack folder as `infra`; `docs/gone.md` as a `skill` is refused.
        { path: ".stamity/packs/demo/gone.md", adapter: packOwner("demo"), artifactId: "gone", artifactType: "infra" },
      ],
      files: { ".stamity/packs/demo/gone.md": "# Guide\n" },
    });

    const healthy = await runJson(root);

    expect(healthy.code).toBe(0);
    expect(healthy.doc.ok).toBe(true);
    expect(healthy.doc.command).toBe("check");
    expect(healthy.doc.version).toBe(createApp().version);
    expect(Object.keys(healthy.doc)).toEqual(
      expect.arrayContaining(["doctor", "drift", "provenance", "ok"]),
    );
    expect(healthy.doc.doctor.length).toBeGreaterThan(0);
    expect(healthy.doc.drift).not.toBeNull();
    expect(healthy.doc.provenance).not.toBeNull();

    await rm(join(root, ".stamity/packs/demo/gone.md"));
    const failing = await runJson(root);

    expect(failing.code).toBe(1);
    expect(failing.doc.ok).toBe(false);
    expect(failing.doc.command).toBe("check");
    // A failure envelope must still carry the full report: the run answered
    // every question, and `ok:false` is one of its answers, not a substitute
    // for the rest (a thrown failure would have replaced this with `error`).
    expect(failing.doc.doctor.length).toBe(healthy.doc.doctor.length);
    expect(failing.doc.drift?.missing).toEqual([".stamity/packs/demo/gone.md"]);
    expect(failing.doc.provenance).not.toBeNull();
  });
});

describe("check — manifest schema tolerance", () => {
  it("runs the drift gate normally for a same-major schema version with no migration", async () => {
    // MANIFEST_VERSION is 1.0.0 and the migration registry is empty, so the
    // no-migration path is seeded from the other side of the same major: only a
    // MAJOR-newer manifest is refused, and that refusal lives in the engine.
    const root = await seedRepo(getRepo(), { version: "1.1.0" });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "manifest").status).toBe("pass");
    expect(row(doc, "manifest").detail).toContain("schema 1.1.0");
    expect(doc.drift?.clean).toBe(true);
    expect(doc.provenance?.manifestVersion).toBe("1.1.0");
  });
});

describe("check — installed pack integrity", () => {
  /** An installed pack: bytes on disk plus the ledger row the install records. */
  async function seedInstalledPack(
    handle: TempDirHandle,
    body: string,
  ): Promise<{ root: string; relPath: string }> {
    const relPath = `${STATE_DIR}/packs/demo/agents/stamity-demo.md`;
    const root = await seedRepo(handle, {
      ledger: [
        {
          path: relPath,
          adapter: packOwner("demo"),
          artifactId: "demo",
          // TEST CHANGE, justified: REQ-PLUGIN-045 — a pack row is `infra` in
          // its own folder, as the installer records it; `agent` is refused.
          artifactType: "infra",
          contentHash: createHash("sha256").update(body).digest("hex"),
        },
      ],
      files: { [relPath]: body },
    });
    return { root, relPath };
  }

  it("passes while the installed bytes still match what the install recorded", async () => {
    const { root } = await seedInstalledPack(getRepo(), "# demo agent\n");

    const { doc } = await runJson(root);

    expect(row(doc, "pack-integrity").status).toBe("pass");
    expect(row(doc, "pack-integrity").detail).toContain("still match the hashes recorded");
  });

  it("fails naming the pack when a pack body was edited after install, and the remedy is NOT sync", async () => {
    // The failure nothing else on this screen can see. Drift reports an edited
    // pack body as ordinary regeneration drift, and the remedy drift recommends
    // — `sync` — carries the edited bytes into the generated setup, laundering
    // the tamper. This row speaks integrity vocabulary and points elsewhere.
    const handle = getRepo();
    const { root, relPath } = await seedInstalledPack(handle, "# demo agent\n");
    await writeFile(join(root, relPath), "# demo agent\nplus something nobody installed\n", "utf8");

    const { code, doc } = await runJson(root);
    const human = await runHuman(root);

    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    const integrity = row(doc, "pack-integrity");
    expect(integrity.status).toBe("fail");
    expect(integrity.detail).toContain("demo");
    expect(integrity.detail).toContain(relPath);
    expect(integrity.detail).toContain("This is not regeneration drift");

    // The next-step block must not send the operator to the verb that spreads it.
    const nextBlock = human.stdout.slice(human.stdout.indexOf("next:"));
    // TEST CHANGE (sw26-engine-cli-call-form): the remedy is `packageCommand`'s
    // pinned call, so `stamity clean` no longer reads as one substring.
    expect(nextBlock).toContain(npxCommand("clean --pack"));
    expect(nextBlock).toContain("do not run sync first");
    // TEST CHANGE, justified (prove/6): 2026-10-06. "clean --pack then add"
    // failed at add for a synced pack: its client copies stay owned until a
    // sync. Sync still never runs before clean; after clean it runs, then add,
    // then sync.
    // TEST CHANGE, justified (review/59): 2026-10-06. `add <id>` re-adds only a
    // catalog pack; the step names the source the pack's receipt records,
    // which each finding line spells and this block calls <source>.
    // TEST CHANGE, justified (2026-10-08, review/71, the lane D fixer): `clean --pack`
    // keeps and names a client copy it cannot prove — the moved file's own among them —
    // so the order gains the step by hand that deletes it before the `sync`. The four
    // commands and their order hold (upgradeRemedy.test.ts walks it to a green check).
    expect(nextBlock).toContain(
      `${npxCommand("clean --pack <id>")}, then delete by hand each client copy it keeps and ` +
        `names, unless it is yours, then ${npxCommand("sync")}, then ` +
        `${npxCommand("add <source>")}, then ${npxCommand("sync")}`,
    );
  });

  it("says in the next step what clean --pack and sync each do, not that sync removes the copies", async () => {
    // The step's closing reason said "after clean, sync only removes the pack's client copies,
    // which add would otherwise find still owned". Since plan 019 file 1 `clean --pack` removes
    // those copies itself, keeping and naming one it cannot prove, and the `sync` after it
    // deletes none: it regenerates the clients' files without the pack, as `clean --pack`'s own
    // next step says (walked on the built CLI on 2026-10-11, run 2026-10-11_release-1-14-0,
    // unit f1-printed-remedies: 18 copies deleted by `clean --pack`, 2 kept and named, then a
    // `sync` of 0 created, 2 updated and no file removed).
    const handle = getRepo();
    const { root, relPath } = await seedInstalledPack(handle, "# demo agent\n");
    await writeFile(join(root, relPath), "# demo agent\nplus something nobody installed\n", "utf8");

    const human = await runHuman(root);

    const nextBlock = human.stdout.slice(human.stdout.indexOf("next:"));
    expect(nextBlock).not.toContain("sync only removes the pack's client copies");
    expect(nextBlock).not.toContain("which add would otherwise find still owned");
    expect(nextBlock).toContain(
      "clean --pack removes the pack's client copies itself and keeps and names any it cannot " +
        "prove, and the sync after it regenerates the clients' files without the pack",
    );
    // The instruction this reason follows does not move.
    expect(nextBlock).toContain(
      "do not run sync first: it would carry the current bytes into the generated setup",
    );
  });

  it("reports a pack file that was deleted after install", async () => {
    const handle = getRepo();
    const { root, relPath } = await seedInstalledPack(handle, "# demo agent\n");
    await rm(join(root, relPath));

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    expect(row(doc, "pack-integrity").status).toBe("fail");
    expect(row(doc, "pack-integrity").detail).toContain("is missing from the repo");
  });

  it("still fails a tampered catalog-installed pack when the bundled catalog cannot be derived", async () => {
    // review/12: the row reads the catalog after it has found the tampering, to
    // name the re-add source. The catalog is derived on first use, so a packs
    // folder that fails its derivation throws there; the row must still fail,
    // naming no source, rather than letting `guarded` turn it into a `warn`
    // and `check` exit 0 on tampered bytes.
    const handle = getRepo();
    const relPath = `${STATE_DIR}/packs/demo/agents/stamity-demo.md`;
    const receiptPath = receiptRelPath("demo");
    const receiptBody = `${JSON.stringify({
      source: { kind: "catalog-pinned", spec: "demo" },
      trustTier: "curator-verified",
    })}\n`;
    const body = "# demo agent\n";
    const hashOf = (text: string): string => createHash("sha256").update(text).digest("hex");
    const root = await seedRepo(handle, {
      ledger: [relPath, receiptPath].map((path) => ({
        path,
        adapter: packOwner("demo"),
        artifactId: "demo",
        artifactType: "infra" as const,
        contentHash: hashOf(path === relPath ? body : receiptBody),
      })),
      files: { [relPath]: body, [receiptPath]: receiptBody },
    });
    await writeFile(join(root, relPath), `${body}plus something nobody installed\n`, "utf8");

    // A pseudo package whose packs folder holds a pack with no pin, so the
    // catalog's derivation refuses. Only the catalog's own package-root walk is
    // redirected; a fresh module graph means no catalog was memoized before.
    const pseudoInstall = handle.path("pseudo-install");
    await mkdir(join(pseudoInstall, "packs", "unpinned"), { recursive: true });
    await writeFile(
      join(pseudoInstall, "packs", "unpinned", "pack.json"),
      `${JSON.stringify({
        name: "unpinned",
        version: "0.0.1",
        description: "no pin",
        integrity: {},
      })}\n`,
    );
    const packDir = join("src", "pack");
    vi.resetModules();
    vi.doMock("../../../src/shared/paths.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof PathsApi>();
      return {
        ...actual,
        findPackageRoot: (from: string): string =>
          from.endsWith(packDir) ? pseudoInstall : actual.findPackageRoot(from),
      };
    });
    try {
      const fresh = await import("../../../src/cli/commands/check.ts");
      const freshCatalog = await import("../../../src/pack/curated.ts");
      const { __setContentRootForTests: pinFreshCorpus } = await import(
        "../../../src/content/contentRoot.ts"
      );
      pinFreshCorpus(handle.path("corpus"));
      // The fixture is the broken catalog it claims to be.
      expect(() => freshCatalog.lookupCatalogEntry("demo")).toThrow(/no pin in catalogPins/);

      const result = await runInProcess([fresh.checkCommand], ["check", "--json"], { cwd: root });

      expect(result.code).toBe(1);
      const doc = JSON.parse(result.stdout.trim()) as Envelope;
      expect(doc.ok).toBe(false);
      const integrity = row(doc, "pack-integrity");
      expect(integrity.status).toBe("fail");
      expect(integrity.detail).toContain(relPath);
    } finally {
      vi.doUnmock("../../../src/shared/paths.ts");
      vi.resetModules();
    }
  });

  it("does no work, and says so, when nothing is installed", async () => {
    const root = await seedRepo(getRepo());

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "pack-integrity").status).toBe("pass");
    expect(row(doc, "pack-integrity").detail).toContain("no installed pack content");
  });
});

describe("check — a drift gate that cannot run", () => {
  /**
   * A repo whose manifest is readable and whose plan is not. The manifest names
   * a content selection the corpus cannot satisfy — core emission refuses an
   * absent charter outright (`src/content/charter.ts`) — so `planSync` throws
   * with a real, diagnosable message while every doctor probe still answers.
   * That is exactly the shape a pack bricking projection produces, and the
   * shape the old wide swallow reported as "the manifest has to be readable
   * first" two lines under a `manifest` row reading `ok`.
   */
  async function seedUnplannableRepo(handle: TempDirHandle): Promise<string> {
    const root = await seedRepo(handle);
    // Remove the charter AFTER the fixture sync, so the manifest and the
    // emitted files are real and only the NEXT plan fails.
    await rm(handle.path("corpus"), { recursive: true, force: true });
    return root;
  }

  it("exits 1, keeps the manifest row passing, and reports the true reason", async () => {
    const handle = getRepo();
    const root = await seedUnplannableRepo(handle);

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    // The manifest IS readable, and the row keeps saying so — the old message
    // told the operator to fix the one thing that was demonstrably fine.
    expect(row(doc, "manifest").status).toBe("pass");
    expect(doc.drift).toBeNull();
    expect(doc.driftStatus).toBe("failed");
    // The cause reaches a machine caller as an error document.
    const error = doc.error as { code: string; message: string; why: string; next: string };
    expect(error.message).toContain("could not evaluate drift");
    expect(error.why.length).toBeGreaterThan(0);
    // TEST CHANGE (sw26-engine-cli-call-form): the pinned re-run call.
    expect(error.next).toContain(npxCommand("check"));
  });

  it("never prints `all green` while the run exits non-zero, and names the stopped mechanism", async () => {
    const handle = getRepo();
    const root = await seedUnplannableRepo(handle);

    const result = await runHuman(root);

    expect(result.code).toBe(1);
    // The contradiction this closes: a human read "all green — nothing to do"
    // off the same screen a CI job read exit 1 from, and the human was wrong.
    expect(result.stdout).not.toContain("all green");
    expect(result.stdout).toContain("drift: not evaluated");
    // Not just "no verdict": drift detection is the mechanism that catches a
    // generated file being edited, and the screen has to say it has stopped.
    expect(result.stdout).toContain("tampering with a generated file would NOT be detected");
    expect(result.stdout).toContain("next:");
  });

  /**
   * A repo whose only defect is a malformed overlay
   * (docs/specs/overlay-layers.md, REQ-OVERLAY-009).
   *
   * Decision-13 parity, held at the screen rather than only at the walk: an
   * overlay defect throws out of the content walk exactly as a malformed
   * override does, so `sync` stops and `check` has no verdict to print. Without
   * this case the walk's refusal is proven and its CONSEQUENCE is not — and the
   * consequence is what an operator meets, since a `check` that swallowed the
   * throw and printed a clean verdict would be reporting on an index that was
   * never built.
   *
   * The corpus rule is seeded BEFORE the fixture sync and the overlay AFTER it,
   * for the reason {@link seedUnplannableRepo} removes the charter after its
   * own: the manifest and the emitted files stay real, so only the NEXT plan
   * fails and every doctor probe still answers.
   */
  const HOUSE_RULE_FIXTURE = [
    "---",
    "id: house",
    "type: rule",
    "description: fixture house rule",
    "tags: [review]",
    "load: on-demand",
    "obsolete_when: fixture trigger",
    "scope: conditional",
    // Fixture data kept out of the test-input census: the glob is built at run time, as a literal it names every tracked .md.
    `globs: ["${["**/*", "md"].join(".")}"]`,
    "---",
    "",
    "# House",
    "",
    "House rule body.",
    "",
  ].join("\n");

  /** The overlay half, addressed at the corpus rule above and not parseable. */
  const MALFORMED_OVERLAY = ".stamity/overrides/rules/house.customize.yaml";

  async function seedMalformedOverlayRepo(handle: TempDirHandle): Promise<string> {
    await handle.seedFiles({ "corpus/rules/stamity-house.md": HOUSE_RULE_FIXTURE });
    const root = await seedRepo(handle);
    await handle.seedFiles({ [MALFORMED_OVERLAY]: "description: [unterminated\n" });
    return root;
  }

  it("reports a malformed overlay as `drift: not evaluated`, naming the overlay file", async () => {
    const handle = getRepo();
    const root = await seedMalformedOverlayRepo(handle);

    const { code, doc } = await runJson(root);
    const human = await runHuman(root);

    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    // The manifest and every other probe are fine; the one broken thing is the
    // patch, and the screen says so instead of blaming the manifest.
    expect(row(doc, "manifest").status).toBe("pass");
    expect(doc.drift).toBeNull();
    expect(doc.driftStatus).toBe("failed");

    // Fail-closed, naming the file: the refusal the walk raises survives all the
    // way to the operator rather than being flattened into "the plan failed".
    const error = doc.error as { code: string; message: string; why: string; next: string };
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toContain("could not evaluate drift");
    expect(error.why).toContain("house.customize.yaml");

    // And the human screen carries the same verdict, never a green close.
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("drift: not evaluated");
    expect(human.stdout).not.toContain("all green");
  });

  it("evaluates drift normally once the overlay parses", async () => {
    // The other side of the same fixture: the corpus rule and a WELL-FORMED
    // overlay over it, so the case above is failing on the defect rather than
    // on the presence of an override tree or of a patched artifact at all.
    const handle = getRepo();
    await handle.seedFiles({ "corpus/rules/stamity-house.md": HOUSE_RULE_FIXTURE });
    const root = await seedRepo(handle);
    await handle.seedFiles({
      ".stamity/overrides/rules/house.customize.md": "House addendum.\n",
    });

    const { doc } = await runJson(root);

    expect(doc.driftStatus).toBe("evaluated");
    expect(doc.drift).not.toBeNull();
  });

  it("still says `the manifest has to be readable first` when that IS the reason", async () => {
    // The narrow swallow that survives: an un-initialised repo. The `manifest`
    // row owns that message with its fix, so drift does not repeat it as a
    // second failure — it points at the row.
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    const { code, doc } = await runJson(handle.dir);

    expect(code).toBe(1);
    expect(doc.driftStatus).toBe("no-manifest");
    expect(doc.drift).toBeNull();
    const human = await runHuman(handle.dir);
    expect(human.stdout).toContain("drift: not evaluated");
    expect(human.stdout).toContain("manifest row above");
    expect(human.stdout).not.toContain("all green");
  });

  it("keeps printing the green close, naming the unrun gates, for a genuinely green run", async () => {
    // The temp fixture is not a git repository, so `git-available` warns — the
    // green close is therefore the advisory variant, and the exit is still 0.
    // Both halves matter: the honesty rule must not have made a passing run
    // print a `next:` list it has nothing to put in.
    const root = await seedRepo(getRepo());

    const result = await runHuman(root);

    expect(result.code).toBe(0);
    // TEST CHANGE, justified (REQ-FLOW-008, plan 013 sw04-check-names-unrun-gates): the
    // advisory close no longer says "nothing to do" — check runs no gate, so it names the
    // three it did not run. What this case guards is unchanged: a green run exits 0 on the
    // advisory close and never prints a `next:` list.
    expect(result.stdout).toMatch(/ok — \d+ advisory warning\(s\) above; gates not run: lint, typecheck, test/);
    expect(result.stdout).not.toContain("next:");
  });
});

/**
 * `claude-hook-shell` (prove/190, prove/242): the anchored Claude hook commands cannot launch
 * under Claude Code's PowerShell fallback — a Windows host with no Git Bash — and the guard is
 * then silently disarmed. The render cannot serve both shells, so `check` says so on that host.
 * The failing branch cannot be reached in-process on a POSIX host, so the platform and the
 * environment are injected, and every place the row probes is a real file under the fixture,
 * not a mock.
 *
 * TEST CHANGE, justified (2026-09-22, audit Critical): the row used to pass on any `bash.exe` on
 * PATH and on any existing path in `CLAUDE_CODE_GIT_BASH_PATH`, neither of which is where the
 * client looks. The vendor's troubleshoot-install page (read 2026-09-22) states the client's
 * order — the variable, honoured only for a file named `bash.exe`, `sh.exe`, `bash` or `sh`; the
 * default install locations `C:\Program Files\Git` and `C:\Program Files (x86)\Git`; the `git` on
 * PATH, "using the `bin\bash.exe` from that Git installation" — so the cases below are those
 * three places and the two false verdicts the old probe gave: a default Git for Windows install
 * has `git.exe` on PATH and no `bash.exe` there (a false FAIL), and an MSYS2 or Cygwin `bash.exe`
 * on PATH is one the client never finds (a false PASS).
 */
describe("check — claude-hook-shell", () => {
  const claude = { tools: ["claude"], ledger: [], plugin: undefined } as unknown as SetupManifest;

  it("passes with a note on every host that is not Windows, whatever the manifest says", () => {
    for (const platform of ["darwin", "linux"] as const) {
      const verdict = checkClaudeHookShell(claude, { platform, env: { PATH: "" } });
      expect(verdict.id).toBe("claude-hook-shell");
      expect(verdict.status, platform).toBe("pass");
      expect(verdict.detail).toContain("not a Windows host");
    }
  });

  it("fails on win32 with Git Bash in none of the three places the client looks, naming them and the remedy", () => {
    const handle = getRepo();
    const verdict = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, ["C:\\nothing", handle.path("no-bash")]),
    });
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain(
      "the anchored hook commands need Git Bash on Windows; without it the pre-tool-use guard does not launch and the client does not block",
    );
    expect(verdict.detail).toContain("PowerShell");
    // The three places, in the client's order, then the remedy.
    expect(verdict.detail).toContain("CLAUDE_CODE_GIT_BASH_PATH naming a file called bash.exe, sh.exe, bash or sh");
    expect(verdict.detail).toContain(
      `bin\\bash.exe under the default install locations ${join(handle.path("program-files"), "Git")} and ${join(handle.path("program-files-x86"), "Git")}`,
    );
    expect(verdict.detail).toContain("bin\\bash.exe beside a git.exe on PATH");
    expect(verdict.detail).toContain("Install Git for Windows (Git Bash), or set CLAUDE_CODE_GIT_BASH_PATH to its bin\\bash.exe");
    // The row reads the environment only: a settings.json value reaches the client, not this shell.
    expect(verdict.detail).toContain("not a shell that runs stamity check outside a Claude session");
    expect(verdict.detail).not.toContain("and so does this row");
  });

  it("passes on a default install location with nothing on PATH, naming it", async () => {
    // Step 1 of the client's search when the variable is unset: `C:\Program Files\Git` and
    // `C:\Program Files (x86)\Git`. Git for Windows' installer puts only `<Git>\cmd` on PATH by
    // default, so this — not a `bash.exe` on PATH — is how a default install is found.
    const handle = getRepo();
    await handle.seedFiles({ "program-files/Git/bin/bash.exe": "" });
    const found = checkClaudeHookShell(claude, { platform: "win32", env: windowsEnv(handle, []) });
    expect(found.status).toBe("pass");
    expect(found.detail).toContain(
      `Git Bash at ${handle.path("program-files/Git/bin/bash.exe")}, a default install location`,
    );
    // The x86 root, probed second, on its own.
    await handle.seedFiles({ "program-files-x86/Git/bin/bash.exe": "" });
    const x86 = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [], { ProgramFiles: handle.path("program-files-empty") }),
    });
    expect(x86.status).toBe("pass");
    expect(x86.detail).toContain(
      `Git Bash at ${handle.path("program-files-x86/Git/bin/bash.exe")}, a default install location`,
    );
  });

  it("passes on the git on PATH, reading bin\\bash.exe from that installation, for the cmd and the bin layouts", async () => {
    // Step 2: "The `git` on your `PATH`, using the `bin\bash.exe` from that Git installation".
    // The default layout puts `<Git>\cmd\git.exe` on PATH with `bin\bash.exe` beside `cmd`; an
    // operator who put `<Git>\bin` on PATH instead has both in the one directory.
    const handle = getRepo();
    await handle.seedFiles({ "elsewhere/Git/cmd/git.exe": "", "elsewhere/Git/bin/bash.exe": "" });
    const cmd = handle.path("elsewhere/Git/cmd");
    const viaCmd = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, ["C:\\nothing", cmd]),
    });
    expect(viaCmd.status).toBe("pass");
    expect(viaCmd.detail).toContain(
      `Git Bash at ${handle.path("elsewhere/Git/bin/bash.exe")}, beside the git.exe on PATH at ${join(cmd, "git.exe")}`,
    );
    await handle.seedFiles({ "portable/Git/bin/git.exe": "", "portable/Git/bin/bash.exe": "" });
    const bin = handle.path("portable/Git/bin");
    const viaBin = checkClaudeHookShell(claude, { platform: "win32", env: windowsEnv(handle, [bin]) });
    expect(viaBin.status).toBe("pass");
    expect(viaBin.detail).toContain(
      `Git Bash at ${join(bin, "bash.exe")}, beside the git.exe on PATH at ${join(bin, "git.exe")}`,
    );
  });

  it("strips a surrounding quote pair from a PATH entry before probing, as the spawner does", async () => {
    // A quoted entry is legal on Windows and libuv strips the pair when it walks PATH to spawn;
    // probing the quoted spelling would have been a false FAIL on such a host.
    const handle = getRepo();
    await handle.seedFiles({ "quoted/Git/cmd/git.exe": "", "quoted/Git/bin/bash.exe": "" });
    const verdict = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [`"${handle.path("quoted/Git/cmd")}"`]),
    });
    expect(verdict.status).toBe("pass");
    expect(verdict.detail).toContain(`Git Bash at ${handle.path("quoted/Git/bin/bash.exe")}`);
  });

  it("fails on a bare bash.exe on PATH with no git.exe beside it — MSYS2 or Cygwin without git, WSL", async () => {
    // The false PASS the old probe gave, on the exact host the row exists to report: a bare
    // `bash.exe` on PATH is not in the client's list, so the client falls back to PowerShell while
    // the row said found. WSL's `%SystemRoot%\System32\bash.exe` (prove/251) is the same case now
    // and needs no exclusion of its own — the row no longer reads `SystemRoot`, so none is set
    // here; both are named as not counting. A `bin` entry holding both `git.exe` and `bash.exe`
    // (Cygwin's `bin`, MSYS2's `usr\bin` with git) is NOT this case: it passes as the shell beside
    // the git on PATH, the `bin` layout of the case above, and whether the client resolves it the
    // same way is unmeasured.
    const handle = getRepo();
    await handle.seedFiles({ "msys64/usr/bin/bash.exe": "", "windows/System32/bash.exe": "" });
    const msys = handle.path("msys64/usr/bin");
    const system32 = handle.path("windows/System32");
    const verdict = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [msys, system32]),
    });
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain(
      `the client does not look for a bare bash.exe on PATH, so ${join(msys, "bash.exe")} and ${join(system32, "bash.exe")} do not count`,
    );
  });

  it("fails on a git.exe on PATH with no bin\\bash.exe beside it, naming it and the variable", async () => {
    // A shim (Scoop's `shims\git.exe`) or a relocated layout: the row finds the git and no shell
    // from it, and says only what it measured — the client's own derivation is unstated.
    const handle = getRepo();
    await handle.seedFiles({ "shims/git.exe": "" });
    const shims = handle.path("shims");
    const verdict = checkClaudeHookShell(claude, { platform: "win32", env: windowsEnv(handle, [shims]) });
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain(
      `the git.exe on PATH at ${join(shims, "git.exe")}: this row found no bin\\bash.exe beside it (looked at ${join(shims, "..", "bin", "bash.exe")}); a shimmed or relocated git may still be resolved by the client — set CLAUDE_CODE_GIT_BASH_PATH to be sure`,
    );
  });

  it("ignores CLAUDE_CODE_GIT_BASH_PATH naming a directory, as the client does, and lets the other places decide", async () => {
    // The page: "Claude Code accepts only a file named `bash.exe`, `sh.exe`, `bash`, or `sh`; with
    // any other name … it ignores the variable and auto-detects Git Bash as if it were unset". A
    // directory is no such file, and the old probe's `existsSync` took one.
    const handle = getRepo();
    await handle.seedFiles({ "program-files/Git/bin/bash.exe": "" });
    const directory = handle.path("program-files/Git");
    const ignoredNote = `CLAUDE_CODE_GIT_BASH_PATH names ${directory}, which is not a file, so the client ignores it and looks on as if it were unset`;
    // Ignored, then the default location passes — and the pass still says the variable was ignored.
    const decided = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [], { CLAUDE_CODE_GIT_BASH_PATH: directory }),
    });
    expect(decided.status).toBe("pass");
    expect(decided.detail).toContain(
      `Git Bash at ${handle.path("program-files/Git/bin/bash.exe")}, a default install location`,
    );
    expect(decided.detail).toContain(ignoredNote);
    // Ignored, and nothing else found: the fail carries the same note, not a verdict on the
    // variable alone.
    const alone = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [], {
        CLAUDE_CODE_GIT_BASH_PATH: directory,
        ProgramFiles: handle.path("program-files-empty"),
      }),
    });
    expect(alone.status).toBe("fail");
    expect(alone.detail).toContain(ignoredNote);
  });

  it("ignores CLAUDE_CODE_GIT_BASH_PATH naming git-bash.exe or a missing path, as the client does", async () => {
    // "any other name, such as Git for Windows' `git-bash.exe` launcher" is ignored, and "A path
    // that doesn't exist gets the same fallback".
    const handle = getRepo();
    await handle.seedFiles({ "launcher/Git/git-bash.exe": "" });
    const launcher = handle.path("launcher/Git/git-bash.exe");
    const byName = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [], { CLAUDE_CODE_GIT_BASH_PATH: launcher }),
    });
    expect(byName.status).toBe("fail");
    expect(byName.detail).toContain(
      `CLAUDE_CODE_GIT_BASH_PATH names ${launcher}, which is not named bash.exe, sh.exe, bash or sh, so the client ignores it and looks on as if it were unset`,
    );
    const missing = handle.path("launcher/nowhere/bash.exe");
    const absent = checkClaudeHookShell(claude, {
      platform: "win32",
      env: windowsEnv(handle, [], { CLAUDE_CODE_GIT_BASH_PATH: missing }),
    });
    expect(absent.status).toBe("fail");
    expect(absent.detail).toContain(
      `CLAUDE_CODE_GIT_BASH_PATH names ${missing}, which does not exist, so the client ignores it and looks on as if it were unset`,
    );
  });

  it("honours CLAUDE_CODE_GIT_BASH_PATH naming an existing file the client accepts, before any other place", async () => {
    // `bash.exe`, `sh.exe`, `sh`, and a name in any case — a real file each; PATH empty and the
    // default locations pinned empty, so only the variable can pass.
    const handle = getRepo();
    const names = [
      "configured/Git/bin/bash.exe",
      "configured/Git/bin/sh.exe",
      "configured/Git/usr/bin/BASH.EXE",
      "configured/Git/usr/bin/sh",
    ];
    await handle.seedFiles(Object.fromEntries(names.map((name) => [name, ""])));
    for (const name of names) {
      const named = handle.path(name);
      const verdict = checkClaudeHookShell(claude, {
        platform: "win32",
        env: windowsEnv(handle, [], { CLAUDE_CODE_GIT_BASH_PATH: named }),
      });
      expect(verdict.status, name).toBe("pass");
      expect(verdict.detail, name).toContain(`Git Bash at ${named}, named by CLAUDE_CODE_GIT_BASH_PATH`);
    }
  });

  it("reads PATH by any spelling of the key, as Windows spells it Path", async () => {
    // prove/261: on windows-latest the row saw no PATH at all — the real variable is `Path`, and a
    // plain object copied from process.env does not answer case-insensitively — so the real doctor
    // failed on every healthy repository. Branch covered: the `/^path$/i` key lookup, on the git
    // layout the client reads. No `PATH` key at all here, so only `Path` can carry the entry.
    const handle = getRepo();
    await handle.seedFiles({ "spelled/Git/cmd/git.exe": "", "spelled/Git/bin/bash.exe": "" });
    const verdict = checkClaudeHookShell(claude, {
      platform: "win32",
      env: {
        ProgramFiles: handle.path("program-files"),
        "ProgramFiles(x86)": handle.path("program-files-x86"),
        Path: handle.path("spelled/Git/cmd"),
      },
    });
    expect(verdict.status).toBe("pass");
    expect(verdict.detail).toContain(`Git Bash at ${handle.path("spelled/Git/bin/bash.exe")}`);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
  // plugin-owned-hooks half left with the `plugin-backed` mode. A held 1.14 block that
  // still names claude's hooks no longer releases the row: this engine emits those hooks.
  it("passes with a note on win32 when claude is not targeted, and a held plugin block releases nothing", () => {
    const none = checkClaudeHookShell({ ...claude, tools: ["cursor"] } as SetupManifest, { platform: "win32", env: { PATH: "" } });
    expect(none.status).toBe("pass");
    expect(none.detail).toContain("claude is not a target tool");
    const held = {
      ...claude,
      plugin: { mode: "plugin-backed", clients: { claude: { version: "1.14.0", classes: ["hooks"] } } },
    } as unknown as SetupManifest;
    const host = { platform: "win32", env: { PATH: "" } } as const;
    // The same verdict a manifest with no block gets on this host — on a POSIX host a fail,
    // since nothing here holds Git Bash; the 1.14 reading passed with a plugin note.
    expect(checkClaudeHookShell(held, host)).toEqual(checkClaudeHookShell(claude, host));
    expect(checkClaudeHookShell(held, host).detail).not.toContain("plugin");
  });

  it("is a row of the real doctor, passing on this host", async () => {
    const root = await seedRepo(getRepo());
    const verdict = await doctorRow(root, "claude-hook-shell");
    // This suite never runs the failing branch for real. On POSIX the row passes on the platform;
    // on the CI Windows leg it passes on the found case, reading the HOST's process.env (the app
    // env handed in here is `{}`, which is why the row reads the host and not the seam — prove/261)
    // where windows-latest carries Git for Windows at the default install location.
    expect(verdict.status).toBe("pass");
  });
});

/**
 * A Windows host's environment as the row reads it: PATH from the entries given, joined on
 * the HOST's delimiter (the probe splits on it, and this suite runs on the host's), and the
 * two Program Files roots pinned under the fixture. The pin matters on the CI Windows leg: the
 * row falls back to the literal `C:\Program Files` when a root is unset, that literal holds a
 * real Git there, and a fail case that left the roots unset would pass for the wrong reason.
 */
function windowsEnv(
  handle: TempDirHandle,
  entries: readonly string[],
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ProgramFiles: handle.path("program-files"),
    "ProgramFiles(x86)": handle.path("program-files-x86"),
    PATH: entries.join(delimiter),
    ...extra,
  };
}

/** One named doctor row off a fresh run, with the environment pinned. */
async function doctorRow(
  root: string,
  id: string,
  env: Record<string, string | undefined> = {},
): Promise<DoctorCheck> {
  const doctor = await runDoctor(root, createEngine(), createApp({ cwd: root, env }));
  const found = doctor.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no doctor row ${id}`);
  return found;
}

/**
 * A Node repository as detection reads it: a `package.json` declaring the three scripts, so
 * the charter's gates are `npm run lint`, `npm run typecheck` and `npm run test`. Without it
 * the fixture detects nothing and every gate renders as the `unknown` sentence.
 */
const NODE_REPO = {
  "package.json": `${JSON.stringify({
    name: "fixture",
    private: true,
    scripts: { lint: "eslint .", typecheck: "tsc --noEmit", test: "vitest run" },
  })}\n`,
};

/**
 * A directory holding runnable stand-ins for `names`: the bare POSIX script, executable,
 * and the `.cmd` twin a Windows leg resolves through `PATHEXT`. Their bodies never run —
 * `check` only looks for them.
 */
async function toolDir(
  handle: TempDirHandle,
  dir: string,
  names: readonly string[],
): Promise<string> {
  await handle.seedFiles(
    Object.fromEntries(
      names.flatMap((name) => [
        [`${dir}/${name}`, "#!/bin/sh\nexit 0\n"],
        [`${dir}/${name}.cmd`, "@exit /b 0\r\n"],
      ]),
    ),
  );
  await Promise.all(names.map((name) => chmod(handle.path(dir, name), 0o755)));
  return handle.path(dir);
}

/** An env whose PATH holds exactly `dirs`, in the host's own list syntax. */
const pathEnv = (...dirs: string[]): Record<string, string> => ({ PATH: dirs.join(delimiter) });

/** A Node fixture that pins the test gate to a bare `pytest`. */
async function pinnedPytest(handle: TempDirHandle): Promise<SetupManifest> {
  const root = await seedRepo(handle, { repoFiles: NODE_REPO, gates: { test: "pytest" } });
  const manifest = await readManifest(root);
  if (manifest === null) throw new Error("the fixture wrote no manifest");
  return manifest;
}

/**
 * The gates `check` does not run (REQ-FLOW-008, plan 013 sw04-check-names-unrun-gates).
 *
 * `check` answers about the SETUP, and its green close used to read "all green — nothing to
 * do": an operator took that for a verified tree while no lint, type check or test had run.
 * The close now names the three charter gates it did not run, and a gate the charter names
 * but this machine cannot resolve gets its own warning line — resolved by reading the file
 * system, never by spawning.
 *
 * Every command-level case pins `PATH` in the injected env, so a gate's verdict is a
 * statement about the fixture rather than about the shell the suite was started from.
 */
describe("check — the gates it did not run (REQ-FLOW-008)", () => {
  /** Kinds in the order `check` reports them; `all` reads as `full-gate` (verificationGates.ts). */
  const ALL_KINDS = ["lint", "typecheck", "test", "full-gate"];

  it("names the three gates it did not run on a clean repo, never says all green, and exits 0", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { repoFiles: NODE_REPO });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const human = await runHuman(root, env);
    const { code, doc } = await runJson(root, env);

    expect(human.code).toBe(0);
    expect(human.stdout).toContain("gates not run: lint, typecheck, test (check runs no gate)");
    expect(human.stdout).not.toMatch(/all green/);
    expect(human.stdout).not.toContain("cannot be resolved");
    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(doc.gates).toEqual({ notRun: ["lint", "typecheck", "test"], unresolved: [] });
  });

  it("closes on `setup green` when nothing is advisory, as the troubleshooting sample shows", async () => {
    // The sample transcript's closing line is a claim about output, held to a real run the
    // way the page's plugin-runtime line is below. The fixture is a git repository so the
    // `git-available` row passes, which is what makes the close the no-warning variant.
    const handle = getRepo();
    const root = await seedRepo(handle, { repoFiles: NODE_REPO });
    await new Promise<void>((settle, reject) => {
      execFile("git", ["init", "-q"], { cwd: root }, (error) =>
        error === null ? settle() : reject(error),
      );
    });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const result = await runHuman(root, env);
    const closing = result.stdout.trimEnd().split("\n").at(-1);

    expect(result.code).toBe(0);
    expect(closing).toBe("setup green — gates not run: lint, typecheck, test (check runs no gate)");
    const page = await readFile(
      fileURLToPath(new URL("../../../docs/troubleshooting.md", import.meta.url)),
      "utf8",
    );
    expect(page.split("\n")).toContain(closing);
  });

  it("names every gate unresolved when detection recorded nothing, and still exits 0", async () => {
    // The bare fixture has no manifest file of any stack, so sync persisted an empty
    // `detected` block — the first-run repository the onboarding guide is written for.
    const handle = getRepo();
    const root = await seedRepo(handle);
    expect((await readManifest(root))?.detected).toEqual({
      languages: [],
      linters: [],
      testFrameworks: [],
      ciProviders: [],
    });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const human = await runHuman(root, env);
    const { code, doc } = await runJson(root, env);

    expect(human.code).toBe(0);
    for (const kind of ALL_KINDS) {
      expect(human.stdout).toContain(
        `warning: the ${kind} gate cannot be resolved — the charter says ` +
          `"unknown — no ${kind} command detected; ask the user"`,
      );
    }
    // The four gate warnings count toward the advisory total the close states.
    const doctorWarnings = doc.doctor.filter((entry) => entry.status === "warn").length;
    expect(human.stdout).toContain(
      `ok — ${doctorWarnings + 4} advisory warning(s) above; gates not run: lint, typecheck, test`,
    );
    expect(code).toBe(0);
    expect(doc.gates).toEqual({ notRun: ["lint", "typecheck", "test"], unresolved: ALL_KINDS });
  });

  it("names a pinned test gate whose command is nowhere, and resolves it once .venv/bin holds it", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { repoFiles: NODE_REPO, gates: { test: "pytest" } });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const missing = await runHuman(root, env);
    expect(missing.code).toBe(0);
    expect(missing.stdout).toContain(
      'warning: the test gate cannot be resolved — the charter says "pytest"',
    );
    // The recomposed full gate ends on the same unresolved-looking word, but it LEADS with
    // `npm`, which resolves: only the first word is looked up.
    expect(missing.stdout).not.toContain("the full-gate gate cannot be resolved");
    expect((await runJson(root, env)).doc.gates?.unresolved).toEqual(["test"]);

    await toolDir(handle, ".venv/bin", ["pytest"]);
    const found = await runJson(root, env);
    expect(found.doc.gates?.unresolved).toEqual([]);
  });

  it("resolves a first word under node_modules/.bin and ignores the empty PATH it is not on", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { gates: { lint: "eslint .", typecheck: "tsc --noEmit" } });
    await toolDir(handle, "node_modules/.bin", ["eslint"]);

    const { code, doc } = await runJson(root, { PATH: "" });

    expect(code).toBe(0);
    // eslint resolves from the repo's own bin, and so does the full gate, which is recomposed
    // from the pins and leads with it; tsc is nowhere, and the fixture detected no test gate.
    expect(doc.gates?.unresolved).toEqual(["typecheck", "test"]);
  });

  it("resolves a pinned relative interpreter path against the root, not against PATH", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, {
      repoFiles: NODE_REPO,
      gates: { test: ".venv/bin/python -m pytest" },
    });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const absent = await runHuman(root, env);
    expect(absent.stdout).toContain(
      'warning: the test gate cannot be resolved — the charter says ".venv/bin/python -m pytest"',
    );

    await toolDir(handle, ".venv/bin", ["python"]);
    expect((await runJson(root, env)).doc.gates?.unresolved).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "does not take a file that is present but not executable",
    async () => {
      // POSIX only: Windows has no execute bit, and X_OK there answers existence.
      const handle = getRepo();
      const root = await seedRepo(handle, { repoFiles: NODE_REPO, gates: { test: "pytest" } });
      const env = pathEnv(await toolDir(handle, "tools", ["npm"]));
      await handle.seedFiles({ ".venv/bin/pytest": "#!/bin/sh\n" });
      await chmod(handle.path(".venv/bin/pytest"), 0o644);

      expect((await runJson(root, env)).doc.gates?.unresolved).toEqual(["test"]);
    },
  );

  it("names a pinned full gate as pinned, never recomposed from the three", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { repoFiles: NODE_REPO, gates: { all: "make verify" } });
    const env = pathEnv(await toolDir(handle, "tools", ["npm"]));

    const human = await runHuman(root, env);

    expect(human.stdout).toContain(
      'warning: the full-gate gate cannot be resolved — the charter says "make verify"',
    );
    expect((await runJson(root, env)).doc.gates?.unresolved).toEqual(["full-gate"]);

    await toolDir(handle, "tools", ["npm", "make"]);
    expect((await runJson(root, env)).doc.gates?.unresolved).toEqual([]);
  });

  it("prints no gate line on a run that is not green, and keeps the next: list", async () => {
    // Drift makes `ok` false. The gates are still in the payload (they are data about the
    // charter), but the screen ends on what to run next, as it did before.
    const handle = getRepo();
    const root = await seedRepo(handle, {
      ledger: [
        // TEST CHANGE, justified: REQ-PLUGIN-045 — the pack row moved into its own
        // pack folder as `infra`; `docs/gone.md` as a `skill` is refused.
        { path: ".stamity/packs/demo/gone.md", adapter: packOwner("demo"), artifactId: "gone", artifactType: "infra" },
      ],
    });

    const human = await runHuman(root, pathEnv());
    const { code, doc } = await runJson(root, pathEnv());

    expect(human.code).toBe(1);
    expect(human.stdout).toContain("next:");
    expect(human.stdout).not.toContain("gates not run");
    expect(human.stdout).not.toContain("cannot be resolved");
    expect(code).toBe(1);
    expect(doc.gates?.unresolved).toEqual(ALL_KINDS);
  });

  it("omits the gates without a manifest, and the init step still prints", async () => {
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    const human = await runHuman(handle.dir, pathEnv());
    const { doc } = await runJson(handle.dir, pathEnv());

    expect(human.stdout).toContain(`${npxCommand("init")} — this repository has no usable manifest`);
    expect(human.stdout).not.toContain("gates not run");
    expect(doc).not.toHaveProperty("gates");
  });

  it("resolves the gates without spawning: check still exits 0 with every child_process entry throwing", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { repoFiles: NODE_REPO, gates: { test: "pytest" } });
    const env = pathEnv(await toolDir(handle, "tools", ["npm", "pytest"]));

    // A double, because the claim is about the ABSENCE of a call: the real module cannot
    // report that nobody reached for it. Every spawning entry point records the program it
    // was asked for and throws, so a gate probe that ran `which pytest` or `npm --version`
    // would show in `attempted`. The fresh module graph re-pins the content root, because
    // `vi.resetModules` gives check a new `contentRoot` module with no seam set.
    const attempted: string[] = [];
    vi.resetModules();
    vi.doMock("node:child_process", async (importOriginal) => {
      const actual = await importOriginal<typeof ChildProcessApi>();
      const refuse =
        (name: string) =>
        (file: unknown): never => {
          attempted.push(String(file));
          throw new Error(`child_process.${name} is stubbed to throw`);
        };
      return {
        ...actual,
        spawn: refuse("spawn"),
        spawnSync: refuse("spawnSync"),
        exec: refuse("exec"),
        execSync: refuse("execSync"),
        execFile: refuse("execFile"),
        execFileSync: refuse("execFileSync"),
        fork: refuse("fork"),
      };
    });
    try {
      const fresh = await import("../../../src/cli/commands/check.ts");
      const { __setContentRootForTests: pinFreshCorpus } = await import(
        "../../../src/content/contentRoot.ts"
      );
      pinFreshCorpus(handle.path("corpus"));
      const result = await runInProcess([fresh.checkCommand], ["check"], { cwd: root, env });

      expect(result.code).toBe(0);
      expect(result.stdout).toContain("gates not run: lint, typecheck, test");
      expect(result.stdout).not.toContain("cannot be resolved");
      // The doctor's own git probe is the one spawner check has; nothing else was asked for.
      // TEST CHANGE, justified: that probe starts git by the absolute path it resolved on `PATH`,
      // where it used to name it bare, so the program is matched by its file name, bare or under
      // a folder. The claim is unchanged: git is the only program check reaches for.
      expect(attempted.filter((file) => !/(?:^|[\\/])git(?:\.exe|\.com)?$/i.test(file))).toEqual([]);
    } finally {
      vi.doUnmock("node:child_process");
      vi.resetModules();
    }
  });

  it("looks up the program past leading NAME=value assignments and quotes, and a bare assignment names none", async () => {
    const handle = getRepo();
    const manifest = await pinnedPytest(handle);
    // The programs sit in the root's `node_modules/.bin`, which the resolver walks before PATH,
    // and PATH stays empty: a host-built PATH is `D:\…` on a Windows runner, which the injected
    // POSIX branch splits at the drive letter's colon. The lookup, not the PATH syntax, is the
    // claim, and this layout holds it on every host.
    await toolDir(handle, "node_modules/.bin", ["npm", "pytest"]);
    const gates = createEngine().detect.verificationGates;
    const kindsFor = (test: string): string[] =>
      resolveCharterGates(handle.dir, { ...manifest, gates: { test } }, gates, {
        platform: "linux",
        env: { PATH: "" },
      }).unresolved.map((gate) => gate.kind);

    expect(kindsFor('CI=1 PYTHONPATH=src "pytest" -q')).toEqual([]);
    expect(kindsFor("CI=1")).toEqual(["test"]);
  });

  // POSIX-ONLY: the claim is the execute bit, which Windows does not have (Node's X_OK
  // answers existence there), so a mode-644 file cannot be told from a runnable one.
  it.skipIf(process.platform === "win32")(
    "takes a path-shaped program only when it names a regular executable file, as the PATH walk does",
    async () => {
      // ledger review/79: a first word carrying a separator was taken on bare existence, so a
      // directory or a file without its execute bit read as a program this machine could run.
      const handle = getRepo();
      const manifest = await pinnedPytest(handle);
      await toolDir(handle, "tools", ["ok"]);
      await handle.seedFiles({ "tools/plain": "#!/bin/sh\nexit 0\n", "tools/folder/.keep": "" });
      await chmod(handle.path("tools", "plain"), 0o644);
      const gates = createEngine().detect.verificationGates;
      const testUnresolved = (test: string): boolean =>
        resolveCharterGates(handle.dir, { ...manifest, gates: { test } }, gates, {
          platform: "linux",
          env: { PATH: "" },
        }).unresolved.some((gate) => gate.kind === "test");

      expect(testUnresolved("./tools/ok --fast")).toBe(false);
      expect(testUnresolved("./tools/plain")).toBe(true);
      expect(testUnresolved("tools/folder")).toBe(true);
      expect(testUnresolved("./tools/missing")).toBe(true);
    },
  );

  describe("resolveCharterGates on a Windows host", () => {
    // The Windows branch cannot be reached through `check` on a POSIX host, so the platform
    // is injected, as `checkClaudeHookShell`'s is.
    it("takes node_modules/.bin/<x>.cmd through PATHEXT, and the same file is no answer on POSIX", async () => {
      const handle = getRepo();
      const manifest = await pinnedPytest(handle);
      await handle.seedFiles({ "node_modules/.bin/pytest.cmd": "@exit /b 0\r\n" });
      const gates = createEngine().detect.verificationGates;

      const windows = resolveCharterGates(handle.dir, manifest, gates, {
        platform: "win32",
        env: { PATH: "", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
      });
      const posix = resolveCharterGates(handle.dir, manifest, gates, {
        platform: "linux",
        env: { PATH: "" },
      });

      expect(windows.unresolved.map((gate) => gate.kind)).not.toContain("test");
      expect(posix.unresolved.map((gate) => gate.kind)).toContain("test");
    });

    it("walks a `Path` entry with each PATHEXT extension, and misses a name no extension completes", async () => {
      const handle = getRepo();
      const manifest = await pinnedPytest(handle);
      await handle.seedFiles({ "win-bin/npm.CMD": "@exit /b 0\r\n", "win-bin/pytest": "" });
      const gates = createEngine().detect.verificationGates;

      const report = resolveCharterGates(handle.dir, manifest, gates, {
        platform: "win32",
        // Windows spells the key `Path`, and a quoted entry is legal there.
        env: { Path: `"${handle.path("win-bin")}"`, PATHEXT: ".EXE;.CMD" },
      });

      // npm resolves as npm.CMD; a bare `pytest` is not something cmd.exe would run.
      expect(report.unresolved.map((gate) => gate.kind)).toEqual(["test"]);
      expect(report.notRun).toEqual(["lint", "typecheck", "test"]);
    });

    it("completes a path-shaped program with PATHEXT, and a directory is no answer", async () => {
      // ledger review/79: the separator branch walks the same extensions the PATH branch does.
      const handle = getRepo();
      const manifest = await pinnedPytest(handle);
      await handle.seedFiles({ "tools/run.CMD": "@exit /b 0\r\n", "tools/folder/.keep": "" });
      const gates = createEngine().detect.verificationGates;
      const testUnresolved = (test: string): boolean =>
        resolveCharterGates(handle.dir, { ...manifest, gates: { test } }, gates, {
          platform: "win32",
          env: { PATH: "", PATHEXT: ".EXE;.CMD" },
        }).unresolved.some((gate) => gate.kind === "test");

      expect(testUnresolved("tools/run")).toBe(false);
      expect(testUnresolved("tools/run.CMD")).toBe(false);
      expect(testUnresolved("tools/folder")).toBe(true);
    });
  });
});

/**
 * The doctor sample on the troubleshooting page, pinned to the row `check`
 * actually prints.
 *
 * The page's sample carried `warn  plugin-runtime …` for four days after the
 * row started passing on exactly the repository the sample depicts — one that
 * records no plugin and sets no root variable — so the page taught readers to
 * expect an advisory their own run does not produce. A transcript in a document
 * is a claim about output, and this is the only thing that holds it to one.
 *
 * It lives here rather than in `test/docsPages.test.ts` because the comparison
 * needs a real doctor run, and that page's suite is a text lane.
 */
describe("check — the troubleshooting page's doctor sample", () => {
  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the sample
  // pinned the `plugin-runtime` line, a row that left with the plugin route; the line a
  // repository recording nothing prints is now `plugin-duplicates`'s pass.
  // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): `plugin-duplicates`
  // left too, so the case pins the sample's rows against a real run instead — the same ids in
  // the same order, each under the verdict and the detail the run prints for it where those are
  // this checkout's own (the node version, the counts and the charter's dates are the sample run's).
  it("shows the doctor rows a repository recording nothing really prints, in order", async () => {
    const page = await readFile(
      fileURLToPath(new URL("../../../docs/troubleshooting.md", import.meta.url)),
      "utf8",
    );
    const start = page.indexOf("```text\ndoctor\n");
    expect(start, "the troubleshooting page has no doctor sample").toBeGreaterThan(-1);
    // The doctor block alone: it runs from `doctor` to the first blank line, before drift.
    const block = page.slice(start + "```text\ndoctor\n".length);
    const sample = block
      .slice(0, block.indexOf("\n\n"))
      .split("\n")
      .map((line) => /^ {2}(\S+) +(\S+) +(.*)$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => ({ status: match[1] ?? "", id: match[2] ?? "", detail: match[3] ?? "" }));

    const root = await seedRepo(getRepo());
    const doctor = await runDoctor(root, createEngine(), createApp({ cwd: root, env: {} }));

    expect(sample.map((entry) => entry.id)).toEqual(doctor.map((entry) => entry.id));
    expect(sample.every((entry) => entry.status === "ok")).toBe(true);
    // Status and detail both on a row whose sentence is this checkout's own: a sample showing
    // the right sentence under the wrong verdict is the exact defect this pins against.
    const reach = doctor.find((entry) => entry.id === "pack-reach");
    expect(reach?.status).toBe("pass");
    expect(sample.find((entry) => entry.id === "pack-reach")?.detail).toBe(reach?.detail);
    expect(sample.map((entry) => entry.id)).not.toContain("plugin-duplicates");
  });
});

/**
 * The 1.14 `plugin` block a manifest on disk still carries, and Claude's `enabledPlugins`.
 *
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): 1.15.0
 * deleted the plugin route, its `plugin-backed` mode and the duplicate scan the
 * `plugin-duplicates` row ran, and the row warned, held for the 1.15 line, when
 * the manifest's `plugin` block or Claude's `enabledPlugins` recorded an install.
 *
 * TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014,
 * REQ-PLUGIN-016): the row and the held block leave after that line. The cases
 * that pinned the warning's wording, its client order, the renamed package's id
 * and its read past an unreadable manifest left with it; what stays is that a
 * manifest carrying the block, of any shape, loads with no refusal, and that no
 * row and no line names a leftover plugin install. The multi-line rendering case
 * moved to `model-pins`, the other row whose detail runs over several lines.
 */
describe("check — the dropped plugin block", () => {
  /** The block a 1.14 `stamity plugin setup` wrote for claude. */
  const HELD_1_14 = { mode: "plugin-backed", clients: { claude: { version: "1.14.0", classes: ["skill"] } } };

  it("loads a manifest carrying the 1.14 block and Claude's enabledPlugins, with no leftover-plugin row or line", async () => {
    const root = await seedRepo(getRepo(), { plugin: HELD_1_14 });
    const settingsPath = join(root, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    await writeFile(settingsPath, `${JSON.stringify({ ...settings, enabledPlugins: { "stamity@acme": true } }, null, 2)}\n`);

    const { code, doc } = await runJson(root);
    const human = await runHuman(root);

    expect(row(doc, "manifest").status).toBe("pass");
    expect(doc.drift?.clean).toBe(true);
    expect(doc.doctor.map((entry) => entry.id)).not.toContain("plugin-duplicates");
    expect(code).toBe(0);
    expect(human.code).toBe(0);
    expect(human.stdout).not.toContain("plugin install");
    expect(human.stdout).not.toContain("plugin-duplicates");
  });

  it.each([["a string", "plugin-backed"], ["an array", ["claude"]], ["a null", null]])(
    "loads a manifest carrying %s under `plugin` without refusing it",
    async (_label, plugin) => {
      const root = await seedRepo(getRepo(), { plugin });

      const { code, doc } = await runJson(root);

      expect(row(doc, "manifest").status).toBe("pass");
      expect(code).toBe(0);
    },
  );
});

/**
 * Install a made-up pack `acme` from `pack-src/acme/` through the engine's own
 * plan/apply path and persist the manifest it returns — what `add` does, minus
 * the CLI. Emission is left to the caller ({@link resyncAt}).
 */
async function installAcmePack(
  handle: TempDirHandle,
  root: string,
  files: Record<string, string>,
  declaredTools?: readonly Tool[],
): Promise<void> {
  await handle.seedFiles({
    ...Object.fromEntries(
      Object.entries(files).map(([rel, body]) => [`pack-src/acme/${rel}`, body]),
    ),
    "pack-src/acme/pack.json": `${JSON.stringify({
      name: "acme",
      version: "1.0.0",
      integrity: Object.fromEntries(
        Object.entries(files).map(([rel, body]) => [
          rel,
          createHash("sha256").update(body, "utf8").digest("hex"),
        ]),
      ),
      ...(declaredTools === undefined ? {} : { declaredTools }),
    })}\n`,
  });
  const engineVersion = createApp().version;
  const plan = await planPackInstall(root, handle.path("pack-src/acme"), { allowUntrusted: true });
  expect(plan.collisions).toEqual([]);
  const seeded = await readManifest(root);
  if (seeded === null) throw new Error("fixture lost its manifest");
  const installed = await applyPackInstall(root, plan, seeded, { engineVersion, now: T0 });
  expect(installed.result.installed).toBe(true);
  await writeManifest(root, installed.manifest, { now: T0 });
}

/** One real sync, as `sync` runs it. */
async function resyncAt(root: string): Promise<void> {
  const engineVersion = createApp().version;
  await applySync(root, await planSync(root, engineVersion), {
    engineVersion,
    force: false,
    dryRun: false,
    now: T0,
  });
}

/**
 * `pack-reach` (REQ-PLUGIN-016; run 2026-10-03_pack-engine-defects, unit
 * u4b-pack-reach-row): an installed pack none of whose artifacts reaches a
 * selected client fails the row — a pack whose every artifact's `tools:` list
 * names no selected client installs, syncs green and does nothing. The
 * judgment is the emission plan's own `packReach`.
 *
 * TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
 * `plugin-owned` drop reason left with the `plugin-backed` mode, so the cases
 * that reached the row through a plugin record now reach it through a `tools:`
 * list, the one that only pinned the plugin-drop sentence is gone, and the case
 * that pinned a partial plugin drop now pins that a held block drops nothing.
 */
describe("check — pack-reach", () => {
  const ACME_CMD = COMMAND_FIXTURE.replace("id: cmd-work", "id: acme-cmd");
  /** A pack-supplied MCP definition that clears the install gate (`test/pack/install.test.ts`). */
  const PACK_SERVER = `${JSON.stringify(
    {
      id: "packtel",
      description: "Telemetry queries against the team's own collector.",
      command: "npx",
      args: ["-y", "@acme/telemetry-mcp@1.4.2"],
      transport: "stdio",
      pinnedVersion: "1.4.2",
      packageNameLock: "@acme/telemetry-mcp",
      blastRadius: "Low — read-only queries against a staging collector.",
      docsUrl: "https://example.invalid/telemetry-mcp",
    },
    null,
    2,
  )}\n`;

  it("passes with no pack installed, without planning anything", async () => {
    const root = await seedRepo(getRepo());

    const reach = await doctorRow(root, "pack-reach");

    expect(reach).toEqual({
      id: "pack-reach",
      status: "pass",
      detail: "no installed pack is recorded in the ledger",
    });
  });

  it("passes a pack every artifact of which reaches a client, naming the counts", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude", "cursor"] });
    await installAcmePack(handle, root, {
      "commands/st-acme-cmd.md": ACME_CMD,
      "agents/stamity-acme-agent.md": AGENT_FIXTURE.replace("id: reviewer", "id: acme-agent"),
      "skills/st-acme-skill/SKILL.md": SKILL_FIXTURE.replace("id: verify", "id: acme-skill"),
    });
    await resyncAt(root);

    const { code, doc } = await runJson(root);

    expect(row(doc, "pack-reach")).toEqual({
      id: "pack-reach",
      status: "pass",
      detail: "1 installed pack(s), 3 artifact(s), each reaching a selected client",
    });
    expect(code).toBe(0);
  });

  // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-014): the block is dropped on
  // read rather than held, so the case names it as a block on disk; the assertions are unchanged.
  it("drops nothing for a 1.14 plugin block on disk: the pack's command reaches every selected client", async () => {
    // The 1.14 record that carried claude's commands no longer moves a class out
    // of emission: the reader drops the block, so nothing reads it.
    const handle = getRepo();
    const root = await seedRepo(handle, {
      tools: ["claude", "codex"],
      plugin: { mode: "plugin-backed", clients: { claude: { version: "1.11.0", classes: ["command"] } } },
    });
    await installAcmePack(handle, root, { "commands/st-acme-cmd.md": ACME_CMD });
    await resyncAt(root);

    const { code, doc } = await runJson(root);

    expect(row(doc, "pack-reach")).toEqual({
      id: "pack-reach",
      status: "pass",
      detail: "1 installed pack(s), 1 artifact(s), each reaching a selected client",
    });
    expect(existsSync(join(root, ".claude", "commands", "st-acme-cmd.md"))).toBe(true);
    expect(code).toBe(0);
  });

  it("fails a pack whose only artifact names no selected client in its tools: list", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(
      handle,
      root,
      { "commands/st-acme-cmd.md": ACME_CMD.replace("load: on-demand", "load: on-demand\ntools: [copilot]") },
      ["copilot"],
    );
    await resyncAt(root);

    const reach = await doctorRow(root, "pack-reach");

    expect(reach.status).toBe("fail");
    expect(reach.detail).toContain(
      'pack "acme" reaches no selected client: command st-acme-cmd — its tools: list names only copilot.',
    );
    // TEST CHANGE, justified: 2026-10-06, run 2026-10-03_pack-engine-defects
    // review/38. "or select a client its artifacts name" named no command; the
    // row now prints the pinned `config set tools` call that adds the client.
    expect(reach.detail).toContain(
      `, or add a client its tools: list names with ${npxCommand("config set tools claude,copilot")}, ` +
        `then ${npxCommand("sync")}`,
    );
    expect(reach.detail).not.toContain("generated mode");
    expect(reach.detail).not.toContain("plugin carries a class");
  });

  it("warns on a pack whose every hook row was rejected, noting it ships nothing a client loads", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await handle.seedFiles({ ".stamity/hooks/acme-probe.mjs": "process.exit(0)\n" });
    await installAcmePack(handle, root, {
      "hooks/hooks.json": `${JSON.stringify({
        hooks: [{ event: "pre_tool_use", command: ["node", ".stamity/hooks/acme-probe.mjs"] }],
      })}\n`,
    });
    // The hook lane refuses a hook whose script is gone, so the file yields no row.
    await rm(handle.path(".stamity/hooks/acme-probe.mjs"));

    const reach = await doctorRow(root, "pack-reach");

    // TEST CHANGE, justified: 2026-10-06, run 2026-10-03_pack-engine-defects
    // review/27. This pinned `pass` for a pack the row itself calls inert; it now
    // warns — still exit 0, since no plugin took anything (the hook lane's own
    // warning, printed by sync, names the rejection) — so the inert pack is flagged.
    expect(reach).toEqual({
      id: "pack-reach",
      status: "warn",
      detail:
        'pack "acme" ships nothing a client loads (no skill, agent, rule, command, accepted ' +
        "hook or MCP server)",
    });
  });

  it("passes a pack that reaches a client, naming an artifact whose tools: list names none", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(
      handle,
      root,
      {
        "commands/st-acme-cmd.md": ACME_CMD.replace("load: on-demand", "load: on-demand\ntools: [copilot]"),
        "agents/stamity-acme-agent.md": AGENT_FIXTURE.replace("id: reviewer", "id: acme-agent"),
      },
      ["copilot"],
    );
    await resyncAt(root);

    const reach = await doctorRow(root, "pack-reach");

    expect(reach).toEqual({
      id: "pack-reach",
      status: "pass",
      detail:
        '1 installed pack(s), 1 of 2 artifact(s) reaching a selected client; pack "acme": ' +
        "command st-acme-cmd — its tools: list names only copilot",
    });
  });

  it("warns on a pack whose only delivery is an MCP server nobody selected, naming config mcp add", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(handle, root, { "mcp_servers/telemetry.json": PACK_SERVER });
    await resyncAt(root);

    const { code, doc } = await runJson(root);

    expect(row(doc, "pack-reach")).toEqual({
      id: "pack-reach",
      status: "warn",
      detail:
        'pack "acme" reaches no selected client until a server it supplies is selected: ' +
        `mcp-server packtel — not selected; ${npxCommand("config mcp add packtel")} selects it. ` +
        `Or remove it with ${npxCommand("clean --pack acme")}`,
    });
    expect(code).toBe(0);
  });

  it("passes a pack whose MCP server the manifest selects", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(handle, root, { "mcp_servers/telemetry.json": PACK_SERVER });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    await writeManifest(root, { ...manifest, mcp: { servers: ["packtel"] } }, { now: T0 });
    await resyncAt(root);

    const { code, doc } = await runJson(root);

    expect(row(doc, "pack-reach")).toEqual({
      id: "pack-reach",
      status: "pass",
      detail: "1 installed pack(s), 1 artifact(s), each reaching a selected client",
    });
    expect(code).toBe(0);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the command
  // misses claude through its own `tools:` list, where a plugin carrying the command
  // class dropped it; the awaiting-server sentence this case pins is unchanged.
  it("warns, naming both, on a command no selected client takes beside an unselected server", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(
      handle,
      root,
      {
        "commands/st-acme-cmd.md": ACME_CMD.replace("load: on-demand", "load: on-demand\ntools: [copilot]"),
        "mcp_servers/telemetry.json": PACK_SERVER,
      },
      ["copilot"],
    );
    await resyncAt(root);

    const { code, doc } = await runJson(root);

    expect(row(doc, "pack-reach")).toEqual({
      id: "pack-reach",
      status: "warn",
      detail:
        'pack "acme" reaches no selected client until a server it supplies is selected: ' +
        "command st-acme-cmd — its tools: list names only copilot; " +
        `mcp-server packtel — not selected; ${npxCommand("config mcp add packtel")} selects it. ` +
        `Or remove it with ${npxCommand("clean --pack acme")}`,
    });
    expect(code).toBe(0);
  });

  it("prints a policy-denied pack's warning once per check run, not once per plan", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(handle, root, { "commands/st-acme-cmd.md": ACME_CMD });
    await resyncAt(root);
    await writeFile(
      join(root, STATE_DIR, "policy.json"),
      JSON.stringify({ version: 1, packs: { deny: ["*"] } }),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await runHuman(root);
      const denials = warn.mock.calls.filter((call) =>
        String(call[0]).includes('Installed pack "acme" is denied by the org trust policy'),
      );
      // Two plans read the packs in one run — the drift gate's and this row's.
      expect(denials).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("warns, naming the policy, on an installed pack the organisation's trust policy denies", async () => {
    // review/47: the plan leaves a denied pack out of its reach, so the row read
    // "no installed pack resolved" and passed for a pack installed and inert.
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(handle, root, { "commands/st-acme-cmd.md": ACME_CMD });
    await resyncAt(root);
    await writeFile(
      join(root, STATE_DIR, "policy.json"),
      JSON.stringify({ version: 1, packs: { deny: ["*"] } }),
      "utf8",
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const reach = await doctorRow(root, "pack-reach");

      expect(reach).toEqual({
        id: "pack-reach",
        status: "warn",
        detail:
          'pack "acme" is denied by the organisation\'s trust policy (matched rule: "*"), so none ' +
          `of its content reaches a client. Remove it with ${npxCommand("clean --pack acme")}, or ` +
          "change .stamity/policy.json",
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("flattens a control character in a pack-supplied id before printing it", async () => {
    // review/43 (CWE-150): a YAML double-quoted `\e` puts a real ESC in the
    // frontmatter id while the bytes on disk stay printable, and the row prints
    // that id. Pack ids themselves are shape-checked at install; the artifact
    // id is the pack-supplied name that reaches this row.
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
    // command misses claude through its `tools:` list, where a plugin record dropped
    // it; the id it prints, the subject here, is unchanged.
    await installAcmePack(
      handle,
      root,
      {
        "commands/st-acme-cmd.md": COMMAND_FIXTURE.replace(
          "id: cmd-work",
          'id: "acme\\e[2K\\rcmd"',
        ).replace("load: on-demand", "load: on-demand\ntools: [copilot]"),
      },
      ["copilot"],
    );
    await resyncAt(root);

    const reach = await doctorRow(root, "pack-reach");

    expect(reach.status).toBe("fail");
    // ESC dropped, the carriage return spaced, as `sanitizeLabel` does everywhere.
    expect(reach.detail).toContain('pack "acme" reaches no selected client: command st-acme[2K cmd —');
    // oxlint-disable-next-line no-control-regex -- the control byte IS the subject
    expect(reach.detail).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/u);
  });

  it("warns 'not evaluated' when the plan cannot be built, leaving the failure to the drift gate", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude"] });
    await installAcmePack(handle, root, { "commands/st-acme-cmd.md": ACME_CMD });
    await resyncAt(root);
    // A pack directory the ledger records and the filesystem has lost: the plan refuses it.
    await rm(join(root, STATE_DIR, "packs", "acme"), { recursive: true, force: true });

    const { code, doc } = await runJson(root);
    const reach = row(doc, "pack-reach");

    expect(reach.status).toBe("warn");
    expect(reach.detail).toMatch(/^not evaluated: the emission plan could not be built \(/);
    expect(reach.detail).toContain("the drift gate below reports the cause in full");
    expect(doc.driftStatus).toBe("failed");
    expect(code).toBe(1);
  });
});

describe("check — the non-mutation guarantee (REQ-PLUGIN-019)", () => {
  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the repository
  // records a leftover plugin install (the held block and Claude's `enabledPlugins`), where it
  // held an APM manifest for a duplicate scan that left with the plugin route.
  it("changes no file on disk, on a repository that records a leftover plugin install", async () => {
    const repo = getRepo();
    const root = await seedRepo(repo, {
      plugin: {
        mode: "plugin-backed",
        clients: { claude: { version: "1.9.0", classes: ["agent", "skill"] } },
      },
      ledger: [
        {
          path: ".claude/agents/stamity-reviewer.md",
          adapter: "claude",
          artifactId: "reviewer",
          artifactType: "agent",
          contentHash: createHash("sha256").update("x").digest("hex"),
        },
      ],
      files: {
        ".claude/agents/stamity-reviewer.md": "---\nname: reviewer\n---\n\nBody.\n",
      },
    });
    const settingsPath = join(root, ".claude", "settings.json");
    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
    await writeFile(settingsPath, `${JSON.stringify({ ...settings, enabledPlugins: { "stamity@acme": true } }, null, 2)}\n`);
    const before = await hashTree(root);

    const { doc } = await runJson(root);
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): the row that warned
    // here left; the manifest carrying the block loads, and check, the read-only verb, still
    // writes nothing — the block stays on disk until a `sync` drops it.
    expect(row(doc, "manifest").status).toBe("pass");

    // Every byte, not a spot check: `check` is the read-only verb, and a row that
    // reads the manifest and the settings document beside the validator is one way
    // a diagnostic acquires a write by accident.
    expect(await hashTree(root)).toEqual(before);
  });
});

describe("check — the caller's expectations (REQ-PLUGIN-047)", () => {
  const RUNNING = createApp().version;

  /** `check --json` with the given flags; one document, as {@link runJson} reads it. */
  async function runExpecting(
    cwd: string,
    flags: readonly string[],
  ): Promise<{ code: number; doc: Envelope & { expectations?: unknown } }> {
    const result = await runInProcess([checkCommand], ["check", ...flags, "--json"], { cwd });
    const lines = result.stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    return { code: result.code, doc: JSON.parse(lines[0] ?? "") as Envelope & { expectations?: unknown } };
  }

  /**
   * The pinned call at another release, spelled out rather than asked of the production helper.
   * TEST CHANGE, justified: REQ-PLUGIN-048 (build/21) — derived through the support module's
   * `npxCommandOf`, so a `--registry` fork's own checkout expects the registry word its CLI now
   * prints; on this tree the string is byte-for-byte the `npx -y <name>@<version> <verb>` it was.
   */
  function npxAt(version: string, verb: string): string {
    return npxCommandOf({ ...canonical(), version }, verb);
  }

  function failure(doc: Envelope): { code?: string; message?: string; why?: string; next?: string } {
    return (doc.error ?? {}) as { code?: string; message?: string; why?: string; next?: string };
  }

  it("passes --expect-version at the running release that generated the repository", async () => {
    const root = await seedRepo(getRepo());

    const { code, doc } = await runExpecting(root, ["--expect-version", `v${RUNNING}`]);

    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    expect(doc.expectations).toEqual({
      ok: true,
      version: { expected: RUNNING, running: RUNNING, generatedBy: RUNNING, ok: true },
    });
    expect(row(doc, "expectations")).toEqual({
      id: "expectations",
      status: "pass",
      detail: `release ${RUNNING} — as expected`,
    });
    // Outside `runDoctor`: the fifteenth row exists only because a flag asked for it.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): one row fewer — `plugin-runtime` left with the plugin route.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row): one row more — `model-pins` joined the doctor.
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): one row fewer — `plugin-duplicates` left.
    expect(doc.doctor.map((entry) => entry.id).indexOf("expectations")).toBe(14);
  });

  it("fails another --expect-version naming the running release and generatedBy", async () => {
    const root = await seedRepo(getRepo());

    const { code, doc } = await runExpecting(root, ["--expect-version", "9.9.9"]);

    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
    expect(failure(doc).code).toBe("EXPECTATION_ERROR");
    expect(failure(doc).message).toBe("check found the repository different from what its caller expects");
    expect(failure(doc).why).toBe(
      `generated by ${RUNNING}, expected 9.9.9; this check runs ${RUNNING}, expected 9.9.9`,
    );
    expect(failure(doc).next).toContain(
      `regenerate with the expected release in a reviewed pull request: ${npxAt("9.9.9", "sync")}`,
    );
    expect(failure(doc).next).toContain(
      `run this check with the expected release: ${npxAt("9.9.9", "check --expect-version 9.9.9")}`,
    );
    expect(row(doc, "expectations").status).toBe("fail");
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): `--expect-mode` left
  // with the `plugin-backed` install mode, so its flag and its step left this case; the pinning
  // of every remaining step to the expected release is what it still asserts.
  it("pins every remedy to the expected release when the running CLI and the clients both miss", async () => {
    const root = await seedRepo(getRepo());
    const flags = ["--expect-version", "9.9.9", "--expect-tools", "claude,cursor"];

    const { code, doc } = await runExpecting(root, flags);

    expect(code).toBe(1);
    expect(failure(doc).code).toBe("EXPECTATION_ERROR");
    // Followed in order, the steps leave the repository at the expected release:
    // a step at the running one would regenerate there last and re-break
    // `generatedBy` (review/21). `next` is one string, as every `check` failure
    // document's is, its steps separated by "; " the way `why`'s mismatches are,
    // one step per mismatch and in the same order (review/25).
    const steps = (failure(doc).next ?? "").split("; ");
    expect(steps).toEqual([
      `regenerate with the expected release in a reviewed pull request: ${npxAt("9.9.9", "sync")}`,
      `run this check with the expected release: ${npxAt("9.9.9", "check --expect-version 9.9.9")}`,
      `${npxAt("9.9.9", "config set tools claude,cursor")}, then ${npxAt("9.9.9", "sync")}, ` +
        "in a reviewed pull request",
    ]);
    expect((failure(doc).why ?? "").split("; ")).toHaveLength(steps.length);
    expect(failure(doc).next).not.toContain(`@${RUNNING} `);

    const human = await runInProcess([checkCommand], ["check", ...flags], { cwd: root });
    const next = human.stdout.slice(human.stdout.indexOf("\nnext:\n"));
    for (const [index, step] of steps.entries()) expect(next).toContain(`  ${index + 1}. ${step}\n`);
  });

  it("falls back to packageCommand's unpinned call when the package's own name is unrunnable", async () => {
    // The branch `pinnedCallAt` takes when `pinnedCliCall` refuses the name
    // (review/24). A legacy upper-case name fails the runnable-name grammar in
    // `src/shared/cliCall.ts`, so `packageCommand` renders `npx <name> <verb>`,
    // and the expected-release remedies render the same rather than a second form.
    // The rename is applied the way the fork-name case above applies it: only
    // the kit's own package-root walk is redirected.
    const handle = getRepo();
    const root = await seedRepo(handle);
    const pseudoInstall = handle.path("pseudo-install");
    await mkdir(pseudoInstall, { recursive: true });
    await writeFile(
      join(pseudoInstall, "package.json"),
      `${JSON.stringify({ name: "@Acme/Stamity", version: "1.8.0" })}\n`,
    );
    const kitDir = join("src", "cli", "kit");
    vi.resetModules();
    vi.doMock("../../../src/shared/paths.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof PathsApi>();
      return {
        ...actual,
        findPackageRoot: (from: string): string =>
          from.endsWith(kitDir) ? pseudoInstall : actual.findPackageRoot(from),
      };
    });
    try {
      const renamed = await import("../../../src/cli/commands/check.ts");
      const { __setContentRootForTests: pinFreshCorpus } = await import(
        "../../../src/content/contentRoot.ts"
      );
      pinFreshCorpus(handle.path("corpus"));
      const result = await runInProcess(
        [renamed.checkCommand],
        ["check", "--json", "--expect-version", "9.9.9", "--expect-tools", "claude,cursor"],
        { cwd: root },
      );

      expect(result.code).toBe(1);
      const doc = JSON.parse(result.stdout.trim()) as Envelope;
      expect(failure(doc).code).toBe("EXPECTATION_ERROR");
      expect(failure(doc).next).toBe(
        [
          "regenerate with the expected release in a reviewed pull request: npx @Acme/Stamity sync",
          "run this check with the expected release: npx @Acme/Stamity check --expect-version 9.9.9",
          "npx @Acme/Stamity config set tools claude,cursor, then npx @Acme/Stamity sync, " +
            "in a reviewed pull request",
        ].join("; "),
      );
    } finally {
      vi.doUnmock("../../../src/shared/paths.ts");
      vi.resetModules();
    }
  });

  it.each([
    {
      fork: "a --registry fork",
      publishConfig: { registry: "https://npm.pkg.github.com" },
      prefix: "npx -y --@acme:registry=https://npm.pkg.github.com @acme/stamity@9.9.9",
    },
    {
      // Outside the call grammar (http): never rendered, and the call fails closed to
      // `--no`, which runs an installed copy and fetches nothing.
      fork: "a fork whose registry the call cannot name",
      publishConfig: { registry: "http://npm.acme.example/" },
      prefix: "npx --no @acme/stamity@9.9.9",
    },
  ])("names $fork's registry in every expected-release remedy, as packageCommand does", async ({
    publishConfig,
    prefix,
  }) => {
    // build/21 (REQ-PLUGIN-048): with --expect-version every step is pinned to the
    // expected release, and each one reads the identity `packageCommand` reads —
    // name, channel and registry from one manifest — so a registry fork's remedy
    // never asks the default registry for the fork's name. The rename is applied
    // the way the fork-name case above applies it: only the kit's own
    // package-root walk is redirected.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the
    // `--expect-mode` flag and its step left with the `plugin-backed` install mode.
    const handle = getRepo();
    const root = await seedRepo(handle);
    const pseudoInstall = handle.path("pseudo-install");
    await mkdir(pseudoInstall, { recursive: true });
    await writeFile(
      join(pseudoInstall, "package.json"),
      `${JSON.stringify({ name: "@acme/stamity", version: "1.8.0", publishConfig })}\n`,
    );
    const kitDir = join("src", "cli", "kit");
    vi.resetModules();
    vi.doMock("../../../src/shared/paths.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof PathsApi>();
      return {
        ...actual,
        findPackageRoot: (from: string): string =>
          from.endsWith(kitDir) ? pseudoInstall : actual.findPackageRoot(from),
      };
    });
    try {
      const renamed = await import("../../../src/cli/commands/check.ts");
      const { __setContentRootForTests: pinFreshCorpus } = await import(
        "../../../src/content/contentRoot.ts"
      );
      pinFreshCorpus(handle.path("corpus"));
      const result = await runInProcess(
        [renamed.checkCommand],
        [
          "check",
          "--json",
          "--expect-version",
          "9.9.9",
          "--expect-tools",
          "claude,cursor",
        ],
        { cwd: root },
      );

      expect(result.code).toBe(1);
      const doc = JSON.parse(result.stdout.trim()) as Envelope;
      expect(failure(doc).code).toBe("EXPECTATION_ERROR");
      expect((failure(doc).next ?? "").split("; ")).toEqual([
        `regenerate with the expected release in a reviewed pull request: ${prefix} sync`,
        `run this check with the expected release: ${prefix} check --expect-version 9.9.9`,
        `${prefix} config set tools claude,cursor, then ${prefix} sync, in a reviewed pull request`,
      ]);
      // No step escapes the identity: no bare `-y` call for the fork's name, and a
      // refused registry is never echoed.
      expect(failure(doc).next).not.toMatch(/npx -y @acme\/stamity@/);
      expect(failure(doc).next).not.toContain("npm.acme.example");
    } finally {
      vi.doUnmock("../../../src/shared/paths.ts");
      vi.resetModules();
    }
  });

  it("names generatedBy alone when only the manifest's release differs", async () => {
    expect(RUNNING).not.toBe("1.10.0");
    const root = await seedRepo(getRepo(), { generatedBy: "1.10.0" });

    const { code, doc } = await runExpecting(root, ["--expect-version", RUNNING]);

    expect(code).toBe(1);
    expect(failure(doc).code).toBe("EXPECTATION_ERROR");
    expect(failure(doc).why).toBe(`generated by 1.10.0, expected ${RUNNING}`);
    expect(failure(doc).next).not.toContain("run this check with the expected release");
    expect(doc.expectations).toEqual({
      ok: false,
      version: { expected: RUNNING, running: RUNNING, generatedBy: "1.10.0", ok: false },
    });
  });

  it("passes every flag together and names only what was asked", async () => {
    const root = await seedRepo(getRepo());

    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): two flags, not
    // three — `--expect-mode` left with the `plugin-backed` install mode.
    const { code, doc } = await runExpecting(root, ["--expect-version", RUNNING, "--expect-tools", "claude"]);

    expect(code).toBe(0);
    expect(row(doc, "expectations").detail).toBe(`release ${RUNNING}, clients claude — as expected`);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the flag itself left
  // with the `plugin-backed` install mode, so every value — one it once accepted included — is
  // now an unknown option, refused as a usage error before any probe.
  it("refuses --expect-mode as an unknown option, before any probe", async () => {
    const root = await seedRepo(getRepo());

    const result = await runInProcess([checkCommand], ["check", "--expect-mode", "generated"], { cwd: root });

    expect(result.code).toBe(2);
    expect(result.stdout).not.toContain("doctor");
    expect(result.stderr).toContain("--expect-mode");
  });

  it.each(["1.x", "latest", "", ">=1.0.0"])(
    "refuses --expect-version %j with VALIDATION_ERROR before any probe",
    async (value) => {
      const root = await seedRepo(getRepo());

      const { code, doc } = await runExpecting(root, ["--expect-version", value]);

      expect(code).toBe(1);
      expect(failure(doc).code).toBe("VALIDATION_ERROR");
      expect(failure(doc).message).toBe(`--expect-version takes one exact version, got ${JSON.stringify(value)}`);
      expect(doc.doctor).toBeUndefined();
    },
  );

  it("refuses an --expect-version with build metadata rather than comparing it without", async () => {
    // `semver.valid` would hold `1.12.0+acme.1` as `1.12.0`, so the row would say
    // "expected 1.12.0" for a value the caller never wrote, and pass it (review/23).
    const root = await seedRepo(getRepo());

    const { code, doc } = await runExpecting(root, ["--expect-version", "1.12.0+acme.1"]);

    expect(code).toBe(1);
    expect(failure(doc).code).toBe("VALIDATION_ERROR");
    expect(failure(doc).message).toBe(
      '--expect-version takes one exact release without build metadata, got "1.12.0+acme.1"',
    );
    expect(failure(doc).next).toBe("pass the release without its build metadata, such as 1.12.0");
    expect(doc.doctor).toBeUndefined();
  });

  it("refuses an unknown or empty --expect-tools with VALIDATION_ERROR before any probe", async () => {
    const root = await seedRepo(getRepo());

    const unknown = await runExpecting(root, ["--expect-tools", "claude,emacs"]);
    expect(unknown.code).toBe(1);
    expect(failure(unknown.doc).code).toBe("VALIDATION_ERROR");
    expect(failure(unknown.doc).message).toBe('unknown tool(s) "emacs"');
    expect(unknown.doc.doctor).toBeUndefined();

    const empty = await runExpecting(root, ["--expect-tools", " , "]);
    expect(empty.code).toBe(1);
    expect(failure(empty.doc).code).toBe("VALIDATION_ERROR");
    expect(failure(empty.doc).message).toBe("--expect-tools named no tool");
  });

  it("reads --expect-tools tolerantly: case, spaces and order make one set", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "cursor"] });

    const spellings = [" Claude , CURSOR ", "cursor,claude", "claude,cursor,claude"];
    // `check` writes nothing, so the three runs may share the repository at once.
    const runs = await Promise.all(spellings.map((spelling) => runExpecting(root, ["--expect-tools", spelling])));
    for (const [index, { code, doc }] of runs.entries()) {
      expect(code, spellings[index]).toBe(0);
      expect(doc.expectations, spellings[index]).toEqual({
        ok: true,
        tools: { expected: ["claude", "cursor"], recorded: ["claude", "cursor"], missing: [], extra: [], ok: true },
      });
    }
  });

  it("keeps the last value of a flag given twice", async () => {
    const root = await seedRepo(getRepo());

    const { code, doc } = await runExpecting(root, ["--expect-tools", "codex", "--expect-tools", "claude"]);

    expect(code).toBe(0);
    expect(doc.expectations).toMatchObject({ tools: { expected: ["claude"] } });
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): two flags, not three.
  it("lists the two flags in check --help", async () => {
    const result = await runInProcess([checkCommand], ["check", "--help"]);
    // Commander wraps the descriptions to the terminal width; the words are the assertion.
    const help = result.stdout.replaceAll(/\s+/g, " ");

    expect(result.code).toBe(0);
    expect(help).toContain(
      "--expect-version <semver> fail unless this exact release generated the repository and runs this check",
    );
    // TEST CHANGE, justified: REQ-PLUGIN-047 (review/88) — the help read as if all four clients
    // were required; it now says the listed ids, each one of the four.
    expect(help).toContain(
      "--expect-tools <csv> fail unless the manifest's clients are exactly the listed ids, each one of claude, cursor, copilot, codex",
    );
    expect(help).not.toContain("--expect-mode");
  });

  it("puts EXPECTATION_ERROR before drift, and still prints the drift lines", async () => {
    const PACK_GUIDE = ".stamity/packs/demo/guide.md";
    const root = await seedRepo(getRepo(), {
      ledger: [{ path: PACK_GUIDE, adapter: packOwner("demo"), artifactId: "guide", artifactType: "infra" }],
    });

    const { code, doc } = await runExpecting(root, ["--expect-tools", "claude,codex"]);
    expect(code).toBe(1);
    expect(doc.drift?.missing).toEqual([PACK_GUIDE]);
    expect(failure(doc).code).toBe("EXPECTATION_ERROR");
    expect(failure(doc).why).toBe("clients claude — codex missing");

    const human = await runInProcess([checkCommand], ["check", "--expect-tools", "claude,codex"], { cwd: root });
    expect(human.code).toBe(1);
    expect(human.stdout).toContain("ledgered file(s) missing");
    expect(human.stdout).toContain(PACK_GUIDE);
    const next = human.stdout.slice(human.stdout.indexOf("\nnext:\n"));
    expect(next).toContain(`1. ${npxCommand("config set tools claude,codex")}, then ${npxCommand("sync")}`);
    expect(next).toContain(`2. ${npxCommand("sync")} — regenerate the files that drifted`);
  });

  it("reads 'not evaluated' with no manifest, and keeps the manifest row's failure first", async () => {
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    const { code, doc } = await runExpecting(handle.dir, ["--expect-tools", "claude"]);

    expect(code).toBe(1);
    expect(row(doc, "expectations")).toEqual({
      id: "expectations",
      status: "fail",
      detail: "not evaluated: the manifest could not be read",
    });
    expect(failure(doc).code).toBe("VALIDATION_ERROR");
    expect(failure(doc).why).toBe(row(doc, "manifest").detail);
    expect(doc.expectations).toEqual({
      ok: false,
      tools: { expected: ["claude"], recorded: null, missing: [], extra: [], ok: false },
    });
  });

  it("adds no key, no row and no line without a flag", async () => {
    const root = await seedRepo(getRepo());

    const { doc } = await runJson(root);
    const human = await runHuman(root);

    expect(doc).not.toHaveProperty("expectations");
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): one row fewer — `plugin-runtime` left with the plugin route.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row): one row more — `model-pins` joined the doctor.
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): one row fewer — `plugin-duplicates` left.
    expect(doc.doctor).toHaveLength(14);
    expect(human.stdout).not.toContain("expectations");
  });
});

describe("check — change-classes (p2a-class-file, REQ-FLOW-061)", () => {
  const CLASS_FILE = ".stamity/change-classes.json";

  it("prints no row when the repository has no class file", async () => {
    const root = await seedRepo(getRepo());

    const { doc } = await runJson(root);

    expect(doc.doctor.map((entry) => entry.id)).not.toContain("change-classes");
    // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): one row fewer — `plugin-runtime` left with the plugin route.
    // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row): one row more — `model-pins` joined the doctor.
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): one row fewer — `plugin-duplicates` left.
    expect(doc.doctor).toHaveLength(14);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): one row fewer — `plugin-runtime` left with the plugin route.
  // TEST CHANGE, justified (2026-10-14, plan 020 file 2, unit e4-check-model-row): one row more — `model-pins` joined the doctor.
  // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): one row fewer — `plugin-duplicates` left.
  it("passes a valid class file, as the fifteenth row before invariants", async () => {
    const root = await seedRepo(getRepo(), {
      files: {
        [CLASS_FILE]: JSON.stringify({
          // Fixture data kept out of the test-input census: the docs glob is built at run time, as a literal it names the site's svgs.
          classes: { docs: [["website/", "**/*", ".svg"].join("")], tests: ["test/**", "evals/**"] }, // TEST CHANGE, justified: 2026-10-09, run 2026-10-08_product-core, review/70: a docs folder glob is refused, so the docs glob names an extension; still 3 globs
          testInputs: [{ glob: "content/**", tests: "all" }],
        }),
      },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "change-classes")).toEqual({
      id: "change-classes",
      status: "pass",
      detail: `${CLASS_FILE} is valid: 3 glob(s) across 2 class(es), 1 test-input entry(ies)`,
    });
    const ids = doc.doctor.map((entry) => entry.id);
    expect(ids).toHaveLength(15);
    expect(ids.indexOf("change-classes")).toBe(ids.indexOf("invariants") - 1);
  });

  it("fails a class file that matches every path below product, naming the glob", async () => {
    const root = await seedRepo(getRepo(), { files: { [CLASS_FILE]: '{"classes": {"records": ["**"]}}' } });

    const { code, doc } = await runJson(root);

    expect(code).not.toBe(0);
    const verdict = row(doc, "change-classes");
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain(`${CLASS_FILE} is invalid: classes.records[0]: the glob "**" matches every path`);
    // TEST CHANGE, justified: 2026-10-09, review/54 — since review/48 a refused copy still applies its raising
    // entries, so the row no longer says "reads no map"; it says what gate classify applies.
    expect(verdict.detail).toContain(
      "gate classify applies only its product, public-contract and security-sensitive entries, no lowering entry, " +
        "and gives every change at least product",
    );
    expect(verdict.detail).not.toContain("no map");
  });

  // review/54: the row says what a base holding the copy gives, raising entries included.
  it("says a refused copy's raising entries still apply from a base, and no lowering one does", async () => {
    const root = await seedRepo(getRepo(), {
      files: { [CLASS_FILE]: '{"classes": {"security-sensitive": ["lib/**"], "records": ["**"]}}' },
    });

    const verdict = row((await runJson(root)).doc, "change-classes");

    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain('the glob "**" matches every path');
    expect(verdict.detail).toContain(
      "from a base holding this copy, gate classify applies only its product, public-contract and " +
        "security-sensitive entries, no lowering entry, and gives every change at least product",
    );
  });

  it("fails a malformed class file, naming the error, and says how many more there are", async () => {
    const root = await seedRepo(getRepo(), {
      files: { [CLASS_FILE]: '{"classes": {"librarian": ["x/**"], "docs": [""]}}' },
    });

    const verdict = row((await runJson(root)).doc, "change-classes");

    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain('"librarian" is not a change class');
    expect(verdict.detail).toContain("(and 1 more)");
  });

  it("prints the row for a person too", async () => {
    const root = await seedRepo(getRepo(), { files: { [CLASS_FILE]: "{ not json" } });

    const human = await runHuman(root);

    expect(human.code).not.toBe(0);
    expect(human.stdout).toMatch(/^\s+fail\s+change-classes\s+\.stamity\/change-classes\.json is invalid: not valid JSON/m);
  });
});

describe("evaluateExpectations (REQ-PLUGIN-047)", () => {
  function manifestOf(tools: Tool[], generatedBy: string): SetupManifest {
    return createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: generatedBy,
      now: T0,
    });
  }

  it("answers only the fields it was asked, and ok when there are none", () => {
    expect(evaluateExpectations({}, manifestOf(["claude"], "1.12.0"), "1.12.0")).toEqual({ ok: true });
  });

  it("compares clients as sets in TOOLS order, naming missing and extra", () => {
    const report = evaluateExpectations(
      { tools: ["cursor", "claude"] },
      manifestOf(["codex", "claude"], "1.12.0"),
      "1.12.0",
    );
    expect(report).toEqual({
      ok: false,
      tools: { expected: ["claude", "cursor"], recorded: ["claude", "codex"], missing: ["cursor"], extra: ["codex"], ok: false },
    });
  });

  it("matches a version only when the running release and generatedBy both equal it, exactly", () => {
    const fork = manifestOf(["claude"], "1.12.0-acme.1");
    expect(evaluateExpectations({ version: "1.12.0-acme.1" }, fork, "1.12.0-acme.1").ok).toBe(true);
    expect(evaluateExpectations({ version: "1.12.0" }, fork, "1.12.0")).toEqual({
      ok: false,
      version: { expected: "1.12.0", running: "1.12.0", generatedBy: "1.12.0-acme.1", ok: false },
    });
    expect(evaluateExpectations({ version: "1.12.0" }, manifestOf(["claude"], "1.12.0"), "1.13.0").ok).toBe(false);
  });

  // TEST CHANGE, justified (2026-10-14, plan 020 file 1, unit d7-engine): the case that read
  // the install mode off the manifest left with `--expect-mode` and the `plugin-backed` mode.
  it("answers null recorded values and not ok for a manifest it could not read", () => {
    expect(
      evaluateExpectations({ version: "1.12.0", tools: ["claude"] }, null, "1.12.0"),
    ).toEqual({
      ok: false,
      version: { expected: "1.12.0", running: "1.12.0", generatedBy: null, ok: false },
      tools: { expected: ["claude"], recorded: null, missing: [], extra: [], ok: false },
    });
  });
});

/**
 * `model-pins` (REQ-LADDER-008, plan 020 file 2, unit e4-check-model-row): each selected
 * client's pinned and emitted models, compared with the account's own list — read live where
 * the client's CLI answers, else the list the last `sync` saved under `models.listed`; Codex
 * compares with its saved list whenever one exists and is read live (with `--bundled`, so no
 * network refresh) only without one. A model the list lacks warns, naming the client, the
 * class and the model; with nothing to compare the row passes as unverified; it never fails.
 *
 * TEST CHANGE, justified (2026-10-15, review/135 and review/136, both signed off): the cases
 * that read Codex live beside a saved list now read Copilot or Cursor, whose live list is the
 * catalogue `sync` reads; Codex with a saved list starts no client, and its bundled read is
 * labelled as such. The claims each case makes are unchanged.
 */
describe("check — cloud-install (REQ-FLOW-111)", () => {
  function manifestFor(tools: Tool[]): SetupManifest {
    return createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "1.16.0",
      now: T0,
    });
  }

  const CANONICAL_CALL = { packageName: canonical().name, npmChannel: true } as const;

  it("prints no row without Cursor selected", () => {
    expect(checkCloudInstall(manifestFor(["claude", "copilot", "codex"]), CANONICAL_CALL, ">=22.22.2")).toBeNull();
    expect(checkCloudInstall(null, CANONICAL_CALL, ">=22.22.2")).toBeNull();
  });

  it("gives Cursor the install lines at the version the setup was generated with, and never fails", () => {
    const verdict = checkCloudInstall(manifestFor(["claude", "cursor"]), CANONICAL_CALL, ">=22.22.2");

    expect(verdict?.id).toBe("cloud-install");
    expect(verdict?.status).toBe("pass");
    const lines = (verdict?.detail ?? "").split("\n");
    // The lines a Cursor environment's install step runs, each alone on its own line.
    expect(lines.slice(1)).toEqual(["node --version", `npm install --global ${CANONICAL_CALL.packageName}@1.16.0`]);
    // The hard needs and the Node floor are named, and where the lines go.
    expect(lines[0]).toContain("gate scan and ledger status");
    expect(lines[0]).toContain("Node >=22.22.2");
    expect(lines[0]).toContain("no .cursor/environment.json is written");
  });

  it("carries a fork's package and registry into the install line", () => {
    const registry = "https://npm.acme.example/registry";
    const verdict = checkCloudInstall(
      manifestFor(["cursor"]),
      { packageName: "@acme/stamity", npmChannel: true, registry },
      null,
    );

    expect(verdict?.detail.split("\n").at(-1)).toBe(`npm install --global --@acme:registry=${registry} @acme/stamity@1.16.0`);
    // No declared range: no Node floor is invented.
    expect(verdict?.detail).not.toContain("Node >=");
  });

  it("names no registry install for a package with no npm channel, and still passes", () => {
    const verdict = checkCloudInstall(manifestFor(["cursor"]), { packageName: "@acme/stamity", npmChannel: false }, ">=22.22.2");

    expect(verdict?.status).toBe("pass");
    expect(verdict?.detail).not.toContain("npm install");
    expect(verdict?.detail).toContain("no npm channel");
    expect(verdict?.detail.split("\n").slice(1)).toEqual(["node --version"]);
  });

  it("is a row of check's own run with Cursor selected, before invariants", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "cursor"] });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    const verdict = row(doc, "cloud-install");
    expect(verdict.status).toBe("pass");
    // This checkout's own identity, so a fork's run reads its own package here.
    const identity = canonical();
    expect(verdict.detail).toContain(
      identity.npmChannel
        ? npxCommandOf(identity, "").replace(/^npx -y /, "npm install --global ").trimEnd()
        : "no npm channel",
    );
    const ids = doc.doctor.map((entry) => entry.id);
    expect(ids.indexOf("cloud-install")).toBe(ids.indexOf("model-pins") + 1);
    expect(ids.indexOf("cloud-install")).toBe(ids.indexOf("invariants") - 1);
  });

  it("is absent from check's own run without Cursor", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "copilot"] });

    const { doc } = await runJson(root);

    expect(doc.doctor.map((entry) => entry.id)).not.toContain("cloud-install");
  });

  // REQ-FLOW-114, build/38: a `skip` on the root AGENTS.md keeps Cursor's cloud block out of the
  // file a Cursor cloud agent reads, and only the sync that recorded it said so.
  it("warns, and never fails, when the root AGENTS.md is recorded as skip, naming the block and the remedy", () => {
    const manifest: SetupManifest = {
      ...manifestFor(["claude", "cursor"]),
      importChoice: [{ path: AGENTS_MD_FILE, mode: "skip" }],
    };

    const verdict = checkCloudInstall(manifest, CANONICAL_CALL, ">=22.22.2");

    expect(verdict?.status).toBe("warn");
    const lines = (verdict?.detail ?? "").split("\n");
    expect(lines[0]).toContain(`${AGENTS_MD_FILE} is recorded as "skip"`);
    expect(lines[0]).toContain("Cursor Cloud specific instructions");
    expect(lines[0]).toContain('"supplement"');
    expect(lines[0]).toContain(`${STATE_DIR}/manifest.json`);
    // The install lines are still the row's, after the warning.
    expect(lines.slice(-2)).toEqual(["node --version", `npm install --global ${CANONICAL_CALL.packageName}@1.16.0`]);
  });

  it("stays a pass for a skip on another path and for supplement or replace on AGENTS.md", () => {
    for (const importChoice of [
      [{ path: "GEMINI.md", mode: "skip" }],
      [{ path: AGENTS_MD_FILE, mode: "supplement" }],
      [{ path: AGENTS_MD_FILE, mode: "replace" }],
    ] as const) {
      const manifest: SetupManifest = { ...manifestFor(["cursor"]), importChoice };
      expect(checkCloudInstall(manifest, CANONICAL_CALL, ">=22.22.2")?.status, JSON.stringify(importChoice)).toBe("pass");
    }
    // Without Cursor a skip prints no row at all.
    const noCursor: SetupManifest = { ...manifestFor(["claude"]), importChoice: [{ path: AGENTS_MD_FILE, mode: "skip" }] };
    expect(checkCloudInstall(noCursor, CANONICAL_CALL, ">=22.22.2")).toBeNull();
  });

  it("warns in check's own run with Cursor selected and the root AGENTS.md recorded as skip", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "cursor"] });
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("fixture lost its manifest");
    // A skipped file has no ledger row: the engine never records one, and the manifest refuses one.
    await writeManifest(
      root,
      {
        ...manifest,
        ledger: manifest.ledger.filter((entry) => entry.path !== AGENTS_MD_FILE),
        importChoice: [{ path: AGENTS_MD_FILE, mode: "skip" }],
      },
      { now: T0 },
    );

    const { doc } = await runJson(root);

    const verdict = row(doc, "cloud-install");
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(`${AGENTS_MD_FILE} is recorded as "skip"`);
  });
});

describe("check — model-pins", () => {
  const CODEX_SAVED = { ids: ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"], source: "codex-debug-models" } as const;

  function pinnedManifest(tools: Tool[], models: SetupManifest["models"]): SetupManifest {
    const manifest = createManifest({
      tools,
      selection: { items: { agent: [], skill: [], rule: [], command: [] } },
      generatorVersion: "1.15.0",
      now: T0,
    });
    return models === undefined ? manifest : { ...manifest, models };
  }

  /**
   * A stand-in for `listClientModels`, recording each call. Justified fake: the real lister
   * starts the machine's own client CLIs, which read its accounts and may go to the network —
   * no unit test may. The command-level cases below start a real program on a scoped PATH.
   */
  function fakeLister(answers: Partial<Record<Tool, ModelListOutcome>>): {
    lister: ModelLister;
    calls: { tool: Tool; codexBundled: boolean | undefined }[];
  } {
    const calls: { tool: Tool; codexBundled: boolean | undefined }[] = [];
    const lister: ModelLister = (tool, _env, _cwd, options) => {
      calls.push({ tool, codexBundled: options?.codexBundled });
      return Promise.resolve(answers[tool] ?? { kind: "absent" });
    };
    return { lister, calls };
  }

  it("warns naming codex, the class and the model when the saved list lacks the pin", async () => {
    const manifest = pinnedManifest(["claude", "codex"], {
      pins: { standard: { codex: "gpt-5.5" } },
      listed: { codex: { ...CODEX_SAVED, ids: [...CODEX_SAVED.ids] } },
    });
    const { lister, calls } = fakeLister({ codex: { kind: "listed", ids: ["gpt-5.5"], source: "codex-debug-models" } });

    const verdict = await checkModelPins(manifest, { STAMITY_NO_CLIENT_PROBE: "1" }, lister, "/repo");

    expect(verdict.id).toBe("model-pins");
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(`codex standard: the pinned model "gpt-5.5" is not on codex's list (saved by the last sync)`);
    expect(verdict.detail).toContain(npxCommand("config set model.standard.codex <id>"));
    // The switch reads the saved list only: no client is started, even one that would answer.
    expect(calls).toEqual([]);
    // Only the unlisted model is named; the classes the saved list holds are not.
    expect(verdict.detail.split("\n")).toHaveLength(1);
  });

  it("passes as unverified when no client CLI is on PATH and no list was saved", async () => {
    const manifest = pinnedManifest(["claude", "cursor", "codex"], { pins: { standard: { codex: "gpt-5.5" } } });
    const { lister, calls } = fakeLister({});

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail:
        "cursor: unverified — no cursor CLI on PATH and no saved list; " +
        "codex: unverified — no codex CLI on PATH and no saved list",
    });
    expect(calls.map((call) => call.tool)).toEqual(["cursor", "codex"]);
    // With the switch set, the same answer says why no client was asked.
    expect((await checkModelPins(manifest, { STAMITY_NO_CLIENT_PROBE: "1" }, lister, "/repo")).detail).toBe(
      "cursor: unverified — client probe off (STAMITY_NO_CLIENT_PROBE=1) and no saved list; " +
        "codex: unverified — client probe off (STAMITY_NO_CLIENT_PROBE=1) and no saved list",
    );
  });

  it("reads the live list before the saved one", async () => {
    const manifest = pinnedManifest(["copilot"], {
      pins: { standard: { all: "gpt-5.5" } },
      listed: { copilot: { ids: ["gpt-5.5", ...CODEX_SAVED.ids], source: "copilot-help-config" } },
    });
    const { lister, calls } = fakeLister({ copilot: { kind: "listed", ids: [...CODEX_SAVED.ids], source: "copilot-help-config" } });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(calls.map((call) => call.tool)).toEqual(["copilot"]);
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toBe(
      `copilot standard: the pinned model "gpt-5.5" is not on copilot's list (read live); pin a listed one with ` +
        npxCommand("config set model.standard.copilot <id>"),
    );
  });

  // review/136: `sync` saves the list Codex resolves normally, and the bundled catalogue check
  // could read offline can lag it, so a model `sync` picked legitimately would read as unlisted.
  it("compares Codex with its saved list whenever one exists, and reads --bundled only without one", async () => {
    // The live answer lacks the pin: read, it would warn.
    const answers: Partial<Record<Tool, ModelListOutcome>> = {
      codex: { kind: "listed", ids: [...CODEX_SAVED.ids], source: "codex-debug-models" },
    };
    const saved = pinnedManifest(["codex"], {
      pins: { standard: { all: "gpt-5.5" } },
      listed: { codex: { ids: ["gpt-5.5", ...CODEX_SAVED.ids], source: "codex-debug-models" } },
    });
    const withSaved = fakeLister(answers);

    expect(await checkModelPins(saved, {}, withSaved.lister, "/repo")).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "codex: 4 class(es), each pinned or emitted model on the list (saved by the last sync)",
    });
    expect(withSaved.calls).toEqual([]);

    const unsaved = pinnedManifest(["codex"], { pins: { standard: { all: "gpt-5.5" } } });
    const without = fakeLister(answers);

    const verdict = await checkModelPins(unsaved, {}, without.lister, "/repo");

    expect(without.calls).toEqual([{ tool: "codex", codexBundled: true }]);
    expect(verdict.detail).toBe(
      `codex standard: the pinned model "gpt-5.5" is not on codex's list (read live from its bundled catalogue; ` +
        `no list saved); pin a listed one with ${npxCommand("config set model.standard.codex <id>")}`,
    );
  });

  it("warns on an emitted model the live list no longer holds, and names sync", async () => {
    // No pin: emission picks from the saved list, which still holds gpt-6-luna for economy.
    const manifest = pinnedManifest(["copilot"], {
      listed: { copilot: { ids: ["gpt-6-sol", "gpt-6-luna"], source: "copilot-help-config" } },
    });
    const { lister } = fakeLister({ copilot: { kind: "listed", ids: ["gpt-6-sol"], source: "copilot-help-config" } });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(verdict.status).toBe("warn");
    // One line for the class: the change a sync would make is not said a second time.
    expect(verdict.detail).toBe(
      `copilot economy: the emitted model "gpt-6-luna" is not on copilot's list (read live); ` +
        `${npxCommand("sync")} reads the list again and re-picks`,
    );
  });

  // review/135: the saved list lacked the pin, so emission re-picked; the live list holds both
  // the pin and the re-pick, so neither is unlisted, yet a sync would write the pin back.
  it("warns when a sync would change the emitted model, naming both models, and says it once per class", async () => {
    const manifest = pinnedManifest(["copilot"], {
      pins: { standard: { copilot: "claude-sonnet-5" } },
      listed: { copilot: { ids: ["gpt-6-sol"], source: "copilot-help-config" } },
    });
    const { lister } = fakeLister({
      copilot: { kind: "listed", ids: ["claude-sonnet-5", "gpt-6-sol"], source: "copilot-help-config" },
    });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toBe(
      `copilot standard: ${npxCommand("sync")} would change the emitted model from "gpt-6-sol" to "claude-sonnet-5"; ` +
        `the files carry the pick from the list the last sync saved, and copilot's list (read live) resolves another`,
    );

    // A class that already warns is not warned about twice: here the live list lacks both the
    // pin and the re-pick, and a sync would also pick a third model.
    const listedElsewhere = await checkModelPins(
      pinnedManifest(["copilot"], {
        pins: { standard: { copilot: "claude-opus-9" } },
        listed: { copilot: { ids: ["gpt-6-sol"], source: "copilot-help-config" } },
      }),
      {},
      fakeLister({ copilot: { kind: "listed", ids: ["gpt-5.6-terra"], source: "copilot-help-config" } }).lister,
      "/repo",
    );
    expect(listedElsewhere.detail.split("\n")).toEqual([
      `copilot standard: the pinned model "claude-opus-9" is not on copilot's list (read live); pin a listed one with ` +
        npxCommand("config set model.standard.copilot <id>"),
      `copilot standard: the emitted model "gpt-6-sol" is not on copilot's list (read live); ` +
        `${npxCommand("sync")} reads the list again and re-picks`,
    ]);
  });

  // review/135, round 1b (signed off): with no saved list Cursor's files carry no model for an
  // unpinned class, and a sync now would save the live list and pick from it.
  // TEST CHANGE, justified (ledger row 2026-10-14_cli-native/qa/1): this case read "warns when a
  // sync would change the emitted model where no list was saved" and expected Cursor's live list
  // to give an unpinned class a model. Cursor now writes no model unless one is pinned, so a sync
  // changes nothing there and the row passes; Copilot's case above still covers the warning.
  it("passes an unpinned Cursor class whatever its live list holds, and warns only on a pin", async () => {
    const live = { kind: "listed", ids: ["claude-sonnet-5-5-medium"], source: "cursor-agent-models" } as const;
    const answers: Partial<Record<Tool, ModelListOutcome>> = { cursor: { ...live, ids: [...live.ids] } };

    // Non-degenerate: the live list holds the variant the old pick took for `standard`.
    const verdict = await checkModelPins(pinnedManifest(["cursor"], undefined), {}, fakeLister(answers).lister, "/repo");

    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "cursor: no model pinned or emitted to compare (read live)",
    });

    // A saved list changes nothing either: no class is picked from it.
    const saved = await checkModelPins(
      pinnedManifest(["cursor"], { listed: { cursor: { ids: [...live.ids], source: "cursor-agent-models" } } }),
      { STAMITY_NO_CLIENT_PROBE: "1" },
      fakeLister({}).lister,
      "/repo",
    );
    expect(saved.detail).toBe("cursor: no model pinned or emitted to compare (saved by the last sync)");

    // A pin the list lacks warns once: the files carry it as typed, and a sync keeps it.
    const pinned = await checkModelPins(
      pinnedManifest(["cursor"], { pins: { standard: { all: "vendor-x-1" } } }),
      {},
      fakeLister(answers).lister,
      "/repo",
    );
    expect(pinned.detail).toBe(
      `cursor standard: the pinned model "vendor-x-1" is not on cursor's list (read live); pin a listed one with ` +
        npxCommand("config set model.standard.cursor <id>"),
    );
  });

  it("passes when every pinned and emitted model is on the list, counting them", async () => {
    const manifest = pinnedManifest(["claude", "copilot"], {
      pins: { advanced: { copilot: "gpt-6-sol" } },
      listed: { copilot: { ids: ["gpt-6-sol", "gpt-6-luna"], source: "copilot-help-config" } },
    });
    const { lister } = fakeLister({ copilot: { kind: "listed", ids: ["gpt-6-sol", "gpt-6-luna"], source: "copilot-help-config" } });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    // Frontier resolves no model from either list, so three classes are compared.
    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "copilot: 3 class(es), each pinned or emitted model on the list (read live)",
    });
  });

  // TEST CHANGE, justified (2026-10-15, ledger row 2026-10-14_cli-native/review/144): a Cursor pin
  // the broad list holds now reads unverified rather than "on the list", since Cursor checks a
  // sub-agent's model against a narrower list; the family rule this case pins is unchanged.
  it("counts a Cursor family pin the list carries per effort variant as listed", async () => {
    const manifest = pinnedManifest(["cursor"], { pins: { advanced: { all: "claude-opus-4-8" } } });
    const { lister } = fakeLister({
      cursor: { kind: "listed", ids: ["auto", "claude-opus-4-8-high", "claude-opus-4-8-low"], source: "cursor-agent-models" },
    });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    // Only the pinned class has a model: with no saved list Cursor emits none for the rest.
    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail:
        `cursor: unverified — the pinned model(s) advanced "claude-opus-4-8" are on cursor's list (read live), ` +
        "but Cursor checks a sub-agent's model against a narrower list that no command prints",
    });
    // The other side of the family rule: only an exact effort variant counts, so a pin that a
    // listed id merely starts with (`claude-opus-4` before `claude-opus-4-8-high`) still warns.
    const off = await checkModelPins(
      pinnedManifest(["cursor"], { pins: { advanced: { all: "claude-opus-4" } } }),
      {},
      lister,
      "/repo",
    );
    expect(off.status).toBe("warn");
    expect(off.detail).toContain(`cursor advanced: the pinned model "claude-opus-4" is not on cursor's list`);
  });

  // review/144: `agent models` prints the broad list, and Cursor checks a sub-agent call's model
  // against a narrower one that no command prints, so a pin the broad list holds can still be
  // refused. The row says so rather than reporting it as on the list.
  it("reports a Cursor pin the broad list holds as unverified, and keeps the warning for one it lacks", async () => {
    const live = { kind: "listed", ids: ["claude-sonnet-5-5", "gpt-6-sol"], source: "cursor-agent-models" } as const;
    const answers: Partial<Record<Tool, ModelListOutcome>> = { cursor: { ...live, ids: [...live.ids] } };
    const reason = "but Cursor checks a sub-agent's model against a narrower list that no command prints";

    const held = await checkModelPins(
      pinnedManifest(["cursor"], { pins: { standard: { all: "claude-sonnet-5-5" }, economy: { cursor: "gpt-6-sol" } } }),
      {},
      fakeLister(answers).lister,
      "/repo",
    );
    expect(held).toEqual({
      id: "model-pins",
      status: "pass",
      detail: `cursor: unverified — the pinned model(s) standard "claude-sonnet-5-5", economy "gpt-6-sol" are on cursor's list (read live), ${reason}`,
    });
    expect(held.detail).not.toContain("each pinned or emitted model on the list");

    // The same from the saved list, and beside a pin the list lacks, which still warns: the
    // unverified line is kept under the warning rather than dropped.
    const mixed = await checkModelPins(
      pinnedManifest(["cursor"], {
        pins: { standard: { all: "claude-sonnet-5-5" }, advanced: { cursor: "vendor-x-1" } },
        listed: { cursor: { ids: [...live.ids], source: "cursor-agent-models" } },
      }),
      { STAMITY_NO_CLIENT_PROBE: "1" },
      fakeLister({}).lister,
      "/repo",
    );
    expect(mixed.status).toBe("warn");
    expect(mixed.detail.split("\n")).toEqual([
      `cursor advanced: the pinned model "vendor-x-1" is not on cursor's list (saved by the last sync); pin a listed one with ` +
        npxCommand("config set model.advanced.cursor <id>"),
      `cursor: unverified — the pinned model(s) standard "claude-sonnet-5-5" are on cursor's list (saved by the last sync), ${reason}`,
    ]);

    // Control: Copilot's list is the one its sub-agents take, so a held pin there still passes as listed.
    const copilot = await checkModelPins(
      pinnedManifest(["copilot"], { pins: { standard: { copilot: "gpt-6-sol" } } }),
      {},
      fakeLister({ copilot: { kind: "listed", ids: ["gpt-6-sol"], source: "copilot-help-config" } }).lister,
      "/repo",
    );
    expect(copilot.detail).not.toContain("unverified");
  });

  it("reads a pin with bracket options the way emission does", async () => {
    // The row and the resolver share one "list holds this pin" test, so the row warns on a
    // bracketed pin exactly where emission re-picks it. The resolver judges the id before `[`
    // untrimmed: `gpt-6-sol[effort=high]` is kept, `gpt-6-sol [effort=high]` looks up
    // "gpt-6-sol " and is re-picked, and the row says so rather than passing on the trimmed id.
    const saved = [...CODEX_SAVED.ids];
    const verdictFor = async (pin: string) => {
      const manifest = pinnedManifest(["codex"], {
        pins: { standard: { codex: pin } },
        listed: { codex: { ...CODEX_SAVED, ids: saved } },
      });
      const emitted = resolveModelValue("standard", "codex", pinsFor(manifest.models, "codex"), {}, { listed: saved });
      const verdict = await checkModelPins(manifest, { STAMITY_NO_CLIENT_PROBE: "1" }, fakeLister({}).lister, "/repo");
      return { emitted, verdict };
    };

    const kept = await verdictFor("gpt-6-sol[effort=high]");
    expect(kept.emitted).toBe("gpt-6-sol[effort=high]");
    expect(kept.verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "codex: 4 class(es), each pinned or emitted model on the list (saved by the last sync)",
    });

    const repicked = await verdictFor("gpt-6-sol [effort=high]");
    expect(repicked.emitted).not.toBe("gpt-6-sol [effort=high]");
    expect(saved).toContain(repicked.emitted);
    expect(repicked.verdict.status).toBe("warn");
    expect(repicked.verdict.detail).toBe(
      `codex standard: the pinned model "gpt-6-sol " is not on codex's list (saved by the last sync); pin a listed one with ` +
        npxCommand("config set model.standard.codex <id>"),
    );
  });

  it("falls back to the saved list when the live read times out, and is unverified with neither", async () => {
    const manifest = pinnedManifest(["cursor", "copilot"], {
      pins: { standard: { all: "gpt-5.5" } },
      listed: { cursor: { ids: [...CODEX_SAVED.ids], source: "cursor-agent-models" } },
    });
    const { lister } = fakeLister({ cursor: { kind: "timeout" }, copilot: { kind: "timeout" } });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(verdict.status).toBe("warn");
    expect(verdict.detail.split("\n")).toEqual([
      `cursor standard: the pinned model "gpt-5.5" is not on cursor's list (saved by the last sync); pin a listed one with ` +
        npxCommand("config set model.standard.cursor <id>"),
      "copilot: unverified — the copilot CLI did not answer within 10 s and no saved list",
    ]);
  });

  it("flattens control characters a pin carries before printing it", async () => {
    const manifest = pinnedManifest(["codex"], {
      pins: { standard: { codex: "bad\u0007\u001bid" } },
      listed: { codex: { ...CODEX_SAVED, ids: [...CODEX_SAVED.ids] } },
    });

    const verdict = await checkModelPins(manifest, { STAMITY_NO_CLIENT_PROBE: "1" }, fakeLister({}).lister, "/repo");

    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(`the pinned model "badid"`);
    expect(verdict.detail).not.toContain("\u0007");
    expect(verdict.detail).not.toContain("\u001b");
  });

  // review/89: the lister's own message is the reason an unreadable read prints, and it is text
  // a client program wrote, so the row cleans it before printing: a line break reads as a space,
  // other control characters are dropped.
  it("says why an unreadable live read left a client unverified, its message cleaned", async () => {
    const manifest = pinnedManifest(["copilot"], { pins: { standard: { all: "gpt-5.5" } } });
    const { lister, calls } = fakeLister({
      copilot: { kind: "unreadable", message: "`copilot help config` exited 2:\u0007 bad\u001b[31m\nflag" },
    });

    const verdict = await checkModelPins(manifest, {}, lister, "/repo");

    expect(calls.map((call) => call.tool)).toEqual(["copilot"]);
    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "copilot: unverified — `copilot help config` exited 2: bad[31m flag and no saved list",
    });
  });

  it("passes with nothing to list for a Claude-only setup or no readable manifest", async () => {
    const { lister, calls } = fakeLister({});

    expect(await checkModelPins(pinnedManifest(["claude"], undefined), {}, lister, "/repo")).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "no selected client lists its models (claude runs on its family aliases)",
    });
    expect(await checkModelPins(null, {}, lister, "/repo")).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "no readable manifest, so no model pins to verify",
    });
    expect(calls).toEqual([]);
  });

  /** A folder outside the test repository's tree: the lister never starts a program the repository holds. */
  const getBin = useTempDir("stamity-check-bin");

  /**
   * A `codex` on a PATH holding only `bin`, in a folder beside the repository: it prints a
   * one-model catalogue when asked for the bundled list, and leaves a marker file behind on
   * every start, so a case can tell whether the row started it at all.
   */
  async function fakeCodex(handle: TempDirHandle): Promise<{ env: Record<string, string>; marker: string }> {
    const marker = handle.path("codex-started");
    await handle.seedFiles({
      "bin/codex": [
        "#!/bin/sh",
        `: > '${marker}'`,
        'if [ "$1 $2 $3" = "debug models --bundled" ]; then',
        `  printf '%s\\n' '{"models":[{"slug":"gpt-6-sol"}]}'`,
        "  exit 0",
        "fi",
        "exit 3",
        "",
      ].join("\n"),
    });
    await chmod(handle.path("bin", "codex"), 0o755);
    return { env: { PATH: [handle.path("bin"), "/usr/bin", "/bin"].join(delimiter) }, marker };
  }

  // TEST CHANGE, justified (v17-model-list-cache, REQ-LADDER-009): a `listed` block is kept in the
  // git-ignored cache now, never in the manifest, so the helper seeds it there and the rest in the manifest.
  async function pinCodex(root: string, models: SetupManifest["models"]): Promise<void> {
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("the fixture wrote no manifest");
    const { listed, ...rest } = models ?? {};
    if (listed !== undefined) await writeFile(join(root, STATE_DIR, "client-models.json"), `${JSON.stringify({ listed })}\n`);
    await writeManifest(root, { ...manifest, ...(models === undefined ? {} : { models: rest }) }, { now: T0 });
  }

  const posixOnly = process.platform === "win32" ? it.skip : it;

  posixOnly("check --json carries the row as model-pins, after pack-reach, read off a live codex", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-5.5" } } });
    const { env, marker } = await fakeCodex(getBin());

    const { doc } = await runJson(root, env);

    const ids = doc.doctor.map((entry) => entry.id);
    expect(ids.indexOf("model-pins")).toBe(ids.indexOf("pack-reach") + 1);
    const verdict = row(doc, "model-pins");
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(
      `codex standard: the pinned model "gpt-5.5" is not on codex's list (read live from its bundled catalogue; no list saved)`,
    );
    expect(existsSync(marker)).toBe(true);
  });

  // review/126: run in a workspace member, the row keeps the WORKSPACE root out of the lister's
  // reach, as `workspace sync` does: a folder another repository of the workspace can write into
  // supplies no client program. The control read before `workspace.json` exists starts it.
  posixOnly("never starts a codex placed inside the workspace but outside the member", async () => {
    const handle = getBin();
    const member = handle.path("ws", "apps", "api");
    await writeManifest(member, pinnedManifest(["codex"], { pins: { standard: { codex: "gpt-5.5" } } }), { now: T0 });
    const { marker } = await fakeCodex(handle);
    const inWorkspace = handle.path("ws", "tools", "bin");
    await mkdir(inWorkspace, { recursive: true });
    await rename(handle.path("bin", "codex"), join(inWorkspace, "codex"));
    const env = { PATH: [inWorkspace, "/usr/bin", "/bin"].join(delimiter) };

    // Control: with no workspace around the member, the folder lies outside its tree and the program starts.
    expect((await doctorRow(member, "model-pins", env)).detail).toContain("(read live from its bundled catalogue");
    expect(existsSync(marker)).toBe(true);

    await rm(marker);
    await handle.seedFiles({
      "ws/workspace.json": `${JSON.stringify({ version: "1.0.0", defaults: { tools: ["codex"] }, repos: [{ path: "apps/api" }] })}\n`,
    });

    const verdict = await doctorRow(member, "model-pins", env);

    expect(verdict.detail).not.toContain("(read live");
    expect(existsSync(marker)).toBe(false);
  });

  posixOnly("reads only the saved list under STAMITY_NO_CLIENT_PROBE=1, starting no client", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, { tools: ["claude", "codex"] });
    await pinCodex(root, {
      pins: { standard: { codex: "gpt-5.5" } },
      listed: { codex: { ids: ["gpt-5.5", "gpt-6-astra", "gpt-6-luna"], source: "codex-debug-models" } },
    });
    const { env, marker } = await fakeCodex(getBin());

    const verdict = await doctorRow(root, "model-pins", { ...env, STAMITY_NO_CLIENT_PROBE: "1" });

    expect(verdict).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "codex: 4 class(es), each pinned or emitted model on the list (saved by the last sync)",
    });
    expect(existsSync(marker)).toBe(false);
  });

  it("puts each further line under the detail column, and no padding in the --json detail", async () => {
    // review/41: continuation lines were joined with a fixed 25-space indent,
    // four columns left of the detail column, and the spaces shipped in --json.
    // TEST CHANGE, justified (v16-manifest-plugin-block, REQ-PLUGIN-016): moved here from
    // `plugin-duplicates`, which left; two codex pins the saved list lacks make this row's
    // warning the multi-line one. The probe is off, so no client starts.
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, {
      pins: { standard: { codex: "gpt-4-retired" }, advanced: { codex: "gpt-3-retired" } },
      listed: { codex: { ids: ["gpt-6-astra", "gpt-6-luna"], source: "codex-debug-models" } },
    });
    const env = { STAMITY_NO_CLIENT_PROBE: "1" };

    const { doc } = await runJson(root, env);
    const probe = row(doc, "model-pins");
    const lines = probe.detail.split("\n");
    expect(probe.status).toBe("warn");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.every((line) => line === line.trim())).toBe(true);

    const human = await runHuman(root, env);
    const width = Math.max(...doc.doctor.map((entry) => entry.id.length));
    const column = 2 + 4 + 2 + width + 2;
    const out = human.stdout.split("\n");
    const first = out.findIndex((line) => line.includes(lines[0]!));
    expect(first).toBeGreaterThan(-1);
    expect(out[first]!.indexOf(lines[0]!)).toBe(column);
    for (const [index, line] of lines.entries()) {
      if (index > 0) expect(out[first + index]).toBe(`${" ".repeat(column)}${line}`);
    }
  });
  // REQ-LADDER-009: the account's list lives in a git-ignored cache, so a fresh clone has none.
  const CACHE = join(STATE_DIR, "client-models.json");
  /** An account whose Codex list lacks the shipped entry 0 of frontier, advanced and economy. */
  const OTHER_CODEX = { codex: { ids: ["gpt-5.6-terra", "gpt-6-sol", "gpt-5.6-luna"], source: "codex-debug-models" as const } };

  it("reads a fresh clone with no cache as no drift, keeping the pick the files carry, and the row unverified", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    const engineVersion = createApp().version;
    const plan = await planSync(root, engineVersion, { listedOverlay: structuredClone(OTHER_CODEX) });
    await applySync(root, plan, { engineVersion, force: false, dryRun: false, now: T0 });
    const map = JSON.parse(await readFile(join(root, STATE_DIR, "generated", "models", "codex.json"), "utf8")) as {
      classes: Record<string, { model?: string }>;
    };
    // The list moved the pick off the shipped entry 0, so a plan with no list would differ.
    expect(map.classes["economy"]?.model).toBe("gpt-5.6-luna");
    expect(map.classes["frontier"]?.model).toBe("gpt-6-sol");
    expect(JSON.stringify(JSON.parse(await readFile(join(root, STATE_DIR, "manifest.json"), "utf8")))).not.toContain(
      '"listed"',
    );

    await rm(join(root, CACHE));
    const { code, doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(code).toBe(0);
    expect(row(doc, "model-pins")).toEqual({
      id: "model-pins",
      status: "pass",
      detail: "codex: unverified — client probe off (STAMITY_NO_CLIENT_PROBE=1) and no saved list",
    });
  });

  // W-1 of the unit's first round: Cursor's map drops the effort group a list decides, so its
  // agent files, which the ledger names, are what keep a listed pin bare in a fresh clone.
  it("reads a fresh clone with no cache as no drift for a Cursor pin that came from a list", async () => {
    const handle = getRepo();
    await handle.seedFiles({
      "corpus/agents/stamity-creator.md": await readFile(fileURLToPath(new URL("../../../content/agents/stamity-creator.md", import.meta.url)), "utf8"),
    });
    const root = await seedRepo(handle, { tools: ["claude", "cursor"] });
    await pinCodex(root, { pins: { standard: { cursor: "composer-9" } } });
    const engineVersion = createApp().version;
    const plan = await planSync(root, engineVersion, {
      listedOverlay: { cursor: { ids: ["composer-9", "composer-8"], source: "cursor-agent-models" } },
    });
    await applySync(root, plan, { engineVersion, force: false, dryRun: false, now: T0 });
    // The list held the pin, so the agent carries it bare; with no list it would take an effort group.
    expect(await readFile(join(root, ".cursor", "agents", "stamity-creator.md"), "utf8")).toMatch(/^model: composer-9$/m);

    await rm(join(root, CACHE));
    const { code, doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(code).toBe(0);
  });

  it("warns, naming the client and the class, on a cache another account's list filled, and still exits 0", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-6-sol" } } });
    // Another account's list, cached on this machine: it lacks the pinned model.
    await writeFile(join(root, CACHE), `${JSON.stringify({ listed: { codex: { ids: ["gpt-6-astra"], source: "codex-debug-models" } } })}\n`);

    const { code, doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    const verdict = row(doc, "model-pins");
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(`codex standard: the pinned model "gpt-6-sol" is not on codex's list (saved by the last sync)`);
    expect(doc.doctor.some((entry) => entry.status === "fail")).toBe(false);
    expect(code).toBe(0);
  });

  it("warns naming a cache it will not read, past the 200-id ceiling, and reads no list from it", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    const flood = Array.from({ length: 201 }, (_unused, index) => `gpt-flood-${index}`);
    await writeFile(join(root, CACHE), `${JSON.stringify({ listed: { codex: { ids: flood, source: "codex-debug-models" } } })}\n`);

    const verdict = await doctorRow(root, "model-pins", { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain("the model list cache .stamity/client-models.json was not read");
    expect(verdict.detail).toContain("codex: unverified — client probe off (STAMITY_NO_CLIENT_PROBE=1) and no saved list");
  });
  /** The class-to-model map the last sync wrote for Codex. */
  async function codexMap(root: string): Promise<Record<string, { model?: string; fallbacks: string[] }>> {
    const map = JSON.parse(await readFile(join(root, STATE_DIR, "generated", "models", "codex.json"), "utf8")) as {
      classes: Record<string, { model?: string; fallbacks: string[] }>;
    };
    return map.classes;
  }

  /** A live sync at this build's version, with `overlay` read fresh. */
  async function syncNow(root: string, overlay?: NonNullable<Parameters<typeof planSync>[2]>["listedOverlay"]): Promise<void> {
    const engineVersion = createApp().version;
    const plan = await planSync(root, engineVersion, overlay === undefined ? {} : { listedOverlay: structuredClone(overlay) });
    await applySync(root, plan, { engineVersion, force: false, dryRun: false, now: T0 });
  }

  // review/115: the list read off the files holds the manifest's pins too, so a pin the map
  // lacks is not re-picked to a shipped model: an unsynced pin edit is drift, with a cache that
  // holds the pin or with none, and a sync on a checkout with no cache writes the pin.
  it("reads an unsynced Codex pin the map lacks as drift, and a sync with no cache writes the pin", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await syncNow(root, OTHER_CODEX);
    expect((await codexMap(root))["standard"]?.model).toBe("gpt-6-sol");
    await pinCodex(root, {
      pins: { standard: { codex: "gpt-9-custom" } },
      listed: { codex: { ids: [...OTHER_CODEX.codex.ids, "gpt-9-custom"], source: "codex-debug-models" } },
    });

    const withCache = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });
    await rm(join(root, CACHE));
    const withoutCache = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(withCache.doc.drift?.clean).toBe(false);
    expect(withoutCache.doc.drift?.clean).toBe(false);
    await syncNow(root);
    expect((await codexMap(root))["standard"]?.model).toBe("gpt-9-custom");
    // The other classes keep the pick the list made.
    expect((await codexMap(root))["frontier"]?.model).toBe("gpt-6-sol");
    expect((await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" })).doc.drift?.clean).toBe(true);
  });

  // review/115, the other side: where this machine's list lacks the pin, sync re-picks it, so the
  // drift gate does too, and a check straight after that sync reads no drift.
  it("reads no drift straight after a sync whose cached list lacked the Codex pin, which it re-picked", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-custom" } } });
    await syncNow(root, OTHER_CODEX);
    expect((await codexMap(root))["standard"]?.model).toBe("gpt-6-sol");

    const { doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(row(doc, "model-pins").detail).toContain(`codex standard: the pinned model "gpt-9-custom" is not on codex's list`);
  });

  // review/118: the map records the pin a sync could not honour beside the pick it made instead, so
  // a checkout with no cache (CI, a fresh clone) keeps that replacement, while a pin the map does not
  // record as replaced still reads as drift, and an account whose list holds the pin writes it.
  it("reads no drift with no cache on a Codex pin the map records as replaced, and a sync with no cache keeps it", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-custom" } } });
    await syncNow(root, OTHER_CODEX);
    expect((await codexMap(root))["standard"]).toEqual({
      model: "gpt-6-sol",
      fallbacks: ["gpt-5.6-terra"],
      pinReplaced: { pin: "gpt-9-custom", by: "gpt-6-sol" },
    });
    await rm(join(root, CACHE));

    const { code, doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0, reclaim: [] });
    expect(code).toBe(0);
    const before = await readFile(join(root, STATE_DIR, "generated", "models", "codex.json"), "utf8");
    await syncNow(root);
    expect(await readFile(join(root, STATE_DIR, "generated", "models", "codex.json"), "utf8")).toBe(before);
  });

  it("reads an unsynced Codex pin edit as drift with no cache, though the map records another pin as replaced", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-custom" } } });
    await syncNow(root, OTHER_CODEX);
    await rm(join(root, CACHE));
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-other" } } });

    const { doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift?.clean).toBe(false);
    expect(doc.drift?.changes).toContainEqual(expect.objectContaining({ path: `${STATE_DIR}/generated/models/codex.json` }));
    await syncNow(root);
    expect((await codexMap(root))["standard"]).toEqual({ model: "gpt-9-other", fallbacks: ["gpt-6-sol", "gpt-5.6-terra"] });
  });

  it("writes a Codex pin the map records as replaced, dropping the record, on a sync whose list holds the pin", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-custom" } } });
    await syncNow(root, OTHER_CODEX);
    expect((await codexMap(root))["standard"]).toHaveProperty("pinReplaced");

    await syncNow(root, { codex: { ids: [...OTHER_CODEX.codex.ids, "gpt-9-custom"], source: "codex-debug-models" } });

    expect((await codexMap(root))["standard"]).toEqual({ model: "gpt-9-custom", fallbacks: ["gpt-6-sol", "gpt-5.6-terra"] });
    expect((await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" })).doc.drift?.clean).toBe(true);
  });

  // review/124: a map class on a custom pin the manifest no longer holds leaves only that class's id
  // off the list read off the files, never the whole map, so on a checkout with no cache that class
  // reads as drift until a sync, and the sync keeps every other class's pick the list made.
  it.each([
    { change: "changed", pins: { standard: { codex: "gpt-9-other" } }, standard: "gpt-9-other" },
    { change: "unset", pins: {}, standard: "gpt-6-sol" },
  ])("keeps every other Codex class's pick with no cache when a bound custom pin is $change", async ({ pins, standard }) => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await pinCodex(root, { pins: { standard: { codex: "gpt-9-custom" } } });
    await syncNow(root, { codex: { ids: [...OTHER_CODEX.codex.ids, "gpt-9-custom"], source: "codex-debug-models" } });
    const bound = await codexMap(root);
    expect(bound["standard"]?.model).toBe("gpt-9-custom");
    expect(bound["frontier"]?.model).toBe("gpt-6-sol");
    await rm(join(root, CACHE));
    await pinCodex(root, { pins });

    const { doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift?.clean).toBe(false);
    expect(doc.drift?.changes).toContainEqual(expect.objectContaining({ path: `${STATE_DIR}/generated/models/codex.json` }));
    await syncNow(root);
    const synced = await codexMap(root);
    expect(synced["standard"]?.model).toBe(standard);
    for (const modelClass of ["frontier", "advanced", "economy"]) {
      expect(synced[modelClass], modelClass).toEqual(bound[modelClass]);
    }
    expect((await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" })).doc.drift?.clean).toBe(true);
  });

  // review/116: the row works out the emitted model from the committed files' list first, so a
  // model a teammate's sync committed that this account's list lacks warns.
  it("warns on a committed Codex pick this machine's cached list lacks, naming the client and the class", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    await syncNow(root, OTHER_CODEX);
    // This account's cache: it holds every shipped entry 0 and lacks the teammate's gpt-6-sol.
    await writeFile(
      join(root, CACHE),
      `${JSON.stringify({ listed: { codex: { ids: ["gpt-6-astra", "gpt-5.6-terra", "gpt-6-luna"], source: "codex-debug-models" } } })}\n`,
    );

    const { code, doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift?.clean).toBe(true);
    const verdict = row(doc, "model-pins");
    expect(verdict.status).toBe("warn");
    expect(verdict.detail).toContain(`codex frontier: the emitted model "gpt-6-sol" is not on codex's list (saved by the last sync)`);
    expect(code).toBe(0);
  });

  // review/109: the drift gate keeps an emitted pick only when it is a shipped candidate for its
  // class or a pin; a class emitted with no model, though it has candidates, is drift on a
  // checkout whose own list does not give that, and none where it does.
  it("reads a Codex class emitted with no model as drift with no cache, and as none where the cache gives it", async () => {
    const root = await seedRepo(getRepo(), { tools: ["claude", "codex"] });
    // A list holding none of economy's candidates: the class goes to Codex's own default model.
    await syncNow(root, { codex: { ids: ["gpt-6-astra", "gpt-6-sol"], source: "codex-debug-models" } });
    expect((await codexMap(root))["economy"]?.model).toBeUndefined();

    expect((await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" })).doc.drift?.clean).toBe(true);
    await rm(join(root, CACHE));
    const { doc } = await runJson(root, { STAMITY_NO_CLIENT_PROBE: "1" });

    expect(doc.drift?.clean).toBe(false);
    expect(doc.drift?.changes).toContainEqual(expect.objectContaining({ path: `${STATE_DIR}/generated/models/codex.json` }));
  });

  // The reviewer's open question on review/114: a deselected client's agent files, on a checkout
  // with no cache, are proved by the list its own still-ledgered map gives, so a file the list
  // moved is reclaimed, not kept as the person's content.
  it("reclaims a deselected Codex's list-moved agent file with no cache, keeping nothing as the person's", async () => {
    const handle = getRepo();
    await handle.seedFiles({
      "corpus/agents/stamity-reviewer.md": await readFile(fileURLToPath(new URL("../../../content/agents/stamity-reviewer.md", import.meta.url)), "utf8"),
    });
    const root = await seedRepo(handle, { tools: ["claude", "codex"] });
    await syncNow(root, OTHER_CODEX);
    const agent = join(root, ".codex", "agents", "stamity-reviewer.toml");
    expect(await readFile(agent, "utf8")).toMatch(/^model = "gpt-6-sol"$/m);
    await rm(join(root, CACHE));
    const manifest = await readManifest(root);
    if (manifest === null) throw new Error("the fixture wrote no manifest");
    await writeManifest(root, { ...manifest, tools: ["claude"] }, { now: T0 });

    await syncNow(root);

    expect(existsSync(agent)).toBe(false);
    expect((await readManifest(root))?.ledger.some((entry) => entry.adapter === "codex")).toBe(false);
  });
});
