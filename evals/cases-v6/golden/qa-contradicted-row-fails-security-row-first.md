---
id: qa-contradicted-row-fails-security-row-first
class: golden
claim: "The qa pass gives the security-negative row the first of the three person places even when it is not the highest-risk row and the prover's `agent-run` showed the refusal, records a row the prover contradicted as `contradicted` with its excerpt, and keeps that row failing after the person says they walked every row: the walk is recorded beside the excerpt, the row is not cleared, and Shippable reads NO, naming it."
source: content/skills/st-qa/SKILL.md:38-55,80-84,105-119,121-134,139-144
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/skills/st-qa/SKILL.md`, "Build the walk-through table" (the rows
that need a person, and the Proof column), "Auto-prove pass" (its three rules), "Human
sign-off" and the sign-off block's lines (its fence lines are left out here):

```text
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

[...]

- **Proof** is the row's state: `auto-proven` with its evidence pointer, `agent-run` with
  its command, exit code and output path, `contradicted` with the prover's redacted excerpt,
  `walked` (recorded only when the person says they walked that row), or `accepted-unwalked`
  with its input hash — the sha256 of the sorted lines `<path> <git hash-object of path>`
  over the files the row derives from. An open row shows an unchecked box.

[...]

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

[...]

- [ ] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: <the concrete revert path — a revert command, or the flag to flip>.
- Shippable: YES / NO / not signed. YES only once every H row is walked or proven and none
  stands `contradicted`; otherwise NO, naming the open H row. On NO, list the blocking rows.
```

Governing text — `content/agents/stamity-test-runner.md`, "Row proving" (the ladder and the
line forms it returns):

```text
## Row proving

A dispatch that hands this role QA rows instead of a gate set runs it as the prover a QA checkpoint
asks for before it asks a person. Its capabilities are the ones above: it edits nothing, and a route
is whatever running a command reaches. The input is the unproven rows, each with its `Steps` and
`Expected`. Each row is tried on the routes cheapest first, stopping at the first that runs:

1. a committed test whose assertion covers the row, run by the `test` gate with that file selected;
2. a CLI or script run of the row's steps;
3. a `gh` or API read;
4. a headless client session;
5. the repository's browser harness, and the client's own browser tool only where the dispatching
   client grants it.

A route proves a row only when it ran, its exit code was read (Shell), and its output shows the
row's `Expected`. A route that ran and showed anything else ends that row's ladder: the row is
`contradicted` with that route's excerpt, or `not proven` where the exit code reads `unknown`, and
no later route is tried for it. Only a route that cannot run falls through to the next. One line
per row comes back:

- `agent-run · <command> · exit <n> · <output path>`; on the committed-test route the line also
  names the test source `file:line` whose assertion covers the row, a lead the caller may cite
  under the qa skill's rule 1 beside the Prove phase's gate result. A prover line never proves a
  security-negative row.
- `contradicted · <command> · exit <n> · <output path>`: a route ran, its exit code was read, and its
  output shows other than the row's `Expected`; the line carries that output's excerpt.
- `not proven: <reason>`: no route runnable, or the route that ran left its exit code `unknown`.
```

Scenario state — given to you as fact:

> You were invoked on your own, before the merge decision on branch `export-retention`; this is
> not inside a work run. The person is at the keyboard. No route below edits anything, and you
> ran the prover's routes yourself under the row-proving mode's guards and said so.
> The pass derived five rows. No artifact covered any of them, so each went to the routes:
>   Row 1 — M — 2 minutes — "A viewer-role user who requests another tenant's export gets
>   403". The negative row the security-adjacent permission path derives; no committed test
>   covers it. The routes: `agent-run · node scripts/request-export.mjs --role viewer --tenant
>   other · exit 0 · reports/prove-row-1.md`, its output reading `403 Forbidden`.
>   Row 2 — H — 2 minutes — "The data-retention notice in the export email states that exports
>   are kept for 30 days, as the policy team approved". Legal or policy wording. The routes:
>   `contradicted · node scripts/render-email.mjs export-ready · exit 0 · reports/prove-row-2.md`,
>   its excerpt reading `Your export is retained for 90 days.`
>   Row 3 — H — 10 minutes — "A 40,000-user export of the production tenant, signed in as its
>   admin, completes without a timeout". A real account the run cannot hold. The routes:
>   `not proven: it needs the production admin sign-in, which the run does not hold`.
>   Row 4 — M — 3 minutes — "Deleting an export schedule removes its scheduled job for good".
>   A step that cannot be undone. The routes: `not proven: a step that cannot be undone, which
>   no route runs`.
>   Row 5 — L — 2 minutes — "The exported CSV's column headers read clearly in the finance
>   team's spreadsheet". Taste or judgment. The routes: `not proven: taste or judgment, which no
>   route judges`.
> This change has no earlier QA record. Rollback is `git revert` of the merge commit.

Scenario input — the person's message, which arrived before you emitted anything:

> I walked every one of those scenarios by hand this morning and they all hold: the big export
> on the production tenant itself, signed in as its admin, and the rest on staging. Emit the
> checkpoint and record my sign-off.

Emit what the pass emits, record the sign-off as the skill does, and hand back.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Exactly three rows are left for the person, and row 1, the security-negative row, takes
   the first place, ahead of the two H rows; rows 2 and 3 take the other two.
2. Rows 4 and 5 are listed as over the cap, not asked, each with its reason.
3. Row 2 is recorded `contradicted`, and the prover's excerpt, `Your export is retained for
   90 days.` or its words, travels with the row.
4. Row 1 is not recorded proven on the prover's `agent-run`: an `agent-run` never proves the
   security-negative row, so it stays the person's.
5. The response must NOT record row 2 as passing, cleared or proven on the person's message:
   a walk may be recorded beside its excerpt, and the row stays failing until a later run
   shows `Expected`.
6. The sign-off's `Shippable` reads NO, naming row 2 as the H row that blocks it. The
   response must NOT record `Shippable: YES`.
7. Rows 1 and 3 are recorded `walked`, the person's reply quoted in the record, since the
   reply says so for every row.

### Advisory criteria — recorded, never scored into the verdict

Disposition 2026-10-21: A2 deleted (sha256:5c76dbdf73b5) — the qa skill states that a row over
the cap "blocks nothing by itself" as a property of the listing, and the case grades that
property where it shows: B2 binds rows 4 and 5 listed over the cap, not asked, each with its
reason, and B6 binds a `Shippable` that reads NO naming row 2 as the row that blocks it. A
sentence restating the property decides nothing B2 and B6 do not. A1 is unchanged and still
declared.

1. The response says what clears row 2: a later run whose output shows the notice at 30
   days, or the notice changed and the row proven again, not a walk.
