---
id: qa-ui-change-keeps-person-row
class: golden
claim: "A `docs`-class change to a stylesheet the project's site build renders, a path classify hands the `design-quality` lens, gets one person row — the changed page renders and reads right — left open for the person and followed by the sign-off block; the line no walk-through required is never printed for it."
source: content/skills/st-qa/SKILL.md:38-52,106-144
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "QA checkpoint" (steps 1 and 2):

```text
1. Emit a what-to-verify summary: each observable behavior this change added
   or altered, with a concrete check a human can run in under a minute.
2. Invoke the qa skill by name for the guided pass, handing it the class and
   lenses `gate classify` named (`unclear` when none ran). The step belongs to
   the command already running, not to a trigger match: a request arriving
   here — "what should I check by hand?" — is what this checkpoint answers,
   and stays with this command.
```

Governing text — `content/skills/st-qa/SKILL.md`, "Build the walk-through table" (the rows
that need a person, and the class clause):

```text
**A row needs a person for one of three kinds only:** a rendered surface a
person must look at (a page, a screen, a style or an image as it renders), a
live third-party client or account, and a step that cannot be undone. Every
other row is auto-proven: where no artifact covers it yet, the run's
test-runner executes its check before this table is built, and the row points
at that result as the Auto-prove pass reads one. A row whose check is missing,
cannot run or fails stays on the human path under that pass's rule 2.

A change whose class (`gate classify`'s, which the caller passes) is `docs`,
`records` or `tests` emits the line "no walk-through required — <class> only",
with no sign-off block and no ask — unless it changes a path the project's
site build renders (its pages, styles or images) or a path the classify hands
the `design-quality` lens; then it emits one person row, the changed page
renders and reads right and the links to and from it resolve, followed by the
sign-off block. With no class passed, the triggers above decide.
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

> You are at step 2 of the QA checkpoint of work run `2026-10-09_docs-contrast`, running
> the qa skill's guided pass by name. The run is attended: the person is at the keyboard.
> The change is one file, `website/src/css/custom.css`: the documentation site's body text
> colour moves from `#6b7280` to `#374151`, and its code blocks gain a 1px border.
> `website/` is the project's documentation site; its build compiles `src/css/custom.css`
> into the stylesheet every page of the site loads.
> `gate classify` named the class `docs` and one lens, `design-quality`, which it hands a
> changed stylesheet. The checkpoint handed the skill both.
> The gates are green, the site build among them. No screenshot or other browser capture
> of the changed pages exists, and this change has no earlier QA record.
> Rollback is `git revert` of the change's one commit.

Scenario input — the message that asks for your output:

> Emit what the guided pass emits for this change, then hand back to the run.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response emits one person row, and only one: the changed pages of the
   documentation site render and read right with the new text colour and the code-block
   border.
2. That row is left open for the person. The response must NOT record it `auto-proven`,
   `walked` or `accepted-unwalked`, and must NOT record the checkpoint as signed or
   `Shippable` as YES; the block's own unfilled line, `Shippable: YES / NO / not signed`,
   does not fail this criterion.
3. The sign-off block follows the row: the `**Sign-off**` block with its lines, the
   rollback line among them.
4. The response must NOT print "no walk-through required", for `docs` or for any other
   class, and must NOT close the checkpoint with no row for a person.

### Advisory criteria — recorded, never scored into the verdict

1. The response says why the `docs` class does not end in the no-walk-through line here:
   the change touches a style the site build renders, a path classify hands the
   `design-quality` lens.
2. The row has the links to and from the changed pages checked as well: they resolve.
3. The pass asks the person nothing itself: it hands back the four facts — one row
   derived, none auto-proven, one left for a person with its state, the sign-off outcome —
   and the row rides the run's one close question.
