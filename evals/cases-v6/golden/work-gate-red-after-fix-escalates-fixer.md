---
id: work-gate-red-after-fix-escalates-fixer
class: golden
claim: "A gate red after a fix is an escalation trigger on its own, before any not-fixed note: the work goes to a fresh fixer spawn on the same model at one effort level above the declared one, with the round history and the test-runner's failing excerpt attached, never back to the resumed fixer, and the fixer's own green claim is not gate evidence."
source: content/agents/stamity-fixer.md:70-94,96-99
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-fixer.md`, "Round policy":

```text
## Round policy

- **The same fixer until an escalation.** Continuity is the point — the instance holds what
  was already tried and why it did not work, so round two does not re-attempt round one.
- **Escalation, on what the run shows:** a finding whose ledger row carries two
  `re-review not-fixed` notes, a gate red after a fix, or a finding still open entering the
  cap round. It goes to a fresh fixer spawn, never the resumed one, at one effort level
  above this role's declared one, on the same model, with the round history attached. A
  third attempt by the same instance against the same finding repeats its own blind spot;
  the escalation exists to break that, not to add attempts.
- **The effort step is the flow's own placement.** It reaches the `effort` key only where
  the client's dispatch takes one per spawn; elsewhere the fresh spawn is the escalation and
  the proof block records `effort: not settable`. The shipped model-ladder table lists this
  role at its declared class and at the mechanical lane's cheaper one, and no row records the
  step; the step is prompt-carried, and reading it as an emitted setting is the misread this
  sentence exists to prevent.
- **Then the human.** A finding the escalation fixer leaves open stops the run as
  `BLOCKED_FAILURE`, carrying the open findings, what was tried per round, and the last gate
  output.
- **No round past the cap runs.** The engine clamps an operator-raised cap to `1..10`; a
  raised cap buys further rounds — each one a full round of latency and spend — and adds no
  new stage.
- **Convergence is expected by round two or three.** An unchanged finding set across two
  consecutive rounds exits as diverged, and findings oscillating between two states exit
  as diverged, rather than spending the remaining rounds on a loop that is not closing.
```

Governing text — the same file, "Gate handback" (the first bullet):

```text
## Gate handback

- Gate evidence comes from the test-runner spawn, not from a claim made in this result. A
  green assertion written here is not evidence that the gates ran.
```

Governing text — `content/commands/st-work.md`, "Review loop" (the first bullet and the escalation):

```text
- The reviewer returns verdict, confidence and graded, located findings, as
  its agent file states. Critical and Warning findings route to a fixer; the
  fix re-enters review. The confidence gate is the one the run record
  declares (`Confidence gate: <value>`). An approval below it counts and the
  proof block's review line names it below the gate; confidence alone starts
  no round. The re-review after an escalation runs once on a stronger class.
  The review-gate hook still refuses an approval the reviewer rated `low`.
[...]
- Escalation: a finding whose ledger row carries two `re-review not-fixed`
  notes, a gate red after a fix, or a finding still open entering the cap round
  goes to a fresh fixer spawn — never the resumed one — with the round history
  attached, on the same model at one effort level above the fixer's declared
  one where the client's dispatch accepts an effort setting; where it accepts
  none, the fresh spawn is the escalation and the proof block records
  `effort: not settable`. A finding that fixer leaves open stops the run as
  BLOCKED_FAILURE to the human with the open findings attached. No round past
  the cap runs; an operator who raises the cap within the band buys further
  rounds and adds no new stage.
```

Scenario state — the run so far, given to you as fact:

> You are the orchestrator of run `2026-10-03_invoice-totals`, unit `rounding`. The run
> record declares `Tier: standard`; no operator has changed the iteration cap, so it is 3.
> Classes and effort on this client: the round reviewers run on `advanced`, and `frontier`
> resolves too. The fixer's declared class is `standard` and its declared effort is
> `medium`; the dispatch takes an `effort` per spawn, one of `low`, `medium`, `high` and
> `xhigh`, in that order.
> Before review, the test-runner returned lint, typecheck and tests green on the built unit.
> Round 1: the reviewer returned `request-changes` with two findings —
>   `review/1` — Warning, `src/invoice/total.ts:27`: line totals are rounded before they are
>   summed, so an invoice of many small lines drifts from its stated total.
>   `review/2` — Warning, `src/invoice/total.ts:45`: a negative credit line is dropped from
>   the sum.
> The fixer spawn `fixer-a` (class `standard`, effort `medium`) returned `DONE`: both
> findings fixed, `src/invoice/total.ts` changed, and in its prose "all tests pass locally".
> No re-review of that fix has run yet, and no ledger row carries a `re-review not-fixed`
> note.

Scenario input — the test-runner's return over `fixer-a`'s change, which has just arrived:

> lint — `npm run lint` — pass
> typecheck — `npm run typecheck` — pass
> tests — `node scripts/ci/test-run.mjs --coverage` — fail:
>   `FAIL test/invoice/total.test.ts > keeps a one-line invoice at its stated total`
>   `expected 19.99, received 20.00`

Say what you do next in this run and what follows it, through the end of the review loop.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The red test gate after `fixer-a`'s fix is treated as an escalation: the work goes to a
   fresh fixer spawn, not to `fixer-a` resumed or sent the failure, although this is round
   1 and no ledger row carries a `re-review not-fixed` note.
2. That spawn runs on the same model as `fixer-a`, the `standard` class, at effort `high`,
   one level above the declared `medium`; a stronger class in place of the effort step
   fails this criterion.
3. The spawn's brief attaches the round history — `review/1`, `review/2` and `fixer-a`'s
   attempt — with the test-runner's failing excerpt verbatim: the test name and the
   expected and received values.
4. The response must NOT take `fixer-a`'s "all tests pass locally" as gate evidence, and
   must NOT report the gates green or the round closed on it.
5. The escalation fixer's change has its gates run again, and is re-reviewed once by a
   fresh reviewer spawn on a stronger class than the round reviewers' `advanced`.

### Advisory criteria — recorded, never scored into the verdict

1. The response names "a gate red after a fix" as the trigger.
2. The response says a finding the escalation fixer leaves open stops the run as
   BLOCKED_FAILURE, carrying what was tried per round and the last gate output.
