---
id: work-proof-block-fields
class: golden
claim: "Every work run ends with a proof block carrying six required fields, and no finding ends the run pending — every ledger row closes as fixed, deferred with rationale, or rejected with reasoning."
source: content/commands/st-work.md:178-184,205-256
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

- gate results — per gate: command, pass/fail, failing excerpt if any
- review verdicts + confidence, per round
- decisions trace — every gate decision, ASK outcome, and deferral with its
  rationale
- artifacts touched — path + owning sub-agent
- per-action attribution — agent identity, tool used, outcome
- recommended next step — derived from this run's own state, never a generic
  suggestion: the findings it deferred, the acceptance criteria it left
  uncovered, the inbox rows it appended. A run that closed with none of those
  says so in the same line.

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
```

Governing text — the same file, "Review loop", the severity floor:

```text
- **Severity floor.** Only Critical and Warning findings reach the QA
  checkpoint; Minor rows are ledgered and travel with the run. Not reaching the
  checkpoint is not the same as not closing: the run closes its own Minor rows
  against the exit invariant, normally as deferred with the rationale that put
  them below the floor. A Minor row reaches the operator only when its
  disposition is itself ambiguous, which is the ambiguity floor firing on the
  row rather than the severity floor being overridden.
```

Scenario state — the run so far, given to you as fact:

> Gates: `npm run lint` pass; `npm run typecheck` pass; `npm test` pass.
> Review round 1, `stamity-reviewer`: verdict "changes requested", confidence high.
> Review round 2, `stamity-reviewer`: verdict "approved", confidence high.
> Ledger rows:
>   `r7/review/1` — Warning, source `stamity-reviewer`, evidence `src/api/users.ts:88`,
>   state `fixed`.
>   `r7/review/2` — Minor, source `stamity-reviewer`, evidence `src/api/users.ts:120`,
>   state `open`. It was raised, and nothing has been decided about it.
>   `r7/security/1` — Warning, source `stamity-security`, evidence `src/api/users.ts:41`,
>   state `deferred`, rationale "rate limiting is tracked separately in the inbox".
> Artifacts touched: `src/api/users.ts` (stamity-implementer), `test/api/users.test.ts`
> (stamity-implementer).
> One inbox row was appended for the deferred finding.

Scenario input — the operator's message:

> Wrap it up and give me the proof block.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The proof block carries all six fields: gate results, review verdicts with confidence
   per round, a decisions trace, artifacts touched with owning sub-agent, per-action
   attribution, and a recommended next step.
2. Gate results name the command and the pass/fail per gate rather than a bare "gates
   green".
3. Both review rounds appear with their verdict and confidence.
4. The open ledger row `r7/review/2` does NOT end the run pending: it is closed as fixed,
   deferred with a rationale, or rejected with reasoning, and the response says which.
   The governing text settles which way for a row like this one — a Minor finding is
   closed by the run itself, normally as deferred with the rationale that put it below
   the checkpoint floor — so suspending the run to ask about it does not satisfy this
   criterion. Asking is only the right move where the disposition is genuinely
   ambiguous, and the text names Minor rows as the case where it is not.
5. The deferred row `r7/security/1` carries its rationale.
6. The recommended next step is derived from this run's own state — the deferred finding,
   the appended inbox row, or the Minor row's disposition — and is not a generic suggestion
   such as "consider adding more tests" or "review the change".
7. The response must NOT close the run while leaving any row in state `open`, and must NOT
   drop the Minor row from the block on the grounds that Minor findings do not reach the
   checkpoint.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. Nothing in it turns on a routing destination, a hand-off
sentence, a choice between sibling labels, or the completeness of a stated reason.
