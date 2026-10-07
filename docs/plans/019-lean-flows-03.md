---
id: lean-flows-03
intent: feature
stamp: 2104b177e6c4cc9592e289d72a4ffac9c9a87e92 2026-10-06
reads: [content/commands/st-work.md, content/commands/st-plan.md, content/commands/st-rework.md, content/commands/st-board.md, content/skills/st-qa/SKILL.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, content/agents/stamity-implementer.md, content/agents/stamity-spec-author.md, content/agents/stamity-test-runner.md, src/roster/modelLadder.ts, src/types/core.ts, src/adapters/claude.ts, src/adapters/codex.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/runs/ledgerStore.ts, src/cli/commands/ledger.ts, test/records/ledgers.test.ts, test/support/ledgerGrammar.ts, test/corpus/commands/work.test.ts, test/corpus/commands/plan.test.ts, test/corpus/commands/feedbackPair.test.ts, test/corpus/commands/board.test.ts, test/corpus/skills/flow.test.ts, test/authoring/specPlanCoverage.test.ts, test/adapters, test/roster/modelLadder.test.ts, docs/specs/everyday-flows.md, docs/specs/model-ladder.md, docs/specs/orchestrator-context.md, docs/capability-matrix.md, .stamity/inbox.md, .stamity/runs/2026-09-30_optimization-sweep/record.md]
depends_on: [docs/plans/019-lean-flows-02.md]
---

# Lean flows — file 3 of 3: the product's next tier (the inbox read, QA rows, plan size, client effort, usage)

This file is self-contained. It is the third of three `/st-plan` artifacts for **Package 23**. Its units cut fixed
costs the core file leaves: the whole inbox read on every `/st-work` run, person QA rows nobody walks, plans that run
three times the built plans' length, client effort settings that drifted from what the clients accept, and no record
of what a phase or a round cost. One session, one pull request, the next minor with its full eval run.

intent chosen: feature because each unit adds a capability (an inbox query, a QA row rule, a plan-lint size check,
current client effort settings, a usage line); the Copilot unit is a check before any change.

## Context

`/st-work`'s Frame reads the whole deferral inbox: 389 rows, 178 KB, up to about 44.5k tokens per run in this repository,
resident for the rest of the run. 126 QA rows were left for a person over 28 checkpoints; 1 was walked and no walk found
a defect, while machine rows found 9. Plan 015 is 718 lines for six units (2.9 times the built plans' median per unit),
and plan 016 file 0 is 46.4k tokens, 86% of a session's start-up read. The effort settings drifted from the clients:
Codex's reference no longer lists `minimal` and now offers `max` and `ultra`, Copilot's CLI accepts a `reasoning-effort`
per custom agent that Stamity does not write, and the Haiku test-runner carries an effort key Haiku 4.5 does not have.
Builders keep effort `high` (the walk). Nothing records minutes or tokens per phase or round, so no check can show it
pays. Out of scope: the class gates and loop rules (file 2), CI and release (file 1).

## Decisions

### The maintainer's walk (2026-10-07)

Taken on 2026-10-07, every answer the recommended option except one: build all three files of this plan, before
Package 19 and after plan 016 file 0 and its patch release 1.11.1; review loops cap at three rounds and escalate on
what the run shows; the release eval becomes change-aware with a periodic full run; website, docs-page, spec and
learnings changes get CI lanes, with the rule that every test that can fail on a change runs before `main` moves and
the full matrix runs on every product change and weekly; builders **keep effort `high`** (the one answer that was
not the recommended option); the declared defaults below stand.

### Settled by this plan (declared defaults)

| # | Default |
|---|---|
| S1 | The inbox query is a subcommand of the existing `ledger` verb, `stamity ledger inbox`, read-only, with `--paths`, `--plan`, `--area` and `--json`; the parser moves from the test into `src/runs/inboxStore.ts`. |
| S2 | A row matches by its location's path (line suffixes, `:—` and backticks stripped), by its `Ref:` path or plan, or by an `--area` word for prose locations; `critical-deferred` rows always show; the reply carries the total and the unmatched count. |
| S3 | Person QA rows only for: a rendered UI a person must look at, a live third-party client or account, and an irreversible step. Docs, records and tests classes get "no walk-through required" and no sign-off ask. |
| S4 | Plan-lint L5 is advisory: `unit-size` past 60 lines, `unit-oversize` past 100, `unit-prewritten` for fenced or quoted replacement text inside a unit, `delta-verbose` for more than six lines per requirement entry. |
| S5 | Builders keep effort `high` (the walk). No role-level effort key is added; the class defaults do not move. |
| S6 | Only the client settings move: each client gets the effort levels its models advertise. |
| S7 | `ultra` joins the effort union; `minimal` stays accepted for stored manifests and maps to the lowest level each Codex model advertises. Copilot's `reasoning-effort` scale is read at its vendor page at build time and cited. Haiku gets no effort key. |
| S8 | Usage goes into a run-record line beside the capacity line, not into ledger rows (the records gate refuses unknown row keys): `- <UTC> usage: <phase\|review rN> minutes=<n> tokens=<n\|unreported> (<client>)`. |
| S9 | The Copilot charter question is settled by a live check first; the key is emitted only if the check shows the gap. |

## Spec delta

New ids follow file 2's: REQ-FLOW-068 onward, REQ-LADDER-004 onward, REQ-CTX-019 onward.

### REQ-FLOW-068 — `/st-work` reads the inbox rows that match its change (ADDED)

GIVEN a run's changed or planned paths WHEN Frame reads the deferral inbox THEN it reads the rows `stamity ledger inbox
--paths … --plan …` returns, plus the total and unmatched counts, and every `critical-deferred` row.

### REQ-FLOW-019 — Frame's inbox read is the matched rows (MODIFIED)

`docs/specs/everyday-flows.md:394-396`, item 1: the whole-file read becomes the read of REQ-FLOW-068.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet (ADDED)

GIVEN a change THEN person rows are created only for S3's three kinds; GIVEN a docs, records or tests class THEN the
checkpoint asks nothing.

### REQ-FLOW-017 — The checkpoint's rows follow REQ-FLOW-069 (MODIFIED)

`docs/specs/everyday-flows.md:353-365`: rows left for a person are the kinds REQ-FLOW-069 names.

### REQ-FLOW-070 — Plan-lint L5 reports plan size (ADDED)

GIVEN a plan WHEN the coverage script runs THEN it reports S4's advisory codes with the unit and its line count; the
return line reads `L1…L5`.

### REQ-LADDER-004 — Each client gets the effort levels its models accept (ADDED)

GIVEN the Codex emit THEN each agent's effort is a level its model advertises (`minimal` maps to the lowest one); GIVEN
the Copilot CLI target THEN each custom agent carries `reasoning-effort`; GIVEN a Haiku agent THEN no effort key is
emitted. The class defaults do not move (`docs/specs/model-ladder.md:33-34` stands).

### REQ-LADDER-001 — The effort scales follow the clients (MODIFIED)

`docs/specs/model-ladder.md:44-55`: Codex's scale reads `low … max, ultra`; Copilot carries `reasoning-effort`.

### REQ-CTX-019 — The run record carries usage where the client reports it (ADDED)

GIVEN a phase or a review round that ends THEN a usage line records its minutes and tokens, or `unreported`.

### REQ-FLOW-071 — Copilot sub-agents receive the charter (only if q6 finds the gap) (ADDED)

GIVEN an emitted Copilot custom agent THEN it carries `include-custom-instructions: true`.

## Units

### q1-inbox-scoped — the inbox read follows the change

| Field | Content |
|---|---|
| `id` | q1-inbox-scoped |
| `requirements` | REQ-FLOW-068, REQ-FLOW-019 |
| `files` | `src/runs/inboxStore.ts` (new; the parser from `test/records/ledgers.test.ts:130-190`), `src/cli/commands/ledger.ts` (`inbox` in `choices`; `FOREIGN_FLAGS` rows), `test/runs/inboxStore.test.ts`, `test/cli/commands/ledger.test.ts`, `test/records/ledgers.test.ts` (imports the shared parser), `content/commands/st-work.md:27-34`, `docs/cli-reference.md` (regenerated), `docs/specs/everyday-flows.md` |
| `interfaces` | `parseInbox(text) → { rows: [{line, severity, location, description, source, ref, tag}], unparsed: number[] }`; `matchInbox(rows, {paths, plan, area}) → rows`; JSON `{inbox, total, matched: [...], counts: {Critical, Warning, Minor}, unmatched, unparsed}` |
| `testCriteria` | GIVEN this repository's inbox THEN `parseInbox` reads all 389 rows (the records gate still passes). GIVEN `--paths src/cli/commands/config.ts` THEN the row at `config.ts:829-849` matches and a `docs/plugins.md` row does not. GIVEN a prose-location row THEN it matches only by `--area`. GIVEN a `critical-deferred` row THEN it always shows. GIVEN the Frame pins (`work.test.ts:420-464`) and the board writer census (`board.test.ts:556-611`) THEN green, with no new text naming the inbox path in writer wording |
| `edgeCases` | An inbox that does not parse → the query prints the unparsed lines and Frame falls back to the whole file, saying so |
| `depends_on` | none |
| `verify` | `npx vitest run test/runs test/cli/commands/ledger.test.ts test/records test/corpus/commands/work.test.ts test/corpus/commands/board.test.ts` |

### q2-qa-rows — person rows only where a person adds something

| Field | Content |
|---|---|
| `id` | q2-qa-rows |
| `requirements` | REQ-FLOW-069, REQ-FLOW-017 |
| `files` | `content/skills/st-qa/SKILL.md:28-40`, `:94-108`, `content/commands/st-work.md` (QA step, now a pointer after file 2's room), `test/corpus/skills/flow.test.ts:757-799`, `test/corpus/commands/work.test.ts:915-954`, eval cases quoting the QA ranges (`probe-none-work-run-qa-checkpoint`, `benign-optional-step-skipped-proceeds`, `work-persisted-plan-asks-once`, `qa-bare-signoff-records-unwalked`), `docs/specs/everyday-flows.md` |
| `interfaces` | The trigger table gains a "Person row only when" column naming S3's three kinds; every other trigger yields an auto-proven or machine row; the docs-only clause extends to records and tests classes, without a sign-off block |
| `testCriteria` | GIVEN the skill THEN the three kinds are pinned and a CLI-only change yields no person row. GIVEN a records-only change THEN the checkpoint line reads "no walk-through required" and no ask follows. GIVEN `test/evals` THEN the re-synced ranges pass |
| `edgeCases` | A security setting a person must see in a third-party console counts as "a live third-party account" |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/skills/flow.test.ts test/corpus/commands/work.test.ts test/evals` |

### q3-plan-size — plan-lint L5

| Field | Content |
|---|---|
| `id` | q3-plan-size |
| `requirements` | REQ-FLOW-070 |
| `files` | `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, `test/authoring/specPlanCoverage.test.ts`, `content/commands/st-plan.md:280-285`, `:398`, `content/commands/st-rework.md:245`, `:269`, `test/corpus/commands/plan.test.ts:53-58`, `:406-418`, `:578-589`, `test/corpus/commands/feedbackPair.test.ts:485-489` (L5 now precedes R1), the eval case `plan-lint-three-fails-returns-blocked-ambiguity` (its range) |
| `interfaces` | Findings `{code: "unit-size"\|"unit-oversize"\|"unit-prewritten"\|"delta-verbose", path, line, message}` in the advisory set (`:95`); a unit ends at the next `###` or the next recognised plan section, not at an embedded `##` |
| `testCriteria` | GIVEN plan 015 THEN `b1` reports `unit-oversize` (226 lines) and `unit-prewritten`. GIVEN plan 013-02 THEN no size code. GIVEN a unit with an embedded `##` (plan 017-01 `a1`) THEN its span is counted whole. GIVEN the coverage status THEN advisory codes never fail it |
| `edgeCases` | `st-verify/SKILL.md` is capped at 130 lines (`verifyCore.test.ts:75`): name L5 in one line |
| `depends_on` | none |
| `verify` | `npx vitest run test/authoring test/corpus/commands/plan.test.ts test/corpus/commands/feedbackPair.test.ts test/corpus/skills test/evals` |

### q4-effort-ladder — the client effort settings brought current

| Field | Content |
|---|---|
| `id` | q4-effort-ladder |
| `requirements` | REQ-LADDER-004, REQ-LADDER-001 |
| `files` | `src/roster/modelLadder.ts` (the Codex scale `:418-428`; Copilot's projection row `:385-409`), `src/types/core.ts:119`, `src/adapters/{claude,codex,copilot}.ts`, `docs/capability-matrix.md`, `docs/configuration.md`, `docs/specs/model-ladder.md`, and the pins `test/adapters/claude.test.ts:84-89`, `test/adapters/codex.test.ts:539`, `:650-699`, `:728-761`, `test/adapters/copilot.test.ts:455-460`, `:889-916`, `test/roster/modelLadder.test.ts`, `test/types/domain.test.ts:59-70`, `test/manifest/manifest.test.ts:442-451`, `test/cli/commands/config.test.ts:908-971`, `test/emit/capabilityMatrix.test.ts:589-597`, the golden hash rows |
| `interfaces` | `EFFORT_LEVELS` gains `"ultra"`; Codex maps `minimal` to the lowest level each model advertises; Copilot `reasoning-effort: <level>` on the CLI target only; no `effort:` line on a Haiku agent |
| `testCriteria` | GIVEN the Claude emit THEN every advanced role reads `effort: high` as today and the test-runner has no effort line. GIVEN Codex THEN no `minimal` is emitted and `max` is accepted. GIVEN a manifest storing `minimal` THEN it still loads |
| `edgeCases` | The cloud Copilot target carries no effort (`copilot.ts:388-392`) → emit only where the CLI reads it |
| `depends_on` | none |
| `verify` | `npx vitest run test/adapters test/roster test/types test/manifest test/cli/commands/config.test.ts test/emit` |

### q5-usage-lines — what a phase and a round cost

| Field | Content |
|---|---|
| `id` | q5-usage-lines |
| `requirements` | REQ-CTX-019 |
| `files` | `content/commands/st-work.md` (the record section, below the cut), `test/corpus/recordWrites.test.ts`, `docs/specs/orchestrator-context.md` (its hand count of `- GIVEN` lines at `:974-978` moves) |
| `interfaces` | The line grammar of S8, written when a phase or review round ends; `tokens=unreported` where the client gives the orchestrator no usage for a dispatch |
| `testCriteria` | GIVEN the command THEN the grammar is pinned and placed beside the capacity line. GIVEN a record with usage lines THEN the records gate and the resume card read it unchanged |
| `edgeCases` | A client that reports tokens but not minutes → `minutes` from the orchestrator's own clock |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/recordWrites.test.ts test/records test/runs` |

### q6-copilot-charter-check — does a Copilot sub-agent receive the charter?

| Field | Content |
|---|---|
| `id` | q6-copilot-charter-check |
| `requirements` | REQ-FLOW-071 |
| `files` | the run record (evidence); only if the gap shows: `src/adapters/copilot.ts:455-461`, `test/adapters/copilot.test.ts:455-460`, `docs/capability-matrix.md` |
| `interfaces` | A live check with the installed Copilot CLI (`STAMITY_COPILOT_BIN`): an orchestrator that dispatches `stamity-implementer` as a sub-agent (not the top-level `--agent` route the 2026-09-30 check used) asks it to quote one charter line; recorded with the CLI version |
| `testCriteria` | GIVEN the check THEN the record states quoted or not quoted, with the version. GIVEN not quoted THEN the emitted agent file carries `include-custom-instructions: true` and the pinned key list moves |
| `edgeCases` | The CLI's sub-agent route needs an account action → the row goes to the QA walk as a person row |
| `depends_on` | none |
| `verify` | `npx vitest run test/adapters/copilot.test.ts test/emit/capabilityMatrix.test.ts` |

### q7-eval-cases-next — the risky case still gets its check

| Field | Content |
|---|---|
| `id` | q7-eval-cases-next |
| `requirements` | REQ-FLOW-068, REQ-FLOW-069, REQ-PROVE-009 |
| `files` | New cases under `evals/cases-v6/`, `evals/SET-v7.md` (counts), `evals/README.md`, `test/evals/successorInputs.test.ts` |
| `interfaces` | (1) a deferred row matching the change's path is folded in under the scoped read; (2) a UI change keeps a person QA row and its CLI-only twin has none |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green; the case count is file 2's count plus 2 |
| `edgeCases` | Counts moved by other plans first → re-base (contract census) |
| `depends_on` | q1-inbox-scoped, q2-qa-rows |
| `verify` | `npx vitest run test/evals` |

### q8-dogfood-sync — every emitted copy regenerated

| Field | Content |
|---|---|
| `id` | q8-dogfood-sync |
| `requirements` | spec carries no ids |
| `files` | `.claude/**`, `.apm/**`, `.agents/**`, `AGENTS.md`, `.stamity/manifest.json`, the golden snapshots |
| `interfaces` | `npm run build && node dist/cli.js sync`, goldens with files named first and `--update` last |
| `testCriteria` | GIVEN `node dist/cli.js check` THEN clean; GIVEN the full suite alone with `STAMITY_CLAUDE_BIN` unset (reason recorded) THEN green |
| `edgeCases` | A golden that moves without a content change → stop and find the cause |
| `depends_on` | q7-eval-cases-next |
| `verify` | `npm run build && node dist/cli.js sync && node dist/cli.js check && npm run lint && npm run typecheck && npm run test` |

## Execution order

1. `q6` first (a check; it decides whether a Copilot change rides).
2. Lanes: A `q1`; B `q2`; C `q3`; D `q4`; E `q5`. Shared files (`st-work.md`, the corpus pins) take one writer at a time
   in the order `q1`, `q2`, `q4`, `q5`.
3. `q7`, then `q8`; the full suite alone; coverage; knip; CI; the final whole-branch review at Fable 5.1.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | `stamity ledger inbox --paths <a real change's paths>` shows the rows a reader would fold in | person |
| 2 | A Copilot sub-agent quotes the charter (q6's evidence) | auto, or person if the route needs an account action |

## Risks


- **Warning:** a path-only inbox match misses prose locations; S2's counts make the miss visible.
- **Minor:** L5 counts spans by headings; plans that embed `##` sections inside units need the unit-end rule.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

None beyond file 1's and file 2's.

## Drop list

| Item | Revisit when |
|---|---|
| Token budgets per unit | 20 runs of usage lines give bands |
| Default model pins on Codex, Cursor and Copilot | a client documents stable class aliases |
| A time-awareness line in research briefs | a coding measurement appears |
