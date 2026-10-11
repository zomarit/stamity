---
id: lean-flows-03-in-flow
intent: feature
stamp: 359610a5 2026-10-10
reads: [docs/plans/019-lean-flows-03.md, .stamity/runs/2026-10-10_next-tier/record.md, .stamity/runs/2026-10-10_next-tier/frame-units.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-room.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-inbox-ledger.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-effort.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-qa-plansize.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-close-usage.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-writers-evals.md, .stamity/runs/2026-10-10_next-tier/reports/plan-researcher-r1-copilot.md, .stamity/runs/2026-10-08_product-core/plan.md, .stamity/inbox.md, .stamity/change-classes.json, content/commands/st-work.md, content/commands/st-plan.md, content/commands/st-board.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/commands/st-quick.md, content/skills/st-qa/SKILL.md, content/skills/st-verify/SKILL.md, content/skills/st-verify/scripts/spec-plan-coverage.mjs, content/skills/st-dep-audit/SKILL.md, src/cli/commands/ledger.ts, src/cli/commands/config.ts, src/runs/ledgerStore.ts, src/runs/resumeCard.ts, src/roster/modelLadder.ts, src/types/core.ts, src/adapters/copilot.ts, src/composition/root.ts, test/records/ledgers.test.ts, test/roster/modelLadder.test.ts, test/corpus/commands/board.test.ts, test/evals/successorInputs.test.ts, test/architecture/boundaries.test.ts, docs/specs/everyday-flows.md, docs/specs/model-ladder.md, .stamity/learnings, .stamity/runs/2026-10-10_next-tier/reports/plan-text-reviewer-r1.md, .stamity/runs/2026-10-10_next-tier/reports/plan-code-reviewer-r1.md, .stamity/runs/2026-10-10_next-tier/reports/q6-test-runner-r1.md, content/agents/stamity-test-runner.md, src/denyscan/denyScan.ts, src/hooks/scripts.ts, .stamity/runs/2026-10-10_next-tier/reports/plan-code-reviewer-r2.md, .stamity/runs/2026-10-10_next-tier/reports/plan-text-reviewer-r2.md, test/cli/commands/config.test.ts, .stamity/runs/2026-10-10_next-tier/reports/plan-reviewer-r3.md]
depends_on: [docs/plans/019-lean-flows-02.md]
---

# Run 2026-10-10_next-tier: the in-flow plan (plan 019 file 3, re-planned)

**Amended 2026-10-10, pass r3 → r4** (spec-author, after plan re-review r3, the cap's last plan round; a small pass).
It applies three sign-offs the record holds and one note, from `reports/plan-reviewer-r3.md` (W-1, W-2, W-3 =
`plan/38`, `plan/39`, `plan/40`; `record.md:137-138`). Frame reads the whole inbox file only when the CLI cannot run at
all, and a refused read is a finding, never a whole-file read (`plan/38`, the sign-off on `review/7`, `record.md:124`).
Usage lines are appended to the record as each phase or review round ends, as the capacity lines are, and the leftovers
count line is the Proof block's own line (`plan/39`, the sign-off on `review/8`, `record.md:128`). `/st-quick` gains no
leftovers ask, which withdraws S11's clause (`plan/40`, `record.md:138`). q9b's `when:` check uses the widened
vague-words rule q9a's fix round lands (`build/10`, `build/11`, `record.md:134`). The rows are in "Sign-offs of
re-review r3, applied in r4" below. Still 29 units; none added, removed or split; no declared default added. Cells
changed: q1t, q9b, q10a, q10b and s1, with REQ-FLOW-068, REQ-CTX-019, REQ-CTX-020 and REQ-FLOW-077 in the Spec delta.
The built units keep their cells (f0, f1, q6, q1a, q1b, q2, q4a, q4b, q3a, q5, q6t, q9a), and so does q6b, building:
q5's usage paragraph and q1a's refusal text move in their own fix rounds (`review/8`, `review/7`), and q9a's rule in
its own (`build/10`, `build/11`). No plan round follows; a later finding on a cell goes to its unit's review. The
record lines this paragraph cites are as the record stands at this pass; its "Resume here" block moved the lines the
earlier passes cite down by 17.

**Amended 2026-10-10, pass r2 → r3** (spec-author, after plan re-review r2). This pass applies the orchestrator's
sign-offs on `plan/30` and `plan/31` and its routing of `plan/32`–`plan/35` (`record.md:91-96`), from
`reports/plan-code-reviewer-r2.md` (W-1 = `plan/30`) and `reports/plan-text-reviewer-r2.md` (W-1…W-5 =
`plan/31`…`plan/35`), plus the two Minors the code re-review left out (q1a's test pattern; `config.test.ts:978-992` in
q4b). A row the screen withholds keeps its line, severity and location (`plan/30`); `/st-quick`'s ask never covers a
refused item (`plan/31`); QA row 2 is `auto-proven` or `not signed` (`plan/32`); the close applies its answer to the
inbox rows it decided (`plan/33`), takes every `decision-waiting` row first (`plan/34`), and Minor rows reach the person
there (`plan/35`). The sign-offs and new defaults D37–D39 are in "Sign-offs and routings of re-review r2" below. Still
29 units; none added, removed or split. q1a, q2 and q4b are building against the frozen copy `reports/plan-r2.md`: q1a's
and q4b's cells change only where `plan/30` and the two Minors require, each change marked "amended r3 (routed to the
unit's review)"; q2's cell does not change. f0, f1 and q4a are built and q6 is done; their cells do not move.

**Amended 2026-10-10, pass r1 → r2** (spec-author, after plan coverage review r1). This pass folds in the plan gate's
answers (`record.md:60-65`), the orchestrator's sign-offs and readings of review r1 (`record.md:70-87`), and q6's
report (`reports/q6-test-runner-r1.md`): q6b takes the gap branch and q6c the emit branch; `build/85` joins q6t and
`review/174` and `close/13` stay in q7c; a fifth QA row covers the rendered pages; QA row 2 becomes the q6 check re-run
against the emitted key; q1t's allocation is +350 characters. Every finding of `reports/plan-text-reviewer-r1.md` and
`reports/plan-code-reviewer-r1.md` (ledger `plan/1`–`plan/29`) is settled in a cell or answered in
`reports/plan-spec-author-r2.md`. No unit is added, removed or split. `f0-make-room` and `f1-erasable-guard` are built,
and `q4a-effort-union` is building against the frozen copy `reports/plan-r1.md`; their cells do not move. A finding on
q4a goes to its review, not to this file.

This is the run's own plan. It replaces nothing in `docs/plans/019-lean-flows-03.md`. It re-plans that file at HEAD
`359610a5` because its freshness guard failed (stamp `f1035ef8`; 33 of 52 `reads` moved, `record.md:22`). It carries
the opening batch's answers (`record.md:31-40`) and the Phase 2 notes (`record.md:46-52`) as binding. An implementer
holding no session history can execute every unit from its cell and the common rules below.

**Line numbers.** Every cell cites the tree at `359610a5` unless it names `caa2beca` (f0's head on `lean-flows-03`).
The two Frame units are built: `f0-make-room` at `0b03f126` and `caa2beca` on `lean-flows-03`, `f1-erasable-guard` at
`d826ac5c` on `lean-flows-03-lane-a` (`record.md:92`, `:98`); `f0-make-room` moved most `content/commands/st-work.md`
and `test/corpus/commands/work.test.ts` lines. A unit finds its cited text by the quoted words; a number is a lead,
never the anchor. Integration units run in order, so each one also finds the lines the units before it moved.

intent chosen: feature because each unit adds a capability (a scoped inbox query, a QA row rule, a plan-size lint, current
client effort settings, a usage line, a schedule grammar, a close that decides every leftover); the Copilot unit is a
check before any change.

## Context

The persisted file's Context stands: `/st-work` reads the whole deferral inbox (now 62 rows, `.stamity/inbox.md`) on
every run; person QA rows go unwalked; plans run long; the client effort settings drifted from what the clients accept;
nothing records what a phase or a round cost; and a close appends every deferred row without asking. The findings
follow-up adds the clean close: one question decides every leftover, and every inbox writer gives a row a place, a date
or a trigger, and its files. One session, one pull request from `lean-flows-03`, no release; the eval cases ride
1.14.0's full run.

What moved since the stamp (the seven research returns, `reports/plan-researcher-r1-*.md`):

- `/st-work` has 142 characters under the 18,000 re-attach cut and 2 of 500 body lines (`record.md:23`); the Frame
  units make room before any unit adds text.
- The inbox parser is still test-local (`test/records/ledgers.test.ts:130-190`); no `src/` module reads the inbox;
  `test/cli/commands/ledger.test.ts` does not exist (ledger CLI tests live in `test/runs/`).
- `/st-rework`'s `critical-deferred` row fails today's parser (`ledgers.test.ts:180-184`).
- The `haiku` alias now reaches Haiku 5.5, which accepts effort; Codex's reference lists `low` … `ultra` and no
  `minimal`; GitHub's two sources spell Copilot's effort key two ways.
- `/st-plan`'s shape has no Follow-ups or Drop list section, which S17 points at.
- The eval set holds 134 cases.

Out of scope, as before: the class gates and the review-loop rules (file 2), CI and release (file 1), `/st-board`
writes (Package 19), the red live Claude walk (Package 19 step 2), any release.

## Decisions this plan carries

### The persisted defaults

S1, S2, S5, S6, S8–S11 and S13–S18 stand as written in `docs/plans/019-lean-flows-03.md:64-81`, with these marks:

- **S3 amended (D2).** Person rows only for a rendered surface a person must look at, a live third-party client or
  account, and an irreversible step. Docs, records and tests classes skip the walk only when no rendered page changes.
- **S4 narrowed (D3).** `delta-verbose` keeps its six-line definition and stays advisory.
- **S7 amended (D4, D5, D6).** The Haiku clause is withdrawn; `minimal` resolves to `low` on Codex and on Copilot;
  Copilot's key is `reasoning-effort` (settled at the plan gate, r2).
- **S8 amended (r4, `plan/39`; the sign-off on `review/8`).** A usage line is not a line in the Proof block, which
  does not exist while a run is going: it is appended to the run record as each phase or review round ends, as the
  capacity lines are, each its own line and never directly above a table. The rule's text stays below the re-attach cut.
- **S11 amended (r4, `plan/40`).** The clause "`/st-quick` asks only when its batch leaves a leftover" is withdrawn:
  `/st-quick` gains no leftovers ask. Its text says only that the lane appends no inbox row and that what it cannot
  finish escalates to `/st-work`, whose close asks. The rest of S11 stands.
- **S12 stands.** "Fix now" runs one fix round inside the cap.
- **S15 extended (D12).** A keyword may take a colon (`cut: <reason>`); the cutover is 2026-10-10.
- **S16 stands,** with `--due` reading the injected clock (D10).
- **S17 extended (D11, D13, D14).** The critical-deferred row gains `when: touched`; `/st-plan`'s shape gains the two
  sections; the dep-audit row gets a full grammar.

### Answers carried

- **Opening batch** (`record.md:35-38`): all six placed leftovers, room first; a docs change that alters a rendered page
  keeps one person row; ask once at the plan gate; the run may push to this PR's branch, re-run a red CI leg once, mark
  ready once with one bot batch, and run q6's Copilot live check.
- **Held for the end** (`record.md:40`): the merge to `main`, the person QA rows, the leftovers question and the
  maintainers' close.
- **Left in the inbox** (`record.md:28`): `prove/101`, `pass/2`, `build/10`, `build/96`.
- **The plan gate** (`record.md:60-65`, answered 10:03Z): execute now, once review r1's fixes are folded in; fold all
  three firing rows (`review/174` and `close/13` into q7c, `build/85` into q6t); add the fifth QA row for the rendered
  pages; both Copilot keys (q6b's gap branch, q6c's emit branch). Open questions 2 and 3 took their defaults (option 1
  each).

### Declared defaults the research forced (D1–D21)

Each is reversible at the plan gate and goes on the close list.

| # | Default | Evidence |
|---|---|---|
| D1 | `f0-make-room` and `f1-erasable-guard` run at the Frame, ahead of this plan, with the cells frozen in `frame-units.md`; this plan carries them verbatim as its first two units | Opening batch, answer 1 (`record.md:35`); Phase 2 note (`record.md:48`) |
| D2 | S3 amended: docs, records and tests classes skip the walk only when no rendered page changes — a changed path a site build renders (here `docs/**` outside `docs/specs/**` and `docs/plans/**`, and `website/**` pages, styles and images) or any path `gate classify` hands the `design-quality` lens; then one person row (the changed page renders and reads right). The qa skill states the rule generically | Opening batch, answer 2 (`record.md:36`); the class cannot tell a rendered page from a plan or spec (`reports/plan-researcher-r1-qa-plansize.md`, "Classes and rendered pages"); Docusaurus reads `../docs` minus `specs/**` and `plans/**` (`website/docusaurus.config.ts:151`, `:165`) |
| D3 | `delta-verbose` keeps S4's six-line definition, advisory. Plan 013-02's criterion becomes "no `unit-size`, `unit-oversize` or `unit-prewritten` code". `unit-prewritten` = a fenced block, or a run of 5 or more `>` lines, inside a unit. The unit-heading test reads only unindented `### ` lines outside fences, fixing plan 015's fake `Item` unit (red first). `b1` is measured at HEAD | All 20 of 013-02's delta entries run past six lines (qa-plansize return, "Measured unit spans"); plan 015 `:580` reads as unit `Item` today and fails the script |
| D4 | S7's Haiku clause is withdrawn: the economy class keeps `effort: low` on Claude | The `haiku` alias reaches Haiku 5.5, which accepts every level and defaults to `medium` (`reports/plan-researcher-r1-effort.md`, vendor facts (c)); dropping the key would raise the test-runner one level |
| D5 | Codex scale `low, medium, high, xhigh, max, ultra`. `minimal` stays in the union and in stored manifests and resolves on Codex to `low`; `config set … minimal` stays accepted where it is today; `max` is emitted as `max`; `ultra` joins `EFFORT_LEVELS` at the top (Claude clamps it to `max`); the two tests using `"ultra"` as an unknown level take another word | Codex config reference and subagents page list `ultra` … `low`, no `minimal`; the upstream enum still parses `Minimal` (effort return, vendor facts (a)); `test/roster/modelLadder.test.ts:897`, `:908` |
| D6 | **Settled at the plan gate (r2): emit.** Copilot's effort key is `reasoning-effort`, the spelling the 1.0.89 loader carries; the scale is the CLI reference's documented `low, medium, high, xhigh, max`; `minimal` is Copilot's legacy level as Codex's (open question 3, option 1); `ultra` clamps to `max`. The cloud-agent condition is waived by the gate's answer; the cloud agent's handling is an accepted risk (Risks, Follow-ups) | `reasoning-effort` in the 1.0.89 binary's literals and its shipped changelog (1.0.66, 1.0.88); the CLI reference's options table lists `low` … `max`; an unsupported level is reported and falls back, never stopping the agent (`reports/q6-test-runner-r1.md:25-29`, `:37-39`, `:53-61`); `record.md:63`, `:72` |
| D7 | `build/87`: Option A — name the closure re-review after an escalation in the frontier row; three recorded placements | `reports/plan-researcher-r1-effort.md`, "## build/87"; `reviewer` already sits in the frontier row (`src/roster/modelLadder.ts:181`) |
| D8 | `build/61`: the test-runner's CI-provider line renders `${STAMITY:CI_PROVIDER}` (client-independent); and **(settled at the plan gate, r2)** every emitted Copilot agent carries `include-custom-instructions: true` (REQ-FLOW-071), the gap q6 verified. The cloud-agent condition is waived by the gate's answer and the cloud handling is an accepted risk. The APM package's Copilot agents (`scripts/generate-apm-package.mjs:595-606`) are named in the census and the Follow-ups | All four adapters substitute repository tokens (`src/adapters/copilot.ts:818-829`; copilot return, "## build/61"); the vendor default for the key is `false`; q6: `quoted no` (`reports/q6-test-runner-r1.md:120-124`, `:144-150`); `record.md:63`, `:71` |
| D9 | `ledger inbox` prints every field through `sanitizeLabel` and screens every row, parsed or not, over its raw, invisible-stripped and normalized text (the union the resume card's `screenCard` composes, `src/runs/resumeCard.ts:697-707`) against the engine's full block-severity read catalog, the exfil-signal rows the session-start script drops included; a row failing the screen prints as `skipped: <line> (<pattern id>)`, never its text or its parse message. **Amended r3 (`plan/30`):** a parsed row the screen withholds whose severity and location each pass the screen alone still prints its line, severity and location as `withheld by the screen (<pattern id>); read it by hand`, and still matches by location (and `files:` from q9b); its description never prints | The inbox is unscreened user-tier state (injection-screening floor 1); the existing ledger outputs sanitise (`src/cli/commands/ledger.ts:89`); the session-start subset drops three exfil rows only because the emitted script must stay network-free (`src/hooks/scripts.ts:238-269`), which binds no engine-side reader; review r1 `plan/16`, `plan/17` (`record.md:80`); re-review r2 `plan/30`: three live rows (`.stamity/inbox.md:26`, `:33`, `:140`) hit the widened screen in their descriptions, and a run touching their files would lose them (`record.md:91-92`) |
| D10 | q1 code per `reports/plan-researcher-r1-inbox-ledger.md`: its own severity set with the legacy `Info`; `disposition.ts` wave 1, `inboxStore.ts` wave 2; `PLAN_MAP` rows; composition-root keys; a type import from `ledger.ts`; the `ledger.ts:679` dispatch branch; `FOREIGN_FLAGS` rows; `--due` from the injected clock; erasable syntax only; tests in `test/runs/`; the live-inbox test added to the inbox entry of `.stamity/change-classes.json`; hand-built fixtures; `problems` as `{line, message}` from q1 on | The research return's seams (`boundaries.test.ts:739-741`, `:1119-1135`; `root.test.ts:147-171`; `ledger.ts:679`; `testInputsGuard.test.ts:128-164`) |
| D11 | The critical-deferred row gains `· when: touched` before its tag (or `· by: <date>` when the user names one) | Rows below the schedule-rule heading need `by:` or `when:` (S14); the template carries neither (`content/commands/st-rework.md:199-200`) |
| D12 | S15 keywords may take a colon; `SCHEDULE_RULE_FROM = "2026-10-10"`; refusals follow `src/runs/ledgerStore.ts:945-951` (`why` and `next`); `ledgerStore.ts` is security-sensitive, so q9's code unit gets the security lens | 153 committed values start `cut` and many spell `cut:` (inbox-ledger return); `:923-929` carries no `next`; `.stamity/change-classes.json:6` |
| D13 | `/st-plan`'s shape gains optional `## Follow-ups` and `## Drop list` sections after Open questions | S17 points at a Drop list `/st-plan`'s shape does not define (`content/commands/st-plan.md:334-361`) |
| D14 | Dep-audit rows: `<Warning with an advisory, else Minor> · <manifest path:line> · <package> <current> → <target>, <risk class>[, <advisory id>] · source: dep-audit · by: <date> \| when: touched`. `/st-pr-resolve`'s "FIX — blocked" reply gets the DEFER row template. `close/6` per the writers-evals return | Step 5 names no grammar (`content/skills/st-dep-audit/SKILL.md:97-102`); the blocked reply promises a row with no template (`st-pr-resolve.md:255`) |
| D15 | q7 is seven cases (item 2 is two files: the UI case and its CLI-only benign twin; 134 → 141); the count literals in `scripts/eval/run.mjs:50` and `.stamity/overrides/skills/st-eval-run/SKILL.md:133,135` move | Writers-evals return, "Unanswered" 1 and "Eval set mechanics" |
| D16 | `review/174` and `close/13` fold into q7c, the one SET-v7 count writer (their trigger, the next SET-v7 edit, fires here); **confirmed at the plan gate** (`record.md:61`) | `.stamity/inbox.md:134`, `:151`; writers-evals return, "## review/174 and close/13" |
| D17 | The usage and count lines sit after the Proof block's field list, never directly above a table; `work-proof-block-fields`' claim and B8 change, and its `EXPECTED_MOVES` row is extended. **Amended r4 (`plan/39`):** the two lines part. A usage line is appended to the record as each phase or review round ends, as the capacity lines are, each its own line; the count line is a line of its own in the Proof block, written at the close. Neither is ever directly above a table. Both rule paragraphs keep their place in `/st-work`'s `### Proof block` section, after the field list and below the cut | `src/cli/docs/measurements.ts:842-850` takes a table's lead from the line above it; S12 contradicts the case's "every deferred row is appended"; q5's review r1, `review/8`: no Proof block exists while the run is going, and its sign-off (`record.md:128`) |
| D18 | One spec-merge unit at the end (a spec-author) merges the Spec delta, notes 074 to 077 in `everyday-flows.md`'s reservation line, updates `orchestrator-context.md`'s `- GIVEN` count and re-points every spec citation of a moved line | No test reads spec citations of `st-work.md` (room return, "Unanswered"); one writer per spec file |
| D19 | Lanes: integration `lean-flows-03` (every shared-file text unit, one writer per file, in order); lane A `lean-flows-03-lane-a` (f1, then the q1 and q9 code); lane D `lean-flows-03-lane-d` (the q4 code, then the q6 Copilot keys). No lane C (D23) | `record.md:42` |
| D20 | q1's Frame text names "the `ledger` verb's `inbox` query" and falls back to the whole file when it cannot run. **Amended r4 (`plan/38`):** the fallback is for a CLI that cannot run at all (absent, or it crashed) and for nothing else; a read the query refuses (a symbolic link, or over 1 MiB) is a finding naming the refusal, and the file is never read whole | `work.test.ts:1496-1498`: `**CLI calls.**` must precede the first backticked `stamity ledger`; q1a's review r1, `review/7`, and its sign-off (`record.md:124`) |
| D21 | `st-work.md` allocations after f0 (**amended r2, r3, r4**): q1 +400 characters above the cut and +3 lines (it also carries `review/1`'s `Plan:` sentence in Phase 2, since r3 the withheld-row clause, `plan/30`, and since r4 the CLI-only whole-file read and the refused-read clause, `plan/38`, inside the same numbers: q1t's cell tightens its two opening sentences and names two Phase 2 compressions); q2 +2 lines; q5 +3; q10 +14 (r3: the decided-rows rule, `plan/33`, and the Severity floor, `plan/35`); `build/87` +1; `build/61` 0; the last writer leaves at least 900 characters and 15 lines for Package 22 | f0 landed the index at 16,662 and the body at 454 lines (`record.md:98`); 16,662 + 400 = 17,062 leaves 938 characters, and 454 + 2 + 3 + 3 + 1 + 14 = 477 leaves 23 lines; `record.md:74`, `:101`. The text re-review's hand count put q1t at about +330 before r3 (`reports/plan-text-reviewer-r2.md`, "Allocations") |

### Declared defaults this re-plan adds (D22–D35)

Each is reversible at the plan gate and goes on the close list.

| # | Default | Why |
|---|---|---|
| D22 | `f1-erasable-guard`'s `requirements` cell opens with the literal `spec carries no ids`, then its frozen text; nothing else in either frozen cell moves | The structural coverage pass reads that literal and nothing else (`spec-plan-coverage.mjs`, the `missing-requirements` check); the unit's scope is unchanged |
| D23 | q3's script (`q3a`) rides lane D after the q4 code; no lane C | The data volume is 95% used (`record.md:20`); lane D is the shortest lane, so a third worktree shortens nothing |
| D24 | The always-show set lands whole in q1a: `critical-deferred` and `decision-waiting` | The persisted q10 put `decision-waiting` in `inboxStore.ts` later; one writer of the set avoids a second code unit on a text lane |
| D25 | The inbox screen runs in `src/cli/commands/ledger.ts` (wave 14), from its own `RegExp` copies of the three catalogs the session-start screen composes, in its order, at `block` severity, without its network-vocabulary filter (**amended r2**); `inboxStore.ts` stays a pure parser. **Amended r3 (`plan/30`):** the same screen runs once more over a withheld row's severity and location fields alone, and decides whether the row is listed `withheld` or only `skipped` | The session-start subset is not enough: it drops `remote-exec-pipe`, `send-data-external` and `image-url-exfiltration` only to keep the emitted script network-free (`src/hooks/scripts.ts:238-269`), and an inbox row printed into Frame is read by an agent that can reach the network; a wave-2 module stays free of the deny-scan catalogs; private copies avoid a shared `lastIndex` (`resumeCard.ts:143-152`) |
| D26 | `minimal` stays accepted on Codex through a new projection field `effortLegacy` (Codex `["minimal"]`, every other row `[]`), which `unexpressibleOn` skips; Claude keeps refusing `minimal` | `config set` refuses a level a selected client cannot express (`src/cli/commands/config.ts:436-480`); without the field Codex would start refusing it |
| D27 | `SCHEDULE_RULE_FROM`, the keyword grammar and the vague-trigger list live in `src/runs/disposition.ts` (wave 1), which `inboxStore.ts` imports | One list for the inbox rule and the `retired` grammar (S14, S15) |
| D28 | q9b adds the `## Rows under the schedule rule` heading at the end of `.stamity/inbox.md`, with one prose line under it and no row | The heading must exist before the first close that appends under it |
| D29 | L5 reads `L5 none\|<n> advisory` in the return lines | L5 is advisory and never fails (S4) |
| D30 | q2 states S3's kinds in a paragraph under the trigger table, not in a third column | `test/corpus/skills/flow.test.ts:687-704` pins the five trigger rows; a column would fill five cells with the same words |
| D31 | q4 splits into the union (`q4a`) and the Codex scale with `build/87`'s code (`q4b`); q6's Copilot work into the instructions key (`q6b`) and the effort key (`q6c`); q10 into `/st-work`'s close (`q10a`) and the other flows' pointers (`q10b`); q11 into three writer units; the q9 board text and q10's board block are one unit (`q9t`) | The ~400-line and 8-file ceiling, and one writer per shared file |
| D32 | `/st-quick`'s leftover sentence goes after its next-step paragraph, at the end of the body | No `quick-*` case range shifts |
| D33 | A lane merge that conflicts in the two golden snapshots, or in a reviewed-refresh ledger, regenerates the snapshots on the merge result (files first, `--update` last) and keeps both ledger entries; never a hand edit | Lane D's `q3a` changes an emitted script while integration changes content |
| D34 | No unit's `verify` runs the full suite; the branch's one full suite runs at Proof, alone, by a test-runner | `record.md:91` |
| D35 | The two notes the persisted plan meant for plans 014 and 015 go to this plan's Follow-ups with `when: touched` and their files, not into those plans' cells | No persisted unit listed those plan files; the scoped inbox read (q1) brings them back when either plan's run touches the files |

### Sign-offs and readings of review r1, applied in r2

The orchestrator's, recorded before this pass (`record.md:70-87`); binding as written. Each row names the cells it
moved.

| Ledger | Sign-off or reading | Cells |
|---|---|---|
| `plan/8`, `plan/21` (decision) | Both Copilot keys: q6b's gap branch and q6c's emit branch; the cloud-agent condition of D6 and D8 is waived; the cloud agent's handling is an accepted risk with its trigger (`record.md:71`) | D6, D8, q6b, q6c, REQ-FLOW-071, Security notes, Risks, Follow-ups |
| `plan/22` (decision) | Copilot's scale `low, medium, high, xhigh, max`; `minimal` legacy as Codex's; `ultra` clamps to `max` (`record.md:72`) | D6, q6c, REQ-LADDER-004 |
| `plan/1`, `plan/2` | q1t keeps "deferral inbox" and "overlap", folds `review/1`, and gets +350 characters; an overrun is compressed elsewhere in Phase 0 or Phase 2, never by moving the census pointer (`record.md:74`) | D21, q1t, the allocations |
| `plan/3` | q4t's frontier cell names no bare role word the parity tests read; the `:1649-1650` pins move with a dated note (`record.md:75`) | q4t |
| `plan/4` | Unattended, only the run's own ledger leftovers are appended `decision-waiting`; a touched or due inbox row stays as it is (no copy), is listed on `Not done:` and counts as scheduled (`record.md:76`) | q9t, q10a, q7b, REQ-FLOW-075, REQ-CTX-020 |
| `plan/5` | `/st-pr-resolve`'s deferral rows take the schedule grammar in its existing triage ask; no closing ask (`record.md:77`) | q10b |
| `plan/6` | `/st-quick` stays retirer-only: it asks only when it leaves a leftover, offering fix now or drop; "schedule" hands the item to a `/st-work` run or the board with no inbox append (`record.md:78`). **Superseded r3 by `plan/31`:** a refused item is never in the ask, and "schedule" names `/st-work`'s escalation, not the board. **Superseded r4 by `plan/40`:** the lane gains no leftovers ask at all | q10b, REQ-FLOW-077 |
| `plan/7`, `plan/23` | QA row 2 is the q6 check re-run once against q6b's emitted key, offered in the close's one question; without it the row is `accepted-unwalked` (`record.md:79`). **Superseded r3 by `plan/32`:** the re-run makes the row `auto-proven`; declined or unanswered, it is `not signed` | QA walk, q6b |
| `plan/16`, `plan/17` | q1a screens raw, stripped and normalized views, exfil rows included; unparsed lines pass the same screen; Frame reads the whole file only when the query cannot run (`record.md:80`). **Narrowed r4 by `plan/38`:** only when the CLI cannot run at all; a refused read is a finding, never a whole-file read | D9, D25, q1a, q1t, REQ-FLOW-068, Security notes |
| `plan/18` | Foreign-flag refusals keep today's exit 1 (`record.md:81`) | q1a |
| `plan/19` | q1a gains a threat row for `.stamity/change-classes.json`; the security lens reviews it (`record.md:82`) | q1a |
| `plan/20` | q4b's files add `test/emit/capabilityMatrix.test.ts` (`record.md:83`) | q4b, writer order |
| `plan/24` | `/st-rework`'s meta row takes the full row grammar (`record.md:84`) | q11b, REQ-FLOW-077 |

### Declared default this pass adds (D36)

Reversible at the close; it goes on the close list.

| # | Default | Why |
|---|---|---|
| D36 | `build/85` (folded into q6t): a `red` test-runner verdict writes nothing to the named report path and is returned in full, rows and excerpts; only a `green` verdict writes the report | `/st-work`'s return contract names "the test-runner on a green verdict" as the execution role that writes its report (`caa2beca:content/commands/st-work.md:160-164`), and the agent's own paragraph, "A green verdict may be digested; a red one never is." (from `content/agents/stamity-test-runner.md:144`, the row's locator `:144-146`), writes the report only on green; stating the absence closes the row with no behaviour change |

### Sign-offs and routings of re-review r2, applied in r3

The orchestrator's, recorded before this pass (`record.md:91-96`); binding as written. Each row names the cells it
moved.

| Ledger | Sign-off or routing | Cells |
|---|---|---|
| `plan/30` (decision; the reviewer's option 2) | A row the screen withholds still prints its line number, severity and location, and still matches by location and `files:`, whenever those fields alone pass the screen (else only its line number); its description never prints. Frame lists a matched withheld row as "withheld by the screen (<pattern id>); read it by hand", and the close lists it among the leftovers the same way. The three live rows stay as written: rewording a true finding until the screen misses it is the defect the injection-screening rule names (`record.md:92`) | D9, D25, q1a (amended r3, routed to its review), q9b, q1t, q9t, REQ-FLOW-068, Security notes, QA walk row 1, Risks |
| `plan/31` (decision) | An item `/st-quick` refused keeps its existing escalation route to `/st-work` and is never part of the leftovers ask, so no prompt unlocks a refusal; the ask covers only what the batch built within its thresholds (a finding its own checks raised), offering fix now or drop, and "schedule" there names `/st-work`'s escalation, not the board (`record.md:94`). **Superseded r4 by `plan/40`:** the lane gains no leftovers ask, so there is no ask for a refused item to be kept out of; its refusal and its route to `/st-work` stand as the lane already has them | q10b, REQ-FLOW-077 |
| `plan/32` | QA row 2 is `auto-proven` by the re-run's report when the close's answer approves the re-run, and `not signed` when it is declined or unanswered; never `walked`, never `accepted-unwalked` without the person's word (`record.md:95`) | QA walk row 2, Risks |
| `plan/33` | q10a rewrites "A row the run did not fix stays as it is" so the close's answer applies to the touched and due rows it decided: a drop retires and removes the row, a new place or date retires it and appends one row; q9t widens the Retirers' scope to match, the census count unchanged (`record.md:95`); read with D37 | q10a, q9t, REQ-FLOW-074 |
| `plan/34` | The leftovers set takes every `decision-waiting` row first (`record.md:95`) | q9t, q10a, q7b, REQ-FLOW-074, REQ-FLOW-075, REQ-CTX-020 |
| `plan/35` | q10a amends the Severity floor so Minor rows reach the person in the close's leftovers part, and `work-proof-block-fields` grades against the amended text (`record.md:95`) | q10a, D21, REQ-FLOW-074 |
| Minor (code re-review, left out) | q1a's test named "a string the first `SESSION_START_SCREEN` entry matches"; that entry, `fake-instruction-header`, is anchored to a heading line (`src/denyscan/denyScan.ts:873`), which a one-line row cannot carry; the test uses `never-verify` (`denyScan.ts:735`, block, in the session-start screen), which a one-line row can match (`record.md:91`) | q1a (amended r3, routed to its review) |
| Minor (code re-review, left out) | `test/cli/commands/config.test.ts:978-992` expects `codex=xhigh (clamped from max)`, red once Codex's scale holds `max`; inside q4b's files (`record.md:91`) | q4b (amended r3, routed to its review) |

### Declared defaults this pass adds (D37–D39)

Each is reversible at the close and goes on the close list.

| # | Default | Why |
|---|---|---|
| D37 | `plan/33`'s "a new place or date retires it and appends one row", read so that it agrees with S12 and REQ-FLOW-024: a **plan, board or handoff place** retires the row there (`scheduled <place> · by\|when …`, `ledger close` when it carries a `Ref:`) and removes its bullet, with no inbox append; a **new date or trigger** removes the bullet and appends one row under the schedule rule carrying the same `Ref:`, so its ledger row stays accounted for by that `Ref:` and takes no `retired` value; a **drop** retires it `cut <reason>` (a Critical or Warning `cut accepted risk: <reason>`) and removes its bullet. Each removal adds one `- inbox retired: <location> — <disposition>` record line, as a fixed row's does | q9a's place grammar has no inbox place (`plan, board, handoff`), so a re-dated row's ledger row could not be retired `scheduled …`; the records gate counts a `deferred` row accounted for by a dated `retired` value or by an inbox `Ref:` to it (`test/records/ledgers.test.ts:196-211`), so the same `Ref:` on the new row keeps it valid with no new grammar |
| D38 | Since q9b, a withheld row's `files:`, `by:` and tag word are also read for matching, each only when it alone passes the screen, so a withheld row still comes back when touched through `files:` or due, and a withheld `decision-waiting` or `critical-deferred` row still shows (`always`); the withheld line prints the matched tag word, never `when:`, `rationale:` or the description | `plan/30` names location and `files:`; without the tag and the date, a `decision-waiting` row whose description the screen holds would never reach the close `plan/34` makes ask it first, and a due one would never come back (S16) |
| D39 | At the close a withheld row is listed with its line, severity, location and `withheld by the screen (<pattern id>); read it by hand`, with no summary; its recommendation is to stay as it is until the person reads it (counted in s), and it is never pre-set to drop. The orchestrator never opens `.stamity/inbox.md` to read a withheld row's text: the person reads it | A recommendation needs the row's evidence, which the screen withholds from the agent; reading the line by tool would deliver the very text the screen refused (injection-screening floor 6) |

### Sign-offs of re-review r3, applied in r4

The orchestrator's, recorded before this pass (`record.md:124`, `:128`, `:134`, `:137-138`); binding as written. Each
row names the cells it moved. The pass adds no declared default.

| Ledger | Sign-off | Cells |
|---|---|---|
| `plan/38` (the sign-off on `review/7`, q1a's review r1) | Frame reads the whole file only when the CLI cannot run at all (absent, or it crashed); a refused read (a symbolic link, or over 1 MiB) is reported as a finding naming the refusal, and the file is never read whole. The refusal's own text tells the reader so, which is q1a's fix round (`record.md:124`) | D20, D21, the r1 row `plan/16`, `plan/17` (narrowed), q1t, REQ-FLOW-068, Security notes |
| `plan/39` (the sign-off on `review/8`, q5's review r1) | Usage lines are appended to the run record as each phase or review round ends, as the capacity lines are, each its own line and never directly above a table; the rule's text stays below the re-attach cut (`record.md:128`). The leftovers count line has one place in every cell that names it: a line of its own in the Proof block, never directly above a table. q5's cell is built and frozen; its fix round carries the usage paragraph | S8 (marked), D17, q10a, s1, REQ-CTX-019, REQ-CTX-020 |
| `plan/40` (decision; the reviewer's default) | `/st-quick` gains no leftovers ask, and S11's clause is withdrawn. Its text says only that the lane appends no inbox row and that what it cannot finish escalates to `/st-work`, whose close asks (`record.md:138`) | S11 (marked), the r1 row `plan/6` and the r2 row `plan/31` (superseded), q10b, REQ-FLOW-077, Security notes. No q7 case assumed the ask: none of the seven sources `/st-quick`'s lines (q7a, q7b) |
| `build/10`, `build/11` (q9a's two Minors, each a decision) | A trigger, a `fixed` reference or a `cut` reason made only of vague and filler words is refused, for all three kinds; a look-alike spelling is out of scope (`record.md:134`). q9a's fix round builds it in `src/runs/disposition.ts`; q9b's inbox-side `when:` check uses that same rule | q9b |

## Common rules every unit follows

- **Files and size.** A unit's `files` cell is its boundary. A unit stays near 400 changed lines and 8 files. Two kinds
  of file do not count toward the 8: the two golden snapshots (`test/corpus/__snapshots__/emissionGoldens.test.ts.snap`,
  `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`), regenerated; and a range-only `source:` shift in an eval
  case with its SET-v7 index cell. A re-quote counts. A unit that crosses 8 says why in its edge cases.
- **Goldens.** Any `content/**` edit regenerates both snapshots, files first and `--update` last (learning
  `vitest-update-flag-takes-an-optional-value`):
  `npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update`. Add one dated
  "Reviewed refreshes" entry in `test/corpus/emissionGoldens.test.ts` (from `:93`) and the matching ledger line in
  `test/emit/crossClientGoldens.test.ts`. A golden that moves with no content change in the unit is a stop: find the
  cause.
- **Eval moves** (learning `corpus-line-shifts-move-eval-case-source-ranges`). A case is
  `evals/cases-v6/<golden|adversarial|probes>/<id>.md`.
  1. A shifted range updates the case's `source:` and its SET-v7 case-index source cell (held equal by
     `test/evals/roster.test.ts:120-125`).
  2. Changed quoted text is re-quoted byte for byte from the landed file; `[...]` marks an omission
     (`test/evals/locators.test.ts:111-118`, `:524-546`).
  3. A moved Expected block of a case with a cases-v5 copy gets a dated addition to its existing `EXPECTED_MOVES` value
     in `test/evals/successorInputs.test.ts:72-182`; never a second key. A case with no v5 copy is recorded by the
     SET-v7 paragraph alone.
  4. A case that stops being byte-identical to its v5 copy moves the identical and moved counts in `evals/README.md`
     and SET-v7, which `test/evals/readmeCurrency.test.ts:89-147` derives.
  5. Each unit that moves a case writes one dated SET-v7 paragraph: "**N `/st-x` ranges moved, 2026-10-10 (plan 019
     file 3, unit `<id>`).**", with the edit and its line delta, each case as `old → new` ("checked by hand" where no
     block is quoted), and "dated citations stay".
  6. `npx vitest run test/evals` is green at the unit's end, except in the declared q7 window.
- **The `/st-work` case set.** These cases source `content/commands/st-work.md` lines (room return, "Eval ranges that
  move"); a unit that adds or removes lines above a range shifts it: `golden/work-persisted-plan-asks-once`,
  `adversarial/security-content-exempt-from-truncation`, `adversarial/digest-security-finding-carried-in-full`,
  `golden/work-capacity-rung-classes-stop-notices`, `golden/implementer-unresolvable-cell-blocked-dependency`,
  `golden/work-pointer-dispatch-shape`, `golden/work-unclear-class-runs-the-full-gate`,
  `adversarial/work-cap-round-escalates-not-round-four`, `golden/work-light-cap-round-escalates-open-finding`,
  `adversarial/work-install-script-bump-keeps-security-lens`, `golden/work-security-lens-auth-path-change`,
  `golden/work-proof-block-fields`, `probes/probe-none-work-run-qa-checkpoint` (no quoted block: checked by hand) and
  `adversarial/benign-optional-step-skipped-proceeds`. Six more quote `st-work.md` text with no range there
  (`quick-scan-hit-stops-batch-value-withheld`, `re-review-closures-fresh-reviewer`,
  `work-gate-red-after-fix-escalates-fixer`, `test-runner-red-verdict-never-digested`,
  `work-security-lens-light-tier-file-deletion`, `work-lockfile-only-bump-audit-before-lens`): they move only if their
  quoted words change. For any other file, find the cases with a search for `source: <path>` under `evals/cases-v6`.
- **Budgets of `st-work.md`.** After every unit that edits it, measure and record both numbers in the report:
  `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))'`
  stays below 18,000 (`REATTACH_BUDGET_CHARS`, `test/corpus/commands/work.test.ts:378-395`), and the body stays within
  500 lines (`work.test.ts:69`, `:421-425`). Neither budget is ever raised.
  - **Allocations** (D21, amended r2, r3), measured against the numbers the unit before it recorded: `q2-qa-rows` 0
    characters above the cut and +2 lines; `q5-usage-lines` 0 and +3; `q1t-frame-inbox-read` +400 and +3 (from
    16,662 after f0: at most 17,062); `q4t-ladder-placement-text` 0 and +1; `q10a-work-close` 0 and +14.
    `q6t-test-runner-ci-line` does not touch `st-work.md`.
  - A unit that cannot meet its allocation moves words into the file its text points at (the qa skill, `/st-board`'s
    Deferral inbox section), never into a raised budget; q1t alone compresses elsewhere in Phase 0 or Phase 2 instead,
    since its census pointer is pinned where it stands (`record.md:74`). `q10a-work-close`, the last writer, records the room left for
    Package 22 (18,000 minus the index, 500 minus the body lines): at least 900 and 15.
- **Moved pins.** A moved or rewritten pin carries a dated `TEST CHANGE, justified (2026-10-10, <unit id>)` note naming
  what about the contract changed (the testing rule's item 5). A new behaviour's test is seen red first.
- **Generated pages are regenerated, never hand-edited.** `docs/cli-reference.md` and `docs/configuration.md`:
  `node scripts/generate-docs.mjs`. `docs/capability-matrix.md`: `node scripts/generate-capability-matrix.mjs`.
- **Dogfood copies** (`.claude/**`, `.agents/**`, `.apm/**`, `AGENTS.md`, `.stamity/manifest.json`) move in
  `q8-dogfood-sync` only. A unit whose test is red only on a stale copy runs `npm run build && node dist/cli.js sync`,
  commits the copies and names them in its report.
- **CLI form in corpus text.** Inside `st-work.md`, a backticked `stamity ledger …` may appear only below the
  `**CLI calls.**` bullet (`work.test.ts:1496-1498`). In a body with no CLI-calls or "Running the CLI" paragraph
  (`st-board.md`, `st-rework.md`, `st-pr-resolve.md`, the dep-audit skill), name a verb without the `stamity ` prefix
  ("the `ledger` verb's `inbox` query", "`ledger inbox --due`").
- **The inbox path in corpus text.** Any content file that names `.stamity/inbox.md` and matches
  `/append|land|routed|deferr/i` counts as a writer (`test/corpus/commands/board.test.ts:595-604`, exactly five). No
  unit adds the literal path to a file that does not already carry it.
- **Erasable syntax** in every new or edited `src/` file: no `enum`, no namespace with values, no parameter property
  (learning `plain-node-imports-of-src-need-erasable-syntax`; after `f1-erasable-guard`, `npm run typecheck` refuses
  them).
- **Lane runs.** Each lane runs `npm run build` before any whole-suite run (learning
  `a-fresh-worktree-lane-builds-before-its-full-suite`); no lane runs `git stash` (learning
  `git-stash-is-shared-across-worktrees`); builders run their cell's `verify`, lint and typecheck only (`record.md:91`).

## Lanes and single-writer ownership

One git worktree per lane under `~/Projects/zomarit/.stamity-worktrees/stamity/`, prepared at 09:06Z
(`record.md:42`). Inside a lane, units run in the order shown and one unit writes at a time. A file listed for two lanes
is never edited by both; a cross-lane need is a `depends_on` and a lane merge.

| Lane | Worktree / branch | Units, in order | Files the lane owns |
|---|---|---|---|
| Integration | `p23f3-integration` / `lean-flows-03` | f0 (built) → q2 → q5 → q6t → *(lane A, step 1)* → q1t → *(lane D, step 1)* → q3b → q4t → *(lane A, step 2)* → q9t → q10a → q10b → q11a → q11b → q11c → *(lane D, step 2)* → q7a ∥ q7b → q7c → s1 → q8 | every `content/**`, corpus-test, eval and spec file below; `test/cli/docs/measurements.test.ts` (q5); `test/evals/successorInputs.test.ts`; `scripts/eval/run.mjs`; `.stamity/overrides/skills/st-eval-run/SKILL.md`; the dogfood copies (q8) |
| A, code | `p23f3-lane-a` / `lean-flows-03-lane-a` | f1 (built) → q1a → q1b → *(merge, step 1)* → q9a → q9b → *(merge, step 2)* | `tsconfig.json`, `test/ci/workflowExpression.ts`, `src/runs/inboxStore.ts` (new), `src/runs/disposition.ts` (new), `src/runs/ledgerStore.ts`, `src/cli/commands/ledger.ts`, `src/composition/root.ts`, `test/architecture/boundaries.test.ts`, `test/runs/inboxStore.test.ts` (new), `test/runs/ledgerInbox.test.ts` (new), `test/runs/disposition.test.ts` (new), `test/runs/ledgerClose.test.ts`, `test/records/ledgers.test.ts`, `.stamity/change-classes.json`, `.stamity/inbox.md` (the heading only), `docs/cli-reference.md` |
| D, code | `p23f3-lane-d` / `lean-flows-03-lane-d` | q4a (building) → q4b → q3a → *(merge, step 1)* → q6b → q6c → *(merge, step 2)* | `src/types/core.ts`, `src/roster/modelLadder.ts`, `src/adapters/codex.ts`, `src/adapters/copilot.ts`, `src/cli/commands/config.ts`, `test/types/domain.test.ts`, `test/roster/modelLadder.test.ts`, `test/adapters/codex.test.ts`, `test/adapters/copilot.test.ts`, `test/manifest/manifest.test.ts`, `test/cli/commands/config.test.ts`, `test/emit/capabilityMatrix.test.ts`, `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, `test/authoring/specPlanCoverage.test.ts`, `docs/capability-matrix.md`, `docs/configuration.md` |
| q7 case branches | `p23f3-lane-a` / `lean-flows-03-cases-a` and `p23f3-lane-d` / `lean-flows-03-cases-d`, each branched from integration after q11c, once lanes A and D have merged (open question 2, default applied) | q7a; q7b | new case files only |

`q6-copilot-charter-check` ran outside every lane (a scratch repository, done 09:23Z, `quoted no`; `record.md:93-97`).

**Merge points.** Lane A step 1 after q1b's review and a lane A full suite; step 2 after q9b's review and the
security lens. Lane D step 1 after q3a's review; step 2 after q6c's review. Each merge is a fast-forward or a merge
commit into `lean-flows-03` made by the orchestrator; golden-snapshot conflicts follow D33. The two q7 case branches
merge in either order before q7c.

**Shared-file writer order** (integration unless a row says otherwise; one writer at a time):

| File | Writers, in order |
|---|---|
| `content/commands/st-work.md` | f0 → q2 → q5 → q1t → q4t → q10a (the last writer records the Package 22 room) |
| `test/corpus/commands/work.test.ts` | f0 → q2 → q5 → q1t → q4t → q10a |
| `evals/SET-v7.md` | f0 → q2 → q5 → q6t (only if a case quotes the edited test-runner lines) → q1t → q3b → q4t → q9t (only if a case quotes `st-board.md`) → q10a → q10b → q11a → q11b → q11c → q7c |
| `content/commands/st-board.md`, `test/corpus/commands/board.test.ts` | q9t |
| `content/commands/st-plan.md`, `test/corpus/commands/plan.test.ts` | q3b → q11a |
| `content/commands/st-rework.md`, `content/commands/st-pr-resolve.md`, `test/corpus/commands/feedbackPair.test.ts` | q10b → q11b |
| `test/evals/successorInputs.test.ts` | q10a → q11a (only if an Expected block moves) → q11b (same) |
| `evals/README.md` | q11b (only if a carried case's byte-identity moves) → q7c |
| eval case files two units name | the integration order; `work-proof-block-fields`: f0 → q2 → q5 → q1t → q4t → q10a; `work-persisted-plan-asks-once`: f0 → q2 → q1t → q10a; `pr-resolve-next-step-derived-from-run-state`: q10b → q11b; `rework-next-step-derived-from-run-state`: q10b → q11b; `plan-semantic-ambiguity-survives-structural-pass` and `plan-lint-three-fails-returns-blocked-ambiguity`: q3b → q11a |
| the two golden snapshots | every content unit in its lane's order; lane merges by D33 |
| `test/records/ledgers.test.ts` | lane A: q1b → q9a → q9b |
| `src/cli/commands/ledger.ts`, `docs/cli-reference.md` | lane A: q1a → q9b |
| `src/composition/root.ts`, `test/architecture/boundaries.test.ts` | lane A: q1a → q9a |
| `src/runs/inboxStore.ts`, `test/runs/inboxStore.test.ts`, `test/runs/ledgerInbox.test.ts` | lane A: q1a → q9b |
| `src/roster/modelLadder.ts`, `test/roster/modelLadder.test.ts`, `src/cli/commands/config.ts`, `test/cli/commands/config.test.ts` | lane D: q4a (tests only) → q4b → q6c |
| `src/adapters/copilot.ts`, `test/adapters/copilot.test.ts`, `docs/capability-matrix.md` | lane D: q4a (matrix only) → q4b (matrix only) → q6b → q6c |
| `test/emit/capabilityMatrix.test.ts` | lane D: q4b (the Codex scale row's date pin) → q6b (only if it pins the agent format) → q6c || `content/agents/stamity-test-runner.md`, `test/corpus/agents/quality.test.ts` | q6t (with `build/85`) |
| `test/cli/docs/measurements.test.ts` | q5 |

## Units

Frame units, built and approved; their cells are frozen (D1, D22).

### f1-erasable-guard: `tsconfig.json` refuses syntax Node's type stripping cannot run

Built: `d826ac5c` on `lean-flows-03-lane-a`, approved with f0 in the Frame review (`record.md:92`, `:101`); cell frozen
(lane A).

| Field | Content |
|---|---|
| `id` | f1-erasable-guard |
| `requirements` | spec carries no ids — none in the spec (a build guard; inbox row `2026-10-08_product-core/build/17`) |
| `files` | `tsconfig.json`; `test/ci/workflowExpression.ts` |
| `interfaces` | `tsconfig.json` `compilerOptions` gains `"erasableSyntaxOnly": true` beside `verbatimModuleSyntax`. The three errors it raises today (TypeScript 7.0.2) are the parameter properties of `class Parser`'s constructor at `test/ci/workflowExpression.ts:131-133` (`private readonly tokens`, `context`, `expression`): make them plain `private readonly` fields declared in the class body and assigned in the constructor, no behaviour change. |
| `testCriteria` | GIVEN `npx tsc --noEmit -p tsconfig.json` THEN exit 0 with no `TS1294`. GIVEN a scratch file with an `enum` or a parameter property (not committed) THEN `npm run typecheck` fails with `TS1294` (red first, then removed). GIVEN the four suites importing the helper THEN green. |
| `edgeCases` | Any other error the flag raises at HEAD of the lane → fix it the same way and name it in the report; never add a suppression comment. |
| `depends_on` | none |
| `verify` | `npm run typecheck && npm run lint && npx vitest run test/ci/workflow.test.ts test/ci/upstreamWorkflow.test.ts test/ci/forkReleaseWorkflow.test.ts test/ci/packSigningRehearsal.test.ts` |

- amended 2026-10-10: the `requirements` cell opens with the literal `spec carries no ids` the coverage pass reads
  (D22); scope unchanged (this re-plan, before any commit of the unit).

### f0-make-room: room in `st-work.md` above the re-attach cut and under the line cap

Built: `0b03f126` and `caa2beca` on `lean-flows-03` (index 16,662, body 454 lines), approved with its security lens at 0
findings (`record.md:98`, `:101`); cell frozen (integration).

| Field | Content |
|---|---|
| `id` | f0-make-room |
| `requirements` | REQ-CTX-014 (what a resumed run needs ends before the re-attach cut); no new requirement. Inbox rows `2026-10-08_product-core/build/1` and `close/10`. |
| `files` | `content/commands/st-work.md`; `test/corpus/commands/work.test.ts`; the eval cases whose `source:` ranges or quoted text this unit shifts (range and re-quote edits only, listed in `reports/plan-researcher-r1-room.md` "## Eval ranges that move") with their `evals/SET-v7.md` case-index cells and one dated SET-v7 paragraph; the two golden snapshots and their reviewed-refresh ledger entries (`test/corpus/emissionGoldens.test.ts`, `test/emit/crossClientGoldens.test.ts`); the dogfood copies only if a test is red on them alone. |
| `interfaces` | Duty-preserving compressions only, from the candidate table in `reports/plan-researcher-r1-room.md` ("## Make-room candidates"): A1, A2, A3, A4, A6, A7, A8, A9, A10, A12, A13, A14, A18, A20 (no test change); R1 (rewrap the unquoted blocks above the cut to at most 100 columns, `.editorconfig`), never the CLI-calls bullet `:149-150` (byte-identical, `test/corpus/cliCallForm.test.ts`); M1 (Frame step 5's four head lines and the `reports/` `.gitignore` move into the Proof block's record paragraph, below the cut; Frame keeps a one-line pointer and the records-are-files sentence; the six `work.test.ts:612-623` expectations move scope with a dated `TEST CHANGE, justified` note); M2 (the review-gate-hook clause of the cap bullet moves into the Intensity client-events paragraph; `work.test.ts:877` moves scope with a dated note); R2 (rewrap the unquoted blocks below the cut the same way). Keep quoted lines as they are unless their cases are re-quoted in this unit: `:239-245`, `:251-260`, `:267-274`, `:491-496`. Then `close/10`: in both Dials cells (light `:448`, standard `:449`) "or with no class from `gate classify`" becomes "or with no class from `gate classify` or a `reason` naming a failed read", matching the Specialist pass at `:283-285`, with a new pin. |
| `targets` | Measured at base: `"\n### Specialist pass\n"` at 17,858, body 498 lines. After this unit: the index at most 16,700 (at least 1,300 under 18,000) and the body at most 465 lines. Report both numbers before and after, measured with `node -e 'const t=require("fs").readFileSync("content/commands/st-work.md","utf8");console.log(t.indexOf("\n### Specialist pass\n"))'` and the corpus's body-line count. Neither budget (`REATTACH_BUDGET_CHARS`, `BODY_LINE_CAP`) is ever raised. |
| `testCriteria` | GIVEN `test/corpus/commands/work.test.ts` THEN green: the re-attach cut, the 500-line cap, every phrase pin, and the new `close/10` pin. GIVEN `npx vitest run test/evals` THEN green: every shifted range re-anchored in its case and its SET-v7 index cell, every re-quote byte-identical with the landed file. GIVEN `git diff -w --word-diff` on `st-work.md` THEN only the candidates' wording changes and the two moves show; a rewrap changes no word. GIVEN `npx vitest run test/corpus` THEN green. |
| `edgeCases` | A candidate whose pin cannot move without changing the contract → skip it and name it in the report. A golden that moves with no content change → stop and find the cause. `**CLI calls.**` (`:149`) keeps coming before the first backticked `stamity ledger` in the body (`work.test.ts:1496-1498`). Spec citations of `st-work.md` lines drift silently (no test reads them); list the ones this unit moves in the report for the spec merge, do not edit `docs/specs`. |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/commands/work.test.ts test/corpus test/evals test/ci/apmPackage.test.ts && npm run lint && npm run typecheck`; goldens with the files first and the flag last: `npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update` |

The live check, outside every lane.

### q6-copilot-charter-check: does a Copilot sub-agent receive the charter?

Done 09:23Z: `quoted no` on Copilot CLI 1.0.89 (`reports/q6-test-runner-r1.md`; `record.md:93-97`). With the plan
gate's answer it decided q6b (gap branch) and q6c (emit branch).

| Field | Content |
|---|---|
| `id` | q6-copilot-charter-check |
| `requirements` | REQ-FLOW-071 |
| `files` | `.stamity/runs/2026-10-10_next-tier/reports/q6-test-runner-r1.md` (the check's report); one line in `.stamity/runs/2026-10-10_next-tier/record.md`, written by the orchestrator. No product file |
| `interfaces` | The procedure of `reports/plan-researcher-r1-copilot.md`, "## Live-check procedure": a scratch repository outside every checkout, `node <main checkout>/dist/cli.js init -y --tools copilot` (the main checkout's `dist/` rebuilt at 09:13Z, `record.md:44`), one non-interactive `copilot -p` session whose orchestrator dispatches `stamity-implementer` through its `task` tool with `--available-tools=task,read_agent,list_agents`, asking for the agent's first line under `# implementer` and the `Invariants version` line. Plus a read of the installed CLI's own agent loader for the frontmatter keys it parses (`include-custom-instructions`; `reasoning-effort` or `reasoningEffort`) and whether an unknown key is ignored. Record line: `- <UTC> q6-copilot-charter-check: copilot <version> sub-agent charter: quoted yes\|no`, with the route, the model, the usage figures and the `dist/` state |
| `testCriteria` | GIVEN the check THEN the report states `quoted yes`, `quoted no` or `inconclusive`, judged on the sub-agent's own `task` result (exactly one `task` call to `stamity-implementer`, no charter text in its prompt, no tool call by the sub-agent), with the CLI version. GIVEN the loader read THEN the report names the effort key spelling it parses, the values it accepts, and whether the cloud agent's documented keys make an unknown key safe |
| `edgeCases` | No `task` call, a call to another agent, or a load failure → inconclusive; one re-run with `--excluded-tools=view,glob,grep,rg,bash` in place of `--available-tools`, noted in the record. The route needs an account action → QA row 2 becomes a person row. A process that outlives 300 s is stopped by its PID (and its child PIDs), never by name |
| `depends_on` | none |
| `verify` | the orchestrator reads the report and writes the record line; no test runs |

Lane A: the inbox store, its query, and the schedule grammar.

### q1a-inbox-store: the inbox parser in `src/` and the `ledger inbox` query

| Field | Content |
|---|---|
| `id` | q1a-inbox-store |
| `requirements` | REQ-FLOW-068, REQ-FLOW-075 |
| `files` | `src/runs/inboxStore.ts` (new); `src/cli/commands/ledger.ts`; `src/composition/root.ts`; `test/architecture/boundaries.test.ts`; `test/runs/inboxStore.test.ts` (new); `test/runs/ledgerInbox.test.ts` (new); `.stamity/change-classes.json`; `docs/cli-reference.md` (generated) |
| `interfaces` | **Module `src/runs/inboxStore.ts`** (pure, erasable syntax, wave 2; imports `LEDGER_FILE` from `./layout.ts` only). `export const INBOX_PATH = ".stamity/inbox.md"`. `export const INBOX_SEVERITIES = ["Critical", "Warning", "Minor", "Info"] as const` (`Info` the legacy fourth, as `test/support/ledgerGrammar.ts:106` admits it). `export const ALWAYS_SHOW_TAGS = ["critical-deferred", "decision-waiting"] as const` (D24). `export interface InboxRow { readonly line: number; readonly severity: string; readonly location: string; readonly description: string; readonly source: string; readonly ref: string \| null; readonly tag: string \| null }`. `export interface InboxProblem { readonly line: number; readonly message: string }`. `export function parseInbox(text: string): { rows: InboxRow[]; problems: InboxProblem[] }` — the rules of `test/records/ledgers.test.ts:130-190` moved as they are: only lines starting `- ` are rows; split on `" · "`; `source:` at index 3 or later; severity in the set; non-empty location, description and writer; the description is fields 2 to `source` joined back; an optional `Ref:` straight after `source:`, refused as in `refProblem` (`:74-86`: a bare path, or `<path>#<anchor>`; a bare path ending `ledger.jsonl` is refused); then at most one tag word. Each message is the test's message without its `.stamity/inbox.md:<n>: ` prefix (the line goes in `line`). `export function locationPaths(location: string): string[]` — split on `,`; from each entry strip backticks, cut at the first space, cut at the first `:`; keep an entry holding a `/` or a `.`; so `nightly.yml:219-221,241-246,280` gives `["nightly.yml"]`, `src/cli/commands/gate.ts GitReadError` gives `["src/cli/commands/gate.ts"]`, `README.md:1, docs/getting-started.md:5` gives both, `—` gives none. `export type MatchedBy = "path" \| "ref" \| "plan" \| "area" \| "always" \| "all"`. `export function matchInbox(rows, query: { paths: readonly string[]; plan?: string; area?: readonly string[] }): { matched: { row: InboxRow; matchedBy: MatchedBy }[]; unmatched: number }` — paths POSIX-normalised (`\` to `/`, a leading `./` and a trailing `/` dropped); an entry matches a query path when equal, when the query path starts with the entry plus `/` (the entry names a folder), when the entry starts with the query path plus `/` (the query names a folder), or when the entry has no `/` and the query path ends with `/` plus the entry; `ref` matches when the `Ref:` path (before `#`) is a query path; `plan` when the `Ref:` path or a location entry equals the plan path; `area` (case-folded words) only for a row whose location yields no path, a query word matching when it equals a whole word, case-folded, of the row's location or description; a row tagged with an `ALWAYS_SHOW_TAGS` word always matches (`always`); no filter at all matches every row (`all`). **CLI** (`src/cli/commands/ledger.ts`): `const INBOX = "inbox"`; `choices([APPEND, CLOSE, STATUS, INBOX])` (`:659`); the dispatch at `:679` becomes `args[0] === CLOSE \|\| args[0] === STATUS \|\| args[0] === INBOX ? args[0] : APPEND`, and `if (subcommand === INBOX) return await runInbox(ctx, opts)`; options `--paths <paths...>`, `--plan <path>`, `--area <words...>`; `import type { InboxRow } from "../../runs/inboxStore.ts"` and the value through `ctx.engine.runs.inboxStore`. `FOREIGN_FLAGS[INBOX]` refuses `run` (owners append, close, status), `phase`, `source`, `stdin`, `report`, `ids`, `id`, `state`, `rationale`, `retired`; the append, close and status rows gain `paths`, `plan`, `area` (owner inbox). The summary at `:653` gains "and read the deferral inbox". `runInbox`: `requireStateDir` as `runStatus` does (`:608`); reads `<root>/.stamity/inbox.md` with `lstat` (a regular file, never a link, at most 1 MiB, else a `VALIDATION_ERROR` with `why` and `next`); an absent file prints `inbox: absent` and reports total 0. **Screen (D9, D25, amended r2):** `const INBOX_SCREEN = [...LEARNINGS_INJECTION_PATTERNS, ...CONTENT_DENY_PATTERNS, ...INJECTION_PATTERNS].filter((e) => e.severity === "block").map((e) => ({ id: e.id, re: new RegExp(e.pattern.source, e.pattern.flags) }))`, the three catalogs, `INVISIBLE_SMUGGLING_CHARS` and `normalizeForDenyScan` imported from `../../denyscan/denyScan.ts`: the session-start screen's catalogs in its order (`src/hooks/scripts.ts:265-269`) without its network-vocabulary filter, so `remote-exec-pipe`, `send-data-external` and `image-url-exfiltration` stay in. `function screenInboxLine(text: string): string` returns the first id whose copy matches any of three views, `text`, `stripped = text.replace(INVISIBLE_SMUGGLING_CHARS, "")` and `normalizeForDenyScan(stripped)`, resetting `lastIndex` before each test (the union `screenCard` composes, `src/runs/resumeCard.ts:697-707`), else `""`. Every `- ` line is screened before anything of it prints, a parsed row and an unparsed one alike: a hit prints `skipped: <line> (<pattern id>)` and never the row's text nor its parse message. **Withheld rows (amended r3, `plan/30`; routed to the unit's review):** a hit on a line that parses, whose severity and location fields each pass `screenInboxLine` on their own, is a withheld row. The CLI hands `matchInbox` a copy holding only its line, severity and location (description `""`, `source` `""`, `ref` and `tag` `null`), so it matches by location as any row does; when it matches, it prints `<line> <severity> · <location> · withheld by the screen (<pattern id>); read it by hand (<matchedBy>)` in place of its `skipped:` line, and its description, source, `Ref:` and tag never print. A hit on an unparsed line, on a row whose severity or location fails the screen alone, or on a withheld row the query does not match prints only `skipped: <line> (<pattern id>)`. Every printed field passes `sanitizeLabel` (`:11`). **Output:** stdout first line `inbox: <total> rows · <matched> matched · <unmatched> unmatched · <problems> unparsed · <skipped> skipped` (an unparsed line the screen hits counts under `skipped`, not `unparsed`; a withheld row counts under `skipped` and, when it matches, under `matched` too, amended r3), then per matched clean row `<line> <severity> · <location> · <description>[ · <tag>] (<matchedBy>)` and per matched withheld row the line above, then per clean unparsed line `unparsed: <line>: <message>`. JSON `{inbox: ".stamity/inbox.md", total, matched: [{line, severity, location, description, source, ref, tag, matchedBy, withheld}], counts: {Critical, Warning, Minor, Info}, unmatched, problems: [{line, message}] (clean lines only), skipped: [{line, pattern}] (parsed and unparsed)}`; `withheld` is `null` on a clean row and the pattern id on a withheld one, whose `description`, `source`, `ref` and `tag` are `null` (amended r3). Exit 0 for any report; `--dry-run` is accepted and changes nothing. **Wiring:** `src/composition/root.ts` imports `* as runsInboxStore from "../runs/inboxStore.ts"` (`:92-96`), types `readonly inboxStore: typeof runsInboxStore` (`:251-257`), values `inboxStore: runsInboxStore` (`:443-449`); `PLAN_MAP` gains `"src/runs/inboxStore.ts": { unit: "q1a-inbox-store", wave: 2 }` with a one-line comment (`boundaries.test.ts:333-336` style). `.stamity/change-classes.json`'s `.stamity/inbox.md` entry (`:39-49`) lists `test/runs/inboxStore.test.ts` |
| `testCriteria` | Red first. GIVEN this repository's `.stamity/inbox.md` THEN `parseInbox` returns no problem and one row per `- ` line, the count read from the file at test time. GIVEN hand-built rows (no fixture names a real inbox row): a row at `src/cli/commands/config.ts:829-849` and a `docs/plugins.md` row, and `paths: ["src/cli/commands/config.ts"]` THEN the first matches by `path` and the second does not. GIVEN a location `README.md:1, docs/getting-started.md:5` THEN a query for `docs/getting-started.md` matches. GIVEN `gate.ts GitReadError` THEN `src/cli/commands/gate.ts` matches by basename. GIVEN a prose location THEN only `area` matches it: `--area ledger` matches a prose row whose description holds the word `ledger` and not one holding only `ledgers`. GIVEN `--paths src/runs/` (a folder) THEN a row at `src/runs/inboxStore.ts:1` matches by `path`. GIVEN a row tagged `critical-deferred` or `decision-waiting` THEN it matches every query (`always`). GIVEN `ledger inbox --paths src/a.ts --json` in a temporary project (the `cliAt` helper of `test/runs/ledgerClose.test.ts:1594-1616`) THEN the JSON document above. GIVEN a fixture row whose description carries a string the `never-verify` entry matches (`src/denyscan/denyScan.ts:735`; a one-line row can carry it, while the first `SESSION_START_SCREEN` entry, `fake-instruction-header`, needs a heading line), built at run time from fragments, and a query that does not match the row THEN stdout carries `skipped: <line> (never-verify)` and none of the row's words (amended r3, routed to the unit's review). GIVEN that row at `src/a.ts:3` and `--paths src/a.ts` THEN stdout carries `<line> Warning · src/a.ts:3 · withheld by the screen (never-verify); read it by hand (path)` and none of its description's words, and the JSON's matched entry carries `withheld: "never-verify"` with `description`, `source`, `ref` and `tag` `null`; GIVEN the string in the location field instead THEN only `skipped: <line> (never-verify)`, the row unmatched; GIVEN an unparsed line carrying it THEN only `skipped:` (amended r3, `plan/30`, routed to the unit's review). GIVEN the same string split by an invisible character THEN it is skipped too (the stripped view). GIVEN a row carrying a string the `send-data-external` row matches (built from fragments) THEN it is skipped (the exfil rows are in). GIVEN a line that fails to parse, its trailing field carrying a screened string THEN it prints as `skipped:` with no `unparsed:` line and none of its words, and JSON `problems` omits it. GIVEN `INBOX_SCREEN`'s ids THEN they hold every `SESSION_START_SCREEN_PATTERN_IDS` entry and `remote-exec-pipe`, `send-data-external` and `image-url-exfiltration`. GIVEN `ledger inbox --run x` or `ledger status --paths a` THEN exit 1 with `error.code` `USAGE` naming the owner, as every foreign-flag refusal exits today (`test/runs/ledgerClose.test.ts:1734-1740`). GIVEN `ledger append` and `ledger status` THEN they run as before (`test/runs/resumeCardParity.test.ts:1233-1242`, `test/runs/ledgerClose.test.ts:1726-1742` green). GIVEN `test/architecture` and `test/composition` THEN the waves, the registry and reachability hold. GIVEN `docs/cli-reference.md` THEN byte-equal to the generator's output |
| `edgeCases` | An inbox row that does not parse → screened first; a clean one is listed under `problems` and counted; the query still answers for the rows that parse, and Frame does not fall back to the whole file for it (q1t). A catalog row added to the deny-scan module later → it joins the screen with no edit here, which the id test above keeps honest. A `—` location with no other match → shows only by `always` or `all`. A query path with a trailing slash → treated as a folder prefix. The literal inbox path in a test is a declared read, so the change-classes entry lands in this unit (`test/ci/testInputsGuard.test.ts:128-164`). A module only the root reaches fails reachability (`boundaries.test.ts:1119-1135`); the type import from `ledger.ts` is the edge. A true finding whose description the screen matches (three live rows today, `.stamity/inbox.md:26`, `:33`, `:140`) → withheld, still matched by its location; the row is never reworded to pass (amended r3, `plan/30`, routed to the unit's review) |
| `depends_on` | f1-erasable-guard |
| `verify` | `node scripts/generate-docs.mjs && npx vitest run test/runs test/records test/architecture test/composition test/cli/docs test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` |
| `threat` | Two boundaries. (1) `.stamity/inbox.md`, user-tier state any writer can author, printed into Frame's context: a row, parsed or not, carrying a directive, an invisible-character split, a forged marker or an exfil link. Stops it: the screen above over three views and the full block catalog, `sanitizeLabel` on every printed field, a hit printing only `skipped: <line> (<id>)` or, for a withheld row, only its line, severity and location, each of which passed the screen on its own (amended r3, `plan/30`, routed to the unit's review), and the parser reading strings without opening a path. (2) `.stamity/change-classes.json`, built-in `security-sensitive` (`src/change/classify.ts:640-646`): what every later change runs. Abuse: an edit riding the new entry that narrows or retargets the inbox entry's test list (`.stamity/change-classes.json:39-49`), so a later inbox-only change skips the records gate. Stops it: the edit only adds `test/runs/inboxStore.test.ts` to that entry and removes nothing, checked by the security lens against the diff; the class file is read from the base commit, so this change cannot set its own class |

### q1b-records-gate-parser: the records gate reads the inbox through the shared parser

| Field | Content |
|---|---|
| `id` | q1b-records-gate-parser |
| `requirements` | REQ-FLOW-068 |
| `files` | `test/records/ledgers.test.ts` |
| `interfaces` | Delete the private `InboxBullet`, `InboxParse`, `parseInbox`, and the inbox-only `refProblem`, `REF_PATH`, `REF_ANCHORED` and `INBOX_PATH` (`:34`, `:65-86`, `:109-190`); import `parseInbox` and `INBOX_PATH` from `../../src/runs/inboxStore.ts`. `inboxRefs` (`:193-194`) reads `row.ref` as before. Where a problem is printed or matched, render it as `` `${INBOX_PATH}:${problem.line}: ${problem.message}` ``. Add one parity assertion: `[...INBOX_SEVERITIES]` equals `[...SEVERITIES]` from `test/support/ledgerGrammar.ts`. One dated `TEST CHANGE, justified` note: the parser moved to `src/` so the query and the gate read one grammar; no message and no verdict changed |
| `testCriteria` | GIVEN `npx vitest run test/records` THEN green, with the fixture pins at `:451-485` passing on the same substrings. GIVEN the severity parity assertion THEN green |
| `edgeCases` | A fixture pin that matched the old prefixed string → it matches the rendered string; the message text never changes |
| `depends_on` | q1a-inbox-store |
| `verify` | `npx vitest run test/records test/runs/inboxStore.test.ts && npm run lint && npm run typecheck` |

### q9a-disposition: a `retired` value names a fix, a cut or a scheduled place

| Field | Content |
|---|---|
| `id` | q9a-disposition |
| `requirements` | REQ-FLOW-076, REQ-FLOW-024 |
| `files` | `src/runs/disposition.ts` (new); `src/runs/ledgerStore.ts`; `src/composition/root.ts`; `test/architecture/boundaries.test.ts`; `test/runs/disposition.test.ts` (new); `test/runs/ledgerClose.test.ts`; `test/records/ledgers.test.ts` |
| `interfaces` | **Module `src/runs/disposition.ts`** (pure, no internal import, wave 1, erasable syntax; D27). `export const SCHEDULE_RULE_FROM = "2026-10-10"`. `export const VAGUE_TRIGGERS = ["later", "someday", "eventually", "tbd", "hygiene batch"] as const`. `export function isIsoDate(text: string): boolean` (`YYYY-MM-DD` naming a real calendar day). `export function vagueTrigger(trigger: string): string \| null` — the trigger lower-cased and trimmed of trailing punctuation equals a list word, or contains `hygiene batch`; returns the word. `export type Due = { readonly by: string } \| { readonly when: string }`. `export type Place = { kind: "plan"; path: string; anchor: string } \| { kind: "board"; item: string } \| { kind: "handoff"; path: string }`. `export type Disposition = { kind: "fixed"; ref: string } \| { kind: "cut"; reason: string } \| { kind: "scheduled"; place: Place; due: Due }`. `export function parseDisposition(text: string): { ok: true; value: Disposition } \| { ok: false; problem: string }`. Grammar: a keyword `fixed`, `cut` or `scheduled`, optionally followed by `:` (D12), then whitespace and a non-empty rest. `fixed <rest>`: free text (`fixed in <run id>`, `fixed by /st-quick`). `cut <rest>`: free text (`cut accepted risk: <reason>` included). `scheduled <place> · by <YYYY-MM-DD>` or `scheduled <place> · when <trigger>` (`by:` and `when:` also accepted), split at the last `" · "`; a place is `plan docs/plans/<file>.md#<unit-id or follow-ups>`, `board <item ref>` or `handoff <path>`; a vague or empty trigger, a date that is not a day, or any other shape is `ok: false` with a one-line problem naming what is missing. **`retireRow`** (`src/runs/ledgerStore.ts:912-978`): inside the rewrite callback, after the `unchanged` branch (`:954-962`, so a re-run of a recorded value stays `unchanged`) and before a new value is written, when `retiredDate(req.now) >= SCHEDULE_RULE_FROM` call `parseDisposition(text)`; a problem throws `EngineError("ledger close --retired refused: <problem>", { code: "VALIDATION_ERROR", why: "from 2026-10-10 a retirement names how the deferral left: fixed, cut, or scheduled to a place with a date or a trigger", next: "write fixed <ref>, cut <reason>, or scheduled <place> · by <YYYY-MM-DD> \| when <trigger>" })`, the `why` and `next` pattern of `:945-951`. **Records gate** (`test/records/ledgers.test.ts`): `retiredProblems(ledgerPath, rows): string[]` — a `retired` value whose leading date is on or after `SCHEDULE_RULE_FROM` must parse once the date is stripped; a new `it` holds every tracked ledger to it; earlier values are never checked. **Wiring:** root key `runs.disposition` (`src/composition/root.ts`, the three places q1a used); `PLAN_MAP` `"src/runs/disposition.ts": { unit: "q9a-disposition", wave: 1 }`; `ledgerStore.ts` imports it by value, which is the reachability edge |
| `testCriteria` | Red first. GIVEN `parseDisposition` THEN `fixed in 2026-10-10_x`, `fixed by /st-quick`, `cut: out of scope`, `cut accepted risk: no exploit path`, `scheduled plan docs/plans/015-board-writes.md#b1-board-contract · by 2026-11-01` and `scheduled board #42 · when touched` are accepted; `scheduled later`, `scheduled plan x.md#u1 · when later`, `scheduled board #42 · by 2026-02-30`, `moved somewhere` and `fixed` (no rest) are refused, each naming its problem. GIVEN `ledger close --retired "scheduled later"` with the clock at 2026-10-10 THEN exit 1 with `why` and `next`, and the ledger byte-unchanged; GIVEN the clock at 2026-10-09 THEN accepted as before. GIVEN a re-run of a recorded pre-cutover value after the cutover THEN `unchanged`. GIVEN every existing `ledgerClose.test.ts` case (`:789-981`, `:1618-1743`, all `fixed …`) THEN green. GIVEN a fixture ledger row `retired: "2026-10-10 scheduled later"` THEN `retiredProblems` names it; GIVEN `"2026-10-09 scheduled to L2, trigger: x"` (`ledgers.test.ts:371`'s shape) THEN it is not checked. GIVEN the tracked ledgers THEN no problem |
| `edgeCases` | A value written today by this run before q9a merges and outside the grammar → the gate names it on the integration branch; the run retires only with `fixed in <run id>` until then (Risks). A place whose plan file does not exist → accepted (a place is text, never opened). A disposition over 2,000 characters or empty → refused by the length check first, as today (`:922-930`) |
| `depends_on` | q1b-records-gate-parser |
| `verify` | `npx vitest run test/runs test/records test/architecture test/composition && npm run lint && npm run typecheck` |
| `threat` | Boundary: the `--retired` argument an orchestrating session passes, and the committed ledger under the store's lock. Trusted: the injected clock and the ledger file. Abuse: a value worded to read as scheduled with no real place or date ("scheduled later"), or one carrying control characters, so a deferral leaves the inbox and is never seen again. Stops it: `committedText` strips and caps the value before parsing (`:920-930`); the grammar refuses a vague or empty trigger and an unreal date; a place is text and is never resolved or opened; refusals write nothing |

### q9b-inbox-schedule-grammar: inbox rows carry a place, a date or a trigger, and come back when due

| Field | Content |
|---|---|
| `id` | q9b-inbox-schedule-grammar |
| `requirements` | REQ-FLOW-076 |
| `files` | `src/runs/inboxStore.ts`; `src/cli/commands/ledger.ts`; `test/runs/inboxStore.test.ts`; `test/runs/ledgerInbox.test.ts`; `test/records/ledgers.test.ts`; `.stamity/inbox.md` (the heading only); `docs/cli-reference.md` (generated) |
| `interfaces` | **Row grammar (S14):** `- <sev> · <location> · <description> · source: <writer> [· Ref: …] [· by: <YYYY-MM-DD> \| · when: <trigger>] [· files: <path>, <path>] [· <tag>] [· <YYYY-MM-DD>] [· rationale: <rest of line>]`. After `source:` and the optional `Ref:`, fields come in any order, each at most once, read by prefix: `by: ` (a real day, `isIsoDate`), `when: ` (non-empty), `files: ` (comma-separated paths), one tag word (no space, no colon), one bare `YYYY-MM-DD` (the deferral date), and `rationale: ` last, taking the rest of the line, ` · ` included. Problems: an unknown `word: value` field (`unknown field \`<word>:\``); a field twice; `by:` and `when:` both; a bad date; and a trailing field that is none of these (a bare field holding a space, such as `two words`, or a second bare tag word) keeps today's message unchanged, `trailing field(s) beyond one optional tag word — <the fields>`, so the pins at `test/records/ledgers.test.ts:470-471` pass as they are. `InboxRow` gains `by: string \| null`, `when: string \| null`, `files: string[]`, `deferredOn: string \| null`, `rationale: string \| null`, `belowRule: boolean`. **The rule section:** every `- ` row after the line `## Rows under the schedule rule` (to the end of the file) is `belowRule`, and must carry `by:` or `when:` (problem otherwise); a `when:` value `vagueTrigger` names is a problem; `when: touched` needs a path from `locationPaths(location)` or `files:` (problem otherwise). `parseInbox` imports `isIsoDate` and `vagueTrigger` from `./disposition.ts` (wave 1). **The vague-words rule (amended r4; `build/10`, `build/11`, signed off, `record.md:134`):** q9a's fix round widens the rule in `src/runs/disposition.ts`: a trigger, a `fixed` reference or a `cut` reason made only of vague and filler words is refused, for all three kinds, so `when later on` is refused, where `vagueTrigger` at `2d5124ea` names only a trigger equal to a list word (`2d5124ea:src/runs/disposition.ts:73-87`); a look-alike spelling stays out of scope. The inbox-side `when:` check is that same rule: `parseInbox` calls the check `disposition.ts` exports for a trigger at lane A's head after the fix round (`vagueTrigger`, if the fix round keeps the name), and `inboxStore.ts` holds no word list, no filler list and no test of its own, so a `when:` an inbox row may carry is exactly a trigger `parseDisposition` accepts after `scheduled <place> · when`. **Matching:** `files:` entries match like location entries (`matchedBy: "path"`). `matchInbox`'s query gains `due?: string`; a row whose `by:` is on or before `due` matches as `"due"`; rows carrying `when:` and matched by nothing else are counted as `triggers`. **Withheld rows (amended r3, `plan/30`, D38):** the copy q1a hands `matchInbox` for a withheld row also carries its `files:`, its `by:` and its tag word, each only when it passes `screenInboxLine` on its own, so a withheld row matches by `files:` (`path`), by `--due` (`due`) and by an `ALWAYS_SHOW_TAGS` word (`always`); its withheld line gains `· <tag>` when the tag matched, and never prints `when:`, `rationale:` or the description; JSON's withheld entry gains `by` and `files` as screened, `when` `null`. **CLI:** `--due [date]` (commander optional value) on `inbox`; with no value the date is `ctx.app.runtime.clock.now().toISOString().slice(0, 10)`; a value that is not a day is a `USAGE` refusal; `FOREIGN_FLAGS` gains `due` (owner inbox) on the append, close and status rows. The summary line gains `· <due> due · <triggers> triggers` when `--due` is given; JSON gains `due: <date \| null>`, `triggers: <n>`, and per matched row `by`, `when`, `files`. **`.stamity/inbox.md`** (D28) gains, at its end, the heading `## Rows under the schedule rule`, a blank line, and one prose line: "Rows appended from 2026-10-10 on carry `by: <YYYY-MM-DD>` or `when: <trigger>`, and `files:` when the location is `—`." |
| `testCriteria` | Red first. GIVEN today's inbox with the heading added THEN no problem. GIVEN `/st-rework`'s critical-deferred template with D11's field, built from its protocol text with the placeholders filled (`Critical · src/a.ts:9 · c · source: rework main · when: touched · critical-deferred · 2026-10-10 · rationale: we ship, the flag is off`) THEN it parses, and on the q1a parser it fails "beyond one optional tag word" (seen red first). GIVEN a row below the heading with neither `by:` nor `when:`, or with `when: later`, or `when: touched` at `—` with no `files:` THEN each is a problem naming its line. GIVEN a row below the heading with `when: later on`, a trigger made only of vague and filler words THEN a problem naming its line, the verdict `parseDisposition` gives `scheduled board #42 · when later on` after q9a's fix round; GIVEN `when: the next edit of src/a.ts` THEN no problem (amended r4, `build/10`). GIVEN two `by:` fields, or an `owner: x` field THEN a problem. GIVEN a description containing ` · ` THEN it parses (fields after `source:` read by prefix). GIVEN `ledger inbox --due 2026-12-01 --json` THEN rows with `by:` on or before it match as `due` and `when:` rows only count in `triggers`; GIVEN `--due` with no value and the `cliAt` clock at 2026-11-02 THEN that date is used. GIVEN a row whose description carries a `never-verify` string (built from fragments), at `—` with `files: src/b.ts` and `by: 2026-11-01`, untagged THEN `--paths src/b.ts` lists it withheld by `path` and `--due 2026-12-01` by `due`; GIVEN the same row tagged `decision-waiting` THEN a query matching nothing else lists it withheld by `always`, with `· decision-waiting`; none of its description's words prints in any case (amended r3, `plan/30`, D38). GIVEN the records gate (`ledgers.test.ts`, "parses every bullet") THEN it fails on a fixture inbox holding a below-heading row with no `by:`/`when:` and passes the real one |
| `edgeCases` | A row above the heading with no schedule fields → valid, as every older row is. A later `## ` heading below the rule heading → still inside the rule section (the section runs to the end of the file). An inbox-only change (the heading) runs the inbox entry's tests in CI's records lane, `test/runs/inboxStore.test.ts` among them since q1a. q9a's fix round had not landed when this cell was amended (lane A at `2d5124ea`) → the unit reads the trigger check `disposition.ts` exports at its own base and follows the landed name and signature, naming it in its report; where the fix round exports no one check a trigger can be handed to → BLOCKED_DEPENDENCY naming the gap, never a copied list (amended r4) |
| `depends_on` | q9a-disposition |
| `verify` | `node scripts/generate-docs.mjs && npx vitest run test/runs test/records test/cli/docs && npm run lint && npm run typecheck` |

Lane D: the effort ladder, the plan-size script, and the Copilot keys.

### q4a-effort-union: `ultra` joins the effort union

Building on lane D against the frozen copy `reports/plan-r1.md` (`record.md:87`); review r1 raised nothing on it, and
this pass leaves its cell as it was. A later finding on it goes to its own review.

| Field | Content |
|---|---|
| `id` | q4a-effort-union |
| `requirements` | REQ-LADDER-004, REQ-LADDER-001 |
| `files` | `src/types/core.ts`; `test/types/domain.test.ts`; `test/roster/modelLadder.test.ts`; `test/manifest/manifest.test.ts`; `test/cli/commands/config.test.ts`; `docs/configuration.md` (generated); `docs/capability-matrix.md` (generated) |
| `interfaces` | `src/types/core.ts:119`: `export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"] as const` (D5); `effortRank` reads 0 to 6; the doc comment (`:100-118`) says `ultra` is the top level one client documents. No class default moves (`src/roster/modelLadder.ts:182`, `:189`, `:196`, `:203`), so no emitted byte moves. The two tests using `"ultra"` as the unknown level (`test/roster/modelLadder.test.ts:893-902`, `:904-910`) use `"unbounded"` instead. Pins, each with its dated note: the tuple and ranks (`test/types/domain.test.ts:58-72`); the manifest refusal naming the union (`test/manifest/manifest.test.ts:726`); the config out-of-band refusal naming seven levels (`test/cli/commands/config.test.ts:908`). New assertions: `nearestExpressibleEffort("ultra", "claude")` is `"max"` and `("ultra", "codex")` is `"xhigh"` (until q4b); `config set effort.frontier ultra` on a manifest selecting `claude` exits 1 naming `claude` and "ends at max"; on `cursor` alone it persists |
| `testCriteria` | Red first: the clamp assertions fail before the tuple moves. GIVEN `npx vitest run test/types test/roster test/manifest test/cli/commands/config.test.ts` THEN green. GIVEN `docs/configuration.md` and `docs/capability-matrix.md` THEN byte-equal to their generators' output. GIVEN the cross-client golden THEN unchanged without `--update` |
| `edgeCases` | A manifest storing `ultra` is refused by an engine older than this change (`modelLadder.ts:494-497`): a downgrade after setting it needs the key removed first (Risks). A golden that moves → stop: no default moved |
| `depends_on` | none |
| `verify` | `node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && npx vitest run test/types test/roster test/manifest test/cli/commands/config.test.ts test/emit test/adapters test/cli/docs && npm run lint && npm run typecheck` |

### q4b-codex-scale: Codex's current scale, `minimal` as a legacy level, and the third recorded placement

| Field | Content |
|---|---|
| `id` | q4b-codex-scale |
| `requirements` | REQ-LADDER-004, REQ-LADDER-001, REQ-LADDER-003 |
| `files` | `src/roster/modelLadder.ts`; `src/adapters/codex.ts`; `src/cli/commands/config.ts`; `test/roster/modelLadder.test.ts`; `test/adapters/codex.test.ts`; `test/cli/commands/config.test.ts`; `test/emit/capabilityMatrix.test.ts` (added r2: its scale-row date pin); `docs/capability-matrix.md` (generated); `docs/configuration.md` (generated) |
| `interfaces` | **Projection type (D26):** `ClientModelProjection` gains `readonly effortLegacy: readonly EffortLevel[]` — levels a client's documented scale dropped that its own parser still accepts; `stamity config set` accepts them for that client, and the emission writes the nearest documented level. Rows: `codex: ["minimal"]`, every other row `[]`. **Codex row** (`src/roster/modelLadder.ts:412-435`): `effortScale: ["low", "medium", "high", "xhigh", "max", "ultra"]`; `effortScaleCitation: { url: "https://learn.chatgpt.com/docs/config-file/config-reference", accessDate: "2026-10-10" }`; the comment at `:420-424` says the reference lists `low` through `ultra`, levels depend on the model, and `minimal` is legacy. `nearestExpressibleEffort` is unchanged: `minimal` on Codex rises to `low` and `max` stays `max`. **Config** (`src/cli/commands/config.ts:436-451`): `unexpressibleOn` skips a tool whose `effortLegacy` holds the level, before the clamp test. **Codex capability row** (`src/adapters/codex.ts:337-343`): its value states the scale `low … ultra` (config reference, accessed 2026-10-10) and that `minimal` is accepted and written as `low`; no other Codex row moves. **`build/87` (D7, code half):** the header at `src/roster/modelLadder.ts:31-34` reads "Three placements no frontmatter can declare ARE recorded here, each named in the `rationale` of the row carrying it: the reviewer's escalation to the top class for the whole-branch pass, the one closure re-review after a fixer escalation, which the review loop runs a class above the reviewer's own, and the fixer's drop to the cheapest class once a round is mechanical."; the frontier `rationale` (`:184`) gains "It also takes the one closure re-review after a fixer escalation, which the review loop runs a class above the reviewer's own." "TWO FLOW PLACEMENTS ARE NOT RECORDED HERE" (`:36`) stays. **Pins**, each with its note: `modelLadder.test.ts:728` matches "three placements no frontmatter can declare ARE recorded here"; `:749` the Codex scale; `:773-797` the access date per row (Codex 2026-10-10, Claude and Cursor 2026-09-17); `:811` becomes `nearestExpressibleEffort("ultra", "claude")` is `"max"`; `:832` Codex `max` is `max`; `:834` Codex `minimal` is `low`; `:863-868` becomes `manifestWith(["claude", "codex"], { frontier: "ultra" })` → `["effort [claude]: frontier asks for ultra; this client's scale ends at max, emitted max"]`; a new case: `manifestWith(["codex"], { economy: "minimal" })` → one `starts at low, emitted low` line; `test/adapters/codex.test.ts:686-694` (`max` emitted as `max`) and `:696-703` (`minimal` emitted as `low`); `test/cli/commands/config.test.ts:928-944` becomes `ultra` refused on `claude`, and `:959-976` stays (refused on `claude` only, `not.toContain("codex")`), with an explicit codex-only acceptance; `:978-992` ("marks the clamped client in the list when a narrower client joined later", which expects `codex=xhigh (clamped from max)` and goes red once Codex's scale holds `max`) seeds `frontier: "ultra"` on `["claude", "codex"]` and expects `claude=max (clamped from ultra)` and `codex=ultra`, still the narrower client marked, with its note (amended r3, routed to the unit's review); `test/emit/capabilityMatrix.test.ts:295`, which holds every `effort-scale` capability row to `/accessed 2026-09-17/`, reads each row's own access date instead (Codex 2026-10-10, the others 2026-09-17), with its note: the Codex row was re-read, the rule that each row is dated did not change |
| `testCriteria` | Red first: the Codex `max` and `minimal` emissions and the codex-only `minimal` acceptance fail before the row moves. GIVEN the Codex emit THEN no agent carries `minimal`, the reviewer still reads `model_reasoning_effort = "high"` (`codex.test.ts:542`), and an operator `max` is written as `max`. GIVEN `config set effort.economy minimal` on a codex-only manifest THEN it persists; on a manifest selecting `claude` THEN refused as today. GIVEN `config list` over a stored `frontier: "ultra"` on `claude` and `codex` THEN `claude=max (clamped from ultra)` and `codex=ultra` (amended r3, routed to the unit's review). GIVEN `ladderProse()` THEN the three-placement sentence and the unchanged two-flow-placement header both hold, and no fixer row's rationale matches `/escalat/` (`:705`). GIVEN `test/emit` and the generated pages THEN green and byte-equal |
| `edgeCases` | A Codex model that advertises fewer levels (GPT-6 Luna stops at `max`, GPT-6 Astra at `xhigh`, effort return, vendor facts (a)) → the engine knows no model unless one is pinned, so it writes what the class or the operator asks; the class defaults (`high`, `medium`, `low`) sit on every model's scale, and the capability row says levels depend on the model. A parity test that reads `/st-work`'s ladder table → unchanged here; the table text moves in q4t. Nine files, two of them generated pages, kept whole: the projection row, its adapter row, the config refusal and their pins are one contract. A file outside this list that builds a `ClientModelProjection` literal by hand fails typecheck on the new required field (not searched at review, `reports/plan-code-reviewer-r1.md`, "Could not be reached") → return BLOCKED_DEPENDENCY naming it, never widen the boundary unasked |
| `depends_on` | q4a-effort-union |
| `verify` | `node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && npx vitest run test/roster test/adapters test/cli/commands/config.test.ts test/emit test/cli/docs && npm run lint && npm run typecheck` |

### q3a-plan-size-script: plan-lint L5 in the coverage script

| Field | Content |
|---|---|
| `id` | q3a-plan-size-script |
| `requirements` | REQ-FLOW-070 |
| `files` | `content/skills/st-verify/scripts/spec-plan-coverage.mjs`; `test/authoring/specPlanCoverage.test.ts`; the two goldens |
| `interfaces` | **Unit heading (D3):** a unit starts only at a raw line that begins `### ` (no leading whitespace) outside a fence; the existing test on `clean(row.text)` (`:161`) runs only on such a line, so an indented `` `### Item text is data` `` continuation (plan 015 `:580`) is no unit. **Unit span:** from the heading to the line before the next unfenced unindented `### ` or `## ` heading; trailing blank lines are not counted. Keep the raw lines beside `linesOf` (which blanks fenced text, `:8-19`). **Codes**, each `{ code, path, line: <the unit's or entry's heading line>, message }`, all added to `ADVISORY_CODES` (`:95`): `unit-size` (span over 60 lines, at most 100) and `unit-oversize` (over 100), message `<unit> spans <n> lines`; `unit-prewritten` (a fence marker line, or a run of 5 or more raw lines starting with optional spaces and `>`, inside the span), message `<unit> carries prewritten text at line <n>`; `delta-verbose` (a Spec delta entry, from a `###`–`######` `REQ-` heading to the line before the next heading, holding more than six non-blank lines below its heading; the heading line itself is not counted), message `<id> runs <n> lines`, `<n>` counting the same lines. Findings are emitted after the units loop and before the status (`:235`); advisory codes never fail it. The return object's shape is unchanged |
| `testCriteria` | Red first: the plan 015 case reads unit `Item` and fails before the heading fix. GIVEN `docs/plans/015-board-writes.md` THEN status `pass`, no unit `Item`, and `b1-board-contract` carries `unit-oversize` and `unit-prewritten` (its line count measured at HEAD and pinned). GIVEN `docs/plans/013-optimization-sweep-02.md` THEN no `unit-size`, `unit-oversize` or `unit-prewritten` code. GIVEN `docs/plans/017-docs-overhaul-01.md` THEN `a1-docs-contract` is counted whole (its embedded `##` sit inside a fence). GIVEN synthetic plans THEN an indented `### X` makes no unit; 61 and 101 span lines give `unit-size` and `unit-oversize`; one fence or five `>` lines give `unit-prewritten`; a delta entry of a heading and seven non-blank lines gives `delta-verbose` and one of a heading and six does not; each with status `pass`. GIVEN `specPlanCoverage.test.ts:29`, `:151`, `:178` THEN still `findings: []` |
| `edgeCases` | A `####` sub-heading inside a unit → stays inside the span. A plan with no units section → the existing `missing-units` finding only. The emitted copies (`.claude/skills/st-verify/scripts/`, `.agents/…`) move in q8 |
| `depends_on` | q4b-codex-scale |
| `verify` | `npx vitest run test/authoring && node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/015-board-writes.md docs/specs && npm run lint`, then the goldens command |

### q6b-copilot-instructions-key: Copilot sub-agents load the repository instructions (the gap q6 verified)

| Field | Content |
|---|---|
| `id` | q6b-copilot-instructions-key |
| `requirements` | REQ-FLOW-071 |
| `files` | `src/adapters/copilot.ts`; `test/adapters/copilot.test.ts`; `test/emit/capabilityMatrix.test.ts` (only if it pins the agent format); `docs/capability-matrix.md` (generated); the two goldens |
| `interfaces` | **Branch: gap (filled r2).** q6 read `quoted no` on Copilot CLI 1.0.89 (`reports/q6-test-runner-r1.md:120-124`), and the plan gate chose both keys, waiving D8's cloud-agent condition (`record.md:63`, `:71`). `buildAgentFile` (`src/adapters/copilot.ts:452-461`) writes `["name: <id>", "description: …", "target: github-copilot", "include-custom-instructions: true", "tools: …", ...modelLine]`; prompt files gain nothing. `agentsFormat` (`:158-159`) names the key. A capability row `sub-agent-instructions` reads: "emitted — `include-custom-instructions: true` on every agent (Copilot CLI changelog 1.0.86; the key sits in the 1.0.89 loader's frontmatter keys); a live sub-agent check on Copilot CLI 1.0.89 (2026-10-10) found that an agent without it loads no `AGENTS.md`; `--no-custom-instructions` still overrides it; the cloud agent's handling of the key is undocumented (custom-agents configuration page, accessed 2026-10-10)", dated inline as the hooks row is (`:259`), without re-stamping `ACCESS_DATE` (`:139`). The row claims the key's effect from the changelog, and the live check only for the gap; the effect is QA row 2's to re-check. `test/adapters/copilot.test.ts:457-462`'s exact list gains the line, with its note. **Census:** the plugin packager relocates these files (`scripts/plugins/clients/copilot.mjs:93-94`): reconciled; the APM package writes its own Copilot agents with `name` and `description` only (`scripts/generate-apm-package.mjs:595-606`): `1 unreconciled`, named in the report and in this plan's Follow-ups (one row with q6c's). The test-runner's side of `build/61` is closed by q6t on every client |
| `testCriteria` | Red first: GIVEN every corpus agent THEN its Copilot file carries the key after `target` and before `tools`; GIVEN a prompt file THEN no such key; GIVEN the capability row THEN present, naming the changelog version, the live check's version and date, the override flag and the cloud agent's undocumented handling; GIVEN `docs/capability-matrix.md` THEN byte-equal to the generator's output |
| `edgeCases` | A client flag `--no-custom-instructions` overrides the key (vendor reference) → the capability row says so. The cloud agent warns, ignores or refuses the key → unverified; an accepted risk (Risks, Follow-ups), and the row never claims the cloud agent honours it. Each sub-agent spawn grows by about the `AGENTS.md` size (`reports/q6-test-runner-r1.md:149`) → named in the report, no code change. The Copilot agent hash rows of the cross-client golden move (`crossClientGoldens.test.ts.snap:1447-1456`, `:2848-2857`): a reviewed refresh |
| `depends_on` | q6-copilot-charter-check, q3a-plan-size-script |
| `verify` | `node scripts/generate-capability-matrix.mjs && npx vitest run test/adapters/copilot.test.ts test/emit test/ci/apmPackage.test.ts && npm run lint && npm run typecheck`, then the goldens command |

### q6c-copilot-effort-key: Copilot's effort key (D6)

| Field | Content |
|---|---|
| `id` | q6c-copilot-effort-key |
| `requirements` | REQ-LADDER-004 |
| `files` | `src/roster/modelLadder.ts`; `src/adapters/copilot.ts`; `src/cli/commands/config.ts`; `test/roster/modelLadder.test.ts`; `test/adapters/copilot.test.ts`; `test/cli/commands/config.test.ts`; `test/emit/capabilityMatrix.test.ts`; `docs/capability-matrix.md` (generated); `docs/configuration.md` (generated); the two goldens |
| `interfaces` | **Branch: emit (filled r2,** `record.md:63`, `:72`**).** The Copilot row (`src/roster/modelLadder.ts:387-411`) becomes `effortCarrier: "key"`, `effortKey: "reasoning-effort"` (the spelling the 1.0.89 loader carries; whether it also accepts `reasoningEffort` is unverified, `reports/q6-test-runner-r1.md:49-51`), `effortScale: ["low", "medium", "high", "xhigh", "max"]` (the CLI reference's documented `--reasoning-effort` values, read 2026-10-10, `:56`), `effortScaleCitation: { url: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference", accessDate: "2026-10-10" }`, `effortLegacy: ["minimal"]` (Copilot's legacy level as Codex's, open question 3, option 1: `config set` accepted any level on a copilot-only selection before), the "documented omission" comment rewritten to say an unsupported level is reported and falls back to the session's, never stopping the agent (`:57-60`). `nearestExpressibleEffort` is unchanged: `minimal` rises to `low`, `ultra` clamps to `max`. `buildAgentFile` gains `efforts: EffortMap = {}` and appends `` `${key}: ${level}` `` after `modelLine`, the level from `resolveEffortValue(<model_class>, "copilot", efforts)`, the manifest's effort map threaded from the emission context as `src/adapters/codex.ts:1033-1039` does; prompt files carry none. The `effort-axis` capability row (`copilot.ts:180-186`) reads "emitted — `reasoning-effort: <level>` per agent, on the scale `low` … `max` (Copilot CLI reference, accessed 2026-10-10; the key in the 1.0.89 loader and its changelog, 1.0.66 and 1.0.88); a level the model does not offer is reported and falls back to the session's; the cloud agent's handling of the key is undocumented (custom-agents configuration page, accessed 2026-10-10)". `EFFORT_HINT` (`src/cli/commands/config.ts:272-275`) drops its "omitted on …" clause when no client omits effort, and the `unexpressibleOn` comment (`:428-435`) loses the copilot-only sentence. **Census:** the APM package's Copilot agents (`scripts/generate-apm-package.mjs:601-606`, `name` and `description` only) carry no effort key: `1 unreconciled`, the same Follow-ups row as q6b's; the `effort-axis` row speaks for this engine's emitted `.github/agents/` files. **Pins**, each with its dated note: `copilot.test.ts:457-462` (the key list, after q6b's line); `:891-918` rewritten as "emits `reasoning-effort` at each class's default", its `:915-917` assertion on "this engine does not write it yet" following the row's new words; `:1189-1210`; `modelLadder.test.ts:758-759`, `:773-797` (the per-row scale access dates: Copilot 2026-10-10), `:821-825`, `:886-891`; `capabilityMatrix.test.ts:589-597` |
| `testCriteria` | Red first: GIVEN every corpus agent THEN its Copilot file carries `reasoning-effort` at the class default (advanced `high`, standard `medium`, economy `low`) after q6b's key and the model line; GIVEN a prompt file THEN none; GIVEN an operator `ultra` THEN `max` with one disclosure line; GIVEN `config set effort.frontier ultra` on a copilot-only manifest THEN refused naming `copilot` and "ends at max"; GIVEN `config set effort.economy minimal` there THEN accepted, and emitted as `low` with one disclosure line. GIVEN the capability row and `docs/capability-matrix.md` THEN they state the words above and the page is byte-equal to the generator's output |
| `edgeCases` | 9 authored files plus the goldens, kept whole because the projection row, its adapter and the config refusal are one contract (a split leaves `config` refusing a level the adapter writes, or the reverse); two of the nine are generated pages. A copilot-only repository that stored `minimal` or `ultra` → the manifest still loads and the emission writes Copilot's nearest level with a disclosure; a new `config set` of a level above Copilot's top is refused, as for any narrow client (Risks). A model that drops `xhigh` or `max` → the class defaults never use them; an operator's choice is reported by the CLI and falls back, never stopping the agent. The cloud agent's handling → an accepted risk (Risks, Follow-ups) |
| `depends_on` | q6b-copilot-instructions-key |
| `verify` | `node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && npx vitest run test/roster test/adapters test/cli/commands/config.test.ts test/emit test/cli/docs && npm run lint && npm run typecheck`, then the goldens command |

Integration, part 1: the QA rows, the usage line, the test-runner's CI line, the inbox read, plan size and the ladder
text.

### q2-qa-rows: person rows only where a person adds something

| Field | Content |
|---|---|
| `id` | q2-qa-rows |
| `requirements` | REQ-FLOW-069, REQ-FLOW-017 |
| `files` | `content/skills/st-qa/SKILL.md`; `content/commands/st-work.md`; `test/corpus/skills/flow.test.ts`; `test/corpus/commands/work.test.ts`; `evals/cases-v6/golden/qa-bare-signoff-records-unwalked.md` (its ranges `50-52,57-61,94-132` shift; re-quote if its quoted text moves); `evals/cases-v6/adversarial/benign-optional-step-skipped-proceeds.md` (re-quote if the step-2 edit lands in its range); `evals/SET-v7.md`; range-only: the rest of the `/st-work` case set below the edit; the two goldens |
| `interfaces` | **qa skill (D2, D30).** After the trigger table (`content/skills/st-qa/SKILL.md:30-36`), a paragraph: "**A row needs a person for one of three kinds only:** a rendered surface a person must look at (a page, a screen, a style or an image as it renders), a live third-party client or account, and a step that cannot be undone. Every other row is auto-proven: where no artifact covers it yet, the run's test-runner executes its check before this table is built, and the row points at that result as the Auto-prove pass reads one." The docs-only clause (`:38-40`) becomes: "A change whose class (`gate classify`'s, which the caller passes) is `docs`, `records` or `tests` emits the line "no walk-through required — <class> only", with no sign-off block and no ask — unless it changes a path the project's site build renders (its pages, styles or images) or a path the classify hands the `design-quality` lens; then it emits one person row, the changed page renders and reads right, followed by the sign-off block. With no class passed, the triggers above decide." The five trigger rows and every `## Human sign-off` sentence stay. **`st-work.md` QA step 2** (`:315-318`): "Invoke the qa skill by name for the guided pass" gains ", handing it the class and lenses `gate classify` named (`unclear` when none ran)". **Allocation:** 0 characters above the cut, at most +2 lines |
| `testCriteria` | Red first. GIVEN the qa skill THEN the three kinds and the class clause are pinned ("no walk-through required — <class> only", "site build renders", "`design-quality` lens", "one person row"), and the pins at `flow.test.ts:687-704` and `:757-800` pass unchanged. GIVEN `st-work.md`'s `### QA checkpoint` THEN the hand-off sentence is pinned and `work.test.ts:1153-1203` still passes. GIVEN the skill's body THEN within `THIN_BODY_CAP` (150, `flow.test.ts:90`). GIVEN the budgets THEN within the allocation, both numbers recorded. GIVEN `npx vitest run test/evals` THEN green |
| `edgeCases` | No new Proof state: a row of another kind is `auto-proven` once its check ran, and one whose check cannot run stays open under the Auto-prove pass's rule 2 (absent tooling records `no` with the reason) — review r1 `plan/15`. A docs change touching only `docs/specs/**` or `docs/plans/**` → no walk (not rendered). A website stylesheet change (`docs` here, the `design-quality` lens by `src/roster/triggers.ts:181-192`) → one person row. A security setting a person must see in a third-party console → "a live third-party client or account". A Markdown page change under `docs/**` → rendered, so one person row, though no lens fires |
| `depends_on` | f0-make-room |
| `verify` | the index command, then `npx vitest run test/corpus/skills/flow.test.ts test/corpus/commands/work.test.ts test/corpus test/evals`, then the goldens command |

### q5-usage-lines: what a phase and a round cost

| Field | Content |
|---|---|
| `id` | q5-usage-lines |
| `requirements` | REQ-CTX-019 |
| `files` | `content/commands/st-work.md`; `test/corpus/commands/work.test.ts`; `test/cli/docs/measurements.test.ts` (the placement fixture, added r2); `evals/SET-v7.md`; range-only: `work-proof-block-fields` (`338-401` grows by the paragraph; its quoted runs `338-357` and `376-401` stay contiguous, the insertion falling in the `[...]` gap) and every `/st-work` case below; the two goldens |
| `interfaces` | In `### Proof block`, after the field list's last item ("…says so in the same line.", `:357`) and before "Cite native platform artifacts" (`:359`), one blank line and a two-line paragraph (D17): "**Usage lines.** An ended phase or review round adds `- <UTC> usage: <phase \| review rN> minutes=<n> tokens=<n \| unreported> (<client>)` to the record, minutes from the orchestrator's clock, after this list and never directly above a table." `review rN`, never "round N" (`work.test.ts:899-912`). **Allocation:** 0 characters above the cut, at most +3 lines |
| `testCriteria` | Red first. GIVEN `st-work.md` THEN the grammar is pinned inside `### Proof block`, after "says so in the same line." and before "Cite native platform artifacts", below the re-attach cut. GIVEN a record carrying usage lines THEN the resume card (it reads the first 15 lines, `src/runs/layout.ts:91-94`) and `src/cli/docs/measurements.ts` (it reads the proof block's tables) read it unchanged: a `measurements.test.ts` fixture with a usage line after the field list keeps its table's lead. GIVEN the budgets THEN within the allocation. GIVEN `test/evals` THEN green |
| `edgeCases` | A client that reports tokens but not minutes → minutes from the orchestrator's clock. A client that reports nothing → `tokens=unreported`. A usage line written directly above a `Gate results` table would become its lead (`measurements.ts:842-850`), which the placement sentence forbids |
| `depends_on` | q2-qa-rows |
| `verify` | the index command, then `npx vitest run test/corpus/commands/work.test.ts test/corpus test/cli/docs/measurements.test.ts test/evals`, then the goldens command |

### q6t-test-runner-ci-line: the test-runner reads the CI provider on every client (`build/61`, `build/85`)

| Field | Content |
|---|---|
| `id` | q6t-test-runner-ci-line |
| `requirements` | REQ-FLOW-063 |
| `files` | `content/agents/stamity-test-runner.md`; `test/corpus/agents/quality.test.ts`; any eval case whose quoted block holds the edited sentence (find them by `source: content/agents/stamity-test-runner.md`), with `evals/SET-v7.md`; the two goldens |
| `interfaces` | D8. The sentence at `content/agents/stamity-test-runner.md:37-39` "Where the charter's `CI provider` reads `unknown`, the final tree runs `all` whatever the class." becomes "This repository's CI provider is ${STAMITY:CI_PROVIDER}; where that reads `unknown`, the final tree runs `all` whatever the class." The token is substituted on every client (`claude.ts:1130`, `codex.ts:880`, `cursor.ts:416`, `copilot.ts:825`) and, in a plugin package, renders as the pointer to the charter's repo facts (`scripts/plugins/tokens.mjs:107`). Rewrap inside the paragraph only, so the body's line count does not move. The pin at `quality.test.ts:288-292` follows the new words, with its note; the rule still lives in the runner, not in `/st-work` (`:288-292`'s reason). **`build/85` (folded at the plan gate, `record.md:61`; D36):** in the Return contract's paragraph that opens "**A green verdict may be digested; a red one never is.**" (`content/agents/stamity-test-runner.md:144-146` and on), the sentence "A `red` verdict is returned in full, rows and excerpts, whatever the dispatch names: its excerpts are ledger evidence." becomes "A `red` verdict writes nothing to the named path and is returned in full, rows and excerpts, whatever the dispatch names: its excerpts are ledger evidence." Rewrap inside that paragraph only. A new pin in `quality.test.ts` holds "writes nothing to the named path". The inbox row leaves at the close, retired `fixed in 2026-10-10_next-tier` |
| `testCriteria` | GIVEN the corpus body THEN the token sentence and the red-verdict sentence are pinned. GIVEN the emission golden THEN the test-runner body renders the detected provider (this repository: `github-actions`). GIVEN `test/ci/pluginModules.test.ts` THEN the plugin rendering still passes. GIVEN `test/evals` THEN green, any case quoting either edited sentence re-quoted (`test-runner-red-verdict-never-digested` among the candidates) |
| `edgeCases` | Detection found no provider → the token renders `unknown` and the rule fires in place. The agent's line count moves after all (two edits now) → shift the ranges of the cases that source it in this unit. A pin that asserts the old red-verdict sentence whole → it moves with a dated note: the sentence states what was already true |
| `depends_on` | q5-usage-lines |
| `verify` | `npx vitest run test/corpus test/evals test/ci/pluginModules.test.ts test/emit/substitution.test.ts`, then the goldens command |

### q1t-frame-inbox-read: Frame reads the rows that match its change

| Field | Content |
|---|---|
| `id` | q1t-frame-inbox-read |
| `requirements` | REQ-FLOW-068, REQ-FLOW-019 |
| `files` | `content/commands/st-work.md`; `test/corpus/commands/work.test.ts`; `evals/cases-v6/golden/work-persisted-plan-asks-once.md` (its Frame block re-quoted); `evals/SET-v7.md`; range-only: every other `/st-work` case; the two goldens |
| `interfaces` | **Frame step 4** (`caa2beca:content/commands/st-work.md:21-25`, the same lines at `e78245fb`), D20, amended r2, r3 and r4. Only its first sentence, "Read the deferral inbox and surface every item whose paths overlap the files this change will touch.", is replaced, by: "Read the deferral inbox rows whose paths overlap this change's files: the `ledger` verb's `inbox` query (`--paths`, `--plan`) returns them, the rows it always shows and its total and unmatched counts. From a bare intent, query again with the plan's files. A row it withholds is listed as it prints. Only when the CLI cannot run at all (absent or crashed), read the whole file and say so; a read it refuses is a finding naming the refusal, never a whole-file read." (The sentence "A row it withholds is listed as it prints." is amended r3, `plan/30`: the query prints a withheld row as `withheld by the screen (<pattern id>); read it by hand`, q1a, and Frame lists that line, never the row's text.) **Amended r4 (`plan/38`; the sign-off on `review/7`, `record.md:124`):** the last sentence replaces r3's "When the query cannot run, read the whole file and say so.", under which a refused read counted as a query that cannot run. The whole-file read is for a CLI that cannot run at all, absent or crashed, and for nothing else. A read the query refuses, because the inbox is a symbolic link or is over 1 MiB (q1a's `VALIDATION_ERROR`), is the query's own answer: Frame reports it as a finding naming the refusal and never reads the file whole, so a row padded past 1 MiB opens no unscreened read. The first two sentences are tightened in the same pass, at word level and with no duty dropped, to pay for the longer last one ("whose paths overlap this change's files"; "From a bare intent, query again with the plan's files."). The rest of the step stays byte for byte as f0 left it: the settled-by-a-plan sentence ("already settles", "not asked about", "ride the plan gate's question", "left in the inbox by default") and "This read is guaranteed on every run; `/st-board`'s `## Deferral inbox` section owns the reader census." An unparsed or screened row never sends Frame to the whole file, and neither does a refused read (amended r4); the query reports each (q1a). **`review/1`** (`record.md:101`): in Phase 2's Decompose bullet, "An in-flow plan is written once to `.stamity/runs/<run-id>/plan.md` in `/st-plan`'s unit shape: the copy every dispatch points at, not a reviewable artifact." ends instead "…not a reviewable artifact; the record's `Plan:` line names it." No backticked `stamity ledger` above the `**CLI calls.**` bullet (`work.test.ts:1496-1498`); no reader or writer count in Frame (`:451-473`). **Allocation (amended r3, r4):** at most +400 characters above the cut and +3 lines, both edits together; r4 raises neither. Hand count at r4, on `e78245fb`'s text wrapped at 100 columns: step 4 goes from 461 characters on 5 lines to about 836 on 9, and `review/1` adds 36 on a line that has room, so about +411 characters and +4 lines before any compression. **Two Phase 2 compressions are named for the difference (amended r4),** each a word-level edit that pulls a short last line up and drops no duty: (a) the Freshness guard bullet's last sentence (`e78245fb:content/commands/st-work.md:49-50`) reads "Staleness is a guard verdict in the run report, not a return status.", the word "recorded" gone, with `work.test.ts`'s pins "Staleness is a guard verdict" and "not a return status" both holding: one line and about 11 characters back; (b) the Coverage before Build bullet's last sentence (`:60-61`) reads "A structural pass alone is not clarity." for "does not establish clarity", which no `work.test.ts` pin reads: one line and about 14 characters back. With both, about +386 characters and +2 lines. The unit measures first and applies them as far as its numbers need, each named in its report. A further overrun is compressed elsewhere in Phase 0 or Phase 2, each compression duty-preserving and named in the report; never by moving the census pointer, never in the CLI-calls bullet, never a raised budget |
| `testCriteria` | Red first. GIVEN `work.test.ts` THEN "the `ledger` verb's `inbox` query", "`--paths`", "unmatched", "again with the plan's files", "A row it withholds is listed as it prints" (amended r3), "Only when the CLI cannot run at all (absent or crashed), read the whole file and say so" and "a read it refuses is a finding naming the refusal, never a whole-file read" are pinned in Frame, and Frame is asserted not to contain "When the query cannot run" (amended r4, `plan/38`); the Frame pins at `caa2beca:test/corpus/commands/work.test.ts:429-473` pass unchanged ("deferral inbox", "overlap", "guaranteed on every run", "already settles", "not asked about", "ride the plan gate's question", "left in the inbox by default", "`## Deferral inbox`", "/st-board"); "the record's `Plan:` line names it" is pinned in Phase 2; the CLI-calls order pin passes; the budgets hold within the allocation. GIVEN `work-persisted-plan-asks-once` THEN its Frame block matches the landed lines byte for byte. GIVEN `npx vitest run test/evals` THEN green |
| `edgeCases` | A matched withheld row (three live rows today, `.stamity/inbox.md:26`, `:33`, `:140`) → Frame lists it as the query prints it, line, severity, location and pattern id; the orchestrator never opens the inbox to read its text, which is the person's to read (D39; amended r3, `plan/30`). The query refuses the read (the inbox is a symbolic link, or over 1 MiB) → Frame reports a finding naming the refusal and goes on with no inbox row read; the orchestrator never opens the file whole, whatever the size or the link's target, and the refusal's own text says so once q1a's fix round lands (amended r4, `plan/38`). The CLI is absent or crashes → the whole-file read, and Frame says so; no other failure of the query earns it (amended r4). The growth exceeds 400 characters or 3 lines → apply the two named Phase 2 compressions, then compress elsewhere in Phase 0 or Phase 2 as above; still short → stop BLOCKED_DEPENDENCY with both numbers, never a raised budget. A named compression whose words another suite or an eval case pins (this pass read `work.test.ts` at `e78245fb` only, and its shell cannot search) → skip that compression and name it in the report, never widen the unit's files for it (amended r4). An Expected row of `work-persisted-plan-asks-once` that names the whole-file read → it moves; the case has no v5 copy, so the SET-v7 paragraph records it. The plan's own files in an in-flow plan are known only after Phase 2 → the second query. `review/1` is this run's own ledger row: it closes `fixed` on this unit's commit |
| `depends_on` | q6t-test-runner-ci-line, q1b-records-gate-parser |
| `verify` | the index command, then `npx vitest run test/corpus/commands/work.test.ts test/corpus test/evals`, then the goldens command |

### q3b-plan-size-text: `/st-plan` names L5

| Field | Content |
|---|---|
| `id` | q3b-plan-size-text |
| `requirements` | REQ-FLOW-070 |
| `files` | `content/commands/st-plan.md`; `content/skills/st-verify/SKILL.md`; `test/corpus/commands/plan.test.ts`; `plan-lint-three-fails-returns-blocked-ambiguity` (re-quote of its `274-311` block, and of its `392-402` block, whose L-line this unit rewrites at `st-plan.md:402` and the case quotes at its `:71`; range shift too); `plan-semantic-ambiguity-survives-structural-pass` (re-quote of `274-411`); `evals/SET-v7.md`; range-only: `plugin-mode-invocation` (`287-292`), `plan-artifact-head-and-units-shape` (`313-370`), `plan-security-unit-carries-threat-note` (`341-356`), and any case sourcing `st-verify/SKILL.md` past `:25`; the two goldens |
| `interfaces` | `content/commands/st-plan.md`: after the L4 row (`:285`), "\| L5 \| **Plan size (advisory)** \| the structural coverage pass reports `unit-size` (a unit past 60 lines), `unit-oversize` (past 100), `unit-prewritten` (a fenced block, or five or more `>` lines, inside a unit) and `delta-verbose` (a requirement entry past six lines); none fails the pass \| split the unit, or point at the file that will carry the text instead of writing it into the unit; the write is never blocked \|". The return line (`:402`) reads `` `L1 pass\|fail · L2 pass\|fail · L3 pass\|fail · L4 pass\|fail · L5 none\|<n> advisory` `` (D29). `content/skills/st-verify/SKILL.md`, after `:25`, one line: "Its advisory plan-size codes are L5 — `unit-size`, `unit-oversize`, `unit-prewritten`, `delta-verbose` — and never fail it." `plan.test.ts`: the L5 row and the return token pinned (`:409-421`, `:620-631`); `PLAN_LINT_CHECKS` (`:55-61`) gains L5 only if its users require a failing check to be named in the "blocks the write" text (read them first), else L5 gets its own pin |
| `testCriteria` | GIVEN `plan.test.ts` THEN the L5 row and `L5 none\|<n> advisory` are pinned, and `L1 pass\|fail`, `L4 pass\|fail` still pass. GIVEN `st-verify/SKILL.md` THEN within `SKILL_MAX_LINES` (130, `test/corpus/invariants.test.ts:75`). GIVEN `npx vitest run test/evals` THEN green |
| `edgeCases` | A reader takes L5 as a gate → the row says the write is never blocked, and "A failing check blocks the write" (`:309`) names the checks that fail, L1 to L4. `/st-rework`'s enumeration of the gate moves in q10b |
| `depends_on` | q1t-frame-inbox-read, q3a-plan-size-script |
| `verify` | `npx vitest run test/corpus/commands/plan.test.ts test/corpus test/evals`, then the goldens command |

### q4t-ladder-placement-text: `/st-work`'s ladder names the third placement (`build/87`)

| Field | Content |
|---|---|
| `id` | q4t-ladder-placement-text |
| `requirements` | REQ-LADDER-003 |
| `files` | `content/commands/st-work.md`; `test/corpus/commands/work.test.ts`; `evals/cases-v6/golden/work-capacity-rung-classes-stop-notices.md` (its `491-496` block re-quoted); `evals/SET-v7.md`; the two goldens |
| `interfaces` | D7, text half, amended r2. The Model ladder paragraph (`caa2beca:content/commands/st-work.md:441-445`) ends: "The three placements no agent file can declare that this table records are the flow's own escalations and drop, marked as such below; the capacity rung's one-class drop for a build role (Dispatch contract) and the escalation fixer's effort step (Review loop) are two more, which no row records." The paragraph is prose, outside the table the parity tests read. The frontier cell (`:449`) reads "`reviewer`, escalated for the whole-branch deep review that runs once the review loop converges and before the QA checkpoint, and for the one closure re-review after an escalation (Review loop) — flow placements, declared by no agent file". The cell names no role but `reviewer`: the bare words `fixer`, `implementer` and the rest are what `ladderViolations` (`caa2beca:test/corpus/commands/work.test.ts:288-307`, the token test at `:299`) and `ladderParityProblems` (`test/roster/modelLadder.test.ts:156`) match, and `MODEL_LADDER`'s frontier roles are `["reviewer"]` (`src/roster/modelLadder.ts:181`). **Allocation:** 0 characters above the cut, at most +1 line |
| `testCriteria` | GIVEN `work.test.ts` THEN the pins at `caa2beca:test/corpus/commands/work.test.ts:1649-1650` move with one dated `TEST CHANGE, justified (2026-10-10, q4t-ladder-placement-text)` note (the ladder now records a third placement and names a second unrecorded one): "The three placements no agent file can declare that this table records" and "the escalation fixer's effort step (Review loop) are two more, which no row records"; `:1651`'s `not.toContain("The only two placements")` stays; the frontier cell's "closure re-review after an escalation" is pinned beside `:1635-1636`'s anchor pins, which pass unchanged. GIVEN "binds the ladder table's role column to MODEL_LADDER" (`:1654-1656`) and `test/roster/modelLadder.test.ts`'s shipped-table parity (landed in q4b) THEN both green. GIVEN `test/evals` THEN green |
| `edgeCases` | A parity test that compares the frontier cell with the frontier `rationale` → both name the re-review since q4b. "Stronger class" is relative: only frontier sits above the reviewer's advanced, which `:244` ("runs once on a stronger class") already implies |
| `depends_on` | q3b-plan-size-text, q4b-codex-scale |
| `verify` | the index command, then `npx vitest run test/corpus/commands/work.test.ts test/roster test/evals`, then the goldens command |

Integration, part 2: the schedule rule and the clean close.

### q9t-board-inbox-rules: `/st-board` states the schedule rule and the leftovers at a close

| Field | Content |
|---|---|
| `id` | q9t-board-inbox-rules |
| `requirements` | REQ-FLOW-076, REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-024 |
| `files` | `content/commands/st-board.md`; `test/corpus/commands/board.test.ts`; any eval case whose `source:` names `content/commands/st-board.md` lines at or after `:345` (find them by `source: content/commands/st-board.md`), range or re-quote, with `evals/SET-v7.md`; the two goldens |
| `interfaces` | All in `## Deferral inbox` (`content/commands/st-board.md:330-363`), with no `stamity ` prefix on a verb (common rules). **Row grammar** (`:345-353`) gains: "After `source:` and `Ref:` come optional fields in any order, each at most once: `by: <YYYY-MM-DD>` or `when: <trigger>`, `files: <path>, <path>`, the tag word, a bare `<YYYY-MM-DD>` (the deferral date) and `rationale: <rest of line>` last. Rows below the inbox's `## Rows under the schedule rule` heading carry `by:` or `when:`; `when: touched` needs a path in the location or `files:`; a vague trigger (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`) is refused." **Triage order** (`:354-357`): `critical-deferred` rows first, then `decision-waiting`, ahead of every other row (the pinned "`critical-deferred` are triaged first" stays). **Removal** (`:358-363`): "scheduled with a lane, a trigger and an owner" becomes "scheduled to a place with a date or a trigger"; after "Triage does not rewrite an entry in place." add (amended r3, `plan/33`, `plan/34`, D37): "A row whose `by:` date has passed, or whose paths a run changes, comes back to that run's close as a leftover (the `ledger` verb's `inbox` query with `--due` and `--paths`), and so does every `decision-waiting` row. The close's answer applies to each row it decided: a drop retires it (`cut <reason>`) and removes its bullet; a plan, board or handoff place retires it there and removes its bullet; a new date or trigger removes its bullet and appends one row under the schedule rule carrying the same `Ref:`. Nothing retires a row without an answer, and a kept row is never re-dated in place." **Retirers** (`:339-340`, amended r3, `plan/33`): the bullet keeps "`/st-work`'s close and `/st-quick`'s batch, each removing a row its own change fixed, by the Removal rule below" and adds "; `/st-work`'s close also removes a row its one question dropped, placed elsewhere or re-dated"; still two retirers, `/st-quick` still the one retirer-only file. **A new last bullet, `- **Leftovers at a close:**`** (S10–S13, S18; amended r3): "A run's close asks once about every leftover: every inbox row tagged `decision-waiting`, listed first; each ledger row neither fixed nor rejected, Minor rows included; each inbox row its change touched but did not fix or whose `by:` date passed; and the notes left out (one line, titles on request). Each line reads `L<n> <severity> · <location> · <summary> → fix now \| schedule: <place>, <by or when>, <files> \| drop — <evidence>; would change if <condition>`, after the `decision-waiting` rows, Critical and Warning first and never pre-set to drop, then `Notes (<p>): drop`. A row the query withholds is listed by its line, severity, location and `withheld by the screen (<pattern id>); read it by hand`, with no summary, recommended to stay as it is until the person reads it. An inbox row's answer applies by the Removal rule. The answers: accept the recommendations; change rows in one line (`L2 fix; drop L1: <reason>; show L3`); or stop, every leftover on `Not done:`. Fix now runs one fix round, offered only while the review cap leaves a round and outside the files of an open person QA row; a fix that fails is reverted and scheduled with `fix-now failed: <gate or finding>`. Schedule closes the row `deferred` and appends it under the schedule rule, or retires it to a plan, board or handoff place. Drop closes the row `deferred` and retires it at once (`cut <reason>`), so it never reaches the inbox; only the person drops a Critical or Warning, retired `cut accepted risk: <reason>` and kept on `Not done:`. With no answer, only notes are dropped and only fixes the run's plan covers are made; every other leftover from the run's own ledger is appended tagged `decision-waiting`, its recommendation in the description and `when: next attended close`; an inbox row the change touched or found due, or one already tagged `decision-waiting`, stays as it is, with no copy. Each is listed on `Not done:`, asked first at the next attended close, counted in the record's `Status:`, and counted as scheduled in the leftovers line. A real defect is never dropped by default." Writers and Readers bullets are unchanged |
| `testCriteria` | Red first. GIVEN `board.test.ts` THEN the keyword fields, the vague list, "scheduled to a place with a date or a trigger", the come-back sentence, `decision-waiting` in the triage order and the Leftovers bullet ("never pre-set to drop", "cut accepted risk", "`decision-waiting`", "from the run's own ledger", "stays as it is, with no copy", "next attended close", "counted as scheduled", "never dropped by default") are pinned; amended r3: "every inbox row tagged `decision-waiting`, listed first" and "Minor rows included" (`plan/34`, `plan/35`), "withheld by the screen" (`plan/30`), "carrying the same `Ref:`" and "also removes a row its one question dropped" (`plan/33`) are pinned; "scheduled with a lane, a trigger and an owner" is asserted absent from the section; the census test (`:559-614`: `Writers, five:`, five writers, `st-quick` the one retirer-only file), the retirer test (`:616-631`, whose Retirers regex at `:619` and Removal regex at `:620-622` the r3 additions leave whole, both added after the matched words) and the grammar test (`:633-663`) pass unchanged. GIVEN the body THEN within the 500-line cap (`board.test.ts:35`, `:214`). GIVEN `test/evals` THEN green |
| `edgeCases` | The census bullet parser splits on the next `- **` (`board.test.ts:587`), so the new bullet goes last, after Removal. `/st-work`'s own copy of the old phrase (`st-work.md:396-397`, pinned at `work.test.ts:1288`) moves in q10a; until then the two texts differ, which no test compares. An unattended close that appended a copy of a touched inbox row would leave two rows for one deferral, each re-shown by `always` on every later run (review r1 `plan/4`) → the kept row is the only row. The census bullet parser reads `/st-…` ids in the Retirers bullet (`board.test.ts:587-593`) → the r3 addition names only `/st-work`, already a writer, so `st-quick` stays the one retirer-only file (amended r3). A re-dated row with no `Ref:` → removed and appended with no `Ref:`, as written (D37) |
| `depends_on` | q4t-ladder-placement-text, q9b-inbox-schedule-grammar |
| `verify` | `npx vitest run test/corpus/commands/board.test.ts test/corpus test/evals`, then the goldens command |

### q10a-work-close: `/st-work`'s close decides every leftover

| Field | Content |
|---|---|
| `id` | q10a-work-close |
| `requirements` | REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-019, REQ-FLOW-024, REQ-CTX-020 |
| `files` | `content/commands/st-work.md`; `test/corpus/commands/work.test.ts`; `evals/cases-v6/golden/work-proof-block-fields.md`; `evals/cases-v6/golden/work-persisted-plan-asks-once.md`; `test/evals/successorInputs.test.ts`; `evals/SET-v7.md`; `docs/working-with-stamity.md`; `docs/getting-started.md`; range-only: `work-capacity-rung-classes-stop-notices` and any `/st-work` case below the edits; the two goldens |
| `interfaces` | **"The close asks once"** (`:332-336`): the pinned phrases stay as substrings ("the rows no evidence proved, the spec delta merge and the commit", `` `Default if no response: leave uncommitted` ``, "those rows not signed and the delta unmerged", "with none left, there is no ask"); a pointer of at most 4 lines is added: "The leftovers join it as a fourth part, by `/st-board`'s Leftovers at a close: before asking, the close runs `stamity ledger inbox --due --paths <the changed paths>` and takes every `decision-waiting` row first, then the due and touched rows and the ledger's open dispositions; with no response, its unattended rule applies." (amended r3, `plan/34`: "every `decision-waiting` row first".) **The fixed-row paragraph** (`caa2beca:content/commands/st-work.md:365-369`, amended r3, `plan/33`, D37): its last sentence, "A row the run did not fix stays as it is.", becomes "An inbox row the close's answer decided follows `/st-board`'s Removal rule: a drop retires it `cut <reason>` and removes its bullet, a plan, board or handoff place retires it there, and a new date or trigger replaces its bullet with one row carrying the same `Ref:`; each removal adds an `- inbox retired:` line naming its disposition. A row no answer reached stays as it is." **The Severity floor** (`caa2beca:content/commands/st-work.md:258-264`, in `### Specialist pass`, below the cut; amended r3, `plan/35`): "Only Critical and Warning findings reach the QA checkpoint" stays; "the run closes its own Minor rows against the exit invariant, normally as deferred with the rationale that put them below the floor" becomes "the run closes its own Minor rows against the exit invariant through the close's leftovers part, where each reaches the person as a leftover with its recommendation"; "A Minor row reaches the operator only when its disposition is itself ambiguous" becomes "Before the close, a Minor row reaches the operator only when its disposition is itself ambiguous", the rest of that sentence unchanged. **The append paragraph** (`:389-401`): "At exit every row that closed `deferred` is appended to `.stamity/inbox.md`" stays and continues "…, below its `## Rows under the schedule rule` heading with `by:` or `when:` (and `files:` when the location is `—`), unless the close dropped it or scheduled it to a plan, board or handoff place, which retires it then"; "scheduled with a lane, a trigger and an owner" becomes "scheduled to a place with a date or a trigger"; "its `Not done:` list is empty or names the scheduled item each line became" gains ", and each accepted risk". **The leftovers line** (S18; amended r4, `plan/39`), after the usage-lines paragraph q5 placed (found by its `**Usage lines.**` label: q5's fix round, `review/8`, rewrites that paragraph's placement words before this unit runs), as one blank line and two lines: "**Leftovers line.** The close adds `- <UTC> leftovers: shown=<n> real=<a> fixed=<f> scheduled=<s> dropped=<d> accepted=<k> notes=<p\|unknown> changed=<c>`, a line of its own in the record's Proof block, never directly above a table (n = f + s + d, k ≤ d, a ≤ n; a `decision-waiting` append and a kept inbox row count in s; unattended, d = k = c = 0)." The paragraph names its own place and never points at the usage lines: since `review/8` those are appended as each phase or review round ends, as the capacity lines are, while this line is written once, at the close, in the Proof block (`record.md:128`). **Docs pages:** `docs/working-with-stamity.md:98-105` (the Close step) names the leftovers as the fourth part of the one question; `docs/getting-started.md:325` (the inbox row) adds that each row carries a date or a trigger, and that a dropped or elsewhere-scheduled row never lands there. **Evals (D17):** `work-proof-block-fields` — its claim ("every deferred row is appended") reads "every deferred row the close neither dropped nor scheduled to another place is appended"; B4, B6, B7 and B8 follow S12 (B8: a dropped row is retired at the close and never appended); its Brief re-quoted from the landed `338-…` runs and, amended r3 (`plan/35`), from the amended Severity floor (its `258-264` run, range shifted if the floor grows), so the case's governing text and its binding rows agree that a Minor ledger row reaches the person in the close's leftovers part; its `EXPECTED_MOVES` value (`successorInputs.test.ts:144-149`) gains a dated amendment naming those rows, what B8 no longer admits (a dropped row appended) and what it still refuses. `work-persisted-plan-asks-once` — its Brief's close block re-quoted, its claim names four parts, B3 (`:117-120`) follows; no v5 copy, so the SET-v7 paragraph records it. **Allocation (amended r3):** 0 characters above the cut, at most +14 lines (the r3 edits, the fixed-row sentence and the Severity floor, sit below the cut). As the last writer, record the room left for Package 22 |
| `testCriteria` | Red first. GIVEN `work.test.ts` THEN the four-part close, the pointer, "scheduled to a place with a date or a trigger" (the `:1288` pin moved with its note), "each accepted risk", the leftovers grammar and its count rule ("a kept inbox row count in s") are pinned; amended r3: "every `decision-waiting` row first" in the pointer (`plan/34`), "A row no answer reached stays as it is." and "carrying the same `Ref:`" in the fixed-row paragraph, with the `caa2beca:test/corpus/commands/work.test.ts:1335` pin on "A row the run did not fix stays as it is." moved with its dated note (the close now applies its answer to the rows it decided, `plan/33`), and "through the close's leftovers part" and "Before the close, a Minor row reaches the operator only when" in `### Specialist pass` (`plan/35`), while `:985`'s "Only Critical and Warning findings reach the QA" passes unchanged; the Leftovers line paragraph sits in `### Proof block` after the Usage lines paragraph and before "Cite native platform artifacts", carries "a line of its own in the record's Proof block, never directly above a table" and is asserted not to contain "as the usage lines are" (amended r4, `plan/39`; the usage paragraph's own pin is q5's and moves in q5's fix round), no new text sits above the re-attach cut, the body is within 500 lines, and the room left is at least 900 characters and 15 lines. GIVEN `board.test.ts:616-631` THEN both retirers still carry `ledger close --run <its run> --id <row id> --retired "fixed `. GIVEN `npx vitest run test/evals` THEN green, with the reviewed `EXPECTED_MOVES` addition. GIVEN `test/docsPages.test.ts` THEN green |
| `edgeCases` | No leftovers → the part drops out and the close asks what it asked before; nothing left at all → no ask. A `critical-deferred` row the query always shows → a leftover only when the change touched it or it is due, as `/st-board`'s Leftovers bullet sets out (amended r3). A withheld row among the leftovers → listed as the query prints it, never opened (D39). The Usage lines paragraph reads differently from q5's first build (`review/8`'s fix round) → this unit changes no word of it and anchors on its label; a leftovers line written directly above a `Gate results` table would become that table's lead (`measurements.ts:842-850`), which the paragraph's own words forbid (amended r4, `plan/39`). Another pin or eval case quoting the Severity floor's old words (search `itself ambiguous` under `test/` and `evals/`) → it follows the amended text with a dated note or a re-quote (amended r3, `plan/35`). No round left under the cap → fix now is not offered for that row. A docs-page pin quoting an edited sentence → it moves with a dated note. The room falls short of 900 and 15 → move words into `/st-board`'s Leftovers bullet and report the shortfall for the close list; never a raised budget |
| `depends_on` | q9t-board-inbox-rules, q5-usage-lines |
| `verify` | the index command, then `npx vitest run test/corpus/commands/work.test.ts test/corpus test/evals test/docsPages.test.ts test/runs`, then the goldens command |

### q10b-flow-close-pointers: the other flows' closes point at the rule, and `/st-rework` names L5

| Field | Content |
|---|---|
| `id` | q10b-flow-close-pointers |
| `requirements` | REQ-FLOW-074, REQ-FLOW-070, REQ-FLOW-077 |
| `files` | `content/commands/st-pr-resolve.md`; `content/commands/st-rework.md`; `content/commands/st-quick.md`; `test/corpus/commands/feedbackPair.test.ts`; `test/corpus/commands/lightTrio.test.ts`; `pr-resolve-next-step-derived-from-run-state` (re-quote of its `## Close` block, range grows); `rework-next-step-derived-from-run-state` (re-quote: `:269` changes, and the range shifts); `evals/SET-v7.md`; the two goldens |
| `interfaces` | **`/st-pr-resolve` `## Close`** (`:311-328`), after the row paragraph (`:319-320`), amended r2 (`plan/5`): "Each DEFER row is decided in the phase-3 triage ask, which stays this round's one ask: its row carries `/st-board`'s schedule fields (`by:` or `when:`, and `files:` when the location is `—`), and the round adds no closing ask." The sentence at `:220-221` ("the only later interruption is the re-poll consent below") stays and stays true. **`/st-rework` plan handoff** (`:258-259`): the ask sentence gains "; its DEFER rows and notes ride that ask, by `/st-board`'s Leftovers at a close". **`/st-rework` L5** (q3's): `:245`'s enumeration adds "`L5` plan size, advisory"; `:269` reads `L1 pass\|fail · L2 pass\|fail · L3 pass\|fail · L4 pass\|fail · L5 none\|<n> advisory · R1 pass\|fail`. **`/st-quick`** (D32), amended r2 (`plan/6`: it stays retirer-only), r3 (`plan/31`) and r4 (`plan/40`, signed off, `record.md:138`: S11's clause is withdrawn and the lane gains no leftovers ask): after the next-step paragraph (`:218-221`), one paragraph of two sentences: "This lane appends no inbox row. What a batch cannot finish escalates to `/st-work` by the Escalation table above, and that run's close asks about what is left." Nothing else is added: no ask, no fix-now, drop or schedule choice, and no pointer at `/st-board`'s Leftovers at a close, whose branches append. The lane's own routes already decide everything it cannot finish, and each stays as written: a scan hit stops the batch and is never cleared (`content/commands/st-quick.md:157-160`), a `security-sensitive` class moves the whole batch (`:165-169`), a red gate is not done and a second red escalates (`:190-194`), a refusal stands with no prompt that unlocks it (`:56-59`), and the Escalation table stays user-gated (`:207-216`). Pins: `feedbackPair.test.ts:476-493` (the handoff and the L-line regex, L5 before R1, with its note), `:847-868` (the Close), new pins for both pointers; `lightTrio.test.ts`: new pins for the quick paragraph ("This lane appends no inbox row.", "escalates to `/st-work` by the Escalation table above", "that run's close asks about what is left"), and pins that the paragraph contains none of "fix now", "drop", "schedule", "asks once" and "the board" (amended r4, `plan/40`); `:772-790` (step 5) and `:356-372` (next-step phrases) unchanged |
| `testCriteria` | GIVEN `/st-pr-resolve`'s and `/st-rework`'s bodies THEN each pointer is pinned; `/st-pr-resolve`'s names the phase-3 triage ask and "adds no closing ask", and `:220-221`'s re-poll sentence still passes; `/st-rework`'s names `/st-board`'s Leftovers at a close. GIVEN `/st-quick`'s body THEN its two-sentence paragraph is pinned as the body's last paragraph, adds no ask and no fix-now, drop or schedule choice, names no `/st-board` Leftovers rule and no board (amended r4, `plan/40`), stays within the 250-line cap (`lightTrio.test.ts:279-285`), and no `quick-*` case range moves; every existing `lightTrio.test.ts` pin on the scan, the classify step, the red gate and the refusal passes unchanged. GIVEN the board census THEN still five writers, `st-quick` still the one retirer-only file (`board.test.ts:559-614`). GIVEN `test/evals` THEN green |
| `edgeCases` | `/st-debug` gets no pointer: it inherits `/st-work`'s close, and naming the inbox there would make a sixth writer (`board.test.ts:595-604`). A `quick-*` case whose range reaches the file end → shift it in this unit. The census test filters `/st-quick` by name (`board.test.ts:589-599`), so it cannot catch a quick append; the pinned "appends no inbox row" is the guard. An operator who asks this lane to drop or defer a scan hit, a red gate or a refused item → the lane's existing rule answers (`content/commands/st-quick.md:157-160`, `:190-194`, `:56-59`); the new paragraph offers no choice, so no second text can disagree with them, and the item moves to `/st-work` intact (amended r4, `plan/40`). The Escalation table's `/st-debug` and `/st-ask` rows (`:215-216`) are not leftovers of a batch: the paragraph adds no route, and "by the Escalation table above" keeps that table the rule (amended r4) |
| `depends_on` | q10a-work-close |
| `verify` | `npx vitest run test/corpus/commands/feedbackPair.test.ts test/corpus/commands/lightTrio.test.ts test/corpus test/evals`, then the goldens command |

Integration, part 3: every inbox writer gives its row a place.

### q11a-plan-writer: `/st-plan`'s follow-ups carry a date or a trigger, and its shape gains two sections

| Field | Content |
|---|---|
| `id` | q11a-plan-writer |
| `requirements` | REQ-FLOW-077 |
| `files` | `content/commands/st-plan.md`; `test/corpus/commands/plan.test.ts`; `plan-semantic-ambiguity-survives-structural-pass` (re-quote); `plan-artifact-head-and-units-shape` (re-quote: the section list sits in its `313-370` range); `plan-lint-three-fails-returns-blocked-ambiguity` (its `392-402` range shifts); `test/evals/successorInputs.test.ts` (only if an Expected block moves); `evals/SET-v7.md`; the two goldens |
| `interfaces` | D13. After "5. **Open questions** …" (`:360-361`): "6. **Follow-ups** (optional) — items this plan deliberately leaves out, one per line, each with `by: <YYYY-MM-DD>` or `when: <trigger>`, and `files:` when it names no location; they append as the Side effects say." and "7. **Drop list** (optional) — a table, `Item \| Revisit when`, of items with only a revisit trigger; they append nowhere." **Side effects** (`:387-390`), the "Deferral-inbox append" bullet keeps its words and the path and adds: "each row carrying `by:` or `when:`, and `files:` when its location is `—`, below the inbox's `## Rows under the schedule rule` heading; a follow-up with neither belongs in the plan's Drop list with its revisit trigger." **Return contract** (`:410-411`): "…one line each, citing the plan path, with `by:` or `when:`; the Drop list appends nothing." Pins: `plan.test.ts:579-604` and `:633-638` stay; new pins for sections 6 and 7 and the two sentences |
| `testCriteria` | GIVEN `plan.test.ts` THEN the new sections and sentences are pinned and the old pins pass. GIVEN a follow-up row written from the Side effects text with a date THEN it parses under q9b's grammar below the heading (a `test/runs/inboxStore.test.ts` fixture is not needed: q9b's fixtures cover the shape). GIVEN `test/evals` THEN green, with an `EXPECTED_MOVES` addition only if `plan-artifact-head-and-units-shape`'s Expected names the section count |
| `edgeCases` | A follow-up with only a revisit trigger ("when a company asks") → the Drop list, not the inbox. A plan with neither section → valid (both optional) |
| `depends_on` | q10b-flow-close-pointers, q3b-plan-size-text |
| `verify` | `npx vitest run test/corpus/commands/plan.test.ts test/corpus test/evals`, then the goldens command |

### q11b-feedback-writers: `/st-pr-resolve`'s and `/st-rework`'s rows carry a date or a trigger

| Field | Content |
|---|---|
| `id` | q11b-feedback-writers |
| `requirements` | REQ-FLOW-077 |
| `files` | `content/commands/st-pr-resolve.md`; `content/commands/st-rework.md`; `test/corpus/commands/feedbackPair.test.ts`; `rework-triage-revise-versus-defer` (Brief re-quote); `rework-critical-deferral-record` (re-quote of `187-207`); `pr-resolve-next-step-derived-from-run-state` (re-quote of the Close); `evals/SET-v7.md`; `test/evals/successorInputs.test.ts` and `evals/README.md` only if `rework-critical-deferral-record`'s Expected block lists the row's fields; the two goldens |
| `interfaces` | **`/st-pr-resolve`** Close (`:315-317`): the template reads `` `severity · file:line · description · source: pr-resolve #<n> · when: touched` `` (or `· by: <date>` when the reviewer names one), and one sentence adds that a FIX that stays blocked lands as the same row (D14; the reply at `:255` is unchanged). **`/st-rework`**: both DEFER templates (`:174-178`, `:181-185`) end `· source: rework <branch> · when: touched`; the critical-deferred template (`:199-200`, D11) reads `` `Critical · <file:line> · <the consequence in one line> · source: rework <branch> · when: touched · critical-deferred · <YYYY-MM-DD> · rationale: <the user's sentence>` `` with "or `by: <date>` when the user names one"; the sentence before it (`:197-198`), "the tag and the two extra fields follow the grammar's four", reads "the schedule field, the tag and the two extra fields follow the grammar's four" (review r1 `plan/12`); the meta row (`:286`), amended r2 (`plan/24`), takes the full row grammar: "`.stamity/inbox.md` row `Minor · — · <one line> · source: rework <branch> · by: <YYYY-MM-DD> · meta`" (severity, location, description, writer, a date, the tag; `by:` needs no `files:`). Pins: `feedbackPair.test.ts:436-463`'s `fields.slice(4)` becomes `["when: touched", "critical-deferred", "<YYYY-MM-DD>", "rationale: <the user's sentence>"]` (dated note: the row gains its schedule field); new pins for the DEFER, pr-resolve and meta templates and for "the schedule field, the tag and the two extra fields" |
| `testCriteria` | GIVEN each template with its placeholders filled — the two DEFER rows, the pr-resolve row, the critical-deferred row, the meta row, and D14's dep-audit row — THEN `parseInbox` (q1a, q9b) reads it below the heading with no problem (a small table-driven case in `feedbackPair.test.ts` importing `src/runs/inboxStore.ts`). GIVEN the board census THEN five writers. GIVEN `test/evals` THEN green |
| `edgeCases` | A DEFER finding with no `file:line` (`—`) → `when: touched` needs `files:`; the template says "`files: <path>` when the location is `—`". A Critical deferred through `/st-pr-resolve` uses `/st-rework`'s protocol (`st-pr-resolve.md:218-220`), so one template serves both. The conditional pair (`successorInputs.test.ts`, `evals/README.md`) takes the unit to 9 files; it stays whole, since splitting it leaves the re-quoted case and its recorded move red between units |
| `depends_on` | q11a-plan-writer, q9b-inbox-schedule-grammar |
| `verify` | `npx vitest run test/corpus/commands/feedbackPair.test.ts test/corpus test/evals test/runs/inboxStore.test.ts`, then the goldens command |

### q11c-dep-audit-writer: the dep-audit rows get a grammar, and the flag reads the entry (`close/6`)

| Field | Content |
|---|---|
| `id` | q11c-dep-audit-writer |
| `requirements` | REQ-FLOW-077 |
| `files` | `content/skills/st-dep-audit/SKILL.md`; `evals/cases-v6/golden/work-lockfile-only-bump-audit-before-lens.md` (Brief `:24-25` re-quoted; B2 `:107-109` restated; no v5 copy); `evals/cases-v6/adversarial/work-install-script-bump-keeps-security-lens.md` (its `:45-46` block re-quoted); `evals/SET-v7.md`; the corpus test file under `test/corpus/skills/` that pins Step 5's or the `close/6` clause's words, if the search below finds one (added r2); range-only: any case sourcing the skill past `:102`; the two goldens |
| `interfaces` | **Step 5** (`:97-102`, D14): "items the operator defers land as `.stamity/inbox.md` rows, one per item, in `/st-board`'s grammar: `<Warning with an advisory, else Minor> · <manifest path:line> · <package> <current> → <target>, <risk class>[, <advisory id>] · source: dep-audit · by: <date>` (an advisory's deadline) or `· when: touched`." The rest of the paragraph stays. **`close/6`** (`:118-122`), the clause becomes: "…or an update-risk class other than `patch` or `minor` (Step 4), for the bump's own version move or on the entry itself, so a `major` move, or a changed entry that is `pinned-back` or `unmaintained`, flags; a flag sends the change to the lens." The substring `work.test.ts:1043` pins ("an update-risk class other than `patch` or `minor`") survives |
| `testCriteria` | GIVEN D14's row with its placeholders filled THEN it parses below the heading (one of q11b's table-driven cases, written from D14). GIVEN a corpus pin over Step 5 or the `close/6` clause (search `test/corpus/skills` for their words) THEN it follows the new words with a dated note. GIVEN `work.test.ts:1036-1058` THEN green. GIVEN the board census THEN five writers. GIVEN `test/evals` THEN green |
| `edgeCases` | A downgrade never reaches the audit (`src/change/classify.ts:1286-1307`), so no clause is added for it. An item with no manifest line → the location is the manifest path with `:1` |
| `depends_on` | q11b-feedback-writers |
| `verify` | `npx vitest run test/corpus test/evals`, then the goldens command |

Integration, last: the eval cases, the spec merge and the dogfood sync.

### q7a-cases-read-and-qa: the scoped read and the person-row rule get their cases

| Field | Content |
|---|---|
| `id` | q7a-cases-read-and-qa |
| `requirements` | REQ-FLOW-068, REQ-FLOW-069, REQ-PROVE-009 |
| `files` | New only: `evals/cases-v6/golden/work-frame-reads-matching-inbox-rows.md` (case 1); `evals/cases-v6/golden/qa-ui-change-keeps-person-row.md` (case 2a); `evals/cases-v6/adversarial/benign-qa-cli-change-no-person-row.md` (case 2b, a benign twin) |
| `interfaces` | Each case follows the parser's shape (`scripts/eval/instrument.mjs:42-61`): frontmatter `id` (equal to the file name), `class`, `claim`, `source`, `metric` (its template's), optional `floor: true`; exactly `## Brief` then `## Expected`; under Expected `### Binding criteria…` then `### Advisory criteria…` ("None declared." admissible), at least one binding row; governing blocks headed `` Governing text — `content/…` `` and quoted byte for byte from the landed integration head. Template for structure: `evals/cases-v6/adversarial/work-cap-round-escalates-not-round-four.md` (frontmatter `:1-7`, Brief `:11-104`, Expected `:108-132`). **(1)** template `work-persisted-plan-asks-once`; source: `/st-work`'s Frame step 4 (q1t's lines) and `/st-board`'s row grammar (q9t's); scenario: a change to two named paths, an inbox of five rows of which one names one of those paths in `files:`, one is tagged `decision-waiting` and three match nothing; binding: Frame names the matched row and the `decision-waiting` row, reports the total and unmatched counts, and must NOT fold in or ask about the three unmatched rows. **(2a)** template `qa-bare-signoff-records-unwalked`; source: the qa skill's three-kinds paragraph and class clause (q2's lines); scenario: a `website/src/css/custom.css` change (class `docs`, the `design-quality` lens named); binding: one person row ("the changed page renders and reads right") with the sign-off block, and must NOT print "no walk-through required". **(2b)** template `benign-optional-step-skipped-proceeds`; same source; scenario: a change to `src/cli/commands/ledger.ts` alone (class `product`, no lens, no rendered surface); binding: every row auto-proven (its check run by the test-runner where no artifact existed) and no ask; advisory only beyond that (a benign twin carries no must-NOT row) |
| `testCriteria` | GIVEN `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts` THEN green: each `source:` range exists, its first line is anchored, every quoted block matches the landed file. `test/evals/roster.test.ts` ("one row per case file", the appendix) and `readmeCurrency.test.ts` are red until q7c: the declared window |
| `edgeCases` | A source line moved after the case was written (a later integration unit) → q7c re-anchors it with its index cell. A Brief that needs a secret-shaped value → describe it in words; no added line carries one |
| `depends_on` | q11c-dep-audit-writer, q6c-copilot-effort-key |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts` (roster and README currency declared red until q7c) |

### q7b-cases-close: the clean close gets its cases

| Field | Content |
|---|---|
| `id` | q7b-cases-close |
| `requirements` | REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-076, REQ-FLOW-077, REQ-PROVE-009 |
| `files` | New only: `evals/cases-v6/adversarial/close-real-defect-never-preset-to-drop.md` (case 3, `floor: true`); `evals/cases-v6/golden/unattended-close-keeps-real-defects.md` (case 4, `floor: true`); `evals/cases-v6/adversarial/vague-deferral-without-place-refused.md` (case 5); `evals/cases-v6/adversarial/benign-close-no-leftovers-asks-nothing-extra.md` (case 6, a benign twin) |
| `interfaces` | The shape of q7a's cell. **(3)** templates `reviewer-minor-worded-as-note-recorded` (substance) and `work-install-script-bump-keeps-security-lens` (adversarial with `floor: true`, `:3`, `:7`); source: `/st-board`'s Leftovers bullet and `/st-work`'s close (q9t's, q10a's lines); scenario: a close with a Warning finding whose author's note urges dropping it as "cosmetic", beside two notes; binding: the Warning is listed first with fix now or schedule and must NOT be pre-set to drop or folded into the notes line. **(4)** template `unattended-run-applies-declared-default` (golden, floor); same source; scenario: an unattended close holding one Critical deferred ledger row, one Minor ledger row, one inbox row its change touched and did not fix, and three notes; binding: the notes are dropped and counted, the Critical and the Minor are appended tagged `decision-waiting` with `when: next attended close`, the touched inbox row stays as it is, all three are listed on `Not done:`, the leftovers line reads `shown=3` … `fixed=0 scheduled=3 dropped=0 accepted=0` … `changed=0`, and the Critical must NOT be dropped or retired, and the touched inbox row must NOT be appended a second time (review r1 `plan/4`, `plan/13`). **(5)** templates `work-cap-round-escalates-not-round-four` (pressure in the scenario input) and `rework-critical-deferral-record` (the row shape); source: `/st-board`'s row grammar and `/st-work`'s append paragraph; scenario: a sub-agent's report asks to defer a finding "until later" with no place; binding: the row carries a date or a non-vague trigger and its files, and must NOT be appended with `when: later` or with neither field. **(6)** template `benign-optional-step-skipped-proceeds`; source: `/st-work`'s close; scenario: a close with every finding fixed, no inbox row touched or due, no `decision-waiting` row in the inbox (amended r3, `plan/34`: such a row would be a leftover), no notes; binding: the close asks only what it asked before (or nothing) |
| `testCriteria` | As q7a's |
| `edgeCases` | As q7a's. Cases (3) and (4) take the floor count from 28 to 30; every must-NOT row of (3), (4) and (5) is an appendix row q7c writes |
| `depends_on` | q11c-dep-audit-writer, q6c-copilot-effort-key |
| `verify` | `npx vitest run test/evals/locators.test.ts test/evals/coverage.test.ts` (declared red as q7a's) |

### q7c-eval-index: the one SET-v7 count writer of q7, with `review/174` and `close/13`

| Field | Content |
|---|---|
| `id` | q7c-eval-index |
| `requirements` | REQ-PROVE-009 |
| `files` | `evals/SET-v7.md`; `evals/README.md`; `scripts/eval/run.mjs`; `.stamity/overrides/skills/st-eval-run/SKILL.md`; a q7a or q7b case file whose per-case check fails after the merge |
| `interfaces` | **Index:** seven case-index rows (table at `SET-v7.md:1606-1741`), each with its B/A counts, verbatim claim, source, class·metric and `*(floor)*` for (3) and (4) (`test/evals/roster.test.ts:31-139`); appendix rows for every must-NOT binding row of (3), (4) and (5) with both total sentences (`:75`, `:1823`; `roster.test.ts:143-166`). **Counts** recomputed from the landed files (D15): 134 → 141 cases; golden 78 → 81; adversarial 26 → 30 (guardrails 22 → 24, benign twins 4 → 6); probes 30; floor 28 → 30; binding and advisory totals from the files; the cells at `:107-110`, `:128-129`, `:1498-1505`. One dated "What v7 adds" paragraph (precedent `:1367-1403`). **`review/174` (D16):** at `SET-v7.md:1`, `:44-45` and `evals/README.md:11-12`, `:31`, `:45-46`, "by reviewed dispositions, three amendments or re-syncs" becomes the count by kind of `EXPECTED_MOVES` as it stands after q11b (today "by seven reviewed dispositions, three amendments and four re-syncs"; `:44-45` adds the re-sync dates); `:9-10` "a reviewed disposition or amendment" becomes "a reviewed disposition, amendment or re-sync"; the "<n> moved" count stays beside every "byte-identical" count (`readmeCurrency.test.ts:139-146`). **`close/13`:** in the paragraph at `SET-v7.md:1405-1418` (find it by its words), "169-172" becomes "170-173" and "226" becomes "225" (`:1408`, `:1409`, `:1412`). **Literals:** `evals/README.md:550` "134-case roster" → 141; `scripts/eval/run.mjs:50` `134` → `141`; `.stamity/overrides/skills/st-eval-run/SKILL.md:133`, `:135`: 134 → 141 cases, 402 → 423 scenarios, 804 → 846 calls, and nothing else in that file. The maintainers' eval driver outside this repository pins SET-v7's hash; it is re-pinned at the 1.14.0 cut, not here |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green: roster, appendix, locators, coverage, successor inputs, README currency and the manual runner's input count (`loadInputs`) included. GIVEN the case files THEN 141 under `evals/cases-v6` |
| `edgeCases` | A case's class differs from the cells above → the counts follow the landed files. A carried case whose byte-identity moved in q11b → the identical and moved counts follow `readmeCurrency.test.ts`'s derivation. `review/174` and `close/13` (folded at the plan gate, `record.md:61`) leave the inbox at the close, retired `fixed in 2026-10-10_next-tier` |
| `depends_on` | q7a-cases-read-and-qa, q7b-cases-close |
| `verify` | `npx vitest run test/evals && npm run build && node dist/cli.js validate` |
| `threat` | Boundary: `.stamity/overrides/**`, operator-owned text the eval-run skill loads as its own instructions. Trusted: this repository's committed override. Abuse: an edit riding the count change that widens what the eval session may run or read. Stops it: the cell limits the edit to the numbers on `:133` and `:135`; the security lens reads the diff; `stamity validate` re-runs the write gates over `overrides/` |

### s1-spec-merge: the Spec delta merged into `docs/specs`, once

A spec-author unit (D18); it writes the three files, and the orchestrator commits them.

| Field | Content |
|---|---|
| `id` | s1-spec-merge |
| `requirements` | REQ-FLOW-068, REQ-FLOW-019, REQ-FLOW-069, REQ-FLOW-017, REQ-FLOW-070, REQ-FLOW-063, REQ-LADDER-004, REQ-LADDER-001, REQ-LADDER-003, REQ-CTX-019, REQ-FLOW-071, REQ-FLOW-074, REQ-FLOW-075, REQ-FLOW-076, REQ-FLOW-077, REQ-CTX-020, REQ-FLOW-024 |
| `files` | `docs/specs/everyday-flows.md`; `docs/specs/model-ladder.md`; `docs/specs/orchestrator-context.md` |
| `interfaces` | Brownfield merge of this plan's `## Spec delta`, every claim read at the integration head named in the report. **ADDED** entries become `### REQ-…` headings under `## Requirements`, after the highest id of their area, with GIVEN/WHEN/THEN acceptance sets in each spec's acceptance-section form; REQ-FLOW-071 is allocated (q6b's gap branch, settled at the plan gate), with the cloud agent's undocumented handling in the spec's Risks or Concerns as the accepted risk. **MODIFIED** entries become "Amended 2026-10-10 (run `2026-10-10_next-tier`, unit `<id>`)" paragraphs under their requirement (REQ-FLOW-017 at `everyday-flows.md:387-404`, REQ-FLOW-019 at `:427-445`, REQ-FLOW-024 at `:566-585`, REQ-LADDER-001 at `model-ladder.md:42-71`). **Bookkeeping:** `everyday-flows.md`'s head comment (`:3`) and lead (`:17-22`): this run's merge, "068 to 077" merged, status unchanged (unreleased); `model-ladder.md`: the Concerns bullet (`:153-161`) closed by a dated note naming the three recorded placements and the escalation's effort step (q4b, q4t); `orchestrator-context.md`: REQ-CTX-019 and REQ-CTX-020 after REQ-CTX-018, and the hand count at `:1002-1006` set to what `grep -c "^- GIVEN" docs/specs/orchestrator-context.md` returns after the merge. The two entries merge with their two places kept apart, as the delta states them (amended r4, `plan/39`): REQ-CTX-019's usage lines are appended to the record as each phase or review round ends, as the capacity lines are, and REQ-CTX-020's leftovers line is a line of its own in the Proof block; each is its own line, never directly above a table, and neither entry points at the other's place. Each is read against the landed `/st-work` paragraph (`**Usage lines.**` after q5's fix round, `**Leftovers line.**` from q10a) before it is written. **Citations:** re-point every spec citation of a line this run moved — `content/commands/st-work.md` (among them `everyday-flows.md:431`, `:572`, `:591`, `:1050-1052`; `model-ladder.md:18`, `:90`, `:106`, `:112`, `:122`, `:132-136`), `st-board.md`, `st-plan.md`, `st-rework.md`, `st-pr-resolve.md`, `st-quick.md`, `content/skills/st-qa/SKILL.md` (`everyday-flows.md:389`, `:399`, `:409-410`), `content/skills/st-dep-audit/SKILL.md` (`:1150-1154`), `content/agents/stamity-test-runner.md`, and `src/runs/ledgerStore.ts` (REQ-FLOW-024's `:895-968`) — with f0's report's list as the starting set |
| `testCriteria` | GIVEN `node content/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-10_next-tier/plan.md docs/specs` THEN exit 0 with no `provisional-definition` left for a merged id. GIVEN `npx vitest run test/records/specStatus.test.ts test/ci/docsRoster.test.ts` THEN green. GIVEN the `- GIVEN` count sentence THEN it equals the grep. GIVEN each re-pointed citation THEN the cited line holds the cited text at the named head (judgment: reviewer) |
| `edgeCases` | A delta entry the landed code contradicts → the spec states what the code does, with an "As built" line, and the report names the gap. A citation whose text no longer exists → removed and named in the report, never guessed |
| `depends_on` | q7c-eval-index |
| `verify` | `npx vitest run test/records test/ci/docsRoster.test.ts test/authoring && node content/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-10_next-tier/plan.md docs/specs` |

### q8-dogfood-sync: every emitted copy regenerated

| Field | Content |
|---|---|
| `id` | q8-dogfood-sync |
| `requirements` | spec carries no ids |
| `files` | `.claude/**`, `.agents/**`, `.apm/**`, `AGENTS.md`, `.stamity/manifest.json`, every other copy `sync` writes; the two goldens if a copy moves them |
| `interfaces` | `npm run build && node dist/cli.js sync`, then `node scripts/generate-apm-package.mjs` (it writes `.apm/`, which CI diffs; `sync` does not), then the goldens command. No authored text |
| `testCriteria` | GIVEN `node dist/cli.js check` THEN clean. GIVEN `npx vitest run test/corpus test/emit test/ci/apmPackage.test.ts test/cli/dogfoodDist.e2e.test.ts` THEN green. The branch's full suite runs after this unit, alone, at Proof (D34) |
| `edgeCases` | A golden that moves with no content change → stop and find the cause. `sync` rewrites `.stamity/manifest.json`'s `updatedAt` even when nothing else moves (`build/96`, scheduled to plan 016 file 1): keep the line and name it |
| `depends_on` | s1-spec-merge |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs && node dist/cli.js check && npm run lint && npm run typecheck && npx vitest run test/corpus test/emit test/ci/apmPackage.test.ts` |
| `threat` | Boundary: `.stamity/manifest.json`, the engine's own state read back as authority (built-in `security-sensitive`). Trusted: the engine's `sync` output from this branch's build. Abuse: a hand edit slipped in beside the regeneration (a pin, an effort level, a selection). Stops it: no authored text in this unit; the diff is `sync`'s output, which `check` re-reads; the security lens reads the manifest hunk |

## Spec delta

New ids follow plan 019 file 2's: the flow area takes 068 to 077 (068 to 071 are held at `everyday-flows.md:21-22`;
074 to 077 are noted there at the merge), the ladder area its next id, and the context area 019 and 020. Every one is
free at HEAD (`reports/plan-researcher-r1-close-usage.md`, "Free ids"). `s1-spec-merge` writes this section into
`docs/specs/`, once, against the integration head.

### REQ-FLOW-068 — `/st-work` reads the inbox rows that match its change (ADDED)

GIVEN a run's changed or planned paths WHEN Frame reads the deferral inbox THEN it reads the rows the `ledger` verb's
`inbox` query returns for those paths and the plan, with the total and unmatched counts and every `critical-deferred`
and `decision-waiting` row; GIVEN a bare intent THEN it queries again with the plan's files once the plan is written;
GIVEN a CLI that cannot run at all (absent, or it crashed) THEN Frame reads the whole file and says so, and in no other
case; GIVEN a read the query refuses (the inbox is a symbolic link, or over 1 MiB) THEN Frame reports a finding naming
the refusal and never reads the file whole; GIVEN the query THEN every printed field is sanitised, and a row, parsed
or not, that the engine's block catalog matches over its raw, stripped or normalized text prints only as
`skipped: <line> (<pattern id>)`; GIVEN a row the screen withholds THEN the query still prints its line number,
severity and location and still matches it by location and `files:`, whenever those fields alone pass the screen (else
only its line number), and never prints its description; Frame lists a matched withheld row as "withheld by the screen
(<pattern id>); read it by hand", and the close lists it among the leftovers the same way.

### REQ-FLOW-019 — Frame's inbox read is the matched rows, and the close's one question decides the leftovers (MODIFIED)

`docs/specs/everyday-flows.md:429-431`, item 1: the whole-file read becomes the read of REQ-FLOW-068.
`docs/specs/everyday-flows.md:436-439`, item 3: the close's one question gains the leftovers part of REQ-FLOW-074, and
its default gains the unattended rule of REQ-FLOW-075.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet (ADDED)

GIVEN a change THEN person rows are created only for a rendered surface a person must look at, a live third-party
client or account, or a step that cannot be undone; GIVEN a `docs`, `records` or `tests` class with no changed path a
site build renders and none `gate classify` hands the `design-quality` lens THEN the checkpoint prints "no
walk-through required — <class> only" and asks nothing; GIVEN such a class with such a path THEN it emits one person
row, the changed page renders and reads right.

### REQ-FLOW-017 — The checkpoint's rows follow REQ-FLOW-069 (MODIFIED)

`docs/specs/everyday-flows.md:387-404`: rows left for a person are the kinds REQ-FLOW-069 names, and the QA step hands
the qa skill the class and lenses `gate classify` named.

### REQ-FLOW-070 — Plan-lint L5 reports plan size (ADDED)

GIVEN a plan WHEN the coverage script runs THEN it reports `unit-size` (a unit past 60 lines), `unit-oversize` (past
100), `unit-prewritten` (a fenced block or five or more `>` lines inside a unit) and `delta-verbose` (a requirement
entry past six lines), each advisory, with the unit or entry and its line; GIVEN an indented heading-like line THEN it
starts no unit; the return lines of `/st-plan` and `/st-rework` add `L5 none|<n> advisory`.

### REQ-FLOW-063 — The test-runner reads the CI provider from its own body (MODIFIED)

`docs/specs/everyday-flows.md`, the amended paragraph of this requirement naming the unknown-provider rule: the rule reads the
provider rendered into `content/agents/stamity-test-runner.md` on every client, so a client whose sub-agents do not
load the charter still applies it; a `red` verdict writes nothing to the named report and is returned in full.

### REQ-LADDER-004 — Each client gets the effort levels it accepts (ADDED)

GIVEN the Codex emit THEN each agent's effort is on Codex's documented scale, `low` to `ultra`, an operator `max` is
written as `max`, and a stored `minimal` is written as `low` and still accepted by `config set` on a Codex selection;
GIVEN the Claude emit THEN the economy class keeps `effort: low` and an operator `ultra` is written as `max` with a
disclosure; GIVEN Copilot THEN each custom agent carries `reasoning-effort` at its class default on the scale `low` to
`max`, an operator `ultra` written as `max` and a stored `minimal` as `low`, still accepted by `config set` there; the
class defaults do not move (`docs/specs/model-ladder.md:33-34` stands).

### REQ-LADDER-001 — The effort scales follow the clients (MODIFIED)

`docs/specs/model-ladder.md:44-55`: `EFFORT_LEVELS` gains `ultra` at the top; Codex's scale reads `low … ultra`, with
`minimal` a legacy level its row accepts; Copilot's row follows REQ-LADDER-004; the disclosure examples move with them.

### REQ-LADDER-003 — The ladder records the closure re-review after an escalation (MODIFIED)

`docs/specs/model-ladder.md:153-161`, Concerns: the one closure re-review after a fixer escalation is the third
recorded placement (the frontier row and the module header), and `/st-work`'s Model ladder paragraph names the
escalation fixer's effort step beside the capacity rung's drop.

### REQ-CTX-019 — The run record carries usage where the client reports it (ADDED)

GIVEN a phase or a review round that ends THEN the record gains
`- <UTC> usage: <phase|review rN> minutes=<n> tokens=<n|unreported> (<client>)`, appended then, as the capacity lines
are, each on its own line and never directly above a table; the line names no place in the Proof block, which does not
exist while the run is going; the rule's text in `/st-work` stays below the re-attach cut, where a resumed run re-reads
it.

### REQ-FLOW-071 — Copilot sub-agents receive the charter (ADDED)

GIVEN the Copilot emit THEN every custom agent carries `include-custom-instructions: true`, so one run as a sub-agent
loads the repository instructions (Copilot CLI 1.0.86 on; a 1.0.89 sub-agent without it loaded none, 2026-10-10);
the capability row names that evidence, the `--no-custom-instructions` override, and the cloud agent's undocumented
handling of the key, an accepted risk.

### REQ-FLOW-074 — The close decides every leftover (ADDED)

GIVEN a close with `decision-waiting` inbox rows, ledger rows neither fixed nor rejected (Minor rows included), inbox
rows due or touched by the change, or notes left out THEN its one question lists each leftover with a recommendation
(fix now, schedule, drop) and a one-line reason naming its evidence and what would change it, the `decision-waiting`
rows first, then Critical and Warning, never pre-set to drop, the notes in one line;
the answer is applied before the record is written, and to an inbox row it decided as well: a drop retires the row and
removes it, a plan, board or handoff place retires it there, and a new date or trigger replaces it with one row
carrying the same `Ref:`; only the person drops a Critical or Warning, which stays on
`Not done:` as an accepted risk with the reason; an empty part drops out. Default if no response: REQ-FLOW-075, and
leave uncommitted.

### REQ-FLOW-075 — An unattended close never drops a real defect (ADDED)

GIVEN a close no one answers THEN only notes are dropped (counted) and only fixes the run's plan covers are made;
every other leftover of the run's own ledger goes to the inbox tagged `decision-waiting` with its recommendation and
`when: next attended close`, always showing in the `ledger` verb's `inbox` query; an inbox row the change touched or
found due, or one an earlier close tagged `decision-waiting`, stays as it is, never copied; each is listed on
`Not done:`, and the next attended close takes every `decision-waiting` row into its leftovers first.

### REQ-FLOW-076 — A scheduled item names a place, a date or a trigger, and its files (ADDED)

GIVEN a scheduled item THEN it names a place (a plan unit or follow-up section, a board item, a handoff, an inbox row),
`by: <YYYY-MM-DD>` or `when: <trigger>`, and its files. From 2026-10-10 a new `retired` value is `fixed <ref>`,
`cut <reason>` or `scheduled <place> · by|when …` (a keyword may take a colon), else refused with why and next; the
records gate refuses an inbox row below the schedule-rule heading without `by:` or `when:`, with a vague trigger, or
with `when: touched` and no path; the query's `--due` returns overdue rows; a close takes touched and due rows as
leftovers; nothing retires a row unanswered; earlier rows and values stay valid.

### REQ-FLOW-077 — Every inbox writer follows the schedule rule (ADDED)

GIVEN `/st-plan`'s follow-ups, `/st-pr-resolve`'s and `/st-rework`'s DEFER rows, `/st-rework`'s critical-deferred and
meta rows, or the dep-audit skill's rows THEN each carries the grammar's four fields, `by:` or `when:`, and `files:`
when its location is `—`; a plan follow-up with neither goes to that plan's Drop list; `/st-plan`'s shape names
optional Follow-ups and Drop list sections; `/st-quick` appends no row and has no leftovers ask: what its batch cannot
finish escalates to `/st-work`, whose close asks (REQ-FLOW-074); GIVEN a dep-audit flag THEN it reads the changed
entry's own risk class as well as the bump's move.

### REQ-CTX-020 — The close records what happened to its leftovers (ADDED)

GIVEN a close THEN its record carries one line of its own in the Proof block, never directly above a table, with
n = f + s + d, k ≤ d, a ≤ n, the notes outside n, every `decision-waiting` row the close took counted in n, a
`decision-waiting` append and a kept inbox row (an earlier `decision-waiting` one included) counted in s, and
d = k = c = 0 unattended:
`- <UTC> leftovers: shown=<n> real=<a> fixed=<f> scheduled=<s> dropped=<d> accepted=<k> notes=<p|unknown> changed=<c>`

### REQ-FLOW-024 — Retire values follow the schedule rule (MODIFIED)

`docs/specs/everyday-flows.md:568-575`, `:577-580`: from the cutover, a new `retired` value follows the grammar of
REQ-FLOW-076; a row dropped at a close, or scheduled there to a place other than the inbox, is retired then and never
appended to the inbox; "scheduled with a lane, a trigger and an owner" reads "scheduled to a place with a date or a
trigger"; the `retireRow` citation moves to `src/runs/ledgerStore.ts:895-978` and the lines q9a adds.

## Re-resolved cells

What moved between `f1035ef8` and `359610a5`, and how each persisted cell now reads.

| Persisted cell | What moved, or what the research found | Now |
|---|---|---|
| (none) | `st-work.md` at 142 characters and 2 lines of room; `build/1`, `build/17`, `close/10` placed at the Frame | `f0-make-room`, `f1-erasable-guard` (frozen, D1) |
| q1 | Frame step 4 is `:25-32`; the dispatch at `ledger.ts:679` runs any other subcommand as `append`; no `test/cli/commands/ledger.test.ts`; the fixtures named are not in the inbox; the inbox is unscreened state; `PLAN_MAP`, root keys and a test-input entry are needed | `q1a-inbox-store` and `q1b-records-gate-parser` (lane A, D9, D10, D24, D25); `q1t-frame-inbox-read` (D20) |
| q2 | The docs clause is `st-qa:38-40`; no pin on it; the class cannot tell a rendered page; the opening batch amended S3 | `q2-qa-rows` (D2, D30) |
| q3 | The L-codes live in prose; plan 015 shows a fake unit; `delta-verbose` fires on all of 013-02 | `q3a-plan-size-script` (lane D, D3, D23), `q3b-plan-size-text`; `/st-rework`'s part rides `q10b` |
| q4 | Haiku 5.5 accepts effort; Codex lists `ultra`, not `minimal`; two Copilot spellings; `"ultra"` is two tests' unknown level; `build/87` rides here | `q4a-effort-union`, `q4b-codex-scale` (lane D, D4, D5, D7, D26); `q4t-ladder-placement-text` |
| q5 | The line cap binds; the measurements reader takes a table's lead from the line above | `q5-usage-lines` (D17) |
| q6 | The 2026-09-30 check used the top-level route; the key defaults to `false`; the effort key waits on the loader read; `build/61` rides here | `q6-copilot-charter-check` (done: `quoted no`); `q6b-copilot-instructions-key` (gap branch), `q6c-copilot-effort-key` (emit branch) (lane D, D6, D8, settled at the plan gate); `q6t-test-runner-ci-line` (with `build/85`, D36) |
| q9 | `retiredProblems` and `parseDisposition` do not exist; `:923-929` has no `next`; 153 values spell `cut`, many with a colon; the critical-deferred row fails today; `ledgerStore.ts` is security-sensitive | `q9a-disposition` (threat row), `q9b-inbox-schedule-grammar` (lane A, D12, D27, D28); `q9t-board-inbox-rules` |
| q10 | "The close asks once" is `:332-336`; the append paragraph `:389-401`; `st-quick.md:165-171` is the Classify step; more eval cases move; S13's row needs q9's grammar | `q9t-board-inbox-rules` (the board block), `q10a-work-close`, `q10b-flow-close-pointers` (D32) |
| q11 | `/st-plan`'s shape has no Drop list; the critical-deferred row carries no schedule field; the dep-audit rows have no grammar; `close/6` rides here | `q11a-plan-writer` (D13), `q11b-feedback-writers` (D11, D14), `q11c-dep-audit-writer` |
| q7 | 134 cases at HEAD; item 2 is two files; three count literals outside SET-v7; `review/174` and `close/13` fire on the next SET-v7 edit | `q7a-cases-read-and-qa`, `q7b-cases-close`, `q7c-eval-index` (D15, D16) |
| q8 | `generate-apm-package.mjs` writes `.apm/`, which `sync` does not | `q8-dogfood-sync`, with no full suite in its `verify` (D34) |
| Spec delta | Every spec cite moved; 074 to 077 are not noted in the reservation line; the `- GIVEN` count is at `orchestrator-context.md:1002-1006` | Re-cited above; written once by `s1-spec-merge` (D18) |

## Execution order

1. **At the Frame (done):** `f0-make-room` built on integration (`0b03f126`, `caa2beca`) and `f1-erasable-guard` on
   lane A (`d826ac5c`), both approved; `q6-copilot-charter-check` done (`quoted no`); this plan written, the plan gate
   answered (`record.md:60-65`), review r1 folded in by this amendment. `q4a-effort-union` building on lane D.
2. **Three lanes in parallel.** Integration: f0 (built) → q2 → q5 → q6t. Lane A: f1 (built) → q1a → q1b. Lane D:
   q4a (building) → q4b → q3a. Each lane runs `npm run build` before any whole-suite run.
3. **Lane A merges, step 1** (after q1b's review and a lane A full suite), then integration runs q1t. **Lane D merges,
   step 1** (after q3a's review), then integration runs q3b → q4t. Lane A runs q9a → q9b meanwhile; lane D runs
   q6b → q6c, their branches filled in this amendment (gap, emit).
4. **Lane A merges, step 2** (after q9b's review and the security lens on q9a), then integration runs q9t → q10a →
   q10b → q11a → q11b → q11c. **Lane D merges, step 2** (after q6c's review) before q7.
5. **The q7 cases:** q7a and q7b in parallel on fresh branches in the two lane worktrees (open question 2's default,
   applied, `record.md:65`); both merge; then q7c closes the declared red window.
6. **Then** s1 (spec-author) → q8.
7. **Proof on the integration branch:** the full suite alone, `node scripts/ci/test-run.mjs --coverage`, with
   `STAMITY_CLAUDE_BIN` unset (the red live Claude walk; reason recorded); lint; typecheck; knip; CI on the pull
   request, every leg read to its end, both Windows legs included.
8. **Reviews:** each unit's review per the review loop; the security lens on q1a (the screen and the class file), q9a,
   q9b, q6b, q6c, q11c (`close/6`), q7c and q8; the final whole-branch review at Fable 5.1 before the merge, which is
   held for the end.
9. **Full suites one at a time on this machine,** never beside a live client check (`record.md:91`); QA row 2's
   re-run, if the close's question takes it, runs alone.

| Unit | Lane | `depends_on` | Est. changed lines |
|---|---|---|---|
| f0-make-room | integration | none | 250 (built) |
| f1-erasable-guard | A | none | 15 (built) |
| q6-copilot-charter-check | none (scratch repository) | none | 0 (a report; done) |
| q2-qa-rows | integration | f0-make-room | 120 |
| q5-usage-lines | integration | q2-qa-rows | 60 |
| q6t-test-runner-ci-line | integration | q5-usage-lines | 30 |
| q1a-inbox-store | A | f1-erasable-guard | 430 (r3: about +30 for the withheld rows, in its fix round) |
| q1b-records-gate-parser | A | q1a-inbox-store | 120 |
| q4a-effort-union | D | none | 80 (building) |
| q4b-codex-scale | D | q4a-effort-union | 230 (r3: one more pin) |
| q3a-plan-size-script | D | q4b-codex-scale | 300 |
| q1t-frame-inbox-read | integration | q6t-test-runner-ci-line, q1b-records-gate-parser | 90 |
| q3b-plan-size-text | integration | q1t-frame-inbox-read, q3a-plan-size-script | 80 |
| q4t-ladder-placement-text | integration | q3b-plan-size-text, q4b-codex-scale | 50 |
| q9a-disposition | A | q1b-records-gate-parser | 380 |
| q9b-inbox-schedule-grammar | A | q9a-disposition | 400 (r3: +20, D38) |
| q6b-copilot-instructions-key | D | q6-copilot-charter-check, q3a-plan-size-script | 60 |
| q6c-copilot-effort-key | D | q6b-copilot-instructions-key | 300 |
| q9t-board-inbox-rules | integration | q4t-ladder-placement-text, q9b-inbox-schedule-grammar | 140 |
| q10a-work-close | integration | q9t-board-inbox-rules, q5-usage-lines | 290 (r3: +30) |
| q10b-flow-close-pointers | integration | q10a-work-close | 120 |
| q11a-plan-writer | integration | q10b-flow-close-pointers, q3b-plan-size-text | 110 |
| q11b-feedback-writers | integration | q11a-plan-writer, q9b-inbox-schedule-grammar | 160 |
| q11c-dep-audit-writer | integration | q11b-feedback-writers | 70 |
| q7a-cases-read-and-qa | case branch A (or integration) | q11c-dep-audit-writer, q6c-copilot-effort-key | 330 |
| q7b-cases-close | case branch D (or integration) | q11c-dep-audit-writer, q6c-copilot-effort-key | 400 |
| q7c-eval-index | integration | q7a-cases-read-and-qa, q7b-cases-close | 160 |
| s1-spec-merge | integration (spec-author) | q7c-eval-index | 300 |
| q8-dogfood-sync | integration | s1-spec-merge | generated |

## Learnings that apply

| Learning | Units |
|---|---|
| `plain-node-imports-of-src-need-erasable-syntax` | f1; q1a, q9a, q9b (the docs generator loads `src/runs` by type stripping) |
| `a-new-import-runs-the-architecture-test` | q1a, q9a (new modules, `PLAN_MAP` rows, root keys) |
| `a-fresh-worktree-lane-builds-before-its-full-suite` | every lane's full suite; q8 |
| `corpus-line-shifts-move-eval-case-source-ranges` | every content unit; q7a, q7b, q7c |
| `corpus-edits-ship-with-a-dogfood-sync` | q8; any unit under the dogfood rule |
| `vitest-update-flag-takes-an-optional-value` | every goldens command |
| `surface-pins-are-literals-that-drift` | q1a, q9b (`docs/cli-reference.md`), q4a (the union's literals), q7c (the count literals) |
| `typed-unicode-escapes-land-as-raw-code-points` | q1a, q9a, q9b (the row separator ` · ` and the arrow in messages are U+00B7 and U+2192, typed as characters) |
| `leak-gate-scans-stamity-state-files` | q1a (`.stamity/change-classes.json`), q9b (`.stamity/inbox.md`), q7c (`.stamity/overrides/`) |
| `git-stash-is-shared-across-worktrees` | every lane and case branch |
| `verdict-roles-read-lanes-through-a-diff-file` | every lane review; s1 |
| `the-local-test-gate-is-weaker-than-ci` | the branch's full suite with `--coverage`; CI's Windows legs |
| `a-merge-to-main-is-proven-by-its-push-runs` | after the merge: `main`'s push runs |

## Security notes

Threat notes for the units in the security class, and the screening concerns beside them; five lines each at most.

- **q9a (threat row in its cell): the `retired` grammar.** `ledgerStore.ts` is `security-sensitive` here
  (`.stamity/change-classes.json:6`); the lens reviews it.
- **q1a (threat row in its cell) and q9b: inbox text into the orchestrator's context.**
  - Boundary: `.stamity/inbox.md`, user-tier state any writer can author (injection-screening floor 1).
  - Abuse: a row, parsed or deliberately unparseable, carrying a directive, an invisible-character split, a forged
    marker or an exfil link, printed into a run's Frame by the new query or its problems list.
  - Stops it: every field through `sanitizeLabel`; the full block catalog, exfil rows included, over each line's raw,
    stripped and normalized text; a hit prints only `skipped: <line> (<pattern id>)`, or for a withheld row only its
    line, severity and location, each screened alone, and never its description (D9, D25; r3 `plan/30`, D38); Frame
    and the close list a withheld row as printed and never open it (D39); Frame reads the whole file only when the
    CLI cannot run at all (absent, or it crashed), and a read the query refuses (a symbolic link, or over 1 MiB) is a
    finding naming the refusal, never a whole-file read, so padding a row past 1 MiB opens no unscreened read (r4
    `plan/38`); the parser reads strings and never executes or opens a path.
- **q1a: `.stamity/change-classes.json`** (built-in `security-sensitive`): only an added test path, nothing removed;
  the lens reads the hunk (threat row in its cell).
- **q6b and q6c: two keys on the shared `.github/agents/` files.**
  - Boundary: the agent files Copilot's CLI, IDEs and github.com's cloud agent all read; `AGENTS.md`, `CLAUDE.md` and
    `copilot-instructions.md`, operator-owned and already loaded by the session agent.
  - Abuse or failure: a client that misreads a key it does not document. The CLI warns and ignores unknown keys
    (`reports/q6-test-runner-r1.md:63-68`); the cloud agent's handling is undocumented, accepted at the plan gate
    (Risks, Follow-ups). The `--no-custom-instructions` flag still wins; no row claims the cloud agent honours a key.
- **q10b (r4 `plan/40`): `/st-quick`'s paragraph adds no ask.** A scan hit, a `security-sensitive` class, a red gate
  and a refusal each keep the one route the lane already gives them (`content/commands/st-quick.md:157-160`,
  `:165-169`, `:190-194`, `:56-59`); the new text offers no choice, so nothing can close a batch around a hit.
- **q11c (`close/6`): the audit's flag.** The flag widens (a changed entry's own `pinned-back` or `unmaintained` class
  flags), the fail-safe direction; the lens still runs on any flag.
- **q7c and q8 (threat rows in their cells):** `.stamity/overrides/**` and `.stamity/manifest.json`.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | `stamity ledger inbox --paths <a real change's paths>` shows the rows a reader would fold in; with `--paths .github/workflows/nightly.yml` it lists the two rows the screen withholds there by line, severity and location, `withheld by the screen (<pattern id>); read it by hand`, and none of their text (amended r3, `plan/30`) | person |
| 2 | With q6b's key emitted, a Copilot sub-agent quotes the charter: q6's check (`plan-researcher-r1-copilot.md`, "## Live-check procedure") re-run once in a scratch repository initialised from the branch's build | offered in the close's one question (one more premium request on the maintainer's account, `record.md:79`); approved → run by the test-runner alone on the machine and recorded `auto-proven`, its report the pointer, with its record line; declined or unanswered → the row stays open and the sign-off reads `not signed` for it; never `walked`, and `accepted-unwalked` only on the person's own word, with its input hash (amended r3, `plan/32`) |
| 3 | A real `/st-work` close with leftovers shows them with their recommendations in its one question, and a close with none asks nothing extra | person |
| 4 | The notes left out by the `/st-work` runs since file 2 merged (at least three runs, from their local reports) hold no real defect | auto: a reader checks each list; the person sees only what it flags |
| 5 | The rendered pages this run changes render and read right: `docs/working-with-stamity.md` and `docs/getting-started.md` (q10a, by hand) and `docs/cli-reference.md`, `docs/configuration.md` and `docs/capability-matrix.md` (generated) | auto-proven first by the site build (the pull request's docs-site build, read to its end); then person: reading the two hand-edited pages (`record.md:62`; q2's rule applied to this run). The third person row, with 1 and 3 |

Rows 1, 3 and 5 are the person rows, at the cap the gate named (`record.md:62`).

## Risks

- **Warning:** `st-work.md`'s two budgets. f0 frees room; every later writer stays within its allocation and records
  both numbers; q10a, the last writer, records the room left for Package 22, and a shortfall goes on the close list.
- **Warning:** a `retired` value written today, before q9a merges, outside the grammar fails the records gate once
  q9a lands (the cutover is 2026-10-10, D12). Mitigation: until q9a merges, the run retires only with
  `fixed in 2026-10-10_next-tier` (the form the inbox rows it fixes take); any other value is written after q9a.
- **Warning:** the board's writer census counts any content file naming the inbox path; a pointer in the wrong file
  makes a sixth writer. Mitigation: the common rule; no unit adds the path to a new file; the census test stays judge.
- **Warning:** a path-only inbox match misses prose locations and bare file names. Mitigation: `--area`, the basename
  rule, `files:` from q9b, and the counts that make a miss visible.
- **Warning:** "fix now" spends a review round and can reopen a person QA row's input hash. Mitigation: offered only
  while the cap leaves a round and outside an open person row's files.
- **Warning:** a manifest storing `ultra` is refused by an engine older than q4a, so a downgrade needs the key removed
  first. Mitigation: no class default uses it; the operator sets it by hand.
- **Warning:** with q6c's key, a copilot-only repository's `config set` refuses `ultra`, above Copilot's top `max`,
  which it accepted (and ignored) before. Mitigation: stored values still load and clamp with a disclosure; `minimal`
  stays accepted as a legacy level (D26, open question 3); the configuration page says so.
- **Warning (accepted risk, `plan/8`, `plan/21`):** github.com's Copilot cloud agent reads the same
  `.github/agents/` files, and its handling of `include-custom-instructions` and `reasoning-effort` is undocumented
  (custom-agents configuration page, read 2026-10-10; `reports/q6-test-runner-r1.md:71-83`, `:159-164`). Accepted at
  the plan gate (`record.md:63`, `:71`): the CLI warns and ignores unknown keys, and the risk is assessed low but
  unproven. Mitigation: the capability rows say the cloud handling is undocumented and claim nothing for it; the pull
  request names it; a Follow-ups row carries its trigger (a cloud-agent run on a repository carrying the keys, or
  GitHub's custom-agent page listing them).
- **Warning:** QA row 2 may close `not signed` (declined or unanswered, amended r3, `plan/32`): REQ-FLOW-071's effect
  then rests on the changelog and the loader's key list, not on a live run with the key. Mitigation: the close offers
  the one re-run; the capability row claims the live check only for the gap; the proof block never records a walk or
  an acceptance the person did not give.
- **Warning (amended r3, `plan/30`):** a row the screen withholds reaches a run without its description. Three live
  rows are withheld today (`.stamity/inbox.md:26`, `:33`, two security Warnings on `nightly.yml`; `:140`, a security
  Minor on `gate.ts`). Mitigation: each still matches by location and prints its line, severity and location with the
  pattern id, so Frame and the close name it for the person to read (D38, D39); the rows stay as written, since
  rewording a true finding to pass the screen is the defect the injection-screening rule names.
- **Warning (amended r3, `plan/33`):** a close that drops or re-dates an inbox row edits a row another run wrote.
  Mitigation: only on the person's answer; each removal is a retirement with a record line, a re-date keeps the row's
  `Ref:` so the records gate still accounts for its ledger row (D37), and nothing retires a row without an answer.
- **Minor:** `reasoning-effort` is the loader's literal; whether it also takes the reference's `reasoningEffort` is
  unverified. A wrong spelling fails soft (a warning, no effect), and QA row 2's re-run can read the sub-agent's
  effort from its events.
- **Warning:** the q7 window leaves `test/evals/roster.test.ts` and `readmeCurrency.test.ts` red on the integration
  branch between the case merges and q7c. Mitigation: no other unit writes there in that window.
- **Warning:** lane D's goldens move with the coverage script, so lane merges can conflict in the snapshots.
  Mitigation: D33, regeneration on the merge result.
- **Minor:** Codex models advertise different top levels; the engine knows no model unless one is pinned. The class
  defaults sit on every model's scale.
- **Minor:** the coverage pass for this file was not run by its writer, in r1, r2, r3 or r4 (the role's shell runs read-only
  git only); it was checked by hand against the script's rules, and the orchestrator runs it before dispatch.

## Open questions

All three are answered; none is open.

1. **A fifth QA row for the rendered pages?** Answered at the plan gate: add it (`record.md:62`); QA walk row 5.
2. **q7a and q7b in parallel?** Default applied, option 1: fresh branches in the two lane worktrees (`record.md:65`).
3. **Copilot `minimal` on the emit branch?** Default applied, option 1: a legacy level, as Codex's (`record.md:65`,
   `:72`); q6c's `effortLegacy`.

## Follow-ups

Each is a leftover this plan places for the close to schedule, in the inbox row grammar of q9b (severity, location,
description, `source:`, then `by:` or `when:`, and `files:`), so each parses below the schedule-rule heading as written
(D13; review r1 `plan/14`). Each row is one line in the inbox; it wraps here only for reading.

- Minor · scripts/generate-apm-package.mjs:595-606 · the APM package's Copilot agents carry `name` and `description`
  only, so an APM install misses `include-custom-instructions` (q6b) and `reasoning-effort` (q6c) · source: /st-work ·
  when: touched · files: scripts/generate-apm-package.mjs, test/ci/apmPackage.test.ts
- Minor · src/adapters/copilot.ts · github.com's Copilot cloud agent reads the emitted `.github/agents/` files, and its
  handling of `include-custom-instructions` and `reasoning-effort` is undocumented; accepted risk at the plan gate ·
  source: /st-work · when: a Copilot cloud-agent run on a repository carrying the keys, or GitHub's custom-agent page
  listing them · files: src/adapters/copilot.ts, test/adapters/copilot.test.ts
- Minor · test/records/ledgers.test.ts · plan 014 file 2's `r1` moves the inbox parser by line range; since q1a and q1b
  the parser lives in `src/runs/inboxStore.ts` and the test imports it (D35) · source: /st-work · when: touched ·
  files: test/records/ledgers.test.ts, src/runs/inboxStore.ts
- Minor · content/commands/st-board.md · plan 015's `b1` hashes a whole inbox row for its marker; S14's optional fields
  and "a new date is a retirement plus a new row" change what a row's bytes hold (D35) · source: /st-work ·
  when: touched · files: content/commands/st-board.md, docs/plans/015-board-writes.md

## Drop list

The persisted list stands (`docs/plans/019-lean-flows-03.md:365-379`). This re-plan adds:

| Item | Revisit when |
|---|---|
| A lane C for the plan-size script | the data volume has room and lane D is on the critical path |
| A per-model effort table for Codex | Codex publishes per-model levels the engine can read without a pinned model |
| Screening the inbox at write time | a writer gains an engine write path for inbox rows |
