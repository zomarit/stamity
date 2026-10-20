---
id: a-guard-change-runs-the-container-leg-tests
title: a guard change runs the container leg tests
date: 2026-10-20
confidence: high
summary: "a lane changing the shell guard or an emitted hook names test/cloud in its verify: the container leg runs every emitted hook, and test/hooks alone stayed green (prove/7)"
reviewBy: 2027-01-20
validatedAgainst: "ledger row 2026-10-15_cloud-runs/prove/7 (the full suite on b4e4fbf7 red at test/cloud/containerLeg.test.ts:376, 1 of 15,454); test/cloud/containerLeg.test.ts's header and every path under How to apply read at b9b39755"
integrity: sha256:105a38523fe22825d56ed4db67564a3e3fb0b4c38c4d60fce0c621691d95b3d9
---

A lane that changes the person-only shell guard or any emitted hook names `test/cloud` in its verify
list, beside `test/hooks`. The container leg (`test/cloud/containerLeg.test.ts`) runs every hook
command `init` emits for the four clients, so a guard change can turn it red while `test/hooks`
stays green.

## Why

Run `2026-10-15_cloud-runs`, ledger row `prove/7`: the full suite on `b4e4fbf7` was red, 1 of
15,454, at `test/cloud/containerLeg.test.ts:376`, whose payload the guard refuses since `20ac8475`.
No lane's verify ran `test/cloud`.

## How to apply

- A unit whose files match any of these lists `test/cloud` in its verify, as it lists
  `test/hooks`:
  - the guard and session hooks' source: `src/hooks/personOnly.ts`, `src/hooks/scripts.ts`,
    `src/hooks/portableRunner.ts`;
  - each client's hook commands and emitted settings: `src/adapters/claude.ts`,
    `src/adapters/codex.ts`, `src/adapters/copilot.ts`, `src/adapters/cursor.ts`,
    `src/adapters/cursorLegacyGuards.ts`, and the hook plan every adapter receives,
    `src/emit/hooksInfra.ts`;
  - the emitted scripts: `.claude/hooks/stamity/**`, `.stamity/generated/hooks/**`;
  - the container leg itself: `test/cloud/**`, `scripts/ci/cloud-leg.mjs`.
- A fix round on such a unit carries the same folder.
- For imports, see `a-new-import-runs-the-architecture-test` (`test/architecture`).
