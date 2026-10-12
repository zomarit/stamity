---
id: epic-audit-frame
type: rule
description: Carries the assessment-epic scaffold the pack's commands share — module taxonomy, epic and sub-issue shape, the proposal-versus-write-back split, failure handling, and the guardrails that keep an assessment from turning into a change.
tags: [board, review]
load: on-demand
scope: agent-requested
obsolete_when: the board write-back contract opens an item-creation channel a pack command can call
---

# Epic-Audit Frame

The scaffold shared by every command in this pack that opens an assessment
epic. A command cites the block it needs with a one-line pointer and supplies
its slots; the block itself is stated once, here.

Slots are written `<name>` and are the only text a command varies.

## Module taxonomy

The product is assessed module by module, and the module list comes from the
repo rather than from a convention:

1. **Discover.** Read the top-level source directories and the workspace or
   package layout. A logical unit is one that owns its own entry point, its own
   tests, or its own deployable — not every directory that exists.
2. **Map to specs.** Where a spec directory exists, map each module to the
   `<spec-kind>` documents it answers to. A module with no spec is recorded as
   a taxonomy gap; the gap is itself reportable.
3. **Table it.** Present the taxonomy before anything is proposed, and let the
   operator confirm, add, or drop rows.

| # | Module | Directories | Specs |
|---|---|---|---|
| 1 | {name} | `{path}/` | `{spec}` |

Cross-cutting assessments are named under the table as their own rows, with the
scope each covers. They are not modules and never inherit a module's directory
scope.

## Epic and sub-issue shape

One epic per run, authored as a proposal the run report carries. Two levels,
and the levels are the dependency order:

- **Level 1 — per module.** One sub-issue per taxonomy row. No dependencies:
  the rows are disjoint, so they are worked in any order or in parallel.
- **Level 2 — cross-cutting.** One sub-issue per cross-cutting assessment,
  each naming every Level 1 sub-issue in its dependency section. A
  cross-cutting pass reads module results; starting it early produces a verdict
  over half the evidence.

The epic body carries: scope (`<epic-kind>`, commit, module count), the two
level lists with their sub-issue references, the dependency order, and
acceptance criteria stated as outcomes — every sub-issue closed, every
critical and high finding carrying a route.

Labels ride with the proposal and are never written by the run: the proposed
epic names `meta:<epic-label>` and each proposed sub-issue names
`meta:<epic-label>-findings`, so the set is recoverable by query rather than
from memory once it exists on a board.

## Board write-back

The board primitive lives in `/st-board`, and its write-back contract is four
channels wide — progress comment, PR link, status transition, PR-thread reply.
Neither creating an item nor writing a label is among them. This block is the
wrapper around what those channels already allow — not a second definition of
them, and not a fifth one.

1. **The epic and its sub-issues leave as a proposal.** The report holds the
   authored bodies and the dependency order, ready for a person to apply.
   Nothing is created from here, and an assessment that named work nobody has
   filed yet has still delivered its result.
2. **What is written is written on an item the board already has.** One
   progress comment per run, naming the findings that land on that item, and a
   status transition where the phase map covers it. Both are channels the
   contract already opens.
3. **A write that would need a fifth channel stops.** It returns
   `BLOCKED_DEPENDENCY` naming the channel it wanted, and the intent travels in
   the proposal instead.

A board write that fails is a warning, not a run failure: the assessment is
finished, and the write is repeatable afterwards.

## Failure handling

| Failure | Response |
|---|---|
| Item search fails | Retry once, then continue on the assumption that no `<epic-kind>` epic is open, and say so |
| A progress comment or status write fails | Retry once, then warn and continue; the assessment stands and the write is re-runnable |
| A write would need a channel the contract does not open | Return `BLOCKED_DEPENDENCY` for that write alone; the proposal carries the intent and the run still reports |
| The board source is not linked | The command's report is the whole output and the proposal rides in it; this is not an error |

## Guardrails

- **The command proposes items; it changes no product code.** No source file,
  no configuration, no dependency manifest is touched by an assessment run, and
  no board item is created or labelled — those leave as proposals.
- **Scope is the taxonomy.** Exactly the confirmed modules plus the named
  cross-cutting assessments. A run does not grow new item types mid-flight.
- **Severity survives the pipeline.** A severity is reduced only by an operator
  decision made in session, and a critical or high finding always reaches the
  output.
- **Every finding carries evidence and a route.** `path:line` or a verify check
  id, plus where the fix goes. A finding with neither is an open question, and
  it is reported as one.
- **Checkpoints are asked, not assumed.** Where a block says to confirm the
  taxonomy or choose between open epics, the run stops and asks.
- `<extra-guardrails>` — the citing command appends its own after this set.
