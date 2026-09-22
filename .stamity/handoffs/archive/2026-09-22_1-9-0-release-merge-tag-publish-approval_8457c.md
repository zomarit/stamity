---
id: 2026-09-22_1-9-0-release-merge-tag-publish-approval_8457c
status: archived
created: 2026-09-22T14:03:58.884Z
expires: 2026-10-22T14:03:58.884Z
summary: "The 1.9.0 candidate 37e8976 is green on its gate, CI, harness and eval; the merge of PR #47, the tag, the publish approval and the record re-sync are the maintainer's"
fromTool: claude
gitRef: package-15-plugin-lifecycle-3@37e8976
integrity: sha256:628285ae4b568fc66965f6914d9a36a39abfd8e7afd3120db2b00c36515f9dc7
---
## Problem

The 1.9.0 release of stamity (plan 008, the plugin-backed distribution lifecycle) is prepared on
`package-15-plugin-lifecycle-3` at `37e8976` (pull request #47): every unit built, reviewed and integrated, the
gate of record, CI and the QA harness green at that sha, the eval increment (run 32) passed, the QA checkpoint
signed. What is left is the release itself — the merge, the tag, the publish job's approval and the record
re-sync — which the maintainer alone performs, plus the owner-dependent rehearsal (V4, its own handoff).

## Decisions

- The cut stays dated 2026-09-21 (the CHANGELOG heading, fifteen page stamps, the cut-date constant, the
  measurements snapshot): the candidate was prepared and verified that day; the tag's date is in git.
- Run 32 is the eval of record, composed with run 31 under the incremental rule at candidate `e5e54c9`; no case,
  cited source, rubric, set or instrument byte moved between it and `37e8976`.
- The PowerShell-fallback host (Windows without Git Bash) is a declared residual: the anchored hook commands do
  not launch there and the `claude-hook-shell` doctor row reports it; accepted at the QA sign-off.
- The spec status flip to shipped-with-1.9.0 is its own commit (`523c66b`), to revert alone if the release does
  not happen.

## Work Done

- The branch `package-15-plugin-lifecycle-3`, `67f404b` → `37e8976`, pushed; CI green on every leg at `37e8976`
  (run 35735809695) and at every pushed sha since `bd837fb`.
- The gate of record at `37e8976`: lint, typecheck, build, `stamity check`, 234 files / 9,315 passed / 18 skipped
  with coverage 96.57 / 90.01 / 98.77 / 97.41, knip, the leak gate (0 hits over 1,558 files), the hygiene gate, both
  generators at 1.9.0, `test/evals` 1,290 — the run record's entry for `37e8976`.
- `.stamity/runs/2026-09-17_plugin-lifecycle/qa-session-3.md` — thirty-three auto-proven rows, seven person
  rows signed in chat; `.stamity/evidence/qa-37e8976.json`.
- `evals/runs/2026-09-22-run-32/` — PASS, the run of record on README, the doctrine, the CHANGELOG, the
  measurements page and REQ-PLUGIN-025.
- `CHANGELOG.md` `## [1.9.0] - 2026-09-21`, `package.json` 1.9.0, the regenerated manifests and dogfood tree.

## Work Remaining

- Merge pull request #47 by rebase (the CI convention: PR-only CI, rebase merge).
- Tag `v1.9.0` at the merged head and approve the release run's publish job; after it, confirm
  `refs/heads/plugin-dist` and `refs/tags/plugins/v1.9.0` exist at one orphan commit, the four archives are
  attested, the npm publish followed the digest check.
- The record re-sync: the private layer's side-by-side record after the tag (the release-close checklist).
- The evidence-archive step of the close: archive run 31's and run 32's public summaries into the evidence
  release and compact them (the hygiene exceptions in `scripts/repo-hygiene.mjs` are for that window).
- V4 — the private-chain rehearsal (its own handoff, `2026-09-22_v4-private-chain-rehearsal-1-9-0_508a7`).
- Set the four per-client secrets and dispatch `nightly.yml` once (its first armed run).

## Blockers

None on the tree. The publish approval, the merge and the tag are the maintainer's; the Cursor account on this
machine is over its usage limit (the Cursor rows read `not-run`); the eval account's weekly window resets on
2026-09-26.

## Next Steps

1. `gh pr checks 47` — every check green at `37e8976`; then merge by rebase.
2. `git tag v1.9.0 <merged head> && git push origin v1.9.0`; approve the publish job when it asks.
3. `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.9.0`; open the run's attestation step.
4. Run the release-close checklist's per-release lines and the private record re-sync.
5. Archive and compact the two run summaries; prune the twenty-odd lane worktrees under the worktree farm.

## Build & Test Status

- Gate of record at `37e8976` (uncontended, 2026-09-22T13:48Z): every gate exit 0 — see Work Done.
- CI at `37e8976`: `CI` (floor, LTS, Windows, three APM routes, `plugin-route`, `all-ci-checks`), `PR checks`,
  `Docs site` — all success.
- Harness at `37e8976`: `H1a`, `H1d`, `H2`, `H3a`–`H3d`, `H4a`, `H4c`, `H4d` passed; `H1b` not-run (the Codex vendor
  fact); `H1c`, `H4b`, `H5` not-run on the Cursor account's limit (the claude, copilot and codex walks PASS).

## File Manifest

| Path | State | Last action |
|---|---|---|
| `CHANGELOG.md` | committed at `37e8976` | V7: the 1.9.0 section; the run-of-record bullet at run 32 |
| `package.json`, `package-lock.json` | committed | V7: version 1.9.0 |
| `docs/plugins.md`, `.github/client-contracts.md` | committed | re-attested 2026-09-22 with the measured Copilot and Codex facts |
| `evals/runs/2026-09-22-run-32/` | committed (`60cae8e`) | the run of record |
| `.stamity/runs/2026-09-17_plugin-lifecycle/record.md`, `ledger.jsonl`, `qa-session-3.md` | the session's close commit | the proof block, no open row, the signed form |
| `.stamity/inbox.md` | the session's close commit | the session-3 block, six retirements |
