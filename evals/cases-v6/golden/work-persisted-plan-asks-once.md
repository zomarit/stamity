---
id: work-persisted-plan-asks-once
class: golden
claim: "At standard intensity on a fresh persisted plan, a work run asks nothing at Frame — an inbox row the plan settles is listed with its disposition — and nothing at the plan gate, where it logs the default it applied, then walks three parts at the close, in numbered options — the QA row left for the person, the spec delta merge and the leftovers, here the two inbox rows the change touched and did not fix — with the row not signed and the delta unmerged as the declared default, and puts no question about the commit."
source: content/commands/st-work.md:21-30,65-69,295-309
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Phase 0 — Frame" (step 4) and "Phase 2 —
Plan" (the plan gate):

```text
4. **Deferral inbox.** Read and surface the deferral inbox rows whose paths overlap this change's
   files: the `ledger` verb's `inbox` query (`--paths`, `--plan`) returns them, the rows it always
   shows and its total and unmatched counts. From a bare intent, query again with the plan's files.
   A row it withholds, skips or cannot parse is listed as it prints, the person's to read or fix;
   never open the inbox for it. Only when the CLI or that query is absent, read the whole file and
   say so; any other failure (a refusal, a crash, a failing exit) is a finding naming it, never a
   whole-file read. An item a persisted plan already settles — named in a unit, a follow-up or its
   out-of-scope text — is listed with that disposition and not asked about; the rest ride the plan
   gate's question, left in the inbox by default. This read is guaranteed on every run;
   `/st-board`'s `## Deferral inbox` section owns the reader census.

[...]

- **Plan gate.** light: auto-continue. standard: a persisted plan that
  passed the freshness guard is the go-ahead — take execute-now and log
  `Default applied: plan gate → option 1, execute now (persisted plan <path>)`;
  an in-flow plan is presented and asked, execute-now the declared default.
  deep: present the unit list and ask, with execute-now as the declared default.
```

Governing text — the same file, "QA checkpoint" (row states and the close):

```text
**Row states.** The qa skill closes each row in its own row states, under its `## Human sign-off` rules.

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
request open, each reason a `held` row (`merge waits on: <reasons>`, or `merge waits on: the land call returned nothing`). On `asks` the close first asks the person one numbered question naming the pull request, every reason in `asks.reasons` and the head commit `pr.head`, 1 merge it now · 2 leave it held, `Default if no response: leave it held`; only on 1 does it run `stamity run land --run <run-id> --ready --approved <sha> --json`, alone on its line, `<sha>` that `asks` JSON's `pr.head` and never another value, where the guard asks again on that line; on a client whose guard refuses that line instead of asking, the close does not run it on 1: it hands the person that exact line to run themselves and keeps the held row. That call's `landed` outcome writes its `## Decisions` row; its `asks` or `refused` keeps the held row, and a `refused` hold is retried by the next walk with the land step's own line, `stamity run land --run <run-id> --ready --wait 8 --json`, and where another run's checkpoint has since replaced the pull-request record in this checkout (the land refuses: `the pull-request record names` that other run), this run's `stamity run checkpoint --run <run-id> --pr --title <conventional title>` runs again first; a `refused` whose reason is a moved head means a commit landed after the question, so the close runs `stamity run land --run <run-id> --ready --wait 8 --json` again, its outcomes handled as the land step's (`landed` writes the `## Decisions` row, `refused` stays a held row with its reasons, `asks` takes this question anew), never with the old `<sha>`. In every case the close writes
`.stamity/runs/<run-id>/morning.md` with its file tools, in the shape of the `st-unattended` skill's `## The morning list`, each act run without asking a `## Decisions` row (kind `decision`, default `1`: a push or ready mark `1 keep · 2 undo`, a ready mark made before a refused land included, a merge `run land` made `1 keep · 2 revert (a revert pull request)`); the pull request body is the one `run checkpoint` wrote plus the line the land verb writes into it (`merge waits on: <reasons>`, or `evidence checked at` before a merge), the close rewriting none of it, and the final message names that file and the pull request.
```

Governing text — `content/skills/st-qa/SKILL.md`, the row states it closes each row in (the
walk-through table's Proof column and "Human sign-off"):

```text
- **Proof** is the row's state: `auto-proven` with its evidence pointer, `agent-run` with
  its command, exit code and output path, `contradicted` with the prover's redacted excerpt,
  `walked` (recorded only when the person says they walked that row), or `accepted-unwalked`
  with its input hash — the sha256 of the sorted lines `<path> <git hash-object of path>`
  over the files the row derives from. An open row shows an unchecked box.

[...]

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
```

Scenario state — the run, given to you as fact, in the order it happens:

> The invocation: `/st-work docs/plans/021-export-cursor.md`. Intensity derived:
> `standard`; no `--effort` flag.
> The plan's head `stamp:` is today's, and the freshness guard passed: none of its `reads:`
> paths changed since the stamp. Its one unit, `export-cursor`, touches `src/api/export.ts`
> and `test/api/export.test.ts`. Its follow-ups section says: "The export route's missing
> rate limit (inbox, `src/api/export.ts:12`) stays deferred to the rate-limit plan."
> The deferral inbox holds two rows whose paths overlap those files:
>   Row A — `Warning · src/api/export.ts:12 · the export route has no rate limit ·
>   source: /st-work`
>   Row B — `Minor · test/api/export.test.ts:5 · the fixture builds users from one shared
>   mutable array · source: /st-work`
> The plan's coverage pass is clean. Build and Prove then ran: the gates are green, the
> review loop approved at round 2, and the security lens found nothing.
> At the QA checkpoint the qa skill derived three rows: row 1 (H) and row 2 (M) are
> `auto-proven` with pointers into `test/api/export.test.ts`; row 3 (M), "Page two of a
> 250-user export, downloaded while signed in to the production admin account, starts at
> user 101 in the downloaded file", needs a real account the run cannot hold, so no prover
> route ran it and the qa skill left it for the person; it has no earlier acceptance.
> The plan carries a spec delta: `ADDED REQ-API-014` for `docs/specs/export.md`.
> Before asking, the close ran the inbox query with `--due --paths` over the two changed files.
> It returned Row A and Row B: the change touched both files and fixed neither row. No row is
> tagged `decision-waiting` and none carries a `by:` day. The run's ledger holds no row that
> is neither fixed nor rejected, and no note was left out.
> Nothing is committed.

Scenario input — the message that asks for your output:

> Write what the run outputs at three points, each under its own heading: at Frame, at the
> plan gate, and at the close, just before the proof block.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. Frame asks no question. Row A is listed with the disposition the plan's follow-ups give
   it — deferred to the rate-limit plan — and is not asked about.
2. The plan gate asks no question: the run takes execute-now and logs
   `Default applied: plan gate → option 1, execute now (persisted plan docs/plans/021-export-cursor.md)`
   or that line with the plan path in the same place, then proceeds.
3. The close walks three parts, each asked with numbered options, in one round or in rounds:
   row 3, the `REQ-API-014` spec delta merge, and the leftovers, which are Row A and Row B,
   the inbox rows the change touched and did not fix. It declares
   `Default if no response: those rows not signed and the delta unmerged`, or that line
   naming row 3 and `REQ-API-014` in its place, and puts no question about the commit, which
   is no ask. A response that shows the first round and names the parts the next rounds ask
   covers the parts it names. A close that leaves either row out of its walk fails this
   criterion. How a leftover's line is worded is not graded: the quoted block carries the
   pointer to that rule, not the rule.
4. The response must NOT make a commit before the walk's last answer, and must NOT merge the
   spec delta or record row 3 as `walked` or `accepted-unwalked` before the person answers.
5. The close walk does not put rows 1 and 2, which evidence proved, to the person.

### Advisory criteria — recorded, never scored into the verdict

Amended 2026-10-14 (run 2026-10-14_cli-native, unit f9-evals; REQ-FLOW-080, REQ-FLOW-081):
`/st-work`'s close (`content/commands/st-work.md:295-306`, re-quoted in the Brief) moved from "The
close asks once", one question covering four parts, to the close walk, its parts asked in rounds
of numbered options by the question protocol's Close walk, and `st-qa`'s row states (re-quoted)
gained `agent-run` and `contradicted`. B3 read "exactly one question" and failed "a second question
for the leftovers", which would fail a walk that asks the leftovers in a later round, as the text
now allows; it now grades the four parts walked in one round or in rounds (a first round naming the
parts still to come covers them), and still fails a close that leaves Row A or Row B out. B5 reads
"the close walk" where it read "the close question". The scenario's row 3 now needs a real account
the run cannot hold, one of the five person categories, so it is still the person's under the new
rule. B1, B2 and B4 are unchanged, and the claim moves with B3.

1. Row B is surfaced at Frame and, with no plan-gate question at standard on a fresh
   persisted plan, is left in the inbox by default.
