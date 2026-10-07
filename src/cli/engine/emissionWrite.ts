import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { CLAUDE_SETTINGS_PATH, claudeUserHookEntries } from "../../adapters/claude.ts";
import { CODEX_CONFIG_FILE, codexConfigTableRendering } from "../../adapters/codex.ts";
import { isPluginOwned } from "../../emit/ownership.ts";
import { readHookDefinitions } from "../../hooks/userHooks.ts";
import {
  claudeSettingsReclaimReducer,
  materializeClaudeSettings,
  predictClaudeSettingsMerge,
} from "../../manifest/claudeSettings.ts";
import { planCodexConfigToml, reduceCodexConfigToml } from "../../manifest/codexConfigToml.ts";
import {
  materializeCoOwned,
  predictCoOwnedMerge,
  type CoOwnedMergeResult,
  type CoOwnedOwnership,
  type CoOwnedPrediction,
} from "../../manifest/coOwnedJson.ts";
import type { EmittedArtifact } from "../../manifest/ledger.ts";
import { planUserMcpJson, predictMcpMergeRefusal } from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import { engineOwnedServerIds, mcpReclaimReducers } from "../../mcp/emit.ts";
import type { SafeWriteFileOptions } from "../../merge/safeWrite.ts";
import { discoverInstalledPacks, packMcpServers } from "../../pack/projection.ts";
import {
  outputOwners,
  type AdapterOutput,
  type CoOwnedReducer,
  type MergeResult,
} from "../../types/content.ts";
import { VALID_TOOLS, type Tool } from "../../types/core.ts";
import { STATE_DIR } from "../../types/markers.ts";
import type { CoOwnership, LedgerEntry, SetupManifest } from "../../types/manifest.ts";

/**
 * The write-side rules the two regeneration verbs must apply IDENTICALLY.
 *
 * `init` (`../commands/init/apply.ts`) and `sync` (`../commands/sync/engine.ts`)
 * are two different write loops on purpose, and collapsing them into one flagged
 * function would erase distinctions the ownership model depends on. Every
 * divergence that remains is listed below with the two lines where the loops
 * part, so the number of them is READ OFF the list rather than carried as a
 * count that drifts the next time one is unified:
 *
 * 1. The replace lane. `init` forces each path an import decision marked
 *    `replace` (`init/apply.ts:224` builds the set, `:273` forces per path);
 *    `sync` has no such decision and passes the flag alone
 *    (`sync/engine.ts:720`).
 * 2. The ledger rebuild scope. `init` rebuilds the rows of the tools its own
 *    manifest selects (`init/apply.ts:321-323`); `sync` rebuilds over the CLOSED
 *    tool set (`sync/engine.ts:745-748`, `for (const tool of TOOLS)`), so a tool
 *    the operator removed has its rows dropped rather than left standing.
 * 3. The collision gate. `sync` refuses the run when a planned path collides,
 *    unless `--force` (`sync/engine.ts:654-655`, the message at `:537`); `init`
 *    keeps the writer's `skipped` row, reports it in the panel, and carries on
 *    (`init/apply.ts:280`).
 * 4. The reclaim sweep. `sync` computes candidates in the plan
 *    (`sync/engine.ts:447`) and sweeps them after the writes (`:750-758`);
 *    `init` runs no sweep — a first setup has no previous emission of its own to
 *    reclaim from, and a `--force` re-init carries only the pack rows.
 * 5. The scaffold ordering. `init` writes the state scaffold BEFORE the emission
 *    (`init/apply.ts:173`); `sync` writes it after every write, as the last step
 *    before the commit point (`sync/engine.ts:770`).
 * 6. How the manifest is composed. `init` composes a fresh one from the
 *    decisions, ledger empty (`init/apply.ts:153`); `sync` reads the persisted
 *    one (`sync/engine.ts:384`) and rewrites it with this run's stamps (`:774`).
 * 7. The dry-run prediction — and only this much of it, since the predictions
 *    themselves moved here: `sync`'s plan lane TYPES a refusal (`action:
 *    "collision"` carrying a `collisionKind`, `sync/engine.ts:298-299`,
 *    `:329-330`, `:351-359`) because its callers branch on the class, while
 *    `init`'s dry run returns the writer's plain `MergeResult`
 *    (`init/apply.ts:434`). Both sides ask the same two predictors:
 *    `../../merge/safeWrite.ts::predictMergeAction` over
 *    {@link outputWriteOptions}, and {@link predictMcpDocumentMerge} for the
 *    three merged MCP documents (`init/apply.ts:380`, `sync/engine.ts:319`).
 *
 * What may NOT differ is what a write MEANS: which lane an output takes, which
 * bytes its authorship proof is computed over, what a ledger row looks like, and
 * which MCP ids the engine can prove it rendered.
 *
 * Those four questions used to be answered twice, once per verb, with comments
 * on both sides asking the reader to keep the copies in step by hand. Each is
 * answered exactly once here, so a divergence is impossible rather than merely
 * discouraged — because every one of them is silent when it goes wrong: the
 * ledger is a claim of authorship over a user's files, and a claim the two
 * writers spell differently is a claim that changes meaning depending on which
 * verb ran last.
 *
 * A fifth question joined them: what a DRY RUN of one of the three merged MCP
 * documents predicts ({@link predictMcpDocumentMerge}). It belongs here for the
 * same reason and by the same evidence — the two verbs answered it differently,
 * and the answers were both previews of the same regeneration.
 *
 * Nothing here touches the filesystem except {@link readIfExists} and
 * {@link predictMcpDocumentMerge}, which read. The write itself stays with the
 * caller: this module decides, the loops act.
 */

/**
 * Hash of emitted content, the ledger's authorship proof.
 *
 * ONE spelling for both writers. `contentHash` is consumed by re-hashing the
 * file on disk and comparing (`../../merge/reclaim.ts` gates 2b/4,
 * `../../merge/safeWrite.ts::hasLedgerDrift`), so a proof written by `init` has
 * to verify against a re-hash performed after `sync`, and vice versa. Two
 * implementations that agree today are two implementations that can stop
 * agreeing in one edit.
 *
 * `update(content)` with no encoding argument: a string defaults to UTF-8, and
 * naming it changes nothing — stated because the same digest is spelled with an
 * explicit `"utf8"` elsewhere in the tree and the equality is not obvious.
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** File content, or `null` when the file does not exist. Other errnos propagate. */
export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code !== "ENOENT") throw err;
    return null;
  }
}

/**
 * The safe-write options one planned output gets — single-sourced so the plan's
 * prediction, init's write and sync's write can never diverge. An output whose
 * content carries a managed block takes the managed-merge lane with that block
 * body as `managedContent`; a marker-less output (hook scripts, plain JSON) is a
 * whole-file write.
 *
 * Passing the whole output as `managedContent` unconditionally routes
 * marker-less artifacts into `mergeManagedContent`, where `appendIfNoBlock`
 * treats the engine's OWN previous output as user-authored bytes to preserve: it
 * deny-scans them (the generated PreToolUse guard carries the injection
 * vocabulary it matches on, so a second `init --force` refused with
 * INTEGRITY_ERROR) and otherwise prepends a duplicate copy of the file above
 * itself. Both are second-run-only, which is why only re-init surfaced it.
 *
 * `boundaryDir` is the repo root — the same root every output path is joined
 * onto, so the writer's containment check answers the exact question the callers
 * can answer: these verbs emit into this tree and nowhere else. Without it the
 * substrate falls back to its structural rule, which cannot tell a monorepo's
 * in-repo alias (`.cursor/rules` → `shared/rules`) from a planted redirect and
 * refuses both.
 *
 * `ledgerHashes` rides alongside `ledgerPaths` and is built from the same rows.
 * Ownership alone told the writer the path is regenerable; the recorded hash is
 * what tells it whether the bytes STILL are. Without it a marker-less output the
 * engine owns — a hook script, one of the plain-JSON documents — that the
 * operator hand-edited is replaced outright on a plain flagless run, with no
 * `.bak` and no warning (`../../merge/safeWrite.ts::hasLedgerDrift`). Both are
 * optional because sync's PLAN lane needs neither at full strength: drift moves
 * the backup, never the disposition, so `predictMergeAction` still answers for
 * the write exactly.
 *
 * `backup: true` is stated rather than left to the default it already is. The
 * two writers spelled this differently — one explicit, one omitted — for no
 * behavioural reason (`../../merge/safeWrite.ts` reads only `backup === false`),
 * and a difference with no meaning is the kind a reader eventually gives one.
 */
export function outputWriteOptions(
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
  return managedBody === null
    ? base
    : { ...base, managedContent: managedBody, appendIfNoBlock: true };
}

/**
 * The ledger rows one written output earns — the row SHAPE both writers persist.
 *
 * Called only for a path the run actually wrote: a skipped path stayed
 * user-owned, and recording it would authorise a future reclaim sweep to act on
 * a file the engine never wrote. That gate belongs to the caller's loop, which
 * is where the skip is known.
 *
 * Co-owned outputs expand to one row PER owner — the ledger's multi-owner rows
 * are what let a shared path (the root `AGENTS.md`) survive deselection of one
 * tool (`../../manifest/ledger.ts`), and `outputOwners` collapses duplicate
 * adapters so no `(adapter, path)` pair can be recorded twice. The file itself
 * is still written exactly once by the caller.
 *
 * `written` is the bytes this run actually PUT ON DISK when they differ from the
 * emission — the three merged MCP documents, which land as emission ∪ preserved
 * operator content — and `null` when the write was the emission verbatim. The
 * hash goes over those bytes, not over the emission, and that is the whole
 * reason this argument exists: `contentHash` has exactly one reader, the reclaim
 * sweep (`../../merge/reclaim.ts` gates 2b/4), which re-hashes the file on disk
 * to prove the engine wrote it and nobody edited it since. Recording the
 * emission's hash for a merged document made the sweep read the engine's own
 * document as "edited since", so a deselected client doc could never be
 * auto-reclaimed and stayed behind as user content forever. Both writers carried
 * that bug, and both carried the fix; it lives here now so it cannot come back
 * on one side only.
 *
 * `stampedVersion` rides on `managedBody`, not on the run: an output with no
 * managed block has nowhere to stamp a version into, and recording one anyway
 * claimed a stamp in the great majority of outputs that carry no block at all.
 *
 * `coOwned` is what the engine wrote INSIDE a document it shares with its owner
 * (REQ-FLOW-036, `../../manifest/coOwnedJson.ts`): every owner's row of the one
 * write carries it, each its own copy.
 */
export function ledgerRowsForOutput(
  output: AdapterOutput,
  written: string | null,
  managedBody: string | null,
  engineVersion: string,
  coOwned?: CoOwnership,
): EmittedArtifact[] {
  const contentHash = sha256(written ?? output.content);
  const rows: EmittedArtifact[] = [];
  for (const owner of outputOwners(output)) {
    rows.push({
      path: output.path,
      adapter: owner.adapter,
      artifactId: owner.artifactId,
      artifactType: owner.artifactType,
      contentHash,
      ...(managedBody === null ? {} : { stampedVersion: engineVersion }),
      ...(coOwned === undefined ? {} : { coOwned: structuredClone(coOwned) }),
    });
  }
  return rows;
}

/** What a merge into one of the three shared MCP documents WOULD do. */
export interface McpMergePrediction {
  /**
   * The disposition, in the writer's own vocabulary — the same
   * {@link MergeResult} `materializeUserMcpJson` returns for these bytes, so a
   * caller reporting per-output can report the prediction verbatim.
   *
   * On a refusal it is `skipped` carrying {@link refusal} as its `warning`: the
   * write does not happen and the run does not stand behind the path, which is
   * what `skipped` already means to both writers' ledger loops.
   */
  result: MergeResult;
  /**
   * Why the write would refuse before merging at all — today, only a hard-linked
   * target. `null` when the merge would proceed. Carried beside the result
   * rather than left to be dug out of `result.warning`, because a caller that
   * classifies refusals (sync's plan lane types them) must not have to
   * string-match to tell one apart from a merge that merely warned.
   */
  refusal: string | null;
}

/**
 * What a merge into `absPath` would do, computed by running the REAL merge over
 * the bytes on disk and writing nothing.
 *
 * The one prediction both regeneration verbs preview these three paths with.
 * They used to answer it separately and differently, which made two previews of
 * one tree disagree: sync's plan ran this merge, so it reported `unchanged` for
 * an already-current document and a `shared-name` collision for one the write
 * would refuse, while init's dry run predicted from the target's mere EXISTENCE
 * — file there, therefore `updated`. So `init --force --dry-run` over a tree a
 * previous init had just written previewed work that would not happen, and no
 * init preview could show the hard-link refusal that init's own apply raises.
 * A dry run is a promise about the apply, and two verbs promising different
 * things about one tree means at least one promise is false.
 *
 * Order is load-bearing and is the reason the refusal check is inside this
 * function rather than left to each caller. `planUserMcpJson` reports a parse
 * failure by quoting the parser's message, which carries a fragment of whatever
 * it read, so a `.mcp.json` hard-linked to a binary key file would print part of
 * that key. Refusing ahead of the read means no linked byte is read, let alone
 * printed — the same ordering `../../manifest/mcpFilter.ts::refuseLinkedMcpTarget`
 * imposes on the write lane, mirrored here for the preview of it.
 *
 * `packServers` is threaded rather than defaulted for the reason it is
 * everywhere else on this lane ({@link installedPackServers}): predicting from a
 * narrower ownership set than the write will use is how a removal gets performed
 * but not previewed.
 */
export async function predictMcpDocumentMerge(
  absPath: string,
  relPath: string,
  emitted: string,
  selectedServers: readonly string[],
  packServers: readonly PackSuppliedServer[],
): Promise<McpMergePrediction> {
  const refusal = await predictMcpMergeRefusal(absPath);
  if (refusal !== null) {
    return { result: { path: absPath, action: "skipped", warning: refusal }, refusal };
  }
  const existing = await readIfExists(absPath);
  const { result } = planUserMcpJson(
    absPath,
    emitted,
    engineOwnedServerIds(relPath, selectedServers, existing, packServers),
    existing,
  );
  return { result, refusal: null };
}

/**
 * Every MCP server this repo's installed packs supply, read through the seam
 * emission resolves ids from (`../commands/config/mcp.ts` asks the identical
 * question of the identical pair, and asking it a second way would be a second
 * answer waiting to disagree).
 *
 * EVERY lane calls this — sync's plan, sync's apply, and init's write — off the
 * same ledger, because ownership is what the answer decides.
 * `engineOwnedServerIds` proves authorship of an UNSELECTED entry by
 * re-rendering it, and it can only render an id it can resolve — so a
 * pack-supplied entry the engine itself wrote is judged an unowned USER row
 * without these rows, and `../../manifest/mcpFilter.ts` then preserves it
 * verbatim. A deselected third-party server would never leave `.mcp.json`,
 * `.cursor/mcp.json` or `.vscode/mcp.json`, and would keep launching with the
 * credentials in `.env.mcp`. The PLAN lane asking the same question is the other
 * half: an empty answer there predicts `unchanged` for a document the apply lane
 * is about to rewrite, so `check` reports no drift across a revocation that
 * silently failed.
 *
 * On init it resolves non-empty exactly when the ledger handed in carries pack
 * rows: a first init has nothing installed and the answer is legitimately empty,
 * while a `--force` re-init over an installed pack answers with its servers,
 * because that run seeds the carried pack rows before asking. That is what makes
 * revocation reach init's lane at all — without those rows init could not prove
 * authorship of an entry it had itself emitted, kept it as an unowned user row,
 * and a server deselected across a re-init went on launching from all three
 * client documents.
 *
 * Reads nothing when the ledger carries no pack rows
 * (`../../pack/projection.ts`), so a repo with no packs installed pays for none
 * of this.
 */
export async function installedPackServers(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  return packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
}

/**
 * One document the engine shares with its owner and writes ENTRY BY ENTRY on
 * the per-entry core (`../../manifest/coOwnedJson.ts`, REQ-FLOW-036): how
 * `sync`'s plan and `init`'s dry run preview a write there, how both verbs'
 * write lanes perform it, and what the reclaim sweep reduces it to. One
 * registry, so a verb cannot route such a path down the whole-file lane while
 * another merges it.
 */
export interface CoOwnedDocumentLane {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** The document's noun in messages. */
  readonly noun: string;
  /**
   * True when the document wires hook commands, so a copy the reclaim sweep
   * leaves in place may still run an engine hook script and holds it back
   * (S17; `../../merge/reclaim.ts` `ReclaimOptions.hookDocuments`). The seam a
   * hooks document registers through: the settings lane today, Cursor's and
   * Codex's hook files with `u0-hook-files-ownership`.
   */
  readonly wiresHooks: boolean;
  predict(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedPrediction>;
  materialize(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedMergeResult>;
  /** The sweep's view of the document; `rendered` is the engine's current rendering there, for the proof by re-rendering. */
  reducer(ownership: CoOwnedOwnership, deleteWhenEngineOnly: boolean, rendered?: unknown): CoOwnedReducer;
}

/**
 * Every co-owned document lane, keyed by repo-relative path:
 * `.claude/settings.json` entry by entry, and `.codex/config.toml` table by
 * table (REQ-FLOW-037, `../../manifest/codexConfigToml.ts`), whose renderings
 * resolve against `packServers` and whose legacy proof reads `manifest`'s
 * server selection.
 */
export function coOwnedDocumentLanes(
  manifest: SetupManifest | null,
  packServers: readonly PackSuppliedServer[] = [],
): ReadonlyMap<string, CoOwnedDocumentLane> {
  const claude: CoOwnedDocumentLane = {
    path: CLAUDE_SETTINGS_PATH,
    noun: "settings document",
    wiresHooks: true,
    predict: predictClaudeSettingsMerge,
    materialize: materializeClaudeSettings,
    reducer: (ownership, deleteWhenEngineOnly, rendered) =>
      claudeSettingsReclaimReducer({
        record: ownership.record,
        legacy: ownership.legacy,
        deleteWhenEngineOnly,
        ...(rendered === undefined ? {} : { rendered }),
      }),
  };
  const render = codexConfigTableRendering(packServers);
  const selected = manifest?.mcp?.servers ?? [];
  const codexNoun = "Codex configuration";
  const codexPlan = (absPath: string, emitted: string, ownership: CoOwnedOwnership) => (existingRaw: string | null) =>
    planCodexConfigToml(absPath, emitted, existingRaw, ownership, render, selected);
  const codexConfig: CoOwnedDocumentLane = {
    path: CODEX_CONFIG_FILE,
    noun: codexNoun,
    wiresHooks: false,
    predict: (absPath, emitted, ownership) => predictCoOwnedMerge(absPath, codexPlan(absPath, emitted, ownership), codexNoun),
    materialize: (absPath, emitted, ownership) =>
      materializeCoOwned(absPath, codexPlan(absPath, emitted, ownership), ownership, codexNoun),
    reducer: (ownership, deleteWhenEngineOnly) => (content) =>
      reduceCodexConfigToml(content, { record: ownership.record, legacy: ownership.legacy, selected, render, deleteWhenEngineOnly }),
  };
  return new Map([
    [claude.path, claude],
    [codexConfig.path, codexConfig],
  ]);
}

/** `a` and `b`'s record, unioned: every pointer either names, each hash list without repeats. */
function unionRecords(a: CoOwnership, b: CoOwnership): CoOwnership {
  const members = { ...a.members, ...b.members };
  const elements: Record<string, string[]> = { ...a.elements };
  for (const [pointer, hashes] of Object.entries(b.elements ?? {})) {
    elements[pointer] = [...new Set([...(elements[pointer] ?? []), ...hashes])];
  }
  const preexisting = [...new Set([...(a.preexisting ?? []), ...(b.preexisting ?? [])])];
  return {
    ...(Object.keys(members).length > 0 ? { members } : {}),
    ...(Object.keys(elements).length > 0 ? { elements } : {}),
    ...(preexisting.length > 0 ? { preexisting } : {}),
    ...(a.createdFile === true || b.createdFile === true ? { createdFile: true as const } : {}),
  };
}

/**
 * What the ledger says about a co-owned `path`: `owned` when a row names it,
 * `legacy` when rows name it and none carries a record (a 1.11.0 ledger), the
 * union of the rows' records, and whether the sweep may delete the file once
 * only the engine's entries were in it (the engine created it, or the row is
 * legacy and keeps 1.11.0's rule). Rows are matched by their exact spelling,
 * the ledger bound's rule (REQ-PLUGIN-045).
 */
export function coOwnedOwnershipOf(
  ledger: readonly LedgerEntry[],
  path: string,
  opts: { boundaryDir?: string; ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>> } = {},
): CoOwnedOwnership & { deleteWhenEngineOnly: boolean } {
  const rows = ledger.filter((row) => row.path === path);
  const recorded = rows.flatMap((row) => (row.coOwned === undefined ? [] : [row.coOwned]));
  const owned = rows.length > 0;
  const legacy = owned && recorded.length === 0;
  const record = recorded.length === 0 ? null : recorded.reduce(unionRecords);
  return {
    owned,
    legacy,
    record,
    deleteWhenEngineOnly: legacy || recorded.some((row) => row.createdFile === true),
    ...(opts.ledgerHashes === undefined ? {} : { ledgerHashes: opts.ledgerHashes }),
    ...(opts.boundaryDir === undefined ? {} : { boundaryDir: opts.boundaryDir }),
  };
}

/**
 * The pre-run ledger rows at a co-owned `path` this run refused to write
 * (`co-owned-shape`, or a linked target), carried into the rebuilt ledger
 * whole — the record and the recorded hash included — as 1.11.0 kept its row
 * when it replaced a key. Dropping them would leave `clean` unable to reach the
 * document's engine entries, and the first write after the owner's fix would
 * re-adopt the file and turn the engine's own rows foreign (S13). A stale hash
 * only makes the sweep read the bytes as drifted, which takes the backup.
 */
export function coOwnedRowsCarriedThroughRefusal(ledger: readonly LedgerEntry[], path: string): EmittedArtifact[] {
  return ledger.flatMap((row) =>
    row.path === path && VALID_TOOLS.has(row.adapter) ? [{ ...row, adapter: row.adapter as Tool }] : [],
  );
}

/**
 * The co-owned documents that wire hook commands, for the reclaim sweep's
 * script keep (`ReclaimOptions.hookDocuments`): every lane declaring
 * `wiresHooks`, and never an MCP document, which runs no hook.
 */
export function coOwnedHookDocuments(
  manifest: SetupManifest,
  packServers: readonly PackSuppliedServer[] = [],
): ReadonlySet<string> {
  return new Set([...coOwnedDocumentLanes(manifest, packServers).values()].filter((lane) => lane.wiresHooks).map((lane) => lane.path));
}

/**
 * The reducers the reclaim sweep owes for every CO-OWNED document
 * (`../../merge/reclaim.ts` → `ReclaimOptions.coOwnedPaths`): the three
 * merged client MCP documents, keyed per dialect (`../../mcp/emit.ts`), plus
 * each {@link coOwnedDocumentLanes} lane over what `manifest`'s ledger records
 * there. One builder for the sync sweep and both of clean's, because a caller
 * that omits a path here silently returns it to the whole-file delete branch,
 * where a hash match over merged bytes reads as sole authorship — the
 * regression the MCP reducers exist for, and the one
 * `test/merge/settingsKeyOwnership.test.ts` drives at the shipped verbs for the
 * settings document.
 */
export function coOwnedReclaimReducers(
  manifest: SetupManifest,
  packServers: readonly PackSuppliedServer[] = [],
  renderings: ReadonlyMap<string, unknown> = new Map(),
): Map<string, CoOwnedReducer> {
  const reducers = mcpReclaimReducers(packServers);
  for (const lane of coOwnedDocumentLanes(manifest, packServers).values()) {
    const ownership = coOwnedOwnershipOf(manifest.ledger, lane.path);
    reducers.set(lane.path, lane.reducer(ownership, ownership.deleteWhenEngineOnly, renderings.get(lane.path)));
  }
  return reducers;
}

/** The user hooks folder when the manifest names none (`../../emit/hooksInfra.ts`'s default). */
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;

/**
 * What the engine renders now into each co-owned document, for the reclaim
 * sweep's proof by re-rendering (S11; `coOwnedReclaimReducers`' `renderings`):
 * the user-hook entries of the definitions still in the user hooks folder,
 * rendered as the Claude adapter renders them into `.claude/settings.json`.
 * A user-hook entry equal to one of them leaves without a backup; an entry
 * whose definition is gone, or that differs, is outside the bound. None when
 * the plugin carries Claude's hooks (the repository renders none there) or the
 * folder cannot be read (nothing is then proved, so the backup is taken).
 */
export async function coOwnedReclaimRenderings(
  rootDir: string,
  manifest: SetupManifest,
): Promise<ReadonlyMap<string, unknown>> {
  if (isPluginOwned(manifest, "claude", "hooks")) return new Map();
  let read;
  try {
    read = await readHookDefinitions(resolve(rootDir, manifest.hooks?.userHooksDir ?? DEFAULT_USER_HOOKS_DIR), rootDir);
    // reason: not silent — with no rendering nothing is proved, and every
    // user-hook removal takes the verified backup the sweep reports.
  } catch {
    return new Map();
  }
  // The reader's rows carry provenance beside the interchange fields; the
  // renderer reads the interchange fields alone, as the emission does.
  return read.hooks.length === 0 ? new Map() : new Map([[CLAUDE_SETTINGS_PATH, { hooks: claudeUserHookEntries(read.hooks) }]]);
}
