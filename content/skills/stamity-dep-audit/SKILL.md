---
id: dep-audit
type: skill
description: "Produces a standalone dependency audit over the installed graph — advisories, licenses, and update-risk classes — and reports without editing a manifest, a lockfile, or a source file. Triggers when someone asks what the installed packages are exposed to, before a release or an upgrade sweep, or when a lockfile change needs its risk stated."
tags: [maintenance, devops]
load: on-demand
obsolete_when: dependency risk reporting is fully covered by native tooling
---

# Dependency audit

Report-only. It reads the dependency graph and reports risk; it edits no
manifest, no lockfile, and no source file. Acting on a finding — a version bump,
a replacement, a removal — routes to `/stamity-work`, which plans the change,
delegates it, and proves it against the gates. A dependency change is a code
change, and it earns the same treatment.

## Quick Start

1. Resolve the graph from the lockfile (Step 1).
2. Scan advisories (Step 2).
3. Flag licences (Step 3).
4. Classify update risk (Step 4).
5. Report; route action out (Step 5).

## Step 1 — Resolve the graph

The lockfile is the subject: it records what is installed, while the manifest
records what was asked for, and the two differ often enough that auditing the
manifest reports a graph nobody is running.

Record per package: resolved version, direct or transitive, and for a transitive
package the shortest path from a direct dependency. That path is what makes a
finding actionable — a transitive advisory is fixed at the direct package that
pulls it in.

No lockfile is a finding in itself: report the graph as unresolvable, name the
manifest ranges that make it ambiguous, and stop. An audit of unpinned ranges
describes a graph that may not exist on any machine.

## Step 2 — Advisories

Query the package manager's advisory command and any advisory source the repo
configures. Record per advisory: identifier, severity, affected range, fixed
version where one exists, direct or transitive, and the shortest path.

**Unreachable source.** When a source cannot be queried — offline, rate limited,
credentials absent — the report names that source, names what it did not cover,
and marks the run `partial`. A scan that could not run is not a clean scan, and
reporting one as clean is the failure this rule exists to prevent.

Severity is reported as the source gave it. Re-scoring it against this repo's
exposure is a judgment call that belongs with the operator, next to the report,
not folded silently into the number.

## Step 3 — Licences

List every distinct licence in the graph with a package count, then flag two
classes:

- packages declaring no licence at all;
- reciprocal-licence packages that reach a distributed artifact rather than
  staying in the development-only graph.

Licence CHANGE is not a third class here. Detecting one needs a previous run to
diff against, and this skill writes no artifact family, so there is nothing on
disk holding what the licences were last time. The report says so rather than
listing a class no run can populate: each run states the licences as they stand
now, and comparing two reports is the operator's move.

The skill flags; the operator decides. Licence acceptability is a policy
question about how this software is distributed, and a scan cannot answer it.

## Step 4 — Update risk

| Class | Signal | What to expect |
|---|---|---|
| patch | patch-level release only | behavior-preserving by convention; the risk is that the convention was not followed |
| minor | additive release | new surface, usually compatible; deprecation notices land here |
| major | breaking release | call-site changes; a per-package migration note is required before any bump |
| pinned-back | a pin holds the package below its latest release | record why, or record that no reason is recorded |
| unmaintained | no release within the repo's staleness window, or an archived source | replacement is a design question, not an upgrade |

Version numbers state intent, not fact. Where a class matters — a major bump on
a package with many call sites, or a patch release that a report suggests
changed behavior — the detail is a research question: hand a `researcher` brief
naming the package, the version span, and this repo's call sites, rather than
inferring the change from the number.

## Step 5 — Report and route out

Nothing is applied here. Items the operator wants acted on now go to
`/stamity-work` as a scoped change; items the operator defers land as
`.stamity/inbox.md` rows, one per item, each carrying the package, the current
and target versions, the risk class, and the advisory identifier where there is
one. An item that is neither routed nor deferred is dropped, and the report says
which items those were.

## Output artifact

The report is the deliverable — returned to the caller, not written to a new
artifact family. Sections, in order:

| Section | Content |
|---|---|
| Coverage | sources queried, sources unreachable, `complete` or `partial` |
| Advisories | identifier, severity, package, direct or transitive, shortest path, fixed version |
| Licences | licence, package count, and the two flag classes above |
| Risk | package, current and latest versions, class from the table above |
| Routing | per item: routed to `/stamity-work`, deferred to `.stamity/inbox.md`, or dropped |

Counts per class lead each section, so a graph with nothing to report is one
line rather than five empty tables.
