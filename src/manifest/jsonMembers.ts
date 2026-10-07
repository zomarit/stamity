/**
 * Members of a JSON document, addressed and proved one by one, and the
 * document's own style kept across a merge (REQ-FLOW-036, S10 and S15).
 *
 * A co-owned document carries no marker — JSON has no comment, and no client
 * documents tolerating an unknown key inside one of its entries — so what the
 * engine wrote there is recorded in the ledger instead (`LedgerEntry.coOwned`):
 * a member or an array element is named by an RFC 6901 pointer of depth 1 or
 * 2, and proved by the sha256 of its CANONICAL JSON, every object's keys
 * sorted, so a key-sorting formatter does not read as an edit.
 *
 * The style half: a merged document is written back in the indentation (two or
 * four spaces, a tab, or one line), line ending and final newline it was read
 * in, and in its own key order (the parsed value keeps it). What
 * `JSON.stringify` cannot write — aligned colons, an inline array inside an
 * indented object, `1.0`, an escaped `é`, duplicate keys, integer-like keys out
 * of numeric order — comes back with the same keys and values, not the same
 * bytes: that residue is named, not hidden.
 *
 * Pure: no filesystem, no clock.
 */

import { createHash } from "node:crypto";
import { isPlainObject } from "../config/parse.ts";
import { EngineError } from "../types/errors.ts";
import type { CoOwnership } from "../types/manifest.ts";

/**
 * At most this many member pointers in a `coOwned` record's `members`,
 * `elements` and `preexisting` each: the manifest reader refuses more
 * (`./manifest.ts`), so the writer (`./coOwnedJson.ts`) never records more.
 */
export const MAX_CO_OWNED_POINTERS = 64;
/** At most this many element hashes under one array pointer of a `coOwned` record. */
export const MAX_CO_OWNED_ELEMENTS = 256;

/** An RFC 6901 pointer of depth 1 or 2, e.g. `/permissions/allow`. */
export type MemberPointer = string;

/** A pointer's decoded segments. */
export type MemberSegments = readonly [string] | readonly [string, string];

/** One segment, escaped: `~` first, then `/` (RFC 6901 §3). */
function escapeSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/** The pointer naming `segments`. */
export function memberPointer(segments: MemberSegments): MemberPointer {
  return segments.map((segment) => `/${escapeSegment(segment)}`).join("");
}

/** A `~` followed by anything but `0` or `1`, or ending the segment. */
const BAD_ESCAPE = /~(?![01])/;

/**
 * The segments `pointer` names. Refuses, as a `VALIDATION_ERROR` naming the
 * pointer, the empty pointer, one without a leading `/`, a depth of 0 or past
 * 2, and a `~` not followed by `0` or `1`. An empty segment is a key like any
 * other — RFC 6901 allows the empty reference token, and an owner's
 * `{"hooks":{"":[]}}` names its event by one — so every pointer
 * {@link memberPointer} builds parses back.
 */
export function parseMemberPointer(pointer: string): MemberSegments {
  const refuse = (): EngineError =>
    new EngineError(`\`${pointer}\` is not a member pointer of depth 1 or 2 (RFC 6901)`, {
      code: "VALIDATION_ERROR",
    });
  if (!pointer.startsWith("/")) throw refuse();
  const raw = pointer.slice(1).split("/");
  if (raw.length > 2 || raw.some((segment) => BAD_ESCAPE.test(segment))) throw refuse();
  // `~1` before `~0`, so `~01` decodes to `~1` and never to `/`.
  const segments = raw.map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  return segments.length === 1 ? [segments[0] as string] : [segments[0] as string, segments[1] as string];
}

/**
 * `value` as canonical JSON: every object's own keys sorted by code unit at
 * every depth, arrays in order, no whitespace. Built by hand rather than by
 * re-keying an object, because an object puts integer-like keys first whatever
 * order they are assigned in. A `RangeError` past the stack propagates.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    const members = Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${members.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The lowercase sha256 hex of `value`'s canonical JSON. */
export function memberHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/** An own property of `container`, or `undefined` — never one off the prototype chain. */
function ownValue(container: unknown, key: string): unknown {
  return isPlainObject(container) && Object.hasOwn(container, key) ? container[key] : undefined;
}

/**
 * The value at `pointer` in `doc`: own properties only, and `undefined` when a
 * depth-2 parent is absent or not a plain object.
 */
export function readMember(doc: Record<string, unknown>, pointer: MemberPointer): unknown {
  const segments = parseMemberPointer(pointer);
  const top = ownValue(doc, segments[0]);
  return segments.length === 1 ? top : ownValue(top, segments[1]);
}

/** The hash of each member of `pointers` that `doc` holds; absent ones are left out. */
export function memberHashes(
  doc: Record<string, unknown>,
  pointers: readonly MemberPointer[],
): Record<MemberPointer, string> {
  const out: Record<MemberPointer, string> = {};
  for (const pointer of pointers) {
    const value = readMember(doc, pointer);
    if (value !== undefined) out[pointer] = memberHash(value);
  }
  return out;
}

/**
 * What the record says about one member: `absent` (not in the document),
 * `unrecorded` (the record holds no hash for it), `proven` (its hash is the
 * recorded one) or `edited` (it is not).
 */
export type MemberProof = "absent" | "proven" | "edited" | "unrecorded";

/** Prove the member at `pointer` against `record`. */
export function proveMember(
  doc: Record<string, unknown>,
  pointer: MemberPointer,
  record: CoOwnership | null,
): MemberProof {
  const value = readMember(doc, pointer);
  if (value === undefined) return "absent";
  const recorded = record?.members?.[pointer];
  if (recorded === undefined) return "unrecorded";
  return memberHash(value) === recorded ? "proven" : "edited";
}

/**
 * `doc` without the members of `owned` it holds, as a fresh document (the
 * input is not mutated; a depth-2 removal copies its parent). `removed` names
 * each member taken out, in `owned` order; `proven` is true when every one of
 * them was proven against `record` (and when none was removed). A parent left
 * empty stays: what an emptied container does is the caller's rule.
 */
export function removeOwnedMembers(
  doc: Record<string, unknown>,
  owned: readonly MemberPointer[],
  record: CoOwnership | null,
): { doc: Record<string, unknown>; removed: MemberPointer[]; proven: boolean } {
  // Spread copies with CreateDataProperty, so an own `__proto__` key stays a key.
  const out: Record<string, unknown> = { ...doc };
  const removed: MemberPointer[] = [];
  let proven = true;
  for (const pointer of owned) {
    const proof = proveMember(out, pointer, record);
    if (proof === "absent") continue;
    removed.push(pointer);
    if (proof !== "proven") proven = false;
    const segments = parseMemberPointer(pointer);
    if (segments.length === 1) {
      delete out[segments[0]];
      continue;
    }
    const parent: Record<string, unknown> = { ...(out[segments[0]] as Record<string, unknown>) };
    delete parent[segments[1]];
    Object.defineProperty(out, segments[0], { value: parent, enumerable: true, writable: true, configurable: true });
  }
  return { doc: out, removed, proven };
}

// ── Style ─────────────────────────────────────────────────────────────────

/** How a JSON document is laid out, as far as `JSON.stringify` can reproduce it. */
export interface JsonStyle {
  /** One level of indentation; `""` for a document on one line. */
  indent: string;
  eol: "\n" | "\r\n";
  finalNewline: boolean;
  /** Present when the document opens with a byte-order mark, which is written back. */
  bom?: true;
}

/** The engine's own document style (`./mcpFilter.ts::jsonDocument`). */
export const ENGINE_JSON_STYLE: JsonStyle = { indent: "  ", eol: "\n", finalNewline: true };

/** U+FEFF, the byte-order mark an editor may open a UTF-8 file with. */
const BYTE_ORDER_MARK = 0xfeff;

/** The first indented line's leading whitespace, when a non-blank character follows it. */
const INDENTED_LINE = /^([ \t]+)\S/;

/**
 * The style `raw` is written in. A leading byte-order mark is kept as `bom`
 * and read past for the rest. `eol` is CRLF when the text holds one;
 * `finalNewline` when it ends in a line break; `indent` is `""` when the
 * outermost value holds no line break, else the
 * leading whitespace of the first indented, non-blank line after the first,
 * else the engine's two spaces.
 *
 * The plan's wording took only a line whose first character after the
 * whitespace is `"`, `}` or `]`. Any non-blank character is taken here: on a
 * top-level object the two agree (its first indented line is a key), and on a
 * top-level array of objects or numbers the narrower rule would skip the
 * depth-1 line and read a deeper one.
 */
export function jsonStyleOf(raw: string): JsonStyle {
  const hasBom = raw.charCodeAt(0) === BYTE_ORDER_MARK;
  const text = hasBom ? raw.slice(1) : raw;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const finalNewline = text.endsWith("\n");
  const bom = hasBom ? { bom: true as const } : {};
  const lines = text.trim().split("\n");
  if (lines.length === 1) return { indent: "", eol, finalNewline, ...bom };
  for (const line of lines.slice(1)) {
    const match = INDENTED_LINE.exec(line);
    if (match !== null) return { indent: match[1] as string, eol, finalNewline, ...bom };
  }
  return { indent: ENGINE_JSON_STYLE.indent, eol, finalNewline, ...bom };
}

/** A run of tabs opening a line of `JSON.stringify(…, "\t")`'s output. */
const LEADING_TABS = /^\t+/gm;

/**
 * `value` written in `style`. Indented through a tab and then re-indented, so
 * an indent past `JSON.stringify`'s ten-character cap still lands whole; JSON
 * escapes every tab and newline inside a string, so both substitutions touch
 * structure only. A `RangeError` past the stack propagates for the planner to
 * classify.
 */
export function serialiseJson(value: unknown, style: JsonStyle): string {
  let text: string;
  if (style.indent === "") {
    text = JSON.stringify(value);
  } else {
    text = JSON.stringify(value, null, "\t");
    if (style.indent !== "\t") text = text.replace(LEADING_TABS, (tabs) => style.indent.repeat(tabs.length));
  }
  if (style.eol !== "\n") text = text.replaceAll("\n", style.eol);
  if (style.finalNewline) text = `${text}${style.eol}`;
  return style.bom === true ? `${String.fromCharCode(BYTE_ORDER_MARK)}${text}` : text;
}
