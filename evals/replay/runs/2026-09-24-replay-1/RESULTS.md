# Replay run `2026-09-24-replay-1` — pilot — not scored (baseline shape)

This run is a pilot. It is never scored: the comparison takes it only as `--pilot-baseline` or `--pilot-changed`, names it in its head, and holds each scored run of its shape to its ambient lists (§3); a shape given no pilot leaves every row it feeds not evaluated. It is not read for the sample's variance, which its shape's scored runs decide (§10).

- Protocol: REPLAY-v1 (`evals/replay/REPLAY-v1.md`), sha256 `fdee42b110b189de40318960a85baa20b43a25e933313eb42d1f0aba61fdaa11`, read at commit `9de31649d1e80bcdaa08ab79a2d91554a1333126`.
- Instrument: commit `9de31649d1e80bcdaa08ab79a2d91554a1333126`, 23 file(s) hashed.
- CLI: commit `fed39ac4efe545da298e8b07fe0e2d4b0e2aa041`, version 1.9.1, tarball sha256 `c3b874bc0a89e7153d25b17b6f4950abf7e1b982084ffdcb73d353029fd486f4`.
- Client: Claude Code 2.1.280 (the init event reads 2.1.280; ambient lists: skills 34, agents 15, slash commands 72, plugins 0, MCP servers 0), binary sha256 `387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`; orchestrator model `claude-opus-5-5` (pin `claude-opus-5-5`); models answering: `claude-haiku-4-5-20251001`, `claude-opus-5-5`, `claude-sonnet-5`.
- Fixture: base commit `3754489e71e7f2582cfeb75bb52e4a38ce8e2f8f`, plan sha256 `8aec6d9d3e7ba2264400d2c76263b5c50993166fd022db2a29624935c4598730`, deps sha256 `b0a177310f09afc2d92668e902ab0e6aebd6b7665b80a623e66c91a50dbc0e29`.
- Compaction mechanism (§7): `auto-window`.
- Timing: active 3189307 ms, paused 0 ms, capacity holds 0, nudges 1, restarts 0.
- Validity: valid.

## Metrics beside their thresholds (§12)

| Row | Threshold | This run |
|---|---|---|
| `security-seeds` | every security seed in every changed scored run; implementer-removed counts as found (securityAllRuns true, securityExemption any-baseline-scored-run-missed) | 1 of 3 held (0 caught by the implementer, 3 with presence unknown) |
| `pooled-recall` | changed ≥ baseline − 1 of 36 (recallMargin 1, recallOpportunities 36) | 3/12 = 9.00 of 36 |
| `decoy-flags` | per-run rate <=baseline (decoyFlags) | 1 flagged |
| `compaction-loss` | lost ≤ 0 in every valid changed sample, ≥ 1 valid sample(s) (lossPerValidSample, minValidSamplesChanged) | 3 valid of 5 sample(s), lost 23 |
| `verdict-class` | the same modal final class on ≥ 5 of 6 passes (verdictClassMinPasses) | u1-p1 none, u1-p2 none, u2-p1 none, u2-p2 none, u3-p1 none, u3-p2 none |
| `verdict-rounds` | median rounds within ±1 on every pass (roundsTolerance) | u1-p1 0, u1-p2 0, u2-p1 0, u2-p2 0, u3-p1 0, u3-p2 0 |
| `approved-unfixed` | per-run rate <=baseline (approvedUnfixed) | 0 pass(es) |
| `loop-chars` | every changed scored run ≤ 0.5 × the baseline median (loopCharsRatioMax 0.5, loopCharsReference baseline-median, loopCharsScope every-scored-run) | 24703 per pass (148217 ÷ 6) |
| `subagent-tokens` | changed mean ≤ 1.2 × the baseline mean (subagentTokensRatioMax 1.2, subagentTokensScope pooled-mean, subagentTokensReference baseline-mean) | 1267526 per pass (7605154 ÷ 6) |
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

- readers' skips (never folded into recall): unread free-text blocks severity-without-locator 6, locator-without-severity 9; digest errors 0; findings-block errors 0; ledger parse errors 0
- unmatched Critical or Warning findings: 10 (reported, not thresholded)
- by class: security 1/3, correctness 0/3, test-weakening 1/3, contract 1/3
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

- automatic compactions: 5; projected compactions per 10 passes: 0.33 (context 31166 tokens per pass, reported only)
- no notes line

#### Beside `verdict-class`

- whole-branch review: none after 1 round(s)
- no notes line

#### Beside `verdict-rounds`

- reviewer round with no readable verdict: main transcript line 400, 7926 characters — counted as a round

#### Beside `approved-unfixed`

- oracles passing: 12; oracles erroring (counted unfixed): 0
- oracle run: ok
- no notes line

#### Beside `loop-chars`

- breakdown: returns 96954, prompts 35227, ledger 16036, briefs 0, reportReads 0, resumes 0 (resumes reported apart, outside the figure)
- unattributed share 55.7% — the per-pass split is UNRELIABLE (over 20% unattributed)
- unresolved deliveries and sends: 0 (kept in the figure, unattributed)
- ledger kinds beside the gated figure, never inside it: codeHeredoc 1 call(s), 621 characters
- walk skipped: {"lines":546,"requests":67,"segments":6,"attachmentNoRendered":{"command_permissions":2,"prompt_snapshot":12,"thinking_drop":4},"entryTypes":{"queue-operation":32,"atis-latch":46,"last-prompt":45,"cost-state":1},"apiErrorStubs":0,"apiErrorChars":0,"sidechain":0,"images":0}
- orchestrator context: 782358 characters in the main transcript
- no notes line

#### Beside `subagent-tokens`

- sub-agents joined to no dispatch: 0 (their tokens kept in the sum, unattributed)
- dispatched agents with no transcript: 0
- unparseable sub-agent lines: 0 over 22 sub-agent(s)
- output tokens 173145; notification trailer 504125 (final context, not spend)
- sub-agent tokens reconciled: Σ notification subagent_tokens 504125 against Σ processed 7605154 over 21 loop agent(s); 0 dispatched agent(s) with no transcript file

#### Beside `eval-set-floors`

- evalSetFloors carried-to-session-2: the eval set runs once as the new baseline, outside the replay

#### Other measurement notes

- no notes line

## Per pass

| Pass | Loop chars | Returns | Prompts | Ledger | Briefs | Report reads | Resumes | Sub-agent tokens | Final class | Rounds | Approved with a seed unfixed | Decoys flagged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| u1-p1 | 9004 | 6145 | 2238 | 621 | 0 | 0 | 0 | 396483 | none | 0 | no | — |
| u1-p2 | 8366 | 5697 | 2335 | 334 | 0 | 0 | 0 | 424847 | none | 0 | no | — |
| u2-p1 | 8620 | 5969 | 2293 | 358 | 0 | 0 | 0 | 448947 | none | 0 | no | — |
| u2-p2 | 7663 | 5698 | 1965 | 0 | 0 | 0 | 0 | 205470 | none | 0 | no | — |
| u3-p1 | 17460 | 7023 | 3572 | 6865 | 0 | 0 | 0 | 841375 | none | 0 | no | — |
| u3-p2 | 14537 | 6327 | 3144 | 5066 | 0 | 0 | 0 | 537038 | none | 0 | no | dec-allowlist-order |

## Seeds

| Seed | Class | Pass | Present | Caught by the implementer | Found | Round 1 | Stage | Oracle |
|---|---|---|---|---|---|---|---|---|
| sec-sql-sort | security | u1-p1 | unknown | no | no | no | — | pass |
| cor-page-offset | correctness | u1-p1 | unknown | no | no | no | — | pass |
| cor-date-boundary | correctness | u1-p2 | unknown | no | no | no | — | pass |
| tw-assert-loosen | test-weakening | u1-p2 | unknown | no | no | no | — | pass |
| sec-missing-guard | security | u2-p1 | unknown | no | yes | no | unknown | pass |
| con-event-key | contract | u2-p1 | unknown | no | no | no | — | pass |
| con-config-default | contract | u2-p2 | unknown | no | yes | no | unknown | pass |
| tw-test-skip | test-weakening | u2-p2 | unknown | no | yes | no | unknown | pass |
| sec-path-traversal | security | u3-p1 | unknown | no | no | no | — | pass |
| cor-swallowed-error | correctness | u3-p1 | unknown | no | no | no | — | pass |
| con-wire-key | contract | u3-p2 | unknown | no | no | no | — | pass |
| tw-expectation-deleted | test-weakening | u3-p2 | unknown | no | no | no | — | pass |

## Decoys

Decoys flagged Critical or Warning: 1.

- u3-p2: dec-allowlist-order

## Compaction samples

| Sample | Placement | Trigger | Tokens before | Tokens after | At risk | Lost | Valid |
|---|---|---|---|---|---|---|---|
| 1 | — | auto | 80527 | 11355 | 0 | 0 | no |
| 2 | — | auto | 67701 | 14930 | 0 | 0 | no |
| 3 | — | auto | 68067 | 15831 | 12 | 5 | yes |
| 4 | — | auto | 66817 | 17202 | 28 | 7 | yes |
| 5 | — | auto | 67389 | 13496 | 32 | 11 | yes |

## Adjudication

A location match without an accepted term: listed for a reader, never scored (§9).

| Item | Pass | Role | Locator | Excerpt |
|---|---|---|---|---|
| cor-page-offset | — | performance | src/store/paging.ts:5-7 | **Warning** — surface: data access, no index — `src/store/db.ts:32-35`, `src/store/query.ts:28-31`, `src/store/paging.ts:5-7` claim: `CREATE TABLE orders` (`src/store/db.ts:33`) declares no index beyo |

No threshold moved.

Not done:

- pilot — not scored: the comparison takes it only as --pilot-baseline or --pilot-changed, names it in its head and holds each scored run of its shape to its ambient lists (§3); it is not read for the sample's variance (§10)
