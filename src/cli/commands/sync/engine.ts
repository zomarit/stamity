import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { buildContentIndex, type ContentIndex } from "../../../content/catalog.ts";
import { analyzeRepo, summarizeDetection } from "../../../detect/repoAnalyzer.ts";
import {
  assertLedgerContainment,
  computeReclaimCandidates,
  replaceAdapterEntries,
  toLedgerEntries,
  trustedInfraPaths,
  type EmittedArtifact,
  type ReclaimCandidate,
} from "../../../manifest/ledger.ts";
import { manifestPath, readManifest, writeManifest } from "../../../manifest/manifest.ts";
import {
  materializeUserMcpJson,
  planUserMcpJson,
  predictMcpMergeRefusal,
} from "../../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../../mcp/catalog.ts";
import {
  engineOwnedServerIds,
  mcpReclaimReducers,
  MERGED_MCP_JSON_PATHS,
} from "../../../mcp/emit.ts";
import { isSharedRegularFile } from "../../../merge/atomicWrite.ts";
import { extractManagedBlock } from "../../../merge/managedBlocks.ts";
import { sweepReclaimCandidates, type ReclaimReport } from "../../../merge/reclaim.ts";
import {
  ledgerHashIndex,
  ledgerPathSet,
  predictMergeAction,
  predictPreservedContentRefusal,
  safeWriteFile,
  type MergeAction,
  type SafeWriteFileOptions,
} from "../../../merge/safeWrite.ts";
import { discoverInstalledPacks, packMcpServers } from "../../../pack/projection.ts";
import {
  outputOwners,
  type AdapterOutput,
  type ContentClass,
  type ContentSelection,
  type MergeResult,
} from "../../../types/content.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import type { DetectedSummary } from "../../../types/detect.ts";
import { EngineError } from "../../../types/errors.ts";
import type { SetupManifest } from "../../../types/manifest.ts";
import { ensureStateScaffold } from "../../../emit/stateScaffold.ts";
import { getEmissionPlanner } from "../../engine/emission.ts";
import { readWorkingTreeStatus, type WorkingTreeStatus } from "../../engine/gitStatus.ts";
import type { GitRunner } from "../../../workspace/git.ts";

/**
 * The one regeneration engine: sync is the single write verb, and
 * this module is its whole body, split into a read-only PLAN and a mutating
 * APPLY so the check command can reuse the plan as its drift gate without ever
 * gaining write access.
 *
 * PLAN reads everything and touches nothing: manifest (the manifest reader already
 * runs schema migrations on version change), full-corpus selection rebuilt
 * from the bundled catalog (v1 selection is derived, the manifest field is the
 * future narrowing hook), fresh repo detection, the emission planner's
 * intended outputs, a per-output merge-disposition prediction, reclaim
 * candidates, and working-tree cleanliness.
 *
 * APPLY consumes a plan: refuses each COLLIDING path without `force` (the rest
 * of the plan is written — a partial apply, reported and exited non-zero, not a
 * discarded run), writes through the safe-write lane (only-when-stale — a
 * semver-equal re-run reports all `unchanged` and bumps no mtimes), rebuilds
 * the ownership ledger per tool (pack rows pass through untouched by
 * construction), sweeps reclaim candidates, and writes the manifest LAST — the
 * manifest write is the commit point, so a failed emission leaves no manifest
 * claiming ownership.
 *
 * PROVENANCE is the manifest file itself: no separate provenance
 * file exists. The report module rolls the manifest up for display.
 */

// Writes are sequential on purpose: per-path locks acquire in a stable order,
// the report preserves emission order, and a failure aborts before the
// manifest commit point instead of racing sibling writes.
/* oxlint-disable no-await-in-loop */

/**
 * Why a planned path collided — the axis `--force` splits on, so the aggregate
 * refusal can name a remedy that works instead of one that fails:
 *
 * - `unmanaged-name` — user content at a name the engine did not mint. `--force`
 *   clears it, overwriting behind a verified `.bak`.
 * - `deny-scan` — the preserved bytes carry a block-severity injection pattern.
 *   Not force-overridable: the write lane re-raises with the text named.
 * - `shared-name` — the target is a hard link, so the bytes the write would
 *   preserve or copy carry a second name this tree cannot see. Not
 *   force-overridable either, and for a different reason: there is no flagged
 *   text to fix, and each of the three write lanes refuses the forced write on
 *   its OWN gate — the managed lane inside `refusePreservedContent`, ahead of
 *   any backup; the whole-file lane inside `backupBeforeOverwrite`, which
 *   refuses the same file a second time; the merged-MCP lane ahead of its own
 *   read, where force plays no part.
 *
 * The per-lane account above is this file's only one. Every other comment here
 * defers to it or scopes itself to a single lane in its opening words, and
 * {@link COLLISION_REMEDY}'s `shared-name` sentence says the same thing to the
 * operator — a second, differently-worded mechanism is a defect, not a variant.
 */
type CollisionKind = "unmanaged-name" | "deny-scan" | "shared-name";

/** One planned path and the disposition the apply run would give it. */
export interface SyncPlanEntry {
  /** Repo-relative POSIX path of the planned output. */
  path: string;
  /**
   * `collision` = an existing file the merge would refuse or skip. Which of the
   * three refusal classes is in `collisionKind`; the operator-facing text is in
   * `detail`.
   */
  action: "create" | "update" | "unchanged" | "collision";
  adapter: string;
  artifactId: string;
  /** Present on collisions: the refusal class, for callers that branch. */
  collisionKind?: CollisionKind;
  /**
   * Present on collisions: why, and what unblocks the write. Carries the write
   * lane's own refusal message verbatim for the two classes that have one.
   */
  detail?: string;
}

/** Everything applySync needs, computed read-only. */
export interface SyncPlan {
  /** The manifest to persist: parsed (post-migration), selection + detection refreshed. */
  manifest: SetupManifest;
  entries: SyncPlanEntry[];
  /** Paths of every `collision` entry, in entry order. */
  collisions: string[];
  reclaim: ReclaimCandidate[];
  dirty: WorkingTreeStatus;
  /** True when the manifest reader migrated the schema; apply persists the migrated shape. */
  manifestMigrated: boolean;
  plannerId: string;
  /**
   * The planned emission the entries were judged from — apply writes exactly
   * these. Carried on the plan (not re-derived at apply time) so the preview
   * and the run it previews can never disagree about content.
   */
  outputs: AdapterOutput[];
  /**
   * What the planning pass found and no output row can express — a user or
   * pack hook rejected at parse time and therefore never wired, a pack agent
   * whose grant resolved empty, a policy document past the size cap the
   * generated guard parses (which denies every agent in the repo). Produced by
   * `../../../emit/hooksInfra.ts` and delivered through
   * `EmissionPlanner.planWithWarnings`; rendered by `./report.ts`.
   *
   * It belongs on the PLAN, not on {@link SyncApplyReport}: it is a planning
   * fact, and a dry run has no `wrote[]` — a channel carried only on the apply
   * report would preview a rejected hook as silence, which is the same failure
   * one lane further along.
   *
   * Optional in the TYPE only because a plan is also assembled by hand in
   * fixtures that drive `applySync` straight to a gate and never reach a render
   * site ({@link applySync} reads no warnings). {@link planSync} always sets it
   * — pinned in `test/cli/commands/syncEngine.test.ts` — so no production plan
   * reaches the report without the channel.
   */
  warnings?: readonly string[];
}

/** Concurrent per-output prediction reads; mirrors the catalog's read bound. */
const PREDICT_CONCURRENCY = 8;

const ACTION_OF: Record<MergeAction, SyncPlanEntry["action"]> = {
  created: "create",
  updated: "update",
  unchanged: "unchanged",
  skipped: "collision",
};

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** File content, or `null` when the file does not exist. Other errnos propagate. */
async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw err;
    return null;
  }
}

/**
 * The manifest `version` as it sits on disk, read leniently — planSync calls
 * this only after `readManifest` succeeded, so parse failures cannot happen on
 * the same bytes and collapse to `null` (read as "unknown", never a throw).
 */
async function readOnDiskManifestVersion(rootDir: string): Promise<string | null> {
  try {
    const raw = await readFile(manifestPath(rootDir), "utf8");
    const parsed: unknown = JSON.parse(raw.startsWith("\uFEFF") ? raw.slice(1) : raw);
    const version = (parsed as { version?: unknown } | null)?.version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

/**
 * Every MCP server this repo's installed packs supply, read through the seam
 * emission resolves ids from (`../config/mcp.ts` asks the identical question of
 * the identical pair, and asking it a second way here would be a second answer
 * waiting to disagree).
 *
 * BOTH lanes call this, off the same ledger, because ownership is what the
 * answer decides. `engineOwnedServerIds` proves authorship of an UNSELECTED
 * entry by re-rendering it, and it can only render an id it can resolve — so a
 * pack-supplied entry the engine itself wrote is judged an unowned USER row
 * without these rows, and `../../../manifest/mcpFilter.ts` then preserves it
 * verbatim. A deselected third-party server would never leave `.mcp.json`,
 * `.cursor/mcp.json` or `.vscode/mcp.json`, and would keep launching with the
 * credentials in `.env.mcp`. The PLAN lane asking the same question is the
 * other half: an empty answer there predicts `unchanged` for a document the
 * apply lane is about to rewrite, so `check` reports no drift across a
 * revocation that silently failed.
 *
 * Reads nothing when the ledger carries no pack rows (`../../../pack/projection.ts`),
 * so a repo with no packs installed pays for none of this.
 */
async function installedPackServers(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}

/**
 * v1 selection semantics: the full corpus, derived fresh each sync. The
 * manifest's selection field is refreshed from this — it is the future
 * narrowing hook, not yet a filter.
 */
function fullCorpusSelection(index: ContentIndex): ContentSelection {
  const items: Record<ContentClass, string[]> = { agent: [], skill: [], rule: [], command: [] };
  for (const item of index.items) items[item.type].push(item.id);
  return { items };
}

/**
 * The safe-write options one output gets — single-sourced so the plan's
 * prediction and the apply's write can never diverge. An output whose content
 * carries a managed block takes the managed-merge lane; one without (plain
 * JSON and other comment-less formats) is a whole-file write.
 *
 * `boundaryDir` is the repo root — the same root every output path is joined
 * onto, so the writer's containment check answers the exact question this
 * caller can answer: sync emits into this tree and nowhere else. Without it the
 * substrate falls back to its structural rule, which cannot tell a monorepo's
 * in-repo alias (`.cursor/rules` → `shared/rules`) from a planted redirect and
 * refuses both.
 *
 * `ledgerHashes` rides alongside `ledgerPaths` and is built from the same rows.
 * Ownership alone told the writer the path is regenerable; the recorded hash is
 * what tells it whether the bytes STILL are. Without it a marker-less output
 * this engine owns — a hook script, one of the plain-JSON documents — that the
 * operator hand-edited is replaced outright on a plain flagless sync, with no
 * `.bak` and no warning (`../../../merge/safeWrite.ts::hasLedgerDrift`). The
 * plan lane needs no equivalent: drift moves the backup, never the disposition,
 * so `predictMergeAction` still answers for this write exactly.
 */
function writeOptions(
  managedBody: string | null,
  engineVersion: string,
  force: boolean,
  rootDir: string,
  ledgerPaths?: ReadonlySet<string>,
  ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>,
): SafeWriteFileOptions {
  const base: SafeWriteFileOptions = {
    version: engineVersion,
    force,
    backup: true,
    boundaryDir: rootDir,
    ...(ledgerPaths === undefined ? {} : { ledgerPaths }),
    ...(ledgerHashes === undefined ? {} : { ledgerHashes }),
  };
  return managedBody === null ? base : { ...base, managedContent: managedBody, appendIfNoBlock: true };
}

/**
 * Prospective ledger rows for a planned emission (no hashes — identity only).
 * Co-owned outputs expand to one row per owner (`outputOwners` collapses
 * duplicate adapters), so containment, reclaim protection, and rename
 * detection all judge the same multi-owner rows the apply run will persist —
 * a shared path stays protected for every owner, not only the first.
 */
function plannedRows(outputs: readonly AdapterOutput[]): EmittedArtifact[] {
  return outputs.flatMap((output) =>
    outputOwners(output).map((owner) => ({
      path: output.path,
      adapter: owner.adapter,
      artifactId: owner.artifactId,
      artifactType: owner.artifactType,
    })),
  );
}

/**
 * `lstat` behind {@link isSharedRegularFile}, for the one lane with no refusal
 * predictor of its own to read the shape off: the whole-file lane, whose writer
 * refuses later, inside the backup. The managed lane previews
 * `predictPreservedContentRefusal` and the merged-MCP lane
 * `predictMcpMergeRefusal`, each single-sourced from the writer that throws it.
 *
 * A path that vanished between this call and the write is not a shared name —
 * the apply lane will report whatever it then finds — and an absent path is not
 * one either, so every errno collapses to `false` rather than failing a
 * read-only plan.
 */
async function isSharedNameTarget(absPath: string): Promise<boolean> {
  try {
    return isSharedRegularFile(await lstat(absPath));
  } catch {
    return false;
  }
}

/** The whole-file lane's `shared-name` detail. The managed lane previews the
 *  writer's own refusal instead; this lane's write never reaches one, because
 *  its refusal fires later, inside the backup. */
function sharedNameDetail(path: string): string {
  return (
    `An existing file occupies ${path} and it is a hard link — its contents carry a second name ` +
    `this tree cannot see, which may sit outside it. Sync will not overwrite it, and --force ` +
    `does not help: it routes the write through the backup lane, which refuses to copy shared ` +
    `bytes into the tree. Replace it with a regular file — copy the contents to a new file and ` +
    `move that over this name — or delete it and re-run to regenerate it.`
  );
}

/**
 * Classify the planned outputs against the working tree: the disposition
 * {@link predictMergeAction} predicts, with a preserved-content refusal
 * overriding it — the write would refuse before merging, so the entry is a
 * `collision` carrying the refusal class in `collisionKind` and the exact
 * refusal text in `detail`. Neither refusal class is force-overridable, which
 * is what the class distinction exists to let the caller say: a `deny-scan`
 * entry is fixed by editing the flagged text, a `shared-name` entry by
 * replacing the hard link.
 *
 * Read-only and pure per output; exported so the plan-side classification is
 * testable while the shipped emission planner is still a no-op.
 */
export async function planOutputEntries(
  rootDir: string,
  outputs: readonly AdapterOutput[],
  engineVersion: string,
  ledgerPaths?: ReadonlySet<string>,
  mcpServers?: readonly string[],
  packServers?: readonly PackSuppliedServer[],
): Promise<SyncPlanEntry[]> {
  return pLimit(PREDICT_CONCURRENCY).map([...outputs], async (output) => {
    const absPath = join(rootDir, output.path);
    const managedBody = extractManagedBlock(output.content, absPath);
    const base = {
      path: output.path,
      adapter: output.owner.adapter,
      artifactId: output.owner.artifactId,
    };
    if (managedBody !== null) {
      // Only the managed lane preserves user bytes next to engine output, so
      // only it can be deny-refused — mirroring safeWriteFile branch for branch.
      const refusal = await predictPreservedContentRefusal(absPath);
      if (refusal !== null) {
        return {
          ...base,
          action: "collision" as const,
          collisionKind: refusal.kind,
          detail: refusal.message,
        };
      }
    }
    // The three merged MCP documents collide on exactly one axis. Ownership
    // merging means an existing file is never overwritten, so predicting the
    // whole-file lane's collision here would advertise a refusal the apply lane
    // does not perform — but the merge PRESERVES the document's own top-level
    // fields and republishes them, which on a hard link is the same exfil the
    // managed and backup lanes refuse, and this lane reached
    // `materializeUserMcpJson` past both of their guards.
    if (MERGED_MCP_JSON_PATHS.has(output.path)) {
      // Ahead of the read, not after it: `planUserMcpJson` reports a parse
      // failure by quoting the parser's message, which carries a fragment of
      // whatever it read — the same leak one step short of disk that
      // `refusePreservedContent` orders its own checks to avoid. The predicate
      // and the text both come from the writer that throws them, so this row
      // cannot drift from the refusal it previews.
      const linkedMcp = await predictMcpMergeRefusal(absPath);
      if (linkedMcp !== null) {
        return {
          ...base,
          action: "collision" as const,
          collisionKind: "shared-name" as const,
          detail: linkedMcp,
        };
      }
      // The prediction runs the real merge over the bytes, so an already-current
      // document reports `unchanged` and the drift gate stays clean. Pack supply
      // rides along for the same reason the apply lane carries it — see
      // {@link installedPackServers}; predicting from a narrower ownership set
      // than the write will use is how a removal gets performed but not
      // previewed, which is the one disagreement this pair may not have.
      const existingMcp = await readIfExists(absPath);
      const predicted = planUserMcpJson(
        absPath,
        output.content,
        engineOwnedServerIds(output.path, mcpServers ?? [], existingMcp, packServers ?? []),
        existingMcp,
      );
      return { ...base, action: ACTION_OF[predicted.result.action] };
    }
    const existing = await readIfExists(absPath);
    // The prediction is pure — `boundaryDir` is inert here — but it is built
    // from the same call so the plan and the apply cannot drift apart.
    const action = predictMergeAction(existing, output.content, writeOptions(managedBody, engineVersion, false, rootDir, ledgerPaths), absPath);
    if (action === "skipped") {
      // The whole-file lane's own hard-link case, re-labelled rather than
      // discovered: this path was already a collision, and the only thing that
      // changes is which remedy is true for it. `--force` is the remedy the
      // detail below names, and on a shared name it is not one — a forced write
      // on THIS lane takes a `.bak` first, and that copy is refused
      // (`merge/safeWrite.ts::backupBeforeOverwrite`). The other lanes refuse
      // on their own gates; see the `shared-name` bullet on CollisionKind.
      if (await isSharedNameTarget(absPath)) {
        return {
          ...base,
          action: "collision" as const,
          collisionKind: "shared-name" as const,
          detail: sharedNameDetail(output.path),
        };
      }
      return {
        ...base,
        action: "collision" as const,
        collisionKind: "unmanaged-name" as const,
        detail:
          `An existing file occupies ${output.path} without STAMITY:BEGIN/END markers and the ` +
          `engine does not own its name, so sync will not overwrite it. Re-run with --force to ` +
          `overwrite after a verified .bak, or move the file aside.`,
      };
    }
    return { ...base, action: ACTION_OF[action] };
  });
}

/**
 * Build the sync plan for the repo at `rootDir`. Read-only: no write of any
 * kind happens here, which is what lets the check command run it as a drift
 * gate.
 *
 * Throws `VALIDATION_ERROR` for an un-initialised repo, and propagates the
 * manifest reader's `CONFIG_ERROR` for a manifest that is invalid or from a newer
 * schema generation.
 */
export async function planSync(
  rootDir: string,
  engineVersion: string,
  opts: { runner?: GitRunner } = {},
): Promise<SyncPlan> {
  const manifest = await readManifest(rootDir);
  if (manifest === null) {
    throw new EngineError(
      `This repository is not initialised — run: npx @zomarit/stamity init. Sync regenerates from ` +
        `${manifestPath(rootDir)}, which does not exist yet.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  // The manifest reader already ran schema migrations; the flag records whether they
  // changed anything, so apply knows it is persisting a migrated shape.
  const onDiskVersion = await readOnDiskManifestVersion(rootDir);
  const manifestMigrated = onDiskVersion !== null && onDiskVersion !== manifest.version;

  const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
  const detected: DetectedSummary = summarizeDetection(repoInfo);
  const planningManifest = structuredClone(manifest);
  planningManifest.selection = fullCorpusSelection(index);
  planningManifest.detected = detected;

  const planner = getEmissionPlanner();
  // `planWithWarnings`, not `plan`: sync prints a report, so it takes the view
  // that carries what the pass found. The narrow view would drop every
  // hooks-planner finding on the floor, and a sync that re-emits a rejected
  // hook would stay silent about it on every run.
  const { outputs, warnings } = await planner.planWithWarnings({
    rootDir,
    manifest: planningManifest,
    engineVersion,
    facts: {
      monorepoPackages: repoInfo.monorepoPackages,
    },
  });

  // Containment before any prediction read: a planner output path is about to
  // be joined onto rootDir and become a ledger row, so a shape-invalid path
  // (absolute, `..`) is refused here rather than resolved.
  const rows = toLedgerEntries(plannedRows(outputs));
  assertLedgerContainment(rows, rootDir);

  // Resolved after `planner.plan` on purpose: the planner walks the same
  // installed packs on its way to the emission, so a pack directory the ledger
  // records and the filesystem has lost is already refused there, with its own
  // message, rather than surfacing here as a second CONFIG_ERROR further down.
  const packServers = await installedPackServers(rootDir, manifest);

  // The PERSISTED ledger is what licenses an overwrite: a path the engine wrote
  // on a previous run is engine-owned regardless of what the platform named it
  // (AGENTS.md, .claude/settings.json, …), which the filename-prefix heuristic
  // alone cannot tell. Without it those paths classify `collision` on the first
  // content-changing sync and the engine cannot maintain its own output.
  const entries = await planOutputEntries(
    rootDir,
    outputs,
    engineVersion,
    ledgerPathSet(rootDir, manifest.ledger.map((row) => row.path)),
    manifest.mcp?.servers ?? [],
    packServers,
  );
  const collisions = entries.filter((entry) => entry.action === "collision").map((entry) => entry.path);

  // Candidates are judged against the union of the persisted ledger and the
  // planned rows, so a renamed artifact's old path classifies `path-renamed`
  // (the new row must be present) instead of degrading to `deselected`.
  const reclaim = computeReclaimCandidates(
    [...manifest.ledger, ...rows],
    new Set(outputs.map((output) => output.path)),
    new Set<Tool>(manifest.tools),
  );

  return {
    manifest: planningManifest,
    entries,
    collisions,
    reclaim,
    dirty: readWorkingTreeStatus(rootDir, opts.runner),
    manifestMigrated,
    plannerId: planner.id,
    outputs,
    warnings,
  };
}

/** What an apply run did (or, for `dryRun`, would do). */
export interface SyncApplyReport {
  /** Per-file merge results, paths repo-relative. Empty on a dry run. */
  wrote: MergeResult[];
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  /**
   * Paths the collision gate refused to write, repo-relative and in plan order.
   * Empty on a dry run, and empty under `--force`, which clears the one
   * collision class force can clear and lets the writer judge the rest.
   *
   * Non-empty means the run did real work AND left something undone, which is
   * a state the report had no way to express while a single collision threw the
   * whole plan away. The command reads it for its exit code.
   */
  refused: string[];
  /** Sweep report; `null` when the plan had no reclaim candidates. */
  reclaimed: ReclaimReport | null;
  manifestPath: string;
  dryRun: boolean;
  /** The manifest exactly as persisted — the provenance record. `null` on a dry run. */
  manifest: SetupManifest | null;
}

function tally(entries: readonly SyncPlanEntry[], action: SyncPlanEntry["action"]): number {
  return entries.filter((entry) => entry.action === action).length;
}

/** Fixed sentence order, so a mixed plan reads the same way every run. */
const COLLISION_KIND_ORDER = ["unmanaged-name", "deny-scan", "shared-name"] as const;

/**
 * The remedy sentence each class earns. Only the classes actually present are
 * printed, and the `shared-name` one names its own paths: it is the only class
 * whose fix is per file rather than a flag, so an operator reading a mixed
 * refusal has to be able to tell which files it applies to.
 */
const COLLISION_REMEDY: Record<CollisionKind, (paths: readonly string[]) => string> = {
  "unmanaged-name": () => `--force overwrites after a verified .bak, or move the file aside.`,
  "deny-scan": () =>
    `A deny-scan collision is never force-overridable — fix the flagged text instead (see the ` +
    `plan entry's detail).`,
  "shared-name": (paths) =>
    `Hard link(s) at ${paths.join(", ")}: --force does not clear it and there is no flagged ` +
    `text to fix — the write is refused again either way, by the merge gate on a file the ` +
    `engine merges a managed block into, by the backup gate on one it writes whole, and the ` +
    `merged-MCP lane takes no backup at all, so force has nothing to unlock there. Replace each ` +
    `with a regular file (copy the contents to a new file and move that over the name), or ` +
    `delete it and re-run to regenerate it.`,
};

/**
 * The refusal a collision-bearing plan throws without `--force`, with one
 * remedy sentence per class actually present.
 *
 * Branching is not cosmetic: `--force` clears exactly one of the three classes.
 * A deny-scan refusal re-raises at write time naming the flagged text, and a
 * hard-linked target has no flagged text at all — it is refused a second time
 * whichever lane the forced write takes (the per-lane gates are on
 * {@link CollisionKind}; this comment does not restate them). A single message
 * that offered `--force` and pointed at flagged text sent the operator of a
 * hard-link collision through a failing run to reach a remedy it never printed:
 * the copy-and-move fix lives in the entry's `detail`, and this throw path
 * prints no details.
 *
 * `entries` is the classification of record. A plan carrying collision paths
 * but no matching entries (a hand-built plan) falls back to the two classes
 * whose remedies are generic, rather than guessing one and naming files.
 */
function collisionRefusalMessage(plan: SyncPlan): string {
  const byKind = new Map<CollisionKind, string[]>();
  for (const entry of plan.entries) {
    if (entry.action !== "collision") continue;
    const kind = entry.collisionKind ?? "unmanaged-name";
    byKind.set(kind, [...(byKind.get(kind) ?? []), entry.path]);
  }
  const present = COLLISION_KIND_ORDER.filter((kind) => byKind.has(kind));
  const kinds: readonly CollisionKind[] =
    present.length > 0 ? present : ["unmanaged-name", "deny-scan"];
  return [
    `Sync refused: ${plan.collisions.length} existing file(s) would collide with generated ` +
      `output: ${plan.collisions.join(", ")}.`,
    ...kinds.map((kind) => COLLISION_REMEDY[kind](byKind.get(kind) ?? [])),
  ].join(" ");
}

/**
 * Apply a sync plan.
 *
 * Gate order: ledger containment of the planned rows (a shape-invalid path is
 * refused before any write — that one IS whole-plan, because a bad path shape
 * says the plan itself is wrong), then the per-path collision gate: unless
 * `force`, each colliding path is skipped with the remedy sentence for its
 * refusal class ({@link collisionRefusalMessage}) and every other path is
 * written. The refused paths come back on `SyncApplyReport.refused`, which is
 * what the command exits non-zero on. Force overwrites
 * unmanaged files behind a verified `.bak` and clears only that class: a
 * deny-scan refusal is re-raised at write time with the fix-the-text next step,
 * and a hard-linked target is refused a second time on whichever lane the write
 * takes ({@link CollisionKind} holds the per-lane gates) — the merged-MCP one
 * by `materializeUserMcpJson`'s own pre-read check, which is why that lane needs
 * a check of its own: it takes no backup to inherit a refusal from and would
 * otherwise let `--force` wave the plan's collision through.
 *
 * `dryRun` executes zero writes: counts come from the plan's verdicts and the
 * reclaim sweep runs in report-only mode (every actionable entry `dry-run`,
 * zero tallies).
 */
export async function applySync(
  rootDir: string,
  plan: SyncPlan,
  opts: { engineVersion: string; force: boolean; dryRun: boolean; now?: Date },
): Promise<SyncApplyReport> {
  const { engineVersion, force, dryRun } = opts;
  const now = opts.now ?? new Date();
  const statePath = manifestPath(rootDir);

  const prospective = toLedgerEntries(plannedRows(plan.outputs));
  assertLedgerContainment(prospective, rootDir);

  // The allowlist the sweep needs to act on block-less platform-named infra —
  // `.codex/config.toml`, `.cursor/hooks.json`, the copilot setup workflow.
  // Built from the PRE-rebuild ledger, which is the run's own record of what it
  // wrote under those names; without it the advertised tool-removal flow
  // (`config set tools <subset>` then `sync`) refuses every one of them as
  // `skipped-unsafe-path` in the same run that drops their rows, stranding live
  // config on disk that no later sync or clean can reach. `clean` passes the
  // identical set (`../clean.ts`) — one judgement of ownership, not two.
  const trustedPaths = trustedInfraPaths(plan.manifest.ledger);
  // Off `plan.manifest`, whose ledger is this run's pre-rebuild record — the
  // same rows `planSync` read the packs from, so the ownership set the write
  // uses is the one the preview was judged against. Resolved before both the
  // preview and the write loop: one read for the whole run, and it feeds the
  // sweep as well as the merge, since the sweep's co-owned lane asks the same
  // ownership question of the same three documents.
  const packMcpSupply = await installedPackServers(rootDir, plan.manifest);
  // The sweep's second allowlist. `.mcp.json`, `.cursor/mcp.json` and
  // `.vscode/mcp.json` are written by MERGING, so their recorded hash covers
  // emission ∪ the operator's own entries; handing the sweep a reducer is what
  // stops it reading a match as sole authorship and unlinking a document
  // carrying a hand-added server (`../../../merge/reclaim.ts` gate 4).
  const coOwnedPaths = mcpReclaimReducers(packMcpSupply);

  if (dryRun) {
    const reclaimed =
      plan.reclaim.length > 0
        ? await sweepReclaimCandidates(plan.reclaim, {
            rootDir,
            consent: false,
            trustedExactPaths: trustedPaths,
            coOwnedPaths,
            now,
          })
        : null;
    return {
      wrote: [],
      created: tally(plan.entries, "create"),
      updated: tally(plan.entries, "update"),
      unchanged: tally(plan.entries, "unchanged"),
      skipped: tally(plan.entries, "collision"),
      // Empty on a preview whatever the plan holds: a dry run refuses nothing
      // because it writes nothing, and the collision rows already carry the
      // "would refuse" marker the report reads.
      refused: [],
      reclaimed,
      manifestPath: statePath,
      dryRun: true,
      manifest: null,
    };
  }

  // The collision gate, applied PER PATH rather than to the whole plan.
  //
  // It used to throw, and the blast radius was the run: one file the operator
  // had edited refused all fifteen writes of a freshly re-installed pack, so
  // `add` exited 0, `sync` exited 1, and every projected file the pack needed
  // stayed absent — the pack installed and inert. Nothing about a collision at
  // one path says anything about the other fourteen: the colliding file is
  // exactly the one the engine must not touch, and the rest are its own output.
  //
  // So the refusal narrows to its own paths. They are never ATTEMPTED — a
  // pre-filter, not a caught write — which keeps the deny-scan class fail-closed
  // (its refusal throws from inside the writer) and keeps the run's partial
  // result deterministic. Each refused path returns a `skipped` row carrying the
  // whole-plan remedy sentence, the report counts them, and the command exits
  // non-zero, so a CI probe still fails on a collision it has not resolved.
  const refused = force ? new Set<string>() : new Set(plan.collisions);
  const refusalMessage = refused.size > 0 ? collisionRefusalMessage(plan) : null;

  // Ownership as of BEFORE this run (the ledger apply is about to rebuild), so
  // the write lane judges each path the same way the plan above predicted it.
  // The hash index comes off the SAME rows: ownership says the engine wrote the
  // path, the recorded hash says whether the bytes there are still the ones it
  // wrote, and only the pair licenses replacing a file with no `.bak`.
  const ownedPaths = ledgerPathSet(rootDir, plan.manifest.ledger.map((row) => row.path));
  const ownedHashes = ledgerHashIndex(rootDir, plan.manifest.ledger);

  const wrote: MergeResult[] = [];
  const emitted: EmittedArtifact[] = [];
  const selectedMcpServers = plan.manifest.mcp?.servers ?? [];
  for (const output of plan.outputs) {
    if (refused.has(output.path)) {
      // Reported, not written. The row carries the same disposition the writer
      // would have returned for this path, so `wrote[]` stays a complete
      // account of the plan and the ledger below skips it like any other
      // refused write.
      wrote.push({
        path: output.path,
        action: "skipped",
        warning: `Skipped ${output.path}. ${refusalMessage ?? ""}`.trim(),
      });
      continue;
    }
    const absPath = join(rootDir, output.path);
    const managedBody = extractManagedBlock(output.content, absPath);
    // A client's MCP JSON is shared ground: the operator hand-adds servers
    // beside the engine's and tunes top-level fields the client understands.
    // Writing the emitted document whole would delete all of it with no backup,
    // so these three paths merge by ownership instead (`manifest/mcpFilter.ts`).
    let result: MergeResult;
    // The bytes this run actually put on disk for `output.path`. Identical to
    // the emission for every whole-file write; on the merged MCP documents it
    // is emission ∪ the operator's preserved content, and hashing the emission
    // there would record a document that was never written (see below).
    let written = output.content;
    if (MERGED_MCP_JSON_PATHS.has(output.path)) {
      // The plan's `shared-name` collision is gated by `--force` above, and on
      // this lane force clears nothing real: the other two lanes survive a
      // forced run because the write they then attempt is refused again on its
      // own gate (see the `shared-name` bullet on CollisionKind), and this one
      // takes no backup to be refused by.
      // The re-proof against the bytes about to be read — rather than a plan the
      // operator can wave through — is `materializeUserMcpJson`'s own first act
      // now (`manifest/mcpFilter.ts::refuseLinkedMcpTarget`), so it holds for
      // `init` too and cannot be skipped by a caller that forgets it. The read
      // below is bytes into memory for `engineOwnedServerIds`, which returns
      // catalog ids and quotes nothing.
      const existing = await readIfExists(absPath);
      // `writtenContent` is destructured OFF the result rather than carried on
      // it: `wrote` is the public report, and `sync --format json` serializes
      // every row verbatim (`./report.ts`), so leaving it attached would print
      // three whole MCP documents into the payload. It is an internal hand-off
      // from the writer to the ledger below.
      const { writtenContent, ...merged } = await materializeUserMcpJson(
        absPath,
        output.content,
        engineOwnedServerIds(output.path, selectedMcpServers, existing, packMcpSupply),
      );
      result = merged;
      if (writtenContent !== null) written = writtenContent;
    } else {
      result = await safeWriteFile(absPath, output.content, writeOptions(managedBody, engineVersion, force, rootDir, ownedPaths, ownedHashes));
    }
    wrote.push({ ...result, path: output.path });
    // A skipped write left someone else's bytes in place — the engine did not
    // write the path this run, so it must not claim ownership of it. A written
    // co-owned output records one row PER owner (duplicate adapters collapsed
    // by `outputOwners`), all carrying the same hash of the single write —
    // the ledger's multi-owner rows keep a shared path alive until every
    // owner stops emitting it (src/manifest/ledger.ts).
    if (result.action === "skipped") continue;
    // Hashed off `written`, not off the emission. `contentHash` is consumed by
    // one reader — the reclaim sweep (`../../../merge/reclaim.ts` gates 2b/4) —
    // which re-hashes the file on disk to prove the engine wrote it and nobody
    // edited it since. For the three merged MCP documents the bytes on disk are
    // the merge's, so recording the emission's hash made the sweep read the
    // engine's own document as "edited since": a deselected client doc could
    // never be auto-reclaimed and stayed behind as user content forever.
    const contentHash = sha256(written);
    for (const owner of outputOwners(output)) {
      emitted.push({
        path: output.path,
        adapter: owner.adapter,
        artifactId: owner.artifactId,
        artifactType: owner.artifactType,
        contentHash,
        ...(managedBody !== null ? { stampedVersion: engineVersion } : {}),
      });
    }
  }

  // Rebuild the ledger over the full closed tool set: an active tool's rows
  // become exactly this run's emission, and a tool the user removed from the
  // manifest has its rows dropped — the same event that queued its files for
  // reclaim. Pack rows match no tool id and pass through untouched.
  const byTool = new Map<Tool, EmittedArtifact[]>();
  for (const row of emitted) {
    const rows = byTool.get(row.adapter) ?? [];
    rows.push(row);
    byTool.set(row.adapter, rows);
  }
  let ledger = plan.manifest.ledger;
  for (const tool of TOOLS) {
    ledger = replaceAdapterEntries(ledger, tool, toLedgerEntries(byTool.get(tool) ?? []));
  }

  const reclaimed =
    plan.reclaim.length > 0
      ? await sweepReclaimCandidates(plan.reclaim, {
          rootDir,
          consent: true,
          trustedExactPaths: trustedPaths,
          coOwnedPaths,
          now,
        })
      : null;

  // The state scaffold, restored on every live sync — the same helper init
  // runs. `check`'s state-dirs row names THIS verb as its remedy, and it named
  // `init` while init hard-refused an initialised repo and created nothing, so
  // a clone that arrived without the two writable subdirectories had no command
  // that would put them back (`../../../emit/stateScaffold.ts`).
  //
  // Here rather than at the top of the apply: a run that throws mid-write must
  // leave no trace it did not already have, and this is the last step before
  // the commit point below.
  await ensureStateScaffold(rootDir);

  // Manifest LAST — the commit point. Persists the migrated shape, the
  // refreshed selection + detection, the rebuilt ledger, and the new stamps.
  const manifest: SetupManifest = {
    ...plan.manifest,
    generatedBy: engineVersion,
    updatedAt: now.toISOString(),
    ledger,
  };
  await writeManifest(rootDir, manifest, { now });

  const done = (action: MergeResult["action"]): number =>
    wrote.filter((result) => result.action === action).length;
  return {
    wrote,
    created: done("created"),
    updated: done("updated"),
    unchanged: done("unchanged"),
    skipped: done("skipped"),
    refused: [...refused],
    reclaimed,
    manifestPath: statePath,
    dryRun: false,
    manifest,
  };
}
