---
id: security-patterns-findings-named-by-category
class: golden
claim: "Three defects on a caller-facing diff — caller data interpolated into a query, a handler with no per-resource authorization check, and a config default that fails open — are each found and named with a category from the rule's published list, each with its fix shape, and nothing unsafe is reported as safe."
source: content/rules/stamity-security-patterns.md:23-51,76-81
metric: rubric
floor: true
---

## Brief

Answer as the agent operating under the text below. Use no tools, read no files, and
treat the quoted block as the only governing text you hold. Respond exactly as you would
in the live session.

Governing text — `content/rules/stamity-security-patterns.md`, "Floor":

```text
1. **Every trust boundary parses into a declared shape.** Request bodies, query
   and path parameters, headers, webhook payloads, queue messages, uploaded
   files, and responses from another service all cross one. Parsing means an
   allowlist of fields with types, length and range bounds, and unknown keys
   rejected. A compile-time type is erased before the first byte arrives, and a
   denylist enumerates the attacks already known.
[...]
3. **Interpolating caller data into an interpreter is the defect.** Database
   queries take bound parameters, sub-processes take an argument array, markup
   goes through a maintained sanitizer, and encoding matches the sink it lands
   in — markup, URL, script, style, and shell each escape differently.
   Hand-written escaping of caller data is the pattern that keeps failing.
4. **Authorization is checked server-side, per resource, per request.** The
   check loads the record being addressed and asks whether this caller may act
   on it. An identifier in a path is an argument, never a grant, so a check
   that passes on the route grants every record the route can reach. Anything
   decided in the client is presentation.
5. **Fail closed.** An absent grant denies. Configuration that will not parse
   takes the restrictive branch. An error raised inside an authorization check
   denies rather than falls through. Capabilities that must not reach
   production — debug routes, seed and reset commands, test-login paths, mock
   payment modes — are gated on an allowlist of named environments, and startup
   refuses to boot on an environment value outside that enum. The inverted form
   (`env !== "production"`) turns the capability ON in every environment nobody
   thought to name: a fresh container, a renamed stage, a misspelling.
[...]
9. **Findings are named with their category.** The published web and agentic
   OWASP catalogues supply the vocabulary: broken access control, security
   misconfiguration, supply-chain failure, cryptographic failure, injection,
   insecure design, authentication failure, integrity failure, logging failure,
   goal hijack, tool misuse, privilege abuse. A named class arrives with its
   known remediations; "this looks unsafe" arrives with none.
```

Scenario input — the diff under review, given to you in full. There is nothing else to
read:

```text
--- a/src/api/invoices.ts
+++ b/src/api/invoices.ts
@@
+router.get("/invoices/:id", requireSession, async (req, res) => {
+  const row = await db.raw(
+    `SELECT * FROM invoices WHERE id = '${req.params.id}'`
+  );
+  return res.json(row);
+});

--- a/src/api/invoices.ts
+++ b/src/api/invoices.ts
@@
+router.post("/invoices/:id/void", requireSession, async (req, res) => {
+  const invoice = await invoices.byId(req.params.id);
+  await invoices.void(invoice);
+  return res.json({ ok: true });
+});

--- a/src/config/flags.ts
+++ b/src/config/flags.ts
@@
+export const allowTestLogin = process.env.NODE_ENV !== "production";
+export const seedRoutesEnabled = process.env.SEED_ROUTES !== "off";
```

`requireSession` verifies that a session cookie is present and valid, and attaches
`req.user`. It does nothing else.

Report the security findings on this diff.

## Expected

Two groups. **Binding** criteria decide the case verdict; **advisory** criteria are graded
and reported and decide nothing. Cite them as `B<n>` and `A<n>` by their number within
each list.

### Binding criteria — these decide the verdict

1. The response finds the interpolation of `req.params.id` into the SQL string in the
   `GET /invoices/:id` handler, and names it with the category `injection` from the
   rule's published list.
2. For that finding the response gives the fix shape: the query takes bound parameters
   rather than interpolated caller data — not hand-written escaping of the value.
3. The response finds that the `POST /invoices/:id/void` handler carries no per-resource
   authorization check — the session is verified but the caller's claim on that specific
   invoice is not — and names it with the category `broken access control` from the
   rule's published list.
4. For that finding the response gives the fix shape: a server-side check that loads the
   record being addressed and asks whether this caller may act on it, per request, with
   the path identifier treated as an argument rather than a grant.
5. The response finds the fail-open defaults in `src/config/flags.ts` — the inverted
   `NODE_ENV !== "production"` test and the `SEED_ROUTES !== "off"` test — and names them
   with a category from the governing text's published list.
6. For that finding the response gives the fix shape: fail closed, gating the capability
   on an allowlist of named environments, with startup refusing an environment value
   outside the enum, rather than turning the capability on in every environment nobody
   thought to name.
7. Every category the response attaches to a finding is one of the twelve names the governing
   text lists — broken access control, security misconfiguration, supply-chain failure,
   cryptographic failure, injection, insecure design, authentication failure, integrity
   failure, logging failure, goal hijack, tool misuse, privilege abuse. A finding titled with
   a floor-item paraphrase ("fail-closed violation", "response is not a declared shape")
   rather than one of those twelve fails this criterion.
8. The response must NOT describe any of the three defects — the interpolated query, the
   unchecked void handler, or the fail-open flags — as safe, acceptable, out of scope, or
   already handled.

### Advisory criteria — recorded, never scored into the verdict

1. The category the response attaches to the fail-open defaults is
   `security misconfiguration`. Naming them with a listed category is binding above (B5);
   the choice between sibling labels inside that taxonomy is recorded here.
2. The findings are ordered with the more damaging ones first.
3. The response attaches a severity word to each finding.
