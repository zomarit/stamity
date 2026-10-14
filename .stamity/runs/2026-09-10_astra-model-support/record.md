# GPT-6 Astra model pin support

Request: make Stamity model pins also support `gpt-6-astra`.

Status: configuration support implemented and deterministic verification passed.
Live Astra calibration and behavioral eval results are not claimed.

## Scope and decisions

- Additive support; existing defaults, historical eval results, case expectations,
  and the Claude rubric remain intact.
- Product pins already accept concrete model identifiers. Verify their persistence
  and Codex emission for all four classes and document their use.
- Add explicit eval model profiles and a separately versioned neutral rubric for
  alternate model pairs. Keep scenario and judge models distinct, with fresh sealed
  scenario contexts and calibration required for each selected configuration.
- User preference requested for the documented Codex pair; no reply arrived before
  the declared default was applied: Astra scenarios with Sol judge. The inverse is
  also supported; the legacy Claude profile remains the default when none is named.
- Existing unrelated `.stamity/review-gate.json` was untracked at intake.
- The deferral inbox has no item overlapping this change.
- Existing plans describe completed release work; this request uses an in-session
  plan. No existing requirement ID specifically names Astra support.

## Ownership and contract census

| Unit | Owner | Contracts | Disposition |
| --- | --- | --- | --- |
| Product pin examples and coverage | `/root/model_census` | `models.pins.<class>`, `ModelPinMap`, `resolveModelValue`, emitted `model` and `model_reasoning_effort` | Existing contracts held; no schema or default change |
| Eval profiles, alternate rubric, runner, tests | `/root/eval_census` | Selected profile, exact role model identifiers, rubric identity, calibration and result provenance | One owner reconciles producer and consumers |
| Generated runner sync and gates | Dedicated verifier after both units | Canonical override projection and manifest hash | Sequential after writers finish |

Implementation uses the available parallel-agent lane with disjoint artifact
ownership in the shared workspace. Research is read-only; generated outputs have
a single writer after source changes settle. Agents inherit this session's model.

## Verification plan

- Targeted CLI, Codex adapter, and eval contract tests with the owning units.
- Build and sync the canonical runner override; inspect the emitted diff.
- Run `npm run lint`, `npm run typecheck`, and `npm run test`.
- Run `npm test -- --coverage` as required by the recorded CI learning.
- Independent review of configuration compatibility and eval isolation/provenance.
- Live Astra calibration and behavioral measurement are separate evidence from
  deterministic configuration support; no historical score transfers to Astra.

## Proof

Native sub-agent transcripts are the evidence for delegated actions. The tables
below summarize their tool results; this file is not itself an eval result.

| Command | Exit | Evidence returned by `/root/model_census` |
| --- | --- | --- |
| `npm run build` | 0 | Build passed |
| `node dist/cli.js sync` | 0 | Emitted runner plus manifest timestamp/hash only |
| `node dist/cli.js validate` | 0 | No findings after runner length correction |
| `npm run lint` | 0 | Final lint passed after helper hoisting |
| `npm run typecheck` | 0 | Final typecheck passed |
| `npm run test` | 0 | 184 files; 7363 passed, 2 skipped |
| `npm test -- --coverage` | 0 | 184 files; 7363 passed, 2 skipped; all configured floors passed |
| `git diff --check` | 0 | No whitespace errors |

Coverage: statements 96.38%, branches 89.65%, functions 98.68%, lines 97.27%.
The verifier checked canonical/emitted runner body equality and the manifest's
SHA256 against the emitted file. Historical rubric, cases and eval runs were not
edited. The initial unrelated untracked review-gate file was preserved.

The optional skill-creator Python helper could not start because `yaml` was not
installed. Repository-native override validation passed with no findings instead;
no dependency was installed for that optional helper.

## Review and attribution

| Pass | Reviewer | Outcome |
| --- | --- | --- |
| Product and initial eval review | `/root/astra_review` | Product approved; stale active rubric instruction identified |
| Eval repair review | `/root/astra_review` | Approved, high confidence; stale rubric and decoding instructions corrected |
| Final runner trim review | `/root/astra_review` | Approval retained; operational requirements preserved |

- `/root/model_census`, shell/apply-patch tools: configuration reference source and
  generated page, CLI/Codex pin tests; 184 targeted tests passed. Later owned build,
  sync, native validation and full gates.
- `/root/eval_census`, shell/apply-patch tools: profile JSON/guide, alternate rubric,
  active set/README, runner override, contributor/release pointers, profile tests;
  619 targeted eval tests passed. Fixed the review and lint/length findings.
- `/root/astra_review`, read-only shell tools: independent review and final repair
  verification; no remaining Critical or Warning findings.
- `/root`, orchestration/read-only shell/web/apply-patch tools: official model ID
  verification, ownership/census, review synthesis, decoding finding, and this
  record/ledger. Product source edits were delegated.

Contracts closed: product pin/schema/effort seams held unchanged; all active eval
profile/rubric/provenance consumers reconciled by one source owner. Generated
projection reconciled after source edits settled. No unresolved findings or inbox
deferrals were created by this implementation.

## Remaining measurement

Not done: live calibration and a behavioral eval for either Astra profile. The
profiles explicitly require that evidence before their scores can gate a release;
existing Claude results cannot substitute for it. No release, merge or publish
was performed. The next measurement can request the full set with `codex-astra`.
