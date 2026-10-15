---
id: qa-ui-change-keeps-person-row
class: golden
claim: "A `docs`-class change to a stylesheet the project's site build renders, a path classify hands the `design-quality` lens, gets one person row — the changed page renders and reads right — left open for the person and followed by the sign-off block; the line no walk-through required is never printed for it."
source: content/skills/st-qa/SKILL.md:38-64,121-159
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "QA checkpoint" (steps 1 and 2):

```text
1. Emit a what-to-verify summary once the prover the qa skill asks this run to dispatch returns: only the rows that skill leaves for
   the person, at most three with the security-negative row, each with a check a person can run in under a minute, a `contradicted` one with its excerpt.
2. Invoke the qa skill by name for the guided pass, handing it the class and
   lenses `gate classify` named (`unclear` when none ran). The step belongs to
   the command already running, not to a trigger match: a request arriving
   here — "what should I check by hand?" — is what this checkpoint answers,
   and stays with this command.
```

Governing text — `content/skills/st-qa/SKILL.md`, "Build the walk-through table" (the rows
that need a person, and the class clause):

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

A change whose class (`gate classify`'s, which the caller passes) is `docs`, `records` or
`tests` emits the line "no walk-through required — <class> only", with no sign-off block and
no ask, only when none of three conditions holds: it changes a path the project's site build
renders (its pages, styles or images), a path the classify hands the `design-quality` lens, or
legal or policy wording (a licence, terms, a privacy or security policy, governance or conduct
text). Otherwise it emits one person row (for a rendered page: the changed page renders and
reads right and the links to and from it resolve; for wording: the changed wording reads as
intended), followed by the sign-off block. With no class passed, the triggers above decide.
```

Governing text — the same file, "Human sign-off" and "Handback" (the sign-off block's
fence lines are left out here):

```text
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

**Sign-off** — <change>, <date>

- [ ] Every H row walked or auto-proven, and passing — an H row accepted unwalked blocks release.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: <the concrete revert path — a revert command, or the flag to flip>.
- Shippable: YES / NO / not signed. YES only once every H row is walked or proven and none
  stands `contradicted`; otherwise NO, naming the open H row. On NO, list the blocking rows.

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
> The prover the qa skill asked the run to dispatch has returned for the one row no artifact
> covers: `not proven: how the changed pages read with the new colour and border is taste or
> judgment, which no route proves`.
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
   `agent-run`, `walked` or `accepted-unwalked`, and must NOT record the checkpoint as signed or
   `Shippable` as YES; the block's own unfilled line, `Shippable: YES / NO / not signed`,
   does not fail this criterion.
3. The sign-off block follows the row: the `**Sign-off**` block with its lines, the
   rollback line among them.
4. The response must NOT print "no walk-through required", for `docs` or for any other
   class, and must NOT close the checkpoint with no row for a person. Naming that line to
   say why it does not apply to this change does not fail this criterion.

### Advisory criteria — recorded, never scored into the verdict

Re-baselined 2026-10-14 (run 2026-10-14_cli-native, unit f9-evals; REQ-FLOW-081, REQ-FLOW-080):
`st-qa` (`content/skills/st-qa/SKILL.md:38-63,121-159`, re-quoted in the Brief) now sends every
row no artifact covers to the prover first, names `agent-run` as the state of a row a route
proves, keeps a row in one of five person categories for the person, and hands the rows left for
a person to the run's close walk. The scenario now gives the prover's return for the one row —
`not proven`, how the pages read being taste or judgment — so the row is the person's under the
new text as it was under the old. B2 adds `agent-run` to the states the open row must NOT be
recorded in; A3 reads "the run's close walk" where it read "the run's one close question". B1,
B3 and B4 are unchanged.

1. The response says why the `docs` class does not end in the no-walk-through line here:
   the change touches a style the site build renders, a path classify hands the
   `design-quality` lens.
2. The row has the links to and from the changed pages checked as well: they resolve.
3. The pass asks the person nothing itself: it hands back the four facts — one row
   derived, none auto-proven, one left for a person with its state, the sign-off outcome —
   and the row rides the run's close walk.
