---
id: the-local-test-gate-is-weaker-than-ci
title: the local test gate is weaker than CI
date: 2026-09-01
confidence: high
summary: "npm run test misses two CI-required checks: per-file coverage floors (CI runs npm test -- --coverage) and a Windows leg — POSIX-only local runs pass while coverage/path/mode gaps fail required CI"
reviewBy: 2026-12-01
validatedAgainst: npm test -- --coverage
integrity: sha256:6b49fc6c208727dfd99b14e2f1b983eedcbd92406c50459b25f7eb9bc3eb297d
---

The local verification gate `npm run test` (plain `vitest run`) is weaker than what CI
enforces on a pull request, in two ways that a POSIX-only local run cannot surface — so a
change can be green through every local gate and every review round and still fail required
CI. First, CI's `check` job runs `npm test -- --coverage` (`.github/workflows/ci.yml`, the
`matrix.coverage` legs), and `vitest.config.ts` declares PER-FILE coverage floors
(`src/emit/skillsProjection.ts` at 90% branches, and many others) — plain `npm run test`
runs no instrument, so a change that drops a file below its floor passes locally and fails
the CI check leg. Second, that `check` job runs on a Windows runner as well as the two Linux
legs, and Windows is a required status — code that assumes POSIX path separators or POSIX
file modes passes on darwin/Linux (where both separators fold to `/`) and fails only there.

## Why

Verified 2026-09-01: the whole triage-handoff marathon used `npm run lint && npm run
typecheck && npm run test` as its gate across every batch and every review round, all green
locally at 6162 tests. The PR's CI then failed three ways the local gate never saw — a
coverage floor (`skillsProjection.ts` branches 89.58% vs 90%, from D11's origin/metadata
additions raising the branch count), and 53 Windows path/mode failures: content-path error
messages rendered native backslashes where a POSIX substring was asserted (decision-13's
switch from the always-POSIX `relativePath` to the absolute `filePath`), worktree real fs
paths built with the wrong separator, and worktree mode assertions (0600/0700/0755) that
Node cannot represent on Windows at all. None was reproducible on darwin. Review horizon:
retire this if the charter's stated gate is changed to include `--coverage`, or if a local
Windows/coverage pre-push hook is added — until then the gap is real and permanent.

## How to apply

Before declaring a change done — especially one touching `src/emit/*`, `src/content/*`, or
`src/worktree/*`, or any code that builds, compares, or prints a filesystem path — run
`npm test -- --coverage` locally, not just `npm run test`, and read the per-file report for
any `does not meet ... threshold` line (that is the exact form CI fails on). For path code,
assume the two conventions the tree already splits by: a logical/content path is displayed
POSIX (`p.replaceAll("\\", "/")` at the message seam) so its relative form survives on
Windows, while a real filesystem path is composed and compared with native `node:path`
`join`/`resolve` (never `posix.join` or a `/` literal). A POSIX file-mode assertion
(`0o600`/`0o700`) cannot pass on Windows and is `skipIf(WINDOWS)`-gated rather than "fixed";
the production `chmod` must be a non-throwing no-op there. Darwin cannot prove any of this —
the confirmation of record is the CI Windows leg, so budget a CI round-trip to verify a
path- or mode-touching change rather than trusting a local green.
