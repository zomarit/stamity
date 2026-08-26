---
id: qa
type: skill
description: "Builds the human QA walk-through for a change — a risk-ordered table of scenarios, steps, and expected results, with rows auto-proven from existing evidence first — and records the shippability sign-off. Triggers at the closing checkpoint of a work run, before a merge or release decision, or when someone asks what a person should manually test before shipping."
tags: [review]
load: on-demand
obsolete_when: automated evidence covers observable behavior end to end, leaving no judgment a person adds by walking the change
---

# QA walk-through

The human checkpoint: what a person sees with their own eyes before a change
ships. Rows that existing evidence already proves are moved aside first, so the
walk covers what evidence cannot reach.

## Quick Start

1. Read the change surface — the diff, plus the run's gate and evidence output.
2. Derive rows from the triggers below.
3. Auto-prove what existing artifacts already cover.
4. Emit the remaining table plus the sign-off block.
5. Hand the outcome back to the caller.

## Build the walk-through table

Each trigger fires once per instance, not once per diff:

| Trigger in the diff | Rows derived |
|---|---|
| a user-visible surface changed | one per surface, walking its primary flow |
| an error, fallback, retry, or timeout path changed | one that causes that failure on purpose and observes the handling |
| config or a migration changed | two: a clean first run, and an upgrade over existing state |
| a security-adjacent path changed (auth, permissions, input validation, secret handling) | one negative row: attempt exactly what the change should deny, and record the refusal expected |
| UI changed and the repo declares breakpoints or themes | one per declared combination the change renders in |

A diff that is documentation only emits one row (the pages render and their
links resolve) or the line "no walk-through required — documentation only",
followed by the sign-off block.

Seven columns, every one filled: `#`, `Scenario`, `Steps`, `Expected`, `Risk`,
`Minutes`, `Proof`.

- **Scenario** names an observable behavior, never a file path.
- **Steps** begin from a stated start state and use concrete values a reader
  can copy, written for someone who has not read the diff.
- **Expected** is observable from outside: rendered text, HTTP status, exit
  code, a file that appears. Internal state is not an expected result.
- **Risk** is `H` (data loss, a security hole, or a blocked core flow with no
  workaround), `M` (degraded primary flow with a workaround), or `L` (cosmetic,
  or confined to a secondary flow).
- **Minutes** is this row's walking cost, derived from its own `Steps`: one
  minute per step a person performs, rounded up, plus any wait a step names. It
  is stated per row because the sort and the split below are computed from it,
  and a threshold on a number no column carries cannot be applied.
- **Proof** is an evidence pointer, or an unchecked box for a person to walk.

Sort by `Risk` descending, then by `Minutes` ascending. Past 90 minutes summed
over the `Minutes` column, split the table into sessions of 30 minutes or less
and say so above it.

## Auto-prove pass

A row is auto-proven only by an artifact that already exists for this change:

| Artifact | Proves |
|---|---|
| a gate result from the run's test runner — command and outcome — paired with the test source, `file:line`, whose assertion covers the row | functional, contract, and migration rows |
| a verification artifact under `.stamity/verify/` | the axis criteria that row restates |
| a browser-evidence capture at `.stamity/evidence/browser-<sha>.json` — spec run, screenshot, console output | UI rows |

A browser capture is an input to this walk, not a step inside it: where a UI row
needs one and no bundle exists for the current sha, the browser run happens
before this table is built. A UI row with no bundle stays on the human path.

Three rules make the pass honest:

1. The pointer names the artifact and what it covers. "The suite is green" is
   not proof of a particular scenario. A passing gate carries no failing
   excerpt, so what covers the row is cited from the test source — the file and
   line of the assertion — with the runner's command and outcome beside it.
2. Absent tooling or a failed prover records `no` with the reason. Missing
   evidence is never scored as a pass — unproven rows stay on the human path,
   which is the safe direction.
3. Auto-proven rows move to an appendix with their pointers. The walk-through
   table carries the remainder, so nobody re-walks what a machine proved.

## Human sign-off

Required on every run, including the run where every row auto-proved. The
checkpoint exists to put a person in front of the change, and a table of green
pointers is exactly the case where a machine's blind spot is invisible. When the
remainder is empty the table says so — "all N rows auto-proven; spot-check the
two highest-risk pointers, then sign" — and the sign-off still gates the close.

```markdown
**Sign-off** — <change>, <date>

- [ ] Every H row walked and passing.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: <the concrete revert path — a revert command, or the flag to flip>.
- Shippable: YES / NO. On NO, list the blocking rows.
```

An unsigned checkpoint is not a passed one: report the checkpoint as open
rather than closing the run around it.

## Handback

Return four facts to the caller: rows derived, rows auto-proven with their
pointers, rows left for a person, and the sign-off outcome. Inside a work run
those four land in the proof block as the checkpoint's record; invoked on its
own, the skill prints them and stops.
