---
id: a-new-import-runs-the-architecture-test
title: a new import runs the architecture test
date: 2026-10-06
confidence: high
summary: test/architecture/boundaries.test.ts fails an import into a later wave; a narrow run without it stays green while the full gate goes red (prove/7, 2026-10-06)
reviewBy: 2027-03-06
validatedAgainst: "the full gate on 94f348e5 (red at test/architecture/boundaries.test.ts:1040) and on eb4f0727 (green), run 2026-10-03_pack-engine-defects"
integrity: sha256:b89816d731909549b3084a5c948d136893a6bf0d17905f1da8d503b1c75a4fe7
---

`test/architecture/boundaries.test.ts` gives every `src/` module a wave and fails any import
from a module into a later wave. For example, `src/pack/verifyInstalled.ts` is wave 2, and
`src/pack/receipt.ts` and `src/pack/curated.ts` are wave 7 (`:336`, `:513-514`). Its waiver
list is matched as an exact set, so it can only shrink (`:1053-1060`).

A fix round that adds an import and runs only the tests beside its change can pass. The full
gate then fails on a file the change never touched.

## Why

Measured on 2026-10-06 in run `2026-10-03_pack-engine-defects` (its record, lines 482-495):
- Review round 5 added imports from `src/pack/verifyInstalled.ts` to `src/pack/curated.ts` and
  `src/pack/receipt.ts`.
- The fixer's narrow runs were green. The full gate on `94f348e5` went red at
  `test/architecture/boundaries.test.ts:1040`, Critical `prove/7`.
- The fix moved the read, unchanged, into `src/cli/commands/check.ts`, which is wave 15
  (`:605`) and may import both modules. No waiver was needed.

Validated against: the red full gate on `94f348e5`, the green full gate on `eb4f0727`, and the
cited lines at `ee2fe9a5`, re-read at `114aa996` on 2026-10-14. Review horizon: re-check when the layering test is replaced or the
wave map is re-cut.

## How to apply

Any change that adds an `import` between two `src/` modules adds `test/architecture` to its
narrow run, for example `npx vitest run test/architecture test/<its own area>`. Say so in fix
and build briefs, whose `verify` command is otherwise only the unit's own tests.

When the test refuses an edge, move the code into a module whose wave may import both sides.
A new entry in the waiver list is a reviewed design change, not a fix.
