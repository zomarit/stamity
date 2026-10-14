Status: closed — fixed through /st-work as pull request #99 (merged 2026-10-14 at 47be2027); zero residue (the marker check at main exits 1)
Plan: none — debug round
Invocation: /st-debug The hook-runner flake, inbox row 2026-10-12_board-writes/prove/4: test/hooks/portableRunner.test.ts (about :703-713) went red twice on CI's Linux legs (once on the Node 22 floor leg during PR #98, once on main's lts leg, CI 38375420957 on 97ae3769) and green on each re-run. Package 18's first step: reproduce, root-cause, fix with a failing test first, its own pull request from main. Unattended overnight run: no questions; take the recommended option and record it as a sign-off in .stamity/runs/2026-10-13_lean-repository/record.md.
Base: 6dfa5ffe36890ee04e1d3d3508100b5974d47207 (branch `fix/hook-runner-epipe`)
Target: app code (a product test fails intermittently; the failure text names the generated hook runner)
Route: in-process — CI's log states the actual output exactly, and a scratch probe found an input that produces it on every run; the test gate is runnable here

# Run 2026-10-13_debug-hook-runner-flake — the hook runner fails a hook that exits without reading its input

Package 18's first step, run unattended overnight; the session's opening answers, sign-offs and morning note are in
`.stamity/runs/2026-10-13_lean-repository/record.md`.

## Symptom

- **Expected:** `test/hooks/portableRunner.test.ts:703` "still starts any other launcher by the name the row gives,
  found on PATH" — the runner starts a `/bin/sh` stand-in found on `PATH`, the stand-in prints `stand-in-started` to
  stderr and exits 0, and the runner exits 0.
- **Actual (both CI failures, read from the attempt-1 logs):** the stand-in ran, then the runner printed
  `stamity hook [copilot]: Hook process failed (EPIPE)` and exited 1; the assertion at `:711` read status 1 where 0 was
  expected. CI 38324542065 attempt 1, job 115060103264, `check (floor, node 22.22.2)`, on `7396bb52`, 2026-10-13T00:02Z;
  CI 38375420957 attempt 1, job 115222552454, `check (lts, node 24)`, on `97ae3769`, 2026-10-13T09:26Z. Each passed on
  its one re-run; no file under `src/hooks` or `test/hooks` changed between them.
- **Frequency:** two misses on Linux legs in the recorded runs; zero on this Mac in 200 runs of the same shape
  (below).

## Marker check at the start

`git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'` (22:08Z) exits 0 with two hits, both in the
QA tables of two closed run records (`.stamity/runs/2026-09-30_optimization-sweep/qa.md:181`,
`.stamity/runs/2026-09-30_release-1-11-0/qa.md:296`), which quote scenario P24's planted probe. They are not probes and
are not stripped: a closed record is read-only, and the inbox row that names this false match is folded into plan 014
file 2's `r7` (`docs/plans/014-lean-repository-02.md`, its "Inbox fold" line). This run's own id has no hit.

## Step 1 — hypotheses, ranked

1. **The payload write fails because the child already closed its input.** The runner hands the payload to the child
   through `spawnSync`'s `input` (`src/hooks/portableRunner.ts:201-205`); the stand-in never reads its stdin and exits
   at once. When the child has exited before Node finishes writing the payload, the write fails with `EPIPE`,
   `spawnSync` returns it as `error`, and the runner turns every `error` into "Hook process failed" and exit 1
   (`:208-216`) — the child's own status 0 is never read. Discriminating observation: a child that never reads stdin,
   given a payload larger than the pipe buffer, must get `EPIPE` on every run, with `status` 0 beside it.
2. **The stand-in could not be started** (for example `ETXTBSY` on a file just written). Observation: the error code
   would not be `EPIPE`, and `stand-in-started` would be missing. Killed by the CI log: the stand-in's line is there and
   the code is `EPIPE`.
3. **The row's timeout fired.** Observation: the code would be `ETIMEDOUT`, which on Copilot yields with a warning and
   exit 0. Killed by the CI log (`EPIPE`, exit 1).

## Probe (22:10Z, scratch folder outside both checkouts, no repository file touched)

`spawnSync` of a `/bin/sh` stand-in identical to the test's (`echo stand-in-started >&2; exit 0`), Node 22.22.3 on this
Mac, payload sizes in bytes against the outcome:

| Payload | Runs | `EPIPE` | No error | `status` |
|---|---|---|---|---|
| 32 | 200 | 0 | 200 | 0 |
| 1,024 | 200 | 0 | 200 | 0 |
| 16,384 | 200 | 0 | 200 | 0 |
| 65,536 | 20 | 0 | 20 | 0 |
| 66,560 | 20 | 20 | 0 | 0 |
| 262,144 | 20 | 20 | 0 | 0 |
| 1,048,576 | 20 | 20 | 0 | 0 |

Above the 64 KiB pipe buffer the write cannot complete before the child exits, so every run takes `EPIPE` while the
child's status is 0. Below it the write lands in the buffer first unless the parent is descheduled between starting the
child and writing — the window CI's loaded runners hit twice. Hypothesis 1 survives with evidence; 2 and 3 are killed.

## Step 2 — instrumentation

None. On the in-process route the failing test separates the hypotheses on its own (the runner's stderr names the
error code), so no probe was placed.

## Step 3 — reproduction (in-process)

The implementer (Opus 5.5, effort `high`, under step 2's exception: a test delta as its only change) added one case
to `test/hooks/portableRunner.test.ts`, inside "portable native hook boundary" (`:418`):
`it.each(["cursor", "copilot"])("%s yields the child's own status when the child exits without reading its whole input")`.
Input: a hook script that writes `child-ran-without-reading` to stderr and exits 0 without reading its stdin, and a
payload carrying 1 MiB of tool input. Expected: the marker on stderr, no "Hook process failed", status 0. Lint and
typecheck green; the test-input census guard green (18 of 18).

The test-runner (Opus 5.5) ran
`npx vitest run test/hooks/portableRunner.test.ts -t "yields the child's own status when the child exits without reading its whole input"`
twice in a row (22:14Z): exit 1 both times, `Tests 2 failed | 73 skipped (75)` both times, and in all four failing cases
the runner's stderr read `child-ran-without-reading` then `stamity hook [<tool>]: Hook process failed (EPIPE)`
(`:422:31`). The same failure for the stated reason on both consecutive runs: the reproduction.

## Step 4 — the evidence, read

The failing test's output is the evidence. The child ran (its marker is on stderr), and the runner then reported
`EPIPE` and failed the hook. That is hypothesis 1 exactly, on a deterministic input, and it matches CI's two misses:
there the stand-in's line came first, then the same runner message, with a payload of a few dozen bytes.

## Step 5 — root cause (gate `root-cause-before-fix`: passed, confidence high)

1. The emitted runner passes the payload to the hook's child through `spawnSync`'s `input`
   (`src/hooks/portableRunner.ts:201-205`).
2. A hook may exit, or close its stdin, without reading all of that input; the stand-in of `:703` never reads it.
3. Node writes the input after starting the child. When the child's end of the pipe is closed before the whole input
   is written — always when the input exceeds the pipe buffer, and for a small input only when the child exits before
   the parent gets to its write — the write fails with `EPIPE`, and `spawnSync` returns that as `error` beside the
   child's real `status` (0 in the probe and the test).
4. The runner treats any `error` as a failed start: `if (child.error) { … throw safeError("Hook process failed (" + code + ")") }`
   (`:208-216`), which exits 1 before the child's status is read at `:218`.
5. So a hook that exits 0 without reading its input is reported as a failed hook. In CI's two misses the payload was
   small, and the loaded runner lost the race; on this Mac the same race did not show in 200 runs of the small form.

What would make this chain wrong: the child not having run (its stderr line would be missing — it is present in both
CI logs and the test), or an error code other than `EPIPE` (both CI logs and the test read `EPIPE`).

## Step 6 — the failing test (gate `failing-test-before-fix`)

The gate requires a test that fails on the current tree for the stated cause, with a failure message that names the
defect, before any fix starts. The tree did not carry one; it carries one now, from step 3: the case at
`test/hooks/portableRunner.test.ts:418` fails on the unfixed tree for both tools, and its failure prints the runner's
own `Hook process failed (EPIPE)`. Gate passed.

## Step 7 — the fix goes to `/st-work`

The diagnosis above and the failing test are the plan, handed to `/st-work` (22:16Z), which continues in this record
under "The fix" below: one unit, its Build, its Prove gates, its review and the pull request.

## Step 8 — instrumentation cleanup

No probe was placed, so nothing to strip. The marker check's count for this run's own id is 0 (the two hits it prints
are the closed records' quoted scenario, as at the start).

## Step 9 — regression clauses

- The emitted hook runner shall continue to take the hook's own exit status as the result when the hook exits without
  reading its whole input — held by "%s yields the child's own status when the child exits without reading its whole
  input" (`test/hooks/portableRunner.test.ts:418`), and by the non-zero companion case the fix adds.
- The runner shall continue to start any other launcher by the name the row gives, found on `PATH` — held by "still
  starts any other launcher by the name the row gives, found on PATH" (the case of the flake, unchanged).

## The fix (`/st-work`, handed over at step 7)

Confidence gate: medium
Intensity: standard (one unit, a small diff in the emitted hook runner, which every Cursor, Copilot and Codex install
runs; its goldens move)
Isolation: none needed — one unit, one writer, in this checkout on `fix/hook-runner-epipe`

- Plan: the unit `fix-1-epipe-keeps-child-status` in this run's `plan.md`.
- **Build** (22:17Z–22:21Z, implementer, Opus 5.5, effort `high`, `reports/fix-1-implementer-r1.md`): the error branch
  skips `EPIPE` alone (`src/hooks/portableRunner.ts:208-213`); the companion case "%s passes on the child's own failing
  status when the child exits without reading its whole input" (exit 3); both emission goldens moved by the runner's
  new text only; a `### Fixed` bullet. Before the fix, the four cases of the two (cursor, copilot) failed on
  `Hook process failed (EPIPE)`; after it, all pass. Commit `bb417ada`.
- **Spec delta** (22:23Z, spec-author, `reports/fix-1-spec-author-r1.md`): one dated amendment under REQ-FINISH-001
  (`docs/specs/implementation-finish.md:30`); its own verify was refused by the role's read-only guard, so the
  test-runner ran the spec gates (below).
- **`gate classify --base 6dfa5ffe`** (22:24Z): `security-sensitive` (`src/hooks/**`; the process-spawn rule), checks
  `scan`, `gates-all`, `review`, lens `stamity-security`.
- **Gates on `bb417ada` plus the spec paragraph** (22:25Z–22:34Z, test-runner, `reports/full-suite-test-runner-r1.md`):
  scan (9 files, no hit), lint, typecheck, the leak gate (0 hits across 1,893 files), build, knip, the spec gates (60
  passed) and the full suite alone under the machine lock — 294 of 294 files, 14,051 passed, 18 skipped, 404 s;
  statements 97.29%, branches 91.57%, functions 99.13%, lines 98.14%, the floors held; the four live walks passed
  (Claude 19.4 s, Copilot 15.2 s, Codex 7.4 s, Cursor 147.2 s); load 3.59 before, 21.42 after. Every gate exit 0.
- **Review round 1** (22:25Z–22:29Z): the reviewer (Opus 5.5, `reports/fix-1-reviewer-r1.md`) asked for changes,
  confidence medium — W-1 (no case pinned that the child's stdout still decides after `EPIPE`, and no Codex case) and
  four Minors; the security lens (`reports/fix-1-security-r1.md`) posted 0 findings. Ledger `review/1`–`review/5`
  from the reviewer and `review/6` from the spec-author (its References row). A probe (22:31Z) showed `spawnSync`
  reports `ETIMEDOUT` ahead of `EPIPE` (5 of 5 runs) and keeps the child's stdout after `EPIPE` (3 of 3). Sign-offs:
  `review/1`, `/3`, `/4`, `/5`, `/6` fix; `review/2` rejected (a signal-killed child that left its input unread now
  takes the path of every killed child; the earlier outcome was the fault's, not a rule).
- **Fix round 1** (22:34Z–22:38Z, fixer, `reports/fix-1-fixer-r1.md`): the deny case on Cursor, Copilot and Codex and
  the two unread-input cases for Codex (`4901d494`); the Copilot timeout case; the amendment cited at `bb417ada`, its
  References row, and the CHANGELOG bullet naming both outcomes of the old fault (`421918f5`).
- **Review round 2** (22:39Z–22:42Z, a fresh reviewer, `reports/fix-1-reviewer-r2.md`): **approve**, confidence
  medium; `review/1`, `/3`, `/4`, `/5`, `/6` fixed, `review/2`'s rejection upheld. The report's closures could not be
  applied in one call (one names a row already rejected, and a block naming it refuses as a whole), so each fixed row
  was closed by hand with the report's rationale.
- **Pre-push gates on `421918f5`** (22:43Z–22:45Z, test-runner, `reports/prepush-test-runner-r1.md`): scan, lint,
  typecheck, the leak gate, knip and 561 tests over the hooks, goldens, spec, changelog, census and architecture
  suites; every exit 0.
- **Pull request #99** (draft) opened at 22:45Z from `fix/hook-runner-epipe` at `421918f5`.
- **The full suite on the final tree `421918f5`** (22:45Z–22:52Z, test-runner, `reports/full-suite-test-runner-r2.md`,
  log `reports/full-suite-r2.log`): alone under the machine lock, `node scripts/ci/test-run.mjs --coverage` exit 0 —
  294 of 294 files, 14,057 passed, 18 skipped, 389.56 s; statements 97.29%, branches 91.57%, functions 99.15%, lines
  98.14%, the floors held; the four live walks passed (Claude 14.8 s, Copilot 13.4 s, Codex 7.3 s, Cursor 181.2 s);
  load 11.98 before, 20.05 after.
- **CI on #99 at `421918f5`** (run 38479861585): every leg green — `check (lts, node 24)`, `check (floor, node
  22.22.2)`, `check (windows-2, node 24)`, the APM and plugin routes, `all-pr-checks` — but **`check (windows-1, node
  24)` failed** (job 115579582824): all nine unread-input cases, each printing `Hook process failed (EOF)`. On Windows
  the write to a closed pipe is reported as `EOF`, not `EPIPE` — the edge case the plan named; the second Windows shard
  does not run this file. Ledger `prove/1` (Critical). `all-ci-checks` read failure.
- **Marked ready** at 22:53:38Z for the review bot (opening default N3), back to **draft** at 22:57Z for the fix batch.
  The bot's review (5511032670, 22:56:58Z, on `421918f5`) left one P1 (comment 4264931903, `src/hooks/portableRunner.ts:213`):
  a hook killed by a signal before reading a payload above the pipe buffer reports `EPIPE` with status null, and
  skipping it then sends a failed hook to the `status ?? 1` path. Ledger `pr/1` (Critical). The comment was screened
  as data: no class matched, kept.
- **S14** (22:59Z) The bot's P1 is taken: `EPIPE`, and `EOF` on Windows, are skipped only when the child exited with
  a status; a signal-killed child keeps the failed-hook path exactly as before the fix. This overturns the session's
  own rejection of `review/2` (round 1's M-1), which a re-review had upheld: uniformity with any killed child is the
  weaker reason; a bug fix should not loosen a failed hook's outcome. One fix batch carries `prove/1` and `pr/1`, with
  a POSIX-only case for a hook killed by `SIGKILL`; after it, one more bot review is asked for (a Critical was fixed).
- **The fix batch** (22:59Z–23:06Z, fixer, `reports/fix-1-fixer-r2.md`, then `reports/fix-1-fixer-r3.md` for the
  citation): the skip covers `EPIPE` and `EOF` and applies only when `typeof child.status === "number"`
  (`src/hooks/portableRunner.ts:208-217`); a signal-killed hook falls through to the failed-hook throw (`:225`). The new
  case "%s still fails a hook killed by a signal before it read its whole input" (cursor, copilot, codex; POSIX only)
  failed on the tree before the change — empty stderr, and Codex's status 1 where 2 was expected — and passes after;
  both goldens moved by the runner's text only; the CHANGELOG bullet and the spec amendment say `EPIPE` (`EOF` on
  Windows) and keep a signal-killed hook failed. Commits `4f1b942a` (code, tests, goldens, CHANGELOG) and `47be2027`
  (the amendment, cited at `4f1b942a`). A dry run cherry-picked every pull request 1 lane commit onto `4f1b942a`
  cleanly.
- **Round 3** (23:08Z–23:11Z, a fresh reviewer, `reports/fix-1-reviewer-r3.md`, the cap round): **approve**,
  confidence medium; `prove/1` and `pr/1` fixed (the Windows half rests on CI's next Windows leg). Pre-push gates on  `47be2027` (23:08Z–23:14Z, `reports/prepush-test-runner-r2.md`): scan, lint, typecheck, the leak gate (0 hits,
  1,898 files), knip, 564 targeted tests; every exit 0. Pushed at 23:14:20Z; the bot's comment answered (reply
  4265052692); **marked ready** again at 23:14:31Z for one more bot review, a Critical having been fixed.
- **A full-suite run spoiled by the session (23:08Z–23:2xZ, `reports/full-suite-r3.log`):** the orchestrator switched
  the main checkout to pull request 1's integration branch and cherry-picked its lane commits at 23:22:44Z while this
  runner's suite was still running there, so that run tested a tree that changed under it; its result is not counted.
  The suite is re-run on `47be2027` in a worktree pinned to it (`p18-suite-99`, `reports/full-suite-test-runner-r4.md`),
  and every later final-tree suite tonight runs in a pinned worktree. (The spoiled run's own report, returned at 00:24Z, read 25 failed of 14,081 — 24 timeouts that passed with their files run alone, and the Cursor local-path
  walk ending in exit 143, which also failed alone; not counted, since its tree moved.)
- **The full suite on `47be2027` in its pinned worktree** (`p18-suite-99`, 23:25Z–00:59Z with lock waits, log
  `reports/full-suite-r4.log`, returned in full): red under the machine's load (load averages 140 at its start, other
  projects' work): 4 of 14,078 failed, all in files this change does not touch — the wall-clock case of
  `test/change/classify.test.ts` (3.0 s against 2 s; 454 of 454 alone), two 60-second timeouts in
  `test/cli/ledgerForgery.test.ts` (alone, three other cases timed out, with temp-folder cleanup errors), and the
  Cursor local-path walk of `test/ci/pluginLifecycle.test.ts` ending in exit 143, alone too at load near 116; no
  coverage table. **What stands as the local evidence:** `47be2027` is an ancestor of pull request #100's `ee8aa3b8`,
  whose full suite ran alone under the lock at load 44–65 and passed whole (295 of 295 files, the floors held, all four
  walks — Cursor 241.3 s; `.stamity/runs/2026-10-13_lean-repository/reports/full-suite-test-runner-r1.md`), and the
  earlier suites on `bb417ada` and `421918f5` passed whole; CI on `47be2027` is green on every leg, the evidence of
  record under the rules. No further local suite is run for #99.
- **CI on #99 at `47be2027`** (pushed 23:14:20Z): all 20 checks done by 23:26Z, every one green or skipped by design —
  `check (lts, node 24)`, `check (floor, node 22.22.2)`, **`check (windows-1, node 24)`** (the leg that showed `EOF`;
  green, so the `EOF` half of `prove/1` holds) and `check (windows-2, node 24)`, the APM and plugin routes,
  `all-ci-checks` and `all-pr-checks` pass.
- **The bot's second review** (marked ready 23:14:31Z): completed 23:15:55Z on `47be202` with a 👍 and no comment — no
  findings. The pull request stays ready; its merge is the maintainer's.
- **Merged** (2026-10-14, the morning batch's answer 1): `main` fast-forwarded `6dfa5ffe..47be2027` at 07:28:17Z
  (`git push origin 47be2027557301f90ef138b8e1e46313b999e80d:refs/heads/main`); GitHub marked #99 merged at 07:28:17Z.
  `main`'s push runs on `47be2027`: CI 38528526451 `success` (`prove-pr` found the tree proved by the pull request, so
  the full legs skipped by design and `all-ci-checks` passed) and Docs site 38528526427 `success`, read to the end at
  07:29:50Z.
