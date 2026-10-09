---
id: plain-node-imports-of-src-need-erasable-syntax
title: plain-node imports of src need erasable syntax
date: 2026-10-09
confidence: medium
summary: scripts/ci/records-only.mjs loads src/change by Node type stripping; an enum or parameter property passes tsc (no erasableSyntaxOnly) and breaks it; one closure test guards it
reviewBy: 2027-01-09
validatedAgainst: "scripts/ci/records-only.mjs:38 and test/ci/recordsOnly.test.ts:849 read at 46121954; /usr/bin/grep -n erasable tsconfig.json exit 1"
integrity: sha256:2d53f766c0101ce6d4dd371c03e3770c1905034eac34b2874eac40a8cf593648
---

Some code in this repository imports `src/` TypeScript straight into plain `node` through its
type stripping, with no build or install: `scripts/ci/records-only.mjs:38` imports
`src/change/classify.ts`, and CI's `changes` job runs that script on Node 24 before any
install (`.github/workflows/ci.yml:196`). Type stripping only erases type syntax. A construct
that emits runtime code (an `enum`, a `namespace` with values, a constructor parameter property
such as `constructor(private readonly x: string)`) passes `tsc` and lint and makes that plain-node
import throw. `tsconfig.json` does not set `erasableSyntaxOnly`, so typecheck refuses none of it.
The one guard is a test: `test/ci/recordsOnly.test.ts:849` copies the script's import closure
and runs it with plain `node`, so it covers that closure and nothing else. Another script that
starts importing `src/` by type stripping has no such guard. `src/` holds no such syntax today.

## Why

Found in run 2026-10-08_product-core (ledger row build/17) while unit p2c routed
`records-only.mjs` through `src/change`; the closure test was added by that unit (its comment at
`test/ci/recordsOnly.test.ts:844-848`). Checked on 2026-10-09: `/usr/bin/grep -n erasable
tsconfig.json` printed exit code 1, and the import is at `scripts/ci/records-only.mjs:38`, with
the type-stripping note above it at `:30-33`. Unverified: no enum was planted to watch the
closure test or the CI step fail; the claim rests on that test's own comment and Node's
documented type-stripping limits. An `erasableSyntaxOnly` guard in `tsconfig.json` is scheduled
for plan 019 file 3's Frame. Review horizon: retire once `tsconfig.json` sets
`erasableSyntaxOnly` (the typecheck gate then refuses the syntax everywhere).

## How to apply

Until that flag lands, erasable syntax is the safe form for any `src/` module a plain-node
script loads: a union of string literals or an `as const` object where an `enum` would go, and
an explicit field with an assignment where a parameter property would go. A new plain-node
import of `src/` from a script is outside the closure test's reach; the recordsOnly test's
closure copy is the existing pattern for covering one.
