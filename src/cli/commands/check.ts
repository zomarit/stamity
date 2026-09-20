import { execFile } from "node:child_process";
import { existsSync, type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { parse as parseYaml } from "yaml";
import type { App, EngineRegistry } from "../../index.ts";
import { buildContentIndex, emittedIdFor } from "../../content/catalog.ts";
import { readCharterTemplate } from "../../content/charter.ts";
import { HOOKS_GENERATED_DIR } from "../../emit/hooksInfra.ts";
import { renderInvariantsVersion } from "../../emit/substitution.ts";
import { readInstallMode } from "../../manifest/manifest.ts";
import {
  extractManagedBlock,
  hasManagedBlock,
  splitAtManagedBlock,
} from "../../merge/managedBlocks.ts";
import {
  describePackIntegrityFinding,
  verifyInstalledPacks,
} from "../../pack/verifyInstalled.ts";
import { findPackageRoot } from "../../shared/paths.ts";
import { TOOLS, type Tool } from "../../types/core.ts";
import { EngineError, type ErrorCode } from "../../types/errors.ts";
import {
  MANIFEST_FILE,
  PLUGIN_OWNED_CLASSES,
  type PluginOwnedClass,
  type SetupManifest,
} from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { readWorkingTreeStatus } from "../engine/gitStatus.ts";
import type { FailureDoc } from "../kit/output.ts";
import { packageCommand, packageName } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import type { Palette } from "../kit/terminal.ts";
import { planSync, type SyncPlanEntry } from "./sync/engine.ts";
import { provenanceFromManifest, type ProvenanceRollup } from "./sync/report.ts";

/**
 * `stamity check` — the doctor and the drift gate in one CI-usable verb.
 * The predecessor's `status` and `verify` both died into it.
 *
 * Three parts, one exit code:
 *
 * 1. **DOCTOR** — thirteen environment and state probes, each a
 *    {@link DoctorCheck} row. Every probe is total: it answers, or it warns
 *    about why it could not, but it never takes the command down with it.
 * 2. **DRIFT** — {@link runDriftGate} runs the sync engine's read-only PLAN
 *    and asks one question: would a sync change anything? Reusing `planSync`
 *    (rather than a second, check-shaped comparison) is what makes "check says
 *    clean" and "sync writes nothing" the same statement rather than two
 *    implementations that must be kept in agreement.
 * 3. **PROVENANCE** — the manifest IS the provenance record, so
 *    there is nothing to generate: check rolls the file up for display.
 *
 * Exit rule, chosen for CI: any doctor **fail**, a drift gate that reports
 * change, or a drift gate that could not run exits 1; warnings alone exit 0. A
 * warn is advisory — a missing state subdirectory or an absent git binary is a
 * legal repository, and a pipeline that fails on those would train its
 * operators to ignore the command.
 *
 * **Two honesty rules bind the closing lines, because breaking them is how a
 * diagnostic surface becomes worse than no diagnostic surface.**
 *
 * First, `drift: not evaluated` states the REAL reason. It has exactly two,
 * and they are not interchangeable: the manifest could not be read (the
 * doctor's `manifest` row already says so, with the fix), or the plan itself
 * threw — a pack that bricks projection, invalid content, a malformed
 * override. The second used to be swallowed into the first, so the screen said
 * "the manifest has to be readable first" two lines under a `manifest` row
 * reading `ok`, and the operator was told to fix the one thing that was
 * demonstrably fine. It also meant drift detection — the mechanism that catches
 * a generated file being tampered with — had stopped, and nothing on screen
 * said so in those terms.
 *
 * Second, `all green — nothing to do` prints only when the run is actually
 * green. It used to print alongside exit 1 whenever every doctor row passed and
 * the drift gate had been swallowed, so a human reading the terminal and a CI
 * job reading `$?` reached opposite conclusions — and the human's was the wrong
 * one. The closing block is derived from the same `ok` the exit code is.
 *
 * Nothing here writes. The two probes that could — the orphan temp-file sweep
 * and the pack-integrity re-hash — are read-only by construction: the sweep
 * runs with an infinite age threshold (its report-only mode) and the verifier
 * only hashes.
 */

/** One doctor probe's verdict. `fail` gates the exit code; `warn` is advisory. */
export interface DoctorCheck {
  id: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

/** What a sync would do, expressed as drift. Clean means: nothing, to any file. */
export interface DriftReport {
  clean: boolean;
  /** Plan entries that are not `unchanged` — create, update, or collision. */
  changes: SyncPlanEntry[];
  /** Repo-relative ledger paths with no file on disk, first appearance order. */
  missing: string[];
  /** Ledger rows queued for the reclaim sweep on the next sync. */
  reclaimPending: number;
}

/** State subdirectories `init` creates; their stores recreate them on write. */
const STATE_SUBDIRS = ["learnings", "handoffs"] as const;

/** Display path of the manifest — the state layout is fixed, so no probe is needed. */
const MANIFEST_DISPLAY = `${STATE_DIR}/${MANIFEST_FILE}`;

/** Drift lines printed before the report collapses to a `… and N more` row. */
const MAX_DRIFT_LINES = 20;

/** Names quoted inline before a detail switches to a count. */
const MAX_NAMES_INLINE = 5;

// ── Doctor ─────────────────────────────────────────────────────────────────

/**
 * Compare a Node version against the package's `engines.node` range.
 *
 * Pure and exported because it is the one probe whose failing branch cannot be
 * reached in-process: a suite runs on a Node that already satisfies the range,
 * so the below-floor case is only testable by injecting the version string.
 *
 * `includePrerelease` keeps a nightly or RC build of a satisfying major from
 * reading as below the floor — semver excludes prereleases from a plain range
 * by default, which would be a false failure rather than a real one.
 */
export function checkNodeVersion(nodeVersion: string, range: string | null): DoctorCheck {
  const id = "node-version";
  if (range === null) {
    return {
      id,
      status: "warn",
      detail:
        `running on Node ${nodeVersion}; this build's package.json did not yield a readable ` +
        `engines.node range, so the version floor was not verified`,
    };
  }
  const parsed = semver.valid(nodeVersion) ?? semver.coerce(nodeVersion)?.version ?? null;
  if (parsed === null) {
    return {
      id,
      status: "warn",
      detail: `Node reported the unparseable version ${nodeVersion}; expected a build in ${range}`,
    };
  }
  if (semver.satisfies(parsed, range, { includePrerelease: true })) {
    return { id, status: "pass", detail: `Node ${nodeVersion} satisfies ${range}` };
  }
  return {
    id,
    status: "fail",
    detail:
      `Node ${nodeVersion} is below the required ${range} — install a Node in that range ` +
      `(or switch to one with your version manager), then re-run`,
  };
}

/**
 * `engines.node` from the package that ships this build, or `null` when it
 * cannot be read as a range. Read rather than duplicated as a constant: the
 * floor is declared in package.json, and a second copy here could disagree
 * with the one npm actually enforces at install time.
 */
async function requiredNodeRange(): Promise<string | null> {
  try {
    const root = findPackageRoot(dirname(fileURLToPath(import.meta.url)));
    const parsed = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
      engines?: { node?: unknown };
    };
    const range = parsed.engines?.node;
    return typeof range === "string" && semver.validRange(range) !== null ? range : null;
  } catch {
    return null;
  }
}

/**
 * Git availability. A repository without git is legal — the CLI needs none of
 * it — so absence is a warn that says what is lost, never a failure.
 */
function checkGit(rootDir: string): DoctorCheck {
  const id = "git-available";
  const status = readWorkingTreeStatus(rootDir);
  if (!status.available) {
    return {
      id,
      status: "warn",
      detail:
        "git did not answer here — no binary on PATH, or this directory is not a repository. " +
        "Nothing in stamity requires it; sync's dirty-tree warning simply stays silent.",
    };
  }
  return {
    id,
    status: "pass",
    detail: status.dirty
      ? `git reports ${status.changedCount} uncommitted change(s) — commit or stash first if ` +
        `you want the next sync's diff to stand alone`
      : "git reports a clean working tree",
  };
}

/**
 * The manifest: present, parseable, and valid for this schema generation.
 *
 * The only probe that can fail. Absence is the un-initialised repo (fixable by
 * one command); a defect is the engine's own field-level message, passed
 * through verbatim rather than re-worded into a staler second copy.
 */
function checkManifest(state: ManifestState, app: App): DoctorCheck {
  const id = "manifest";
  if (state.failure !== undefined) return { id, status: "fail", detail: state.failure };
  if (state.manifest === null) {
    return {
      id,
      status: "fail",
      detail:
        `no ${MANIFEST_DISPLAY} — this repository is not initialised. Run: ${packageCommand("init")}`,
    };
  }
  const manifest = state.manifest;
  const skew =
    manifest.generatedBy === app.version
      ? ""
      : ` (last written by stamity ${manifest.generatedBy}; this build is ${app.version}, and ` +
        `the next sync restamps)`;
  return {
    id,
    status: "pass",
    detail:
      `${MANIFEST_DISPLAY} is valid — schema ${manifest.version}, tools ` +
      `${manifest.tools.join(", ")}, ${manifest.ledger.length} ledger row(s)${skew}`,
  };
}

/** The state subdirectories. Missing ones are a warn: their stores rebuild them. */
function checkStateDirs(rootDir: string): DoctorCheck {
  const id = "state-dirs";
  const missing = STATE_SUBDIRS.filter((name) => !existsSync(join(rootDir, STATE_DIR, name)));
  if (missing.length === 0) {
    return {
      id,
      status: "pass",
      detail: `${STATE_SUBDIRS.map((name) => `${STATE_DIR}/${name}`).join(", ")} are present`,
    };
  }
  return {
    id,
    status: "warn",
    detail:
      `missing ${missing.map((name) => `${STATE_DIR}/${name}`).join(", ")} — nothing is lost: ` +
      // Changed from "<the init remedy> recreates them now", which was false in
      // the state that produces this warning. An initialised repo refuses a
      // second init (`VALIDATION_ERROR`, exit 1) and recreates nothing, so the
      // one remedy this row named could not be run by anybody reading it. The
      // directories are planned emissions carrying a `.gitkeep`
      // (`../../emit/planner.ts` → `STATE_KEEP_DIRS`), so sync — the verb that
      // rewrites missing generated files — is the remedy that exists.
      `the learnings and handoff stores recreate a directory on their first write, and ` +
      `${packageCommand("sync")} rewrites them now`,
  };
}

/**
 * The learnings directory, through the engine's own directory pass. Counts
 * only: `stamity validate` is where the per-file detail lives, so quoting it
 * here would put the same report in two commands.
 */
async function checkLearnings(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "learnings";
  const { validation } = engine.learnings;
  const caps = validation.resolveLearningsCaps(manifest?.learnings?.maxCount);
  const result = await validation.validateLearningsDirectory(
    join(rootDir, STATE_DIR, "learnings"),
    caps,
  );
  const total = result.valid.length + result.invalid.length + result.overCap.length;
  if (result.invalid.length === 0 && result.overCap.length === 0) {
    return {
      id,
      status: "pass",
      detail: total === 0 ? "no learnings recorded yet" : `${total} learning(s), all valid`,
    };
  }
  const errorCount = result.invalid.reduce((sum, entry) => sum + entry.errors.length, 0);
  return {
    id,
    status: "warn",
    detail:
      `${result.invalid.length} of ${total} learning(s) carry ${errorCount} error(s), and ` +
      `${result.overCap.length} sit past the ${caps.maxCount}-file cap (those will not load) — ` +
      `run ${packageCommand("validate")} for the per-file detail`,
  };
}

/**
 * Writer temp-file hygiene: a live concurrent write, and `.tmp.<hex>` litter
 * left by writes that were interrupted between the temp write and the rename.
 *
 * The sweep runs with an infinite age threshold, which is its report-only
 * mode — every match comes back `removed: false`. check never writes, and a
 * diagnostic that silently deleted files would be the wrong kind of surprise
 * from a command whose whole job is to report.
 */
async function checkTmpHygiene(rootDir: string, engine: EngineRegistry): Promise<DoctorCheck> {
  const id = "tmp-hygiene";
  const { atomicWrite } = engine.merge;
  const [risk, litter] = await Promise.all([
    atomicWrite.detectConcurrentWriteRisk(rootDir),
    atomicWrite.sweepOrphanTmpFiles(rootDir, { olderThanMs: Number.POSITIVE_INFINITY }),
  ]);
  if (risk !== null) return { id, status: "warn", detail: risk };
  if (litter.length === 0) {
    return { id, status: "pass", detail: "no writer temp files left behind" };
  }
  const names = litter.slice(0, MAX_NAMES_INLINE).map((entry) => repoPath(rootDir, entry.path));
  const overflow = litter.length > MAX_NAMES_INLINE ? `, and ${litter.length - MAX_NAMES_INLINE} more` : "";
  return {
    id,
    status: "warn",
    detail:
      `${litter.length} writer temp file(s) from interrupted writes are still on disk: ` +
      `${names.join(", ")}${overflow} — check never deletes; remove them once no stamity run ` +
      `is in flight`,
  };
}

/**
 * `.env.mcp`, but only when the manifest actually selects MCP servers — a repo
 * with none needs no credential file, and warning about its absence would be
 * noise on every run.
 *
 * Secret-shaped values are counted, never treated as a defect: holding live
 * credentials is exactly what this gitignored file is for. Values never reach
 * the terminal — only names and counts do.
 */
async function checkEnvMcp(
  rootDir: string,
  engine: EngineRegistry,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "env-mcp";
  const servers = manifest?.mcp?.servers ?? [];
  if (servers.length === 0) {
    return { id, status: "pass", detail: "no MCP servers selected, so no credentials are required" };
  }
  const file = engine.mcp.env.ENV_MCP_FILE;
  const raw = await readIfPresent(join(rootDir, file));
  if (raw === null) {
    return {
      id,
      status: "warn",
      detail:
        `${servers.length} MCP server(s) selected but ${file} is absent — those servers start ` +
        `without credentials. ${packageCommand("config mcp add <id>")} recreates it with the names ` +
        `they need.`,
    };
  }
  const values = engine.mcp.env.parseEnvFile(raw);
  const reported = engine.mcp.env.reportEnvValues(values);
  const secrets = engine.mcp.secretScan.detectSecrets(values).findings.length;
  const held =
    secrets === 0 ? "" : `; ${secrets} value(s) match a known credential shape, as expected here`;
  const unfilled = reported.filter((value) => !value.set).map((value) => value.name);
  if (unfilled.length === 0) {
    return {
      id,
      status: "pass",
      detail:
        `${file} fills all ${reported.length} credential(s) for ${servers.length} ` +
        `server(s)${held}`,
    };
  }
  const names = unfilled.slice(0, MAX_NAMES_INLINE).join(", ");
  const overflow = unfilled.length > MAX_NAMES_INLINE ? ", …" : "";
  return {
    id,
    status: "warn",
    detail:
      `${unfilled.length} of ${reported.length} credential(s) in ${file} are still empty ` +
      `(${names}${overflow}) — a server whose credential is blank fails at start-up${held}`,
  };
}

/**
 * Each targeted tool's own EMITTED files, read off the ledger.
 *
 * The probe used to ask the repo analyzer's `existingTools`, which answers a
 * different question: that table lists the vendor-indicator paths a repo may
 * carry, and one of them is a file this engine deliberately never writes.
 * Copilot reads the root `AGENTS.md` natively, so its adapter emits no
 * `.github/copilot-instructions.md` mirror by design — which made the indicator
 * unsatisfiable and every copilot-targeting repo permanently warn "no config
 * found for copilot, sync recreates it". Sync does not, and cannot:
 * there is no such output in the plan. A permanent warning with a remedy that
 * provably does nothing is worse than silence, because it trains an operator to
 * stop reading the row.
 *
 * The ledger is the right source because it records what THIS engine wrote for
 * THIS tool. A tool with rows whose files are all present has its setup on
 * disk; a tool with no rows at all has never been emitted for, which one sync
 * genuinely does fix. Files that are ledgered and gone are not reported here —
 * the drift gate counts them as `missing`, by path, and saying it twice in
 * different words would be two reports of one fact.
 */
function checkToolTraces(manifest: SetupManifest | null): DoctorCheck {
  const id = "tool-traces";
  const tools = manifest?.tools ?? [];
  if (tools.length === 0) {
    return { id, status: "pass", detail: "no target tools recorded, so there is nothing to trace" };
  }
  const emitted = new Set(manifest?.ledger.map((row) => row.adapter) ?? []);
  const unemitted = tools.filter((tool) => !emitted.has(tool));
  if (unemitted.length === 0) {
    return {
      id,
      status: "pass",
      detail: `all ${tools.length} target tool(s) have emitted files recorded in the ledger`,
    };
  }
  return {
    id,
    status: "warn",
    detail:
      `nothing has been emitted for ${unemitted.join(", ")}, which the manifest targets — ` +
      `${packageCommand("sync")} writes their files and records them`,
  };
}

/**
 * One preserved slice of a managed file, normalized for comparison, carrying
 * the source line each surviving character came from.
 */
interface PreservedSlice {
  /** Whitespace-collapsed, end-trimmed text of the slice. */
  text: string;
  /** 1-based source line of the character at the same index in {@link text}. */
  lines: number[];
}

/**
 * Normalize `content[start, end)` the way the duplicate comparison needs it:
 * every run of whitespace becomes one space and both ends are trimmed, so a
 * copy that was re-wrapped or re-indented still reads as the same text. The
 * parallel `lines` array is what lets the detail name a line the operator can
 * jump to, which a normalized string alone cannot say.
 */
function normalizePreserved(content: string, start: number, end: number): PreservedSlice {
  const chars: string[] = [];
  const lines: number[] = [];
  let line = 1;
  for (let i = 0; i < start; i++) if (content.charAt(i) === "\n") line++;
  let gap = false;
  for (let i = start; i < end; i++) {
    const ch = content.charAt(i);
    const at = line;
    if (ch === "\n") line++;
    if (/\s/.test(ch)) {
      gap = chars.length > 0;
      continue;
    }
    if (gap) {
      chars.push(" ");
      lines.push(at);
      gap = false;
    }
    chars.push(ch);
    lines.push(at);
  }
  return { text: chars.join(""), lines };
}

/**
 * One ledgered file after the scan. `line` is the 1-based line where the
 * preserved region repeats the managed body, or `null` when it does not.
 */
interface ScannedFile {
  path: string;
  line: number | null;
}

/**
 * The line where {@link body} is repeated inside a managed file, or `null` when
 * it is not.
 *
 * `splitAtManagedBlock` rather than `extractCustomContent` because the detail
 * has to name a line: the joined custom content answers "is it duplicated" and
 * discards the offsets that answer "where". The two preserved slices are
 * searched separately so a match can never be assembled across the block, which
 * is not a duplicate anybody wrote.
 */
function findPreservedDuplicate(content: string, filePath: string, body: string): number | null {
  const split = splitAtManagedBlock(content, filePath);
  if (split === null) return null;
  const needle = body.trim().replace(/\s+/g, " ");
  // An empty managed body is a substring of everything; it is not a duplicate.
  if (needle === "") return null;
  const afterStart = content.length - split.after.length;
  for (const slice of [
    normalizePreserved(content, 0, split.before.length),
    normalizePreserved(content, afterStart, content.length),
  ]) {
    const at = slice.text.indexOf(needle);
    if (at !== -1) return slice.lines[at] ?? 1;
  }
  return null;
}

/**
 * Read one ledgered path and place it: `null` when there is no readable file
 * or the file carries no managed block (it is not this row's subject), a
 * {@link ScannedFile} otherwise.
 */
async function scanManagedFile(rootDir: string, path: string): Promise<ScannedFile | null> {
  const content = await readIfPresent(join(rootDir, path));
  if (content === null || !hasManagedBlock(content, path)) return null;
  const body = extractManagedBlock(content, path);
  return { path, line: body === null ? null : findPreservedDuplicate(content, path, body) };
}

/**
 * Managed content that also sits in the preserved region, where the engine
 * cannot see it.
 *
 * The failure this row exists for: an operator (or an agent) pastes the
 * generated block's body below the END marker, and the repository then loads
 * that content twice on every turn — once from the block, once from the copy.
 * Nothing else on this screen can see it. The drift gate cannot: the managed
 * block still matches byte for byte, so a sync writes nothing and reports
 * nothing, and the copy is user content the engine is contractually forbidden
 * to touch. That is also why this row can only warn — deleting the copy is the
 * operator's call, and a duplicated charter is a legal file, just a wasteful
 * one.
 *
 * Comparison is whitespace-insensitive so a re-indented or re-wrapped paste
 * still matches, and requires the WHOLE body: a preserved region quoting one
 * paragraph of the block is a reference, not a second copy.
 */
async function checkPreservedDuplicate(
  rootDir: string,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "preserved-duplicate";
  // Two owners may claim one path; the file is read once, not twice.
  const paths = [...new Set((manifest?.ledger ?? []).map((row) => row.path))];
  const scanned = (await Promise.all(paths.map((path) => scanManagedFile(rootDir, path)))).filter(
    (entry): entry is ScannedFile => entry !== null,
  );
  const findings = scanned.flatMap((entry) =>
    entry.line === null ? [] : [{ path: entry.path, line: entry.line }],
  );
  const checked = scanned.length;

  if (checked === 0) {
    return { id, status: "pass", detail: "no managed block is recorded in the ledger" };
  }
  if (findings.length === 0) {
    return {
      id,
      status: "pass",
      detail: `${checked} managed file(s) carry their block once`,
    };
  }
  const named = findings
    .slice(0, MAX_NAMES_INLINE)
    .map((finding) => `${finding.path}:${finding.line}`)
    .join(", ");
  const overflow =
    findings.length > MAX_NAMES_INLINE ? ` (and ${findings.length - MAX_NAMES_INLINE} more)` : "";
  return {
    id,
    status: "warn",
    detail:
      `${findings.length} of ${checked} managed file(s) repeat the managed block inside the ` +
      `preserved region, so this repository loads that content twice: ${named}${overflow} — ` +
      `delete the copy at each line; the block itself is regenerated on every sync`,
  };
}

/**
 * Installed pack content, re-hashed against what the install recorded.
 *
 * The distinct failure this row exists for: a pack body edited after `add`
 * returned. Nothing else on this screen can see it. The drift gate reports it
 * as ordinary regeneration drift, and the remedy drift recommends — `sync` —
 * carries the edited bytes into the emitted setup, so the one action a reader
 * is told to take is the action that launders the tampering. This row therefore
 * speaks integrity vocabulary, names the pack, and its remedy is re-installing
 * that pack; `describePackIntegrityFinding` owns the wording so the distinction
 * is stated once rather than at each caller.
 *
 * Bounded and lazy: the pass reads only pack-owned ledger rows that carry a
 * recorded hash, so a repo with no installed pack does no filesystem work at
 * all, and a repo with one reads exactly the files that pack landed — never a
 * directory walk. Findings are counted in full and NAMED up to
 * {@link MAX_NAMES_INLINE}, so a pack whose whole tree was replaced reports the
 * count without printing a thousand lines.
 */
async function checkPackIntegrity(
  rootDir: string,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "pack-integrity";
  if (manifest === null) {
    return { id, status: "pass", detail: "no readable manifest, so no installed pack to verify" };
  }
  const report = await verifyInstalledPacks(rootDir, manifest);
  if (report.checked === 0) {
    return { id, status: "pass", detail: "no installed pack content is recorded in the ledger" };
  }
  if (report.findings.length === 0) {
    return {
      id,
      status: "pass",
      detail: `${report.checked} installed pack file(s) still match the hashes recorded at install`,
    };
  }
  const shown = report.findings.slice(0, MAX_NAMES_INLINE).map(describePackIntegrityFinding);
  const overflow =
    report.findings.length > MAX_NAMES_INLINE
      ? ` (and ${report.findings.length - MAX_NAMES_INLINE} more)`
      : "";
  return {
    id,
    status: "fail",
    detail:
      `${report.findings.length} of ${report.checked} installed pack file(s) no longer match ` +
      `what was verified at install${overflow}: ${shown.join(" ")}`,
  };
}

/**
 * Which version of the floor invariants this install's corpus carries.
 *
 * A `pass` row with no failing case of its own: the values are validated at
 * load ({@link readCharterTemplate}), so an unreadable or malformed charter
 * cannot reach here as a wrong version — it arrives as a throw, which
 * {@link guarded} turns into a `warn` naming the key. What the row buys is
 * ATTRIBUTION: the emitted always-on file states a version, and an operator
 * comparing two repos needs one command that says which version the installed
 * engine would render, without opening the generated file and trusting it.
 */
async function checkInvariants(): Promise<DoctorCheck> {
  const id = "invariants";
  const charter = await readCharterTemplate();
  if (charter.invariants === null) {
    return {
      id,
      status: "warn",
      detail: "the installed charter declares no `invariants_version`; it predates versioning",
    };
  }
  return { id, status: "pass", detail: `invariants ${renderInvariantsVersion(charter.invariants)}` };
}


// ── Plugin rows ────────────────────────────────────────────────────────────

/**
 * The environment variables a client sets to the root of an installed plugin,
 * in the order {@link checkPluginRuntime} probes them.
 *
 * The same four, in the same order, that `resolvePluginRoot` reads
 * (`docs/plans/008-plugin-lifecycle-02.md`, unit C6). A generic `PLUGIN_ROOT`
 * sits third because two of the four clients set a named variable of their own
 * and the generic one is the fallback an operator exports by hand.
 */
const PLUGIN_ROOT_VARIABLES = [
  "CLAUDE_PLUGIN_ROOT",
  "CURSOR_PLUGIN_ROOT",
  "PLUGIN_ROOT",
  "COPILOT_PLUGIN_ROOT",
] as const;

/**
 * Wall-time ceiling on the locator spawn. A doctor row that can hang is a `check`
 * that can hang, and `check` is the CI gate — so the probe gives up and warns
 * rather than holding a pipeline open on a runtime resolution.
 */
const PLUGIN_LOCATOR_TIMEOUT_MS = 5_000;

/** The locator every plugin root ships, relative to that root. */
const PLUGIN_LOCATOR_PATH = "runtime/locate.mjs";

/** The locator's `--print` document (`scripts/plugins/locate.mjs`). */
interface LocatorReport {
  runtime: {
    kind: "companion" | "bundled" | "none";
    path: string | null;
    version: string | null;
    refusal: string | null;
  };
  node: { version: string; floor: string; ok: boolean };
}

/** One locator spawn's outcome, total: a failure to spawn is an answer. */
interface LocatorRun {
  /** Exit status, or `null` when the process never produced one. */
  status: number | null;
  stdout: string;
  timedOut: boolean;
  failure: string | null;
}

/**
 * Spawn `<root>/runtime/locate.mjs --print` and collect its verdict.
 *
 * `process.execPath` with `shell: false` (execFile's default), never a bare
 * `node` off PATH: the interpreter that resolves the runtime has to be THIS
 * one, and a shell would give the root path's own characters a meaning on
 * Windows that they do not have here.
 */
function runPluginLocator(locator: string): Promise<LocatorRun> {
  return new Promise((settle) => {
    execFile(
      process.execPath,
      [locator, "--print"],
      { timeout: PLUGIN_LOCATOR_TIMEOUT_MS, windowsHide: true, encoding: "utf8" },
      (error, stdout) => {
        if (error === null) {
          settle({ status: 0, stdout, timedOut: false, failure: null });
          return;
        }
        const failed = error as NodeJS.ErrnoException & { killed?: boolean };
        settle({
          // `code` is the exit status on a non-zero exit and an errno string
          // (`ENOENT`) when the spawn itself failed; only the first is a status.
          status: typeof failed.code === "number" ? failed.code : null,
          stdout,
          // The kill the timeout performs, distinguished from a process that
          // chose its own exit: `killed` alone is what the option sets.
          timedOut: failed.killed === true,
          failure: error.message,
        });
      },
    );
  });
}

/** The locator's document, or `null` when stdout was not one. */
function parseLocatorReport(stdout: string): LocatorReport | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { runtime, node } = parsed as Record<string, unknown>;
    if (typeof runtime !== "object" || runtime === null) return null;
    if (typeof node !== "object" || node === null) return null;
    return parsed as LocatorReport;
  } catch {
    return null;
  }
}

/** Major version of a semver-ish string, or `null` when it is not one. */
function majorOf(version: string | null | undefined): number | null {
  if (typeof version !== "string") return null;
  const parsed = semver.valid(version) ?? semver.coerce(version)?.version ?? null;
  return parsed === null ? null : semver.major(parsed);
}

/**
 * Which runtime an installed plugin would run this engine from.
 *
 * Absent is not a defect: most repositories are not plugin-backed, and the row
 * warns with the two ways to make it answerable rather than failing a CI gate
 * on a setup that never claimed to be one.
 *
 * It fails on exactly two things, and both are states in which the plugin is
 * installed and does not work: the locator REFUSED (exit 2 — no runtime found,
 * or a Node below the floor), and a plugin-backed repository whose state was
 * written by a different major than the runtime resolves. The second is
 * REQ-PLUGIN-013's compatibility half read from the doctor's side: the manifest
 * and the runtime disagreeing about the major is the state where a sync would
 * rewrite files under rules the recorded setup was not written to.
 *
 * Anything else the spawn can do — a timeout, a root with no locator in it,
 * stdout that is not the document — warns. The row reports on an environment it
 * does not own, and turning a broken plugin install into a failed `check` would
 * gate a repository's CI on a client's own state.
 */
async function checkPluginRuntime(
  env: Readonly<Record<string, string | undefined>>,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "plugin-runtime";
  const variable = PLUGIN_ROOT_VARIABLES.find((name) => (env[name] ?? "").trim() !== "");
  if (variable === undefined) {
    return {
      id,
      status: "warn",
      detail:
        `no plugin root in the environment; run this check through the plugin's st-setup or ` +
        `set ${PLUGIN_ROOT_VARIABLES[0]}`,
    };
  }
  const root = (env[variable] ?? "").trim();
  const locator = join(root, ...PLUGIN_LOCATOR_PATH.split("/"));
  const run = await runPluginLocator(locator);

  if (run.timedOut) {
    return {
      id,
      status: "warn",
      detail:
        `${locator} did not answer within ${PLUGIN_LOCATOR_TIMEOUT_MS / 1000}s and was stopped, ` +
        `so no runtime was resolved: ${run.failure ?? "no message"}`,
    };
  }

  const report = parseLocatorReport(run.stdout);
  if (run.status === 2) {
    return {
      id,
      status: "fail",
      detail:
        `${variable}=${root}: ${report?.runtime.refusal ?? run.failure ?? "the locator refused without a message"}`,
    };
  }
  if (run.status !== 0 || report === null) {
    return {
      id,
      status: "warn",
      detail:
        `${locator} reported no runtime (exit ${run.status ?? "none"}): ` +
        `${run.failure ?? "stdout was not the locator's --print document"}`,
    };
  }

  const { kind, path, version } = report.runtime;
  const detail = `runtime ${kind} ${version ?? "unknown"} at ${path ?? root}`;
  if (readInstallMode(manifest) === "plugin-backed") {
    const runtimeMajor = majorOf(version);
    const stateMajor = majorOf(manifest?.generatedBy);
    if (runtimeMajor !== null && stateMajor !== null && runtimeMajor !== stateMajor) {
      return {
        id,
        status: "fail",
        detail:
          `${detail}, but this repository's ${STATE_DIR}/ state was written by stamity ` +
          `${manifest?.generatedBy ?? "an unrecorded version"} — major ${runtimeMajor} against ` +
          `major ${stateMajor}. Pin the plugin back to a ${stateMajor}.x release, or install the ` +
          `matching companion runtime, before the next sync rewrites anything.`,
      };
    }
  }
  return { id, status: "pass", detail };
}

/** One duplicated class, with the source that put it there. */
interface DuplicateFinding {
  tool: Tool;
  cls: PluginOwnedClass;
  source: "ledger" | "apm" | "unmanaged";
  files: number;
  remedy: string;
}

/**
 * Each client's NATIVE content directories, with the class each one holds.
 *
 * The vendor-neutral `.agents/skills/` tree appears under all three of its
 * readers by design: a leftover skill there is a duplicate for each of them
 * separately, and the row's detail is per client.
 */
const NATIVE_CONTENT_DIRS: Readonly<Record<Tool, readonly (readonly [string, PluginOwnedClass])[]>> =
  {
    claude: [
      [".claude/agents", "agent"],
      [".claude/commands", "command"],
      [".claude/skills", "skill"],
    ],
    cursor: [
      [".cursor/agents", "agent"],
      [".cursor/rules", "rule"],
      [".agents/skills", "skill"],
    ],
    copilot: [
      [".github/agents", "agent"],
      [".github/prompts", "command"],
      [".agents/skills", "skill"],
    ],
    codex: [
      [".codex/agents", "agent"],
      [".agents/skills", "skill"],
    ],
  };

/** Extensions the four clients spell a content file with. */
const NATIVE_CONTENT_EXTENSIONS = [".md", ".mdc", ".toml"] as const;

/**
 * The emitted id a native directory entry stands for: a file's basename with
 * its client extension removed, or a directory's own name (a skill and a
 * cursor command are both directories holding a `SKILL.md`).
 */
function nativeEntryId(name: string, isDirectory: boolean): string {
  if (isDirectory) return name;
  const extension = NATIVE_CONTENT_EXTENSIONS.find((suffix) => name.endsWith(suffix));
  return extension === undefined ? name : name.slice(0, -extension.length);
}

/**
 * Every emitted id this engine's catalog would produce for `classes` — the ids
 * a plugin built from the same corpus carries.
 *
 * Read through {@link emittedIdFor}, the one answer every surface that names an
 * artifact to a human shares, so a file called `stamity-reviewer.md` is matched
 * by the same spelling rule that would have written it.
 */
async function pluginCarriedIds(
  classes: ReadonlySet<PluginOwnedClass>,
): Promise<ReadonlySet<string>> {
  const index = await buildContentIndex();
  const ids = new Set<string>();
  for (const item of index.items) {
    if (classes.has(item.type)) ids.add(emittedIdFor(item));
  }
  return ids;
}

/**
 * Files under one client's native directories that carry a plugin id and that
 * no ledger row owns.
 *
 * "No ledger row owns" is the whole distinction between this source and
 * `ledger`: a path this engine wrote is reported with the remedy that removes
 * it through the engine, and a path it did not is reported as the operator's
 * own file, never as something a verb will delete.
 */
async function unmanagedDuplicates(
  rootDir: string,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
  ledgerPaths: ReadonlySet<string>,
  carriedIds: ReadonlySet<string>,
): Promise<DuplicateFinding[]> {
  const scans = NATIVE_CONTENT_DIRS[tool]
    .filter(([, cls]) => classes.has(cls))
    .map(async ([dir, cls]): Promise<DuplicateFinding[]> => {
      const entries = await readDirEntries(join(rootDir, ...dir.split("/")));
      let files = 0;
      for (const entry of entries) {
        const isDirectory = entry.isDirectory();
        if (!carriedIds.has(nativeEntryId(entry.name, isDirectory))) continue;
        const path = `${dir}/${entry.name}`;
        // A directory is owned when ANY row under it is: the ledger records the
        // files a skill projects, never the directory itself.
        const owned = isDirectory
          ? [...ledgerPaths].some((row) => row.startsWith(`${path}/`))
          : ledgerPaths.has(path);
        if (!owned) files += 1;
      }
      if (files === 0) return [];
      return [
        {
          tool,
          cls,
          source: "unmanaged",
          files,
          remedy:
            `not written by this engine; remove the file or keep it as an override under ` +
            `${STATE_DIR}/overrides/`,
        },
      ];
    });
  return (await Promise.all(scans)).flat();
}

/** Directory entries, or none: an absent native directory is an answer. */
async function readDirEntries(path: string): Promise<Dirent[]> {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * APM dependencies that deploy the same content this plugin carries.
 *
 * An APM install writes agents, skills and commands straight into the client
 * directories with no ledger row and no manifest entry, so neither of the other
 * two sources can see it — the only trace it leaves in the repository is the
 * dependency line that asks for it.
 *
 * The match is on THIS installation's own package name (`packageName()`), never
 * a hardcoded canonical one: a downstream that renamed the package as
 * `docs/enterprise-forks.md` instructs has to recognise its own dependency. A
 * private mirror published under an unrelated name is NOT matched — the row
 * would rather miss that case than fail a repository's CI on a dependency whose
 * name merely resembles this one.
 */
function apmDuplicates(
  apmYaml: string | null,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
): DuplicateFinding[] {
  if (apmYaml === null) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(apmYaml);
  } catch {
    // An unreadable apm.yml is a fact for a different row to raise; this one
    // answers about duplicates and cannot claim any from a file it cannot read.
    return [];
  }
  const declared = (parsed as { dependencies?: unknown } | null)?.dependencies;
  if (!Array.isArray(declared)) return [];
  const own = packageName();
  const matched: string[] = [];
  for (const entry of declared) {
    const text =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null
          ? Object.values(entry as Record<string, unknown>)
              .filter((value) => typeof value === "string")
              .join(" ")
          : "";
    if (text.includes(own)) matched.push(text);
  }
  if (matched.length === 0) return [];
  // APM deploys content, never hook wiring or always-on rules, so the classes
  // it can duplicate are the three it actually writes.
  const deployable = (["agent", "skill", "command"] as const).filter((cls) => classes.has(cls));
  return deployable.map((cls) => ({
    tool,
    cls,
    source: "apm" as const,
    files: matched.length,
    remedy:
      `the APM dependency ${matched.join(", ")} deploys the same classes; remove it from ` +
      `apm.yml and run apm install, or keep the plugin uninstalled`,
  }));
}

/**
 * Content a plugin carries that this repository ALSO holds, from all three
 * sources it can come from.
 *
 * The severity split is the coexistence rule of REQ-PLUGIN-019, and it is not a
 * matter of taste: a repository whose manifest still says `mode: "generated"`
 * has an installed plugin beside a generated setup, which is the expected state
 * BEFORE the operator cleans — failing there would break the CI of every
 * repository mid-migration. Once the manifest records `plugin-backed`, the same
 * finding is a defect: emission has stopped writing those classes, so anything
 * still on disk is stale content the client is loading twice.
 *
 * No verb deletes any of it. Every remedy is the operator's own step, named
 * per source, because two of the three sources are files this engine has no
 * ownership claim over at all.
 */
async function checkPluginDuplicates(
  rootDir: string,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "plugin-duplicates";
  const recorded = manifest?.plugin?.clients ?? {};
  const tools = TOOLS.filter((tool) => recorded[tool] !== undefined);
  if (tools.length === 0) {
    return { id, status: "pass", detail: "no client records a plugin, so nothing can duplicate" };
  }

  const ledgerPaths = new Set((manifest?.ledger ?? []).map((row) => row.path));
  const apmYaml = await readIfPresent(join(rootDir, "apm.yml"));
  // Per client, in parallel: each answer reads a disjoint set of directories
  // and the same two in-memory inputs, so the only ordering that matters is the
  // one the flatten below restores.
  const perTool = await Promise.all(
    tools.map(async (tool) => {
      const classes = new Set(recorded[tool]?.classes ?? []);
      if (classes.size === 0) return [];
      return await duplicatesForClient(rootDir, tool, classes, manifest, apmYaml, ledgerPaths);
    }),
  );
  const findings = perTool.flat();

  if (findings.length === 0) {
    return { id, status: "pass", detail: "no duplicated classes" };
  }
  const lines = findings.map(
    (finding) =>
      `${finding.tool}: ${finding.cls} (${finding.files} file(s), ${finding.source}) — ${finding.remedy}`,
  );
  return {
    id,
    status: readInstallMode(manifest) === "plugin-backed" ? "fail" : "warn",
    detail: lines.join("\n                         "),
  };
}

/** One recorded client's duplicates, from all three sources. */
async function duplicatesForClient(
  rootDir: string,
  tool: Tool,
  classes: ReadonlySet<PluginOwnedClass>,
  manifest: SetupManifest | null,
  apmYaml: string | null,
  ledgerPaths: ReadonlySet<string>,
): Promise<DuplicateFinding[]> {
  const findings: DuplicateFinding[] = [];
  // Source 1 — rows this engine wrote and still owns. A hook row is any row
  // under the generated hooks tree: that directory is what REQ-PLUGIN-016
  // names as the one a plugin-backed setup writes nothing into, and a
  // client's own config document (`.claude/settings.json`) is deliberately
  // not counted, since it carries repository configuration as well.
  const ledgerRows = (manifest?.ledger ?? []).filter((row) => row.adapter === tool);
  const byClass = new Map<PluginOwnedClass, number>();
  for (const row of ledgerRows) {
    const cls: PluginOwnedClass | null =
      row.artifactType === "infra"
        ? row.path.startsWith(`${HOOKS_GENERATED_DIR}/${tool}/`)
          ? "hooks"
          : null
        : row.artifactType;
    if (cls === null || !classes.has(cls)) continue;
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1);
  }
  for (const cls of PLUGIN_OWNED_CLASSES) {
    const files = byClass.get(cls);
    if (files === undefined) continue;
    findings.push({
      tool,
      cls,
      source: "ledger",
      files,
      remedy: `${packageCommand("clean -y")} then ${packageCommand(`plugin setup --client ${tool}`)}`,
    });
  }

  findings.push(...apmDuplicates(apmYaml, tool, classes));
  findings.push(
    ...(await unmanagedDuplicates(
      rootDir,
      tool,
      classes,
      ledgerPaths,
      await pluginCarriedIds(classes),
    )),
  );
  return findings;
}

/**
 * Every doctor probe, in report order.
 *
 * The manifest is read once, up front, because five probes are conditioned on
 * it; the rest are independent reads issued together, and the destructuring
 * order below — not whichever probe finished first — is what makes the report
 * deterministic.
 *
 * `process.versions.node` is read here rather than through the runtime seam:
 * the seam carries cwd, env and clock, not the interpreter's own version. The
 * comparison itself stays pure in {@link checkNodeVersion}.
 */
export async function runDoctor(
  rootDir: string,
  engine: EngineRegistry,
  app: App,
): Promise<DoctorCheck[]> {
  const state = await readManifestState(rootDir, engine);
  const { manifest } = state;

  const [
    range,
    learnings,
    tmpHygiene,
    envMcp,
    preservedDuplicate,
    packIntegrity,
    pluginRuntime,
    pluginDuplicates,
    invariants,
  ] = await Promise.all([
    requiredNodeRange(),
    guarded("learnings", () => checkLearnings(rootDir, engine, manifest)),
    guarded("tmp-hygiene", () => checkTmpHygiene(rootDir, engine)),
    guarded("env-mcp", () => checkEnvMcp(rootDir, engine, manifest)),
    guarded("preserved-duplicate", () => checkPreservedDuplicate(rootDir, manifest)),
    guarded("pack-integrity", () => checkPackIntegrity(rootDir, manifest)),
    guarded("plugin-runtime", () => checkPluginRuntime(app.runtime.env, manifest)),
    guarded("plugin-duplicates", () => checkPluginDuplicates(rootDir, manifest)),
    guarded("invariants", checkInvariants),
  ]);

  return [
    checkNodeVersion(process.versions.node, range),
    checkGit(rootDir),
    checkManifest(state, app),
    checkStateDirs(rootDir),
    learnings,
    tmpHygiene,
    envMcp,
    checkToolTraces(manifest),
    preservedDuplicate,
    packIntegrity,
    // The two plugin rows sit after the repository-state probes and before the
    // corpus one, because the first of them answers about the ENVIRONMENT (is a
    // plugin root reachable, and does its runtime match this state) and the
    // second about the repository beside it.
    pluginRuntime,
    pluginDuplicates,
    // Last, and read off the installed corpus rather than the repo: every row
    // above answers about THIS repository's state, and this one answers about
    // the engine's own content — the version of the floors a sync would write.
    invariants,
  ];
}

// ── Drift ──────────────────────────────────────────────────────────────────

/**
 * Would a sync change anything? Wraps the sync engine's read-only plan, so the
 * gate and the write verb read one implementation.
 *
 * Three independent sources of drift:
 *
 * - a plan entry that is not `unchanged` — create, update, or collision. A
 *   content-hash comparison is not needed on top: `predictMergeAction` already
 *   compares the bytes sync would write against the bytes on disk, so a
 *   silently edited managed file is exactly what `update` means;
 * - a ledger row whose file is gone — the engine claims to own a path that no
 *   longer exists;
 * - a pending reclaim candidate — a file queued for removal on the next sync.
 *
 * Propagates the plan's failures: an un-initialised repo (`VALIDATION_ERROR`)
 * and an unreadable manifest (`CONFIG_ERROR`) are the caller's to interpret.
 */
export async function runDriftGate(rootDir: string, engineVersion: string): Promise<DriftReport> {
  const plan = await planSync(rootDir, engineVersion);
  const changes = plan.entries.filter((entry) => entry.action !== "unchanged");

  const missing: string[] = [];
  const seen = new Set<string>();
  for (const row of plan.manifest.ledger) {
    // Two owners may share a path; the file is missing once, not twice.
    if (seen.has(row.path)) continue;
    seen.add(row.path);
    if (!existsSync(join(rootDir, row.path))) missing.push(row.path);
  }

  const reclaimPending = plan.reclaim.length;
  return {
    clean: changes.length === 0 && missing.length === 0 && reclaimPending === 0,
    changes,
    missing,
    reclaimPending,
  };
}

/**
 * What the drift gate produced — a verdict, or a named reason it has none.
 *
 * Module-internal: the command's own renderers and payload read it, and the
 * shape a caller outside this file needs is the {@link DriftReport} that
 * `runDriftGate` already returns.
 */
type DriftOutcome =
  | { kind: "evaluated"; report: DriftReport }
  /** The manifest is missing or defective; the `manifest` row carries the fix. */
  | { kind: "no-manifest"; reason: string }
  /** The gate ran and threw: the plan itself is broken. Diagnosable, and fatal. */
  | { kind: "failed"; code: ErrorCode | "FAILURE"; reason: string };

/**
 * Run the drift gate, or say precisely why there is no verdict.
 *
 * The narrow swallow is the point. Exactly ONE cause is absorbed silently — a
 * manifest that is absent or unreadable — because the doctor's `manifest` row
 * already reports that with its fix, and stating it twice in two vocabularies
 * helps nobody. It is recognised by the manifest read this command already did,
 * not by catching an error code, which is what made the swallow wide: `planSync`
 * raises `VALIDATION_ERROR` and `CONFIG_ERROR` for a pack that bricks
 * projection, invalid content and a malformed override too, and every one of
 * them was being reported as "the manifest has to be readable first".
 *
 * Everything else is CAPTURED, not swallowed and not re-thrown. Capturing keeps
 * the ten other probes on screen, which a diagnostic command exists to
 * produce, while the message — the engine's own, naming the pack and the cause,
 * the same sentence `sync` prints in this state — becomes the drift verdict and
 * gates the exit. Re-throwing would have replaced the whole report with one
 * error document; swallowing is what produced a screen of green rows over a
 * non-zero exit.
 */
async function evaluateDrift(
  rootDir: string,
  engineVersion: string,
  manifestState: ManifestState,
): Promise<DriftOutcome> {
  if (manifestState.failure !== undefined) {
    return { kind: "no-manifest", reason: manifestState.failure };
  }
  if (manifestState.manifest === null) {
    return {
      kind: "no-manifest",
      reason: `there is no ${MANIFEST_DISPLAY} to plan against — see the manifest row above`,
    };
  }
  try {
    return { kind: "evaluated", report: await runDriftGate(rootDir, engineVersion) };
  } catch (cause) {
    return {
      kind: "failed",
      code: cause instanceof EngineError ? cause.code : "FAILURE",
      reason: messageOf(cause),
    };
  }
}

/** The verdict when there is one; `null` for both no-verdict outcomes. */
function driftReportOf(outcome: DriftOutcome): DriftReport | null {
  return outcome.kind === "evaluated" ? outcome.report : null;
}

// ── Rendering ──────────────────────────────────────────────────────────────

/** Fixed-width status tokens; ASCII renders on every terminal the CLI targets. */
const STATUS_TOKEN: Record<DoctorCheck["status"], string> = {
  pass: "ok  ",
  warn: "warn",
  fail: "fail",
};

function paintStatus(status: DoctorCheck["status"], palette: Palette): string {
  const token = STATUS_TOKEN[status];
  if (status === "pass") return palette.green(token);
  return status === "warn" ? palette.yellow(token) : palette.red(token);
}

function renderDoctor(ctx: CliContext, doctor: readonly DoctorCheck[]): void {
  const width = Math.max(...doctor.map((row) => row.id.length));
  ctx.io.out(`${ctx.palette.bold("doctor")}\n`);
  for (const row of doctor) {
    // Pad before painting: escape codes would otherwise count toward the width.
    ctx.io.out(
      `  ${paintStatus(row.status, ctx.palette)}  ${row.id.padEnd(width)}  ${row.detail}\n`,
    );
  }
}

function renderDrift(ctx: CliContext, outcome: DriftOutcome): void {
  const { palette } = ctx;
  if (outcome.kind === "no-manifest") {
    ctx.io.out(`\n${palette.yellow("drift: not evaluated")} — ${outcome.reason}\n`);
    return;
  }
  if (outcome.kind === "failed") {
    // Named as a stopped MECHANISM, not as a missing number. Drift detection is
    // what catches a generated file being edited behind the engine's back; a
    // reader who is told only "not evaluated" does not learn that the guard is
    // off, which is the fact that matters after a suspected tamper.
    ctx.io.out(
      `\n${palette.red("drift: not evaluated")} — the plan could not be built, so nothing was ` +
        `compared and tampering with a generated file would NOT be detected by this run ` +
        `[${outcome.code}]: ${outcome.reason}\n`,
    );
    return;
  }
  const drift = outcome.report;
  if (drift.clean) {
    ctx.io.out(
      `\n${palette.green("drift: clean")} — every generated file matches what a sync would ` +
        `write\n`,
    );
    return;
  }

  ctx.io.out(
    `\n${palette.yellow("drift:")} ${drift.changes.length} file(s) would change, ` +
      `${drift.missing.length} ledgered file(s) missing, ${drift.reclaimPending} queued for ` +
      `reclaim\n`,
  );
  const rows = [
    ...drift.changes.map((entry) => `  ${entry.action.padEnd(9)} ${entry.path}`),
    ...drift.missing.map((path) => `  ${"missing".padEnd(9)} ${path}`),
  ];
  for (const row of rows.slice(0, MAX_DRIFT_LINES)) ctx.io.out(`${palette.dim(row)}\n`);
  if (rows.length > MAX_DRIFT_LINES) {
    ctx.io.out(palette.dim(`  … and ${rows.length - MAX_DRIFT_LINES} more\n`));
  }
}

/**
 * The manifest-as-provenance block. Nothing is generated here — the
 * manifest is the record, and this is a reading of it.
 */
function renderProvenance(ctx: CliContext, provenance: ProvenanceRollup | null): void {
  const { palette } = ctx;
  if (provenance === null) {
    ctx.io.out(`\n${palette.dim("provenance: none — the manifest is the record, and there is no readable one")}\n`);
    return;
  }
  ctx.io.out(
    `\n${palette.dim(
      `provenance (the manifest is the record): generated by ${provenance.generatedBy} · ` +
        `updated ${provenance.updatedAt} · schema ${provenance.manifestVersion}`,
    )}\n`,
  );
  for (const row of provenance.perAdapter) {
    const stamp = row.stampedVersion === null ? "" : ` (stamped v${row.stampedVersion})`;
    ctx.io.out(palette.dim(`  ${row.adapter}: ${row.files} file(s)${stamp}\n`));
  }
  for (const pack of provenance.packs) {
    ctx.io.out(palette.dim(`  pack ${pack.packId}: ${pack.files} file(s)\n`));
  }
}

/** Paths a sync would refuse to write because a user file already holds them. */
function collidingPaths(report: DriftReport): string[] {
  return report.changes.filter((entry) => entry.action === "collision").map((entry) => entry.path);
}

/** Whether anything a plain sync CAN fix is drifted, collisions aside. */
function hasNonCollisionDrift(report: DriftReport): boolean {
  return (
    report.changes.some((entry) => entry.action !== "collision") ||
    report.missing.length > 0 ||
    report.reclaimPending > 0
  );
}

/** Names quoted before the collision step collapses to a count. */
const MAX_COLLISIONS_INLINE = 3;

/**
 * The step a collision actually needs, in the operator's own vocabulary.
 *
 * Both remedies are named because they are not equivalent: `--force` keeps the
 * generated file and moves the operator's bytes to a verified `.bak`, while
 * moving the file aside keeps their copy where they can read it. Which one is
 * right depends on whose content matters, and this command cannot know that.
 */
function collisionStep(paths: readonly string[]): string {
  const shown = paths.slice(0, MAX_COLLISIONS_INLINE).join(", ");
  const rest = paths.length - Math.min(paths.length, MAX_COLLISIONS_INLINE);
  const named = rest > 0 ? `${shown} (+${rest} more)` : shown;
  return (
    `${paths.length} file(s) collide — the engine cannot prove it wrote ${named}, so a plain ` +
    `sync refuses them. Either move each aside and run ${packageCommand("sync")}, or run ` +
    `${packageCommand("sync --force")} to overwrite them after a verified .bak. Running sync ` +
    `without one of those two ` +
    `changes nothing.`
  );
}

/**
 * The closing block: what to run next, or that there is nothing to run.
 *
 * `ok` is passed in rather than re-derived, because it is the same value the
 * exit code is computed from. A closing line computed independently is exactly
 * how `all green — nothing to do` came to print beside exit 1: the two answers
 * were derived twice and disagreed, and the green one was the wrong one. With
 * `ok` false this block always prints a `next:` list — and if no specific step
 * matched, it says the run is not green and names the rows to read, which is
 * still an instruction rather than a contradiction.
 */
function renderNextSteps(
  ctx: CliContext,
  doctor: readonly DoctorCheck[],
  outcome: DriftOutcome,
  ok: boolean,
): void {
  const steps: string[] = [];
  if (doctor.some((row) => row.id === "manifest" && row.status === "fail")) {
    steps.push(`${packageCommand("init")} — this repository has no usable manifest`);
  }
  if (doctor.some((row) => row.id === "pack-integrity" && row.status === "fail")) {
    // Deliberately NOT sync: for an edited pack body sync copies the current
    // bytes into the generated setup, which propagates the change rather than
    // correcting it. Re-installing is what restores the recorded content.
    steps.push(
      `${packageCommand("clean --pack <id>")} then ${packageCommand("add <id>")} — re-install ` +
        `the pack whose installed files no longer match; do not run sync first, it would carry ` +
        `the current bytes into the generated setup`,
    );
  }
  if (outcome.kind === "failed") {
    steps.push(
      `fix what the drift line names, then re-run ${packageCommand("check")} — until the plan builds, ` +
        `no generated file is being compared against anything`,
    );
  }
  if (outcome.kind === "evaluated" && !outcome.report.clean) {
    // Branched for the same reason the pack-integrity row above it is: sync is
    // the remedy for drift and is REFUSED on a collision, so naming it there
    // sent the operator into an exit-1 loop — check says run sync, sync says it
    // will not, check says run sync. The collision remedy already existed in
    // this command's own `--json` per-entry detail and was printed nowhere a
    // human would read it.
    const collisions = collidingPaths(outcome.report);
    steps.push(
      ...(collisions.length > 0 ? [collisionStep(collisions)] : []),
      ...(hasNonCollisionDrift(outcome.report)
        ? [`${packageCommand("sync")} — regenerate the files that drifted`]
        : []),
    );
  }
  if (steps.length === 0 && ok) {
    const warnings = doctor.filter((row) => row.status === "warn").length;
    ctx.io.out(
      warnings === 0
        ? `\n${ctx.palette.green("all green")} — nothing to do\n`
        : `\n${ctx.palette.green("ok")} — ${warnings} advisory warning(s) above, nothing to do\n`,
    );
    return;
  }
  if (steps.length === 0) {
    steps.push(
      "read the failing row(s) above — this run is not green, so it exits 1 whatever the " +
        "rows individually recommend",
    );
  }
  ctx.io.out("\nnext:\n");
  for (const [index, step] of steps.entries()) ctx.io.out(`  ${index + 1}. ${step}\n`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface ManifestState {
  readonly manifest: SetupManifest | null;
  /** The engine's message when the manifest exists but cannot be read. */
  readonly failure?: string;
}

/**
 * Read the manifest once for the probes that need it. A defective manifest is
 * carried as a message rather than thrown: it is one row's verdict, and the
 * other nine probes still have work to do.
 */
async function readManifestState(
  rootDir: string,
  engine: EngineRegistry,
): Promise<ManifestState> {
  try {
    return { manifest: await engine.manifest.manifest.readManifest(rootDir) };
  } catch (cause) {
    return { manifest: null, failure: messageOf(cause) };
  }
}

/**
 * The provenance rollup, or `null` when there is no readable manifest. Failures
 * are swallowed on purpose: the doctor's `manifest` row is the single place a
 * manifest defect is reported, and it reports it with the fix.
 */
async function readProvenance(
  rootDir: string,
  engine: EngineRegistry,
): Promise<ProvenanceRollup | null> {
  try {
    const manifest = await engine.manifest.manifest.readManifest(rootDir);
    return manifest === null ? null : provenanceFromManifest(manifest);
  } catch {
    return null;
  }
}

/**
 * Run one probe, converting anything it throws into a warn row for that probe.
 * A sealed directory or an unreadable file is worth saying out loud; it is not
 * worth losing the other nine verdicts over.
 */
async function guarded(id: string, run: () => Promise<DoctorCheck>): Promise<DoctorCheck> {
  try {
    return await run();
  } catch (cause) {
    return { id, status: "warn", detail: `could not be checked: ${messageOf(cause)}` };
  }
}

/** File text, or `null` when there is nothing readable at `path`. */
async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
    throw cause;
  }
}

/** Repo-relative POSIX form, so output never leaks a machine layout. */
function repoPath(rootDir: string, absolute: string): string {
  const rel = relative(rootDir, absolute);
  return rel === "" ? "." : rel.split(sep).join("/");
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export const checkCommand: CommandModule = {
  name: "check",
  summary: "diagnose the environment and gate on drift between disk and the engine's output",
  mutating: false,

  // No spinner: this is the CI gate, and progress chatter on stdout would sit
  // in the middle of the report a pipeline is reading.
  async run(ctx: CliContext): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;

    // The manifest is read once here and handed to both consumers, because the
    // drift gate's swallow has to be conditioned on THIS read rather than on
    // the shape of an error the plan happened to throw. The doctor's own probes
    // and the provenance rollup stay independent reads issued together; it is
    // one small JSON file, and threading one parse through every signature buys
    // less than it costs in coupling.
    const manifestState = await readManifestState(rootDir, ctx.engine);
    const [doctor, drift, provenance] = await Promise.all([
      runDoctor(rootDir, ctx.engine, ctx.app),
      evaluateDrift(rootDir, ctx.app.version, manifestState),
      readProvenance(rootDir, ctx.engine),
    ]);

    // One value, read by the exit code, the closing block and the payload, so
    // no two surfaces can answer this question differently. A gate that could
    // not run is never success: `evaluated` is required, not just `clean`.
    const ok =
      !doctor.some((row) => row.status === "fail") &&
      drift.kind === "evaluated" &&
      drift.report.clean;

    renderDoctor(ctx, doctor);
    renderDrift(ctx, drift);
    renderProvenance(ctx, provenance);
    renderNextSteps(ctx, doctor, drift, ok);

    const report = driftReportOf(drift);
    return {
      exitCode: ok ? 0 : 1,
      json: {
        doctor: [...doctor],
        drift:
          report === null
            ? null
            : {
                clean: report.clean,
                changes: report.changes.map((entry) => ({ ...entry })),
                missing: [...report.missing],
                reclaimPending: report.reclaimPending,
              },
        // Why there is no verdict, in the payload as well as on screen: a CI
        // job reading `drift: null` cannot otherwise tell "not initialised"
        // from "the plan is broken", and those need different responses.
        driftStatus: drift.kind,
        provenance,
        ok,
        // A returned exit-1 result owes an error document. It is the drift
        // gate's failure when there is one — that is the cause a machine
        // caller can act on — and otherwise a pointer to the failing rows,
        // which are in the same payload.
        ...(ok ? {} : { error: checkFailureDoc(doctor, drift) }),
      },
    };
  },
};

/** The `error` document for a non-green run: the diagnosable cause, named. */
function checkFailureDoc(doctor: readonly DoctorCheck[], drift: DriftOutcome): FailureDoc {
  if (drift.kind === "failed") {
    return {
      code: drift.code,
      message: "check could not evaluate drift: the sync plan failed to build",
      why: drift.reason,
      next: `fix the cause named in \`why\`, then re-run ${packageCommand("check")}`,
    };
  }
  const failing = doctor.filter((row) => row.status === "fail");
  const first = failing[0];
  if (first !== undefined) {
    return {
      code: "VALIDATION_ERROR",
      message: `check failed ${failing.length} doctor probe(s): ${failing.map((row) => row.id).join(", ")}`,
      why: first.detail,
      next: "each failing row above states its own remedy",
    };
  }
  // Same branch as the human next-steps, for the same reason: a JSON consumer
  // that automates `next` would have re-run a sync that refuses the plan.
  const collisions = drift.kind === "evaluated" ? collidingPaths(drift.report) : [];
  return {
    code: "INTEGRITY_ERROR",
    message: "check found drift between the repository and what a sync would write",
    why: "one or more generated files differ from the engine's output, are missing, or are queued for reclaim",
    next:
      collisions.length > 0
        ? collisionStep(collisions)
        : `${packageCommand("sync")} — regenerate the files that drifted`,
  };
}
