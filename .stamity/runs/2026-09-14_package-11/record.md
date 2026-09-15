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
   and a row superseding the always-on ratchet decision of 2026-09-02 goes to the handoff; a floor falls → the option is reverted, the
   evidence stays under `evals/runs/`, the set re-runs. The 150-line anchor is re-verified tonight and
   re-anchored by a decision-row proposal only; doctrine text is not edited tonight.
2. Charter invariants version 1.0.0, ratified 2026-08-31, last amended from git history (2026-09-13).
3. Human QA: automate what the vendors document; bind the remaining human rows to input hashes; four
   client fixtures and the QA form prepared against the Phase 2 candidate; rows that stay human are
   accepted UNPERFORMED for 1.8.0 by the instruction and reopen only when their inputs change.
4. Record currency: public gates, every named public carrier fixed, hand pages re-attested at the
   candidate tree; private carriers as listed (dashboard fact 4, the st-learn trigger ledger row, the peers-brief ledger row, the two L2 rows, the
   kickoff prompt, the unlocated always-review evidence row with the "~48%" figure dropped, the untracked verifier bulk hashed then
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
- 22:07Z U10 DONE (private): currency helper built; dry run at v1.7.0 flagged the Package 10 directive row, fact 4, the kickoff prompt, the constitution's SET-v2 citation, P6 (5 stale); after the fixes 4 remain (the Package 10 directive row and the kickoff prompt → the close; the constitution citation and P6 → Package 12C). 18,535 regenerable files (317,765,053 bytes) hashed and deleted; ignore rules added; committed in the private checkout (not pushed yet).
- 22:36Z U5 DONE → cherry-picked 1f5fafc (spec-status gate; three specs restamped; red-check flagged draft and worktree-lane; workspace-surface restamped on the CHANGELOG 1.1.0 evidence because its plan's stamp is unreachable). Tier-1: overlay-layers → shipped-with-1.1.0. Three Minor rows closed (2 rejected with reasoning, 1 fixed). Three heavy-suite timeouts seen on a loaded worktree, all green in isolation — environmental, the integration gate is the record.
- 22:44Z U0a DONE → cherry-picked 17c915f (cases-v6 byte-identical; SET-v7; profile claude→rubric-v7; successor test v5→v6 with red-check). Tier-1: eval-run.mjs --help names SET-v7 (5925b5c). Merged eval suites: 9 files, 1080 tests green. U1 (charter) dispatched in a worktree.
- 22:49Z U3 DONE → cherry-picked cbff030 (commondir-race retry; win32 rename budget 12 steps, ceiling 8,687.5 ms; the hook script's copy reconciled; learning recorded). Manifest conflict with U0b's sync resolved by regenerating (build+sync, check clean). One Warning open: the exhaustion test's real waits — follow-up round running.
- 22:52Z U3 follow-up → cherry-picked 4faca2e (deterministic rename-budget tests). Ledger row build/11 fixed.
- 22:53Z U8 built (cdb5e0c) but BLOCKED_AMBIGUITY on the merge clause (unsatisfiable: no PR numbers in CHANGELOG; rebased shas not ancestors) → Default applied: option 3 (the strategy's own definition of verified; merge evidence per run as a column). BLOCKED_DEPENDENCY on the security-mapping registrations → reassigned to U9. Follow-up round running; rate expected 5 of 7 (0.714) over a 7-run denominator, 16 excluded with reasons.
- 22:55Z U2a DONE → cherry-picked 34a3285 (ruleDelivery option, default always-on; rule-as-skill projection; codex folds only floors; skills-list budget; 19 files; full gate green 7988 tests). Tier-1: vendor citation on the budget constant. Spec amendment queued (REQ-PROVE-001 exit code).
- 22:58Z U7 DONE → cherry-picked 23ce661 (QA harness: keyboard journeys, a11y tree + axe, hook runs, binding, form; 21 tests; playwright 1.63.0 + @axe-core/playwright 4.13.0 pinned in website/). Harness run at 949bde9: H1a claude passed (1 denied, 1 allowed); H1b codex failed (hook never invoked under codex exec); H1c cursor not-run (no headless CLI); H1d copilot not-run (not on PATH); H2 failed (52 th without scope); H3a-d passed. Two follow-ups dispatched: the codex-hooks vendor read; the site th-scope plugin.
- 22:59Z U8 follow-up DONE → cherry-picked cdb5e0c + 56a5b92 (measurements page: verified merge-ready rate 5 of 7 (0.714) over 7 qualifying records, 16 excluded with reasons; reach proxy snapshot 2026-09-14; llms/sidebar/README map registrations for measurements; llmsIndex pins). U9 (security mapping) next.
- 23:01Z U8 merged (e8f91aa, b3bb264) but the page's live-record input fails on the merged branch (this run's record moves it) → third round: snapshot input. U9 (security mapping) dispatched.
- 23:02Z Codex hooks research: the emitted .codex/config.toml never enables features.hooks (vendor default off) and the operator text omits the flag → fix unit dispatched (emit the flag, state the three trust steps, run the exec experiment, set the harness row on the result).
- 23:06Z U8 third round → cherry-picked c5abdbd (snapshot input; 34 tests; docs idempotent on the merged branch). Tier-1: the checklist's fifth per-release line (snapshot refresh).
- 23:12Z th-scope unit DONE → cherry-picked 6fe21d8 (every rendered table header cell carries scope; H2 passes; H3a–d unchanged). Finding on the isolation primitive: the client's worktrees are not always cut from the feature branch — three of the eleven started from `main` — so every worktree brief from here carries "merge the branch first", and the three units in flight were told so (a no-op where the branch already is the base).
- 23:28Z U9 DONE → cherry-picked 947c7c5 (docs/security-mapping.md: 7 surfaces, 30 catalogue ids, NIST subcategories quoted, 30 symbol addresses verified; SECURITY rows cite runs 34758487370 and 34771477218; registrations; README_MAX_LINES 157). Orchestrator defect fixed first: six private ids respelled in the record and plan, ledger rows to the seven-field schema — leak gate and ledgers test green again.
- 23:30Z The committed ledger held open rows (the records gate) → the write-ahead ledger is untracked until the close; the record stays committed.
- 23:31Z Codex hooks unit DONE → cherry-picked d38a292 (features.hooks emitted and proven read; three trust steps stated; codex exec loads no project hooks headlessly → H1b not-run with the measured reason; learning recorded). Follow-up to the header-scope unit: the plugin becomes plain .mjs so the test runs without the site's dependencies (CI installs none).
- 23:38Z Header-scope follow-up → cherry-picked 646e199 (plain .mjs plugin; test green without the site's dependencies).
- 23:51Z U1 DONE → cherry-picked 25a4c5a (invariants 1.0.0 line in every charter; hash gate; check doctor row; doctrine amendments; GOVERNANCE bump rules; charter 95 lines; ratchets +3 with reason; four charter cases' sources +4). Goldens conflict with the Codex fix resolved by regeneration on the merged tree.
- 23:52Z B2 dispatched: U4 (eval rows + ordering reader) and U2b (always-on re-measurement, default on-demand) in worktrees with merge-first. Usage 23:52Z: five-hour 0.49, seven-day 0.43.
- 00:13Z U4 DONE → cherry-picked cbfedfe (three obligations at the point of production; four Briefs re-quoted; ordering-criterion tagging with a 27-grade run-24 replay moving no verdict; README paragraph rewritten). Tier-1: the rubric-v5 README row. U2c (new cases) dispatched.
- 00:35Z U2c DONE → cherry-picked 30ea461 (18 rule-skill probes + 4 charter-only twins; roster 100 = 51 golden · 19 adversarial · 30 probes, 24 floors, 516 binding / 57 advisory, appendix 82 rows across 28 cases; recall label from source; runner skill and checklist counts moved). Tier-1: README v5 sentence. U11 (driver pins) dispatched.
