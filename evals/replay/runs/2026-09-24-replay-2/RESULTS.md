# Replay run `2026-09-24-replay-2` — pilot — not scored (changed shape)

This run is a pilot. It is never scored: the comparison takes it only as `--pilot-baseline` or `--pilot-changed`, names it in its head, and holds each scored run of its shape to its ambient lists (§3); a shape given no pilot leaves every row it feeds not evaluated. It is not read for the sample's variance, which its shape's scored runs decide (§10).

- Protocol: REPLAY-v1 (`evals/replay/REPLAY-v1.md`), sha256 `fdee42b110b189de40318960a85baa20b43a25e933313eb42d1f0aba61fdaa11`, read at commit `9de31649d1e80bcdaa08ab79a2d91554a1333126`.
- Instrument: commit `9de31649d1e80bcdaa08ab79a2d91554a1333126`, 23 file(s) hashed.
- CLI: commit `bf5a8d3f18061eaf7be5c6eed86e103836938cc4`, version 1.9.1, tarball sha256 `b4beb8e4d906ca0dcd1c9bafe566b5c8b05f505fe44435242909696783b49501`.
- Client: Claude Code 2.1.280 (the init event reads 2.1.280; ambient lists: skills 34, agents 15, slash commands 72, plugins 0, MCP servers 0), binary sha256 `387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`; orchestrator model `claude-opus-5-5` (pin `claude-opus-5-5`); models answering: `claude-haiku-4-5-20251001`, `claude-opus-5-5`, `claude-sonnet-5`.
- Fixture: base commit `3754489e71e7f2582cfeb75bb52e4a38ce8e2f8f`, plan sha256 `8aec6d9d3e7ba2264400d2c76263b5c50993166fd022db2a29624935c4598730`, deps sha256 `b0a177310f09afc2d92668e902ab0e6aebd6b7665b80a623e66c91a50dbc0e29`.
- Compaction mechanism (§7): `auto-window`.
- Timing: active 2356578 ms, paused 0 ms, capacity holds 0, nudges 1, restarts 0.
- Validity: valid.

## Metrics beside their thresholds (§12)

| Row | Threshold | This run |
|---|---|---|
| `security-seeds` | every security seed in every changed scored run; implementer-removed counts as found (securityAllRuns true, securityExemption any-baseline-scored-run-missed) | 0 of 3 held (0 caught by the implementer, 3 with presence unknown) |
| `pooled-recall` | changed ≥ baseline − 1 of 36 (recallMargin 1, recallOpportunities 36) | 0/12 = 0.00 of 36 |
| `decoy-flags` | per-run rate <=baseline (decoyFlags) | 0 flagged |
| `compaction-loss` | lost ≤ 0 in every valid changed sample, ≥ 1 valid sample(s) (lossPerValidSample, minValidSamplesChanged) | 0 valid of 5 sample(s), lost 0 |
| `verdict-class` | the same modal final class on ≥ 5 of 6 passes (verdictClassMinPasses) | u1-p1 none, u1-p2 none, u2-p1 none, u2-p2 none, u3-p1 none, u3-p2 none |
| `verdict-rounds` | median rounds within ±1 on every pass (roundsTolerance) | u1-p1 0, u1-p2 0, u2-p1 0, u2-p2 0, u3-p1 0, u3-p2 0 |
| `approved-unfixed` | per-run rate <=baseline (approvedUnfixed) | 0 pass(es) |
| `loop-chars` | every changed scored run ≤ 0.5 × the baseline median (loopCharsRatioMax 0.5, loopCharsReference baseline-median, loopCharsScope every-scored-run) | 13341 per pass (80044 ÷ 6) |
| `subagent-tokens` | changed mean ≤ 1.2 × the baseline mean (subagentTokensRatioMax 1.2, subagentTokensScope pooled-mean, subagentTokensReference baseline-mean) | 915725 per pass (5494349 ÷ 6) |
| `eval-set-floors` | checked at the 1.10.0 baseline run of the eval set (evalSetFloors carried-to-session-2) | not measured by the replay |

### Beside the figures

#### Beside `security-seeds`

- no snapshot under captures/snapshots/u1-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u1-p2/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u2-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u2-p2/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u3-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u3-p2/: its seeds stay in the recall denominator with presence unknown

#### Beside `pooled-recall`

- readers' skips (never folded into recall): unread free-text blocks severity-without-locator 0, locator-without-severity 0; digest errors 4; findings-block errors 4; ledger parse errors 0
- unmatched Critical or Warning findings: 0 (reported, not thresholded)
- by class: security 0/3, correctness 0/3, test-weakening 0/3, contract 0/3
- a changed-shape report is read for its `stamity-findings` block only, while a baseline free-text return is read whole: a term that stands only in a report's prose goes to adjudication, never to the score — a known conservative asymmetry that can only cost the changed shape recall
- no snapshot under captures/snapshots/u1-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u1-p2/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u2-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u2-p2/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u3-p1/: its seeds stay in the recall denominator with presence unknown
- no snapshot under captures/snapshots/u3-p2/: its seeds stay in the recall denominator with presence unknown

#### Beside `decoy-flags`

- no notes line

#### Beside `compaction-loss`

- automatic compactions: 5; projected compactions per 10 passes: 0.29 (context 27838 tokens per pass, reported only)
- no notes line

#### Beside `verdict-class`

- whole-branch review: approve after 1 round(s)
- no notes line

#### Beside `verdict-rounds`

- no notes line

#### Beside `approved-unfixed`

- oracles passing: 12; oracles erroring (counted unfixed): 0
- oracle run: ok
- no notes line

#### Beside `loop-chars`

- breakdown: returns 39774, prompts 11474, ledger 13026, briefs 0, reportReads 15770, resumes 0 (resumes reported apart, outside the figure)
- unattributed share 21.1% — the per-pass split is UNRELIABLE (over 20% unattributed)
- unresolved deliveries and sends: 0 (kept in the figure, unattributed)
- ledger kinds beside the gated figure, never inside it: codeHeredoc 1 call(s), 1031 characters
- walk skipped: {"lines":547,"requests":73,"segments":6,"attachmentNoRendered":{"command_permissions":2,"prompt_snapshot":12,"thinking_drop":4},"entryTypes":{"queue-operation":18,"atis-latch":45,"last-prompt":45,"cost-state":1},"apiErrorStubs":0,"apiErrorChars":0,"sidechain":0,"images":0}
- orchestrator context: 731167 characters in the main transcript
- no notes line

#### Beside `subagent-tokens`

- sub-agents joined to no dispatch: 0 (their tokens kept in the sum, unattributed)
- dispatched agents with no transcript: 0
- unparseable sub-agent lines: 0 over 13 sub-agent(s)
- output tokens 153390; notification trailer 184095 (final context, not spend)
- sub-agent tokens reconciled: Σ notification subagent_tokens 184095 against Σ processed 5494349 over 11 loop agent(s); 0 dispatched agent(s) with no transcript file

#### Beside `eval-set-floors`

- evalSetFloors carried-to-session-2: the eval set runs once as the new baseline, outside the replay

#### Other measurement notes

- no notes line

## Per pass

| Pass | Loop chars | Returns | Prompts | Ledger | Briefs | Report reads | Resumes | Sub-agent tokens | Final class | Rounds | Approved with a seed unfixed | Decoys flagged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| u1-p1 | 9250 | 8253 | 997 | 0 | 0 | 0 | 0 | 839625 | none | 0 | no | — |
| u1-p2 | 8261 | 3649 | 1171 | 3441 | 0 | 0 | 0 | 529871 | none | 0 | no | — |
| u2-p1 | 7125 | 3545 | 1233 | 2347 | 0 | 0 | 0 | 623352 | none | 0 | no | — |
| u2-p2 | 5445 | 3309 | 1265 | 871 | 0 | 0 | 0 | 346299 | none | 0 | no | — |
| u3-p1 | 6558 | 3464 | 1606 | 1488 | 0 | 0 | 0 | 959023 | none | 0 | no | — |
| u3-p2 | 26501 | 4358 | 1494 | 4879 | 0 | 15770 | 0 | 902599 | none | 0 | no | — |

## Seeds

| Seed | Class | Pass | Present | Caught by the implementer | Found | Round 1 | Stage | Oracle |
|---|---|---|---|---|---|---|---|---|
| sec-sql-sort | security | u1-p1 | unknown | no | no | no | — | pass |
| cor-page-offset | correctness | u1-p1 | unknown | no | no | no | — | pass |
| cor-date-boundary | correctness | u1-p2 | unknown | no | no | no | — | pass |
| tw-assert-loosen | test-weakening | u1-p2 | unknown | no | no | no | — | pass |
| sec-missing-guard | security | u2-p1 | unknown | no | no | no | — | pass |
| con-event-key | contract | u2-p1 | unknown | no | no | no | — | pass |
| con-config-default | contract | u2-p2 | unknown | no | no | no | — | pass |
| tw-test-skip | test-weakening | u2-p2 | unknown | no | no | no | — | pass |
| sec-path-traversal | security | u3-p1 | unknown | no | no | no | — | pass |
| cor-swallowed-error | correctness | u3-p1 | unknown | no | no | no | — | pass |
| con-wire-key | contract | u3-p2 | unknown | no | no | no | — | pass |
| tw-expectation-deleted | test-weakening | u3-p2 | unknown | no | no | no | — | pass |

## Decoys

Decoys flagged Critical or Warning: 0.


## Compaction samples

| Sample | Placement | Trigger | Tokens before | Tokens after | At risk | Lost | Valid |
|---|---|---|---|---|---|---|---|
| 1 | — | auto | 66731 | 11204 | 0 | 0 | no |
| 2 | — | auto | 67730 | 13333 | 0 | 0 | no |
| 3 | — | auto | 70249 | 15574 | 0 | 0 | no |
| 4 | multi | auto | 68665 | 16588 | 0 | 0 | no |
| 5 | multi | auto | 71396 | 15608 | 0 | 0 | no |

## Adjudication

A location match without an accepted term: listed for a reader, never scored (§9).

None.

No threshold moved.

Not done:

- pilot — not scored: the comparison takes it only as --pilot-baseline or --pilot-changed, names it in its head and holds each scored run of its shape to its ambient lists (§3); it is not read for the sample's variance (§10)
