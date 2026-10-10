import { LEDGER_FILE } from "./layout.ts";

/**
 * The deferral inbox's one reader: the row grammar `/st-board`'s
 * `## Deferral inbox` section declares, and the query that picks the rows a
 * change's paths touch.
 *
 * A row is `severity · file:line · description · source: <writer>`, with an
 * optional `Ref: <path>` or `Ref: <path>#<anchor>` straight after `source:` and
 * an optional trailing tag word (`critical-deferred` on a deferred Critical,
 * `decision-waiting` on a row a person must answer). Non-bullet lines —
 * headings, prose, blanks — are not rows and are ignored: the grammar governs
 * what a reader can parse, not what a writer may say around it.
 *
 * Two callers read one grammar: `stamity ledger inbox`, which prints the rows a
 * run's Frame folds in, and the records gate (`test/records/ledgers.test.ts`),
 * which holds the committed inbox to it.
 *
 * Pure: text in, verdict out. Nothing here opens a path, and nothing here
 * screens or sanitises: the inbox is user-tier state any writer can author, so
 * the command that prints a row screens and sanitises it where it meets the
 * terminal. Erasable syntax only, since `scripts/generate-docs.mjs` loads the
 * CLI, and with it this module, by Node's type stripping.
 */

/** The inbox's path, relative to the repository root, POSIX-spelled. */
export const INBOX_PATH = ".stamity/inbox.md";

/** The severities a row may carry; `Info` is the legacy fourth, admitted as the ledger admits it. */
export const INBOX_SEVERITIES = ["Critical", "Warning", "Minor", "Info"] as const;

/** The tag words whose rows every query shows: a deferred Critical and a row waiting on a decision. */
export const ALWAYS_SHOW_TAGS = ["critical-deferred", "decision-waiting"] as const;

export interface InboxRow {
  /** The row's 1-based line in the inbox. */
  readonly line: number;
  readonly severity: string;
  readonly location: string;
  readonly description: string;
  /** The writer named after `source: `. */
  readonly source: string;
  readonly ref: string | null;
  readonly tag: string | null;
}

export interface InboxProblem {
  /** The bullet's 1-based line in the inbox. */
  readonly line: number;
  /** Why the bullet does not parse, without a path or line prefix. */
  readonly message: string;
}

/** How a row came to match a query; `all` when the query names no filter at all. */
export type MatchedBy = "path" | "ref" | "plan" | "area" | "always" | "all";

export interface InboxQuery {
  readonly paths: readonly string[];
  readonly plan?: string;
  readonly area?: readonly string[];
}

export interface InboxMatch {
  readonly row: InboxRow;
  readonly matchedBy: MatchedBy;
}

const SEVERITY_SET: ReadonlySet<string> = new Set(INBOX_SEVERITIES);
const ALWAYS_SET: ReadonlySet<string> = new Set(ALWAYS_SHOW_TAGS);

/**
 * A `Ref:` value, in the two forms the grammar declares: a bare `<path>`, or
 * `<path>#<anchor>` naming one line inside it. The anchor is mandatory for a
 * ledger, which is addressable only by row id.
 */
const REF_PATH = /^[^\s#]+$/;
const REF_ANCHORED = /^[^\s#]+#\S+$/;

/** The grammar problem with a `Ref:` value, or null where it parses. */
function refProblem(ref: string): string | null {
  if (REF_PATH.test(ref)) {
    return ref.endsWith(LEDGER_FILE)
      ? `\`Ref: ${ref}\` names a ledger, which is addressable only as \`<path>#<row id>\``
      : null;
  }
  if (REF_ANCHORED.test(ref)) return null;
  return `\`Ref: ${ref}\` is neither \`<path>\` nor \`<path>#<anchor>\``;
}

/** One bullet's text after its `- `, parsed into a row, or the one problem that refuses it. */
function parseBullet(line: number, bullet: string): InboxRow | InboxProblem {
  const fail = (message: string): InboxProblem => ({ line, message });
  const fields = bullet.split(" · ");

  const sourceIndex = fields.findIndex((field) => field.startsWith("source: "));
  if (sourceIndex === -1) return fail("no `source: <writer>` field");
  if (sourceIndex < 3) return fail("`source:` arrives before severity, location and description are all present");
  const severity = fields[0] ?? "";
  if (!SEVERITY_SET.has(severity)) return fail(`severity \`${severity}\` is outside ${INBOX_SEVERITIES.join(", ")}`);
  const location = fields[1] ?? "";
  if (location.trim() === "") return fail("the location field is a `file:line` or `—`, never empty");
  const description = fields.slice(2, sourceIndex).join(" · ");
  if (description.trim() === "") return fail("the description field is empty");
  const writer = (fields[sourceIndex] ?? "").slice("source: ".length).trim();
  if (writer === "") return fail("`source:` names no writer");

  const rest = fields.slice(sourceIndex + 1);
  let ref: string | null = null;
  if (rest[0]?.startsWith("Ref: ") === true) {
    ref = rest[0].slice("Ref: ".length).trim();
    const problem = refProblem(ref);
    if (problem !== null) return fail(problem);
    rest.shift();
  }
  const tag = rest.length > 0 ? (rest[0] ?? "") : null;
  if (rest.length > 1 || (tag !== null && (tag.trim() === "" || /\s/.test(tag.trim())))) {
    return fail(`trailing field(s) beyond one optional tag word — ${rest.join(" · ")}`);
  }
  return { line, severity, location, description, source: writer, ref, tag: tag?.trim() ?? null };
}

/**
 * Every bullet of the inbox, parsed: a `- ` line either becomes a row or names
 * one problem, never both. Every problem is collected rather than the first, so
 * one pass fixes them all.
 */
export function parseInbox(text: string): { rows: InboxRow[]; problems: InboxProblem[] } {
  const rows: InboxRow[] = [];
  const problems: InboxProblem[] = [];
  text.split("\n").forEach((raw, index) => {
    if (!raw.startsWith("- ")) return;
    const parsed = parseBullet(index + 1, raw.slice(2));
    if ("message" in parsed) problems.push(parsed);
    else rows.push(parsed);
  });
  return { rows, problems };
}

/**
 * The paths a location names: split on `,`; each entry trimmed, its backticks
 * stripped, cut at the first space and then at the first `:`; kept when it
 * holds a `/` or a `.`. So `nightly.yml:219-221,241-246,280` names
 * `nightly.yml`, `src/cli/commands/gate.ts GitReadError` names the file, and
 * `—` or a prose location names none.
 */
export function locationPaths(location: string): string[] {
  const paths: string[] = [];
  for (const entry of location.split(",")) {
    let path = entry.replaceAll("`", "").trim();
    const space = path.indexOf(" ");
    if (space !== -1) path = path.slice(0, space);
    const colon = path.indexOf(":");
    if (colon !== -1) path = path.slice(0, colon);
    if (path.includes("/") || path.includes(".")) paths.push(path);
  }
  return paths;
}

/** POSIX spelling: `\` to `/`, a leading `./` and a trailing `/` dropped. */
function normalizePath(path: string): string {
  let posix = path.replaceAll("\\", "/");
  while (posix.startsWith("./")) posix = posix.slice(2);
  while (posix.endsWith("/")) posix = posix.slice(0, -1);
  return posix;
}

/**
 * Whether a location entry names a query path: the same path, a folder holding
 * it (the entry names a folder), a path inside it (the query names a folder),
 * or, for an entry with no `/`, the query path's basename.
 */
function entryMatches(entry: string, query: string): boolean {
  return (
    entry === query ||
    query.startsWith(`${entry}/`) ||
    entry.startsWith(`${query}/`) ||
    (!entry.includes("/") && query.endsWith(`/${entry}`))
  );
}

/** The whole words of a text, case-folded: runs of letters, digits, `_` and `-`. */
function foldedWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^\p{L}\p{N}_-]+/u)
      .filter((word) => word !== ""),
  );
}

/** The `Ref:` value's path, the part before any `#`, normalised. */
function refPath(ref: string): string {
  const hash = ref.indexOf("#");
  return normalizePath(hash === -1 ? ref : ref.slice(0, hash));
}

/** How one row matches a query that names at least one filter, or null. */
function matchRow(
  row: InboxRow,
  paths: readonly string[],
  plan: string | null,
  area: readonly string[],
): MatchedBy | null {
  const entries = locationPaths(row.location)
    .map(normalizePath)
    .filter((entry) => entry !== "");
  const ref = row.ref === null ? null : refPath(row.ref);
  if (entries.some((entry) => paths.some((path) => entryMatches(entry, path)))) return "path";
  if (ref !== null && paths.includes(ref)) return "ref";
  if (plan !== null && (ref === plan || entries.includes(plan))) return "plan";
  if (entries.length === 0 && area.length > 0) {
    const words = foldedWords(`${row.location} ${row.description}`);
    if (area.some((word) => words.has(word))) return "area";
  }
  if (row.tag !== null && ALWAYS_SET.has(row.tag)) return "always";
  return null;
}

/**
 * The rows a query matches, in inbox order, each with how it matched, and the
 * count of those it does not. A query naming no path, plan or area word
 * matches every row as `all`. `area` words reach only a row whose location
 * names no path, so a row pinned to a file is found by its file. A row tagged
 * with an {@link ALWAYS_SHOW_TAGS} word matches every query.
 */
export function matchInbox(
  rows: readonly InboxRow[],
  query: InboxQuery,
): { matched: InboxMatch[]; unmatched: number } {
  const paths = query.paths.map(normalizePath).filter((path) => path !== "");
  const planPath = normalizePath(query.plan ?? "");
  const plan = planPath === "" ? null : planPath;
  const area = (query.area ?? []).map((word) => word.trim().toLowerCase()).filter((word) => word !== "");
  const unfiltered = paths.length === 0 && plan === null && area.length === 0;

  const matched: InboxMatch[] = [];
  for (const row of rows) {
    const matchedBy = unfiltered ? "all" : matchRow(row, paths, plan, area);
    if (matchedBy !== null) matched.push({ row, matchedBy });
  }
  return { matched, unmatched: rows.length - matched.length };
}
