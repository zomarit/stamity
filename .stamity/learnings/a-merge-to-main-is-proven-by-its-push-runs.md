---
id: a-merge-to-main-is-proven-by-its-push-runs
title: a merge to main is proven by its push runs
date: 2026-10-06
confidence: high
summary: "the Pack signing rehearsal runs only on a push to main, never on a pull request: read main's push runs after a merge that touches src/pack, src/merge or the lockfile (run 37450946980)"
reviewBy: 2027-03-06
validatedAgainst: "push runs 37450946980 (red on 1fa55344) and 37459556084 (green on d85bb76e) of the Pack signing rehearsal, the check lists of PR #77 and PR #78, and the workflow on: block and archive step at d85bb76e"
integrity: sha256:240ff5d74b482b9e7eb3564073804f0925943750a6d409d497756d4fc34438bb
---

`.github/workflows/pack-signing-rehearsal.yml` runs only on a push to `main` that touches its `paths:` filter:
`src/pack/**`, `src/merge/**`, the lockfile and its own three files. It never runs on a pull request.
`pr-checks.yml` and `ci.yml` run on pull requests, but neither runs the rehearsal. The only other workflow on that
`on:` shape is `fork-release.yml`; `release.yml` runs on tag pushes.

So a change can pass every PR check and still turn the rehearsal red on the merge push. The rehearsal's `verify` job
runs the real install API from a trimmed copy of the source: `src`, `content`, `node_modules`, the package files and
three scripts, the list its archive step names. Its catch block prints only a generic line.

## Why

Measured on 2026-10-06.
- **The red push run.** PR #77 passed every PR check and was fast-forwarded to `main` as `1fa55344`. Its push run of
  the rehearsal (37450946980) failed at `verify`: the new name check in `planPackInstall` read the bundled corpus,
  and the trimmed tree had no `content/`.
- **The cause.** Downloading the run's own `signing-input` and `signed-packs` artifacts and running `verify` with the
  catch printing the error showed `Bundled content not found`.
- **The fix.** PR #78 (`d85bb76e`) archived `content` with the other inputs, and its own push run of the rehearsal
  was green.

Validated against: those two push runs, the two pull requests' check lists, and the workflow's `on:` and archive step
at `d85bb76e`.

Review horizon: re-check when the rehearsal gains a `pull_request` trigger or its archive list changes.

## How to apply

After any merge to `main` that touches `src/pack/**`, `src/merge/**` or the lockfile, read `main`'s push runs before
closing the run: `gh run list --branch main --limit 6`. The Pack signing rehearsal is the one PR checks cannot
stand in for.

When its `verify` fails with only the generic line, debug it as follows:
1. Download the run's `signing-input` and `signed-packs` artifacts.
2. Extract both into one `source/` folder.
3. Run `node source/scripts/pack-signing-rehearsal.mjs verify` with the run's `GITHUB_*` values, on a scratch copy
   whose catch prints the error.

A new runtime read in the install path also needs its files in the archive list and in `prepare`'s receipt list. The
test that runs `verify` from the archived paths holds that.
