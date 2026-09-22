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
 * never overwritten.**
 *
 * THE RULE FOR AN ENGINE-OWNED KEY, the same for every key, `hooks` included.
 * An engine-owned key whose content already equals the rendering needs no
 * proof. One whose content differs is regenerated SILENTLY only when the file
 * is **unedited**: a ledger row records the engine wrote the path, and the
 * file's bytes still hash to a hash that row recorded (`hasLedgerDrift` in
 * `../merge/safeWrite.ts` is the one compare, CRLF fold included) — nobody has
 * touched the file since, so the difference is the engine's own rendering
 * having moved. Otherwise the key is **contested**: with no ledger row it is a
 * collision (the message names the key, because that key alone collides —
 * every other key survives a `force`, which replaces the engine's keys behind
 * a verified `.bak`); with a ledger row it is replaced behind a verified
 * `.bak`, and the warning names the key and the client's per-user project
 * settings file, where personal rows belong. A row that records no hash has
 * no hash to match, so it reads as contested, not as unedited.
 *
 * `hooks` adds one widening and no exception. A repository-mode setup whose
 * state directory is gone leaves its `hooks` rendering behind; under the
 * plugin-backed setup that follows, the engine renders no `hooks` (the plugin
 * carries them), so by name alone that object would be the operator's and
 * would stay — while its commands run scripts under the engine's generated
 * hooks directory, which a plugin-backed setup never writes, and the guard's
 * fail-closed tail would then block every tool call. The engine RECOGNISES
 * such an object by that prefix ({@link isRepositoryHooksRendering}) and
 * treats it as its own to touch: under plugin ownership it is removed, under
 * repository ownership it is replaced, and with no ledger row it is not a
 * collision. Recognition only ever WIDENS what the engine may touch; it never
 * suppresses the backup: a recognised object that is not proven unedited is
 * touched only behind the `.bak`, with the warning, because no predicate can
 * tell the engine's rows from rows of the operator's inside one object — a
 * legitimate rendering carries user and pack hook rows with their own script
 * paths, and a substring matches a command that merely mentions the path. An
 * operator's `hooks` under a plugin-backed setup — no such command in it — is
 * foreign and stays; the `plugin-duplicates` doctor row names it, because the
 * client loads it beside the plugin's hooks. The reclaim sweep strips only
 * the mode's own keys: a stale rendering under plugin ownership is `sync`'s
 * to remove, behind that backup, and the duplicates row's to name.
 *
 * A file that is not a JSON object, or that this engine cannot serialise back
 * (nesting past the stack), is the other collision: nothing in it can be kept
 * beside the generated keys, so without `force` it is left alone, and with
 * `force` it is replaced whole behind the same `.bak`. The parser's message
 * is never quoted — it carries bytes of the file — only where it stopped. A
 * leading byte-order mark is stripped before parsing and not written back.
 *
 * Every writer here preserves what it parsed and republishes it, so every
 * writer first refuses a target whose bytes are not that file's alone
 * ({@link refuseLinkedSettingsTarget}) — a symbolic link would have its target's
 * keys copied into the tree as a fresh regular file, and a hard link would
 * become an independent copy of bytes another name still holds. The line
 * ending is the file's own: a CRLF document is compared and written in CRLF,
 * so a `core.autocrlf` checkout reads as clean; a document mixing the two is
 * normalised to CRLF on its first write.
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
import {
  acquireWriteLock,
  assertWriteTargetContained,
  atomicWriteFileUnlocked,
  isSharedRegularFile,
} from "../merge/atomicWrite.ts";
import { mapFsErrno } from "../merge/fsErrors.ts";
import {
  backupBeforeOverwrite,
  displayPath,
  hasLedgerDrift,
  toLedgerKey,
} from "../merge/safeWrite.ts";
import type { CoOwnedReducer, CoOwnedReduction, MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { HOOKS_GENERATED_DIR } from "../types/markers.ts";
import { describeValue, jsonDocument, readTextOrNull } from "./mcpFilter.ts";

/** The noun the shared read-failure sentences name for this lane. */
const DOCUMENT = "settings document";
/** The one engine-owned key the engine also recognises by content. */
const HOOKS_KEY = "hooks";
/** The client's per-user project settings, which this engine never writes. */
const PER_USER_SETTINGS = ".claude/settings.local.json";
const CRLF = "\r\n";
const BOM = "\uFEFF";
/** Where V8's parse message says it stopped — the one part of it that carries no file bytes. */
const PARSE_LOCATION = /at position \d+(?: \(line \d+ column \d+\))?/;

// ── Parsing and serialising ──────────────────────────────────────

type ObjectParse =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string };

/**
 * A JSON object, or the reason the bytes are not one. Never throws, and never
 * carries a byte of the input: V8 quotes a snippet of the source around a
 * syntax error, and every caller prints the reason.
 */
function parseObject(raw: string): ObjectParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.startsWith(BOM) ? raw.slice(1) : raw);
    // reason: not silent — the failure is returned and every caller surfaces it.
  } catch (error) {
    const location = PARSE_LOCATION.exec(error instanceof Error ? error.message : "")?.[0];
    return { ok: false, error: location === undefined ? "syntax error" : `syntax error ${location}` };
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

/**
 * A file-authored key name as a message may print it: line breaks and tabs
 * become spaces, and control bytes, the bidi controls and the zero-width
 * marks are dropped — the rule `../cli/kit/prompts.ts::sanitizeLabel` applies
 * to every label an operator reads, mirrored here because this module sits
 * below the CLI. A key carrying an escape sequence or a newline would
 * otherwise forge a panel line in every verb that prints these messages.
 */
function safeName(name: string): string {
  return name
    .replace(/[\r\n\t]/gu, " ")
    // oxlint-disable-next-line no-control-regex -- stripping control bytes IS the point
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/gu, "");
}

/** The names a message lists, sanitised and comma-joined. */
function listNames(names: readonly string[]): string {
  return names.map(safeName).join(", ");
}

/** Deep equality by the one spelling both sides share: the JSON text. */
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * True when `value` looks like a repository-mode `hooks` rendering of this
 * engine: a hooks object in which some command runs a script under the
 * engine's generated hooks directory. Only the engine writes there, and every
 * repository-mode rendering wires at least the core scripts from it. Not a
 * proof of authorship — see the module header — only the licence to touch the
 * object behind a backup.
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
  /** Unchanged, or the file is proven unedited since the engine wrote it. */
  proven: boolean;
  /** A `hooks` object the engine recognises as a repository-mode rendering of its own. */
  recognised: boolean;
}

/**
 * True when a ledger row records a hash for this path and the file's bytes
 * still hash to one — the only state in which a differing engine key is
 * regenerated silently.
 */
function isUnedited(filePath: string, existingRaw: string, ownership: SettingsOwnership): boolean {
  const hashes = ownership.ledgerHashes;
  if (!ownership.owned || hashes === undefined || !hashes.has(toLedgerKey(filePath))) return false;
  return !hasLedgerDrift(filePath, existingRaw, hashes);
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
  const unedited = isUnedited(filePath, existingRaw, ownership);

  const entries: [string, unknown][] = [];
  const foreign: string[] = [];
  const engineKeys: EngineKey[] = [];
  let content: string;
  try {
    for (const [key, value] of Object.entries(existing.doc)) {
      const recognised = key === HOOKS_KEY && isRepositoryHooksRendering(value);
      if (!ownedNames.has(key) && !recognised) {
        foreign.push(key);
        entries.push([key, value]);
        continue;
      }
      const rendered = Object.hasOwn(emittedDoc, key);
      const changed = !rendered || !sameJson(value, emittedDoc[key]);
      engineKeys.push({ key, rendered, changed, proven: !changed || unedited, recognised });
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

  // Contested: changed, not proven, and not a hooks object the engine
  // recognises — that one is the engine's to touch behind a backup either way.
  // In the rendering's own key order, so the message reads the same whatever
  // order the file spells its keys in.
  const contested = [...ownedNames].filter((key) =>
    engineKeys.some((entry) => entry.key === key && entry.changed && !entry.proven && !entry.recognised),
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
  let backup: string | null = null;
  const personal =
    `Personal rows belong in ${PER_USER_SETTINGS}, the client's per-user project settings, ` +
    `which this engine never writes.`;
  // A recognised hooks object that is not proven unedited: touched behind the
  // backup, with the warning — removed under plugin ownership, replaced under
  // repository ownership. Proven unedited, a removal is still reported (the
  // client stops running those hooks), while a replacement is the rendering
  // having moved and says nothing — a warning there would print on every sync
  // after an engine upgrade.
  const hooks = engineKeys.find(
    (entry) => entry.key === HOOKS_KEY && entry.recognised && entry.changed && (!entry.rendered || !entry.proven),
  );
  if (hooks !== undefined) {
    if (!hooks.proven) backup = existingRaw;
    warnings.push(
      hooks.rendered
        ? `Replaced the hooks key of ${shown}: its content differs from the engine's rendering ` +
          `and the engine cannot prove it wrote every row in it, so rows of yours may have been ` +
          `inside it. The previous file was backed up first. ${personal}`
        : `Removed the repository-mode hooks wiring (hooks) from ${shown}: its commands run ` +
          `scripts under ${HOOKS_GENERATED_DIR}, which a plugin-backed setup does not write — the ` +
          `plugin carries the hooks, and a wiring pointing at scripts that are not there fails ` +
          `closed on every tool call.` +
          (hooks.proven
            ? ""
            : ` The previous file was backed up first: if it carried rows of yours, they are ` +
              `there. ${personal}`),
    );
  }
  if (contested.length > 0) {
    backup = existingRaw;
    warnings.push(
      ownership.owned
        ? `Replaced the ${contested.join(", ")} key(s) of ${shown}: the file has changed since ` +
          `the engine last wrote it (or its row records no hash) and that key no longer matches ` +
          `the engine's rendering, so it may have been edited by hand. The previous file was ` +
          `backed up first. ${personal}`
        : `Force-replaced the ${contested.join(", ")} key(s) of ${shown}: no ownership ledger ` +
          `row proved the engine wrote them, so the previous file was backed up first. Every ` +
          `other top-level key (${foreign.length === 0 ? "none" : listNames(foreign)}) was kept.`,
    );
  }
  const notice =
    !ownership.owned && foreign.length > 0
      ? `Adopted ${shown}: kept its ${foreign.length} other top-level key(s) ` +
        `(${listNames(foreign)}) beside the generated ${emittedKeys.join(", ")}; the engine owns ` +
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
  // Containment first, as the safe-write lane orders it: the mkdir and the
  // lockfile both build directories on this path, so an unchecked path would
  // have the engine materialising a tree through a planted link before any
  // decision is computed.
  await assertWriteTargetContained(filePath, ownership.boundaryDir);
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
    try {
      await release();
    } catch (releaseError) {
      // Never mask the write's own result or error with a release failure.
      console.error(
        `Failed to release the write lock on ${filePath}: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`,
      );
    }
  }
}

// ── Reclaim ──────────────────────────────────────────────────────

/**
 * What should be left of `raw` once the engine's keys are taken out — the
 * reclaim sweep's view of this document (`../merge/reclaim.ts` gate 4).
 *
 * `ownedKeys` is the mode's answer (`../adapters/claude.ts::claudeSettingsOwnedKeys`):
 * the sweep reaches a path only once nothing renders it, so there is no
 * rendering to read the keys off, and only those names leave. A stale
 * repository-mode `hooks` rendering under plugin ownership stays here — it is
 * `sync`'s to remove, behind a backup, and the `plugin-duplicates` row's to
 * name. Pure, and it writes nothing: the sweep owns every read and every write
 * on that lane.
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
    if (owned.has(key)) present.push(key);
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
        `other top-level key, so nothing else in it is the client's or the operator's to keep.`,
    };
  }
  return {
    kind: "reduced",
    content: serialise(Object.fromEntries(kept), lineEndingOf(raw)),
    detail:
      `Co-owned settings document: the engine's ${present.length} key(s) (${removed}) were ` +
      `removed and the ${kept.length} other key(s) (${listNames(kept.map(([key]) => key))}) are ` +
      `kept verbatim, so the file stays.`,
  };
}

/** The reducer the reclaim sweep is handed for this path (`ReclaimOptions.coOwnedPaths`). */
export function claudeSettingsReclaimReducer(ownedKeys: readonly string[]): CoOwnedReducer {
  return (content: string): CoOwnedReduction => reduceClaudeSettingsToForeignContent(content, ownedKeys);
}
