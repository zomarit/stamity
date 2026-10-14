# Run 2026-10-01_pr73-review-round-1 — PR #73 review fixes, round 1

Status: proved (gates green, every review approved, 0 open ledger rows); QA checkpoint open — not signed (unattended run)
Plan: .stamity/runs/2026-10-01_pr73-review-round-1/plan.md
Invocation: /st-work Apply the 18 accepted review findings of /st-pr-resolve round 1 on PR #73 (branch docs/plans-015-016, head 4607ba7d) as three file-disjoint units. The full brief, with every finding's evidence and fix sketch, is /private/tmp/claude-501/-Users-denismasatovic-Projects-zomarit-stamity/68d93474-4cc9-4ad1-a5a6-9a2664f470de/scratchpad/pr73-round1-work-brief.md; the triage of record is pr73-round1-triage.md beside it. U1 = docs/plans/015-board-writes.md (F01–F07 minus F08, F09); U2 = docs/plans/016-fork-distribution-02.md plus the one census row at docs/plans/016-fork-distribution-01.md:896 (F11–F14); U3 = docs/plans/016-fork-distribution-03.md (F16–F21). Documentation only: plan text, no source, test or content file. Overnight and unattended — the maintainer is asleep: take the recommended option at every ask and record it for the morning; the QA sign-off waits for the morning. Do not merge; /st-pr-resolve commits once for the round (listing the resolved comment ids) and pushes to the PR branch, then replies per thread.
Intensity: light — documentation only (three plan files), no runtime code, and the evaluation research is already done
Confidence gate: medium
Isolation: not declared — Phase 3 runs serially in the main checkout (a worktree inside the checkout would be scanned by the leak gate and the untracked-file suites, and this run is unattended)
Branch: docs/plans-015-016 · base 4607ba7d

## Frame

Outcome: the three plan files carry the 18 review fixes `/st-pr-resolve` accepted on PR #73, consistent across each
plan's requirement text, units, test pins and execution order, with every gate green.

- In scope: F01–F07 except F08, F09 (plan 015); F11–F14 (plan 016 file 2, plus file 1's census row at `:896`);
  F16–F21 (plan 016 file 3). Each fix as the evaluation record and the brief state it.
- Out of scope: the declined findings F08, F10, F15, F22; any source, test, content or spec file; the merge.

Ambiguity gate: no divergent reading. Three design choices were taken on the recommended option because the maintainer
is asleep, each recorded in the amended plan's "Settled by this plan" table so the morning can reverse it:
F07 (a Projects-board link names its repository; without one, new items stay proposals), F14 (`u2-apm-backed-mode`
owns the additive lock-reader extension), F16 (narrowed: only a `failed` leg holds the release).

Model plan (cost order of magnitude: about 1–2 M tokens):
- Phase 1 — none: light tier, and the four `/st-pr-resolve` evaluation researchers are this run's research input.
- Phase 3 — `spec-author` (advanced, opus) × 3, one per unit, serial.
- Phase 4 — `test-runner` × 1–2 (opus, per the maintainer's model mix); `reviewer` (advanced, opus) one fresh spawn
  per round, cap 4; `fixer` (opus) only on Critical or Warning review findings; the QA checkpoint inline.

Deferral inbox: 57 rows name a touched plan, all through `Ref:` and none by location. They are those plans' own
follow-up and drop-list rows (settled by the persisted plans) and stay in the inbox; this change resolves none.

Learnings applied: `leak-gate-scans-stamity-state-files` (no reserved predecessor name in these records),
`claude-code-refuses-sub-agent-report-file-names` (reports are `<unit>-<role>-r<N>.md`),
`vitest-update-flag-takes-an-optional-value` (no `-u`, `--json` or `--outputFile` ahead of a path in any verify
command), `a-plan-naming-a-new-spec-commits-its-skeleton` (no fix names a new `docs/specs/` path).

## Decisions trace

- Triage (from `/st-pr-resolve` round 1): `accept`, the declared default, recorded on the maintainer's overnight
  instruction.
- Plan gate: auto-continue (light tier; in-flow plan).
- Contract census: 3 units over disjoint files; no shared contract touched by two units — rows `clean`.
- Ledger (write-ahead, phase `frame`, source `pr-resolve`): frame/1 F01 · /2 F02 · /3 F03 · /4 F04 · /5 F05 · /6 F06 ·
  /7 F07 · /8 F09 · /9 F11 · /10 F12 · /11 F13 · /12 F14 · /13 F16 · /14 F17 · /15 F18 · /16 F19 · /17 F20 · /18 F21.
- decision_needed sign-off: frame/7 (F07), frame/12 (F14) and frame/13 (F16) take the recommended option set out under
  Frame, signed off by the orchestrator on the maintainer's overnight instruction; each lands as one row of its plan's
  `### Settled by this plan` table, where the morning can reverse it.
- Build: u1-plan-015, u2-plan-016-02 and u3-plan-016-03 built serially by `spec-author` (opus); each returned DONE.
  Their beyond-brief findings are build/1 (U1-X1, decision_needed), build/2 and build/3, all Minor. Two report blocks
  arrived malformed (YAML; a summary over the 300-character cap) and were re-appended through `--stdin` with the same
  content.
- Review round 1: u1 request-changes (high/medium) — frame/1–8 fixed; new review/1 (W), review/2 (W, decision_needed),
  review/3 (W, decision_needed), review/4 (M). u3 approve (high) — frame/13–18 fixed; review/5–8 (M).
- decision_needed sign-off: review/2, review/3 (and build/1, which the same rule settles) take the strict reading of
  the one-write-target floor, recorded on the maintainer's overnight instruction: a Projects-board link names exactly
  one repository, from setup step 2; a `--source` that names only a Projects board links the board with no repository.
  Issue writes (new items, edits, comments, checklist ticks) and project writes (adding an item, Status moves) reach
  only items of the named repository; items of other repositories on the board are read and screened, and every write
  to them stays a proposal. With no repository named the link is read-only: every write stays a proposal and the run
  reports `BLOCKED_DEPENDENCY` naming the missing repository and the setup step that names it. The write check
  (repository permission `admin` or `write`; for a Projects board `viewerCanUpdate`) runs once a link has its
  repository — in setup after step 2, and before the first write of a run whose link came from `--source` — and a
  failed check leaves the link read-only. Alternatives not taken: writes to every repository with items on the board,
  each behind its own permission check; defaulting to the checkout's repository.
- Review round 1, u2: request-changes (high) — frame/9–12 fixed; new review/9 (W: the lock reader's consumers share a
  PLAN_MAP wave with it). The report's one summary ran 301 characters; trimmed in the report and re-appended.
- Prove pass 1 (test-runner, `reports/branch-test-runner-r1.md`): lint 0 (one pre-existing warning), typecheck 0,
  test 0 (262 files, 10,649 passed, 12 skipped; 609.72 s with three reviewers running beside it), leak gate PASS.
- build/2 rejected: the plan already defers the `deployments[]` key spelling to the 0.32.0 lock the unit transcribes at
  intake.
- Minor rows in text this run wrote (review/4 in plan 015; review/5–8 and build/3 in plan 016 file 3) are completed in
  this run by the unit's `spec-author` rather than deferred, so the pull request ships no known gap in its own new
  text; they ride the round-2 review. The fixer's own rule keeps Minors out of its pass.
- Fix round (serial): `fixer` u1 (review/1–3, settling build/1 by the signed-off rule), `fixer` u2 (review/9; it also
  established that today's `sync` writes no `package.json`, `src/cli/commands/sync/engine.ts:691`, so step 8 stays),
  `spec-author` u1 r2 (review/4) and r3 (fix/1, a line over the wrap width), `spec-author` u3 r2 (review/5–8,
  build/3). Rejected with rationale: build/2 (above), fix/2 (the singular "reset block" row describes block 1, the only
  block that deletes), fix/3 (Markdown table rows cannot wrap). Two more report blocks needed a fix before they parsed
  (an `N-` id; a 301-character summary): corrected in the report, then appended.
- Review round 2 (fresh spawns): u1 approve (high) — review/1–4, build/1, fix/1 fixed; u2 approve (high) — review/9
  fixed; u3 approve (high) — review/5–8, build/3 fixed. Notes below the floor, deferred with rationale: review/10
  (pre-existing REQ-UPSTREAM-022 wording), review/11 (b4 eval scenario clarity), review/12 (pre-existing input shape).
- prove/1 deferred: the spec-author contract names the findings fence but not its grammar (a corpus change, outside
  this documentation-only round).
- Close question: nothing left to ask. No row needs a person; the spec delta merge does not apply (the plans' own
  spec deltas merge when their packages run); the commit belongs to `/st-pr-resolve`, which commits once for the round.

## Proof block

**Gates** (test-runner, exit codes read from the tool; evidence class: native sub-agent report under `reports/`)

| Pass | Tree | `npm run lint` | `npm run typecheck` | `npm run test` | `node scripts/leak-gate.mjs` |
|---|---|---|---|---|---|
| 1 (`reports/branch-test-runner-r1.md`) | after build | pass (0 errors, 1 pre-existing warning) | pass | pass — 262 files, 10,649 passed, 12 skipped | pass — 0 hits |
| 2 (`reports/branch-test-runner-r2.md`) | final | pass (same warning) | pass | pass — 262 files, 10,649 passed, 12 skipped | pass — 0 hits |

**Review verdicts** (`reviewer`, opus; confidence gate `medium`)

| Unit | Round 1 | Round 2 |
|---|---|---|
| u1-plan-015 | request-changes · high (closures), medium (W-1–W-3) | approve · high |
| u2-plan-016-02 | request-changes · high | approve · high |
| u3-plan-016-03 | approve · high | approve · high |

**QA checkpoint** (`st-qa`): no walk-through required — documentation only. The four files are `/st-plan` artifacts the
docs site excludes from its routes (`website/docusaurus.config.ts:165`, pinned by `test/ci/docsSite.test.ts:146-160`);
browser evidence not applicable. Rows derived 0, auto-proven 0, left for a person 0.

**Sign-off** — PR #73 review round 1, 2026-10-02

- [ ] Every H row walked or auto-proven, and passing — none derived.
- [ ] Every failing M row has a filed follow-up, linked — none derived.
- L failures are recorded, not blocking.
- Rollback: `git revert <round commit>` on `docs/plans-015-016`, or close PR #73 unmerged.
- Shippable: not signed (unattended run). For the morning: confirm or reverse the three choices recorded as
  plan 015 Decision 14, plan 016 file 2 S14 and plan 016 file 3 S9.

**Ledger**: 37 rows, 0 open — 30 fixed (frame/1–18, build/1, build/3, review/1–9, fix/1), 3 rejected (build/2, fix/2,
fix/3), 4 deferred to `.stamity/inbox.md` (review/10, review/11, review/12, prove/1).

**Artifacts touched**

| Path | Owning sub-agent |
|---|---|
| `docs/plans/015-board-writes.md` | spec-author u1 r1, r2, r3; fixer u1 r1 |
| `docs/plans/016-fork-distribution-02.md` | spec-author u2 r1; fixer u2 r1 |
| `docs/plans/016-fork-distribution-01.md` (census row only) | spec-author u2 r1 |
| `docs/plans/016-fork-distribution-03.md` | spec-author u3 r1, r2 |
| `.stamity/inbox.md` (one dated block, four rows) | orchestrator |
| this run folder (`record.md`, `plan.md`, `ledger.jsonl`) | orchestrator |

**Per-action attribution**: researchers ×4 (evaluation, read-only, `/st-pr-resolve` phase 2) → spec-author ×3 (build)
→ test-runner + reviewer ×3 (round 1) → fixer ×2 and spec-author ×3 (fix round) → test-runner + reviewer ×3 (round 2);
every spawn returned DONE; no failure-ladder step, no capacity event, no degradation event.

**Recommended next step**: the maintainer confirms or reverses the three recorded choices (Decision 14, S14, S9) and
resolves the PR #73 threads `/st-pr-resolve` answers. Inbox rows appended: review/10, review/11, review/12, prove/1.

Not done: the QA sign-off (unattended — the maintainer's).
