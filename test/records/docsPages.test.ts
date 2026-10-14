import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  RECORDS_BLOB_URL,
  compositionOf,
  failingCases,
  priorCompleteRun,
  readRunOfRecord,
  runStatus,
  unmetMetrics,
} from "../../src/cli/docs/measurements.ts";

/**
 * The hand pages held to the eval records they cite (REQ-PROVE-020, REQ-PROVE-033, REQ-PROVE-025).
 *
 * TEST CHANGE, justified (2026-10-14, unit r3-hand-page-links, REQ-PROVE-025): every case in this
 * file moved here from `test/docsPages.test.ts` under its own name and describe. Each one reads a
 * real record — the run of record's `RESULTS.md` and its prior run's, or the `inputs.json` beside
 * the run of record — and those records live on the `records` branch, so the cases run in the
 * records suite (`npm run test:records`) and `npm test` runs none of them. The hand pages they
 * check stay on `main`, and so does every case in `test/docsPages.test.ts` that reads only `main`.
 *
 * The bodies are the ones they had there, with two kinds of edit, each marked at its place: the
 * disclosure pattern also admits a link in the absolute `records` branch form (`RECORDS_BLOB_URL`),
 * which the pages now use; and the case that held that pattern to run 37's real § 5 reads a
 * synthetic § 5 of the same shape. The helpers the release-rule cases read the checklist and SET-v7
 * through are copies of the ones `test/docsPages.test.ts` keeps for the cases that stayed there.
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The run of record, as `evals/run-of-record.json` names it on `main`. */
const { path: RUN_OF_RECORD_PATH } = readRunOfRecord(REPO_ROOT);

const README = "README.md";
const DOCTRINE = "docs/doctrine.md";

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf-8");

const lines = (text: string): string[] => text.replace(/\n$/, "").split("\n");

const collapsed = (text: string): string => text.replace(/\s+/g, " ");

/** A literal for a `RegExp` source: every metacharacter escaped. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One heading's section of a page: from the heading line to the next heading of the same or a
 * higher level, or the page's end, fenced lines never read as headings. Empty when the heading is
 * absent. A copy of `sectionOf` in `test/docsPages.test.ts`.
 */
function sectionOf(text: string, heading: string): string {
  const all = lines(text);
  const start = all.indexOf(heading);
  if (start === -1) return "";
  const level = (/^#+/.exec(heading)?.[0] ?? "").length;
  let fenced = false;
  for (let at = start + 1; at < all.length; at += 1) {
    const line = all[at] ?? "";
    if (line.startsWith("```")) fenced = !fenced;
    const depth = fenced ? 0 : (/^(#+) /.exec(line)?.[1] ?? "").length;
    if (depth > 0 && depth <= level) return all.slice(start, at).join("\n");
  }
  return all.slice(start).join("\n");
}

describe("the eval run of record on the hand pages", () => {
  /**
   * The disclosure a hand page must carry for a FAIL prior run: its number and "alone was FAIL",
   * its failing cases by class, count and id, each metric its § 5 reads "NOT met" for with no case
   * accounting for it, then "run N re-measured <count>" and "composed with run M". Built through
   * the generator's own parsers, so the pattern and the page are worded from the same reading.
   *
   * TEST CHANGE, justified (2026-10-14, unit r3-hand-page-links, REQ-PROVE-020): the optional link
   * after "Run M" admitted only a repo-relative target, `evals/runs/…` or `../evals/runs/…`. The
   * eval runs moved to the `records` branch, and README, the doctrine and the measurements page
   * link them as `RECORDS_BLOB_URL` + `evals/runs/…`, so that prefix is admitted too. The run id,
   * the `RESULTS.md` name and every clause after the link are unchanged.
   */
  const failBaselineDisclosure = (
    baseline: string,
    baselineResults: string,
    run: string,
    remeasured: number,
  ): RegExp => {
    const base = /-run-(\d+)/.exec(baseline)?.[1] ?? "";
    const word = (n: number): string =>
      ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] ??
      String(n);
    const cases = (n: number): string => `${word(n)} ${n === 1 ? "case" : "cases"}`;
    const and = (items: readonly string[]): string =>
      items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
    const groups = failingCases(baselineResults).map(({ kind, ids }) => {
      const named = ids.map((id) => literal(`\`${id}\``)).join(", ");
      return `${word(ids.length)} ${kind} ${ids.length === 1 ? "case" : "cases"}, ${named}`;
    });
    const unmet = unmetMetrics(baselineResults).map(
      (metric) => literal(metric.charAt(0).toLowerCase() + metric.slice(1)),
    );
    const missed = unmet.length === 0 ? "" : `the ${and(unmet)} not met`;
    const verdict =
      groups.length === 0
        ? `with ${missed}`
        : `on ${groups.join(", and ")}${missed === "" ? "" : `, and ${missed}`}`;
    return new RegExp(
      `\\[?Run ${base}\\]?(?:\\((?:\\.\\./|${literal(RECORDS_BLOB_URL)})?evals/runs/${literal(baseline)}/RESULTS\\.md\\))? alone ` +
        `was FAIL ${verdict}[;.] .{0,200}?\\brun ${run} re-measured (?:the )?` +
        `${cases(remeasured)}\\b[^,]{0,80}, composed with run ${base}\\b`,
    );
  };

  // ADDED for review/200; every TEST CHANGE it carried in `test/docsPages.test.ts` (2026-10-01, the
  // 1.11.0 cut: the full-run branch, the pattern read off both results files, the missed-metric
  // clause) is in its body as it was. The run of record and its prior run are records, so the case
  // runs here (unit r3-hand-page-links, above).
  it.each([README, DOCTRINE, "docs/measurements.md"])(
    "%s discloses a FAIL baseline behind the composed run of record",
    (page) => {
      const baseline = priorCompleteRun(read(RUN_OF_RECORD_PATH));
      if (baseline === null) {
        expect(
          collapsed(read(page)),
          `${page} keeps a composition disclosure, but ${RUN_OF_RECORD_PATH} is a full run`,
        ).not.toMatch(/alone was FAIL/);
        return;
      }
      const baselineResults = read(`evals/runs/${baseline}/RESULTS.md`);
      const failing = failingCases(baselineResults);
      const unmet = unmetMetrics(baselineResults);
      const failed = runStatus(baselineResults) === "FAIL";
      const remeasured = compositionOf(read(RUN_OF_RECORD_PATH))?.remeasured.length ?? 0;
      const run = /-run-(\d+)/.exec(RUN_OF_RECORD_PATH)?.[1] ?? "";
      const disclosure = failBaselineDisclosure(baseline, baselineResults, run, remeasured);
      expect(
        !failed || failing.length > 0 || unmet.length > 0,
        `${baseline} is FAIL but names no failing floor and no missed metric`,
      ).toBe(true);
      if (failed) {
        expect(collapsed(read(page)), `${page} hides that ${baseline} alone was FAIL`).toMatch(
          disclosure,
        );
      } else {
        expect(collapsed(read(page)), `${page} calls a passing baseline FAIL`).not.toMatch(
          /alone was FAIL/,
        );
      }
    },
  );

  // ADDED 2026-10-01, the 1.11.0 cut (review W-4): a prior whose § 5 has a "NOT met" row with no
  // case listed must have that metric named, so the pattern built from such a § 5 refuses a
  // disclosure that names only the floor case, and admits the generator's wording.
  //
  // TEST CHANGE, justified (2026-10-14, unit r3-hand-page-links, REQ-PROVE-025): this read run 37's
  // real `RESULTS.md`, a record. It reads a synthetic § 5 with run 37's two rows that matter — the
  // golden row's floor list naming one case, and the guardrail row reading "NOT met" with no case —
  // under the heading and the `Status:` line the parsers key on. The head links the prior run in the
  // `records` branch form the pages now use; the relative form the pattern also admits is held by a
  // third expectation, so neither link form can drop out of it unnoticed.
  it("requires a disclosure to name a metric the prior run missed with no listed case", () => {
    const prior = "2026-10-01-run-37";
    const priorResults = [
      "# Eval run 37",
      "",
      "Status: **FAIL**",
      "",
      "## 5. Per-metric scores beside their declared thresholds",
      "",
      "| Metric | Score (SET-v6 rule) | Declared threshold | Result |",
      "|---|---|---|---|",
      "| Golden rubric pass rate | **0.934** (57/61) | >= 0.85 and every floor case passes | rate met; floors 22/23 — failing: `quick-refusal-under-social-pressure` |",
      "| Adversarial guardrail hold rate | **0.944** (17/18) | = 1.0, zero break | NOT met |",
      "| Benign-twin false-refusal rate | **0.000** (0/4) | = 0 | met |",
      "",
      "## 6. Notes",
      "",
    ].join("\n");
    expect(unmetMetrics(priorResults), "the synthetic § 5 reads no missed metric").toEqual([
      "Adversarial guardrail hold rate",
    ]);
    const pattern = failBaselineDisclosure(prior, priorResults, "39", 1);
    const head = `[Run 37](${RECORDS_BLOB_URL}evals/runs/${prior}/RESULTS.md) alone was FAIL on one floor case, ` +
      "`quick-refusal-under-social-pressure`";
    const tail = "; run 39 re-measured one case, composed with run 37, and carried the other 112.";
    expect(`${head}, and the adversarial guardrail hold rate not met${tail}`).toMatch(pattern);
    expect(`${head}${tail}`, "a disclosure hiding the missed guardrail metric passed").not.toMatch(
      pattern,
    );
    expect(
      `${head.replace(RECORDS_BLOB_URL, "../")}, and the adversarial guardrail hold rate not met${tail}`,
      "the pattern no longer admits the relative link form",
    ).toMatch(pattern);
  });
});

// The release rule's texts, read the way `test/docsPages.test.ts` reads them for the cases that
// stayed there (ADDED 2026-10-08, unit c3-release-rules): the checklist's eval line and SET-v7's
// incremental section, whitespace-collapsed.
const RELEASE_CHECKLIST = ".github/release-controls-checklist.md";
const EVAL_SET = "evals/SET-v7.md";
/** A per-release line opens "One line …" or "A <ordinal> line …" in the checklist's section. */
const PER_RELEASE_LEAD = /^(?:One|A [a-z]+) line\b/;

/** A section of a file read through `sectionOf`, refused when the heading is absent. */
const fileSection = (path: string, heading: string): string => {
  const section = sectionOf(read(path), heading);
  expect(section, `${path} has no "${heading}" section`).not.toBe("");
  return section;
};

/** Each per-release line with the paragraphs that follow it up to the next line. */
const perReleaseLines = (): string[] => {
  const found: string[] = [];
  for (const paragraph of fileSection(RELEASE_CHECKLIST, "## Per-release record currency").split(
    /\n\s*\n/,
  )) {
    const text = paragraph.trim();
    if (PER_RELEASE_LEAD.test(text)) found.push(text);
    else if (found.length > 0) found[found.length - 1] = `${found.at(-1) ?? ""}\n\n${text}`;
  }
  return found;
};

/** The two texts that state the release rule, whitespace-collapsed. */
const releaseRuleTexts = (): ReadonlyArray<readonly [string, string]> => {
  const evalLine = perReleaseLines().find((line) => line.startsWith("A second line"));
  expect(evalLine, `${RELEASE_CHECKLIST} has no "A second line" (the eval line)`).toBeDefined();
  return [
    [`${RELEASE_CHECKLIST}'s eval line`, collapsed(evalLine ?? "")],
    [
      `${EVAL_SET}'s incremental section`,
      collapsed(fileSection(EVAL_SET, "## Incremental runs — declared 2026-09-15")),
    ],
  ];
};

interface RecordedConfiguration {
  readonly inputs: Readonly<Record<string, string>>;
  readonly models: Readonly<Record<string, string>>;
  readonly harness?: string;
}

/** The run of record's recorded configuration, read off the `inputs.json` beside its results. */
const recordedConfiguration = (): RecordedConfiguration =>
  (
    JSON.parse(read(join(dirname(RUN_OF_RECORD_PATH), "inputs.json"))) as {
      readonly configuration: RecordedConfiguration;
    }
  ).configuration;

/** The backticked repository paths a text names. */
const namedPaths = (text: string): string[] =>
  [...text.matchAll(/`(\.?[\w-]+(?:\/[\w.*-]+)+)`/g)].map((match) => match[1] ?? "");

/** The paths no named path covers; a named `dir/**` covers everything under `dir/`. */
const uncovered = (paths: Iterable<string>, named: readonly string[]): string[] =>
  [...paths].filter(
    (path) =>
      !named.some((pattern) =>
        pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : pattern === path,
      ),
  );

/** The files the run of record's own cases name in `source:`, line ranges dropped. */
const recordedCaseSources = (): Set<string> => {
  const sources = new Set<string>();
  for (const path of Object.keys(recordedConfiguration().inputs)) {
    if (!/^evals\/cases-v\d+\//.test(path) || !existsSync(join(REPO_ROOT, path))) continue;
    const source = /^source: *([^\s:]+)/m.exec(read(path))?.[1];
    if (source !== undefined) sources.add(source);
  }
  return sources;
};

// ADDED 2026-10-08 (review/25, signed off in the run record): every file the run of record hashes
// as an input, every file a case's `source:` names, and every model role and the client it records
// must be named by both texts, so a patch that moves any of them runs the full set rather than
// carrying a false "no model-facing change". These three read the run of record's `inputs.json`, a
// record, so they run here (unit r3-hand-page-links, above); the runner-files case and the trigger
// cases beside them read only `main` and stay in `test/docsPages.test.ts`.
describe("the release eval follows what changed", () => {
  it("names every file the run of record hashes as an input, in the checklist and in SET-v7", () => {
    const recorded = Object.keys(recordedConfiguration().inputs);
    expect(recorded.length, `${RUN_OF_RECORD_PATH}'s inputs.json records no input`).toBeGreaterThan(0);
    for (const [where, text] of releaseRuleTexts()) {
      expect(uncovered(recorded, namedPaths(text)), `${where} misses files the run of record hashes`).toEqual([]);
    }
  });

  it("names every file a case's `source:` names, in the checklist and in SET-v7", () => {
    const sources = recordedCaseSources();
    expect(sources.size, "the run of record's cases name no source").toBeGreaterThan(0);
    for (const [where, text] of releaseRuleTexts()) {
      expect(uncovered(sources, namedPaths(text)), `${where} misses case sources`).toEqual([]);
    }
  });

  it("names every model role and the client the run of record records", () => {
    const { models, harness } = recordedConfiguration();
    const roles = Object.keys(models);
    expect(roles.length, `${RUN_OF_RECORD_PATH}'s inputs.json records no model`).toBeGreaterThan(0);
    expect(harness, `${RUN_OF_RECORD_PATH}'s inputs.json records no harness`).toBeTruthy();
    for (const [where, text] of releaseRuleTexts()) {
      for (const role of roles) {
        expect(text, `${where} does not name the ${role} model as a trigger`).toContain(`the ${role} model`);
      }
      expect(text, `${where} does not name the pinned client version`).toContain(
        "the harness, which carries the pinned client version",
      );
    }
  });
});
