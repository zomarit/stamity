# evals

The measurement lane for the part of this product a test suite cannot decide: the corpus
under `content/`, which is prose executed by a model at a user's site. `src/` is proven by
vitest, where a failure is a red test. `content/` is proven here, where a failure is a score
under a declared threshold.

**Current set: `SET-v3.md`.** v2 is retained beside v1, both unchanged, as baselines.

| Path | What it is |
|---|---|
| `SET-v3.md` | **The current set document** — scope, versioned inputs, thresholds, the run-artifact contract, the hard triggers, the case index and the coverage table. Read it first. |
| `rubric-v3.md` | **The current judge rubric**: verdict vocabulary, the binding/advisory grouping, grading procedure, and the calibration protocol with its fixtures. |
| `cases-v3/golden/` | Cases pinning the behaviour the corpus promises. |
| `cases-v3/adversarial/` | Cases pinning the guardrails it claims, plus the benign twins that keep a guardrail from turning into a refusal reflex. |
| `cases-v3/probes/` | Skill-selection classification cases: eight that should trigger, four that should not. |
| `coverage-exemptions-v3.md` | The written exemption list the coverage gate reads: every content artifact with no case, its reason, and the trigger under which a case must land. |
| `SET-v2.md`, `rubric-v2.md`, `cases-v2/**` | **Retained baseline, do not edit.** The instrument run 2 was produced with. |
| `SET-v1.md`, `rubric-v1.md`, `cases/**` | **Retained baseline, do not edit.** The instrument run 1 was produced with. Kept readable so run 1's red result stays interpretable against the text that produced it. |
| `runs/` | Run artifacts, one directory per run: `runs/<date>-run-<n>/RESULTS.md`. |

## What v3 changed, in one paragraph

v2 repaired how criteria are written — the binding/advisory split. **v3 repairs what is
measured at all.** It is a coverage diff: 28 new cases close five gaps the corpus had left
unmeasured — the charter's ranked floors, the three touchpoints with no case (`/st-plan`,
`/st-rework`, `/st-spec`), the ten sub-agent return contracts, three rule floors with no case
of their own, and the injection screen's tool-result ingress tier. Alongside that it carries a
record-integrity re-sync: all 35 cases v2 shipped are carried into v3 and re-read against the
corpus, and 22 of them had drifted off the locators their briefs quote. **No threshold moved.**
The roster is now 63 cases — 35 golden, 16 adversarial (12 guardrail, 4 benign twins), 12
probes, with 20 carrying `floor: true`. The full rationale, class by class, is in `SET-v3.md`.

## The judge is pinned to an explicit id

`rubric-v3.md` declares the judge as **`claude-fable-5-1`**, where `rubric-v2.md` declared
`claude-fable-5`. That is the only change between the two rubrics. Every verdict role runs at
an explicit model id — a tier alias is never sufficient — and the run records the id each
agent attests rather than the id the harness requested. Run 1 is why: it measured an alias
that resolved to a different model than the set declared.

A judge-model change is a calibration event. Calibration runs against five fixtures today, and
that number is not a literal maintained in this file: it is the count of `### Fixture` headings
in `evals/rubric-v3.md`, which is the source of truth. `test/evals/fixtureCount.test.ts`
derives it and fails if this page, `SET-v3.md`, or the runner skill states a different one.

## The baselines stay put

`runs/2026-09-01-run-1/RESULTS.md` is red: golden 0.769, adversarial hold 0.625, probes 0.833,
twins clean. `runs/2026-09-02-run-2/RESULTS.md` is red too, at three samples per case with
strict scoring: golden 0.846, adversarial hold 0.75, probes 0.917, twins 0.0. Neither was
re-run, re-scored, or re-graded when the next version landed, and no case was edited after its
scores were known. A v3 run produces a new baseline for v3; comparing a v3 number to run 2's
compares two instruments over two different rosters, not two versions of the product.

## Coverage is a gate, not a promise

Every artifact the engine emits as model-executed prose — `content/charter/*.md`,
`content/commands/*.md`, `content/agents/*.md`, `content/skills/*/SKILL.md`,
`content/rules/*.md` — is named by at least one case's `source:` field, or listed with a
written reason in `coverage-exemptions-v3.md`. `test/evals/coverage.test.ts` derives both
sides from the files and fails when an artifact is in neither column, and also when an
exemption row names an artifact a case now covers, so the list cannot go stale in either
direction. `test/evals/locators.test.ts` holds the other half: a case's `source:` range must
exist, and every non-elided line of its inlined governing text must be verbatim in the file
its heading names.

## Manual execution, by decision

The set runs when an operator says so, in a harness session, and at no other time.

- **Nothing is scheduled.** No cron, no workflow trigger, no hook. A run happens because a
  person started one.
- **No API lane is armed.** The harness drives the set through the session's own agent
  tooling; there is no key, no client, and no billable path standing by in this repository.
- **A run is a session, not a command.** There is no `npm run eval`, and its absence is the
  design rather than a gap: a scored run costs model calls, and the thing that decides
  whether to spend them is a person with a reason.

The three gates above are the exception that proves the rule: they are deterministic checks
over the case files, they run in `npm run test` with everything else, and they score nothing.

## The three hard triggers

Process obligations, written where the person doing the work reads them — text, not
automation.

1. **A `content/` edit re-runs the affected cases.** Find them by the `source` field in
   `cases-v3/**`; a claim that moved takes its case's `source` and inlined brief with it in
   the same diff. Stated in `CONTRIBUTING.md` under "Changing the corpus".
2. **Every release runs the full set.** Before the tag is cut, and the release carries the
   run artifact. Wired into `.github/release-controls-checklist.md` under "Per-release
   record currency", so a release without it is blocked by its own checklist.
3. **A model change re-runs every adversarial case, at a zero-break bar.** Guardrail
   behaviour belongs to the model-and-prose pair, so a model swap rewrites every case at
   once — adversarial cases re-run even when no prompt moved. A judge-model change re-runs
   calibration first, which is what v3's own judge pin triggers before its first run.

## How to run

Invoke the `st-eval-run` skill by name in a session, with `SET-v3.md` as the contract it
works to. The skill calibrates the judge against every fixture the rubric declares, fans out
one scenario agent per case, grades each transcript against that case's `## Expected`
criteria, aggregates the per-metric scores beside their declared thresholds, and writes the
run artifact.

Two things to get right before starting one.

- **The runner and both hard-trigger pointers name v3.** The skill's preconditions,
  calibration and fan-out steps, the contributing guide's corpus-edit trigger, and the
  release checklist all point at `evals/SET-v3.md`, `evals/rubric-v3.md` and
  `evals/cases-v3/**`. They move together, because a runner naming one version while a
  trigger names another scores one instrument and labels the result with the other's name.
  v1's and v2's own documents still name their own paths, which is correct: they describe
  the baselines they are.
- **Pin the model ids explicitly, never by tier alias — for the judge as well.** Run 1
  measured an alias resolving to a different model than the set declares, and recorded the
  per-agent attested id rather than the id requested. Do the same, for every role.

Read `SET-v3.md` before starting one. The thresholds are declared there, before any run, and
a run that discovers its threshold afterwards has measured the author's tolerance instead of
the product.

## Where results land

`runs/<date>-run-<n>/RESULTS.md`, committed with the change that caused the run — a run
whose numbers live only in a transcript is not a result. The directory contract is unchanged
from v2. `SET-v3.md` names the eleven things the artifact records; the short version is that
a reader who has never seen the session can tell what was measured, against what, on which
inputs, and how many times — which advisory criteria a passing case missed, and which model
id every agent in the run attested.
