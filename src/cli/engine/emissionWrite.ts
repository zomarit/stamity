import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { CLAUDE_SETTINGS_PATH, claudeUserHookEntries } from "../../adapters/claude.ts";
import { CODEX_CONFIG_FILE, CODEX_HOOKS_FILE, codexConfigTableRendering } from "../../adapters/codex.ts";
import { COPILOT_HOOKS_PATH } from "../../adapters/copilot.ts";
import {
  CURSOR_1_11_0_GUARD_ENTRIES,
  CURSOR_1_11_0_RUNTIME_AGENT_IDS,
  render1110CursorGuards,
} from "../../adapters/cursorLegacyGuards.ts";
import {
  CURSOR_HOOKS_CONFIG_PATH,
  LEGACY_CURSOR_GUARD_PATHS,
  MCP_GUARD_PATH,
  SUBAGENT_GUARD_PATH,
} from "../../adapters/cursor.ts";
import { buildContentIndex, type ContentIndex } from "../../content/catalog.ts";
import { analyzeRepo, summarizeDetection } from "../../detect/repoAnalyzer.ts";
import { isPluginOwned } from "../../emit/ownership.ts";
import { readHookDefinitions, type UserHookDefinition } from "../../hooks/userHooks.ts";
import {
  claudeSettingsReclaimReducer,
  materializeClaudeSettings,
  predictClaudeSettingsMerge,
} from "../../manifest/claudeSettings.ts";
import { describeCodexHooksOff, planCodexConfigToml, reduceCodexConfigToml } from "../../manifest/codexConfigToml.ts";
import {
  materializeCoOwned,
  planCoOwnedJson,
  predictCoOwnedMerge,
  reduceCoOwnedJson,
  type CoOwnedJsonSpec,
  type CoOwnedMergeResult,
  type CoOwnedOwnership,
  type CoOwnedPrediction,
} from "../../manifest/coOwnedJson.ts";
import {
  codexHooksSpec,
  cursorHooksSpec,
  describeCursorHookDefects,
  directHookRendering,
  hookScriptReader,
} from "../../manifest/hookDocuments.ts";
import { memberHash } from "../../manifest/jsonMembers.ts";
import type { EmittedArtifact } from "../../manifest/ledger.ts";
import { needsRenderingProof } from "../../manifest/ownedPaths.ts";
import { planUserMcpJson, predictMcpMergeRefusal } from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import { engineOwnedServerIds, mcpReclaimReducers } from "../../mcp/emit.ts";
import type { HookScriptReader, ReclaimActionEntry, ReclaimReport } from "../../merge/reclaim.ts";
import { displayPath, type SafeWriteFileOptions } from "../../merge/safeWrite.ts";
import {
  discoverInstalledPacks,
  ignoringPolicyDenialForProof,
  packMcpServers,
  withoutPolicyWarningPrint,
} from "../../pack/projection.ts";
import {
  outputOwners,
  type AdapterOutput,
  type CoOwnedReducer,
  type ContentClass,
  type ContentSelection,
  type MergeResult,
} from "../../types/content.ts";
import { TOOLS, VALID_TOOLS, type Tool } from "../../types/core.ts";
import type { PackageEntry } from "../../types/detect.ts";
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
   * hooks document registers through: `.claude/settings.json`,
   * `.cursor/hooks.json` and `.codex/hooks.json` declare it; `.codex/config.toml`
   * does not, since it wires no hook command.
   */
  readonly wiresHooks: boolean;
  predict(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedLanePrediction>;
  materialize(absPath: string, emitted: string, ownership: CoOwnedOwnership): Promise<CoOwnedMergeResult>;
  /**
   * The sweep's view of the document; `rendered` is the engine's current
   * rendering there, for the proof by re-rendering. It carries only a rendering
   * that needs a read (the settings lane's user hooks, `coOwnedReclaimRenderings`);
   * a lane whose rendering is a pure function of the registry's own inputs (the
   * Codex config's tables) closes over that rendering and takes no `rendered`.
   */
  reducer(ownership: CoOwnedOwnership, deleteWhenEngineOnly: boolean, rendered?: unknown): CoOwnedReducer;
}

/**
 * A lane's prediction, plus what the client would reject in the document as
 * the write leaves it (S19), or a kept `.codex/config.toml` key that turns
 * Codex's hooks off (S16): `check` fails on it, while `sync` and `init` keep
 * the document and warn — it is not a collision, so it never stops a run.
 */
interface CoOwnedLanePrediction extends CoOwnedPrediction {
  rejected?: string;
}

/**
 * Cursor's guards, as the sweep reads them: the current names and the 1.11.0
 * ones (REQ-FLOW-038), so a hooks document the sweep leaves in place — kept,
 * refused or linked — still holds an old guard it runs back from the sweep that
 * reclaims the old names.
 */
const CURSOR_GUARD_PATHS: readonly string[] = [SUBAGENT_GUARD_PATH, MCP_GUARD_PATH, ...LEGACY_CURSOR_GUARD_PATHS];

/**
 * Cursor's guards, as `.cursor/hooks.json`'s spec recognises and bounds them:
 * the current names, and a 1.11.0 name only where `ledger` records that path
 * — a setup that ran a release before the rename (REQ-FLOW-038; the review/70
 * sign-off) — and, when the caller proved them ({@link provenLegacyCursorGuards}),
 * only where the file there is absent or is the guard 1.11.0 rendered for the
 * setup (row 585). There the first sync recognises an entry running the old
 * name as the engine's and replaces it; anywhere else the old names are free,
 * and an entry running one is the owner's.
 */
function cursorGuardPathsFor(ledger: readonly LedgerEntry[], provenLegacy?: ReadonlySet<string>): string[] {
  const recorded = new Set(ledger.map((row) => row.path));
  return [
    SUBAGENT_GUARD_PATH,
    MCP_GUARD_PATH,
    ...LEGACY_CURSOR_GUARD_PATHS.filter((path) => recorded.has(path) && (provenLegacy === undefined || provenLegacy.has(path))),
  ];
}

/**
 * The package identity the 1.11.0 guards embedded in their pinned sync call:
 * the running installation's (`../kit/packageName.ts`), which the caller
 * passes because this module may not import it (`test/architecture`). A fork's
 * setup is upgraded by the fork's own engine.
 */
export interface LegacyCursorIdentity {
  readonly packageName: string;
  readonly npmChannel: boolean;
}

/** The Cursor agents directory every release wrote one file per admitted agent into. */
const CURSOR_AGENT_ROW_DIR = ".cursor/agents/";

/**
 * The two guards 1.11.0 rendered for this setup, by old name
 * (`../../adapters/cursorLegacyGuards.ts`): the ten agents 1.11.0 shipped plus
 * every Cursor agent `ledger` records — the agents 1.11.0 actually emitted,
 * packs and overrides included — under `identity`. The current corpus and
 * packs are not read, since they can differ from 1.11.0's. A forged agent row
 * only widens the roster, so the only file it can prove is one whose bytes are
 * exactly a 1.11.0 guard for that roster. Empty when the identity cannot be
 * rendered (a package name 1.11.0 refused), so nothing is proved.
 */
function releaseOneElevenGuardsFor(ledger: readonly LedgerEntry[], identity: LegacyCursorIdentity): ReadonlyMap<string, string> {
  const agents = ledger.flatMap((row) => {
    const name = row.path.slice(CURSOR_AGENT_ROW_DIR.length);
    return row.adapter === "cursor" && row.artifactType === "agent" && row.path.startsWith(CURSOR_AGENT_ROW_DIR) && !name.includes("/") && name.endsWith(".md")
      ? [name.slice(0, -".md".length)]
      : [];
  });
  try {
    return render1110CursorGuards({ agentIds: [...CURSOR_1_11_0_RUNTIME_AGENT_IDS, ...agents], ...identity });
    // reason: not silent — with no rendering nothing is proved, and both old guards are kept and named.
  } catch {
    return new Map();
  }
}

/** `text`, and `text` with every `\r\n` folded to `\n`, as the reclaim sweep's byte compare reads a CRLF checkout. */
const lineEndingSpellings = (text: string): string[] => [text, text.replaceAll("\r\n", "\n")];

/**
 * The 1.11.0 guard names whose `.cursor/hooks.json` entry the engine may still
 * claim (row 585, REQ-FLOW-038): each one `ledger` records whose file is absent
 * — the owner deleted it, so rewiring the entry deletes nothing — or holds
 * exactly the guard 1.11.0 rendered for this setup, raw or CRLF-folded. A file
 * that cannot be read as a regular file (a link, an unreadable one) proves
 * nothing. Read once per verb, before its write, and handed to
 * {@link coOwnedDocumentLanes} and {@link coOwnedReclaimReducers}.
 */
export async function provenLegacyCursorGuards(
  rootDir: string,
  ledger: readonly LedgerEntry[],
  identity: LegacyCursorIdentity,
): Promise<ReadonlySet<string>> {
  const recorded = LEGACY_CURSOR_GUARD_PATHS.filter((path) => ledger.some((row) => row.path === path));
  if (recorded.length === 0) return new Set();
  const rendered = releaseOneElevenGuardsFor(ledger, identity);
  const proven = await Promise.all(
    recorded.map(async (path): Promise<string | null> => {
      let stats;
      try {
        stats = await lstat(resolve(rootDir, path));
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT" ? path : null;
      }
      if (!stats.isFile()) return null;
      const expected = rendered.get(path);
      if (expected === undefined) return null;
      const text = await readFile(resolve(rootDir, path), "utf8").catch(() => null);
      return text !== null && lineEndingSpellings(text).includes(expected) ? path : null;
    }),
  );
  return new Set(proven.filter((path): path is string => path !== null));
}

/** The `command` of a Cursor hooks entry, or `null`. */
function cursorEntryCommand(element: unknown): string | null {
  if (element === null || typeof element !== "object" || Array.isArray(element)) return null;
  const command = (element as Record<string, unknown>)["command"];
  return typeof command === "string" ? command : null;
}

/** The memberHash of each 1.11.0 guard entry pin: what a forged co-owned record would list to claim an owner's entry. */
const RELEASE_ONE_ELEVEN_ENTRY_HASHES: ReadonlySet<string> = new Set([...CURSOR_1_11_0_GUARD_ENTRIES.values()].map((pin) => memberHash(pin.entry)));

/**
 * `.cursor/hooks.json`'s spec with the 1.11.0 guard entries pinned (row 585):
 * an entry whose command names a 1.11.0 guard name is the engine's only when it
 * deep-equals the entry 1.11.0 rendered for that name
 * (`CURSOR_1_11_0_GUARD_ENTRIES`), and only while that name is among
 * `guardPaths` ({@link cursorGuardPathsFor}); any other is the owner's.
 */
function withReleaseOneElevenGuardPins(spec: CoOwnedJsonSpec): CoOwnedJsonSpec {
  const pinned = (claims: (element: unknown) => boolean) => (element: unknown): boolean => {
    const command = cursorEntryCommand(element);
    const pin = command === null ? undefined : [...CURSOR_1_11_0_GUARD_ENTRIES].find(([path]) => command.includes(path))?.[1];
    return (pin === undefined || isDeepStrictEqual(element, pin.entry)) && claims(element);
  };
  return {
    ...spec,
    elements: spec.elements.map((element) => ({ ...element, recognise: pinned((e) => element.recognise(e)), inBound: pinned((e) => element.inBound(e)) })),
  };
}

/**
 * `ownership` with the 1.11.0 guard entry pins' hashes dropped from its
 * co-owned record. No release recorded one: 1.11.0's ledger carries no record,
 * and the first sync after it writes the `stamity-` entries. So a recorded pin
 * hash is a forged claim on an owner's entry, which the per-entry core would
 * otherwise read as the engine's (rule 1, `outsideBound: "backup"`); the
 * entry is the engine's only by {@link withReleaseOneElevenGuardPins}.
 */
function withoutReleaseOneElevenPinClaims(ownership: CoOwnedOwnership): CoOwnedOwnership {
  const elements = ownership.record?.elements;
  if (ownership.record === null || elements === undefined) return ownership;
  const kept = Object.fromEntries(Object.entries(elements).map(([pointer, hashes]) => [pointer, hashes.filter((hash) => !RELEASE_ONE_ELEVEN_ENTRY_HASHES.has(hash))]));
  return { ...ownership, record: { ...ownership.record, elements: kept } };
}

/** `lane` reading every ownership through {@link withoutReleaseOneElevenPinClaims}. */
function withoutPinClaims(lane: CoOwnedDocumentLane): CoOwnedDocumentLane {
  return {
    ...lane,
    predict: (absPath, emitted, ownership) => lane.predict(absPath, emitted, withoutReleaseOneElevenPinClaims(ownership)),
    materialize: (absPath, emitted, ownership) => lane.materialize(absPath, emitted, withoutReleaseOneElevenPinClaims(ownership)),
    reducer: (ownership, deleteWhenEngineOnly, rendered) => lane.reducer(withoutReleaseOneElevenPinClaims(ownership), deleteWhenEngineOnly, rendered),
  };
}

/**
 * The sweep refused a co-owned document, so the engine's claim to it stands:
 * its reducer refused it (it does not parse, or holds a shape it cannot read
 * back — the entry's `refused`), or the sweep would not rewrite it (a link, a
 * hard link, a file it cannot read). A document the reducer read and found
 * none of the engine's entries in is the owner's, and is no refusal (review/97).
 */
const sweepRefused = (entry: ReclaimActionEntry): boolean =>
  entry.action === "skipped-unsafe-path" || (entry.action === "skipped-user-content" && entry.refused === true);

/**
 * The pre-run ledger rows the live sweep's refusals hold in place (review/91):
 * those of each co-owned document in `coOwned` the sweep refused, and
 * those of each script a hooks document it left in place still runs
 * (`ReclaimReport.wiringKept`, S17). The ledger rebuild has already dropped
 * them — a removed client's rows, or a renamed or deselected path's — so they
 * go back whole, the recorded hash and the co-owned record included, and the
 * files stay the engine's to reclaim: once the owner repairs the document, the
 * next sync reduces it and deletes the scripts by their recorded hash. A
 * document the sweep reduced or deleted carries nothing, and nor does one
 * holding none of the engine's entries: it is the owner's (review/97). 1.11.0's renamed
 * guards are one case: a kept `.cursor/hooks.json` that still runs one keeps
 * its row, so the setup stays one that ran a release before the rename
 * ({@link cursorGuardPathsFor}, review/75). A file kept for any other reason —
 * a script edited by hand, a whole-file document its owner edited — is the
 * owner's, and its row is not carried. A file the rendering proof could not
 * judge, because the rendering could not be built (the entry's `unproven`,
 * review/61), keeps its row too: unproven is not disproven, so the next sync
 * tries the proof again.
 */
export function rowsCarriedThroughSweep(
  ledger: readonly LedgerEntry[],
  reclaimed: ReclaimReport | null,
  coOwned: { has(path: string): boolean },
): LedgerEntry[] {
  if (reclaimed === null) return [];
  const held = new Set(reclaimed.wiringKept?.flatMap((kept) => kept.scripts) ?? []);
  for (const entry of reclaimed.entries) {
    if ((coOwned.has(entry.path) && sweepRefused(entry)) || entry.unproven === true) held.add(entry.path);
  }
  return ledger.filter((row) => held.has(row.path) && VALID_TOOLS.has(row.adapter));
}

/**
 * A lane for a hooks document owned entry by entry on the core's own rules
 * (`../../manifest/hookDocuments.ts`, REQ-FLOW-037). `rejects` reads, for
 * Cursor, which entries the client would refuse in the document as the write
 * leaves it (S19); that sentence rides the prediction as `rejected` and the
 * write's result as a warning.
 */
function hookDocumentLane(
  path: string,
  spec: CoOwnedJsonSpec,
  rejects: (shown: string, text: string | null) => string | null = () => null,
): CoOwnedDocumentLane {
  const plan = (absPath: string, emitted: string, ownership: CoOwnedOwnership) => (existingRaw: string | null) =>
    planCoOwnedJson(absPath, emitted, existingRaw, spec, ownership);
  return {
    path,
    noun: spec.noun,
    wiresHooks: true,
    predict: async (absPath, emitted, ownership) => {
      const prediction = await predictCoOwnedMerge(absPath, plan(absPath, emitted, ownership), spec.noun);
      // Judged on the text the write would leave (`after`), absent only on a collision.
      const rejected = prediction.collision === null ? rejects(displayPath(absPath, ownership.boundaryDir), prediction.after ?? null) : null;
      return rejected === null ? prediction : { ...prediction, rejected };
    },
    materialize: async (absPath, emitted, ownership) => {
      const result = await materializeCoOwned(absPath, plan(absPath, emitted, ownership), ownership, spec.noun);
      const rejected = rejects(displayPath(absPath, ownership.boundaryDir), result.writtenContent);
      return rejected === null ? result : { ...result, warning: `${result.warning ?? ""} ${rejected}`.trim() };
    },
    reducer: (ownership, deleteWhenEngineOnly, rendered) => (content) =>
      reduceCoOwnedJson(content, spec, {
        record: ownership.record,
        legacy: ownership.legacy,
        deleteWhenEngineOnly,
        ...(rendered === undefined ? {} : { rendered }),
      }),
  };
}

/**
 * Every co-owned document lane, keyed by repo-relative path:
 * `.claude/settings.json` entry by entry, Cursor's and Codex's hook files
 * entry by entry (`../../manifest/hookDocuments.ts`), and `.codex/config.toml`
 * table by table (`../../manifest/codexConfigToml.ts`), all REQ-FLOW-037. The
 * Codex config's renderings resolve against `packServers`, and its legacy
 * proof reads `manifest`'s server selection. `ledger`, the rows the lanes
 * judge ownership from (`manifest`'s, or on init the previous setup's), says
 * which of Cursor's old guard names are still the engine's, and
 * `provenLegacy` ({@link provenLegacyCursorGuards}) narrows them to the ones
 * whose file is absent or is the guard 1.11.0 rendered for the setup; without
 * it the ledger alone says so. Either way an entry running an old name is the
 * engine's only as 1.11.0 rendered it ({@link withReleaseOneElevenGuardPins}).
 */
export function coOwnedDocumentLanes(
  manifest: SetupManifest | null,
  packServers: readonly PackSuppliedServer[] = [],
  ledger: readonly LedgerEntry[] = manifest?.ledger ?? [],
  provenLegacy?: ReadonlySet<string>,
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
  const cursorHooks = withoutPinClaims(
    hookDocumentLane(
      CURSOR_HOOKS_CONFIG_PATH,
      withReleaseOneElevenGuardPins(cursorHooksSpec({ guardPaths: cursorGuardPathsFor(ledger, provenLegacy) })),
      describeCursorHookDefects,
    ),
  );
  const codexHooks = hookDocumentLane(CODEX_HOOKS_FILE, codexHooksSpec());
  const render = codexConfigTableRendering(packServers);
  const selected = manifest?.mcp?.servers ?? [];
  const codexNoun = "Codex configuration";
  const codexPlan = (absPath: string, emitted: string, ownership: CoOwnedOwnership) => (existingRaw: string | null) =>
    planCodexConfigToml(absPath, emitted, existingRaw, ownership, render, selected);
  const codexConfig: CoOwnedDocumentLane = {
    path: CODEX_CONFIG_FILE,
    noun: codexNoun,
    // `[features]` turns Codex's hooks on and runs no command: the hook
    // commands live in `.codex/hooks.json`, so this document holds no script back.
    wiresHooks: false,
    // A kept `hooks = false` turns every Codex hook off, the engine's guards
    // included: the planner warns on the write, and the prediction carries it
    // as `rejected`, so `check` fails as it does on a Cursor entry Cursor
    // refuses (S19), judged on the text the write would leave.
    predict: async (absPath, emitted, ownership) => {
      const prediction = await predictCoOwnedMerge(absPath, codexPlan(absPath, emitted, ownership), codexNoun);
      const rejected = prediction.collision === null ? describeCodexHooksOff(displayPath(absPath, ownership.boundaryDir), prediction.after ?? null) : null;
      return rejected === null ? prediction : { ...prediction, rejected };
    },
    materialize: (absPath, emitted, ownership) =>
      materializeCoOwned(absPath, codexPlan(absPath, emitted, ownership), ownership, codexNoun),
    // Its re-render proof is `render`, built above from the catalog and
    // `packServers`; `coOwnedReclaimRenderings` carries nothing for this path.
    reducer: (ownership, deleteWhenEngineOnly) => (content) =>
      reduceCodexConfigToml(content, { record: ownership.record, legacy: ownership.legacy, selected, render, deleteWhenEngineOnly }),
  };
  return new Map([
    [claude.path, claude],
    [cursorHooks.path, cursorHooks],
    [codexHooks.path, codexHooks],
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
 * What the reclaim sweep reads to keep every hook script a hooks document it
 * leaves in place still runs (S17; `../../merge/reclaim.ts`
 * `hookDocuments`/`hookScripts`): the co-owned documents that wire hooks,
 * Copilot's whole-file `COPILOT_HOOKS_PATH` (kept whole when its owner edited
 * it), and the engine's reader of the scripts such a document runs — the
 * generated hooks folder, an installed pack's scripts, Cursor's guards, and
 * the scripts a portable runner's encoded row names. One builder for the sync
 * sweep, its preview and both of clean's.
 */
export function hookScriptRetention(
  manifest: SetupManifest,
  packServers: readonly PackSuppliedServer[] = [],
): { hookDocuments: ReadonlySet<string>; hookScripts: HookScriptReader } {
  return {
    hookDocuments: new Set([...coOwnedHookDocuments(manifest, packServers), COPILOT_HOOKS_PATH]),
    hookScripts: hookScriptReader(CURSOR_GUARD_PATHS),
  };
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
 * settings document. `provenLegacy` is {@link coOwnedDocumentLanes}'.
 */
export function coOwnedReclaimReducers(
  manifest: SetupManifest,
  packServers: readonly PackSuppliedServer[] = [],
  renderings: ReadonlyMap<string, unknown> = new Map(),
  provenLegacy?: ReadonlySet<string>,
): Map<string, CoOwnedReducer> {
  const reducers = mcpReclaimReducers(packServers);
  for (const lane of coOwnedDocumentLanes(manifest, packServers, manifest.ledger, provenLegacy).values()) {
    const ownership = coOwnedOwnershipOf(manifest.ledger, lane.path);
    reducers.set(lane.path, lane.reducer(ownership, ownership.deleteWhenEngineOnly, renderings.get(lane.path)));
  }
  return reducers;
}

/** The user hooks folder when the manifest names none (`../../emit/hooksInfra.ts`'s default). */
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;

/**
 * The renderings of the definitions in the user hooks folder each hooks
 * document's proof by re-rendering needs, for the reclaim sweep (S11;
 * `coOwnedReclaimReducers`' `renderings`): into `.claude/settings.json`, the
 * user-hook entries as the Claude adapter renders them now; into
 * `.cursor/hooks.json` and `.codex/hooks.json`, the entries a release up to
 * 1.6.0 wired them as directly (`../../manifest/hookDocuments.ts::directHookRendering`,
 * the build/54 sign-off) — the runner's entries are in the bound by path. An
 * entry equal to one of them is the engine's; one whose definition is gone, or
 * that differs, is outside the bound. None for a client whose hooks a plugin
 * carries (the repository renders none there), and none at all when the folder
 * cannot be read (nothing is then proved, so the backup is taken).
 */
export async function coOwnedReclaimRenderings(
  rootDir: string,
  manifest: SetupManifest,
): Promise<ReadonlyMap<string, unknown>> {
  const documents: [Tool, string, (rows: readonly UserHookDefinition[]) => unknown][] = [
    ["claude", CLAUDE_SETTINGS_PATH, (rows) => ({ hooks: claudeUserHookEntries(rows) })],
    ["cursor", CURSOR_HOOKS_CONFIG_PATH, (rows) => directHookRendering("cursor", rows)],
    ["codex", CODEX_HOOKS_FILE, (rows) => directHookRendering("codex", rows)],
  ];
  const rendered = documents.filter(([tool]) => !isPluginOwned(manifest, tool, "hooks"));
  if (rendered.length === 0) return new Map();
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
  const rows = read.hooks;
  return rows.length === 0 ? new Map() : new Map(rendered.map(([, path, render]) => [path, render(rows)]));
}

/**
 * v1 selection semantics: the full corpus, derived fresh each run. The
 * manifest's selection field is refreshed from this — it is the future
 * narrowing hook, not yet a filter. `sync`'s plan (`../commands/sync/engine.ts`)
 * and {@link engineRenderingsFor} select through it, so the rendering that
 * proves a delete is the emission `sync` would write.
 */
export function fullCorpusSelection(index: ContentIndex): ContentSelection {
  const items: Record<ContentClass, string[]> = { agent: [], skill: [], rule: [], command: [] };
  for (const item of index.items) items[item.type].push(item.id);
  return { items };
}

/**
 * Plans the emission for `manifest` the way the calling verb plans its own —
 * the emission seam (`./emission.ts::getEmissionPlanner`) with the running
 * engine's version and this installation's package identity, and `facts` as
 * detected. The caller supplies it because this module sits beside that seam
 * in the layering and may not import it (`test/architecture`): `sync` and
 * `clean` sit above both.
 */
export type EmissionPlanFor = (
  manifest: SetupManifest,
  facts: { monorepoPackages: readonly PackageEntry[] },
) => Promise<readonly AdapterOutput[]>;

/**
 * What the rendering proof hands the reclaim sweep, shaped as the sweep's own
 * options (`../../merge/reclaim.ts` `ReclaimOptions.renderings` and
 * `renderingsUnbuilt`), so a caller spreads it in.
 */
export interface RenderingProof {
  /** Repo-relative path → the SHA-256 of each rendering the running engine produces there. */
  renderings: Map<string, Set<string>>;
  /** The first line of the error that stopped the plan, when it could not be built. */
  renderingsUnbuilt?: string;
}

/**
 * The SHA-256 of each rendering the running engine produces at `paths`, for the
 * reclaim sweep's rendering proof (`../../merge/reclaim.ts`
 * `ReclaimOptions.renderings`, REQ-PLUGIN-046): the emission plan for the
 * clients this setup wrote for, over the bundled corpus, the override tree and
 * the installed packs `manifest` records, hashed at the requested paths that
 * `../../manifest/ownedPaths.ts::needsRenderingProof` names, and only those.
 *
 * The clients this setup wrote for are the manifest's `tools` plus every client
 * a ledger row names (a `pack:` owner is not a client), each in repository
 * mode: a client deselected since setup, or one whose classes a plugin now
 * carries (`plugin setup`), is the common reason a content file becomes a
 * candidate, and its unedited files are still what the engine renders for it
 * there. Not every client in `TOOLS`: a rule-skill records the selected clients
 * in its own bytes (`metadata.stamity.tools`), so a render for every client is
 * not what a narrower setup wrote. The manifest handed to `planFor` is built
 * the way `sync` builds its own (`../commands/sync/engine.ts::planSync`):
 * full-corpus selection and fresh detection, with those clients selected and
 * no plugin record, and with every installed pack rendered whatever the org
 * policy says (`../../pack/projection.ts::ignoringPolicyDenialForProof`): the
 * copies a pack projected before the policy denied it are still the engine's,
 * and keeping them would leave the denied pack active in every client. The
 * plan is hashed and discarded, never written. The calling verb prints its own
 * plan's pack-policy lines, so this second plan prints none
 * (`../../pack/projection.ts::withoutPolicyWarningPrint`).
 *
 * Plans nothing when no path needs the proof. A plan that cannot be built — a
 * corpus or pack read that fails, a pack the planner refuses — yields no
 * rendering, so every file that needs one is kept rather than deleted: the
 * proof fails closed. It then says why (`renderingsUnbuilt`), so the sweep
 * keeps those files unjudged, with their rows, and names the cause rather
 * than an owner's file (review/61).
 *
 * At Cursor's two 1.11.0 guard names the rendering is never the running
 * engine's: it is the guard the frozen 1.11.0 builder renders for this setup
 * under `legacyCursor` ({@link releaseOneElevenGuardsFor}, REQ-FLOW-038), and
 * no plan is run for it. Without `legacyCursor` there is none, so both old
 * guards are kept.
 */
export async function engineRenderingsFor(
  rootDir: string,
  manifest: SetupManifest,
  paths: Iterable<string>,
  planFor: EmissionPlanFor,
  legacyCursor?: LegacyCursorIdentity,
): Promise<RenderingProof> {
  const renderings = new Map<string, Set<string>>();
  const wanted = new Set([...paths].filter(needsRenderingProof));
  const legacy = LEGACY_CURSOR_GUARD_PATHS.filter((path) => wanted.delete(path));
  if (legacy.length > 0 && legacyCursor !== undefined) {
    const guards = releaseOneElevenGuardsFor(manifest.ledger, legacyCursor);
    for (const path of legacy) {
      const bytes = guards.get(path);
      if (bytes !== undefined) renderings.set(path, new Set([sha256(bytes)]));
    }
  }
  if (wanted.size === 0) return { renderings };
  let outputs: readonly AdapterOutput[];
  try {
    const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
    const setupClients = structuredClone(manifest);
    setupClients.tools = TOOLS.filter(
      (tool) => manifest.tools.includes(tool) || manifest.ledger.some((row) => row.adapter === tool),
    );
    setupClients.selection = fullCorpusSelection(index);
    setupClients.detected = summarizeDetection(repoInfo);
    delete setupClients.plugin;
    outputs = await withoutPolicyWarningPrint(() =>
      ignoringPolicyDenialForProof(() => planFor(setupClients, { monorepoPackages: repoInfo.monorepoPackages })),
    );
    // reason: not silent — with no rendering nothing is proved, and the sweep
    // keeps each file that needed one, with its row, and names this reason.
  } catch (error) {
    return {
      renderings,
      renderingsUnbuilt: (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "",
    };
  }
  for (const output of outputs) {
    if (!wanted.has(output.path)) continue;
    const hashes = renderings.get(output.path) ?? new Set<string>();
    hashes.add(sha256(output.content));
    renderings.set(output.path, hashes);
  }
  return { renderings };
}
