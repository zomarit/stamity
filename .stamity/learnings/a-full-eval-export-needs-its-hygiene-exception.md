---
id: a-full-eval-export-needs-its-hygiene-exception
title: a full eval export needs its hygiene exception
date: 2026-09-28
confidence: high
reviewBy: 2026-12-01
validatedAgainst: "CI round 9's three red check legs on the release branch on 2026-09-28 from the two 3.5 MB summary.json files, green again after the exact-path exceptions in d9dff93e"
summary: a full eval summary.json (3.5 MB) fails repo-hygiene's 1 MB budget unless its exact-path retention exception lands in the same commit (5ee87083, d9dff93e)
integrity: sha256:228bba10e81c0f5be4cb14a1847952741c7c57dec7edb7281a778d221c4075e0
---

## What happened

On 2026-09-28, CI round 9 on the release branch went red on all three `check` legs. The exported eval runs 34 and 35 were committed with their full `summary.json` files (3.5 MB each), and `scripts/repo-hygiene.mjs` refuses any file over its 1 MB budget unless an exact-path exception with a reason names it. The 1.9.0 session hit the same wall (`5ee87083`, "retain run 32's summary beside run 31's for one window"). The precedent `063bf021` shows the shape of the fix, and `d9dff93e` is the fix this time.

## Why

A full run export is load-bearing while the next increment may compose with it: the incremental rule reads the prior run's summary from its retention commit. So it stays full in the tree for one release window, and the release close's archive step packs it into an `evidence-archive-<date>` prerelease, compacts it with `scripts/evidence-summary.mjs`, and retires the exception.

## How to apply

- Commit a full eval export together with one exact-path `LARGE_FILE_EXCEPTIONS` entry per `summary.json`, each with its retention reason, and update `test/ci/repoHygiene.test.ts` in the same commit.
- Run `node scripts/repo-hygiene.mjs --base <branch base>` and read its exit code before pushing.
- At the release close, archive, compact and retire the exceptions in one close.
