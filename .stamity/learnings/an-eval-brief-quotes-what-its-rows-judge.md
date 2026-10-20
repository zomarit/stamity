---
id: an-eval-brief-quotes-what-its-rows-judge
title: an eval brief quotes what its rows judge
date: 2026-10-20
confidence: high
summary: an eval case's Brief quotes every sentence its binding rows judge, the report shape and what the final message must say, and the skill states each rule a row asks for
reviewBy: 2027-01-20
validatedAgainst: "evals/SET-v7.md at b9b39755: the two paragraphs dated 2026-10-19 (runs 48 and 49) and the paragraph dated 2026-10-20 (run 50)"
integrity: sha256:05ea9d656a27be8186ff463c7680f127fed34385258257e9125917520d5bda86
---

An eval case's Brief quotes every sentence its binding rows judge, the report shape a row grades,
and what the final message must say, and the sourced skill or command states each rule a row asks
for. A row grading a sentence the Brief never quotes measures the sample's guess, not the corpus.

## Why

Three 1.16.0 failures traced to a row judging text the Brief did not carry (`evals/SET-v7.md`, the
paragraphs dated 2026-10-19 and 2026-10-20):

- Run 48's two floor misses: the unattended skill's ending never said what `run end`'s `--paths`
  carries.
- `unattended-close-opens-draft-pr`, 1 of 3 in run 49: re-quoting the ending alone did not move it;
  it passed in run 50 once the skill said what the final message tells the person.
- Run 50's QA twin, `benign-qa-second-account-stays-person-row`, 0 of 3: its B1 grades the sign-off
  and the close-walk row, and its Brief named neither.

## How to apply

- Before a case lands, find each binding row's judged sentence in the Brief; with none, quote one,
  or write the rule into the skill and quote it.
- A row grading a report's shape or the final message gets the rule that sets it quoted.
- When a case fails, check this first: a judge naming a gap in the Brief points at the case, not
  the model.
