<!-- Preserved 2026-10-03 by run 2026-10-03_pack-engine-defects. A byte copy of the triage of record that
.stamity/runs/2026-10-01_pr73-review-round-1/record.md cites at a session scratch path a reboot deletes; that record
is read-only to later runs, so its copy lives here. Nothing below this comment was changed. -->
# PR #73 · `/st-pr-resolve` round 1 · triage of record

Head at evaluation: `4607ba7d` (branch `docs/plans-015-016`). Reviewer: chatgpt-codex-connector[bot] (22 inline threads, all open).
Ingress screen: 22 inline bodies `kept` (no class matched); the review summary (5386426267) and the discussion status
comment (5941801990) carry no ask, are not findings, and each had one U+FE0F stripped as warn-class material.
Triage answer: **accept (default)** — recorded on the maintainer's overnight instruction (asleep; recommended option at every ask).
Design choices taken on the recommended option (reversible in the morning): F07 (no repository named → new items stay
proposals), F14 (`u2-apm-backed-mode` owns the additive lock-reader extension), F16 (narrowed: only `failed` legs hold).

| ID | Comment | File:line | Severity / confidence | Route | Reason |
|---|---|---|---|---|---|
| F01 | 4161202215 | 015:474 | Warning / high | FIX | preview omits the checklist ticks the progress table writes |
| F02 | 4161202230 | 015:473 | Warning / high | FIX | `phase.transition` writes nothing under `move: off`, against Decision 4 and REQ-BOARD-003 |
| F03 | 4161202236 | 015:447 | Warning / high | FIX | `apply` covers every status change vs the end-of-run close question |
| F04 | 4161202242 | 015:578 | Warning / high | FIX | `b6` may sync before `b4` edits the eval override |
| F05 | 4161202263 | 015:396 | Warning / high | FIX | `gh project item-list` / `field-list` stop at 30 |
| F06 | 4161202271 | 015:414 | Minor / high | FIX (work unit) | New item write omits "when one is linked" |
| F07 | 4161202312 | 015:100 | Warning / medium | FIX | a Projects-board link names no repository to file in |
| F08 | 4161202317 | 015:470 | Minor / medium | DECLINE | only own issues match; read foreign text is already screened |
| F09 | 4161202324 | 015:375 | Warning / medium | FIX | setup checks authentication, not write permission |
| F10 | 4161202212 | 016-02:1098 | Minor / medium | DECLINE | the bounded release at the cap is the gate's existing design |
| F11 | 4161202253 | 016-02:955 | Warning / medium | FIX | `--registry` reaches cmd.exe unvalidated; repo precedent runs npm without a shell |
| F12 | 4161202297 | 016-02:954 | Warning / high | FIX | pin located by first match after the sync already wrote |
| F13 | 4161202306 | 016-02:1230 | Minor / high | FIX (work unit) | census row drops the legacy admin template S3 keeps |
| F14 | 4161202343 | 016-02:1058 | Warning / high | FIX | file 2 assumes a lock reader file 1 does not declare |
| F15 | 4161202349 | 016-02:1162 | Minor / high | DECLINE | the cursor/st-work duplicate comes from a path APM does write |
| F16 | 4161202197 | 016-03:820 | Warning / high | FIX (narrowed) | the decision escape also covers `failed` legs |
| F17 | 4161202205 | 016-03:658 | Warning / high | FIX | one pasted block re-enables Actions before the reset lands |
| F18 | 4161202278 | 016-03:935 | Warning / high | FIX | promotion dispatched with the source tag |
| F19 | 4161202287 | 016-03:939 | Warning / high | FIX | `pack` misses `--repo` and reuses one manifest path |
| F20 | 4161202330 | 016-03:654 | Warning / high | FIX | an unsuffixed fork-owned tag is deleted as upstream's |
| F21 | 4161202336 | 016-03:901 | Minor / high | FIX (work unit) | `records.mjs commit` without `-m` |
| F22 | 4161202222 | inbox:375 | Minor / high | DECLINE | no rule binds these writers' wording; precedent on main |
