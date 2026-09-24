/**
 * The ledger row grammar: one parser, read by every suite that holds a
 * `ledger.jsonl` to it.
 *
 * Two suites import it. The records gate (`test/records/ledgers.test.ts`)
 * holds every committed ledger to it, and the `ledger append` suite
 * (`test/runs/ledgerAppend.test.ts`) feeds the bytes the writer lands through
 * it. One copy is the point: a grammar the append suite pinned by hand would
 * drift from the gate's silently, and a move here now reaches both.
 *
 * Pure over `(ledgerPath, text)`: `ledgerPath` is the POSIX, repo-relative
 * spelling git prints, used for messages and for locating the run's
 * `reports/` folder, never for a read.
 */

import { posix } from "node:path";

/** The seven fields a ledger row carries, per the Proof block's row schema. */
const REQUIRED_FIELDS = [
  "id",
  "phase",
  "source",
  "severity",
  "evidence",
  "state",
  "rationale",
] as const;

/**
 * The fields beyond the seven, each optional on the same row:
 *
 * - `retired`, the shape `/st-work` declares: its value opens with the date and
 *   then states the disposition. Not a rewritten `state`, and not a second row —
 *   the ledger's converge-by-id rule forbids both, and that rule is itself
 *   asserted in the records gate.
 * - `report`, the repo-relative path of the full role report the row was
 *   appended from (C1): exactly `<run dir>/reports/<name>.md`, POSIX-spelled,
 *   where `<run dir>` is the ledger's own folder. Its existence is NOT checked:
 *   the reports folder is git-ignored, so CI never has the file.
 * - `decision_needed`, present only as `true` (C3): a row whose fix changes a
 *   shared contract or needs a product choice. Absent is the "no" — a `false`
 *   would be a second spelling of the same answer.
 */
const OPTIONAL_FIELDS = ["retired", "report", "decision_needed"] as const;

/** A ledger's file name; the run folder is its path minus `/<this>`. */
export const LEDGER_SUFFIX = "ledger.jsonl";

/** A report's file name: one path segment, no separator of either kind, `.md`. */
const REPORT_NAME = /^[^/\\]+\.md$/;

/**
 * Whether `report` names a markdown file directly inside this ledger's run's
 * `reports/` folder. The run folder is the ledger path minus `/ledger.jsonl`,
 * so a report under another run, a nested folder or a backslash spelling fails.
 *
 * The separator is `posix.sep` because both paths are POSIX spellings on every
 * platform. The run folder stays a slice rather than `posix.dirname`: dirname
 * reads a root-anchored `/ledger.jsonl` as the folder `/`, not the empty
 * string, and would move this check's answer for it.
 */
const isRunReport = (ledgerPath: string, report: unknown): boolean => {
  const suffix = `${posix.sep}${LEDGER_SUFFIX}`;
  if (typeof report !== "string" || !ledgerPath.endsWith(suffix)) return false;
  const prefix = `${ledgerPath.slice(0, -suffix.length)}${posix.sep}reports${posix.sep}`;
  return report.startsWith(prefix) && REPORT_NAME.test(report.slice(prefix.length));
};

/**
 * The terminal states a committed row may end in. `closed` is a LEGACY terminal
 * spelling that predates the four-state vocabulary `/st-work` ships: it is
 * ACCEPTED here so the records that used it stay readable, and it is
 * deliberately NOT added to the grammar the corpus declares, so a new row
 * spelling `closed` is a row written against a retired vocabulary.
 *
 * Which ledgers carry it is not stated here as a count — a count is a number the
 * next author bumps. The records gate's `LEGACY_CLOSED_LEDGERS` names the carriers,
 * and its assertion that derives the carrying set from the parsed rows is the record.
 */
const TERMINAL_STATES = new Set(["fixed", "deferred", "rejected", "closed"]);

/**
 * `open` is a legal state DURING a run — the write-ahead append happens before
 * the finding is acted on — so it is known vocabulary rather than a parse
 * problem. What it may not be is the state a row is committed in, and that is
 * the records gate's dedicated assertion. Keeping it out of the vocabulary problem list
 * means a stale `open` row fails once, in the check that names the defect,
 * instead of twice in two voices.
 */
const KNOWN_STATES = new Set([...TERMINAL_STATES, "open"]);

/**
 * The severities a row may carry. `Critical`, `Warning` and `Minor` are the
 * three `/st-work`'s row schema declares; `Info` is a LEGACY fourth, given the
 * same treatment as `closed` above — ACCEPTED so the records that used it stay
 * readable, and deliberately NOT added to the grammar the corpus declares, so a
 * new row spelling `Info` is a row written against a retired vocabulary. Both
 * records are held to this set: a ledger whose `severity` went unchecked let any
 * string through the field the inbox row is built from.
 *
 * Which ledgers carry it is named in the records gate's `LEGACY_INFO_LEDGERS`, and
 * derived from the parsed rows by the assertion beneath it there. An earlier revision of this
 * comment counted the carriers by hand and got both the list and the totals
 * wrong, which is the argument for deriving them.
 */
export const SEVERITIES = new Set(["Critical", "Warning", "Minor", "Info"]);

export interface LedgerRow {
  readonly id: string;
  readonly severity: string;
  readonly state: string;
  readonly rationale: string;
  /** The retirement line, or null where the row carries none. */
  readonly retired: string | null;
}

interface LedgerParse {
  readonly rows: readonly LedgerRow[];
  /** One line per violation, each naming the ledger and the physical line. */
  readonly problems: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse one ledger's text. Blank lines are skipped; every other line must be a
 * JSON object carrying exactly the seven required fields, optionally `retired`,
 * `report` and `decision_needed`.
 * Rows that fail to parse are reported and dropped, so a later check never
 * reasons about a row whose shape it could not read.
 */
export const parseLedger = (ledgerPath: string, text: string): LedgerParse => {
  const rows: LedgerRow[] = [];
  const problems: string[] = [];
  const allowed = new Set<string>([...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]);

  text.split("\n").forEach((line, index) => {
    const at = `${ledgerPath}:${index + 1}`;
    if (line.trim() === "") return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      problems.push(`${at}: not JSON — ${(error as Error).message}`);
      return;
    }
    if (!isRecord(parsed)) {
      problems.push(`${at}: a row is a JSON object, not ${Array.isArray(parsed) ? "an array" : typeof parsed}`);
      return;
    }

    const missing = REQUIRED_FIELDS.filter((field) => typeof parsed[field] !== "string");
    if (missing.length > 0) {
      problems.push(`${at}: missing or non-string field(s) ${missing.join(", ")}`);
      return;
    }
    const unknown = Object.keys(parsed).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      problems.push(`${at}: field(s) outside the row schema — ${unknown.join(", ")}`);
      return;
    }
    if (parsed["retired"] !== undefined && typeof parsed["retired"] !== "string") {
      problems.push(`${at}: \`retired\` is a string when present`);
      return;
    }
    if (parsed["report"] !== undefined && !isRunReport(ledgerPath, parsed["report"])) {
      problems.push(`${at}: \`report\` is a POSIX path inside this run's reports/ folder`);
      return;
    }
    if (parsed["decision_needed"] !== undefined && parsed["decision_needed"] !== true) {
      problems.push(`${at}: \`decision_needed\` is present only as true`);
      return;
    }

    const id = String(parsed["id"]);
    const severity = String(parsed["severity"]);
    const state = String(parsed["state"]);
    if (!SEVERITIES.has(severity)) {
      problems.push(`${at}: severity \`${severity}\` is outside ${[...SEVERITIES].join(", ")}`);
      return;
    }
    const rationale = String(parsed["rationale"]);
    if (!KNOWN_STATES.has(state)) {
      problems.push(`${at}: state \`${state}\` is outside the declared vocabulary`);
      return;
    }
    if (state === "deferred" && rationale.trim() === "") {
      problems.push(`${ledgerPath}#${id}: a deferred row carries a rationale`);
    }
    const retiredValue = parsed["retired"];
    rows.push({
      id,
      severity,
      state,
      rationale,
      retired: typeof retiredValue === "string" ? retiredValue : null,
    });
  });

  return { rows, problems };
};
