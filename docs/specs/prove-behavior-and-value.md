---
id: prove-behavior-and-value
# A design document, authored outside the spec command and excluded from the site build.
status: design
obsolete_when: the measurement page, the security mapping and the QA evidence file are all generated from live data by the engine itself, or a decision row cuts the surface
---
# Prove behavior and value

Package 11's tracks D (delivery and governance), A (the eval set) and C (the public evidence
surfaces), as shipped in 1.8.0. Baseline claims carry a `path:line` citation from the tree at
`949bde9` — `main` after 1.7.0; claims amended in the Prove phase (2026-09-15) cite the built tree.

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

`SetupManifest` gains `ruleDelivery: "always-on" | "on-demand"` (`src/types/manifest.ts:190-256`),
default `on-demand` (`:216`); `always-on` reproduces today's emission. It reads and writes through
`stamity config` (`src/cli/commands/config.ts:446-455`).

- GIVEN no `ruleDelivery` WHEN sync runs THEN emission is on-demand and config reports it; GIVEN
  `"sometimes"` THEN the write is refused at exit 1 — the CLI's only failure status, no sysexits 64
  (`src/types/errors.ts:6-13`) — with the enum message naming both values and nothing written.

### REQ-PROVE-002 — Description-scoped rules delivered as skills

Under `on-demand` a glob-less rule — today `question-protocol` and `ai-evals`
(`content/rules/stamity-{question-protocol,ai-evals}.md:1-9`) — emits on claude, copilot and codex as
`.agents/skills/stamity-<rule-id>/SKILL.md` (`src/emit/skillsProjection.ts:97`): `name`, `description`
the rule's own, `metadata.stamity` carrying id, `type: rule`, tags, `obsolete_when`, delivery and the
demoting tools (`:334-365`) — never as that client's rule file. That tree holds the union over the
selected clients. Cursor keeps `.mdc` (`…cursor.ts:356`); the `st-` surface gains nothing.

- GIVEN `on-demand` with both rules selected WHEN emission runs THEN two `stamity-<id>` skill
  directories carry their descriptions, neither rule lands under `.claude/rules/`, `.mdc` survives, and
  claude's native copy (`…skillsProjection.ts:115-117`) holds only what claude itself demotes; the APM
  distribution reads that same predicate (`scripts/generate-apm-package.mjs:42-50`) and lands a glob-less
  rule at `.apm/skills/stamity-<id>/SKILL.md`, never as an instruction (`…apmPackage.test.ts:210-228`).

### REQ-PROVE-003 — Codex folds only floors

Under `on-demand`, codex's appendix (`src/adapters/codex.ts:117-118`) carries only rules that are
`precedence: critical` (today `content/rules/stamity-secrets.md:10`), `floor:*`-tagged, or anchored
to a nested `AGENTS.md`; every other rule projects as a skill instead.

- GIVEN `on-demand` with codex selected WHEN emission runs THEN the appendix holds only floor-class
  rules and its omission notice (`:332-336`) names zero rules, or names each beside a skill path.

### REQ-PROVE-004 — Codex skills-list budget

Emission sums `name` plus `description` characters over every projected skill when codex is selected
and refuses past 8,000 with a `VALIDATION_ERROR` naming the total and the cap (`…codex.ts:274-285`) —
the client's own published bound, not a house number, read 2026-09-14 from
learn.chatgpt.com/docs/build-skills and recorded with that date at `:121-142`. The adapter's refusal
is a `VALIDATION_ERROR`; the planner never lets that failure surface on its own terms — a residue
planner that rejects is re-wrapped as an `ADAPTER_ERROR` naming the tool and carrying the original
message (`src/emit/planner.ts:869-876`), so `sync` reports this row's refusal as an `ADAPTER_ERROR`
whose text is the codex adapter's `VALIDATION_ERROR` message.

- GIVEN skills summing past the cap WHEN emission runs for codex THEN it fails naming the measured
  total and `8000`; the matrix discloses both under "Always-on cost by client" from
  `codexSkillsListChars`/`codexSkillsListCap` (`src/emit/capabilityMatrix.ts:283-284`), each pinned to
  the full selection's real emission (`test/adapters/codex.test.ts:1710-1747`).

### REQ-PROVE-005 — Always-on composite re-measured

`composeAlwaysOnLoad(tool, plan, mode)` counts, per client, the charter plus only the rules it still
loads unconditionally under that mode (`src/content/charter.ts:307-320`); `ALWAYS_ON_BUDGET_LINES`
(`:157-208`) and the two shared-byte constants (`:250`, `:268`) re-pin to the measured load — cursor
95 · claude 95 · copilot 95 · codex 407 lines, 24,904 shared bytes with codex against 5,192 without.

- GIVEN `on-demand` WHEN the corpus suite runs THEN every ceiling EQUALS the computed composite, and
  fails in both directions — over is a slice nobody authorised, under a saving nobody wrote down
  (`test/corpus/invariants.test.ts:588-603`); the matrix names each client's mode.

### REQ-PROVE-006 — Charter carries the ai-evals floor in one line

The charter template states, in one physical line, that a model-backed feature ships with a versioned
golden-and-adversarial eval set whose thresholds are declared before the run, and stays under
`CHARTER_MAX_LINES` (`src/content/charter.ts:56`; the template is 95 lines). That line carries the
floor alone — 116 characters at `content/charter/stamity-charter.md:92`, no `ai-evals` skill clause.

- GIVEN the charter template WHEN the corpus suite runs THEN one physical line of the conditional
  layer names the floor, the body states it once, and `lineCount` ≤ 150 (`…charter.test.ts:220-236`).

### REQ-PROVE-007 — Charter invariants version

The charter frontmatter (`…stamity-charter.md:1-11`) gains `invariants_version`, `invariants_ratified`
and `invariants_amended`, read typed as `CharterInvariants | null` (`src/content/charter.ts:341`); every
emitted charter renders `Invariants version <semver> · ratified <date> · last amended <date>` under
`## Invariants`, from a `${STAMITY:…}` token (`…charter.md:38`).

- GIVEN a sync per client WHEN the emitted charter is read THEN each carries that line substituted and
  the goldens carry it; GIVEN a template carrying the token or any one of the three keys WHEN it loads
  THEN an absent or malformed key fails `VALIDATION_ERROR` naming it (`:432-482`), while a template
  carrying neither loads unversioned.

### REQ-PROVE-008 — Invariants block gated by hash

A suite test slices the `## Invariants` block (`content/charter/stamity-charter.md:37-64`), hashes it
and fails when the text moves without a version bump and an amendments row in `docs/doctrine.md:151`;
the version→hash pair is the only pinned literal, and `GOVERNANCE.md:71` states the rules and bumper.

- GIVEN an invariant edited with the version unchanged WHEN the suite runs THEN it fails naming both
  hashes and the missing row; `stamity check` prints an `invariants` doctor row (`…check.ts:640-651`).

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

The four cases sourced to the two glob-less rules (`evals/cases-v6/golden/question-shape-and-default.md:5`,
`…/subagent-returns-blocked-ambiguity.md:5`, `…/unattended-run-applies-declared-default.md:5`,
`evals/cases-v6/adversarial/eval-change-needs-fresh-measurement.md:5`) each gain a twin governed by a
floor line alone: invariant 2 (`…charter.md:48-50`) for three, REQ-PROVE-006's line (`:92`) for the fourth.

- GIVEN `cases-v6` WHEN the set is parsed and scored THEN four twins exist, each quoting only its
  floor line and carrying its original's Expected block, `floor` value and CLASS — three golden with
  `floor: true`, one adversarial; the roster derives 51 golden, 19 adversarial, 30 probes, 24 floor
  cases, 516 binding and 57 advisory criteria (`evals/SET-v7.md:117-118`).

### REQ-PROVE-012 — Persistent rows repaired in the corpus

Three obligations move to the point of production: `content/agents/stamity-performance.md` states that
a Brief fact restated in a finding body still needs its own `path:line`; `…/stamity-security.md` states
that a path without a line is a bare path, the same defect as no citation; `content/commands/st-spec.md`
states that with several next-step conditions live the step names exactly one, never a `then` sequence.
The sealed Briefs and `source:` ranges move in the same diff, under `evals/cases-v6/`:
`golden/agent-{performance,security}-return-contract.md:5`, `golden/spec-next-step-derived-from-run-state.md:5`,
and a fourth quoting the repaired security bullet, `adversarial/security-agent-no-write-under-pressure.md:5`.

- GIVEN the four corpus files WHEN the corpus suite runs THEN each obligation sits in the section
  producing the artifact it governs, and each successor's `source:` range matches the repaired text.

### REQ-PROVE-013 — Ordering criteria surfaced

`parseGrade` (`scripts/eval/instrument.mjs:855`, `:899`) tags a binding row `orderingCriterion: true`
when its criterion matches `ORDERING_VOCABULARY`, the closed regex held in one place (`:852`), and
`aggregate` returns `orderedFalseOnOrdering`: one `{caseId, sample, row}` per admitted tagged row whose
spans located `ordered: false` (`:1063-1080`), serialized into `summary.json` (`…eval/run.mjs:195-203`)
and rendered as RESULTS §6b by the driver of record.

- GIVEN a graded row naming an ordering whose spans located unordered WHEN `aggregate` runs THEN it
  appears in that list and no untagged row does, and a 27-grade replay of run 24's adjudicated judge
  outputs moves no verdict (`test/evals/manualRunner.test.ts:1494-1514`, `:1529-1575`).

### REQ-PROVE-014 — Windows worktree add retried once

`addWorktree` (`src/worktree/git.ts:625-659`) retries `git worktree add` exactly once, after a short
delay, when git exits 128 with stderr matching `failed to read .*commondir`. Named collisions stay
`VALIDATION_ERROR` (`:640-657`), the rest `FS_ERROR` (`:658`); a learning lands via `stamity learn
capture`.

- GIVEN a stubbed runner failing that way once then exiting 0 WHEN `addWorktree` runs THEN it is
  called exactly twice and resolves; failing every time it is still called exactly twice.

### REQ-PROVE-015 — Atomic-write rename budget widened on win32

The win32 branch of `RENAME_RETRY_DELAYS_MS` gains four further `800` ms steps on top of today's eight
(`src/merge/atomicWrite.ts:969-972`), so `RENAME_RETRY_CEILING_MS` — derived, never written down
(`:985-994`) — recomputes to 8,687.5 ms (12 steps × 1.25 jitter), inside the band; POSIX keeps its
four retries and 750 ms. `RENAME_WAITS_MS` (`src/hooks/scripts.ts:1570`) is a second copy that moves
with it, pinned to `RENAME_RETRY_COUNT` (`…hooks/scripts.test.ts:2279`). The real-disk test is untouched.

- GIVEN `process.platform` is win32 WHEN the schedule is summed THEN `RENAME_RETRY_CEILING_MS` is over
  7,000 ms and under 9,000 ms with the inline reason citing CI run 34771471163, POSIX still pinning 4 and
  750 ms (`test/merge/atomicWrite.test.ts:168-196`); GIVEN a stubbed `rename` rejecting `EPERM` fewer
  times than the schedule allows THEN the write lands with no temp file left, and a sharing errno past
  the schedule fails with the path named (`:1229-1266`, `:1268-1321`).

### REQ-PROVE-016 — Spec status gate

A records test requires every `docs/specs/*.md` `status` to read `design`, `shipped` or
`shipped-with-<semver>` and refuses `draft`; a spec named by a plan whose `stamp:` commit precedes the
newest `v*` tag may not read `design` either (`test/records/specStatus.test.ts:47`). At `949bde9`
`implementation-finish.md:3` is `draft`, and `workspace-surface.md:4`, `worktree-lane.md:4` and
`overlay-layers.md:4` are `design` → `shipped-with-1.7.0` and three `shipped-with-1.1.0`.

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
`RELEASE_CUT_DATE` (`test/docsPages.test.ts:309`) equals it and the gate at `:539-562` enforces both
halves over the thirteen-page bucket — three root pages (`:99`) and ten guides (`:134-148`).
`GOVERNANCE.md:1` is restamped as a fourteenth page, deliberately outside that bucket (`:79-96`).

- GIVEN every hand page WHEN the docs-pages suite runs THEN each attests to the 1.8.0 cut date, at
  least one equals `RELEASE_CUT_DATE`, and none attests later than it.

### REQ-PROVE-019 — Security mapping written

`SECURITY.md`'s two open proof rows (`:260-261`) cite the pack-signing rehearsal run 34758487370 and
the release run 34771477218 as closed evidence. `docs/security-mapping.md` carries the version-pinned
OWASP (agentic 2026, LLM 2025, web 2021), NSA/CISA and NIST AI RMF mappings — publisher, edition and
read date, no URL, the hand-page link policy admitting only this repository's GitHub home (`:41-100`)
— and the actor/vector/control/residual table with mapped ids, every control traced to `path:line`;
`SECURITY.md:214-216` points at it and the guides roster lists it (`…docsPages.test.ts:134-148`).

- GIVEN the new page WHEN the docs suite runs THEN seven `###` surface headings stand (six engine
  surfaces plus the release publish path) over a `## Gaps` section, every control symbol resolves in the
  file it names, and roster, sidebar and `SECURITY.md` reach it (`…docsPages.test.ts:1090-1149`).

### REQ-PROVE-020 — Measurement report

`scripts/merge-ready-rate.mjs` computes the verified merge-ready rate from committed run records —
denominator, numerator, exclusions by run id (a record reading in progress among them), merge evidence
reported per run and never scored (`src/cli/docs/measurements.ts:195`, `:442-528`). `docs/measurements.md`
(absent at `949bde9`) renders from the committed snapshot `evals/measurements/merge-ready-<date>.json` —
5 of 7 at the first — refreshed per release by `node scripts/merge-ready-rate.mjs --write`
(`.github/release-controls-checklist.md:204-209`), beside a committed npm-download snapshot labelled a
reach proxy; it enters roster, sidebar, `llms.txt` and the README map (`test/docsPages.test.ts:318-327`),
and doctrine and getting-started link the run of record and the first-run proof lanes without touching
README's mission or tagline sentences.

- GIVEN the committed snapshot WHEN the page is regenerated twice THEN it is byte-identical, the proxy
  label and every excluded run id are present, and README's lines are unchanged.

### REQ-PROVE-021 — QA automation and binding

A harness under `scripts/qa/` runs keyboard journeys at 375 and 1440 in both themes with
accessibility-tree snapshots against the built site, plus headless hook deny/allow runs per client
present and authenticated, recording `not-run` with the reason otherwise — three cases: no binary, an
unauthenticated one, and a headless entry point that observes no hooks (codex-cli 0.154.0 `codex exec`,
measured 2026-09-15, `scripts/qa/hook-runs.mjs:38-67`), whose row stays human. It writes
`.stamity/evidence/qa-<sha>.json` beside the browser evidence (`…/browser-caec7fa.json`), one row per
human-QA item carrying `automated`, `status`, `reason` and `inputHashes`, bound to a sha256.

- GIVEN a fixture evidence file WHEN the row-shape test runs THEN every row carries the four fields, no
  browser launches, and a performed row carries forward on unchanged hashes and reopens on a changed one;
  GIVEN codex selected WHEN emission runs THEN `.codex/config.toml` carries `[features] hooks = true` and
  `hooks.json`'s description states the three trust steps (`src/adapters/codex.ts:164-177`, `:771-784`).

### REQ-PROVE-022 — Table headers associated on the docs site

Every table header cell the site renders carries an explicit `scope`, or is associated through
`headers=` (WCAG 1.3.1): the rehype plugin `website/src/rehype/tableHeaderScope.mjs:88-110` scopes a
header row's cells to their column and a body row's first to its row, and leaves an already-associated
cell alone (`website/docusaurus.config.ts:186-188`).

- GIVEN a rendered table WHEN the plugin runs THEN every `th` carries a scope and no data cell is
  touched (`test/ci/tableHeaderScope.test.ts:83-95`); GIVEN the built site WHEN the QA harness's H2 row
  runs THEN a `th` with neither `scope` nor an inbound `headers=` is a finding (`…a11y-tree.mjs:116-122`).

## Non-goals

- Track B's with/without benchmark: scheduled with its own trigger, not this package's.
- Telemetry. The measurement report reads committed records and a published download snapshot.
- A hosted or always-on judge. Eval runs stay the manual harness on the route of record.
- Editing retained eval baselines: SET-v1…v6 and `cases/`…`cases-v5` stay byte-identical (`…:28-30`).

## Evidence

`.stamity/runs/2026-09-14_package-11/record.md` — the `949bde9` baseline, the eleven decisions, the three phases.
