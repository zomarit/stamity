---
id: cli-native-03
intent: feature
stamp: c96c714683de0c70a89db703900fa16cae47b43c 2026-10-14
reads: [src/tools/translator.ts, src/emit/skillsProjection.ts, src/content/charter.ts, content/charter/stamity-charter.md, content/rules/stamity-question-protocol.md, content/commands/st-work.md, content/commands/st-board.md, content/commands/st-debug.md, content/commands/st-quick.md, content/commands/st-ask.md, content/commands/st-spec.md, content/commands/st-plan.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, content/skills/st-qa/SKILL.md, content/skills/st-dep-audit/SKILL.md, content/skills/st-verify/references/maintainability.md, content/agents/stamity-test-runner.md, content/agents/stamity-reviewer.md, docs/specs/everyday-flows.md, docs/doctrine.md, docs/working-with-stamity.md, evals/SET-v7.md, evals/cases-v6, test/corpus/commands/work.test.ts, test/corpus/commands/board.test.ts, test/corpus/rules/protocol.test.ts, test/corpus/skills/flow.test.ts, test/content/charter.test.ts, test/content/invariantsVersion.test.ts, test/tools/translator.test.ts, test/evals/locators.test.ts, test/evals/roster.test.ts, test/evals/successorInputs.test.ts]
depends_on: [docs/plans/020-cli-native-01.md]
---

# CLI-native — file 3 of 4: every touchpoint ends on a walk, QA proves before it asks, deep-module checks

This file is self-contained. It is the third of four `/st-plan` artifacts for **Package 24** (cut as **1.15.0**). It
changes the corpus: every touchpoint walks its leftovers through the client's own question tool and prints its summary
last; the QA step proves every row it can before it asks the person, at most three person rows; review and verify gain
a module-depth check; and the touchpoints carry the sentences files 2 and 3 need (pass the class's model from the
map; REST in Claude Code's cloud; a refused folder stops the flow). It runs after file 1 and beside file 2.

intent chosen: feature because each unit adds a behaviour the flows lacked (a close walk, a prover step, a depth
check, model and REST sentences).

## Context

`/st-work` prints its what-to-verify summary, then one close question, then the proof block
(`content/commands/st-work.md:278-279`, `:298-306`, `:310`); no rule makes the summary wait until every leftover is
decided, and no touchpoint names the client's question tool, while all four clients have one in 2026
(`src/tools/translator.ts:390-417` still says three do not). "Auto-proven" in `st-qa` is a lookup of evidence that
already exists (`content/skills/st-qa/SKILL.md:86`); the skill says the run's test-runner runs a row's check before
the table (`:41-43`), but no step dispatches it, and nothing caps person rows. Deep modules are partly embedded (interface-first units, behaviour tests) but the depth test itself is
missing and two size checks lean against it. Budgets bind: `/st-work`, `/st-board` and the charter have no spare line
(`test/corpus/commands/work.test.ts:433-439`, `board.test.ts:244`, the charter's 95-line ratchet); the detail goes into
the question protocol (54 spare lines), `st-qa` (10) and the test-runner (203), and every touchpoint keeps a pointer.
Out of scope: the browser-evidence skill's move to a `frontend` pack (a later package; `/st-work`'s step 3 and the
bundle row stay as they are so that move rebases cleanly).

## Decisions

The maintainer's walks of 2026-10-13 and 2026-10-14 are summarised in file 1 (all nine touchpoints; prove first, at
most three person rows; deep modules as checks). The declared defaults this file builds, with their corrections:

- **D13.** Every touchpoint ends the same way: each leftover walked through the client's own question tool,
  recommended option first, in as many rounds as the tool's limits need; the summary or proof block prints only after
  every leftover is decided, and nothing after it; plain numbered text only where a client has no tool; an unattended
  or headless run takes the declared default and writes `Default applied:`, and real defects wait as
  `decision-waiting`. Charter invariant 2 is reworded to allow rounds, with no line added. The translator's
  question-tool map is refreshed and rendered into the question protocol (Cursor's local line only; a later package
  adds the cloud line). Eval: a golden floor case `close-summary-after-last-decision` with the existing no-leftovers twin.
- **D14.** Before the QA table, one prover tries each unproven row, cheapest route first: a committed test, a CLI or
  script run, an API or `gh` read, a headless client session, a browser run. A row reaches the person only for taste
  or judgment, a real account the run cannot hold, a step that cannot be undone, physical or OS-native use, or legal
  and policy wording: at most three, most important first; any further row is proven or listed "over the cap, not
  asked" with its reason. A new proof state `agent-run`; proven rows fold into one line; `/st-work`'s what-to-verify
  summary shrinks to the person rows; the core step does not need the browser-evidence skill. Evals: a golden
  `qa-prove-before-asking`, a benign twin (a real second account stays the person's), and
  `golden/qa-ui-change-keeps-person-row` re-baselined.
- **D15.** The reviewer's maintainability lens flags a pass-through layer (an interface nearly as wide as what it
  hides) and counts a big file only when its interface is wide too; `st-verify` gains `maint-module-depth`; `/st-plan`'s
  `interfaces` cell names the module interface a unit lands behind. No charter line, no doctrine section. Eval: one
  reviewer case, a shallow wrapper.
- **D18 (its floor half).** Where a client's cloud runs no session-start hook, the agent reads `.stamity/learnings/`
  through the same screen the hook applies, never unscreened: the charter's invariant 5 says how, in place.
- **D19.** In Claude Code's cloud, `/st-pr-resolve` and `/st-board` use REST (`gh api`) where one exists and say
  plainly that Projects boards are unavailable there.

### Settled by this plan

- **The prover is the test-runner in a row-proving mode** (a `## Row proving` section in its body), its capabilities
  unchanged: its routes are what running commands reaches; the client's own browser tool only where the dispatching
  client grants it. No new role, so the roster, spawns and the model ladder stay. `st-qa` cannot spawn (a skill that
  spawns is a command), so it tells its caller to dispatch the prover; a caller that cannot dispatch runs the cheapest
  routes itself and says so.
- **A row outside the five person categories that no route proves** goes on `Not done:` as "not proven: <reason>",
  never to the person; a person row over the cap blocks nothing by itself.
- **`/st-ask`'s walk records decisions only** (it writes nothing); **`/st-quick`'s walk** offers "carry to `/st-work`
  now" or "leave on `Not done:`" and appends no inbox row.
- **"The close asks once." is renamed** to name the walk; its pins move with it.
- **The charter changes once:** invariant 2 (rounds) and invariant 5 (the screened read) in one unit and one version,
  1.2.0 → 1.3.0, the charter staying at 95 lines.
- **Fixed here from the deferral inbox:** the flows stop on a `gate` reason that names a refused folder instead of
  reading it as "scan not run" (`2026-10-11_release-1-14-0/review/70`). The inbox writers stay on their current path:
  `stamity ledger inbox-write` refuses a plan's follow-up rows and the dep-audit rows by design
  (`src/runs/ledgerStore.ts:1175-1182`, `src/runs/inboxStore.ts:552-553`), so moving them is an engine design, not a
  sentence; that row pair is re-dated with the engine files.
- **The question-tool map is file 2's `e12`** (it shares a test file with file 2's units); this file's `f2` adds the
  marker that renders it into the protocol.
- **The touchpoints' model sentence** reads the map file 2 emits: "pass `model` for the role's class from your
  client's map at `.stamity/generated/models/`; when a call is refused with a list, take the class's first `fallbacks`
  entry on that list, else the closest, and say so in one line."
- **One writer for `evals/`:** `f9` alone edits case files, `evals/SET-v7.md` and the counts; every other unit lists
  the cases its edit moves.

## Spec delta

The charter's invariants move to 1.3.0 (invariant 2 allows rounds; invariant 5 names the screened read), with its row in
`docs/doctrine.md`; the charter carries no ids.

### REQ-FLOW-080 — Every touchpoint ends on a walk, the summary last (ADDED)
Given leftovers, When a run ends, Then each is asked through the client's question tool, one per question, Critical,
Warning and `decision-waiting` first, in rounds within the tool's per-call limit, and the summary or proof block prints
after the last answer with nothing after it. With no tool: plain numbered text, one per turn. With nobody to answer:
each takes its declared default with `Default applied:`, real defects wait as `decision-waiting`. No leftovers: no walk.

### REQ-FLOW-081 — The run proves a row before it asks the person (ADDED)
Given an unproven QA row, Then the prover has tried the routes cheapest first and recorded `agent-run` (command, exit
code, output path), `contradicted` (a route ran and showed other than Expected; its redacted excerpt travels with the
row) or "not proven: <reason>" (no route could run); a route that ran ends that row's routes. At most three rows reach
the person, each in one of the five categories or the security-negative row no committed test covers, which stays the
person's and takes the first place; the rest are listed "over the cap, not asked: <reason>", and an H row there is
asked at the next checkpoint. An `agent-run` never proves a security-negative row. A contradicted row is failing, and
`Shippable` reads YES only once every H row is walked or proven and none stands `contradicted` — a walked reply alone
never clears one. A route reads through a sign-in already present and never writes through one; a row's steps run
confined to a scratch directory (the home and config-directory locations pointed into it); every saved route output is
redacted (amended 2026-10-14 from `f7`'s return and its reviews, `review/50`, `review/51`, `review/59`–`review/61`).

### REQ-FLOW-082 — Review and verify check module depth (ADDED)
Given a new layer whose interface mirrors what it wraps, Then the maintainability lens files a pass-through finding;
given a big file with one export, no size-only finding; `st-verify` carries the judgment check `maint-module-depth`.

### REQ-FLOW-083 — A plan unit names the module interface it lands behind (ADDED)
The `interfaces` cell of `/st-plan`'s unit table says so.

### REQ-FLOW-087 — PR-resolve and the board work in a REST-only session (ADDED)
Given a REST-only session (the session-start banner says GraphQL is unavailable, or a `gh api graphql` call is refused),
Then every GitHub call of `/st-pr-resolve` and `/st-board` uses a REST `gh api` form where one exists; a Projects board
is refused with "Projects boards are unavailable in a REST-only session"; a review thread's resolution state is
reported unknown, and a thread counts answered when its newest comment carries the command's signature. The text names
no client (the corpus tests' invariant 17); amended 2026-10-14 from `f4`'s blocked return.

### REQ-FLOW-088 — A cloud with no session-start hook reads learnings through the screen (ADDED)
The charter's invariant 5 tells the agent to run the committed session-start script with an empty stdin and to
open only the files it lists as loaded.

### REQ-LADDER-007 — Each client carries the pick (the touchpoints' half) (MODIFIED)
Defined by file 2; this file adds that every touchpoint passes the role's class model from its client's map on each
sub-agent call and, on a refusal with a list, takes the class's first listed fallback and says so.

### REQ-FLOW-017 — The checkpoint's rows (MODIFIED)
`agent-run` and `contradicted` join the proof states; proven rows fold into one line with their evidence; a
contradicted row carries its redacted excerpt and counts as failing (amended 2026-10-14 from `review/61`).

### REQ-FLOW-018 — All rows proven (MODIFIED)
"All rows auto-proven" covers `agent-run`.

### REQ-FLOW-019 — The close (MODIFIED)
The close walks its leftovers (REQ-FLOW-080) instead of asking once.

### REQ-FLOW-069 — A person QA row has a reason a machine cannot meet (MODIFIED)
Five categories replace three kinds; the prover runs first; at most three person rows.

### REQ-FLOW-074 — The close decides every leftover (MODIFIED)
The leftovers are asked in tool form, in rounds; its "other flows" bullet now names each touchpoint's walk, `/st-quick`'s
included (amended 2026-10-14 from `f5`'s review).

### REQ-FLOW-077 — Every inbox writer follows the schedule rule (MODIFIED)
`/st-quick` now walks its leftovers (carry to `/st-work` now, or leave on `Not done:`) and still appends no inbox row;
the sentence that it asks no leftovers question goes (amended 2026-10-14 from `f5`'s review).

### REQ-FLOW-075 — An unattended close never drops a real defect (MODIFIED)
A headless client's skipped question reads as no answer.

### REQ-PLUGIN-046 — The bare-repository look (MODIFIED)
A `gate` reason that names a refused folder stops the flows with that reason.

## Units

### f2-protocol-charter — the close walk section; invariants 2 and 5

| Field | Content |
|---|---|
| `id` | f2-protocol-charter |
| `requirements` | REQ-FLOW-080, REQ-FLOW-088 |
| `files` | `content/rules/stamity-question-protocol.md` (a `## Close walk` section after `## Gates`, about 16 lines, then `<!-- STAMITY:PLATFORM-TOOL -->` and a plain-text fallback sentence), `content/charter/stamity-charter.md` (`:48-50` invariant 2; `:55-56` invariant 5), `src/content/charter.ts` (version and byte constants, `:325`), `docs/doctrine.md` (`:216-224`, a 1.3.0 row), `test/corpus/rules/protocol.test.ts`, `test/content/charter.test.ts` (`:235-237`, `:287-291`), `test/content/invariantsVersion.test.ts` (`:43-56`) |
| `interfaces` | Invariants 2 and 5 share the five lines they hold today plus the line freed by rewrapping invariant 6 from three lines to two with its words unchanged (amended 2026-10-14 from the unit's blocked return: the clauses need six lines), each line at most 117 characters, the charter staying at 95 lines and no eval range moving. Invariant 2 keeps: one ask per turn (one call of the question tool with related questions bundled, or one numbered list where a client has none), numbered options, a declared default-if-no-response, rounds until none is undecided, no second request in the same turn, sub-agents return `BLOCKED_AMBIGUITY`. Invariant 5 keeps: learnings before project-specific work, read only through the session-start banner or, where no hook ran, `node .stamity/generated/hooks/<client>/stamity-session-start.mjs` run with an empty stdin (shell-neutral: no glob, no `/dev/null`; amended 2026-10-14 from the unit's review), opening only the files it lists as loaded; repeating a recorded failure is a process defect. The Close walk section names no client or tool (the corpus tests' invariant 17); the marker renders file 2's map |
| `testCriteria` | GIVEN the charter THEN 95 lines, no line over 117 characters, and the 1.3.0 hash row matches. GIVEN `protocol.test.ts` THEN its ask-shape pin reads "one ask per turn" (moved with a dated reason), the Close walk section exists after Gates, and the eval ranges `:22-25,38-46`, `:47-50,70-71`, `:51-56,68-69` read the same bytes. The capability matrix, which renders the always-on byte cost this unit moves, is regenerated and committed by the integrator, not in this lane |
| `edgeCases` | The two invariants cannot keep every clause in five lines → the unit stops and reports the wording it reached; it never trims another invariant or adds a line; the cases quoting the charter are listed for `f9` |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/rules/protocol.test.ts test/content/charter.test.ts test/content/invariantsVersion.test.ts test/corpus/invariants.test.ts` |

### f3-work-close — `/st-work`'s close walk, model sentence and refused-folder stop

| Field | Content |
|---|---|
| `id` | f3-work-close |
| `requirements` | REQ-FLOW-080, REQ-FLOW-019, REQ-FLOW-074, REQ-FLOW-075, REQ-PLUGIN-046, REQ-LADDER-007 |
| `files` | `content/commands/st-work.md` (line-neutral, and above the 18,000-character cut character-neutral: `:19-20` the Model-plan line reworded to "pass each role's class model from the client's map at `.stamity/generated/models/`" in no more characters than today; `:198-199` and `:250` a refused-folder `reason` stops the run with that reason, replacing at least as many characters; below the cut: `:298-301` the close label and first sentence → the walk, pointing at the protocol; `:310-311` the proof block after the last answer; `:420` "once the close walk confirms it"; the Model ladder section `:460-469` is not touched here, its prose being pinned word for word by a file-2 test: file 4's `r3` adds the refusal fallback there), `docs/working-with-stamity.md` (the close's description, which still says it asks one question), `test/corpus/commands/work.test.ts` (`:121`, `:1312-1321`, `:1347`, `:1781`; the headroom `:433-439` and its 900-character reserve `:437` unchanged) |
| `interfaces` | The close's four parts kept, asked through the protocol's walk; the body at most 485 lines; the reserve of at least 15 lines and 900 characters kept for the later package's three lines |
| `testCriteria` | GIVEN `work.test.ts` THEN the body is at most 485 lines, the reserve holds, the Dispatch contract ends before 18,000 characters, the renamed close label is pinned, the model sentence is present, and "nothing prints after the proof block" is asserted. GIVEN the refused-folder sentence THEN it names the stop and the reason |
| `edgeCases` | A run with zero leftovers → no walk, the proof block prints (the benign twin's behaviour); a sentence that cannot fit character-neutral above the cut → it moves below the cut and the unit says which |
| `depends_on` | f2-protocol-charter |
| `verify` | `npx vitest run test/corpus/commands/work.test.ts test/corpus/invariants.test.ts test/docsPages.test.ts` |

### f4-board-close — `/st-board`'s walk and REST in Claude Code's cloud

| Field | Content |
|---|---|
| `id` | f4-board-close |
| `requirements` | REQ-FLOW-080, REQ-FLOW-087 |
| `files` | `content/commands/st-board.md` (line-neutral, at its 500-line cap: `:439` → a pointer to the close walk; the board's own `open` items walked before its return block; the GitHub row `:225` gains the REST forms (`gh api repos/<o>/<r>/issues…`, `labels`, `pulls/<n>`) and "Projects boards are unavailable in a REST-only session" (the condition named by observation, never by client: invariant 17); `:97`'s label read in REST form there; `:168-169` refuses a Projects link there; `:460-462`'s no-tool form points at the protocol's plain-text fallback instead of restating its own; the model sentence only if its `spawns:` is not empty), `test/corpus/commands/board.test.ts` (`:241-245`, `:1336`, `:1346`) |
| `interfaces` | REST forms as listed; the Projects sentence verbatim as in the Spec delta; the writer census unchanged |
| `testCriteria` | GIVEN `board.test.ts` THEN the body is at most 500 lines, the census words still match the corpus, and the Projects sentence is present |
| `edgeCases` | A board linked to a repository the cloud session did not attach → the REST call's 403 is reported as "not attached to this session", not as a missing board |
| `depends_on` | f2-protocol-charter |
| `verify` | `npx vitest run test/corpus/commands/board.test.ts test/corpus/invariants.test.ts` |

### f5-touchpoints-a — `/st-debug`, `/st-quick`, `/st-ask`, `/st-spec`

| Field | Content |
|---|---|
| `id` | f5-touchpoints-a |
| `requirements` | REQ-FLOW-080, REQ-FLOW-077, REQ-PLUGIN-046, REQ-LADDER-007 |
| `files` | `content/commands/st-debug.md` (walk each clause with no test, held instrumentation, surviving hypotheses; the report and next step last), `content/commands/st-quick.md` (walk refused or deferred items and pre-existing failures: "carry to `/st-work` now" or "leave on `Not done:`"; `:160-170` a refused-folder reason stops the lane), `content/commands/st-ask.md` (walk Blocked rows, contradictions and low-confidence claims; decisions recorded only), `content/commands/st-spec.md` (walk open `[NEEDS CLARIFICATION]` markers, unconfirmed proposals and census gaps); the model sentence in each whose `spawns:` is not empty; `test/corpus/commands/lightTrio.test.ts`, `test/corpus/commands/spec.test.ts` |
| `interfaces` | Each walk is one pointer to the protocol's Close walk plus the command's own leftover list, one or two lines; budgets: debug 36, quick 35, ask 103, spec 201 spare lines |
| `testCriteria` | GIVEN each command THEN its leftover list, the pointer, and its report or return contract as the last block are asserted. GIVEN `/st-quick` THEN no inbox append |
| `edgeCases` | `/st-ask` is read-only → its walk writes nothing and says the decision is the person's to act on |
| `depends_on` | f2-protocol-charter |
| `verify` | `npx vitest run test/corpus/commands/lightTrio.test.ts test/corpus/commands/spec.test.ts test/corpus/invariants.test.ts` |

### f6-touchpoints-b — `/st-plan`, `/st-rework`, `/st-pr-resolve`

| Field | Content |
|---|---|
| `id` | f6-touchpoints-b |
| `requirements` | REQ-FLOW-080, REQ-FLOW-083, REQ-FLOW-087, REQ-LADDER-007 |
| `files` | `content/commands/st-plan.md` (walk the open questions and each follow-up's schedule fields before the return contract; `:352` the `interfaces` cell gains "and the module interface the unit lands behind", in place), `content/commands/st-rework.md` (the handoff ask is the walk's one round; the next step folded into the proof block), `content/commands/st-pr-resolve.md` (the triage and re-poll asks are rounds of the walk; a Pre-flight block `:45-57` for a REST-only session (named by observation, never by client): `gh pr checkout` → one `gh api repos/{o}/{r}/pulls/{n}` read of the head's repository and ref, a fork head refused, the head fetched by the pull request's number (`pull/<n>/head`, digits only) and checked out with `git checkout -B` on a branch name the command chooses, any push ref allowlisted, `check-ref-format`-checked and quoted (amended 2026-10-14 from the unit's review); `:123` the review-thread fallback); the model sentence where `spawns:` is not empty; `test/corpus/commands/plan.test.ts`, `test/corpus/commands/feedbackPair.test.ts` |
| `interfaces` | Budgets: plan 79, rework 100, pr-resolve 76 spare lines; the inbox writers keep their current path (the engine verb's design is out of this package) |
| `testCriteria` | GIVEN each text THEN the walk pointer and the last block are asserted; the Pre-flight block names the REST-only session by observation (no client name, no client variable) and the REST forms, fetches the head by the pull request's number and validates any ref it pushes to; the `interfaces` cell carries the clause |
| `edgeCases` | A follow-up with only an outside-world trigger → the plan's Drop list, not the inbox (unchanged) |
| `depends_on` | f2-protocol-charter |
| `verify` | `npx vitest run test/corpus/commands/plan.test.ts test/corpus/commands/feedbackPair.test.ts test/corpus/invariants.test.ts` |

### f7-prove-before-asking — the prover, the cap, the `agent-run` state

| Field | Content |
|---|---|
| `id` | f7-prove-before-asking |
| `requirements` | REQ-FLOW-081, REQ-FLOW-017, REQ-FLOW-018, REQ-FLOW-069 |
| `files` | `content/skills/st-qa/SKILL.md` (about +9 lines: the five person categories replace the three kinds `:38-44`; the cap; `agent-run`; the fold; the caller dispatches the prover; `:149` "ride the run's close walk"), `content/agents/stamity-test-runner.md` (a `## Row proving` section, about 20 lines), `content/commands/st-work.md` (`:278-279` step 1 and `:318-319` the QA rows field, line-neutral), `docs/working-with-stamity.md:99`, `test/corpus/skills/flow.test.ts` (`:706-738`, `:782-792`, `:806-815`, `:886-892`), `test/corpus/agents/quality.test.ts` (`:75`, `:202`), `test/corpus/commands/work.test.ts` (`:1302-1303`) |
| `interfaces` | Row proving: input the unproven rows; routes cheapest first (a committed test → a CLI or script run → a `gh` or API read → a headless client session → the repository's browser harness; the client's own browser tool only if granted); output per row `agent-run · <command> · exit <n> · <output path>` or `not proven: <reason>`. Step 1: "Emit a what-to-verify summary once the prover returns: only the rows it leaves for a person, each with a check a person can run in under a minute." |
| `testCriteria` | GIVEN `st-qa` THEN at most 150 body lines, five categories, the cap of three, `agent-run`, "over the cap, not asked", and the security-negative exception kept. GIVEN the test-runner THEN the section lists the routes in order and never edits. GIVEN `work.test.ts` THEN the step-3 browser line and the bundle row unchanged |
| `edgeCases` | No route runnable → the row is the person's if it is in a category, else `Not done:`; an unattended run still proves and records person rows `not signed` |
| `depends_on` | f3-work-close |
| `verify` | `npx vitest run test/corpus/skills/flow.test.ts test/corpus/agents/quality.test.ts test/corpus/commands/work.test.ts test/corpus/invariants.test.ts` |

### f8-deep-modules — the pass-through clause and `maint-module-depth`

| Field | Content |
|---|---|
| `id` | f8-deep-modules |
| `requirements` | REQ-FLOW-082 |
| `files` | `content/agents/stamity-reviewer.md:47` (in place: "…; a new layer whose interface is nearly as wide as what it hides (a pass-through); a function or file well past the repo's own norms whose interface is wide too."), `content/skills/st-verify/references/maintainability.md` (a judgment check after `:70`, about 6 lines, with the carve-out "a port at a cross-cutting boundary the repo declares is not a pass-through"; and `maint-size-outliers` `:24-29` defers a hit whose module exports at or below the repo median to `maint-module-depth`), `test/corpus/agents/spine.test.ts`, `test/corpus/skills/verifyRestTools.test.ts` |
| `interfaces` | `maint-module-depth` (judgment): the deletion test; the interface as the test surface; a `maint-size-outliers` hit cited with the module's export count beside the repo median; evidence `<path:line> exports=<k> (median <m>), lines=<n> (median <x>), forwards=<f>/<k>`; `not-applicable` for a re-export index, a generated file, a test-only helper |
| `testCriteria` | GIVEN `spine.test.ts` THEN the row holds both clauses. GIVEN `verifyRestTools.test.ts` THEN the id sits under Judgment with no `Threshold:`, `maint-size-outliers` names the deferral, ids stay unique and the reference stays within 40–100 lines |
| `edgeCases` | One export and 900 lines → deep: `maint-module-depth` passes and `maint-size-outliers` records no hit |
| `depends_on` | none |
| `verify` | `npx vitest run test/corpus/agents/spine.test.ts test/corpus/skills/verifyRestTools.test.ts test/corpus/invariants.test.ts test/emit/skillsProjection.test.ts` |

### f9-evals — the cases and the set, one writer

| Field | Content |
|---|---|
| `id` | f9-evals |
| `requirements` | REQ-FLOW-080, REQ-FLOW-081, REQ-FLOW-082 |
| `files` | new `evals/cases-v6/golden/close-summary-after-last-decision.md` (`floor: true`, sourced to the protocol's Close walk), `evals/cases-v6/golden/qa-prove-before-asking.md`, `evals/cases-v6/adversarial/benign-qa-second-account-stays-person-row.md`, `evals/cases-v6/golden/reviewer-shallow-wrapper-pass-through.md` (a maintainability smell only: a cache wrapper forwarding five methods, a 900-line one-export file as the counter-seed); `evals/cases-v6/golden/qa-ui-change-keeps-person-row.md` re-baselined; every case whose quoted range `f2`–`f8` moved (the two charter-only cases, `work-persisted-plan-asks-once`, `close-real-defect-never-preset-to-drop`, `unattended-close-keeps-real-defects`, `benign-qa-cli-change-no-person-row`, `qa-bare-signoff-records-unwalked`, `work-proof-block-fields`, `benign-optional-step-skipped-proceeds`, `benign-close-no-leftovers-asks-nothing-extra`, `probe-none-work-run-qa-checkpoint` by hand, `reviewer-light-pass-catches-logic-defect`, the three plan cases, the touchpoint cases the locator test names); `evals/SET-v7.md` (index rows, group heads and opening count, roster totals, the floor appendix row, a dated paragraph per range move); `evals/README.md`; `scripts/eval/run.mjs:50`; `.stamity/overrides/skills/st-eval-run/SKILL.md:133-135`; `test/evals/successorInputs.test.ts` (an `EXPECTED_MOVES` row for any carried case whose Expected moves) |
| `interfaces` | Counts after file 1 and this unit: 143 cases (82 golden, 31 adversarial, 30 probes), one more floor case; only Brief text moves in carried cases where possible |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green: every quote a contiguous run of its declared range, the roster recomputed, the floor appendix complete. GIVEN `testInputsGuard.test.ts` THEN green |
| `edgeCases` | A case whose claim no longer holds after the walk (it asked "exactly one question") → its Expected moves with an `EXPECTED_MOVES` row and the dated paragraph names why |
| `depends_on` | f2-protocol-charter, f3-work-close, f4-board-close, f5-touchpoints-a, f6-touchpoints-b, f7-prove-before-asking, f8-deep-modules |
| `verify` | `npx vitest run test/evals test/ci/testInputsGuard.test.ts` |

## Inbox rows this file matched

Seventeen rows not already listed in files 1 and 2:

| Ref | Disposition |
|---|---|
| `2026-10-11_release-1-14-0/review/70` | placed: fixed in `f3` and `f5` |
| `2026-10-12_board-writes/close/1`, `2026-10-11_release-1-14-0/fix/17` | placed: re-dated `when: touched` with `files: src/runs/inboxStore.ts, src/runs/ledgerStore.ts` (the verb must first accept plan and dep-audit rows) |
| `2026-10-10_next-tier/build/31`, `review/52` | folded into `f6` (below) |
| `2026-10-10_next-tier/review/81` | left: the dep-audit paragraph is no longer rewritten here |
| `2026-10-10_next-tier/build/42` | folded into `f7` (below) |
| `2026-10-10_next-tier/build/43` | folded into `f9` (below) |
| `2026-10-12_board-writes/plan/27` | left: `f4` no longer rewrites the Removal bullet |
| `2026-10-10_next-tier/review/76`, `review/80` | left: a default staleness window and a policy for advisories with no severity word, each its own design |
| `2026-10-10_next-tier/review/88` | left: a change to the locator test's parser |
| `2026-10-11_release-1-14-0/fix/26` | left: the tier's source is `init`'s to know; `f2` edits only invariants 2 and 5 |
| `2026-10-11_release-1-14-0/prove/2` | left: an argument change to `ledger inbox --paths` |
| `2026-10-12_board-writes/build/8` | left: `test/evals/readmeCurrency.test.ts` is in no unit |
| `2026-10-12_board-writes/qa/3`, `qa/4` | left: `f4` does not edit the write steps or the setup advisory, and the file is at its cap |

- Inbox fold into `f6` (`2026-10-10_next-tier/build/31`, `review/52`): `/st-rework`'s rewritten handoff says that on
  `stop` the DEFER rows phase 4 appended stand, and that those rows are not offered "fix now" and are not appended twice.
- Inbox fold into `f7` (`2026-10-10_next-tier/build/42`): the auto-prove table and rule 1 of `st-qa` accept the same
  evidence (`agent-run` or a test `file:line`).
- Inbox fold into `f9` (`2026-10-10_next-tier/build/43`): one sentence in `evals/README.md` points at `EXPECTED_MOVES`
  in `test/evals/successorInputs.test.ts`.

## Execution order

1. `f2` and `f8` in two lanes.
2. `f3`, `f4`, `f5`, `f6` in four lanes (files disjoint; the eval cases they move are `f9`'s).
3. `f7` (after `f3`: both edit `st-work.md`, `work.test.ts` and `docs/working-with-stamity.md`).
4. `f9`.

Between `f2` and `f9`, `test/evals` is red by design: the quoted ranges move and one writer re-quotes them at the end.
So each lane runs its own `verify` and the census guard, and the full suite waits for `f9`. Derived files (the dogfood
copies of every changed corpus file, `AGENTS.md` and `CLAUDE.md`, the capability matrix, the two golden snapshots) are
regenerated by the integration step after each wave, never by a lane, each diff read before commit; every `content/**` change is
followed there by `npm run build && STAMITY_NO_CLIENT_PROBE=1 node dist/cli.js sync` and the goldens command (the files
first, the flag last).

**Integration with file 2.** Files 2 and 3 build at the same time on lanes cut from file 1's integrated tree and land
on `feat/cli-native` wave by wave, by one integrator, in finishing order; after each landing the integrator rebuilds,
regenerates the derived files, and runs typecheck, lint, knip, the leak gate and the dogfood check. The full suite runs
alone under the machine lock once both files have landed. The spec deltas merge once, at the package's Prove phase, in
file order (2, then 3, then 4), so this file's change to `REQ-LADDER-007` lands after file 2 adds it.

## QA walk

Person rows for the package are chosen in file 4 (at most three, after the prover). This file's candidate: one real
close walked in Claude Code, judged for order and feel (taste).

## Risks

- **Warning** — the line-neutral edits to `st-work.md` and `st-board.md` are the hardest part; if a unit cannot hold a
  file's budget, it stops with the file's count and the sentence it could not place, never trims the reserve.
- **Warning** — more than ten cases move their ranges; the release eval run measures every one (the set's hard
  trigger 1).
- **Minor** — eval cases run without tools, so they check the walk's order, not that the tool was called; the person's
  walk in file 4 covers the call.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · content/skills/st-qa/SKILL.md · after this file `st-qa` has one spare line and the later package rewords its
  browser row; re-measure the body then · source: /st-plan · Ref: docs/plans/020-cli-native-03.md · when: touched

## Drop list

| Item | Revisit when |
|---|---|
| A stop guard that refuses a summary printed before the last answer | a run is seen printing early after this file |
| A new prover role with its own model class | the test-runner's class proves too weak for row proving in two runs |
