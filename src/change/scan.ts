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
 * quoted literal, or any pair in a config file (`.env`, `.envrc`, YAML, JSON,
 * TOML, INI, properties, `.cnf`, `.conf`), a shell script's `export` line or a
 * Dockerfile's `ENV` or `ARG` line (review/132), the joined `name=value` text
 * goes to the patterns too, so the two inline-assignment patterns meet a short
 * credential assigned to a credential-named key. A value with no literal in it
 * (empty, `null`, `~`, a `${…}` or a `{{ … }}` placeholder, the default
 * recorded for build/47 and review/136, or an expansion opening with `$`
 * outside single quotes, review/132) is not joined, and a `{{ … }}`
 * placeholder is cut from the rest of the line before it is read. A name that
 * is a file path (it follows a `/` or `\`, or ends in a file extension) gives
 * its value no credential context and is not joined (review/126): a digest
 * keyed by a file whose name holds a credential word is no credential.
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
 * NuGet's `packages.lock.json` records a base64 SHA-512 as the whole value of
 * a `contentHash` line (review/134), cut the same way.
 *
 * **A long line keeps its pairs** (review/135): past {@link PAIR_LINE_BOUND}
 * characters the pairs, literals and remainder are read in overlapping windows,
 * so a credential name or an anchor past that column still gives its value
 * context, and the whole line is read once more as a value. A line past
 * {@link SCAN_LINE_MAX_CHARS} is not read at all; {@link linesPastCap} names
 * it, so the caller fails closed rather than reporting it clean.
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
 * Above this length a line's pairs are read in windows of this many
 * characters, each overlapping the last by {@link PAIR_OVERLAP}, so a pair up
 * to that long is read whole wherever it sits: the pair and literal matchers
 * try each word start and can walk to the window's end, so reading a long
 * minified line at once would cost the square of its length (review/135).
 */
const PAIR_LINE_BOUND = 4_096;
const PAIR_OVERLAP = 1_024;
/** A line longer than this is not read, and is named by {@link linesPastCap} (review/135). */
export const SCAN_LINE_MAX_CHARS = 256 * 1024;

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

/** A config file by its name: its pairs are read with the name beside the value, quoted or not (review/95, review/132). */
const CONFIG_FILE = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.envrc|[^/]*\.(?:env|ya?ml|json|toml|ini|properties|cnf|conf))$/i;

/** A shell script and its `export` line, and a Dockerfile and its `ENV` or `ARG` line, read as a config file is (review/132). */
const SHELL_FILE = /\.(?:sh|bash|zsh)$/i;
const EXPORT_LINE = /^\s*export\s/;
const DOCKERFILE = /(?:^|\/)(?:(?:Docker|Container)file(?:\.[^/]*)?|[^/]*\.(?:docker|container)file)$/i;
const DOCKER_ASSIGNMENT_LINE = /^\s*(?:ENV|ARG)\s/i;

/** Whether every pair of this line is read with its name beside its value, quoted or not. */
function joinsEveryPair(path: string, line: string): boolean {
  return CONFIG_FILE.test(path) || (SHELL_FILE.test(path) && EXPORT_LINE.test(line)) || (DOCKERFILE.test(path) && DOCKER_ASSIGNMENT_LINE.test(line));
}

/**
 * A value with no literal in it: empty, a null, or wholly a `${…}` or a
 * `{{ … }}` placeholder (build/47's recorded default, review/136).
 */
const NO_LITERAL = /^(?:|null|~|\$\{\{?[^{}]*\}\}?|\{\{[^{}]*\}\})$/i;

/** A `{{ … }}` template placeholder (Jinja, Ansible, Helm, Go templates, Mustache), cut from the rest of a line (review/136). */
const TEMPLATE_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

/**
 * A name that ends in a file extension (review/126): with one that follows a
 * `/` or `\`, it is a file path, which gives its value no credential context.
 */
const PATH_NAME_EXTENSION =
  /\.(?:md|mdx|markdown|txt|rst|adoc|json|jsonc|json5|ya?ml|toml|ini|cfg|conf|properties|xml|html?|css|scss|csv|tsv|snap|lock|sql|svg|png|jpe?g|gif|pdf|zip|t?gz|tar|wasm|[cm]?[jt]sx?|py|rb|go|rs|java|kts?|swift|php|sh|bash|zsh|ps1|vue|svelte|astro)$/i;

/** A string literal's content that reads as a header: a name, `:` (not `::` or `://`), and a value (review/97). */
const HEADER = /^\s*([A-Za-z][\w-]*)\s*:(?!:|\/\/)\s*(\S.*)$/s;

/** yarn v1's `integrity <hash>` line, and a go.sum line's `h1:` SHA-256 digest (review/99). */
const YARN_INTEGRITY = /^(\s*integrity\s+)(\S+)\s*$/;
const GO_SUM_DIGEST = /^(\S+ \S+ )h1:[A-Za-z0-9+/]{43}=$/;
/** NuGet's `"contentHash": "<base64 SHA-512>",` line (review/134). */
const NUGET_CONTENT_HASH = /^(\s*"contentHash"\s*:\s*")[A-Za-z0-9+/]{86}==("\s*,?\s*)$/;

/** The line with a lockfile's own digest form cut out, or the line as it is. */
function withoutDigest(path: string, text: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  if (file === "yarn.lock") {
    const yarn = YARN_INTEGRITY.exec(text);
    if (yarn !== null && INTEGRITY_HASH.test(yarn[2] ?? "")) return yarn[1] ?? "";
  }
  if (file === "go.sum" || file === "go.work.sum") return GO_SUM_DIGEST.exec(text)?.[1] ?? text;
  if (file === "packages.lock.json") {
    const nuget = NUGET_CONTENT_HASH.exec(text);
    if (nuget !== null) return `${nuget[1] ?? ""}${nuget[2] ?? ""}`;
  }
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
  const joinAll = joinsEveryPair(path, line);
  /** One text's pairs, string literals and remainder, each read as a value. */
  const readPairs = (text: string): void => {
    const names: [number, number][] = [];
    for (const pattern of [PAIR, FLAG]) {
      for (const match of text.matchAll(pattern)) {
        const name = match[1] ?? "";
        const raw = match[2] ?? "";
        const valueAt = match.index + match[0].length - raw.length;
        const value = unquote(raw);
        const nameAt = match.index + match[0].indexOf(name);
        // review/126: a file path names no credential, whatever words it holds.
        const pathName = text[nameAt - 1] === "/" || text[nameAt - 1] === "\\" || PATH_NAME_EXTENSION.test(name);
        names.push([match.index, valueAt]);
        scan(pathName ? "" : name, value);
        scan("", name);
        // A bare value stops at a brace, so `${…}` reads as `$`: the text after it says it is a placeholder.
        const placeholder = raw === "$" && text[valueAt + 1] === "{";
        // review/132: outside single quotes, a value opening with `$` is an expansion (`$1`, `$(…)`, `$NAME`).
        const expansion = value.startsWith("$") && !raw.startsWith("'");
        // A back quote before the name and one opening the value close a Markdown code span: what follows is prose.
        const spanClose = raw.startsWith("`") && text[match.index - 1] === "`";
        const literal =
          !pathName && !placeholder && !expansion && !spanClose && !NO_LITERAL.test(value.trim()) && !INTEGRITY_HASH.test(value.trim());
        if (literal && (joinAll || /^["'`]/.test(raw))) scan("", `${name}=${value}`);
      }
    }
    for (const match of text.matchAll(LITERAL)) {
      const content = match[1] ?? match[2] ?? match[3] ?? "";
      scan("", content);
      const header = HEADER.exec(content);
      if (header !== null) scan(header[1] ?? "", header[2] ?? "");
    }
    scan("", cut(text, names).replace(TEMPLATE_PLACEHOLDER, " ").trim());
  };
  if (line.length > SCAN_LINE_MAX_CHARS) return [];
  const text = withoutDigest(path, line);
  if (text.length <= PAIR_LINE_BOUND) {
    readPairs(text);
    return [...rules];
  }
  // review/135: the whole line as one value, then its pairs window by window.
  scan("", text);
  for (let start = 0; start + PAIR_OVERLAP < text.length; start += PAIR_LINE_BOUND - PAIR_OVERLAP) {
    readPairs(text.slice(start, start + PAIR_LINE_BOUND));
  }
  return [...rules];
}

/** Every added line of `files` past {@link SCAN_LINE_MAX_CHARS}, which the scan does not read (review/135). */
export function linesPastCap(files: readonly ScanFile[]): { path: string; line: number; commit?: string }[] {
  const past: { path: string; line: number; commit?: string }[] = [];
  for (const { path, commit, added } of files) {
    for (const { line, text } of added) {
      if (text.length > SCAN_LINE_MAX_CHARS) past.push(commit === undefined ? { path, line } : { path, line, commit });
    }
  }
  return past;
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
