# Run 15 — terminal before scoring: citation-reader limitation

Run 15 is the first measurement under the `stamity-claude-cli-v1` baseline (established
`claude` profile: `claude-opus-5` scenarios, `claude-fable-5-1` judges, rubric v6 through the
reviewed private run-only override). Its five calibration fixtures were dispatched as fifteen
fresh judge processes (three attempts each); every attempt was admitted at the transport level
(exact judge id at init, assistant and provider `message_start`, tools removed, one turn, exact
task delivery observed at the API boundary) and every attempt was then rejected by the unchanged
public instrument's citation reader (`grade-citation`; one third attempt `grade-groups`). No
scenario sample and no scoring judge ran. Nothing from this run is admitted, scored or reused.

## What the fifteen outputs contain

A deterministic re-read of the fifteen retained outputs (`calls/*.output.txt`) with the same
instrument's row parser shows that all fifteen label vectors equal the rubric-v6 keys — every
binding label, every advisory label and the case verdict, on every attempt, including C3's
corrected `B1 fail`. That re-read is recorded here as a description of the retained outputs, not
as a calibration result: no label from this run is admitted, because the reader rejected the
citations, and a grade the reader rejects is not a grade.

## Why the citations were rejected

`locateCitation` in `scripts/eval/instrument.mjs` (at this run's candidate) could not locate
citations of these shapes, all of which quote the transcript verbatim apart from presentation:

1. A quoted span hard-wrapped by the judge across two lines with a five-space continuation
   indent — the same layout the rubric's own emission example uses. The reader's prose view
   treats a line indented by four or more spaces as code and refuses to collapse its
   whitespace, so a verbatim quote that spans a wrapped line became unlocatable.
2. A named negative search written as "searched the transcript for … ; the id does not
   appear", which the reader's recognizer (`searched for …` plus `none|absent|not found|no
   match|silent`) did not accept.
3. A quoted span with an explicit elision marker (`...`, `[...]`), whose segments are each
   verbatim in the transcript.
4. A fail-verdict silence citation phrased "the transcript … says nothing about the third".
5. A verbatim quote that flattens a numbered-list block across a blank line (`"Summary of the
   open deferral rows: 1. … [...] 2. …"`); the reader treats a blank line or list boundary as
   structure a single quoted phrase may not cross, and that rule is kept. One further
   citation quoted a reconstructed diff that is not verbatim; refusing it is correct.

Shapes 1–4 are reader limitations relative to the rubric's written contract (a quoted phrase or a
line reference; for a `must NOT` criterion, the search performed and its negative result; for
an undecidable criterion, a statement that the transcript is silent). They are handled the way
the evaluation protocol prescribes for a demonstrated reader defect: a reviewed correction of
the reader, committed before any response is reconsidered, applied uniformly, with no rewritten
citation, no new model call against this run, and no change to any criterion, key or threshold.
This run stays terminal; the corrected reader is measured by a fresh full run.

## Retained evidence

- `calls.json`: every attempt with its transport metadata, ambient fingerprints, task and
  transcript hashes, rejection code and retryability.
- `calls/r15_call_0000N_aM.input.txt` / `.output.txt`: the exact judge tasks and outputs.
- `inputs.json`, `summary.json`, `PROTOCOL.md`: configuration, canary accounting and protocol.
- Private (governance repository): stdin/stdout/stderr, captured request and response bodies,
  system-prompt and ambient text, per-attempt inspection records and the run journal.

## Published protocol copy

`PROTOCOL.md` in this directory is the pinned run-15 protocol (sha256 `eb36b7d76c982b21d98e942cdc23cceeccf92be7fb3c8e76e5e89bf6487aaffe` in
`inputs.json`) with one phrase respelled so that the public leak gate passes: the private
governance repository's literal name is replaced by "the governance repository beside this
one". Nothing else differs; the published copy's sha256 is `54a699a63c5ab68e1399249e67e0566c57c0bb49bcf6c0c9460fa58730acdfa8`.

## Status wording and hand amendments

`summary.json` records `terminal: null` with `status: BLOCKED`: the driver's systemic circuit
break did not trigger because one third attempt failed with a different code. "Terminal" in
this document and in the private protocol means the protocol's sense — every calibration
fixture blocked, scoring refused, no admission, no reuse. After the export, two lines of
`RESULTS.md` were amended by hand: the § 1 protocol row (published-copy hash and this
pointer) and the § 11 closing note; nothing else in the generated files was edited.
