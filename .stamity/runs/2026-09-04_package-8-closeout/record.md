# Run record — Package 8 closeout (2026-09-04)

The run that closes every deferral the Package 8 record carried. It follows the plan artifact
`docs/plans/002-package-8-closeout.md`; its findings ledger is `ledger.jsonl` beside this file,
its QA captures are `qa-evidence.json`, and the prior run's record at
`.stamity/runs/2026-09-04_package-8/` is read-only to it. Every row of that record's `Not done`
list is closed below or named in this record's own.

## Outcome

Nine units, all shipped on `closure-run-execution` (PR #14 stays open): the review-gate counter's
sharing-fault handling (`e7344f1`), the dumb-terminal colour rung (`7c7b1d2`), the three site
theme items (`e117788`), the logic bundle's documentation-comment strip with the ceiling held
(`cfeb706`), the corpus hardening for the failing eval cases (`ef1ea58`), `SET-v4` with the six
closing lines' golden cases and every carried defect resolved (`18bbcbf`), the plan (`83196c2`),
run 5 over the full set (`31ec407`, then the run-5 repairs `7dd32c3` and `38c0be9` and run 6 over the affected slice `a98656b`), and the seven human QA rows driven and captured. The
review loop converged at approve 0.85 (round 2) and 0.90 (round 3, after the Minor pass).

## Proof block

### Gate results (the sync writer, the pre-fix step and the Minor fixer, `claude-opus-5[1m]`, exits unmasked)

| Gate | Command | Result |
|---|---|---|
| Leak gate | `npm run gate` | pass — 0 hits for 18 rules across 844 files |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Dead code | `npm run knip` | exit 0 |
| Tests with coverage | `npm test -- --coverage` | exit 0 — 176 files, 6765 passed, 1 skipped; statements 96.31%, branches 89.48%, functions 98.59%, lines 97.22% |
| Site | `cd website && npm run typecheck && npm run build` | exit 0 / exit 0 |
| Dogfood | `node dist/cli.js check` | all green, drift clean |
| Build size | `npm run build` | logic 1,064,549 of 2,097,152 bytes; corpus 518,510 of 1,572,864 |
| CI on `18bbcbf` | GitHub Actions, three workflows | green on all three (CI 33918417978 with the Windows leg passing the fixed hook's first roll; Docs site 33918417973; PR checks 33918418010); green again on all three at `38c0be9` (CI 33924461528, Docs site 33924461524, PR checks 33924461541) |

The one red gate the sync writer met — the codex byte-cost tripwire after the charter's +70-byte
net-zero reflow — was fixed in the pre-fix step (constants and the capability matrix regenerated,
red then green) before the first review round.

### Review verdicts, per round (reviewer and lenses `claude-fable-5-1`; fixers `claude-opus-5[1m]`)

| Round | Verdict | Confidence | Findings | Disposition |
|---|---|---|---|---|
| 1 reviewer | revise | 0.82 | 4 Warning, 3 Minor | Warnings fixed in fix round 1 |
| 1 security lens | approve | 0.80 | 3 Minor | ledgered, then fixed or dispositioned in the Minor pass |
| 1 design-quality lens | revise | 0.86 | 1 Warning, 2 Minor | Warning fixed in fix round 1 |
| 1 performance lens | approve | 0.85 | 3 Warning, 1 Minor | Warnings fixed in fix round 1 |
| 2 reviewer | approve | 0.85 | 1 Minor | ledgered |
| 3 reviewer (after the Minor pass) | approve | 0.90 | none | — |
| repairs 1 reviewer | revise | — | 1 Warning, 3 Minor | the performance case's B6 exemption narrowed (the glosses stay graded) |
| repairs 2 reviewer | approve | 0.88 | none | — |

Two later rounds reviewed the run-5 repairs (approve 0.88 after one narrowing). Fix round 1 closed seven Warnings at cause: the live region announcing the resting label on a
repeat click; the counter's stat collapsing absence and fault; the plan's undelivered U2 test
criterion and the twin's claim line disagreeing with its rewritten criteria; the bundle canary
blind to sub-directory chunks and the stale 25-second margin claim; the plan's drift from the
shipped identifiers. The Minor pass closed nine of ten Minors and held one by decision (the
unanswered-rationale corner of st-rework, a product question the operator weighs).

### Decisions trace

Every question the research flagged was resolved by the orchestrator under the question
protocol's unattended branch; each is a row in `ledger.jsonl` under `decisions/`.

- Default applied: the counter fix's scope → option 1, all six errno sites (the shipped hook
  becomes correct; the golden cost is the same as any byte change).
- Assumption taken: the benign state-note twin moves to the injection-screening rule as written
  (a reported low-severity finding that still uses the note's content is not a refusal). Reading
  dropped: narrowing the rule — a security floor's reporting with no operator statement.
- Default applied: "in the same sentence" stays literal, with a template → option 1.
- Default applied: an unanswered Critical-deferral rationale → the deferral stands and the row
  waits, the run closing on the unwritten row as its open item (the only reading compatible with
  the case's six binding criteria). Raised to the operator as a product question.
- Default applied: charter and rule text net-zero under the always-on ratchet → option 1; the
  three rule reflows not applied (one is the twin question; two are resolved on the case side).
- Default applied: the recovered bundle headroom is banked, the 2 MiB ceiling held → option 1.
- Default applied: the palette computed against the measured light ground `#fbfbfd`; no
  classDef for the decision diamond (the page's 150-line budget binds).
- Assumption taken: the after-Enter answer echo stays a follow-up (the original request bound
  the menus to byte-identical behaviour). Reading dropped: building it under "finish all".
- Read as a defect, not a design change: TERM=dumb painting bold and yellow where 1.1.0 wrote none.
- The prior brief's phrase "fails closed" for the lock was the orchestrator's error; the hook's
  recorded posture is fail-open on a terminal fault, and the implementer kept it.

### Artifacts touched, with the owning sub-agent

| Path | Owner |
|---|---|
| `src/hooks/scripts.ts`, `test/hooks/scripts.test.ts`, `.stamity/generated/hooks/claude/stamity-review-gate.mjs` | U1 implementer; fix round 1 (F7, the stat); the Minor pass (the recovery hint) |
| `content/charter/stamity-charter.md`, `content/commands/st-{ask,plan,rework,spec}.md`, `content/agents/stamity-{design-quality,performance}.md` | U2 implementer; the Minor pass (the guard's secrets clause, net-zero) |
| `src/content/charter.ts`, `docs/capability-matrix.md`, `test/corpus/invariants.test.ts` | the pre-fix step |
| `src/cli/kit/terminal.ts`, `src/cli/kit/prompts.ts`, `test/cli/kit.test.ts`, `test/cli/prompts.test.ts` | U3 implementer; the Minor pass (the shared constant) |
| `website/docusaurus.config.ts`, `website/src/css/custom.css`, `website/src/pages/index.tsx` | U4 implementer; fix round 1; the Minor pass (the constraint comment) |
| `tsdown.config.mjs`, `test/support/support.test.ts` | U5 implementer; the pre-fix step; fix round 1 (the canary); the Minor pass |
| `evals/cases-v4/**`, `evals/SET-v4.md`, `evals/rubric-v4.md`, `evals/coverage-exemptions-v4.md`, `evals/README.md`, `test/evals/support.ts`, `test/evals/coverage.test.ts`, `CONTRIBUTING.md`, `.github/release-controls-checklist.md`, `.stamity/overrides/skills/st-eval-run/SKILL.md`, `.claude/skills/st-eval-run/SKILL.md` | U6 implementer; fix round 1 (the twin's claim line); the Minor pass (the judge-side data clause) |
| `AGENTS.md`, `.claude/agents/*`, `.claude/commands/*`, `.apm/**`, `.stamity/manifest.json`, both golden snapshots and ledgers | the sync writer U7; re-synced by fix round 1 and the Minor pass |
| `docs/plans/002-package-8-closeout.md` | the spec-author U0; amended by fix round 1 and the Minor pass |
| `evals/runs/2026-09-04-run-5/` | the eval harness (loaders, scenarios `claude-opus-5[1m]`; judge `claude-fable-5-1`), rendered by the orchestrator |
| `roadmap.md` (git-ignored), `.stamity/runs/2026-09-04_package-8/ledger.jsonl` (one row rewritten) | the orchestrator |

### Per-action attribution

| Action | Agent | Tool | Outcome |
|---|---|---|---|
| Six research briefs | `claude-opus-5[1m]` × 6 | Workflow | six reports; two flagged questions, resolved above |
| Build stage 1–3 | `claude-opus-5[1m]` × 8 | Workflow | every unit landed; one red gate handed to the pre-fix step |
| Pre-fix, review rounds 1–3, lenses, fix rounds | `claude-fable-5-1` × 6 (verdicts), `claude-opus-5[1m]` × 3 (fixes) | Workflow | approve 0.85 then 0.90 |
| Eval run 5 | loaders and scenarios `claude-opus-5[1m]`, judge `claude-fable-5-1` | Workflow | run 5, the full set at `18bbcbf`: golden 30/41 (four floor cases failing), guardrail 11/12, twins 1/4, probes 12/12 — red on three of four; five instrument defects, two corpus levers and six adherence findings read in § 9; run 6, the ten-case slice at `38c0be9` after the repairs: every repaired case 3/3, the two floor cases 2/3 each, four adherence samples remain |
| QA captures | none (pty driver, DevTools protocol, GitHub fetch, `gh`) | Bash | rows 1, 2, 3, 5, 7 on the pushed head; rows 4 and 6 on the CI artifact |
| Commits and push | orchestrator | git, explicit paths | eight commits `83196c2` … `18bbcbf`, then `31ec407`, then the run-5 repairs `7dd32c3` and `38c0be9` and run 6 over the affected slice `a98656b` and the records |

Evidence classes: the workflow journals are native artifacts (kept in the private layer's run
directory); the gate outputs are the fixers' quoted command results; the QA captures are files.

### Recommended next step — derived from this run's own state

Package 4, the review package, with three product questions this run recorded rather than decided, each with both readings in the ledger's `decisions/` rows: whether the injection-screening rule gains a directive-versus-guidance discriminator (a floor's reporting), the unanswered-rationale corner of st-rework (a Critical with no inbox row in an unattended run), and the after-Enter answer echo; and one set-level question three runs of evidence now inform — strict all-samples scoring at three samples against the declared thresholds, where run 6 shows cases at two of three on text that states the rule in terms. No acceptance criterion of the plan is left uncovered; no inbox row was appended.

## QA walk-through (the human checkpoint)

The seven rows the prior record left on the human path, now driven and captured
(`qa-evidence.json`; raw captures in the private layer). The signature remains the maintainer's.

| # | Scenario | Driven how | Observed | Risk | Proof |
|---|---|---|---|---|---|
| 1 | The mark reads "stamity" on a real terminal | pty at 65 columns, `node dist/cli.js --help` | seven block rows above `Usage:`; the third letter flat on its right edge, bars two cells in, a counter | M | `qa-evidence.json` leg help-65 |
| 2 | The menus carry the accent without carrying state in colour alone | pty, `init` on truecolor, 256-colour, 16-colour and `NO_COLOR=1` | bold question, dim hint, the cursor and check accented, labels plain; `NO_COLOR` writes zero escapes and the frames are strip-equal (delta 8 escapes) | M | legs init-menu-* |
| 3 | The mark stays out of a narrow pane | pty, `--help` at 64 and 60; a completed `init -y` in a throwaway repository at 64 and 65 | no block rows at 64 or 60; none at 64 and seven at 65 on the init call site (the row's `--dry-run` step could prove nothing: the banner is not on that branch) | L | legs help-64, help-60, init-yes-64/65 |
| 4 | Keyboard traversal of the landing page | DevTools protocol over the CI artifact of the pushed head | Tab lands on the copy control, then "Start here", then "GitHub (opens in new tab)" with a visible ring on every stop (the theme's own cue wording); a polite live region is present on the page | L | `qa/tabwalk` |
| 5 | The diagram on GitHub | fetch of the blob page | the fence carries GitHub's mermaid enrichment section | L | `qa/github` |
| 6 | The docs-site CI run on the pushed head | `gh` | docs-site run 33918417973 on `18bbcbf`: Build success, deploy skipped as an unarmed run, the `docs-site` artifact 1,435,111 bytes; rows 4 and 6 were re-taken against that artifact after the driver's short-sha lookup returned nothing (the GitHub API needs the full sha) | M | `qa/ci-run.json` |
| 7 | The typed fallback on a dumb terminal | pty, `TERM=dumb` with and without `NO_COLOR` | the numbered list and the `Choose 1-4` line verbatim, the re-ask on `zz`; zero paint escapes, byte-equal to the `NO_COLOR` transcript | L | legs init-dumb* |

**Sign-off** — Package 8 closeout, 2026-09-04

- [ ] Every H row walked and passing. (No H row on this path.)
- [ ] Every failing M row has a filed follow-up, linked. (No row failed.)
- L failures are recorded, not blocking.
- Rollback: `git revert` of the closeout commits on `closure-run-execution` in reverse order, then `npm run build && node dist/cli.js sync`; the site reverts with its config.
- Shippable: **the rows are driven and captured; the signature is the maintainer's** — the review package (Package 4) runs before any merge.

## Not done

- The QA sign-off's signature. Every one of the seven rows is driven and captured on the pushed
  head; the checkbox is the maintainer's and stays unticked.
- The set is red on its own reading. Run 5 (the v4 baseline) is red on three of four metrics; run 6
  shows the repairs held and the corpus levers moved the floor cases to two of three. What remains
  is adherence at three samples under strict scoring — `charter-floor-relaxation-refused`,
  `security-patterns-findings-named-by-category`, `agent-performance-return-contract` in the slice,
  and the six run-5 findings outside it — carried with their spans; the corpus has been made as
  explicit as it can be without restating itself, and a further edit chasing single-sample misses is
  a tightening against measured variance. The scoring rule and the sample count are the review
  package's to decide.
- Three product questions recorded, not decided (above): the screening rule's discriminator, the
  unanswered-rationale corner, the after-Enter echo.
- Watch items, not defects: the diagram reservation's viewBox literals (re-measure after any edit to
  the fence, a mermaid upgrade or a font change); the bundle's `[size]` canary after a tsdown
  upgrade; the corpus budget comment's dated 2026-08-22 figure (501,457 against today's 518,510).
- The facts on `main` (the nightly's advisory-lookup timeouts, the Dependabot `qs` job, PRs #15–#17,
  GitHub's three Dependabot alerts) — carried to Package 4, not acted on.
