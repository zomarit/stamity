---
id: epic-audit-frame
type: rule
description: Carries the assessment-epic scaffold the pack's commands share — module taxonomy, epic and sub-issue shape, board sync, failure handling, and the guardrails that keep an assessment from turning into a change.
tags: [board, review]
load: on-demand
scope: agent-requested
obsolete_when: board platforms accept a whole dependency-ordered assessment epic in one call
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
3. **Table it.** Present the taxonomy before anything is created, and let the
   operator confirm, add, or drop rows.

| # | Module | Directories | Specs |
|---|---|---|---|
| 1 | {name} | `{path}/` | `{spec}` |

Cross-cutting assessments are named under the table as their own rows, with the
scope each covers. They are not modules and never inherit a module's directory
scope.

## Epic and sub-issue shape

One epic per run. Two levels, and the levels are the dependency order:

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

Labels: the epic carries `meta:<epic-label>`; every sub-issue carries the
finding label `meta:<epic-label>-findings` so the set is recoverable later by
query rather than by memory.

## Board sync

The board primitive lives in `/stamity-board`, and this block is the wrapper
around it — not a second definition of it.

1. Create the epic, record its identifier, then create and link each sub-issue
   to it. A link that fails is reported and left for a manual fix; the created
   sub-issue is not deleted, because deleting it loses the authored body.
2. Sync the epic and every sub-issue to the linked board with status ready.
3. Refresh whatever board overview the source maintains, using the item set
   already read in step 1 rather than re-querying it.

A board write that fails is a warning, not a run failure: the assessment is
finished, and the sync is repeatable afterwards.

## Failure handling

| Failure | Response |
|---|---|
| Item search fails | Retry once, then continue on the assumption that no `<epic-kind>` epic is open, and say so |
| Item creation fails | Retry once, then present the drafted body for manual creation |
| Sub-issue linking fails | Report the orphan and name it; the body survives |
| Board sync fails | Warn and continue; the sync is re-runnable |
| The board source is not linked | Degrade to the command's report output; this is not an error |

## Guardrails

- **The command creates items; it changes no product code.** No source file, no
  configuration, no dependency manifest is touched by an assessment run.
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
