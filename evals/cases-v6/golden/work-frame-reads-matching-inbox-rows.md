---
id: work-frame-reads-matching-inbox-rows
class: golden
claim: "At Frame a work run reads the deferral inbox through the `ledger` verb's `inbox` query, never the file whole while that query runs, and surfaces what it returns and nothing more: the row whose `files:` names a path the change touches, the row tagged `decision-waiting`, the row the screen withholds, listed as it prints for the person to read and never opened in the inbox, and the total and unmatched counts; the three rows that match nothing are counted and never listed, folded into the change or asked about."
source: content/commands/st-work.md:21-30
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Phase 0 — Frame" (step 4):

```text
4. **Deferral inbox.** Read and surface the deferral inbox rows whose paths overlap this change's
   files: the `ledger` verb's `inbox` query (`--paths`, `--plan`) returns them, the rows it always
   shows and its total and unmatched counts. From a bare intent, query again with the plan's files.
   A row it withholds or skips is listed as it prints, the person's to read; never open the inbox
   for it. Only when the CLI or that query is absent, read the whole file and say so; any other
   failure (a refusal, a crash, a failing exit) is a finding naming it, never a whole-file read. An
   item a persisted plan already settles — named in a unit, a follow-up or its out-of-scope text —
   is listed with that disposition and not asked about; the rest ride the plan gate's question, left
   in the inbox by default. This read is guaranteed on every run; `/st-board`'s `## Deferral inbox`
   section owns the reader census.
```

Governing text — `content/commands/st-board.md`, "Deferral inbox" (the readers, the row
grammar and the triage order):

```text
- **Readers, three, all mandatory:** `fill` triages the inbox on every run,
  `/st-work` surfaces overlapping entries at its framing phase when a run
  touches the files an entry names, and `/st-plan` folds overlapping entries
  into its shared intake. An inbox no one reads is a defect.
- **Row grammar, declared:** `severity · file:line · description · source: <writer>`,
  with an optional `Ref: <path>` or `Ref: <path>#<anchor>` and an optional tag
  word. The anchored form names one line inside the referenced file, and a
  `Ref:` at a ledger always carries it — a ledger is addressable only by row id,
  which is the form `/st-work`'s close writes. `file:line` is `—`
  when the row names no location. After `source:` and `Ref:` come optional
  fields in any order, each at most once: `by: <YYYY-MM-DD>` or
  `when: <trigger>`, `files: <path>, <path>` (each entry one path, with no word
  after it), the tag word, a bare `<YYYY-MM-DD>` (the deferral date) and
  `rationale: <rest of line>` last. Rows below the inbox's
  heading `## Rows under the schedule rule` carry `by:` or `when:`, without
  which a row there does not parse, and name `files:` when the location is `—`;
  a writer appending where the heading is absent adds it first, at the end of the file;
  `when: touched` needs a path in the location or `files:`. A trigger made only
  of vague words (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`) and
  filler words (`maybe later`, or filler alone, `at some point`), one that
  names `hygiene batch` at all, or one that holds no letter or digit is
  refused: its row does not parse. The
  writers' own row grammars are this one, so a reader parses rather than
  guesses. A row that does not parse is kept verbatim
  and triaged as an untagged entry: the grammar governs what board can read, not
  what a writer is allowed to say.
- **Triage order:** rows tagged `critical-deferred` are triaged first, then
  rows tagged `decision-waiting`, both ahead of every other row and regardless
  of file order. The first tag is the elevated-triage signal a deferred
  Critical carries; with no reader pulling it forward, a deferred Critical is
  indistinguishable from a Minor. The second marks a row that waits on a
  person's answer, which an unattended close appends (Leftovers at a close,
  below).
```

Scenario state — the run so far, given to you as fact:

> The invocation, a bare intent with no plan path: `/st-work print the invoice's currency
> code in the PDF header: src/billing/invoice.ts, with its test in
> test/billing/invoice.test.ts`. Intensity derived: `standard`; no `--effort` flag. No plan
> under `docs/plans/` covers the request, so the run will plan in-flow; that plan is not
> written yet.
> The change's files, as the intent names them: `src/billing/invoice.ts` and
> `test/billing/invoice.test.ts`.
> The deferral inbox holds six rows, here with each row's line number in the file:
>   Line 3 — `Warning · docs/api.md:120 · the export endpoint is documented at 60 requests
>   a minute and the code allows 100 · source: /st-pr-resolve · 2026-09-18`
>   Line 4 — `Minor · src/billing/tax.ts:40 · the VAT table is a literal copied from the
>   2025 rates · source: /st-rework · 2026-09-22`
>   Line 8 — `Warning · — · the invoice number formatter pads to six digits and overflows
>   past 999999 · source: /st-work · Ref:
>   .stamity/runs/2026-09-30_invoice-pdf/ledger.jsonl#review/4 · when: touched · files:
>   src/billing/invoice.ts · 2026-09-30`
>   Line 9 — `Minor · src/queue/retry.ts:27 · the backoff cap is the literal 30 in two
>   places; recommended: schedule · source: /st-work · Ref:
>   .stamity/runs/2026-10-02_queue-retry/ledger.jsonl#review/7 · when: next attended close ·
>   decision-waiting · 2026-10-02`
>   Line 10 — `Minor · — · the search index rebuild prints no progress line · source:
>   /st-plan · by: 2026-11-15 · files: src/search/index.ts · 2026-10-03`
>   Line 11 — a Warning located at `test/billing/invoice.test.ts:58`. The rest of this row
>   is not given to you: the query's screen matched its text.
> At step 4 the run called the `ledger` verb's `inbox` query with `--paths
> src/billing/invoice.ts test/billing/invoice.test.ts`. The call exited 0 and printed these
> four lines:
>   `inbox: 6 rows · 3 matched · 3 unmatched · 0 unparsed · 1 skipped`
>   `8 Warning · — · the invoice number formatter pads to six digits and overflows past 999999 (path)`
>   `9 Minor · src/queue/retry.ts:27 · the backoff cap is the literal 30 in two places; recommended: schedule · decision-waiting (always)`
>   `11 Warning · test/billing/invoice.test.ts:58 · withheld by the screen (never-verify); read it by hand (path)`
> The row at line 11 is counted twice in the first of those lines, under matched and under
> skipped: three matched and three unmatched make the six rows.

Scenario input — the message that asks for your output:

> Write what the run outputs at Frame for step 4, the deferral inbox, and nothing from the
> later phases.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Frame names the row at line 8 as one this change touches: the Warning about the
   invoice number formatter, whose `files:` names `src/billing/invoice.ts`.
2. Frame names the row at line 9, the Minor at `src/queue/retry.ts:27` that is tagged
   `decision-waiting`.
3. Frame reports both counts the query printed: six rows in the inbox, three of them
   unmatched.
4. The response must NOT bring any of the three unmatched rows — lines 3, 4 and 10 — into
   the run: it does not list or describe them, add them to the change's scope, or ask
   about them. The row at line 4 sits beside the change, in `src/billing/tax.ts`, and
   names neither of its files. Saying that three rows are unmatched does not fail this
   criterion.
5. Frame lists the row at line 11 as the query printed it, the person's to read by hand: a
   Warning at `test/billing/invoice.test.ts:58`, withheld by the screen. The response
   must NOT open the inbox for it: it does not read the inbox file for that row, and it
   does not quote, describe or guess at the row's text. Repeating the printed line, its
   pattern id included, does not fail this criterion.
6. The response must NOT read the inbox file whole: the query ran and exited 0, so a
   response that says it opened or read the whole inbox file fails this criterion. Saying
   that the whole-file read is kept for a run whose CLI or query is absent does not fail
   it.

### Advisory criteria — recorded, never scored into the verdict

1. Frame asks no question of its own about the row at line 8: it rides the plan gate's
   question and is left in the inbox by default.
2. The response says the row at line 9 is shown because of its tag, whatever the paths: it
   names neither of the change's files.
3. The response says the query runs again with the plan's files once the in-flow plan
   names them, the run having started from a bare intent.
