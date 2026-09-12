# Independent U4 review

Reviewed on 2026-09-10 against the Package 10 plan/spec and released baseline
`99c1094953346ef19a8aaab3ee0bd7d292c36ba6`. Scope: manual entry point,
instrument/parser, transport admission and retries, run orchestration, focused
tests, profile/eval documentation and the local eval skill override.
The reviewer changed only review records.

## Findings and independent closure

### U4-R1 — P1: completed multi-part scenario output was replaced

Initial location: `scripts/eval/transport.mjs`, `admitResponse`'s
`texts.length === 1` requirement.

The [official Responses contract](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)
permits variable output arrays. A completed scenario response carrying two text
parts was treated as a retryable invalid transcript. A bounded fixture returned
an unsafe statement in the second part, followed by a safe one-part replacement.
The original code made two calls and admitted only the replacement. That discards
completed scenario behavior according to its response shape and biases sampling.

Acceptance: retain all completed text/refusal parts in provider order, pass the
entire transcript to the judge once, and preserve raw response and part provenance.
Do not change the non-retryable refusal of contaminated context or tool output.

Closed: the implementation concatenates exact text/refusal fragments without
invented separators and records message/content indices, type and text. Scenario
refusals remain behavior for the judge; a refused judge remains a degraded call
under the retained rubric. Independent rerun of the original fixture made one
call, preserved both parts and retained the full unsafe transcript. New tests
cover multiple parts, multiple messages, mixed text/refusal and no replacement.
The run orchestrator passes the resulting exact transcript as judge input four.

### U4-R2 — P2: provider-declared stored prompt escaped context admission

Initial location: `scripts/eval/transport.mjs`, the
`provider-context-or-tools` assertion.

The request guard excluded a stored prompt, but the response guard checked only
instructions, conversation and previous-response state. A response declaring an
unrequested non-null `prompt` template passed admission. The official response
schema identifies that field as a prompt-template reference, so it is additional
provider-declared input that the sealed call did not authorize.

Acceptance: absent or null prompt remains valid; a non-null prompt blocks without
a replacement call and its rejected receipt is retained.

Closed: the response guard now checks this field. The independent original
fixture now fails with `provider-context-or-tools` after one call. Added tests
cover absent/null acceptance, stored-prompt refusal and retained rejected bytes.

## Retained contracts and verification

- Requests contain exactly the sealed scenario Brief or the four judge blocks:
  rubric core, Brief, Expected and transcript. No label, attestation request or
  fifth case-identity input is appended. The full calibration section is excised.
- Canonical case identity is bound by the invocation's parsed case; the judge's
  own `emittedCase` text remains separately recorded. An independent parser probe
  verified this binding when the emitted description differed from the case ID.
- Profile `codex-astra` still requests Astra high as scenario and Sol high as
  judge. The inverse profile retains its declared pair. The default remains
  Claude and this transport blocks unsupported profiles instead of substituting.
- The selected rubric remains v5, all five calibration fixtures resolve their
  original Brief/Expected blocks from retained v4 cases, and individual binding
  and advisory labels must match before scenario scoring. A real calibration
  mismatch is retained without retry.
- Committed input bytes and controls are hashed, working-tree mismatches block,
  and inputs are checked during execution. Every current case receives three
  independent requests; the current roster is 78. Aggregation retains strict
  three-sample scoring, all floors, the zero-break/zero-false-refusal bars and
  per-skill recall. Partial runs name unmeasured cases and admit no full score.
- The fixed official endpoint uses stateless requests, tools removed, no
  conversation or prior response, and complete raw provider receipts. Model and
  effort metadata are checked separately from unavailable agent attestation.
  Provider-internal instructions remain an explicitly stated visibility limit.
- Infrastructure and invalid-judge retries are bounded to three attempts;
  ordinary scenario behavior, scored failures and calibration mismatches are
  not resampled. Capacity is bounded and active calls drain on failure. Artifact
  writes are exclusive and historical result directories cannot be overwritten.
- Independent focused checks initially passed 359 tests across manual runner,
  fixture-count and roster suites. After the final transport fixes, the reviewer
  reran `npm exec vitest run test/evals/manualRunner.test.ts`: all 41 tests passed.
  The explicit before/after reproductions above used local receipts, not a live
  provider, and prove admission/control behavior only.

No confirmed U4 implementation finding remains open in this review.

Not done: actual authorized API execution establishing both role controls and
input/trace admission, all-five-fixture live calibration, and the full 78-by-three
scenario evaluation with admitted judge results. The API credential is currently
unavailable. Mock receipts, native diagnostics carrying ambient context, earlier
calibration and historical scores do not close these gaps. Integrated gates,
candidate identity, human QA and platform release controls remain separate.
