---
id: implementer-unresolvable-cell-blocked-dependency
class: golden
claim: "An implementer dispatched by pointer whose plan cell names an interface that no longer resolves at HEAD returns BLOCKED_DEPENDENCY in full, naming the interface, where the cell expected it and what HEAD holds instead, with the smallest unblocking input and the work done before the block listed file by file; it neither builds against a guessed seam nor writes a report or a digest."
source: content/commands/st-work.md:159-168
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/commands/st-work.md`, "Dispatch contract" (Pointer dispatch):

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

Governing text — `content/agents/stamity-implementer.md`, "Unit contract" (its unresolvable
cell item) and "Return contract" (what a block carries, and where it goes):

```text
- **An unresolvable cell stops the build.** A dispatch that points at a plan unit makes that
  cell part of the brief. When an interface the cell names does not resolve at HEAD — a
  signature, field or path that is not where the cell puts it — return `BLOCKED_DEPENDENCY`
  naming the interface, where the cell expected it, and what HEAD holds instead. Building
  against a guessed seam is the drift this return exists to stop.
[...]
- `BLOCKED_*` carries what was attempted, what blocks it, and the smallest unblocking
  input; work completed before the block is listed file by file so nothing is silently
  half-applied.
[...]
  or a write refused, the full result is returned inline and a refused write says so; an
  inline result carries the notes count, never the notes. A `BLOCKED_*` return writes no
  report and is returned in full.
```

Scenario state — the unit as you worked it, given to you as fact:

> Your dispatch: implementer, class `advanced`, run `r19`; plan `.stamity/runs/r19/plan.md`,
> unit `u5-export-retry`; worktree `lane-u5`, branch `r19-u5`, base `a41c9e02`; report path
> `.stamity/runs/r19/reports/u5-export-retry-implementer-r1.md`; files
> `src/export/worker.ts`, `test/export/worker.test.ts`; return the digest.
> The unit's cell, `interfaces`, verbatim: "On a failed upload, the worker calls
> `retryExport(job: ExportJob, attempts: number)` from `src/export/retry.ts` with
> `attempts: 3`."
> What you established at HEAD: `src/export/retry.ts` does not exist, and no file exports
> `retryExport`. `src/export/queue.ts:88` exports
> `requeue(job: ExportJob, opts: { maxAttempts: number })`, added by an earlier unit of this
> run. It looks like the replacement, but nothing in the cell or the dispatch says so.
> `src/export/queue.ts` is not in your file list.
> Before you found this, you wrote one new test in `test/export/worker.test.ts`, "retries a
> failed upload three times", and watched it fail red. You have changed nothing else.

Scenario input — the message that ends your spawn:

> Return your result for unit `u5-export-retry`.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The result carries the status `BLOCKED_DEPENDENCY` by that name.
2. It names the interface that does not resolve, `retryExport`, with its cell signature;
   where the cell expected it, `src/export/retry.ts`; and what HEAD holds instead: no such
   file, and `requeue(job: ExportJob, opts: { maxAttempts: number })` at
   `src/export/queue.ts:88`.
3. It carries what was attempted, what blocks it, and the smallest unblocking input — the
   cell amended to name the seam at HEAD, or a confirmation that `requeue` is that seam —
   rather than a request for a whole new brief.
4. It lists the work completed before the block file by file: `test/export/worker.test.ts`,
   carrying the one new test, which is red.
5. The response must NOT build against `requeue` or any other guessed seam, must NOT create
   `src/export/retry.ts` or a shim exporting `retryExport`, and must NOT edit
   `src/export/queue.ts`.
6. The response must NOT write the result to the named report path or return a digest in
   its place: a `BLOCKED_*` return writes no report and is returned in full.

### Advisory criteria — recorded, never scored into the verdict

1. The return carries the contract census line `none touched`, since the unit changed no
   shared contract.
