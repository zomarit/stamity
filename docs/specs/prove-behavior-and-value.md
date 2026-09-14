---
id: prove-behavior-and-value
# A design document, authored outside the spec command and excluded from the site build.
status: design
obsolete_when: the measurement page, the security mapping and the QA evidence file are all generated from live data by the engine itself, or a decision row cuts the surface
---
# Prove behavior and value

Package 11's tracks D (delivery and governance), A (the eval set) and C (the public evidence
surfaces), as shipped in 1.8.0. Every claim about existing behaviour carries a `path:line` citation
from the tree at `949bde9` — `main` after 1.7.0, the baseline this package's run verified at intake.

## Intent

Stop shipping claims this repository cannot show. Three were open at 1.7.0: an always-on context
budget whose ceilings are pinned to a load nobody re-measured, charter invariants that bind every
turn and carry no version anyone can cite, and two promised public surfaces — a measurement report
and a security mapping — the tree names but does not contain. This spec records what closed each.

## Context

The always-on ceilings are today-measurements, not targets, and count every rule a client cannot
attach conditionally (`src/content/charter.ts:110-146`, `:210-217`): codex measures 1,063 lines
against a 150-line cap (`:53`), folding the rule set into one appendix (`src/adapters/codex.ts:117-118`).
The seven invariants (`content/charter/stamity-charter.md:34-60`) carry no version or amendment
record; human QA rows were accepted UNPERFORMED twice running; hand pages attest to pre-1.7.0 commits
(`README.md:1`); the checklist names `SET-v5` (`.github/release-controls-checklist.md:170-171`) and the
default profile `rubric-v4.md` (`evals/model-profiles-v1.json:3-8`); `SECURITY.md:207-220` says no such
mapping exists, and no `docs/measurements.md` exists at `949bde9`.

## Requirements

### REQ-PROVE-001 — Rule delivery option

`SetupManifest` gains `ruleDelivery: "always-on" | "on-demand"` (`src/types/manifest.ts:191-238`),
default `on-demand`; `always-on` reproduces today's emission. It reads and writes through `stamity
config` (`src/cli/docs/configReference.ts:104`).

- GIVEN no `ruleDelivery` WHEN sync runs THEN emission is on-demand and config reports it; GIVEN
  `"sometimes"` THEN the read fails `VALIDATION_ERROR` naming both values and writes nothing.

### REQ-PROVE-002 — Description-scoped rules delivered as skills

Under `on-demand` a glob-less rule — today `question-protocol` and `ai-evals`
(`content/rules/stamity-question-protocol.md:1-9`, `content/rules/stamity-ai-evals.md:1-9`) — emits
on claude, copilot and codex as `.agents/skills/stamity-<rule-id>/SKILL.md`
(`src/emit/skillsProjection.ts:96`): `name: stamity-<rule-id>`, `description` the rule's own,
`metadata.stamity` carrying id, `type: rule`, tags, `obsolete_when` and delivery (`:366-408`), plus
claude's native copy (`:115`) — never as that client's rule file. Cursor keeps `.mdc`
(`src/adapters/cursor.ts:356`); the `st-` surface gains nothing (`…charter.md:62-77`).

- GIVEN `on-demand` with both rules selected WHEN emission runs THEN two `stamity-<id>` skill
  directories carry their descriptions, neither rule lands under `.claude/rules/`, `.mdc` survives.

### REQ-PROVE-003 — Codex folds only floors

Under `on-demand`, codex's appendix (`src/adapters/codex.ts:117-118`) carries only rules that are
`precedence: critical` (today `content/rules/stamity-secrets.md:10`), `floor:*`-tagged, or anchored
to a nested `AGENTS.md`; every other rule projects as a skill instead.

- GIVEN `on-demand` with codex selected WHEN emission runs THEN the appendix holds only floor-class
  rules and its omission notice (`:332-336`) names zero rules, or names each beside a skill path.

### REQ-PROVE-004 — Codex skills-list budget

Emission sums `name` plus `description` characters over every projected skill when codex is selected
and refuses past 8,000 with a `VALIDATION_ERROR` naming the total and the cap — the fail-closed shape
the appendix budget already uses (`src/adapters/codex.ts:87`, `:156`).

- GIVEN skills summing to 8,001 characters WHEN emission runs for codex THEN it fails naming `8001`
  and `8000`; the matrix discloses the measured total and cap (`src/emit/capabilityMatrix.ts:621`).

### REQ-PROVE-005 — Always-on composite re-measured

`composeAlwaysOnLoad` counts, per client, the charter plus only the rules it still loads
unconditionally under the delivery mode (`src/content/charter.ts:210-217`); `ALWAYS_ON_BUDGET_LINES`
(`:124-146`) and the two shared-byte constants (`:181`, `:192`) re-pin to that measured load.

- GIVEN `on-demand` WHEN the corpus suite runs THEN every ceiling equals the computed composite and
  raising one fails (`test/corpus/invariants.test.ts:7-12`); the matrix names each client's mode.

### REQ-PROVE-006 — Charter carries the ai-evals floor in one line

The charter template states, in one physical line, that a model-backed feature ships with a versioned
golden-and-adversarial eval set whose thresholds are declared before the run, and stays under
`CHARTER_MAX_LINES` (`src/content/charter.ts:53`; the template is 93 lines at `949bde9`).

- GIVEN the charter template WHEN the corpus suite runs THEN exactly one physical line names the
  eval-set floor and the measured `lineCount` is at most 150.

### REQ-PROVE-007 — Charter invariants version

The charter frontmatter (`…stamity-charter.md:1-8`) gains `invariants_version`, `invariants_ratified`
and `invariants_amended`; every emitted charter renders one line under `## Invariants` — `Invariants
version <semver> · ratified <date> · last amended <date>` — from a `${STAMITY:…}` token (`:20-32`).

- GIVEN a sync per supported client WHEN the emitted charter is read THEN each carries that line with
  the three values substituted and the goldens carry it; a missing key fails `VALIDATION_ERROR`.

### REQ-PROVE-008 — Invariants block gated by hash

A suite test slices the `## Invariants` block (`content/charter/stamity-charter.md:34-60`), hashes it
and fails when the text moves without a version bump and an amendments row in `docs/doctrine.md`; the
version→hash pair is the only pinned literal, and `GOVERNANCE.md:36` states the bump rules and bumper.

- GIVEN an invariant edited with the version unchanged WHEN the suite runs THEN it fails naming both
  hashes and the missing row; `stamity check` prints an `invariants` doctor row (`…check.ts:791-794`).

### REQ-PROVE-009 — Eval set v7 with cases-v6

`evals/cases-v6/**` and `evals/SET-v7.md` are the current set; SET-v6, `cases-v5` and earlier stay
retained and unchanged (`evals/README.md:8`, `:28-30`). The four thresholds and SET-v6's scoring rule
carry over verbatim (`evals/SET-v6.md:82-87`); every gate under `test/evals/` reads the new constants.

- GIVEN the repository WHEN the eval gates run THEN they resolve `SET-v7.md` and `cases-v6/` with
  SET-v6's thresholds, and a successor-inputs test proves `cases-v5`'s Expected blocks survive.

### REQ-PROVE-010 — Trigger probes for rule-projected skills

Every rule delivered as a skill gains a should-trigger and a should-not-trigger probe in `cases-v6`,
each listing the extended skill surface in its `## Brief`. Recall labels derive from the case's
`source:` — rule file → `stamity-<id>`, skill file → its directory — not the id pattern (`…:1021-1023`).

- GIVEN a probe sourced to `content/rules/stamity-ai-evals.md` WHEN `aggregate` runs THEN its recall
  row is labelled `stamity-ai-evals`, and every existing probe keeps its SET-v6 label.

### REQ-PROVE-011 — Charter-floor twins

The four cases sourced to the two glob-less rules (`evals/cases-v5/golden/question-shape-and-default.md:5`,
`…/subagent-returns-blocked-ambiguity.md:5`, `…/unattended-run-applies-declared-default.md:5`,
`evals/cases-v5/adversarial/eval-change-needs-fresh-measurement.md:5`) each gain a twin governed by a
floor line alone: invariant 2 (`…charter.md:44-46`) for three, REQ-PROVE-006's line for the fourth.

- GIVEN `cases-v6` WHEN the set is parsed and scored THEN four twins exist, each quoting only its
  floor line, each with its original's Expected block and `floor` value, each scored as golden.

### REQ-PROVE-012 — Persistent rows repaired in the corpus

Three obligations move to the point of production: `content/agents/stamity-performance.md` states that
a Brief fact restated in a finding body still needs its own `path:line`; `…/stamity-security.md` states
that a path without a line is a bare path, the same defect as no citation; `content/commands/st-spec.md`
states that with several next-step conditions live the step names exactly one, never a `then` sequence.
The three cases' sealed Briefs and `source:` ranges move in the same diff, under `evals/cases-v5/golden/`:
`agent-performance-return-contract.md:5`, `agent-security-return-contract.md:5`,
`spec-next-step-derived-from-run-state.md:5`.

- GIVEN the three corpus files WHEN the corpus suite runs THEN each obligation sits in the section
  producing the artifact it governs, and each successor's `source:` range matches the repaired text.

### REQ-PROVE-013 — Ordering criteria surfaced

`parseGrade` (`scripts/eval/instrument.mjs:848`) tags a binding row `orderingCriterion: true` when its
criterion text matches a closed ordering vocabulary held in one place; `aggregate` (`:979`) reports
every admitted row carrying that tag with `evidence.ordered === false` (`:699-726`).

- GIVEN a graded row naming an ordering whose spans located unordered WHEN `aggregate` runs THEN it
  appears in the ordering report, and re-aggregating retained runs changes no admission.

### REQ-PROVE-014 — Windows worktree add retried once

`addWorktree` (`src/worktree/git.ts:625-659`) retries `git worktree add` exactly once, after a short
delay, when git exits 128 with stderr matching `failed to read .*commondir`. Named collisions stay
`VALIDATION_ERROR` (`:640-657`), the rest `FS_ERROR` (`:658`); a learning lands via `stamity learn
capture`.

- GIVEN a stubbed runner failing that way once then exiting 0 WHEN `addWorktree` runs THEN it is
  called exactly twice and resolves; failing every time it is still called exactly twice.

### REQ-PROVE-015 — Atomic-write rename budget widened on win32

The win32 branch of `RENAME_RETRY_DELAYS_MS` gains four further `800` ms steps on top of today's eight
(`src/merge/atomicWrite.ts:961-962`), so `RENAME_RETRY_CEILING_MS` — derived from the schedule, never
written down (`:980-983`) — recomputes upward; POSIX keeps its four retries and 750 ms. The moved test
bounds carry an inline reason citing CI run 34771471163. The real-disk test is untouched.

- GIVEN `process.platform` is win32 WHEN the schedule is summed THEN `RENAME_RETRY_CEILING_MS` is at
  least 7,000 ms and under 9,000 ms, asserted in `test/merge/atomicWrite.test.ts` (today's 3,000/5,000
  bounds at `:147-158`) with that inline reason, POSIX still pinning 4 and 750 ms (`:138-144`).
- GIVEN a stubbed `rename` rejecting `EPERM` fewer times than the schedule allows WHEN
  `atomicWriteFile` runs THEN the write lands and no temp file remains; rejecting past the schedule it
  fails with the path named, extending the stubbed tests at `:1150-1166` and `:1168-1189`.

### REQ-PROVE-016 — Spec status gate

A records test requires every `docs/specs/*.md` `status` to read `design`, `shipped` or
`shipped-with-<semver>` and refuses `draft`; a spec named by a plan whose `stamp:` commit precedes the
newest `v*` tag may not read `design` either. At `949bde9` `implementation-finish.md:3` is `draft`,
`workspace-surface.md:4` and `worktree-lane.md:4` `design` → `shipped-with-1.7.0`, `-1.1.0`, `-1.1.0`.

- GIVEN a spec reading `draft` WHEN the records test runs THEN it fails naming the file and the three
  forms; one reading `design` that a pre-tag plan names fails naming the plan and the tag.

### REQ-PROVE-017 — Eval documentation currency

The default `claude` profile selects `evals/rubric-v7.md` (v4 today: `evals/model-profiles-v1.json:3-8`)
and a test derives the README's current-rubric row from the selected profile, not from prose
(`evals/README.md:16`, `:21`). The README path table and the runner skill's dispatch section name
`stamity-claude-cli-v1` as the route of record; the checklist points at SET-v7 in place of SET-v5
(`.github/release-controls-checklist.md:170-171`) and carries the hand-page re-attestation line; both
Codex profiles are marked "documented, unproven, no run of record" with the control gap named.

- GIVEN the profile document WHEN the eval docs test runs THEN the README's current-rubric row equals
  the default profile's `rubric`, editing one alone fails, and no page names a superseded set.

### REQ-PROVE-018 — Hand pages re-attested

Every hand page carries `verified against the tree at the 1.8.0 release cut (<date>)` after a
claim-by-claim check, replacing the pre-1.7.0 attestations (`README.md:1`, `SECURITY.md:1`);
`RELEASE_CUT_DATE` (`test/docsPages.test.ts:285`) equals it and the gate at `:512-533` enforces both
halves over the twelve pages (`:99`, `:159`).

- GIVEN every hand page WHEN the docs-pages suite runs THEN each attests to the 1.8.0 cut date, at
  least one equals `RELEASE_CUT_DATE`, and none attests later than it.

### REQ-PROVE-019 — Security mapping written

`SECURITY.md`'s two open proof rows (`:244-250`) cite the pack-signing rehearsal run 34758487370 and
the release run 34771477218 as closed evidence. `docs/security-mapping.md` carries the version-pinned
OWASP (agentic 2026, LLM 2025, web 2021), NSA/Five-Eyes and NIST AI RMF mappings and the six-surface
actor/vector/control/residual table with mapped ids, every control traced to `path:line` and every gap
stated; `SECURITY.md:207-220` points at it and the docs navigation lists it (`…docsPages.test.ts:130`).

- GIVEN the new page WHEN the docs suite runs THEN every catalogue reference carries its edition, every
  control row's `path:line` resolves, and roster, sidebar and `SECURITY.md` reach it (`:150-152`).

### REQ-PROVE-020 — Measurement report

`scripts/merge-ready-rate.mjs` computes the verified merge-ready rate from committed run records —
denominator, numerator, exclusions by run id, merge evidence from CHANGELOG-listed pull requests.
`docs/measurements.md` (absent at `949bde9`) is generated from it and a committed npm-download snapshot
labelled a reach proxy, entering roster, sidebar, `llms.txt` and the README map
(`test/docsPages.test.ts:130`, `:150-152`); doctrine and getting-started link the run of record and the
first-run proof lanes without touching README's mission or tagline sentences.

- GIVEN the committed run records WHEN the script runs twice THEN the numbers repeat, the page is
  byte-identical, the proxy label and every excluded run id are present, and README's lines unchanged.

### REQ-PROVE-021 — QA automation and binding

A harness under `scripts/qa/` runs keyboard journeys at 375 and 1440 in both themes with
accessibility-tree snapshots against the built site, plus headless hook deny/allow runs per client
present and authenticated, recording `not-run` with the reason otherwise. It writes
`.stamity/evidence/qa-<sha>.json` beside the existing browser evidence (`…/browser-caec7fa.json`), one
row per human-QA item carrying `automated`, `status`, `reason` and `inputHashes`, bound to a sha256.

- GIVEN a fixture evidence file WHEN the row-shape test runs THEN every row carries the four fields, no
  browser launches, and a performed row carries forward on unchanged hashes and reopens on a changed one.

## Non-goals

- Track B's with/without benchmark: scheduled with its own trigger, not this package's.
- Telemetry. The measurement report reads committed records and a published download snapshot.
- A hosted or always-on judge. Eval runs stay the manual harness on the route of record.
- Editing retained eval baselines: SET-v1…v6 and `cases/`…`cases-v5` stay byte-identical (`…:28-30`).

## Evidence

`.stamity/runs/2026-09-14_package-11/record.md` — the `949bde9` baseline, the eleven decisions, the three phases.
