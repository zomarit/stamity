---
id: full-suite-cleanup-hooks-time-out-under-concurrent-load
title: full-suite cleanup hooks time out under concurrent load
date: 2026-09-20
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "four lane gate captures of 2026-09-20 red on the afterAll hooks of test/upstream/workflowRecovery.test.ts, test/upstream/lane.test.ts and test/ci/apmDownstream.test.ts under concurrent full suites, each green alone and in an uncontended full run"
summary: three suites' afterAll temp-tree cleanups exceed the 20 s hook timeout under concurrent full-suite load — a red with zero failing assertions and no coverage report (2026-09-20); green alone
integrity: sha256:c1f9b6209ef8a1b9b0410b900d23e388f8e7dab40fcccd1a4ba1298130c62c55
---

Three suites' `afterAll` cleanup hooks — `test/upstream/workflowRecovery.test.ts:38`,
`test/upstream/lane.test.ts:752` and `test/ci/apmDownstream.test.ts:11` — remove large temporary trees
inside vitest's 20-second hook timeout, and under concurrent load (a second full suite, a docs-site build
or a distribution build running on the same machine) the removal alone exceeds it. The red run then reports
`Hook timed out in 20000ms` with ZERO failing assertions and, because the run aborted, no coverage report,
so the per-file floors read unmeasured rather than met. Each suite is green alone
(`workflowRecovery` 26 passed in about 100 s) and green in an uncontended full run.

## Why

Observed on 2026-09-20 in plan 008 session 3's worktree farm: four of seven implementer lanes (V5, V3, V2,
V1b) reported a red full gate on one or two of these hooks while their siblings ran their own full suites,
and every one of them was green on a re-run with the machine idle; the QA-harness row
`test/qa/hookRuns.test.ts:167` has the same load sensitivity (recorded in the plan-008 record). The failure
shape is easy to misread — a file-level FAIL with no failing case looks like a broken suite — and easy to
"fix" wrongly by raising `hookTimeout` for the run that hit it. Validated against: the four lanes' captured
gate outputs and their green re-runs at the same trees. Review horizon: retire when the three hooks carry a
derived per-suite timeout or a lazy cleanup, or when the gate of record runs on a machine reserved for it.

## How to apply

A red full-suite run whose only failures are `Hook timed out` lines with zero failing assertions is a load
signal, not a verdict: re-run the failing files alone, then re-run the full gate uncontended before reading
any coverage number, and never change a hook timeout inside the change that hit it. When several lanes run
full suites on one machine, stagger them or let one runner hold the gate of record. The fix that retires this
learning is a per-suite `hookTimeout` derived from a measured cleanup on the slowest CI runner, stated in
the suite with its measurement, or a cleanup that returns before the removal completes.
