import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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
import { namedPaths, releaseRuleTexts, uncovered } from "../support/pageSections.ts";
// @ts-expect-error — import-safe native ESM path list with no type declarations, outside the product package.
import { isRecordPath } from "../../scripts/records-paths.mjs";

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
 * through live in `test/support/pageSections.ts`, which `test/docsPages.test.ts` imports too
 * (ledger build/10: they were copies here, and two copies can drift apart).
 */

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** The run of record, as `evals/run-of-record.json` names it on `main`. */
const { path: RUN_OF_RECORD_PATH } = readRunOfRecord(REPO_ROOT);

const README = "README.md";
const DOCTRINE = "docs/doctrine.md";

const read = (relPath: string): string => readFileSync(join(REPO_ROOT, relPath), "utf-8");

const collapsed = (text: string): string => text.replace(/\s+/g, " ");

/** A literal for a `RegExp` source: every metacharacter escaped. */
const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

// The release rule's texts — the checklist's eval line and SET-v7's incremental section — are read
// through `test/support/pageSections.ts`, the copy `test/docsPages.test.ts` reads them through too.

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

// ADDED 2026-10-14 (ledger review/17, REQ-PROVE-020): every link into the `records` branch on a page
// `main` carries resolves to a record. The pages link the records in the absolute `RECORDS_BLOB_URL`
// form, which the default suite skips because a checkout of `main` does not carry its target — so
// README's merge-ready snapshot and reach snapshot, the fork guide's plan 005 and every other such
// link would ship as a dead link with every gate green. The records suite runs after
// `node scripts/records.mjs restore`, so the targets are on disk here, at the paths the branch holds.
// The pages are every markdown file `main` tracks, the records excluded, read off `git ls-files`
// rather than a list typed here, so a page that starts linking the records is checked from its first
// link; the three pages the review named must each still link one, so the scan cannot pass over
// nothing.

/** Whether a repository-relative POSIX path is a record, from the one list `guard` refuses on `main`. */
const isRecord = isRecordPath as (path: string) => boolean;

const ENTERPRISE_FORKS = "docs/enterprise-forks.md";

/** A `records` branch address, as a markdown target or bare in the text. */
const RECORDS_LINK = new RegExp(`${literal(RECORDS_BLOB_URL)}[^\\s<>()[\\]\`"']*`, "g");

/** The markdown pages `main` tracks: every `*.md` git lists, the records left out. */
const mainPages = (): string[] =>
  execFileSync("git", ["ls-files", "-z", "--", "*.md"], { cwd: REPO_ROOT, encoding: "utf-8" })
    .split("\0")
    .filter((path) => path !== "" && !isRecord(path) && existsSync(join(REPO_ROOT, path)));

describe("the records-branch links on main's pages", () => {
  it("resolves every records-branch link to a record file the branch holds", () => {
    const linking = new Set<string>();
    const dead: string[] = [];
    for (const page of mainPages()) {
      for (const match of read(page).matchAll(RECORDS_LINK)) {
        const url = match[0].replace(/[.,;:]+$/, "");
        linking.add(page);
        const path = url.slice(RECORDS_BLOB_URL.length).replace(/[#?].*$/, "");
        const file = join(REPO_ROOT, path);
        if (!isRecord(path) || !existsSync(file) || !statSync(file).isFile()) dead.push(`${page} links ${url}`);
      }
    }
    expect(dead, "a page links the records branch at no record file").toEqual([]);
    for (const page of [README, DOCTRINE, ENTERPRISE_FORKS]) {
      expect(linking.has(page), `${page} links nothing on the records branch`).toBe(true);
    }
  });
});
