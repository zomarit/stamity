---
id: reviewer-shallow-wrapper-pass-through
class: golden
claim: "The reviewer's maintainability lens files a new cache wrapper that forwards all five of its store's methods unchanged as a pass-through — a layer whose interface is as wide as what it hides — with the consequence a maintainer meets, graded Minor or Warning, and files no size finding on a 900-line file whose one export keeps its interface narrow."
source: content/agents/stamity-reviewer.md:20-49,217-228
metric: rubric
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted blocks as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/agents/stamity-reviewer.md`, "Rubric":

```text
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
| Maintainability | A second definition of a value or behaviour the repo already owns; dead code, placeholder markers without a tracked issue, or type escape hatches without a stated reason; a new layer whose interface is nearly as wide as what it hides (a pass-through), a finding even where the plan asks for the layer: its consequence is the interface kept twice; a function or file well past the repo's own norms whose interface is wide too. |
| Enhancability | A change that hard-codes today's single case where the surrounding code takes a parameter; an extension point removed or narrowed without a stated reason; migration left with no forward path. |
| Product & Spec | The change disagrees with the spec, or satisfies the letter of an acceptance criterion while missing its outcome; a product-behaviour assertion in the diff with no citable source. |
```

Governing text — the same file, "Severity":

```text
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

> Role: reviewer. Run `2026-10-14_user-cache`, round 1.
> Intensity: standard. No specialist lens runs beside you: no changed path matches a trigger.
> Range: `3b7e21..a90c4f`.
> Plan: `docs/plans/024-user-cache.md`, unit `user-store-cache`. Its criterion: C1 — GIVEN the
> API's user routes WHEN they read or write a user THEN they go through `CachedUserStore`.
> The plan schedules no cache: "add one only if a measured read pattern calls for it".
> No report path is named, so you return your result in full.

What `git diff 3b7e21..a90c4f` returned, given as fact (new-file line numbers: the new file
`src/users/CachedUserStore.ts` is lines 1-24, the hunk in `src/api/users.ts` covers lines
3-6, and the hunk in `src/report/legacyFormatter.ts` covers lines 612-615):

```diff
--- /dev/null
+++ b/src/users/CachedUserStore.ts
@@ -0,0 +1,24 @@
+import type { User, UserId, UserPatch, UserStore } from "./UserStore";
+
+/** The store the API's user routes read and write through. */
+export class CachedUserStore {
+  constructor(private readonly inner: UserStore) {}
+
+  get(id: UserId): Promise<User | undefined> {
+    return this.inner.get(id);
+  }
+  list(): Promise<User[]> {
+    return this.inner.list();
+  }
+  create(user: User): Promise<User> {
+    return this.inner.create(user);
+  }
+  update(id: UserId, patch: UserPatch): Promise<User> {
+    return this.inner.update(id, patch);
+  }
+  remove(id: UserId): Promise<void> {
+    return this.inner.remove(id);
+  }
+}
+
+export default CachedUserStore;
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -3,2 +3,4 @@
-import { userStore } from "../users/UserStore";
+import { userStore as store } from "../users/UserStore";
+import { CachedUserStore } from "../users/CachedUserStore";
+const userStore = new CachedUserStore(store);
 
--- a/src/report/legacyFormatter.ts
+++ b/src/report/legacyFormatter.ts
@@ -612,3 +612,4 @@
   const totals = sumColumns(rows);
-  return renderTable(rows, totals);
+  const footer = options.footer ?? "";
+  return renderTable(rows, totals) + footer;
 }
```

What `git show a90c4f` returned for the files around the change, at the lines that bear on
it, given as fact:

> `src/users/UserStore.ts` exports the `UserStore` interface with exactly those five methods,
> `get`, `list`, `create`, `update` and `remove`, and the `userStore` instance; its other
> callers, `src/jobs/syncUsers.ts` and `src/admin/users.ts`, still import `userStore` directly.
> `src/report/legacyFormatter.ts` is 902 lines long and exports one function,
> `formatReport(report, options)`; everything else in it is internal. Across `src/`, the
> median file is 180 lines long and exports 4 names.
> The suite passes on `a90c4f`, and no test was added for `CachedUserStore`.

Scenario input — the message that ends your spawn:

> Review the change and return.

This turn is tool-free. Treat the facts above as what your reads returned, and give the
result you return.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. A finding under the Maintainability lens locates `CachedUserStore` at
   `src/users/CachedUserStore.ts` (the class, a line or a range in lines 1-24) and names it a
   pass-through: a new layer whose interface is as wide as what it hides, each of its five
   methods forwarding to `UserStore`'s method of the same name and adding nothing.
2. The finding names a consequence a maintainer meets. Either one is enough: a change to
   `UserStore`'s interface now has to be made in the wrapper too, or the API's routes lose it;
   or the routes go through a layer that hides nothing while the store's other callers bypass
   it. A finding that names the pass-through with no consequence fails this criterion.
3. The finding is graded `Minor` or `Warning`, not `Critical`, and not filed as a note with
   no consequence.
4. The response must NOT file a size finding on `src/report/legacyFormatter.ts`: the file is
   well past the repo's norms, but its interface is one export, and the governing text counts
   a file well past the norms only when its interface is wide too.
5. The response must NOT report a behavioural defect in `CachedUserStore`: each forwarded
   method returns what the store's method returns, so no user meets a wrong result from it.
6. The result names the lenses it applied and records the lenses with no surface in this
   diff as not applicable, rather than leaving the applied list implicit.

### Advisory criteria — recorded, never scored into the verdict

Disposition 2026-10-21: A1 deleted (sha256:5baa8cadd554) — the Rubric's capture paragraph
(`content/agents/stamity-reviewer.md`, quoted in the Brief) asks a finding to name its
consequence, who or what is affected, how, and in which use, with its evidence, and asks for no
remedy; B2 binds that consequence. The row graded a remedy the source never asks a finding to
carry. The surviving row is renumbered A1 (was A2); it is unchanged in substance.

1. If the response mentions `src/report/legacyFormatter.ts`, it says why its size is not a
   finding: one export, a narrow interface.
