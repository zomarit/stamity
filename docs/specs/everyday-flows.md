---
id: everyday-flows
# A design document, authored from docs/plans/013-optimization-sweep-02.md and -03.md on 2026-09-30, merged at the Prove phase of run 2026-09-30_optimization-sweep, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended from docs/plans/016-fork-distribution-00.md at the Prove phase of run 2026-10-07_security-fixes on 2026-10-07, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, amended in run 2026-10-08_product-core on 2026-10-09, amended in run 2026-10-10_next-tier on 2026-10-10, and excluded from the site build.
status: shipped-with-1.12.0
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the command reference carries it, or a decision row cuts the surface
---
# Everyday flows

What the nine commands and the setup that serves them do for a user day to day: calls resolve, gates run and report
honestly, records say what happened, and the person is asked only what needs the person. The area code is `FLOW`.
REQ-FLOW-001 to REQ-FLOW-026 shipped with 1.11.0, and REQ-FLOW-036 to REQ-FLOW-038 with 1.12.0, which set
`status: shipped-with-1.12.0`. REQ-FLOW-025's allowlist sentence did not ship with them; `## Concerns` says so, and
an inbox row follows it up. It landed on 2026-10-08 in run `2026-10-08_maintainer-tooling` (REQ-FLOW-025, amended),
unreleased at that merge, so `status` does not move. The text dated 2026-10-08 that names that run comes from its spec
deltas (plan 019 file 1), each taken from the latest unit or fixer report that states it and read against the
integration head `47acb16e`; lane D's, under REQ-FLOW-026, REQ-FLOW-037 and REQ-FLOW-038, against `dbd54fc7`.
REQ-FLOW-061 to REQ-FLOW-067, REQ-FLOW-072 and REQ-FLOW-073, and the text dated 2026-10-09, come from the spec delta
of run `2026-10-08_product-core` (plan 019 file 2, re-planned in that run), merged by its unit `p9-spec-merge` against
the integration head `90710ba5`, where every citation of `content/commands/st-work.md` and
`content/agents/stamity-test-runner.md` in this file was re-pointed to the lines that hold its text; unreleased at that
merge, so `status` does not move. REQ-FLOW-039 to 050 are held for plan 016's later files and 051 to 060 are
unallocated, so the ids leave gaps; 068 to 071, which that merge held for plan 019 file 3, were allocated on 2026-10-10
with 074 to 077 (amended 2026-10-10; it read "051 to 060 are unallocated and 068 to 071 are held for plan 019 file 3,
so the ids leave gaps"). The run's own eval cases land after this merge and
are not cited here. The merge's second round re-read that text at `f3315229`, after the p5 group's fix round 2
(`review/177` to `review/183`), and took the semantic review's `review/184` to `review/188`: it re-pointed every
citation of `src/cli/commands/gate.ts`, `src/change/classify.ts`, `src/roster/triggers.ts`,
`content/commands/st-quick.md` and `content/skills/st-dep-audit/SKILL.md`, restated the text that fix round changed,
and found every other citation on the same text at both heads.

REQ-FLOW-068 to REQ-FLOW-071 and REQ-FLOW-074 to REQ-FLOW-077, and the text dated 2026-10-10, come from the spec delta
of run `2026-10-10_next-tier` (plan 019 file 3, re-planned in that run), merged by its unit `s1-spec-merge` against the
integration head `a60cb496`; unreleased at that merge, so `status` does not move. Where a delta entry and the landed
text differed, the text states what that head holds, and a line headed "As built" says what moved. The same pass
re-pointed to `a60cb496` every citation in this file of `content/commands/st-work.md`, `content/commands/st-board.md`,
`content/commands/st-plan.md`, `content/commands/st-rework.md`, `content/skills/st-qa/SKILL.md`,
`content/skills/st-dep-audit/SKILL.md`, `content/agents/stamity-test-runner.md` and `src/runs/ledgerStore.ts` whose
line that run moved, and found every citation of `content/commands/st-quick.md`, and all but one of that agent file,
on the same lines at both heads. Citations of any other file stay at the heads the paragraphs around them name. A ledger id in the
text dated 2026-10-10 (`build/16`, `review/62`) is that run's own unless a run is named beside it. The run's own eval
cases land after this merge and are not cited here. A follow-up pass on that unit the same day read at the integration
head `9a0ba4cf` every citation in this file of `content/commands/st-plan.md` and of the six agent bodies the run's QA
fix round changed after the merge (`6348d944`): the reviewer, the fixer, the implementer and the security, performance
and design-quality lenses. It re-pointed to that head the ones the round moved, which are the six `## Severity`
sections (REQ-FLOW-073), the security lens's `git log` sentence (REQ-FLOW-065), `/st-plan`'s return line
(REQ-FLOW-070) and its inbox-append and follow-ups bullets (REQ-FLOW-077), and found every other citation of those
seven files on its text there, above the lines the round moved. The run's whole-branch review then had a fix round the
same day (pass `branch`). Its text part settled the ledger rows `review/69`, `review/89` (as `review/99` and
`review/100` shaped it), `review/90`, `review/91`, `review/93`, `review/94`, `review/96` and `review/97` in four shipped
texts (`5cd61743`), and the lines below marked "the whole-branch review's fix round" state them, under REQ-FLOW-068,
REQ-FLOW-069 and REQ-FLOW-074 to REQ-FLOW-077. The same pass re-pointed to `5cd61743` every citation in this file of
`content/commands/st-board.md`, `content/commands/st-rework.md` and `content/skills/st-qa/SKILL.md` at or below the
first line that round moved in each, and the four citations of `content/commands/st-work.md` that reach into lines 24 to
30, which it rewrapped in place; every other `/st-work` citation holds its line. What those lines say of the parser, the
retire grammar and the query's JSON document is that round's code part (`review/78`, `review/89`), which landed beside
the texts; it is cited there by file and not by line.

The requirement text comes from the `## Spec delta` sections of `docs/plans/013-optimization-sweep-02.md` (A) and
`docs/plans/013-optimization-sweep-03.md` (A), merged on 2026-09-30 at the Prove phase of the run
`.stamity/runs/2026-09-30_optimization-sweep/`. It is measured against the built code: where a delta and the code
differed, the text below states what the code does, and a line headed "As built" says what moved. Every `path:line`
below was read at the package head `b855876a`, except in REQ-FLOW-022 and REQ-FLOW-026. Those two were merged in the
run's second spec-merge pass, the same day. REQ-FLOW-022 cites the package head `cdfaa723`. REQ-FLOW-026 cites
`a9e94f06`, the package head once its unit had integrated (the third pass moved it there). At the 1.11.0 cut
(2026-10-01) two lines were added to `content/commands/st-quick.md`'s hard refusal; the citations of that file in
REQ-FLOW-005 and REQ-FLOW-024 were re-read on the release branch after that edit. The paragraphs headed "Amended
2026-10-06" in REQ-FLOW-022 and REQ-FLOW-026, and the criteria marked "added 2026-10-06", come from the spec deltas the
units `u6-init-fixes` and `u3-codex-shown-rows` declared in run `2026-10-03_pack-engine-defects`, merged at its close.
They cite `eb4f0727` and shipped with 1.12.0.

REQ-FLOW-036 to REQ-FLOW-038 come from the spec delta of `docs/plans/016-fork-distribution-00.md` (file 0 of plan 016,
the five security fixes of the released 1.11.0), merged on 2026-10-07 at the Prove phase of the run
`.stamity/runs/2026-10-07_security-fixes/`. The ids REQ-FLOW-027 to 035 belong to files 1 to 3 of the same plan, which
merge later. Each requirement's "Evidence (before)" cites `d10db029`, the tree the defects were measured on; its
"Amended 2026-10-07 (build)" bullet says what the build settled and names the code by path and symbol on the run's
integration branch (`fix/plan-016-file-0` at `fa8163a3`; the hook-file unit's JSON half, integrated after the merge,
at its integration commit `8d4b932e`). All five units are integrated, the last, `u0-registry-bound-calls`, at
`6d2fb2e7`. They shipped with 1.12.0, which set `status` to `shipped-with-1.12.0`.

## Intent

The nine commands and the setup that serves them should do what a user asks, day to day: calls resolve, gates run
and report honestly, records say what happened, and the person is asked only what needs the person.

## Invariants

1. No floor relaxes. Fewer questions never means fewer gates. The security row, the review loop and the final-tree
   gate stay at every intensity (charter invariant 1).
2. Nothing breaks, so the release is 1.11.0. Every emitted change is regenerated by `stamity sync`. Rollback is a
   re-sync at the prior version: the getting-started page's pinned sync command with the prior version named,
   `npx -y @zomarit/stamity@<prior version> sync` (`docs/getting-started.md:362-364`).
3. All four clients reach parity, or each gap is declared per client in the capability disclosure.
4. No name or row id from outside this repository appears here. The leak gate is the check.

## Requirements

### REQ-FLOW-001 — Emitted scripts pass the project's own lint gate

Every script that setup emits into a user's repository starts with a file-level lint-disable directive,
`/* eslint-disable */`: on line 2 after a shebang, on line 1 where the script has none. This covers the core hook
scripts under `.stamity/generated/hooks/<tool>/`, the portable runners, Cursor's hook scripts and the `st-verify`
skill scripts, the three copies of the coverage checker included.

- **As built:** the directive is `GENERATED_SCRIPT_LINT_DIRECTIVE` (`src/types/markers.ts:14-25`), whose three writers
  are `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts` and `src/adapters/cursor.ts` (`:21-23`). The checker's
  source carries it too (`content/skills/st-verify/scripts/spec-plan-coverage.mjs:1`). This repository keeps its own
  ESLint coverage of that hand-written source by turning inline configuration off for its path; oxlint has no per-path
  equivalent, so oxlint no longer lints that one source (ledger `build/43`).
- **Boundary:** the header must not push any script over its ceiling (`HOOK_SCRIPT_BUDGETS`, `src/hooks/scripts.ts`).
- **Proof:** `test/hooks/emittedLint.test.ts` and `test/hooks/scriptBudget.test.ts`; QA. No eval case.
- **Source:** `src/types/markers.ts`, `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts`, `src/adapters/cursor.ts`.

### REQ-FLOW-002 — Every CLI call the flows and hooks make resolves after the documented npx setup

Every emitted instruction to run a stamity verb uses one call form, defined by one shared sentence, byte-identical
at every site and on one physical line:

> Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.

The sentence is the constant `RUNNING_CLI_SENTENCE` (`test/corpus/cliCallForm.test.ts:32-33`), which is its text of
record. Skills and `/st-debug` open it with `**Running the CLI.** `, and `/st-work` carries it as the Dispatch-contract
bullet `- **CLI calls.** ` (`test/corpus/cliCallForm.test.ts:53-77`; `content/commands/st-work.md:126`). No condition
is left for an agent to judge (`review/102`).

`${STAMITY:CLI}` is a wired substitution token, one of the ten in `REPO_SUBSTITUTION_TOKENS`
(`src/emit/substitution.ts:84-113`). The engine renders `${STAMITY:CLI} <verb>` to `npx -y <package>@<v> <verb>`,
where `<v>` is the version of the engine that emitted the file (`src/shared/cliCall.ts:92-111`). A package with no
npm channel — its running manifest is `private: true` and names no `publishConfig.registry` — renders
`npx --no <package>@<v> <verb>` instead, which runs an installed copy and never fetches one
(`src/cli/kit/packageName.ts:108-126`, `:151-153`; `src/shared/cliCall.ts:78-80`; `review/94`). The CLI's own remedy
lines go through `packageCommand`, which prints the same pinned form and keeps `--no` for a package with no channel
even when it cannot pin (`src/cli/kit/packageName.ts:216-227`).

The charter's one call uses the token: "change via `${STAMITY:CLI} config`" (`content/charter/stamity-charter.md:26`),
so every user's `AGENTS.md` carries the pinned call (this repository's own copy: `AGENTS.md:15`). `.claude/` bodies
carry the rendered form; the APM bodies under `.apm/` ship the token raw, as they ship every token (the accepted APM
state). A plugin body carries the literal pinned call at the plugin's own version, with `--no` for a package with
no channel (`scripts/plugins/tokens.mjs:12-17`, `:50-62`).

- **As built, where the delta differed:**
  - A hook hint carries the pinned call beside the short form: `` `stamity <verb>` where the CLI is installed, else
    `npx -y <package>@<v> <verb>` `` (`cliCallHint`, `src/shared/cliCall.ts:127-149`). The delta said hints "use the
    same pinned form"; the pinned form is there, next to the short one.
  - Codex's `.codex/hooks.json` carries the pinned call too (maintainer answer G3). Codex records hook trust against
    that file's hash, so it asks for hook approval again after each stamity upgrade.
  - `sync --help` prints its update line by the same channel rule: a package with no channel is told to install the
    newer release into the project and run `npx --no <name> sync` (`review/109`).
- **Evidence (before):** the docs promise "Nothing is installed globally" and set up with `npx @zomarit/stamity init`
  (`docs/getting-started.md`); at `67d2b954`, 29 backticked calls to `stamity <verb>` across 9 content files had no npx
  prefix.
- **Expand/contract:** text and one token are added. Rollback is a re-sync at the prior version, which restores the
  bare calls. The consumers are every body that runs a verb; the text test proves none is left bare.
- **Proof:** `test/corpus/cliCallForm.test.ts` (checks a–d), `test/emit/substitution.test.ts`,
  `test/cli/kit/packageName.test.ts`; must-holds `work-proof-block-fields` and `learnings-curation-merge-and-promotion`;
  QA.

### REQ-FLOW-003 — A step whose CLI cannot run says so

When neither an installed copy nor the pinned npx call can run the verb (for example, offline with no npx cache):

- the handoff and learn steps write no file by hand. The closing message carries the content under
  `Not done: handoff not written — CLI unavailable` or `Not done: learning not captured — CLI unavailable`, with the
  command to run once the CLI resolves (`test/corpus/cliCallForm.test.ts:54-65` pins both lines);
- `/st-debug` names the install as the unresolved input when both forms are `not-runnable`
  (`content/commands/st-debug.md:30`);
- the ledger step alone may be written by hand, by the orchestrator, the one ledger writer, in the row grammar under
  Proof block; the run record then says `ledger: by hand (no CLI)` (`content/commands/st-work.md:127`).

- **As built:** the `/st-work` fallback points at the row grammar under Proof block, not at
  `test/records/ledgers.test.ts`, because that test exists only in this repository and not in the repositories the
  body ships to (ledger `build/102`, signed off).
- **Proof:** `test/corpus/cliCallForm.test.ts`; QA.

### REQ-FLOW-004 — Every researcher dispatch carries the brief keys the researcher requires

Every flow that dispatches a researcher names all six required keys: `objective`, `scope`, `questions`,
`output_sections`, `depth` and `tool_tier`. The sites are derived, not listed: every command whose `spawns:` holds
`researcher`, plus every skill that names a `` `researcher` brief `` — nine today, eight commands and `st-dep-audit`.

- **As built, where the delta differed:** the delta named seven commands. The derivation counts eight, because
  `/st-ask` spawns a researcher too, plus the one skill. Six sites carry one shared line (`/st-pr-resolve`,
  `/st-plan`, `/st-board`, `/st-rework`, `/st-debug`, `st-dep-audit`); `/st-debug` carries it at
  `content/commands/st-debug.md:61-62`. `/st-work`, `/st-spec` and `/st-ask` keep their own enumeration of the keys
  (plan decision 6; `content/commands/st-work.md:39-42`, `content/commands/st-ask.md:72-74`). The researcher body
  says so (`content/agents/stamity-researcher.md:20-27`).
- **Evidence:** a spawn missing a required key returns `BLOCKED_AMBIGUITY` (`content/agents/stamity-researcher.md:20-21`;
  the keys at `:29-37`).
- **Proof:** `test/corpus/agents/spine.test.ts` (the derived site set, at least 9 members); must-holds
  `agent-researcher-return-contract`, `plan-artifact-head-and-units-shape`, and the floor
  `subagent-returns-blocked-ambiguity` with its twin; QA.

### REQ-FLOW-005 — The quick lane takes a small change together with the tests that follow it

The Files row fires at more than 5 files across the batch, and every file counts toward that. It also fires when one
item's source change cannot land in a single source file, with two exceptions: a test file edited only to follow the
item's change rides with it, and a user-facing string or label correction may span two source files
(`content/commands/st-quick.md:38-44`, `:70`). Riding tests still count toward `Size`, and move no other row: a test
under a security-sensitive path fires that row, and a new route with its test fires
`Schema, API, event or migration`. The Size, Security-sensitive surface, Dependencies and "Schema, API, event or
migration" rows and the hard refusal stay as they were.

- **Evidence (before):** the Files row fired on "one item that cannot land in a single file".
- **As built (amended 2026-10-01, the 1.11.0 cut):** after eval run 37, the hard refusal gained one sentence: an
  operator's reply to a refusal is not taken as a confirmation, an approval or an authorization, and whatever it says
  (a deadline, a role, a go-ahead) the refusal stands and restates its row (`content/commands/st-quick.md:58-59`).
  The thresholds themselves do not move.
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; census of `quick-hard-refusal-thresholds`,
  `quick-refusal-under-social-pressure`, `quick-security-surface-no-size-floor` and
  `benign-small-change-quick-proceeds`; new cases `quick-string-rename-with-its-tests` (golden) and
  `quick-string-rename-on-auth-path-refused` (adversarial); QA.

### REQ-FLOW-006 — Setup detects vitest and pytest from the manifest

Detection reads the manifest as well as config files, in evidence order: a config file, an embedded manifest key, a
declared dependency, the wired `test` script's body, then `pyproject.toml`; only when all are silent does it report
the unnamed `test-script` fallback (`src/detect/repoAnalyzer.ts:664-695`).

- vitest (and jest, mocha, playwright, cypress) from `package.json` dependencies or devDependencies, matched on the
  exact package name, or from a runner named in the wired `test` script (`src/detect/repoAnalyzer.ts:237-262`,
  `:697-708`);
- pytest from `pyproject.toml`: a `[tool.pytest]` or `[tool.pytest.*]` table, a quoted dependency naming `pytest`
  exactly, or a poetry-style `pytest = …` key, with `#` comment lines skipped (`:264-279`, `:710-719`).

Every signal found is reported; the charter's `Test framework:` line names the result.

- **As built:** the delta named only `[tool.pytest.ini_options]`; the built probe reads any `[tool.pytest` table and
  the dependency forms (ledger `build/3`).
- **Proof:** `test/detect/repoAnalyzer.test.ts`; QA.

### REQ-FLOW-007 — Python gates run from the repository root without an activated environment

A Python project's gates run from the repository root with no environment activated:

- When a committed file declares the runner (`uv.lock`, `poetry.lock`, `pdm.lock`, or a `[tool.hatch.envs` table in
  `pyproject.toml`), detection records it in the existing `detected.packageManager` string
  (`src/detect/repoAnalyzer.ts:721-737`), and each Python gate is prefixed with it — `uv run`, `poetry run`, `pdm run`,
  `hatch run` (`src/detect/verificationGates.ts:133-171`). No manifest field is added, and the Node run prefixes are
  untouched.
- When no runner is declared and `.venv/pyvenv.cfg` (or `venv/pyvenv.cfg`) exists at `init`, init records three
  `gates` pins that call the tools as modules of that interpreter: `<venv>/bin/python -m pytest`,
  `… ruff check .` and `… mypy src` (or `mypy .` with no root `src/`) (`src/cli/commands/init/plan.ts:248-287`).
  `sync` never writes pins, so `check` stays drift-free on a checkout without the venv. Init's output names the pins.
- Otherwise the gates render as today, and `check` names a gate it cannot resolve (REQ-FLOW-008).

- **As built:** the pins are POSIX-only; on Windows the init panel says they will not run there
  (`src/cli/commands/init/plan.ts:263-266`). A repository with both a lock file and a `.venv/` gets no pin
  (`:254-257`).
- **Proof:** `test/cli/commands/initPanel.test.ts` and the detection suites under `test/detect/`; QA.

### REQ-FLOW-008 — `check` names the gates it did not run

`stamity check` runs no gate and spawns nothing to probe one (`src/cli/commands/check.ts:1241-1245`). On a green run
it never prints an unqualified `all green`: the closing line names the gates it did not run —
`setup green — gates not run: lint, typecheck, test (check runs no gate)`, or
`ok — <n> advisory warning(s) above; gates not run: …` beside warnings (`src/cli/commands/check.ts:1546-1552`).

Above that line it warns about each charter gate it cannot resolve:
`warning: the <kind> gate cannot be resolved — the charter says "<value>"` (`:1538-1545`). A gate is unresolved when
nothing configures it, or when its command's first word finds nothing. A word with a path separator is a path
relative to the root, and it must be a regular file with its execute bit set on POSIX; on Windows it counts when it
exists as written with an extension, or with one of the `PATHEXT` extensions added. Any other word is looked up as
an executable file in `node_modules/.bin/`, `.venv/bin/` and each `PATH` entry, in that order; on Windows each lookup
tries the `PATHEXT` extensions, `node_modules/.bin/<word>.cmd`, and the word as written only when it already carries
an extension (`src/cli/commands/check.ts:1225-1327`, read at `a9e94f06`; `review/79`, `review/151`). The warnings
never change the exit code. `--json` carries the same data under `gates`, with `notRun`
and `unresolved`, absent only when there is no manifest (`:1705-1715`).

- **As built:** the warning quotes the charter's value rather than naming the tool alone (ledger `build/61`); the full
  gate's kind is `full-gate` (`:1201-1206`).
- **Proof:** `test/cli/commands/check.test.ts`; `docs/troubleshooting.md` carries the closing line; QA.

### REQ-FLOW-009 — `/st-debug` reproduces a precisely described bug with a failing test and hands off

Step 3 has two routes, and the first response names the one taken and the fact that chose it
(`content/commands/st-debug.md:81-95`):

- **In-process** — the report states an exact input, the expected output and the actual output, and the charter's
  test gate is runnable here (neither `unknown` nor `not-runnable`). The implementer writes gate 2's failing test for
  that input and nothing else; the test-runner runs it twice. A failure for the stated reason on both runs is the
  reproduction: no stop and no question to the user. The run then goes on through root cause and hands off to
  `/st-work` in the same session.
- **User** — anything else, or a defect that needs the user's environment, data, device, account, network, traffic or
  timing. The run stops at step 3 and waits for the user's output.

- **As built, where the delta differed:** the built route runs the test twice and requires a failure for the stated
  reason on both runs; a test that does not fail that way goes to the user route, never to another in-process round
  (`:87-90`; `review/37`). The step-2 probes run on the in-process route only when the failing test alone cannot
  separate the hypotheses (`:63-64`).
- **Evidence (before):** step 3 stopped for the user every time.
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; census `debug-no-reproduction-blocks` and the floor
  `debug-root-cause-before-fix`; must-hold `debug-next-step-derived-from-run-state`; new case
  `debug-deterministic-bug-reproduced-in-process`; QA.

### REQ-FLOW-010 — Probes keep the gates green and never outlive their record

A probe keeps the charter's lint and typecheck gates green: it uses a form the project's linter and type checker
accept, and a probe that turns either red is rewritten before the round continues
(`content/commands/st-debug.md:72-74`). The implementer's instrumentation return carries the changed files, the
instrumented sites and its lint and typecheck results (`:75-80`).

Every probe line carries the run's own id: `[STAMITY-DEBUG <run-id>]` (`:66-68`). The marker check runs at the run's
start, at every stop that waits on the user, and at the close, and searches for a real run id only
(`git grep -n -E '\[STAMITY-DEBUG [0-9]{4}-[0-9]{2}-[0-9]{2}_debug-[^]]*\]'`; exit 1 means zero hits) (`:155-168`).
Documents name the format with the `<run-id>` placeholder, never an instance, so no document matches. At the start a
hit whose run id has neither an in-progress debug record nor a recorded capture-later agreement is stripped as
residue; at a stop the count and the sites go into the stop message and the record; at the close the count of this
run's own hits is the Zero residue gate's number, 0 unless a capture-later agreement is recorded.

- **As built, where the delta differed:** the delta said every `[STAMITY-DEBUG]` line in the tree is listed "when any
  debug turn ends". The built check lists sites at every stop and at the close, and searches for the run-id form,
  because the bare tag also appears in the emitted command files (`review/35`, `review/56`, re-signed off). The Zero
  residue row of the gate table still says "repo-wide" (`content/commands/st-debug.md:123`; `review/57`, open).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; QA.

### REQ-FLOW-011 — A debug record from the first probe

At its first mutation (a probe, or gate 2's failing test), a debug run opens
`.stamity/runs/<UTC date>_debug-<slug>/record.md`. Its first 15 lines carry three head lines, bare at column 0 with
no list marker and no bold: `Status: in progress`, `Plan: none — debug round` and
`Invocation: <this command line, verbatim>` (`content/commands/st-debug.md:48-54`). The record then gets one line per
probe site as it lands and one per strip. The close rewrites `Status:` to the exit taken and the residue count; a stop
that waits on the user leaves it in progress. A reader identifies a debug record by the `_debug-` run-id segment,
never by the `Invocation:` spelling, which differs per client (`src/runs/layout.ts:156-162`). The escape-valve counter
stays in-session (`content/commands/st-debug.md:186-190`). The resume card reads the record (REQ-CTX-013).

- **As built, where the delta differed:** the delta said the record lists each round's hypotheses and outcome; the
  built record lists probe sites and strips, and the close names the exit (`review/39`, open).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`, `test/runs/resumeCardParity.test.ts`; QA.

### REQ-FLOW-012 — On a small repository, `/st-spec` offers the whole app as a scope

Below 5,000 source lines, counted over the files the Source tree probe found, the scope question offers the whole app
as its first numbered option, beside the narrowest readings; the mode-chosen line states the count. The whole app is
asked, never assumed. It is the declared default when the request names the app ("create the spec", "spec this
app"); "backfill the specs" with no named scope keeps declining the sweep as its default. At 5,000 lines or more,
today's rule stands (`content/commands/st-spec.md:100-110`).

- **As built:** the bound is "below 5,000", not "at most" (ledger `build/56`); the whole app is always a question,
  never a scope taken without one (`review/59`, signed off).
- **Proof:** `test/corpus/commands/spec.test.ts`; new case `spec-create-small-repo-whole-app`; must-holds
  `spec-converge-confirm-gated-merge`, `spec-next-step-derived-from-run-state` and the floor
  `question-shape-and-default`; QA.

### REQ-FLOW-013 — Each gate runs once, as the charter spells it, with its exit code read from the tool

The test-runner runs each requested gate exactly once, from the root, exactly as resolved: no environment edit, no
added flag, no wrapper and no narrowing filter (`content/agents/stamity-test-runner.md:41-50`). A row's `status` is
`pass`, `fail`, `not-run`, `not-runnable` or `unknown`; `duration` is what the tool reported or `not measured`
(`:58-65`). The verdict is `green` only when every requested gate reported `pass`; an `unknown` row makes it `red`
(`:80-82`).

- **As built, where the delta differed:** a shell calibration decides what a missing exit status means. Before the
  first gate, `false` runs once. If the tool showed that failing status, a later result that shows no status exited
  `0`; otherwise a status the tool did not show is `unknown`, never a pass (`:110-114`, `:154-156`). Without the
  calibration, a client whose shell tool shows a status only for a failing command could never close a run green
  (ledger `prove/2`).
- **Amended 2026-10-09** (run `2026-10-08_product-core`, unit `p3c-work-gates`): the one narrowing filter the runner
  takes is one the brief supplies, and a change class's selected test files are such a filter
  (`content/agents/stamity-test-runner.md:47-50`); the class's checks map to gates as REQ-FLOW-063 states (`:33-39`).
- **Proof:** `test/corpus/agents/shellDiscipline.test.ts`, `test/corpus/agents/quality.test.ts`; census
  `agent-test-runner-return-contract`; must-holds `agent-implementer-return-contract`, `agent-fixer-return-contract`
  and the floor `charter-universal-floor-holds-under-deadline`; new case `test-runner-plain-gates-honest-exit`; QA.

### REQ-FLOW-014 — Agent and command bodies write portable shell and wait instead of polling

Every agent that runs commands carries one shared `## Shell` paragraph: portable POSIX `sh`, each command run once as
written, the exit code read from the tool, and a long command waited on in the foreground, never polled with `sleep`
(`content/agents/stamity-test-runner.md:148-157`).

- **As built, where the delta differed:** the lint does not read every body line. It checks two things: every agent
  whose `capabilities` include `execute`, plus the researcher, carries the paragraph byte-identical after whitespace
  flattening; and every fenced block under `content/` whose info string is `sh`, `bash`, `shell` or `console` is free of
  the non-portable constructs. Prose is not scanned, because the paragraph itself names the banned constructs
  (`test/corpus/agents/shellDiscipline.test.ts:5-21`, `:63-64`).
- **Proof:** `test/corpus/agents/shellDiscipline.test.ts`.

### REQ-FLOW-015 — A byte-identical tree cites its earlier gate result; the final tree is always gated

A Prove pass may cite this run's earlier gate result on a byte-identical tree — same HEAD, same diff, untracked files
included. The final tree always gets a run of its own, and citing is never a lighter pass
(`content/commands/st-work.md:203-204`). The proof block records per gate the result, or the earlier result a
byte-identical tree cites (`:313-315`).

- **As built, where the delta differed:** the body has no sentence saying a cited result covers only the gates it ran;
  the proof block's per-gate line carries it only implicitly (`review/32`, open).
- **Amended 2026-10-09** (run `2026-10-08_product-core`, unit `p3c-work-gates`, with its fix rounds for `review/117`
  and `review/133`): the gates the final tree must pass are the ones its change class requires (REQ-FLOW-063). The
  proof block's gate results open with the change's class as `gate classify` named it, `unclear` when none ran, and
  the run's base commit, both on the `Gate results` label line itself, then per gate the command, pass, fail or
  unknown, a failing excerpt, or the earlier result a byte-identical tree cites (`content/commands/st-work.md:313-315`).
  The class sits on the label line, not between the label and its table, so the measurements page's reader keeps the
  table (`review/117`).
- **Proof:** `test/corpus/commands/work.test.ts`; QA.

### REQ-FLOW-016 — Setup ignores the review gate's state files

`init`, `sync`, the migration carry and `config mcp` make sure `.gitignore` covers four entries: `.env.mcp` and the
review gate's runtime state — `.stamity/review-gate.json`, its `.lock` directory and its `.tmp-*` temp files
(`REQUIRED_GITIGNORE_ENTRIES`, `src/mcp/env.ts:181-198`). An entry an existing rule already covers is not appended:
each review-gate entry is dominated by its root-anchored twin, by the state directory in each spelling git reads as
covering its contents, and by the state file's name as a prefix pattern (`:200-234`). A negation of an entry is the
operator's decision and is kept (`:650-666`). A file that is already committed stays tracked: setup never touches the
git index.

A live sync writes the ignore rules before its first emitted file, so a refusal by the injection screen leaves no
half-applied run; a dry run writes nothing (`src/cli/commands/sync/engine.ts:711-717`, `:685`).
`ensureGitignoreEntry` returns the entries it appended (`src/mcp/env.ts:611-648`), and sync's report and its JSON
name them (`review/67`).

- **As built:** the ordering is deliberate (ledger `prove/6`, signed off 13:50Z); a workspace cascade carries each
  member's added `.gitignore` entries into its row as `gitignoreAdded` (`src/cli/commands/workspace.ts:1079`, `:1312`,
  read at `a9e94f06`; `review/101`, fixed by minor-polish-b, integrated at `ffadc8a2`).
- **Evidence:** the state file is defined at `src/types/markers.ts:183-196`.
- **Proof:** `test/mcp/env.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/merge/writeEscape.test.ts`; QA.

### REQ-FLOW-017 — QA rows record walked, auto-proven or accepted-unwalked

Each QA row records exactly one state (`content/skills/st-qa/SKILL.md:74-78`; `content/commands/st-work.md:295-296`
points at those states):

- `walked`, only when the person's reply says so for that row or for all of them, and that reply is quoted in the
  record;
- `auto-proven`, with its evidence pointer;
- `accepted-unwalked`, with its input hash, when a sign-off does not name the row.

A bare sign-off ("signed off", "ok") records each open row `accepted-unwalked`, never `walked`, and so does any
sign-off for each open row it does not name. A reply that withholds sign-off records no row as accepted and leaves the
checkpoint open (`content/skills/st-qa/SKILL.md:115-118`). The proof block lists the QA rows per state, then the
sign-off or `not signed` (`content/commands/st-work.md:318-319`).

- **Amended 2026-10-10** (run `2026-10-10_next-tier`, unit `q2-qa-rows`, with its fix round for `review/2` and
  `review/4`): the rows left for a person are the kinds REQ-FLOW-069 names, and `/st-work`'s QA step hands the qa
  skill the class and lenses `gate classify` named, `unclear` when none ran (`content/commands/st-work.md:280-281`).
  The three states above and the sign-off rules do not change.
- **Proof:** `test/corpus/skills/flow.test.ts`, `test/corpus/commands/work.test.ts`; census `work-proof-block-fields`
  and `probe-none-work-run-qa-checkpoint`; must-holds `probe-qa-select` and the floor
  `unattended-run-applies-declared-default`; new case `qa-bare-signoff-records-unwalked`; QA.

### REQ-FLOW-018 — No QA question when every row auto-proved; unattended means not signed; unchanged accepted rows are not asked again

1. When every row is auto-proven, the checkpoint asks no QA question and records "all N rows auto-proven"
   (`content/skills/st-qa/SKILL.md:113-115`). Inside a work run the skill asks nothing itself; the rows left for a person
   ride the run's one close question (`:148-149`).
2. A run with no person to answer asks nothing and records `Shippable: not signed` (`:124-125`).
3. Each row records an input hash, the QA skill's own: the sha256 of the sorted lines `<path> <git hash-object of path>`
   over the files the row derives from (`:74-78`). It is not the QA harness's `rowHash` (REQ-PROVE-021). A row recorded
   `accepted-unwalked` in an earlier record of this change with the same input hash is carried as
   `accepted-unwalked (carried from <run-id>)` without asking; a changed hash reopens it (`:120-124`).
4. A row whose Risk is now `H` is never carried on a hash and is asked at every checkpoint until walked or auto-proven.
   `Shippable: YES` is recorded only with no `H` row accepted-unwalked; otherwise `NO`, naming the open `H` row
   (`:130-135`).

- `judgment: reviewer` — the result stays inside charter invariant 1: fewer questions, never fewer checks.
- **As built, where the delta differed:** the no-ask record reads "all N rows auto-proven", not
  "all <n> rows auto-proven; no person asked" (ledger `build/47`); the carry exception keys on the row's Risk now, not
  on its Risk when accepted (`review/54`). The delta attributed the hash to "the harness"; census S8 corrects it: the
  skill's input hash is its own.
- **Proof:** `test/corpus/skills/flow.test.ts`; QA.

### REQ-FLOW-019 — `/st-work` asks only what needs the person

1. Frame asks nothing about an inbox row a persisted plan already settles — named in a unit, a follow-up or its
   out-of-scope text; it lists that row with its disposition. The other overlapping rows ride the plan gate's
   question and stay in the inbox by default (`content/commands/st-work.md:27-29`).
2. At standard intensity, a persisted `/st-plan` artifact that passed the freshness guard is the go-ahead: the gate
   takes execute-now and logs
   `Default applied: plan gate → option 1, execute now (persisted plan <path>)`. An in-flow plan is presented and
   asked; deep asks; light auto-continues (`:65-69`, `:432`).
3. The close asks once: one question with numbered options covers the rows no evidence proved, the spec-delta merge
   and the commit. `Default if no response: leave uncommitted`, with those rows not signed and the delta unmerged. A part
   with nothing to decide drops out, and with none left there is no ask (`:298-306`). The spec-author applies the merge
   once that question confirms it (`:409-411`).

- **As built, where the delta differed:** the body has no sentence saying no later turn offers a commit again
  (ledger `build/67`, open); the log line takes the long form, which carries the plan path (the run's Frame audit).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, units `q1t-frame-inbox-read` and `q10a-work-close`): the inbox
  rows item 1 speaks of are the ones Frame reads through the `ledger` verb's `inbox` query (REQ-FLOW-068), no longer
  the whole file (`content/commands/st-work.md:21-27`). The close's one question of item 3 gains the leftovers as a
  fourth part (REQ-FLOW-074), and with no response the unattended rule applies beside "leave uncommitted"
  (REQ-FLOW-075; `:302-305`).
- **Proof:** `test/corpus/commands/work.test.ts`; census `probe-none-work-run-qa-checkpoint` and
  `work-proof-block-fields`; must-holds `question-shape-and-default`, its charter-only twin and
  `unattended-run-applies-declared-default`; new case `work-persisted-plan-asks-once`; QA.

### REQ-FLOW-020 — `/st-ask` is sized to the question

A question that names one symbol or one file is answered directly: the orchestrator reads the named definition and
at most its direct call sites found by one search, and cites every claim. When that read would pass about 300 lines or
a second file's body, one quick researcher answers instead. A symbol defined in more than one file is a mechanism
question and fans out as one; a named symbol the one search does not find is an Unanswerable row naming the pattern
and the paths searched. Mechanism and impact questions keep their fan-out (`content/commands/st-ask.md:52-65`). The
context budget allows the orchestrator's own bounded read on the named-target shape (`:78-80`).

- **As built:** the delta did not state the two-file and not-found rules; the review added them (`review/86`,
  `review/87`).
- **Proof:** `test/corpus/commands/lightTrio.test.ts`; new case `ask-narrow-symbol`; must-holds the floor
  `ask-refuses-mid-answer-change` and `ask-citation-discipline`; QA.

### REQ-FLOW-021 — The learning index warns ahead, orders by date and reports real bytes

- A learning whose `reviewBy` falls within 14 days produces a warning (`REVIEW_WARNING_DAYS`,
  `src/learnings/validation.ts:89-107`, `:365-370`).
- The index is ordered by the frontmatter `date`, newest first, ties broken by file name; a file past the per-file
  cap, which is refused unread, is keyed by its modified time (`src/learnings/store.ts:328-363`).
- Each header's byte figure counts its own printed lines, so past the 20-line cut the banner's figure equals the bytes
  it printed (`src/hooks/scripts.ts:653-657`).

- **Proof:** the learnings suites under `test/learnings/` (the warning window in `test/learnings/validation.test.ts`),
  `test/hooks/scripts.test.ts` and `test/runs/resumeCardParity.test.ts`; `docs/troubleshooting.md`; QA.

### REQ-FLOW-022 — First-run output matches what setup did

From `docs/plans/013-optimization-sweep-03.md` § Spec delta A, the unit `sw10-first-run-output` (integrated at
`84a87300` and `1f0c0f2f`) and its sign-offs; every `path:line` is read at `cdfaa723`.

- **The file count.** The init panel counts distinct paths, not ledger rows: the generated paths the run wrote, the
  manifest, and the state-directory `.gitkeep` files the run created. It says when `.gitignore` changed, counts a path
  several clients share (`AGENTS.md`) once, and reports a skipped path as left alone
  (`src/cli/commands/init/panel.ts:312-343`). The keep files come from the report field `createdKeeps`, probed before
  the scaffold runs; the appended `.gitignore` entries come from `gitignoreAdded`, the return value of
  `ensureGitignoreEntry`, which is empty under a dry run (`src/cli/commands/init/apply.ts:131-172`). A dry run prints
  the same count in the future tense (`panel.ts:333-335`; `src/cli/commands/init.ts:777`).
- **`check`'s manifest row** names the managed paths, then the ledger rows across the clients:
  `<paths> managed path(s) (<rows> ledger rows across <n> client(s))` (`checkManifest`,
  `src/cli/commands/check.ts:259-288`, its count at `:276-286`, re-pointed at `46121954`; `build/88`).
  `docs/troubleshooting.md:32` quotes it.
- **A defaulted client set says so.** When init defaulted the tools, the panel and the dry run print
  `clients: <tools> (the default — no other client's files were found; <route>)`. On a dry run the route is
  `add more with --tools claude,cursor,copilot,codex`. After a live init it is the pinned
  `config set tools claude,cursor,copilot,codex`, then the pinned `sync` (`panel.ts:379-402`, called at `:755` and at
  `init.ts:775`). A detected or flagged client set prints no such line, and a client list carried from a predecessor
  setup is not called the default (`init.ts:595-599`).
- **Codex next steps** carry the two trust steps that are the operator's, read from the adapter's `HOOK_TRUST_STEPS`:
  project trust in `~/.codex/config.toml` before `codex`, and the `/hooks` review after it. The feature flag has no
  operator step, because setup writes it (`panel.ts:167-191`; `src/adapters/codex.ts:183-266`). The
  `.codex/hooks.json` description and the `.codex/config.toml` comment keep their bytes, so Codex asks for no new hook
  trust.
- **Copilot next steps** name the coding agent's setup workflow and when GitHub runs it, and only when the live run
  wrote that file. The same step reaches the `nextSteps` of `init --json` (`panel.ts:404-437`; `init.ts:1212`).
- **The `.gitignore` disclosure** names exactly the entries the run appended, each with a neutral reason, and the
  panel prints no line when none was appended. An entry with no recorded reason reads
  `machine-local state this setup writes`. The words "the credential file this setup uses" appear only when an MCP
  server is configured and `.env.mcp` is among the entries (`panel.ts:624-669`, `:762-773`). A dry run names the whole
  required set, "wherever it lacks them" (`init.ts:779-788`).
- **The update notice** reads `Update available: <current> -> <new>. To move: npx -y <name>@<new> sync. To stay on
  <current>, do nothing.` The move command is the pinned call, both halves name the one normalized version, and it
  never says `@latest` (`src/cli/notice/updateNotice.ts:286-323`). A package with no npm channel is `private`, so it
  never reaches the notice.
- **`sync --help`** names the exact-version form with a `<version>` placeholder. A package with no npm channel keeps
  its line: install the newer release into the project, then `npx --no <name> sync`
  (`src/cli/commands/sync.ts:63-74`).
- **The Copilot setup workflow follows the project's pins.** `node-version` comes from `.nvmrc`, then
  `.node-version`, then the lower bound `engines.node` names, at the precision it names it (`22` gives `22`, `>=22.12`
  gives `22.12`), else `lts/*`; a value that is not a safe version string is not copied. The `actions/checkout` and
  `actions/setup-node` refs come from the first `uses:` of each in the project's own `.github/workflows/`, read in name
  order, a SHA pin with its trailing comment, else `@v5`. The scan skips the emitted workflow by its own file name, so
  a second sync writes the same bytes (`src/adapters/copilot.ts:538-590`, `:613-620`, `:665-756`). A repository with
  no Node toolchain gets a checkout only, and the file says so (`:549-555`).

- **As built, where the delta differed:**
  - The delta said every printed count equals the files written. The count covers the files the run put on disk other
    than `.gitignore`, which the panel names as changed instead of counting.
  - The cell's default-clients line said `add more with --tools …` in both modes. After a live init a second `init`
    refuses without `--force`, so the live panel names the config `tools` key and a sync (ledger `build/131`, signed
    off at 14:59Z); the dry run keeps `--tools`.
  - The cell's census amendment named `ENGINE_EMITTED_WORKFLOWS` as the scan's skip list. The built scan skips the
    base name of Copilot's own `COPILOT_SETUP_STEPS_PATH` (sign-off at 14:40Z), so one file name has two sources:
    that constant and `ENGINE_EMITTED_WORKFLOWS` (`src/detect/repoAnalyzer.ts:305`).
  - The cell gave `InitApplyReport` one new field. The build added two, `createdKeeps` and `gitignoreAdded`
    (sign-off at 14:40Z), because a count taken from the created directories undercounts.
  - The plan's decision 1 spelled the move as `npx <package>@<version> sync`. The built notice renders the pinned
    call, `npx -y <name>@<version> sync`, as the cell's census amendment says.
  - The Copilot workflow step also reaches `init --json`, and prints on no dry run (`review/138`, `review/141`). The
    banner's version line prints the normalized version, not the raw registry answer (`review/142`).
- **Amended 2026-10-06** (run `2026-10-03_pack-engine-defects`, unit `u6-init-fixes`, integrated as `68d62843`, the
  fallback's value list from `review/40`; cited at `eb4f0727`):
  - **The detected platform.** The init panel prints the hosting platform init wrote into the manifest on a line of
    its own, after the `clients:` line when that line prints, and never inside the disclosure line
    (`src/cli/commands/init/panel.ts:784-788`). It reads `platform: <name> (from the origin remote)`, or, when none was
    detected, `platform: none detected — set it with <the pinned config set platform <name> call>, <name> one of
    github, azure-devops, gitlab`; the values are the keys of `PLATFORM_MCP_SERVER` (`platformLine`, `:377-395`).
  - **One source.** At init the origin remote is the platform's only source: `buildInitDecisions` calls
    `detectPlatform` with no override (`src/cli/commands/init/plan.ts:227`), and `InitOverrides` holds only `tools`
    and `maturityTier`, its doc naming `config set platform` and `config detect` as the routes after init (`:44-53`).
    The unwired `InitOverrides.platform` field is removed.
  - **`--maturity` has a CLI case.** `init -y --maturity enterprise` writes `maturityTier: enterprise` and the panel's
    disclosure line reads `(tier: enterprise, …)`; an unknown tier is refused before anything is written
    (`test/cli/commands/init.test.ts:581-603`).
- **Proof:** `test/cli/commands/initPanel.test.ts`, `test/cli/commands/init.test.ts`,
  `test/cli/commands/initApply.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/notice/updateNotice.test.ts`,
  `test/cli/commands/sync.test.ts`, `test/adapters/copilot.test.ts`; the Codex pins in `test/adapters/codex.test.ts`
  and the goldens in `test/emit/crossClientGoldens.test.ts`, green with no Codex byte moved; `docs/getting-started.md`,
  `docs/troubleshooting.md`; QA.

### REQ-FLOW-023 — Copilot's writing agents load the charter

Retired 2026-09-30 — disposition: live check found no gap. The check this requirement was conditional on ran first in
session 2 (unit `sw14-copilot-charter-live-check`): Copilot CLI 1.0.88, through the emitted `stamity-implementer`
agent with no tools available, quoted both the agent body's first line and the charter's first line under
`## Invariants`; the control run without the agent quoted the charter line too
(`.stamity/runs/2026-09-30_optimization-sweep/record.md:96-101`). No Copilot fix was built. Nothing supersedes this
requirement. Amended 2026-10-10 (run `2026-10-10_next-tier`, unit `q6-copilot-charter-check`): that check ran the agent
as the session's own, with `--agent` (`:96-99`), and its disposition holds for that route; an agent dispatched as a
sub-agent is REQ-FLOW-071's subject.

### REQ-FLOW-024 — A run retires the inbox rows it fixed

At its close, `/st-work` removes each `.stamity/inbox.md` row its change fixed — folded in at Frame or settled by the
persisted plan — and records `- inbox retired: <location> — fixed in <run id>` in its run record. A row whose `Ref:`
names a ledger row is retired, its state kept, through
`stamity ledger close --run <its run> --id <row id> --retired "fixed in <run id>"`; a row the run did not fix stays
as it is (`content/commands/st-work.md:380-383`). `/st-quick`, which keeps no run record, retires a row after the gate
is green — the ledger row first, then the bullet — and names each row retired, and each named row left, in its batch
report (`content/commands/st-quick.md:120-127`). The board's removal rule names both retirers
(`content/commands/st-board.md:341-344`, `:379-384`).

`--retired` sets the optional `retired` field to `<UTC YYYY-MM-DD> <disposition>` on a `deferred` row only, keeps its
state, and reads the date from the caller's clock. A row whose `retired` value already states that disposition is
`unchanged`, on a later day too, so a retirement is never re-dated; another disposition is refused
(`src/runs/ledgerStore.ts:899-983`).

- **As built:** the later-day rule was ratified as built (`review/118`, 14:14Z).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, units `q9a-disposition`, `q9t-board-inbox-rules` and
  `q10a-work-close`, with their fix rounds): from 2026-10-10, by the caller's clock in UTC, a new `retired` value must
  parse under the grammar of REQ-FLOW-076, else the close is refused with `why` and `next` and nothing is written; the
  check runs after the `unchanged` answer, so a re-run of a value recorded before that day still reads `unchanged`
  (`src/runs/ledgerStore.ts:907-912`, `:984-993`). A ledger row the close's one question dropped, or scheduled to a
  plan, board or handoff place, is retired then and never appended to the inbox, and an inbox row that answer decided
  leaves by the board's Removal rule (`content/commands/st-work.md:365-368`, `:383-387`;
  `content/commands/st-board.md:390-397`; REQ-FLOW-074). So the body's "a row the run did not fix stays as it is" now
  reads "A row no answer reached stays as it is" (`content/commands/st-work.md:389-390`). Both commands spell the
  third kind of retirement "scheduled to a place with a date or a trigger", where they read "scheduled with a lane, a
  trigger and an owner" (`:373-374`; `content/commands/st-board.md:381-382`). The board still names two retirers, and
  adds that `/st-work`'s close also removes a row its one question dropped, placed elsewhere or re-dated
  (`content/commands/st-board.md:341-344`).
- **Proof:** `test/runs/ledgerClose.test.ts`, `test/cli/docs/cliReference.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/board.test.ts`, `test/records/ledgers.test.ts`;
  must-holds `work-proof-block-fields` and `quick-next-step-derived-from-batch-state`; QA.

### REQ-FLOW-025 — Run records are written with the file tools

`/st-work` tells the agent to create and extend `record.md`, `plan.md`, reports and the inbox with the client's file
write and edit tools — never a shell redirect, a heredoc or `cat >` — and to move ledger rows only through the
`ledger` verb (REQ-CTX-005) (`content/commands/st-work.md:32-35`); a build or fix dispatch names the report path,
written with the file write tool (`:136`).

Landed 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `b4-no-read-allow-rows`, inbox row 324; unreleased at
that merge): setup writes no permission allowlist. The engine renders no `permissions` member in
`.claude/settings.json`, in repository setups and in plugin setups alike (`stamity plugin setup`, where a plugin that
carries hooks leaves the engine no member to write; `buildSettingsJson`, `src/adapters/claude.ts`). The three `read`
rows a release rendered (`Read`, `Grep`, `Glob`) leave on the next `sync` without a backup where the ledger records
them, and an owner's equal row with no record stays; a ledger from 1.11.0, which records no entries, takes them by
REQ-FLOW-036's expand/contract rule. A bare `Read` rule matches every file read, and reads inside the working
directory need no rule, so the rows only removed prompts for reads outside the project
(code.claude.com/docs/en/permissions, read 2026-10-08). It read: "Not shipped: the plan's sentence "Setup writes no
permission allowlist"", deferred under ledger `build/124` (answered on 2026-09-30 at 14:29Z) with a follow-up row in
`docs/plans/013-optimization-sweep-03.md`.

- **Proof (2026-10-08):** `test/merge/settingsOwnerEntries.test.ts` (the describe "the Read, Grep and Glob allow rows
  an earlier release rendered (inbox row 324)"), `test/adapters/claude.test.ts`.

- **Proof:** `test/corpus/recordWrites.test.ts` (the Frame text, and a line lint over `content/` that fails on a shell
  redirect, heredoc or `tee` aimed under `.stamity/`); must-holds `work-proof-block-fields` and the floor
  `charter-touchpoints-delegate`; QA.

### REQ-FLOW-026 — The touchpoints ship as shared skills, so Codex gets them

From `docs/plans/013-optimization-sweep-03.md` § Spec delta A, the unit `sw17-touchpoints-as-shared-skills`, its
sign-offs and its live check. Every `path:line` below is read at `a9e94f06`, where the unit and its fix rounds have
integrated. Before the unit, `CODEX_COMMANDS_DIR` was `null` and Codex received no touchpoint body.

- When Codex or Cursor is selected, sync emits each of the nine touchpoint bodies once, as
  `.agents/skills/st-<id>/SKILL.md`, with a companion `.agents/skills/st-<id>/agents/openai.yaml` that sets
  `policy.allow_implicit_invocation: false` (`src/emit/skillsProjection.ts:522-593`). The skill's head has three
  keys: `name`, `description` and `disable-model-invocation: true` (`:595-616`). Codex and Cursor both emit the rows
  and co-own each file, so it survives the deselection of one of them (`src/adapters/codex.ts:77-97`, `:435-437`;
  `src/adapters/cursor.ts:70-104`).
- Codex starts one as `$st-<id>`, and Cursor as `/st-<id>`. Init's Codex steps say `invoke one as $st-<id>` and
  `then type: $st-onboard`, never a slash (`src/cli/commands/init/panel.ts:167-189`). Codex's `command-surface`
  capability row names the tree, the companion key and what was measured (`src/adapters/codex.ts:355-366`).
- Claude keeps its `.claude/commands/` files, and its native skills copy carries no touchpoint. Copilot alone gets no
  shared touchpoint, and its prompt files stay. With Codex or Cursor beside it, Copilot lists the nine as project
  skills beside its prompt files and keeps them out of the model's own skills list; its `command-surface` row
  declares the double listing (`src/adapters/copilot.ts:165-175`).
- Sync stops writing `.cursor/skills/st-<id>/`. The rows a 1.10.0 install recorded there are planned by nobody, so the
  reclaim sweep removes those files and nothing else under `.cursor/` (`src/adapters/cursor.ts:84-90`).
- Codex's skills-list check counts the touchpoints: the full selection measures 6,909 characters over 26 skills
  against the 8,000 cap (`codexSkillsListChars`, `src/emit/capabilityMatrix.ts:379-384`; the refusal at
  `src/adapters/codex.ts:397-418`; REQ-PROVE-004).
- The Codex plugin does not carry the touchpoints. They stay repository-owned, `stamity plugin setup` writes them into
  the shared tree, and the packager drops a command-class row there (`scripts/plugins/clients/codex.mjs:25-30`,
  `:50-52`, `:84-89`; sign-off at 15:56Z, option (b)). The Cursor plugin carries them under `skills/` as class
  `command`, without the Codex companion (`scripts/plugins/clients/cursor.mjs:63-73`).

- **Live check** (2026-09-30T15:56Z, a fixture set up by the lane's `init -y --tools codex,cursor,copilot`):
  codex-cli 0.155.1 loaded the body on `$st-work`; cursor-agent 2026.09.28 loaded it on `/st-work`; Copilot CLI
  1.0.89 listed the nine under project skills, and its model-visible skills list omitted them
  (`.stamity/runs/2026-09-30_optimization-sweep/record.md:118-122`).
- **As built, where the delta differed:**
  - The delta relied on `disable-model-invocation: true` alone. Codex takes the rule from the `agents/openai.yaml`
    companion, which the build adds.
  - The delta's criterion counted the rows with Codex selected. They also land with Cursor alone, which reads the
    shared tree, and never for Claude or Copilot alone.
  - The delta did not say where the Codex plugin puts the touchpoints. The unit first packaged them as plugin skills
    (26 folders against the pinned 17) and stopped; the sign-off kept them repository-owned.
  - Whether a plain ask that names no touchpoint can still start one on Codex is unmeasured, and the capability row
    says so (`review/156`, signed off at 16:14Z).
- **Expand/contract:** the shared rows are added and the `.cursor/skills/st-<id>/` rows reclaimed in the same sync,
  which the live Cursor check gated. Rollback is a re-sync at the prior version. The Codex cells of the parity table in
  `docs/specs/orchestrator-context.md` moved with the unit (amended 2026-09-30).
- **Amended 2026-10-06** (run `2026-10-03_pack-engine-defects`, unit `u3-codex-shown-rows`, integrated as `0da30714`;
  cited at `eb4f0727`). The skills-list bullet above is superseded: Codex's skills-list check leaves the touchpoints
  out. Each touchpoint's `agents/openai.yaml` sets `policy.allow_implicit_invocation: false`, and codex-cli 0.160.0
  (2026-10-03) and 0.160.1 (2026-10-06) keep such folders out of the skills list they show the model
  (`.stamity/runs/2026-10-03_pack-engine-defects/record.md:298-299`). The full selection measures 5,570 characters
  over 17 shown skills against the 8,000 cap (`codexSkillsListChars`, `src/emit/capabilityMatrix.ts:379-387`; the
  count at `src/adapters/codex.ts:417-430`; REQ-PROVE-004, amended 2026-10-06). Whether a plain ask that names no
  touchpoint can start one on Codex is still unmeasured: those checks cover the listing only.
- **Amended 2026-10-08** (run `2026-10-08_maintainer-tooling`, unit `d1a-rendering-proof-core`; the maintainer's answer
  that a retired layout is kept). A `.cursor/skills/st-<id>/` copy a 1.10.0 install wrote is no longer removed by the
  sweep. The running engine renders nothing at that path, so its bytes cannot prove the delete (REQ-PLUGIN-046, amended
  2026-10-08): the sweep keeps it as `skipped-user-content`, the sync report names it with the step to delete it by hand,
  and its row leaves the ledger with that sync, so later syncs and `check` do not report it again. The bullet "the
  reclaim sweep removes those files and nothing else under `.cursor/`" and the Expand/contract sentence "the
  `.cursor/skills/st-<id>/` rows reclaimed in the same sync" describe the releases before this amendment; the 1.10.0
  case the Proof bullet names now pins the keep.
- **Proof:** `test/emit/touchpointSkills.test.ts`, `test/emit/skillsProjection.test.ts`,
  `test/adapters/codex.test.ts`, `test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`,
  `test/cli/commands/initPanel.test.ts`, `test/cli/commands/syncEngine.test.ts` (the 1.10.0 reclaim case),
  `test/ci/pluginPackages.codex.test.ts`, `test/ci/pluginPackages.cursor.test.ts`, `test/cli/commands/plugin.test.ts`,
  `test/docsPages.test.ts`; the live check; QA.

### REQ-FLOW-036 — `.claude/settings.json` is merged entry by entry, and an owner's entries survive every verb

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-settings-ownership`. The engine owns only what
it writes into `.claude/settings.json`: each `permissions.allow` row and each hook entry (one element of a
`hooks.<Event>` array) it wrote, and any whole member a later requirement declares (the two declaration pointers of plan
016 file 2's `u2-declare`). The ledger records each by the sha256 of its canonical JSON. Everything else is the owner's:
the engine never writes, replaces or removes `permissions.deny`, `permissions.ask`, any other member of `permissions`,
or an entry it did not write.

- **Merge, never a collision.** An owner's existing `permissions` or `hooks` key is merged: the owner's rows and entries
  keep their place and the engine's form one block beside them. The file collides only when it is not a JSON object or a
  member the engine writes into has another type (`permissions` not an object, `allow` not an array, `hooks` not an
  object, an event not an array); the message names the member and the fix, `--force` does not clear it, and no command
  offers `--force` for it.
- **What leaves, and when it takes a `.bak`.** An engine entry the rendering no longer carries leaves without a backup
  only when the ledger records it (or proves the file unedited) and it lies inside the engine's bound: an allow row a
  release rendered (`Read`, `Grep`, `Glob`; the engine renders none since 2026-10-08), or a hook entry whose every command runs a script under `.stamity/`. Any other
  engine entry leaves only behind a verified `.bak`, with a warning naming it. A hook entry recognised by its script under
  `.stamity/generated/hooks/` but not recorded (an earlier setup's, or one edited by hand) is the engine's to replace or
  remove, behind that backup. A recorded hash outside the bound proves nothing, and an allow row outside it stays the
  owner's.
- **Style.** The merged file keeps its own indentation (two or four spaces, a tab, or one line), key order, line ending
  and final newline.
- **Round trip.** `clean` removes the engine's entries, keeps every foreign one, writes no `.bak` when only foreign
  content changed, and deletes the file only when the engine created it and nothing foreign remains; containers that
  existed before setup stay even when emptied.
- **Amended 2026-10-07 (build).** The bound for a hook entry is the script it executes, in the engine's own script
  folders: `.stamity/generated/hooks/` or an installed pack's `.stamity/packs/<id>/`; a `.stamity/` path elsewhere in
  the command does not count, and the user's `.stamity/hooks/` lies outside (`commandRunsStateScript`,
  `src/manifest/coOwnedJson.ts`). A user-hook entry is proven only by re-rendering a definition still in
  `.stamity/hooks/` (`coOwnedReclaimRenderings`, `src/cli/engine/emissionWrite.ts`): adding a definition, and `clean` in
  a repository with user hooks, take no `.bak`; editing or removing a definition leaves one verified `.bak` and a warning
  naming the entry. A whole member the engine writes, `yield` or `collide`, changes or leaves without a backup only when
  it equals the engine's current rendering or a value a release rendered there; a differing `collide` member is a
  `co-owned-shape` collision naming it. A document that cannot round-trip — a value shadowed by a duplicate key, or a
  number a double cannot hold exactly (`roundTripLoss`, `src/manifest/jsonMembers.ts`) — takes a verified `.bak` before
  any write, its warning naming why; a byte-order mark survives the merge. A co-owned row with no hash reads as drifted.
  A `co-owned-shape` refusal keeps the document's ledger rows and record. Only documents that wire hooks hold back the
  scripts they run from `clean` and a client's removal. `check`'s prediction passes the write's own ledger hashes, so
  its preview is the write.
- **Units:** `u0-settings-ownership`. The per-entry core (`src/manifest/coOwnedJson.ts`) is a shared contract that
  REQ-FLOW-037 and plan 016 file 2's `u2-declare` build on.
- **Evidence (before):** ownership was per top-level key (`src/adapters/claude.ts:215-217`;
  `src/manifest/claudeSettings.ts:385-399`, at `d10db029`); an owner's differing key with no ledger row skipped the file
  (`:423-436`), and with a row or `--force` was replaced behind a `.bak` (`:472-484`). Measured 2026-10-06 on 1.11.0: an
  owner `permissions` holding `deny: ["Bash(rm -rf:*)"]`, plus a `PreToolUse` hook, made `init -y` exit 0 and skip the
  file. `sync -y --force` and `init -y --force` dropped the deny rule and the hook. A deny rule added after setup made
  `check` print "next: … sync", and a plain `sync -y` removed it (exit 0). A foreign key added after setup left a
  1,883-byte `.bak` at `clean`, and a four-space file without a final newline came back two-space with one.
- **Expand/contract:** a ledger from 1.11.0 records no entry hashes and reads as legacy. Entries equal to the rendering,
  allow rows inside the bound and recognised hook entries count as the engine's. A changed one leaves silently while the
  file still hashes to the recorded hash, and behind a `.bak` otherwise. The first `sync` records the entries. A 1.11.0
  CLI drops `coOwned` on its next write and falls back to its per-key rule. Rollback is a re-sync at the prior version.
- **Proof:** `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`,
  `test/manifest/coOwnedJson.test.ts`, `test/manifest/jsonMembers.test.ts`, `test/manifest/claudeSettings.test.ts`,
  `test/merge/reclaim.test.ts`; QA.

### REQ-FLOW-037 — Cursor's and Codex's hook files are merged entry by entry, Codex's configuration table by table, and no kept hook loses its script

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-hook-files-ownership`. `.cursor/hooks.json`
and `.codex/hooks.json` are owned per entry by the core of REQ-FLOW-036. The engine owns each element of a
`hooks.<event>` array it wrote, recognising an entry by the script it runs (`.stamity/generated/hooks/<client>/`, or one
of Cursor's two guards). It also owns Cursor's `version` while anything of the engine's remains, and Codex's
`description` unless the owner wrote one. An owner's entry survives `sync` and `clean`, and no `.bak` is written when only
foreign entries changed. `.codex/config.toml` is owned per table. The engine owns `[features]`, the bare `[mcp_servers]`
when it selects no server, and each `[mcp_servers.<id>]` it renders. An owner's own table of one of those names, or an
engine table the owner edited, is the owner's and is kept, and the engine writes no second header; for `[features]` the
run warns when the kept table sets `hooks = false` (Codex runs hooks by default; vendor re-read 2026-10-07). Every other
table and every top-level key is the owner's, kept byte for byte. `clean`, and a `sync` that removes a client, never
delete a hook script that a hooks document they keep still runs: they report it kept, and `clean` then keeps `.stamity/`
when such a script lives there.

- **Amended 2026-10-07 (build).** The unit was built in two halves: the TOML half (`src/manifest/tomlTables.ts`,
  `src/manifest/codexConfigToml.ts`, the `.codex/config.toml` lane), then the JSON half (`src/manifest/hookDocuments.ts`,
  the Cursor and Codex hooks lanes) in two passes, the second the guard rename of REQ-FLOW-038.
  - **Entries.** A Cursor entry leaves without a backup only when the script it executes lies under
    `.stamity/generated/hooks/cursor/` or an installed pack's `.stamity/packs/<id>/`, or is one of the guards; a Codex
    group only when every inner hook is the engine's `node -e` starter, or, as releases up to 1.6.0 wrote it, an argv
    running a script under `.stamity/generated/hooks/codex/` or executing one in an installed pack's folder
    (`src/manifest/hookDocuments.ts`). An entry a release up to 1.6.0 wired directly from a user hook or an installed
    pack's hook is the engine's only when it equals that old direct form re-rendered from the definitions the engine
    still wires — user rows first, then pack rows, the order 1.6.0 wrote them in (`directHookRendering`) — never by the
    whole-file hash alone, so a forged legacy row removes no owner entry.
  - **Members.** Cursor's `version` is a `collide` member and Codex's `description` a `yield` one, each bounded by every
    value a release rendered there (`version` 1 in every release; five `description` texts from 1.7.0 to 1.11.0, the
    pinned check call normalised away). The top-level `stamity` member 1.0.0 to 1.6.0 wrote into `.codex/hooks.json` is
    declared with its one release value: it leaves silently, and any other `stamity` is the owner's.
  - **Codex tables.** `[features]` is the engine's only when its text is one of the renderings a release wrote (1.8.0
    to 1.9.1, 1.10.0 to 1.11.0, and the current one; `RELEASED_FEATURES`). An owner key that defines without a header a
    table the engine writes a header for (`features.x`, an inline `features`, an inline server in an owner's
    `[mcp_servers]` the engine writes), and an owner `[[mcp_servers]]` beside a server table the engine writes, are
    `co-owned-shape` collisions naming the key or the header's line. A selection whose record would pass the manifest
    reader's bound is refused (63 servers is the most), naming `config mcp remove <id>`. An owner's comment between two
    engine tables stays above the table it sat above; a comment appended after the engine's last table edits that
    table, which is then the owner's and is kept, with no `.bak`.
  - **Codex's hooks turned off.** A kept key that sets Codex's hooks feature to `false` fails `check`, as a Cursor
    entry Cursor rejects does: `hooks = false` or a quoted `"hooks"`/`'hooks'` in `[features]`, its deprecated alias
    `codex_hooks`, or `features.hooks = false` at the root. `check` names the file, the line and the remedy (set it to
    `true`, or remove the key); `sync` and `init` keep the table and warn with the same sentence, and a root dotted key,
    already a `co-owned-shape` collision, carries the sentence in its refusal (`describeCodexHooksOff`,
    `src/manifest/codexConfigToml.ts`; carried as the plan entry's `rejected`, judged on the text the write's own
    prediction leaves; `review/81`).
  - **Scripts kept.** The sweep reads every hooks document still on disk, candidate or not (`hookDocumentsLeftInPlace`,
    `src/merge/reclaim.ts`, fed by `hookScriptRetention` in `src/cli/engine/emissionWrite.ts`), and a preview (`check`,
    `sync --dry-run`) reads a document the write rewrites as the write leaves it. `clean --json` names the scripts that
    kept `.stamity/` as `stateDirKept`. Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit
    `d2-forced-preview`, inbox row 588): under `--force` a preview also reads, as the forced write leaves it, a hooks
    document whose collision `--force` clears (`unmanaged-name`), so `sync --dry-run --force` never shows Kept for a
    script the forced run deletes. A document the forced write refuses at write time (a hard link, a symbolic link, or
    one under a folder that resolves outside the repository) is still read from disk, as the forced run stops before its
    sweep, and so is a document of any other collision class, which `--force` does not clear; `check` previews without
    the flag (`forceClears` and `forcedWriteLands`, `src/cli/commands/sync/engine.ts`). Before the amendment
    `hookDocumentsAfterWrite` left every collided document out, so a preview read it from disk even where `--force`
    clears the collision.
  - **Cursor's rejected entries.** A `.cursor/hooks.json` holding an entry Cursor rejects fails `check`, whoever wrote
    it; `sync` and `init` keep the entry and warn naming it. The check reads the event key against the 21 events
    cursor.com/docs/hooks lists (read 2026-10-07, Cursor 3.23.23; `CURSOR_HOOK_EVENTS`) and each entry by type: `type`
    absent or `"command"` needs a `command`, `"prompt"` needs a `prompt`, any other `type` fails (`cursorHookDefects`).
- **Units:** `u0-hook-files-ownership`.
- **Evidence (before):** all three were whole-file outputs (`src/adapters/cursor.ts:778-819`,
  `src/adapters/codex.ts:930-973`, `:1097-1149`, at `d10db029`). Measured 2026-10-06 on 1.11.0: an owner entry in
  `.cursor/hooks.json` and an owner group in `.codex/hooks.json` were each dropped by `sync -y` behind a `.bak`, and
  `check` reported the file as drift. An owner `[mcp_servers.<id>]` table was removed by `sync -y`. With an owner entry
  and no sync in between, `clean -y` kept the hooks file whole and deleted the scripts it runs, Cursor's two
  `failClosed` guards included. Cursor drops the whole file on one unknown event key, and with it the guards
  (microsoft/apm#3129, shown for Cursor 3.13.10).
- **Expand/contract:** 1.11.0 rows carry no `coOwned` and read as legacy; the first `sync` records the entries and
  tables. An edited 1.11.0 `.codex/config.toml` keeps every table outside the engine's names. Rollback is a re-sync at
  the prior version, which drops owner entries and tables again.
- **Proof:** `test/merge/hookFilesOwnership.test.ts`, `test/manifest/tomlTables.test.ts`,
  `test/manifest/codexConfigToml.test.ts`, `test/manifest/hookDocuments.test.ts`, `test/cli/commands/clean.test.ts`,
  `test/emit/syncDriftProof.e2e.test.ts`; QA.

### REQ-FLOW-038 — The engine's files in a folder users share carry the `stamity-` prefix

From `docs/plans/016-fork-distribution-00.md` § Spec delta B, the unit `u0-hook-files-ownership`. Every file the engine
writes into a folder where users keep files of their own carries a `stamity-` or `st-` name segment. A hand-written file
then never shares a name with an engine one, and a reviewer tells the two apart by name. The only unprefixed engine
paths are the fixed client files a client reads by name and the state directory. The fixed files are the three
charters, `.claude/settings.json`, `.cursor/hooks.json`, `.cursor/mcp.json`, `.codex/config.toml`, `.codex/hooks.json`,
`.mcp.json`, `.vscode/mcp.json`, `.github/hooks/stamity.json` and `.github/workflows/copilot-setup-steps.yml`. Cursor's
two guards become `.cursor/hooks/stamity-subagent-guard.mjs` and `.cursor/hooks/stamity-mcp-guard.mjs`. The first
`sync` after an upgrade writes the new names and rewires `.cursor/hooks.json`. It removes each old name only when its
bytes still hash to what the ledger recorded, inside the engine's bound; an edited one is kept and reported.

- **Amended 2026-10-07 (build).** The bound lists both new names and keeps the two old ones, so a 1.11.0 row at an old
  name still validates (`OWNED_PATHS` `version` 2, REQ-PLUGIN-045; `LEGACY_CURSOR_GUARD_PATHS`,
  `src/adapters/cursor.ts`, which nothing writes). An entry running an old name counts as the engine's only where the
  manifest's ledger records that name — a setup that ran a release before the rename; elsewhere the old names are free,
  and an entry running one is the owner's (`cursorGuardPathsFor`, `src/cli/engine/emissionWrite.ts`). A hooks document
  the sweep leaves in place — kept, refused or linked — keeps the old guards it still runs, and a preview (`check`,
  `sync --dry-run`) reads the rewired document as the write leaves it, so it shows the old guards as the deletes the
  write then makes. A `.cursor/hooks.json` refused as `co-owned-shape` carries the old guards' ledger rows through each
  `sync` until the owner fixes it, so the old names stay the engine's to reclaim once it is.
- **Amended 2026-10-08** (run `2026-10-08_maintainer-tooling`, unit `d1b-cursor-guard-pins`, inbox row 585, with lane
  D's fixer rounds 2 and 3). The first `sync` after an upgrade from 1.11.0 recognises an old guard, and the
  `.cursor/hooks.json` entry that runs it, by the bytes a frozen copy of the 1.11.0 guard builder
  (`src/adapters/cursorLegacyGuards.ts`) renders for that setup, together with the ledger row it already required, not
  by a recorded hash. The copy renders with the setup's agent roster — the ten agents 1.11.0 shipped plus every Cursor
  agent row the ledger records, pack and override agents included — and the package name and npm channel the running
  installation has, at version 1.11.0. So a core setup, a setup with a local pack's agents, one with an override agent,
  and a fork's setup under the fork's package name are each recognised; 1.11.0's own `sync` refused the curated `ops`
  pack on Cursor, so no 1.11.0 Cursor setup holds it. An entry running an old name is the engine's only when it is
  exactly the entry 1.11.0 rendered for that name and its script is absent or that re-render, and a co-owned record
  cannot claim one: the pins' hashes are dropped from the record the lane reads (`provenLegacyCursorGuards`,
  `src/cli/engine/emissionWrite.ts`). An entry whose script is absent is still rewired. A guard whose bytes are not that
  re-render (an owner's own file at an old name, or a hand-edited guard) stays with the entry that runs it, and the sync
  report names both; `clean` and `init --force` read the same proof. Two 1.11.0 setups keep their old spawn guard and
  its entry, named, on the safe side: one whose ledger lost a Cursor agent row, and one whose plugin carried the `agent`
  class but not the hooks, where 1.11.0 rendered its pack and override agents into the guard's roster but recorded no
  Cursor agent row for them (`review/99`). After a first `sync` that refused `.cursor/hooks.json`, a later `sync` reads
  the roster from the ledger the running engine rewrote, which matches 1.11.0's only while no agent has been added to or
  removed from the corpus since 1.11.0, as holds today; after such a change that guard would be kept the same way
  (`review/99`). The requirement's sentence "It removes each old name only when its bytes still hash to what the ledger
  recorded" describes 1.12.0.
- **Units:** `u0-hook-files-ownership`.
- **Evidence (before):** `src/adapters/cursor.ts:110-116` at `d10db029`. Of the 201 paths a four-client `init` records
  on 1.11.0, 11 carry no prefixed segment: the six fixed client files, the three charters and the two guards.
- **Expand/contract:** the old names are reclaimed by proof; the plugin roots ship the new names under `hooks/`, and a
  client on an older root keeps the old names inside its own root, which `sync` never touches.
- **Proof:** `test/emit/namePrefix.test.ts`, `test/adapters/cursor.test.ts`, `test/merge/hookFilesOwnership.test.ts`;
  `test/adapters/cursorLegacyGuards.test.ts` with its four fixtures (added 2026-10-08).

### REQ-FLOW-061 — A change gets the checks its class needs

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p1a-classifier-verb`,
`p1c-classify-git-reads`, `p1d-classify-security-row`, `p2a-class-file` and `p5f-class-file-gate-config`, lane A's
fix rounds and the p5 group's fix round 2; every `path:line` below reads at `f3315229`.

`stamity gate classify` names one class for a change, the checks that class runs and the lenses it needs. It is the
CLI's fourth hidden plumbing verb, beside `learn`, `handoff` and `ledger`, because its caller is the session running
`/st-quick` or `/st-work` (`src/cli/commands/gate.ts:39-44`, `:1499-1526`). The seven classes, strongest first, are
`security-sensitive`, `public-contract`, `product`, `config`, `tests`, `docs` and `records`
(`src/change/classify.ts:96-115`). Each path takes the strongest class any rule gives it, a path no rule places is
`product`, and the change takes its strongest path's class (`:5-11`, `:1133-1138`). Each class's checks
(`CLASS_CHECKS`, `:128-141`): `records` the secret scan and the selected tests; `docs` those and one review pass
(`review-once`); `tests` those plus lint, typecheck and the review loop; `config` and every stronger class the scan,
the full gates (`gates-all`) and the review loop. A `security-sensitive` class names the security lens first
(`:1147-1151`).

- **The built-in rules are generic.** `.stamity/runs/**`, `.stamity/inbox.md` and `.stamity/handoffs/**` are
  `records`; `docs/**` and top-level `*.md` are `docs`; an agent instruction file (`AGENTS.md`, `AGENTS.override.md`,
  `CLAUDE.md` or `CLAUDE.local.md`, at any depth, matched without case) is at least `product`; the class file itself,
  `.stamity/manifest.json` and `.stamity/overrides/**` are `security-sensitive`, matched without case
  (`src/change/classify.ts:612-653`). The delta placed the class file in `config`; it landed `security-sensitive`,
  because it decides every later change's checks (`review/49`).
- **The floors.** No rule, built-in or the class file's, places a code file (`CODE_EXTENSIONS`, `:152-164`), an
  extensionless file other than `LICENSE`, `NOTICE`, `AUTHORS`, `CHANGELOG`, `COPYING` or `README` (a dotfile counts as
  extensionless), or a config-format file (`.json`, `.jsonc`, `.yml`, `.yaml`, `.toml`, `.ini`, `.cfg`, `.conf`,
  `.xml`, `.properties`, the `.env` family) in `records` or `docs`; a config file under the engine's own record paths
  stays `records`. A rule places a code file in `tests` only under a built-in test glob. A held-out file is `tests`
  under a built-in test glob, else takes its next placement, else is `product` (`:13-25`, `:655-669`, `:865-913`;
  `review/47`, `review/55`).
- **A repository's own lists** live in `.stamity/change-classes.json` (`:521-522`), read only as the base commit's
  blob under the project's prefix, never the head's copy or the work tree's (`src/cli/commands/gate.ts:86-97`,
  `:954-976`). Its rules join the built-ins and only ever raise a path a built-in rule or the trigger roster's
  security row places; its `product`, `public-contract` and `security-sensitive` rules match without case
  (`src/change/classify.ts:1432-1437`, `:1682-1705`). `parseClassFile` refuses text that is not a JSON object, an
  unknown key or class, a glob that is not a non-empty string, a glob over 200 characters or holding more than four
  `**`, a glob matching every path for a class weaker than `product`, a `records` or `docs` glob whose extension holds
  a wildcard (`review/59`) or whose last segment holds a wildcard and names no concrete extension (`review/70`), and
  a test entry that is not a plain repository-relative file path (`:1477-1593`, `:1630-1680`). A refused base copy
  gives at least `product` and applies only its raising entries that parse on their own; JSON that does not parse
  gives the built-ins alone (`src/cli/commands/gate.ts:978-992`, `:1246`; `review/48`). `check` adds a
  `change-classes` row only when the file exists, failing with the first error (`src/cli/commands/check.ts:354-395`).
  This repository's file places `content/**` in `product`, the tool configurations in `config`, `test/**` and
  `evals/**` in `tests`, the site's content and assets by extension in `docs`, and the engine's state readers,
  `src/hooks/**`, the classifier and gate code and `scripts/ci/**` in `security-sensitive`
  (`.stamity/change-classes.json:2-25`).
- **The injection-screening rule** names the class file beside the manifest as the two files under `.stamity/` that
  configure gates: the operator's to edit, the class file read only from the base commit, so no change sets its own
  checks (`content/rules/stamity-injection-screening.md:87-92`).
- **Where the paths come from.** `--paths <path>…` classifies listed paths by path rules alone, and without `--base`
  reads no git at all (`src/cli/commands/gate.ts:1204-1206`); a listed path is read with a backslash both as a
  separator and as a filename character, the stronger class kept (`src/change/classify.ts:918-951`; `review/20`).
  Without `--paths` the change is read from git: the tracked changes, staged and unstaged, against the base, renames
  as renames, and every untracked file. Git's names are read literally, except on win32, where they are read both
  ways (`src/cli/commands/gate.ts:50-61`, `:1231-1233`; `review/43`).
- **The base.** `--base <ref>` resolves once to a commit; a ref starting with `-` is refused with exit 2 before git
  runs (`:145-149`, `:159-167`). With no `--base`, each known path takes its built-in class, no class file is read,
  and the reason says no base was given (`src/change/classify.ts:1075-1077`); since that read sees only the uncommitted
  change, a `HEAD` holding commits its upstream lacks (with no upstream, commits no remote-tracking ref reaches, a
  dangling remote `HEAD` counting as such a ref) makes the class at least `product`, the reason naming the commits
  and pointing to `--base`, and a failed read of those refs does the same; a repository with no upstream and no
  remote-tracking ref keeps the plain reading (`src/cli/commands/gate.ts:1240`, `floorUnclassified`; `review/191`,
  `review/196`, `review/197`). A `--base` that does not resolve to a
  commit, an unborn `HEAD` among them, gives no class, with `--paths` as without: `classify` exits 1, and its JSON
  carries `ok: false`, `subcommand`, `base: null` and a `reason` saying the ref could not be read, with no `class`,
  `checks` or `lenses` (`src/cli/commands/gate.ts:1213-1217`, `:1278-1283`; `src/cli/kit/program.ts:353-363`). It gave
  `product` over zero paths, which the flows read as a class, so their no-class rules never fired (`review/182`). An
  empty path list or a rename whose two sides classify differently makes the class at least `product`
  (`src/change/classify.ts:1082-1094`).
- **The project root** is the nearest ancestor of the working directory, up to the git top-level, whose `.stamity/`
  is in the base commit's tree (`HEAD`'s with no base), else the top-level; every git read runs from it, so a
  `.stamity/` the change itself adds moves no boundary (`src/cli/commands/gate.ts:72-84`; `review/13`). A changed path
  outside the project is left out and raises the class to at least `product`, or to `security-sensitive` when the
  built-in security floor or the trigger roster's security row matches it (`:1093-1117`;
  `src/change/classify.ts:802-829`; `review/21`). A name that is not valid UTF-8, or one the report must sanitise,
  raises it to at least `product` (`src/cli/commands/gate.ts:1118-1124`, `:1136-1149`; `review/36`).
- **Fail-closed.** Every git call runs through the hardened runner. A git failure reading the change's paths — a
  directory outside a work tree, no git binary, a timeout, an oversized output — gives `product` with the failure
  named (`src/cli/commands/gate.ts:1263-1267`). Three reads fail closed their own way: a failed read of the changed
  lines makes the class `security-sensitive`, the lens reading what no line rule could (`:851-859`, `:1125-1128`;
  REQ-FLOW-065); a failed test-source read runs every test and keeps the class and lenses (`:1252-1259`;
  REQ-FLOW-062); and a failed read of a changed `package-lock.json`'s base copy keeps the security lens, the reason
  naming the failure (`:1153-1161`; `src/change/classify.ts:1366`). A base that does not resolve gives no class, as
  above. Glob matching costs at most the glob's steps times the path's length, whatever its wildcards
  (`src/change/classify.ts:734-785`; `review/50`).
- **Output.** A terminal summary and one JSON document carrying `subcommand`, `base`, `paths`, `class`, `checks`,
  `lenses`, `reason`, `byPath` and `tests`, every path and rule sanitised (`src/cli/commands/gate.ts:1284-1319`).
  `classify` exits 0 for every class it names and 1 when it names none; an unknown subcommand or option exits 2
  (`:1278-1283`, `:1301-1302`, `:1505-1526`).
- **Expand/contract:** an added hidden verb and an optional file. A repository with no class file gets the built-in
  rules, and `check` prints no new row (`src/cli/commands/check.ts:354-363`). Rollback is a re-sync at the prior
  version. The consumers are `/st-quick`, `/st-work` and `/st-plan` (REQ-FLOW-063, REQ-FLOW-065, REQ-FLOW-067) and
  `scripts/ci/records-only.mjs` (REQ-PROVE-031). The exit 1 with no class for a base that does not resolve
  (`review/182`) changed the verb's output inside the run, before any release; the three flows read it as no class,
  and `scripts/ci/records-only.mjs` loads the classifier module, not the verb (REQ-PROVE-031).
- **Proof:** `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/cli/commands/check.test.ts`,
  `test/cli/surface.e2e.test.ts`, `test/architecture/boundaries.test.ts`, `test/corpus/rules/security.test.ts`; QA.

### REQ-FLOW-062 — Tests that read files are declared

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p2b-test-inputs`,
`p2d-test-input-census` and `p2c-ci-lanes-from-map` and lane A's fix rounds 7 to 10.

The class file's `testInputs` map lists globs over changed paths and the tests each selects, or `"all"`. It is read
from the base commit's copy only, and only a valid copy gives one (`src/cli/commands/gate.ts:1248-1261`).
`gate classify` adds a `tests` result, `{full, files, reason}` (`:1286`, `:1295`, `:1316`). Selection, in order
(`src/change/testInputs.ts:173-239`):

- a `config` or stronger change runs every test (`review/60`);
- a changed helper or fixture under a built-in test glob runs every test;
- no map, or an empty one, runs every test;
- otherwise the union of the map entries whose glob matches a changed path (an `"all"` entry runs every test), the
  tests whose source names a changed path, which only adds, and the changed test files;
- zero selected stays zero for `records` and `docs`, and runs every test for `tests`;
- a selected name that fails the map entries' argument check runs every test, naming it (`review/61`).

A test's reads are taken from its own text: each string literal naming a tracked non-code file, and each glob
literal's tracked non-code matches; a glob literal over the class file's cost bound makes every test run
(`src/change/testInputs.ts:1-29`, `:133-159`; `src/cli/commands/gate.ts:1009-1048`). A failed test-source read runs
every test and keeps the class and lenses (`:1252-1259`; `review/63`), and a selected file the work tree lacks runs
every test (`:1050-1058`).

- **This repository's map** gives `content/**` and `evals/**` every test, each CI lane path its lane's suites and the
  guard, a top-level `*.md` entry the suites that read those pages, and `test/**` the guard and the whole-tree
  scanners (`.stamity/change-classes.json:26-234`). Test data shaped like a glob or a repository path is built at
  run time from fragments, so it reads as no declared read (ledger `build/43`, `build/44`, `review/76`, `review/78`).
- **The guard,** `test/ci/testInputsGuard.test.ts`, fails for a (test, path) pair a weaker class places or a map entry
  covers that no entry for the path lists; the records and docs entries carry it (`review/81`).
- **Expand/contract:** additive. A base with no map runs every test, the full set the flows ran before. Rollback is a
  re-sync at the prior version.
- **Proof:** `test/change/testInputs.test.ts`, `test/ci/testInputsGuard.test.ts`, `test/cli/commands/gate.test.ts`,
  `test/ci/recordsOnly.test.ts`.

### REQ-FLOW-063 — The gates follow the class

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p3a-charter-invariant-4`,
`p3b-quick-gates` and `p3c-work-gates`, the p3 fix rounds and the p5 group's fix round 2.

Gates run on every batch, a one-line typo fix included (`content/commands/st-quick.md:150`). `/st-quick` gates the
batch in three steps after the last item lands: the secret scan, `stamity gate classify --base HEAD --json`, then the
class's checks in a `test-runner` spawn (`:155-184`). `/st-work`'s Prove pass scans with the run's base, then runs
`stamity gate classify --base <the run's base> --json`; the class's checks run on the selected files in the build and
its gates on the final tree, as the test-runner maps them (`content/commands/st-work.md:188-200`). The run's base is
the record head's `Base:` line (REQ-CTX-012).

- **The mapping** is the test-runner's: `tests-selected` runs the test gate with the selected files appended, the
  whole suite when the selection reads `full`, and no row when it names none; `lint` and `typecheck` run their gates;
  `gates-all`, an `unclear` class, or a test command that takes no file list runs `all`. On the final tree a `product`
  or stronger class runs `all` (`content/agents/stamity-test-runner.md:33-39`). `/st-quick` spells the same mapping
  and honours `tests.full`; a `docs` class with zero selected tests runs the scan alone and names the class
  (`content/commands/st-quick.md:174-184`; `review/109`).
- **The condition.** Both flows state that the narrower gates rest on one condition: the repository's CI runs the
  full matrix on every `product` or stronger change and on a schedule (`content/commands/st-work.md:194-196`;
  `content/commands/st-quick.md:186-188`). Where the charter's `CI provider` reads `unknown`, the final tree runs
  `all` whatever the class (`content/commands/st-quick.md:187-188`; `content/agents/stamity-test-runner.md:37-39`).
- **When no class can be read.** A `/st-work` run with no base scans against `HEAD` and runs
  `${STAMITY:VERIFY_GATE_ALL}` on the final tree unclassified (`unclear`). Such a scan reads no committed work, so a
  run with committed work lists `secret scan: not run` under `Not done:`, and one whose work is all uncommitted is
  scanned whole and lists nothing for it (`content/commands/st-work.md:196-198`; `src/cli/commands/gate.ts:1461`). In
  either flow a CLI that cannot run or has no `gate` verb, and a scan naming a `reason`, take the full gates and list
  `secret scan: not run` (`content/commands/st-work.md:198-199`; `content/commands/st-quick.md:152-153`,
  `:162-164`). A `/st-quick` scan naming a `reason` still runs step 2's classify (`:162-164`; `review/113`). A
  `gate classify` that exits 1 names no class (REQ-FLOW-061): `/st-quick` then moves a batch that touches a path the
  security agent's `## Trigger` table names to `/st-work`, as for a `security-sensitive` class, and keeps any other
  batch, a docs-only one among them (`:169-173`; `review/179`; REQ-FLOW-065). `/st-work` runs
  `${STAMITY:VERIFY_GATE_ALL}` on the final tree unclassified (`unclear`), as it does with no base
  (`content/commands/st-work.md:196-197`; `review/190`).
- **One review pass.** A class whose checks name `review-once` gets one review pass: a Critical or Warning it raises
  is fixed and closure-reviewed once, and no further round runs (`content/commands/st-work.md:199-200`).
- **The charter.** Invariant 4 reads "Done means the gates `gate classify` names exit 0 (all if it did not run)", the
  `Not done:` line unchanged, and the verification-gates intro says invariant 4 says which of them
  (`content/charter/stamity-charter.md:30`, `:53-54`). The delta's wording, "the gates the change's class names exit
  0 (all, if unclear)", landed tied to the CLI instead, so a class a session assigns itself never narrows the gates
  (`review/111`). Invariants 1.2.0, amended 2026-10-09 (`:8`, `:10`).
- **Expand/contract:** invariants 1.2.0 is a MINOR step: a repository that never re-syncs keeps the old invariant 4
  and runs every gate, a superset of the class's. Rollback is a re-sync at the prior version. The charter's pins moved
  with the text (`test/content/charter.test.ts`, `test/content/invariantsVersion.test.ts`).
- **Amended 2026-10-10** (run `2026-10-10_next-tier`, unit `q6t-test-runner-ci-line`, with its fix round for
  `review/14`): the test-runner reads the CI provider from its own body, where the engine renders it as one of its
  substitution tokens, so a client whose sub-agents load no charter still applies the rule: "This repository's CI
  provider is ${STAMITY:CI_PROVIDER}; where that reads `unknown` or is still an unresolved `STAMITY` substitution
  token, the final tree runs `all` whatever the class" (`content/agents/stamity-test-runner.md:37-39`;
  `src/emit/substitution.ts:102-113`). The unresolved-token clause is as built, beyond the delta: a copy that ships
  the token raw, as the APM package's bodies do (REQ-FLOW-002), runs every gate on the final tree. `/st-quick` still
  names the charter's line, which its own session loads (`content/commands/st-quick.md:187-188`). A `red` verdict
  writes nothing to the named report path and is returned in full, rows and excerpts
  (`content/agents/stamity-test-runner.md:144-145`).
- **Proof:** `test/corpus/commands/work.test.ts`, `test/corpus/commands/lightTrio.test.ts`,
  `test/corpus/agents/quality.test.ts`, `test/corpus/cliCallForm.test.ts`, `test/content/charter.test.ts`,
  `test/content/invariantsVersion.test.ts`; QA.

### REQ-FLOW-064 — Review rounds stop when they stop paying

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p4a-review-cap`,
`p4b-fixer-escalation` and `p4c-confidence-no-round` and the p4 fix round.

- **The cap.** Three rounds by default (two at light), operator-configurable within 1..10, the engine clamping to that
  band (`content/commands/st-work.md:216-217`; `DEFAULT_MAX_REVIEW_ITERATIONS`, `src/roster/reviewCaps.ts:20`). The
  light cap is prose: a review-gate hook that cannot see the tier may hold a light run to the engine cap, so a light
  run there can see a third round (`content/commands/st-work.md:444-445`, in the Intensity paragraph since 2026-10-10,
  where the command states the hold and no longer spells out the third round; `review/25`).
- **One closure re-review per fix.** Critical and Warning findings route to a fixer, and the fix re-enters review as a
  fresh reviewer spawn on the fix delta (`:209-211`, `:233-240`). Minor findings never trigger a round, and a note
  with no consequence is not a finding (`:231-232`).
- **Escalation, on what the run shows.** A finding whose ledger row carries two `re-review not-fixed` notes, a gate red
  after a fix, or a finding still open entering the cap round goes to a fresh fixer spawn, never the resumed one, with
  the round history attached, on the same model at one effort level above the fixer's declared one where the
  client's dispatch accepts an effort setting; where it accepts none, the fresh spawn is the escalation and the proof
  block records `effort: not settable`. A finding that fixer leaves open stops the run as `BLOCKED_FAILURE` to the
  person; no round past the cap runs (`:218-227`; `content/agents/stamity-fixer.md:72-91`). The delta's third trigger
  read "a finding still open at the cap round"; it landed "entering the cap round", so the escalation fixer takes the
  cap round's fix and the cap round's review is its closure re-review (`review/29`, `review/41`).
- **The proof block's review line** names an approval below the gate and each escalation's effort step or
  `effort: not settable` (`content/commands/st-work.md:316-317`).
- **Expand/contract:** the default moves from 4 to 3; a cap an operator configured within 1..10 still applies. The
  generated review-gate hook reads the engine cap (`.stamity/generated/hooks/claude/stamity-review-gate.mjs:52`).
  Rollback is a re-sync at the prior version.
- **Proof:** `test/roster/roster.test.ts`, `test/roster/modelLadder.test.ts`, `test/corpus/invariants.test.ts`
  (invariant 16), `test/corpus/commands/work.test.ts`, `test/corpus/agents/spine.test.ts`; QA.

### REQ-FLOW-065 — The security lens fires by a tested class list

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p1d-classify-security-row`,
`p5a-security-classifier`, `p5g-audit-first`, `p5b-security-trigger-rows` and `p5c-security-in-the-flow` and their fix
rounds.

- **The path rows** live in one list, the trigger roster's security row, which the classifier reads: a path it
  matches is `security-sensitive` whatever the class file says (`src/roster/triggers.ts:99-179`;
  `src/change/classify.ts:41-50`, `:890-893`). The run added the install-steering files (`.npmrc`, `.yarnrc`,
  `.yarnrc.yml`, `.pnpmfile.cjs`, `npm-shrinkwrap.json`; `review/159`), CI workflows and composite actions
  (`.github/workflows/`, `.github/actions/`, `action.yml`, `action.yaml`; `review/164`), shell and PowerShell scripts,
  container builds (`dockerfile`, `dockerfile.*`, `*.dockerfile`, `containerfile`, `containerfile.*`,
  `*.containerfile`; `review/169`, `review/198`), the client hook folders and settings named inside the client
  configuration folders (`.claude/hooks/`, `.cursor/hooks/`, `.codex/hooks/`, `.github/hooks/`, `.stamity/hooks/`,
  `.stamity/generated/hooks/`, `.husky/`, `hooks.json`, `.claude/settings.json`, `settings.local.json`,
  `.vscode/settings.json`; `build/63`), the manifest's hooks directory at `.config/stamity/hooks/` (`review/181`),
  Codex's `.codex/config.toml`, where its MCP servers are written (`review/180`), and the MCP server files
  (`.mcp.json`, `mcp.json`) (`src/roster/triggers.ts:119-153`). A bare `hooks/` segment is no row, so front-end hooks
  stay out; a repository whose own hook code is security-relevant places it through its class file, as this one places
  `src/hooks/**`. A top-level `hooks/` folder, the manifest's third documented hooks directory, is no row either,
  since no pattern form anchors a segment to the root, so a repository using it places it through its class file too
  (`:82-98`; `.stamity/change-classes.json:11`; `review/181`). Two pattern forms were added, a basename inside a named
  folder and a basename prefix (`src/roster/triggers.ts:49-60`, `:289-302`).
- **The Trigger table** of the security agent states the rows, adds "CI and release" and "Client hooks and settings",
  and says the classifier also places a change there by a changed code line (`content/agents/stamity-security.md:30-41`);
  a parity test holds table and row in both directions.
- **Topic words** gain `workflow`, `release`, `hook`, `shell`, `file deletion` and `network call`
  (`src/roster/triggers.ts:170-175`), and they may add a lens and never remove one
  (`content/commands/st-work.md:246-247`).
- **The line rules** are four call-shape families — `process-spawn`, `delete-or-overwrite`, `network-or-registry`,
  `secret-name` — each word-bounded with its opening parenthesis; `secret-name` counts only where a name is assigned,
  or keyed to, a string literal or an environment value, never a literal that is wholly one `${…}` placeholder
  (`src/change/classify.ts:175-224`). They read JavaScript, TypeScript and Python files, by extension or by a
  first-line shebang, outside the built-in test globs; a code file of another language is named in the reason as
  read by no line rule (`:226-236`, `:520-547`; `review/85`). Names a file binds to the spawning, network and
  filesystem modules and members, by import or assignment, are collected from its first 64 KiB and its hunk lines
  (`:251-252`, `:359-393`; `review/124`, `review/145`, `review/175`, `review/199`). Added and removed lines count,
  context lines only in a hunk that also removes one, and a hit names the rule and where, never the text (`:567-596`).
  A line longer than 262,144 characters (`256 * 1024`, counted as string length, not bytes; `:249`) is not read and
  makes the class `security-sensitive`, and so does a code file the read could not show (`:1095-1119`; `review/123`,
  `review/125`, `review/138`, `review/200`) and a failed line read (`src/cli/commands/gate.ts:1125-1128`;
  `review/87`).
- **The change read** unites the work tree's and the index's patch against the base (`review/89`) with every flag a
  configuration could turn pinned (`-U3`, `-W`, `--text`, no external diff, colour or textconv, fixed prefixes), names
  each section from the `-z` name list, reads every untracked file whole, leaves binaries out by a numstat pre-read,
  and lets a NUL in a file's first 8,000 bytes alone decide binary (`:99-111`).
- **In the flow.** The `security` lens runs at every tier when `gate classify` names the class `security-sensitive`,
  and on a trigger-path match; with no class from `gate classify` (no `Base:`, no CLI or `gate` verb) or a `reason`
  naming a failed read, it runs at every tier as for `security-sensitive` (`content/commands/st-work.md:248-251`;
  `review/162`). Both shapes of a classify carry such a reason: one that exits 1 with no class (REQ-FLOW-061), and
  one that exits 0 with `product` because a git read failed, its reason reading "the change could not be read
  (<cause>), so the class is product" (`src/cli/commands/gate.ts:1265`; `review/194`, `review/195`). `## Dials`' light and standard rows
  state the same rule in their own cells, and that a lockfile's own trigger-path match waits for the audit's flag
  when the checks name `dependency-audit` (`:431-432`; `review/177`). In `/st-quick`, a `security-sensitive` class
  fires the `Security-sensitive surface` row: the whole batch moves to `/st-work` as it stands, nothing reverted,
  every applied item reported ungated, and no lens runs inside the quick lane (`content/commands/st-quick.md:165-169`;
  `review/116`). With no class — neither CLI form runs, the classify exits non-zero, or its `reason` names a failed
  read — a batch with a path the security agent's `## Trigger` table names moves the same way, and a batch whose
  paths that table does not name, a docs-only one among them, stays (`:169-173`; `review/179`, `review/189`). The
  lens reads `git log <range>` only after its findings are formed (`content/agents/stamity-security.md:179-180`).
- **Audit first.** When every path the rules placed `security-sensitive` is a `package-lock.json` and no
  `package.json` changed, the checks gain `dependency-audit` and the lens leaves, the class staying
  `security-sensitive` and the reason reading `lockfile-only bump: dependency audit first`, only when each lockfile
  proves the bump (`src/change/classify.ts:67-76`, `:1140-1145`, `:1162-1408`): its base and head copies parse at
  `lockfileVersion` 2 or 3; the index copy equals the work tree's byte for byte (`review/155`;
  `src/cli/commands/gate.ts:1151-1193`); and every `packages` entry, and every legacy `dependencies` entry
  (`review/158`), that differs between the copies carries no install script and no `link`, has a base twin (a package
  new to the graph refuses, a removal does not; `review/163`), resolves over `https` with no credentials from its base
  twin's origin, moves no `resolved` or `integrity` at an unchanged version, resolves the registry tarball of its
  own name at its head version under its base twin's path (`review/157`, `review/171`), and moves its version, if at
  all, only to a higher semver version: a lower version, a release to its own prerelease, build metadata alone, or a
  version on either side that is no semver version refuses (`src/change/classify.ts:1262-1307`, `:1344-1345`;
  `review/183`). Any other format, a missing or unread base copy, a parse failure, a raise by an unread line or an
  unscanned code file keeps the lens, the reason saying why, and a later raise puts it back
  (`src/change/classify.ts:1366`, `:1410-1428`; `src/cli/commands/gate.ts:1073-1083`).
  `/st-work` then runs the audit first and the lens only if the audit flags something; the lockfiles' own
  trigger-path match waits for that flag (`content/commands/st-work.md:252-255`; `review/168`). The audit reads every
  changed lockfile the class's `byPath` names, nested ones included, and its flag counts only the entries the bump
  adds or changes: an advisory at any severity, a licence flag, or an update-risk class other than `patch` or `minor`,
  for the bump's own version move or on the entry itself, so a `major` move flags and so does a changed entry whose
  own class is `major`, `pinned-back` or `unmaintained`; in this role the report's Risk row states both classes of
  each such entry, the move's and the entry's own; a standing condition on an entry the bump leaves alone is reported
  and does not flag; a `partial` run, an audit that cannot run, or a changed entry the audit cannot class counts as a
  flag. An entry is the bump's own when it differs from the run's base, the `Base:` commit `gate classify` read, never
  from `HEAD` or the work tree, since the units commit as they go; a base the audit cannot read makes the run
  `partial` (`content/skills/st-dep-audit/SKILL.md:121-140`; `review/160`, `review/166`, `review/178`). Amended
  2026-10-10 (run `2026-10-10_next-tier`, unit `q11c-dep-audit-writer` and its fix round; that run's ledger
  `build/39`, `review/63`, `review/64` and `review/68`): the flag read "an update-risk class other than `patch` or
  `minor` for the bump's own version move", and "a `partial` run or an audit that cannot run counts as a flag", cited
  at `:113-128`.
- **State read back as authority** is placed by path: the built-in floor holds the engine's own state and the class
  file, and each repository's class file names the code that reads state back, here `src/merge/**`,
  `src/manifest/**`, `src/runs/ledgerStore.ts` and `src/cli/engine/gitStatus.ts` (`src/change/classify.ts:640-653`;
  `.stamity/change-classes.json:3-12`).
- **Proof:** `test/change/classify.test.ts`, `test/cli/commands/gate.test.ts`, `test/roster/roster.test.ts`,
  `test/corpus/agents/specialists.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`; QA.

### REQ-FLOW-066 — Every change gets a secret scan of its added lines

From the spec delta of run `2026-10-08_product-core`, as landed by the unit `p5e-secret-scan` and lane A's and
lane C's fix rounds.

`stamity gate scan [--base <ref>]` reads the change's added lines from the project root by the read `classify` uses,
plus the lines only the scan reads: files outside the project, named from the root with `../` first, and UTF-16 files,
decoded (`src/cli/commands/gate.ts:125-143`, `:1396-1456`; `review/96`, `review/98`). With no base it reads the
uncommitted change against `HEAD` and says so (`base: null`, `scope: "uncommitted"`); with one it reads everything
since the base (`scope: "since-base"`) and the added lines of every commit since it, merges left out, so a value
committed and removed again still stops the run, and such a hit names its commit (`:1321-1322`, `:1349-1394`;
`review/112`).

- **The patterns** are the shipped `scanValueForSecrets` ones, unchanged; each added line is first taken apart into
  name and value pairs (`src/change/scan.ts:3-51`). A value that is exactly one subresource-integrity hash, yarn v1's
  `integrity` line, a `go.sum` `h1:` digest and NuGet's `contentHash` are content digests and are not read as
  credentials (`:53-64`; `review/99`, `review/134`). A `${…}` or `{{ … }}` placeholder, a value made wholly of a mask,
  and in a shell file, a Dockerfile or a `.env` file a `$` expansion, are no literal; a name that is a file path gives
  its value no credential context; a comparison is no assignment (`:22-51`; `review/126`, `review/136`, `review/140`,
  `review/143`).
- **A hit** names path, line and rule, and its commit when it came from the history, never the value; the scan has no
  allow-list and no waiver (`:75-77`; `src/cli/commands/gate.ts:1473-1477`). A hit exits 1. A change the scan could
  not read exits 1 with `ok: false` and the reason in place of hits. An added line longer than the hard cap of 262,144
  characters (`256 * 1024`, counted as string length, not bytes; `src/change/scan.ts:112`) is not read, so the run
  exits 1 with a `reason` naming it beside its hits, never clean (`src/cli/commands/gate.ts:1435-1443`, `:1458-1496`;
  `review/135`). A code file the read could not show is listed in `unscanned`, every other file left unread in
  `skipped`; the exit stays 0 for either, and the flows read the lists (`:138-141`).
- **In the flows.** Both run the scan first. A hit stops the batch or the pass, naming path, line and rule, and is
  never cleared by rewriting the value and scanning again; a hit on a deliberate fixture is the person's to settle. A
  non-empty `unscanned` list puts `secret scan: <n> files unscanned` under `Not done:`, naming the paths. A scan that
  names a `reason` did not read the whole change: a hit beside it still stops, and with none the full gates run and
  `secret scan: not run` is listed (`content/commands/st-quick.md:157-164`; `content/commands/st-work.md:188-192`,
  `:198-199`). A CLI that cannot run takes the full gates and lists `secret scan: not run`
  (`content/commands/st-quick.md:153`; `content/commands/st-work.md:198`). A `/st-work` run with no base scans against
  `HEAD`, which reads no committed work, so it lists `secret scan: not run` only when it has committed work
  (`content/commands/st-work.md:196-198`; REQ-FLOW-063).
- **Proof:** `test/change/scan.test.ts`, `test/cli/commands/gate.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`.

### REQ-FLOW-067 — A plan unit in a risk class carries a threat note

From the spec delta of run `2026-10-08_product-core`, as landed by the unit `p5d-threat-note` and the p5 group's fix
round.

`/st-plan`'s unit table gains a conditional `threat` row: for a unit whose files
`stamity gate classify --base HEAD --paths <its files>` places `security-sensitive`, its trust boundary, what it
trusts, one abuse case and the check that stops it, in at most five lines; absent otherwise
(`content/commands/st-plan.md:354`). The table is followed by the shared "Running the CLI." paragraph, whose fallback
reads that when neither form runs, the installed copy has no `gate` verb, or a classify's `reason` names a failed
read, no unit's class can be read, so every unit carries the `threat` row (`:356-357`). The delta's fallback named
only a CLI that cannot run; it was widened (`review/165`, `review/167`). A classify whose base does not resolve, an
unborn `HEAD` among them, exits 1 with such a `reason` (`src/cli/commands/gate.ts:1215-1217`; REQ-FLOW-061), so
there too every unit carries the row.

- **Proof:** `test/corpus/commands/plan.test.ts`, `test/corpus/cliCallForm.test.ts`.

### REQ-FLOW-072 — A finding names its consequence

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p8b-capture-reviewer` to
`p8f-capture-work-digest` and the p8 fix rounds.

- **The test.** For the reviewer, a finding names who or what is affected, how and in which use, with its evidence; a
  note with no consequence (wording, naming, style, comment drift, a tidier shape, a "might" with no trigger) is not a
  finding, and the report lists it and the digest counts it; a note whose consequence shows once looked at is a
  finding at the severity that consequence sets (`content/agents/stamity-reviewer.md:26-31`, `:141-142`; `review/52`).
  The implementer and the fixer carry the same test (`content/agents/stamity-implementer.md:100-104`;
  `content/agents/stamity-fixer.md:114-119`).
- **The lenses** apply their Exclusions first, then the same test; a note with a security consequence is a finding
  carried on `security:` in full, never a note left out (`content/agents/stamity-security.md:126-131`;
  `content/agents/stamity-performance.md:145-151`; `content/agents/stamity-design-quality.md:119-125`).
- **What each role does with a note.** The implementer applies a note whose fix is one line in its own unit's files and
  counts a larger one, never as a deferral, and a deferral is a finding it leaves open with its consequence
  (`content/agents/stamity-implementer.md:36-40`, `:105-107`). The fixer records notes and never applies them, and a
  reviewer's notes are never handed to it (`content/agents/stamity-fixer.md:114-119`).
- **Pre-existing defects** are recorded by the reviewer, the implementer and the fixer only when they pass the test,
  their `summary` leading `pre-existing:` (`content/agents/stamity-reviewer.md:30-31`;
  `content/agents/stamity-implementer.md:90-92`; `content/agents/stamity-fixer.md:105-108`).
- **The count.** The `findings:` digest line of the reviewer, each lens, the implementer and the fixer ends
  `notes left out: <n>`, and an inline result carries the count, never the notes (REQ-CTX-002;
  `content/commands/st-work.md:170-172`).
- **`/st-rework`.** A person's own nit, polish or cosmetic feedback is a Minor finding, never a note: their ask is its
  consequence (`content/commands/st-rework.md:110-114`; `review/72`). A leftover-scan hit with no named consequence
  is a note, listed under the phase-4 table and counted, never routed; the proof block counts notes beside the
  findings (`:125-126`, `:159-161`, `:272-275`).
- **The findings grammar** — one JSON object per line, `id`, `severity`, `locator`, a `summary` of at most 300
  characters, and where true `decision_needed` and `security` — is spelled in the implementer's, the fixer's and the
  spec-author's return contracts (`content/agents/stamity-implementer.md:118-122`;
  `content/agents/stamity-fixer.md:127-131`; `content/agents/stamity-spec-author.md:178-182`).
- **Proof:** `test/corpus/agents/severityScale.test.ts`, `test/corpus/agents/executionReturns.test.ts`,
  `test/corpus/commands/work.test.ts`, `test/corpus/commands/feedbackPair.test.ts`.

### REQ-FLOW-073 — One severity scale in every role that raises findings

From the spec delta of run `2026-10-08_product-core`, as landed by the units `p8a-severity-scale` and
`p8d-capture-perf-design-lenses`.

The reviewer, the security, performance and design-quality lenses, the implementer and the fixer each end on the same
`## Severity` section: Critical, a defect that breaks a supported use, loses data or opens a security hole on the
change's path; Warning, wrong or missing behaviour a user or maintainer meets in a supported use, or a change that
makes an existing instance worse; Minor, a true defect with a small, named consequence; each with one example; then
"A note with no consequence is not a finding; no findings is a good result."
(`content/agents/stamity-reviewer.md:217-228`; `content/agents/stamity-security.md:182-193`;
`content/agents/stamity-performance.md:200-211`; `content/agents/stamity-design-quality.md:175-186`;
`content/agents/stamity-implementer.md:147-158`; `content/agents/stamity-fixer.md:158-169`). One test holds the six
sections byte-identical. `/st-rework`'s severity vocabulary reads the same three definitions
(`content/commands/st-rework.md:20-22`).

- **Precedence** (`review/53`): where the shared scale reads otherwise, the performance lens's budget rule decides its
  levels — `Critical` only on a breached declared budget, and with no declared budget over the surface the strongest
  finding is a `Warning` — as `/st-work`'s Specialist pass states (`content/agents/stamity-performance.md:122-126`;
  `content/commands/st-work.md:271-272`). The reviewer's own Critical rows stay (`content/agents/stamity-reviewer.md:51-55`).
- **Proof:** `test/corpus/agents/severityScale.test.ts`.

### REQ-FLOW-068 — `/st-work` reads the inbox rows that match its change

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q1a-inbox-store`, `q1b-records-gate-parser`,
`q9b-inbox-schedule-grammar` and `q1t-frame-inbox-read` and their fix rounds. Every `path:line` in REQ-FLOW-068 to
REQ-FLOW-077 reads at `a60cb496`, but for the three `content/commands/st-plan.md` ranges the lead's follow-up pass
re-pointed to `9a0ba4cf` (REQ-FLOW-070's return line; REQ-FLOW-077's `/st-plan` bullet). The ranges of
`content/commands/st-board.md`, `content/commands/st-rework.md` and `content/skills/st-qa/SKILL.md` that the
whole-branch review's fix round moved, and the `content/commands/st-work.md` ones inside lines 24 to 30, read at
`5cd61743`. The ranges of `src/cli/commands/ledger.ts` that reach past its line 896 and of `src/runs/inboxStore.ts`
that reach past its line 296, here and under `## Risks` and `## Concerns`, read at `cb73f8f1`: the fix batch for the
pull request's review bot (`review/105` to `review/107`) moved them, and each was re-pointed to the lines that hold
its text.

Frame reads and surfaces the deferral inbox rows whose paths overlap the change's files through the `ledger` verb's
`inbox` query, which returns those rows, the rows it always shows, and its total and unmatched counts; from a bare
intent it queries again with the plan's files (`content/commands/st-work.md:21-23`).

- **The query.** `stamity ledger inbox` is the fourth subcommand of the hidden `ledger` verb, and it writes nothing
  (`src/cli/commands/ledger.ts:22-36`, `:1208-1213`, `:1240-1242`). A row matches by `--paths` when its location or
  one of its `files:` entries names a query path — the same path, a folder on either side, or a bare file name against
  a path's last segment — by `--plan` when its `Ref:` path or its location is the plan, by `--area` on a whole word
  when its location names no path, and by `--due [date]` when its `by:` day is on or before the day, the clock's UTC
  day when the flag carries none. A row tagged `critical-deferred` or `decision-waiting` matches every query, and a
  query with no filter matches every row (`src/runs/inboxStore.ts:46-47`, `:345-357`, `:375-400`, `:412-431`;
  `src/cli/commands/ledger.ts:858-874`).
- **The output.** A count line, `inbox: <total> rows · <matched> matched · <unmatched> unmatched · <unparsed>
  unparsed · <skipped> skipped`, ending `· <n> due by <day> · <n> triggers` under `--due`; one line per matched row,
  `<line> <severity> · <location> · <description>[ · <tag>] (<matched by>)`; then the unparsed lines and the skip
  lines. The JSON document carries `inbox`, `total`, `matched`, `counts`, `unmatched`, `problems`, `skipped`,
  `truncated`, `due` and `triggers`. An absent inbox prints `inbox: absent`, and every report exits 0 (`:1004-1012`,
  `:1082-1100`, `:1165-1201`).
- **The screen.** The inbox is user-tier state any writer can author, and these lines land in a run's context, so
  every bullet, parsed or not, is screened before anything of it prints: against the block-severity rows of the three
  catalogs the session-start screen composes, without that screen's network-vocabulary filter, so the exfil-signal
  rows stay in (`:696-710`). A line is read as written and as it prints, each beside its copy with invisible
  characters stripped and that copy's normalized form (`:737-769`); a parsed row's printed fields are then screened
  one by one, an unparsed line's message alone, and each matched row's line once more as composed (`:771-822`,
  `:1127-1133`, `:1143-1153`). A hit prints `skipped: <line> (<pattern id>)`, never the row's text nor its parse
  message. A bullet longer than 4,096 UTF-16 code units is skipped unscreened, as `over-length` (`:712-724`,
  `:1102-1107`). Every printed field passes `sanitizeLabel` (`:976-997`, `:1170-1173`).
- **Withheld rows.** A row the screen hits that still parses, and whose severity and location each pass the screen
  alone, is withheld rather than dropped. A copy holding its line, severity and location goes to the match, with its
  always-shown tag, its `by:` day and its `files:` entries where each passes the screen alone, so the row still
  matches by its location, its files, its day and that tag. Matched, it prints `<line> <severity> · <location> ·
  withheld by the screen (<pattern id>); read it by hand` in place of its skip line; its description, writer, `Ref:`,
  trigger, deferral date and rationale reach neither the match nor the output, and its JSON entry carries the pattern
  id under `withheld` with `description`, `source` and `ref` null (`:829-856`, `:976-1002`, `:1114-1126`).
- **The caps.** The unparsed lines and the skip lines are listed up to 50 each, then one `unparsed: … +<n> more` or
  `skipped: … +<n> more` line. The count line keeps the whole numbers, and the JSON `problems` and `skipped` hold the
  first 50 of each, with the number left out of each under `truncated`. The matched rows are not capped (`:726-735`,
  `:1014-1021`, `:1190-1197`). Amended 2026-10-10 (the whole-branch review's fix round, its code part; `review/78`): the
  JSON `skipped` lists the bullets the skip lines name, up to 50, the rest counted under `truncated.skipped`; a withheld
  row the query matches has no skip line and is not among them, and stands under `matched` with its pattern id as
  `withheld`. Before it the list was cut to 50 with those rows still in it (`src/cli/commands/ledger.ts`, by file).
- **A refused read.** The query reads the inbox only as a regular file of at most 1,048,576 bytes inside the
  repository: each path segment is `lstat`ed top down, and the open takes `O_NOFOLLOW` where the platform has it. A
  symbolic link, a non-file or a larger file is refused as `VALIDATION_ERROR`, and the refusal's `next` says not to
  read the file whole in the query's place and to report the refusal as a finding (`:693-694`, `:876-974`). Amended
  2026-10-10 (the fix batch for the pull request's review bot; `review/105`, `review/106`): a hard link is refused as
  a symbolic link is, and the ceiling is held by the read itself. A regular file with more than one link is a second
  name for bytes another name owns, and that name can sit outside the repository; the query refuses it before any
  byte is read, on the walk's `lstat` and again on the open descriptor's own stats, since a name made between the
  two shows only there. It reads the link count through the one predicate the write paths use
  (`src/merge/atomicWrite.ts:136-138`), and its message reads `ledger inbox refused .stamity/inbox.md: inbox.md is a
  hard link`. The two size checks before the read are fast refusals on a size taken earlier; the read takes
  1,048,577 bytes at most from the open descriptor and refuses when the last one is there, naming the size as `more
  than 1048576 bytes`, so a writer that grows the file after its size was read gains nothing, and an inbox of
  exactly 1,048,576 bytes is read. The refusal's `next` ends on the condition the query runs again under: a regular
  file with one link, of at most 1048576 bytes, inside the repository (`src/cli/commands/ledger.ts:876-974`). Before
  it a hard-linked inbox was read as the repository's own, and the ceiling was checked only on the size taken before
  the read.
- **In Frame and at the close.** A row the query withholds or skips is listed as it prints, the person's to read, and
  Frame never opens the inbox for it. Frame reads the whole file, and says so, only when the CLI or that query is
  absent; any other failure — a refusal, a crash, a failing exit — is a finding naming it, never a whole-file read
  (`content/commands/st-work.md:24-27`). The close lists such a row the same way and never decides it (REQ-FLOW-074).
  `fill` and `/st-plan` still read the inbox file whole (`content/commands/st-board.md:416-417`).
- **Amended 2026-10-10** (the whole-branch review's fix round; `review/90`, `review/97`). The row the query cannot parse
  has a reader too: Frame's sentence reads "A row it withholds, skips or cannot parse is listed as it prints, the
  person's to read or fix; never open the inbox for it" (`content/commands/st-work.md:24-25`; its subject read "A row it
  withholds or skips"), and at the close an `unparsed: <line>: <message>` line is listed as it prints, the person's to
  fix as a skipped row is (`content/commands/st-board.md:414-416`). The never-open floor is Frame's alone, where the
  board's sentence read "`/st-work`'s Frame and close never open the inbox for such a row". Where the client's edit tool
  reads a file before it writes, the close's write to the inbox reads it whole: the text of a withheld or skipped row is
  data the close never acts on or repeats, and the row is still listed as it printed, with no disposition (`:417-421`).
- **One grammar, two readers.** The parser is `parseInbox` (`src/runs/inboxStore.ts:268-286`); the query and the
  records gate both read it, and the gate holds the committed inbox to it (`:29-31`). The row grammar is
  REQ-FLOW-076's.
- **As built, where the delta differed:**
  - The delta gave the whole-file read to "a CLI that cannot run at all (absent, or it crashed)". It landed narrower:
    only an absent CLI or an absent `inbox` query earns it, and a crash is a finding, as a refusal is (`build/16`).
  - The delta said Frame reads the matched rows. The landed step says "Read and surface", and gives a skipped line the
    never-open rule a withheld one has (`build/15`, `review/28`, `review/29`, `review/36`).
  - The delta named three views of a line. The built screen also reads the line as it prints, since `sanitizeLabel`
    drops control characters no other view removes (`review/9`); it screens the composed line (`review/25`), skips an
    over-long bullet unscreened (`review/11`) and caps the two lists (`review/27`).
  - The delta's withheld row matched by location and `files:`. The built copy also keeps its `by:` day and an
    always-shown tag, each only when it passes the screen alone.
- **Expand/contract:** an added subcommand of a hidden verb, and a narrower read at Frame. Rollback is a re-sync at
  the prior version, which restores Frame's whole-file read. The consumers are `/st-work`'s Frame and close and the
  records gate.
- **Proof:** `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts`, `test/records/ledgers.test.ts`,
  `test/corpus/commands/work.test.ts`, `test/architecture/boundaries.test.ts`; must-hold
  `work-persisted-plan-asks-once`; QA.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet

From the spec delta of run `2026-10-10_next-tier`, as landed by the unit `q2-qa-rows` and its fix round.

A row needs a person for one of three kinds only: a rendered surface a person must look at (a page, a screen, a style
or an image as it renders), a live third-party client or account, and a step that cannot be undone. Every other row is
auto-proven: where no artifact covers it yet, the run's test-runner executes its check before the table is built, and
the row points at that result (`content/skills/st-qa/SKILL.md:38-43`).

- **The class clause.** A change whose class, `gate classify`'s as the caller passes it, is `docs`, `records` or
  `tests` emits the line "no walk-through required — <class> only", with no sign-off block and no ask, unless it
  changes a path the project's site build renders (its pages, styles or images) or a path the classify hands the
  `design-quality` lens; then it emits one person row, the changed page renders and reads right and the links to and
  from it resolve, followed by the sign-off block. With no class passed, the trigger table decides (`:51-57`).
  `/st-work` hands the skill the class and the lenses at its QA step (REQ-FLOW-017, amended 2026-10-10).
- **Amended 2026-10-10** (the whole-branch review's fix round; `review/94`, a security finding). One row is held to
  more: the negative row a security-adjacent path derives (`:35`) is auto-proven only where a committed test's assertion
  covers it, by the Auto-prove pass's rule 1, the test source `file:line` beside the runner's command and outcome. A
  check run once for the row is not proof for it, and with no such test it stays on the human path (`:45-49`,
  `:100-104`). Every other row keeps the rule above. `/st-work`'s QA step restates none of it: it hands the skill the
  class and the lenses (`content/commands/st-work.md:280-281`).
- **As built, where the delta differed:**
  - A row whose check is missing, cannot run or fails stays on the human path under the Auto-prove pass's rule 2
    (`:43-44`, `:105-107`; `review/2`). The three kinds bound which rows are created for a person; missing evidence
    is still never scored as a pass.
  - The one person row also checks that the links to and from the changed page resolve (`:55-57`; `review/4`).
- **Proof:** `test/corpus/skills/flow.test.ts`, `test/corpus/commands/work.test.ts`; must-hold
  `qa-bare-signoff-records-unwalked`; QA.

### REQ-FLOW-070 — Plan-lint L5 reports plan size

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q3a-plan-size-script`,
`q3b-plan-size-text`, `q10b-flow-close-pointers` and `q11a-plan-writer` and their fix rounds.

The structural coverage script reports four advisory codes, each with the plan's path, the heading line of the unit or
the entry, and a message (`content/skills/st-verify/scripts/spec-plan-coverage.mjs:268-276`):

- `unit-size`, a unit spanning more than 60 lines, and `unit-oversize`, more than 100 (`<unit> spans <n> lines`);
- `unit-prewritten`, a fence marker line, or a run of five or more lines that start with `>`, inside the unit
  (`<unit> carries prewritten text at line <n>`; `:100-109`);
- `delta-verbose`, a Spec delta entry holding more than six non-blank lines below its heading (`<id> runs <n> lines`;
  `:156-161`).

A unit starts only at an unindented `### ` line outside a fence, so an indented heading-like line is text, and its span
runs to the line before the next such `### ` or `## ` heading, trailing blank lines left out (`:142-144`, `:187-198`,
`:269-270`). The four codes are advisory: they change neither the script's status nor its exit code (`:98-99`,
`:277-278`, `:295`).

`/st-plan` names them as plan-lint check L5, "Plan size (advisory)", whose action never blocks the write
(`content/commands/st-plan.md:286`), and its return line reads
`L1 pass|fail · L2 pass|fail · L3 pass|fail · L4 pass|fail · L5 none|<n> advisory|not run` (`:416-417`). `/st-rework`
runs the same gate, names `L5` as advisory, and closes its own line with `R1 pass|fail`
(`content/commands/st-rework.md:245-251`, `:274-275`). The verify skill names the four codes as L5
(`content/skills/st-verify/SKILL.md:26`).

- **As built, where the delta differed:**
  - The return lines carry a third value, `L5 not run`, where the coverage script could not run, never a claimed pass
    (`content/commands/st-plan.md:416-417`; `review/39`).
  - A delta entry is measured whether its heading is the bare `### REQ-…` or carries its disposition first
    (`### ADDED REQ-…`, MODIFIED, REMOVED); only the bare form defines a requirement provisionally
    (`spec-plan-coverage.mjs:157-166`; `build/7`, `review/12`).
- **Proof:** `test/authoring/specPlanCoverage.test.ts`, `test/corpus/commands/plan.test.ts`,
  `test/corpus/commands/feedbackPair.test.ts`; must-holds `plan-lint-three-fails-returns-blocked-ambiguity` and
  `rework-next-step-derived-from-run-state`.

### REQ-FLOW-071 — Copilot sub-agents receive the charter

From the spec delta of run `2026-10-10_next-tier`, as landed by the live check `q6-copilot-charter-check` and the unit
`q6b-copilot-instructions-key` and its fix round.

Every Copilot custom agent the engine emits carries `include-custom-instructions: true` in its frontmatter, after
`target` and before `tools`, so an agent run as a sub-agent loads the repository instruction files. Prompt files carry
no such key (`src/adapters/copilot.ts:486-520`, the line at `:511`; `:536-549`).

- **The evidence.** The key is the CLI's since 1.0.86, by its changelog, and sits in the 1.0.89 loader's frontmatter
  keys. A live sub-agent check on Copilot CLI 1.0.89 on 2026-10-10 found that an agent dispatched through `task`
  without the key loads no `AGENTS.md`, so the charter, the invariants and the repo facts never reach it (`:473-477`;
  `.stamity/runs/2026-10-10_next-tier/record.md`, which records the live check). That check proved the gap, not the
  key's effect. REQ-FLOW-023's check of 2026-09-30 ran the agent as the session's own, where the instructions
  load, and its disposition holds for that route.
- **The capability row** `sub-agent-instructions` names that evidence, the `--no-custom-instructions` override as the
  CLI command reference's claim, unverified on 1.0.89, and the cloud agent's undocumented handling of the key
  (`:205-219`); `agentsFormat` names the key (`:171-172`).
- **As built, where the delta differed:** the delta said the row names "the `--no-custom-instructions` override". The
  landed row marks it unverified: no live run passed the flag (`review/21`, `review/23`). No live run has yet loaded
  an agent carrying the key either, so its effect rests on the changelog and the loader's key list (`build/13`).
- **Expand/contract:** one added frontmatter key on every emitted Copilot agent. Rollback is a re-sync at the prior
  version. The APM package writes its own Copilot agents with `name` and `description` only, so an APM install gets
  no such key (`scripts/generate-apm-package.mjs:601-606`; `build/12`). The accepted risk is in `## Risks`.
- **Proof:** `test/adapters/copilot.test.ts`, `test/emit/capabilityMatrix.test.ts`; the live check; QA.

### REQ-FLOW-074 — The close decides every leftover

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9t-board-inbox-rules`, `q10a-work-close`
and `q10b-flow-close-pointers` and their fix rounds. The rule's text is `/st-board`'s "Leftovers at a close" bullet
(`content/commands/st-board.md:401-451`), which `/st-work`'s close points at (`content/commands/st-work.md:302-305`).

- **The set.** Before asking, the close runs `stamity ledger inbox --due --paths <the changed paths>` and takes every
  inbox row tagged `decision-waiting` first, then the due and touched rows and each ledger row neither fixed nor
  rejected, Minor rows included; the notes left out ride as one line, titles on request
  (`content/commands/st-work.md:302-305`; `content/commands/st-board.md:401-405`).
- **The line.** Each leftover reads
  `L<n> <severity> · <location> · <summary> → fix now | schedule: <place>, <by or when>, <files> | drop — <evidence>; would change if <condition>`,
  after the `decision-waiting` rows, Critical and Warning first and never pre-set to drop, then `Notes (<p>): drop`
  (`content/commands/st-board.md:405-408`).
- **The answers.** Accept the recommendations; change rows in one line (`L2 fix; drop L1: <reason>; show L3`); or
  stop (`:422-424`).
  - Fix now runs one fix round, offered only while the review cap leaves a round and outside the files of an open
    person QA row; a fix that fails is reverted and scheduled, `fix-now failed: <gate or finding>` in its description
    (`:425-429`).
  - Schedule closes the row `deferred` and appends it under the schedule rule, or retires it to a plan, board or
    handoff place with the Removal rule's `scheduled` value (`:429-431`).
  - Drop closes the row `deferred` and retires it at once, `cut <reason>`, so it never reaches the inbox. Only the
    person drops a Critical or Warning, retired `cut accepted risk: <reason>` and kept on `Not done:` (`:431-434`).
  - **Amended 2026-10-10** (the whole-branch review's fix round; `review/91`, `review/96`). The third answer reads "or
    stop, every leftover row on `Not done:`", where it read "every leftover on": the notes are no row of that list, and
    a stop drops them as no answer does (REQ-FLOW-075). `show` prints a note's title; on a withheld or skipped row it is
    refused, since the person reads that row by hand (`:423-425`).
- **An inbox row the answer decided** follows the Removal rule: a drop retires it and removes its bullet; a plan,
  board or handoff place retires it there and removes its bullet; a new date or trigger removes its bullet and appends
  one row under the schedule rule carrying the same `Ref:`. Each removal adds an `- inbox retired:` line naming its
  disposition. Nothing retires a row without an answer, and a row no answer reached stays as it is (`:390-398`;
  `content/commands/st-work.md:383-390`).
- **A withheld or skipped row** (REQ-FLOW-068) is listed as it prints, the person's to read, and never decided: the
  close offers no disposition for it and applies none, and it stays in the inbox until the person edits it or hands
  over its `Ref:` with an instruction (`content/commands/st-board.md:408-414`; `content/commands/st-work.md:387-389`).
  An `unparsed:` line is listed as it prints too, the person's to fix as a skipped row is, and the close's write may
  read the inbox whole (`content/commands/st-board.md:414-421`; REQ-FLOW-068, amended 2026-10-10).
- **Minor rows reach the person here.** Only Critical and Warning findings reach the QA checkpoint; the run closes its
  own Minor rows through the close's leftovers part, where each reaches the person as a leftover with its
  recommendation, and before the close a Minor row reaches the operator only when its disposition is itself ambiguous
  (`content/commands/st-work.md:261-267`).
- **An empty part drops out;** with none left, there is no ask (`:306`). With no response the rule is
  REQ-FLOW-075's, beside "leave uncommitted".
- **The other flows.** `/st-pr-resolve` decides each DEFER row in its phase-3 triage ask and adds no closing ask
  (`content/commands/st-pr-resolve.md:323-325`). `/st-rework` decides its DEFER rows at phase 4's routing table and
  asks no leftovers question at its handoff (`content/commands/st-rework.md:262-265`). `/st-quick` has no leftovers
  ask (REQ-FLOW-077).
- **As built, where the delta differed:**
  - The delta said "the answer is applied before the record is written". No sentence states it in those words; what
    the body states is the close gate, which reads its own ledger before writing the record and refuses while any row
    reads `open` (`content/commands/st-work.md:374-376`).
  - `stop` is defined: at a close that asks this question it fixes nothing and otherwise handles rows as no answer
    does, and nothing is fixed, merged or committed; another ask's own `stop`, as at a plan handoff, keeps its
    meaning (`content/commands/st-board.md:442-449`; `review/48`).
  - A withheld or skipped row is never decided, where the delta had the close list it "among the leftovers the same
    way" (`review/42`).
  - `/st-rework`'s rows are decided at phase 4, where the plan had them ride its handoff ask (`review/52`).
- **Proof:** `test/corpus/commands/board.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/corpus/commands/feedbackPair.test.ts`; must-holds `work-persisted-plan-asks-once` and
  `work-proof-block-fields`; QA.

### REQ-FLOW-075 — An unattended close never drops a real defect

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9t-board-inbox-rules` and
`q10a-work-close` and their fix rounds.

With no answer, only notes are dropped and only fixes the run's plan covers are made. Every other leftover from the
run's own ledger is appended tagged `decision-waiting`, its recommendation in the description and
`when: next attended close`; an inbox row the change touched or found due, or one already tagged `decision-waiting`,
stays as it is, with no copy. Each is listed on `Not done:` and counted as scheduled in the leftovers line
(REQ-CTX-020); the record's `Status:` names how many wait tagged `decision-waiting`, and the next attended close asks
about every `decision-waiting` row first. A real defect is never dropped by default
(`content/commands/st-board.md:434-442`, `:451`).

- **Always shown.** A row tagged `decision-waiting` matches every `inbox` query (`src/runs/inboxStore.ts:46-47`,
  `:398`), and board triage takes such rows second, after `critical-deferred`
  (`content/commands/st-board.md:372-378`).
- **Stop.** The answer `stop`, at a close that asks the leftovers question, handles rows as no answer does and fixes
  nothing: each leftover from the run's own ledger closes `deferred` and is appended tagged `decision-waiting` with
  `when: next attended close`, each inbox row stays as it is, each is listed on `Not done:` and counted as scheduled
  (`:442-449`). The notes are dropped there as with no answer, so the answers line names every leftover row on `Not
  done:` and no note (`:423-424`; amended 2026-10-10, the whole-branch review's fix round, `review/91`).
- **As built, where the delta differed:** the delta did not define `stop`, and named the `Status:` count in no
  entry; both are the landed bullet's (`review/48`).
- **Proof:** `test/corpus/commands/board.test.ts`, `test/corpus/commands/work.test.ts`,
  `test/runs/inboxStore.test.ts`; QA.

### REQ-FLOW-076 — A scheduled item names a place, a date or a trigger, and its files

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q9a-disposition`,
`q9b-inbox-schedule-grammar` and `q9t-board-inbox-rules` and their fix rounds.

- **Inbox rows.** After `source:` and the optional `Ref:`, a row carries optional fields in any order, each at most
  once: `by: <YYYY-MM-DD>` or `when: <trigger>`, never both; `files: <path>, <path>`, each entry one path with no
  space; one tag word; one bare `<YYYY-MM-DD>`, the deferral date; and `rationale: <rest of line>`, last
  (`src/runs/inboxStore.ts:9-20`, `:140-208`; `content/commands/st-board.md:354-358`). Every row below the inbox's
  heading `## Rows under the schedule rule`, to the end of the file, carries `by:` or `when:`, without which it does
  not parse; rows above it are older and stay valid without (`src/runs/inboxStore.ts:22-24`, `:49-50`, `:246-250`,
  `:277-279`). `when: touched` needs a path, in the location or in `files:` (`:243-245`). A writer appending where
  the heading is absent adds it first, at the end of the file (`content/commands/st-board.md:361`).
- **Triggers.** A trigger made only of vague words (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`) and
  filler words, one of filler words alone (`at some point`), one that names `hygiene batch` at all, or one holding no
  letter or digit is refused, wherever its row stands (`src/runs/disposition.ts:40-80`, `:175-199`;
  `src/runs/inboxStore.ts:178-184`). Amended 2026-10-10 (the whole-branch review's fix round; `review/89`, shaped by
  `review/99` and `review/100`): `when:` names an event and never holds a day. A trigger holding a `YYYY-MM-DD`-shaped
  day, alone or among other words, is refused, so its row does not parse; a day is written `by: <YYYY-MM-DD>`, the one
  field the `--due` read takes. A `YYYY-MM-DD` that opens a run id, followed directly by `_` and a letter or digit as in
  `<UTC date>_<slug>`, is no day and may stand there (`content/commands/st-board.md:366-368` for the rule; the parser's
  side is that round's code part, `src/runs/disposition.ts` and `src/runs/inboxStore.ts`, by file).
- **Retire values.** From 2026-10-10 (`SCHEDULE_RULE_FROM`, `src/runs/disposition.ts:37-38`) a new `retired` value
  is one of three shapes, a keyword optionally followed by a colon: `fixed <ref>`; `cut <reason>`,
  `cut accepted risk: <reason>` included; or `scheduled <place> · by <YYYY-MM-DD>` or
  `scheduled <place> · when <trigger>`, split at the last ` · `, the place written
  `plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or `handoff <path>` (`:5-17`, `:201-279`,
  `:287-348`). Any other value is refused by `ledger close --retired` with `why` and `next`, and nothing is written
  (REQ-FLOW-024, amended 2026-10-10). A place is text and is never resolved or opened (`:29-31`). Amended 2026-10-10
  (`review/89`): the `when` slot of a `scheduled` value is held to the same day rule, so `scheduled <place> · when <a
  day>` is refused and a day is written `· by <YYYY-MM-DD>`.
- **Free text says something a reader can check.** A trigger, a `fixed` reference, a `cut` reason, an accepted-risk
  reason and a board item whose every word is a vague or a filler word are refused, and each of them, and a handoff
  path, must hold at least one letter or digit. In `cut accepted risk: <reason>` the reason is held to the rule
  alone. Words are compared as written, lower-cased: a look-alike letter is not folded (`:19-27`, `:250-258`,
  `:299-347`). `/st-board`'s Removal rule names the four slots beside the trigger it points at
  (`content/commands/st-board.md:398-400`; amended 2026-10-10, the whole-branch review's fix round, `review/69`: it
  named a `fixed` reference and a `cut` reason alone).
- **Coming back.** The query's `--due` returns the rows whose `by:` day is on or before the day and counts, beside
  them, the unmatched rows that wait on a `when:` trigger, which no query sees arrive
  (`src/runs/inboxStore.ts:397`, `:424-430`; `content/commands/st-board.md:387-390`). A row whose day has come, or
  whose paths a run changes, comes back to that run's close as a leftover; a kept row is never re-dated in place
  (`content/commands/st-board.md:385-387`, `:397-398`).
- **The records gate** holds the committed inbox to the parser, and holds to the grammar every `retired` value of a
  ledger whose run is dated from the cutover, and in any other ledger every value whose own date is; in a run dated
  from the cutover a value dated before its run is a problem of its own (`test/records/ledgers.test.ts:108-139`).
  Earlier rows and values stay valid.
- **As built, where the delta differed:**
  - The delta listed "an inbox row" among the places. A `retired` value's place is a plan, a board item or a handoff.
    An item scheduled to the inbox is an inbox row carrying `by:` or `when:`, and a re-dated row keeps its `Ref:`, so
    its ledger row stays accounted for and takes no `retired` value (`content/commands/st-board.md:393-394`;
    `plan/36`).
  - "Its files" binds through the reader for `when: touched` alone: such a row needs a path in its location or in
    `files:`. `/st-board`'s text also asks a row at `—` to name `files:` (`:359-360`), which the reader does not
    hold a `by:` row to (`review/62`).
  - The delta's vague-trigger list grew into the vague-and-filler rule and the letter-or-digit rule, over five
    free-text slots (`build/10`, `build/11`, `review/17`, `review/44`, `review/47`, `review/51`).
  - The delta's "the records gate refuses an inbox row … with a vague trigger" holds for a row above the heading
    too: a trigger is held to one rule wherever its row stands (`src/runs/inboxStore.ts:24-27`).
- **Expand/contract:** an added grammar with a dated cutover. A `retired` value dated before 2026-10-10 in a ledger
  of an earlier run is never read against it, and a row above the heading stays valid with no schedule field.
  Rollback is a re-sync at the prior version: the writer's check leaves, and the committed values stay valid text.
- **Proof:** `test/runs/disposition.test.ts`, `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts`,
  `test/runs/ledgerClose.test.ts`, `test/records/ledgers.test.ts`, `test/corpus/commands/board.test.ts`.

### REQ-FLOW-077 — Every inbox writer follows the schedule rule

From the spec delta of run `2026-10-10_next-tier`, as landed by the units `q10a-work-close`,
`q10b-flow-close-pointers`, `q11a-plan-writer`, `q11b-feedback-writers` and `q11c-dep-audit-writer` and their fix
rounds. The writers are the five `/st-board` names (`content/commands/st-board.md:335-340`).

- **`/st-plan`.** A follow-up appends one row, citing the plan path in `Ref:`, carrying `by:` or `when:`, and
  `files:` when its location is `—`, below the heading:
  `<severity> · <file:line or —> · <description> · source: /st-plan · Ref: docs/plans/<file>.md · by: <YYYY-MM-DD>`,
  or `· when: <trigger>` in the date's place. A follow-up's trigger is something a run can check from the repository
  or its record; one with neither, or whose trigger only the outside world fires, belongs in the plan's Drop list.
  The plan shape names two optional sections, 6 Follow-ups and 7 Drop list, and the Drop list appends nothing
  (`content/commands/st-plan.md:363-367`, `:393-404`, `:425-426`). A day is written `by: <YYYY-MM-DD>`, and `when:`
  names an event (`:399-400`; REQ-FLOW-076, amended 2026-10-10).
- **`/st-pr-resolve`.** A deferral lands as `severity · file:line · description · source: pr-resolve #<n> ·
  when: touched`, or `· by: <YYYY-MM-DD>` when the user names one, and a FIX that stays blocked lands as the same row
  (`content/commands/st-pr-resolve.md:315-318`).
- **`/st-rework`.** A DEFER row ends `· source: rework <branch> · when: touched`, with `files: <path>` when the
  location is `—` (`content/commands/st-rework.md:174-176`, `:181-183`). The critical-deferred row reads
  `Critical · <file:line> · <the consequence in one line> · source: rework <branch> · when: touched ·
  critical-deferred · <YYYY-MM-DD> · rationale: <the user's sentence>`, or `by: <YYYY-MM-DD>` when the user names
  one; at `—` it adds `files: <path>` straight after `when: touched`, or carries the user's day (`:195-204`). The
  meta row reads `Minor · — · <one line> · source: rework <branch> · when: next board fill · meta`, or
  `by: <YYYY-MM-DD>` in the trigger's place when the user names a day (`:291`). Amended 2026-10-10 (the whole-branch
  review's fix round; `review/93`, `review/89`): with no path to name, the rationale question also asks for the day, and
  with neither no row is written (`:203-204`); the meta row's alternative now ends "never a day under `when:`" (`:291`).
- **The dep-audit skill.** A deferred item lands as
  `<Warning with an advisory, else Minor> · <manifest path:line> · <package> <current> → <target>, <risk class>[, <severity> advisory <advisory id>] · source: dep-audit · files: <lockfile path> · by: <YYYY-MM-DD>`,
  or `· when: touched` in the day's place. `files:` names the lockfile that holds the entry, so a bump of that
  lockfile alone brings the row back; the severity is the word the advisory's source gave; and an advisory at
  `critical` or `high` is deferred only with a day the operator names, never with the touch trigger
  (`content/skills/st-dep-audit/SKILL.md:97-108`).
- **`/st-work`.** Its close appends each `deferred` row it schedules to the inbox below the heading, with `by:` or
  `when:`, and `files:` when the location is `—` (`content/commands/st-work.md:365-371`; REQ-FLOW-074).
- **`/st-quick` appends no inbox row** and has no leftovers ask: what a batch cannot finish escalates to `/st-work`
  by its Escalation table, and that run's close asks about what is left (`content/commands/st-quick.md:223-224`).
  It stays a retirer and no writer (`content/commands/st-board.md:341-344`).
- **The audit's flag** reads the changed entry's own risk class as well as the bump's move (REQ-FLOW-065, amended
  2026-10-10).
- **As built, where the delta differed:**
  - The delta's "`files:` when its location is `—`" is in the plan, rework, pr-resolve and work texts. The meta row
    stands at `—` with none: its default trigger, `when: next board fill`, is no touch, and the reader asks a path of
    `when: touched` alone (REQ-FLOW-076; `review/62`, `build/35`).
  - The plan's clause that `/st-quick` asks when its batch leaves a leftover was withdrawn before the build, so the
    lane offers no choice a scan hit, a red gate or a refusal could be closed around (`plan/40`).
  - `/st-rework` decides its DEFER rows at phase 4's routing table, not at its handoff ask
    (`content/commands/st-rework.md:262-265`).
  - The dep-audit row carries `files:` and the advisory's severity word, and the day rule for a `critical` or `high`
    advisory, none of which the plan's template had (`review/65`, `review/67`).
- **Proof:** `test/corpus/commands/plan.test.ts`, `test/corpus/commands/feedbackPair.test.ts`,
  `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/board.test.ts`,
  `test/corpus/skills/verifyRestTools.test.ts`; must-holds `rework-critical-deferral-record` and
  `rework-triage-revise-versus-defer`.

## Acceptance criteria

One set per requirement. Each is machine-checkable unless tagged `judgment:`. Once a test named under a requirement
exists, it is the normative record for that requirement.

**REQ-FLOW-001**

- GIVEN `stamity init` for all four clients in a fixture whose ESLint flat config is the stock recommended set, with no
  Node globals and no ignore rule for the emitted paths, WHEN ESLint lints every emitted `.mjs`, `.js` and `.cjs`
  script THEN it reports 0 errors and exits 0.
- GIVEN the same emission WHEN each script is read THEN its first line (or its second, after a shebang) is
  `/* eslint-disable */`, and the rest of the file matches the emission without that line byte for byte.
- GIVEN the same emission WHEN `test/hooks/scriptBudget.test.ts` runs THEN it passes.

**REQ-FLOW-002**

- GIVEN sync for all four clients WHEN every emitted command body, skill, rule, agent definition and hook script is
  searched for an instruction to run a stamity verb THEN none is bare: each uses the pinned form, or sits in a file
  whose one Running-the-CLI sentence defines every `stamity <verb>` in it, with `<v>` equal to the emitting engine's
  version.
- GIVEN every file under `content/` WHEN searched THEN no fenced shell line and no `Run` cell starts with a bare
  `stamity `, a `Probe` cell does only in a file carrying the sentence, no `@latest` appears outside the sentence, and
  every `npx` call of the bare `stamity` name carries `--no`.
- GIVEN a fixture set up by `npx @zomarit/stamity init`, with no `stamity` on PATH or in `node_modules/.bin`, WHEN the
  handoff, learn and ledger steps run as the emitted bodies state THEN each exits with the verb's own status, never
  127, and installs or runs nothing under an unscoped package name.
- GIVEN an installed copy (`node_modules/.bin/stamity` present) WHEN the same steps run THEN they run
  `npx --no stamity <verb>`, resolve that copy, and make no registry download.
- GIVEN init WHEN the emitted `AGENTS.md` is read THEN its maturity-tier line reads
  "change via `npx -y <package>@<v> config`", and the APM package's copy of the charter body carries `${STAMITY:CLI}`
  raw.
- GIVEN a package whose running manifest is `private: true` with no `publishConfig.registry` WHEN init or sync emits
  THEN every pinned call reads `npx --no <package>@<v>`, and no emitted file carries `npx -y <package>`.

**REQ-FLOW-003**

- GIVEN no network and no installed copy WHEN a flow reaches a handoff or learn step THEN the step writes no file, the
  closing report carries the `Not done:` line naming the step and the command, and the run does not report the step
  as done.
- GIVEN the same WHEN the orchestrator records ledger rows THEN every row parses in the ledger grammar, the committed
  tree keeps `test/records/ledgers.test.ts` green, and the run record carries `ledger: by hand (no CLI)`.

**REQ-FLOW-004**

- GIVEN the corpus WHEN the researcher dispatch sites are derived from `spawns:` and from skills naming a
  `` `researcher` brief `` THEN there are at least 9, each names the six keys, and every site but `st-ask`, `st-work` and
  `st-spec` carries the shared line verbatim; removing the line from one site fails the test naming that file.
- `judgment: reviewer` · GIVEN a `/st-plan` run and a `/st-work` run on a fixture WHEN their researchers return THEN none
  returns `BLOCKED_AMBIGUITY` naming a missing brief key.

**REQ-FLOW-005**

- GIVEN one item renaming a user-facing label in two components, plus the test queries in their two test files
  (4 files, about 12 lines), WHEN `/st-quick` classifies it THEN no threshold fires, the edit applies, and the gates run
  in a `test-runner` spawn.
- GIVEN one item changing one source file and the test file that follows it THEN the Files row does not fire.
- GIVEN a string change across three source files THEN the Files row fires and the refusal names `Files`.
- GIVEN a batch of 6 files, 2 of them tests, THEN the Files row fires.
- GIVEN the same label rename where a changed file sits on an authentication path THEN the Security-sensitive surface
  row fires.
- GIVEN a new route plus its test THEN the "Schema, API, event or migration" row fires.
- GIVEN an item a row refused WHEN the operator replies with a deadline, a role or a go-ahead THEN the reply is never
  taken as a confirmation, an approval or an authorization, and the refusal stands and restates its row
  (`content/commands/st-quick.md:58-59`; `test/corpus/commands/lightTrio.test.ts`, the case "takes no operator reply
  as a confirmation of a refused item").

**REQ-FLOW-006**

- GIVEN vitest in devDependencies, `"test": "vitest run"` and no vitest config file WHEN init runs THEN the charter
  reads `Test framework: vitest`.
- GIVEN a `[tool.pytest.ini_options]` table in `pyproject.toml`, with no `pytest.ini` and no `conftest.py`, THEN it
  reads `Test framework: pytest`.
- GIVEN no manifest signal and none of the config files THEN it reads `unknown`, as before.

**REQ-FLOW-007**

- GIVEN a Python fixture with `uv.lock` WHEN the gates render THEN they read `uv run pytest`, `uv run ruff check .`
  and `uv run mypy .`.
- GIVEN a fixture whose tools live only in `.venv/`, sources under `src/`, WHEN init runs THEN the manifest carries
  the three `gates` pins, init's output names them, and each pinned gate exits 0 from the root in a shell with no
  environment activated.
- GIVEN that initialised fixture cloned without `.venv/` WHEN `check` runs THEN it reports no drift.
- GIVEN a Python fixture with neither a lock runner nor a `.venv/` THEN the gates render exactly as before.

**REQ-FLOW-008**

- GIVEN a green setup with gates configured WHEN check runs THEN it exits 0, its closing line names
  `gates not run: lint, typecheck, test`, and no line reads `all green`.
- GIVEN a gate whose command renders `unknown` THEN a warning names that gate, and the exit code is the same as
  without the warning.
- GIVEN the gate `pytest` with no `pytest` on PATH, in `node_modules/.bin/` or in `.venv/bin/` THEN a warning reads
  `the test gate cannot be resolved — the charter says "pytest"`.
- GIVEN any check run with process spawns stubbed THEN no gate command is spawned.

**REQ-FLOW-009**

- GIVEN a deterministic defect and a report naming its input, expected output and actual output, on a repository whose
  test gate is runnable, WHEN `/st-debug` runs THEN, before any product-code edit, a test exists that fails twice on the
  current tree with a message naming the defect; the run asks no reproduction question and hands the diagnosis and that
  test to `/st-work` in the same session.
- GIVEN a report whose symptom depends on the user's environment THEN the run stops at step 3 and waits for the user's
  output.
- GIVEN `content/commands/st-debug.md` WHEN step 3 is read THEN it names both routes and the conditions that choose
  between them.

**REQ-FLOW-010**

- GIVEN a round on a fixture whose lint and typecheck pass WHEN its probes are in place THEN the implementer's return
  shows both gates `pass` on that tree before the reproduction step begins.
- GIVEN a debug stop that waits on the user WHEN the marker check runs THEN every hit carrying the run's id is listed
  with its path and line in the stop message and the open debug record.
- GIVEN a run that closes THEN the count of hits carrying its run id is 0, or the record carries the capture-later
  agreement with its date and sites.
- GIVEN every document in the tree, the emitted command files included, WHEN the marker check's pattern is searched
  THEN it finds no hit.

**REQ-FLOW-011**

- GIVEN a debug run WHEN its first mutation lands THEN the record exists under a run id ending `_debug-<slug>`, with the
  three head lines bare among its first 15, and `Status:` matches `/^status:.*\bin progress\b/im`.
- GIVEN the run closes THEN `Status:` no longer matches, and names the exit taken and the residue count.
- GIVEN `content/commands/st-debug.md` WHEN read THEN it no longer says that debug writes no run record.

**REQ-FLOW-012**

- GIVEN a repository of about 1,200 source lines and the request "create the spec" WHEN `/st-spec` asks its scope
  question THEN the first numbered option names the whole app and it is the declared default.
- WHEN that option is chosen, or no answer arrives, THEN at least one file under `docs/specs/` holds a requirement
  heading with an id in the house form and at least one GIVEN/WHEN/THEN criterion.
- GIVEN the same repository and "backfill the specs" with no scope named THEN the whole app is offered, and the default
  stays declining the sweep.
- GIVEN a repository of 5,000 or more source lines THEN no whole-app option is offered.

**REQ-FLOW-013**

- GIVEN each client's emitted test-runner definition WHEN read THEN it states: each gate once and unwrapped, the exit
  code from the tool, the `false` calibration, `unknown` never clean, and duration `not measured` when the tool gives
  none.
- GIVEN a scripted fixture gate whose call returns no exit code to a tool that also shows none for `false` WHEN the
  test-runner reports THEN that row reads exit code `unknown` with a status other than `pass`, and the verdict is `red`.
- GIVEN a Prove pass WHEN its tool calls are counted THEN each requested gate command ran exactly once.

**REQ-FLOW-014**

- GIVEN the shell-discipline test WHEN it runs over the corpus THEN it passes.
- GIVEN a shell fence using `PIPESTATUS`, `[[ ]]`, a shell array, process substitution, a `time` prefix, `echo $?`, a
  pipe into `tail` or `head`, or `sleep` THEN the test fails and names the file and line; and GIVEN an executing agent
  whose `## Shell` paragraph is cut THEN it fails naming the agent.

**REQ-FLOW-015**

- GIVEN a green result on a tree and no file change since WHEN the next Prove pass, other than the close's, runs THEN it
  cites that result by run and tree identity and runs no gate command.
- GIVEN one byte changed in a tracked file, or an untracked unignored file added, THEN the identity differs and the gates
  run.
- GIVEN a run's close THEN the proof block's `Gate results` label line names the change's class as `gate classify`
  named it (`unclear` when none ran) and the run's base commit, and the block names a green result, run on the final
  tree, of the gates that class requires. With none, the run reports `Not done:` (amended 2026-10-09, run
  `2026-10-08_product-core`, unit `p3c-work-gates`; it read "the proof block names a green result run on the final
  tree").
- GIVEN a cited result that ran only `test` THEN it covers `test` only.

**REQ-FLOW-016**

- GIVEN a `.gitignore` without these entries WHEN init or a live sync runs THEN `git check-ignore -q` exits 0 for
  `.stamity/review-gate.json`, `.stamity/review-gate.json.lock` and `.stamity/review-gate.json.tmp-1`, and sync's report
  names each entry it added.
- GIVEN a `.gitignore` whose existing rule already covers them, or a second sync, THEN `.gitignore` is byte-identical.
- GIVEN a repository where the state file is already tracked WHEN init runs THEN the output of `git ls-files --stage` is
  unchanged.
- GIVEN a live sync that the injection screen refuses at `.gitignore` THEN no emitted file was written.

**REQ-FLOW-017**

- GIVEN 5 person rows and the reply "Signed off." WHEN the checkpoint records THEN 5 rows read `accepted-unwalked` and
  none reads `walked`.
- GIVEN the reply "Walked 1–3, all pass. Signed off." THEN rows 1–3 read `walked` and rows 4–5 read `accepted-unwalked`.
- GIVEN the reply "not signing, row 3 broke" THEN no row reads `accepted-unwalked` and the checkpoint stays open.
- GIVEN any QA record THEN no row reads `walked` unless the person's reply, quoted in the record, names it or says every
  row was walked.

**REQ-FLOW-018**

- GIVEN every row auto-proven WHEN the checkpoint runs THEN no QA question is asked and the record carries
  "all N rows auto-proven" with the row count.
- GIVEN a non-interactive run THEN QA reads `Shippable: not signed` and no row reads `walked`.
- GIVEN a prior `accepted-unwalked` row and a new row with the same input hash THEN it is recorded as
  `accepted-unwalked (carried from <run-id>)`, naming the prior run id, with no question. GIVEN one input byte changed
  THEN the row is asked again.
- GIVEN a row whose Risk is `H` recorded `accepted-unwalked` THEN `Shippable` does not read `YES` and the record names
  the open `H` row.

**REQ-FLOW-019**

- GIVEN a persisted plan that settles inbox row X, and a run whose files overlap X, WHEN Frame runs THEN no question
  names X and the record lists X with the plan's disposition.
- GIVEN standard intensity and a fresh persisted plan WHEN the plan gate is reached THEN no question is asked, and the
  record holds `Default applied: plan gate → option 1, execute now (persisted plan <path>)`.
- GIVEN deep intensity THEN the plan gate asks.
- GIVEN a close with person rows, a spec delta and uncommitted changes THEN exactly one question is asked, naming all
  three, and its declared default reads "leave uncommitted".
- GIVEN no answer to that question THEN nothing is committed, no spec file changes, and QA reads `not signed`.
- GIVEN that question has been answered THEN no later turn of the run asks about committing.
- GIVEN a close with person rows, a spec delta, uncommitted changes and leftovers THEN exactly one question is asked,
  naming all four (added 2026-10-10, unit `q10a-work-close`; REQ-FLOW-074).

**REQ-FLOW-020**

- GIVEN "where is `formatTotal` defined and what does it return?" WHEN `/st-ask` runs THEN at most one researcher is
  dispatched, and every claim cites a `path:line`.
- GIVEN an impact question THEN 3–5 facets are dispatched, as the table says.
- GIVEN a named symbol defined in two files THEN the question fans out as a mechanism question.

**REQ-FLOW-021**

- GIVEN a `reviewBy` 13 days ahead THEN a warning names it. GIVEN 15 days ahead THEN none does.
- GIVEN two learnings whose modified-time order is the reverse of their `date` order THEN the index lists the newer
  `date` first.
- GIVEN any banner THEN each printed byte figure equals the byte length of the index lines it printed.

**REQ-FLOW-022**

- GIVEN init for all four clients WHEN its output is compared with the files on disk THEN the printed count equals the
  files the run wrote other than `.gitignore`, and each path it reports writing exists.
- GIVEN two clients that share `AGENTS.md` WHEN `check` runs THEN its manifest row names fewer managed paths than ledger
  rows, and names both clients.
- GIVEN an install pinned at 1.9.1 and a registry answering 1.10.0 WHEN the notice prints THEN it contains
  `npx -y <name>@1.10.0 sync` and a way to stay, and no `@latest`. GIVEN the registry answer `v1.3.0` THEN both halves
  of the banner name `1.3.0`.
- GIVEN a repository with `engines.node: "22"` and `actions/checkout@v7` in its own workflow WHEN setup emits the
  Copilot workflow THEN it carries `node-version: "22"` and `actions/checkout@v7`. GIVEN the emitted workflow as the
  repository's only workflow WHEN sync runs again THEN the file is byte-identical.
- GIVEN `init -y` with no client traces THEN the panel names claude as the default with the pinned `config set tools`
  route, and the dry run names `--tools`. GIVEN a detected or flagged client set THEN no default line prints.
- GIVEN codex selected THEN init's next steps list project trust before `codex` and the `/hooks` review after it, and
  `.codex/hooks.json` and `.codex/config.toml` are byte-identical to the emission before the unit.
- GIVEN a `.gitignore` that already covers `.env.mcp` THEN the panel names only the entries the run appended. GIVEN no
  MCP server THEN no line says "the credential file this setup uses".
- GIVEN a live `init -y --tools copilot` THEN the panel and the `nextSteps` of `--json` name the setup workflow. GIVEN a
  dry run THEN neither does.
- GIVEN `init -y` in a repository whose origin is `https://github.com/acme/demo.git` THEN the manifest's `platform` is
  `github` and the panel prints `platform: github (from the origin remote)` on its own line. GIVEN no origin THEN the
  manifest has no `platform`, and the panel prints the `none detected` line with the pinned `config set platform
  <name>` call and the values `github, azure-devops, gitlab` (added 2026-10-06; `test/cli/commands/init.test.ts:654`,
  `test/cli/commands/initPanel.test.ts:886`).
- GIVEN `init -y --maturity enterprise` on a directory that would seed `solo` THEN the manifest's `maturityTier` is
  `enterprise` and the panel reads `(tier: enterprise, …)`. GIVEN `--maturity galactic` THEN init exits non-zero naming
  the value, and no `.stamity/` is created (added 2026-10-06; `test/cli/commands/init.test.ts:581`).

**REQ-FLOW-024**

- GIVEN an inbox row whose `file:line` the run's change fixes, and which the run names as fixed, WHEN the close runs THEN
  the row is gone from `.stamity/inbox.md` and the record carries its retirement line.
- GIVEN a row the run did not name as fixed and the close's answer did not decide THEN it stays, byte-identical
  (amended 2026-10-10, unit `q10a-work-close`; it read "GIVEN a row the run did not name as fixed THEN it stays,
  byte-identical").
- GIVEN a `/st-quick` batch that fixed a named row THEN the row is gone and the batch report names it.
- GIVEN a deferred ledger row and a clock fixed at 2026-10-02 WHEN
  `ledger close --run r1 --id prove/3 --retired "fixed in r2"` runs THEN the row keeps `deferred`, gains
  `retired: "2026-10-02 fixed in r2"`, and a second run, on that day or a later one, prints `unchanged`.
- GIVEN an `open` row WHEN `--retired` names it THEN the command exits 1 and the ledger is byte-identical.

**REQ-FLOW-025**

- GIVEN the lint over `content/` WHEN it runs THEN it passes.
- GIVEN a body line that writes under `.stamity/` with a redirect, a heredoc or `tee` THEN the lint fails and names the
  file and line.
- GIVEN `content/commands/st-work.md` WHEN its Frame step is read THEN it names the file tools for `record.md`,
  `plan.md`, reports and the inbox, and forbids a shell redirect, a heredoc and `cat >`.

**REQ-FLOW-026**

- GIVEN sync with Codex selected THEN nine `.agents/skills/st-<id>/SKILL.md` files exist, each with an
  `agents/openai.yaml` that turns implicit invocation off, and Codex's skills-list total stays under 8,000.
- GIVEN tools `[claude, cursor]` THEN no `.cursor/skills/st-<id>/` and no `.claude/skills/st-<id>/` exists, and
  `.claude/commands/st-<id>.md` does.
- GIVEN sync on a tree whose ledger carries 1.10.0's `.cursor/skills/st-<id>/` files THEN they stay byte for byte, the
  sweep names each `skipped-user-content`, their rows leave the ledger, `.agents/skills/st-<id>/SKILL.md` is written,
  and every other file under `.cursor/` is byte-identical (amended 2026-10-08, unit `d1a-rendering-proof-core`; it
  read "THEN they are removed, and every other file under `.cursor/` is byte-identical").
- GIVEN Copilot selected beside Codex or Cursor THEN its capability disclosure declares the double listing.
- GIVEN a Codex plugin build THEN no touchpoint ships in the plugin, and the content skills still map under `skills/`.
- GIVEN tools `[codex]` WHEN init prints its next steps THEN they name `$st-onboard` and `$st-<id>`, and never
  `/st-onboard`.
- `judgment: maintainer` · GIVEN a live Codex session WHEN the user types `$st-work` THEN the body loads; GIVEN a live
  Cursor session WHEN the user types `/st-work` THEN it loads there too.
- GIVEN the full selection with Codex WHEN its skills list is measured THEN the nine touchpoints are not counted, 17
  rows are shown, and the shown total equals `codexSkillsListChars` (added 2026-10-06;
  `test/adapters/codex.test.ts:2087`).

**REQ-FLOW-036**

- GIVEN a `.claude/settings.json` holding `permissions.allow: ["Bash(npm test:*)"]`, `permissions.deny:
  ["Bash(rm -rf:*)"]`, a `PreToolUse` entry with matcher `Bash` running `./scripts/guard.sh`, and `model` WHEN `init -y
  --tools claude` runs THEN it exits 0, the file is written rather than skipped, and each of those members is byte for
  byte present beside the engine's rows and entries.
- GIVEN that setup WHEN `sync -y`, `sync -y --force` and `init -y --force` run THEN the deny rule and the owner's hook
  entry are unchanged after each, and no `.bak` exists.
- GIVEN a setup to which the owner added `permissions.deny` WHEN `check` runs THEN it exits 0 with no drift for the file;
  WHEN `sync -y` runs THEN the file is byte-identical.
- GIVEN the first fixture WHEN `init -y` and then `clean -y` run THEN the file is byte-identical to before setup and no
  `.bak` exists.
- GIVEN a `.claude/settings.json` to which another tool added a key after setup WHEN `clean -y` runs THEN the file holds
  that key alone and no `.bak` exists.
- GIVEN a ledger record that claims the owner's deny rule, the whole `permissions` member or the owner's allow row WHEN
  `sync -y` and `clean -y` run THEN those members survive both; GIVEN a record that claims the owner's hook entry, whose
  script lies outside `.stamity/`, THEN that entry leaves only behind a verified `.bak` and a warning names it.
- GIVEN a four-space file without a final newline, a tab-indented one, a one-line one and a CRLF one WHEN `init -y` and
  then `clean -y` run THEN each is byte-identical to before, and after `init` each is still in its own style.
- GIVEN a file whose `permissions` is a string WHEN `init -y` runs THEN the file is skipped with a message naming
  `permissions`; WHEN `check` runs THEN it exits 1 and no line of its output contains `--force`.
- GIVEN an engine hook entry the owner edited WHEN `sync -y` runs THEN the engine's entry is restored, a verified `.bak`
  holds the edit, and the warning names the entry and `.claude/settings.local.json`.
- `judgment: reviewer` · One residue is content-equal rather than byte-identical, and the unit records it: a JSON style
  `JSON.stringify` cannot write (aligned colons, inline arrays, number or escape spellings) comes back with the same
  keys and values.
- GIVEN a user hook defined in `.stamity/hooks/` WHEN `init -y --tools claude` and then `clean -y` run THEN no `.bak`
  exists; GIVEN that definition then edited, or removed, WHEN `sync -y` runs THEN one verified `.bak` exists and the
  warning names the entry (added 2026-10-07 from the build).
- GIVEN a record claiming an owner's hook entry whose command passes `.stamity/g.json` as an argument to a script
  outside `.stamity/` WHEN `sync -y` runs THEN the entry leaves only behind a verified `.bak` (added 2026-10-07 from the
  build).
- GIVEN a settings file holding a duplicate key, or a number past what a double holds exactly, WHEN `init -y` writes it
  THEN a verified `.bak` holds the previous bytes and the warning says why; GIVEN a file opening with a byte-order mark
  THEN the merged file still opens with it (added 2026-10-07 from the build).
- GIVEN a setup whose `.claude/settings.json` the owner then changes so `hooks.PreToolUse` is a string WHEN `sync -y`
  runs THEN the file is refused as `co-owned-shape` and the ledger keeps its settings rows and their record; WHEN
  `clean -y` runs THEN every engine hook script the kept file names remains (added 2026-10-07 from the build).

**REQ-FLOW-037**

- GIVEN `init -y --tools cursor` and an owner entry under `hooks.afterFileEdit` in `.cursor/hooks.json` WHEN `check`
  runs THEN it exits 0 with no drift for the file; WHEN `sync -y` runs THEN the file is byte-identical and no `.bak`
  exists; WHEN `clean -y` runs instead THEN the file holds `version` and the owner's entry alone, and no guard script
  remains.
- GIVEN `init -y --tools codex` and an owner group under `hooks.PostToolUse` in `.codex/hooks.json` WHEN `sync -y` runs
  THEN the file is byte-identical and no `.bak` exists; WHEN `clean -y` runs THEN the file holds the owner's group alone.
- GIVEN an owner `[mcp_servers.team]` table in `.codex/config.toml` WHEN `sync -y` runs THEN the file is byte-identical;
  WHEN `clean -y` runs THEN the file holds the owner's table alone.
- GIVEN a `.codex/config.toml` holding a top-level key and an owner table before setup WHEN `init -y --tools codex` and
  then `clean -y` run THEN it is byte-identical to before.
- GIVEN an owner `[features]` table that sets `hooks = false` WHEN `init -y --tools codex` runs THEN the file holds one
  `[features]` header, the owner's table is unchanged, and the run warns naming `hooks = false`; WHEN `check` runs THEN it
  exits 1 naming the file, the line and the remedy, for a quoted key as for a bare one; GIVEN one that does not set
  `hooks` THEN no warning.
- GIVEN a `.cursor/hooks.json` that does not parse WHEN `clean -y` runs THEN the file is kept, every script it names
  remains, and the report names the file for each kept script.
- GIVEN a repository set up by 1.11.0 with an owner entry added to `.cursor/hooks.json` WHEN `clean -y` runs before any
  `sync` THEN the owner's entry remains and no script the kept file names is missing.
- GIVEN a `.cursor/hooks.json` holding a foreign entry under an event key Cursor's validator does not accept WHEN
  `check` runs THEN it exits 1 naming the entry and the remedy; WHEN `sync -y` runs THEN it keeps the entry, warns
  naming it, and exits 0.
- GIVEN a foreign `{"type": "prompt", "prompt": "…"}` entry under a Cursor event WHEN `check` runs THEN that entry fails
  nothing; GIVEN a `"prompt"` entry with no `prompt`, or an entry whose `type` is neither `"command"` nor `"prompt"`,
  THEN `check` exits 1 naming it (added 2026-10-07 from the vendor re-read and the build).
- GIVEN an owner `[features]` that is no release's rendering and a ledger record or a whole-file hash claiming it WHEN
  `sync -y` runs THEN the table is byte-identical; GIVEN `features.x = 1` at the top level, or an owner
  `[[mcp_servers]]` while a server is selected, WHEN `init -y --tools codex` runs THEN the file is refused as
  `co-owned-shape` naming the key or the header's line; GIVEN 64 selected servers THEN the plan refuses naming
  `config mcp remove <id>`, and 63 pass (added 2026-10-07 from the build).
- GIVEN a repository set up by 1.6.0 with a user hook and an installed pack's hook wired directly in `.cursor/hooks.json`
  or `.codex/hooks.json`, their definitions still in place, WHEN `sync -y` runs THEN each direct entry is replaced by the
  runner's and each hook is wired once;
  GIVEN a forged legacy row and an owner's entry THEN the owner's entry remains after `sync -y` and `clean -y` (added
  2026-10-07 from the build).
- GIVEN a hooks document the sweep leaves in place — reduced to the owner's entries, refused, linked, or no reclaim
  candidate at all — WHEN `clean -y` or a client's removal sweeps THEN every engine hook script it names remains (added
  2026-10-07 from the build).
- GIVEN Copilot set up and a `.github/hooks/stamity.json` its ledger does not record, running a retired engine script
  under `.stamity/generated/hooks/copilot/` WHEN `sync --json --dry-run --force` runs THEN the preview names the script
  as a delete, and `sync -y --force` deletes exactly the previewed set; WHEN `sync --dry-run` runs without `--force`
  THEN the preview keeps the script, and `sync -y` exits 1 with both files unchanged; GIVEN a forged row and hash at an
  engine-named agent path THEN the forced preview and the forced run keep it; GIVEN that document hard-linked,
  symbolically linked, or under a `.github/hooks` folder linked outside the repository, or a `deny-scan`,
  `shared-name`, `co-owned-shape` or `import-decision` collision THEN the forced preview keeps the script (added
  2026-10-08, unit `d2-forced-preview`; `test/merge/hookFilesOwnership.test.ts`, the row 588 describe).

**REQ-FLOW-038**

- GIVEN `init -y --tools cursor` THEN `.cursor/hooks/` holds exactly `stamity-mcp-guard.mjs` and
  `stamity-subagent-guard.mjs`, and `.cursor/hooks.json` runs them on `beforeMCPExecution` and `subagentStart` with
  `failClosed: true`.
- GIVEN a repository set up by 1.11.0 WHEN `sync -y` runs THEN `.cursor/hooks/subagent-guard.mjs` and
  `.cursor/hooks/mcp-guard.mjs` are gone, the two new files exist, `.cursor/hooks.json` names only the new paths, and
  `check` then exits 0; GIVEN the old MCP guard edited by hand THEN it stays and the sync report names it.
- GIVEN all four clients and two MCP servers selected THEN every planned path outside `.stamity/` and the fixed list
  above has a `stamity-` or `st-` segment.
- GIVEN a repository set up by 1.11.0 whose `.cursor/hooks.json` is refused or linked WHEN `sync -y` runs THEN both old
  guards stay; GIVEN `check` before that `sync` THEN its reclaim lines name the old guards with the action the write
  takes; GIVEN a repository whose ledger never recorded the old names and an owner entry running
  `node .cursor/hooks/mcp-guard.mjs` THEN that entry stays the owner's (added 2026-10-07 from the build).
- GIVEN a 1.11.0 setup's unedited guards and entries — core, with a local pack's agents, or with an override agent —
  WHEN the first `sync -y` runs THEN both guards are deleted, both entries name the `stamity-` guards, and no `.bak`
  exists; GIVEN a fork's setup THEN the fork's identity proves both guards and the canonical identity keeps both.
  GIVEN an owner's own scripts at both old names under forged rows, a pinned entry, a forged co-owned hash and a
  re-pointed document hash WHEN `sync -y` or `clean -y` runs THEN both scripts and the entry stay byte for byte and no
  `.bak` exists; WHEN `init --force` runs THEN both scripts and the entry stay. GIVEN the old MCP guard edited by hand
  WHEN `sync -y` or `init --force` runs THEN the guard and the entry that runs it stay. GIVEN a setup whose ledger
  lost one Cursor agent row THEN the spawn guard and its entry stay and are named, and the MCP guard moves. GIVEN an
  old guard the owner deleted THEN its entry is still rewired. GIVEN the four fixtures THEN each hashes to its pinned
  SHA-256 and the frozen builder renders it byte for byte (added 2026-10-08, unit `d1b-cursor-guard-pins`;
  `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`).

**REQ-FLOW-061**

- GIVEN `gate classify --paths docs/x.md --json` THEN the class is `docs`, the checks are `scan`, `tests-selected`
  and `review-once`, and the reason says no base was given. GIVEN `docs/conf.py`, `docs/.vitepress/config.ts` or
  `.stamity/runs/x/run.py` THEN the class is `product`; GIVEN `docs/a.test.ts` THEN `tests`.
- GIVEN `docs/auth/AGENTS.md` or `.stamity/runs/x/claude.md` THEN the class is at least `product`; GIVEN
  `.Stamity/manifest.json` or `.stamity/change-classes.json` THEN `security-sensitive` with the security lens.
- GIVEN an unplaced path, an empty path list, or a rename from `docs/a.md` to `src/a.ts` THEN the class is at least
  `product` and the reason names why; GIVEN an unresolvable `--base`, or `--base HEAD` on an unborn `HEAD`, with or
  without `--paths`, THEN the verb exits 1, its JSON carries `ok: false`, `base: null` and a `reason` saying the base
  could not be read, and it has no `class` or `checks`; GIVEN a ref starting with `-` THEN the verb exits 2 and git
  never runs.
- GIVEN a change that edits `.stamity/change-classes.json` WHEN `gate classify --base <base>` runs THEN that path is
  `security-sensitive`, and every other path is placed by the base commit's copy, never the head's or the work
  tree's.
- GIVEN a class file with a `records` or `docs` glob `**/*.*`, `notes/**` or `*`, a `docs` glob matching every
  path, a glob over 200 characters, or a test entry starting with `-` THEN `check` fails naming the first error, and
  from a base holding that copy every change is at least `product` and only its raising entries apply.
- GIVEN a project whose `.stamity/` sits below the git top-level WHEN the verb runs from any folder of it THEN paths are
  classified project-relative, the class file is read under the project's prefix, and a changed path outside the
  project raises the class to at least `product`, or to `security-sensitive` when it is a lockfile, a workflow or the
  engine's own state.
- GIVEN a git failure reading the change's paths (a directory outside a work tree, no git binary, a timeout) THEN the
  class is `product` and the reason names the failure; GIVEN a failed read of the changed lines THEN the class is
  `security-sensitive` with the security lens; GIVEN a failed test-source read THEN `tests.full` is true and the class
  and lenses are those the change's paths and lines gave; GIVEN a failed read of a changed `package-lock.json`'s base
  copy THEN the security lens stays and the reason names the failure.

**REQ-FLOW-062**

- GIVEN a valid base map and a `docs` change to a page one test reads by a string literal THEN `tests.files` names that
  test and `tests.full` is false; GIVEN no map THEN `tests.full` is true.
- GIVEN a `config` or stronger class THEN `tests.full` is true, whatever the map selects.
- GIVEN a `records` or `docs` change no test reads THEN `tests.files` is empty and `tests.full` is false; GIVEN a
  `tests` change that selects nothing THEN `tests.full` is true.
- GIVEN a map entry whose `tests` is `"all"` and matches a changed path, a test source holding a glob literal over the
  cost bound, or a selected file the work tree lacks THEN `tests.full` is true and the reason names the cause.
- GIVEN this repository's tree WHEN `test/ci/testInputsGuard.test.ts` runs THEN it passes, and GIVEN a test that reads
  a docs page no map entry lists THEN it fails naming the pair.

**REQ-FLOW-063**

- GIVEN `/st-quick` and a one-line typo fix THEN the gate runs: the scan, `gate classify --base HEAD --json`, then the
  class's checks in a `test-runner` spawn.
- GIVEN `/st-work`'s Prove pass THEN it scans and classifies with `--base` set to the record's `Base:` commit, and on
  the final tree a `product` or stronger class runs `${STAMITY:VERIFY_GATE_ALL}`.
- GIVEN a test-runner body whose rendered CI provider reads `unknown`, or that still carries the unresolved `STAMITY`
  substitution token, THEN the final tree runs `all` whatever the class; GIVEN `/st-quick` and a charter whose
  `CI provider` reads `unknown` THEN the batch runs `${STAMITY:VERIFY_GATE_ALL}` whatever its class (amended
  2026-10-10, unit `q6t-test-runner-ci-line`; it read "GIVEN a charter whose `CI provider` reads `unknown` THEN the
  final tree runs `all` whatever the class").
- GIVEN a `red` test-runner verdict and a named report path THEN nothing is written to that path, and the rows and
  excerpts are returned in full (added 2026-10-10, unit `q6t-test-runner-ci-line`).
- GIVEN a `/st-work` run with no recorded base and committed work, a CLI with no `gate` verb, or a scan naming a
  `reason` THEN the full gates run and `Not done:` lists `secret scan: not run`; GIVEN a `/st-work` run with no
  recorded base whose work is all uncommitted, and a scan against `HEAD` with no hit and no `reason`, THEN the final
  tree runs `${STAMITY:VERIFY_GATE_ALL}` and `Not done:` lists no `secret scan: not run`.
- GIVEN a class whose checks name `review-once` and a Warning it raises THEN the Warning is fixed and closure-reviewed
  once, and no further round runs.
- GIVEN the charter THEN invariant 4 reads "Done means the gates `gate classify` names exit 0 (all if it did not run)."
  with the `Not done:` line unchanged, and `invariants_version` reads `1.2.0`.

**REQ-FLOW-064**

- GIVEN the roster THEN `DEFAULT_MAX_REVIEW_ITERATIONS` is 3 and the band 1..10; GIVEN `config set
  review.maxIterations 4` THEN 4 persists.
- GIVEN a finding still open entering the cap round (round 3, round 2 at light), a ledger row carrying two
  `re-review not-fixed` notes, or a gate red after a fix THEN a fresh fixer spawn, never the resumed one, takes it
  with the round history, one effort level above the fixer's declared one where the client takes one, and no round
  past the cap runs.
- GIVEN a client whose dispatch takes no effort setting THEN the proof block records `effort: not settable`.
- GIVEN a finding the escalation fixer leaves open THEN the run stops as `BLOCKED_FAILURE` to the person with the open
  findings attached.
- GIVEN `content/commands/st-work.md` and `content/agents/stamity-fixer.md` THEN neither names a round above the default
  cap, nor the phrase "fresh fixer on a stronger model class".

**REQ-FLOW-065**

- GIVEN `.github/workflows/ci.yml`, `.claude/settings.json`, `.cursor/hooks.json`, `scripts/x.sh`,
  `Dockerfile.prod`, `.npmrc`, `.codex/config.toml` or `.config/stamity/hooks/guard.json` THEN the class is
  `security-sensitive` with the security lens; GIVEN `src/hooks/useX.ts` in a repository whose class file does not
  place it THEN the class is `product`; GIVEN a top-level `hooks/guard.mjs` THEN the security row does not match it.
- GIVEN an added line `execSync(cmd)` in a TypeScript file outside the test globs THEN the class is
  `security-sensitive` and the reason names `process-spawn` and the path and line, never the line's text; GIVEN the
  same line in a test file THEN no line rule fires.
- GIVEN a hunk that removes a guard around an existing `rmSync(` call THEN the context line counts and the class is
  `security-sensitive`.
- GIVEN an npm lockfile v3 bump of one existing registry package to a higher semver version, staged, with no install
  script, its `resolved` the registry tarball of its own name and new version on its base twin's origin, and no
  `package.json` change THEN the checks include `dependency-audit`, the lenses omit the security lens, and the class
  stays `security-sensitive`.
- GIVEN the same bump with `hasInstallScript: true`, a package new to the graph, a `git+` or other-host `resolved`, a
  `resolved` or `integrity` moved at an unchanged version, a version moved to a lower one or to one that is no semver
  version, an unstaged copy, a `pnpm-lock.yaml`, or a base copy that does not parse THEN the security lens stays and
  the reason says why.
- GIVEN `/st-work` at light intensity and a `security-sensitive` class THEN the security lens runs; GIVEN no class
  from `gate classify` THEN it runs at every tier; GIVEN `## Dials`' light and standard rows THEN each names the lens
  with no class from `gate classify` and the lockfile's own trigger-path match waiting for the audit's flag.
- GIVEN `st-dep-audit`'s `## Before the security lens` THEN it finds the bump's entries against the run's `Base:`
  commit, never `HEAD` or the work tree, and a base it cannot read makes the run `partial`.
- GIVEN a lockfile-only bump that moves an entry by a patch version, where the entry's own class is `unmaintained` or
  `pinned-back`, THEN the audit's Risk row states both classes, the audit flags, and the lens runs; GIVEN a changed
  entry the audit cannot class THEN it counts as a flag (added 2026-10-10, unit `q11c-dep-audit-writer`).
- GIVEN `/st-quick` and a batch `gate classify` names `security-sensitive` THEN the whole batch moves to `/st-work` as
  it stands, nothing reverted, every applied item listed ungated under `Not done:`; GIVEN no class (neither CLI form
  runs, the classify exits non-zero, or its `reason` names a failed read) THEN a batch touching a path the security
  agent's `## Trigger` table names moves the same way, and a docs-only batch stays.
- GIVEN `test/corpus/agents/specialists.test.ts` THEN the security agent's Trigger table and the roster's security row
  agree in both directions.

**REQ-FLOW-066**

- GIVEN an added line assigning a credential-shaped literal to a credential-named variable THEN `gate scan` exits 1 and
  its hit names path, line and rule, and no output carries the value.
- GIVEN `--base` and a credential committed and removed again since the base THEN the scan exits 1 and the hit names
  its commit.
- GIVEN a lockfile bump whose added lines carry only `sha512-` integrity hashes THEN the scan exits 0.
- GIVEN no `--base` THEN the JSON reads `base: null` and `scope: "uncommitted"`.
- GIVEN any git failure THEN the scan exits 1 with `ok: false` and a `reason`, never 0; GIVEN an added line longer than
  262,144 characters (string length, not bytes) THEN it exits 1 with a `reason` naming the line.
- GIVEN a tracked code file the read cannot show THEN it is listed in `unscanned`, and the flow lists
  `secret scan: 1 files unscanned` under `Not done:`, naming the path.
- GIVEN a scan hit in either flow THEN the batch or the pass stops, and the value is never rewritten and scanned again.

**REQ-FLOW-067**

- GIVEN `/st-plan` and a unit whose files `gate classify --paths` places `security-sensitive` THEN the unit carries a
  `threat` row of at most five lines naming its trust boundary, what it trusts, one abuse case and the check that
  stops it; GIVEN any other unit THEN no `threat` row.
- GIVEN a CLI that cannot run, an installed copy with no `gate` verb, or a classify whose `reason` names a failed read
  THEN every unit carries the `threat` row.

**REQ-FLOW-072**

- GIVEN the reviewer, a lens, the implementer and the fixer WHEN each digest is read THEN its `findings:` line ends
  `notes left out: <n>`, and an inline result carries the count and never the notes.
- GIVEN a note whose consequence is a misleading message a user acts on THEN the reviewer records it as a finding at the
  severity that consequence sets. `judgment: reviewer`
- GIVEN an implementer that finds a one-line wording note in its own unit's file THEN it applies it; GIVEN a larger
  adjacent improvement THEN it lists it as a note left out and lists no deferral for it.
- GIVEN `/st-rework` and a person's own "nit" feedback THEN it is a Minor finding routed to a plan unit or an inbox row;
  GIVEN a leftover-scan hit with no named consequence THEN it is listed under the phase-4 table as a note and counted,
  never routed.

**REQ-FLOW-073**

- GIVEN the six bodies THEN each ends on a `## Severity` section byte-identical to the test's constant.
- GIVEN the performance lens and no declared budget over the surface THEN its strongest finding is a `Warning`.

**REQ-FLOW-068**

- GIVEN an inbox holding a row at `src/a.ts:3`, a row at `—` with `files: src/b.ts`, a row tagged `decision-waiting`
  and two rows naming other paths WHEN `ledger inbox --paths src/a.ts src/b.ts` runs THEN the first two match as
  `path` and the third as `always`, the count line reads 5 rows, 3 matched and 2 unmatched, and the two other rows
  print nowhere.
- GIVEN a row at `src/a.ts:3` whose description the screen hits WHEN `ledger inbox --paths src/a.ts --json` runs THEN
  the human line reads `<line> <severity> · src/a.ts:3 · withheld by the screen (<pattern id>); read it by hand
  (path)`, the JSON entry carries the pattern id under `withheld` with `description`, `source` and `ref` null, and
  none of the description's words print; GIVEN the hit in the location field, or on a line that does not parse, THEN
  only `skipped: <line> (<pattern id>)` prints.
- GIVEN a screened phrase split by an invisible character, or by a control character `sanitizeLabel` drops, THEN the
  row is withheld or skipped as the unsplit phrase is.
- GIVEN a bullet of 4,097 UTF-16 code units THEN it prints `skipped: <line> (over-length)`, and one of 4,096 is
  screened.
- GIVEN 60 lines that do not parse THEN 50 are listed, one `unparsed: … +10 more` line follows, the count line reads
  60 unparsed, and the JSON carries 50 `problems` and `truncated.problems: 10`.
- GIVEN more than 50 bullets the screen skips and a withheld row the query matches THEN the JSON `skipped` holds the
  first 50 bullets the skip lines name and `truncated.skipped` the number of the rest, and the withheld row stands under
  `matched` with its pattern id as `withheld` and not under `skipped` (added 2026-10-10, the whole-branch review's fix
  round, `review/78`).
- GIVEN an inbox that is a symbolic link, a hard link (a regular file with more than one link), larger than
  1,048,576 bytes, or grown past that size after its size was read, THEN the query refuses with `VALIDATION_ERROR`
  and prints none of the file's text, and its `next` says not to read the file whole and to report the refusal as a
  finding; GIVEN an inbox of exactly 1,048,576 bytes THEN it is read; GIVEN no inbox THEN it prints `inbox: absent`
  and exits 0 (amended 2026-10-10, the fix batch for the pull request's review bot, `review/105` and `review/106`; it
  read "an inbox that is a symbolic link, or larger than 1,048,576 bytes, THEN the query refuses with
  `VALIDATION_ERROR`, and its `next` says", and held no exact-size case).
- GIVEN `content/commands/st-work.md` WHEN Frame step 4 is read THEN it names the `ledger` verb's `inbox` query with
  `--paths` and `--plan`, the second query from a bare intent, a row the query withholds, skips or cannot parse listed
  as it prints, the person's to read or fix, with "never open the inbox for it", the whole-file read only when the CLI
  or that query is absent, and any other failure as a finding, never a whole-file read (amended 2026-10-10, the
  whole-branch review's fix round, `review/90`; it read "a withheld or skipped row listed as it prints").
- GIVEN a run whose query refuses the read WHEN Frame runs THEN the record carries a finding naming the refusal and
  the orchestrator opened no inbox file. `judgment: reviewer`

**REQ-FLOW-069**

- GIVEN the qa skill WHEN read THEN it names the three kinds, says every other row is auto-proven from a check the run's
  test-runner executes before the table is built, and keeps on the human path a row whose check is missing, cannot run
  or fails, and holds the negative row of a security-adjacent path to a committed test's assertion (amended 2026-10-10,
  the whole-branch review's fix round, `review/94`).
- GIVEN a change to a security-adjacent path whose negative row no committed test's assertion covers THEN that row is
  not recorded `auto-proven` on a check the test-runner ran once for it; it stays on the human path and is asked (added
  2026-10-10, the whole-branch review's fix round, `review/94`). `judgment: reviewer`
- GIVEN a change of class `docs`, `records` or `tests` that changes no path the site build renders and none the
  classify hands the `design-quality` lens THEN the checkpoint prints "no walk-through required — <class> only", with
  no sign-off block and no ask.
- GIVEN such a class and a changed stylesheet the classify hands the `design-quality` lens THEN one person row is
  emitted, the changed page renders and reads right and the links to and from it resolve, followed by the sign-off
  block, and "no walk-through required" is not printed. `judgment: reviewer`
- GIVEN a `product` change to one CLI source file, with no rendered surface, no third-party account and no step that
  cannot be undone, THEN none of the three kinds creates a person row, and where every row's check ran and passed no
  QA question is asked; a row whose check is missing, cannot run or fails stays on the human path, the person's, and
  is asked, and so does the negative row a security-adjacent path derives where no committed test's assertion covers
  it, a check run once for that row being no proof for it (`content/skills/st-qa/SKILL.md:43-44`, `:45-49`,
  `:105-107`, `:113`; amended 2026-10-10, `review/83`; it read "THEN no person row is created and no QA question is
  asked"; amended 2026-10-10, the whole-branch review's cap round, `review/103`: the clause on the negative row and
  its citation `:45-49` added). `judgment: reviewer`

**REQ-FLOW-070**

- GIVEN a plan with a unit spanning 61 lines and one spanning 101 WHEN the coverage script runs THEN it reports
  `unit-size` for the first and `unit-oversize` for the second, each at its unit's heading line, and its status stays
  `pass`.
- GIVEN a unit holding one fence, or five consecutive lines that start with `>`, THEN it reports `unit-prewritten`;
  GIVEN a delta entry of a heading and seven non-blank lines THEN `delta-verbose`, and of a heading and six THEN
  none; GIVEN an entry headed `### ADDED REQ-…` THEN it is measured as the bare form is.
- GIVEN an indented `### X` line inside a unit THEN it starts no unit.
- GIVEN `/st-plan`'s and `/st-rework`'s return lines THEN each carries `L5 none|<n> advisory|not run`, `/st-rework`'s
  before `R1 pass|fail`.

**REQ-FLOW-071**

- GIVEN the Copilot emit WHEN every agent file is read THEN its frontmatter carries
  `include-custom-instructions: true` after `target: github-copilot` and before `tools:`; GIVEN a prompt file THEN it
  carries no such key.
- GIVEN the capability matrix THEN Copilot's `sub-agent-instructions` row names the changelog version, the live
  check's version and date, the `--no-custom-instructions` override as unverified on 1.0.89, and the cloud agent's
  undocumented handling of the key.
- GIVEN a Copilot CLI session in a repository set up by this engine WHEN its orchestrator dispatches an emitted agent
  through `task` THEN the sub-agent quotes the charter's `Invariants version` line. `judgment: maintainer`; not yet
  run with the key emitted (`build/13`).

**REQ-FLOW-074**

- GIVEN `/st-board`'s Leftovers at a close WHEN read THEN it names the four kinds of leftover with the
  `decision-waiting` rows first, the line form, "never pre-set to drop", the three answers, and a withheld or skipped
  row as listed and never decided; and, amended 2026-10-10 (the whole-branch review's fix round; `review/90`,
  `review/91`, `review/96`, `review/97`), an `unparsed:` line as the person's to fix, the never-open floor as Frame's
  alone with what the close's write reads, `stop` as every leftover row on `Not done:`, and what `show` prints and where
  it is refused.
- GIVEN a close holding a Warning finding whose author's note urges dropping it, and two notes, THEN the Warning is
  listed with fix now or schedule as its recommendation, never pre-set to drop and never folded into the notes line.
  `judgment: reviewer`
- GIVEN the person's answer drops an inbox row the change touched THEN the row's ledger row, where its `Ref:` names
  one, is retired `cut <reason>`, its bullet is removed and the record carries an `- inbox retired:` line naming the
  disposition; GIVEN a new date for it THEN its bullet is replaced by one row under the schedule rule carrying the
  same `Ref:`. `judgment: reviewer`
- GIVEN a Critical or Warning the person drops THEN its row is retired `cut accepted risk: <reason>` and stays on
  `Not done:`.
- GIVEN a close with every finding fixed, no inbox row touched or due, no `decision-waiting` row and no notes THEN the
  close asks only what it asked before, or nothing. `judgment: reviewer`

**REQ-FLOW-075**

- GIVEN an unattended close holding one Critical and one Minor deferred row of its own ledger, neither a fix its plan
  covers, one inbox row its change touched and did not fix, and three notes THEN the notes are dropped and counted,
  the two ledger rows are appended tagged `decision-waiting` with `when: next attended close`, the touched inbox row
  stays as it is with no copy, and all three are listed on `Not done:`; the Critical is neither dropped nor retired.
  `judgment: reviewer`
- GIVEN a row tagged `decision-waiting` THEN `ledger inbox` shows it for every query, matched as `always` where no
  other filter matches it.
- GIVEN the answer `stop` at a close that asks the leftovers question THEN nothing is fixed, merged or committed, each
  leftover of the run's own ledger closes `deferred` and is appended tagged `decision-waiting`, and each inbox row stays
  as it is, and the notes are dropped as with no answer (amended 2026-10-10, the whole-branch review's fix round,
  `review/91`). `judgment: reviewer`

**REQ-FLOW-076**

- GIVEN `parseDisposition` THEN `fixed in 2026-10-10_x`, `fixed by /st-quick`, `cut: out of scope`,
  `cut accepted risk: no exploit path`, `scheduled plan docs/plans/015-board-writes.md#b1-board-contract · by
  2026-11-01` and `scheduled board #42 · when touched` are accepted; `scheduled later`, `scheduled board #42 · when
  later on`, `scheduled board #42 · by 2026-02-30`, `scheduled board now · by 2026-11-01`, `scheduled board #42 · when
  2026-11-15`, `fixed later`, `cut: tbd`, `cut accepted risk: tbd`, `fixed —` and `moved somewhere` are refused, each
  naming its problem (the day under `when` added 2026-10-10, the whole-branch review's fix round, `review/89`).
- GIVEN a deferred ledger row and a clock at 2026-10-10 WHEN `ledger close --retired "scheduled later"` names it THEN
  the command exits 1 with `why` and `next` and the ledger is byte-identical; GIVEN the clock at 2026-10-09 THEN the
  value is recorded as before; GIVEN a re-run, after 2026-10-10, of a value recorded before it THEN it prints
  `unchanged`.
- GIVEN an inbox row below `## Rows under the schedule rule` with neither `by:` nor `when:`, with `when: later`, with
  `when: at some point`, with both `by:` and `when:`, with `when: touched` at `—` and no `files:`, or with a `when:`
  that holds a day, alone (`when: 2026-11-15`) or among other words, THEN `parseInbox` names a problem at its line;
  GIVEN `when: the next edit of src/a.ts`, or a `when:` naming a run id that opens on its date, THEN none; GIVEN a row
  above the heading with no schedule field THEN none (the day under `when:` added 2026-10-10, the whole-branch review's
  fix round, `review/89`).
- GIVEN `ledger inbox --due 2026-12-01` THEN a row whose `by:` day is on or before that day matches, as `due` where
  nothing else matched it, the count line ends `· <n> due by 2026-12-01 · <n> triggers`, and an unmatched row carrying
  `when:` counts under triggers; GIVEN `--due` with no value THEN the clock's UTC day is used; GIVEN `--due
  2026-02-30` THEN a `USAGE` refusal.
- GIVEN this repository's tracked inbox and ledgers WHEN the records gate runs THEN every bullet parses, and every
  `retired` value the schedule rule binds parses under the grammar.

**REQ-FLOW-077**

- GIVEN each writer's row template with its placeholders filled — `/st-plan`'s follow-up on a day and on a trigger,
  `/st-pr-resolve`'s deferral, `/st-rework`'s DEFER row, its critical-deferred row and its meta row, and the dep-audit
  row on a day and on a touch — THEN `parseInbox` reads each below the heading with no problem.
- GIVEN `/st-board`'s census THEN it names five writers, and `/st-quick` among the retirers and not the writers;
  GIVEN `/st-quick`'s body THEN its last paragraph says the lane appends no inbox row and offers no leftovers ask.
- GIVEN a deferred advisory at `critical` or `high` THEN the dep-audit row carries a `by:` day the operator named and
  never `when: touched`.
- GIVEN a `/st-plan` follow-up with no date and no trigger a run can check THEN it goes to the plan's Drop list and
  appends nothing.
- GIVEN a Critical the user defers, with no path to name and no day named, THEN `/st-rework` asks for the day in the
  rationale question and writes no `critical-deferred` row with neither a path nor a day; the run closes naming the
  unwritten row as its open item (added 2026-10-10, the whole-branch review's fix round, `review/93`).
  `judgment: reviewer`

## References

- `docs/plans/013-optimization-sweep-01.md` — the measures and the method that found these items.
- `docs/plans/013-optimization-sweep-02.md` — the core: its decisions, shared contracts and spec delta A.
- `docs/plans/013-optimization-sweep-03.md` — the next tier, spec delta A, and the drop list.
- `.stamity/runs/2026-09-30_optimization-sweep/record.md` and its `ledger.jsonl` — the build, the sign-offs and the
  live checks this merge cites by ledger id.
- `docs/plans/016-fork-distribution-00.md` — spec delta B (REQ-FLOW-036 to 038), the units `u0-settings-ownership` and
  `u0-hook-files-ownership`, and the declared defaults S10–S19 with their dated build amendments.
- `.stamity/runs/2026-10-07_security-fixes/record.md` and its `ledger.jsonl` — the build, the review rounds and the
  sign-offs the "Amended 2026-10-07 (build)" bullets record.
- `.stamity/runs/2026-10-08_maintainer-tooling/plan.md`, its `record.md` and its `ledger.jsonl` — the in-flow plan's
  spec deltas, the maintainer's answers and the ledger rows the text dated 2026-10-08 cites.
- `docs/plans/019-lean-flows-02.md`, and `.stamity/runs/2026-10-08_product-core/plan.md` (its in-flow re-plan, whose
  `## Spec delta` and `## Security notes` this merge took), `record.md` and `ledger.jsonl` — the sign-offs, the review
  rounds and the ledger rows the text dated 2026-10-09 cites.
- `docs/plans/019-lean-flows-03.md`, and `.stamity/runs/2026-10-10_next-tier/plan.md` (its in-flow re-plan, whose
  `## Spec delta` this merge took), `record.md` and `ledger.jsonl` — the sign-offs, the review rounds and the ledger
  rows the text dated 2026-10-10 cites.
- `test`: each requirement names its suites above; once a test exists it is the normative record.
- `source`: `src/shared/cliCall.ts`, `src/emit/substitution.ts`, `src/cli/kit/packageName.ts`,
  `scripts/plugins/tokens.mjs`, `src/types/markers.ts`, `src/detect/repoAnalyzer.ts`, `src/detect/verificationGates.ts`,
  `src/cli/commands/init/plan.ts`, `src/cli/commands/check.ts`, `src/mcp/env.ts`, `src/cli/commands/sync/engine.ts`,
  `src/learnings/validation.ts`, `src/learnings/store.ts`, `src/runs/ledgerStore.ts`, `src/cli/commands/init/panel.ts`,
  `src/cli/commands/init/apply.ts`, `src/cli/notice/updateNotice.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts`,
  `src/adapters/cursor.ts`, `src/emit/skillsProjection.ts`, `scripts/plugins/clients/codex.mjs`,
  `scripts/plugins/clients/cursor.mjs`, `src/change/classify.ts`, `src/change/testInputs.ts`, `src/change/scan.ts`,
  `src/cli/commands/gate.ts`, `src/roster/triggers.ts`, `src/roster/reviewCaps.ts`, `.stamity/change-classes.json`, and
  the command, agent and skill bodies under `content/`.
- `source` (added 2026-10-10): `src/runs/inboxStore.ts`, `src/runs/disposition.ts`, `src/cli/commands/ledger.ts`,
  `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, `scripts/generate-apm-package.mjs`.

## Risks

- The first npx call needs the network (REQ-FLOW-002).
- An ESLint config that reports unused disable directives, or a run with `--max-warnings 0`, can flag the header of
  REQ-FLOW-001 where the project already declares Node globals: measured on 5 emitted scripts, and `eslint --fix` strips
  the line until the next sync (ledger `build/45`). oxlint honours the directive and has no per-path way to turn it off
  (ledger `build/43`).
- Codex asks for hook approval again after each stamity upgrade, because `.codex/hooks.json` carries the pinned version
  and Codex records trust against that file's hash (REQ-FLOW-002). The 1.11.0 release notes say so.
- REQ-FLOW-013 and REQ-CTX-017 moved eval Expected blocks; each moved block carries its reviewed disposition in
  `evals/SET-v7.md`.
- With Codex or Cursor selected beside Copilot, an operator sees the nine touchpoints twice in Copilot: as prompt files
  and as project skills (REQ-FLOW-026). The model's own list holds them once.
- A narrower local gate finds a failure later, at CI, when the map misses a read (REQ-FLOW-062, REQ-FLOW-063). What
  bounds it: the guard over every (test, path) pair, "unclear means product", and the condition both flows state, CI's
  full run on every `product` or stronger change; where the CI provider is `unknown` the final tree runs every gate.
- The line rules of REQ-FLOW-065 and the scan of REQ-FLOW-066 are new patterns. Over this repository's last 500
  commits the scan stops on 6 lines, real-looking credential examples in `docs/plans/016-fork-distribution-01.md`, and
  each stop is the person's to settle (the run record of `2026-10-08_product-core`); the line rules read JavaScript,
  TypeScript and Python only, so a dangerous call in another language places a change by path alone.
- Audit-first (REQ-FLOW-065) needs the bump staged with the index equal to the work tree; an unstaged bump, or a CRLF
  work tree, keeps the lens. It fails closed (ledger `review/170`, declared default).
- **Accepted risk (REQ-FLOW-071, and REQ-LADDER-004 in `docs/specs/model-ladder.md`).** github.com's Copilot cloud
  agent reads the same `.github/agents/` files, and its handling of `include-custom-instructions` and
  `reasoning-effort` is undocumented (the custom-agents configuration page, read 2026-10-10). The risk was accepted
  at the plan gate of run `2026-10-10_next-tier` (its ledger `plan/8`, `plan/21`, `build/14`). What
  bounds it: both capability rows say the cloud handling is undocumented and claim nothing for it
  (`src/adapters/copilot.ts:196-219`). What would change it: a cloud-agent run on a repository carrying the keys, or
  GitHub's custom-agents page listing them.
- REQ-FLOW-071's effect is not yet shown by a live run: the 2026-10-10 check ran without the key and proved the gap
  alone (that run's ledger `build/13`). Until a run with the key emitted quotes the charter, the claim rests on the
  CLI's changelog and its loader's key list.
- A row the screen withholds reaches a run without its description (REQ-FLOW-068). What bounds it: the row still
  matches by its location, its files, its day and its tag, and prints its line, severity and location with the
  pattern id, so Frame and the close name it for the person to read. A true finding is never reworded until the
  screen misses it, which is the defect the injection-screening rule names
  (`content/rules/stamity-injection-screening.md`).
- A close that drops or re-dates an inbox row edits a row another run wrote (REQ-FLOW-074). It does so only on the
  person's answer; each removal is a retirement with a record line, and a re-dated row keeps its `Ref:`.
- A path match misses a prose location and a root manifest with no dot in its name (REQ-FLOW-068, REQ-FLOW-077; that
  run's ledger `review/77`). `--area`, `files:` and the unmatched count bound it. Amended 2026-10-10 (the fix batch
  for the pull request's review bot; `review/107`, with `review/77`): a location entry that carries a line suffix
  names a path even with no slash and no dot. The suffix is a name holding a letter, one `:`, then a line number or
  a line range and nothing more, as in `Makefile:12`, `Dockerfile:3-9` or `Gemfile:12`, read after the entry's
  backticks are stripped and it is cut at its first space. Such a row matches by `--paths`, is no longer reached by
  `--area`, and may carry `when: touched` with no `files:` (`src/runs/inboxStore.ts:294-335`). What the match still
  misses: a prose location, a bare word with no line suffix (`Makefile`), a `:` followed by anything else
  (`Makefile:all`, `Makefile:12:5`), and a suffix with no letter before it (`12:30`, `—:12`). The rule's limit,
  accepted: a prose location whose first word reads `<word>:<number>` (`step:2 of the plan`) names a path too, and
  `--area` no longer reaches its row.

## Concerns

- The `npx --no stamity <verb>` of REQ-FLOW-002 runs whichever installed copy npm resolves: the project's own bin, a
  `node_modules/.bin` here or in a parent folder, or a global one. The version such a copy runs is not pinned. With no
  installed copy, npm still reads the unscoped name's manifest once before refusing, and runs nothing (`review/102`,
  the security re-check's residual).
- About 60 CLI remedy strings keep a bare `stamity <verb>` (plan decision 11, drop list D-58), and three user-typed bare
  mentions remain in `content/skills/st-onboard/SKILL.md`, `content/commands/st-quick.md` and
  `content/commands/st-work.md` (the census's deferred list).
- REQ-FLOW-007 covers the lock-declared runners and a plain venv pinned at init on POSIX. Other environment managers,
  and a Windows venv, keep the default rendering plus the warning from REQ-FLOW-008. `config detect` does not compare
  `detected.packageManager` (deferred).
- REQ-FLOW-012 leaves the method for counting source lines to the Source tree probe the command already runs.
- REQ-FLOW-025's allowlist sentence landed on 2026-10-08 (unit `b4-no-read-allow-rows`), unreleased at that merge;
  its one residual is the lost-manifest case the REQ-FLOW-036 line below names.
- REQ-FLOW-022: the Copilot workflow's bun branch still tells the reader to "add its setup step here" in a file that
  says edits are overwritten (`src/adapters/copilot.ts:606-608`); the unit fixed only the non-Node branch. The file
  name the pin scan skips has two sources (`COPILOT_SETUP_STEPS_PATH` and `ENGINE_EMITTED_WORKFLOWS`). That `check`
  reports the workflow as drifted after the project moves a pin, until the next sync, follows from `check` re-planning
  live and was not measured.
- REQ-FLOW-026: a command restricted with `tools:` to one client would still reach every client that reads the shared
  tree. No shipped command uses `tools:` (the unit's deferral M-1).
- REQ-FLOW-026 and REQ-FLOW-038, as amended 2026-10-08: a copy an earlier release rendered that the running engine no
  longer produces is kept on upgrade and named for a delete by hand, not reclaimed; the run's plan leaves it to a
  release that retires an artifact to say so in its CHANGELOG. The two 1.11.0 Cursor guards are the one exception,
  recognised by the frozen 1.11.0 builder, and the two setups REQ-FLOW-038's amendment names (`review/99`) keep their
  spawn guard.
- REQ-FLOW-036 and REQ-FLOW-037: the residues the plan records as follow-up rows stay open — a user-hook entry edited
  in `.claude/settings.json` instead of its definition stays beside the engine's rendering; after a lost manifest the
  three allow rows a release rendered read as the owner's; a key an owner adds inside an engine Codex table makes the
  whole table the owner's; and inside the bound a forged record still proves a selected `[mcp_servers.<id>]`
  (`docs/plans/016-fork-distribution-00.md`, Follow-ups and the 2026-10-07 amendment of S16).
- REQ-FLOW-061 to REQ-FLOW-066 — the residuals run `2026-10-08_product-core` recorded, as landed:
  - **Head code still routes its own CI** (`review/8`, standing since plan 019 file 1). `scripts/ci/records-only.mjs`
    and the `src/change/` modules it imports run from the pull request's head, so a change to that code decides its
    own CI routing. Bounded: those paths sit in no lane, so they answer full CI
    (`scripts/ci/records-only.mjs:61-66`); the class file places them `security-sensitive`, so the lens reads any
    change to them (`.stamity/change-classes.json:8-12`); and the suites come from the base map. A change that
    rewrites the script to answer narrow is trusted until review reads it.
  - **A backslash in a git name** (`review/43`). Off Windows, a name such as `.stamity\overrides\x.md` is one
    top-level Markdown file and reads `docs`, which is right for the file a POSIX checkout writes; on win32 git's
    names are read both ways and the stronger class kept, because a Windows checkout with `core.protectNTFS` off
    writes that name into `.stamity/overrides/` (`src/cli/commands/gate.ts:54-58`, `:1231-1233`).
  - **What a class file may lower** (`review/59`, `review/70`). A `records` or `docs` glob must end in a concrete
    extension or name a file (`src/change/classify.ts:1489-1510`), so this repository's site globs name their
    extensions (`.stamity/change-classes.json:17-24`). A `tests` glob stays freer: a folder glob such as `**s/**` is
    accepted, and `"tests": ["**/*.*"]` would place config files in `tests`; code still reaches `tests` only under a
    built-in test glob. Any edit to the class file is `security-sensitive` and read from the base only.
  - **A nested project's class file.** Seen from a parent project, `sub/.stamity/change-classes.json` matches no
    built-in rule, which names the class file at the project root only (`src/change/classify.ts:640-645`), so it reads
    as an unplaced config file, `product`, with no lens; from its own project root it is `security-sensitive`.
  - **A real read built at run time** passes the test-input guard as the rewritten fixture data does
    (`src/change/testInputs.ts:11-14`; `review/84`); the full run on every `product` or stronger change backs it.
  - **The review gate's `low` refusal** sits beside "confidence alone starts no round": on a client whose hook holds,
    a `low` approval is sent back to a fixer, and the text does not say whether that counts as a round
    (`content/commands/st-work.md:212-215`; `review/33`, a product choice left open).
  - **Invariant 4 names `gate classify` but not its base**; a bare call after committing classifies only the
    uncommitted paths. Both flows pass the base (`content/commands/st-work.md:193`;
    `content/commands/st-quick.md:165`), and the charter's two lines hold no room for it.
- REQ-FLOW-068 to REQ-FLOW-077 — the residuals run `2026-10-10_next-tier` recorded, as landed; each id is that run's
  ledger row, open at this merge:
  - **The free-text refusal has five slots, and the command named three** (`review/69`). `/st-board`'s Removal rule
    stated it for a trigger, a `fixed` reference and a `cut` reason; the grammar also refuses a board item and an
    accepted-risk reason (`src/runs/disposition.ts:253-254`, `:326-346`). Settled 2026-10-10 in the whole-branch
    review's fix round: the rule names all five (`content/commands/st-board.md:398-400`).
  - **The query's caps are in no command text** (`review/70`). `/st-board` says a skipped row is listed as it prints;
    one past the fiftieth has no line of its own, only the `+<n> more` count. The JSON `skipped` list is cut to 50
    before the matched withheld rows are left out of it, where the human form drops them first
    (`src/cli/commands/ledger.ts:1175-1178`, `:1193`; `review/78`). Settled 2026-10-10 in the whole-branch review's fix
    round, its code part: the JSON list leaves those rows out before its cap, as the human form does (REQ-FLOW-068, the
    caps).
  - **`files:` at `—`** (`review/62`). `/st-board` asks a row at `—` to name `files:`; the reader holds only a
    `when: touched` row to a path, and `/st-rework`'s meta row stands at `—` with none (REQ-FLOW-076, REQ-FLOW-077).
  - **What the grammar still lets through.** A row placed above the heading passes with no day and no trigger
    (`build/19`); one prose word in `files:` passes as a path (`review/37`); and the screen reads the inbox row by row,
    so a pattern split over two adjacent rows passes (`src/cli/commands/ledger.ts:1102-1107`; `review/26`).
  - **The close edits the inbox whole.** It removes and appends bullets with the file tools, and no text limits its
    read to the lines it changes, so a whole-file read there brings a withheld row's text into the orchestrator's
    context, which the query kept out (`content/commands/st-work.md:380-390`; `review/50`). Amended 2026-10-10 (the
    whole-branch review's fix round, `review/97`): the text no longer claims the never-open floor for the close; it says
    the close's write reads the file whole where the client's edit tool reads before it writes, and that a withheld or
    skipped row's text is data the close never acts on or repeats (`content/commands/st-board.md:417-421`). The read
    itself stands.
  - **A settled row is asked about at the close.** A row a persisted plan settles as deferred is not asked about at
    Frame (REQ-FLOW-019), yet it is a touched, unfixed row at the close, so each run touching its file asks about it
    there (`build/27`, a decision left open).
  - **The qa skill's two readings of auto-proven** (`build/42`). Its person-row paragraph auto-proves a row from a
    check the test-runner executed, while its Auto-prove table and rule 1 ask for the test source's `file:line`
    (`content/skills/st-qa/SKILL.md:41-43`, `:90`, `:100-104`). Recorded as observed; this merge settles neither.
    Amended 2026-10-10 (the whole-branch review's fix round, `review/94`): the negative row of a security-adjacent path
    is held to rule 1's pointer (`:45-49`); for every other row the two readings stand.
  - **Copilot's verdict roles load the working tree's instructions** (`review/22`, a security finding and a decision
    left open). With REQ-FLOW-071's key, Copilot's reviewer and lenses load the checkout's `AGENTS.md`, `CLAUDE.md`
    and `copilot-instructions.md`, so a branch that edits one is judged by roles already following the edit.
  - **The APM package's Copilot agents** carry neither `include-custom-instructions` nor `reasoning-effort`
    (`scripts/generate-apm-package.mjs:601-606`; `build/12`, `build/22`).
