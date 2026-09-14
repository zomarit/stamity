---
id: prove-behavior-and-value
intent: feature
stamp: 949bde928e0ce3298015e35937594775e897a670 2026-09-14
reads: [AGENTS.md, content/charter/stamity-charter.md, content/rules, content/agents/stamity-performance.md, content/agents/stamity-security.md, content/commands/st-spec.md, src/content/charter.ts, src/emit/skillsProjection.ts, src/emit/planner.ts, src/emit/agentsMd.ts, src/emit/substitution.ts, src/emit/capabilityMatrix.ts, src/adapters/claude.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/adapters/cursor.ts, src/types/manifest.ts, src/cli/commands/check.ts, src/cli/commands/config.ts, src/worktree/git.ts, src/merge/atomicWrite.ts, scripts/eval/instrument.mjs, scripts/eval/run.mjs, scripts/generate-docs.mjs, scripts/generate-apm-package.mjs, evals/SET-v6.md, evals/README.md, evals/model-profiles-v1.json, evals/MODEL-PROFILES-v1.md, evals/cases-v5, evals/runs/2026-09-11-run-24, test/evals, test/corpus/invariants.test.ts, test/docsPages.test.ts, test/ci/docsRoster.test.ts, test/adapters/codex.test.ts, test/emit/skillsProjection.test.ts, test/merge/atomicWrite.test.ts, test/worktree/engine.test.ts, docs/doctrine.md, docs/capability-matrix.md, docs/specs, SECURITY.md, GOVERNANCE.md, CONTRIBUTING.md, README.md, .github/release-controls-checklist.md, .stamity/overrides/skills/st-eval-run/SKILL.md, .stamity/learnings, .stamity/inbox.md, website/sidebars.ts, website/package.json, src/cli/docs/llmsIndex.ts]
---

# Prove behavior and value — Package 11, tracks D, A and C, and the 1.8.0 cut

intent chosen: feature because net-new capabilities are named (an emission option, a versioned
invariants line, a QA harness, a measurement report, a security mapping) — the two defect repairs
and the eval-row repairs ride inside it as units with failing-test-first criteria; the roadmap
intent was declined because the sequencing is fixed by the maintainer's instruction of
2026-09-14, not open. `Default applied: feature vs. bug+roadmap → feature (one artifact, one lint
pass; the defects carry their own failing tests)`.

## Context

1.7.0 shipped with named residue: an always-on budget nobody measured (cursor 92 · claude 236 ·
copilot 236 · codex 1063 lines against a 150-line charter template), seven charter invariants
without a version, nine human QA rows accepted UNPERFORMED twice, public and private records
that went stale after the release, and the measurement and security evidence surfaces Track C
promised. This plan builds every item of tracks D, A and C, versions the eval set as SET-v7 with
cases-v6 so the demotion is measured before the ratchets move, and prepares the 1.8.0 candidate.
Out of scope: Track B's with/without benchmark (scheduled, trigger unchanged), telemetry of any
kind, any edit to a retained eval baseline, and the cut mechanics themselves (they run after the
Phase 2 measurement, not as plan units).

Shared intake, read inline: the charter's repo facts and gates (`AGENTS.md`); the seven spec
headers under `docs/specs/` (three read `design`/`draft` though shipped — REQ-PROVE-016); all
five learnings (dogfood sync, leak gate over state files, release-close re-sync, surface pins,
local gate weaker than CI — each shapes a unit below); the deferral inbox (no active rows);
history of the charter since v1.0.0 (four commits, all pre-versioning, last 2026-09-13).

Research fan-out: nine read-only researchers (always-on design, invariants version, QA
automation, record currency, measurement report, security primary sources, carried defects,
eval-set mechanics, budget-anchor sources), 2026-09-14 23:33–23:58 local. Findings that changed
the design: the probe skill surface is a closed eight-description list, so rule-projected skills
need probes with an extended surface and a label derivation from `source:`; `parseGrade` already
receives the case object, so no new parameter is needed for ordering criteria; the atomic-write
loop already retries EPERM on win32 and the flake is its ceiling; the private currency helper does
not exist; GOVERNANCE.md is deliberately outside the tested hand-page bucket; arXiv 2601.20404's
abstract measures AGENTS.md presence, not a length threshold.

Dimension defaults assumed (recorded, not asked — the instruction forbids stopping):
- Rule-skill directory name `stamity-<rule-id>` (not `st-`; the `st-` surface does not move).
- Codex under `on-demand` folds exactly the critical and `floor:*` rules; every other rule is a
  skill (deterministic; the shaper then drops nothing on the shipped corpus).
- The invariants version line is a template token line directly under `## Invariants`, so the
  always-on accounting counts it and the four charter-sourced cases shift by one line.
- The ai-evals floor line lives in the charter's `## Conditional layer` (not the invariants block,
  which stays byte-stable for version 1.0.0), and the template pays for both new lines by
  rewrapping unsourced paragraphs so it stays at 92 lines if that can be done without changing
  meaning; otherwise cursor's ratchet moves by the measured +1/+2 with the reason recorded.
- The worktree race fix is retry-once on the exact stderr (`Default applied: serialize on win32
  vs. retry once on the exact stderr → retry once (lowest blast radius, reversible; serialization
  stays available if it recurs)`).
- Merge evidence for the merge-ready rate is a pull-request number named in the run record that
  also appears in `CHANGELOG.md` under a released version (committed artifacts only; no network).

## Spec delta

Stated against `docs/specs/prove-behavior-and-value.md` (new, `status: design`, authored by the
spec-author from this plan's requirement list; `/st-work` marks it `shipped-with-1.8.0` at the
close). ADDED: REQ-PROVE-001 … REQ-PROVE-021, one per numbered requirement in that file, each with
Given/When/Then criteria. MODIFIED: none of the existing specs' requirements; three existing specs
change only their `status` line (REQ-PROVE-016). No requirement is retired by this plan.

## Units

Batches: B0 runs first; B1 units run in parallel after B0; B2 after B1; B3 (integration) last.
Every unit's `verify` is the charter gate plus the coverage flag CI enforces; corpus units add
the dogfood sync. One writer per file: where two units name one file, the later batch owns it.

### U0a — eval-set-v7-cutover (B0)

| Field | Content |
|---|---|
| `id` | u0a-evalset-cutover |
| `requirements` | REQ-PROVE-009, REQ-PROVE-017 (the profile half) |
| `files` | `evals/cases-v6/**` (byte copy of `evals/cases-v5/**`), `evals/coverage-exemptions-v6.md`, `evals/SET-v7.md`, `evals/model-profiles-v1.json`, `evals/MODEL-PROFILES-v1.md`, `test/evals/support.ts`, `test/evals/manualRunner.test.ts`, `test/evals/modelProfiles.test.ts`, `test/evals/successorInputs.test.ts`, `test/evals/prospectiveCalibration.test.ts` (only if a literal breaks), `scripts/eval/run.mjs`, `scripts/eval/instrument.mjs` (comments only; the `rule: 'SET-v6'` string stays — the scoring rule keeps its name) |
| `interfaces` | `test/evals/support.ts`: `CASES_DIR = "evals/cases-v6"`, `EXEMPTIONS_FILE = "evals/coverage-exemptions-v6.md"`, `SET_FILE = "evals/SET-v7.md"`, `RUBRIC_FILE = "evals/rubric-v7.md"`. `evals/model-profiles-v1.json`: `set: "evals/SET-v7.md"`, `profiles.claude.rubric: "evals/rubric-v7.md"` (AD-119 moved the rubric; the JSON lagged). `SET-v7.md` opens: "# Eval set v7 — v6's scoring rule and thresholds, unchanged; cases-v6 carries v5's 78 cases byte-identical plus the cases this version adds (index below)"; sections: Scope · Versioned inputs (cases-v6, SET-v7, profile v1 with rubric-v7 for `claude`) · Scoring rule (verbatim from SET-v6, "the rule keeps the name SET-v6") · the four-metric table with unchanged thresholds · "What v7 adds" (filled by U2c: rule-projected-skill probes, the label derivation, the charter-floor twins) · Run-artifact contract (verbatim, item 9 "— five today") · Hard triggers (paths → v6/v7) · Case index (derived; initially v6's 78 rows) · Coverage · Running v7 · Appendix — the non-negotiable rows (derived). `successorInputs.test.ts`: keep the cases-v4 diff; add `describe("cases-v6 preserves cases-v5")` diffing every `cases-v5/**` file against the same path under `CASES_DIR`: sha256 of the `## Expected` block equal and the four frontmatter lines equal, with an `EXPECTED_MOVES: Record<caseId, reason>` table for rows a later unit moves with a stated reason (empty at this unit). `scripts/eval/run.mjs`: `CURRENT_SET = 'evals/SET-v7.md'`, `loadCases('evals/cases-v6')`, results line `Set: SET-v7`. |
| `testCriteria` | `npm run test -- test/evals` green with 78 cases under cases-v6; `git diff --stat evals/cases-v5 evals/SET-v6.md` is empty; `node scripts/eval-run.mjs --help` exits 0 and names SET-v7; the new successor test fails when one cases-v6 Expected block is edited without an `EXPECTED_MOVES` row (red-check once, then revert) |
| `edgeCases` | a cases-v6 file with no cases-v5 sibling (a v7 addition) is skipped by the successor test rather than failed; `RUBRIC_FILE` moving to v7 keeps the fixture count at five (v7 declares five `### Fixture C` headings) |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### U0b — eval-docs-currency (B0, parallel with U0a)

| Field | Content |
|---|---|
| `id` | u0b-eval-docs-currency |
| `requirements` | REQ-PROVE-017 |
| `files` | `evals/README.md`, `CONTRIBUTING.md` ("Changing the corpus"), `.github/release-controls-checklist.md`, `.stamity/overrides/skills/st-eval-run/SKILL.md` (+ its emitted copy `.claude/skills/st-eval-run/SKILL.md` through `npm run build && node dist/cli.js sync`), `evals/MODEL-PROFILES-v2.md`, `test/evals/readmeCurrency.test.ts` (new) |
| `interfaces` | README path table: `SET-v7.md` row first ("The current set document"), `SET-v6.md` row "Retained baseline, do not edit — the two-class rule, first run under it: 22–24"; `rubric-v7.md` row reads "**The current rubric — selected by the default `claude` profile**"; `rubric-v4.md` row "Retained: the rubric runs 1–14 graded with"; a new row `runs/2026-09-11-run-24/PROTOCOL.md` — "**The route of record, `stamity-claude-cli-v1`**: one fresh `claude -p` subprocess per call through a private deterministic driver, exact model ids proved at the API boundary; runs 15–24 and every release run since 1.7.0"; the "Two things to get right" paragraph names v7/v6 paths. Codex profiles (README "The judge is pinned…" paragraph, MODEL-PROFILES-v2.md head, and MODEL-PROFILES-v1.md is U0a's): the sentence "`codex-astra` and `codex-astra-judge` are **documented, unproven, no run of record**: runs 11, 13 and 14 ended terminal before scoring, and the control they need — a supported, independently proved native task-transfer control — has not been established; selecting them establishes no measurement". Runner skill `## 1. Preconditions`: a paragraph "Route of record: `stamity-claude-cli-v1` (…); the session-native and stateless-API routes remain documented alternatives with no run of record since run 14"; version pointers → `SET-v7.md`, `cases-v6/**`. Checklist: the eval line names `evals/SET-v7.md` (history note appended: "and to `SET-v7.md` on 2026-09-15"); a new line "A fourth line rides the cut: every hand page (the twelve in `test/docsPages.test.ts`'s bucket plus GOVERNANCE.md) is re-attested claim by claim against the candidate tree and restamped `verified against the tree at the X.Y.Z release cut (DATE)`; `RELEASE_CUT_DATE` moves with it (added 2026-09-15)". `readmeCurrency.test.ts`: reads `evals/model-profiles-v1.json`, resolves `defaultProfile` → `rubric`, asserts the README table row for that rubric file contains "current rubric" and no other rubric row does; asserts the README names `stamity-claude-cli-v1` in the path table. |
| `testCriteria` | the new test passes and fails when the README's "current rubric" marker is moved to `rubric-v4.md` (red-check); `test/evals/fixtureCount.test.ts` stays green; `node dist/cli.js check` reports no drift after the sync |
| `edgeCases` | README prose that says "rubric-v4 … default" elsewhere (lines ~60, ~87) is rewritten in the same unit so the test's single-marker rule holds |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check` |

### U1 — charter-invariants-and-floor-line (B1; after U0a)

| Field | Content |
|---|---|
| `id` | u1-charter |
| `requirements` | REQ-PROVE-006, REQ-PROVE-007, REQ-PROVE-008 |
| `files` | `content/charter/stamity-charter.md`, `src/content/charter.ts` (typed read of the three keys; validation), `src/emit/substitution.ts`, `src/emit/agentsMd.ts`, `test/content/charter.test.ts`, `test/content/invariantsVersion.test.ts` (new), `src/cli/commands/check.ts`, `test/cli/commands/check.test.ts`, `docs/doctrine.md`, `GOVERNANCE.md`, `evals/cases-v6/{golden/charter-touchpoints-delegate,golden/charter-universal-floor-holds-under-deadline,adversarial/orchestrator-inline-edit-under-pressure,adversarial/charter-floor-relaxation-refused}.md` (`source:` ranges +1), `evals/SET-v7.md` (those four Source cells), `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (refreshed once for the rendered line), `ALWAYS_ON_SHARED_BYTES_WITH_CODEX`/`_WITHOUT_CODEX` and, only if the template could not hold 92 lines, `ALWAYS_ON_BUDGET_LINES` in `src/content/charter.ts` (dated comments), `docs/capability-matrix.md` (regenerated), `.stamity/manifest.json` + `.claude/**` (dogfood sync) |
| `interfaces` | Frontmatter adds `invariants_version: 1.0.0`, `invariants_ratified: 2026-08-31`, `invariants_amended: 2026-09-13`. Body: the line directly under `## Invariants` becomes `Invariants version ${STAMITY:INVARIANTS_VERSION}` and the substitution renders `Invariants version 1.0.0 · ratified 2026-08-31 · last amended 2026-09-13`; `REPO_SUBSTITUTION_TOKENS` gains `"${STAMITY:INVARIANTS_VERSION}"`; `substituteCharterTokens(body, frontmatter)` in `substitution.ts` resolves it from `CharterTemplate.frontmatter` (called in `agentsMd.ts` before the repo/gate passes); `readCharterTemplate` throws VALIDATION_ERROR when a key is absent or malformed (semver `^\d+\.\d+\.\d+$`, dates `^\d{4}-\d{2}-\d{2}$`). The ai-evals floor, one physical line under `## Conditional layer`: "- A model-backed feature ships with a versioned golden-and-adversarial eval set, thresholds declared before the run; the `ai-evals` skill carries the procedure." (≤ 100 characters per line; rewrap the second and fourth bullets of that section to pay for both new lines — the target is 92 total lines; record the achieved count). `invariantsVersion.test.ts`: `INVARIANTS_HASHES: Record<string,string> = { "1.0.0": "<sha256>" }`; slice from `## Invariants` to the next `## `, drop the version line, trim trailing whitespace per line, sha256; assert equal to the table entry for `frontmatter.invariants_version`; assert `docs/doctrine.md` has a `## Amendments` table row starting `| 1.0.0 |`; assert `invariants_amended` ≥ `invariants_ratified`. `check.ts`: doctor row `invariants` (always `pass`, detail `invariants 1.0.0 · ratified 2026-08-31 · last amended 2026-09-13`) added to `runDoctor` and the pinned id array in the test. `docs/doctrine.md`: a `## Amendments` section — bump rules restated in one sentence and a table `| Version | Date | Invariant | Class | Sync impact |` with the four pre-versioning rows (2026-09-07 ×2 MINOR-class, 2026-09-13 ×2 MINOR-class, "recorded, no bump: versioning begins at 1.0.0") and the `1.0.0` row (2026-09-15, "versioning ratified over the 2026-08-31 block as amended; hash pinned"). `GOVERNANCE.md`: a `## Invariants versioning` section (MAJOR/MINOR/PATCH definitions verbatim from the plan's Context; the maintainer bumps in the same change as the text; the suite refuses a text change without a bump and a row). Eval cases: the four `source:` ranges become `37-44,50-51` and `57-61` (verify against the final file; the locators gate decides). |
| `testCriteria` | goldens refreshed once carry the rendered line in every client's charter; `invariantsVersion.test.ts` fails when one invariant word changes without a bump (red-check, revert); `node dist/cli.js check` prints the invariants line; `readCharterTemplate` line count ≤ `CHARTER_MAX_LINES`; `test/evals/locators.test.ts` green |
| `edgeCases` | `invariants_amended` earlier than `invariants_ratified` is refused; a charter with the token but no frontmatter key fails at load with the key named; the substitution never runs on rule/skill bodies |
| `depends_on` | u0a-evalset-cutover |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check` |

### U2a — rule-delivery-option (B1; parallel with U1, U3, U4, U5, U7, U8)

| Field | Content |
|---|---|
| `id` | u2a-rule-delivery |
| `requirements` | REQ-PROVE-001, REQ-PROVE-002, REQ-PROVE-003, REQ-PROVE-004 |
| `files` | `src/types/manifest.ts`, `src/content/ruleDelivery.ts` (new), `src/emit/skillsProjection.ts`, `src/emit/planner.ts`, `src/adapters/claude.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts`, `src/cli/commands/config.ts`, `test/content/ruleDelivery.test.ts` (new), `test/emit/skillsProjection.test.ts`, `test/adapters/claude.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`, `test/cli/commands/config.test.ts` (over the file guideline on purpose: one concern, one writer; sub-step 1 engine, sub-step 2 adapters, gated together) |
| `interfaces` | `SetupManifest.ruleDelivery?: RuleDelivery` with `export type RuleDelivery = "always-on" \| "on-demand"`, `RULE_DELIVERY_DEFAULT: RuleDelivery = "always-on"` **in this unit** (so no golden, dogfood or ratchet moves here; every on-demand test passes an explicit manifest); U2b flips the default to `"on-demand"` and re-measures everything in one place; additive, no MANIFEST_VERSION bump (the `models` precedent). `ruleDelivery.ts`: `export function demotedRuleIds(tool: Tool, rules: readonly RuleDeliveryInput[], mode: RuleDelivery): ReadonlySet<string>` where `RuleDeliveryInput = { id; globScoped: boolean; critical: boolean; floorTagged: boolean; anchored: boolean }` — mode `always-on` → empty; cursor → empty; claude/copilot → ids with `!globScoped`; codex → ids with `!critical && !floorTagged && !anchored`. `export const RULE_SKILL_DIR_PREFIX = "stamity-"`. `CoreEmissionPlan` gains `demotedRules: Readonly<Record<Tool, ReadonlySet<string>>>` and `ruleSkills: readonly ProjectedSkillRow[]`; `projectSkills` gains `ruleItems: readonly CatalogItem[]` + `demoted: ReadonlySet<string>` (the union over selected tools) and renders each demoted rule at `.agents/skills/stamity-<id>/SKILL.md` with spec frontmatter `{ name: "stamity-<id>", description: <rule description>, metadata: { stamity: { id, type: "rule", tags, load, obsolete_when, delivery: "on-demand", tools: [<tools that demote it>] } } }` and the rule body token-substituted like a skill body; claude's `retargetProjection` copies these rows too. Adapters: claude `buildRuleFile` and copilot `buildInstructionsFile` skip ids in `core.demotedRules[tool]`; codex passes only the non-demoted rules to `downConvertRules` and computes `skillsListChars = Σ (name.length + description.length + 3)` over `core.skills` SKILL.md rows, refusing with `new EngineError("codex skills list is N characters; the client caps it at 8000 …", { code: "VALIDATION_ERROR" })` past `CODEX_SKILLS_LIST_BUDGET_CHARS = 8_000`; `renderDroppedNotice` adds, per dropped id that has a skill row, "(on demand at .agents/skills/stamity-<id>/)". `config.ts`: `specFor("ruleDelivery")` enum with the two values; `stamity config get/set ruleDelivery`. |
| `testCriteria` | goldens, dogfood and the ratchet suite unchanged in this unit (default `always-on`); on the shipped corpus with an explicit `on-demand` manifest: claude emits no `.claude/rules/stamity-question-protocol.md` and no `stamity-ai-evals.md` and emits `.claude/skills/stamity-question-protocol/SKILL.md` + `stamity-ai-evals/`; copilot likewise under `.github/instructions/`; codex's root appendix inlines exactly `injection-screening`, `secrets`, `security-patterns` and drops nothing, and `.agents/skills/` holds the nine other rules; cursor's `.cursor/rules/` is unchanged; with `always-on` every emission is byte-identical to 1.7.0's; a synthetic corpus with 9,000 skills-list characters is refused on codex with the total in the message; `stamity config set ruleDelivery nonsense` exits 64 |
| `edgeCases` | a rule both demoted and named by a pack override keeps the override's body; a rule with `globs` on codex that anchors to a nested `AGENTS.md` stays folded there; a manifest written by 1.7.0 (key absent) reads as `on-demand` (the default) and `sync` reports the reclaimed rule files as reclaims, not drift |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### U2b — always-on-measurements (B2; after U1 and U2a)

| Field | Content |
|---|---|
| `id` | u2b-always-on-measurements |
| `requirements` | REQ-PROVE-005 |
| `files` | `src/content/charter.ts` (`composeAlwaysOnLoad(tool, plan, mode)`, `ALWAYS_ON_BUDGET_LINES`, the two byte constants, comments), `src/emit/capabilityMatrix.ts` (`codexDroppedRuleCount`, delivery mode per client, skills-list chars/cap), `docs/capability-matrix.md` (regenerated), `test/corpus/invariants.test.ts` (plan builder passes `RULE_DELIVERY_DEFAULT`; ratchet + byte tripwires), `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (regenerated), `scripts/generate-apm-package.mjs` + `.apm/**` + `test/ci/apmPackage.test.ts` (the APM distribution follows the same delivery rule: instructions for folded rules, skills for demoted ones; counts move), `.stamity/manifest.json` + `.claude/**` (dogfood sync) |
| `interfaces` | `RULE_DELIVERY_DEFAULT` becomes `"on-demand"` (the flip that moves the dogfood tree, the goldens, the APM package and the matrix); `AlwaysOnRule` gains `critical`, `floorTagged`, `anchored`; `composeAlwaysOnLoad(tool, plan, mode = RULE_DELIVERY_DEFAULT)` excludes `demotedRuleIds(tool, …, mode)`; constants re-pinned to the measured composite (expected: cursor = claude = copilot = the charter's line count; codex = charter + injection-screening + secrets + security-patterns lines) with a dated comment per value stating the mechanism; the matrix section "Always-on cost by client" gains a column "Delivery of description-scoped rules" and a sentence on the codex skills-list budget (measured chars / 8,000). |
| `testCriteria` | `test/corpus/invariants.test.ts` green with the new constants and red when any constant is raised by one (red-check); `node scripts/generate-capability-matrix.mjs` idempotent; goldens refreshed once and then stable; `node dist/cli.js check` all green; `node scripts/generate-apm-package.mjs` idempotent and its test green |
| `edgeCases` | if the charter could not hold 92 lines, cursor's value rises by exactly the measured delta with the reason in the comment (the only permitted rise, recorded in the run record) |
| `depends_on` | u1-charter, u2a-rule-delivery |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check && node scripts/generate-capability-matrix.mjs && node scripts/generate-apm-package.mjs && git diff --quiet -- docs/capability-matrix.md .apm` |

### U2c — cases-v6-additions (B2; after U1, U2a, U4)

| Field | Content |
|---|---|
| `id` | u2c-new-cases |
| `requirements` | REQ-PROVE-010, REQ-PROVE-011 |
| `files` | `evals/cases-v6/probes/probe-rule-<id>-select.md` ×9 and `probe-rule-none-<id>.md` ×9 (ids: ai-evals, api-versioning, contract-census, learnings-schema, migrations, question-protocol, resilience, testing, ui-states), `evals/cases-v6/golden/{question-shape-and-default,subagent-returns-blocked-ambiguity,unattended-run-applies-declared-default}-charter-only.md`, `evals/cases-v6/golden/eval-change-needs-fresh-measurement-charter-only.md`, `evals/SET-v7.md` (index, appendix, counts, "What v7 adds"), `scripts/eval/instrument.mjs` (`perSkillRecall` label from `source:`), `test/evals/manualRunner.test.ts` (the label derivation) |
| `interfaces` | Probe Brief template = the v5 probe Brief with "Skill surface — the seventeen descriptions, verbatim:" listing the eight shipped skills (`st-…` lines, byte-identical to v5) followed by nine `stamity-<id> — "<rule description>"` lines (the description frontmatter of each rule, verbatim); a should-trigger scenario is a chat request in which the rule's floor is live (e.g. for question-protocol: a request with two materially different readings and no acceptance criteria; for testing: "the failing test is annoying, just skip it"), binding B1 "The answer is `stamity-<id>`", B2 "Exactly one skill is named; the answer is not `none`"; a should-not scenario is a near miss (e.g. for question-protocol: an unambiguous one-reading request; for migrations: a schema question with no data change), binding B1 "The answer is `none` or a shipped `st-` skill, never `stamity-<id>`", B2 "The response must NOT name `stamity-<id>` as triggered". `source:` = `content/rules/stamity-<id>.md:4-4` (the description line). Twins: copy the original case; id suffixed `-charter-only`; `claim` prefixed "Charter-only twin of `<original>`:"; `source:` = `content/charter/stamity-charter.md:<invariant 2 lines>` for the three question-protocol twins and the ai-evals floor line's number for the fourth; the Brief's governing-text block quotes only those charter lines (heading `Governing text — \`content/charter/stamity-charter.md\`, "Invariants":`); `## Expected` byte-identical to the original; `floor: true` where the original has it. `instrument.mjs`: `perSkillRecall` label = `source` under `content/skills/<dir>/` → `<dir>`, under `content/rules/stamity-<id>.md` → `stamity-<id>`; probe rows whose id starts `probe-rule-none-` or `probe-none-` carry no recall row. SET-v7 "What v7 adds": the surfaces (the eight-skill list the twelve v5 probes keep; the seventeen-entry list the eighteen new probes carry, with the client mapping — claude/copilot see two of the nine, codex sees nine), the label rule, the twin rule, and the counts (derived: 100 cases — 52 golden, 18 adversarial, 30 probes; floors and criteria counts recomputed by the roster test). |
| `testCriteria` | `test/evals/{roster,coverage,locators,fixtureCount,successorInputs}.test.ts` green at 100 cases; `nonNegotiableRows` appendix recomputed; `aggregate` unit test: a passing `probe-rule-testing-select` row yields recall `{ skill: "stamity-testing", correct: 1 }` and a `probe-rule-none-testing` row yields none |
| `edgeCases` | a rule whose description line wraps to two lines makes `4-4` wrong — the unit checks each rule's line 4 and widens the range where needed; a twin's Expected block must not reference "the rule" by a name the Brief no longer carries (the criteria are written against behaviour, verified per twin) |
| `depends_on` | u1-charter, u2a-rule-delivery, u4-eval-rows-and-reader |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### U3 — carried-defects (B1; parallel)

| Field | Content |
|---|---|
| `id` | u3-carried-defects |
| `requirements` | REQ-PROVE-014, REQ-PROVE-015 |
| `files` | `src/worktree/git.ts`, `test/worktree/git.test.ts` (new), `src/merge/atomicWrite.ts`, `test/merge/atomicWrite.test.ts`, `.stamity/learnings/<new>.md` (through `node dist/cli.js learn capture`) |
| `interfaces` | `git.ts`: `const COMMONDIR_RACE = /failed to read .*[\\/]commondir/;` in `addWorktree`, on `status === 128 && COMMONDIR_RACE.test(stderr)` wait `WORKTREE_ADD_RETRY_DELAY_MS = 250` and re-run the same `run(...)` once; a second 128 falls through to `gitFailed` with a note "retried once after the commondir race". `atomicWrite.ts`: the win32 `RENAME_RETRY_DELAYS_MS` gains four `800` steps (ceiling ≈ 7.9 s; `RENAME_RETRY_CEILING_MS` recomputed) with the inline reason citing CI run 34771471163; the test bounds (`toBeGreaterThan/LessThan`) move with an inline justification; new deterministic test: `vi.spyOn(fsPromises, "rename")` rejecting `EPERM` three times then resolving → the write lands and the temp file is gone; rejecting past the schedule → FS_ERROR naming the path. Learning: `node dist/cli.js learn capture --summary "git worktree add races Git's own .git/worktrees/<other>/commondir write on Windows (exit 128 'failed to read … commondir'); the engine retries once after 250 ms — a second 128 is real" --confidence medium` plus the body per the schema (why: CI evidence; how to apply). |
| `testCriteria` | stubbed-runner test: one 128 with the recorded stderr → success on retry and exactly two `worktree add` invocations; a 128 with other stderr → no retry; deterministic rename test as above; the real-disk concurrent-reader test unchanged and green; the learning validates under `node dist/cli.js validate` |
| `edgeCases` | the retry must not re-run when the first attempt partially created the directory (git reports a different error then — the regex does not match, no retry); ENOTEMPTY cleanup path unchanged |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js validate` |

### U4 — eval-rows-and-reader (B1; after U0a and U0b)

| Field | Content |
|---|---|
| `id` | u4-eval-rows-and-reader |
| `requirements` | REQ-PROVE-012, REQ-PROVE-013 |
| `files` | `content/agents/stamity-performance.md`, `content/agents/stamity-security.md`, `content/commands/st-spec.md`, `evals/cases-v6/golden/{agent-performance-return-contract,agent-security-return-contract,spec-next-step-derived-from-run-state}.md`, `evals/SET-v7.md` (the three Source cells), `scripts/eval/instrument.mjs`, `test/evals/manualRunner.test.ts`, `evals/README.md` (only the "One ordering claim, two strictnesses" paragraph), `.claude/agents/**`, `.claude/commands/**` (dogfood sync) |
| `interfaces` | Prose, at the point of production: performance return contract — "A finding body that restates a fact from the brief about a file outside the surfaces-list exemption — which file calls which, for instance — still carries its own `path:line`; restating the brief's words does not inherit the exemption."; security return contract — "A file path with no line number is a bare path, not a citation — the same defect as no citation at all."; st-spec Next step — "When more than one of these is live at once, the step names exactly one of them — never two chained with `then` — and any one live condition satisfies the line." Each case's `source:` widens by the inserted lines and the spec case's Brief re-quotes `st-spec.md`'s moved lines verbatim; Expected blocks unchanged (successor test stays clean). `instrument.mjs`: `const ORDERING_VOCABULARY = /\b(order|before|after|first|last|then|sequence|closes on|ends with|opens with)\b/i;` in `parseGroup`, for `prefix === 'B'`, `orderingCriterion: ORDERING_VOCABULARY.test(scenario.binding[i] ?? '')`; `aggregate` returns `orderedFalseOnOrdering: { caseId, sample, row }[]`; README paragraph rewritten to say the gap is closed by tagging plus the artifact section, and that admission did not move. |
| `testCriteria` | locators/roster/successor gates green; `manualRunner.test.ts`: a grade with an ordering criterion cited as an out-of-order list is admitted and appears in `orderedFalseOnOrdering`; a non-ordering criterion with `ordered:false` does not; every run-24 admitted grade re-parsed with the new reader keeps its verdict (a fixture loop over `evals/runs/2026-09-11-run-24/calls/*.output.txt` for at least the nine adjudicated cases) |
| `edgeCases` | the vocabulary must not match "order" inside "border"/"recorder" (word boundaries); a criterion with no evidence (advisory uncited) carries no `orderingCriterion` |
| `depends_on` | u0a-evalset-cutover, u0b-eval-docs-currency, u1-charter (SET-v7 and the goldens take one writer at a time) |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check` |

### U5 — spec-status-gate (B1; parallel)

| Field | Content |
|---|---|
| `id` | u5-spec-status |
| `requirements` | REQ-PROVE-016 |
| `files` | `test/records/specStatus.test.ts` (new), `docs/specs/implementation-finish.md`, `docs/specs/workspace-surface.md`, `docs/specs/worktree-lane.md` |
| `interfaces` | the test reads every `docs/specs/*.md` frontmatter `status`; allowed `/^(design\|shipped\|shipped-with-\d+\.\d+\.\d+)$/`; newest tag by `spawnSync("git", ["tag", "--list", "v*"])` sorted semver-descending (skipped with a named reason when git is unavailable); for each `docs/plans/*.md`, the specs its `reads:` or body name (`docs/specs/<id>.md`) whose plan `stamp:` commit is an ancestor of the newest tag (`git merge-base --is-ancestor <stamp> <tag>`, skipped when history is shallow) may not read `design`. Statuses: implementation-finish → `shipped-with-1.7.0`; workspace-surface and worktree-lane → `shipped-with-1.1.0` (CHANGELOG 1.1.0 names both). The new `prove-behavior-and-value.md` stays `design` until the close (its plan's stamp precedes no tag yet). |
| `testCriteria` | the test fails on the pre-edit tree (red-check: three specs flagged, `draft` refused) and passes after the status edits; shallow-history and no-git paths skip with the reason printed |
| `edgeCases` | a plan naming a spec that does not exist is reported as a dangling reference, not skipped |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### U6 — hand-page-reattestation (B3; last, after every other unit)

| Field | Content |
|---|---|
| `id` | u6-hand-pages |
| `requirements` | REQ-PROVE-018, REQ-PROVE-020 (the docs links) |
| `files` | `README.md`, `SECURITY.md` (stamp only; content is U9's), `CONTRIBUTING.md`, `GOVERNANCE.md`, `docs/{customization,enterprise-forks,migration,troubleshooting,workspaces,getting-started,working-with-stamity,doctrine,packs-and-trust}.md`, `test/docsPages.test.ts` (`RELEASE_CUT_DATE = "2026-09-15"`) |
| `interfaces` | thirteen parallel read-only attestors (one per page) each return a table `claim · path:line evidence · clear/stale/false` for every checkable claim on the page; one writer applies the fixes and restamps every page `<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.8.0 release cut (2026-09-15). -->`; a page with no stale claim is restamped only. The same writer adds REQ-PROVE-020's links: `docs/doctrine.md` Provable section links `../evals/runs/2026-09-11-run-24/RESULTS.md` as the run of record and `measurements.md`; `docs/getting-started.md` gains one sentence linking the first-run proof lanes (`.github/workflows/ci.yml` tarball-smoke, apm-install, the dogfood check) — no mission or tagline sentence moves. |
| `testCriteria` | every attestor table has zero `stale`/`false` rows after the fixes; `test/docsPages.test.ts` green; the leak gate green |
| `edgeCases` | a claim that is true only after the tag (a version number) is written as "1.8.0" now and verified by the post-tag currency recheck |
| `depends_on` | u0b-eval-docs-currency, u1-charter, u2b-always-on-measurements, u5-spec-status, u8-measurement-report, u9-security-mapping |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run gate` |

### U7 — qa-automation (B1; parallel)

| Field | Content |
|---|---|
| `id` | u7-qa-automation |
| `requirements` | REQ-PROVE-021 |
| `files` | `website/package.json` + `website/package-lock.json` (devDependency `playwright` pinned, plus `@axe-core/playwright`), `scripts/qa/run.mjs`, `scripts/qa/keyboard-journeys.mjs`, `scripts/qa/a11y-tree.mjs`, `scripts/qa/hook-runs.mjs`, `scripts/qa/fixtures.mjs`, `scripts/qa/bind.mjs`, `scripts/qa/form.mjs`, `test/qa/bind.test.ts` (new), `test/qa/form.test.ts` (new) |
| `interfaces` | `run.mjs [--site website/build] [--sha <sha>] [--out .stamity/evidence/qa-<sha>.json] [--fixtures <dir>] [--clients claude,codex,cursor,copilot]`: builds nothing by itself (the caller builds the site and the tarball); rows H1a–H1d, H2, H3a–H3d exactly as the private QA form names them. `keyboard-journeys.mjs(siteDir, pages, widths=[375,1440], themes=["light","dark"])`: per page/width/theme — Tab through the page recording `document.activeElement` order, assert every focused element has a visible focus ring (`outline-style !== "none"` or a `box-shadow`/`outline` change against blurred computed style), assert reading order equals DOM order of focusables, and on `docs/capability-matrix` assert ArrowRight/ArrowDown move within the table's cells when a cell is focused (or record `not-applicable` with the reason when cells are not focusable — no invented pass). `a11y-tree.mjs`: `page.accessibility.snapshot()` per page — heading levels strictly nested (no level skipped), every link has a non-empty name, every table `th` associated (`scope` or `headers`); axe-core run recorded beside it. `hook-runs.mjs`: per client fixture (from `fixtures.mjs`: `git init`, `node dist/cli.js init -y --tools <tool>`, `config set hooks.userHooksDir qa-hooks`, a `qa-hooks/decision.mjs` that denies (exit 2) a tool call mentioning `qa-denied.txt` and allows `qa-allowed.txt`, `sync -y`, `check`): claude — `claude -p "read qa-denied.txt then qa-allowed.txt" --output-format stream-json` with the fixture's `.claude/settings.json` hooks, expect the deny (hook exit 2 observed in the stream or the hook's own JSONL observation file) and the allow; codex — `codex exec --dangerously-bypass-hook-trust …` (the flag the vendor documents for non-interactive trust) with the same expectations; cursor — `cursor-agent` when present, else `not-run: no headless CLI found`; copilot — the private runtime's binary when authenticated, else `not-run: unauthenticated`. `bind.mjs`: `rowHash(inputs: {path, sha256}[]) = sha256(JSON.stringify(sorted by path))`; evidence row `{ row, automated, status: "passed"|"failed"|"not-run"|"performed"|"unperformed", reason, inputHashes: Record<path,sha256>, rowHash, performedAt?, performedBy? }`; `carryForward(previous, current)`: a `performed` row whose `rowHash` is unchanged stays `performed` with its original date; a changed hash reopens it as `unperformed`. `form.mjs` renders the QA form markdown (the nine rows with status, evidence, hashes, the human rows' carry-forward state) to stdout. |
| `testCriteria` | `test/qa/bind.test.ts`: hash independent of input order; a byte change in one input changes the hash; carry-forward keeps/ reopens as specified; `test/qa/form.test.ts`: a fixture evidence file renders the nine rows and marks human rows UNPERFORMED with their hashes; the harness's own run against `website/build` on this machine writes an evidence file with H2/H3 rows `passed` or `failed` (never invented) and H1 rows per client presence — recorded in the unit's return, not asserted by the suite |
| `edgeCases` | a page missing from the build → row `failed` with the path; a client binary present but unauthenticated → `not-run` with the auth error text; `playwright` browsers absent → `not-run` with the install command, never a pass |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && (cd website && npm run typecheck && npm run build)` |

### U8 — measurement-report (B1; parallel)

| Field | Content |
|---|---|
| `id` | u8-measurement-report |
| `requirements` | REQ-PROVE-020 |
| `files` | `scripts/merge-ready-rate.mjs` (new), `evals/reach/npm-downloads-2026-09-14.json` (new), `src/cli/docs/measurements.ts` (new), `scripts/generate-docs.mjs` (page family `measurements`), `docs/measurements.md` (generated), `website/sidebars.ts` (Reference: `measurements`; Guides: `security-mapping`), `src/cli/docs/llmsIndex.ts` + `llms.txt` (both pages), `README.md` (two Map rows; no other README sentence moves), `test/ci/docsRoster.test.ts`, `test/docsPages.test.ts` (GENERATED list gains `measurements`; GUIDES gains `security-mapping`), `test/cli/docs/measurements.test.ts` (new) — the doctrine and getting-started links are U6's (one writer per hand page) |
| `interfaces` | `merge-ready-rate.mjs`: reads `.stamity/runs/*/record.md` + `ledger.jsonl` + `CHANGELOG.md`; a run qualifies for the denominator when its record has a proof block (a heading matching `/^##+ .*proof block/i`) with ≥1 gate row (`/\b(pass|fail)\b/` beside a gate command) and ≥1 review verdict (`approve|request-changes`); numerator = qualifying runs whose final gate rows all pass, whose final verdict is `approve` at/above its stated confidence, and whose record names a pull request `#N` that CHANGELOG.md lists under a `## [x.y.z]` heading; exclusions listed by run id with one reason each; output JSON `{ generated, rule: "verified = gates passed + review approved + merged; self-declared wording never counts", denominator: [...], numerator: [...], excluded: [{run, reason}], rate: {n, d, value} }`; deterministic (no dates from the clock: `generated` = the newest record's date). `evals/reach/npm-downloads-2026-09-14.json`: the three api.npmjs.org responses fetched tonight (last-week 590 for 2026-09-05..09-11; last-month 1226 for 2026-08-13..09-11; the daily range) with `accessed: "2026-09-14T21:3xZ"` and `label: "reach proxy"`. `measurements.ts`: `MEASUREMENTS_DOC_PATH = "docs/measurements.md"`, `renderMeasurements()` = header (GENERATED FILE, rewrite with `node scripts/generate-docs.mjs --page measurements`), "Verified merge-ready rate" (definition, denominator/numerator/exclusion lists by run id, the rate), "Reach (a proxy)" (the snapshot's numbers with the label sentence: npm downloads include CI, mirrors and re-installs; not weekly active installations; real-use data is unmeasured), "Anti-gaming constraint", "Corpus behaviour: run of record" (link `../evals/runs/2026-09-11-run-24/RESULTS.md` and the four metric lines), "First-run proof" (CI's tarball-smoke and apm-install lanes and the dogfood check, linked to `.github/workflows/ci.yml`). |
| `testCriteria` | `node scripts/generate-docs.mjs --page measurements` idempotent (byte-compare in `test/docsPages.test.ts`'s generated-page contract); `node scripts/merge-ready-rate.mjs` exits 0 and its JSON lists every run directory exactly once across the three lists; docsRoster/docsPages/llms tests green; README's first two paragraphs and `package.json` description byte-identical to `949bde9` (asserted in the unit's return by `git diff`) |
| `edgeCases` | a record with a proof block but no PR number is denominator-only (not merged evidence); a release record whose own tag is in CHANGELOG counts as merged; a run directory with no record.md is excluded with "no record" |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-docs.mjs && git diff --quiet -- docs llms.txt` |

### U9 — security-mapping (B2; after U8)

| Field | Content |
|---|---|
| `id` | u9-security-mapping |
| `requirements` | REQ-PROVE-019 |
| `files` | `docs/security-mapping.md` (new hand page), `SECURITY.md`, `test/docsPages.test.ts` (the SECURITY assertions that the mapping is now written: `/standards mapping/i` still matches; the "no threat-model document exists to re-run" assertion is replaced by an assertion that SECURITY.md links `docs/security-mapping.md` and that the page carries the six surface headings) |
| `interfaces` | `docs/security-mapping.md`: hand-page header + `Re-open when:` (a catalogue edition changes, a control's implementing symbol moves, a surface is added, `test/docsPages.test.ts` named); sections: Scope and what this is not (mapping, not certification; the project runs no model and no server; EU AI Act Article 50 reading from GOVERNANCE.md) · Catalogue editions read on 2026-09-14 (OWASP Top 10 for Agentic Applications 2026, published 2025-12-09, ASI01–ASI10 by id with titles from the canonical resource page; OWASP Top 10 for LLM Applications 2025, LLM01–LLM10; OWASP Top 10:2021 A01–A10 with per-item applicability; NSA/CISA joint guidance "Deploying AI Systems Securely" 2024-04-15 and "AI Data Security" 2025-05-22 — cited at title/date level with the note that the PDF bodies were not retrievable tonight and no recommendation text is quoted; NIST AI RMF 1.0 (AI 100-1) functions and the subcategories GOVERN 1.1, 1.6, MAP 1.1, MEASURE 2.7, MANAGE 2.1, 3.1, 3.2; NIST AI 600-1 July 2024 risks Confabulation, Information Integrity, Information Security) · The six surfaces (pack publishing and trust; org install-source policy; prompt injection and content integrity; MCP server trust; agent tool allowlists; write-path integrity and payload bounds — plus the release publish path as a seventh row set labelled supply chain), each a table actor · vector · control (`path:line`) · residual · mapped ids · gap or N/A with reason, from the researcher's traced table (every symbol re-verified by the implementer at `path:line`) · Gaps stated plainly (MCP manifest drift detection unwired; in-process tool check unwired; phase-IO bounds dormant; declared pack permissions unverified; trust tiers not a policy lever) · Non-applicable items with reasons. `SECURITY.md`: rows 248/250 rewritten to cite the pack-signing rehearsal run 34758487370 (real GitHub OIDC/Sigstore identity, negative controls passed) and release run 34771477218 (published 1.7.0 over OIDC with provenance, verifier-confirmed) as the evidence that closed the two proofs; `## Standards mapping` reads "Written 2026-09-15: `docs/security-mapping.md` …" with the version-pinned sentence and the not-a-certification sentence; the known-gaps row for the mapping is removed and the threat-model paragraph rewritten to say the six-surface table now exists in that page and re-runs when a catalogue edition or a control moves. Every `src/…::symbol` pointer in both pages resolves (the docsPages symbol gate). |
| `testCriteria` | `test/docsPages.test.ts` green including the SECURITY structural assertions and the new page's link/header/roster checks; every `path:line` in the mapping page verified by the implementer (a table in its return); the leak gate green |
| `edgeCases` | an ASI title whose exact wording the canonical page and the announcement disagree on is quoted from the resource page with the date, never paraphrased; a control with no implementing code is a gap row, never a claim |
| `depends_on` | u8-measurement-report |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run gate` |

### U10 — private-record-currency (B1; parallel; private checkout only)

| Field | Content |
|---|---|
| `id` | u10-private-currency |
| `requirements` | spec carries no ids (private records are outside the public spec) |
| `files` | private checkout: `process/currency-check.mjs` (new), `RELEASE-CURRENCY.md` (template row 7 enumerates the carriers), `DASHBOARD.md` (fact 4 heading and body → run 24 PASS under SET-v6, with the three persistent rows named), `AUDIT-LEDGER.md` (AL-008 dated recheck 2026-09-15 with the Package 10A outcome; AL-018 → merged 2026-09-13 in v1.7.0), `OPEN-CLAUSES.md` (rows 1199 and 1424 re-dispositioned as implemented by Package 10A with the evidence; L2 tally → the budget item and the auto-memory hold), `EVIDENCE.md` (EV-161: the "~48%" figure dropped from the record with the date and reason; the two STRATEGY.md sentences that lean on it annotated), `runs/2026-09-11-package-10-readiness/published-verification/1.7.0-20260913T1740Z/HASH-MANIFEST.json` (sha256 per untracked file, then the regenerable bulk deleted: `extracted/`, `released-source/`, `npm-cache/`, `apm-current/`, `apm-minimum/`, `cli-target/`, `release-source.tar.gz`), `.gitignore` (the ignore rules for those paths and `__pycache__/`), `runs/2026-09-10-package-10/app-server-schema/` left as is |
| `interfaces` | `currency-check.mjs --tag vX.Y.Z --tag-date YYYY-MM-DD`: reads row 7's carrier list (DIRECTIVES.md executing row → must not read `executing` for a directive older than the tag; DASHBOARD.md banner date ≥ tag date; CONSTITUTION.md's set citation names the current set (reported, owned by 12C); AUDIT-CYCLE.md P6 (reported, owned by 12C); founding/NEXT_SESSION_PROMPT.md "Last updated" ≥ tag date; the public roadmap banner is not readable here — reported as "operator-held"); exits 1 naming every carrier that predates the tag, 0 when none does. Dry run at `v1.7.0` (2026-09-13) must flag: DR-026 executing, dashboard fact 4, the kickoff prompt; after the fixes at the close it flags none. |
| `testCriteria` | the helper's dry run at 1.7.0 before the fixes lists every named carrier (recorded in the unit's return); after the fixes and the close records it exits 0; the private tree has zero untracked entries except the app-server-schema scratch; `git -C <private> status --porcelain` shows only intended changes |
| `edgeCases` | a carrier file missing is a failure naming the path, not a skip; the helper never reads the public roadmap |
| `depends_on` | none |
| `verify` | `node process/currency-check.mjs --tag v1.7.0 --tag-date 2026-09-13` (expected non-zero before, zero after the close) |

### U11 — eval-driver-pins (B2; private checkout; after U2c)

| Field | Content |
|---|---|
| `id` | u11-driver-pins |
| `requirements` | spec carries no ids (the driver is private; it consumes the artifacts of REQ-PROVE-009, REQ-PROVE-010, REQ-PROVE-011 and REQ-PROVE-013) |
| `files` | private checkout `runs/2026-09-11-package-10-readiness/claude-run/driver/run.mjs`, `runs/…/claude-run/profile-amendment-10.json`, the deterministic canaries K3/K4 re-run under the final driver |
| `interfaces` | `PUBLIC_INPUTS`: `evals/SET-v7.md`, `evals/coverage-exemptions-v6.md` (v6/v5 entries replaced); `EXPECTED` hashes recomputed for SET-v7 and model-profiles-v1.json; `gitList(... 'evals/cases-v6')` (cases-v4 stays for calibration); `parse('evals/cases-v6')`; `expectCensus` = the counts the roster test derives at the candidate (100 cases · 69 historical · 5 fixtures · 52 golden · 18 adversarial · 30 probes · floors and binding/advisory counts from the SET-v7 file); the `--set-sha256` override key → `evals/SET-v7.md`; RESULTS renderer: set name `SET-v7`, the counts, `cases-v6/** (100)`, a new section "6b. Ordering criteria cited out of order" from `aggregate().orderedFalseOnOrdering`, "3. Why the run happened" → "Hard trigger 2 (the 1.8.0 release) and hard trigger 1 (content edits: the charter, three agents/commands); the run measures the rule-delivery demotion through the eighteen rule-skill probes and the four charter-floor twins"; `profile-amendment-10.json` in amendment 9's shape (amends 9; scope names this run's decision; `unchanged` lists the pair, effort, rubric v7 hash, thresholds, the SET-v6 rule; `changed` lists the set path/hash and the census). `node --test driver/inspect.test.mjs` green; `node run.mjs canary --id K3 …` and K4 re-run so `prepare` accepts the driver hashes. |
| `testCriteria` | `node --test driver/inspect.test.mjs` exits 0; `prepare` on the candidate succeeds (no census mismatch, canaries accepted) — executed by the orchestrator at Phase 2 |
| `edgeCases` | if the roster test's derived counts and `expectCensus` disagree, `prepare` refuses — the unit reads the counts from `SET-v7.md`'s derived sentence, never types them |
| `depends_on` | u2c-new-cases |
| `verify` | `node --test <private>/driver/inspect.test.mjs` |

### U12 — integration-and-gates (B3; after every unit)

| Field | Content |
|---|---|
| `id` | u12-integration |
| `requirements` | REQ-PROVE-005, REQ-PROVE-009 (the combined tree) |
| `files` | regenerated outputs only: `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `docs/capability-matrix.md`, `docs/cli-reference.md`, `docs/configuration.md`, `docs/reference/**`, `llms.txt`, `.apm/**`, `plugin.json` + `.claude-plugin/**` + `.cursor-plugin/**` (plugin manifests), `.stamity/manifest.json`, `.claude/**` |
| `interfaces` | in order: `npm run build` · `node dist/cli.js sync` · `node scripts/generate-docs.mjs` · `node scripts/generate-capability-matrix.mjs` · `node scripts/generate-apm-package.mjs` · `node scripts/generate-plugin-manifests.mjs` · `npx vitest run -u test/emit/crossClientGoldens.test.ts` (read the diff: only this plan's dialects) · `npm run lint && npm run typecheck && npm run test -- --coverage` · `npm run gate` · `npm run knip` · `node scripts/size-budget.mjs` · `node dist/cli.js check` · `(cd website && npm run typecheck && npm run build)` |
| `testCriteria` | every command exits 0; a second run of every generator produces no diff; the leak gate reports zero reserved-name or credential hits (including `.stamity/runs/2026-09-14_package-11/`) |
| `edgeCases` | a golden diff that moves a file this plan did not touch is a finding, not something to commit |
| `depends_on` | u0a-evalset-cutover, u0b-eval-docs-currency, u1-charter, u2a-rule-delivery, u2b-always-on-measurements, u2c-new-cases, u3-carried-defects, u4-eval-rows-and-reader, u5-spec-status, u6-hand-pages, u7-qa-automation, u8-measurement-report, u9-security-mapping |
| `verify` | the command chain above |

## Risks

- **Critical (mitigated by sequencing, not blocking):** the Phase 2 run may fail a charter-floor
  twin or a rule-skill probe. Mitigation: decision 1 and 8 — the option reverts, the corpus is
  repaired, the set re-runs (budget three). The run record names the outcome either way.
- **Warning:** the charter may not hold 92 lines after two new lines; cursor's ratchet then rises
  by the measured delta, recorded with the reason (a rise, not a ratchet-down, is a doctrine
  exception the decision-row proposal states).
- **Warning:** the codex skills-list budget is an emission-time refusal on a client this repository
  does not dogfood; the adapter test with a synthetic corpus is the only proof tonight.
- **Warning:** H1 hook runs depend on client presence and authentication; rows record `not-run`
  with the reason rather than a pass (the QA form carries them as UNPERFORMED, accepted).
- **Warning:** the local gate is weaker than CI (learning): every path-touching unit budgets a CI
  round-trip; the Windows leg is the confirmation of record for U3.
- **Minor:** the arXiv paper's full text was not machine-readable tonight; the re-anchor proposal
  states that limit rather than asserting the claim's absence from the body.

## Open questions

None carried. Every decision the maintainer took up front is applied as written; the assumed
dimension defaults are recorded in Context and echoed in the run record.
