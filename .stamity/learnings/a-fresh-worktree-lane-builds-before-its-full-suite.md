---
id: a-fresh-worktree-lane-builds-before-its-full-suite
title: a fresh worktree lane builds before its full suite
date: 2026-10-06
confidence: high
summary: a fresh worktree lane has no dist/, so hookRuns and the live plugin walks that shell out to dist/cli.js fail; run npm run build first, as CI does (2026-10-03)
reviewBy: 2027-03-06
validatedAgainst: "the full suites of two fresh lanes on 2026-10-03 (three hookRuns cases red in each, pluginLifecycle red in one) and their build-first re-run (49 passed), run 2026-10-03_pack-engine-defects"
integrity: sha256:b0aacd8cd7c11d9ed049a519a4946c0c15533a99e6401da510a1c0fdf6bdde99
---

A worktree made with `git worktree add` has no `dist/`, because `dist/` is ignored, and some
suites shell out to the checkout's own built CLI. `scripts/qa/fixtures.mjs:164` runs
`dist/cli.js`, which `test/qa/hookRuns.test.ts` calls through `createFixture`. The live plugin
walks in `test/ci/pluginLifecycle.test.ts` stop with "dist/cli.js absent; run npm run build".
So a fresh lane's full suite goes red on cases that have nothing to do with the unit under test.
CI never sees this, because its job builds before the suite (`.github/workflows/ci.yml:285-286`).

## Why

Measured on 2026-10-03 in run `2026-10-03_pack-engine-defects` (its record, lines 181-192):
- The full suites of two fresh lanes, each with `node_modules` symlinked and no build, failed
  three `test/qa/hookRuns.test.ts` cases each ("the fixture could not be built…").
- One of the lanes also marked `test/ci/pluginLifecycle.test.ts` failed for the missing
  `dist/cli.js`.
- `npm run build`, then the same two files, passed 49 cases in both lanes, with 2 skipped by the
  tests themselves.

Neither unit touched those files.

Validated against: the two lane runs, the build-first re-run, and the cited lines at `ee2fe9a5`.
Review horizon: re-check when the suite gains a global build step, then retire this learning.

## How to apply

In a lane created for a unit, run `npm run build` before `npm run test` or a whole-suite
`npx vitest run`, and make it the first gate of a test-runner brief for that lane.

A red hookRuns case or a red plugin walk in a lane with no `dist/` is the missing build until
a build-first re-run says otherwise. Re-run those files after the build before you read them as
a regression.
