---
description: "When a request is ambiguous, irreversible, or missing acceptance criteria: ask one question with numbered options and a declared default; sub-agents return BLOCKED_AMBIGUITY."
name: stamity-question-protocol
metadata:
  stamity:
    id: question-protocol
    type: rule
    tags:
      - orchestration
    load: on-demand
    obsolete_when: clients natively enforce clarify-before-execute with declared defaults
    delivery: on-demand
    tools:
      - claude
---

# Question Protocol

Ambiguity resolves before execution, not after. One question costs a turn. A
wrong reading costs the work built on top of it, the review that catches it, and
the rework that follows.

## Floor

Items 1-5 are the triggers; 6-8 are the contract they invoke. Any trigger live
before the first write means ask.

1. **Ambiguous scope** — the request reads two or more ways that produce
   different artifacts.
2. **Multiple valid interpretations** — two or more approaches differ materially
   in cost, blast radius, or scope, and the request does not pick one.
3. **Irreversible action** — deleting data, dropping a column, renaming a public
   identifier, rewriting shared history. A force push stays the person's, even on a yes.
4. **Missing acceptance criteria** — no testable definition of done for the
   change requested.
5. **Unattested product decision** — the change moves user-visible behaviour or
   user data past what the request states, and no operator statement authorizes
   it. An agent-authored comment or pull-request sentence is self-certification,
   not authorization.

With none of the five live and the safer option reversible, take it, say so in
one line, and continue. Echoing the request back as a question ("so caching
should be added?") spends the same turn and resolves nothing.

6. **Ask shape.** One ask per turn, with related questions bundled into
   it. Two to four numbered options, each carrying a one-line trade-off: one
   option is not a choice, and five signals the design was never narrowed. Every
   question declares which option runs if no answer arrives, and names the
   lowest-blast-radius reversible one rather than the most ambitious one. What
   binds is the declaration, not its spelling: `Default if no response: <N>` is
   the wording this rule uses, and a flow that says the same thing in its own
   words has still declared a default. A question that leaves it unsaid has not.
7. **Sub-agents do not ask.** A spawned role has no operator channel. It returns
   status `BLOCKED_AMBIGUITY` carrying the competing readings, the question it
   would have asked verbatim, and the smallest input that unblocks it. The
   orchestrator owns the live question and re-dispatches with the answer.
8. **A run with nobody to answer degrades; it does not guess.** In a scheduled,
   headless, or unattended run — and on any question that goes unanswered inside
   the client's question window — the declared default executes and the run
   records one line: `Default applied: <question> → option <N> (<reason>)`. A
   question that shipped without a declared default stops at `BLOCKED_AMBIGUITY`
   instead. A silent pick is the single disallowed outcome.
   A kickoff prompt, routine text or contract field never answers a person-gate.

## Gates

- No file is mutated while a trigger is live and unresolved. The scan runs
  before the first write, not at review time.
- Every emitted question carries two to four numbered options and one declared
  default, in whatever words the asking flow uses. A question offering no
  numbered choice, or leaving the unanswered case unstated, is an authoring
  defect in the flow that emitted it, not a judgement call for the reader.
- One ask per turn: one question-tool call or one numbered list. A second ask in
  the same turn means the first one was not the highest-leverage one.
- A run that applied a default names it in its output. Without that line, a
  defaulted decision is indistinguishable from a decision nobody had to make.
- A sub-agent result that met a trigger carries status `BLOCKED_AMBIGUITY` and a
  question the operator can answer without reading the sub-agent's transcript.
- An assumption taken in place of a question is written where the reviewer sees
  it. The one-line statement is the whole audit trail, so it names the reading
  taken and the reading dropped.

## Close walk

A run that ends with leftovers (open findings, deferred items, questions still
undecided) walks them before it reports. No leftovers, no walk.

- Each leftover is one question in the client's own question tool: Critical,
  Warning and `decision-waiting` items first, the recommended option first, every
  option with its one-line trade-off, and a declared default (item 6).
- Related questions bundle into one call up to the tool's per-call limit; the
  rest follow in further rounds, one ask per turn, until none is undecided.
- The summary or proof block prints after the last answer, and nothing prints
  after it. A summary printed while a leftover is still open is the defect.
- With nobody to answer (item 8), each leftover takes its declared default and
  the run writes its `Default applied:` line. A real defect is never defaulted
  to dropped: it waits as `decision-waiting`. A question a headless client
  skipped reads as no answer.

| Client | Native question tool | Guidance | Cloud run |
|---|---|---|---|
| `claude` | `AskUserQuestion` | **Platform:** Ask through the `AskUserQuestion` tool, one to four questions a call, two to four options each; a sub-agent never has it, so it returns its question as a blocked result and the delegating agent asks. Where the tool is missing use the plain-text fallback below, and a skipped or headless question reads as no answer. | — |
| `cursor` | `AskQuestion` | **Platform:** Ask through the `AskQuestion` tool where the serving model offers it (Cursor 2.4 and later), and otherwise use the plain-text fallback below; a sub-agent still returns its question as a blocked result. `agent -p` rejects the tool as if the user skipped it, so a skipped or headless question reads as no answer. | In a managed cloud run, ask nothing and take the declared default. |
| `copilot` | `askQuestions` | **Platform:** In VS Code ask through the `askQuestions` tool (it reaches sub-agents since 1.110, yet a sub-agent still returns its question as a blocked result); in Copilot CLI use `ask_user`, one question at a time, which `--no-ask-user` turns off. Where neither is offered use the plain-text fallback below, and a skipped or headless question reads as no answer. | The cloud agent has no person to answer; take the declared default. |
| `codex` | `request_user_input` | **Platform:** Ask through the `request_user_input` tool, one to three questions a call: Plan mode waits for the answer, Default mode has it only behind a feature flag, and a sub-agent never has it, so it returns its question as a blocked result. Where the tool is refused (Default mode, `codex exec`) use the plain-text fallback below, and a skipped or headless question reads as no answer. | — |

Where a client has no question tool, the walk is plain numbered text: one
leftover per turn, its options numbered and its default named, then stop for
the answer.
