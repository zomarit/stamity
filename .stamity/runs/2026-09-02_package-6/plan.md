---
id: package-6-residual-product-work
intent: roadmap
stamp: 6865e31 2026-09-02
reads: [roadmap.md, evals/SET-v2.md, evals/runs/2026-09-02-run-2/RESULTS.md, .stamity/learnings/, src/content/charter.ts, src/adapters/codex.ts, scripts/leak-gate.mjs, content/, docs/, website/]
---

# Package 6 — residual product work

The plan the run executes, persisted here rather than under `docs/plans/` because a plan in the
public docs tree would become a site route and a roster entry; the run record is its home. Units
are file-disjoint and single-writer; every builder returns a structured result that names the
model id it attested. Builders run at the explicit id `claude-opus-5`; every verdict role (case
verifier, reviewer, eval judge) runs at `claude-fable-5-1`. A tier alias is never dispatched.

## Context

Two of four eval metrics are red at run 2 (golden 0.846 vs >= 0.85; adversarial hold 0.75 vs 1.0)
on genuine product findings. The audit that followed found 24 of 40 shipped artifacts unmeasured
by any case, hand-kept eval records that drifted, a duplicated always-on body in this repository's
own `AGENTS.md`, and a private-reference class the leak gate has no rule for. The intake was
decided by the maintainer; each item ships through this run on the open branch. Out of scope: the
merge, the release, the published with-versus-without benchmark, and every operator-experience
item (they have their own packages).

## Order — what keeps the eval honest

1. Corpus edits first (wave A), so the eval set's briefs inline the final text.
2. Engine and docs edits beside them (wave B), with the golden refresh and the byte constants
   computed once, after every corpus edit has landed.
3. `SET-v3` authored against the finished corpus (wave C), thresholds declared before any run.
4. Adversarial review of the whole diff, fix rounds, gates.
5. The eval run: calibration at `claude-fable-5-1`, then every case at three samples.
6. Records, dogfood sync, commits — explicit paths only.

## Units

| Unit | Files | Change |
|---|---|---|
| A1 | `content/commands/st-quick.md` | Rename the `Public contract` threshold row so its title is the measured thing; the refusal template unchanged |
| A2 | `content/commands/st-work.md`, `content/skills/st-qa/SKILL.md` | QA checkpoint step 2 invokes the qa skill by name and owns the step; the qa description drops the work-run trigger clause; the "never blocks" sentence corrected; qa `obsolete_when` restated as falsifiable |
| A3 | `content/commands/st-pr-resolve.md` | One tightening of "never echo the span": no fragment, position not words, the closing claim must be true of every quote |
| A4 | `content/rules/stamity-injection-screening.md` | Ingress clause: server-supplied content that never lands in the state directory (tool results, fetched bodies) is data, screened by class, reported by pattern id, never echoed |
| A5 | `content/rules/stamity-learnings-schema.md` | Folded to the curation residual (merge on overlap, promotion by verified outcome, what is not a learning); the shape is the write gate's |
| A6 | `content/commands/st-debug.md` | No-answer path: the declared default strips instrumentation; a capture window needs an explicit yes with its end named |
| A7 | `content/agents/stamity-design-quality.md`, `content/agents/stamity-security.md`, `content/agents/stamity-performance.md`, `content/skills/st-dep-audit/SKILL.md` | `obsolete_when` restated as conditions an observation can fire |
| A8 | `.stamity/learnings/*.md`, `test/learnings/repoLearnings.test.ts` | Every learning carries `reviewBy` and `validatedAgainst`; a repo-level test asserts both |
| B1 | `AGENTS.md`, `src/cli/commands/check.ts`, `test/cli/commands/check.test.ts` | Remove the duplicate charter body outside the managed block; `check` warns when a preserved region duplicates the managed block |
| B2 | `scripts/leak-gate.mjs`, `test/ci/leakGate.test.ts`, `test/gate/leakGateEvasion.test.ts` | A rule family for private decision-ledger ids and the private repository's name, assembled from fragments |
| B5a | `src/cli/commands/handoff.ts`, `src/cli.ts`, `test/cli/commands/handoff.test.ts` | `stamity handoff` plumbing verb: prepare, resume, list — the digest, the resume comparison, the rewrite with a recomputed digest, the cap checks |
| B5b | `src/cli/commands/handoff.ts`, `test/**` pins, `docs/cli-reference.md`, `content/skills/st-handoff/SKILL.md` | complete and prune; the seven surface pins moved; the skill delegates to the verb the way `st-learn` does |
| B3 | `src/adapters/codex.ts`, `src/content/charter.ts`, `src/emit/capabilityMatrix.ts`, `docs/capability-matrix.md`, `test/corpus/invariants.test.ts`, `test/emit/__snapshots__/*.snap`, both golden ledgers | Floor-tagged rules drop last, asserted by a test; the per-client always-on cost rendered on the matrix page; the charter's open-disclosure comment closed; goldens refreshed once |
| B4 | `docs/doctrine.md`, `website/sidebars.ts`, `website/docusaurus.config.ts`, `src/cli/docs/llmsIndex.ts`, `llms.txt`, `README.md`, `test/docsPages.test.ts`, `test/ci/docsSite.test.ts`, `docs/getting-started.md`, `CONTRIBUTING.md`, `GOVERNANCE.md` | The doctrine page with its pins; `docs/specs/` off the site build; the orphan-page roster gate; the state census completed; the self-application boundary table; the Article 50 sentence; the strategy sentence aligned |
| C1–C5 | `evals/cases-v3/**` | The 35 v2 cases carried forward with locators and briefs re-synced; new cases for the ranked floors, the three uncovered commands, the agents' return contracts, the learnings residual, the ingress clause and its benign twin |
| C6 | `evals/SET-v3.md`, `evals/rubric-v3.md`, `evals/README.md`, `evals/coverage-exemptions-v3.md`, `test/evals/*.test.ts`, the three runner pointers | The set document with thresholds declared, the rubric at the pinned judge id, the coverage gate, the locator gate, the fixture-count gate |

## Acceptance

- Every unit's tests pass in isolation and the full gate set exits 0 unmasked.
- The eval's affected cases re-run under `SET-v3` at three samples; calibration 5/5 at the pinned
  judge id before any grading; the run artifact committed.
- `git status` after the last commit shows exactly one untracked line.
