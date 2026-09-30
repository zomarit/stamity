---
id: orchestrator-context
# A design document, authored from docs/plans/009-orchestrator-context-economy-01.md on 2026-09-23, amended from docs/plans/010-enterprise-release-01.md and docs/plans/011-replay-v2.md on 2026-09-26 and from docs/plans/010-enterprise-release-02.md and docs/plans/011-replay-v2.md's R5 on 2026-09-27 and from docs/plans/011-replay-v2-02.md on 2026-09-28, amended on 2026-09-29 by the maintainer's decision to retire the replay, and excluded from the site build.
# The replay's files were deleted on 2026-09-30; every path below reads at tag `replay-frozen-2026-09-30`.
status: shipped-with-1.10.0
obsolete_when: every supported client hands a parent a sub-agent's full report by reference and restores a running flow's state after a compaction on its own, or a decision row cuts the surface
---
# Orchestrator context economy

This spec covers what enters the `/st-work` orchestrator's context and what stays on disk.
Full reports stay on disk and the orchestrator gets a digest. A CLI verb writes the findings
ledger. A dispatch points at a plan unit instead of restating it. After a compaction, a card
recomputed from disk re-grounds the run. The requirements ship with 1.10.0, and
`status: shipped-with-1.10.0` records that; the spec-status gate admits only `design`, `shipped`
and `shipped-with-<x.y.z>` (amendment A15). They merged on the QA sign-off, the gate of record
and CI. They ship without the replay's measurement: R5, the maintainer's decision of 2026-09-27
in `docs/plans/011-replay-v2.md`, took the replay out of the 1.10.0 release. On 2026-09-29 the
maintainer retired the replay, so no replay floor binds any release (REQ-CTX-015, amended
2026-09-29; it read "so the replay's quality floor binds the first release that ships REPLAY-v2's
comparison instead (REQ-CTX-015; D10, amended 2026-09-24 and 2026-09-27)").

Contract numbers (C1–C12) and decision numbers (D1–D11) refer to the shared-contract and
decision sections of `docs/plans/009-orchestrator-context-economy-01.md`. That plan carries the byte shapes. Amendment
numbers (A1–A22) and resolution numbers (R1–R39) refer to its Spec text and Resolved details
sections. Once a test named under References exists, it is the normative record for its
requirement.

REQ-CTX-016, and the paragraphs and criteria marked "amended 2026-09-26" under REQ-CTX-013 and
REQ-CTX-015, come from the spec deltas of `docs/plans/010-enterprise-release-01.md` and
`docs/plans/011-replay-v2.md` and from the deltas their units' reports declared. The paragraphs
and criteria marked "amended 2026-09-27" come from R5 in `docs/plans/011-replay-v2.md`. The
paragraphs and criteria of REQ-CTX-015 marked "amended 2026-09-28" or "added 2026-09-28" come
from R6–R10 in `docs/plans/011-replay-v2-02.md`: defaults taken unattended, which wait for the
maintainer's confirmation. They apply under REPLAY-v2 only; REPLAY-v1 and its measurement stay as
they are. The paragraphs and criteria marked "amended 2026-09-29" record the maintainer's decision
of that day to retire the replay; no plan file carries it.

The replay's files were deleted on 2026-09-30; every path below reads at tag `replay-frozen-2026-09-30`.

Line citations outside the Context section are to the tree at `d227ca57`, the 1.10.0 release
candidate. On 2026-09-27 each one was read at the tree it was first written against and found
again, with the same text, at `d227ca57`. Those trees are `fed39ac` for the plan's own
statements; the spec merges of 2026-09-24 for amendments A17 and A18 (`12d8f20e`), for
REQ-CTX-005's ledger code and the replay's rate rows (`1ae8a318`) and for the `Merge gate:` line
(`1ba8dcee`); and `0a251039` for the 2026-09-26 amendments. Where the text had been reworded
since, the old line range could not be carried over. Such a citation either names the bullet,
section or function, or, where the statement was rewritten on 2026-09-27 to match the new text,
cites that text's current line at `d227ca57`:

- the Plan-artifact intake bullet of `content/commands/st-work.md` and the consumer-job bullets
  of `content/agents/stamity-spec-author.md`, which REQ-CTX-009 and REQ-CTX-010 themselves
  reworded, are cited by name;
- REPLAY-v2's §5, §7 and §8 and `passesOf` and `injectionStatesOf` in `scripts/replay/measure.mjs`,
  which plan 011's R3 and R4 reworded after the 2026-09-26 merge: the seeds now take each
  worktree's own form, a named pass range covers every pass in it, and an injected seed is read at
  review time. REQ-CTX-015 was rewritten for R3 and R4 on 2026-09-27, so it cites their current
  lines at `d227ca57`.

On 2026-09-28 REQ-CTX-015 was amended from `docs/plans/011-replay-v2-02.md`, whose units moved
`evals/replay/REPLAY-v2.md`, `scripts/replay/measure.mjs`, `scripts/replay/score.mjs` and
`scripts/replay/compare.mjs`. Every line citation REQ-CTX-015 makes into those four files is
therefore to the tree at `97e6b49f` (the rebase merge's copy of the branch's `5197d8f0`; the same tree), where every public unit of that plan has landed and its review
loop has converged; each one was read there with the file open. Its citations into
`scripts/replay/protocols.mjs` and `scripts/replay/findings.mjs` read the same at `d227ca57` and at
`97e6b49f`.

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

1. **No replay floor binds a release.** The requirements below ship in 1.10.0 without the
   replay's measurement, and the replay is retired (REQ-CTX-015, amended 2026-09-29), so no
   release waits for a replay comparison and no proposal is dropped for a replay result. The
   eval-set floors still bind every release run. (Amended 2026-09-29, the maintainer's decision;
   it read "**The quality floor binds the release that first ships REPLAY-v2's comparison.** The
   requirements below ship in 1.10.0 without the replay's measurement. The first release that
   ships REPLAY-v2's comparison ships only when that comparison shows the C12 floor held for
   each proposal (REQ-CTX-015; D10, amended 2026-09-24). A proposal that fails is reworked and
   re-measured, or dropped. When dropped, its ids are retired here with a pointer to the failing
   result." Amended 2026-09-27 by R5; it read "No requirement below ships in 1.10.0 unless the
   replay's committed comparison shows the C12 floor held for its proposal".)
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
| 015 replay | retired 2026-09-29 before any scored run (amended; it read `measured`) | `not-run`, with reason | `not-run`, with reason | `not-run`, with reason |
| 016 hook budgets | yes: the session-start rows and the ConfigChange tamper notice at 30 s; the latency check reads this client's guard | yes: the session-start rows at 30 s | yes: the session-start rows at 30 s | yes: the session-start rows at 30 s |

## References

The replay's files were deleted on 2026-09-30; every path below reads at tag `replay-frozen-2026-09-30`.

- `docs/plans/009-orchestrator-context-economy-01.md`: the shared contracts C1–C12, the decisions D1–D11, the amendments A1–A22 and the resolutions R1–R39.
- `test`: `test/records/ledgers.test.ts` (ledger grammar); `test/corpus/commands/work.test.ts`
  (body cap, dispatch contract, the new order case); `test/hooks/scripts.test.ts` (guard,
  session-start card); `test/evals/locators.test.ts` (moved cited ranges).
- `source`: `content/commands/st-work.md`; `content/agents/stamity-{implementer,fixer,spec-author,test-runner,reviewer,security,performance,design-quality}.md`;
  `src/roster/agentPolicies.ts`; `src/tools/allowlist.ts`; `src/tools/translator.ts`;
  `src/hooks/scripts.ts`; `src/cli/commands/learn.ts` (the hidden-verb precedent);
  `scripts/replay/compare.mjs` and `scripts/replay/score.mjs` (the comparison's readings, amendment A22).
- `evals/replay/REPLAY-v1.md`: the replay's protocol and thresholds.
- `evals/replay/REPLAY-v2.md`: the second protocol, where the seeds reach review, with v1's
  thresholds (amended 2026-09-26).
- `docs/plans/010-enterprise-release-01.md` (REQ-CTX-013's read caps, REQ-CTX-016),
  `docs/plans/011-replay-v2.md` (REQ-CTX-015's v2 changes) and
  `docs/plans/011-replay-v2-02.md` (REQ-CTX-015's R6–R10, amended 2026-09-28).
- `test` (amended 2026-09-26): `test/hooks/sessionStartCard.test.ts` and
  `test/runs/resumeCardParity.test.ts` (the card's read caps); `test/emit/hooksInfra.test.ts`,
  `test/hooks/scriptBudget.test.ts` and `test/ci/hookLatency.test.ts` (the hook budgets);
  `test/replay/findings.test.ts`, `test/replay/measure.test.ts`, `test/replay/score.test.ts`,
  `test/replay/compare.test.ts`, `test/replay/seeds-v2.test.ts` and `test/replay/oracle-v2.test.ts`
  (REPLAY-v2's instrument).
- `source` (amended 2026-09-26): `src/runs/layout.ts`, `src/runs/cardSource.ts`,
  `src/runs/resumeCard.ts`; `src/hooks/model.ts`, `src/emit/hooksInfra.ts`, `src/hooks/scripts.ts`,
  `scripts/hook-latency.mjs`; `scripts/replay/protocols.mjs`, `scripts/replay/findings.mjs`,
  `scripts/replay/measure.mjs`, `scripts/replay/score.mjs`, `scripts/replay/compare.mjs`.

## Requirements

Each requirement is listed with the proposal it belongs to. Every proposal ships in 1.10.0
without the replay's measurement (R5, amended 2026-09-27; it read "REQ-CTX-015 decides, per
proposal, what the 1.10.0 release ships"). Each proposal stays as 1.10.0 shipped it: the replay
that was to decide, per proposal, what is kept is retired (REQ-CTX-015, amended 2026-09-29; it
read "REQ-CTX-015 decides, per proposal, what is kept once REPLAY-v2's comparison is measured").
The proposals are:

- P1: 001–004
- P2: 005–007
- P3: 008
- P4: 009–011
- P7: 012–013
- P8: 014

REQ-CTX-016 (the hook budgets, added 2026-09-26 by plan 010 file 1) belongs to none of these
proposals.

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

A red test-runner's excerpts are ledger evidence (`content/commands/st-work.md:376`). The
security exemption restates the existing rule (`content/commands/st-work.md:148-151`) for the
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
  `stamity/agent-tool-policies/v1` (`src/tools/allowlist.ts:163`).
- **Enforcement.** The pre-tool-use guard enforces the path list by resolving
  `tool_input.file_path`:
  - it must fall inside the project root the guard anchors on (`.claude/settings.json:35`);
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
  the close gate reads (`content/commands/st-work.md:401-404`).

Implements C3 (D2).

### REQ-CTX-007 — A fixer is dispatched by report path and ledger ids

A fixer's dispatch names the report path and the ledger ids it answers. Its scope is those
ids, and it returns one disposition per id, using the existing vocabulary
(`content/agents/stamity-fixer.md:104-114`).

The dispatch also carries the orchestrator's sign-off beside each `decision_needed` id it
names, and REQ-CTX-006's run-record sign-off line stays too. The fixer fixes such a row only
then, and otherwise returns it `unresolved` (`content/agents/stamity-fixer.md:27-29`,
`content/commands/st-work.md:177-184`; amendment A18).

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
tells the orchestrator to pass the handed ids (`content/commands/st-work.md:273-278`). It
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
(`content/commands/st-plan.md:341-350`). That replaces "persisted nowhere" in the
Plan-artifact intake bullet of `content/commands/st-work.md`.

Implements C10 (D4).

### REQ-CTX-010 — Plan-cell amendment, and `BLOCKED_DEPENDENCY` on a cell that no longer resolves

- **Amendment.** The spec-author gains a third consumer job, beside spec-delta merge and
  plan-artifact draft (the consumer-job bullets of `content/agents/stamity-spec-author.md`).
  When an implementer's contract delta moves a seam a later unit relies on, the spec-author
  amends that later cell in place with the line `amended <UTC date>: <what moved> (<commit>)`.
- **Reviewer pass.** When the spec-author amends the cell of a unit that touches a security
  trigger path or a shared contract, the reviewer reads the amended cell before that unit is
  dispatched (amendment A10).
- **Unresolvable cell.** An implementer whose cell names an interface that does not resolve at
  HEAD returns `BLOCKED_DEPENDENCY`.

Implements C10 (D4).

### REQ-CTX-011 — The implementer's return carries its census closure and its report path

The implementer's return contract (`content/agents/stamity-implementer.md:92`) gains:

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
  Claude extension row except `ConfigChange` (`src/adapters/claude.ts:246-248`), so a new row
  would also wire the review gate onto it.

Amended 2026-09-26 (plan 010 file 1, `build/32`, `build/40`). The card's reads are bounded by count
as well as by size:

- The ledger is read only up to 4 MiB. Over that, the card says the ledger is too large to read and
  prints no open count, never a partial one.
- At most 256 reports are read. The rest are counted as not checked, never listed as clean. The
  count is of the report-named files the card checks that no ledger row names; ledgered reports and
  files whose names are not report names spend none of it.
- Record heads are read newest first, and the walk stops at the first run in progress.

As built: `LEDGER_READ_MAX_BYTES` is 4,194,304 and `REPORT_READS_MAX` 256 (`src/runs/layout.ts:107`,
`:113`), and the two card lines' words are `CARD_LEDGER_TOO_LARGE` and `CARD_REPORTS_NOT_CHECKED`
(`:171`, `:173`). Both twins apply them: the hook body embeds the constants
(`src/runs/cardSource.ts:102-103`, `:113-114`), refuses a ledger over the bound by its `lstat` size
before reading it (`:226`), stops checking reports at the bound (`:296`), prints both lines
(`:434-441`) and walks run names newest first (`:470`); the engine twin, which `stamity ledger
status` prints, does the same (`src/runs/resumeCard.ts:241-247`, `:282` in `readLedger`, `:363`,
`:502-505`). With the ledger unread, the set of ledgered reports is unknown, so every report counts
as unledgered, still under the 256 cap.
A tail read is ruled out: the ledger is rewritten whole and rows change state in place, so open
rows can sit anywhere. `SECURITY.md:104` states the two bounds.

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

### REQ-CTX-015 — The replay, its floor, and the release gate

The replay's files were deleted on 2026-09-30; every path below reads at tag `replay-frozen-2026-09-30`.

A replay compares the changed shape with the 1.9.1 baseline:

- **Retired** (amended 2026-09-29, the maintainer's decision). REPLAY-v3 is dropped. It stopped
  before any canary, pilot or scored run, because the model provider's safety filter stopped its
  sessions again and again, and its draft pull request #59 closes unmerged. No later replay runs
  either: not the combined replay once planned for the release after 1.10.0, and none after the
  next package's changes. The context economy stays as 1.10.0 shipped it, without the replay's
  measurement. So no replay floor, replay gate or replay comparison binds any release, and no
  `evals/replay/COMPARISON-v2.md` will be committed. The eval-set floors still bind every release
  run. The replay's files stay in the repository, frozen, as the record of REPLAY-v1 and
  REPLAY-v2; whether to delete them is decided later, in the next package's sweep. The bullets
  below describe that frozen instrument as built. Every criterion in this spec that reads replay
  runs or results stays unmet and binds no release.
- **Scope.** It runs `/st-work` on Claude Code only, one run at a time on the account the
  operator's own logged-in client folder carries (D11; no credential is copied), on a
  disposable fixture with seeded defects. Every run records the init event's skills, agents,
  slash commands, plugins and MCP servers, identical within a shape (amendment A8).
- **Scoring.** A deterministic matcher: the seed's file, a line within ±3 of the seed's span,
  and one of the seed's accepted terms. No model judge.
- **Protocol first** (amended 2026-09-26, `build/367`; it read "The protocol and thresholds are
  committed as `evals/replay/REPLAY-v1.md` before the pilot."): each protocol,
  `evals/replay/REPLAY-v1.md` and `evals/replay/REPLAY-v2.md`, is committed before its own first
  result. Each criterion that counts or reads results reads only the results scored under the
  protocol it names, keyed by the protocol path and sha256 each `run.json` records.
- **Seeds reach review (v2)** (amended 2026-09-26, the maintainer's decision R1; amended again
  2026-09-27 for plan 011's R3 and R4, which the instrument shipping in 1.10.0 already carries; it
  read "the driver
  commits that pass's seeds … A dispatch covers the one pass its description names, else the distinct
  passes its prompt names; a pass is injected once, in one commit that carries the session's own git
  identity and clock …"); amended again 2026-09-28 for R6–R10 of `docs/plans/011-replay-v2-02.md`,
  unattended defaults for the maintainer's confirmation, which apply under v2 only. Citations here
  are to `evals/replay/REPLAY-v2.md` and `scripts/replay/measure.mjs` at `97e6b49f` (re-pointed
  2026-09-28; they were at `d227ca57`). The driver lives outside this repository, so it is
  described only by what REPLAY-v2 says it must do.
  - **Start** (amended 2026-09-28, R6, `review/167`; it read "When the first verdict-role dispatch
    that covers a pass starts, the driver's hook injects every covered pass not yet injected, in one
    hook call"). The units start clean (`REPLAY-v2.md:102-103`). A pass is *built* once the
    description of a build-role dispatch names it; every id counts, a range included. A dispatch's
    prompt is never read for this, and a description that names no pass builds nothing. The
    *injection point* is the first verdict-role dispatch after every pass of the plan is built. Its
    hook injects all six passes in one call, before the reviewer's first tool call, in pass order and
    in each worktree's own form, as before, and then snapshots each pass. No other dispatch injects
    (`:106-112`, `:142-146`; `coverageOf`, `scripts/replay/measure.mjs:406-435`). When the injection
    point never comes, nothing is injected and every seed is uncovered (Recall, below;
    `REPLAY-v2.md:144-146`). A pass is injected once, and a hook that runs out of its 120 seconds
    records a partial injection, which makes the run invalid (`:160-161`).
  - **Covered passes** (amended 2026-09-28, R6; it read "A dispatch covers the one pass its
    description names, else the distinct passes its prompt names").
    - A verdict-role dispatch before the injection point covers nothing.
    - A verdict-role dispatch at or after the injection point covers the passes its description
      names (every id, a range included). If the description names no pass, it covers every pass.
    - A fixer covers the passes its description names. If it names none, it covers every pass
      covered by the verdict agents that returned by themselves before it was dispatched. A fixer
      dispatched before any review has returned covers nothing.
    - A build-role dispatch covers the passes its description names; any other dispatch covers
      nothing, and a SendMessage re-review is no dispatch, so it keeps the resumed agent's coverage.
    - A round covers the union of its members' coverage.

    Only a dispatch's description names passes here; its prompt is never read for coverage. This
    coverage governs v2's injection, snapshots, rounds, verdict mapping, round-1 flag, stage, fixer
    round count and capture-defect check (REPLAY-v2 §8, Covered passes, `REPLAY-v2.md:309-332`;
    `coverageOf`, `scripts/replay/measure.mjs:406-435`, read for every agent at `:787-802`). The range
    reading stands, now over the description: a named range covers every pass between its two ends,
    in either direction, so `u1-p1..u3-p2` covers all six; a range mark is `..`, `...`, `…`, an en
    dash, an em dash, or the word `to` or `through`; ranges chain; a list covers its ids alone; and an
    ASCII hyphen is never a range mark (`passIdsIn` with `RANGE_GAP`, `:346`, `:354-367`). A v1
    measurement keeps `passesOf` and reads no range (`:694`; the v2 switch, `:1417`).
  - **The form per worktree.** Each worktree takes the seeds in the form its own state calls for, read
    at the injection (`REPLAY-v2.md:117-130`):
    - `skipped-pristine`: HEAD is still the setup commit and nothing has changed, not even an
      untracked file. The worktree takes nothing, and it is recorded under this form only when it
      holds a seed's anchor.
    - `commit`: HEAD has moved past the setup commit and no tracked file has a change. The seeds go
      in as one commit of exactly the seeded files, with the session's own git identity and clock
      and the subject `chore(<pass>): save work in progress`, so no author, date or subject marks
      it; the driver finds its commits by their recorded shas, never by author or subject.
    - `staged`: the index holds changes. The seed hunk alone goes into both the index and the
      working tree, beside the units' own staged work.
    - `working-tree`: any other state. The seeds go into the working tree, and nothing is staged or
      committed.

    A seed whose anchor only pristine worktrees hold is recorded as not injected (`:132-134`).
    `run.json`'s `injection` record names each seed `injected` or `not injected (anchor missing)`,
    and its `forms` list holds one entry, with the form, the files and the commit sha, per worktree
    that took the seeds, or that is pristine and holds a seed's anchor (`:135-140`).
  - **Snapshots** (amended 2026-09-28, R6; it read "When the first review round covering a pass
    completes, the driver copies the pass's trees again"). Once every pass has gone in, the hook
    snapshots each pass to `captures/snapshots/<pass>/`, the injection snapshot
    (`REPLAY-v2.md:142-144`). The review snapshot of every injected pass is taken when the round that
    holds the injection point completes, meaning every member has stopped and at least one returned
    by itself. If TaskStop stopped every member of that round, it is taken when the next round
    completes. The driver copies the pass's trees again to `captures/review-snapshots/<pass>/`, the
    tree the review saw (`:148-156`; the measurement's path, `scripts/replay/measure.mjs:169`).
  - **Credit** (added 2026-09-28, R6). A finding credits a seed only if its agent was dispatched at
    or after the injection point. A report or ledger finding is assigned to the agent whose digest
    names its report; if no agent's digest names it, it credits a seed only when no verdict agent
    was dispatched before the injection point. A finding that credits no seed is no seed match for
    precision and never reads a seed as fixed for loss (REPLAY-v2 §8, Recall, `REPLAY-v2.md:353-360`;
    `credits`, `scripts/replay/measure.mjs:1247`; the guard, `:1427-1429`).
  - **Agents read from their sub-agent file** (added 2026-09-28, as built, ledger
    `2026-09-28_replay-v2/prove/1`). A verdict agent the measurement reads from its sub-agent file,
    because the main transcript holds no dispatch for it, has no known dispatch time. Its findings
    never credit a seed, and a finding no agent's digest names credits none beside it (`lineOf`,
    `scripts/replay/measure.mjs:1003`; the guard, `:1429`). Its approval never counts as an approval
    for Branch level (below; `:808-810`). No position makes it branch-level, so its characters stay in
    the loop figure (`:814-816`). A fixer read from its sub-agent file counts as dispatched before
    every agent whose passes it shares, so its unknown dispatch time can only raise a round, never
    leave a later find in round 1 (`:833-835`). REPLAY-v2 §8 states these rules
    (`REPLAY-v2.md:299-303`, `:355-359`).
  - **Branch level** (added 2026-09-28, R8, coupled to R6; REPLAY-v2 §8, Pass attribution, read
    "verdict dispatches after `u3-p2`'s last reviewer approval that carry no single id, or that match
    `/whole[- ]branch/i`"). A verdict dispatch is branch-level when its description matches
    `/whole[- ]branch/i` (amended 2026-09-28 on the whole-branch review's `review/30`, unattended;
    it read "description or prompt": the prompt is never read for this, since a re-review's brief
    may mention the whole-branch review that follows it, and that re-review is a loop round) and it
    was dispatched after an approving delivery by a reviewer dispatched at or after the injection
    point, delivered before the dispatch, its own round included (amended 2026-09-28, `review/33`,
    as built; it read "of an earlier round"); an approval before the injection point (a plan
    review), or by a reviewer read from its sub-agent file, counts for nothing here. Every verdict
    agent dispatched after a branch-level one is branch-level too, except one read from its
    sub-agent file (above). Residual: a whole-branch review dispatched before any approval counts as
    a loop round (`REPLAY-v2.md:295-308`, `:570-572`; `joinAgents`,
    `scripts/replay/measure.mjs:803-820`). REPLAY-v1 keeps its own reading (`:821-829`).
  - **Recall.** The measurement reads the injection record, not the snapshot, for a seed recorded not
    injected: it leaves the pooled recall denominator and counts as found in the `security-seeds`
    row, whatever the snapshot reads (`review/135`; `REPLAY-v2.md:163-170`). A seed recorded injected
    is read at review time: from its pass's review snapshot when there is one, else from the
    injection snapshot. A seed injected that reads present in no copy of its pass's review snapshot,
    while some copy there holds its file, was reverted before review; like a seed not injected, it
    leaves pooled recall and holds its `security-seeds` row, and RESULTS names it beside
    `pooled-recall` (`REPLAY-v2.md:361-367`; `seedRowsOf`, `scripts/replay/measure.mjs:1289-1296`; the
    note's rows, `scripts/replay/score.mjs:94`). (Amended 2026-09-28, R7 as built; it read "A seed
    injected and absent from every copy of its pass's review snapshot was reverted before review".)
    A v2 run without the injection record is invalid (`injectionStatesOf`,
    `scripts/replay/measure.mjs:1206-1209`; `REPLAY-v2.md:398-404`). Added 2026-09-28 (R7,
    `review/168`, and R9, `review/170`; the text above stands):
    - *Uncovered seeds.* A seed with no recorded state is *uncovered*: its pass has no entry in
      `run.json`'s `injection`, or its pass's entry leaves it out. An uncovered seed is never found,
      whatever a finding matches, and its run is invalid. RESULTS names each uncovered pass and its
      seeds (`REPLAY-v2.md:172-174`, `:367-371`; `injectionStatesOf`,
      `scripts/replay/measure.mjs:1229-1235`; `seedRowsOf`, `:1284-1288`; the note's rows,
      `scripts/replay/score.mjs:96`). As built, both invalid reasons, a pass with no entry and a
      seed its pass's entry omits, begin with `UNCOVERED_REASON`
      (`scripts/replay/protocols.mjs:58`; `scripts/replay/measure.mjs:1232`, `:1235`), so the
      replacement rule below reads both alike. An uncovered seed enters no pooled denominator,
      because its run is invalid (`REPLAY-v2.md:480`).
    - *Replacement.* A baseline run invalid this way is replaced within §10's cap of 2. A changed
      scored run invalid only this way is not replaced: the rows the changed shape feeds read
      NOT-EVALUATED, and the merge gate FAILs (`REPLAY-v2.md:459-461`; `sampleOf`,
      `scripts/replay/compare.mjs:101-102`, `:107`; `score.mjs check` names the run, `uncoveredOnly`,
      `scripts/replay/score.mjs:646-647`, `:723`).
    - *Capture defect.* The presence-unknown rule is removed for v2. A pass with an injection entry
      and no injection snapshot (`captures/snapshots/<pass>/`), or a seed recorded injected whose file
      is absent from every copy of its pass's injection snapshot, is a capture defect, and the run is
      invalid. As built, so is a seed recorded injected whose file is absent from every copy of its
      pass's review snapshot while the injection snapshot holds it: a file gone from every copy says
      nothing of the seed. A seed injected whose file some review copy holds, and whose `present`
      rule holds in none, keeps its reading as reverted before review (`REPLAY-v2.md:372-376`,
      `:398-404`; `injectionStatesOf`, `scripts/replay/measure.mjs:1218`; `seedRowsOf`,
      `:1302-1308`).
    - *`sec-path-traversal`.* Its fixture does not change. REPLAY-v2 §15 names why its anchor is
      lost: the clean guard admits any PDF name in the invoice directory, which the contract
      forbids, so orchestrators have removed the query or narrowed the guard. Such a seed counts as
      not injected, as the rule already says (`REPLAY-v2.md:547-553`).
  - **Canary** (amended 2026-09-28, R7 and R10, `build/85`; it read "K14: no text the run wrote says
    `BLOCKED` … The canary passes when K5 to K15 all pass", followed by the note that REPLAY-v2's K14
    sentence did not yet state R4's third change; that note is removed). Before any pilot, one canary
    run per shape (`K-inject-baseline`, `K-inject-changed`) proves the mechanics
    (`REPLAY-v2.md:176-192`).
    - *K11:* at least 10 of 12 seeds injected in each shape. *K12* (as built, "covered" reads
      "injected"): each injected pass's snapshot exists, and each injected seed reads present in it.
      *K13:* at least one verdict-role finding cites an injected file. *K15:* at least 10 of 12 seeds
      survive to review in each shape, meaning injected and present in the pass's review snapshot.
    - *K14.* K14 reads only the end of the run, once a seed has been injected: the session's final
      `result`; each run record as copied at the end of the run (a `.md` file directly in the
      fixture's `.stamity/runs/`, or directly inside one of its folders, `reports/` skipped); and the
      orchestrator's last message that carries text, unless that message is dated before the first
      injection. It reads no tool input, dispatch prompt, sub-agent transcript or report. It fails
      when one of those texts says `BLOCKED` or `BLOCKED_<WORD>` and names the injection by one of
      the three existing names (the 7-character sha prefix, the neutral subject, or the path token).
      A run with nothing injected passes K14 (`REPLAY-v2.md:182-190`).
    - *K16.* Every pass of the plan has an entry in the injection record, in each shape
      (`REPLAY-v2.md:180-181`).
    - The canary passes when K5 to K16 all pass (REPLAY-v2 §5, Canary, `REPLAY-v2.md:181`).
- **Scoring (v2)** (amended 2026-09-26, `build/363`, `build/364`, `build/366`):
  - A severity word governed by a negation ("no", "zero", "0", "none of the", "without") is no
    severity. `new`, `remaining`, `open` or `further` may stand between the two, a run of severity
    words joined by `or`, `and` or `nor` is read as one, the count forms `Critical: 0` and
    `0 Critical` are no severity either, and the mask never reaches across a line break.
  - A seed term found only inside the finding's own locator credits nothing, and an all-digit term
    matches only as a number of its own.
  - One review round's verdict counts for every pass the round covers, and so do its findings, at
    the pass stage and as round-1 finds.
  - One term window serves both shapes: a structured finding's terms are read over its summary
    plus the matching entry of its report's `stamity-findings` block, a free-text finding's over
    its own block, and neither reads report prose.
- **Compaction (v2)** (amended 2026-09-26, and 2026-09-27 for the round's members; amended
  2026-09-28, R6, where it read "A round covers every pass any member names … at least one member
  naming that pass returned by itself"): the placements stay `u2-p1` and `u3-p1`. v1's trigger is
  read over the review rounds that cover the placement pass. A round opens at its first
  verdict-role dispatch and stays open until every member has stopped; its members are all the
  verdict-role agents dispatched while it is open, and an agent ended by TaskStop counts as
  stopped. A round covers the union of its members' coverage (Covered passes, above), and a member
  that covers nothing by itself is still a member. A round is complete for a pass it covers when
  every member has stopped and at least one member covering that pass returned by itself. The
  placement fires when the first round covering the placement pass is complete, at least two
  members returned by themselves, no fixer has been dispatched for the pass, and this holds on two
  polls in a row (`evals/replay/REPLAY-v2.md:264-275`). One round that covers both placement passes
  fires one forced compaction, whose record names both passes in `covers`; it is one sample, not
  two (added 2026-09-28, ledger `2026-09-28_replay-v2/prove/3`; REPLAY-v2 §7,
  `evals/replay/REPLAY-v2.md:275-276`). Interrupt mode applies when both canaries pass K1–K4, and both
  shapes run auto-window mode when the two canary records disagree. Under auto-window mode an
  automatic compaction is a sample only when its boundary falls between a lens delivery and the
  next ledger write; one outside is named in the notes, beside `compaction-loss`, and is no sample.
- **Results (v2)** (amended 2026-09-26): v2's runs live in `evals/replay/v2/runs/` and its
  comparison is `evals/replay/COMPARISON-v2.md`. Every command that reads or writes results takes
  `--protocol v1|v2`, defaulting to v1, and refuses a result scored under another protocol. Each
  v2 run's RESULTS and the v2 comparison carry a Clients table with the three `not-run` rows.
- **Samples.** 1 pilot plus 3 scored runs per shape; a shape whose three scored runs differ by
  more than 2 seeds found (max − min) gets 5, and the pilots are not read for it
  (amendment A8).
- **Floor readings.** A security seed is exempt when at least one baseline scored run missed
  it; the loop-character bar binds every changed scored run against the baseline median; the
  sub-agent-token bar compares the changed shape's mean per pass over its scored runs with the
  baseline shape's mean (amendment A8). Decoy flags and passes approved with a seed unfixed
  compare per-scored-run rates, because the shapes may run 3 or 5 scored runs
  (`scripts/replay/compare.mjs:180-185`).
- **Merge.** The package merges on the QA sign-off, the gate of record and CI (D10, amended
  2026-09-24; it read "the package merges only after the floor holds").
- **Replay gate** (amended 2026-09-29, the maintainer's decision: retired with the replay, and it
  binds no release; amended 2026-09-27 by R5, where it read "The 1.10.0 release proceeds only
  after the floor holds on a fixture where seeds reach review (REPLAY-v2, session 2)."). 1.10.0
  does not wait for the replay, and the context-economy proposals ship in it without the replay's
  measurement. No later release waits for it either (it read "The floor binds the first release
  that ships REPLAY-v2's comparison, measured on a fixture where seeds reach review."). v1's
  fixture lets the orchestrator's pre-read catch every seed before review, so its two pilots stay
  in `evals/replay/runs/` as unscored evidence and `evals/replay/REPLAY-v1.md` stays frozen. The
  COMPARISON's literal `Merge gate:` line keeps its name, because the frozen instrument renders it
  (`scripts/replay/compare.mjs:430`); it gates no release (it read "and it gates that release").
- **Release gate.** Every eval-set floor holds at the 1.10.0 release run and at every later
  release run (amended 2026-09-29; it read "at the 1.10.0 release run").

As built (2026-09-26; amended and its citations re-pointed to `d227ca57` on 2026-09-27; amended
for R6–R10 and its citations re-pointed to `97e6b49f` on 2026-09-28):
`evals/replay/REPLAY-v2.md` states the rules above — the injection, the review snapshot, the
not-injected reading and the uncovered seed (§5, `:106-174`), the canary (§5, `:176-192`), the
matcher (§9, `:415-429`), branch level, the covered passes and the verdict mapping (§8, `:295-308`,
`:309-332`, `:390-395`), the injection record, the credit guard, the agents read from their
sub-agent file, the review-time reading, the uncovered seed and the capture defect in recall, and
the invalid run (§8, `:347-376`, `:398-404`), the replacement rule (§10, `:459-461`), compaction
(§7, `:261-286`), the result paths (§11, `:463-471`) and the Clients table (§1, `:34-39`) — and its
one `replay-thresholds` block holds v1's values (`:501-503`). The protocol table is `PROTOCOLS` (`scripts/replay/protocols.mjs:11-14`,
default v1 at `:17`), and an uncovered pass's invalid reason begins with `UNCOVERED_REASON`
(`:58`). The scorer refuses a `run.json` whose recorded protocol sha256 is not the protocol's
(`scripts/replay/score.mjs:830-831`) and a summary scored under another protocol's sha256 or path
(`:903-905`). The matcher's rules are `maskNegated` (`scripts/replay/findings.mjs:82`) and
`matchItems` (`:615`); under v2 the covered passes are `coverageOf`
(`scripts/replay/measure.mjs:406-435`), and v1 keeps `passesOf` with no range (`:380-382`, `:694`);
branch level and the file-built agents' rules are read in `joinAgents` (`:803-820`, `:833-835`), and
the credit guard is `credits` (`:1247`); the
measurement reads the driver's injection record, files a seed recorded not injected as absent at
its pass whatever the snapshot reads, reads an injected seed from its pass's review snapshot when
there is one and files one reverted before review as absent, files an uncovered seed never found,
and marks invalid a v2 run with no record, with an uncovered seed or with a capture defect
(`injectionStatesOf`, `:1201-1237`; `seedRowsOf`, `:1268-1325`); the seeds schema adds `injection`
and `present.notMatch`, and a seed is present only when no `notMatch` pattern matches (`checkSeeds`,
`presentIn`, `:261`, `:288-295`); the Clients table is `clientsTable`
(`scripts/replay/compare.mjs:393-397`), empty under v1 so v1's files stay byte for byte. A
comparison given no scored run for a shape reads every row that shape feeds NOT-EVALUATED, and the
merge gate fails (`compare.mjs:97`, `:353`); so does a changed shape holding a scored run invalid
only for an uncovered pass (`sampleOf`, `:101-102`, `:107`; `spentReasons`, `:318-323`). The v2
fixture is `evals/replay/v2/`. The injection, the snapshots, the placement and the canary checks
K11–K16 are the replay driver's, which lives outside this repository; REPLAY-v2 is the record of
what it must do. Not measured, and now never to be: one v2
pilot, the baseline shape's `2026-09-28-replay-1` (`evals/replay/v2/runs/2026-09-28-replay-1/RESULTS.md:1`),
is committed in this tree, and no v2 canary or scored run is; `evals/replay/COMPARISON-v2.md` does
not exist and will not be committed. So every criterion below that reads v2 results stays unmet,
and since the replay's retirement none of them binds a release (amended 2026-09-29; it read "Not
yet measured: no v2 canary, pilot or scored run is committed in this tree, and
`evals/replay/COMPARISON-v2.md` does not exist, so every criterion below that reads v2 results is
open. Since R5 they stay open through 1.10.0 and bind the first release that ships REPLAY-v2's
comparison", amended 2026-09-27).

Implements C12 (D9, D10).

### REQ-CTX-016 — Declared hook budgets

Added 2026-09-26 (plan 010 file 1, decision D2). Every hook the engine wires declares its budget.

- **Session-start rows** (the resume card and the tamper notice) declare `timeoutMs: 30000` on all
  four clients, in repository mode and in plugin roots.
- **Claude's ConfigChange wiring of the tamper notice** declares the same 30 s (amended 2026-09-26
  on `review/28` and `review/36`). **The pre-tool-use guard and the review gate** declare no
  timeout, on purpose. A timed-out Claude PreToolUse hook lets the call through, and the review
  gate's win32 worst case is about 34.6 s.
- **The emitted scripts** stay under declared byte and line ceilings:
  - guard: ≤ 24,576 bytes and 600 lines;
  - session start: ≤ 49,152 bytes and 1,100 lines;
  - the review gate and the tamper notice: their measured size plus 25%, which is ≤ 51,200 bytes and
    1,120 lines for the review gate (measured 40,740 / 891) and ≤ 3,072 bytes and 90 lines for the
    tamper notice (measured 2,383 / 67), bytes rounded up to a multiple of 1,024 and lines to a
    multiple of 10.

  Lines are counted as `\n` only, so CRLF and LF count alike. Each script is measured as the larger
  of its generated-layout and plugin-root renders, and a client that does not emit a script is
  skipped.
- **Guard latency** over node's own start stays ≤ 15 ms, as the median of 7 warm runs. It is
  measured locally at each release, not in CI.

As built (2026-09-26): the budget is `HOOK_SESSION_START_TIMEOUT_MS = 30_000`
(`src/hooks/model.ts:232`, its reasons in the comment at `:210-231`), set only on the core
`session_start` rows (`src/emit/hooksInfra.ts:448`); the adapters render it as each client's own
field, and Claude's ConfigChange entry takes the whole tamper row, budget included
(`src/adapters/claude.ts:896`). The ceilings are `HOOK_SCRIPT_BUDGETS` (`src/hooks/scripts.ts:128-144`),
each row with the size it was measured at beside it. The latency check is
`node scripts/hook-latency.mjs [--runs <n>] [--guard <path>] [--budget <ms>]`
(`scripts/hook-latency.mjs:7-11`): 7 runs after one warm-up by default (`:53`), a budget of 15 ms by
default (`:51`), exit 1 naming each case over the budget (`:205-208`), and exit 2 when it cannot run,
including a spawn that does not return within 30 s (`:55`). Its non-Write case is a governed call, a
verdict role's `Read` that reaches the policy (amended 2026-09-26 on `review/83`); its CI tests run
under a generous `--budget`, so no timing bound runs in CI (`review/82`). The release checklist runs
it before the tag (`.github/release-controls-checklist.md:235`). Tests: `test/emit/hooksInfra.test.ts`
(the 30-second rows at `:572-575` and the pinned absence on the guard and the review gate),
`test/ci/pluginPackages.claude.test.ts:457` (a built plugin root),
`test/hooks/scriptBudget.test.ts:124`, and `test/ci/hookLatency.test.ts`. Not measured: the resume
card's own wall time against the 30-second budget; the 7-run median is recorded at the release, and
no release has recorded it yet.

## Acceptance criteria

One set per requirement, plus one for the invariants. There are one hundred and eleven criteria:
`grep -c "^- GIVEN" docs/specs/orchestrator-context.md` returns 111. Each is machine-checkable
unless tagged `judgment:`. Run the command again whenever this section grows; do not count by
eye.

**Invariants**

- GIVEN the tree carrying this spec and the emission `stamity sync` produces from this change
  WHEN `npm run gate` runs THEN it exits 0.

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
- GIVEN a ledger over 4,194,304 bytes WHEN the card prints THEN its ledger line reads
  `ledger: too large to read (over 4 MiB)  ·  the ledger is the recovery point` (amended
  2026-09-26).
- GIVEN 257 unledgered reports that carry findings THEN the reports line counts 256 and appends
  `, not checked: 1` (amended 2026-09-26).
- GIVEN the hook and `stamity ledger status` on the same fixture THEN they print the same card
  (amended 2026-09-26).

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

Amended 2026-09-29: the replay is retired (the Retired bullet of REQ-CTX-015). The criteria that
read scored results, the third and the floor criteria from the fourth to the tenth, stay unmet,
and none of them binds a release. The criteria on the instrument's own code stay as they are,
over the frozen files.

- GIVEN each protocol WHEN `git log` is read THEN the commit adding it is an ancestor of the commit
  adding its first result, and no later commit changes a threshold value (amended 2026-09-26; it
  read "GIVEN `evals/replay/REPLAY-v1.md` … the commit adding its protocol and threshold table is an
  ancestor of the commit adding the first replay result").
- GIVEN the replay's matcher WHEN it scores a finding THEN it counts a match only when all
  three hold, and the scoring code makes no model call:
  - the finding names the seed's file;
  - the line is within the seed's span ±3;
  - the text contains one of the seed's accepted terms.
- GIVEN the results scored under `REPLAY-v2.md` WHEN counted THEN each shape (the 1.9.1 baseline
  and the changed shape) has 1 pilot and 3 scored runs on Claude Code, or 5 scored runs where its
  three scored runs differ by more than 2 seeds found (amendment A8). v1's two pilots are not
  counted (amended 2026-09-26; it read "GIVEN the committed replay results").
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
- GIVEN every committed v2 result WHEN read THEN it records the Claude Code version and the init
  event's lists, as the v1 criteria require. The committed v2 results carry the three not-run rows:
  one `not-run` row each for Cursor, GitHub Copilot CLI and Codex, each with its reason (amended
  2026-09-26; it read "GIVEN the committed replay results WHEN read THEN they carry one `not-run`
  row each …", which v1's two pilots do not carry: the Clients table is rendered under v2 only,
  because `clientsTable` returns no line under v1, `scripts/replay/compare.mjs:394`; re-pointed
  2026-09-28 from `:380`).
- GIVEN a v2 run WHEN the injection point's dispatch starts THEN, before the reviewer's first tool
  call, every worktree of the run that is not pristine and holds a seed's anchor carries every
  pass's seeds in the form its own state calls for (`commit`, `staged` or `working-tree`), a
  pristine worktree takes nothing and, when it holds a seed's anchor, is recorded
  `skipped-pristine`, each pass's injection snapshot
  exists, and `run.json`'s `injection` record names each seed `injected` or
  `not injected (anchor missing)` and each worktree's form (amended 2026-09-28, R6; it read "WHEN
  the first review dispatch covering a pass starts THEN … carries that pass's seeds … the pass's
  injection snapshot exists"; amended 2026-09-27 for R3 and R4, where it read "… THEN that pass's
  injected seeds are committed and its snapshot exists before the reviewer's first tool call. The
  run records each seed as injected or not", amended 2026-09-26).
- GIVEN a build-role dispatch described `Build units u1-p1..u3-p2` THEN all six passes are built;
  a description naming the list `u1-p1, u3-p2` builds those two only, and a pass named only in a
  prompt builds nothing (amended 2026-09-28, R6; it read "GIVEN a dispatch with no pass in its
  description whose prompt names `u1-p1..u3-p2` WHEN `passesOf` reads it under v2 THEN it covers
  all six passes, and a prompt naming the list `u1-p1, u3-p2` covers those two only", amended
  2026-09-27, R3; `test/replay/measure.test.ts`).
- GIVEN a v2 run whose injection record names a seed `injected` and whose pass's review snapshot
  holds the seed's file in some copy and the seed in none WHEN the run is measured THEN the seed
  leaves the pooled recall denominator, a security seed counts as found in `security-seeds`, and
  the notes say it was reverted before review (amended 2026-09-28, R7 as built; it read "whose
  pass's review snapshot holds the seed in no copy", amended 2026-09-27, R4;
  `test/replay/measure.test.ts`).
- GIVEN six dispatches described "Build unit u1-p1" … "Build unit u3-p2", then a verdict round
  whose descriptions name the feature and no pass, WHEN the run is measured THEN the round's first
  dispatch is the injection point, the round covers all six passes, and the injection record shows
  each pass injected once, by that one hook call (added 2026-09-28, R6; `test/replay/measure.test.ts`
  for the coverage, REPLAY-v2 §5 for the driver's record).
- GIVEN a reviewer dispatched before the injection point whose finding matches a seed's file, line
  and term WHEN the finding is scored THEN it credits no seed; the same finding from an agent
  dispatched at or after the injection point credits the seed (added 2026-09-28, R6;
  `test/replay/measure.test.ts`).
- GIVEN a v2 run whose injection record has no entry for `u3-p2` WHEN the run is measured THEN
  `u3-p2`'s seeds are uncovered and never found, even when a finding matches them; the run is
  invalid, and RESULTS names `u3-p2` and its seeds (added 2026-09-28, R7;
  `test/replay/measure.test.ts`, `test/replay/score.test.ts`).
- GIVEN a changed scored run invalid only because a seed is uncovered WHEN `compare` runs THEN the
  run is not replaced, the rows the changed shape feeds read NOT-EVALUATED, and `Merge gate:` reads
  FAIL (added 2026-09-28, R7; `test/replay/compare.test.ts`).
- GIVEN a seed recorded injected whose file is absent from every copy under
  `captures/snapshots/<pass>/` WHEN the run is measured THEN the run is invalid as a capture
  defect, and no seed is read as presence-unknown (added 2026-09-28, R7;
  `test/replay/measure.test.ts`).
- GIVEN a verdict dispatch described "Whole-branch review round 1" with no approving reviewer
  delivery in an earlier round WHEN the run is measured THEN the dispatch is pass-level and counts
  as a loop round (added 2026-09-28, R8; `test/replay/measure.test.ts`).
- GIVEN a canary shape whose injection record lacks an entry for one pass WHEN the canary is
  checked THEN K16 fails and the canary fails, even when K5–K15 pass (added 2026-09-28, R7;
  REPLAY-v2 §5, Canary).
- GIVEN a canary where only a dispatch prompt and a report say `BLOCKED` and name
  `src/store/query.ts` WHEN K14 is checked THEN K14 passes; if the session's final `result` says
  `BLOCKED_FAILURE` and names an injection commit's 7-character sha prefix, K14 fails (added
  2026-09-28, R10, `build/85`; REPLAY-v2 §5, Canary).
- GIVEN the finding line `src/config/load.ts:15 — fix held. No Critical findings.` WHEN the matcher
  reads it THEN it yields no finding (amended 2026-09-26).
- GIVEN a Warning whose only matching term sits inside its own locator WHEN it is scored THEN it
  credits no seed and goes to adjudication (amended 2026-09-26).
- GIVEN a reviewer dispatch whose prompt names `u1-p1 u1-p2`, and a finding matching `sec-sql-sort`,
  WHEN a run is measured under REPLAY-v1's measurement (a seeds document with no `injection`) THEN
  the seed reads `foundRound1: true` and `stage: "pass"`, and both passes record that round's
  verdict class and round count (amended 2026-09-26, from the `v2-multipass` unit's report;
  amended 2026-09-28, ledger `2026-09-28_replay-v2/prove/2`, where it read "WHEN the run is
  measured": under v2 a dispatch's prompt is never read for coverage, and R6's criteria above
  govern; `test/replay/measure.test.ts:1117`, `:1123`, run on a seeds document with no
  `injection`).
- GIVEN the first release that ships REPLAY-v2's comparison WHEN its tag is created THEN the
  tagged commit descends from a committed `evals/replay/COMPARISON-v2.md` whose `Merge gate:` line
  reads PASS: the floor criteria (the fourth to the tenth) holding for every proposal kept, as the
  Replay gate bullet stated. Retired 2026-09-29 with the replay (the maintainer's decision): no
  release ships that comparison, so this criterion binds no tag, and no proposal's ids are retired
  for a replay result. (Amended 2026-09-29; after "as the Replay gate bullet states" it read
  "1.10.0 is not that release: it is decoupled from the replay, and the context-economy proposals
  ship in it without the replay's measurement. Open: no v2 comparison is committed. A dropped
  proposal's ids still read retired here with a pointer to the failing result (Invariant 1)".
  Amended 2026-09-27 by R5, the maintainer's decision of that day; it read "GIVEN
  the 1.10.0 tag THEN the tagged commit descends from a committed `evals/replay/COMPARISON-v2.md`
  whose `Merge gate:` line reads PASS: the floor criteria (the fourth to the tenth) holding for
  every proposal kept, as the release-gate criterion states", itself amended 2026-09-26 from a
  criterion on the `v1.10.0` tag and a REPLAY-v2 comparison (D10, amended 2026-09-24).)
- GIVEN the eval-set run of a release, 1.10.0's and every later one, WHEN it is scored THEN every
  eval-set floor holds before that release's tag is created (amended 2026-09-29; it read "GIVEN
  the 1.10.0 eval-set run WHEN it is scored THEN every eval-set floor holds before the `v1.10.0`
  tag is created").

**REQ-CTX-016**

- GIVEN an emitted configuration on any client THEN its session-start entries carry a 30-second
  timeout, and its guard and review-gate entries carry none.
- GIVEN any core hook script over its ceiling THEN the budget test fails naming the script, its size
  and the budget.
- GIVEN `node scripts/hook-latency.mjs` at a release THEN it prints the median table, and exits 0
  when both overheads are ≤ 15 ms, 1 when either is over, and 2 when it cannot run.
