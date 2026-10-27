---
id: a-run-of-record-is-one-composition-link-from-a-full-measure
title: a run of record is one composition link from a full measure
date: 2026-10-27
confidence: high
summary: "the measurements page renders a run of record only one composition link from a full measure, so a passing run composed over a composed prior cannot be it (1.17.0: run 55)"
reviewBy: 2027-01-27
validatedAgainst: "src/cli/docs/measurements.ts readPriorRun at 9c0e6f9a; evals/runs/2026-10-27-run-54, -run-55 and -run-57 RESULTS.md line 12 at records fe785c17"
integrity: sha256:88091e6fb143aa50ac5b3b6ad5ab7a389733f202788eaf16ac4b45d58b4b60c0
---

The measurements page names a run of record only when that run is a full measure or composes
directly with one. A composed run whose prior is itself composed cannot be the run of record, even
when it passes. So a release whose eval runs compose over composed priors needs a full measure
before the composed fix run that is meant to become its run of record.

## Why

`readPriorRun` in `src/cli/docs/measurements.ts` (~:1301-1323) reads the run of record's prior
complete run and refuses when that prior names a prior of its own: the page words one composition
link, a prior that measured every case in full.

The 1.17.0 release met it (records `fe785c17`, each run's `RESULTS.md` line 12). Run 55 passed, but
it composed with run 54, which composed with run 53, so the page refused it. Run 56 then measured all
171 cases, and run 57, composed with run 56 at one link, became the run of record: two more eval
runs after a passing one.

Confidence high: the refusal is in the source, and the 1.17.0 chain shows it.

## How to apply

- When a release's latest run composes over a composed prior, its plan has a full measure before
  the composed fix run that is to become the run of record.
- The chain is read from each run's `RESULTS.md` composition section: a "prior complete run" line
  whose named run has its own such line is two links, and the page refuses it.
- A passing run two links from a full measure still counts as the composed release check; it is
  not the run of record.
