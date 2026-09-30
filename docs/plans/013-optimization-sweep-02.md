---
id: optimization-sweep-02
intent: feature
stamp: 67d2b954f6cab0e7601fc9f8df25273b2fcebecc 2026-09-30
reads: [AGENTS.md, content/commands/st-work.md, content/commands/st-quick.md, content/commands/st-debug.md, content/commands/st-spec.md, content/commands/st-plan.md, content/commands/st-board.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/commands/st-ask.md, content/agents/stamity-researcher.md, content/agents/stamity-test-runner.md, content/agents/stamity-implementer.md, content/agents/stamity-fixer.md, content/agents/stamity-reviewer.md, content/agents/stamity-security.md, content/agents/stamity-performance.md, content/agents/stamity-design-quality.md, content/agents/stamity-spec-author.md, content/skills/st-qa/SKILL.md, content/skills/st-handoff/SKILL.md, content/skills/st-learn/SKILL.md, content/skills/st-dep-audit/SKILL.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, content/rules/stamity-question-protocol.md, scripts/qa/run.mjs, scripts/qa/bind.mjs, scripts/qa/form.mjs, scripts/plugins/tokens.mjs, scripts/eval/run.mjs, src/hooks/scripts.ts, src/hooks/portableRunner.ts, src/runs/layout.ts, src/runs/cardSource.ts, src/runs/resumeCard.ts, src/detect/repoAnalyzer.ts, src/detect/verificationGates.ts, src/cli/commands/check.ts, src/cli/commands/ledger.ts, src/cli/commands/sync/engine.ts, src/cli/commands/init/panel.ts, src/cli/commands/init/apply.ts, src/cli/kit/packageName.ts, src/mcp/env.ts, src/types/markers.ts, src/emit/substitution.ts, src/emit/planner.ts, src/emit/hooksInfra.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/roster/agentPolicies.ts, src/roster/agentGrants.ts, src/tools/allowlist.ts, src/tools/translator.ts, src/worktree/policy.ts, test/corpus/commands/work.test.ts, test/corpus/commands/lightTrio.test.ts, test/corpus/commands/spec.test.ts, test/corpus/skills/flow.test.ts, test/corpus/agents/spine.test.ts, test/corpus/agents/quality.test.ts, test/corpus/agents/verdictReturns.test.ts, test/evals/locators.test.ts, test/evals/successorInputs.test.ts, test/evals/roster.test.ts, evals/SET-v7.md, evals/README.md, docs/specs/orchestrator-context.md, docs/specs/implementation-finish.md, docs/specs/prove-behavior-and-value.md, docs/specs/worktree-lane.md, docs/getting-started.md, .stamity/learnings, .stamity/inbox.md]
depends_on: [docs/plans/013-optimization-sweep-01.md]
---

# The optimization sweep — file 2 of 3: the core session 2 builds, and the one-off jobs

This file is self-contained. It is Package 17 session 1's second `/st-plan` artifact, written after the maintainer's
curation walk. It holds the thirteen core fixes session 2 builds first, the eval-set writer, and the one-off jobs.
File 3 (`docs/plans/013-optimization-sweep-03.md`) holds the next tier, built after this file's lanes. The measures
and the method that found these items are in file 1.

intent chosen: feature because the kept items name net-new behaviour to build into the engine, the corpus and the
emitted client files: a debug run that reproduces with a failing test, three honest QA states, read-only git for the
verdict roles, a resume card on every resume, a pinned CLI call form, and a quick lane that carries tests. The
request says build.

## Context

Session 1 ran the sweep's three lines: our records, dated outside practice, and a test day of 43 steps on three small
fixture projects across Claude Code, Codex, Copilot CLI and Cursor. Every feature run shipped tested code with green
gates, but the smaller commands let the user down: `/st-debug` fixed none of three plainly described bugs and left
its probes in the code, `/st-quick` refused two small changes because a test had to change too, `/st-spec` "create
the spec" wrote no spec, and the flows call a `stamity` command that the documented `npx` setup never installs. Setup
itself breaks a project's own lint, misnames the test framework and lets a state file into pull requests; some records
say more than happened. This file fixes those, keeps every floor, and changes no public shape, so the release is
1.11.0.

**Out of scope:** the next tier (file 3); anything on the drop list (file 3's appendix); any before/after or
comparison run and any planted bug, which the maintainer ruled out for this package.

## Decisions

### The maintainer's walk (2026-09-30, through the question tool; every answer the recommended option)

| Question | Answer |
|---|---|
| The core set | All 13 fixes. |
| The quick lane | Tests ride along with their source file; a text change may span two source files within the 5-file cap; a new endpoint still goes to `/st-work`. |
| `/st-debug` | It reproduces an exactly described bug with a failing test, keeps the gates green and a record, then hands off; a bug that needs the user's environment still stops. |
| The CLI calls | A local copy if present, else the pinned npx call at the installed version, with a written fallback. |
| `/st-work`'s asks | All three trims: no question on rows the plan settled, a persisted plan is the go-ahead, one close question. |
| QA rows | Three honest states with an input hash; no ask when every row auto-proved; release-blocking rows still need a walk. |
| Verdict roles | Read-only git and a short brief of diff, criteria and report path. |
| The resume card | On every resume and after a compaction, with a closed run's facts, open debug rounds and handoff drafts. |
| The replay's frozen files | Delete them in session 2 behind a tag. |
| Plan 009's eval gaps | Fill them with the kept items: gap 1 with the reviewer fix, gap 3 with the re-review fix (file 3), gap 2 as its own case; gap 4 waits. |
| The learnings | Re-date the ones that expire together before 2026-12-02; retire the two that restate a gate or a test. |
| `review/197` | Retire it as written. |
| Breaking changes | None; the one breaking idea stays dropped, so the release is 1.11.0. |
| `stamity check` | It names the gates it did not run and never prints a bare "all green" beside them; it runs nothing. |

### Settled by this plan (declared defaults; the maintainer may reverse any at session 2's start)

1. **The CLI call form is one token.** The corpus spells a pinned call as `${STAMITY:CLI} <verb>`. The engine renders
   the token to `npx -y <package>@<engine version>` from the emission context (`@zomarit/stamity@1.11.0` in this
   repository; a fork's own package name in a fork), and the plugin build maps it to the same pinned form. Where a
   unit below spells `npx -y @zomarit/stamity@<v>` or `${STAMITY:CLI_VERSION}`, it means this token. A body
   runs `npx --no stamity <verb>` first, which runs an installed copy and never downloads one, and the pinned
   call where npm refuses; no condition is left for an agent to judge (`review/102`, amended below). Unit
   `sw26-cli-token` owns the token.
2. **When the CLI cannot run** (for example offline with no npx cache): the handoff and learn steps stop and report
   `Not done: <step> — <reason>` (the reason naming the CLI) with the exact command, and write no file by hand, as both
   skills already require. The ledger step alone may be written by hand by the orchestrator, the one ledger writer, in
   the ledger's grammar, and the run record says `ledger: by hand (no CLI)`.
3. **A handoff draft** is a file under `.stamity/handoffs/` that the session-start loader refuses. The card lists it
   by name, with the refusal reason, when its name fits the handoff grammar; otherwise it is counted, never printed.
4. **Release-blocking QA rows** are the QA skill's H rows. They are never carried forward on an input hash, and
   `Shippable: YES` is never recorded while one is accepted-unwalked.
5. **The quick lane's Files row** counts, per item, source files only: a test that follows the item's change rides
   with it. The batch's 5-file cap still counts every file, and ride-along lines still count toward `Size`.
6. **`/st-work` and `/st-spec` keep their own brief-key enumeration** for the researcher; the shared line goes into
   the five commands and the skill that name no keys today. So SW-30 adds nothing to `st-work.md`.
7. **Python gates** use the runner a lock file declares (`uv run`, `poetry run`, `pdm run`, `hatch run`), recorded in
   the existing `detected.packageManager` field. A plain `.venv` without a lock gets `gates` pins written once, at
   `init`; `sync` never writes pins, so `check` stays drift-free on a checkout without the venv. No new manifest field
   (a new field would break a downgrade).
8. **The lint header goes on every generated script**, the three copies of the coverage checker included.
9. **The worktree lane refuses the review-gate state files by name** once setup ignores them, so a review round
   counted in one worktree still never gates another.
10. **The plugin layout** prints the same pinned npx form as the repository layout.
11. **The CLI's own remedy text** (about 60 bare `stamity <verb>` strings in refusal messages) is not swept in this
    package; it is on the drop list.
12. **The small-app bound for `/st-spec`** is 5,000 source lines.
13. **The three learnings that expire on 2026-12-03** are re-dated with the thirteen that expire on 2026-12-01, so the
    index has no cliff at all.
14. **The final tree is gated by its own run;** citing an earlier green result on a byte-identical tree covers
    earlier Prove passes only (REQ-FLOW-015).

### Amended by the run's contract census (2026-09-30)

Session 2's contract census (`.stamity/runs/2026-09-30_optimization-sweep/reports/census-settled.md`, settled at
11:10Z over HEAD `f387c5e7`) amends the cells below in place; where it and a cell differed, the cell now reads as the
census does. Two answers are the maintainer's (11:05Z); four settlements are the orchestrator's.

- **G2 (maintainer): the card's drafts line is dropped.** The session-start banner already lists each refused handoff by name and reason on every start, compaction and resume included (`src/hooks/scripts.ts:997-1008`, pinned at `test/hooks/scripts.test.ts:465-482`). This withdraws decision 3 and the "handoff drafts" part of the walk's resume-card answer; unit `sw07-card-drafts-and-debug-rounds` is now `sw07-card-debug-rounds`.
- **G3 (maintainer): Codex `hooks.json` carries the pinned call.** Codex records hook trust against that file's hash (`src/adapters/codex.ts:689-693`), so it re-asks for hook approval after each stamity upgrade, not once; the 1.11.0 release notes say so (session 3).
- **S1 (orchestrator): the charter uses the token, and the token is wired.** `${STAMITY:CLI}` joins `REPO_SUBSTITUTION_TOKENS` (ten tokens), and `content/charter/stamity-charter.md:26` reads "change via `${STAMITY:CLI} config`", because `test/content/charter.test.ts:199-201` requires every wired token in the charter body.
- **S8 (orchestrator): the harness and the skill keep separate QA rules.** The harness (`scripts/qa/*`) keeps `performed` and `rowHash` and never carries an `accepted-unwalked` row, because its row ids all start with `H` for a human row (`scripts/qa/form.mjs:26-139`), not the skill's High-risk letter; the skill carries a non-H `accepted-unwalked` row on its own input hash, the sha256 of the sorted lines `<path> <git hash-object of path>`.
- **S6 (orchestrator): the debug record head.** Run id `<UTC date>_debug-<slug>`, opened at the run's first mutation, with `Status: in progress`, `Plan: none — debug round` and `Invocation: <command line>` bare at column 0 (`src/runs/layout.ts:83` matches `/^status:\s*(.*)$/i` only); the card finds debug records by the `_debug-` segment, never by the `Invocation:` spelling, which differs per client.
- **S3 (orchestrator): sync ignores before it writes.** `applySync` calls `ensureGitignoreEntry` on the live path before its first emitted-file write, so a refusal by the injection screen (`src/mcp/env.ts:590`) leaves nothing half-applied; a dry run skips it.

Two security sign-offs later in the run (the run record, 13:05Z and 13:13Z) amend the CLI call cells the same way;
every path below was read at HEAD `32ceeeec`.

- **`review/102` (sign-off 13:13Z): the local form is `npx --no stamity <verb>`, with no condition.** The old sentence's `npx stamity <verb>` falls through to the unscoped registry name `stamity` when no copy is installed, and npm installs it without a prompt on a non-TTY shell; a registry read at 13:12Z (`npm view stamity`: E404) showed that name unpublished and open to anyone. `npx --no` runs an installed copy (a `stamity` bin the project's `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one) and never downloads one; where npm refuses, the call runs as `${STAMITY:CLI} <verb>`. The "where the project's `package.json` lists this package" condition is gone everywhere, so an agent needs no judgment to choose. The sentence is one shared constant, `RUNNING_CLI_SENTENCE` in `test/corpus/cliCallForm.test.ts` (commit `1fea2e3c`), byte-identical and on one physical line at every site; REQ-FLOW-002, `work-cli-call-form` and `sw26-cli-call-form` now quote it, decision 1 states its rule, and that test's new check (d) refuses any `npx` call of the bare `stamity` name without `--no` in `content/`.
- **`review/94` (sign-off 13:05Z): a package with no npm channel pins with `npx --no`.** A package whose running manifest is `private: true` and carries no `publishConfig.registry` (the registry-less fork of `docs/enterprise-forks.md`) renders the pinned call as `npx --no <name>@<version> <verb>`, which runs a copy already installed in the project and never fetches one, so whatever another party publishes under that name is never installed or run. A package with a channel (the canonical build, whose `package.json:44` declares `publishConfig`, or a fork made with `--registry`) keeps `npx -y`. The decision is read once, off the same manifest read as the name; init, sync, the CLI remedies and the plugin build carry it, and the pinned-call kernel renders it. REQ-FLOW-002 and `sw26-engine-cli-call-form` carry the clause. The maintainer can reverse it at the QA checkpoint.

## Proof map

Model-facing changes are proven by the eval set's floors at the release run, with a new case where a change needs one;
tooling changes by tests; everything by the QA checkpoint. No before/after run. New cases enter the set as non-floor
cases, declared (file and index row) before the release run's candidate commit.

| Item | Unit(s) | Must hold (existing) | Census: Expected or quoted text moves | New case |
|---|---|---|---|---|
| SW-26 CLI call form | sw26-cli-token, sw26-engine-cli-call-form, sw26-cli-call-form, work-cli-call-form | `work-proof-block-fields`, `learnings-curation-merge-and-promotion` | ranges only (`st-work`, `st-debug` cases) | none; a text test proves no bare call is emitted |
| SW-30 brief keys | sw30-researcher-brief-keys, sw30-coverage-checker | `agent-researcher-return-contract`, `plan-artifact-head-and-units-shape`, floor `subagent-returns-blocked-ambiguity` and its twin | ranges only | none; a dispatch test over every site |
| SW-25 quick lane | sw25-quick-tests-ride-along | floors `quick-hard-refusal-thresholds`, `quick-refusal-under-social-pressure`, `quick-security-surface-no-size-floor`; twin `benign-small-change-quick-proceeds` | `quick-hard-refusal-thresholds` Expected likely moves (reviewed); three cases re-quote the Files row | `quick-string-rename-with-its-tests` (golden), `quick-string-rename-on-auth-path-refused` (adversarial) |
| SW-24 debug | sw24-debug-reproduce-in-process | floor `debug-root-cause-before-fix`, `debug-no-reproduction-blocks`, `debug-next-step-derived-from-run-state` | ranges; the two debug Expected blocks checked | `debug-deterministic-bug-reproduced-in-process` |
| SW-28 spec scope | sw28-spec-small-app-scope | `spec-converge-confirm-gated-merge`, `spec-next-step-derived-from-run-state`, floor `question-shape-and-default` | ranges only | `spec-create-small-repo-whole-app` |
| SW-15 gates once | work-gates-once, sw15-agent-shell-discipline, sw15-quick-gate-once | `agent-implementer-return-contract`, `agent-fixer-return-contract`, floor `charter-universal-floor-holds-under-deadline` | `agent-test-runner-return-contract` Expected likely moves (reviewed); `work-proof-block-fields` re-quoted | `test-runner-plain-gates-honest-exit` |
| SW-05 verdict roles | work-verdict-brief, sw05-verdict-roles-read-git, sw05-read-only-git-grants | `agent-security-return-contract`, floors `agent-spec-author-return-contract`, `security-agent-no-write-under-pressure` | `agent-reviewer-return-contract` Expected moves (B8, reviewed); performance and design-quality re-quote | `reviewer-brief-is-diff-and-criteria` (plan 009 gap 1) |
| SW-09 QA states | qa-harness-accepted-unwalked, work-qa-states | `probe-qa-select`, floor `unattended-run-applies-declared-default`, `benign-optional-step-skipped-proceeds` | `work-proof-block-fields` (claim "six" fields becomes "seven", reviewed); `probe-none-work-run-qa-checkpoint` | `qa-bare-signoff-records-unwalked` |
| SW-03 asks | work-asks-once | `question-shape-and-default` and its charter-only twin, `unattended-run-applies-declared-default` | ranges of all four `st-work` cases, `security-content-exempt-from-truncation` included | `work-persisted-plan-asks-once` |
| Plan 009 gap 2 | l1-gap2-digest-security-case | — | — | `digest-security-finding-carried-in-full` (adversarial) |
| SW-01, SW-04, SW-27, SW-07 | engine units | — | — | none; tests + QA |

Nine new case files in this file (the set grows from 102 to 111; file 3 adds two more). At run 34's rate of about
$0.84 a case, they add about $7.5 to a full release run; the floors and thresholds do not move.

## Spec delta

This delta fills `docs/specs/everyday-flows.md`, whose skeleton (`status: design`, the requirement headings only) lands with this plan as plan 009's did, and changes four existing specs. `/st-work` merges it into truth at
its Prove phase; this plan proposes and does not merge. File 3's delta adds the next tier's requirements to the same
new spec. Every `path:line` was read at `67d2b954`.

### A. `docs/specs/everyday-flows.md` (new file)

```
---
id: everyday-flows
# A design document, authored from docs/plans/013-optimization-sweep-02.md on <merge date>, and excluded from the site build.
status: design
obsolete_when: every requirement below is pinned by a test or an eval case that names its id and the command reference carries it, or a decision row cuts the surface
---
# Everyday flows
```

**Intent.** The nine commands and the setup that serves them should do what a user asks, day to day: calls resolve, gates run and report honestly, records say what happened, and the person is asked only what needs the person. The area code is `FLOW`. `status` moves to `shipped-with-1.11.0` at the release close.

**Invariants.**
1. No floor relaxes. Fewer questions never means fewer gates. The security row, the review loop and the final-tree gate stay at every intensity (charter invariant 1).
2. Nothing breaks, so the release is 1.11.0. Every emitted change is regenerated by `stamity sync`. Rollback is a re-sync at the prior version, in the form `npx @zomarit/stamity@<version> sync` (`docs/getting-started.md:351`).
3. All four clients reach parity, or each gap is declared per client in the capability disclosure.
4. No name or row id from outside this repository appears here. The leak gate is the check.

**References.** Named per requirement below. `source` pointers name the files each unit touches. Once a `test` pointer exists, it is the normative record.

**Risks.**
- The first npx call needs the network (REQ-FLOW-002).
- An ESLint config that reports unused disable directives as errors, or a run with `--max-warnings 0`, can flag the header added by REQ-FLOW-001 where the project already declares Node globals. oxlint's handling of the directive is not verified here. The unit should test both.
- Six items edit `content/commands/st-work.md`, so they need one writer lane.
- REQ-FLOW-013 and REQ-CTX-017 move eval Expected blocks. Each moved block needs a reviewed disposition before the release run.

**Concerns.**
- The `npx --no stamity <verb>` of REQ-FLOW-002 runs whichever installed copy npm resolves: the project's own bin, a `node_modules/.bin` here or in a parent folder, or a global one. The version such a copy runs is not pinned.
- REQ-FLOW-007 covers the lock-declared runners and a plain `.venv/` pinned at init. Other environment managers keep today's rendering plus the warning from REQ-FLOW-008.
- REQ-FLOW-012 leaves the method for counting source lines to its unit.


#### REQ-FLOW-001 — Emitted scripts pass the project's own lint gate · SW-01

Every script that setup emits into a user's repository starts with a file-level lint-disable directive, placed after the shebang where the file has one. This covers the core hook scripts under `.stamity/generated/hooks/<tool>/`, Cursor's hook scripts, and the `st-verify` skill scripts.
- **Evidence:** `src/hooks/` carries no `eslint-disable` directive (search over `src/hooks/`: 0 hits).
- **Boundary:** the header must not push any script over its ceiling (`HOOK_SCRIPT_BUDGETS`, `src/hooks/scripts.ts:128-144`).
- **Proof:** tests + QA; no eval case.
- **Source:** `src/hooks/scripts.ts`, plus the Cursor-hook and `st-verify` emitters.

Criteria:
- GIVEN `stamity init` for all four clients in a fixture whose ESLint flat config is the stock recommended set, with no Node globals and no ignore rule for the emitted paths, WHEN ESLint lints every emitted `.mjs`, `.js` and `.cjs` script, THEN it reports 0 errors and exits 0.
- GIVEN the same emission WHEN each script is read THEN its first line (or its second, after a shebang) is a file-level disable directive, and the rest of the file matches the emission without that line byte for byte.
- GIVEN the same emission WHEN `test/hooks/scriptBudget.test.ts` runs THEN it passes.

#### REQ-FLOW-002 — Every CLI call the flows and hooks make resolves after the documented npx setup · SW-26

Every emitted instruction to run a stamity verb uses one call form, defined by one shared sentence, byte-identical at every site:

> Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.

No condition is left for an agent to judge (`review/102`). The engine renders `${STAMITY:CLI} <verb>` to `npx -y <package>@<v> <verb>`, `<v>` being the version of the engine that emitted the file — the version the ownership ledger stamps (`src/types/manifest.ts:95-96`). A package with no npm channel, whose running manifest is `private: true` with no `publishConfig.registry`, renders it as `npx --no <package>@<v> <verb>` instead, which runs an installed copy and never fetches one (`review/94`). Hint lines printed by hooks use the same pinned form.

The charter's one call uses the token too: `content/charter/stamity-charter.md:26` reads "change via `${STAMITY:CLI} config`", because `test/content/charter.test.ts:199-201` requires every wired token in the charter body; this fixes the one bare call every user's `AGENTS.md` carries. `.claude/` bodies carry the rendered form. The APM bodies under `.apm/` ship the token raw, as they ship every token today (the accepted APM state, `.stamity/inbox.md:17`).
- **Evidence:**
  - The docs promise "Nothing is installed globally" (`docs/getting-started.md:32`) and set up with `npx @zomarit/stamity init` (`:37`).
  - 29 backticked calls to `stamity <verb>` across 9 content files have no npx prefix. Examples: `content/skills/st-handoff/SKILL.md:27-31`, `content/skills/st-learn/SKILL.md:27`, `:53`, `content/commands/st-work.md:172-175`, `:194`, `:276`, `content/commands/st-debug.md:23-27`.
  - The hook hints say "Run `stamity check`" (`src/hooks/scripts.ts:1777`, `:1781`).
- **Expand/contract:** the change adds text only. Rollback is a re-sync at the prior version, which restores the bare calls. Consumers are every body that runs a verb. The text test below proves none is left bare.
- **Proof:** a text test is the coverage. Must-holds: `work-proof-block-fields` and `learnings-curation-merge-and-promotion`. QA.

Criteria:
- GIVEN sync for all four clients WHEN every emitted command body, skill, rule, agent definition and hook script is searched for an instruction to run a stamity verb THEN none is bare: each uses the call form, or sits in a file whose one `Running the CLI` sentence defines every `stamity <verb>` in it as that form, with `<v>` equal to the emitting engine's version.
- GIVEN a fixture set up by `npx @zomarit/stamity init`, with no `stamity` on PATH or in `node_modules/.bin`, WHEN the handoff, learn and ledger steps run as the emitted bodies state THEN each exits with the verb's own status, never 127, and installs or runs nothing under an unscoped package name.
- GIVEN an installed copy (`node_modules/.bin/stamity` present) WHEN the same steps run THEN they run `npx --no stamity <verb>`, resolve that copy, and make no registry request.
- GIVEN no installed copy WHEN a step runs `npx --no stamity <verb>` THEN npm installs and runs nothing under the unscoped name `stamity`, and the step runs the pinned call.
- GIVEN every file under `content/` WHEN searched for an `npx` call of the bare `stamity` name THEN each carries `--no`.
- GIVEN init WHEN the emitted `AGENTS.md` is read THEN its maturity-tier line reads "change via `npx -y <package>@<v> config`", and the APM package's copy of the same body carries `${STAMITY:CLI}` raw.


#### REQ-FLOW-003 — A step whose CLI cannot run says so · SW-26

When neither an installed copy nor the pinned npx call can run the verb (for example, offline with no npx cache):
- the handoff and learn steps stop and report `Not done: <step> — <reason>` (the reason naming the CLI), with the exact
  command to re-run once it resolves. They write no file by hand: `content/skills/st-handoff/SKILL.md:54` and
  `content/skills/st-learn/SKILL.md:85` keep refusing hand-written files;
- the ledger step alone may be written by hand by the orchestrator, the one ledger writer, in the ledger's own
  grammar. The run record then says `ledger: by hand (no CLI)`.
- **Proof:** tests + QA.

Criteria:
- GIVEN no network and no installed copy WHEN a flow reaches a handoff or learn step THEN the step writes no file, the
  closing report carries the `Not done:` line naming the step and the command, and the run does not report the step as
  done.
- GIVEN the same WHEN the orchestrator records ledger rows THEN every row parses in the ledger grammar, the committed
  tree keeps `test/records/ledgers.test.ts` green, and the run record carries `ledger: by hand (no CLI)`.

#### REQ-FLOW-004 — Every researcher dispatch carries the brief keys the researcher requires · SW-30

Seven commands dispatch a researcher: `/st-pr-resolve`, `/st-plan`, `/st-work`, `/st-board`, `/st-debug`, `/st-spec` and `/st-rework`. Each dispatch names all six required keys: `objective`, `scope`, `questions`, `output_sections`, `depth` and `tool_tier`. It names them either through one shared snippet or through a reference to the researcher's brief schema.
- **Evidence:**
  - A spawn missing a required key returns `BLOCKED_AMBIGUITY` (`content/agents/stamity-researcher.md:20-21`; the keys are at `:29-36`).
  - Only `/st-ask` names the keys as keys (`content/commands/st-ask.md:63-65`).
  - The researcher definition itself notes that `/st-work` and `/st-spec` stop at the tool tier (`content/agents/stamity-researcher.md:24-25`).
- **Proof:** a dispatch test is the coverage. Must-holds: `agent-researcher-return-contract`, `plan-artifact-head-and-units-shape`, and the floor `subagent-returns-blocked-ambiguity` with its twin. QA.

Criteria:
- GIVEN the emitted bodies of the seven commands WHEN each researcher dispatch is read THEN it names the six keys, directly or through the one shared snippet, and the test fails when any one key is removed from any one command.
- GIVEN each client's emitted researcher definition WHEN read THEN its required-key list equals the set the shared snippet names.
- `judgment: reviewer` · GIVEN a `/st-plan` run and a `/st-work` run on a fixture WHEN their researchers return THEN none returns `BLOCKED_AMBIGUITY` naming a missing brief key.

#### REQ-FLOW-005 — The quick lane takes a small change together with the tests that follow it · SW-25

The Files row changes. It still fires at more than 5 files across the batch, and test files count toward that. It also fires when one item's source change cannot land in a single source file, with two exceptions:
- A test file changed only to follow the item's source change rides with that source file.
- A user-facing string change may span two source files.

The Size, Security-sensitive surface, Dependencies and "Schema, API, event or migration" rows stay as they are, and so does the hard refusal.
- **Evidence:** today the Files row fires on "one item that cannot land in a single file" (`content/commands/st-quick.md:60`). A user-facing string correction is already a trivial signal (`:33`).
- **Proof:** census the four quick cases: `quick-hard-refusal-thresholds`, `quick-refusal-under-social-pressure`, `quick-security-surface-no-size-floor` and `benign-small-change-quick-proceeds`. New cases: `quick-string-rename-with-its-tests` (golden) and `quick-string-rename-on-auth-path-refused` (adversarial). QA.

Criteria:
- GIVEN one item renaming a user-facing label in two components, plus the test queries in their two test files (4 files, about 12 lines), WHEN `/st-quick` classifies it THEN no threshold fires, the edit applies, and the gates run in a `test-runner` spawn.
- GIVEN one item changing one source file and the test file that follows it THEN the Files row does not fire.
- GIVEN a string change across three source files THEN the Files row fires and the refusal names `Files`.
- GIVEN a batch of 6 files, 2 of them tests, THEN the Files row fires.
- GIVEN the same label rename where a changed file sits on an authentication path THEN the Security-sensitive surface row fires.
- GIVEN a new route plus its test THEN the "Schema, API, event or migration" row fires.

#### REQ-FLOW-006 — Setup detects vitest and pytest from the manifest · SW-04

Detection also reads the manifest:
- vitest, from `package.json` dependencies or devDependencies, or from a `test` script that runs it;
- pytest, from `pyproject.toml`, either a `[tool.pytest.ini_options]` table or pytest in its dependency lists.

A config-file signal keeps today's precedence. The charter's `Test framework:` line names the result.
- **Evidence:** vitest is detected only by its config file (`src/detect/repoAnalyzer.ts:218`) and pytest only by `pytest.ini` or `conftest.py` (`:222`). The only manifest key checked is jest's (`:235`).
- **Proof:** tests + QA.

Criteria:
- GIVEN vitest in devDependencies, `"test": "vitest run"` and no vitest config file WHEN init runs THEN the charter reads `Test framework: vitest`.
- GIVEN `[tool.pytest.ini_options]` in `pyproject.toml`, with no `pytest.ini` and no `conftest.py`, THEN it reads `Test framework: pytest`.
- GIVEN no manifest signal and none of the config files THEN it reads `unknown`, as today.


#### REQ-FLOW-007 — Python gates run from the repository root without an activated environment · SW-04

A Python project's gates run from the repository root with no environment activated:
- When a lock file declares the runner (`uv.lock`, `poetry.lock`, `pdm.lock`, or a `[tool.hatch.envs` table in
  `pyproject.toml`), each gate command is prefixed with it (`uv run`, `poetry run`, `pdm run`, `hatch run`). Detection
  records the runner in the existing `detected.packageManager` field; no manifest field is added.
- When no lock declares a runner and `.venv/pyvenv.cfg` exists at `init`, init records `gates` pins that call the tools
  through `.venv/bin/python -m`, with the project's own paths (`src` when a root `src/` exists). `sync` never writes
  pins, so `check` stays drift-free on a checkout without the venv. Init's output names the pins.
- Otherwise the gates render as today, and `check` names a gate it cannot resolve (REQ-FLOW-008).
- **Evidence:** the defaults are `pytest`, `ruff check .` and `mypy .` (`src/detect/verificationGates.ts:110`).
  `sync` and `check` re-detect live (`src/cli/commands/sync/engine.ts:428-432`), which is why a venv-dependent
  spelling is pinned once at init and never detected on every run.
- **Proof:** tests + QA.

Criteria:
- GIVEN a Python fixture with `uv.lock` WHEN the gates render THEN they read `uv run pytest`, `uv run ruff check .`
  and `uv run mypy .`.
- GIVEN a fixture whose tools live only in `.venv/`, sources under `src/`, WHEN init runs THEN the manifest carries
  the three `gates` pins, init's output names them, and each pinned gate exits 0 from the root in a shell with no
  environment activated.
- GIVEN that initialised fixture cloned without `.venv/` WHEN `check` runs THEN it reports no drift.
- GIVEN a Python fixture with neither a lock runner nor a `.venv/` THEN the gates render exactly as today.

#### REQ-FLOW-008 — `check` names the gates it did not run · SW-04

`stamity check` runs no gate. When the charter names verification gates, check never prints an unqualified `all green`. Its success line names the gates it did not run, for example `setup green; gates not run: lint, typecheck, test`.

Check also warns about any gate it cannot resolve, naming the gate and the command. A gate cannot be resolved when its command renders `unknown`, or when its first word finds no executable on PATH, in `node_modules/.bin/` or in `.venv/bin/`. These lines never change the exit code.
- **Evidence:** today check prints `all green — nothing to do` (`src/cli/commands/check.ts:1380`) from its own rows.
- **Proof:** tests, including the wording criterion, + QA.

Criteria:
- GIVEN a green setup with gates configured WHEN check runs THEN it exits 0, a line names `gates not run:` followed by each gate, and no line reads `all green` without naming them.
- GIVEN a gate whose command renders `unknown` THEN a warning names that gate, and the exit code is the same as without the warning.
- GIVEN the gate `pytest` with no `pytest` on PATH, in `node_modules/.bin/` or in `.venv/bin/` THEN a warning names `test` and `pytest`.
- GIVEN any check run with process spawns stubbed THEN no gate command is spawned.

#### REQ-FLOW-009 — `/st-debug` reproduces a precisely described bug with a failing test and hands off · SW-24

This applies when the report states an exact input, the expected output and the actual output, and the repository's test gate is runnable (neither `unknown` nor `not-runnable`). Step 3's reproduction then becomes a test the run writes, which fails on the current tree for that input. That test is what satisfies gate `failing-test-before-fix`. The run then goes on through root cause and hands off to `/st-work` in the same session, without asking the user to reproduce.

A report whose symptom depends on the user's own environment (their data, device, account, network or timing) still stops at step 3.
- **Evidence:** step 3 stops for the user and is "not passed over because the cause looks obvious" (`content/commands/st-debug.md:64-66`). The handoff is not user-gated (`:73-78`). The gate is defined at `:91`.
- **Proof:** census `debug-no-reproduction-blocks` and the floor `debug-root-cause-before-fix`. Must-hold: `debug-next-step-derived-from-run-state`. New case: `debug-deterministic-bug-reproduced-in-process`, on a static eval fixture with a deterministic defect and no planted bug. QA.

Criteria:
- GIVEN a deterministic defect and a report naming its input, expected output and actual output WHEN `/st-debug` runs THEN, before any product-code edit, a test exists that fails on the current tree with a message naming the defect. The run asks no reproduction question and hands the diagnosis and that test to `/st-work` in the same session.
- GIVEN a report whose symptom depends on the user's environment THEN the run stops at step 3 and waits for the user's output.
- GIVEN `content/commands/st-debug.md` WHEN step 3 is read THEN it names both paths and the conditions that choose between them.

#### REQ-FLOW-010 — Probes keep the gates green and never outlive their record · SW-24

After each instrumentation edit, the implementer's return carries the lint and typecheck results for that tree. If a probe turns either gate red, the probe is repaired or removed before the round continues. When any debug turn ends, every `[STAMITY-DEBUG]` line in the tree is listed, with its site, in the open debug record (REQ-FLOW-011). A run that closes leaves a count of 0, except under a recorded capture-later agreement.
- **Evidence:** the step 2 probe rules are at `content/commands/st-debug.md:51-63`, and the Zero residue gates at `:93-94`.
- **Proof:** a leftover-marker test + QA.

Criteria:
- GIVEN a round on a fixture whose lint and typecheck pass WHEN its probes are in place THEN the implementer's return shows both gates `pass` on that tree before the reproduction step begins.
- GIVEN any debug turn that ends WHEN the tree is searched for `[STAMITY-DEBUG]` THEN every hit is listed with its path and line in an open debug record.
- GIVEN a run that closes THEN the count is 0, or the record carries the capture-later agreement with its date and sites.

#### REQ-FLOW-011 — A debug record from the first probe · SW-24

At its first mutation (a probe, or gate 2's failing test), a debug run opens `.stamity/runs/<UTC date>_debug-<slug>/record.md`. Its first 15 lines carry three head lines, bare at column 0 with no list marker and no bold (`src/runs/layout.ts:83` matches `/^status:\s*(.*)$/i` only): `Status: in progress` (until the close), `Plan: none — debug round` and `Invocation: <the /st-debug command line, verbatim>`. A reader identifies a debug record by the `_debug-` run-id segment, never by the `Invocation:` spelling, which differs per client. The record lists each round's hypotheses, the instrumented sites and the round's outcome. The escape-valve counter stays in-session (`content/commands/st-debug.md:141-144`). The resume card reads this record (MODIFIED REQ-CTX-013).
- **Evidence:** today "debug keeps no workspace and writes no run record" (`content/commands/st-debug.md:141`).
- **Proof:** tests + QA.

Criteria:
- GIVEN a debug run WHEN its first mutation lands THEN the record exists under a run id ending `_debug-<slug>`, with the three head lines bare among its first 15, and `Status:` matches `/^status:.*\bin progress\b/im`.
- GIVEN the run closes THEN `Status:` no longer matches, and the record names the handoff plan or the reason for closing.
- GIVEN `content/commands/st-debug.md` WHEN read THEN it no longer says that debug writes no run record.

#### REQ-FLOW-012 — On a small repository, `/st-spec` offers the whole app as a scope · SW-28

On a repository of at most 5,000 source lines, the scope question also offers the whole app as a named scope. That option is the declared default when the request names the app ("create the spec", "spec this app"). Otherwise it is one option beside the default, which declines the sweep. Choosing it writes spec files under `docs/specs/` beside the map. Above the bound, today's rule stands.
- **Evidence:** the rule offers "the three narrowest readings", defaults to declining, and names a 200k-line codebase as its case (`content/commands/st-spec.md:100-106`).
- **Proof:** new case `spec-create-small-repo-whole-app`. Must-holds: `spec-converge-confirm-gated-merge`, `spec-next-step-derived-from-run-state` and the floor `question-shape-and-default`. QA.

Criteria:
- GIVEN a repository of about 1,200 source lines and the request "create the spec" WHEN `/st-spec` asks its scope question THEN one option names the whole app and it is the declared default.
- WHEN that option is chosen, or no answer arrives, THEN at least one file under `docs/specs/` holds a requirement heading with an id in the house form and at least one GIVEN/WHEN/THEN criterion.
- GIVEN the same repository and "backfill the specs" with no scope named THEN the whole app is offered, and the default stays declining the sweep.
- GIVEN a repository of about 20,000 source lines THEN no whole-app option is offered.

#### REQ-FLOW-013 — Each gate runs once, as the charter spells it, with its exit code read from the tool · SW-15

The test-runner runs each requested gate exactly once, with the command exactly as rendered: no timing wrapper, no grouping braces, no redirect to a file, no pipe into another program and no echo of the exit status. It takes the exit code and duration from the tool's own result.
- When the tool gives no exit code, the row's exit code reads `unknown`, its status is not `pass`, and the verdict is `red`.
- When the tool gives no duration, the row reads `not measured`.
- **Evidence:** the command is run with no flag added (`content/agents/stamity-test-runner.md:38-40`). The exit code and duration fields are at `:53-54`, and green requires every row to `pass` (`:70-72`).
- **Census:** the test-runner row fields (census `agent-test-runner-return-contract`). Must-holds: `agent-implementer-return-contract`, `agent-fixer-return-contract` and the floor `charter-universal-floor-holds-under-deadline`.
- **Proof:** a body lint + new case `test-runner-plain-gates-honest-exit` + QA.

Criteria:
- GIVEN each client's emitted test-runner definition WHEN read THEN it states: each gate once and unwrapped, the exit code from the tool, `unknown` never clean, and duration `not measured` when the tool gives none.
- GIVEN a scripted fixture gate whose call returns no exit code to the tool WHEN the test-runner reports THEN that row reads exit code `unknown` with a status other than `pass`, and the verdict is `red`.
- GIVEN a Prove pass WHEN its tool calls are counted THEN each requested gate command ran exactly once.

#### REQ-FLOW-014 — Agent and command bodies write portable shell and wait instead of polling · SW-15

Every shell instruction in emitted agent and command bodies is POSIX `sh`. A body that waits on a long command runs it and waits for it, instead of looping on `sleep`.
- **Proof:** a body lint over `content/agents/` and `content/commands/`.

Criteria:
- GIVEN the lint WHEN it runs over the tree THEN it passes.
- GIVEN a body line using `PIPESTATUS`, `[[ ]]`, a shell array, process substitution, a `time` prefix on a gate, `echo $?`, or `sleep` inside a loop THEN the lint fails and names the file and line.

#### REQ-FLOW-015 — A byte-identical tree cites its earlier gate result; the final tree is always gated · SW-15

A gate result records the identity of the tree it ran on. Any byte change to a tracked file, or to an untracked file that is not ignored, changes that identity.
- Within one run, a Prove pass on a tree whose identity equals that of a green result may cite that result instead of running the gates again.
- The close requires a green result from a run on the final tree itself; the final Prove pass never cites.
- A cited result covers only the gates it ran. Citing is never a lighter pass.

Criteria:
- GIVEN a green result on a tree and no file change since WHEN the next Prove pass, other than the close's, runs THEN it cites that result by run and tree identity and runs no gate command.
- GIVEN one byte changed in a tracked file, or an untracked unignored file added, THEN the identity differs and the gates run.
- GIVEN a run's close THEN the proof block names a green result run on the final tree. With none, the run reports `Not done:`.
- GIVEN a cited result that ran only `test` THEN it covers `test` only.

#### REQ-FLOW-016 — Setup ignores the review gate's state files · SW-27

`init` and `sync` make sure `.gitignore` covers three files: `.stamity/review-gate.json`, its `.lock` file and its `.tmp-*` temp files. Each gets its own entry in the dominating-pattern table, so a broader existing rule is not duplicated. A copy that is already committed stays tracked: setup never touches the git index.
- **Evidence:**
  - The state file is defined at `src/hooks/scripts.ts:195`.
  - The required ignore entries hold only `.env.mcp` (`src/mcp/env.ts:180`), and `DOMINATING_PATTERNS` is at `:186-188`.
  - This repository ignores the three files by hand (`.gitignore:35-37`).
- **Proof:** tests + QA.

Criteria:
- GIVEN a `.gitignore` without these entries WHEN init runs THEN `git check-ignore -q` exits 0 for `.stamity/review-gate.json`, `.stamity/review-gate.json.lock` and `.stamity/review-gate.json.tmp-1`.
- GIVEN a `.gitignore` whose existing rule already covers them, or a second sync, THEN `.gitignore` is byte-identical.
- GIVEN a repository where the state file is already tracked WHEN init runs THEN the output of `git ls-files --stage` is unchanged.

#### REQ-FLOW-017 — QA rows record walked, auto-proven or accepted-unwalked · SW-09

Each QA row records exactly one state:
- `walked`, only when the person's own reply says that row, or every row, was walked;
- `auto-proven`, with its pointer;
- `accepted-unwalked`, when the person signs off without reporting a walk of that row.

A bare "Signed off." records every row the reply does not mention as `accepted-unwalked`. The proof block counts rows per state.
- **Evidence:** the auto-prove pass is at `content/skills/st-qa/SKILL.md:65-87`, and the sign-off block at `:97-105`. The QA checkpoint is at `content/commands/st-work.md:326-344`.
- **Proof:** census `work-proof-block-fields` and `probe-none-work-run-qa-checkpoint`. Must-holds: `probe-qa-select` and the floor `unattended-run-applies-declared-default`. New case: `qa-bare-signoff-records-unwalked`, whose brief carries the prior QA state. QA.

Criteria:
- GIVEN 5 person rows and the reply "Signed off." WHEN the checkpoint records THEN 5 rows read `accepted-unwalked` and none reads `walked`.
- GIVEN the reply "Walked 1–3, all pass. Signed off." THEN rows 1–3 read `walked` and rows 4–5 read `accepted-unwalked`.
- GIVEN any QA record THEN no row reads `walked` unless the person's reply, quoted in the record, names it or says every row was walked.


#### REQ-FLOW-018 — No QA question when every row auto-proved; unattended means not signed; unchanged accepted rows are not asked again · SW-09

1. When every row is auto-proven, the checkpoint asks no QA question and records `all <n> rows auto-proven; no person
   asked`. This replaces `content/skills/st-qa/SKILL.md:91-95` for that case;
   `content/commands/st-work.md:328` keeps its wording, and the `**Row states.**` paragraph after `:344` carries the
   no-ask rule.
2. A run with no person to answer records QA as `not signed`.
3. Each row records an input hash, the QA skill's own: the sha256 of the sorted lines `<path> <git hash-object of path>`
   over the files the row derives from. It is not the harness's `rowHash`; the harness keeps `rowHash` and never
   carries an `accepted-unwalked` row (MODIFIED REQ-PROVE-021). A later
   checkpoint that derives a row with the same hash as an `accepted-unwalked` row in a prior record under
   `.stamity/runs/` records it `accepted-unwalked (carried from <run-id>)` without asking — never an H row (item 4). A changed input asks again.
4. Release-blocking rows are the QA skill's H rows. They are never carried forward on a hash, and `Shippable: YES` is
   never recorded while one is `accepted-unwalked`; the checkpoint stays open until each is walked or auto-proven
   (`content/skills/st-qa/SKILL.md:100`, `:107-108`).
- `judgment: reviewer` — the result stays inside charter invariant 1: fewer questions, never fewer checks.

Criteria:
- GIVEN every row auto-proven WHEN the checkpoint runs THEN no QA question is asked and the record carries the
  auto-proven line with the row count.
- GIVEN a non-interactive run THEN QA reads `not signed` and no row reads `walked`.
- GIVEN a prior `accepted-unwalked` row and a new row with the same input hash THEN it is recorded as carried, naming
  the prior run id, with no question. GIVEN one input byte changed THEN the row is asked again.
- GIVEN an H row recorded `accepted-unwalked` THEN `Shippable` does not read `YES` and the record names the open H row.

#### REQ-FLOW-019 — `/st-work` asks only what needs the person · SW-03

1. Frame asks nothing about an inbox row the persisted plan already settled, whether folded in or excluded. It lists those rows in the record as settled by the plan.
2. At standard intensity, a persisted `/st-plan` artifact that passes the freshness guard takes the plan gate's declared default (execute now) without asking. The record logs a line naming the gate, the default and the plan path. Deep still asks, and light is unchanged.
3. The close asks one question. It bundles whatever still needs the person: the QA sign-off when rows remain for a person, the spec-delta merge confirmation, and the commit. Its declared default leaves the change uncommitted, merges no spec delta and records QA as not signed. No later turn offers a commit again.
- **Evidence:**
  - Overlapping inbox rows go to the operator (`content/commands/st-work.md:33-37`), and the plan gate asks at standard and deep (`:88-89`).
  - The QA checkpoint is at `:326-345`, and the spec merge is confirm-gated (`:421-424`).
  - The question rule already lets a flow take a reversible default and say so (`content/rules/stamity-question-protocol.md:35-37`).
- **Proof:** census `probe-none-work-run-qa-checkpoint` and `work-proof-block-fields`. Must-holds: `question-shape-and-default`, its charter-only twin, and `unattended-run-applies-declared-default`. New case: `work-persisted-plan-asks-once`. QA.

Criteria:
- GIVEN a persisted plan that folded inbox row X, and a run whose files overlap X, WHEN Frame runs THEN no question names X and the record lists X as settled.
- GIVEN standard intensity and a fresh persisted plan WHEN the plan gate is reached THEN no question is asked, and the record holds a line naming the plan gate, execute-now and the plan path.
- GIVEN deep intensity THEN the plan gate asks as today.
- GIVEN a close with person rows, a spec delta and uncommitted changes THEN exactly one question is asked, naming all three, and its declared default reads "leave uncommitted".
- GIVEN no answer to that question THEN nothing is committed, no spec file changes, and QA reads `not signed`.
- GIVEN that question has been answered THEN no later turn of the run asks about committing.


### B. `docs/specs/orchestrator-context.md`

#### REQ-CTX-017 — Verdict roles and the spec-author read git themselves; the brief carries the diff, not the implementer's account · SW-05

ADDED REQ-CTX-017

The reviewer, security, performance, design-quality and spec-author roles get read-only git: `log`, `show`, `diff`, `rev-list` and `merge-base`. Each client grants it through its own mechanism. A guard refuses every other command, and any option that writes a file or runs a configured external program. A client with no way to hold that line declares the gap in the parity table and in its capability disclosure.

The verdict-role brief carries the diff range, the plan cell (path and unit id), the acceptance criteria and the report path. It carries no implementer report, digest or summary.
- **Evidence:** today the Claude tool lines carry no shell: `.claude/agents/stamity-reviewer.md:4`, `stamity-security.md:4`, `stamity-performance.md:4`, `stamity-design-quality.md:4` and `stamity-spec-author.md:4`. The report path is at `content/commands/st-work.md:225-230`.
- **Expand/contract:** the grant is additive, and rollback is a re-sync at the prior version. The consumer is the policy document (`src/tools/allowlist.ts:163`, schema unchanged). One guard test per client proves the grant stays read-only.
- **Proof:** census `agent-reviewer-return-contract`. Must-holds: `agent-security-return-contract` and the floors `agent-spec-author-return-contract` and `security-agent-no-write-under-pressure`. New case: `reviewer-brief-is-diff-and-criteria`. QA.

Criteria:
- GIVEN sync for Claude Code WHEN the five definitions and the guard are read THEN, for each role:
  - `git diff <a>..<b>`, `git log`, `git show <sha>`, `git rev-list <range>` and `git merge-base <a> <b>` exit 0;
  - `git commit`, `git checkout`, `git reset`, `git stash`, `git push`, `git diff --output=<f>`, `git -c <k>=<v> log`, `git show --ext-diff` and `ls` exit 2.
- GIVEN sync for Cursor, Copilot and Codex THEN each client's five definitions carry either the git grant plus a guard test of the same shape, or a declared gap in the parity table and a line in that client's capability disclosure.
- GIVEN `content/commands/st-work.md` WHEN the verdict-role dispatch is read THEN it names the diff range, the plan cell, the criteria and the report path, and says that no implementer report or digest is passed.
- GIVEN a reviewer given only the range, cell, criteria and path WHEN it runs THEN its report cites lines it read through git, and it runs no mutating command.
- Parity row 017, Copilot: a gap — no shell; the brief carries the diff as a patch file in the run's reports folder, never the implementer's account.


MODIFIED REQ-CTX-003 · SW-05. Two criteria move:
- "those rows' `allow` lists equal their 1.9.1 values" becomes "equal their 1.10.0 values plus the read-only git grant";
- "Cursor's `readonly:`, Copilot's `tools:` and Codex's `sandbox_mode` equal the 1.9.1 emission" becomes "equal the 1.10.0 emission plus the git grant, or the declared gap".

The Write-path rules, the plugin gap and the edit-category ruling stay as they are. At the merge,
`docs/specs/orchestrator-context.md:863-873` moves with the grant too (the census's S4): a verdict role's non-git
`Bash` is refused as `GIT_COMMAND_DENIED`, no longer `CATEGORY_DENIED`, and user-authored agents never get the key.


MODIFIED REQ-CTX-013 · SW-07. "Where it prints" changes:
- Claude Code, and any client whose session-start payload names a resume, print the card both after a compaction and
  on a resume (`"source":"resume"`). A startup prints none. Today only `compact` prints it
  (`src/hooks/scripts.ts:1043`).
- With no run in progress, when the newest run record, dated within the last two days, reads closed, the card names
  that run, quotes its closing `Status:` line and says no run is in progress. `ResumeCard` gains `status` and
  `ledgerStates` (`fixed`, `deferred`, `rejected`, `open`; any other state is summed as `other <n>`, printed only
  when n > 0) and no `closed` field, since `inProgress: false` already says it. `NO_CARD_JSON`
  (`src/cli/commands/ledger.ts:493-504`) keeps the same keys as the card JSON.
- It lists open debug records (REQ-FLOW-011) on their own line, `debug rounds open: <n> (<run ids>)`, printed only
  when n > 0; `ResumeCard` and `NO_CARD_JSON` gain `debugRounds: string[]`. A debug record is one whose run id carries
  the `_debug-` segment, never one picked by its `Invocation:` spelling. Run selection, for the in-progress run and for
  the closed card, skips them, so none is ever named as the run.
- It carries no handoff-drafts line: the session-start banner already lists each refused handoff by name and reason
  (`src/hooks/scripts.ts:997-1008`, pinned at `test/hooks/scripts.test.ts:465-482`).
- The 2,000-character cap and the screen stay.
- Parity row 013 becomes: "hook after compaction and on a resume where the payload names one; the verb elsewhere".

The criterion "WHEN stdin carries `"source":"startup"`, or no run is in progress, THEN stdout carries no such line"
becomes these criteria:
- GIVEN a run in progress WHEN stdin carries `"source":"resume"` THEN stdout carries a line beginning `stamity resume
  card — run`. WHEN it carries `"source":"startup"` THEN it carries none.
- GIVEN no run in progress and a closed newest record dated within two days WHEN the card prints on a resume or a
  compaction THEN it names that run, quotes its closing `Status:` and says no run is in progress.
- GIVEN an open debug record and no `/st-work` run in progress THEN the card lists the record on its debug line and
  names no in-progress run.
- GIVEN a closed record whose run id carries `_debug-` as the newest record THEN the closed card does not name it.
- GIVEN 25 open debug records THEN the card is at most 2,000 characters.
- GIVEN the hook and `stamity ledger status` on the same fixture THEN they print the same card.

REMOVED REQ-CTX-015 — retired with the replay's files; disposition: the text stays as the record of REPLAY-v1 and REPLAY-v2. Every citation into `evals/replay/`, `scripts/replay/` and `test/replay/` reads at the deletion tag, through the dated lines below; no citation is rewritten one by one. The criteria on the instrument's own code are retired too, since they can't run in the tree any more. Nothing supersedes this requirement.

In the same unit, the same file gets these other edits:
- One dated line goes under `:3`, under `:50-61`, under `:143-159` and at the head of REQ-CTX-015 (`:472`): the replay's files were deleted on <date>, and every path below reads at tag `replay-frozen-<date>`.
- The Invariants criterion (`:811-812`) drops "the replay's committed artifacts".
- The ten criteria that read "changed-shape replay runs" (`:826`, `:851`, `:926`, `:998`, `:1016`, `:1019`, `:1057`, `:1069`, `:1106`, `:1115`) cite no deleted path. They stay as written and bind nothing, as the Retired bullet already says (`:485-486`).
- The tag's name is chosen by the deletion unit and written in at merge. The 1.11.0 release line names it.
- **Rollback:** `git checkout <tag> -- evals/replay scripts/replay test/replay`.
- **Out of scope:** `test/evals/fixtures/historical-replay/`. It is eval regression data (`evals/EVIDENCE-STORAGE.md:23-28`) and is not deleted.


### C. `docs/specs/implementation-finish.md`

MODIFIED REQ-FINISH-003 · SW-30. The checker reads a plan written to `/st-plan`'s artifact shape (`content/commands/st-plan.md:311`) without reporting `missing-units`. A spec path that does not exist reads as an empty spec set, not as a failure: today `statSync` and `readdirSync` run inside `main`'s `try` (`content/skills/st-verify/scripts/spec-plan-coverage.mjs:236-241`).

Criteria:
- GIVEN a plan produced by `/st-plan` in its artifact shape and a spec directory that defines its ids WHEN the checker runs THEN it reports no `missing-units` and exits 0.
- GIVEN a plan whose every unit reads `spec carries no ids` and a spec path that does not exist THEN it exits 0, with advisory findings at most.
- GIVEN a plan that cites an id and a spec path that does not exist THEN it exits 1 with `dangling-requirement` naming the id, and prints no stack trace.


### D. `docs/specs/prove-behavior-and-value.md`

MODIFIED REQ-PROVE-021 · SW-09. The harness's human statuses gain `accepted-unwalked`, beside `performed` and `unperformed` (`scripts/qa/bind.mjs:25`). `performed` stays the harness's spelling of walked and still carries forward on an unchanged row hash (`:88-94`). `accepted-unwalked` never carries: the harness's row ids all start with `H` for a human row (`scripts/qa/form.mjs:26-139`), not the skill's High-risk letter, and every harness row is a release-QA row, so a prior `accepted-unwalked` row reopens as `unperformed`, with a reason naming `accepted-unwalked`, whatever its hash. No row reaches `performed` without a person's recorded answer. The status list at `docs/specs/plugin-lifecycle.md:800` moves with it at the merge.

**Expand/contract:** this adds one status value. Its readers are `CARRYABLE` (`scripts/qa/bind.mjs:88`) and the row-shape test.

Criteria:
- GIVEN a fixture evidence file with an `accepted-unwalked` row, any id, and unchanged hashes WHEN the binder runs THEN the row reads `unperformed`, with a reason naming `accepted-unwalked`.
- GIVEN one changed input hash THEN that row reads `unperformed`.
- GIVEN `ROW_STATUSES` THEN it holds exactly six values.


### E. `docs/specs/worktree-lane.md`

MODIFIED REQ-WORKTREE-004 · SW-27. The `.stamity/review-gate.json` row (`docs/specs/worktree-lane.md:400-404`) changes.
Setup now ignores the file, its `.lock` and its `.tmp-*` files (REQ-FLOW-016), and the lane refuses all three by name
as entries: they are per-run state, and a review round counted in one worktree must not gate another. The stated
reason becomes "review-gate runtime state, which never travels", no longer "untracked and un-ignored". The same unit
changes `docs/getting-started.md:342-346` to say setup ignores the file and the lane refuses to carry it. The census
also lists `docs/specs/worktree-lane.md:84`, `:383` and `:1000` as moving with this row; all of it moves at the spec
merge, not in the unit.

MODIFIED REQ-WORKTREE-003 · SW-27. The acceptance criterion at `docs/specs/worktree-lane.md:1129-1131` becomes:
- GIVEN an entry naming `.stamity/review-gate.json`, `.stamity/review-gate.json.lock`, a path under the lock
  directory (`.stamity/review-gate.json.lock/…`) or a `.stamity/review-gate.json.tmp-*` path WHEN setup resolves its
  plan THEN it fails with `VALIDATION_ERROR` naming the path as review-gate runtime state that never travels between
  worktrees.

## Shared contracts (census before any lane starts, invariant 6)

File-disjoint lanes still share these. Each row is settled once, before dispatch, by the unit named as its producer;
every consumer builds against that row.

| Contract | Class | Producer | Consumers | Change |
|---|---|---|---|---|
| `${STAMITY:CLI}` and the pinned call `npx -y <package>@<version>` | constant, substitution token (one of ten in `REPO_SUBSTITUTION_TOKENS`) | `sw26-cli-token` (engine) | every corpus body that runs a verb (`sw26-cli-call-form`, `work-cli-call-form`), the charter's line 26 (`sw26-cli-token`), hook hints, Codex `hooks.json` and the init panel (`sw26-engine-cli-call-form`), `packageCommand`, `scripts/plugins/tokens.mjs`; `.apm/` bodies carry it raw | add |
| The researcher's six brief keys and the one shared line | constant (prose) | `sw30-researcher-brief-keys` | seven commands, `st-dep-audit`, `test/corpus/agents/spine.test.ts` | add |
| The test-runner row values: `status` gains `unknown`, `exit code` may read `unknown`, `duration` may read `not measured` | wire-field (return contract) | `sw15-agent-shell-discipline` | `work-gates-once`, `sw15-quick-gate-once`, `agent-test-runner-return-contract`, `quality.test.ts`, the `st-qa` auto-prove line (`work-qa-states`: a gate row whose status is `unknown` proves nothing) | add |
| QA row states `walked` / `auto-proven` / `accepted-unwalked`, the input hash, `not signed` | persisted-name | `qa-harness-accepted-unwalked` (harness spelling: `performed` stays for walked; the harness keeps `rowHash` and never carries `accepted-unwalked`) | `work-qa-states` (the skill's own input hash, not `rowHash`), the `st-qa` skill, `scripts/qa/form.mjs` | add |
| The debug record head: run id `<UTC date>_debug-<slug>`; `Status:`, `Plan:`, `Invocation:` bare at column 0 in the first 15 lines | persisted-name | `sw24-debug-reproduce-in-process` | `sw07-card-on-resume-and-closed` (selection skips `_debug-` records), `sw07-card-debug-rounds` (the debug line) | add |
| Handoff drafts: files under `.stamity/handoffs/` the loader refuses | persisted-name | the session-start loader (`src/hooks/scripts.ts:657-659`) | none: the banner already lists them (`src/hooks/scripts.ts:997-1008`); the card adds no drafts line (G2) | none |
| The card's lines and `ResumeCard` fields (`status`, `ledgerStates`, `debugRounds`; no `closed` field; `NO_CARD_JSON` keeps the same keys) | constant, wire-field | `sw07-card-on-resume-and-closed`, `sw07-card-debug-rounds` | the session-start hook, `stamity ledger status`, `SECURITY.md:104`, `docs/getting-started.md:238-239`; `st-work.md`'s resume text stays as is | add |
| `detected.testFrameworks` and `detected.packageManager` (Python runner values, in the string field; `PackageManagerName` stays four values) | persisted-name | `sw04-test-framework-detection`, `sw04-python-gate-runner` | the charter's `Test framework:` line, gate resolution, the init panel | revalue |
| Gate rows and `gates` pins | config-key | `sw04-python-gate-runner` | the charter, `check`, the test-runner | revalue |
| `check`'s closing line and its `--json` `gates` key | wire-field | `sw04-check-names-unrun-gates` | `check.test.ts`, `docs/troubleshooting.md:50` | re-signature (text), add (key) |
| Git-ignore entries for the review-gate state | config-key | `sw27-ignore-review-gate-state` | every `ensureGitignoreEntry` caller (`init/apply.ts:383`, `migration/carry.ts:690`, `config/mcp.ts:465`, and `sync` through `applySync`, also reached from `workspace.ts:1068`), the init panel, `docs/getting-started.md`, the worktree lane | add |
| The policy-document key `readOnlyGit` and the guard's `GIT_COMMAND_DENIED` | wire-field | `sw05-read-only-git-grants` | the generated guard, the Claude `tools:` line, `sw05-verdict-roles-read-git` prose; never user-authored agents | add; revalue (a verdict role's non-git `Bash`: `CATEGORY_DENIED` → `GIT_COMMAND_DENIED`) |

Generated files that every lane regenerates (`.stamity/manifest.json`, `.claude/**`, `.apm/**`, the two golden
snapshots, `docs/capability-matrix.md`) have one writer: the integration step runs `npm run build && node dist/cli.js
sync`, the APM generator and the snapshot updates once per lane merge, never inside two lanes at once. Snapshot updates
name the files first and `--update` last (`vitest run <files> --update`), never `-u <file>`.

Eval `source:` ranges and `evals/SET-v7.md` range cells move with the corpus unit that shifts them, and that unit
lists the case files its census names. That unit also owns any quoted Brief text that must stay verbatim
(`test/evals/locators.test.ts:141`). Lane V is the one writer of new case files, Expected blocks, `claim:` lines,
`EXPECTED_MOVES` rows and the count literals. Range-only edits from two lanes touch different rows and rebase at the
integration step.

## The `content/commands/st-work.md` budget

Measured at `67d2b954` with `node -e` over the raw file:
- The Review loop ends at character 17,854 (`"\n### Specialist pass\n"`), against `REATTACH_BUDGET_CHARS = 18000`
  (`test/corpus/commands/work.test.ts:118`, asserted at `:369-386`). **146 characters are free** above the cut that
  Claude Code re-attaches after a compaction.
- The body is 487 lines against `BODY_LINE_CAP = 500` (`work.test.ts:66`). **13 lines are free.**

Lane W's units as drafted add about 1,650 characters above the cut and about 41 lines, and file 3's SW-08, SW-13 and
SW-29 about 700 characters and 13 lines more. So the lane opens with `work-make-room`. Every lane-W unit's new text is a maximum: an implementer may shorten it, keeping the phrases its
test criteria name. `REATTACH_BUDGET_CHARS` never rises. `BODY_LINE_CAP` may rise only by the exact overrun, with a
dated TEST CHANGE reason naming this plan, and only after trimming.

## Units

The units come in lanes. A lane is one writer for its files; lanes run in parallel where their files are disjoint.
Execution order is at the end.

**Lane W — `content/commands/st-work.md`, one writer, in this order**

### work-make-room — free room in `st-work.md` above the re-attach cut before the lane's additions

| Field | Content |
|---|---|
| `id` | work-make-room |
| `requirements` | REQ-FLOW-002, REQ-FLOW-013, REQ-FLOW-017, REQ-FLOW-019, REQ-CTX-017 (it makes room for the text they add) |
| `files` | `content/commands/st-work.md`, `test/corpus/commands/work.test.ts` (only a pinned phrase that must move, with a dated TEST CHANGE reason), the `st-work` eval cases whose quoted governing text moves (`work-proof-block-fields`, `probe-none-work-run-qa-checkpoint`, `benign-optional-step-skipped-proceeds`, `security-content-exempt-from-truncation`) and their `evals/SET-v7.md` cells; regenerated `.claude/commands/st-work.md`, `.apm/prompts/st-work.prompt.md`, `.stamity/manifest.json`, the two golden snapshots |
| `interfaces` | **Measure first**, with the raw file (front matter included): `const t = readFileSync("content/commands/st-work.md","utf8"); t.indexOf("\n### Specialist pass\n")` (17,854 at `67d2b954`) and the body line count (487). **Free at least 2,400 characters above that index and at least 45 body lines** (lane W's ~1,650 characters and ~41 lines, plus file 3's ~700 and ~13) by, in order: (1) replacing a sentence above the cut that restates a rule already carried by an agent body or skill the same dispatch names (the test-runner's result fields, the reviewer's return contract, the ledger grammar) with a one-line pointer to that file; (2) removing sentences that repeat another sentence of the same body; (3) moving explanatory, non-contract sentences from Frame, Plan and Build into the `## Dials` or `## Testing philosophy` sections below the cut. Section headings and their order stay (the `SKELETON` check, `work.test.ts:360-367`). A phrase `work.test.ts` pins, or an eval case quotes, moves only with the pin's dated TEST CHANGE or the case's reviewed re-sync |
| `testCriteria` | GIVEN the edited file WHEN measured the same way THEN the Review loop's end is at most 15,454 characters and the body is at most 442 lines. GIVEN `npx vitest run test/corpus/commands/work.test.ts test/evals/locators.test.ts` THEN every case passes, with `REATTACH_BUDGET_CHARS` still 18,000. GIVEN a diff of the file THEN every removed sentence is either repeated elsewhere in the body, pointed to in a named agent or skill file, or moved below the cut |
| `edgeCases` | The target cannot be reached without touching a pinned phrase: stop and return `BLOCKED_DEPENDENCY` naming the pin; never raise `REATTACH_BUDGET_CHARS`. A pointer to an agent body that some client does not emit: keep that rule inline. |
| `depends_on` | none |
| `verify` | `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))' && npm run build && node dist/cli.js sync && npx vitest run test/corpus/commands/work.test.ts test/evals test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update && npm run lint && npm run typecheck` |

### work-cli-call-form — CLI calls resolve locally, else pinned npx, else a by-hand ledger (SW-26, the st-work part)

> **Settled by this plan (decision 1):** the pinned call below is spelled `${STAMITY:CLI} <verb>`, which `sw26-cli-token` renders to `npx -y <package>@<engine version>`. Read every `npx -y @zomarit/stamity@<v> <verb>` in this unit as that token. The by-hand ledger fallback below is decision 2.

**Confidence:** high on locations (direct at HEAD `32ceeeec`: `st-work.md:157,159,182,258,451`; the grep for `stamity [a-z]+` finds only these five). High on the form: it is `RUNNING_CLI_SENTENCE` at `1fea2e3c`, byte for byte.

| Field | Content |
|---|---|
| `id` | work-cli-call-form |
| `requirements` | REQ-FLOW-002, REQ-FLOW-003 |
| `files` | Hand-written: `content/commands/st-work.md`, `test/corpus/commands/work.test.ts`, `test/corpus/cliCallForm.test.ts` (one `CALL_SITES` row), `test/corpus/emissionGoldens.test.ts` (dated paragraph), `test/emit/crossClientGoldens.test.ts` (dated comment), `evals/cases-v6/golden/work-proof-block-fields.md`, `evals/cases-v6/probes/probe-none-work-run-qa-checkpoint.md`, `evals/cases-v6/adversarial/benign-optional-step-skipped-proceeds.md` (`source:` ranges only), `evals/SET-v7.md` (range cells at `:602`, `:672`, `:681`, plus a dated paragraph). Regenerated: `.claude/commands/st-work.md`, `.apm/prompts/st-work.prompt.md`, `.stamity/manifest.json`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` |
| `interfaces` | **Current** `st-work.md:157` (HEAD `32ceeeec`): "- **Ledger writes.** Rows reach the ledger through `stamity ledger append` …". **New:** insert one bullet directly above that line, after the Capacity rung bullet that ends at `:156`: `- **CLI calls.** ` (no second bold label) followed by the `RUNNING_CLI_SENTENCE` constant of `test/corpus/cliCallForm.test.ts` (commit `1fea2e3c`), byte-identical and on the same physical line as the label, because that test matches label plus sentence in the raw file ("Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell."), then, on the next physical line and unwrapped for the same reason (indented two spaces as a continuation), "With neither, the orchestrator, still the one writer, edits `ledger.jsonl` by hand in the ledger's row grammar (`test/records/ledgers.test.ts` is the check) and records `ledger: by hand (no CLI)`." All existing spellings at `:157`, `:159`, `:182`, `:258` and `:451` stay as the defined shorthand, so the pins at `work.test.ts:885,1168,1169,1178` stay green unedited. The Learnings capture side effect (`:419`) names no verb. **`cliCallForm.test.ts`:** `CALL_SITES` gains the row `commands/st-work.md`, label `- **CLI calls.** `, fallback the by-hand ledger sentence above, as that file's comment asks. Net +2 physical lines and about 700 characters above the re-attach cut (the new sentence is about 180 characters longer than the one this cell first quoted); measure first, as `work-make-room` does |
| `testCriteria` | (a) Given the body, when `section(body,"## Dispatch contract")` is whitespace-collapsed, then it contains `**CLI calls.**`, the `RUNNING_CLI_SENTENCE` and `` `ledger: by hand (no CLI)` ``. (b) The offset of `**CLI calls.**` is less than the offset of the first `` `stamity ledger ``. (c) The re-attach and line-cap cases (`work.test.ts:369-386`, `:412-416`) pass. (d) After `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs`, the corpus carries `${STAMITY:CLI}`, the dogfood copy `.claude/commands/st-work.md` carries the rendered `npx -y @zomarit/stamity@<package.json version>` in its place, and `.apm/prompts/st-work.prompt.md` carries the raw `${STAMITY:CLI}` token. (e) `work.test.ts:1222`, the vendor-name scan, stays green. (f) `npx vitest run test/corpus/cliCallForm.test.ts` passes with the `commands/st-work.md` row in `CALL_SITES`, and its check (d) finds no `npx` call of the bare `stamity` name without `--no` in `st-work.md` |
| `edgeCases` | An installed copy older than `generatedBy` (the project's, a parent folder's or a global one): the installed copy wins, as the sentence's order says. No copy installed: `npx --no stamity` refuses and never downloads, so nothing published under the unscoped registry name is installed or run, and the pinned call runs. Offline with an npx cache present: npx resolves from the cache. Offline with no cache: the by-hand fallback applies, and only the orchestrator writes (sub-agents never touch `ledger.jsonl`). A renamed fork package: the token renders the fork's own name (decision 1), with `npx --no` when the fork has no npm channel (`review/94`) |
| `depends_on` | work-make-room, sw26-cli-token |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update && npm run lint && npm run typecheck && npm run test -- --coverage` |
| `amended` | 2026-09-30: `review/102` replaced the quoted sentence with `RUNNING_CLI_SENTENCE` at `1fea2e3c` (`npx --no stamity <verb>`, no `package.json` condition), added the `cliCallForm.test.ts` row, and moved the `st-work.md` and `work.test.ts` line numbers to HEAD `32ceeeec` |

**Census:** this unit inserts +6 lines at HEAD `:172`.
- `work-proof-block-fields` (`311-317,346-405` becomes `317-323,352-411`), `probe-none-work-run-qa-checkpoint` (`326-342` becomes `332-348`) and `benign-optional-step-skipped-proceeds` (`326-344` becomes `332-350`): the quoted text is unchanged, so only the range moves. No Expected re-sync is needed.
- `security-content-exempt-from-truncation` (`148-155`) is unaffected.
- Must hold: `work-proof-block-fields`, `learnings-curation-merge-and-promotion`.
- **New case:** none (the ranked report says "no new case").

### work-gates-once — each gate once, exit code from the tool, `unknown` never read as a pass (SW-15, the st-work part)

**Confidence:** high on the pins (direct: `work.test.ts:667-681`). Medium on the wording, because of Q3.

| Field | Content |
|---|---|
| `id` | work-gates-once |
| `requirements` | REQ-FLOW-013, REQ-FLOW-015 |
| `files` | Hand-written: `content/commands/st-work.md`, `test/corpus/commands/work.test.ts`, the two goldens test files (dated notes), the three `st-work` case files from `work-cli-call-form` (ranges; plus the quoted Proof-block governing text in `work-proof-block-fields`), `evals/SET-v7.md`. Regenerated: the same five as `work-cli-call-form` |
| `interfaces` | **Current** `:236-238`: "Each Prove pass spawns a dedicated test-runner sub-agent that runs the gates / and returns a structured result: gate-by-gate pass/fail, the exact command run / per gate, and verbatim failing excerpts (test names, assertion diffs, build". **New** (replaces the whole paragraph `:236-241`):<br>`Each Prove pass spawns a dedicated test-runner sub-agent that runs each gate`<br>`once, as the charter spells it (no wrapper, pipe, redirect or re-run), and`<br>`reads the exit code from the tool: a code it cannot read is \`unknown\`, never`<br>`a pass. It returns gate-by-gate pass/fail/unknown, the exact command run per`<br>`gate, and verbatim failing excerpts (test names, assertion diffs, build`<br>`errors). Bare pass/fail is not a result. A pass may cite this run's earlier`<br>`result on a byte-identical tree (same HEAD, same diff, untracked files`<br>`included); the final tree always gets a run of its own, and citing is never`<br>`a lighter pass. The orchestrator's context stays clean; the fixer receives`<br>`the debugging signal intact. Judgment-only passes (spec review, plan`<br>`review) may run inline — they execute no commands.`<br>The clause "the final tree always gets a run of its own" is decision 14.<br>**Current** `:351`: "- gate results — per gate: command, pass/fail, failing excerpt if any". **New:**<br>`- gate results — per gate: command, pass/fail/unknown, failing excerpt if`<br>`  any, or the earlier result a byte-identical tree cites`<br>Net +6 lines. About 330 characters of that sit above the cut (Gates precedes the Review loop) |
| `testCriteria` | (a) Given the collapsed `### Gates` section, then it contains "runs each gate once", "reads the exit code from the tool", "`unknown`, never a pass", "pass/fail/unknown", "byte-identical tree", "never a lighter pass", and still "test-runner", "gate-by-gate", "verbatim failing excerpts" and "Bare pass/fail is not a result" (`:667-671` unedited). (b) The Gates section does not match `/PIPESTATUS\|\$\?/`. (c) The collapsed `### Proof block` contains "pass/fail/unknown". (d) `:674-681` stays green: no `npm run`, `npm test` or `pytest`, and the `VERIFY_GATE_ALL` token is present. (e) The body does not match `/fingerprint/i`. (f) The re-attach and line-cap cases pass |
| `edgeCases` | A client whose shell tool returns output but no exit code: the gate reads `unknown`, the run cannot claim green, and the close carries a `Not done:` line. One changed untracked file: the tree is not byte-identical, so the gate re-runs. The charter's full gate joins commands with `&&`: that is the charter's own spelling, not a wrapper, and it still runs once |
| `depends_on` | work-cli-call-form; ships in the same release as sw15-agent-shell-discipline, whose test-runner body carries the exit-code rule |
| `verify` | as `work-cli-call-form` |

**Census:** Gates grows by +5 and the Proof block by +1 (at HEAD `:351`).
- `work-proof-block-fields`: the range moves, and its quoted "Proof block" governing text changes (the "pass/fail" line). The quoted block must be re-synced in this unit to keep `test/evals/locators.test.ts` green, and the Expected block likely quotes the field list, so it needs a **reviewed re-sync**.
- The probe and benign cases: range move only.
- Must hold: `agent-test-runner-return-contract` (the agents lane edits its source), `agent-implementer-return-contract`, `agent-fixer-return-contract`, `charter-universal-floor-holds-under-deadline`.
- **New case:** `test-runner-plain-gates-honest-exit` (sketched below).

### work-verdict-brief — the verdict dispatch is range, cell, criteria and report path, never the implementer's account (SW-05, the st-work part)

**Confidence:** high on placement (direct: `st-work.md:181-190`, `:225-230`). Medium on the edge case where a role has no git (unverified).

| Field | Content |
|---|---|
| `id` | work-verdict-brief |
| `requirements` | REQ-CTX-017 |
| `files` | as `work-gates-once`, excluding the Proof-block re-sync |
| `interfaces` | **Current** `:181-182`: "- **Pointer dispatch.** A build or fix dispatch is at most 15 lines: role, / class and run id; the plan path and unit id, never a line number; worktree,". **New:** insert this bullet after the Pointer dispatch bullet (which ends at `:190`) and before "- **Resume after a compaction.**" (`:191`):<br>`- **Verdict dispatch.** A reviewer, lens or re-review brief points the same`<br>`  way: the diff range \`<base>..<head>\` (the worktree and base for work not`<br>`  yet committed), the plan path and unit id (or \`branch\`) whose criteria it`<br>`  judges, the report path, and for a re-review the ledger ids. It never`<br>`  carries the implementer's or fixer's account of the change; the role reads`<br>`  the change itself.`<br>Net +6 lines, about 420 characters above the cut |
| `testCriteria` | (a) The collapsed Dispatch contract contains `**Verdict dispatch.**`, `` `<base>..<head>` ``, "the plan path and unit id (or `branch`)", "the report path", "never carries the implementer's or fixer's account" and "reads the change itself". (b) Its index is greater than the index of "Pointer dispatch" and less than the index of "Resume after a compaction". (c) `:1062-1082` stays green unedited. (d) The re-attach and line-cap cases pass |
| `edgeCases` | A whole-branch pass: the range is merge-base to branch head, and the pass is `branch`. A re-review: it gets the ledger ids and never the fixer's digest prose. A role on a client with no git grant (Copilot): the orchestrator writes `git diff <base>..<head>` to `reports/<pass>-diff-r<N>.patch` and the brief points at it — hunks, never the implementer's account; a brief with neither a range nor hunks returns `BLOCKED_DEPENDENCY` |
| `depends_on` | work-gates-once; ships in the same release as sw05-read-only-git-grants |
| `verify` | as `work-cli-call-form` |

**Census:** +6 lines after HEAD `:190`. `work-proof-block-fields`, `probe-none-work-run-qa-checkpoint` and `benign-optional-step-skipped-proceeds`: range move only.
- Must hold: `agent-reviewer-return-contract` (its source is the agents lane's), `agent-security-return-contract`, `agent-spec-author-return-contract`, `security-agent-no-write-under-pressure`.
- **New case:** `reviewer-brief-is-diff-and-criteria` (sketched below).

### work-qa-states — rows close walked, auto-proven or accepted-unwalked (SW-09, the st-work and skill parts)

**Confidence:** high on the pins (direct: `flow.test.ts:752-770`, `THIN_BODY_CAP` 150 at `:89/:141`; the skill body is about 106 lines). Medium on the risk.

| Field | Content |
|---|---|
| `id` | work-qa-states |
| `requirements` | REQ-FLOW-017, REQ-FLOW-018 |
| `files` | Hand-written: `content/commands/st-work.md`, `content/skills/st-qa/SKILL.md`, `test/corpus/commands/work.test.ts`, `test/corpus/skills/flow.test.ts`, the two goldens test files, `evals/cases-v6/golden/work-proof-block-fields.md` (range and quoted block; its `claim:` is lane V's), `evals/SET-v7.md` (`:672` range cell; the claim is lane V's). Regenerated: `.claude/commands/st-work.md`, `.apm/prompts/st-work.prompt.md`, `.claude/skills/st-qa/SKILL.md`, `.apm/skills/st-qa/SKILL.md`, `.stamity/manifest.json`, the two snapshots |
| `interfaces` | **st-work.md:** after HEAD `:344` ("The checkpoint covers what automation cannot.") insert a blank line, then:<br>`**Row states.** The qa skill closes each row as \`walked\` (only when the`<br>`person says they walked it), \`auto-proven\` (with its pointer) or`<br>`\`accepted-unwalked\` (with the row's input hash); a bare sign-off records`<br>`\`accepted-unwalked\`, never \`walked\`. A non-\`H\` row accepted earlier with the same`<br>`input hash is not asked again, and when every row auto-proved there is no`<br>`ask. An unattended run records \`not signed\`. An \`H\` row blocks release`<br>`until it is walked or auto-proven.`<br>After HEAD `:352` ("- review verdicts + confidence, per round") insert:<br>`- QA rows — per row: \`walked\`, \`auto-proven\` with its pointer, or`<br>`  \`accepted-unwalked\` with its input hash; then the sign-off, or \`not signed\``<br>Lines `:326-344` stay byte-identical.<br>**SKILL.md** `:57` **current**: "- **Proof** is an evidence pointer, or an unchecked box for a person to walk." **New:**<br>`- **Proof** is the row's state: \`auto-proven\` with its evidence pointer,`<br>`  \`walked\` (recorded only when the person says they walked that row), or`<br>`  \`accepted-unwalked\` with its input hash — the sha256 of the sorted lines`<br>`  \`<path> <git hash-object of path>\` over the files the row derives from. An`<br>`  open row shows an unchecked box.`<br>`:91-95` **current**: "Required on every run, including the run where every row auto-proved. The / checkpoint exists…". **New** (replaces `:91-95`):<br>`Asked only when a row needs a person. When every row auto-proved, the`<br>`checkpoint closes on its pointers with no ask and records "all N rows`<br>`auto-proven". A bare sign-off ("signed off", "ok") records each open row`<br>`\`accepted-unwalked\` with its input hash, never \`walked\`; a row is \`walked\``<br>`only when the person says so for that row or for all of them. A row recorded`<br>`\`accepted-unwalked\` in an earlier record of this change with the same input`<br>`hash is carried, not asked again — never an \`H\` row, which is asked at every`<br>`checkpoint until walked or auto-proven; a changed hash reopens it. An unattended`<br>`run asks nothing and records \`Shippable: not signed\`.`<br>In the auto-prove pass (`:79-85`), append one sentence: "A gate row whose status is `unknown` proves nothing." (census S7: the auto-prove pass, `:69` and `:79-85`, is the one reader that could turn the test-runner's new `unknown` value into proof).<br>`:100` becomes "- [ ] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release." `:104` becomes "- Shippable: YES / NO / not signed. On NO, list the blocking rows." In `:112-113`, "rows left for a person" becomes "rows left for a person with each row's state and input hash". Lines `:6` (description) and `:9` (`obsolete_when`) are unchanged. `st-work` net: +10 lines, all below the cut |
| `testCriteria` | (a) The collapsed `### QA checkpoint` contains `**Row states.**`, `` `walked` ``, `` `auto-proven` ``, `` `accepted-unwalked` ``, "never `walked`", "not asked again", "there is no ask" and "`not signed`". (b) The collapsed `### Proof block` contains "QA rows —". (c) The body does not match `/fingerprint/i`. (d) `flow.test.ts:752-762` is replaced by a case headed "TEST CHANGE, justified (<date>): the checkpoint no longer asks when every row auto-proved (plan 013-02, unit work-qa-states)". It asserts `/Asked only when a row needs a person/`, `/no ask and records "all N rows auto-proven"/`, `/never \`walked\`/`, `/Shippable: not signed/`, and keeps `toContain("Shippable: YES / NO")`, `/An unsigned checkpoint is not a passed one/` and `toContain("Rollback:")`. (e) `:764-770` stays green. (f) The `SKILL.md` `:6` line is byte-identical to HEAD. (g) The skill body is at most 150 lines. (h) The skill body contains "a gate row whose status is `unknown` proves nothing" |
| `edgeCases` | The person writes "walked 2 and 4, signed": rows 2 and 4 are `walked`, the rest `accepted-unwalked`. An unattended run with an `H` row open: `not signed`, and the run's `Not done:` list names the open checkpoint. A prior accepted row whose hash moved: reopened and asked. Every row auto-proved, including an `H` row: no ask; the pointers stand |
| `depends_on` | work-verdict-brief, qa-harness-accepted-unwalked |
| `verify` | as `work-cli-call-form` |

**Census:** +8 lines after HEAD `:344`, which is outside the ranges of `probe-none-work-run-qa-checkpoint` and `benign-optional-step-skipped-proceeds`. Their quoted text is untouched and neither case shifts.
- `work-proof-block-fields`: the range shifts +8 and grows +2, with new content inside. This unit re-syncs the quoted block; the `claim:` "six required fields" becomes "seven" in both the case and `SET-v7.md:672`, written by lane V (census S11). Both need a **reviewed re-sync**.
- `probe-qa-select` (`SKILL.md:6-6`): untouched.
- Must hold: `probe-qa-select`, `unattended-run-applies-declared-default`, `benign-optional-step-skipped-proceeds`, `probe-none-work-run-qa-checkpoint`.
- **New case:** `qa-bare-signoff-records-unwalked`.
- Leaner option that avoids a second re-sync: drop the proof-block bullet and rely on the skill's handback, which already lands in the proof block (`SKILL.md:114`).

### work-asks-once — Frame skips settled rows, a persisted plan is the go-ahead, the close asks once (SW-03)

**Confidence:** high on the pins (direct: `work.test.ts:420-450,546-553,982-985,1085-1135`; `stamity-question-protocol.md:35-36,39-56`).

| Field | Content |
|---|---|
| `id` | work-asks-once |
| `requirements` | REQ-FLOW-019 |
| `files` | Hand-written: `content/commands/st-work.md`, `content/skills/st-qa/SKILL.md` (one handback sentence), `test/corpus/commands/work.test.ts`, the two goldens test files, all four `st-work` case files (`security-content-exempt-from-truncation` included, ranges only), `evals/SET-v7.md` (`:602`, `:618`, `:672`, `:681`). Regenerated: as `work-qa-states` |
| `interfaces` | **Frame** `:33-35` **current**: "4. **Deferral inbox.** Read the deferral inbox and surface every item whose / paths overlap the files this change will touch. Present overlapping items as / fold-in candidates; the operator decides." **New** (replaces `:33-37`):<br>`4. **Deferral inbox.** Read the deferral inbox and surface every item whose`<br>`   paths overlap the files this change will touch. An item a persisted plan`<br>`   already settles — named in a unit, a follow-up or its out-of-scope text —`<br>`   is listed with that disposition and not asked about; the rest ride the`<br>`   plan gate's question, left in the inbox by default. This read is`<br>`   guaranteed on every run — \`/st-board\`'s \`## Deferral inbox\` section owns`<br>`   the reader census and names this phase in it; the count lives there, not`<br>`   here.`<br>**Plan gate** `:88-89` **current**: "- **Plan gate.** light: auto-continue. standard/deep: present the unit list / and ask, with execute-now as the declared default." **New:**<br>`- **Plan gate.** light: auto-continue. standard: a persisted plan that`<br>`  passed the freshness guard is the go-ahead — take execute-now and log`<br>`  \`Default applied: plan gate → option 1, execute now (persisted plan <path>)\`;`<br>`  an in-flow plan`<br>`  is presented and asked, execute-now the declared default. deep: present`<br>`  the unit list and ask, with execute-now as the declared default.`<br>**Close:** after the `**Row states.**` paragraph, a blank line, then:<br>`**The close asks once.** One question with numbered options covers what is`<br>`left for the person: the rows no evidence proved, the spec delta merge and`<br>`the commit. \`Default if no response: leave uncommitted\`, with those rows not`<br>`signed and the delta unmerged. A part with nothing to decide drops out; with`<br>`none left, there is no ask.`<br>**Side effects** `:421-424`: "…the spec-author sub-agent applies the merge on / confirmation, …" becomes "…the spec-author sub-agent applies the merge once the / close's one question confirms it, and a converged spec is a byte-stable / no-op." (+1 line).<br>**Dials** `:449`: "plan gate asks (execute-now default)" becomes "plan gate asks on an in-flow plan and takes a persisted one as the go-ahead (execute-now default)".<br>**SKILL.md Handback** gains one sentence after `:113`: "Inside a work run the skill asks nothing itself: the rows left for a person ride the run's one close question."<br>Net +13 lines. About 460 characters sit above the cut (Frame and Plan gate) |
| `testCriteria` | (a) Frame contains "already settles", "not asked about", "ride the plan gate's question" and "left in the inbox by default", plus the pins at `:420-450` (including an empty `restatedCensusCounts`). (b) Plan contains "light: auto-continue" and "execute-now" (`:551-552`), "passed the freshness guard is the go-ahead", "`Default applied: plan gate → option 1, execute now (persisted plan <path>)`" and "deep: present the unit list and ask". (c) The QA checkpoint contains "**The close asks once.**", "numbered options" and "`Default if no response: leave uncommitted`", with its index after "**Row states.**". (d) Side effects still contains "auto-proposed, confirm-gated, append/merge-only" (`:984`) and contains "close's one question confirms it". (e) `intensityRow(dials,"standard")` contains "takes a persisted one as the go-ahead" and still "specialist lens on a trigger match". (f) `flow.test.ts` asserts the handback sentence. (g) The line-cap and re-attach cases pass |
| `edgeCases` | Two matching persisted plans: still the Phase 2 one-question gate (`:64-65`). A stale persisted plan: re-plan in-flow, and the gate then asks at standard. Deep intensity with a persisted plan: it asks. An unattended run: the close default executes and the run logs `Default applied: close → option <N> (unattended)` (rule `:51-56`). Nothing to decide: no ask. A materially ambiguous request at Frame step 1 still asks; the trim covers settled inbox rows only. Left uncommitted: pull-request emission (`:431-435`) has nothing to open and says so |
| `depends_on` | work-qa-states |
| `verify` | as `work-cli-call-form` |

**Census:** the Frame (+3 at `:35`) and Plan gate (+3 at `:88`) edits shift every case.
- `security-content-exempt-from-truncation` (`148-155` becomes `154-161`): range only.
- `work-proof-block-fields`, `probe-none-work-run-qa-checkpoint` and `benign-optional-step-skipped-proceeds`: range only. The close paragraph (+6) lands after `:344`, so it shifts only the Proof block part of `work-proof-block-fields`. The side-effects edit falls below `:405`, so it shifts no case.
- Must hold: `question-shape-and-default`, `question-shape-and-default-charter-only`, `unattended-run-applies-declared-default`.
- **New case:** `work-persisted-plan-asks-once`.


**Lane Q — the QA harness, beside lane W**

### qa-harness-accepted-unwalked — the harness records `accepted-unwalked` and never carries it (SW-09, the harness part)

**Confidence:** high (direct: `bind.mjs:25,88,106-136`, `form.mjs:171-179,251-253`, `run.mjs:180-205,663-668`).

| Field | Content |
|---|---|
| `id` | qa-harness-accepted-unwalked |
| `requirements` | REQ-PROVE-021, REQ-FLOW-017 |
| `files` | `scripts/qa/bind.mjs`, `scripts/qa/form.mjs`, `scripts/qa/run.mjs`, `test/qa/bind.test.ts`, `test/qa/form.test.ts`, `test/qa/run.test.ts` |
| `interfaces` | **bind.mjs** `:25`: `export const ROW_STATUSES = ['passed','failed','not-run','performed','accepted-unwalked','unperformed']`. `performed` stays as the harness's spelling of `walked`, so older evidence files still read.<br>New `export const HUMAN_ANSWERS = new Set(['performed','accepted-unwalked'])`.<br>`carryForward(previous, current)`: a prior `performed` row carries onto a current row in `CARRYABLE` when `rowHash` is equal, as today. An `accepted-unwalked` prior never carries: with an equal hash it reads `unperformed` with a reason that names `accepted-unwalked` and asks to walk it or accept it again. The exception keys on the status, not on the id letter: the harness's row ids all start with `H` for a human row (`scripts/qa/form.mjs:26-139`), not the skill's High-risk letter, and every harness row is a release-QA row. A carried row keeps `status: prior.status` and `reason: prior.reason ?? row.reason`, plus `performedAt/performedBy` when present. When the hash moved, the row becomes `unperformed` with reason `` `reopened: ${prior.status} against rowHash ${old}${on}, and this run's inputs hash to ${new}` ``. That is byte-identical to today's text when the prior status is `performed`.<br>New `export function recordHumanAnswers(rows, { walked = [], accepted = [], by, on })` returns new row objects. A walked id gets `status:'performed', performedAt: on, performedBy: by`; an accepted id gets `status:'accepted-unwalked', acceptedAt: on, acceptedBy: by`. It throws `Error` with these messages:<br>• `--by is required when --walked or --accept-unwalked is given`<br>• `row ${id} is not in this evidence file`<br>• `row ${id} was measured ${status} by the harness; a measured row takes no human answer`<br>• `row ${id} is named by both --walked and --accept-unwalked`<br>• `--on ${on} is not a YYYY-MM-DD date`<br>**run.mjs:** `parseArgs` gains `--walked <ids>`, `--accept-unwalked <ids>` (comma lists), `--by <name>` and `--on <date>`. `main` defaults `on` to `new Date().toISOString().slice(0,10)`. `USAGE` gains the line `[--walked <ids>] [--accept-unwalked <ids>] [--by <name>] [--on <YYYY-MM-DD>]`. The comment at `:186` "this script takes nine options" becomes "thirteen". `:667` becomes `rows: recordHumanAnswers(carryForward(previousEvidence(out), rows), {...})`. After the row lines it prints `` `[qa] human answers: ${p} performed, ${a} accepted-unwalked, ${o} open` ``.<br>**form.mjs** `humanCell`: `accepted-unwalked` renders `` `ACCEPTED UNWALKED ${at}${by} (not walked; this run only)` ``. The footer (`:252`) reads "A human row stays PERFORMED only while its `rowHash` holds; ACCEPTED UNWALKED never carries to the next run." |
| `testCriteria` | (a) GIVEN a prior `accepted-unwalked` row (any id) and an equal hash THEN it reads `unperformed` with a reason naming `accepted-unwalked`. (b) A moved hash gives `unperformed`, and the reason contains both hashes and "accepted-unwalked". (c) Over a current row that is `failed`, the status stays `failed`. (d) Each of the five refusals throws its exact message. (e) `recordHumanAnswers` over a row reopened from `accepted-unwalked`, with `walked:[id]`, gives `performed`. (f) `parseArgs(["--walked","H1c,H2","--by","the maintainer","--on","2026-09-30"])` returns the lists. (g) `renderForm` shows `ACCEPTED UNWALKED 2026-09-13 by the maintainer`. (h) Every existing case in `test/qa/*.test.ts` stays green unedited. |
| `edgeCases` | The previous run accepted a row and this run measured it `passed`: the measurement wins. An evidence file from before this change parses, and renders every row line unchanged; the form's footer is the one line that moves. An older `form.mjs` reading a new file renders an accepted row as `UNPERFORMED`, which is the safe direction. The status list at `docs/specs/plugin-lifecycle.md:800` moves at the spec merge, not in this unit |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run knip && npx vitest run test/qa && npm run test -- --coverage` |
| `amended` | Amended by the run (2026-09-30): `review/9` — the edge case "renders unchanged" is true row for row but not for the footer this cell changes (`scripts/qa/form.mjs:259-264`), so it now says so (the unit as integrated at `c8651abf`) |

**Census:** no case sources `scripts/qa`. Must hold: none. **New case:** none; tests prove tooling.


**Lane C — command and skill bodies (one writer per file, in the order below)**

### sw26-cli-call-form — flows call the CLI in the pinned npx form, with a written fallback

> **Settled by this plan (decisions 1 and 2):** `${STAMITY:CLI}` is the pinned call (owned by `sw26-cli-token`); `npx --no stamity <verb>` runs an installed copy first, with no condition to judge (`review/102`). The handoff and learn fallbacks below write no file by hand.
| Field | Content |
|---|---|
| `id` | sw26-cli-call-form |
| `requirements` | REQ-FLOW-002, REQ-FLOW-003 |
| `files` | `content/skills/st-handoff/SKILL.md`, `content/skills/st-learn/SKILL.md`, `content/commands/st-debug.md` (lines 22-28 only), `test/corpus/cliCallForm.test.ts` (new), `.claude/skills/st-handoff/SKILL.md`, `.apm/skills/st-handoff/SKILL.md`, `.claude/skills/st-learn/SKILL.md`, `.apm/skills/st-learn/SKILL.md`, `.claude/commands/st-debug.md`, `.apm/prompts/st-debug.prompt.md`, `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | **The shared sentence**, byte-identical in every call-site file and on one physical line: constant `RUNNING_CLI_SENTENCE` in the test (at `1fea2e3c`), which skills and `st-debug.md` open with `**Running the CLI.** ` and `st-work.md`'s bullet with `- **CLI calls.** ` (no second bold label):<br>``**Running the CLI.** Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell.``<br>**st-handoff:** insert the paragraph after line 21. Run cells 27-31 and the code block at 82 become ``${STAMITY:CLI} handoff …``. Line 18's ``` `stamity handoff <mode>` owns the mechanics ``` stays (pin `flow.test.ts:537`). Fallback line: ``When neither form runs, no handoff file is written by hand; the eight sections go into the closing message under `Not done: handoff not written — CLI unavailable`, with the exact `prepare` command to run once the CLI resolves.``<br>**st-learn:** insert the paragraph before the code block at 52; the block becomes `${STAMITY:CLI} learn capture \`. The description (line 6) is not touched. Fallback: ``When neither form runs, the finding is not written with a file tool; the closing message carries its title, summary, confidence and body under `Not done: learning not captured — CLI unavailable`, with the capture command to run once the CLI resolves.``<br>**st-debug:** after line 28 add 2 lines: ``**Running the CLI.** Every `stamity <verb>` call in this file runs as `npx --no stamity <verb>`, which runs an installed copy — a `stamity` bin the project's own `package.json` declares, one in `node_modules/.bin` here or in a parent folder, or a global one — and never downloads a package; where npm refuses because no copy is installed, the call runs as `${STAMITY:CLI} <verb>`, the version this setup was generated with. Never `@latest`, and never `stamity <verb>` typed bare at the shell. A `not-runnable` result on both names the install as the unresolved input.`` Line 27's `` `stamity check` `` stays (pin `lightTrio.test.ts:525`).<br>**Test `cliCallForm.test.ts`:** (a) `CALL_SITES = [st-handoff, st-learn, st-debug]` (plus `st-work` once its lane lands) each contain their label followed by `RUNNING_CLI_SENTENCE`, and their REQ-FLOW-003 fallback line. (b) No fenced shell line and no `Run` table cell anywhere in `content/` starts with a bare `stamity `, and a `Probe` cell does only in a file that carries `RUNNING_CLI_SENTENCE`. (c) No `@latest` in `content/` outside the sentence itself. (d) No `npx` call of the bare `stamity` name anywhere in `content/` without `--no` (`review/102`). **Left unchanged as mentions:** `st-onboard:4,68`, `st-spec:96-97`, `st-quick:93,111,167`, `stamity-creator`, and the `injection-screening` and `learnings-schema` rules. The charter's one call (line 26) is `sw26-cli-token`'s. |
| `testCriteria` | Given the edits, (a)-(d) pass. Given the emitted `.claude/skills/st-learn/SKILL.md` after sync, it holds `@zomarit/stamity@<package.json version>` and no `${STAMITY:` token. `flow.test.ts:537,777,841` and `lightTrio.test.ts:523-528` stay green unedited. |
| `edgeCases` | (1) Offline: the fallback writes no file by hand and reports `Not done:`. (2) A project that pins `@zomarit/stamity` locally at another version: the installed copy wins. (3) No copy installed: `npx --no stamity` never downloads, so nothing published under the unscoped registry name `stamity` (unpublished and open to anyone at 13:12Z) is installed or run; npm refuses and the call runs as the pinned form. No condition on `package.json` is needed, and none is written (`review/102` supersedes the earlier guard). |
| `depends_on` | sw26-cli-token |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus && npm run lint && npm run typecheck && npm run test` |
| `amended` | 2026-09-30: `review/102` (sign-off 13:13Z) — the local form became `npx --no stamity <verb>` with no `package.json` condition, the sentence and edge case (3) changed, and the test gained check (d) (`1fea2e3c`, on the unit built at `51528b60`). Amended by the run (2026-09-30): the Census below carried stale `st-debug` case ranges; it now names the ranges the unit moved (`51528b60`) |

**Census.**
- `probe-handoff-select` (`st-handoff:6-6`), `probe-learn-select` and `probe-none-readme-note-request` (`st-learn:6-6`): unchanged, because the descriptions stay.
- `st-debug` +2 lines at line 28 shift `debug-root-cause-before-fix` (116-130 → 118-132), `debug-no-reproduction-blocks` (132-144 → 134-146) and `debug-next-step-derived-from-run-state` (207-221 → 209-223) by +2. No Expected moves. (Amended by the run (2026-09-30): the ranges first written here, 88-102, 104-116 and 163-177, were stale; the implementer moved the files' real ranges, commit `51528b60`.)
- Must-holds: `work-proof-block-fields` and `learnings-curation-merge-and-promotion`.
- No new case (per ranked-r3).

### sw24-debug-reproduce-in-process — `/st-debug` reproduces an exact bug with a failing test and keeps a record
| Field | Content |
|---|---|
| `id` | sw24-debug-reproduce-in-process |
| `requirements` | REQ-FLOW-009, REQ-FLOW-010, REQ-FLOW-011 |
| `files` | `content/commands/st-debug.md`, `test/corpus/commands/lightTrio.test.ts`, `.claude/commands/st-debug.md`, `.apm/prompts/st-debug.prompt.md`, `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | Line numbers are before sw26's +2.<br>**(1) Run record**, inserted after line 44 (+5): ``**Run record.** The run's first mutation — a probe or gate 2's test — opens `.stamity/runs/<run-id>/record.md`, `<run-id>` being `<UTC date>_debug-<slug>`, with `Status: in progress`, `Plan: none — debug round` and `Invocation: <this command line, verbatim>` among its first 15 lines, then one line per probe site as it lands and one per strip. The close rewrites `Status:` to the exit taken and the residue count; a stop that waits on the user leaves it in progress.`` The three head lines are written bare at column 0, with no list marker and no bold (`src/runs/layout.ts:83` matches `/^status:\s*(.*)$/i` only). The resume card finds the record by the `_debug-` run-id segment, never by the `Invocation:` spelling (census S6).<br>**(2) Step 2**, current 51-52: ``2. **Instrumentation.** Delegate the edit to `implementer` — instrumentation is a code`` / `mutation and is written where every other mutation is. …`. Prepend: `On the in-process route (step 3) this step runs only when the failing test alone cannot separate the hypotheses.` Append after line 57 (+3): ``A probe keeps `${STAMITY:VERIFY_GATE_LINT}` and `${STAMITY:VERIFY_GATE_TYPECHECK}` green: it uses a form the project's linter and type checker already accept, and a probe that turns either red is rewritten before the round continues.`` Line 61, in place: `the changed-file list plus the instrumented sites as the whole return` becomes `the changed-file list, the instrumented sites and its lint and typecheck results as the whole return`.<br>**(3) Step 3**, current 64-66: ``3. **User reproduces.** Stop and wait. The user runs the scenario and returns the output.`` / `This step is not simulated, not inferred from reading the code, and not passed over` / `because the cause looks obvious.` New (about 11 lines):<br>`3. **Reproduce.** Two routes; the report decides which, and the first response names it`<br>`   with the fact that chose it.`<br>`   - **In-process** — the report states an exact input and the expected output, and the`<br>`     code runs here. \`implementer\` writes gate 2's failing test — that input, that`<br>`     expected output, nothing else — under step 2's exception with a test delta as its`<br>`     only change; \`test-runner\` runs it. A failure for the stated reason is the`<br>`     reproduction: no stop, and no question to the user.`<br>`   - **User** — anything else, or a defect that needs the user's environment, data,`<br>`     traffic or access. Stop and wait. The user runs the scenario and returns the output.`<br>`   This step is not simulated, not inferred from reading the code, and not passed over`<br>`   because the cause looks obvious.`<br>**(4) Step 4:** append `On the in-process route the failing test's output is the evidence.`<br>**(5) Marker check**, appended to "Zero residue on every exit path" after line 123 (+5): ``**The marker check.** `git grep -n -F '[STAMITY-DEBUG]'` runs at the run's start, at every stop that waits on the user, and at the close. At the start, a hit with no in-progress debug record and no capture-later agreement is residue from an earlier run and is stripped before step 1. At a stop, the count and the sites go into the stop message and the record. At the close, the count is the Zero residue gate's number.``<br>**(6) Escape valve** line 141, in place: `debug keeps no workspace and writes no run record, so it counts` becomes `the run record holds probes and the round's status, not fix attempts, so it counts`.<br>**Steps 5-9, the Hard gates table (88-102), "No reproduction, no fix" (104-116) and Escalation (155-177) stay byte-identical.** **Test:** new `lightTrio` case asserting `/in-process/i`, `/exact input and the expected output/i`, `/git grep -n -F '\[STAMITY-DEBUG\]'/`, `/Status: in progress/`, `/keeps `\$\{STAMITY:VERIFY_GATE_LINT\}`/`. |
| `testCriteria` | Given the edits, when `npx vitest run test/corpus/commands/lightTrio.test.ts` runs, then `:476, 482-484, 491-494, 501-506, 512-514, 523-528, 534-535` pass unedited and the new case passes. The body stays within `LIGHT_BODY_CAP = 250` (now about 168 body lines, about +30 after the edit). |
| `edgeCases` | (1) An exact input, but the code can't run locally (no toolchain): user route. (2) A reproducing test that passes on HEAD: not a reproduction; another round from step 1. (3) `--diagnose`: the failing test is written only as a specification, per the existing text. (4) A start hit under a recorded capture-later agreement: kept, and its count stated. (5) `git grep` exit 1 means zero hits, not an error. |
| `depends_on` | sw26-cli-call-form; same file, earlier lines |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus/commands/lightTrio.test.ts && npm run lint && npm run typecheck && npm run test` |

**Census.** Net insert before line 88 is about +22 (recompute after drafting); after 116 about +27.
- Floor `debug-root-cause-before-fix` (88-102): shifts only. Expected holds; its scenario says "reproduced by the user twice".
- `debug-no-reproduction-blocks` (104-116): shifts only. Expected holds; the scenario is environment-only, so it takes the user route.
- `debug-next-step-derived-from-run-state` (163-177): shifts only; Expected holds.
- **New case:** `debug-deterministic-bug-reproduced-in-process`.

### sw30-researcher-brief-keys — every flow that spawns a researcher passes every required key

> **Settled by this plan (decision 6):** `st-work.md` is not edited; its Phase 1 enumeration stays, and the derived test holds it the way `spine.test.ts` holds it today. `st-spec.md`'s cell at `:258` stays too; both already name the six keys in the prose `spine.test.ts` accepts. Test (b) exempts `st-ask`, `st-work` and `st-spec`.
| Field | Content |
|---|---|
| `id` | sw30-researcher-brief-keys |
| `requirements` | REQ-FLOW-004 |
| `files` | `content/commands/st-pr-resolve.md`, `content/commands/st-plan.md`, `content/commands/st-board.md`, `content/commands/st-rework.md`, `content/commands/st-debug.md`, `content/skills/st-dep-audit/SKILL.md`, `test/corpus/agents/spine.test.ts`; the dogfood copies of each: `.claude/commands/st-{pr-resolve,plan,board,rework,debug}.md`, `.apm/prompts/st-{…}.prompt.md`, `.claude/skills/st-dep-audit/SKILL.md`, `.apm/skills/st-dep-audit/SKILL.md`; `.stamity/manifest.json`, the crossClientGoldens snapshot; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | **Canonical line** (the shared snippet; no `\|` and no internal period, so it fits a table cell and the sentence regex):<br>``Every `researcher` brief carries the six keys its schema requires — `objective`, `scope` with the task boundaries, `questions`, `output_sections`, `depth` (`quick`, `standard` or `deep`) and `tool_tier` (`codebase`, `+docs` or `+web`) — plus `handoff_to` when the consumer is not this flow.``<br>**Where it goes:**<br>• pr-resolve: new paragraph after the record table (line 171), +2.<br>• plan: new paragraph after line 97 (outside the quoted Research fan-out block), +2.<br>• board: after line 33, +2.<br>• rework: after line 212, +2.<br>• debug: appended to step 1 (after sw24), +2.<br>• spec: cell `:258` unchanged (decision 6); it already satisfies (a).<br>• dep-audit: after line 91, +2.<br>• ask: unchanged (lines 63-65 already name the keys).<br>• work: unchanged (decision 6); `:52-53` already satisfies (a).<br>**researcher.md:24-25**, in place, applied by `sw15-agent-shell-discipline` (lane A is that file's one writer; this unit does not open it; no test pins the prose). Current: ``Of the commands that enumerate the brief, `/st-ask` names all seven while `/st-work` `` / ``and `/st-spec` stop at the tool tier.`` New: ``Every spawning flow carries the six required keys through one shared line, and `/st-ask` `` / ``names `handoff_to` too.``<br>**spine.test.ts:** replace the literal `BRIEF_ENUMERATION_SITES` (`:92-117`) with a derivation: every command whose `spawns:` holds `researcher`, plus every skill whose body names a `` `researcher` brief ``. Assert (a) each site's flattened body holds a sentence matching every `BRIEF_KEY_SPELLINGS` regex (`test/corpus/agents/spine.test.ts:82-90`) except `handoff_to`; (b) every site except `st-ask`, `st-work` and `st-spec` holds the canonical line verbatim; (c) the derived set has ≥ 9 members (non-vacuous; the census counts exactly 9, eight commands from `spawns:` plus `st-dep-audit`, so (c) sits at its bound). Drop `suppliesHandoff` and update the `:320-323` comment. |
| `testCriteria` | Given all sites edited, when `npx vitest run test/corpus/agents/spine.test.ts` runs, then (a)-(c) pass. Removing the line from `st-board.md` fails (b), naming the file. The `st-spec` table still parses: `spec.test.ts` stays green. |
| `edgeCases` | (1) A new command that adds `researcher` to `spawns:` without the line: red by derivation. (2) `st-ask`'s richer list stays valid under (a). (3) A skill mentioning researchers without briefing one is not a site; the match needs the phrase `researcher` brief. |
| `depends_on` | sw24-debug-reproduce-in-process; its st-debug line sits inside that rewrite |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus && npm run lint && npm run typecheck && npm run test` |

**Census.** Shifts of +2 on:
- `pr-resolve-next-step-derived-from-run-state` (309-326).
- `plugin-mode-invocation` (164-166 and 285-290 shift; the quoted 88-97 is unchanged).
- `plan-lint-three-fails-returns-blocked-ambiguity` (272-309, 386-396).
- `plan-semantic-ambiguity-survives-structural-pass` (272-405).
- `plan-artifact-head-and-units-shape` (311-364).
- `board-write-back-four-channels` (253-285).
- `rework-next-step-derived-from-run-state` (265-273).
- `debug-next-step-derived-from-run-state` (163-177, cumulative with sw24).

`spec-testability-census` elides the researcher row with `[...]`, so it doesn't change. No Expected moves. Must-holds: `agent-researcher-return-contract`, `plan-artifact-head-and-units-shape`, and the floor `subagent-returns-blocked-ambiguity` with its charter-only twin. No new case.

### sw28-spec-small-app-scope — on a small repository, `/st-spec create` offers the whole app
| Field | Content |
|---|---|
| `id` | sw28-spec-small-app-scope |
| `requirements` | REQ-FLOW-012 |
| `files` | `content/commands/st-spec.md`, `test/corpus/commands/spec.test.ts`, `.claude/commands/st-spec.md`, `.apm/prompts/st-spec.prompt.md`, `.stamity/manifest.json`, the crossClientGoldens snapshot; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | Current `st-spec.md:101-104`: `gets its spec file. A backfill request needs an explicitly named scope — a module path, a` / `feature name, a route group. "Backfill the specs" with no named` / `scope gets one question offering the three narrowest readings; the default when…`<br>New 101-109 (+3):<br>`gets its spec file. A backfill request needs an explicitly named scope — a module path, a`<br>`feature name, a route group, or the whole app when the repo is small. Below 5,000 source`<br>`lines, counted over the files the Source tree probe found, the whole app is a named scope:`<br>`it is offered beside the narrowest readings, and it is the default when the request names`<br>`the app ("create the spec", "spec this app"); the mode-chosen line states the count.`<br>`"Backfill the specs" with no named`<br>`scope gets one question offering the three narrowest readings; the default when no answer`<br>`arrives is to decline the sweep and keep accreting per change. A`<br>`200k-line codebase is the case the rule exists for: …` (unchanged)<br>Chosen whole-app scope means `spec-author · brownfield` writes one flat spec file per surface with `REQ-` ids, and the day-one map still lands. **Test:** keep `spec.test.ts:356-360` and add `/Below 5,000 source lines/`, `/the whole app is a named scope/`, `/default when the request names the app/`. |
| `testCriteria` | Given the edit, the pins at `spec.test.ts:355-364` stay green unedited and the new assertions pass. |
| `edgeCases` | (1) 5,000 or more lines: unchanged behavior, whole app not offered. (2) Under the bound, request "backfill the specs" (app not named): the whole app is offered, and the default stays decline. (3) Greenfield posture: not affected. |
| `depends_on` | sw30-researcher-brief-keys; same file |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus/commands/spec.test.ts && npm run lint && npm run typecheck && npm run test` |

**Census.** +3 shifts on `spec-converge-confirm-gated-merge` (122-150), `spec-testability-census` (210-222, 256-268) and `spec-next-step-derived-from-run-state` (276-294). Quoted text is unchanged and no Expected moves. The floor `question-shape-and-default` covers the question's shape. **New case:** `spec-create-small-repo-whole-app`.

### sw25-quick-tests-ride-along — the quick lane takes a small change together with its tests

> **Settled by this plan (decision 5):** the batch's 5-file cap counts every file; the per-item single-file rule counts source files only. Word the Files row `| Files | `>5 files` across the batch (every file counts), or one item whose source change cannot land in a single source file — a test that follows the change rides along, and a string correction may take two |`, and read "is not counted" in the paragraph below as "is not counted for the item's single-file rule; it still counts toward the batch's 5-file cap".
| Field | Content |
|---|---|
| `id` | sw25-quick-tests-ride-along |
| `requirements` | REQ-FLOW-005 |
| `files` | `content/commands/st-quick.md`, `test/corpus/commands/lightTrio.test.ts`, `.claude/commands/st-quick.md`, `.apm/prompts/st-quick.prompt.md`, `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | **Insert after `st-quick.md:36`**, the last Trivial-signals bullet `- Documentation edit.` (+8 lines: one blank, then 7):<br>`**Tests ride along.** The batch cap counts every file; the single-item rule counts source files. A test file edited only where it`<br>`exercises the item's changed lines — the query, assertion or fixture that names the changed`<br>`string or value — travels with the item and is not counted; its lines still count toward`<br>`` `Size`. A user-facing string or label correction may span two source files and still ``<br>`qualify. Riding tests move no other row: a test under a security-sensitive path fires that`<br>`` row, a new route with its test still fires `Schema, API, event or migration`, and a new ``<br>`test file for an untested behavior is not a ride-along.`<br>**Replace line 60**, current: ``| Files | `>5 files` across the batch, or one item that cannot land in a single file |``. New: ``| Files | `>5 files` across the batch (every file counts), or one item whose source change cannot land in a single source file — a test that follows the change rides along, and a string correction may take two |``. This keeps the `>5 files` pin.<br>Unchanged: the other rows (61-64), the hard-refusal text (46-57, 76-81) and the 5-file batch cap. **Test:** a new case in `lightTrio.test.ts` under `describe("quick — the guardrails are the command")` asserts on the flattened body: `/tests ride along/i`, `/every file counts/i`, `/rides along/i`, `/may span two source files/i`, `/still fires `Schema, API, event or migration`/`. |
| `testCriteria` | Given the edited body, when `npx vitest run test/corpus/commands/lightTrio.test.ts` runs, then the new case passes, and the existing pins at `:543-547` (`>5 files`, `~200 lines`, hard refusal) and `:554-557` (security row) still pass unedited. Given a batch with 2 components and 2 test files, the batch cap sees 4 files and the item's single-file rule 2 source files, so no row fires (checked by the new eval case, below). |
| `edgeCases` | (1) A new test file for a behavior that has no test: not a ride-along; the item leaves the lane. (2) A string in 3 source files: the Files row fires. (3) A test file under an auth path: the Security row fires even though the test would otherwise ride along. (4) A new endpoint plus its test: the API row fires. (5) Ride-along lines push the batch past ~200: the Size row fires. |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus/commands/lightTrio.test.ts && npm run lint && npm run typecheck && npm run test` |

**Census.** +8 lines after line 36, and line 60 changes in place. Every case below also shifts by +8 (for `benign`, the first segment's end and the whole second segment move).

| Case | Range | Change | Expected moves? |
|---|---|---|---|
| `quick-hard-refusal-thresholds` (floor) | 46-64 | quotes row 60, so the Brief is re-quoted | No: nine files still count against `>5 files` (decision 5), so the Expected holds; only row 60 is re-quoted. |
| `quick-refusal-states-measurement` | 48-74 | quotes row 60, re-quote | No (the migration row still fires). |
| `quick-security-surface-no-size-floor` (floor) | 48-78 | shift only | No. |
| `quick-refusal-under-social-pressure` (floor) | 47-62, 76-81 | shift only | No. |
| `quick-mid-run-re-escalation` | 58-61, 114-128 | quotes row 60, re-quote | No (7 source files). |
| `benign-small-change-quick-proceeds` (twin) | 29-64, 130-132 → 29-72, 138-140 | quotes row 60, re-quote | No. |
| `quick-next-step-derived-from-batch-state` | 154-168 | shift only | No. |

- **New cases:** golden `quick-string-rename-with-its-tests` and adversarial `quick-string-rename-on-auth-path-refused` (sketches below).

### sw15-quick-gate-once — the quick gate runs once and never counts an unknown as green
| Field | Content |
|---|---|
| `id` | sw15-quick-gate-once |
| `requirements` | REQ-FLOW-013 |
| `files` | `content/commands/st-quick.md`, `.claude/commands/st-quick.md`, `.apm/prompts/st-quick.prompt.md`, `.stamity/manifest.json`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | Current `st-quick.md:134-136` (before sw25's +8): ``- Spawn `test-runner` with the changed-file list. It runs `${STAMITY:VERIFY_GATE_ALL}` and`` / `returns a gate-by-gate result: exact commands, verbatim failing excerpts, never a bare` / `pass/fail.`<br>New (4 lines, +1):<br>``- Spawn `test-runner` with the changed-file list. It runs `${STAMITY:VERIFY_GATE_ALL}` once,``<br>`as the charter spells it, and returns a gate-by-gate result: exact commands, verbatim failing`<br>``excerpts, never a bare pass/fail. A row whose exit code the runner could not read is `unknown`,``<br>`and an unknown row is never green.`<br>This keeps the pins at `lightTrio.test.ts:576-580`. |
| `testCriteria` | Given the edit, the `lightTrio` "runs the full gate in the test-runner" case stays green unedited, and the flattened body matches `/an unknown row is never green/i` (add this assertion). |
| `edgeCases` | A tool result with no exit status: the batch is not reported done, and the report names the `unknown` row. |
| `depends_on` | sw25-quick-tests-ride-along, sw15-agent-shell-discipline |
| `verify` | same as sw25 |

**Census.** +1 line at about line 145 (after sw25). `quick-next-step-derived-from-batch-state` (154-168) shifts +1 more; its Expected doesn't move. No other quick case reaches past line 144.

### sw30-coverage-checker — the checker accepts `/st-plan` headings and a missing `docs/specs`
| Field | Content |
|---|---|
| `id` | sw30-coverage-checker |
| `requirements` | REQ-FINISH-003 |
| `files` | `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, `test/authoring/specPlanCoverage.test.ts`, `.claude/skills/st-verify/scripts/spec-plan-coverage.mjs`, `.apm/skills/st-verify/scripts/spec-plan-coverage.mjs`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (the file's hash and bytes, currently `3663df99…` at 14401 bytes), `.stamity/manifest.json` |
| `interfaces` | • Line 126: the section name becomes `heading[1].replace(/^\d+[.)]\s+/, "").toLowerCase()`.<br>• Line 151: `if (section !== "units") continue;` becomes `if (!isUnits(section)) continue;`, with `const isUnits = (section) => /^units\b/.test(section);`.<br>• `ADVISORY_CODES = new Set(["provisional-definition", "missing-spec-input"])`.<br>• `checkCoverage(plan, specs, options = {})`: `options` gains `missingSpecInputs?: string[]`, and each entry adds `{code:"missing-spec-input", path, line:1, message:"<path> does not exist; read as no spec — every cited ID must be defined in this plan's delta or the unit must say spec carries no ids."}`.<br>• `main`: an input path that doesn't exist and doesn't end in `.md` joins `missingSpecInputs` and contributes no spec. A missing `.md` path or a missing plan still returns 2. |
| `testCriteria` | Given `## 2. Spec delta` and `## 3. Units — engine`, the base fixture passes with scope `[REQ-DEMO-001, REQ-DEMO-002]`. Given `plan.md` plus a missing `docs/specs` and units saying `spec carries no ids` with an empty delta reason, it exits 0 and lists one `missing-spec-input`. Given the same missing dir with a unit citing `REQ-DEMO-001` and no provisional heading, it exits 1 with `dangling-requirement`. Given `missing.md`, it exits 2. All existing cases stay green (including plans 006 and 007). |
| `edgeCases` | (1) `## Unitsafety` is not matched (word boundary). (2) `## 10. Units` is matched. (3) A missing spec dir with a provisional `### REQ-NEW-001`: passes with `provisional-definition` and `missing-spec-input`. |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/authoring/specPlanCoverage.test.ts test/emit/crossClientGoldens.test.ts && npm run lint && npm run typecheck && npm run test` |

**Census.** No eval case sources the checker. `st-plan.md:285-290` prose is left unchanged, so `plugin-mode-invocation` holds.


**Lane A — agent bodies, one writer**

### sw15-agent-shell-discipline — gates run once, unwrapped, in POSIX sh, with an honest exit code
| Field | Content |
|---|---|
| `id` | sw15-agent-shell-discipline |
| `requirements` | REQ-FLOW-013, REQ-FLOW-014 |
| `files` | `content/agents/stamity-test-runner.md`, `content/agents/stamity-implementer.md`, `content/agents/stamity-fixer.md`, `content/agents/stamity-researcher.md`; `test/corpus/agents/shellDiscipline.test.ts` (new); `test/corpus/agents/quality.test.ts`; `.claude/agents/stamity-{test-runner,implementer,fixer,researcher}.md`; `.apm/agents/stamity-{test-runner,implementer,fixer,researcher}.agent.md`; `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` (test-runner substitution golden, around `:6216-6338`); `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`; `.stamity/manifest.json`; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts); `evals/SET-v7.md` (range cells); the Brief re-quotes in `evals/cases-v6/golden/agent-test-runner-return-contract.md` (rows 52-53, line 71; its `## Expected` is lane V's) and `evals/cases-v6/golden/agent-implementer-return-contract.md:42-47` (a verbatim quote of `stamity-implementer.md:78-83`; its range 62-117 may become 62-118) |
| `interfaces` | **First, `sw30-researcher-brief-keys`' edit of `content/agents/stamity-researcher.md:24-25`**, applied here as that cell words it (lane A is the researcher body's one writer).<br>**Row values (census S7):** no engine code parses runner rows, and the content readers that read "pass or fail" treat any non-pass as not green, so they need no edit: `st-debug.md:30-32`, `st-pr-resolve.md:230-233`, `st-spec.md:214-216`, `stamity-performance.md:79` (a `not measured` duration is no data). The one reader that could read `unknown` as proof, the QA skill's auto-prove, is `work-qa-states`'.<br>**test-runner, same line count up to line 79** (a comment in `scripts/plugins/tokens.mjs:46` pins `stamity-test-runner.md:79`):<br>• Lines 32-36 become 5 lines: ``… For a verdict per gate,`` / ``invoke the three narrow gates separately instead of `all`, and report three rows:`` / `each requested gate runs once per pass, and never both ways over one tree.` This keeps the `quality.test.ts:259` pin.<br>• Lines 38-40 become 3 lines: `Run each command from the repository root exactly as resolved: no environment edits, no` / `flag added to the resolved command, no wrapper around it, and no filter narrowing the suite` / `unless the brief supplied it. A gate that is altered to pass has measured nothing.`<br>• Row 52: ``| status | `pass` \| `fail` \| `not-run` \| `not-runnable` \| `unknown` |`` (the old literal survives as a prefix, so `:285` holds).<br>• Row 53: ``| exit code | the process exit status as the tool reported it, `timeout`, or `unknown` when the tool showed none |``<br>• Row 54: ``| duration | wall-clock seconds as the tool reported them, or `not measured` |``<br>• Lines 70-72 become 3 lines: ``… Any `fail`, `not-run`, or `not-runnable` row makes the verdict `red`, and so`` / ``does an `unknown` one; the verdict names the rows that caused it.`` (`:304` regex holds).<br>• Insert after line 98 (+4): ``**An exit code the tool did not show.** The code is read from the tool's own result, never from a second run, an `echo $?`, or a wrapper. A result that shows output but no exit status is reported with `exit code: unknown` and status `unknown`; the output is quoted as the excerpt, and nothing about it is read as a pass.``<br>**implementer** lines 78-80: append ``— each run once, as resolved, its exit code read from the tool (Shell)`` to the bullet.<br>**Appended at the end of all four bodies** (after `## Return contract`, so no eval range shifts), byte-identical:<br>`## Shell`<br>`Where this role runs commands, it writes portable POSIX \`sh\`, so a command runs the same under`<br>``` `sh`, `bash`, `dash` or `zsh`: no `PIPESTATUS`, no `[[ … ]]`, no arrays, no `pipefail`, no ```<br>``` `<( … )`. Each command runs once, as written — no `time`, no `{ …; }` grouping, no redirect ```<br>``` into a temp file, no `echo $?`, no pipe into `tail` or `head` — and its exit code is read from ```<br>``` the tool result. A code the tool did not show is `unknown`, never a pass. A long command is ```<br>``` waited on in the foreground under the tool's own timeout, never polled with `sleep`. ```<br>The researcher alone adds one more line: `This role runs no verification gate; gate evidence is the test-runner's.`<br>**Test `shellDiscipline.test.ts`:** (a) for every agent whose `capabilities` include `execute`, plus `researcher`, the body has a `## Shell` section holding `SHELL_PARAGRAPH` verbatim after whitespace flattening. (b) For every fenced block in `content/**/*.md` whose info string is `sh`, `bash`, `shell` or `console`, no line matches `/PIPESTATUS\|\[\[\|pipefail\|<\(\|\bsleep\b\|echo \$\?\|\|\s*(tail\|head)\b\|^\s*time\s\|=\(/`. (c) Red-check: deleting the paragraph from one body fails (a). **`quality.test.ts`:** add `/`unknown` when the tool showed none/` and `/or `not measured`/` to the structured-result case. |
| `testCriteria` | Given the four edited bodies, when `npx vitest run test/corpus/agents` runs, then `shellDiscipline` passes, and `quality.test.ts:259,265-267,285,304` pass unedited. Given a fixture body with `echo ${PIPESTATUS[0]}` in a bash fence, check (b) fails and names the file. `grep -n 'unresolved' content/agents/stamity-test-runner.md` still resolves at line 79. |
| `edgeCases` | (1) A gate that hangs: still `timeout`, not `unknown`. (2) A `&&` chain that stops early: unreached gates stay `not-run`. (3) A client that gives the researcher no shell: the section is inert and the body stays valid. (4) The Shell paragraph itself names banned tokens in prose; check (b) scans fenced shell blocks only, so no false hit. |
| `depends_on` | none; it opens with `sw30-researcher-brief-keys`' researcher-body edit, worded in that cell |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update && npx vitest run test/evals && npm run lint && npm run typecheck && npm run test` |

**Census.**
- `agent-test-runner-return-contract` (14-17, 42-129 → 42-133): rows 52-54 and 70-72 are re-quoted (the Brief quotes rows 52-53 and line 71). Expected **likely moves** (lane V): B2's six fields gain the `unknown` and `not measured` values, and the claim's verdict wording changes.
- `agent-implementer-return-contract` (14-16, 62-117, which may become 62-118): its Brief at `:42-47` quotes `stamity-implementer.md:78-83` verbatim, so the gates bullet is re-quoted; Expected holds.
- `agent-fixer-return-contract` (14-55, 92-125): nothing changes (append only).
- `agent-researcher-return-contract` (14-16, 52-122): nothing changes.
- Floor `charter-universal-floor-holds-under-deadline`: nothing changes.
- **New case:** `test-runner-plain-gates-honest-exit`.

### sw05-verdict-roles-read-git — verdict roles read the change themselves through read-only git
| Field | Content |
|---|---|
| `id` | sw05-verdict-roles-read-git |
| `requirements` | REQ-CTX-017 |
| `files` | `content/agents/stamity-{reviewer,security,performance,design-quality,spec-author}.md`, `test/corpus/agents/verdictReturns.test.ts`, `.claude/agents/stamity-{…}.md` ×5, `.apm/agents/stamity-{…}.agent.md` ×5, `.stamity/manifest.json`, the crossClientGoldens snapshot; the eval case files its census names, `source:` ranges only (the eval-range rule under Shared contracts) |
| `interfaces` | **Intro edits** (same line counts where the case ranges start):<br>• reviewer 15-17, current: ``Reads only — no edits, no`` / `commands, no branch or board mutation. Fixes belong…`. New: ``… Reads only — no edits, no`` / ``mutating command, no branch or board mutation; its one command family is read-only git (Reading`` / `the change). Fixes belong to the fixer role; this role decides whether the change is right.`<br>• security 16: `Reads only — the repair belongs…` becomes `Reads only, with read-only git (Reading the change) — the repair belongs…`, reflowed within 16-17.<br>• performance 15: `Reads only.` becomes `Reads only, with read-only git (Reading the change).`<br>• design-quality 17: `Reads only — findings go to the fixer.` becomes `Reads only, with read-only git (Reading the change) — findings go to the fixer.`<br>• spec-author: append only.<br>**Appended section** at the end of all five bodies:<br>`## Reading the change`<br>``The brief names a diff range (`<base>..<head>`), the plan cell, the acceptance criteria and the report path — never the implementer's account of what changed. The change is read from the range itself with read-only git: `git diff <range>`, `git show <commit>`, `git log <range>`, `git rev-list <range>` and `git merge-base <a> <b>`, each run once in portable POSIX `sh`. No other command runs: nothing that writes the working tree, the index, a ref, a stash or a remote, no option that writes a file, and no gate — gate evidence is the test-runner's. A summary in the brief is a lead to check against the diff, never evidence. Where the client grants no shell, the change is read from the hunks the brief carries and the result names that basis; a brief carrying neither a range nor hunks returns `BLOCKED_DEPENDENCY` naming the missing diff.`` (The spec-author variant says "history it describes" in place of "the change".)<br>Frontmatter `capabilities: [read]` / `[read, edit]` stays; the engine lane's grant must not add the `execute` category (pins listed below). **Test:** in `verdictReturns.test.ts`, for the five ids the section exists, names the five subcommands, contains `/never the implementer's account/`, and contains none of `checkout`, `reset`, `commit`, `push` as allowed verbs. |
| `testCriteria` | Given the edits, `verdictReturns`, `specialists` and `spine` pass. The `capabilities` pins at `verdictReturns:158`, `specialists:117-133, 218, 226`, `spine:148, 250` and `quality:106` stay unedited. |
| `edgeCases` | (1) A client with no git grant: reads the hunks, names the basis. (2) A brief carrying only an implementer summary: `BLOCKED_DEPENDENCY`. (3) A deep whole-branch pass uses `git merge-base` for the range. |
| `depends_on` | sw15-agent-shell-discipline |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npx vitest run test/evals test/corpus/agents && npm run lint && npm run typecheck && npm run test` |

**Census.**
- `agent-reviewer-return-contract` (14-24, 93-187): Brief lines 19-20 re-quoted. Expected **moves**: B8 "run a command" becomes "run a mutating command", and the claim's "claims no edit and no command" changes the same way.
- `agent-security-return-contract` (14-22, 60-147) and the floor `security-agent-no-write-under-pressure` (4-18, 112-147): re-quote only, Expected holds, provided the reflow keeps line counts.
- `agent-performance-return-contract` (14-49, 107-170) and `agent-design-quality-return-contract` (14-33, 112-148): re-quote only.
- Floor `agent-spec-author-return-contract`: nothing changes.
- **New case:** `reviewer-brief-is-diff-and-criteria` (plan 009 eval gap 1).


**Lane E — engine (one writer per shared source file)**

### sw26-cli-token — one substitution token renders the pinned CLI call

| Field | Content |
|---|---|
| `id` | sw26-cli-token |
| `requirements` | REQ-FLOW-002 |
| `files` | `src/shared/cliCall.ts` (new, kernel), `src/emit/substitution.ts`, `src/emit/planner.ts` (the emission context), `src/cli/engine/emission.ts` (supplies the context), the six files whose paths run the substitution passes (`src/emit/agentsMd.ts:132-134`, `src/emit/skillsProjection.ts:297,602`, `src/adapters/claude.ts:1127-1131`, `src/adapters/codex.ts:614-618`, `src/adapters/cursor.ts:389-393`, `src/adapters/copilot.ts:635-639`), `content/charter/stamity-charter.md` (line 26), `src/content/charter.ts` (the measured always-on byte constants, `:278,298`, today 25,245 / 5,247) and every reader a changed constant moves (for example `src/emit/capabilityMatrix.ts`, `test/corpus/invariants.test.ts:756-813`, `test/emit/capabilityMatrix.test.ts`, and `docs/capability-matrix.md` regenerated), `test/content/charter.test.ts` ("exercises all ten wired tokens", a dated TEST CHANGE), `test/emit/substitution.property.test.ts:189-199,213,277-280` (`expectedValues`), `test/emit/substitution.test.ts` (`:302-341`, the count becomes 10), `src/cli/kit/packageName.ts` (export only), `scripts/plugins/tokens.mjs`, `scripts/plugins/corpusStage.mjs`, `scripts/generate-plugin-packages.mjs`, `test/ci/pluginModules.test.ts`, `test/architecture/boundaries.test.ts` (one `PLAN_MAP` row for the new kernel module), `test/shared/cliCall.test.ts` (new). Regenerated: the dogfood `AGENTS.md` line and both golden snapshots |
| `interfaces` | **`src/shared/cliCall.ts`** (wave 1; it imports only the errors module, `../types/errors.ts` for `EngineError`, which wave 1 allows as `src/shared/paths.ts:3` shows): `export function pinnedCliCall(packageName: string, version: string, verb: string): string` returns `` `npx -y ${packageName}@${version} ${verb}` ``; `export function pinnedCliPrefix(packageName: string, version: string): string` returns `` `npx -y ${packageName}@${version}` ``. Both throw `EngineError` `VALIDATION_ERROR` on an empty name or a version that is not semver-shaped. `sw26-engine-cli-call-form` later adds `cliCallHint` to this module. **Emission context:** `EmissionContext` gains `packageName?: string`, defaulting to the literal `"@zomarit/stamity"`, held equal to `CANONICAL_PACKAGE_NAME` (`src/cli/kit/packageName.ts:38`, exported for this test) by a test; the version is the context's existing engine version. **Token:** `src/emit/substitution.ts` adds `export const CLI_TOKEN = "${STAMITY:CLI}"` beside `VERIFY_GATE_ALL_TOKEN` (`:66`) and appends it to `REPO_SUBSTITUTION_TOKENS` (`:86`, ten tokens), the list content validators accept (`test/corpus/invariants.test.ts:1413`, `test/corpus/emissionGoldens.test.ts:759-767`, `test/packs/scaffold.test.ts:754`, `test/packs/ops.test.ts:817`, `test/corpus/skills/verifyCore.test.ts:799`, `test/corpus/commands/spec.test.ts:441`, `test/corpus/commands/feedbackPair.test.ts:290`). It renders to `pinnedCliPrefix(ctx.packageName, ctx.engineVersion)` in a pass of its own family, like `INVARIANTS_VERSION` (its input is the emission context, not detection), and every path that runs the other passes runs it (the six files above). Golden emissions use `GOLDEN_ENGINE_VERSION` (`1.0.0-golden`), never `@latest`. **Charter:** `content/charter/stamity-charter.md:26` "change via `stamity config`" becomes "change via `${STAMITY:CLI} config`", because `test/content/charter.test.ts:199-201` requires every wired token in the charter body; the always-on byte constants move by measurement with their readers. **Plugin bodies:** `scripts/plugins/tokens.mjs` maps `${STAMITY:CLI}` to the literal `npx -y @zomarit/stamity@<plugin version>` (decision 10); the plugin build passes the version in (`scripts/plugins/corpusStage.mjs:93`, `scripts/generate-plugin-packages.mjs:72`, where `PLUGIN_VERSION` is a regex, not a version). Its comment "Nine tokens exist; eight are mapped" (`:12`) becomes "Ten tokens exist; nine are mapped", and the binding test (`test/ci/pluginModules.test.ts:38,141-158`) accounts for the one literal-mapped token. **APM bodies** ship the token raw, as they ship every token today (`.stamity/inbox.md:17`); no generator change |
| `testCriteria` | GIVEN `pinnedCliCall("@zomarit/stamity","1.11.0","check")` THEN it returns `npx -y @zomarit/stamity@1.11.0 check`; GIVEN version `""` or `"latest"` THEN it throws `VALIDATION_ERROR`. GIVEN a corpus body containing `${STAMITY:CLI} learn capture` WHEN emitted for a repository at engine version `1.0.0-golden` THEN the text reads `npx -y @zomarit/stamity@1.0.0-golden learn capture` and no `${STAMITY:` token remains. GIVEN a plugin build THEN the same body carries the plugin's own version. GIVEN the APM package THEN the same body carries `${STAMITY:CLI}` raw. GIVEN `test/content/charter.test.ts` THEN it exercises all ten wired tokens, and the emitted charter's line reads "change via `npx -y @zomarit/stamity@<v> config`". GIVEN `test/emit/substitution.test.ts` THEN the token count is 10. GIVEN `boundaries.test.ts` THEN the new module is a wave-1 kernel whose only import is the errors module |
| `edgeCases` | A fork with a renamed package: the context carries the fork's name, so the rendered call names it. An emission with no engine version (a test harness): the golden version is used, never `@latest`. |
| `depends_on` | none (first in lane E; `sw26-cli-call-form` and `work-cli-call-form` build against it) |
| `verify` | `npx vitest run test/shared test/emit test/ci/pluginModules.test.ts test/architecture && npm run lint && npm run typecheck && npm run knip` |

### sw01-generated-lint-header — every generated script disables lint for itself
| Field | Content |
|---|---|
| `id` | sw01-generated-lint-header |
| `requirements` | REQ-FLOW-001 |
| `files` | Hand-written: `src/types/markers.ts` (new constant); `src/hooks/scripts.ts` (`header()` only, `:441-450`); `src/hooks/portableRunner.ts` (`buildPortableHookRunner`, `:76-77`); `src/adapters/cursor.ts` (`guardHeader`, `:888-897`); `content/skills/st-verify/scripts/spec-plan-coverage.mjs` (line 1); `test/hooks/emittedLint.test.ts` (new); `eslint.config.js` (and `.oxlintrc.json` if it needs a matching entry). Regenerated: `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` and `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` (`npx vitest run <those two files> --update`; the diff should only add the directive line); `.stamity/generated/hooks/claude/{stamity-session-start,stamity-pre-tool-use-guard,stamity-config-tamper-notice,stamity-review-gate}.mjs`, `.claude/skills/st-verify/scripts/spec-plan-coverage.mjs` and `.stamity/manifest.json` (`npm run build && node dist/cli.js sync`); `.apm/skills/st-verify/scripts/spec-plan-coverage.mjs` (`node scripts/generate-apm-package.mjs`) |
| `interfaces` | **Where the 20 files come from:** 4 core scripts per client × 4 clients via `header()`, 2 Cursor guards via `guardHeader()`, and the skill script copied verbatim to `.agents/skills` and `.claude/skills` (`skillsProjection.ts:102,120-127`). The portable runner has no `header()`; it opens with a literal `#!/usr/bin/env node` (`portableRunner.ts:77`). Current `header()`: `return ["#!/usr/bin/env node", ...summary.map(...), "//", "// Generated file — regenerate it rather than editing; local edits are overwritten.", "// Trust posture: …", ...posture.map(...)].join("\n");`. **New:** in `src/types/markers.ts` (wave 0, may import nothing), `export const GENERATED_SCRIPT_LINT_DIRECTIVE = "/* eslint-disable */";`. It goes on line 2, right after the shebang, in `header()`, `guardHeader()` and `buildPortableHookRunner()`; it goes on line 1 of the skill script, which has no shebang. It lives in markers.ts because `portableRunner.ts` and `scripts.ts` are both wave 4 in different units, and an edge between them breaks the wave rule. Nothing asserts a script's line 2 today. `scripts/plugins/locate.mjs` (a plugin-root runtime, not a user-repo file) is out of scope. **This repository's own lint** still covers the hand-written source `content/skills/st-verify/scripts/spec-plan-coverage.mjs` (its lint covers `content/**`, `.claude/**` and `.apm/**` `*.mjs`, `eslint.config.js:141-162`, `.oxlintrc.json:203`): a block for that one source path sets `linterOptions: { noInlineConfig: true }`, with the oxlint equivalent if one exists; if oxlint has none, the residual is recorded in the run record. **Test:** `import { ESLint } from "eslint"; import js from "@eslint/js";` (both devDependencies: `package.json:76,81`). For each path in `emittedPaths(readEmittedTree(makeGoldenRepo({ tools: TOOLS }).rootDir))` ending in `.mjs`/`.js`/`.cjs`, run `new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [{ ...js.configs.recommended, files: ["**/*.{js,mjs,cjs}"], languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: {} } }] }).lintText(content, { filePath })` (helpers in `test/emit/goldenFixture.ts:186,231,237`) |
| `testCriteria` | GIVEN an all-four-client golden repo WHEN each emitted script is linted under the stock flat config with no Node globals THEN every result has `errorCount === 0` and `fatalErrorCount === 0`. GIVEN the same text with the directive line removed THEN at least one hook script has `errorCount > 0`, which proves the header does the work. GIVEN any emitted script THEN line 1 is `#!/usr/bin/env node` (the existing check at `test/emit/hooksInfra.test.ts:286` stays green unedited) and the directive is line 2, or line 1 for the skill script. The set checked contains the 16 hook-tree scripts, both `.cursor/hooks/*.mjs` guards and both skill-script copies; the list is derived from the tree, not typed as `20`. GIVEN `npm run lint` in this repository THEN the source `content/skills/st-verify/scripts/spec-plan-coverage.mjs` is still linted with its directive ignored, or the oxlint residual is recorded. GIVEN `npx eslint --print-config` on an emitted script THEN the unused-directive warning it draws is measured and recorded against this plan's Risks row |
| `edgeCases` | (1) A user config with Node globals where no rule fires: ESLint may report the directive as unused at warn level, which fails a `--max-warnings 0` project. Record the warning count in the test, measured with `npx eslint --print-config` on an emitted script, and name it as a residual (unverified until measured; this plan's Risks row names it). (2) A CRLF checkout: the directive stays a whole line. (3) Budgets: +1 line and +20 bytes per script, well inside `HOOK_SCRIPT_BUDGETS` (`scripts.ts:128-144`). (4) The plugin-container layout gets the header automatically through the same builders |
| `depends_on` | sw26-cli-token; the lane-E order |
| `verify` | `npx vitest run test/hooks test/emit test/corpus test/authoring && npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && npm run lint && npm run typecheck && npm run knip && npm test -- --coverage` |

### sw27-ignore-review-gate-state — `init` and `sync` ignore the review gate's state file, lock and temp files

> **Settled by this plan (decision 9):** also refuse the three review-gate names as worktree entries in `src/worktree/policy.ts` (a `VALIDATION_ERROR` naming the path as review-gate runtime state), with a test. `docs/specs/worktree-lane.md` changes by this plan's MODIFIED REQ-WORKTREE-003 and REQ-WORKTREE-004.
| Field | Content |
|---|---|
| `id` | sw27-ignore-review-gate-state |
| `requirements` | REQ-FLOW-016, REQ-WORKTREE-003, REQ-WORKTREE-004 |
| `files` | `src/types/markers.ts`; `src/hooks/scripts.ts` (`:195` re-export only); `src/mcp/env.ts` (`:175-188`, and the comment at `:176-178`); `src/cli/commands/sync/engine.ts` (`applySync`, live path); `src/cli/commands/init/apply.ts` (comments `:74-75`, `:141`, `:381-382`); `src/cli/commands/init/panel.ts` (`gitignoreLine` `:477-493`); `test/mcp/env.test.ts`; `test/cli/commands/syncEngine.test.ts`; `test/cli/commands/initPanel.test.ts`; `test/cli/commands/init.test.ts:387,392,1140`; `test/cli/commands/initApply.test.ts:199,226,337,575`; `test/migration/carry.test.ts:741-746,769,853-854,953`; `test/cli/commands/config.test.ts:1172`; `test/cli/flows.e2e.test.ts:184-186` (comment); `docs/getting-started.md` (`:332-346`); regenerated `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (`.gitignore` digest); `src/worktree/policy.ts`, `test/worktree/policy.test.ts` (`:433-445` takes another untracked example path, since review-gate files are now refused by name). `docs/specs/worktree-lane.md` (`:84`, `:383`, `:400-404`, `:1000`, `:1129-1131`) changes at the spec merge, not in this unit |
| `interfaces` | **Constants in `src/types/markers.ts` (wave 0):** `export const REVIEW_GATE_STATE_FILE = \`${STATE_DIR}/review-gate.json\``, `REVIEW_GATE_LOCK_SUFFIX = ".lock"`, `REVIEW_GATE_TEMP_INFIX = ".tmp-"`. `scripts.ts:195` re-exports the first under the same name. The gate body keeps its bytes (`STATE_FILE + ".lock"` at `:2194`, `".tmp-"` at `:2526`); the lock is a directory holding `owner` (`test/ci/repoHygiene.test.ts:50`). **`env.ts` (wave 3):** `REQUIRED_GITIGNORE_ENTRIES = [ENV_MCP_FILE, REVIEW_GATE_STATE_FILE, REVIEW_GATE_STATE_FILE + ".lock", REVIEW_GATE_STATE_FILE + ".tmp-*"]`. `DOMINATING_PATTERNS` gets one row per new entry: its `/`-anchored twin, `.stamity/`, `/.stamity/`, `.stamity/*`, `/.stamity/*`, `.stamity/**`, `/.stamity/**`, `.stamity/review-gate.json*`, `/.stamity/review-gate.json*`. `ensureGitignoreEntry(rootDir): Promise<void>` keeps its signature (`:582-596`). Every caller inherits the widened set on purpose, so any stamity write command leaves `.gitignore` complete: `init/apply.ts:383`, `migration/carry.ts:690`, `config/mcp.ts:465`, and `sync` (new, through `applySync`, which `workspace.ts:1068` also reaches). **Sync:** `await ensureGitignoreEntry(rootDir)` on the live path of `applySync`, before the first emitted-file write (not after all writes), so a refusal by the injection screen (`src/mcp/env.ts:590`) leaves nothing half-applied; a dry run skips it. **Worktree lane:** it refuses the three names, and any path under the lock directory (`.stamity/review-gate.json.lock/…`), as review-gate runtime state. **Panel:** the `gitignoreLine` text names the three state entries alongside `.env.mcp` |
| `testCriteria` | GIVEN an empty repo WHEN `ensureGitignoreEntry` runs three times THEN each of the four entries appears exactly once. GIVEN `.gitignore` holding `/.stamity/review-gate.json`, `/.stamity/review-gate.json.lock` and `/.stamity/review-gate.json.tmp-*` (this repo's `:35-37`) THEN no line is added. GIVEN `.stamity/` ignored THEN no review-gate line is added. GIVEN an initialised repo WHEN `sync` runs (not dry-run) THEN `git check-ignore -q .stamity/review-gate.json` and `.stamity/review-gate.json.tmp-deadbeef` exit 0. GIVEN `sync --dry-run` THEN `.gitignore` is byte-unchanged. After `npm run build && node dist/cli.js sync` here, `git diff .gitignore` is empty. GIVEN a sync whose injection screen refuses WHEN `applySync` stops THEN no emitted file was written. GIVEN `.stamity/worktree.json` with an entry `.stamity/review-gate.json.lock`, or one under `.stamity/review-gate.json.lock/`, WHEN the plan resolves THEN `VALIDATION_ERROR` names the path as review-gate runtime state that never travels. |
| `edgeCases` | A CRLF `.gitignore` gets CRLF back (existing behaviour, `:591-593`). An explicit negation `!.stamity/review-gate.json` is left alone. **Worktree lane (decision 9):** an entry naming any of the three, or a path under the lock directory, fails `VALIDATION_ERROR` naming it as review-gate runtime state; the defaults don't name it (`worktree/policy.ts:100-114`) |
| `depends_on` | sw01-generated-lint-header |
| `verify` | `npx vitest run test/mcp test/cli/commands test/emit test/worktree && npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm test -- --coverage` (then the CI Windows leg: the change touches paths) |

The four exact-content tests in `test/mcp/env.test.ts` (`:423`, `:433`, `:442`, `:451`) change, each with an inline reason (the testing rule's clause 5).

### sw07-card-on-resume-and-closed — the card after a resume, and a closed run's facts
| Field | Content |
|---|---|
| `id` | sw07-card-on-resume-and-closed |
| `requirements` | REQ-CTX-013 |
| `files` | `src/runs/layout.ts`, `src/runs/cardSource.ts`, `src/runs/resumeCard.ts`, `src/hooks/scripts.ts` (session-start builder only: `:676-698` header, `:1037-1046`), `src/cli/commands/ledger.ts` (`statusJson`, additive; `NO_CARD_JSON` at `:493-504`), `test/hooks/sessionStartCard.test.ts`, `test/runs/resumeCardParity.test.ts` (including `:886-888`), `SECURITY.md:104` (the card's re-entry surface: the resume trigger and the closed-run `Status` text it now echoes) with its pin `test/docsPages.test.ts:1586-1602`, `docs/getting-started.md:238-239`; `content/commands/st-work.md` is left alone (lane W's; its compaction wording stays true); regenerated both golden snapshots and `.stamity/generated/hooks/claude/stamity-session-start.mjs` plus `.stamity/manifest.json` (sync) |
| `interfaces` | **Current trigger:** `const lines = render(); if (SOURCE === "compact") { const card = resumeCardLines(repoRoot(), STATE_ROOT, NOW); if (card !== null) lines.push("", ...card); }` (`scripts.ts:1042-1046`). **New:** `if (SOURCE === "compact" \|\| SOURCE === "resume")`, and the header's summary and posture lines say `a compaction or a resume`. **Closed-run card:** `resumeCardLines` keeps its signature `(rootDir, stateRoot, nowMs) → string[] \| null` (`cardSource.ts:453`). **Run selection**, for the in-progress run and for the closed card, skips debug records: a run id carrying the `_debug-` segment (`sw24-debug-reproduce-in-process`'s head); the `Invocation:` spelling is never the test. When no run is in progress it takes the greatest run id whose date prefix is at or after `UTC(nowMs) − (CARD_CLOSED_MAX_AGE_DAYS − 1)` days and whose record head reads as a regular file. It renders `stamity resume card — run <id> (closed; as of <YYYY-MM-DDTHH:MM>Z)`, then `status: <flattened Status value>`, then `plan: … · invocation: …`, then `ledger: <n> rows — fixed <a>, deferred <b>, rejected <c>, open <d>  ·  the ledger is the recovery point` (ledger states outside the four are summed as `, other <e>` after `open <d>`, printed only when e > 0), then `CARD_CLOSED_NEXT_LINE`. The whole card is screened (same withheld line) and shrinks to `CARD_MAX_CHARS`. **New in `layout.ts`:** `CARD_CLOSED_MAX_AGE_DAYS = 2`, `CARD_CLOSED_NEXT_LINE = "next: this run is closed — do not resume its dispatch; its record names what came after it"`. `cardLedger` also counts rows by `state`. **Engine copy:** `collectResumeCard` mirrors the same algorithm (`resumeCard.ts:571-630`), and `ResumeCard` gains `status: string \| null` and `ledgerStates: { fixed, deferred, rejected, open }`, with no `closed` field (`inProgress: false` already says it). `NO_CARD_JSON` (`ledger.ts:493-504`) keeps the same keys as the card JSON. `ledger status --run <closed run>` keeps today's layout (out of scope). The debug line and `debugRounds` are `sw07-card-debug-rounds`' |
| `testCriteria` | GIVEN a run in progress and stdin `{"source":"resume"}` WHEN the hook runs THEN stdout ends with a blank line and the same 6 lines as for `compact`. GIVEN `{"source":"startup"}` THEN stdout is byte-identical to empty stdin (test (a) at `:137-152` unchanged). GIVEN only a run `<today>_done` with `Status: **closed** — merged` and a ledger of 2 fixed and 1 deferred row, and `resume` THEN the card's first line matches `^stamity resume card — run <today>_done \(closed; as of ` and its ledger line reads `3 rows — fixed 2, deferred 1, rejected 0, open 0`. GIVEN the only closed run dated 3 days ago THEN no card. The parity suite shows hook lines equal to `collectResumeCard` for the closed fixture. The case at `:190-203` stays green (an in-progress run wins). GIVEN a ledger holding a row in a state outside the four THEN the ledger line ends `, other 1`; GIVEN none THEN no `other` appears. GIVEN only a record `<today>_debug-x` reading `Status: in progress` THEN no card names it as the run. GIVEN `stamity ledger status --json` with no card THEN its keys equal the card JSON's keys. GIVEN `test/docsPages.test.ts:1586-1602` THEN it passes against the edited `SECURITY.md:104` |
| `edgeCases` | A payload with `source` `"clear"`: no card. A TTY on stdin: no read, no card (existing). A closed-run status line with an instruction-override phrase: the card is withheld with one line. `ledger status` with no `--run` and a recent closed run prints the closed card, not `NO_CARD` (`ledger.ts:491`); the test at `resumeCardParity.test.ts:898` seeds `2026-09-20_closed`, which is outside the 2-day window, so it stays green. `ledger status --run <closed run>` prints today's layout, unchanged |
| `depends_on` | sw27-ignore-review-gate-state |
| `verify` | `npx vitest run test/hooks test/runs test/emit test/corpus && npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm run knip && npm test -- --coverage` |

Budget: session start is 40,914 B / 917 lines against the 49,152 / 1,100 ceiling (`scripts.ts:132-134`).

### sw07-card-debug-rounds — the card lists open debug rounds (was sw07-card-drafts-and-debug-rounds)

> **Amended by the run's contract census (G2):** the handoff-drafts line is dropped, because the session-start banner already lists each refused handoff by name and reason (`src/hooks/scripts.ts:997-1008`); decision 3 is withdrawn. This unit builds the debug line only, and imports nothing from the handoff module: the layering gate refuses a `HANDOFF_ID_PATTERN` import (`test/architecture/boundaries.test.ts:320,325,694-696`).
| Field | Content |
|---|---|
| `id` | sw07-card-debug-rounds |
| `requirements` | REQ-CTX-013 |
| `files` | `src/runs/layout.ts`, `src/runs/cardSource.ts`, `src/runs/resumeCard.ts`, `src/cli/commands/ledger.ts` (`NO_CARD_JSON` gains `debugRounds`), `test/hooks/sessionStartCard.test.ts`, `test/runs/resumeCardParity.test.ts`, regenerated goldens and the dogfood hook |
| `interfaces` | One line appended to the card before `next:`, **only when its count is > 0**, so today's 6-line fixtures don't move: `debug rounds open: <n> (<run ids>)`, listed with `cardList`. **Debug rounds:** the records that `sw07-card-on-resume-and-closed`'s run selection skips, those whose run id carries the `_debug-` segment (today `resumeCardLines` stops at the first `Status: in progress` record, `src/runs/cardSource.ts:463-474`), feed the debug line when their head reads `Status: in progress`. `ResumeCard` and `NO_CARD_JSON` gain `debugRounds: string[]`. The debug record's head is `sw24-debug-reproduce-in-process`'s contract |
| `testCriteria` | GIVEN no open debug record THEN the card is byte-identical to sw07-card-on-resume-and-closed's. GIVEN one debug record in progress and no work run THEN the first line names no run and the debug line names the record. GIVEN 25 open debug records THEN the card is at most `CARD_MAX_CHARS`. The parity suite matches `collectResumeCard` on both fixtures. |
| `edgeCases` | Many open debug records: the list shrinks with `… +n more`, as `cardList` does. A debug record whose `Invocation:` spelling differs per client: still found, by its run-id segment |
| `depends_on` | sw07-card-on-resume-and-closed, sw24-debug-reproduce-in-process; the debug record head |
| `verify` | same as sw07-card-on-resume-and-closed |

### sw26-engine-cli-call-form — generated files and the init panel print the pinned npx form

> **Owned elsewhere:** `src/shared/cliCall.ts`, the emission context's `packageName`, the `PLAN_MAP` row and the `${STAMITY:CLI}` token come from `sw26-cli-token`; this unit uses them, adds `cliCallHint` to the module, and does not re-create them.
| Field | Content |
|---|---|
| `id` | sw26-engine-cli-call-form |
| `requirements` | REQ-FLOW-002 |
| `files` | `src/shared/cliCall.ts` (adds `cliCallHint` only), `src/emit/hooksInfra.ts` (HooksPlanContext `:235`, call `:435`), `src/hooks/scripts.ts` (`planCoreHookScripts` `:2800-2828`, `buildConfigTamperNoticeScript` `:1738-1786`), `src/hooks/portableRunner.ts` (Codex starter `:67`), `src/adapters/claude.ts` (`GUARD_FAIL_CLOSED_TAIL` `:337-339`), `src/adapters/cursor.ts` (`:1057`, `:1112`, `:1219`, `:1226-1227`, `:1247`), `src/adapters/codex.ts` (`:699`), `src/cli/kit/packageName.ts` (`packageCommand` delegates), `src/cli/commands/init/panel.ts` (`:391`, `:395-396`, `:405`, `:572`), `src/detect/stackSupport.ts` (`:349`), `test/emit/noBareCliCall.test.ts` (new), `test/cli/kit/packageName.test.ts`, `test/support/identity.ts:121-123` (`npxCommand` mirrors `packageCommand`), `test/cli/commands/check.test.ts:546,572-574` (the fork literal), `test/detect/stackSupport.test.ts:325,351`, `test/hooks/scripts.test.ts:1623,1638,1651,1660,3428`, `test/adapters/claude.test.ts:113,116,138`, `test/adapters/cursor.test.ts:1339`, `test/cli/commands/initPanel.test.ts:274,282,476,505,718`, the test callers of `planCoreHookScripts`, `buildConfigTamperNoticeScript` and `portableHookCommand` (`test/corpus/emissionGoldens.test.ts:903-948`, `test/corpus/census.test.ts:220`, `test/hooks/scripts.test.ts:189-325,3141`, `test/hooks/scriptBudget.test.ts:65`, `test/corpus/hookWiring.test.ts:144,163,198,212,459`, `test/hooks/portableRunner.test.ts:140-413`), `docs/troubleshooting.md:216` (the verbatim fail-closed tail), the other adapter, init-panel and hook tests, regenerated goldens, dogfood hooks and manifest |
| `interfaces` | **Current forms:** `packageCommand(verb) → \`npx ${packageName()} ${verb}\`` (`packageName.ts:152-154`, unpinned, no `-y`). Bare strings: `"Run \`stamity check\` to diff …"` (`scripts.ts:1777,1781`), `"run stamity sync"` (`portableRunner.ts:67`, `claude.ts:339`), `"so stamity check is the control …"` (`codex.ts:699`). **`src/shared/cliCall.ts`** (`sw26-cli-token`'s module, which already holds `pinnedCliCall` and `pinnedCliPrefix`): this unit adds `export function cliCallHint(packageName, version, verb): string`, returning `` `stamity ${verb}` where the CLI is installed, else `npx -y <pkg>@<ver> <verb>` ``. **Context:** `HooksPlanContext` gains `packageName?: string`, filled from the emission context's `packageName` (`sw26-cli-token`'s field). The version is `ctx.engineVersion`. `buildConfigTamperNoticeScript(opts: { checkCall: string })`; `planCoreHookScripts(policiesJsonPath, tool, opts: { packageName: string; version: string })`. `packageCommand(verb)` becomes `pinnedCliCall(packageName(), resolveOwnPackageFacts().version, verb)`; an empty version falls back to today's unpinned form. **No npm channel (`review/94`):** a package whose running manifest is `private: true` with no `publishConfig.registry` renders every pinned call as `npx --no <name>@<version> <verb>`, which runs an installed copy and never fetches one; a package with a channel keeps `npx -y`. The flag is decided once, off the same manifest read as the name; init, sync, the CLI remedies and the plugin build carry it, and the pinned-call kernel (`src/shared/cliCall.ts`) renders it. About 30 CLI remedy strings that go through `packageCommand` change form with it (in scope: one function), including the `--json` `command` field of `src/cli/commands/plugin/status.ts:192,203`; the about 60 hard-coded bare strings stay (decision 11, drop list D-58). **Codex:** `.codex/hooks.json` carries the pinned form like every other client (G3). `docs/specs/plugin-lifecycle.md:168,564` wording moves at the spec merge, not here |
| `testCriteria` | GIVEN an all-four-client golden repo WHEN every file the engine renders from a template (hook scripts, guards, `hooks.json`, settings, panel text; the corpus bodies are `cliCallForm.test.ts`'s) is scanned with `/(?<![\w@/.:-])stamity (init\|sync\|check\|add\|clean\|config\|learn\|handoff\|ledger\|validate\|workspace\|worktree\|plugin)\b/` THEN there is no hit outside a `cliCallHint` sentence. GIVEN `GOLDEN_ENGINE_VERSION` `1.0.0-golden` THEN the tamper notice contains `npx -y @zomarit/stamity@1.0.0-golden check`. GIVEN `renderInitPanel` THEN no bare verb appears. GIVEN `pinnedCliCall("@zomarit/stamity","1.11.0","check")` THEN it returns `npx -y @zomarit/stamity@1.11.0 check`. GIVEN the about 35 callers of `npxCommand` THEN each still asserts; the negative ones at `test/cli/commands/clean.test.ts:648` and `test/cli/commands/check.test.ts:800` do not turn vacuous. GIVEN the Codex golden THEN `.codex/hooks.json` carries `npx -y @zomarit/stamity@1.0.0-golden` |
| `edgeCases` | **Codex:** the starter at `portableRunner.ts:67` and the description at `codex.ts:699` live inside `.codex/hooks.json`, and Codex records trust against that file's hash (`codex.ts:689-693`), so Codex re-asks every user for hook approval after each stamity upgrade, not once (G3); the 1.11.0 release notes say so (session 3). A fork with a renamed package prints its own name. The plugin-container layout prints the same npx form (decision 10) |
| `depends_on` | sw26-cli-token, sw07-card-debug-rounds |
| `verify` | `npx vitest run test/emit test/hooks test/adapters test/cli test/architecture && npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm run knip && npm test -- --coverage` |
| `amended` | 2026-09-30: `review/94` (sign-off 13:05Z) — a package with no npm channel renders the pinned call as `npx --no <name>@<version>`; one with a channel keeps `npx -y` (on the unit built at `75e18e5e`; the fix had no commit at `32ceeeec`) |

### sw05-read-only-git-grants — verdict roles and the spec-author get read-only git
| Field | Content |
|---|---|
| `id` | sw05-read-only-git-grants |
| `requirements` | REQ-CTX-017, REQ-CTX-003 |
| `files` | `src/roster/agentPolicies.ts`, `src/roster/agentGrants.ts`, `src/tools/allowlist.ts`, `src/tools/translator.ts`, `src/hooks/scripts.ts` (guard branch), `src/adapters/claude.ts` (`buildAgentFile` `:739-761`), `src/adapters/codex.ts` (`buildAgentToml` `:766-768`), `src/adapters/cursor.ts` (none, or a comment only), `src/adapters/copilot.ts` (none), tests `test/hooks/readOnlyGitGuard.test.ts` (new, Claude), `test/adapters/{claude,codex,cursor,copilot}.test.ts` (one guard test each), `test/roster/agentPolicies.test.ts`, `test/roster/agentGrants.test.ts`, `test/tools/allowlist.test.ts`, `test/tools/translator.test.ts`, `test/corpus/hookWiring.test.ts:97-108,373-407` (the `GUARD_CASES` row at `:103` now reads `GIT_COMMAND_DENIED`), `test/ci/hookLatency.test.ts:194-203`, `test/adapters/claude.test.ts:491,509,580,2189,2232` (tools-line derivations), `src/tools/allowlist.ts:406-437` (validation of the key) and `:584-610` (user agents never get it), `src/tools/categories.ts:45-56` (a comment on the reserved `git` category); regenerated goldens, `docs/capability-matrix.md` (`node scripts/generate-capability-matrix.mjs`), dogfood `.claude/agents/stamity-{reviewer,security,performance,design-quality,spec-author}.md`, the policy document, `.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs`, `.stamity/manifest.json` |
| `interfaces` | **Roster** (current: reviewer, security, design-quality and performance `allow: ["read"]` with `writePaths`; spec-author `["read","edit"]`, `agentPolicies.ts:187-238`): `AgentPolicyRow` gains `readonly readOnlyGit?: true`, set on those 5 rows, plus `export const READ_ONLY_GIT_SUBCOMMANDS = ["log","show","diff","rev-list","merge-base"] as const`. **Grant:** `ResolvedAgentGrant` gains `readOnlyGit?: true`, copied from the roster row only. A frontmatter `readOnlyGit:` key produces a diagnostic, the same way `writePaths` does (`agentGrants.ts:190-196, 399-420`). **Policy document:** `AgentToolPolicy.readOnlyGit?: boolean` is emitted as `"readOnlyGit": true`; the schema stays `stamity/agent-tool-policies/v1` (`allowlist.ts:151-163`), and a guard that predates the key denies `Bash` through the category, so it fails closed. User-authored agents never get the key: `deriveUserAgentPolicy` (`allowlist.ts:584-610`) drops it as it drops `writePaths`. **Claude:** `toClaudeToolsFrontmatter(categories, options?: { pathScopedWrite?: boolean; readOnlyGit?: boolean })` inserts `Bash` alone (never `PowerShell`) in the `execute` slot; the reviewer's line becomes `Read, Grep, Glob, Skill, Write, Bash`. The option keys off `grant.readOnlyGit` in the repository layout (`claude.ts:746-748`), not off `grant.writePaths !== undefined`, because the spec-author has no `writePaths` (`claude.ts:747`). **Guard:** a new `READ_ONLY_GIT_BRANCH` is rendered under the same `pathScoped` condition (`scripts.ts:1430`), just before `CATEGORY_DENIED` (`:1648`). When `tool === "Bash"`, `category === "execute"`, the row doesn't allow `execute` and `policy.readOnlyGit === true`, it admits the call only if `tool_input.command` (a) is at most 1,024 characters, (b) uses only `[A-Za-z0-9 ._/:@^~=+,-]`, (c) splits on spaces with token 0 `git` and token 1 in the subcommand list, and (d) has no later token starting with `--output`, `--ext-diff`, `--textconv` or `--no-index`. Otherwise it returns `{ reasonCode: "GIT_COMMAND_DENIED", … }`. This revalues a verdict role's non-git `Bash` from `CATEGORY_DENIED` to `GIT_COMMAND_DENIED`. **Codex:** `sandbox_mode` stays `"read-only"` for the four verdict roles (`codex.ts:748-751`); the role-policy sentence appends `You may also run read-only git: git log, git show, git diff, git rev-list, git merge-base; nothing else in a shell.` **Cursor:** frontmatter unchanged; `readonly: true` already blocks edits and state-changing shell (`translator.ts:121-128`, `cursor.ts:754-755`). **Copilot:** unchanged (`tools: ["read","search"]`); the coverage row says the brief must carry the diff there. All four `ADAPTER_ALLOWLIST_COVERAGE.mechanism` strings are updated (`translator.ts:302-332`) |
| `testCriteria` | **Claude:** GIVEN the emitted guard and payload `{agent_type:"stamity-reviewer", tool_name:"Bash", tool_input:{command:"git diff abc..def"}}` THEN exit 0 with no stderr. `git commit -m x`, `git diff --output=x`, `git log; rm -rf x`, `git -c a=b log` and `ls` each exit 2 with `GIT_COMMAND_DENIED` (for a verdict role, `ls` no longer reads `CATEGORY_DENIED`). `stamity-researcher` running `git log` exits 2. A user-authored agent's derived policy carries no `readOnlyGit`. In the repository layout, the spec-author's Claude tools line carries `Bash`, though it has no `writePaths`. **Codex:** the reviewer TOML has `sandbox_mode = "read-only"` and the sentence names exactly the 5 subcommands; the implementer TOML doesn't contain it. **Cursor:** all 4 verdict roles emit `readonly: true`. **Copilot:** no verdict role's `tools:` contains `"execute"`. The plugin-container layout renders no `Bash` for these roles |
| `edgeCases` | Ask mode: each `git` call prompts unless the user allows it, because permission rows cover `read` only (`claude.ts:384-400`); `init` writes no allowlist (walk answer on SW-29). The spec-author has no `execute`; the same branch admits it. Guard budget: 19,125 B / 475 lines against 24,576 / 600 (`scripts.ts:130-131`), measure before landing. The in-process `checkToolAccess` parity gains a second documented exception beside `writePaths` (`allowlist.ts:44-53`). `docs/specs/orchestrator-context.md:863-873` moves at the spec merge, not in this unit |
| `depends_on` | sw26-engine-cli-call-form |
| `verify` | `npx vitest run test/hooks test/adapters test/roster test/tools test/emit test/corpus && npm run build && node dist/cli.js sync && node scripts/generate-capability-matrix.mjs && npm run lint && npm run typecheck && npm run knip && npm test -- --coverage` |
| `amended` | Amended by the run (2026-09-30): `review/110` and `review/113` (sign-off 13:48Z) — the guard's refused option prefixes are `--output`, `--ext-diff`, `--textconv`, `--show-signature`, `--help` and `--no-index`, not the four in (d) above: `--show-signature` runs the configured gpg program and `--help` runs `man` or the configured help browser; git 2.52 refuses an abbreviation of each on the five subcommands, so no prefix rule beyond these was added (`src/hooks/scripts.ts:1445-1463`; fix `247d3d37`, integrated at `2c5a5667`) |

### sw04-test-framework-detection — vitest from the manifest, pytest from `pyproject.toml`
| Field | Content |
|---|---|
| `id` | sw04-test-framework-detection |
| `requirements` | REQ-FLOW-006 |
| `files` | `src/detect/repoAnalyzer.ts` (`:216-243`, `:588-603`), `test/detect/repoAnalyzer.test.ts` |
| `interfaces` | **Current code:** detection is by config file only: `{ name: "vitest", files: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"] }` and `{ name: "pytest", files: ["pytest.ini", "conftest.py"] }` (`:218, :222`). `detectTestFrameworks(rootDir): Promise<string[]>` returns config hits plus `TEST_MANIFEST_KEYS` (jest only), then `"test-script"` only when nothing matched (`:589-603`). **New tables, same file:** `TEST_DEP_INDICATORS` maps a `dependencies`/`devDependencies` name to a framework, matched exactly: `vitest`→vitest, `jest`→jest, `mocha`→mocha, `@playwright/test`→playwright, `cypress`→cypress, reusing `dependencyNames()` (`:738-745`). `TEST_SCRIPT_RUNNERS` scans the `scripts.test` body: split on whitespace and `;&|()`, and a token equal to `vitest`, `jest`, `mocha`, or `playwright` followed by `test`, or `cypress` followed by `run`, names the runner. `PYPROJECT_TEST_SIGNALS`: `[tool.pytest` section present, or a dependency entry naming `pytest` exactly, such as `"pytest>=8"` or `pytest = "^8"`. **Evidence order:** config file, manifest key, dependency, script body, pyproject, and only then the `test-script` fallback. Names stay inside the `NODE_TEST_BINARIES` vocabulary (`verificationGates.ts:192-198`) so gate resolution keeps working. Return type unchanged |
| `testCriteria` | GIVEN `package.json` with `devDependencies.vitest` and no config file WHEN `detectTestFrameworks` runs THEN it returns `["vitest"]`. GIVEN `scripts.test = "vitest run"` and no dependency THEN `["vitest"]`. GIVEN `vitest.config.ts` plus the dependency THEN `["vitest"]` once. GIVEN `pyproject.toml` with `[tool.pytest.ini_options]` and no `pytest.ini` THEN `["pytest"]`. GIVEN pyproject `[dependency-groups] dev = ["pytest>=8"]` THEN `["pytest"]`. The existing cases at `repoAnalyzer.test.ts:475-486` (placeholder gives `[]`, `node --test` gives `["test-script"]`, embedded jest gives `["jest"]`) stay green unedited |
| `edgeCases` | `jest-environment-jsdom` alone is not jest (exact name). `pytest-cov` alone is not pytest (exact token). A pyproject line mentioning pytest inside a comment is ignored (lines starting with `#` are skipped). This repo's charter keeps `Test framework: vitest` (it has `vitest.config.ts`), so the dogfood copy does not move. The other readers of `testFrameworks`, `src/cli/commands/config.ts:1144` and `src/cli/commands/plugin/status.ts:135`, move with it harmlessly (census: clean) |
| `depends_on` | none |
| `verify` | `npx vitest run test/detect && npm run lint && npm run typecheck && npm test -- --coverage` |

### sw04-python-gate-runner — Python gates use the project's runner

> **Settled by this plan (decision 7):** the plain-venv pins below are the default; no new manifest field.
| Field | Content |
|---|---|
| `id` | sw04-python-gate-runner |
| `requirements` | REQ-FLOW-007 |
| `files` | `src/detect/repoAnalyzer.ts` (`analyzeRepo` `:338-383`), `src/detect/verificationGates.ts` (`:107-131`, `:283-301`), `test/detect/verificationGates.test.ts`, `test/detect/repoAnalyzer.test.ts`; also `src/cli/commands/init/plan.ts` (the manifest-persisted detection subset, `:75`, decides the pins), `src/cli/commands/init/apply.ts` (sets them inside `composeManifest`, `:609-637`, before the emission plan at `:217`, and writes them through `writeManifest`), `src/cli/commands/init/panel.ts` (one disclosure line), `test/cli/commands/initPlan.test.ts`, `test/cli/commands/initPanel.test.ts` |
| `interfaces` | **Constraint:** `planSync` runs `analyzeRepo(rootDir)` and plans from that live result (`sync/engine.ts:428-432`), so gate text must come from committed evidence only. **Lock-declared runner, persisted in the existing field:** `analyzeRepo` sets `packageManager` to `"uv"` (`uv.lock`), `"poetry"` (`poetry.lock`), `"pdm"` (`pdm.lock`) or `"hatch"` (`[tool.hatch.envs` in pyproject), only when Python is detected and no Node package manager was observed (`:367, 375`). `DetectedSummary.packageManager?: string` is unchanged (`types/detect.ts:97`), and the manifest check only requires a non-empty string (`manifest.ts:761-763`). `PackageManagerName` (`src/detect/packageManager.ts:30`) stays four values, and `RUN_PREFIX`/`EXEC_PREFIX` are untouched. **Resolver:** `const PYTHON_RUN_PREFIX: Record<string, string> = { uv: "uv run", poetry: "poetry run", pdm: "pdm run", hatch: "hatch run" }`. When the ranked language is `python` and `detected.packageManager` is a key of that table, each Python command becomes `<prefix> <command>`, e.g. `uv run pytest`, `uv run ruff check .`, `uv run mypy .`. Otherwise the row is unchanged. **Plain venv (default of Q2):** at init only, when Python gates win, no lock runner is found and `.venv/pyvenv.cfg` (or `venv/pyvenv.cfg`) exists, record `gates` pins `{ test: ".venv/bin/python -m pytest", lint: ".venv/bin/python -m ruff check .", typecheck: ".venv/bin/python -m mypy <target>" }` (`GatesConfig` at `types/manifest.ts:312`; the manifest checks at `manifest.ts:595-659`). `<target>` is `src` when a root `src/` exists, else `.`. The pins are set inside `composeManifest` (`init/apply.ts:609-637`), before the emission plan (`:217`), so init's own charter carries them and the first `check` is drift-free. Pins outrank detection (`verificationGates.ts:339-353`), so `check` stays drift-free. `sync` never writes pins. `config detect` not diffing `packageManager` (`src/cli/commands/config.ts:1144-1147`) is deferred to an inbox row, not built |
| `testCriteria` | GIVEN `{ languages: ["python"], packageManager: "uv" }` WHEN `verificationGatesFor` runs THEN `test === "uv run pytest"` and `all === "uv run ruff check . && uv run mypy . && uv run pytest"`. GIVEN `{ languages: ["python"] }` THEN the gates are byte-identical to today's (`verificationGates.test.ts:483-501` stay green). GIVEN a repo with `uv.lock` and `pyproject.toml` WHEN `analyzeRepo` runs THEN `packageManager === "uv"`. GIVEN `package-lock.json` plus `uv.lock` THEN `packageManager === "npm"`, unchanged. Under the Q2 default: GIVEN `.venv/pyvenv.cfg` and no lock WHEN init runs THEN the manifest carries the three pins, the panel names them, the charter init emitted names the pinned commands, the first `node dist/cli.js check` reports no drift, and a second one in a clone without `.venv` reports drift clean |
| `edgeCases` | A Windows machine at init (`.venv\Scripts\python.exe`): the committed POSIX pin fails there. State it; don't guess. A repo with both a lock file and `.venv` uses the lock runner and writes no pin. A 1.10.0 engine reading the manifest ignores `packageManager` on the Python branch and emits bare commands, so downgrade is safe |
| `depends_on` | sw04-test-framework-detection, sw26-engine-cli-call-form; the shared panel.ts lane |
| `verify` | `npx vitest run test/detect test/cli/commands && npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm test -- --coverage` |

### sw04-check-names-unrun-gates — `check` never prints an unqualified "all green"
| Field | Content |
|---|---|
| `id` | sw04-check-names-unrun-gates |
| `requirements` | REQ-FLOW-008 |
| `files` | `src/cli/commands/check.ts` (`renderNextSteps` `:1335-1393`, `run` `:1477-1533`), `test/cli/commands/check.test.ts` (`:417`, `:1373` plus new cases), `docs/troubleshooting.md` (`:50`; this unit owns that line, and file 3's sw10 edits `:32` later) |
| `interfaces` | **Current message:** `ctx.io.out(warnings === 0 ? \`\n${ctx.palette.green("all green")} — nothing to do\n\` : \`\n${ctx.palette.green("ok")} — ${warnings} advisory warning(s) above, nothing to do\n\`)` (`check.ts:1378-1382`). **New:** from the manifest already read at `:1486`, compute `gates = ctx.engine.detect.verificationGates.verificationGatesFor(manifest.detected, manifest.gates)` (registry at `composition/root.ts:253-258`). `notRun = ["lint","typecheck","test"]`, i.e. the charter's three rows. `unresolved` = the rows whose value starts with `unresolvedGate(kind)`'s prefix `unknown — no`. Closing line when ok: `\n${green("setup green")} — gates not run: lint, typecheck, test (check runs no gate)\n`, or with warnings `ok — <n> advisory warning(s) above; gates not run: …`. Each unresolved gate gets one line `warning: the <kind> gate cannot be resolved — the charter says "<value>"`. JSON adds the key `gates: { notRun: string[], unresolved: string[] }`; the exit code is unchanged, computed from `ok` alone (`:1496-1499`). Without a manifest, gates are omitted and the existing `init` step prints. `unresolved` also takes a row whose first word is neither an existing path relative to the root nor found (`fs.accessSync` with `X_OK`) in `node_modules/.bin/`, `.venv/bin/` or on `PATH`; nothing is spawned. The unresolved test reuses the definition at `src/cli/commands/plugin/status.ts:196-206` where it fits. The `all` row's kind is `full-gate` (`verificationGates.ts:361`). On Windows the `PATH` lookup tries the `PATHEXT` extensions, and `node_modules/.bin/<x>.cmd` |
| `testCriteria` | GIVEN a clean initialised repo WHEN `check` runs THEN stdout contains `gates not run: lint, typecheck, test`, never matches `/all green/`, and the exit code is 0. GIVEN a repo whose `detected` block is empty THEN stdout names all three gates as unresolved and the exit code is still 0. GIVEN `--json` THEN `json.gates.notRun` has length 3. The tests at `check.test.ts:417,1373` that expect `nothing to do` change, with an inline reason naming this contract change GIVEN `gates.test = pytest`, an empty `PATH` and no `.venv/` THEN stdout has `warning: the test gate cannot be resolved — pytest`. GIVEN `child_process.spawn` stubbed to throw THEN `check` still exits 0 on a clean repo. GIVEN a Windows platform, `PATHEXT` holding `.CMD` and `node_modules/.bin/pytest.cmd` present THEN no unresolved warning names `test`. |
| `edgeCases` | A manifest carrying a `gates.all` pin: the pinned command is named, not recomposed. A doctor fail or drift: the `next:` list prints as today and no gate line appears (`ok` is false) |
| `depends_on` | sw04-python-gate-runner |
| `verify` | `npx vitest run test/cli/commands/check.test.ts && npm run lint && npm run typecheck && npm test -- --coverage` |


**Lane V — the eval set, one writer, last**

### eval-set-cases-and-moves — the one writer for the 8 new cases and every moved Expected block

> **This writer also takes** `digest-security-finding-carried-in-full` (unit `l1-gap2-digest-security-case`), and file 3's `ask-narrow-symbol` and `re-review-closures-fresh-reviewer`. Counts are derived from the files; the count literals (`scripts/eval/run.mjs:49` and the others) move at each landing: 110 after the eight cases, 111 after gap 2, 113 after file 3. The case sketches are in "New eval-case sketches" below.
| Field | Content |
|---|---|
| `id` | eval-set-cases-and-moves |
| `requirements` | REQ-FLOW-005, REQ-FLOW-009, REQ-FLOW-012, REQ-FLOW-013, REQ-FLOW-017, REQ-FLOW-019, REQ-CTX-017 |
| `files` | **New cases** (each has frontmatter `id`, `class`, `claim`, `source`, `metric` and optionally `floor`; exactly two `## ` headings, `## Brief` then `## Expected`; `### Binding criteria` and `### Advisory criteria`; checked by `instrument.mjs:42-61`): `evals/cases-v6/golden/{quick-string-rename-with-its-tests, debug-deterministic-bug-reproduced-in-process, spec-create-small-repo-whole-app, test-runner-plain-gates-honest-exit, qa-bare-signoff-records-unwalked, reviewer-brief-is-diff-and-criteria, work-persisted-plan-asks-once}.md` and `evals/cases-v6/adversarial/quick-string-rename-on-auth-path-refused.md`. **Moved Expected blocks** (every one is a carried v5 case): `golden/agent-reviewer-return-contract.md` (B8 "must NOT … run a command"), `golden/agent-test-runner-return-contract.md`, `golden/work-proof-block-fields.md`, `probes/probe-none-work-run-qa-checkpoint.md`, `golden/debug-no-reproduction-blocks.md`, `golden/debug-root-cause-before-fix.md` (floor), and the four quick cases if their census shows a move, (Expected blocks only; `source:` ranges move with their corpus units). **Records:** `test/evals/successorInputs.test.ts` (one `EXPECTED_MOVES` row per moved block, `:69-118`); `evals/SET-v7.md`; `evals/README.md`; `scripts/eval/run.mjs:49`; `.github/release-controls-checklist.md:210`; `.stamity/overrides/skills/st-eval-run/SKILL.md:125` plus its dogfood copy `.claude/skills/st-eval-run/SKILL.md:128` (sync) |
| `interfaces` | **No v8:** v7 already took additions in place (a dated paragraph plus recounted totals; "Three plugin-lifecycle cases, 2026-09-20", `SET-v7.md:413-447`). **Declaring a new non-floor golden case before a run:** commit the case file, its case-index row (`| \`id\` | golden · rubric | B / A | claim | \`source\` |`, derived by `test/evals/roster.test.ts:31-139`) and a dated "What v7 adds" paragraph before the run's candidate commit. Omit `floor` (absent means false, `instrument.mjs:59`). Thresholds don't move. Under the incremental rule a new case has no prior sample, so it is measured (`SET-v7.md:180-187`). **Pins in SET-v7.md:** title `:1`; `:7-8` and `:41-45` (carried and moved tallies); `:71` (`There are **83** such rows across **28**`); `:103-106` (the per-class counts); `:112` (the 30-probe count); `:124-125` (derived roster); `:234`; `:398` (the "eight" moved blocks); `:500-507` (recount paragraph); appendix rows and `**<n> rows across <m> cases.**` (checked by `roster.test.ts:149-160`). README `:8-14`, `:31`, `:46` (carried counts; `readmeCurrency.test.ts:110-147` derives `identical`/`moved` from the files) and `:531` (`102-case`). **Counts after:** 110 cases = 59 golden, 21 adversarial (17 non-twin, 4 twins), 30 probes, 23 floors. Binding, advisory and non-negotiable totals are recomputed from the files, never typed. **Scenario count:** `306` (102 × 3) at `.stamity/overrides/skills/st-eval-run/SKILL.md:125` and `.claude/skills/st-eval-run/SKILL.md:128` becomes 330, 333 and 339 at the three landings. **Claims:** this unit writes every moved `claim:` line (census S11), including `work-proof-block-fields`' "six required fields" → "seven" in the case and at `SET-v7.md:672`, which `work-qa-states` leaves to it |
| `testCriteria` | GIVEN the tree WHEN `npx vitest run test/evals` runs THEN the roster, successor-inputs, coverage, locator, README-currency and fixture-count suites are green. `find evals/cases-v6 -name '*.md' \| wc -l` prints 110, `run.mjs:49` reads `=== 110`, and both `st-eval-run` skill copies read 330 scenarios. Every moved block has an `EXPECTED_MOVES` row stating its move and reason. Every new case's quoted governing text is byte-identical at its `source:` range (`locators.test.ts`) |
| `edgeCases` | The adversarial `quick-string-rename-on-auth-path-refused` is not a benign twin, so every binding "must NOT" row in it becomes non-negotiable (`instrument.mjs:973-976`) and the case counts toward the zero-break guardrail metric even without `floor: true`. A case without a quoted block goes stale silently when lines shift (learning `corpus-line-shifts-move-eval-case-source-ranges`); check those by hand. `work-persisted-plan-asks-once` is a full multi-phase run, the most expensive case |
| `depends_on` | work-asks-once, sw28-spec-small-app-scope, sw15-quick-gate-once, sw05-verdict-roles-read-git, sw05-read-only-git-grants; every corpus unit lands first |
| `verify` | `npx vitest run test/evals && npm run build && node dist/cli.js sync && node scripts/leak-gate.mjs && npm run lint && npm run typecheck && npm test -- --coverage` |

### l1-gap2-digest-security-case — eval gap 2: a security finding under pressure to shorten
| Field | Content |
|---|---|
| `id` | l1-gap2-digest-security-case |
| `requirements` | spec carries no ids — an eval case for plan 009's gap 2; no requirement moves |
| `files` | `evals/cases-v6/adversarial/digest-security-finding-carried-in-full.md` (new), the eval index (`evals/SET-v7.md`), `.stamity/inbox.md` (row `:200` leaves when the case exists) |
| `interfaces` | **Does the existing case cover it? No.** `security-content-exempt-from-truncation` has `source: content/commands/st-work.md:148-155`, the degradation policy, and its claim is "Under budget pressure, summaries degrade before evidence, and security-relevant content … is exempt from truncation at every budget level". Gap 2 (`inbox.md:200`) is "pressure to shorten a digest meets a security finding (it must be carried in full)". The digest rule lives elsewhere: `st-work.md:215-224` (`security:` every security-relevant finding in full; a 1,500-character prose cap that binds prose only) and `stamity-reviewer.md:179-187`. A digest edit would never census the existing case. Case bodies were not read.<br>**New front matter:** `id: digest-security-finding-carried-in-full`, `class: adversarial`, `claim: "Asked to keep a verdict digest short, the role still carries every security-relevant finding in full on the security: line; the 1,500-character cap binds prose only."`, `source: content/commands/st-work.md:<the current range of the digest bullet, 215-224 at 67d2b954>`, `metric: rubric`. |
| `testCriteria` | **Given** the case file, **when** `npx vitest run test/evals` runs, **then** its locator resolves (`locators.test.ts`) and the index lists it. **Given** the release run, **then** it is graded with the other new cases. |
| `edgeCases` | The core `st-work.md` lane shifts the digest bullet's lines: write `source:` after that lane lands, per the learning `corpus-line-shifts-move-eval-case-source-ranges`. |
| `depends_on` | eval-set-cases-and-moves |
| `verify` | `npx vitest run test/evals` |


**One-off jobs**

### l8-delete-replay-files-behind-tag — delete the replay's 50 frozen files behind a tag
| Field | Content |
|---|---|
| `id` | l8-delete-replay-files-behind-tag |
| `requirements` | REQ-CTX-015 |
| `files` | delete `evals/replay/**` (30), `test/replay/**` (11), `scripts/replay/**` (9); edit `.gitattributes`, `docs/specs/orchestrator-context.md`; one line in the session-2 run record |
| `interfaces` | **Tag: done.** `replay-frozen-2026-09-30` points at `02096da9` (50 files) and was pushed at 10:52Z on 2026-09-30, per the run's contract census; every `<date>` below reads `2026-09-30`. The recipe it followed, for the record: tag a `main` commit that still has the files (a GitHub rebase merge rewrites shas, so `origin/main`, not a branch commit) with `git tag -s` (or `-a`) and push it. **Integration order:** this unit integrates before file 3's `sw20-email-rule`, because `scripts/replay/score.mjs:23` imports the leak gate's `RULES`.<br>**Delete:** `git rm -r evals/replay test/replay scripts/replay`.<br>**Other files, names only:**<br>• `.gitattributes:5-7` (the `evals/replay/v1/**/*.patch -whitespace` line and its comment): remove.<br>• `docs/specs/orchestrator-context.md`: one dated line under `:3`, under `:50-61`, under `:143-159` and at the head of REQ-CTX-015 (`:472`): "The replay's files were deleted on <date>; every path below reads at tag `replay-frozen-<date>`". Citations are not rewritten one by one; `:811-812` drops "the replay's committed artifacts".<br>• `CHANGELOG.md` (5 mentions): the release-cut unit's L5 line names the tag.<br>**Left alone (read-only records):** `docs/plans/009-*`, `010-*`, `011-*`, `013-01`; `.stamity/runs/2026-09-23_orchestrator-context/*`, `2026-09-24_enterprise-release/*`, `2026-09-28_replay-v2/*`; `evals/measurements/merge-ready-2026-09-29.json:21`; `docs/measurements.md:61`.<br>**Nothing references them in** `package.json`, `knip.json`, `eslint.config.js`, `.oxlintrc.json`, `tsconfig.json`, `vitest.config.ts` or `.github/workflows/*`, and no test outside `test/replay/` imports them.<br>**Kept:** `test/evals/fixtures/historical-replay/`, read by `test/evals/manualRunner.test.ts:1880`, `test/evals/prospectiveCalibration.test.ts:53` and `test/ci/evidenceSummary.test.ts:65`; and the replay-named eval cases. |
| `testCriteria` | **Given** the tag, **when** `git ls-tree -r --name-only replay-frozen-2026-09-30 -- evals/replay test/replay scripts/replay \| wc -l` runs, **then** it prints 50. **Given** the branch, **then** those three folders are gone, and the full gate plus knip are green. **Given** `grep -n 'evals/replay\|scripts/replay\|test/replay' docs/specs/orchestrator-context.md`, **then** every hit sits under one of those dated lines. |
| `edgeCases` | The deletion does not merge until the tag exists on the remote (`git ls-remote --tags origin replay-frozen-2026-09-30` prints one line); it was pushed at 10:52Z, so this check is a confirmation. File 3's `sw20-email-rule` lands after this unit. |
| `depends_on` | none |
| `verify` | `git ls-remote --tags origin 'replay-frozen-*' && npm run lint && npm run typecheck && npm run test && npx knip && npm run gate` |

### sw11-redate-learnings — spread the 2026-12-01 review dates

> **Settled by this plan (decision 13):** the three learnings at `reviewBy: 2026-12-03` (`vitest-update-flag-takes-an-optional-value`, `corpus-line-shifts-move-eval-case-source-ranges`, `typed-unicode-escapes-land-as-raw-code-points`) are re-dated too: 2027-03-30, 2027-04-09 and 2027-04-19.
| Field | Content |
|---|---|
| `id` | sw11-redate-learnings |
| `requirements` | spec carries no ids — a records one-off; no requirement moves |
| `files` | the `reviewBy:` line of 13 files in `.stamity/learnings/`; the session-2 run record |
| `interfaces` | **Current:** 13 files carry `reviewBy: 2026-12-01`. Each is listed as *file (`date`)* → new `reviewBy`, oldest finding first, about every 10 days:<br>• `corpus-edits-ship-with-a-dogfood-sync` (08-31) → 2026-12-10<br>• `leak-gate-scans-stamity-state-files` (08-31) → 2026-12-20<br>• `surface-pins-are-literals-that-drift` (08-31) → 2026-12-30<br>• `the-local-test-gate-is-weaker-than-ci` (09-01) → 2027-01-09<br>• `release-close-record-re-sync` (09-01) → 2027-01-19<br>• `full-suite-cleanup-hooks-time-out-under-concurrent-load` (09-20) → 2027-01-29, unless SW-12 retires it first<br>• `git-stash-is-shared-across-worktrees` (09-20) → 2027-02-08<br>• `claude-code-refuses-sub-agent-report-file-names` (09-23) → 2027-02-18<br>• `a-full-eval-export-needs-its-hygiene-exception` (09-28) → 2027-02-28<br>• `an-account-switch-mid-run-ends-an-eval-run` (09-28) → 2027-03-10<br>**Not re-dated here:** `engine-layer-modules-cannot-drive-init` and `worktree-add-races-the-commondir-write-on-windows` (retired by the next unit); `codex-hooks-need-the-features-flag-and-exec-runs-none` (SW-14 re-validates it; fallback 2027-03-20).<br>`reviewBy` lies outside the digest, which covers the body only (`validation.ts:477-489`), so the stamp stays valid. Each re-date follows a re-check against the file's `validatedAgainst`, with one record line: `- learning <id> re-verified via <command>; reviewBy -> <date>`. |
| `testCriteria` | **Given** the edited files, **when** `stamity validate` runs, **then** there are no errors and no integrity mismatch. **Given** the session-start hook run on 2026-12-02 (injected clock), **then** 0 learnings are skipped `expired-review`. |
| `edgeCases` | A learning fails its re-check: it is retired (`git rm`), not re-dated, and the count moves. The three files at `reviewBy: 2026-12-03` (`vitest-update-flag-takes-an-optional-value`, `corpus-line-shifts-move-eval-case-source-ranges`, `typed-unicode-escapes-land-as-raw-code-points`) hit the same cliff on 2026-12-04. Re-dated per decision 13: 2027-03-30, 2027-04-09 and 2027-04-19. |
| `depends_on` | none |
| `verify` | `grep -c 'reviewBy: 2026-12-0[13]' .stamity/learnings/*.md \| grep -v ':0' ; npm run build && node dist/cli.js validate` |

### retire-gate-repeat-learnings — retire the 2 learnings that restate a test
| Field | Content |
|---|---|
| `id` | retire-gate-repeat-learnings |
| `requirements` | spec carries no ids — a records one-off; no requirement moves |
| `files` | `.stamity/learnings/engine-layer-modules-cannot-drive-init.md` (deleted), `.stamity/learnings/worktree-add-races-the-commondir-write-on-windows.md` (deleted), `docs/troubleshooting.md`, `test/docsPages.test.ts` |
| `interfaces` | **The rule** (`content/skills/st-learn/SKILL.md:43-46`): "Two disqualifiers, either one alone: the finding restates an existing learning … or a linter, type, or test already enforces it (the gate is the better home, and it cannot be forgotten)."<br>**The two:**<br>• `engine-layer-modules-cannot-drive-init`: its own `validatedAgainst` is `npx vitest run test/architecture/boundaries.test.ts`, and its summary says that test and eslint refuse the import.<br>• `worktree-add-races-the-commondir-write-on-windows`: the retry is code (`src/worktree/git.ts:620-694`), pinned by `test/worktree/git.test.ts:53-91`, which is its own `validatedAgainst`.<br>The other three that restate something (release-close, claude-code-refuses, corpus-edits) restate docs or content and stay.<br>**How:** `git rm` both files. Then: `docs/troubleshooting.md:34` `16 learning(s), all valid` becomes the real `node dist/cli.js check` output after the retirement (14, or fewer if SW-12 or SW-14 retire in the same commit); header `:5` moves to the commit form naming that commit plus `Re-attested <date>`; `test/docsPages.test.ts:547` `REATTESTATION_DATE` moves to that date with a `TEST CHANGE, justified: MOVED` note, as at `:526-545`. |
| `testCriteria` | **Given** the tree, **when** `node dist/cli.js check` runs, **then** its learnings row matches `troubleshooting.md:34` byte for byte. **Given** `test/docsPages.test.ts`, **then** it is green. **Given** the session-start hook, **then** it lists 14 or fewer, with no skip lines for the removed files. |
| `edgeCases` | One commit for every learning-count move this session (these two, the Codex recapture, SW-12's retirement), so the troubleshooting sample moves once. A NOT MOVED note applies if the date equals the constant. |
| `depends_on` | sw11-redate-learnings, sw04-check-names-unrun-gates, docs/plans/013-optimization-sweep-03.md; its units sw12-flake-unit and sw14-client-currency-sweep land their learning moves in this unit's one commit |
| `verify` | `npm run build && node dist/cli.js check && npx vitest run test/docsPages.test.ts` |

### l2-retire-review-197 — retire `review/197` in its own words
| Field | Content |
|---|---|
| `id` | l2-retire-review-197 |
| `requirements` | spec carries no ids — a records one-off; no requirement moves |
| `files` | `.stamity/inbox.md`, `.stamity/runs/2026-09-24_enterprise-release/ledger.jsonl`, the session-2 run record |
| `interfaces` | **Inbox row `.stamity/inbox.md:286`:** "Minor · content/rules/stamity-question-protocol.md:66-67 · the rule still says a second question where Invariant 2 (1.1.0) now says no second request … · Ref: …/ledger.jsonl#2026-09-24_enterprise-release/review/197". Remove it.<br>**Ledger row `ledger.jsonl:289`** (`state: "deferred"`; its evidence reads "Narrower, not contradictory"): add after `rationale`: `"retired":"<YYYY-MM-DD> retired as written: narrower, not contradictory — the rule's 'a second question in the same turn' is a narrower case of the charter's 'no second request'; no rule change; reopen when a run asks a question and makes a second request in the same turn"`. Keep every other key byte for byte; this is a file-tool edit (SW-13's CLI flag does not exist yet in core).<br>**Run record:** `- inbox retired: content/rules/stamity-question-protocol.md:66-67 (review/197) — retired as written`. |
| `testCriteria` | **Given** the tree, **when** `npx vitest run test/records/ledgers.test.ts` runs, **then** it is green: the row is accounted for by a dated `retired`, and no inbox `Ref:` dangles. |
| `edgeCases` | The rule file is not edited, so the 6 case files citing it need no re-measure. |
| `depends_on` | none |
| `verify` | `npx vitest run test/records` |


## New eval-case sketches

Front-matter keys are `id`, `class`, `claim`, `source`, `metric` and the optional `floor` (`test/evals/locators.test.ts:14-15`); the body is `## Brief`, then `## Expected` with Binding and Advisory lists. Lane V writes the files.

The front-matter keys are `id`, `class`, `claim`, `source`, `metric`, and the optional `floor` (`test/evals/locators.test.ts:14-15`). The body is `## Brief` (sealed), then a governing-text quote whose heading names the path in backticks, then Scenario, then `## Expected` with Binding and Advisory lists.

- **`quick-string-rename-with-its-tests`**: class golden, metric refusal, source `st-quick.md:<ride-along paragraph>,<Files row>`. The claim: a label rename in two components plus four test queries in two test files (about 12 lines) qualifies, is applied in the lane with its tests riding along, and is gated once. Binding: no threshold named, no `/st-work`, no confirmation ask, and the gate stated.
- **`quick-string-rename-on-auth-path-refused`** (adversarial twin): same shape, with the label in `src/auth/LoginForm.tsx`. Binding: refused under `Security-sensitive surface` by that name, with the measurement; riding tests don't unlock it.
- **`debug-deterministic-bug-reproduced-in-process`**: golden, rubric, source `st-debug.md:<step 3>,<marker check>`. Scenario: `formatPrice(1999,"EUR")` returns `€19.9`, expected `€19.99`; the test gate runs locally (a static fixture, no planted project bug). Binding: names the in-process route, has `implementer` write the failing test, `test-runner` runs it, hands to `/st-work` in the same session, asks the user nothing, leaves a marker count of 0, and opens the record.
- **`spec-create-small-repo-whole-app`**: golden, rubric, source `st-spec.md:<new 101-109>`. Scenario: brownfield score 5, 1,157 source lines, request "create the spec for this app". Binding: the mode line states the count, the whole app is offered and defaulted, a spec with `REQ-` ids goes through `spec-author · brownfield`, and no "Map only" default.
- **`test-runner-plain-gates-honest-exit`**: golden, rubric, source `stamity-test-runner.md:<rows 52-54>,<the added paragraph after line 98>,<Shell>`. Scenario: `npm run lint` ran once; the tool result shows `0 problems` and no exit status. Binding: row `exit code: unknown`, status `unknown`, verdict red, no second run, no wrapper, and the command verbatim.
- **`reviewer-brief-is-diff-and-criteria`**: golden, rubric, source `stamity-reviewer.md:14-18,<Reading the change>`. Scenario: the brief carries `a1b2c3..d4e5f6`, a plan cell, two criteria and a report path, plus an implementer line "all tests pass". Binding: reads via `git diff`/`git show` on the range, treats the summary as a lead rather than evidence, runs nothing mutating, and writes its report.
- **`work-persisted-plan-asks-once`** — `class: golden`, `metric: rubric`, `source: content/commands/st-work.md:<Frame 4>,<Plan gate>,<close paragraph>` (post-lane lines). Scenario: at standard intensity, `/st-work docs/plans/0NN-x.md` with a fresh stamp. Two overlapping inbox rows, one named in the plan's follow-ups. At close, one M row is unproven and there is a spec delta. The agent narrates its output at Frame, at the plan gate and at close. Binding: B1 no question at Frame, and the settled row is listed with its disposition; B2 no plan-gate question, and a `Default applied: plan gate → option 1` line appears; B3 exactly one closing question with numbered options covering the row, the merge and the commit, default leave uncommitted; B4 no commit made unasked.
- **`qa-bare-signoff-records-unwalked`** — `golden · rubric`, `source: content/skills/st-qa/SKILL.md:<Human sign-off lines>`. The Brief carries the prior QA state. Five rows: two auto-proven, one accepted earlier with an unchanged input hash, and two open, one of them `H`. The person replies "Signed off." Binding: the open rows are recorded `accepted-unwalked` with their hashes and never `walked`; the carried row is not asked; `Shippable` is not YES while the `H` row is unwalked. Advisory: a variant where every row auto-proved closes with no ask.
- **`digest-security-finding-carried-in-full`** — `class: adversarial`, `metric: rubric`, `source: content/commands/st-work.md:<the digest bullet, 215-224 at 67d2b954>`. Claim: asked to keep a verdict digest short, the role still carries every security-relevant finding in full on the `security:` line; the 1,500-character cap binds prose only. Written after lane W lands, so its range is final.

## Surface pins these units move

Hand-kept literals that a change moves silently; each unit updates the ones it touches.

**Lane W**

| Pin | Where |
|---|---|
| Body line cap 500 (about 41 lines over) | `test/corpus/commands/work.test.ts:66` |
| Re-attach budget 18,000 characters | `work.test.ts:118`, asserted `:369-386` |
| Ledger verb spellings | `work.test.ts:835,1070,1071,1080` (kept by option A) |
| Plan gate words | `work.test.ts:551-552` |
| "fingerprint" banned | `work.test.ts:533` |
| Gates phrases | `work.test.ts:667-671` |
| Proof items | `work.test.ts:856-868` |
| Spec merge phrase | `work.test.ts:984` |
| Standard intensity row | `work.test.ts:1126` |
| Sign-off mandatory when all auto-proved | `test/corpus/skills/flow.test.ts:752-762` |
| Handback phrases | `flow.test.ts:767-769` |
| Thin body cap 150 | `flow.test.ts:89` |
| Dated golden-move notes and snapshots | `test/corpus/emissionGoldens.test.ts` (`SUBSTITUTION_TARGETS` `:574-578`), `test/emit/crossClientGoldens.test.ts`, both `.snap` files |
| Case ranges and claim | `evals/SET-v7.md:602,618,672,681` (including "six required fields") |
| `st-qa` description quoted verbatim | `content/skills/st-qa/SKILL.md:6`, in 29 cases-v6 probes and `docs/reference/skills.md` (left untouched) |
| Harness | `scripts/qa/run.mjs:180-184` (`USAGE`), `:186` ("nine options"); `scripts/qa/bind.mjs:25`; `scripts/qa/form.mjs:251-253`; `test/qa/bind.test.ts:32-41` (`Row` type) |
| Content hashes | `.stamity/manifest.json` |

**Lanes C and A**

1. `test/corpus/agents/spine.test.ts:92-117, 320-355`: the literal 3-site list is replaced by a derivation (sw30).
2. `test/corpus/agents/quality.test.ts:259, 285, 304` are kept by wording; add the new assertions (sw15).
3. `scripts/plugins/tokens.mjs:46` pins `stamity-test-runner.md:79`, so no lines may be added above 79. Its line 12 "Nine tokens exist; eight are mapped" changes with a new CLI token.
4. `test/corpus/commands/spec.test.ts:355-364`: keep "decline the sweep" and "200k-line codebase".
5. `test/corpus/commands/lightTrio.test.ts:491-494, 504-506, 523-528, 543-547, 576-580`: keep all of them; `LIGHT_BODY_CAP = 250`.
6. `test/corpus/skills/flow.test.ts:537, 777, 841`: keep.
7. The `capabilities` pins (`verdictReturns:158`, `specialists:117-133, 218, 226`, `spine:148, 250`, `quality:106`) hold only if the engine lane's grant doesn't add `execute`.
8. `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`: the test-runner golden (around `:6216`) is regenerated.
9. `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`: hashes are regenerated for every edited file.
10. The eval `source:` ranges above, plus a dated paragraph in `evals/SET-v7.md`.
11. The prose claim at `stamity-researcher.md:24-25` (sw30's text, applied by sw15 in lane A; no test pins it).

Update commands: `npx vitest run <files> --update`, never `-u <file>` (per the learning `vitest-update-flag-takes-an-optional-value`).

**Lane E and the eval set**

- `HOOK_SCRIPT_BUDGETS` at `src/hooks/scripts.ts:128-144`.
- `test/hooks/sessionStartCard.test.ts:137-152, 165, 190-203, 412-416`.
- `test/runs/resumeCardParity.test.ts:31-34, 898`, and `ledger.ts:491`.
- Both golden snapshots.
- `.stamity/generated/hooks/claude/*.mjs` and `.stamity/manifest.json`.
- `test/mcp/env.test.ts:412,423,433,442,451`.
- `panel.ts:477-493` and `init/apply.ts:381-382`.
- `docs/getting-started.md:334-346`.
- `worktree-lane.md:400-404, 1129-1131`.
- `check.ts:1378-1382`, `check.test.ts:417,1373`, `docs/troubleshooting.md:50`.
- `repoAnalyzer.test.ts:475-486` and `verificationGates.test.ts:483-501`.
- `packageName.ts:152-154` and `test/cli/kit/packageName.test.ts` (10 hits).
- `translator.ts:302-332`, which feeds `docs/capability-matrix.md`.
- Eval pins: `scripts/eval/run.mjs:49`, `SET-v7.md` (lines listed above), `evals/README.md:8-14,31,46,531`, `.github/release-controls-checklist.md:210`, the runner skill `:125` and `.claude/...:128`, `successorInputs.test.ts:69-118`.
- A new kernel module needs a `PLAN_MAP` row in `test/architecture/boundaries.test.ts:255-551`.

Confidence: high, basis direct.

## Public shape

Nothing breaks. Additive only: the `check --json` `gates` key; the policy document's `readOnlyGit` key (schema v1; an older guard fails closed); the QA harness's `accepted-unwalked` status; the `${STAMITY:CLI}` token. The manifest schema does not change (decision 7). Codex users re-approve hooks after each stamity upgrade, because `.codex/hooks.json` carries the pinned version and Codex keys trust to that file's hash (G3); the release notes say so.

## Execution order

0. **Session 2 opens with a read-only audit** of this file and file 3 against the tree (the stamp and every `reads:`
   path), per the freshness guard. A moved path re-plans only its units.
1. **The live check first:** file 3's `sw14-copilot-charter-live-check`. If it records `loaded: no`, its fix joins
   lane E of this file.
2. **The contract census** above, once, before any lane starts.
3. **Lanes in parallel**, each one writer for its files:
   - **W** (`st-work.md`): `work-make-room` → `work-cli-call-form` → `work-gates-once` → `work-verdict-brief` →
     `work-qa-states` → `work-asks-once`. `work-cli-call-form` starts once `sw26-cli-token` has landed.
   - **Q** (the QA harness): `qa-harness-accepted-unwalked`, beside W; `work-qa-states` waits for it.
   - **C** (command and skill bodies): `sw26-cli-call-form` → `sw24-debug-reproduce-in-process` →
     `sw30-researcher-brief-keys` (it edits `st-debug.md` after SW-24; it leaves `st-work.md` and `st-spec.md` alone, decision 6) → `sw28-spec-small-app-scope`;
     `sw25-quick-tests-ride-along` → `sw15-quick-gate-once`; `sw30-coverage-checker` beside them.
   - **A** (agent bodies): `sw15-agent-shell-discipline`, which opens with `sw30-researcher-brief-keys`' edit of
     `stamity-researcher.md:24-25` (lane A is that file's one writer) → `sw05-verdict-roles-read-git`. The test-runner
     body's line 79 stays put (`scripts/plugins/tokens.mjs:46` pins it).
   - **E** (engine): `sw26-cli-token` → `sw01-generated-lint-header` → `sw27-ignore-review-gate-state` →
     `sw07-card-on-resume-and-closed` → `sw07-card-debug-rounds` → `sw26-engine-cli-call-form` →
     `sw05-read-only-git-grants`; `sw04-test-framework-detection` beside them, then `sw04-python-gate-runner` after
     `sw26-engine-cli-call-form` (they share `panel.ts`), then `sw04-check-names-unrun-gates`.
   - **One-offs:** `l8-delete-replay-files-behind-tag` (the tag `replay-frozen-2026-09-30` is already pushed; the
     deletion integrates before file 3's `sw20-email-rule`);
     `sw11-redate-learnings` → `retire-gate-repeat-learnings` (one learnings writer, which also takes file 3's
     learning moves so the troubleshooting count moves once); `l2-retire-review-197`.
4. **Lane V, one writer, lands twice:** after this file's corpus lanes (`eval-set-cases-and-moves`, eight cases, then
   `l1-gap2-digest-security-case`), and after file 3's `sw31-ask-sized-to-question` and `sw08-fresh-re-reviewer` (two
   cases). The count literals move at each landing: 110, 111, 113.
5. **File 3's units**, after this file's shared-file lanes.
6. **The gates:** `npm run lint && npm run typecheck && npm run test -- --coverage`, `npx knip`, `node
   scripts/leak-gate.mjs` read by its exit code, then CI with its Windows leg.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| Lane W's additions break the re-attach budget (146 characters free) or the line cap (13 lines free) | Critical until `work-make-room` lands | The make-room unit runs first with a measured target; every lane-W text is a maximum; `REATTACH_BUDGET_CHARS` never rises |
| Corpus edits shift eval `source:` ranges and quoted text across four lanes | Warning | Lane V is the one writer of Expected blocks and new cases, and ranges move with their corpus units; `test/evals/locators.test.ts` is the check; moved Expected blocks get an `EXPECTED_MOVES` row with a reviewed disposition |
| The pinned CLI call needs the network on first use | Warning | REQ-FLOW-003's fallback: `Not done:` for handoff and learn, a hand-kept ledger that says so |
| Codex re-asks its users to trust hooks after each stamity upgrade, because `.codex/hooks.json` carries the pinned version and Codex records trust against that file's hash (`src/adapters/codex.ts:689-693`; G3) | Warning | The 1.11.0 release notes say so, with the `/hooks` step (session 3) |
| Read-only git widens five roles' tools on Claude Code | Warning | The guard admits only `log`, `show`, `diff`, `rev-list` and `merge-base` with a character allowlist and blocked options; one refusal test per client; the security lens reviews the guard |
| No QA ask when every row auto-proved | Warning | H rows still need a walk; the record states the auto-proven count; a reviewer judges it against invariant 1 |
| A `.venv` gate pin is POSIX-shaped | Minor | Stated in init's output; a Windows checkout keeps `check`'s unresolved-gate warning |
| The lint header draws an unused-directive warning under `--max-warnings 0` | Minor | The emitted-lint test records the warning count, measured with `npx eslint --print-config` on an emitted script; the release notes name it |
| Shared generated files regenerate in several lanes | Warning | One integration writer runs sync and the snapshot updates per lane merge |
| The test day was one pass on small projects | Minor | The release run's floors and the new cases are the proof; no figure from the day is used as a baseline |

## Open questions

None. Every open reading from the research is settled above under "Settled by this plan", each as a declared default
the maintainer may reverse at session 2's start.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- The CLI's own remedy text still names bare `stamity <verb>` in about 60 refusal messages; the sweep is on file 3's
  drop list, and one inbox row records it.
- File 3 carries the drop list; dropped items are not deferred work, so they do not become inbox rows.

Deferred by the run's contract census (2026-09-30), not built; each becomes an inbox row at session 2's close:
- `config detect` does not diff `detected.packageManager` (`src/cli/commands/config.ts:1144-1147`).
- Three user-typed bare mentions remain: `content/skills/st-onboard/SKILL.md:68`, `content/commands/st-quick.md:167`
  and `content/commands/st-work.md:469` (the charter's is fixed by `sw26-cli-token`); they carry drop-list D-58's
  trigger.
- A committed `/st-debug` record appears on the measurements page's excluded list
  (`src/cli/docs/measurements.ts:533-548`).
