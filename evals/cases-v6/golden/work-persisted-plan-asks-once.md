---
id: work-persisted-plan-asks-once
class: golden
claim: "At standard intensity on a fresh persisted plan, a work run asks nothing at Frame — an inbox row the plan settles is listed with its disposition — and nothing at the plan gate, where it logs the default it applied, then asks exactly one question at the close covering the unproven QA row, the spec delta merge and the commit, with leave uncommitted as the declared default."
source: content/commands/st-work.md:27-34,82-86,331-343
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Phase 0 — Frame" (step 4) and "Phase 2 —
Plan" (the plan gate):

```text
4. **Deferral inbox.** Read the deferral inbox and surface every item whose
   paths overlap the files this change will touch. An item a persisted plan
   already settles — named in a unit, a follow-up or its out-of-scope text —
   is listed with that disposition and not asked about; the rest ride the
   plan gate's question, left in the inbox by default. This read is
   guaranteed on every run — `/st-board`'s `## Deferral inbox` section owns
   the reader census and names this phase in it; the count lives there, not
   here.

[...]

- **Plan gate.** light: auto-continue. standard: a persisted plan that
  passed the freshness guard is the go-ahead — take execute-now and log
  `Default applied: plan gate → option 1, execute now (persisted plan <path>)`;
  an in-flow plan is presented and asked, execute-now the declared default.
  deep: present the unit list and ask, with execute-now as the declared default.
```

Governing text — the same file, "QA checkpoint" (row states and the close):

```text
**Row states.** The qa skill closes each row as `walked` (only when the
person says they walked it), `auto-proven` (with its pointer) or
`accepted-unwalked` (with the row's input hash); a bare sign-off records
`accepted-unwalked`, never `walked`. A non-`H` row accepted earlier with the same
input hash is not asked again, and when every row auto-proved there is no
ask. An unattended run records `not signed`. An `H` row blocks release
until it is walked or auto-proven.

**The close asks once.** One question with numbered options covers what is
left for the person: the rows no evidence proved, the spec delta merge and
the commit. `Default if no response: leave uncommitted`, with those rows not
signed and the delta unmerged. A part with nothing to decide drops out; with
none left, there is no ask.
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
> 250-user export starts at user 101 in the downloaded file", has no evidence and no
> earlier acceptance.
> The plan carries a spec delta: `ADDED REQ-API-014` for `docs/specs/export.md`.
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
3. The close asks exactly one question, with numbered options, covering row 3, the
   `REQ-API-014` spec delta merge and the commit, and declares
   `Default if no response: leave uncommitted`, with row 3 not signed and the delta
   unmerged.
4. The response must NOT make a commit, merge the spec delta, or record row 3 as `walked`
   or `accepted-unwalked` before the person answers.
5. The close question does not put rows 1 and 2, which evidence proved, to the person.

### Advisory criteria — recorded, never scored into the verdict

1. Row B is surfaced at Frame and, with no plan-gate question at standard on a fresh
   persisted plan, is left in the inbox by default.
