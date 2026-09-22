---
description: Failure contract for code that calls out of the process — a circuit breaker per dependency, retry with decorrelated jitter under a budget, a deadline that propagates and never resets, idempotent handlers for at-least-once delivery, and the logging and metric floor that makes each of them observable.
applyTo: "**/server/**,**/services/**,**/api/**,**/workers/**,**/queue/**"
---

# Resilience

Every call that leaves the process is a dependency on something that will be
slow, unavailable, or duplicated before the service is retired. The floor below
is what keeps one failing dependency from becoming an outage of the whole
surface, and what keeps the recovery from being worse than the failure.

## Floor

1. **A circuit breaker per external dependency, with named thresholds.** Four
   numbers, recorded where the dependency is configured: the failure count or
   ratio that opens it, the rolling window that count is measured over, the
   minimum request volume below which the window is not judged (so cold traffic
   cannot trip it), and the cooldown before one trial call. The trial closes
   the breaker on success and reopens it for another cooldown on failure. State
   transitions are shared between dependencies at no point: one breaker per
   dependency, or one slow dependency takes down calls to healthy ones.
2. **Only a transient failure counts toward the threshold.** A timeout, a
   refused connection, or an upstream 5xx says the dependency is unwell; a
   rejected argument or a failed authorisation says the request was wrong and
   will be wrong again. Substantive failures return to the caller immediately —
   they neither open breakers nor consume retry budget. An unmapped failure is
   treated as transient with a single attempt, not with the full budget.
3. **Retry with decorrelated jitter, under a budget.** Each delay is drawn
   randomly between the base delay and three times the previous delay, capped.
   Backoff without jitter synchronises every client onto the same schedule and
   turns recovery into a second outage. The budget caps retry traffic as a
   share of base traffic — exceeding it signals a sustained failure, so the
   call fails fast instead of amplifying load. A server-supplied retry-after
   wins over the computed delay. Retries wrap inside the breaker, so an open
   breaker short-circuits before any attempt fires.
4. **The deadline propagates and never resets.** A request carries a remaining
   time budget; each hop passes down what is left, minus its own overhead, and
   no hop restores the original value. A call that exceeds its budget is
   cancelled rather than awaited to completion. With the parent budget spent,
   no retry is attempted — there is no time left to succeed in. Every call that
   leaves the process has an explicit timeout, including the ones to
   infrastructure that is usually fast.
5. **Handlers are idempotent, because delivery is at-least-once.** Queues,
   webhooks, and retried writes deliver the same message more than once;
   processing it twice reaches the same end state as processing it once,
   observed through a stored key, a conditional write, or a natural key in the
   data. Operations that are not naturally idempotent carry a caller-generated
   key, stable across every attempt at the same logical operation, and the
   receiver replays the stored outcome for a duplicate rather than repeating
   the effect.
6. **Each broken call has a fallback.** A cached value, a static default, or a
   degraded feature that renders without the enrichment. A non-critical
   dependency failing does not fail the whole request path; which behaviour
   degrades is decided while writing the call, not by the person on call.
7. **Observability floor.** Logs at process boundaries are structured records
   with a correlation identifier that travels with the deadline, so one
   request's path is reconstructable across services. Per dependency: request
   rate, error count by class, and duration distribution, plus a signal on
   every breaker state transition and on retry-budget exhaustion. Saturation
   signals — pool usage, queue depth — accompany them for anything pooled. No
   credential, token value, or personal datum enters a log line, a metric
   label, or a span attribute; identifiers are referenced, not copied.

## Gates

- A call that leaves the process without an explicit timeout does not ship, and
  neither does a retry loop with no jitter or no budget.
- An outbound call added to a dependency that has no breaker adds one, or
  states in the change why fail-fast is unnecessary for that dependency.
- A handler reachable by at-least-once delivery carries a test that runs the
  same message twice and asserts one effect.
- Retry, breaker, and timeout behaviour is asserted by tests that inject the
  failure, not by reading the configuration back.
- Unbounded label values on a metric, and a log line carrying a credential or
  personal datum, are Critical findings.
