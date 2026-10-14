import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDisposition, SCHEDULE_RULE_FROM } from "../../src/runs/disposition.ts";
import { INBOX_PATH, parseInbox, SCHEDULE_RULE_HEADING } from "../../src/runs/inboxStore.ts";
import { LEDGER_SUFFIX, parseLedger, type LedgerRow } from "../support/ledgerGrammar.ts";
import {
  duplicateIds,
  IN_PROGRESS_STATUS,
  LEGACY_CLOSED_LEDGERS,
  LEGACY_INFO_LEDGERS,
  openRowLabels,
  partitionByRunStatus,
  recordGates,
  type RunLedger,
  unaccountedDeferrals,
} from "../support/recordGates.ts";

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
 * The checks are PURE FUNCTIONS over `(ledgerText, inboxText)`, kept in
 * `test/support/recordGates.ts`, and the tree is one caller among several: the
 * fixture cases in `test/runs/ledgerGates.test.ts` drive the same functions with
 * hand-built text, so a green run proves the gate can fail as well as that the
 * tree passes. Ledger paths are displayed POSIX (git's own spelling) and
 * composed with `node:path` for the read, so the suite holds on Windows.
 *
 * This file reads the records on disk, so it is part of the records suite
 * (`npm run test:records`, `vitest.records.config.ts`), which `npm test` does not
 * run (2026-10-14, unit r1-records-suite, REQ-PROVE-025). The ledgers are found
 * on disk, not through `git ls-files`, so a restored copy is checked the same as
 * a tracked one.
 *
 * The row grammar itself — the fields, the vocabularies and `parseLedger` —
 * lives in `test/support/ledgerGrammar.ts`, so the `ledger append` suite holds
 * the bytes it writes to this same parser. The inbox's row grammar — `parseInbox`
 * and the `Ref:` rule — lives in `src/runs/inboxStore.ts`, so `stamity ledger
 * inbox` and this gate read one grammar.
 */

/** Repo root, resolved from this file rather than from the process cwd. */
const REPO_ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));

const { renderProblem, inboxRefs, retiredProblems } = recordGates({
  parseInbox,
  parseDisposition,
  SCHEDULE_RULE_FROM,
  INBOX_PATH,
});

/** A run folder's record, read for its status line. */
const RECORD_FILE = "record.md";

/**
 * Every `ledger.jsonl` on disk under `.stamity/runs/`, one per run folder,
 * POSIX-spelled and sorted, with the folder's `record.md` text (`null` when it has none).
 *
 * TEST CHANGE, justified (2026-10-14, unit r1-records-suite, REQ-PROVE-025): this
 * replaces `trackedLedgers`, which asked `git ls-files`; the records are restored
 * into a checkout rather than tracked by it, so the gate reads what is on disk.
 * Every ledger git tracked is on disk, so no ledger leaves the check.
 *
 * TEST CHANGE, justified (2026-10-14, unit r1-records-suite, review round 1, ledger
 * review/3, sign-off S20): reading from disk also reached the runs still in progress,
 * whose write-ahead `open` rows are legal until their close, so the gate went red on
 * a legal state. `partitionByRunStatus` (`test/support/recordGates.ts`) leaves those
 * runs out, with one printed line each; every closed run is held as before.
 */
const ledgersOnDisk = (): RunLedger[] => {
  const runs = join(REPO_ROOT, ".stamity", "runs");
  if (!existsSync(runs)) return [];
  return readdirSync(runs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(runs, entry.name, LEDGER_SUFFIX)))
    .map((entry) => {
      const record = join(runs, entry.name, RECORD_FILE);
      return {
        ledgerPath: join(".stamity", "runs", entry.name, LEDGER_SUFFIX).replaceAll("\\", "/"),
        recordText: existsSync(record) ? readFileSync(record, "utf8") : null,
      };
    })
    .toSorted((a, b) => (a.ledgerPath < b.ledgerPath ? -1 : a.ledgerPath > b.ledgerPath ? 1 : 0));
};

const readRepoFile = (relPath: string): string =>
  readFileSync(join(REPO_ROOT, ...relPath.split("/")), "utf8");

const { checked: LEDGERS, inProgress: IN_PROGRESS } = partitionByRunStatus(ledgersOnDisk());
for (const path of IN_PROGRESS) {
  console.info(`records gate — skipped, its run is still in progress (${IN_PROGRESS_STATUS}): ${path}`);
}
const IN_PROGRESS_SET = new Set(IN_PROGRESS);
const INBOX_TEXT = existsSync(join(REPO_ROOT, ...INBOX_PATH.split("/")))
  ? readRepoFile(INBOX_PATH)
  : "";
const REFS = inboxRefs(INBOX_TEXT);
const PARSED = new Map(LEDGERS.map((path) => [path, parseLedger(path, readRepoFile(path))]));

describe("committed run ledgers", () => {
  it("finds the ledgers to check", () => {
    // The gate is vacuous the moment the enumeration stops matching, and a
    // vacuous gate over records nobody else reads is indistinguishable from a
    // clean tree. Any closed run directory on disk means at least one ledger.
    expect(
      LEDGERS.length,
      "no closed run's ledger.jsonl found on disk under .stamity/runs/; run `node scripts/records.mjs restore`",
    ).toBeGreaterThan(0);
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
        // A `Ref:` into a run still in progress does not resolve: that ledger is not published
        // until its close (ledger review/3, sign-off S20).
        dangling.push(
          IN_PROGRESS_SET.has(path)
            ? `${ref} — its run is still in progress (${IN_PROGRESS_STATUS}), so its ledger is not published yet`
            : `${ref} — no ledger found on disk at that path; run \`node scripts/records.mjs restore\``,
        );
        continue;
      }
      if (!parsed.rows.some((row) => row.id === anchor)) dangling.push(`${ref} — no row with that id`);
    }
    expect(dangling, `${dangling.length} inbox Ref(s) naming no ledger row`).toEqual([]);
  });
});
