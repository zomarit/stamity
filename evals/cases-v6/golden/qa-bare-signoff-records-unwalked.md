---
id: qa-bare-signoff-records-unwalked
class: golden
claim: "A bare sign-off records each open row accepted-unwalked with its input hash and never walked; a non-H row accepted earlier with an unchanged hash is carried rather than asked; auto-proven rows keep their pointers; and Shippable is not YES while an H row stands accepted unwalked."
source: content/skills/st-qa/SKILL.md:61-63,68-72,105-143
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/skills/st-qa/SKILL.md`, "Build the walk-through table" (the
`Risk` and `Proof` columns):

```text
- **Risk** is `H` (data loss, a security hole, or a blocked core flow with no
  workaround), `M` (degraded primary flow with a workaround), or `L` (cosmetic,
  or confined to a secondary flow).

[...]

- **Proof** is the row's state: `auto-proven` with its evidence pointer,
  `walked` (recorded only when the person says they walked that row), or
  `accepted-unwalked` with its input hash — the sha256 of the sorted lines
  `<path> <git hash-object of path>` over the files the row derives from. An
  open row shows an unchecked box.
```

Governing text — the same file, "Human sign-off" and "Handback" (the sign-off block's
fence lines are left out here):

```text
## Human sign-off

Asked only when a row needs a person. When every row auto-proved, the
checkpoint closes on its pointers with no ask and records "all N rows
auto-proven". A bare sign-off ("signed off", "ok") records each open row
`accepted-unwalked` with its input hash, never `walked`, and so does any
sign-off for each open row it does not name. A reply that withholds sign-off
records no row as accepted and leaves the checkpoint open. A row is `walked`
only when the person's reply says so for that row or for all of them, and
that reply is quoted in the record. A row recorded `accepted-unwalked` in an
earlier record of this change with the same input hash is carried as
`accepted-unwalked (carried from <run-id>)`, not asked again — never a row
whose Risk is now `H`, which is asked at every checkpoint until walked or
auto-proven; a changed hash reopens it. An unattended run asks nothing and
records `Shippable: not signed`.

**Sign-off** — <change>, <date>

- [ ] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: <the concrete revert path — a revert command, or the flag to flip>.
- Shippable: YES / NO / not signed. YES only with no H row accepted-unwalked;
  otherwise NO, naming the open H row. On NO, list the blocking rows.

An unsigned checkpoint is not a passed one: report the checkpoint as open
rather than closing the run around it.

## Handback

Return four facts to the caller: rows derived, rows auto-proven with their
pointers, rows left for a person with each row's state and input hash (a
`walked` row with the quoted reply it rests on), and the sign-off outcome.
Inside a work run those four land in the proof block as the checkpoint's
record; invoked on its own, the skill prints them and stops.
Inside a work run the skill asks nothing itself: the rows left for a person
ride the run's one close question.
```

Scenario state — given to you as fact:

> You were invoked on your own, before the merge decision on branch `export-cursor`
> (cursor pagination on the user-export endpoint); this is not inside a work run.
> The table you derived has five rows:
>   Row 1 — H — "An export request with a forged cursor is refused" — auto-proven:
>   `npm run test` pass, the assertion at `test/api/export.test.ts:58`.
>   Row 2 — M — "Page two of a 250-user export starts at user 101" — auto-proven:
>   `npm run test` pass, the assertion at `test/api/export.test.ts:41`.
>   Row 3 — M — "An export of 10,000 users streams without a timeout" — recorded
>   `accepted-unwalked` in the earlier QA record of this change, run
>   `2026-09-28_export-cursor`, input hash `sha256:5b0c9e41d7aa`; the hash over its files
>   today is the same.
>   Row 4 — H — "A user outside the admin role gets 403 on the export" — open, input hash
>   `sha256:e13f08a2c4b6`.
>   Row 5 — L — "The export button shows a spinner while the file builds" — open, input
>   hash `sha256:7d42ab19f053`.
> You emitted the table and asked the person for sign-off on the rows left for them.
> Rollback is `git revert` of the merge commit.

Scenario input — the person's reply:

> Signed off.

Record the checkpoint as the skill does, and hand back.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Rows 4 and 5 are recorded `accepted-unwalked`, each with its input hash
   (`sha256:e13f08a2c4b6` and `sha256:7d42ab19f053`).
2. The response must NOT record row 4 or row 5 as `walked`, and must NOT describe either as
   walked or passing on the strength of "Signed off."
3. Row 3 is recorded as carried — `accepted-unwalked (carried from 2026-09-28_export-cursor)`
   or that state naming that run — and is not asked about again.
4. Rows 1 and 2 stay `auto-proven` with their pointers, and neither is put to the person.
5. The sign-off's `Shippable` reads NO, naming row 4 as the H row accepted unwalked that
   blocks release.
6. The response must NOT record `Shippable: YES`.
7. The handback carries the four facts: five rows derived, the two auto-proven rows with
   their pointers, the rows left for a person with each row's state and input hash, and the
   sign-off outcome.

### Advisory criteria — recorded, never scored into the verdict

1. The response says what closes row 4: walking it, or auto-proving it from evidence.
