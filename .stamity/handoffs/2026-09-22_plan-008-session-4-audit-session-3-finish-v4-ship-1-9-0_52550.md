---
id: 2026-09-22_plan-008-session-4-audit-session-3-finish-v4-ship-1-9-0_52550
status: active
created: 2026-09-22T15:00:32.832Z
expires: 2026-10-22T15:00:32.832Z
summary: A fresh session audits session 3's late work for context-rot damage, then finishes V4 from its on-disk state (the mirror is pushed) and ships 1.9.0 through the release handoff
fromTool: claude
gitRef: package-15-plugin-lifecycle-3@6eb3aca
integrity: sha256:ff05bd985c9f3a181327fc2e0b0e5f894bd7673422f4c5b33990a4112d466af1
---
## Problem

Plan 008 session 3 ran about twenty hours across two account limits, a compaction and a day's gap. Every unit
except V4 is built, reviewed and integrated on `package-15-plugin-lifecycle-3` (code `37e8976`, tip `6eb3aca`),
green on its gate of record, CI and the QA harness, with run 32 as the eval of record and the QA checkpoint
signed. The maintainer ended the session on purpose because its context had grown long, and asked a fresh
session to first audit session 3's late work for context-rot damage, then finish V4, then ship 1.9.0.

## Decisions

- The audit comes first and is read-only: five readers at the stronger class over the FINAL tree and the records,
  findings to the ledger from `prove/281`, fixes through lanes, a re-read to verify.
- V4 runs before the release so anything it finds is fixed before the tag; its token-bearing commands may take
  the `gh` login's token inline (`$(gh auth token)`) at run time, never written down (the maintainer's allowance).
- The cut stays dated 2026-09-21; the nightly stays disabled at the repository by choice; the PowerShell-fallback
  host ships with the maintainer's exception.

## Work Done

- Session 3's record, ledger (no open row), QA form (signed; the Codex interactive hooks and the Cursor rows
  measured this afternoon), inbox block and two learnings are committed and pushed; the private layer's
  continuity log and dashboard carry the session; the session-4 kickoff is in the private layer's founding
  directory with the audit checklist and V4's on-disk state.
- V4 so far: three private fixture repositories created under the maintainer's personal account; the two
  versions built from `37e8976` with the private identity and pushed to the mirror (`plugin-dist` and
  `plugins/v1.9.1` at `b567f3a9…`, `plugins/v1.9.0` at `bbd0c962…`); the local build at `/tmp/v4`; the record
  started at `/tmp/v4/record/private-chain.md`; the worktree `p15s3-v4` holds the identity edit uncommitted.

## Work Remaining

1. The audit of session 3 (the kickoff's section 1 lists what to check).
2. V4: the two consumers, one real Renovate run, merge and reinstall with the marker discovered, the rollback
   walk, a second Renovate run opening none, the leak gate, the record and the guide's Renovate block, the fork
   step after the tag, the `Not done` lines; the maintainer's real Claude home cleaned afterwards.
3. The release: CI green at the tip, `gh pr ready 47`, merge by rebase, tag `v1.9.0`, approve the `npm-publish`
   environment (id 20612199931), verify, then the close (the private re-sync, the archive step for the two run
   summaries, the measurements regeneration with merge evidence).

## Blockers

None on the tree. The eval account's weekly window is spent until 2026-09-26 (run 32 already ran on the
maintainer's login). `/tmp/v4/apm-venv` may be half-made; recreate it.

## Next Steps

1. Read the private kickoff (`founding/NEXT_SESSION_PROMPT.md`) and this handoff; verify the frozen state.
2. Dispatch the audit readers; act on findings; record the outcome.
3. Finish V4 from its on-disk state; record it.
4. Ship 1.9.0 through the release handoff; close.

## Build & Test Status

- Gate of record at `37e8976` (the runner, uncontended): every gate exit 0 — lint, typecheck, build, `stamity
  check`, 234 files / 9,315 passed / 18 skipped at 96.57 / 90.01 / 98.77 / 97.41, knip, the leak gate (0 hits
  over 1,558 files), hygiene, both generators at 1.9.0, `test/evals` 1,290.
- CI green on every leg at `37e8976`; running on the record commits above it at the time of writing.
- Harness at `37e8976` (14:49Z rewrite): every measurable row passed; `H1b` not-run (the Codex headless fact).

## File Manifest

| Path | State | Last action |
|---|---|---|
| `.stamity/runs/2026-09-17_plugin-lifecycle/record.md`, `ledger.jsonl`, `qa-session-3.md` | committed at `6eb3aca` | session 3's close and amendments |
| `.stamity/evidence/qa-37e8976.json` | committed at `6eb3aca` | the harness at the candidate, Cursor measured |
| `.github/client-contracts.md` | committed at `3bcfb17` | the interactive Codex measurement |
| `/tmp/v4/` (outside the repository) | on disk | the two versions, the mirror's bare copy, the record skeleton |
| worktree `p15s3-v4` (`package.json`) | uncommitted identity edit | never commit; delete with V4's close |
