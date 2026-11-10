---
id: the-test-runner-gate-budget-defaults-to-ten-minutes
title: the test-runner gate budget defaults to ten minutes
date: 2026-11-10
confidence: medium
summary: the test-runner role kills a gate at 10 minutes when its brief names no limit, about this repo's full-suite time; on 2026-10-22 that ended a passing suite as a timeout
reviewBy: 2027-02-10
validatedAgainst: "content/agents/stamity-test-runner.md:95-98 on the tree CI run 42730516873 tested (PR #138)"
integrity: sha256:9dfa9112bf4947d8d6bcf4044bcef660b7097749235a7980f37b48adab8f7767
---

The test-runner role gives each gate its own wall-clock budget from its brief, 10 minutes when the
brief names none, and on expiry it kills the gate and reports `fail` with `exit code: timeout`
(`content/agents/stamity-test-runner.md:95-98`). This repository's full gate (`npm run lint && npm run
typecheck && node scripts/ci/test-run.mjs --coverage`) takes about as long as that budget on a quiet
machine and longer on a busy one, so a full-suite brief that names no time limit can end a suite that
was passing and report it red.

## Why

Observed on 2026-10-22: a full-suite test-runner dispatched with no time limit stopped a suite that
was still passing at the 10-minute default while other test runs loaded the machine; the run with a
stated limit passed. A full local suite took about 11 minutes on a quiet machine on 2026-11-05.

Confidence medium: observed once, and the mechanism is the role's documented default. Validated
against `content/agents/stamity-test-runner.md:95-98` on the tree CI run `42730516873` tested (PR #138). Review horizon: retire when the
default budget is longer than this repository's full suite.

## How to apply

A full-suite brief for this repository that states its limit, for example up to 45 minutes, keeps
the budget above the suite's real run time. A `timeout` reported for a suite that was still printing
passes is a result about the budget, not about the tests, and the suite is run again with a longer
limit.
