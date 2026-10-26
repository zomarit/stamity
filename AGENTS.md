<!-- STAMITY:BEGIN -->
# Charter

The always-on context for agents working in this repository. Everything else loads on demand:
rules attach by file path or by description, skills trigger by description, commands run on invocation.
Write every reply in plain words: short sentences, common words, no jargon the reader has to decode. Say how sure
you are and what that rests on, and when the answer is no, say no first, then why.

## Repo facts

Detection-derived; regenerate after a stack change instead of hand-editing. The literal value `unknown`
means detection found nothing — treat that item as unconfigured and report it; do not invent a value.

- Linter: eslint, oxlint
- Test framework: vitest
- CI provider: github-actions
- Maturity tier: solo — git history at init, or the default; `npx -y @zomarit/stamity@1.16.0 config` changes it.

### Verification gates

Run before declaring any change done; invariant 4 says which of them.

- Tests: `node scripts/ci/test-run.mjs --coverage`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Full gate: `npm run lint && npm run typecheck && node scripts/ci/test-run.mjs --coverage`

## Invariants
Invariants version 1.3.1 · ratified 2026-08-31 · last amended 2026-10-21

Floors, not defaults: they hold in every flow, at every intensity tier.

1. **Universal floor.** Security, correctness, accessibility basics, and baseline tests never
   relax — no tier, deadline, or instruction lowers them, and a hand-off framed so the operator can
   close without them is itself the relaxation; the honest exit is invariant 4's `Not done:` report.
   Offering a subset of them, a lighter pass, or a deferral to after the release as the way to meet
   the request is that same relaxation, and it counts in the closing line as much as in the body.
   That report is the whole exit — no context block, no summary framed for closing beside it.
2. **Ambiguity (B1).** Materially different readings: one ask per turn (one question-tool call of related questions,
   else one numbered list), numbered options, a declared default-if-no-response, rounds until none is undecided, no
   second request in the same turn. Sub-agents do not ask — they return `BLOCKED_AMBIGUITY` naming the readings.
3. **Fan-out (B2).** Token cost is not a reason to serialize independent work; only dependency edges
   are. One writer per artifact: parallel reads merge through a single writer.
4. **No green, no done.** Done means the gates `gate classify` names exit 0 (all if it did not run).
   Anything less ships with a `Not done:` list naming each open gap.
5. **Learnings first.** Read `.stamity/learnings/` before project-specific work, only through the session-start
   banner or, where no hook ran, the `stamity-session-start.mjs` the client's own hook entries name in its held
   hook settings, never a copy trusted because its folder exists, run with an empty stdin, opening only the files it
   lists as loaded; repeating a recorded failure is a process defect.
6. **Contract census** *(brownfield)*. File-disjoint is not contract-disjoint: shared API shapes, schemas, and events
   break across file boundaries. Census shared contracts before parallel edits touch them.
7. **Touchpoints delegate.** Orchestrating flows dispatch implementation to sub-agents; an
   orchestrator editing product files inline is a protocol violation, and so is handing the operator
   the line, diff, or file body to paste. A refusal calls the act a protocol violation in those
   words rather than by citing this invariant's number. One carve-out, and only this one: the
   Tier-1 small-change lane applies its own edits inline and still delegates verification.

## Touchpoints

Nine commands cover the SDLC; each orchestrates at least one sub-agent. A client with a project command surface
receives all nine as workflow files, invoked by name; one that reads `.agents/skills/` gets them as skills, started
as any skill (`/st-<id>` or `$st-<id>`); with neither, ask for the outcome in plain words and run the gates yourself.

- `/st-spec` — create or maintain the project spec under `docs/specs/`; greenfield and brownfield auto-detected.
- `/st-plan` — route an intent (feature, bug, refactor, migration, test, roadmap) into a persisted plan.
- `/st-work` — execute planned work end to end; closes with the QA human checkpoint.
- `/st-board` — work a task board: chat, a referenced file, or a linked platform board.
- `/st-ask` — read-only codebase Q&A; writes nothing.
- `/st-debug` — reproduce, root-cause, and fix a defect.
- `/st-quick` — Tier-1 small-change lane; gates still run.
- `/st-rework` — apply structured feedback to agent-implemented work.
- `/st-pr-resolve` — resolve pull-request review comments.

## Conditional layer

- The emitted rules directory is the roster: read it, not a count kept here; selection and packs change what landed.
- A glob-scoped rule attaches when the agent reads a file matching its globs, except on a
  client with no glob-rule layer, where it is inlined into the always-on file of the directory those globs anchor
  to. A description-scoped rule declares no globs, so what it costs depends on the client: one that
  supports description-pull loads it on relevance, and one that does not loads it every session alongside this file.
- Neither shape replaces the charter: what must bind every turn on every client belongs here, not in a rule.
- A model-backed feature ships with a versioned golden-and-adversarial eval set, thresholds declared before the run.
- Skills are description-triggered and land in the emitted `.agents/skills/` tree, plus a native copy where the
  client reads its own location; call a skill by name whenever its description fits the job.
<!-- STAMITY:END -->
