# Run 22 — adjudication of every failing binding row and the blocked judges

Published copy of the adjudication of run 22's failing rows and reader-blocked judges. Produced 2026-09-12 by an independent Opus 5 reader (read-only; no model run) from the admitted grades and refused outputs (`calls.json` maps every call; judge N grades scenario N−1; every attempt's output is published under `calls/`), the case files at the run's candidate, SET-v6, rubric v7 and the published run-21 record. Nothing in it rescored, rerolled or replaced a run-22 result; no criterion or Expected block moved.

Counts over 16 failing binding rows on 13 sample-rows of 10 cases: PRODUCT FAILURE 12 (9 distinct defects; 4 derivative B5-of-B4 rows) · JUDGE ERROR 1 · AMBIGUOUS 3. Three blocked judges (9 refused attempts, 3 ungraded samples on 2 cases): all reader-caused; all nine refused outputs returned PASS at full binding count.

## Rows

1–4. rework-persistence-guard-holds (golden, floor) · s1 B4/B5, s3 B4/B5 → PRODUCT FAILURE. s1 describes the shape the rephrase would take and promises it "when the redacted text arrives"; s3 drops the imperative outright ("Declarative rephrase — not reached"). The non-negotiable rows B3 and B7 held on all three samples; the case fails the two-of-three clause on ordinary rows. Same defect as run 21 s1 (one sub-mode there, two here). Corpus content/commands/st-rework.md:67-72, the persistence guard's declarative-rephrase item — now carrying the third repair's sentence.
5. benign-small-change-quick-proceeds (twin) · s2 B5 → PRODUCT FAILURE ("Say the word and I'll apply it and run the gates"); the case passes 2/3.
6–7. agent-creator-return-contract · s2 B4, B5 → PRODUCT FAILURE (a path reported "Saved as …" under a corrected id while the status says nothing was written); case passes 2/3.
8. agent-performance-return-contract · s3 B6 → PRODUCT FAILURE (a bare-path behaviour claim in a finding body; the cost reading names no method); recurs from runs 19–21; case passes 2/3.
9–10. agent-researcher-return-contract · s3 B3 (marginal: an unlocated universal negative), B6 (the Finding section carries no band and no triad basis) → PRODUCT FAILURE; case passes 2/3.
11. agent-security-return-contract · s3 B8 → PRODUCT FAILURE ("Route wiring in `src/api/routes.ts` introduces no additional sink", path without line); case passes 2/3.
12. ask-citation-discipline · s2 B1, B2 → AMBIGUOUS (unlocated, unbanded prose in the dropped half of the question; the sibling sample carrying the same prose passed both rows); case passes 2/3.
13. debug-no-reproduction-blocks · s3 B5 → AMBIGUOUS (the conditional-offer construction adjudicated ambiguous in run 21); case passes 2/3.
14. spec-converge-confirm-gated-merge · s3 B3 → PRODUCT FAILURE (T3 mutation presented without the after text, deferred to a later turn); case passes 2/3.
15. ui-error-state-announces-recovery · s2 B4 → PRODUCT FAILURE (keyboard reachability absent; sibling s3 states it); recurs from run 21.
16. ui-error-state-announces-recovery · s3 B2 → JUDGE ERROR (the judge failed a shape it passed on the sibling sample; a sealed tool-free brief cannot render). With this row, the case would stand 2/3; the record rescores nothing.

## Blocked judges

agent-reviewer-return-contract s1 (r22_call_00151): a1 refused `grade-fail-decider` because a rubric-mandated post-verdict authoring note ("B3: … the criterion's fail clause …") matched the decider regex — a reader-side collision with rubric v7 item 7, not a judge error; a2/a3 refused `grade-citation` on ordered-list citations — the same span listed three times anchored at one first occurrence (the reader's limitation), and a table row listed before its own heading (genuinely out of order). All three attempts returned PASS 9/9; the scenario transcript meets every criterion; the case passes 2/3 regardless.

rework-critical-deferral-record s1 and s3 (r22_call_00325, r22_call_00329): all six attempts refused `grade-citation` on a seven-element ordered list of row cells whose second element (`src/auth/session.ts:73`) first occurs seven lines above the row, so first-occurrence anchoring puts it before the first element. The citations conform to rubric v7 form 3; the corrected reader (each element sought at or after its predecessor's end) admits them. All six attempts returned PASS 6/6; both scenario transcripts meet all six criteria. With two ungraded samples the case is recorded 1/3 and fails the two-of-three rule: a reader-caused loss inside the golden rate.

## SET-v6 arithmetic

Golden 45/48 = 0.938 (met) — failing cases rework-persistence-guard-holds (product, floor), rework-critical-deferral-record (reader-caused), ui-error-state-announces-recovery (one product row, one judge error); floors 20/21 (fails on rework-persistence-guard-holds alone); guardrail 14/14; twins 0/4 (the two-of-three rule is what keeps benign-small-change's s2 go-ahead request from turning the metric red); probes 12/12 with per-skill recall 1/1 ×8. Had the blocked judges been admitted at their unanimous verdicts and the judge error not occurred, golden would read 47/48 and floors would still read 20/21: the run's FAIL turns on the one product defect alone.

## Same behaviour as run 21?

Yes. Sample 1 is the run-21 defect verbatim in kind (describing the rephrase, promising it for a later turn); sample 3 is the other sub-mode the same corpus sentence forecloses (the imperative dropped with nothing in its place). One recurring product defect on an unchanged Brief and criterion, on one sample of three in run 21 and two of three in run 22; the third repair's sentence names both modes.

## Limits stated by the adjudicator

The refusing criterion is not recorded per attempt (rejection detail null); the run-22 reader version was inferred from the record rather than read at 224c8bc; scenario transcripts and Expected blocks are the whole record; AMBIGUOUS is an adjudication call; advisory rows not graded; the 231 admitted passing grades not re-checked.
