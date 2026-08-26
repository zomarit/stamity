---
description: "Floor for evolving a published interface: RFC 9457 problem details on every error, additive-first change inside a version, an announce-sunset-remove retirement lifecycle, and Idempotency-Key on unsafe retriable operations."
paths: ["**/api/**", "**/routes/**", "**/*openapi*", "**/*.proto", "**/graphql/**"]
---

# API Versioning

Attaches on a published interface — one with a consumer that deploys on its own
schedule. The cost of a change is paid by that consumer, and that consumer is
not in the review. Everything below makes a change visible before it breaks
someone, and recoverable after it ships.

## Floor

1. **Errors are problem details (RFC 9457).** One error shape across the whole
   surface: `application/problem+json` carrying `type`, `title`, `status`,
   `detail`, and `instance`, plus named extension members for anything a
   consumer branches on — field-level violations as a list, a retry hint, a
   correlation identifier. `type` is a stable identifier matched as an opaque
   key; the sentence in `title` is for humans and may be rewritten at any time.
   A second, ad-hoc error shape means every consumer carries two parsers and
   picks the wrong one on the path nobody exercised.
2. **Additive-first inside a version.** New endpoints, new optional fields, and
   new enum values where consumers carry a declared unknown-value branch. A
   removal, a rename, a type narrowing, a newly required request field, and a
   response field that turns nullable are each breaking: they ship as a new
   version with a retirement window on the old one, not as a patch to the
   current one.
3. **One versioning scheme per surface, written down.** A major version in the
   path, or a date pinned by a request header — not both on one surface.
   Consumers pin explicitly, and an unpinned request resolves to the oldest
   supported version rather than the newest, because silently promoting an
   unpinned consumer is how a change that broke nothing in review breaks
   production.
4. **Retirement runs announce, sunset, remove.** *Announce*: every response
   from the deprecated element carries the `Deprecation` header (RFC 9745) and
   a link relation pointing at the migration note. *Sunset*: once the removal
   date is fixed, the `Sunset` header (RFC 8594) carries it and the
   announcement keeps running beside it. *Remove*: only after that date passes
   and recorded usage has held under the stated threshold across two
   consecutive measurement windows. Window length is set per audience in the
   spec — longer for consumers outside the organisation than for first-party
   callers — and it is set when the deprecation opens, not on removal day.
5. **Retirement is measured, not announced and forgotten.** Usage of every
   deprecated element is recorded per consumer identity from the announce date,
   so the removal decision reads a number and the migration note reaches the
   callers that still need it. An unmeasured deprecation ends as an outage or
   as an element nobody dares remove.
6. **Unsafe operations take `Idempotency-Key`.** Every state-changing request
   accepts a client-generated key. The server stores that key against a
   fingerprint of the request and the response it produced, scoped per caller
   rather than globally. An exact repeat replays the stored response and says
   so; a repeat whose fingerprint differs is refused as a conflict, because it
   is a different request wearing the same key; a repeat that arrives while the
   first is in flight gets a retry-after answer rather than a second effect.
   Retention is stated in the spec and covers the consumer's retry budget. The
   key comes from the client — a server-minted key deduplicates nothing.
7. **Breaking changes are caught by a diff, not by memory.** The contract is a
   committed artifact. A pipeline step diffs the branch's contract against the
   last released one and fails on a breaking classification, so the review
   argument happens over a named rule instead of over recollection of what
   shipped.

## Gates

- Every error path on the surface returns problem details with a stable `type`.
  A bare string body or a bespoke error object is a finding.
- No element is removed without a recorded announce date, a `Sunset` value in
  the past, and two consecutive windows of usage under the stated threshold.
- Every state-changing operation accepts `Idempotency-Key`, with a test that
  sends one key twice and asserts a single effect and an identical response.
- The contract diff gate runs on every change touching the contract and blocks
  a breaking classification; a deliberate break ships as a new version in the
  same change.
- A response field is not removed or retyped in place. The new shape lands
  beside the old one, and the old one leaves through the item 4 lifecycle.
