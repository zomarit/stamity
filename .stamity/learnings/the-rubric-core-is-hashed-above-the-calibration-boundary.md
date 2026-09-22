---
id: the-rubric-core-is-hashed-above-the-calibration-boundary
title: the rubric core is hashed above the calibration boundary
date: 2026-09-20
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "the private eval driver's prepare for run 31 on 2026-09-20: refused on the moved core hash, accepted after the restore commit brought the core back to run 30's 6209d8df…"
summary: an edit above the Calibration protocol heading in evals/rubric-v7.md moves the grading-core hash the incremental rule composes on; pinned since 0dae2f4 by test/evals/rubricCoreHash.test.ts
integrity: sha256:588f8afdac55f6240603ef8f808432f860aab429ec9e91f9f6e53dc4dcded0d6
---

The text of `evals/rubric-v7.md` above the `## Calibration protocol` heading is the grading core: it is the
excised rubric every judge call receives, and its sha-256 is the `rubricCoreHash` the incremental rule of
`evals/SET-v7.md` compares before composing a run with a prior complete run. An edit anywhere in that text —
including the opening selector sentence, which carries no grading rule — moves the hash, and the private
driver then refuses to compose the next release's run with the baseline, which forces a full baseline run of
the whole set (about 617 calls at the 102-case roster) or a restore of the bytes. Nothing in the tree pins
the core hash, so such an edit passes lint, typecheck, the full suite and every CI leg green.

## Why

Observed on 2026-09-20 while preparing the 1.9.0 release increment (plan 008 session 3): the driver's
`prepare` refused with `unexpected hash for evals/rubric-v7.md`, and the cause was session 1's currency fix
of 2026-09-19 (`c989e10`), which rewrote lines 3-5 of the rubric — the sentence naming which profile
document selects it — from one line to three. The rubric core moved from `6209d8df…` (run 30, the 1.8.0
release run) to `be52bf01…`. The change was reviewed as a documentation correction and recorded as one;
the eval consequence was invisible because the core hash lives only in the private driver's constants and
in each run's public `inputs.json`, never in a test. Resolved by restoring the head's bytes above the heading
and carrying the corrected statement below the calibration boundary, where the judge never reads it, so run
31 composed with run 30 under the declared rule. Validated against: `prepare`'s refusal before the restore
and its acceptance after, plus the hash printed by the restore commit. Review horizon: retire this learning
when a test under `test/evals/` pins the grading core's sha to the newest committed run's `rubricCoreHash`
with a stated reason, so the next such edit is a red test naming the rule.

Amended 2026-09-22 by the session-4 audit: that test exists since `0dae2f4` — `test/evals/rubricCoreHash.test.ts`
hashes the bytes above the boundary and compares them with the newest committed run's
`configuration.rubricCoreHash` — so "nothing in the tree pins the core hash" above describes the tree of
2026-09-20, not today's; the retire condition is met, and the retirement itself is the maintainer's call.

## How to apply

Treat every byte above `## Calibration protocol` in the rubric as an instrument input, not documentation:
a currency note, a selector sentence or a citation that must change goes below the boundary or into
`evals/README.md`. Before a release increment, compare the core's sha-256 with the prior run's
`configuration.rubricCoreHash` in its public `inputs.json`; a difference means the increment cannot compose,
and the choice — restore the bytes or run a new baseline — is the maintainer's unless the change was
accidental. A reviewer of any diff touching `evals/rubric-v7.md` asks which side of the boundary the hunk
sits on and says so in the verdict.
