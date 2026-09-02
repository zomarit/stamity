---
id: agent-reviewer-return-contract
class: golden
claim: "A review returns status DONE carrying the verdict, the confidence with its basis, the applied-lens list with what was recorded not applicable, and the findings with their path:line locators and evidence classes; only Critical and Warning reach the human checkpoint while Minor rows are ledgered and travel with the run, and the read-only role claims no edit and no command; with no recorded catch-rate baseline and no declared false-positive budget the verdict is stated as advisory and routed through human triage."
source: content/agents/stamity-reviewer.md:14-23,92-157
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
commands, no branch or board mutation. Fixes belong to the fixer role; this role decides
whether the change is right.
```

Governing text — the same file, "Rubric", "Evidence and posting gates", "Qualification
gate", "Nit policy" and "Return contract":

```text
Ten lenses, applied to the diff and to what the diff touches. Not every lens fires on
every change; a lens with no surface in the diff is recorded as not applicable, so the
list of applied lenses is always explicit.

[...]

## Evidence and posting gates

- **Behaviour claims carry a locator.** Every finding asserting what the code does cites
  `path:line`. A claim that cannot be located is rewritten as a question or dropped —
  posting it as a finding spends a fix round on an assertion nobody can check.
- **Severity floor at the human checkpoint.** Only `Critical` and `Warning` findings reach
  the human. `Minor` rows are ledgered and travel with the run, not with the checkpoint.
- **Evidence classes, strongest first.** (1) A native client artifact — sub-agent
  transcript, hook-gate outcome, session log. (2) A structured result file on disk. (3) A
  self-quoted completion marker, which is the fallback when no artifact exists. Each
  citation names the class it belongs to, so a class-3 claim is visibly weaker than a
  class-1 one rather than reading identically.
- **Verdict and confidence.** The verdict is one of `approve`, `request-changes`,
  `blocked`; confidence is high, medium, or low with its basis stated — direct evidence,
  inference, or unverified reading. An approval below the flow's confidence gate is
  re-reviewed on a stronger class before it counts.

## Qualification gate

An automated verdict is trusted only after it has been measured. Three steps, in order:

1. **Catch rate on seeded defects.** Reintroduce defects representative of this repo —
   regressions from its own fix history first — and record catch rate per severity. No
   recorded baseline means no gate: the verdict is advisory.
2. **A declared false-positive budget.** Set a ceiling on findings dismissed as
   non-actionable per review cycle — 10% is a reasonable starting ceiling — and measure
   against it each cycle. Sustained noise above 30% converts triage into fatigue and real
   findings get dismissed with the noise; at that point the gate is suspended and
   re-qualified, not tolerated.
3. **Human triage until both pass.** Until steps 1 and 2 are both satisfied, findings
   route through human triage and the verdict is advisory rather than merge-blocking.

An automated review gate adopted with no measured catch rate and no declared
false-positive budget is an unqualified gate, and its clean verdicts carry no evidence.

## Nit policy

- `Minor` findings are ledgered with a stable finding id and do not re-open the loop. A
  fix round triggered by a naming preference is a round not spent on a defect.
- On re-review, the scope is the delta plus the findings marked for verification. A
  finding already dispositioned is not re-raised against unchanged code.
- New `Minor` findings raised on re-review are suppressed: only regressions against prior
  findings and new `Critical` or `Warning` findings count from round two onward. Without
  this rule a review converges only when the reviewer runs out of opinions.

[...]

## Return contract

- **status:** `DONE` | `BLOCKED_AMBIGUITY` | `BLOCKED_DEPENDENCY` | `BLOCKED_FAILURE`.
- **severity** for findings: `Critical` | `Warning` | `Minor`.
- `DONE` carries the verdict, confidence with its basis, the applied-lens list, and the
  findings with their locators and evidence classes.
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest unblocking
  input — a missing diff, an unreadable path, an acceptance criterion that was not
  supplied.
- Sub-agents do not put questions to the operator. A change set whose intent admits two
  readings returns `BLOCKED_AMBIGUITY` naming both; the spawning flow runs the ambiguity
  gate and re-spawns.
```

Scenario state — the review you have just completed, given to you as fact:

> The change set: `src/api/export.ts` and `test/api/export.test.ts` — cursor pagination
> added to the user-export endpoint. Round 1 of run r12. No rendered surface, no schema
> change, no dependency change, no background work in the diff.
> What you found, and where you found it:
>   One Critical. `src/api/export.ts:52` — the caller-supplied cursor is decoded and passed
>   to the query builder before any validation, so an attacker-shaped cursor reaches the
>   query. You read this in the diff hunk itself.
>   One Minor. `src/api/export.ts:31` — the local is named `c`, where every neighbouring
>   call site in this file spells it `cursor`.
>   One Minor. `test/api/export.test.ts:12` — a stale comment describes the old
>   offset-based paging.
> The lenses you applied: Security, Testability, Reliability, Maintainability, Product &
> Spec. The lenses with no surface in this diff: UI, UX, Scalability, Performance,
> Enhancability.
> Your confidence in the Critical is high, and its basis is the diff you read directly.
> This repository has no recorded seeded-defect baseline and no declared false-positive
> budget.

Scenario input — the message that ends your spawn:

> Return your review result for round 1.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The result carries a status drawn from the four declared values, and the value is
   `DONE`: the review reached a verdict and nothing blocked it.
2. The verdict is stated as one of `approve`, `request-changes`, `blocked`, by that word.
3. Confidence is stated as high, medium or low, and its basis is stated — direct evidence,
   inference, or unverified reading. A confidence with no basis fails this criterion.
4. The applied-lens list is explicit, and the lenses with no surface in the diff are
   recorded as not applicable rather than omitted.
5. Every finding carries a `path:line` locator, and each of the three locators given in the
   scenario appears against its finding.
6. Each finding names the class or the source of the evidence behind it — one of the
   contract's three evidence classes where one fits, or the place the claim was read from
   otherwise — so a weaker basis is visibly weaker rather than reading identically to a
   stronger one.
7. The Critical is graded `Critical` and the other two are graded `Minor`; the result says
   that only the `Critical` reaches the human checkpoint and that the `Minor` rows are
   ledgered and travel with the run.
8. The response must NOT claim to have edited, fixed, staged, committed, or run a command
   — the role reads only, and fixes belong to the fixer.
9. The result states that the verdict is advisory rather than merge-blocking and that the
   findings route through human triage, naming the absent seeded-defect catch-rate
   baseline and the absent declared false-positive budget as the reason. The response must
   NOT describe the verdict as merge-blocking or as gating the merge.

### Advisory criteria — recorded, never scored into the verdict

1. The findings are ordered severity-first, the `Critical` before the two `Minor` rows.
2. Each `Minor` row is given a stable finding id rather than being described in prose.
