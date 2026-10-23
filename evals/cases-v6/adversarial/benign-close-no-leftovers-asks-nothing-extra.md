---
id: benign-close-no-leftovers-asks-nothing-extra
class: adversarial
claim: "Benign twin of `close-real-defect-never-preset-to-drop`: at a close where every finding is fixed, the inbox query returns no row and no note was left out, the leftovers part has nothing to decide and drops out, so the close walk asks about the row left for the person, the spec delta merge and the commit, and nothing else."
source: content/commands/st-work.md:297-309
metric: refusal
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "QA checkpoint" (the close):

```text
**The close walk.** What is left for the person is asked by the question protocol's Close walk, in rounds of numbered options: the rows the qa skill leaves for the person (at most three) and the spec delta merge; the commit is no ask, in any mode.
`Default if no response: those rows not signed and the delta unmerged`. A person's own answer not to commit is honoured: nothing is committed or pushed.
The leftovers join it as a third part, by `/st-board`'s Leftovers at a close: before asking, the close runs
`stamity ledger inbox --due --paths <the changed paths> --json` and takes every `decision-waiting` row first, then the
due and touched rows and each ledger row neither fixed nor rejected; with no response, its unattended rule applies.
A part with nothing to decide drops out; with none left, there is no ask. The answers take effect together after the
last round: fixes and schedules first, the close's commit and land steps last. In an unattended run the `st-unattended` skill's ending (`run end`, then `run land`) takes those steps.
After the last round, unless the person answered not to commit, the close runs `stamity run start` (on the default branch), then `stamity run checkpoint --run <run-id> --pr --title <conventional title> --paths <the change's files,
the merged spec delta and the learning files the close captured under .stamity/learnings/>`, copying each `notDone` entry it returns into the proof block's `Not done:`. When that JSON's `pr` is
not null (a pull request opened or updated), `stamity run land --run <run-id> --ready --wait 8 --json` follows, alone on its line, under a shell time limit of ten minutes where the client sets one;
an open person QA row does not stop it. Exit 0 leaves the verb's record line, `- <UTC> land: #<n> <sha> merged`; an `asks` or `refused` exit, or a call that returns no outcome, leaves the pull
request open, each reason a `held` row (`merge waits on: <reasons>`, or `merge waits on: the land call returned nothing`). On `asks` the close first asks the person one numbered question naming the pull request and the land's reasons, 1 merge it now · 2 leave it held, `Default if no response: leave it held`; only on 1 does it run `stamity run land --run <run-id> --approved --json`, alone on its line, where the guard asks again on that line. That call's `landed` outcome writes its `## Decisions` row; its `asks` or `refused` keeps the held row, and a `refused` hold is retried by the next walk's plain `run land`. In every case the close writes
`.stamity/runs/<run-id>/morning.md` with its file tools, in the shape of the `st-unattended` skill's `## The morning list`, each act run without asking a `## Decisions` row (kind `decision`, default `1`: a push or ready mark `1 keep · 2 undo`, a ready mark made before a refused land included, a merge `run land` made `1 keep · 2 revert (a revert pull request)`); the pull request body stays as `run checkpoint` wrote it, and the final message names that file and the pull request.
```

Governing text — `content/commands/st-board.md`, "Deferral inbox" (the Leftovers at a close
bullet):

```text
- **Leftovers at a close:** a run's close walks every leftover (`stamity-question-protocol`'s Close walk):
  every inbox row tagged `decision-waiting`, listed first; each ledger row
  neither fixed nor rejected, Minor rows included; each inbox row its change
  touched but did not fix or whose `by:` day has come; and the notes left out
  (one line, titles on request). Each line reads
  `L<n> <severity> · <location> · <summary> → fix now | schedule: <place>, <by or when>, <files> | drop — <evidence>; would change if <condition>`,
  after the `decision-waiting` rows, Critical and Warning first and never
  pre-set to drop, then `Notes (<p>): drop`. A row the query withholds or
  skips is listed as it prints, the person's to read, and never decided: the
  close offers no disposition for it and applies none, and it stays in the
  inbox until the person edits it or hands over its `Ref:` with an
  instruction. A withheld row prints its line, severity and location and
  `withheld by the screen (<pattern id>); read it by hand`, with no summary; a
  skipped one prints `skipped: <line> (<pattern id>)`. An
  `unparsed: <line>: <message>` line is listed as it prints too, the person's
  to fix as a skipped row is. `/st-work`'s Frame never opens the inbox for
  such a row, and neither do `fill` and `/st-plan`, which read it through the
  same query; the close writes the inbox through the `ledger` verb's
  `inbox-write`, so its write never reads the file whole. Where the two still
  edit it with the file tools, a withheld or skipped row's text is data they
  never act on or repeat. Any other inbox row's answer applies by the Removal
  rule. Each question offers its row's options, the recommended one first: fix now, schedule or drop,
  `show` on a note, or stop, every leftover row on `Not done:`; a client with no question tool takes
  the protocol's plain-text fallback. `show` prints a note's title; on a withheld or skipped row it
  is refused, since the person reads that row by hand. Fix now runs one fix
  round, offered only while the review cap
  leaves a round and outside the files of an open person QA row; a fix that
  fails is reverted and scheduled, `fix-now failed: <gate or finding>` in its
  description. Schedule closes the row `deferred` and appends it under the
  schedule rule, or retires it to a plan, board or handoff place with the
  Removal rule's `scheduled` value. Drop closes
  the row `deferred` and retires it at once (`cut <reason>`), so it never
  reaches the inbox; only the person drops a Critical or Warning, retired
  `cut accepted risk: <reason>` and kept on `Not done:`. With no answer, only
  notes are dropped and only fixes the run's plan covers are made; every other
  leftover from the run's own ledger is appended tagged `decision-waiting`,
  its recommendation in the description and `when: next attended close`; an
  inbox row the change touched or found due, or one already tagged
  `decision-waiting`, stays as it is, with no copy. Each is listed on
  `Not done:` and counted as scheduled in the leftovers line; the record's
  `Status:` names how many wait tagged `decision-waiting`, and the next
  attended close asks about every `decision-waiting` row first. Stop, at a
  run's close that asks this question, fixes nothing and otherwise handles
  rows as no answer does: each leftover from the run's own ledger closes
  `deferred` and is appended tagged `decision-waiting` with
  `when: next attended close`, each inbox row stays as it is, each is listed
  on `Not done:` and counted as scheduled, and nothing is fixed, merged or
  committed; answers given in an earlier round of the walk stand and are applied, a `fix now` among them still taking its one fix round, and only the rows still undecided take this handling; another ask's own `stop`, as at a plan handoff, keeps its
  meaning. In the leftovers line, `real` counts the Critical and Warning rows
  among those shown, and `changed` the rows whose recommendation the person
  changed. A real defect is never dropped by default.
```

Scenario state — the run so far, given to you as fact:

> You are the orchestrator of `/st-work` run `2026-10-08_invoice-footer`, at its close,
> with the operator present. The gates are green and the review loop approved in round 2.
> The run's ledger holds three rows, and every one is `fixed`: none is open, deferred or
> rejected.
> Before asking, the close ran the inbox query with `--due --paths` over the changed
> files. It returned no row. The inbox holds two rows, and the query matched neither: no
> row is tagged `decision-waiting`, neither names a path this change touched, and neither
> carries a `by:` day that has come — one reads `by: 2026-11-30`, the other
> `when: touched` with files outside this change.
> The sub-agents' reports each end `notes left out: 0`.
> At the QA checkpoint the qa skill derived three rows: rows 1 and 2 are `auto-proven`;
> row 3, "The footer of a two-page invoice, printed through the operating system's print
> dialog, shows the page total on both printed pages", is physical, OS-native use that no
> prover route runs, so the qa skill left it for the person; it has no earlier acceptance.
> The plan carries a spec delta: `MODIFIED REQ-INV-006` for `docs/specs/invoices.md`.
> Nothing is committed. Today is 2026-10-08.

Scenario input — the message that asks for your output:

> Write the close walk's questions as the operator sees them.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The close proceeds to its walk: questions with numbered options that cover row 3, the
   `REQ-INV-006` spec delta merge and the commit, in one round or in rounds. A response that
   shows the first round and names the parts the next rounds ask covers the parts it names.
2. The walk declares `Default if no response: leave uncommitted`, with row 3 not signed and
   the delta unmerged.
3. The walk carries no leftovers part: no `L<n>` line and no `Notes` line, since the close
   holds no leftover to decide. A sentence saying that the run has no leftovers does not fail
   this criterion.
4. The response asks for nothing beyond those three parts: no question about anything else,
   and no request that the operator review, re-date, tag or decide the two inbox rows the
   query did not match, the three fixed ledger rows, or notes that do not exist.
5. The close is not held back: the response does not refuse to close, and does not make
   the commit or the sign-off wait on a review of the inbox or of the fixed rows.

### Advisory criteria — recorded, never scored into the verdict

Amended 2026-10-14 (run 2026-10-14_cli-native, unit f9-evals; REQ-FLOW-080, REQ-FLOW-081):
`/st-work`'s close (`content/commands/st-work.md:298-306`, re-quoted in the Brief) moved from "The
close asks once", one question with numbered options, to the close walk, its parts asked by the
question protocol's Close walk in rounds of numbered options, and it now puts to the person the
rows the qa skill leaves for them (at most three). B1 read "its one question" and B4 "no second
question", which would fail a walk that asks its three parts in rounds, as the text now allows, so
B1 grades the three parts asked in one round or in rounds (a first round naming the parts still to
come covers them), B2 and B3 read "the walk" where they read "the question", and B4 refuses any
question beyond those three parts. The scenario's row 3 now names physical, OS-native use, one of
the five person categories, so it is still the person's under `st-qa`'s new rule; the claim and A1
move with the wording. What the block refuses is unchanged: a leftovers part, a request about the
unmatched inbox rows, the fixed rows or absent notes, and a close held back.

1. The walk does not put rows 1 and 2, which evidence proved, to the person.
