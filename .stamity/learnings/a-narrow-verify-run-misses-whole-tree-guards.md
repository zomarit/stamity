---
id: a-narrow-verify-run-misses-whole-tree-guards
title: a narrow verify run misses whole-tree guards
date: 2026-11-10
confidence: high
summary: "a narrow verify misses seven whole-tree checks: testInputsGuard, forkIdentity, architecture, cloud, composition root, fixtureSecrets and the mcp/env .gitignore census; PR #138's CI met four"
reviewBy: 2027-02-10
validatedAgainst: "the three retired learnings' measured runs as recorded at 62b9c758 (2026-10-11_release-1-14-0 prove/4 and fix/31, its record's 2026-10-12T01:41Z entry; 2026-10-03_pack-engine-defects prove/7, its record's lines 482-495; 2026-10-15_cloud-runs prove/7); the guard, architecture and container-leg paths read at 23b45cb9; test/ci/forkIdentity.test.ts:97-192, test/composition/root.test.ts, test/gate/fixtureSecrets.test.ts:52-236 and test/mcp/env.test.ts:652-708 on the tree CI run 42730516873 tested (PR #138), and that run's failed-job log"
integrity: sha256:cb4bd0545f05b3b440cb4d0463102d1652cf3ecc6860b9dae816d3c99213a67a
---

Seven checks in this repository look at the whole tree, not at the files a change touched. A
unit's narrow verify run that leaves the matching one out stays green, and the gap first shows
in the full suite or in CI, on a file the change never touched.

| Change kind | The test that fires | What makes it fire | Measured |
|---|---|---|---|
| a new or changed file under `test/` (a changed case: unverified, below) | `test/ci/testInputsGuard.test.ts` | a test source reads a tracked page or record its `testInputs` entry does not list | run `2026-10-11_release-1-14-0`, ledger rows `prove/4` and `fix/31` (2026-10-12) |
| a new or changed `.ts` file under `test/cli` or `test/ci` | `test/ci/forkIdentity.test.ts` (`:97-192`) | it walks every `.ts` under those two folders and holds each file's count of the canonical package name, owner, repository route and owner URL to a pinned table, so a new literal spelling of any of them fails | PR #138, `test/cli/commands/away.test.ts` spelled the name once |
| a new `import` between two `src/` modules | `test/architecture` | an import into a later wave | run `2026-10-03_pack-engine-defects`, ledger row `prove/7` (2026-10-06) |
| the person-only shell guard or an emitted hook | `test/cloud`, beside `test/hooks` | it runs every hook command `init` emits | run `2026-10-15_cloud-runs`, ledger row `prove/7` |
| a new module under `src/` | `test/composition/root.test.ts` | the registry it expects is derived from `src/`; see `a-new-src-module-fails-every-ci-leg-until-the-composition-root-lists-it` | PR #138, nine modules unwired |
| a new file under `test/`, `scripts/`, `src/` or `.github/` | `test/gate/fixtureSecrets.test.ts` (`:52`, `:205`, `:236`) | it reads those four roots with the leak gate's credential rules, each without its trailing boundary, plus a URL whose userinfo holds a user and password pair; a fixture that writes such a value out, rather than assembling it at run time, fails | PR #138, `test/skills/sources.test.ts:127`, rule `userinfo-url` |
| a new file under `src/` that names a `.gitignore` entry's constant | `test/mcp/env.test.ts`, the census at `:652-708` | every `src/` file that names a constant in its `WRITERS` map has to be a listed writer of it or one of its `NON_WRITERS` | PR #138, `src/cli/commands/away.ts` named `AWAY_MARKER_FILE` and `AWAY_HELD_FILE` |

- **Test inputs.** A test source that reads a tracked page or record has to be listed for that
  path in the `testInputs` map of `.stamity/change-classes.json`, and the one check of it is the
  case "declares every read of every tracked test source". Read in the guard's header at
  `e62ec3f2`, and unchanged at `23b45cb9`: a read counts when the path classifies `records` or
  `docs` or some entry's glob matches it; a helper's read is charged to every test file that
  imports it, directly or through other helpers; a path under a built-in test glob needs no
  entry. So one new read in a shared helper can open a gap for several test files at once.
  Unverified: whether a read added by an edit to an existing case, with no new case, is found
  the same way. The run met only two added cases.
- **Fork identity.** The census file's header says CI's `fork-probe` job also runs the whole suite
  in a renamed copy of the tree on every pull request, so each check in this table runs a second
  time there, on a tree with another package name.
- **Layering.** `test/architecture/boundaries.test.ts` gives every `src/` module a wave and fails
  an import into a later wave: `src/pack/verifyInstalled.ts` is wave 2, `src/pack/curated.ts`
  and `src/pack/receipt.ts` are wave 7, `src/cli/commands/check.ts` is wave 15. Its waiver list
  is matched as an exact set, so it only shrinks.
- **The container leg.** `test/cloud/containerLeg.test.ts` runs every hook command `init` emits
  for the four clients, so a guard change can turn it red while `test/hooks` stays green.
- **The `.gitignore` census.** A writer of a machine-local file has to answer to
  `GITIGNORE_ENTRY_WHEN` in `src/mcp/env.ts` before it ships; the census is how a new writer is
  found, so a new command that only reads or names one of those files fails it too until it is
  listed.

## Why

- Test inputs: two units each added cases naming `AGENTS.md`, one in
  `test/cli/commands/handoff.test.ts` and one in `test/worktree/git.test.ts`. Each unit's verify
  passed; neither held the guard. The release's first full suite (the run's record, its
  2026-10-12T01:41Z entry) exited 1 on that one case of 13,811, which named both test files and
  the page; coverage printed no summary on the red run, so the floors were unknown too. Commit
  `e7a2fd4d` added the two test paths to the `tests` list of the `*.md` entry, two lines, with
  neither test file nor the guard touched, and the next full suite passed. The run's later fix
  round carried the guard in its verify and passed (75 files, 3,289 cases, exit 0, on the tree
  `e62ec3f2` holds).
- Layering: measured in the run's record, lines 482-495. Review round 5 added imports from
  `src/pack/verifyInstalled.ts` (wave 2) to `src/pack/curated.ts` and `src/pack/receipt.ts`
  (wave 7). The fixer's narrow runs were green; the full gate on `94f348e5` went red at
  `test/architecture/boundaries.test.ts:1040`, Critical `prove/7`. The fix moved the read,
  unchanged, into `src/cli/commands/check.ts`, wave 15, which may import both modules, and the
  full gate on `eb4f0727` was green with no waiver.
- Container leg: the full suite on `b4e4fbf7` was red, 1 of 15,454, at
  `test/cloud/containerLeg.test.ts:376`, whose payload the guard refuses since `20ac8475`. No
  lane's verify ran `test/cloud`.
- PR #138, CI run `42730516873` (2026-11-10): the two POSIX check legs (floor, node
  22, and lts, node 24) each failed in exactly four test files and nowhere else:
  `test/ci/forkIdentity.test.ts`, `test/composition/root.test.ts`, `test/gate/fixtureSecrets.test.ts`
  and `test/mcp/env.test.ts`'s census (two of its cases, one per away constant), with the causes
  named in the table. Both fork-probe legs failed on the census's `AWAY_HELD_FILE` case. Run
  `2026-11-09_last-before-2-0`'s integration checks 1 and 2 (its record's 2026-11-09T18:08:49Z
  and 21:44:54Z entries) had been green on their selected sets, and the first one's listed set held none of those four files; the record does not
  list the second one's set. The Windows legs failed on some of the same four and on further tests
  that are not whole-tree checks.

This learning merges three that each held one row: `a-new-test-file-runs-the-test-input-census-guard`,
`a-new-import-runs-the-architecture-test` and `a-guard-change-runs-the-container-leg-tests`,
retired when its first version was captured. Its second version, captured in run
`2026-11-09_last-before-2-0`, added the fork-identity, composition-root, fixture-secrets and
`.gitignore` census rows. Confidence high: each row was measured red in a full suite or in CI and
green after its fix. Validated against the files in the table on the tree CI run `42730516873` tested, and that run's failed-job log. Review horizon: re-check when any of these checks is replaced, the wave map is
re-cut, or the container leg stops running the emitted hooks.

## How to apply

- The narrow verify runs that held were the ones that listed the matching row's test beside the
  files the change touched; a build or fix brief's `verify` otherwise holds only the unit's own
  tests, and an integration's selected set holds what its brief named.
- The guard row covers: `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`,
  `src/hooks/portableRunner.ts`; `src/adapters/claude.ts`, `src/adapters/codex.ts`,
  `src/adapters/copilot.ts`, `src/adapters/cursor.ts`, `src/adapters/cursorLegacyGuards.ts` and
  `src/emit/hooksInfra.ts`; the emitted scripts under `.claude/hooks/stamity/**` and
  `.stamity/generated/hooks/**`; and `test/cloud/**` and `scripts/ci/cloud-leg.mjs`.
- When the test-input guard named a pair, the remedy that held was an entry in the map, in its
  sorted place, in the same change as the test; the guard and the test stayed as they were.
- When the layering test refused an edge, the fix that held moved the code into a module whose
  wave may import both sides. A new waiver is a reviewed design change, not a fix.
- Each check's own failure message names its remedy: the fork-identity census asks for the value
  derived from `test/support/identity.ts` or a pinned literal with its reason, the fixture-secrets
  check for the value split or replaced by a placeholder, and the census for the new file listed,
  with `GITIGNORE_ENTRY_WHEN` read again when the file writes the target.
