# Run 17 — calibration matched; scoring stopped by the circuit break on citation location

Run 17 is the third measurement under the `stamity-claude-cli-v1` baseline, bound to the
candidate carrying the second reviewed reader correction (`94e639d`). All five calibration
fixtures were admitted on their first attempt with every binding and advisory label and the case
verdict equal to the rubric-v6 keys (the first full calibration match on this baseline).

Scoring then began. Seven scenario samples were admitted; of the scoring judges, one attempt was
admitted and eight were rejected by the citation reader (`grade-citation`), and four in-flight
attempts were interrupted by the operator (`process-exit`, retryable) while moving the scoring
process out of a time-limited shell into a detached one — those four are the operator's cost,
recorded as such, not judge behaviour. Three consecutive judge calls then exhausted their three
attempts on the same code, and the driver's systemic circuit break ended the run
(`terminal: systemic-failure:grade-citation`). Counts: scenario 7 admitted of
234; judge 1 admitted, 4 blocked, 12 invalid attempts.

## Why the citations were rejected

Scoring transcripts are markdown, which the plain-prose calibration fixtures never exercised:

1. A verbatim quote with the transcript's emphasis markers omitted — `"What-to-verify summary
   — emitted."` against `- **What-to-verify summary** — emitted.`; `"… the qa skill run …"`
   against `… the **qa** skill run …`; `"… marked not applicable"` against `marked **not
   applicable**.` Words, numbers and punctuation are verbatim; only markup differs.
2. A named negative search whose result reads `No edit follows the refusal.`, `…, no edit` or
   `the refusal is not followed by any edit, patch, or applied change`, outside the reader's
   negative-result vocabulary.
3. One quote that paraphrased the transcript (`"Browser evidence: not applicable — the rename
   in …"` for `**Browser evidence** — not applicable (internal helper rename in …`); refusing
   it is correct.

A gate-coverage defect is recorded alongside: the five calibration fixtures are plain-text
transcripts, so a 5/5 calibration could not predict admission on markdown scoring transcripts;
a fixture exercising markdown belongs in the next rubric version (carried in `evals/README.md`).

Shapes 1 and 2 are reader limitations relative to the rubric's written contract and the
protocol's bound on presentation differences (words, negations, numbers, code and identifier
punctuation may not change; markup and whitespace are presentation). They are corrected by a
reviewed reader change committed before any response is reconsidered, measured only by a fresh
full run. Nothing from this run — calibration matches included — is admitted, scored or reused.

## Retained evidence

`calls.json` (every attempt with transport metadata, ambient fingerprints, hashes, rejection
code and retryability), `calls/*.input.txt` / `*.output.txt` (exact tasks and outputs, scenario
transcripts included), `inputs.json`, `summary.json`, `PROTOCOL.md` (byte-identical to the
pinned protocol). Private: stdin/stdout/stderr, captured request/response bodies, ambient text,
inspection records and the journal, including the interruption and the circuit-break entries.
