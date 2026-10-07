---
id: lean-flows-03
intent: feature
stamp: f1035ef8db8e87cd360a4c2e3e3b4cf53bdf5215 2026-10-07
reads: [content/commands/st-work.md, content/commands/st-plan.md, content/commands/st-rework.md, content/commands/st-board.md, content/skills/st-qa/SKILL.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, content/agents/stamity-implementer.md, content/agents/stamity-spec-author.md, content/agents/stamity-test-runner.md, src/roster/modelLadder.ts, src/types/core.ts, src/adapters/claude.ts, src/adapters/codex.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/runs/ledgerStore.ts, src/cli/commands/ledger.ts, test/records/ledgers.test.ts, test/support/ledgerGrammar.ts, test/corpus/commands/work.test.ts, test/corpus/commands/plan.test.ts, test/corpus/commands/feedbackPair.test.ts, test/corpus/commands/board.test.ts, test/corpus/skills/flow.test.ts, test/authoring/specPlanCoverage.test.ts, test/adapters, test/roster/modelLadder.test.ts, docs/specs/everyday-flows.md, docs/specs/model-ladder.md, docs/specs/orchestrator-context.md, docs/capability-matrix.md, .stamity/inbox.md, .stamity/runs/2026-09-30_optimization-sweep/record.md, content/commands/st-pr-resolve.md, content/commands/st-quick.md, content/commands/st-debug.md, content/skills/st-dep-audit/SKILL.md, content/rules/stamity-question-protocol.md, content/charter/stamity-charter.md, src/runs/resumeCard.ts, src/runs/layout.ts, src/tools/translator.ts, test/runs/ledgerClose.test.ts, test/corpus/commands/lightTrio.test.ts, test/evals/successorInputs.test.ts, docs/plans/014-lean-repository-02.md, docs/plans/015-board-writes.md, scripts/generate-apm-package.mjs, evals/SET-v7.md, evals/cases-v6, docs/working-with-stamity.md, docs/getting-started.md]
depends_on: [docs/plans/019-lean-flows-02.md]
---

# Lean flows — file 3 of 3: the product's next tier (the inbox read, QA rows, plan size, client effort, usage, the clean close)

This file is self-contained. It is the third of three `/st-plan` artifacts for **Package 23**. Its units cut fixed
costs the core file leaves: the whole inbox read on every `/st-work` run, person QA rows nobody walks, plans that run
three times the built plans' length, client effort settings that drifted from what the clients accept, and no record
of what a phase or a round cost. The findings follow-up adds the clean close: every leftover is decided at the run's
end, and every inbox writer gives a row a place, a date or a trigger, and its files. One session, one pull request,
the next minor with its full eval run.

intent chosen: feature because each unit adds a capability (an inbox query, a QA row rule, a plan-lint size check,
current client effort settings, a usage line, a schedule grammar, a close that decides every leftover); the Copilot
unit is a check before any change.

## Context

`/st-work`'s Frame reads the whole deferral inbox: 389 rows, 178 KB, up to about 44.5k tokens per run in this repository,
resident for the rest of the run. 126 QA rows were left for a person over 28 checkpoints; 1 was walked and no walk found
a defect, while machine rows found 9. Plan 015 is 718 lines for six units (2.9 times the built plans' median per unit),
and plan 016 file 0 is 46.4k tokens, 86% of a session's start-up read. The effort settings drifted from the clients:
Codex's reference no longer lists `minimal` and now offers `max` and `ultra`, Copilot's CLI accepts a `reasoning-effort`
per custom agent that Stamity does not write, and the Haiku test-runner carries an effort key Haiku 4.5 does not have.
Builders keep effort `high` (the walk). Nothing records minutes or tokens per phase or round, so no check can show it
pays. Out of scope: the class gates and loop rules (file 2), CI and release (file 1).

At a close the run decides its own Minor rows and appends every deferred row to the inbox without asking the person:
474 rows went in since 2026-09-09 and 83 came out; no row has yet left after more than eight days; a third to a half
of the deferred rows name no place, and 57 wait for a "hygiene batch" no plan scheduled. In about 13 of 35 sessions the
maintainer typed a close-out check ("all done?", "remaining?") by hand. Outside, three sources agree that a list read
later rarely gets worked (a company-wide fix-it week fixed 16% of the warnings it reviewed); no agent product asks the
person to sort leftovers at a session's end, and the nearest peer asks only about blockers. The person asked to decide
them, so the close asks once and keeps the list short (file 2's capture rule).

## Decisions

### The maintainer's walk (2026-10-07)

Taken on 2026-10-07, every answer the recommended option except one: build all three files of this plan, before
Package 19 and after plan 016 file 0 and its patch release 1.11.1; review loops cap at three rounds and escalate on
what the run shows; the release eval becomes change-aware with a periodic full run; website, docs-page, spec and
learnings changes get CI lanes, with the rule that every test that can fail on a change runs before `main` moves and
the full matrix runs on every product change and weekly; builders **keep effort `high`** (the one answer that was
not the recommended option); the declared defaults below stand.

### The findings follow-up walk (2026-10-07)

Taken later the same day, every answer the recommended option: every run ends with one question that decides each
leftover — fix now, schedule or drop — with real defects never pre-set to drop and only safe defaults when nobody can
answer (`q10`); "schedule" means a place, a date or a trigger, and the files (`q9`), for every inbox writer (`q11`); a
count line at each close (`q10`); sub-agents record only findings that name a consequence (file 2); today's inbox is
cleared once, with the maintainer (file 1); the change folds into this plan's three files; the drop list stands.

### Settled by this plan (declared defaults)

| # | Default |
|---|---|
| S1 | The inbox query is a subcommand of the existing `ledger` verb, `stamity ledger inbox`, read-only, with `--paths`, `--plan`, `--area` and `--json`; the parser moves from the test into `src/runs/inboxStore.ts`. |
| S2 | A row matches by any path in its location field (split on commas into entries; line suffixes, `:—` and backticks stripped from each), by its `Ref:` path or plan, or by an `--area` word for prose locations; `critical-deferred` rows always show; the reply carries the total and the unmatched count. |
| S3 | Person QA rows only for: a rendered UI a person must look at, a live third-party client or account, and an irreversible step. Docs, records and tests classes get "no walk-through required" and no sign-off ask. |
| S4 | Plan-lint L5 is advisory: `unit-size` past 60 lines, `unit-oversize` past 100, `unit-prewritten` for fenced or quoted replacement text inside a unit, `delta-verbose` for more than six lines per requirement entry. |
| S5 | Builders keep effort `high` (the walk). No role-level effort key is added; the class defaults do not move. |
| S6 | Only the client settings move: each client gets the effort levels its models advertise. |
| S7 | `ultra` joins the effort union; `minimal` stays accepted for stored manifests and maps to the lowest level each Codex model advertises. Copilot's `reasoning-effort` scale is read at its vendor page at build time and cited. Haiku gets no effort key. |
| S8 | Usage goes into a run-record line in the Proof block, below the re-attach cut (the capacity line sits above it), not into ledger rows (the records gate refuses unknown row keys): `- <UTC> usage: <phase\|review rN> minutes=<n> tokens=<n\|unreported> (<client>)`. |
| S9 | The Copilot charter question is settled by a live check first; the key is emitted only if the check shows the gap. |
| S10 | The close's one question ("The close asks once", `st-work.md:339-343`) gains a fourth part, the leftovers: every ledger row neither fixed nor rejected, every inbox row the change touched but did not fix or whose `by:` date passed, and the notes left out (one line, titles on request). Each leftover gets a recommendation — fix now, schedule or drop — and a one-line reason naming its evidence and what would change it; Critical and Warning rows come first and are never pre-set to drop. The options keep one question: accept the recommendations; change rows in one line (`L2 fix; drop L1: <reason>; show L3`); stop with every leftover on `Not done:`. Default if no response: S13 and "leave uncommitted". |
| S11 | The leftovers rule is written once, as a "Leftovers at a close" block in `/st-board`'s `## Deferral inbox` section, which already owns the row grammar, the tag word, the triage order and the removal rule. `/st-work`'s close gains the fourth part and a pointer (at most 4 lines, below the re-attach cut); `/st-pr-resolve`'s `## Close` and `/st-rework`'s plan-handoff ask point at it; `/st-quick` asks only when its batch leaves a leftover; `/st-debug` inherits through `/st-work`. |
| S12 | **Fix now** runs one fix round before the record (the fixer, the class gates on the final tree, the closure re-review), offered only while the review cap leaves a round and only for rows outside the files of an open person QA row; a fix that fails is reverted, and its row is scheduled with "fix-now failed: <gate or finding>" and listed on `Not done:`. **Schedule** closes the row `deferred` and appends it under S14, or retires it to a plan, board or handoff place under S15. **Drop** closes the row `deferred` and retires it at the same close (`cut <reason>`), so it never reaches the inbox; a Critical or Warning row only by the person's choice, as `cut accepted risk: <reason>`, kept on `Not done:`. `Not done:` names each scheduled item and each accepted risk. |
| S13 | With no answer, only notes are dropped (counted in `notes=`) and only fixes the run's plan covers are made; every other leftover goes to the inbox tagged `decision-waiting`, with its recommendation in the description and `when: next attended close`, and is listed on `Not done:`. `stamity ledger inbox` always shows `decision-waiting` rows, the next attended close asks them first, and the record's `status:` names how many wait. A real defect is never dropped by default; the question protocol's `Default applied:` line records the default. |
| S14 | Inbox rows gain optional keyword fields after `source:` and `Ref:`, in any order, each at most once: `by: <YYYY-MM-DD>` or `when: <trigger>`, `files: <path>, <path>`, one tag word, one bare `<YYYY-MM-DD>` (the deferral date) and `rationale: <rest of line>` last. Rows appended below a new `## Rows under the schedule rule` heading must carry `by:` or `when:`; `when: touched` needs a path (in the location or `files:`); a pinned list refuses vague triggers (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`). Older rows stay valid, and `/st-rework`'s `critical-deferred` row now parses as written. |
| S15 | A `retired` value dated on or after the cutover (the day `q9` merges, a pinned constant) parses as `fixed <ref>`, `cut <reason>`, `scheduled <place> · by <date>` or `scheduled <place> · when <trigger>`, where the text after `fixed` is free (`fixed in <run id>` and `fixed by /st-quick` stay valid) and a place is `plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or `handoff <path>`. One parser (`src/runs/disposition.ts`) serves `retireRow` and the records gate. "scheduled with a lane, a trigger and an owner" becomes "scheduled with a place and a date or a trigger". |
| S16 | Rows come back: `stamity ledger inbox` gains `--due [YYYY-MM-DD]` (today by default) and matches `files:` too; the close runs it with the changed paths and folds touched-but-unfixed and due rows into its leftovers. Expiry asks and never retires a row without an answer; "keep" never re-dates a row in place (a new date is a retire plus a new row). |
| S17 | Writers: `/st-plan`'s follow-ups carry `by:` or `when:` (and `files:` when the location is `—`); a follow-up with neither goes to the plan's Drop list with its revisit trigger. `/st-pr-resolve`'s and `/st-rework`'s DEFER rows add `when: touched` or `by:`; `/st-rework`'s meta row adds `by:`; the dep-audit skill names the grammar with `source: dep-audit`. `/st-debug` writes no inbox row: its held instrumentation keeps the end date its debug record already carries. No writer is added. |
| S18 | The count line sits in the Proof block, below the re-attach cut: `- <UTC> leftovers: shown=<n> real=<a> fixed=<f> scheduled=<s> dropped=<d> accepted=<k> notes=<p\|unknown> changed=<c>`, where `shown` counts the leftovers listed one by one (notes sit outside it and only in `notes=`), `real` counts the Critical and Warning rows among them, n = f + s + d, k ≤ d, a ≤ n, and an unattended close has d = 0, k = 0 and changed = 0. |

## Spec delta

New ids follow file 2's: REQ-FLOW-068 onward, REQ-LADDER-004 onward, REQ-CTX-019 onward; the findings follow-up's
REQ-FLOW-074 to 077 follow file 2's 072–073, and REQ-CTX-020 follows 019.

### REQ-FLOW-068 — `/st-work` reads the inbox rows that match its change (ADDED)

GIVEN a run's changed or planned paths WHEN Frame reads the deferral inbox THEN it reads the rows `stamity ledger inbox
--paths … --plan …` returns, plus the total and unmatched counts, and every `critical-deferred` row.

### REQ-FLOW-019 — Frame's inbox read is the matched rows, and the close's one question decides the leftovers (MODIFIED)

`docs/specs/everyday-flows.md:394-396`, item 1: the whole-file read becomes the read of REQ-FLOW-068.
`docs/specs/everyday-flows.md:401-404`, item 3: the close's one question gains the leftovers part of REQ-FLOW-074, and
its default gains the unattended rule of REQ-FLOW-075.

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

### REQ-FLOW-074 — The close decides every leftover (ADDED)

GIVEN a close with ledger rows neither fixed nor rejected, inbox rows due or touched by the change, or notes left out
THEN its one question lists each leftover with a recommendation (fix now, schedule, drop) and a one-line reason naming
its evidence and what would change it, Critical and Warning first and never pre-set to drop, the notes in one line; the
answer is applied before the record is written; only the person drops a Critical or Warning, which stays on `Not done:`
as an accepted risk with the reason; an empty part drops out. Default if no response: REQ-FLOW-075, leave uncommitted.

### REQ-FLOW-075 — An unattended close never drops a real defect (ADDED)

GIVEN a close no one answers THEN only notes are dropped (counted) and only fixes the run's plan covers are made; every
other leftover goes to the inbox tagged `decision-waiting` with its recommendation and `when: next attended close`, is
listed on `Not done:`, always shows in `stamity ledger inbox`, and is asked first at the next attended close.

### REQ-FLOW-076 — A scheduled item names a place, a date or trigger, and its files (ADDED)

GIVEN a scheduled item THEN it names a place (a plan unit or follow-up section, a board item, a handoff, an inbox row),
`by: <YYYY-MM-DD>` or `when: <trigger>`, and its files. A new `--retired` value is `fixed <ref>`, `cut <reason>` or
`scheduled <place> · by|when …`, else refused; the records gate refuses an inbox row below the schedule-rule heading
without `by:` or `when:`, or with a vague trigger; `stamity ledger inbox --due` returns overdue rows; a close takes
touched and due rows as leftovers; expiry asks, never retires unanswered; pre-cutover rows and values stay valid.

### REQ-FLOW-077 — Every inbox writer follows the schedule rule (ADDED)

GIVEN `/st-plan`'s follow-ups, `/st-pr-resolve`'s and `/st-rework`'s DEFER rows, `/st-rework`'s meta row or the
dep-audit skill's rows THEN each inbox row carries `by:` or `when:`, and `files:` when its location is `—`; a plan
follow-up with neither goes to that plan's Drop list with its revisit trigger.

### REQ-CTX-020 — The close records what happened to its leftovers (ADDED)

GIVEN a close THEN its Proof block carries one count line, with n = f + s + d, k ≤ d, a ≤ n, the notes outside n, and
changed=0 unattended:
`- <UTC> leftovers: shown=<n> real=<a> fixed=<f> scheduled=<s> dropped=<d> accepted=<k> notes=<p|unknown> changed=<c>`

### REQ-FLOW-024 — Retire values follow the schedule rule (MODIFIED)

`docs/specs/everyday-flows.md:532-536`, `:541-544`: from the cutover, a new `retired` value follows the grammar of
REQ-FLOW-076; a row dropped at a close, or scheduled there to a place other than the inbox, is retired then and never
appended to the inbox.

## Units

### q1-inbox-scoped — the inbox read follows the change

| Field | Content |
|---|---|
| `id` | q1-inbox-scoped |
| `requirements` | REQ-FLOW-068, REQ-FLOW-019 |
| `files` | `src/runs/inboxStore.ts` (new; the parser from `test/records/ledgers.test.ts:130-190`), `src/cli/commands/ledger.ts` (`inbox` in `choices`; `FOREIGN_FLAGS` rows), `test/runs/inboxStore.test.ts`, `test/cli/commands/ledger.test.ts`, `test/records/ledgers.test.ts` (imports the shared parser), `content/commands/st-work.md:27-34`, `docs/cli-reference.md` (regenerated), `docs/specs/everyday-flows.md` |
| `interfaces` | `parseInbox(text) → { rows: [{line, severity, location, description, source, ref, tag}], unparsed: number[] }`; `matchInbox(rows, {paths, plan, area}) → rows`; JSON `{inbox, total, matched: [...], counts: {Critical, Warning, Minor}, unmatched, unparsed}` |
| `testCriteria` | GIVEN this repository's inbox THEN `parseInbox` reads every bullet row it holds, the count read from the file at test time (the records gate still passes). GIVEN `--paths src/cli/commands/config.ts` THEN the row at `config.ts:829-849` matches and a `docs/plugins.md` row does not. GIVEN a row whose location lists several paths THEN a query for its second path matches it. GIVEN a prose-location row THEN it matches only by `--area`. GIVEN a `critical-deferred` row THEN it always shows. GIVEN the Frame pins (`work.test.ts:420-464`) and the board writer census (`board.test.ts:556-611`) THEN green, with no new text naming the inbox path in writer wording |
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
| `testCriteria` | GIVEN the command THEN the grammar is pinned and placed in the Proof block, below the re-attach cut. GIVEN a record with usage lines THEN the records gate and the resume card read it unchanged |
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

### q9-schedule-rule — a scheduled row names a place, a date or a trigger, and its files

| Field | Content |
|---|---|
| `id` | q9-schedule-rule |
| `requirements` | REQ-FLOW-076, REQ-FLOW-024 |
| `files` | `src/runs/inboxStore.ts` (S14's keyword fields in `parseInbox`; `--due` matching), `src/runs/disposition.ts` (new), `src/runs/ledgerStore.ts` (`retireRow` `:912-978` calls `parseDisposition` after its length check), `src/cli/commands/ledger.ts` (`--due` on `inbox`; `FOREIGN_FLAGS` rows for `append`, `close` and `status`), `test/runs/inboxStore.test.ts`, `test/runs/disposition.test.ts` (new), `test/runs/ledgerClose.test.ts`, `test/cli/commands/ledger.test.ts`, `test/records/ledgers.test.ts` (rows below the heading need `by:` or `when:`; `retiredProblems` from the cutover), `.stamity/inbox.md` (the `## Rows under the schedule rule` heading), `content/commands/st-board.md` (the grammar `:345-353`; the removal rule `:358-363`: a due row comes back and nothing retires it without an answer), `docs/cli-reference.md` (regenerated), `docs/specs/everyday-flows.md` |
| `interfaces` | Row: `- <sev> · <location> · <description> · source: <writer> [· Ref: …] [· by: <YYYY-MM-DD> \| · when: <trigger>] [· files: <path>, …] [· <tag>] [· <YYYY-MM-DD>] [· rationale: <rest of line>]`; the keyword fields after `Ref:` come in any order, each at most once, and an unknown `word: value` field is a problem. `parseInbox(text) → { rows: [{line, severity, location, description, source, ref, by, when, files, tag, deferredOn, rationale}], problems: [{line, message}] }` (q1's `unparsed` stays, as the problem lines). `parseDisposition(text) → {ok: true, value: {kind: "fixed", ref} \| {kind: "cut", reason} \| {kind: "scheduled", place, due: {by} \| {when}}} \| {ok: false, problem}`; a refusal is an `EngineError` `VALIDATION_ERROR` with `why` and `next`, as at `ledgerStore.ts:923-929`. `SCHEDULE_RULE_FROM` is the merge date. The vague-trigger list: `later`, `someday`, `eventually`, `tbd`, `hygiene batch`. The JSON of `ledger inbox` gains `due: [...]`, `triggers: <n>` and, per row, `matchedBy` |
| `testCriteria` | GIVEN today's inbox THEN every row still parses. GIVEN `/st-rework`'s `critical-deferred` row built from its protocol text (`st-rework.md:199-200`) THEN it parses, red on the old parser first. GIVEN a row below the heading without `by:` or `when:`, or with `when: later` THEN the records gate names it. GIVEN `ledger close --retired "scheduled later"` THEN refused with `why` and `next`; GIVEN `"fixed in <run id>"` or `"fixed by /st-quick"` THEN accepted. GIVEN `ledger inbox --due 2026-12-01` THEN rows with a `by:` date on or before it match, and `when:` rows are only counted. GIVEN a `retired` value dated before the cutover THEN it is not checked |
| `edgeCases` | `when: touched` on a row whose location is `—` and that has no `files:` → a problem. Two `by:` fields → a problem. A description that contains ` · ` still parses, because the fields after `source:` are read by their prefix |
| `depends_on` | q1-inbox-scoped |
| `verify` | `npx vitest run test/runs test/cli/commands/ledger.test.ts test/records test/corpus/commands/board.test.ts` |

### q10-clean-close — the close decides every leftover, in its one question

| Field | Content |
|---|---|
| `id` | q10-clean-close |
| `requirements` | REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-019, REQ-FLOW-024, REQ-CTX-020 |
| `files` | `content/commands/st-board.md` (a "Leftovers at a close" block in `## Deferral inbox`; the triage order gains `decision-waiting`), `content/commands/st-work.md` ("The close asks once" `:339-343`; the append, disposition and `Not done:` sentences `:394-406`; the count line in the Proof block), `content/commands/st-pr-resolve.md` (`## Close` `:311-328`, one pointer), `content/commands/st-rework.md` (the plan-handoff ask `:258-259`, one pointer), `content/commands/st-quick.md` (`:165-171`: it asks only when its batch leaves a leftover), `src/runs/inboxStore.ts` (the always-show set gains `decision-waiting`), the pins `test/corpus/commands/work.test.ts:412-416`, `:942-954`, `:1009-1057`, `:1079-1093`, `test/corpus/commands/board.test.ts:556-628`, `test/corpus/commands/feedbackPair.test.ts:726`, `:765`, `test/corpus/commands/lightTrio.test.ts`, the emission golden snapshot; the eval cases `work-proof-block-fields` (B4, B6–B8 and its Brief), `work-persisted-plan-asks-once` (its Brief and claim), and the re-ranged `probe-none-work-run-qa-checkpoint`, `benign-optional-step-skipped-proceeds`, `pr-resolve-next-step-derived-from-run-state` and `rework-next-step-derived-from-run-state`; `test/evals/successorInputs.test.ts` (the `work-proof-block-fields` row of `EXPECTED_MOVES` extended), `evals/SET-v7.md`; `docs/working-with-stamity.md:98-104`, `docs/getting-started.md:324`, `docs/specs/everyday-flows.md` |
| `interfaces` | One question on every client (Claude Code's question tool; plain numbered text where a client has none): the QA rows left for a person; the spec delta; then `Leftovers (real defects first):`, one line each, `L<n> <severity> · <location> · <summary> → fix now \| schedule: <place>, <by or when>, <files> \| drop — <evidence>; would change if <condition>`, and `Notes (<p>): drop`, with titles on request; then the options: 1. accept the recommendations, leave uncommitted; 2. accept the recommendations, merge and commit once the fixes are green; 3. change rows (`walked 3; L2 fix; drop L1: <reason>; show L2`); 4. stop: nothing fixed, merged or committed, every leftover on `Not done:`. `Default if no response:` S13, and leave uncommitted. A dropped row first closes `deferred` (`stamity ledger close --state deferred --rationale "<reason>"`) and is then retired (`--retired "cut <reason>"`, or `"cut accepted risk: <reason>"` for a Critical or Warning the person chose to drop). The count line of S18 |
| `testCriteria` | GIVEN `st-work.md` THEN "The close asks once" names four parts, its default names the unattended rule and "leave uncommitted", the count line's grammar is pinned in the Proof block, the body stays within 500 lines and no new text sits above the re-attach cut. GIVEN `st-board.md` THEN the Leftovers block names the three dispositions, "never pre-set to drop", the accepted-risk rule and `decision-waiting`, and the census words (Writers, Retirers, Readers) still match the corpus. GIVEN `ledger inbox` and a row tagged `decision-waiting` THEN the row always shows. GIVEN `npx vitest run test/evals` THEN green, with the reviewed `EXPECTED_MOVES` row |
| `edgeCases` | No leftovers → the part drops out and the close asks only what it asked before; nothing left at all → no ask. A fix-now fix that fails → reverted, its row scheduled with "fix-now failed: <gate or finding>" and on `Not done:`, and the commit as answered applies to the green tree before the fix. No round left under the cap → fix now is not offered for that row |
| `depends_on` | q2-qa-rows, q5-usage-lines, q9-schedule-rule |
| `verify` | `npx vitest run test/corpus test/evals test/runs` |

### q11-inbox-writers — every writer gives its row a place

| Field | Content |
|---|---|
| `id` | q11-inbox-writers |
| `requirements` | REQ-FLOW-077 |
| `files` | `content/commands/st-plan.md` (Side effects `:383-386`, Return contract `:406-407`), `content/commands/st-pr-resolve.md:316`, `content/commands/st-rework.md` (`:174-184`, `:286`), `content/skills/st-dep-audit/SKILL.md:97-102`, the pins `test/corpus/commands/plan.test.ts:550-594`, `test/corpus/commands/feedbackPair.test.ts`, `test/corpus/commands/board.test.ts:592-605`; the eval cases `pr-resolve-next-step-derived-from-run-state`, `rework-triage-revise-versus-defer` and `plan-semantic-ambiguity-survives-structural-pass` (their Briefs re-quoted) |
| `interfaces` | `/st-plan`: "each with `by:` or `when:`, and `files:` when the location is `—`; a follow-up with neither belongs in the Drop list with its revisit trigger". `/st-pr-resolve`'s and `/st-rework`'s DEFER rows end `· when: touched` (or `· by: <date>`); `/st-rework`'s meta row carries `by:`; the dep-audit skill writes `source: dep-audit`, the manifest's `path:line` as the location, and `by:` (an advisory deadline) or `when: touched`. No writer is added, so the census stays at five |
| `testCriteria` | GIVEN each writer's text THEN its row template parses under `q9`'s grammar and names `by:` or `when:`. GIVEN the board census THEN "Writers, five" still matches the corpus. GIVEN `npx vitest run test/evals` THEN green, with the re-quoted Briefs |
| `edgeCases` | A plan follow-up with only a revisit trigger ("when a company asks") → the plan's Drop list, not the inbox |
| `depends_on` | q3-plan-size, q9-schedule-rule, q10-clean-close |
| `verify` | `npx vitest run test/corpus test/evals` |

### q7-eval-cases-next — the risky case still gets its check

| Field | Content |
|---|---|
| `id` | q7-eval-cases-next |
| `requirements` | REQ-FLOW-068, REQ-FLOW-069, REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-076, REQ-FLOW-077, REQ-PROVE-009 |
| `files` | New cases under `evals/cases-v6/`, `evals/SET-v7.md` (counts), `evals/README.md`, `test/evals/successorInputs.test.ts` |
| `interfaces` | (1) a deferred row matching the change's path is folded in under the scoped read; (2) a UI change keeps a person QA row and its CLI-only twin has none; (3) a real defect is never in the drop group (adversarial, a floor case); (4) an unattended close never drops a real defect (golden, a floor case); (5) a "later" deferral without a place is refused (adversarial); (6) its benign twin: a close with no leftovers asks nothing extra |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green; the case count is file 2's count plus 6 |
| `edgeCases` | Counts moved by other plans first → re-base (contract census) |
| `depends_on` | q1-inbox-scoped, q2-qa-rows, q9-schedule-rule, q10-clean-close, q11-inbox-writers |
| `verify` | `npx vitest run test/evals` |

### q8-dogfood-sync — every emitted copy regenerated

| Field | Content |
|---|---|
| `id` | q8-dogfood-sync |
| `requirements` | spec carries no ids |
| `files` | `.claude/**`, `.apm/**`, `.agents/**`, `AGENTS.md`, `.stamity/manifest.json`, the golden snapshots |
| `interfaces` | `npm run build && node dist/cli.js sync`, then `node scripts/generate-apm-package.mjs` (it writes `apm.yml` and `.apm/`, which CI diffs; `sync` does not), goldens with files named first and `--update` last |
| `testCriteria` | GIVEN `node dist/cli.js check` THEN clean; GIVEN the full suite alone with `STAMITY_CLAUDE_BIN` unset (reason recorded) THEN green |
| `edgeCases` | A golden that moves without a content change → stop and find the cause |
| `depends_on` | q7-eval-cases-next |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && node dist/cli.js check && npm run lint && npm run typecheck && npm run test` |

## Execution order

1. `q6` first (a check; it decides whether a Copilot change rides).
2. Lanes: A `q1` → `q9`; B `q2`; C `q3`; D `q4`; E `q5`. Shared files (`st-work.md`, `st-board.md`, `st-plan.md`,
   `st-pr-resolve.md`, `st-rework.md`, the corpus pins) take one writer at a time in the order `q1`, `q2`, `q3`, `q4`,
   `q5`, `q9`, `q10`, `q11`.
3. `q7`, then `q8`; the full suite alone; coverage; knip; CI; the final whole-branch review at Fable 5.1.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | `stamity ledger inbox --paths <a real change's paths>` shows the rows a reader would fold in | person |
| 2 | A Copilot sub-agent quotes the charter (q6's evidence) | auto, or person if the route needs an account action |
| 3 | A real `/st-work` close with leftovers shows them with their recommendations in its one question, and a close with none asks nothing extra | person |
| 4 | The notes left out by the `/st-work` runs since file 2 merged (at least three runs, from their local reports) hold no real defect | auto: a reader checks each list; the person sees only what it flags |

## Risks


- **Warning:** a path-only inbox match misses prose locations; S2's counts make the miss visible.
- **Minor:** L5 counts spans by headings; plans that embed `##` sections inside units need the unit-end rule.
- **Warning:** a close that edits code when no one answers would break the lowest-blast-radius default. Mitigation:
  the default is S13 (only notes dropped, only plan-covered fixes made) plus "leave uncommitted"; "accept the
  recommendations" is the recommended answer, never the silent one.
- **Warning:** "fix now" spends a review round and can reopen a person QA row's input hash. Mitigation: it is offered
  only while the cap leaves a round and only outside the files of an open person row.
- **Warning:** the board's writer census is derived from the corpus; any new text that names the inbox path near
  "append" or "deferred" counts as a writer. Mitigation: `q10` and `q11` add no writer, and the census test stays the
  judge.
- **Warning:** no peer asks the person at a session's end, and the nearest one asks only about blockers. Mitigation:
  file 2 keeps the list short, notes ride in one line, and the count line shows whether the close stays short.
- **Minor:** plan 015's `b1` hashes a whole inbox row for its marker, and plan 014's `r1` moves the parser by line
  range; both notes are written into those units' edge cases by this plan, not into the inbox.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

None beyond file 1's and file 2's. The two notes for later plans (plan 015's `b1` marker, plan 014's `r1` parser move)
are written into those units' edge cases, where their builders read them.

## Drop list

| Item | Revisit when |
|---|---|
| Token budgets per unit | 20 runs of usage lines give bands |
| Default model pins on Codex, Cursor and Copilot | a client documents stable class aliases |
| A time-awareness line in research briefs | a coding measurement appears |
| Closing inbox rows by age | never: it loses real defects unseen, and stale bots cost contributors in their setting |
| The recommender's track record shown at each close | one release of count lines exists |
| A board item filed for every scheduled row | Package 19's board writes land (`docs/plans/015-board-writes.md`) |
| A new ledger state `dropped` | the dated `retired` reasons prove unreadable |
| A separate close skill | the Leftovers block outgrows `/st-board`'s section |
| Removing the inbox file | the schedule rule leaves it near-empty for a month |
| An inbox row for `/st-debug`'s held instrumentation | a held probe outlives its window once |
| A batch `--ids` form of `ledger close --retired` | a second whole-inbox pass is planned |
