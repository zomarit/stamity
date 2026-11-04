---
id: a-run-of-record-is-one-composition-link-from-a-full-measure
title: a run of record is one composition link from a full measure
date: 2026-10-27
confidence: high
summary: "the measurements page renders a composed run of record only when every safety case was measured in a run dated after the previous release, and a chain must also list them in its results file"
reviewBy: 2027-02-04
validatedAgainst: "src/cli/docs/measurements.ts readPriorRun and proveChain on branch fb/release-speed; evals/runs/2026-10-27-run-54, -run-55 and -run-57 RESULTS.md line 12 at records fe785c17"
integrity: sha256:9f2df8d8b0963e0ef7e15acdb9d5fe369a1848e3d1159692b8e38eca0afab817
---

The measurements page names a run of record when that run is a full measure, composes directly with
one of its own release, or shows every safety case measured in a run of its release. A run is in a
release only when its id's date is after the previous release's date in `CHANGELOG.md`, so a run
composed one link onto an earlier release's full measure is refused too unless it re-measured every
safety case. A composed run whose prior is itself composed and which carries no list of them cannot
be the run of record, even when it passes. So before a release's fix run, check whether the chain will
carry the list; if it will not, the release needs a full measure first.

## Why

`proveChain` in `src/cli/docs/measurements.ts` holds every composed run of record: the walk ends at a
full measure, the third-release or 30-day backstop has not come due, and every safety case of the
run's § 6 was last measured in a run dated after the previous release. `readPriorRun` also refuses a
prior that names a prior of its own unless the results file carries a `## 0a. Safety measure` section
whose rows `proveChain` accepts. The section states the release and its rows; which runs are in the
release, and the backstop, come from dates.

The 1.17.0 release met the old refusal (records `fe785c17`, each run's `RESULTS.md` line 12). Run 55
passed, but it composed with run 54, which composed with run 53, so the page refused it. Run 56 then
measured all 171 cases, and run 57, composed with run 56 at one link, became the run of record: two
more eval runs after a passing one, about four hours. The list replaces that cost, and
`evals/SET-v7.md` ("What a release measures", 2026-11-04) states the rule.

Confidence high: the refusal and its one exception are in the source, and the tests in
`test/cli/docs/measurements.test.ts` hold each way the list can fall short.

## How to apply

- Plan a release's eval so the whole safety set and every moved case are measured on a candidate of
  that release; a safety case that did not move is added by name.
- The chain is read from each run's `RESULTS.md` composition section: a "prior complete run" line
  whose named run has its own such line is two links.
- A run two links from a full measure with no `## 0a. Safety measure` section still counts as the
  composed release check; it is not the run of record. The fix is a run that carries the section, or
  a full measure before the composed fix run.
- On the third release since the full measure, or 30 days after it, no composed run renders, one link
  included: run a full measure.
