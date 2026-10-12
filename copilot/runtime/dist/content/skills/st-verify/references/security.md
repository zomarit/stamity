---
id: security
type: skill
description: Security axis checks for the verify skill — dependency advisories, credential literals in the diff, the route authorization census, and validation at trust boundaries.
tags: [review]
load: reference
obsolete_when: repo CI reports dependency advisories, credential literals, and per-route authorization posture in one machine-readable place
---

# Security axis

The perimeter a run can establish from the tree: what the repo depends on, what
the diff carries, which routes are reachable without a caller identity, and
where untrusted input crosses into an interpreter.

Rows cite OWASP category ids as shared vocabulary — `A01`–`A10` from
OWASP Top 10:2025 for the web surface, `ASI01`–`ASI10` for the agentic surface.
The edition is pinned because the numbering moves between editions, and a row
carrying a stale id routes the reader to the wrong remediation set. The id is
the label; the repo evidence is the finding. Checks name pattern *categories*,
never payload strings: a reference that carries live attack strings poisons
every context it is read into.

## Runnable checks

Each row: what it establishes · how to run it from detection facts · threshold.

- **`sec-dep-advisories`** (A03) — the dependency graph carries no known
  advisory. How: run the detected package manager's audit command against the
  committed lockfile. Threshold: 0 advisories at high or critical severity; an
  accepted one names its id, its reason, and an expiry date. No lockfile or no
  audit command detected is `skipped` with the probe recorded — an unrun scan is
  not a clean scan.
- **`sec-dep-pinning`** (A08) — production dependencies resolve deterministically.
  How: confirm one committed lockfile per manifest in the tree, and read the
  production ranges. Threshold: lockfile present per manifest; 0 unpinned
  third-party sources (branch, tag-floating, or archive references).
- **`sec-credential-literals`** (A07) — the change introduces no credential
  literal. How: run the repo's secret-scanning tool over the change range when
  one is detected; otherwise scan the diff by category — private-key blocks,
  long high-entropy values assigned to auth-shaped names, connection strings
  carrying inline auth. Threshold: 0 hits; a reviewed false positive is recorded
  in the secret-scan allowlist below, not silenced in the run.
- **`sec-authz-census`** (A01) — every route declares its authorization posture.
  How: enumerate routes from the router or route config; record the guard or
  middleware applied to each; the routes with none form the unauthenticated set.
  Threshold: the unauthenticated set is enumerated in the artifact and every
  member is intentional; a route with no declared posture is a `fail` row.
- **`sec-input-validation`** (A05) — input crossing a trust boundary is
  validated. How: for each handler in the route census, confirm a schema or
  validator applied to body, query, path, and header inputs before use.
  Threshold: 0 handlers reading external input with no validation step.
- **`sec-injection-sinks`** (A05) — data reaching an interpreter is
  parameterized or encoded. How: scan for string-built database queries, shell
  invocations assembled from request data, and raw-markup sinks in the detected
  framework. Threshold: 0 concatenated queries; 0 raw sinks without an encoder.
- **`sec-transport-headers`** (A02) — the served surface declares its policy.
  How: read the server or edge config for transport security, content-type
  options, frame ancestry, and content policy. Threshold: all four present; no
  server config detected is `skipped` with the probe.
- **`sec-ci-privilege`** (A08) — automation runs least-privilege. How: read the
  detected CI config for per-job token scope and third-party step references.
  Threshold: default token scope is read-only; 0 third-party steps referenced by
  a mutable pointer rather than an immutable digest.

## Judgment checks

- **`sec-trust-boundary`** — the change names each new external surface it opens
  and states what it assumes about callers on the other side.
- **`sec-authz-model`** — authorization decisions follow one model across the
  codebase; per-route improvisation is a finding even when each route is sound.
- **`sec-data-handling`** — the data this change touches is classified, and its
  retention and log exposure follow that classification.
- **`sec-dep-provenance`** — a newly added dependency has a named maintainer,
  recent releases, and a stated reason it beats the alternative already present.

## Secret-scan allowlist

Where an adjudicated `sec-credential-literals` false positive is recorded, so it
is decided once instead of re-argued on every run.

- **Path** — `.stamity/security/secret-scan-allowlist.md`. The directory holds
  security adjudication records only; it is repo state, committed, and readable
  by anyone reviewing a run.
- **Row** — one per adjudicated hit: `file:line`, the pattern category that
  matched, why it is not a credential, the reviewer, and the date. A row with an
  empty reason is not an allowlist entry, it is a silenced finding.
- **Writer** — the operator, from the run's report. This axis proposes rows and
  writes none: a check that can clear its own hits stops being a check.
- **Read** — the run reads the file before it scans, reports a matched hit as
  `not-applicable` citing the row that covers it, and leaves a hit with no row a
  `fail`. An absent file is not a finding; it means nothing has been adjudicated
  yet, and the run says so.
