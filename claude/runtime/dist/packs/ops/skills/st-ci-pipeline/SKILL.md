---
id: ci-pipeline
type: skill
description: "Designs and tunes a continuous-integration pipeline — stage graph, job parallelism, dependency and build caches, test sharding, artifact retention, and a wall-clock budget per stage. Triggers when a pipeline is authored or restructured, when a gate run has grown too slow to wait for, or when caching and sharding want rebalancing."
tags: [devops]
load: on-demand
obsolete_when: build systems derive an optimal stage graph, cache keys, and shard balance from repository history without hand tuning
---

# CI pipeline

Design the graph, then make it fast. A pipeline nobody waits for is a pipeline
people route around.

## Quick Start

1. Measure the current pipeline before changing it (Step 1).
2. Lay out the stage graph and its gates (Step 2).
3. Cache and shard the slow stages (Step 3).
4. Build once, promote the same artifact (Step 4).
5. Land it incrementally and re-measure (Step 5).

## Step 1 — Measure first

Record per stage: wall-clock duration, queue time, cache hit ratio, and failure
rate over the last few dozen runs. Name the critical path — the chain that
decides total duration — and the flaky stages, which cost more than their
duration suggests because they cost a re-run.

A tuning pass with no baseline cannot report an improvement, only a change.

## Step 2 — Stage graph

- Split by cost and blast radius: install, static checks, unit tests,
  integration tests, build, deploy.
- Run static checks and unit tests concurrently after install — they share no
  state and neither needs the other's result.
- Fail fast on the cheap stages: a failing static check stops the run before
  the expensive stages start.
- Gate deploys on the full check set, and gate the production stage on a manual
  approval. An automatic production deploy on a green build is a decision, not
  a default — make it deliberately or not at all.
- Keep the merge-blocking set small and honest. A required check that is
  routinely re-run until green is not a gate.

## Step 3 — Caching and sharding

- Key dependency caches on the lockfile hash so a dependency change misses and
  everything else hits. Verify by reading the cache-hit line in a second run,
  not by assuming.
- Cache the build output separately from dependencies; they change at different
  rates and one busting the other is the common cache defect.
- Shard slow suites across runners using recorded per-test timings, not file
  counts — equal file counts produce unequal shards.
- In a monorepo, select by change: run the affected packages and their
  dependents. Establish the dependent set from the project graph rather than by
  hand.

Target band for a mid-sized repository: static checks under 2 minutes, unit
tests under 5, integration under 10, push to deployable artifact under 15, with
a cache hit ratio above 80%. Treat these as budgets with owners, not as
decoration: a stage over budget gets a fix or an explicit raise.

## Step 4 — Artifacts

Build once and promote the same bytes through environments — rebuilding per
environment means the thing tested is not the thing deployed. Tag artifacts
with the commit SHA, retain production artifacts long enough to roll back to
them, and expire pull-request artifacts on merge. Store the build metadata —
commit, branch, time, test results — alongside the artifact so a deployed
version can be traced back without a spelunking session.

## Step 5 — Land and verify

Change one stage at a time on a branch and compare against the Step 1 baseline.
Confirm that concurrent stages really are independent — a shared cache key or a
shared fixture directory is a race that shows up as flakiness weeks later.
The definition is one file at its platform's path — under `.github/workflows/`,
or `.gitlab-ci.yml`, or `azure-pipelines.yml`. Validate it locally before
pushing; a syntax defect costs a full queue cycle to discover otherwise.

Write down the resulting graph and the budgets next to it. The next person to
add a stage needs to know which invariants they are working against.

## Supply-chain floor

The pipeline is the supply chain, so these are design inputs rather than later
hardening:

- Pin every third-party action, task, or image by full commit SHA or content
  digest — a moving tag is an unpinned dependency with publish access to the
  build.
- Install from the lockfile only, with lifecycle scripts off where the
  ecosystem allows.
- Run the dependency advisory check as a gate, not as a report nobody reads.
- Grant each job the narrowest permission set it needs, and use short-lived
  workload identities instead of stored credentials.
- Emit the release evidence — SBOM, provenance, signatures — from the pipeline,
  where the build actually happened.
