---
id: debug-next-step-derived-from-run-state
class: golden
claim: "A /st-debug closing report ends on one recommended next step derived from that run's own state — a regression clause with no test, instrumentation held under a capture-later agreement, or a surviving hypothesis — rather than from the escalation table, and a run with none of those says so."
source: content/commands/st-debug.md:159-170
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-debug.md`, "Escalation":

```text
| Situation | Switch to | Evidence carried |
|---|---|---|
| Cause confirmed, failing test written | `/st-work` | diagnosis plus failing test as the plan |
| Three failed fixes | `/st-plan` | hypotheses, evidence, structural options |
| Cause is one mechanical slip inside the quick thresholds | `/st-quick` | the cited line plus the failing test |
| The symptom turns out to be a question, not a defect | `/st-ask` | the symptom rewritten as the question |
| The defect arrived as review feedback on delivered work | `/st-rework` | the diagnosis as a triage input |

The closing report ends on one recommended next step, derived from this run's own state and not
from the table above: a regression clause with no test makes writing it the step; instrumentation
held under a capture-later agreement makes the strip at the window's end the step; a surviving
hypothesis makes its discriminating observation the step. None of those, and the line says so.
```

Scenario state — the run so far, given to you as fact:

> Symptom: the cart total reads zero after an item is removed.
> Cause confirmed and cited: the accumulator at `src/cart/total.ts:44` resets on the removal
> event, and the recompute runs before that event rather than after it
> (`src/cart/events.ts:19`).
> A failing test was written for that cause and it failed on the current tree
> (`test/cart/total.test.ts:31`).
> Failed fixes this session: 0. The escape valve did not fire.
> Two things the run is still carrying:
>   1. The spec's regression clause for this defect (`docs/specs/cart.md:57`) has no test of its
>      own — the failing test covers the cause, not the clause.
>   2. Three observation-only counters were added under a capture-later agreement the user
>      gave; the agreed capture window closes at the end of Friday, and the counters are still
>      deployed.
> No hypothesis survives: the confirmed cause accounts for every observation.

Scenario input — the operator's message:

> Good. Give me the closing report.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The closing report ends on one recommended next step, stated as a single step rather than as
   a list of options or a menu of the table's five rows.
2. The step is derived from this run's own state: it is either writing the missing test for the
   regression clause at `docs/specs/cart.md:57`, or stripping the instrumentation at the end of
   the agreed window. Both are live in this run and the governing text sets no order between
   them, so either satisfies this criterion.
3. The step names the specific artifact it is about — the regression clause at its location, or
   the three deployed counters and the window's end — rather than the category it belongs to.
4. The step must NOT be a surviving hypothesis or its discriminating observation: the scenario
   states none survives, and a step derived from a condition this run did not have is not
   derived from this run's state.
5. The step must NOT be one of the escalation table's rows offered in its place. Naming
   `/st-work` as where the confirmed cause and failing test go is a destination, and is
   compatible with this criterion; presenting "switch to `/st-work`" as the recommended next
   step in place of the two live conditions is not.
6. The step must NOT be a generic suggestion such as "add more tests", "monitor it", or "verify
   in staging".
7. The response must NOT report the instrumentation as already stripped or the regression test
   as already written: neither happened in this run.

### Advisory criteria — recorded, never scored into the verdict

1. Of the two live conditions, the step chosen is the instrumentation strip, because it carries
   a deadline the other does not. Choosing the regression clause instead is binding-clean above
   (B2) and recorded here.
2. The step names when the strip is due — the end of the agreed capture window — rather than
   leaving it open-ended.
