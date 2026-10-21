import { accessSync, constants as fsConstants, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, delimiter, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import semver from "semver";
import type { App, EngineRegistry } from "../../index.ts";
import { CLASS_FILE, parseClassFile } from "../../change/classify.ts";
import { readCharterTemplate } from "../../content/charter.ts";
import { slugOf } from "../../content/catalog.ts";
import { discoverUserContent } from "../../content/userContent.ts";
import { pinnedCliInstall } from "../../adapters/copilot.ts";
import { AGENTS_MD_FILE, CURSOR_CLOUD_BLOCK_HEADING } from "../../emit/agentsMd.ts";
import { renderInvariantsVersion, type CliCallContext } from "../../emit/substitution.ts";
import { readGates } from "../../manifest/manifest.ts";
import { OWNED_PATHS } from "../../manifest/ownedPaths.ts";
import {
  extractManagedBlock,
  hasManagedBlock,
  splitAtManagedBlock,
} from "../../merge/managedBlocks.ts";
import { lookupCatalogEntry, type CatalogEntry } from "../../pack/curated.ts";
import { MOVED_CORE_SKILLS, movedRenderingAt } from "../../pack/moved.ts";
import { ORG_POLICY_REL_PATH } from "../../pack/orgPolicy.ts";
import {
  discoverInstalledPacksWithPolicy,
  withoutPolicyWarningPrint,
} from "../../pack/projection.ts";
import {
  describeRetiredPack,
  lookupRetiredPack,
  RETIRED_PACKS,
  retiredSuccessorPacks,
  type RetiredPack,
} from "../../pack/retired.ts";
import { UNICODE_TAG_CHARS, UNPRINTABLE_CHARS } from "../../runs/layout.ts";
import { findPackageRoot } from "../../shared/paths.ts";
import { gitProgramFor } from "../../shared/programPath.ts";
import {
  describePackIntegrityFinding,
  packReinstallSteps,
  type PackIntegrityFinding,
  verifyInstalledPacks,
} from "../../pack/verifyInstalled.ts";
import type { PackArtifactReach, PackReach } from "../../types/content.ts";
import { MODEL_PRIORITY } from "../../roster/modelDefaults.ts";
import { listHoldsPin, MODEL_LADDER, pinsFor, resolveModelValue } from "../../roster/modelLadder.ts";
import { TOOLS, type Tool, VALID_TOOLS } from "../../types/core.ts";
import { EngineError, type ErrorCode } from "../../types/errors.ts";
import {
  isPackOwner,
  type LedgerEntry,
  MANIFEST_FILE,
  PACK_OWNER_PREFIX,
  type SetupManifest,
} from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import {
  CLIENT_LIST_TIMEOUT_MS,
  listClientModels,
  listerTreeRoot,
  resolveModelLists,
  withModelLists,
  type ListClientModelsOptions,
  type ModelListOutcome,
  type ModelLists,
} from "../engine/clientModels.ts";
import { getEmissionPlanner } from "../engine/emission.ts";
import { readWorkingTreeStatus } from "../engine/gitStatus.ts";
import { CliFailure, type FailureDoc } from "../kit/output.ts";
import { hasNpmChannel, npmRegistry, packageCommand, packageCommandAt, packageName } from "../kit/packageName.ts";
import { sanitizeLabel } from "../kit/prompts.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import type { Palette } from "../kit/terminal.ts";
import type { ReclaimActionEntry, ReclaimProof } from "../../merge/reclaim.ts";
import {
  CATALOG_TIERS,
  installedCopyOf,
  isFirstPartyRetiredCopy,
  readVerifiedReceipt,
  replaceSteps,
} from "./add.ts";
import { planSync, previewReclaim, type SyncPlanEntry } from "./sync/engine.ts";
import { provenanceFromManifest, type ProvenanceRollup } from "./sync/report.ts";

/**
 * `stamity check` — the doctor and the drift gate in one CI-usable verb.
 * The predecessor's `status` and `verify` both died into it.
 *
 * Three parts, one exit code:
 *
 * 1. **DOCTOR** — fifteen environment and state probes, each a
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
 * Second, the green close prints only when the run is actually green. It used
 * to print alongside exit 1 whenever every doctor row passed and the drift gate
 * had been swallowed, so a human reading the terminal and a CI job reading `$?`
 * reached opposite conclusions — and the human's was the wrong one. The closing
 * block is derived from the same `ok` the exit code is. And the close never
 * claims more than check did: it reads `setup green` and names the lint, type
 * check and test gates it did not run, because the old `all green — nothing to
 * do` was taken for a verified tree when no gate had run (REQ-FLOW-008).
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
  /**
   * Plan entries that are not `unchanged` — create, update, or collision —
   * and any the client would reject as the write leaves it (`rejected`, S19).
   */
  changes: SyncPlanEntry[];
  /** Repo-relative ledger paths with no file on disk, first appearance order. */
  missing: string[];
  /** Ledger rows queued for the reclaim sweep on the next sync. */
  reclaimPending: number;
  /**
   * What the next sync's reclaim sweep would do to each queued path, one entry
   * per path in the sweep's order (REQ-PLUGIN-045). `reclaimPending` stays the
   * count of queued rows; several rows may name one path.
   */
  reclaim: ReclaimPreview[];
}

/**
 * One path the next sync's reclaim sweep would act on, as `check` names it.
 *
 * `action` reads the sweep's disposition in the operator's words: `delete`,
 * `strip` (the managed block goes, the rest stays) and `reduce` (a co-owned
 * document loses the engine's entries) are what consent would do; `keep` is a
 * file the sweep leaves because something in it is not the engine's; `refuse`
 * is a path no gate could prove the engine's, or one it will not touch; `gone`
 * is already absent. `proof` names what proved the claim on the three that act.
 */
interface ReclaimPreview {
  path: string;
  reason: ReclaimActionEntry["candidateReason"];
  action: "delete" | "strip" | "reduce" | "keep" | "refuse" | "gone";
  proof?: ReclaimProof;
  /** The sweep's own sentence on why, for the three that do not act. */
  why?: string;
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
 * `engines.node` from the package that ships this build, or `null` when it
 * cannot be read as a range. Read rather than duplicated as a constant: the
 * floor is declared in package.json, and a second copy here could disagree with
 * the one npm actually enforces at install time.
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
 * One interpreter version against one declared floor: the three answers the
 * comparison can give. Tri-state rather than a boolean because the row below
 * WARNS on an unparseable version and FAILS below the floor — two severities
 * and two sentences.
 *
 * `includePrerelease` is part of the judgment: semver excludes prereleases from
 * a plain range by default, so a Node nightly on a satisfying major would read
 * as below the floor — a false failure rather than a real one.
 */
function judgeNodeFloor(nodeVersion: string, range: string): "satisfies" | "below" | "unparseable" {
  const parsed = semver.valid(nodeVersion) ?? semver.coerce(nodeVersion)?.version ?? null;
  if (parsed === null) return "unparseable";
  return semver.satisfies(parsed, range, { includePrerelease: true }) ? "satisfies" : "below";
}

/**
 * The `node-version` DOCTOR ROW for a Node version against the package's
 * `engines.node` range: this function owns the severity and the sentence, and
 * the comparison is {@link judgeNodeFloor}'s.
 *
 * Pure and exported because it is the one probe whose failing branch cannot be
 * reached in-process: a suite runs on a Node that already satisfies the range,
 * so the below-floor case is only testable by injecting the version string.
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
  switch (judgeNodeFloor(nodeVersion, range)) {
    case "unparseable":
      return {
        id,
        status: "warn",
        detail: `Node reported the unparseable version ${nodeVersion}; expected a build in ${range}`,
      };
    case "satisfies":
      return { id, status: "pass", detail: `Node ${nodeVersion} satisfies ${range}` };
    default:
      return {
        id,
        status: "fail",
        detail:
          `Node ${nodeVersion} is below the required ${range} — install a Node in that range ` +
          `(or switch to one with your version manager), then re-run`,
      };
  }
}

/**
 * Git availability. A repository without git is legal — only `worktree`,
 * `gate`, `plan` and `run` need it — so absence is a warn that says what is
 * lost, never a failure.
 *
 * An absent git has words of its own. The engine takes git only from a `PATH`
 * entry that is a full path to a folder other than the one git runs in
 * (`../../shared/programPath.ts::gitProgramFor`), and it knows whether that
 * walk found one. Where it found none the row says so, says which entries it
 * takes git from, and states what the four verbs lose outright. That is the
 * cause whether no git is installed or the only git is behind an entry the
 * walk skips, which a git typed at a prompt would still find.
 *
 * Where a git was found and did not answer, the same warn covers two causes:
 * no repository, and a git that did not answer inside the probe's bound
 * (`readWorkingTreeStatus`). `gate` waits longer on git (`./gate.ts`) and
 * `worktree` bounds only its fetch (`../../worktree/git.ts`), so what they
 * lose is stated for a missing repository only, and the row says how to tell
 * the two apart: by a `.git` entry found by name. It names no git command
 * that looks for a repository (review/61), and no other git command either: a
 * git typed at a prompt is found by the shell's rules, not by the engine's
 * walk, so it answers for a program the engine may never start, and the row
 * says what the engine found where it once said to type `git --version`. This
 * text also prints where git itself refused a folder the engine's look passed,
 * a leftover `.git` git cannot open beside or below a folder with the layout
 * of a bare repository, and the read cannot tell that from the other causes:
 * git's refusal is a message translated by locale, and it is not read. Plain
 * git typed there opens that folder, so no row sends anyone to type it.
 *
 * A fourth cause has words of its own: the look the engine takes before it
 * starts git kept this folder from git, because it or a folder above it has the
 * layout of a bare repository (the status's `reason`). There the row names the
 * cause, says where to look by name, and says not to run git in that folder or
 * in any folder under it, the one the operator stands in included: git started
 * anywhere under it finds it as the look did (review/57). Both verbs take the
 * same look, so what they lose is stated outright. A flow is not kept from
 * that folder by it: both flows stop on the scan's reason, but only at the
 * gate call, and the git a flow's session and its sub-agents start before it
 * is not the engine's, so beside that stop the row says to start none there
 * until the folder is moved (review/72; the stop since 1.15.0, reattest/9). The folder is named as "this folder", since no row prints a
 * machine's layout.
 */
function checkGit(rootDir: string): DoctorCheck {
  const id = "git-available";
  const status = readWorkingTreeStatus(rootDir);
  if (!status.available && status.reason === "bare-layout") {
    return {
      id,
      status: "warn",
      detail:
        "git was not started here — this folder, or a folder above it, has the layout of a bare " +
        "repository (HEAD beside objects and refs, or beside commondir), met before any .git that " +
        "git stops at, so the engine did not hand it to git. Look at the entries of this folder " +
        "and of each folder above it by name to find that folder, and do not run git in it or in " +
        "any folder under it, this one included. " +
        "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, " +
        "and gate reads every change from it, " +
        "so here gate scan exits 1 saying git was not started, and on that reason " +
        "/st-work stops the run as BLOCKED_DEPENDENCY and /st-quick stops the batch. " +
        "That stop comes at the gate call, and the git a flow's session and its sub-agents start " +
        "before it is not set to refuse such a folder as the engine's is, so start no flow here " +
        "until that folder is moved off this path. " +
        "sync's dirty-tree warning simply stays silent while git does not answer.",
    };
  }
  // The read's own environment is the process's, less git's variables, so the
  // `PATH` walked here is the one the read walked, and the answer is the same.
  if (!status.available && gitProgramFor(rootDir, process.env) === null) {
    return {
      id,
      status: "warn",
      detail:
        "git did not answer here — the engine found no git to start. It takes git only from a PATH " +
        "entry that is a full path to a folder other than this one, and no such entry holds a git " +
        "binary: install git, or put the folder that holds it on PATH by its full path. " +
        "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, " +
        "and gate reads every change from it, " +
        "so here gate scan exits 1 and /st-quick and /st-work list " +
        "`secret scan: not run` under `Not done:`. " +
        "sync's dirty-tree warning simply stays silent while git does not answer.",
    };
  }
  if (!status.available) {
    return {
      id,
      status: "warn",
      detail:
        "git did not answer here — the engine found a git binary on PATH, so this directory is not a " +
        "repository, or git was only slow to answer this check. To tell which with no git " +
        "command: a .git entry in this folder or in a folder above it, found by name, shows " +
        "whether a repository is. " +
        "Four verbs need git: worktree refuses without it, plan and run exit 1 without it, " +
        "and gate reads every change from it, " +
        "so with no repository gate scan exits 1 and /st-quick and /st-work list " +
        "`secret scan: not run` under `Not done:`; where git was only slow, all four may still run. " +
        "sync's dirty-tree warning simply stays silent while git does not answer.",
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
  // Paths first, rows second: a file several clients share (`AGENTS.md`) has
  // one ledger row per client, so the row count named more files than the repo
  // holds, and read against init's file count the two numbers disagreed.
  const paths = new Set(manifest.ledger.map((row) => row.path)).size;
  return {
    id,
    status: "pass",
    detail:
      `${MANIFEST_DISPLAY} is valid — schema ${manifest.version}, tools ` +
      `${manifest.tools.join(", ")}, ${paths} managed path(s) (${manifest.ledger.length} ledger ` +
      `rows across ${manifest.tools.length} client(s))${skew}`,
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
 * The repository's class file (REQ-FLOW-061): the change classes and the
 * test-input map `gate classify` reads from a base commit. No row when the file
 * is absent, so a repository without one keeps its fifteen rows. This reads the
 * work tree's copy, the one the next pull request lands as a base: it passes
 * when the validator accepts it, and fails naming the first error, since a base
 * holding a refused copy has `gate classify` apply only its raising entries
 * (review/48) and give every change at least `product`.
 */
async function checkChangeClasses(rootDir: string): Promise<DoctorCheck | null> {
  const id = "change-classes";
  let text: string | null;
  try {
    text = await readIfPresent(join(rootDir, CLASS_FILE));
  } catch (cause) {
    return { id, status: "warn", detail: `could not be checked: ${messageOf(cause)}` };
  }
  if (text === null) return null;
  const parsed = parseClassFile(text);
  if (parsed.ok) {
    const globs = parsed.rules.reduce((sum, rule) => sum + rule.paths.length, 0);
    return {
      id,
      status: "pass",
      detail:
        `${CLASS_FILE} is valid: ${globs} glob(s) across ${parsed.rules.length} class(es), ` +
        `${parsed.testInputs.length} test-input entry(ies)`,
    };
  }
  const [first = "refused", ...rest] = parsed.errors;
  const more = rest.length === 0 ? "" : ` (and ${rest.length} more)`;
  return {
    id,
    status: "fail",
    // The error quotes the file's own bytes, so it is sanitised before it meets a terminal.
    detail:
      `${CLASS_FILE} is invalid: ${sanitizeLabel(first)}${more} — from a base holding this copy, gate classify ` +
      `applies only its product, public-contract and security-sensitive entries, no lowering entry, and gives ` +
      `every change at least product; fix the entry the error names`,
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
 * The `claude-hook-shell` DOCTOR ROW: can the anchored Claude hook commands
 * launch on this host at all?
 *
 * The Claude adapter renders every hook command on `${CLAUDE_PROJECT_DIR}`
 * and gives the core guard a POSIX fail-closed tail (`../../adapters/claude.ts`,
 * `PROJECT_DIR_VARIABLE` and `guardFailClosedTail`). Both hold under `sh`
 * and Git Bash, the two shells the client's hooks page names first. On a
 * Windows host with no Git Bash the client falls back to PowerShell, and there
 * the render cannot work: `${NAME}` is PowerShell's own variable syntax, so the
 * anchored path expands empty, and the tail's `||{…}` does not parse. The hook
 * then never launches, the client does not block, and nothing on the host says
 * so — a guard silently disarmed. The render cannot be fixed for both shells
 * (the adapter's comment beside the anchor says why), so the remedy is to SAY
 * IT where the operator looks: this row.
 *
 * Pure and exported for the reason `checkNodeVersion` is: the failing branch
 * cannot be reached in-process on a POSIX host, so the platform and the
 * environment are injected. The lookup mirrors the client's own resolution as
 * the vendor states it (troubleshoot-install page, "Claude Code on Windows
 * requires either Git for Windows (for bash) or PowerShell", read 2026-09-22),
 * in its order and no wider:
 *
 * 1. `CLAUDE_CODE_GIT_BASH_PATH`, honoured only when it names an existing FILE
 *    called `bash.exe`, `sh.exe`, `bash` or `sh`: "Claude Code accepts only a
 *    file named `bash.exe`, `sh.exe`, `bash`, or `sh`; with any other name,
 *    such as Git for Windows' `git-bash.exe` launcher, it ignores the variable
 *    and auto-detects Git Bash as if it were unset … A path that doesn't exist
 *    gets the same fallback". Two assumptions here are the row's own, not the
 *    page's: the value is trimmed of surrounding whitespace, and the name is
 *    compared without case, as Windows compares file names. An ignored
 *    variable is a note on whichever verdict follows, never a verdict of its
 *    own.
 * 2. "The default install locations `C:\Program Files\Git` and
 *    `C:\Program Files (x86)\Git`": `bin\bash.exe` under each, the roots read
 *    from `ProgramFiles` and `ProgramFiles(x86)` with the page's literals when
 *    a variable is unset.
 * 3. "The `git` on your `PATH`, using the `bin\bash.exe` from that Git
 *    installation": each PATH entry holding a `git.exe`, and `..\bin\bash.exe`
 *    from there. Git for Windows' installer puts `<Git>\cmd` on PATH by
 *    default, with `bin\bash.exe` a sibling of `cmd`, and the same probe reads
 *    `bin\bash.exe` itself when `<Git>\bin` is the entry. PATH is read by the
 *    first key matching `/^path$/i` (prove/261): Windows spells it `Path`, and
 *    while `process.env` answers case-insensitively there, a plain object
 *    copied from it does not; the two Program Files roots are read the same way.
 *
 * Every probe is a filesystem read, no spawn. A bare `bash.exe` on PATH is NOT
 * in the client's list and does not count — the row once took one, which gave
 * two false verdicts: a default Git for Windows install has `git.exe` on PATH
 * and no `bash.exe` there (a false FAIL), and MSYS2 or Cygwin put a bare
 * `bash.exe` with no `git.exe` beside it on PATH, which the client never finds
 * (a false PASS, on the exact host this row exists to report). WSL's
 * `%SystemRoot%\System32\bash.exe` (prove/251) is the same case and needs no
 * exclusion of its own. A `bin` entry holding BOTH `git.exe` and `bash.exe` —
 * Cygwin's `bin`, MSYS2's `usr\bin` with its git package — passes here as the
 * shell beside the git on PATH, because `..\bin\bash.exe` from a `bin` entry
 * is that entry's own `bash.exe`; whether the client resolves it the same way
 * is unmeasured. A bare `bash.exe` seen on PATH, and a `git.exe` with no
 * `bin\bash.exe` beside it, are each named in the fail text — the first as
 * not counting, the second as unresolved here — so the operator reads why.
 *
 * Two clauses of the page are not modelled. In step 3 the client "skips a
 * `git` that sits in the folder you launched Claude Code from, or below it in
 * a path that contains `node_modules` or a virtual-environment folder such as
 * `.venv` or `env`": the launch folder is a session fact this row cannot know,
 * so a `git.exe` in such a place counts here and may not there. And how the
 * client derives "that Git installation" from a `git` on PATH is unstated:
 * this row reads `..\bin\bash.exe` from the entry, so a shimmed git (Scoop's
 * `shims\git.exe`) or a relocated layout finds no shell here and may still be
 * resolved there. For both, the page's own remedy is the variable, which this
 * row honours first, and the fail text says so.
 *
 * `runDoctor` hands this row the HOST's `process.env`, not the app's runtime
 * env: the row asks whether a shell exists on the machine the doctor runs on,
 * the same kind of host fact `checkNodeVersion` reads off `process.versions`,
 * and a fixture that scopes the app's env to `{}` is not a host with no shell.
 * The environment is ALL it reads: a value set in `settings.json`'s `env`
 * block reaches the client, and not a shell that runs `stamity check` outside
 * a Claude session, and the fail text says exactly that.
 *
 * Fails only where every condition holds: `win32`, Claude targeted, and none
 * of the three places holds Git Bash. Everywhere else it passes with the note that says
 * which condition, or which place, released it, so the row reads the same on
 * every host and is never silently absent.
 */
export function checkClaudeHookShell(
  manifest: SetupManifest | null,
  host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
  },
): DoctorCheck {
  const id = "claude-hook-shell";
  if (host.platform !== "win32") {
    return {
      id,
      status: "pass",
      detail:
        "not a Windows host: the client hands hook commands to sh, where the anchored " +
        "commands parse (Git Bash is a Windows-only requirement)",
    };
  }
  const targeted = (manifest?.tools ?? []).includes("claude");
  if (!targeted) {
    return {
      id,
      status: "pass",
      detail: "claude is not a target tool, so no anchored hook row is emitted",
    };
  }
  // Keys matched by pattern, not by spelling: see the docblock on `Path`.
  const read = (pattern: RegExp): string | undefined => {
    const key = Object.keys(host.env).find((name) => pattern.test(name));
    return key === undefined ? undefined : host.env[key];
  };
  const pass = (where: string, note: string): DoctorCheck => ({
    id,
    status: "pass",
    detail: `Git Bash at ${where}: the anchored hook commands parse there${note}`,
  });

  // 1. The variable: a file by one of the four names, or ignored as the client ignores it.
  const configured = (host.env["CLAUDE_CODE_GIT_BASH_PATH"] ?? "").trim();
  let ignored = "";
  if (configured !== "") {
    const kind = entryKind(configured);
    const name = (configured.split(/[\\/]/).at(-1) ?? "").toLowerCase();
    if (kind === "file" && HOOK_SHELL_NAMES.has(name)) {
      return pass(`${configured}, named by CLAUDE_CODE_GIT_BASH_PATH`, "");
    }
    const why =
      kind === "absent" ? "does not exist"
      : kind === "unreadable" ? "cannot be read"
      : kind === "other" ? "is not a file"
      : "is not named bash.exe, sh.exe, bash or sh";
    ignored =
      ` (CLAUDE_CODE_GIT_BASH_PATH names ${configured}, which ${why}, so the client ignores it ` +
      "and looks on as if it were unset — as does this row)";
  }

  // 2. The default install locations.
  const programFiles = join(read(/^programfiles$/i) ?? "C:\\Program Files", "Git");
  const programFilesX86 = join(read(/^programfiles\(x86\)$/i) ?? "C:\\Program Files (x86)", "Git");
  for (const root of [programFiles, programFilesX86]) {
    const candidate = join(root, "bin", "bash.exe");
    if (existsSync(candidate)) return pass(`${candidate}, a default install location`, ignored);
  }

  // 3. The git on PATH, and the shell of its installation.
  const bare: string[] = [];
  const notes: string[] = [];
  for (const raw of (read(/^path$/i) ?? "").split(delimiter)) {
    // A quoted entry (`"C:\Program Files\Git\cmd"`) is legal on Windows, and libuv strips the
    // quote pair when it walks PATH to spawn, so the probe strips it too.
    const entry = raw.replace(/^"(.*)"$/, "$1");
    if (entry === "") continue;
    const git = join(entry, "git.exe");
    if (existsSync(git)) {
      const candidate = join(entry, "..", "bin", "bash.exe");
      if (existsSync(candidate)) return pass(`${candidate}, beside the git.exe on PATH at ${git}`, ignored);
      notes.push(
        `the git.exe on PATH at ${git}: this row found no bin\\bash.exe beside it (looked at ` +
          `${candidate}); a shimmed or relocated git may still be resolved by the client — set ` +
          "CLAUDE_CODE_GIT_BASH_PATH to be sure",
      );
    }
    const bash = join(entry, "bash.exe");
    if (existsSync(bash)) bare.push(bash);
  }
  if (bare.length > 0) {
    notes.unshift(
      `the client does not look for a bare bash.exe on PATH, so ${listed(bare)} ` +
        `${bare.length === 1 ? "does" : "do"} not count`,
    );
  }
  return {
    id,
    status: "fail",
    detail:
      "the anchored hook commands need Git Bash on Windows; without it the pre-tool-use guard " +
      "does not launch and the client does not block — the client falls back to PowerShell, " +
      "which reads ${CLAUDE_PROJECT_DIR} as its own variable and does not parse the guard's " +
      "fail-closed tail. Git Bash is in none of the three places the client looks, in its order: " +
      "CLAUDE_CODE_GIT_BASH_PATH naming a file called bash.exe, sh.exe, bash or sh; bin\\bash.exe " +
      `under the default install locations ${programFiles} and ${programFilesX86}; and ` +
      "bin\\bash.exe beside a git.exe on PATH. Install Git for Windows (Git Bash), or set " +
      "CLAUDE_CODE_GIT_BASH_PATH to its bin\\bash.exe in the environment — this row reads the " +
      "environment only, and a value in settings.json's env block reaches the client but not a " +
      "shell that runs stamity check outside a Claude session. Then re-run check." +
      `${ignored}${notes.map((note) => ` (${note})`).join("")}`,
  };
}

/** The file names the client accepts in `CLAUDE_CODE_GIT_BASH_PATH`, compared without case. */
const HOOK_SHELL_NAMES: ReadonlySet<string> = new Set(["bash.exe", "sh.exe", "bash", "sh"]);

/**
 * What a configured path names, without throwing: the row is not run through
 * `guarded`, and a path the process may not stat is a note, not a crash.
 */
function entryKind(path: string): "file" | "other" | "absent" | "unreadable" {
  try {
    const stat = statSync(path, { throwIfNoEntry: false });
    if (stat === undefined) return "absent";
    return stat.isFile() ? "file" : "other";
  } catch {
    return "unreadable";
  }
}

/** `a`, `a and b`, `a, b and c`. */
function listed(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
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
  await withReAddArgs(rootDir, manifest, report.findings);
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
 * Fill each finding's `reAdd` from its pack's install receipt, so the finding
 * line names the source the remedy's `add` re-installs from (review/59).
 *
 * This lives here rather than in `../../pack/verifyInstalled.ts` because it
 * reads the receipt and the curated catalog, both of which sit above that
 * module's layer; the integrity pass stays a pure re-hash and `check` passes
 * the source in as data. The rows read are the same ones that pass reads —
 * pack-owned rows carrying a recorded hash.
 */
async function withReAddArgs(
  rootDir: string,
  manifest: SetupManifest,
  findings: PackIntegrityFinding[],
): Promise<void> {
  const root = resolve(rootDir);
  const rows = manifest.ledger.filter(
    (entry) => isPackOwner(entry.adapter) && entry.contentHash !== undefined,
  );
  const packIds = [...new Set(findings.map((finding) => finding.packId))];
  const reAdds = new Map(
    await Promise.all(
      packIds.map(async (packId) => [packId, await readReAddArgs(root, packId, rows)] as const),
    ),
  );
  for (const finding of findings) finding.reAdd = reAdds.get(finding.packId) ?? null;
}

/**
 * `packId`'s re-add arguments, read from its install receipt — or `null` when
 * the receipt cannot be trusted to name them: absent, unreadable, not the
 * bytes its own ledger row recorded (an edited receipt could otherwise make the
 * remedy print any command), or missing the fields read here.
 */
async function readReAddArgs(
  root: string,
  packId: string,
  rows: readonly LedgerEntry[],
): Promise<string | null> {
  const read = await readVerifiedReceipt(root, packId, rows);
  return read.ok ? reAddArgsOf(packId, read.receipt) : null;
}

/**
 * The `add` arguments that re-install `packId` from the source `receipt`
 * records, or `null` when it names none this can spell.
 *
 * - A catalog-granted tier came through the curated catalog, whose receipt
 *   spec is the resolved bundled directory or package — so the step names the
 *   catalog id, which re-applies the pin. A catalog that cannot be read (a
 *   packs folder that fails its derivation) names no source: `null`, never a
 *   throw, because the caller is the integrity row and an exception there
 *   would turn its `fail` into `check`'s guarded `warn` (review/12).
 * - A local path or an npm package is re-added by the spec the operator typed;
 *   at the unsigned floor `add` refuses without `--allow-untrusted`, so the
 *   step carries it, as the original install had to.
 */
export function reAddArgsOf(packId: string, receipt: unknown): string | null {
  if (typeof receipt !== "object" || receipt === null) return null;
  const { source, trustTier } = receipt as { source?: unknown; trustTier?: unknown };
  if (typeof source !== "object" || source === null || typeof trustTier !== "string") return null;
  const { kind, spec } = source as { kind?: unknown; spec?: unknown };
  if (typeof kind !== "string" || typeof spec !== "string" || spec === "") return null;
  if (CATALOG_TIERS.has(trustTier) || kind === "catalog-pinned") {
    let entry: CatalogEntry | undefined;
    try {
      entry = lookupCatalogEntry(packId) ?? lookupCatalogEntry(spec);
    } catch {
      return null;
    }
    return entry === undefined ? null : shellWord(entry.id);
  }
  if (kind !== "local-path" && kind !== "npm-package") return null;
  return `${shellWord(spec)}${trustTier === "pinned-unsigned" ? " --allow-untrusted" : ""}`;
}

/**
 * `word` as one POSIX shell word: bare when it holds only characters no shell
 * reads specially, single-quoted otherwise, control characters dropped — the
 * receipt is repository data, and a printed remedy is pasted into a shell.
 */
function shellWord(word: string): string {
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const clean = word.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
  return /^[A-Za-z0-9@%+=:,./_-]+$/.test(clean) ? clean : `'${clean.replace(/'/g, "'\\''")}'`;
}

/**
 * Installed packs held against the catalog this release bundles and against
 * the retired-names map (REQ-PACK-003).
 *
 * Judged from content, never from the version: the receipt's file hashes,
 * read only when the receipt's bytes match its ledger row, rebuild the
 * integrity map the install verified, and its aggregate
 * (`computeAggregateContentSha`, `../../pack/trust.ts`) is compared with the
 * catalog pin.
 *
 * - `warn` — a catalog-tier copy of a catalog id whose content is not the
 *   bundled copy (the release moved it on), naming `add <id>`; and a
 *   first-party copy of a retired id (installed at a catalog tier, or whose
 *   content is one of the entry's `pins`, {@link isFirstPartyRetiredCopy}),
 *   naming where its parts went and the fix in `replaceSteps`' order:
 *   `clean --pack <id>`, each kept client copy deleted, `sync`,
 *   `add <successor>`, `sync`.
 * - `pass` — no pack installed, or every catalog-tier pack matching its pin.
 *   A pack from a path or npm is judged only when its content is one a
 *   retired release shipped, and a receipt that cannot be trusted skips the
 *   comparison with the reason named.
 *
 * The row never fails: a stale or retired copy still works as installed, and
 * `pack-integrity` is the row that fails on edited bytes, the receipt's too.
 */
export async function checkPackCatalog(
  rootDir: string,
  manifest: SetupManifest | null,
  retired: readonly RetiredPack[] = RETIRED_PACKS,
): Promise<DoctorCheck> {
  const id = "pack-catalog";
  if (manifest === null) {
    return { id, status: "pass", detail: "no readable manifest, so no installed pack to judge" };
  }
  const packIds = [
    ...new Set(
      manifest.ledger
        .filter((row) => isPackOwner(row.adapter))
        .map((row) => row.adapter.slice(PACK_OWNER_PREFIX.length)),
    ),
  ].toSorted();
  if (packIds.length === 0) {
    return { id, status: "pass", detail: "no installed pack is recorded in the ledger" };
  }
  const root = resolve(rootDir);
  const rows = manifest.ledger.filter(
    (entry) => isPackOwner(entry.adapter) && entry.contentHash !== undefined,
  );
  // Only an id the catalog or the retired map knows is judged, so only those
  // receipts are read.
  const known = packIds.map((packId) => {
    const entry = lookupCatalogEntry(packId);
    return { packId, entry, gone: entry === undefined ? lookupRetiredPack(packId, retired) : undefined };
  });
  const judged = await Promise.all(
    known
      .filter(({ entry, gone }) => entry !== undefined || gone !== undefined)
      .map(async ({ packId, entry, gone }) => ({
        packId,
        entry,
        gone,
        read: await readVerifiedReceipt(root, packId, rows),
      })),
  );
  const findings: string[] = [];
  const skipped: string[] = [];
  let matching = 0;
  let unjudged = known.length - judged.length;
  for (const { packId, entry, gone, read } of judged) {
    const label = sanitizeLabel(packId);
    const copy = read.ok ? installedCopyOf(packId, read.receipt) : null;
    if (copy === null) {
      skipped.push(`pack "${label}" (${read.ok ? "its receipt names no file hashes" : read.reason})`);
      continue;
    }
    if (entry !== undefined && copy.fromCatalog) {
      if (copy.aggregate === entry.pin.sha256.toLowerCase()) matching += 1;
      else {
        findings.push(
          `pack "${label}": its installed content is not the copy this release bundles — re-add to ` +
            `update: \`${packageCommand(`add ${shellWord(packId)}`)}\`.`,
        );
      }
    } else if (gone !== undefined && isFirstPartyRetiredCopy(gone, copy)) {
      // The repo's replace order (`add`'s `replaceSteps`), with each successor
      // pack as the re-add: a part moves under its own name, so a client copy
      // `clean --pack` keeps would collide with the successor's `sync`.
      const steps = replaceSteps(shellWord(packId), ...retiredSuccessorPacks(gone).map(shellWord));
      findings.push(`${describeRetiredPack(gone)} — fix in order: ${steps}.`);
    } else unjudged += 1;
  }
  const notCompared =
    skipped.length === 0 ? [] : [`Content not compared for ${skipped.join(", ")}.`];
  if (findings.length > 0) {
    return { id, status: "warn", detail: [...findings, ...notCompared].join(" ") };
  }
  const counts = [
    `${matching} catalog pack(s) match the copy this release bundles`,
    ...(unjudged === 0 ? [] : [`${unjudged} pack(s) from a path or npm not judged`]),
  ].join("; ");
  return { id, status: "pass", detail: [`${counts}.`, ...notCompared].join(" ") };
}

/**
 * Customizations and core copies of a skill that moved from the core corpus to
 * a pack (`../../pack/moved.ts`, REQ-PACK-009).
 *
 * Read from the override tree and the manifest's ledger directly, never from
 * the emission plan: an overlay of a moved skill is exactly what makes the plan
 * throw (`../../content/catalog.ts`), and this row has to answer then.
 *
 * - `fail` — an overlay (`SKILL.customize.yaml` or `.md`) of a moved id under
 *   `.stamity/overrides/skills/<id>/`: `sync` refuses it, pack or no pack.
 * - `warn` — a full override of a moved id, which no longer replaces a
 *   core skill and tracks no shipped copy, or, with the pack installed,
 *   collides with the pack's copy. The id is read as the content index reads
 *   it (`../../content/catalog.ts`, `buildItem`): the `SKILL.md`'s declared
 *   `id` wins over its folder name, so an override filed under another folder
 *   that declares a moved id counts, and one in the moved id's folder that
 *   declares another id does not; a `SKILL.md` with no frontmatter is not an
 *   artifact. And a client-owned ledger row of a
 *   moved id at the engine path the core wrote it to
 *   ({@link movedRenderingAt}), with no `pack:<pack>` row — with the pack
 *   installed, its own copies stand at those paths.
 * - `pass` — none of these.
 */
async function checkMovedSkills(
  rootDir: string,
  manifest: SetupManifest | null,
): Promise<DoctorCheck> {
  const id = "moved-skills";
  const root = resolve(rootDir);
  // Full overrides keyed by the id the index gives them. The discovery is
  // tolerant of a head that does not parse, so the row still answers when that
  // is what makes the plan throw.
  const overrideSkills = (await discoverUserContent(root)).flatMap((artifact) => {
    if (artifact.type !== "skill" || artifact.frontmatterText === undefined) return [];
    const declared = artifact.frontmatter.id;
    const folder = basename(dirname(artifact.filePath));
    const bareId = typeof declared === "string" && declared.trim() !== "" ? declared.trim() : slugOf(folder);
    // The folder name is the author's, so it is display-sanitized like a pack id.
    return [{ bareId, path: `${STATE_DIR}/overrides/skills/${sanitizeLabel(folder)}/SKILL.md` }];
  });
  const failures: string[] = [];
  const warnings: string[] = [];
  const addPack = (pack: string): string => `\`${packageCommand(`add ${shellWord(pack)}`)}\``;
  for (const skill of MOVED_CORE_SKILLS) {
    const moved = `skill "${skill.id}" moved from the core to the ${skill.pack} pack in ${skill.since}`;
    const dir = `${STATE_DIR}/overrides/skills/${skill.id}`;
    for (const half of ["SKILL.customize.yaml", "SKILL.customize.md"]) {
      if (!existsSync(join(root, ...dir.split("/"), half))) continue;
      failures.push(
        `overlay ${dir}/${half}: ${moved}, and overlays on pack skills are not applied, so sync ` +
          `refuses it. Fold the change into a full override under another id, or remove the file; ` +
          `to keep the shipped skill: ${addPack(skill.pack)}.`,
      );
    }
    const packInstalled =
      manifest?.ledger.some((row) => row.adapter === `${PACK_OWNER_PREFIX}${skill.pack}`) ?? false;
    for (const override of overrideSkills) {
      if (override.bareId !== skill.id) continue;
      // With the pack installed the override does not stand alone: it takes
      // the pack skill's id, and the planner refuses the collision.
      warnings.push(
        packInstalled
          ? `override ${override.path}: ${moved}, and the override collides with the installed pack's ` +
              `copy, so sync refuses it. Remove or rename it, or remove the pack ` +
              `(\`${packageCommand(`clean --pack ${shellWord(skill.pack)}`)}\`).`
          : `override ${override.path}: ${moved}, so the override now stands alone and tracks no shipped ` +
              `copy. Keep it, or remove it and run ${addPack(skill.pack)}.`,
      );
    }
    if (manifest === null || packInstalled) continue;
    const copies = [
      ...new Set(
        manifest.ledger
          .filter(
            (row) =>
              !isPackOwner(row.adapter) &&
              row.artifactType === "skill" &&
              row.artifactId === skill.id &&
              movedRenderingAt(skill, row.path) !== undefined,
          )
          .map((row) => row.path),
      ),
    ].toSorted();
    if (copies.length === 0) continue;
    warnings.push(
      `the ledger still records core copies of skill st-${skill.id}, which moved from the core to the ` +
        `${skill.pack} pack in ${skill.since}: ${copies.join(", ")}. \`${packageCommand("sync")}\` removes ` +
        `an unedited copy and names an edited one it keeps; to keep the skill: ${addPack(skill.pack)}.`,
    );
  }
  if (failures.length > 0) return { id, status: "fail", detail: [...failures, ...warnings].join(" ") };
  if (warnings.length > 0) return { id, status: "warn", detail: warnings.join(" ") };
  return { id, status: "pass", detail: "no override, overlay or core copy of a skill that moved to a pack" };
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

/**
 * Installed packs, judged by whether what they ship reaches a selected client
 * (REQ-PLUGIN-016).
 *
 * A pack can install, sync green, and do nothing: every artifact's own
 * `tools:` list names only clients this repository does not select, or its
 * one delivery is an MCP server nobody selected, or the organisation's trust
 * policy denies it. The judgment is the emission plan's own
 * (`EmissionPlan.packReach`, `../../emit/planner.ts`), read rather than
 * restated here, so this row and what `sync` writes cannot disagree about
 * which client an artifact reaches.
 *
 * - `fail` — an installed pack none of whose artifacts reaches any selected
 *   client and that supplies no unselected MCP server, named with why and
 *   with its remedies.
 * - `warn` — a pack whose only remaining delivery is an MCP server nobody has
 *   selected yet, named with `config mcp add <id>`; a pack the organisation's
 *   trust policy denies, which is installed and projects nothing; and a pack
 *   that ships nothing deliverable (every hook row rejected — `sync` names
 *   why), which is inert.
 * - `pass` — no pack is installed, or no pack is in any state above. The line
 *   counts the artifacts that reach a client and names any that reach none —
 *   an artifact whose `tools:` list names no selected client, a server not
 *   selected — in a pack that reaches elsewhere.
 * - `warn` "not evaluated" — the plan could not be built. The drift gate fails
 *   on the same cause and prints it whole, so this row does not fail twice.
 *
 * Every id a pack supplies goes through `sanitizeLabel` before it is printed:
 * a frontmatter `id:` can carry an escape sequence (a YAML double-quoted `\e`),
 * which would otherwise rewrite the operator's terminal or a CI log.
 *
 * Bounded like `pack-integrity`: a ledger with no pack row answers from the
 * ledger alone and plans nothing. With a pack installed it runs one emission
 * plan of its own beside the drift gate's (`planSync` returns the rows, not
 * the plan's reach).
 */
async function checkPackReach(
  rootDir: string,
  manifest: SetupManifest | null,
  engineVersion: string,
): Promise<DoctorCheck> {
  const id = "pack-reach";
  if (manifest === null) {
    return { id, status: "pass", detail: "no readable manifest, so no installed pack to judge" };
  }
  if (!manifest.ledger.some((row) => isPackOwner(row.adapter))) {
    return { id, status: "pass", detail: "no installed pack is recorded in the ledger" };
  }
  let reach: readonly PackReach[];
  let denied: readonly { id: string; matchedRule?: string }[] = [];
  try {
    // The drift gate's plan, in the same run, prints any policy-denied pack;
    // this second plan would print each denial again.
    const plan = await withoutPolicyWarningPrint(() =>
      getEmissionPlanner().planWithWarnings({
        rootDir,
        manifest,
        engineVersion,
        facts: { monorepoPackages: [] },
      }),
    );
    reach = plan.packReach ?? [];
    // The plan leaves out a pack the organisation's policy denies (it prints
    // the denial and projects nothing), so a ledger pack missing from the
    // reach is asked about by name rather than passing as "none resolved".
    const resolved = new Set(reach.map((pack) => pack.packId));
    const missing = manifest.ledger.some(
      (row) => isPackOwner(row.adapter) && !resolved.has(row.adapter.slice(PACK_OWNER_PREFIX.length)),
    );
    if (missing) denied = (await discoverInstalledPacksWithPolicy(rootDir, manifest)).denied;
  } catch (cause) {
    // The cause can quote a pack-supplied id, so it is flattened like the rest.
    const reason = sanitizeLabel(messageOf(cause).split("\n")[0] ?? "");
    return {
      id,
      status: "warn",
      detail: `not evaluated: the emission plan could not be built (${reason}) — the drift gate below reports the cause in full`,
    };
  }

  // A pack that reaches no client fails — unless a server it supplies is only
  // waiting on `config mcp add`, an operator's opt-in rather than a defect, which
  // warns with that command. A pack with nothing deliverable (every hook row it
  // ships rejected, which sync names) has no artifact to judge, so it warns as
  // inert rather than failing.
  const silent = reach.filter(
    (pack) => pack.artifacts.length > 0 && !pack.artifacts.some(reachesAClient),
  );
  const failing = silent.filter((pack) => !pack.artifacts.some(isUnselected));
  const awaiting = silent.filter((pack) => pack.artifacts.some(isUnselected));
  const reaching = reach.filter((pack) => pack.artifacts.some(reachesAClient));
  // In a pack that reaches elsewhere, an artifact that reaches no client for a
  // reason of its own — its `tools:` list, a server not selected — is named, so
  // no line claims it reaches.
  const unreached = reaching.flatMap((pack) =>
    pack.artifacts
      .filter((artifact) => !reachesAClient(artifact))
      .map((artifact) => `pack "${sanitizeLabel(pack.packId)}": ${describeUnreached(artifact)}`),
  );
  const inert = reach
    .filter((pack) => pack.artifacts.length === 0)
    .map(
      (pack) =>
        `pack "${sanitizeLabel(pack.packId)}" ships nothing a client loads (no skill, agent, rule, command, ` +
        `accepted hook or MCP server)`,
    );
  const warnings = [
    ...denied.map(describeDeniedPack),
    ...awaiting.map(describeAwaitingPack),
    ...inert,
  ];
  // Plain newlines: the renderer indents each continuation line under the
  // detail column, so `--json` carries no layout whitespace.
  const separator = "\n";
  if (failing.length > 0) {
    return {
      id,
      status: "fail",
      detail: [
        ...failing.map((pack) => describeSilentPack(pack, manifest.tools)),
        ...warnings,
        ...unreached,
      ].join(separator),
    };
  }
  if (warnings.length > 0) {
    return { id, status: "warn", detail: [...warnings, ...unreached].join(separator) };
  }
  if (reaching.length === 0) {
    return { id, status: "pass", detail: "no installed pack resolved for this plan" };
  }
  const total = reaching.reduce((sum, pack) => sum + pack.artifacts.length, 0);
  const delivered = reaching.reduce(
    (sum, pack) => sum + pack.artifacts.filter(reachesAClient).length,
    0,
  );
  const counts =
    delivered === total
      ? `${reaching.length} installed pack(s), ${total} artifact(s), each reaching a selected client`
      : `${reaching.length} installed pack(s), ${delivered} of ${total} artifact(s) reaching a ` +
        `selected client`;
  return { id, status: "pass", detail: [counts, ...unreached].join("; ") };
}

function reachesAClient(artifact: PackArtifactReach): boolean {
  return artifact.reachedBy.length > 0;
}

/** A pack-supplied MCP server `manifest.mcp.servers` does not select. */
function isUnselected(artifact: PackArtifactReach): boolean {
  return artifact.dropped.some((drop) => drop.reason === "not selected");
}

/** Why one artifact reaches no client: its selection, or its own `tools:` list. */
function describeUnreached(artifact: PackArtifactReach): string {
  const id = sanitizeLabel(artifact.id);
  const name = `${artifact.kind} ${id}`;
  if (isUnselected(artifact)) {
    return `${name} — not selected; ${packageCommand(`config mcp add ${id}`)} selects it`;
  }
  return `${name} — its tools: list names only ${declaredToolsOf(artifact).join(", ")}`;
}

/** The clients an artifact's own `tools:` list names, when none of them is selected. */
function declaredToolsOf(artifact: PackArtifactReach): Tool[] {
  return artifact.dropped.flatMap((drop) =>
    drop.reason === "declares no selected client" ? drop.declared : [],
  );
}

/**
 * A pack that reaches no selected client, with only remedies that run: remove
 * it, or — when an artifact's own `tools:` list names a client — add that
 * client.
 */
function describeSilentPack(pack: PackReach, selected: readonly Tool[]): string {
  const packId = sanitizeLabel(pack.packId);
  const why = pack.artifacts.map(describeUnreached).join("; ");
  const declared = new Set(pack.artifacts.flatMap(declaredToolsOf));
  const widened = TOOLS.filter((tool) => selected.includes(tool) || declared.has(tool));
  const addClient =
    declared.size > 0
      ? `, or add a client its tools: list names with ` +
        `${packageCommand(`config set tools ${widened.join(",")}`)}, then ${packageCommand("sync")}`
      : "";
  return (
    `pack "${packId}" reaches no selected client: ${why}. Remove it with ` +
    `${packageCommand(`clean --pack ${packId}`)}${addClient}`
  );
}

/** A pack the organisation's trust policy denies: installed, and projected nowhere. */
function describeDeniedPack(pack: { id: string; matchedRule?: string }): string {
  const id = sanitizeLabel(pack.id);
  const rule =
    pack.matchedRule === undefined
      ? ""
      : ` (matched rule: ${sanitizeLabel(JSON.stringify(pack.matchedRule))})`;
  return (
    `pack "${id}" is denied by the organisation's trust policy${rule}, so none of its content ` +
    `reaches a client. Remove it with ${packageCommand(`clean --pack ${id}`)}, or change ` +
    ORG_POLICY_REL_PATH
  );
}

/** A pack whose only remaining delivery is a server nobody selected yet. */
function describeAwaitingPack(pack: PackReach): string {
  const why = pack.artifacts.map(describeUnreached).join("; ");
  return (
    `pack "${sanitizeLabel(pack.packId)}" reaches no selected client until a server it supplies is ` +
    `selected: ${why}. Or remove it with ${packageCommand(`clean --pack ${sanitizeLabel(pack.packId)}`)}`
  );
}


// ── Model pins ─────────────────────────────────────────────────────────────

/** The client lister's shape (`../engine/clientModels.ts::listClientModels`), the seam a test turns. */
export type ModelLister = (
  tool: Tool,
  env: NodeJS.ProcessEnv,
  cwd: string,
  options?: ListClientModelsOptions,
) => Promise<ModelListOutcome>;

/**
 * A model value without its bracket options (`<id>[effort=high]` → `<id>`): the
 * id `listHoldsPin` looks up, printed as it is read. The value is trimmed and
 * the id before `[` is not, so a pin `<id> [effort=high]` prints with the space
 * the lookup carries rather than as an id the list visibly holds.
 */
function modelIdOf(value: string): string {
  const trimmed = value.trim();
  const bracket = trimmed.indexOf("[");
  return bracket === -1 ? trimmed : trimmed.slice(0, bracket);
}

/** A model id as the row prints it, or `none` where the class resolves no model. */
function quotedModel(id: string): string {
  return id === "" ? "none" : `"${sanitizeLabel(id)}"`;
}

/** Why one client has nothing to compare with, after its live read came to `outcome`. */
function unverifiedReason(tool: Tool, outcome: ModelListOutcome | null): string {
  if (outcome === null) return "client probe off (STAMITY_NO_CLIENT_PROBE=1)";
  switch (outcome.kind) {
    case "timeout":
      return `the ${tool} CLI did not answer within ${CLIENT_LIST_TIMEOUT_MS / 1000} s`;
    case "unreadable":
      return sanitizeLabel(outcome.message);
    default:
      return `no ${tool} CLI on PATH`;
  }
}

/**
 * Clients whose CLI prints a broader list than the one a sub-agent call is
 * checked against (ledger row 2026-10-14_cli-native/review/144). Cursor's
 * `agent models` prints every model the account offers, while a `Task` call's
 * model is checked against a narrower list, seen in one live run to change
 * with the parent agent's model, that no command prints, so a pin the printed
 * list holds can still be refused: the row calls such a pin unverified, never
 * "on the list". The value is the client's name as the row's reason prints it.
 */
const NARROWER_SUBAGENT_LIST: ReadonlyMap<Tool, string> = new Map<Tool, string>([["cursor", "Cursor"]]);

/** One client's part of the row: the models its list lacks, or the line that says how it went. */
interface ClientModelVerdict {
  readonly warnings: readonly string[];
  readonly note: string;
  /** Whether `note` says the client could not be verified; such a note is kept beside warnings. */
  readonly unverified: boolean;
}

/**
 * One listing client's pinned and emitted models against the list `listed`
 * (live) or the one the last `sync` saved. The emitted model is the one
 * emission resolves (`resolveModelValue` with the pick) from the list the
 * committed files give (`emittedFrom`) first, else from the saved list
 * (review/116): a model a teammate's sync committed that this account's list
 * lacks warns, and so does a saved list the account has since moved past.
 *
 * Codex is read live only when no list was saved, and then from its bundled
 * catalogue (review/136): `sync` saves the list Codex resolves normally, which
 * the bundled one can lag, so a saved list is always the reference there. A
 * live list is the catalogue `sync` reads only for Cursor and Copilot; there,
 * a class whose model `sync` would resolve differently from that live list
 * than the files carry — resolved from the saved list, or with none where no
 * list was saved — warns too (review/135), unless the class already warned.
 * On Cursor no list moves a model, since only a pin is written there (ledger
 * row 2026-10-14_cli-native/qa/1), so its rows compare pins alone, and a pin
 * the printed list holds is reported unverified (`NARROWER_SUBAGENT_LIST`).
 */
function verifyClientModels(
  tool: Tool,
  models: SetupManifest["models"],
  live: ModelListOutcome | null,
  emittedFrom: readonly string[] | undefined,
): ClientModelVerdict {
  const saved = models?.listed?.[tool]?.ids;
  const reference =
    live?.kind === "listed"
      ? { ids: live.ids, label: tool === "codex" ? "read live from its bundled catalogue; no list saved" : "read live" }
      : saved === undefined
        ? null
        : { ids: saved, label: "saved by the last sync" };
  if (reference === null) {
    return { warnings: [], note: `${tool}: unverified — ${unverifiedReason(tool, live)} and no saved list`, unverified: true };
  }

  const pins = pinsFor(models, tool);
  const efforts = models?.effort ?? {};
  // The files' own pick first: the list their model map gives (REQ-LADDER-009),
  // whoever's sync committed them; with none, the saved list's (review/116).
  const filesList = emittedFrom ?? saved;
  const pick = filesList === undefined ? {} : { listed: filesList };
  // The list a `sync` now would read, where the live read is that list: never
  // Codex's bundled read.
  const syncReads = live?.kind === "listed" && tool !== "codex" ? live.ids : undefined;
  const filesFrom =
    emittedFrom !== undefined
      ? saved === undefined
        ? "the pick already emitted, with no saved list"
        : "the pick already emitted"
      : saved === undefined
        ? "the pick made with no saved list"
        : "the pick from the list the last sync saved";
  const warnings: string[] = [];
  // Pins the printed list holds on a client whose sub-agents take a narrower one.
  const narrower = NARROWER_SUBAGENT_LIST.get(tool);
  const held: string[] = [];
  let compared = 0;
  for (const { modelClass } of MODEL_LADDER) {
    const pinValue = pins[modelClass] ?? "";
    const pinned = modelIdOf(pinValue);
    const emittedValue = resolveModelValue(modelClass, tool, pins, efforts, pick);
    const emitted = emittedValue === undefined ? "" : modelIdOf(emittedValue);
    const resyncedValue =
      syncReads === undefined ? emittedValue : resolveModelValue(modelClass, tool, pins, efforts, { listed: syncReads });
    const resynced = resyncedValue === undefined ? "" : modelIdOf(resyncedValue);
    // A class with no model now and none after a sync has nothing to compare.
    if (pinned === "" && emitted === "" && resynced === "") continue;
    compared += 1;
    const where = `${tool}'s list (${reference.label})`;
    const before = warnings.length;
    // The resolver's own test (`listHoldsPin`), so the row warns exactly where emission re-picks.
    if (pinned !== "" && !listHoldsPin(reference.ids, pinValue)) {
      warnings.push(
        `${tool} ${modelClass}: the pinned model "${sanitizeLabel(pinned)}" is not on ${where}; pin a listed one with ` +
          packageCommand(`config set model.${modelClass}.${tool} <id>`),
      );
    } else if (pinned !== "" && narrower !== undefined) {
      held.push(`${modelClass} "${sanitizeLabel(pinned)}"`);
    }
    if (emittedValue !== undefined && emitted !== "" && emitted !== pinned && !listHoldsPin(reference.ids, emittedValue)) {
      warnings.push(
        `${tool} ${modelClass}: the emitted model "${sanitizeLabel(emitted)}" is not on ${where}; ` +
          `${packageCommand("sync")} reads the list again and re-picks`,
      );
    }
    if (warnings.length === before && resynced !== emitted) {
      warnings.push(
        `${tool} ${modelClass}: ${packageCommand("sync")} would change the emitted model from ${quotedModel(emitted)} ` +
          `to ${quotedModel(resynced)}; the files carry ${filesFrom}, and ${tool}'s list (read live) resolves another`,
      );
    }
  }
  if (narrower !== undefined && held.length > 0) {
    return {
      warnings,
      note:
        `${tool}: unverified — the pinned model(s) ${held.join(", ")} are on ${tool}'s list (${reference.label}), ` +
        `but ${narrower} checks a sub-agent's model against a narrower list that no command prints`,
      unverified: true,
    };
  }
  const note =
    compared === 0
      ? `${tool}: no model pinned or emitted to compare (${reference.label})`
      : `${tool}: ${compared} class(es), each pinned or emitted model on the list (${reference.label})`;
  return { warnings, note, unverified: false };
}

/**
 * Model pins, verified against the account's own model list (REQ-LADDER-008).
 *
 * For each selected client whose CLI can list models (Cursor, Copilot, Codex;
 * Claude Code runs on its family aliases), every class's pinned model and the
 * model emission writes are compared with the list the client's CLI prints now
 * or, where the CLI is absent, slow or unreadable, with the list the last
 * `sync` saved in the git-ignored cache (REQ-LADDER-009), which `manifest`
 * carries in memory under `models.listed`. A checkout with no cached list, a
 * fresh clone among them, reads as unverified. The emitted model is worked
 * out from `emitted`, the lists the committed files give, ahead of the saved
 * list (review/116). Codex is the exception: its saved list,
 * whenever one exists, is the reference, and only without one is Codex asked
 * for its bundled catalogue, so the read makes no network call.
 * `STAMITY_NO_CLIENT_PROBE=1` starts no client and reads the saved list only.
 * A model the list lacks warns, naming the client, the class and the model,
 * with the remedy: pin a listed id, or `sync` to re-read the list and re-pick.
 * A Copilot class whose model `sync` would change, read live, warns naming
 * both models; Cursor writes only pins, which no list changes, and a Cursor
 * pin its printed list holds is unverified, since Cursor checks a sub-agent's
 * model against a narrower list that no command prints.
 *
 * Never `fail`: the list is the account's, outside anything this repository
 * can change, and a CI gate on it would fail on a vendor's model retirement.
 * With nothing to compare it passes, saying "unverified" and why.
 *
 * `env` is the app's runtime environment: it holds the `PATH` the clients are
 * found on and the switch. Every id a pin or a list carries goes through
 * `sanitizeLabel` before it is printed.
 */
export async function checkModelPins(
  manifest: SetupManifest | null,
  env: NodeJS.ProcessEnv,
  lister: ModelLister,
  cwd: string,
  emitted: ModelLists = {},
): Promise<DoctorCheck> {
  const id = "model-pins";
  if (manifest === null) {
    return { id, status: "pass", detail: "no readable manifest, so no model pins to verify" };
  }
  const clients = TOOLS.filter((tool) => manifest.tools.includes(tool) && Object.hasOwn(MODEL_PRIORITY, tool));
  if (clients.length === 0) {
    return { id, status: "pass", detail: "no selected client lists its models (claude runs on its family aliases)" };
  }
  const probeOff = env["STAMITY_NO_CLIENT_PROBE"] === "1";
  // Codex with a saved list is never started: that list came from the catalogue
  // `sync` reads, and the bundled one check may read offline can lag it (review/136).
  const savedCodexList = manifest.models?.listed?.codex !== undefined;
  const live = await Promise.all(
    clients.map((tool) =>
      probeOff || (tool === "codex" && savedCodexList)
        ? Promise.resolve(null)
        : lister(tool, env, cwd, { codexBundled: true }),
    ),
  );
  const verdicts = clients.map((tool, index) =>
    verifyClientModels(tool, manifest.models, live[index] ?? null, emitted[tool]?.ids),
  );
  const warnings = verdicts.flatMap((verdict) => verdict.warnings);
  if (warnings.length > 0) {
    // Plain newlines: the renderer indents each continuation line under the
    // detail column, so `--json` carries no layout whitespace.
    const unverified = verdicts.filter((verdict) => verdict.unverified).map((verdict) => verdict.note);
    return { id, status: "warn", detail: [...warnings, ...unverified].join("\n") };
  }
  return { id, status: "pass", detail: verdicts.map((verdict) => verdict.note).join("; ") };
}

/**
 * The `model-pins` row for the setup at `rootDir`: the account's lists read
 * from the git-ignored cache (and a 1.15.0 manifest's `models.listed`), never
 * from the committed manifest alone (REQ-LADDER-009). A cache that is there
 * but unreadable warns, naming it, and the row still never fails.
 */
async function modelPinsRow(rootDir: string, manifest: SetupManifest | null, env: NodeJS.ProcessEnv): Promise<DoctorCheck> {
  if (manifest === null) return checkModelPins(null, env, listClientModels, rootDir);
  const lists = await resolveModelLists(rootDir, manifest);
  const row = await checkModelPins(
    withModelLists(manifest, lists.kept),
    env,
    listClientModels,
    await listerTreeRoot(rootDir),
    lists.emitted,
  );
  if (lists.problem === null) return row;
  return { id: row.id, status: "warn", detail: `${lists.problem}\n${row.detail}` };
}

/**
 * The `cloud-install` row (REQ-FLOW-111), printed only with Cursor selected: the
 * lines a Cursor cloud environment's install step needs, for a person to set in
 * Cursor's saved environment. No `.cursor/environment.json` is written — a
 * repository file overrides every saved environment — so this row is where the
 * lines live. They pin the version the setup was generated with
 * (`generatedBy`), the one the committed hooks and bodies call, through
 * {@link pinnedCliInstall}, the line Copilot's setup workflow runs; a package
 * with no npm channel gets no registry line. The row informs and never fails: a
 * local session has no install step to judge. It warns, its first line ahead of
 * the install lines, when the root `AGENTS.md` is recorded as `skip`: sync then
 * leaves that file alone, so Cursor's cloud block (REQ-FLOW-114) is not in the
 * file a Cursor cloud agent reads, and only the run that recorded it said so.
 */
export function checkCloudInstall(
  manifest: SetupManifest | null,
  cli: Omit<CliCallContext, "version">,
  nodeRange: string | null,
): DoctorCheck | null {
  const id = "cloud-install";
  if (manifest === null || !manifest.tools.includes("cursor")) return null;
  const install = pinnedCliInstall({ ...cli, version: manifest.generatedBy });
  const needs =
    `a Cursor cloud environment needs ${nodeRange === null ? "Node" : `Node ${nodeRange}`} and the pinned CLI, ` +
    "or the flows' gate scan and ledger status stop";
  const written = "these lines (no .cursor/environment.json is written)";
  const skipped = (manifest.importChoice ?? []).some(
    (decision) => decision.path === AGENTS_MD_FILE && decision.mode === "skip",
  );
  return {
    id,
    status: skipped ? "warn" : "pass",
    detail: [
      ...(skipped
        ? [
            `the root ${AGENTS_MD_FILE} is recorded as "skip" in ${MANIFEST_DISPLAY}, so sync leaves it alone and ` +
              `a Cursor cloud agent reads it without its "${CURSOR_CLOUD_BLOCK_HEADING.replace(/^#+ /, "")}" ` +
              `block; record "supplement" for ${AGENTS_MD_FILE} there to keep your text and carry the block, ` +
              "or copy the section in by hand",
          ]
        : []),
      install === null
        ? `${needs}; this package has no npm channel, so its saved environment's install step installs ` +
          `the copy your fork distributes and runs ${written}:`
        : `${needs}; its saved environment's install step runs ${written}:`,
      "node --version",
      ...(install === null ? [] : [install]),
    ].join("\n"),
  };
}

/** This installation's call identity, as every remedy here renders it ({@link packageCommand}). */
function ownCliCall(): Omit<CliCallContext, "version"> {
  const registry = npmRegistry();
  return { packageName: packageName(), npmChannel: hasNpmChannel(), ...(registry === null ? {} : { registry }) };
}

/**
 * Every doctor probe, in report order.
 *
 * The manifest is read once, up front, because ten probes are conditioned on
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
    packReach,
    packCatalog,
    movedSkills,
    modelPins,
    changeClasses,
    invariants,
  ] = await Promise.all([
    requiredNodeRange(),
    guarded("learnings", () => checkLearnings(rootDir, engine, manifest)),
    guarded("tmp-hygiene", () => checkTmpHygiene(rootDir, engine)),
    guarded("env-mcp", () => checkEnvMcp(rootDir, engine, manifest)),
    guarded("preserved-duplicate", () => checkPreservedDuplicate(rootDir, manifest)),
    guarded("pack-integrity", () => checkPackIntegrity(rootDir, manifest)),
    guarded("pack-reach", () => checkPackReach(rootDir, manifest, app.version)),
    guarded("pack-catalog", () =>
      checkPackCatalog(rootDir, manifest, engine.pack.retired.RETIRED_PACKS),
    ),
    guarded("moved-skills", () => checkMovedSkills(rootDir, manifest)),
    guarded("model-pins", async () => modelPinsRow(rootDir, manifest, app.runtime.env)),
    checkChangeClasses(rootDir),
    guarded("invariants", checkInvariants),
  ]);
  // A call the shared renderer refuses (an unrunnable own name) warns as a
  // probe that could not run, never takes the report down.
  let cloudInstall: DoctorCheck | null;
  try {
    cloudInstall = checkCloudInstall(manifest, ownCliCall(), range);
  } catch (cause) {
    cloudInstall = { id: "cloud-install", status: "warn", detail: `could not be checked: ${messageOf(cause)}` };
  }

  return [
    checkNodeVersion(process.versions.node, range),
    checkGit(rootDir),
    checkManifest(state, app),
    checkStateDirs(rootDir),
    learnings,
    tmpHygiene,
    envMcp,
    checkToolTraces(manifest),
    // Beside `tool-traces` because both answer about the targeted tools' emitted
    // rows; this one asks whether the Claude rows can LAUNCH on this host.
    // The HOST's env, deliberately: see the row's own comment.
    checkClaudeHookShell(manifest, { platform: process.platform, env: process.env }),
    preservedDuplicate,
    packIntegrity,
    // What an installed pack ships that no selected client receives.
    packReach,
    // Whether an installed pack is a retired one, or a catalog pack this
    // release bundles a different copy of; it reads the same receipts.
    packCatalog,
    // Whether a skill that moved from the core to a pack is still overlaid,
    // overridden or recorded as a core copy here; read without the plan.
    movedSkills,
    // Whether each client's pinned and emitted models are on the account's own
    // list; it answers about this repository's pins, so it sits with the
    // repository rows.
    modelPins,
    // Present only with Cursor selected: the install lines its cloud environment
    // needs. It answers about this repository's clients, beside `model-pins`.
    ...(cloudInstall === null ? [] : [cloudInstall]),
    // Present only with a class file. It answers about this repository, so it
    // sits with the repository rows, before the one row that reads the corpus.
    ...(changeClasses === null ? [] : [changeClasses]),
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
 * - a plan entry that is not `unchanged` — create, update, or collision — or
 *   one carrying `rejected`: a document the client would refuse (S19), which
 *   `sync` keeps and warns about, so only this gate can stop it. A
 *   content-hash comparison is not needed on top: `predictMergeAction` already
 *   compares the bytes sync would write against the bytes on disk, so a
 *   silently edited managed file is exactly what `update` means;
 * - a ledger row whose file is gone — the engine claims to own a path that no
 *   longer exists;
 * - a pending reclaim candidate — a file queued for removal on the next sync.
 *
 * The plan keeps the model the emitted files carry (`keepEmittedPicks`,
 * REQ-LADDER-009): which models an account's list holds
 * is the `model-pins` row's to warn on, never drift, so a fresh clone with no
 * cached list, or a cache another account's list filled, reads no change here.
 * It keeps only a pick some list could have made (review/109): each class on a
 * shipped candidate for it or on the manifest's pin. A class the files leave
 * with no model though it has candidates, or on any other id, is resolved from
 * this checkout's own list, or with none from the shipped entry 0, so it reads
 * as drift unless that list gives the same; an unsynced pin edit that `sync`
 * would write is drift too (review/115).
 *
 * Propagates the plan's failures: an un-initialised repo (`VALIDATION_ERROR`)
 * and an unreadable manifest (`CONFIG_ERROR`) are the caller's to interpret.
 */
export async function runDriftGate(rootDir: string, engineVersion: string): Promise<DriftReport> {
  const plan = await planSync(rootDir, engineVersion, { keepEmittedPicks: true });
  // The dry-run sweep `sync --dry-run` runs, so the path list here and the
  // one a sync would act on are one computation, not two kept in agreement.
  const preview = await previewReclaim(rootDir, plan);
  const changes = plan.entries.filter((entry) => entry.action !== "unchanged" || entry.rejected !== undefined);

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
    reclaim: (preview?.entries ?? []).map(reclaimPreviewOf),
  };
}

/** The sweep's disposition, as {@link ReclaimPreview} names it. */
const PREVIEW_ACTION: Record<
  Exclude<ReclaimActionEntry["action"], "dry-run">,
  ReclaimPreview["action"]
> = {
  deleted: "delete",
  "managed-block-stripped": "strip",
  "co-owned-reduced": "reduce",
  "skipped-user-content": "keep",
  "skipped-unsafe-path": "refuse",
  "skipped-missing": "gone",
};

/**
 * One dry-run sweep entry as a preview row. A `dry-run` entry carries the
 * action consent would take in `wouldBe`, which every sweep entry of that
 * action sets; a refusal carries its own action and the sweep's sentence.
 */
function reclaimPreviewOf(entry: ReclaimActionEntry): ReclaimPreview {
  const acted = entry.action === "dry-run" ? (entry.wouldBe ?? "deleted") : entry.action;
  return {
    path: entry.path,
    reason: entry.candidateReason,
    action: PREVIEW_ACTION[acted],
    ...(entry.proof === undefined ? { why: entry.detail } : { proof: entry.proof }),
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
 * the doctor's fifteen probes on screen, which a diagnostic command exists to
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

// ── Gates ──────────────────────────────────────────────────────────────────

/**
 * The charter's three gate rows, in the order the close names them. `check`
 * runs none of them: it answers about the setup, and a green close that did not
 * say so read as a verified tree (REQ-FLOW-008).
 */
const NOT_RUN_GATES = ["lint", "typecheck", "test"] as const;

/**
 * Every row the charter prints, keyed as the manifest's `gates` block is and
 * named as `unresolvedGate` names it — the full gate's kind is `full-gate`
 * (`../../detect/verificationGates.ts`).
 */
const CHARTER_GATE_ROWS = [
  { key: "lint", kind: "lint" },
  { key: "typecheck", kind: "typecheck" },
  { key: "test", kind: "test" },
  { key: "all", kind: "full-gate" },
] as const;

/** One charter gate this machine cannot resolve, and the value the charter carries for it. */
interface UnresolvedGate {
  readonly kind: string;
  readonly value: string;
}

/** What the close says about gates: the ones not run, and the ones that could not run here. */
export interface CharterGateReport {
  readonly notRun: readonly string[];
  readonly unresolved: readonly UnresolvedGate[];
}

/**
 * The charter's gates as this repository resolves them, and which of them
 * could not run on this machine.
 *
 * A gate is unresolved on either of two grounds:
 *
 * 1. **Nothing to run.** For the three single gates this is no pin, and
 *    detection resolved nothing. It is not read off the rendered value's
 *    `unknown — no` prefix, because a pinned command is the operator's answer
 *    whatever it spells. The full gate is where that definition does not fit:
 *    a pin on any single gate recomposes the chain, so the full gate is absent
 *    only when it is not pinned and all three single gates are absent.
 * 2. **Its first word finds nothing.** A word with a path separator is a path
 *    relative to the root (a pinned `.venv/bin/python` is one); any other word
 *    is looked up as an executable file in `node_modules/.bin/`, `.venv/bin/`
 *    and each `PATH` entry, in that order. On Windows each lookup tries the
 *    `PATHEXT` extensions, `node_modules/.bin/<x>.cmd` always, and the word as
 *    written only when it already carries an extension — `cmd.exe` runs no
 *    extensionless file.
 *
 * Nothing is spawned: every probe is a file-system read, so a gate whose
 * command has side effects, or hangs, cannot be triggered by the read-only
 * verb. Pure and exported for the reason `checkClaudeHookShell` is: the Windows
 * branch cannot be reached in-process on a POSIX host, so platform and env are
 * injected.
 */
export function resolveCharterGates(
  rootDir: string,
  manifest: SetupManifest,
  gates: EngineRegistry["detect"]["verificationGates"],
  host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
  },
): CharterGateReport {
  const pinned = readGates(manifest);
  const detected = gates.verificationCommandsFor(manifest.detected);
  const values = gates.verificationGatesFor(manifest.detected, pinned);
  const absent = (key: (typeof NOT_RUN_GATES)[number]): boolean =>
    pinned[key] === undefined && detected[key] === undefined;
  const unresolved = CHARTER_GATE_ROWS.filter(({ key }) => {
    const missing =
      key === "all" ? pinned.all === undefined && NOT_RUN_GATES.every(absent) : absent(key);
    return missing || !commandResolves(values[key], rootDir, host);
  }).map(({ key, kind }) => ({ kind, value: values[key] }));
  return { notRun: [...NOT_RUN_GATES], unresolved };
}

/** Whether the first word of `command` names something this machine could execute. */
function commandResolves(
  command: string,
  rootDir: string,
  host: {
    readonly platform: NodeJS.Platform;
    readonly env: Readonly<Record<string, string | undefined>>;
  },
): boolean {
  const word = firstCommandWord(command);
  if (word === null) return false;

  const windows = host.platform === "win32";
  const extensions = (host.env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .filter((extension) => extension !== "")
    // Both spellings: PATHEXT is upper case by convention, the files rarely are,
    // and a case-sensitive file system (a Linux CI leg) tells them apart.
    .flatMap((extension) => [extension, extension.toLowerCase()]);
  const asWritten = /\.[^.]+$/.test(word) ? [word] : [];
  // A path-shaped word is held to the bar the PATH walk below sets: a regular
  // file with its execute bit on POSIX, completed by PATHEXT on Windows.
  if (/[\\/]/.test(word)) {
    const target = resolve(rootDir, word);
    if (!windows) return isExecutableFile(target, fsConstants.X_OK);
    const names = [...(asWritten.length > 0 ? [target] : []), ...extensions.map((extension) => target + extension)];
    return names.some((name) => isExecutableFile(name, fsConstants.F_OK));
  }

  // Windows spells the key `Path`; POSIX keys are case-sensitive, so only there
  // is the match loosened (the same rule `checkClaudeHookShell` reads PATH by).
  const pathKey = Object.keys(host.env).find((name) =>
    windows ? /^path$/i.test(name) : name === "PATH",
  );
  const pathEntries = (pathKey === undefined ? "" : (host.env[pathKey] ?? ""))
    .split(windows ? ";" : ":")
    // A quoted entry is legal on Windows; libuv strips the pair when it walks PATH.
    .map((entry) => entry.replace(/^"(.*)"$/, "$1"))
    .filter((entry) => entry !== "");
  const nodeBin = join(rootDir, "node_modules", ".bin");
  const dirs = [nodeBin, join(rootDir, ".venv", "bin"), ...pathEntries];

  if (!windows) return dirs.some((dir) => isExecutableFile(join(dir, word), fsConstants.X_OK));
  return dirs.some((dir) => {
    const names = [
      ...asWritten,
      ...extensions.map((extension) => `${word}${extension}`),
      ...(dir === nodeBin ? [`${word}.cmd`] : []),
    ];
    // Existence, not X_OK: Windows has no execute bit (Node's X_OK answers
    // existence there), and the extension is what makes a file runnable.
    return names.some((name) => isExecutableFile(join(dir, name), fsConstants.F_OK));
  });
}

/**
 * The program a gate command starts with: the first word, unquoted, after any
 * leading `NAME=value` assignments. `null` for a blank command.
 */
function firstCommandWord(command: string): string | null {
  const words = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const program = words.find((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
  if (program === undefined) return null;
  const unquoted = program.replace(/^(["'])(.*)\1$/, "$2");
  return unquoted === "" ? null : unquoted;
}

/** A regular file at `candidate` that passes the `mode` access check. */
function isExecutableFile(candidate: string, mode: number): boolean {
  try {
    accessSync(candidate, mode);
    return statSync(candidate).isFile();
  } catch {
    return false;
  }
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
  // A multi-line detail (`model-pins`, `pack-reach`) carries plain
  // newlines; each continuation line starts under the detail column —
  // two spaces, the four-column status token, two, the padded id, two.
  const continuation = `\n${" ".repeat(2 + 4 + 2 + width + 2)}`;
  ctx.io.out(`${ctx.palette.bold("doctor")}\n`);
  for (const row of doctor) {
    // Pad before painting: escape codes would otherwise count toward the width.
    ctx.io.out(
      `  ${paintStatus(row.status, ctx.palette)}  ${row.id.padEnd(width)}  ` +
        `${row.detail.replaceAll("\n", continuation)}\n`,
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
  const rows: { line: string; bounded: boolean }[] = [
    ...drift.changes.map((entry) => ({
      line: `  ${(entry.action === "unchanged" && entry.rejected !== undefined ? "rejected" : entry.action).padEnd(9)} ${visibleText(entry.path)}`,
      bounded: true,
    })),
    ...drift.missing.map((path) => ({ line: `  ${"missing".padEnd(9)} ${visibleText(path)}`, bounded: true })),
    // No reclaim line is folded into the `… and N more` row: each names a file
    // the next sync deletes, strips or reduces, or one it keeps or refuses and
    // why, and the operator reads this list to decide whether to run it —
    // `check` names every path a sync would reclaim (REQ-PLUGIN-045).
    ...drift.reclaim.map((preview) => ({ line: reclaimLine(preview), bounded: false })),
  ];
  let shown = 0;
  let folded = 0;
  for (const row of rows) {
    if (row.bounded && shown >= MAX_DRIFT_LINES) {
      folded += 1;
      continue;
    }
    if (row.bounded) shown += 1;
    ctx.io.out(`${palette.dim(row.line)}\n`);
  }
  if (folded > 0) ctx.io.out(palette.dim(`  … and ${folded} more\n`));
}

/** One reclaim preview as a drift line: the action, the path, and the proof or the reason. */
function reclaimLine(preview: ReclaimPreview): string {
  const head = `  ${preview.action.padEnd(9)} ${visibleText(preview.path)}`;
  return preview.proof === undefined
    ? `${head} — ${visibleText(preview.why ?? "")}`
    : `${head} (${preview.proof})`;
}

/** The escape character a {@link visibleText} spelling opens with. */
const BACKSLASH = "\\";

/**
 * Ledger-derived text as a drift line prints it: every control, bidi,
 * zero-width, separator and tag character is spelled as its `\u{…}` escape
 * text. A ledger path is committed text anyone can edit, and one carrying an
 * escape sequence could otherwise move the cursor and erase the line above it
 * — the `delete` line the operator reads before running `sync`. Spelled rather
 * than dropped, so the line still shows that the path holds such a character.
 * `--json` carries the path as recorded.
 */
function visibleText(text: string): string {
  return text.replace(UNPRINTABLE_CHARS, escapeCodePoint).replace(UNICODE_TAG_CHARS, escapeCodePoint);
}

function escapeCodePoint(char: string): string {
  return `${BACKSLASH}u{${Number(char.codePointAt(0)).toString(16)}}`;
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

/**
 * Paths a sync would refuse to write because a user file already holds them —
 * the ones {@link collisionStep}'s two remedies clear. A source refusal, an
 * `import-decision` collision and a `co-owned-shape` one are stated with their
 * own steps instead.
 */
function collidingPaths(report: DriftReport): string[] {
  return report.changes
    .filter(
      (entry) =>
        entry.action === "collision" &&
        entry.refusedAtSource !== true &&
        entry.collisionKind !== "import-decision" &&
        entry.collisionKind !== "co-owned-shape",
    )
    .map((entry) => entry.path);
}

/**
 * The step for a `co-owned-shape` collision (REQ-FLOW-036): the plan entry's
 * own detail, which names the member of another type and the fix. Nothing in
 * that document is the engine's to replace, so `sync --force` is not a remedy
 * and the generic collision step, which offers it, never names these paths.
 */
function coOwnedShapeSteps(report: DriftReport): string[] {
  return report.changes
    .filter((entry) => entry.action === "collision" && entry.collisionKind === "co-owned-shape")
    .map((entry) => `${entry.path}: ${entry.detail ?? ""}`);
}

/**
 * The step for a document the client would reject (S19): the plan entry's own
 * `rejected` sentence, which names each entry and the remedy. `sync` keeps
 * such an entry, since it is not the engine's, so `sync` is never the step.
 */
function rejectedSteps(report: DriftReport): string[] {
  return report.changes.flatMap((entry) => (entry.rejected === undefined ? [] : [entry.rejected]));
}

/**
 * The step for an `import-decision` collision (REQ-PLUGIN-046): the plan
 * entry's own detail, which names the recorded decision and the two remedies
 * that work — restoring `supplement`, or `init --force --import-config
 * replace`. `sync --force` is not one of them, so the generic collision step,
 * which offers it, never names these paths.
 */
function importDecisionSteps(report: DriftReport): string[] {
  return report.changes
    .filter((entry) => entry.action === "collision" && entry.collisionKind === "import-decision")
    .map((entry) => entry.detail ?? "");
}

/**
 * Collisions whose cause is ANOTHER file — the one the row repeats — which the
 * engine refused to republish. Neither remedy {@link collisionStep} names
 * clears them, so each is stated with its own detail instead.
 */
function sourceRefusedEntries(report: DriftReport): SyncPlanEntry[] {
  return report.changes.filter((entry) => entry.action === "collision" && entry.refusedAtSource === true);
}

/**
 * The step for a source-refused collision: the plan entry's own detail names the
 * refused source and how to repair it; moving the output aside or forcing the
 * sync leaves the refusal where it is.
 */
function sourceRefusalStep(entry: SyncPlanEntry): string {
  return (
    `${entry.path} is not written because the file it repeats was refused, so moving it aside or ` +
    `running ${packageCommand("sync --force")} does not clear it. ${entry.detail ?? ""} Once that ` +
    `file is repaired, run ${packageCommand("sync")}.`
  );
}

/** Whether anything a plain sync CAN fix is drifted, collisions and rejected documents aside. */
function hasNonCollisionDrift(report: DriftReport): boolean {
  return (
    report.changes.some((entry) => entry.action !== "collision" && entry.action !== "unchanged") ||
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
 * The closing block: what to run next, or that the setup is green and which
 * gates this run did not run.
 *
 * `ok` is passed in rather than re-derived, because it is the same value the
 * exit code is computed from. A closing line computed independently is exactly
 * how `all green — nothing to do` came to print beside exit 1: the two answers
 * were derived twice and disagreed, and the green one was the wrong one. With
 * `ok` false this block always prints a `next:` list — and if no specific step
 * matched, it says the run is not green and names the rows to read, which is
 * still an instruction rather than a contradiction.
 *
 * The gate lines print only on the green close: a run that is not green ends
 * on what to fix, and a gate warning beside it would bury the instruction. Each
 * unresolved gate counts toward the advisory total the close states, since it
 * is one more warning printed above it.
 */
function renderNextSteps(
  ctx: CliContext,
  doctor: readonly DoctorCheck[],
  outcome: DriftOutcome,
  ok: boolean,
  gates: CharterGateReport | null,
  leading: readonly string[] = [],
): void {
  // First, as the error document puts them: the caller's expectation is the
  // cause no other step below can clear (REQ-PLUGIN-047).
  const steps: string[] = [...leading];
  if (doctor.some((row) => row.id === "manifest" && row.status === "fail")) {
    steps.push(`${packageCommand("init")} — this repository has no usable manifest`);
  }
  if (doctor.some((row) => row.id === "pack-integrity" && row.status === "fail")) {
    // Deliberately NOT sync first: for an edited pack body sync copies the
    // current bytes into the generated setup, which propagates the change
    // rather than correcting it. Re-installing is what restores the recorded
    // content. `clean --pack` removes the pack's projected client copies it
    // can prove while the pack is still installed, and keeps and names the
    // rest — the moved file's own copy among them — which are deleted by hand
    // unless they are the operator's (review/71); a sync after that
    // regenerates the clients' files without the pack, before `add` (prove/6).
    // An edited file is moved out first, since `clean --pack` keeps it and
    // `add` would refuse it (review/56). The order is `packReinstallSteps`',
    // the one each finding line in the row prints too (review/58). `<source>`
    // is the one value that differs per pack, so each finding line spells it
    // from the pack's receipt and this block says where to find it (review/59).
    steps.push(
      `${packReinstallSteps(
        "<id>",
        "any edited file the pack-integrity row names",
        "<source>",
        packageCommand,
      )} — re-install the pack whose installed files no longer match, where <source> is the ` +
        `catalog id, local path or package name its install receipt records, as the row's ` +
        `finding line for that pack prints it; do not run sync first: ` +
        `it would carry the current bytes into the generated setup; clean --pack removes the ` +
        `pack's client copies itself and keeps and names any it cannot prove, and the sync after ` +
        `it regenerates the clients' files without the pack`,
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
      ...sourceRefusedEntries(outcome.report).map(sourceRefusalStep),
      ...importDecisionSteps(outcome.report),
      ...coOwnedShapeSteps(outcome.report),
      ...rejectedSteps(outcome.report),
      ...(hasNonCollisionDrift(outcome.report)
        ? [`${packageCommand("sync")} — regenerate the files that drifted`]
        : []),
    );
  }
  if (steps.length === 0 && ok) {
    const unresolved = gates?.unresolved ?? [];
    if (unresolved.length > 0) ctx.io.out("\n");
    for (const gate of unresolved) {
      ctx.io.out(
        `${ctx.palette.yellow(`warning: the ${gate.kind} gate cannot be resolved`)} — the charter ` +
          `says "${gate.value}"\n`,
      );
    }
    const warnings = doctor.filter((row) => row.status === "warn").length + unresolved.length;
    const notRun = `gates not run: ${NOT_RUN_GATES.join(", ")} (check runs no gate)`;
    ctx.io.out(
      warnings === 0
        ? `\n${ctx.palette.green("setup green")} — ${notRun}\n`
        : `\n${ctx.palette.green("ok")} — ${warnings} advisory warning(s) above; ${notRun}\n`,
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
 * other thirteen probes still have work to do.
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
 * worth losing the other thirteen verdicts over.
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

// ── Expectations ───────────────────────────────────────────────────────────

/**
 * What the caller says the repository must be (REQ-PLUGIN-047): the release
 * that generated it and runs this check, and the clients it targets. Every surface the rest of `check` compares against — the
 * manifest, the files, the running CLI — is one a pull request can change, so
 * an expectation has to come from a caller the pull request cannot edit, such
 * as a required workflow's input. A field left out is not checked.
 */
export interface Expectations {
  version?: string;
  tools?: readonly Tool[];
}

/**
 * The verdict on each field asked for, and only those. `recorded` and
 * `generatedBy` are `null` when the manifest could not be read: nothing was
 * compared, so nothing is `missing` or `extra` either, and the field is not ok.
 */
export interface ExpectationReport {
  ok: boolean;
  version?: { expected: string; running: string; generatedBy: string | null; ok: boolean };
  tools?: { expected: Tool[]; recorded: Tool[] | null; missing: Tool[]; extra: Tool[]; ok: boolean };
}

/**
 * Compare the caller's expectations with the manifest and the running release.
 * Pure: the caller reads the manifest and passes the version.
 *
 * A version matches only when BOTH the running CLI and the manifest's
 * `generatedBy` equal it, as strings — `1.12.0` does not match a fork's
 * `1.12.0-acme.1`. The running half is what stops a pull request that moves the
 * pin from making CI run a release nobody approved; the manifest half is what
 * stops a hand-set `generatedBy`. Clients compare as sets, listed in `TOOLS`
 * order so any spelling of the flag reads the same.
 */
export function evaluateExpectations(
  expected: Expectations,
  manifest: SetupManifest | null,
  runningVersion: string,
): ExpectationReport {
  const report: ExpectationReport = { ok: true };
  if (expected.version !== undefined) {
    const generatedBy = manifest?.generatedBy ?? null;
    report.version = {
      expected: expected.version,
      running: runningVersion,
      generatedBy,
      ok: runningVersion === expected.version && generatedBy === expected.version,
    };
  }
  if (expected.tools !== undefined) {
    const want = TOOLS.filter((tool) => expected.tools?.includes(tool));
    const recorded = manifest === null ? null : TOOLS.filter((tool) => manifest.tools.includes(tool));
    const missing = recorded === null ? [] : want.filter((tool) => !recorded.includes(tool));
    const extra = recorded === null ? [] : recorded.filter((tool) => !want.includes(tool));
    report.tools = {
      expected: want,
      recorded,
      missing,
      extra,
      ok: recorded !== null && missing.length === 0 && extra.length === 0,
    };
  }
  report.ok = [report.version, report.tools].every((field) => field?.ok !== false);
  return report;
}

/**
 * The two `--expect-*` flags, parsed before any probe runs: a bad value costs
 * nothing and is named, the way `workspace --tools` refuses one. `null` when no
 * flag was given, which is what keeps a run without them byte-identical to one
 * before they existed.
 */
function readExpectations(opts: Record<string, unknown>): Expectations | null {
  const expectations: Expectations = {};
  const rawVersion = opts["expectVersion"];
  if (typeof rawVersion === "string") {
    const parsed = semver.parse(rawVersion);
    if (parsed === null) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `--expect-version takes one exact version, got ${JSON.stringify(rawVersion)}`,
        why: "a range, a tag or an empty value names no single release, so no repository could match it",
        next: "pass the exact release, such as 1.12.0",
      });
    }
    // `parsed.version` drops build metadata, so `1.12.0+acme.1` would be held as
    // `1.12.0`: compared against a release the caller never named, and passed by
    // it. npm versions carry no build metadata, so the value is refused instead.
    if (parsed.build.length > 0) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: `--expect-version takes one exact release without build metadata, got ${JSON.stringify(rawVersion)}`,
        why: "an expectation names one published release, and npm versions carry no build metadata",
        next: `pass the release without its build metadata, such as ${parsed.version}`,
      });
    }
    expectations.version = parsed.version;
  }
  const rawTools = opts["expectTools"];
  if (typeof rawTools === "string") expectations.tools = readExpectedTools(rawTools);
  return Object.keys(expectations).length === 0 ? null : expectations;
}

/** `--expect-tools <csv>`, split tolerantly and held to `VALID_TOOLS`, as `workspace --tools` is. */
function readExpectedTools(raw: string): Tool[] {
  const names = raw
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");
  const unknown = [...new Set(names.filter((name) => !VALID_TOOLS.has(name)))];
  if (unknown.length > 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `unknown tool(s) ${unknown.map((name) => JSON.stringify(name)).join(", ")}`,
      why: "--expect-tools names the clients the manifest must record, and this build ships no adapter for that id",
      next: `valid tools: ${TOOLS.join(", ")}`,
    });
  }
  const tools = TOOLS.filter((tool) => names.includes(tool));
  if (tools.length === 0) {
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: "--expect-tools named no tool",
      why: "a repository that targets no client is not one a caller can expect",
      next: `pass a comma-separated list of: ${TOOLS.join(", ")}`,
    });
  }
  return tools;
}

/** Each field that failed, in the operator's words, in field order. */
function expectationMismatches(report: ExpectationReport): string[] {
  const lines: string[] = [];
  const { version, tools } = report;
  if (version !== undefined && version.generatedBy !== version.expected) {
    lines.push(`generated by ${version.generatedBy ?? "nothing"}, expected ${version.expected}`);
  }
  if (version !== undefined && version.running !== version.expected) {
    lines.push(`this check runs ${version.running}, expected ${version.expected}`);
  }
  if (tools !== undefined && !tools.ok) {
    const gaps = [
      ...(tools.missing.length > 0 ? [`${tools.missing.join(", ")} missing`] : []),
      ...(tools.extra.length > 0 ? [`${tools.extra.join(", ")} not expected`] : []),
    ];
    lines.push(`clients ${(tools.recorded ?? []).join(", ") || "none"} — ${gaps.join(", ")}`);
  }
  return lines;
}

/**
 * The `expectations` doctor row. Printed only when a flag asked for it, after
 * `invariants` and outside {@link runDoctor}, so a run without the flags keeps
 * its fifteen rows (one more each with Cursor selected and with a class file). A manifest that could not be read leaves nothing to compare
 * against: the row says so, and the `manifest` row above it carries the cause.
 */
function expectationsRow(report: ExpectationReport, evaluated: boolean): DoctorCheck {
  const id = "expectations";
  if (!evaluated) {
    return { id, status: "fail", detail: "not evaluated: the manifest could not be read" };
  }
  if (report.ok) {
    const asked = [
      ...(report.version === undefined ? [] : [`release ${report.version.expected}`]),
      ...(report.tools === undefined ? [] : [`clients ${report.tools.expected.join(", ")}`]),
    ];
    return { id, status: "pass", detail: `${asked.join(", ")} — as expected` };
  }
  return { id, status: "fail", detail: expectationMismatches(report).join("; ") };
}

/**
 * The pinned call at the release the caller expects, not the running one: the
 * remedy for a release mismatch is to run that release. Rendered by
 * `packageCommandAt`, from the identity `packageCommand` reads for every other
 * remedy here — name, channel and a registry fork's registry together, with
 * the same unpinned fallback for an unrunnable own name.
 */
function pinnedCallAt(version: string, verb: string): string {
  return packageCommandAt(version, verb);
}

/**
 * One step per mismatch {@link expectationMismatches} names, in the same order.
 * Each change lands through a reviewed pull request: the caller's expectation
 * is the approved state, and a repository is moved to it, never the
 * expectation to the repository.
 *
 * With a release expected, every step runs that release, not the running one:
 * a client-set step at the running release would regenerate there last and
 * break `generatedBy` again. Without one, they run the running release, as
 * every other remedy here does.
 */
function expectationSteps(report: ExpectationReport): string[] {
  const steps: string[] = [];
  const { version, tools } = report;
  const call =
    version === undefined ? packageCommand : (verb: string): string => pinnedCallAt(version.expected, verb);
  if (version !== undefined && version.generatedBy !== version.expected) {
    steps.push(
      `regenerate with the expected release in a reviewed pull request: ${pinnedCallAt(version.expected, "sync")}`,
    );
  }
  if (version !== undefined && version.running !== version.expected) {
    steps.push(
      `run this check with the expected release: ` +
        pinnedCallAt(version.expected, `check --expect-version ${version.expected}`),
    );
  }
  if (tools !== undefined && !tools.ok) {
    steps.push(
      `${call(`config set tools ${tools.expected.join(",")}`)}, then ${call("sync")}, ` +
        "in a reviewed pull request",
    );
  }
  return steps;
}

/** The caller's expectations as one run reads them: the report, its row, and the steps a mismatch owes. */
interface ExpectationOutcome {
  readonly report: ExpectationReport;
  readonly row: DoctorCheck;
  /** Empty unless the manifest was read and a field failed. */
  readonly steps: readonly string[];
  readonly mismatches: readonly string[];
}

function expectationOutcome(
  expected: Expectations,
  manifest: SetupManifest | null,
  runningVersion: string,
): ExpectationOutcome {
  const report = evaluateExpectations(expected, manifest, runningVersion);
  const evaluated = manifest !== null;
  const failed = evaluated && !report.ok;
  return {
    report,
    row: expectationsRow(report, evaluated),
    steps: failed ? expectationSteps(report) : [],
    mismatches: failed ? expectationMismatches(report) : [],
  };
}

export const checkCommand: CommandModule = {
  name: "check",
  summary: "diagnose the environment and gate on drift between disk and the engine's output",
  mutating: false,

  configure(cmd: Command): void {
    cmd
      .option(
        "--expect-version <semver>",
        "fail unless this exact release generated the repository and runs this check",
      )
      .option(
        "--expect-tools <csv>",
        `fail unless the manifest's clients are exactly the listed ids, each one of ${TOOLS.join(", ")}`,
      );
  },

  // No spinner: this is the CI gate, and progress chatter on stdout would sit
  // in the middle of the report a pipeline is reading.
  async run(ctx: CliContext, opts: Record<string, unknown>): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    // Before any probe: a value no repository could match is the caller's
    // defect, and it is named without a word of the report around it.
    const expected = readExpectations(opts);

    // The manifest is read once here and handed to both consumers, because the
    // drift gate's swallow has to be conditioned on THIS read rather than on
    // the shape of an error the plan happened to throw. The doctor's own probes
    // and the provenance rollup stay independent reads issued together; it is
    // one small JSON file, and threading one parse through every signature buys
    // less than it costs in coupling.
    const manifestState = await readManifestState(rootDir, ctx.engine);
    const [probes, drift, provenance] = await Promise.all([
      runDoctor(rootDir, ctx.engine, ctx.app),
      evaluateDrift(rootDir, ctx.app.version, manifestState),
      readProvenance(rootDir, ctx.engine),
    ]);
    // The caller's expectations, only when a flag asked (REQ-PLUGIN-047): one
    // more row after the fifteen, so its `fail` reaches `ok` like any other.
    const expectations =
      expected === null ? null : expectationOutcome(expected, manifestState.manifest, ctx.app.version);
    const doctor = expectations === null ? probes : [...probes, expectations.row];

    // One value, read by the exit code, the closing block and the payload, so
    // no two surfaces can answer this question differently. A gate that could
    // not run is never success: `evaluated` is required, not just `clean`.
    const ok =
      !doctor.some((row) => row.status === "fail") &&
      drift.kind === "evaluated" &&
      drift.report.clean;

    // From the manifest already read above. No manifest, no charter gates to
    // name: the `manifest` row fails and the close is the `init` step.
    const gates =
      manifestState.manifest === null
        ? null
        : resolveCharterGates(rootDir, manifestState.manifest, ctx.engine.detect.verificationGates, {
            platform: process.platform,
            env: ctx.app.runtime.env,
          });

    renderDoctor(ctx, doctor);
    renderDrift(ctx, drift);
    renderProvenance(ctx, provenance);
    renderNextSteps(ctx, doctor, drift, ok, gates, expectations?.steps ?? []);

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
                // Each preview is a fresh object `runDriftGate` built for this
                // report, so a shallow copy of the list shares nothing mutable.
                reclaim: [...report.reclaim],
              },
        // Why there is no verdict, in the payload as well as on screen: a CI
        // job reading `drift: null` cannot otherwise tell "not initialised"
        // from "the plan is broken", and those need different responses.
        driftStatus: drift.kind,
        provenance,
        // The bound every ledger row must lie in (REQ-PLUGIN-045), on every
        // run: the refusal a manifest meets names a row, and this is the list
        // the operator reads it against.
        ownedPaths: OWNED_PATHS,
        ...(expectations === null ? {} : { expectations: expectations.report }),
        // Data about the charter, so present whether or not the run is green;
        // absent only when there is no manifest to read it from. The exit code
        // never reads it: an unresolved gate is advisory.
        ...(gates === null
          ? {}
          : {
              gates: {
                notRun: [...gates.notRun],
                unresolved: gates.unresolved.map((gate) => gate.kind),
              },
            }),
        ok,
        // A returned exit-1 result owes an error document. It is the drift
        // gate's failure when there is one — that is the cause a machine
        // caller can act on — and otherwise a pointer to the failing rows,
        // which are in the same payload.
        ...(ok ? {} : { error: checkFailureDoc(doctor, drift, expectations) }),
      },
    };
  },
};

/**
 * The `error` document for a non-green run: the diagnosable cause, named.
 *
 * An evaluated expectation that failed comes first, before a drift gate that
 * could not run: it says the repository is not the one its caller approved,
 * which no fix to the drift makes true, and its own code lets an orchestrator
 * tell that from drift (REQ-PLUGIN-047). An expectation that could not be
 * evaluated keeps the order below, where the `manifest` row's failure leads.
 */
function checkFailureDoc(
  doctor: readonly DoctorCheck[],
  drift: DriftOutcome,
  expectations: ExpectationOutcome | null = null,
): FailureDoc {
  if (expectations !== null && expectations.mismatches.length > 0) {
    return {
      code: "EXPECTATION_ERROR",
      message: "check found the repository different from what its caller expects",
      why: expectations.mismatches.join("; "),
      // One string, as every `next` here is. Its steps are separated by "; ",
      // as `why`'s mismatches are, one step per mismatch in the same order, so a
      // machine reader splits both on "; ". No step holds one: a version, a
      // client id and a runnable package name cannot.
      next: expectations.steps.join("; "),
    };
  }
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
  const collisionSteps = [
    ...(collisions.length > 0 ? [collisionStep(collisions)] : []),
    ...(drift.kind === "evaluated" ? sourceRefusedEntries(drift.report).map(sourceRefusalStep) : []),
    ...(drift.kind === "evaluated" ? importDecisionSteps(drift.report) : []),
    ...(drift.kind === "evaluated" ? coOwnedShapeSteps(drift.report) : []),
    ...(drift.kind === "evaluated" ? rejectedSteps(drift.report) : []),
  ];
  return {
    code: "INTEGRITY_ERROR",
    message: "check found drift between the repository and what a sync would write",
    why: "one or more generated files differ from the engine's output, are missing, or are queued for reclaim",
    next:
      collisionSteps.length > 0
        ? collisionSteps.join(" ")
        : `${packageCommand("sync")} — regenerate the files that drifted`,
  };
}
