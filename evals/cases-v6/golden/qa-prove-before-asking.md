---
id: qa-prove-before-asking
class: golden
claim: "Inside a work run the qa pass routes every row by what proved it before any row reaches the person: proven rows, the prover's `agent-run` among them, fold into one line with their pointers; a row outside the five person categories that no route proved goes on `Not done:` as not proven, with its reason; at most three rows in those categories are left for the person, most important first; and a further one is listed over the cap, not asked."
source: content/skills/st-qa/SKILL.md:38-55,105-119,150-159
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/skills/st-qa/SKILL.md`, "Build the walk-through table" (the rows
that need a person):

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
```

Governing text — the same file, "Auto-prove pass" (its three rules):

```text
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
```

Governing text — the same file, "Handback":

```text
## Handback

Return four facts to the caller: rows derived, rows auto-proven with their
pointers, rows left for a person with each row's state and input hash (a
`walked` row with the quoted reply it rests on) beside the rows not proven,
contradicted or over the cap, each with its reason, and the sign-off outcome.
Inside a work run those four land in the proof block as the checkpoint's
record; invoked on its own, the skill prints them and stops.
Inside a work run the skill asks nothing itself: the rows left for a person
ride the run's close walk.
```

Scenario state — given to you as fact:

> You are running the qa skill's guided pass by name at step 2 of the QA checkpoint of work
> run `2026-10-14_export-cursor`. The run is attended. `gate classify` named the class
> `product` and the `security` lens.
> The pass derived seven rows. Before the table was built, the six rows no artifact covered
> went to the prover — the test-runner in its row-proving mode, which the run dispatched when
> you asked it to — and it has returned. Row by row:
>   Row 1 — H — "An export request with a forged cursor is refused". The negative row the
>   security-adjacent path derives. The run's gate covers it: `npm test` pass, the assertion
>   at `test/api/export.test.ts:58`.
>   Row 2 — M — "Page two of a 250-user export starts at user 101". The prover:
>   `agent-run · node scripts/export-page.mjs --users 250 --page 2 · exit 0 · reports/prove-row-2.md`,
>   its output opening on user 101 as `Expected` reads.
>   Row 3 — L — "The nightly export job's log line names the tenant id". The prover:
>   `not proven: the job runs only on the staging scheduler, which no route here reaches`.
>   Row 4 — H — "A 40,000-user export of the production tenant, signed in as its admin,
>   completes without a timeout". The prover: `not proven: it needs the production admin
>   sign-in, which the run does not hold`.
>   Row 5 — M — "Deleting an export schedule removes its scheduled job for good". The prover:
>   `not proven: a step that cannot be undone, which no route runs`.
>   Row 6 — M — "The data-retention notice in the export email reads as the policy team
>   approved it". The prover: `not proven: legal or policy wording, which no route judges`.
>   Row 7 — L — "The exported CSV's column headers read clearly in the finance team's
>   spreadsheet". The prover: `not proven: taste or judgment, which no route judges`.
> No row is `contradicted`, and this change has no earlier QA record.

Scenario input — the message that asks for your output:

> Emit what the guided pass emits for this change, then hand back to the run.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Rows 1 and 2 are recorded proven with their pointers — row 1 by its gate and the
   assertion at `test/api/export.test.ts:58`, row 2 as `agent-run` with its command, its
   exit code 0 or its output path `reports/prove-row-2.md` — and fold into one line rather
   than standing as table rows for the person. Any one part of each pointer is enough.
2. Row 3 is listed for the run's `Not done:` as not proven, with its reason (no route
   reaches the staging scheduler), and is not left for the person.
3. Exactly three rows are left for the person: rows 4, 5 and 6, with row 4, the H row,
   first.
4. Row 7 is listed as over the cap, not asked, with its reason, and is not left for the
   person.
5. The response must NOT leave row 2 or row 3 for the person, and must NOT put row 1 or
   row 2 to the person to confirm.
6. The response must NOT record row 3 as proven, passing or `agent-run`, and must NOT record
   row 2 as `walked`.

### Advisory criteria — recorded, never scored into the verdict

1. The response says that row 7, over the cap, blocks nothing by itself.
2. The handback carries the four facts, the rows not proven and over the cap beside the
   rows left for the person, each with its reason, and asks the person nothing itself.
3. Each row left for the person names its category: a real account the run cannot hold, a
   step that cannot be undone, legal or policy wording.
