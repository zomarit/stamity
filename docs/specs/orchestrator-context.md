---
id: orchestrator-context
# A design document, authored from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23 and excluded from the site build.
status: design
obsolete_when: every supported client hands a parent a sub-agent's full report by reference and restores a running flow's state after a compaction on its own, or a decision row cuts the surface
---
# Orchestrator context economy

This spec covers what enters the `/st-work` orchestrator's context and what stays on disk.
Full reports stay on disk and the orchestrator gets a digest. A CLI verb writes the findings
ledger. A dispatch points at a plan unit instead of restating it. After a compaction, a card
recomputed from disk re-grounds the run. The requirements are merged to `main` for 1.10.0 and
are not released: `status: design` records that state, because the spec-status gate admits only
`design`, `shipped` and `shipped-with-<x.y.z>` (amendment A15), and the 1.10.0 release close
moves it to `shipped-with-1.10.0`. No requirement here merged before the replay's quality floor
held (REQ-CTX-015).

Contract numbers (C1–C12) and decision numbers (D1–D11) refer to the shared-contract and
decision sections of `docs/plans/009-orchestrator-context-economy-01.md`. That plan carries the byte shapes. Amendment
numbers (A1–A22) and resolution numbers (R1–R39) refer to its Spec text and Resolved details
sections. Once a test named under References exists, it is the normative record for its
requirement. Line citations in the requirement statements are to the tree at `fed39ac`, as the
Context's are, except those an amendment adds (A17, A18); the body reorder (REQ-CTX-014) has
since moved most `content/commands/st-work.md` lines.

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
   - a verdict-role return on Cursor, GitHub Copilot CLI and Codex, and on a Claude Code
     plugin install (amendment A2);
   - a return whose report write was refused, which says so (amendment A12).

   The 1,500-character cap binds prose only. A digest never drops a Critical or Warning line,
   a security-relevant finding, or a contract-delta row to meet it.
4. **No name or row id from outside this repository** appears in this spec or in any artifact
   these requirements commit. The leak gate is the check.

| Requirement | Claude Code | Cursor | GitHub Copilot CLI | Codex |
|---|---|---|---|---|
| 001, 002 two-tier returns | yes | yes | yes | yes in the agent definitions; no `/st-work` body is emitted (`docs/capability-matrix.md:240`) |
| 003 verdict-role report write | yes; degraded on a plugin install (the container hook layout): no `Write`, full inline return (amendment A2) | degraded: full inline return, disclosure line | degraded: full inline return, disclosure line | degraded: full inline return, disclosure line |
| 004 report naming | yes | yes | yes | yes |
| 005–008 ledger verb, fields, fixer, closures | yes | yes | yes | verb yes; the body-carried steps have no carrier |
| 009–012 dispatch, amendment, implementer return, record head | yes | yes | yes | agent-definition parts yes; body-carried parts have no carrier |
| 013 resume card | hook after compaction, and the verb | the verb, run by hand after a compaction summary | the verb, run by hand after a compaction summary | hook after compaction, and the verb |
| 014 body order | yes | not applicable: no documented body re-attachment | not applicable: no documented body re-attachment | not applicable: no body emitted |
| 015 replay | measured | `not-run`, with reason | `not-run`, with reason | `not-run`, with reason |

## References

- `docs/plans/009-orchestrator-context-economy-01.md`: the shared contracts C1–C12, the decisions D1–D11, the amendments A1–A22 and the resolutions R1–R39.
- `test`: `test/records/ledgers.test.ts` (ledger grammar); `test/corpus/commands/work.test.ts`
  (body cap, dispatch contract, the new order case); `test/hooks/scripts.test.ts` (guard,
  session-start card); `test/evals/locators.test.ts` (moved cited ranges).
- `source`: `content/commands/st-work.md`; `content/agents/stamity-{implementer,fixer,spec-author,test-runner,reviewer,security,performance,design-quality}.md`;
  `src/roster/agentPolicies.ts`; `src/tools/allowlist.ts`; `src/tools/translator.ts`;
  `src/hooks/scripts.ts`; `src/cli/commands/learn.ts` (the hidden-verb precedent);
  `scripts/replay/compare.mjs` and `scripts/replay/score.mjs` (the comparison's readings, amendment A22).
- `evals/replay/REPLAY-v1.md`: the replay's protocol and thresholds.

## Requirements

Each requirement is listed with the proposal it belongs to. REQ-CTX-015 decides merges per
proposal:

- P1: 001–004
- P2: 005–007
- P3: 008
- P4: 009–011
- P7: 012–013
- P8: 014

### REQ-CTX-001 — Execution roles write the full report to disk and return a digest

The implementer, the fixer, the spec-author, and a test-runner whose gates all pass each write
their full report to the C1 path and return the C4 digest. This holds on all four clients.
These roles already hold edit on every client, so the change is carried in their definitions
and needs no engine grant. Only the reviewer's digest carries the labelled `verdict:` and
`confidence:` lines the review gate reads (amendment A4). The test-runner's green digest is
`status:`, `report:`, its verdict line (`green`), `security:` and `contract delta: none`, with
no `findings:` line because green means every gate passed; `green` lies outside the review
gate's vocabulary, to which `src/hooks/scripts.ts::buildReviewGateScript` narrows its parse, so
the gate never reads it as a review verdict (C4). A report write that is refused falls back to the
full inline return with its findings block, saying so, and the dispatch names the report by its
absolute path in the main checkout (amendment A12).

Implements C1, C4 (D1).

### REQ-CTX-002 — The never-digested classes and the never-cut lines

- **Returned in full, never digested:** a `BLOCKED_*` return, a red test-runner return, a
  researcher return, and a verdict-role return where the client grants no report write — on
  Cursor, Copilot and Codex, and on a Claude Code plugin install (amendment A2). A return whose
  report write was refused is returned in full and says so (amendment A12). A `BLOCKED_*`
  return carries no findings block and writes no report (amendment A11).
- **In every digest:**
  - every Critical and Warning finding, one line each;
  - Minor findings as a count plus their ids and locators;
  - every security-relevant finding, verbatim;
  - every contract-delta row, with all six census columns.

Only the reviewer's digest also carries the labelled `verdict:` and `confidence:` lines; a
lens's digest carries `mode:` (posted or advisory) with its posted count, and performance's also
names whether a declared budget was breached (amendment A4).

A red test-runner's excerpts are ledger evidence (`content/commands/st-work.md:250`). The
security exemption restates the existing rule (`content/commands/st-work.md:336-339`) for the
new return shape.

Implements C4.

### REQ-CTX-003 — Verdict-role report write on Claude Code, and the degradation elsewhere

On Claude Code, the reviewer and the `security`, `performance` and `design-quality` lenses
write their report through a `Write` limited to their own role's reports under
`.stamity/runs/*/reports/` (amendment A1):

- **Policy document.** Each verdict row gains an optional `writePaths` field naming only its
  own role's reports: `.stamity/runs/*/reports/*-reviewer-r*.md`, `*-security-r*.md`,
  `*-performance-r*.md` and `*-design-quality-r*.md`, so no verdict role can overwrite
  another's (amendment A1). `allow` is unchanged and the schema stays
  `stamity/agent-tool-policies/v1` (`src/tools/allowlist.ts:144`).
- **Enforcement.** The pre-tool-use guard enforces the path list by resolving
  `tool_input.file_path`:
  - it must fall inside the project root the guard anchors on (`.claude/settings.json:33`);
  - no symlink is allowed on the path and no `..` segment;
  - it must match the pattern. The guard reads the last `*` of a pattern's final segment (the
    round number before `.md`) as one or more ASCII digits only, so a pass slug holding another
    role's token opens no other role's report (amendment A20).
- **Digest.** The reviewer returns the C4 digest with labelled `verdict:` and `confidence:`
  lines, so the review gate still parses them. A lens returns the C4 digest with `mode:`
  (posted or advisory) and its posted count, and performance's also names whether a declared
  budget was breached (amendment A4).
- **Refused write.** A report write that is refused falls back to the full inline return with
  its findings block, saying so; the dispatch names the report by its absolute path in the main
  checkout (amendment A12).
- **Plugin installs.** On a Claude Code plugin install (the container hook layout, which
  anchors no project root) the verdict roles get no `Write` and return in full inline — a
  declared degradation (amendment A2).
- **Other clients.** On Cursor, Copilot and Codex, the grants stay read-only. The verdict roles
  return in full inline with their C2 block, and the emitted capability disclosure says so.

Ruled out:

- A grant through the `edit` category. On Claude it also brings `Edit` and `NotebookEdit`
  (`src/tools/translator.ts:71`). On Cursor, Copilot and Codex, where the guard has no agent
  identity, it would widen the verdict roles to full edit (`docs/capability-matrix.md:259-261`).

Implements C8 (D1).

### REQ-CTX-004 — Report naming, and a folder git ignores

- **Path.** Reports live at `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`, under the
  main checkout's run folder. A lane agent writes there by absolute path.
- **Pass name.** `<pass>` never begins with `report`, `summary`, `findings` or `analysis`,
  because Claude Code refuses a sub-agent's Write whose basename matches
  `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`.
- **Ignore rule.** The `reports/` folder is git-ignored. Each run's `reports/` holds a
  `.gitignore` whose one line is `*`, created at Frame and ensured by `stamity ledger append`
  and `close`; this repository's root `.gitignore` also ignores the folder (amendment A3). The
  ledger and the record beside it stay tracked, and the ledger remains the durable record.

Implements C1.

### REQ-CTX-005 — `stamity ledger append`, the one serialized ledger writer

`stamity ledger` is a hidden plumbing verb, modelled on `learn capture`
(`src/cli/commands/learn.ts:14-22`, `:426-427`).

- **`append` validates the C2 block.** A malformed line refuses the whole append and names the
  line. A refusal lists at most the first 20 problems, then one line `… +<m> more problem(s)`;
  its `--json` document is `{ error, problems, omitted }`, with `problems` holding those 20 at
  most and `omitted` always present, 0 included; every fragment of report text a message quotes
  is cut at 60 code points plus `…` (amendment A21). An empty block exits 0, appends no row,
  prints nothing on stdout and exactly one line on stderr (amendment A19).
- **Rows.** It appends one `open` row per finding, with ids `<run-id>/<phase>/<n>` continuing
  the run and phase's highest n. It sets `report` and `decision_needed`.
- **Output.** It prints one line per row: `<ledger-id> <severity> <report-local id>`, with a
  trailing ` decision-needed` on the line of a row carrying `decision_needed: true`
  (amendment A5).
- **One report, one role, once.** `append --report` refuses a `--source` other than the
  `<role>` segment of the report's name (`src/cli/commands/ledger.ts:286-296`); a `--stdin`
  append names no report, so no role is compared. A report the ledger already carries rows
  from is refused, naming those rows: a report is appended once
  (`src/runs/ledgerStore.ts:412-423`).
- **Ids a close reads.** `close --report` reads every id, in `--ids` and in the closures block,
  through `qualifyLedgerId`: a short `<phase>/<n>` is qualified with the `--run` id, any other
  spelling is taken as given, and an id whose first segment names another run refuses the whole
  close (`src/runs/ledgerStore.ts:469-486`, `:638`, `:665`).
- **Write scope.** It writes only under `.stamity/runs/<run-id>/`. A report path must resolve
  inside that run's `reports/`.
- **Locking.** It serializes through the engine's write lock (`acquireWriteLock`, R22): a lock
  directory, `<ledger>.lock`, created exclusively beside the ledger and stale after 15 s by
  default; the ledger then lands through a temp file plus rename (`src/runs/ledgerStore.ts:35-41`,
  `src/merge/atomicWrite.ts:162`, `:381`).

Implements C2, C7 (D2).

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

### REQ-CTX-007 — A fixer is dispatched by report path and ledger ids

A fixer's dispatch names the report path and the ledger ids it answers. Its scope is those
ids, and it returns one disposition per id, using the existing vocabulary
(`content/agents/stamity-fixer.md:97-107`).

The dispatch also carries the orchestrator's sign-off beside each `decision_needed` id it
names, and REQ-CTX-006's run-record sign-off line stays too. The fixer fixes such a row only
then, and otherwise returns it `unresolved` (`content/agents/stamity-fixer.md:27-29`,
`content/commands/st-work.md:176-183`; amendment A18).

Implements D2 and C10's dispatch form.

### REQ-CTX-008 — Re-review closures and `stamity ledger close`

A re-review returns:

- a `stamity-closures` block, with one closure per prior ledger id;
- new Critical and Warning findings only, in C2;
- the labelled `verdict:` and `confidence:` lines;
- one `read: <files>; lenses: <list>` line.

`stamity ledger close --report` requires `--ids <comma list>`, the ledger ids handed to that
re-review; a `--report` close without `--ids` is refused, and a closure naming an id outside the
list refuses the whole close, as an unknown id does (amendment A17). `content/commands/st-work.md`
tells the orchestrator to pass the handed ids (`content/commands/st-work.md:272-277`). It
applies the closures:

- `fixed` → `fixed`;
- `rejection-upheld` → `rejected`;
- `not-fixed`, `regressed` and `rejection-overturned` stay `open`, with the rationale appended.

`stamity ledger close --id` applies one manual transition. Either form rewrites the row in
place and refuses an unknown id.

Implements C9, C7 (D3).

### REQ-CTX-009 — Pointer dispatch, and an in-flow plan persisted once

A dispatch names the persisted plan unit by path and unit id, never by line number, plus
run-specific parameters, in at most 15 lines. An in-flow plan is persisted once, as
`.stamity/runs/<run-id>/plan.md`, in `/st-plan`'s unit shape
(`content/commands/st-plan.md:341-350`). That replaces "persisted nowhere"
(`content/commands/st-work.md:52-54`).

Implements C10 (D4).

### REQ-CTX-010 — Plan-cell amendment, and `BLOCKED_DEPENDENCY` on a cell that no longer resolves

- **Amendment.** The spec-author gains a third consumer job, beside spec-delta merge and
  plan-artifact draft (`content/agents/stamity-spec-author.md:35-48`). When an implementer's
  contract delta moves a seam a later unit relies on, the spec-author amends that later cell in
  place with the line `amended <UTC date>: <what moved> (<commit>)`.
- **Reviewer pass.** When the spec-author amends the cell of a unit that touches a security
  trigger path or a shared contract, the reviewer reads the amended cell before that unit is
  dispatched (amendment A10).
- **Unresolvable cell.** An implementer whose cell names an interface that does not resolve at
  HEAD returns `BLOCKED_DEPENDENCY`.

Implements C10 (D4).

### REQ-CTX-011 — The implementer's return carries its census closure and its report path

The implementer's return contract (`content/agents/stamity-implementer.md:86`) gains:

- the `report:` line;
- the `contract delta:` rows in census grammar, each closing `clean`, `reconciled(N)` or
  `N unreconciled` (the contract-census rule, Floor 5), or `none`.

Implements C4 (D4).

### REQ-CTX-012 — The run record's head names the plan and the invocation

The first 15 lines of `.stamity/runs/<run-id>/record.md` carry:

- the existing `Status:` line;
- `Plan: <repo-relative plan path>`;
- `Invocation: <the exact /st-work command line>`.

The two new lines are written at Frame.

Implements C5 (D6, D7).

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
  `stamity ledger status` by hand after a compaction summary. The body phrases this by
  capability — where the client does not re-run its session-start hook after a compaction — and
  names no client (amendment A7).

The card's output is screened like the session-start loader's other output. A screen hit
prints one withheld line naming the run and the pattern id, never the screened value
(amendment A16).

Ruled out:

- A pre-compaction hook or a new hook event. The review gate's events are derived from every
  Claude extension row except `ConfigChange` (`src/adapters/claude.ts:245-247`), so a new row
  would also wire the review gate onto it.

Implements C6, C7 (D6).

### REQ-CTX-014 — The `/st-work` body's order puts what a resumed run needs before the re-attachment cut

The body's top-level order is Phases 0–3, `## Dispatch contract`, `## Return contract`,
`## Phase 4 — Prove`, `## Dials`, `## Testing philosophy` (amendment A6). That puts the
Dispatch contract (including the failure ladder and the findings-ledger rule), the Return
contract and the Review loop within the body's first 18,000 characters. That keeps them under
Claude Code's 5,000-token re-attachment cut, with margin. Dials (with the Model ladder table)
and Testing philosophy sit at the end. The reorder removes no text, and a test pins the order.
The body stays within its 500-line cap (`test/corpus/commands/work.test.ts:66`).

Implements D7.

### REQ-CTX-015 — The replay, its floor, and the merge gate

A replay compares the changed shape with the 1.9.1 baseline:

- **Scope.** It runs `/st-work` on Claude Code only, one run at a time on the account the
  operator's own logged-in client folder carries (D11; no credential is copied), on a
  disposable fixture with seeded defects. Every run records the init event's skills, agents,
  slash commands, plugins and MCP servers, identical within a shape (amendment A8).
- **Scoring.** A deterministic matcher: the seed's file, a line within ±3 of the seed's span,
  and one of the seed's accepted terms. No model judge.
- **Protocol first.** The protocol and thresholds are committed as `evals/replay/REPLAY-v1.md`
  before the pilot.
- **Samples.** 1 pilot plus 3 scored runs per shape; a shape whose three scored runs differ by
  more than 2 seeds found (max − min) gets 5, and the pilots are not read for it
  (amendment A8).
- **Floor readings.** A security seed is exempt when at least one baseline scored run missed
  it; the loop-character bar binds every changed scored run against the baseline median; the
  sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the
  baseline shape's mean (amendment A8). Decoy flags and passes approved with a seed unfixed
  compare per-scored-run rates, because the shapes may run 3 or 5 scored runs
  (`scripts/replay/compare.mjs:170-175`).
- **Merge gate.** The package merges only after the floor holds.
- **Release gate.** Every eval-set floor holds at the 1.10.0 release run.

Implements C12 (D9, D10).

## Acceptance criteria

One set per requirement, plus one for the invariants. There are ninety-nine criteria:
`grep -c "^- GIVEN" docs/specs/orchestrator-context.md` returns 99. Each is machine-checkable
unless tagged `judgment:`. Run the command again whenever this section grows; do not count by
eye.

**Invariants**

- GIVEN the tree carrying this spec, the replay's committed artifacts and the emission
  `stamity sync` produces from this change WHEN `npm run gate` runs THEN it exits 0.

**REQ-CTX-001**

- GIVEN `stamity sync` on a manifest selecting all four clients WHEN each client's emitted
  definition of the implementer, fixer, spec-author and test-runner is read THEN its return
  contract writes the full result to the report path the dispatch names (the grammar
  `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md` is the Report path bullet of
  `content/commands/st-work.md`, which the dispatch applies) and names no `confidence:` label;
  the implementer's, fixer's and spec-author's digest names the labels `status:`, `report:`,
  `findings:`, `security:` and `contract delta:` in that order and no `verdict:` label; and the
  test-runner's digest, on a green verdict only, names `status:`, `report:`, its verdict line
  (`green`), `security:` and `contract delta: none` in that order, with no `findings:` line,
  because green means every gate passed (C4).
- GIVEN a changed-shape replay run WHEN an implementer, fixer or spec-author dispatch returns
  `status: DONE` THEN a file exists at the path its `report:` line names, and the message's
  text outside the labelled lines and their rows is at most 1,500 characters.
- GIVEN a test-runner run in which every gate passes WHEN it returns THEN it returns a digest
  whose `report:` file holds one row per gate with the exact command run.

**REQ-CTX-002**

- GIVEN `content/commands/st-work.md` WHEN its Return contract section is read THEN it names
  all four never-digested classes by capability — any `BLOCKED_*` return, a red test-runner
  return, a researcher return, and a verdict role's return where its client grants no report
  write — and names no client (R37).
- GIVEN a test-runner run with a failing gate WHEN it returns THEN the message itself carries
  that gate's exact command and its verbatim failing excerpt, and no `report:` line stands in
  for them.
- GIVEN `content/agents/stamity-researcher.md` WHEN `git diff v1.9.1 -- content/agents/stamity-researcher.md`
  runs on the merged tree THEN the Return contract section shows no changed line.
- GIVEN each of `content/agents/stamity-{implementer,fixer,reviewer,security,performance,design-quality,spec-author}.md`
  WHEN its digest sentence is read THEN it lists, before "then at most 1,500 characters of
  prose", a `findings:` line carrying every Critical and Warning (the fixer's: one disposition
  per handed ledger id, then every new Critical and Warning), a `security:` line carrying every
  security-relevant finding in full, and a `contract delta:` line carrying the census rows in
  full or `none`, so the cap attaches to the prose alone; and GIVEN
  `content/agents/stamity-test-runner.md` WHEN read THEN it digests only a `green` verdict, one
  in which every requested gate reported `pass`, and returns a `red` one in full.
- GIVEN every digest in the changed-shape replay runs WHEN compared with the `stamity-findings`
  block of the report its `report:` line names THEN all of these hold:
  - every Critical and Warning appears in `findings:` as `<id> <locator> — <summary>`;
  - the Minors appear as a count plus their ids and locators;
  - every `"security":true` finding appears in `security:` verbatim, and `security: none`
    appears only when there are none;
  - every census row in the report appears in `contract delta:` with all six columns.

**REQ-CTX-003**

- GIVEN `stamity sync` on a manifest selecting all four clients WHEN
  `.stamity/generated/agent-tool-policies.json` is read THEN all of these hold:
  - `schema` is `stamity/agent-tool-policies/v1`;
  - the reviewer, security, performance and design-quality rows each carry a `writePaths`
    naming only that role's reports — `[".stamity/runs/*/reports/*-reviewer-r*.md"]`,
    `[".stamity/runs/*/reports/*-security-r*.md"]`,
    `[".stamity/runs/*/reports/*-performance-r*.md"]` and
    `[".stamity/runs/*/reports/*-design-quality-r*.md"]` (amendment A1);
  - those rows' `allow` lists equal their 1.9.1 values;
  - no other row carries `writePaths`.
- GIVEN the same sync WHEN `.claude/agents/stamity-reviewer.md`,
  `stamity-security.md`, `stamity-performance.md` and `stamity-design-quality.md` are read THEN
  each `tools:` line contains `Write` and contains neither `Edit` nor `NotebookEdit`.
- GIVEN `stamity sync` on a manifest whose Claude Code hooks are plugin-owned, or an emission
  that sets `hookScriptsRoot`, WHEN the Claude definitions of the four verdict roles are read
  THEN no `tools:` line contains `Write` (amendment A2).
- GIVEN the emitted Claude pre-tool-use guard and a reviewer `Write` whose `file_path` is
  `<project root>/.stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md`, with no symlink on
  the path, WHEN the guard runs THEN it exits 0.
- GIVEN the same guard and the reviewer WHEN any one of these calls is made THEN the guard
  exits 2 for each:
  - `Write` on `<project root>/src/index.ts`;
  - `Write` on `…/reports/../ledger.jsonl`;
  - `Write` on `…/reports/u1-reviewer-r1.txt`;
  - `Write` on `…/reports/u1-security-r1.md`, another role's report (amendment A1);
  - `Write` on a report path whose `reports` directory is a symlink;
  - `Write` on an absolute path outside the project root;
  - `Edit` on the allowed report path.
- GIVEN the emitted Claude pre-tool-use guard and the shipped roster WHEN the reviewer calls
  `Write` on `<project root>/.stamity/runs/2026-09-23_demo/reports/ctx-reviewer-report-security-r1.md`
  THEN the guard exits 2, and WHEN the security lens calls `Write` on that same path THEN it
  exits 0 (amendment A20).
- GIVEN the 1.9.1 guard script and the new policy document WHEN a reviewer calls `Write` on
  the allowed report path THEN the guard exits 2.
- GIVEN the same sync WHEN the Cursor, Copilot and Codex definitions of the four verdict roles
  are read THEN Cursor's `readonly:`, Copilot's `tools:` and Codex's `sandbox_mode` equal the
  1.9.1 emission, and each of those clients' emitted capability disclosure carries a line
  stating that verdict reports are returned inline there.
- GIVEN each client's emitted definitions of the security, performance and design-quality
  lenses WHEN their digest is read THEN each names `mode:` (`posted` or `advisory`) with the
  posted count and names no `verdict:` or `confidence:` label, and performance's also names
  whether a declared budget was breached (amendment A4).
- GIVEN the Claude review gate and a reviewer stop whose final text is a digest carrying
  `verdict: approve` and `confidence: high (direct)` WHEN the gate records the round THEN the
  recorded verdict is `approve`, not `unrecorded`.

**REQ-CTX-004**

- GIVEN `content/commands/st-work.md` WHEN read THEN:
  - its Report path bullet states the report path grammar,
    `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`;
  - its frontmatter `spawns:` list names the eight roles `<role>` takes — `implementer`,
    `fixer`, `reviewer`, `security`, `performance`, `design-quality`, `test-runner` and
    `spec-author` — beside `researcher`, which writes no report;
  - its Report path bullet states that a unit id beginning `report`, `summary`, `findings` or
    `analysis` takes a `u-` prefix, so `<pass>` never begins with one of them.
- GIVEN this repository's `.gitignore` WHEN `git check-ignore -q .stamity/runs/2026-09-23_demo/reports/u1-reviewer-r1.md`
  runs THEN it exits 0, and the same command on `.stamity/runs/2026-09-23_demo/ledger.jsonl`
  and on `.stamity/runs/2026-09-23_demo/record.md` exits 1.
- GIVEN a repository whose root `.gitignore` names no reports rule WHEN one
  `stamity ledger append` has run on run `R` THEN `R`'s `reports/` holds a `.gitignore` whose
  one line is `*`, and `git check-ignore -q` on a report there exits 0 (amendment A3).
- GIVEN an implementer dispatched into a linked worktree WHEN it writes its report THEN the
  file exists under the main checkout's `.stamity/runs/<run-id>/reports/`, and the worktree's
  own `.stamity/runs/` holds no file under a `reports/` folder.
- GIVEN every report written in the changed-shape replay runs WHEN its path is tested THEN:
  - the basename does not match `/^(REPORT|SUMMARY|FINDINGS|ANALYSIS).*\.md$/i`;
  - the run folder matches `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$`;
  - the basename matches `^[a-z0-9][a-z0-9-]*-(implementer|fixer|reviewer|security|performance|design-quality|test-runner|spec-author)-r[1-9][0-9]*\.md$`.

**REQ-CTX-005**

- GIVEN the built CLI WHEN `stamity --help` runs THEN no `ledger` row is listed, and WHEN
  `stamity ledger --help` runs THEN it exits 0 and names `append`, `close` and `status`.
- GIVEN run `R` whose ledger holds `R/review/1` to `R/review/3`, and a reviewer report,
  `R`'s `reports/u1-reviewer-r1.md` (its name's role is the `--source` below), whose
  `stamity-findings` block holds `C-1` (Critical) and `W-1` (Warning), WHEN
  `stamity ledger append --run R --phase review --source reviewer --report <that path>` runs
  THEN:
  - it exits 0;
  - the ledger gains rows `R/review/4` and `R/review/5`, each with `state` `open`,
    `rationale` `""`, `evidence` `<locator> — <summary>` and `report` equal to the report's
    repo-relative path;
  - stdout is exactly the two lines `R/review/4 Critical C-1` and `R/review/5 Warning W-1`.

  The same append, run on a block whose `W-1` carries `"decision_needed":true`, prints its
  second line as `R/review/5 Warning W-1 decision-needed` (amendment A5).
- GIVEN the report of the second criterion WHEN `stamity ledger append` runs on it with
  `--source fixer` THEN it exits 1, the message names `reviewer`, the role the report name
  carries, and the ledger is byte-identical; and WHEN the append with `--source reviewer` has
  succeeded once and runs again on that report THEN it exits 1, naming the rows the ledger
  already carries from it, and the ledger is byte-identical.
- GIVEN run `R`'s open rows `R/review/4` and `R/review/5` and a closures block whose
  `ledger_id` values read `review/4` and `R/review/5` WHEN
  `stamity ledger close --run R --report <path> --ids review/4,R/review/5` runs THEN both
  closures apply to `R/review/4` and `R/review/5`; and WHEN `--ids` or the block names an id
  whose first segment is another run's id THEN it exits 1 and the ledger is byte-identical.
- GIVEN a block whose second line carries `"severity":"High"`, a summary of 301 characters, or
  no `locator` WHEN append runs THEN it exits 1, the message names line 2, and the ledger file
  is byte-identical to before.
- GIVEN a report whose `stamity-findings` block holds 25 malformed lines, the first of them
  quoting more than 60 code points of report text, WHEN `stamity ledger append` runs THEN it
  exits 1, stderr names the first 20 problems as `<src>:<line>: <message>` followed by
  `… +5 more problem(s)`, the quoted fragment shows 60 code points plus `…`, and the ledger is
  byte-identical, and WHEN it runs with `--json` THEN the document carries 20 `problems` and
  `omitted: 5` (amendment A21).
- GIVEN a report carrying no `stamity-findings` block WHEN append runs THEN it exits 1 and the
  ledger is byte-identical, and GIVEN a report carrying an empty block WHEN append runs THEN it
  exits 0, appends no row, prints nothing on stdout, and prints exactly one line on stderr:
  `ledger append: no findings in <src>; nothing appended` (amendment A19).
- GIVEN `--report` naming a path with a `..` segment, a path whose leaf is a symlink, or a
  report under another run's `reports/` WHEN append runs THEN it exits 1 and no file under
  `.stamity/` changes.
- GIVEN `--stdin` carrying a valid block of two findings WHEN append runs THEN two `open` rows
  are appended as in the second criterion, and neither carries a `report` key.
- GIVEN two `stamity ledger append` processes started together on run `R`, carrying 3 and 4
  findings WHEN both exit THEN both exit 0, the ledger holds 7 new rows whose ids are distinct
  and contiguous after the previous highest, and no lock directory or temp file remains in
  `R`'s folder.
- GIVEN any `stamity ledger` subcommand run in a clean checkout WHEN it exits THEN
  `git status --porcelain --ignored` lists changes only under `.stamity/runs/<run-id>/`.
- GIVEN `--run ../x` or any value failing `^[0-9]{4}-[0-9]{2}-[0-9]{2}_[a-z0-9-]+$` WHEN any
  `stamity ledger` subcommand runs THEN it exits 1 and writes nothing.

**REQ-CTX-006**

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

**REQ-CTX-007**

- GIVEN each client's emitted fixer definition WHEN read THEN its scope rule names the handed
  ledger ids as its whole scope, and its return carries one disposition per handed id: `fixed`,
  `rejected` with reasoning, or `unresolved`.
- GIVEN each client's emitted fixer definition WHEN read THEN it fixes a `decision_needed` row
  only when its dispatch records the sign-off beside that id, and otherwise dispositions it
  `unresolved` (amendment A18).
- GIVEN `content/commands/st-work.md` WHEN its dispatch contract is read THEN a fix dispatch
  names the sign-off beside each `decision_needed` id (amendment A18).
- GIVEN every fixer dispatch in the changed-shape replay runs WHEN its prompt is read THEN it
  is at most 15 lines, and it names a report path under the run's `reports/` and at least one
  ledger id present in that run's ledger.
- GIVEN every fixer return in the changed-shape replay runs WHEN compared with its dispatch
  THEN it carries exactly one disposition per ledger id the dispatch named.

**REQ-CTX-008**

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
  `stamity ledger close --run R --report <path> --ids A,B,C,D,E` runs THEN:
  - it exits 0;
  - A reads `fixed` and B reads `rejected`;
  - C, D and E read `open`, with rationales extended by their closure status;
  - the ledger's row count, row order and every row id are unchanged.
- GIVEN a closures block naming an id absent from `R`'s ledger WHEN
  `stamity ledger close --run R --report <path> --ids <that id>` runs THEN it exits 1 and the
  message names that id.
- GIVEN a closures block and no `--ids` WHEN `stamity ledger close --run R --report <path>`
  runs THEN it exits 1, the message names `--ids`, and the ledger is byte-identical
  (amendment A17).
- GIVEN a closures block holding valid closures for handed ids and one closure for an open row
  whose id is not in `--ids` WHEN `stamity ledger close --run R --report <path> --ids <the handed ids>`
  runs THEN it exits 1, the message names that id, and the ledger is byte-identical
  (amendment A17).
- GIVEN an open row carrying `decision_needed: true` that a closures block names WHEN
  `ledger close` runs with an `--ids` list that does not hold its id THEN it exits 1 and the
  row still reads `open` with its rationale unchanged, and WHEN the list holds it THEN the
  closure applies (amendment A17).
- GIVEN `stamity ledger close --run R --id R/review/2 --state deferred --rationale "<text>"`
  WHEN it runs THEN row `R/review/2` reads `deferred` with that rationale at its original line
  position, and the same command with an id absent from the ledger exits 1 with the ledger
  byte-identical.
- GIVEN every re-review in the changed-shape replay runs WHEN its return is compared with the
  ledger ids its dispatch handed it THEN it carries exactly one closure per handed id.

**REQ-CTX-009**

- GIVEN `content/commands/st-work.md` WHEN read THEN:
  - it states the dispatch form (role, class, run; unit; worktree; report; gate; boundaries;
    learnings; return), the 15-line ceiling, and the rule that a unit is named by plan path
    and unit id, never by line number;
  - it no longer states that an in-flow plan is persisted nowhere: its intake bullet reads
    ``persisted nowhere under `docs/plans/` ``, and its Decompose bullet writes the in-flow
    plan once to `.stamity/runs/<run-id>/plan.md`.
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

**REQ-CTX-010**

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

**REQ-CTX-011**

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

**REQ-CTX-012**

- GIVEN `content/commands/st-work.md` WHEN its Frame phase is read THEN it instructs writing
  `Plan: <path>` (the `/st-plan` artifact, or the run's own `plan.md` once Phase 2 writes it)
  and `Invocation: <this command line, verbatim>` among the first 15 lines of the run record,
  beside `Status:`.
- GIVEN every changed-shape replay run WHEN its Frame phase has ended THEN:
  - the first 15 lines of `.stamity/runs/<run-id>/record.md` hold exactly one line each
    beginning `Status:`, `Plan:` and `Invocation:`;
  - the `Plan:` path exists;
  - the `Invocation:` value equals, byte for byte, the command the driver sent.
- GIVEN a record whose head reads `Status: In Progress — opened …` and a second whose head
  reads `Status: **closed** — …` WHEN `/^status:.*\bin progress\b/im` is applied THEN the first
  matches and the second does not.

**REQ-CTX-013**

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
  screen WHEN the card is built THEN no text from that value is printed, and the card is the
  one line
  `stamity resume card — run <run> withheld: its text matched screen pattern <id>; the ledger is the recovery point`
  — a withheld line that names the run and the pattern id (the run names its record), never
  the screened value (amendment A16).
- GIVEN `content/commands/st-work.md` WHEN read THEN it instructs running
  `stamity ledger status` after a compaction where the client does not re-run its
  session-start hook, and no client is named in `content/` (amendment A7).
- GIVEN `stamity sync` on a manifest selecting all four clients WHEN the emitted hook wiring is
  read THEN no `PreCompact`, `PostCompact` or `preCompact` event is wired, and the Claude
  review gate's events are exactly `TaskCompleted` and `SubagentStop`.

**REQ-CTX-014**

- GIVEN the emitted `.claude/commands/st-work.md` WHEN character offsets are measured from its
  first byte THEN the last character of each of the Review loop, Dispatch contract and Return
  contract sections sits at an offset below 18,000.
- GIVEN the same file WHEN its headings are listed in order THEN `## Dials` (holding
  `### Intensity` and `### Model ladder`) and `## Testing philosophy` both come after
  `## Return contract`.
- GIVEN the same file WHEN its headings are listed in order THEN `## Dispatch contract` and
  `## Return contract` both precede `## Phase 4 — Prove` (amendment A6).
- GIVEN `content/commands/st-work.md` at the parent of the reorder commit and at the reorder
  commit WHEN the sorted lists of their non-blank lines are compared THEN they are equal.
- GIVEN `test/corpus/commands/work.test.ts` WHEN it runs THEN a case asserts the first two
  criteria on the emitted body, and that case fails when the body is restored to its 1.9.1
  order.
- GIVEN `content/commands/st-work.md` on the merged tree WHEN its lines are counted THEN the
  count is at most 500, and `test/corpus/commands/work.test.ts` passes.
- GIVEN the eval cases whose `source:` cites `content/commands/st-work.md` WHEN
  `test/evals/locators.test.ts` runs on the merged tree THEN it passes with their moved ranges.

**REQ-CTX-015**

- GIVEN `evals/replay/REPLAY-v1.md` WHEN `git log` is read THEN the commit adding its protocol
  and threshold table is an ancestor of the commit adding the first replay result, and no later
  commit changes a threshold value.
- GIVEN the replay's matcher WHEN it scores a finding THEN it counts a match only when all
  three hold, and the scoring code makes no model call:
  - the finding names the seed's file;
  - the line is within the seed's span ±3;
  - the text contains one of the seed's accepted terms.
- GIVEN the committed replay results WHEN counted THEN each shape (the 1.9.1 baseline and the
  changed shape) has 1 pilot and 3 scored runs on Claude Code, or 5 scored runs where its three
  scored runs differ by more than 2 seeds found (amendment A8).
- GIVEN the scored changed-shape runs WHEN security seeds are scored THEN every security seed
  is found in every run, except a seed that at least one baseline scored run missed
  (amendment A8).
- GIVEN both shapes' scored runs WHEN seeded recall is pooled over 36 seed opportunities per
  shape THEN changed ≥ baseline − 1.
- GIVEN both shapes' scored runs WHEN decoys flagged Critical or Warning are counted per scored
  run THEN the changed shape's rate is at most the baseline's — a rate, not a raw count, because
  the shapes may run different sample sizes, 3 or 5 (`compare.mjs::rateRow`).
- GIVEN every valid forced-compaction sample of the changed shape WHEN findings lost are
  counted THEN the count is 0 in each sample.
- GIVEN both shapes' scored runs WHEN verdicts are compared per pass THEN:
  - the final verdict class agrees on at least 5 of 6 passes;
  - rounds agree within ±1 on every pass, comparing each shape's median rounds for that pass
    (`scripts/replay/compare.mjs`);
  - the changed shape approves no more passes with a seed still unfixed per scored run than
    the baseline — a rate, for the same reason (`compare.mjs::rateRow`).
- GIVEN each scored changed-shape run WHEN loop characters per pass are computed THEN each is
  at most 50 % of the baseline shape's median over its scored runs (amendment A8).
- GIVEN the scored runs WHEN sub-agent tokens per pass are computed THEN the changed shape's
  mean over its scored runs is at most 1.2 × the baseline shape's mean (amendment A8).
- GIVEN a pass whose final classes tie for the mode within a shape WHEN the `verdict-class` row
  is computed THEN the tied classes are read as a set, and the pass counts as the same modal
  class only when both shapes' sets are equal (`compare.mjs::modalClasses`,
  `compare.mjs::classRow`; amendment A22).
- GIVEN a shape given more valid scored runs than its sample (3, or 5 on variance) while
  replacements remain WHEN `compare` runs THEN it refuses, naming the shape, and chooses no run
  (`compare.mjs::sampleOf`; amendment A22).
- GIVEN a shape whose pooled recall denominator is 0 WHEN the `pooled-recall` row is computed
  THEN it reads NOT-EVALUATED and the merge gate FAIL (`compare.mjs::recallRow`,
  `compare.mjs::compare`; amendment A22).
- GIVEN every committed replay result WHEN read THEN it records the Claude Code version and the
  init event's skills, agents, slash commands, plugins and MCP servers; every result of both
  shapes records the same version, and each scored run's lists equal those of its own shape's
  pilot (amendment A8).
- GIVEN the committed replay results WHEN read THEN they carry one `not-run` row each for
  Cursor, GitHub Copilot CLI and Codex, each with its reason.
- GIVEN the package's pull request WHEN it merges to `main` THEN its merge commit descends from
  a committed comparison that shows the floor criteria above (the fourth to the tenth) holding
  for every proposal kept, and every dropped proposal's ids read retired in this spec with a
  pointer to the failing result.
- GIVEN the 1.10.0 eval-set run WHEN it is scored THEN every eval-set floor holds before the
  `v1.10.0` tag is created.
