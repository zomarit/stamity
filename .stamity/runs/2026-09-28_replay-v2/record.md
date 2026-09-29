# REPLAY-v2's own package — the covered-pass rule, the fix round, the runs and the comparison (plan 011 file 2)

Status: in progress — opened 2026-09-28T20:29Z on the kickoff "REPLAY-v2: measure the review quality of the context economy that 1.10.0 shipped"; running unattended overnight on the maintainer's instruction.
Plan: docs/plans/011-replay-v2-02.md
Invocation: /st-work docs/plans/011-replay-v2-02.md --effort deep — REPLAY-v2's own package, run unattended overnight (the kickoff's "Tonight" section): no question tool; every decision takes its declared default and is recorded below as "Sign-off, unattended"; the conservative option wherever a decision shapes what the comparison can claim; the run stops before the QA sign-off and the merge to `main`.

The package branch is `replay-v2`, cut from `main` `6f04a35c`. The plan is `docs/plans/011-replay-v2-02.md` (8 units),
written by `/st-plan` in this session and following `docs/plans/011-replay-v2.md`, whose instrument shipped in 1.10.0
at `1bd6e571`. The maintainer said: "copy the message for the next session into my clipboard to let it run overnight
autonomously". Nobody answers until the morning, so each decision below is a declared default for the maintainer to
confirm or reverse.

## Before the run opened (2026-09-28T19:46Z–20:29Z)

- **The frozen state held.** `main` = `origin/main` = `6f04a35c`; `v1.10.0` at `0ea1a931`; `plugin-dist` =
  `plugins/v1.10.0` = `ccd6ff18`; npm `latest` 1.10.0; eleven release assets; the prerelease
  `evidence-archive-2026-09-28` holds runs 34 and 35; no open pull request and no open Dependabot alert; CI green on
  `6f04a35c`. The replay home held no lock, and the pinned instrument checkout sat at `1bd6e571`.
- **The two held-back learnings** (the kickoff's section 0), by one implementer at Opus 5.5:
  - `8c0d4e01` captures "an account switch mid-run ends an eval run" and "a full eval export needs its hygiene
    exception" through `learn capture`, bodies verbatim, with `reviewBy` and `validatedAgainst` added.
  - `9b4ab247` refreshes `docs/troubleshooting.md`'s sample from a real `check` run on `8c0d4e01` (only the learnings
    row moved, 14 to 16) and puts the page on the commit form, `Re-attested 2026-09-28`. `REATTESTATION_DATE` stays
    `2026-09-28`, with a dated "NOT MOVED" note. The targeted tests, lint, typecheck and the leak gate exit 0.
- **`/st-plan`** (intent chosen: test, because the request is a verification strategy for existing behaviour — the
  context economy's review quality — over a named coverage gap). Three researchers at Opus 5.5 (the covered-pass
  mapping, the counting rule, the fix items and run logistics) and one spec-author at Opus 5.5 (the REQ-CTX-015
  delta). The artifact is `docs/plans/011-replay-v2-02.md`, 8 units (`c7441d92`, which also appends its four
  follow-ups to the inbox). Structural coverage: pass, 8 units over REQ-CTX-015. The semantic review added three test
  criteria (the capture defect, K14's failing case, the build-description forms). Plan-lint: L1 pass · L2 pass · L3
  pass · L4 pass. Sub-agents spawned: 4, mixed. Open questions: none. Learnings: none met.

## Frame (2026-09-28T20:29Z)

- **Outcome.** `evals/replay/COMPARISON-v2.md` reads a `Merge gate:` verdict for REQ-CTX-015's floor rows, the 1.9.1
  `/st-work` against 1.10.0's context economy, measured on a fixture whose seeds reach review; the instrument is fixed
  once, tests first, and frozen at the first pilot.
- **In scope.** The plan's 8 units and the five inbox rows it folds in (`review/167`, `review/168`, `review/169`,
  `review/170`, `build/85`).
- **Out of scope.** Any change to the context economy; REPLAY-v1 (frozen); the thresholds; the fixture's bytes; the
  merge to `main`, the QA sign-off and any release (the maintainer's, in the morning).
- **Intensity: deep.** `--effort` given. The risk surface is the measurement that gates a release claim, and the
  territory is new: the changed shape has never run a v2 canary.
- **Model plan** (the model mix of 2026-09-23), attested per agent from its transcript:
  - Opus 5.5 (`claude-opus-5-5`, dispatched as `opus`): implementers, fixers on rounds 1–3, test-runners,
    researchers, the spec-author and the canary runner's notes.
  - Fable 5.1 (`claude-fable-5-1`, dispatched as `fable`): reviewers, any lens the trigger roster pulls in, the
    round-4 and whole-branch fixers, and the whole-branch deep review.
  - The replay driver pins `claude-opus-5-5` in the client's argv and the client 2.1.280 by sha256.
- **Spawn plan.** 4 implementers (3 public, 1 private), about 6–10 reviewer rounds, 2–6 fixers, 2–3 test-runners,
  one whole-branch deep review.
- **Measurement runs.** 2 canaries, 2 pilots and 6–10 scored runs, one at a time, about 45–70 minutes each: about 8–15
  hours.
- **Cost order of magnitude.** 10^8 tokens, mostly the replay runs.
- **Build isolation.** The operator-prepared worktree farm: one worktree per lane under
  `~/Projects/zomarit/.stamity-worktrees/stamity/rv2-<unit>` (public) and
  the private layer's farm (its `rv2-<unit>` lanes), each reset to its package branch,
  with a `node_modules` symlink; lanes stage by explicit path and never use `git stash`.
- **Plan intake.** One persisted plan. Freshness guard: every `reads:` path is unchanged since the stamp `9b4ab247`
  except `.stamity/inbox.md`, which moved only by this plan's own follow-up rows (`c7441d92`); no unit's research read
  those rows, so the guard reads fresh for every unit.
- **Deferral inbox.** Overlapping rows: the five the plan folds in; rows 228–235, 249, 253 and 254, which describe
  REPLAY-v1's frozen measurement (it stays as it is); `review/163`, kept as symmetric fixture noise by its own
  rationale; and the four follow-ups `/st-plan` appended on purpose.
- **Contract census.** From the plan: S1 `UNCOVERED_REASON` (`v2-uncovered` writes; `measure`, `score`, `compare` and
  the driver read); S2 `coverageOf` (`v2-coverage` writes; `measure` and the driver read); S3 `measure.mjs` and its
  test, one writer at a time (`v2-uncovered`, then `v2-coverage`); S4 `REPLAY-v2.md`, `v2-protocol-text` alone; S5
  the instrument commit, frozen at the first pilot. Every row: `clean` (sequenced writers, no concurrent change).

## Sign-offs, unattended

Each is the declared default of a decision the maintainer would have been asked, taken because nobody answers until
the morning. The ledger ids are this run's.

- 2026-09-28T20:22Z **Sign-off, unattended, the declared default: `plan/1`** (`review/167`, the kickoff's question on
  how a feature-named review maps to passes). R6, all built, then all seeded: a pass is built once a build-role
  dispatch's description names it; the first verdict-role dispatch after every pass is built injects all six in one
  hook call; coverage follows from the descriptions; a finding credits a seed only if its agent was dispatched at or
  after that point. Recommended by the mapping research over four alternatives (today's `passesOf`; the built passes
  at every verdict dispatch; tree-derived; every pass at the first review), each rejected in the plan's R6 row.
- 2026-09-28T20:22Z **Sign-off, unattended, the conservative option: `plan/2`** (`review/168`, the kickoff's
  question on how an uncovered pass's seeds count). R7: an uncovered seed is never credited and its run is invalid;
  a baseline run is replaced within the cap, a changed scored run invalid only this way is not (its rows read
  NOT-EVALUATED and the gate FAILs); presence-unknown goes for v2; K16 joins the canary. The kickoff's two examples
  were weighed and rejected: out of the denominator with the exclusion reported flatters the shape that reviews less,
  and "the run invalid" replaced in both shapes lets a changed shape's skipped reviews drop out of every row.
- 2026-09-28T20:22Z **Sign-off, unattended, the declared default: `plan/3`** (coupled to R6). R8: a verdict dispatch
  is branch-level only when it names the whole branch and follows an approving delivery of an earlier round;
  everything after it is branch-level too. It keeps the changed shape's first round, if named "Whole-branch review
  round 1", in the pass verdicts and in the loop figure; the residual (a whole-branch review before any approval
  counts as a loop round) is named in the protocol's threats.
- 2026-09-28T20:22Z **Sign-off, unattended, the conservative option: `plan/4`** (`review/170`). R9: no fixture change
  for `sec-path-traversal`; the protocol's threats name why its anchor is lost, and the seed counts as not injected
  when it is. Re-anchoring and a contract change were rejected (the plan's R9 row).
- 2026-09-28T20:22Z **Sign-off, unattended, the declared default: the plan's form.** Plan 011 stays as written; this
  package's decisions and runs live in a new file 2 (`docs/plans/011-replay-v2-02.md`).
- 2026-09-28T20:29Z **Sign-off, unattended, the declared defaults at Frame:** the plan gate's execute-now, and no
  inbox row folded in beyond the plan's five.

## Log

- 2026-09-28T20:29Z Frame done; the ledger holds `plan/1`–`plan/6` (the fold-ins and the decisions above) and
  `build/1` (section 0's Minor: no test compares the troubleshooting sample's learnings row with the real count).
- 2026-09-28T20:30Z Build dispatched: `v2-uncovered` (lane `rv2-uncovered`) and `v2-protocol-text` (lane
  `rv2-protocol`), both implementers at Opus 5.5 off `replay-v2` `c7441d92`; `v2-coverage` follows `v2-uncovered` on
  the same files. The branch is pushed and draft PR #58 is open (CI runs only on pull requests).
- 2026-09-28T20:32Z `v2-reset`'s instrument-independent steps done early: R11's record move is private `3d0e001e`
  (one directory rename; 103 files, the ignored `captures/` travelled; the private hygiene gate PASS, pushed), and the
  stale shapes moved to `~/.stamity-replay/superseded-1bd6e571/` (`bin/`, `client.json` and `deps/` stay).
- 2026-09-28T20:33Z Plan amendment 1 (`ad926041`), before the driver's dispatch: the driver cell keeps the driver's
  existing rule, one forced compaction naming both placements when one round covers both (the first text asked for
  two in sequence, which contradicts the README's tested rule), and names the 90 s injection budget a six-pass hook
  call must fit, with a new Warning risk row.
- 2026-09-28T20:38Z `v2-protocol-text` built (`ae1dcf07` on `rv2/protocol`; score and seeds-v2 tests, lint,
  typecheck, the leak gate exit 0; REPLAY-v1's sha256 unchanged). Its findings are `build/2`–`build/5`. `build/2`
  (W-1, the plan's R9 promised a comparison note no unit builds) is closed fixed by plan amendment 2 (`e6416054`):
  the cross-shape state of `sec-path-traversal` is compared in this record's close; RESULTS already names each seed's
  state. `build/3` (W-2, §7 does not state the both-placements rule) goes back to the same implementer with amendment
  1's rule; `build/4` and `build/5` (Minors on §9's span wording and §8's attribution sentence) go to the reviewer.
- 2026-09-28T20:43Z `v2-uncovered` built (`25ce2bf3` on `rv2/uncovered`; cherry-picked as `b9970a08` onto
  `replay-v2` for the next lane): 11 new tests seen red first, then `test/replay` 478 passed, lint and typecheck exit
  0, coverage of `scripts/replay/**` covers every added statement, the leak gate PASS; the third canary re-measured
  reads invalid with five uncovered passes (1 of 11 found, from a valid 4 of 11). No Critical or Warning; Minors
  `build/6`–`build/9`. `v2-coverage` dispatched in lane `rv2-coverage` on `b9970a08`.
- 2026-09-28T20:43Z Review round 1 dispatched at Fable 5.1 for `v2-uncovered` and `v2-protocol-text`, read-only
  beside the `v2-coverage` build; fixes wait until `v2-coverage` lands on the same files. **Lenses (deep tier), a
  Frame decision, unattended:** no changed path matches a lens's trigger paths; the topic keywords "injection"
  (security) and "budget" (performance) match the driver unit, whose hook acts on client-produced events, runs git
  and has a 90 s injection budget, so both lenses review `v2-driver-coverage`; the public units are offline scoring
  code read by the reviewer. The design-quality lens has nothing to review (no rendered surface).
- 2026-09-28T20:48Z `v2-uncovered` review round 1 (reviewer at Fable 5.1): request-changes, medium confidence. The
  deciding constraint holds (no uncovered seed is credited; the changed-only guard cannot flatter the changed shape;
  v1 untouched). Rows `review/1`–`review/5` (the block was re-filed through `--stdin` because W-1's summary ran past
  the CLI's 300-character cap; the report is unchanged). **Sign-off, unattended, the conservative option:
  `review/1`** (W-1, decision needed: a pass entry that omits a seed is replaced in the built code, while R7 calls
  that seed uncovered): follow R7 as written, so the omit reason also carries `UNCOVERED_REASON` and a changed scored
  run invalid only this way is not replaced, with cases in `compare.test.ts` and `score.test.ts`. It can only fail the
  gate, never overstate it; the alternative (an omitted seed as a replaceable malformed record) would need R7 and the
  spec delta amended. `review/2` (W-2, RESULTS' "Not done:" line tells the operator to replace a run R7 forbids
  replacing) and the three Minors go to the fixer, which waits until `v2-coverage` lands on the same files.
- 2026-09-28T20:49Z `v2-protocol-text` review round 1 (reviewer at Fable 5.1): request-changes, medium confidence. R6, R8,
  R9 and R10 are stated as decided, the sections agree, no old covered-pass or presence-unknown sentence remains, the
  thresholds block is identical and §8 keeps the three forbidden terms. Rows `review/6`–`review/11`. `review/6` (W-1,
  decision needed) is `review/1` seen from the text: **Sign-off, unattended, the same default as `review/1`**: the
  text stands (an omitted seed is uncovered) and the code gains the prefix. `review/7` (W-2: the text reads a seeded
  file absent from every review-snapshot copy as reverted before review, while the code makes the run invalid as a
  capture defect): **Sign-off, unattended, the conservative option**: the text follows the code (a capture defect
  voids the run, while "reverted before review" would count a security seed as found). Four Minors; `review/10` and
  `review/11` are re-checked once `v2-coverage` lands.
- 2026-09-28T21:01Z `v2-coverage` built as two commits that each pass on their own (`60f3a097`: `coverageOf` and its
  table tests; `5e775f19`: the v2 wiring, the credit guard and R8; 434 lines added, over the ~400 guidance, so split):
  18 new cases seen red first, `test/replay` 499 passed, lint and typecheck exit 0, `measure.mjs` coverage 93.19%
  statements, the leak gate PASS, every v1 case unedited. Rows `build/10` (W-1: the cell's matcher key is not
  identical under v1 for a prefixed report slug, so it is built v2-only) to `build/14` (Minors; re-filed through
  `--stdin`, W-1's summary 3 characters over the cap). The protocol commits were cherry-picked onto the lane
  (`6b582e2f`, `818c9d30`), so `rv2/coverage` now holds every public unit. Dispatched: `v2-coverage` review round 1
  (Fable 5.1), and `v2-driver-coverage` (Opus 5.5) in the private lane `rv2-driver` off private `3d0e001e`, testing
  against the detached public checkout `rv2-driver-repo` at `818c9d30`.
- 2026-09-28T21:02Z Fixer round 1 dispatched (Opus 5.5) in lane `rv2-coverage` for the settled public rows: `review/1`,
  `review/6` (the omit reason gains `UNCOVERED_REASON`, per the sign-off), `review/2`, `review/7` (the text follows
  the code, per the sign-off), `build/10`, and the Minors `review/3`–`review/5`, `review/8`–`review/11`, `build/4`–
  `build/9` and `build/11`–`build/14` (fixed where cheap and safe, otherwise closed with a reason). The `v2-coverage`
  reviewer and the driver implementer read the detached checkout `rv2-driver-repo`, so the fixer's writes touch
  neither; `v2-coverage`'s own review findings go to the same fixer afterwards.
- 2026-09-28T21:08Z `v2-coverage` review round 1 (Fable 5.1): request-changes, medium confidence. `coverageOf` is causal
  and R6 is built as worded; v1's path is unchanged; the implementer's v2-only matcher key is sound. Rows `review/12`
  (W: a v1 test lost its prompt-range assertion), `review/13` (W: a pre-injection approval can make a later first
  round branch-level), `review/14` (W: the compaction-loss reading skips the credit guard), `review/15` (W: an agent
  read from its sub-agent file takes its delivery time as its dispatch), and three Minors (`review/16`–`review/18`),
  re-filed through `--stdin` (three summaries over the cap). Each Warning could move a floor row only in the changed
  shape's favour or weakens a v1 pin, so all four go to the running fixer; none needs a product choice.
- 2026-09-28T21:16Z Fixer round 1 done (Opus 5.5; `02873122`, `715f7e81`, `1b75f9aa`, `bb79ee58` on `rv2/coverage`):
  every Warning fixed with a case seen failing first (`test/replay` 510 passed; lint, typecheck and the leak gate exit
  0; REPLAY-v1's sha256 and the thresholds block unchanged). Its claims per row wait for the re-review; it deferred
  `review/3`, `build/7`, `build/14` and `review/18` with reasons, rejected `build/8`, `build/11`–`build/13`, and
  raised one new Minor (`review/19`: a file-built agent taken as the injection point makes the guard stricter, never
  kinder to the changed shape). Contract S1 moved: the "omits seed" reason now begins with `UNCOVERED_REASON`; the
  driver's K16 evidence reads it. `plan/6` closed fixed by hand (private `3d0e001e`). Re-review round 2 dispatched at
  Fable 5.1 with 29 handed ids.
- 2026-09-28T21:16Z CI round 1 on PR #58 (`c7441d92`, the section-0 commits and the plan): `all-ci-checks` pass, the
  Windows `check` leg included (12m47s); `all-pr-checks` failed on the PR title alone (not a conventional-commit
  title). The title is now `test(replay): REPLAY-v2 — …`, which re-runs the PR checks.
- 2026-09-28T21:22Z Re-review round 2 (Fable 5.1): request-changes, medium confidence, for one new Warning only. All 29
  handed ids closed through `ledger close --report`: 25 `fixed`, 4 `rejection-upheld` (`build/8`, `build/11`–
  `build/13`), `plan/1`–`plan/4` among the fixed (R6–R9 built and stated as decided), no regression, v1 untouched.
  New: `review/20` (W: R8's approvals still read a file-built reviewer's delivery line as its dispatch, so on a
  degraded capture a pre-point approval could push a later whole-branch review out of the loop figure). Fixer round 2
  (the same fixer) dispatched for `review/20`, with `review/19` to rule on.
- 2026-09-28T21:23Z Spec-delta merge dispatched (spec-author at Opus 5.5) in lane `rv2-spec` off `bb79ee58`: REQ-CTX-015
  in `docs/specs/orchestrator-context.md` takes the plan's delta, stated as built (the omit reason's prefix, the
  review-snapshot capture defect, a file-built agent's missing dispatch line), with its line citations re-pointed.
- 2026-09-28T21:24Z Fixer round 2 done (`282d0adc`): R8's approvals skip file-built agents, pinned by a case seen failing
  first (`{approve, 1}` before, `{null, 0}` after); §8's sentence says the same; `test/replay` 511 passed, lint,
  typecheck and the leak gate exit 0. Re-review round 3 (Fable 5.1) dispatched for `review/20` and `review/19`.
- 2026-09-28T21:26Z `v2-driver-coverage` built (private `abbdeda2` on `rv2/driver`): the hook injects every pass once at
  the injection point, then snapshots each; the review snapshot follows the injection round; K3 and the placements
  read the new coverage; K11 names the injection point, K14 skips `reports/`, K16 is new, and the v2 gate reads K5–K16.
  All 11 new cases seen red first; 121 of 121 driver tests pass, re-run by the orchestrator against the fixed public
  head `282d0adc` (exit 0); v1's `status` output byte-identical; the private hygiene gate PASS. Six passes over six
  worktrees took 3.7 s (injection 3.4 s, snapshots 0.3 s) against the 90 s budget. Rows `build/15` (W: 665 lines,
  over the ~400 guidance; 429 are tests) to `build/19` (Minors), re-filed through `--stdin` (the block's ids were not
  `W-<n>`/`M-<n>`). Review round 1 dispatched at Fable 5.1: the reviewer, and the security and performance lenses.
- 2026-09-28T21:28Z Re-review round 3 (Fable 5.1): `review/20` and `review/19` closed fixed; one new Warning,
  `review/21` (a file-built verdict agent after a branch-level one is made branch-level by position and leaves the
  loop figure, on a degraded capture). Fixer round 3, the same fixer's last, is asked to fix it and to sweep every v2
  site where an agent's position stands in for its dispatch time, applying one rule: a file-built agent is never
  credited, never approves, never branch-level by position, and stays in the loop figure. The loop's cap is 4 rounds;
  review round 4 is the last.
- 2026-09-28T21:30Z Spec-delta merge done (spec-author at Opus 5.5; committed by path as `f72687a7` on `rv2/spec`, off
  `bb79ee58`): REQ-CTX-015 takes R6–R10 as built, the two MODIFIED and eight ADDED criteria, the four file notes,
  and its citations re-pointed to `bb79ee58`; the status is unchanged; the records and docs-page tests (114) and the
  leak gate exit 0. Rows `prove/1` (W: the file-built agent's approval rule, built after `bb79ee58`, is not yet
  stated), `prove/2` and `prove/3` (Minors: a pre-R6 prompt criterion needs a v1 qualifier; the one-compaction
  rule). One follow-up pass re-pins the spec to the converged public head and takes all three.
- 2026-09-28T21:31Z Security lens on `v2-driver-coverage` (Fable 5.1): posted, one Warning, `review/22` (K11's evidence
  copies the injection point's agent-written description, newlines included, into a committed record; cite the call's
  id and time, or strip control characters). It found no path by which agent text chooses where or what the hook
  writes: the passes are the frozen pass order, the seeds come from the pinned checkout, and every git call is an
  argument vector. Fixer round 3 done (`622fd7f2`): `review/21` fixed, and the sweep of 14 v2 sites where an agent's
  position stands in for its dispatch time fixed two (branch level; a file-built fixer's round) and kept the rest
  with the reason each cannot favour a shape; two new cases seen failing first, `test/replay` 513 passed, lint,
  typecheck and the leak gate exit 0. Review round 4, the loop's cap, dispatched at Fable 5.1.
- 2026-09-28T21:34Z `v2-driver-coverage` review round 1 (Fable 5.1): request-changes, high confidence. The hook injects all
  six passes only at the injection point, before any snapshot, inside the budget, once per run; the event list mirrors
  `coverageOf`; the review snapshot, K14, K16 and the K5–K16 gate hold; v1 is untouched; none of the 18 adapted cases
  weakens a gate. `review/25` (W): the driver feeds `coverageOf` a description cut at 160 code points while the
  measurement reads it whole, so a late-named pass would let the measurement credit clean-tree findings (the
  implementer's own `build/16`, raised). Minors `review/26`–`review/28`; the size row `build/15` not upheld as a
  Warning. The performance lens posted two Minors (`review/23`, `review/24`) and found the budget unthreatened (a
  snapshot copies only `src`, `test`, `config` and `docs`). Driver fixer round 1 (Opus 5.5) dispatched for
  `review/25`, `review/22` and the Minors.
- 2026-09-28T21:38Z Review round 4, the loop's cap (Fable 5.1): **approve**, medium confidence; `review/21` closed fixed;
  no new Critical or Warning; the fixer's kept sites hold under the deciding constraint. The public review loop has
  converged in four rounds at `622fd7f2`. The medium-confidence approval takes its stronger re-review from the
  whole-branch deep review (Fable 5.1, the frontier class here). The spec lane is rebased onto `622fd7f2` (`e92d309f`)
  and the spec-author re-pins REQ-CTX-015 there and takes `prove/1`–`prove/3`.
- 2026-09-28T21:42Z Spec follow-up committed (`886d2132` on `rv2/spec`, on `622fd7f2`): citations re-pinned to `622fd7f2`,
  the file-built agent rules, the v1 qualifier and the one-compaction rule; `prove/1`–`prove/3` closed fixed. `rv2/spec`
  is the public candidate. Driver fixer round 1 done (private `c8093df2`): `review/25` and `build/16` (the driver
  hands `coverageOf` the pass ids of the full description), `review/22` (K11's evidence cleaned to one bounded line),
  `review/23` (a journal note past 30 s), `review/26`, `review/27`/`build/18` fixed; `review/24`, `build/15`,
  `build/19` rejected; `review/28`/`build/17` deferred (no floor effect); new Minor `review/29`. 126 of 126 driver
  tests pass against `886d2132` (orchestrator re-run, exit 0); v1 `status` byte-identical; hygiene PASS. Dispatched in
  parallel at Fable 5.1: the driver re-review (round 2) and the whole-branch deep review over both candidates.
- 2026-09-28T21:46Z Driver re-review round 2 (Fable 5.1): **approve**, high confidence. `review/25`, `build/16`,
  `review/22`, `review/23`, `review/26`, `review/27`, `build/18` fixed; `review/24`, `build/15`, `build/19`
  rejection-upheld; no regression, no new finding. The driver's built set, and so its injection point, equals the
  measurement's for every description (pinned by the `review/25` case against the imported `coverageOf`). `review/29`
  closed rejected on the re-review's reasoning. The driver's review loop has converged in two rounds.
- 2026-09-28T21:57Z Whole-branch deep review (Fable 5.1, the frontier class): request-changes, medium confidence, no
  Critical. The four layers (plan, protocol, measurement, driver, spec) agree on every rule that runs; walked through a
  plausible baseline and changed run, the injection fires once at round 1's first verdict dispatch, the u2-p1 round
  completes, K11–K16 read as intended and `measure` reads six entries, twelve states, nothing uncovered. Rows
  `review/30` (W, decision needed: under v2 branch level read the prompt of every verdict dispatch, so a re-review
  whose brief mentions the coming whole-branch review would leave the loop figure and the pass rows) and Minors
  `review/31`–`review/34`. **Sign-off, unattended, the recommended default: `review/30`**: under v2 the whole-branch
  name is read from the description only (0 of 33 captured verdict descriptions name a pass, and both shapes name
  their deep review in its description); after the canary this would cost an hour per shape, after the first pilot
  it could not be fixed. `review/32` (the plan's R7 row, which the maintainer confirms from) closed fixed by plan
  amendment 3 (`d4bb811b`), which also states R8 as built and narrowed. The whole-branch fixer (Fable 5.1) takes
  `review/30`, `review/31`, `review/33`, `review/34`; `review/34` keeps "built" as dispatched (R6) and names the
  residual in §15.
- 2026-09-28T21:57Z The private driver is on private `main`: fast-forwarded to `c8093df2` (`abbdeda2`, `c8093df2` on
  `3d0e001e`), the private hygiene gate PASS against `7d5d5028`, pushed. The canaries run from that checkout.
- 2026-09-28T22:04Z Whole-branch fixer done (Fable 5.1; `5197d8f0`, `c6b686df` on `rv2/spec`): `review/30` (under v2 the
  whole-branch name read from the description only, a case seen failing first; REPLAY-v2 §8 and REQ-CTX-015 say the
  same), `review/31` (§8 states that a pass reviewed only before the injection point has no verdict and fails
  `verdict-class`), `review/33` (the spec's branch-level wording as built) and `review/34` (§15 names the residual of
  a review dispatched beside the last build) claimed fixed; targeted tests (628), lint, typecheck and the leak gate
  exit 0; REPLAY-v1 and the thresholds block unchanged; the driver reads no branch level. Dispatched in parallel: the
  re-review of the whole-branch fix (Fable 5.1) and the gate of record on `c6b686df` (test-runner, Opus 5.5).
- 2026-09-28T22:08Z Re-review of the whole-branch fix (Fable 5.1): **approve**, medium confidence; `review/30`,
  `review/31`, `review/33`, `review/34` closed fixed; no regression; every earlier R8 pin holds and v1's branch lies
  outside the hunk. It records one question, not a finding: a changed-shape "Whole-branch review round 2" dispatched
  after a round-1 reviewer approval (with a lens's findings still open) would file branch-level under R8's
  description half. No capture shows that naming yet, so the canary runner lists every verdict dispatch with the
  measurement's branch or pass reading, to catch it before any pilot. The review loop over the whole package has
  converged.
- 2026-09-28T22:12Z **Gate of record: PASS** on `c6b686df` (test-runner at Opus 5.5; logs kept locally): build; `check`
  drift clean; lint; typecheck; the full suite with coverage, 10,504 passed and 26 skipped over 257 files (statements
  96.62, branches 90.06, functions 98.91, lines 97.55, the per-file floors held); `STAMITY_REPLAY_SUITE=1` replay suite
  527 passed; knip clean; the leak gate PASS; repo hygiene PASS against `6f04a35c`; the private driver 126 of 126
  against the candidate; REPLAY-v1's sha256 `fdee42b1…` unchanged. `replay-v2` fast-forwarded to `c6b686df` and
  pushed (CI round 2). **The instrument commit is `c6b686df`**: the pinned checkout `p16s2-instrument` switched to it
  (detached, `evals/replay/` and `scripts/replay/` clean). `prepare` runs for both shapes (baseline CLI `fed39ac`,
  changed CLI `c6b686df`).
- 2026-09-28T22:13Z Both shapes prepared at the instrument commit (22:12:08Z–22:12:19Z): the baseline tarball
  `c3b874bc…` (identical to the earlier attempts'), the changed tarball `19a1a9ed…` (CLI `c6b686df`), the deps lock
  `b0a17731…`; both shape records name `c6b686df`. **Canary `K-inject-baseline` started 2026-09-28T22:12:35Z**
  (interrupt mechanism, placement `u2-p1`, `--protocol v2`, client folder `~/.claude-alt`), holding the run lock. The
  ledger has no open row: 47 fixed, 8 rejected, 7 deferred (their inbox rows are written at the close).
- 2026-09-28T22:33Z `K-inject-baseline`: the injection point fired once at 22:33:25Z and put all six passes in within
  0.4 s, each in the `staged` form (the baseline stages its work). 10 of 12 seeds injected, K11's floor exactly:
  `sec-sql-sort` (u1-p1) and `sec-path-traversal` (u3-p1) read "not injected (anchor missing)" — an implementer had
  rewritten both security anchors before review, the anchor-rewrite threat §15 names; both leave the recall
  denominator and hold their `security-seeds` rows.
- 2026-09-28T22:37Z `K-inject-baseline`: the injection round completed and every pass's review snapshot was taken at
  22:37:06Z; an early read-only check of the presence rules finds all 10 injected seeds present there (K15's floor,
  10 of 12, if nothing else moves).
- 2026-09-28T22:38Z `K-inject-baseline`: the `u2-p1` placement fired in the same poll as the review snapshot (interrupt
  at 22:37:06Z, nothing in flight, control success, a manual boundary 149,077 → 16,849 tokens), and the resume
  message went out at 22:37:59Z — the forced compaction K1–K4 and K6 read.
- 2026-09-28T22:43Z CI round 2 on PR #58 (`c6b686df`, the instrument commit): every check passes, `all-ci-checks` and
  `all-pr-checks` included, with the Windows `check` leg green.
- 2026-09-28T22:54Z **Canary `K-inject-baseline` passes: K1–K16 all pass, decision `interrupt`** (run 22:12:35Z–22:52:46Z,
  closed `complete`, exit 0; `status --canary K-inject-baseline --protocol v2` exits 0). The first v2 canary to pass.
  **Canary `K-inject-changed` started** right after (22:53Z, same flags, `--shape changed`). A runner at Opus 5.5
  writes the baseline record's notes (forms, seed states, `review/89`, `review/138`, and the measurement's reading
  of every verdict dispatch) beside the live run, with its load kept light.
- 2026-09-28T23:18Z The canary runner's notes on `K-inject-baseline` (Opus 5.5; appended to the private record). The
  measurement reads the canary **valid**: every model inside its pin, no forbidden path, the injection record whole,
  no uncovered seed, no capture defect, 12 of 12 oracles pass at the end; the driver and the measurement agree on the
  injection point. Pooled recall **10 of 10**, all in round 1, each credit on the finding about its seeded line. The
  injection turned 6 of the units' tests red and one skipped; the baseline orchestrator traced the change by file
  times and dangling index blobs and ledgered it as out-of-band edits, after both lenses had read the ledger, so the
  round-1 finds are the reviewers' own. Observations for the pilots, none moving a score here: (1) the clean
  `vendor/contrib/<pass>.patch` files stay in the tree and the round-1 reviewer read them, so every seed shows as a
  deviation from its patch — recall 10 of 10 is above §10's baseline calibration band [0.5, 0.95]; (2) a loop
  re-review dispatched after the whole-branch review reads branch-level (R8), moving per-pass rounds 3 → 2 and 6,560
  characters out of the loop figure; (3) `verdictOf` reads no `REQUEST_CHANGES` spelling; (4) reviewer ledger rows
  with sources like `reviewer:r1` do not read as verdict findings; (5) the u2-p1 sample (at-risk 37, lost 30) counts
  every locator of a free-text block, so its "lost" measures locator spelling, not a dropped finding. **Decision,
  unattended, the conservative option:** proceed as the plan and the frozen protocol say — the baseline pilot's own
  recall decides the calibration (§10), and out of band the runs stop with the cause recorded; no fixture redesign
  overnight. Before any pilot, the changed canary's sample is checked for the same locator reading, because the
  changed shape's bar is 0 lost.
- 2026-09-28T23:18Z `K-inject-changed`: the injection point fired once at 23:16:00Z (all six passes within 0.4 s, each in
  the `staged` form); 10 of 12 injected, the same two security anchors missing as in the baseline (`sec-sql-sort`,
  `sec-path-traversal`) — the anchor rewrites are symmetric across the shapes.
- 2026-09-28T23:21Z `K-inject-changed`: the injection round completed and every pass's review snapshot was taken at
  23:20:16Z (all 10 injected seeds present there); the `u2-p1` placement fired in the same poll (nothing in flight,
  control success, a manual boundary 138,662 → 14,729 tokens) and the run resumed at 23:21:00Z.
- 2026-09-28T23:42Z **Canary `K-inject-changed` passes: K1–K16 all pass, decision `interrupt`** (run 22:53:58Z–23:40:17Z,
  closed `complete`; `status --canary K-inject-changed --protocol v2` exits 0). The two records agree, so every run
  takes `--mechanism interrupt`. The orchestrator's own measurement of the changed canary (the instrument at
  `c6b686df`, read-only): valid; pooled recall 7 of 10 (the three test-weakening seeds were fixed during the run but
  no verdict role named them); the u2-p1 sample at-risk 5, lost 0 (its structured findings do not take the free-text
  locator reading); loop characters 19,516.5 per pass and sub-agent tokens 1,663,697 per pass (the baseline canary:
  22,361 and 1,284,047). Canaries are not scored; these figures are recorded only to show the instrument reads both
  shapes. **The instrument froze at `c6b686df`** when the baseline pilot `2026-09-28-replay-1` started at
  23:42:10Z (`--placements u2-p1,u3-p1 --mechanism interrupt`); from here nothing under `scripts/replay/` or
  `evals/replay/` changes except exported runs and the comparison.
- 2026-09-29T00:00Z Baseline pilot `2026-09-28-replay-1`: the injection point fired at 23:58:45Z (all six passes; the two
  security anchors again rewritten, so 10 of 12 injected); both placements, `u2-p1` and `u3-p1`, were recorded
  missed at 00:00:11Z — the injection round completed without the trigger holding (§7: at least two members
  returned by themselves, no fixer covering the pass dispatched first). A pilot gates nothing on its placements, and
  the baseline's samples are not thresholded; the run goes on.
- 2026-09-29T00:06Z The canary runner's notes on `K-inject-changed` (Opus 5.5; appended to the private record): the
  measurement reproduces byte for byte and reads the canary valid; every credit sits on the right finding; the u2-p1
  sample's 5 at risk were truly at risk and none was lost. Both orchestrators, from their own reading (test failures
  seconds after the injection, file times, index blobs), ledgered the seeds as out-of-band edits after the round's
  reviewers had read the ledger, and reverted nothing before review; both reviewers read the tree against the clean
  `vendor/contrib` patches. **One reader rule is asymmetric across the shapes:** the changed shape's verdict returns
  are digests backed by a findings block, read one locator per entry, while the baseline's free text is read one
  finding per locator; two of the changed canary's three test-weakening misses were named inside the paired product
  finding, which the free-text reading would have credited (the canaries read 10 of 10 against 7 of 10; 9 of 10 read
  the free-text way). **Sign-off, unattended, the conservative option:** the instrument is frozen (the baseline pilot
  started at 23:42:10Z) and the asymmetry can only understate the changed shape's recall, never overstate it, so the
  runs go on under the frozen reader; the bias is named in this record, in the comparison's covering note at the
  close and in the inbox for the next protocol, and any `pooled-recall` FAIL is read with it.
- 2026-09-29T00:23Z **Baseline pilot `2026-09-28-replay-1` done** (23:42:10Z–00:20:16Z, closed `complete`; exported and
  committed as `77f08f93`; `score.mjs check --protocol v2 --runs evals/replay/v2/runs` exits 0; the leak gate and
  repo hygiene PASS). The run is **valid** (every pin held, the injection record whole, no seed uncovered, no capture
  defect). The injection point put all six passes in (10 of 12 seeds), but the baseline orchestrator restored eight
  of the ten before the first review round completed — they read reverted before review and leave the denominator —
  and both placements were recorded missed. Pooled recall is **2 of 2 (1.0)**, outside §10's baseline calibration
  band [0.5, 0.95]. **The runs stop here**, by the plan's rule for tonight (`v2-pilots`: recall out of band means the
  seeds are cut again under a new instrument commit and restarted pilots — recorded, and the runs stop). No changed
  pilot, no scored run and no comparison: `evals/replay/COMPARISON-v2.md` is not written.

## Stop (unattended, 2026-09-29T00:30Z) — what is done, what waits for the maintainer

**Done tonight.**
- Section 0: the two held-back learnings and the troubleshooting page (`8c0d4e01`, `9b4ab247`).
- `/st-plan`: plan 011 file 2 (`c7441d92`, amendments `ad926041`, `e6416054`, `d4bb811b`).
- The fix round, built and reviewed to convergence at the deep tier, then the gate of record (PASS on `c6b686df`,
  11 gates) and CI round 2 (every check green, Windows included):
  - the public instrument: `v2-uncovered` (R7), `v2-coverage` (R6, R8), `v2-protocol-text` (R6–R10), their fixes;
  - REQ-CTX-015 merged as built;
  - the private driver (R6, K14's end reading, K16);
  - the failed third record moved aside (R11).
- The instrument commit `c6b686df`; both canaries pass K1–K16 at it (decision `interrupt`).
- The baseline pilot `2026-09-28-replay-1`, valid, exported (`77f08f93`).

**Why the runs stopped.** The baseline pilot's pooled recall is 2 of 2 (1.0), outside §10's calibration band
[0.5, 0.95], so REPLAY-v2's seeds must be cut again under a new instrument before any scored run. The pilots restart
after that. The protocol froze at the first pilot, so this cannot be fixed under REPLAY-v2. What the three runs
showed:
- **Every orchestrator saw the seeds as edits it had not made.** The injection turns units' tests red seconds after
  the implementers reported green, moves file times, and leaves index blobs. Both canaries' orchestrators, and the
  pilot's, ledgered the seeds as out-of-band edits. The canaries reverted nothing before review. The pilot's
  orchestrator restored eight of the ten before the first review round completed, so they left the denominator.
- **The clean patches are an oracle.** The clean `vendor/contrib` patches stay in the fixture, and round-1 reviewers
  read the tree against them. Every surviving seed then reads as a deviation: the baseline canary found 10 of 10 in
  round 1.
- **The reader favours the free-text shape.** It reads structured findings one locator per entry and free text one
  finding per locator. That understates the changed shape (the canaries: 10 of 10 against 7 of 10).

**Waiting for the maintainer, in order.**
1. Confirm or reverse each "Sign-off, unattended" above.
2. Decide the replay's next step. Options for the morning's question:
   - re-cut the seeds and the injection under a REPLAY-v3 protocol (a new instrument commit, the canaries, the pilots
     and the scored runs again, about 10–14 hours);
   - move the re-cut into Package 17's final replay (its session 3 already re-runs the replay against the 1.9.1
     baseline);
   - stop measuring recall this way and keep the context economy on its measured savings, as 1.10.0 did.

   The inbox rows `prove/4` to `prove/11` carry what a re-cut has to change.
3. The QA sign-off and the merge of PR #58, which carries the fix round, the spec, the pilot and these records.
4. The close: the proof block, the measurements snapshot for the day, and the private close.

`evals/replay/COMPARISON-v2.md` is not written: no scored run exists. REQ-CTX-015 is stated as built; its replay
gate, which binds the release that first ships REPLAY-v2's comparison, stays open.
