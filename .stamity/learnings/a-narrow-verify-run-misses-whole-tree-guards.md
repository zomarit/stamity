---
id: a-narrow-verify-run-misses-whole-tree-guards
title: a narrow verify run misses whole-tree guards
date: 2026-10-21
confidence: high
summary: "a narrow verify misses whole-tree guards: a test change adds test/ci/testInputsGuard.test.ts, a src/ import test/architecture, a guard or hook test/cloud"
reviewBy: 2027-01-21
validatedAgainst: "the three retired learnings' measured runs (2026-10-11_release-1-14-0 prove/4 and fix/31; 2026-10-03_pack-engine-defects prove/7; 2026-10-15_cloud-runs prove/7); test/ci/testInputsGuard.test.ts's case 'declares every read of every tracked test source', test/architecture/boundaries.test.ts, test/cloud/containerLeg.test.ts and every path under How to apply read at 62b9c758"
integrity: sha256:77702b840c05dc17be1b773e970aabb051c4a3ce45219ade52d062b276a406ea
---

Three checks in this repository look at the whole tree, not at the files a change touched. A
unit's narrow verify run that leaves the matching one out stays green, and the gap first shows
in the full suite at the end of the run, on a file the change never touched.

| Change kind | The test its verify adds | Measured |
|---|---|---|
| a new or changed file under `test/` | `test/ci/testInputsGuard.test.ts` | run `2026-10-11_release-1-14-0`, ledger rows `prove/4` and `fix/31` (2026-10-12) |
| a new `import` between two `src/` modules | `test/architecture` | run `2026-10-03_pack-engine-defects`, ledger row `prove/7` (2026-10-06) |
| the person-only shell guard or an emitted hook | `test/cloud`, beside `test/hooks` | run `2026-10-15_cloud-runs`, ledger row `prove/7` |

- **Test inputs.** A test source that reads a tracked page or record has to be listed for that
  path in the `testInputs` map of `.stamity/change-classes.json`, and the one check of it is the
  case "declares every read of every tracked test source". A helper's read is charged to every
  test file that imports it, so one new read in a shared helper can open a gap for several files.
- **Layering.** `test/architecture/boundaries.test.ts` gives every `src/` module a wave and fails
  an import into a later wave. Its waiver list is matched as an exact set, so it only shrinks.
- **The container leg.** `test/cloud/containerLeg.test.ts` runs every hook command `init` emits
  for the four clients, so a guard change can turn it red while `test/hooks` stays green.

## Why

- Test inputs: two units each added cases naming `AGENTS.md`, one in
  `test/cli/commands/handoff.test.ts` and one in `test/worktree/git.test.ts`. Each unit's verify
  passed; neither held the guard. The release's first full suite exited 1 on that one case of
  13,811. Commit `e7a2fd4d` added the two test paths to the map, two lines, and the next full
  suite passed.
- Layering: review round 5 added imports from `src/pack/verifyInstalled.ts` (wave 2) to
  `src/pack/curated.ts` and `src/pack/receipt.ts` (wave 7). The fixer's narrow runs were green;
  the full gate on `94f348e5` went red in `test/architecture/boundaries.test.ts`. The fix moved
  the read, unchanged, into `src/cli/commands/check.ts`, a later wave that may import both, and
  the full gate on `eb4f0727` was green with no waiver.
- Container leg: the full suite on `b4e4fbf7` was red, 1 of 15,454, at
  `test/cloud/containerLeg.test.ts:376`, whose payload the guard refuses since `20ac8475`. No
  lane's verify ran `test/cloud`.

This learning merges three that each held one row: `a-new-test-file-runs-the-test-input-census-guard`,
`a-new-import-runs-the-architecture-test` and `a-guard-change-runs-the-container-leg-tests`,
retired in the same commit. Review horizon: re-check when any of the three checks is replaced,
the wave map is re-cut, or the container leg stops running the emitted hooks.

## How to apply

- A unit, or a fix round on one, whose change matches a row lists that row's test in its verify,
  beside the files it touched. Say so in build and fix briefs, whose `verify` is otherwise only
  the unit's own tests.
- The guard row covers: `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`,
  `src/hooks/portableRunner.ts`; `src/adapters/claude.ts`, `src/adapters/codex.ts`,
  `src/adapters/copilot.ts`, `src/adapters/cursor.ts`, `src/adapters/cursorLegacyGuards.ts` and
  `src/emit/hooksInfra.ts`; the emitted scripts under `.claude/hooks/stamity/**` and
  `.stamity/generated/hooks/**`; and `test/cloud/**` and `scripts/ci/cloud-leg.mjs`.
- When the test-input guard names a pair, the remedy that held is an entry in the map, in its
  sorted place, in the same change as the test; the guard and the test stay as they are.
- When the layering test refuses an edge, move the code into a module whose wave may import both
  sides. A new waiver is a reviewed design change, not a fix.
