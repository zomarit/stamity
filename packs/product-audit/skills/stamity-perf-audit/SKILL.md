---
id: perf-audit
type: skill
description: "Profiles a slow product surface against its declared performance budgets, names the hot paths behind each violation with measured evidence, and hands the optimization plan to the work pipeline. For investigating why something is slow — bundle weight, render cost, memory growth, cold start, query cost."
tags: [review]
load: on-demand
obsolete_when: profilers attribute budget violations to source locations well enough that a procedure adds nothing
---

# Performance audit

A point-in-time investigation of one slow surface. It measures, attributes, and
plans; the change itself goes through `/stamity-work`, which delegates it and
proves it against the repo's gates.

## Quick Start

1. Name the surface and read its budgets (Step 1).
2. Measure it as it is, and record how (Step 2).
3. Attribute each violation to a hot path (Step 3).
4. Plan the optimizations, ordered by measured cost (Step 4).
5. Hand the plan out, with the measurement recipe attached (Step 5).

An invocation that names no surface does not start: ask which one, offering the
slowest measured candidate as the default.

## Step 1 — Budgets first

A number without a budget is trivia. Before measuring, collect the thresholds
the project actually declared, in this order:

1. The performance-axis rows of `.stamity/verify/performance-<sha>.json`, when
   that artifact exists for the current commit. It carries the declared budgets
   and their pass or fail status, and it is the cheapest source.
2. The project's own performance documentation or budget configuration.
3. Nothing declared — then the deliverable of this run includes a proposed
   budget set, and every violation is stated as "over the proposed threshold",
   never as a fact about a threshold nobody agreed to.

Record which source each threshold came from. A run that mixes declared and
proposed budgets without saying which is which cannot be argued with.

## Step 2 — Measure

Measure the surface in scope, and only it. Record the method beside every
number; a measurement whose recipe is unrecorded cannot be repeated after the
fix, which makes the fix unprovable.

| Surface | What to capture | Method note to record |
|---|---|---|
| Bundle | bytes per entry point, gzipped and raw; the largest contributors | build mode, analyzer used |
| Render | frame cost during the interaction, long tasks, layout thrash | device or throttling profile |
| Runtime | wall time and self time per frame in the sampled profile | sampling interval, iteration count |
| Memory | heap after settle, growth across repetitions, retained sets | how many repetitions, what was collected between |
| Startup | time to first useful work, cold versus warm | cold-start definition used |
| Data access | query count, payload size, round trips per interaction | which interaction, which environment |

Two rules that make the numbers usable:

- **Repeat before believing.** Take several samples and report the spread. One
  sample is an anecdote, and the spread is what says whether a later
  improvement is real.
- **One surface, one environment.** Do not compare a number taken under a
  throttled profile with one taken without. State the environment once, at the
  top of the findings.

## Step 3 — Attribute

Turn each violation into a location. This is the step that makes the audit
worth more than a dashboard.

1. Read the profile from the top by self time, not by total time — total time
   attributes the cost to the caller and hides the leaf that is actually
   spending it.
2. For each hot path, write the attribution as `path:line` plus the share of
   the violated budget it accounts for. A hot path with no share is not
   attributed, it is suspected, and it is reported as suspected.
3. Separate the causes that repeat: work done per item that could be done once,
   work done eagerly that is needed rarely, a payload carried whole where a
   field would do, an allocation inside a loop, a dependency whose import cost
   lands on every entry point.
4. Stop when the attributed shares account for most of the violation. Chasing
   the last few percent costs more than the fix it justifies.

## Step 4 — Plan

Each violation earns a plan entry, ordered by measured share rather than by how
interesting the fix is:

| Field | Content |
|---|---|
| Violation | budget, measured value, source of the threshold |
| Attribution | `path:line`, share of the violation |
| Approach | the specific change, named concretely |
| Expected effect | the predicted new value, and why |
| Risk | behaviour that could change, and what would catch it |
| Verification | the measurement to repeat, with the Step 2 method note |

Approaches worth naming explicitly, because they recur: split the entry point
so rarely-used code loads when used; cache a derivation whose inputs rarely
change; move per-item work out of the loop; narrow a payload to the fields the
caller reads; batch round trips; replace a dependency whose cost exceeds what
it contributes. Each is a hypothesis until the after-measurement lands.

An approach that trades a documented behaviour for speed — dropping a
validation, weakening a security check, ignoring reduced-motion preferences —
is not in scope here. It is a product decision, and it routes to
`/stamity-plan`.

## Step 5 — Hand off

The deliverable is the plan plus the measurement recipe. It leaves as:

- a `/stamity-work` handoff, when the entries are a change someone can apply
  now, with the before-measurements attached so the after-measurements are
  comparable;
- a `/stamity-plan` intent, when the plan implies an architectural change;
- rows in a wider assessment report, when this run was invoked as part of one.

The audit does not apply the optimizations itself. Applying and measuring in
one pass is how an unmeasured change ships next to a measured one and inherits
its credit.

## Refusals

- **No reproducible slow case.** Without an interaction or input that
  reproduces the symptom, there is nothing to measure: report the candidates
  and what each still needs.
- **Profiler unavailable.** Fall back to explicit timing around the suspected
  paths, and record the fallback in the method notes rather than presenting
  coarse numbers as profile data.
- **Numbers that will not settle.** When the spread across samples is wider
  than the violation being investigated, report the instability as the finding.
