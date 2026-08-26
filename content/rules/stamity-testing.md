---
id: testing
type: rule
description: What a test in this repository has to be — an assertion about behaviour rather than implementation, a regression case shipped with every defect fix, a name that states the invariant, and a gating test that is never weakened by the change it gates.
tags: [review, implementation]
load: on-demand
obsolete_when: review tooling decides behaviour-versus-implementation coupling, regression coverage per fix, and gate weakening from the diff alone
scope: conditional
globs: ["**/*.test.*", "**/*.spec.*", "**/tests/**", "**/__tests__/**"]
---

# Testing

A suite is an argument that the code does what it promises. Every clause below
protects that argument from the two ways it degrades: tests that pass for
reasons unrelated to the promise, and tests that were adjusted until they
passed. Numeric floors — coverage, mutation score, flake rate, suite shape —
are the repository's own and are read as data by the verify skill's testability
axis; this rule is about what a test asserts, not how many there are.

## Floor

1. **Assert behaviour, not implementation.** The assertion states the promise a
   caller relies on — the returned value, the persisted effect, the emitted
   event. A test that asserts which internal function ran, or how many times,
   breaks on a refactor that keeps every promise, and that breakage teaches the
   next author to weaken the test rather than to trust it.
2. **Every defect fix ships its regression case.** The case fails against the
   unfixed code and passes after — verified in that order, because a case
   written after the fix and never seen red proves only that it compiles.
3. **The name states the invariant.** `rejects an expired token` over
   `test auth 2`. A failing run should identify the broken promise from the
   name alone, before anyone opens the file.
4. **No green, no done.** Done means the declared gates exit 0. A change that
   cannot reach green ships with a `Not done:` list naming each open gap; a
   summary that reports success while a gate is red is the defect.
5. **Gating tests are never weakened by the change that makes them pass.** In
   the change under review, a test that gates the behaviour being changed is
   not edited, deleted, skipped, marked as expected-to-fail, loosened to a
   weaker matcher, or excluded by configuration. This binds the author of the
   change regardless of which file the work started in. Where a test genuinely
   encoded the old behaviour, the edit carries an inline reason naming what
   about the contract changed and why the old assertion no longer holds — the
   same justification a mock carries. Review reads changed test files as part
   of the diff under scrutiny, at the same depth as the source change.
6. **Real dependency first; each mock carries its reason.** Use the real
   collaborator wherever the suite can run it. A substitute carries an inline
   note naming what makes the real one unusable here — network, cost, a clock,
   an unavailable device — and sits at a boundary the code already has. A
   substitute for the unit under test is a design signal, not a test technique.
7. **Determinism is injected, not hoped for.** Clock, randomness, identifiers,
   and ordering enter through parameters the test controls. A case that asserts
   on time, ordering, or a generated id while reaching for the ambient source
   is flaky by construction, and a retry that turns it green hides the cause.
8. **At least one input activates the computation.** A zero-rate fee, a
   one-element merge, an empty pipeline, and a same-source-and-target move all
   pass without executing the logic under test. For every changed behaviour,
   one case drives an input whose expected result differs from that degenerate
   baseline.

## Gates

- A behaviour change with no case that fails without it is not covered,
  whatever the coverage number says.
- A suite green only on degenerate inputs is a Warning, and a Critical finding
  on payment, authorisation, and data-mutation paths.
- A silenced case — skipped, excluded, quarantined — carries a tracking
  reference and an owner. A silenced case with neither is removed or restored.
- A changed, removed, or loosened gating test with no inline reason blocks the
  change until the reason lands or the test is restored.
- A mock with no inline reason is a review finding, not a style preference.
