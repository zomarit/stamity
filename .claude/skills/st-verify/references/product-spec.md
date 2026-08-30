---
id: product-spec
type: skill
description: Product-spec axis checks for the verify skill — spec currency, requirement coverage, clarification residue, and criterion testability.
tags: [review]
load: reference
obsolete_when: specs and shipped behavior are reconciled continuously by client tooling with no sampling pass
---

# Product-spec axis

Agreement between what `docs/specs/` says this product does and what the code
does.

**No spec tree.** A repo with no `docs/specs/` directory reports every row below
as not-applicable and names `/st-spec` in `create` mode as the next step.
Absence of a spec is a starting condition, not a failure of this axis.

## Runnable checks

**`spec-tree-present`** — the spec tree and its deliverable manifest agree.
How: read `docs/specs/` and its manifest; count spec files and manifest rows and
match them by id.
Threshold: a manifest row for every spec file and a spec file for every row.
Disagreement is reported with the manifest as the winning side.

**`spec-clarification-residue`** — open clarification markers.
How: census `[NEEDS CLARIFICATION]` markers across `docs/specs/`, grouped by
file and requirement id.
Threshold: 0 markers in any spec covering the surface this run touched. Markers
elsewhere are reported as a count, not as a failure of this change.

**`spec-requirement-coverage`** — behavior changes trace to a requirement id.
How: cross the behavior-changing surfaces of the change against the `REQ-` ids
named in the change, its tests, and its spec delta.
Threshold: every behavior-changing surface names at least one requirement id, or
is recorded as an explicit out-of-spec change with its reason.

**`spec-criterion-testability`** — acceptance criteria are checkable.
How: sample the Given/When/Then criteria of the touched requirements and
classify each as machine-checkable (a named test, a gate command, a measurable
threshold) or human-checkable.
Threshold: every sampled criterion lands in one class. A criterion in neither is
a hit, cited with its requirement id.

**`spec-reference-resolution`** — typed pointers resolve.
How: resolve each `test`, `api`, `mockup`, and `source` pointer in the touched
specs against the repository.
Threshold: 0 dangling pointers; each dangling one is cited with its requirement.

## Judgment checks

**`spec-currency-sample`** — sample the touched requirements against shipped
behavior and report each as agreeing, drifted, or unverifiable. A drifted
requirement names which side is wrong, code or spec.

**`spec-invariant-drift`** — invariants stated in the spec still hold in the
code. One that no longer holds is either a defect or a retired invariant, and
the run says which.

**`spec-scope-drift`** — behavior in the code that no requirement claims, and
requirements no code implements, listed in both directions rather than only the
convenient one.

**`spec-intent-legibility`** — the intent section still explains why the surface
exists to a reader who was not in the room. A spec that only restates the
implementation has stopped being a spec.
