---
id: ledger-blocks-are-read-strictly
title: ledger blocks are read strictly
date: 2026-10-11
confidence: high
summary: ledger append refuses a findings block for one summary over 300 characters; ledger close --report refuses any key but ledger_id, status, rationale, an id not handed in, and a report name with a suffix
reviewBy: 2027-01-11
validatedAgainst: "src/runs/blocks.ts (the 300-character summary cap; the closures keys ledger_id, status and an optional non-empty rationale) and src/runs/ledgerStore.ts (the handed-ids refusal) read at ec6eddcf; the refusals in the record of run 2026-10-10_next-tier (search it for the word refused): summaries of 305, 320 and 345 characters, one closures block with unknown keys, one report named with a suffix"
integrity: sha256:dedc04c54ab08d160aaa173f579ae3162d1904cb7d9d6ae12fb10e916dc72320
---

The `ledger` verb reads a role's blocks strictly and refuses a whole block for one bad line, so
nothing is appended or closed until the block is right.

- **Findings:** `ledger append` refuses the block when any `summary` is over 300 characters.
- **Closures:** `ledger close --report` refuses the block when a line carries a key other than
  `ledger_id`, `status` and `rationale` (the last is optional, and refused when present and
  empty), or names an id that was not handed in with `--ids`.
- **Report names:** `--report` takes only a file named `<pass>-<role>-r<N>.md` directly inside
  the run's `reports/` folder; a suffix after `r<N>` is refused.

## Why

Seen repeatedly in run 2026-10-10_next-tier, each time costing a repair step: verdict reports
whose one summary ran over the cap (305, 320 and 345 characters among them, two from the final
whole-branch review); one closures block written with the keys `closure` and `evidence`; one
fixer report named with a suffix after the round. Each refusal named the line and the cause.
The findings were filed through `--stdin` from the same text with the one summary shortened.
The one refused closures block held four `fixed` verdicts, every id among those handed to that
re-review, and each was applied with `--id` and a rationale citing the report. Unverified: no
block was refused in that run for an id that was not handed in, and no refused block held a
verdict other than `fixed`.

## How to apply

Say the rules in every dispatch that returns a block: each summary at most 300 characters; a
closures line carries `ledger_id`, `status` and, when there is something to say, a `rationale`,
and no other key; the report's file name ends at `r<N>.md`.

When a findings block is refused for a long summary, leave the role's report as it is, copy the
block, shorten the one summary and file it with `--stdin`.

When a closures block is refused, first read why. A refusal for an id that was not handed in is
the guard doing its work: no row the re-review was not asked about may move, so nothing is
applied by hand; hand the id to a re-review that is asked about it. A refusal for the block's
form alone (a wrong key) may be repaired by hand only for verdicts of `fixed` on ids that were
handed in, the one case that run proved, each with `--id`, `--state fixed` and a rationale that
cites the report. For any other verdict, resume the role or spawn a fresh re-review for a block
in the right form: `not-fixed`, `regressed` and a rejection overturned leave a row open, which
the manual close cannot write. Record in the run record what was re-filed or applied by hand,
and why.
