# Run 2026-10-02_pr75-review-round-1 — PR #75 review fix, round 1

Status: proved (gates green at pass 3 on the final tree after a transient red pass 2, the unit approved at high confidence, 0 open ledger rows); QA checkpoint closed — documentation only, no walk-through required; fix commit 541c8f94 on PR #76
Plan: .stamity/runs/2026-10-02_pr75-review-round-1/plan.md
Invocation: /st-work Fix the one accepted finding of /st-pr-resolve round 1 on PR #75 (merged; main at 935103de) in a quick follow-up fix PR, merged on green: plan 017 file 3, unit c4 step 2 identifies the dispatched docs-site run by its own id, with an unambiguous fallback.
Intensity: light — one plan-text edit in one file, no runtime code
Confidence gate: medium
Isolation: not declared — one unit, built in the main checkout
Branch: docs/plan-017-c4-run-id · base 935103de

## Frame

Outcome: c4 step 2 of `docs/plans/017-docs-overhaul-03.md` identifies the run its dispatch created without guessing.
It never selects, watches or cancels another operator's run, and every gate stays green.

- In scope: c4's run-identification sentences, and the testCriteria or verify text they imply.
- Out of scope: every other line of plan 017, any source or workflow file, and the merge itself (taken on the
  maintainer's "Quick fix PR, merge on green").

Ambiguity gate: no divergent reading. The finding's supporting claim (that `gh workflow run` prints the created run's
URL) does not hold for the installed gh 2.86.0, whose help says nothing about it, so the fix must not depend on it.

Model plan (cost order of magnitude: about 0.2 M tokens):

| Phase | Role | Class (alias) | Count |
|---|---|---|---|
| Evaluate | researcher | `opus` | 1 |
| Build | spec-author | `opus` | 1 |
| Prove | reviewer | `opus` | 1 per round |
| Prove | test-runner | `opus` | 1 per pass |

Deferral inbox: no row touches c4 of plan 017.

## Build

One spec-author (`opus`) applied the plan's four edits to `docs/plans/017-docs-overhaul-03.md`, and to no other file:
`DONE`. Its guard refused every shell command, so its verify commands went to the test-runner. It returned two notes in
a YAML block, which the ledger does not read, so the orchestrator ledgered them as JSON lines:
- `build/1` (Minor): step 2 notes the dispatch time twice, in two wordings.
- `build/2` (Minor): it could not list `.stamity/learnings/` before the edit. Closed `rejected` by the orchestrator: the
  session holds the learnings index (14 entries), the one on plan files fires only when a plan names a new
  `docs/specs/` path, and this edit names none.

## Review, round 1

One reviewer (`opus`): `approve`, high confidence. Closures: `frame/1` `fixed`, and `build/1` `rejection-upheld` (one
moment used two ways: the first note is the dispatch time, and T is that time minus one minute). One new Minor,
`review/1`: a same-login race could let the first list pick another dispatch by the same login, and cancel it.

`review/1` sits below the loop's severity floor, but it is the finding's own failure mode, a cancel of a run that is not
ours. The orchestrator therefore sent it to a fixer instead of deferring it.

## Fix round 1 and re-review

One fixer (`opus`): `DONE`, `review/1` fixed. When the run id came from the list, the step lists again with the same
query before any cancel. It cancels only while exactly one run still matches and that run is the identified one;
otherwise it stops and asks. The edge case covers both lists. The fixer's own verify exited 0: the coverage check, three
vitest files (94 tests) and the leak gate.

A fresh reviewer (`opus`) received only `review/1`: `approve`, high confidence, closure `fixed`, no new finding. It noted
one residual gap in prose. If our own run stays invisible to the API at both lists, a cancel can still go ahead. That
needs four conditions at once, and the run it cancels is the same operator's deploy of an older sha. Only a run id taken
from the dispatch itself closes it, and the printed-URL branch already takes that path.

## Prove

- Pass 1 (`reports/branch-test-runner-r1.md`), on the pre-fix tree: green.
- Pass 2, on the final tree: red on one test. `test/ci/pluginLifecycle.test.ts` › "the Cursor local-path walk" failed at
  `:1429` with `expected 143 to be +0`. The client's own output shows three lost connections to Cursor's service before
  the run ended. Every other gate passed: lint, typecheck, the leak gate, the coverage check and repo hygiene, plus 261
  of 262 test files. Ledgered as `prove/1`.
- Classified as environmental, not caused by the change. The walk runs this machine's own Cursor client against Cursor's
  service (`describe.skipIf` on `STAMITY_CURSOR_BIN`, `:1318`) and reads no file under `docs/plans/`. The diff is plan
  text in one file, and the same walk passed in pass 1 minutes earlier. A transient remote fault is re-run only, so
  pass 3 runs every gate again on the same final tree.
- Pass 3 (`reports/branch-test-runner-r3.md`), on the same final tree: green, the Cursor walk included. `prove/1` closed
  `rejected` with that reason.

## Capacity

- 2026-10-02T14:42Z capacity: test-runner stall → resumed (pass 2 made no progress for 600 s after its gate commands;
  on resume it returned the results of its one run)

## Proof block

**Gates.** Run by the test-runner (`opus`); each command run once and read by its exit code.

| Gate | Pass 1 (`reports/branch-test-runner-r1.md`, pre-fix tree) | Pass 2 (final tree; red, so returned in full and no report) | Pass 3 (`reports/branch-test-runner-r3.md`, final tree = `541c8f94`) |
|---|---|---|---|
| `npm run lint` | pass (1 pre-existing warning) | pass (the same warning) | pass (the same warning) |
| `npm run typecheck` | pass | pass | pass |
| `npm run test` | pass: 262 files, 10,649 passed, 12 skipped | fail: 261 of 262 files; the Cursor local-path walk, `test/ci/pluginLifecycle.test.ts:1429`, `expected 143 to be +0` after three lost connections to Cursor's service | pass: 262 files, 10,649 passed, 12 skipped; the Cursor walk passed |
| `node scripts/leak-gate.mjs` | pass, 0 hits over 1,716 files | pass, 0 hits over 1,716 files | pass, 0 hits over 1,716 files |
| `spec-plan-coverage.mjs` on file 3 | pass: 5 units, no findings | pass: 5 units, no findings | pass: 5 units, no findings |
| `node scripts/repo-hygiene.mjs --base 935103de` | pass | pass | pass |

**Review verdicts.**
- Round 1: `approve`, high confidence, with one Minor (`review/1`) sent to a fixer.
- Round 2 (fresh): `approve`, high confidence, at or above the declared gate (medium).
- Deep review: not run (light intensity).
- Lenses: none triggered (plan text only; no trigger path is touched).

**QA.**
- What to verify: c4 step 2 (`docs/plans/017-docs-overhaul-03.md:211-220`) takes the run id from a printed URL or from
  exactly one actor-filtered match, stops and asks on several, and lists again before any cancel. Reading those ten
  lines takes under a minute.
- The `st-qa` checkpoint found a documentation-only diff: plan text under `docs/plans/`, which the site build excludes
  (`website/docusaurus.config.ts:165`), so there are no pages to render. Result: "no walk-through required —
  documentation only". No row needs a person, so there is no ask.
- Shippable: YES.
- Rollback: `git revert 541c8f94`.
- Browser evidence: not applicable (no user-facing surface).

**Decisions trace.**
- Intensity: light.
- Isolation: not declared; the one unit was built in the main checkout.
- Plan gate: auto-continued (light).
- Contract census: skipped, because a batch of one unit has no peer.
- `review/1` (Minor) went to a fixer instead of the inbox, because it is the finding's own failure mode.
- `build/1` was rejected on re-review (`rejection-upheld`). `build/2` and `prove/1` were rejected by the orchestrator,
  with the reason on each row.
- Pass 2's red was classed as environmental and re-run once, as pass 3.
- Capacity: one test-runner stall, resumed (see Capacity).
- Confidence gate: medium.
- The commit, and the merge on green: on the maintainer's answer "Quick fix PR, merge on green".

**Artifacts touched.**
- `docs/plans/017-docs-overhaul-03.md` (spec-author, then fixer).
- This run's `plan.md` and `record.md` (orchestrator), and `ledger.jsonl` (the `ledger` verb).

**Attribution.** The evidence class is the sub-agent returns and their reports under `reports/`, which stay local.
- 1 researcher (the `/st-pr-resolve` evaluation), `DONE`.
- 1 spec-author, `DONE`.
- 2 reviewers, both `approve`.
- 1 fixer, `DONE`.
- 3 test-runner passes: green, red (environmental), then green. The pass 2 runner stalled once and was resumed. The
  test-runner role has no file-write tool, so it wrote its two reports through the shell.

Neither the spec-author nor the reviewers could run shell gates beyond read-only git. The test-runner ran every gate.

**Ledger.** 5 rows, 0 open, 0 deferred:
- `frame/1` `fixed` (the PR #75 finding);
- `build/1` and `build/2` `rejected`;
- `review/1` `fixed`;
- `prove/1` `rejected` (environmental).

**Inbox.** No row appended and none retired.

**Next step.** The fix merges with PR #76 once CI is green. Nothing was deferred, and no acceptance criterion is left
uncovered. The re-review's residual gap is recorded above: our own run might stay invisible to the API at both lists.
Only a run id from the dispatch itself closes it, and the printed-URL branch already takes that path.
