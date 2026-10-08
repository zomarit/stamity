---
id: performance
type: skill
description: Performance axis checks for the verify skill — declared budgets, hot-path cost, and caching posture.
tags: [review]
load: reference
obsolete_when: repositories carry machine-readable performance budgets that client tooling enforces without a check list
---

# Performance axis

Cost per operation, measured against what this repo declared it would spend.

**Advisory unless budgets.** Findings on this axis are advisory — recorded as
evidence, never a merge block — unless a budget declared in the repo is
exceeded, which is a `fail`. `perf-budget-declared` decides that, so it is run
and dispositioned first, before the rows it governs: it is `pass` when at least
one budget class is declared and `fail` when none is, naming the absent classes
— bundle or asset size, latency target, benchmark threshold. It never reports
`skipped`; the row that decides whether the axis gates cannot disable itself.

With zero declared budgets only the rows measured against a budget report
`skipped` with the reason `no declared budget`. The budget-independent rows
still run and still record their census. A row whose subject is absent from the
repo — no build step, no request path, no read-only endpoint — is
`not-applicable` with that detection fact as its evidence, never `skipped`:
`skipped` is for a check that was expected to run and could not. Each row states
its own zero-budget disposition below, and the run records it per row in the
artifact's `checks[].status`, which is where a consumer reads it. An unmeasured
surface is reported as unmeasured, never as passing.

## Runnable checks

**`perf-budget-declared`** — a budget exists to check against.
How: look for an asset-size budget in the build configuration, a p95 or p99
latency target in `docs/specs/` or a service-level document, and a benchmark
threshold wired into the repo's CI configuration.
Threshold: at least one budget class declared. This row gates the axis — its
result decides whether the rows below can `fail` at all.
Zero-budget disposition: `fail`, naming the absent classes.

**`perf-sync-io`** — blocking input or output on a request path.
How: census synchronous file, network, and subprocess calls (the detected
language's blocking forms) reachable from a handler or a render path.
Threshold: 0, each hit cited `file:line` with the call named.
Zero-budget disposition: runs anyway — the threshold is 0, not a budget. Reports
`pass` or `fail` on the census, advisory; `not-applicable` where the repo has no
handler and no render path.

**`perf-payload-size`** — shipped artifact size against the declared budget.
How: run the repo's build command and read the reported artifact sizes; where no
build step is detected, the subject is absent.
Threshold: the declared budget. Without one, report the measured sizes as
evidence so the next run has a baseline to compare against.
Zero-budget disposition: `skipped`, reason `no declared budget`, with the sizes
attached; `not-applicable` when no build step is detected.

**`perf-hot-allocation`** — per-item allocation inside a loop over a
request-scoped collection.
How: census allocations, string building, and repeated serialization or parsing
inside iteration reachable from a request path.
Threshold: a census with counts. A hit becomes a finding only once the path is
identified as hot, which is the first judgment row below.
Zero-budget disposition: runs anyway — a census needs no budget. `pass` with the
counts attached; `not-applicable` where no request path exists.

**`perf-cache-posture`** — cacheable responses and repeated pure computations
state their caching decision.
How: census cache directives on read-only endpoints and memoization on pure
functions called more than once per request.
Threshold: every read-only endpoint states a decision. A directive that turns
caching off counts as a decision; silence does not.
Zero-budget disposition: runs anyway — a stated decision is not a budget.
`not-applicable` where the repo serves no read-only endpoint.

## Judgment checks

Zero-budget disposition, once for this section: a judgment needs evidence, not a
budget, so each row below is decided as written and is `not-applicable` only
where its subject is absent from the change. The one exception states itself.

**`perf-hot-path-identified`** — the change names the path it sits on and
whether that path is hot, warm, or cold. Without it every count above is
unweighted, and an unweighted count is not a performance claim.

**`perf-order-of-growth`** — order of growth over the input this code actually
receives, with the observed input size stated rather than assumed.

**`perf-measure-before-change`** — a performance change cites a measurement
taken before it. An optimization with no baseline is a finding regardless of how
plausible it reads.

**`perf-regression-guard`** — where a budget exists, something keeps it from
drifting: a benchmark in CI, a size assertion, or a latency test. With no budget
declared this row is `not-applicable`: there is nothing to guard yet.
