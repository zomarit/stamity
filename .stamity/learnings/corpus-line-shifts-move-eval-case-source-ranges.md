---
id: corpus-line-shifts-move-eval-case-source-ranges
title: corpus line shifts move eval case source ranges
date: 2026-09-24
confidence: high
summary: "an eval case's source: range is a typed line range; a corpus line insert shifts every later range (build/348, build/349) — run test/evals in the lane and move the ranges plus SET-v7"
reviewBy: 2026-12-03
validatedAgainst: "npx vitest run test/evals/locators.test.ts red on two cases at the sixth batch sync (build/348) and green at bf5a8d3f, with the uncaught probe range checked by hand (build/349)"
integrity: sha256:bbd155243ea8339d7a2f348f8c5453b8cc4a93e9d8b1751f617167b8227e28fd
---

An eval case's `source:` key (`content/commands/st-work.md:326-342`) is a hand-typed line
range, not a derivation. Any corpus edit that adds or removes a line moves every range
after it, and the eval suite is the only thing that notices — and only for a case whose
quoted governing block no longer matches the lines. A case with no quoted block goes
stale with no test red at all. This is the same family as the learning
`surface-pins-are-literals-that-drift`; the trigger is different — any line count change
in a cited corpus file, not a new surface — so it is kept as its own entry.

## Why

Observed on 2026-09-24 in run 2026-09-23_orchestrator-context. ad520576 (ledger row
build/340) wrapped one bullet of `content/commands/st-work.md` onto a new line at 161-162.
The corpus lane's targeted tests did not include `test/evals`, so the shift reached the
sixth batch sync, where the gate of record went red: `test/evals/locators.test.ts` failed
two cases, `benign-optional-step-skipped-proceeds` and `work-proof-block-fields` (build/348).
A third, `probe-none-work-run-qa-checkpoint`, has no quoted block, and nothing caught its
stale range (build/349; the missing guard is deferred as build/350). bf5a8d3f moved the
three ranges by +1 and recorded the move in `evals/SET-v7.md`, following 82a582d5 (the
earlier move of the same four `/st-work` cases). That probe's range had already gone stale
once, unnoticed by the gate, at the first batch sync on 2026-09-23 (build/88). Review
horizon: retire when a test checks every `source:` range against a heading or anchor, not
only the quoted ones.

## How to apply

A lane that adds or removes lines in a corpus file runs `npx vitest run test/evals` in its
own targeted set, then lists every case citing that file:
`rg -n '^source: content/<path>' evals/cases-v6`. Each range that starts after the edit
moves by the line delta, and the case's quoted text is checked byte-identical at the new
lines. A green locator suite does not prove this: it skips cases with no quoted block, so
check those by hand. Record the move the way 82a582d5 and bf5a8d3f did — the `source:`
cells, a dated paragraph in `evals/SET-v7.md` naming the moved cases, and the
recomputed-count clause. Dated citations in dispositions and prose stay as written.
