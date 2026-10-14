---
id: optimization-sweep-01
intent: test
stamp: 02096da9b9eb0fe3eaa307eadeea64e0fcaf55f4 2026-09-29
reads: [AGENTS.md, content/commands/st-spec.md, content/commands/st-plan.md, content/commands/st-work.md, content/commands/st-board.md, content/commands/st-ask.md, content/commands/st-debug.md, content/commands/st-quick.md, content/commands/st-rework.md, content/commands/st-pr-resolve.md, docs/capability-matrix.md, docs/getting-started.md, docs/migration.md, docs/cli-reference.md, docs/measurements.md, scripts/qa/run.mjs, .stamity/inbox.md, .stamity/learnings]
---

# The optimization sweep — file 1 of 2: the measures and the method

This file is self-contained. It is Package 17 session 1's first `/st-plan` artifact. It fixes the measures and the
method before any test session runs. File 2 (`docs/plans/013-optimization-sweep-02.md`) is written after the
maintainer's curation walk, and it holds the units session 2 builds. The number 012 went to REPLAY-v3's plan on the
closed pull request #59, so this package starts at 013.

intent chosen: test because the session stress-tests existing behaviour (the harness as 1.10.0 released it) and fixes
its measures and method before any run. That is the strong signal "a verification strategy for existing behaviour",
plus the weak signal "what should we test". No product file moves in this session.

## Context

Package 17 is the last optimization sweep before Track B. It takes three sessions and one release: 1.11.0, unless a
kept item breaks something. Session 1 evaluates, stress-tests and discovers on two sides:
- **the maintainer side:** this repository and the private layer;
- **the end-user side:** the nine commands on four clients.

It ends with a ranked findings report, the maintainer's curation walk, and file 2.

**Out of scope:** any replay or replay-like run. There are no planted bugs and no before/after scenario runs. In
session 2, model-facing changes are proven by the eval set's floors at the release run, with a new case where one
is needed. Tooling and docs changes are proven by tests, and everything by the QA checkpoint.

## Decisions

**The maintainer's answers of 2026-09-28, as amended on 2026-09-29:**
1. **Curate first.** Every ranked item carries its evidence, effort and risk, and says whether it breaks anything.
   The maintainer walks the list. Session 2 builds what is kept, and the rest goes on a drop list.
2. **Fixture repositories.** Two or three small, realistic projects (a web app, a library, a service). Each gets
   plain tasks, meaning feature requests and openly described bugs, for discovery only.
3. **All four clients, live where possible.** Claude Code in depth. Cursor, Copilot CLI and Codex run live where
   their CLIs run on this machine; where they don't, the emitted files get a static review.
4. **A tiered proof bar.** Model-facing changes are proven by the eval set's floors at the release run. Tooling and
   docs changes are proven by tests, and everything by QA. No before/after runs.
5. **Breaking changes.** The default is none, which makes the release 1.11.0. A breaking item with a clearly bigger
   win is flagged in the list and decided on its own. If one is kept, the release is 2.0.0, with migration notes.
6. **Our records only,** plus dated outside practice. No external users.

**This session's answers (2026-09-29, through the question tool, all the recommended option):**

7. **The test day's extent: balanced.** About 10–14 hours, one live session at a time, unattended overnight once
   the maintainer's setup step is done.
8. **Claude Code runs from a new, clean configuration folder.** It has no user plugins, connectors or memory, and
   the maintainer logs it in once. The client is pinned at 2.1.285 with the autoupdater off.
9. **Cursor runs live** on its current login.
10. **Three private throwaway GitHub repositories** on the maintainer's account carry the fixtures, their pull
    requests and the review comments.

**Defaults declared without a question:**
- **The fixture stacks.** A TypeScript/React/Vite web app, a TypeScript library, and a Python/FastAPI service.
- **The persona rule.** See the test day below.
- **The model.** The test sessions run on the standard-context `claude-opus-5-5`, so a long `/st-work` can compact
  on its own.
- **The plan number.**

## Measures (fixed before any run)

| Id | Measure | Definition | Records source | Test-day source |
|---|---|---|---|---|
| M1a | Always-on footprint | Static: the bytes of every file a client loads before the first prompt (charter, always-on rules, the skill, agent and command listings, hook output), with bytes/4 as the token estimate. Live: the first turn's input-side tokens (input + cache creation + cache read) for "Reply with the single word OK." at HEAD, minus the same at the fixture's `pre-stamity` tag | each past session's first assistant turn, from the transcript usage fields | a `footprint` step per client and fixture, at `pre-stamity`, 1.9.1 and 1.10.0 |
| M1b | Tokens per step | The main agent's input, output, cache-creation and cache-read tokens. Sub-agent tokens with the same split, summed over the sub-agent transcripts. Cost where the client reports it. The sub-agent count by role and model | per session: main against the sub-agent sum | each step's `summary.json` |
| M2 | Wall-clock time | Wall time, and active time (the sum of gaps under 5 minutes) | per session, and per phase where a record stamps phases | per step |
| M3 | Human attention | Typed prompts. Questions: question-tool calls, and turns that end in a question to the user. Approvals requested. Permission prompts a user would see under the client's default mode with the project's own settings, counted by the driver while the run goes on | prompts per session by class (continue, correction, approval, question); the share of question-tool answers that took the recommended option; sign-offs given without walking the rows | per step |
| M4 | Failures and restarts | Tool errors; API errors by type; usage-limit waits; stalls (no event for 20 minutes); watchdog stops (45 minutes); restarts; red gates; CI re-runs and flakes | ledgers, run records, CI history, transcript error flags | per step |
| M5 | Review findings and precision | Findings per round by severity. Each finding's disposition: fixed, declined as wrong, deferred or retired. Duplicates. Precision = accepted findings ÷ non-duplicate findings | the ledgers and run records | counts only. With no ground truth, the test day claims no precision |
| M6 | Setup and upgrade steps | Commands typed, questions answered, files written or changed, time and errors, for the first install at 1.9.1 and the upgrade to 1.10.0 | the docs and past release records | each fixture's setup record and its upgrade step |

**Reading rules:**
- Every number carries its source: a `path:line`, a command, or a step summary.
- A measure a client does not report is recorded as "not reported", never estimated silently.
- A bytes/4 figure is labelled as an estimate.
- After the first test session starts, this table is never edited. An addition is appended below it with its date.

## Method

### Line 1 — our records

Four readers work in parallel. Each writes one report to the private layer's run folder for this package.
- **Public records:** run records, ledgers, QA files, eval results (not the raw calls), the measurements page, the
  CHANGELOG, the git log and the CI history.
- **Client transcripts of past sessions: metadata only.** That means timestamps, tool names, usage fields, stop
  reasons, compaction markers and error flags, plus the maintainer's own typed prompts. Two stopped transcripts are
  left out entirely. No model reply, tool result or sub-agent report is read back.
- **The private layer:** its decision and directive rows, the session log, the dashboard, and its run folders. No
  replay captures.
- **The deferral inbox, the learning loop, and the specs' deferred items.**

No reader opens the replay's folders (`evals/replay/`, `test/replay/`, `scripts/replay/`,
`test/evals/fixtures/historical-replay/`, or the private replay folder). The reports carry counts and categories. They
never describe a security defect.

### Line 2 — the test day

**Fixtures.** Each one is a new repository in a dedicated folder outside both checkouts. Each has stamity 1.9.1
installed for all four clients, a `pre-stamity` tag, a `TASKS.md` backlog and a private remote.

| Fixture | Stack | Gates | Tasks |
|---|---|---|---|
| webapp ("Split", shared expenses) | TypeScript, React 19, Vite, vitest, ESLint, `tsc` | `npm test`, `npm run lint`, `npm run typecheck` | T1 category filter · T2 localStorage · T3 bug: uneven splits lose a cent · T4 chore: rename a label · T5 CSV export · T6 bug: a date shows a day early west of UTC |
| lib ("durations") | TypeScript library, vitest, ESLint, `tsc` | the same | T1 days · T2 ISO-8601 output · T3 bug: just under an hour formats as "60m" · T4 chore: a stale README example · T5 negative durations |
| service ("inventory") | Python, FastAPI, pytest, ruff, mypy | `pytest`, `ruff check .`, `mypy src` | T1 pagination · T2 tag filter · T3 bug: a partial PATCH wipes tags · T4 a health endpoint · T5 sorting |

Each bug is an ordinary logic error. It is openly described in `TASKS.md` and is the only intentional one; nothing
is hidden for review to find, and no task touches a security topic.

**The day.** One live session runs at a time, from a driver in the private layer. The order is breadth first:

| Block | Client · fixture | Steps |
|---|---|---|
| A | Claude Code · webapp (full day) | A0 footprint at `pre-stamity` and 1.9.1 · A1 upgrade to 1.10.0 by the documented route · A1b footprint at 1.10.0 · A2 `/st-ask` · A3 `/st-spec` · A4 `/st-plan` T1 · A5 `/st-work` on that plan, stopped after the second sub-agent result and resumed five minutes later with "continue" (the shape of a usage-limit stop) · A6 `/compact`, then continue · A7 three plain review comments on A5's pull request, then `/st-pr-resolve` · A8 `/st-quick` T4 · A9 `/st-debug` T3 · A10 `/st-rework` with two feedback points · A11 "stop for today, prepare a handoff" · A12 the next day: a new session, "continue where we left off yesterday" · A13 a new session, `/st-board`, pick up the next task |
| B | Codex · lib | B0 footprint · B1 `/st-ask` · B2 `/st-quick` T4 · B3 `/st-plan` T5, then `/st-work` |
| C | Copilot CLI · lib | as B |
| D | Cursor · lib | as B |
| E | Claude Code · lib (short) | E0 footprint · E1 `/st-quick` T4 · E2 `/st-plan` T1 · E3 `/st-work` · E4 `/st-debug` T3 |
| F | Claude Code · service (short) | F0 footprint · F1 upgrade · F2 `/st-ask` · F3 `/st-work` T1 with no plan · F4 `/st-debug` T3 · F5 `/st-quick` T4 |

Blocks B to D each work on their own clone of the lib fixture at 1.10.0, so no client sees another's changes.

**The persona.** When a session asks, the persona answers:
- for a question-tool call, or a turn that ends in a question: the option labelled "(Recommended)", else the first;
- for free text: "Go with your recommendation.";
- for a plan approval: "Approved, go ahead.";
- for a QA sign-off request: "Signed off.";
- for a commit, push or pull-request ask: "Yes.";
- for a request to run something: "Please run it yourself."

A step may script its own replies, which take precedence. The persona gives at most 10 answers per step.

**Guards:**
- a lock file allows one live session at a time;
- a stall is recorded after 20 minutes without an event;
- a stop by PID comes at 45 minutes without an event, or at the step's wall cap;
- a usage-limit wait lasts until the stated reset, or up to 6 hours;
- no full suite or site build runs in either checkout while a session is live.

### Line 3 — outside practice

Two readers, each citing its sources with dates:
- **the four clients' own documentation:** what loads at start, progressive disclosure, sub-agents, hooks,
  permissions, compaction and resume, headless use, plugins and upgrades;
- **published practice for agent workflows,** each source marked as a measured study, vendor guidance or an
  anecdote.

### Evaluation, the report and the walk

**The areas.** Every starting area is tested against the evidence and marked confirmed, refuted or unmeasured.
New areas the evidence shows are added.

End-user side:

| Code | Area |
|---|---|
| E1 | the always-on footprint |
| E2 | ceremony against task size |
| E3 | sub-agent spend |
| E4 | human attention |
| E5 | waiting time |
| E6 | trust in the signal |
| E7 | continuity |
| E8 | setup and upkeep |
| E9 | the learning loop |

Maintainer side:

| Code | Area |
|---|---|
| MA | suite re-runs on unchanged trees |
| MB | verdict roles without read-only git |
| MC | ledger refusals |
| MD | records churn |
| ME | re-attestation staleness |
| MF | eval-run cost |
| MG | QA person rows signed without being walked |
| MH | the resume summary after a compaction |
| MI | sub-agent stalls |
| MJ | the private close's upkeep |

The leftovers are:
- plan 009's four eval-case gaps;
- `review/197` and `review/204`;
- the ledger's findings-block friction;
- the 1.11.0 release-notes line on the retired replay;
- a gate for the no-email rule;
- the local-only raw captures of the private eval runs;
- keeping or deleting the replay's frozen files.

**The ranked findings report.** Each item gives:
- the area;
- the measured evidence;
- the proposed change;
- the expected gain;
- the effort (S, M or L) and the risk;
- the proof tier: eval floors plus a new case where needed, tests, or QA;
- whether it is breaking;
- its side: maintainer or end user, public or private.

Items are ranked by expected gain times breadth, divided by effort, with risk breaking ties. The report ends with a
drop list. Before the walk, a skeptic at the verdict model re-derives every number from its cited source; an item
without a source is cut or marked. The full report lives in the private layer. File 2 carries the kept items, with
only their public evidence.

**The curation walk.** It goes through the question tool, at most four items per call, each with the recommended
option first and a declared default. Kept items become file 2's units. Dropped items go to the drop list, each with
its trigger for a revisit.

## Strategy matrix

| Layer | Scope | What it proves | Gate placement | Planned count |
|---|---|---|---|---|
| Records | four readers | where time, tokens and attention went; recurring frictions with counts | before the walk | 4 reports |
| Footprint | 4 clients across 3 fixtures, at `pre-stamity`, 1.9.1 and 1.10.0 | what stamity loads before any work, per client | the first step of each block | about 15 probes |
| Test day | blocks A–F | the friction per command and per client; setup and upgrade cost | overnight, one session at a time | about 35 steps |
| Outside | two readers | dated client facts and published practice | before the walk | 2 reports |
| Skeptic | one verdict-model pass | each ranked item's evidence holds | before the walk | 1 pass |

## Priority outlines

- **P0.**
  - Every step's `summary.json` carries M1b to M4, or names the ones its client does not report.
  - No planted bug and no security-flavoured task.
  - No read of the two stopped transcripts or of any replay capture.
  - The measures table unchanged after the first test session starts.
- **P1.**
  - All nine commands run at least once on Claude Code.
  - Each other client runs its short set, or records why it could not.
  - The upgrade from 1.9.1 is recorded for every fixture it runs on.
- **P2.** The stop and resume, the compaction and the next day are each observed once on Claude Code.
- **P3.** The short days E and F. Under time pressure, F is dropped first, then E, then the last of B to D to run.

## CI gates

| Gate | Trigger | Threshold | On failure |
|---|---|---|---|
| `npm run lint && npm run typecheck && npm run test` | per-PR | exit 0 | block merge |
| `node scripts/leak-gate.mjs` | after every public record write, before each commit | exit 0 | respell before the commit |
| `npx knip` | before every push | exit 0 | fix before the push |

**Uncovered, and why:**
- Review precision on the test day: the fixtures have no ground truth.
- Usage a client does not report: recorded as "not reported".
- The day's figures are one pass on small projects. They are used as a first-hand check of the research lines, never
  as a baseline for a later comparison.

## Spec delta

None. Session 1 changes no requirement; file 2 carries the deltas session 2 builds.

## Units

### records — our records, in four reports

| Field | Content |
|---|---|
| `id` | records |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | the private layer's `runs/package-17/session-1/evidence/records-public-r1.md`, `records-transcripts-r1.md` (with `records-transcripts-r1.json`), `records-private-r1.md` and `records-inbox-learnings-r1.md` |
| `interfaces` | Each report has these sections, in order: `Summary` (at most 15 lines); `Measures` (tables using M1a–M6); `Frictions ranked by count` (area code, count, evidence); `Candidate optimizations` (area, evidence, proposed change, expected gain, effort S/M/L, risk, breaking yes/no); `Gaps`. The transcript report adds `Corpus`. The inbox report adds `Inbox by area`, `Recurring themes`, `The leftovers located`, `Retirable rows`, `The learning loop measured`, `Handoffs` and `Spec deferred items`. |
| `testCriteria` | Given the four reports, when each is read: every section above is present; every number sits beside a `path:line`, a command or a script kept in the reader's scratch folder; the two stopped transcripts appear by prefix only; no replay folder is cited as read. |
| `edgeCases` | A client with no stored sessions: its row reads "none stored". A ledger row without a disposition: counted as open and named. |
| `depends_on` | none |
| `verify` | `grep -c '^## ' <each report>` returns at least 5, and `grep -n -i 'aa8fa447\|706c9cbe' records-transcripts-r1.md` shows prefixes only. |

### outside — the clients' documentation and published practice

| Field | Content |
|---|---|
| `id` | outside |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | the private layer's `runs/package-17/session-1/evidence/outside-clients-r1.md` and `outside-practice-r1.md`, saved from the readers' returned reports by the orchestrator (the readers hold no write tool) |
| `interfaces` | Clients report: `Summary`; `Per-client facts` (fact, source URL, page date or version, access date); `stamity against each client` (uses well, stale workaround, unused feature); `Candidate optimizations` with a proof tier; `Gaps`. Practice report: `Summary`; `Sources` (id, title, publisher, published date, access date, strength); `Practice per area`; `Where stamity follows or departs`; `Candidate optimizations`; `Gaps`. |
| `testCriteria` | Given the two reports, when each fact or claim is read: it cites a URL with an access date of 2026-09-29; every repository claim cites a `path:line`; every source row carries a strength. |
| `edgeCases` | A client page with no date: its version or its retrieval date stands in, and the row says which. |
| `depends_on` | none |
| `verify` | `grep -c 'http' <each report>` is at least 10, and `grep -c '2026-09-29' <each report>` is at least 1. |

### fixtures — three projects with stamity 1.9.1

| Field | Content |
|---|---|
| `id` | fixtures |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | `~/.stamity-sweep/work/{webapp,lib,service}/` (outside both checkouts); the private layer's `runs/package-17/session-1/day/fixture-{webapp,lib,service}.md` |
| `interfaces` | Each fixture: a git repository on `main`; a local fixture identity with an `example.invalid` address; a `pre-stamity` tag; `chore: set up stamity 1.9.1` as its latest commit; `TASKS.md` as in the fixtures table; the gates as listed there; `.github/workflows/ci.yml`; a private remote. Each record: `Project`, `Commands`, `TASKS` (with `path:line` for each described bug), `Git`, `stamity 1.9.1 setup (M6)`, `Repo`. |
| `testCriteria` | Given a fixture at `main`, when its gates run: each exits 0. Given its remote, when `gh repo view --json visibility` runs: it reads `PRIVATE`. Given its setup record: every question `init` asked is listed with its answer. |
| `edgeCases` | FastAPI wheels missing on Python 3.14: Python 3.13 via Homebrew, recorded. `init` interactive with no flags: default answers with all four clients, each question recorded. |
| `depends_on` | none |
| `verify` | per fixture, the gate commands in the fixtures table; `git -C ~/.stamity-sweep/work/<name> tag --list pre-stamity` prints the tag. |

### driver — the day's instrument

| Field | Content |
|---|---|
| `id` | driver |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | the private layer's `runs/package-17/session-1/driver/` (`day.mjs`, the client adapters, `schedule.json`, `MECHANICS.md`); raw streams under `…/day/<step>/captures/` (ignored); `…/day/<step>/summary.json` (tracked) |
| `interfaces` | `node day.mjs <schedule.json> [--only <step>] [--from <step>] [--detach]`. Step kinds: `footprint`, `shell`, `session`, `resume`, `compact`, `review-comments`. `summary.json` fields: `wallMs`, `activeMs`; `main` and `subagents` token splits (input, output, cacheCreation, cacheRead); `costUsd`; `models`; `subagentsByType`; `toolCalls`; `personaAnswers`; `askUserQuestionCalls`; `textQuestions`; `approvalsRequested`; `permissionPrompts`; `toolErrors`; `apiErrors`; `rateLimitWaitsMs`; `stalls`; `watchdogStops`; `restarts`; `compactions`; `filesChanged`; `commits`; `pr`; `exitReason`; `clientVersion` |
| `testCriteria` | Given `MECHANICS.md`, when each instrument check is read: stream-json turns, slash-command expansion, question handling, permission counting, `/compact`, stop by PID then resume, and sub-agent usage each read pass on Claude Code, and a trivial call with parsed usage reads pass on each other client, or the check says why it cannot. |
| `edgeCases` | A client that reports no tokens: the summary's token fields read `null`, with `"notReported": ["tokens"]`. A session that asks more than 10 times: the step stops with `exitReason: "persona-cap"`. |
| `depends_on` | none |
| `verify` | `node day.mjs schedule.json --only A0` completes with `exitReason: "done"`. |

### day — the test day, unattended

| Field | Content |
|---|---|
| `id` | day |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | the private layer's `runs/package-17/session-1/day/*/summary.json`; branches and pull requests in the three private repositories |
| `interfaces` | `schedule.json` blocks A–F as in the day table. The driver's `summary.json` contract as in `driver` |
| `testCriteria` | Given the finished day, when the summaries are listed: a summary exists for each step run, and each P1 row above holds, or a summary records why it could not. |
| `edgeCases` | The usage window runs out: the driver waits up to 6 hours, then the drop order in P3 applies. The API's safety classifier stops a session: the step records its stop reason only, its transcript is never read back, and the day moves on. |
| `depends_on` | fixtures, driver |
| `verify` | `ls <private run folder>/day/*/summary.json | wc -l` equals the number of steps run, as stated in the driver's final log line. |

### synthesis — the evaluation, the ranked report and the skeptic pass

| Field | Content |
|---|---|
| `id` | synthesis |
| `requirements` | spec carries no ids — discovery only; no requirement moves |
| `files` | the private layer's `runs/package-17/session-1/ranked-r1.md` and `skeptic-r1.md` |
| `interfaces` | The ranked report: `Areas tested` (each E, M and leftover item confirmed, refuted or unmeasured, with numbers); `Ranked items` (the fields listed under the ranked findings report above); `Drop list` (each with its revisit trigger). The skeptic's reply: one line per item, reading holds, weakened (with the corrected number) or cut (with the reason) |
| `testCriteria` | Given the report after the skeptic pass, when an item's evidence is re-read: its number matches its cited source; every breaking item is flagged; every item names its proof tier. |
| `edgeCases` | Two lines disagree on a number: both are shown, with the gap explained. An area with no evidence: marked unmeasured, never ranked. |
| `depends_on` | records, outside, day |
| `verify` | `grep -c '^| ' ranked-r1.md` returns at least the number of ranked items, and the skeptic reply names every item id. |

### walk — the curation walk and file 2

| Field | Content |
|---|---|
| `id` | walk |
| `requirements` | spec carries no ids — discovery only; file 2 carries the requirement deltas |
| `files` | `docs/plans/013-optimization-sweep-02.md`; the private layer's package plan for its own items |
| `interfaces` | The question-tool calls: at most four items each, the recommended option first, a declared default. File 2 follows the plan artifact shape in `/st-plan`, with each model-facing unit naming the eval cases and floors that cover it and any new case it needs. |
| `testCriteria` | Given file 2, when the plan-lint pass (L1–L4) and the structural coverage check run: both pass. Every kept item maps to a unit, and every dropped item sits on the drop list. |
| `edgeCases` | The maintainer types their own answer: it is read literally, and it is recorded in their words. A breaking item is kept: the release becomes 2.0.0, and file 2 carries a migration-notes unit. |
| `depends_on` | synthesis |
| `verify` | `node content/skills/st-verify/scripts/spec-plan-coverage.mjs docs/plans/013-optimization-sweep-02.md docs/specs` exits 0. |

## Execution order

1. In parallel: `records`, `outside`, `fixtures` and `driver`.
2. `day`, unattended, one session at a time.
3. `synthesis`, then the skeptic, then `walk`, then the close.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| The test account's usage window runs out overnight | Warning | The driver waits for the reset (at most 6 hours) and records it under M4; the drop order in P3 applies |
| A test session edits files outside its fixture | Warning | Prompts are scoped to the fixture; the fixtures sit in their own folder; the configuration folder carries the Bash guard hook |
| The safety classifier stops a test session | Warning | Only the stop reason is recorded. The transcript is never read back, and the day moves on |
| A records reader reads replay material | Warning | Metadata-only rules; the replay folders are excluded by path, and the two stopped transcripts by prefix |
| The measures move after the first result | Warning | P0: the table is append-only, with a date, once the day starts |
| One pass on small projects is read as a benchmark | Minor | The report labels every day figure as a single first-hand pass and ranks on the research lines first |
| The pinned client differs from what users run | Minor | Every summary records the client version |
| Expected gains are over-claimed | Warning | The skeptic re-derives each number before the walk |

## Open questions

None.

## Follow-ups

None at this write. The drop list is file 2's.
