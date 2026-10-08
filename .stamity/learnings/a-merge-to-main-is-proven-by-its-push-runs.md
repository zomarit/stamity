---
id: a-merge-to-main-is-proven-by-its-push-runs
title: a merge to main is proven by its push runs
date: 2026-10-08
confidence: high
summary: "the Pack signing rehearsal runs only on a push to main, never on a pull request: main's push runs prove a merge touching src/pack, src/merge, the lockfile or the signing scripts"
reviewBy: 2027-04-08
validatedAgainst: "push runs 37450946980 (red on 1fa55344) and 37459556084 (green on d85bb76e) of the Pack signing rehearsal, the check lists of PR #77 and PR #78, and the workflow's on: block, archive step and filter test with ci.yml's prove-pr comment at dbd54fc7 on 2026-10-08"
integrity: sha256:caed4d810168cfadf871abdba7fd622daecf9f9f67e3fa6519241e88bb49bd10
---

`.github/workflows/pack-signing-rehearsal.yml` runs only on a push to `main` that touches its `paths:` filter, or by
hand (`workflow_dispatch`). It never runs on a pull request. The filter names eight paths: `src/pack/**`,
`src/merge/**`, `package-lock.json`, the workflow itself, `scripts/pack-signing-rehearsal.mjs`,
`test/ci/packSigningRehearsal.test.ts`, and the two signing scripts its archive step ships as signing inputs,
`scripts/sign-pack.mjs` and `scripts/native-typescript.mjs` (added by `a58f4d98` on 2026-10-08; before that a change
to either reached `main` with the signature not proven again). `pr-checks.yml` and `ci.yml` run on pull requests, but
neither runs the rehearsal; the offline half of `test/ci/packSigningRehearsal.test.ts` runs on every CI leg, and the
live signing does not. The only other workflow on that `on:` shape is `fork-release.yml`; `release.yml` runs on tag
pushes.

So a change can pass every PR check and still turn the rehearsal red on the merge push. The rehearsal's `verify` job
runs the real install API from a trimmed copy of the source: `src`, `content`, `node_modules`, the package files and
the three scripts above, the list its archive step names. Its catch block prints only a generic line.

`ci.yml`'s own push run on `main` can skip its test jobs: since the `prove-pr` job landed on 2026-10-08, a push whose
tree equals a pull request head that passed `all-ci-checks` skips `check`, `apm-install`, `plugin-route` and `lanes`.
The comment block at the head of `ci.yml` says the push-only workflows, the rehearsal among them, are untouched by that
skip and still run on the push. A green or skipped `ci.yml` push run therefore says nothing about the rehearsal.

## Why

Measured on 2026-10-06.
- **The red push run.** PR #77 passed every PR check and was fast-forwarded to `main` as `1fa55344`. Its push run of
  the rehearsal (37450946980) failed at `verify`: the new name check in `planPackInstall` read the bundled corpus,
  and the trimmed tree had no `content/`.
- **The cause.** Downloading the run's own `signing-input` and `signed-packs` artifacts and running `verify` with the
  catch printing the error showed `Bundled content not found`.
- **The fix.** PR #78 (`d85bb76e`) archived `content` with the other inputs, and its own push run of the rehearsal
  was green.

Re-read on 2026-10-08 at `dbd54fc7` on branch `lean-flows-01`: the workflow's `on:` block lists the eight paths above,
its archive step (`tar -czf signing-input.tgz`) ships `src`, `content`, `node_modules`, `package.json`,
`package-lock.json` and the three scripts, and the test "re-runs on every input it signs, and on no prose" in
`test/ci/packSigningRehearsal.test.ts` holds the two signing scripts in the filter. `ci.yml`'s head comment states the
`prove-pr` skip and that the push-only workflows still run.

Validated against: those two push runs, the two pull requests' check lists, the workflow's `on:` and archive step at
`d85bb76e`, and the same at `dbd54fc7` with the filter test.

Review horizon: re-check when the rehearsal gains a `pull_request` trigger, or its archive list or path filter changes.

## How to apply

A merge to `main` that touches any of the eight filter paths is proven by `main`'s push runs, read before the run
closes (`gh run list --branch main --limit 6`). The Pack signing rehearsal is the one PR checks cannot stand in for,
and a skipped `ci.yml` push run is not its stand-in either.

When its `verify` fails with only the generic line, the debugging route that found the 2026-10-06 cause is:
1. Download the run's `signing-input` and `signed-packs` artifacts.
2. Extract both into one `source/` folder.
3. Run `node source/scripts/pack-signing-rehearsal.mjs verify` with the run's `GITHUB_*` values, on a scratch copy
   whose catch prints the error.

A new runtime read in the install path also needs its files in the archive list and in `prepare`'s receipt list, and
a new script the archive ships needs its path in the filter. The test that runs `verify` from the archived paths holds
the first; the filter test holds the second only for the paths its list names.
