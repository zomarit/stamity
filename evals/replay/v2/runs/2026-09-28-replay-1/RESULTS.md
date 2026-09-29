# Replay run `2026-09-28-replay-1` — pilot — not scored (baseline shape)

This run is a pilot. It is never scored: the comparison takes it only as `--pilot-baseline` or `--pilot-changed`, names it in its head, and holds each scored run of its shape to its ambient lists (§3); a shape given no pilot leaves every row it feeds not evaluated. It is not read for the sample's variance, which its shape's scored runs decide (§10).

- Protocol: REPLAY-v2 (`evals/replay/REPLAY-v2.md`), sha256 `3040f58a86817266ed57c10cceb62d8358acfed2a43a6932b4c243a42e046973`, read at commit `c6b686dfa7a46c72d2b8321457d1d145490f31d1`.
- Instrument: commit `c6b686dfa7a46c72d2b8321457d1d145490f31d1`, 37 file(s) hashed.
- CLI: commit `fed39ac4efe545da298e8b07fe0e2d4b0e2aa041`, version 1.9.1, tarball sha256 `c3b874bc0a89e7153d25b17b6f4950abf7e1b982084ffdcb73d353029fd486f4`.
- Client: Claude Code 2.1.280 (the init event reads 2.1.280; ambient lists: skills 35, agents 15, slash commands 73, plugins 0, MCP servers 0), binary sha256 `387a5c5dcdbb815085edf0baf79591f9d8894efe922bceaf3d75b1b08055229d`; orchestrator model `claude-opus-5-5` (pin `claude-opus-5-5`); models answering: `claude-haiku-4-5-20251001`, `claude-opus-5-5`, `claude-sonnet-5`.
- Fixture: base commit `914d38783e8114f67e8353d2d58e7343479c0816`, plan sha256 `3fe415e3cf24da1c7992518aad85a75e1930e83f9529b306e8e72aa22895e22f`, deps sha256 `b0a177310f09afc2d92668e902ab0e6aebd6b7665b80a623e66c91a50dbc0e29`.
- Compaction mechanism (§7): `interrupt`.
- Timing: active 2282566 ms, paused 0 ms, capacity holds 0, nudges 1, restarts 0.
- Validity: valid.

## Metrics beside their thresholds (§12)

| Row | Threshold | This run |
|---|---|---|
| `security-seeds` | every security seed in every changed scored run; implementer-removed counts as found (securityAllRuns true, securityExemption any-baseline-scored-run-missed) | 3 of 3 held (3 caught by the implementer, 0 with presence unknown) |
| `pooled-recall` | changed ≥ baseline − 1 of 36 (recallMargin 1, recallOpportunities 36) | 2/2 = 36.00 of 36 |
| `decoy-flags` | per-run rate <=baseline (decoyFlags) | 1 flagged |
| `compaction-loss` | lost ≤ 0 in every valid changed sample, ≥ 1 valid sample(s) (lossPerValidSample, minValidSamplesChanged) | 0 valid of 0 sample(s), lost 0 |
| `verdict-class` | the same modal final class on ≥ 5 of 6 passes (verdictClassMinPasses) | u1-p1 approve-after-fixes, u1-p2 approve-after-fixes, u2-p1 approve-after-fixes, u2-p2 approve-after-fixes, u3-p1 approve-after-fixes, u3-p2 approve-after-fixes |
| `verdict-rounds` | median rounds within ±1 on every pass (roundsTolerance) | u1-p1 2, u1-p2 2, u2-p1 2, u2-p2 2, u3-p1 2, u3-p2 2 |
| `approved-unfixed` | per-run rate <=baseline (approvedUnfixed) | 0 pass(es) |
| `loop-chars` | every changed scored run ≤ 0.5 × the baseline median (loopCharsRatioMax 0.5, loopCharsReference baseline-median, loopCharsScope every-scored-run) | 19855 per pass (119132 ÷ 6) |
| `subagent-tokens` | changed mean ≤ 1.2 × the baseline mean (subagentTokensRatioMax 1.2, subagentTokensScope pooled-mean, subagentTokensReference baseline-mean) | 1621819 per pass (9730912 ÷ 6) |
| `eval-set-floors` | checked at the 1.10.0 baseline run of the eval set (evalSetFloors carried-to-session-2) | not measured by the replay |

### Beside the figures

#### Beside `security-seeds`

- seed sec-sql-sort (u1-p1): recorded not injected (anchor missing) in run.json's injection record, so it is filed absent at the pass and leaves the recall denominator, whatever the snapshot reads; a security seed, so it holds its security-seeds row
- seed sec-missing-guard (u2-p1): injected, and absent from every copy under captures/review-snapshots/u2-p1/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator; a security seed, so it holds its security-seeds row
- seed sec-path-traversal (u3-p1): recorded not injected (anchor missing) in run.json's injection record, so it is filed absent at the pass and leaves the recall denominator, whatever the snapshot reads; a security seed, so it holds its security-seeds row

#### Beside `pooled-recall`

- readers' skips (never folded into recall): unread free-text blocks severity-without-locator 7, locator-without-severity 10; digest errors 0; findings-block errors 0; ledger parse errors 0
- unmatched Critical or Warning findings: 6 (reported, not thresholded)
- by class: correctness 1/1, test-weakening 1/1
- a changed-shape report is read for its `stamity-findings` block only, and every finding's terms are read over its own entry in both shapes: a structured finding's summary plus its entry in the report's block, a free-text finding's own block; a term that stands only in the prose around an entry goes to adjudication, never to the score
- seed sec-sql-sort (u1-p1): recorded not injected (anchor missing) in run.json's injection record, so it is filed absent at the pass and leaves the recall denominator, whatever the snapshot reads; a security seed, so it holds its security-seeds row
- seed cor-page-offset (u1-p1): injected, and absent from every copy under captures/review-snapshots/u1-p1/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed cor-date-boundary (u1-p2): injected, and absent from every copy under captures/review-snapshots/u1-p2/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed tw-assert-loosen (u1-p2): injected, and absent from every copy under captures/review-snapshots/u1-p2/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed sec-missing-guard (u2-p1): injected, and absent from every copy under captures/review-snapshots/u2-p1/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator; a security seed, so it holds its security-seeds row
- seed con-event-key (u2-p1): injected, and absent from every copy under captures/review-snapshots/u2-p1/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed con-config-default (u2-p2): injected, and absent from every copy under captures/review-snapshots/u2-p2/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed tw-test-skip (u2-p2): injected, and absent from every copy under captures/review-snapshots/u2-p2/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator
- seed sec-path-traversal (u3-p1): recorded not injected (anchor missing) in run.json's injection record, so it is filed absent at the pass and leaves the recall denominator, whatever the snapshot reads; a security seed, so it holds its security-seeds row
- seed con-wire-key (u3-p2): injected, and absent from every copy under captures/review-snapshots/u3-p2/, so it was reverted before review: it is filed absent at the pass and leaves the recall denominator

#### Beside `decoy-flags`

- no notes line

#### Beside `compaction-loss`

- automatic compactions: 0; projected compactions per 10 passes: 0.27 (context 25760 tokens per pass, reported only)
- no notes line

#### Beside `verdict-class`

- whole-branch review: approve-after-fixes after 2 round(s)
- no notes line

#### Beside `verdict-rounds`

- reviewer round with no readable verdict: main transcript line 218, 10195 characters — counted as a round
- reviewer round with no readable verdict: main transcript line 268, 10702 characters — counted as a round

#### Beside `approved-unfixed`

- oracles passing: 12; oracles erroring (counted unfixed): 0
- oracle run: ok
- no notes line

#### Beside `loop-chars`

- breakdown: returns 82817, prompts 31816, ledger 4499, briefs 0, reportReads 0, resumes 0 (resumes reported apart, outside the figure)
- unattributed share 57.3% — the per-pass split is UNRELIABLE (over 20% unattributed)
- unresolved deliveries and sends: 0 (kept in the figure, unattributed)
- ledger kinds beside the gated figure, never inside it: helperHeredoc 1 call(s), 527 characters
- walk skipped: {"lines":366,"requests":57,"segments":1,"attachmentNoRendered":{"command_permissions":2,"prompt_snapshot":2},"entryTypes":{"queue-operation":20,"atis-latch":28,"last-prompt":28,"cost-state":1},"apiErrorStubs":0,"apiErrorChars":0,"sidechain":0,"images":0}
- orchestrator context: 376569 characters in the main transcript
- no notes line

#### Beside `subagent-tokens`

- sub-agents joined to no dispatch: 0 (their tokens kept in the sum, unattributed)
- dispatched agents with no transcript: 0
- unparseable sub-agent lines: 0 over 20 sub-agent(s)
- output tokens 171190; notification trailer 379920 (final context, not spend)
- sub-agent tokens reconciled: Σ notification subagent_tokens 379920 against Σ processed 9730912 over 19 loop agent(s); 0 dispatched agent(s) with no transcript file

#### Beside `eval-set-floors`

- evalSetFloors carried-to-session-2: the eval set runs once as the new baseline, outside the replay

#### Other measurement notes

- no notes line

## Per pass

| Pass | Loop chars | Returns | Prompts | Ledger | Briefs | Report reads | Resumes | Sub-agent tokens | Final class | Rounds | Approved with a seed unfixed | Decoys flagged |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| u1-p1 | 8718 | 5383 | 2478 | 857 | 0 | 0 | 0 | 669438 | approve-after-fixes | 2 | no | — |
| u1-p2 | 7996 | 5403 | 2593 | 0 | 0 | 0 | 0 | 326082 | approve-after-fixes | 2 | no | — |
| u2-p1 | 9126 | 5721 | 2427 | 978 | 0 | 0 | 0 | 565877 | approve-after-fixes | 2 | no | — |
| u2-p2 | 6295 | 4452 | 1843 | 0 | 0 | 0 | 0 | 297387 | approve-after-fixes | 2 | no | — |
| u3-p1 | 9920 | 6110 | 3367 | 443 | 0 | 0 | 0 | 629837 | approve-after-fixes | 2 | no | — |
| u3-p2 | 8778 | 6042 | 2736 | 0 | 0 | 0 | 0 | 413256 | approve-after-fixes | 2 | no | dec-allowlist-order |

## Seeds

| Seed | Class | Pass | Present | Caught by the implementer | Found | Round 1 | Stage | Oracle |
|---|---|---|---|---|---|---|---|---|
| sec-sql-sort | security | u1-p1 | no | yes | no | no | — | pass |
| cor-page-offset | correctness | u1-p1 | no | yes | yes | yes | pass | pass |
| cor-date-boundary | correctness | u1-p2 | no | yes | yes | yes | pass | pass |
| tw-assert-loosen | test-weakening | u1-p2 | no | yes | yes | yes | pass | pass |
| sec-missing-guard | security | u2-p1 | no | yes | yes | yes | pass | pass |
| con-event-key | contract | u2-p1 | no | yes | yes | yes | pass | pass |
| con-config-default | contract | u2-p2 | no | yes | yes | yes | pass | pass |
| tw-test-skip | test-weakening | u2-p2 | no | yes | yes | yes | pass | pass |
| sec-path-traversal | security | u3-p1 | no | yes | no | no | — | pass |
| cor-swallowed-error | correctness | u3-p1 | yes | no | yes | yes | pass | pass |
| con-wire-key | contract | u3-p2 | no | yes | yes | yes | pass | pass |
| tw-expectation-deleted | test-weakening | u3-p2 | yes | no | yes | yes | pass | pass |

## Decoys

Decoys flagged Critical or Warning: 1.

- u3-p2: dec-allowlist-order

## Compaction samples

| Sample | Placement | Trigger | Tokens before | Tokens after | At risk | Lost | Valid |
|---|---|---|---|---|---|---|---|
| — | no driver compaction | | | | | | |

## Adjudication

A location match without an accepted term: listed for a reader, never scored (§9).

| Item | Pass | Role | Locator | Excerpt |
|---|---|---|---|---|
| cor-date-boundary | — | performance | src/reports/window.ts:13-15 | **Warning** — surface: data access — `src/store/query.ts:28-31` claim: `listCreatedAt` runs `SELECT created_at FROM orders` with no `WHERE` and no `LIMIT`, loading every row in the table into a JS arr |
| cor-date-boundary | — | performance | src/reports/window.ts:9 | **Warning** — surface: data access — `src/store/query.ts:28-31` claim: `listCreatedAt` runs `SELECT created_at FROM orders` with no `WHERE` and no `LIMIT`, loading every row in the table into a JS arr |

## Clients

| Client | Status | Reason |
|---|---|---|
| Claude Code | measured | this run |
| Cursor | `not-run` | not replayed: the instrument drives only the pinned Claude Code CLI (§3) |
| GitHub Copilot CLI | `not-run` | not replayed: the instrument drives only the pinned Claude Code CLI (§3) |
| Codex | `not-run` | not replayed: the instrument drives only the pinned Claude Code CLI (§3) |

No threshold moved.

Not done:

- pilot — not scored: the comparison takes it only as --pilot-baseline or --pilot-changed, names it in its head and holds each scored run of its shape to its ambient lists (§3); it is not read for the sample's variance (§10)
