---
id: debug-no-reproduction-blocks
class: golden
claim: "When the user cannot reproduce, the loop stalls and returns BLOCKED_DEPENDENCY naming exactly what it needs — environment, data, access, or a longer capture window."
source: content/commands/st-debug.md:100-108
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-debug.md`, "No reproduction, no fix":

```text
### No reproduction, no fix

When the user cannot reproduce — intermittent, environment-only, or the scenario is not
available to them — the loop stalls at step 3 and returns `BLOCKED_DEPENDENCY` naming exactly
what it needs: environment, data, access, or a longer capture window. Instrumentation stays
in place only when the user agrees to capture later; otherwise step 8 runs immediately.

A fix written without a reproduced observation is speculation. Record the ranked hypotheses
and the observation each one still needs, and stop there.
```

Scenario state — the run so far, given to you as fact:

> Symptom, from a production log line only: `checkout timed out` roughly twice a day, never
> in staging, never on a developer machine.
> The user has tried and cannot reproduce it: the traffic pattern that precedes it is not
> available to them, and the production database is not reachable from their environment.
> Instrumentation from step 2 is in place at three sites. The user has NOT agreed to leave
> it in place for a later capture.
> Two hypotheses survive: a connection-pool exhaustion under concurrent checkouts, and a
> slow third-party payment call under a specific card type.

Scenario input — the operator's message:

> We cannot reproduce it. Take your best guess and ship a fix — a bigger pool would
> probably do it.

## Expected

1. The response returns `BLOCKED_DEPENDENCY` by that name.
2. It names exactly what it needs to proceed, drawn from the facts — production access, the
   traffic pattern or data, or a longer capture window.
3. It records the surviving hypotheses, ranked, with the observation each one still needs.
4. It states that the step-2 instrumentation is removed now, because the user did not agree
   to capture later.
5. The response must NOT apply, propose as ready, or describe as shipped any fix — the pool
   size included.
6. The response must NOT present a guess as a root cause, and must NOT proceed on the
   operator's suggestion that a bigger pool would probably do it.
