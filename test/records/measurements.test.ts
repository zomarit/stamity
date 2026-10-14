import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  MEASUREMENTS_DOC_PATH,
  MEASUREMENTS_REGENERATE_COMMAND,
  MEASUREMENT_SNAPSHOT_PATH,
  MERGE_READY_RULE,
  REACH_SNAPSHOT_PATH,
  RECORDS_BLOB_URL,
  RUNS_DIR,
  RUN_OF_RECORD_FILE,
  compositionOf,
  computeMergeReadyRate,
  failingCases,
  measurementMethod,
  priorCompleteRun,
  readMeasurementSnapshot,
  readReachSnapshot,
  readRunOfRecord,
  renderMeasurements,
  runOfRecordReason,
  runOfRecordVerdict,
  runStatus,
  thresholdMiss,
  unmetMetrics,
  writeMeasurementSnapshot,
  type ExcludedRun,
  type MergeReadyReport,
  type RunOfRecord,
  type RunOfRecordException,
} from "../../src/cli/docs/measurements.ts";
import { LLMS_INDEX_SECTIONS } from "../../src/cli/docs/llmsIndex.ts";
import type * as SharedPaths from "../../src/shared/paths.ts";
import { EngineError } from "../../src/types/errors.ts";

/**
 * The measurements page held to the records it renders from (REQ-PROVE-020, REQ-PROVE-025).
 *
 * TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): every case in
 * this file moved here from `test/cli/docs/measurements.test.ts` under its own name and describe.
 * Each one states a fact about a real record — the committed page against the run of record, the
 * pinned merge-ready snapshot, the reach snapshot and the eval runs' own results files, and the
 * merge-ready computation over this repository's `.stamity/runs/` — and those records live on the
 * `records` branch, so the cases run in the records suite (`npm run test:records`) and `npm test`
 * runs none of them. The renderer's logic, which only borrowed a record as input, stays in
 * `test/cli/docs/measurements.test.ts` over synthetic inputs.
 *
 * The bodies are the ones they had there, with three kinds of edit, each marked at its case: a
 * scratch root's snapshot is written at the pinned date, since the page reads
 * `MEASUREMENT_SNAPSHOT_PATH` and no longer the newest file; a link into a record is expected in
 * the absolute `records` branch form (`RECORDS_BLOB_URL`), and a link into a `main` path stays
 * relative; and the module paths of one dynamic import are this file's.
 */

/** The date `MEASUREMENT_SNAPSHOT_PATH` pins, the one a scratch root's snapshot is written at. */
const PINNED_DATE = /merge-ready-(\d{4}-\d{2}-\d{2})\.json$/.exec(MEASUREMENT_SNAPSHOT_PATH)?.[1] ?? "";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The tree's run of record, its release and its exception, read from `evals/run-of-record.json`
 * the way the generator reads them.
 *
 * TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record, review round 1 (M-1). These were
 * imported as three module constants the generator read when it loaded, so a malformed file broke
 * every importer, the docs index and the merge-ready script among them, before any of them asked
 * for the run of record. The generator now reads the file only when a page or a verdict needs it,
 * and the suite reads it here under the same names, so every case below asserts what it did.
 */
const {
  path: RUN_OF_RECORD_PATH,
  release: RUN_OF_RECORD_RELEASE,
  exception: RUN_OF_RECORD_EXCEPTION,
} = readRunOfRecord(REPO_ROOT);
const SCRIPT_PATH = join(REPO_ROOT, "scripts/generate-docs.mjs");
const RATE_SCRIPT_PATH = join(REPO_ROOT, "scripts/merge-ready-rate.mjs");

const STALE_MESSAGE =
  `${MEASUREMENTS_DOC_PATH} is stale — the render no longer matches the committed page. ` +
  `Regenerate it with \`${MEASUREMENTS_REGENERATE_COMMAND}\` and commit the diff. The page is ` +
  `rendered from committed artifacts, so a new run record makes it stale the same way a code ` +
  `change makes the CLI reference stale.`;

const committedPage = (): string => readFileSync(join(REPO_ROOT, MEASUREMENTS_DOC_PATH), "utf-8");

/** A record body with every clause satisfied, parameterised where a case needs it. */
function record(options: {
  readonly gates?: string;
  readonly verdict?: string;
  readonly merge?: string;
}): string {
  const gates = options.gates ?? "| Final authoritative | pass | pass | pass — 120 passed |";
  const verdict = options.verdict ?? "| 2 | approve | high / 0.90 | none in scope |";
  return [
    "# A run",
    "",
    options.merge ?? "",
    "",
    "## Proof block",
    "",
    "### Gate results",
    "",
    "| Pass | lint | typecheck | test |",
    "|---|---|---|---|",
    gates,
    "",
    "### Review verdicts, per round",
    "",
    "| Round | Verdict | Confidence | Findings |",
    "|---|---|---|---|",
    "| 1 | request-changes | high / 0.85 | two warnings |",
    verdict,
    "",
    "## Next",
    "",
    "Nothing deferred.",
    "",
  ].join("\n");
}

/** A closed ledger — the run-exit invariant every record is supposed to leave behind. */
const CLOSED_LEDGER = `${JSON.stringify({ id: "r/prove/1", state: "fixed" })}\n`;

/**
 * A tree with one changelog and the runs a case needs.
 *
 * Fixtures, not mocks: the module reads a directory of markdown and a
 * changelog, and a temporary directory IS that dependency — there is nothing
 * to fake.
 */
function fixture(runs: Record<string, Record<string, string>>): string {
  const root = mkdtempSync(join(tmpdir(), "stamity-measure-"));
  writeFileSync(
    join(root, "CHANGELOG.md"),
    [
      "# Changelog",
      "",
      "## [Unreleased]",
      "",
      "- Pull request #99 is named here, above every released heading.",
      "",
      "## [2.0.0] - 2026-01-09",
      "",
      "- Landed through pull request #42, which this line names on purpose.",
      "",
      "## [1.0.0] - 2026-01-01",
      "",
      "- Initial release. Pull request #7 is named only in this released section.",
      "",
    ].join("\n"),
  );
  for (const [run, files] of Object.entries(runs)) {
    for (const [name, body] of Object.entries(files)) {
      const target = join(root, RUNS_DIR, run, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
    }
  }
  return root;
}

/** The three lists, flattened to the run ids they name. */
function listed(report: MergeReadyReport): string[] {
  return [
    ...report.numerator.map((entry) => entry.run),
    ...report.denominator.map((entry) => entry.run),
    ...report.excluded.map((entry) => entry.run),
  ];
}

/** A run's directory id, read off the `evals/runs/<id>/RESULTS.md` path that points at it. */
function runId(path: string): string {
  return path.split("/").at(-2) ?? "";
}

/** The run number a directory id ends with: `2026-09-15-run-30` is `30`. */
function runNumber(id: string): string {
  return /-run-(\d+)$/.exec(id)?.[1] ?? "";
}

/**
 * One `## ` section of a results file, heading excluded, or `""` when it carries none.
 *
 * Absence is a value here rather than a throw: "this run has no composition section" is
 * precisely what identifies a complete run, so the caller asserts on it.
 */
function resultsSection(results: string, heading: string): string {
  const start = results.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const body = results.slice(start + heading.length + 5);
  const end = body.indexOf("\n## ");
  return end === -1 ? body : body.slice(0, end);
}

/** A run's own results file, read by the directory id the artifacts name it with. */
function readResults(id: string): string {
  return readFileSync(join(REPO_ROOT, "evals/runs", id, "RESULTS.md"), "utf-8");
}

/**
 * The composition chain from one run back to its baseline: the run, then the prior complete run
 * its artifact names, and so on until a run carries no composition section — that last run is the
 * one measured end to end.
 *
 * The walk has no length limit because the chain's length is a property of the release cadence,
 * not a constant: run 30 was two links from its baseline, run 31 is three. Termination comes from
 * the ids being distinct — a pointer that revisits a run is a broken artifact and throws with the
 * walk it found, which is also what makes a missing prior run readable in the failure.
 */
function compositionChain(
  start: string,
  read: (id: string) => string = readResults,
): readonly string[] {
  const chain: string[] = [start];
  for (;;) {
    // TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut. This walk read the prior-run line with a
    // regex of its own over the `## 0. Composition` section, while test/docsPages.test.ts read the
    // same fact with a second regex over the whole file. The generator now branches on that fact,
    // so all three read it through the one parser it exports; the parser is scoped to the same
    // section this walk was, so the walk finds the same chain.
    const prior = priorCompleteRun(read(chain.at(-1) ?? ""));
    if (prior === null) return chain;
    if (chain.includes(prior)) {
      throw new Error(`the composition chain revisits ${prior}: ${chain.join(" -> ")}`);
    }
    chain.push(prior);
  }
}

/**
 * What the page must say when its run of record is a full run — ADDED 2026-10-01, the 1.11.0 cut,
 * a shape 1.11.0 did not end up publishing: run 39 composed with run 38.
 *
 * The chain is the run alone, the results file carries no composition section, and the page says
 * the run is a full baseline that measured every case in full in place of the composition
 * paragraph — no claim of composition, re-measuring, carrying, or a FAIL baseline survives.
 *
 * TEST CHANGE, justified: 2026-10-11, the 1.14.0 cut, the review of unit c7-run-of-record (W-1).
 * The page now quotes the run of record's own § 3, "Why the run happened", and a full run's reason
 * may use these words truthfully: run 38's reads "the full re-measure" and run 9's "re-measure".
 * Read over the whole page, the claim list would have failed a true page for either. The quote is
 * the file's own text under a line that names the file, not a claim the page makes, so the claims
 * are looked for on the lines the page words itself: every line but the quoted ones. No claim left
 * the list, and "refuses a composition claim the page words itself, and admits one a full run's
 * own reason states" holds both halves on run 38's real export.
 */
function expectFullRunOfRecord(results: string, page: string, chain: readonly string[]): void {
  const run = chain[0] ?? "";
  const found = chain.join(" -> ");
  expect(chain, `a full run of record composes with nothing, yet its chain is ${found}`).toEqual([
    run,
  ]);
  expect(
    resultsSection(results, "0. Composition"),
    `${run} names no prior complete run yet carries a composition section`,
  ).toBe("");
  expect(page, "the page does not call its full run of record a full baseline").toContain(
    "That run is a full baseline: its results file names no prior complete run",
  );
  expect(page, `the page does not say run ${runNumber(run)} measured every case`).toContain(
    `Run ${runNumber(run)} measured every case in full on its own candidate.`,
  );
  const worded = page
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n");
  for (const claim of [
    "composed",
    "incremental rule",
    "re-measure",
    "carries the rest",
    "carried the rest",
    "alone was FAIL",
  ]) {
    expect(worded, `the page makes a composition claim ("${claim}") for a full run`).not.toContain(
      claim,
    );
  }
}

/**
 * Place a results file at the run of record's path under a fixture root, beside the committed reach
 * artifact, so `renderMeasurements(root)` has every input it reads. Fixtures, not mocks: the
 * renderer reads files, and a temporary directory holding them is that dependency.
 *
 * TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut. The composed paragraph is now derived from the
 * prior complete run's results file as well (its status and failing cases), read under the same
 * root, so a composed fixture also carries the prior run its composition section names — the real
 * one from this tree. Fixture setup only: no assertion of a caller moved.
 *
 * TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record. The renderer reads which run is of
 * record, its release and its exception from `evals/run-of-record.json` under the root it renders,
 * so the fixture writes that file too and places the results file at the path it names: the tree's
 * run of record by default, or the run a case names. The exception defaults to `null` beside a PASS
 * and to a test exception keyed to the path beside any other status, the one shape the renderer
 * accepts for each. Fixture setup only: no assertion of a caller moved.
 */
function placeRenderInputs(root: string, results: string, ofRecord: Partial<RunOfRecord> = {}): void {
  mkdirSync(dirname(join(root, REACH_SNAPSHOT_PATH)), { recursive: true });
  writeFileSync(
    join(root, REACH_SNAPSHOT_PATH),
    readFileSync(join(REPO_ROOT, REACH_SNAPSHOT_PATH), "utf-8"),
  );
  const path = ofRecord.path ?? RUN_OF_RECORD_PATH;
  const exception =
    ofRecord.exception !== undefined
      ? ofRecord.exception
      : runStatus(results) === "PASS"
        ? null
        : { run: path, text: "A test exception for the fixture's run of record." };
  placeRunOfRecord(root, { path, release: ofRecord.release ?? RUN_OF_RECORD_RELEASE, exception });
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), results);
  const prior = priorCompleteRun(results);
  if (prior !== null) placeResults(root, prior, readResults(prior));
}

/** Write `evals/run-of-record.json` under a fixture root, as the tree's file is laid out. */
function placeRunOfRecord(root: string, body: unknown): void {
  mkdirSync(dirname(join(root, RUN_OF_RECORD_FILE)), { recursive: true });
  writeFileSync(
    join(root, RUN_OF_RECORD_FILE),
    typeof body === "string" ? body : `${JSON.stringify(body, null, 2)}\n`,
  );
}

/** Write a results file at `evals/runs/<id>/RESULTS.md` under a fixture root. */
function placeResults(root: string, id: string, results: string): void {
  const path = join(root, "evals/runs", id, "RESULTS.md");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, results);
}

/** The per-metric score table's body rows, each as its trimmed cells. */
function metricRows(results: string): readonly (readonly string[])[] {
  return resultsSection(results, "5. Per-metric scores beside their declared thresholds")
    .split("\n")
    .filter((line) => line.trimStart().startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells.length === 4 && cells[0] !== "Metric" && !/^-+$/.test(cells[0] ?? ""));
}

describe("renderMeasurements — drift gate", () => {
  it("byte-matches the committed page", () => {
    expect(STALE_MESSAGE).toContain(MEASUREMENTS_REGENERATE_COMMAND);
    expect(renderMeasurements(), STALE_MESSAGE).toBe(committedPage());
  });
});

describe("the reach proxy is labelled as one", () => {
  it("agrees with the registry's own week window, which is the snapshot's self-check", () => {
    // The daily series and the last-week point are two separate responses. Their
    // overlap has to add up, or one of them was transcribed wrong.
    const snapshot = readReachSnapshot();
    const week = snapshot.daily.downloads.filter(
      (row) => row.day >= snapshot.lastWeek.start && row.day <= snapshot.lastWeek.end,
    );
    expect(week.length).toBe(7);
    expect(week.reduce((sum, row) => sum + row.downloads, 0)).toBe(snapshot.lastWeek.downloads);
  });
});

describe("the restated figures are held to the artifacts they come from", () => {
  /**
   * TEST CHANGE, justified: the four figures were typed here as literals of run 24's
   * results file, and the run of record moved to run 30 — the 1.8.0 release run. A
   * retyped literal list would have had to move again at the next release, and a
   * transcription is exactly what this describe block exists to refuse. The figures
   * are now DERIVED from the run's own `## 5. Per-metric scores` table, and each is
   * held to the page beside the metric it belongs to rather than on its own.
   *
   * Strictly stronger in three ways: the metric NAMES are pinned as a list, so a
   * metric dropped from the table no longer passes by vacuum; the page must restate
   * `<metric> <score>` as a pair, so a score landing under the wrong metric fails;
   * and the score cell's shape is asserted, so a row whose count cell went missing
   * cannot be restated as an empty string the page trivially contains.
   */
  it("quotes the run of record's four metric scores as that run's results file states them", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    const page = renderMeasurements();

    // Section 5 only. A composed run carries `## 0. Composition` with tables of its own
    // (re-measured cases, carried cases), and reading "the tables in this file" would pick
    // those up; the section heading is what selects the one table that states the scores.
    const rows = metricRows(results);
    expect(rows.map((cells) => cells[0])).toEqual([
      "Golden rubric pass rate",
      "Adversarial guardrail hold rate",
      "Benign-twin false-refusal rate",
      "Trigger-probe accuracy",
    ]);

    for (const [metric, score] of rows.map((cells) => [cells[0] ?? "", cells[1] ?? ""])) {
      expect(score, `${RUN_OF_RECORD_PATH} states no score and count for ${metric}`).toMatch(
        /^\*\*[01]\.\d{3}\*\* \(\d+\/\d+\)$/,
      );
      expect(page, `the page does not restate ${metric} as ${score}`).toContain(
        `${metric} ${score}`,
      );
    }

    // ADDED 2026-10-08 (review W-1): each metric line states its § 5 row's "NOT met" with the
    // declared threshold, and a met row's line states none. Every metric unmetMetrics names is
    // one of those rows, so no miss the composed disclosure would name is bare here.
    for (const [metric, , threshold, result] of rows) {
      const line = page.split("\n").find((text) => text.startsWith(`- ${metric} `)) ?? "";
      if (/\bNOT met\b/.test(result ?? "")) {
        expect(line, `the page shows ${metric} with no NOT met`).toContain(`NOT met (threshold ${threshold})`);
      } else {
        expect(line, `the page says ${metric} missed a threshold its row meets`).not.toContain("NOT met");
      }
    }
    for (const metric of unmetMetrics(results)) {
      expect(rows.map((cells) => cells[0]), `${metric} reads NOT met outside the four rows`).toContain(metric);
    }

    // The floor count lives in the golden row's result cell, not in its score cell.
    //
    // TEST CHANGE, justified: 2026-10-08, the 1.12.0 cut. The pin demanded "every floor case
    // passed, N/M." of every run of record, so a FAIL run with a failing floor could pass only by
    // printing that false sentence. The maintainer's 2026-10-08 answer "Ship with exception" makes
    // run 43, FAIL on one ungraded floor sample, the 1.12.0 run of record, so the pin is now
    // status-aware and no weaker: a PASS run still requires "every floor case passed, N/N." with
    // N/N complete; a FAIL run requires its golden line to state the floor count and every failing
    // floor id, both read off the results file's section 5, and forbids the all-passed sentence
    // whenever a floor case failed.
    const floors = /floors (\d+\/\d+)/.exec(rows[0]?.[3] ?? "")?.[1];
    expect(floors, `${RUN_OF_RECORD_PATH} states no floor count for the golden rate`).toBeDefined();
    const failingFloors = failingCases(results)
      .filter(({ kind }) => kind === "floor")
      .flatMap(({ ids }) => ids);
    if (runStatus(results) === "PASS") {
      const [passed, total] = (floors ?? "").split("/");
      expect(passed, `${RUN_OF_RECORD_PATH} is PASS with floors ${floors}`).toBe(total);
      expect(page).toContain(`every floor case passed, ${floors}.`);
    } else {
      const golden = page.split("\n").find((line) => line.startsWith("- Golden rubric pass rate")) ?? "";
      expect(golden, "the page states no golden-rate line").not.toBe("");
      expect(golden, `the golden line does not state floors ${floors}`).toContain(`${floors}`);
      for (const id of failingFloors) {
        expect(golden, `the golden line does not name the failing floor case ${id}`).toContain(
          `\`${id}\``,
        );
      }
      if (failingFloors.length > 0) {
        expect(golden, "the golden line says every floor passed while one failed").not.toContain(
          "every floor case passed",
        );
      }
    }

    // TEST CHANGE, justified: the four scores were derived from the artifact while the headline
    // verdict beside them — the page's "PASS" — was a literal nothing read. A run whose status
    // moved to FAIL would have left the page calling it a pass with four scores that still
    // matched their rows. The artifact's own status line is what the word is held to now.
    //
    // TEST CHANGE, justified: the derivation stopped one step short — the artifact was matched
    // against the literal `PASS`, so a run whose status moved failed HERE rather than at the
    // page, and the page's own word stayed a transcription. The status is now read out of the
    // artifact and interpolated, the way the metric scores above are.
    //
    // TEST CHANGE, justified: 2026-10-11, the 1.14.0 cut, the review of unit c7-run-of-record (W-1).
    // The pin read "<status>, three samples per case." of every run of record, so a composed PASS,
    // whose full run behind it may be FAIL, stood on the page as a bare "PASS". The generator now
    // words a composed PASS "PASS as composed", and the pin follows it: the status is still read out
    // of the artifact, "composed" is read through the generator's own parser, and the pin is
    // anchored to the start of the page's line, so neither wording can pass for the other.
    const status = /^Status: \*\*(\w+)\*\*$/m.exec(results)?.[1];
    expect(status, `${RUN_OF_RECORD_PATH} states no status`).toBeDefined();
    const verdict = status === "PASS" && priorCompleteRun(results) !== null ? "PASS as composed" : status;
    expect(page, `the page does not state the run's status (${verdict}) beside its scores`).toContain(
      `\n${verdict}, three samples per case.\n`,
    );
  });

  // ADDED 2026-10-08, the 1.12.0 cut, beside the status-aware pin above: the page's verdict word
  // and its floor clause are read off the results file it renders, never typed. Driven on real
  // exports: run 39 (PASS, floors 23/23) must still render the old sentence, and run 43 (FAIL,
  // floors 22/23 with one failing floor case) must render its status, its count and the failing
  // id, never "every floor case passed". A FAIL run of record is stated beside the recorded
  // exception it shipped under, and refused without one. Fixtures, not mocks: the renderer reads
  // files.
  //
  // TEST CHANGE, justified: 2026-10-08, the 1.12.0 cut's review round 1 (M-1). The case read the
  // module's RUN_OF_RECORD_EXCEPTION and asserted it non-null, so the documented next step — a
  // passing release setting it back to `null` — would have failed it with a misleading message.
  // The render now takes the exception as a parameter: the case passes its own, keyed to the run
  // of record's path, and the module constant is held separately, null or not. No assertion was
  // dropped: the FAIL page still carries the exception after its status, the PASS page still does
  // not, and a FAIL with none is still refused; an exception keyed to another run is now refused
  // too.
  //
  // TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record (inbox row 601's remainder). The PASS
  // render passed the same exception as the FAIL one and asserted the page ignored it; a PASS beside
  // a recorded exception is now refused, so the next passing release must reset the exception or the
  // page does not render. The PASS page is rendered with `null`, the one shape a PASS accepts, and
  // the refusal of a PASS beside the exception is asserted below. Every other assertion is unchanged.
  it("renders the status and the floor line a PASS or a FAIL results file states", () => {
    const exception: RunOfRecordException = {
      run: RUN_OF_RECORD_PATH,
      text: "A test exception for the run of record.",
    };
    const render = (results: string, recorded: RunOfRecordException | null = exception): string => {
      const root = fixture({
        "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      });
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
      // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
      writeMeasurementSnapshot(root, PINNED_DATE);
      placeRenderInputs(root, results);
      try {
        return renderMeasurements(root, recorded);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
    const golden = (page: string): string =>
      page.split("\n").find((line) => line.startsWith("- Golden rubric pass rate")) ?? "";

    expect(() => render(readResults("2026-10-01-run-39"))).toThrow(
      /PASS and an exception is still recorded/,
    );
    // TEST CHANGE, justified: 2026-10-11, the 1.14.0 cut, the review of unit c7-run-of-record (W-1).
    // Run 39 is composed with run 38, so its PASS now reads "PASS as composed"; this pinned the bare
    // "PASS, three samples per case.", which is refused beside it. A full run's bare PASS is held
    // on run 24 in "says PASS as composed of a composed PASS, and the bare status otherwise".
    const passPage = render(readResults("2026-10-01-run-39"), null);
    expect(passPage).toContain("PASS as composed, three samples per case.");
    expect(passPage).not.toContain("PASS, three samples per case.");
    expect(golden(passPage)).toContain("; every floor case passed, 23/23.");

    const failPage = render(readResults("2026-10-08-run-43"));
    expect(failPage).toContain("FAIL, three samples per case.");
    expect(failPage).not.toContain("PASS, three samples per case.");
    expect(failPage).not.toContain("PASS as composed");
    expect(golden(failPage)).toContain("; floors 22/23, failing: `charter-floor-relaxation-refused`.");
    expect(golden(failPage)).not.toContain("every floor case passed");

    // The exception paragraph follows a FAIL only, and a FAIL with no exception is refused.
    expect(failPage).toContain(`FAIL, three samples per case.\n\n${exception.text}\n`);
    expect(passPage).not.toContain(exception.text);
    const failResults = readResults("2026-10-08-run-43");
    const passResults = readResults("2026-10-01-run-39");
    expect(() => runOfRecordVerdict(failResults, null)).toThrow(EngineError);
    expect(() => runOfRecordVerdict(failResults, null)).toThrow(/is FAIL and no exception is recorded/);
    // TEST CHANGE, justified: 2026-10-11 (W-1, as above): run 39's composed PASS, where this
    // pinned the bare one.
    expect(runOfRecordVerdict(passResults, null)).toEqual(["PASS as composed, three samples per case."]);

    // An exception names the run it was recorded for, and is refused beside any other run of
    // record, FAIL or PASS: a release that moves the run leaves no stale exception standing.
    const stale: RunOfRecordException = { run: "evals/runs/2026-01-01-run-1/RESULTS.md", text: "stale" };
    for (const results of [failResults, passResults]) {
      expect(() => runOfRecordVerdict(results, stale, RUN_OF_RECORD_PATH)).toThrow(EngineError);
      expect(() => runOfRecordVerdict(results, stale, RUN_OF_RECORD_PATH)).toThrow(
        /recorded for evals\/runs\/2026-01-01-run-1\/RESULTS\.md/,
      );
    }
    expect(runOfRecordVerdict(failResults, stale, stale.run)).toEqual([
      "FAIL, three samples per case.",
      "",
      "stale",
    ]);
  });

  // ADDED 2026-10-08, the 1.12.0 cut's review round 1 (W-1). The metric lines restated each score
  // with no verdict, so run 43's guardrail hold, 0.944 against "= 1.0, zero break" and "NOT met" in
  // its own § 5, read on the page as a bare figure while the exception named only the floor case.
  // Each line now carries the § 5 row's "NOT met" with its declared threshold, read off the results
  // file; a met row adds nothing, so a PASS run's lines are unchanged.
  //
  // TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record. A PASS beside a recorded exception is
  // now refused (the case above), so the render passes the exception beside the FAIL file only and
  // `null` beside the PASS one. Every assertion is unchanged.
  it("says on each metric line whether that metric missed its declared threshold", () => {
    const exception: RunOfRecordException = { run: RUN_OF_RECORD_PATH, text: "A test exception." };
    const render = (results: string): string => {
      const root = fixture({
        "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      });
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
      // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
      writeMeasurementSnapshot(root, PINNED_DATE);
      placeRenderInputs(root, results);
      try {
        return renderMeasurements(root, runStatus(results) === "PASS" ? null : exception);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
    const metricLine = (page: string, metric: string): string =>
      page.split("\n").find((line) => line.startsWith(`- ${metric} `)) ?? "";

    const failPage = render(readResults("2026-10-08-run-43"));
    expect(metricLine(failPage, "Adversarial guardrail hold rate")).toBe(
      "- Adversarial guardrail hold rate **0.944** (17/18); NOT met (threshold = 1.0, zero break).",
    );
    expect(metricLine(failPage, "Golden rubric pass rate")).toBe(
      "- Golden rubric pass rate **0.967** (59/61); floors 22/23, failing: `charter-floor-relaxation-refused`.",
    );

    // TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record, review round 1 (W-1). This pinned
    // "**0.944** (17/18)" for run 39, whose own § 5 reads "**1.000** (18/18)": the generator typed
    // run 43's four figures whatever results file it rendered, and the pin recorded that output. The
    // figures are now read off the rendered file's § 5 rows, so the pin states run 39's own figure.
    // The assertion it makes, a met row's line carries no "NOT met", is unchanged.
    const passPage = render(readResults("2026-10-01-run-39"));
    expect(metricLine(passPage, "Adversarial guardrail hold rate")).toBe(
      "- Adversarial guardrail hold rate **1.000** (18/18).",
    );
    expect(passPage).not.toContain("NOT met");

    expect(thresholdMiss(readResults("2026-10-08-run-43"), "Adversarial guardrail hold rate")).toBe(
      "; NOT met (threshold = 1.0, zero break)",
    );
    expect(thresholdMiss(readResults("2026-10-08-run-43"), "Benign-twin false-refusal rate")).toBe("");
    expect(() => thresholdMiss(readResults("2026-10-08-run-43"), "No such metric")).toThrow(EngineError);
  });

  // ADDED 2026-10-08, the 1.12.0 cut's review round 1 (W-1, M-1). The tree's own exception, whatever
  // it is: `null` beside a PASS run of record is the documented resting state and passes here; a
  // non-null one is keyed to the run of record, and beside a FAIL its text names every failing floor
  // case and every metric whose § 5 row reads "NOT met", so the paragraph cannot excuse one miss and
  // stay silent on another.
  //
  // TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record (inbox row 601's remainder). A PASS
  // run of record beside a non-null exception returned early here and passed; the generator now
  // refuses that pair, so the early return became the assertion that a run of record carrying an
  // exception is not PASS. Strictly stronger: every pair this case passed before that is still legal
  // passes, and the one it let through now fails.
  it("holds the tree's recorded exception to the run of record and to every miss it excuses", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    if (RUN_OF_RECORD_EXCEPTION === null) {
      expect(runStatus(results), `${RUN_OF_RECORD_PATH} is not PASS and no exception is recorded`).toBe("PASS");
      return;
    }
    expect(RUN_OF_RECORD_EXCEPTION.run).toBe(RUN_OF_RECORD_PATH);
    expect(
      runStatus(results),
      `${RUN_OF_RECORD_PATH} is PASS and ${RUN_OF_RECORD_FILE} still records an exception for it`,
    ).not.toBe("PASS");
    const text = RUN_OF_RECORD_EXCEPTION.text.replace(/\s+/g, " ");
    for (const { ids } of failingCases(results)) {
      for (const id of ids) expect(text, `the exception does not name ${id}`).toContain(`\`${id}\``);
    }
    const missed = metricRows(results)
      .filter((cells) => /\bNOT met\b/.test(cells[3] ?? ""))
      .map((cells) => cells[0] ?? "");
    for (const metric of new Set([...missed, ...unmetMetrics(results)])) {
      expect(text, `the exception does not name the missed ${metric}`).toContain(metric.toLowerCase());
    }
  });

  // TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut. The case was named "says the run of record
  // is composed, and names the runs it was composed from" and demanded a composition section and a
  // chain longer than one of every run of record. Run 38 was expected to be the 1.11.0 run of
  // record as a full baseline (the client moved to a new version, a new configuration), and its
  // RESULTS.md names no prior complete run, as run 34's does not; run 39, composed with it, is the
  // run of record. The case now branches on the generator's own
  // parser: a composed run of record keeps every assertion below unchanged (the
  // scoring-rule check moved above the branch, since it holds for both kinds); a full one is held
  // by expectFullRunOfRecord, which "a full run of record" below exercises today on run 34's real
  // RESULTS.md, written before run 38 existed.
  it("says how the run of record was measured: composed from the runs it names, or in full", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    const page = renderMeasurements();

    // TEST CHANGE, justified: the page named SET-v7 alone while the artifact heads its score
    // column "Score (SET-v6 rule)" over the SET-v7 set — two version numbers doing two different
    // jobs, and the page carried only one of them. The scoring rule is read out of the score
    // table's header rather than typed, so the next set or rule bump moves the page or fails here.
    const scoringRule = /\| Metric \| Score \((SET-v\d+) rule\) \|/.exec(results)?.[1];
    expect(scoringRule, `${RUN_OF_RECORD_PATH} heads its score table with no scoring rule`)
      .toBeDefined();
    expect(page, `the page does not name ${scoringRule} as the scoring rule`).toContain(
      `The scoring rule is ${scoringRule}`,
    );

    if (priorCompleteRun(results) === null) {
      expectFullRunOfRecord(results, page, compositionChain(runId(RUN_OF_RECORD_PATH)));
      return;
    }

    // A composed run scores the whole set from samples some of which were carried from an
    // earlier run rather than measured again. The page says so, because "PASS, three samples
    // per case" over 102 cases otherwise reads as 306 fresh measurements on this candidate.
    const composition = resultsSection(results, "0. Composition");
    expect(composition, `${RUN_OF_RECORD_PATH} carries no composition section`).toContain(
      "incremental rule",
    );
    expect(page).toContain("SET-v7's incremental rule");
    expect(page).toContain("composed");

    // TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut (review W-3). This walked the chain to its
    // terminus and matched `runs? ([\d, and]+) re-measured`, a sentence naming two or more
    // incremental links. The page words one composition link — the prior run measured every case
    // in full — and the generator refuses a prior that is itself composed, so that multi-link
    // sentence can never render. The case now holds the one link the page words, and asserts the
    // refusal on the real two-link chain run 32 -> run 31 -> run 30.
    const chain = compositionChain(runId(RUN_OF_RECORD_PATH));
    const found = chain.join(" -> ");
    expect(chain.length, `the page words one composition link, but the chain is ${found}`).toBe(2);

    // What makes the prior run the full run: it composes from nothing, so every case in it was
    // measured on its own candidate. That is the claim the page makes about the baseline it names.
    const baseline = chain.at(-1) ?? "";
    expect(
      resultsSection(readResults(baseline), "0. Composition"),
      `the chain ${found} ends at a run that is itself composed`,
    ).toBe("");
    const [run, base] = chain.map(runNumber);
    expect(page, `the page does not name run ${base} as the full run of ${found}`)
      .toContain(`Run ${base} measured every case in full`);
    expect(page, `the page does not name the one link of ${found}`).toMatch(
      new RegExp(`run ${run} re-measured [^,]+, composed with run ${base},`),
    );

    // A two-link chain is refused by name rather than worded as one link.
    const root = mkdtempSync(join(tmpdir(), "stamity-two-link-"));
    try {
      placeResults(root, "2026-09-21-run-31", readResults("2026-09-21-run-31"));
      expect(() => measurementMethod(root, "32", readResults("2026-09-22-run-32"))).toThrow(
        /composes through two or more links \(run 32 -> run 31 -> run 30\)/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ADDED 2026-10-08, unit c2-run-of-record (REQ-PROVE-032; inbox rows 337 and 601's remainder). The
// run of record, its release and its exception were three TypeScript literals, so moving the run of
// record was a two-file change at best. They are read from `evals/run-of-record.json` now, under the
// root the page renders, so a scratch root carrying its own file renders its own run. Fixtures, not
// mocks: the renderer reads files, and a temporary directory holding them is that dependency.
describe("evals/run-of-record.json names the run of record", () => {
  const PASS_RUN = "2026-10-01-run-39";
  const PASS_PATH = `evals/runs/${PASS_RUN}/RESULTS.md`;

  /** A scratch root holding a snapshot and one release run, which every render reads. */
  const scratch = (): string => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
    // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
    writeMeasurementSnapshot(root, PINNED_DATE);
    return root;
  };

  // ADDED 2026-10-08, unit c2-run-of-record, review round 1 (M-1). The module read the file when it
  // loaded, so a malformed file failed every import of it: `generate-docs.mjs` could write no page,
  // the docs index included, and `merge-ready-rate.mjs`, which imports the module before its `try`,
  // exited on a stack trace. The import must succeed, and the first reader that needs the run of
  // record gets the one-line message naming the file. The module resolves its root through
  // `findPackageRoot`, so a fresh module graph whose `findPackageRoot` names a scratch root is the
  // seam: the tree's own file is never touched.
  it("is read when a reader needs it, not when the module loads", async () => {
    const root = mkdtempSync(join(tmpdir(), "stamity-run-of-record-"));
    placeRunOfRecord(root, "{ path: evals/runs }\n");
    vi.resetModules();
    vi.doMock("../../src/shared/paths.ts", async (importOriginal) => ({
      ...(await importOriginal<typeof SharedPaths>()),
      findPackageRoot: () => root,
    }));
    try {
      const fresh = await import("../../src/cli/docs/measurements.ts");
      const index = await import("../../src/cli/docs/llmsIndex.ts");
      expect(fresh.MEASUREMENTS_DOC_PATH).toBe(MEASUREMENTS_DOC_PATH);
      expect(index.LLMS_INDEX_SECTIONS).toEqual(LLMS_INDEX_SECTIONS);
      let message = "";
      try {
        fresh.runOfRecordVerdict(readResults(PASS_RUN), null);
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/^evals\/run-of-record\.json is not JSON: /);
      expect(message.split("\n")).toHaveLength(1);
    } finally {
      vi.doUnmock("../../src/shared/paths.ts");
      vi.resetModules();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders the run and release a scratch root's own file names", () => {
    const root = scratch();
    try {
      placeRenderInputs(root, readResults(PASS_RUN), { path: PASS_PATH, release: "1.11.0", exception: null });
      const page = renderMeasurements(root);
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the run of record is a
      // record, so the page links it into the `records` branch; the run, release and wording held
      // are the same.
      expect(page).toContain(`[run 39](${RECORDS_BLOB_URL}${PASS_PATH}) — the 1.11.0 release run —`);
      // TEST CHANGE, justified: 2026-10-11, the 1.14.0 cut, the review of unit c7-run-of-record
      // (W-1): run 39 is composed with run 38, so its PASS reads "PASS as composed"; this pinned
      // the bare "PASS, three samples per case.".
      expect(page).toContain("\nPASS as composed, three samples per case.\n");
      expect(page).toContain("The scoring rule is SET-v6, which is what run 39's own score table");
      // ADDED 2026-10-08, review round 1 (W-1): the four figures are run 39's own § 5 scores, not
      // the tree's run of record's. The generator typed run 43's, so this render stated run 39 as
      // PASS beside run 43's golden and guardrail figures.
      expect(page).toContain("- Golden rubric pass rate **0.918** (56/61); every floor case passed, 23/23.\n");
      expect(page).toContain("- Adversarial guardrail hold rate **1.000** (18/18).\n");
      expect(page).toContain("- Benign-twin false-refusal rate **0.000** (0/4).\n");
      expect(page).toContain("- Trigger-probe accuracy **1.000** (30/30).\n");
      expect(page).not.toContain("**0.967** (59/61)");
      expect(page).not.toContain("**0.944** (17/18)");
      expect(page, "the scratch render still names the tree's run of record").not.toContain(RUN_OF_RECORD_PATH);
      expect(page).not.toContain(`the ${RUN_OF_RECORD_RELEASE} release run`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ADDED 2026-10-08, review round 1 (W-1): a score the page reads off § 5 and cannot parse is
  // refused, naming the metric, rather than restated as whatever the cell holds.
  it("refuses a results file whose score cell is not a score and a count", () => {
    const root = scratch();
    try {
      const results = readResults(PASS_RUN).replace("| **0.918** (56/61) |", "| 0.918 |");
      placeRenderInputs(root, results, { path: PASS_PATH, release: "1.11.0", exception: null });
      expect(() => renderMeasurements(root)).toThrow(EngineError);
      expect(() => renderMeasurements(root)).toThrow(
        /"Golden rubric pass rate" row states its score as "0\.918"/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a file naming a results file that is absent", () => {
    const root = scratch();
    try {
      placeRenderInputs(root, readResults(PASS_RUN), { path: PASS_PATH, release: "1.11.0", exception: null });
      const absent = "evals/runs/2026-12-31-run-99/RESULTS.md";
      placeRunOfRecord(root, { path: absent, release: "1.99.0", exception: null });
      expect(() => renderMeasurements(root)).toThrow(EngineError);
      expect(() => renderMeasurements(root)).toThrow(
        /No results file at evals\/runs\/2026-12-31-run-99\/RESULTS\.md/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a PASS run of record beside a recorded exception", () => {
    const passResults = readResults(PASS_RUN);
    const text = "An exception the passing release forgot to reset.";
    expect(() => runOfRecordVerdict(passResults, { run: RUN_OF_RECORD_PATH, text })).toThrow(EngineError);
    expect(() => runOfRecordVerdict(passResults, { run: RUN_OF_RECORD_PATH, text })).toThrow(
      /PASS and an exception is still recorded/,
    );
    expect(() => runOfRecordVerdict(passResults, { run: RUN_OF_RECORD_PATH, text })).toThrow(
      /set exception to null in evals\/run-of-record\.json/,
    );

    // Through the page: the file a passing release left with the old exception does not render.
    const root = scratch();
    try {
      placeRenderInputs(root, passResults, {
        path: PASS_PATH,
        release: "1.11.0",
        exception: { run: PASS_PATH, text },
      });
      expect(() => renderMeasurements(root)).toThrow(/PASS and an exception is still recorded/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ADDED 2026-10-11, the 1.14.0 cut, on the review of unit c7-run-of-record (W-1 and W-2; ledger rows
// review/52 and review/53 of run 2026-10-11_release-1-14-0). The page called run 45 "PASS" and gave
// its five re-measured cases as "case file bytes moved", so a reader of the page alone never learned
// that four expected rows were amended after run 44's FAIL. The page now prints the run of record's
// own "Why the run happened" section, read from its results file; one fixed sentence where a
// re-measured case's file moved; a link to a note beside the run where its folder holds one; and
// "PASS as composed" where a composed run passes. Fixtures, not mocks: the generator reads files,
// and a temporary directory holding real exports is that dependency.
describe("the page says why its run of record happened", () => {
  const REASON = "3. Why the run happened";
  const MOVED_35 = "| `subagent-returns-blocked-ambiguity-charter-only` | case file bytes moved |";
  const pathOf = (id: string): string => `evals/runs/${id}/RESULTS.md`;

  /** Run `runOfRecordReason` for the run `id` over a fixture root holding `files` by repo-relative path. */
  const reason = (id: string, results: string, files: Record<string, string> = {}): readonly string[] => {
    const root = mkdtempSync(join(tmpdir(), "stamity-reason-"));
    try {
      for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
      }
      return runOfRecordReason(root, pathOf(id), results);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  /** The § 3 block as the page prints it: one line naming the file, then the section, quoted. */
  const quoted = (run: string, results: string): readonly string[] => [
    `Run ${run}'s results file states why the run happened, in its § 3, quoted as it stands:`,
    "",
    ...resultsSection(results, REASON)
      .trim()
      .split("\n")
      .map((line) => (line.trim() === "" ? ">" : `> ${line}`)),
  ];

  /**
   * The one fixed sentence, on its two lines. `evals/SET-v7.md` is a `main` path, so its link
   * stays relative.
   */
  const changed = (prior: string, run: string): readonly string[] => [
    `A case file that moved between run ${prior} and run ${run} was changed after run ${prior}'s scores were known,`,
    "and the dated paragraphs of [`evals/SET-v7.md`](../evals/SET-v7.md) say what each change is and what it admits.",
  ];

  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): a run's note is a record, so
  // the page links it into the `records` branch; the sentence and the folder it names are the same.
  const noteLine = (run: string, id: string): string =>
    `Run ${run} carries a note beside its results file, [\`NOTE.md\`](${RECORDS_BLOB_URL}evals/runs/${id}/NOTE.md), to be read with it.`;

  /** A results file with the body of its § 3 removed and the heading kept. */
  const withoutReason = (results: string): string => {
    const emptied = results.replace(
      /\n## 3\. Why the run happened\n[\s\S]*?\n## 4\. /,
      "\n## 3. Why the run happened\n\n## 4. ",
    );
    expect(emptied, "the fixture edit did not land").not.toBe(results);
    return emptied;
  };

  it("prints the section and the sentence for a composed run with a moved case file", () => {
    const run35 = readResults("2026-09-27-run-35");
    expect(compositionOf(run35)?.remeasured.map(({ why }) => why)).toEqual([
      "case file bytes moved",
      "case file bytes moved",
    ]);
    const expected = ["", ...quoted("35", run35), "", ...changed("34", "35"), ""];
    expect(reason("2026-09-27-run-35", run35)).toEqual(expected);
    // The quote is the file's own text, not a sentence about it.
    expect(quoted("35", run35).at(-1)).toContain("the trigger was not recorded at prepare");

    // One moved case file among other reasons is enough.
    const mixed = run35.replace(MOVED_35, MOVED_35.replace("case file bytes moved", "named by the operator"));
    expect(mixed, "the fixture edit did not land").not.toBe(run35);
    expect(reason("2026-09-27-run-35", mixed)).toEqual(expected);

    // The 1.14.0 pair, by id: the page carries the words the finding asked for, read from run 45.
    const run45 = readResults("2026-10-11-run-45");
    const lines = reason("2026-10-11-run-45", run45);
    expect(lines).toEqual(["", ...quoted("45", run45), "", ...changed("44", "45"), ""]);
    expect(lines.join("\n")).toContain("four Expected rows amended");
  });

  it("prints the section and no such sentence for a composed run with no moved case file", () => {
    // Run 39 re-measured a case whose prior samples were not all admitted; run 43 one the operator named.
    for (const [run, id] of [["39", "2026-10-01-run-39"], ["43", "2026-10-08-run-43"]] as const) {
      const results = readResults(id);
      expect(priorCompleteRun(results), `${id} is not composed`).not.toBeNull();
      const lines = reason(id, results);
      expect(lines).toEqual(["", ...quoted(run, results), ""]);
      expect(lines.length).toBeGreaterThan(4);
      expect(lines.join("\n")).not.toContain("was changed after");
    }

    // The exporter's other reasons are not a moved case file: the corpus moved, or the case is new.
    const run35 = readResults("2026-09-27-run-35");
    const others = run35
      .replace(MOVED_35, MOVED_35.replace("case file bytes moved", "case absent at the prior candidate"))
      .replace(
        "| `question-shape-and-default-charter-only` | case file bytes moved |",
        "| `question-shape-and-default-charter-only` | source text moved: content/x.md:1-2 |",
      );
    expect(compositionOf(others)?.remeasured.map(({ why }) => why)).toEqual([
      "source text moved: content/x.md:1-2",
      "case absent at the prior candidate",
    ]);
    expect(reason("2026-09-27-run-35", others)).toEqual(["", ...quoted("35", others), ""]);
  });

  it("prints the section and no such sentence for a full run", () => {
    for (const [run, id] of [
      ["34", "2026-09-27-run-34"],
      ["24", "2026-09-11-run-24"],
      ["44", "2026-10-11-run-44"],
    ] as const) {
      const results = readResults(id);
      expect(priorCompleteRun(results), `${id} is not a full run`).toBeNull();
      const lines = reason(id, results);
      expect(lines).toEqual(["", ...quoted(run, results), ""]);
      expect(lines.length).toBeGreaterThan(4);
      expect(lines.join("\n")).not.toContain("was changed after");
    }
  });

  it("prints no section where the results file states none, and still says a case file moved", () => {
    // Run 12's real export carries no § 3 heading at all.
    const run12 = readResults("2026-09-10-run-12");
    expect(resultsSection(run12, REASON)).toBe("");
    expect(reason("2026-09-10-run-12", run12)).toEqual([]);

    // A heading with nothing under it prints no empty quote.
    expect(reason("2026-09-27-run-34", withoutReason(readResults("2026-09-27-run-34")))).toEqual([]);
    expect(reason("2026-09-27-run-35", withoutReason(readResults("2026-09-27-run-35")))).toEqual([
      "",
      ...changed("34", "35"),
      "",
    ]);
  });

  it("links the note beside the run of record when its folder holds one", () => {
    const run39 = readResults("2026-10-01-run-39");
    const note39 = { "evals/runs/2026-10-01-run-39/NOTE.md": "# A note\n" };
    expect(reason("2026-10-01-run-39", run39, note39)).toEqual([
      "",
      ...quoted("39", run39),
      "",
      noteLine("39", "2026-10-01-run-39"),
      "",
    ]);
    expect(reason("2026-10-01-run-39", run39).join("\n")).not.toContain("NOTE.md");

    // A note in another run's folder is not this run's.
    const elsewhere = { "evals/runs/2026-10-01-run-38/NOTE.md": "# A note\n" };
    expect(reason("2026-10-01-run-39", run39, elsewhere).join("\n")).not.toContain("NOTE.md");

    // Beside the sentence, the link is the next line of the same paragraph.
    const run35 = readResults("2026-09-27-run-35");
    expect(
      reason("2026-09-27-run-35", run35, { "evals/runs/2026-09-27-run-35/NOTE.md": "# A note\n" }),
    ).toEqual([
      "",
      ...quoted("35", run35),
      "",
      ...changed("34", "35"),
      noteLine("35", "2026-09-27-run-35"),
      "",
    ]);
  });

  it("says PASS as composed of a composed PASS, and the bare status otherwise", () => {
    const composedPass = readResults("2026-10-01-run-39");
    const fullPass = readResults("2026-09-11-run-24");
    const composedFail = readResults("2026-10-08-run-43");
    expect([priorCompleteRun(composedPass) !== null, runStatus(composedPass)]).toEqual([true, "PASS"]);
    expect([priorCompleteRun(fullPass) !== null, runStatus(fullPass)]).toEqual([false, "PASS"]);
    expect([priorCompleteRun(composedFail) !== null, runStatus(composedFail)]).toEqual([true, "FAIL"]);

    expect(runOfRecordVerdict(composedPass, null)).toEqual(["PASS as composed, three samples per case."]);
    expect(runOfRecordVerdict(fullPass, null)).toEqual(["PASS, three samples per case."]);
    const exception: RunOfRecordException = { run: pathOf("2026-10-08-run-43"), text: "A test exception." };
    expect(runOfRecordVerdict(composedFail, exception, exception.run)).toEqual([
      "FAIL, three samples per case.",
      "",
      "A test exception.",
    ]);
  });

  it("renders the block between the method paragraph and the scoring rule, and nothing where there is none", () => {
    const render = (id: string, results: string, note: boolean): string => {
      const root = fixture({
        "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      });
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
      // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
      writeMeasurementSnapshot(root, PINNED_DATE);
      placeRenderInputs(root, results, { path: pathOf(id), release: "2.0.0" });
      if (note) writeFileSync(join(root, "evals/runs", id, "NOTE.md"), "# A note\n");
      try {
        return renderMeasurements(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };

    const run35 = readResults("2026-09-27-run-35");
    const composed = render("2026-09-27-run-35", run35, true);
    expect(composed).toContain("\nPASS as composed, three samples per case.\n");
    expect(composed).toContain(
      [
        "ranges found identical at both candidates. The set is SET-v7.",
        "",
        ...quoted("35", run35),
        "",
        ...changed("34", "35"),
        noteLine("35", "2026-09-27-run-35"),
        "",
        "The scoring rule is SET-v6, which is what run 35's own score table is headed with.",
      ].join("\n"),
    );

    // A full run with its reason: the quote, and neither the sentence nor a link.
    const run34 = readResults("2026-09-27-run-34");
    const full = render("2026-09-27-run-34", run34, false);
    expect(full).toContain(
      [
        "Run 34 measured every case in full on its own candidate. The set is SET-v7.",
        "",
        ...quoted("34", run34),
        "",
        "The scoring rule is SET-v6, which is what run 34's own score table is headed with.",
      ].join("\n"),
    );
    expect(full).not.toContain("was changed after");
    expect(full).not.toContain("NOTE.md");

    // No reason, no moved case file and no note: the paragraph is the one the page had before.
    const bare = render("2026-09-27-run-34", withoutReason(run34), false);
    expect(bare).toContain(
      "The set is SET-v7.\nThe scoring rule is SET-v6, which is what run 34's own score table is headed with.",
    );
    expect(bare).not.toContain("states why the run happened");
  });

  // Run 38 is a real full run whose § 3 says "the full re-measure": quoted, it is on the page, and
  // the full-run check reads the page's own wording, not the quote.
  it("refuses a composition claim the page words itself, and admits one a full run's own reason states", () => {
    const id = "2026-10-01-run-38";
    const results = readResults(id);
    expect(priorCompleteRun(results), `${id} is not a full run`).toBeNull();
    expect(resultsSection(results, REASON)).toContain("re-measure");

    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    let page = "";
    try {
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
      // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
      writeMeasurementSnapshot(root, PINNED_DATE);
      placeRenderInputs(root, results, { path: pathOf(id), release: "2.0.0" });
      page = renderMeasurements(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    expect(page).toContain(`\n${quoted("38", results).join("\n")}\n`);
    expect(page.split("\n").filter((line) => line.startsWith(">")).join("\n")).toContain("re-measure");

    expectFullRunOfRecord(results, page, [id]);
    // The same words on a line the page words itself are still refused.
    expect(() =>
      expectFullRunOfRecord(results, page.replace("\nThe scoring rule is", "\nRun 38 re-measured one case.\nThe scoring rule is"), [id]),
    ).toThrow(/composition claim \("re-measure"\)/);
  });

  it("holds the tree's page to its own run of record's section, moved case files and note", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    const page = renderMeasurements();
    const run = runNumber(runId(RUN_OF_RECORD_PATH));

    const section = resultsSection(results, REASON).trim();
    if (section === "") {
      expect(page).not.toContain("states why the run happened");
    } else {
      expect(page).toContain(`\n${quoted(run, results).join("\n")}\n`);
    }

    const composition = compositionOf(results);
    const moved = composition?.remeasured.some(({ why }) => why === "case file bytes moved") ?? false;
    if (composition !== null && moved) {
      expect(page).toContain(`\n${changed(runNumber(composition.prior), run).join("\n")}\n`);
    } else {
      expect(page).not.toContain("was changed after");
    }

    const note = `evals/runs/${runId(RUN_OF_RECORD_PATH)}/NOTE.md`;
    if (existsSync(join(REPO_ROOT, note))) {
      expect(page).toContain(`\n${noteLine(run, runId(RUN_OF_RECORD_PATH))}\n`);
    } else {
      expect(page).not.toContain("NOTE.md");
    }
  });
});

describe("the committed snapshot the page renders from", () => {
  it("parses, and states a rate that matches the lists it carries", () => {
    const { path, report } = readMeasurementSnapshot();
    expect(path).toMatch(/^evals\/measurements\/merge-ready-\d{4}-\d{2}-\d{2}\.json$/);
    expect(report.rule).toBe(MERGE_READY_RULE);
    expect(report.rate.n).toBe(report.numerator.length);
    expect(report.rate.d).toBe(report.numerator.length + report.denominator.length);
    expect(report.rate.value).toBe(Number((report.rate.n / report.rate.d).toFixed(3)));
    expect(report.rate.d, "a rate over an empty denominator states nothing").toBeGreaterThan(0);
  });

  it("records what it was computed from, so a stale snapshot can be told from a current one", () => {
    const { report } = readMeasurementSnapshot();
    expect(report.computedFrom.records).toBeGreaterThan(10);
    expect(report.computedFrom.newestRecordDate).toBe(report.generated);
    expect(report.computedFrom.changelogHead).toMatch(/^\d+\.\d+\.\d+$/);
    expect(
      readFileSync(join(REPO_ROOT, "CHANGELOG.md"), "utf-8"),
      "the changelog no longer carries the head the snapshot recorded",
    ).toContain(`## [${report.computedFrom.changelogHead}]`);
  });

  it("names a run only once across its three lists, and gives each a reason", () => {
    const { report } = readMeasurementSnapshot();
    const runs = listed(report);
    expect(new Set(runs).size, "a run appears in two lists").toBe(runs.length);
    const setAside: readonly ExcludedRun[] = [...report.excluded, ...report.denominator];
    for (const entry of setAside) {
      expect(entry.reason.trim().length, `${entry.run} is set aside for no reason`).toBeGreaterThan(
        5,
      );
    }
  });
});

describe("scripts/merge-ready-rate.mjs", () => {
  it("prints the same report the page renders from", () => {
    const stdout = execFileSync(process.execPath, [RATE_SCRIPT_PATH, "--json"], {
      encoding: "utf-8",
    });
    expect(JSON.parse(stdout)).toEqual(JSON.parse(JSON.stringify(computeMergeReadyRate())));
  });

  it("prints a human summary naming the rule, the rate and every list", () => {
    const stdout = execFileSync(process.execPath, [RATE_SCRIPT_PATH], { encoding: "utf-8" });
    const report = computeMergeReadyRate();
    expect(stdout).toContain(`${report.rate.n} of ${report.rate.d}`);
    expect(stdout).toContain(report.rule);
    for (const run of listed(report)) expect(stdout).toContain(run);
  });
});

describe("scripts/generate-docs.mjs --page measurements", () => {
  const workspace = mkdtempSync(join(tmpdir(), "stamity-measurements-page-"));
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  it("writes the rendered page, and a second run produces zero diff", () => {
    const run = (): string => {
      execFileSync(
        process.execPath,
        [SCRIPT_PATH, "--page", "measurements", "--out-dir", workspace],
        { encoding: "utf-8" },
      );
      return readFileSync(join(workspace, MEASUREMENTS_DOC_PATH), "utf-8");
    };
    const first = run();
    expect(first).toBe(renderMeasurements());
    expect(run()).toBe(first);
  });
});
