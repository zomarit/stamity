---
description: "Before parallel work on a brownfield codebase: enumerate shared contracts per unit — file-disjoint is not contract-disjoint; facade-hold on collisions."
paths: ["src/**", "lib/**", "app/**", "apps/**", "packages/**", "services/**", "internal/**", "pkg/**"]
---

# Contract Census

Two units whose diffs share no file still collide when both touch the same
shared contract. File-disjoint is not contract-disjoint: an exported signature,
a persisted field name, a wire key, an event payload, a shared constant, and a
configuration key each bind code that lives elsewhere by construction, and
splitting the file set protects none of them. The census makes that overlap
visible before dispatch instead of at merge.

## Floor

1. **Census before parallel dispatch.** Each unit in the batch emits one row per
   shared contract it touches, before any of them starts:

| Column | Content |
|---|---|
| Contract | The identifier as spelled at the seam |
| Class | symbol · persisted-name · wire-field · event · constant · config-key |
| Producer | The module that owns the shape |
| Consumers | Every reader found by a repo-wide search for the old and new spelling |
| Change kind | add · rename · drop · re-signature · revalue |

2. **The consumer search spans the repository, not the unit.** A consumer
   outside the unit's file list is the normal case. String-typed contracts are
   searched in their quoted forms, constants by name *and* by literal value,
   configuration keys across non-code files — pipeline definitions, deployment
   manifests, environment files — and wire fields on both sides of the network
   plus the fixtures and recorded payloads that still assert the old key.
3. **Facade-hold when two units need one contract.** Exactly one unit owns the
   change: the one whose acceptance criteria require it. That unit lands the
   producer change and every consumer reconciliation in a single diff. The peer
   unit codes against the held facade — the contract keeps the key set it had,
   a dropped field is emitted as an explicit null rather than removed, and
   readers move to guarded reads. The key is removed in a later change, once
   the census shows zero unguarded readers; an absent key is a shape change a
   reader misreads without error, while an explicit null fails at the value.
4. **Mid-flight discovery re-censuses.** A contract surfaced during the build is
   re-censused across the units still running, and the collision takes the
   facade-hold. A unit already dispatched against the superseded census stops
   at its own boundary rather than mutating a contract another unit now owns.
5. **Every row closes.** A unit reports `clean` (no consumer outside its diff),
   `reconciled(N)` (N consumers updated, guarded, or named with a reason), or
   `N unreconciled` naming each one. Three reasons leave a consumer untouched:
   another unit owns it, it is dead code with a linked removal, or it is
   reached dynamically and now carries a runtime guard.

## Gates

- Parallel dispatch over a brownfield batch with no census is a protocol
  failure, reported as such. Serialising the batch is the fallback; guessing
  that the file lists imply independence is not.
- A consumer left reading the old shape once the owning unit closes is a
  Critical finding. Silent-wrong outranks loud-broken: a removed import fails
  the build, a stale constant computes a wrong value with no signal at all.
- "Was the field removed, or nulled behind the facade?" is answered before the
  unit reports done. "Removed" inside the hold window returns to the hold.
- A `clean` census with no search over the old spelling is unevidenced. The
  captured search output is the evidence; recollection is not.
- Two units that both require mutating one contract are re-levelled sequential.
  The later unit consumes the shape the owner landed.
