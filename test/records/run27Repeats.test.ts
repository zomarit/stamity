import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error — the manual harness is import-safe native ESM, outside the product package.
import { parseCase } from "../../scripts/eval/instrument.mjs";
// @ts-expect-error — native ESM contributor tool.
import { undisposedRepeats } from "../../scripts/eval/run.mjs";
import { CASES_DIR, REPO_ROOT } from "../evals/support.ts";

/**
 * Run 27's advisory repeats against the live corpus, in the records suite (REQ-PROVE-025): the case
 * reads run 27's `summary.json` under `evals/runs/`, a record that leaves `main`, and it reads it at
 * collection, so in `test/evals/manualRunner.test.ts` a checkout without the records failed that whole
 * file. The describe name is that file's, so the case keeps its full name; the synthetic guard cases
 * stay there.
 *
 * TEST CHANGE, justified: 2026-10-14, unit r1b-records-suite-eval-cases. Moved unchanged from
 * `test/evals/manualRunner.test.ts`, with the collection-time read and the history probe; the skip
 * still fires, with its reason, where run 27's candidate is not in history.
 */

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

describe("full run admission and strict aggregation", () => {
  // Run 27's eight repeats against the live corpus, the strongest evidence the guard has: the guard
  // reads the prior run's case file through `git show <candidate>:…`, so a depth-one checkout (the
  // CI test legs) cannot verify a note's hash and the guard fails closed there — the right behaviour
  // for a runner, and a reason to skip this assertion rather than to weaken the guard.
  const run27 = JSON.parse(read("evals/runs/2026-09-15-run-27/summary.json"));
  const run27CandidateInHistory = (() => {
    try { execFileSync("git", ["cat-file", "-e", `${run27.candidate}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; }
  })();
  it.skipIf(!run27CandidateInHistory)("reads every one of run 27's eight repeats as disposed by the live corpus (needs run 27's candidate in history)", () => {
    const roster = readdirSync(join(REPO_ROOT, CASES_DIR), { recursive: true, encoding: "utf8" })
      .filter(path => path.endsWith(".md")).map(path => parseCase(read(`${CASES_DIR}/${path}`), `${CASES_DIR}/${path}`));
    expect(run27.advisory.repeats).toHaveLength(8);
    expect(undisposedRepeats(run27, roster, REPO_ROOT)).toEqual([]);
  });
});
