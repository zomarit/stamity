---
id: rework-next-step-derived-from-run-state
class: golden
claim: "A /st-rework run closes on its proof block and also on one recommended next step derived from that run's own state — a standing [NEEDS CLARIFICATION] marker, a plan persisted on stop, or DEFER rows alone — rather than from a fixed menu."
source: content/commands/st-rework.md:249-257
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-rework.md`, "Plan handoff":

```text
Close with this run's proof block: baseline source (proof record, or `no proof record`),
findings by severity, REVISE/DEFER counts, validation verdicts with confidence, plan-lint per
check as `L1 pass|fail · L2 pass|fail · L3 pass|fail · R1 pass|fail`, the plan path, and the
inbox rows added.

Close also on one recommended next step, derived from this run's own state and not from a fixed
menu: a standing `[NEEDS CLARIFICATION]` marker makes resolving it the step, since it is what
blocks handoff; a plan persisted on `stop` makes running it through `/st-work` the step; DEFER
rows alone make board triage of the inbox the step. None of those, and the line says so.
```

Scenario state — the run so far, given to you as fact:

> Baseline source: the proof record from run `r7`.
> Findings: 1 Critical, 3 Warning, 1 Minor.
> Routing: 3 REVISE, 2 DEFER.
> Validation verdicts: REVISE unit 1 accepted, confidence high; unit 2 accepted, confidence
> high; unit 3 accepted, confidence medium.
> Plan-lint: `L1 pass · L2 pass · L3 pass · R1 pass`.
> The plan was persisted at `docs/plans/004-checkout-rework.md`. It carries no
> `[NEEDS CLARIFICATION]` marker.
> The ask was put once and the user answered `stop`, so the plan and the inbox rows are this
> run's output and nothing continued into `/st-work`.
> Inbox rows added: 2, one per DEFER finding.

Scenario input — the operator's message:

> Close it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The proof block carries all seven things the governing text lists: the baseline source, the
   findings by severity, the REVISE/DEFER counts, the validation verdicts with confidence, the
   plan-lint line per check, the plan path, and the inbox rows added.
2. The plan-lint line is rendered per check in the contract's own form — `L1`, `L2`, `L3` and
   `R1` each with its own pass or fail — rather than as a single "plan-lint passed".
3. The run closes on one recommended next step in addition to the proof block, stated as a
   single step rather than as a list of options or a fixed menu of the three cases the governing
   text names.
4. The step is running the persisted plan through `/st-work`, and it names the plan path
   `docs/plans/004-checkout-rework.md`. The plan was persisted on `stop`, which is the condition
   the governing text attaches that step to.
5. The step must NOT be resolving a `[NEEDS CLARIFICATION]` marker: the scenario states the plan
   carries none, and a step derived from a condition this run did not have is not derived from
   this run's state.
6. The step must NOT be board triage of the inbox. The governing text attaches that step to
   DEFER rows *alone*, and this run did not close with DEFER rows alone — it closed with a
   persisted plan beside them.
7. The step must NOT be a generic suggestion such as "review the plan", "let me know when to
   proceed", or "consider addressing the deferred findings".

### Advisory criteria — recorded, never scored into the verdict

1. The response states that the two inbox rows travel with the run rather than being closed by
   it, so the DEFER findings are visibly still tracked.
2. The step says what `/st-work` picks the plan up under — the freshness guard that detects and
   consumes the persisted artifact.
