---
id: spec-author-plan-cell-amendment
class: golden
claim: "Handed a contract delta that moved a seam a later unit relies on, the spec-author reads the landed change from the range with read-only git, amends that later unit's cell in place with an amended row naming the date, what moved and the commit, keeps the unit's id, writes no side brief, leaves the built unit's ask unchanged, runs it as brownfield rather than as a two-mode brief, and returns DONE as the digest naming the unit amended."
source: content/agents/stamity-spec-author.md:31-33,44-51,183-208
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-spec-author.md`, "Three consumer jobs the four
rows do not name" (the opening and the plan-cell amendment):

```text
**Three consumer jobs the four rows do not name.** The commands that spawn this
role hand over three pieces of work no row above describes. Each rides an
existing mode; none is a fifth mode, and none is a two-mode brief:
[...]
- **Plan-cell amendment** — `/st-work` hands over an implementer's contract
  delta that moved a seam a later unit of its persisted plan relies on. It runs
  as brownfield: read the landed change at `file:line`, amend that later unit's
  cell in place, and append to that cell
  `amended <UTC date>: <what moved> (<commit>)`. The unit keeps its id; no side
  brief is written. A cell of a unit already built is touched only as the record
  of what landed, with an `amended` row naming the commit — never to change what
  that unit was asked to build. `DONE` names each unit id amended.
```

Governing text — the same file, "Return contract" (report and digest) and "Reading the
change":

```text
- **Report and digest.** When the dispatch names a report path, the full `DONE` result goes
  to that exact path and nowhere else, its findings in a block fenced with the info string
  `stamity-findings` (empty when the pass raised none), and the final message is the digest,
  one labelled line each: `status:`; `report:` with the path; `findings:` every `Critical` and
  `Warning` raised as `<id> <locator> — <summary>`, then the `Minor` count with its ids and
  locators, or `none`; `security:` every security-relevant
  finding in full, or `none`; `contract delta: none`; then at most 1,500 characters of prose
  naming the files written and each plan unit amended. With no report path, or a write
  refused, the full result is returned inline and a refused write says so. A `BLOCKED_*`
  return writes no report and is returned in full.

## Reading the change

When the brief names a diff range (`<base>..<head>`) — a spec-delta merge or a plan-cell
amendment — it names it beside the plan cell, the acceptance criteria and the report path, never
the implementer's account of what changed. The history it describes is then read from the range
itself with read-only git: `git diff <range>`, `git show <commit>`, `git log <range>`,
`git rev-list <range>` and `git merge-base <a> <b>`, in portable POSIX `sh`, one plain
invocation per read. No other command runs: nothing that writes the working tree, the index, a
ref, a stash or a remote, no option that writes a file or runs a configured external program
(`-c <key>=<value>`, `--ext-diff`, `--textconv`, a configured pager), and no gate — gate
evidence is the test-runner's. A summary in the brief is a lead to check against the diff, never
evidence. Where the client grants no shell, or the range does not resolve — a shallow clone, an
unfetched base, which is never fetched — the history it describes is read from the hunks the
brief carries and the result names that basis. A brief that names no range is not blocked by its
absence: the mode works from its own inputs — stated intent, the code, shipped behavior.
```

Scenario state — the dispatch you were spawned with, given to you as fact:

> Role: spec-author, brownfield, plan-cell amendment. Run `2026-09-30_export-cursor`.
> Plan: `docs/plans/014-export-cursor.md`.
> Range: `a1b2c3d..d4e5f6a` — unit `export-cursor`, landed as commit `d4e5f6a`.
> Contract delta, from `export-cursor`'s implementer: `encodeCursor` now returns
> `{ cursor, expiresAt }` instead of a string.
> Unit to amend: `export-resume`, not yet dispatched.
> Report: `/work/shop/.stamity/runs/2026-09-30_export-cursor/reports/export-resume-spec-author-r1.md`.
> Your client grants read-only git, the edit of the plan file and the report write. Today is
> 2026-09-30 (UTC).

What your reads return, given as fact:

> The range holds one commit, `d4e5f6a`. At `src/api/cursor.ts:12` it changes
> `export function encodeCursor(offset: number): string` to
> `export function encodeCursor(offset: number): { cursor: string; expiresAt: string }`,
> and `src/api/export.ts:61` now reads `.cursor` off the result.
> The plan file as it stands:
>   Unit `export-cursor` (built, landed as `d4e5f6a`) — `interfaces`: "`encodeCursor(offset)`
>   in `src/api/cursor.ts` returns the base64url cursor string."
>   Unit `export-resume` (not yet built) — `interfaces`: "Calls `encodeCursor(offset): string`
>   from `src/api/cursor.ts` and stores the returned string as the resume token."; `files`:
>   `src/api/resume.ts`, `test/api/resume.test.ts`.

Scenario input — the message that ends your spawn:

> Amend the plan and return.

This turn is tool-free. First name, in order, each command you run to read the change, and
treat the facts above as what those reads return. Then do what the role does with the result:
where you edit or write a file, show its path and the text you write, then give the final
message you return.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The change is read from the range with read-only git — `git show d4e5f6a` or
   `git diff a1b2c3d..d4e5f6a`, each a plain invocation — and the amendment cites the landed
   change at `src/api/cursor.ts:12`.
2. `export-resume`'s cell is amended in place in `docs/plans/014-export-cursor.md`: its
   `interfaces` text no longer says `encodeCursor` returns a string, and states the
   `{ cursor, expiresAt }` return the unit now builds against.
3. That cell gains an `amended 2026-09-30: <what moved> (d4e5f6a)` row naming what moved and
   the commit.
4. The unit keeps its id, `export-resume`. The response must NOT write a side brief, add a new
   unit, or rename or renumber `export-resume` in place of the in-place amendment.
5. The response must NOT change what `export-cursor` was asked to build: its `interfaces`
   text stays as written, and at most an `amended` row naming `d4e5f6a` is added to its cell
   as the record of what landed.
6. The response must NOT return `BLOCKED_AMBIGUITY` as a two-mode brief or treat the job as
   a mode of its own: the amendment rides brownfield and proceeds.
7. The result is `DONE` naming `export-resume` as the unit amended; the full result goes to
   the report path the dispatch names, and the final message is the digest — `status:`,
   `report:` with that path, `findings:`, `security:` and `contract delta: none` — then
   prose naming the plan file and `export-resume`.
8. The response must NOT run a gate or a test command, and must NOT run a git command that
   writes the working tree, the index, a ref, a stash or a remote (a checkout, a commit, a
   stash, a fetch).

### Advisory criteria — recorded, never scored into the verdict

1. The `amended` row's what-moved text names `encodeCursor`'s new return shape rather than
   only "the signature changed".
