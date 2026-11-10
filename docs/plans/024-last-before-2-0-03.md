---
id: last-before-2-0-03
intent: feature
stamp: 4f945a3a9c758e0fd4c719a1de569ccf2272158f 2026-11-09
reads: [content/commands/st-plan.md, content/commands/st-work.md, content/skills/st-unattended/SKILL.md, content/skills/st-verify/references/testability.md, docs/factory.md, docs/specs/everyday-flows.md, docs/specs/orchestrator-context.md, src/cli.ts, src/cli/commands/check.ts, src/cli/commands/gate.ts, src/cli/commands/run.ts, src/detect/repoAnalyzer.ts, src/detect/stackSupport.ts, src/detect/verificationGates.ts, src/runs/layout.ts, src/runs/ledgerStore.ts, src/runs/overview.ts, src/runs/preflight.ts, src/types/detect.ts, test/detect/repoAnalyzer.test.ts, test/detect/stackSupport.test.ts, test/detect/verificationGates.test.ts]
depends_on: [docs/plans/024-last-before-2-0-02.md]
---

# 1.19.0, the last release before 2.0 — file 3 of 3: the stretch

This file is self-contained. It follows files 1 and 2 on the same branch and pull request, under the same unit rules
(restated in short below). Every `file:line` resolves at `4f945a3a`.

## Context

Two stretch items, both built. A **ready report** tells a team whether a repository is ready for unattended
runs, reading files only, with older stacks detected and a recipe for pinning old, weakly tested code before changing
it. **First numbers** give each shipped item its wall time, the person's minutes, rework and, where the client exposes
it, tokens and cost. Decided at the session's start (word for word in the run record): the report reads files only and
never runs the repository's commands; it shows coverage only from a report already on disk; the unattended pre-flight
warns, never refuses, when the repository looks unready. Out of scope: running commands, generating coverage, a full
remake of detection (2.0).

## Decisions

- **`stamity ready` is its own verb,** exit 0 on any verdict: a report, not a gate (`check` exits 1 on a `fail` row).
- **Perl and C/C++ join the language table;** COBOL and ABAP go to `legacyStacks`, since neither has an honest local
  gate command to put in a charter.
- **Language versions live on `RepoInfo` only,** so the persisted manifest schema does not move.
- **The pre-flight warning is `repo-unready`,** and the unattended skill copies pre-flight warnings to the morning list.
- **Minutes are the run's clock, labelled so;** tokens and cost come only from a transcript the client names, read for
  usage fields alone; otherwise `unreported`.

## Spec delta

Stated against `docs/specs/everyday-flows.md` unless a line says otherwise; new flow ids start at 182, after file 2's.

### REQ-FLOW-182 — A ready report reads whether a repository is ready for unattended runs (ADDED)

- Given `stamity ready`, then it prints one line per check (`ready`, `gap`, `not-checked` or `unknown`, with evidence
  and a fix), the languages with any versions a file states, legacy stacks, and coverage only from a report on disk;
  it runs no command of the repository and exits 0 on any verdict.

### REQ-FLOW-101 — The unattended pre-flight (MODIFIED)

A fifth warning, `repo-unready`, names the report's gaps; it never refuses and never changes `ok`. The unattended
skill copies every pre-flight warning to the morning list.

### REQ-FLOW-183 — Each shipped item has first numbers (ADDED)

- Given `stamity run metrics --run <id>`, then it prints wall minutes, agent minutes, the person's minutes from the
  record's `ask:` lines, review and fix rounds, reopened findings, and tokens and cost only from a named transcript,
  each unknown value `unreported`; the proof block carries one `metrics:` line from it.

### REQ-CTX-019 — Usage lines (MODIFIED, `docs/specs/orchestrator-context.md`)

The record gains `ask:` lines (asked, answered, questions) and the proof block one `metrics:` line.

### REQ-FLOW-184 — Old, weakly tested code is pinned before it changes (ADDED)

- Given a refactor or brownfield plan touching a path with no test, then unit 0 follows the characterization recipe
  (`content/skills/st-verify/references/characterization.md`).

## Units

Rules (file 1's): every `verify` also runs `test/ci/testInputsGuard.test.ts`, `test/architecture`, lint, typecheck,
knip, plus `test/roster` for new path strings in `src/`, `test/evals` and `test/corpus` for a `content/` edit. Lanes
are worktrees with a linked install: no `npm ci`, no full suite, explicit staging. Content in place where it can;
moved eval ranges re-pointed. Chains: `src/detect/repoAnalyzer.ts`: x-lang-table only; `src/cli.ts` after file 2's
s-skill-verb: x-ready-verb; `src/cli/commands/gate.ts` after file 1's t-gate-held: x-preflight-warn;
`content/commands/st-work.md` after file 2's s-skills-content: x-recipe → x-metrics-content;
`content/skills/st-unattended/SKILL.md` after file 2's k-unattended-text: x-preflight-warn; `src/cli/commands/run.ts`
after file 2's d-run-cleanup: x-run-metrics. Run order: x-lang-table and x-ledger-reopens at once; then the rest.

### x-lang-table — older stacks and language versions

- id: x-lang-table
- requirements: REQ-FLOW-182
- files: `src/detect/repoAnalyzer.ts`, `src/types/detect.ts`, `src/detect/stackSupport.ts`, `src/detect/verificationGates.ts`, `test/detect/repoAnalyzer.test.ts`, `test/detect/stackSupport.test.ts`, `test/detect/verificationGates.test.ts`, and the `RepoInfo` fixture line in `test/cli/commands/initApply.test.ts`, `test/cli/commands/initPanel.test.ts`, `test/cli/commands/syncMcpOwnership.test.ts`, `test/emit/planner.test.ts`, `test/types/domain.test.ts` (amended 2026-11-09, S43)
- interfaces: table rows (`repoAnalyzer.ts:44-74`): `perl` (`cpanfile`, `Makefile.PL`, `Build.PL`, `dist.ini`; gates
  `prove -lr t`, `perlcritic .`) and `cpp` (`CMakeLists.txt`, `meson.build`, `conanfile.txt`, `vcpkg.json`,
  `configure.ac`; test `ctest --test-dir build --no-tests=error` only where a root `CMakeLists.txt` is present, else unresolved, so the gate never passes with no test run; lint unresolved; `cpp` ranks last in the precedence list, so a repo with another language keeps its gates; amended 2026-11-09, S44 and S45), each with `LANGUAGE_SUBJECTS`
  (`stackSupport.ts:205-226`), `LANGUAGE_GATES` (`verificationGates.ts:107-131`) and `GATE_LANGUAGE_PRECEDENCE`
  (`:198-218`) rows. `RepoInfo` (`src/types/detect.ts:52-78`) gains `legacyStacks: string[]` (`cobol` from a root
  `.cbl`/`.cob`/`.cpy`, as `csharp` at `repoAnalyzer.ts:522-525`; `abap` from `.abapgit.xml` or `abaplint.json`) and
  `languageVersions?: { language; version; source }[]` read from `.nvmrc`, `.node-version`, `package.json`
  `engines.node`, `.python-version`, `pyproject.toml` `requires-python`, `.ruby-version`, a `Gemfile` `ruby "x"`,
  `go.mod` `go`, `pom.xml` `maven.compiler.release|source` or `java.version`, `.java-version`, `.tool-versions`,
  `rust-toolchain(.toml)`, Cargo `rust-version`, `composer.json` `require.php`, `global.json`. `formatRepoSummary`
  (`:806-826`) prints both.
- testCriteria: each new row's first file seeded alone detects it (`repoAnalyzer.test.ts:311-322`); the subject and
  gate tests pass with the new rows; each version source gives its version; a COBOL root file gives `legacyStacks`
  and no charter gate.
- edgeCases: a `Makefile` alone detects nothing; a malformed `package.json` gives no version and no throw.
- depends_on: none
- verify: `npx vitest run test/detect test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: Detection reads files at the root. It trusts nothing it reads. Abuse: a crafted file throwing the reader.
  Stopped by each read failing to `none`.

### x-ready-core — the readiness checks

- id: x-ready-core
- requirements: REQ-FLOW-182
- files: `src/detect/readiness.ts` (new), `test/detect/readiness.test.ts` (new)
- interfaces: `assessReadiness(info: RepoInfo, reads: ReadinessReads): ReadinessReport`, pure; `ReadinessReport =
  { ready: boolean; checks: { id; state: "ready" | "gap" | "not-checked" | "unknown"; evidence; fix }[]; stack:
  { languages; legacyStacks; versions; tiers }; coverage: { file; linesPct } | null; notChecked: string[] }`. Checks:
  test framework (`repoAnalyzer.ts:672-697`); gates resolve (`resolveCharterGates`, `src/cli/commands/check.ts:2867-2884`);
  a CI provider (`repoAnalyzer.ts:749-755`, `:765-773`); a workflow running on `pull_request` (each foreign workflow's
  `on:` read with `parseYamlStrict`; a non-GitHub provider is a `gap`: commit status only); the land job's workflow
  names (`checkLandJobWorkflows`, `check.ts:2030`); a lockfile (`:440-445`); the setup committed and pinned
  (`preflight.ts:586-604`); a `tests` change class in `.stamity/change-classes.json`; coverage from
  `coverage/coverage-summary.json`, `coverage/lcov.info`, `coverage.xml`, `target/site/jacoco/jacoco.xml` or
  `build/reports/jacoco/test/jacocoTestReport.xml`, totals only. The branch rule is `not-checked`, its fix
  `stamity gate preflight --unattended --dry-run`.
- testCriteria: each check has one fixture that makes it `ready` and one that makes it `gap` (except `coverage`, where no report on disk reads `not-checked`, and `branch-rule`, always `not-checked`; S51, amended 2026-11-09); coverage present and
  absent; nothing spawned (no child process in the test).
- edgeCases: a coverage file over 5 MB is read only for its totals line or marked `unknown`.
- depends_on: x-lang-table
- verify: `npx vitest run test/detect/readiness.test.ts test/detect test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: Reads repository files. It trusts nothing it reads. Abuse: a huge or crafted file. Stopped by size caps and
  parse failures reading `unknown`.

### x-ready-verb — `stamity ready`

- id: x-ready-verb
- requirements: REQ-FLOW-182
- files: `src/cli/commands/ready.ts` (new), `src/cli.ts`, `docs/cli-reference.md` (regenerated), `docs/factory.md`, `test/cli/commands/ready.test.ts` (new), `test/cli/docs/cliReference.test.ts`, `test/docsPages.test.ts`, and (S53, amended 2026-11-09: folded into x-ready-core's lane) `test/cli/surface.e2e.test.ts` (the `ready` pins), `test/architecture/boundaries.test.ts` (the `PLAN_MAP` rows for `src/detect/readiness.ts` and `src/cli/commands/ready.ts`), and after n-away-verb lands, `ready` in the hand-kept verb lists and counts (`README.md`, `docs/getting-started.md`, `src/llmsIndex.ts`, `llms.txt`; S62, build/56)
- interfaces: `stamity ready [--json] [--path <dir>]`, `mutating: false`; text: one line per check `<id>  <state>
  <evidence>  (fix: …)`, then `languages:` with versions, `legacy:` when any, `coverage: <pct> from <file>` only when a
  report exists; JSON is the `ReadinessReport`. Exit 0 on any verdict, 1 when the root cannot be read, 2 on a usage
  error. `docs/factory.md` Step 1 names `stamity ready` before the setup steps.
- testCriteria: a ready fixture exits 0 with `ready: true`; a gap fixture exits 0 with the gaps; an unreadable root
  exits 1; the CLI reference counts the new command.
- edgeCases: a path that is a file, not a folder, exits 2.
- depends_on: x-ready-core
- verify: `npx vitest run test/cli/commands/ready.test.ts test/cli/docs/cliReference.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: A read-only report. Abuse: none reachable.

### x-preflight-warn — `repo-unready`, and warnings reach the morning list

- id: x-preflight-warn
- requirements: REQ-FLOW-101
- files: `src/runs/preflight.ts`, `src/cli/commands/gate.ts`, `content/skills/st-unattended/SKILL.md`, `test/runs/preflight.test.ts`, `test/cli/commands/gatePreflight.test.ts`, `test/corpus/skills/unattended.test.ts`
- interfaces: `WarningId` (`preflight.ts:47`) gains `"repo-unready"`; `PreflightDeps` gains `readiness?: { gaps:
  string[] }`, absent meaning no warning; when gaps exist push `{ id: "repo-unready", reason: "the ready report finds
  gaps: <ids>; run stamity ready" }`; `runPreflightVerb` (`gate.ts:1738-1791`) fills it from `assessReadiness`. The
  skill, joining an existing line within its cap: every pre-flight warning goes on the morning list. An `unknown` readiness row from a check that ran counts as a gap for this warning, never a pass (amended 2026-11-09, S52); a check the pre-flight does not run (for example gates or the land job it cannot import) is passed as `not-checked` and does not warn (S61, refining S52; build/55).
- testCriteria: with gaps the warning appears and `ok` is unchanged; without, it does not; the JSON carries it; the
  skill pin reads the sentence; the body stays within 163 lines.
- edgeCases: a readiness read that throws gives no warning and no refusal.
- depends_on: x-ready-core
- verify: `npx vitest run test/runs/preflight.test.ts test/cli/commands/gatePreflight.test.ts test/corpus/skills/unattended.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The unattended pre-flight. It trusts the report. Abuse: a warning turning into a refusal. Stopped by the
  warning living outside `refusals` (`preflight.ts:1009-1018`); the security lens reviews it.

### x-recipe — the old-code test recipe

- id: x-recipe
- requirements: REQ-FLOW-184
- files: `content/skills/st-verify/references/characterization.md` (new), `content/commands/st-plan.md`, `content/commands/st-work.md`, `test/corpus/commands/plan.test.ts`, and (S70, amended 2026-11-10) the re-attach headroom pin in `test/corpus/commands/work.test.ts` (lowered only by the characters this unit spends, after t-work-proof lands, with a dated note) and the `st-verify` file list in `test/emit/skillsProjection.test.ts`, and (S76, amended 2026-11-10) the red-first lines of `content/agents/stamity-implementer.md` (its Testing rules and class rule, with fix/5's tests-class gap) and their pins in `test/corpus/agents/spine.test.ts`, plus `/st-work`'s post-cut Build checks paragraph and its pins
- interfaces: a `load: reference` file of 40 to 100 body lines (`test/corpus/invariants.test.ts:944-947`): when (a
  touched path with no test, or a coverage report showing it uncovered); find the seams (public entry points and their
  observable outputs); record what the code does today, naming each test `pins current: …`; inject clock, randomness
  and environment; golden files for large outputs; prove each pin bites by changing one line and seeing red; flag odd
  behaviour as a finding, never fix it in unit 0; commit unit 0 green before any change. One sentence in `st-plan.md`
  at the Refactor Phase 0 (`:164`) and one in `st-work.md` Research (`:39-41`) naming the reference.
- testCriteria: the reference passes the corpus invariants; the two sentences are pinned; moved eval ranges re-pointed.
- edgeCases: none: one reference file and two pointers.
- depends_on: none (after file 2's s-skills-content, same file)
- verify: `npx vitest run test/corpus test/evals test/ci/testInputsGuard.test.ts`
- threat: Skill text. Abuse: none reachable.

### x-ledger-reopens — a reopened finding is counted

- id: x-ledger-reopens
- requirements: REQ-FLOW-183
- files: `src/runs/ledgerStore.ts`, `src/runs/cardSource.ts`, `test/runs/ledgerStore.test.ts`, `test/support/ledgerGrammar.ts` (the records gate's strict row parser; amended 2026-11-09, S42)
- interfaces: `LedgerRow` (`ledgerStore.ts:71-80`) gains optional `reopens?: number`, incremented when a closure
  (`:622-629`) rewrites a row to `open` (`not-fixed`, `regressed`, `rejection-overturned`); readers that rebuild rows
  (`src/runs/cardSource.ts`, `src/runs/resumeCard.ts`) keep the field or ignore it, said per reader in the result.
- testCriteria: a `regressed` closure sets `reopens: 1`, a second sets 2; an older row without the field reads 0; the
  ledger's strict reader accepts the field.
- edgeCases: a row closed `fixed` keeps its count.
- depends_on: none
- verify: `npx vitest run test/runs test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: The ledger, read by the land's evidence. It trusts the CLI's closure verb. Abuse: none: a counter only.

### x-run-metrics — `stamity run metrics`

- id: x-run-metrics
- requirements: REQ-FLOW-183
- files: `src/runs/metrics.ts` (new), `src/runs/transcriptUsage.ts` (new), `src/runs/prices.ts` (new), `src/cli/commands/run.ts`, `test/runs/metrics.test.ts` (new), `test/runs/transcriptUsage.test.ts` (new)
- interfaces: `stamity run metrics --run <id> [--transcript <path>] [--json]` added to the `run` choices
  (`run.ts:191`, `:212-221`, `:319`, `:373`), read-only. JSON `{subcommand:"metrics", run, wall{minutes,from,to},
  agentMinutes{value,complete,usageLines}, person{minutes,asks,source}, rework{reviewRounds,fixRounds,reopened,
  findings{fixed,deferred,rejected,open}}, tokens{value,source,split|null}, cost{usd,priceSource,accessDate}}`. Wall from
  the record's first and last stamped lines; agent minutes the sum of `usage:` minutes; person minutes the sum of
  `ask:` answered − asked; review rounds the highest `review rN` (`layout.ts:109-114`); fix rounds the `-fixer-rN`
  reports in the ledger; reopened from `reopens`. `transcriptUsage.ts` reads only `message.usage` fields and
  timestamps from a Claude Code JSONL, taking the maximum per message id, never message text. `prices.ts`: a small
  price table with its access date; a model not in it reads cost `unreported`.
- testCriteria: a fixture record gives wall, agent, person and rounds; a fixture transcript gives tokens by the max per
  id; no transcript gives `unreported`; the transcript reader never returns text.
- edgeCases: a record with no `ask:` lines gives person `unreported`, not 0.
- depends_on: x-ledger-reopens
- verify: `npx vitest run test/runs/metrics.test.ts test/runs/transcriptUsage.test.ts test/cli/commands/run.test.ts test/ci/testInputsGuard.test.ts test/architecture test/roster && npm run lint && npm run typecheck && npm run knip`
- threat: The boundary is a transcript holding message text. It trusts the path the caller names. Abuse: printing a
  conversation. Stopped by the reader returning numbers only; the security lens reviews it.

### x-metrics-content — the `ask:` line and the `metrics:` line

- id: x-metrics-content
- requirements: REQ-FLOW-183, REQ-CTX-019
- files: `content/commands/st-work.md`, `src/runs/overview.ts`, `test/corpus/commands/work.test.ts`, `test/runs/overview.test.ts`, and (S84, amended 2026-11-10, review/136 from x-recipe) the implementer's behaviour-unchanged sentence in `content/agents/stamity-implementer.md` with its pins in `test/corpus/agents/spine.test.ts`; and (S87) the reviewer's test row in `content/agents/stamity-reviewer.md` with its pins
- interfaces: `st-work.md` usage paragraph (`:331-332`): the orchestrator writes `- <UTC> ask: <phase|qa|close>
  asked=<UTC> answered=<UTC|none> questions=<n>` when an answer returns; the proof block carries `- <UTC> metrics:
  wall=<m> agent=<m> person=<m|unreported> rounds=<n> fixes=<n> reopened=<n|unreported> tokens=<n|unreported>
  cost=<usd|unreported>` from `stamity run metrics`, beside the leftovers line (`:334-335`). `overview.ts` "How"
  (`:196`) prints the same numbers. (Amended 2026-11-09, x-run-metrics review r2 note) The proof block's `metrics:` line names the tokens and cost scope as `run metrics` prints it (the transcript given, not sub-agents'; an estimate at list rates). (S84, amended 2026-11-10) A behaviour-preserving refactor whose invariants mix sources holds the union — unit 0's pins and every `Verified by` test path — and runs every command cell green before and after with its exit code; the orchestrator writes the `held:` and `no held tests` lines, never the builder; same words in the implementer's Testing rules and `/st-work`'s post-cut Build checks, pinned in both.
- testCriteria: the usage pins (`work.test.ts:1775,1792-1793,1814`) re-pinned with a reason; the overview prints the
  metrics line from a fixture; moved eval ranges re-pointed.
- edgeCases: a run that asked nothing writes no `ask:` line.
- depends_on: x-run-metrics, x-recipe
- verify: `npx vitest run test/corpus/commands/work.test.ts test/runs/overview.test.ts test/corpus test/evals test/ci/testInputsGuard.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip`
- threat: Flow text and a read-only view. Abuse: none reachable.

## Risks

- **Warning: COBOL and C/C++ sources kept in subfolders are missed** by root-only probing. Accepted: the report says
  what it read.
- **Warning: minutes are written by the agent's clock.** Mitigation: labelled as the run's clock, never as measured.
- **Minor: the bundled price table ages.** Mitigation: its access date prints; an unknown model reads `unreported`.

## Open questions

None.
