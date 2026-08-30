---
id: slo-scaffold
type: command
description: "Turns a service with no reliability targets into a versioned objective set — indicator selection, availability and latency targets, error budget, and multi-window burn-rate alert rules; the reliability lens gates the result."
tags: [devops]
load: on-demand
obsolete_when: platform tooling derives vendor-neutral objectives and paired-window burn-rate rules from a declared target without authoring
spawns: [implementer, reviewer]
---

# /stamity-slo-scaffold

Gives a service its first reliability objectives: what is measured, what the target is,
how much budget that leaves, and which alerts consume it. The command resolves the
numbers, delegates every write, and gates what came back.

## Generator contract

1. **Plan first.** Resolve the inputs below into one written spec — indicators, targets,
   derived budget, alert tiers — and confirm it once. That confirmation is the only
   interactive step; after it the run is autonomous through the report.
2. **The implementer writes.** Every file lands through an `implementer` spawn: one per
   service, disjoint paths.
3. **The reviewer gates.** A `reviewer` spawn reads the generated set through the
   Reliability lens and returns a graded verdict with path:line evidence.
4. **One regeneration, then stop.** A failed gate buys exactly one corrective implementer
   pass, scoped to the failing findings. A second failure ends the run: the findings go to
   the operator verbatim and the scaffold is reported not-merge-ready. The cap is
   fail-closed — this loop has no third round and no operator flag that adds one.
5. **The floor is the repo's, not this command's.** Gate criteria are the reliability axis
   of the `st-verify` skill, read from `.stamity/verify/reliability-<sha>.json`, where
   `<sha>` carries the producer's `-dirty` suffix whenever the worktree is unclean. The
   run reads the artifact for the CURRENT key: a clean-tree artifact does not answer for a
   dirty tree, and the gate runs after the implementer has written, so the tree is unclean
   by construction and the `-dirty` key is the normal one here. No artifact for that key
   means invoke the skill for the axis first and gate on what that run wrote. This
   generator builds to that floor and cites it; it does not define one.
6. **The Gate rows below are this generator's acceptance criteria, not a second floor.**
   They state what the generated set must look like for this run to report merge-ready,
   and they are evaluated against the axis artifact as evidence. Each row names the axis
   check id that decides it; that check's own threshold is the passing condition, and this
   table restates none of them.

## Ask before writing

Each trigger stops the run before the first write and asks one question with numbered
options and a declared default, per the core `stamity-question-protocol` rule.

| Trigger | Why it stops |
|---|---|
| Objective definitions already exist for the service | Replacing a live objective set silently moves every alert that consumes it. Options: extend the existing set, write beside it for review, or stop. |
| A target is missing | The budget and every burn-rate threshold derive from the target. A guessed target produces alert rules that fire at the wrong time and read as authored ones. |
| The metric source is unnamed and undetectable | The indicator query shape follows the source. Detection failure is answered by asking, not by picking a vendor. |

## Inputs

| Input | Default | Notes |
|---|---|---|
| Service | ask | one run covers one service; several services are several runs |
| Availability target | ask | `99.9` reads as `0.999` in the generated definition |
| Latency thresholds | ask | one threshold per objective — typically a p95 and a p99 pair |
| Metric source | detected, else ask | drives the query shape and nothing else in the file |
| Window | 30 days, rolling | the budget and the burn-rate constants are both stated against this window, and moving it moves both |
| Budgeting method | event occurrences | ratio of good events to valid events, not time slices |
| Output tree | `slo/` | one definition file and one alert-rule file per service |

## Indicator selection

- **Availability** is a ratio of good events to valid events. Good means responses outside
  the server-error class; valid means every response the service was asked for.
- **Latency** is the ratio of requests served under the threshold, read from a histogram.
  A mean is not an indicator here, and neither is a single pre-computed quantile: an
  average hides exactly the tail the objective exists to bound.
- Every indicator names its query. A metric name that cannot be evidenced in the tree
  stays a named placeholder and is listed in the report — the generator does not invent
  a metric and then assert against it.

## Targets and error budget

The budget is the complement of the target across the window: `budget = (1 − target) ×
window`. It is derived, not chosen.

| Target | Window | Budget | Unavailability it allows |
|---|---|---|---|
| 99.9% | 30 days rolling | 0.1% | about 43 minutes |
| 99.5% | 30 days rolling | 0.5% | about 3 hours 36 minutes |

## Burn-rate alerts

Three tiers, each requiring a long window and a short window to breach together, so one
transient spike does not page.

| Tier | Budget consumed | Long window | Short window | Burn rate | Action |
|---|---|---|---|---|---|
| Fast | 2% in 1 hour | 1 hour | 5 minutes | 14.4× | page |
| Medium | 5% in 6 hours | 6 hours | 30 minutes | 6× | page |
| Slow | 10% in 3 days | 3 days | 6 hours | 1× | ticket |

The three constants are fixed by the recipe for a 30-day window, and each one is that
window divided by its long window times the budget the tier spends: 2% over 720 hours in
1 hour is 14.4×, 5% in 6 hours is 6×, 10% in 72 hours is 1×. They are not per-service
tuning; the only per-service input is the target that scales the budget underneath them.
A different window is a different set of constants — recompute all three rather than
carrying these over, or the alerts fire at a rate nobody chose.

Every generated rule carries a runbook reference — a page with no runbook is a gate
failure, not a style preference.

## A repo with no observability stack

The definitions are still written, and the report says plainly what is not wired. The
objective set, the derived budget, and the three alert tiers land in the vendor-neutral
form; the metric queries stay named placeholders; nothing is exported, loaded, or
received. The file set is the seam — wiring it into a collector and a rule loader is a
separate change with its own review. A scaffold that reported a live objective here would
be the one outcome worth refusing.

## Flow

1. **Detect and resolve.** Read the manifest, the observability configuration if any, and
   any existing objective files. Fill the input table; ask on a live trigger.
2. **Plan.** Write the resolved spec with the derived budget and confirm it once.
3. **Build.** One `implementer` per service, file-disjoint.
4. **Gate.** One `reviewer` on the Reliability lens over the generated set, with the axis
   artifact as its evidence input.
5. **Regenerate at most once**, scoped to the failing findings, then re-gate those rows.
6. **Report.** Files written, gate verdict, placeholders to fill, and the wiring the
   operator still owns.

## Gate rows

Each row names the reliability-axis check that decides it. The check's threshold is the
passing condition — this table selects which checks bind a generated objective set and
adds an acceptance criterion where no check covers one.

| Row | Axis check that decides it | What this run checks it against |
|---|---|---|
| Objective completeness | `rel-slo-objective` | the versioned objective file this run wrote |
| Availability and latency targets | `rel-availability-target` | every declared objective, each with its threshold pair |
| Error budget | `rel-error-budget` | the budget stated in the file against the one derived from the target |
| Alert tier shape | `rel-burn-rate-alert` | the three generated tiers and their paired windows |
| Window consistency | `rel-slo-window` | the 30-day window and the 14.4× / 6× / 1× constants stated against it |
| Runbook reference | `rel-slo-owner` | every generated rule |
| Syntax | — no axis check covers this | validated with the repo's rule validator when one is present; recorded as "validator absent" otherwise, never as a pass |

The six ids are cited, never defined here: their `How:` and `Threshold:` prose lives in the
axis reference the run reads as evidence, and a second copy in this pack would drift from
the artifact the gate actually wrote.

## Report and boundaries

- The run writes definitions and alert rules. It deploys nothing, reloads nothing, and
  creates no branch, commit, or pull request.
- Placeholders are reported as work remaining, with the file and line of each.
- A run that ends after the second gate failure reports `not-merge-ready` with the open
  findings attached. Reporting it as complete is a contract breach.
