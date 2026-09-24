import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import type * as NodeFs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * S-3's guard is exercised at two characters, and `|` is not a legal Windows filename
 * character — a fixture directory literally named with one cannot exist on that platform, which
 * is exactly the CI failure this mock avoids. `readdirSync` is the one seam `computeMergeReadyRate`
 * uses to learn a run's directory name, so wrapping it (delegating to the real implementation for
 * every other path) lets the pipe case be proved by injecting a synthetic directory entry rather
 * than by writing a file no Windows checkout could hold. The backtick case stays a real fixture
 * on disk — a backtick is legal in a filename on every platform this suite runs on.
 */
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof NodeFs>();
  return { ...actual, readdirSync: vi.fn(actual.readdirSync) };
});
import {
  CI_WORKFLOW_PATH,
  DEFAULT_CONFIDENCE_GATE,
  MEASUREMENTS_DOC_PATH,
  MEASUREMENTS_REGENERATE_COMMAND,
  MERGE_EVIDENCE_NONE,
  MERGE_READY_RULE,
  REACH_SNAPSHOT_PATH,
  RUNS_DIR,
  RUN_OF_RECORD_PATH,
  SNAPSHOT_DIR,
  SNAPSHOT_REFRESH_COMMAND,
  carriedToRelease,
  computeMergeReadyRate,
  readMeasurementSnapshot,
  readReachSnapshot,
  renderMeasurements,
  writeMeasurementSnapshot,
  type DenominatedRun,
  type ExcludedRun,
  type MergeReadyReport,
  type ReachPoint,
  type VerifiedRun,
} from "../../../src/cli/docs/measurements.ts";
import { LLMS_INDEX_SECTIONS } from "../../../src/cli/docs/llmsIndex.ts";
import { EngineError } from "../../../src/types/errors.ts";

/**
 * The gate on the measurements page and on the rule behind it.
 *
 * Two halves, and the second is the one that matters. The first is the drift
 * gate every generated page in this lane carries: the render byte-matches the
 * committed file, twice over, reading no clock. The second is the RULE — the
 * four clauses a run passes to count as verified — and that half is exercised
 * against fixture trees rather than against this repository's own history,
 * because a rule asserted only over the tree it was written against is a
 * snapshot of today's records with an `expect` around it. The fixtures carry
 * runs that pass, runs that fail one clause each, and a run whose record calls
 * itself verified in prose and proves nothing, which is the case the whole
 * anti-gaming constraint exists for.
 *
 * The seam between the two halves is the snapshot. The page renders from
 * `evals/measurements/merge-ready-<date>.json`, never from the live records, so
 * a run in flight cannot make a committed page stale — which is why the cases
 * below assert the page against the COMMITTED snapshot and assert the rule
 * against fixture trees, and why the one property that used to be checked
 * against this repository's live records (every run exactly once) is now
 * checked where it can be made to fail on purpose.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/measurements.ts");
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
const OPEN_LEDGER = `${JSON.stringify({ id: "r/prove/1", state: "open" })}\n`;

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

/** The window a downloads point covers, as one readable range. */
const window = (point: ReachPoint): string => `${point.start} to ${point.end}`;

/** The reason one run was set aside, or `undefined` when it was not. */
const reasonFor = (notes: readonly DenominatedRun[], run: string): string | undefined =>
  notes.find((note) => note.run === run)?.reason;

/** The merge column reported beside one verified run. */
const evidenceFor = (runs: readonly VerifiedRun[], run: string): string | undefined =>
  runs.find((entry) => entry.run === run)?.mergeEvidence;

/**
 * This repository's own measurement, computed per case rather than once at
 * describe scope: a refusal is then a named test failure instead of a suite
 * that fails to load with no case to point at.
 */
const measured = (): MergeReadyReport => computeMergeReadyRate();

/** The three lists, flattened to the run ids they name. */
function listed(report: MergeReadyReport): string[] {
  return [
    ...report.numerator.map((entry) => entry.run),
    ...report.denominator.map((entry) => entry.run),
    ...report.excluded.map((entry) => entry.run),
  ];
}

describe("renderMeasurements — drift gate", () => {
  it("byte-matches the committed page", () => {
    expect(STALE_MESSAGE).toContain(MEASUREMENTS_REGENERATE_COMMAND);
    expect(renderMeasurements(), STALE_MESSAGE).toBe(committedPage());
  });

  it("renders byte-identically twice, and ends with exactly one newline", () => {
    const page = renderMeasurements();
    expect(renderMeasurements()).toBe(page);
    expect(page.endsWith("\n")).toBe(true);
    expect(page.endsWith("\n\n")).toBe(false);
    expect(page).not.toContain("\r");
  });

  it("reads no clock — the stamp comes from the snapshot, never from today", () => {
    // The wall clock lives in `scripts/merge-ready-rate.mjs`, which names the
    // snapshot file; nothing the byte-compared page renders may read one.
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
    expect(renderMeasurements()).toContain(readMeasurementSnapshot().report.generated);
  });

  it("names the snapshot it rendered from, and how that snapshot is refreshed", () => {
    // A number whose input is not named is a number nobody can recompute — and
    // the refresh sentence is what keeps a reader from reading a frozen page as
    // a live one.
    const snapshot = readMeasurementSnapshot();
    const page = renderMeasurements();
    expect(snapshot.path.startsWith(`${SNAPSHOT_DIR}/`)).toBe(true);
    expect(page).toContain(`[\`${snapshot.path}\`](../${snapshot.path})`);
    expect(page).toContain(SNAPSHOT_REFRESH_COMMAND);
    expect(page).toContain(
      "run record written after it is not on this page until the next refresh",
    );
  });

  it("names its own regeneration command in the page banner", () => {
    expect(renderMeasurements()).toContain(
      `<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${MEASUREMENTS_REGENERATE_COMMAND}\`. -->`,
    );
  });

  it("publishes the rule it measured under and the gate it falls back to", () => {
    // A number with its rule on a different page is a number nobody can argue with.
    const page = renderMeasurements();
    expect(page).toContain(MERGE_READY_RULE);
    expect(page).toContain(`${DEFAULT_CONFIDENCE_GATE} when it states none`);
  });

  it("reports merge evidence per run and says why it is not a clause", () => {
    // The clause that was dropped is not silently gone: it is a column, and the
    // page states the three facts that made scoring on it measure bookkeeping.
    const page = renderMeasurements();
    expect(page).toContain("| Run | Merge evidence |");
    expect(page).toContain("not a fourth clause");
    expect(page).toContain("a record closes before its branch lands");
    expect(page).toContain("names no pull-request number");
    expect(page).toContain("are not\nancestors of `main`");
    for (const run of measured().numerator) {
      expect(page, `${run.run} has no merge column`).toContain(
        `| \`${run.run}\` | ${run.mergeEvidence} |`,
      );
    }
  });

  it("is indexed for agents, so the page is reachable without the sidebar", () => {
    const indexed = LLMS_INDEX_SECTIONS.flatMap((section) =>
      section.entries.map((entry) => entry.path),
    );
    expect(indexed).toContain(MEASUREMENTS_DOC_PATH);
  });
});

describe("the reach proxy is labelled as one", () => {
  it("carries the sentence that says what an npm download is not", () => {
    const page = renderMeasurements();
    // The whole reason the number is publishable: without this sentence a
    // download count reads as an install count, which reads as users.
    expect(page).toContain("npm downloads count package fetches");
    expect(page).toContain("It is not");
    expect(page).toContain("weekly active installations");
    expect(page).toContain("Real-use data is unmeasured");
    expect(page).toContain("proxy");
  });

  it("states the snapshot's own numbers and its access stamp, not a fetched one", () => {
    const snapshot = readReachSnapshot();
    const page = renderMeasurements();
    expect(page).toContain(snapshot.accessed);
    expect(page).toContain(REACH_SNAPSHOT_PATH);
    expect(page).toContain(`| Last week | ${snapshot.lastWeek.downloads} |`);
    expect(page).toContain(`| Last month | ${snapshot.lastMonth.downloads} |`);
    expect(page).toContain(window(snapshot.lastWeek));
    expect(page).toContain(window(snapshot.lastMonth));

    // The daily total is computed from the committed series rather than typed, so
    // a hand-edited row cannot leave the page's total agreeing with nothing.
    const total = snapshot.daily.downloads.reduce((sum, row) => sum + row.downloads, 0);
    expect(snapshot.daily.downloads.length).toBeGreaterThan(1);
    expect(page).toContain(`| Daily range | ${total} |`);
  });

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

/** The prior complete run a composed artifact names, as that run's directory id. */
const PRIOR_RUN = /prior complete run is `([\w.-]+)`/;

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
function compositionChain(start: string): readonly string[] {
  const chain: string[] = [start];
  for (;;) {
    const composition = resultsSection(readResults(chain.at(-1) ?? ""), "0. Composition");
    const prior = PRIOR_RUN.exec(composition)?.[1];
    if (prior === undefined) return chain;
    if (chain.includes(prior)) {
      throw new Error(`the composition chain revisits ${prior}: ${chain.join(" -> ")}`);
    }
    chain.push(prior);
  }
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

    // The floor count lives in the golden row's result cell, not in its score cell.
    const floors = /floors (\d+\/\d+)/.exec(rows[0]?.[3] ?? "")?.[1];
    expect(floors, `${RUN_OF_RECORD_PATH} states no floor count for the golden rate`).toBeDefined();
    expect(page).toContain(`every floor case passed, ${floors}.`);

    // TEST CHANGE, justified: the four scores were derived from the artifact while the headline
    // verdict beside them — the page's "PASS" — was a literal nothing read. A run whose status
    // moved to FAIL would have left the page calling it a pass with four scores that still
    // matched their rows. The artifact's own status line is what the word is held to now.
    //
    // TEST CHANGE, justified: the derivation stopped one step short — the artifact was matched
    // against the literal `PASS`, so a run whose status moved failed HERE rather than at the
    // page, and the page's own word stayed a transcription. The status is now read out of the
    // artifact and interpolated, the way the metric scores above are.
    const status = /^Status: \*\*(\w+)\*\*$/m.exec(results)?.[1];
    expect(status, `${RUN_OF_RECORD_PATH} states no status`).toBeDefined();
    expect(page, `the page does not state the run's status (${status}) beside its scores`).toContain(
      `${status}, three samples per case.`,
    );
  });

  it("says the run of record is composed, and names the runs it was composed from", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    const page = renderMeasurements();

    // A composed run scores the whole set from samples some of which were carried from an
    // earlier run rather than measured again. The page says so, because "PASS, three samples
    // per case" over 102 cases otherwise reads as 306 fresh measurements on this candidate.
    const composition = resultsSection(results, "0. Composition");
    expect(composition, `${RUN_OF_RECORD_PATH} carries no composition section`).toContain(
      "incremental rule",
    );
    expect(page).toContain("SET-v7's incremental rule");
    expect(page).toContain("composed");

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

    // TEST CHANGE, justified: this walked the chain exactly TWO links — the prior complete run,
    // then the run that one names — and asserted the second composes from nothing. That held only
    // while the run of record was run 30 (30 -> 29 -> 27, baseline two links out) and is false for
    // run 31 (31 -> 30 -> 29 -> 27): the two-link walk reads run 29 as the baseline, finds its
    // composition section non-empty, and fails on a page that is correct. The length of the chain
    // is not the property under test — that the walk ENDS at a run measured end to end is — so the
    // walk now follows each artifact's own prior-run pointer to its terminus, and every assertion
    // states the chain it found so a broken pointer is readable from the failure alone.
    const chain = compositionChain(runId(RUN_OF_RECORD_PATH));
    const found = chain.join(" -> ");
    expect(chain.length, `${RUN_OF_RECORD_PATH} composes from nothing: ${found}`).toBeGreaterThan(1);

    // What makes the terminal run the full run: it composes from nothing, so every case in it was
    // measured on its own candidate. That is the claim the page makes about the baseline it names.
    const baseline = chain.at(-1) ?? "";
    expect(
      resultsSection(readResults(baseline), "0. Composition"),
      `the chain ${found} ends at a run that is itself composed`,
    ).toBe("");
    expect(page, `the page does not name run ${runNumber(baseline)} as the full run of ${found}`)
      .toContain(`Run ${runNumber(baseline)} measured every case in full`);

    // Every run in the chain but that one re-measured a subset and carried the rest, and the page
    // names them all, oldest first. The numbers are compared as a list while the sentence's
    // punctuation is matched loosely: which runs are named is this test's business, the comma and
    // the conjunction are the page's.
    const incremental = chain.slice(0, -1).map(runNumber).toReversed();
    const sentence = /runs ([\d, and]+) re-measured/.exec(page)?.[1];
    expect(sentence, `the page names no re-measuring runs for the chain ${found}`).toBeDefined();
    expect(
      (sentence ?? "").match(/\d+/g),
      `the page's re-measuring runs are not the incremental links of ${found}`,
    ).toEqual(incremental);
  });

  it("names first-run lanes the workflow actually declares", () => {
    const workflow = readFileSync(join(REPO_ROOT, CI_WORKFLOW_PATH), "utf-8");
    const page = renderMeasurements();
    for (const lane of ["Tarball smoke (publish shape)", "apm-install", "Dogfood check"]) {
      expect(workflow, `${CI_WORKFLOW_PATH} declares no ${lane}`).toContain(lane);
      expect(page, `the page does not name ${lane}`).toContain(lane);
    }
    expect(page).toContain(`(../${CI_WORKFLOW_PATH})`);
    expect(page).toContain(`(../${RUN_OF_RECORD_PATH})`);
  });
});

describe("the run of record is carried to the release the tree ships as", () => {
  // ADDED at the 1.9.1 cut: the release moved no case input since run 32's candidate, so the run
  // stands under SET-v7's incremental rule and the page says which release it is carried to and
  // from which candidate. Each half is held to its own source rather than to the other: the
  // candidate to the results file's `Candidate:` line, the release to package.json — so the
  // clause cannot outlive the release it names, and the next cut either runs the set or moves it.
  it("names the shipped version as the carried-to release, and the run's own candidate", () => {
    const results = readFileSync(join(REPO_ROOT, RUN_OF_RECORD_PATH), "utf-8");
    const candidate = /^Candidate: `([0-9a-f]{40})`/m.exec(results)?.[1];
    expect(candidate, `${RUN_OF_RECORD_PATH} states no candidate`).toBeDefined();
    const manifest = readFileSync(join(REPO_ROOT, "package.json"), "utf-8");
    const shipped = (JSON.parse(manifest) as { version: string }).version;

    const page = renderMeasurements();
    const release = /release run,\ncarried to (\d+\.\d+\.\d+) under the set's/.exec(page)?.[1];
    expect(release, "the page states no carried-to release beside the run of record").toBe(shipped);
    const named = /no case input moved since its\ncandidate `([0-9a-f]{7,40})`\)/.exec(page)?.[1];
    expect(named, "the page names no candidate the run is carried from").toBeDefined();
    expect(candidate?.startsWith(named ?? "\u0000"), `${named} is not ${candidate}`).toBe(true);
  });

  // The hazard the case above cannot see: the next release that RUNS the set moves the run's
  // release to the shipped version, and the case above then demands the carried-to release be
  // that same version — "the X release run, carried to X", every other case green. The run's own
  // release is read off the rendered page rather than compared as two module constants, because
  // TypeScript narrows each literal `const` to its own type and an equality between two different
  // literals is a compile error, not a check.
  it("never carries the run to the release it measured", () => {
    const page = renderMeasurements();
    const clause = /the (\d+\.\d+\.\d+) release run,\ncarried to (\d+\.\d+\.\d+) under/.exec(page);
    expect(clause, "the page states no release run beside the carried-to release").not.toBeNull();
    const [, runRelease, carried] = clause ?? [];
    expect(
      carried,
      `the run is carried to ${carried}, the release it measured: delete the carried clause and this describe`,
    ).not.toBe(runRelease);
  });

  it("renders the carried-to release through the guard, not the bare constant", () => {
    // The guard is only a guard if the template calls it: interpolating RUN_OF_RECORD_CARRIED_TO
    // directly renders the same page today and leaves every other case green.
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).toMatch(
      /carried to \$\{carriedToRelease\(RUN_OF_RECORD_RELEASE, RUN_OF_RECORD_CARRIED_TO\)\}/,
    );
    expect(source).not.toMatch(/carried to \$\{RUN_OF_RECORD_CARRIED_TO\}/);
  });

  it("refuses to render a carried-to release equal to the run's own, naming what to delete", () => {
    // Non-degenerate on both sides: two distinct releases pass through untouched, and the equal
    // pair is refused with the instruction rather than rendered.
    expect(carriedToRelease("1.9.0", "1.9.1")).toBe("1.9.1");
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(EngineError);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/is the 1\.9\.2 release run/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/delete the carried clause/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/carriedToRelease from src\/cli\/docs\/measurements\.ts/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/RUN_OF_RECORD_CARRIED_TO and\s+RUN_OF_RECORD_CANDIDATE/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/test\/cli\/docs\/measurements\.test\.ts/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/README\.md and docs\/doctrine\.md/);
    expect(() => carriedToRelease("1.9.2", "1.9.2")).toThrow(/test\/docsPages\.test\.ts/);
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

describe("the rule, exercised against fixture trees", () => {
  it("counts a run that passes every clause, and reports its merge evidence", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_feature": {
        "record.md": record({ merge: "Landed as pull request #42 on the maintainer's merge." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator.map((entry) => entry.run)).toEqual([
      "2026-01-02_release-2.0.0",
      "2026-01-03_feature",
    ]);
    expect(evidenceFor(report.numerator, "2026-01-02_release-2.0.0")).toBe(
      "released version 2.0.0 in CHANGELOG",
    );
    expect(evidenceFor(report.numerator, "2026-01-03_feature")).toBe(
      "pull request #42 in CHANGELOG",
    );
    expect(report.rate).toEqual({ n: 2, d: 2, value: 1 });
    expect(report.generated).toBe("2026-01-03");
  });

  it("holds a run back on each clause it misses, one reason each", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_red-gate": {
        "record.md": record({
          gates: "| Final authoritative | pass | pass | 1 failed of 120 |",
          merge: "Landed as pull request #42.",
        }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      "2026-01-04_changes-requested": {
        "record.md": record({
          verdict: "| 2 | request-changes | high / 0.90 | one warning open |",
          merge: "Landed as pull request #42.",
        }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      "2026-01-05_under-gate": {
        "record.md": record({
          verdict: "| 2 | approve | medium / 0.60 | none in scope |",
          merge: "Landed as pull request #42.",
        }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      "2026-01-06_open-ledger": {
        "record.md": record({ merge: "Landed as pull request #42." }),
        "ledger.jsonl": OPEN_LEDGER,
      },
      // No merge artifact anywhere, and it is still verified: merge-ready is a
      // readiness. This case fails the moment the merge column becomes a clause.
      "2026-01-07_no-merge-artifact": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator).toEqual([
      { run: "2026-01-02_release-2.0.0", mergeEvidence: "released version 2.0.0 in CHANGELOG" },
      { run: "2026-01-07_no-merge-artifact", mergeEvidence: MERGE_EVIDENCE_NONE },
    ]);
    expect(report.denominator).toEqual([
      {
        run: "2026-01-03_red-gate",
        reason: "the final gate table reports a failure",
        mergeEvidence: "pull request #42 in CHANGELOG",
      },
      {
        run: "2026-01-04_changes-requested",
        reason: "the last review verdict is not an approval",
        mergeEvidence: "pull request #42 in CHANGELOG",
      },
      {
        run: "2026-01-05_under-gate",
        reason: "the approval at 0.6 is under the 0.8 gate",
        mergeEvidence: "pull request #42 in CHANGELOG",
      },
      {
        run: "2026-01-06_open-ledger",
        reason: "the findings ledger still carries an open row",
        mergeEvidence: "pull request #42 in CHANGELOG",
      },
    ]);
    expect(reasonFor(report.denominator, "2026-01-03_red-gate")).toContain("failure");
    expect(report.rate).toEqual({ n: 2, d: 6, value: 0.333 });
  });

  it("reads the confidence gate a record states over the fallback", () => {
    const stated = record({ verdict: "| 2 | approve | high / 0.86 | none |" });
    const root = fixture({
      "2026-01-02_release-2.0.0": {
        "record.md": `${stated}\nConfidence gate: approvals count at high/>=0.90 — not met.\n`,
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    // 0.86 clears the 0.8 fallback and misses the record's own 0.9 bar, so this
    // case fails the moment the stated gate stops being read.
    expect(report.numerator).toEqual([]);
    expect(report.denominator).toEqual([
      {
        run: "2026-01-02_release-2.0.0",
        reason: "the approval at 0.86 is under the 0.9 gate",
        mergeEvidence: "released version 2.0.0 in CHANGELOG",
      },
    ]);
  });

  // REQ-PROVE-020 (build/369): a version number on a verdict line is not a confidence. The
  // record states a 1.99 gate that no confidence can clear, so the reason line prints the exact
  // value read, and a line that states none reads as none rather than as a pass. The version
  // rows are the ones the old `\b([01]\.\d+)\b` read as 1.1 and 1.9, over the 0.8 fallback.
  it.each([
    { line: "| 2 | approve | medium / 0.60 — the cut for 1.10.0 | none |", reads: 0.6 },
    { line: "| 2 | approve for 1.10.0 | stated nowhere | none |", reads: null },
    { line: "| 2 | approve | high / 0.90 | none |", reads: 0.9 },
    { line: "| 2 | approve | stated nowhere, on v1.0 | none |", reads: null },
    { line: "| 2 | approve | stated nowhere, on 1.9.0 | none |", reads: null },
    { line: "| 2 | approve | 1.0 | none |", reads: 1 },
    { line: "| 2 | approve | confidence 0.85. | none |", reads: 0.85 },
    { line: "| 2 | approve | high / 0.85, re-read at 0.92 | none |", reads: 0.92 },
  ])("reads the stated confidence of $line as $reads", ({ line, reads }) => {
    const root = fixture({
      "2026-01-02_release-2.0.0": {
        "record.md": `${record({ verdict: line })}\nConfidence gate: 1.99.\n`,
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator).toEqual([]);
    expect(reasonFor(report.denominator, "2026-01-02_release-2.0.0")).toBe(
      reads === null
        ? "the approval states no confidence to compare to the gate"
        : `the approval at ${reads} is under the 1.99 gate`,
    );
  });

  it("excludes a record that declares itself verified and proves nothing", () => {
    const prose = [
      "# A run",
      "",
      "Landed as pull request #42.",
      "",
      "## Proof block",
      "",
      "Gates: all green. Review: approved at high confidence. Verified, complete and merged.",
      "",
    ].join("\n");
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-08_self-declared": { "record.md": prose, "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    // The anti-gaming constraint, as a case: every word a run could write about
    // itself is in that record, and it moves neither the numerator nor the
    // denominator.
    expect(report.excluded).toEqual([
      {
        run: "2026-01-08_self-declared",
        reason: "gates in prose only — no gate row carries a pass or fail",
      },
    ]);
    expect(report.rate).toEqual({ n: 1, d: 1, value: 1 });
  });

  it("credits no merge evidence to a pull request named only above the first release", () => {
    // The unreleased section is where a merge that has not shipped is written
    // down. Reading it as evidence would make the column mean "written in the
    // changelog" — which is the self-declaration the whole rule refuses.
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_unreleased": {
        "record.md": record({ merge: "Landed as pull request #99." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator.map((entry) => entry.run)).toEqual([
      "2026-01-02_release-2.0.0",
      "2026-01-03_unreleased",
    ]);
    expect(evidenceFor(report.numerator, "2026-01-03_unreleased")).toBe(MERGE_EVIDENCE_NONE);
  });

  it("excludes a run whose record says it is still in progress", () => {
    // A record is written THROUGHOUT its run. Reading an open one would put work
    // that has not finished into the denominator and stamp the page with a date
    // the run had not reached — which is exactly what happens on a branch where
    // tonight's run is writing its record while this page is byte-compared.
    const open = [
      "# A run",
      "",
      "Status: in progress — closed after the release freeze.",
      "",
      record({}),
    ].join("\n");
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-09_open-run": { "record.md": open, "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.excluded).toEqual([{ run: "2026-01-09_open-run", reason: "run in progress" }]);
    expect(report.numerator.map((entry) => entry.run)).toEqual(["2026-01-02_release-2.0.0"]);
    // The open run's date never becomes the page's stamp, even though it is the
    // newest record on disk and its directory sorts last.
    expect(report.generated).toBe("2026-01-02");
    expect(report.computedFrom.records).toBe(2);
  });

  it("excludes a run with no record and one with no proof block, by name", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_no-record": { "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-04_no-proof": { "record.md": "# A run\n\nA plan, and nothing proved.\n" },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.excluded).toEqual([
      { run: "2026-01-03_no-record", reason: "no record" },
      { run: "2026-01-04_no-proof", reason: "no proof block" },
    ]);
    // The newest date comes from a record, never from a directory with none:
    // the run dated 2026-01-04 carries one, the 2026-01-03 directory does not.
    expect(report.generated).toBe("2026-01-04");
  });

  it("reads the proof block's subheadings as part of it", () => {
    // The `### Gate results` shape is what half the records use; a section cut
    // at the first subheading reports every one of them as having no gates.
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });
    expect(report.numerator).toHaveLength(1);
  });

  it("refuses a tree with no runs directory and one with no changelog", () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-measure-empty-"));
    expect(() => computeMergeReadyRate(empty)).toThrow(EngineError);
    expect(() => computeMergeReadyRate(empty)).toThrow(/no run records to measure/);

    mkdirSync(join(empty, RUNS_DIR), { recursive: true });
    expect(() => computeMergeReadyRate(empty)).toThrow(/no merge can be proved/);

    writeFileSync(join(empty, "CHANGELOG.md"), "# Changelog\n");
    expect(() => computeMergeReadyRate(empty)).toThrow(/carries the proof block/);
    rmSync(empty, { recursive: true, force: true });
  });

  it("refuses a run directory name that would break out of a code span", () => {
    // S-3: run ids are interpolated unescaped into `` `${run.run}` `` on the
    // rendered page; a name carrying a backtick must be refused before it
    // reaches that template rather than rendered as broken Markdown. A
    // backtick alone is legal in a filename on every platform this suite
    // runs on, unlike the pipe case below.
    const root = fixture({
      "2026-01-02_ok`pwned": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    expect(() => computeMergeReadyRate(root)).toThrow(EngineError);
    expect(() => computeMergeReadyRate(root)).toThrow(/2026-01-02_ok`pwned/);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses a run directory name that would break out of a table cell", () => {
    // S-3's other half: run ids are also interpolated unescaped into
    // `| ${run.run} |` on the rendered page, so a name carrying a pipe must
    // be refused the same way. `|` is not a legal Windows filename
    // character, so this case is proved against the exported rule
    // (`computeMergeReadyRate`'s own `RUN_ID_PATTERN` check) by injecting a
    // synthetic directory entry into its `readdirSync` listing, rather than
    // by creating a fixture directory no Windows checkout could hold.
    const root = fixture({
      "2026-01-02_ok-real-run": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    const runsDir = join(root, RUNS_DIR);
    const injectedName = "2026-01-02_ok | pwned";
    const fakeEntry = { name: injectedName, isDirectory: () => true } as unknown as Dirent;

    const mockedReaddir = vi.mocked(readdirSync);
    const passthrough = mockedReaddir.getMockImplementation();
    if (passthrough === undefined) throw new Error("readdirSync mock has no default implementation");
    mockedReaddir.mockImplementation(((path: unknown, options?: unknown) => {
      const entries = (passthrough as unknown as (...args: unknown[]) => Dirent[])(path, options);
      return path === runsDir ? [...entries, fakeEntry] : entries;
    }) as typeof readdirSync);

    try {
      expect(() => computeMergeReadyRate(root)).toThrow(EngineError);
      expect(() => computeMergeReadyRate(root)).toThrow(/2026-01-02_ok \| pwned/);
    } finally {
      mockedReaddir.mockImplementation(passthrough as typeof readdirSync);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the snapshot seam", () => {
  it("freezes the live computation and reads it back byte-for-byte", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_red-gate": {
        "record.md": record({ gates: "| Final | pass | pass | 1 failed of 120 |" }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const path = writeMeasurementSnapshot(root, "2026-02-01");
    const snapshot = readMeasurementSnapshot(root);

    expect(path).toBe(`${SNAPSHOT_DIR}/merge-ready-2026-02-01.json`);
    expect(snapshot.path).toBe(path);
    expect(snapshot.report).toEqual(computeMergeReadyRate(root));
    expect(snapshot.report.rate).toEqual({ n: 1, d: 2, value: 0.5 });
    expect(readFileSync(join(root, path), "utf-8").endsWith("\n")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to overwrite a snapshot, and refuses a filename that is not a date", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    writeMeasurementSnapshot(root, "2026-02-01");

    // A snapshot is the input a published number was computed from; rewriting one
    // erases the record of what the page said.
    expect(() => writeMeasurementSnapshot(root, "2026-02-01")).toThrow(EngineError);
    expect(() => writeMeasurementSnapshot(root, "2026-02-01")).toThrow(/never rewritten in place/);
    expect(() => writeMeasurementSnapshot(root, "yesterday")).toThrow(/dated YYYY-MM-DD/);
    rmSync(root, { recursive: true, force: true });
  });

  it("reads the newest snapshot by filename date, not by write order", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    // Written newest-first on purpose: mtime order and filename order disagree
    // here, and a checkout's timestamps are not committed.
    writeMeasurementSnapshot(root, "2026-03-09");
    writeMeasurementSnapshot(root, "2026-02-01");
    expect(readMeasurementSnapshot(root).path).toBe(
      `${SNAPSHOT_DIR}/merge-ready-2026-03-09.json`,
    );
    rmSync(root, { recursive: true, force: true });
  });

  it("renders the page from the snapshot, not from the records beside it", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    writeMeasurementSnapshot(root, "2026-02-01");
    // A second run lands AFTER the snapshot — the case the seam exists for.
    const later = join(root, RUNS_DIR, "2026-02-14_later-run");
    mkdirSync(later, { recursive: true });
    writeFileSync(join(later, "record.md"), record({}));
    writeFileSync(join(later, "ledger.jsonl"), CLOSED_LEDGER);

    // The reach snapshot is read from the real tree, so render against a root
    // that carries both: copy the committed reach artifact into the fixture.
    mkdirSync(dirname(join(root, REACH_SNAPSHOT_PATH)), { recursive: true });
    writeFileSync(
      join(root, REACH_SNAPSHOT_PATH),
      readFileSync(join(REPO_ROOT, REACH_SNAPSHOT_PATH), "utf-8"),
    );

    const page = renderMeasurements(root);
    expect(computeMergeReadyRate(root).rate.d, "the live tree moved, as the case intends").toBe(2);
    expect(page).toContain("**1 of 1 runs** (1.000)");
    expect(page).not.toContain("2026-02-14_later-run");
    expect(page).toContain("merge-ready-2026-02-01.json");
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to render a page when no snapshot is committed", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    expect(() => readMeasurementSnapshot(root)).toThrow(EngineError);
    expect(() => renderMeasurements(root)).toThrow(/No measurement snapshot/);
    expect(() => renderMeasurements(root)).toThrow(new RegExp(SNAPSHOT_REFRESH_COMMAND));
    rmSync(root, { recursive: true, force: true });
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

  it("refuses an unknown argument with the usage line and status 2", () => {
    const result = spawnSync(process.execPath, [RATE_SCRIPT_PATH, "--nonsense"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument: --nonsense");
    expect(result.stderr).toContain("Usage: node scripts/merge-ready-rate.mjs");
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
