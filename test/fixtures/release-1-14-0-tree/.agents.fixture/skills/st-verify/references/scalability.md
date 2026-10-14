---
id: scalability
type: skill
description: Scalability axis checks for the verify skill — request-path data access, unbounded reads, and state locality.
tags: [review]
load: reference
obsolete_when: static analysis reports per-request data-access and state-locality defects without a per-repo check list
---

# Scalability axis

Capacity under growth: what the changed surface costs per request as rows,
tenants, and instances multiply. Applicability comes from detection facts — a
repo with no request-handling surface and no datastore client reports every row
below as not-applicable rather than as a pass.

## Runnable checks

**`scale-n-plus-one`** — data-access call inside a loop body.
How: locate loop and iterator constructs whose body reaches the repo's detected
data-access module; where no data layer is detected, judgment-tag the row.
Threshold: 0 on request-path handlers. Evidence: `file:line` per hit plus the
loop bound, so a bounded-by-two loop reads differently from a per-row fetch.

**`scale-unbounded-read`** — collection read with no limit, cursor, or filter.
How: census data-access calls that select a collection without a bound; a bound
supplied by a caller counts only when it is on the same call path.
Threshold: 0 on request-path handlers. Background jobs report their bound
instead of failing, since a batch job reading everything is the job.

**`scale-pagination`** — list-returning endpoints declare a page size and a
continuation form.
How: cross the route or handler inventory with the parameters each accepts;
default page size and maximum page size both stated.
Threshold: 100% of list endpoints; a maximum above 1,000 rows is a hit.

**`scale-local-state`** — process-local state on a horizontally scaled tier.
How: census module-level mutable bindings, in-process caches keyed by a user or
tenant identifier, and in-memory session storage reachable from a handler.
Threshold: 0. Each hit names the state and the request path that reads it.

**`scale-pool-config`** — connection and worker pools declare a ceiling.
How: read the detected datastore client, HTTP client, and worker configuration
for a maximum-connections or maximum-concurrency setting.
Threshold: present and written as a number rather than left to a library
default; a missing ceiling is a hit even when the default happens to fit.

## Judgment checks

**`scale-blocker-census`** — the change's horizontal-scale blockers are named:
sticky sessions, single-writer files, local scheduler state, ordered-processing
assumptions. An accepted blocker is recorded with the constraint it buys.

**`scale-offload`** — work over roughly one second on a request path moves to a
queue or background lane, or the latency is stated as intended and budgeted.

**`scale-back-pressure`** — overload has a named rejection path (bounded queue,
concurrency limit, rejection status with a retry hint) rather than unbounded
buffering that converts a load spike into a memory failure.

**`scale-partition-key`** — where data is sharded or partitioned, the key
spreads load across partitions instead of concentrating the largest tenant on
one of them.

**`scale-retry-idempotency`** — mutations a client can retry are idempotent, or
carry a de-duplication key with a stated retention window.
