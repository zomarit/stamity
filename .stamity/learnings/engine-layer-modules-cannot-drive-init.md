---
id: engine-layer-modules-cannot-drive-init
title: engine layer modules cannot drive init
date: 2026-09-20
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "npx vitest run test/architecture/boundaries.test.ts on the two placements of the setup engine, 2026-09-20"
summary: a src/plugins module importing src/cli/commands/init is refused by the boundaries test (rule 1 no-cli, waves, uncalled) and eslint; a setup engine lives at src/cli/commands/<verb>/ at wave 15
integrity: sha256:2ecb8b3508c31dddf43c4f08be0d57dbfabc2e93c6b8c2557232441450b9622e
---

A module under `src/plugins/` (or any engine-layer directory) cannot drive the
CLI's init planner: importing `src/cli/commands/init/plan.ts` or
`src/cli/commands/init/apply.ts` from there is refused by five independent gates,
and the composition root at wave 12 cannot register a module that sits above
it. A setup engine that calls `buildInitDecisions` and `applyInit` therefore
lives in the CLI layer at wave 15 (`src/cli/commands/<verb>/`), the placement
`src/cli/commands/workspace.ts` already documents for a command that drives the
emission engine; only its pure reader (a strict file parser over `src/types/*`)
belongs in the engine and the registry.

## Why

Observed on 2026-09-20 while building the plugin setup engine of plan 008 file 2:
the plan placed it at `src/plugins/setup.ts` in the engine registry. The
architecture gate `test/architecture/boundaries.test.ts` refused it as rule 1
(`no-cli: src/plugins/setup.ts -> src/cli/commands/init/apply.ts (the engine
never imports the CLI)`, with no waiver mechanism), rule 2 (a wave-14 to wave-14
edge across units; the registry at wave 12 cannot hold a wave-14 module), rule
5 (a registry module with no production caller), and eslint's
`no-restricted-imports` said the same. A two-line stub reproduced rules 1, 2 and
5 before any real code existed. Moving the module to
`src/cli/commands/plugin/setup.ts` at wave 15 made every edge same-unit or
strictly earlier, with the reader `src/plugins/capabilityFile.ts` staying in the
engine at wave 2. Validated against: `npx vitest run
test/architecture/boundaries.test.ts` on the two placements. Review horizon:
retire if the boundaries test gains a waiver for engine-to-CLI edges or the
init planner moves into the engine.

## How to apply

A plan cell that places a module by directory is checked against the wave map
in `test/architecture/boundaries.test.ts` before dispatch: a module that will
import anything under `src/cli/` is a CLI-layer module at wave 15 with a
`PLAN_MAP` row there, and the engine registry receives only the parts that
import `src/types/*` and lower waves. The two gates that stay red until the
verb exists (rule 4 unreachable, rule 5 uncalled) are expected for a unit that
lands before its caller, and the caller's unit closes them.
