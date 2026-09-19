---
id: gitignore-misses-a-symlinked-node-modules
title: gitignore misses a symlinked node modules
date: 2026-09-19
confidence: high
summary: the node_modules/ line in .gitignore (directory-only) misses the symlinked node_modules the worktree lane sets up, so git add -A stages the symlink; stage by explicit path until a bare line lands
integrity: sha256:2d219a4e66c2cb972d0362f9f5d3911a0e71cb1f7a87fda2b84dc6bc03147557
---

The `node_modules/` line in `.gitignore` (trailing slash, directory-only) does not match a
`node_modules` that is a symlink, so in every worktree that carries a symlinked
`node_modules` pointing at the main checkout's tree, `git status` lists `?? node_modules` and `git add -A`
stages the symlink itself. The leak gate lists untracked-not-ignored files too, so the
symlink also enters its scan set (skipped as a vendor directory by prefix, which is why
the gate stays green). Nothing refuses the commit before it lands.

## Why

Observed on 2026-09-19 in six worktrees under the lane's farm (the Package 15 run,
plan 008 file 1): every implementer that ran `git add -A` found the symlink staged and
had to remove it from the index or stage by explicit path; the first commit of unit A5
carried it until the implementer noticed. Mechanism: git treats a symlink as a file entry
(mode 120000), and a pattern ending in `/` only ever matches a directory, so
`node_modules/` cannot match it while a bare `node_modules` pattern would. Validated
against: `git check-ignore -v node_modules` in a worktree whose `node_modules` is a
symlink (no match) versus the main checkout (matches `.gitignore:node_modules/`).
Review horizon: retire this learning when `.gitignore` gains a bare `node_modules` line
(or when the worktree lane copies the tree instead of linking it); either change makes
the symlink ignored and the finding moot.

## How to apply

In a worktree with a symlinked `node_modules`, stage with explicit paths and never
`git add -A`, and read `git status` for a `?? node_modules` line before every commit. The
durable fix is one line in `.gitignore` (a bare `node_modules` beside the slash form),
which is queued in the deferral inbox for the next session; until it lands, the
worktree brief carries the explicit-path rule.
