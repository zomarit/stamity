---
id: worktree-add-races-the-commondir-write-on-windows
title: worktree add races the commondir write on windows
date: 2026-09-14
confidence: medium
summary: "two concurrent worktree adds race Git's own .git/worktrees/<other>/commondir write on Windows (exit 128, \"failed to read ... commondir: No error\"); the engine retries once after 250 ms"
reviewBy: 2026-12-01
validatedAgainst: npm run test -- test/worktree/git.test.ts
integrity: sha256:050929facb94e292bbe5c5e0a9eed6596c17063827fd6abab5a60c0528e66d65
---

Two `git worktree add` runs started concurrently in one repository race Git's
OWN administrative write. Each creates `.git/worktrees/<name>/` and re-reads the
whole directory, and on Windows one of them can read a sibling's `commondir`
between that file's creation and its content landing: git exits 128 with
`fatal: failed to read .git/worktrees/<other>/commondir: No error` — "No error"
being the giveaway that nothing actually refused the read. Neither caller did
anything wrong, and the worktree lane's own lock cannot prevent it: that lock is
name-scoped by design (`src/worktree/setup.ts`), which is exactly what makes two
independent names run independently.

## Why

Observed twice on Git 2.55.0.windows.5, both times between two compliant sibling
runs: once on the 1.7.0 release's Windows CI leg, and once more in an operator
readiness note kept outside this repository. The same pair of adds passes on
darwin and Linux every time, and passes on Windows most of the time, because the
window is only the gap between one process's directory creation and its
`commondir` write. That is why the repair is a retry and not a serialization:
serializing every add would pay a permanent cost — and give up the concurrency
the name-scoped lock exists to allow — for a window that closes on its own.

## How to apply

`addWorktree` (`src/worktree/git.ts`) retries ONCE, after 250 ms, and only on
the pair `status === 128` plus the `COMMONDIR_RACE` stderr regex; the retry
re-runs the identical argv in the identical directory, and the retry's own
answer is then classified normally, so a first attempt that had already created
the directory comes back as the "already exists" refusal rather than as a fault.
A second 128 is a real failure and is reported as one, with "(retried once after
the commondir race)" in the message — read that phrase in a bug report as "the
race was already ruled out, look further". Any other 128 is git answering the
request (a bad ref, a taken directory) and is never retried, because waiting on
it only delays the message. Darwin cannot reproduce any of this, so the
confirmation of record is the CI Windows leg — the same conclusion as the
learning `the-local-test-gate-is-weaker-than-ci` — and `test/worktree/git.test.ts`
pins our half of it with a stubbed runner replaying the recorded stderr, which is
the one part that does not need a Windows host to stay honest.
