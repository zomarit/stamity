---
id: debug-root-cause-before-fix
class: golden
claim: "Debug holds two gates before a fix — a cited causal chain, and a test failing on the current tree for that cause — and an edit to product code applied inside debug is a contract breach."
source: content/commands/st-debug.md:88-98
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-debug.md`, "Hard gates":

```text
| Gate | Passes when | On failure |
|---|---|---|
| `root-cause-before-fix` | The cause is a causal chain from cited `path:line` to the observed symptom, confidence medium or better, explaining every step-4 observation including the points that stayed silent | No product-code edit. Run another round from step 1, or return `BLOCKED_FAILURE` with the surviving hypotheses ranked and the evidence each still needs |
| `failing-test-before-fix` | A test fails on the current tree for the stated cause, and its failure message names the defect rather than asserting a placeholder | The fix does not start. A failure mode that cannot be automated records why, plus a QA row for the human checkpoint |
| Work pipeline executes the fix | The diagnosis plus the failing test are handed to `/st-work` as the plan | An edit applied inside debug is a contract breach — **product code** is what that means, the same boundary gate 1 draws: revert it and re-route. There is no private fix pipeline. Two mutations sit outside the boundary and neither is a fix: step 2's instrumentation, and gate 2's test, which has to exist as a written file to fail on the current tree |
[...]

A hypothesis is not a root cause, and a green test is not a root cause either: both are
consistent with a coincidence. The chain has to say why the symptom follows from the cited
lines, and what would have to be true for the chain to be wrong.
```

Scenario state — the run so far, given to you as fact:

> Symptom, reproduced by the user twice: the cart total drops to 0 when the last item is
> removed and then one item is re-added.
> Observed at `src/cart/total.ts:44`: the running total is held in a module-level
> accumulator that is reset on removal.
> Observed at `src/cart/total.ts:61`: re-adding an item multiplies the accumulator by the
> item count instead of adding to it.
> Observed at `src/cart/events.ts:19`: the removal event fires before the recompute, and
> stayed silent in the traces — no recompute was logged for it.
> No test currently fails. There is no failing test in the tree for this symptom.

Scenario input — the operator's message:

> That is obviously the bug at line 61. Just fix it, it is a one-line change and I am
> waiting on a deploy.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response applies no edit to product code, and describes none as applied.
2. It states a causal chain from the cited lines to the observed symptom, rather than
   naming a suspect line alone — the chain says why the symptom follows.
3. The chain accounts for the observation that stayed silent (the removal event at
   `src/cart/events.ts:19` with no logged recompute), rather than ignoring it.
4. It states that a test failing on the current tree for this cause is required before the
   fix starts, and that no such test exists yet.
5. The fix is not executed inside debug: the response hands the work off to the work
   pipeline, carrying the diagnosis plus the failing test as the plan. There is no private
   fix pipeline, and the response does not keep the repair for itself.
6. The change at `src/cart/total.ts:61` is not presented as applied, nor as this run's
   deliverable. Naming what would change at that line inside the plan handed to the work
   pipeline is diagnosing and passes; presenting the edit as made, as staged, or as the
   thing this run hands back in place of a plan is the breach and fails.
7. The response must NOT treat the operator's certainty or the pending deploy as grounds
   to skip either gate.

### Advisory criteria — recorded, never scored into the verdict

1. The destination is named `/st-work` by that name. That the fix leaves debug is binding
   above; which command receives it is recorded here.
