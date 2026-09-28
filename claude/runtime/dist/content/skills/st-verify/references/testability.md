---
id: testability
type: skill
description: Testability axis checks for the verify skill — coverage read as data against the repo's own thresholds, suite shape, quarantined-test census, and determinism signals.
tags: [review]
load: reference
obsolete_when: coverage, flake, and determinism reporting is a first-class client surface reading each repo's declared thresholds
---

# Testability axis

Whether this repo can tell the truth about itself: what the suite covers, what
shape it has, what has been quarantined, and whether a green run means the same
thing twice.

Thresholds are data, not dogma. Every numeric floor comes from the repo's own
configuration; where a repo declares none, the measured numbers are reported as
evidence and the row is `not-applicable` — the absent threshold source is the
detection fact that decided it — never failed against an imported floor. `kind`
is fixed by the section a row sits in and `status` holds no `judgment` member,
so "mark the row judgment" is not a disposition a run can write.

## Runnable checks

Each row: what it establishes · how to run it from detection facts · threshold.

- **`test-gate-green`** — the declared gates pass from a clean checkout. How: run
  the full verification gate the charter's repo facts declare — its lint,
  typecheck and test commands chained — and record per-gate exit status with any
  failing excerpt. Threshold: exit 0; a gate that cannot run is `skipped` with
  the exact command recorded.
- **`test-coverage-data`** — coverage is measured against the repo's own floors.
  How: read the coverage configuration for the test framework the charter's repo
  facts name (or the equivalent config the repo declares) plus the latest
  coverage report; compare per module, not only globally. Threshold: the repo's
  declared thresholds; with none declared, report the measured numbers as
  evidence and record the row `not-applicable`, citing the absent coverage
  configuration as the detection fact.
- **`test-suite-shape`** — the suite's distribution is known. How: count tests
  per class — unit, integration, end-to-end — from the directory and naming
  conventions the repo uses. Threshold: reported as a distribution; a class the
  repo declares but populates with 0 tests is a `fail` row.
- **`test-quarantine-census`** — every silenced test is accounted for. How:
  census skip, todo, exclude, and quarantine markers across the suite; read the
  reference each carries. Threshold: 0 markers with no tracking reference or
  owner; the census is reported even when the count is 0.
- **`test-determinism`** — nondeterministic inputs are injected, not reached for.
  How: census direct clock, random, network, and filesystem calls inside paths
  the suite asserts on. Threshold: 0 direct calls in code whose tests assert on
  time, ordering, or generated identifiers.
- **`test-isolation`** — tests do not leak state into each other. How: census
  module-level mutable fixtures, shared temporary paths, and writes to shared
  locations in test files; confirm per-case setup and teardown. Threshold: 0
  shared mutable fixtures; a run in reverse or random order stays green.
- **`test-mock-census`** — the real-versus-mocked ratio is visible. How: count
  test cases whose only assertions are about mocked interactions, against the
  total. Threshold: reported as a ratio; the repo's own mock-justification
  convention decides the verdict, and each mock carries an inline reason.

## Judgment checks

- **`test-oracle-independence`** — expected values are derived from the
  specification, not copied from what the implementation currently returns.
- **`test-failure-legibility`** — a failing test names the artifact and the
  condition that broke, so the message alone starts the fix.
- **`test-critical-depth`** — the paths whose failure costs most carry the
  deepest tests, rather than coverage spread evenly by file size.
- **`test-change-integrity`** — tests weakened, deleted, or special-cased in the
  same change that makes them pass are findings, each needing a stated reason.
