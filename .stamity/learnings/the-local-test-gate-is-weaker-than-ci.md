---
id: the-local-test-gate-is-weaker-than-ci
title: the local test gate is weaker than CI
date: 2026-10-08
confidence: high
summary: this repo's test gate is CI's ubuntu coverage run, but npm run test and scoped runs skip the floors, and no local run covers the required Windows legs
reviewBy: 2027-04-08
validatedAgainst: "AGENTS.md, .stamity/manifest.json gates.test, .github/workflows/ci.yml's two test steps and windows legs, package.json's test script and scripts/ci/test-run.mjs at dbd54fc7 on 2026-10-08; the 2026-09-01 PR CI failures"
integrity: sha256:4bc4aef25387e8e86e5813b28d672f02e6d203cb8ed8eedb4afbcedbd3b66321
---

One gap between a local test run and the CI a pull request must pass holds on any POSIX host, and a second opens
whenever a run is not the charter's gate.

The coverage floors are no longer part of the gap when the charter's gate runs. Since `2e7383ac` (2026-10-08) this
repository's test gate (`AGENTS.md`, Verification gates; `gates.test` in `.stamity/manifest.json`) is
`node scripts/ci/test-run.mjs --coverage`, the command CI's two ubuntu coverage legs run (`.github/workflows/ci.yml`,
the step "Test with coverage floors"). `vitest.config.ts` declares PER-FILE coverage floors, the merge and emit core
at 100%, and that run measures them. Two other runs do not: `npm run test` is still plain `vitest run`
(`package.json`), with no instrument, and a scoped `test-run.mjs --coverage <files>` drops coverage, because the
floors are keyed over all of `src/**`, and says so on stdout and stderr. A change green on either can still fail the
coverage leg.

Windows is the gap no local darwin or Linux run closes. `ci.yml`'s `check` job runs two required `windows-latest`
shards (`windows-1`, `windows-2`, `test-run.mjs --shard`, without coverage) beside the ubuntu legs. Code that assumes
POSIX path separators or POSIX file modes passes on darwin and Linux, where both separators fold to `/`, and fails
only there.

## Why

First verified 2026-09-01: the triage-handoff run used `npm run lint && npm run typecheck && npm run test` as its gate
across every batch and review round, all green locally at 6162 tests. The pull request's CI then failed three ways the
local gate never saw: a coverage floor (`skillsProjection.ts` branches 89.58% against 90%), and 53 Windows path and
mode failures — content-path error messages rendered with native backslashes where a POSIX substring was asserted,
worktree paths built with the wrong separator, and worktree mode assertions (0600/0700/0755) that Node cannot
represent on Windows at all. None reproduced on darwin.

Re-read on 2026-10-08 at `dbd54fc7` on branch `lean-flows-01`: `AGENTS.md` and `.stamity/manifest.json` name
`node scripts/ci/test-run.mjs --coverage` as the test gate (commit `2e7383ac`, "make this repository's test gate CI's
coverage run"); `ci.yml` runs that command on its coverage legs and `test-run.mjs --shard` on the two Windows legs,
whose comment says they skip the mode- and symlink-dependent cases under `test/merge/` and `test/mcp/` by platform
guard; `package.json`'s `test` script is `vitest run`. The 2026-09-01 review horizon named a gate that includes
`--coverage` as the point to retire the coverage half: that half is now true only of `npm run test` and scoped runs.
The Windows half holds.

Validated against: `AGENTS.md`, `.stamity/manifest.json`, `.github/workflows/ci.yml`, `package.json` and
`scripts/ci/test-run.mjs` at `dbd54fc7`.

Review horizon: re-check when the charter's test gate or CI's test steps change; retire the note if a Windows run
joins the local gate.

## How to apply

The coverage floors are read off the charter's gate, `node scripts/ci/test-run.mjs --coverage` with no file named; a
`does not meet ... threshold` line there is the exact form the CI coverage leg fails on. `npm run test` and a scoped
run are quicker checks that do not stand in for it.

Path code in this tree splits two conventions. A logical or content path is displayed POSIX
(`p.replaceAll("\\", "/")` at the message seam), so its relative form survives on Windows; a real filesystem path is
composed and compared with native `node:path` `join` and `resolve`, never `posix.join` or a `/` literal. A POSIX
file-mode assertion (`0o600`, `0o700`) cannot pass on Windows and is gated with `skipIf` on win32 rather than "fixed";
the production `chmod` is a non-throwing no-op there. Darwin proves none of this: the confirmation of record for a
path- or mode-touching change is the CI Windows legs, which costs a CI round trip.
