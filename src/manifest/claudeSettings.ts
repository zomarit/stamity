/**
 * `.claude/settings.json` — a document three parties write, owned PER ENTRY
 * (REQ-FLOW-036, REQ-PLUGIN-015).
 *
 * The client's own `plugin install … --scope project` records the install in
 * this file as an `enabledPlugins` key (measured on Claude Code 2.1.278,
 * 2026-09-22). An operator sets `model`, `env`, `permissions.deny`, `ask`, rows
 * and hook entries of their own. The engine renders hook entries (one element
 * of a `hooks.<Event>` array) while the repository owns hooks, and no
 * `permissions.allow` row; releases up to 1.12.0 rendered three, which leave
 * through the bound below. No comment syntax can carry a marker, so ownership is
 * decided per ENTRY by the shared core (`./coOwnedJson.ts`, whose rules this
 * module only parameterises): **the engine owns each allow row and each hook
 * entry it wrote, recorded on the ledger row by the hash of its canonical JSON
 * (`LedgerEntry.coOwned`), and nothing else in the file.** It never writes,
 * replaces or removes `permissions.deny`, `permissions.ask`, any other member
 * of `permissions`, or an entry it did not write; the file keeps its own
 * indentation, key order, line ending and final newline.
 *
 * The bound ({@link claudeSettingsSpec}). An engine entry leaves silently only
 * when it lies inside what the engine can prove it wrote by path: an allow row
 * a release rendered ({@link ENGINE_PERMISSION_ROWS}), or a hook entry whose
 * every command executes one of the engine's own scripts — under
 * `.stamity/generated/hooks/` or an installed pack's `.stamity/packs/<id>/`,
 * never the user's `.stamity/hooks/` (`./coOwnedJson.ts::commandRunsStateScript`).
 * A recorded allow row outside
 * that bound is the owner's whatever the record says; a recorded hook entry
 * outside it leaves only behind a verified `.bak`, with a warning naming it.
 *
 * Recognition ({@link isEngineHookGroup}). A hook entry with a command under
 * the engine's generated hooks directory is the engine's to touch even with no
 * ledger row: a lost setup leaves one behind, and under a plugin-backed setup
 * a wiring pointing at scripts that are not there fails closed on every tool
 * call. Recognition only ever WIDENS what the engine may touch; an entry it
 * cannot prove it wrote goes behind the backup, with the warning naming it and
 * the client's per-user project settings, where personal rows belong.
 *
 * The file collides (`co-owned-shape`) only when it is not a JSON object,
 * cannot be serialised back, or a member the engine writes into has another
 * type: `permissions` not an object, `allow` not an array, `hooks` not an
 * object, an event not an array. Nothing in that collision is the engine's to
 * replace, so `--force` does not clear it and no message offers it. A symbolic
 * or hard link at the path is refused before any read (`shared-name`).
 *
 * Pure planning, then a write under the path's lock: {@link planClaudeSettings}
 * decides from bytes alone, so the sync plan and `check`'s drift gate preview
 * the write exactly, and {@link materializeClaudeSettings} performs it. The
 * reclaim sweep's view of the same document is
 * {@link reduceClaudeSettingsToForeignContent}.
 */

import { isPlainObject } from "../config/parse.ts";
import type { CoOwnedReducer, CoOwnedReduction } from "../types/content.ts";
import type { CoOwnership } from "../types/manifest.ts";
import { HOOKS_GENERATED_DIR } from "../types/markers.ts";
import {
  commandRunsStateScript,
  materializeCoOwned,
  planCoOwnedJson,
  predictCoOwnedMerge,
  reduceCoOwnedJson,
  type CoOwnedJsonSpec,
  type CoOwnedMergeResult,
  type CoOwnedOwnership,
  type CoOwnedPlan,
  type CoOwnedPrediction,
  type MemberSpec,
} from "./coOwnedJson.ts";

/** The noun the shared read-failure and refusal sentences name for this lane. */
const DOCUMENT = "settings document";

/**
 * The allow rows a release rendered. Every release from v1.1.0 to 1.12.0
 * rendered these three; the engine renders none now, because a bare `Read`
 * matches every file read anywhere and only took the client's prompt off
 * reads outside the project. The names stay as the bound, so a row the ledger
 * records leaves silently on the next sync, and an equal row it does not
 * record stays the owner's. `test/adapters/claude.test.ts` pins the list.
 */
export const ENGINE_PERMISSION_ROWS: readonly string[] = ["Read", "Grep", "Glob"];

/** The command strings of a hook entry `{ matcher?, hooks: [...] }`, or `null` when it is not one. */
function commandsOf(element: unknown): string[] | null {
  if (!isPlainObject(element) || !Array.isArray(element["hooks"])) return null;
  const commands: string[] = [];
  for (const hook of element["hooks"]) {
    if (!isPlainObject(hook) || typeof hook["command"] !== "string") return null;
    commands.push(hook["command"]);
  }
  return commands;
}

/**
 * True for a hook entry some command of which runs a script under the
 * engine's generated hooks directory. Only the engine writes there. Not a
 * proof of authorship — only the licence to touch the entry behind a backup.
 */
export function isEngineHookGroup(element: unknown): boolean {
  if (!isPlainObject(element) || !Array.isArray(element["hooks"])) return false;
  return element["hooks"].some(
    (hook) => isPlainObject(hook) && typeof hook["command"] === "string" && hook["command"].includes(`${HOOKS_GENERATED_DIR}/`),
  );
}

/** A hook entry with commands, every one of which executes one of the engine's own scripts. */
function hookGroupInBound(element: unknown): boolean {
  const commands = commandsOf(element);
  return commands !== null && commands.length > 0 && commands.every(commandRunsStateScript);
}

/**
 * What the engine owns in `.claude/settings.json`: each hook entry it writes,
 * and each allow row an earlier release wrote (the slot stays declared so a
 * recorded row can leave; the rendering carries none). `extraMembers` is the extension point for whole members a later
 * requirement declares (passed as `{ pointer, foreign: "yield" }`).
 */
export function claudeSettingsSpec(extraMembers: readonly MemberSpec[] = []): CoOwnedJsonSpec {
  return {
    noun: DOCUMENT,
    elements: [
      {
        pointer: "/permissions/allow",
        recognise: () => false,
        inBound: (element) => typeof element === "string" && ENGINE_PERMISSION_ROWS.includes(element),
        outsideBound: "foreign",
      },
      { pointer: "/hooks/*", recognise: isEngineHookGroup, inBound: hookGroupInBound, outsideBound: "backup" },
    ],
    members: extraMembers,
    personalHint: "Personal rows belong in .claude/settings.local.json, which this engine never writes.",
  };
}

/** What the caller knows about the target that the bytes cannot say. */
export type SettingsOwnership = CoOwnedOwnership;
/** What {@link materializeClaudeSettings} WOULD do, computed from bytes alone. */
export type SettingsPlan = CoOwnedPlan;
/** What a merge into the document would do, and how a plan classifies a refusal. */
export type SettingsMergePrediction = CoOwnedPrediction;
/** A merge outcome plus the bytes and the record the file holds afterwards. */
export type SettingsMergeResult = CoOwnedMergeResult;

/** Decide the write for `filePath` from the bytes alone, by the core's rules. */
export function planClaudeSettings(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: SettingsOwnership,
): SettingsPlan {
  return planCoOwnedJson(filePath, emitted, existingRaw, claudeSettingsSpec(), ownership);
}

/**
 * Run the real planning over the bytes on disk and write nothing. The link
 * refusal runs ahead of the read, so no linked byte is read or quoted.
 */
export function predictClaudeSettingsMerge(
  filePath: string,
  emitted: string,
  ownership: SettingsOwnership,
): Promise<SettingsMergePrediction> {
  return predictCoOwnedMerge(filePath, (existingRaw) => planClaudeSettings(filePath, emitted, existingRaw, ownership), DOCUMENT);
}

/**
 * Write `emitted` into `filePath` entry by entry, through the core's locked
 * write (containment, lock, link refusal, read, plan, backup, write), and hand
 * back the merged bytes and the record for the ledger row.
 */
export function materializeClaudeSettings(
  filePath: string,
  emitted: string,
  ownership: SettingsOwnership,
): Promise<SettingsMergeResult> {
  return materializeCoOwned(
    filePath,
    (existingRaw) => planClaudeSettings(filePath, emitted, existingRaw, ownership),
    ownership,
    DOCUMENT,
  );
}

/** What the sweep knows about the path: the ledger's record, and whether it is a 1.11.0 row. */
export interface SettingsReduceOptions {
  record: CoOwnership | null;
  legacy: boolean;
  deleteWhenEngineOnly: boolean;
  /**
   * The engine's current rendering of what it would write here, for the proof
   * by re-rendering — today the user-hook entries of the definitions still in
   * the user hooks folder (`../cli/engine/emissionWrite.ts::coOwnedReclaimRenderings`).
   */
  rendered?: unknown;
}

/**
 * What should be left of `raw` once the engine's entries are taken out — the
 * reclaim sweep's view of this document (`../merge/reclaim.ts` gate 4). A
 * stale repository-mode hook entry is recognised and leaves with the rest; an
 * owner's entry, and every member the engine does not write into, stays.
 */
export function reduceClaudeSettingsToForeignContent(raw: string, opts: SettingsReduceOptions): CoOwnedReduction {
  return reduceCoOwnedJson(raw, claudeSettingsSpec(), opts);
}

/** The reducer the reclaim sweep is handed for this path (`ReclaimOptions.coOwnedPaths`). */
export function claudeSettingsReclaimReducer(opts: SettingsReduceOptions): CoOwnedReducer {
  return (content: string): CoOwnedReduction => reduceClaudeSettingsToForeignContent(content, opts);
}
