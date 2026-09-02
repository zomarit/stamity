---
description: Curation posture for the learnings directory — one topic per file merged on overlap, confidence bands that move only on verified outcomes, what does not earn a file, and the cap read as a signal to retire rather than to raise.
applyTo: .stamity/learnings/**
---

# Learnings Schema

A learning is a curated, repository-specific finding that re-enters context on a
later session. Its shape is the write gate's, not this rule's: `stamity learn
capture` refuses a draft with the requirement it failed and the rewrite that
requirement wants, and `stamity validate` reports each one by file and reason
across the directory. Nothing here restates them. What is left is the part no
gate decides — which findings earn a file, and when one stops earning it.

## Floor

1. **One topic per file, merged on overlap.** Two notes covering one topic
   consolidate into the higher-confidence one, which records the ids it
   absorbed; a note spanning two topics splits before it is written.
2. **Promotion follows verified outcomes.** A claim that produced a green
   verification on repeated use moves up a confidence band; one contradicted by
   a later run moves down a band, and a second contradiction retires it. A
   verified learning outranks a plausible hypothesis, and being consulted often
   is popularity, not evidence — it promotes nothing on its own.
3. **What is not a learning.** General programming knowledge, restated
   documentation, and one-off narration of a session. A learning records what
   this repository did that a competent reader would not have predicted.
4. **Caps are a curation signal, not a repair target.** A refusal at the cap is
   answered by retiring or merging notes, not raising the ceiling — the over-cap
   line names both routes, and this rule takes the first. An unpruned directory
   stops being curated residue and becomes a second codebase to read before
   every task.

## Gates

- A learning consulted during work is cited by id in the output that used it. An
  uncited learning is indistinguishable from a guess the run made on its own.
- A confidence change names the run that justified it. A band that moves with no
  cited outcome is an opinion edit.
- A merge names the ids it absorbed in the note that survives. Consolidation
  that drops them leaves an earlier citation pointing at nothing.
- Consolidation is triggered by what a run can see: the cap refusal on capture,
  and the over-cap lines `stamity validate` prints for files that will not load.
  Nothing reports a percentage of the ceiling, so nothing here instructs one.
