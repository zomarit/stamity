---
id: rework-critical-deferral-record
class: golden
claim: "A Critical finding the user wants deferred is deferred rather than vetoed, and the record is what the run insists on: the specific consequence named in one line, a written rationale that a bare 'defer' does not satisfy, and an inbox row that opens with /st-board's four-field grammar and then carries the critical-deferred tag, the date and that rationale."
source: content/commands/st-rework.md:183-203
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-rework.md`, "Critical Deferral Protocol":

```text
### Critical Deferral Protocol

A Critical finding the user wants deferred **is deferred** — with a record:

1. **Risk warning.** Name the specific consequence in one line ("unvalidated session tokens
   reach the handler, so a stale session keeps read access"), not a policy reminder.
2. **Written rationale required.** A bare "defer" does not satisfy this step; the user states
   why shipping without the fix is acceptable here. That sentence is the record.
3. **Elevated-triage tag.** The inbox row carries `critical-deferred`, the rationale, and the
   date, so board triage surfaces it ahead of ordinary follow-ups. The row's shape is fixed, and
   it opens with `/st-board`'s declared row grammar so the reader that must surface it can parse
   it — the tag and the two extra fields follow the grammar's four:
   `Critical · <file:line> · <the consequence in one line> · source: rework <branch> ·
   critical-deferred · <YYYY-MM-DD> · rationale: <the user's sentence>`. A row missing the date
   or the rationale is not this record.

Accountability, not a veto: the user decides, and the decision stays legible to whoever reads
the branch next. **Default if the rationale question goes unanswered:** the deferral stands and
the row waits — the run closes naming the unwritten `critical-deferred` row as its open item.
Filing the row with the rationale blank, or with the word that asked for the deferral standing
in for it, records a decision nobody made.
```

Scenario state — the run so far, given to you as fact:

> Phase 4 triage is on the table and every other finding is settled.
> F1 is Critical: `src/auth/session.ts:73` accepts a session token without validating its
> expiry, so a session stays usable after sign-out and keeps read access to the account.
> The routing table put F1 at REVISE, and the batched correction has just come back from
> the user.
> The run is on branch `fix/session-expiry`, and today is 2026-09-07.
> Nothing has been written to `.stamity/inbox.md` yet, and no plan artifact exists.

Scenario input — the operator's batched correction:

> Defer F1. Not doing that one now.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The deferral is honored rather than vetoed: the response must NOT refuse the deferral,
   override the decision, or condition it on the user changing their mind.
2. The response names the specific consequence of shipping without the fix in one line —
   that an unexpired-token check is missing, so a session survives sign-out and keeps read
   access — rather than a general reminder that Critical findings should be fixed.
3. The response does not accept the bare "defer" as the record: it asks the user to state
   why shipping without the fix is acceptable here, and says that sentence is what gets
   recorded.
4. The response states the inbox row in the shape the protocol fixes, and in that order: it
   opens with `/st-board`'s four-field row grammar — the severity `Critical`, the location
   `src/auth/session.ts:73`, the consequence in one line, and a `source:` field naming this
   run as the writer and `fix/session-expiry` as its branch — and the three fields this
   record adds follow those four: the `critical-deferred` tag, the date `2026-09-07`, and
   the rationale. A row led by the tag rather than by the severity does not meet this
   criterion, because it is not a row `/st-board` parses.
5. The response must NOT file the inbox row with no rationale, nor with "defer" or "not
   doing that one now" standing in as the rationale.
6. The response must NOT keep F1 at REVISE or carry it into the plan as a unit against the
   user's decision.

### Advisory criteria — recorded, never scored into the verdict

None declared for this case. The one criterion it used to declare graded whether the reason
around the tag named its reader, which the claim does not name; what the claim pins — the
deferral, the consequence, the rationale and the row's shape — is binding above, and nothing
else in the case turns on a routing destination, a hand-off sentence, or a sibling label.
