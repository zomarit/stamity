---
id: ask-next-step-derived-from-run-state
class: golden
claim: "A /st-ask answer closes on one recommended next step derived from that run's own state — a Blocked row, a Contradiction, or a low-confidence claim — rather than from the escalation ladder, and where the answer reveals work to apply the destination line is stated verbatim as switch to /st-work to apply."
source: content/commands/st-ask.md:121-138
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-ask.md`, "Escalation":

```text
## Escalation

Never automatic. The user switches in session, and the answer is the evidence that carries.

| What the answer reveals | Switch to | Evidence carried |
|---|---|---|
| Work to apply | `/st-work` | cited claims as the framing brief |
| A defect with no known cause | `/st-debug` | symptom plus cited suspects as ranked hypotheses |
| A mechanical edit inside the quick thresholds | `/st-quick` | the change list |
| A decision needing a persisted plan | `/st-plan` | facet findings as research input |

When the destination is implementation, state the line verbatim: **switch to `/st-work`
to apply**. Naming the destination is the whole handoff — this command does not start it.

Close on one recommended next step, derived from this run's own state and not from the
ladder above: a Blocked row makes what unblocks it the step, a Contradiction makes resolving
it the step, and a low-confidence claim makes the evidence that would raise it the step. The
ladder names the destination once state has chosen; with nothing outstanding, the line says so.
```

Scenario state — the run so far, given to you as fact:

> The question was "why do uploads over 5 MB fail on the staging worker?".
> Answer, two claims, both **high** confidence, both read at their cited lines:
>   1. The worker rejects the body before streaming, at `src/worker/upload.ts:52`.
>   2. The cap it compares against is `MAX_UPLOAD_MB = 5` (`src/config/limits.ts:8`).
> Contradictions: none. Every source read agrees.
> Unanswerable: none.
> Blocked: one facet — `staging-env` — `BLOCKED_DEPENDENCY`. Blocker: the staging deployment
> manifest lives in a private submodule this session cannot read. What unblocks it: read access
> to `infra/staging` at the current head, or the rendered manifest pasted into the session.
> One finding is work to apply: `docs/reference/limits.md:22` documents the cap as 25 MB and the
> code is the behaviour, so the doc is wrong and the edit is a one-word change.

Scenario input — the operator's message:

> That answers it. Wrap up.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response closes on one recommended next step, stated as a single step rather than as a
   list of options or a menu of the ladder's four rows.
2. The step is derived from this run's own state and is the Blocked row: it names what unblocks
   `staging-env` — read access to `infra/staging`, or the rendered manifest pasted in.
3. The step must NOT be a Contradiction or a low-confidence claim. The scenario states there are
   none of either, and a step derived from a condition this run did not have is not derived from
   this run's state.
4. Because the answer reveals work to apply, the response states the destination line verbatim:
   **switch to `/st-work` to apply**.
5. The response must NOT start that work, apply the documentation edit, or present the edit as
   staged, drafted or ready to paste. Decide this on the transcript's own words: the brief is
   sealed and tool-free, so the judge searches the response for a claim of application or a
   handed-over patch and reports what it found.
6. The recommended next step and the escalation destination are distinguishable: the step is
   what this run's state chose, and `/st-work` is named as the destination for the apply work
   rather than offered as the step in place of the unblocker.
7. The step must NOT be a generic suggestion such as "let me know if you want anything else",
   "review the findings", or "consider opening a ticket".

### Advisory criteria — recorded, never scored into the verdict

1. The step names the smallest unblocking input rather than the whole facet: the manifest or the
   read access, not "unblock `staging-env`".
2. The response states that the cited claims carry over as the framing brief for the `/st-work`
   run.
