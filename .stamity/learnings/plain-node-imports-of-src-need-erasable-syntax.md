---
id: plain-node-imports-of-src-need-erasable-syntax
title: plain-node imports of src need erasable syntax
date: 2026-10-11
confidence: high
summary: scripts/ci/records-only.mjs loads src/change by Node type stripping; since 2026-10-10 erasableSyntaxOnly makes typecheck refuse an enum or parameter property, and one closure test runs the import
reviewBy: 2027-01-11
validatedAgainst: "tsconfig.json:20 (erasableSyntaxOnly), scripts/ci/records-only.mjs:38 (the import of src/change/classify.ts) and the closure run in test/ci/recordsOnly.test.ts, read at ec6eddcf; the three TS1294 errors and the two planted cases of unit f1-erasable-guard in run 2026-10-10_next-tier (commit 8dd39af0)"
integrity: sha256:bb172e623c03e1dc2b831212f4adf8c377b1e5fe612b28d90cd060ab965ad118
---

Some code in this repository imports `src/` TypeScript straight into plain `node` through its
type stripping, with no build or install: `scripts/ci/records-only.mjs` imports
`src/change/classify.ts`, and CI's `changes` job runs that script before any install. Type
stripping only erases type syntax, so a construct that emits runtime code (an `enum`, a
`namespace` with values, a constructor parameter property) makes that import throw.

Since 2026-10-10 the typecheck gate refuses that syntax everywhere: `tsconfig.json` sets
`erasableSyntaxOnly`, and `npm run typecheck` fails with `TS1294` on an `enum` or a parameter
property anywhere under the project. What stays narrow is the run itself: only one test,
in `test/ci/recordsOnly.test.ts`, copies a script's import closure and runs it under plain
`node`. Another script that starts importing `src/` by type stripping is covered by the
compiler flag and by no run of its own.

## Why

Found in run 2026-10-08_product-core (ledger row build/17), when a parameter property passed
`tsc`, the suite and both linters and broke `node scripts/generate-docs.mjs`. Run
2026-10-10_next-tier added the flag (unit f1-erasable-guard, commit 8dd39af0): the flag alone
raised three `TS1294` errors, all parameter properties of one test helper class, which became
plain fields; a planted `enum` and a planted parameter property under `src/` each failed
`npm run typecheck` and were removed. Unverified: no plain-node import other than the
records-only closure was run.

## How to apply

Write a union of string literals or an `as const` object where an `enum` would go, and an
explicit field with an assignment where a parameter property would go; the compiler now says so
if you forget. When a script gains a new plain-node import of `src/`, add a closure run for it
on the pattern of the records-only test, since the flag proves the syntax and not that the
import chain loads.
