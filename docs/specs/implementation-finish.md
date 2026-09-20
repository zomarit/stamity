---
id: implementation-finish
status: shipped-with-1.7.0
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

Given each supported client, discovery/invocation and native hook allow/deny/error/timeout fixtures match current official contracts, including identity-free events and unsupported fields. Every Cursor allow path writes an explicit `{"permission":"allow"}`, and a Cursor pre-tool-use verdict the runner cannot read, meaning an unrecognized output field beside no readable decision, faults with exit 1 and no output, which that client counts as a fail-closed denial; a silent child still allows. Copilot `sessionStart` output reaches the session as `additionalContext`. The Codex starter resolves its hook script from the directory holding `.codex/hooks.json`, not from the nearest match above the session directory. Every vendor literal in the portable runner and the adapters carries its URL and an access date. Every repository-relative Claude Code hook command is rendered as one double-quoted word under `${CLAUDE_PROJECT_DIR}`, the project root that client exports, so a session whose working directory has moved below or out of the repository root still resolves each command, while the tool-neutral interchange rows stay repository-relative. The core pre-tool-use guard's command alone fails closed: a guard that cannot be launched at all, meaning missing after a `clean`, an unset project-directory variable, a syntax error or no `node`, blocks the call with `stamity: the pre-tool-use guard could not run; run stamity sync` on stderr rather than passing on the non-blocking exit 1 that client ignores, while the guard's own exit 2 is re-raised in silence so a legitimate denial carries no repair line, and the session-start, tamper-notice, review-gate and user rows keep that client's non-blocking semantics; the tail is POSIX, and its behavior under the Windows PowerShell fallback is recorded as unmeasured rather than claimed. A core hook script emitted in repository mode at `<root>/.stamity/generated/hooks/<tool>/` derives its repository root from its own location, accepted only under those three parent segments, so it reads and writes that repository's own `.stamity/` from a working directory below the root, while a copy placed in a vendor plugin container keeps the working-directory-and-environment resolver.

### REQ-FINISH-002

Given multi-client init/sync/check/clean and authored skill metadata/companions, user content survives, command names remain compatible, the charter template stays at most 150 lines and each measured client budget only ratchets down. All three client proposals and native-memory overlap receive dated dispositions.

### REQ-FINISH-003

Given complete and defective existing-format spec/plan fixtures, structural validation detects scoped missing coverage, dangling and duplicate references; complete fixtures pass. Semantic review independently catches seeded ambiguity and supplies a usable clarification. The checker expands a prose requirement range or reports `partial-scope` when nothing closes it, reports `missing-spec-delta` for an absent or suffixed `## Spec delta` heading, splits a line carrying both ADDED and REMOVED at those keywords, and reports `invalid-reference` for a range whose endpoints name two areas, so none of those shapes passes with requirements out of scope. A plan's own `### REQ-` heading inside its spec delta is a provisional definition only where no spec defines that id (`provisional-definition`, advisory); a spec definition wins and produces no finding, and a second provisional definition of one id is `duplicate-requirement`.

### REQ-FINISH-004

Given exhausted onboarding time, missing mandatory gates force a Not done report. A fresh-repository CLI fixture demonstrates initialization, checks and recovery with agent-run timings.

### REQ-FINISH-005

Given an authored pack and detached bundle, signing uses the verifier's existing exact payload and verify/install/update round-trip passes; changed bytes, wrong identity, malformed bundles and unsafe paths fail closed. Credentials never enter artifacts. The pack-signing rehearsal signs the source it checks out at `github.sha`: the workflow sets no pin, and the script derives `sourceSha` from `GITHUB_SHA` when none is set, so a pinned commit is a reviewed exception rather than the ordinary path. Where a `SIGNING_SOURCE_SHA` pin is present, its own test asserts the pinned commit is an ancestor of `origin/main`, and skips with that reason recorded where git or the `origin/main` ref is unavailable. It re-runs on any change under `src/pack/**`, `src/merge/**` or `package-lock.json`. The author documentation names the two identity sources signing needs, a GitHub Actions job granting `id-token: write` or an environment carrying `SIGSTORE_ID_TOKEN`, and the signing script prints an `EngineError`'s code and message while keeping the generic line for every other failure.

### REQ-FINISH-006

Given observed release traffic and the official endpoint contract, all release jobs use justified fail-closed egress and retain credential separation/digest handoff. A non-publishing rehearsal passes; authenticated signing/final publish proof remains separately identified.

### REQ-FINISH-007

Given script import or direct invocation, one shared native-TypeScript bootstrap preserves import safety, forwarded flags and useful failures. A packed external TypeScript consumer resolves the public API and reachable types; declaration bytes enter size accounting.

### REQ-FINISH-008

Given injected ambient input, mismatched model/effort or uninspectable traces, eval admission blocks. A supported fresh execution path records exact inputs and provider controls, handles bounded dispatch and admits scores only after all selected-rubric fixtures calibrate. The advisory-repeat comparison is keyed on the run's configuration, meaning its profile, rubric core hash and harness, rather than on its input bytes, so a repeat is detected across candidates; `configurationHash` stays the exact-input receipt on every summary.

### REQ-FINISH-009

Given the six retained failed scenarios and changed-source cases, independent review classifies corpus/instrument causes, supported behavior is repaired and affected three-sample evaluations retain strict floors and historical inputs/results. Model change includes every adversarial case.

### REQ-FINISH-010

Given current dependency primary sources, apply an available supported site fix or date the exact unmet trigger. Integrate regenerated surfaces, required local/CI/site/consumer gates, reviewed fixes, candidate identity and human/external proof dispositions.

## Acceptance criteria

- REQ-FINISH-001: Given each supported client, discovery/invocation and native hook allow/deny/error/timeout fixtures match current official contracts, including identity-free events and unsupported fields. Every Cursor allow path writes an explicit `{"permission":"allow"}`, and a Cursor pre-tool-use verdict the runner cannot read, meaning an unrecognized output field beside no readable decision, faults with exit 1 and no output, which that client counts as a fail-closed denial; a silent child still allows. Copilot `sessionStart` output reaches the session as `additionalContext`. The Codex starter resolves its hook script from the directory holding `.codex/hooks.json`, not from the nearest match above the session directory. Every vendor literal in the portable runner and the adapters carries its URL and an access date. Every repository-relative Claude Code hook command is rendered as one double-quoted word under `${CLAUDE_PROJECT_DIR}`, the project root that client exports, so a session whose working directory has moved below or out of the repository root still resolves each command, while the tool-neutral interchange rows stay repository-relative. The core pre-tool-use guard's command alone fails closed: a guard that cannot be launched at all, meaning missing after a `clean`, an unset project-directory variable, a syntax error or no `node`, blocks the call with `stamity: the pre-tool-use guard could not run; run stamity sync` on stderr rather than passing on the non-blocking exit 1 that client ignores, while the guard's own exit 2 is re-raised in silence so a legitimate denial carries no repair line, and the session-start, tamper-notice, review-gate and user rows keep that client's non-blocking semantics; the tail is POSIX, and its behavior under the Windows PowerShell fallback is recorded as unmeasured rather than claimed. A core hook script emitted in repository mode at `<root>/.stamity/generated/hooks/<tool>/` derives its repository root from its own location, accepted only under those three parent segments, so it reads and writes that repository's own `.stamity/` from a working directory below the root, while a copy placed in a vendor plugin container keeps the working-directory-and-environment resolver.
- REQ-FINISH-002: Given multi-client init/sync/check/clean and authored skill metadata/companions, user content survives, command names remain compatible, the charter template stays at most 150 lines and each measured client budget only ratchets down. All three client proposals and native-memory overlap receive dated dispositions.
- REQ-FINISH-003: Given complete and defective existing-format spec/plan fixtures, structural validation detects scoped missing coverage, dangling and duplicate references; complete fixtures pass. Semantic review independently catches seeded ambiguity and supplies a usable clarification. The checker expands a prose requirement range or reports `partial-scope` when nothing closes it, reports `missing-spec-delta` for an absent or suffixed `## Spec delta` heading, splits a line carrying both ADDED and REMOVED at those keywords, and reports `invalid-reference` for a range whose endpoints name two areas, so none of those shapes passes with requirements out of scope. A plan's own `### REQ-` heading inside its spec delta is a provisional definition only where no spec defines that id (`provisional-definition`, advisory); a spec definition wins and produces no finding, and a second provisional definition of one id is `duplicate-requirement`.
- REQ-FINISH-004: Given exhausted onboarding time, missing mandatory gates force a Not done report. A fresh-repository CLI fixture demonstrates initialization, checks and recovery with agent-run timings.
- REQ-FINISH-005: Given an authored pack and detached bundle, signing uses the verifier's existing exact payload and verify/install/update round-trip passes; changed bytes, wrong identity, malformed bundles and unsafe paths fail closed. Credentials never enter artifacts. The pack-signing rehearsal signs the source it checks out at `github.sha`: the workflow sets no pin, and the script derives `sourceSha` from `GITHUB_SHA` when none is set, so a pinned commit is a reviewed exception rather than the ordinary path. Where a `SIGNING_SOURCE_SHA` pin is present, its own test asserts the pinned commit is an ancestor of `origin/main`, and skips with that reason recorded where git or the `origin/main` ref is unavailable. It re-runs on any change under `src/pack/**`, `src/merge/**` or `package-lock.json`. The author documentation names the two identity sources signing needs, a GitHub Actions job granting `id-token: write` or an environment carrying `SIGSTORE_ID_TOKEN`, and the signing script prints an `EngineError`'s code and message while keeping the generic line for every other failure.
- REQ-FINISH-006: Given observed release traffic and the official endpoint contract, all release jobs use justified fail-closed egress and retain credential separation/digest handoff. A non-publishing rehearsal passes; authenticated signing/final publish proof remains separately identified.
- REQ-FINISH-007: Given script import or direct invocation, one shared native-TypeScript bootstrap preserves import safety, forwarded flags and useful failures. A packed external TypeScript consumer resolves the public API and reachable types; declaration bytes enter size accounting.
- REQ-FINISH-008: Given injected ambient input, mismatched model/effort or uninspectable traces, eval admission blocks. A supported fresh execution path records exact inputs and provider controls, handles bounded dispatch and admits scores only after all selected-rubric fixtures calibrate. The advisory-repeat comparison is keyed on the run's configuration, meaning its profile, rubric core hash and harness, rather than on its input bytes, so a repeat is detected across candidates; `configurationHash` stays the exact-input receipt on every summary.
- REQ-FINISH-009: Given the six retained failed scenarios and changed-source cases, independent review classifies corpus/instrument causes, supported behavior is repaired and affected three-sample evaluations retain strict floors and historical inputs/results. Model change includes every adversarial case.
- REQ-FINISH-010: Given current dependency primary sources, apply an available supported site fix or date the exact unmet trigger. Integrate regenerated surfaces, required local/CI/site/consumer gates, reviewed fixes, candidate identity and human/external proof dispositions.

## References

- `source`: `docs/plans/006-finish-implementation.md` — implementation units and contract census.
- `source`: `docs/plans/008-plugin-lifecycle-01.md`: the audit fix batch of 2026-09-19 that
  amended REQ-FINISH-001, -003, -005 and -008. Its run record is
  `.stamity/runs/2026-09-17_plugin-lifecycle/record.md`. The same run's session of 2026-09-20
  amended REQ-FINISH-001 once more through its hook-path unit — the anchored Claude hook commands,
  the fail-closed pre-tool-use guard and the script-located repository root — whose measurements,
  residuals and commits (`ab9eae6`, `4c23e98`, `16b895b`, `f678fa3`, then the fix round) are that
  record's session-3 entries.
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
