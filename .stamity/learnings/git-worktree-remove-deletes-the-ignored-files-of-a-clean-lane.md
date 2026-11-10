---
id: git-worktree-remove-deletes-the-ignored-files-of-a-clean-lane
title: git worktree remove deletes the ignored files of a clean lane
date: 2026-11-10
confidence: high
summary: git worktree remove with no --force deletes a clean lane's ignored files, such as evals/runs/*/calls/, and git status shows nothing; run land's clean-up lists and keeps them
reviewBy: 2027-02-10
validatedAgainst: "a scratch-repository reproduction with git 2.52.0 on 2026-11-10; .gitignore:47-48 and src/runs/runCleanup.ts on the tree CI run 42730516873 tested (PR #138)"
integrity: sha256:7df2c08dbe1c909cb4c43bff2aa11810b894beda77c90a81f6f163cf08be1f48
---

`git worktree remove <path>` without `--force` succeeds on a worktree whose `git status --porcelain`
is empty, and it deletes that worktree's ignored files with it. Status prints nothing for ignored
files, so a lane that reads merged and clean can still hold the only copy of something. In this
repository the ignored places that hold such copies include an eval run's call captures
(`/evals/runs/*/calls/` and `/evals/runs/*/calls.json`, `.gitignore:47-48`).

## Why

Reproduced on 2026-11-10 with git 2.52.0 in a scratch repository under the system temporary folder:
a linked worktree holding one file in an ignored `captures/` folder showed an empty `git status
--porcelain`, `git status --porcelain --ignored=matching` listed `!! captures/`, and `git worktree
remove` succeeded and left no trace of the folder. First met on 2026-09-28, when removing an eval lane
would have deleted the only copy of a run of record's call transcripts. The run clean-up in
`src/runs/runCleanup.ts:21-23` and `:102-104` lists a lane's ignored entries and keeps any lane that
holds one beyond what its setup placed; a direct `git worktree remove` has no such check.

Confidence high: reproduced. Validated against the scratch reproduction and
`src/runs/runCleanup.ts` on the tree CI run `42730516873` tested (PR #138). Review horizon: re-check on a git release that changes
`worktree remove`.

## How to apply

`git -C <lane> status --porcelain --ignored=matching` before a removal shows what would go with the
lane. Anything listed there other than the linked `node_modules` and the files the lane's setup
placed is moved to the same path in the main checkout, and compared there, before the lane goes.
