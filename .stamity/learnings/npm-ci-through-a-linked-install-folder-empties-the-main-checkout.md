---
id: npm-ci-through-a-linked-install-folder-empties-the-main-checkout
title: npm ci through a linked install folder empties the main checkout
date: 2026-11-10
confidence: high
summary: a lane's node_modules is usually a link to the main checkout's; npm ci there empties that shared install, which then fails elsewhere with ERR_MODULE_NOT_FOUND (2026-11-06)
reviewBy: 2027-02-10
validatedAgainst: "src/worktree/setup.ts:816-826, src/hooks/scripts.ts:4618-4624 and test/hooks/linkedInstall.test.ts on the tree CI run 42730516873 tested (PR #138)"
integrity: sha256:ee53b0a9bddd40ffb13e7f60730febb2dddc7beee4eef27b3b422280ff4ff5f5
---

A lane set up under `.stamity-worktrees/` usually holds `node_modules` as a symbolic link to the main
checkout's install; setup prints so (`installLinkNotices`, `src/worktree/setup.ts:816-826`). `npm ci`
clears the `node_modules` it is given before it installs, so run in such a lane it empties the folder
that the main checkout and every other linked lane read. The failure shows up somewhere else, later:
a `npx --no stamity` call in the main checkout fails with `ERR_MODULE_NOT_FOUND`.

## Why

Observed on 2026-11-06: an `npm ci` in a release lane replaced the lane's link with a real folder and
left the main checkout's `node_modules` empty; `npm ci` in the main checkout restored it. Since then
the hook guard refuses an install verb whose folder holds a linked `node_modules`, in every mode
(REQ-FLOW-178, `src/hooks/scripts.ts:4618-4624`, held by `test/hooks/linkedInstall.test.ts`). That
guard reads an agent's shell calls; a terminal a person types into runs no hook.

Confidence high for the mechanism: observed, and the guard's tests hold the refusal. Validated
against `src/worktree/setup.ts` and `src/hooks/scripts.ts` on the tree CI run `42730516873` tested (PR #138). Review horizon: retire if
lanes stop linking `node_modules`.

## How to apply

`test -L node_modules` in a lane tells which case applies: a link means the install belongs to the
main checkout, and a lane with its own folder installs as usual. A stamity call in the main checkout
that fails on a missing package points at an emptied install, which `npm ci` in the main checkout
repairs.
