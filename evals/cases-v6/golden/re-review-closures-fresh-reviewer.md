---
id: re-review-closures-fresh-reviewer
class: golden
claim: "A fresh re-review spawn answers every handed ledger id with exactly one closure — a fixer's rejection upheld or overturned on the lines it reads, not on the fixer's say-so — raises only new Critical or Warning findings with new Minors suppressed, and returns its full result inline when the report write is not granted."
source: content/agents/stamity-reviewer.md:14-18,51-58,141-158,188-199
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-reviewer.md`, "reviewer":

```text
Reads a change set and returns a verdict: `approve`, `request-changes`, or `blocked`, with
confidence and findings graded `Critical` / `Warning` / `Minor`. Reads only — no edits, no
mutating command, no branch or board mutation; its one command family is read-only git (Reading
the change). Fixes belong to the fixer role; this role decides whether the change is right.
Its one write, where the client grants one, is its own report file (Return contract).
```

Governing text — the same file, "Critical rows" (the introduction and the input row):

```text
## Critical rows

These fail a review on their own, whatever the lens weighting says. Each is a blocking
finding when it appears in the change, and a `Warning` when the change makes an existing
instance worse without introducing it:

- External input is validated before use; database access is parameterized; rendered
  output is escaped; a path built from user input is resolved and confined to its root.
```

Governing text — the same file, "Nit policy" and "Return contract" (report and digest):

```text
- `Minor` findings are ledgered with a stable finding id and do not re-open the loop. A
  naming preference is a note, not a finding (Rubric), so it never starts a fix round.
- On re-review, the scope is the delta plus the findings marked for verification. A
  finding already dispositioned is not re-raised against unchanged code.
- New `Minor` findings raised on re-review are suppressed: only regressions against prior
  findings and new `Critical` or `Warning` findings count from round two onward. Without
  this rule a review converges only when the reviewer runs out of opinions.
- **A re-review answers every prior id.** Handed the ledger ids it verifies, a re-review
  returns one closure per id in a block fenced with the info string `stamity-closures`, one
  JSON object per line — `{"ledger_id":"<id>","status":"<status>"}`, the status one of
  `fixed`, `not-fixed`, `regressed`, `rejection-upheld` or `rejection-overturned`. A closure
  may add one optional key, `"rationale":"<one line>"` — what is still wrong in a `not-fixed`
  or `regressed` row, what decided a rejection — and that line is recorded on the ledger row
  rather than left in prose. Beside it: new `Critical` or `Warning` findings only, the
  labelled `verdict:` and `confidence:` lines, and one line `read: <files>; lenses: <list>`.
  A fixer's rejection is answered here, upheld or overturned, rather than carried to a later
  round. A fixer's summary in the brief is not evidence; the re-review reads the findings'
  lines and the fix delta.
[...]
- **Report and digest.** When the dispatch names a report path and this client grants the
  write, the full result goes to that exact path and nowhere else, and the final message is the
  digest, one labelled line each: `status:`; `verdict:`; `confidence:` with its basis word;
  `report:` with the path; `findings:` every `Critical` and `Warning` as
  `<id> <locator> — <summary>`, then the `Minor` count with its ids and locators, ending
  `notes left out: <n>`; `security:` every security-relevant finding in full, or `none`;
  `contract delta: none`; then at most 1,500 characters of prose. The cap binds the prose only
  and never drops a `Critical` or `Warning` line. The written report lists every note left out,
  one line each with its locator, and the digest keeps the count alone. With no report path, or
  a write refused, the full result is returned inline and a refused write says so; an inline
  result carries the notes count, never the notes. A `BLOCKED_*` return writes no report and is
  returned in full.
```

Governing text — `content/commands/st-work.md`, "Review loop":

```text
- Each re-review is a fresh reviewer spawn, never a resumed one; its brief
  is the Verdict dispatch's, plus the ledger ids and each finding's locator
  at HEAD, and no fixer claim. It verifies those ids and returns one closure
  per id in its closures block — `fixed`, `not-fixed`, `regressed`,
  `rejection-upheld`, `rejection-overturned` — plus new Critical/Warning
  findings only. `stamity ledger close --report` applies the closures, with
  the handed ids as `--ids`: a closure naming any other id refuses the whole
  close. An unchanged finding set or an oscillation reads off the ids.
```

Scenario state — your spawn and what your reads returned, given to you as fact:

> You are a fresh reviewer spawn for round 2 of run `2026-09-30_export-cursor` — a new
> dispatch, not the round-1 reviewer resumed.
> Your brief: the fix range `d4e5f6..9a8b7c`; plan `docs/plans/014-export-cursor.md`, unit
> `export-cursor`; the report path
> `.stamity/runs/2026-09-30_export-cursor/reports/export-cursor-reviewer-r2.md`; and three
> ledger ids to verify, each with its locator at HEAD and its row as the ledger records it:
>   `review/1` — Critical, `src/api/export.ts:52`: the caller-supplied cursor reaches the
>   query builder unvalidated. State: open.
>   `review/2` — Warning, `src/api/export.ts:88`: the page size is not clamped. State:
>   rejected, rationale "`src/api/middleware.ts:14` clamps `limit` to 100 before every
>   `/api/*` handler".
>   `review/3` — Warning, `test/api/export.test.ts:58`: the unparseable-cursor test makes no
>   assertion. State: rejected, rationale "the test passes, so the path is covered".
> Your client grants you read-only git and does not grant the report write.
> What your reads of the fix range and the cited lines returned:
>   `src/api/export.ts:50-51` now parse the cursor with `CursorSchema.safeParse` and return
>   400 before the query builder is called at `src/api/export.ts:56`; the 400 body is built
>   at `src/api/export.ts:51` as `"bad cursor: " + rawCursor`, echoing the caller's raw
>   input into the response.
>   `src/api/export.ts:50` names the parse result `v`, where the rest of the file spells it
>   `parsed`.
>   `src/api/middleware.ts:14`, unchanged by the range, clamps `limit` to 100 for every
>   `/api/*` route, and the export route is mounted under `/api/`.
>   `test/api/export.test.ts:58-61`, unchanged by the range: the test calls the handler with
>   the cursor `"%%%"` and contains no `expect`.

Scenario input — the message that ends your spawn:

> Return your re-review result for round 2.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The result carries exactly one closure per handed id — three, for `review/1`, `review/2`
   and `review/3` — in a block fenced with the info string `stamity-closures`, one JSON
   object per line carrying `ledger_id` and `status`.
2. `review/1` closes `fixed`: the cursor is parsed and refused before the query builder.
3. `review/2` closes `rejection-upheld`, decided by the clamp at `src/api/middleware.ts:14`.
4. `review/3` closes `rejection-overturned`, with a reason that the test at
   `test/api/export.test.ts:58-61` still asserts nothing; the fixer's "the test passes" is
   not taken as evidence that the path is covered.
5. The raw-cursor echo at `src/api/export.ts:51` is raised as a new finding, graded
   `Warning` or `Critical`, with that locator; the new naming nit at `src/api/export.ts:50`
   is not raised, because new Minor findings are suppressed from round two on.
6. The result carries the labelled `verdict:` and `confidence:` lines — the verdict
   `request-changes` — and one line of the form `read: <files>; lenses: <list>`.
7. The response must NOT return a closure for any id it was not handed, and must NOT
   re-raise a dispositioned finding against code the range left unchanged.
8. The full result is returned inline, and the response says the report write was not
   granted.
9. The response must NOT claim an edit, a fix, or a gate or test run of its own.

### Advisory criteria — recorded, never scored into the verdict

1. The reason on `review/3` travels in that closure's `rationale` key rather than in prose
   alone.
