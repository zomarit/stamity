---
id: product-audit
type: command
description: "Whole-product assessment at one commit along a named axis — security, health, or all: reads the per-axis verify artifacts, opens one epic with a sub-issue per module or writes one report, and routes every fix back out."
tags: [review, board]
load: on-demand
obsolete_when: clients natively open evidence-backed assessment epics from machine-readable per-axis verify artifacts
spawns: [researcher, reviewer]
---

# /stamity-product-audit

Assesses the product as it stands at one commit, and turns the result into work
someone else picks up. **This command assesses; it never modifies product
code.** Its only outputs are board items and a report file. Every fix routes to
`/stamity-work`; a finding that questions the design routes to `/stamity-plan`.

## Axes

One run takes one axis. The axis selects which verify artifacts count as
evidence and which cross-cutting assessments join the per-module set.

| Axis | Question it answers | Verify axes consumed | Cross-cutting assessments |
|---|---|---|---|
| `security` | Where can this product be attacked, and what is the blast radius? | `security` | trust boundaries between modules |
| `health` | Where will this product break, and where does it resist change? | `testability` · `reliability` · `maintainability` · `enhancability` · `scalability` · `product-spec` | cross-module wiring · implementation against spec |
| `all` | Both, in one epic over one module taxonomy | the union of the two rows above | both rows above |

The `health` row consumes six axes because its question has two halves and the
second one — where the product resists change — is what `enhancability` and
`scalability` decide. An axis question naming a subject whose axis the run does
not read produces a verdict from the wrong evidence.

Dependency advisories are deliberately not a cross-cutting assessment. That
criterion is the `sec-dep-advisories` row of the security artifact this run
already reads, and the `stamity-dep-audit` skill owns the standalone pass. A
second derivation here would be the no-second-copy rule broken by the command
that states it.

Invocation: `/stamity-product-audit axis=security`. An invocation that names no
axis asks once and declares `all` as the default-if-no-response. `all` is a
single epic over a single taxonomy — never two runs stapled together, and never
a merged verdict that hides which axis produced a finding.

Scope is the whole product by default. A named subset (`axis=health
modules=api,worker`) narrows the per-module set; the cross-cutting assessments
stay in, because they are what a per-module pass cannot see.

## Evidence — the verify seam

Findings rest on the artifacts the `stamity-verify` skill writes, one per axis
per commit:

```
.stamity/verify/<axis>-<sha>.json
```

`<axis>` is a verify axis from the table above and `<sha>` is the short HEAD
sha, `-dirty` suffixed on an unclean worktree. Intake, per required axis:

1. **Read the artifact for the current sha.** Bind to its fields — `checks[]`
   rows (`id`, `kind`, `status`, `evidence`) and `summary` — never to the
   prose of the skill that wrote it.
2. **Missing or stale is not a fallback.** An artifact whose `<sha>` is not the
   current HEAD short sha is stale. Absent or stale, run the `stamity-verify`
   skill for that axis and use what it writes. This command owns no second copy
   of the checks and derives none inline: an assessment that invents its own
   criteria is unreproducible, and the next run would disagree with it for
   reasons nobody can name.
3. **A `-dirty` artifact is evidence about a working tree, not a commit.** Use
   it only when the run is explicitly assessing uncommitted work, and stamp
   every finding it sources with the same `-dirty` marker.
4. **Carry `skipped` forward.** A `skipped` or `not-applicable` row is an
   unexamined area, and it lands in the output as one. Reading a skip as a pass
   is the failure this step exists to prevent.

Evidence bar for anything the artifacts do not already carry: `path:line`, or a
verify check id, or the detection fact behind an absence. A finding whose
evidence is a summary sentence is not a finding.

## Loop

Six steps. Steps 1-3 gather, 4-6 report.

1. **Frame the run.** State the axis, the commit, whether a board source is
   linked, and the resulting output mode, on one line — `axis: security · sha:
   a1b2c3d · board: linked · output: epic`. An open epic already carrying this
   axis stops the run for one question: abort, supersede the open one, or open
   a second alongside it.

   > Epic scaffold: `stamity-epic-audit-frame` → Module taxonomy. Slot:
   > spec-kind = security-relevant specs (threat model, permissions, data
   > model) on `security`; primary specs on `health`; both on `all`.

2. **Gather evidence.** Read the verify artifacts for every axis the run needs,
   refreshing the missing ones per the seam above. Record which artifacts were
   read as-found and which were regenerated — a regenerated artifact means the
   assessment is the first thing that has examined this commit.

3. **Fan out over modules.** One researcher brief per module, dispatched as one
   parallel batch: the module's directories, the verify rows scoped to it, the
   specs it answers to, and the question the axis asks. Briefs are read-only by
   construction, so the batch is safe at full width; only the merge is
   serialized, and this command is its single writer.

   Cross-cutting assessments run as their own briefs and depend on the module
   batch: they read module results, so they start when the batch returns.

4. **Grade.** The reviewer takes the merged evidence and returns a verdict per
   candidate finding: severity on the core `Critical` / `Warning` / `Minor`
   scale, confidence, and the route. That is the scale the reviewer's own
   contract fixes, so nothing here translates it — a pack scale with no mapping
   would drop every row that landed in a level the reviewer cannot return.
   Severity is never reduced without the operator saying so in session, and
   every `Critical` or `Warning` finding reaches the output — suppression at
   this step would make the whole run unfalsifiable.

5. **Emit.** Board items or a report, per the output modes below.

6. **Close.** One recap: axis, commit, modules assessed, findings by severity,
   artifacts read versus regenerated, and the count of unexamined areas carried
   from `skipped` rows. A run that found nothing recaps the same way, with an
   empty finding list — that is the terminal state of a clean assessment.

## Findings contract

Every finding, in either output mode, carries these fields. A row missing one
is not emitted — it goes back to step 4.

| Field | Content |
|---|---|
| `axis` | the verify axis the evidence came from |
| `module` | the module, or `cross-cutting` |
| `severity` | `Critical` · `Warning` · `Minor` — the core reviewer's scale, unchanged |
| `confidence` | high · medium · low, with the basis in one clause |
| `evidence` | `path:line`, a verify check id, or the detection fact |
| `route` | `/stamity-work` for a change · `/stamity-plan` when the design is the finding |

## Output modes

**Board linked.** One epic for the run, one sub-issue per module, one per
cross-cutting assessment. Module sub-issues carry no dependencies; cross-cutting
sub-issues depend on the module set, and the dependency section names them.

> Epic scaffold: `stamity-epic-audit-frame` → Epic and sub-issue shape, then
> Board sync. Slot: epic-kind = `product audit (<axis>)`; epic-label =
> `product-audit`.

**No board linked.** The run degrades to a report and says so — an unlinked
board is a repo state, not an error, and it never blocks an assessment:

```
.stamity/audits/<axis>-<sha>.md
```

The report carries the same sections the epic would have carried: scope, the
evidence table, findings by module with the full findings contract per row, the
cross-cutting sections, and the unexamined-area list. Linking a board later
(`/stamity-board setup`) makes the next run emit an epic; the report is not
migrated retroactively.

## Assesses, never modifies

The boundary, stated as rules rather than intent:

- **Spawn set.** `researcher` and `reviewer`. No implementer, no fixer. There
  is no path in this command that reaches a code-mutating role.
- **Write set.** Board items and `.stamity/audits/<axis>-<sha>.md`. No source
  file, no configuration, no dependency manifest, no lockfile — not even a
  formatting change, and not even when the fix is one obvious line.
- **Refresh set.** Running `stamity-verify` for a missing axis writes
  `.stamity/verify/<axis>-<sha>.json`. That artifact is evidence, and it is the
  one write outside the audit output.
- **Routing.** A finding that is trivially fixable is still a finding. It
  leaves as a board item or a report row, and `/stamity-work` applies it under
  its own gates.

An assessment that fixes what it finds cannot report what it found: the tree it
measured no longer exists, and its own evidence stops reproducing.

## Refusals

| Situation | Behaviour |
|---|---|
| No axis named | Ask once, options `security` · `health` · `all`, default `all` |
| Verify artifact absent or stale for a required axis | Run `stamity-verify` for that axis, then continue |
| Module taxonomy resolves to nothing | Stop and ask for the module set; do not assess an invented one |
| A named module's directory does not exist | Report it as a taxonomy defect and continue with the rest |
| Open epic already carries this axis | Ask: abort · supersede · open alongside |
| A finding lacks `path:line` or a check id | It is not emitted; it returns to grading as an open question |

> Epic scaffold: `stamity-epic-audit-frame` → Failure handling, then Guardrails.
> Slot: extra guardrail = severity is never reduced without an in-session
> operator decision, and every `Critical` or `Warning` finding reaches the
> output.

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`. One scale end to
  end — what the reviewer graded is what the epic or the report carries.
- `DONE` carries the axis, the commit, the output mode and its location, the
  findings with their evidence and routes, the artifacts read versus
  regenerated, and the unexamined areas. A run that routed no finding out still
  returns `DONE` with an empty finding list; an assessment that found nothing
  produced a result.
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest
  unblocking input — an unresolvable module taxonomy, a verify axis that will
  not run here, a board the run cannot reach after its one retry.
- Sub-agents do not put questions to the operator. A researcher or reviewer
  returning `BLOCKED_AMBIGUITY` hands its competing readings up; this command
  runs the ambiguity gate and re-dispatches that brief narrowed.
