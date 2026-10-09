---
id: corpus-line-shifts-move-eval-case-source-ranges
title: corpus line shifts move eval case source ranges
date: 2026-10-09
confidence: high
summary: "an eval case's source: range is typed; a corpus line insert shifts later ranges, and test/evals/locators.test.ts now fails red on every shifted range"
reviewBy: 2027-04-09
validatedAgainst: "test/evals/locators.test.ts anchor and contiguous-quote checks (51899655, 96ec2532), read at 46121954"
integrity: sha256:3c8e319f6463c43a82c3b768718cc64775c4f03ca95f49952dbd33a42360139d
---

An eval case's `source:` key (`content/commands/st-work.md:326-342`) is a hand-typed line
range, not a derivation. Any corpus edit that adds or removes a line moves every range after it.
Since run 2026-10-08_product-core, `test/evals/locators.test.ts` reads every range of every case:
each range's first non-blank line has to be anchored in the case, and each quoted governing
block has to be contiguous, in-order runs of its range with skips only at a `[...]` line. So a
shifted range now fails red in the eval suite, including for a case with no quoted block, which
earlier went stale with no test red at all. The ranges still move by hand.

## Why

Observed on 2026-09-24 in run 2026-09-23_orchestrator-context: ad520576 (build/340) wrapped one
bullet of `content/commands/st-work.md` onto a new line, and the gate of record went red on two
cases with quoted blocks (build/348), while a third case with no quoted block went stale with
nothing red (build/349). bf5a8d3f moved the three ranges by +1 and recorded the move in
`evals/SET-v7.md`, as 82a582d5 had for an earlier move. The guard that build/350 deferred landed
as 51899655 (every range anchored) and 96ec2532 (contiguous quotes) in run
2026-10-08_product-core, and that run's later corpus edits re-quoted shifted cases by script when
the suite went red. Review horizon: retire when `source:` ranges are derived rather than typed.

## How to apply

A corpus edit that changes a cited file's line count shows up as red cases in
`npx vitest run test/evals`, each failure naming the case and the range; a lane whose targeted
set leaves out `test/evals` meets that red later, at the next integration. `rg -n
'^source: content/<path>' evals/cases-v6` lists every case citing the edited file. Earlier moves
were recorded the way 82a582d5 and bf5a8d3f did it: the `source:` cells, a dated paragraph in
`evals/SET-v7.md` naming the moved cases, and the recomputed-count clause.
