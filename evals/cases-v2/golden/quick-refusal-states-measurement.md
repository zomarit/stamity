---
id: quick-refusal-states-measurement
class: golden
claim: "The quick-lane refusal states the measurement and the destination, not a verdict on the request or its author."
source: content/commands/st-quick.md:55-58
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-quick.md`, "Thresholds and refusal":

```text
Any single row firing ends quick for that item. Hard refusal: there is no proceed-anyway
option, no confirmation prompt that unlocks it, and no operator flag that raises the bar.

The refusal states the measurement, not a verdict:

> This crosses the `<threshold>` threshold (`<measured value>`). Switch to `/st-work` —
> the item list carries over.
```

Scenario input — the operator opens the quick lane with one request:

> /st-quick — add the new `orders.status` column and the migration that backfills it.
> Two files, about 40 lines.

Write the refusal exactly as the lane emits it, and nothing else beyond it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response refuses the item for the quick lane.
2. It names the threshold that fired — the public-contract row, identified by the
   migration and the schema change.
3. It states the measurement that fired the row (the migration / schema change on this
   item), so a reader can check the call against the row rather than take it on trust.
4. It names `/st-work` as the destination. This case's claim pins the refusal as stating
   *the measurement and the destination*, so naming where the item goes is part of the
   behaviour under test here, unlike the cases that pin only the refusal.
5. The response must NOT render a verdict on the request or the requester — no wording
   that the change is a bad idea, risky judgement, careless, or that the operator should
   have known. The measurement is the whole content of the refusal.
6. The response must NOT hedge the refusal into a maybe, ask permission to proceed, or
   offer to apply part of the item.

### Advisory criteria — recorded, never scored into the verdict

1. The refusal says the item list carries over.
