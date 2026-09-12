# Run 18 — calibration matched; scoring paused by a capacity hold with two blocked judges

Run 18 is the fourth measurement under the `stamity-claude-cli-v1` baseline, bound to the candidate
carrying the third reviewed reader correction (`d382e0d`). All five calibration fixtures matched on
their first attempt. Scoring admitted 52 scenario samples and 50 judges; 12 judge
attempts were rejected (eleven `grade-citation`, one `grade-advisory-summary`) and two judge calls —
both on `security-content-exempt-from-truncation` — exhausted their three attempts, which under the
frozen three-attempt rule already prevents a complete 234-sample result. The driver then recorded a
pre-emptive capacity hold (the account's seven-day overage-included window reached 98% utilization,
reset 2026-09-12T03:00Z) and the operator stopped scoring; four in-flight attempts are recorded as
`process-exit`. Nothing from this run — calibration matches included — is admitted, scored or reused.

## Why the citations were rejected

1. The three-word floor on every elision segment (introduced by the round-12 review to stop
   trivial two-word elisions from spanning arbitrary text) also refuses legitimate short trailing
   segments: `"… 25-line restatement of acceptance criteria ... Second."` and `"… Drop whole."` are
   verbatim modulo markup, wrap and elision, but their last segment is one or two words. Six of the
   twelve rejections, including both blocked judges, are this shape.
2. A sentence-final period the judge appended to a quote whose transcript sentence continues with a
   dash (`"… and the invariant still holds."` against `… still holds — the point of it …`).
3. A blockquote marker or a ` / ` line-join kept inside a quote where the transcript has a line
   boundary (`"C1 · no class matched / Clean. Survives verbatim:"`; `"… Survives verbatim: > \`quoted:\` …"`).
4. `advisory: all passed (1/1)` — a combination of the two documented summary forms.
5. Two genuine rejections that stay: a citation quoting the Brief's question rather than the
   transcript, and judge paraphrase inside quotation marks.

Shapes 1–4 are corrected by a further reviewed reader change (a bounded-gap elision rule, trailing
sentence punctuation tolerance, citation-side line-join and blockquote absorption where the
transcript has a boundary, and the combined advisory summary form), committed before any response is
reconsidered and measured only by a fresh full run. The capacity hold is the protocol's own control:
the next run starts after the window resets.

`summary.json` carries `terminal: null`: the operator interrupted scoring while the capacity hold
was in force; "terminal" here means the protocol's sense. The `PROTOCOL.md` published beside this
file is byte-identical to the pinned protocol (hash in `inputs.json`).

## Correction, 2026-09-12 — the deterministic canaries this run cites

`inputs.json` publishes the deterministic canaries K3c and K4c with `allPassed: true` and `checks: 0`. Those two ran no control: the private driver matched only the literal canary ids of the earlier generation, so the "re-run under the final driver" recorded here was vacuous. The control sets actually standing behind this run are K3b (15 checks) and K4b (23 checks), whose subject files (the inspector, the dispatcher and their tests) carried hashes identical to the final driver; only the run orchestrator had changed. The defect was found on 2026-09-12 while re-running the canaries for run 20, fixed (families dispatch by id prefix and an empty result set fails), and K3d/K4d and K3e/K4e then ran the full sets; nothing in this run's admission or reader conclusions depended on the vacuous pair.
