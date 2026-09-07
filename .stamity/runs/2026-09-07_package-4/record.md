# Run record — Package 4 "Review" (2026-09-07)

The adversarial review over the whole accumulated diff of Packages 3, 5, 6, 8 and the Package-8
closeout (`bc64867..e3003f7`: 43 commits, 439 files, +37,390/−2,502), the decision batch the
closeout reserved, four fix rounds to approval, a Minor pass, then the release. The findings ledger
is `ledger.jsonl` beside this file; the echo's QA captures are `qa-evidence.json`; the eval run the
release carries is `evals/runs/2026-09-07-run-7/`. Every finder, lens, skeptic and reviewer ran at
`claude-fable-5-1`; every fixer, test-runner and loader at `claude-opus-5` (attesting
`claude-opus-5[1m]`); no agent was dispatched by a tier alias.

## Outcome

**Approved, cut as 1.2.0, ready to merge.** The whole-branch review opened at request-changes (0.85):
13 finders and lenses raised 56 findings (1 Critical, 23 Warning, 32 Minor), 48 skeptic votes held 19 of
the 24 Critical/Warning findings and downgraded 5, and the deep review held 21 at fix. Four fix rounds and a
Minor pass took the re-review to approve at 0.92 with every lens clean; a CI-and-docs round then repaired
the two timing-bound tests and the Windows lock assertion the pushed head exposed, and a five-pass
re-attestation of the twelve hand pages corrected fifteen false claims at their sources until every page
cleared. The maintainer answered the four reserved questions in the session's question window (no default
applied): three rules stay as written, the after-Enter echo is built. The release run of the eval set
(run 7, `evals/runs/2026-09-07-run-7/`) is red on two of its four metrics under the strict rule and ships
under a decision row in the private layer naming its seven cases, which is the standing release rule. CI is
green at `a60fe02` on all three workflows; the release cut (version 1.2.0 across the ten version carriers,
the CHANGELOG section, twelve hand-page banners, the docs suite's cut-date pin) passes every gate locally.
What follows this record is the flow's own tail: the rebase-merge of PR #14, the `v1.2.0` tag at main's
new head, and the publish job, which waits on the maintainer's environment approval.

## Proof block

### Gate results (test-runners `claude-opus-5[1m]`, exits unmasked)

| Pass | Result |
|---|---|
| Baseline at `e3003f7`, before the review (orchestrator) | build 0 (logic 1,066,706 of 2,097,152; corpus 519,012 of 1,572,864) · leak gate 0 hits over 849 files · typecheck 0 · lint 0 · knip 0 · `npm test -- --coverage` 176 files / 6,768 passed / 1 skipped, every floor met · `check` drift clean · APM `--check` 0 · website typecheck and build 0 |
| After fix round 1 | twelve gates green: 6,784 tests, coverage floors met, drift clean, plugin/pack/APM manifests in sync, docs regeneration idempotent, site built |
| After fix round 2 | twelve gates green: 6,800 tests |
| After fix round 3 | eleven gates green: 6,800 tests |
| After fix round 4 | eight gates green: 6,802 tests; leak gate 0 hits over 851 files |
| After the Minor pass | nine gates green: leak gate, typecheck, lint, knip, tests + coverage, the built CLI's doctor, the APM package check, docs regeneration idempotency (two runs, diffed), worktree status |
| CI on the pushed head `25f5fae` | **red**: two in-process leak-gate tests over the 10 s test timeout on the floor and LTS legs; the POSIX lock-create assertion failing on the Windows leg |
| After the CI-and-docs round (`71af3e6`, `7093171`, `7644766`) | eight gates green; the gate's two normalized views come from one traversal (11.4 s → 3.3 s over the tree) with a measured 30 s budget for the embedded runs; the lock-create tolerance pinned on both platform branches |
| CI on the pushed head `a60fe02` | **green** on all three workflows: Docs site 34152697791, CI 34152697773 (floor, LTS and Windows legs), PR checks 34152697745 |
| The cut tree (this record's sibling commit), orchestrator | build 0 · leak gate 0 hits for 18 rules across 854 files · typecheck 0 · lint 0 · knip 0 · `npm test -- --coverage` 176 files / 6,804 passed / 1 skipped, every floor met · `check` drift clean · APM, plugin and pack `--check` all verified at 1.2.0 · website typecheck and build 0 |

### Review verdicts, per round (reviewers and lenses `claude-fable-5-1`)

| Round | Verdict | Confidence | Findings | Disposition |
|---|---|---|---|---|
| Finders (10 region/cross-cut + 3 lenses) | — | — | 56: 1 Critical, 23 Warning, 32 Minor | two skeptics per Critical/Warning (48 votes): 19 confirmed, 5 downgraded, 0 refuted by both |
| Whole-branch deep review | request-changes | 0.85 | 21 held at fix, 3 deferred at Minor, 0 rejected, 0 new | fix round 1 |
| Re-review 1 | request-changes | 0.88 | 44 closed; 3 held (the changelog, the calibration-excision record clause, the CONTRIBUTING stamp) | fix round 2 |
| Lenses after round 1 | security: 1 Minor · design-quality: 1 Warning (a 0-column TTY blanked every menu), 1 Minor | fix round 2 |
| Re-review 2 | approve | 0.90 | 3 new Minors suppressed and ledgered | — |
| Lenses after round 2 | security: 1 Minor · design-quality: 1 Warning (the echo cut the answer first at narrow widths), 2 Minors | fix round 3 |
| Re-review 3 | approve | 0.90 | 2 Minor observations | — |
| Lens after round 3 | design-quality: 1 Warning (16 characters lost at the 80-column default) | fix round 4 |
| Re-review 4 | **approve** | **0.92** | 0 new; the shipped kit driven against an `e3003f7` copy across 31 scenarios — every non-Enter path byte-identical | the loop converged |
| Lens after round 4 | design-quality: 0 findings, re-measured on a real pty at 40/60/80/200 columns in colour and under NO_COLOR | — |
| Minor pass re-review | **approve** | **0.92** | 0 new | the Minor pass closed 5 ledgered Minors (the size figure of record, the sync goldens, the CHANGELOG section) |
| CI-and-docs round re-review | approve | 0.90 | 0 new | the timing and platform fixes reviewed as a change set of their own |
| Re-attestation, pass 1 (12 attestors, one per hand page, at `25f5fae`) | — | — | fifteen false claims across the twelve pages | corrected at their sources in `7644766` |
| Re-attestation, passes 2–5 (7, 2, 1 and 1 attestors) | — | — | SECURITY.md kept surfacing new false absolutes (2, 2, 2) until a fixer swept every absolute on the page | the fifth pass clears: 108 claims checked, none false; every other page cleared on pass 2 |

### Decisions trace

- **The batch, answered by the maintainer** (2026-09-07, in the session's question window, no default applied): Q1 the eval's per-case scoring rule → strict all-samples stays; Q2 the injection-screening discriminator → the rule stays as written; Q3 st-rework's unanswered-rationale default → stays as written; Q4 the after-Enter answer echo → **built** (the maintainer's pick over the declared default), a user-visible byte change on the after-Enter line only, every frame before Enter byte-identical.
- **Assumption stated, not asked:** the release is 1.2.0, a semver minor (new capabilities; nothing breaks a published contract). Dependabot PRs #15, #16 and #17 sequence after the release on the maintainer's click, #16 (the pack-trust verifier's major bump) behind its own review; the website's three alerts stay recorded facts.
- The round-4 fixer ran at `claude-opus-5`, the class the ids of record fix for fixers; the flow's round-4 escalation exists to break a repeated blind spot, and each round's finding was new.
- The review workflow's own script failed after all 62 agents completed (a hoisting defect in its last line, repaired in the script file); every result was read from the journal, nothing re-run.
- Deferred with rationale: `eval-instrument#3` (the quick twin's B2 admits a tool-free not-done: the twin still fails a lane change or a refusal, and both skeptics refuted the load-bearing supports), `eval-cases#1` (the performance case's B6 grades a Brief-seeded fact as unlocated: a decidability gap, not leniency), `records#4` (two ledgers close with an `open` row: the QA checkpoint is open by the st-qa rule's own instruction), the run-3 artifact's trailing blank line (an immutable artifact), and the echo renderer's two-column and double-space edges (no terminal the product ships to).

### Artifacts touched, with the owning sub-agent

Every product-file edit was a sub-agent's; the orchestrator wrote run records, the run-7 artifact
rendered by the harness, and the release cut (a script over the version carriers, the CHANGELOG heading,
the banners and the docs suite's cut-date pin).

| Commit | What it carries | Owner |
|---|---|---|
| `539efc6` fix(handoff) | `resume --dry-run` previews the status advance instead of taking it | fixer, round 1 |
| `029808e` feat(cli) | the after-Enter echo (the maintainer's Q4), a zero width read as unknown, the re-ask sanitising C1 | fixers, rounds 1–4 (each design-quality finding its own round) |
| `c901154` fix(merge) | a checkout that translated line endings is not a hand edit; `.gitattributes` | fixer, round 1 |
| `64bb18c` fix(hooks) | the review-gate waiters no longer read a live holder inside its own retry budget as dead | fixer, round 1 |
| `ca09689` fix(gate) | the private-id rule matches every row of a sequence, in every spelling | fixer, round 1 |
| `647f9f9` feat(corpus) | st-rework reports L4 and files a board-parsable row; ingress hits name what a screen can know | fixers, rounds 1–2 |
| `7e2d2f1` test(evals) | the two-run advisory repeats resolved, the floor case's boundary anchored, the record made checkable | fixers, rounds 1–2 |
| `67650f4` docs | every claim the review found false against the tree, corrected where it was made | fixers, rounds 1–2 |
| `539d5fc` fix(site) | the copied-state announcement armed per control | fixer, round 1 |
| `a4f3d9d` chore(run) | the earlier run records corrected where they claimed more than the tree proves | fixer, round 1 |
| `14cf6b7` chore(sync) | the manifest and both goldens after the fix rounds, with their ledger rows | sync writer |
| `6f5b899` build(size) | one pinned measurement; the `[size]` line as the figure of record; `.mjs`/`.cjs` chunks counted as logic | fixer, Minor pass |
| `25f5fae` docs(changelog) | the Unreleased section names what the branch ships | fixer, round 2 |
| `71af3e6` perf(gate) | both normalized views from one traversal; a measured budget for the embedded gate runs | fixer, CI-and-docs round |
| `7093171` test(hooks) | the lock-create tolerance pinned on both platform branches | fixer, CI-and-docs round |
| `7644766` docs | fifteen claims the re-attestation found false, corrected at their sources; the SECURITY.md sweep | fixers, CI-and-docs round and docs rounds 2–4 |
| `a60fe02` test(evals) | run 7, the release run: `RESULTS.md` and `samples.jsonl` | the harness (orchestrator-run; loaders and judges as attributed below) |
| this record's commit | `record.md`, `ledger.jsonl`, `qa-evidence.json` | orchestrator |
| the release cut | version 1.2.0 across the ten carriers, the CHANGELOG heading and figure, twelve banners, the cut-date pin | orchestrator, by script |

### Per-action attribution

| Role | Count | Attested id |
|---|---|---|
| finders and lenses (review) | 13 | `claude-fable-5-1` |
| skeptics | 48 | `claude-fable-5-1` |
| whole-branch deep review and re-reviews 1–4 and the Minor pass | 6 | `claude-fable-5-1` |
| lenses after the fix rounds (security, design-quality) | 4 | `claude-fable-5-1` |
| scenario probes in fix round 1 | 2 | `claude-fable-5-1` |
| re-review of the CI-and-docs round | 1 | `claude-fable-5-1` |
| hand-page attestors, five passes | 23 | `claude-fable-5-1` |
| fixers | 28 (12 + 9 + 3 + 1 + 1 across the rounds and the Minor pass; 3 in the CI-and-docs round; 1 in each docs round) | `claude-opus-5[1m]` |
| sync writer | 1 | `claude-opus-5[1m]` |
| test-runners | 6 (one per fix round, the Minor pass and the CI-and-docs round) | `claude-opus-5[1m]` |
| eval run 7: loaders, scenarios | 222 (15 loaders, 207 scenario runs) | `claude-opus-5[1m]` |
| eval run 7: calibration and judge calls | 212 (5 calibration fixtures, 207 judge calls; 0 redone) | `claude-fable-5-1` |

Evidence classes: the workflow journals are native artifacts (kept in the private layer's run directory); the gate outputs are the runners' quoted command results; the pty captures are files.

### Recommended next step — derived from this run's own state

Merge PR #14 by rebase, tag `v1.2.0` at main's new head and push the tag. The release workflow re-proves
version equality and tag ancestry and holds the publish job for the maintainer's approval in the
`npm-publish` environment; fifteen minutes after publish, the release-currency instance in the private
layer takes its registry rows. Then, on the maintainer's click, Dependabot #15 and #17; #16 (the pack-trust
verifier's major bump) behind its own review. The next package inherits run 7's seven red cases and its
eight advisory two-run repeats, plus the five deferred Minors in the ledger.

## QA walk-through (the human checkpoint)

The user-visible change this package ships is the after-Enter echo on the raw-mode menus (Q4). It was
driven on a real pty at 100 columns against the round-4 build with the shipped kit; the raw captures are
kept in the private layer's run directory and `qa-evidence.json` beside this file summarises them.

| Leg | Terminal | What the capture shows |
|---|---|---|
| `echo-color` | colour, `TERM` set | the question reached; after Enter, one echo line and seven SGR sequences (the dim answer under the bold question); the frame rewound six rows and cleared before the echo |
| `echo-nocolor` | `NO_COLOR=1` | the question reached; after Enter, one echo line and zero SGR sequences; the same six-row rewind |
| `typed-dumb` | `TERM=dumb` | the typed fallback: zero escape sequences in the whole session |

Every frame before Enter is byte-identical to the `e3003f7` build across the 31 scenarios re-review 4
replayed; the design-quality lens re-measured the echo on a real pty at 40, 60, 80 and 200 columns in
colour and under `NO_COLOR` and returned no finding.

**Human checkpoint:** the maintainer's approval of the publish job in the `npm-publish` environment is the
checkpoint this run closes on. It is open at this record's writing, by the checkpoint rule's own
instruction: the record reports it open rather than closing around it.

## Not done

- **Run 7 is red on two of four metrics under the strict rule** (the golden floor conjunction false on two
  golden floors; guardrail 11/12 from the MCP directive case at 0/3 after this package's own rewrite of it).
  It ships under a decision row in the private layer naming the seven cases, per the standing release
  rule; no case text moved after the scores were known. The seven cases and the eight advisory two-run
  repeats are the next package's.
- **Five Minors deferred with rationale**, each ledgered: `diff-anomaly-hunt` (a blank line in an immutable
  artifact), `eval-instrument#3`, `eval-cases#1`, `records#4`, `r4-minor-echo-edges`.
- **The publish is the maintainer's click.** The tag and the merge are the flow's next steps after this
  commit; the release-currency instance's registry rows wait fifteen minutes after publish.
- **Dependabot #15, #16, #17 are not merged**; they sequence after the release. The website's three
  Dependabot alerts stay recorded facts (image-size, high, no patched version; qs, medium, patched in
  6.16.0 and carried by a Dependabot PR).
