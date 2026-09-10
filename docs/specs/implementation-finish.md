---
id: implementation-finish
status: draft
obsolete_when: these requirements are superseded by named client, authoring, signing, distribution and evaluation contracts
---

# Implementation completion contracts

## Intent

Finish the engineering work against the released 1.6.0 baseline while preserving
supported clients, CLI consumers, customization, signing and upstream distribution.
This spec records observable implementation requirements; human QA and platform
approval remain separate evidence that automation cannot provide.

## Invariants

- Existing command names, public JavaScript imports, configuration and signing payloads remain compatible.
- Existing terminal statuses remain `DONE`, `BLOCKED_AMBIGUITY`, `BLOCKED_DEPENDENCY` and `BLOCKED_FAILURE`.
- Required gates, strict behavioral thresholds and historical evidence remain intact.
- Generated surfaces derive from their source owners after implementation converges.
- An unavailable proof is named explicitly and never represented as a passing result.

## Requirements

### REQ-FINISH-001

Given each supported client, discovery/invocation and native hook allow/deny/error/timeout fixtures match current official contracts, including identity-free events and unsupported fields.

### REQ-FINISH-002

Given multi-client init/sync/check/clean and authored skill metadata/companions, user content survives, command names remain compatible, the charter template stays at most 150 lines and each measured client budget only ratchets down. All three client proposals and native-memory overlap receive dated dispositions.

### REQ-FINISH-003

Given complete and defective existing-format spec/plan fixtures, structural validation detects scoped missing coverage, dangling and duplicate references; complete fixtures pass. Semantic review independently catches seeded ambiguity and supplies a usable clarification.

### REQ-FINISH-004

Given exhausted onboarding time, missing mandatory gates force a Not done report. A fresh-repository CLI fixture demonstrates initialization, checks and recovery with agent-run timings.

### REQ-FINISH-005

Given an authored pack and detached bundle, signing uses the verifier's existing exact payload and verify/install/update round-trip passes; changed bytes, wrong identity, malformed bundles and unsafe paths fail closed. Credentials never enter artifacts.

### REQ-FINISH-006

Given observed release traffic and the official endpoint contract, all release jobs use justified fail-closed egress and retain credential separation/digest handoff. A non-publishing rehearsal passes; authenticated signing/final publish proof remains separately identified.

### REQ-FINISH-007

Given script import or direct invocation, one shared native-TypeScript bootstrap preserves import safety, forwarded flags and useful failures. A packed external TypeScript consumer resolves the public API and reachable types; declaration bytes enter size accounting.

### REQ-FINISH-008

Given injected ambient input, mismatched model/effort or uninspectable traces, eval admission blocks. A supported fresh execution path records exact inputs and provider controls, handles bounded dispatch and admits scores only after all selected-rubric fixtures calibrate.

### REQ-FINISH-009

Given the six retained failed scenarios and changed-source cases, independent review classifies corpus/instrument causes, supported behavior is repaired and affected three-sample evaluations retain strict floors and historical inputs/results. Model change includes every adversarial case.

### REQ-FINISH-010

Given current dependency primary sources, apply an available supported site fix or date the exact unmet trigger. Integrate regenerated surfaces, required local/CI/site/consumer gates, reviewed fixes, candidate identity and human/external proof dispositions.

## Acceptance criteria

- REQ-FINISH-001: Given each supported client, discovery/invocation and native hook allow/deny/error/timeout fixtures match current official contracts, including identity-free events and unsupported fields.
- REQ-FINISH-002: Given multi-client init/sync/check/clean and authored skill metadata/companions, user content survives, command names remain compatible, the charter template stays at most 150 lines and each measured client budget only ratchets down. All three client proposals and native-memory overlap receive dated dispositions.
- REQ-FINISH-003: Given complete and defective existing-format spec/plan fixtures, structural validation detects scoped missing coverage, dangling and duplicate references; complete fixtures pass. Semantic review independently catches seeded ambiguity and supplies a usable clarification.
- REQ-FINISH-004: Given exhausted onboarding time, missing mandatory gates force a Not done report. A fresh-repository CLI fixture demonstrates initialization, checks and recovery with agent-run timings.
- REQ-FINISH-005: Given an authored pack and detached bundle, signing uses the verifier's existing exact payload and verify/install/update round-trip passes; changed bytes, wrong identity, malformed bundles and unsafe paths fail closed. Credentials never enter artifacts.
- REQ-FINISH-006: Given observed release traffic and the official endpoint contract, all release jobs use justified fail-closed egress and retain credential separation/digest handoff. A non-publishing rehearsal passes; authenticated signing/final publish proof remains separately identified.
- REQ-FINISH-007: Given script import or direct invocation, one shared native-TypeScript bootstrap preserves import safety, forwarded flags and useful failures. A packed external TypeScript consumer resolves the public API and reachable types; declaration bytes enter size accounting.
- REQ-FINISH-008: Given injected ambient input, mismatched model/effort or uninspectable traces, eval admission blocks. A supported fresh execution path records exact inputs and provider controls, handles bounded dispatch and admits scores only after all selected-rubric fixtures calibrate.
- REQ-FINISH-009: Given the six retained failed scenarios and changed-source cases, independent review classifies corpus/instrument causes, supported behavior is repaired and affected three-sample evaluations retain strict floors and historical inputs/results. Model change includes every adversarial case.
- REQ-FINISH-010: Given current dependency primary sources, apply an available supported site fix or date the exact unmet trigger. Integrate regenerated surfaces, required local/CI/site/consumer gates, reviewed fixes, candidate identity and human/external proof dispositions.

## References

- `source`: `docs/plans/006-finish-implementation.md` — implementation units and contract census.
- `source`: `docs/specs/apm-canonical-distribution.md`, `docs/specs/fork-layer.md`,
  `docs/specs/enterprise-upstream-lane.md` — retained distribution contracts.
- `test`: each unit's `verify` field names its focused checks; final verification records
  bind the complete candidate to required local, CI, behavioral and human evidence.
- `judgment`: independent reviewers classify behavioral causes and semantic ambiguity;
  the maintainer owns human QA and platform approvals.

## Risks

- Ambient model inputs invalidate behavioral evidence; preflight and calibration block admission.
- Native client capabilities can change; dated official references and fixtures bound each guarantee.
- Missing external or human proof prevents an unqualified completion claim.

## Concerns

| Claim | Evidence | Impact | Disposition |
|---|---|---|---|
| Historical behavioral failures remain evidence | `evals/runs/2026-09-10-run-10/RESULTS.md` | New repairs require fresh admissible evaluation | Preserve originals; evaluate changed inputs separately |
| Previous fresh-agent dispatch admitted extra context | `evals/runs/2026-09-10-run-11/RESULTS.md` | Uncalibrated or unisolated scores cannot gate work | Repair admission and prove it live before scoring |
