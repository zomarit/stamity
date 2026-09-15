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
   kickoff prompt, the unlocated always-review evidence row with the unlocated figure dropped, the untracked verifier bulk hashed then
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
- 00:58Z U2b DONE → cherry-picked 6bbe2de (default on-demand; measured: cursor 95 · claude 95 · copilot 95 · codex 407 lines; shared bytes 24 904 with codex / 5 192 without; codex drops 0 rules; skills list 5 570 of 8 000 characters; the APM package follows the delivery rule; 28 files). Derived files regenerated once more on the merged tree. One Warning open (a codex-demoted rule also lands in claude's native skills copy) → follow-up round to U2b. U11 DONE (private): driver pins for SET-v7/cases-v6, census 100/51/19/30/24/516/57, RESULTS §6b, amendment 10, canaries K3g/K4g accepted; the prepare line is ready. One Warning open (the advisory-repeat note) → follow-up round to U11.
- 00:50Z U11 follow-up DONE: advisory repeats computed against run 24 (a run24-vs-run24 sanity check finds 12 candidate rows; a real repeat in run 25 obligates a promote-or-delete disposition before run 26, the rule's own timing). Private driver committed (unpushed).
- 00:52Z Hand-page attestation: four read-only attestors, 187 claims — README 25 clear; CONTRIBUTING 31 clear; GOVERNANCE 16 clear + stale date; SECURITY 28 clear + the Codex hook clause stale; security-mapping 23 clear; packs-and-trust 15 clear; enterprise-forks 15 clear (+1 platform claim unverifiable in-tree); getting-started 13 clear + probe count stale; working-with-stamity 9 clear; customization 8 clear + a delivery sentence to add + a dateline; workspaces 9 clear; doctrine 10 clear + 2 false (ratchet direction; eight guides); troubleshooting 13 clear; migration 24 clear. U6 writer dispatched.
- 01:04Z U2b follow-up → cherry-picked f10eb0c (native skills tree per client; shared-tree duplicates disclosed). Regenerated on the merged tree; 24 suites, 765 tests green; check all green.
- 01:07Z U6 DONE → cherry-picked b34a864 (fourteen pages restamped at the 1.8.0 cut; doctrine, getting-started, SECURITY, customization, CONTRIBUTING, GOVERNANCE corrected; RELEASE_CUT_DATE 2026-09-15; full gate twice green). Tier-1: check.ts comment.
- 01:09Z Phase 4 Prove opened: the full gate (test-runner), the whole-branch review (frontier class) and the security lens dispatched in parallel; the spec merge is in flight.
- 01:15Z Full gate green (15 gates; 236 files, 47 commits). Spec merged at Prove (297 lines; structural coverage pass after REQ-PROVE-022 joined U7).
- 01:15Z Security lens: approve (0.86), four Minor findings ledgered for the fixer round; nine surfaces examined with no finding (the trust chain, the floors, fixture isolation, the lock window, the retry, the page inputs, the published controls, the rehype plugin, the checklist lines).
- 01:35Z Review round 1, Fixer A → cherry-picked 2236df4 (W1, W2, W8). The twins now measure the charter line's own promise; the decision rule is pre-registered in SET-v7; roster 99 (50/19/30; 23 floors; 502/57; appendix 79/27). Tier-1: three count literals + the emitted skill copy.
- 01:38Z U11 round 3 DONE: driver re-pinned (99 cases, 599 calls, SET-v7 08f29f82…); canaries K3i/K4i accepted; committed privately.
- 02:03Z Review round 1, Fixer B → cherry-picked 4f60e6e (S-1..S-4, W3, W4, W5, W6, W9, M1 partial with two reasoned rejections, M2..M8). Merged tree: 49 suites 2552 tests green on the affected areas; check all green. Round 2 review and the QA harness run dispatched.
- 02:06Z QA harness run at 2a24500: H1a passed (1 denied, 1 allowed); H1b not-run (codex exec loads no project hooks — measured); H1c not-run (cursor-agent: ENOENT); H1d not-run (copilot: ENOENT); H2 passed on five pages (axe 0 violations); H3a–d passed. Defect: inputHashes keys absolute (25 home-path occurrences) → fixer round; the harness re-runs at the corrected tree.
- 02:09Z Review round 2: request-changes (medium) — 21 of 22 round-one dispositions verified; one regression (N1: a tools-restricted rule could be delivered nowhere on a shared-tree client), one contested rejection (N2), four Minors (M-a..M-d) → round-three fixes dispatched to both fixers.
- 02:12Z Fixer A round 2 → cherry-picked 9e030ff (M-a, M-b, M-c; binding 503).
- 02:14Z U11 round 4 DONE: driver pinned to binding 503 and SET-v7 cb2eae0a…; canaries K3j/K4j; committed privately.

### Release checklist, third line — checked 2026-09-15T02:36Z (needs no publish)

- Repository description and topics read at the console API: the description names the four clients and
  the seven artifact classes this release still ships; nine topics; homepage `https://stamity.dev` — current.
- Admin roster: one account holds admin on the repository (the maintainer); the registry lists one
  maintainer account for `@zomarit/stamity`. Both rosters looked at this release.
- The morning sequence is one private script beside the 1.8.0 adaptation of the post-publication verifier
  (page markers moved to the pages this release changes: security mapping, measurements, doctrine
  amendments, capability matrix, and the two new pages in `llms.txt`); the usage probe is a scratchpad
  script; five-hour window 0.16 and seven-day 0.50 at 02:19Z — no capacity hold before run 25.

### Fixer B, rounds two and three — merged 2026-09-15T02:52Z

- `f38679c` relativizes every QA evidence `inputHashes` key to the repository-relative POSIX path
  (qa/1 closed). `ad2294c` closes review/22 (N1: a `tools:`-restricted rule is never demoted on a
  shared-tree client unless its `tools:` names every shared-tree reader; new export
  `SHARED_SKILLS_TREE_READERS` in the content layer), review/23 (N2: the APM glob reader goes through
  `declaredRuleGlobs`; `.apm/` byte-identical) and review/27 (M-d: a failed version probe no longer
  reads as present). Targeted suites after the cherry-picks: 58 files, 2,089 tests green; build and
  `stamity check` green; the sixteen leftover agent worktrees removed and pruned.
- Next: a round-three read of the N1 fix, the QA harness re-run at this tree, then the candidate.

### Review round three — 2026-09-15T03:18Z, request-changes

- The four round-two findings read closed (N1 for codex and copilot, N2, M-d, qa/1) — but the fixer's
  claim that claude's native copy keeps a `tools:`-restricted demoted rule was false: the projection
  skips such a rule before the native copy is derived, so on claude it is delivered nowhere; the code
  comment accepted that gap. Two new Warnings: the ratchet gate's fixture never reads `tools:` off a
  corpus file, and the `fixture/` label change has no failing-first test. Four Minors (guard attached
  by tool name; the absent-binary reason lost its plain framing; a signal-killed probe reads
  "exit null"; a cross-drive `--site` could still label an absolute path) and one ledger-only note.
  Rows review/28–35 opened; a fixer round dispatched for all but the ledger-only row.
- QA harness re-run at `a523958` (before the checklist wording commit, which touches no QA input):
  six rows passed, three not-run — Codex (`codex exec` runs no project hook headlessly), Cursor and
  Copilot (no CLI on this machine); every `inputHashes` key repository-relative, zero local paths;
  leak gate PASS across 7,609 files. The private human QA record for 1.8.0 is filed from the rendered
  form; the three human rows are UNPERFORMED per decision 3, each bound to its input hashes.

### Fixer C merged — 2026-09-15T03:02Z

- `36e17f0` makes the non-projectable-rule guard structural: `demotedRuleIds` computes it once and
  demotes such a rule on no client, claude included; the ratchet gate now reads `tools:` off each
  corpus file the way emission does, with a fixture proving a `tools:`-restricted glob-less rule is
  measured always-on. `debd691` exports the fixture-label helper with its failing-first test, restores
  the plain-language probe reasons, never renders "exit null", and refuses a `--site` outside the
  repository root before any row is measured. Rows review/28–35 closed (35 recorded as not actionable).
  Targeted suites: 93 files, 3,390 tests green; build, `stamity check` and the leak gate green; the
  ratchet constants unmoved; the worktree removed.
- The QA evidence measured at `a523958` is withdrawn (the probe-reason wording it carries is the old
  one); the harness re-runs at this tree and the candidate carries that file.

## Phase 1 closed — the candidate — 2026-09-15T03:12Z

- Review round four (2026-09-15T03:08Z): **approve**, medium-high — every round-three finding closed
  with `path:line` evidence; two Minors, both fixed inline in the small-change lane before this
  commit: the client row's exit now renders through the one helper that owns the null shape (commit
  `fix(qa): the client row's exit renders through the shared helper`), and the ledger's closure
  rationales cite the cherry-picked hashes. `Default applied: fix the two round-four Minors before
  the candidate or record them → fix (the run files no "Minor, later").`
- QA harness at `850ff8d` (this tree minus that rendering fix and the records): six rows passed
  (H1a, H2, H3a–d), three not-run and human (H1b Codex, H1c Cursor, H1d Copilot), every row bound
  to its input hashes; evidence `.stamity/evidence/qa-850ff8d2727760f1cf54eac779788e61c15652f3.json`
  is committed here; the rendered form is filed privately with the human rows UNPERFORMED per
  decision 3. The `/st-work` QA checkpoint (the walk-through table, auto-prove pass and the open
  sign-off) is appended to this record when its pass returns; it changes no file in the tree.
- Freeze: from this commit nothing under `content/`, `evals/`, `scripts/eval/`, `src/`, `docs/`,
  `website/` or the workflows changes; Phase 2 measures this tree — run 25 on the route of record,
  the release dry run, the pack signing rehearsal, CI on every leg, the full local gate.

## Phase 2 — freeze and measure (candidate `f2b90dc8194ad12d423534c1b021be84c645337c`)

- 02:57Z — branch pushed; draft PR #36 opened; release dry run (34923118084) and CI (34923118732),
  PR checks (success) and the docs-site build (success) dispatched on the candidate.
- The pack signing rehearsal workflow is pinned by name to the 1.7.0 candidate branch, which no
  longer exists on origin, so its dispatch on this branch skipped every job. The pack code, the
  rehearsal script and the workflow are byte-identical to v1.7.0, and the rehearsal signs a fixed
  source identity rather than the checkout, so it was run by pushing the candidate commit under
  that pinned ref name and dispatching there (run 34923283007); the ref is deleted once the run
  completes. `Default applied: rehearsal pinned to a deleted branch → run it at the candidate under
  the pinned name, no workflow edit (the workflows are frozen; unpinning is named at the close).`
- **Run 25** (`prepare` at 02:57Z, route of record, SET-v7 over cases-v6, judge claude-fable-5-1,
  scenarios claude-opus-5): terminal at calibration — fixture C3's judge matched the case verdict
  (FAIL) but graded binding B1 pass against the human label fail; the task bytes were identical to
  run 24's C3 (same sha256, 13,272 bytes), so the mismatch is judge variance on one label. Per the
  protocol a calibration label mismatch is final and never re-rolled; the run scored nothing and is
  retained. C4 admitted on its second attempt after a retryable admission failure on the first.
- **Run 26** (`prepare` at 03:01Z, same candidate, same pins): calibration 5/5 matched (C4 again on
  its second attempt, same retryable reason); scoring started 03:02:16Z. Runs 25 and 26 spend two of
  the three-run budget.
- QA checkpoint (`st-qa`, pinned to `f2b90dc`): 43 rows derived; 34 auto-proven from the run's test
  runner with cited assertions and from the harness evidence; 9 rows left for a person, 71 minutes
  in one session (Codex hook trust and observation; the three clients opening an on-demand rule
  skill; the three new pages at 375/1440 in both themes; a 1.7.0-synced repository re-synced by the
  candidate); sign-off **OPEN — the maintainer's walk**; rollback named per row. Its findings that are
  not walk rows: the harness page list omitted the three pages this release adds (fixed in
  `7260652`, the harness re-measures at this tree once the full gate completes — `scripts/qa/` is
  outside the freeze), and the spec's REQ-PROVE-011 roster sentence reads four twins where the tree
  holds three (corrected in the cut commit with the spec's status, a record of what shipped).
- 03:05Z — full local gate at `f2b90dc` (the test runner): lint, typecheck, `npm run test -- --coverage`
  (208 files, 8,404 tests passed, 2 skipped; statements 96.48 %, branches 89.84 %, functions 98.72 %,
  lines 97.34 %; every per-file floor held), build within both size budgets, leak gate PASS across
  7,609 files, knip clean, `sync` 0 created / 0 updated and `check` all green, website typecheck and
  build green, `npm run check` exit 0. Release dry run 34923118084: gates and pack, APM route smoke
  and the dry-run summary green, publish skipped as designed. Pack signing rehearsal 34923283007:
  success; the transient ref deleted. CI 34923118732: every leg green except the Windows leg still
  running at this line.
- 03:09Z — the harness re-measured at `c0e129f` over eight pages (the three this release adds
  included): H2 accessibility tree and scanner — every structural check holds and zero violations on
  all eight; H3a–d keyboard journeys at 375 and 1440 in both themes — every focus stop visible and in
  DOM order; H1a passed; H1b–d not-run and human, unchanged. Evidence
  `.stamity/evidence/qa-c0e129f07de5faf4e7b599cf8e6999aceea48f0d.json` replaces the five-page file
  (H2/H3 rows re-bound to the eight page hashes); no local path in it; leak gate PASS across 7,610
  files. The private QA record is re-rendered from it.
- 03:10Z — CI 34923118732 on the candidate: every leg green except **Windows**, where six tests in
  two files added tonight failed — five in `test/qa/hookRuns.test.ts` whose fixture binaries are
  POSIX shell scripts `spawnSync` cannot execute there, and one in `test/cli/docs/measurements.test.ts`
  whose fixture directory name carries a `|`, a character Windows filenames forbid. The local gate
  is weaker than CI (the recorded learning): both are test-only defects, fixed under `test/` outside
  the freeze; CI re-runs on the corrected head, and the tag waits for the Windows leg.
- 03:25Z — `412e1aa` (test-only): the hook-probe fixtures are `.cmd` batch files on win32 and shell
  scripts elsewhere (the probe spawns without a shell, so Windows resolves through PATHEXT and never
  runs a shebang script); the signal-killed probe case is skipped on win32 with its reason, the render
  being covered by the pure `exitDescription` test on every platform; the measurements rule's
  code-span case uses a backtick-only name legal on every filesystem and its table-cell case proves
  the pipe against the pattern through a mocked directory read. A branch-wide sweep for the two
  hazards found no other unguarded instance. Local suites 9 files / 224 tests green; pushed; CI
  34924889728 runs on this head.

## Phase 2 outcome — run 26 held on capacity (2026-09-15T03:35Z)

- Run 26 had admitted 266 of its 599 calls (268 attempts) when the driver's capacity guard recorded a
  hold: the account's seven-day window that includes overage read 0.98 (five-hour 0.89, seven-day
  0.63; every call still `allowed_warning`, none rejected). The guard holds pre-emptively at 98 % of
  any window until that window's reset, capped at twelve hours — here until 15:35Z — and re-reads the
  next call's rate-limit event when it resumes; the seven-day windows reset on 2026-09-20T05:00Z, so
  the run cannot complete by itself before then unless that window falls below 98 % or the guard's
  policy for the overage-included window changes, which is the maintainer's decision, not this run's.
  `Default applied: a window at 98 % → respect the capacity guard (the maintainer's decision 8); no
  driver change, no third run tonight.`
- Runs 25 and 26 are retained in full under the private driver's run directories (every attempt,
  capture and journal). Run 25's terminal artifact is exported and committed as
  `evals/runs/2026-09-15-run-25/` (status BLOCKED at calibration, nothing scored); run 26's export
  follows its completion, from a worktree at the candidate.
- Consequence for the cut (decision 11's own clause): **no tag tonight.** The PR is left green with
  the candidate measured by every gate except the eval run; the one input the release needs is
  capacity for run 26's remaining 333 calls. Nothing else is missing: the dry run, the signing
  rehearsal, the full gate and the QA harness are green; the CHANGELOG section, the version restamp,
  the spec-status flip and the morning sequence are prepared and wait for the run's PASS.
- 03:50Z — CI 34924889728 on `412e1aa`: the measurements case green on Windows; the four hook-probe
  cases still red there, because a shell-less `spawnSync` on Windows resolves only `.exe`/`.com` — a
  `.cmd` fixture, like the `.cmd` shims npm installs for the real clients, is invisible to it. The
  honest repair is in the harness, outside the freeze: on win32 the ENOENT reason now names that
  limitation (`WINDOWS_PROBE_LIMIT`) instead of reading as "absent"; the four fixture-executing
  cases skip on win32 with the reason, a win32-only case pins the statement against a `.cmd` shim on
  PATH, and a platform-injected case covers the branch everywhere. macOS evidence is unaffected (the
  suffix applies to win32 only). Small-change lane; verification delegated to the suite and CI.
