import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { buildContentIndex } from "../../../content/catalog.ts";
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
import { OWNED_PATHS } from "../../../manifest/ownedPaths.ts";
import { materializeUserMcpJson } from "../../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../../mcp/catalog.ts";
import { engineOwnedServerIds, MERGED_MCP_JSON_PATHS } from "../../../mcp/emit.ts";
import { ensureGitignoreEntry } from "../../../mcp/env.ts";
import { isSharedRegularFile } from "../../../merge/atomicWrite.ts";
import { extractManagedBlock, hasOwnerTextOutsideBlock } from "../../../merge/managedBlocks.ts";
import { sweepReclaimCandidates, type ReclaimReport } from "../../../merge/reclaim.ts";
import {
  ledgerHashIndex,
  ledgerPathSet,
  predictMergeAction,
  predictPreservedContentRefusal,
  safeWriteFile,
  type MergeAction,
} from "../../../merge/safeWrite.ts";
import { outputOwners, type AdapterOutput, type MergeResult } from "../../../types/content.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import type { DetectedSummary } from "../../../types/detect.ts";
import { EngineError } from "../../../types/errors.ts";
import {
  MANIFEST_FILE,
  type CoOwnership,
  type ImportDecision,
  type LedgerEntry,
  type SetupManifest,
} from "../../../types/manifest.ts";
import { STATE_DIR } from "../../../types/markers.ts";
import { ensureStateScaffold } from "../../../emit/stateScaffold.ts";
import { getEmissionPlanner } from "../../engine/emission.ts";
import {
  coOwnedDocumentLanes,
  coOwnedOwnershipOf,
  coOwnedRowsCarriedThroughRefusal,
  hookScriptRetention,
  coOwnedReclaimReducers,
  coOwnedReclaimRenderings,
  engineRenderingsFor,
  fullCorpusSelection,
  installedPackServers,
  type CoOwnedDocumentLane,
  type EmissionPlanFor,
  type RenderingProof,
  ledgerRowsForOutput,
  outputWriteOptions,
  predictMcpDocumentMerge,
  readIfExists,
  rowsCarriedThroughSweep,
  sha256,
} from "../../engine/emissionWrite.ts";
import { readWorkingTreeStatus, type WorkingTreeStatus } from "../../engine/gitStatus.ts";
import { hasNpmChannel, packageCommand, packageName, registryOption } from "../../kit/packageName.ts";
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
 *   merged-MCP lane ahead of its own read, where force plays no part.
 * - `linked-source` — the output repeats ANOTHER file's bytes (the codex
 *   `AGENTS.override.md` repeating the operator's `AGENTS.md`), and that file
 *   is a symbolic or hard link. Declared by the producer on the row
 *   (`AdapterOutput.sourceRefusal`), as is a `deny-scan` hit on those bytes;
 *   both hold under `--force`, because {@link applySync} never attempts a row
 *   that carries one.
 * - `import-decision` — a whole-file engine output at an instruction file
 *   `init` imports (`OWNED_PATHS.importTargets`) whose existing bytes hold the
 *   owner's text outside the engine's managed block: the shape only a
 *   `supplement` import leaves, under a manifest that records another decision
 *   or none (REQ-PLUGIN-046). The manifest is committed and cannot be
 *   authenticated, so the recorded decision does not get to replace the
 *   owner's text. Not force-overridable: {@link applySync} never attempts the
 *   row under `--force` either, and the remedy is restoring `supplement` or
 *   `init --force --import-config replace`, which backs the file up first.
 * - `co-owned-shape` — a document the engine writes ENTRY BY ENTRY
 *   (`../../engine/emissionWrite.ts::coOwnedDocumentLanes`, REQ-FLOW-036)
 *   that is not a JSON object, cannot be serialised back, or holds a member
 *   the engine writes into with another type. Nothing in it is the engine's
 *   to replace, so there is no force on that lane: {@link applySync} never
 *   attempts the row under `--force` either, and the entry's detail names the
 *   member and the fix.
 *
 * The per-lane account above is this file's only one. Every other comment here
 * defers to it or scopes itself to a single lane in its opening words, and
 * {@link COLLISION_REMEDY}'s `shared-name` sentence says the same thing to the
 * operator — a second, differently-worded mechanism is a defect, not a variant.
 */
type CollisionKind =
  | "unmanaged-name"
  | "deny-scan"
  | "shared-name"
  | "linked-source"
  | "import-decision"
  | "co-owned-shape";

/** One planned path and the disposition the apply run would give it. */
export interface SyncPlanEntry {
  /** Repo-relative POSIX path of the planned output. */
  path: string;
  /**
   * `collision` = an existing file the merge would refuse or skip, or a row
   * whose producer refused the bytes it repeats. Which refusal class is in
   * `collisionKind`; the operator-facing text is in `detail`.
   */
  action: "create" | "update" | "unchanged" | "collision";
  adapter: string;
  artifactId: string;
  /** Present on collisions: the refusal class, for callers that branch. */
  collisionKind?: CollisionKind;
  /**
   * `true` on a collision whose cause is the file this row repeats, refused by
   * its producer (`AdapterOutput.sourceRefusal`): moving this path aside or
   * `--force` does not clear it, and `detail` names the file to repair.
   * Absent on every other entry.
   */
  refusedAtSource?: true;
  /**
   * Present when the client would reject the document as the write leaves it
   * (S19: an entry of `.cursor/hooks.json` Cursor refuses, whoever wrote it;
   * S16: a kept `.codex/config.toml` key that turns Codex's hooks off): the
   * entries or the key, and the remedy. Not a collision — `sync` writes and
   * warns — but `check` fails on it, since the client then runs none of the
   * file's hooks.
   */
  rejected?: string;
  /**
   * Present on collisions: why, and what unblocks the write. Carries the write
   * lane's own refusal message verbatim for the classes that have one, and the
   * producer's for a source refusal.
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
  /**
   * The running engine's version the plan was built with — what
   * {@link previewReclaim} renders the engine's output with for the reclaim
   * sweep's rendering proof (REQ-PLUGIN-046). Optional in the TYPE only, for
   * the same hand-built fixtures as {@link warnings}; {@link planSync} always
   * sets it. A plan without it previews no rendering, so a file that needs one
   * previews as kept.
   */
  engineVersion?: string;
}

/** Concurrent per-output prediction reads; mirrors the catalog's read bound. */
const PREDICT_CONCURRENCY = 8;

const ACTION_OF: Record<MergeAction, SyncPlanEntry["action"]> = {
  created: "create",
  updated: "update",
  unchanged: "unchanged",
  skipped: "collision",
};

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
 * `../../engine/emissionWrite.ts::predictMcpDocumentMerge` (which previews
 * `predictMcpMergeRefusal`), each single-sourced from the writer that throws it.
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

/** The `import-decision` collision's detail: what the bytes and the record each say, and the two remedies. */
function importDecisionDetail(path: string, decisions: readonly ImportDecision[] | undefined): string {
  const mode = (decisions ?? []).findLast((decision) => decision.path === path)?.mode;
  const recorded = mode === undefined ? "no decision" : `\`${mode}\``;
  return (
    `${path} holds your text outside the engine's managed block, the shape a \`supplement\` import ` +
    `leaves, but the manifest records ${recorded} for it, so sync would replace your text. Restore ` +
    `\`supplement\` for this path in ${STATE_DIR}/${MANIFEST_FILE}, or run ` +
    `${packageCommand("init --force --import-config replace")} to replace it behind a verified .bak.`
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
  /** The co-owned document lanes and the ledger they judge ownership from; none registered and an empty ledger when absent. */
  coOwned?: { lanes: ReadonlyMap<string, CoOwnedDocumentLane>; ledger: readonly LedgerEntry[] },
  /** The manifest's recorded import decisions, named in an `import-decision` collision's detail; none when absent. */
  importDecisions?: readonly ImportDecision[],
): Promise<SyncPlanEntry[]> {
  const lanes = coOwned?.lanes ?? coOwnedDocumentLanes(null);
  const ledger = coOwned?.ledger ?? [];
  // The same whole-file hashes the write lane judges by (`applySync`), so the
  // prediction — what `check` and `--dry-run` show — is exactly the write.
  const ledgerHashes = ledgerHashIndex(rootDir, ledger);
  return pLimit(PREDICT_CONCURRENCY).map([...outputs], async (output) => {
    const absPath = join(rootDir, output.path);
    const managedBody = extractManagedBlock(output.content, absPath);
    const base = {
      path: output.path,
      adapter: output.owner.adapter,
      artifactId: output.owner.artifactId,
    };
    // A refusal the producer already made on the bytes this row republishes:
    // the plan states it as the row's collision, so `check` and `sync` agree.
    if (output.sourceRefusal !== undefined) {
      return {
        ...base,
        action: "collision" as const,
        collisionKind: output.sourceRefusal.kind,
        detail: output.sourceRefusal.message,
        refusedAtSource: true as const,
      };
    }
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
      // The prediction runs the real merge over the bytes, so an already-current
      // document reports `unchanged` and the drift gate stays clean; the
      // refusal check inside it runs ahead of the read, so no linked byte is
      // read or quoted. Both are `../../engine/emissionWrite.ts`'s now rather
      // than this lane's: `init`'s dry run has to preview these three paths the
      // same way, and it predicted them from mere existence for as long as the
      // mechanism lived here.
      const predicted = await predictMcpDocumentMerge(
        absPath,
        output.path,
        output.content,
        mcpServers ?? [],
        packServers ?? [],
      );
      if (predicted.refusal !== null) {
        return {
          ...base,
          action: "collision" as const,
          collisionKind: "shared-name" as const,
          detail: predicted.refusal,
        };
      }
      return { ...base, action: ACTION_OF[predicted.result.action] };
    }
    // A document co-owned ENTRY BY ENTRY (`.claude/settings.json`): the
    // client's install record and the owner's own members, rows and entries
    // sit beside the engine's (`../../engine/emissionWrite.ts::coOwnedDocumentLanes`).
    // The prediction runs the real merge over the current bytes, so an owner
    // entry added since the last write is neither drift nor a collision; what
    // collides is a shape the engine cannot merge beside (`co-owned-shape`,
    // which nothing but fixing the member clears) and a linked target
    // (`shared-name`, which nothing clears).
    const lane = lanes.get(output.path);
    if (lane !== undefined) {
      const predicted = await lane.predict(absPath, output.content, coOwnedOwnershipOf(ledger, output.path, { boundaryDir: rootDir, ledgerHashes }));
      if (predicted.collision !== null) {
        return {
          ...base,
          action: "collision" as const,
          collisionKind: predicted.collision.kind,
          detail: predicted.collision.detail,
        };
      }
      return {
        ...base,
        action: ACTION_OF[predicted.result.action],
        ...(predicted.rejected === undefined ? {} : { rejected: predicted.rejected }),
      };
    }
    const existing = await readIfExists(absPath);
    // A whole-file write (a row with no managed block) over an instruction
    // file whose owner text sits outside the engine's block would replace
    // that text, whatever the ledger proves: the block is the engine's, the
    // rest is the owner's. The row carries no block only because the manifest
    // records no `supplement` for its path (`../../../emit/planner.ts` wraps
    // the row in a block under one), so the record and the bytes disagree,
    // and the bytes win (REQ-PLUGIN-046).
    if (
      managedBody === null &&
      existing !== null &&
      OWNED_PATHS.importTargets.includes(output.path) &&
      hasOwnerTextOutsideBlock(existing, absPath)
    ) {
      return {
        ...base,
        action: "collision" as const,
        collisionKind: "import-decision" as const,
        detail: importDecisionDetail(output.path, importDecisions),
      };
    }
    // The prediction is pure — `boundaryDir` is inert here — but it is built
    // from the same call so the plan and the apply cannot drift apart.
    const action = predictMergeAction(existing, output.content, outputWriteOptions(managedBody, engineVersion, false, rootDir, ledgerPaths), absPath);
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
  opts: { runner?: GitRunner; packageName?: string; npmChannel?: boolean; npmRegistry?: string } = {},
): Promise<SyncPlan> {
  const manifest = await readManifest(rootDir);
  if (manifest === null) {
    throw new EngineError(
      `This repository is not initialised — run: ${packageCommand("init")}. Sync regenerates from ` +
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
    // The package every pinned CLI call names: this installation's own, read
    // from its manifest, so a renamed fork's emission runs the fork. A caller
    // pins another only to render checkout-independent bytes (the goldens).
    packageName: opts.packageName ?? packageName(),
    // Off the same manifest read as the name; a caller pinning the name pins
    // this beside it. A registry-less fork renders `npx --no`.
    npmChannel: opts.npmChannel ?? hasNpmChannel(),
    // A `--registry` fork's scope registry, off the same read. A caller pinning
    // the name pins this beside it, so a pinned name never meets the
    // checkout's registry (REQ-PLUGIN-048).
    ...registryOption(opts),
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
    { lanes: coOwnedDocumentLanes(manifest, packServers), ledger: manifest.ledger },
    manifest.importChoice,
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
    engineVersion,
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
   * Empty on a dry run. Under `--force` it holds only the rows refused at
   * their source (`SyncPlanEntry.refusedAtSource`) and the `import-decision`
   * collisions, which force does not clear; force clears the one class it can
   * and lets the writer judge the rest.
   *
   * Non-empty means the run did real work AND left something undone, which is
   * a state the report had no way to express while a single collision threw the
   * whole plan away. The command reads it for its exit code.
   */
  refused: string[];
  /**
   * The `.gitignore` lines this run appended (REQ-FLOW-016), so an edit to a
   * file the operator owns is named rather than silent. Empty when every entry
   * was already covered, and on a dry run, which does not touch the file.
   */
  gitignoreAdded?: string[];
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

/**
 * The reclaim sweep a sync of `plan` would run, run without consent: every
 * candidate passes gates 1-4 and comes back with the action consent would take
 * (`wouldBe`) and its proof, or with the refusal. Writes nothing; `null` when
 * the plan queues no candidate.
 *
 * One body for the two readers that preview a sync — `applySync({ dryRun })`
 * and `check`'s drift gate (REQ-PLUGIN-045) — so `sync --dry-run --json` and
 * `check --json` name the same paths with the same actions. Both allowlists
 * come off `plan.manifest`, the run's pre-rebuild ledger, exactly as the live
 * sweep builds them in {@link applySync}.
 *
 * The live sweep runs after the write loop, so it reads each hooks document as
 * this sync wrote it; this preview runs before any write, so it reads each one
 * the plan writes as the write will leave it ({@link hookDocumentsAfterWrite},
 * review/68). A script the write stops naming — a guard renamed by a release —
 * then previews as the delete `sync -y` makes, not as "Kept".
 *
 * The rendering proof reads the same renderings the live sweep does
 * ({@link reclaimRenderings}), built with `engineVersion` — the plan's own
 * unless the caller names one.
 */
export async function previewReclaim(
  rootDir: string,
  plan: SyncPlan,
  now?: Date,
  engineVersion: string | undefined = plan.engineVersion,
): Promise<ReclaimReport | null> {
  if (plan.reclaim.length === 0) return null;
  const packMcpSupply = await installedPackServers(rootDir, plan.manifest);
  const retention = hookScriptRetention(plan.manifest, packMcpSupply);
  return sweepReclaimCandidates(plan.reclaim, {
    rootDir,
    consent: false,
    trustedExactPaths: trustedInfraPaths(plan.manifest.ledger),
    coOwnedPaths: coOwnedReclaimReducers(plan.manifest, packMcpSupply, await coOwnedReclaimRenderings(rootDir, plan.manifest)),
    ...retention,
    hookDocumentsAfterWrite: await hookDocumentsAfterWrite(rootDir, plan, retention.hookDocuments, coOwnedDocumentLanes(plan.manifest, packMcpSupply)),
    ...(await reclaimRenderings(rootDir, plan, engineVersion)),
    ...(now === undefined ? {} : { now }),
  });
}

/**
 * The renderings the sweep's rendering proof reads for `plan`'s candidates
 * (`../../engine/emissionWrite.ts::engineRenderingsFor`), off the run's
 * pre-rebuild manifest; none without an engine version, so a file that needs
 * one is kept.
 */
async function reclaimRenderings(
  rootDir: string,
  plan: SyncPlan,
  engineVersion: string | undefined,
): Promise<RenderingProof> {
  if (engineVersion === undefined) return { renderings: new Map() };
  return engineRenderingsFor(
    rootDir,
    plan.manifest,
    plan.reclaim.map((candidate) => candidate.entry.path),
    renderingPlanner(rootDir, engineVersion),
  );
}

/**
 * The planner call the rendering proof plans the setup's clients with: the context
 * {@link planSync} builds its own plan with, this installation's package
 * identity included. `clean` (`../clean.ts`) builds the same call; the layering
 * keeps the two verbs from sharing one (`test/architecture`).
 */
function renderingPlanner(rootDir: string, engineVersion: string): EmissionPlanFor {
  return (manifest, facts) =>
    getEmissionPlanner().plan({
      rootDir,
      manifest,
      engineVersion,
      packageName: packageName(),
      npmChannel: hasNpmChannel(),
      ...registryOption({}),
      facts,
    });
}

/**
 * The text each hooks document in `hookDocuments` holds once `plan`'s write
 * lands, for the documents that write touches: a co-owned one as its lane
 * predicts the merge (the same prediction `planOutputEntries` makes, over the
 * same ledger hashes), a whole-file one (Copilot's) as the emitted bytes. A
 * document the plan refuses (`collision`) or does not plan is left out, so the
 * preview reads it from disk exactly as the live sweep will.
 */
async function hookDocumentsAfterWrite(
  rootDir: string,
  plan: SyncPlan,
  hookDocuments: ReadonlySet<string>,
  lanes: ReadonlyMap<string, CoOwnedDocumentLane>,
): Promise<Map<string, string>> {
  const ledgerHashes = ledgerHashIndex(rootDir, plan.manifest.ledger);
  const written = plan.outputs.filter(
    (output) =>
      hookDocuments.has(output.path) &&
      plan.entries.some((entry) => entry.path === output.path && entry.action !== "collision"),
  );
  const texts = await Promise.all(
    written.map(async (output): Promise<[string, string | null | undefined]> => {
      const lane = lanes.get(output.path);
      if (lane === undefined) return [output.path, output.content];
      const predicted = await lane.predict(
        join(rootDir, output.path),
        output.content,
        coOwnedOwnershipOf(plan.manifest.ledger, output.path, { boundaryDir: rootDir, ledgerHashes }),
      );
      return [output.path, predicted.after];
    }),
  );
  return new Map(texts.flatMap(([path, text]) => (typeof text === "string" ? [[path, text] as const] : [])));
}

/**
 * The pre-run ledger rows for `path` whose recorded hash still matches the
 * regular file on disk — the proof the engine wrote those bytes, carried into
 * the rebuilt ledger for a row this run refused to rewrite. A link, a missing
 * file, a pack row or a row with no hash proves nothing and is not kept.
 */
async function rowsStillProvenOnDisk(
  rootDir: string,
  ledger: readonly LedgerEntry[],
  path: string,
): Promise<EmittedArtifact[]> {
  const rows = ledger.filter((row) => row.path === path && row.contentHash !== undefined);
  if (rows.length === 0) return [];
  const absPath = join(rootDir, path);
  try {
    const entry = await lstat(absPath);
    if (!entry.isFile() || isSharedRegularFile(entry)) return [];
  } catch {
    return [];
  }
  const existing = await readIfExists(absPath);
  if (existing === null) return [];
  const hash = sha256(existing);
  const kept: EmittedArtifact[] = [];
  for (const row of rows) {
    if (row.contentHash !== hash || !(TOOLS as readonly string[]).includes(row.adapter)) continue;
    kept.push({ ...row, adapter: row.adapter as Tool });
  }
  return kept;
}

/** Fixed sentence order, so a mixed plan reads the same way every run. */
const COLLISION_KIND_ORDER = [
  "unmanaged-name",
  "deny-scan",
  "shared-name",
  "linked-source",
  "import-decision",
  "co-owned-shape",
] as const;

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
  "linked-source": (paths) =>
    `${paths.join(", ")} repeat(s) another file that is a symbolic or hard link: --force does not ` +
    `clear it. Replace the linked file the plan entry's detail names with a regular file, then ` +
    `re-run.`,
  "import-decision": () =>
    `An import-decision collision is never force-overridable — see the plan entry's detail.`,
  "co-owned-shape": (paths) =>
    `${paths.join(", ")}: the engine adds its entries beside yours there and cannot read where they go; ` +
    `each plan entry's detail names the member and the fix. --force does not clear it.`,
};

/**
 * One line per refusal class among `refused`, each naming the remedy that
 * clears it. Split by remedy: a row refused at its source is the engine's own
 * file, and neither moving it aside nor --force clears it; nor does --force
 * clear an instruction file whose owner text the recorded import decision
 * would replace (REQ-PLUGIN-046), whose remedy is the decision itself. Shared
 * by `sync` and `workspace sync`, so a member's refusal names the same remedy.
 */
export function refusalRemedyLines(plan: SyncPlan, refused: readonly string[]): string[] {
  const lines: string[] = [];
  const atSource = new Set(plan.outputs.filter((output) => output.sourceRefusal !== undefined).map((output) => output.path));
  const byDecision = new Set(
    plan.entries.filter((entry) => entry.collisionKind === "import-decision").map((entry) => entry.path),
  );
  const byShape = new Set(
    plan.entries.filter((entry) => entry.collisionKind === "co-owned-shape").map((entry) => entry.path),
  );
  const unproven = refused.filter((path) => !atSource.has(path) && !byDecision.has(path) && !byShape.has(path));
  const sourceRefused = refused.filter((path) => atSource.has(path));
  const decisionRefused = refused.filter((path) => !atSource.has(path) && byDecision.has(path));
  const shapeRefused = refused.filter((path) => !atSource.has(path) && byShape.has(path));
  if (unproven.length > 0) {
    lines.push(
      `${unproven.length} file(s) were NOT written — they collide with files the engine ` +
        `cannot prove it wrote (named above). Everything else in the plan is on disk. Move each ` +
        `aside and re-run, or re-run with --force to overwrite them after a verified .bak.`,
    );
  }
  if (sourceRefused.length > 0) {
    lines.push(
      `${sourceRefused.length} file(s) were NOT written — ${sourceRefused.join(", ")} repeat(s) a ` +
        `file the engine refused to republish (the reason is named above). Everything else in the ` +
        `plan is on disk. --force does not clear this: repair that file as the warning says — a ` +
        `regular, unlinked file with no flagged text — then run sync.`,
    );
  }
  if (decisionRefused.length > 0) {
    lines.push(
      `${decisionRefused.length} file(s) were NOT written — ${decisionRefused.join(", ")} hold(s) your ` +
        `text beside the engine's managed block, and the manifest's import decision would replace it ` +
        `(named above). Everything else in the plan is on disk. --force does not clear this: restore ` +
        `\`supplement\` for the path under importChoice in ${STATE_DIR}/${MANIFEST_FILE} and run sync, or run ` +
        `${packageCommand("init --force --import-config replace")} to replace it behind a verified .bak.`,
    );
  }
  if (shapeRefused.length > 0) {
    lines.push(
      `${shapeRefused.length} file(s) were NOT written — ${shapeRefused.join(", ")} hold(s) a member the ` +
        `engine writes its entries into with another type, or is not a JSON object it can merge beside ` +
        `(named above). Everything else in the plan is on disk. --force does not clear this: fix the member ` +
        `the warning names, or delete the file, then run sync.`,
    );
  }
  return lines;
}

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
 * zero tallies). `.gitignore` is not touched either.
 *
 * A live run puts the engine's required ignore entries in place
 * ({@link ensureGitignoreEntry}) BEFORE the first emitted file is written, so a
 * repository set up before an entry existed gains it on its next sync, and a
 * `.gitignore` the lane refuses to republish (a link, a shared hard link, a
 * block-severity injection pattern in the bytes it would keep) stops the run
 * with nothing written.
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

  if (dryRun) {
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
      gitignoreAdded: [],
      reclaimed: await previewReclaim(rootDir, plan, now, engineVersion),
      manifestPath: statePath,
      dryRun: true,
      manifest: null,
    };
  }

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
  // uses is the one the preview was judged against. Resolved before the write
  // loop: one read for the whole run, and it feeds the sweep as well as the
  // merge, since the sweep's co-owned lane asks the same ownership question of
  // the same three documents. A dry run reads the same set through
  // {@link previewReclaim}.
  const packMcpSupply = await installedPackServers(rootDir, plan.manifest);
  // The sweep's second allowlist. `.mcp.json`, `.cursor/mcp.json` and
  // `.vscode/mcp.json` are written by MERGING, so their recorded hash covers
  // emission ∪ the operator's own entries; handing the sweep a reducer is what
  // stops it reading a match as sole authorship and unlinking a document
  // carrying a hand-added server (`../../../merge/reclaim.ts` gate 4).
  const coOwnedPaths = coOwnedReclaimReducers(plan.manifest, packMcpSupply, await coOwnedReclaimRenderings(rootDir, plan.manifest));

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
  // A row whose producer refused its source is never attempted, forced or not.
  // Nor, forced or not, is a path whose owner text the recorded import
  // decision would replace (`import-decision`, REQ-PLUGIN-046), or a co-owned
  // document the engine cannot merge its entries into (`co-owned-shape`,
  // REQ-FLOW-036): nothing in it is the engine's to replace.
  const refused = force
    ? new Set([
        ...plan.outputs.filter((output) => output.sourceRefusal !== undefined).map((output) => output.path),
        ...plan.entries
          .filter((entry) => entry.collisionKind === "import-decision" || entry.collisionKind === "co-owned-shape")
          .map((entry) => entry.path),
      ])
    : new Set(plan.collisions);
  const refusalMessage = refused.size > 0 ? collisionRefusalMessage(plan) : null;
  // An import-decision row's own detail names its remedy (restore `supplement`,
  // or `init --force --import-config replace`); the whole-plan message names
  // every class present and offers `--force` for the ones it clears, which is
  // false for this row, forced or not.
  // A co-owned-shape row's detail names the member and the fix the same way,
  // and the whole-plan message would offer `--force` beside it.
  const importDecisionDetails = new Map(
    plan.entries
      .filter((entry) => entry.collisionKind === "import-decision" || entry.collisionKind === "co-owned-shape")
      .map((entry) => [entry.path, entry.detail]),
  );

  // The ignore rules first (REQ-FLOW-016): the review gate writes its counter,
  // lock and temp files on every round, and a sync is the verb an existing
  // repository runs after an upgrade. Ahead of the write loop rather than after
  // it, because this lane can REFUSE — and a refusal that landed after the
  // emitted files would leave a half-applied run with no manifest to account
  // for it. `--force` does not reach it: none of its refusals is a collision.
  const gitignoreAdded = await ensureGitignoreEntry(rootDir);

  // Ownership as of BEFORE this run (the ledger apply is about to rebuild), so
  // the write lane judges each path the same way the plan above predicted it.
  // The hash index comes off the SAME rows: ownership says the engine wrote the
  // path, the recorded hash says whether the bytes there are still the ones it
  // wrote, and only the pair licenses replacing a file with no `.bak`.
  const ownedPaths = ledgerPathSet(rootDir, plan.manifest.ledger.map((row) => row.path));
  const ownedHashes = ledgerHashIndex(rootDir, plan.manifest.ledger);
  const coOwnedLanes = coOwnedDocumentLanes(plan.manifest, packMcpSupply);

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
        warning:
          `Skipped ${output.path}. ${output.sourceRefusal?.message ?? importDecisionDetails.get(output.path) ?? refusalMessage ?? ""}`.trim(),
      });
      // A source refusal leaves the engine's own last write on disk, unlike an
      // unmanaged-name skip, so the rows that prove it stay: the next sync after
      // the source is repaired updates the file, and a deselection reclaims it.
      if (output.sourceRefusal !== undefined) {
        emitted.push(...(await rowsStillProvenOnDisk(rootDir, plan.manifest.ledger, output.path)));
      } else if (coOwnedLanes.has(output.path)) {
        // A co-owned document this run refused keeps its rows and record whole.
        emitted.push(...coOwnedRowsCarriedThroughRefusal(plan.manifest.ledger, output.path));
      }
      continue;
    }
    const absPath = join(rootDir, output.path);
    const managedBody = extractManagedBlock(output.content, absPath);
    // A client's MCP JSON is shared ground: the operator hand-adds servers
    // beside the engine's and tunes top-level fields the client understands.
    // Writing the emitted document whole would delete all of it with no backup,
    // so these three paths merge by ownership instead (`manifest/mcpFilter.ts`).
    let result: MergeResult;
    // The bytes this run actually put on disk for `output.path` WHERE THEY
    // DIFFER from the emission — `null` for every whole-file write, and the
    // merged document (emission ∪ the operator's preserved content) on the three
    // MCP paths. It is the ledger's hash input below, and hashing the emission
    // there would record a document that was never written.
    let written: string | null = null;
    // What the engine owns INSIDE a co-owned document after this write — the
    // record the ledger row carries (REQ-FLOW-036); absent on every other lane.
    let coOwnedRecord: CoOwnership | undefined;
    const coOwnedLane = coOwnedLanes.get(output.path);
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
    } else if (coOwnedLane !== undefined) {
      // Entry-level ownership (`../../engine/emissionWrite.ts::coOwnedDocumentLanes`):
      // the engine's entries are regenerated, every other member, row and entry
      // survives in place, and the ledger hashes the MERGED bytes below exactly
      // as it does for the MCP lane, beside the record of the engine's entries.
      // `force` does not reach this lane: a shape it cannot merge beside is
      // refused above, forced or not.
      const { writtenContent, writtenRecord, ...merged } = await coOwnedLane.materialize(
        absPath,
        output.content,
        coOwnedOwnershipOf(plan.manifest.ledger, output.path, { boundaryDir: rootDir, ledgerHashes: ownedHashes }),
      );
      result = merged;
      if (writtenContent !== null) written = writtenContent;
      if (writtenRecord !== null) coOwnedRecord = writtenRecord;
    } else {
      result = await safeWriteFile(absPath, output.content, outputWriteOptions(managedBody, engineVersion, force, rootDir, ownedPaths, ownedHashes));
    }
    wrote.push({ ...result, path: output.path });
    // A skipped write left someone else's bytes in place — the engine did not
    // write the path this run, so it must not claim ownership of it. That gate
    // is here, in the loop that knows the disposition; everything the row itself
    // says — the per-owner expansion, the hash-off-WRITTEN-bytes rule, the
    // conditional version stamp — is
    // `../../engine/emissionWrite.ts::ledgerRowsForOutput`, the one builder
    // `init` records through as well, so the same emission yields the same
    // ledger whichever verb produced it.
    if (result.action === "skipped") {
      // The same carry for a co-owned refusal the write itself made.
      if (coOwnedLane !== undefined) emitted.push(...coOwnedRowsCarriedThroughRefusal(plan.manifest.ledger, output.path));
      continue;
    }
    emitted.push(...ledgerRowsForOutput(output, written, managedBody, engineVersion, coOwnedRecord));
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
          ...hookScriptRetention(plan.manifest, packMcpSupply),
          ...(await reclaimRenderings(rootDir, plan, engineVersion)),
          now,
        })
      : null;
  // A document the sweep refused to reduce, and each script a kept hooks
  // document still runs, keep their pre-run rows (review/75, review/91).
  ledger = [...ledger, ...rowsCarriedThroughSweep(plan.manifest.ledger, reclaimed, coOwnedPaths)];

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
    gitignoreAdded,
    reclaimed,
    manifestPath: statePath,
    dryRun: false,
    manifest,
  };
}
