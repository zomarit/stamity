---
title: Measurements
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs --page measurements`. -->

# Measurements

What this repository can prove about its own output, as of 2026-10-12 — the newest
closed run record's date, which is what this page is stamped with rather than the day it was
rendered. Every number below is computed from a committed artifact, so a claim here can be
checked rather than believed.

The merge-ready figures are rendered from [`evals/measurements/merge-ready-2026-10-13.json`](https://github.com/zomarit/stamity/blob/records/evals/measurements/merge-ready-2026-10-13.json), the frozen
measurement this page pins; the snapshots live on the `records` branch. A release moves the
figures in three steps (the release checklist's record-currency line): `node scripts/merge-ready-rate.mjs --write`
freezes a new snapshot, `node scripts/records.mjs commit -m <message>` publishes it, and the pin
moves in the `main` commit that regenerates this page. A run record written after the pinned
snapshot is not on this page until then.

## Verified merge-ready rate

**7 of 19 runs** (0.368).

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
| `2026-09-17_plugin-lifecycle` | none in committed artifacts |
| `2026-09-30_release-1-11-0` | released version 1.11.0 in CHANGELOG |

### Denominator, less the numerator

These runs carry the evidence the rule reads and did not meet every clause of it. The reason
is the first clause each one missed.

| Run | First clause missed | Merge evidence |
|---|---|---|
| `2026-09-09_package-9` | the final gate table reports a failure | none in committed artifacts |
| `2026-09-10_release-1.4.0` | the last review verdict is not an approval | released version 1.4.0 in CHANGELOG |
| `2026-09-23_orchestrator-context` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-09-28_replay-v2` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-10-03_pack-engine-defects` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-10-06_rehearsal-bounded-content` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-10-06_security-alerts` | the approval states no confidence to compare to the gate | pull request #79 in CHANGELOG |
| `2026-10-07_release-1-12-0` | the last review verdict is not an approval | released version 1.12.0 in CHANGELOG |
| `2026-10-07_security-fixes` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-10-10_next-tier` | the approval states no confidence to compare to the gate | none in committed artifacts |
| `2026-10-11_release-1-14-0` | the last review verdict is not an approval | released version 1.14.0 in CHANGELOG |
| `2026-10-12_board-writes` | the last review verdict is not an approval | none in committed artifacts |

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
- `2026-09-14_package-11` — no proof block
- `2026-09-16_package-14` — no proof block
- `2026-09-17_codex-astra-audit` — no record
- `2026-09-24_enterprise-release` — gates in prose only — no gate row carries a pass or fail
- `2026-09-30_optimization-sweep` — gates in prose only — no gate row carries a pass or fail
- `2026-10-01_pr73-pr-resolve-r1` — no proof block
- `2026-10-01_pr73-review-round-1` — gates in prose only — no gate row carries a pass or fail
- `2026-10-02_pr73-pr-resolve-r2` — no proof block
- `2026-10-02_pr74-pr-resolve-r1` — no proof block
- `2026-10-02_pr74-review-round-1` — gates in prose only — no gate row carries a pass or fail
- `2026-10-02_pr75-pr-resolve-r1` — no proof block
- `2026-10-02_pr75-review-round-1` — gates in prose only — no gate row carries a pass or fail
- `2026-10-02_pr76-pr-resolve-r1` — no proof block
- `2026-10-02_pr76-pr-resolve-r2` — no proof block
- `2026-10-02_pr76-review-round-1` — gates in prose only — no gate row carries a pass or fail
- `2026-10-03_debug-pack-defects` — no proof block
- `2026-10-08_inbox-pass` — no proof block
- `2026-10-08_maintainer-tooling` — gates in prose only — no gate row carries a pass or fail
- `2026-10-08_product-core` — gates in prose only — no gate row carries a pass or fail
- `2026-10-11_debug-claude-plugin-walk` — no proof block

### What the number is limited by, stated rather than tuned away

36 run directories are outside the measure and every one of them is named
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
[run 45](https://github.com/zomarit/stamity/blob/records/evals/runs/2026-10-11-run-45/RESULTS.md) — the 1.14.0 release run —
PASS as composed, three samples per case.

That run is composed rather than measured end to end, under SET-v7's incremental rule: one
full baseline run per release, and a later run on another candidate re-measures only the cases
whose inputs moved and carries the rest with provenance.
Run 44 measured every case in full.
[Run 44](https://github.com/zomarit/stamity/blob/records/evals/runs/2026-10-11-run-44/RESULTS.md) alone was FAIL on two floor cases, `unattended-run-applies-declared-default`, `work-frame-reads-matching-inbox-rows`, and the benign-twin false-refusal rate not met; run 45 re-measured five cases, composed with run 44, and carried the other 136 from it.
The re-measured cases are `benign-state-note-not-screened` (case file bytes moved), `ask-narrow-symbol` (case file bytes moved), `unattended-run-applies-declared-default` (case file bytes moved), `work-frame-reads-matching-inbox-rows` (case file bytes moved) and `work-lockfile-only-bump-audit-before-lens` (case file bytes moved).
Each carried case is named in the composed artifact with its case-file hash and the source
ranges found identical at both candidates. The set is SET-v7.

Run 45's results file states why the run happened, in its § 3, quoted as it stands:

> The 1.14.0 release run's increment. Run 44, the full baseline at ecd0c494, is FAIL on five cases. Each was diagnosed as a defect of the case and fixed: one Brief re-quoted, four Expected rows amended, no threshold, floor tag or roster count moved. This run re-measures those five cases, whose bytes moved, and carries the other 136 from run 44.

A case file that moved between run 44 and run 45 was changed after run 44's scores were known,
and the dated paragraphs of [`evals/SET-v7.md`](../evals/SET-v7.md) say what each change is and what it admits.
Run 45 carries a note beside its results file, [`NOTE.md`](https://github.com/zomarit/stamity/blob/records/evals/runs/2026-10-11-run-45/NOTE.md), to be read with it.

The scoring rule is SET-v6, which is what run 45's own score table is headed with.
The figures below score that whole set:

- Golden rubric pass rate **0.988** (80/81); every floor case passed, 31/31.
- Adversarial guardrail hold rate **1.000** (24/24).
- Benign-twin false-refusal rate **0.000** (0/6).
- Trigger-probe accuracy **1.000** (30/30).

Each figure is the retained artifact's own, and the suite holds these lines to that file. The
run is a retained baseline: it is never re-run to produce a better number, and a set version
or a model change starts a new run rather than editing this one.

## First-run proof

What a first run on a clean machine is proved against, in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml):

- **Tarball smoke (publish shape)** packs the tarball, installs it into a throwaway project,
  runs the leak gate over the packed tree, then `init` and `check`. It is the only lane that
  reads the published shape rather than the source checkout.
- **Dogfood check** re-proves this repository's own committed setup drift-clean with the binary
  the job just built, on every leg.
