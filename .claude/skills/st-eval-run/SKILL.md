---
description: Runs this repository's eval set as a manual harness session — calibrate the judge, fan out one scenario agent per case, grade each transcript against the rubric, aggregate per-metric scores beside their declared thresholds, and commit the run artifact. Triggers when someone asks to run the eval set, start an eval run, or exercise the eval harness, and when a release checklist demands the release eval run.
name: st-eval-run
metadata:
  id: st-eval-run
  type: skill
  tags:
    - review
  load: on-demand
  obsolete_when: the eval set runs from a committed automation lane whose scores gate a merge without an operator driving the session
---

# Eval run

The manual runner for the eval set under `evals/`. One operator, one harness
session, one committed result. Nothing here fires on a schedule and nothing
here reaches a provider endpoint of its own accord: every case is executed by
an agent session the operator started, and the session closes when the run
artifact lands.

## Quick Start

1. Preconditions — read the set, pin the sha, confirm the set is committed.
2. Calibration gate — the judge earns the right to grade.
3. Scenario fan-out — one agent per case, sealed brief in, transcript out.
4. Judging — a separate agent grades each transcript against the rubric.
5. Aggregate — per-metric scores beside their declared thresholds.
6. Artifact — write the run record and commit it.
7. Verdict — a metric under its threshold reads as a red test.

## 1. Preconditions

Read `evals/SET-v1.md` first. It is the contract this runner executes: the case
roster, the declared thresholds, the run-artifact shape, and the versioned
inputs — prompt text, the model-under-test id, the judge id, decoding settings,
tool schemas, retrieval corpus. Read `evals/rubric-v1.md` next for the written
grading rubric and its calibration fixtures.

Then pin the run:

- Record the repo sha (`git rev-parse HEAD`). Every score the run produces is a
  score of that sha and of nothing else.
- Confirm the eval set is committed at that sha: `git status --porcelain evals/`
  comes back empty for the set, the rubric, and the cases. A threshold that
  moves in the working tree during a run measures the author's tolerance rather
  than the change, so the set predates the run or the run does not start.
- Name the change that caused the run — a content edit, a release, or a model
  change. That name decides the case scope in step 3.

## 2. Calibration gate

Spawn one judge agent, pinned to the judge id declared in `evals/SET-v1.md`,
over the rubric's calibration fixtures. Hand it the rubric and the fixtures'
inputs; withhold the fixtures' labels.

Every fixture's returned label matches its expected label, or the run stops
here. A partial match is a miss: report the fixture, the label expected, and
the label returned, then stop. Grading real transcripts with an uncalibrated
judge produces numbers that describe the instrument instead of the change.

Record the calibration outcome — fixtures run, matches, judge id — because the
artifact in step 6 carries it.

## 3. Scenario fan-out

One sub-agent per case file under `evals/cases/**`, all dispatched together:
the cases are independent, so only a dependency edge would justify serialising
them, and there is none.

Each scenario agent gets exactly what the case seals and no more.

| Handed in | Withheld |
|---|---|
| the case's `## Brief`, verbatim and whole | the case's `## Expected` |
| the model-under-test id declared in `evals/SET-v1.md` | the rubric |
| the decoding settings that set declares | tools, repo reads, the rest of the case file |

Four rules keep a transcript worth grading:

- One case per scenario agent. Two cases batched into one transcript share
  context, and the second case then measures the first one's output.
- The brief goes in unedited. A brief reworded at dispatch time is a different
  case from the one the set versions.
- Collect each transcript verbatim, whitespace included, keyed by case id. A
  summarised transcript cannot be cited by a span in step 4.
- A scenario call that errors, truncates, or comes back off the declared model
  is re-run before grading, and the re-run count lands in the artifact.

## 4. Judging

Spawn the judge separately from the scenario agents. The judge grades; it
produces no scenario output, and no transcript is graded by the agent that
wrote it.

Per transcript, hand the judge three things: the rubric from
`evals/rubric-v1.md`, that case's `## Expected` block, and the transcript
verbatim.

The judge returns, per case, the metric values the rubric defines, and for each
claim a cited transcript span that supports it. A verdict with no span behind
it is unusable — send it back rather than counting it.

A judge call that comes back degraded, errored, or off the declared judge id is
redone. It is not admitted with a caveat beside it: one soft score is
indistinguishable from a real one once the table is written.

Where the set defines a pairwise comparison, score both orders and average
them. Position preference alone can flip a verdict.

## 5. Aggregate

Compute exactly the metrics `evals/SET-v1.md` declares, by its own definitions:

| Metric | Aggregation | Bar |
|---|---|---|
| golden pass rate | passes / golden cases | the declared threshold |
| floor cases | per-case pass or fail, each listed | every floor case passes |
| adversarial hold rate | holds / adversarial cases | zero breaks |
| benign-twin false refusals | refusals / benign twins, tracked apart from the hold rate | the declared threshold |
| probe accuracy | correct probes / probes, plus per-skill recall | the declared threshold |

Every score carries its run count and the decoding settings it was produced
under. One sample from a sampling model is an anecdote with a decimal point,
and a score with no decoding note beside it cannot be reproduced or compared.

## 6. Run artifact

Write `evals/runs/<YYYY-MM-DD>-run-<n>/RESULTS.md`, in the shape
`evals/SET-v1.md` declares for it. At minimum it records:

- the set version and the rubric version,
- the repo sha,
- the model-under-test id, the judge id, and the decoding settings,
- run counts, re-runs from steps 3 and 4 included,
- the calibration result from step 2,
- a per-case table — case id, class, verdict, cited span,
- per-metric scores beside the threshold each was measured against.

Commit it with the change that caused the run. A result that lives only in the
session transcript is not an artifact, and a result committed apart from its
change cannot be traced back to what moved.

## 7. Verdict

A metric under its declared threshold fails the change the way a red test does.
Report it as a failure — the metric, the score, the threshold — and stop.
Advisory eval output trains a team to scroll past it.

A clean run reports the artifact path and one line per metric.

## Standing constraints

- Manual harness sessions only. No scheduler, no unattended lane, no automation
  that starts a run on its own.
- A content edit re-runs the affected cases, found by the `source` field each
  case declares, and carries their result.
- Every release runs the full set rather than the affected slice.
- A model change re-runs the adversarial cases in full, at the zero-break bar.
  Guardrail behaviour is a property of the prompt and the model together, so a
  swap rewrites every adversarial expectation at once.
