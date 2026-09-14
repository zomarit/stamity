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
