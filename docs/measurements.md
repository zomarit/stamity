---
title: Measurements
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs --page measurements`. -->

# Measurements

What this repository can prove about its own output, as of 2026-09-10 — the newest
closed run record's date, which is what this page is stamped with rather than the day it was
rendered. Every number below is computed from a committed artifact, so a claim here can be
checked rather than believed.

The merge-ready figures are rendered from [`evals/measurements/merge-ready-2026-09-15.json`](../evals/measurements/merge-ready-2026-09-15.json), the frozen
measurement committed beside this page. Refreshed per release by `node scripts/merge-ready-rate.mjs --write`
(the release checklist's record-currency line); the snapshot named above is the input, and a
run record written after it is not on this page until the next refresh.

## Verified merge-ready rate

**5 of 7 runs** (0.714).

The rule: verified merge-ready = the final gate table all pass, the last review verdict an approval at or above the record's stated confidence gate (0.8 when unstated), and a findings ledger with no open row; merge evidence is reported per run, never a clause; self-declared wording never counts.

A run enters the measure when its record carries a proof block with at least one gate row
stating a pass or a fail and at least one review verdict. It reaches the numerator when all
three of these hold, each read off an artifact rather than off a sentence:

1. every gate row of the record's final gate table reports a pass;
2. the last review verdict is an approval at or above the confidence gate that record states
   (0.8 when it states none);
3. its findings ledger leaves no row `open`, which is the run-exit invariant `/st-work` declares.

Merge evidence is a reported column, not a fourth clause, because merge-ready is a readiness
and the merge is the maintainer's act afterwards: a record closes before its branch lands,
`CHANGELOG.md` names no pull-request number, and the commit ids a record cites are not
ancestors of `main` after the rebase that landed them — so no committed artifact links most
runs to their merge, and scoring on one would measure the bookkeeping instead of the work.

### Numerator

| Run | Merge evidence |
|---|---|
| `2026-08-31_batch-a-remainder` | none in committed artifacts |
| `2026-08-31_batch-b-docs` | none in committed artifacts |
| `2026-09-04_package-8` | none in committed artifacts |
| `2026-09-04_package-8-closeout` | none in committed artifacts |
| `2026-09-07_package-4` | none in committed artifacts |

### Denominator, less the numerator

These runs carry the evidence the rule reads and did not meet every clause of it. The reason
is the first clause each one missed.

| Run | First clause missed | Merge evidence |
|---|---|---|
| `2026-09-09_package-9` | the final gate table reports a failure | none in committed artifacts |
| `2026-09-10_release-1.4.0` | the last review verdict is not an approval | released version 1.4.0 in CHANGELOG |

### Excluded, with the evidence each one lacks

An unreadable record is missing evidence, not evidence of failure, so these runs are outside
the measure rather than counted against it — and they are published here for the same reason
the number is: an exclusion nobody can see is a number nobody can check.

- `2026-08-31_batch-c-cli-ux` — gates in prose only — no gate row carries a pass or fail
- `2026-08-31_batch-d11-skill-emission` — gates in prose only — no gate row carries a pass or fail
- `2026-08-31_batch-d12-overlays` — gates in prose only — no gate row carries a pass or fail
- `2026-08-31_batch-d14-workspace` — gates in prose only — no gate row carries a pass or fail
- `2026-08-31_batch-d15-worktree` — gates in prose only — no gate row carries a pass or fail
- `2026-08-31_batch-e-release` — gates in prose only — no gate row carries a pass or fail
- `2026-09-01_closure-run` — no record
- `2026-09-01_frontier-review-pr10` — gates in prose only — no gate row carries a pass or fail
- `2026-09-02_package-6` — no record
- `2026-09-09_release-1.3.0` — no review verdict
- `2026-09-10_astra-model-support` — no proof block
- `2026-09-10_enterprise-downstreams` — no proof block
- `2026-09-10_package-10` — no proof block
- `2026-09-10_release-1.5.0` — no review verdict
- `2026-09-11_package-10-readiness` — no record
- `2026-09-11_package-10-session-evals` — no record
- `2026-09-14_package-11` — run in progress

### What the number is limited by, stated rather than tuned away

17 run directories are outside the measure and every one of them is named
above. The denominator is small because the proof block is a convention rather than a required
shape: a run that states its gates in a sentence proves the same work and cannot be read by a
rule.
What would move the number is the record grammar — a gate table and a verdict table every run
writes — not a rewording of this page.

## Reach (a proxy)

Fetched 2026-09-14T21:33Z from the npm registry's public downloads API and committed at
`evals/reach/npm-downloads-2026-09-14.json`, so the numbers below are a reviewable artifact rather than a
reading nobody can reproduce. Source:

`https://api.npmjs.org/downloads/{point/last-week,point/last-month,range/2026-08-25:2026-09-14}/@zomarit/stamity`

| Window | Downloads | Range |
|---|---|---|
| Last week | 590 | 2026-09-05 to 2026-09-11 |
| Last month | 1226 | 2026-08-13 to 2026-09-11 |
| Daily range | 1414 | 2026-08-25 to 2026-09-14, peak 389 on 2026-09-10 |

**What this number is.** npm downloads count package fetches: CI runs, mirrors, and
re-installs are all in it, and one machine installing ten times is ten downloads. It is not
weekly active installations, not users, and not adoption. Real-use data is unmeasured — this
project collects no telemetry — so the figure is published as a proxy, labelled as one, and
never restated as anything else.

## Anti-gaming constraint

The rate reads three artifacts and no prose. A record that calls itself verified, complete, or
shipped moves nothing: the words are never matched. What moves the number is a gate row with
a pass verdict, a review verdict token at or above the record's own confidence gate, and a
findings ledger with no open row.

Three consequences worth stating, because they are what make the number worth reading:

- **Exclusions are published, not dropped.** Every run directory the snapshot read appears
  exactly once across the three lists above. Removing an inconvenient run from the
  denominator would remove it from the tree, which is a reviewable diff.
- **The measure is conservative where it is uncertain.** A run whose approval states no
  confidence, or whose final gate table names one failure, stays in the denominator. The
  number under-claims by construction.
- **Merge evidence is reported, never scored.** It sits in its own column so a reader can see
  what it says without it moving the rate — a clause nothing in the tree can satisfy would
  have measured the bookkeeping rather than the work.

## Corpus behaviour: run of record

The corpus is measured by an eval set, not by inspection. The run of record is
[run 24](../evals/runs/2026-09-11-run-24/RESULTS.md) — the 1.7.0 release run,
PASS, three samples per case:

- Golden rubric pass rate **1.000** (48/48); every floor case passed, 21/21.
- Adversarial guardrail hold rate **1.000** (14/14).
- Benign-twin false-refusal rate **0.000** (0/4).
- Trigger-probe accuracy **1.000** (12/12).

Each figure is the retained artifact's own, and the suite holds these lines to that file. The
run is a retained baseline: it is never re-run to produce a better number, and a set version
or a model change starts a new run rather than editing this one.

## First-run proof

What a first run on a clean machine is proved against, in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- **Tarball smoke (publish shape)** packs the tarball, installs it into a throwaway project,
  runs the leak gate over the packed tree, then `init` and `check`. It is the only lane that
  reads the published shape rather than the source checkout.
- **The `apm-install` job** deploys the APM package with a real client at the tested floor and
  at the current release, plus a regression-witness leg that passes only when the original
  routing failure is still detected.
- **Dogfood check** re-proves this repository's own committed setup drift-clean with the binary
  the job just built, on every leg.
