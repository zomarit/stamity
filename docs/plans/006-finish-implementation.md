---
id: finish-implementation
intent: roadmap
stamp: 99c1094953346ef19a8aaab3ee0bd7d292c36ba6 2026-09-10
reads: [AGENTS.md, src/adapters, src/hooks, src/emit/skillsProjection.ts, src/roster/modelLadder.ts, content/commands, content/skills, src/pack/trust.ts, src/index.ts, package.json, tsdown.config.mjs, scripts, .github/workflows/release.yml, SECURITY.md, docs/capability-matrix.md, docs/specs/apm-canonical-distribution.md, docs/specs/enterprise-upstream-lane.md, docs/specs/fork-layer.md, evals/SET-v4.md, evals/MODEL-PROFILES-v1.md, evals/model-profiles-v1.json, evals/rubric-v5.md]
---

# Finish implementation

## Context

Complete the remaining client, authoring, signing, distribution and behavioral-runner
engineering against released 1.6.0. At intake the clean local HEAD, remote main and peeled
release tag equal the stamp above; GitHub and npm latest remain 1.6.0. The user authorizes
planning, implementation, review, verification and a candidate PR in one continuing run.
The user subsequently authorized release 1.7.0 after all applicable gates pass. Final
comparative measurement, downstream live audit and cleanup remain separate steps; existing
human QA and platform approval controls remain binding. A fresh full release eval is required.

## Spec delta

Add `docs/specs/implementation-finish.md` before the implementation wave. Existing APM,
fork and upstream specifications remain contracts to preserve, not features to rebuild.

| Requirement | Observable acceptance |
|---|---|
| REQ-FINISH-001 | Given each supported client, discovery/invocation and native hook allow/deny/error/timeout fixtures match current official contracts, including identity-free events and unsupported fields. |
| REQ-FINISH-002 | Given multi-client init/sync/check/clean and authored skill metadata/companions, user content survives, command names remain compatible, the charter template stays at most 150 lines and each measured client budget only ratchets down. All three client proposals and native-memory overlap receive dated dispositions. |
| REQ-FINISH-003 | Given complete and defective existing-format spec/plan fixtures, structural validation detects scoped missing coverage, dangling and duplicate references; complete fixtures pass. Semantic review independently catches seeded ambiguity and supplies a usable clarification. |
| REQ-FINISH-004 | Given exhausted onboarding time, missing mandatory gates force a Not done report. A fresh-repository CLI fixture demonstrates initialization, checks and recovery with agent-run timings. |
| REQ-FINISH-005 | Given an authored pack and detached bundle, signing uses the verifier's existing exact payload and verify/install/update round-trip passes; changed bytes, wrong identity, malformed bundles and unsafe paths fail closed. Credentials never enter artifacts. |
| REQ-FINISH-006 | Given observed release traffic and the official endpoint contract, all release jobs use justified fail-closed egress and retain credential separation/digest handoff. A non-publishing rehearsal passes; authenticated signing/final publish proof remains separately identified. |
| REQ-FINISH-007 | Given script import or direct invocation, one shared native-TypeScript bootstrap preserves import safety, forwarded flags and useful failures. A packed external TypeScript consumer resolves the public API and reachable types; declaration bytes enter size accounting. |
| REQ-FINISH-008 | Given injected ambient input, mismatched model/effort or uninspectable traces, eval admission blocks. A supported fresh execution path records exact inputs and provider controls, handles bounded dispatch and admits scores only after all selected-rubric fixtures calibrate. |
| REQ-FINISH-009 | Given the six retained failed scenarios and changed-source cases, independent review classifies corpus/instrument causes, supported behavior is repaired and affected three-sample evaluations retain strict floors and historical inputs/results. Model change includes every adversarial case. |
| REQ-FINISH-010 | Given current dependency primary sources, apply an available supported site fix or date the exact unmet trigger. Integrate regenerated surfaces, required local/CI/site/consumer gates, reviewed fixes, candidate identity and human/external proof dispositions. |

## Units

### U1 — client-contracts

- **requirements**: REQ-FINISH-001, REQ-FINISH-002.
- **files**: `src/adapters/**`, `src/hooks/**`, `src/emit/hooksInfra.ts`, necessary skill projection/init-panel/model-ladder code and focused tests, authored skill metadata/sidecars, capability source and corresponding public client documentation.
- **interfaces**: existing hook interchange `{ event, matcher, command, timeoutMs }` remains the shared facade. Vendor output transforms own native payload keys and seconds conversion. Skill frontmatter retains `compatibility` and `license`; companion paths remain relative validated files. Invocation names remain `st-*`; native syntax is client-specific. User-owned entries and four-client install/sync/check/clean semantics remain unchanged.
- **testCriteria**: native allow/deny/error/timeout fixtures, identity-free and unsupported-field payloads; correct first-run native skill instruction; supported legacy command invocation; user-hook/skill preservation; measured charter and client budgets do not increase.
- **edgeCases**: native timeout fail-open is disclosed rather than promised blocking; unsupported native behavior uses a named manual fallback. Existing command delivery can adjudicate a proposal without migration.
- **depends_on**: none, after the spec and census are persisted.
- **verify**: focused adapter/hooks/skills/init tests, capability generator and client lifecycle fixtures.

### U2 — authoring-and-behavior

- **requirements**: REQ-FINISH-003, REQ-FINISH-004, REQ-FINISH-009.
- **files**: the new spec; canonical spec/plan/work/board commands, onboard body, injection/secrets/security rules, reviewer/spec-author corpus, `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, focused tests and versioned affected/new eval cases; `src/detect/verificationGates.ts` and its tests for explicitly configured JavaScript typecheck scripts.
- **interfaces**: existing terminal statuses remain `DONE`, `BLOCKED_AMBIGUITY`, `BLOCKED_DEPENDENCY`, `BLOCKED_FAILURE`. Structural helper is a read-only projected skill companion, not a new public CLI verb or parallel spec system. It validates requirement IDs and unit/dependency references, scopes reverse coverage to declared work, supports existing plans, and reports `semanticReview: required`. Every reviewer finding identifies its evidence basis; direct source evidence never claims a test ran.
- **testCriteria**: complete legacy/new plans pass; missing, dangling and duplicate references fail; semantic ambiguity case asks a concrete clarification. Exhausted onboarding time never claims done without lint/typecheck/tests. All six original run-10 failure causes are independently reproduced from retained transcripts and source repairs reach the new evaluated Briefs.
- **edgeCases**: shared requirements across units are valid; removed requirements require a disposition. A timer narrows scope or reports Not done. Credential fragments and injected payload text never appear even as examples of prohibited behavior. Benign optional skips proceed without invented guardrail lectures.
- **depends_on**: none, after the spec and census are persisted; behavioral scoring depends on U4 and U5.
- **verify**: structural fixtures, focused corpus/eval tests, fresh-repository fixture and admitted affected eval slice.

### U3 — signing-and-distribution

- **requirements**: REQ-FINISH-005, REQ-FINISH-006, REQ-FINISH-007, REQ-FINISH-010.
- **files**: pack signing helper/author script and tests, existing pack/security docs, `scripts/native-typescript.mjs` and sibling scripts, `package.json`, lockfile, `tsdown.config.mjs`, `src/index.ts`, `src/composition/root.ts`, packed smoke/accounting tests, release workflow/tests, dated dependency evidence.
- **interfaces**: reuse `sigstoreSignedPayload(computeAggregateContentSha(manifest.integrity))` and existing signing `{ method, signer, bundlePath }` manifest contract. No second payload, new CLI verb or publisher endorsement. `.exports["."]` keeps the current JavaScript target and adds resolvable declarations. Native bootstrap detects direct invocation, reexecutes at most once, forwards execArgv/argv and preserves useful nonzero failures. Release jobs remain `gates`, `apm-route`, `publish`; build/APM have no publishing identity, publish verifies the artifact digest and retains its human environment gate.
- **testCriteria**: cryptographic boundary-labelled round trip and negative signing fixtures; imports neither spawn nor write; flags and signals handled; external packed TS/JS consumer passes; declarations are counted; all non-publishing rehearsal jobs pass the narrowed network policy.
- **edgeCases**: unsafe bundle paths and wrong identity refuse before output; dynamic artifact endpoints use current supported endpoint evidence rather than a single observed host. No supported Docusaurus/image-size fix means an exact dated trigger, not a speculative replacement. Real authenticated sign and publish paths remain later proof.
- **depends_on**: none, after the spec and census are persisted.
- **verify**: focused pack/script/workflow/accounting tests, build, packed TS/JS smoke, site dependency check, actual dry-run release workflow.

### U4 — isolated-eval-runner

- **requirements**: REQ-FINISH-008, REQ-FINISH-009.
- **files**: manually invoked eval harness/helpers/tests and runner documentation/skill; new run artifacts only. Original runs, rubric labels and binding thresholds remain unchanged.
- **interfaces**: selected whole profile `codex-astra`: scenario `gpt-6-astra`/`high`, judge `gpt-5.6-sol`/`high`, rubric-v5. Default profile remains `claude`. Scenario receives exactly Brief; judge receives only rubric core, Brief, Expected and transcript. Requested/resolved model and effort are distinct from optional attestation; unavailable decoding controls are stated. Record actual tool exposure and inspect traces. Calibration configuration includes hashes of model controls, rubric, harness and isolation. Capacity queues fresh independent calls; only invalid/infrastructure calls retry under bounded policy, never scored failures.
- **testCriteria**: injected ambient messages, calibration labels, changed bytes, wrong models/effort and hidden traces block admission; positive controls pass; all fixtures must calibrate before scoring. Raw allowed inputs/hashes, actual provider metadata, output/trace and retries are retained. Live unavailable capability remains unmeasured, never replaced by passing mock evidence.
- **edgeCases**: `fork_turns: none` alone is insufficient. Missing model attestation is reported separately, not turned into a new gate if required provider identity is established. Fresh run ID preserves run 11 and its unadmitted C1.
- **depends_on**: U2 ownership of changed case inputs; implementation may proceed independently when its writer slot becomes available. Scoring waits for committed, reviewed inputs.
- **verify**: load-bearing preflight tests, live isolation/model probe, all-fixture calibration, affected-source plus all-adversarial three-sample evaluation.

### U5 — integration-review-proof

- **requirements**: REQ-FINISH-001, REQ-FINISH-002, REQ-FINISH-003, REQ-FINISH-004, REQ-FINISH-005, REQ-FINISH-006, REQ-FINISH-007, REQ-FINISH-008, REQ-FINISH-009, REQ-FINISH-010.
- **files**: generated APM/dogfood/goldens/docs, candidate/review/verification/QA records. Product fixes return to their owner; one integration writer regenerates after other writers converge.
- **interfaces**: canonical/fork/user identity, public/private APM distribution and independent private history, enterprise Renovate/upstream recovery and all supported CLI contracts remain intact. Candidate SHA and evidence-input hashes identify precisely what each proof covers. No private planning source or confidential identifiers enter public commits.
- **testCriteria**: lint, typecheck, tests with coverage, build, leak, Knip, generators, dogfood, packed consumers, actual required Linux/Windows CI and applicable site/browser accessibility gates pass. Independent review findings are fixed and rechecked. Human QA signs only the identified candidate; keyboard/screen-reader walks remain unperformed until actually recorded.
- **edgeCases**: unavailable enterprise engine/bot/network/monitor configuration, private enforcement HTTP403, registry binding HTTP401 and human walks remain explicit owner-dependent proof gaps. Historical release sign-off and eval reuse do not transfer. A red/unavailable affected eval remains Not done even with green deterministic gates.
- **depends_on**: U1, U2, U3, U4.
- **verify**: full gate/coverage plus build/leak/Knip; actual CI, non-publishing rehearsal, site and packed-consumer evidence; independent final review and item-to-proof handoff.

## Shared-contract census

Repository-wide reader searches precede edits. The research agents enumerated producers and
consumers; each implementation owner must report clean/reconciled/unreconciled on completion.

| Contract / class | Producer and consumers | Change / sole writer |
|---|---|---|
| Hook interchange / wire fields | hook model → all adapters, hooksInfra, pack projection, user hooks, native fixtures, capability generator | Preserve shared shape; vendor conversion changes U1. |
| Skill metadata and companion paths / persisted names | content frontmatter/support files → skillsProjection, adapters, pack/APM projection, generated docs | Add authored values/sidecars U1; onboard body U2. U1 supplies metadata patch to U2 if both touch the same file. |
| Command names/statuses/gate contract / constants | canonical workflows → adapters/APM/dogfood, corpus fixtures, eval Briefs | Preserve names/statuses/floors; authoring/behavior prose U2; generated consumers U5. |
| Requirement IDs/unit references / persisted names | specs/plans → workflow lint/review/projected companion | Add scoped structural checks U2; retain existing plan readability and semantic review. |
| Detected verification gates / gate command values | verificationGates.ts → all client charters/substitution and detection/emission fixtures | Honor explicit typecheck scripts in JavaScript repos; preserve result shape and no-script fallback; U2 owns producer/tests, U5 generated consumers. |
| Sigstore payload/signing manifest / symbols and fields | trust.ts/manifest.ts → verifier/install/update/author helper/tests | Unchanged payload/schema, new author consumer and additive `pack.sign` registry operation/`SignPackOptions` export U3. |
| Native TS direct/import/exit contract / symbols | script preambles → generators/advisory/CLI tests | One shared helper and all existing callers U3; later U4 consumes it if needed. |
| Public package exports/declaration accounting / config keys | index/package/tsdown → runtime imports, tarball tests, size-budget, release | Add types while retaining JavaScript entry U3. No other writer changes these files. |
| Release job permissions/artifact handoff / config keys | release.yml → workflow tests/platform/rehearsal | Egress-only implementation and accurate docs U3; approval/public-private gates held. |
| Eval profile/Brief/Expected/rubric/run artifact / fields | committed set/profile/cases → harness/calibration/judge/aggregator | U2 owns changed/new cases; U4 owns runner and new results; historical bytes/floors held. |
| Generated surfaces / artifacts | corpus/adapters/generators → APM/client/docs/goldens | Only U5 regenerates after source writers converge. |

## Risks

- **Critical**: accidental confidential publication, changed signing payload, weakened release
  permissions or inadmissible eval evidence. Mitigation: explicit staging, unchanged held
  contracts, negative tests, independent review and fail-closed admission.
- **Warning**: native client capabilities differ and evolve. Mitigation: dated official
  sources, native fixtures and precise fallback disclosures.
- **Warning**: unavailable external proof or human sign-off prevents an unqualified done
  claim. Mitigation: continue independent work, retain exact proof/owner and deliver the
  reviewed candidate with explicit Not done items.

## Open questions

No implementation decision is awaiting the operator. Overnight execution follows the
authorized scope and reversible defaults above. The candidate may merge and release as 1.7.0 after all applicable release gates pass, including
a fresh full eval, current human QA and the existing platform approval. No cleanup occurs.
Human QA approval is requested only against the finished reviewable candidate.

Plan lint: observable criteria, resolvable dependencies, nonempty edge cases and all new
requirement definitions are present in the proposed spec delta. The spec is materialized
before source implementation; later structural validation rechecks this plan.
