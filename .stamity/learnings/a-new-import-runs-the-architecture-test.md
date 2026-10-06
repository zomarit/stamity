---
id: a-new-import-runs-the-architecture-test
title: a new import runs the architecture test
date: 2026-10-06
confidence: high
summary: test/architecture/boundaries.test.ts fails an import into a later wave; a narrow run without it stays green while the full gate goes red (prove/7, 2026-10-06)
reviewBy: 2027-03-06
validatedAgainst: "the full gate on 94f348e5 (red at test/architecture/boundaries.test.ts:1040) and on eb4f0727 (green), run 2026-10-03_pack-engine-defects"
integrity: sha256:f7b47103a093cdd3cbeafad345fd31a262cf8a2b331333f87c76ec5fc976d952
---

`test/architecture/boundaries.test.ts` gives every `src/` module a wave and fails any import
from a module into a later wave. For example, `src/pack/verifyInstalled.ts` is wave 2, and
`src/pack/receipt.ts` and `src/pack/curated.ts` are wave 7 (`:319`, `:466-467`). Its waiver
list is matched as an exact set, so it can only shrink (`:1034-1041`).

A fix round that adds an import and runs only the tests beside its change can pass. The full
gate then fails on a file the change never touched.

## Why

Measured on 2026-10-06 in run `2026-10-03_pack-engine-defects` (its record, lines 482-495):
- Review round 5 added imports from `src/pack/verifyInstalled.ts` to `src/pack/curated.ts` and
  `src/pack/receipt.ts`.
- The fixer's narrow runs were green. The full gate on `94f348e5` went red at
  `test/architecture/boundaries.test.ts:1040`, Critical `prove/7`.
- The fix moved the read, unchanged, into `src/cli/commands/check.ts`, which is wave 15
  (`:554`) and may import both modules. No waiver was needed.

Validated against: the red full gate on `94f348e5`, the green full gate on `eb4f0727`, and the
cited lines at `ee2fe9a5`. Review horizon: re-check when the layering test is replaced or the
wave map is re-cut.

## How to apply

Any change that adds an `import` between two `src/` modules adds `test/architecture` to its
narrow run, for example `npx vitest run test/architecture test/<its own area>`. Say so in fix
and build briefs, whose `verify` command is otherwise only the unit's own tests.

When the test refuses an edge, move the code into a module whose wave may import both sides.
A new entry in the waiver list is a reviewed design change, not a fix.
