---
id: leak-gate-scans-stamity-state-files
title: leak gate scans stamity state files
date: 2026-08-31
confidence: high
summary: an agent-written file under .stamity/ spelling the predecessor's reserved name turns the suite red — the leak gate lists untracked-not-ignored files and .stamity/ is neither skipped nor allowlisted
integrity: sha256:60f99ed63583c7376f2672ca1b0ea383b38eb00092453c30725f0718bb762b94
---

The leak gate scans agent-written state files under `.stamity/`, and a reserved
predecessor-name literal in any of them turns the whole suite red. The gate
(`scripts/leak-gate.mjs`) builds its file list from
`git ls-files --cached --others --exclude-standard`, so untracked-but-not-ignored
files are in scope; `.stamity/` appears in neither the skip prefixes
(`leak-gate.mjs:84-92`) nor the predecessor allowlist (`leak-gate.mjs:344`, which
covers only `src/migration/`, `test/migration/`, `docs/migration.md`, and the
flat `dist/*.js` bundles). Two suites enforce it: `test/ci/leakGate.test.ts:44-53`
and a second embedded run at `test/docsPages.test.ts:459-468`, so one hit fails
four tests across two files.

## Why

Observed twice on 2026-08-31, both reproduced by the gate and both fixes
confirmed green. First: a handoff written by a prior session at
`.stamity/handoffs/2026-08-31_triage-decisions_410bf.md` carried eight literal
mentions of the predecessor project (a reference-repo path and quotes) — the
full suite failed 4 tests in 2 files; after respelling, 5707 passed. Second, the
same session: a run ledger at `.stamity/runs/2026-08-31_batch-a-remainder/ledger.jsonl`
quoted a built-site route that contains the predecessor's name as a path
segment — caught by review before the next gate run; after respelling, 5709
passed. The counter-assumption this breaks: that state directories are inert
scratch space outside quality gates. Review horizon: revisit if
`scripts/leak-gate.mjs` gains a `.stamity/` skip prefix or allowlist row —
either change retires this learning.

## How to apply

When writing anything under `.stamity/` (handoffs, run records, ledgers,
evidence notes), the predecessor project is referenced indirectly — "the
predecessor project", `<predecessor-migration-route>` for its migration URL
path — never as the literal name, which also appears inside the built docs
route and the reference repo's path. A literal path an executing session needs
(such as the worktree-lane reference repo for handoff decision 15) is recorded
in operator-session memory outside the repository, with the tree file carrying
a pointer to that memory. Checking a scrub: a case-insensitive grep for the
reserved name under `.stamity/` returns zero hits before any file lands.
