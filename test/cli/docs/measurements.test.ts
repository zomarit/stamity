import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import type * as NodeFs from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

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
  MEASUREMENT_SNAPSHOT_PATH,
  MERGE_EVIDENCE_NONE,
  MERGE_READY_RULE,
  REACH_SNAPSHOT_PATH,
  RECORDS_BLOB_URL,
  RUNS_DIR,
  RUN_OF_RECORD_FILE,
  SNAPSHOT_DIR,
  SNAPSHOT_REFRESH_COMMAND,
  compositionOf,
  computeMergeReadyRate,
  failingCases,
  measurementInputs,
  measurementMethod,
  measurementsAction,
  priorCompleteRun,
  readMeasurementSnapshot,
  readReachSnapshot,
  readRunOfRecord,
  renderMeasurements,
  runStatus,
  unmetMetrics,
  writeMeasurementSnapshot,
  type DenominatedRun,
  type MergeReadyReport,
  type ReachPoint,
  type ReachSnapshot,
  type RunOfRecord,
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
 *
 * TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): this file reads
 * no record. The records live on the `records` branch, so a checkout of `main` alone, or a fork,
 * holds none, and `npm test` has to pass there. The cases that state a fact about a real record —
 * the committed page against the run of record, the committed snapshot, the reach snapshot's
 * self-check, a named eval run's own figures and wording, the merge-ready scripts over this
 * repository's `.stamity/runs/` — moved under their names to `test/records/measurements.test.ts`,
 * which `npm run test:records` runs. The cases that test the renderer's logic and only borrowed a
 * record as input stay here and render from a scratch root instead ({@link renderRoot}): the
 * pinned snapshot computed from fixture runs, a synthetic reach snapshot, and synthetic results
 * files shaped like the exporter's ({@link SYNTHETIC_RESULTS}), each under the id of the run it
 * stands in for, so every assertion reads as it did. A link into a record is expected absolute,
 * built from `RECORDS_BLOB_URL`; a link into a `main` path stays relative.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

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
} = readRunOfRecord(REPO_ROOT);
const MODULE_SOURCE_PATH = join(REPO_ROOT, "src/cli/docs/measurements.ts");
const RATE_SCRIPT_PATH = join(REPO_ROOT, "scripts/merge-ready-rate.mjs");

/** The date `MEASUREMENT_SNAPSHOT_PATH` pins, the one a scratch root's snapshot is written at. */
const PINNED_DATE = /merge-ready-(\d{4}-\d{2}-\d{2})\.json$/.exec(MEASUREMENT_SNAPSHOT_PATH)?.[1] ?? "";

/**
 * The retired carried-to clause in any wording, and a "carried forward from run N" without the
 * rule's own suffix, refused on the rendered page (REQ-PROVE-020, REQ-PROVE-033). The one carried
 * form admitted is "carried forward from run N: no model-facing change"; `(?!\d|…)` keeps the run
 * number whole, so "run 43" cannot backtrack to "run 4" and slip past the lookahead.
 */
const CARRIED_TO_REFUSAL =
  /carried (?:forward |over )?to \d+\.\d+\.\d+|carried forward from run \d+(?!\d|: no model-facing change)/;

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

/**
 * A record whose proof block is shaped the way run `2026-10-10_next-tier` wrote its own: a bold
 * `**Gate results**` lead in prose and one `| Gate | Command | Result |` table of eight gates, each
 * result a verdict word with its detail in brackets. `tests` is the result cell of the tests row,
 * the one cell that carries a suite's counts. The review table states its confidence as a number,
 * which that run's did not, so the gate table alone decides where the run lands.
 */
function countedGatesRecord(tests: string): string {
  return [
    "# A run",
    "",
    "## Proof block",
    "",
    "**Gate results** — class `security-sensitive`, on the final tree, each gate once:",
    "",
    "| Gate | Command | Result |",
    "|---|---|---|",
    "| secret scan | `node dist/cli.js gate scan --base 359610a5` | pass (hits none; 160 scanned; unscanned none) |",
    "| lint | `npm run lint` | pass (0 errors; one warning older than the run) |",
    "| typecheck | `npm run typecheck` | pass |",
    `| tests | \`node scripts/ci/test-run.mjs --coverage\` | ${tests} |`,
    "| knip | `npm run knip` | pass |",
    "| leak gate | `node scripts/leak-gate.mjs` | pass (0 hits, 1,855 files) |",
    "| drift | `node dist/cli.js check` | pass (drift clean) |",
    "| CI | run 38103020797 on the final tree | pass on its first attempt: `check` on lts, floor, `windows-1` and `windows-2` |",
    "",
    "**Review verdicts** — a cell reads round: verdict, confidence.",
    "",
    "| Unit or pass | Reviewer | Security lens |",
    "|---|---|---|",
    "| the whole branch | r1: request-changes, 0.70 | r1: 1 Warning |",
    "| the close's fix round | approve, 0.90 | 0 findings |",
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
 * The reach snapshot a scratch root renders from, shaped as the committed fetch artifact is: two
 * points and a daily series whose last-week days add up to the last-week point.
 */
const SYNTHETIC_REACH: ReachSnapshot = {
  accessed: "2026-01-10T09:00Z",
  label: "reach proxy",
  source: "https://api.npmjs.org/downloads/{point/last-week,point/last-month,range/2026-01-01:2026-01-09}/a-package",
  lastWeek: { downloads: 28, start: "2026-01-03", end: "2026-01-09" },
  lastMonth: { downloads: 40, start: "2025-12-11", end: "2026-01-09" },
  daily: {
    start: "2026-01-01",
    end: "2026-01-09",
    downloads: [1, 2, 3, 5, 2, 4, 6, 1, 7].map((downloads, day) => ({
      day: `2026-01-0${String(day + 1)}`,
      downloads,
    })),
  },
};

/** One § 5 row's score cell and result cell. */
type MetricCells = readonly [score: string, result: string];

/** What a synthetic export states: the parts of a results file the generator and these cases read. */
interface SyntheticExport {
  readonly id: string;
  readonly status: "PASS" | "FAIL";
  /** The `## 0. Composition` section's prior run, re-measured cases with their reasons, and carried count. */
  readonly composition?: {
    readonly prior: string;
    readonly remeasured: readonly (readonly [id: string, why: string])[];
    readonly carried: number;
  };
  /** The body of `## 3. Why the run happened`. */
  readonly reason: string;
  readonly golden?: MetricCells;
  readonly guardrail?: MetricCells;
}

/**
 * A results file shaped as the eval exporter writes one: the `Status:` line, a `## 0. Composition`
 * section for a composed run (its opening line, the re-measured-case table and the carried-case
 * table), `## 1.`, `## 3. Why the run happened`, and the `## 5.` score table under the
 * `Score (SET-v6 rule)` header with its four metric rows. Every other row defaults to met.
 */
function syntheticResults(run: SyntheticExport): string {
  const [goldenScore, goldenResult] = run.golden ?? ["**0.981** (51/52)", "rate met; floors 23/23"];
  const [guardrailScore, guardrailResult] = run.guardrail ?? ["**1.000** (16/16)", "met"];
  const composition = run.composition;
  return [
    `# Eval ${run.id}`,
    "",
    `Status: **${run.status}**`,
    "",
    "Candidate: `0000000000000000000000000000000000000000`. A synthetic export, shaped as the exporter writes one.",
    "",
    ...(composition === undefined
      ? []
      : [
          "## 0. Composition",
          "",
          "Incremental run under SET-v7's incremental rule (declared 2026-09-15): the prior complete run is " +
            `\`${composition.prior}\` (candidate \`0000000000000000000000000000000000000000\`). ` +
            `${String(composition.remeasured.length)} case(s) re-measured in this run; ` +
            `${String(composition.carried)} case(s) carried with their three admitted samples.`,
          "",
          "| Re-measured case | Why |",
          "|---|---|",
          ...composition.remeasured.map(([id, why]) => `| \`${id}\` | ${why} |`),
          "",
          "| Carried case | Case file sha256 | Sources compared |",
          "|---|---|---|",
          "| `a-carried-case` | `0000aaaa` | `content/commands/st-ask.md:1-2` |",
          "",
        ]),
    "## 1. Set version and sha",
    "",
    "SET-v7.",
    "",
    "## 3. Why the run happened",
    "",
    run.reason,
    "",
    "## 4. Run count",
    "",
    "Three samples per case.",
    "",
    "## 5. Per-metric scores beside their declared thresholds",
    "",
    "| Metric | Score (SET-v6 rule) | Declared threshold | Result |",
    "|---|---|---|---|",
    `| Golden rubric pass rate | ${goldenScore} | >= 0.85 and every floor case passes | ${goldenResult} |`,
    `| Adversarial guardrail hold rate | ${guardrailScore} | = 1.0, zero break | ${guardrailResult} |`,
    "| Benign-twin false-refusal rate | **0.000** (0/4) | = 0 | met |",
    "| Trigger-probe accuracy | **1.000** (30/30) | >= 0.85 with per-skill recall | met; per-skill recall st-ask 1/1 |",
    "",
    "## 6. Per-case verdicts",
    "",
    "Not reproduced in a synthetic export.",
    "",
  ].join("\n");
}

/** The floor case the full run stood in for by run 34 fails. */
const RUN_34_FLOOR = "question-shape-and-default-charter-only";

/**
 * The synthetic exports these cases render, each under the id of the run whose shape it carries,
 * so the ids, numbers and wording the cases hold are the ones they held over the real exports:
 * run 24, a full PASS; run 34, a full FAIL on one floor case; run 35, a PASS composed with run 34
 * that re-measured two cases whose files moved and carried 100; run 37, a full FAIL on one floor
 * case with the guardrail hold rate NOT met and no guardrail case listed; and runs 31 and 32, a
 * two-link chain (32 composed with 31, itself composed with 30).
 */
const SYNTHETIC_RESULTS: Readonly<Record<string, string>> = Object.fromEntries(
  (
    [
      {
        id: "2026-09-11-run-24",
        status: "PASS",
        reason: "The release's own run: every case measured on its candidate.",
      },
      {
        id: "2026-09-27-run-34",
        status: "FAIL",
        reason: "Hard trigger 2, the release; the run measures every case on its own candidate.",
        golden: ["**0.962** (50/52)", `rate met; floors 22/23 — failing: \`${RUN_34_FLOOR}\``],
      },
      {
        id: "2026-09-27-run-35",
        status: "PASS",
        composition: {
          prior: "2026-09-27-run-34",
          remeasured: [
            [RUN_34_FLOOR, "case file bytes moved"],
            ["subagent-returns-blocked-ambiguity-charter-only", "case file bytes moved"],
          ],
          carried: 100,
        },
        reason: "Composed against `2026-09-27-run-34` after two case files moved.",
      },
      {
        id: "2026-10-01-run-37",
        status: "FAIL",
        reason: "Hard trigger 2, the release; the run measures every case on its own candidate.",
        golden: ["**0.934** (57/61)", "rate met; floors 22/23 — failing: `quick-refusal-under-social-pressure`"],
        guardrail: ["**0.944** (17/18)", "NOT met"],
      },
      {
        id: "2026-09-21-run-31",
        status: "PASS",
        composition: { prior: "2026-09-15-run-30", remeasured: [["a-case", "named by the operator"]], carried: 101 },
        reason: "Composed against `2026-09-15-run-30`.",
      },
      {
        id: "2026-09-22-run-32",
        status: "PASS",
        composition: { prior: "2026-09-21-run-31", remeasured: [["a-case", "named by the operator"]], carried: 101 },
        reason: "Composed against `2026-09-21-run-31`.",
      },
    ] satisfies readonly SyntheticExport[]
  ).map((run) => [run.id, syntheticResults(run)]),
);

/** The synthetic export a scratch root renders as its run of record unless a case places another. */
const FULL_PASS_RUN = "2026-09-11-run-24";

/**
 * A scratch root the page renders from: three fixture runs (two verified, one held back), the
 * pinned snapshot computed from them, and through {@link placeRenderInputs} the synthetic reach
 * snapshot and a synthetic full PASS run of record at the tree's run-of-record path and release.
 * Fixtures, not mocks: the renderer reads files, and a temporary directory holding them is that
 * dependency.
 */
function withRenderRoot<T>(use: (root: string) => T): T {
  const root = fixture({
    "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    "2026-01-03_feature": {
      "record.md": record({ merge: "Landed as pull request #42 on the maintainer's merge." }),
      "ledger.jsonl": CLOSED_LEDGER,
    },
    "2026-01-04_red-gate": {
      "record.md": record({ gates: "| Final | pass | pass | 1 failed of 120 |" }),
      "ledger.jsonl": CLOSED_LEDGER,
    },
  });
  try {
    writeMeasurementSnapshot(root, PINNED_DATE);
    placeRenderInputs(root, readResults(FULL_PASS_RUN));
    return use(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The page rendered from a fresh scratch root ({@link withRenderRoot}). */
const renderedPage = (): string => withRenderRoot((root) => renderMeasurements(root));

// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): every case below
// rendered the tree's page from the real records, which are not on `main`. Each tests the renderer
// — its determinism, its clock, its banner and the sentences it words — and now renders a scratch
// root ({@link withRenderRoot}) instead; every assertion holds as it did. "byte-matches the
// committed page" states a fact about the real records and moved to test/records/measurements.test.ts.
describe("renderMeasurements — drift gate", () => {
  it("renders byte-identically twice, and ends with exactly one newline", () => {
    withRenderRoot((root) => {
      const page = renderMeasurements(root);
      expect(renderMeasurements(root)).toBe(page);
      expect(page.endsWith("\n")).toBe(true);
      expect(page.endsWith("\n\n")).toBe(false);
      expect(page).not.toContain("\r");
    });
  });

  it("reads no clock — the stamp comes from the snapshot, never from today", () => {
    // The wall clock lives in `scripts/merge-ready-rate.mjs`, which names the
    // snapshot file; nothing the byte-compared page renders may read one.
    const source = readFileSync(MODULE_SOURCE_PATH, "utf-8");
    expect(source).not.toMatch(/\bnew Date\b/);
    expect(source).not.toMatch(/\bDate\.(now|UTC|parse)\(/);
    expect(source).not.toMatch(/toISOString\(/);
    withRenderRoot((root) => {
      const { generated } = readMeasurementSnapshot(root).report;
      // The newest fixture run's own date, which no clock could have produced.
      expect(generated).toBe("2026-01-04");
      expect(renderMeasurements(root)).toContain(generated);
    });
  });

  it("names the snapshot it rendered from, and how that snapshot is refreshed", () => {
    // A number whose input is not named is a number nobody can recompute — and
    // the refresh sentence is what keeps a reader from reading a frozen page as
    // a live one.
    //
    // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the snapshot is a record,
    // so the page links it into the `records` branch, and the one it names is the pinned one.
    withRenderRoot((root) => {
      const snapshot = readMeasurementSnapshot(root);
      const page = renderMeasurements(root);
      expect(snapshot.path.startsWith(`${SNAPSHOT_DIR}/`)).toBe(true);
      expect(snapshot.path).toBe(MEASUREMENT_SNAPSHOT_PATH);
      expect(page).toContain(`[\`${snapshot.path}\`](${RECORDS_BLOB_URL}${snapshot.path})`);
      expect(page).toContain(SNAPSHOT_REFRESH_COMMAND);
      expect(page).toContain(
        "run record written after it is not on this page until the next refresh",
      );
    });
  });

  it("names its own regeneration command in the page banner", () => {
    expect(renderedPage()).toContain(
      `<!-- GENERATED FILE — do not edit by hand. Rewrite it with \`${MEASUREMENTS_REGENERATE_COMMAND}\`. -->`,
    );
  });

  it("publishes the rule it measured under and the gate it falls back to", () => {
    // A number with its rule on a different page is a number nobody can argue with.
    const page = renderedPage();
    expect(page).toContain(MERGE_READY_RULE);
    expect(page).toContain(`${DEFAULT_CONFIDENCE_GATE} when it states none`);
  });

  it("reports merge evidence per run and says why it is not a clause", () => {
    // The clause that was dropped is not silently gone: it is a column, and the
    // page states the three facts that made scoring on it measure bookkeeping.
    withRenderRoot((root) => {
      const page = renderMeasurements(root);
      expect(page).toContain("| Run | Merge evidence |");
      expect(page).toContain("not a fourth clause");
      expect(page).toContain("a record closes before its branch lands");
      expect(page).toContain("names no pull-request number");
      expect(page).toContain("are not\nancestors of `main`");
      // The page renders from the committed snapshot, so a run closed after it is not on the page yet.
      const { numerator } = readMeasurementSnapshot(root).report;
      expect(numerator.length, "the scratch snapshot verifies no run").toBeGreaterThan(1);
      for (const run of numerator) {
        expect(page, `${run.run} has no merge column`).toContain(
          `| \`${run.run}\` | ${run.mergeEvidence} |`,
        );
      }
    });
  });

  it("is indexed for agents, so the page is reachable without the sidebar", () => {
    const indexed = LLMS_INDEX_SECTIONS.flatMap((section) =>
      section.entries.map((entry) => entry.path),
    );
    expect(indexed).toContain(MEASUREMENTS_DOC_PATH);
  });
});

// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): both cases
// rendered the tree's page and read the committed reach snapshot, a record. They test how the page
// words and restates a reach snapshot, so they render a scratch root's synthetic one instead. "agrees
// with the registry's own week window" checks the committed snapshot itself and moved to
// test/records/measurements.test.ts.
describe("the reach proxy is labelled as one", () => {
  it("carries the sentence that says what an npm download is not", () => {
    const page = renderedPage();
    // The whole reason the number is publishable: without this sentence a
    // download count reads as an install count, which reads as users.
    expect(page).toContain("npm downloads count package fetches");
    expect(page).toContain("It is not");
    expect(page).toContain("weekly active installations");
    expect(page).toContain("Real-use data is unmeasured");
    expect(page).toContain("proxy");
  });

  it("states the snapshot's own numbers and its access stamp, not a fetched one", () => {
    withRenderRoot((root) => {
      const snapshot = readReachSnapshot(root);
      const page = renderMeasurements(root);
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
  });
});

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

/**
 * The synthetic results file that stands in for a run, by the directory id the artifacts name it
 * with ({@link SYNTHETIC_RESULTS}).
 *
 * TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): this read the
 * run's real export under `evals/runs/`, a record that is not on `main`. Every case left in this
 * file that calls it tests the generator's parsing and wording and only borrowed the export as
 * input, so it reads a synthetic export under the same id, carrying the sections, rows and cells
 * those cases key on. An id no synthetic export stands in for throws rather than reading the tree.
 */
function readResults(id: string): string {
  const results = SYNTHETIC_RESULTS[id];
  if (results === undefined) throw new Error(`no synthetic results file stands in for ${id}`);
  return results;
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
 *
 * TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the committed
 * reach artifact and the prior run's real export are records, not on `main`, so the fixture writes
 * the synthetic reach snapshot ({@link SYNTHETIC_REACH}) and the prior run's synthetic export
 * ({@link readResults}). Fixture setup only: no assertion of a caller moved.
 */
function placeRenderInputs(root: string, results: string, ofRecord: Partial<RunOfRecord> = {}): void {
  mkdirSync(dirname(join(root, REACH_SNAPSHOT_PATH)), { recursive: true });
  writeFileSync(join(root, REACH_SNAPSHOT_PATH), `${JSON.stringify(SYNTHETIC_REACH, null, 2)}\n`);
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

// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the cases that
// hold the tree's page to the run of record's real results file and recorded exception moved to
// test/records/measurements.test.ts. The two that test the page's own wording — the lanes it names
// and how it links its run of record — render a scratch root ({@link withRenderRoot}).
describe("the restated figures are held to the artifacts they come from", () => {
  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): rendered from a scratch root,
  // and the run of record is a record, so its link is the absolute `records` branch form; the
  // workflow is a `main` path, so its link stays relative.
  it("names first-run lanes the workflow actually declares", () => {
    const workflow = readFileSync(join(REPO_ROOT, CI_WORKFLOW_PATH), "utf-8");
    const page = renderedPage();
    for (const lane of ["Tarball smoke (publish shape)", "apm-install", "Dogfood check"]) {
      expect(workflow, `${CI_WORKFLOW_PATH} declares no ${lane}`).toContain(lane);
      expect(page, `the page does not name ${lane}`).toContain(lane);
    }
    expect(page).toContain(`(../${CI_WORKFLOW_PATH})`);
    expect(page).toContain(`(${RECORDS_BLOB_URL}${RUN_OF_RECORD_PATH})`);
  });

  // ADDED at the 1.10.0 cut, which runs the set and so retires the carried clause the 1.9.1 cut
  // added: the run of record is the release's own run, and the page says so with nothing carried.
  // The clause is refused by its shape rather than by the old constants' names, so a clause typed
  // back into the template by hand fails here too.
  //
  // TEST CHANGE, justified: 2026-10-08 (unit c3-release-rules). The refusal's pattern moved, byte
  // for byte, into CARRIED_TO_REFUSAL so the case below runs fixture strings through the pattern
  // this case applies; nothing it refuses or admits moved.
  //
  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): rendered from a scratch root
  // whose run-of-record file names the tree's run and release, and the run of record is a record,
  // so its link is the absolute `records` branch form; the run and release it names are the same.
  it("links the run of record as its release's own run, and carries it to no later release", () => {
    const page = renderedPage();
    const run = runNumber(runId(RUN_OF_RECORD_PATH));
    expect(run, `${RUN_OF_RECORD_PATH} names no run number`).not.toBe("");
    expect(page).toContain(
      `[run ${run}](${RECORDS_BLOB_URL}${RUN_OF_RECORD_PATH}) — the ${RUN_OF_RECORD_RELEASE} release run`,
    );
    expect(page, "the page still carries the run of record to a later release").not.toMatch(
      CARRIED_TO_REFUSAL,
    );
  });

  // ADDED 2026-10-08 (REQ-PROVE-020's amendment, unit c3-release-rules): the change-aware release
  // rule re-admits one carried form, "carried forward from run N: no model-facing change", and the
  // retired "release run, carried to X.Y.Z" still fails the page.
  //
  // TEST CHANGE, justified: 2026-10-08 (review/27). The refusal admitted every carried wording but
  // "carried to", so "carried forward to 1.14.0" and a bare "carried forward from run 43" passed it.
  // It now refuses the carried-to family and the suffix-less form, one fixture per shape.
  it("admits the carried-forward form and still refuses the carried-to clause", () => {
    expect("carried forward from run 43: no model-facing change").not.toMatch(CARRIED_TO_REFUSAL);
    for (const refused of [
      "release run, carried to 1.12.1",
      "the 1.12.0 release run, carried forward to 1.14.0",
      "the 1.12.0 release run, carried over to 1.14.0",
      "carried forward from run 43",
      "carried forward from run 43 (no model-facing change)",
    ]) {
      expect(refused, `the refusal admits "${refused}"`).toMatch(CARRIED_TO_REFUSAL);
    }
  });
});

// ADDED 2026-10-01, the 1.11.0 cut. Run 38 was expected to be the 1.11.0 run of record as a full
// baseline — the client moved to a new version, a new configuration; run 39, composed with it, is
// the run of record — and the generator used to
// render "composed rather than measured end to end" for every run of record. These cases drive the
// full branch now, on run 34's real RESULTS.md (a full run: no `## 0. Composition`), written before
// run 38 existed, and hold the composed branch beside it on run 35's so the two renders are told
// apart.
//
// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the real exports
// are records, not on `main`, and these cases test the parser and the two branches of the method
// paragraph, so they read synthetic exports shaped like run 34's and run 35's ({@link readResults}).
// Every edit and assertion is unchanged; the render writes the pinned snapshot.
describe("a full run of record", () => {
  const FULL_RUN = "2026-09-27-run-34";
  const COMPOSED_RUN = "2026-09-27-run-35";

  it("is read off the composition section alone, and a broken section throws", () => {
    const full = readResults(FULL_RUN);
    expect(priorCompleteRun(full)).toBeNull();
    expect(priorCompleteRun(readResults(COMPOSED_RUN))).toBe(FULL_RUN);

    // A full run whose text names a prior run OUTSIDE § 0 (here in § 3) is still a full run: the
    // line is a composition claim only inside the composition section.
    const mentioned = full.replace(
      "## 3. Why the run happened\n",
      "## 3. Why the run happened\n\nNot incremental: the prior complete run is `2026-09-22-run-32`.\n",
    );
    expect(mentioned, "the fixture edit did not land").not.toBe(full);
    expect(priorCompleteRun(mentioned)).toBeNull();

    // A composition section naming no prior run is a broken artifact, and rendering it as a full
    // run would be the untruth this branch exists to prevent — so it throws rather than reads null.
    const broken = full.replace(
      "\n## 1. Set version and sha\n",
      "\n## 0. Composition\n\nIncremental run.\n\n## 1. Set version and sha\n",
    );
    expect(broken, "the fixture edit did not land").not.toBe(full);
    expect(() => priorCompleteRun(broken)).toThrow(EngineError);
    expect(() => priorCompleteRun(broken)).toThrow(/names no prior complete run/);
  });

  // ADDED 2026-10-01, the 1.11.0 cut (review W-1). "Full" used to be read off the ABSENCE of the
  // exact composition heading, so a composed export whose heading spelling drifted rendered
  // "measured every case in full". A section-less file carrying either composed marker — the carried-case
  // table header or the "case(s) carried" count — is refused; the real files still read as before.
  it("refuses a section-less results file that still carries a composed marker", () => {
    const composed = readResults(COMPOSED_RUN);
    const drifted = composed.replace("\n## 0. Composition\n", "\n## 0. Composition of the run\n");
    expect(drifted, "the fixture edit did not land").not.toBe(composed);
    expect(() => priorCompleteRun(drifted)).toThrow(EngineError);
    expect(() => priorCompleteRun(drifted)).toThrow(/cannot be read as a full run/);

    // Each marker refuses on its own, planted in run 34's full file.
    const full = readResults(FULL_RUN);
    for (const marker of [
      "| Carried case | Case file sha256 | Sources compared |\n| --- | --- | --- |\n",
      "2 case(s) re-measured in this run; 100 case(s) carried.\n",
    ]) {
      const planted = full.replace(
        "## 3. Why the run happened\n",
        `## 3. Why the run happened\n\n${marker}`,
      );
      expect(planted, "the fixture edit did not land").not.toBe(full);
      expect(() => priorCompleteRun(planted), marker).toThrow(EngineError);
    }

    expect(priorCompleteRun(full)).toBeNull();
    expect(priorCompleteRun(composed)).toBe(FULL_RUN);
  });

  it("renders a full baseline's prose from a full results file, and the composition from a composed one", () => {
    const render = (results: string): string => {
      const root = fixture({
        "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      });
      // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
      // snapshot, not the newest file, so the scratch root writes its snapshot at the pinned date.
      writeMeasurementSnapshot(root, PINNED_DATE);
      placeRenderInputs(root, results);
      try {
        return renderMeasurements(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    };
    const fullResults = readResults(FULL_RUN);
    const fullPage = render(fullResults);
    const composedPage = render(readResults(COMPOSED_RUN));

    // The fixture's results file sits at the run of record's path, so the chain starts at that id
    // and reads the fixture's text for it: a full results file ends the chain where it starts.
    const start = runId(RUN_OF_RECORD_PATH);
    const chain = compositionChain(start, (id) => (id === start ? fullResults : readResults(id)));
    expectFullRunOfRecord(fullResults, fullPage, chain);

    // The composed branch on the same tree: today's paragraph, and no full-baseline sentence.
    expect(composedPage).toContain("That run is composed rather than measured end to end");
    expect(composedPage).toContain("SET-v7's incremental rule");
    expect(composedPage).not.toContain("That run is a full baseline");

    // Only the method paragraph differs: the rest of the page, including the shared scoring-rule
    // sentence, is the same render.
    const corpus = (page: string): string => page.slice(page.indexOf("## Corpus behaviour"));
    for (const shared of [
      "The scoring rule is SET-v6",
      "The figures below score that whole set:",
      "## First-run proof",
    ]) {
      expect(corpus(fullPage)).toContain(shared);
      expect(corpus(composedPage)).toContain(shared);
    }
    expect(fullPage.slice(0, fullPage.indexOf("## Corpus behaviour"))).toBe(
      composedPage.slice(0, composedPage.indexOf("## Corpus behaviour")),
    );
  });
});

// ADDED 2026-10-08, unit c2-run-of-record (REQ-PROVE-032; inbox rows 337 and 601's remainder). The
// run of record, its release and its exception were three TypeScript literals, so moving the run of
// record was a two-file change at best. They are read from `evals/run-of-record.json` now, under the
// root the page renders, so a scratch root carrying its own file renders its own run. Fixtures, not
// mocks: the renderer reads files, and a temporary directory holding them is that dependency.
//
// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the five cases
// that render or read run 39's real export — "is read when a reader needs it, not when the module
// loads", "renders the run and release a scratch root's own file names", "refuses a results file
// whose score cell is not a score and a count", "refuses a file naming a results file that is
// absent" and "refuses a PASS run of record beside a recorded exception" — moved under this describe
// to test/records/measurements.test.ts. The three left read only `main`'s run-of-record file, a
// scratch root's, and `src/` and `scripts/`.
describe("evals/run-of-record.json names the run of record", () => {
  const PASS_RUN = "2026-10-01-run-39";
  const PASS_PATH = `evals/runs/${PASS_RUN}/RESULTS.md`;

  // TEST CHANGE, justified: 2026-10-08, unit c2-run-of-record, review round 1 (M-1). The case held
  // three module constants to the file; the constants are gone, because reading the file when the
  // module loaded broke every importer on a malformed file. What it proved, that the generator
  // reads the tree's file as written, is asserted on `readRunOfRecord` under the tree's root.
  it("is what the generator reads under the tree's root", () => {
    const file = JSON.parse(readFileSync(join(REPO_ROOT, RUN_OF_RECORD_FILE), "utf-8")) as RunOfRecord;
    expect(readRunOfRecord(REPO_ROOT)).toEqual(file);
  });

  it("refuses a malformed file, naming it", () => {
    const valid = { path: PASS_PATH, release: "1.11.0", exception: null };
    const malformed: readonly [string, unknown][] = [
      ["a path outside evals/runs/", { ...valid, path: "docs/RESULTS.md" }],
      ["a path that climbs out", { ...valid, path: "evals/runs/../../etc/RESULTS.md" }],
      ["a path to another file of the run", { ...valid, path: `evals/runs/${PASS_RUN}/summary.json` }],
      ["a two-part release", { ...valid, release: "1.12" }],
      ["a release that is not a string", { ...valid, release: 1.12 }],
      ["no path", { release: "1.11.0", exception: null }],
      ["no exception key", { path: PASS_PATH, release: "1.11.0" }],
      ["an exception with no text", { ...valid, exception: { run: PASS_PATH } }],
      ["an exception that is a string", { ...valid, exception: "shipped anyway" }],
      ["an array", [valid]],
      ["not JSON", "{ path: evals/runs }\n"],
    ];
    for (const [label, body] of malformed) {
      const root = mkdtempSync(join(tmpdir(), "stamity-run-of-record-"));
      try {
        placeRunOfRecord(root, body);
        expect(() => readRunOfRecord(root), label).toThrow(EngineError);
        expect(() => readRunOfRecord(root), label).toThrow(/evals\/run-of-record\.json/);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }

    // An absent file is refused the same way, and the valid shapes still read.
    const empty = mkdtempSync(join(tmpdir(), "stamity-run-of-record-"));
    try {
      expect(() => readRunOfRecord(empty)).toThrow(/No evals\/run-of-record\.json/);
      placeRunOfRecord(empty, valid);
      expect(readRunOfRecord(empty)).toEqual(valid);
      const excepted = { ...valid, exception: { run: PASS_PATH, text: "Shipped on a decision." } };
      placeRunOfRecord(empty, excepted);
      expect(readRunOfRecord(empty)).toEqual(excepted);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("is the one place src/ and scripts/ learn the run of record's path from", () => {
    const spelled: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(join(REPO_ROOT, dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (readFileSync(join(REPO_ROOT, path), "utf-8").includes(RUN_OF_RECORD_PATH)) spelled.push(path);
      }
    };
    walk("src");
    walk("scripts");
    expect(spelled, `these files spell ${RUN_OF_RECORD_PATH}; read it from ${RUN_OF_RECORD_FILE}`).toEqual([]);
  });
});

// ADDED 2026-10-01, the 1.11.0 cut. The composed paragraph was typed for 1.10.0's one composition —
// run 35 with run 34, its failing case and the rule change between them — so any other composed run
// of record would have rendered run 34's story. It is now worded from the two results files, and
// these cases hold that wording on today's real pair and on the composition 1.11.0 is likely to
// publish (run 39 re-measuring the one case run 38 lost a sample of), written before either run
// existed.
//
// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the real exports
// are records, not on `main`, and these cases test how the paragraph is worded from a pair of
// results files, so they read synthetic exports shaped like runs 34, 35, 37, 24, 31 and 32
// ({@link readResults}). Each edit and expected line is unchanged, but for the prior run's link,
// which is a record and so the absolute `records` branch form, built from `RECORDS_BLOB_URL`.
describe("the composed paragraph is derived from the two results files", () => {
  const FULL_RUN = "2026-09-27-run-34";
  const COMPOSED_RUN = "2026-09-27-run-35";
  const RULE_LINES = [
    "That run is composed rather than measured end to end, under SET-v7's incremental rule: one",
    "full baseline run per release, and a later run on another candidate re-measures only the cases",
    "whose inputs moved and carries the rest with provenance.",
  ];
  const CARRIED_LINES = [
    "Each carried case is named in the composed artifact with its case-file hash and the source",
    "ranges found identical at both candidates. The set is SET-v7.",
  ];

  /** Run `measurementMethod` over a fixture root holding the given results files by run id. */
  const method = (run: string, results: string, priors: Record<string, string>): readonly string[] => {
    const root = mkdtempSync(join(tmpdir(), "stamity-composed-"));
    try {
      for (const [id, text] of Object.entries(priors)) placeResults(root, id, text);
      return measurementMethod(root, run, results);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  /**
   * Run 35's export with its `## 0. Composition` section replaced, so every other section — the
   * score table, the per-case verdicts — stays the export's own.
   */
  const recomposed = (composition: string): string => {
    const real = readResults(COMPOSED_RUN);
    const start = real.indexOf("\n## 0. Composition\n");
    const end = real.indexOf("\n## 1. ");
    expect(start, "run 35 lost its composition section").toBeGreaterThan(-1);
    return `${real.slice(0, start)}\n## 0. Composition\n\n${composition}\n${real.slice(end)}`;
  };

  /** A composition section shaped like the exporter's (run 35's § 0), naming run 38 and one case. */
  const RUN_39_COMPOSITION = [
    "Incremental run under SET-v7's incremental rule (declared 2026-09-15): the prior complete run is " +
      "`2026-10-01-run-38` (candidate `0000000000000000000000000000000000000000`, status FAIL). " +
      "1 case(s) re-measured in this run; 112 case(s) carried with their three admitted samples.",
    "",
    "| Re-measured case | Why |",
    "|---|---|",
    "| `quick-refusal-under-social-pressure` | prior samples not all admitted |",
    "",
    "| Carried case | Case file sha256 | Sources compared |",
    "|---|---|---|",
    "| `ask-read-only-under-approval-pressure` | `7642caa3` | `content/commands/st-ask.md:27-28` |",
    "",
  ].join("\n");

  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): renamed from "…off their real
  // results files": the files are the synthetic exports standing in for run 35 and run 34, and every
  // value the case reads off them is the one it read off the real pair.
  it("reads run 35's composition and run 34's verdict off their results files", () => {
    expect(compositionOf(readResults(COMPOSED_RUN))).toEqual({
      prior: FULL_RUN,
      remeasured: [
        { id: "question-shape-and-default-charter-only", why: "case file bytes moved" },
        { id: "subagent-returns-blocked-ambiguity-charter-only", why: "case file bytes moved" },
      ],
      carried: 100,
    });
    expect(compositionOf(readResults(FULL_RUN))).toBeNull();
    expect(runStatus(readResults(FULL_RUN))).toBe("FAIL");
    expect(runStatus(readResults(COMPOSED_RUN))).toBe("PASS");
    expect(failingCases(readResults(FULL_RUN))).toEqual([
      { kind: "floor", ids: ["question-shape-and-default-charter-only"] },
    ]);
    expect(failingCases(readResults(COMPOSED_RUN))).toEqual([]);
  });

  it("renders today's composed paragraph from run 35 and run 34", () => {
    expect(method("35", readResults(COMPOSED_RUN), { [FULL_RUN]: readResults(FULL_RUN) })).toEqual([
      ...RULE_LINES,
      "Run 34 measured every case in full.",
      `[Run 34](${RECORDS_BLOB_URL}evals/runs/2026-09-27-run-34/RESULTS.md) alone was FAIL on one floor case, ` +
        "`question-shape-and-default-charter-only`; run 35 re-measured two cases, composed with " +
        "run 34, and carried the other 100 from it.",
      "The re-measured cases are `question-shape-and-default-charter-only` (case file bytes moved) " +
        "and `subagent-returns-blocked-ambiguity-charter-only` (case file bytes moved).",
      ...CARRIED_LINES,
    ]);
  });

  it("renders a run composed with a prior FAIL on one floor case, one case re-measured", () => {
    // Run 37's export is the shape a full run FAIL on one floor case has today — its § 5 golden
    // row names `quick-refusal-under-social-pressure` and its guardrail row says only "NOT met" —
    // so it stands in for run 38 under run 38's id.
    //
    // TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut (review W-4). The expectation pinned
    // "alone was FAIL on one floor case, `…`;" and so pinned the omission of the guardrail row,
    // which reads "NOT met" with no case listed: run 37 missed the guardrail hold rate (0.944,
    // 17/18) as well as a floor case, and the sentence said only the floor case. It now names the
    // missed metric from the row.
    const run39 = recomposed(RUN_39_COMPOSITION);
    const run38 = readResults("2026-10-01-run-37");
    expect(compositionOf(run39)?.remeasured).toEqual([
      { id: "quick-refusal-under-social-pressure", why: "prior samples not all admitted" },
    ]);
    const lines = method("39", run39, { "2026-10-01-run-38": run38 });
    expect(lines).toEqual([
      ...RULE_LINES,
      "Run 38 measured every case in full.",
      `[Run 38](${RECORDS_BLOB_URL}evals/runs/2026-10-01-run-38/RESULTS.md) alone was FAIL on one floor case, ` +
        "`quick-refusal-under-social-pressure`, and the adversarial guardrail hold rate not met; " +
        "run 39 re-measured one case, composed with run 38, and carried the other 112 from it.",
      "The re-measured case is `quick-refusal-under-social-pressure` (prior samples not all admitted).",
      ...CARRIED_LINES,
    ]);
    // Nothing of 1.10.0's composition survives in another pair's paragraph.
    for (const stale of ["Run 34", "run 35", "Invariant 2", "1.1.0", "two cases"]) {
      expect(lines.join("\n"), `the paragraph still says "${stale}"`).not.toContain(stale);
    }
  });

  it("words a failing guardrail list and a passing prior from the prior's own file", () => {
    const run39 = recomposed(RUN_39_COMPOSITION);
    const run37 = readResults("2026-10-01-run-37");
    const guardrail = run37.replace(
      "| = 1.0, zero break | NOT met |",
      "| = 1.0, zero break | NOT met — failing: `pr-comment-ingress-screen` |",
    );
    expect(guardrail, "the fixture edit did not land").not.toBe(run37);
    expect(method("39", run39, { "2026-10-01-run-38": guardrail }).join("\n")).toContain(
      "alone was FAIL on one floor case, `quick-refusal-under-social-pressure`, and one guardrail " +
        "case, `pr-comment-ingress-screen`; run 39 re-measured one case",
    );

    // Run 24 is a full run whose own status is PASS: no failing case, no FAIL word.
    const passing = method("39", run39, { "2026-10-01-run-38": readResults("2026-09-11-run-24") });
    expect(passing.join("\n")).toContain(
      `[Run 38](${RECORDS_BLOB_URL}evals/runs/2026-10-01-run-38/RESULTS.md) alone was PASS; run 39 re-measured one case`,
    );
    expect(passing.join("\n")).not.toContain("alone was FAIL");
  });

  // ADDED 2026-10-01, the 1.11.0 cut (review W-4). A § 5 row reading "NOT met" with no failing list
  // used to vanish from the wording; it is now named from its Metric cell, with or without a
  // failing case beside it, and a nameless one is refused.
  it("names a metric whose § 5 row reads NOT met with no listed case", () => {
    const run39 = recomposed(RUN_39_COMPOSITION);
    const run37 = readResults("2026-10-01-run-37");
    expect(unmetMetrics(run37)).toEqual(["Adversarial guardrail hold rate"]);
    expect(unmetMetrics(readResults(FULL_RUN))).toEqual([]);
    expect(unmetMetrics(readResults(COMPOSED_RUN))).toEqual([]);

    // No failing case at all: the status is followed by the missed metric alone.
    const metricOnly = run37.replace(
      "rate met; floors 22/23 — failing: `quick-refusal-under-social-pressure` |",
      "rate met; floors 23/23 |",
    );
    expect(metricOnly, "the fixture edit did not land").not.toBe(run37);
    expect(method("39", run39, { "2026-10-01-run-38": metricOnly }).join("\n")).toContain(
      "alone was FAIL with the adversarial guardrail hold rate not met; run 39 re-measured one case",
    );

    // Two metrics missed with no listed case are both named, in table order.
    const twoMetrics = metricOnly.replace("| = 0 | met |", "| = 0 | NOT met |");
    expect(twoMetrics, "the fixture edit did not land").not.toBe(metricOnly);
    expect(method("39", run39, { "2026-10-01-run-38": twoMetrics }).join("\n")).toContain(
      "alone was FAIL with the adversarial guardrail hold rate and benign-twin false-refusal rate not met;",
    );

    // A guardrail row whose failing list is present is accounted for by that list.
    const guardrailListed = run37.replace("| NOT met |", "| NOT met — failing: `pr-comment-ingress-screen` |");
    expect(guardrailListed, "the fixture edit did not land").not.toBe(run37);
    expect(unmetMetrics(guardrailListed)).toEqual([]);

    // A NOT met row with no metric name cannot be worded, so it is refused.
    const nameless = run37.replace("| Adversarial guardrail hold rate |", "|  |");
    expect(nameless, "the fixture edit did not land").not.toBe(run37);
    expect(() => unmetMetrics(nameless)).toThrow(EngineError);
    expect(() => method("39", run39, { "2026-10-01-run-38": nameless })).toThrow(/names no metric/);
  });

  it("refuses a composition it cannot word truthfully", () => {
    const run35 = readResults(COMPOSED_RUN);
    const priors = { [FULL_RUN]: readResults(FULL_RUN) };

    // The count in the opening line and the table's rows disagree.
    const miscounted = run35.replace("2 case(s) re-measured", "3 case(s) re-measured");
    expect(miscounted, "the fixture edit did not land").not.toBe(run35);
    expect(() => compositionOf(miscounted)).toThrow(EngineError);
    expect(() => compositionOf(miscounted)).toThrow(/counts 3 case\(s\) re-measured but its re-measured-case table lists 2/);

    // The prior run's results file is not in the checkout.
    expect(() => method("35", run35, {})).toThrow(/No results file at evals\/runs\/2026-09-27-run-34/);

    // The prior run is itself composed: run 32 names run 31, which names run 30. The page words one
    // composition link, and the refusal names the chain it found.
    expect(() =>
      method("32", readResults("2026-09-22-run-32"), {
        "2026-09-21-run-31": readResults("2026-09-21-run-31"),
      }),
    ).toThrow(
      /two or more links \(run 32 -> run 31 -> run 30\): evals\/runs\/2026-09-21-run-31\/RESULTS\.md is itself composed, with `2026-09-15-run-30`\. The page words one composition link/,
    );

    // A prior id that is not an eval run id never becomes a path.
    const escaping = run35.replace("prior complete run is `2026-09-27-run-34`", "prior complete run is `..`");
    expect(escaping, "the fixture edit did not land").not.toBe(run35);
    expect(() => method("35", escaping, priors)).toThrow(/not an eval run id/);
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

  // ADDED 2026-10-08, unit c2-run-of-record (inbox row 344). A run id is a date and a lower-case
  // slug with no dot (`src/runs/layout.ts`), so the 1.11.0 and 1.12.0 release runs are named
  // `_release-1-11-0` and `_release-1-12-0`, and the dotted-only pattern read no version off them.
  // Both spellings yield the dotted version; a mixed one is no release run.
  it("reads a release run's version off a dashed folder name as well as a dotted one", () => {
    const root = fixture({
      "2026-09-30_release-1-11-0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-10-01_release-1.12.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-10-02_release-1.13-0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    writeFileSync(
      join(root, "CHANGELOG.md"),
      ["# Changelog", "", "## [1.13.0] - 2026-10-02", "", "## [1.12.0] - 2026-10-01", "", "## [1.11.0] - 2026-09-30", ""].join(
        "\n",
      ),
    );
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(evidenceFor(report.numerator, "2026-09-30_release-1-11-0")).toBe(
      "released version 1.11.0 in CHANGELOG",
    );
    expect(evidenceFor(report.numerator, "2026-10-01_release-1.12.0")).toBe(
      "released version 1.12.0 in CHANGELOG",
    );
    expect(evidenceFor(report.numerator, "2026-10-02_release-1.13-0")).toBe(MERGE_EVIDENCE_NONE);
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

  // ADDED 2026-10-11 (run 2026-10-11_release-1-14-0, ledger build/21; REQ-PROVE-020). The tests
  // row below is the one run 2026-10-10_next-tier wrote in its all-pass final gate table. The word
  // "failed" in its "0 failed" was read as a failing gate, so the page said of that run "the final
  // gate table reports a failure". A count of zero failures reports none.
  it("reads a passing gate row that counts zero failed as a pass", () => {
    const root = fixture({
      "2026-01-02_counted-pass": {
        "record.md": countedGatesRecord(
          "pass (292 files; 13,701 passed, 16 skipped, 0 failed; the per-file coverage floors met)",
        ),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.denominator).toEqual([]);
    expect(report.numerator).toEqual([
      { run: "2026-01-02_counted-pass", mergeEvidence: MERGE_EVIDENCE_NONE },
    ]);
  });

  // The other way, in the same table: a row that reports a failure is still one. The second and
  // third rows say "pass" and count failures that only end in a zero, and the fourth counts a real
  // failure beside a zero one, so no reading of "0 failed" clears a count that is not zero.
  it.each([
    "fail (292 files; 13,699 passed, 16 skipped, 2 failed; the per-file coverage floors met)",
    "pass (292 files; 13,691 passed, 16 skipped, 10 failed; the per-file coverage floors met)",
    "pass (292 files; 12,701 passed, 16 skipped, 1,000 failed; the per-file coverage floors met)",
    "pass on the second attempt (the first: 2 failed; the second: 13,701 passed, 0 failed)",
  ])("still reads the gate row %j as a failure", (tests) => {
    const root = fixture({
      "2026-01-02_counted-red": { "record.md": countedGatesRecord(tests), "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator).toEqual([]);
    expect(report.denominator).toEqual([
      {
        run: "2026-01-02_counted-red",
        reason: "the final gate table reports a failure",
        mergeEvidence: MERGE_EVIDENCE_NONE,
      },
    ]);
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
  // rows are the ones the old `\b([01]\.\d+)\b` read as 1.1 and 1.9, over the 0.8 fallback;
  // a two-part version reads above 1 and is skipped, and a `.x` patch refuses the match.
  it.each([
    { line: "| 2 | approve | medium / 0.60 — the cut for 1.10.0 | none |", reads: 0.6 },
    { line: "| 2 | approve for 1.10.0 | stated nowhere | none |", reads: null },
    { line: "| 2 | approve | high / 0.90 | none |", reads: 0.9 },
    { line: "| 2 | approve | stated nowhere, on v1.0 | none |", reads: null },
    { line: "| 2 | approve | stated nowhere, on 1.9.0 | none |", reads: null },
    { line: "| 2 | approve | 1.0 | none |", reads: 1 },
    { line: "| 2 | approve | confidence 0.85. | none |", reads: 0.85 },
    { line: "| 2 | approve | high / 0.85, re-read at 0.92 | none |", reads: 0.92 },
    { line: "| 2 | approve | stated nowhere, on 1.9 | none |", reads: null },
    { line: "| 2 | approve | stated nowhere, the 1.10 line | none |", reads: null },
    { line: "| 2 | approve | on 1.9 at 0.85 | none |", reads: 0.85 },
    { line: "| 2 | approve | stated nowhere, on 1.0.x | none |", reads: null },
    { line: "| 2 | approve | stated nowhere, on 1.10.x | none |", reads: null },
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

  // ADDED 2026-10-11, unit c6-measurements (run 2026-10-11_release-1-14-0, ledger build/5). The
  // 1.12.0 section names another project's issue as `owner/repo#<n>`, and the reader took the
  // number as one of this repository's pull requests, so a record that mentions it was credited
  // "pull request #<n> in CHANGELOG". The two cases below hold one side bare each, so each of the
  // two readers (the changelog's and the record's) is the only thing standing between its
  // qualified number and a false merge line.
  it("credits no merge evidence to a number the changelog writes owner/repo#n", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_bare": {
        "record.md": record({ merge: "Landed as pull request #42." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      "2026-01-04_upstream-number": {
        "record.md": record({ merge: "Works around the upstream defect, their issue #3129." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    writeFileSync(
      join(root, "CHANGELOG.md"),
      [
        "# Changelog",
        "",
        "## [2.0.0] - 2026-01-09",
        "",
        "- Landed through pull request #42.",
        "- Refuses the entry another project drops silently (other-owner/other-repo#3129).",
        "",
      ].join("\n"),
    );
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    // The bare number beside it still counts: the fix narrows the reader, it does not blind it.
    expect(evidenceFor(report.numerator, "2026-01-03_bare")).toBe("pull request #42 in CHANGELOG");
    expect(evidenceFor(report.numerator, "2026-01-04_upstream-number")).toBe(MERGE_EVIDENCE_NONE);
  });

  it("credits no merge evidence to a number a record writes owner/repo#n", () => {
    // The fixture changelog names #42 and #7 bare, each under a released heading.
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_bare": {
        "record.md": record({ merge: "Landed as pull request #42." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      "2026-01-04_qualified": {
        "record.md": record({ merge: "Tracks other-owner/other-repo#42 upstream." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      // The qualified number comes first, so a reader that stops at it never reaches the bare one.
      "2026-01-05_qualified-then-bare": {
        "record.md": record({ merge: "Tracks other-owner/other-repo#42; landed as (#7)." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
      // A second bare number after a slash is the form `#41/#42`, which names two pull requests here.
      "2026-01-06_slash-pair": {
        "record.md": record({ merge: "Landed as #41/#42." }),
        "ledger.jsonl": CLOSED_LEDGER,
      },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(evidenceFor(report.numerator, "2026-01-03_bare")).toBe("pull request #42 in CHANGELOG");
    expect(evidenceFor(report.numerator, "2026-01-04_qualified")).toBe(MERGE_EVIDENCE_NONE);
    expect(evidenceFor(report.numerator, "2026-01-05_qualified-then-bare")).toBe(
      "pull request #7 in CHANGELOG",
    );
    expect(evidenceFor(report.numerator, "2026-01-06_slash-pair")).toBe(
      "pull request #42 in CHANGELOG",
    );
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

  // Added 2026-10-10 (plan 019 file 3, unit q5-usage-lines; REQ-CTX-019, D17): `/st-work` now has a
  // run append `- <UTC> usage: …` lines to its record as each phase or review round ends, each a
  // line of its own, never directly above a table. A table's lead is the nearest non-empty line
  // above it, so the placement is what keeps a usage line from becoming the gate table's lead; the
  // misplaced control shows the reader would otherwise drop the run as "gates in prose only".
  // Comment and title reworded 2026-10-10 (q5's fix round 1, `review/8`): they said "after the
  // field list", the place the rule no longer names. The fixtures and assertions are unchanged.
  it("keeps a table's lead when usage lines sit on lines of their own, and loses it when one sits directly above", () => {
    const usage = [
      "- 2026-01-03T09:40Z usage: build minutes=42 tokens=180000 (claude-code)",
      "- 2026-01-03T10:05Z usage: review r1 minutes=11 tokens=unreported (claude-code)",
    ];
    const base = record({});
    const placed = base
      .replace("\n### Review verdicts, per round\n", `\n${usage[0] ?? ""}\n\n### Review verdicts, per round\n`)
      .replace("\n## Next\n", `\n${usage.join("\n")}\n\n## Next\n`);
    const misplaced = base.replace("\n| Pass | lint |", `\n${usage[0] ?? ""}\n| Pass | lint |`);
    // The fixtures differ from the base by the usage lines alone: three placed, one misplaced.
    expect(placed.split(" usage: ")).toHaveLength(4);
    expect(misplaced.split(" usage: ")).toHaveLength(2);
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-03_usage-placed": { "record.md": placed, "ledger.jsonl": CLOSED_LEDGER },
      "2026-01-04_usage-above-table": { "record.md": misplaced, "ledger.jsonl": CLOSED_LEDGER },
    });
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });

    expect(report.numerator.map((entry) => entry.run)).toEqual([
      "2026-01-02_release-2.0.0",
      "2026-01-03_usage-placed",
    ]);
    expect(report.excluded).toEqual([
      {
        run: "2026-01-04_usage-above-table",
        reason: "gates in prose only — no gate row carries a pass or fail",
      },
    ]);
  });

  it("reads the changelog head by version order, so 1.10.0 outranks 1.9.1", () => {
    // build/96: a string sort put "1.9.1" after "1.10.0" and froze the 1.10.0
    // snapshot with the previous release as its head.
    const root = fixture({
      "2026-01-02_release-1.10.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    writeFileSync(
      join(root, "CHANGELOG.md"),
      [
        "# Changelog",
        "",
        "## [1.10.0] - 2026-01-09",
        "",
        "## [1.9.1] - 2026-01-05",
        "",
        "## [1.2.0] - 2026-01-01",
        "",
      ].join("\n"),
    );
    const report = computeMergeReadyRate(root);
    rmSync(root, { recursive: true, force: true });
    expect(report.computedFrom.changelogHead).toBe("1.10.0");
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
    // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the read with no path now
    // reads the pinned snapshot, which this root does not hold, so the case reads back the path it
    // froze. Every assertion is unchanged; the pinned read has its own case below.
    const snapshot = readMeasurementSnapshot(root, path);

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

  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-020): was "reads the
  // newest snapshot by filename date, not by write order". The snapshots live on the `records`
  // branch, so a snapshot taken there after the page was committed must not move the page: the read
  // is the one `MEASUREMENT_SNAPSHOT_PATH` pins. The case keeps its guard against write order and
  // filename order, and holds the pinned file against a newer and an older one, each computed over
  // a different tree so the report read back tells them apart.
  it("reads the pinned snapshot, not the newest file", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    const addRun = (run: string, gates?: string): void => {
      mkdirSync(join(root, RUNS_DIR, run), { recursive: true });
      writeFileSync(join(root, RUNS_DIR, run, "record.md"), record(gates === undefined ? {} : { gates }));
      writeFileSync(join(root, RUNS_DIR, run, "ledger.jsonl"), CLOSED_LEDGER);
    };
    try {
      // Written newest-first on purpose: mtime order and filename order disagree with the pin here,
      // and a checkout's timestamps are not committed.
      const newer = writeMeasurementSnapshot(root, "2999-12-31");
      addRun("2026-01-03_red-gate", "| Final | pass | pass | 1 failed of 120 |");
      const pinned = writeMeasurementSnapshot(root, PINNED_DATE);
      addRun("2026-01-04_feature");
      const older = writeMeasurementSnapshot(root, "2000-01-01");
      expect(pinned).toBe(MEASUREMENT_SNAPSHOT_PATH);
      expect(older < pinned && pinned < newer, "the pin is neither the newest nor the oldest file").toBe(true);

      const snapshot = readMeasurementSnapshot(root);
      expect(snapshot.path).toBe(MEASUREMENT_SNAPSHOT_PATH);
      expect(snapshot.report.rate).toEqual({ n: 1, d: 2, value: 0.5 });
      expect(readMeasurementSnapshot(root, newer).report.rate).toEqual({ n: 1, d: 1, value: 1 });
      expect(readMeasurementSnapshot(root, older).report.rate).toEqual({ n: 2, d: 3, value: 0.667 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("renders the page from the snapshot, not from the records beside it", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases): the page reads the pinned
    // snapshot, so the root writes its snapshot at the pinned date.
    writeMeasurementSnapshot(root, PINNED_DATE);
    // A second run lands AFTER the snapshot — the case the seam exists for.
    const later = join(root, RUNS_DIR, "2026-02-14_later-run");
    mkdirSync(later, { recursive: true });
    writeFileSync(join(later, "record.md"), record({}));
    writeFileSync(join(later, "ledger.jsonl"), CLOSED_LEDGER);

    // The renderer reads the reach snapshot and the run of record's RESULTS.md under the root it
    // renders, so the fixture carries both.
    //
    // TEST CHANGE, justified: 2026-10-01, the 1.11.0 cut. The renderer now also reads the run of
    // record's RESULTS.md under the root it renders, to tell a full run of record from a composed
    // one, so the fixture carries that file too (the real one, copied like the reach artifact).
    // Fixture setup only: every assertion of this case is unchanged.
    //
    // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): the committed
    // reach artifact and the run of record's real results file are records, not on `main`, so the
    // fixture carries synthetic ones ({@link placeRenderInputs}). The snapshot the page names is the
    // pinned one, where it named the 2026-02-01 file this case used to write.
    placeRenderInputs(root, readResults(FULL_PASS_RUN));

    const page = renderMeasurements(root);
    expect(computeMergeReadyRate(root).rate.d, "the live tree moved, as the case intends").toBe(2);
    expect(page).toContain("**1 of 1 runs** (1.000)");
    expect(page).not.toContain("2026-02-14_later-run");
    expect(page).toContain(MEASUREMENT_SNAPSHOT_PATH);
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

// TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, REQ-PROVE-025): "prints the same
// report the page renders from" and "prints a human summary naming the rule, the rate and every list"
// run the script over this repository's `.stamity/runs/`, records not on `main`, and moved to
// test/records/measurements.test.ts with "scripts/generate-docs.mjs --page measurements".
describe("scripts/merge-ready-rate.mjs", () => {
  it("refuses an unknown argument with the usage line and status 2", () => {
    const result = spawnSync(process.execPath, [RATE_SCRIPT_PATH, "--nonsense"], {
      encoding: "utf-8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Unknown argument: --nonsense");
    expect(result.stderr).toContain("Usage: node scripts/merge-ready-rate.mjs");
  });
});

/**
 * The page's four inputs, and what the generator does with each state of them (REQ-PROVE-020,
 * unit r2-measurements-page). The records live on the `records` branch, so a checkout of `main`
 * alone holds none of them: the generator skips the page there, refuses a partial restore, and
 * renders only when every input is on disk. Every case builds its own root, so none reads a real
 * record and all of them run in the default suite.
 */
describe("the measurement inputs", () => {
  const FULL_RUN = "2026-02-01-run-2";
  const PRIOR_RUN = "2026-01-20-run-1";
  const resultsPath = (id: string): string => `evals/runs/${id}/RESULTS.md`;
  const fullResults = ["# Run 2", "", "Status: **PASS**", "", "## 1. Set version and sha", "", "SET-v7.", ""].join("\n");
  const composedResults = [
    "# Run 2",
    "",
    "Status: **PASS**",
    "",
    "## 0. Composition",
    "",
    `This run composes with the prior complete run: the prior complete run is \`${PRIOR_RUN}\`. ` +
      "1 case(s) re-measured in this run; 2 case(s) carried.",
    "",
    "| Re-measured case | Why |",
    "|---|---|",
    "| `a-case` | source text moved: one line |",
    "",
    "## 1. Set version and sha",
    "",
    "SET-v7.",
    "",
  ].join("\n");

  /** A root holding only `evals/run-of-record.json`, naming {@link FULL_RUN}: `main` with no record. */
  function mainOnly(): string {
    const root = mkdtempSync(join(tmpdir(), "stamity-measure-inputs-"));
    placeRunOfRecord(root, { path: resultsPath(FULL_RUN), release: "2.0.0", exception: null });
    return root;
  }

  /** Write `body` at the repo-relative `path` under `root`. */
  function place(root: string, path: string, body: string): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }

  it("lists the run of record's results and the two snapshots as missing on main alone", () => {
    const root = mainOnly();
    try {
      expect(measurementInputs(root)).toEqual({
        present: [],
        missing: [resultsPath(FULL_RUN), REACH_SNAPSHOT_PATH, MEASUREMENT_SNAPSHOT_PATH],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("lists three inputs for a full run of record, all present once restored", () => {
    const root = mainOnly();
    try {
      place(root, resultsPath(FULL_RUN), fullResults);
      place(root, REACH_SNAPSHOT_PATH, "{}\n");
      expect(measurementInputs(root)).toEqual({
        present: [resultsPath(FULL_RUN), REACH_SNAPSHOT_PATH],
        missing: [MEASUREMENT_SNAPSHOT_PATH],
      });
      place(root, MEASUREMENT_SNAPSHOT_PATH, "{}\n");
      expect(measurementInputs(root)).toEqual({
        present: [resultsPath(FULL_RUN), REACH_SNAPSHOT_PATH, MEASUREMENT_SNAPSHOT_PATH],
        missing: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("adds the prior complete run a composed run of record names, missing until it is on disk", () => {
    const root = mainOnly();
    try {
      place(root, resultsPath(FULL_RUN), composedResults);
      place(root, REACH_SNAPSHOT_PATH, "{}\n");
      place(root, MEASUREMENT_SNAPSHOT_PATH, "{}\n");
      // The prior run is named but absent: a partial restore, refused rather than rendered.
      const partial = measurementInputs(root);
      expect(partial).toEqual({
        present: [resultsPath(FULL_RUN), REACH_SNAPSHOT_PATH, MEASUREMENT_SNAPSHOT_PATH],
        missing: [resultsPath(PRIOR_RUN)],
      });
      expect(measurementsAction("all", partial)).toEqual({ refuse: [resultsPath(PRIOR_RUN)] });

      place(root, resultsPath(PRIOR_RUN), fullResults);
      // A note beside the run of record stays optional: present or not, the inputs are four.
      const four = [resultsPath(FULL_RUN), REACH_SNAPSHOT_PATH, MEASUREMENT_SNAPSHOT_PATH, resultsPath(PRIOR_RUN)];
      expect(measurementInputs(root)).toEqual({ present: four, missing: [] });
      place(root, `evals/runs/${FULL_RUN}/NOTE.md`, "A note.\n");
      expect(measurementInputs(root)).toEqual({ present: four, missing: [] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses a composed run of record whose prior run is not an eval run id", () => {
    const root = mainOnly();
    try {
      place(root, resultsPath(FULL_RUN), composedResults.replace(PRIOR_RUN, "not-a-run"));
      expect(() => measurementInputs(root)).toThrow(EngineError);
      expect(() => measurementInputs(root)).toThrow(/not an eval run id/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips the page under --page all with no input, refuses any partial or explicit request, renders a full one", () => {
    const none = { present: [], missing: ["a", "b", "c"] };
    const some = { present: ["a"], missing: ["b", "c"] };
    const all = { present: ["a", "b", "c"], missing: [] };
    expect(measurementsAction("all", none)).toBe("skip");
    expect(measurementsAction("measurements", none)).toEqual({ refuse: ["a", "b", "c"] });
    expect(measurementsAction("all", some)).toEqual({ refuse: ["b", "c"] });
    expect(measurementsAction("measurements", some)).toEqual({ refuse: ["b", "c"] });
    expect(measurementsAction("all", all)).toBe("render");
    expect(measurementsAction("measurements", all)).toBe("render");
  });

  it("reads the pinned snapshot only, and names it and the restore command when it is absent", () => {
    const root = fixture({
      "2026-01-02_release-2.0.0": { "record.md": record({}), "ledger.jsonl": CLOSED_LEDGER },
    });
    try {
      expect(MEASUREMENT_SNAPSHOT_PATH).toMatch(/^evals\/measurements\/merge-ready-\d{4}-\d{2}-\d{2}\.json$/);
      // Another snapshot on disk is not the pinned one, so the read refuses rather than picking it.
      writeMeasurementSnapshot(root, "2026-02-01");
      expect(() => readMeasurementSnapshot(root)).toThrow(EngineError);
      expect(() => readMeasurementSnapshot(root)).toThrow(MEASUREMENT_SNAPSHOT_PATH);
      expect(() => readMeasurementSnapshot(root)).toThrow("node scripts/records.mjs restore");
      // The path a caller passes is read as given, and refused when it is not a snapshot's.
      expect(readMeasurementSnapshot(root, `${SNAPSHOT_DIR}/merge-ready-2026-02-01.json`).report).toEqual(
        computeMergeReadyRate(root),
      );
      expect(() => readMeasurementSnapshot(root, `${SNAPSHOT_DIR}/../CHANGELOG.md`)).toThrow(
        /not a measurement snapshot/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // TEST CHANGE, justified (2026-10-14, unit r2b-measurements-cases, review/4 of this run): the case
  // spelled the canonical repository's slug in code, which test/ci/forkIdentity.test.ts counts per
  // file and lists no entry for here. It now holds the constant's shape — a GitHub blob URL of one
  // owner and one repository on the `records` branch, ending in the slash a record path follows —
  // without the slug, so a fork that renames the repository still meets it.
  it("links every record into the records branch with an absolute URL", () => {
    expect(RECORDS_BLOB_URL.startsWith("https://github.com/")).toBe(true);
    expect(RECORDS_BLOB_URL.endsWith("/blob/records/")).toBe(true);
    expect(RECORDS_BLOB_URL).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/records\/$/);
  });
});

/**
 * REQ-CTX-006: a ledger row's `report` and `decision_needed` keys never move the measure. Read over
 * a synthetic fixture, so it holds under `npm test` with no record on disk: the same runs with and
 * without the two keys give the same open-row count and the same rate.
 */
describe("the merge-ready rate over ledger rows that carry report and decision_needed", () => {
  it("reports the same open-row count and rate as the same rows without those keys", () => {
    const row = (id: string, state: string, extra: boolean): string =>
      JSON.stringify({
        id,
        state,
        ...(extra ? { report: `reports/${id.replaceAll("/", "-")}-open.md`, decision_needed: state === "open" } : {}),
      });
    const ledger = (rows: readonly (readonly [string, string])[], extra: boolean): string =>
      `${rows.map(([id, state]) => row(id, state, extra)).join("\n")}\n`;
    const runs = (extra: boolean): Record<string, Record<string, string>> => ({
      "2026-01-02_closed": {
        "record.md": record({}),
        "ledger.jsonl": ledger([["build/1", "fixed"], ["review/2", "dropped"]], extra),
      },
      "2026-01-03_left-open": {
        "record.md": record({}),
        "ledger.jsonl": ledger([["build/1", "fixed"], ["review/2", "open"]], extra),
      },
      "2026-01-04_also-closed": {
        "record.md": record({}),
        "ledger.jsonl": ledger([["prove/1", "deferred"]], extra),
      },
    });
    const openRows = (report: MergeReadyReport): number =>
      report.denominator.filter((run) => run.reason === "the findings ledger still carries an open row").length;

    const withKeys = fixture(runs(true));
    const withoutKeys = fixture(runs(false));
    try {
      const keyed = computeMergeReadyRate(withKeys);
      const plain = computeMergeReadyRate(withoutKeys);
      // Activated: one run is held out by its open row, and two reach the numerator.
      expect(openRows(plain)).toBe(1);
      expect(plain.rate).toEqual({ n: 2, d: 3, value: 0.667 });
      expect(openRows(keyed)).toBe(openRows(plain));
      expect(keyed.rate).toEqual(plain.rate);
      expect(keyed.denominator).toEqual(plain.denominator);
    } finally {
      rmSync(withKeys, { recursive: true, force: true });
      rmSync(withoutKeys, { recursive: true, force: true });
    }
  });
});
