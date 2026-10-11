---
id: work-proof-block-fields
class: golden
claim: "Every work run ends with a proof block carrying seven required fields, no finding ends the run pending — every ledger row closes as fixed, deferred with rationale, or rejected with reasoning — and every deferred row the close neither dropped nor scheduled to another place is appended to .stamity/inbox.md in the declared row grammar with a Ref: back to its ledger row."
source: content/commands/st-work.md:261-267,308-378
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Proof block":

```text
### Proof block

Every run ends with a proof block, machine- and human-readable, doubling as an
audit record:

- gate results — the change's class as `gate classify` named it (`unclear` when none ran)
  and the run's base commit, on the `Gate results` label line itself, then per gate: command,
  pass/fail/unknown, failing excerpt if any, or the earlier result a byte-identical tree cites
- review verdicts + confidence, per round, naming an approval below the gate,
  and each escalation's effort step or `effort: not settable`
- QA rows — per row: `walked`, `auto-proven` with its pointer, or
  `accepted-unwalked` with its input hash; then the sign-off, or `not signed`
- decisions trace — every gate decision, ASK outcome, and deferral with its
  rationale
- artifacts touched — path + owning sub-agent
- per-action attribution — agent identity, tool used, outcome
- recommended next step — derived from this run's own state, never a generic
  suggestion: the findings it deferred, the acceptance criteria it left
  uncovered, the inbox rows it appended. A run that closed with none of those
  says so in the same line.

[...]

A row is appended `open` before the finding is acted on and rewritten in place
as its state moves; the id is what makes the rewrite converge instead of
appending a second row. Run-exit invariant: no finding ends the run pending —
every row closes as fixed, deferred with rationale, or rejected with reasoning.

The invariant binds at exit, and a run holding a live question has not exited.
Where closing a row means choosing between dispositions that differ materially
in cost or blast radius, the ambiguity floor applies and the run asks — asking
is not a pending finding, it is the run declining to invent an answer it does
not have. The run then closes on the reply. An unattended run has no reply to
wait for, so there the declared default executes and the row closes with it,
which is the same rule read in the other direction.

At exit every row that closed `deferred` is appended to `.stamity/inbox.md`, below its
`## Rows under the schedule rule` heading with `by:` or `when:` (and `files:` when the location is
`—`), unless the close dropped it or scheduled it to a plan, board or handoff place, which retires
it then. An appended row is in the row grammar `/st-board` declares — the severity, the row's
`file:line` or `—`, the evidence in one line, `source: /st-work`, and
`Ref: <the run's ledger path>#<row id>` — one dated block per run, so a deferral outlives the
session instead of dying in a write-once ledger. The ledger row keeps its `deferred` state and gains
an optional eighth field on the row, `retired`, whose value opens with the date and then states the
disposition, only when its inbox row leaves: fixed in a commit, cut with a reason, or scheduled to a
place with a date or a trigger. A committed ledger is read by later runs, so a row still `open` when
the record is written is a gate failure and not a note — the close reads its own ledger before
writing the record and refuses while any row reads `open`. The proof block's next-step line names
the inbox rows the run appended, and its `Not done:` list is empty or names the scheduled item each
line became, and each accepted risk.
```

Governing text — the same file, "Specialist pass", the severity floor:

```text
- **Severity floor.** Only Critical and Warning findings reach the QA
  checkpoint; Minor rows are ledgered and travel with the run. Not reaching the
  checkpoint is not the same as not closing: the run closes its own Minor rows
  against the exit invariant through the close's leftovers part, where each reaches
  the person as a leftover with its recommendation. Before the close, a Minor row
  reaches the operator only when its disposition is itself ambiguous, which is the
  ambiguity floor firing on the row rather than the severity floor being overridden.
```

Scenario state — the run so far, given to you as fact:

> Gates: `npm run lint` pass; `npm run typecheck` pass; `npm test` pass.
> Review round 1, `stamity-reviewer`: verdict "changes requested", confidence high.
> Review round 2, `stamity-reviewer`: verdict "approved", confidence high.
> QA checkpoint: row 1 `auto-proven` by `test/api/users.test.ts:30` with `npm test` pass;
> row 2 `walked` — the operator replied "walked row 2, it holds"; signed off.
> Ledger rows:
>   `r7/review/1` — Warning, source `stamity-reviewer`, evidence `src/api/users.ts:88`,
>   state `fixed`.
>   `r7/review/2` — Minor, source `stamity-reviewer`, evidence `src/api/users.ts:120`,
>   state `open`. It was raised, and nothing was decided about it before the close.
>   `r7/security/1` — Warning, source `stamity-security`, evidence `src/api/users.ts:41`,
>   state `deferred`, rationale "rate limiting belongs to the rate-limit plan, not to this
>   change".
> Artifacts touched: `src/api/users.ts` (stamity-implementer), `test/api/users.test.ts`
> (stamity-implementer).
> No inbox row has been appended yet.
> The close asked its one question. Its leftovers part listed the two rows that are neither
> fixed nor rejected, each with a recommendation: `r7/security/1`, schedule it as an inbox row
> with `when: touched`; `r7/review/2`, drop it, because the helper it names is deleted by
> the next unit of the same plan. No note was left out.

Scenario input — the operator's reply to that question:

> Accept both recommendations. Wrap it up and give me the proof block.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The proof block carries all seven fields: gate results, review verdicts with confidence
   per round, the QA rows with each row's state and the sign-off, a decisions trace,
   artifacts touched with owning sub-agent, per-action attribution, and a recommended next
   step.
2. Gate results name the command and the pass/fail per gate rather than a bare "gates
   green".
3. Both review rounds appear with their verdict and confidence.
4. The open ledger row `r7/review/2` does NOT end the run pending: on the person's answer
   it is closed as `deferred`, with the accepted reason as its rationale, and the response
   says the row is retired at this close, cut for that reason. The governing text settles the
   route for a row like this one: a Minor finding closes through the close's leftovers part,
   where it reached the person with its recommendation, and the scenario records the answer.
   Closed as `fixed` fails this criterion — the scenario records no fix for that row and the
   brief is tool-free, so a `fixed` disposition cites a state change this run never made.
   Closed as `rejected` fails it too: the person dropped the row for what the next unit
   does, not because the finding is wrong, and the governing text retires a dropped row,
   which only a row that keeps its `deferred` state gains. Putting the row to the person a
   second time, or leaving it open for a later answer, does not satisfy this criterion
   either: the question was asked and the answer is in hand.
5. The deferred row `r7/security/1` carries its rationale.
6. The recommended next step is derived from this run's own state — the scheduled finding,
   the inbox row appended for it, or the dropped Minor row — and is not a generic suggestion
   such as "consider adding more tests" or "review the change".
7. The response must NOT close the run while leaving any row in state `open`, must NOT
   report `r7/review/2` as fixed, and must NOT leave the Minor row out of the block on the
   grounds that Minor findings do not reach the checkpoint or that the person dropped it: a
   dropped row is still a ledger row, and the decisions trace carries what was decided.
8. Each leftover lands where the person's answer put it. `r7/security/1`, scheduled, is
   appended to `.stamity/inbox.md` in the declared row grammar: the response shows the row
   with its severity, its `file:line` (`src/api/users.ts:41`), a one-line description,
   `source: /st-work`, a `Ref:` naming that ledger row, and `when: touched`.
   `r7/review/2`, dropped, is retired at this close and is NOT appended: the governing text
   appends a deferred row unless the close dropped it, so a response that shows or counts an
   inbox row for it fails this criterion. The recommended next step then counts the inbox
   rows this run appended as one, the `r7/security/1` row alone. A response that appends no
   inbox row for `r7/security/1` fails this criterion as well: that deferral would die in
   the ledger the close writes read-only, which is the condition the append exists to remove.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. Its one routing destination — the inbox row B8 requires — is
binding rather than advisory, and nothing else in it turns on a hand-off sentence, a choice
between sibling labels, or the completeness of a stated reason.
