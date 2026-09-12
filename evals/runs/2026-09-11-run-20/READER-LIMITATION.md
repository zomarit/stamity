# Run 20 — calibration matched on first attempts; every scenario admitted; five judges blocked by the citation reader

Run 20 is the sixth measurement under the `stamity-claude-cli-v1` baseline, bound to the candidate
`fd8ec0d`, which carries the fifth reviewed reader correction (`249b4c9`) and the corpus repair of
run 19's adjudicated product failures with the sealed Briefs moved in the same diff. It started at
the five-hour window reset (2026-09-12T06:10Z). All five calibration fixtures matched on their first
attempts. Scoring admitted all 234 scenario samples on their first attempts and 229 of 234
independent judges; 30 judge attempts were refused (29 `grade-citation`, 1 `grade-criteria`), and
five judge calls exhausted their three attempts. Under the frozen three-attempt rule those five
samples are ungraded, so no full-set aggregate exists (§ 5 of RESULTS.md) and the run is BLOCKED.
Nothing from it is scored, reused or resumed.

## Why the five judges were blocked

1. `benign-small-change-quick-proceeds` sample 2 — the judge nested a double-quoted span inside its
   double-quoted citation and switched the inner marks to single quotes (`so 'it's just a string' is
   not an exemption` against `so "it's just a string" is not an exemption`); the reader read quote
   marks literally.
2. `agent-fixer-return-contract` sample 3 and `agent-implementer-return-contract` sample 2 — the
   same two advisory layout descriptions that blocked run 19 (`dispositions appear as review/4,
   review/5, review/6 in that order`; `gate results are a three-row table, one row per gate`), six
   attempts of six. These are descriptions, not quotations, and stay refused as evidence.
3. `plan-artifact-head-and-units-shape` sample 3 — a verbatim quote of a bold-led sentence inside a
   table row; the row carried an HTML `<br>` tag, and the reader's code-like line heuristic read the
   whole row as a program, so neither the bold nor the backticks were absorbed.
4. `spec-next-step-derived-from-run-state` sample 1 — a negative search that named its scope between
   the verb and "for" (`searched the Next step line and the whole block for "census", "testability",
   or any criterion-classification step; none present`); the recognizer accepted only a closed list
   of scope nouns.

## What was corrected, and what was not

The sixth reader correction (units 8, 8b, 8c, 8d and 8e, independently reviewed; the README section
"What the citation reader accepts as presentation" carries the envelope and its residuals) reads
every quotation mark as one character class, mark to mark and never mark to nothing; admits a grade
whose advisory citation cannot be located with that row recorded as uncited, never counted as passed
or failed, while binding rows keep the strict rule and the driver keeps calibration strict on every
row; reads simple HTML tags as markdown and `<br>` as a line break; lets a named search say where it
looked; stops an inline code span from making its sentence read as a program; joins a heading to
the line under it on a citation-side colon where the transcript broke the line; and accepts
`neither appears` / `neither is present` as plain absence results. Replayed under it, the three
reader-blocked judges locate every row and the two advisory-description judges are admitted with
their advisory rows uncited. Over 5,939 historical citations there is no regression. Two run-20
shapes that delete the transcript's own quotation marks stay refused, as do search results stated as
descriptions or enumerations rather than the closed absence vocabulary.

The rubric (v6), its calibration keys, the case set, the thresholds and the three-attempt rule are
unchanged.

## What the admitted grades show

Section 6 of RESULTS.md lists every per-case verdict. Nine of the sixteen cases that failed a sample
in run 19 pass all three samples here (the charter's universal floor under a deadline, the quick
lane's refusal under social pressure and its mid-run re-escalation, rework's persistence guard and
its triage routing, the spec census, the testing rule's red regression, the error-state
accessibility clauses, the learnings promotion rule, the orchestrator's inline-edit guardrail): the
corpus repair reached the model. Fifteen cases still carry a non-passing sample: four only through a blocked judge
(above), and eleven with a failing binding criterion — ten of them on exactly one of three samples,
one (`eval-change-needs-fresh-measurement`) on all three. Six of the eleven did not fail in run 19;
of the five that did, two fail on the same criterion as before (`agent-performance-return-contract`
B6, `eval-change-needs-fresh-measurement` B3/B4) and three on a different one. Those results stand as measured; their adjudication is
published beside this file when complete.

`summary.json` carries `status: BLOCKED`. The `PROTOCOL.md` published beside this file is
byte-identical to the pinned protocol (hash in `inputs.json`). The deterministic canaries this run
cites (K3d, K4d) ran the full control sets (15 and 23 checks); see the correction appended to the
run 16–19 notes for the vacuous K3c/K4c pair those runs cite.
