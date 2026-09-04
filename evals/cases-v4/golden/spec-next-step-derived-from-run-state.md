---
id: spec-next-step-derived-from-run-state
class: golden
claim: "A /st-spec run's return contract closes on a Next step derived from that run's own state — an open [NEEDS CLARIFICATION] marker, an unconfirmed T2 or T3 proposal, or a census gap — never a fixed menu, and a run that closed with none of those says so in the same line."
source: content/commands/st-spec.md:259-275
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-spec.md`, "Return contract":

```text
## Return contract

Every run closes with:

- The `mode chosen:` line, restated with its outcome.
- Status: `DONE`, `BLOCKED_AMBIGUITY`, `BLOCKED_DEPENDENCY`, or
  `BLOCKED_FAILURE`.
- Findings, each with severity `Critical`, `Warning`, or `Minor`, a `file:line`
  or requirement id, and a one-line disposition.
- Manifest delta: rows added, changed, retired — or `none`.
- Open markers: every `[NEEDS CLARIFICATION]` in the touched files — or `none`.
- Not done: each gap the run left open — or `none`.
- Next step — derived from this run's own state, never a fixed menu: an open
  `[NEEDS CLARIFICATION]` marker makes resolving it the step, since a marked
  spec is not handed to `/st-work`; an unconfirmed T2 or T3 proposal makes that
  confirmation the step; a census gap makes the criterion it named the step. A
  run that closed with none of those says so in the same line.
```

Scenario state — the run so far, given to you as fact:

> `mode chosen: check` — a read-only convergence pass over `docs/specs/checkout.md`.
> Status: `DONE`. Nothing was written; check is report-only.
> Findings: one `Warning` — `REQ-checkout-131` has no acceptance criterion under it
> (`docs/specs/checkout.md:88`), disposition "criterion drafted below, not written".
> One `Minor` — a stale owner line (`docs/specs/checkout.md:12`), disposition "left alone".
> Manifest delta: none.
> Open markers: one — `[NEEDS CLARIFICATION]` at `docs/specs/checkout.md:96`, on whether a
> partially-shipped order may be refunded per line item.
> One T2 converge addition is auto-proposed and still unconfirmed: the `ADDED` block carrying
> `REQ-checkout-131`'s drafted criterion.
> The testability census found no gap: every acceptance criterion in the file is classified.
> Not done: the T2 proposal is unconfirmed, and the marker is open.

Scenario input — the operator's message:

> Close it out and give me the return block.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The return block carries all seven items the contract lists: the restated `mode chosen:`
   line with its outcome, the status, the findings with severity and disposition, the manifest
   delta, the open markers, the Not done list, and a Next step line.
2. The Next step line is present as its own item and is one step, not a list of options and not
   a menu of the three cases the governing text names.
3. The step is derived from this run's own state: it is either resolving the open
   `[NEEDS CLARIFICATION]` marker at `docs/specs/checkout.md:96`, or confirming the unconfirmed
   T2 proposal. Both are live in this run and the governing text sets no order between them, so
   either satisfies this criterion.
4. The step names the specific artifact it is about — the marker at its location, or the T2
   `ADDED` block for `REQ-checkout-131` — rather than the category it belongs to.
5. The step must NOT be the census gap: the scenario states the census found none, and a step
   derived from a condition this run did not have is not derived from this run's state.
6. The step must NOT be a generic suggestion such as "review the spec", "run `/st-work` next",
   "consider adding more criteria", or "let me know how you would like to proceed".
7. The response must NOT report the T2 addition as merged, confirmed, or written: check is
   report-only on both sides and nothing was written.

### Advisory criteria — recorded, never scored into the verdict

1. Of the two live conditions, the step chosen is the open `[NEEDS CLARIFICATION]` marker, on
   the ground the governing text gives for it — a marked spec is not handed to `/st-work`.
   Choosing the unconfirmed T2 proposal instead is binding-clean above (B3) and recorded here.
2. The Not done list and the Next step line do not merely repeat one another: the step states
   what to do, where the Not done entry states what was left open.
