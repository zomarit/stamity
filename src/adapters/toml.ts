/**
 * A deterministic TOML writer for the narrow document shapes the codex adapter
 * emits — deliberately NOT a general TOML library.
 *
 * Two files need TOML: the per-agent subagent definitions under
 * `.codex/agents/` and the composed `.codex/config.toml`. Between them they use
 * comments, `[table]` headers, and string / number / boolean values — nothing
 * else. Writing that subset here costs a few dozen lines and no dependency,
 * and it keeps the emitted bytes a pure function of the input, which is what
 * lets a drift check compare a regenerated document against the one on disk.
 *
 * ## Scope, stated so a caller does not discover it by writing a wrong file
 *
 * Serialized: leading comment lines, one top-level key/value block, `[table]`
 * headers (dotted headers with per-segment quoting), basic strings, multi-line
 * basic strings (chosen automatically for any value containing a newline),
 * finite numbers, booleans. Keys emit in insertion order.
 *
 * NOT serialized: arrays, inline tables, array-of-tables, dates, literal
 * strings, dotted KEYS (a key containing `.` is quoted as one key, never split
 * into a path). A document needing those shapes is rendered by whoever owns it
 * and spliced in as text — the MCP tables in `.codex/config.toml` arrive that
 * way from `src/mcp/emit.ts`.
 *
 * ## Structural defects are refused, not emitted
 *
 * TOML's grammar makes several structural mistakes silently change meaning: a
 * top-level key written after a table header joins THAT table, a repeated key
 * or table is a redefinition, and a non-finite number is not a TOML value at
 * all. Each is refused with a `VALIDATION_ERROR` naming the key or header,
 * because the alternative is a config file that parses into something the
 * caller did not describe.
 */

import { EngineError } from "../types/errors.ts";

/** The value kinds this writer renders. */
export type TomlValue = string | number | boolean;

/**
 * One block of key/value pairs, optionally opened by a `[header]` line. Reached
 * through {@link TomlDocument} — callers pass object literals rather than
 * naming this shape, so it stays module-internal.
 */
interface TomlTable {
  /**
   * Table header without brackets (`mcp_servers.context7`), or `null` for the
   * document's top-level block — which, per TOML's grammar, must come first.
   */
  readonly header: string | null;
  /** Key/value pairs, emitted in this order. */
  readonly entries: readonly (readonly [string, TomlValue])[];
}

/** A whole document: an optional comment preamble, then tables in order. */
export interface TomlDocument {
  /** Comment lines emitted above everything else, each `# `-prefixed. */
  readonly comments?: readonly string[];
  readonly tables: readonly TomlTable[];
}

/** Keys and header segments that need no quoting. */
const BARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Escapes TOML names for the control characters that have a short form. */
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  "\b": "\\b",
  "\t": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
};

/**
 * Render `doc` as TOML text.
 *
 * Output is one comment block (when comments are given) followed by the
 * tables, separated by single blank lines, ending in exactly one newline. A
 * table with no header and no entries contributes nothing; a header with no
 * entries still emits its `[header]` line, which is TOML's spelling of an
 * empty table. An entirely empty document renders the empty string rather than
 * a lone newline — there is no content, so there is no line.
 *
 * @throws EngineError `VALIDATION_ERROR` for a top-level block after a table,
 * a blank header, a repeated header or key, or a non-finite number.
 */
export function serializeTomlDocument(doc: TomlDocument): string {
  const blocks: string[] = [];

  const comments = doc.comments ?? [];
  if (comments.length > 0) blocks.push(renderComments(comments));

  const seenHeaders = new Set<string>();
  let sawHeader = false;

  for (const table of doc.tables) {
    const lines: string[] = [];

    if (table.header === null) {
      if (sawHeader) {
        throw new EngineError(
          `A top-level TOML block follows the table [${[...seenHeaders].join("], [")}]. ` +
            `TOML binds bare keys to the most recent table, so top-level keys must be ` +
            `emitted before the first header — move the null-header table to the front.`,
          { code: "VALIDATION_ERROR" },
        );
      }
    } else {
      const header = renderHeader(table.header);
      if (seenHeaders.has(header)) {
        throw new EngineError(
          `TOML table [${header}] is defined twice in one document. A repeated header is a ` +
            `redefinition, not a merge — emit one table with every key.`,
          { code: "VALIDATION_ERROR" },
        );
      }
      seenHeaders.add(header);
      sawHeader = true;
      lines.push(`[${header}]`);
    }

    const seenKeys = new Set<string>();
    for (const [key, value] of table.entries) {
      if (seenKeys.has(key)) {
        throw new EngineError(
          `TOML key "${key}" is emitted twice in ${
            table.header === null ? "the top-level block" : `[${renderHeader(table.header)}]`
          }. A repeated key is a redefinition — emit one entry per key.`,
          { code: "VALIDATION_ERROR" },
        );
      }
      seenKeys.add(key);
      lines.push(`${renderKey(key)} = ${renderValue(key, value)}`);
    }

    if (lines.length > 0) blocks.push(lines.join("\n"));
  }

  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

/** `# `-prefixed comment lines; an embedded newline becomes another comment line. */
function renderComments(comments: readonly string[]): string {
  return comments
    .flatMap((comment) => comment.split("\n"))
    .map((line) => (line === "" ? "#" : `# ${line}`))
    .join("\n");
}

/**
 * A header rendered segment by segment, so `mcp_servers.context7` stays a
 * table path while a segment needing quotes gets them. A blank header is
 * refused: `[]` is not a table.
 */
function renderHeader(header: string): string {
  if (header.trim() === "") {
    throw new EngineError(
      `A TOML table header is empty. Name the table, or pass header: null for the ` +
        `document's top-level key block.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return header
    .split(".")
    .map((segment) => renderKey(segment))
    .join(".");
}

/** A bare key where the grammar allows one, a quoted basic string otherwise. */
function renderKey(key: string): string {
  return BARE_TOKEN_PATTERN.test(key) ? key : tomlBasicString(key);
}

function renderValue(key: string, value: TomlValue): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new EngineError(
        `TOML key "${key}" carries the non-finite number ${String(value)}. Emit a finite ` +
          `number, or omit the key — a placeholder value in a config file reads as a real one.`,
        { code: "VALIDATION_ERROR" },
      );
    }
    // `String` renders integers without a decimal point and floats in TOML's
    // own float grammar (`1.5`, `1e+21`), so no numeric formatting is invented.
    return String(value);
  }
  return value.includes("\n") ? tomlMultilineBasicString(value) : tomlBasicString(value);
}

/**
 * A single-line basic string: `"` and `\` escape, control characters take
 * their short form or a `\uXXXX` escape, and everything else passes through as
 * written (TOML is UTF-8, so no non-ASCII escaping is needed).
 */
export function tomlBasicString(value: string): string {
  let out = "";
  for (const char of value) {
    if (char === '"') out += '\\"';
    else out += escapeCommon(char) ?? char;
  }
  return `"${out}"`;
}

/**
 * A multi-line basic string, for values whose newlines should survive as
 * newlines rather than as `\n` escapes — an agent body, mainly, where the
 * emitted file is meant to be read by a human as well as parsed.
 *
 * Newlines and tabs stay literal; every other control character, and every
 * backslash, escapes exactly as in a single-line string. Quotes need one extra
 * rule: a run of three closes the string, and a run touching the end of the
 * value fuses with the closing delimiter, so those runs escape every quote in
 * them while an ordinary `"` or `""` stays literal.
 *
 * The opening delimiter is followed by a newline, which TOML trims — so the
 * value round-trips exactly even when it starts with a newline of its own.
 */
export function tomlMultilineBasicString(value: string): string {
  let out = "";
  let quoteRun = 0;

  const flushQuotes = (atEnd: boolean): void => {
    if (quoteRun === 0) return;
    out += (quoteRun >= 3 || atEnd ? '\\"' : '"').repeat(quoteRun);
    quoteRun = 0;
  };

  for (const char of value) {
    if (char === '"') {
      quoteRun += 1;
      continue;
    }
    flushQuotes(false);
    if (char === "\n" || char === "\t") out += char;
    else out += escapeCommon(char) ?? char;
  }
  flushQuotes(true);

  return `"""\n${out}"""`;
}

/**
 * The escape shared by both string forms — backslash, short-form control
 * characters, and the remaining C0 controls plus DEL as `\uXXXX` — or null
 * when the character needs none.
 */
function escapeCommon(char: string): string | null {
  if (char === "\\") return "\\\\";
  const short = SHORT_ESCAPES[char];
  if (short !== undefined) return short;
  const code = char.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f) {
    return `\\u${code.toString(16).padStart(4, "0")}`;
  }
  return null;
}
