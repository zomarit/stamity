---
id: git-stash-is-shared-across-worktrees
title: git stash is shared across worktrees
date: 2026-09-20
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "git stash list run from two linked worktrees of this repository on 2026-09-20 showing one shared entry"
summary: git stash is one stack per repository shared by every linked worktree, so parallel lanes stashing baselines can pop each other's work (2026-09-20); a patch file plus git restore is the safe baseline
integrity: sha256:8ca344928633705ade87908817781ae131062218d7c962f72adaa32edd15da36
---

`git stash` keeps one stack per repository, in the common git directory that
every worktree of the repository shares. A stash pushed from one worktree is
`stash@{0}` for all of them, so two agents taking red-first baselines in two
worktrees at the same time can interleave: the second `push` lands on top of the
first, and the first lane's `pop` then applies the second lane's working set
into the wrong tree.

## Why

Observed on 2026-09-20 in the Package 15 worktree farm (plan 008, session 2): the
codex-root lane ran `git stash push -- <paths>` and `git stash pop` around a
red-first baseline while the ownership-boundary lane pushed its own stash in
between; the pop delivered the other lane's 19 modified files (1,657 insertions,
`src/emit/ownership.ts` among them) into the codex worktree. The lane recognised
the foreign files, stashed them back unchanged with a marked message, and kept
a patch copy; the owning lane recovered them and no foreign byte reached a
commit. Mechanism: `refs/stash` is a single ref under `.git/` of the main
checkout, and a linked worktree resolves it through its `commondir`, so the
stack is repository-wide by construction. Validated against: `git stash list`
run from two worktrees of this repository on 2026-09-20 showing the same entry.
Review horizon: retire this learning if the worktree lane moves to full clones
instead of linked worktrees, which would give each lane its own stack.

## How to apply

A baseline in a linked worktree is taken with a patch file and a restore rather
than the stash: `git diff > <scratch>/<name>.patch` followed by `git restore
<paths>`, and `git apply <scratch>/<name>.patch` brings the work back; the
scratch path is private to the lane. A worktree brief for a parallel agent
carries that rule beside the explicit-path staging rule, and a stash entry that
appears with another lane's files is treated as that lane's property — stashed
back or handed over, never dropped.
