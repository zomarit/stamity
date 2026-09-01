# evals

The measurement lane for the part of this product a test suite cannot decide: the corpus
under `content/`, which is prose executed by a model at a user's site. `src/` is proven by
vitest, where a failure is a red test. `content/` is proven here, where a failure is a score
under a declared threshold.

| Path | What it is |
|---|---|
| `SET-v1.md` | The set document — scope, versioned inputs, thresholds, the run-artifact contract, the hard triggers, and the case index. Read it first. |
| `rubric-v1.md` | The judge's written rubric: verdict vocabulary, grading procedure, the calibration protocol and its four fixtures. |
| `cases/golden/` | Cases pinning the behaviour the corpus promises. |
| `cases/adversarial/` | Cases pinning the guardrails it claims, plus the benign twins that keep a guardrail from turning into a refusal reflex. |
| `cases/probes/` | Skill-selection classification cases: eight that should trigger, four that should not. |
| `runs/` | Run artifacts, one directory per run: `runs/<date>-run-<n>/RESULTS.md`. |

## Manual execution, by decision

The set runs when an operator says so, in a harness session, and at no other time.

- **Nothing is scheduled.** No cron, no workflow trigger, no hook. A run happens because a
  person started one.
- **No API lane is armed.** The harness drives the set through the session's own agent
  tooling; there is no key, no client, and no billable path standing by in this repository.
- **A run is a session, not a command.** There is no `npm run eval`, and its absence is the
  design rather than a gap: a scored run costs model calls, and the thing that decides
  whether to spend them is a person with a reason.

## The three hard triggers

Process obligations, written where the person doing the work reads them — text, not
automation.

1. **A `content/` edit re-runs the affected cases.** Find them by the `source` field in
   `cases/**`; a claim that moved takes its case's `source` and inlined brief with it in the
   same diff. Stated in `CONTRIBUTING.md` under "Changing the corpus".
2. **Every release runs the full set.** Before the tag is cut, and the release carries the
   run artifact. Wired into `.github/release-controls-checklist.md` under "Per-release
   record currency", so a release without it is blocked by its own checklist.
3. **A model change re-runs every adversarial case, at a zero-break bar.** Guardrail
   behaviour belongs to the model-and-prose pair, so a model swap rewrites every case at
   once — adversarial cases re-run even when no prompt moved. A judge-model change re-runs
   calibration first.

## How to run

Invoke the `st-eval-run` skill by name in a session, with `SET-v1.md` as the contract it
works to. The skill calibrates the judge against the rubric's four fixtures, fans out one
scenario agent per case, grades each transcript against that case's `## Expected` criteria,
aggregates the per-metric scores beside their declared thresholds, and writes the run
artifact.

Read `SET-v1.md` before starting one. The thresholds are declared there, before any run, and
a run that discovers its threshold afterwards has measured the author's tolerance instead of
the product.

## Where results land

`runs/<date>-run-<n>/RESULTS.md`, committed with the change that caused the run — a run
whose numbers live only in a transcript is not a result. `SET-v1.md` names the nine things
the artifact records; the short version is that a reader who has never seen the session can
tell what was measured, against what, on which inputs, and how many times.
