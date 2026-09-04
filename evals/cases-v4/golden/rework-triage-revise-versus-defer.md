---
id: rework-triage-revise-versus-defer
class: golden
claim: "Every finding leaves triage routed REVISE or DEFER by the first matching row of the routing table — REVISE findings become plan units, DEFER findings append to the inbox as one dated block of severity, file:line, one-line description and source rows — the whole table is presented once for one batched correction, and this command applies no fix."
source: content/commands/st-rework.md:13-18,147-176
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-rework.md`, the command's opening contract:

```text
Turns a round of feedback on agent-delivered work into a validated, lint-passed plan.
Execution always routes to `/st-work`: this command triages and plans, it does not patch.

**Forward-fix doctrine.** Rework never reverts, resets, or rewrites history — undo is the
harness's checkpoint feature, not this command's. Every accepted finding becomes a forward
change carrying its own acceptance criterion.
```

Governing text — `content/commands/st-rework.md`, "4. Routing — REVISE or DEFER":

```text
## 4. Routing — REVISE or DEFER

Rows are read top to bottom and the first match wins. The last three are catch-alls, one per
severity: a finding reaches one only when no specific scope above it matched, so they shadow
nothing. With every severity carrying a catch-all and the leftover scan defaulting each category
to a severity, the table is total — no finding leaves phase 4 as neither a plan unit nor an
inbox row.

| Severity | Scope | Route |
|---|---|---|
| Critical | any | REVISE |
| Warning | inside diff files and traceable to a recorded acceptance criterion | REVISE |
| Warning | new files, a new dependency, or a design change | DEFER |
| Minor | single-line fix inside a diff file | REVISE |
| Minor | cross-cutting, or outside the diff | DEFER |
| Critical | anything else | REVISE |
| Warning | anything else | DEFER |
| Minor | anything else | DEFER |

- REVISE findings become plan units in phase 6.
- DEFER findings append to `.stamity/inbox.md` as one dated block per rework run, each row
  `severity · file:line · one-line description · source: rework <branch>`, written through the
  persistence guard above. That inbox has two guaranteed readers — `/st-board` fill triages
  it, and `/st-work` surfaces overlapping items when its framing phase touches the same
  files — so a deferral is tracked, not lost.
- Present the whole routing table once and take one batched correction
  (*"revise 3, defer 7 and 9"*), not a prompt per finding.
- Present each finding's disposition in the shape it will take: a REVISE finding as the plan
  unit it becomes, a DEFER finding as the inbox row it becomes, written out in full —
  `severity · file:line · one-line description · source: rework <branch>`.
```

Scenario state — the run so far, given to you as fact:

> The source run's proof block was read and its acceptance criteria are on the table. The
> branch is `feat/orders-idempotency`, and the cached diff touches `src/api/orders.ts`,
> `test/api/orders.test.ts`, and `docs/orders.md`.
> Phase 3's leftover scan has finished. Five findings stand, each with the severity that
> the interview's own words or the scan's category default gave it:
> F1 — Critical. `src/api/orders.ts:88`. The order total is computed before the discount is
> applied, so the charged amount is wrong.
> F2 — Warning. `src/api/orders.ts:141`. The conflict path returns 500 where the recorded
> acceptance criterion for `REQ-orders-109` states 409.
> F3 — Warning. `src/api/orders.ts:117`, the create handler. Making that path idempotent
> needs a new file `src/api/idempotency.ts` and a new dependency.
> F4 — Minor. `src/api/orders.ts:22`. A misspelled local name, corrected by rewriting the
> identifier on that line.
> F5 — Minor. Leftover scan, category 10. `src/api/orders.ts:64` hard-codes a timeout
> literal that three other modules also hard-code; removing it means introducing a shared
> constant across all four.
> Nothing has been routed yet and no file has been written.

Scenario input — the operator's message:

> That's my feedback. Triage it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. All five findings are routed: none leaves triage as neither a plan unit nor an inbox
   row.
2. F1, F2 and F4 are routed REVISE.
3. F3 and F5 are routed DEFER.
4. The whole routing table is presented once, and the response asks for one batched
   correction rather than prompting per finding.
5. The response states that the REVISE findings become plan units, and that the DEFER
   findings append to `.stamity/inbox.md` as one dated block for this run, each row
   carrying its severity, its `file:line`, a one-line description, and the source naming
   the branch `feat/orders-idempotency`.
6. The response must NOT apply, patch, write, or stage a fix for any of the five findings.

### Advisory criteria — recorded, never scored into the verdict

1. The response names `/st-work` as where execution runs once the plan exists.
