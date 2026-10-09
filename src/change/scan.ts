import { scanValueForSecrets } from "../mcp/secretScan.ts";

/**
 * The secret scan of a change's added lines (REQ-FLOW-066), the scanner the
 * hidden `gate scan` verb runs over the change read in
 * `../cli/commands/gate.ts`.
 *
 * **It reuses the shipped patterns** (S8): every value goes through
 * `scanValueForSecrets` in `../mcp/secretScan.ts`, unchanged. Those patterns
 * were written for environment values, a name and its value, so each added
 * line is first taken apart into name and value pairs (plan/30): an
 * assignment, a key and its value, or a flag and its argument, the value's
 * string-literal content unwrapped. That gives the credential-name context
 * (`API_TOKEN = "…"`) to the context-gated pattern, and lets the anchored
 * patterns (a bearer token, the DevOps token) meet a bare value. Every string
 * literal on the line is scanned as a value too, and so is what remains of the
 * line once each pair's name and separator are cut out. A line with no pair is
 * that remainder whole, `scanValueForSecrets("", line)`. Cutting the names out
 * is what keeps typed code such as a field named for a password with its type
 * from reading as an inline assignment.
 *
 * **One exclusion, added for added lines** (sign-off on the p5e measurement):
 * a value that is exactly one subresource-integrity hash (`sha256-`,
 * `sha384-` or `sha512-` and the base64 of that digest's exact length) is a
 * content digest a lockfile records for every package, not a credential, and
 * is not passed to the patterns. Unexcluded, its padding satisfies the
 * padded-base64 context and every lockfile bump would stop. Any other value on
 * the same line is still scanned.
 *
 * **A hit names its path, line and rule, never the value**, masked or not: the
 * finding's masked value is dropped here. The scan has no allow-list and no
 * waiver (sign-off on plan/57).
 */

/** One added line: its new-side number and its text. */
export interface AddedLine {
  line: number;
  text: string;
}

/** One hit: where, and which shipped pattern. Never the value. */
export interface ScanHit {
  path: string;
  line: number;
  rule: string;
}

/**
 * Above this length a line is scanned whole, as a line with no pair: the pair
 * and literal matchers try each word start and can walk to the line's end, so
 * a long minified line would cost the square of its length.
 */
const PAIR_LINE_BOUND = 4_096;

/** A quoted value (double, single or back quote, escapes kept) or a bare run up to a separator or bracket. */
const VALUE = String.raw`("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|` + "`(?:[^`\\\\]|\\\\.)*`" + String.raw`|[^\s,;(){}\[\]]+)`;

/**
 * A name at a word start, optionally quoted or optional (`?`), then `:=`, `=`
 * (not `==`, `=>`, `=~`) or `:` (not `::`, and not the `://` of a URL, so a
 * connection string stays whole), then the value.
 */
const PAIR = new RegExp(String.raw`(?<![\w$.-])["']?([A-Za-z_$][\w$.-]*)["']?\??\s*(?::=|=(?![=>~])|:(?!:|\/\/))\s*` + VALUE, "g");

/** A flag after whitespace or at the line's start, then `=` or whitespace, then its argument. */
const FLAG = new RegExp(String.raw`(?<!\S)--?([A-Za-z][\w-]*)(?:=|\s+)` + VALUE, "g");

/** A string literal's content, in double, single or back quotes. */
const LITERAL = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** Exactly one subresource-integrity hash: the digest's base64 at its exact length, padding included. */
const INTEGRITY_HASH = /^(?:sha256-[A-Za-z0-9+/]{43}=|sha384-[A-Za-z0-9+/]{64}|sha512-[A-Za-z0-9+/]{86}==)$/;

function unquote(value: string): string {
  return /^["'`]/.test(value) ? value.slice(1, -1) : value;
}

/** `text` with each `[start, end)` range cut out, a space left in its place. */
function cut(text: string, ranges: readonly (readonly [number, number])[]): string {
  let out = "";
  let at = 0;
  for (const [start, end] of ranges.toSorted((a, b) => a[0] - b[0])) {
    if (end <= at) continue;
    out += `${text.slice(at, Math.max(at, start))} `;
    at = end;
  }
  return out + text.slice(at);
}

/** The shipped patterns' ids one added line hits, each once, in the order found. */
function rulesOf(text: string): string[] {
  const rules = new Set<string>();
  const scan = (name: string, value: string): void => {
    if (INTEGRITY_HASH.test(value.trim())) return;
    for (const finding of scanValueForSecrets(name, value)) rules.add(finding.patternId);
  };
  if (text.length > PAIR_LINE_BOUND) {
    scan("", text);
    return [...rules];
  }
  const names: [number, number][] = [];
  for (const pattern of [PAIR, FLAG]) {
    for (const match of text.matchAll(pattern)) {
      const value = match[2] ?? "";
      names.push([match.index, match.index + match[0].length - value.length]);
      scan(match[1] ?? "", unquote(value));
    }
  }
  for (const match of text.matchAll(LITERAL)) scan("", match[1] ?? match[2] ?? match[3] ?? "");
  scan("", cut(text, names).trim());
  return [...rules];
}

/**
 * Every hit in the added lines of `files`, one per rule and line, in the
 * order given. A file may appear once per hunk.
 */
export function scanAddedLines(files: readonly { path: string; added: readonly AddedLine[] }[]): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const { path, added } of files) {
    for (const { line, text } of added) {
      for (const rule of rulesOf(text)) hits.push({ path, line, rule });
    }
  }
  return hits;
}
