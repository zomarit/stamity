/**
 * A TOML document cut into its tables, byte for byte (REQ-FLOW-037, S16) — the
 * reader `.codex/config.toml`'s per-table ownership stands on
 * (`./codexConfigToml.ts`).
 *
 * Deliberately NOT a TOML parser. Ownership is decided per table, so the one
 * question asked here is where each table begins, and the answer must keep
 * every byte: the segment texts concatenate to the input exactly, and nothing
 * is re-serialised. What it has to model to answer that is the set of
 * constructs that can hide a `[` at the start of a line from being a header:
 * basic and literal strings, single- and multi-line (with `\` escapes in the
 * basic ones), comments, and arrays and inline tables whose values span lines.
 * A construct it does not model is refused with the line it starts on
 * (`{ ok: false, line, reason }`) rather than guessed at, because a wrong cut
 * hands an owner's table to the engine (`src/adapters/toml.ts` refuses a
 * structural defect for the same reason).
 *
 * The cut. A line whose first non-blank character is `[`, at depth 0 and
 * outside any string, is a header: `[a.b]` or `[[a.b]]`, keys bare or quoted,
 * dots with optional spaces, an optional trailing comment. A table segment
 * starts at its leading block — the comment lines directly above its header,
 * with blank lines between them but not above the first — and runs to the line
 * before the next segment. The root segment is everything before the first
 * table segment, and is always the first segment, empty or not.
 */

import { tomlBasicString } from "../adapters/toml.ts";

/** One table of the document, or its root. */
export interface TomlSegment {
  /** The table's key path, quotes resolved; `null` for the root segment. */
  key: readonly string[] | null;
  /** True for an `[[array.of.tables]]` header. */
  arrayTable: boolean;
  /** The segment's exact bytes, leading block and line endings included. */
  text: string;
}

/** The segments in document order, or the first line the reader cannot model. */
export type TomlSegmentation = { ok: true; segments: TomlSegment[] } | { ok: false; line: number; reason: string };

/** Keys and header segments that need no quoting (`src/adapters/toml.ts`'s rule). */
const BARE_KEY = /^[A-Za-z0-9_-]+$/u;
const BARE_KEY_CHAR = /[A-Za-z0-9_-]/u;
/** TOML's whitespace: space and tab. */
const isSpace = (char: string | undefined): boolean => char === " " || char === "\t";
/** The byte-order mark, built from its code point so no raw one sits in this source. */
const BOM = String.fromCharCode(0xfeff);

type LineKind = "blank" | "comment" | "header" | "other";

interface Line {
  /** Offset of the line's first byte in the input. */
  start: number;
  kind: LineKind;
  key?: string[];
  arrayTable?: boolean;
}

/** The first line the reader cannot model, and why. */
interface Refusal {
  line: number;
  reason: string;
}

/** The single-character escapes of a basic string, decoded. */
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  '"': '"',
  "\\": "\\",
};

/**
 * Parse the header that opens at `content[from]` (a `[`): the key path and
 * whether it is an array-of-tables header, or why it does not parse.
 */
function parseHeader(content: string, from: number, lineNo: number): { key: string[]; arrayTable: boolean } | Refusal {
  let at = from + 1;
  const arrayTable = content[at] === "[";
  if (arrayTable) at += 1;
  const key: string[] = [];
  const refuse = (why: string): Refusal => ({ line: lineNo, reason: `the table header does not parse: ${why}` });
  for (;;) {
    while (isSpace(content[at])) at += 1;
    const char = content[at];
    if (char === '"') {
      let value = "";
      at += 1;
      for (;;) {
        const next = content[at];
        if (next === undefined) return refuse("a quoted key is not closed");
        if (next === '"') break;
        if (next === "\\") {
          const escape = content[at + 1];
          const short = escape === undefined ? undefined : SHORT_ESCAPES[escape];
          if (short !== undefined) {
            value += short;
            at += 2;
            continue;
          }
          const width = escape === "u" ? 4 : escape === "U" ? 8 : 0;
          const hex = content.slice(at + 2, at + 2 + width);
          const codePoint = Number.parseInt(hex, 16);
          if (width === 0 || !/^[0-9A-Fa-f]+$/u.test(hex) || hex.length !== width || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
            return refuse("a quoted key holds an escape TOML does not define");
          }
          value += String.fromCodePoint(codePoint);
          at += 2 + width;
          continue;
        }
        value += next;
        at += 1;
      }
      key.push(value);
      at += 1;
    } else if (char === "'") {
      const close = content.indexOf("'", at + 1);
      if (close === -1) return refuse("a quoted key is not closed");
      key.push(content.slice(at + 1, close));
      at = close + 1;
    } else {
      const begin = at;
      while (content[at] !== undefined && BARE_KEY_CHAR.test(content[at] as string)) at += 1;
      if (at === begin) return refuse("a key is empty or holds a character a bare key cannot");
      key.push(content.slice(begin, at));
    }
    while (isSpace(content[at])) at += 1;
    if (content[at] !== ".") break;
    at += 1;
  }
  if (content[at] !== "]" || (arrayTable && content[at + 1] !== "]")) {
    return refuse(arrayTable ? "it does not close with `]]`" : "it does not close with `]`");
  }
  at += arrayTable ? 2 : 1;
  while (isSpace(content[at])) at += 1;
  if (at < content.length && content[at] !== "#") return refuse("text follows the closing bracket");
  return { key, arrayTable };
}

/**
 * The line lexer: the state that carries from one line to the next (an open
 * multi-line string, open arrays and inline tables), and the kind of each line.
 */
class Lexer {
  /** Set on the first construct the lexer cannot model; nothing is read after it. */
  refused: Refusal | null = null;
  private mode: "none" | "basic" | "literal" = "none";
  private modeLine = 0;
  private readonly open: { char: "[" | "{"; line: number }[] = [];

  /** True while the next line starts inside a string or an open value. */
  get continuing(): boolean {
    return this.mode !== "none" || this.open.length > 0;
  }

  /** Classify one line (its terminator stripped) and advance the state over it. */
  line(content: string, lineNo: number, first: boolean): Pick<Line, "kind" | "key" | "arrayTable"> {
    if (this.continuing) {
      this.scan(content, 0, lineNo);
      return { kind: "other" };
    }
    let at = first && content.startsWith(BOM) ? BOM.length : 0;
    while (isSpace(content[at])) at += 1;
    if (at === content.length) return { kind: "blank" };
    if (content[at] === "#") return { kind: "comment" };
    if (content[at] === "[") {
      const header = parseHeader(content, at, lineNo);
      if ("reason" in header) {
        this.refused = header;
        return { kind: "other" };
      }
      return { kind: "header", ...header };
    }
    this.scan(content, at, lineNo);
    return { kind: "other" };
  }

  /** The refusal owed at the end of the input, when something is still open. */
  unclosed(): Refusal | null {
    if (this.mode !== "none") {
      return { line: this.modeLine, reason: `a multi-line ${this.mode} string opened on this line is not closed` };
    }
    const outer = this.open[0];
    if (outer !== undefined) {
      return { line: outer.line, reason: `${outer.char === "[" ? "an array" : "an inline table"} opened on this line is not closed` };
    }
    return null;
  }

  /** Record the refusal and return an offset that ends the scan of the line. */
  private refuse(line: number, reason: string, content: string): number {
    this.refused = { line, reason };
    return content.length;
  }

  private scan(content: string, from: number, lineNo: number): void {
    let at = from;
    while (at < content.length) {
      const char = content[at] as string;
      if (this.mode !== "none") {
        at = this.inMultiline(content, at, lineNo);
        continue;
      }
      if (char === "#") return;
      if (char === '"' || char === "'") {
        at = this.string(content, at, lineNo, char);
        continue;
      }
      if (char === "[" || char === "{") this.open.push({ char, line: lineNo });
      if (char === "]" || char === "}") {
        const top = this.open.pop();
        if (top === undefined || (top.char === "[") !== (char === "]")) {
          at = this.refuse(lineNo, `a \`${char}\` here closes nothing it could match`, content);
          continue;
        }
      }
      at += 1;
    }
  }

  /** Open the string at `content[at]`; returns the offset after it (or after its opener, for a multi-line one). */
  private string(content: string, at: number, lineNo: number, quote: '"' | "'"): number {
    if (content.startsWith(quote.repeat(3), at)) {
      this.mode = quote === '"' ? "basic" : "literal";
      this.modeLine = lineNo;
      return at + 3;
    }
    let next = at + 1;
    while (next < content.length && content[next] !== quote) next += quote === '"' && content[next] === "\\" ? 2 : 1;
    if (next >= content.length) {
      return this.refuse(lineNo, `a ${quote === '"' ? "basic" : "literal"} string opened on this line is not closed on it`, content);
    }
    return next + 1;
  }

  /** Advance inside a multi-line string; closes it on its delimiter. */
  private inMultiline(content: string, at: number, lineNo: number): number {
    const quote = this.mode === "basic" ? '"' : "'";
    const char = content[at];
    if (this.mode === "basic" && char === "\\") return at + 2;
    if (char !== quote) return at + 1;
    let run = 0;
    while (content[at + run] === quote) run += 1;
    if (run < 3) return at + run;
    if (run > 5) return this.refuse(lineNo, `a run of ${run} quotes closes a multi-line string, where TOML allows at most five`, content);
    this.mode = "none";
    return at + run;
  }
}

/** Cut `raw` into its root and table segments; their texts concatenate to `raw`. */
export function segmentTomlTables(raw: string): TomlSegmentation {
  const lines: Line[] = [];
  const lexer = new Lexer();
  let start = 0;
  let lineNo = 1;
  while (start < raw.length) {
    const newline = raw.indexOf("\n", start);
    const end = newline === -1 ? raw.length : newline;
    const content = raw.slice(start, end > start && raw[end - 1] === "\r" ? end - 1 : end);
    lines.push({ start, ...lexer.line(content, lineNo, start === 0) });
    if (lexer.refused !== null) return { ok: false, ...lexer.refused };
    start = newline === -1 ? raw.length : newline + 1;
    lineNo += 1;
  }
  const unclosed = lexer.unclosed();
  if (unclosed !== null) return { ok: false, ...unclosed };

  const segments: TomlSegment[] = [];
  let cursor = 0;
  let root: TomlSegment | null = { key: null, arrayTable: false, text: "" };
  let previous: TomlSegment = root;
  for (const [index, line] of lines.entries()) {
    if (line.kind !== "header") continue;
    let begin = index;
    while (begin > 0 && (lines[begin - 1]?.kind === "comment" || lines[begin - 1]?.kind === "blank")) begin -= 1;
    while (begin < index && lines[begin]?.kind === "blank") begin += 1;
    const offset = (lines[begin] as Line).start;
    previous.text = raw.slice(cursor, offset);
    if (root !== null) {
      segments.push(root);
      root = null;
    }
    previous = { key: line.key as string[], arrayTable: line.arrayTable === true, text: "" };
    segments.push(previous);
    cursor = offset;
  }
  previous.text = raw.slice(cursor);
  if (root !== null) segments.push(root);
  return { ok: true, segments };
}

/** A key path as a header names it, each segment quoted as `src/adapters/toml.ts` quotes one. */
export function tomlTableName(key: readonly string[]): string {
  return key.map((segment) => (BARE_KEY.test(segment) ? segment : tomlBasicString(segment))).join(".");
}

/**
 * The text a segment is compared by: CRLF folded to LF, trailing blank lines
 * and the final line break dropped, then one `\n` put back on a non-empty
 * result — so the blank lines that separate one table from the next, and a
 * missing final newline, are not edits.
 */
export function normaliseSegment(text: string): string {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  while (lines.length > 0 && /^[ \t]*$/u.test(lines.at(-1) as string)) lines.pop();
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}
