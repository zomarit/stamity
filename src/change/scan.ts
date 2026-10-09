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
 * **The name beside its value** (review/95). For a pair whose value is a
 * quoted literal, or any pair in a config file (`.env`, YAML, JSON, TOML, INI,
 * properties), the joined `name=value` text goes to the patterns too, so the
 * two inline-assignment patterns meet a short credential assigned to a
 * credential-named key. A value with no literal in it (empty, `null`, `~`, or
 * a `${…}` placeholder, the default recorded for build/47) is not joined.
 * Typed code keeps its unquoted value and stays clean. Each extracted name is
 * also scanned bare (review/101): a token taken as a name, as in the user part
 * of an unquoted URL, is still read as a value. A string literal that reads as
 * a header (`Name: value`) is also split at its separator (review/97), so the
 * anchored bearer pattern meets the header's value.
 *
 * **A comparison is not an assignment** (review/100): the two inline-assignment
 * patterns read every text with its `==`, `===`, `!=` and `!==` masked, so
 * `password === confirm` never reads as one. Every other pattern reads the text
 * as written.
 *
 * **One exclusion, added for added lines** (sign-off on the p5e measurement):
 * a value that is exactly one subresource-integrity hash (`sha256-`,
 * `sha384-` or `sha512-` and the base64 of that digest's exact length) is a
 * content digest a lockfile records for every package, not a credential, and
 * is not passed to the patterns. Unexcluded, its padding satisfies the
 * padded-base64 context and every lockfile bump would stop. Any other value on
 * the same line is still scanned. Two lockfile line shapes carry a digest in
 * their own form (review/99): yarn v1's `integrity <hash>` line in a
 * `yarn.lock`, and a `go.sum` line whose last field is exactly `h1:` and the
 * base64 of a SHA-256; that digest is cut from the line before it is read.
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
  /** The commit a line came from, when it was read from history since the base and is no longer added (review/112). */
  commit?: string;
}

/** One file's added lines, and the commit they were read from when they come from history. */
export interface ScanFile {
  path: string;
  commit?: string;
  added: readonly AddedLine[];
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

/** The two patterns that read an assignment inside the value (`secretScan.ts`), and so never read a comparison. */
const INLINE_ASSIGNMENT_RULES: ReadonlySet<string> = new Set(["inline-api-key-assignment", "inline-password-assignment"]);

/** `==`, `===`, `!=`, `!==` with the space around them (review/100). */
const COMPARISON = /\s*[!=]==?\s*/g;

/** A config file by its name: its pairs are read with the name beside the value, quoted or not (review/95). */
const CONFIG_FILE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|[^/]*\.(?:env|ya?ml|json|toml|ini|properties))$/i;

/** A value with no literal in it: empty, a null, or wholly a `${…}` placeholder (build/47's recorded default). */
const NO_LITERAL = /^(?:|null|~|\$\{\{?[^{}]*\}\}?)$/i;

/** A string literal's content that reads as a header: a name, `:` (not `::` or `://`), and a value (review/97). */
const HEADER = /^\s*([A-Za-z][\w-]*)\s*:(?!:|\/\/)\s*(\S.*)$/s;

/** yarn v1's `integrity <hash>` line, and a go.sum line's `h1:` SHA-256 digest (review/99). */
const YARN_INTEGRITY = /^(\s*integrity\s+)(\S+)\s*$/;
const GO_SUM_DIGEST = /^(\S+ \S+ )h1:[A-Za-z0-9+/]{43}=$/;

/** The line with a lockfile's own digest form cut out, or the line as it is. */
function withoutDigest(path: string, text: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  if (file === "yarn.lock") {
    const yarn = YARN_INTEGRITY.exec(text);
    if (yarn !== null && INTEGRITY_HASH.test(yarn[2] ?? "")) return yarn[1] ?? "";
  }
  if (file === "go.sum" || file === "go.work.sum") return GO_SUM_DIGEST.exec(text)?.[1] ?? text;
  return text;
}

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

/** The shipped patterns' ids one added line of `path` hits, each once, in the order found. */
function rulesOf(path: string, line: string): string[] {
  const rules = new Set<string>();
  const scan = (name: string, value: string): void => {
    if (INTEGRITY_HASH.test(value.trim())) return;
    const masked = value.replace(COMPARISON, " ~ ");
    for (const { patternId } of scanValueForSecrets(name, value)) {
      if (masked === value || !INLINE_ASSIGNMENT_RULES.has(patternId)) rules.add(patternId);
    }
    if (masked === value) return;
    for (const { patternId } of scanValueForSecrets(name, masked)) if (INLINE_ASSIGNMENT_RULES.has(patternId)) rules.add(patternId);
  };
  const text = withoutDigest(path, line);
  if (text.length > PAIR_LINE_BOUND) {
    scan("", text);
    return [...rules];
  }
  const joinAll = CONFIG_FILE.test(path);
  const names: [number, number][] = [];
  for (const pattern of [PAIR, FLAG]) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1] ?? "";
      const raw = match[2] ?? "";
      const valueAt = match.index + match[0].length - raw.length;
      const value = unquote(raw);
      names.push([match.index, valueAt]);
      scan(name, value);
      scan("", name);
      // A bare value stops at a brace, so `${…}` reads as `$`: the text after it says it is a placeholder.
      const placeholder = raw === "$" && text[valueAt + 1] === "{";
      // A back quote before the name and one opening the value close a Markdown code span: what follows is prose.
      const spanClose = raw.startsWith("`") && text[match.index - 1] === "`";
      const literal = !placeholder && !spanClose && !NO_LITERAL.test(value.trim()) && !INTEGRITY_HASH.test(value.trim());
      if (literal && (joinAll || /^["'`]/.test(raw))) scan("", `${name}=${value}`);
    }
  }
  for (const match of text.matchAll(LITERAL)) {
    const content = match[1] ?? match[2] ?? match[3] ?? "";
    scan("", content);
    const header = HEADER.exec(content);
    if (header !== null) scan(header[1] ?? "", header[2] ?? "");
  }
  scan("", cut(text, names).trim());
  return [...rules];
}

/**
 * Every hit in the added lines of `files`, one per rule and line, in the
 * order given. A file may appear once per hunk, and once per commit.
 */
export function scanAddedLines(files: readonly ScanFile[]): ScanHit[] {
  const hits: ScanHit[] = [];
  for (const { path, commit, added } of files) {
    for (const { line, text } of added) {
      for (const rule of rulesOf(path, text)) hits.push({ path, line, rule, ...(commit === undefined ? {} : { commit }) });
    }
  }
  return hits;
}
