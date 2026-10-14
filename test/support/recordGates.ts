import type { LedgerRow } from "./ledgerGrammar.ts";

/**
 * The records gate's pure checks over `(ledgerText, inboxText)`, shared by the two callers that
 * drive them: the records suite over the committed tree (`test/records/ledgers.test.ts`, run by
 * `npm run test:records`) and the fixture cases over hand-built text (`test/runs/ledgerGates.test.ts`,
 * run by `npm test`), so a green run proves the gate can fail as well as that the tree passes.
 *
 * Moved from `test/records/ledgers.test.ts` (2026-10-14, unit r1-records-suite, REQ-PROVE-025) so
 * the fixture cases run without the records on disk; no check, message or verdict changed.
 *
 * This lane imports nothing from `src/` (`test/support/support.test.ts`), so the three checks that
 * read the shipped inbox and disposition grammars — {@link RecordGates} — are built by
 * {@link recordGates} from the real `parseInbox`, `parseDisposition`, `SCHEDULE_RULE_FROM` and
 * `INBOX_PATH` each caller hands in: the production collaborators themselves, not a stand-in.
 */

/** One inbox problem as `parseInbox` returns it. */
interface InboxProblemShape {
  readonly line: number;
  readonly message: string;
}

/** The `src/runs/` grammar the src-bound checks read, handed in by each caller. */
interface RecordGateGrammar {
  /** `parseInbox` from `src/runs/inboxStore.ts`. */
  readonly parseInbox: (text: string) => {
    readonly rows: readonly { readonly ref: string | null }[];
    readonly problems: readonly InboxProblemShape[];
  };
  /** `parseDisposition` from `src/runs/disposition.ts`. */
  readonly parseDisposition: (text: string) => { readonly ok: true } | { readonly ok: false; readonly problem: string };
  /** `SCHEDULE_RULE_FROM` from `src/runs/disposition.ts`: the schedule rule's cutover date. */
  readonly SCHEDULE_RULE_FROM: string;
  /** `INBOX_PATH` from `src/runs/inboxStore.ts`. */
  readonly INBOX_PATH: string;
}

/** The three checks that read the shipped grammar. */
interface RecordGates {
  readonly renderProblem: (problem: InboxProblemShape) => string;
  readonly inboxRefs: (text: string) => Set<string>;
  readonly retiredProblems: (ledgerPath: string, rows: readonly LedgerRow[]) => string[];
}

/**
 * The ledgers carrying each legacy spelling, by NAME rather than by count. A
 * count moves whenever a carrier is edited and teaches the next author to bump
 * the number; a name list moves only when a ledger starts or stops carrying the
 * spelling, which is the event worth failing on.
 */
export const LEGACY_CLOSED_LEDGERS = [
  ".stamity/runs/2026-09-01_closure-run/ledger.jsonl",
  ".stamity/runs/2026-09-01_frontier-review-pr10/ledger.jsonl",
  ".stamity/runs/2026-09-02_package-6/ledger.jsonl",
] as const;

export const LEGACY_INFO_LEDGERS = [
  ".stamity/runs/2026-09-01_closure-run/ledger.jsonl",
  ".stamity/runs/2026-09-01_frontier-review-pr10/ledger.jsonl",
  ".stamity/runs/2026-09-02_package-6/ledger.jsonl",
  ".stamity/runs/2026-09-04_package-8-closeout/ledger.jsonl",
  ".stamity/runs/2026-09-04_package-8/ledger.jsonl",
  ".stamity/runs/2026-09-07_package-4/ledger.jsonl",
] as const;

/**
 * The `retired` value's declared shape: it opens with a `YYYY-MM-DD` date and
 * then states the disposition. Both halves are required — the date is the audit
 * trail a reader places against a commit, and a bare date states nothing about
 * what happened to the deferral, so neither alone retires a row.
 */
const RETIRED_DATE = /^\d{4}-\d{2}-\d{2}\s+\S/;

/**
 * `<ledger>#<id>` for every id a ledger carries more than once. The id is what
 * makes the in-place rewrite converge instead of appending a second row, so two
 * rows sharing one id are two answers to the same finding: an inbox `Ref:`
 * resolves to whichever the reader reaches first, and a retirement lands on one
 * of them. Reported once per repeated id, not once per extra row.
 */
export const duplicateIds = (ledgerPath: string, rows: readonly LedgerRow[]): string[] => {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const { id } of rows) {
    if (seen.has(id)) repeated.add(id);
    seen.add(id);
  }
  return [...repeated].map((id) => `${ledgerPath}#${id}`);
};

/** A `retired` value's leading date, and the disposition after it (empty when the date stands alone). */
const RETIRED_LEAD = /^(\d{4}-\d{2}-\d{2})(?:\s+|$)/u;

/** The UTC date a run folder's name opens with, read from its ledger's path; `null` when the folder carries none. */
const runDateOf = (ledgerPath: string): string | null =>
  /^\.stamity\/runs\/(\d{4}-\d{2}-\d{2})_[^/]*\/ledger\.jsonl$/u.exec(ledgerPath)?.[1] ?? null;

/** `<ledger>#<id>` for every row a committed ledger left `open`. */
export const openRowLabels = (ledgerPath: string, rows: readonly LedgerRow[]): string[] =>
  rows.filter((row) => row.state === "open").map((row) => `${ledgerPath}#${row.id}`);

/**
 * `<ledger>#<id>` for every `deferred` row that is accounted for by neither a
 * dated `retired` line nor an inbox row pointing back at it. That pair is the
 * whole contract: a deferral either left (retired, with the date it left on) or
 * it is live somewhere a later run reads.
 */
export const unaccountedDeferrals = (
  ledgerPath: string,
  rows: readonly LedgerRow[],
  refs: ReadonlySet<string>,
): string[] =>
  rows
    .filter((row) => row.state === "deferred")
    .filter((row) => !(row.retired !== null && RETIRED_DATE.test(row.retired.trim())))
    .filter((row) => !refs.has(`${ledgerPath}#${row.id}`))
    .map((row) => `${ledgerPath}#${row.id}`);

/** The src-bound checks, over the grammar the caller hands in. */
export function recordGates({ parseInbox, parseDisposition, SCHEDULE_RULE_FROM, INBOX_PATH }: RecordGateGrammar): RecordGates {
  /**
   * One inbox problem as the gate prints it: `.stamity/inbox.md:<line>: <message>`.
   *
   * TEST CHANGE, justified (2026-10-10, q1b-records-gate-parser): the inbox parser
   * moved from `test/records/ledgers.test.ts` to `src/runs/inboxStore.ts` so the `ledger inbox` query
   * and this gate read one grammar. The shared parser returns `{ line, message }`
   * rather than a prefixed string, so the prefix is composed here; no message and
   * no verdict changed, and every pin below matches the same substring as before.
   */
  const renderProblem = (problem: InboxProblemShape): string => `${INBOX_PATH}:${problem.line}: ${problem.message}`;

  /** Every `Ref:` value the inbox carries, as written. */
  const inboxRefs = (text: string): Set<string> =>
    new Set(parseInbox(text).rows.flatMap((row) => (row.ref === null ? [] : [row.ref])));

  /**
   * `<ledger>#<id>: <problem>` for every `retired` value the schedule rule
   * (REQ-FLOW-076) binds whose disposition, its leading date stripped, does not
   * parse under the rule's grammar.
   *
   * Which values it binds is read from two dates. In a ledger whose run is dated
   * on or after `SCHEDULE_RULE_FROM`, every `retired` value is bound,
   * whatever date it carries or none: the leading date is text in the committed
   * line, so it cannot take its own value out of the rule (review/18). There a
   * date earlier than the run's is a problem of its own, since no row is retired
   * before its run exists; a missing date stays the unaccounted check's to name.
   * In any other ledger a value is bound by its own leading date alone, as
   * before: one dated earlier than the cutover, or undated, is not read here.
   */
  const retiredProblems = (ledgerPath: string, rows: readonly LedgerRow[]): string[] => {
    const runDate = runDateOf(ledgerPath);
    const ruledRun = runDate !== null && runDate >= SCHEDULE_RULE_FROM;
    return rows.flatMap((row) => {
      if (row.retired === null) return [];
      const value = row.retired.trim();
      const lead = RETIRED_LEAD.exec(value);
      const date = lead?.[1];
      if (!ruledRun && (date === undefined || date < SCHEDULE_RULE_FROM)) return [];
      const problems: string[] = [];
      if (ruledRun && date !== undefined && date < runDate) {
        problems.push(`\`retired\` is dated ${date}, before its run's date ${runDate}`);
      }
      const parsed = parseDisposition(value.slice(lead?.[0].length ?? 0));
      if (!parsed.ok) problems.push(parsed.problem);
      return problems.map((problem) => `${ledgerPath}#${row.id}: ${problem}`);
    });
  };

  return { renderProblem, inboxRefs, retiredProblems };
}
