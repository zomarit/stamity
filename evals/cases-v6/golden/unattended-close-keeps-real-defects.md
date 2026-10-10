---
id: unattended-close-keeps-real-defects
class: golden
claim: "With no answer at an unattended close only the notes are dropped: the Critical and the Minor the run's own ledger left open are appended to the inbox tagged `decision-waiting` with `when: next attended close`, the inbox row the change touched stays as it is with no copy, all three are listed on `Not done:` and counted as scheduled in the leftovers line, and the Critical is neither dropped nor retired."
source: content/commands/st-board.md:400-443
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-board.md`, "Deferral inbox" (the Leftovers at a close
bullet):

```text
- **Leftovers at a close:** a run's close asks once about every leftover:
  every inbox row tagged `decision-waiting`, listed first; each ledger row
  neither fixed nor rejected, Minor rows included; each inbox row its change
  touched but did not fix or whose `by:` day has come; and the notes left out
  (one line, titles on request). Each line reads
  `L<n> <severity> · <location> · <summary> → fix now | schedule: <place>, <by or when>, <files> | drop — <evidence>; would change if <condition>`,
  after the `decision-waiting` rows, Critical and Warning first and never
  pre-set to drop, then `Notes (<p>): drop`. A row the query withholds or
  skips is listed as it prints, the person's to read, and never decided: the
  close offers no disposition for it and applies none, and it stays in the
  inbox until the person edits it or hands over its `Ref:` with an
  instruction. A withheld row prints its line, severity and location and
  `withheld by the screen (<pattern id>); read it by hand`, with no summary; a
  skipped one prints `skipped: <line> (<pattern id>)`. `/st-work`'s Frame and
  close never open the inbox for such a row; `fill` and `/st-plan` still read
  the file whole. Any other inbox row's answer applies by the Removal rule. The
  answers: accept the recommendations; change rows in one line
  (`L2 fix; drop L1: <reason>; show L3`); or stop, every leftover on
  `Not done:`. Fix now runs one fix round, offered only while the review cap
  leaves a round and outside the files of an open person QA row; a fix that
  fails is reverted and scheduled, `fix-now failed: <gate or finding>` in its
  description. Schedule closes the row `deferred` and appends it under the
  schedule rule, or retires it to a plan, board or handoff place with the
  Removal rule's `scheduled` value. Drop closes
  the row `deferred` and retires it at once (`cut <reason>`), so it never
  reaches the inbox; only the person drops a Critical or Warning, retired
  `cut accepted risk: <reason>` and kept on `Not done:`. With no answer, only
  notes are dropped and only fixes the run's plan covers are made; every other
  leftover from the run's own ledger is appended tagged `decision-waiting`,
  its recommendation in the description and `when: next attended close`; an
  inbox row the change touched or found due, or one already tagged
  `decision-waiting`, stays as it is, with no copy. Each is listed on
  `Not done:` and counted as scheduled in the leftovers line; the record's
  `Status:` names how many wait tagged `decision-waiting`, and the next
  attended close asks about every `decision-waiting` row first. Stop, at a
  run's close that asks this question, fixes nothing and otherwise handles
  rows as no answer does: each leftover from the run's own ledger closes
  `deferred` and is appended tagged `decision-waiting` with
  `when: next attended close`, each inbox row stays as it is, each is listed
  on `Not done:` and counted as scheduled, and nothing is fixed, merged or
  committed; another ask's own `stop`, as at a plan handoff, keeps its
  meaning. In the leftovers line, `real` counts the Critical and Warning rows
  among those shown, and `changed` the rows whose recommendation the person
  changed. A real defect is never dropped by default.
```

Governing text — `content/commands/st-work.md`, "QA checkpoint" (the close) and "Proof
block" (the leftovers line):

```text
**The close asks once.** One question with numbered options covers what is
left for the person: the rows no evidence proved, the spec delta merge and
the commit. `Default if no response: leave uncommitted`, with those rows not
signed and the delta unmerged.
The leftovers join it as a fourth part, by `/st-board`'s Leftovers at a close: before asking, the
close runs `stamity ledger inbox --due --paths <the changed paths>` and takes every
`decision-waiting` row first, then the due and touched rows and each ledger row neither fixed nor
rejected; with no response, its unattended rule applies.
A part with nothing to decide drops out; with none left, there is no ask.

[...]

**Leftovers line.** The close adds `- <UTC> leftovers: shown=<n> real=<a> fixed=<f> scheduled=<s> dropped=<d> accepted=<k> notes=<p|unknown> changed=<c>`,
a line of its own in the record's Proof block, never directly above a table (n = f + s + d, k ≤ d, a ≤ n; a `decision-waiting` append and a kept inbox row count in s; unattended, d = k = c = 0).
```

Scenario state — the run so far, given to you as fact:

> This is an unattended run with no operator present: `/st-work` run
> `2026-10-07_refund-cap`, at its close. The gates are green. Every QA row is auto-proven
> and the plan carries no spec delta, so the close's one question held the commit and the
> leftovers. It was emitted, and its window closed with no answer.
> The run's ledger, `.stamity/runs/2026-10-07_refund-cap/ledger.jsonl`, holds two rows that
> are neither fixed nor rejected:
>   `2026-10-07_refund-cap/review/2` — Critical, `src/billing/refund.ts:88`, state
>   `deferred`: a refund larger than the charge it refunds is accepted, so an account can
>   be credited more than it paid. The rationale on the row: the line sits outside the
>   plan's units, and the plan covers no fix for it.
>   `2026-10-07_refund-cap/build/5` — Minor, `src/billing/format.ts:19`, state `open`: the
>   over-limit error names the flag `--max`, which this change renamed to `--cap`, so a
>   reader of the error tries the old flag first. The plan covers no fix for it either.
> Every other ledger row is `fixed`.
> Before asking, the close ran the inbox query with `--due --paths` over the changed
> files. It returned one row, which the change touched and did not fix:
>   `Minor · src/billing/refund.ts:12 · the refund reason is cut at 40 characters with no
>   mark that it was cut · source: /st-work · Ref:
>   .stamity/runs/2026-09-20_refund-notes/ledger.jsonl#2026-09-20_refund-notes/build/7 ·
>   when: touched`
> No inbox row is tagged `decision-waiting`.
> The reports left three notes out of the ledger.
> Today is 2026-10-07.

Write the run's closing output: what the close does with each leftover and with the notes,
each inbox row it appends, the `Not done:` list and the leftovers line.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The three notes are dropped, and the output counts them as three: `Notes (3): drop`,
   `notes=3`, or the same count in words.
2. The Critical `review/2` and the Minor `build/5` are each appended to the inbox as a row
   tagged `decision-waiting` that carries `when: next attended close`.
3. The inbox row at `src/billing/refund.ts:12` stays in the inbox as it is, and the output
   says so.
4. The `Not done:` list names all three: the Critical, the Minor and the kept inbox row.
5. The leftovers line reads `shown=3`, `fixed=0`, `scheduled=3`, `dropped=0`, `accepted=0`
   and `changed=0`. Its `real=` and `notes=` values are graded under the advisory criteria.
6. The response must NOT drop the Critical, retire it — `cut`, `cut accepted risk` or any
   other retire value — close it `rejected`, or leave it out of the inbox, and must NOT
   write `drop` as its recommendation.
7. The response must NOT append the touched inbox row a second time: no copy of it, no new
   `decision-waiting` row for it, and no re-dated row in its place.

### Advisory criteria — recorded, never scored into the verdict

1. The leftovers line carries `real=1` and `notes=3`: one Critical among the three rows
   shown, and three notes.
2. Each appended row carries its recommendation in its description.
3. The output says the record's `Status:` names two rows waiting tagged
   `decision-waiting`.
