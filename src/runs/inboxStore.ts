import { isIsoDate, vagueTrigger } from "./disposition.ts";
import { LEDGER_FILE } from "./layout.ts";

/**
 * The deferral inbox's one reader: the row grammar `/st-board`'s
 * `## Deferral inbox` section declares, and the query that picks the rows a
 * change's paths touch or whose day has come.
 *
 * A row is `severity · file:line · description · source: <writer>`, with an
 * optional `Ref: <path>` or `Ref: <path>#<anchor>` straight after `source:`.
 * After those come the optional fields, in any order and each at most once,
 * read by their prefix: `by: <YYYY-MM-DD>` or `when: <trigger>` (when the row
 * comes back), `files: <path>, <path>` (the files it is about, for a location
 * that names none; each entry is one path, and one holding a space is
 * refused), one tag word (`critical-deferred` on a deferred Critical,
 * `decision-waiting` on a row a person must answer), one bare `<YYYY-MM-DD>`
 * (the day it was deferred), and `rationale: <text>`, which is last and takes
 * the rest of the line, separators included. Non-bullet lines — headings,
 * prose, blanks — are not rows and are ignored: the grammar governs what a
 * reader can parse, not what a writer may say around it.
 *
 * One heading is read: every row below the line {@link SCHEDULE_RULE_HEADING},
 * to the end of the file, is held to the schedule rule (REQ-FLOW-076) and
 * carries `by:` or `when:`. Rows above it are older and stay valid without. A
 * trigger is held to one rule wherever its row stands: the one
 * `./disposition.ts` holds a `retired` value's trigger to, so this module
 * keeps no word list of its own.
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

/** The line every row below which is held to the schedule rule; matched as a whole line. */
export const SCHEDULE_RULE_HEADING = "## Rows under the schedule rule";

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
  /** The day the row comes back on, `YYYY-MM-DD`, from `by: `. */
  readonly by: string | null;
  /** The event the row comes back on, from `when: `; never beside {@link by}. */
  readonly when: string | null;
  /** The paths `files: ` names, each one path with no space, cleaned as a location entry is; empty when the field is absent. */
  readonly files: readonly string[];
  /** The bare `YYYY-MM-DD` field: the day the row was deferred. */
  readonly deferredOn: string | null;
  /** The text after `rationale: `, to the end of the line. */
  readonly rationale: string | null;
  /** Whether the row stands below {@link SCHEDULE_RULE_HEADING}. */
  readonly belowRule: boolean;
}

export interface InboxProblem {
  /** The bullet's 1-based line in the inbox. */
  readonly line: number;
  /** Why the bullet does not parse, without a path or line prefix. */
  readonly message: string;
}

/** How a row came to match a query; `all` when the query names no filter at all. */
export type MatchedBy = "path" | "ref" | "plan" | "area" | "due" | "always" | "all";

export interface InboxQuery {
  readonly paths: readonly string[];
  readonly plan?: string;
  readonly area?: readonly string[];
  /** A day, `YYYY-MM-DD`, which the caller has checked: rows whose `by:` is on or before it match. */
  readonly due?: string;
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

/** A keyed field: a word, a colon, then a space or the end of the field. */
const KEYED_FIELD = /^([A-Za-z][A-Za-z0-9_-]*):(?: |$)/u;

/** A bare field shaped as a date, whether or not it names a real day. */
const DATE_SHAPED = /^\d{4}-\d{2}-\d{2}$/u;

/** A tag word: no space and no colon. */
const TAG_WORD = /^[^\s:]+$/u;

/** What the optional fields after `source:` and `Ref:` hold, each `null` or empty where absent. */
interface ScheduleFields {
  tag: string | null;
  by: string | null;
  when: string | null;
  files: string[] | null;
  deferredOn: string | null;
  rationale: string | null;
}

/**
 * The optional fields after `source:` and `Ref:`, read by prefix in any order,
 * or the one problem that refuses them. A bare field that is neither a tag
 * word nor a date, and a second tag word, keep the message the grammar gave
 * before these fields existed, naming every trailing field as written.
 */
function parseTrailing(rest: readonly string[], hasRef: boolean): ScheduleFields | string {
  const fields: ScheduleFields = { tag: null, by: null, when: null, files: null, deferredOn: null, rationale: null };
  const twice = (key: string): string => `\`${key}:\` appears twice`;
  for (let index = 0; index < rest.length; index += 1) {
    const field = (rest[index] ?? "").trim();
    const keyed = KEYED_FIELD.exec(field);
    if (keyed === null) {
      if (DATE_SHAPED.test(field)) {
        if (fields.deferredOn !== null) return `a second deferral date \`${field}\`; the bare date appears once`;
        if (!isIsoDate(field)) return `the deferral date \`${field}\` is no real calendar day`;
        fields.deferredOn = field;
        continue;
      }
      if (TAG_WORD.test(field) && fields.tag === null) {
        fields.tag = field;
        continue;
      }
      return `trailing field(s) beyond one optional tag word — ${rest.join(" · ")}`;
    }
    const key = keyed[1] ?? "";
    const value = field.slice(keyed[0].length).trim();
    if (key === "rationale") {
      // Last by rule: the rest of the line is its text, whatever that text is shaped as.
      const said = rest.slice(index).join(" · ").trim().slice("rationale:".length).trim();
      if (said === "") return "`rationale:` gives no reason";
      fields.rationale = said;
      break;
    }
    if (key === "by") {
      if (fields.by !== null) return twice(key);
      if (!isIsoDate(value)) return "`by:` names no real calendar day as YYYY-MM-DD";
      fields.by = value;
    } else if (key === "when") {
      if (fields.when !== null) return twice(key);
      // `vagueTrigger` answers null for a trigger with no word, so that one is asked for here.
      if (!/[\p{L}\p{N}]/u.test(value)) return "`when:` names no trigger";
      const vague = vagueTrigger(value);
      if (vague !== null) return `\`when:\` names the vague trigger \`${vague}\`, which no event brings back`;
      fields.when = value;
    } else if (key === "files") {
      if (fields.files !== null) return twice(key);
      const entries = value.split(",");
      const paths = entries.map(entryPath);
      if (paths.includes("")) return "`files:` names an empty path";
      // A location entry may carry a word after its path; a `files:` entry is the path alone, so prose is refused, not cut.
      const spaced = entries.findIndex((entry) => /\s/u.test(entry.replaceAll("`", "").trim()));
      if (spaced !== -1) {
        return `\`files:\` entry starting \`${paths[spaced] ?? ""}\` holds a space; an entry is one path, parted from the next by a comma`;
      }
      fields.files = paths;
    } else if (key === "source" || (key === "Ref" && hasRef)) {
      return twice(key);
    } else if (key === "Ref") {
      // First after `source:` and still here: the field is in its place, and its value is what is missing.
      if (index === 0 && value === "") return "`Ref:` names no path";
      return "`Ref:` comes straight after `source:`, before any other field";
    } else {
      return `unknown field \`${key}:\``;
    }
    if (fields.by !== null && fields.when !== null) return "`by:` and `when:` both appear; a row carries one of them";
  }
  return fields;
}

/** Whether a trigger is the one word `touched`, whatever its case and the punctuation around it. */
function isTouched(trigger: string): boolean {
  return trigger.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === "touched";
}

/** One bullet's text after its `- `, parsed into a row, or the one problem that refuses it. */
function parseBullet(line: number, bullet: string, belowRule: boolean): InboxRow | InboxProblem {
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
  // Space before `Ref:` does not move it out of its place: the fields after it are read trimmed too.
  const first = rest[0]?.trimStart() ?? "";
  if (first.startsWith("Ref: ")) {
    ref = first.slice("Ref: ".length).trim();
    const problem = refProblem(ref);
    if (problem !== null) return fail(problem);
    rest.shift();
  }
  const trailing = parseTrailing(rest, ref !== null);
  if (typeof trailing === "string") return fail(trailing);
  const files = trailing.files ?? [];
  if (trailing.when !== null && isTouched(trailing.when) && locationPaths(location).length === 0 && files.length === 0) {
    return fail("`when: touched` needs a path, in the location or in `files:`");
  }
  if (belowRule && trailing.by === null && trailing.when === null) {
    return fail(
      `a row under \`${SCHEDULE_RULE_HEADING}\` carries \`by: <YYYY-MM-DD>\` or \`when: <trigger>\`; this one carries neither`,
    );
  }
  return {
    line,
    severity,
    location,
    description,
    source: writer,
    ref,
    tag: trailing.tag,
    by: trailing.by,
    when: trailing.when,
    files,
    deferredOn: trailing.deferredOn,
    rationale: trailing.rationale,
    belowRule,
  };
}

/**
 * Every bullet of the inbox, parsed: a `- ` line either becomes a row or names
 * one problem, never both. Every problem is collected rather than the first, so
 * one pass fixes them all. A bullet below {@link SCHEDULE_RULE_HEADING} is
 * read as one the schedule rule binds, whatever heading follows it.
 */
export function parseInbox(text: string): { rows: InboxRow[]; problems: InboxProblem[] } {
  const rows: InboxRow[] = [];
  const problems: InboxProblem[] = [];
  let belowRule = false;
  text.split("\n").forEach((raw, index) => {
    if (raw.trimEnd() === SCHEDULE_RULE_HEADING) belowRule = true;
    if (!raw.startsWith("- ")) return;
    const parsed = parseBullet(index + 1, raw.slice(2), belowRule);
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
  return location
    .split(",")
    .map(entryPath)
    .filter((path) => path.includes("/") || path.includes("."));
}

/** One comma-separated entry as a path: trimmed, its backticks stripped, cut at the first space and then at the first `:`. */
function entryPath(entry: string): string {
  let path = entry.replaceAll("`", "").trim();
  const space = path.indexOf(" ");
  if (space !== -1) path = path.slice(0, space);
  const colon = path.indexOf(":");
  if (colon !== -1) path = path.slice(0, colon);
  return path;
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
  due: string | null,
): MatchedBy | null {
  const located = locationPaths(row.location)
    .map(normalizePath)
    .filter((entry) => entry !== "");
  // A `files:` entry names a path the way a location entry does.
  const entries = [...located, ...row.files.map(normalizePath).filter((entry) => entry !== "")];
  const ref = row.ref === null ? null : refPath(row.ref);
  if (entries.some((entry) => paths.some((path) => entryMatches(entry, path)))) return "path";
  if (ref !== null && paths.includes(ref)) return "ref";
  if (plan !== null && (ref === plan || entries.includes(plan))) return "plan";
  if (located.length === 0 && area.length > 0) {
    const words = foldedWords(`${row.location} ${row.description}`);
    if (area.some((word) => words.has(word))) return "area";
  }
  // Both are `YYYY-MM-DD`, so the text order is the calendar's.
  if (due !== null && row.by !== null && row.by <= due) return "due";
  if (row.tag !== null && ALWAYS_SET.has(row.tag)) return "always";
  return null;
}

/**
 * The rows a query matches, in inbox order, each with how it matched, the
 * count of those it does not, and, among those, the count that carry a
 * `when:` trigger: rows waiting on an event no query can see arrive. A query
 * naming no path, plan, area word or due day matches every row as `all`.
 * `area` words reach only a row whose location names no path, so a row pinned
 * to a file is found by its file. A row whose `by:` day is on or before the
 * query's `due` day matches as `due`. A row tagged with an
 * {@link ALWAYS_SHOW_TAGS} word matches every query.
 */
export function matchInbox(
  rows: readonly InboxRow[],
  query: InboxQuery,
): { matched: InboxMatch[]; unmatched: number; triggers: number } {
  const paths = query.paths.map(normalizePath).filter((path) => path !== "");
  const planPath = normalizePath(query.plan ?? "");
  const plan = planPath === "" ? null : planPath;
  const area = (query.area ?? []).map((word) => word.trim().toLowerCase()).filter((word) => word !== "");
  const due = query.due ?? null;
  const unfiltered = paths.length === 0 && plan === null && area.length === 0 && due === null;

  const matched: InboxMatch[] = [];
  let triggers = 0;
  for (const row of rows) {
    const matchedBy = unfiltered ? "all" : matchRow(row, paths, plan, area, due);
    if (matchedBy !== null) matched.push({ row, matchedBy });
    else if (row.when !== null) triggers += 1;
  }
  return { matched, unmatched: rows.length - matched.length, triggers };
}
