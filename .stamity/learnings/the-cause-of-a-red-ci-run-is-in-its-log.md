---
id: the-cause-of-a-red-ci-run-is-in-its-log
title: the cause of a red ci run is in its log
date: 2026-11-10
confidence: high
summary: "a red CI run's cause is often a check no targeted run executes: on 2026-11-05 the log named the composition root's derived check and an identity-bound setup test, not the guessed row"
reviewBy: 2027-02-10
validatedAgainst: "test/composition/root.test.ts:19-36 at bcf4eeb9 and commits 3e76d2d9 and 42aa32ee"
integrity: sha256:40342c4c667d8e63568240446ffd02a9b553780a75bde50c643169e30cd0d0cb
---

The cause of a red CI run on this repository is often a check that no targeted local run executes,
so a cause named from the last change reads plausibly and is wrong. Two such checks met together:
`test/composition/root.test.ts` derives the expected registry from `src/` and fails on every leg
until a new engine module is wired into `src/composition/root.ts` or excluded with a reason; and a
test of a real setup fails when it assumes this package's identity, because a real sync pins its
install line from the checkout's own manifest, and a fork's or a registry copy's line differs.

## Why

Observed on 2026-11-05: a pull request red on every leg was first reported as one failing row; the
failing job's log named two other causes. Commit `3e76d2d9` wired `adapters.landWorkflow` into the
composition root and moved `test/adapters/landWorkflow.test.ts` to read the real setup's line;
`42aa32ee` wired `src/mcp/ownServers.ts` for the same derived check. Each fix turned its legs green.

Confidence high: both causes were read from the log and both fixes were proved in CI. Validated
against `test/composition/root.test.ts:19-36` and those two commits at `bcf4eeb9`. Review horizon:
revisit if the composition root stops deriving its registry from the tree.

## How to apply

A red run's cause comes from the failing job's log (`gh run view <id> --log-failed`) before it is
reported or fixed. A new `src/` module ships with its composition-root entry in the same change, and
a narrow verify list for that change names `test/composition`.
