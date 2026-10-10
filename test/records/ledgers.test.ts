import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDisposition, SCHEDULE_RULE_FROM } from "../../src/runs/disposition.ts";
import {
  INBOX_PATH,
  INBOX_SEVERITIES,
  parseInbox,
  SCHEDULE_RULE_HEADING,
  type InboxProblem,
} from "../../src/runs/inboxStore.ts";
import { LEDGER_SUFFIX, SEVERITIES, parseLedger, type LedgerRow } from "../support/ledgerGrammar.ts";

/**
 * The records gate: every committed findings ledger and the deferral inbox they
 * feed, held to the grammar `content/commands/st-work.md` and
 * `content/commands/st-board.md` declare.
 *
 * Why this is a test and not a review habit: a ledger is written once, a run
 * record is read-only to every later run, and both live under `.stamity/`,
 * where no other suite reaches. So a row left `open` at exit, or a row closed
 * `deferred` whose deferral was never written anywhere a later run reads,
 * survives every gate this repository has — which is exactly how fourteen
 * ledgers accumulated 61 stale `open` rows and 83 deferrals with no home.
 *
 * The checks are PURE FUNCTIONS over `(ledgerText, inboxText)`, and the tree is
 * one caller among several: the fixture cases below drive the same functions
 * with hand-built text, so a green run proves the gate can fail as well as that
 * the tree passes. Ledger paths are displayed POSIX (git's own spelling) and
 * composed with `node:path` for the read, so the suite holds on Windows.
 *
 * The row grammar itself — the fields, the vocabularies and `parseLedger` —
 * lives in `test/support/ledgerGrammar.ts`, so the `ledger append` suite holds
 * the bytes it writes to this same parser. The inbox's row grammar — `parseInbox`
 * and the `Ref:` rule — lives in `src/runs/inboxStore.ts`, so `stamity ledger
 * inbox` and this gate read one grammar.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

/**
 * One inbox problem as the gate prints it: `.stamity/inbox.md:<line>: <message>`.
 *
 * TEST CHANGE, justified (2026-10-10, q1b-records-gate-parser): the inbox parser
 * moved from this file to `src/runs/inboxStore.ts` so the `ledger inbox` query
 * and this gate read one grammar. The shared parser returns `{ line, message }`
 * rather than a prefixed string, so the prefix is composed here; no message and
 * no verdict changed, and every pin below matches the same substring as before.
 */
const renderProblem = (problem: InboxProblem): string => `${INBOX_PATH}:${problem.line}: ${problem.message}`;

/**
 * The ledgers carrying each legacy spelling, by NAME rather than by count. A
 * count moves whenever a carrier is edited and teaches the next author to bump
 * the number; a name list moves only when a ledger starts or stops carrying the
 * spelling, which is the event worth failing on.
 */
const LEGACY_CLOSED_LEDGERS = [
  ".stamity/runs/2026-09-01_closure-run/ledger.jsonl",
  ".stamity/runs/2026-09-01_frontier-review-pr10/ledger.jsonl",
  ".stamity/runs/2026-09-02_package-6/ledger.jsonl",
] as const;

const LEGACY_INFO_LEDGERS = [
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
const duplicateIds = (ledgerPath: string, rows: readonly LedgerRow[]): string[] => {
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

/**
 * `<ledger>#<id>: <problem>` for every `retired` value the schedule rule
 * (REQ-FLOW-076) binds whose disposition, its leading date stripped, does not
 * parse under the rule's grammar.
 *
 * Which values it binds is read from two dates. In a ledger whose run is dated
 * on or after {@link SCHEDULE_RULE_FROM}, every `retired` value is bound,
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

/** `<ledger>#<id>` for every row a committed ledger left `open`. */
const openRowLabels = (ledgerPath: string, rows: readonly LedgerRow[]): string[] =>
  rows.filter((row) => row.state === "open").map((row) => `${ledgerPath}#${row.id}`);

/** Every `Ref:` value the inbox carries, as written. */
const inboxRefs = (text: string): Set<string> =>
  new Set(parseInbox(text).rows.flatMap((row) => (row.ref === null ? [] : [row.ref])));

/**
 * `<ledger>#<id>` for every `deferred` row that is accounted for by neither a
 * dated `retired` line nor an inbox row pointing back at it. That pair is the
 * whole contract: a deferral either left (retired, with the date it left on) or
 * it is live somewhere a later run reads.
 */
const unaccountedDeferrals = (
  ledgerPath: string,
  rows: readonly LedgerRow[],
  refs: ReadonlySet<string>,
): string[] =>
  rows
    .filter((row) => row.state === "deferred")
    .filter((row) => !(row.retired !== null && RETIRED_DATE.test(row.retired.trim())))
    .filter((row) => !refs.has(`${ledgerPath}#${row.id}`))
    .map((row) => `${ledgerPath}#${row.id}`);

/** Every `ledger.jsonl` git tracks under `.stamity/runs/`, POSIX-spelled. */
const trackedLedgers = (): string[] =>
  execFileSync("git", ["ls-files", "--", ".stamity/runs"], { cwd: REPO_ROOT, encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith("/ledger.jsonl"))
    .toSorted();

const readRepoFile = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");

const LEDGERS = trackedLedgers();
const INBOX_TEXT = existsSync(join(REPO_ROOT, ...INBOX_PATH.split("/")))
  ? readRepoFile(INBOX_PATH)
  : "";
const REFS = inboxRefs(INBOX_TEXT);
const PARSED = new Map(LEDGERS.map((path) => [path, parseLedger(path, readRepoFile(path))]));

describe("committed run ledgers", () => {
  it("finds the ledgers to check", () => {
    // The gate is vacuous the moment the enumeration stops matching, and a
    // vacuous gate over records nobody else reads is indistinguishable from a
    // clean tree. Any tracked run directory means at least one ledger.
    expect(LEDGERS.length, "no tracked ledger.jsonl under .stamity/runs/").toBeGreaterThan(0);
    expect(LEDGERS.every((path) => path.startsWith(".stamity/runs/"))).toBe(true);
  });

  it("carries only rows that parse under the seven-field schema", () => {
    const problems = LEDGERS.flatMap((path) => [...(PARSED.get(path)?.problems ?? [])]);
    expect(problems, `${problems.length} ledger row(s) outside the schema`).toEqual([]);
  });

  it("carries each row id once per ledger, so the rewrite converges", () => {
    // `/st-work` appends a row `open` and rewrites it in place as its state
    // moves, and the id is the whole of what makes that converge. A second row
    // under the same id makes the ledger ambiguous to every later reader — the
    // inbox `Ref:` below resolves to one of them, the retirement lands on one of
    // them, and nothing says which.
    const duplicates = LEDGERS.flatMap((path) => duplicateIds(path, PARSED.get(path)?.rows ?? []));
    expect(duplicates, `${duplicates.length} row id(s) appearing twice in one ledger`).toEqual([]);
  });

  it("confines the legacy vocabulary to the ledgers that already carry it", () => {
    // `closed` and `Info` are accepted so old records stay readable, which is
    // exactly the accommodation that spreads if nothing watches it. The carrying
    // sets are DERIVED from the parsed rows and pinned by ledger name: a new run
    // reaching for either spelling fails here, and a hand-maintained count — the
    // shape this comment carried before, and got wrong — cannot drift silently
    // because there is no count to maintain.
    const carriers = (holds: (row: LedgerRow) => boolean): string[] =>
      LEDGERS.filter((path) => (PARSED.get(path)?.rows ?? []).some(holds));

    expect(
      carriers((row) => row.state === "closed"),
      "the ledgers carrying the legacy `closed` state have changed",
    ).toEqual([...LEGACY_CLOSED_LEDGERS]);
    expect(
      carriers((row) => row.severity === "Info"),
      "the ledgers carrying the legacy `Info` severity have changed",
    ).toEqual([...LEGACY_INFO_LEDGERS]);
  });

  it("leaves no row `open` in a committed ledger", () => {
    // The run-exit invariant, enforced where it is checkable: a committed
    // ledger is read by later runs, so a row still `open` when the record was
    // written is a gate failure and not a note.
    const open = LEDGERS.flatMap((path) => openRowLabels(path, PARSED.get(path)?.rows ?? []));
    expect(open, `${open.length} row(s) committed in state \`open\``).toEqual([]);
  });

  it("accounts for every deferred row, by a dated retirement or an inbox row", () => {
    const unaccounted = LEDGERS.flatMap((path) =>
      unaccountedDeferrals(path, PARSED.get(path)?.rows ?? [], REFS),
    );
    expect(
      unaccounted,
      `${unaccounted.length} deferred row(s) with neither a dated \`retired\` line nor an inbox row`,
    ).toEqual([]);
  });

  it("holds every `retired` value dated from the cutover to the schedule rule's grammar", () => {
    // From 2026-10-10 a retirement names how the deferral left — fixed, cut, or
    // scheduled to a place with a date or a trigger — so a row cannot leave the
    // inbox on "scheduled later" and never come back. Earlier values stay valid,
    // except in a run dated from the cutover, where every value is read.
    const problems = LEDGERS.flatMap((path) => retiredProblems(path, PARSED.get(path)?.rows ?? []));
    expect(problems, `${problems.length} \`retired\` value(s) outside the schedule rule`).toEqual([]);
  });
});

describe("the deferral inbox", () => {
  it("exists at the one declared path", () => {
    expect(
      existsSync(join(REPO_ROOT, ...INBOX_PATH.split("/"))),
      `${INBOX_PATH} is the deferral home five writers name; it has to exist`,
    ).toBe(true);
  });

  it("parses every bullet under the board's declared row grammar", () => {
    const { rows, problems: parsed } = parseInbox(INBOX_TEXT);
    const problems = parsed.map(renderProblem);
    expect(problems, `${problems.length} inbox row(s) outside the grammar`).toEqual([]);
    // No floor on the row count: an empty inbox is the state a completeness pass leaves
    // behind, and the parser's own non-vacuity is proven by the fixtures below, not by
    // the tree happening to carry a deferral today.
    expect(rows.length, "the inbox holds a negative number of rows").toBeGreaterThanOrEqual(0);
  });

  it("carries the schedule rule's heading once, so a close has a section to append under", () => {
    // The parser holds every row below this line to `by:` or `when:` (REQ-FLOW-076). With the
    // line gone, or respelled, no row is below it and the rule binds nothing, silently.
    const headings = INBOX_TEXT.split("\n").filter((line) => line.trimEnd() === SCHEDULE_RULE_HEADING);
    expect(headings, `${INBOX_PATH} carries \`${SCHEDULE_RULE_HEADING}\` ${headings.length} time(s)`).toHaveLength(1);
  });

  it("points every ledger `Ref:` at a row that exists", () => {
    const dangling: string[] = [];
    for (const ref of REFS) {
      const hash = ref.indexOf("#");
      // A bare `<path>` names a whole file, so there is no row for it to dangle
      // against; the grammar admits it and this check has nothing to say.
      if (hash === -1) continue;
      const path = ref.slice(0, hash);
      const anchor = ref.slice(hash + 1);
      if (!path.endsWith(LEDGER_SUFFIX)) continue;
      const parsed = PARSED.get(path);
      if (parsed === undefined) {
        dangling.push(`${ref} — no tracked ledger at that path`);
        continue;
      }
      if (!parsed.rows.some((row) => row.id === anchor)) dangling.push(`${ref} — no row with that id`);
    }
    expect(dangling, `${dangling.length} inbox Ref(s) naming no ledger row`).toEqual([]);
  });
});

/** One hand-built ledger row, the seven fields with the fixture's overrides. */
const row = (fields: Record<string, string>): string =>
  JSON.stringify({
    id: "r1/build/1",
    phase: "build",
    source: "implementer",
    severity: "Minor",
    evidence: "src/a.ts:1",
    state: "fixed",
    rationale: "",
    ...fields,
  });

/** The fixtures' ledger path: a run directory that does not exist, on purpose. */
const LEDGER = ".stamity/runs/fixture/ledger.jsonl";

describe("fixtures — the gate fails where it must", () => {
  it("(a) fails on a row committed `open`", () => {
    const text = row({ id: "r1/prove/2", state: "open", rationale: "" });
    const { rows, problems } = parseLedger(LEDGER, text);
    // `open` is known vocabulary — the write-ahead append uses it — so the
    // schema check passes it and the dedicated assertion is the one that fires.
    expect(problems).toEqual([]);
    expect(openRowLabels(LEDGER, rows)).toEqual([`${LEDGER}#r1/prove/2`]);
  });

  it("(b) fails on a deferred row with neither a retirement nor an inbox row", () => {
    const text = row({ id: "r1/prove/3", state: "deferred", rationale: "out of this unit's scope" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, inboxRefs("# Inbox\n\nno rows here.\n"))).toEqual([
      `${LEDGER}#r1/prove/3`,
    ]);
  });

  it("(c) passes a deferred row carrying a dated retirement", () => {
    const text = row({
      id: "r1/prove/4",
      state: "deferred",
      rationale: "belongs to the next unit",
      retired: "2026-09-09 scheduled to L2, trigger: the next client release, owner: the maintainer",
    });
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([]);
  });

  it("(d) passes a deferred row named by an inbox Ref", () => {
    const text = row({ id: "r1/prove/5", state: "deferred", rationale: "tracked in the inbox" });
    const inbox = [
      "# Deferral inbox",
      "",
      "## fixture",
      "",
      `- Minor · src/a.ts:1 · the consequence in one line · source: /st-work · Ref: ${LEDGER}#r1/prove/5`,
      "",
    ].join("\n");
    const { rows } = parseLedger(LEDGER, text);
    expect(parseInbox(inbox).problems.map(renderProblem)).toEqual([]);
    expect(unaccountedDeferrals(LEDGER, rows, inboxRefs(inbox))).toEqual([]);
  });

  it("(e) an undated retirement does not account for a deferral", () => {
    // The date is the audit trail: "retired" with no day is a claim nobody can
    // place against a commit, so it reads as no retirement at all.
    const text = row({ id: "r1/prove/6", state: "deferred", rationale: "r", retired: "scheduled" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([`${LEDGER}#r1/prove/6`]);
  });

  it("(f) a date with no disposition does not account for a deferral either", () => {
    // The declared shape is a date THEN the disposition. A bare date says a row
    // was touched on a day and nothing about what happened to the deferral, so
    // it retires nothing — the same verdict as the undated line above, reached
    // from the other missing half.
    const text = row({ id: "r1/prove/7", state: "deferred", rationale: "r", retired: "2026-09-09" });
    const { rows } = parseLedger(LEDGER, text);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([`${LEDGER}#r1/prove/7`]);
  });

  it("(n) names a `retired` value from the cutover that the schedule rule refuses", () => {
    const text = [
      row({ id: "r1/prove/8", state: "deferred", rationale: "r", retired: "2026-10-10 scheduled later" }),
      row({ id: "r1/prove/9", state: "deferred", rationale: "r", retired: "2026-11-02" }),
      row({ id: "r1/prove/10", state: "deferred", rationale: "r", retired: "2026-10-10 cut: out of scope" }),
      row({
        id: "r1/prove/11",
        state: "deferred",
        rationale: "r",
        retired: "2026-10-11 scheduled board #42 · when touched",
      }),
    ].join("\n");
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    const named = retiredProblems(LEDGER, rows);
    expect(named).toHaveLength(2);
    expect(named[0]?.startsWith(`${LEDGER}#r1/prove/8: \`scheduled\` names no `), named[0]).toBe(true);
    expect(named[1]?.startsWith(`${LEDGER}#r1/prove/9: the disposition is empty`), named[1]).toBe(true);
  });

  it("(o) leaves a `retired` value dated before the cutover unread", () => {
    // The shape fixture (c) carries, one day before the rule: valid then, valid now.
    const text = row({
      id: "r1/prove/12",
      state: "deferred",
      rationale: "r",
      retired: "2026-10-09 scheduled to L2, trigger: x",
    });
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(retiredProblems(LEDGER, rows)).toEqual([]);
    expect(unaccountedDeferrals(LEDGER, rows, new Set())).toEqual([]);
  });

  it("(p) names a value from the cutover whose slot holds only vague and filler words, or no word", () => {
    // review/15, review/16, review/17: the gate reads the writer's grammar, so
    // what `ledger close --retired` refuses a hand-written line cannot carry.
    const retiredAs = (n: number, retired: string): string =>
      row({ id: `r1/prove/${n}`, state: "deferred", rationale: "r", retired });
    const text = [
      retiredAs(20, "2026-10-10 fixed later"),
      retiredAs(21, "2026-10-10 cut: tbd"),
      retiredAs(22, "2026-10-10 scheduled board #42 · when maybe later"),
      retiredAs(23, "2026-10-10 scheduled board #42 · when —"),
      retiredAs(24, "2026-10-10 fixed —"),
      retiredAs(25, "2026-10-10 fixed in r2"),
    ].join("\n");
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    const named = retiredProblems(LEDGER, rows);
    expect(named.map((problem) => problem.slice(0, problem.indexOf(": ")))).toEqual(
      [20, 21, 22, 23, 24].map((n) => `${LEDGER}#r1/prove/${n}`),
    );
    expect(named[0]).toContain("`fixed` names only the vague word `later`");
    expect(named[1]).toContain("`cut` names only the vague word `tbd`");
    expect(named[2]).toContain("vague trigger `later`");
    expect(named[3]).toContain("`when` names no trigger");
    expect(named[4]).toContain("`fixed` names no ref");
  });

  it("(q) holds every `retired` value of a run dated from the cutover, a back-dated one included", () => {
    // review/18: a value's own leading date is text in the committed line, so it
    // cannot take the value out of the rule. A run that started on or after the
    // cutover has every `retired` value read, and a date before the run's own
    // is a problem by itself: no row is retired before its run exists.
    const ruled = ".stamity/runs/2026-10-12_fixture/ledger.jsonl";
    const retiredAs = (n: number, retired: string): string =>
      row({ id: `r1/prove/${n}`, state: "deferred", rationale: "r", retired });
    const text = [
      retiredAs(30, "2026-10-09 scheduled to L2, trigger: x"),
      retiredAs(31, "2026-10-11 fixed in r2"),
      retiredAs(32, "2026-10-12 fixed in r2"),
      retiredAs(33, "2026-10-13 scheduled board #42 · when touched"),
      retiredAs(34, "scheduled later"),
      retiredAs(35, "2026-09-30"),
    ].join("\n");
    const { rows, problems } = parseLedger(ruled, text);
    expect(problems).toEqual([]);
    expect(retiredProblems(ruled, rows)).toEqual([
      `${ruled}#r1/prove/30: \`retired\` is dated 2026-10-09, before its run's date 2026-10-12`,
      `${ruled}#r1/prove/30: \`scheduled\` names no \` · by <YYYY-MM-DD>\` or \` · when <trigger>\` after its place`,
      `${ruled}#r1/prove/31: \`retired\` is dated 2026-10-11, before its run's date 2026-10-12`,
      `${ruled}#r1/prove/34: \`scheduled\` names no \` · by <YYYY-MM-DD>\` or \` · when <trigger>\` after its place`,
      `${ruled}#r1/prove/35: \`retired\` is dated 2026-09-30, before its run's date 2026-10-12`,
      `${ruled}#r1/prove/35: the disposition is empty: write \`fixed <ref>\`, \`cut <reason>\` or \`scheduled <place> · by <YYYY-MM-DD> | when <trigger>\``,
    ]);
    // The back-dated value passed both checks before: the older one reads only its shape.
    expect(unaccountedDeferrals(ruled, rows.slice(0, 1), new Set())).toEqual([]);
  });

  it("(r) keeps a run dated before the cutover on its values' own dates", () => {
    // The same rows under a run of the day before: a value dated before the
    // cutover stays unread, and one dated from it is held to the grammar.
    const earlier = ".stamity/runs/2026-10-09_fixture/ledger.jsonl";
    const text = [
      row({ id: "r1/prove/40", state: "deferred", rationale: "r", retired: "2026-10-09 scheduled to L2, trigger: x" }),
      row({ id: "r1/prove/41", state: "deferred", rationale: "r", retired: "2026-10-08 later" }),
      row({ id: "r1/prove/42", state: "deferred", rationale: "r", retired: "2026-10-10 scheduled later" }),
      row({ id: "r1/prove/43", state: "deferred", rationale: "r", retired: "scheduled later" }),
    ].join("\n");
    const { rows, problems } = parseLedger(earlier, text);
    expect(problems).toEqual([]);
    const named = retiredProblems(earlier, rows);
    expect(named).toHaveLength(1);
    expect(named[0]?.startsWith(`${earlier}#r1/prove/42: \`scheduled\` names no `), named[0]).toBe(true);
  });

  it("(g) fails on two rows sharing one id", () => {
    // The converge-by-id rule, driven from the failing side: the same finding
    // written twice is what the in-place rewrite exists to prevent, and one id
    // repeated is reported once however many rows carry it.
    const text = [
      row({ id: "r1/build/1", state: "fixed" }),
      row({ id: "r1/build/1", state: "deferred", rationale: "the second answer" }),
      row({ id: "r1/build/1", state: "rejected", rationale: "and a third" }),
      row({ id: "r1/build/2", state: "fixed" }),
    ].join("\n");
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(duplicateIds(LEDGER, rows)).toEqual([`${LEDGER}#r1/build/1`]);
    // And the clean case stays clean, so the check is not asserting on arity.
    expect(duplicateIds(LEDGER, parseLedger(LEDGER, row({})).rows)).toEqual([]);
  });

  it("reports rows outside the schema — bad JSON, a stray field, a state, a severity, a missing rationale", () => {
    expect(parseLedger(LEDGER, "{not json}").problems[0]).toContain("not JSON");
    expect(parseLedger(LEDGER, "[]").problems[0]).toContain("a JSON object");
    expect(parseLedger(LEDGER, row({ owner: "someone" })).problems[0]).toContain(
      "outside the row schema — owner",
    );
    expect(parseLedger(LEDGER, '{"id":"x"}').problems[0]).toContain("missing or non-string field(s)");
    expect(parseLedger(LEDGER, row({ state: "wontfix" })).problems[0]).toContain(
      "outside the declared vocabulary",
    );
    expect(parseLedger(LEDGER, row({ severity: "Trivial" })).problems[0]).toContain(
      "severity `Trivial` is outside",
    );
    // The legacy fourth is admitted on the ledger exactly as it is on the inbox.
    expect(parseLedger(LEDGER, row({ severity: "Info" })).problems).toEqual([]);
    expect(parseLedger(LEDGER, row({ state: "deferred", rationale: "  " })).problems[0]).toContain(
      "a deferred row carries a rationale",
    );
    expect(parseLedger(LEDGER, row({ retired: "" })).rows[0]?.retired).toBe("");
    // Blank lines are skipped rather than reported.
    expect(parseLedger(LEDGER, `\n${row({})}\n\n`).problems).toEqual([]);
  });

  it("reports inbox bullets outside the grammar, and ignores everything that is not one", () => {
    const problem = (line: string): string => {
      const first = parseInbox(line).problems[0];
      return first === undefined ? "" : renderProblem(first);
    };
    expect(problem("- Trivial · — · d · source: /st-work")).toContain("severity `Trivial`");
    expect(problem("- Minor · — · d")).toContain("no `source: <writer>` field");
    expect(problem("- Minor · source: /st-work")).toContain("arrives before severity");
    expect(problem("- Minor ·  · d · source: /st-work")).toContain("never empty");
    expect(problem("- Minor · — ·   · source: /st-work")).toContain("description field is empty");
    expect(problem("- Minor · — · d · source: ")).toContain("`source:` names no writer");
    expect(problem("- Minor · — · d · source: /st-work · Ref: ")).toContain(
      "is neither `<path>` nor `<path>#<anchor>`",
    );
    expect(problem("- Minor · — · d · source: /st-work · Ref: r.jsonl#")).toContain(
      "is neither `<path>` nor `<path>#<anchor>`",
    );
    // A ledger is addressable only by row id, so the bare path is the one path
    // shape the grammar's optional anchor is not optional for.
    expect(problem(`- Minor · — · d · source: /st-work · Ref: ${LEDGER}`)).toContain(
      "addressable only as `<path>#<row id>`",
    );
    expect(problem("- Minor · — · d · source: /st-work · two words")).toContain("beyond one optional tag");
    expect(problem("- Minor · — · d · source: /st-work · a#1 · b")).toContain("trailing field(s)");
    // Prose, headings and blank lines are not rows.
    expect(parseInbox("# Deferral inbox\n\nRows: 3.\n  - indented\n").problems.map(renderProblem)).toEqual([]);
    // The full shape, with the tag, parses.
    const tagged = "- Critical · src/a.ts:9 · the consequence · source: rework main · Ref: r.jsonl#a/1 · critical-deferred";
    const parsed = parseInbox(tagged);
    expect(parsed.problems.map(renderProblem)).toEqual([]);
    expect(parsed.rows[0]?.tag).toBe("critical-deferred");
    expect(parsed.rows[0]?.ref).toBe("r.jsonl#a/1");
    // And the grammar's other declared form — a bare path, which is what a row
    // naming a whole record carries — parses as the same optional field.
    const bare = parseInbox("- Minor · — · d · source: rework main · Ref: .stamity/runs/x/record.md");
    expect(bare.problems.map(renderProblem)).toEqual([]);
    expect(bare.rows[0]?.ref).toBe(".stamity/runs/x/record.md");
  });

  it("(s) fails on a row below the schedule rule's heading that names no day and no trigger", () => {
    // The gate reads the committed inbox through `parseInbox`, so what the parser refuses below
    // the heading "parses every bullet" fails on. Two rows the rule binds, one of them scheduled,
    // under one older row it does not bind.
    const inbox = [
      "# Deferral inbox",
      "",
      "- Minor · src/a.ts:1 · an older row, valid as it was written · source: /st-work",
      "",
      SCHEDULE_RULE_HEADING,
      "",
      "- Minor · src/a.ts:2 · comes back when its file is touched · source: /st-work · when: touched",
      "- Minor · src/a.ts:3 · names no day and no trigger · source: /st-work",
      "- Minor · — · a touch with no file to touch · source: /st-work · when: touched",
      "- Minor · src/a.ts:5 · a trigger no event brings back · source: /st-work · when: later on",
      "",
    ].join("\n");
    const { rows, problems } = parseInbox(inbox);
    expect(rows.map((parsed) => parsed.line)).toEqual([3, 7]);
    expect(problems.map(renderProblem)).toEqual([
      `${INBOX_PATH}:8: a row under \`${SCHEDULE_RULE_HEADING}\` carries \`by: <YYYY-MM-DD>\` or \`when: <trigger>\`; this one carries neither`,
      `${INBOX_PATH}:9: \`when: touched\` needs a path, in the location or in \`files:\``,
      `${INBOX_PATH}:10: \`when:\` names the vague trigger \`later\`, which no event brings back`,
    ]);
    // The same rows with the heading gone: the row naming no day and no trigger is an older row
    // again, and a trigger is still held to its rule wherever its row stands.
    const above = parseInbox(inbox.replace(`${SCHEDULE_RULE_HEADING}\n`, ""));
    expect(above.rows.map((parsed) => parsed.line)).toEqual([3, 6, 7]);
    expect(above.problems.map((problem) => problem.line)).toEqual([8, 9]);
  });

  it("admits on the inbox exactly the severities the ledger admits", () => {
    // The inbox grammar now lives in `src/runs/inboxStore.ts` and the ledger grammar in
    // `test/support/ledgerGrammar.ts`; a deferral moves a row from one to the other, so a
    // severity either side admits alone would strand it. Compared as ordered arrays, so the
    // severity problem message, which lists them, reads the same on both sides.
    expect([...INBOX_SEVERITIES]).toEqual([...SEVERITIES]);
  });
});

describe("fixtures — the report path and the decision flag (C1, C3)", () => {
  /** The fixture ledger's own run folder, derived the way the gate derives it. */
  const REPORT = ".stamity/runs/fixture/reports/u1-reviewer-r1.md";
  const REPORT_PROBLEM = "`report` is a POSIX path inside this run's reports/ folder";
  const DECISION_PROBLEM = "`decision_needed` is present only as true";

  /** A row with arbitrary extra fields, so a non-string value reaches the parser. */
  const rowWith = (extra: Record<string, unknown>): string =>
    JSON.stringify({ ...(JSON.parse(row({ id: "r1/review/1", state: "open" })) as object), ...extra });

  it("(h) passes a row carrying its report path and `decision_needed: true`", () => {
    const { rows, problems } = parseLedger(LEDGER, rowWith({ report: REPORT, decision_needed: true }));
    expect(problems).toEqual([]);
    expect(rows.map((parsed) => parsed.id)).toEqual(["r1/review/1"]);
  });

  it("(i) fails on `decision_needed: false`", () => {
    const { rows, problems } = parseLedger(LEDGER, rowWith({ decision_needed: false }));
    expect(problems).toEqual([`${LEDGER}:1: ${DECISION_PROBLEM}`]);
    expect(rows).toEqual([]);
  });

  it("(j) fails on `decision_needed` spelled as the string \"true\"", () => {
    const { rows, problems } = parseLedger(LEDGER, rowWith({ decision_needed: "true" }));
    expect(problems).toEqual([`${LEDGER}:1: ${DECISION_PROBLEM}`]);
    expect(rows).toEqual([]);
  });

  it("(k) fails on a report under another run's reports/ folder", () => {
    const { problems } = parseLedger(LEDGER, rowWith({ report: ".stamity/runs/other/reports/x.md" }));
    expect(problems).toEqual([`${LEDGER}:1: ${REPORT_PROBLEM}`]);
  });

  it("(l) fails on a report path spelled with a backslash", () => {
    const whole = parseLedger(LEDGER, rowWith({ report: ".stamity\\runs\\fixture\\reports\\x.md" }));
    expect(whole.problems).toEqual([`${LEDGER}:1: ${REPORT_PROBLEM}`]);
    // The separator inside the name is the same defect as the separator between folders.
    const inName = parseLedger(LEDGER, rowWith({ report: ".stamity/runs/fixture/reports\\x.md" }));
    expect(inName.problems).toEqual([`${LEDGER}:1: ${REPORT_PROBLEM}`]);
  });

  it("(m) fails on an empty report path", () => {
    const { problems } = parseLedger(LEDGER, rowWith({ report: "" }));
    expect(problems).toEqual([`${LEDGER}:1: ${REPORT_PROBLEM}`]);
  });

  it("fails on a report that is not a markdown file directly inside reports/", () => {
    // A nested folder, a non-markdown name, a bare folder and a non-string value
    // are each outside `<run dir>/reports/<name>.md`.
    for (const report of [
      ".stamity/runs/fixture/reports/nested/x.md",
      ".stamity/runs/fixture/reports/x.txt",
      ".stamity/runs/fixture/reports/",
      ".stamity/runs/fixture/x.md",
      42,
    ]) {
      expect(parseLedger(LEDGER, rowWith({ report })).problems, String(report)).toEqual([
        `${LEDGER}:1: ${REPORT_PROBLEM}`,
      ]);
    }
  });

  it("parses a legacy row carrying neither field exactly as before", () => {
    const { rows, problems } = parseLedger(LEDGER, row({ id: "r1/build/9" }));
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { id: "r1/build/9", severity: "Minor", state: "fixed", rationale: "", retired: null },
    ]);
  });

  it("parses a row carrying `retired` and `report` together", () => {
    const text = rowWith({
      state: "deferred",
      rationale: "belongs to the next unit",
      retired: "2026-09-23 scheduled to the next package, owner: the maintainer",
      report: REPORT,
    });
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    expect(rows[0]?.retired).toBe("2026-09-23 scheduled to the next package, owner: the maintainer");
  });
});

/**
 * `git check-ignore -q <path>`'s exit code: 0 when the path is ignored, 1 when it
 * is not. `execFileSync` throws on any non-zero exit, so the 1 arrives as the
 * thrown error's `status`; anything without a numeric status (git missing, a
 * spawn failure) is rethrown rather than read as "not ignored".
 */
const checkIgnoreStatus = (relPath: string): number => {
  try {
    execFileSync("git", ["check-ignore", "-q", "--", relPath], { cwd: REPO_ROOT, stdio: "ignore" });
    return 0;
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
    throw error;
  }
};

describe("the reports folder", () => {
  // A run's full role reports stay local (C1): the ledger row carries the path,
  // and the ledger is the durable record. The ledger itself must stay tracked,
  // so the ignore rule is proven on both sides.
  it("is ignored by git, with the ledger's lock and temp names beside it", () => {
    expect(checkIgnoreStatus(".stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md")).toBe(0);
    expect(checkIgnoreStatus(".stamity/runs/2026-09-23_demo/ledger.jsonl.lock")).toBe(0);
    expect(checkIgnoreStatus(".stamity/runs/2026-09-23_demo/ledger.jsonl.tmp.a1b2c3d4")).toBe(0);
  });

  it("leaves the ledger and the run record tracked", () => {
    expect(checkIgnoreStatus(".stamity/runs/2026-09-23_demo/ledger.jsonl")).toBe(1);
    expect(checkIgnoreStatus(".stamity/runs/2026-09-23_demo/record.md")).toBe(1);
  });
});
