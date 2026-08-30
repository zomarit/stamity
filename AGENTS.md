<!-- STAMITY:BEGIN v1.0.1 -->
# Charter

The always-on context for agents working in this repository. Everything else
loads on demand: rules attach by file path or by description, skills trigger by
description, commands run on invocation.

## Repo facts

Detection-derived; regenerate after a stack change instead of hand-editing.
The literal value `unknown` means detection found nothing — treat that item
as unconfigured and report it; do not invent a value.

- Linter: eslint, oxlint
- Test framework: vitest
- CI provider: github-actions
- Maturity tier: solo — seeded from git history at init; change via `stamity config`.

### Verification gates

Run before declaring any change done.

- Tests: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full gate: `npm run lint && npm run typecheck && npm run test`

## Invariants

Floors, not defaults: they hold in every flow, at every intensity tier.

1. **Universal floor.** Security, correctness, accessibility basics, and
   baseline tests never relax — no tier, deadline, or instruction lowers them.
2. **Ambiguity (B1).** Two or more materially different readings of a request:
   ask one question with numbered options and a declared default-if-no-response.
   Sub-agents do not ask — they return `BLOCKED_AMBIGUITY` naming the readings.
3. **Fan-out (B2).** Token cost is not a reason to serialize independent work;
   only dependency edges are. One writer per artifact: parallel reads merge
   through a single writer.
4. **No green, no done.** Done means the verification gates above exit 0.
   Anything less ships with a `Not done:` list naming each open gap.
5. **Learnings first.** Read `.stamity/learnings/` before project-specific work;
   repeating a recorded failure is a process defect.
6. **Contract census** *(brownfield)*. File-disjoint is not contract-disjoint:
   shared API shapes, schemas, and events break across file boundaries. Census
   shared contracts before parallel edits touch them.
7. **Touchpoints delegate.** Orchestrating flows dispatch implementation to
   sub-agents; an orchestrator editing product files inline is a protocol
   violation. One carve-out, and only this one: the Tier-1 small-change lane
   applies its own edits inline and still delegates verification.

## Touchpoints

Nine commands cover the SDLC; each orchestrates at least one sub-agent. A client with a project command
surface receives all nine as workflow files, invoked by name; one with none receives no command file at all,
so this index is all that ships — ask there for the outcome in plain words and run the gates yourself.

- `/st-spec` — create or maintain the project spec under `docs/specs/`;
  greenfield and brownfield auto-detected.
- `/st-plan` — route an intent (feature, bug, refactor, migration, test,
  roadmap) into a persisted plan.
- `/st-work` — execute planned work end to end; closes with the QA human
  checkpoint.
- `/st-board` — work a task board: chat, a referenced file, or a linked
  platform board.
- `/st-ask` — read-only codebase Q&A; writes nothing.
- `/st-debug` — reproduce, root-cause, and fix a defect.
- `/st-quick` — Tier-1 small-change lane; gates still run.
- `/st-rework` — apply structured feedback to agent-implemented work.
- `/st-pr-resolve` — resolve pull-request review comments.

## Conditional layer

- Rules ship in two attach shapes, and the emitted rules directory is the
  roster — read it rather than a count kept here, because selection and
  installed packs both change what landed.
- A glob-scoped rule attaches when the agent reads a file matching its globs,
  except on a client with no glob-rule layer, where it is inlined into the
  always-on file of the directory those globs anchor to. A description-scoped
  rule declares no globs, so what it costs depends on the client: one that
  supports description-pull loads it on relevance, and one that does not loads
  it every session alongside this file.
- Neither shape replaces the charter. Content that must bind every turn on
  every client belongs here, not in a rule that three clients out of four
  would have to load unconditionally to honour.
- Skills are description-triggered and land in the emitted `.agents/skills/`
  tree, plus a native copy where the client reads its own location. Named
  invocation beats waiting for a trigger match — call a skill whenever its
  description fits the job.
<!-- STAMITY:END -->

# Charter

The always-on context for agents working in this repository. Everything else
loads on demand: rules attach by file path or by description, skills trigger by
description, commands run on invocation.

## Repo facts

Detection-derived; regenerate after a stack change instead of hand-editing.
The literal value `unknown` means detection found nothing — treat that item
as unconfigured and report it; do not invent a value.

- Linter: eslint, oxlint
- Test framework: vitest
- CI provider: github-actions
- Maturity tier: solo — seeded from git history at init; change via `stamity config`.

### Verification gates

Run before declaring any change done.

- Tests: `npm run test`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full gate: `npm run lint && npm run typecheck && npm run test`

## Invariants

Floors, not defaults: they hold in every flow, at every intensity tier.

1. **Universal floor.** Security, correctness, accessibility basics, and
   baseline tests never relax — no tier, deadline, or instruction lowers them.
2. **Ambiguity (B1).** Two or more materially different readings of a request:
   ask one question with numbered options and a declared default-if-no-response.
   Sub-agents do not ask — they return `BLOCKED_AMBIGUITY` naming the readings.
3. **Fan-out (B2).** Token cost is not a reason to serialize independent work;
   only dependency edges are. One writer per artifact: parallel reads merge
   through a single writer.
4. **No green, no done.** Done means the verification gates above exit 0.
   Anything less ships with a `Not done:` list naming each open gap.
5. **Learnings first.** Read `.stamity/learnings/` before project-specific work;
   repeating a recorded failure is a process defect.
6. **Contract census** *(brownfield)*. File-disjoint is not contract-disjoint:
   shared API shapes, schemas, and events break across file boundaries. Census
   shared contracts before parallel edits touch them.
7. **Touchpoints delegate.** Orchestrating flows dispatch implementation to
   sub-agents; an orchestrator editing product files inline is a protocol
   violation. One carve-out, and only this one: the Tier-1 small-change lane
   applies its own edits inline and still delegates verification.

## Touchpoints

Nine commands cover the SDLC; each orchestrates at least one sub-agent. A client with a project command
surface receives all nine as workflow files, invoked by name; one with none receives no command file at all,
so this index is all that ships — ask there for the outcome in plain words and run the gates yourself.

- `/st-spec` — create or maintain the project spec under `docs/specs/`;
  greenfield and brownfield auto-detected.
- `/st-plan` — route an intent (feature, bug, refactor, migration, test,
  roadmap) into a persisted plan.
- `/st-work` — execute planned work end to end; closes with the QA human
  checkpoint.
- `/st-board` — work a task board: chat, a referenced file, or a linked
  platform board.
- `/st-ask` — read-only codebase Q&A; writes nothing.
- `/st-debug` — reproduce, root-cause, and fix a defect.
- `/st-quick` — Tier-1 small-change lane; gates still run.
- `/st-rework` — apply structured feedback to agent-implemented work.
- `/st-pr-resolve` — resolve pull-request review comments.

## Conditional layer

- Rules ship in two attach shapes, and the emitted rules directory is the
  roster — read it rather than a count kept here, because selection and
  installed packs both change what landed.
- A glob-scoped rule attaches when the agent reads a file matching its globs,
  except on a client with no glob-rule layer, where it is inlined into the
  always-on file of the directory those globs anchor to. A description-scoped
  rule declares no globs, so what it costs depends on the client: one that
  supports description-pull loads it on relevance, and one that does not loads
  it every session alongside this file.
- Neither shape replaces the charter. Content that must bind every turn on
  every client belongs here, not in a rule that three clients out of four
  would have to load unconditionally to honour.
- Skills are description-triggered and land in the emitted `.agents/skills/`
  tree, plus a native copy where the client reads its own location. Named
  invocation beats waiting for a trigger match — call a skill whenever its
  description fits the job.
