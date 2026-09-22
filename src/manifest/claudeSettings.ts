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
 * is decided per TOP-LEVEL KEY: **the engine owns exactly the keys the
 * install mode makes its own (`../adapters/claude.ts::claudeSettingsOwnedKeys`
 * — `permissions`, and `hooks` while the repository owns hooks), and every
 * other key is carried through as its parsed value, re-serialised in the
 * engine's style, in its position.** Whole-file ownership, which this lane
 * replaces, skipped the file when the client had written it first (no ledger
 * row, no marker) and then had `check` recommend a remedy that destroys the
 * install record; in the other order it read the client's key as hand-edit
 * drift and regenerated the file whole behind a `.bak`.
 *
 * Every function here holds the invariant the MCP merge lane holds for the
 * three client MCP documents (`./mcpFilter.ts`, whose read and serialise
 * helpers it shares): **a key the engine does not own is never removed and
 * never overwritten.** Two facts about the `hooks` key make the rule a fact
 * about the MODE rather than about any one rendering. Under a plugin-backed
 * setup the engine renders no `hooks` — the plugin carries them — so a `hooks`
 * key in the file is the operator's and stays (the `plugin-duplicates` doctor
 * row names it, because the client loads it beside the plugin's). But a
 * repository-mode rendering LEFT BEHIND by a setup whose state directory is
 * gone is the engine's whatever the mode says, and it is dangerous there: its
 * commands run scripts under the engine's generated hooks directory, which a
 * plugin-backed setup never writes, and the guard's fail-closed tail would then
 * block every tool call. The engine recognises its own rendering by exactly
 * that: a hooks object in which some command runs a script under
 * `HOOKS_GENERATED_DIR` is a repository-mode rendering of this engine, across
 * versions, and nobody else's ({@link isRepositoryHooksRendering}); such an
 * object is removed under plugin ownership and replaced under repository
 * ownership, silently, because it is provably the engine's.
 *
 * The rule for an engine-owned key whose content DIFFERS from the rendering
 * and is not recognisably the engine's — a hand-written `permissions`, a
 * predecessor's `hooks`, an operator's `hooks` the engine had carried under a
 * plugin-backed setup before the mode was hand-edited back:
 *
 * - **No ledger row** (the engine cannot prove it wrote the file): a
 *   collision. The file is left alone and the message names the key, because
 *   that key alone is the collision — every other key survives a `force`, which
 *   replaces the engine's keys behind a verified `.bak` of the file, as every
 *   collision message promises.
 * - **A ledger row, and the file's bytes still hash to a ledgered hash**:
 *   nobody edited the file since the engine wrote it, so the difference is the
 *   engine's own rendering having moved (an upgrade, a new hook row) — the key
 *   is regenerated silently. `hasLedgerDrift` (`../merge/safeWrite.ts`) is the
 *   one compare, CRLF fold included. A row that records no hash reads as
 *   unedited, the way the whole-file lane reads it.
 * - **A ledger row, and the bytes match no ledgered hash**: the file changed
 *   since the engine last wrote it and the key differs, so it may be a hand
 *   edit — the previous file is backed up first and the warning names the key
 *   and the client's per-user project settings file, where personal rows
 *   belong. The one exception runs the other way: a `hooks` object the engine
 *   cannot recognise as its own is backed up even when the bytes match, because
 *   a hash match on this document proves "unedited since", never "rendered by
 *   the engine" — the engine carries a foreign `hooks` under a plugin-backed
 *   setup.
 *
 * A file that is not a JSON object, or that this engine cannot serialise back
 * (nesting past the stack), is the other collision: nothing in it can be kept
 * beside the generated keys, so without `force` it is left alone, and with
 * `force` it is replaced whole behind the same `.bak`. A leading byte-order
 * mark is stripped before parsing and not written back.
 *
 * Every writer here preserves what it parsed and republishes it, so every
 * writer first refuses a target whose bytes are not that file's alone
 * ({@link refuseLinkedSettingsTarget}) — a symbolic link would have its target's
 * keys copied into the tree as a fresh regular file, and a hard link would
 * become an independent copy of bytes another name still holds. The line
 * ending is the file's own: a CRLF document is compared and written in CRLF, so
 * a `core.autocrlf` checkout reads as clean.
 *
 * Pure planning, then a write under the path's lock: {@link planClaudeSettings}
 * decides from bytes alone, so the sync plan and `check`'s drift gate preview
 * the write exactly, and {@link materializeClaudeSettings} performs it. The
 * reclaim sweep's view of the same document is
 * {@link reduceClaudeSettingsToForeignContent}, which takes the engine's keys
 * out and reports whether anything else is left.
 */

import { lstat, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isPlainObject } from "../config/parse.ts";
import { HOOKS_GENERATED_DIR } from "../emit/hooksInfra.ts";
import {
  acquireWriteLock,
  atomicWriteFileUnlocked,
  isSharedRegularFile,
} from "../merge/atomicWrite.ts";
import { mapFsErrno } from "../merge/fsErrors.ts";
import { backupBeforeOverwrite, displayPath, hasLedgerDrift } from "../merge/safeWrite.ts";
import type { CoOwnedReducer, CoOwnedReduction, MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { describeValue, jsonDocument, readTextOrNull } from "./mcpFilter.ts";

/** The noun the shared read-failure sentences name for this lane. */
const DOCUMENT = "settings document";
/** The one engine-owned key whose ownership is decided by content as well as by mode. */
const HOOKS_KEY = "hooks";
/** The client's per-user project settings, which this engine never writes. */
const PER_USER_SETTINGS = ".claude/settings.local.json";
const CRLF = "\r\n";

// ── Parsing and serialising ──────────────────────────────────────

type ObjectParse =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string };

/** A JSON object, or the reason the bytes are not one. Never throws. */
function parseObject(raw: string): ObjectParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.startsWith("﻿") ? raw.slice(1) : raw);
    // reason: not silent — the failure is returned and every caller surfaces it.
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: `top-level value is ${describeValue(parsed)}, expected a JSON object` };
  }
  return { ok: true, doc: parsed };
}

/** The document's own line ending, so a CRLF checkout is compared and written in CRLF. */
function lineEndingOf(raw: string): string {
  return raw.includes(CRLF) ? CRLF : "\n";
}

/**
 * `value` in the engine's style, in `eol`. JSON escapes every newline inside a
 * string, so the substitution touches structure only. Throws `RangeError` on a
 * document nested past the stack; the planner classifies that.
 */
function serialise(value: unknown, eol: string): string {
  const text = jsonDocument(value);
  return eol === "\n" ? text : text.replaceAll("\n", eol);
}

/** Deep equality by the one spelling both sides share: the JSON text. */
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * True when `value` is a repository-mode `hooks` rendering of this engine: a
 * hooks object in which some command runs a script under the engine's
 * generated hooks directory. Only this engine writes there, and every
 * repository-mode rendering wires at least the core scripts from it, so the
 * test recognises the engine's own renderings across versions while an
 * operator's hooks — which command their own scripts — never match.
 */
function isRepositoryHooksRendering(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.values(value).some(
    (entries) =>
      Array.isArray(entries) &&
      entries.some((entry) => {
        if (!isPlainObject(entry) || !Array.isArray(entry["hooks"])) return false;
        return entry["hooks"].some(
          (hook) =>
            isPlainObject(hook) &&
            typeof hook["command"] === "string" &&
            hook["command"].includes(`${HOOKS_GENERATED_DIR}/`),
        );
      }),
  );
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
  /** The operator asked for a collision to be cleared behind a `.bak`. */
  force: boolean;
  /**
   * The top-level keys the install mode makes the engine's
   * (`../adapters/claude.ts::claudeSettingsOwnedKeys`). The rendering's own
   * keys when absent — which is the same set whenever the rendering follows the
   * mode, and the mode's answer when the two ever disagree.
   */
  ownedKeys?: readonly string[];
  /**
   * The ledger's recorded hashes (`../merge/safeWrite.ts::ledgerHashIndex`),
   * for the backup rule in the module header. Absent on a plan lane, which
   * needs no backup decision: drift moves the backup, never the disposition.
   */
  ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
  /** The repository root: repo-relative paths in messages, the write's containment, the `.bak`. */
  boundaryDir?: string;
}

/** What {@link materializeClaudeSettings} WOULD do, computed from bytes alone. */
export interface SettingsPlan {
  result: MergeResult;
  /** The bytes to write; `null` when nothing needs writing. */
  content: string | null;
  /** The previous file, when the write owes a verified `.bak` of it first. */
  backup: string | null;
  /** Why the write is refused, when `result.action` is `skipped`. The same text as `result.warning`. */
  collision: string | null;
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

function skipped(filePath: string, reason: string): SettingsPlan {
  return {
    result: { path: filePath, action: "skipped", warning: reason },
    content: null,
    backup: null,
    collision: reason,
  };
}

/** The whole-file replacement `force` performs over a document nothing can be kept from. */
function replacedWhole(filePath: string, emitted: string, existingRaw: string, warning: string): SettingsPlan {
  return {
    result: { path: filePath, action: "updated", warning },
    content: emitted,
    backup: existingRaw,
    collision: null,
  };
}

/** One engine-owned key on disk, and what the plan found about it. */
interface EngineKey {
  key: string;
  /** The rendering carries the key (replace) or not (remove). */
  rendered: boolean;
  /** The content on disk differs from the rendering, or the key is being removed. */
  changed: boolean;
  /** The engine can prove the content is its own — see the module header. */
  proven: boolean;
}

/**
 * Decide the write for `filePath` from the bytes alone. See the module header
 * for the ownership rule and the collisions it keeps.
 */
export function planClaudeSettings(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  ownership: SettingsOwnership,
): SettingsPlan {
  const emittedDoc = parseEmitted(filePath, emitted);
  const shown = displayPath(filePath, ownership.boundaryDir);
  if (existingRaw === null) {
    return { result: { path: filePath, action: "created" }, content: emitted, backup: null, collision: null };
  }

  const existing = parseObject(existingRaw);
  if (!existing.ok) {
    if (!ownership.force) {
      return skipped(
        filePath,
        `Skipped ${shown}: it is not valid JSON (${existing.error}), so nothing in it can be ` +
          `kept beside the generated keys and the engine will not guess. It was left untouched. ` +
          `Fix or delete it and re-run, or re-run with force to replace it after a verified .bak.`,
      );
    }
    return replacedWhole(
      filePath,
      emitted,
      existingRaw,
      `Force-overwrote ${shown}: it was not valid JSON (${existing.error}), so nothing in it ` +
        `could be kept beside the generated keys and the whole file was replaced.`,
    );
  }

  const eol = lineEndingOf(existingRaw);
  const emittedKeys = Object.keys(emittedDoc);
  const ownedNames = new Set([...(ownership.ownedKeys ?? emittedKeys), ...emittedKeys]);
  // Unedited since the engine last wrote it, by the ledger's own compare. A
  // path with no recorded hash reads as unedited, as it does on the whole-file
  // lane; the plan lane passes no index and needs no answer.
  const unedited =
    ownership.owned && !hasLedgerDrift(filePath, existingRaw, ownership.ledgerHashes);

  const entries: [string, unknown][] = [];
  const foreign: string[] = [];
  const engineKeys: EngineKey[] = [];
  let content: string;
  try {
    for (const [key, value] of Object.entries(existing.doc)) {
      const isEngine = ownedNames.has(key) || (key === HOOKS_KEY && isRepositoryHooksRendering(value));
      if (!isEngine) {
        foreign.push(key);
        entries.push([key, value]);
        continue;
      }
      const rendered = Object.hasOwn(emittedDoc, key);
      const changed = !rendered || !sameJson(value, emittedDoc[key]);
      const proven =
        !changed || (key === HOOKS_KEY ? isRepositoryHooksRendering(value) : unedited);
      engineKeys.push({ key, rendered, changed, proven });
      if (rendered) entries.push([key, emittedDoc[key]]);
    }
    for (const [key, value] of Object.entries(emittedDoc)) {
      if (!Object.hasOwn(existing.doc, key)) entries.push([key, value]);
    }
    // `Object.fromEntries` defines own properties, so a foreign `__proto__` key
    // round-trips instead of hitting the setter of an object literal.
    content = serialise(Object.fromEntries(entries), eol);
    // reason: not silent — a document this engine cannot serialise back is
    // classified below, as a collision, rather than escaping as a RangeError.
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const why = `not a settings document this engine can merge (${error.message})`;
    if (!ownership.force) {
      return skipped(
        filePath,
        `Skipped ${shown}: ${why}, so nothing in it can be kept beside the generated keys. It ` +
          `was left untouched. Fix or delete it and re-run, or re-run with force to replace it ` +
          `after a verified .bak.`,
      );
    }
    return replacedWhole(filePath, emitted, existingRaw, `Force-overwrote ${shown}: ${why}, so the whole file was replaced.`);
  }

  // In the rendering's own key order, so the message reads the same whatever
  // order the file spells its keys in.
  const contested = [...ownedNames].filter((key) =>
    engineKeys.some((entry) => entry.key === key && entry.changed && !entry.proven),
  );
  if (contested.length > 0 && !ownership.owned && !ownership.force) {
    return skipped(
      filePath,
      `Skipped ${shown}: it carries a ${contested.join(", ")} key this engine renders, with ` +
        `different content, and no ownership ledger row proves the engine wrote it — the key is ` +
        `hand-written or a previous setup's, and replacing it would silently change live wiring. ` +
        `The engine owns only its own top-level keys (${[...ownedNames].join(", ")}); every other ` +
        `key is kept, so the collision is that key alone. Remove or rename it and re-run, or ` +
        `re-run with force to replace it after a verified .bak of the file.`,
    );
  }
  if (content === existingRaw) {
    return { result: { path: filePath, action: "unchanged" }, content: null, backup: null, collision: null };
  }

  const warnings: string[] = [];
  const removed = engineKeys.filter((entry) => !entry.rendered).map((entry) => entry.key);
  if (removed.length > 0) {
    warnings.push(
      `Removed the repository-mode hooks wiring (${removed.join(", ")}) from ${shown}: its ` +
        `commands run scripts under ${HOOKS_GENERATED_DIR}, which a plugin-backed setup does not ` +
        `write — the plugin carries the hooks, and a wiring pointing at scripts that are not ` +
        `there fails closed on every tool call.`,
    );
  }
  let backup: string | null = null;
  if (contested.length > 0) {
    backup = existingRaw;
    warnings.push(
      ownership.owned
        ? `Replaced the ${contested.join(", ")} key(s) of ${shown}: ` +
          (unedited
            ? `the engine cannot recognise that content as its own rendering, so it may be yours. `
            : `the file has changed since the engine last wrote it and that key no longer ` +
              `matches the engine's rendering, so it may have been edited by hand. `) +
          `The previous file was backed up first. Personal rows belong in ${PER_USER_SETTINGS}, ` +
          `the client's per-user project settings, which this engine never writes.`
        : `Force-replaced the ${contested.join(", ")} key(s) of ${shown}: no ownership ledger ` +
          `row proved the engine wrote them, so the previous file was backed up first. Every ` +
          `other top-level key (${foreign.length === 0 ? "none" : foreign.join(", ")}) was kept.`,
    );
  }
  const notice =
    !ownership.owned && foreign.length > 0
      ? `Adopted ${shown}: kept its ${foreign.length} other top-level key(s) ` +
        `(${foreign.join(", ")}) beside the generated ${emittedKeys.join(", ")}; the engine owns ` +
        `only those.` +
        (foreign.includes(HOOKS_KEY)
          ? ` Its own hooks key stays too, and this client loads it beside the plugin's hooks — ` +
            `remove it, or keep personal rows in ${PER_USER_SETTINGS}, if that is not what you want.`
          : "")
      : undefined;
  return {
    result: {
      path: filePath,
      action: "updated",
      ...(warnings.length === 0 ? {} : { warning: warnings.join(" ") }),
      ...(notice === undefined ? {} : { notice }),
    },
    content,
    backup,
    collision: null,
  };
}

// ── Prediction ───────────────────────────────────────────────────

/** What a merge into the document would do, and how a plan classifies a refusal. */
export interface SettingsMergePrediction {
  result: MergeResult;
  /**
   * Present when the write would be refused: `shared-name` for a linked target
   * (never force-clearable), `unmanaged-name` for the collisions `force`
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
  const plan = planClaudeSettings(filePath, emitted, await readTextOrNull(filePath, DOCUMENT), ownership);
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
 * Write `emitted` into `filePath` by key ownership, under the path's write
 * lock for the whole read-plan-backup-write cycle (`../merge/safeWrite.ts`
 * holds its lane the same way), so a concurrent run cannot slip a change in
 * between the read the plan was computed from and the write.
 */
export async function materializeClaudeSettings(
  filePath: string,
  emitted: string,
  ownership: SettingsOwnership,
): Promise<SettingsMergeResult> {
  // The parent before the lock, as the safe-write lane does: the lock and the
  // write both need it, and a missing parent is a plain create.
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch (error) {
    throw mapFsErrno(error, filePath) ?? error;
  }
  const release = await acquireWriteLock(filePath, ownership.boundaryDir);
  try {
    await refuseLinkedSettingsTarget(filePath);
    const existingRaw = await readTextOrNull(filePath, DOCUMENT);
    const plan = planClaudeSettings(filePath, emitted, existingRaw, ownership);
    let result = plan.result;
    if (plan.backup !== null) {
      const bakPath = await backupBeforeOverwrite(filePath, plan.backup, "verified backup", ownership.boundaryDir);
      result = { ...result, warning: `${result.warning ?? ""} Your previous file is at ${bakPath}.`.trim() };
    }
    if (plan.content !== null) {
      await atomicWriteFileUnlocked(
        filePath,
        plan.content,
        ownership.boundaryDir === undefined ? undefined : { boundaryDir: ownership.boundaryDir },
      );
    }
    return {
      ...result,
      writtenContent: plan.content ?? (result.action === "skipped" ? null : existingRaw),
    };
  } finally {
    await release();
  }
}

// ── Reclaim ──────────────────────────────────────────────────────

/**
 * What should be left of `raw` once the engine's keys are taken out — the
 * reclaim sweep's view of this document (`../merge/reclaim.ts` gate 4).
 *
 * `ownedKeys` is the mode's answer (`../adapters/claude.ts::claudeSettingsOwnedKeys`):
 * the sweep reaches a path only once nothing renders it, so there is no
 * rendering to read the keys off. A repository-mode `hooks` rendering the
 * engine recognises as its own leaves under either mode, for the reason the
 * module header gives; an operator's hooks stays. Pure, and it writes nothing:
 * the sweep owns every read and every write on that lane.
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
  const owned = new Set(ownedKeys);
  const present: string[] = [];
  const kept: [string, unknown][] = [];
  for (const [key, value] of Object.entries(parsed.doc)) {
    if (owned.has(key) || (key === HOOKS_KEY && isRepositoryHooksRendering(value))) present.push(key);
    else kept.push([key, value]);
  }
  if (present.length === 0) {
    return {
      kind: "untouched",
      detail:
        `Co-owned settings document holding none of the keys this engine writes ` +
        `(${ownedKeys.join(", ")}) — every key in it is the client's or the operator's, so the ` +
        `file is left exactly as it is.`,
    };
  }
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
    content: serialise(Object.fromEntries(kept), lineEndingOf(raw)),
    detail:
      `Co-owned settings document: the engine's ${present.length} key(s) (${removed}) were ` +
      `removed and the ${kept.length} other key(s) (${kept.map(([key]) => key).join(", ")}) are ` +
      `kept verbatim, so the file stays.`,
  };
}

/** The reducer the reclaim sweep is handed for this path (`ReclaimOptions.coOwnedPaths`). */
export function claudeSettingsReclaimReducer(ownedKeys: readonly string[]): CoOwnedReducer {
  return (content: string): CoOwnedReduction => reduceClaudeSettingsToForeignContent(content, ownedKeys);
}
