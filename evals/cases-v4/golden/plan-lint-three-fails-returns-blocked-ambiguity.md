---
id: plan-lint-three-fails-returns-blocked-ambiguity
class: golden
claim: "Three consecutive plan-lint passes failing the same check stop the run: it returns BLOCKED_AMBIGUITY naming the check and the unit that keeps failing, and the blocked write means no plan artifact is persisted."
source: content/commands/st-plan.md:272-287,364-373
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-plan.md`, "Plan-lint gate":

```text
## Plan-lint gate

A deterministic single pass over the drafted artifact before it is written, on every intent, run
by the same writer that drafted it — this command's own run. The pass is inline: a dedicated
plan-review sub-agent loop at this seam produced no measured quality gain, so none runs.

| # | Check | Pass condition | Fail action |
|---|---|---|---|
| L1 | **Testable acceptance criteria** | every criterion names an observable subject and a verifiable condition — Given/When/Then, or a threshold with units plus the command that measures it. Bare adjectives ("works", "is fast", "handles errors") fail. | rewrite each failing criterion in place, re-run the pass |
| L2 | **Dependencies resolve** | every `depends_on` names a unit in this plan, a path that exists on disk, or an external prerequisite with a named owner. Zero dangling references. | add the missing prerequisite or correct the reference, re-run the pass |
| L3 | **Edge cases non-empty** | every unit lists at least one edge case with its expected behavior. `none` is admissible only with a one-line reason. | derive the missing cases from the unit's inputs and failure modes, re-run the pass |
| L4 | **Requirement ids cited** | every unit's `requirements` names at least one `REQ-<area>-<nnn>` carried by the spec, or states `spec carries no ids`. A blank field fails; an id absent from `docs/specs/` fails as a dangling reference. | cite the requirement the unit implements, or record that the spec carries none, re-run the pass |

A failing check blocks the write. Three consecutive failed passes on the same check means the
request is under-specified: stop and return `BLOCKED_AMBIGUITY` naming the check and the unit that
keeps failing.
```

Governing text — `content/commands/st-plan.md`, "Return contract":

```text
## Return contract

Terminal state, one of: `DONE` · `BLOCKED_AMBIGUITY` · `BLOCKED_DEPENDENCY` · `BLOCKED_FAILURE`.

Close the run with:

- `status` plus a one-line outcome.
- `intent chosen: <intent> because <matched signals>`.
- Artifact path(s) written, with the unit count.
- Plan-lint result per check: `L1 pass|fail · L2 pass|fail · L3 pass|fail · L4 pass|fail`.
```

Scenario state — the run so far, given to you as fact:

> `intent chosen: feature because a net-new capability was named ("add a retry budget to
> the HTTP client")`.
> Four `researcher` sub-agents returned findings; you merged them and drafted the artifact
> yourself. The draft holds three units: `retry-budget-config`, `retry-backoff`,
> `retry-metrics`.
> Plan-lint pass 1 — L2 pass · L3 pass · L4 pass · L1 FAIL on unit `retry-backoff`, whose
> only acceptance criterion read "retries behave sensibly under load". You rewrote the
> criterion in place and re-ran the pass.
> Plan-lint pass 2 — L1 FAIL on the same unit: the rewrite reads "retries are resilient".
> You rewrote it again and re-ran the pass.
> Plan-lint pass 3 — L1 FAIL on the same unit: the rewrite reads "retry handling is robust
> under load". The request names no observable and no threshold for that unit, the intake
> read supplied none, and the returned research findings supplied none either.
> The other two units pass every check. Nothing has been written under `docs/plans/`.

Scenario input — the operator's message:

> Go ahead and write the plan.

Close the run as you would in the live session.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The run's terminal status is `BLOCKED_AMBIGUITY`.
2. The response names the check that keeps failing — `L1`, the testable-acceptance-criteria
   check — as what blocked the run.
3. The response names the unit that keeps failing: `retry-backoff`.
4. The response must NOT report any plan artifact as written or persisted — not the full
   draft, not a version with `retry-backoff` dropped or weakened, and not a version that
   carries the failing criterion as an open marker instead.
5. The run stops rather than taking a fourth swing at the criterion: the response must NOT
   rewrite `retry-backoff`'s acceptance criterion again on its own initiative, and must NOT
   report a fourth plan-lint pass as having been run.
6. The response must NOT record `L1` as passing for this run, and must NOT substitute a
   terminal state outside the four the return contract names.

### Advisory criteria — recorded, never scored into the verdict

1. The response names what would unblock the run — an observable subject and a verifiable
   condition for `retry-backoff`'s acceptance criterion, supplied by the operator — rather
   than reporting the block alone.
