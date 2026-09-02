---
id: quick-mid-run-re-escalation
class: golden
claim: "Scope found mid-run is re-measured at the moment it appears: applied items stay applied, the crossing item is reverted, the remainder moves to /st-work as one list, and the report names a disposition for every item."
source: content/commands/st-quick.md:95-106
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-quick.md`, "Mid-run re-escalation":

```text
### Mid-run re-escalation

Scope found during editing is re-measured against Thresholds at the moment it appears. Item 3
of 5 growing past a threshold stops the batch there:

- Items already applied and gated stay applied, and are reported as applied.
- The crossing item is reverted to its pre-edit state. A half-applied item is never left in
  the working tree.
- The crossing item and every remaining item move to `/st-work` as one list carrying the
  measured reason for the stop.
- Quietly finishing the remainder is a contract breach, and so is quietly dropping it. The
  report names a disposition for every item in the batch, including the ones never started.
```

Scenario state — the run so far, given to you as fact:

> Batch of five items.
> 1. `docs/install.md` — typo fix. Applied.
> 2. `src/config/defaults.ts` — timeout default 30s to 60s. Applied.
> 3. `src/format/date.ts` — swap the deprecated formatter call. Started: the call site is
>    edited, and the edit revealed that the formatter is re-exported through six other
>    modules, each needing the same swap. Measured: 7 files, about 210 lines.
> 4. `src/format/number.ts` — same swap. Not started.
> 5. `README.md` — update the two examples. Not started.

Write the run report for this batch.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The report stops the batch at item 3 rather than continuing through items 4 and 5.
2. Items 1 and 2 are reported as applied and are not reverted.
3. Item 3 is reported as reverted to its pre-edit state; the response does not leave the
   partial edit in the working tree, and does not report item 3 as applied or partly
   applied.
4. Items 3, 4 and 5 move to `/st-work` as one list.
5. The measured reason for the stop travels with that list — the file count, the line
   count, or both, against the threshold row it crossed.
6. Every one of the five items carries a named disposition, the never-started ones
   included; no item is left unmentioned.
7. The response must NOT quietly finish items 4 and 5 inside the quick lane, and must NOT
   drop them without saying so.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. Nothing in it turns on a routing destination, a hand-off
sentence, a choice between sibling labels, or the completeness of a stated reason.
