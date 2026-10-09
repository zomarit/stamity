---
id: work-pointer-dispatch-shape
class: golden
claim: "A build dispatch under a persisted plan is at most 15 lines naming the role, class and run id, the plan path and unit id with no line number, the worktree, branch and base, the report path under the main checkout's run folder written with the file write tool, the verify command, the files cell as the boundary, the learnings that apply and the digest as the return; it pastes none of the cell's text and names no ledger id."
source: content/commands/st-work.md:159-168,206-210
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Dispatch contract" (pointer dispatch):

```text
- **Pointer dispatch.** A build or fix dispatch is at most 15 lines: role,
  class and run id; the plan path and unit id, never a line number; worktree,
  branch and base; the report path, written with the file write tool; for a
  fix, the ledger ids with each sign-off; the unit's `verify` command; its
  `files` cell as the boundary; the learnings that apply; the digest as the
  return. When a contract delta moves a seam a later unit relies on, the
  spec-author amends that cell in place before it is dispatched, and when that
  unit touches a security trigger path or a shared contract the reviewer reads
  the amended cell first; an implementer whose cell no longer resolves at HEAD
  returns BLOCKED_DEPENDENCY.
```

Governing text — the same file, "Return contract" (report path):

```text
- **Report path:** `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md`,
  always under the main checkout's run folder. `<pass>` is the plan unit id,
  `branch` for a whole-branch pass or `plan` for planning research; a client
  refuses a sub-agent write whose name begins `report`, `summary`, `findings`
  or `analysis`, so such a unit id takes a `u-` prefix. `r<N>` is the round.
```

Scenario state — the run you are orchestrating, given to you as fact:

> You are the orchestrator of `/st-work` run `2026-09-30_export-cursor`, in Phase 3. The
> main checkout is `/work/shop`. The run record assigns the implementer the class
> `advanced`.
> The persisted plan is `docs/plans/014-export-cursor.md`. The unit to dispatch is
> `export-cursor`, round 1, and its cell sits at lines 88-104 of that plan. Its cells, as
> the plan carries them:
>   `files` — `src/api/export.ts`, `test/api/export.test.ts`
>   `interfaces` — 31 lines on the cursor encoding, the 400 path for an unparseable cursor
>   and the page offset
>   `testCriteria` — C1 (an unparseable cursor gets a 400 and no query runs) and C2 (page
>   two of a 250-user export starts at user 101)
>   `verify` — `npx vitest run test/api/export.test.ts`
> Isolation was declared before the first Phase 3 dispatch: the unit's worktree is
> `/work/shop-wt/export-cursor`, on branch `export-cursor`, based at `a1b2c3d`.
> The learnings that apply: `cursor-tokens-are-base64url` and
> `export-tests-need-a-seeded-db`.
> No ledger row is open against this unit: this is a build dispatch, not a fix.

Scenario input — the step you are at:

> Dispatch the implementer for `export-cursor`.

Give the dispatch text exactly as you would send it.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The dispatch text is at most 15 lines, blank lines not counted.
2. It names the role, `implementer`, the class `advanced` and the run id
   `2026-09-30_export-cursor`.
3. It names the plan by its path, `docs/plans/014-export-cursor.md`, and the unit by its id,
   `export-cursor`. The response must NOT locate the unit by a line number of the plan: no
   `:88-104`, no "lines 88-104", no line number in any form.
4. It names the worktree `/work/shop-wt/export-cursor`, the branch `export-cursor` and the
   base `a1b2c3d`.
5. It names the report path
   `.stamity/runs/2026-09-30_export-cursor/reports/export-cursor-implementer-r1.md` under the
   main checkout `/work/shop`, not under the worktree, and says the report is written with
   the file write tool.
6. It names the verify command `npx vitest run test/api/export.test.ts`, the `files` cell
   (`src/api/export.ts`, `test/api/export.test.ts`) as the boundary of what the unit
   writes, both learnings by id, and the digest as the return.
7. The response must NOT paste the unit's `interfaces` or `testCriteria` text, or a
   restatement of either, into the dispatch: the plan path and the unit id are the pointer
   to them.
8. The response must NOT name a ledger id or a sign-off: those ride a fix dispatch, and no
   row is open against this unit.

### Advisory criteria — recorded, never scored into the verdict

1. The dispatch carries its fields in the order the contract lists them: role, class and
   run id; plan path and unit id; worktree, branch and base; report path; verify; files;
   learnings; the return.
