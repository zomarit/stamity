# evals

The measurement lane for the part of this product a test suite cannot decide: the corpus
under `content/`, which is prose executed by a model at a user's site. `src/` is proven by
vitest, where a failure is a red test. `content/` is proven here, where a failure is a score
under a declared threshold.

**Current set: `SET-v4.md`.** v3, v2 and v1 are retained beside it, all unchanged, as
baselines.

| Path | What it is |
|---|---|
| `SET-v4.md` | **The current set document** — scope, versioned inputs, thresholds, the run-artifact contract, the hard triggers, the case index and the coverage table. Read it first. |
| `rubric-v4.md` | **The current judge rubric**: verdict vocabulary, the binding/advisory grouping, grading procedure, the judge's four inputs, and the calibration protocol with its fixtures. |
| `cases-v4/golden/` | Cases pinning the behaviour the corpus promises. |
| `cases-v4/adversarial/` | Cases pinning the guardrails it claims, plus the benign twins that keep a guardrail from turning into a refusal reflex. |
| `cases-v4/probes/` | Skill-selection classification cases: eight that should trigger, four that should not. |
| `coverage-exemptions-v4.md` | The written exemption list the coverage gate reads: every content artifact with no case, its reason, and the trigger under which a case must land. |
| `SET-v3.md`, `rubric-v3.md`, `cases-v3/**`, `coverage-exemptions-v3.md` | **Retained baseline, do not edit.** The instrument runs 3 and 4 were produced with. |
| `SET-v2.md`, `rubric-v2.md`, `cases-v2/**` | **Retained baseline, do not edit.** The instrument run 2 was produced with. |
| `SET-v1.md`, `rubric-v1.md`, `cases/**` | **Retained baseline, do not edit.** The instrument run 1 was produced with. Kept readable so run 1's red result stays interpretable against the text that produced it. |
| `runs/` | Run artifacts, one directory per run: `runs/<date>-run-<n>/RESULTS.md`. |

## What v4 changed, in one paragraph

v3 repaired what is measured at all. **v4 is a repair release.** Six commands close on a
recommended next step derived from the run's own state, and none of those six lines carried a
case; v4 adds one golden case each for `/st-spec`, `/st-ask`, `/st-debug`, `/st-quick`,
`/st-rework` and `/st-pr-resolve`. It repairs the two instrument and five authoring defects
run 3 recorded, rewrites the `benign-state-note-not-screened` twin so a reported finding that
still carries the note's content forward is not read as a refusal, and discharges three
advisory repeats by deleting them — each was one of the four advisory kinds the split admits,
so none was promotable. It also reconciles the judge's inputs: the runner and the rubric
disagreed, and the Brief now reaches the judge. Fifteen carried cases were re-synced against a
corpus that had moved under them. **No threshold moved.** The roster is now 69 cases — 41
golden, 16 adversarial (12 guardrail, 4 benign twins), 12 probes, with 20 carrying
`floor: true`. The full rationale is in `SET-v4.md`.

## The judge is pinned to an explicit id, and its inputs are stated

`rubric-v4.md` declares the judge as **`claude-fable-5-1`** and the model under test as
`claude-opus-5`, the same two ids v3 declared. Every verdict role runs at an explicit model
id — a tier alias is never sufficient — and the run records the id each agent attests rather
than the id the harness requested. Run 1 is why: it measured an alias that resolved to a
different model than the set declared.

What v4 moved is the judge's input set. Per transcript the judge receives four things and
nothing else: the rubric, the case's `## Brief` verbatim, the case's `## Expected` block, and
the transcript verbatim. Run 4 found the runner skill withholding the Brief that the rubric's
own procedure reads, which made any criterion phrased against a value the Brief seeds
undecidable — and an undecidable criterion is graded `fail`.

A judge-model change is a calibration event, and so is an edit to the rubric. Calibration runs
against five fixtures today, and that number is not a literal maintained in this file: it is
the count of `### Fixture` headings in `evals/rubric-v4.md`, which is the source of truth.
`test/evals/fixtureCount.test.ts` derives it and fails if this page, `SET-v4.md`, or the
runner skill states a different one.

## The baselines stay put

`runs/2026-09-01-run-1/RESULTS.md` is red: golden 0.769, adversarial hold 0.625, probes 0.833,
twins clean. `runs/2026-09-02-run-2/RESULTS.md` is red too, at three samples per case with
strict scoring: golden 0.846, adversarial hold 0.75, probes 0.917, twins 0.0.
`runs/2026-09-02-run-3/RESULTS.md` is v3's first baseline and red on three of four metrics,
and `runs/2026-09-04-run-4/RESULTS.md` is v3's affected-slice run. None was re-run, re-scored,
or re-graded when the next version landed, and no case was edited after its scores were known.
A v4 run produces a new baseline for v4; comparing a v4 number to run 3's compares two
instruments over two different rosters, not two versions of the product.

## Coverage is a gate, not a promise

Every artifact the engine emits as model-executed prose — `content/charter/*.md`,
`content/commands/*.md`, `content/agents/*.md`, `content/skills/*/SKILL.md`,
`content/rules/*.md` — is named by at least one case's `source:` field, or listed with a
written reason in `coverage-exemptions-v4.md`. `test/evals/coverage.test.ts` derives both
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
   `cases-v4/**`; a claim that moved takes its case's `source` and inlined brief with it in
   the same diff. Stated in `CONTRIBUTING.md` under "Changing the corpus".
2. **Every release runs the full set.** Before the tag is cut, and the release carries the
   run artifact. Wired into `.github/release-controls-checklist.md` under "Per-release
   record currency", so a release without it is blocked by its own checklist.
3. **A model change re-runs every adversarial case, at a zero-break bar.** Guardrail
   behaviour belongs to the model-and-prose pair, so a model swap rewrites every case at
   once — adversarial cases re-run even when no prompt moved. A judge-model change re-runs
   calibration first, and so does a rubric edit — which is what v4's own rubric bump triggers
   before its first run.

## How to run

Invoke the `st-eval-run` skill by name in a session, with `SET-v4.md` as the contract it
works to. The skill calibrates the judge against every fixture the rubric declares, fans out
one scenario agent per case, grades each transcript against that case's `## Expected`
criteria, aggregates the per-metric scores beside their declared thresholds, and writes the
run artifact.

Two things to get right before starting one.

- **The runner and both hard-trigger pointers name v4.** The skill's preconditions,
  calibration and fan-out steps, the contributing guide's corpus-edit trigger, and the
  release checklist all point at `evals/SET-v4.md`, `evals/rubric-v4.md` and
  `evals/cases-v4/**`. They move together, because a runner naming one version while a
  trigger names another scores one instrument and labels the result with the other's name.
  v1's, v2's and v3's own documents still name their own paths, which is correct: they
  describe the baselines they are.
- **Pin the model ids explicitly, never by tier alias — for the judge as well.** Run 1
  measured an alias resolving to a different model than the set declares, and recorded the
  per-agent attested id rather than the id requested. Do the same, for every role.

Read `SET-v4.md` before starting one. The thresholds are declared there, before any run, and
a run that discovers its threshold afterwards has measured the author's tolerance instead of
the product.

## Where results land

`runs/<date>-run-<n>/RESULTS.md`, committed with the change that caused the run — a run
whose numbers live only in a transcript is not a result. The directory contract is unchanged
from v2. `SET-v4.md` names the eleven things the artifact records; the short version is that
a reader who has never seen the session can tell what was measured, against what, on which
inputs, and how many times — which advisory criteria a passing case missed, and which model
id every agent in the run attested.
