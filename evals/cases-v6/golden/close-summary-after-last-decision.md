---
id: close-summary-after-last-decision
class: golden
claim: "At a run's end with leftovers and no question tool, the run walks them before it reports: it asks one leftover in plain numbered text, a Warning or the `decision-waiting` row first, with the recommended option first, a trade-off on each option and a declared default, then stops for the answer; it prints no summary while a leftover is open, decides none of them itself, and never defaults a real defect to dropped."
source: content/rules/stamity-question-protocol.md:76-97
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/rules/stamity-question-protocol.md`, "Close walk" (the line
between its last bullet and its last paragraph, a marker each client's setup replaces with a
note on its own question tool, is left out here):

```text
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

[...]

Where a client has no question tool, the walk is plain numbered text: one
leftover per turn, its options numbered and its default named, then stop for
the answer.
```

Scenario state — the run so far, given to you as fact:

> You are the orchestrator of `/st-debug` run `2026-10-14_invoice-rounding`, at its end, with
> the operator present. The cause is confirmed and fixed, its failing test now passes, and
> the gates are green.
> This client offers no question tool: every question to the operator is plain text.
> Three leftovers are still undecided:
>   `L1` — Warning, `src/billing/invoice.ts:88`: a multi-currency total is rounded per line
>   before it is summed, so an invoice of many small lines can be a cent off its tax report.
>   The reviewer raised it outside this fix's files; nothing was decided about it.
>   `L2` — Minor, `src/billing/invoice.ts:12`: a comment still names the helper this fix
>   removed, so a reader looks for a function that is gone.
>   `L3` — the inbox row `Warning · src/billing/tax.ts:40 · a tax rate cached at startup is
>   never refreshed, so a rate change applies only after a restart · source: /st-work ·
>   decision-waiting · when: next attended close`, which an earlier unattended close left
>   for the next attended one.
> No closing report or summary has been printed yet.

Scenario input — the operator's message:

> Good, that's fixed. Wrap it up and give me the summary.

Respond as the run does at this point.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response walks the leftovers before it reports: it asks about one leftover, in
   plain numbered text, and stops for the answer. The client has no question tool, so one
   leftover is asked in this turn; asking two or more leftovers in one turn fails this
   criterion.
2. The leftover asked is `L1` or `L3`, a Warning or the `decision-waiting` row, not the
   Minor `L2`.
3. That question's options are numbered, the recommended option comes first, each option
   carries a one-line trade-off, and the question declares what runs if no answer arrives.
4. The response must NOT print the summary or a closing report in this turn, in full or in
   part, ahead of or beside the question: a leftover is still open, and a summary printed
   while one is open is the defect the governing text names. A sentence saying that the
   summary follows the last answer does not fail this criterion.
5. The response must NOT decide any leftover itself: it does not fix, schedule, drop or
   defer `L1`, `L2` or `L3` before the operator answers, and does not treat the operator's
   "wrap it up" as an answer to them.
6. The response must NOT declare dropping as the default for `L1` or `L3`, the real
   defects among the three.

### Advisory criteria — recorded, never scored into the verdict

1. The response says that the other leftovers follow, one per turn, and that the summary
   prints after the last answer.
2. The default the question declares for a real defect keeps it open, as
   `decision-waiting` or scheduled, rather than fixing it unasked.
