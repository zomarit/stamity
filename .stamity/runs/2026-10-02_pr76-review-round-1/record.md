# Run 2026-10-02_pr76-review-round-1 — PR #76 review fixes, round 1

Status: proved (gates green at pass 2 on the final tree after a red pass 1 on the live Cursor client walk, the unit approved at high confidence in both rounds, 0 open ledger rows); QA checkpoint closed — documentation only, no walk-through required; fix commit 62e63de7 on PR #76
Plan: .stamity/runs/2026-10-02_pr76-review-round-1/plan.md
Invocation: /st-work Fix the four accepted findings of /st-pr-resolve round 1 on PR #76 (open, head 7b795a8f) on #76 itself, then merge on green: plan 017 file 3, unit c4 takes only a run that did not exist before its dispatch, accepts the maintainer's choice in verify, targets zomarit/stamity in every gh command, and cancels the run the maintainer names.
Intensity: light — one plan-text edit in one file, no runtime code
Confidence gate: medium
Isolation: not declared — one unit, built in the main checkout
Branch: docs/plan-017-c4-run-id · base 7b795a8f

## Frame

Outcome: c4 step 2 of `docs/plans/017-docs-overhaul-03.md` takes as the deploy run only a run its own dispatch
created. It cancels nothing while the run is in doubt, and it can still cancel a wrong-S run once the maintainer names
it. Every `gh` command targets `zomarit/stamity`, and `verify` accepts every path the step allows. Every gate stays
green.

- In scope: F1–F4 of `/st-pr-resolve` round 1 on PR #76 (comments 4166983991, 4166984000, 4166984009, 4166984018),
  each as its evaluation record states; c4's step 2 from "Record S" to its end, and the `testCriteria`, `edgeCases`
  and `verify` sentences they touch.
- Out of scope: every other line of plan 017, any source or workflow file, and the merge itself (taken on the
  maintainer's answer "Fix on #76, then merge").

Ambiguity gate: no divergent reading. The evaluation proposed a 30-second second list after a single new match. It is
left out: the list taken before the dispatch already excludes every older run, the list again before a cancel still
guards the one destructive act, and the 30 seconds are not measured.

Model plan (cost order of magnitude: about 0.2–0.3 M tokens):

| Phase | Role | Class (alias) | Count |
|---|---|---|---|
| Evaluate | researcher | `opus` | 1 (done, in `/st-pr-resolve` phase 2) |
| Build | spec-author | `opus` | 1 |
| Prove | reviewer | `opus` | 1 per round |
| Prove | test-runner | `opus` | 1 per pass |
| Prove | fixer | `opus` | only on a Critical or Warning finding |

The security lens was not triggered: no trigger path is touched (plan text only).

Deferral inbox: no row touches c4 of plan 017.

## Build

One spec-author (`opus`) applied the plan's four edits to `docs/plans/017-docs-overhaul-03.md`, and to no other file:
`DONE`, no findings. Its guard refused shell commands, so its verify command went to the test-runner.

## Review, round 1

One reviewer (`opus`): `approve`, high confidence. Closures: `frame/1`–`frame/4` all `fixed`; none opens a new way to
watch or cancel a run that is not this dispatch's. It agreed with leaving out the 30-second second list: a fixed wait
narrows the one remaining gap (another dispatch by the same login within seconds of this one) but cannot close it.
Three new Minors, all consistency gaps this change itself opened:
- `review/1`: after the list again before a cancel, the step does not say to record the maintainer's choice, which
  `testCriteria` and `verify` require.
- `review/2`: `edgeCases` says "at the first list", but step 2 now has three lists.
- `review/3`: the new started-deploy branch has no `edgeCases` row, and its `Not done:` names no owner.

They sit below the loop's severity floor, but they are defects of this change and cheap to fix, so the orchestrator
sent them to a fixer, with the wording signed off in the dispatch.

## Fix round 1 and re-review

One fixer (`opus`): `DONE`, `review/1`–`review/3` fixed, inside c4 only.
- Step 2 records the maintainer's choice at the list again before a cancel.
- `edgeCases` says "at the list after the dispatch".
- A new `edgeCases` sentence covers a wrong-S run whose deploy job has already started: no cancel, and a `Not done:`
  owned by the maintainer. Step 2 names the same owner.

The fixer's own verify exited 0: the coverage check, three vitest files (94 tests) and the leak gate.

A fresh reviewer (`opus`) received only `review/1`–`review/3`: `approve`, high confidence, all three closures `fixed`,
no new Critical or Warning. It found step 2, `testCriteria`, `edgeCases` and `verify` in agreement. It noted one Minor
in prose, not ledgered under the nit policy, and the wording predates this change. "If another new run has appeared"
does not say what "another" is measured against once the maintainer has picked. Either reading ends in asking again,
never in a cancel.

## Prove

- Pass 1, on the pre-fix tree: red on one test. `test/ci/pluginLifecycle.test.ts` › "the Cursor local-path walk"
  failed at `:1432`: the live model's answer to the discovery prompt listed 19 skill ids without `st-work`. Every other
  gate passed: lint, typecheck, the leak gate, the coverage check and repo hygiene, plus 261 of 262 test files.
  Ledgered as `prove/1`.
- The walk's discovery step is the suite's only model call (`:1278-1283`); it asks the machine's Cursor client to list
  the plugin's skills (`:1271-1273`, `:1391`). The fixture it reads is built by
  `scripts/plugin-lifecycle-fixture.mjs`, which reads nothing under `docs/plans/`. The diff is plan text in one file.
  The same walk failed in the previous run's pass 2 on a lost connection, and passed in its pass 3 on unchanged text.
  The final pass re-runs it.
- Pass 2 (`reports/branch-test-runner-r2.md`), on the final tree: green, the Cursor walk included. `prove/1` closed
  `rejected` as environmental: the discovery step's live model answer is not a property of the tree.

## Proof block

**Gates.** Run by the test-runner (`opus`); each command run once and read by its exit code.

| Gate | Pass 1 (pre-fix tree; red, so returned in full and no report) | Pass 2 (`reports/branch-test-runner-r2.md`, final tree = `62e63de7`) |
|---|---|---|
| `npm run lint` | pass (1 pre-existing warning) | pass (the same warning) |
| `npm run typecheck` | pass | pass |
| `npm run test` | fail: 261 of 262 files; the Cursor local-path walk, `test/ci/pluginLifecycle.test.ts:1432`, the live model's listing lacked `st-work` | pass: 262 files, 10,649 passed, 12 skipped; the Cursor walk passed |
| `node scripts/leak-gate.mjs` | pass, 0 hits over 1,720 files | pass, 0 hits |
| `spec-plan-coverage.mjs` on file 3 | pass: no findings | pass: no findings |
| `node scripts/repo-hygiene.mjs --base 7b795a8f` | pass | pass |

**Review verdicts.**
- Round 1: `approve`, high confidence, with three Minors (`review/1`–`review/3`) sent to a fixer.
- Round 2 (fresh): `approve`, high confidence, at or above the declared gate (medium).
- Deep review: not run (light intensity).
- Lenses: none triggered (plan text only; no trigger path is touched).

**QA.**
- What to verify: c4 step 2 (`docs/plans/017-docs-overhaul-03.md:210-227`) lists the runs before the dispatch and takes
  only a new one. Every `gh` command names `zomarit/stamity`. It cancels nothing while the run is in doubt, and it
  cancels a wrong-S run the maintainer names. Reading those lines takes about a minute.
- The `st-qa` checkpoint found a documentation-only diff: plan text under `docs/plans/`, which the site build excludes
  (`website/docusaurus.config.ts:165`), so there are no pages to render. Result: "no walk-through required —
  documentation only". No row needs a person, so there is no ask.
- Shippable: YES.
- Rollback: `git revert 62e63de7`.
- Browser evidence: not applicable (no user-facing surface).

**Decisions trace.**
- Intensity: light.
- Isolation: not declared; the one unit was built in the main checkout.
- Plan gate: auto-continued (light).
- Contract census: skipped, because a batch of one unit has no peer.
- The evaluation's 30-second second list was left out (see Frame); the round-1 reviewer agreed.
- `review/1`–`review/3` (Minor) went to a fixer instead of the inbox, because this change opened them.
- `prove/1` was rejected by the orchestrator, with the reason on its row. Pass 1's red was classed as environmental,
  and the final pass re-ran every gate.
- Confidence gate: medium.
- The commit, and the merge on green: on the maintainer's answer "Fix on #76, then merge".

**Artifacts touched.**
- `docs/plans/017-docs-overhaul-03.md` (spec-author, then fixer).
- This run's `plan.md` and `record.md` (orchestrator), and `ledger.jsonl` (the `ledger` verb).

**Attribution.** The evidence class is the sub-agent returns and their reports under `reports/`, which stay local.
- 1 researcher (the `/st-pr-resolve` evaluation), `DONE`.
- 1 spec-author, `DONE`.
- 2 reviewers, both `approve`.
- 1 fixer, `DONE`.
- 2 test-runner passes: red (environmental), then green.

Neither the spec-author nor the reviewers could run shell gates beyond read-only git. The test-runner ran every gate.

**Ledger.** 8 rows, 0 open, 0 deferred:
- `frame/1`–`frame/4` `fixed` (the PR #76 findings);
- `review/1`–`review/3` `fixed`;
- `prove/1` `rejected` (environmental).

**Inbox.** No row appended and none retired.

**Next step.** The fix merges with PR #76 once CI is green. Nothing was deferred, and no acceptance criterion is left
uncovered. Two notes stay in this record rather than in the inbox:
- the re-review's prose Minor on "another new run";
- the one remaining identification gap: another dispatch by the same login within seconds of this one.
