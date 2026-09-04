import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildContentIndex } from "../../../content/catalog.ts";
import { resolveBundledContentRoot } from "../../../content/contentRoot.ts";
import {
  replaceAdapterEntries,
  toLedgerEntries,
  type EmittedArtifact,
} from "../../../manifest/ledger.ts";
import {
  applyPreservedManifestFields,
  createManifest,
  manifestPath,
  readManifest,
  writeManifest,
} from "../../../manifest/manifest.ts";
import { ensureStateScaffold } from "../../../emit/stateScaffold.ts";
import { materializeUserMcpJson, type McpMergeResult } from "../../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../../mcp/catalog.ts";
import { engineOwnedServerIds, MERGED_MCP_JSON_PATHS } from "../../../mcp/emit.ts";
import { ensureGitignoreEntry } from "../../../mcp/env.ts";
import { extractManagedBlock } from "../../../merge/managedBlocks.ts";
import {
  ledgerHashIndex,
  ledgerPathSet,
  predictMergeAction,
  safeWriteFile,
} from "../../../merge/safeWrite.ts";
import type { PredecessorDefaults } from "../../../migration/carry.ts";
import { packDirRelPath } from "../../../pack/receipt.ts";
import type { ContentSelection, MergeResult } from "../../../types/content.ts";
import type { Tool } from "../../../types/core.ts";
import { EngineError } from "../../../types/errors.ts";
import {
  isPackOwner,
  PACK_OWNER_PREFIX,
  type ImportDecision,
  type LedgerEntry,
  type McpConfig,
  type SetupManifest,
} from "../../../types/manifest.ts";
import { STATE_DIR } from "../../../types/markers.ts";
import { getEmissionPlanner } from "../../engine/emission.ts";
import {
  installedPackServers,
  ledgerRowsForOutput,
  outputWriteOptions,
  predictMcpDocumentMerge,
  readIfExists,
} from "../../engine/emissionWrite.ts";
import { fullCoreSelection, type InitDecisions } from "./plan.ts";

/**
 * The write half of init: everything `./plan.ts` decided, made real. Still no
 * commander and no readline — the wave-2 command wraps both halves.
 *
 * Order is the contract. The manifest is written LAST, because the manifest is
 * the commit point: its ledger claims ownership over emitted paths, so a run
 * that fails mid-emission must leave no manifest asserting claims the tree
 * does not back. Before it land, in order: state directories, planned emission
 * outputs (each through the merge engine, so a pre-existing file is merged or
 * skipped, never clobbered), and the `.env.mcp` gitignore rule — the single
 * gitignore entry this engine owns; the state directory itself is committed by
 * design.
 *
 * `dryRun: true` computes the identical report — directories that would be
 * created, per-file merge dispositions via the writer's own predictor — and
 * touches nothing: no directory, no file, no gitignore line, no manifest.
 */

/** Inputs for {@link applyInit}. `now` is the injected clock for byte-stable output. */
export interface InitApplyOptions {
  rootDir: string;
  decisions: InitDecisions;
  /** Predecessor-manifest defaults offered by a guided migration; absent otherwise. */
  defaults?: PredecessorDefaults;
  /**
   * What to do with the agent-instruction files the repo already had — one
   * decision per path the command found to decide about, all carrying the mode
   * the operator was asked once for. Persisted on the manifest, because the
   * decision has to bind every later `sync`, not just this run. An empty list
   * and an absent field mean the same thing (nothing pre-existed) and both
   * leave the manifest key off.
   */
  importChoice?: readonly ImportDecision[];
  engineVersion: string;
  dryRun: boolean;
  force: boolean;
  now?: Date;
}

/** What an apply did — or, under `dryRun`, would do. */
export interface InitApplyReport {
  /** Absolute path of the manifest (written, or that would be written). */
  manifestPath: string;
  /** Repo-relative state directories this run created (existing ones are not listed). */
  createdDirs: string[];
  /** One merge result per planned emission output, in emission order. */
  wrote: MergeResult[];
  /**
   * What the emission PLAN found, as opposed to what the writer did with it:
   * a user or pack hook rejected at parse time and so never wired, a pack agent
   * whose grant resolved empty, a policy document past the size cap the
   * generated guard parses. Produced by `../../../emit/hooksInfra.ts` and
   * delivered through `EmissionPlanner.planWithWarnings`; rendered by
   * `./panel.ts` beside the per-file merge warnings, and by init's dry-run
   * report.
   *
   * Populated identically under `dryRun` — planning happens either way, so a
   * preview that hid a rejected hook would hide it at the one moment the
   * operator is still deciding.
   */
  warnings: string[];
  /** Ledger rows the manifest carries after this run. */
  ledgerCount: number;
  /** True when the `.env.mcp` gitignore rule was put in place (never under `dryRun`). */
  gitignoreEnsured: boolean;
  dryRun: boolean;
}

/** State directories scaffolded by init, in creation order, repo-relative POSIX. */
const STATE_DIRS: readonly string[] = [
  STATE_DIR,
  `${STATE_DIR}/learnings`,
  `${STATE_DIR}/handoffs`,
];

/**
 * Execute (or, under `dryRun`, fully plan) an init against `rootDir`.
 *
 * Refuses with `VALIDATION_ERROR` when a manifest already exists and `force`
 * is off — in dry-run too, so a preview never promises what the real run would
 * refuse. A manifest that exists but cannot be read is CORRUPT, not absent:
 * `readManifest`'s `CONFIG_ERROR` (which carries the repair guidance)
 * propagates instead of being shadowed by a fresh init over broken state.
 * `force` skips the read entirely — the existing manifest, corrupt or not, is
 * being replaced.
 */
export async function applyInit(opts: InitApplyOptions): Promise<InitApplyReport> {
  const { rootDir, decisions, defaults, importChoice, engineVersion, dryRun, force } = opts;
  const now = opts.now ?? new Date();

  if (!force && (await readManifest(rootDir)) !== null) {
    throw new EngineError(
      `This repo is already initialised: ${manifestPath(rootDir)} exists. ` +
        `Run \`stamity sync\` to regenerate outputs, \`stamity config\` to change settings, ` +
        `or \`stamity clean\` to remove the setup first. Re-run init with --force to ` +
        `replace the existing setup in place.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const manifest = await composeManifest(decisions, defaults, importChoice, engineVersion, now);

  // Installed packs survive a re-init, so their ledger rows must too. Seeded
  // BEFORE the emission plan below, because every consumer downstream reads the
  // packs off this ledger: the planner projects their content, and the MCP
  // ownership question at `packServers` resolves their servers.
  if (force) manifest.ledger = [...manifest.ledger, ...(await carriedPackRows(rootDir))];

  // State directories: probe first so the report lists only what this run adds.
  const missing = await Promise.all(
    STATE_DIRS.map(async (dir) => ({ dir, exists: await dirExists(join(rootDir, dir)) })),
  );
  const createdDirs = missing.filter((entry) => !entry.exists).map((entry) => entry.dir);
  if (!dryRun) {
    await Promise.all(createdDirs.map((dir) => mkdir(join(rootDir, dir), { recursive: true })));
    // The placeholders that make the two writable subdirectories survivable
    // through git, written by the SAME helper `sync` calls — so the panel's
    // "the state directory is committed on purpose" is true of every path it
    // covers, and a clone that lost them has a verb that restores them
    // (`../../../emit/stateScaffold.ts`).
    await ensureStateScaffold(rootDir);
  }

  // Emission: the planner decides WHAT to write; every write goes through the
  // merge engine with the version stamp, so re-running init over generated
  // files is only-when-stale, and a colliding user file surfaces as a
  // `skipped` row with its warning instead of being lost.
  // `planWithWarnings`, not `plan`: init renders a panel, so it takes the view
  // that carries what the pass found. The narrow view returns rows alone, and
  // an operator whose hook was rejected at parse time would learn it from the
  // hook not running.
  const { outputs, warnings } = await getEmissionPlanner().planWithWarnings({
    rootDir,
    manifest,
    engineVersion,
    facts: { monorepoPackages: decisions.monorepoPackages },
  });

  // Ownership carried in from any previous run: on a `--force` re-init the
  // existing manifest's ledger is what marks platform-named artifacts
  // (AGENTS.md, .claude/settings.json, …) engine-owned rather than user-owned.
  // The hash index rides with it, off the same rows: ownership says the engine
  // wrote the path, the recorded hash says whether the bytes there are still the
  // ones it wrote, and a re-init that replaces an engine-owned file the operator
  // has since hand-edited must take the verified `.bak` rather than the
  // no-backup fast path (`merge/safeWrite.ts::hasLedgerDrift`).
  const ownedPaths = ledgerPathSet(rootDir, manifest.ledger.map((row) => row.path));
  const ownedHashes = ledgerHashIndex(rootDir, manifest.ledger);

  // `replace` is the one mode that executes in the WRITE lane rather than in
  // the plan: the bytes are the ordinary generated document, and what the user
  // chose is for them to land over an existing unmanaged file. Forcing such a
  // path takes the writer's verified `.bak` first (`merge/safeWrite.ts`), so
  // the previous file is recoverable and the returned warning names it.
  //
  // A SET over every replace-mode decision, not the first one found: the
  // decision list carries one record per pre-existing file, so a `find` here
  // would force the first and leave a second replace-decided path to be
  // written as an ordinary row — the same lost-decision shape the list itself
  // exists to close.
  const replacePaths = new Set(
    (manifest.importChoice ?? []).filter((row) => row.mode === "replace").map((row) => row.path),
  );

  // Which pack-supplied MCP ids this run can prove it renders. The one rule
  // every lane asks — sync's plan, sync's apply and this one — so a shared MCP
  // document is judged the same way whichever verb ran last
  // (`../../engine/emissionWrite.ts::installedPackServers`, which carries the
  // account of what an empty answer costs).
  //
  // Asked AFTER the pack rows are seeded above ({@link carriedPackRows}): the
  // answer is read off this manifest's ledger, so a `--force` re-init over an
  // installed pack answers with its servers rather than with nothing.
  const packServers = await installedPackServers(rootDir, manifest);

  const wrote: MergeResult[] = [];
  const skippedPaths = new Set<string>();
  // Bytes actually written, for the paths where they differ from the emission —
  // the three merged MCP documents, which land as emission ∪ preserved operator
  // content. Read by the ledger loop below; see the `contentHash` note there.
  const writtenByPath = new Map<string, string>();
  for (const output of outputs) {
    const target = join(rootDir, ...output.path.split("/"));
    // single-writer: several outputs may address one shared file (AGENTS.md),
    // and the three MCP documents merge against what is already on disk, so
    // neither branch may interleave with another output's write.
    let result: MergeResult;
    if (MERGED_MCP_JSON_PATHS.has(output.path)) {
      // Destructured OFF the row: `wrote` is the caller's report, and the
      // written bytes are an internal hand-off to the ledger loop below —
      // `sync/engine.ts` keeps the same boundary for the same reason.
      // oxlint-disable-next-line no-await-in-loop
      const { writtenContent, ...merged } = await writeMcpDocument(
        target,
        output.content,
        manifest.mcp?.servers ?? [],
        output.path,
        dryRun,
        packServers,
      );
      result = merged;
      if (writtenContent !== null) writtenByPath.set(output.path, writtenContent);
    } else {
      // oxlint-disable-next-line no-await-in-loop
      result = await writeOutput(
        target,
        output.content,
        engineVersion,
        dryRun,
        force || replacePaths.has(output.path),
        ownedPaths,
        rootDir,
        ownedHashes,
      );
    }
    wrote.push(result);
    if (result.action === "skipped") skippedPaths.add(output.path);
  }

  // Ledger: one row per path this run actually stands behind. A skipped path
  // stayed user-owned — recording it would authorise a future reclaim sweep to
  // act on a file the engine never wrote — and the skip set is filtered HERE,
  // in the loop that knows it, rather than inside the row builder.
  //
  // The row SHAPE, the co-owner expansion, the hash-off-WRITTEN-bytes rule and
  // the conditional version stamp are all
  // `../../engine/emissionWrite.ts::ledgerRowsForOutput` — one implementation
  // for both writers, because a ledger the two verbs spell differently answers
  // the ownership question differently depending on which one ran last. Both
  // fields were skewed here before that single source existed: `contentHash`
  // was omitted entirely, which is the ONLY authorship proof the reclaim sweep
  // accepts for block-less whole-file output at a platform-mandated path
  // (`src/merge/reclaim.ts` gate 2b), so a freshly-inited repo could not be
  // cleaned until a sync had backfilled the hashes; and `stampedVersion` was
  // recorded unconditionally, claiming a version stamp in the 44-of-45 outputs
  // that carry no managed block to stamp it into.
  //
  // Grouping by adapter is init's own business: the rebuild below iterates
  // `manifest.tools`, not the closed tool set sync rebuilds over.
  const emittedByAdapter = new Map<Tool, EmittedArtifact[]>();
  for (const output of outputs) {
    if (skippedPaths.has(output.path)) continue;
    const managedBody = extractManagedBlock(
      output.content,
      join(rootDir, ...output.path.split("/")),
    );
    for (const row of ledgerRowsForOutput(
      output,
      writtenByPath.get(output.path) ?? null,
      managedBody,
      engineVersion,
    )) {
      const rows = emittedByAdapter.get(row.adapter) ?? [];
      rows.push(row);
      emittedByAdapter.set(row.adapter, rows);
    }
  }
  let ledger: LedgerEntry[] = manifest.ledger;
  for (const tool of manifest.tools) {
    ledger = replaceAdapterEntries(ledger, tool, toLedgerEntries(emittedByAdapter.get(tool) ?? []));
  }
  manifest.ledger = ledger;

  if (!dryRun) {
    // .env.mcp is the single entry this engine gitignores; the state dir is
    // committed by design (resolved SoT silence).
    await ensureGitignoreEntry(rootDir);
    // The commit point, last — see the module header.
    await writeManifest(rootDir, manifest, { now });
  }

  return {
    manifestPath: manifestPath(rootDir),
    createdDirs,
    wrote,
    warnings,
    ledgerCount: ledger.length,
    gitignoreEnsured: !dryRun,
    dryRun,
  };
}

/**
 * One of the three shared MCP JSON documents, merged by ownership instead of
 * overwritten. A repo being initialised may already carry hand-added servers —
 * from a predecessor setup or from the operator wiring one up before running
 * init — and the engine claims only the entries it can prove it wrote
 * (`../../../manifest/mcpFilter.ts`). Whole-file emission here would delete the
 * rest with no backup.
 *
 * `packServers` widens the ids the ownership computation can re-render, and so
 * the ids it can prove the engine wrote. An id it cannot render is an unowned
 * user row that is kept, never removed — which is the safe direction here, and
 * the reason the argument is threaded rather than defaulted at the call site.
 *
 * The `dryRun` leg runs the REAL merge and discards its bytes
 * (`../../engine/emissionWrite.ts::predictMcpDocumentMerge`, the one prediction
 * `sync`'s plan lane previews these three paths with). It used to predict from
 * the target's mere EXISTENCE — file there, therefore `updated` — which is a
 * different answer from the one `sync --dry-run` gives for the same tree: an
 * already-current document is `unchanged`, not work about to happen, and a
 * hard-linked one is a refusal this preview could not express at all while the
 * apply it was previewing raises FS_ERROR on that path. That module carries the
 * account; what belongs here is that both legs now ask it.
 */
async function writeMcpDocument(
  target: string,
  content: string,
  selectedServers: readonly string[],
  relPath: string,
  dryRun: boolean,
  packServers: readonly PackSuppliedServer[],
): Promise<McpMergeResult> {
  // A dry run writes nothing, so there are no written bytes to report; the
  // ledger it computes is discarded with the rest of the preview.
  if (dryRun) {
    const { result } = await predictMcpDocumentMerge(
      target,
      relPath,
      content,
      selectedServers,
      packServers,
    );
    return { ...result, writtenContent: null };
  }
  const existing = await readIfExists(target);
  return materializeUserMcpJson(
    target,
    content,
    engineOwnedServerIds(relPath, selectedServers, existing, packServers),
  );
}

/**
 * One planned output, written through the merge engine — or, under `dryRun`,
 * its disposition predicted by the writer's own predictor, so the preview and
 * the run cannot disagree.
 *
 * Lane selection is not decided here: it is
 * `../../engine/emissionWrite.ts::outputWriteOptions`, the one builder `sync`'s
 * plan and apply lanes take their options from too, so no verb can route an
 * output down a lane another verb would have sent elsewhere. That module holds
 * the account of what mis-routing cost, and of why `boundaryDir` and
 * `ledgerHashes` are supplied rather than defaulted.
 *
 * The dry-run leg below shares the same options object deliberately and needs
 * no drift input of its own — drift changes whether a backup is taken, never
 * which action is returned.
 */
async function writeOutput(
  target: string,
  content: string,
  engineVersion: string,
  dryRun: boolean,
  force: boolean,
  ledgerPaths: ReadonlySet<string>,
  boundaryDir: string,
  ledgerHashes: ReadonlyMap<string, ReadonlySet<string>>,
): Promise<MergeResult> {
  const managedBody = extractManagedBlock(content, target);
  const writeOptions = outputWriteOptions(
    managedBody,
    engineVersion,
    force,
    boundaryDir,
    ledgerPaths,
    ledgerHashes,
  );
  if (!dryRun) return safeWriteFile(target, content, writeOptions);
  const existing = await readIfExists(target);
  return { path: target, action: predictMergeAction(existing, content, writeOptions, target) };
}

/**
 * The `pack:<id>` ledger rows of the setup a `--force` re-init is replacing.
 *
 * Init replaces the GENERATED setup; it does not uninstall anything. Pack bytes
 * under `.stamity/packs/` are written by `pack install` and removed by uninstall,
 * and no init path touches them — so a ledger rebuilt from this run's emission
 * alone left real files on disk with no record of them, and every consumer reads
 * installed packs FROM those rows (`../../../pack/projection.ts::discoverInstalledPacks`).
 * What that cost, all of it silent: the pack became unrecorded and unselectable
 * (`config mcp add <its server>` refusing with "no installed pack supplies a
 * server"), its already-emitted entries went UNOWNED in all three client
 * documents — never refreshed, never removable, still launching with the
 * `.env.mcp` credential — and `check`, `validate` and `config mcp list` all
 * reported a clean repo over it. Carrying the rows is what makes the ownership
 * question at the call site resolve for init the way it already does for sync.
 *
 * A manifest that cannot be read yields no rows rather than a failure: `--force`
 * exists to replace broken state, and refusing here would take the repair path
 * away. The pack directories stay on disk either way, and re-installing the pack
 * re-records them.
 */
async function carriedPackRows(rootDir: string): Promise<LedgerEntry[]> {
  let previous: SetupManifest | null;
  try {
    previous = await readManifest(rootDir);
  } catch {
    // reason: not silent by omission — this is the corrupt-manifest case
    // `--force` is FOR, and the only thing dropped is the pack record, which
    // `stamity add <pack>` rebuilds.
    return [];
  }
  // Only for packs whose content is still on disk. `discoverInstalledPacks`
  // REFUSES a row whose directory is gone — correctly, since a ledger row is an
  // ownership claim over files — and carrying such a row would turn `--force`
  // into a hard `CONFIG_ERROR` on the exact state it exists to repair. Dropping
  // it is also the truer record: nothing is installed there any more.
  //
  // Rows are otherwise handed on as read: `replaceAdapterEntries` clones every
  // entry when it rebuilds the ledger below, so nothing mutates these in place.
  const rows = (previous?.ledger ?? []).filter((row) => isPackOwner(row.adapter));
  const present = new Map<string, boolean>();
  for (const row of rows) {
    const id = row.adapter.slice(PACK_OWNER_PREFIX.length);
    if (present.has(id)) continue;
    // oxlint-disable-next-line no-await-in-loop
    present.set(id, await packDirExists(rootDir, id));
  }
  return rows.filter((row) => present.get(row.adapter.slice(PACK_OWNER_PREFIX.length)) === true);
}

/**
 * True when `packId`'s installed content directory is still there. A malformed
 * owner — `packDirRelPath` asserts the id shape — reads as absent rather than
 * throwing: a hand-edited manifest must not be able to stop a `--force` init.
 */
async function packDirExists(rootDir: string, packId: string): Promise<boolean> {
  try {
    return await dirExists(join(rootDir, ...packDirRelPath(packId).split("/")));
  } catch {
    // reason: not silent — the row is dropped, which is the same disposition a
    // missing directory gets, and `stamity add <pack>` re-records a real one.
    return false;
  }
}

/**
 * The fresh manifest for this init. Field precedence: an explicit flag (read
 * off the decision's source tag) beats a predecessor default, which beats the
 * detected/seeded decision. `PredecessorDefaults` maps onto the creation
 * options directly; the one field outside them, `communicationStyle`, rides
 * the preserved-fields applier — the same merge a regeneration uses.
 */
async function composeManifest(
  decisions: InitDecisions,
  defaults: PredecessorDefaults | undefined,
  importChoice: readonly ImportDecision[] | undefined,
  engineVersion: string,
  now: Date,
): Promise<SetupManifest> {
  const selection = await loadFullSelection();

  const defaultTools = defaults?.tools;
  const tools =
    decisions.toolsSource === "flag" || defaultTools === undefined || defaultTools.length === 0
      ? decisions.tools
      : [...defaultTools];
  const maturityTier =
    decisions.maturitySource === "flag"
      ? decisions.maturityTier
      : defaults?.maturityTier ?? decisions.maturityTier;
  const mcp: McpConfig | undefined =
    defaults?.mcpServers !== undefined && defaults.mcpServers.length > 0
      ? { servers: [...defaults.mcpServers] }
      : undefined;

  const fresh = createManifest({
    tools,
    ...(decisions.platform !== undefined ? { platform: decisions.platform } : {}),
    selection,
    maturityTier,
    ...(mcp !== undefined ? { mcp } : {}),
    detected: decisions.detected,
    // An empty list is absence, not a decision: keeping the key off leaves a
    // greenfield manifest byte-identical to the one written before this field
    // could hold more than one record.
    ...(importChoice === undefined || importChoice.length === 0 ? {} : { importChoice }),
    now,
    generatorVersion: engineVersion,
  });
  return defaults?.communicationStyle === undefined
    ? fresh
    : applyPreservedManifestFields(fresh, { communicationStyle: defaults.communicationStyle });
}

/**
 * The full-core selection over the bundled catalog. A checkout whose corpus
 * has not been staged resolves no content root at all — that absence is the
 * documented pre-corpus state, not a failure, and it selects the same
 * all-empty arrays an empty corpus does. Every future sync recomputes this.
 */
async function loadFullSelection(): Promise<ContentSelection> {
  let contentRoot: string;
  try {
    contentRoot = resolveBundledContentRoot();
  } catch (error) {
    if (error instanceof EngineError && error.code === "CONFIG_ERROR") {
      return fullCoreSelection({ items: [], byKey: new Map(), collisions: [] });
    }
    throw error;
  }
  return fullCoreSelection(await buildContentIndex(contentRoot));
}

/** True when `path` is a directory. Any filesystem refusal reads as absent. */
async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
