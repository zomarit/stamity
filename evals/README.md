# evals

The measurement lane for the part of this product a test suite cannot decide: the corpus
under `content/`, which is prose executed by a model at a user's site. `src/` is proven by
vitest, where a failure is a red test. `content/` is proven here, where a failure is a score
under a declared threshold.

**Current set: `SET-v2.md`.** v1 is retained, unchanged, as the baseline.

| Path | What it is |
|---|---|
| `SET-v2.md` | **The current set document** — scope, versioned inputs, thresholds, the run-artifact contract, the hard triggers, and the case index. Read it first. |
| `rubric-v2.md` | **The current judge rubric**: verdict vocabulary, the binding/advisory grouping, grading procedure, the calibration protocol and its four fixtures. |
| `cases-v2/golden/` | Cases pinning the behaviour the corpus promises. |
| `cases-v2/adversarial/` | Cases pinning the guardrails it claims, plus the benign twins that keep a guardrail from turning into a refusal reflex. |
| `cases-v2/probes/` | Skill-selection classification cases: eight that should trigger, four that should not. |
| `SET-v1.md`, `rubric-v1.md`, `cases/**` | **Retained baseline, do not edit.** The instrument run 1 was produced with. Kept readable so run 1's red result stays interpretable against the text that produced it. |
| `runs/` | Run artifacts, one directory per run: `runs/<date>-run-<n>/RESULTS.md`. |

## What v2 changed, in one paragraph

Each case's criteria are now split into **binding** — the behaviour the case exists to pin,
which decides the verdict and therefore the metric — and **advisory** — routing
destinations, hand-off phrasing, the choice between sibling labels, and how completely a
correct decision was explained, which are graded and reported and decide nothing. Run 1
showed why: in all three of its adversarial failures the guardrail itself held, and each
case failed on a bundled criterion that was not the guardrail. A hold rate a routing
preference can move is not a hold rate. **No threshold changed**, and nothing the product
must do was relaxed — every criterion v1 wrote is still graded and still reported. The
full rationale, case by case, is in `SET-v2.md`.

## The baseline stays put

`runs/2026-09-01-run-1/RESULTS.md` is red: golden 0.769, adversarial hold 0.625, probes
0.833, twins clean. It was not re-run, re-scored, or re-graded when v2 landed, and v1's
cases were not edited after the scores were known. A v2 run produces a new baseline for v2;
comparing a v2 number to run 1's number compares two instruments, not two versions of the
product.

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
   `cases-v2/**`; a claim that moved takes its case's `source` and inlined brief with it in
   the same diff. Stated in `CONTRIBUTING.md` under "Changing the corpus".
2. **Every release runs the full set.** Before the tag is cut, and the release carries the
   run artifact. Wired into `.github/release-controls-checklist.md` under "Per-release
   record currency", so a release without it is blocked by its own checklist.
3. **A model change re-runs every adversarial case, at a zero-break bar.** Guardrail
   behaviour belongs to the model-and-prose pair, so a model swap rewrites every case at
   once — adversarial cases re-run even when no prompt moved. A judge-model change re-runs
   calibration first.

## How to run

Invoke the `st-eval-run` skill by name in a session, with `SET-v2.md` as the contract it
works to. The skill calibrates the judge against the rubric's four fixtures, fans out one
scenario agent per case, grades each transcript against that case's `## Expected` criteria,
aggregates the per-metric scores beside their declared thresholds, and writes the run
artifact.

Two things to get right before starting one.

- **The runner and both hard-trigger pointers now name v2** — the skill's preconditions,
  calibration and fan-out steps, the contributing guide's corpus-edit trigger, and the
  release checklist all point at `evals/SET-v2.md`, `evals/rubric-v2.md` and
  `evals/cases-v2/**`. They were moved together, because a runner naming one version while
  a trigger names another scores one instrument and labels the result with the other's name.
  v1's own documents still name v1's paths, which is correct: they describe the baseline
  they are.
- **Pin the model ids explicitly, never by tier alias.** Run 1 measured an alias resolving
  to a different model than the set declares, and recorded the per-agent attested id rather
  than the id requested. Do the same.

Read `SET-v2.md` before starting one. The thresholds are declared there, before any run, and
a run that discovers its threshold afterwards has measured the author's tolerance instead of
the product.

## Where results land

`runs/<date>-run-<n>/RESULTS.md`, committed with the change that caused the run — a run
whose numbers live only in a transcript is not a result. `SET-v2.md` names the eleven things
the artifact records; the short version is that a reader who has never seen the session can
tell what was measured, against what, on which inputs, and how many times — and, new in v2,
which advisory criteria were missed by a case that passed.
