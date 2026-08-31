---
id: benchmark
type: command
description: "Measures the product against stored baselines: runs the suite under a controlled environment, compares each metric to the recorded baseline, and returns a per-metric regression verdict with its statistical confidence; it reports, and leaves the optimizing to the work pipeline."
tags: [review]
load: on-demand
obsolete_when: the project's CI reports per-metric regression verdicts with noise discipline on every commit
spawns: [researcher, reviewer]
---

# /st-benchmark

Measures, compares, and reports. **This command assesses; it never modifies
product code.** It writes measurements and a report under `.stamity/`, and an
optimization it recommends is applied by `/st-work`, never here — a run that
tunes the code it is measuring has no baseline left to compare against. The one
operation that would rewrite tracked files, switching to another ref to measure
it, is printed for the operator to run rather than performed here: that is what
keeps the sentence above true and keeps the pack's declared write surface inside
its own state directory.

## Load axes

A run measures the axes the suite actually exposes. Absent axes are reported as
absent, not estimated.

| Load axis | Metrics | Read as a regression when |
|---|---|---|
| Throughput | operations per second, iterations completed | the median drops beyond the verdict band |
| Latency | p50, p95, p99, max | any tracked percentile rises beyond the band |
| Memory | peak heap, resident-set delta, collection pause | peak or delta rises beyond the band |
| Startup | cold start, time to first useful work | the cold-start median rises beyond the band |
| Bundle | built bytes, gzipped bytes per entry point | any entry point grows beyond the band |

## Baselines

The baseline is what makes a number a verdict. Two forms, and one absence:

| Baseline | Source | Use when |
|---|---|---|
| `stored` | `.stamity/benchmarks/baseline.json` | the default — the last promoted run |
| `ref` | a second run the operator drives on another ref | the comparison target is a branch point or a release tag |
| `none` | — | first run in a repo; the output is measurements plus a promotion offer |

A `ref` baseline is measured, never inferred — and the measurement is a second
run rather than a checkout this command performs. Switching refs rewrites every
tracked file in the worktree, so the run stops and asks first, on a clean tree
exactly as on a dirty one: the question is about rewriting tracked files, not
about dirtiness, and a clean tree makes the rewrite no smaller. It prints the
sequence verbatim — switch to the ref, re-invoke this command, switch back —
and the operator runs it. Options: print the sequence and stop, use the stored
baseline, or abort. Default on no response: use the stored baseline. The two
runs then compare by artifact key, which is what makes the comparison
reproducible: both measurements exist as files, and neither depends on a
worktree state nobody recorded.

Storage, one directory:

```
.stamity/benchmarks/baseline.json     the promoted baseline
.stamity/benchmarks/<key>.json        raw results for one run
.stamity/benchmarks/<key>.md          the report for one run
```

`<key>` is the short HEAD sha, `-dirty` suffixed when the worktree carries
uncommitted changes — the same discriminator the verify artifacts use. Two runs
at one commit over different working trees are two different measurements, and a
bare-sha key would let the second overwrite the first with no trace.

`baseline.json` records, per metric, the value, the iteration count, the
environment record, and **the commit it was measured at**. The regression report
reads that commit for its suspect-range field; a baseline carrying no commit
cannot produce one, which is the whole reason it is stored rather than derived.

Promotion is explicit. A run ends by offering to promote its results to
`baseline.json`, and a silent answer keeps the existing baseline. Auto-promotion
would make every regression disappear one run after it landed.

A `-dirty` measurement is never promoted. `baseline.json` is a claim about a
commit, and a measurement of an uncommitted tree cannot be reproduced from one:
the offer is not made, and an explicit request is refused with the instruction
to commit or stash and re-run.

## Budgets — the verify seam

Thresholds are not this command's to invent. The performance budgets the
project declares are carried by the performance axis of the `st-verify`
skill, in its artifact for the current commit:

```
.stamity/verify/performance-<sha>.json
```

Read it when it exists for the current key and bind to its `checks[]` rows.
When it is absent or stale, run the `st-verify` skill with
`axis=performance` first.

What decides whether this run has budgets is the **`perf-budget-declared` row's
`status`**, never the artifact's presence. That axis produces budget-free
artifacts as a normal outcome — a repo that declared no budget gets a real
artifact saying so — so reading "artifact exists" as "budgets available" makes
every budget-keyed verdict vacuously true:

| `perf-budget-declared` | What this run does |
|---|---|
| `pass` | budgets exist; each matching measurement is graded against its declared number, and a breach is `regression-critical` |
| `fail` · `not-applicable` · row absent | no budget exists; the run reports measurements and deltas with **no budget verdict**, says so in the report header, and states `stable` as "inside the floor, budgets not evaluated" rather than as a clean pass |

Inventing a threshold to compare against is the one thing neither branch does.

## Loop

1. **Discover the suite.** Find the benchmark entry points the repo already
   has — a bench script, a suite directory, a profiling harness. Nothing found
   stops the run: brief a researcher for the candidate hot paths worth a suite,
   propose it, and end there. Measurements are never fabricated from reading
   the code.
2. **Prepare the environment.** Record what a reader would need to reproduce
   the run: runtime version, platform, CPU count, build mode, and the
   background load the machine is already under. Warn on a noisy machine before
   spending the iterations, not after.
3. **Execute.** Discard the first iteration as warm-up, then take N warm
   iterations per benchmark. **N is at least 10 and defaults to 10.** Raise it
   by doubling — 20, then 40 — while the measured coefficient of variation
   stays above 15%, and report the metric `noisy` at 40 rather than doubling
   again: past that the noise is the machine, not the sample size. A benchmark
   that crashes is recorded as crashed and the run continues; a crash is a
   result.
4. **Compare.** Match by benchmark name against the baseline. Names present on
   one side only are reported as added or removed, not silently dropped —
   a renamed benchmark that quietly loses its history is how a regression hides.
5. **Grade.** The reviewer takes the deltas, the noise statistics, and the
   budget rows, and returns one verdict per metric per benchmark.
6. **Report.** Write the run files, present the summary, and offer promotion.

## Verdicts

One signed quantity decides every row: the **adverse change**, the relative
move of that metric in the direction that costs — slower for throughput,
latency and startup, larger for memory and bundle bytes. Every Load axis lands
on the same scale, so no axis and no magnitude falls between rows.

The **regression floor** is the larger of 10% and twice the measured
coefficient of variation of the two samples. A band narrower than the noise
under it reports noise as a regression, which is how a report stops being read.

| Verdict | Condition | Consequence |
|---|---|---|
| `noisy` | coefficient of variation above 15% on either side of the comparison | no verdict — re-run per the iteration rule in Loop step 3 |
| `regression-critical` | adverse change of 50% or more, or a declared budget row fails | named in the report head; routes out as a finding |
| `regression-warning` | adverse change at or above the floor and under 50% | routes out as a finding |
| `stable` | change strictly under the floor in both directions, and no declared budget row fails | recorded, not routed |
| `improvement` | favourable change at or above the floor | recorded, with the change that produced it |

Rows are read top to bottom and the first match wins, which is what makes the
set total and keeps a value from landing in two rows: `noisy` outranks
everything because a measurement that does not reproduce cannot support a
regression claim, and a budget breach outranks the size bands because the
number was agreed to in advance.

## Noise discipline

- Report the coefficient of variation beside every metric. Above 15%, the
  metric is `noisy` and carries no verdict.
- Count outliers beyond two standard deviations and state whether excluding
  them would change any verdict.
- Compare like with like: the same iteration count, the same build mode, the
  same machine state. A comparison across two environments is not a comparison.
- State the iteration count in the report. A verdict from three iterations and
  a verdict from fifty are not the same claim.

## Regression routing

A `regression-critical` or `regression-warning` verdict is a finding, and
findings leave this command:

- The report names, per regression, the metric, the delta, the suspect commit
  range and the confidence the noise statistics support. The range is
  `git diff <baseline-commit>...HEAD` over the paths the benchmark exercises,
  where `<baseline-commit>` is the commit `baseline.json` recorded itself as
  measured at — which is why that field is stored rather than inferred, and why
  a baseline predating it produces the range as `unavailable` instead of a
  guess.
- The fix routes to `/st-work`. A structural regression — an algorithmic
  class change, a dependency that costs what it costs — routes to
  `/st-plan`.
- A per-module profiling pass, when the regression's cause is not visible from
  the diff, is the `st-perf-audit` skill's subject, not this command's.

When a run opens a regression epic on a linked board rather than a report:

> Epic scaffold: `stamity-epic-audit-frame` → Board sync. Slot: epic-kind =
> `benchmark regression`; epic-label = `benchmark`.

Only that block is cited. The frame's item shape is built on a module taxonomy
this command never establishes — a benchmark suite is a list of named
benchmarks, not a module map — so the shape is stated here instead: one epic
per run, one sub-issue per regressed benchmark, no dependency edges, since two
regressed benchmarks are worked in any order.

The frame's evidence guardrail is not cited either, and this row replaces it: a
metric regression's evidence is the benchmark name, both measurements with their
iteration counts, and the coefficient of variation behind each. It has no
`path:line`, so a rule demanding one would demote every regression this command
exists to raise into an open question.

## Refusals

| Situation | Behaviour |
|---|---|
| No suite found | Propose one from the researcher's hot-path brief and stop |
| Baseline absent | Run, report measurements, offer promotion; emit no verdicts |
| Performance verify artifact absent or stale | Run `st-verify` with `axis=performance`, then read `perf-budget-declared` |
| `perf-budget-declared` is not `pass` | Report with no budget verdict and say so in the header; emit no budget-keyed row |
| The baseline is a git ref | Ask, clean tree or dirty: print the switch-and-re-run sequence · use the stored baseline · abort |
| Promotion requested for a `-dirty` key | Refuse; name the key and the commit-or-stash step that makes it promotable |
| Every metric lands `noisy` | Report the noise, name the suspected source, emit no verdicts |

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor` — the core
  reviewer's scale, which the metric verdicts map onto exactly:
  `regression-critical` is `Critical`, `regression-warning` is `Warning`, and
  `stable`, `improvement` and `noisy` route out as nothing.
- `DONE` carries the artifact key, the baseline used, the environment record,
  the per-metric verdicts with their noise statistics, and the files written. A
  run whose every metric came back `stable` still returns `DONE` with an empty
  finding list; measuring no regression is a result.
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest
  unblocking input — a suite that will not run here, a performance axis that
  cannot produce an artifact, a baseline file that does not parse.
- Sub-agents do not put questions to the operator. A researcher or reviewer
  returning `BLOCKED_AMBIGUITY` hands its competing readings up; this command
  runs the ambiguity gate and re-dispatches.
