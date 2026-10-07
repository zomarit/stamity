/**
 * The per-entry core for a JSON document the engine shares with its owner
 * (REQ-FLOW-036; S10–S14): `.claude/settings.json`, and on the same core
 * Cursor's and Codex's hook files.
 *
 * A {@link CoOwnedJsonSpec} names what the engine writes into such a document:
 * array ELEMENTS at an array pointer (each `permissions.allow` row, each entry
 * of a `hooks.<event>` array), and whole MEMBERS at a member pointer. The
 * engine owns only those, and only the ones it wrote: the ledger records each
 * by the sha256 of its canonical JSON (`LedgerEntry.coOwned`), because no
 * marker can be written into the document itself. Every other member, and
 * every element it did not write, is the owner's and is never written,
 * replaced, removed or recorded.
 *
 * THE RULES, for each element `e` of an array at an element pointer, with
 * `h = memberHash(e)`:
 *
 * 1. *Whose.* The engine's when `h` is recorded under that pointer and
 *    (`inBound(e)` or the spec's `outsideBound` is `backup`), or when
 *    `recognise(e)`; under a legacy row (a ≤1.11.0 ledger whose rows carry no
 *    record) also when `inBound(e)` or `h` equals a rendered element's hash;
 *    with no ledger row (adoption) only `recognise(e)` counts. Every other
 *    element is foreign, and when a foreign element equals a rendered one the
 *    engine adds no second copy (S13).
 * 2. *Placement* (S14). The output array is the foreign elements in their
 *    order, with the rendered elements as one block at the index of the first
 *    engine element of the existing array (counted among the foreign ones),
 *    else appended.
 * 3. *What leaves, and how* (S11). An engine element the rendering no longer
 *    carries leaves silently when it lies in the bound and is recorded, or the
 *    file still hashes to what the ledger recorded; otherwise only behind a
 *    verified `.bak` of the file, with a warning naming `<member>[<index>]`.
 *    The bound is `inBound(e)` (proof by path), or `e` equal to an element of
 *    the current rendering (proof by re-rendering — the reducer's rendering is
 *    the one its caller hands in). A recorded hash outside the bound proves
 *    nothing.
 * 4. *Containers.* An array or object on an engine pointer that the engine
 *    leaves empty is deleted, unless the record lists it as `preexisting`. On
 *    adoption, each such container already present and holding nothing the
 *    engine recognises joins `preexisting`; later runs carry it forward while
 *    the container exists.
 * 5. *Members.* A member's one proof is the engine's CURRENT rendering, or a
 *    value an earlier release rendered there when the spec declares that
 *    bound (`MemberSpec.known`: such a value moves to the rendering, or
 *    leaves, silently); a
 *    recorded hash — the member's, or the whole file's under a legacy row — is
 *    a claim (S11). Absent → written and recorded. Equal to the rendering →
 *    nothing to write (recorded when the engine owns it). A `collide` member
 *    that differs → a collision naming it, whatever the record says (S12,
 *    review/45). A `yield` member that differs: recorded and edited → the
 *    owner's (dropped from the record, a notice); recorded and unedited, or
 *    the engine's under a legacy row → replaced behind a verified `.bak`;
 *    unrecorded → kept and the rendering not written. A member the rendering
 *    no longer carries leaves only behind a `.bak`. The reducer holds the
 *    same bound for both kinds, against the rendering its caller hands in
 *    (none: every member removal is `mustBackUp`). Under a legacy row a
 *    member equal to the rendering, or any member of a file the ledger proves
 *    unedited, is the engine's. A
 *    `structural` member is removed only when nothing foreign remains: the
 *    planner keeps one the rendering stops carrying, and the reducer removes
 *    it with the rest.
 * 6. *Collisions* (`co-owned-shape`): the file does not parse, is not a JSON
 *    object or cannot be serialised back; a container the engine writes into
 *    has another type; a `collide` member differs. No message names `--force`
 *    — there is no force on this lane, because nothing in these collisions is
 *    the engine's to replace (S12). A linked target stays `shared-name`.
 * 7. *Style* (S15). A merged document is written in its own indentation, key
 *    order, line ending and final newline (`./jsonMembers.ts::jsonStyleOf`); a
 *    created one in the engine's style. A document whose content does not
 *    change is not rewritten, whatever its style.
 * 8. *Record.* The plan returns what the engine now owns in the document:
 *    `elements[P]` the hashes of the block it placed at `P`, `members` the
 *    hashes of the members it owns, `preexisting`, and `createdFile` when it
 *    created the file now, a previous row carries it, or the row is legacy (a
 *    ≤1.11.0 row keeps 1.11.0's delete-when-engine-only rule).
 *
 * Pure planning from bytes ({@link planCoOwnedJson}), then a write under the
 * path's lock ({@link materializeCoOwned}); the reclaim sweep's view of the
 * same document is {@link reduceCoOwnedJson}, which applies rules 1, 3, 4 and
 * 5 with nothing rendered.
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
import { backupBeforeOverwrite, displayPath, hasLedgerDrift, toLedgerKey } from "../merge/safeWrite.ts";
import type { CoOwnedReduction, MergeResult } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import type { CoOwnership } from "../types/manifest.ts";
import { HOOKS_GENERATED_DIR, STATE_DIR } from "../types/markers.ts";
import {
  ENGINE_JSON_STYLE,
  MAX_CO_OWNED_ELEMENTS,
  MAX_CO_OWNED_POINTERS,
  canonicalJson,
  jsonStyleOf,
  memberHash,
  memberPointer,
  parseMemberPointer,
  roundTripLoss,
  serialiseJson,
  type MemberPointer,
  type MemberSegments,
} from "./jsonMembers.ts";
import { ALLOWED_LAUNCHERS } from "../shared/launcherAllowlist.ts";
import { readTextOrNull } from "./mcpFilter.ts";

// ── The spec ─────────────────────────────────────────────────────────────

/** One kind of array element the engine writes into the document. */
export interface ElementSpec {
  /**
   * An array pointer of depth 1 or 2, or `/<key>/*`: every array member of the
   * object at `/<key>` (the events of a `hooks` object).
   */
  pointer: string;
  /** True for an element the engine recognises as its own by content, whatever the record says. */
  recognise(element: unknown): boolean;
  /** True for an element the engine can prove it wrote by path or by re-rendering (S11). */
  inBound(element: unknown): boolean;
  /**
   * What a RECORDED element outside the bound is: the engine's, removed only
   * behind a backup (`backup`), or the owner's whatever the record says
   * (`foreign`).
   */
  outsideBound: "backup" | "foreign";
}

/** One whole member the engine writes into the document. */
export interface MemberSpec {
  pointer: MemberPointer;
  /** What an owner's different value is: a collision (`collide`), or theirs (`yield`). */
  foreign: "collide" | "yield";
  /** Removed only when nothing foreign remains (Cursor's `version`). */
  structural?: true;
  /**
   * True for a value some release of the engine rendered at this member — the
   * release-history bound. Such a value is the engine's whatever the record
   * says, and it is updated, or removed, without a backup: the engine can
   * prove it wrote it by re-rendering an earlier release. Without this bound
   * the member's one proof is the CURRENT rendering, so a release that changed
   * the value would make every older file collide (`collide`) or take a backup
   * (`yield`). Absent: only the current rendering proves the member.
   */
  known?: (value: unknown) => boolean;
}

/** What the engine writes into one co-owned JSON document. */
export interface CoOwnedJsonSpec {
  /** The document's noun in messages ("settings document"). */
  noun: string;
  elements: readonly ElementSpec[];
  members: readonly MemberSpec[];
  /** Appended to every warning about an engine entry that left behind a backup. */
  personalHint?: string;
}

/** What the caller knows about the target that the bytes cannot say. */
export interface CoOwnedOwnership {
  /** The ledger has a row at the path. */
  owned: boolean;
  /** It has rows and none carries `coOwned`: a ≤1.11.0 ledger. */
  legacy: boolean;
  /** The union of the rows' `coOwned`. */
  record: CoOwnership | null;
  /** The ledger's recorded whole-file hashes (`../merge/safeWrite.ts::ledgerHashIndex`). */
  ledgerHashes?: ReadonlyMap<string, ReadonlySet<string>>;
  /** The repository root: repo-relative paths in messages, the write's containment, the `.bak`. */
  boundaryDir?: string;
}

/** What {@link materializeCoOwned} WOULD do, computed from bytes alone. */
export interface CoOwnedPlan {
  result: MergeResult;
  /** The bytes to write; `null` when nothing needs writing. */
  content: string | null;
  /** The previous file, when the write owes a verified `.bak` of it first. */
  backup: string | null;
  /** Why the write is refused, when `result.action` is `skipped`. The same text as `result.warning`. */
  collision: string | null;
  /** What the engine owns in the document after the write; `null` when skipped. */
  record: CoOwnership | null;
}

/** What a merge would do, and how a plan classifies a refusal. */
export interface CoOwnedPrediction {
  result: MergeResult;
  /** `shared-name` for a linked target, `co-owned-shape` for a document the merge cannot keep beside its entries. */
  collision: { kind: "shared-name" | "co-owned-shape"; detail: string } | null;
}

/** A merge outcome plus the bytes the file holds afterwards and the record of what the engine owns there. */
export interface CoOwnedMergeResult extends MergeResult {
  /** The merged document, which is what the ledger hashes; `null` only for `skipped`. */
  writtenContent: string | null;
  /** The record for the ledger row; `null` only for `skipped`. */
  writtenRecord: CoOwnership | null;
}

/**
 * True when the script `command` EXECUTES is one of the engine's own (S11,
 * narrowed in the safe direction): under `.stamity/generated/hooks/`, which
 * only the engine writes, or an installed pack's `.stamity/packs/<id>/`
 * (`../pack/receipt.ts::packDirRelPath`). The user's `.stamity/hooks/` and
 * the rest of `.stamity/` are the owner's, so an entry running a script there
 * leaves only behind a backup. The executed script is the program itself, or the first argument after an allowed launcher
 * (`../shared/launcherAllowlist.ts`; `deno run` and `bun run` step over their
 * one run-file word). A `.stamity/` path anywhere else — a flag's value, an
 * argument to another script, a second command — does not count, and neither
 * does a command this grammar cannot read: an expansion other than a
 * double-quoted `${CLAUDE_PROJECT_DIR}` opening the path, a command
 * substitution, a redirect, or a second command other than the guard's own
 * fail-closed tail (`../adapters/claude.ts::guardFailClosedTail`). Those are
 * exactly the forms the engine renders; anything else is outside the bound.
 */
export function commandRunsStateScript(command: string): boolean {
  const script = executedScript(command);
  return script !== null && isStateScriptPath(script);
}

/**
 * The repo-relative path of the script `command` EXECUTES, by the grammar
 * {@link commandRunsStateScript} reads: the program itself, or the first
 * argument after an allowed launcher, with a leading `./` or a double-quoted
 * `${CLAUDE_PROJECT_DIR}/` dropped. `null` when the command is not one this
 * grammar reads, or the path holds an empty, `.` or `..` segment. A hook
 * document's spec bounds its entries by where this path lies (S11).
 */
export function executedScript(command: string): string | null {
  if (command.includes(ROOT_WORD)) return null;
  const simple = firstSimpleCommand(command);
  if (simple === null) return null;
  if (simple.rest !== "" && !GUARD_TAIL.test(simple.rest)) return null;
  const [program, ...args] = simple.words;
  if (program === undefined) return null;
  const word = !ALLOWED_LAUNCHERS.has(program) ? program : RUN_FILE_LAUNCHERS.has(program) && args[0] === "run" ? args[1] : args[0];
  if (word === undefined) return null;
  let path = word;
  if (path.startsWith(`${ROOT_WORD}/`)) path = path.slice(ROOT_WORD.length + 1);
  else if (path.startsWith("./")) path = path.slice(2);
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes(ROOT_WORD))) return null;
  return path;
}

/** The launchers whose `run` word names a file to run (`../shared/launcherAllowlist.ts`'s RUN_FILE_SUBCOMMANDS). */
const RUN_FILE_LAUNCHERS: ReadonlySet<string> = new Set(["deno", "bun"]);

/** The guard's fail-closed tail as `../adapters/claude.ts` renders it: builtins and one single-quoted echo. */
const GUARD_TAIL = /^\|\| \{ s=\$\?; \[ "\$s" -eq 2 \] && exit 2; echo '[^']*' >&2; exit 2; \}$/;

/** Stands for an expanded `${CLAUDE_PROJECT_DIR}` in a parsed word; a command holding it is refused first. */
const ROOT_WORD = String.fromCharCode(0);

/** The project-root variable the Claude adapter anchors every hook script on. */
const ROOT_VARIABLES = ["${CLAUDE_PROJECT_DIR}", "$CLAUDE_PROJECT_DIR"] as const;

/** The engine's generated hook scripts, as path segments. */
const GENERATED_HOOK_SEGMENTS: readonly string[] = HOOKS_GENERATED_DIR.split("/");

/**
 * True for a repo-relative path ({@link executedScript}'s) that names a file
 * below the engine's generated hooks folder or below one installed pack's
 * folder (`.stamity/packs/<id>/…`).
 */
function isStateScriptPath(path: string): boolean {
  const segments = path.split("/");
  const under = (root: readonly string[]): boolean => root.every((segment, index) => segments[index] === segment);
  if (under(GENERATED_HOOK_SEGMENTS)) return segments.length > GENERATED_HOOK_SEGMENTS.length;
  // `.stamity/packs/<id>/<file…>`: a pack id folder and a file below it.
  return under([STATE_DIR, "packs"]) && segments.length >= 4;
}

/**
 * The words of `command`'s first simple command, as a POSIX shell splits them,
 * and the text from the first control or redirect operator on; `null` when a
 * word holds what this grammar does not read (a substitution, an expansion it
 * cannot resolve, an unterminated quote).
 */
function firstSimpleCommand(command: string): { words: string[]; rest: string } | null {
  const words: string[] = [];
  let word: string | null = null;
  let index = 0;
  const end = (): void => {
    if (word !== null) words.push(word);
    word = null;
  };
  while (index < command.length) {
    const char = command[index] as string;
    if (char === " " || char === "\t") {
      end();
      index += 1;
    } else if ("|&;<>()`\n\r".includes(char)) {
      break;
    } else if (char === "'") {
      const close = command.indexOf("'", index + 1);
      if (close === -1) return null;
      word = (word ?? "") + command.slice(index + 1, close);
      index = close + 1;
    } else if (char === '"') {
      const quoted = doubleQuoted(command, index + 1, word === null);
      if (quoted === null) return null;
      word = (word ?? "") + quoted.text;
      index = quoted.next;
    } else if (char === "\\" || char === "$") {
      // An unquoted escape or expansion: the engine renders neither.
      return null;
    } else {
      word = (word ?? "") + char;
      index += 1;
    }
  }
  end();
  return { words, rest: command.slice(index).trim() };
}

/**
 * The text of a double-quoted span opening at `start` (just past its quote),
 * and the index after its closing quote. The root variable is read only when
 * it opens the word (`atWordStart` and first in the span); any other `$`, a
 * backtick or an escape makes the span unreadable.
 */
function doubleQuoted(command: string, start: number, atWordStart: boolean): { text: string; next: number } | null {
  let text = "";
  let index = start;
  while (index < command.length) {
    const char = command[index] as string;
    if (char === '"') return { text, next: index + 1 };
    if (char === "`" || char === "\\") return null;
    if (char === "$") {
      const variable = atWordStart && index === start ? ROOT_VARIABLES.find((name) => command.startsWith(name, index)) : undefined;
      if (variable === undefined || /[A-Za-z0-9_]/.test(command[index + variable.length] ?? "")) return null;
      text += ROOT_WORD;
      index += variable.length;
      continue;
    }
    text += char;
    index += 1;
  }
  return null;
}

// ── Parsing, naming, serialising ─────────────────────────────────────────

/** Where V8's parse message says it stopped — the one part of it that carries no file bytes. */
const PARSE_LOCATION = /at position \d+(?: \(line \d+ column \d+\))?/;

type ObjectParse = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string };

/** A JSON value's kind as a message names it; never the value itself. */
function describeJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  return `a ${typeof value}`;
}

/**
 * A JSON object, or the reason the bytes are not one. Never throws, and never
 * carries a byte of the input: V8 quotes a snippet around a syntax error. A
 * leading byte-order mark is stripped here; the style keeps it for the write
 * (`./jsonMembers.ts::jsonStyleOf`).
 */
function parseObject(raw: string): ObjectParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    // reason: not silent — the failure is returned and every caller surfaces it.
  } catch (error) {
    // `JSON.parse` throws a SyntaxError, whose string form carries its message.
    const location = PARSE_LOCATION.exec(String(error))?.[0];
    return { ok: false, error: location === undefined ? "syntax error" : `syntax error ${location}` };
  }
  if (!isPlainObject(parsed)) return { ok: false, error: `${describeJson(parsed)}, not a JSON object` };
  return { ok: true, doc: parsed };
}

/** True for the code points a printed name must not carry: controls, bidi controls, zero-width marks. */
function isUnprintable(codePoint: number): boolean {
  return (
    codePoint <= 0x1f ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    codePoint === 0x2060 ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

/**
 * A file-authored name as a message may print it: line breaks and tabs become
 * spaces, and every other unprintable code point is dropped — the rule
 * `../cli/kit/prompts.ts::sanitizeLabel` applies to every label an operator
 * reads, mirrored here because this module sits below the CLI.
 */
export function printableName(name: string): string {
  let out = "";
  for (const char of name) {
    if (char === "\n" || char === "\r" || char === "\t") out += " ";
    else if (!isUnprintable(char.codePointAt(0) as number)) out += char;
  }
  return out;
}

/** A member as messages name it: `hooks.PreToolUse`. */
function shownMember(segments: MemberSegments): string {
  return segments.map(printableName).join(".");
}

/** The engine's own value as a remedy may print it: short scalars only, never the owner's bytes. */
function shownValue(value: unknown): string {
  const text = canonicalJson(value);
  return (typeof value !== "object" || value === null) && text.length <= 64 ? printableName(text) : "the engine's value";
}

const entries = (count: number): string => (count === 1 ? "entry" : "entries");

/** An own property of `container`, or `undefined` — never one off the prototype chain. */
function ownValue(container: unknown, key: string): unknown {
  return isPlainObject(container) && Object.hasOwn(container, key) ? container[key] : undefined;
}

function readAt(doc: unknown, segments: MemberSegments): unknown {
  const top = ownValue(doc, segments[0]);
  return segments.length === 1 ? top : ownValue(top, segments[1]);
}

/** Define an own data property: a `__proto__` key stays a key, and an existing key keeps its position. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Write `value` at `segments` in `out`, copying a depth-2 parent (created at the end when absent). */
function writeAt(out: Record<string, unknown>, segments: MemberSegments, value: unknown): void {
  if (segments.length === 1) {
    setOwn(out, segments[0], value);
    return;
  }
  const parent = ownValue(out, segments[0]);
  const copy: Record<string, unknown> = isPlainObject(parent) ? { ...parent } : {};
  setOwn(copy, segments[1], value);
  setOwn(out, segments[0], copy);
}

/**
 * Delete the member at `segments` from `out`, copying a depth-2 parent. Every
 * caller first read a value there, so a depth-2 parent is a plain object.
 */
function deleteAt(out: Record<string, unknown>, segments: MemberSegments): void {
  if (segments.length === 1) {
    delete out[segments[0]];
    return;
  }
  const copy: Record<string, unknown> = { ...(out[segments[0]] as Record<string, unknown>) };
  delete copy[segments[1]];
  setOwn(out, segments[0], copy);
}

/**
 * `target` with the keys `before` lacked moved after the keys it had, in the
 * order `rendering` lists them: the owner's keys keep their places, and what
 * the engine adds reads in its rendering's order whichever rule added it.
 */
function orderAdded(target: Record<string, unknown>, before: unknown, rendering: Record<string, unknown>): Record<string, unknown> {
  const rank = Object.keys(rendering);
  const keys = Object.keys(target);
  const kept = keys.filter((key) => isPlainObject(before) && Object.hasOwn(before, key));
  const added = keys.filter((key) => !kept.includes(key)).toSorted((a, b) => rank.indexOf(a) - rank.indexOf(b));
  const out: Record<string, unknown> = {};
  for (const key of [...kept, ...added]) setOwn(out, key, target[key]);
  return out;
}

/** Deep equality by the one spelling both sides share, key order included. */
function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

// ── The spec, resolved against documents ─────────────────────────────────

interface ParsedElementSpec {
  readonly spec: ElementSpec;
  readonly segments: MemberSegments;
  /** `/<key>/*`: the arrays are every member of the object at `/<key>`. */
  readonly wildcard: boolean;
}

interface ParsedMemberSpec {
  readonly spec: MemberSpec;
  readonly segments: MemberSegments;
}

interface ParsedSpec {
  readonly elements: readonly ParsedElementSpec[];
  readonly members: readonly ParsedMemberSpec[];
}

function parseSpec(spec: CoOwnedJsonSpec): ParsedSpec {
  return {
    elements: spec.elements.map((element) => {
      const segments = parseMemberPointer(element.pointer);
      return { spec: element, segments, wildcard: segments.length === 2 && segments[1] === "*" };
    }),
    members: spec.members.map((member) => ({ spec: member, segments: parseMemberPointer(member.pointer) })),
  };
}

/** One concrete array the engine may write elements into. */
interface Slot {
  readonly pointer: MemberPointer;
  readonly segments: MemberSegments;
  readonly owner: ParsedElementSpec;
}

/** Every concrete array of the spec in `docs`, in their order, each once. */
function slotsOf(parsed: ParsedSpec, docs: readonly Record<string, unknown>[]): Slot[] {
  const out: Slot[] = [];
  const seen = new Set<string>();
  const add = (owner: ParsedElementSpec, segments: MemberSegments): void => {
    const pointer = memberPointer(segments);
    if (seen.has(pointer)) return;
    seen.add(pointer);
    out.push({ pointer, segments, owner });
  };
  for (const doc of docs) {
    for (const owner of parsed.elements) {
      if (!owner.wildcard) {
        if (readAt(doc, owner.segments) !== undefined) add(owner, owner.segments);
        continue;
      }
      const container = ownValue(doc, owner.segments[0]);
      if (isPlainObject(container)) for (const key of Object.keys(container)) add(owner, [owner.segments[0], key]);
    }
  }
  return out;
}

/** True when `doc` carries at least one element for `owner`. */
function rendersAny(owner: ParsedElementSpec, doc: Record<string, unknown>): boolean {
  if (!owner.wildcard) {
    const value = readAt(doc, owner.segments);
    return Array.isArray(value) && value.length > 0;
  }
  const container = ownValue(doc, owner.segments[0]);
  return isPlainObject(container) && Object.values(container).some((value) => Array.isArray(value) && value.length > 0);
}

/** The pointers of every container the spec writes into that `doc` holds, with the right type. */
function containersOf(parsed: ParsedSpec, doc: Record<string, unknown>): { pointer: string; slots: Slot[] }[] {
  const byPointer = new Map<string, Slot[]>();
  const note = (pointer: string, slots: Slot[]): void => {
    byPointer.set(pointer, [...(byPointer.get(pointer) ?? []), ...slots]);
  };
  for (const slot of slotsOf(parsed, [doc])) {
    if (slot.segments.length === 2 && isPlainObject(ownValue(doc, slot.segments[0]))) {
      note(memberPointer([slot.segments[0]]), [slot]);
    }
    if (Array.isArray(readAt(doc, slot.segments))) note(slot.pointer, [slot]);
  }
  for (const owner of parsed.elements) {
    if (owner.wildcard && isPlainObject(ownValue(doc, owner.segments[0]))) note(memberPointer([owner.segments[0]]), []);
  }
  for (const member of parsed.members) {
    if (member.segments.length === 2 && isPlainObject(ownValue(doc, member.segments[0]))) {
      note(memberPointer([member.segments[0]]), []);
    }
  }
  return [...byPointer].map(([pointer, slots]) => ({ pointer, slots }));
}

/**
 * Throw `ADAPTER_ERROR` unless every member the rendering carries lies on a
 * pointer of the spec: a rendering this lane would silently not write, or
 * would write without recording, is an engine bug.
 */
function assertRenderingCovered(filePath: string, noun: string, parsed: ParsedSpec, rendering: Record<string, unknown>): void {
  const refuse = (what: string): never => {
    throw new EngineError(`Refusing to write ${filePath}: the emitted ${noun} ${what}.`, { code: "ADAPTER_ERROR" });
  };
  const isMember = (pointer: string): boolean => parsed.members.some((member) => member.spec.pointer === pointer);
  for (const key of Object.keys(rendering)) {
    const value = rendering[key];
    if (isMember(memberPointer([key]))) continue;
    if (parsed.elements.some((owner) => !owner.wildcard && owner.segments.length === 1 && owner.segments[0] === key)) {
      if (!Array.isArray(value)) refuse(`carries ${key} as ${describeJson(value)}, not an array`);
      continue;
    }
    const wildcard = parsed.elements.some((owner) => owner.wildcard && owner.segments[0] === key);
    const children = [...parsed.elements.map((owner) => owner.segments), ...parsed.members.map((member) => member.segments)].filter(
      (segments) => segments.length === 2 && segments[0] === key,
    );
    if (!wildcard && children.length === 0) refuse(`carries ${key}, which this lane does not write`);
    if (!isPlainObject(value)) return refuse(`carries ${key} as ${describeJson(value)}, not an object`);
    for (const child of Object.keys(value)) {
      const pointer = memberPointer([key, child]);
      if (isMember(pointer)) continue;
      const slot = wildcard || parsed.elements.some((owner) => memberPointer(owner.segments) === pointer);
      if (!slot) refuse(`carries ${key}.${child}, which this lane does not write`);
      if (!Array.isArray(value[child])) refuse(`carries ${key}.${child} as ${describeJson(value[child])}, not an array`);
    }
  }
}

// ── Judging elements ─────────────────────────────────────────────────────

type OwnershipState = "adoption" | "legacy" | "recorded";

interface Judged {
  readonly element: unknown;
  readonly index: number;
  readonly hash: string;
  readonly engine: boolean;
  readonly recorded: boolean;
  readonly recognised: boolean;
  readonly inBound: boolean;
}

/** Rule 1, over the elements of one existing array. */
function judge(
  slot: Slot,
  array: readonly unknown[],
  state: OwnershipState,
  record: CoOwnership | null,
  renderedHashes: ReadonlySet<string>,
): Judged[] {
  const recordedHashes = new Set(record?.elements?.[slot.pointer] ?? []);
  const { spec } = slot.owner;
  return array.map((element, index) => {
    const hash = memberHash(element);
    const recognised = spec.recognise(element);
    // In bound by path (the spec), or by re-rendering: equal to an element the
    // engine renders there now (S11) — what proves a user-hook entry whose
    // definition is still present (review/44).
    const inBound = spec.inBound(element) || renderedHashes.has(hash);
    const recorded = recordedHashes.has(hash);
    let engine = recognised;
    if (!engine && state === "legacy") engine = inBound || renderedHashes.has(hash);
    if (!engine && state === "recorded") engine = recorded && (inBound || spec.outsideBound === "backup");
    return { element, index, hash, engine, recorded, recognised, inBound };
  });
}

/** Why an engine element leaves only behind a backup; `null` when it leaves silently. */
type Unproven = "recognised" | "outside-bound" | "edited-file";

function whyUnproven(judged: Judged, unedited: boolean): Unproven | null {
  if (judged.inBound && (judged.recorded || unedited)) return null;
  if (judged.recognised) return "recognised";
  return judged.inBound ? "edited-file" : "outside-bound";
}

// ── Messages ─────────────────────────────────────────────────────────────

const BACKED_UP = "so the previous file was backed up first.";

function skipShape(shown: string, member: string, actual: unknown, expected: string): string {
  return (
    `Skipped ${shown}: ${member} is ${describeJson(actual)}, not ${expected}, so the engine cannot add its entries ` +
    `beside yours without replacing them. It was left untouched. Make it ${expected} (or remove it) and re-run sync.`
  );
}

function skipDocument(shown: string, why: string): string {
  return (
    `Skipped ${shown}: ${why}, so nothing in it can be kept beside the engine's entries. It was left untouched. ` +
    `Fix or delete it and re-run sync.`
  );
}

/** Warnings about engine elements that left, grouped by what the engine can say about them. */
class LeavingReport {
  private readonly stale: { name: string; proven: boolean }[] = [];
  private readonly replaced: string[] = [];
  private readonly removedRecognised: string[] = [];
  private readonly outside: string[] = [];
  private readonly edited: string[] = [];
  // Plain fields, not constructor parameter properties: `scripts/generate-docs.mjs`
  // runs `src/` under Node's strip-only TypeScript, which refuses those.
  private readonly shown: string;
  private readonly hint: string;

  constructor(shown: string, hint: string) {
    this.shown = shown;
    this.hint = hint;
  }

  /**
   * `stale`: the rendering carries no element of this kind at all (a
   * plugin-backed setup renders no hooks), so a recognised entry is the
   * repository-mode wiring left behind, and its removal is reported even when
   * proven. Any other proven removal is the rendering having moved, and says
   * nothing.
   */
  add(name: string, why: Unproven | null, recognised: boolean, stale: boolean, slotRendered: boolean): void {
    if (stale && recognised) {
      this.stale.push({ name, proven: why === null });
      return;
    }
    if (why === "recognised") (slotRendered ? this.replaced : this.removedRecognised).push(name);
    else if (why === "outside-bound") this.outside.push(name);
    else if (why === "edited-file") this.edited.push(name);
  }

  warnings(): string[] {
    const out: string[] = [];
    const hint = this.hint === "" ? "" : ` ${this.hint}`;
    if (this.stale.length > 0) {
      const one = this.stale.length === 1;
      out.push(
        `Removed the repository-mode hooks wiring (${this.stale.map((entry) => entry.name).join(", ")}) from ` +
          `${this.shown}: ${one ? "it runs" : "they run"} the engine's hook scripts, which this setup no longer ` +
          `wires, and a wiring pointing at scripts that are not there fails closed on every tool call.` +
          (this.stale.every((entry) => entry.proven)
            ? ""
            : ` The previous file was backed up first: if it carried rows of yours, they are there.${hint}`),
      );
    }
    const recognised = (verb: string, preposition: string, names: string[]): void => {
      if (names.length === 0) return;
      out.push(
        `${verb} ${names.join(", ")} ${preposition} ${this.shown}: ${names.length === 1 ? "it runs" : "each runs"} the ` +
          `engine's hook script but is not the entry the engine last wrote (an earlier setup's, or edited by hand), ` +
          `${BACKED_UP} Keep a hook of your own in an entry of its own.${hint}`,
      );
    };
    recognised("Replaced", "of", this.replaced);
    recognised("Removed", "from", this.removedRecognised);
    if (this.outside.length > 0) {
      const one = this.outside.length === 1;
      out.push(
        `Removed ${this.outside.join(", ")} from ${this.shown}: the ledger records ${one ? "it" : "them"} as the ` +
          `engine's, but ${one ? "it lies" : "they lie"} outside what the engine can prove it wrote by path, ` +
          `${BACKED_UP}${hint}`,
      );
    }
    if (this.edited.length > 0) {
      out.push(
        `Removed ${this.edited.join(", ")} from ${this.shown}: the file has changed since the engine last wrote it, ` +
          `${BACKED_UP}${hint}`,
      );
    }
    return out;
  }
}

// ── Planning ─────────────────────────────────────────────────────────────

function isUnedited(filePath: string, existingRaw: string, ownership: CoOwnedOwnership): boolean {
  const hashes = ownership.ledgerHashes;
  if (!ownership.owned || hashes === undefined || !hashes.has(toLedgerKey(filePath))) return false;
  return !hasLedgerDrift(filePath, existingRaw, hashes);
}

function skippedPlan(filePath: string, reason: string): CoOwnedPlan {
  return {
    result: { path: filePath, action: "skipped", warning: reason },
    content: null,
    backup: null,
    collision: reason,
    record: null,
  };
}

function parseRendering(filePath: string, spec: CoOwnedJsonSpec, parsed: ParsedSpec, emitted: string): Record<string, unknown> {
  const rendering = parseObject(emitted);
  if (!rendering.ok) {
    throw new EngineError(`Refusing to write ${filePath}: the emitted ${spec.noun} is not valid JSON (${rendering.error}).`, {
      code: "ADAPTER_ERROR",
    });
  }
  assertRenderingCovered(filePath, spec.noun, parsed, rendering.doc);
  return rendering.doc;
}

/** The record a created file starts with: every rendered element and member. */
function createdRecord(parsed: ParsedSpec, rendering: Record<string, unknown>): CoOwnership {
  const elements: Record<string, string[]> = {};
  for (const slot of slotsOf(parsed, [rendering])) {
    const value = readAt(rendering, slot.segments) as unknown[];
    if (value.length > 0) elements[slot.pointer] = value.map(memberHash);
  }
  const members: Record<string, string> = {};
  for (const member of parsed.members) {
    const value = readAt(rendering, member.segments);
    if (value !== undefined) members[member.spec.pointer] = memberHash(value);
  }
  return assembleRecord(members, elements, [], true);
}

function assembleRecord(
  members: Record<string, string>,
  elements: Record<string, string[]>,
  preexisting: readonly string[],
  createdFile: boolean,
): CoOwnership {
  return {
    ...(Object.keys(members).length > 0 ? { members } : {}),
    ...(Object.keys(elements).length > 0 ? { elements } : {}),
    ...(preexisting.length > 0 ? { preexisting: [...preexisting] } : {}),
    ...(createdFile ? { createdFile: true as const } : {}),
  };
}

/** Rule 4's starting set: adopted on a first write, carried forward after, none under a legacy row. */
function preexistingOf(parsed: ParsedSpec, doc: Record<string, unknown>, state: OwnershipState, record: CoOwnership | null): string[] {
  const present = containersOf(parsed, doc);
  if (state === "recorded") {
    const pointers = new Set(present.map((container) => container.pointer));
    return (record?.preexisting ?? []).filter((pointer) => pointers.has(pointer));
  }
  if (state === "legacy") return [];
  return present
    .filter((container) =>
      container.slots.every((slot) => {
        const array = readAt(doc, slot.segments);
        return !Array.isArray(array) || !array.some((element) => slot.owner.spec.recognise(element));
      }),
    )
    .map((container) => container.pointer)
    .toSorted();
}

/**
 * Delete each container the engine emptied (rule 4): a depth-2 parent of an
 * engine pointer left with no members that held some before, unless it is
 * preexisting.
 */
function pruneParents(
  out: Record<string, unknown>,
  before: Record<string, unknown>,
  parsed: ParsedSpec,
  preexisting: ReadonlySet<string>,
): void {
  const parents = new Set<string>();
  for (const owner of parsed.elements) if (owner.segments.length === 2) parents.add(owner.segments[0]);
  for (const member of parsed.members) if (member.segments.length === 2) parents.add(member.segments[0]);
  for (const key of parents) {
    const now = ownValue(out, key);
    const then = ownValue(before, key);
    if (!isPlainObject(now) || Object.keys(now).length > 0) continue;
    if (isPlainObject(then) && Object.keys(then).length === 0) continue;
    if (preexisting.has(memberPointer([key]))) continue;
    delete out[key];
  }
}

/** Set one array slot to `output`: an emptied array the engine emptied goes unless preexisting (rule 4). */
function placeArray(
  out: Record<string, unknown>,
  slot: Slot,
  existing: unknown,
  output: readonly unknown[],
  preexisting: ReadonlySet<string>,
): void {
  if (output.length > 0) {
    writeAt(out, slot.segments, output);
    return;
  }
  if (!Array.isArray(existing) || existing.length === 0) return;
  if (preexisting.has(slot.pointer)) writeAt(out, slot.segments, []);
  else deleteAt(out, slot.segments);
}

/**
 * The adoption notice's tally: every foreign entry of the existing document,
 * by member. On adoption nothing but a recognised element is the engine's, so
 * every member present, a spec member included, is the owner's.
 */
function foreignTally(
  doc: Record<string, unknown>,
  parsed: ParsedSpec,
  judgedBySlot: ReadonlyMap<string, readonly Judged[]>,
): { name: string; count: number }[] {
  const tally: { name: string; count: number }[] = [];
  const count = (segments: MemberSegments, pointer: string, value: unknown): void => {
    const judged = judgedBySlot.get(pointer);
    const foreign = judged === undefined ? (Array.isArray(value) && value.length === 0 ? 0 : 1) : judged.filter((entry) => !entry.engine).length;
    if (foreign > 0) tally.push({ name: shownMember(segments), count: foreign });
  };
  for (const key of Object.keys(doc)) {
    const value = doc[key];
    const container =
      parsed.elements.some((owner) => owner.segments.length === 2 && owner.segments[0] === key) ||
      parsed.members.some((member) => member.segments.length === 2 && member.segments[0] === key);
    if (!container || !isPlainObject(value)) {
      count([key], memberPointer([key]), value);
      continue;
    }
    for (const child of Object.keys(value)) count([key, child], memberPointer([key, child]), value[child]);
  }
  return tally;
}

/**
 * Decide the write for `filePath` from the bytes alone, by the rules in the
 * module header. `emitted` is the engine's whole rendering of the document;
 * `existingRaw` the bytes on disk, `null` when there are none.
 */
export function planCoOwnedJson(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  spec: CoOwnedJsonSpec,
  ownership: CoOwnedOwnership,
): CoOwnedPlan {
  const planned = planUnbounded(filePath, emitted, existingRaw, spec, ownership);
  const overBound = planned.record === null ? null : recordOverBound(planned.record);
  if (overBound === null) return planned;
  return skippedPlan(filePath, `Skipped ${displayPath(filePath, ownership.boundaryDir)}: ${overBound}`);
}

/**
 * Why `record` holds more than the manifest reader takes (`./manifest.ts`), as
 * the rest of a refusal sentence; `null` within the bound. The writer holds
 * the reader's bound, so no run writes a manifest the next run refuses.
 */
function recordOverBound(record: CoOwnership): string | null {
  const preexisting = record.preexisting?.length ?? 0;
  if (preexisting > MAX_CO_OWNED_POINTERS) {
    return (
      `it holds ${preexisting} containers on the engine's pointers (hooks events and the like), more than the ` +
      `${MAX_CO_OWNED_POINTERS} the ledger can record for one file, so the engine cannot record which entries in it ` +
      `are its own. It was left untouched. Remove the containers you do not use and re-run sync.`
    );
  }
  const pointers = [Object.keys(record.members ?? {}).length, Object.keys(record.elements ?? {}).length];
  const perArray = Object.values(record.elements ?? {}).map((hashes) => hashes.length);
  if (pointers.every((count) => count <= MAX_CO_OWNED_POINTERS) && perArray.every((count) => count <= MAX_CO_OWNED_ELEMENTS)) return null;
  return (
    `the engine's entries in it exceed what the ledger can record for one file (${MAX_CO_OWNED_POINTERS} members or ` +
    `arrays, ${MAX_CO_OWNED_ELEMENTS} entries in one array). It was left untouched; nothing in the file needs to change.`
  );
}

function planUnbounded(
  filePath: string,
  emitted: string,
  existingRaw: string | null,
  spec: CoOwnedJsonSpec,
  ownership: CoOwnedOwnership,
): CoOwnedPlan {
  const parsed = parseSpec(spec);
  const rendering = parseRendering(filePath, spec, parsed, emitted);
  const shown = displayPath(filePath, ownership.boundaryDir);
  if (existingRaw === null) {
    return {
      result: { path: filePath, action: "created" },
      content: serialiseJson(rendering, ENGINE_JSON_STYLE),
      backup: null,
      collision: null,
      record: createdRecord(parsed, rendering),
    };
  }
  const existing = parseObject(existingRaw);
  if (!existing.ok) {
    return skippedPlan(
      filePath,
      skipDocument(shown, existing.error.startsWith("syntax error") ? `it is not valid JSON (${existing.error})` : `it is ${existing.error}`),
    );
  }
  try {
    return mergeInto(filePath, shown, existingRaw, existing.doc, rendering, spec, parsed, ownership);
    // reason: not silent — a document this engine cannot serialise back is a
    // collision the plan names, rather than a RangeError escaping the run.
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return skippedPlan(filePath, skipDocument(shown, `it is not a document this engine can serialise back (${error.message})`));
  }
}

function mergeInto(
  filePath: string,
  shown: string,
  existingRaw: string,
  doc: Record<string, unknown>,
  rendering: Record<string, unknown>,
  spec: CoOwnedJsonSpec,
  parsed: ParsedSpec,
  ownership: CoOwnedOwnership,
): CoOwnedPlan {
  const state: OwnershipState = !ownership.owned ? "adoption" : ownership.legacy ? "legacy" : "recorded";
  const record = state === "recorded" ? ownership.record : null;
  const unedited = isUnedited(filePath, existingRaw, ownership);
  const preexisting = preexistingOf(parsed, doc, state, record);
  const preexistingSet = new Set(preexisting);

  // Shape first: every container the rendering writes into must have the right type.
  for (const slot of slotsOf(parsed, [rendering])) {
    if ((readAt(rendering, slot.segments) as unknown[]).length === 0) continue;
    if (slot.segments.length === 2) {
      const parent = ownValue(doc, slot.segments[0]);
      if (parent !== undefined && !isPlainObject(parent)) {
        return skippedPlan(filePath, skipShape(shown, shownMember([slot.segments[0]]), parent, "an object"));
      }
    }
    const array = readAt(doc, slot.segments);
    if (array !== undefined && !Array.isArray(array)) {
      return skippedPlan(filePath, skipShape(shown, shownMember(slot.segments), array, "an array"));
    }
  }
  for (const member of parsed.members) {
    if (member.segments.length !== 2 || readAt(rendering, member.segments) === undefined) continue;
    const parent = ownValue(doc, member.segments[0]);
    if (parent !== undefined && !isPlainObject(parent)) {
      return skippedPlan(filePath, skipShape(shown, shownMember([member.segments[0]]), parent, "an object"));
    }
  }

  const out: Record<string, unknown> = { ...doc };
  const leaving = new LeavingReport(shown, spec.personalHint ?? "");
  const warnings: string[] = [];
  const notices: string[] = [];
  let backup = false;
  const elements: Record<string, string[]> = {};
  const members: Record<string, string> = {};
  const judgedBySlot = new Map<string, Judged[]>();

  for (const slot of slotsOf(parsed, [rendering, doc])) {
    const existingArray = readAt(doc, slot.segments);
    const rendered = (readAt(rendering, slot.segments) as unknown[] | undefined) ?? [];
    if (existingArray !== undefined && !Array.isArray(existingArray)) continue;
    const renderedHashes = new Set(rendered.map(memberHash));
    const judged = judge(slot, existingArray ?? [], state, record, renderedHashes);
    judgedBySlot.set(slot.pointer, judged);
    const stale = !rendersAny(slot.owner, rendering);
    for (const entry of judged) {
      if (!entry.engine || renderedHashes.has(entry.hash)) continue;
      const why = whyUnproven(entry, unedited);
      if (why !== null) backup = true;
      leaving.add(`${shownMember(slot.segments)}[${entry.index}]`, why, entry.recognised, stale, rendered.length > 0);
    }
    const foreign = judged.filter((entry) => !entry.engine);
    const foreignHashes = new Set(foreign.map((entry) => entry.hash));
    const block = rendered.filter((element) => !foreignHashes.has(memberHash(element)));
    const firstEngine = judged.findIndex((entry) => entry.engine);
    const at = firstEngine === -1 ? foreign.length : judged.slice(0, firstEngine).filter((entry) => !entry.engine).length;
    const kept = foreign.map((entry) => entry.element);
    placeArray(out, slot, existingArray, [...kept.slice(0, at), ...block, ...kept.slice(at)], preexistingSet);
    if (block.length > 0) elements[slot.pointer] = block.map(memberHash);
  }

  for (const member of parsed.members) {
    const outcome = planMember(member, doc, rendering, state, record, unedited, ownership.owned, shown);
    if (outcome.collision !== null) return skippedPlan(filePath, outcome.collision);
    if (outcome.write !== undefined) writeAt(out, member.segments, outcome.write);
    if (outcome.remove) deleteAt(out, member.segments);
    if (outcome.recorded !== null) members[member.spec.pointer] = outcome.recorded;
    if (outcome.warning !== null) warnings.push(outcome.warning);
    if (outcome.notice !== null) notices.push(outcome.notice);
    backup ||= outcome.backup;
  }
  pruneParents(out, doc, parsed, preexistingSet);
  for (const key of Object.keys(out)) {
    const renderedChild = rendering[key];
    if (isPlainObject(out[key]) && isPlainObject(renderedChild)) setOwn(out, key, orderAdded(out[key] as Record<string, unknown>, doc[key], renderedChild));
  }
  const merged = orderAdded(out, doc, rendering);

  if (!ownership.owned) {
    const tally = foreignTally(doc, parsed, judgedBySlot);
    if (tally.length > 0) {
      const total = tally.reduce((sum, item) => sum + item.count, 0);
      const listed = tally.map((item) => `${item.name} ×${item.count}`).join(", ");
      notices.unshift(
        `Merged into ${shown}: kept your ${total} ${entries(total)} (${listed}) beside the engine's; the ` +
          `engine owns only the entries it wrote.`,
      );
    }
  }

  const createdFile = state === "legacy" || ownership.record?.createdFile === true;
  const nextRecord = assembleRecord(members, elements, preexisting.filter((pointer) => readAt(merged, parseMemberPointer(pointer)) !== undefined), createdFile);
  const notice = notices.length === 0 ? {} : { notice: notices.join(" ") };
  if (sameJson(merged, doc)) {
    return { result: { path: filePath, action: "unchanged", ...notice }, content: null, backup: null, collision: null, record: nextRecord };
  }
  // A document the write cannot carry back whole loses an owner's value on
  // any write (`./jsonMembers.ts::roundTripLoss`), so the write owes a backup.
  const loss = roundTripLoss(existingRaw);
  if (loss !== null) {
    backup = true;
    warnings.push(`${shown} ${loss}, ${BACKED_UP}`);
  }
  const allWarnings = [...leaving.warnings(), ...warnings];
  return {
    result: {
      path: filePath,
      action: "updated",
      ...(allWarnings.length === 0 ? {} : { warning: allWarnings.join(" ") }),
      ...notice,
    },
    content: serialiseJson(merged, jsonStyleOf(existingRaw)),
    backup: backup ? existingRaw : null,
    collision: null,
    record: nextRecord,
  };
}

interface MemberOutcome {
  write?: unknown;
  remove: boolean;
  recorded: string | null;
  backup: boolean;
  warning: string | null;
  notice: string | null;
  collision: string | null;
}

/** Rule 5 for one member. */
function planMember(
  member: ParsedMemberSpec,
  doc: Record<string, unknown>,
  rendering: Record<string, unknown>,
  state: OwnershipState,
  record: CoOwnership | null,
  unedited: boolean,
  owned: boolean,
  shown: string,
): MemberOutcome {
  const outcome: MemberOutcome = { remove: false, recorded: null, backup: false, warning: null, notice: null, collision: null };
  const name = shownMember(member.segments);
  const rendered = readAt(rendering, member.segments);
  const value = readAt(doc, member.segments);
  if (value === undefined) {
    if (rendered !== undefined) {
      outcome.write = rendered;
      outcome.recorded = memberHash(rendered);
    }
    return outcome;
  }
  const hash = memberHash(value);
  const equalsRendering = rendered !== undefined && hash === memberHash(rendered);
  const recordedHash = record?.members?.[member.spec.pointer];
  const collide = (why: string, expected: string): string =>
    `Skipped ${shown}: ${name} ${why}, where it writes ${expected}, so the engine cannot add its entries beside ` +
    `yours without replacing it. It was left untouched. Make it ${expected} (or remove it) and re-run sync.`;
  // The release-history bound: a value an earlier release rendered is the
  // engine's, proven by re-rendering that release, so it moves on silently.
  if (!equalsRendering && member.spec.known?.(value) === true) {
    if (rendered !== undefined) {
      outcome.write = rendered;
      outcome.recorded = memberHash(rendered);
    } else if (member.spec.structural === true) outcome.recorded = hash;
    else outcome.remove = true;
    return outcome;
  }
  let engine: boolean;
  let proven: boolean;
  if (recordedHash !== undefined) {
    proven = hash === recordedHash;
    engine = proven || member.spec.foreign === "collide";
    if (!engine) {
      outcome.notice =
        `Kept your ${name} in ${shown}: it differs from what the engine last wrote there, so it is yours now and ` +
        `the engine no longer writes it.`;
      return outcome;
    }
  } else if (state === "legacy" && (equalsRendering || unedited)) {
    engine = true;
    proven = true;
  } else {
    engine = false;
    proven = false;
  }
  // S11 and S12 (review/45): a member's one proof is the engine's CURRENT
  // rendering; a recorded hash — the member's, or the whole file's under a
  // legacy row — is a claim. So a `collide` member that differs from what the
  // engine writes is a collision naming it, whatever the record says, and a
  // forged record equal to the owner's value can never replace it silently.
  if (member.spec.foreign === "collide" && rendered !== undefined && !equalsRendering) {
    const why = !engine
      ? "holds a value the engine did not write"
      : !proven
        ? "differs from what the engine last wrote there"
        : "differs from the engine's current rendering, which is the one proof the engine has for it";
    outcome.collision = collide(why, shownValue(rendered));
    return outcome;
  }
  if (!engine) {
    if (rendered === undefined || equalsRendering) return outcome;
    if (!owned) {
      outcome.notice = `Kept your ${name} in ${shown}; the engine's rendering of it is not written there — remove yours to get it back.`;
    }
    return outcome;
  }
  // From here a member that differs from the rendering is a `yield` one (a
  // differing `collide` one collided above): changing or removing it takes a
  // backup, since only the current rendering proves the engine wrote it.
  const unprovenWarning = (verb: string, preposition: string): string =>
    proven
      ? `${verb} ${name} ${preposition} ${shown}: the engine can prove it wrote a value there only when it equals ` +
        `its current rendering, and this one does not, ${BACKED_UP}`
      : `${verb} ${name} ${preposition} ${shown}: it differs from what the engine last wrote there, ${BACKED_UP}`;
  if (rendered !== undefined) {
    outcome.recorded = memberHash(rendered);
    if (equalsRendering) return outcome;
    // A proven `yield` member the rendering moved past (an edited one became the owner's above).
    outcome.write = rendered;
    outcome.backup = true;
    outcome.warning = unprovenWarning("Replaced", "of");
    return outcome;
  }
  // The rendering no longer carries the member. A structural one stays until
  // nothing foreign remains, which only the reducer can see.
  if (member.spec.structural === true) {
    if (proven) outcome.recorded = hash;
    return outcome;
  }
  // Removed only behind a backup: a value the rendering no longer carries
  // cannot equal it, so nothing proves the engine wrote it.
  outcome.remove = true;
  outcome.backup = true;
  outcome.warning = unprovenWarning("Removed", "from");
  return outcome;
}

// ── Link guard, prediction, materialization ──────────────────────────────

/**
 * Refuse before reading when `filePath`'s bytes are not that file's alone. A
 * missing file is not a linked one: ENOENT falls through so `created` works.
 * Moved from `./claudeSettings.ts` with its texts unchanged; it takes no noun,
 * because neither text names the document.
 */
export async function refuseLinkedCoOwnedTarget(filePath: string): Promise<void> {
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

/**
 * Run `plan` over the bytes on disk and write nothing. The link refusal runs
 * ahead of the read, so no linked byte is read or quoted.
 */
export async function predictCoOwnedMerge(
  filePath: string,
  plan: (existingRaw: string | null) => CoOwnedPlan,
  noun: string,
): Promise<CoOwnedPrediction> {
  try {
    await refuseLinkedCoOwnedTarget(filePath);
  } catch (error) {
    if (!(error instanceof EngineError)) throw error;
    return {
      result: { path: filePath, action: "skipped", warning: error.message },
      collision: { kind: "shared-name", detail: error.message },
    };
  }
  const planned = plan(await readTextOrNull(filePath, noun));
  return {
    result: planned.result,
    collision: planned.collision === null ? null : { kind: "co-owned-shape", detail: planned.collision },
  };
}

/**
 * Write what `plan` decides into `filePath`, under the path's write lock for
 * the whole read-plan-backup-write cycle (`../merge/safeWrite.ts` holds its
 * lane the same way), so a concurrent run cannot slip a change in between the
 * read the plan was computed from and the write. Containment first, as the
 * safe-write lane orders it: the mkdir and the lockfile both build directories
 * on this path, so an unchecked path would have the engine materialising a
 * tree through a planted link before any decision is computed.
 */
export async function materializeCoOwned(
  filePath: string,
  plan: (existingRaw: string | null) => CoOwnedPlan,
  ownership: Pick<CoOwnedOwnership, "boundaryDir">,
  noun: string,
): Promise<CoOwnedMergeResult> {
  await assertWriteTargetContained(filePath, ownership.boundaryDir);
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch (error) {
    throw mapFsErrno(error, filePath) ?? error;
  }
  const release = await acquireWriteLock(filePath, ownership.boundaryDir);
  try {
    await refuseLinkedCoOwnedTarget(filePath);
    const existingRaw = await readTextOrNull(filePath, noun);
    const planned = plan(existingRaw);
    let result = planned.result;
    if (planned.backup !== null) {
      const bakPath = await backupBeforeOverwrite(filePath, planned.backup, "verified backup", ownership.boundaryDir);
      result = { ...result, warning: `${result.warning ?? ""} Your previous file is at ${bakPath}.`.trim() };
    }
    if (planned.content !== null) {
      await atomicWriteFileUnlocked(
        filePath,
        planned.content,
        ownership.boundaryDir === undefined ? undefined : { boundaryDir: ownership.boundaryDir },
      );
    }
    const skipped = result.action === "skipped";
    return {
      ...result,
      writtenContent: planned.content ?? (skipped ? null : existingRaw),
      writtenRecord: skipped ? null : planned.record,
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

// ── Reclaim ──────────────────────────────────────────────────────────────

/**
 * What should be left of `raw` once the engine's entries are taken out — the
 * reclaim sweep's view of the document (`../merge/reclaim.ts` gate 4). Rules
 * 1, 3, 4 and 5 with nothing rendered, unless the caller hands the current
 * rendering as `rendered` for a legacy row's equality proofs. The path is
 * ledgered (the sweep reaches only such paths), so there is no adoption here,
 * and the whole-file hash half of rule 3 is the sweep's: `proven` says every
 * removed unit was recorded and in bound, `mustBackUp` that one lay outside
 * the bound. Pure, and it writes nothing.
 */
export function reduceCoOwnedJson(
  raw: string,
  spec: CoOwnedJsonSpec,
  opts: { record: CoOwnership | null; legacy: boolean; deleteWhenEngineOnly: boolean; rendered?: unknown },
): CoOwnedReduction {
  const unreadable = (why: string): CoOwnedReduction => ({
    kind: "untouched",
    detail:
      `This ${spec.noun} ${why}, so which of its entries the engine wrote cannot be read. Nothing was removed ` +
      `and nothing was deleted — fix or delete the file by hand.`,
  });
  const parsedDoc = parseObject(raw);
  if (!parsedDoc.ok) {
    return unreadable(parsedDoc.error.startsWith("syntax error") ? `is not valid JSON (${parsedDoc.error})` : `is ${parsedDoc.error}`);
  }
  try {
    return reduceDocument(raw, parsedDoc.doc, spec, opts);
    // reason: not silent — reported as untouched, the file kept whole.
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return unreadable(`is not a document this engine can serialise back (${error.message})`);
  }
}

function reduceDocument(
  raw: string,
  doc: Record<string, unknown>,
  spec: CoOwnedJsonSpec,
  opts: { record: CoOwnership | null; legacy: boolean; deleteWhenEngineOnly: boolean; rendered?: unknown },
): CoOwnedReduction {
  const parsed = parseSpec(spec);
  const state: OwnershipState = opts.legacy ? "legacy" : "recorded";
  const record = opts.legacy ? null : opts.record;
  const rendering = isPlainObject(opts.rendered) ? opts.rendered : {};
  const preexisting = new Set(record?.preexisting ?? []);
  const out: Record<string, unknown> = { ...doc };
  const removed: string[] = [];
  let proven = true;
  let mustBackUp = false;

  for (const slot of slotsOf(parsed, [doc])) {
    const array = readAt(doc, slot.segments);
    if (!Array.isArray(array)) continue;
    const rendered = readAt(rendering, slot.segments);
    const renderedHashes = new Set(Array.isArray(rendered) ? rendered.map(memberHash) : []);
    const judged = judge(slot, array, state, record, renderedHashes);
    if (!judged.some((entry) => entry.engine)) continue;
    for (const entry of judged.filter((candidate) => candidate.engine)) {
      removed.push(`${shownMember(slot.segments)}[${entry.index}]`);
      proven &&= entry.recorded && entry.inBound;
      if (!entry.inBound) mustBackUp = true;
    }
    placeArray(out, slot, array, judged.filter((entry) => !entry.engine).map((entry) => entry.element), preexisting);
  }

  const structural: { member: ParsedMemberSpec; proven: boolean; outsideBound: boolean }[] = [];
  for (const member of parsed.members) {
    const value = readAt(doc, member.segments);
    if (value === undefined) continue;
    const hash = memberHash(value);
    const recordedHash = record?.members?.[member.spec.pointer];
    const rendered = readAt(rendering, member.segments);
    // In the bound: equal to the engine's current rendering (`opts.rendered`),
    // or a value an earlier release rendered there (the spec's `known`).
    const equalsRendering = (rendered !== undefined && hash === memberHash(rendered)) || member.spec.known?.(value) === true;
    let isProven = false;
    let engine = false;
    if (recordedHash !== undefined) {
      isProven = hash === recordedHash || member.spec.known?.(value) === true;
      engine = isProven || member.spec.foreign === "collide";
    } else if (state === "legacy") {
      engine = member.spec.structural === true || equalsRendering;
    }
    if (!engine) continue;
    // S11, as the planner holds it (review/31, review/45): a member of either
    // kind leaves without a backup only when it equals the engine's current
    // rendering or a release's (`known`); a recorded hash alone is a claim.
    const outsideBound = !equalsRendering;
    if (member.spec.structural === true) {
      structural.push({ member, proven: isProven && !outsideBound, outsideBound });
      continue;
    }
    deleteAt(out, member.segments);
    removed.push(shownMember(member.segments));
    proven &&= isProven && !outsideBound;
    if (outsideBound) mustBackUp = true;
  }
  pruneParents(out, doc, parsed, preexisting);

  const withoutStructural: Record<string, unknown> = { ...out };
  for (const entry of structural) deleteAt(withoutStructural, entry.member.segments);
  pruneParents(withoutStructural, out, parsed, preexisting);
  const foreignRemains = Object.keys(withoutStructural).length > 0;
  if (!foreignRemains) {
    for (const entry of structural) {
      deleteAt(out, entry.member.segments);
      removed.push(shownMember(entry.member.segments));
      proven &&= entry.proven;
      if (entry.outsideBound) mustBackUp = true;
    }
    pruneParents(out, doc, parsed, preexisting);
  }

  if (removed.length === 0) {
    return {
      kind: "untouched",
      detail:
        `Co-owned ${spec.noun} holding none of the entries this engine wrote — every entry in it is the client's ` +
        `or the operator's, so the file is left exactly as it is.`,
    };
  }
  // A reduction rewrites or deletes the file, so a value it cannot carry back
  // whole (`./jsonMembers.ts::roundTripLoss`) is backed up first.
  const loss = roundTripLoss(raw);
  const lossNote = loss === null ? "" : ` It ${loss}, so it is backed up first.`;
  const proof = { proven, ...(mustBackUp || loss !== null ? { mustBackUp: true as const } : {}) };
  const list = `${removed.length} ${entries(removed.length)} (${removed.join(", ")})`;
  if (!foreignRemains && opts.deleteWhenEngineOnly) {
    return {
      kind: "engine-only",
      ...proof,
      detail:
        `Co-owned ${spec.noun} that proved to be engine-only: removing the engine's ${list} left nothing of the ` +
        `client's or the operator's.${lossNote}`,
    };
  }
  // Something was removed, so the document differs and so do its bytes: a
  // reduction never rewrites a file to its own content.
  return {
    kind: "reduced",
    content: serialiseJson(out, jsonStyleOf(raw)),
    ...proof,
    detail: `Co-owned ${spec.noun}: the engine's ${list} were removed and everything else in it is kept, so the file stays.${lossNote}`,
  };
}
