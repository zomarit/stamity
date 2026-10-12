---
id: a-new-test-file-runs-the-test-input-census-guard
title: a new test file runs the test-input census guard
date: 2026-10-12
confidence: high
summary: a test that reads a tracked page must be listed for it in the testInputs map; only test/ci/testInputsGuard.test.ts shows a miss, so a narrow verify run stays green (prove/4, 2026-10-12)
reviewBy: 2027-01-12
validatedAgainst: "test/ci/testInputsGuard.test.ts (its header and the case 'declares every read of every tracked test source') read at 2af078e0; commit e7a2fd4d (two lines in .stamity/change-classes.json); the record of run 2026-10-11_release-1-14-0 (search it for the guard's file name): the full suite's exit 1 at e8f6a2ab and the fix"
integrity: sha256:2b3f9fda70b3550aa12bdd8f59abff1d6361f90e0c1e3ff3d93078bc27c913d6
---

A test source under `test/` that reads a tracked page or record has to be listed for that path
in the `testInputs` map of `.stamity/change-classes.json`. The one check of it is the case
"declares every read of every tracked test source" in `test/ci/testInputsGuard.test.ts`. A
unit's narrow verify run that leaves that file out stays green, and the gap first shows in the
full suite at the end of the run.

## Why

Seen on 2026-10-12 in run 2026-10-11_release-1-14-0 (ledger rows `prove/4` and `fix/31`). Two
units each added cases that name the charter file `AGENTS.md`, one in
`test/cli/commands/handoff.test.ts` and one in `test/worktree/git.test.ts`. Each unit's own
verify list passed; neither list held the guard. The release's first full suite, at `e8f6a2ab`,
exited 1 on that one case of 13,811, which named both test files and the page; coverage printed
no summary on the red run, so the floors were unknown too. Commit `e7a2fd4d` added the two test
paths to the `tests` list of the `*.md` entry, two lines, with neither test file nor the guard
touched, and the next full suite passed.

Read in the guard's header at `2af078e0`: a read counts when the path classifies `records` or
`docs` or some entry's glob matches it; a helper's read is charged to every test file that
imports it, directly or through other helpers; a path under a built-in test glob needs no entry.
So one new read inside a shared helper can open a gap for several test files at once.

Unverified: whether a read added by an edit to an existing case, with no new case, is found the
same way. The run met only the two added cases.

## How to apply

A unit that adds or changes a file under `test/` has `test/ci/testInputsGuard.test.ts` in its
verify list, beside the files it touched; a fix round that adds a case does too. The run's later
fix round carried it and passed (75 files, 3,289 cases, exit 0, at `2af078e0`). When the guard
names a pair, the remedy that held here was an entry in the map, in its sorted place, in the
same change as the test. The guard and the test stayed as they were.
