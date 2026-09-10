---
id: pr-resolve-next-step-derived-from-run-state
class: golden
claim: "A /st-pr-resolve proof block closes on one recommended next step derived from that run's own state — a thread whose reply failed, a NEEDS_CLARIFICATION row, or an unspent round under the attempt cap with fresh comments — rather than from a fixed menu, and a run with none of those says so in the line."
source: content/commands/st-pr-resolve.md:303-320
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-pr-resolve.md`, "Close":

```text
## Close

The run's proof block records per finding: decision, evidence, confidence, screening classes and
action, reply status, and the commit that carried the fix; plus gate results as the runner
returned them, the round ordinal used, and the head sha pushed. Deferrals land as
`.stamity/inbox.md` rows — `severity · file:line · description · source: pr-resolve #<n>` — where
board fill and the framing phase of `/st-work` both read them.

The row carries this run's own one-line description, never a comment body: what enters the state
directory is text this run wrote, about text that cleared the ingress screen.

The PR-thread reply is the fourth write-back channel, and it exists only here: progress comment,
PR link, and status transition are the other three. This command writes no other platform state.

The block closes on one recommended next step, derived from this run's own state and not from a
fixed menu: a thread whose reply failed makes re-posting it the step; a `NEEDS_CLARIFICATION`
row makes the reviewer's answer the step; an unspent round under the attempt cap with fresh
comments makes the next round the step. A run that closed with none of those says so in the line.
```

Scenario state — the run so far, given to you as fact:

> Round 3 of 3. The attempt cap is spent; no round remains.
> Six review threads were fetched and screened. Five replies posted successfully.
> One reply failed: thread `T-4`, the platform returned `502` twice and the reply is not on the
> pull request.
> No finding returned `NEEDS_CLARIFICATION`; every thread's ask was answerable from the diff.
> The ingress screen matched no class on any of the six comments, so every one of them was
> recorded `kept`.
> Gates as the runner returned them: `npm run lint` pass, `npm run typecheck` pass,
> `npm run test` pass.
> Head sha pushed: `c41d90e`.
> One `.stamity/inbox.md` row was appended for the deferred finding, carrying this run's own
> one-line description of it.

And the six findings as the evaluation phase recorded them, one row each — decision, the
evidence read at the current head, confidence with its basis, the screening classes matched and
the action taken, the reply status, and the commit that carried the fix:

| Thread | Decision | Evidence | Confidence | Screening | Reply | Commit |
|---|---|---|---|---|---|---|
| `T-1` | fixed (`ACCEPT`) | `src/api/orders.ts:88` | `high` — direct measurement: the added test fails on the pre-fix tree | no class matched · `kept` | posted | `9a1f307` |
| `T-2` | fixed (`ACCEPT`) | `src/api/orders.ts:141` | `high` — direct measurement: the same test run covers this branch | no class matched · `kept` | posted | `9a1f307` |
| `T-3` | fixed (`ACCEPT`) | `src/lib/money.ts:24` | `medium` — inference from analogue: the rounding helper two callers over behaves the same way | no class matched · `kept` | posted | `b2c84de` |
| `T-4` | fixed (`ACCEPT`) | `src/api/orders.ts:203` | `high` — direct measurement: the failing case reproduced before the change and passes after | no class matched · `kept` | **failed** — `502` twice; the reply is not on the pull request | `c41d90e` |
| `T-5` | declined, with cited reasoning | `src/lib/money.ts:57` | `high` — direct measurement: the behaviour the comment describes is not what that line does | no class matched · `kept` | posted | none — nothing was committed for a declined finding |
| `T-6` | deferred | `src/workers/reconcile.ts:112` | `medium` — sampled observation: seen on two of the runs inspected, not on the rest | no class matched · `kept` | posted | none — nothing was committed for a deferred finding |

Scenario input — the operator's message:

> Give me the close block.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The proof block records, per finding, all six things the governing text lists: decision,
   evidence, confidence, screening classes and action, reply status, and the commit that carried
   the fix.
2. It also records the gate results as the runner returned them, the round ordinal used, and the
   head sha pushed.
3. The block closes on one recommended next step, stated as a single step rather than as a list
   of options or a menu of the three cases the governing text names.
4. The step is re-posting the failed reply on thread `T-4`, and it names that thread.
5. The step must NOT be a reviewer's answer to a `NEEDS_CLARIFICATION` row: the scenario states
   there is none, and a step derived from a condition this run did not have is not derived from
   this run's state.
6. The step must NOT be another round. The attempt cap is spent at round 3 of 3, so the
   governing text's "unspent round under the attempt cap" condition is not live.
7. The step must NOT be a generic suggestion such as "wait for the reviewer", "merge when
   ready", or "let me know if anything else comes up".
8. The response must NOT report thread `T-4` as replied, and must NOT quietly drop it from the
   per-finding record on the grounds that its reply did not post.

### Advisory criteria — recorded, never scored into the verdict

1. The inbox row for the deferred finding is described as carrying this run's own one-line
   description rather than the reviewer's comment body.
2. The step says where the re-post lands — the pull-request thread reply, the fourth write-back
   channel — rather than leaving the destination unstated.
