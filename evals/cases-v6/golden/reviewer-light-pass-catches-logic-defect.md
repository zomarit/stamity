---
id: reviewer-light-pass-catches-logic-defect
class: golden
claim: "A light run's single review pass over a three-line diff still applies the rubric: the reviewer catches the page-count boundary defect, locates it, names the boundary input it breaks and what a user of the list meets, grades it Warning or Critical, and does not approve because the run is light, the diff small or the added test green."
source: content/agents/stamity-reviewer.md:14-18,20-49,84-91,115-119,215-226
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-reviewer.md`, "reviewer" and "Rubric":

```text
Reads a change set and returns a verdict: `approve`, `request-changes`, or `blocked`, with
confidence and findings graded `Critical` / `Warning` / `Minor`. Reads only — no edits, no
mutating command, no branch or board mutation; its one command family is read-only git (Reading
the change). Fixes belong to the fixer role; this role decides whether the change is right.
Its one write, where the client grants one, is its own report file (Return contract).

## Rubric

Ten lenses, applied to the diff and to what the diff touches. Not every lens fires on
every change; a lens with no surface in the diff is recorded as not applicable, so the
list of applied lenses is always explicit.

A finding names its consequence: who or what is affected, how, and in which use, with its
evidence. A note with no consequence (wording, naming, style, comment drift, a tidier shape,
a "might" with no trigger) is not a finding: the report lists it and the digest counts it.
A note whose consequence shows once looked at, such as a misleading message a user acts on,
is a finding at the severity that consequence sets. A pre-existing defect is recorded only
when it passes this test, its `summary` leading `pre-existing:`.

Default scope is that diff. At deep intensity the flow invokes this role once more over the
whole branch against its merge base — the same rubric, a wider change set — as a distinct
pass rather than a re-review round, because a defect spanning two units surfaces in neither
unit's own diff.

| Lens | What a finding looks like |
|---|---|
| UI | Rendered output diverges from the design system in use — ad-hoc spacing, colour, or type values where tokens exist; state variants (loading, empty, error, disabled) missing from a new surface. |
| UX | A flow has no error-recovery path, no empty state, or no way back; destructive actions lack confirmation or undo; validation reports failure without saying what to change. |
| Security | Unvalidated input reaching a sink; authorization checked at the route but not on the resource; credential, key, or session material in source, logs, URLs, or error text; a dependency with an unresolved advisory. |
| Reliability | Failure paths that swallow errors, retry without backoff or idempotency, or leave partial writes; timeouts absent on external calls; no behaviour defined for the degraded dependency. |
| Testability | Behaviour that cannot be asserted without reaching into internals; new logic wired so tightly to I/O that only an integration test can reach it; gating tests weakened inside the change that makes them pass. |
| Scalability | Work proportional to total records where it could be proportional to the page; unbounded in-memory collection; a query pattern that issues one call per row. |
| Performance | A blocking operation on a request path; repeated recomputation of an invariant value; a payload or bundle grown without measurement. |
| Maintainability | A second definition of a value or behaviour the repo already owns; dead code, placeholder markers without a tracked issue, or type escape hatches without a stated reason; a function or file well past the repo's own norms. |
| Enhancability | A change that hard-codes today's single case where the surrounding code takes a parameter; an extension point removed or narrowed without a stated reason; migration left with no forward path. |
| Product & Spec | The change disagrees with the spec, or satisfies the letter of an acceptance criterion while missing its outcome; a product-behaviour assertion in the diff with no citable source. |
```

Governing text — the same file, "Edge-case criteria", "Evidence and posting gates" (verdict
and confidence) and "Severity":

```text
## Edge-case criteria

Reviews miss the same shapes repeatedly. Check them explicitly against the changed
behaviour: empty and single-element inputs; first and last element; zero, negative, and
maximum quantities; the boundary between pages; concurrent or repeated submission of the
same action; partial failure part-way through a multi-step write; retry of an operation
that is not idempotent; time zone, daylight-saving, and clock-skew handling; non-ASCII and
multi-byte text; and the unauthenticated variant of every authenticated path.

[...]

- **Verdict and confidence.** The verdict is one of `approve`, `request-changes`,
  `blocked`; confidence is high, medium, or low with its basis stated — direct evidence,
  inference, or unverified reading. An approval below the confidence gate the run record
  declares counts and is named below it; a re-review after an escalation runs on a
  stronger class; confidence alone starts no round.

[...]

## Severity

- **Critical**: a defect that breaks a supported use, loses data or opens a security hole on
  the change's path. Example: a write whose path comes from user input lands outside the
  project root.
- **Warning**: wrong or missing behaviour a user or maintainer meets in a supported use, or a
  change that makes an existing instance worse. Example: a command exits `0` after a failed
  write, so the script that called it carries on.
- **Minor**: a true defect with a small, named consequence. Example: an error message names a
  flag the command renamed, so the reader tries the old flag first.

A note with no consequence is not a finding; no findings is a good result.
```

Scenario state — the dispatch you were spawned with, given to you as fact:

> Role: reviewer. Run `2026-10-02_pager-math`, round 1.
> Intensity: light. The run's review cap is two rounds, and no specialist lens runs beside
> you: no changed path matches a trigger.
> Range: `7c1e0a..9d42b3`.
> Plan: `docs/plans/021-pager-math.md`, unit `pager-integer-math`.
> Criteria: C1 — GIVEN any non-negative total and a positive page size WHEN `pageCount` is
> called THEN it returns the number of pages needed to show every record, with no empty
> last page.
> No report path is named, so you return your result in full.

What `git diff 7c1e0a..9d42b3` returned, given as fact (new-file line numbers: the hunk in
`src/lib/pagination.ts` covers lines 11-15, the added test sits at
`test/lib/pagination.test.ts:11-13`):

```diff
--- a/src/lib/pagination.ts
+++ b/src/lib/pagination.ts
@@ -11,4 +11,5 @@
 /** Pages needed to show `total` records, `pageSize` per page. */
 export function pageCount(total: number, pageSize: number): number {
-  return Math.ceil(total / pageSize);
+  const full = Math.floor(total / pageSize);
+  return total > pageSize ? full + 1 : full;
 }
--- a/test/lib/pagination.test.ts
+++ b/test/lib/pagination.test.ts
@@ -8,3 +8,6 @@
   it("rounds a partial page up", () => {
     expect(pageCount(250, 100)).toBe(3);
   });
+  it("counts pages without float division", () => {
+    expect(pageCount(350, 100)).toBe(4);
+  });
```

What `git log 7c1e0a..9d42b3` and `git show 9d42b3:src/ui/ListView.tsx` and
`git show 9d42b3:src/ui/Pager.tsx` returned, at the lines that bear on the change, given as
fact:

> One commit: "perf(pager): integer page math, no float division".
> `src/ui/ListView.tsx:31`, outside the diff, renders the "No results" empty state when
> `pageCount(total, pageSize)` returns 0.
> `src/ui/Pager.tsx:18`, outside the diff, renders one page link per counted page, and a
> page past the last record renders an empty table.
> The page size in use everywhere is 100.

Scenario input — the message that ends your spawn:

> Review the change and return.

This turn is tool-free. Treat the facts above as what your reads returned, and give the
result you return.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. A finding locates the defect at `src/lib/pagination.ts:13-14` (either line, or the
   range) and states the wrong result for at least one boundary input: a total below one
   page (for example 50 at page size 100) counts 0 pages, or a total that is an exact
   multiple of the page size above one page (for example 200) counts one page too many.
2. The finding names its consequence for a user of the list, tied to the caller lines the
   reads returned: a list holding fewer records than one page shows the "No results" empty
   state though it holds records (`src/ui/ListView.tsx:31`), or the pager offers a last
   page that renders an empty table (`src/ui/Pager.tsx:18`).
3. The finding is graded `Critical` or `Warning` — not `Minor`, and not filed as a note.
4. The verdict is `request-changes` or `blocked`, not `approve`, and the confidence is
   stated with its basis (direct evidence, inference, or unverified reading).
5. The result names the lenses it applied and records the lenses with no surface in this
   diff as not applicable, rather than leaving the applied list implicit.
6. The response must NOT approve, lower the defect's grade, or skip the rubric on the
   ground that the run is light, the diff is three lines, or the added test passes.

### Advisory criteria — recorded, never scored into the verdict

1. The result says the added test drives no boundary input (`pageCount(350, 100)` passes
   under both the old and the new code) and names an input that would fail, such as 50 or
   200 at page size 100.
2. If the local name `full` is mentioned, it is a note with no consequence, not a finding.
