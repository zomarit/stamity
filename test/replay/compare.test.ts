import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { compare, renderComparison } from "../../scripts/replay/compare.mjs";
// @ts-expect-error — native ESM contributor tool, outside the product package.
import { TOTALS_KEYS, USAGE, parseThresholds, validateSummary } from "../../scripts/replay/score.mjs";

/**
 * The replay's comparison (REPLAY-v1 §10, §12; C12): the baseline shape's scored summaries against
 * the changed shape's, one verdict per §12 row and the merge gate, and `score.mjs compare`, which
 * writes `evals/replay/COMPARISON-v1.md`.
 *
 * The summaries are built here, not measured: every row's rule is a function of a handful of
 * summary fields, and a builder lets each case move exactly the field its row reads while the other
 * nine rows stay PASS. Each built summary is held to r8a's `validateSummary` first, so the builder
 * cannot drift from the `stamity/replay-summary/v1` schema the scorer writes.
 */

const REPO = resolve(import.meta.dirname, "../..");
const SCORE_MJS = join(REPO, "scripts/replay/score.mjs");
const PROTOCOL = join(REPO, "evals/replay/REPLAY-v1.md");
const PROTOCOL_TEXT = readFileSync(PROTOCOL, "utf8");
const PROTOCOL_SHA = createHash("sha256").update(readFileSync(PROTOCOL)).digest("hex");
const T = parseThresholds(PROTOCOL_TEXT) as Record<string, unknown>;
const COMMIT = "a".repeat(40);
const PASS_IDS = ["u1-p1", "u1-p2", "u2-p1", "u2-p2", "u3-p1", "u3-p2"];

/** The twelve seeds of `evals/replay/v1/seeds.json`, with their class and pass. */
const SEEDS: [string, string, string][] = [
  ["sec-sql-sort", "security", "u1-p1"], ["cor-page-offset", "correctness", "u1-p1"],
  ["cor-date-boundary", "correctness", "u1-p2"], ["tw-assert-loosen", "test-weakening", "u1-p2"],
  ["sec-missing-guard", "security", "u2-p1"], ["con-event-key", "contract", "u2-p1"],
  ["con-config-default", "contract", "u2-p2"], ["tw-test-skip", "test-weakening", "u2-p2"],
  ["sec-path-traversal", "security", "u3-p1"], ["cor-swallowed-error", "correctness", "u3-p1"],
  ["con-wire-key", "contract", "u3-p2"], ["tw-expectation-deleted", "test-weakening", "u3-p2"],
];

interface Seed { id: string; class: string | null; present: boolean | null; caughtByImplementer: boolean; found: boolean; foundRound1: boolean; stage: string | null; oracle: string | null }
interface Pass { id: string; loopChars: number; breakdown: Record<string, number>; subagentTokens: number; verdict: { finalClass: string | null; rounds: number; approvedWithSeedUnfixed: boolean }; seeds: Seed[]; decoysFlagged: string[] }
interface Summary {
  runId: string; kind: string; shape: string; invalid: string[];
  protocol: { path: string; sha256: string; commit: string }; instrument: { commit: string; files: Record<string, string> };
  passes: Pass[]; totals: Record<string, unknown> & { loopCharsPerPass: number; subagentTokensPerPass: number; decoyFalseFlags: number; recall: { found: number; denominator: number; byClass: Record<string, unknown> } };
  compactionSamples: { n: number; atRisk: number; lost: number; valid: boolean }[];
  [key: string]: unknown;
}
interface Row { id: string; rule: string; baseline: string; changed: string; verdict: string; reason?: string }
interface Result { rows: Row[]; mergeGate: string; sampleCount: { required: Record<string, number>; got: Record<string, number>; invalid: Record<string, number> } }

/** Recall recomputed from the seed rows, the way r7 counts it: a seed the implementer removed leaves the denominator. */
function withRecall(s: Summary): Summary {
  const rows = s.passes.flatMap((p) => p.seeds);
  const inDenominator = rows.filter((x) => !x.caughtByImplementer);
  const found = inDenominator.filter((x) => x.found).length;
  return { ...s, totals: { ...s.totals, recall: { found, denominator: inDenominator.length, byClass: {} } } };
}

/** A valid scored summary in which every seed is found, every pass approved after one fix, and one compaction sample is valid and lost nothing. */
function summary(shape: "baseline" | "changed", n: number, over: Partial<Summary> = {}): Summary {
  const baseline = shape === "baseline";
  const passes: Pass[] = PASS_IDS.map((id) => ({
    id,
    loopChars: 6000,
    breakdown: { returns: 3000, prompts: 2000, ledger: 500, briefs: 0, reportReads: 500, resumes: 0 },
    subagentTokens: 60_000,
    verdict: { finalClass: "approve-after-fixes", rounds: 2, approvedWithSeedUnfixed: false },
    seeds: SEEDS.filter(([, , pass]) => pass === id).map(([seed, cls]) => ({ id: seed, class: cls, present: true, caughtByImplementer: false, found: true, foundRound1: true, stage: "pass", oracle: "pass" })),
    decoysFlagged: [],
  }));
  const totals: Record<string, unknown> = Object.fromEntries((TOTALS_KEYS as string[]).map((k) => [k, 0]));
  Object.assign(totals, {
    loopCharsPerPass: baseline ? 6000 : 2400, loopChars: baseline ? 36_000 : 14_400, breakdown: {}, perPassUnreliable: false, ledgerBeside: {},
    subagentTokensPerPass: 60_000, agentsWithoutTranscript: [], walkSkipped: {}, readerSkips: {}, oracleRun: { status: "ok", detail: "" },
  });
  const s = {
    schema: "stamity/replay-summary/v1",
    runId: `2026-09-2${baseline ? 5 : 6}-replay-${n}`,
    kind: "scored",
    shape,
    protocol: { path: "evals/replay/REPLAY-v1.md", sha256: PROTOCOL_SHA, commit: COMMIT },
    instrument: { commit: COMMIT, files: { "scripts/replay/measure.mjs": "b".repeat(64) } },
    cli: { commit: "c".repeat(40), version: baseline ? "1.9.1" : "1.10.0-rc", tarballSha256: "d".repeat(64) },
    client: {
      version: "2.1.280", binarySha256: "e".repeat(64), orchestratorModel: "claude-opus-5-5", resolvedModels: ["claude-opus-5-5"], initVersion: "2.1.280",
      ambient: { skills: ["st-work"], agents: [], slashCommands: ["st-work"], plugins: [], mcpServers: [] },
    },
    fixture: { baseCommit: "f".repeat(40), planSha256: "1".repeat(64), depsSha256: "2".repeat(64) },
    mechanism: "interrupt",
    timing: { activeMs: 7_200_000, pausedMs: 0, capacityHolds: 0, nudges: 0, restarts: 0 },
    passes,
    totals,
    compactionSamples: [{ n: 1, placement: "after-lens", trigger: "manual", preTokens: 120_000, postTokens: 20_000, atRisk: 2, lost: 0, valid: true }],
    wholeBranch: { finalClass: "approve", rounds: 1 },
    adjudication: [],
    models: {},
    notes: [],
    invalid: [],
    notDone: [],
    ...over,
  } as unknown as Summary;
  return withRecall(s);
}

const shape = (which: "baseline" | "changed", count: number, first = 1): Summary[] => Array.from({ length: count }, (_, i) => summary(which, first + i));
const base3 = (): Summary[] => shape("baseline", 3);
const changed3 = (): Summary[] => shape("changed", 3);

/** `s` with each named seed not found (and still present, so it stays in the denominator). */
function miss(s: Summary, ...ids: string[]): Summary {
  const passes = s.passes.map((p) => ({ ...p, seeds: p.seeds.map((x) => (ids.includes(x.id) ? { ...x, found: false, foundRound1: false, stage: null } : x)) }));
  return withRecall({ ...s, passes });
}
/** `s` with each named seed removed by the implementer before the lens started (absent at the pass, §8). */
function caught(s: Summary, ...ids: string[]): Summary {
  const passes = s.passes.map((p) => ({ ...p, seeds: p.seeds.map((x) => (ids.includes(x.id) ? { ...x, present: false, caughtByImplementer: true, found: false, foundRound1: false, stage: null } : x)) }));
  return withRecall({ ...s, passes });
}
const totals = (s: Summary, over: Record<string, unknown>): Summary => ({ ...s, totals: { ...s.totals, ...over } });
const perPass = (s: Summary, f: (p: Pass, k: number) => Partial<Pass>): Summary => ({ ...s, passes: s.passes.map((p, k) => ({ ...p, ...f(p, k) })) });
const verdictOf = (s: Summary, f: (p: Pass, k: number) => Partial<Pass["verdict"]>): Summary => perPass(s, (p, k) => ({ verdict: { ...p.verdict, ...f(p, k) } }));
const invalid = (s: Summary): Summary => ({ ...s, invalid: ['run.json end.reason is "stalled", not "complete"'] });

/** One valid pilot per shape, with the ambient lists every built scored run carries (§3). */
const pilotsOf = (): Record<string, Summary> => ({
  baseline: { ...summary("baseline", 1), runId: "2026-09-24-replay-1", kind: "pilot" },
  changed: { ...summary("changed", 2), runId: "2026-09-24-replay-2", kind: "pilot" },
});
/** `compare` with both pilots unless the case names its own (`{}` for none). */
const run = (baseline: Summary[], changed: Summary[], pilots: Record<string, Summary> = pilotsOf()): Result => compare(baseline, changed, T, pilots) as Result;
/** `s` with the ambient list `key` replaced (§3: a run whose lists differ from its shape's pilot is invalid). */
const ambient = (s: Summary, key: string, list: string[]): Summary => {
  const client = s["client"] as { ambient: Record<string, string[]> };
  return { ...s, client: { ...client, ambient: { ...client.ambient, [key]: list } } };
};
const row = (r: Result, id: string): Row => r.rows.find((x) => x.id === id)!;
const verdicts = (r: Result): Record<string, string> => Object.fromEntries(r.rows.map((x) => [x.id, x.verdict]));
const ALL_PASS = {
  "security-seeds": "PASS", "pooled-recall": "PASS", "decoy-flags": "PASS", "compaction-loss": "PASS", "verdict-class": "PASS",
  "verdict-rounds": "PASS", "approved-unfixed": "PASS", "loop-chars": "PASS", "subagent-tokens": "PASS", "eval-set-floors": "CARRIED",
};

describe("the builder", () => {
  it("builds summaries r8a's validateSummary accepts, with twelve seeds in the denominator", () => {
    for (const s of [...base3(), ...changed3(), invalid(summary("changed", 9))]) expect(validateSummary(s)).toEqual([]);
    expect(summary("baseline", 1).totals.recall).toMatchObject({ found: 12, denominator: 12 });
    expect(caught(miss(summary("baseline", 1), "cor-page-offset"), "sec-sql-sort").totals.recall).toMatchObject({ found: 10, denominator: 11 });
  });
});

describe("compare — the ten §12 rows and the merge gate", () => {
  it("reads every row PASS, eval-set-floors CARRIED and the merge gate PASS on a changed shape that holds the floor", () => {
    const r = run(base3(), changed3());
    expect(r.rows.map((x) => x.id)).toEqual(Object.keys(ALL_PASS));
    expect(verdicts(r)).toEqual(ALL_PASS);
    expect(r.mergeGate).toBe("PASS");
    expect(r.sampleCount).toEqual({ required: { baseline: 3, changed: 3 }, got: { baseline: 3, changed: 3 }, invalid: { baseline: 0, changed: 0 } });
    for (const x of r.rows) expect(x.rule, x.id).not.toBe("");
  });

  describe("security-seeds", () => {
    it("fails a security seed one changed run missed while every baseline run found it, naming the seed and the run", () => {
      const c = changed3();
      const r = run(base3(), [c[0]!, miss(c[1]!, "sec-path-traversal"), c[2]!]);
      expect(row(r, "security-seeds").verdict).toBe("FAIL");
      expect(row(r, "security-seeds").changed).toContain("sec-path-traversal missed in 2026-09-26-replay-2");
      expect(r.mergeGate).toBe("FAIL");
    });

    it("exempts it when at least one baseline scored run also missed it (R30)", () => {
      const b = base3();
      const c = changed3();
      const r = run([b[0]!, b[1]!, miss(b[2]!, "sec-path-traversal")], [c[0]!, miss(c[1]!, "sec-path-traversal"), c[2]!]);
      expect(row(r, "security-seeds").verdict).toBe("PASS");
      expect(row(r, "security-seeds").baseline).toContain("exempt: sec-path-traversal");
    });

    it("counts a security seed the implementer removed before the lens started as found (build/16)", () => {
      const c = changed3();
      const r = run(base3(), [caught(c[0]!, "sec-sql-sort"), c[1]!, c[2]!]);
      expect(row(r, "security-seeds").verdict).toBe("PASS");
    });

    it("fails a security seed whose presence is unknown and that no verdict role found (§8)", () => {
      const c = changed3();
      const unknown = perPass(c[0]!, (p) => ({ seeds: p.seeds.map((x) => (x.id === "sec-missing-guard" ? { ...x, present: null, found: false } : x)) }));
      expect(row(run(base3(), [withRecall(unknown), c[1]!, c[2]!]), "security-seeds").verdict).toBe("FAIL");
    });
  });

  describe("pooled-recall", () => {
    // Baseline 35/36: one correctness seed missed across the three runs.
    const baseline = (): Summary[] => { const b = base3(); return [miss(b[0]!, "cor-page-offset"), b[1]!, b[2]!]; };

    it("fails 33/36 against 35/36 and passes 34/36 (changed ≥ baseline − 1 of 36)", () => {
      const c = changed3();
      const at33 = run(baseline(), [miss(c[0]!, "cor-page-offset", "con-wire-key"), miss(c[1]!, "tw-test-skip"), c[2]!]);
      expect(row(at33, "pooled-recall").verdict).toBe("FAIL");
      expect(row(at33, "pooled-recall").changed).toContain("33/36");
      expect(row(at33, "pooled-recall").baseline).toContain("35/36");
      const at34 = run(baseline(), [miss(c[0]!, "cor-page-offset", "con-wire-key"), c[1]!, c[2]!]);
      expect(row(at34, "pooled-recall").verdict).toBe("PASS");
    });

    it("scales rates to 36 when the implementers caught different seeds, printing both denominators", () => {
      const c = changed3();
      // 33/35 × 36 = 33.94 < 34: FAIL, where a raw count of misses (2 against the baseline's 1) would not say so.
      const r = run(baseline(), [caught(miss(c[0]!, "cor-page-offset"), "con-event-key"), miss(c[1]!, "tw-test-skip"), c[2]!]);
      expect(row(r, "pooled-recall").verdict).toBe("FAIL");
      expect(row(r, "pooled-recall").changed).toMatch(/33\/35 .*33\.94 of 36/);
      // 34/35 × 36 = 34.97 ≥ 34: PASS.
      const ok = run(baseline(), [caught(miss(c[0]!, "cor-page-offset"), "con-event-key"), c[1]!, c[2]!]);
      expect(row(ok, "pooled-recall").verdict).toBe("PASS");
      expect(row(ok, "pooled-recall").changed).toContain("34/35");
    });

    it("leaves the row NOT-EVALUATED when a shape's pooled denominator is 0, since no seed reached a lens", () => {
      const every = SEEDS.map(([id]) => id);
      const r = run(base3(), changed3().map((s) => caught(s, ...every)));
      expect(row(r, "pooled-recall").verdict).toBe("NOT-EVALUATED");
      expect(r.mergeGate).toBe("FAIL");
    });
  });

  describe("per-scored-run rates when the shapes differ in size (build/15)", () => {
    const flags = (s: Summary, n: number): Summary => totals(s, { decoyFalseFlags: n });
    // The changed shape on the variance branch: found 12, 12, 9 over its first three runs.
    const changed5 = (): Summary[] => {
      const c = shape("changed", 5);
      return [c[0]!, c[1]!, miss(c[2]!, "cor-page-offset", "con-wire-key", "tw-test-skip"), c[3]!, c[4]!];
    };

    it("decoy-flags: one flag per run in both shapes passes at 5 changed runs against 3, though the raw pool is 5 against 3", () => {
      const r = run(base3().map((s) => flags(s, 1)), changed5().map((s) => flags(s, 1)));
      expect(r.sampleCount.required.changed).toBe(5);
      expect(row(r, "decoy-flags").verdict).toBe("PASS");
      const worse = changed5().map((s, k) => flags(s, k === 0 ? 2 : 1));
      expect(row(run(base3().map((s) => flags(s, 1)), worse), "decoy-flags").verdict).toBe("FAIL");
    });

    it("approved-unfixed: the same per-run rate passes at 5 against 3, and one more fails", () => {
      const unfixed = (s: Summary, n: number): Summary => verdictOf(s, (_, k) => ({ approvedWithSeedUnfixed: k < n }));
      const r = run(base3().map((s) => unfixed(s, 1)), changed5().map((s) => unfixed(s, 1)));
      expect(row(r, "approved-unfixed").verdict).toBe("PASS");
      const worse = changed5().map((s, k) => unfixed(s, k === 0 ? 2 : 1));
      expect(row(run(base3().map((s) => unfixed(s, 1)), worse), "approved-unfixed").verdict).toBe("FAIL");
    });
  });

  describe("compaction-loss", () => {
    it("is NOT-EVALUATED with no valid changed sample, and the merge gate is FAIL", () => {
      const none = changed3().map((s) => Object.assign(s, { compactionSamples: [{ ...s.compactionSamples[0]!, atRisk: 0, valid: false }] }));
      const r = run(base3(), none);
      expect(row(r, "compaction-loss").verdict).toBe("NOT-EVALUATED");
      expect(r.mergeGate).toBe("FAIL");
    });

    it("fails one lost finding in one valid changed sample", () => {
      const c = changed3();
      const r = run(base3(), [c[0]!, { ...c[1]!, compactionSamples: [{ ...c[1]!.compactionSamples[0]!, lost: 1 }] }, c[2]!]);
      expect(row(r, "compaction-loss").verdict).toBe("FAIL");
    });
  });

  describe("verdict-class and verdict-rounds", () => {
    it("verdict-class passes on 5 of 6 passes with the same modal class and fails on 4", () => {
      const blockAt = (s: Summary, passes: number[]): Summary => verdictOf(s, (_, k) => (passes.includes(k) ? { finalClass: "blocked" } : {}));
      expect(row(run(base3(), changed3().map((s) => blockAt(s, [0]))), "verdict-class").verdict).toBe("PASS");
      const two = run(base3(), changed3().map((s) => blockAt(s, [0, 3])));
      expect(row(two, "verdict-class").verdict).toBe("FAIL");
      expect(row(two, "verdict-class").changed).toContain("u1-p1 blocked");
    });

    it("verdict-class reads the modal class per pass, so one changed run off the mode moves nothing", () => {
      const c = changed3();
      expect(row(run(base3(), [verdictOf(c[0]!, () => ({ finalClass: "approve" })), c[1]!, c[2]!]), "verdict-class").verdict).toBe("PASS");
    });

    it("verdict-rounds compares the median rounds per pass (build/14): 1 against 2 passes, 1 against 3 fails", () => {
      const rounds = (list: Summary[], values: number[]): Summary[] => list.map((s, k) => verdictOf(s, () => ({ rounds: values[k]! })));
      const baseline = rounds(base3(), [1, 1, 2]);
      // Median 2 (mean 3): within ±1 of the baseline median 1.
      expect(row(run(baseline, rounds(changed3(), [2, 2, 5])), "verdict-rounds").verdict).toBe("PASS");
      // Median 3 (mean 2.33): outside ±1.
      const far = run(baseline, rounds(changed3(), [3, 3, 1]));
      expect(row(far, "verdict-rounds").verdict).toBe("FAIL");
      expect(row(far, "verdict-rounds").changed).toContain("u1-p1 3");
    });
  });

  describe("loop-chars and subagent-tokens", () => {
    // Baseline loop characters per pass 900, 1000, 5000: the median is 1000, the mean 2300.
    const baseline = (): Summary[] => base3().map((s, k) => totals(s, { loopCharsPerPass: [900, 1000, 5000][k] }));

    it("loop-chars: every changed run at 0.5 × the baseline median passes; one run at 0.51 × it fails", () => {
      const at = (values: number[]): string => row(run(baseline(), changed3().map((s, k) => totals(s, { loopCharsPerPass: values[k] }))), "loop-chars").verdict;
      expect(at([400, 450, 500])).toBe("PASS");
      expect(at([400, 510, 300])).toBe("FAIL");
    });

    it("subagent-tokens: the changed mean at 1.2 × the baseline mean passes, above it fails", () => {
      const baseTokens = base3().map((s, k) => totals(s, { subagentTokensPerPass: [9000, 10_000, 11_000][k] }));
      const at = (values: number[]): string => row(run(baseTokens, changed3().map((s, k) => totals(s, { subagentTokensPerPass: values[k] }))), "subagent-tokens").verdict;
      expect(at([12_000, 11_000, 13_000])).toBe("PASS");
      expect(at([12_000, 11_000, 13_300])).toBe("FAIL");
    });
  });
});

describe("compare — samples (§10) and refusals", () => {
  it("refuses fewer scored runs than scoredRunsPerShape, naming the shape and the count", () => {
    expect(() => run(base3().slice(0, 2), changed3())).toThrow(/baseline: 2 valid scored run\(s\), 3 required/);
  });

  it("refuses three scored runs that differ by more than 2 seeds found, naming 5 (R28)", () => {
    const b = base3();
    const spread = [b[0]!, miss(b[1]!, "cor-page-offset", "con-wire-key", "tw-test-skip"), b[2]!];
    expect(() => run(spread, changed3())).toThrow(/baseline: its first 3 scored runs differ by 3 seeds found .* so the shape takes 5 scored runs .* 3 given/);
    const five = [...spread, ...shape("baseline", 2, 4)];
    const r = run(five, changed3());
    expect(r.sampleCount.required).toEqual({ baseline: 5, changed: 3 });
    expect(r.mergeGate).toBe("PASS");
  });

  it("takes three runs that differ by exactly 2 seeds found", () => {
    const b = base3();
    const r = run([b[0]!, miss(b[1]!, "cor-page-offset", "con-wire-key"), b[2]!], changed3());
    expect(r.sampleCount.required.baseline).toBe(3);
  });

  it("does not read the pilots for variance: pilots 3 seeds apart with 3 scored runs each are compared (R28 supersedes the pilot reading)", () => {
    const pilots = { baseline: { ...summary("baseline", 20), kind: "pilot" }, changed: { ...miss(summary("changed", 21), "cor-page-offset", "con-wire-key", "tw-test-skip"), kind: "pilot" } };
    const r = run(base3(), changed3(), pilots);
    expect(r.sampleCount.required).toEqual({ baseline: 3, changed: 3 });
    expect(r.mergeGate).toBe("PASS");
  });

  it("refuses more scored runs than the sample, so no run is chosen", () => {
    expect(() => run(shape("baseline", 4), changed3())).toThrow(/baseline: 4 valid scored runs, the sample is 3/);
  });

  it("reads an invalid run as replaced: counted, never scored, while replacements remain", () => {
    const c = changed3();
    const withInvalid = [invalid(miss(c[0]!, "sec-sql-sort")), ...shape("changed", 3, 4)];
    const r = run(base3(), withInvalid);
    expect(r.sampleCount.invalid.changed).toBe(1);
    expect(r.mergeGate).toBe("PASS");
    expect(() => run(base3(), [invalid(c[0]!), c[1]!, c[2]!])).toThrow(/changed: 2 valid scored run\(s\), 3 required .*1 of 2 replacement/);
  });

  it("makes every row the changed shape feeds NOT-EVALUATED and the merge gate FAIL beyond two replacements (§10)", () => {
    const changed = [...shape("changed", 3).map(invalid), ...shape("changed", 3, 4)];
    const r = run(base3(), changed);
    expect(Object.values(verdicts(r)).filter((v) => v === "NOT-EVALUATED")).toHaveLength(9);
    expect(row(r, "security-seeds").reason).toMatch(/changed: 3 invalid runs, over the 2 replacements §10 allows per shape/);
    expect(row(r, "eval-set-floors").verdict).toBe("CARRIED");
    expect(r.mergeGate).toBe("FAIL");
  });

  it("keeps compaction-loss, which only the changed shape feeds, evaluated when the baseline runs out of replacements", () => {
    const baseline = [...shape("baseline", 3).map(invalid), ...shape("baseline", 2, 4)];
    const r = run(baseline, changed3());
    expect(row(r, "compaction-loss").verdict).toBe("PASS");
    expect(row(r, "pooled-recall").verdict).toBe("NOT-EVALUATED");
    expect(r.mergeGate).toBe("FAIL");
  });

  it("refuses mixed protocol sha256 values, a summary that is not replay-summary/v1, a run in the wrong list and a run given twice", () => {
    const c = changed3();
    expect(() => run(base3(), [c[0]!, c[1]!, { ...c[2]!, protocol: { ...c[2]!.protocol, sha256: "0".repeat(64) } }])).toThrow(/mixed protocol sha256 values/);
    expect(() => run(base3(), [c[0]!, c[1]!, { ...c[2]!, mechanism: "other" }])).toThrow(/changed 3 \(2026-09-26-replay-3\) is not a replay summary: mechanism is not interrupt or auto-window/);
    expect(() => run(base3(), [c[0]!, c[1]!, summary("baseline", 7)])).toThrow(/changed 3 \(2026-09-25-replay-7\) is a baseline scored run, not a changed scored run/);
    expect(() => run(base3(), [c[0]!, c[1]!, c[1]!])).toThrow(/2026-09-26-replay-2 is given twice/);
    expect(() => run(base3(), [c[0]!, c[1]!, { ...c[2]!, instrument: { ...c[2]!.instrument, commit: "9".repeat(40) } }])).toThrow(/2 instrument commits/);
  });

  it("refuses a pilot that is a scored run, of the other shape or invalid", () => {
    expect(() => run(base3(), changed3(), { baseline: summary("baseline", 20) })).toThrow(/pilot-baseline \(2026-09-25-replay-20\) is a baseline scored run, not a baseline pilot/);
    expect(() => run(base3(), changed3(), { changed: { ...summary("baseline", 20), kind: "pilot" } })).toThrow(/is a baseline pilot, not a changed pilot/);
    expect(() => run(base3(), changed3(), { changed: invalid({ ...summary("changed", 20), kind: "pilot" }) })).toThrow(/pilot-changed .* is an invalid run/);
  });

  it("refuses securityAllRuns at a reading the scorer does not implement (build/240)", () => {
    const block = PROTOCOL_TEXT.match(/```replay-thresholds\n(.*)\n```/)![1]!;
    expect(() => parseThresholds(PROTOCOL_TEXT.replace(block, block.replace('"securityAllRuns":true', '"securityAllRuns":false')))).toThrow(/"securityAllRuns" is false; this scorer implements only true/);
  });
});

describe("compare — the whole-branch review's fixes", () => {
  it("(build/250) reads a scored run whose ambient lists differ from its shape's pilot as an invalid run: counted, replaced, never scored", () => {
    const c = changed3();
    const drifted = ambient(c[0]!, "skills", ["st-work", "a-new-skill"]);
    const r = run(base3(), [drifted, ...shape("changed", 3, 4)]);
    expect(r.sampleCount.invalid.changed).toBe(1);
    expect(r.mergeGate).toBe("PASS");
    expect(renderComparison(r, T)).toMatch(/Samples, changed .*invalid: `2026-09-26-replay-1`/);
    expect(() => run(base3(), [drifted, c[1]!, c[2]!])).toThrow(/changed: 2 valid scored run\(s\), 3 required .*1 of 2 replacement/);
    // Three drifted baseline runs are over the replacements: every row the baseline feeds is not evaluated.
    const spent = run([...base3().map((s) => ambient(s, "mcpServers", ["github"])), ...shape("baseline", 2, 4)], changed3());
    expect(row(spent, "pooled-recall")).toEqual(expect.objectContaining({ verdict: "NOT-EVALUATED", reason: expect.stringMatching(/baseline: 3 invalid runs/) }));
  });

  it("(build/250) leaves every row a shape feeds NOT-EVALUATED when that shape's pilot is not supplied, since its lists cannot be checked", () => {
    const r = run(base3(), changed3(), { changed: pilotsOf()["changed"]! });
    expect(row(r, "pooled-recall")).toEqual(expect.objectContaining({ verdict: "NOT-EVALUATED", reason: "no baseline pilot supplied: its scored runs' ambient lists (§3) cannot be checked" }));
    expect(row(r, "compaction-loss").verdict).toBe("PASS");
    expect(r.mergeGate).toBe("FAIL");
    expect(Object.values(verdicts(run(base3(), changed3(), {}))).filter((v) => v === "NOT-EVALUATED")).toHaveLength(9);
  });

  it("(build/270) compares the sub-agent-token row exactly: a changed mean at exactly 1.2 × the baseline mean passes", () => {
    // 35 tokens per run ÷ 6 against 42 ÷ 6: 7 ≤ 1.2 × 5.8333… holds exactly, while the floating-point product falls short of 7.
    const at = (tokens: number): string => row(run(base3().map((s) => totals(s, { subagentTokensPerPass: 35 / 6 })), changed3().map((s) => totals(s, { subagentTokensPerPass: tokens / 6 }))), "subagent-tokens").verdict;
    expect(at(42)).toBe("PASS");
    expect(at(43)).toBe("FAIL");
  });

  it("(build/283) compares the loop-character row exactly: a changed run at exactly the ratio × the baseline median passes", () => {
    // At the committed 0.5 over an odd sample the product is exact, so the case takes a fence ratio that is no binary
    // fraction: 21603 characters ≤ 0.6 × the median 36005 holds exactly, while the floating-point product falls short.
    const t = { ...T, loopCharsRatioMax: 0.6 };
    const baseline = base3().map((s, k) => totals(s, { loopCharsPerPass: [30_000, 36_005, 40_000][k]! / 6 }));
    const at = (chars: number): string => row(compare(baseline, changed3().map((s) => totals(s, { loopCharsPerPass: chars / 6 })), t, pilotsOf()) as Result, "loop-chars").verdict;
    expect(at(21_603)).toBe("PASS");
    expect(at(21_604)).toBe("FAIL");
  });

  it("(build/315) verdict-class reads a modal tie as a set: the same tie in another run order is the same class, one of its members alone is not", () => {
    // Passes u1-p1 and u1-p2 close differently in each run of a shape: three classes at one run each, a three-way tie.
    const closes = (list: Summary[], perRun: string[]): Summary[] => list.map((s, k) => verdictOf(s, (_, p) => (p < 2 ? { finalClass: perRun[k]! } : {})));
    const baseline = closes(base3(), ["approve", "approve-after-fixes", "blocked"]);
    const permuted = row(run(baseline, closes(changed3(), ["blocked", "approve", "approve-after-fixes"])), "verdict-class");
    expect(permuted.verdict).toBe("PASS");
    expect(permuted.baseline).toContain("u1-p1 approve/approve-after-fixes/blocked, u1-p2 approve/approve-after-fixes/blocked");
    expect(permuted.changed).toContain("the same on 6 of 6");
    // Two of three changed runs approve: a single mode that is one member of the baseline's tie differs on both passes.
    const single = row(run(baseline, closes(changed3(), ["approve", "approve", "blocked"])), "verdict-class");
    expect(single.verdict).toBe("FAIL");
    expect(single.changed).toContain("u1-p1 approve, u1-p2 approve,");
    expect(single.changed).toContain("the same on 4 of 6");
  });

  it("(build/272) the committed-comparison reader takes only the run directories that carry a summary.json", () => {
    const dir = scratch();
    const s = summary("baseline", 1);
    mkdirSync(join(dir, s.runId));
    writeFileSync(join(dir, s.runId, "summary.json"), JSON.stringify(s));
    mkdirSync(join(dir, "2026-09-25-replay-9"));
    writeFileSync(join(dir, "README.md"), "The replay's run folders.\n");
    expect(committedSummaries(dir).map((x) => x.runId)).toEqual([s.runId]);
  });
});

describe("renderComparison", () => {
  it("heads the pilots, the mechanism, the instrument commit and the protocol sha, then the ten rows, the merge gate, the closing line and Not done", () => {
    const pilots = { baseline: { ...summary("baseline", 1), runId: "2026-09-24-replay-1", kind: "pilot" }, changed: { ...summary("changed", 2), runId: "2026-09-24-replay-2", kind: "pilot" } };
    const md = renderComparison(run(base3(), changed3(), pilots), T) as string;
    expect(md.split("\n")[0]).toBe("# Replay comparison — `COMPARISON-v1`");
    for (const want of [PROTOCOL_SHA, `commit \`${COMMIT}\``, "`interrupt`", "`2026-09-24-replay-1`", "`2026-09-24-replay-2`", "`2026-09-25-replay-1`", "`2026-09-26-replay-3`"]) expect(md).toContain(want);
    const tableRows = md.split("\n").filter((l) => /^\| `[a-z-]+` \|/.test(l));
    expect(tableRows.map((l) => l.split(" | ")[0]!.slice(3, -1))).toEqual(Object.keys(ALL_PASS));
    const tail = md.slice(md.indexOf("Merge gate:"));
    expect(tail).toMatch(/^Merge gate: PASS\n\nNo threshold moved\.\n\nNot done:\n\n- `eval-set-floors`: CARRIED/);
  });

  it("names each NOT-EVALUATED row and its reason under Not done, and prints the merge gate FAIL", () => {
    const none = changed3().map((s) => Object.assign(s, { compactionSamples: [] }));
    const md = renderComparison(run(base3(), none), T) as string;
    expect(md).toContain("Merge gate: FAIL");
    expect(md).toMatch(/- `compaction-loss`: NOT-EVALUATED — 0 valid changed sample\(s\), at least 1 required/);
    // With no pilot, no row is evaluated (build/250), so the head's pilot line is read on a run of its own.
    expect(renderComparison(run(base3(), changed3(), {}), T)).toContain("Pilots (not scored): none supplied");
  });
});

// ---------- the CLI: score.mjs compare ----------

const temps: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "stamity-replay-compare-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const score = (args: string[]): { status: number | null; stdout: string; stderr: string } => spawnSync(process.execPath, [SCORE_MJS, ...args], { encoding: "utf8" });

/** Each summary written to `<scratch>/<runId>.json`, then `compare` into `<scratch>/out/COMPARISON-v1.md`. */
function compareCli(baseline: Summary[], changed: Summary[], extra: string[] = [], pilots: Record<string, Summary> = extra.some((a) => a.startsWith("--pilot-")) ? {} : pilotsOf()): { result: ReturnType<typeof score>; out: string; args: string[] } {
  const dir = scratch();
  const write = (s: Summary): string => {
    const path = join(dir, `${s.runId}.json`);
    writeFileSync(path, JSON.stringify(s));
    return path;
  };
  const out = join(dir, "out", "COMPARISON-v1.md");
  mkdirSync(join(dir, "out"));
  const pilotArgs = Object.entries(pilots).flatMap(([which, s]) => [`--pilot-${which}`, write(s)]);
  const args = ["compare", ...baseline.flatMap((s) => ["--baseline", write(s)]), ...changed.flatMap((s) => ["--changed", write(s)]), ...pilotArgs, "--protocol", PROTOCOL, "--out", out, ...extra];
  return { result: score(args), out, args };
}

describe("score.mjs compare", () => {
  it("writes COMPARISON-v1.md and exits 0 on a merge gate of PASS", () => {
    const { result, out } = compareCli(base3(), changed3());
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/compared 3 baseline and 3 changed scored run\(s\): Merge gate: PASS/);
    expect(readFileSync(out, "utf8")).toContain("\nMerge gate: PASS\n");
  });

  it("writes the file and exits 2 on a merge gate of FAIL, so a caller cannot read FAIL as success", () => {
    const c = changed3();
    const { result, out } = compareCli(base3(), [c[0]!, c[1]!, totals(c[2]!, { loopCharsPerPass: 3100 })]);
    expect(result.status).toBe(2);
    expect(readFileSync(out, "utf8")).toContain("\nMerge gate: FAIL\n");
  });

  it("takes the pilots by --pilot-baseline and --pilot-changed and names them in the head", () => {
    const dir = scratch();
    const pilot = join(dir, "pilot.json");
    writeFileSync(pilot, JSON.stringify({ ...summary("changed", 30), kind: "pilot" }));
    const { result, out } = compareCli(base3(), changed3(), ["--pilot-changed", pilot]);
    expect(result.stderr).toBe("");
    expect(readFileSync(out, "utf8")).toContain("changed `2026-09-26-replay-30`");
  });

  it("refuses an existing --out, a file not named COMPARISON-v1.md, and summaries scored under another protocol", () => {
    const first = compareCli(base3(), changed3());
    expect(first.result.status).toBe(0);
    const again = score(first.args);
    expect(again.status).toBe(1);
    expect(again.stderr).toMatch(/--out already exists/);
    const renamed = score(first.args.map((a) => (a === first.out ? join(scratch(), "comparison.md") : a)));
    expect(renamed.status).toBe(1);
    expect(renamed.stderr).toMatch(/--out must be named COMPARISON-v1\.md/);
    const c = changed3();
    const stale = compareCli(base3(), [c[0]!, c[1]!, { ...c[2]!, protocol: { ...c[2]!.protocol, sha256: "0".repeat(64) } }]);
    expect(stale.result.status).toBe(1);
    expect(stale.result.stderr).toMatch(/2026-09-26-replay-3 was scored under protocol sha256 0{64}, not the sha256 of the protocol/);
    expect(existsSync(stale.out)).toBe(false);
  });

  // Assembled from fragments, so this file spells none of the names the leak gate refuses.
  const PRIVATE_NAME = ["stam", "ity", "-gov", "ernance"].join("");

  it("writes nothing that carries a home path or a leak-gate hit, naming the rule, never the text", () => {
    const c = changed3();
    const home = compareCli(base3(), [c[0]!, c[1]!, perPass(c[2]!, (p) => ({ seeds: p.seeds.map((x) => (x.id === "sec-sql-sort" ? { ...x, id: "/Users/someone/seed", found: false } : x)) }))]);
    expect(home.result.status).toBe(1);
    expect(home.result.stderr).toMatch(/nothing written: COMPARISON-v1\.md carries "\/Users\/"/);
    expect(existsSync(home.out)).toBe(false);
    const leaky = (s: Summary): Summary => Object.assign(s, { instrument: { ...s.instrument, commit: `the ${PRIVATE_NAME} head` } });
    const leak = compareCli(base3().map(leaky), changed3().map(leaky), [], Object.fromEntries(Object.entries(pilotsOf()).map(([k, s]) => [k, leaky(s)])));
    expect(leak.result.status).toBe(1);
    expect(leak.result.stderr).toMatch(/nothing written: COMPARISON-v1\.md matches the leak gate's rule private-repo-name/);
    expect(leak.result.stderr).not.toContain(PRIVATE_NAME);
    expect(readdirSync(join(leak.out, ".."))).toEqual([]);
  });

  it("USAGE names the compare subcommand and its flags", () => {
    expect(USAGE).toMatch(/score\.mjs compare --baseline <summary\.json>…? .*--changed/);
    for (const flag of ["--pilot-baseline", "--pilot-changed", "--out"]) expect(USAGE).toContain(flag);
  });
});

// ---------- the committed comparison (r11b) ----------

const COMMITTED = join(REPO, "evals/replay/COMPARISON-v1.md");
const RUNS = join(REPO, "evals/replay/runs");

/** The summaries of a runs folder: only its directories that carry a summary.json (build/272). */
function committedSummaries(dir: string): Summary[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "summary.json")))
    .map((e) => JSON.parse(readFileSync(join(dir, e.name, "summary.json"), "utf8")) as Summary);
}

describe("the committed COMPARISON-v1.md", () => {
  // Written by r11b; until then there is nothing to re-derive.
  it.skipIf(!existsSync(COMMITTED))("its merge-gate line equals compare() re-derived from the committed summaries", () => {
    const summaries = committedSummaries(RUNS);
    const scored = (which: string): Summary[] => summaries.filter((s) => s.shape === which && s.kind === "scored");
    // The valid pilot of each shape, which the ambient-list check (§3, build/250) reads.
    const pilots = Object.fromEntries(["baseline", "changed"].flatMap((which) => summaries.filter((s) => s.shape === which && s.kind === "pilot" && s.invalid.length === 0).slice(0, 1).map((s) => [which, s])));
    const derived = run(scored("baseline"), scored("changed"), pilots);
    expect(readFileSync(COMMITTED, "utf8")).toMatch(new RegExp(`\\nMerge gate: ${derived.mergeGate}\\n`));
  });
});
