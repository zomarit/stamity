/**
 * `.claude/settings.json` — key-level ownership of a document two other
 * parties write.
 *
 * The client's own `plugin install … --scope project` records the install in
 * this file as an `enabledPlugins` key (measured on Claude Code 2.1.278,
 * 2026-09-22: that key alone, in two-space JSON — the marketplace record lands
 * in the user-scope settings of the configuration directory, never here). An
 * operator sets `model`, `env` and whatever else the client documents. The
 * engine renders `permissions`, and `hooks` when the repository owns hooks.
 * Three writers, one file, no comment syntax to carry a marker — so ownership
 * is decided per TOP-LEVEL KEY: **the engine owns exactly the keys its
 * rendering carries; every other key is foreign and is kept verbatim, in its
 * position.** Whole-file ownership, which this lane replaces, skipped the file
 * when the client had written it first (no ledger row, no marker) and then had
 * `check` recommend a remedy that destroys the install record; in the other
 * order it read the client's key as hand-edit drift and regenerated the file
 * whole behind a `.bak`.
 *
 * Every function here holds the same invariant the MCP merge lane holds for
 * the three client MCP documents (`./mcpFilter.ts`): **a key the engine does
 * not render is never removed and never overwritten.** The differences from
 * that lane are the ones the document forces. Ownership is by key name, not by
 * a ledger of ids, because the rendering's keys ARE the claim: `permissions` is
 * the engine's whether or not a row records it, and an `enabledPlugins` is the
 * client's whether or not the engine wrote the file. And the collision rule
 * keeps one refusal the MCP lane has no equivalent of: an engine-owned key
 * already present with DIFFERENT content, in a file no ledger row proves the
 * engine wrote, is hand-written or a predecessor's — a live hook or permission
 * wiring — and replacing it silently is exactly the write the whole-file lane
 * refused. It still refuses, and `force` still clears it behind a verified
 * `.bak` of the file, so the two remedies every collision message names stay
 * true. An engine-owned key whose content already EQUALS the rendering proves
 * nothing against the engine and is adopted. A file that does not parse as a
 * JSON object is the other collision: nothing in it can be kept beside the
 * generated keys, so without `force` it is left alone, and with `force` it is
 * replaced whole behind the same `.bak`.
 *
 * What a `.bak` no longer protects is a hand-edit INSIDE an engine-owned key
 * of a file the ledger claims. The key is the engine's by contract and is
 * regenerated on every write, like a managed MCP entry is refreshed from the
 * emission; the operator's own keys never needed the backup, because they
 * survive in place. That is the one contract change this lane makes on
 * purpose, and the report line that used to say "edited by hand since" has no
 * true replacement here — a difference in an engine-owned key is as often the
 * engine's own rendering moving as it is an edit.
 *
 * Every writer here preserves the document's own bytes and republishes them,
 * so every writer first refuses a target whose bytes are not that file's alone
 * ({@link refuseLinkedSettingsTarget}) — a symbolic link would have its target's
 * keys copied into the tree as a fresh regular file, and a hard link would
 * become an independent copy of bytes another name still holds.
 *
 * Pure planning, then a write: {@link planClaudeSettings} decides from bytes
 * alone, so the sync plan and `check`'s drift gate preview the write exactly,
 * and {@link materializeClaudeSettings} performs it. The reclaim sweep's view
 * of the same document is {@link reduceClaudeSettingsToForeignContent}, which
 * takes the engine's keys out and reports whether anything else is left.
 */

import { lstat, readFile } from "node:fs/promises";
import { isPlainObject } from "../config/parse.ts";
import { atomicWriteFile, isSharedRegularFile } from "../merge/atomicWrite.ts";
import { backupBeforeOverwrite } from "../merge/safeWrite.ts";
import type { CoOwnedReducer, CoOwnedReduction, MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";

// ── Parsing ──────────────────────────────────────────────────────

type ObjectParse =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string };

/** A JSON object, or the reason the bytes are not one. Never throws. */
function parseObject(raw: string): ObjectParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
    // reason: not silent — the failure is returned and every caller surfaces it.
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: `top-level value is ${describeValue(parsed)}, expected a JSON object` };
  }
  return { ok: true, doc: parsed };
}

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

/** 2-space JSON with a trailing newline — the engine's own style, and the client's. */
function jsonDocument(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

// ── Link guard ───────────────────────────────────────────────────

/**
 * Refuse before reading when `filePath`'s bytes are not that file's alone. A
 * missing file is not a linked one: ENOENT falls through so `created` works.
 */
async function refuseLinkedSettingsTarget(filePath: string): Promise<void> {
  let entry;
  try {
    entry = await lstat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (entry.isSymbolicLink()) {
    throw new EngineError(
      `Refusing to merge into ${filePath}: it is a symbolic link, so the top-level keys this ` +
        `merge would keep beside the generated ones are not this file's — they are whatever the ` +
        `link points at, which may sit outside this tree. The merge writes through temp+rename, ` +
        `so the link would be replaced by a regular file inside the repository holding those ` +
        `keys. Nothing was written. Replace the link with a regular file, or delete it and ` +
        `re-run to regenerate it.`,
      { code: "FS_ERROR" },
    );
  }
  if (isSharedRegularFile(entry)) {
    throw new EngineError(
      `An existing file occupies ${filePath} and it is a hard link — its contents carry a second ` +
        `name this tree cannot see, which may sit outside it. This document is merged rather than ` +
        `overwritten, so every top-level key already in it is kept and republished through ` +
        `temp+rename: on a shared name that lands a fresh inode holding bytes that were never this ` +
        `file's alone. Nothing was written, and force does not help: this lane's backup refuses the ` +
        `same file. Replace it with a regular file — copy the contents to a new file and move that ` +
        `over this name — or delete it and re-run to regenerate it.`,
      { code: "FS_ERROR" },
    );
  }
}

// ── Planning ─────────────────────────────────────────────────────

/** What the caller knows about the target that the bytes cannot say. */
export interface SettingsOwnership {
  /** A ledger row records the engine wrote this path. */
  owned: boolean;
  /** The operator asked for the collision to be cleared behind a `.bak`. */
  force: boolean;
}

/** What {@link materializeClaudeSettings} WOULD do, computed from bytes alone. */
export interface SettingsPlan {
  result: MergeResult;
  /** The bytes to write; `null` when nothing needs writing. */
  content: string | null;
  /** The previous file, when the write owes a verified `.bak` of it first (`force` over a collision). */
  backup: string | null;
  /** Why the write is refused, when `result.action` is `skipped`. The same text as `result.warning`. */
  collision: string | null;
}

/**
 * The top-level keys `emitted` carries — the engine's claim on the document.
 * Throws `ADAPTER_ERROR` when the emission is not a JSON object: the adapter
 * produced it, so that is an engine bug and fails loudly rather than skipping.
 */
export function engineOwnedSettingsKeys(filePath: string, emitted: string): readonly string[] {
  return Object.keys(parseEmitted(filePath, emitted));
}

function parseEmitted(filePath: string, emitted: string): Record<string, unknown> {
  const parsed = parseObject(emitted);
  if (!parsed.ok) {
    throw new EngineError(
      `Refusing to write ${filePath}: the emitted settings document is not valid JSON (${parsed.error}).`,
      { code: "ADAPTER_ERROR" },
    );
  }
  return parsed.doc;
}

/** Deep equality by the one spelling both sides share: the JSON text. */
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * `existing` with every engine-owned key replaced by the rendering — in place
 * when the key is already there, appended in rendering order when it is not —
 * and every other key carried through untouched, in its position.
 */
function mergeOwnedKeys(
  existing: Record<string, unknown>,
  emitted: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(existing)) {
    merged[key] = Object.hasOwn(emitted, key) ? emitted[key] : value;
  }
  for (const [key, value] of Object.entries(emitted)) {
    if (!Object.hasOwn(merged, key)) merged[key] = value;
  }
  return merged;
}

function skipped(filePath: string, reason: string): SettingsPlan {
  return {
    result: { path: filePath, action: "skipped", warning: reason },
    content: null,
    backup: null,
    collision: reason,
  };
}

/**
 * Decide the write for `filePath` from the bytes alone. See the module header
 * for the ownership rule and the two collisions it keeps.
 */
export function planClaudeSettings(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: SettingsOwnership,
): SettingsPlan {
  const emittedDoc = parseEmitted(filePath, emitted);
  if (existingRaw === null) {
    return { result: { path: filePath, action: "created" }, content: emitted, backup: null, collision: null };
  }

  const existing = parseObject(existingRaw);
  if (!existing.ok) {
    if (!ownership.force) {
      return skipped(
        filePath,
        `Skipped ${filePath}: it is not valid JSON (${existing.error}), so nothing in it can be ` +
          `kept beside the generated keys and the engine will not guess. It was left untouched. ` +
          `Fix or delete it and re-run, or re-run with force to replace it after a verified .bak.`,
      );
    }
    return {
      result: {
        path: filePath,
        action: "updated",
        warning:
          `Force-overwrote ${filePath}: it was not valid JSON (${existing.error}), so nothing in ` +
          `it could be kept beside the generated keys and the whole file was replaced.`,
      },
      content: emitted,
      backup: existingRaw,
      collision: null,
    };
  }

  const ownedKeys = Object.keys(emittedDoc);
  const foreignKeys = Object.keys(existing.doc).filter((key) => !Object.hasOwn(emittedDoc, key));
  // The engine's own keys, already present with other content. Owned by the
  // ledger they are the engine's to regenerate; unowned they are somebody's
  // live wiring, and only `force` may replace them.
  const disputed = ownedKeys.filter(
    (key) => Object.hasOwn(existing.doc, key) && !sameJson(existing.doc[key], emittedDoc[key]),
  );
  const contested = !ownership.owned && disputed.length > 0;
  if (contested && !ownership.force) {
    return skipped(
      filePath,
      `Skipped ${filePath}: it carries a ${disputed.join(", ")} key this engine renders, with ` +
        `different content, and no ownership ledger row proves the engine wrote it — the key is ` +
        `hand-written or a previous setup's, and replacing it would silently change live wiring. ` +
        `The engine owns only its own top-level keys (${ownedKeys.join(", ")}); every other key ` +
        `is kept as it is, so the collision is that key alone. Remove or rename it and re-run, or ` +
        `re-run with force to replace it after a verified .bak of the file.`,
    );
  }

  const content = jsonDocument(mergeOwnedKeys(existing.doc, emittedDoc));
  if (content === existingRaw) {
    return { result: { path: filePath, action: "unchanged" }, content: null, backup: null, collision: null };
  }
  if (contested) {
    return {
      result: {
        path: filePath,
        action: "updated",
        warning:
          `Force-replaced the ${disputed.join(", ")} key(s) of ${filePath}: no ownership ledger ` +
          `row proved the engine wrote them, so the previous file was backed up first. Every other ` +
          `top-level key (${foreignKeys.length === 0 ? "none" : foreignKeys.join(", ")}) was kept as it is.`,
      },
      content,
      backup: existingRaw,
      collision: null,
    };
  }
  const notice =
    !ownership.owned && foreignKeys.length > 0
      ? `Adopted ${filePath}: kept its ${foreignKeys.length} other top-level key(s) ` +
        `(${foreignKeys.join(", ")}) beside the generated ${ownedKeys.join(", ")}; the engine owns ` +
        `only those.`
      : undefined;
  return {
    result: { path: filePath, action: "updated", ...(notice === undefined ? {} : { notice }) },
    content,
    backup: null,
    collision: null,
  };
}

// ── Prediction ───────────────────────────────────────────────────

/** What a merge into the document would do, and how a plan classifies a refusal. */
export interface SettingsMergePrediction {
  result: MergeResult;
  /**
   * Present when the write would be refused: `shared-name` for a linked target
   * (never force-clearable), `unmanaged-name` for the two collisions `force`
   * clears behind a `.bak`. The vocabulary is the sync plan's.
   */
  collision: { kind: "shared-name" | "unmanaged-name"; detail: string } | null;
}

/**
 * Run the real planning over the bytes on disk and write nothing. The link
 * refusal runs ahead of the read, so no linked byte is read or quoted.
 */
export async function predictClaudeSettingsMerge(
  filePath: string,
  emitted: string,
  ownership: SettingsOwnership,
): Promise<SettingsMergePrediction> {
  try {
    await refuseLinkedSettingsTarget(filePath);
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    return {
      result: { path: filePath, action: "skipped", warning: error.message },
      collision: { kind: "shared-name", detail: error.message },
    };
  }
  const plan = planClaudeSettings(filePath, emitted, await readTextOrNull(filePath), ownership);
  return {
    result: plan.result,
    collision: plan.collision === null ? null : { kind: "unmanaged-name", detail: plan.collision },
  };
}

// ── Materialization ──────────────────────────────────────────────

/**
 * A merge outcome plus the bytes the file holds afterwards — the MERGED
 * document, which is what the ledger must hash (`./mcpFilter.ts::McpMergeResult`
 * carries the account). `null` only for `skipped`.
 */
export interface SettingsMergeResult extends MergeResult {
  writtenContent: string | null;
}

/**
 * Write `emitted` into `filePath` by key ownership. `boundaryDir` is the repo
 * root the write and the `.bak` must land inside.
 */
export async function materializeClaudeSettings(
  filePath: string,
  emitted: string,
  ownership: SettingsOwnership & { boundaryDir?: string },
): Promise<SettingsMergeResult> {
  await refuseLinkedSettingsTarget(filePath);
  const existingRaw = await readTextOrNull(filePath);
  const plan = planClaudeSettings(filePath, emitted, existingRaw, ownership);
  let result = plan.result;
  if (plan.backup !== null) {
    const bakPath = await backupBeforeOverwrite(filePath, plan.backup, "force overwrite", ownership.boundaryDir);
    result = { ...result, warning: `${result.warning ?? ""} Your previous file is at ${bakPath}.`.trim() };
  }
  if (plan.content !== null) {
    await atomicWriteFile(
      filePath,
      plan.content,
      ownership.boundaryDir === undefined ? undefined : { boundaryDir: ownership.boundaryDir },
    );
  }
  return {
    ...result,
    writtenContent: plan.content ?? (result.action === "skipped" ? null : existingRaw),
  };
}

// ── Reclaim ──────────────────────────────────────────────────────

/**
 * What should be left of `raw` once the engine's keys are taken out — the
 * reclaim sweep's view of this document (`../merge/reclaim.ts` gate 4).
 *
 * `ownedKeys` is the caller's: the sweep reaches a path only once nothing emits
 * it, so there is no rendering to read the keys off, and which keys the engine
 * owned is a fact about the install mode the manifest records
 * (`../adapters/claude.ts::claudeSettingsOwnedKeys`). Pure, and it writes
 * nothing: the sweep owns every read and every write on that lane.
 */
export function reduceClaudeSettingsToForeignContent(
  raw: string,
  ownedKeys: readonly string[],
): CoOwnedReduction {
  const parsed = parseObject(raw);
  if (!parsed.ok) {
    return {
      kind: "untouched",
      detail:
        `This settings document is not valid JSON (${parsed.error}), so which of its keys the ` +
        `engine wrote cannot be read. Nothing was removed and nothing was deleted — fix or delete ` +
        `the file by hand.`,
    };
  }
  const present = ownedKeys.filter((key) => Object.hasOwn(parsed.doc, key));
  if (present.length === 0) {
    return {
      kind: "untouched",
      detail:
        `Co-owned settings document holding none of the keys this engine writes ` +
        `(${ownedKeys.join(", ")}) — every key in it is the client's or the operator's, so the ` +
        `file is left exactly as it is.`,
    };
  }
  const rest = Object.fromEntries(
    Object.entries(parsed.doc).filter(([key]) => !present.includes(key)),
  );
  const kept = Object.keys(rest);
  const removed = present.join(", ");
  if (kept.length === 0) {
    return {
      kind: "engine-only",
      detail:
        `Co-owned settings document that proved to be engine-only: removing ${removed} left no ` +
        `key the client or the operator authored, so nothing in it is theirs to keep.`,
    };
  }
  return {
    kind: "reduced",
    content: jsonDocument(rest),
    detail:
      `Co-owned settings document: the engine's ${present.length} key(s) (${removed}) were ` +
      `removed and the ${kept.length} other key(s) (${kept.join(", ")}) are kept verbatim, so ` +
      `the file stays.`,
  };
}

/** The reducer the reclaim sweep is handed for this path (`ReclaimOptions.coOwnedPaths`). */
export function claudeSettingsReclaimReducer(ownedKeys: readonly string[]): CoOwnedReducer {
  return (content: string): CoOwnedReduction => reduceClaudeSettingsToForeignContent(content, ownedKeys);
}
