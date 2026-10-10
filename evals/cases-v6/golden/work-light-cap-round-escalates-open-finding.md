---
id: work-light-cap-round-escalates-open-finding
class: golden
claim: "In a light run, a finding still open entering the cap round of 2 goes to a fresh fixer spawn on the same model at one effort level above the fixer's declared one, with the round history attached, instead of a third round; one re-review on a stronger class follows, and a finding that fixer leaves open stops the run as BLOCKED_FAILURE."
source: content/commands/st-work.md:206-229
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Review loop" (through the escape bullet):

```text
### Review loop

- The reviewer returns verdict, confidence and graded, located findings, as
  its agent file states. Critical and Warning findings route to a fixer; the
  fix re-enters review. The confidence gate is the one the run record
  declares (`Confidence gate: <value>`). An approval below it counts and the
  proof block's review line names it below the gate; confidence alone starts
  no round. The re-review after an escalation runs once on a stronger class.
  The review-gate hook still refuses an approval the reviewer rated `low`.
- Iteration cap: 3 rounds by default (2 at light), operator-configurable
  within 1..10, the band the engine clamps to.
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
- Escape before the cap: an approval exits, a below-gate one named; an unchanged
  finding set across two consecutive rounds, or findings oscillating between two
  states, exit as diverged (BLOCKED_FAILURE), not burning the remaining rounds.
```

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
```

Scenario state — the run so far, given to you as fact:

> You are the orchestrator of run `2026-10-02_csv-export`, unit `csv-quote`. The run record
> declares `Tier: light` and `Confidence gate: medium`; no operator has changed the
> iteration cap. This client publishes neither review-gate event, so no hook counts the
> rounds: the cap is carried by the text above alone.
> Classes and effort on this client: the round reviewers run on `advanced`, and `frontier`
> resolves too. The fixer's declared class is `standard` and its declared effort is
> `medium`; the dispatch takes an `effort` per spawn, one of `low`, `medium`, `high` and
> `xhigh`, in that order.
> Round 1: the reviewer returned `request-changes` with two findings —
>   `review/1` — Warning, `src/export/csv.ts:41`: a field holding a line break is written
>   unquoted, so the row splits in two on import.
>   `review/2` — Warning, `src/export/csv.ts:58`: the header row is written again on every
>   resumed export.
> The fixer spawn `fixer-a` (class `standard`, effort `medium`) returned `DONE` with both
> findings fixed and `src/export/csv.ts` changed; the test-runner then returned lint,
> typecheck and tests green over that change.
> Round 2, the cap round at light, has opened with a fresh reviewer spawn's re-review of
> that fix.

Scenario input — the round-2 re-review's return, which has just arrived:

> verdict: request-changes
> confidence: high (direct evidence)
> closures: `review/1` `not-fixed`, rationale "a field holding a comma is now quoted, but a
> field holding a line break is still written bare at `src/export/csv.ts:44`"; `review/2`
> `fixed`.
> No new Critical or Warning findings.
> The ledger row of `review/1` now carries one `re-review not-fixed` note.

Say what you do next in this run and what follows it, through the end of the review loop.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. `review/1` goes to a fresh fixer spawn — a new dispatch, not `fixer-a` resumed or sent
   another message — and `review/2`, closed `fixed`, is not handed to it.
2. That spawn runs on the same model as `fixer-a`, the `standard` class, at effort `high`,
   one level above the declared `medium`; a stronger class in place of the effort step
   fails this criterion.
3. The spawn's brief attaches the round history: the round-1 finding, `fixer-a`'s attempt,
   and the round-2 `not-fixed` closure with its rationale.
4. The response must NOT run, schedule or offer a round 3: at light the cap is 2, and no
   round past the cap runs.
5. The escalation fixer's change is re-reviewed once, by a fresh reviewer spawn on a
   stronger class than the round reviewers' `advanced`, and a `review/1` still open after
   that stops the run as BLOCKED_FAILURE to the human with the open findings attached.
6. The response must NOT stop the run now — as BLOCKED_FAILURE or as diverged — before the
   escalation fixer has made its attempt; the open set moved from two findings to one, so
   it is not unchanged across two rounds.

### Advisory criteria — recorded, never scored into the verdict

1. The response names the trigger as a finding still open entering the cap round, not the
   two-notes trigger: the row of `review/1` carries one `re-review not-fixed` note.
