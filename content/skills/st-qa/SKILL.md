---
license: MIT
compatibility: Requires a supported coding client, repository access, and the project verification tools.
id: qa
type: skill
description: "Builds the human QA walk-through for a change — a risk-ordered table of scenarios, steps, and expected results, with rows auto-proven from existing evidence first — and records the shippability sign-off. Called by name from a work run's own QA checkpoint and never selected there on its own. Triggers on its own only before a merge or release decision, or when someone asks what a person should manually test before shipping."
tags: [review]
load: on-demand
obsolete_when: three consecutive release runs close with every QA checkpoint row auto-proven from existing evidence, so the walk added no row a person judged
---

# QA walk-through

The human checkpoint: what a person sees with their own eyes before a change
ships. Rows that existing evidence already proves are moved aside first, so the
walk covers what evidence cannot reach.

## Quick Start

1. Read the change surface — the diff, plus the run's gate and evidence output.
2. Derive rows from the triggers below.
3. Auto-prove what existing artifacts already cover; the prover tries the rest.
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

**A row needs a person for one of five categories only:** taste or judgment (how a
page, a screen, a style or an image reads as it renders), a real account the run cannot
hold, a step that cannot be undone, physical or OS-native use, and legal or policy
wording. Every other row is auto-proven or reported, never asked. Before this table is
built, every row no artifact covers goes to the prover: this skill cannot spawn, so it
tells its caller to dispatch the test-runner in its row-proving mode with those rows (a
caller that cannot dispatch runs the cheapest routes itself under that mode's guards
and says so), and an unattended run proves the same way. A row a route proves reads
`agent-run`. A row outside the five that no route proves goes on the run's `Not done:`
as "not proven: <reason>", never to the person; one inside them is the person's. At
most three rows reach the person: the security-negative row below first whenever it is
the person's, then the most important; any further row is listed "over the cap, not
asked: <reason>", which blocks nothing by itself. An H row over the cap stays an H row,
asked at the next checkpoint under the carry rule below. The exception is the negative
row a security-adjacent path derives: it is auto-proven only where a committed test's
assertion covers it (that pass's rule 1: the test source `file:line` beside the
runner's command and outcome); a check run once for the row is not proof for it, and
with no such test it stays on the human path. An `agent-run` never proves that row.

A change whose class (`gate classify`'s, which the caller passes) is `docs`, `records` or
`tests` emits the line "no walk-through required — <class> only", with no sign-off block and
no ask, only when none of three conditions holds: it changes a path the project's site build
renders (its pages, styles or images), a path the classify hands the `design-quality` lens, or
legal or policy wording (a licence, terms, a privacy or security policy, governance or conduct
text). Otherwise it emits one person row (for a rendered page: the changed page renders and
reads right and the links to and from it resolve; for wording: the changed wording reads as
intended), followed by the sign-off block. With no class passed, the triggers above decide.

Seven columns, every one filled: `#`, `Scenario`, `Steps`, `Expected`, `Risk`, `Minutes`, `Proof`.

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
- **Proof** is the row's state: `auto-proven` with its evidence pointer, `agent-run` with
  its command, exit code and output path, `contradicted` with the prover's redacted excerpt,
  `walked` (recorded only when the person says they walked that row), or `accepted-unwalked`
  with its input hash — the sha256 of the sorted lines `<path> <git hash-object of path>`
  over the files the row derives from. An open row shows an unchecked box.

Sort by `Risk` descending, then by `Minutes` ascending. Past 90 minutes summed
over the `Minutes` column, split the table into sessions of 30 minutes or less
and say so above it.

## Auto-prove pass

A row is auto-proven only by an artifact that already exists for this change:

| Artifact | Proves |
|---|---|
| a gate result from the run's test runner — command and outcome — paired with the test source, `file:line`, whose assertion covers the row | functional, contract, and migration rows |
| an `agent-run` the prover recorded — command, exit code, output path | the row it was run for, except a security-negative row |
| a verification artifact under `.stamity/verify/` | the axis criteria that row restates |
| a browser-evidence capture at `.stamity/evidence/browser-<sha>.json` — spec run, screenshot, console output | UI rows |

A browser capture is an input to this walk, not a step inside it: where a UI row
needs one and no bundle exists for the current sha, the browser run happens
before this table is built. A UI row with no bundle stays on the human path.

Three rules make the pass honest:

1. The pointer names the artifact and what it covers. "The suite is green" is
   not proof of a particular scenario. A passing gate carries no failing
   excerpt, so what covers the row is cited from the test source — the file and
   line of the assertion — with the runner's command and outcome beside it —
   or from the prover's `agent-run`: the two forms the table accepts.
   A gate row whose status is `unknown` proves nothing.
2. Absent tooling or a prover that could not run records `not proven: <reason>`; a route
   whose output contradicts `Expected` records `contradicted`, its excerpt going with
   the row to the person or to `Not done:`. Missing evidence is never scored as a pass —
   an unproven row is the person's when it is in one of the five categories, and
   otherwise goes on `Not done:`.
3. Proven rows, `auto-proven` and `agent-run`, fold into one line with their
   pointers. The table carries the remainder, so nobody re-walks what a machine proved.

## Human sign-off

Asked only when a row needs a person. When every row auto-proved, `agent-run` rows included,
the checkpoint closes on its pointers with no ask and records "all N rows auto-proven". A
bare sign-off ("signed off", "ok") records each open row `accepted-unwalked` with its input
hash, never `walked`, and so does any sign-off for each open row it does not name. A reply
that withholds sign-off records no row as accepted and leaves the checkpoint open. A row is
`walked` only when the person's reply says so for that row or for all of them, and that
reply is quoted in the record. A `contradicted` row is failing: a walk is recorded beside
its excerpt and does not clear it, and only a later run showing `Expected` does. A row
recorded `accepted-unwalked` in an earlier record of this change with the same input hash is
carried as `accepted-unwalked (carried from <run-id>)`, not asked again — never a row whose
Risk is now `H`, which is asked at every checkpoint until walked or auto-proven; a changed
hash reopens it. An unattended run asks nothing and records `Shippable: not signed`.

```markdown
**Sign-off** — <change>, <date>

- [ ] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: <the concrete revert path — a revert command, or the flag to flip>.
- Shippable: YES / NO / not signed. YES only once every H row is walked or proven and none
  stands `contradicted`; otherwise NO, naming the open H row. On NO, list the blocking rows.
```

An unsigned checkpoint is not a passed one: report the checkpoint as open
rather than closing the run around it.

## Handback

Return four facts to the caller: rows derived, rows auto-proven with their
pointers, rows left for a person with each row's state and input hash (a
`walked` row with the quoted reply it rests on) beside the rows not proven,
contradicted or over the cap, each with its reason, and the sign-off outcome.
Inside a work run those four land in the proof block as the checkpoint's
record; invoked on its own, the skill prints them and stops.
Inside a work run the skill asks nothing itself: the rows left for a person
ride the run's close walk.
