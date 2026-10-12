---
id: reliability
type: skill
description: Reliability axis checks for the verify skill — error-path handling, outbound deadlines and retry safety, graceful shutdown, and health signals.
tags: [review]
load: reference
obsolete_when: framework defaults enforce outbound deadlines, bounded retries, and drain-on-terminate across the stacks this axis covers
---

# Reliability axis

What the code does when something else fails: whether failures are handled or
swallowed, whether calls that leave the process have a deadline and a safe
retry, whether the process stops without dropping work, and whether anything
outside can tell that it is healthy.

Not applicable when the repo runs no process and makes no outbound call — a pure
library with no I/O records `not-applicable` rows citing that absence, per the
run contract in `SKILL.md`.

## Runnable checks

Each row: what it establishes · how to run it from detection facts · threshold.

- **`rel-error-path`** — no failure is swallowed. How: census every catch,
  rescue, or recover block for one of logging, re-raising, or a handling branch;
  an empty body counts. Threshold: 0 handlers with no action; a deliberate
  swallow carries an inline reason on the line.
- **`rel-timeout`** — every outbound call carries a deadline. How: enumerate
  call sites against the HTTP, RPC, database, cache, and queue clients found in
  the dependency manifest; confirm a timeout argument or a client-level default
  that covers them. Threshold: 0 call sites with no deadline; each client's
  default budget is declared once, in code, not in prose.
- **`rel-deadline-propagation`** — an inbound deadline reaches the calls it
  causes. How: trace the request-scoped cancellation value the stack provides
  from handler entry to outbound call. Threshold: 0 outbound calls that start a
  fresh unbounded budget inside a request already bounded.
- **`rel-retry-safety`** — retries are bounded, spaced, and safe to repeat. How:
  find retry wrappers and loops; read attempt limits, delay growth, jitter, and
  the idempotency of what is retried. Threshold: 0 unbounded retries; 0 retried
  non-idempotent operations lacking a deduplication key.
- **`rel-breaker`** — a downstream that keeps failing stops being called. How:
  confirm a circuit breaker or equivalent guard wraps each outbound dependency,
  with open/half-open thresholds set. Threshold: guard present per dependency,
  or the dependency is documented as non-critical.
- **`rel-shutdown`** — the process exits without dropping in-flight work. How:
  detect the termination-signal handler; confirm it stops accepting new work,
  flips readiness, and drains before exit. Threshold: handler present for every
  long-running entry point; one-shot commands record `not-applicable`.
- **`rel-health`** — liveness and readiness are separate signals. How: locate
  the health endpoints or probe config. Threshold: distinct endpoints; readiness
  reflects dependency state, liveness reflects only the process itself.

### Objective shape

The six rows a service's reliability objectives are graded against. They are the
floor a generator's output is measured by, so they live here rather than beside
any one generator. A repo that declares no objectives records them
`not-applicable` citing the absent objective file.

- **`rel-slo-objective`** — the service states what it promises, in a versioned
  file. How: locate the objective definitions in the tree and read one indicator
  per objective — a ratio of good events to valid events, not a mean.
  Threshold: at least one objective per user-facing service; an indicator built
  on an average or a pre-computed quantile is a `fail` row.
- **`rel-availability-target`** — the availability objective carries a number.
  How: read each objective's target and the latency thresholds declared beside
  it. Threshold: a target per objective; a declared latency objective with no
  threshold pair is a `fail` row.
- **`rel-error-budget`** — the budget is derived from the target, not chosen.
  How: recompute the allowed unavailability from the target over the declared
  window and compare it against the budget the file states. Threshold: the
  stated budget equals the derived one; a budget with no target behind it is a
  `fail` row.
- **`rel-burn-rate-alert`** — alerting fires on budget burn, not on a raw
  threshold. How: read the alert rules bound to each objective; count the tiers
  and confirm each pairs a long and a short window. Threshold: every objective
  has burn-rate rules, each tier pairing a long and a short window; 0 rules
  alerting on a bare error count.
- **`rel-slo-window`** — every number states the window it holds over. How:
  census the rolling window per objective and confirm the burn-rate constants
  are stated against that same window. Threshold: one window per objective, and
  every constant references it; a mixed-window objective set is a `fail` row.
- **`rel-slo-owner`** — someone answers when the budget burns. How: read the
  owner and the runbook reference on each objective and on each generated rule.
  Threshold: owner and runbook present per objective; a rule with no runbook is
  a `fail` row.

## Judgment checks

- **`rel-blast-radius`** — the change states what breaks if it fails, who sees
  it, and the exact step that reverts it.
- **`rel-degradation`** — a dependency outage degrades the surface to a reduced
  mode rather than a total failure, where a reduced mode is meaningful.
- **`rel-data-safety`** — schema and data changes are reversible, or forward-only
  by explicit design with the one-way step named.
- **`rel-observability`** — the failure this change makes possible would be
  visible: a signal exists that moves when it happens.
