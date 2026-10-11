---
id: ledger-blocks-are-read-strictly
title: ledger blocks are read strictly
date: 2026-10-11
confidence: high
summary: ledger append refuses a findings block for one summary over 300 characters; ledger close --report refuses any key but ledger_id, status, rationale, and a report name with a suffix
reviewBy: 2027-01-11
validatedAgainst: "the refusals the ledger verb printed in run 2026-10-10_next-tier (summaries of 305, 320 and 345 characters; a closures block keyed closure and evidence; a report named with a suffix), recorded in that run record, and the three later closures blocks it accepted once the dispatches named the keys"
integrity: sha256:99a99e9826b4e385464dcd147ebe2f5ff85c3710ca85c893e3d6afbc1af057da
---

The `ledger` verb reads a role's blocks strictly and refuses a whole block for one bad line, so
nothing is appended or closed until the orchestrator repairs it.

- **Findings:** `ledger append` refuses the block when any `summary` is over 300 characters.
- **Closures:** `ledger close --report` refuses the block when a line carries any key other than
  `ledger_id`, `status` and `rationale`, or names an id that was not handed in with `--ids`.
- **Report names:** `--report` takes only a file named `<pass>-<role>-r<N>.md` directly inside
  the run's `reports/` folder; a suffix after `r<N>` is refused.

## Why

Seen repeatedly in run 2026-10-10_next-tier, each time costing a repair step: verdict reports
whose one summary ran over the cap (305, 320 and 345 characters among them, two from the final
whole-branch review); one closures block written with the keys `closure` and `evidence`; one
fixer report named with a suffix after the round. Each time the refusal named the line and the cause, and the
rows were filed through `--stdin` from the same text with the one line repaired, or applied by
`--id` with the report's own evidence. Once the dispatches spelled the three keys out, no later
closures block was refused.

## How to apply

Say all three in every dispatch that returns a block: each summary at most 300 characters; a
closures line holds exactly `ledger_id`, `status` and `rationale`; the report's file name ends
at `r<N>.md`. When a block is refused anyway, do not edit the role's report: copy its block,
shorten the one summary, and file it with `--stdin`; for closures, apply each verdict with
`--id`, `--state` and a rationale that cites the report. Record in the run record that the
orchestrator re-filed it and why.
