import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

  // Added 2026-10-21 (plan 018, unit u1-advisory-dispositions; REQ-PROVE-009): the fourteen
  // dispositions taken on run 50's twelve repeats and run 51's two, read the same way. Each note's
  // hash is the row's text at that run's own candidate, so both candidates have to be in history;
  // a shallower checkout skips with this reason, as the run 27 case above does.
  const run50 = JSON.parse(read("evals/runs/2026-10-19-run-50/summary.json"));
  const run51 = JSON.parse(read("evals/runs/2026-10-20-run-51/summary.json"));
  const inHistory = (candidate: string): boolean => {
    try { execFileSync("git", ["cat-file", "-e", `${candidate}^{commit}`], { cwd: REPO_ROOT, stdio: "ignore" }); return true; } catch { return false; }
  };
  const candidateInHistory = inHistory(run50.candidate) && inHistory(run51.candidate);
  it.skipIf(!candidateInHistory)("reads every one of run 50's twelve and run 51's two repeats as disposed by the live corpus (needs both candidates in history)", () => {
    const roster = readdirSync(join(REPO_ROOT, CASES_DIR), { recursive: true, encoding: "utf8" })
      .filter(path => path.endsWith(".md")).map(path => parseCase(read(`${CASES_DIR}/${path}`), `${CASES_DIR}/${path}`));
    expect(run50.advisory.repeats).toHaveLength(12);
    expect(run51.advisory.repeats).toHaveLength(2);
    expect(undisposedRepeats(run50, roster, REPO_ROOT)).toEqual([]);
    expect(undisposedRepeats(run51, roster, REPO_ROOT)).toEqual([]);
  });

  // Added 2026-10-25 (plan 022 file 1, unit a17-eval-batch; REQ-PROVE-009, REQ-PROVE-046): run 53's
  // three repeats, deleted by the maintainer's decision of 2026-10-23, read the same way. The
  // summary is read inside the case, never at collection, so a checkout without it skips this case
  // alone; so does one whose history lacks run 53's candidate, the commit each note's hash reads.
  const RUN53_SUMMARY = "evals/runs/2026-10-22-run-53/summary.json";
  const RUN53_CANDIDATE = "4e7446440e306a6f38fa1d129cf1318d422e54fe";
  const run53Readable = existsSync(join(REPO_ROOT, RUN53_SUMMARY)) && inHistory(RUN53_CANDIDATE);
  it.skipIf(!run53Readable)("reads every one of run 53's three repeats as disposed by the live corpus (needs its summary and its candidate in history)", () => {
    const run53 = JSON.parse(read(RUN53_SUMMARY));
    const roster = readdirSync(join(REPO_ROOT, CASES_DIR), { recursive: true, encoding: "utf8" })
      .filter(path => path.endsWith(".md")).map(path => parseCase(read(`${CASES_DIR}/${path}`), `${CASES_DIR}/${path}`));
    expect(run53.candidate).toBe(RUN53_CANDIDATE);
    expect(run53.advisory.repeats.map((repeat: { caseId: string; criterion: string }) => `${repeat.caseId}:${repeat.criterion}`)).toEqual([
      "unattended-blocked-run-still-hands-off:A2",
      "unattended-close-opens-draft-pr:A1",
      "unattended-item-says-merge-refused:A2",
    ]);
    expect(undisposedRepeats(run53, roster, REPO_ROOT)).toEqual([]);
  });
});
