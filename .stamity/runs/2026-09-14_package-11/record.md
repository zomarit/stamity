# Package 11 — Prove behavior and value (tracks D, A, C) and the 1.8.0 cut

Status: **in progress** — opened 2026-09-14T21:29Z (23:29 local) as one overnight run on the maintainer's
instruction of 2026-09-14. Track B (the with/without benchmark) stays scheduled with its trigger; it is
not this run's.

## Baseline, re-verified at intake (2026-09-14T21:29Z)

- Released 1.7.0: annotated tag `v1.7.0` → `e8239445f97325826218eceb52e432748834f537` ✓
- `main` = `origin/main` = `949bde928e0ce3298015e35937594775e897a670`, working tree clean ✓
- Open pull requests: 0 · open issues: 0 ✓
- Deferral inbox `.stamity/inbox.md`: no active rows ✓
- Baseline gate on `949bde9`: `npm run lint && npm run typecheck && npm run test -- --coverage` → exit 0
  (statements 96.37 %, branches 89.66 %, functions 98.68 %, lines 97.25 %; every per-file floor met) ✓
- Account capacity at intake (one scrubbed probe call, the route of record's environment): five-hour
  window 0.09, seven-day 0.34 — no capacity hold expected before Phase 2.
- Local stray tag `pre-rename-94a40ba` → `94a40ba8fe6dc629509788ccc2d34a27cae1643c`; the same commit is
  the head of the fetch-only `archive` remote's `main` (`git ls-remote archive`), so the history is
  preserved outside this checkout. Disposition per decision 6 below.
- Learnings read: all five under `.stamity/learnings/` (dogfood sync, leak gate over state files,
  release-close record re-sync, surface pins, the local gate weaker than CI).

## Decisions applied up front (the maintainer's instruction of 2026-09-14)

Every decision below was taken by the maintainer in the instruction that started this run; the run
records each as `Default applied: <question> → <option> (<reason>)` where it executes one.

1. Always-on budget: build the demoted delivery behind an emission option, ship it ON in the candidate,
   measure in the Phase 2 run (trigger probes + charter-floor-line twins); floors hold → ratchets drop
   and a row superseding AD-083 goes to the handoff; a floor falls → the option is reverted, the
   evidence stays under `evals/runs/`, the set re-runs. The 150-line anchor is re-verified tonight and
   re-anchored by a decision-row proposal only; doctrine text is not edited tonight.
2. Charter invariants version 1.0.0, ratified 2026-08-31, last amended from git history (2026-09-13).
3. Human QA: automate what the vendors document; bind the remaining human rows to input hashes; four
   client fixtures and the QA form prepared against the Phase 2 candidate; rows that stay human are
   accepted UNPERFORMED for 1.8.0 by the instruction and reopen only when their inputs change.
4. Record currency: public gates, every named public carrier fixed, hand pages re-attested at the
   candidate tree; private carriers as listed (dashboard fact 4, AL-008, AL-018, the two L2 rows, the
   kickoff prompt, EV-161 with the "~48%" figure dropped, the untracked verifier bulk hashed then
   deleted with an ignore rule; the app-server-schema scratch kept).
5. Codex eval profiles: option 1 — kept, marked "documented, unproven, no run of record", control gap
   named beside them.
6. `pre-rename-94a40ba`: archive holds the commit → delete the local tag and prune; push nothing.
7. Track A: no new run of its own; run 24 plus its adjudication is the 1.7.0 evidence, the Phase 2 run
   the 1.8.0 evidence; new failing rows are repaired in the corpus and the set re-run, as at 1.7.0.
8. Eval runs: the route of record only (private driver, `claude` profile, judge `claude-fable-5-1`,
   scenarios `claude-opus-5`, three samples per case, calibration 5/5 first); new cases versioned as
   `cases-v6` and `SET-v7` with the four thresholds unchanged and declared before the run; SET-v6
   retained. Capacity guard respected; at most three full runs tonight.
9. Track C: merge-ready-rate report from committed run records with denominator, exclusions and the
   npm-download reach proxy labeled as a proxy; benchmark and first-run evidence linked from the docs
   without touching mission or tagline wording; the security mapping and six-surface threat model
   written from primary sources read tonight, every control traced to code or emitted behavior.
10. Track B: not tonight (a post-tag pilot only if a free window remains and it can complete).
11. Release 1.8.0 when the Phase 2 run, CI, the dry run and the signing rehearsal are green on the
    candidate: CHANGELOG, version restamp, checklist lines needing no publish, rebase-merge, tree
    comparison, annotated tag at the merged commit, push; the workflow waits on the maintainer's
    npm-publish approval.

## Phases

- Phase 1 — build (D1, D2, D4, D5 first; then A; then C; then D3's automation and fixtures).
- Phase 2 — freeze and measure on one candidate commit.
- Phase 3 — close and cut.

(Sections below are appended as the run proceeds.)

## Phase 0 — Frame (2026-09-14T21:50Z)

- Outcome sentence: every item of Package 11 tracks D, A and C lands implemented, gated and recorded
  tonight, the eval set is versioned so the always-on demotion is measured before the ratchets move,
  and 1.8.0 is cut on a green measurement; Track B stays scheduled.
- Intensity: **deep** (wide diff across emission, corpus, evals, docs and hooks; public contracts;
  security-sensitive surfaces; new dependencies on the site). `--effort` not given.
- Model plan (class → roles): frontier → the whole-branch review before the QA checkpoint; advanced →
  implementers, spec-author, the security lens, the reviewer each round; standard → researchers, the
  performance lens; economy → the test-runner. Spawned so far: 9 researchers, 1 spec-author.
- Build isolation, declared before the first Phase 3 dispatch: the client's own primitive — one git
  worktree per parallel implementer (the Agent tool's `worktree` isolation), each unit committed on its
  worktree branch and cherry-picked into `feat/package-11-prove-behavior-and-value` in dependency
  order; serial units run in the main checkout; the private checkout takes one writer at a time.
- Deferral inbox: no rows overlap (the inbox is empty).
- Plan: `docs/plans/007-prove-behavior-and-value.md` (committed as `4774d01`). Plan-lint, inline by
  the writer: L1 pass (every criterion names an observable and its command or test) · L2 pass (every
  `depends_on` names a unit in the plan; every path in `reads:` exists at the stamp) · L3 pass (every
  unit lists an edge case) · L4 pass (REQ-PROVE-001…021 cited; the two private units state `spec
  carries no ids`). Structural coverage: run after the spec lands (recorded below).
- Contract census (before the first parallel dispatch), one row per shared contract:
  `SetupManifest` (producer U2a; consumers config/sync/check — U2a owns all) · `CoreEmissionPlan`
  (producer U2a; consumers the four adapters — U2a) · `composeAlwaysOnLoad` signature (U2b, after
  U1's edit of the same file) · `evals/SET-v7.md` index (U0a creates; U1 → U4 → U2c edit in sequence)
  · `evals/README.md` (U0b, then U4's one paragraph) · `test/docsPages.test.ts` (U8 → U9 → U6) ·
  `README.md` and the hand pages (U8's two map rows, then U6) · the goldens snapshot (U1 refresh, then
  U2b, then U12) · `.stamity/manifest.json` and the dogfood tree (each syncing unit in sequence) ·
  `scripts/eval/instrument.mjs` and `test/evals/manualRunner.test.ts` (U0a → U4 → U2c). Every row
  closes `clean` or `reconciled(1)` by sequencing; no row left unreconciled.
- Decision 6 executed at 21:53Z: the fetch-only `archive` remote (push disabled) holds
  `94a40ba` at its `main`, so the commit is preserved outside this checkout; the local tag
  `pre-rename-94a40ba` was deleted and the remote pruned; nothing pushed.

## Phase 3 — Build dispatch log

- 21:45Z B0: U0a (eval-set cutover), U0b (eval docs currency) — worktrees.
- 21:50Z B1 (no B0 dependency): U2a (rule-delivery engine, default always-on), U3 (carried defects),
  U5 (spec status gate), U7 (QA harness), U8 (measurement report) — worktrees; U10 (private
  currency) — private checkout, single writer.
- 22:19Z spec landed: `docs/specs/prove-behavior-and-value.md` (21 requirements, `status: design`); one
  `[NEEDS CLARIFICATION]` on REQ-PROVE-015 (does the win32 rename ceiling rise again?) resolved by the
  plan's U3 under reading B (four more 800 ms steps; ceiling ≥ 7 000 ms and < 9 000 ms), returned to
  the spec-author to close. Structural coverage (`spec-plan-coverage.mjs`): two findings in the plan
  (a `REMOVED: none` line read as a removal; one shorthand id list) fixed → **pass**, 16 units,
  `semanticReview: required` — done inline by the plan's writer: each requirement maps to exactly one
  implementing unit and back; the only competing reading found (REQ-PROVE-015) is the one above.
- 22:05Z spec committed as `17a32c9` (258 lines, no open marker). Note from the spec-author: the
  new win32 rename ceiling computes to about 8 688 ms with the 0.25 jitter (base 6 950 ms), inside the
  declared 7 000–9 000 ms band; the plan's "≈ 7.9 s" was an estimate, the band is the criterion.
- 22:06Z U0b DONE → cherry-picked d4f504f (eval docs currency; readmeCurrency gate; route of record; Codex profiles marked). Two Minor rows ledgered to U2c and U4.
- 22:07Z U10 DONE (private): currency helper built; dry run at v1.7.0 flagged DR-026, fact 4, the kickoff prompt, the constitution's SET-v2 citation, P6 (5 stale); after the fixes 4 remain (DR-026 and the kickoff prompt → the close; the constitution citation and P6 → Package 12C). 18,535 regenerable files (317,765,053 bytes) hashed and deleted; ignore rules added; committed in the private checkout (not pushed yet).
- 22:36Z U5 DONE → cherry-picked 1f5fafc (spec-status gate; three specs restamped; red-check flagged draft and worktree-lane; workspace-surface restamped on the CHANGELOG 1.1.0 evidence because its plan's stamp is unreachable). Tier-1: overlay-layers → shipped-with-1.1.0. Three Minor rows closed (2 rejected with reasoning, 1 fixed). Three heavy-suite timeouts seen on a loaded worktree, all green in isolation — environmental, the integration gate is the record.
- 22:44Z U0a DONE → cherry-picked 17c915f (cases-v6 byte-identical; SET-v7; profile claude→rubric-v7; successor test v5→v6 with red-check). Tier-1: eval-run.mjs --help names SET-v7 (5925b5c). Merged eval suites: 9 files, 1080 tests green. U1 (charter) dispatched in a worktree.
- 22:49Z U3 DONE → cherry-picked cbff030 (commondir-race retry; win32 rename budget 12 steps, ceiling 8,687.5 ms; the hook script's copy reconciled; learning recorded). Manifest conflict with U0b's sync resolved by regenerating (build+sync, check clean). One Warning open: the exhaustion test's real waits — follow-up round running.
