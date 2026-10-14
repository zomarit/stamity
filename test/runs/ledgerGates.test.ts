import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDisposition, SCHEDULE_RULE_FROM } from "../../src/runs/disposition.ts";
import {
  INBOX_PATH,
  INBOX_SEVERITIES,
  parseInbox,
  SCHEDULE_RULE_HEADING,
} from "../../src/runs/inboxStore.ts";
import { lazyCleanup } from "../support/lazyCleanup.ts";
import { SEVERITIES, parseLedger } from "../support/ledgerGrammar.ts";
import {
  duplicateIds,
  openRowLabels,
  partitionByRunStatus,
  recordGates,
  STATUS_HEAD_LINES,
  unaccountedDeferrals,
} from "../support/recordGates.ts";

/**
 * The records gate's fixture cases: the pure checks of `test/support/recordGates.ts`,
 * driven with hand-built ledger and inbox text, so a green run proves the gate
 * can fail as well as that the tree passes; the tree cases themselves are the
 * records suite's (`test/records/ledgers.test.ts`, `npm run test:records`).
 *
 * TEST CHANGE, justified (2026-10-14, unit r1-records-suite, REQ-PROVE-025): every
 * case below moved here from `test/records/ledgers.test.ts` under its own name,
 * its body unchanged, so `npm test` runs them in a checkout that carries no
 * record. The two reports-folder cases now ask a scratch repository holding this
 * checkout's `.gitignore` alone, so a local exclude block (`.git/info/exclude`)
 * cannot flip their answer.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const { renderProblem, inboxRefs, retiredProblems } = recordGates({
  parseInbox,
  parseDisposition,
  SCHEDULE_RULE_FROM,
  INBOX_PATH,
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
      // review/44: filler words alone, with no vague word among them.
      retiredAs(26, "2026-10-10 cut not yet"),
      retiredAs(27, "2026-10-10 scheduled board #42 · when at some point"),
    ].join("\n");
    const { rows, problems } = parseLedger(LEDGER, text);
    expect(problems).toEqual([]);
    const named = retiredProblems(LEDGER, rows);
    expect(named.map((problem) => problem.slice(0, problem.indexOf(": ")))).toEqual(
      [20, 21, 22, 23, 24, 26, 27].map((n) => `${LEDGER}#r1/prove/${n}`),
    );
    expect(named[0]).toContain("`fixed` names only the vague word `later`");
    expect(named[1]).toContain("`cut` names only the vague word `tbd`");
    expect(named[2]).toContain("vague trigger `later`");
    expect(named[3]).toContain("`when` names no trigger");
    expect(named[4]).toContain("`fixed` names no ref");
    expect(named[5]).toContain("`cut` names only filler words (`not yet`)");
    expect(named[6]).toContain("vague trigger `at some point`");
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

// ADDED 2026-10-14 (unit r1-records-suite, review round 1, ledger review/3, sign-off S20): a run whose
// record still reads `Status: in progress` holds legal write-ahead `open` rows and is not published
// until its close, so the records gate leaves its ledger out; every other run is held as before.
describe("fixtures — a run still in progress is left out of the gate", () => {
  const OPEN_ROW = row({ id: "r1/prove/2", state: "open", rationale: "" });
  const RUNNING = ".stamity/runs/2026-10-14_running/ledger.jsonl";
  const CLOSED = ".stamity/runs/2026-10-14_closed/ledger.jsonl";
  const UNMARKED = ".stamity/runs/2026-10-14_unmarked/ledger.jsonl";
  const openIn = (ledgers: readonly string[]): string[] =>
    ledgers.flatMap((path) => openRowLabels(path, parseLedger(path, OPEN_ROW).rows));

  it("skips an in-progress run's ledger, so its write-ahead `open` row is not reported", () => {
    const { checked, inProgress } = partitionByRunStatus([
      { ledgerPath: RUNNING, recordText: "# Run record\n\nStatus: in progress\n\n## Entries\n" },
    ]);
    expect(inProgress).toEqual([RUNNING]);
    expect(checked).toEqual([]);
    expect(openIn(checked)).toEqual([]);
  });

  it("still fails a closed run's ledger that left a row `open`", () => {
    const { checked, inProgress } = partitionByRunStatus([
      { ledgerPath: RUNNING, recordText: "# Run record\n\nStatus: in progress\n" },
      { ledgerPath: CLOSED, recordText: "# Run record\n\nStatus: closed 2026-10-14\n" },
    ]);
    expect(inProgress).toEqual([RUNNING]);
    expect(openIn(checked)).toEqual([`${CLOSED}#r1/prove/2`]);
  });

  it("treats a record with no `Status:` line, or no record, as closed", () => {
    const missing = ".stamity/runs/2026-10-14_no-record/ledger.jsonl";
    const { checked, inProgress } = partitionByRunStatus([
      { ledgerPath: UNMARKED, recordText: "# Run record\n\nOpened 2026-10-14; still running.\n" },
      { ledgerPath: missing, recordText: null },
    ]);
    expect(inProgress).toEqual([]);
    expect(openIn(checked)).toEqual([`${UNMARKED}#r1/prove/2`, `${missing}#r1/prove/2`]);
  });

  it("reads the status only from the record's head, and only as the whole line", () => {
    const late = `${"line\n".repeat(STATUS_HEAD_LINES)}Status: in progress\n`;
    const { checked, inProgress } = partitionByRunStatus([
      { ledgerPath: CLOSED, recordText: late },
      { ledgerPath: UNMARKED, recordText: "Status: in progress, then closed 2026-10-14\n" },
      { ledgerPath: RUNNING, recordText: `${"line\n".repeat(STATUS_HEAD_LINES - 1)}Status: in progress\r\n` },
    ]);
    expect(checked).toEqual([CLOSED, UNMARKED]);
    expect(inProgress).toEqual([RUNNING]);
  });
});

/**
 * A scratch repository holding this checkout's `.gitignore` and nothing else
 * that ignores a path: no template (so no `info/exclude`) and, at each call, an
 * absent `core.excludesFile`, so neither a local exclude block nor a
 * contributor's global excludes reach the answer.
 */
let ignoreRepo = "";

/**
 * `git check-ignore -q <path>`'s exit code: 0 when the path is ignored, 1 when it
 * is not. `execFileSync` throws on any non-zero exit, so the 1 arrives as the
 * thrown error's `status`; anything without a numeric status (git missing, a
 * spawn failure) is rethrown rather than read as "not ignored".
 */
const checkIgnoreStatus = (relPath: string): number => {
  try {
    execFileSync(
      "git",
      ["-C", ignoreRepo, "-c", `core.excludesFile=${join(ignoreRepo, "no-excludes")}`, "check-ignore", "-q", "--no-index", "--", relPath],
      { stdio: "ignore" },
    );
    return 0;
  } catch (error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
    throw error;
  }
};

describe("the reports folder", () => {
  beforeAll(() => {
    ignoreRepo = realpathSync(mkdtempSync(join(tmpdir(), "ledger-gates-ignore-")));
    execFileSync("git", ["init", "-q", "--template=", ignoreRepo], { stdio: "ignore" });
    writeFileSync(join(ignoreRepo, ".gitignore"), readFileSync(join(REPO_ROOT, ".gitignore"), "utf8"));
  });
  afterAll(() => lazyCleanup(ignoreRepo));

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
