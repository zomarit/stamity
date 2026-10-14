# Run 2026-10-13_lean-repository — Package 18: a lean repository, file 1 (plan 014)

Status: closed — merged as pull request #100 (2026-10-14 at 5284eaaa); the session's sign-offs S1–S34 and the morning answers are recorded here
Plan: docs/plans/014-lean-repository-01.md, re-planned in-flow by .stamity/runs/2026-10-13_lean-repository/plan.md (freshness guard: stale for 18 of its 29 reads)
Base: 47be2027557301f90ef138b8e1e46313b999e80d (pull request #99's final head, which this branch stacks on; the lanes were cut from its earlier head bb417ada)
Confidence gate: medium
Intensity: standard (four independent units on docs, a CI workflow, a lane script and retired eval files; no content change)
Isolation: one git worktree per lane under ~/Projects/zomarit/.stamity-worktrees/stamity/ (p18-a, p18-b, p18-c), node_modules symlinked to the main checkout, prepared by the orchestrator; one writer per lane; no lane runs `git stash`
Invocation: /st-work docs/plans/014-lean-repository-01.md — Package 18, run overnight and unattended on the opening batch's answers; re-plan in-flow with the persisted plan as input; the session passes the plan gate.
Session runs: this record (file 1, pull request 1) carries the session's opening answers, its sign-offs and the morning note; the hook-runner `/st-debug` run (`.stamity/runs/2026-10-13_debug-hook-runner-flake/`) and file 2's run point here.

## Morning note

Written for the maintainer during the night. **The final note is the block below (03:37Z)**; the dated lines under
"Earlier updates" are kept as they were written.

### Closed (11:32Z)

The morning ran on the maintainer's answers (verbatim under "Morning batch" and "Later answers the same morning"):
the tag pushed and confirmed; #99 and #100 fast-forwarded into `main`, each push's CI green; S32's case-folding fix
and S34's portable names, each with a fresh review; `r6` (the `records` branch at `fbb96b35`, the ruleset, a refused
force push, the maintainer's look at the branch page); `r7` and its fix round; `r8`'s measurements; the spec delta;
pull request #101's three fix batches (a template link CI caught, the review bot's three P2s, the full records ref and
`core.fileMode`) and the Fable delta pass; #101 fast-forwarded into `main` at `c96c7146` with `main`'s CI, the records
branch's first run re-run and its refreshed README (`7538cfb5`) all green. The close settled file 2's ledger (eight
rows fixed, four dropped, seven deferred with a place each), retired five inbox rows and added eight, and published
these records to the `records` branch with `node scripts/records.mjs commit`.

### Final note (03:37Z)

The night ran its whole list. Nothing stopped it early — no usage limit, no wait on the machine lock. One unit stopped
at the review cap with a Warning still open (`r4`, S32, below); that one is a decision for you.

**Done tonight**

1. **The audit:** the late Package 19 work holds up; four small record facts settled (S1–S4).
2. **Pull request #99, the hook-runner flake:** a hook that exits without reading its input made the runner report
   `Hook process failed` (every time above the 64 KiB pipe buffer, now and then below it; on Windows the write fails
   as `EOF`). Fixed with a failing test first, three review rounds approved, the review bot's P1 taken (S14, in the
   debug run's record). CI green at `47be2027`: 17 checks passed, 3 skipped by design, both Windows legs. Ready;
   waiting for your merge.
3. **Pull request #100, plan 014 file 1 (f0–f4):** every unit reviewed, the whole-branch review on Fable 5.1 approved,
   the bot's one P2 fixed (S16). CI green at `5284eaaa` (17 passed, 3 skipped). Still a draft. The tag
   `evals-retired-2026-10-13` exists only here: the annotated object `e3a35285` on `6dfa5ffe`.
4. **File 2, plan 014 file 2 (`r0`–`r5b`):** re-planned (S10–S12), built in three lanes plus an integration lane, every
   unit reviewed (with its security lens where classed), integrated on the local branch `records-branch` at
   `bef46934` — never pushed. The final tree is green alone under the machine lock: 295 test files, 14,086 tests; the
   records suite, lint, typecheck, knip and the leak gate too. `r7` was rehearsed in a throwaway worktree (S30): with
   the records gone, everything holds but one test floor that `r7` lowers. The whole-branch review's first pass
   (Fable 5.1) found one ordering trap in the morning's steps, settled in the record (S33).
   The reviews caught real defects in the persisted design, all fixed tonight: a second machine's older copy could
   silently undo a published record (S24); a deletion made elsewhere could be published again (S25, S26); a case-only
   rename on this Mac's disk could delete or duplicate a record (S29); the records workflow's leak gate skipped
   ignored files (`review/8`); the narrowed site build dropped two checks (S28); two lanes left a hole in the test map
   that only the integrated tree showed (`build/15`).

**Waits for you, in this order (S31)**

1. Push the tag: `git push origin refs/tags/evals-retired-2026-10-13`; `git ls-remote --tags origin
   'evals-retired-2026-10-13*'` then shows `e3a3528541b3d06870c19902d79e1afdd9946385` and, on its `^{}` line,
   `6dfa5ffe36890ee04e1d3d3508100b5974d47207`.
2. Merge #99, then #100, by fast-forward: `git push origin 47be2027557301f90ef138b8e1e46313b999e80d:refs/heads/main`,
   read `main`'s push CI to the end (both Windows legs), then `git push origin
   5284eaaae829506f8f28312e697fa02af138fabb:refs/heads/main` and read it again. #100 is a draft; the fast-forward merges
   it either way, and marking it ready would call one more bot review.
3. Decide S32, the case-folding question (`review/33`, an open Warning): recommended — one small fix and one fresh
   review before `r6`. Tonight's records hold no case pair and no non-ASCII path, so `r6` does not wait on it.
4. `r6`: `node scripts/records.mjs init --base bef4693410017157b21b99dc570eaf8593db30c0` (or the branch's head after
   step 3) from the main checkout; the ruleset (its JSON is in file 2's record); the import commit's first
   `records.yml` run is red by construction — re-run it after the merge (S33).
5. `r7`: the removal, with the rehearsal's commands (file 2's `reports/rehearsal-implementer-r1.md`), the four map
   entries (S23), the lowered test floor, the release checklist's three refresh steps, `setup`, and
   `node dist/cli.js check` in the records-free tree.
6. `records-branch`'s first push; its CI read to the end on every push, both Windows legs (the records script's
   real-gates case meets Windows there for the first time); draft while worked, ready once for the bot.
7. The QA rows (at most three), `r8`, the spec delta (its list is in file 2's plan), the whole-branch delta pass, the
   merge.
8. The close, its leftovers question first; then tonight's three run folders and the inbox's edits, each run's
   `Status:` closed, published with `node scripts/records.mjs commit` (S31). Have a reviewer read them as public text
   before that publish.

**Leftovers for the close's question** (file 2's open rows; the recommendation in brackets): `build/6` and `review/13`
(five renderer cases now run only in the `records` job) [drop: that job gates every pull request here]; `build/8`
(`r5`'s size) [drop]; `build/12` (the records-free case skips two npm commands) [drop]; `build/13`, `build/14`,
`review/28` (pre-existing: some linked files get no blocking site build) and `review/29` (the relative-link refusal
covers three pages) [schedule with the docs overhaul, Package 21]; `review/32`–`/34` [S32]; `review/35` [closes with
the persisted plan's amendment]; `build/1` and `build/16` [`r7`]; `review/7`, `build/9`, `review/27` [the spec delta].
The debug run's and file 1's ledgers have no open row.

**Sign-offs:** S1–S33, each in this record's "Sign-offs" section, except S14 (the bot's P1 on #99), in the debug run's
record. In short: S1–S4 the audit; S5–S9 file 1's re-plan; S10–S12 file 2's re-plan; S13 a rejected Minor; S14 the
P1; S15, S17, S21, S23 units that returned blocked, each unblocked on its own recommended input; S16 the bot's P2;
S18–S20 and S22 routing of findings; S24–S26 and S29 the records script's sync rules; S27 the whole-branch review
tonight; S28 the site build's steps; S30 the `r7` rehearsal; S31 the morning's order; S32 the review-cap stop; S33
the first `records.yml` run.

**Worth a look:** the machine was loaded by other projects most of the night (load averages 40–50 around 00:05Z, 10–16
now); local suites that missed a time bound were re-run alone, and CI is the evidence of record. 13 GiB free; cleaning
caches is yours to decide. Worktrees left for you under `~/Projects/zomarit/.stamity-worktrees/stamity/`: `p18-suite`
(pinned at `bef46934`, built), `p18-r0` and `p18-check-pr1` (at `5284eaaa`), and the lane worktrees `p18-r1`, `p18-x`,
`p18-y`, `p18-z`, `p18-z4`, `p18-w`; the lane branches stay (the records cite them); list `git status
--ignored=matching` in each before removing it. The live client walks print "401 Unauthorized" and "No authentication
information found." from clients in isolated homes: output only, by design.

**Process slips, for the record:** stamps typed ahead of the clock and corrected (22:55Z→22:42Z, 23:42Z→23:39Z,
00:05Z→00:00Z, 00:26Z→00:24Z, 02:50Z→02:47Z, 02:44Z→02:43Z); one mistyped sha, corrected; the main checkout switched
while #99's third local suite ran there (that run not counted); one `test/ci` check run outside the machine lock; one
message announced a lens re-check a minute before it was sent.

### Earlier updates

- **Update 03:02Z:** file 2's units `r0`–`r5b` are all built and integrated on the local `records-branch` (no push):
  `r1`, `r1b`, `r2` (after two fix rounds) and `r5` approved; `r3`, `r4` and `r5b` in their last fix rounds (`r4` at
  the review cap's last round: a second machine's stale copy, a deletion published from elsewhere, a forced restore
  and a case-insensitive disk could each have reverted or deleted a record; each fixed or being fixed, S24–S26). The
  first full suite on the integrated tree is running alone under the machine lock. Sign-offs so far: S1–S28.
- **Update 02:25Z:** pull request #100 (file 1) is green on every CI leg at `5284eaaa`, in draft, held for your merge
  and the tag push; its local full suite met three timeouts in untouched files under the machine's load, each green
  alone. File 2 is building on the local branch `records-branch` (not pushed; its first push comes after `r7`): `r1`
  (the records suite) approved; `r1b`, `r2`, `r2b`, `r4` built; `r3` and `r5` building; `r4`'s review found a real data
  loss in the persisted design (a second machine's older copy could silently revert a published record), now being
  fixed with a sync base (S24). Load averages have dropped to 5–20 and 15 GiB is free.
- **Update 01:06Z:** the review bot's one finding on #100 was real (an exact release pattern ran `git ls-remote`,
  breaking the lane's "no network call but `git fetch`" promise; S16) and is fixed in `5284eaaa`, re-reviewed
  (approve), pushed at 01:06Z; the pull request stays in draft (a P2 earns no further bot review). File 2's `r0` stands
  at that head (every capture equal); `r1` is building.
- **Where it stood (interim, 00:08Z):** the audit is done (the late work holds up; two small record facts settled
  as S1–S2). **Pull request #99** (the hook-runner flake): a hook that exits without reading its input made the runner
  report `Hook process failed (EPIPE)` — every time above the 64 KiB pipe buffer, now and then below it; on Windows the
  same write fails as `EOF`. Fixed, three review rounds (approved), the review bot's one P1 taken (a signal-killed hook
  stays failed), CI green on every leg at `47be2027`, the bot's second review clean; ready, waiting for your merge.
  **Pull request #100** (file 1): built in three lanes, every unit reviewed (approve) with its security lens where
  classed, the whole-branch review on Fable 5.1 approved, CI green on every leg at `ee8aa3b8`; marked ready for the
  bot at 00:07Z. The tag `evals-retired-2026-10-13` is made locally and waits for your push. **File 2:** re-planned
  (S10–S12, S15); `r0`'s baselines captured at `ee8aa3b8`; `r1` (the records suite) is being built.
- **Worth a look:** the machine is heavily loaded by other projects' work (load averages 40–50 at 00:05Z: headless
  browsers, other sessions); local suites now miss wall-clock bounds in files these branches do not touch, re-run
  alone per the rules, with CI as the evidence of record. The data volume is down to 13 GiB free, mostly not this
  session's; cleaning caches is yours to decide.
- The night started at 21:58Z; the opening batch was answered at 22:06Z.

## Opening batch (2026-10-13T22:06:46Z), verbatim

Pre-flight (21:58Z–22:03Z): `gh` signed in, token scopes `gist`, `project`, `read:org`, `repo`, `workflow`; the data
volume 28 GiB free of 460 (94% used); load averages 8.21, 6.05, 4.91 on 8 cores; all four `STAMITY_*_BIN` set and each
client reports signed in (Claude Code `auth status`, Codex `login status`, Cursor `status`, Copilot's config lists a
logged-in user), so every full suite is also a live client check and runs alone under the machine lock; the machine
lock free (`lockf -k -t 0 /tmp/stamity-machine.lock true` exit 0); `main` = `origin/main` = `6dfa5ffe`, its push runs
green (CI 38393032096, success).

The start question ("File 2: may `r0`–`r5` run unattended once every start question is answered?") was
answered by the maintainer's start message, not asked again: "Run tonight: the audit, the /st-debug on the hook-runner
flake with its own pull request, the re-plan of plan 014, file 1's build (f0–f4) and file 2's r0–r5, the reviews and
fixes, and each pull request with its CI read to the end on every push (both Windows legs); every full suite alone,
under the machine lock."

The four questions, each answered with the option shown:

1. "Plan 014 is stale: may the session re-plan each file in-flow at its /st-work start (unit ids and settled defaults
   kept, the four folds and today's ci.yml folded in) and pass the plan gate itself tonight, listing every change as a
   morning sign-off?" — **"Re-plan, pass the gate (Recommended)"**
2. "File 1's fork import recipe (f1): push `main` only, as the 2026-10-08 fold says, or `main` plus upstream's `v*`
   tags, as the plan's settled default 1 says?" — **"Main only, per the fold (Recommended)"**
3. "How should the three branches stack (this decides your morning merges)?" — **"Fix → PR 1 → PR 2 (Recommended)"**
   (the flake fix branches from `main`, pull request 1 from the fix's head, file 2 from pull request 1's head; the
   morning is fast-forwards in order).
4. "Accept the night's other defaults N1–N7 listed above?" — **"Accept all (Recommended)"**. The defaults, as listed
   before the question:
   - N1: f4's tag `evals-retired-<UTC date>` is made locally, annotated, on today's `main` `6dfa5ffe` (it carries all
     145 files); its push waits for the maintainer, and pull request 1 merges only after it.
   - N2: Pull request 2 stays local tonight: `r0`–`r5` committed on its branch, not pushed; `r6`'s read-only steps
     prepared (the ruleset list read, the exact morning commands written into the record).
   - N3: Each pushed pull request (the flake fix, pull request 1) stays a draft while worked; at its end it is marked
     ready once for the review bot, whose Critical and Warning findings are fixed in one batch back in draft; it stays
     held for the maintainer's merge.
   - N4: A CI leg red only on a known flake is re-run once; a second miss on the same test becomes a finding.
   - N5: Review cap three rounds per unit; anything open at the cap goes on the morning list.
   - N6: Spec amendments touching the APM and plugin specs stay (they keep those pages true until the routes are
     deleted); only `r8`'s APM figure and the prose that carries it are skipped: the route leaves in the next release.
   - N7: This record carries the answers verbatim, the sign-offs and the morning note at its top.

Held for the maintainer's morning (the start message): every merge into `main`, f4's tag push, file 2's outward steps
`r6`–`r8` (the records branch push, the ruleset, the first `records.yml` run, the removal from `main`) with pull
request 2's first push for CI after `r7`, the QA rows, and the close (its leftovers question first).

## Morning batch (2026-10-14T07:25:21Z and 07:26:41Z), verbatim

The maintainer asked, at 07:23:13Z, "walk me through everything remaining via question tool." Two rounds of four; every
answer the recommended option.

Round 1 (answered 07:25:21Z):

1. "Push the tag `evals-retired-2026-10-13`, then fast-forward `main` to #99 and then to #100 (admin bypass, reading
   main's push CI to the end after each, both Windows legs)?" → **"Do all three now (Recommended)"**
2. "S32: the records script's case check misses folder names that differ only in case (review/33, a Warning), its
   Unicode fold differs from the disk's (review/34), and its advice for a pair already on `records` can't be followed
   (review/32). Today's records are clean. What now?" → **"Fix + fresh review before r6 (Recommended)"**
3. "r6 creates the `records` branch (489 records plus 4 branch files), adds the ruleset (no deletion, no force push,
   no bypass), and checks that a force push from a scratch clone is refused. How should it run?" → **"Run all of r6,
   this answer approves (Recommended)"**
4. "r7 untracks the records on `records-branch` and rewrites CONTRIBUTING's ritual, the eval README, the release
   checklist, two pointers and the CHANGELOG; then the branch's first push opens PR 2. How far should I go?" →
   **"Build, review, push, mark ready (Recommended)"**

Round 2 (answered 07:26:41Z):

5. "Once PR 2 is green and the bot is answered: r8, the Prove phase (spec delta, the persisted plan's amendment
   notes), the Fable delta pass, then the fast-forward merge of PR 2. Where should I stop?" → **"Do all, ask before the
   merge (Recommended)"**
6. "QA rows (at most three that need a person). I will perform and record the machine rows myself: the refused force
   push and a fresh clone's npm test without setup. Which do you want to check by eye?" → **"One: the records branch
   page (Recommended)"**
7. "The close: take the leftover recommendations for file 2's eight Minors, publish tonight's three run folders and
   inbox edits to `records` after a public-text read, then do the close's last steps […]?" → **"Accept all, run the close (Recommended)"**
8. "After the close: nine worktrees remain (p18-suite, p18-r0, p18-check-pr1, p18-r1, p18-x, p18-y, p18-z, p18-z4,
   p18-w). Clean up how?" → **"Remove worktrees, keep branches (Recommended)"**

Later answers the same morning, verbatim:

- **07:42:43Z (disk):** "Free disk space before r7's full suite (4.8 GiB free now)? …" → **"Package caches, ~1.1 GB
  (Recommended)"** (npm, pip, Homebrew, pnpm's metadata and node-gyp caches cleared: 1,240 MiB freed).
- **07:52:52Z (QA, the person row):** "QA row: does github.com/zomarit/stamity/tree/records look right — the README
  rendering as the records branch's guide, and the .stamity, docs and evals folders present, on one import commit?" →
  **"Looks right (Recommended)"**
- **08:19:22Z (`r7`'s review, file 2's ledger `review/39`, `/40`, `/38`):**
  1. "W-1: in a fork (no `records` branch on its origin), CONTRIBUTING's ritual has the contributor run `setup`,
     which fails and suggests `init` — the canonical repo's one-time step. How should r7 fix it?" → **"Pass --ref
     through setup (Recommended)"**
  2. "W-2: the st-eval-run skill's step 6 and SET-v7's run-artifact contract still say to commit RESULTS.md on main.
     Both are eval inputs: editing them makes the next release, even a patch, run the full eval set (REQ-PROVE-033)."
     → **"Defer to 1.15.0's prep (Recommended)"**
  3. "review/38: a release's eval evidence and measurement snapshot now live on `records`, cited by path only. How
     should a release pin which records commit it measured?" → **"Name the commit at the cut (Recommended)"**
- **10:49:41Z (the review bot and the stop before the merge, file 2's ledger `pr/4`, `prove/1`, `review/45`):**
  1. "pr/4 (bot P2): release.yml restores whatever `origin/records` is when the release run starts, not the records
     commit the cut used, so a delayed or re-run tag release could test against later evidence. What now?" → **"Log
     the sha now, pin at 1.15.0 (Recommended)"**
  2. "prove/1: after the move, the packed npm package differs from before in README.md, the type declarations (S12)
     and package.json, which gained r1's `test:records` script line. npm never runs a dependency's non-lifecycle
     scripts, so installs behave the same." → **"Accept as planned exceptions (Recommended)"**
  3. "review/45: the README on the `records` branch is still the copy `init` imported (the older name rule and repair
     advice); no command carries branch files there. How should it be refreshed?" → **"Refresh right after the merge
     (Recommended)"**
- **11:24:57Z (the merge of #101, file 2's ledger `pr/9`, `pr/10`):**
  1. "Merge PR #101 into main now by fast-forward (main 5284eaaa → c96c7146, admin bypass), then read main's push CI to
     the end, re-run the records branch's first Records run, refresh its README, and run the close?" → **"Merge and run
     the close (Recommended)"**
  2. "pr/9 and pr/10: the short ref `origin/records` remains in two commands a person runs (the release checklist's
     notes line, the printed repair steps). Where should they go?" → **"Schedule with security residuals
     (Recommended)"**

## The audit (22:08Z–22:13Z, read-only)

The session opened with a context-rot check of Package 19's late public work before anything else: pull request #98
(fast-forwarded to `main` as `7396bb52`, base `41b1899a`), its three close commits `97ae3769`, `fb48349e` and
`6dfa5ffe`, and the run's records (`.stamity/runs/2026-10-12_board-writes/`, the inbox). One auditor (Opus 5.5, effort
`medium`, read-only git and `gh`) read them.

**In plain words: the late work holds up.** Every commit sha and CI run id the record cites exists and says what the
record claims; the inbox query reads 148 rows, 0 problems, 0 skipped; no ledger carries an `open` row
(`npx vitest run test/records/ledgers.test.ts`, 38 of 38); the leftovers arithmetic adds up (90 = 90); and every push
run on `7396bb52`, `97ae3769`, `fb48349e` and `6dfa5ffe` finished green — the Pack signing rehearsal on `7396bb52`
(38357536961) among them, and CI 38375420957 on `97ae3769` on its second attempt, its first having met the flake this
session's `/st-debug` takes. It found two wrong facts a later session could act on and five cosmetic notes, settled
under the opening rule as S1–S3 below.

## Frame (file 1)

- **Outcome:** plan 014 file 1 lands as pull request 1 — the private import takes `main` only, the lane fetches only
  the tags its release pattern can select, the nightly runs only in the canonical repository, and the 145 superseded
  eval inputs leave `main` behind an annotated tag — with the product (npm package, plugin distribution, APM content,
  CLI) unchanged. Out of scope: the records move (file 2), any history rewrite, a release cut.
- **Base:** pull request 1 stacks on the flake fix (opening answer 3); its branch starts from the fix's final head.
  The retirement tag goes on `main`'s `6dfa5ffe` (N1).
- **f0's capture, run early (22:19Z) because it reads `main` only:** `git ls-tree -r 6dfa5ffe -- <the 15 path
  arguments>` prints 145 rows, sha256 `9444c836cd40b223549d664723bf82ad96b2135497d68c13f81e6005be6d5946`; the same 145
  at the plan's stamp `9239379c` (`git diff --stat 9239379c 6dfa5ffe` over them is empty), so no file was added under a
  retiring folder. The reader re-check (`git grep` over `scripts src test .github website content vitest.config.ts
  package.json` and the config files) finds eight hits, none a reader: comments (`test/emit/crossClientGoldens.test.ts:1937`,
  `test/evals/coverage.test.ts:3`, `test/evals/fixtureCount.test.ts:6`, `test/evals/roster.test.ts:3`), prose
  (`.github/release-controls-checklist.md:224`), string pins (`test/evals/prospectiveCalibration.test.ts:118`;
  `test/change/testInputs.test.ts:225-232`, a synthetic `evals/cases/**` glob over a synthetic map). No markdown link
  outside the records targets a retiring path.
- **The inbox (Frame step 4):** `stamity ledger inbox --plan docs/plans/014-lean-repository-01.md --paths <file 1's
  files>` (22:19Z): 148 rows, 10 matched, 0 unparsed, 0 skipped. None is settled by plan 014 file 1, so all ten stay
  in the inbox (the plan gate's default): lines 163, 164, 165 and 216 (counts typed in the eval set's prose), 194 (a
  fork-layer way to declare a fork's own test inputs), 195 (the `records_only` output's leaving release — file 2's
  `r5` deletes that script and takes it up there), 213 and 215 (literal ids on two pages), and 263 and 264, whose own
  `when:` is "the nightly is enabled"; f3's guard does not touch their lines.

## Build (file 1)

Lanes from `bb417ada`, one implementer each (Opus 5.5, effort `high`), dispatched 22:34Z after the local tag
`evals-retired-2026-10-13` was made (22:33:47Z; annotated, on `6dfa5ffe`, 145 rows, sha256 equal to f0's, an ancestor
of `origin/main`, not on the remote).

- **Lane B, f3** (`reports/f3-implementer-r1.md`): `1f8dd60e` at 22:37Z — the guard on all three nightly jobs, a
  describe evaluating it for both triggers, the census 13 → 16. Review (`reports/f3-reviewer-r1.md`, 22:43Z):
  **approve**, confidence high, 0 findings; its lead for Prove (cite workflows by job and step name) went into the
  plan's § C. Security lens (`reports/f3-security-r1.md`, 22:41Z): 0 findings.
- **Lane C, f4** (`reports/f4-implementer-r1.md`): `417103ff` at 22:41Z — the 145 deletions matching the tag path for
  path, the README, CONTRIBUTING, checklist and the three CHANGELOG bullets; one Minor (`build/1`, two README commit
  ids no ref carries). Class `product` (no lens). Review (`reports/f4-reviewer-r1.md`, 22:51Z): **approve**,
  confidence high, three Minors (`review/1`–`/3`; S13). Fixer (`reports/f4-fixer-r1.md`): `bb1ac17c` at 22:55Z —
  "the first online run", the restore command with all 15 paths (run from the root into a scratch folder: 145 files
  back), `5692f741` and `98318f66` for the two ids.
- **Lane A, f1 then f2** (`reports/f1-implementer-r1.md`, `reports/f2-implementer-r1.md`): `70f8dd9b` at 22:39Z (the
  recipe, the prose, the header, `REATTESTATION_DATE`, the new `test/upstream/importRecipe.test.ts`, three cases red
  first) and `bd603a27` at 22:55Z (the cut refspec, the load check, the exact-pattern lookup, the online sweep and its
  stale exact tag, the rebuilt unrelated-history fixture; seven of eight new cases red first). f1's class
  `security-sensitive` (the fork-release comment), f2's `product`, with the lens added by the task's topic (refspecs
  built from fork configuration). Reviews (`reports/f1-reviewer-r1.md` 23:04Z, `reports/f2-reviewer-r1.md` 23:04Z):
  **approve** both, confidence medium; f2's three Minors (`review/6`–`/8`). Lenses (`reports/f1-security-r1.md`
  23:00Z, `reports/f2-security-r1.md` 23:01Z): one Minor each (`review/4`: `--follow-tags` and `push.followTags`;
  `review/5`: the exact tag matched only by its name's end). Fixer (`reports/f2-fixer-r1.md`): `1b4f3006` at 23:21Z —
  both lens Minors and a multi-`*` lifecycle case; `review/6` and `/7` (the spec text) went to Prove. Its verify met
  one case of `test/upstream/workflowRecovery.test.ts` red once at 21 s and green alone and on the re-run, a file
  this branch does not reach; noted, watched in the full suite.

**Integration** (23:22Z): branch `lean-repository` from pull request #99's head `47be2027`, the lane commits
cherry-picked in order without a conflict — `70f8dd9b` → `22937b26`, `bd603a27` → `f6bd130b`, `1b4f3006` → `8a85803b`,
`1f8dd60e` → `69d33d5b`, `417103ff` → `f483458c`, `bb1ac17c` → `7327f435`. The lane branches are kept: these lines cite
them.

## Prove (file 1)

- **`gate classify --base 47be2027`** (23:23Z): `security-sensitive` (the process-spawn rule at
  `scripts/upstream.mjs:882`; `.github/workflows/fork-release.yml`), checks `scan`, `gates-all`, `review`, lens
  `stamity-security` (run per unit above); 168 paths, every test.
- **The spec delta** (spec-author, `reports/prove-spec-author-r1.md`, 23:33Z): REQ-UPSTREAM-002 and REQ-UPSTREAM-014
  (`docs/specs/enterprise-upstream-lane.md`), REQ-PROVE-009 with its banner and Non-goal
  (`docs/specs/prove-behavior-and-value.md`), REQ-PLUGIN-020's paragraph (`docs/specs/plugin-lifecycle.md`), every
  citation at the branch head; three Minors (`prove/1`–`/3`). Commit `8e9f588b` at 23:33Z.
- **The whole-branch review on Fable 5.1** (`reports/branch-reviewer-r1.md`, 23:44Z): **approve**, confidence medium;
  the cross-unit contracts hold (the guide's two edits, the three CHANGELOG bullets against f2, f3 and f4, every spec
  citation, the re-attestation date against both headers, the README's swapped ids); one Minor (`review/9`).
- **An integration check in a worktree pinned to `8e9f588b`** (`p18-check-pr1`, 23:35Z–23:47Z, returned in full, no
  report): build, scan (163 files, no hit), lint, typecheck, the leak gate (0 hits, 1,746 files), knip — every exit 0.
  Its step 7, `npx vitest run` over eight test folders, ran past the runner's ten-minute limit and was stopped by its
  PID with no counts. **The session's slip:** `test/ci` holds `test/ci/pluginLifecycle.test.ts`, the four clients'
  live walks, so that step was a live client check outside the machine lock, beside pull request #99's suite; the
  final full suite, alone under the lock, is the evidence of record instead. The killed run's temp root (769 MB) was
  removed; the data volume read 13 GiB free (97% used) at 23:49Z, down from 28 GiB at the start, most of it not this
  session's (its temp roots, worktrees and caches together are a few GiB).
- **The Prove fix round** (fixer, `reports/prove-fixer-r1.md`): `review/9` (the README names `rubric-v4.md`…`rubric-v7.md`
  among the documents that read a retired file at the tag) and the spec-author's `prove/1`–`/3` (REQ-PROVE-020's
  checklist citation; both spec headers name the 2026-10-13 amendments); commit `ee8aa3b8` at 23:51Z. The fixer's one
  left-out note (the spec's frontmatter comment lists amending runs without this one) is dropped as cosmetic.
- **Pre-push gates on `ee8aa3b8`** (test-runner, returned in full): knip, the leak gate (0 hits, 1,754 files), scan
  (171 files since `47be2027`, no hit), and 174 docs, eval-README and spec tests; every exit 0. The earlier
  integration check's build, lint and typecheck stand for the code: only Markdown changed since `8e9f588b`.
- **Pull request #100** (draft) opened at 23:56:29Z from `lean-repository` at `ee8aa3b8`, stacked on #99 (its first
  commits are #99's). The tag `evals-retired-2026-10-13` is not on the remote (`git ls-remote` prints nothing): its
  push waits for the maintainer, before the merge (N1).
- **CI on #100 at `ee8aa3b8`**: all 20 checks done by 00:06Z, every one green or skipped by design —
  `check (lts, node 24)` (the coverage floors), `check (floor, node 22.22.2)`, `check (windows-1, node 24)` and
  `check (windows-2, node 24)`, the APM and plugin routes, the docs-site build, `all-ci-checks` and `all-pr-checks`.
  **Marked ready** at 00:07:11Z for the review bot (N3).
- **The full suite on `ee8aa3b8`** (test-runner, `reports/full-suite-test-runner-r1.md`, log `reports/full-suite-r1.log`),
  in the worktree pinned to it, alone under the machine lock (it waited about 14 minutes for the lock; vitest started
  00:07:57Z): build, scan (163 files, no hit), lint, typecheck, the leak gate, knip, and
  `node scripts/ci/test-run.mjs --coverage` — every exit 0; 295 of 295 files, 14,076 passed, 18 skipped, 635.69 s;
  statements 97.29%, branches 91.58%, functions 99.15%, lines 98.14%, the floors held; the four live walks passed
  (Claude 21.0 s, Copilot 25.5 s, Codex 9.3 s, Cursor 241.3 s); load 44.12 before, 24.89 after; 12 GiB free before,
  14 GiB after. The bot's fix batch then changes `scripts/upstream.mjs`, so the final tree gets a run of its own.
- **The review bot** (review 5511580723 on `ee8aa3b8`): one P2 (comment 4265439155), taken as S16; the pull request
  back in **draft** at 00:18Z for the batch.
- **The fix batch** (fixer, `reports/pr-fixer-r1.md`): `fetchReleaseTags` and its `ls-remote` removed; an exact
  pattern fetches `refs/tags/<pattern>*` and the sweep keeps only its tag (`scripts/upstream.mjs:387-397`, `:1067`,
  `:1075-1094`); two cases — a `GIT_TRACE` trace of the lane's git finds `fetch` and no `ls-remote` (red before the
  change), and `v1.1.0` kept beside `v1.1.0-rc.1` (it fails with the sweep disabled); REQ-UPSTREAM-002, the guide's
  `releases.pattern` row and the CHANGELOG bullet say "keeps". Commit `5284eaaa` at 00:30Z. Re-review
  (`reports/f2-reviewer-r2.md`): **approve**, confidence medium, `pr/1` fixed, no new finding. Pre-push gates on
  `5284eaaa` (returned in full): lint, typecheck, knip, the leak gate, scan (171 files), 276 lane and docs tests; every
  exit 0. Pushed at 01:06:07Z; the bot's comment answered (reply 4265716727); the pull request stays in draft.
- **CI on #100 at `5284eaaa`**: all 20 checks done by 01:18Z, every one green or skipped by design, both Windows legs
  and `all-ci-checks` among them.
- **The full suite on the final tree `5284eaaa`** (pinned worktree, `reports/full-suite-r2.log`, returned in full):
  build, scan (163 files, no hit), lint, typecheck, the leak gate (0 hits, 1,746 files) and knip pass; the suite,
  alone under the lock at load 39–52 from other projects, read 3 failed of 14,096 — one 60-second timeout each in
  `test/cli/ledgerForgery.test.ts`, `test/emit/sharedCharterIdentity.test.ts` and `test/emit/syncDriftProof.e2e.test.ts`
  (with a temp-folder cleanup error), none a file this branch touches — so no coverage table was printed; each of the
  three passed alone under the lock (54 of 54, 17 of 17 after the runner's own timeout retry, 13 of 13); all four live
  walks passed (Claude 67.4 s, Copilot 39.5 s, Codex 18.0 s, Cursor 316.0 s). Under the rules these are load, not
  defects; CI's legs at this head (the coverage floors on lts among them) are the evidence of record, and the suite on
  `ee8aa3b8` passed whole.
- **The tag and the merge** (2026-10-14, the morning batch's answer 1): `git push origin
  refs/tags/evals-retired-2026-10-13` at 07:28:04Z; `git ls-remote` shows the object
  `e3a3528541b3d06870c19902d79e1afdd9946385` and, on its `^{}` line, `6dfa5ffe36890ee04e1d3d3508100b5974d47207`. After
  #99's merge (`6dfa5ffe..47be2027`, its push runs green), `main` fast-forwarded `47be2027..5284eaaa` at 07:30:05Z under
  the admin bypass (the pull request was still a draft); GitHub marked #100 merged at 07:30:05Z. `main`'s push runs on
  `5284eaaa`: CI 38528722843 `success` (`prove-pr` found the tree proved, the full legs skipped by design,
  `all-ci-checks` passed) and Docs site 38528723136 `success`, read to the end at 07:31:37Z.

## Sign-offs

Decisions the session takes on the recommended option after the opening batch, for the maintainer's morning read.

- **S1** (22:14Z) The inbox's schedule paragraph (`.stamity/inbox.md:179-180`) still says its first seventeen rows are
  tagged `decision-waiting` and asked first at the next attended close; that close ran and no row carries the tag now.
  Fixed with one sentence in the flake fix's records commit, which edits the inbox anyway (it retires `prove/4`).
- **S2** (22:14Z) `prove/4`'s ledger evidence and the closed record's line 267 call the failing value "a counter" and
  name only the first miss, where the inbox row (corrected in `fb48349e`) says the run's status, with both misses. The
  closed record and its ledger stay read-only, as for every closed record; the debug run's record states the failing
  value and both misses, and the fix retires `prove/4` with that record as its evidence.
- **S3** (22:14Z) The five notes — a placeholder stamp ("09:0xZ") and a close-minutes estimate in the closed record,
  the proof block's secret-scan count from before the close regenerated two files (a fresh scan at `6dfa5ffe`: 82
  files, 0 hits), a skipped sign-off number and moved line numbers, and the leftover local lane branches with the
  remote `board-writes` branch: dropped as cosmetic, the closed record being read-only. The lane branches stay on
  purpose (the record cites lane commits); deleting the remote branch and the scratch QA repository is the
  maintainer's, listed in the morning note.
- **S4** (22:14Z) The `/st-debug` marker check's two hits sit in the QA tables of two closed records that quote a
  planted probe (`.stamity/runs/2026-09-30_optimization-sweep/qa.md:181`, `.stamity/runs/2026-09-30_release-1-11-0/qa.md:296`):
  not probes, so not stripped. The inbox row naming that false match is folded into plan 014 file 2's `r7`, which this
  session's file 2 run takes up.
- **S5** (22:33Z) The re-plan (`plan.md`, "What changed from the persisted plan", items 1–9) passes the plan gate under
  opening answer 1. Its changes from the persisted plan: settled default 1 reversed by opening answer 2 (the import
  pushes `refs/heads/main` alone, with `--no-tags`); one writer each for `CHANGELOG.md` (lane C) and
  `test/docsPages.test.ts` (lane A); f2 takes the `build/368` fold (the unrelated-history fixture rebuilt from a fresh
  `git init`, its preconditions asserted); f1 also qualifies the guide's other mirror-era sentences and
  `fork-release.yml`'s comment and warns against pushing tags from the working clone; f4's never-edited list grows by
  `evals/rubric-v4.md`, `evals/MODEL-PROFILES-v2.md` and `.claude/skills/st-eval-run/SKILL.md`; f3's paragraph sits
  after REQ-PLUGIN-020's quoted paragraph; three lanes in parallel.
- **S6** (22:33Z) Every dated text in pull request 1 — the tag `evals-retired-2026-10-13`, the spec amendments, the
  re-attested headers, the CHANGELOG — carries 2026-10-13, the day the change was made, rather than the merge date the
  persisted plan named, so that the texts agree with the tag pushed before the merge.
- **S7** (22:33Z) The re-attested headers name `c3d81529`, the 1.14.0 cut each page was last fully verified at, and
  say what was re-checked, in the form of the page's own 2026-09-26 header.
- **S8** (22:33Z) The working clone's `git fetch upstream` still brings upstream's tags into that local clone, where
  the pinned baseline check needs them; the guide adds one sentence to push release tags by name, never with
  `--tags`, rather than changing the fetch and its pinned check line.
- **S9** (22:33Z) Plan 016's two lines that assume an import carrying upstream's `v*` tags
  (`docs/plans/016-fork-distribution-02.md:645-646`, `-03.md:880`) are not edited here; the close schedules them for
  plan 016's re-plan at its build.
- **S10** (22:42Z) File 2's re-plan (`.stamity/runs/2026-10-13_records-branch/plan.md`, "What changed", items 1–11)
  passes the plan gate under opening answer 1. The largest change: `r5` keeps `scripts/ci/records-only.mjs` and the
  `changes` job, which plan 019 file 1 made the classifier of four CI lanes, and removes only its `records` lane and
  the `records_only` output; the persisted "retire the script and the `changes` job" would have removed the whole lanes
  side. With it: the canonical `records` job runs on every trigger with no `needs`, asserted outside the aggregator's
  three shapes; `release.yml` gains two named steps and no extra fetch; the records census grows to 82 case sites;
  the measurements page reads four inputs (its run of record's prior run included), and `r2` splits into `r2` and
  `r2b`; inbox rows 104 and 105 become `r5b`, row 133 joins `r5`.
- **S11** (22:42Z) Inbox row 247 (the measurements page refuses a run composed on a composed run, placed for file 2's
  build): kept as built. The one-link rule stands and run 45 stays the run of record until the next release's eval run
  replaces it; no code change, and the close retires the row.
- **S13** (22:52Z) Ledger row `review/3` (decision needed; f4's review M-3: `evals/README.md` is hashed into run 45's
  inputs and named by the release checklist as an eval trigger, so retiring rows from it makes the next release run at
  least a small eval): accepted and recorded, not avoided. The next release runs one anyway — pull request 99's change
  to the emitted hook runner moved the cross-client goldens, a trigger of the same eval line — and leaving the README
  pointing at deleted files is the worse cost. Fixed instead in this branch: `review/1` (the f2 bullet says "the first
  online run"), `review/2` (the restore command names the full paths), and the pre-existing `build/1` (the README's two
  commit ids no ref carries, replaced by ones that resolve).
- **S15** (23:39Z) File 2's `r1` returned `BLOCKED_DEPENDENCY` with two smallest inputs, both taken as its
  implementer recommended: (1) `test/ci/testScheduling.test.ts` joins `r1`'s files — its two discovery cases pin the
  default suite's file set, so excluding `test/records/**` must move them, with a reason, plus one check that the
  records config finds exactly `test/records/`; the re-plan's census had missed this consumer. (2) The helpers that
  need `src/` (`renderProblem`, `inboxRefs`, `retiredProblems`) are built in `test/support/recordGates.ts` by a
  factory each test file hands the real parsers, rather than widening `test/support/support.test.ts`'s rule that
  support modules import nothing from `src/`. Its note is accepted as intended: `npm run test:records` in a checkout
  holding an in-progress run's ledger refuses that ledger's `open` rows — the same rule that stops a record with an
  `open` row from being published mid-run.
- **S16** (00:18Z) The review bot's P2 on #100 (comment 4265439155, ledger `pr/1`): the exact-pattern path's
  `git ls-remote` breaks the lane's own invariant 7, "No network call other than `git fetch` of the configured
  upstream" (`docs/specs/enterprise-upstream-lane.md:135-136`; the guide repeats it at
  `docs/enterprise-forks.md:1389-1392`). The invariant binds and the code changes, not the contract: an exact pattern
  fetches with the glob refspec `refs/tags/<pattern>*`, counts the tag present only when its own namespace ref exists
  afterwards, and the online sweep keeps only that ref. This reverses the plan's settled default 3 ("the lane asks
  `git ls-remote --tags` first"), whose research had missed the invariant; no error text of git's is parsed, at the
  cost of a bounded over-fetch (tags that start with the exact name) swept in the same run. One fix batch, the pull
  request back in draft (00:18Z); a P2 is not a Critical, so no further bot review is asked for.
- **S17** (01:53Z) File 2's `r1` returned `BLOCKED_FAILURE` only on the full `npm test`: every check aimed at the
  unit passed (the records suite, the moved cases byte-identical, the census guard, the architecture and scheduling
  tests, lint, typecheck, knip), and the full suite went red three times on timeouts in process-spawning files it does
  not touch, each passing alone under the machine lock, while other projects held load averages of 30–140. Under the
  rules a failure that shows only under that load is not a defect, so `r1` is committed (`356901ca` in its lane,
  `3190fa20` on `records-branch`); the branch's own full suite runs once the lanes are in, and CI's legs are the
  evidence of record when the branch is pushed after `r7`.
- **S18** (01:53Z) `r1`'s finding W-1 (file 2's ledger `build/1`, decision needed): `.stamity/change-classes.json`
  still names `test/records` as the suite for record and spec paths, which the default config now excludes, so CI's
  lane step and `gate classify`'s narrow selection would run no records case for such a change. Fixed in this pull
  request by `r5`, as its cell already plans (the record-path entries leave the map, and `test/records` leaves the
  `docs/specs/**` entry, the canonical `records` job running the suite instead); the row closes when `r5` lands, and
  the branch is not pushed before then.
- **S19** (01:53Z) The contract census before file 2's parallel lanes: the one contract three lanes write is
  `.stamity/change-classes.json`'s `testInputs` map (each lane declares only its own moved or new test files);
  integration cherry-picks the lanes in order X, Y, Z and keeps every entry on a conflict (a union). Every other shared
  contract has one producer: `test:records` (`r1`) read by `r4` and `r5`; `src/cli/docs/measurements.ts`'s exports
  (`r2`) read by `r2b`, `r3` and the `records.yml` template (`r4`); `scripts/records.mjs` (`r4`) read by `r5`.
- **S20** (02:02Z) File 2's ledger `review/3` (decision needed; `r1`'s security lens W-1: the records gate reads every
  run folder on disk, so an in-progress run's legal write-ahead `open` row turns `npm run test:records` red during a
  run): a run whose record still reads `Status: in progress` is skipped by the records suite's ledger and `Ref:` checks
  and left out of a `records.mjs commit` publish, with one printed line each. This reverses S15's third point, which
  had accepted the red as the publish gate's own rule: that reading would also block publishing a closed run while
  another is in progress (tonight's three runs are that case). Published records still never carry an `open` row,
  since a run is published at its close. `r1`'s side goes to its fixer; `r4`'s implementer, mid-build, was sent the
  same rule (02:00Z).
- **S21** (02:03Z) File 2's `r2` returned `BLOCKED_DEPENDENCY` with the unit built: its change turns red 20 existing
  measurements cases that `r2b` owns (same file, next in lane Y) and one hand-page case `r3` owns. Taken as its
  implementer recommended: `r2` is committed with those planned reds (`495e3bd1`), keeping one writer per file; the
  lane's head is green only once `r2b` and `r3` land, and the branch is pushed after both. Its W-1 (ledger `build/2`:
  `r2b`'s cell missed one of the twenty) is fixed by amending that cell (02:03Z).
- **S22** (02:11Z) `r2`'s review (request-changes; file 2's ledger `review/4`–`/6`): W-1 (a new case spells the
  canonical route in code, which the fork-identity census counts) goes to `r2b`, which owns that test file now — the
  case asserts the constant's shape, and every expected record link is built from the imported constant (message at
  02:11Z); W-2 (the release checklist's fifth line and the hint at `scripts/merge-ready-rate.mjs:59` still say a
  snapshot refresh updates the page, which the pinned snapshot no longer does) splits — the script hint in a small
  fix round in lane Y after `r2b`, the checklist in `r7`, whose cell already rewrites that passage; M-1 (the
  generator's exit 1 tested only through the pure function) rides `r3`'s records-free scratch case.
- **S23** (02:21Z) File 2's `r5` returned `BLOCKED_DEPENDENCY` (ledger `build/7`, decision needed): dropping the
  four record-path entries from the test-input map, as its cell and S18 said, turns the census guard red while the
  records are still tracked (18 and 209 gaps). Taken as its implementer recommended: `r5` removes only `test/records`
  from the `docs/specs/**` entry, and the four entries leave in `r7`, in the commit that untracks the records. S18's
  row closes in two halves — the CI half with `r5`'s merge-blocking `records` job, the map half at `r7` — and the
  branch is not pushed in between.
- **S24** (02:25Z) File 2's ledger `review/9` (Critical, decision needed) and `review/10` (Warning, decision needed),
  from `r4`'s review: the persisted design has `commit` fetch `origin/records` and then write every on-disk record
  over it, so a second machine's older copy silently reverts a published change in a fast-forward push; and the
  "run restore" advice after a rejected push cannot tell an unpublished edit from a stale copy, so `--force` loses
  the edit. Taken as the reviewer's direction: the checkout records the records commit it last synced to (restored
  or published), in a ref no fetch moves; `commit` refuses, naming `restore`, when `origin/records` moved past that
  base, and builds on the base; `restore` merges three ways against the base — a file changed only upstream is
  written, only on disk is kept as a pending edit, on both with different bytes is refused and listed (no write) —
  then moves the base; with no base yet, `restore` keeps today's refusal of a differing file without `--force`. With
  it, the same round fixes `review/11` (a dry run must move no ref), `review/8`'s template half (the records
  workflow's leak gate scans a worktree of the pushed commit with `--root`), `build/4` (the records-suite gate runs
  vitest through `process.execPath`, so `commit` publishes on Windows) and `build/5` (a local `records` branch moves
  with the push). A separate worktree from `bb44ee41`, beside `r5`, whose files it does not touch.
- **S25** (02:37Z) File 2's ledger `review/14` (decision needed; the fixer's own W-1 in `r4`'s round 1): with the
  sync base, a deletion published from another machine leaves the file on this disk, and the next `commit` would
  publish it again. Taken: `restore` deletes a record only when upstream deleted it since the base and the disk copy
  is byte-identical to the base's (a pending-edit-free stale copy, so nothing unpublished is lost); a deleted-upstream
  file the disk changed is a conflict, listed, and nothing is written. This narrows the persisted "restore never
  deletes" to "restore never deletes a file that holds unpublished bytes"; `--force` keeps today's no-delete
  overwrite. A second fix in the same worktree, then the re-review of every round-1 id.
- **S26** (02:53Z) File 2's ledger `review/21` (decision needed, `r4`'s round-2 re-review): `restore --force` skipped
  the deletion pass yet moved the sync base, so a record deleted on another machine stayed on disk and the next
  `commit` re-added it — on the path both refusal messages advise. Taken, within S25's rule: `--force` also deletes a
  copy deleted upstream whose bytes are the base's (it holds nothing unpublished), and keeps an edited one, listing it
  with the warning that the next `commit` publishes it again unless it is removed; the refusal messages' advice says
  so. The same round, the last the review cap allows for `r4`: `review/22` and `review/23` (a case for `commit` with
  no sync base, and for the deletion pass's symlink refusal, forced and not), `review/24` (the deletion pass compares
  paths case-insensitively, so a case-only rename on `records` deletes nothing, and never deletes a path `main` keeps),
  `review/25` (`restore` refuses a records commit holding a path outside the record set and the branch's own files,
  before any write, so the `records` job fails on it), and the re-review's note that `restore` names each record it
  re-creates.
- **S27** (02:57Z) File 2's whole-branch review: its first pass runs tonight on Fable 5.1 over the integrated
  `r0`–`r5`, once the last fixes land, so a cross-unit defect surfaces before the records branch is pushed; the
  plan's pass before the merge becomes a delta pass over `r6`–`r8` and the spec delta.
- **S28** (03:01Z) File 2's ledger `review/26` (decision needed, `r5b`'s review): narrowing `docs-site.yml`'s
  pull-request trigger also dropped what that build did beyond building — the `llms.txt` copy into the output and the
  artifact upload with `if-no-files-found: error` — so a website pull request would lose both checks before the
  merge. Of the three options (move them into `ci.yml`'s site builds; keep `website/**` on the trigger; accept the loss),
  taken: move the two steps into both of `ci.yml`'s site builds (the `lanes` job and the `check` job's LTS leg), same
  pin, so the site still builds once and nothing is checked later than before; `docs-site.yml`'s comment says so.
- **S29** (03:13Z) File 2's ledger `review/30` (decision needed) and `review/31`, raised by `r4`'s last fixer: after a
  case-only rename on `records`, the old-spelling copy `restore` keeps would be published beside the new spelling;
  and on a case-sensitive disk `commit` could publish a case variant of the placeholder `main` keeps, which every
  later `restore` then refuses. Taken: `commit` runs `restore`'s tree check on the tree it built, before any push —
  every path a record path, no two paths equal under case folding, none folding to a path `main` keeps — so it never
  publishes a tree `restore` would refuse; a refusal names the paths and says to delete the old spelling. One more
  fix before `r4`'s last review round, which then covers it.
- **S30** (03:14Z) `r7` is rehearsed tonight in a throwaway worktree (`p18-r7`, branch `rehearsal-r7-never-push`
  from `f86401ee`): the record paths untracked and deleted, the four map entries removed (S23), committed there and
  never pushed, then the default gates alone under the machine lock — because `r5`'s implementer flagged as unverified
  that the census guard holds once the records leave `main`, and that is `r7`'s premise. `records-branch` itself is
  not touched; the branch and the worktree are deleted after the report, and the morning's `r7` reuses its commands.
- **S31** (03:23Z) The morning's order, so no record lands on `main` that `r7` would have to remove again and no
  branch needs a rebase: the tag push; #99 and then #100 by fast-forward; `r6` (`init` at `records-branch`'s head,
  the ruleset, the first `records.yml` run); `r7` (rehearsed, S30); the branch's first push and its CI; the review
  bot; the QA rows; `r8`; the spec delta and the whole-branch delta pass; the merge; then the close — its leftovers
  question first, and tonight's three run folders and the inbox's edits (S1's paragraph included, which this replaces
  as "the flake PR's records commit") published to `records` with `node scripts/records.mjs commit`, once each run's
  `Status:` line is closed. `records-branch` already stacks on #100's head, so each merge is a fast-forward.
- **S32** (03:27Z) File 2's `r4` stops at the review cap (three rounds). Its last round closed every row it was given
  and raised `review/33` (Warning: the case-pair check compares whole paths, not folder names, so folders differing
  only in case pass every check, and on this kind of disk every later `commit` from that checkout refuses with advice
  it cannot follow). With `review/32` (the case-pair advice names a step the script cannot do for a pair already on
  `records`) and `review/34` (the fold is `toLowerCase`, not the disks' Unicode fold), these are one design question
  for you: how far the records script defends against case-insensitive disks — each round found the next neighbour.
  None blocks `r6`: tonight's records hold no case pair of files or folders and no non-ASCII path (read-only check at
  `bef46934`: 489 files, 113 folders). Recommended, before `r6`: one fix and one fresh review — fold every folder
  prefix as well as every path, refuse a record path outside printable ASCII (so the Unicode fold never matters), and
  let the case-pair refusal name the plain-git repair on a checkout of `records`.
- **S33** (03:35Z) File 2's ledger `review/35` (decision needed, the whole-branch review's first pass): the records
  branch's own workflow checks out `main` for its tooling, and `scripts/records.mjs` and `test:records` reach `main`
  only when file 2 merges, so the import commit's first `records.yml` run (`r6`'s third step) is red by construction.
  Taken, the reviewer's smallest fix: the prepared `r6` steps and the plan's `r6` cell expect that run red and read its
  success from a re-run after the merge; nothing waits on it, since the pull request's merge-blocking `records` job
  scans `origin/records` itself at the first push. The persisted plan's `r6` verify gains the same amendment at Prove.
  The pass's two residuals go to `r7`'s verify (`node dist/cli.js check` in the records-free tree) and to the first
  push (the real-gates case of `test/ci/recordsScript.test.ts` meets a Windows leg for the first time).
- **S34** (07:47Z, within the morning's answer 2) S32's fix (`ac055243`, integrated as `c8cb301f`) passed its fresh
  review (approve; `review/32`–`/34` closed fixed), so `r6` starts. The lens's two Minors and the reviewer's note go
  into one follow-up round beside `r6`: `review/36` (on Windows a `:` aliases a file through its stream syntax, so
  "printable ASCII" is not enough) and `review/37` (the repair advice's `git rm` reads the old spelling as a glob).
  Taken: a record path's every segment matches `[A-Za-z0-9._-]+`, does not end in a dot, and is not a Windows device
  name — today's 489 records already use only those characters and end no segment in a dot or space — checked by the
  tree check and by `init`, which also refuses case pairs (the reviewer's note); the advice uses a literal pathspec and
  lists what it removes. `init` runs before this round lands, after the read-only check on its exact base.
- **S12** (22:42Z) The npm package invariant compares the packed file list and every byte outside `dist/types/`:
  declarations are emitted for all of `src/**`, so `dist/types/cli/docs/measurements.d.ts` moves with `r2`'s new
  exports, unreachable through `package.json`'s `exports`; the record names it.
