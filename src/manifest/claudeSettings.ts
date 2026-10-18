/**
 * `.claude/settings.json` — a document three parties write, owned PER ENTRY
 * (REQ-FLOW-036, REQ-PLUGIN-015).
 *
 * The client's own `plugin install … --scope project` records the install in
 * this file as an `enabledPlugins` key (measured on Claude Code 2.1.278,
 * 2026-09-22). An operator sets `model`, `env`, `permissions.deny`, `ask`, rows
 * and hook entries of their own. The engine renders hook entries (one element
 * of a `hooks.<Event>` array) while the repository owns hooks, the person-only
 * `permissions.deny` rows (`CLAUDE_DENY_ROWS`, REQ-FLOW-124) and
 * `permissions.ask` rows (`CLAUDE_ASK_ROWS`, REQ-FLOW-123), and no
 * `permissions.allow` row; releases up to 1.12.0 rendered three, which leave
 * through the bound below. No comment syntax can carry a marker, so ownership is
 * decided per ENTRY by the shared core (`./coOwnedJson.ts`, whose rules this
 * module only parameterises): **the engine owns each allow row, deny row, ask
 * row and hook entry it wrote, recorded on the ledger row by the hash of its
 * canonical JSON (`LedgerEntry.coOwned`), and nothing else in the file.** It
 * never replaces or removes a deny or ask row, any other member of
 * `permissions`, or an entry it did not write; the file keeps its own
 * indentation, key order, line ending and final newline.
 *
 * The deny and ask rows ({@link ROW_POINTERS}, REQ-FLOW-036) only ever grow. A
 * hash cannot tell the engine's row from an owner's equal one, whether the owner
 * wrote it before setup, after it, under a 1.11.0 ledger row (no release up to
 * 1.11.0 wrote a deny or ask row) or after the ledger lost its record. So no row
 * of either list is ever judged the engine's: `sync` keeps every row byte for
 * byte, in its place, and appends only the engine's rows the list lacks
 * ({@link renderingToAdd}); `clean` removes none and names the rows of either
 * list equal to an engine row of either table that it left, for the person to
 * remove by hand ({@link reduceClaudeSettingsToForeignContent}). Keeping a
 * protective row is the safe direction, and an owner's deny row equal to an
 * engine ask row is read by the client before the ask, so it still refuses. The
 * record still lists the engine's rows it added, and keeps them while they stay.
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
 * cannot be serialised back, or a member the engine writes into, or wrote into
 * up to 1.12.0, has another type: `permissions` not an object or `allow` not an
 * array (on both routes, though the rendering carries no allow row now; see
 * {@link planClaudeSettings}), `hooks` not an object or an event not an array
 * (where the rendering carries hooks). Nothing in that collision is the
 * engine's to replace, so `--force` does not clear it and no message offers
 * it. A symbolic or hard link at the path is refused before any read
 * (`shared-name`).
 *
 * Pure planning, then a write under the path's lock: {@link planClaudeSettings}
 * decides from bytes alone, so the sync plan and `check`'s drift gate preview
 * the write exactly, and {@link materializeClaudeSettings} performs it. The
 * reclaim sweep's view of the same document is
 * {@link reduceClaudeSettingsToForeignContent}.
 */

import { isPlainObject } from "../config/parse.ts";
import { CLAUDE_ASK_ROWS, CLAUDE_DENY_ROWS } from "../hooks/personOnly.ts";
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
import { memberHash } from "./jsonMembers.ts";

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

/** The array the engine's person-only deny rows go into. */
const DENY_POINTER = "/permissions/deny";
/** The array the engine's person-only ask rows go into (REQ-FLOW-123). */
const ASK_POINTER = "/permissions/ask";
/** The two row lists the engine co-owns, each with its key under `permissions`. */
const ROW_POINTERS = [
  { pointer: DENY_POINTER, key: "deny" },
  { pointer: ASK_POINTER, key: "ask" },
] as const;

/**
 * What the engine owns in `.claude/settings.json`: each hook entry it writes,
 * each person-only deny and ask row it writes, and each allow row an earlier
 * release wrote (the slot stays declared so a recorded row can leave; the
 * rendering carries none). A deny or ask row is never the engine's to move or
 * remove: it is not recognised by content and lies in no bound, so with
 * `foreign` a recorded one is the owner's too, and the core keeps every row. The
 * slots stay declared so the core still refuses a `deny` or `ask` of another
 * type and places the rows it lacks.
 * `extraMembers` is the extension point for whole members a later
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
      { pointer: DENY_POINTER, recognise: () => false, inBound: () => false, outsideBound: "foreign" },
      { pointer: ASK_POINTER, recognise: () => false, inBound: () => false, outsideBound: "foreign" },
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

/**
 * Decide the write for `filePath` from the bytes alone, by the core's rules.
 *
 * The core checks the type of only the containers the rendering writes into,
 * and the rendering carries no allow row now. A `permissions` that is not an
 * object, or an `allow` that is not an array, still collides as it did while
 * releases up to 1.12.0 rendered the rows (REQ-FLOW-036): such a file is one
 * the client may not load, hooks included, and `check` exiting 1 is the
 * owner's one signal. The refusal is the core's own, planned over the rendering
 * with {@link ENGINE_PERMISSION_ROWS} put back, so its class and text are the
 * ones those releases printed; that plan is returned only when it refuses, so
 * the rows are never written.
 *
 * The deny and ask rows are planned over {@link renderingToAdd}, so the core
 * sees only the engine's rows each list lacks and keeps every row already there,
 * and the record is {@link withRowRecord}'s.
 */
export function planClaudeSettings(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: SettingsOwnership,
): SettingsPlan {
  const toAdd = renderingToAdd(emitted, existingRaw);
  const plan = withRowRecord(planCoOwnedJson(filePath, toAdd, existingRaw, claudeSettingsSpec(), ownership), existingRaw, ownership);
  if (plan.collision !== null || existingRaw === null || !allowContainerMistyped(existingRaw)) return plan;
  // The rendering's own `permissions` (its deny and ask rows) kept beside the allow rows put back.
  const rendering = JSON.parse(toAdd) as Record<string, unknown>;
  const permissions = isPlainObject(rendering["permissions"]) ? rendering["permissions"] : {};
  const withRows = `${JSON.stringify({ ...rendering, permissions: { allow: ENGINE_PERMISSION_ROWS, ...permissions } })}\n`;
  const refused = planCoOwnedJson(filePath, withRows, existingRaw, claudeSettingsSpec(), ownership);
  return refused.collision !== null ? refused : plan;
}

/**
 * The `permissions.<key>` array `raw` holds, or `null` when it holds none: no
 * such array, or bytes that do not parse (the core names that failure).
 */
function rowsOf(raw: string, key: "deny" | "ask"): readonly unknown[] | null {
  let doc: unknown;
  try {
    doc = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    // reason: not silent — the core parses the same bytes and refuses them by name.
  } catch {
    return null;
  }
  if (!isPlainObject(doc) || !isPlainObject(doc["permissions"])) return null;
  const rows = doc["permissions"][key];
  return Array.isArray(rows) ? rows : null;
}

/**
 * The rendering with every deny and ask row the existing file already holds in
 * the same list taken out. The core claims an element equal to a rendered one
 * (under a 1.11.0 row) or to a recorded one (after setup), collapsing an owner's
 * copy into the engine's block; with those rows out of the rendering, and the
 * row specs bounding nothing, every row in the file is foreign to it, so it
 * keeps each in place and appends only the rows the list lacks. Unchanged when
 * the file holds no such row, so a created file is the rendering byte for byte.
 */
function renderingToAdd(emitted: string, existingRaw: string | null): string {
  let rendering: Record<string, Record<string, unknown>> | null = null;
  for (const { key } of ROW_POINTERS) {
    const present = new Set((rowsOf(existingRaw ?? "", key) ?? []).map(memberHash));
    const rendered = present.size === 0 ? null : rowsOf(emitted, key);
    if (rendered === null) continue;
    rendering ??= JSON.parse(emitted) as Record<string, Record<string, unknown>>;
    const rows = rendered.filter((row) => !present.has(memberHash(row)));
    rendering = { ...rendering, permissions: { ...rendering["permissions"], [key]: rows } };
  }
  return rendering === null ? emitted : `${JSON.stringify(rendering)}\n`;
}

/**
 * The plan with its deny and ask records made whole, per list: the engine's
 * rows the previous record holds that are still in the list, then the rows this
 * write adds (the core records only those, having seen only those). A previous
 * hash counts only for a row of either engine table ({@link isEngineRow}), so a
 * forged record grows nothing, and the record of a file nobody edited stays as
 * it was. Under a 1.11.0 row or on adoption there is no previous record: a row
 * already in the file is never recorded as the engine's.
 */
function withRowRecord(plan: SettingsPlan, existingRaw: string | null, ownership: SettingsOwnership): SettingsPlan {
  if (plan.record === null) return plan;
  const pointers: ReadonlySet<string> = new Set(ROW_POINTERS.map((entry) => entry.pointer));
  const elements = Object.entries(plan.record.elements ?? {}).filter(([pointer]) => !pointers.has(pointer));
  for (const { pointer, key } of ROW_POINTERS) {
    const previous = ownership.owned && !ownership.legacy ? (ownership.record?.elements?.[pointer] ?? []) : [];
    const present = new Set((rowsOf(existingRaw ?? "", key) ?? []).filter(isEngineRow).map(memberHash));
    const hashes = new Set([...previous.filter((hash) => present.has(hash)), ...(plan.record.elements?.[pointer] ?? [])]);
    if (hashes.size > 0) elements.push([pointer, [...hashes]]);
  }
  // The manifest writer canonicalises the record, so the key order here reaches no byte.
  const record: CoOwnership = { ...plan.record, elements: Object.fromEntries(elements) };
  if (elements.length === 0) delete record.elements;
  return { ...plan, record };
}

/** True for a row of either of the engine's person-only tables, deny or ask. */
function isEngineRow(row: unknown): row is string {
  return typeof row === "string" && (CLAUDE_DENY_ROWS.includes(row) || CLAUDE_ASK_ROWS.includes(row));
}

/**
 * True when the document's own `permissions` member is present and not an
 * object, or its `allow` is present and not an array. Read only after the core
 * parsed the same bytes as a JSON object, so the parse cannot fail here.
 */
function allowContainerMistyped(existingRaw: string): boolean {
  const doc: unknown = JSON.parse(existingRaw.charCodeAt(0) === 0xfeff ? existingRaw.slice(1) : existingRaw);
  if (!isPlainObject(doc) || !Object.hasOwn(doc, "permissions")) return false;
  const permissions = doc["permissions"];
  if (!isPlainObject(permissions)) return true;
  return Object.hasOwn(permissions, "allow") && !Array.isArray(permissions["allow"]);
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
 *
 * No `permissions.deny` or `permissions.ask` row leaves, whatever the record
 * says: the row specs bound nothing, and the rendering handed in is read without
 * its `permissions` (the engine renders no allow row, and a row it renders
 * proves nothing), so none is in the bound by re-rendering either. The rows of
 * either list equal to a row of either engine table that stay are named in the
 * detail (REQ-FLOW-036), so the person can remove them by hand; only table rows
 * are named, so a forged record names nothing of the owner's and no text the
 * file carries reaches the line.
 */
export function reduceClaudeSettingsToForeignContent(raw: string, opts: SettingsReduceOptions): CoOwnedReduction {
  const rendered = isPlainObject(opts.rendered) ? { ...opts.rendered, permissions: {} } : opts.rendered;
  const reduction = reduceCoOwnedJson(raw, claudeSettingsSpec(), { ...opts, rendered });
  const lists = ROW_POINTERS.flatMap(({ key }) => {
    const left = [...new Set((rowsOf(raw, key) ?? []).filter(isEngineRow))];
    return left.length === 0 ? [] : [`permissions.${key} (${left.map((row) => JSON.stringify(row)).join(", ")})`];
  });
  if (lists.length === 0 || reduction.kind === "engine-only" || (reduction.kind === "untouched" && reduction.refused)) return reduction;
  const named =
    `It left the rows equal to the engine's in ${lists.join(" and ")}: ` +
    `clean removes no deny row and no ask row, as an equal one may be yours. Remove the ones you do not want by hand.`;
  return { ...reduction, detail: `${reduction.kind === "reduced" ? reduction.detail : `Co-owned ${DOCUMENT}: nothing was removed.`} ${named}` };
}

/** The reducer the reclaim sweep is handed for this path (`ReclaimOptions.coOwnedPaths`). */
export function claudeSettingsReclaimReducer(opts: SettingsReduceOptions): CoOwnedReducer {
  return (content: string): CoOwnedReduction => reduceClaudeSettingsToForeignContent(content, opts);
}
