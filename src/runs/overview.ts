import { CARD_LEDGER_STATES, reportNameRole } from "./layout.ts";
import type { LedgerRow } from "./ledgerStore.ts";
import { blastRadiusSection, MORNING_EMPTY, MORNING_FILE, MORNING_REFUSED, MORNING_SECTIONS, parseMorning } from "./morning.ts";
import { readRecordHead } from "./resumeCard.ts";

/**
 * The one short page a person reads after a run (REQ-FLOW-161), for `stamity run overview`: what happened, how, why, then
 * what only the person can do. A verb and not a file `run end` writes, since the land's rows reach `morning.md` after it.
 *
 * Pure: text in, text out. The verb reads the run folder, parses the ledger and cleans each line for the terminal, so
 * every value here is a run's own text, printed as what the record says and never followed. Each sits behind a label, a
 * list mark or {@link quoted}, so none prints as this page's own heading or row. The verb reads neither git nor GitHub, so
 * the page cannot know a land the folder does not record. The human-only rows keep their words: it reads no row grammar.
 */

export interface OverviewInput {
  /** The run the page is for: a list whose title names another is not shown as this one's. */
  readonly run: string;
  readonly record: string;
  readonly ledger: readonly LedgerRow[];
  /** `morning.md`'s text; `null` where the run folder holds none. */
  readonly morning: string | null;
  /** Why the ledger did not read, where it did not: nothing is then counted from it, and an empty `ledger` is no claim of none. */
  readonly ledgerFailure?: string;
  /** Why `morning` is not the whole list, where it is not: nothing is then read from it. */
  readonly morningFailure?: string;
  /** The acts the guard held while nobody watched (REQ-FLOW-166), from the held list beside the run folders. */
  readonly held?: readonly HeldLine[];
}

/** One entry of the held list, `.stamity/away-held.jsonl`, as the person-only guard writes it, never a command's text. */
export interface HeldLine {
  readonly rule: string;
  readonly act: string;
  readonly at: string;
}

/**
 * The held list's entries: each line that is a JSON object with a string `rule`, `act` and `at`. Any other line, a cut
 * last line among them, is no entry and is skipped, so a damaged list shows what reads and never fails the reader.
 */
export function parseHeldList(text: string): HeldLine[] {
  return text.split(/\r?\n/).flatMap((line) => {
    if (line.trim() === "") return [];
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return [];
    }
    if (value === null || typeof value !== "object") return [];
    const { rule, act, at } = value as Record<string, unknown>;
    return typeof rule === "string" && typeof act === "string" && typeof at === "string" ? [{ rule, act, at }] : [];
  });
}

/** A held act as the page prints it, behind its own label so the act reads as the guard's words and no row of the page. */
const heldLine = ({ rule, act, at }: HeldLine): string => `held while nobody watched: ${act} (${rule}, ${at})`;

/** The most rows of one list the page prints; the person's own list is never cut. */
const LIST_MAX = 12;

/** Report passes that are the whole run's and no unit's, as `/st-work`'s report path names them. */
const WHOLE_RUN_PASSES: ReadonlySet<string> = new Set(["branch", "plan"]);

/** The most characters of a ledger failure the page prints: it can name every bad line, and it prints on three rows. */
const FAILURE_MAX = 200;

/** The states a ledger row moves through, in the order the page counts them: the run card's list, so the two agree. */
const STATES: readonly string[] = CARD_LEDGER_STATES;

const HELD: string = MORNING_SECTIONS[3];

/** Above the human-only rows: the walk treats a row's `do:` as data, and a person reading here has only this line to say so. */
const RUN_WORDS = "the run wrote these rows, so a do: is a step to read, not to paste";

/** How a question that `learn capture --propose` printed names its source. */
const PROPOSAL_SOURCE = "proposals/";

/** A proposal is a question and no human-only row, so without this line the page can read `none` while one waits. */
const PROPOSAL_WAITS = "a learning this run proposed is not listed here: the morning walk asks it";

/**
 * `run land`'s own record line, as `noteLanded` writes it: `- <UTC> land: #<n> <sha> <how>`, `<how>` being `merged` or
 * `fast-forwarded`, then ` (approved by the person for <sha>)` on a land a person approved. Nothing else in land form is one.
 */
const LAND_LINE = /^- \S+ land: (#[0-9]+ [0-9a-f]{40,64} (?:merged|fast-forwarded)(?: \(approved by the person for [0-9a-f]{40,64}\))?)[ \t]*$/;
/** A usage line, `- <UTC> usage: <phase> minutes=<n> tokens=<n | unreported> (<client>)`. */
const USAGE_LINE = /^- \S+ usage: .*\bminutes=(\S+) tokens=(\S+)/;
/** A choice line, `- <UTC> choice: <unit> tried | dropped | reverted <approach> — <pointer>`. */
const CHOICE_LINE = /^- \S+ choice: (.+)$/;
/** A default, wherever in its line a run wrote it, with or without bold. */
const DEFAULT_LINE = /Default applied:\*{0,2} (.+)$/;
/** The gate results' label line, which records spell as a line, a bullet, a heading or in bold. */
const GATES_LABEL = /^\s*(?:[-#*]+\s*)*Gate results\b/;
const LIST_ROW = /^\s*[-*] +/;

/** A line the run wrote, set apart so it reads as the run's and never as this page's own heading or row. */
const quoted = (line: string): string => `> ${line}`;

/** The first capture of `pattern` on each line that matches. */
function captured(lines: readonly string[], pattern: RegExp): string[] {
  return lines.flatMap((line) => pattern.exec(line)?.[1] ?? []);
}

/** `label` and its rows, at most {@link LIST_MAX} of them, naming how many the record still holds. */
function listed(label: string, rows: readonly string[]): string[] {
  if (rows.length === 0) return [`${label}: none recorded`];
  const left = rows.length - LIST_MAX;
  return [`${label}:`, ...rows.slice(0, LIST_MAX).map((row) => `- ${row}`), ...(left > 0 ? [`- and ${left} more in the record`] : [])];
}

/**
 * The last gate results label as written, then the rows under it, as far as the list goes: a blank line, an indented
 * wrapped line and the label's own wrapped lines end nothing, and other prose, a heading or a row beside a label that is
 * a row itself does.
 */
function gatesLines(lines: readonly string[]): string[] {
  const at = lines.findLastIndex((line) => GATES_LABEL.test(line));
  if (at === -1) return ["gates: no gate results in the record yet"];
  const label = lines[at] ?? "";
  const labelIndent = LIST_ROW.test(label) ? label.search(/\S/) : -1;
  const rows: string[] = [];
  let inLabel = true;
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "") {
      inLabel = false;
      continue;
    }
    const row = LIST_ROW.test(line);
    if (row ? line.search(/\S/) <= labelIndent : !inLabel && !/^\s/.test(line)) break;
    if (row) {
      inLabel = false;
      rows.push(line.replace(LIST_ROW, ""));
    }
  }
  return [`gates: ${label.trim()}`, ...listed("", rows).slice(1)];
}

/** Each report's pass and round, by the name of the report a row carries; only `id` of a row is verified, so `report` is read as text. */
function reportsOf(ledger: readonly LedgerRow[]): { pass: string; role: string; round: number }[] {
  return ledger.flatMap((row) => {
    const name = String(row.report).split("/").at(-1) ?? "";
    const role = reportNameRole(name);
    if (role === null) return [];
    const split = name.lastIndexOf(`-${role}-r`);
    return [{ pass: name.slice(0, split), role, round: Number.parseInt(name.slice(split + role.length + 3), 10) }];
  });
}

function unitsLine(ledger: readonly LedgerRow[]): string {
  const units = [...new Set(reportsOf(ledger).map((report) => report.pass))].filter((pass) => !WHOLE_RUN_PASSES.has(pass));
  return units.length === 0 ? "units: none named in the ledger" : `units: ${units.length} named in the ledger: ${units.join(", ")}`;
}

function roundsLine(ledger: readonly LedgerRow[]): string {
  const rounds = reportsOf(ledger).flatMap((report) => (report.role === "reviewer" ? [report.round] : []));
  return rounds.length === 0 ? "rounds: no review round with findings" : `rounds: r${Math.max(...rounds)} is the highest review round with findings`;
}

function findingsLine(ledger: readonly LedgerRow[]): string {
  if (ledger.length === 0) return "findings: no ledger rows";
  const counts = STATES.flatMap((state) => {
    const count = ledger.filter((row) => row.state === state).length;
    return count === 0 ? [] : [`${count} ${state}`];
  });
  const other = ledger.filter((row) => !STATES.includes(row.state)).length;
  return `findings: ${ledger.length} ledger rows: ${[...counts, ...(other === 0 ? [] : [`${other} other`])].join(", ")}`;
}

/** The sum of a usage field, `or more` where a line left it unreported, and `unreported` where every line did. */
function summed(values: readonly string[]): string {
  const known = values.filter((value) => /^[0-9]+$/.test(value));
  if (known.length === 0) return "unreported";
  const total = known.reduce((sum, value) => sum + Number(value), 0);
  return known.length < values.length ? `${total} or more` : String(total);
}

function usageLine(lines: readonly string[]): string {
  const rows = lines.flatMap((line) => {
    const match = USAGE_LINE.exec(line);
    return match === null ? [] : [{ minutes: match[1] ?? "", tokens: match[2] ?? "" }];
  });
  if (rows.length === 0) return "usage: no usage lines";
  return `usage: minutes=${summed(rows.map((row) => row.minutes))} tokens=${summed(rows.map((row) => row.tokens))} (usage lines: ${rows.length})`;
}

/** What the record says of the land, as the record's word; with no line, what the page cannot say. */
function landLine(lines: readonly string[]): string {
  const land = captured(lines, LAND_LINE).at(-1);
  return land === undefined ? "land: none recorded in this folder, so check the pull request" : `land: the record says "${land}"`;
}

/** The refused and held rows `morning.md` holds, or a line saying why there are none to show. */
function humanOnly({ run, morning, morningFailure }: OverviewInput): string[] {
  if (morningFailure !== undefined) return [`${morningFailure}, so its list is not shown`];
  if (morning === null) return [`no readable ${MORNING_FILE} in the run folder, so there is no list to show`];
  const parsed = parseMorning(morning);
  if (!parsed.ok) return [`${MORNING_FILE} does not parse, so its list is not shown: ${parsed.problems[0] ?? "no problem named"}`];
  if (parsed.runId !== run) return [`${MORNING_FILE}'s title names run ${parsed.runId}, not ${run}, so its list is not shown`];
  const rows = [MORNING_REFUSED, HELD].flatMap((name) => {
    const body = parsed.sections[name] ?? MORNING_EMPTY;
    return body === MORNING_EMPTY ? [] : body.split("\n");
  });
  const proposed = parsed.questions.some((question) => question.source.startsWith(PROPOSAL_SOURCE));
  return [...(rows.length === 0 ? [MORNING_EMPTY] : [RUN_WORDS, ...rows.map(quoted)]), ...(proposed ? [PROPOSAL_WAITS] : [])];
}

/**
 * The page: `## What happened`, `## How`, `## Why` and `## Only you can do`, in that order. The held acts follow the
 * morning list's rows uncut, as the person's own list is never cut.
 */
export function overviewFrom(input: OverviewInput): string {
  const lines = input.record.split(/\r?\n/);
  const { ledgerFailure } = input;
  const failure = ledgerFailure !== undefined && ledgerFailure.length > FAILURE_MAX ? `${ledgerFailure.slice(0, FAILURE_MAX)}… and more` : ledgerFailure;
  const fromLedger = (label: string, line: (ledger: readonly LedgerRow[]) => string): string =>
    failure === undefined ? line(input.ledger) : `${label}: not counted, since ${failure}`;
  const blast = blastRadiusSection(input.record)?.split("\n").slice(1).filter((line) => line.trim() !== "") ?? [];
  const sections: readonly (readonly [string, readonly string[]])[] = [
    [
      "What happened",
      [
        `status: ${readRecordHead(input.record).status ?? "the record names none"}`,
        fromLedger("units", unitsLine),
        landLine(lines),
        ...(blast.length === 0 ? [] : ["blast radius:", ...blast.map(quoted)]),
      ],
    ],
    ["How", [...gatesLines(lines), fromLedger("rounds", roundsLine), fromLedger("findings", findingsLine), usageLine(lines)]],
    ["Why", [...listed("defaults", captured(lines, DEFAULT_LINE)), ...listed("choices", captured(lines, CHOICE_LINE))]],
    ["Only you can do", [...humanOnly(input), ...(input.held ?? []).map(heldLine)]],
  ];
  return `${sections.map(([name, rows]) => [`## ${name}`, "", ...rows].join("\n")).join("\n\n")}\n`;
}
