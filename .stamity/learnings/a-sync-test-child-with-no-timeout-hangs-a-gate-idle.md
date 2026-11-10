---
id: a-sync-test-child-with-no-timeout-hangs-a-gate-idle
title: a sync test child with no timeout hangs a gate idle
date: 2026-11-10
confidence: high
summary: a test's spawnSync with no timeout blocks its vitest worker, so a child stuck on stdin hangs the gate at 0% CPU and the case limit never fires (38 min on 2026-11-05, fixed in 8556bbfe)
reviewBy: 2027-02-10
validatedAgainst: "commit 8556bbfe and its case in test/hooks/portableRunner.test.ts; vitest.config.ts:215; a spawnSync line count under test/ at bcf4eeb9"
integrity: sha256:5a0dfb28da6b9fd694d5f4de18947afb1517e86d6a9996327894503aa988d004
---

A test that calls `spawnSync` blocks its vitest worker until the child exits, so the case's own time
limit (`testTimeout: 20_000`, `vitest.config.ts:215`) cannot fire while it waits. When the child
waits on a stdin that never closes, the suite stops making progress but stays up: no failure, no
output, 0% CPU. From the outside an idle gate looks the same as a slow one, and a gate that never
ends has proved nothing.

## Why

Observed on 2026-11-05: a full suite was still running at 38 minutes against a usual 11, its process
at 0% CPU; the stuck process was a `spawnSync` child with no `timeout` of its own. Commit `8556bbfe`
gave the hook children in eight test files their own 15-second `CHILD_TIMEOUT_MS`, and its new case in
`test/hooks/portableRunner.test.ts` shows the call returning `ETIMEDOUT` while the child is still
alive; `53736522` and `9932a989` extended the limit to the remaining hook children. At `bcf4eeb9`,
126 of the 159 `spawnSync(` call lines under `test/` name no `timeout` on that line (a line count, so a
multi-line options object may still hold one).

Confidence high: the fix commit's own case reproduces the blocked worker. Validated against
`8556bbfe` and `test/hooks/portableRunner.test.ts` at `bcf4eeb9`. Review horizon: retire when a check
requires a timeout on every test child.

## How to apply

A suite running far past its usual time is read with `ps` for its CPU before anyone waits longer. A
stuck child is stopped by its process id, and the run that needed that stop is not a pass: the suite
runs again. A new `spawnSync` in a test carries its own `timeout`, as the hook tests'
`CHILD_TIMEOUT_MS` does.
