---
id: orchestrator-context-economy-01
intent: feature
stamp: fed39ac4efe545da298e8b07fe0e2d4b0e2aa041 2026-09-23
reads: [AGENTS.md, content/commands/st-work.md, content/commands/st-plan.md, src/hooks/scripts.ts, src/hooks/model.ts, src/hooks/portableRunner.ts, src/roster/agentPolicies.ts, src/roster/agentGrants.ts, src/roster/modelLadder.ts, src/tools/allowlist.ts, src/tools/translator.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/cli.ts, src/cli/commands/learn.ts, src/composition/root.ts, src/merge/atomicWrite.ts, src/cli/docs/measurements.ts, test/architecture/boundaries.test.ts, test/records/ledgers.test.ts, test/hooks/scripts.test.ts, test/corpus/hookWiring.test.ts, test/cli/surface.e2e.test.ts, .gitignore, .oxlintrc.json, .claude/settings.json, docs/capability-matrix.md, docs/specs/model-ladder.md, SECURITY.md]
---

# Orchestrator context economy — file 1 of 3: research, decisions, contracts, spec delta and the engine

intent chosen: feature because net-new capabilities are named — a two-tier return contract with reports persisted
on disk, a ledger verb that is the one serialized writer, a resume card after a compaction, a capacity rung in the
failure ladder — and the request says "implement" and "build" them into the engine, the emitted agent definitions and
the `/st-work` body.

## Context

The plan is split in three self-contained files: this one (research, decisions, contracts, the spec delta and the eight engine units), `docs/plans/009-orchestrator-context-economy-02.md` (the corpus, the eval cases and the docs, nine units) and `docs/plans/009-orchestrator-context-economy-03.md` (the replay and its merge gate, fourteen units). Each carries the shared contracts word for word.

Long `/st-work` runs fill the orchestrator's context window until the client compacts it, and a compaction can drop a
finding that was received but not yet ledgered. A consumer run's brief measured the shape and proposed nine changes
(P1–P9); this plan researched them against this repository's own runs, the vendors' current practice and the four
clients' capabilities, and the maintainer decided on 2026-09-23 to build P1, P2, P3 (per-id re-reviews only), P4, P7,
P8 and P9, to decline P5, and to prove "no quality loss" with an old-vs-new replay before the merge. P6 (the relative
hook path) shipped in plan 008 session 3. Out of scope: P5 (inbox row), new eval-set cases (inbox row), the enterprise
work and the 1.10.0 cut (Package 16's second session). This package merges to `main` without a release.

## Research — the gate before any decision

The maintainer's directive for this package: "it is important that its researched properly before, so the solution is
as effective as possible without quality loss." Seven researchers (Opus 5.5, attested per agent from their
transcripts) measured our own transcripts, read the engine, the corpus and the vendors' documentation, and designed
the replay; their full reports are archived in the private layer's package-16 folder. What follows is the part a
reader of this plan needs.

### Measured on our own runs (plan 008, sessions 1–4 and the 1.9.1 tail, 2026-09-19 → 2026-09-23)

Method: every payload that entered the orchestrator's main context, attributed to a class by walking the five
orchestrator transcripts line by line (inbound user text, tool results and attachments that reach the model; outbound
assistant text, thinking and tool inputs); sub-agent traffic measured separately from the 160 sub-agent transcripts.
11,128K characters entered the orchestrator over 51 build passes; 4 compactions, all automatic at about 969K tokens,
each after 1.5–1.9M characters.

| What entered the orchestrator | Share |
|---|---|
| Its own typing: shell commands 17.5 % (record paragraphs 4.7 %, inline scripts 3.5 %, ledger rows 2.3 %), dispatch prompts 7.9 %, SendMessage 2.0 %, Write/Edit 2.1 %, prose 2.8 % | 32.3 % |
| Sub-agent reports (median 6.5K characters; researchers 24.3K) plus failure notices and launch acknowledgements | 21.9 % |
| File reads (393K of them the orchestrator re-reading its own record and ledger) | 17.9 % |
| Injected bodies (the `/st-work` body, listings, charter, reminders) | 12.5 % |
| Shell output (`gh` polling 220K, git state 197K) | 12.0 % |
| Search results, hook output, compaction summaries, operator text | 3.4 % |
| The orchestrator's own thinking, on top (kept in context; 1,216K tokens) | 20.3 % of the token fill |

The consumer brief's split did not reproduce here (reports 45 % there, 21.9 % here): our returns are smaller and fewer
per pass (3.4), and our orchestrator's own record-keeping is larger. The earlier plan-008 session-2 measurement was
re-run with its own script: it covered the whole transcript rather than the stretch after a compaction, never read
attachments (so returns were 32 %, not 21 %), counted one compaction twice, and summed final context sizes as "spend"
(the real sub-agent spend of that session was 428.5M processed tokens).

Addressable share per proposal, each payload cut once by its largest reduction:

| Proposal | Mechanism measured | Share of inflow |
|---|---|---|
| P1 | every return capped to a 1,500-character digest (build 5.8 %, verdict roles 4.0 %, researchers 2.6 %, fix 1.0 %, spec 0.7 %, gate 0.6 %) | 15.1 % (11.9 % at 3,000) |
| P2 | ledger rows, inbox rows and fix briefs replaced by a command and pointers | 4.5–5.0 % |
| P3 | 32 re-reviews cut to one closure per prior id | 1.0–1.7 % |
| P4 | dispatch prompts cut to pointers — only when someone other than the orchestrator writes the unit content (session 3's pointer prompts saved nothing: it wrote 108K of brief files by hand) | 5.8 % |
| P5 | the per-pass loop below the orchestrator | 15.4 % alone, +3.8 points on top of the others |
| P7 | findings received but not yet ledgered at a compaction | no character saving; 2 of 4 compactions had some; 0 lost |
| P8 | the post-compaction skill body cut to a card | 0.5 % |
| P9 | stall inspection and resume messages | ≈ 1.0 %, plus wall clock |
| P1+P2+P3+P4+P8 | combined | 25.3 % (29.1 % with P5); compactions 4 → 2 |

Loop characters per build pass (returns, dispatch prompts, sends, brief files, ledger typing): 50.2K; all inflow per
pass: 218.2K. Not addressed by any proposal: thinking (20.3 % of the fill), file reads (17.9 %), shell output
(12.0 %) and the record paragraphs (4.7 %) — follow-ups in the inbox.

### Facts that shaped the designs

1. **The client refuses sub-agent report files by name.** Claude Code 2.1.278 and 2.1.280 refuse a sub-agent's `Write`
   whose basename matches `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i` (read from the client's own code); all six
   plan-008 session-3 lanes' `report.md` writes were refused that way, so that session's hand-built two-tier return
   never persisted a report. Reports here are named `<pass>-<role>-r<N>.md`.
2. **After a compaction Claude Code re-attaches only the first 5,000 tokens of an invoked skill** (25,000 in total;
   truncation keeps the start). The `/st-work` body's cut falls inside the Dials table (about line 350 of 409), so a
   resumed run loses the tail of the dispatch contract, the model ladder, the Return contract and its own arguments.
   The skills listing is not re-injected.
3. **Verdict roles have a safe write path on Claude Code only.** There the pre-tool-use guard knows the calling agent
   and fails closed; on Cursor, GitHub Copilot CLI and Codex any write grant widens to full edit (and shell on Cursor,
   the whole workspace on Codex) with nothing enforcing a path.
4. **The review gate parses labelled `verdict:` and `confidence:` lines**; a digest without them holds every approved
   run to the round cap.
5. **The session-start hook already re-fires after a compaction on Claude Code and Codex** (their session start carries
   a compact source and its output re-enters the context); Cursor and Copilot document no post-compaction event.
6. **Plan 008 stopped 17 sub-agents in 8 events** (5 watchdog stalls, 11 usage or credit limits, 1 dropped
   connection): 16 were resumed in place and 1 retried fresh — never the written ladder, and no ledger row recorded
   any. The long outages also stopped the orchestrator, which then ran on the same model as the verdict roles; with the
   session on Opus 5.5 and the verdict roles on Fable 5.1, waiting and resuming now pays.
7. **No eval case cites the review loop or the Return contract** of `/st-work`: the replay, not the eval set, measures
   what P1 and P3 change.

### Outside practice (dated; accessed 2026-09-23)

- Anthropic, "Effective context engineering for AI agents" (2025-09-29): sub-agents return a condensed 1,000–2,000-token
  summary — guidance, no measurement.
- Claude Code documentation, sub-agents (live): run many detailed sub-agents and "write detailed results to files that
  the main conversation can then reference"; context window, "What survives compaction" (live): the 5,000/25,000-token
  skill re-injection rule above.
- Cursor, "Dynamic context discovery" (2026-01-06): long outputs to files, −46.9 % tokens in an A/B on MCP runs;
  quality asserted, not measured.
- LangChain, "Context management for deep agents" (2026-01-28): tool results over 20K tokens offloaded with a preview;
  the full history kept on disk as the canonical record.
- Lindenbauer et al., "The Complexity Trap" (2025-08-29): masking old observations halves cost while matching LLM
  summarisation's solve rate on SWE-bench Verified — dropping bulk beats summarising it.
- Zeng, "Faithful, Not Corrective" (2026-06-12, revised 2026-09-17): relays keep hop-6 recall ≥ 0.973; most loss happens
  at the first encoding — so the full report stays the record and the digest points to it.
- Cognition, "Don't build multi-agents" (2025-06-12): digests drop implicit decisions — a principle, unmeasured; hence
  the contract delta travels in full.
- The gap: no source measured what a digest costs an orchestrator's decisions on coding work. The replay measures it.

### Quality risk and guard per decided proposal

| Proposal | What it could lose | The guard |
|---|---|---|
| P1 | a finding or a verdict's reasoning, decided on less text | the full report on disk and read on demand; the digest never drops a Critical/Warning line, a security finding or the contract delta; labelled verdict lines; the replay's recall, precision and verdict parity |
| P2 | a fixer acting on a finding the orchestrator would have rejected | `decision_needed` routes contract and product choices to the orchestrator first; the fixer's rule to answer findings it judges wrong; the close refuses any open row; one serialized writer |
| P3 | a regression outside the prior ids | the reviewer still reads the whole fix delta and reports every new Critical/Warning; rounds at parity on the replay |
| P4 | a plan cell that no longer matches the code | pointers by unit id, never by line; the spec-author amends drifted cells in place; an unresolvable cell stops the implementer with `BLOCKED_DEPENDENCY`; a reviewer pass over amended cells of high-risk units |
| P7 | a card believed over the ledger | everything recomputed from disk at print time; pointers and counts only; "the ledger is the recovery point"; screened like the hook's other output |
| P8 | a rule dropped in the reorder | no text removed; the order pinned by a test; the moved eval ranges updated |
| P9 | a resume onto moved state; a verdict role silently downgraded | the resume message states the on-disk state; one agent resumed first as a probe; verdict roles never fall back |

## Decisions (the maintainer, 2026-09-23, through the question tool, one per turn, recommended option first)

| # | At (UTC) | Decision |
|---|---|---|
| D1 | 20:23 | P1: reports to disk — execution roles (implementer, fixer, spec-author, green test runs) on every client; verdict roles on Claude Code only, through a Write limited to the reports folder and enforced by the guard (never the `edit` category); Cursor, Copilot and Codex verdict returns stay full; researchers keep full returns |
| D2 | 20:25 | P2: a hidden `stamity ledger` verb as the one serialized writer; fixers dispatched with the report path and ledger ids; an optional `decision_needed` field signed off by the orchestrator |
| D3 | 20:26 | P3: per-id re-review closures only; sibling batching and mechanical proof declined |
| D4 | 20:27 | P4: dispatch points at the plan unit; the spec-author amends drifted cells; the implementer's return gains the census closure and its report path; `BLOCKED_DEPENDENCY` on an unresolvable cell |
| D5 | 20:28 | P5: declined; revisit once the replay shows P1–P4's numbers or a second client supports nesting |
| D6 | 20:28 | P7: a resume card recomputed from disk, printed after a compaction (Claude Code, Codex) and by `stamity ledger status` (every client) |
| D7 | 20:30 | P8: reorder the `/st-work` body so what a resumed run needs precedes the re-attachment cut; pinned by a test |
| D8 | 20:31 | P9: a capacity rung and a no-downgrade rule for verdict roles in the `/st-work` body, with two model-ladder requirements |
| D9 | 20:34 | The quality floor below, declared before any run |
| D10 | 20:41 | Measure before merge: the replay is built and run in this session on a fresh-limits account (the maintainer re-logs in; the replay's clean client folder gets one login); the package merges only after the floor holds |
| D11 | 21:12 | Unattended execution and the replay's account: "i will go to sleep, work as far as you possibly can. you can also run the replay with this account" — the build runs on each question's declared default; the replay runs on the account this session's client folder is logged into (a shared login, no copied credential); the QA sign-off and the merge to `main` wait for the maintainer |

## Shared contracts

The same text stands in all three files of this plan. A unit that finds a contract unworkable at a cited line
returns `BLOCKED_AMBIGUITY` naming the contract and the evidence; it does not redesign the contract in place.

**C1 — Report path and name.** `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`, always under the main
checkout's run folder. `<run-id>` matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$`. `<pass>` is the plan unit id
(`[a-z0-9][a-z0-9-]*`), `branch` for a whole-branch pass, `plan` for planning research; a unit id beginning `report`,
`summary`, `findings` or `analysis` takes a `u-` prefix, because Claude Code (2.1.278 and 2.1.280, read from the
client's code) refuses a sub-agent's `Write` whose basename matches `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`.
`<role>` is `implementer | fixer | reviewer | security | performance | design-quality | test-runner | spec-author`;
`r<N>` is the round, from 1. The dispatch names the report by its **absolute** path in the main checkout (a lane
writes there); a digest's `report:` line and the ledger's `report` field carry the **repo-relative** form. Each run's
`reports/` folder holds a `.gitignore` whose one line is `*` — created at Frame, ensured by `stamity ledger append` and
`close` — and this repository's root `.gitignore` also ignores `/.stamity/runs/*/reports/` and the ledger's lock and
temp names; the ledger stays the durable record.

**C2 — The findings block.** Every full report, and every verdict return delivered inline, carries exactly one fenced
block whose info string is `stamity-findings`, one JSON object per line: `id` (`C-<n>`, `W-<n>`, `M-<n>`, local to the
report, its letter matching the severity), `severity` (`Critical | Warning | Minor`), `locator` (`path:line`,
`path:line-line`, or a gate command), `summary` (one line, the failure scenario, ≤ 300 characters), optional
`decision_needed` (true when the fix changes a shared contract or needs a product choice), optional `security` (true
on a security-relevant finding). A pass that found nothing carries an empty block; a `BLOCKED_*` return carries none.

**C3 — Ledger row.** The seven fields `id, phase, source, severity, evidence, state, rationale`, optional `retired`,
and two new optional fields: `report` (the repo-relative report path) and `decision_needed` (present only as `true`).
The states stay `open | fixed | deferred | rejected`. A row appended from a C2 block has `evidence` =
`<locator> — <summary>`, `state` `open`, `rationale` `""`. A `decision_needed` row is signed off by the orchestrator
in a run-record line `- <UTC> sign-off: <ledger-id> — <decision>` before the first fixer dispatch naming its id.

**C4 — The digest.** The final message of a two-tier role, one labelled line each: `status:`; for the reviewer only,
`verdict:` (`approve | request-changes | blocked`) and `confidence:` with its basis word (the review gate parses these);
for a lens (security, performance, design-quality), `mode:` posted or advisory with the posted count (performance also
names whether a declared budget was breached); `report:` with the repo-relative path; `findings:` every Critical and
Warning as `<id> <locator> — <summary>`, Minors as a count with their ids and locators; `security:` every
security-relevant finding in full, or `none`; `contract delta:` the census rows in full, or `none`; then at most 1,500
characters of prose. The cap binds the prose only. **Never digested** (returned in full): a `BLOCKED_*` return, a red
test-runner return, a researcher return, a verdict role's return where its client grants no report write, and any
return whose report write was refused (it says so). Execution roles (implementer, fixer, spec-author, test-runner on a
green verdict — the test-runner writes through its shell) are two-tier on every client; verdict roles are two-tier only
where the client grants the report write (C8).

**C5 — Run record head.** Among the first 15 lines of `.stamity/runs/<run-id>/record.md`: the existing `Status:` line
(in progress while it matches `\bin progress\b`, case-insensitive), `Plan: <repo-relative plan path>` and
`Invocation: <the exact /st-work command line>`, written at Frame.

**C6 — The resume card** (≤ 2,000 characters; recomputed from disk at every print; screened like the session-start
loader's other output — a screen hit prints one `withheld` line naming the pattern):

    stamity resume card — run <run-id> (as of <UTC ISO minute>)
    plan: <C5 Plan>  ·  invocation: <C5 Invocation>
    ledger: <n> open rows (<up to 10 ids>)  ·  the ledger is the recovery point
    reports without a ledger row: <n> (<up to 10 paths>)
    lanes: <n> (<linked worktrees: path [branch], up to 10>)
    next: read the open rows and the listed reports before dispatching anything

The run is the lexicographically greatest in-progress run folder; none → no card. "Reports without a ledger row" are
report files whose C2 block holds ≥ 1 finding and whose path no row carries in `report`. Lanes are linked worktrees read
from the git common dir with `node:fs` (a hook spawns no process). Lists shrink to fit and end `… +<n> more`. Printed by
the session-start hook when its stdin `source` is `compact` (Claude Code, Codex) and by `stamity ledger status` (every
client; by hand where the client does not re-run its session-start hook after a compaction). No pre-compaction hook and
no new hook event is added.

**C7 — `stamity ledger`** (hidden plumbing verb, beside `learn` and `handoff`; the one serialized ledger writer,
through the engine's existing write lock). `append --run <run-id> --phase <phase> --source <role> (--report <path> |
--stdin)`: validates the C2 block (any bad line refuses the whole append, naming the line), appends one `open` row per
finding (ids `<run-id>/<phase>/<n>`, n continuing that run and phase's highest, numerically), prints
`<ledger-id> <severity> <report-local id>` per row with a trailing ` decision-needed` on such rows, and refuses a
report already appended. `close --run <run-id> (--report <path> | --id <ledger-id> --state <fixed|rejected|deferred>
--rationale <text>)`: applies a C9 closures block, or one manual transition, rewriting rows in place; an unknown id
refuses the whole close. `status [--run <run-id>]`: prints C6. Every refusal exits 1; a report path must resolve
directly inside that run's `reports/`, with no `..` segment and no symlink.

**C8 — Verdict-role report write on Claude Code only.** An optional `writePaths` on the four verdict policy rows,
each naming only its own role's reports: `.stamity/runs/*/reports/*-reviewer-r*.md`, `*-security-r*.md`,
`*-performance-r*.md`, `*-design-quality-r*.md`. The policy document schema stays `stamity/agent-tool-policies/v1`
(an older guard denies `Write` through the category, fail-closed). The Claude adapter renders `Write` — never `Edit`
or `NotebookEdit` — for those agents in the repository layout only; a plugin install (the container hook layout,
which anchors no project root) renders none. The generated pre-tool-use guard allows such a `Write` only for a regular
file resolving inside the root its own location names and matching the row's pattern, with no `..`, no symlink, no hard
link; every other edit-category call by those agents stays denied. Cursor, Copilot and Codex keep read-only grants and
their capability disclosure says verdict reports are returned inline there. The guard change gets a security lens pass
and a security review of its diff.

**C9 — Re-review closures.** A re-review carries a `stamity-closures` block, one object per prior ledger id:
`{"ledger_id":"<id>","status":"fixed|not-fixed|regressed|rejection-upheld|rejection-overturned"}` with an optional
`rationale`; plus new Critical/Warning only (C2), the reviewer's labelled `verdict:`/`confidence:` lines, and one line
`read: <files>; lenses: <list>`. `ledger close --report` maps `fixed` → `fixed`, `rejection-upheld` → `rejected`
(its rationale, default `rejection upheld by <report>`), and keeps `not-fixed`, `regressed`, `rejection-overturned`
open with a note appended; `regressed` also reopens a `fixed` row.

**C10 — Pointer dispatch** (at most 15 lines): role, class and run id; the plan path and unit id, never a line number;
worktree, branch and base; the absolute report path (C1); the unit's `verify`; its `files` cell as the boundary; the
learnings that apply; the digest (C4) as the return. An in-flow plan is persisted once as
`.stamity/runs/<run-id>/plan.md` in `/st-plan`'s unit shape. When an implementer's contract delta moves a seam a later
unit relies on, the spec-author amends that later cell in place (`amended <UTC date>: <what moved> (<commit>)`) before
it is dispatched; when that unit touches a security trigger path or a shared contract, the reviewer reads the amended
cell first. An implementer whose cell names an interface that does not resolve at HEAD returns `BLOCKED_DEPENDENCY`.

**C11 — Capacity rung**, a Dispatch-contract bullet after the findings-ledger bullet. A stop is classed by its notice:
`stall` (no progress) or `connection` (dropped transport) → resume the same agent; a second stop waits five minutes,
then resumes; a third → `BLOCKED_DEPENDENCY` with the smallest unblocking input. `limit-reset` (a limit naming its
reset) → wait for a reset within 12 hours, then resume one agent as a probe before the rest; a later reset →
`BLOCKED_DEPENDENCY` naming it. `limit-no-reset` (credits, a model limit with no reset) → a build role (implementer,
fixer on rounds 1–3, researcher, creator, test-runner) may drop one class, named in the proof block; every other role
stops as `BLOCKED_DEPENDENCY`. Verdict roles and the spec-author never fall back to a weaker class. A resume is neither
a ladder rung nor a review round (on clients with no sub-agent resume it is a re-dispatch of the same brief at the
same class, naming the on-disk state). One run-record line per event:
`- <UTC> capacity: <role> <stop class> → <resumed | waited until <UTC> | BLOCKED_DEPENDENCY>`.

**C12 — The quality floor and the replay** (declared before any run). The changed shape against the 1.9.1 baseline,
on Claude Code, one run at a time on the account the operator's client folder is logged into (shared login, no copied
credential), scored by a deterministic matcher (file + line ±3 + one accepted term; no model judge):
every security seed found in every changed scored run (exempt when at least one baseline scored run missed it);
pooled seeded recall ≥ baseline − 1 of 36; decoys wrongly flagged ≤ baseline; 0 findings lost across a forced
compaction in every valid sample; verdicts — the same modal final class on ≥ 5 of 6 passes, rounds within ±1 per pass,
no more passes approved with a seed still unfixed than the baseline. Saving shown: loop characters per pass in every
changed scored run ≤ 0.5 × the baseline median; the changed shape's mean sub-agent tokens per pass ≤ 1.2 × the
baseline's mean. Samples: 1 pilot plus 3 scored runs per shape; a shape whose three scored runs differ by more than 2
seeds found gets 5. Protocol and thresholds are committed in `evals/replay/REPLAY-v1.md` before the pilot and never
moved. The package merges only when every row holds; the eval-set floors are checked at the 1.10.0 baseline run.

## Spec delta

The requirements this file's units implement. Their statements, acceptance criteria and the amendments the Prove merge applies are the one canonical copy in this file § Spec text; `/st-work` merges them into `docs/specs/orchestrator-context.md` (a new spec) and `docs/specs/model-ladder.md` (two requirements added) at its Prove phase.

### REQ-CTX-003 — Verdict-role report write on Claude Code, and the degradation elsewhere

### REQ-CTX-004 — Report naming, and a folder git ignores

### REQ-CTX-005 — `stamity ledger append`, the one serialized ledger writer

### REQ-CTX-006 — The `report` and `decision_needed` fields, and the sign-off

### REQ-CTX-008 — Re-review closures and `stamity ledger close`

### REQ-CTX-012 — The run record's head names the plan and the invocation

### REQ-CTX-013 — The resume card, and `stamity ledger status`

## Spec text — merged into docs/specs at the Prove phase

Two spec files move, and their requirements are defined here once for all three files of the plan: a new spec, `docs/specs/orchestrator-context.md` (id `orchestrator-context`; written at the plan's write as a `status: design` skeleton, moved to `shipped-with-1.10.0` at the 1.10.0 close), carrying REQ-CTX-001 through REQ-CTX-015, and two requirements added to `docs/specs/model-ladder.md`, REQ-LADDER-002 and REQ-LADDER-003, with its frame lines moved as shown. The statements and acceptance criteria below are the spec-author's draft of 2026-09-23 and are normative once the amendments that follow are applied; `/st-work` merges them into `docs/specs/` at its Prove phase, together with the frame text quoted after the requirements.

### REQ-CTX-001 — Execution roles write the full report to disk and return a digest

The implementer, the fixer, the spec-author, and a test-runner whose gates all pass each write
their full report to the C1 path and return the C4 digest. This holds on all four clients.
These roles already hold edit on every client, so the change is carried in their definitions
and needs no engine grant.

Implements C1, C4 (D1).

Acceptance criteria:

- GIVEN `stamity sync` on a manifest selecting all four clients WHEN each client's emitted
  definition of the implementer, fixer, spec-author and test-runner is read THEN its return
  contract names the path `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md` and the
  labels `status:`, `report:`, `findings:`, `security:` and `contract delta:` in that order,
  and names no `verdict:` or `confidence:` label.
- GIVEN a changed-shape replay run WHEN an implementer, fixer or spec-author dispatch returns
  `status: DONE` THEN a file exists at the path its `report:` line names, and the message's
  text outside the labelled lines and their rows is at most 1,500 characters.
- GIVEN a test-runner run in which every gate passes WHEN it returns THEN it returns a digest
  whose `report:` file holds one row per gate with the exact command run.

### REQ-CTX-002 — The never-digested classes and the never-cut lines

- **Returned in full, never digested:** a `BLOCKED_*` return, a red test-runner return, a
  researcher return, and a verdict-role return on Cursor, Copilot and Codex.
- **In every digest:**
  - every Critical and Warning finding, one line each;
  - Minor findings as a count plus their ids and locators;
  - every security-relevant finding, verbatim;
  - every contract-delta row, with all six census columns.

A red test-runner's excerpts are ledger evidence (`content/commands/st-work.md:250`). The
security exemption restates the existing rule (`content/commands/st-work.md:336-339`) for the
new return shape.

Implements C4.

Acceptance criteria:

- GIVEN `content/commands/st-work.md` WHEN its Return contract section is read THEN it names
  all four never-digested classes: any `BLOCKED_*` return, a red test-runner return, a
  researcher return, and a verdict-role return on Cursor, Copilot and Codex.
- GIVEN a test-runner run with a failing gate WHEN it returns THEN the message itself carries
  that gate's exact command and its verbatim failing excerpt, and no `report:` line stands in
  for them.
- GIVEN `content/agents/stamity-researcher.md` WHEN `git diff v1.9.1 -- content/agents/stamity-researcher.md`
  runs on the merged tree THEN the Return contract section shows no changed line.
- GIVEN each emitted two-tier role definition WHEN read THEN it states that the 1,500-character
  cap binds prose only, and that no Critical or Warning line, security-relevant finding or
  contract-delta row is dropped to meet it.
- GIVEN every digest in the changed-shape replay runs WHEN compared with the `stamity-findings`
  block of the report its `report:` line names THEN all of these hold:
  - every Critical and Warning appears in `findings:` as `<id> <locator> — <summary>`;
  - the Minors appear as a count plus their ids and locators;
  - every `"security":true` finding appears in `security:` verbatim, and `security: none`
    appears only when there are none;
  - every census row in the report appears in `contract delta:` with all six columns.

### REQ-CTX-003 — Verdict-role report write on Claude Code, and the degradation elsewhere

On Claude Code, the reviewer and the `security`, `performance` and `design-quality` lenses
write their report through a `Write` limited to `.stamity/runs/*/reports/*.md`:

- **Policy document.** Each verdict row gains an optional `writePaths` field. `allow` is
  unchanged and the schema stays `stamity/agent-tool-policies/v1`
  (`src/tools/allowlist.ts:144`).
- **Enforcement.** The pre-tool-use guard enforces the path list by resolving
  `tool_input.file_path`:
  - it must fall inside the project root the guard anchors on (`.claude/settings.json:33`);
  - no symlink is allowed on the path and no `..` segment;
  - it must match the pattern.
- **Digest.** Each verdict role returns the C4 digest with labelled `verdict:` and
  `confidence:` lines, so the review gate still parses them.
- **Other clients.** On Cursor, Copilot and Codex, the grants stay read-only. The verdict roles
  return in full inline with their C2 block, and the emitted capability disclosure says so.

Ruled out:

- A grant through the `edit` category. On Claude it also brings `Edit` and `NotebookEdit`
  (`src/tools/translator.ts:71`). On Cursor, Copilot and Codex, where the guard has no agent
  identity, it would widen the verdict roles to full edit (`docs/capability-matrix.md:259-261`).

Implements C8 (D1).

Acceptance criteria:

- GIVEN `stamity sync` on a manifest selecting all four clients WHEN
  `.stamity/generated/agent-tool-policies.json` is read THEN all of these hold:
  - `schema` is `stamity/agent-tool-policies/v1`;
  - the reviewer, security, performance and design-quality rows carry
    `writePaths: [".stamity/runs/*/reports/*.md"]`;
  - those rows' `allow` lists equal their 1.9.1 values;
  - no other row carries `writePaths`.
- GIVEN the same sync WHEN `.claude/agents/stamity-reviewer.md`,
  `stamity-security.md`, `stamity-performance.md` and `stamity-design-quality.md` are read THEN
  each `tools:` line contains `Write` and contains neither `Edit` nor `NotebookEdit`.
- GIVEN the emitted Claude pre-tool-use guard and a reviewer `Write` whose `file_path` is
  `<project root>/.stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md`, with no symlink on
  the path, WHEN the guard runs THEN it exits 0.
- GIVEN the same guard and the reviewer WHEN any one of these calls is made THEN the guard
  exits 2 for each:
  - `Write` on `<project root>/src/index.ts`;
  - `Write` on `…/reports/../ledger.jsonl`;
  - `Write` on `…/reports/u1-reviewer-r1.txt`;
  - `Write` on a report path whose `reports` directory is a symlink;
  - `Write` on an absolute path outside the project root;
  - `Edit` on the allowed report path.
- GIVEN the 1.9.1 guard script and the new policy document WHEN a reviewer calls `Write` on
  the allowed report path THEN the guard exits 2.
- GIVEN the same sync WHEN the Cursor, Copilot and Codex definitions of the four verdict roles
  are read THEN Cursor's `readonly:`, Copilot's `tools:` and Codex's `sandbox_mode` equal the
  1.9.1 emission, and each of those clients' emitted capability disclosure carries a line
  stating that verdict reports are returned inline there.
- GIVEN the Claude review gate and a reviewer stop whose final text is a digest carrying
  `verdict: approve` and `confidence: high (direct)` WHEN the gate records the round THEN the
  recorded verdict is `approve`, not `unrecorded`.

### REQ-CTX-004 — Report naming, and a folder git ignores

- **Path.** Reports live at `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`, under the
  main checkout's run folder. A lane agent writes there by absolute path.
- **Pass name.** `<pass>` never begins with `report`, `summary`, `findings` or `analysis`,
  because Claude Code refuses a sub-agent's Write whose basename matches
  `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`.
- **Ignore rule.** The `reports/` folder is git-ignored. The ledger and the record beside it
  stay tracked, and the ledger remains the durable record.

Implements C1.

Acceptance criteria:

- GIVEN `content/commands/st-work.md` WHEN read THEN it states:
  - the report path grammar;
  - the eight role names `implementer`, `fixer`, `reviewer`, `security`, `performance`,
    `design-quality`, `test-runner` and `spec-author`;
  - that `<pass>` never begins with `report`, `summary`, `findings` or `analysis`.
- GIVEN this repository's `.gitignore` WHEN `git check-ignore -q .stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md`
  runs THEN it exits 0, and the same command on `.stamity/runs/2026-09-23_demo/ledger.jsonl`
  and on `.stamity/runs/2026-09-23_demo/record.md` exits 1.
- GIVEN an implementer dispatched into a linked worktree WHEN it writes its report THEN the
  file exists under the main checkout's `.stamity/runs/<run-id>/reports/`, and the worktree's
  own `.stamity/runs/` holds no file under a `reports/` folder.
- GIVEN every report written in the changed-shape replay runs WHEN its path is tested THEN:
  - the basename does not match `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`;
  - the run folder matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$`;
  - the basename matches `^[a-z0-9][a-z0-9-]*-(implementer|fixer|reviewer|security|performance|design-quality|test-runner|spec-author)-r[1-9][0-9]*\.md$`.

### REQ-CTX-005 — `stamity ledger append`, the one serialized ledger writer

`stamity ledger` is a hidden plumbing verb, modelled on `learn capture`
(`src/cli/commands/learn.ts:14-22`, `:426-427`).

- **`append` validates the C2 block.** A malformed line refuses the whole append and names the
  line.
- **Rows.** It appends one `open` row per finding, with ids `<run-id>/<phase>/<n>` continuing
  the run and phase's highest n. It sets `report` and `decision_needed`.
- **Output.** It prints one line per row: `<ledger-id> <severity> <report-local id>`.
- **Write scope.** It writes only under `.stamity/runs/<run-id>/`. A report path must resolve
  inside that run's `reports/`.
- **Locking.** It takes one lock file per run's ledger: exclusive create, temp file plus
  rename.

Implements C2, C7 (D2).

Acceptance criteria:

- GIVEN the built CLI WHEN `stamity --help` runs THEN no `ledger` row is listed, and WHEN
  `stamity ledger --help` runs THEN it exits 0 and names `append`, `close` and `status`.
- GIVEN run `R` whose ledger holds `R/review/1` to `R/review/3`, and a report under `R`'s
  `reports/` whose `stamity-findings` block holds `C-1` (Critical) and `W-1` (Warning), WHEN
  `stamity ledger append --run R --phase review --source reviewer --report <that path>` runs
  THEN:
  - it exits 0;
  - the ledger gains rows `R/review/4` and `R/review/5`, each with `state` `open`,
    `rationale` `""`, `evidence` `<locator> — <summary>` and `report` equal to the report's
    repo-relative path;
  - stdout is exactly the two lines `R/review/4 Critical C-1` and `R/review/5 Warning W-1`.
- GIVEN a block whose second line carries `"severity":"High"`, a summary of 301 characters, or
  no `locator` WHEN append runs THEN it exits 1, the message names line 2, and the ledger file
  is byte-identical to before.
- GIVEN a report carrying no `stamity-findings` block WHEN append runs THEN it exits 1 and the
  ledger is byte-identical, and GIVEN a report carrying an empty block WHEN append runs THEN it
  exits 0, appends no row and prints nothing.
- GIVEN `--report` naming a path with a `..` segment, a path whose leaf is a symlink, or a
  report under another run's `reports/` WHEN append runs THEN it exits 1 and no file under
  `.stamity/` changes.
- GIVEN `--stdin` carrying a valid block of two findings WHEN append runs THEN two `open` rows
  are appended as in the second criterion, and neither carries a `report` key.
- GIVEN two `stamity ledger append` processes started together on run `R`, carrying 3 and 4
  findings WHEN both exit THEN both exit 0, the ledger holds 7 new rows whose ids are distinct
  and contiguous after the previous highest, and no lock or temp file remains in `R`'s folder.
- GIVEN any `stamity ledger` subcommand run in a clean checkout WHEN it exits THEN
  `git status --porcelain --ignored` lists changes only under `.stamity/runs/<run-id>/`.
- GIVEN `--run ../x` or any value failing `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$` WHEN any
  `stamity ledger` subcommand runs THEN it exits 1 and writes nothing.

### REQ-CTX-006 — The `report` and `decision_needed` fields, and the sign-off

The ledger row gains two optional fields:

- `report`: the repo-relative path of the report the row came from.
- `decision_needed`: present only as `true`.

The state set stays `open | fixed | deferred | rejected`. A row carrying
`decision_needed: true` is signed off by the orchestrator before any fixer acts on it.

Ruled out:

- A fifth state. It widens the closed set that `test/records/ledgers.test.ts` asserts and that
  the close gate reads (`content/commands/st-work.md:275-278`).

Implements C3 (D2).

Acceptance criteria:

- GIVEN `test/records/ledgers.test.ts` WHEN it validates every committed ledger THEN:
  - it admits `report` (a string) and `decision_needed` (only the value `true`) beside
    `retired`;
  - it still refuses any other unknown field;
  - it still asserts exactly the states `open`, `fixed`, `deferred` and `rejected`.
- GIVEN a block holding one finding with `"decision_needed":true` and one with
  `"decision_needed":false` WHEN append runs THEN the first row carries
  `"decision_needed":true` and the second carries no `decision_needed` key.
- GIVEN `content/commands/st-work.md` WHEN read THEN it states that a row carrying
  `decision_needed: true` is signed off by the orchestrator before any fixer dispatch names its
  id.
- GIVEN a changed-shape replay run holding a `decision_needed: true` row WHEN its transcript is
  read THEN the orchestrator's sign-off for that id precedes every fixer dispatch naming it.
  `judgment: reviewer`
- GIVEN a ledger whose rows carry `report` and `decision_needed` WHEN
  `src/cli/docs/measurements.ts` and `scripts/merge-ready-rate.mjs` read it THEN each reports
  the same open-row count and the same rate it reports for the same rows with those two keys
  removed.

### REQ-CTX-007 — A fixer is dispatched by report path and ledger ids

A fixer's dispatch names the report path and the ledger ids it answers. Its scope is those
ids, and it returns one disposition per id, using the existing vocabulary
(`content/agents/stamity-fixer.md:97-107`).

Implements D2 and C10's dispatch form.

Acceptance criteria:

- GIVEN each client's emitted fixer definition WHEN read THEN its scope rule names the handed
  ledger ids as its whole scope, and its return carries one disposition per handed id: `fixed`,
  `rejected` with reasoning, or `unresolved`.
- GIVEN every fixer dispatch in the changed-shape replay runs WHEN its prompt is read THEN it
  is at most 15 lines, and it names a report path under the run's `reports/` and at least one
  ledger id present in that run's ledger.
- GIVEN every fixer return in the changed-shape replay runs WHEN compared with its dispatch
  THEN it carries exactly one disposition per ledger id the dispatch named.

### REQ-CTX-008 — Re-review closures and `stamity ledger close`

A re-review returns:

- a `stamity-closures` block, with one closure per prior ledger id;
- new Critical and Warning findings only, in C2;
- the labelled `verdict:` and `confidence:` lines;
- one `read: <files>; lenses: <list>` line.

`stamity ledger close --report` applies the closures:

- `fixed` → `fixed`;
- `rejection-upheld` → `rejected`;
- `not-fixed`, `regressed` and `rejection-overturned` stay `open`, with the rationale appended.

`stamity ledger close --id` applies one manual transition. Either form rewrites the row in
place and refuses an unknown id.

Implements C9, C7 (D3).

Acceptance criteria:

- GIVEN each client's emitted reviewer definition WHEN its re-review return is read THEN it
  names:
  - a `stamity-closures` block with one object per prior ledger id;
  - the statuses `fixed`, `not-fixed`, `regressed`, `rejection-upheld` and
    `rejection-overturned`;
  - new Critical and Warning findings only, in `stamity-findings`;
  - the labelled `verdict:` and `confidence:` lines;
  - one `read: <files>; lenses: <list>` line.
- GIVEN a closures block giving `fixed` for A, `rejection-upheld` for B, `not-fixed` for C,
  `regressed` for D and `rejection-overturned` for E WHEN
  `stamity ledger close --run R --report <path>` runs THEN:
  - it exits 0;
  - A reads `fixed` and B reads `rejected`;
  - C, D and E read `open`, with rationales extended by their closure status;
  - the ledger's row count, row order and every row id are unchanged.
- GIVEN a closures block naming an id absent from `R`'s ledger WHEN `ledger close` runs THEN it
  exits 1 and the message names that id.
- GIVEN `stamity ledger close --run R --id R/review/2 --state deferred --rationale "<text>"`
  WHEN it runs THEN row `R/review/2` reads `deferred` with that rationale at its original line
  position, and the same command with an id absent from the ledger exits 1 with the ledger
  byte-identical.
- GIVEN every re-review in the changed-shape replay runs WHEN its return is compared with the
  ledger ids its dispatch handed it THEN it carries exactly one closure per handed id.

### REQ-CTX-009 — Pointer dispatch, and an in-flow plan persisted once

A dispatch names the persisted plan unit by path and unit id, never by line number, plus
run-specific parameters, in at most 15 lines. An in-flow plan is persisted once, as
`.stamity/runs/<run-id>/plan.md`, in `/st-plan`'s unit shape
(`content/commands/st-plan.md:341-350`). That replaces "persisted nowhere"
(`content/commands/st-work.md:52-54`).

Implements C10 (D4).

Acceptance criteria:

- GIVEN `content/commands/st-work.md` WHEN read THEN:
  - it states the dispatch form (role, class, run; unit; worktree; report; gate; boundaries;
    learnings; return), the 15-line ceiling, and the rule that a unit is named by plan path
    and unit id, never by line number;
  - it no longer states that an in-flow plan is persisted nowhere.
- GIVEN every implementer dispatch in the changed-shape replay runs WHEN its prompt is read
  THEN:
  - it is at most 15 lines;
  - its `unit:` line names a plan path and a unit id that exists in that plan;
  - the `unit:` line matches neither `:[0-9]+` nor the word `line`.
- GIVEN an in-flow `/st-work` run with no `/st-plan` artifact WHEN its Plan phase ends THEN:
  - `.stamity/runs/<run-id>/plan.md` exists;
  - every unit in it carries the eight fields of `/st-plan`'s unit table;
  - the run folder holds exactly one `plan.md`;
  - the record head's `Plan:` line names it.

### REQ-CTX-010 — Plan-cell amendment, and `BLOCKED_DEPENDENCY` on a cell that no longer resolves

- **Amendment.** The spec-author gains a third consumer job, beside spec-delta merge and
  plan-artifact draft (`content/agents/stamity-spec-author.md:35-48`). When an implementer's
  contract delta moves a seam a later unit relies on, the spec-author amends that later cell in
  place with the line `amended <UTC date>: <what moved> (<commit>)`.
- **Unresolvable cell.** An implementer whose cell names an interface that does not resolve at
  HEAD returns `BLOCKED_DEPENDENCY`.

Implements C10 (D4).

Acceptance criteria:

- GIVEN each client's emitted spec-author definition WHEN read THEN it names plan-cell
  amendment as a consumer job beside spec-delta merge and plan-artifact draft, and states the
  line form `amended <UTC date>: <what moved> (<commit>)`.
- GIVEN an implementer digest whose `contract delta:` row changes a seam named in a later,
  undispatched unit's `interfaces` cell WHEN the spec-author's amendment job has run THEN that
  unit in the plan file contains a line matching
  `amended [0-9]{4}-[0-9]{2}-[0-9]{2}: .+ \([0-9a-f]{7,40}\)`, and no other unit changed.
- GIVEN each client's emitted implementer definition WHEN read THEN it states that an interface
  its cell names which does not resolve at HEAD returns `BLOCKED_DEPENDENCY`, naming the
  interface and the smallest unblocking input.
- GIVEN a plan cell naming `foo` from `src/a.ts`, where HEAD's `src/a.ts` exports no `foo`,
  WHEN an implementer is dispatched on that cell THEN it returns `status: BLOCKED_DEPENDENCY`
  naming `foo`, and `git status --porcelain` shows no change outside `.stamity/runs/`.

### REQ-CTX-011 — The implementer's return carries its census closure and its report path

The implementer's return contract (`content/agents/stamity-implementer.md:86`) gains:

- the `report:` line;
- the `contract delta:` rows in census grammar, each closing `clean`, `reconciled(N)` or
  `N unreconciled` (the contract-census rule, Floor 5), or `none`.

Implements C4 (D4).

Acceptance criteria:

- GIVEN each client's emitted implementer definition WHEN its Return contract section is read
  THEN it carries:
  - a `report:` line;
  - a `contract delta:` field whose rows carry contract, class, producer, consumers, change
    kind and a closure of `clean`, `reconciled(N)` or `N unreconciled`, or the value `none`.
- GIVEN the eval case `golden/agent-implementer-return-contract` WHEN
  `test/evals/locators.test.ts` runs on the merged tree THEN it passes against the amended
  definition.
- GIVEN every implementer return in the changed-shape replay runs WHEN read THEN it carries a
  `contract delta:` line (rows or `none`) and a `report:` path that exists.

### REQ-CTX-012 — The run record's head names the plan and the invocation

The first 15 lines of `.stamity/runs/<run-id>/record.md` carry:

- the existing `Status:` line;
- `Plan: <repo-relative plan path>`;
- `Invocation: <the exact /st-work command line>`.

The two new lines are written at Frame.

Implements C5 (D6, D7).

Acceptance criteria:

- GIVEN `content/commands/st-work.md` WHEN its Frame phase is read THEN it instructs writing
  `Plan: <repo-relative plan path>` and `Invocation: <the exact /st-work command line>` into
  the first 15 lines of the run record, beside `Status:`.
- GIVEN every changed-shape replay run WHEN its Frame phase has ended THEN:
  - the first 15 lines of `.stamity/runs/<run-id>/record.md` hold exactly one line each
    beginning `Status:`, `Plan:` and `Invocation:`;
  - the `Plan:` path exists;
  - the `Invocation:` value equals, byte for byte, the command the driver sent.
- GIVEN a record whose head reads `Status: In Progress — opened …` and a second whose head
  reads `Status: **closed** — …` WHEN `/^status:.*\bin progress\b/im` is applied THEN the first
  matches and the second does not.

### REQ-CTX-013 — The resume card, and `stamity ledger status`

The card is at most 2,000 characters and is recomputed from disk each time it prints. It is
never read from a maintained state file. It names:

- the in-progress run;
- the plan and the invocation;
- the open ledger rows;
- the reports that have no ledger row;
- the lanes.

Where it prints:

- **Claude Code and Codex:** the session-start hook prints it after a compaction.
- **Every client:** `stamity ledger status` prints it.
- **Cursor and Copilot:** the `/st-work` body tells the orchestrator to run
  `stamity ledger status` by hand after a compaction summary.

The card's output is screened like the session-start loader's other output.

Ruled out:

- A pre-compaction hook or a new hook event. The review gate's events are derived from every
  Claude extension row except `ConfigChange` (`src/adapters/claude.ts:245-247`), so a new row
  would also wire the review gate onto it.

Implements C6, C7 (D6).

Acceptance criteria:

- GIVEN a fixture holding:
  - one run whose record is in progress;
  - 12 open ledger rows;
  - 12 reports whose block holds at least one finding and whose path no row carries;
  - one report with an empty block;
  - 12 linked worktrees;

  WHEN `stamity ledger status` runs THEN:
  - it exits 0;
  - it prints the six card lines in C6's order;
  - the ledger line reads `12 open rows` and lists 10 ids;
  - the reports line reads `12` and lists 10 paths, none of them the empty-block report;
  - the lanes line lists at most 10 entries;
  - the output is at most 2,000 characters.
- GIVEN the same fixture WHEN `stamity ledger append` adds one row and `stamity ledger status`
  runs again THEN the ledger line reads `13 open rows`, and neither `status` run created or
  modified a file under `.stamity/`.
- GIVEN two run folders whose records are both in progress WHEN `stamity ledger status` runs
  without `--run` THEN the card names the newer run, and WHEN it runs with `--run <older>` THEN
  the card names the older one.
- GIVEN the emitted Claude session-start script and an in-progress run WHEN stdin carries
  `"source":"compact"` THEN stdout carries a line beginning `stamity resume card — run`, and
  WHEN stdin carries `"source":"startup"`, or no run is in progress, THEN stdout carries no
  such line.
- GIVEN the emitted Codex session-start hook through the portable runner and an in-progress
  run WHEN stdin carries `"source":"compact"` THEN stdout carries a line beginning
  `stamity resume card — run`.
- GIVEN an in-progress run whose record's `Plan:` value trips the session-start loader's read
  screen WHEN the card is built THEN no text from that value is printed, and a skip line names
  the record file and the pattern id.
- GIVEN `content/commands/st-work.md` WHEN read THEN it instructs running
  `stamity ledger status` after a compaction summary on Cursor and Copilot.
- GIVEN `stamity sync` on a manifest selecting all four clients WHEN the emitted hook wiring is
  read THEN no `PreCompact`, `PostCompact` or `preCompact` event is wired, and the Claude
  review gate's events are exactly `TaskCompleted` and `SubagentStop`.

### REQ-CTX-014 — The `/st-work` body's order puts what a resumed run needs before the re-attachment cut

The Review loop, the Dispatch contract (including the failure ladder and the findings-ledger
rule) and the Return contract move within the body's first 18,000 characters. That keeps them
under Claude Code's 5,000-token re-attachment cut, with margin. Dials (with the Model ladder
table) and Testing philosophy move to the end. The reorder removes no text, and a test pins
the order. The body stays within its 500-line cap (`test/corpus/commands/work.test.ts:66`).

Implements D7.

Acceptance criteria:

- GIVEN the emitted `.claude/commands/st-work.md` WHEN character offsets are measured from its
  first byte THEN the last character of each of the Review loop, Dispatch contract and Return
  contract sections sits at an offset below 18,000.
- GIVEN the same file WHEN its headings are listed in order THEN `## Dials` (holding
  `### Intensity` and `### Model ladder`) and `## Testing philosophy` both come after
  `## Return contract`.
- GIVEN `content/commands/st-work.md` at the parent of the reorder commit and at the reorder
  commit WHEN the sorted lists of their non-blank lines are compared THEN they are equal.
- GIVEN `test/corpus/commands/work.test.ts` WHEN it runs THEN a case asserts the first two
  criteria on the emitted body, and that case fails when the body is restored to its 1.9.1
  order.
- GIVEN `content/commands/st-work.md` on the merged tree WHEN its lines are counted THEN the
  count is at most 500, and `test/corpus/commands/work.test.ts` passes.
- GIVEN the eval cases whose `source:` cites `content/commands/st-work.md` WHEN
  `test/evals/locators.test.ts` runs on the merged tree THEN it passes with their moved ranges.

### REQ-CTX-015 — The replay, its floor, and the merge gate

A replay compares the changed shape with the 1.9.1 baseline:

- **Scope.** It runs `/st-work` on Claude Code only, on a disposable fixture with seeded
  defects.
- **Scoring.** A deterministic matcher: the seed's file, a line within ±3 of the seed's span,
  and one of the seed's accepted terms. No model judge.
- **Protocol first.** The protocol and thresholds are committed as `evals/replay/REPLAY-v1.md`
  before the pilot.
- **Samples.** 1 pilot plus 3 scored runs per shape, or 5 when the pilot varies by more than 2
  seeds.
- **Merge gate.** The package merges only after the floor holds.
- **Release gate.** Every eval-set floor holds at the 1.10.0 release run.

Implements C12 (D9, D10).

Acceptance criteria:

- GIVEN `evals/replay/REPLAY-v1.md` WHEN `git log` is read THEN the commit adding its protocol
  and threshold table is an ancestor of the commit adding the first replay result, and no later
  commit changes a threshold value.
- GIVEN the replay's matcher WHEN it scores a finding THEN it counts a match only when all
  three hold, and the scoring code makes no model call:
  - the finding names the seed's file;
  - the line is within the seed's span ±3;
  - the text contains one of the seed's accepted terms.
- GIVEN the committed replay results WHEN counted THEN each shape (the 1.9.1 baseline and the
  changed shape) has 1 pilot and 3 scored runs on Claude Code, or 5 scored runs where the
  pilot varied by more than 2 seeds.
- GIVEN the scored changed-shape runs WHEN security seeds are scored THEN every security seed
  is found in every run, except a seed the baseline also missed.
- GIVEN both shapes' scored runs WHEN seeded recall is pooled over 36 seed opportunities per
  shape THEN changed ≥ baseline − 1.
- GIVEN both shapes' scored runs WHEN decoys flagged Critical or Warning are counted THEN
  changed ≤ baseline.
- GIVEN every valid forced-compaction sample of the changed shape WHEN findings lost are
  counted THEN the count is 0 in each sample.
- GIVEN both shapes' scored runs WHEN verdicts are compared per pass THEN:
  - the final verdict class agrees on at least 5 of 6 passes;
  - rounds agree within ±1;
  - the changed shape approves no more passes with a seed still unfixed than the baseline.
- GIVEN each scored changed-shape run WHEN loop characters per pass are computed THEN each is
  at most 50 % of the baseline's.
- GIVEN the scored runs WHEN sub-agent tokens per pass are computed THEN changed ≤ 1.2 ×
  baseline.
- GIVEN every committed replay result WHEN read THEN it records the Claude Code version, and
  every result of both shapes records the same version.
- GIVEN the committed replay results WHEN read THEN they carry one `not-run` row each for
  Cursor, GitHub Copilot CLI and Codex, each with its reason.
- GIVEN the package's pull request WHEN it merges to `main` THEN its merge commit descends from
  a committed comparison that shows the floor criteria above (the fourth to the tenth) holding
  for every proposal kept, and every dropped proposal's ids read retired in this spec with a
  pointer to the failing result.
- GIVEN the 1.10.0 eval-set run WHEN it is scored THEN every eval-set floor holds before the
  `v1.10.0` tag is created.

### REQ-LADDER-002 — A capacity stop resumes or waits; it is not a failed sub-agent

Given the `/st-work` Dispatch contract carrying, directly after its "Findings ledger" bullet
(`content/commands/st-work.md:340-342`), a capacity bullet that sorts a stopped sub-agent by its
stop notice into `stall` (a watchdog, no progress), `connection` (a dropped transport),
`limit-reset` (a limit naming its reset time) and `limit-no-reset` (credits, or a model limit
naming no reset), When a sub-agent stops as `stall` or `connection`, Then the orchestrator
resumes that same agent, a second such stop waits a bounded backoff before resuming it, and a
third returns `BLOCKED_DEPENDENCY` naming the smallest unblocking input; When it stops as
`limit-reset` with the stated reset within 12 hours, Then the orchestrator waits until that
reset and resumes one agent as a probe before resuming the rest; When it stops as
`limit-no-reset`, Then the orchestrator returns `BLOCKED_DEPENDENCY` at once; and When any of
these events occurs, Then the run record gains exactly one line
`- <UTC> capacity: <role> <class> → <resumed | waited until <UTC> | BLOCKED_DEPENDENCY>`, the
event counts as neither a failure-ladder rung nor a review round, and the failure-ladder bullet
(`content/commands/st-work.md:331-335`) and its pinned phrases
(`test/corpus/commands/work.test.ts:850-853`) are unchanged.

The capacity rule is carried in the bullet's prose, with no table. A second pipe table under
`### Model ladder` would be read as ladder rows, because `shippedLadderRows` takes every pipe
row up to the next heading (`test/roster/modelLadder.test.ts:130-142`). A
`test/corpus/commands/work.test.ts` case under "dispatch contract" pins the bullet's text and
its position. The orchestrator's conduct during a live stop is `judgment: reviewer`, read from
the run record's capacity lines. No engine surface changes. Codex receives no touchpoint
bodies (`docs/capability-matrix.md:240`), so the bullet has no carrier there.

### REQ-LADDER-003 — Verdict roles never fall back; a build role drops one class only under `limit-no-reset`

Given the capacity bullet of REQ-LADDER-002, When a verdict role stops for capacity — the
reviewer on any round or on the whole-branch pass, the `security`, `design-quality` or
`performance` lens, or the fresh fixer spawned on a stronger class
(`content/commands/st-work.md:140-142`) — Then it is resumed, waited for, or returned as
`BLOCKED_DEPENDENCY` at the class the ladder assigns it, and it is never re-dispatched on a
weaker class; When a build role stops as `limit-no-reset`, Then it may be re-dispatched one
class below its assigned class and no further, and the proof block's per-action attribution
(`content/commands/st-work.md:230`) names that role, the class it was assigned and the class it
ran at; When a build role stops as `stall`, `connection` or `limit-reset`, Then it keeps its
assigned class; and When `test/roster/modelLadder.test.ts` runs after the change, Then it
passes with no change to `src/roster/modelLadder.ts` and no change to the four class rows of
the `### Model ladder` table.

Work run at a lower class is still reviewed at the verdict roles' declared classes, and the
effective-identity check (`content/commands/st-work.md:368-371`) still applies. The same
`work.test.ts` case pins the no-fallback sentence. The class a build role actually ran at is
checked against the proof block: `judgment: reviewer`.

### Amendments the Prove merge applies to the requirements above

The requirement statements and criteria above are the spec-author's draft of 2026-09-23. The planner's resolutions
(§ Resolved details) change them as follows; the spec-author applies every amendment when merging, then recomputes the
criteria count with `grep -c "^- GIVEN" docs/specs/orchestrator-context.md` and states it beside that command.

- **A1 — per-role write paths (R16).** The statement of REQ-CTX-003 and its policy-document criterion: each verdict row's
  `writePaths` names only its own role's reports (`.stamity/runs/*/reports/*-reviewer-r*.md`, `*-security-r*.md`,
  `*-performance-r*.md`, `*-design-quality-r*.md`); add to the guard criterion that a reviewer `Write` on
  `…/reports/u1-security-r1.md` exits 2.
- **A2 — plugin installs (R17).** REQ-CTX-003 and the parity table: on a Claude Code plugin install (the container hook
  layout) the verdict roles get no `Write` and return in full inline — a declared degradation; add the criterion that
  the Claude adapter renders no `Write` for them when hooks are plugin-owned or `hookScriptsRoot` is set.
- **A3 — the reports ignore rule (R20).** REQ-CTX-004: each run's `reports/` holds a `.gitignore` whose one line is `*`,
  created at Frame and ensured by `stamity ledger append` and `close`; this repository's root rule stays as drafted; add
  the criterion that in a repository whose root `.gitignore` names no reports rule, `git check-ignore -q` on a report
  exits 0 after one `ledger append`.
- **A4 — lens digests (R32).** REQ-CTX-001, 002 and 003 and their criteria: only the reviewer's digest carries the
  labelled `verdict:` and `confidence:` lines; a lens's digest carries `mode:` (posted or advisory) with its posted
  count, and performance's also names whether a declared budget was breached.
- **A5 — the decision-needed token (R24).** The output criterion of REQ-CTX-005: a row carrying `decision_needed: true`
  prints its line with a trailing ` decision-needed`.
- **A6 — the body order (R35).** REQ-CTX-014: the order is Phases 0–3, `## Dispatch contract`, `## Return contract`,
  `## Phase 4 — Prove`, `## Dials`, `## Testing philosophy`; add the criterion that `## Dispatch contract` and
  `## Return contract` both precede `## Phase 4 — Prove` in the emitted body, and keep the 18,000-character criteria.
- **A7 — no client names in shipped bodies (R37).** The body criterion of REQ-CTX-013 reads: "it instructs running
  `stamity ledger status` after a compaction where the client does not re-run its session-start hook" — no client is
  named in `content/`.
- **A8 — the replay's readings (R28, R29, R30, D11).** REQ-CTX-015: a shape whose three scored runs differ by more than
  2 seeds found gets 5; the sub-agent-token bar compares the changed shape's mean per pass with the baseline's mean;
  the loop-character bar binds every changed scored run against the baseline median; a security seed is exempt when at
  least one baseline scored run missed it; the replay runs on the operator's logged-in client folder, and every run
  records the init event's skills, agents, commands, plugins and MCP servers, identical within a shape.
- **A9 — the capacity details (R13).** REQ-LADDER-002: the second stop waits five minutes; a `limit-reset` more than
  12 hours away returns `BLOCKED_DEPENDENCY` naming the reset time. REQ-LADDER-003: the build roles are the implementer,
  the fixer on rounds 1–3, the researcher, the creator and the test-runner; the spec-author holds its class like the
  verdict roles.
- **A10 — the reviewer's pass over an amended cell (R10).** REQ-CTX-010: when the spec-author amends the cell of a unit
  that touches a security trigger path or a shared contract, the reviewer reads the amended cell before that unit is
  dispatched.
- **A11 — no block on a blocked return (R34).** REQ-CTX-002: a `BLOCKED_*` return carries no findings block and writes
  no report.
- **A12 — a refused write (R18).** REQ-CTX-001 and 003: a report write that is refused falls back to the full inline
  return, saying so; the dispatch names the report by its absolute path in the main checkout.
- **A13 — the plan path.** Every `docs/plans/009-<slug>.md` placeholder reads `docs/plans/009-orchestrator-context-economy-01.md`.
- **A15 — the status lines (R2).** The new spec's frontmatter reads `status: design`, not the draft's
  `merged-for-1.10.0` (outside the gate's vocabulary); `docs/specs/model-ladder.md` keeps `status: shipped-with-1.9.0`
  — the draft's status row for it is not applied.
- **A14 — drop the draft's closing sections.** The draft spec's "Risks" and "Concerns" sections are not merged (they
  live in this plan); its References keep the test and source lists.

### The new spec's frame, merged with the requirements above

Its head, context, intent, invariants (with the per-client parity table and the invariant criterion) and references, as drafted; the requirement statements and criteria above take the places marked `## Requirements` and `## Acceptance criteria`.

````markdown
---
id: orchestrator-context
# A design document, authored from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23 and excluded from the site build.
status: merged-for-1.10.0
obsolete_when: every supported client hands a parent a sub-agent's full report by reference and restores a running flow's state after a compaction on its own, or a decision row cuts the surface
---
# Orchestrator context economy

This spec covers what enters the `/st-work` orchestrator's context and what stays on disk.
Full reports stay on disk and the orchestrator gets a digest. A CLI verb writes the findings
ledger. A dispatch points at a plan unit instead of restating it. After a compaction, a card
recomputed from disk re-grounds the run. The requirements are merged to `main` for 1.10.0 and
are not released: `status: merged-for-1.10.0` records that state, and the 1.10.0 release close
moves it to `shipped-with-1.10.0`. No requirement here merged before the replay's quality floor
held (REQ-CTX-015).

Contract numbers (C1–C12) and decision numbers (D1–D10) refer to the shared-contract and
decision sections of `docs/plans/009-orchestrator-context-economy-01.md`. That plan carries the byte shapes. Once a test
named under References exists, it is the normative record for its requirement.

## Context

Every claim about existing behaviour carries a `path:line` from the tree at `fed39ac`.

- Every sub-agent returns "a structured result the orchestrator consumes without re-reading its
  transcript" (`content/commands/st-work.md:399-400`). Nothing bounds that result's size, so a
  full report enters the orchestrator's context once per delivery.
- The ledger is write-ahead JSONL with seven fields and four states
  (`content/commands/st-work.md:241-257`). No engine code writes it. The one engine reader is
  `src/cli/docs/measurements.ts:616`, and the grammar is pinned by
  `test/records/ledgers.test.ts:32-49` (`OPTIONAL_FIELDS = ["retired"]` at `:49`).
- The verdict roles are read-only. On Claude Code the reviewer's `tools:` line is
  `Read, Grep, Glob, Skill` (`.claude/agents/stamity-reviewer.md:4`). The `edit` category
  spans `Edit`, `Write` and `NotebookEdit` together (`src/tools/translator.ts:71`).
- The Claude review gate releases an approved run only when the reviewer's final text carries a
  labelled `verdict:` line (`src/hooks/scripts.ts:1566-1576`).
- An in-flow plan is "persisted nowhere" (`content/commands/st-work.md:52-54`).
- The session-start hook is wired with no matcher (`.claude/settings.json:10-27`), so it runs
  again after a compaction. Its script is built at `src/hooks/scripts.ts:622`.
- After a compaction, Claude Code re-attaches only the first 5,000 tokens of an invoked
  command's body (code.claude.com/docs/en/skills, accessed 2026-09-23).
- A run counts as in progress while its record matches `/^status:.*\bin progress\b/im`
  (`src/cli/docs/measurements.ts:297`).
- Codex receives no touchpoint bodies (`docs/capability-matrix.md:240`).

## Intent

Keep what the orchestrator reads per pass small and constant. Keep every finding reachable
from disk: a lost context or a compaction must not lose a finding or change a review verdict.

## Invariants

1. **The quality floor binds every merge.** No requirement below reaches `main` unless the
   replay's committed comparison shows the C12 floor held for its proposal (REQ-CTX-015). A
   proposal that fails is reworked and re-measured, or dropped. When dropped, its ids are
   retired here with a pointer to the failing result.
2. **Four-client parity, or a declared degradation per client.** The table below is the
   declaration. A cell that is not `yes` is a degradation, stated here rather than discovered.
3. **Never digested, never cut (C4).** The following are returned in full:
   - any `BLOCKED_*` return;
   - a red test-runner return;
   - a researcher return;
   - a verdict-role return on Cursor, GitHub Copilot CLI and Codex.

   The 1,500-character cap binds prose only. A digest never drops a Critical or Warning line,
   a security-relevant finding, or a contract-delta row to meet it.
4. **No name or row id from outside this repository** appears in this spec or in any artifact
   these requirements commit. The leak gate is the check.

| Requirement | Claude Code | Cursor | GitHub Copilot CLI | Codex |
|---|---|---|---|---|
| 001, 002 two-tier returns | yes | yes | yes | yes in the agent definitions; no `/st-work` body is emitted (`docs/capability-matrix.md:240`) |
| 003 verdict-role report write | yes | degraded: full inline return, disclosure line | degraded: full inline return, disclosure line | degraded: full inline return, disclosure line |
| 004 report naming | yes | yes | yes | yes |
| 005–008 ledger verb, fields, fixer, closures | yes | yes | yes | verb yes; the body-carried steps have no carrier |
| 009–012 dispatch, amendment, implementer return, record head | yes | yes | yes | agent-definition parts yes; body-carried parts have no carrier |
| 013 resume card | hook after compaction, and the verb | the verb, run by hand after a compaction summary | the verb, run by hand after a compaction summary | hook after compaction, and the verb |
| 014 body order | yes | not applicable: no documented body re-attachment | not applicable: no documented body re-attachment | not applicable: no body emitted |
| 015 replay | measured | `not-run`, with reason | `not-run`, with reason | `not-run`, with reason |

## References

- `docs/plans/009-orchestrator-context-economy-01.md`: the shared contracts C1–C12 and decisions D1–D10.
- `test`: `test/records/ledgers.test.ts` (ledger grammar); `test/corpus/commands/work.test.ts`
  (body cap, dispatch contract, the new order case); `test/hooks/scripts.test.ts` (guard,
  session-start card); `test/evals/locators.test.ts` (moved cited ranges).
- `source`: `content/commands/st-work.md`; `content/agents/stamity-{implementer,fixer,spec-author,test-runner,reviewer,security,performance,design-quality}.md`;
  `src/roster/agentPolicies.ts`; `src/tools/allowlist.ts`; `src/tools/translator.ts`;
  `src/hooks/scripts.ts`; `src/cli/commands/learn.ts` (the hidden-verb precedent).
- `evals/replay/REPLAY-v1.md`: the replay's protocol and thresholds.

## Requirements

(the statements above, in order, after this intro)

Each requirement is listed with the proposal it belongs to. REQ-CTX-015 decides merges per
proposal:

- P1: 001–004
- P2: 005–007
- P3: 008
- P4: 009–011
- P7: 012–013
- P8: 014

## Acceptance criteria

One set per requirement, plus one for the invariants. There are eighty-three criteria. Each is
machine-checkable unless tagged `judgment:`. `grep -c "^- GIVEN" docs/specs/orchestrator-context.md`
is how the count was derived. Run it again whenever this section grows; do not count by eye.

**Invariants**

- GIVEN the tree carrying this spec, the replay's committed artifacts and the emission
  `stamity sync` produces from this change WHEN `npm run gate` runs THEN it exits 0.

(then the criteria above, one block per requirement)
````

### The model-ladder spec's frame lines

#### Current lines that change, and their replacements

| Line(s) | Current text | Replacement |
|---|---|---|
| 3 | `# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17 and excluded from the site build.` | `# A design document, authored from docs/plans/008-plugin-lifecycle-02.md on 2026-09-17, extended from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23, and excluded from the site build.` |
| 4 | `status: shipped-with-1.9.0` | `status: merged-for-1.10.0` (alternative in open detail 2) |
| 5 | `obsolete_when: every supported client publishes one effort scale the ladder can name without a per-client table, or a decision row cuts the surface` | `obsolete_when: every supported client publishes one effort scale the ladder can name without a per-client table and resumes, waits out and reports a sub-agent's capacity stop on its own, or a decision row cuts the surface` |
| 9 | `The effort axis of the model ladder (\`src/roster/modelLadder.ts\`). The three-level band` | `Two axes of the model ladder. The first is effort (\`src/roster/modelLadder.ts\`). The three-level band` |
| after 13 | (new paragraph) | see below |
| 17–18 | `Let an operator ask for any effort level a selected client documents, refuse at configuration` / `time what a selected client cannot express, and never downgrade silently.` | `Let an operator ask for any effort level a selected client documents, refuse at configuration` / `time what a selected client cannot express, and never downgrade silently — neither an effort` / `level nor, when a model runs out of capacity, a verdict role's class.` |

The new paragraph after line 13 (lines 10–13 are unchanged):

```markdown
The second axis is capacity, added on 2026-09-23 from `docs/plans/009-orchestrator-context-economy-01.md`
(REQ-LADDER-002, REQ-LADDER-003). It covers what the flow does when a sub-agent stops
because a model is out of capacity, not because its work failed. The failure ladder
(`content/commands/st-work.md:331-335`) reads any stop as a failed sub-agent: its first rung
re-briefs the agent, and its second reassigns the work to a stronger class. Under a limit on
one model, that stronger class is the one already out of capacity. REQ-LADDER-001 shipped with
1.9.0. REQ-LADDER-002 and REQ-LADDER-003 are merged for 1.10.0 and not released; the 1.10.0
close moves `status` to `shipped-with-1.10.0`.
```

The Invariants (lines 22–27) are unchanged. "Class defaults do not move" still holds, because neither requirement changes a class or `src/roster/modelLadder.ts`.

References (after line 65), two new lines:

```markdown
- `docs/plans/009-orchestrator-context-economy-01.md` — the capacity rung and the no-downgrade rule (REQ-LADDER-002, REQ-LADDER-003).
- `content/commands/st-work.md` — the Dispatch contract's capacity bullet, after "Findings ledger".
```

---

## Units

Eight engine units. Their order and the lanes they share with files 2 and 3 are in § Execution order.

### ctx-records-gate — the records gate admits `report` and `decision_needed`; reports are git-ignored

| Field | Content |
|---|---|
| `id` | ctx-records-gate |
| `requirements` | REQ-CTX-006, REQ-CTX-004 |
| `files` | `test/records/ledgers.test.ts`, `.gitignore` |
| `interfaces` | `OPTIONAL_FIELDS = ["retired", "report", "decision_needed"] as const`. In `parseLedger`: the required-string check stays on the seven fields; `retired` stays a string. `report`, when present, must be a string equal to `<run dir>/reports/<name>`, where `<run dir>` is `ledgerPath` minus `/ledger.jsonl` and `<name>` matches `/^[^/\\]+\.md$/`; otherwise the problem is `` `${at}: \`report\` is a POSIX path inside this run's reports/ folder` ``. `decision_needed`, when present, must be exactly `true`; otherwise the problem is `` `${at}: \`decision_needed\` is present only as true` ``. No existence check on `report`: the folder is git-ignored, so CI never has the file. `LedgerRow` is unchanged. `.gitignore`, after the review-gate lines: the comment `# A run's full role reports stay local; the ledger row carries the path (C1).` and then `/.stamity/runs/*/reports/`, `/.stamity/runs/*/ledger.jsonl.lock`, `/.stamity/runs/*/ledger.jsonl.tmp.*` (the lock and temp names come from `atomicWrite.ts:381` and `:1115`). A new `describe("the reports folder")` runs `git check-ignore -q` through the file's existing `execFileSync` |
| `testCriteria` | Fixture (h): a row with `report: ".stamity/runs/fixture/reports/u1-reviewer-r1.md"` and `decision_needed: true` parses with no problems. (i) `decision_needed: false` fails with "present only as true". (j) `decision_needed: "true"` fails the same way. (k) `report` under `.stamity/runs/other/reports/x.md` fails. (l) `report` spelled with a backslash fails. (m) `report: ""` fails. The tree cases stay green unedited. `git check-ignore -q .stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md` exits 0; the same for `.stamity/runs/2026-09-23_demo/ledger.jsonl` exits 1 |
| `edgeCases` | A legacy row carrying neither field parses unchanged. A row carrying `retired` and `report` together parses |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### ctx-hook-card — the resume card in the session-start hook (Claude Code, Codex)

| Field | Content |
|---|---|
| `id` | ctx-hook-card |
| `requirements` | REQ-CTX-013, REQ-CTX-012 |
| `files` | Hand-written: `src/runs/layout.ts` (new), `src/runs/cardSource.ts` (new), `src/hooks/scripts.ts` (the session-start builder only), `src/composition/root.ts` (a `runs` group with `layout` and `cardSource`), `test/architecture/boundaries.test.ts` (two `PLAN_MAP` rows), `.oxlintrc.json` (`"**/runs/**"` in the `src/types/**` deny-list and in the kernel deny-list), `test/hooks/sessionStartCard.test.ts` (new). Regenerated, not hand-written: `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` (both via `npx vitest run -u` on those two files; the diff is limited to the session-start body), `.stamity/generated/hooks/claude/stamity-session-start.mjs`, `.stamity/manifest.json` (both via `npm run build && node dist/cli.js sync`) |
| `interfaces` | **`src/runs/layout.ts`** (wave 1; imports only `STATE_DIR` from `src/types/markers.ts`): `export const RUNS_SEGMENTS: readonly [string, string] = [STATE_DIR, "runs"]` · `export const RUN_ID_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$/` · `export const REPORTS_DIR = "reports"`, `LEDGER_FILE = "ledger.jsonl"`, `RECORD_FILE = "record.md"` · `export const REPORT_ROLES = ["implementer","fixer","reviewer","security","performance","design-quality","test-runner","spec-author"] as const` · `export const REPORT_NAME_PATTERN: RegExp`, built from `REPORT_ROLES` as `/^(?!(?:report\|summary\|findings\|analysis))[a-z0-9][a-z0-9-]*-(?:<roles joined by \|>)-r[1-9][0-9]*\.md$/` · `export const FINDINGS_FENCE = "stamity-findings"`, `CLOSURES_FENCE = "stamity-closures"` · `export function fenceOpenPattern(info: string): RegExp` returning `new RegExp("^ {0,3}```" + info + "[ \\t]*$")` · `export const FENCE_CLOSE_PATTERN = /^ {0,3}```[ \t]*$/` · `export const RECORD_STATUS_PATTERN = /^status:\s*(.*)$/i`, `RECORD_PLAN_PATTERN = /^plan:\s*(.+)$/i`, `RECORD_INVOCATION_PATTERN = /^invocation:\s*(.+)$/i`, `IN_PROGRESS_PATTERN = /\bin progress\b/i` · `export const RECORD_HEAD_LINES = 15`, `RECORD_HEAD_READ_BYTES = 65_536`, `REPORT_READ_MAX_BYTES = 1_048_576`, `CARD_MAX_CHARS = 2_000`, `CARD_LIST_MAX = 10`, `CARD_FIELD_MAX = 200` · `export const CARD_RECOVERY_NOTE = "the ledger is the recovery point"`, `CARD_NEXT_LINE = "next: read the open rows and the listed reports before dispatching anything"`, `CARD_NOT_RECORDED = "(not recorded)"` · `export function isRunId(value: string): boolean` · `export function runRelPath(runId: string, ...segments: string[]): string`, which returns the POSIX literal `.stamity/runs/<runId>/<segments joined by />` and throws `EngineError` with code `VALIDATION_ERROR` on a non-run-id. **`src/runs/cardSource.ts`** (wave 2): `export const RESUME_CARD_HOST_NAMES: { readonly fs: readonly string[]; readonly path: readonly string[] }` = fs `closeSync, lstatSync, openSync, readFileSync, readSync, readdirSync`; path `dirname, isAbsolute, join, resolve` · `export function buildResumeCardSource(): string` returns plain JS (no imports) that declares `function resumeCardLines(rootDir, stateRoot, nowMs)` → `string[] \| null`. It needs `screenHit` from its host and embeds every `layout.ts` constant through `JSON.stringify` (regexes as source plus flags). **The normative algorithm, shared by both twins:** S1 — list `join(stateRoot,"runs")` with `withFileTypes`; keep entries where `isDirectory()` (a symbolic link is not one) and `RUN_ID_PATTERN` matches. For each, read `record.md` only when `lstat` says regular file: at most 65,536 bytes, BOM stripped, first 15 lines split on `/\r?\n/`. The head is: the first `RECORD_STATUS_PATTERN` line (in progress when `IN_PROGRESS_PATTERN` matches it), the first plan line, the first invocation line. The chosen run is the greatest in-progress name by code-unit order; none means return `null`. S2 — `ledger.jsonl`, only when `lstat` says regular file: split `/\r?\n/`, skip blanks, `JSON.parse` in try. For each object row: a string `id` with `state === "open"` goes to the open ids (file order); a string `report` goes to the ledgered set. Unparseable lines are skipped. S3 — `reports/` entries where `isFile()` and the name ends `.md`, sorted by code unit; rel = `.stamity/runs/<run>/reports/<name>`. Skip rel when it is in the ledgered set. List it when size > 1,048,576. Otherwise list it when the first `fenceOpenPattern(FINDINGS_FENCE)` line is followed, before a `FENCE_CLOSE_PATTERN` line or EOF, by at least one non-blank line. S4 — lanes: `lstat(join(rootDir,".git"))`. A directory is the common dir. A regular file holding `gitdir: X` gives `g` = X (resolved against rootDir when relative), and the common dir is `resolve(g, <commondir content>)` when `g/commondir` exists, else `g`. Anything else means no lanes. For each directory under `<common>/worktrees/` (sorted): `gitdir` trimmed, resolved against the admin dir when relative, a trailing `/.git` or `\.git` stripped, `\` → `/`. `HEAD` trimmed: `ref: refs/heads/<b>` gives `<b>`; another `ref: <r>` gives `<r>`; a 40- or 64-hex value gives `detached <first 7>`; missing gives `unknown`. The entry is `<path> [<branch>]`; an entry with no `gitdir` file is skipped; entries are sorted by string. Only linked worktrees count as lanes. S5 — `flat(v)`: `/[\u0000-\u001f\u007f]+/g` → space, collapse whitespace, trim; over 200 characters becomes the first 199 plus `…`. An empty plan or invocation prints `(not recorded)`. S6 — `list(items, k)`: `n = 0` gives `""`; otherwise `" (" + [...first k flattened, n > k ? "… +" + (n-k) + " more" : absent].join(", ") + ")"`. S7 — lines: `stamity resume card — run <run> (as of <new Date(nowMs).toISOString().slice(0,16)>Z)` · `plan: <plan>  ·  invocation: <invocation>` · `ledger: <n> open rows<list>  ·  the ledger is the recovery point` · `reports without a ledger row: <n><list>` · `lanes: <n><list>` · `next: read the open rows and the listed reports before dispatching anything`. For k = 10 down to 0, return the first rendering whose `join("\n")` length is ≤ 2,000; k = 0 always fits. S8 — `hit = screenHit(lines.join("\n"))`; a non-empty hit returns the single line `stamity resume card — run <run> withheld: its text matched screen pattern <hit>; the ledger is the recovery point`. **`src/hooks/scripts.ts`:** `export const SESSION_START_SCREEN` (it was module-private). The session-start body gains `READ_STDIN`, `READ_FIELD` and `function screenHit(raw)`: the existing loop over the raw, invisible-stripped and `normalizeForScreen` copies, returning the first `entry.id` in `SCREEN` order or `""`. `screened(raw)` becomes `screenHit(raw) !== ""`. The body also gains the card source and `const SOURCE = process.stdin.isTTY ? "" : field(readPayload(), ["source"]);`, and its final write becomes `const lines = render(); if (SOURCE === "compact") { const card = resumeCardLines(repoRoot(), STATE_ROOT, NOW); if (card !== null) lines.push("", ...card); } process.stdout.write(lines.join("\n") + "\n");`. `RESUME_CARD_HOST_NAMES` merge into the `node:fs` and `node:path` import lines through `namedImport`. The header summary gains "After a compaction (a start whose stdin payload says source "compact") it appends the resume card of the run in progress: counts and pointers, never finding text." The posture line gains "and the source field of the stdin payload" and keeps "the wall clock". Not changed: `planCoreHookScripts`, `CLIENT_EXTENSION_EVENTS`, any hook event (so the review-gate trap at `src/adapters/claude.ts:245-247` stays untouched). **Registry and map:** `root.ts` adds `import * as runsLayout from "../runs/layout.ts"` and `import * as runsCardSource from "../runs/cardSource.ts"`, the type `readonly runs: { readonly layout: typeof runsLayout; readonly cardSource: typeof runsCardSource }`, and the value `runs: { layout: runsLayout, cardSource: runsCardSource }`. `PLAN_MAP` adds `"src/runs/layout.ts": { unit: "ctx-hook-card", wave: 1 }` and `"src/runs/cardSource.ts": { unit: "ctx-hook-card", wave: 2 }` |
| `testCriteria` | Every case uses a `useTempDir` repo, the script placed at `.stamity/generated/hooks/claude/stamity-session-start.mjs` and run through `spawnSync(process.execPath,[file],{input})`. (a) Stdin `{"source":"startup"}` with a run in progress gives stdout byte-identical to stdin `""` on the same fixture. (b) `{"source":"compact"}` with no `.stamity/runs/` is byte-identical to (a). (c) `{"source":"compact"}` with run `2026-09-23_demo`: `Status: in progress` on line 3, `Plan: docs/plans/009-x.md`, `Invocation: /st-work docs/plans/009-x.md`; a ledger with `review/1` and `review/2` open and `review/3` fixed, the fixed row carrying `report` `.stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md`; reports `u1-reviewer-r1.md` (ledgered), `u2-reviewer-r1.md` (one finding line), `u3-reviewer-r1.md` (empty block); one synthesized lane `.git/worktrees/lane-a/{gitdir,HEAD}` on `ref: refs/heads/lane/a`. Stdout ends with one blank line and exactly these lines: `stamity resume card — run 2026-09-23_demo (as of <m>)`, `plan: docs/plans/009-x.md  ·  invocation: /st-work docs/plans/009-x.md`, `ledger: 2 open rows (2026-09-23_demo/review/1, 2026-09-23_demo/review/2)  ·  the ledger is the recovery point`, `reports without a ledger row: 1 (.stamity/runs/2026-09-23_demo/reports/u2-reviewer-r1.md)`, `lanes: 1 (<lane path> [lane/a])`, `next: read the open rows and the listed reports before dispatching anything`, with `<m>` matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/`. (d) The Status line on line 16 gives no card. (e) Two runs in progress: the card names the greater name. (f) An Invocation line carrying an instruction-override phrase gives exactly one `withheld:` line whose pattern id is in `SESSION_START_SCREEN_PATTERN_IDS`, and the phrase is absent from stdout. (g) 25 open rows, 25 unledgered reports, 25 lanes and a 300-character plan: the card is ≤ 2,000 characters, the three counts read 25, and every list ends `… +<m> more`. (h) `buildPortableHookRunner("codex")` running the script for a `session_start` row with payload `{"source":"compact"}` prints the card on raw stdout. (i) The existing four-client syntax, no-network, no-`child_process` and posture cases in `test/hooks/scripts.test.ts` stay green unedited. (j) A second `node dist/cli.js sync` moves no file |
| `edgeCases` | Stdin is a TTY (a person runs the script): no read, no card, no hang. `2026-09-09_release-1.3.0` fails `RUN_ID_PATTERN` and is ignored, never an error. A symlinked run folder, record, ledger or report is skipped, not followed. An unparseable ledger line is skipped and the rows around it still count. A report over 1 MiB with no ledger row is listed, because its findings cannot be ruled out. The hook running in a linked worktree (`.git` is a file) reaches the common dir through `commondir`. Cursor never sends a `source`, and Copilot's `source` is never `compact`, so their banner is byte-unchanged |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm run knip && npm run test -- --coverage` |

### c8a-write-paths-data — the `writePaths` field: roster to policy document to resolver (inert)

**Confidence:** high. **Basis:** direct, from the cited lines.

| Field | Content |
|---|---|
| `id` | c8a-write-paths-data |
| `requirements` | REQ-CTX-003 |
| `files` | `src/roster/agentPolicies.ts`, `src/tools/allowlist.ts`, `src/roster/agentGrants.ts`, `test/roster/agentPolicies.test.ts`, `test/tools/allowlist.test.ts`, `test/roster/agentGrants.test.ts`, `test/corpus/agents/specialists.test.ts`, `test/corpus/hookWiring.test.ts`. Regenerated: `.stamity/generated/agent-tool-policies.json`, `.stamity/manifest.json`, `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` (the policy-document entry at :4007), `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (residue documents :3/:1415/:1698/:2417/:2697 and digests :1196/:1609/:2339/:2607/:3135) |
| `interfaces` | **`src/roster/agentPolicies.ts`** (a data module with no imports). `AgentPolicyRow` (:81-94) gains `readonly writePaths?: readonly string[];`. Its doc says: the repo-relative patterns this agent may create or overwrite with the client's single-file `Write` tool only (never `Edit`, `NotebookEdit` or the `edit` category); honoured only by the generated Claude Code guard in the repository layout; ignored by every other reader, so an unaware reader denies. Add `export function verdictReportWritePaths(role: "reviewer" \| "security" \| "performance" \| "design-quality"): readonly string[]` returning `[\`.stamity/runs/*/reports/*-${role}-r*.md\`]` — one pattern per role, so no verdict role can create or overwrite another role's report (plan resolution R16) — and set `writePaths: verdictReportWritePaths("<role>")` on the four rows: `stamity-reviewer` (:115-120), `stamity-security` (:145-150), `stamity-design-quality` (:151-156) and `stamity-performance` (:157-162). `allow` stays `["read"]` on all four. Each of the four rationales gets its own short clause saying the one write it holds is its report file (see edge cases for the size and overlap limits). The security rationale's "No write grant:" (:149) becomes "No code write grant:". **`src/tools/allowlist.ts`**: `AgentToolPolicy` (:77-97) gains `writePaths?: readonly string[]`, documented as read only by the generated guard and never by `checkToolAccess`. `export function isWritePathPattern(value: unknown): value is string` returns true only for a string of 1–200 characters that splits on `/` into 1–16 segments, where every segment is non-empty, is not `.` or `..`, and matches `/^[A-Za-z0-9._*-]+$/`. No `\`, no leading `/`, no drive letter, no `**` segment; `*` matches within one segment and may appear more than once. `EmittedPolicy` (:405-411) and `emittedRow` (:437-450) emit `writePaths` as the deduplicated, code-unit-sorted valid patterns. The key sits after `denyTools` and before `rationale`, and is omitted when empty, so rows without it stay byte-identical. `validateToolPolicies` (:338-401) adds two issues. (a) Each invalid pattern: `Agent "<id>" declares write path "<p>", which is not a repo-relative pattern (segments of letters, digits, ".", "_", "-" and "*", no "." or ".." segment); the emitter drops it.` (b) `writePaths` on a row whose `allow` holds `edit`: `Agent "<id>" holds "edit", so its write paths scope nothing — the guard admits every write through the category first. Drop one.` The `AGENT_TOOL_POLICIES_SCHEMA` doc (:136-143) gains a skew paragraph: an older reader ignores `writePaths` and denies `Write` through the category (fail-closed); the literal stays `"stamity/agent-tool-policies/v1"`. **`src/roster/agentGrants.ts`**: `ResolvedAgentGrant` (:54-63) gains `readonly writePaths?: readonly string[]`, documented as roster-only and never derived from frontmatter. The roster branch (:353) returns `{ runtimeId, allow: row.allow, source: "roster", diagnostics, ...(row.writePaths !== undefined && row.writePaths.length > 0 ? { writePaths: row.writePaths } : {}) }`. The frontmatter branch never sets it. If the frontmatter has its own `writePaths` key, push the diagnostic `note("declares \`writePaths:\`, which no frontmatter can grant — write paths come from the core roster only; ignored.")`. **No change needed** at `src/emit/hooksInfra.ts:405-412`: the roster rows pass through structurally, and pack rows built at :348-356 carry no `writePaths`. |
| `testCriteria` | **Red first:** the emitted document (`buildAgentToolPoliciesJson(AGENT_POLICY_ROSTER)`) has on exactly the four verdict ids, and on no other row, `writePaths` naming only that row's own role — `stamity-reviewer` `[".stamity/runs/*/reports/*-reviewer-r*.md"]`, `stamity-security` `[".stamity/runs/*/reports/*-security-r*.md"]`, `stamity-performance` `[".stamity/runs/*/reports/*-performance-r*.md"]`, `stamity-design-quality` `[".stamity/runs/*/reports/*-design-quality-r*.md"]`. Add this to hookWiring's "carries every grant…" case (:256-273) and to the `EmittedPolicy` interface (:106-111). Those four rows' `allow` stays exactly `["read"]`, which is what an older guard decides on. `AGENT_TOOL_POLICIES_SCHEMA` stays `…/v1` (already pinned at hookWiring.test.ts:240). `validateToolPolicies(AGENT_POLICY_ROSTER)` still returns `[]` (agentPolicies.test.ts:161). `validateToolPolicies` reports each of `"../x.md"`, `"/abs/*.md"`, `"a\\b.md"`, `"**/x.md"`, `""` and `"a//b"`, and the emitter drops all of them. A row with `allow:["read","edit"]` plus `writePaths` reports the inert-scope issue. The serializer is byte-stable across reordered `writePaths` and duplicates. A roster without `writePaths` serializes to the same bytes as before the change (compare against a literal of today's reviewer row). `resolveAgentGrant({runtimeId:"stamity-reviewer", frontmatter:{}})` has `writePaths` equal to the row's. A pack agent whose frontmatter claims `writePaths` resolves without it and with the diagnostic. A pack file shipped under `stamity-reviewer` resolves to the roster row, `writePaths` included. Add new cases to `specialists.test.ts` next to :214-241, and to `agentPolicies.test.ts` next to :186-203: "holds exactly the report write path and no edit category". The existing "read-only" cases stay unedited and green. |
| `edgeCases` | **Rationale overlap:** the rationale-overlap gate (agentPolicies.test.ts:226-237, Jaccard below 0.4) fails if all four rows get the same added sentence, so word each clause differently. **Document size:** today it is about 3.9 KB. The size pin (scripts.test.ts:241-247, under 5,000 bytes, ratio 50–90) allows about 1,000 bytes more; `writePaths` adds about 250, so each rationale clause must stay under about 150 characters. **Leftover key on deletion:** a verdict row whose `writePaths` is later deleted drops the key entirely (no `[]`). |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run -u test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts` (read the diff: only the policy document and its digests move), then `npm run lint && npm run typecheck && npm run test -- --coverage` |

### ctx-ledger-append — `stamity ledger append`, the store, and the lock

| Field | Content |
|---|---|
| `id` | ctx-ledger-append |
| `requirements` | REQ-CTX-005, REQ-CTX-006, REQ-CTX-004 |
| `files` | `src/runs/blocks.ts` (new), `src/runs/ledgerStore.ts` (new), `src/cli/commands/ledger.ts` (new), `src/cli.ts`, `src/composition/root.ts`, `test/architecture/boundaries.test.ts`, `test/cli/surface.e2e.test.ts`, `test/runs/ledgerAppend.test.ts` (new; engine and in-process CLI cases). Regenerated: `docs/cli-reference.md` (`node scripts/generate-docs.mjs`; byte-compared at `test/cli/docs/cliReference.test.ts:90-92`) |
| `interfaces` | **`src/runs/blocks.ts`** (wave 2): `export type FindingSeverity = "Critical" \| "Warning" \| "Minor"` · `export interface Finding { readonly id: string; readonly severity: FindingSeverity; readonly locator: string; readonly summary: string; readonly decisionNeeded: boolean; readonly security: boolean; readonly line: number }` · `export interface BlockProblem { readonly line: number; readonly message: string }` (1-based physical line; 0 means the whole text) · `export type BlockParse<T> = { readonly ok: true; readonly items: readonly T[] } \| { readonly ok: false; readonly problems: readonly BlockProblem[] }` · `export const FINDING_TEXT_MAX = 300` · `export function parseFindingsBlock(text: string): BlockParse<Finding>`. Rules: exactly one `fenceOpenPattern(FINDINGS_FENCE)` line. None gives `{0,"no stamity-findings block"}`. A second gives `{<line>,"a second stamity-findings block (the first opens at line <n>); a report carries exactly one"}`. No closing `FENCE_CLOSE_PATTERN` line gives `{<open line>,"the stamity-findings block opened here is never closed"}`. Each non-blank inner line is one JSON object: keys ⊆ `id, severity, locator, summary, decision_needed, security`; the first four required strings; `id` matches `/^([CWM])-[1-9][0-9]*$/` and its letter equals the severity's initial; `locator` and `summary` non-empty after trim, carrying no `\r`/`\n`, ≤ 300 characters; `decision_needed` and `security` booleans when present; ids unique. Every problem is collected, not just the first. Messages: `not JSON (<parser message>)` · `not a JSON object` · `missing "<key>"` · `unknown key "<key>"` · `severity "<v>" is not Critical, Warning or Minor` · `id "<v>" is not C-<n>, W-<n> or M-<n>` · `id "<v>" does not match severity <s>` · `<key> is empty` · `<key> spans more than one line` · `<key> is over 300 characters` · `<key> is not a boolean` · `id "<v>" repeats line <m>`. **`src/runs/ledgerStore.ts`** (wave 4): `export interface LedgerRow { readonly id: string; readonly phase: string; readonly source: string; readonly severity: string; readonly evidence: string; readonly state: string; readonly rationale: string; readonly retired?: string; readonly report?: string; readonly decision_needed?: true }` · `export interface ParsedLedger { readonly lines: readonly string[]; readonly eol: "\n" \| "\r\n"; readonly rows: ReadonlyMap<number, LedgerRow>; readonly unreadable: readonly number[] }` · `export function parseLedgerText(text: string): ParsedLedger` (rows keyed by 0-based line; `unreadable` = 1-based lines that are non-blank but not an object with a string `id`; `eol` is CRLF when the first line ends `\r\n`) · `export const LEDGER_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/` · `export function runDir(rootDir: string, runId: string): string` · `export async function requireRunDir(rootDir: string, runId: string): Promise<string>` (missing or symlinked throws `EngineError VALIDATION_ERROR` `there is no run folder .stamity/runs/<id>/`) · `export interface ResolvedReport { readonly absolute: string; readonly relative: string; readonly text: string }` · `export async function resolveReportPath(rootDir: string, runId: string, given: string): Promise<ResolvedReport>`. Refusals are `EngineError VALIDATION_ERROR` `--report <given> is not a report of run <id>: <reason>`, where the reason is one of: `it has a ".." segment` (split on `/[\\/]+/`); `it is not directly inside .stamity/runs/<id>/reports/` (`relative(expected, resolved)` must be a single segment, non-empty and non-absolute); `its name is not <pass>-<role>-r<N>.md (a name starting report, summary, findings or analysis is refused by Claude Code)`; `<segment> is a symbolic link` (`lstat` of each of `.stamity`, `runs`, `<id>`, `reports`, `<name>` under rootDir); `it does not exist`; `it is not a regular file`; `it is over 1048576 bytes`. `relative` is the POSIX literal `runRelPath(runId,"reports",name)`. · `export function nextRowNumber(rows: Iterable<{ readonly id: string }>, runId: string, phase: string): number`: numeric max of `N` over ids matching `^<escaped runId>/<escaped phase>/([1-9][0-9]*)$`, plus 1; 1 when none match (numeric, not lexical: `review/10` beats `review/9`). · `export interface AppendedRow { readonly ledgerId: string; readonly severity: FindingSeverity; readonly localId: string; readonly decisionNeeded: boolean }` · `export interface AppendResult { readonly ledger: string; readonly rows: readonly AppendedRow[]; readonly unreadableLines: readonly number[] }` · `export async function appendFindings(req: { readonly rootDir: string; readonly runId: string; readonly phase: string; readonly source: string; readonly findings: readonly Finding[]; readonly report: string \| null; readonly dryRun: boolean }): Promise<AppendResult>`. Semantics: first, `ensureReportsIgnore(rootDir, runId)` (exported) makes sure `.stamity/runs/<run>/reports/.gitignore` exists holding exactly `*\n` — created when absent, left as it is when present, never followed through a symlink — so a consumer repository never commits a report whatever its root `.gitignore` says (plan resolution R20; `close` calls it too). Then: zero findings takes no lock, touches no other file and returns `rows: []`. Otherwise, under `acquireWriteLock(<run>/ledger.jsonl, <run dir>)`: read (ENOENT reads as empty). When `report` is not null and a row already carries it, throw `VALIDATION_ERROR` `ledger append refused <report>: the ledger already carries rows from this report (<ids>)`. Build each row in block order as `JSON.stringify({ id: "<run>/<phase>/<n>", phase, source, severity, evidence: "<locator> — <summary>", state: "open", rationale: "", ...(report ? { report } : {}), ...(decisionNeeded ? { decision_needed: true } : {}) })`; `security` is not stored. The new text is the existing bytes unchanged (a missing final EOL added), then the rows joined with the file's EOL, then an EOL. Unless `dryRun`, write it through `atomicWriteFileUnlocked(path, text, { boundaryDir: runDir })`; release in `finally`. Lock semantics: `ledger.jsonl.lock` is a directory created by an exclusive mkdir. It counts as stale after 15 s (`STAMITY_LOCK_STALE_MS` raises it, floor 2 s), and a holder refreshes it every min(stale/3, 3 s). Contention retries 5 times, 100 → 1,500 ms (about 3 s), then `LOCK_TIMEOUT`; in-process callers queue up to 5 s. **`src/cli/commands/ledger.ts`** (wave 14): `export const ledgerCommand: CommandModule` = `{ name: "ledger", summary: "append findings to a run's ledger through one serialized writer (plumbing)", hidden: true, mutating: true }`. `configure` adds `new Argument("<subcommand>", "which ledger action to run").choices(["append"])`, `--run <run-id>` ("the run folder's name under .stamity/runs/"), `--phase <phase>`, `--source <role>`, `--report <path>` ("a report inside the run's reports/ folder"), `--stdin` ("read the findings block from stdin"). `run` for append, in this order: (1) no `.stamity/` gives `CliFailure VALIDATION_ERROR` `this repo is not initialised — there is no .stamity/ directory to write a ledger row into`, next `run: ${packageCommand("init")}`. (2) A missing flag gives `ledger append needs --run\|--phase\|--source`, why `<flag> is required by append and unused by the other subcommands, so it is checked here rather than by the argument parser`. (3) `ledger: --run "<v>" is not a run id (YYYY-MM-DD_<lowercase-slug>)`. (4) `ledger: --phase\|--source "<v>" is not a lowercase slug ([a-z][a-z0-9-]*)`. (5) `ledger append takes exactly one of --report and --stdin`. (6) `requireRunDir`. (7) Source text from `resolveReportPath`, or from stdin read to EOF under `ctx.engine.guard.promptGuard.MAX_USER_CONTENT_LENGTH` (a TTY reads as `""`). (8) A parse refusal returns `{ exitCode: 1, json: { error, problems } }`, with stderr `<src>:<line>: <message>` per problem under the message `ledger append refused <src>` (`<src>` = the relative report path or `stdin`). (9) Stdout prints one line per row, `<ledger-id> <severity> <report-local id>`, with a trailing ` decision-needed` token on the line of a row carrying `decision_needed: true` (plan resolution R24). Zero rows print `ledger append: no findings in <src>; nothing appended`. A dry run adds a final `Dry run: <n> row(s) would be appended to <ledger>. Nothing was written.` Each unreadable line prints stderr `warning: <ledger> line <n> is not a ledger row; it was left as it is`. When `isCrossProcessLockingEnabled()` is false, stderr says `warning: cross-process locking is off (STAMITY_LOCK=0); concurrent appends are not serialized`. JSON is `{ run, ledger, source, rows, dryRun }`. Exit codes: 0 appended or nothing to append; 1 refusal, `FS_ERROR` or `LOCK_TIMEOUT`; 2 usage (commander). **Wiring:** `src/cli.ts` imports `ledgerCommand`, appends it after `handoffCommand`, and rewrites the comments at `:29` ("thirteen CommandModules") and `:45-46` ("plus `learn`, `handoff` and `ledger`, the three hidden plumbing verbs. Ten advertised, thirteen registered."). `root.ts` gains `runs.blocks` and `runs.ledgerStore`. `PLAN_MAP` gains `"src/runs/blocks.ts": { unit: "ctx-ledger-append", wave: 2 }`, `"src/runs/ledgerStore.ts": { unit: "ctx-ledger-append", wave: 4 }`, `"src/cli/commands/ledger.ts": { unit: "ctx-ledger-append", wave: 14 }`. `surface.e2e.test.ts` gets `HIDDEN = ["learn","handoff","ledger"]`; the name and `toBe(12)` become 13 ("the hidden three last"); `--help` asserts `not.toMatch(/^ {2}ledger\b/m)`; the exit matrix gains `["ledger without its subcommand is a usage error", ["ledger"], 2, "run stamity ledger --help"]` and `["ledger append refuses uninitialised", ["ledger","append","--run","2026-09-23_x","--phase","build","--source","reviewer","--stdin"], 1, npxCommand("init")]` |
| `testCriteria` | `ensureReportsIgnore` creates `reports/.gitignore` holding exactly `*\n` in a run folder that has no `reports/`, leaves an existing one byte-identical, and refuses a symlinked `reports/` (the last `skipIf(process.platform === "win32")`); `git check-ignore -q .stamity/runs/<run>/reports/u1-reviewer-r1.md` exits 0 in a fixture repo whose root `.gitignore` names no reports rule. A finding with `"decision_needed":true` prints its row line ending ` decision-needed`; one without prints no token. A report with one C, one W and one M finding appends `<run>/review/1..3`, printing `…/review/1 Critical C-1` and so on. With existing rows `review/9`, `review/10` and `build/40`, the next review id is `review/11`. The pre-existing bytes (including rows spelled with `", "` spacing) are byte-identical after the append, and a file without a final newline gains exactly one. Each row's keys are, in order, `id, phase, source, severity, evidence, state, rationale[, report][, decision_needed]`: `decision_needed:false` is absent, `security` is never stored, and `report` is POSIX. A block with one bad line among good ones exits 1, names every bad line as `<src>:<line>`, and leaves the ledger byte-unchanged. No block, two blocks and an unclosed block are each refused. An empty block exits 0 and does not create `ledger.jsonl`. `--report` refusals: `..`, a file outside the run, `report-reviewer-r1.md`, `notes.md`, a symlinked leaf and a symlinked `reports/` (the last two `skipIf(process.platform === "win32")`). A `--stdin` append carries no `report`. Appending the same report twice: the second exits 1 and names the first append's ids. Two `appendFindings` calls through `Promise.all` get disjoint id ranges and all six rows land. A `ledger.jsonl.lock` directory `utimes`-aged 60 s is taken over and removed. A lock held through `acquireWriteLock` makes the call reject with code `LOCK_TIMEOUT`. `--dry-run` prints the rows plus the dry-run line and leaves the file byte-unchanged. `--json` prints exactly one document. Uninitialised, missing-run-folder and bad-run-id cases each exit 1 with their message |
| `edgeCases` | A ledger with a hand-edited unparseable line: the append proceeds, keeps that line byte for byte, warns naming the line, and numbers past the rows it could read. `STAMITY_LOCK=0` prints the warning line and still appends. A Windows `--report .stamity\runs\…\reports\x-reviewer-r1.md` is accepted and stored with `/`. The run `2026-09-09_release-1.3.0` is refused as not a run id |
| `depends_on` | ctx-hook-card, ctx-records-gate |
| `verify` | `npm run lint && npm run typecheck && npm run knip && npm run test -- --coverage` |

### c8b-guard-write-scope — the guard's path-scoped Write allow (enforcement)

**Confidence:** high for the design and the current flow (basis: direct). Medium for Windows behaviour (basis: inferred from Node's documented path semantics; confirmed only by the CI Windows leg).

| Field | Content |
|---|---|
| `id` | c8b-guard-write-scope |
| `requirements` | REQ-CTX-003 |
| `files` | `src/hooks/scripts.ts` (guard section :970-1299 and the guard entry of `planCoreHookScripts` :2432-2436 only), `test/hooks/scripts.test.ts` (one new describe after :880), `test/corpus/hookWiring.test.ts`, `test/adapters/claude.test.ts` (the anchor describe :1198+), `SECURITY.md` (row :105; outside the brief's listed scope, so the planner confirms). Regenerated: `.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs`, `.stamity/manifest.json`, `emissionGoldens.test.ts.snap` (the claude guard entry at :118 only), `crossClientGoldens.test.ts.snap` (digests only) |
| `interfaces` | **Options:** `GuardScriptOptions` (:1000-1017) gains `layout?: HookScriptLayout`, defaulting to `layoutFor(opts.policiesJsonPath)` (:2462-2464). `planCoreHookScripts` passes `layout: layoutFor(policiesJsonPath)` in the guard entry (:2432-2436). **Branch rendered only when `identityBearing && layout === "generated"`** (the Claude repository guard). Every other body (the cursor, codex and copilot guards and any container guard) stays byte-identical to today, so their golden entries (:907, :1699, :2491) do not move. **New rendered constants:** `const WRITE_TOOL = "Write";`, taken from a new export `CLAUDE_REPORT_WRITE_TOOL` in `src/tools/translator.ts` (created in unit B, reused in unit C); `const ANCHOR_SEGMENTS = [...]`, reusing `GENERATED_ANCHOR_SEGMENTS` (:442) read-only; `const MAX_PATH_CHARS = 1024;`. **New rendered helpers:**<br>• `guardRoot()`: a copy of the shape-checked `derivedRoot` walk from `HERE = dirname(fileURLToPath(import.meta.url))`. No `STAMITY_REPO_ROOT`, no cwd, no environment. Returns `""` when the three parent segments are not `.stamity/generated/hooks`. Do **not** call or edit `resolveRepoRoot` (:479-526); that is the sibling seam.<br>• `writePathCheck(payload, patterns)` returns `""` (allow) or one reason: `no-root`, `no-file-path`, `not-absolute`, `dot-segment`, `device-path`, `outside-root`, `symlink`, `not-a-directory`, `not-a-regular-file`, `hard-linked` or `no-pattern-match`.<br>**Algorithm:**<br>(1) `root = guardRoot()`; if `""`, return `no-root`.<br>(2) `input = own(payload,"tool_input")` must be a non-null object; `raw = own(input,"file_path")` must be a string of 1..`MAX_PATH_CHARS` characters with no `\0`, else `no-file-path`.<br>(3) `isAbsolute(raw)` must hold, else `not-absolute`.<br>(4) Split `raw` on `/[\\/]+/`. Any segment `.` or `..` gives `dot-segment`.<br>(5) If `process.platform === "win32"`: a leading `\\` or `//` (UNC or device path) gives `device-path`, and so does any segment after the drive that contains `:` (alternate data streams).<br>(6) `target = resolve(raw)`; `rootReal = realpathSync.native(root)`. Collect the ancestors of `target` up to the filesystem root. Walking **from the top down**, find the first ancestor `A` where `realpathSync.native(A)` succeeds and `relative(rootReal, real) === ""`. The tail is `A`'s lexical descendants down to the leaf. If there is none, `outside-root`. Top-down is required: a link inside the root that points at the root must not become the anchor. `relative` is case-insensitive on win32. This step also absorbs `/var`→`/private/var`-style links above the root.<br>(7) lstat-walk the tail from `rootReal`. `ENOENT` stops the walk (the rest does not exist yet). `isSymbolicLink()` gives `symlink`. A non-last existing entry that is not a directory gives `not-a-directory`. An existing leaf that is not a regular file gives `not-a-regular-file`; an existing leaf with `nlink > 1` gives `hard-linked`.<br>(8) `rel = tail.join("/")` must match at least one pattern that passes the rendered twin of `isWritePathPattern`. Matching is per segment, equal segment count, case-sensitive. Each pattern segment is split on `*` and matched by prefix, ordered `indexOf` and suffix. No `RegExp` is built from document data.<br>**Branch in `evaluate()`:** insert before the `CATEGORY_DENIED` return (:1266-1273). If `tool === WRITE_TOOL && category === "edit" && Array.isArray(policy.allow) && !policy.allow.includes("edit") && Array.isArray(policy.writePaths)`, compute the valid patterns. If there are none, fall through to `CATEGORY_DENIED`. Otherwise, `check === ""` returns `null` (allow). Any other value returns `{ ...subject, category, reasonCode: "WRITE_PATH_DENIED", writeCheck: check, message: \`Agent "${agentId}" may write only its report — a regular file matching ${patterns.join(" or ")} under ${root} — and this Write was refused (${check}). Return the full report inline instead.\` }`. `Edit`, `NotebookEdit` and every other tool are unaffected. The `denyTools` check (:1247) still runs first. Throws are still caught at :1276-1284 and become `POLICY_EVALUATION_FAILED`. **Header** (:1084-1090, generated-and-identity-bearing variant only): add that for a path-scoped `Write` it also reads file-system metadata (realpath, lstat) of the requested path's ancestors under the repository root the script's own location names — never file content, never an environment variable. The existing "payload on stdin" and "Reads outside repo state:" lines stay (pinned at scripts.test.ts:215-234). **Imports** (:1093-1095) for that variant: `realpathSync` added to `node:fs`; `basename, isAbsolute, relative, resolve` added to `node:path`. **SECURITY.md:105:** add one sentence: on Claude Code in the repository layout, the four verdict roles may `Write` only a regular file matching their `writePaths` under the repository root, with symlinks, `..`, hard links and `Edit`/`NotebookEdit` refused. The "What it does not defend" cell gains: a verdict role may overwrite another role's report (R2), and a plugin install gets no report write (R1). |
| `testCriteria` | New describe "the guard's path-scoped report write". Fixture: the policy document at `.stamity/generated/agent-tool-policies.json` with a `stamity-reviewer` row `{allow:["read"], writePaths:[".stamity/runs/*/reports/*.md"]}` plus a `stamity-implementer` row. The guard is placed at `.stamity/generated/hooks/claude/guard.mjs`, rendered with `policiesJsonPath:"../../agent-tool-policies.json"` and `failMode:"fail-closed"`. The payload is `{agent_type, agent_id, tool_name, tool_input:{file_path}}`.<br>**Red first:**<br>(1) Reviewer `Write` to `<root>/src/app.ts` → exit 2 with `{blocked:true, reasonCode:"WRITE_PATH_DENIED", writeCheck:"no-pattern-match", category:"edit"}`.<br>(2) Reviewer `Edit` **inside** the pattern (`<root>/.stamity/runs/2026-09-23_ctx/reports/u1-reviewer-r1.md`) → exit 2 with `CATEGORY_DENIED`. Same for `NotebookEdit`. This case kills the mutant that branches on category instead of tool name.<br>(3) Reviewer `Write` to that path → `{code:0, stdout:"", stderr:""}`, both with the `reports/` directory absent and present.<br>**Refusals, each with its `writeCheck`:** relative path (`not-absolute`); `…/reports/../../../src/a.md` and `…/runs/x/../x/reports/a.md`, which resolves inside the pattern and is still refused (`dot-segment`); a sibling checkout's `<tmp>/other/.stamity/runs/x/reports/a.md` (`outside-root`, the lane-worktree case); a symlinked `reports` directory, symlinked `runs` directory, symlinked leaf, and `<root>/alias → <root>` with a write through `alias/` (all `symlink`); a hard-linked leaf (`hard-linked`); a directory named `a.md` (`not-a-regular-file`); `reports/sub/a.md`, `reports/a.txt` and `.Stamity/…` (`no-pattern-match`); `tool_input` missing, non-object, or with an empty or non-string `file_path` (`no-file-path`); a guard placed at `hooks/guard.mjs` (`no-root`).<br>**Fallback cases:** a row without `writePaths` gives `CATEGORY_DENIED`. A row whose only pattern is invalid (`../*.md`) gives `CATEGORY_DENIED`. A guard rendered with `identityBearing:false` or `layout:"container"` contains no `WRITE_TOOL` and answers the in-pattern reviewer `Write` with `CATEGORY_DENIED`. The payload path is spelled through the non-realpath temp dir (`getRepo().dir` unresolved) and is still allowed.<br>**Message:** names the agent and the pattern, says "inline", and control characters are stripped.<br>**Windows-only (`skipIf` not win32):** `c:` vs `C:` drive case is allowed; a `C:/…` forward-slash spelling is allowed; `\\?\C:\…` gives `device-path`; `a.md:evil` gives `device-path`. Directory links are created with the `"junction"` type on win32.<br>**hookWiring (shipped roster, claude guard in the emitted layout):** each of the four verdict ids — `Write` of its own role's report (`…/reports/u1-<role>-r1.md`) is allowed and `Edit` of it is denied; a verdict id writing another role's report name (the reviewer writing `…/reports/u1-security-r1.md`) is denied with `writeCheck:"no-pattern-match"` (the per-role patterns of plan resolution R16). `stamity-researcher` `Write` inside the pattern gives `CATEGORY_DENIED` (scope is per row). `stamity-implementer` `Write` anywhere is allowed (category). The `GUARD_CASES` parity table (:93-104, :307-321) is **unchanged**; add a one-line comment that the in-process `checkToolAccess` is path-blind and unwired, so a report write is decided by the guard alone.<br>**claude.test.ts:** **TEST CHANGE** at :1200-1204. `DENIED` becomes reviewer `Edit`, with the inline reason: "`Write` became path-scoped for verdict roles (C8), so a path-less `Write` is `WRITE_PATH_DENIED`; `Edit` keeps the category refusal this anchor case exists to prove." The :1359 expectation stays `CATEGORY_DENIED`. New case through the real shell from `sub/dir` with the `emitted()` tree (:1311-1328): reviewer `Write` to `<root>/.stamity/runs/r/reports/p-reviewer-r1.md` exits 0, and to `<root>/src/x.ts` exits 2 with `WRITE_PATH_DENIED`.<br>**Goldens:** the three non-claude guard entries in `emissionGoldens` stay byte-identical, which proves those bodies were not touched. |
| `edgeCases` | **Report dir not yet created:** a verdict agent's first report of a run arrives before `reports/` exists. The walk stops at `ENOENT` and the write is allowed. Whether Claude Code's `Write` creates the parents is Unknown U3. **Stale guard:** an old guard with a new document ignores `writePaths` and gives `CATEGORY_DENIED`; a new guard with an old document has no `writePaths` and also gives `CATEGORY_DENIED`. The agent returns the full report inline in both directions. **Race (TOCTOU):** a directory swapped between the check and the write needs an agent that can already write anywhere, so it is not an escalation (R4). |
| `depends_on` | c8a-write-paths-data, ctx-hook-card; serialized after ctx-hook-card because both edit `src/hooks/scripts.ts`, `test/hooks/scripts.test.ts` and the two emission golden snapshots (one writer per artifact) — the later unit re-runs the sync and the snapshot update and confirms only its own entries moved |
| `verify` | `npm run build && node dist/cli.js sync && npx vitest run -u test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts` (read the diff: only the claude guard, the digests and the manifest move), then `npm run lint && npm run typecheck && npm run test -- --coverage`. Budget a CI round-trip: the Windows leg is the confirmation of record (learning `the-local-test-gate-is-weaker-than-ci`). If the diff runs past about 400 lines, split out `hookWiring.test.ts`, `claude.test.ts` and `SECURITY.md` as c8b2, which depends on c8b. |

### ctx-ledger-close — `stamity ledger close`: re-review closures and one manual transition

| Field | Content |
|---|---|
| `id` | ctx-ledger-close |
| `requirements` | REQ-CTX-008 |
| `files` | `src/runs/blocks.ts`, `src/runs/ledgerStore.ts`, `src/cli/commands/ledger.ts`, `test/runs/ledgerClose.test.ts` (new). Regenerated: `docs/cli-reference.md` |
| `interfaces` | **`blocks.ts` adds** `export type ClosureStatus = "fixed" \| "not-fixed" \| "regressed" \| "rejection-upheld" \| "rejection-overturned"` · `export interface Closure { readonly ledgerId: string; readonly status: ClosureStatus; readonly line: number }` · `export function parseClosuresBlock(text: string): BlockParse<Closure>`. It follows the findings rules with `CLOSURES_FENCE`: keys exactly `ledger_id` and `status`, both strings; `ledger_id` non-empty and single-line; `status "<v>" is not fixed, not-fixed, regressed, rejection-upheld or rejection-overturned`; `ledger_id "<v>" repeats line <m>`. An empty block is `ok` with zero items. **`ledgerStore.ts` adds** `export const CLOSURE_TARGET: Readonly<Record<ClosureStatus, "fixed" \| "rejected" \| "open">> = { fixed: "fixed", "not-fixed": "open", regressed: "open", "rejection-upheld": "rejected", "rejection-overturned": "open" }` · `export const RATIONALE_MAX = 2_000` · `export type ManualState = "fixed" \| "rejected" \| "deferred"` · `export interface CloseChange { readonly ledgerId: string; readonly from: string; readonly to: string; readonly status: ClosureStatus \| null; readonly unchanged: boolean }` · `export interface CloseResult { readonly ledger: string; readonly changes: readonly CloseChange[]; readonly unreadableLines: readonly number[] }` · `export async function applyClosures(req: { readonly rootDir: string; readonly runId: string; readonly closures: readonly Closure[]; readonly report: string; readonly dryRun: boolean }): Promise<CloseResult>` · `export async function closeRow(req: { readonly rootDir: string; readonly runId: string; readonly ledgerId: string; readonly state: ManualState; readonly rationale: string; readonly dryRun: boolean }): Promise<CloseResult>`. Semantics, under the same lock and write as append: the closure note is `re-review <status>: <report>`. A row whose rationale already contains the note is `unchanged`, which makes a re-run idempotent. Otherwise a closure applies only to an `open` row, or to a `fixed` row with status `regressed` (which reopens it). Any other state gives the problem `line <n>: <id> is <state>, not open; only an open row takes a closure (a regressed closure also reopens a fixed row)`, and an unknown id gives `line <n>: ledger_id "<id>" is not a row of <ledger>`. Any problem refuses the whole close: every problem is listed and nothing is written. When applied, the state becomes `CLOSURE_TARGET[status]` and the rationale becomes `prior.trim() === "" ? note : prior + " \| " + note`. The rewritten line is the parsed object re-stringified with its key order and every other key (`report`, `decision_needed`, `retired`) kept; every other line stays byte-identical, with the file's EOL. `closeRow`: an unknown id gives `ledger close refused: <id> is not a row of <ledger>`; the trimmed rationale must be non-empty and ≤ 2,000 characters, else `ledger close --id needs a non-empty --rationale of at most 2000 characters`; a row already in the target state whose rationale contains the text is `unchanged`; otherwise the state is set and the text appended by the same rule. **CLI:** the choices become `["append","close"]`. Options added: `--id <ledger-id>`, `new Option("--state <state>", "the state a manual close sets").choices(["fixed","rejected","deferred"])`, `--rationale <text>`. Validation messages: `ledger close takes exactly one of --report and --id` · `ledger close --report takes no --state or --rationale; the closures block carries them` · `ledger close needs --run\|--state\|--rationale`. The `--report` path goes through `resolveReportPath`. Stdout per change: `<id> <from> -> <to> (<status>)`, manual `<id> <from> -> <to>`, or `<id> unchanged (already recorded)`. An empty block prints `ledger close: no closures in <src>; nothing changed`. A dry run adds `Dry run: <n> row(s) would change in <ledger>. Nothing was written.` JSON is `{ run, ledger, report, changes, dryRun }`. Exit codes 0, 1 or 2 as for append |
| `testCriteria` | Closures `fixed`, `rejection-upheld`, `not-fixed`, `regressed` and `rejection-overturned` on five open rows give `fixed`, `rejected`, `open`, `open` and `open`, each rationale ending in its note. `regressed` on a fixed row reopens it. Untouched lines (legacy `", "` rows included) are byte-identical. An unknown `ledger_id` among valid ones exits 1 naming its line, with the ledger byte-unchanged. A closure on a `deferred` row is refused. Re-running the same close prints only `unchanged` lines and leaves the file byte-identical. `--id … --state deferred` without `--rationale` exits 1. `--id` on an unknown id exits 1. A rewritten row keeps `report`, `decision_needed` and `retired` in their original order, and its keys stay within the records gate's allowed set (`id, phase, source, severity, evidence, state, rationale, retired, report, decision_needed`) |
| `edgeCases` | A CRLF ledger: rewritten lines keep CRLF. An empty closures block exits 0 with nothing changed. A hand-edited unparseable line elsewhere stays byte for byte with a warning, and one named by a closure is `not a row` |
| `depends_on` | ctx-ledger-append |
| `verify` | `npm run lint && npm run typecheck && npm run knip && npm run test -- --coverage` |

### c8c-claude-write-render — Claude renders `Write`; the other clients stay read-only; the capability disclosure line

**Confidence:** high. **Basis:** direct.

| Field | Content |
|---|---|
| `id` | c8c-claude-write-render |
| `requirements` | REQ-CTX-003 |
| `files` | `src/tools/translator.ts`, `src/adapters/claude.ts`, `test/tools/translator.test.ts`, `test/adapters/claude.test.ts`, `test/adapters/cursor.test.ts`, `test/adapters/copilot.test.ts`, `test/adapters/codex.test.ts`. Regenerated: `.claude/agents/stamity-{reviewer,security,performance,design-quality}.md` (the `tools:` line), `.stamity/manifest.json`, `docs/capability-matrix.md` (`node scripts/generate-capability-matrix.mjs`, the table at :269-274), `crossClientGoldens.test.ts.snap` |
| `interfaces` | **`src/tools/translator.ts`:** `export const CLAUDE_REPORT_WRITE_TOOL = "Write";` (from unit B if it landed there; one literal either way). `export function toClaudeToolsFrontmatter(categories: readonly ToolCategory[], options?: { readonly pathScopedWrite?: boolean }): string`. When `pathScopedWrite` is true and the rendered names lack `Write`, it inserts `Write` right after the last `read` name (the canonical `edit` slot). It never adds `Edit` or `NotebookEdit`, and without options it returns exactly today's output. `unionToolCategoryMap` (scripts.ts:1321) keeps calling it with one argument. The `ADAPTER_ALLOWLIST_COVERAGE` mechanism strings (:264-294) get appended text containing no `\|`:<br>• claude: `; the four verdict roles also carry \`Write\`, which the generated pre-tool-use guard admits only for a regular file matching the row's \`writePaths\` under the repository root — never \`Edit\` or \`NotebookEdit\``<br>• cursor, copilot, codex: `; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder`<br>The strength column does not change. **`src/adapters/claude.ts`:** `buildAgentFile` (:719-738) gains a parameter `scopedWrite: boolean` and renders `toClaudeToolsFrontmatter(grant.allow, { pathScopedWrite: scopedWrite && (grant.writePaths?.length ?? 0) > 0 })`. The call site (:555) passes `ctx.facts.hookScriptsRoot === undefined && !isPluginOwned(ctx.manifest, TOOL, "hooks")`, the same predicate :564-566 and :786 use. `CLAUDE_PERMISSION_ROWS` (:393-399) is unchanged: `Write` is **not** pre-approved for the session. **Cursor, Copilot, Codex adapters: no source change.** They read `grant.allow` only (cursor.ts:754, copilot.ts:445, codex.ts:776). |
| `testCriteria` | **Red first:** `toClaudeToolsFrontmatter(["read"], {pathScopedWrite:true}) === "Read, Grep, Glob, Skill, Write"`. `(["read","edit"], {pathScopedWrite:true})` equals `(["read","edit"])` (no duplicate). The output never contains `Edit` or `NotebookEdit` unless `edit` is granted. No-options output is unchanged (the :83-84, :173 and :246 pins stay green). **claude.test.ts:**<br>• **TEST CHANGE** at :481: the expected value becomes `toClaudeToolsFrontmatter(roster.allow, { pathScopedWrite: (roster.writePaths?.length ?? 0) > 0 })`, with the reason "verdict rows carry a roster-only `writePaths` (C8); `allow` is unchanged".<br>• **TEST CHANGE** at :493: expect `"Read, Grep, Glob, Skill, Write"`.<br>• **TEST CHANGE** at :560: `toClaudeToolsFrontmatter(["read"], {pathScopedWrite:true})`.<br>• New cases. An emission with `facts.hookScriptsRoot` set, and one with plugin-owned hooks, both render the four verdict agents without `Write`. `stamity-researcher` and `stamity-test-runner` never get `Write`. `permission-rows` stays `3` (capability-matrix.md:140). The dialect caps still contain no `plugin` or `container` (:797-800).<br>**cursor, copilot, codex tests (non-degenerate: assert first that the roster row carries `writePaths`):**<br>• Cursor: the four verdict agents emit `readonly: true`.<br>• Copilot: they emit `tools: ["read", "search"]`.<br>• Codex: the `sandbox_mode` stays read-only and the role-grant sentence has no `Write`.<br>• Each client's coverage row contains "return their full report inline".<br>**Other checks:** `docs/capability-matrix.md` byte-equals the generator output (the existing drift test). The dogfood `.claude/agents/stamity-reviewer.md:4` reads `tools: Read, Grep, Glob, Skill, Write` after sync. |
| `edgeCases` | **Pack agent under a verdict id:** a pack agent file shipped under `stamity-reviewer` still renders `Write` (roster wins, same as `allow`). **Pack agent claiming `writePaths`:** a pack agent never renders `Write` (its grant has no `writePaths`). **Plugin install:** the four agent files carry no `Write` there, so the agent never attempts a write the container guard would refuse (R1). |
| `depends_on` | c8b-guard-write-scope; it shares `test/adapters/claude.test.ts` and exposes the tool only once the guard can scope it |
| `verify` | `npm run build && node dist/cli.js sync && node scripts/generate-capability-matrix.mjs && npx vitest run -u test/emit/crossClientGoldens.test.ts` (read the diff: only the four claude agent files and the digests move), then `npm run lint && npm run typecheck && npm run test -- --coverage` |

### ctx-ledger-status — `stamity ledger status` and the TS card, byte-pinned to the hook

| Field | Content |
|---|---|
| `id` | ctx-ledger-status |
| `requirements` | REQ-CTX-013, REQ-CTX-012 |
| `files` | `src/runs/resumeCard.ts` (new), `src/cli/commands/ledger.ts`, `src/composition/root.ts`, `test/architecture/boundaries.test.ts`, `test/runs/resumeCardParity.test.ts` (new). Regenerated: `docs/cli-reference.md` |
| `interfaces` | **`src/runs/resumeCard.ts`** (wave 5; synchronous `node:fs` reads only, so its steps are the hook's own): `export interface RecordHead { readonly status: string \| null; readonly inProgress: boolean; readonly plan: string \| null; readonly invocation: string \| null }` · `export function readRecordHead(text: string): RecordHead` (BOM stripped; first 15 lines on `/\r?\n/`; first `RECORD_STATUS_PATTERN`, `RECORD_PLAN_PATTERN` and `RECORD_INVOCATION_PATTERN` match each; `inProgress` = `IN_PROGRESS_PATTERN` on the status value) · `export interface ResumeCard { readonly runId: string; readonly inProgress: boolean; readonly lines: readonly string[]; readonly openRowIds: readonly string[]; readonly unledgeredReports: readonly string[]; readonly lanes: readonly string[]; readonly withheld: string \| null; readonly unreadableLedgerLines: number }` · `export function findInProgressRun(rootDir: string): string \| null` · `export function collectResumeCard(opts: { readonly rootDir: string; readonly runId?: string; readonly now: Date }): ResumeCard \| null` (no `runId` means the in-progress run or `null`; a given `runId` means that run whether or not it is in progress) · `export function renderResumeCard(parts: { readonly runId: string; readonly plan: string \| null; readonly invocation: string \| null; readonly openRowIds: readonly string[]; readonly unledgeredReports: readonly string[]; readonly lanes: readonly string[] }, now: Date): string[]` · `export function screenCard(text: string): string` (the first `SESSION_START_SCREEN` id, in list order, whose pattern matches the raw text, the text with `INVISIBLE_SMUGGLING_CHARS` stripped, or `normalizeForDenyScan` of the stripped text; `""` when none). The algorithm, restated so this cell stands alone: S1 run folders under `.stamity/runs` that are real directories named by `RUN_ID_PATTERN`; the record head read from at most 65,536 bytes of a regular-file `record.md`; the greatest in-progress name. S2 ledger rows: string `id` with `state === "open"` gives the open ids in file order; string `report` values form the ledgered set; unparseable lines are counted in `unreadableLedgerLines`. S3 regular-file `.md` reports in code-unit order, listed when not ledgered and either over 1,048,576 bytes or carrying at least one non-blank line inside the first `stamity-findings` fence. S4 linked worktrees from `<git common dir>/worktrees/*`: `gitdir` with `/.git` stripped and `\` → `/`; `HEAD` as `refs/heads/<b>` → `<b>`, another ref → itself, hex → `detached <7>`, missing → `unknown`; formatted `<path> [<branch>]` and sorted. S5 flatten (control characters → space, whitespace collapsed, over 200 characters → 199 plus `…`, empty → `(not recorded)`). S6 lists `" (" + first k + ", … +<m> more" + ")"`, omitted when n = 0. S7 the six C6 lines, k from 10 down to 0 until the joined text is ≤ 2,000 characters. S8 a non-empty `screenCard` hit replaces the card with the single line `stamity resume card — run <run> withheld: its text matched screen pattern <id>; the ledger is the recovery point`. **CLI:** the choices become `["append","close","status"]`; the summary becomes `"append findings to a run's ledger, close its rows, and print its resume card (plumbing)"`. For status: no `.stamity/` exits 1 as in append; `--run` is optional and, when given, is checked and passed through `requireRunDir`. A `null` card prints `stamity: no run in progress under .stamity/runs/ — no resume card.` and exits 0. Otherwise the card lines print with `\n` and the command exits 0. `unreadableLedgerLines > 0` prints stderr `warning: <ledger> has <n> line(s) that are not ledger rows`. `--dry-run` is accepted and changes nothing, since status writes nothing. JSON is `{ run, inProgress, card, counts: { openRows, unledgeredReports, lanes }, openRowIds?, unledgeredReports?, lanes?, withheld, unreadableLedgerLines }`; the three lists are omitted when `withheld` is set. **Wiring:** `root.ts` gains `runs.resumeCard`; `PLAN_MAP` gains `"src/runs/resumeCard.ts": { unit: "ctx-ledger-status", wave: 5 }` |
| `testCriteria` | The parity matrix has at least 11 fixtures: no runs folder; no run in progress; the ctx-hook-card fixture (c); the cap fixture (25/25/25 with a 300-character plan); a poisoned Invocation (withheld); two runs in progress; Status on line 15 against line 16; a CRLF record and ledger; a ledger with an unparseable line; a report over 1 MiB; a relative-`gitdir` lane plus a detached-HEAD lane. For each, the stdout card lines of `buildSessionStartScript()` run with `{"source":"compact"}` equal `collectResumeCard({ rootDir, now: <the minute the script printed> })?.lines` byte for byte, and `runInProcess(COMMANDS, ["ledger","status"], { cwd })` stdout equals those lines plus `\n`. A real `git worktree add` fixture (git through `spawnSync`) gives a lane whose path and branch equal the linked entry of `git worktree list --porcelain`, with `\` → `/`. `readRecordHead` cases: BOM, bold `**in progress**`, `Status:` on line 15 against 16, first match wins. `ledger status --run <closed run>` prints its card. `--run 2026-09-23_missing` exits 1. `--json` gives one document, lists omitted when withheld |
| `edgeCases` | A hand-run `ledger status` on Cursor or Copilot (their hooks never print the card) returns the same bytes the Claude hook prints. A run folder with no `record.md` prints `(not recorded)` for plan and invocation when named by `--run`, and is never picked as in progress |
| `depends_on` | ctx-hook-card, ctx-ledger-close |
| `verify` | `npm run lint && npm run typecheck && npm run knip && npm run test -- --coverage` |

## Execution order across the three files

One package branch, `package-16-context-economy`, cut from `main` at `fed39ac`. Parallel units run in lanes under the
worktree farm (`git worktree add -b <branch> <path> package-16-context-economy`, a `node_modules` symlink, every lane
starting with `git reset --hard package-16-context-economy`); lanes stage by explicit path, never `git add -A`, never
`git stash` (a patch file plus `git restore`), and keep a private scratch folder each. One writer per artifact: every
unit that edits `src/hooks/scripts.ts`, `test/hooks/scripts.test.ts`, the two emission golden snapshots or
`.stamity/manifest.json` runs serialized, and the later one re-runs the sync and the snapshot update and confirms only
its own entries moved.

| Batch | File 1 — engine | File 2 — corpus, evals, docs | File 3 — the replay |
|---|---|---|---|
| 1 | `ctx-hook-card` ∥ `ctx-records-gate` | `p16-verdict-roles` ∥ `p16-execution-roles` ∥ `p16-work-reorder` | `r1-protocol` ∥ `r2-fixture-generator` ∥ `r5-transcript-walk` |
| 2 | `c8a-write-paths-data` ∥ `ctx-ledger-append` | `p16-work-text` · `p16-evals-verdict` | `r3-service-base` · `r6-findings-matcher` |
| 3 | `c8b-guard-write-scope` ∥ `ctx-ledger-close` | `p16-evals-execution` | `r4a-seed-patches` · `r7-measure` |
| 4 | `c8c-claude-write-render` ∥ `ctx-ledger-status` | `p16-evals-work` | `r4b-oracles` · `r8a-score-run` → `r8b-score-compare` |
| 5 | — | `p16-docs` → `p16-dogfood-sync` (last writer of the emitted copies) | `r9-driver` → `r10-canary` → baseline pilot and the three baseline scored runs (`r11a`, then `r11b`'s baseline half) |
| 6 | the candidate: files 1 and 2 merged on the package branch, the full gate green, the Windows CI leg green | | the changed pilot, the three changed scored runs, `COMPARISON-v1.md` (`r11a`, `r11b`) |
| 7 | the Prove phase: the whole-branch deep review, the spec delta merged, the QA checkpoint (the maintainer's), the merge only when the comparison's merge gate reads PASS | | |

Replay runs go one at a time on the account the operator's client folder is logged into; the baseline runs may start
as soon as the canary passes, before the candidate exists. The merge to `main` waits for the maintainer's QA answer
(the kickoff's rule) and for `Merge gate: PASS`; a failing row sends its proposal back for rework and a re-measure, or
drops it with its requirement ids retired in the spec.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- Minor · content/commands/st-work.md · the per-pass loop below the orchestrator (P5) was declined: in plan 008's runs it adds 3.8 points over P1+P2+P4, works on Claude Code only, and conflicts with same-fixer continuity and the write-ahead ledger; revisit once the replay has measured P1–P4, or once a second client supports nested sub-agents · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md
- Minor · orchestrator context · the levers no proposal addressed, measured in this plan's research: the orchestrator's own thinking (20.3 % of the token fill), its re-reads of its own record and ledger (3.5 % of inflow), record paragraphs typed by hand (4.7 %), CI polling through `gh` (2.0 %) — candidates for a later package · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md
- Minor · src/cli/docs/measurements.ts:297 · a run counts as in progress on a `Status: … in progress` line anywhere in its record, while the resume card reads the first 15 lines (C5); align the two in a later change · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md
- Minor · GitHub Copilot CLI · its `subagentStop` hook's `modifiedResponse` is the one engine-side way to shrink a verdict return the parent receives; unmeasured and not built — revisit if Copilot usage warrants · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md
- Minor · content/agents/stamity-researcher.md · researcher returns stay full (the planner reads them whole); a two-tier researcher return is unmeasured · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md
- Warning · evals/cases-v6 · no golden case for a verdict role's digest when a report path is named (labelled verdict and confidence, the report line, every Critical/Warning line, Minor ids, security in full, the 1,500-character prose cap) · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-02.md
- Warning · evals/cases-v6 · no adversarial case where pressure to shorten a digest meets a security finding (it must be carried in full) · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-02.md
- Warning · evals/cases-v6 · no golden case for re-review closures (a fixer rejection upheld or overturned; new Minors suppressed) · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-02.md
- Warning · evals/cases-v6 · no golden case for the capacity rung (a limit-reset wait and probe; limit-no-reset BLOCKED_DEPENDENCY; no verdict-role downgrade) · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-02.md
- Minor · evals/cases-v6 · no golden case for a fixer handed a decision_needed id without sign-off (unresolved, "sign-off missing"), for an implementer whose pointed-at cell no longer resolves (BLOCKED_DEPENDENCY), for the pointer-dispatch shape, for the spec-author's plan-cell amendment, or for a green test-runner digest against a red full return · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-02.md
- Minor · .stamity/runs/2026-09-17_plugin-lifecycle/record.md · the research found the record's 2026-09-22 credit outage dated about 21:55Z with three agents cut off, where the transcript shows 18:54Z with two agents and the orchestrator; four stalls (2026-09-19 12:35Z, 2026-09-22 12:12Z, 2026-09-22 17:00Z, 2026-09-23 10:21Z) went unrecorded; the "dropped before it read anything" reviewer of 2026-09-20 had made 21 tool calls; and the ledger holds none of the failure-ladder rows the body required — a dated correction entry at this package's close · source: /st-plan · Ref: docs/plans/009-orchestrator-context-economy-01.md

## Contract census, risks and unknowns — the engine slices

#### Contract census

Confidence: high on the producers and on consumers found by grep (`direct`); medium on completeness for prose consumers in sibling-owned bodies (`inferred`).

| Contract | Class | Producer | Consumers found | Change kind |
|---|---|---|---|---|
| C1 report path and name | persisted-name | Agent definitions and the `/st-work` body (sibling); this slice encodes the grammar as `REPORT_NAME_PATTERN` in `src/runs/layout.ts` | `resolveReportPath` (ctx-ledger-append), card step S3 (both twins), `.gitignore` (ctx-records-gate), the C8 guard glob `.stamity/runs/*/reports/*.md` (sibling; broader than the pattern, see R6) | add |
| C2 findings block | wire-field | Verdict and execution role definitions (sibling) | `parseFindingsBlock` (strict), card S3 (a count of non-blank lines, lenient on purpose so a malformed block still surfaces) | add; strictness added: the id letter must match the severity, and `locator`/`summary` are single-line |
| C3 ledger row | persisted-name | `appendFindings` and `applyClosures`/`closeRow` (`src/runs/ledgerStore.ts`) | `test/records/ledgers.test.ts` (closed key set, widened in ctx-records-gate); `src/cli/docs/measurements.ts:300` (`/"state"\s*:\s*"open"/`, spacing-tolerant, unchanged); `scripts/merge-ready-rate.mjs:13` (through measurements); the `st-work` / `st-board` / `st-rework` bodies and eval case `golden/work-proof-block-fields` (sibling) | add (`report`, `decision_needed`); new rows are compact JSON beside legacy `", "` rows, and every reader is a JSON parser or a `\s*` regex |
| C4 digest | — | sibling | — | none here |
| C5 record head | persisted-name | `/st-work` Frame (sibling) | `readRecordHead` (TS) and card S1 (JS); `measurements.ts:297` `IN_PROGRESS` reads the WHOLE record rather than the first 15 lines, a divergent rule left unchanged (U7) | consume |
| C6 resume card | wire-field (context text) | `buildResumeCardSource` (hook) and `collectResumeCard` (CLI), parity-pinned | The orchestrator after a compaction; the `/st-work` resume text (sibling); the C12 compaction samples | add; format choices made inside C6: the parenthetical is omitted at n = 0, lists shrink to fit 2,000 characters, lanes are linked worktrees only, and a screen hit gives one withheld line |
| C7 `stamity ledger` verb | cli-contract | `src/cli/commands/ledger.ts` | `/st-work` body and fixer dispatch (sibling); `test/cli/surface.e2e.test.ts`; `docs/cli-reference.md`; `README.md` and `docs/getting-started.md` | add (hidden verb). The lock is the engine's mkdir-based `acquireWriteLock` (U3) |
| C8 verdict-role Write | config-key | sibling | Only this slice's `.gitignore` line and `REPORT_NAME_PATTERN` meet it | none here |
| C9 closures block | wire-field | Reviewer definition (sibling) | `parseClosuresBlock`, `applyClosures` | add |
| C10 pointer dispatch | wire-field | sibling | Reads the C7 id format `<run-id>/<phase>/<n>` and the C1 path | none here (the format is fixed by `nextRowNumber`) |
| C11 capacity rung | — | sibling | — | none |
| C12 replay floor | — | sibling | Relies on C6's "reports without a ledger row" for "0 findings lost across a forced compaction" | none here |

#### Risks

Confidence: medium, basis `inferred` from the cited gates and learnings.

| # | Severity | Risk | Mitigation |
|---|---|---|---|
| R1 | Warning | **The TS and JS card twins drift.** | Every constant is single-sourced in `layout.ts` and embedded with `JSON.stringify`. The byte-parity matrix in ctx-ledger-status covers the cap shrink, the withheld line, CRLF, the unreadable line and both lane shapes. A new branch in one twin needs a fixture, or the reviewer flags it. Precedent: `test/hooks/scripts.test.ts:354-372`. |
| R2 | Warning | **Unit size.** Estimates (source + tests): ctx-hook-card ≈ 400 + 250; ctx-ledger-append ≈ 470 + 300; ctx-ledger-close ≈ 260 + 200; ctx-ledger-status ≈ 230 + 260; the other two < 60. Two units pass the ~400 ceiling once tests are counted, because an engine module must land with its first production caller (rules 4 and 5; learning `engine-layer-modules-cannot-drive-init`). | Fallback split, per the same learning: land the engine half first with rule 5 expected red (registered in `root.ts`, so rule 4 and `root.test.ts` stay green), and let the verb unit close it. The planner picks. |
| R3 | Warning | **Windows.** Symlink cases cannot run there. Junctions are assumed to report `isSymbolicLink()` from `lstat`, which is unverified. Path display could leak `\`. A darwin run proves none of this (learning `the-local-test-gate-is-weaker-than-ci`). | Stored and printed repo paths are POSIX literals built from validated segments (`runRelPath`). Real paths use `node:path` `join`/`resolve`. The `..` check splits on `[\\/]`. Symlink tests `skipIf(win32)`. Lane paths map `\` → `/`. Parsers split on `\r?\n` and writes keep the file's EOL. Budget a CI round-trip for the Windows leg on ctx-hook-card, ctx-ledger-append and ctx-ledger-status. |
| R4 | Minor | **Coverage floors.** No touched source file carries one: floors bind only `src/merge/*` and `src/emit/*` (`vitest.config.ts:85-172`), and `src/emit/` is not edited (`hooksInfra.ts:10` only names the loader in a comment). | CI still runs `npm test -- --coverage`, so every `verify` includes it. `npm run knip` is included because CI runs it (`ci.yml:264-267`) and the local gate does not. |
| R5 | Warning | **`STAMITY_LOCK=0` turns off serialization,** so concurrent appends can lose rows. | The verb prints a stderr warning whenever locking is off. The in-process queue still serializes callers inside one process. |
| R6 | Warning | **The C8 guard admits any `.md` under `reports/`, but `ledger append --report` admits only C1 names.** A misnamed verdict report can be written and then not appended. | The refusal names the rule; the orchestrator falls back to `--stdin`. Better: the sibling C8 unit reuses `REPORT_NAME_PATTERN` from `layout.ts`. |
| R7 | Warning | **A screen hit (a false positive included) withholds the whole card after a compaction.** | The withheld line still names the run and says the ledger is the recovery point. `ledger status --json` keeps the counts. Degrading to less context is the loader's existing posture (`scripts.ts:618-620`). |
| R8 | Minor | **`--stdin` appends have no duplicate guard** (there is no report path to key on), so a retry after a compaction can double-append. | Use `--stdin` only for inline-return clients, and check `ledger status` first. |
| R9 | Minor | **Leak gate.** Ledger `evidence` is copied from report text, so a reserved name in a report reaches a committed ledger and turns the suite red (learning `leak-gate-scans-stamity-state-files`). | None engine-side. The ignored `reports/` folder itself is outside the gate's scan. |
| R10 | Minor | **Session-start cost.** On a compact start the hook reads up to 64 KiB of every run's record (22 runs here) plus one ledger. | Bounded reads; this only runs after a compaction. |
| R11 | Minor | **The review-gate wiring trap.** Adding a Claude event row would silently wire the review gate to it (`src/adapters/claude.ts:245-247`). | No event or `CLIENT_EXTENSION_EVENTS` row is added anywhere in this slice. |

#### Unknowns

| # | Question | What was probed | Why it did not settle | Smallest input that settles it | Confidence (basis) |
|---|---|---|---|---|---|
| U1 | How a CONSUMER repo ignores `reports/`. The engine owns exactly one `.gitignore` line (`src/cli/commands/init/apply.ts:381`), and init promises "Nothing else in your .gitignore is touched" (`panel.ts:480-481`). | Grepped `src/` for gitignore handling. | C1 does not say whether the ignore is repo-only or engine-emitted. | A maintainer pick: (a) `ledger append`/`close` write `<run>/reports/.gitignore` containing `*` (a new file under the state dir, so the promise holds; about 10 lines in ctx-ledger-append; recommended); (b) the `/st-work` Frame step writes it (sibling); (c) init adds a second line (breaks the promise). | medium (inferred) |
| U2 | Whether C6 "lanes" means linked worktrees only, read from `.git/worktrees/` without calling git. | `scripts.test.ts:311` and `:2427` (no `child_process` in hooks); `getting-started.md:216-218`. | The C6 text says "git worktree list", which also lists the main checkout. | A confirm. Equivalence to `git worktree list --porcelain` is pinned by the ctx-ledger-status test. | high (direct) |
| U3 | Whether C7's "one lock file … exclusive create" is satisfied by the engine's lock directory (proper-lockfile mkdir, `atomicWrite.ts:381-414`). | The atomicWrite lock code. | Wording against mechanism. | A confirm. The alternative is a second lock implementation, which is not recommended. | high (direct) |
| U4 | The C2 `security` flag has no C3 field, so once a git-ignored report is gone, the ledger no longer shows which rows were security findings. | C2 and C3 in the contracts file. | Out of this slice's authority (a C3 change). | A planner decision on an optional `security: true` row field (it would move ctx-records-gate by 3 lines). | medium (inferred) |
| U5 | Should `ledger append` mark `decision_needed` rows on stdout? C7 fixes the line as `<ledger-id> <severity> <report-local id>`; `--json` carries `decisionNeeded`. | The C7 text. | A contract wording choice. | A confirm, or a ` decision-needed` suffix token. | medium (inferred) |
| U6 | Whether Claude Code caps SessionStart hook stdout below banner plus card (about 20 learnings lines plus ≤ 2,000 characters). | r4 final, per-client table. | The vendor hooks page was truncated when fetched there; no cap was seen. | One forced `/compact` in the dogfood repo with a run in progress. | low (unverified) |
| U7 | `measurements.ts:297` treats a run as in progress on a `Status: … in progress` line anywhere in the record, while C5 reads the first 15 lines. | The measurements source. | The two rules disagree only on a record whose later text says "in progress" in a Status line. | A planner call to align measurements to `readRecordHead` in a later change. | medium (direct) |
| U8 | Codex `exec` (headless) loads no project hooks (`docs/capability-matrix.md:238`), so no card appears there after a compaction. | The capability-matrix row. | A vendor behaviour. | None needed. The fallback is `ledger status` by hand, as on Cursor and Copilot. | high (direct) |

#### Contract census

**Confidence:** high for the rows found. **Basis:** direct (repo-wide greps for each spelling).

| Contract | Class | Producer | Consumers found | Change kind | Owner / closure |
|---|---|---|---|---|---|
| `AgentPolicyRow.writePaths` / `AgentToolPolicy.writePaths` | symbol | `agentPolicies.ts`, `allowlist.ts` | `hooksInfra.ts:405`; `agentGrants.ts:319`; assignability binding `agentPolicies.test.ts:169`. `src/pack/permissions.ts` does **not** mirror the row (grep) | add | c8a |
| `writePaths` key in `agent-tool-policies.json` | wire-field / persisted | `buildAgentToolPoliciesJson` | generated guard (all clients; only the claude repository body reads it); `scripts/plugins/clients/{claude,codex,copilot,cursor}.mjs` (verbatim copy); `hookWiring.test.ts:106` interface; goldens; `.stamity/runs/2026-09-10_package-10/integration-evidence.json` (historical, left untouched) | add | c8a (producer), c8b (reader) |
| `stamity/agent-tool-policies/v1` | constant | `allowlist.ts:144` | guard :1098; `hookWiring.test.ts:240` | unchanged | — |
| `ResolvedAgentGrant.writePaths` | symbol | `agentGrants.ts` | `claude.ts:725` (reads); cursor, copilot, codex, `hooksInfra.ts:327` and `pack/install.ts:714` (ignore) | add | c8a / c8c |
| `WRITE_PATH_DENIED` + `writeCheck` on the refusal line | event (stderr JSON) | guard | tests only; no doc lists reason codes (grep of `docs/`: zero) | add | c8b |
| `toClaudeToolsFrontmatter(…, options?)` | symbol | `translator.ts` | `scripts.ts:1321` (must stay single-argument), `claude.ts:393`, `:725`; tests | re-signature (additive) | c8c |
| `CLAUDE_REPORT_WRITE_TOOL` | constant | `translator.ts` | guard render (c8b), translator (c8c) | add | c8b |
| `GuardScriptOptions.layout` | symbol | `scripts.ts` | `planCoreHookScripts`; tests | add | c8b |
| `scripts.ts`: `planCoreHookScripts` array, `GENERATED_ANCHOR_SEGMENTS`, `resolveRepoRoot`, the two golden files, `.stamity/manifest.json` | shared file | — | **the sibling's session-start (resume card) unit** | — | **Seam:** c8b edits only :970-1299 and the guard entry at :2432-2436, and reads `GENERATED_ANCHOR_SEGMENTS` without changing it. The sibling edits :576-968 and :2427. Hunks do not overlap, but one writer per artifact applies: serialize the two units, and the later one re-runs `vitest -u` on both goldens plus `sync`, confirming only its own entries moved |
| `.claude/agents/stamity-{reviewer,security,performance,design-quality}.md` `tools:` | config-key (emitted) | claude adapter | the Claude Code client | revalue | c8c |
| `ADAPTER_ALLOWLIST_COVERAGE[*].mechanism` → `docs/capability-matrix.md` | constant | `translator.ts` | `capabilityMatrix.test.ts:256-260`, `translator.test.ts:105-114` (derived, not literal) | revalue | c8c |
| C1 report name grammar vs the pattern `.stamity/runs/*/reports/*.md` | constant | contracts C1 / C8 | dispatch `report:` line (C10, sibling); `.gitignore` entry (REQ-CTX-004, another unit) | consume | every C1 name is one segment per `*`, so they agree |

**Breaking-change candidates:**

| Category | Location | Current | Proposed | Consumers | Confidence |
|---|---|---|---|---|---|
| none breaking. `type_shape` is additive | `AgentToolPolicy`, `ResolvedAgentGrant`, the policy document | no field | optional `writePaths` | above | high (direct) |
| `data_migration`: none | policy document schema | v1 | v1 (an older guard denies `Write`, fail-closed) | the generated guard | high (direct, `scripts.ts:1266`) |
| `api_signature`: none | `toClaudeToolsFrontmatter` | one parameter | optional second parameter | not exported from `src/index.ts` (r2 final.md:307) | high |

#### Risks

**Confidence:** medium. **Basis:** inferred from the cited mechanisms. R1's "no saving" consequence is direct.

| # | Severity | Risk | Mitigation |
|---|---|---|---|
| R1 | Warning | In the container layout (a Claude Code plugin install) no project root is anchored. C8's own rule therefore refuses every report write there, and a plugin-installed Claude gets no verdict-report saving. | c8c does not render `Write` in that layout, so there are no wasted attempts, and the capability row says so. A later option, deliberately left out now (the maintainer prefers lean scope): anchor the container guard on a bounded `CLAUDE_PROJECT_DIR`. That breaks the guard's stated "no environment variable" posture (`scripts.ts:1135-1142`) and would need its own security review. |
| R2 | Warning (Critical if the replay shows it) | The pattern lets any verdict role create **or overwrite any role's report** in any run. A reviewer steered by injected text in the code under review could overwrite `u1-security-r1.md` with an empty findings block, and `stamity ledger append --report` (C7) would then lose the security finding. | Recommended C8 amendment, data-only because the matcher already supports several `*` per segment: per-role patterns such as `.stamity/runs/*/reports/*-reviewer-r*.md` and `*-security-r*.md`. It needs the planner's sign-off because it changes C8's literal value. Also: the C4 digest carries security findings verbatim, so the orchestrator can cross-check. |
| R3 | Warning | This is a change to the authorization boundary. | A mandatory **security lens pass** (the `stamity-security` agent on the trigger path `src/hooks/scripts.ts` guard and `src/tools/allowlist.ts`) plus a `/security-review` of the c8b diff. Checklist: `..`, absolute vs relative, symlinks at every level including root-aliasing links, Windows junctions, hard links, case folding, UNC/device/alternate-data-stream paths, 8.3 short names (`realpathSync.native`), NUL and length limits, no `RegExp` built from document data, fail-closed on every throw, older-guard skew, per-row scope, the R2 cross-role overwrite, and injection screening of report text (owned by C7, but confirmed here). |
| R4 | Minor | A race between the guard's lstat walk and the client's write (directory swapped for a link). | Anyone able to plant the link (execute or edit grant) can already write anywhere, and verdict roles hold neither. So it is not an escalation. Stated in the SECURITY.md row. |
| R5 | Minor | `checkToolAccess` (in-process, unwired) denies what the guard now allows, so the two points diverge in one direction. | Header sentence plus a hookWiring comment. If the check is ever wired, it needs a path parameter first. The existing call-graph pins (`agentPolicies.test.ts:350-386`) fail loudly at that point. |
| R6 | Warning | The local gate cannot prove the Windows path logic, and coverage floors are per file. | `verify` uses `--coverage`; win32-only cases are gated with `skipIf`; budget a CI Windows round-trip (learning `the-local-test-gate-is-weaker-than-ci`). |
| R7 | Minor | A stale dogfood copy: `.claude/agents` and the generated guard are read by no gate. | `sync` in every `verify`, then read the diff (learning `corpus-edits-ship-with-a-dogfood-sync`). |

#### Unknowns

**Confidence:** low for each row. **Basis:** unverified.

| # | Question | Probed | Why it did not settle | Smallest input that settles it |
|---|---|---|---|---|
| U1 | Does a background verdict sub-agent's `Write` pass Claude Code's own permission step without a prompt? Only `read` is pre-approved (`claude.ts:383`, `:393-399`). | adapter source and the sub-agent notes at `translator.ts:47-52` | No read of the vendor's current background-permission rule this session; codebase tier only. | One probe on the replay pilot. If it is auto-denied, the planner decides whether to add a path-scoped `permissions.allow` row. That row is session-global and covers the main thread (`claude.ts:365-382`). |
| U2 | Is `CLAUDE_PROJECT_DIR` the main checkout for a sub-agent spawned with native `isolation: worktree`? | `.claude/settings.json:33`; claude.test.ts:1186-1189 | Documented for the session only | A one-hook probe. Either way the pattern refuses `.claude/worktrees/…` paths (`no-pattern-match`), so this is not a security question. |
| U3 | Does Claude Code's `Write` create missing parent directories (`reports/`)? | none in the codebase | vendor behaviour | Pilot probe. If not, the Frame step (sibling, `/st-work`) creates `reports/`. |
| U4 | Does Node's `lstat().isSymbolicLink()` report a Windows junction as a link, and does `realpathSync.native` return un-prefixed paths? | Node docs not in the codebase tier | platform fact | The c8b win32 cases on the CI Windows leg |
| U5 | Do the plugin-package tests (`test/ci/pluginPackages*.test.ts`) pin the bytes of the Claude plugin's policy document or agent `tools:` lines? | greps show those files reference `agent-tool-policies` | not read in full | `npx vitest run test/ci` inside c8a's and c8c's verify (already inside the full gate) |

## Resolved details

Every open detail the drafts returned was settled inside the maintainer's decisions; the contracts above and the units carry the result, and these rows record why.

R1  Plan path: `docs/plans/009-orchestrator-context-economy.md` (split into `-01`/`-02` only if the fresh-context
    check fails); the specs cite C1–C12 and D1–D10 through it.
R2  Spec status (corrected at the write): the spec-status gate (`test/records/specStatus.test.ts`) allows only
    `design | shipped | shipped-with-<x.y.z>` and refuses a plan naming a spec file the tree lacks, so the new spec is
    written now as a `status: design` skeleton (its requirement headings under `## Requirements`), filled at Prove, and
    moved to `shipped-with-1.10.0` at the 1.10.0 close; `docs/specs/model-ladder.md` keeps `shipped-with-1.9.0` (plan
    008 shipped it, so reading `design` again would fail the gate) and its intro names REQ-LADDER-002 and REQ-LADDER-003
    as merged, not yet released.
R3  Consumer repositories: the engine's required git-ignore entries (the list `init`/`sync` maintain; today one member,
    `src/mcp/env.ts:180`) gain `.stamity/runs/*/reports/`, so a consumer's `git add -A` never commits reports; this
    repository's `.gitignore` gains the same line.
R4  Paths: the `report:` line of a digest and the ledger's `report` field are repo-relative to the main checkout; the
    dispatch's `report:` line gives the absolute path a lane writes to; `stamity ledger` resolves a relative
    `--report` against the repository root it runs in and normalises an absolute path inside it to relative.
R5  Reserved names: when a unit id begins with `report`, `summary`, `findings` or `analysis`, its report name uses
    `u-<unit-id>`; the ledger verb refuses a report basename matching the client's refusal pattern with its own message.
R6  One text, two shapes: a verdict role's definition says — when your tools include `Write`, write the full report to
    the dispatch's `report:` path and return the digest; when they do not (Cursor, Copilot, Codex), return the full
    report inline, carrying its `stamity-findings` block. No per-client projection of the prose.
R7  `stamity ledger`: refusals exit 1 through the engine's error class; a run folder that does not exist is refused
    ("no such run: <id>"); the lock reuses the repository's existing write-lock helper and its timeout if one exists
    (else exclusive create with a 10 s stale rule); `status` with no run in progress prints
    `stamity ledger status: no run in progress` and exits 0; an empty phase starts at `/1`; `--stdin` rows carry no
    `report` key.
R8  Closures: a closure object may carry an optional `rationale`; `rejection-upheld` → `rejected` takes it (default
    `rejection upheld by <report path>`); rows left `open` get `; <status> per <report path>` appended to their
    rationale; one unknown id refuses the whole closures block (atomic, like `append`).
R9  Sign-off of a `decision_needed` row: a run-record line `- <UTC> sign-off: <ledger-id> — <decision>` written before
    the first fixer dispatch naming that id; the row keeps `decision_needed: true`.
R10 D4's guard restored: when the spec-author amends the cell of a unit whose files touch a security trigger path or
    carry a census row, the reviewer reads the amended cell before that unit is dispatched (one pass); for every unit
    the reviewer reviews the diff against the amended cell.
R11 The card: "newest" is the lexicographically greatest in-progress run folder name (they are date-prefixed); lists
    are capped at 10 items and, if the card still exceeds 2,000 characters, the path lists shorten further and end
    `… (<n> more)`; a screen hit prints the loader's skip line instead of the value.
R12 The body order: the constant is 18,000 characters, counted from the first byte of the emitted body file (the one the
    client re-attaches), frontmatter included; the reorder lands as its own commit so "no text removed" is checkable.
R13 Capacity rung: `<class>` in the record line is the stop class; `<UTC>` is ISO to the minute; the bounded backoff is
    one wait of 5 minutes; a `limit-reset` more than 12 h away is `BLOCKED_DEPENDENCY` naming the reset time; build
    roles = implementer, fixer on rounds 1–3, researcher, creator, test-runner; the spec-author holds its class like
    the verdict roles (later units are planned against its text); on Copilot CLI and Codex, which document no
    sub-agent resume, "resume" is a re-dispatch of the same brief at the same class naming the on-disk state — a fresh
    agent, not a ladder rung. Whether the Claude review gate counts a resumed reviewer's stop as a round is measured
    in the replay (rounds parity) and recorded.
R14 Replay: rounds within ±1 is per pass (the modal rounds of each pass); the variance rule reads the three scored runs
    of a shape — if two differ by more than 2 seeds found, that shape gets 2 more scored runs (5); the sub-agent-token
    bar is pooled per pass over the scored runs; results live in `evals/replay/runs/<date>-replay-<n>/` and
    `evals/replay/COMPARISON-v1.md`; the merge gate (this session) and the release gate (the eval-set floors at the
    1.10.0 run, session 2) are separate criteria.
R15 Codex receives no touchpoint bodies today (`docs/capability-matrix.md:240`): every body-carried requirement has no
    carrier there — an accepted, declared degradation (the agent-definition parts still reach Codex).
R16 Per-role report patterns (from the verdict-write draft's R2, adopted — stricter than D1's "limited to that folder"):
    each verdict row's `writePaths` names only its own role's reports: `.stamity/runs/*/reports/*-reviewer-r*.md`,
    `*-security-r*.md`, `*-performance-r*.md`, `*-design-quality-r*.md` — so no verdict role can overwrite another's.
R17 Plugin installs of Claude Code (the container hook layout) anchor no project root: the verdict roles get no `Write`
    there and return in full inline — a declared degradation in the spec's parity table and the capability disclosure.
R18 A refused report write (a permission prompt a background agent cannot answer, a guard refusal, a missing folder)
    falls back to the full inline return with the findings block; the dispatch's `report:` line is an ABSOLUTE path in
    the main checkout; Frame creates `.stamity/runs/<run-id>/reports/`.
R19 The guard unit (c8b) gets a mandatory security lens pass plus a security review of its diff; the pilot probes
    whether a background verdict agent's `Write` passes the client's permission step unprompted.
R20 Consumer ignore (supersedes R3): each run's `reports/` folder carries its own `.gitignore` holding `*` — created by the
    `/st-work` Frame step with the folder, and ensured idempotently by `stamity ledger append` and `close`; this
    repository's root `.gitignore` also gains `/.stamity/runs/*/reports/` plus the ledger lock and temp names. `init`'s
    promise to touch one `.gitignore` line stays true.
R21 Lanes on the card = linked worktrees only, read from the git common dir's `worktrees/` with `node:fs` (a hook may not
    spawn a child process); equivalence to `git worktree list --porcelain` pinned by a test.
R22 The ledger lock = the engine's existing `acquireWriteLock` (a lock directory), not a second implementation.
R23 No `security` ledger field: the row's `source` and `evidence` carry it; reports stay local.
R24 `ledger append` prints a trailing ` decision-needed` token on the line of a row carrying `decision_needed: true`.
R25 Units over the ~400-line guideline (the hook card, `ledger append`) stay whole: an engine module lands with its first
    production caller (the architecture gate's rules 4 and 5), and no unit leaves the gate red for a later one.
R26 One writer per artifact: every unit that edits `src/hooks/scripts.ts`, `test/hooks/scripts.test.ts`, the two
    emission golden snapshots or `.stamity/manifest.json` runs serialized (the hook card, the guard, and each corpus
    unit's dogfood sync); the later unit re-runs the sync and the snapshot update and confirms only its own entries moved.
R27 Replay safety: the dedicated client folder also carries the user-level pattern-kill guard hook (a PreToolUse(Bash)
    safety hook that adds no model context; identical in both shapes), because the replay's agents run headless with
    permission prompts bypassed inside a throwaway fixture; a run whose tool inputs reach this checkout, the private
    layer, `seeds.json` or the oracles is invalid (`--forbid`).
R28 Replay variance (supersedes the draft's pilot-difference reading): a shape whose three scored runs differ by more
    than 2 seeds found (max − min) gets 2 more scored runs (5).
R29 Threshold scopes, as the maintainer's table reads: loop characters per pass — every changed scored run ≤ 0.5 × the
    baseline median; sub-agent tokens per pass — the changed shape's mean over its scored runs ≤ 1.2 × the baseline's
    mean. The `replay-thresholds` block states both scopes.
R30 Security-seed exemption: a seed is exempt when at least one baseline scored run missed it.
R31 The replay's six passes form one `depends_on` chain in both shapes (deterministic attribution and placement; no
    parallel lanes); the orchestrator's model effort is the client default, recorded from the init event.
R32 Lens digests carry `mode:` (posted or advisory) with the posted count — their existing vocabulary; only the reviewer
    carries the labelled `verdict:` and `confidence:` lines the review gate parses; the reviewer's verdict vocabulary
    stays `approve`, `request-changes`, `blocked`.
R33 The test-runner's green report is written through its shell (it holds execute and no edit tool, on every client) —
    no new capability; a red verdict is always returned in full.
R34 A `BLOCKED_*` return carries no findings block and writes no report.
R35 The `/st-work` body order is the corpus draft's Order G: Phases 0–3, `## Dispatch contract`, `## Return contract`,
    `## Phase 4 — Prove`, `## Dials`, `## Testing philosophy`; the reorder lands as its own move-only commit.
R36 One docs unit owns `README.md`, `docs/getting-started.md` and `test/docsPages.test.ts` (the ledger drafter's docs
    unit folds into the corpus drafter's); `docs/cli-reference.md` and `test/cli/surface.e2e.test.ts` stay with the
    `ledger append` unit.
R37 No shipped body names a client or a model (a corpus invariant); the manual resume-card line is phrased by
    capability ("where the client does not re-run its session-start hook after a compaction").

## Open questions

None — no clarification marker remains: the drafts' open details are settled in § Resolved details, and the two facts only a run can settle — whether a background verdict agent's `Write` passes the client's permission step unprompted, and where the 5,000-token re-attachment cut falls on the reordered body — are measured by the replay's canary and pilot (file 3), with the full inline return as the declared fallback.
