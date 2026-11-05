import { reportNameRole } from "./layout.ts";
import type { LedgerRow } from "./ledgerStore.ts";
import { blastRadiusSection, MORNING_EMPTY, MORNING_FILE, MORNING_SECTIONS, parseMorning } from "./morning.ts";
import { readRecordHead } from "./resumeCard.ts";

/**
 * The one short page a person reads after a run (REQ-FLOW-161), for `stamity run overview`: what happened, how, why, then
 * what only the person can do. A verb and not a file `run end` writes, since the land's rows reach `morning.md` after it.
 *
 * Pure: text in, text out. The verb reads the run folder, parses the ledger and cleans each line for the terminal, so
 * every value here is a run's own text, printed as a fact the record states and never followed. The human-only rows are
 * printed as written: this page reads no row grammar.
 */

export interface OverviewInput {
  readonly record: string;
  readonly ledger: readonly LedgerRow[];
  /** `morning.md`'s text; `null` where the run folder holds none. */
  readonly morning: string | null;
  /** Why the ledger did not read, where it did not: nothing is then counted from it, and an empty `ledger` is no claim of none. */
  readonly ledgerFailure?: string;
}

/** The most rows of one list the page prints; the person's own list is never cut. */
const LIST_MAX = 12;

/** Report passes that are the whole run's and no unit's, as `/st-work`'s report path names them. */
const WHOLE_RUN_PASSES: ReadonlySet<string> = new Set(["branch", "plan"]);

/** The states a ledger row moves through, in the order the page counts them. */
const STATES: readonly string[] = ["open", "fixed", "rejected", "deferred"];

const HELD: string = MORNING_SECTIONS[3];

/** `run land`'s own record line, `- <UTC> land: #<n> <sha> <how>`. */
const LAND_LINE = /^- \S+ land: (#[0-9]+ \S+ \S+)[ \t]*$/;
/** A usage line, `- <UTC> usage: <phase> minutes=<n> tokens=<n | unreported> (<client>)`. */
const USAGE_LINE = /^- \S+ usage: .*\bminutes=(\S+) tokens=(\S+)/;
/** A choice line, `- <UTC> choice: <unit> tried | dropped | reverted <approach> — <pointer>`. */
const CHOICE_LINE = /^- \S+ choice: (.+)$/;
/** A default, wherever in its line a run wrote it, with or without bold. */
const DEFAULT_LINE = /Default applied:\*{0,2} (.+)$/;
/** The gate results' label line, which records spell as a line, a bullet, a heading or in bold. */
const GATES_LABEL = /^\s*(?:[-#*]+\s*)*Gate results\b/;
const LIST_ROW = /^\s*[-*] +/;

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

/** The last gate results label as written, then the list under it. */
function gatesLines(lines: readonly string[]): string[] {
  const at = lines.findLastIndex((line) => GATES_LABEL.test(line));
  if (at === -1) return ["gates: no gate results in the record yet"];
  const rows: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "" && rows.length === 0) continue;
    if (!LIST_ROW.test(line)) break;
    rows.push(line.replace(LIST_ROW, ""));
  }
  return [`gates: ${(lines[at] ?? "").trim()}`, ...listed("", rows).slice(1)];
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

/** The person's list as `morning.md` holds it, or a line saying why there is none to show. */
function humanOnly(morning: string | null): string[] {
  if (morning === null) return [`no ${MORNING_FILE} in the run folder, so there is no list yet`];
  const parsed = parseMorning(morning);
  if (!parsed.ok) return [`${MORNING_FILE} does not parse, so its list is not shown: ${parsed.problems[0] ?? "no problem named"}`];
  return (parsed.sections[HELD] ?? MORNING_EMPTY).split("\n");
}

/** The page: `## What happened`, `## How`, `## Why` and `## Only you can do`, in that order. */
export function overviewFrom(input: OverviewInput): string {
  const lines = input.record.split(/\r?\n/);
  const { ledgerFailure } = input;
  const fromLedger = (label: string, line: (ledger: readonly LedgerRow[]) => string): string =>
    ledgerFailure === undefined ? line(input.ledger) : `${label}: not counted, since ${ledgerFailure}`;
  const blast = blastRadiusSection(input.record)?.split("\n").slice(1).filter((line) => line.trim() !== "") ?? [];
  const sections: readonly (readonly [string, readonly string[]])[] = [
    [
      "What happened",
      [
        `status: ${readRecordHead(input.record).status ?? "the record names none"}`,
        fromLedger("units", unitsLine),
        `land: ${captured(lines, LAND_LINE).at(-1) ?? "no land yet"}`,
        ...(blast.length === 0 ? [] : ["blast radius:", ...blast]),
      ],
    ],
    ["How", [...gatesLines(lines), fromLedger("rounds", roundsLine), fromLedger("findings", findingsLine), usageLine(lines)]],
    ["Why", [...listed("defaults", captured(lines, DEFAULT_LINE)), ...listed("choices", captured(lines, CHOICE_LINE))]],
    ["Only you can do", humanOnly(input.morning)],
  ];
  return `${sections.map(([name, rows]) => [`## ${name}`, "", ...rows].join("\n")).join("\n\n")}\n`;
}
