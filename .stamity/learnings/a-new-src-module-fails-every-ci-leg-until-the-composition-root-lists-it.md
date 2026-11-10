---
id: a-new-src-module-fails-every-ci-leg-until-the-composition-root-lists-it
title: a new src module fails every ci leg until the composition root lists it
date: 2026-11-10
confidence: high
summary: test/composition/root.test.ts derives its registry from src/, so a new engine module fails every CI leg until src/composition/root.ts wires it or excludes it with a reason
reviewBy: 2027-02-10
validatedAgainst: "test/composition/root.test.ts:19-36 at bcf4eeb9 and commits 3e76d2d9 and 42aa32ee"
integrity: sha256:6b5aa035f82522b7e597e25b148242877b71833d73fd8f0869bd636e9c5e7382
---

`test/composition/root.test.ts` derives the registry it expects from the tree: it walks `src/`,
subtracts its `EXCLUSIONS`, and requires a registry entry for each module left (`:19-36`). A new
engine module therefore fails that file, on every CI leg, until it is wired into
`src/composition/root.ts` or excluded with a stated reason. The check reads the whole tree, so a
verify run that names only the new module's own tests stays green.

## Why

Observed on 2026-11-05: a pull request was red on every leg, and the cause first reported was one
failing row. The failing job's log named this check instead, for two modules: commit `3e76d2d9`
wired `adapters.landWorkflow` into the composition root, and `42aa32ee` wired `src/mcp/ownServers.ts`,
"which the derived registry check in `test/composition/root.test.ts` requires". The same log named
one more cause, a land-workflow row test that assumed this package's own identity; `3e76d2d9` moved
it to read the line a real sync pins from the checkout's own manifest. Each fix turned its legs
green. At `bcf4eeb9` the whole-tree checks listed in `a-narrow-verify-run-misses-whole-tree-guards`
are three, and this one is not among them.

Confidence high: the derivation is in the test's own header and source, and both fixes were proved
in CI. Validated against `test/composition/root.test.ts:19-36` and commits `3e76d2d9` and `42aa32ee`
at `bcf4eeb9`. Review horizon: revisit if the composition root stops deriving its registry from the
tree.

## How to apply

A change that adds a module under `src/` carries its composition-root entry, or an exclusion with
its reason, in the same change, and its verify list holds `test/composition` beside the module's own
tests.
