# Run 16 — terminal before scoring: emission-shape reader limitation

Run 16 is the second measurement under the `stamity-claude-cli-v1` baseline, bound to the
candidate that carries the reviewed citation-reader correction (`c9ee343`). Its five
calibration fixtures were dispatched as fresh judge processes; every attempt was admitted at the
transport level (exact judge id at init, assistant and provider `message_start`, tools removed,
one turn, exact task delivery observed at the API boundary). Outcome per fixture:

| Fixture | Status | Labels | Attempt reasons |
|---|---|---|---|
| C1 | admitted | MATCH | admitted |
| C2 | admitted | MATCH | admitted |
| C3 | blocked | — | grade-fail-decider, grade-fail-decider, grade-fail-decider |
| C4 | blocked | — | grade-groups, grade-groups, grade-groups |
| C5 | admitted | MATCH | admitted |

The citation-reader correction worked: no attempt was rejected for a citation. C3 and C4 were
rejected by `parseGrade` for emission-shape reasons the rubric's written contract does not
impose: (1) prose commentary the judge writes after the fenced emission block was scanned as if
it were part of the emission, so a sentence such as "The case fails on B1, with B4 and B5 also
failing." tripped the deciding-line consistency check; (2) a deciding line of the form
`decided by: B1 (B4 and B5 also failed)` names the other failing criteria with an adverb or a
bare verb the status grammar did not recognise; (3) for a case that declares no advisory
criteria, `advisory: none declared` written after the verdict and the deciding line — the
position the rubric's emission item 4 lists for the advisory summary — was not accepted as the
(empty) advisory group. C4 is the only fixture without advisory criteria and 39 of the 78
scoring cases declare none, so scoring under this reader would have blocked a large share of
the 234 judges on shape alone.

No scenario sample and no scoring judge ran. Nothing from this run is admitted, scored or
reused; the three admitted calibration fixtures do not transfer to any later run. The reader
receives a second reviewed correction (fenced-block confinement, deciding-line phrasings,
advisory-summary placement, an `advisory:` heading with `none declared` beneath it, wider
silence phrasings, and one disclosed policy change: a transcript structure boundary — a blank
line or a list/heading marker — may be matched by one collapsed space in a citation when every
word, number, punctuation mark and the marker text stay verbatim, recorded per citation as
`structure-boundary-flattened`; C4's own attempts here quote across exactly that boundary)
applied uniformly, with no rewritten emission, no new model call
against this run and no change to any criterion, key or threshold; the corrected reader is
measured by a fresh full run.

`summary.json` records `terminal: null` with `status: BLOCKED`: the systemic circuit break did
not trigger because the two exhausted fixtures failed on different codes. "Terminal" here means
the protocol's sense — scoring refused, no admission, no reuse. The `PROTOCOL.md` published
beside this file is byte-identical to the pinned protocol (its hash is in `inputs.json`).
