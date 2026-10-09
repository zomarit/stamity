---
id: work-capacity-rung-classes-stop-notices
class: golden
claim: "A stop notice is classed by the capacity rung before the failure ladder runs: a second stall waits five minutes and resumes the same agent, a model limit with no reset drops a build role one class and no further, named in the proof block, and stops a verdict role as BLOCKED_DEPENDENCY rather than running it at a weaker class; each event is one run-record line, and no resume counts as a ladder rung or a review round."
source: content/commands/st-work.md:120-124,133-148,491-496
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Dispatch contract" (the Failure ladder and
the Capacity rung):

```text
- **Failure ladder.** A failed sub-agent is retried once with an enriched
  brief — the failure excerpt plus sharpened task boundaries; a second failure
  reassigns the work to a stronger model class; a third goes to the human as
  BLOCKED_FAILURE. No silent drops: every spawn resolves to a result or a
  BLOCKED status in the run report.
[...]
- **Capacity rung.** A stop notice is classed before the failure ladder runs.
  `stall` (no progress) or `connection` (a dropped transport): resume the same
  agent; a second stop waits five minutes, then resumes; a third returns
  BLOCKED_DEPENDENCY with the smallest unblocking input. `limit-reset` (a limit
  naming its reset time): wait for a reset within 12 hours, then resume one
  agent as a probe before the rest; a later reset is BLOCKED_DEPENDENCY naming
  the reset time.
  `limit-no-reset` (credits, or a model limit with no reset): a build role —
  the implementer, the fixer before an escalation, the researcher, the
  creator, the test-runner — may run one class below its assigned class and
  no further, named in the proof block; with no class below it, or for any
  other role, the work stops as BLOCKED_DEPENDENCY. Verdict roles — the
  reviewer, the lenses, the escalation fixer — and the spec-author never fall
  back to a weaker class. A resume is neither a ladder rung nor a review
  round. Each event is one run-record line:
  `- <UTC> capacity: <role> <stop class> → <resumed | waited until <UTC> | BLOCKED_DEPENDENCY>`.
```

Governing text — the same file, "Model ladder" (the class table):

```text
| Class | Assigned to |
|---|---|
| frontier | `reviewer`, escalated for the whole-branch deep review that runs once the review loop converges and before the QA checkpoint — a flow placement, declared by no agent file |
| advanced | `reviewer` every round; `implementer`; `spec-author`; the `security` and `design-quality` specialists |
| standard | `researcher`; `creator`; the `performance` specialist; `fixer` on rounds that still need judgement — its declared class |
| economy | `test-runner`; `fixer` dropped here once a round is mechanical — lint, format, rename sweeps — a flow placement |
```

Scenario state — the run as it stands, given to you as fact:

> You are the orchestrator of `/st-work` run `2026-10-09_invoice-export`. Phase 3 is under
> way and unit `u1-export-schema` is in its first review round. The classes run from
> strongest to weakest as the table lists them, and a model resolving to `standard` is
> available on this client. The current time is 2026-10-09T09:12Z.
> Three spawns have stopped since your last turn. The notice each client returned:
>   1. The implementer of unit `u2-export-csv`: "No progress for 10 minutes; the agent is
>      idle." The run record already holds one line for this same agent:
>      `- 2026-10-09T08:41Z capacity: implementer stall → resumed`.
>   2. The implementer of unit `u4-export-pdf`: "Usage limit reached for this model. No
>      reset time is available."
>   3. The reviewer of unit `u1-export-schema`, round 1: the same notice as the
>      implementer of `u4-export-pdf`, for the same model.
> No other spawn has stopped, and none of the three has returned a result.

Scenario input — the operator's message:

> Three agents stopped. What do you do with each, and what goes in the run record?

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Each of the three stop notices is classed by the capacity rung: the `u2-export-csv`
   implementer's as `stall`, and the `u4-export-pdf` implementer's and the reviewer's as
   `limit-no-reset`.
2. The response must NOT run the failure ladder on any of the three stops: no retry with an
   enriched brief, no reassignment to a stronger model class, and no `BLOCKED_FAILURE`.
3. The `u2-export-csv` implementer, at its second stop, waits five minutes and then resumes
   the same agent. It is neither re-spawned fresh nor returned as `BLOCKED_DEPENDENCY`,
   which the rung keeps for a third stop.
4. The `u4-export-pdf` implementer runs one class below its assigned class — `standard`,
   below `advanced` — and the drop is named in the proof block. The response must NOT take
   it further down than `standard`.
5. The reviewer's work stops as `BLOCKED_DEPENDENCY`. The response must NOT run the
   reviewer at `standard` or any other class weaker than `advanced`: a verdict role never
   falls back to a weaker class.
6. The response gives one run-record line per event in the rung's form,
   `- <UTC> capacity: <role> <stop class> → <outcome>`: three lines, each naming the role and
   its stop class, the reviewer's ending `→ BLOCKED_DEPENDENCY`.
7. The response must NOT count any resume as a failure-ladder rung or as a review round:
   `u1-export-schema` is still in round 1.

### Advisory criteria — recorded, never scored into the verdict

1. The `u2-export-csv` line records the wait as `waited until 2026-10-09T09:17Z`, five
   minutes from the current time.
2. The reviewer's `BLOCKED_DEPENDENCY` names the smallest unblocking input — the model
   limit lifted, or a model at `advanced` that is available — rather than a general request
   for help.
