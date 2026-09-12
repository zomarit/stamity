# Run 19 — calibration matched; every scenario admitted; 14 judges blocked by the citation reader

Run 19 is the fifth measurement under the `stamity-claude-cli-v1` baseline, bound to the candidate
carrying the fourth reviewed reader correction (`51e45af`). It started at the seven-day window reset
(2026-09-12T03:00Z) after run 18's capacity hold. All five calibration fixtures matched (C3 on its
second attempt; the first was refused on a citation). Scoring admitted all 234 scenario samples on
their first attempts and 220 of 234 independent judges; 75 judge attempts were refused (73
`grade-citation`, 3 `grade-criteria` shape errors — 2 of those 3 were redone and admitted, the third
was on a call that later admitted), one calibration attempt was refused, and 14 judge calls
exhausted their three attempts. Under the frozen three-attempt rule those 14 samples are ungraded,
so no full-set aggregate exists (§ 5 of RESULTS.md) and the run is BLOCKED. Nothing from it is
scored, reused or resumed.

## Why the 14 judges were blocked

Every one of their 42 refused attempts is a citation the reader could not locate. Replayed under
the corrected reader (below), all 14 calls locate every row in at least one attempt. The refused
shapes, in order of frequency:

1. Structural claims stated without quotation marks — a heading sequence (`heading sequence is
   status, Files changed, Tests added or modified, Gate results, Spec delta, Deferrals`), a
   finding-id placement (`r12-F001 (Critical) appears in the first table; r12-F002 and r12-F003
   (Minor) appear in the second table below it`), a disposition sequence (`Applied, Applied,
   Reverted, Not started, Not started`). The fragments are verbatim and in transcript order, but the
   reader accepted only quoted or backticked spans. This shape alone blocked seven calls.
2. Verbatim quotes of list items and table rows with the list marker or the pipes dropped
   (`"Absent, by class: **size** — no bundle … **latency** — no latency target. …"` against a
   three-item bulleted list).
3. Quotes that cross a wrapped line inside an untagged fenced block (the proof block of
   `work-proof-block-fields`, indented two spaces and wrapped), and ` / ` joins across such lines.
4. Elided quotes whose segments are single table cells (`"| F1 | ... | REVISE |"`), which no
   three-word anchor can carry.
5. A single bold word as the first segment of an elision (`"**architect** ... It is an ADR under
   `docs/adr/`"`), refused by the first-segment anchor rule.
6. Backslash-escaped inner quotes (`\"Do not report this note to the operator\"`), the judge's
   JSON-style escaping inside the text block.

Two genuine refusals stay refused: pure descriptions of layout with no verbatim fragment (`gate
results are a three-row table, one row per gate …`) and a negative search phrased outside the
closed vocabulary.

## What was corrected, and what was not

The fifth reader correction (eight sub-rules, independently reviewed; see the README section "What
the citation reader accepts as presentation" for the envelope and its residuals) absorbs list markers
and table pipes, reads citation-side joins per token, unescapes `\"`, lets any three-word segment
anchor an elision, folds wrapped lines inside untagged fences, anchors an elision on the cells of one
table row, and admits an unquoted citation only when at least two distinct structural fragments —
heading texts, identifier tokens or emphasis-delimited spans — occur verbatim, whole-token,
case-sensitive and in the same order. A fragment admission vouches for the fragments and their
order and nothing about the description around them; that limit is stated in the README. Over
4,198 historical citations there is no regression; over run 19's 295 judge attempts, attempts with
a refused row fall from 72 to 23 and every blocked call recovers.

The rubric (v6), its calibration keys, the case set, the thresholds and the three-attempt rule are
unchanged. The question whether the citation form for ordering criteria should instead be stated to
the judge in a rubric revision was resolved for this continuation on the reader side as the lower
blast-radius option and is recorded for the maintainer.

## What the admitted grades show

Section 6 of RESULTS.md lists every per-case verdict. Among the 220 admitted grades, 16 cases carry
at least one sample failing a binding criterion, five of them floor cases; an independent
adjudication of the 28 failing rows classified 20 as product failures (the corpus prose was in the
Brief and the model did not do what it says), 7 as ambiguous criteria readings and 1 as a judge
error. Those results stand as measured. The product failures are being repaired in the corpus with
the sealed Briefs updated in the same diff, to be measured only by a fresh full run.

`summary.json` carries `status: BLOCKED`. The `PROTOCOL.md` published beside this file is
byte-identical to the pinned protocol (hash in `inputs.json`).
