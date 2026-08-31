---
id: surface-pins-are-literals-that-drift
title: surface pins are literals that drift
date: 2026-08-31
confidence: high
summary: adding a verb/guide/criterion moves several hand-maintained pins that are literals, not derivations — a verb touches seven, incl. two separate docsPages verb arrays — each drifts silently green
integrity: sha256:a3cdef09d8e6a7331afa8a098a9459bf8244f09af433176d917994cc3c01d0ad
---

Adding a CLI verb, a docs guide, or a spec acceptance criterion in this repository
touches several hand-maintained "surface pins" that are literals, not derivations, and
each drifts silently because nothing computes it from the source of truth. A verb is the
worst case: registering one in `src/cli.ts` leaves at least seven pins to move in the same
change — the two count comments in `src/cli.ts`, the `PLAN_MAP` row in
`test/architecture/boundaries.test.ts`, the `ADVERTISED` array plus two count literals in
`test/cli/surface.e2e.test.ts`, the byte-compared `docs/cli-reference.md`, and TWO separate
hand-maintained verb arrays in `test/docsPages.test.ts` (one for `getting-started`, one for
`README`) plus the prose those arrays assert against.

## Why

Verified across run 2026-08-31 (the D14 workspace verb and D15 worktree verb, and every
Batch D spec). The `test/docsPages.test.ts` verb arrays assert only that each named verb
*appears somewhere in the page's prose* — a containment check, not a list check — so a verb
absent from the array is invisible to the suite, and a verb absent from the `·` list a
reader scans but present elsewhere in the prose still passes. The D14 lane shipped a green
tree that still advertised "seven verbs" on README because its second hand-maintained array
was not in the four pins the spec's REQ enumerated; a later unit found and closed it. Every
Batch D spec's own criteria-count header was stale against its criteria list (43 over 62,
47 over 66, etc.) because the count is typed, not derived. Review horizon: retire pieces of
this as pins become derivations — if the getting-started/README verb arrays are ever built
from `COMMANDS`, or a spec's count from `grep -c "^- GIVEN"`, that pin drops off the list.

## How to apply

When adding a verb, page, or criterion, enumerate the surface pins first and move them in
one change — for a verb, the seven above; for a guide, the `GUIDES`/`MAPPED_GUIDES` arrays,
the sidebar `present([...])`, the `llmsIndex` entry plus its regenerated `llms.txt`, and the
README map row; for a criterion, the spec's count header. Red-check that each pin is
load-bearing (remove the addition, watch a test fail) rather than trusting it fired. State a
count next to its derivation command (`grep -c "^- GIVEN"` for spec criteria) so the next
reader can recompute rather than trust a literal. Treat a "the array is a literal, not a
derivation" note as a signal that the pin can silently disagree with the surface it guards.
