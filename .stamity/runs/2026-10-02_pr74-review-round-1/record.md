# Run 2026-10-02_pr74-review-round-1 — PR #74 review fixes, round 1

Status: proved (gates green at both passes, every unit approved at high confidence, 0 open ledger rows); QA checkpoint closed — documentation only, no walk-through required; fix commit d2d333e7 on PR #75
Plan: .stamity/runs/2026-10-02_pr74-review-round-1/plan.md
Invocation: /st-work Fix the 26 accepted findings of /st-pr-resolve round 1 on PR #74 (merged; main at ef598f49) in a follow-up fix PR. Plan text only, three file-disjoint units: U1 docs/plans/017-docs-overhaul-01.md (F1–F15 plus the file-1 parts of F19, F20, F21, F23 and F25), U2 docs/plans/017-docs-overhaul-02.md (F16–F18 plus F3's file-2 parts), U3 docs/plans/017-docs-overhaul-03.md (F19–F26). The evaluation records with the proposed fixes are in this session.
Intensity: light — plan text only (three files), no runtime code, and the evaluation research is already done (three researchers in `/st-pr-resolve` phase 2)
Confidence gate: medium
Isolation: not declared — Phase 3 runs serially in the main checkout. A worktree inside the checkout would be scanned by the leak gate and the untracked-file suites (the 2026-10-01 PR #73 fix run's precedent).
Branch: docs/plan-017-review-fixes · base ef598f49

## Frame

Outcome: the three files of plan 017 carry the 26 review fixes that `/st-pr-resolve` round 1 accepted on PR #74. The
fixes stay consistent across the files: the reader-test protocol reads the same in file 1's `a7` and in file 3's
declared table, and the activation rule of the 60% total reads the same in files 1 and 2. Every gate is green.

- In scope: F1–F26, each as its evaluation record states. Where an evaluator found the same flaw elsewhere, the fix
  covers that occurrence too:
  - the "50,000 characters" wording at file 1 `:76` and `:323`, and file 2 `:41` (F1);
  - "pack artifacts" at file 2 `:685` (F8);
  - S11 at file 1 `:225`, and the size line at file 3 `:226` (F20).
- Out of scope: any source, test, content or spec file; the plan's other units; the merge; the local roadmap's session
  count (the orchestrator updates it after the merge).

Ambiguity gate: no divergent reading. F22 takes the evaluator's middle fix: the publish is held by default, and a
publish happens only on the maintainer's recorded override. The full block is declined, and the reply gives the
counter-argument.

Model plan (cost order of magnitude: about 0.5–1 M tokens):

| Phase | Role | Class (alias) | Count |
|---|---|---|---|
| Build | spec-author | advanced (`opus`) | 3, serial (U1, U2, U3) |
| Prove | test-runner | economy class, run on `opus` per the model mix | 1 per pass |
| Prove | reviewer | advanced (`opus`) | 1 per unit, round 1; a fresh one per re-review |
| Prove | fixer | standard (`opus`) | only on a Critical or Warning finding |

The security lens was not triggered: no trigger path is touched (plan text only).

Deferral inbox: the rows citing these files are plan 017's own follow-ups (`Ref: docs/plans/017-docs-overhaul-0*.md`,
nine rows appended 2026-10-02). The plan settles each one as a follow-up, so they stay where they are. No other row
overlaps.

## Build

Three spec-author units ran serially in the main checkout, all `DONE`. Every listed edit was applied. The guard limits
that role to read-only git, so none of them could run its verify commands; the test-runner runs them. The builders'
own notes were ledgered as `build/1`–`build/4`, all Minor:
- `build/1`: the `sectionOf` wording;
- `build/2`: the T5 tasks-table header;
- `build/3`: b8's duplicate test entry;
- `build/4`: c1's "`<n>` of 8" line.

## Review, round 1

Three reviewers (`opus`), one per unit. All three requested changes, at high confidence. The ledger holds
`review/1`–`review/16`:
- Warnings: `review/1`, `review/2`, `review/7`, `review/8`, `review/12`, `review/13`;
- Minors: `review/3`–`review/6`, `review/9`–`review/11`, `review/14`–`review/16`.

### Sign-offs on the `decision_needed` rows (by the orchestrator, before any fixer sees them)

- **`review/1`** (with `build/1`), the section rule. a6's check 7 and a7's T6 and T8 graders describe the rule in
  words: the section is everything from the heading above the reference or anchor to the next heading of the same or
  a higher level. Each lane implements that rule in its own file. There is no import of a3's `sectionOf`, which lands
  in a parallel lane; one sentence notes that `sectionOf` in `test/docs/shared.ts` follows the same rule.
- **`review/5`** and **`review/16`**, the held wording P2. Its tail becomes "plus the A tries of each reserve that is
  tested". The change lands in file 1 (`a7` protocol §4 and S11) and in file 3 (the Trials row and the Size line),
  word for word.
- **`review/6`**, the held wording P1. It becomes: "a read-only copy of the published pages: every file `llms.txt`
  links, which is what the site serves as Markdown (the step `a4` adds), plus `llms.txt` itself. `docs/specs/` and
  `docs/plans/` are not in it, because the site build excludes them and `llms.txt` names neither. No repository source,
  no web. The grader refuses a copy that holds a `plans/` or `specs/` folder." The change lands in file 1 (protocol §3)
  and file 3 (the Condition B row and c1 step 2), word for word.

## Fix round 1 and re-review

**Fixers.** Three fixers (`opus`), serial, one per file. Every handed id was fixed, and no answer disputed a finding.
Each fixer's own verify exited 0: the coverage check, the three vitest files (94 tests) and the leak gate.
- U1 fixed 8 ids (`review/1`–`review/6`, `build/1`, `build/2`), and updated the plan's held P1 and P2.
- U2 fixed 6 ids (`review/7`–`review/11`, `build/3`).
- U3 fixed 6 ids (`review/12`–`review/16`, `build/4`), and applied `review/6`'s P1 to file 3.

**Re-review.** Three fresh reviewers each received only the handed ledger ids, never a fixer's account. Every one
approved, at high confidence:
- U1: 23 of 23 closures `fixed`;
- U2: 9 of 9 `fixed`;
- U3: 14 of 14 `fixed`.

No reviewer raised a new Critical or Warning. Applied with `stamity ledger close --report … --ids …`, which gives 46 of
46 rows `fixed` and 0 open.

The U3 re-review judged the open point (c2's behaviour on an `invalid` bar) not a real gap: contamination comes from
condition A alone, so a docs fix cannot change it, and S25 and c4 already end at `Not done:` with the publish held.

The re-reviews noted four Minor observations in prose only, as the round-2 rules require:
- the quote markers in F17's "whitespace-collapsed text" (file 2 `:899`);
- the `createdAt` poll's missing timeout (file 3 `:211-214`);
- what follows a lost cancel race (file 3);
- two byte counts that a read-only guard cannot print.

None is ledgered. All are wording-level, and the next run that executes plan 017 meets them at intake.

## Proof block

**Gates.** Run by the test-runner (`opus`); each command run once and read by its exit code.

| Gate | Pass 1 (`reports/branch-test-runner-r1.md`, pre-fix tree) | Pass 2 (`reports/branch-test-runner-r2.md`, final tree = `d2d333e7`) |
|---|---|---|
| `npm run lint` | pass (1 pre-existing warning) | pass (the same warning) |
| `npm run typecheck` | pass | pass |
| `npm run test` | pass: 262 files, 10,649 passed, 12 skipped | pass: 262 files, 10,649 passed, 12 skipped |
| `node scripts/leak-gate.mjs` | pass, 0 hits over 1,712 files | pass, 0 hits over 1,712 files |
| `spec-plan-coverage.mjs` 01 / 02 / 03 | pass: 9 / 12 / 5 units, no findings | pass: 9 / 12 / 5 units, no findings |
| `node scripts/repo-hygiene.mjs --base ef598f49` | pass | pass |

**Review verdicts.**
- Round 1: U1, U2 and U3 each `request-changes`, high confidence.
- Round 2 (fresh): U1, U2 and U3 each `approve`, high confidence, at or above the declared gate (medium).
- Deep review: not run (light intensity).
- Lenses: none triggered.

**QA.** The `st-qa` checkpoint found a documentation-only diff: plan text under `docs/plans/`, which the site build
excludes, so there are no pages to render. Result: "no walk-through required — documentation only". No row needs a
person, so there is no ask.
- Shippable: YES.
- Rollback: `git revert d2d333e7`.
- Browser evidence: not applicable (no user-facing surface).

**Decisions trace.**
- Intensity: light.
- Isolation: not declared, so Phase 3 ran serially in the main checkout.
- Plan gate: auto-continued (light).
- Contract census: P1–P5 reconciled, P1–P4 owned by U1 and pasted by U3, P5 owned by U1 and pasted by U2.
- The four `decision_needed` rows were signed off above before any fixer saw them.
- Confidence gate: medium.
- The commit: on the maintainer's instruction for a fix PR ("do a quick fix pr for valid points").

**Artifacts touched.**
- `docs/plans/017-docs-overhaul-01.md` (U1 spec-author, then U1 fixer).
- `docs/plans/017-docs-overhaul-02.md` (U2 spec-author, then U2 fixer).
- `docs/plans/017-docs-overhaul-03.md` (U3 spec-author, then U3 fixer).
- This run's `plan.md` (orchestrator; U1 fixer for its P1 and P2 lines), `record.md` (orchestrator) and `ledger.jsonl`
  (the `ledger` verb).

**Attribution.** The evidence class is the sub-agent returns and their reports under `reports/`, which stay local.
- 3 spec-author, all `DONE`.
- 6 reviewer, 3 `request-changes` then 3 `approve`.
- 3 fixer, all `DONE`.
- 2 test-runner, both green.

None of the spec-author or reviewer roles could run shell gates beyond read-only git. The test-runner ran every gate.

**Ledger.** 46 rows, 46 `fixed`, 0 open, 0 deferred:
- `frame/1`–`frame/26`, the PR #74 findings;
- `build/1`–`build/4`;
- `review/1`–`review/16`.

**Inbox.** No row appended, none retired: plan 017's own follow-up rows stay as plan follow-ups.

**Next step.** The fixes merge with PR #75. Nothing was deferred and no acceptance criterion is left uncovered. The
four Minor observations above ride with plan 017's own intake.
