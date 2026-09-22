import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  checkClaudeHookShell,
  checkCommand,
  checkNodeVersion,
  runDoctor,
  runDriftGate,
  type DoctorCheck,
} from "../../../src/cli/commands/check.ts";
import { probePluginRuntime } from "../../../src/cli/commands/plugin/probe.ts";
import {
  __resetContentRootCacheForTests,
  __setContentRootForTests,
} from "../../../src/content/contentRoot.ts";
import { applySync, planSync } from "../../../src/cli/commands/sync/engine.ts";
import { createApp, createEngine } from "../../../src/index.ts";
import {
  createManifest,
  manifestPath,
  readManifest,
  writeManifest,
} from "../../../src/manifest/manifest.ts";
import type { Tool } from "../../../src/types/core.ts";
import { EngineError } from "../../../src/types/errors.ts";
import { packOwner, type LedgerEntry, type SetupManifest } from "../../../src/types/manifest.ts";
import { STATE_DIR } from "../../../src/types/markers.ts";
import type * as PathsApi from "../../../src/shared/paths.ts";
import { canonical, npxCommand } from "../../support/identity.ts";
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

/**
 * The install spec this release's APM route actually publishes:
 * `<owner>/<repo>#plugins/v<version>`, read out of this checkout's own
 * `repository.url`.
 *
 * Derived, never typed. The scoped npm name and the repository slug are two
 * different identities (`@zomarit/stamity` against `zomarit/stamity`), and a
 * fixture that spelled the npm name where the release writes the slug would
 * prove the matcher against a string no APM install ever produces — which is
 * exactly the defect these fixtures were rewritten for.
 */
function ownRepositorySlug(): string {
  const raw = readFileSync(fileURLToPath(new URL("../../../package.json", import.meta.url)), "utf8");
  const manifest = JSON.parse(raw) as { repository?: { url?: string } };
  return (manifest.repository?.url ?? "")
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace("https://github.com/", "");
}

/** The published APM dependency line: what `release.json`'s `apm.installSpec` carries. */
function apmInstallSpec(version = "1.9.0"): string {
  return `${ownRepositorySlug()}#plugins/v${version}`;
}

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
  /** The manifest's plugin record, as `stamity plugin setup` persists it. */
  plugin?: SetupManifest["plugin"];
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
  await writeManifest(handle.dir, base, { now: T0 });

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
    ...(opts.plugin === undefined ? {} : { plugin: opts.plugin }),
    ledger: [...(synced?.ledger ?? []), ...(opts.ledger ?? [])],
  };
  await writeManifest(handle.dir, manifest, { now: T0 });

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
async function runJson(cwd: string): Promise<{ code: number; doc: Envelope }> {
  const result = await runInProcess([checkCommand], ["check", "--json"], { cwd });
  const lines = result.stdout.trim().split("\n");
  // One run, one document: a second line would mean human output leaked past
  // the funnel's JSON suppression.
  expect(lines).toHaveLength(1);
  return { code: result.code, doc: JSON.parse(lines[0] ?? "") as Envelope };
}

function runHuman(cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return runInProcess([checkCommand], ["check"], { cwd });
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
 * The doctor's plugin rows read the process environment, so every direct
 * `runDoctor` call in this file pins `env: {}`. Without it a machine that
 * happens to export `CLAUDE_PLUGIN_ROOT` — a developer running the suite inside
 * a client that sets it — would take a different branch of `plugin-runtime`
 * than CI does, and a suite whose verdict depends on the shell it was started
 * from is not a gate. The command-level cases go through `runInProcess`, whose
 * env already defaults to `{}` for the same reason.
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
    expect(doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0 });
    expect(doc.provenance?.generatedBy).toBe(createApp().version);
    expect(doc.provenance?.manifestVersion).toBe("1.0.0");
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

  it("prints the doctor table, the drift verdict, provenance, and a closing line", async () => {
    const root = await seedRepo(getRepo());

    const result = await runHuman(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("doctor");
    expect(result.stdout).toContain("node-version");
    expect(result.stdout).toContain("drift: clean");
    expect(result.stdout).toContain("provenance (the manifest is the record)");
    expect(result.stdout).toContain("nothing to do");
    expect(result.stderr).toBe("");
  });

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
      // joined the doctor. `plugin-runtime` answers about the ENVIRONMENT — is a
      // plugin root reachable, and does its runtime match this repository's
      // recorded state — and `plugin-duplicates` about the repository beside it,
      // so they sit after the repository-state probes and before `invariants`,
      // which alone reads the installed corpus. No row above moved, and the pin
      // stays a literal array so the next one has to be placed here too.
      "plugin-runtime",
      "plugin-duplicates",
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
      expect(result.stdout).toContain("npx @acme/stamity init");
      expect(result.stdout).toContain("npx @acme/stamity init — this repository has no usable");
      expect(result.stdout).not.toContain("npx @zomarit/stamity");
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
  const packRow: LedgerEntry = {
    path: "docs/pack-guide.md",
    adapter: packOwner("demo"),
    artifactId: "guide",
    artifactType: "skill",
  };

  it("names a ledgered file that is gone, and goes clean again once it is back", async () => {
    // A pack row, not an adapter row: pack content is excluded from the reclaim
    // sweep by construction, so this fixture isolates the missing-file source of
    // drift from the reclaim source exercised below.
    const handle = getRepo();
    const root = await seedRepo(handle, {
      ledger: [packRow],
      files: { "docs/pack-guide.md": "# Guide\n" },
    });

    const before = await runJson(root);
    expect(before.code).toBe(0);
    expect(before.doc.drift?.clean).toBe(true);

    await rm(join(root, "docs/pack-guide.md"));
    const during = await runJson(root);
    expect(during.code).toBe(1);
    expect(during.doc.ok).toBe(false);
    expect(during.doc.drift?.missing).toEqual(["docs/pack-guide.md"]);
    expect(during.doc.drift?.clean).toBe(false);

    await writeFile(join(root, "docs/pack-guide.md"), "# Guide\n", "utf8");
    const after = await runJson(root);
    expect(after.code).toBe(0);
    expect(after.doc.drift).toEqual({ clean: true, changes: [], missing: [], reclaimPending: 0 });
  });

  it("prints the missing path and the sync next step in human output", async () => {
    const root = await seedRepo(getRepo(), { ledger: [packRow] });

    const result = await runHuman(root);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("ledgered file(s) missing");
    expect(result.stdout).toContain("docs/pack-guide.md");
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
    const root = await seedRepo(getRepo(), {
      ledger: [
        {
          path: "docs/legacy-guide.md",
          adapter: "claude",
          artifactId: "legacy-guide",
          artifactType: "infra",
        },
      ],
      files: { "docs/legacy-guide.md": "# Legacy\n" },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(1);
    expect(doc.drift).toMatchObject({ clean: false, missing: [], reclaimPending: 1 });
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
        {
          path: "docs/shared.md",
          adapter: packOwner("alpha"),
          artifactId: "shared",
          artifactType: "rule",
        },
      ],
    });

    const report = await runDriftGate(root, "1.0.0");

    expect(report.missing).toEqual(["docs/shared.md"]);
  });

  it("propagates the engine's un-initialised failure to a direct caller", async () => {
    // The command collapses this to `drift: null` on purpose; the gate itself
    // stays honest so any other caller sees the real failure.
    const handle = getRepo();
    __setContentRootForTests(handle.path("corpus"));

    await expect(runDriftGate(handle.dir, "1.0.0")).rejects.toBeInstanceOf(EngineError);
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
  const managedRow: LedgerEntry = {
    path: "docs/managed-note.md",
    adapter: packOwner("demo"),
    artifactId: "note",
    artifactType: "rule",
  };

  function seedManagedNote(preserved: string): Promise<string> {
    return seedRepo(getRepo(), {
      ledger: [managedRow],
      files: { "docs/managed-note.md": managedFile(preserved) },
    });
  }

  it("warns naming the file, the line the copy starts at, and the remedy", async () => {
    const root = await seedManagedNote(BODY);

    const { doc } = await runJson(root);

    // Line 9: the block occupies 1-7 (BEGIN, five body lines, END), line 8 is
    // the blank the preserved region opens with, and the copy starts under it.
    expect(row(doc, "preserved-duplicate").status).toBe("warn");
    expect(row(doc, "preserved-duplicate").detail).toContain("docs/managed-note.md:9");
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
    expect(row(doc, "preserved-duplicate").detail).toContain("docs/managed-note.md:9");
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
      files: { "docs/managed-note.md": `${BODY}\n` },
    });

    const { code, doc } = await runJson(root);

    expect(code).toBe(0);
    expect(row(doc, "preserved-duplicate").status).toBe("pass");
    expect(row(doc, "preserved-duplicate").detail).not.toContain("docs/managed-note.md");
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
        { path: "docs/gone.md", adapter: packOwner("demo"), artifactId: "gone", artifactType: "skill" },
      ],
      files: { "docs/gone.md": "# Guide\n" },
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

    await rm(join(root, "docs/gone.md"));
    const failing = await runJson(root);

    expect(failing.code).toBe(1);
    expect(failing.doc.ok).toBe(false);
    expect(failing.doc.command).toBe("check");
    // A failure envelope must still carry the full report: the run answered
    // every question, and `ok:false` is one of its answers, not a substitute
    // for the rest (a thrown failure would have replaced this with `error`).
    expect(failing.doc.doctor.length).toBe(healthy.doc.doctor.length);
    expect(failing.doc.drift?.missing).toEqual(["docs/gone.md"]);
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
          artifactType: "agent",
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
    expect(nextBlock).toContain("stamity clean --pack");
    expect(nextBlock).toContain("do not run sync first");
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
    expect(error.next).toContain("stamity check");
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
    'globs: ["**/*.md"]',
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

  it("keeps printing the nothing-to-do close for a genuinely green run", async () => {
    // The temp fixture is not a git repository, so `git-available` warns — the
    // green close is therefore the advisory variant, and the exit is still 0.
    // Both halves matter: the honesty rule must not have made a passing run
    // print a `next:` list it has nothing to put in.
    const root = await seedRepo(getRepo());

    const result = await runHuman(root);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("nothing to do");
    expect(result.stdout).not.toContain("next:");
  });
});

/**
 * The two plugin rows (REQ-PLUGIN-016, REQ-PLUGIN-019).
 *
 * `plugin-runtime` spawns a real child process: the locator's `--print`
 * contract is an exit code plus a JSON document, and a stub that returned the
 * document in-process would prove the parse while leaving the exit-code branch
 * — the half that decides `fail` against `warn` — untested. The fixture
 * locators below are three-line scripts, so the spawn costs milliseconds.
 */
/** A plugin root whose locator body is `body`. */
async function pluginRoot(handle: TempDirHandle, name: string, body: string): Promise<string> {
  await handle.seedFiles({ [`${name}/runtime/locate.mjs`]: body });
  return handle.path(name);
}

/** The locator's documented `--print` payload, as file 1's locator emits it. */
function printing(runtime: Record<string, unknown>, exitCode = 0): string {
  return [
    `const report = ${JSON.stringify({
      project: ".",
      runtime,
      node: { version: process.versions.node, floor: "22.22.2", ok: true },
    })};`,
    "process.stdout.write(`${JSON.stringify(report, null, 2)}\\n`);",
    `process.exit(${exitCode});`,
    "",
  ].join("\n");
}

/**
 * `claude-hook-shell` (prove/190, prove/242): the anchored Claude hook commands cannot launch
 * under Claude Code's PowerShell fallback — a Windows host with no Git Bash — and the guard is
 * then silently disarmed. The render cannot serve both shells, so `check` says so on that host.
 * The failing branch cannot be reached in-process on a POSIX host, so the platform and the
 * environment are injected; `bash.exe` is found the way `test/adapters/claude.test.ts` resolves
 * the hook shell — a PATH walk with `existsSync` — so a real file under a temp directory is
 * what makes the found case true, not a mock.
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

  it("fails on win32 with no bash.exe on PATH, naming the consequence and the remedy", () => {
    const handle = getRepo();
    const empty = handle.path("no-bash");
    const verdict = checkClaudeHookShell(claude, { platform: "win32", env: { PATH: `${empty};C:\\Windows\\System32` } });
    expect(verdict.status).toBe("fail");
    expect(verdict.detail).toContain(
      "the anchored hook commands need Git Bash on Windows; without it the pre-tool-use guard does not launch and the client does not block",
    );
    expect(verdict.detail).toContain("PowerShell");
    expect(verdict.detail).toContain("Install Git for Windows (Git Bash)");
  });

  it("passes on win32 once a bash.exe is on PATH, naming where it was found", async () => {
    const handle = getRepo();
    await handle.seedFiles({ "git-bash/bin/bash.exe": "" });
    const dir = handle.path("git-bash/bin");
    // Windows PATH uses `;` — the probe splits on the platform's delimiter, and this suite runs
    // on the host's, so the fixture is composed with that delimiter rather than a literal.
    const verdict = checkClaudeHookShell(claude, { platform: "win32", env: { PATH: ["C:\\nothing", dir].join(sep === "\\" ? ";" : ":") } });
    expect(verdict.status).toBe("pass");
    expect(verdict.detail).toContain(`Git Bash found at ${join(dir, "bash.exe")}`);
  });

  it("passes with a note on win32 when claude is not targeted, or its hooks are a plugin's", () => {
    const none = checkClaudeHookShell({ ...claude, tools: ["cursor"] } as SetupManifest, { platform: "win32", env: { PATH: "" } });
    expect(none.status).toBe("pass");
    expect(none.detail).toContain("claude is not a target tool");
    // Plugin-owned hooks are the plugin's render, not this adapter's: nothing anchored is on disk.
    const owned = {
      ...claude,
      plugin: { mode: "plugin-backed", clients: { claude: { root: "x", classes: ["hooks"] } } },
    } as unknown as SetupManifest;
    const verdict = checkClaudeHookShell(owned, { platform: "win32", env: { PATH: "" } });
    expect(verdict.status).toBe("pass");
    expect(verdict.detail).toContain("carried by its plugin");
  });

  it("is a row of the real doctor, passing on this host", async () => {
    const root = await seedRepo(getRepo());
    const verdict = await doctorRow(root, "claude-hook-shell");
    // This suite never runs the failing branch for real: the CI Windows leg carries Git Bash, so
    // there the row passes on the found case, and on POSIX it passes on the platform.
    expect(verdict.status).toBe("pass");
  });
});

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
 * The ceiling is a CEILING (SEC3-M3).
 *
 * `execFile`'s `timeout` sends a signal and then waits for `close`, and `close`
 * waits for every writer on the child's stdout — including a DETACHED
 * grandchild that inherited it. A locator that ignores SIGTERM and leaves such
 * a grandchild behind therefore held the probe open indefinitely, which is a
 * `check` that hangs, which is a CI job that hangs.
 *
 * The stub below is the smallest portable shape of that: a locator that spawns
 * a detached grandchild inheriting stdout, installs a SIGTERM handler that does
 * nothing, and then sits. The ceiling is passed in rather than waited out, so
 * the case costs its own timeout and not five seconds.
 */
/**
 * The locator that will not close, with the grandchild's life as the
 * parameter: the in-process ceiling case wants it short so no handle outlives
 * the run, the process-level release case wants it LONGER than everything the
 * probe is allowed, so an exit before it is proof of release.
 */
const stubbornLocator = (grandchildMs: number): string =>
  [
    "import { spawn } from 'node:child_process';",
    // The grandchild inherits fd 1, so the parent's death does not close the
    // pipe this probe is reading.
    `spawn(process.execPath, ['-e', 'setTimeout(() => {}, ${grandchildMs})'], {`,
    "  detached: true,",
    "  stdio: ['ignore', 1, 'ignore'],",
    "}).unref();",
    "process.on('SIGTERM', () => {});",
    `setTimeout(() => {}, ${grandchildMs});`,
    "",
  ].join("\n");

describe("probePluginRuntime — the timeout ceiling", () => {
  // 2s, not a minute: the case is over long before that, and a short life
  // keeps no handle around after the run.
  const STUBBORN_LOCATOR = stubbornLocator(2000);

  /** The ceiling both cases hand the probe. */
  const CEILING_MS = 300;
  /**
   * The release case's wall-clock budget, derived rather than typed (M-5).
   *
   * The case runs the probe in a cold `node` that imports the type-stripped
   * engine graph, so its elapsed time is that cold start plus the ceiling, and
   * a literal budget is a guess about a runner. The basis is measured once,
   * here, by running the same driver shape with the probe call left out —
   * measured 2026-09-20 on this machine at ~130ms, against ~30ms for a bare
   * `node -e ''` — and MARGIN is the one guessed number, wide because the
   * required CI legs include runners this cannot measure. The budget is
   * `CEILING_MS + MARGIN x coldStart`; the driver's own timeout and the
   * grandchild's life are multiples of it, so the three cannot drift apart.
   */
  const MARGIN = 8;
  let coldStartMs = 0;
  const probeModule = pathToFileURL(
    fileURLToPath(new URL("../../../src/cli/commands/plugin/probe.ts", import.meta.url)),
  ).href;

  beforeAll(async () => {
    // The driver's shape with the probe call left out: a cold `node`, the same
    // import. Inline rather than a file, because no per-test directory exists
    // at suite scope.
    const started = Date.now();
    await new Promise<void>((settle, reject) => {
      execFile(
        process.execPath,
        ["--input-type=module", "-e", `await import(${JSON.stringify(probeModule)});`],
        { encoding: "utf8" },
        (error) => (error === null ? settle() : reject(error)),
      );
    });
    coldStartMs = Date.now() - started;
  });

  it("settles as a timeout rather than waiting on a locator that will not close", async () => {
    const handle = getRepo();
    const pluginDir = await pluginRoot(handle, "plugin-stubborn", STUBBORN_LOCATOR);

    const started = Date.now();
    const probe = await probePluginRuntime(pluginDir, { timeoutMs: 300 });

    expect(probe.outcome).toBe("timeout");
    expect(probe.message).toContain(pluginDir);
    // The claim is the ceiling itself: settling at all is not enough, it has to
    // settle near the ceiling rather than when the grandchild finally lets go.
    expect(Date.now() - started).toBeLessThan(1_500);
  });

  /**
   * SEC4-M1: settling the promise is not releasing the process.
   *
   * The timer above settles the row at the ceiling, but settling leaves this
   * process holding the read ends of the child's stdout and stderr pipes, and
   * the detached grandchild holding a write end — a live handle, so an event
   * loop that cannot exit until the grandchild does. The CLI never calls
   * `process.exit`, so that is a `check` in CI waiting on a stranger's process.
   *
   * Measured before the fix (2026-09-20, Node 22.22.3): the shipped probe did
   * NOT hang here, because `execFile`'s own `timeout` — set to the same
   * ceiling — destroys both streams inside its `kill()` before it signals. That
   * is an undocumented line of Node's, not a contract, and with the `timeout`
   * option removed (the release resting on the probe's timer alone) this case
   * was red at the driver's budget. The probe now destroys the streams itself,
   * and this case holds the release whichever mechanism a future Node leaves.
   *
   * Asserted at the PROCESS level, because that is where the property lives: a
   * driver runs the probe in its own `node` and the assertion is that the
   * driver exits, near the ceiling, while the grandchild is still holding the
   * pipe. The vitest worker cannot stand in for it — its pool keeps the worker
   * alive whatever handles a test leaks.
   */
  it("releases the process once the probe settles, while the grandchild still holds stdout", async () => {
    const handle = getRepo();
    const budgetMs = CEILING_MS + MARGIN * coldStartMs;
    // The driver's own budget, well under the grandchild's life: hitting it
    // IS the defect, reported as a kill rather than as a vitest timeout.
    const driverTimeoutMs = 2 * budgetMs;
    // Past the probe's ceiling, past the driver's budget, past the margin —
    // an exit before it can only be release.
    const grandchildMs = 3 * budgetMs;
    const pluginDir = await pluginRoot(
      handle,
      "plugin-stubborn-long",
      stubbornLocator(grandchildMs),
    );
    // Node strips the module's types itself (22.18+; the floor is 22.22), so the
    // driver imports the source the suite imports, not a bundle of it.
    const driver = handle.path("driver.mjs");
    await writeFile(
      driver,
      [
        `const { probePluginRuntime } = await import(${JSON.stringify(probeModule)});`,
        `const probe = await probePluginRuntime(${JSON.stringify(pluginDir)}, { timeoutMs: ${CEILING_MS} });`,
        "process.stdout.write(JSON.stringify({ outcome: probe.outcome }));",
        "",
      ].join("\n"),
    );

    const started = Date.now();
    const run = await new Promise<{ error: Error | null; stdout: string }>((settle) => {
      execFile(
        process.execPath,
        [driver],
        { timeout: driverTimeoutMs, killSignal: "SIGKILL", encoding: "utf8" },
        (error, stdout) => settle({ error, stdout }),
      );
    });
    const elapsed = Date.now() - started;

    expect(run.error, `the probe process did not exit on its own (${elapsed}ms)`).toBeNull();
    expect(JSON.parse(run.stdout)).toEqual({ outcome: "timeout" });
    // Near the ceiling plus a cold start; nowhere near the grandchild.
    expect(
      elapsed,
      `${elapsed}ms against a budget of ${budgetMs}ms (ceiling ${CEILING_MS} + ${MARGIN} x ${coldStartMs}ms cold start)`,
    ).toBeLessThan(budgetMs);
  });
});

describe("check — plugin-runtime", () => {
  /**
   * TEST CHANGE, justified (2026-09-20, unit C4 / REQ-PLUGIN-016): this case
   * asserted `warn` for a repository that records no plugin client and sets no
   * root variable — which is every repository not running on a plugin,
   * including this one, so `check` carried a standing advisory warning nobody
   * could act on. The row's SUBJECT decides the severity now: with nothing
   * recorded and no root in the environment there is no plugin to report on,
   * so the honest answer is `pass`. The warn did not disappear — it moved to
   * the state it was written for, a recorded client with no reachable root,
   * which the case below pins. Nothing about the resolved, refused or
   * major-skew branches moved.
   */
  it("passes quietly when no client records a plugin and no root variable is set", async () => {
    const root = await seedRepo(getRepo());

    const probe = await doctorRow(root, "plugin-runtime", {});

    expect(probe.status).toBe("pass");
    expect(probe.detail).toBe("no plugin recorded and no plugin root in the environment");
  });

  it("warns with the two ways to make it answerable when a recorded client has no root", async () => {
    const root = await seedRepo(getRepo(), {
      plugin: {
        mode: "generated",
        clients: { claude: { version: "1.9.0", classes: ["agent"] } },
      },
    });

    const probe = await doctorRow(root, "plugin-runtime", {});

    expect(probe.status).toBe("warn");
    expect(probe.detail).toBe(
      "no plugin root in the environment; run this check through the plugin's st-setup or " +
        "set CLAUDE_PLUGIN_ROOT",
    );
  });

  it("passes with the resolved kind, version and path when the locator exits 0", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle);
    const version = createApp().version;
    const pluginDir = await pluginRoot(
      handle,
      "plugin-ok",
      printing({
        kind: "bundled",
        path: `${handle.path("plugin-ok")}/runtime/node_modules/stamity`,
        version,
        refusal: null,
      }),
    );

    const probe = await doctorRow(root, "plugin-runtime", { CLAUDE_PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("pass");
    expect(probe.detail).toBe(
      `runtime bundled ${version} at ${pluginDir}/runtime/node_modules/stamity`,
    );
  });

  /**
   * TEST CHANGE, justified (2026-09-20, REQ-PLUGIN-016): this case seeded a
   * repository that records NO plugin client and still asserted `fail`, so an
   * unrelated session's exported `CLAUDE_PLUGIN_ROOT` could fail the CI of a
   * repository that has nothing to do with any plugin. The fixture now records
   * the client whose refusal this is — which is the subject the verdict was
   * always about — and the unrecorded case below pins the `warn` it became.
   * Nothing about the quoted refusal or the resolved and skew branches moved.
   */
  it("fails with the locator's own refusal quoted when it exits 2", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, {
      plugin: {
        mode: "generated",
        clients: { claude: { version: "1.9.0", classes: ["agent"] } },
      },
    });
    const refusal = "stamity plugin: no runtime found — probed /a and /b; reinstall the plugin";
    const pluginDir = await pluginRoot(
      handle,
      "plugin-refused",
      printing({ kind: "none", path: null, version: null, refusal }, 2),
    );

    const probe = await doctorRow(root, "plugin-runtime", { PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("fail");
    // The locator's message, not a restatement of it: the refusal names what
    // was probed, and only the locator knows that.
    expect(probe.detail).toContain(refusal);
    expect(probe.detail).toContain(pluginDir);
  });

  it("strips a control byte a hostile locator puts in its refusal", async () => {
    // SEC5-M1 (CWE-150): the refusal is the plugin root's own string, quoted
    // into a row `check` prints raw — so a root could paint a false row in a
    // CI log. The refusal is still quoted; the bytes that steer a terminal
    // are dropped.
    const handle = getRepo();
    const root = await seedRepo(handle, {
      plugin: {
        mode: "generated",
        clients: { claude: { version: "1.9.0", classes: ["agent"] } },
      },
    });
    const refusal = "no runtime found\u001b[2K\rok    plugin-runtime  spoofed";
    const pluginDir = await pluginRoot(
      handle,
      "plugin-refused-hostile",
      printing({ kind: "none", path: null, version: null, refusal }, 2),
    );

    const probe = await doctorRow(root, "plugin-runtime", { PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("fail");
    expect(probe.detail).toContain("no runtime found");
    // oxlint-disable-next-line no-control-regex -- the control byte IS the subject
    expect(probe.detail).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/u);
  });

  it("warns on the same refusal in a repository that records no plugin at all", async () => {
    // The third state, and the reason the second exists: a root variable
    // exported by an unrelated session is not this repository's claim about
    // itself, so a broken plugin somewhere in the environment cannot fail the
    // CI of a repository that records no client and is not plugin-backed. The
    // refusal is still quoted — it is worth reading — it is simply advisory.
    const handle = getRepo();
    const root = await seedRepo(handle);
    const refusal = "stamity plugin: no runtime found — probed /a and /b; reinstall the plugin";
    const pluginDir = await pluginRoot(
      handle,
      "plugin-refused-unrecorded",
      printing({ kind: "none", path: null, version: null, refusal }, 2),
    );

    const probe = await doctorRow(root, "plugin-runtime", { PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("warn");
    expect(probe.detail).toContain(refusal);
    expect(probe.detail).toContain(pluginDir);
  });

  it("fails the refusal in a plugin-backed repository even before a client is recorded", async () => {
    // `mode: "plugin-backed"` is the repository saying it RUNS on a plugin, so
    // a locator that refuses is this repository's own broken install whatever
    // the clients map happens to hold.
    const handle = getRepo();
    const root = await seedRepo(handle, { plugin: { mode: "plugin-backed", clients: {} } });
    const pluginDir = await pluginRoot(
      handle,
      "plugin-refused-backed",
      printing({ kind: "none", path: null, version: null, refusal: "no runtime found" }, 2),
    );

    expect((await doctorRow(root, "plugin-runtime", { PLUGIN_ROOT: pluginDir })).status).toBe(
      "fail",
    );
  });

  it("fails a plugin-backed repository whose runtime is a different major", async () => {
    const handle = getRepo();
    const root = await seedRepo(handle, {
      generatedBy: "1.9.0",
      plugin: {
        mode: "plugin-backed",
        clients: { claude: { version: "1.9.0", classes: ["agent"] } },
      },
    });
    const pluginDir = await pluginRoot(
      handle,
      "plugin-skewed",
      printing({ kind: "companion", path: "/somewhere", version: "2.0.1", refusal: null }),
    );

    const probe = await doctorRow(root, "plugin-runtime", { CLAUDE_PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("fail");
    expect(probe.detail).toContain("major 2 against major 1");
    expect(probe.detail).toContain("1.9.0");
  });

  it("passes the same skew while the manifest still says generated", async () => {
    // Coexistence, not a defect: a repository that has not migrated is not
    // running on that runtime, so the majors have nothing to agree about.
    const handle = getRepo();
    const root = await seedRepo(handle, { generatedBy: "1.9.0" });
    const pluginDir = await pluginRoot(
      handle,
      "plugin-generated",
      printing({ kind: "companion", path: "/somewhere", version: "2.0.1", refusal: null }),
    );

    expect((await doctorRow(root, "plugin-runtime", { CLAUDE_PLUGIN_ROOT: pluginDir })).status).toBe("pass");
  });

  /**
   * The document is CHECKED, not just shaped. `parseLocatorReport` used to
   * assert that `runtime` and `node` were objects and cast the rest, so a
   * locator answering `kind: "sideways"` or `node.ok: "yes"` reached the row as
   * a resolved runtime and printed a kind no reader of this engine recognises.
   */
  it.each([
    ["a kind outside the three words", { kind: "sideways", path: null, version: null, refusal: null }, null],
    ["a non-string path", { kind: "bundled", path: 7, version: null, refusal: null }, null],
    ["a non-boolean node.ok", { kind: "bundled", path: null, version: null, refusal: null }, { version: "22.0.0", floor: null, ok: "yes" }],
  ])("warns on a locator document carrying %s", async (_label, runtime, node) => {
    const handle = getRepo();
    const root = await seedRepo(handle);
    const document = JSON.stringify({
      runtime,
      node: node ?? { version: process.versions.node, floor: "22.22.2", ok: true },
    });
    const pluginDir = await pluginRoot(
      handle,
      `plugin-malformed-${String(_label).replaceAll(/\W+/g, "-")}`,
      `process.stdout.write(${JSON.stringify(document)});\nprocess.exit(0);\n`,
    );

    const probe = await doctorRow(root, "plugin-runtime", { CLAUDE_PLUGIN_ROOT: pluginDir });

    expect(probe.status).toBe("warn");
    expect(probe.detail).toContain("stdout was not the locator's --print document");
  });

  it("warns rather than failing when the root holds no locator at all", async () => {
    const root = await seedRepo(getRepo());

    const probe = await doctorRow(root, "plugin-runtime", { CLAUDE_PLUGIN_ROOT: getRepo().path("no-such-root") });

    // A broken plugin install is the client's state, not this repository's, and
    // failing a CI gate on it would be a verdict about the wrong subject.
    expect(probe.status).toBe("warn");
    expect(probe.detail).toContain("no-such-root");
  });
});

const pluginOf = (mode: "generated" | "plugin-backed"): SetupManifest["plugin"] => ({
  mode,
  clients: { claude: { version: "1.9.0", classes: ["agent"] } },
});

/** One agent ledger row, as the claude adapter would have written it. */
const agentRow = (id: string): LedgerEntry => ({
  path: `.claude/agents/stamity-${id}.md`,
  adapter: "claude",
  artifactId: id,
  artifactType: "agent",
  contentHash: createHash("sha256").update(id).digest("hex"),
});

const duplicatesRow = (root: string): Promise<DoctorCheck> =>
  doctorRow(root, "plugin-duplicates");

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
  it("shows the plugin-runtime line a repository recording nothing really prints", async () => {
    const page = await readFile(
      fileURLToPath(new URL("../../../docs/troubleshooting.md", import.meta.url)),
      "utf8",
    );
    const sample = page
      .split("\n")
      .find((line) => line.trimStart().startsWith("ok    plugin-runtime"));
    expect(sample, "the troubleshooting sample has no ok plugin-runtime line").toBeDefined();

    const root = await seedRepo(getRepo());
    const probe = await doctorRow(root, "plugin-runtime", {});

    // Status and detail both: a sample showing the right sentence under the
    // wrong verdict is the exact defect this pins against.
    expect(probe.status).toBe("pass");
    // Column padding collapsed: the page aligns its table, and the alignment is
    // not the claim — the verdict word and the sentence are.
    expect(sample?.trim().replaceAll(/\s+/g, " ")).toBe(`ok plugin-runtime ${probe.detail}`);
  });
});

describe("check — plugin-duplicates", () => {
  /**
   * `agent` alone, not the four classes file 1's claude root carries.
   *
   * `seedRepo` performs a real sync, so its ledger already holds this client's
   * four generated hook rows — a record naming `hooks` would therefore report a
   * true duplicate in every case below and leave none of them able to say
   * anything about the source it is actually about. The selection is empty, so
   * `agent` starts with no rows and each case adds exactly the ones it means.
   */
  it("passes when a client records a plugin and nothing duplicates it", async () => {
    const root = await seedRepo(getRepo(), { plugin: pluginOf("plugin-backed") });

    const probe = await duplicatesRow(root);

    expect(probe.status).toBe("pass");
    expect(probe.detail).toBe("no duplicated classes");
  });

  it("warns on ledger rows of a carried class while the mode is generated", async () => {
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      ledger: [agentRow("reviewer"), agentRow("implementer")],
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("warn");
    // Two rows, counted rather than listed, with the source and the remedy the
    // cell prescribes for it.
    expect(duplicates.detail).toContain("claude: agent (2 file(s), ledger)");
    expect(duplicates.detail).toContain(npxCommand("clean -y"));
    expect(duplicates.detail).toContain(npxCommand("plugin setup --client claude"));
  });

  it("fails the same repository once the manifest records plugin-backed", async () => {
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("plugin-backed"),
      ledger: [agentRow("reviewer"), agentRow("implementer")],
    });

    const duplicates = await duplicatesRow(root);

    // The same repository, the same two rows, one field different: the severity
    // is the manifest's mode and nothing else.
    expect(duplicates.status).toBe("fail");
    expect(duplicates.detail).toContain("claude: agent (2 file(s), ledger)");
  });

  it("names each duplicated file by its repository-relative path, sorted", async () => {
    // W-D2: REQ-PLUGIN-019 names each duplicated class "with its path", and the
    // row counted files without naming one — an operator told to remove "the
    // file" had to find it. Sorted, so the order is the paths' own and not the
    // ledger's write order.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      ledger: [agentRow("reviewer"), agentRow("implementer")],
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.detail).toContain(
      "claude: agent (2 file(s), ledger) at .claude/agents/stamity-implementer.md, " +
        ".claude/agents/stamity-reviewer.md — ",
    );
  });

  it("names the first three paths of a class and folds the rest into a count", async () => {
    // The bound, pinned: a class with many files would turn one doctor row
    // into a directory listing, so the detail names three and counts the rest.
    // Five rows: three shown, two folded, and the two folded are the last two
    // in sorted order.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      ledger: ["e", "d", "c", "b", "a"].map((id) => agentRow(id)),
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.detail).toContain(
      "claude: agent (5 file(s), ledger) at .claude/agents/stamity-a.md, " +
        ".claude/agents/stamity-b.md, .claude/agents/stamity-c.md +2 more — ",
    );
    expect(duplicates.detail).not.toContain("stamity-d.md");
  });

  it("names the unowned native file and the matched dependency spelling as their paths", async () => {
    // The `unmanaged` remedy says "remove the file"; this is where the file is
    // named. An `apm` finding has no file — the dependency spelling that
    // matched stands as its path.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - ${apmInstallSpec()}\n`,
        ".claude/agents/stamity-reviewer.md": "---\nname: reviewer\n---\n\nBody.\n",
        "corpus/agents/stamity-reviewer.md": AGENT_FIXTURE,
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.detail).toContain(
      "claude: agent (1 file(s), unmanaged) at .claude/agents/stamity-reviewer.md — ",
    );
    expect(duplicates.detail).toContain(`claude: agent (1 file(s), apm) at ${apmInstallSpec()} — `);
  });

  it("names an APM dependency and an unowned native file as their own sources", async () => {
    const repo = getRepo();
    const root = await seedRepo(repo, {
      plugin: pluginOf("generated"),
      files: {
        // The install spec THIS release publishes — `<owner>/<repo>#plugins/
        // v<version>`, read out of the running checkout at runtime, so a
        // downstream that renamed the package and repointed `repository.url`
        // recognises its own dependency and this one recognises its own.
        "apm.yml": `name: consumer\ndependencies:\n  - ${apmInstallSpec()}\n`,
        // A file under a native directory carrying an id the plugin carries and
        // no ledger row — hand-placed, or left by a tool that is not this one.
        ".claude/agents/stamity-reviewer.md": "---\nname: reviewer\n---\n\nBody.\n",
        "corpus/agents/stamity-reviewer.md": AGENT_FIXTURE,
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("warn");
    expect(duplicates.detail).toContain("claude: agent (1 file(s), apm)");
    expect(duplicates.detail).toContain(
      "deploys the same classes; remove it from apm.yml and run apm install, or keep the " +
        "plugin uninstalled",
    );
    expect(duplicates.detail).toContain("claude: agent (1 file(s), unmanaged)");
    expect(duplicates.detail).toContain(
      "not written by this engine; remove the file or keep it as an override under " +
        `${STATE_DIR}/overrides/`,
    );
  });

  /**
   * The mixed repository, pinned as a DECISION rather than as a defect
   * (REQ-PLUGIN-019, disposition 2026-09-20).
   *
   * `.agents/skills/` is the vendor-neutral tree, and it stays written while
   * ANY generated-mode reader still owns `skill` — so a repository whose cursor
   * is plugin-backed for `skill` beside a generated codex has that tree on disk
   * and both clients read it. Cursor therefore does receive those skills twice,
   * once from its plugin and once from the shared tree, and this row still
   * passes: the ledger source filters rows by adapter and the unmanaged source
   * exempts anything a ledger row owns, so neither sees the tree as cursor's
   * duplicate. Failing here would break the CI of a legitimate mixed
   * repository, and the tree cannot be removed without stripping the generated
   * client. The way out is moving the last reader onto the plugin, not a
   * verdict from this row.
   */
  it("passes a mixed repository whose shared skills tree still serves a generated reader", async () => {
    const handle = getRepo();
    await handle.seedFiles({ "corpus/skills/st-verify/SKILL.md": SKILL_FIXTURE });
    const root = await seedRepo(handle, {
      tools: ["cursor", "codex"],
      plugin: {
        mode: "plugin-backed",
        clients: { cursor: { version: "1.9.0", classes: ["skill"] } },
      },
    });

    // The sync the boundary is recorded by: `seedRepo` emits in generated mode
    // and stamps the plugin record afterwards, so cursor still holds the shared
    // tree's ledger rows until emission runs again under the new ownership.
    // That second run is what a real `plugin setup` is followed by, and it is
    // the state this decision is about.
    const engineVersion = createApp().version;
    await applySync(root, await planSync(root, engineVersion), {
      engineVersion,
      force: false,
      dryRun: false,
      now: T0,
    });

    // The shared tree is still there, and codex — the generated reader — is
    // what keeps it there.
    expect(existsSync(join(root, ".agents/skills/st-verify/SKILL.md"))).toBe(true);

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("pass");
    expect(duplicates.detail).toBe("no duplicated classes");
  });

  it("names a copilot agent and prompt whose double extensions no ledger row owns", async () => {
    // `<id>.agent.md` and `<id>.prompt.md` are what the copilot adapter writes.
    // A single-extension strip leaves `stamity-reviewer.agent` and
    // `st-work.prompt`, which match no carried id, so the unmanaged scan saw
    // nothing at all in this client's directories.
    const root = await seedRepo(getRepo(), {
      tools: ["copilot"],
      plugin: {
        mode: "generated",
        clients: { copilot: { version: "1.9.0", classes: ["agent", "command"] } },
      },
      files: {
        "corpus/agents/stamity-reviewer.md": AGENT_FIXTURE,
        "corpus/commands/st-work.md": COMMAND_FIXTURE,
        ".github/agents/stamity-reviewer.agent.md": "---\nname: reviewer\n---\n\nBody.\n",
        ".github/prompts/st-work.prompt.md": "---\nname: work\n---\n\nBody.\n",
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.detail).toContain("copilot: agent (1 file(s), unmanaged)");
    expect(duplicates.detail).toContain("copilot: command (1 file(s), unmanaged)");
  });

  it("still names a dependency spelled as the scoped npm package, not only the slug", async () => {
    // Two identities, one row: an APM manifest written by hand against the
    // registry name has to be recognised beside the release's own slug form.
    // Quoted, because `@` is a reserved indicator at the head of a plain YAML
    // scalar and an unquoted scoped name makes the whole file unparseable.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - "${canonical().name}#plugins/v1.9.0"\n`,
      },
    });

    expect((await duplicatesRow(root)).detail).toContain("claude: agent (1 file(s), apm)");
  });

  it("reports nothing for a mirror published under another owner", async () => {
    // The documented bound, pinned rather than assumed: the match is the slug
    // or the package name, and a private mirror at `acme/stamity-mirror`
    // carries neither. Missing it is the safe direction — a false duplicate
    // would send an operator to remove a dependency that deploys nothing —
    // and closing it needs the installed marketplace on the client record,
    // which no manifest field carries yet.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": "name: consumer\ndependencies:\n  - acme/stamity-mirror#plugins/v1.9.0\n",
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("pass");
    expect(duplicates.detail).toBe("no duplicated classes");
  });

  it("strips a control byte an apm.yml dependency smuggles into the row", async () => {
    // SEC5-M1 (CWE-150): the matched dependency line is quoted into the
    // remedy and carried as the finding's path, and `check` prints the row
    // raw. A YAML double-quoted scalar can spell `\e`, so a crafted entry
    // could paint a false doctor row in a CI log. The row still reports the
    // duplicate — the bytes that steer a terminal are what it drops.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - "${apmInstallSpec()}\\e[2K\\rok    spoofed-row"\n`,
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.detail).toContain("claude: agent (1 file(s), apm)");
    // oxlint-disable-next-line no-control-regex -- the control byte IS the subject
    expect(duplicates.detail).not.toMatch(/[\u0000-\u001F\u007F-\u009F]/u);
  });

  it("names the dependency under the nested `dependencies: apm:` section the consumer manifest documents", async () => {
    // W-D1: `docs/enterprise-forks.md` documents the consumer's `apm.yml` with
    // its dependencies NESTED under an `apm:` section, and
    // `scripts/apm-install-smoke.mjs` writes exactly that shape — while this
    // row read `dependencies` as a flat list only, so the documented shape
    // reported nothing. The block below is the page's own, with its example
    // dependency replaced by the spec this release publishes.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `targets: [claude]\ndependencies:\n  apm:\n    - ${apmInstallSpec()}\n`,
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("warn");
    expect(duplicates.detail).toContain("claude: agent (1 file(s), apm)");
  });

  it("names a dependency spelled as the repository's https URL", async () => {
    // M-1: the bound (the case below) excluded `/` on both sides, so the URL
    // spelling of the SAME repository — `https://github.com/<slug>#ref` — no
    // longer matched. A `/` before the slug is a URL's path separator, not a
    // longer name.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - https://github.com/${ownRepositorySlug()}#plugins/v1.9.0\n`,
      },
    });

    expect((await duplicatesRow(root)).detail).toContain("claude: agent (1 file(s), apm)");
  });

  it("names a dependency that points at a subpath of the repository", async () => {
    // M-1: `<slug>/<dir>#ref` is the same repository, one directory in, and a
    // `/` after the slug ends the name as surely as the `#` does.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - ${ownRepositorySlug()}/plugins/claude#plugins/v1.9.0\n`,
      },
    });

    expect((await duplicatesRow(root)).detail).toContain("claude: agent (1 file(s), apm)");
  });

  it("names a dependency whose slug differs from the repository's only in case", async () => {
    // M-1: GitHub owner and repository names are case-insensitive, so an
    // upper-cased spelling resolves to the same repository and deploys the
    // same content.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - ${ownRepositorySlug().toUpperCase()}#plugins/v1.9.0\n`,
      },
    });

    expect((await duplicatesRow(root)).detail).toContain("claude: agent (1 file(s), apm)");
  });

  it("reports nothing for a same-owner sibling whose name merely starts with the slug", async () => {
    // W4-1: the match was an unbounded substring, so `<owner>/<repo>` was found
    // inside `<owner>/<repo>-suffix#plugins/v1.9.0` and a repository depending
    // on ANY same-owner sibling with a longer name was told to remove a
    // dependency that deploys nothing. The identity has to end where the
    // dependency's name ends: at the `#` that starts the ref, or at whitespace,
    // a quote or the end of the line. The sibling's name is synthetic — derived
    // from this checkout's own slug, never a real repository.
    const root = await seedRepo(getRepo(), {
      plugin: pluginOf("generated"),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - ${ownRepositorySlug()}-suffix#plugins/v1.9.0\n`,
      },
    });

    const duplicates = await duplicatesRow(root);

    expect(duplicates.status).toBe("pass");
    expect(duplicates.detail).toBe("no duplicated classes");
  });

  /**
   * The severity-to-exit-code half, on a fixture whose ONLY finding is the
   * duplicate.
   *
   * An `apm.yml` dependency leaves no file on disk and no ledger row, so the
   * drift gate stays clean and the exit code is the doctor's verdict alone —
   * which is what the claim is about. The ledger and unmanaged fixtures above
   * both drift by construction (a ledgered path with no file; an unowned file
   * at a path sync plans), and an exit code asserted there would be a statement
   * about the drift gate wearing this row's name.
   */
  const apmOnly = async (mode: "generated" | "plugin-backed"): Promise<string> =>
    await seedRepo(getRepo(), {
      plugin: pluginOf(mode),
      files: {
        "apm.yml": `name: consumer\ndependencies:\n  - ${apmInstallSpec()}\n`,
      },
    });

  it("leaves the exit code at 0 while the mode is generated", async () => {
    const { code, doc } = await runJson(await apmOnly("generated"));

    expect(row(doc, "plugin-duplicates").status).toBe("warn");
    expect(code).toBe(0);
    expect(doc.ok).toBe(true);
    // Both rows travel in the payload, so a machine caller reads them without
    // parsing the human table.
    expect(doc.doctor.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["plugin-runtime", "plugin-duplicates"]),
    );
  });

  it("takes the exit code to 1 once the mode is plugin-backed", async () => {
    const { code, doc } = await runJson(await apmOnly("plugin-backed"));

    expect(row(doc, "plugin-duplicates").status).toBe("fail");
    expect(code).toBe(1);
    expect(doc.ok).toBe(false);
  });

  it("passes a repository that records no plugin at all", async () => {
    const root = await seedRepo(getRepo(), {
      ledger: [agentRow("reviewer")],
      files: { ".claude/agents/stamity-reviewer.md": "body\n" },
    });

    const probe = await duplicatesRow(root);

    expect(probe.status).toBe("pass");
    expect(probe.detail).toBe("no client records a plugin, so nothing can duplicate");
  });
});

describe("check — the non-mutation guarantee (REQ-PLUGIN-019)", () => {
  it("changes no file on disk, on a repository that records a plugin and has duplicates", async () => {
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
        "apm.yml": `name: consumer\ndependencies:\n  - ${apmInstallSpec()}\n`,
      },
    });
    const before = await hashTree(root);

    await runJson(root);

    // Every byte, not a spot check: `check` is the read-only verb, and the two
    // new rows walk native directories and spawn a child process, which are the
    // two ways a diagnostic acquires a write by accident.
    expect(await hashTree(root)).toEqual(before);
  });
});
