---
id: a-sync-test-child-with-no-timeout-hangs-a-gate-idle
title: a sync test child with no timeout hangs a gate idle
date: 2026-11-10
confidence: medium
summary: a test's spawnSync with no timeout blocks its vitest worker, so a child stuck on stdin hangs the gate at 0% CPU and the case limit never fires (31 min on 2026-11-05, per 8556bbfe)
reviewBy: 2027-02-10
validatedAgainst: "commits 8556bbfe, 53736522 and 9932a989; test/support/childTimeout.ts, test/hooks/portableRunner.test.ts:513-520 and vitest.config.ts:215 on the tree CI run 42730516873 tested (PR #138); git grep -n 'spawnSync(' -- test/ on the same tree"
integrity: sha256:8c106239da02a99d9e589a4a1db042fce2ca666e0e876e476f391ae9533b31f0
---

A test that calls `spawnSync` blocks its vitest worker until the child exits, so the case's own time
limit (`testTimeout: 20_000`, `vitest.config.ts:215`) cannot fire while it waits. When the child
waits on a stdin that never closes, the suite stops making progress but stays up: no failure, no
output, 0% CPU. From the outside an idle gate looks the same as a slow one, and a gate that never
ends has proved nothing.

## Why

Observed on 2026-11-05: a full suite stopped making progress with its process at 0% CPU, and the
stuck process was a `spawnSync` child with no `timeout` of its own. Commit `8556bbfe` records that
call hanging the gate for 31 minutes; it gave the hook children in eight test files a 15-second
`CHILD_TIMEOUT_MS` as their own `timeout`, and `53736522` gave it to 24 more calls in 15 files. Since
`9932a989` the limit comes from `test/support/childTimeout.ts`: 15 s on POSIX and 60 s on win32,
each held under its platform's case budget by `test/ci/testScheduling.test.ts`. The case "ends the
call at its own limit when a hook never exits" in `test/hooks/portableRunner.test.ts` (`:513-520`)
shows only that a call's own `timeout` ends a hung child with `ETIMEDOUT`; no test reproduces the
blocked worker. On the tree CI run `42730516873` tested (PR #138), `git grep -n 'spawnSync(' -- test/` finds 235 lines outside comments,
198 of them with no `timeout` on that line (a line count: a multi-line options object may still hold
one, and a child given `input` gets a stdin that closes).

Confidence medium: the hang was observed once, and the mechanism is stated in `8556bbfe` and in
`test/support/childTimeout.ts`, but no test reproduces it; run `2026-11-09_last-before-2-0` first
rated it high on that case, and its review round 1 found the case does not show it. Validated against commits `8556bbfe`,
`53736522` and `9932a989`, and `test/support/childTimeout.ts`, `test/hooks/portableRunner.test.ts`
and `vitest.config.ts` on the tree CI run `42730516873` tested (PR #138). Review horizon: retire when a check requires a timeout on
every test child.

## How to apply

A suite running far past its usual time is read with `ps` for its CPU before anyone waits longer. A
stuck child is stopped by its process id, and the run that needed that stop is not a pass: the suite
runs again. A new `spawnSync` in a test carries its own `timeout`, as the hook tests do with
`CHILD_TIMEOUT_MS` from `test/support/childTimeout.ts`.
