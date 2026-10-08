# Deferral inbox

The deferral home the work, plan, rework, pr-resolve and board commands name: one row per deferred item, in the grammar `/st-board`'s `## Deferral inbox` section declares — `severity · file:line · description · source: <writer>`, with an optional `Ref: <path>#<anchor>` and an optional tag word (`critical-deferred` on a deferred Critical). The work command's close appends every `deferred` ledger row here at run exit; `/st-board fill` triages the rows; an entry leaves when its destination item exists, when its proposal id is recorded, when the user drops it by name, or when a completeness pass retires it with one line recorded in that pass's run record.

Earlier Package 9 retirements are still recorded in
`.stamity/runs/2026-09-09_package-9/inbox-retirements.md`.

Rows appended 2026-09-20 by the Package 15 session-2 work run (plan 008 file 1 batches B1–B3, file 2 C1–C4, C6, C7, C9;
pull request #46). Each is a `deferred` ledger row of `.stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl`; the
row id after `#` names it. Four session-1 rows left this inbox today with dated retirements on their ledger rows.
Twenty-four more left it on 2026-10-08 in the inbox pass, each with one line in
`.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · src/adapters/codex.ts:678 · the Codex hook's commandWindows is the POSIX line carrying `${PLUGIN_ROOT}/hooks/…`, which neither cmd nor PowerShell expands; declared unmeasured on the class — file 3's V1 route proof measures the Codex leg and decides the Windows line · source: /st-work · Ref: .stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl#2026-09-17_plugin-lifecycle/prove/101

Rows appended 2026-09-22 by the Package 15 session-3 work run (plan 008 file 3 — the route proofs, the fixtures,
the eval, the QA walk-through, the 1.9.0 candidate — and the hook-path unit; pull request #47, candidate `37e8976`).
Each is a `deferred` ledger row of `.stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl`; the row id after `#`
names it. Six session-1 and session-2 rows left this inbox today with dated retirements on their ledger rows, and
the maintainer's hook-path row of 2026-09-20 left it with U1 (fixed in `7766ebf` and its siblings, the first unit of
session 3). The hygiene batch after 1.9.0 is the home most of these name. Two of them (the afterAll cleanup timeouts, prove/134, and
pluginLifecycle's unmeasured 120 s timeout, prove/218) left this inbox on 2026-09-30, fixed by `sw12-flake-unit`
of run 2026-09-30_optimization-sweep; each ledger row carries a dated `retired` field. Sixty more left it on
2026-10-08 in the inbox pass, each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Warning · nightly.yml:219-221,241-246,280 · nightly.yml:219-221,241-246,280 — with the PATH-shim vector closed, the residual is an overwrite in place: the toolcache bin, the captured node binary and /usr/local/bin are writable by the runner user, and the secret-free curl | bash cursor install (and Claude's install.cjs run by name) run vendor code as that user with STAMITY_NODE_BIN in the environment, so a compromised vendor release could overwrite the exact file a credential step later executes; the comment's 'nothing it wrote is RESOLVED there' is stronger than the mechanism; the only closure is one job per vendor on its own runner — the residual is stated in the workflow comment (softened to the mechanism by the fixer's last round) and needs a compromised vendor release plus a configured secret; one job per vendor on its own runner is a workflow redesign for the hygiene batch after 1.9.0, recorded for the morning after the secrets are set — inbox · source: /st-work · Ref: .stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl#2026-09-17_plugin-lifecycle/prove/252

Rows appended 2026-09-22 by the Package 15 session-4 run (the audit of session 3 for context-rot damage, the private-chain
rehearsal, the 1.9.0 release). Each is a `deferred` ledger row of `.stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl`;
the row id after `#` names it. Eight left this inbox on 2026-10-08 in the inbox pass, each with one line in
`.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Warning · .github/workflows/nightly.yml:275-283 · the four vendor CLIs are installed unpinned in nightly.yml and ci.yml (npm install -g with no version; curl | bash for Cursor), the nightly runs each with that vendor's secret in its environment, and the headless lane has no egress policy — before the nightly is enabled: pin each vendor's version (a currency policy the maintainer sets) and add an egress allowlist once every vendor endpoint is measured · source: /st-work · Ref: .stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl#2026-09-17_plugin-lifecycle/prove/296
- Minor · .stamity/evidence/browser-caec7fa.json:42 · the browser-evidence lane records the Chrome for Testing executable's absolute path (under the operator's home) into the committed evidence file; the two files on the tree are redacted to <home>/… by hand — the writer should redact the home prefix at the source, for the hygiene batch · source: /st-work · Ref: .stamity/runs/2026-09-17_plugin-lifecycle/ledger.jsonl#2026-09-17_plugin-lifecycle/prove/302

Rows appended 2026-09-24 by `/st-work` for plan 009 (Package 16 session 1, the orchestrator's context economy; the run
closed without a merge, pending the maintainer's QA sign-off and the replay). Each is a `deferred` ledger row of
`.stamity/runs/2026-09-23_orchestrator-context/ledger.jsonl`; the row id after `#` names it, and its rationale says why it waited.
The thirteen replay rows (build/172, 191, 194, 216, 218, 273, 327, 328, 347, 353, 355, 365, 366) left this inbox on
2026-09-29: the replay is retired (the maintainer's decision of that day), and each ledger row carries a dated
`retired` field. Thirty-two more left it on 2026-10-08 in the inbox pass, each with one line in
`.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · test/merge/writeEscape.test.ts · close-learnings: the raw-control-literal gate scans only src/**/*.ts, so no gate scans content/, scripts/, evals/ or .stamity/ for raw bidi or zero-width characters · source: /st-work · Ref: .stamity/runs/2026-09-23_orchestrator-context/ledger.jsonl#2026-09-23_orchestrator-context/build/358

Rows appended 2026-09-27 by `/st-work` for run 2026-09-24_enterprise-release (Package 16 session 2): every
ledger row the run deferred, each pointing back at its row, with the reason it was deferred. The REPLAY-v2 rows
move with the replay's own package (R5). Four of them (review/89, 138, 154, 163) left this inbox on 2026-09-29: the
replay is retired (the maintainer's decision of that day), and each ledger row carries a dated `retired` field. One more
(review/148, the apmDownstream cleanup timeout) left it on 2026-09-30, fixed by `sw12-flake-unit` of run
2026-09-30_optimization-sweep, with a dated `retired` field. Twenty-one more left it on 2026-10-08 in the inbox pass,
each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · evals/runs/2026-09-27-run-34/RESULTS.md:38 · the private eval driver writes a fallback trigger sentence ("the 1.8.0 release") into a full run's § 3 when prepare had no --why (runs 27 to 31 and 34 carry it); make --why required for a full run and drop the fallback, tests first (deferred: next eval increment) · source: /st-work · Ref: .stamity/runs/2026-09-24_enterprise-release/ledger.jsonl#2026-09-24_enterprise-release/review/204

Eighteen rows appended 2026-09-30 by `/st-work` for run 2026-09-30_optimization-sweep (Package 17 session 2, plan 013
files 2 and 3): every ledger row the run deferred, each pointing back at its row. One of them (the hygiene script's import of `./leak-gate.mjs`, build/26) left this inbox on
2026-10-01: the private layer keeps its own standalone copy of the script (it imports only Node built-ins), which
passed its run at that layer's session-2 close; refreshing that copy from this script must bring `leak-gate.mjs`
along. Its ledger row carries a dated `retired` field. Fourteen more left this inbox on 2026-10-08 in the inbox pass,
each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · src/cli/commands/init/plan.ts:275-281 · on a Windows init the venv probe is `<venv>/pyvenv.cfg`, which exists there too, so the plain-venv pins name `<venv>/bin/python`, a path absent on that host (`Scripts\python.exe`); probe the interpreter path the pin names, or render the Windows path, before writing the pins (the same layout gap as check's `.venv/bin` probe, review/78) · source: /st-work · Ref: .stamity/runs/2026-09-30_optimization-sweep/ledger.jsonl#2026-09-30_optimization-sweep/review/45
- Minor · src/cli/commands/check.ts:1278-1296 · a charter gate whose first word is a shell builtin or keyword (`cd`, `source`, `.`, `time`, `export`) is looked up as a file and reads unresolved, so a monorepo pin like `cd packages/api && npm test` draws a false advisory warning on every run; resolve the word after a leading `cd <dir> &&`, or skip the row for a builtin first word · source: /st-work · Ref: .stamity/runs/2026-09-30_optimization-sweep/ledger.jsonl#2026-09-30_optimization-sweep/review/77
- Minor · src/cli/commands/check.ts:1294 · on win32 the only venv directory probed is `.venv/bin`, so a Windows Python repository whose pytest lives in `.venv\Scripts` and not on PATH draws a false advisory warning; probe `Scripts` on win32 (the layout gap init's pins share, review/45) · source: /st-work · Ref: .stamity/runs/2026-09-30_optimization-sweep/ledger.jsonl#2026-09-30_optimization-sweep/review/78

Rows appended 2026-10-06 by the `/st-work` run 2026-10-03_pack-engine-defects (the four 1.11.0 pack-engine defects from
the `/st-debug` run 2026-10-03_debug-pack-defects, and the three init rows): every ledger row the run closed `deferred`,
each with its `Ref:`; the Copilot touchpoint gap the packs research found; and what the session's read-only audit of the
2026-10-01/02 work turned up that no record carried. Twenty-three of them left this inbox on 2026-10-08 in the inbox
pass, each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Warning · src/emit/ownership.ts:139-160 · in a plugin-backed repository pack commands, agents, rules and hooks are still dropped wherever the client's plugin owns their class (only pack skills come through since this run); `check`'s `pack-reach` row now reports it; making packs reach every route through the CLI belongs to the packs rework (one seam: an origin on the adapter rows, exempted in `withoutPluginOwnedRows`) · source: /st-work · Ref: .stamity/runs/2026-10-03_pack-engine-defects/record.md
- Minor · src/emit/planner.ts:931 · `validate` runs no cross-class name check, while `add` and `sync` do, so a clash first shows at `sync` · source: /st-work · Ref: .stamity/runs/2026-10-03_pack-engine-defects/ledger.jsonl#2026-10-03_pack-engine-defects/review/48
- Minor · src/cli/commands/validate.ts:608-625 · `validate` lists a full override of a pack skill as a shadow while `sync` refuses it (`src/emit/planner.ts:632-636`), and the creator agent (`content/agents/stamity-creator.md:27-29`) says `validate` reports whether an override took over; refuse it in `validate` as `sync` does · source: /st-work · Ref: .stamity/runs/2026-10-03_pack-engine-defects/record.md
- Minor · content/agents/stamity-creator.md:206-214 · the Refusals table has no row for a request to override or patch a pack skill, so the creator can still save a file `sync` refuses; a new row moves the eval case range `:141-258` · source: /st-work · Ref: .stamity/runs/2026-10-03_pack-engine-defects/ledger.jsonl#2026-10-03_pack-engine-defects/review/4
- Minor · docs/specs/overlay-layers.md:487-488 · REQ-OVERLAY-009's lead says every row of its table also makes `check` report drift "not evaluated"; for the new pack-skill overlay row that half is untested (`test/pack/packEngineDefects.test.ts`'s E cases pin only `sync` and `validate` exiting non-zero); add a `check` case · source: /st-work · Ref: .stamity/runs/2026-10-03_pack-engine-defects/ledger.jsonl#2026-10-03_pack-engine-defects/close/1

Rows appended 2026-10-06 by `/st-plan` for plan 016's amendment (the enterprise's updated brief: file 0,
`docs/plans/016-fork-distribution-00.md`, runs before Package 19 with the security fixes, and files `-01.md` to `-03.md`
are amended): the follow-ups the drafters found, the items the amendment leaves out with their revisit triggers, and one
row for Package 18's import recipe. Thirty-five of them, the import-recipe row among them, left this inbox on 2026-10-08
in the inbox pass, each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · src/manifest/ownedPaths.ts · inside the owned-path bound, a forged ledger row whose `contentHash` equals an owner's file at `.github/hooks/stamity.json` or a Cursor guard script still licenses a whole-file delete or a backup-free overwrite there (engine-specific names an owner rarely holds); add a byte proof per file when an owner reports one · source: /st-plan · Ref: docs/plans/016-fork-distribution-00.md
- Minor · package.json · the `st` alias prints a deprecation line from the release that carries plan 016 file 2's `u2-shrinkwrap`; remove the `st` bin, `src/st.ts` and its tsdown entry at 2.0.0, with a CHANGELOG line · source: /st-plan · Ref: docs/plans/016-fork-distribution-02.md

Rows appended 2026-10-06 from PR #85's review (the review bot's first pass on plan 016's amendment), read once and
not yet evaluated further, for the intake of the file each names. Five of them left this inbox on 2026-10-08 in the
inbox pass, each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Warning · docs/plans/016-fork-distribution-00.md:204 · inside the owned-path bound's content folders, a hand-authored file with an engine-style name (for example `.claude/skills/st-local/SKILL.md`) plus a forged ledger row carrying its easily computed hash still satisfies `u0-ledger-bound`'s path and hash proofs, so the reclaim would delete it; the committed manifest cannot prove authorship — keep such files unless their bytes match an engine rendering or carry a managed marker (comment 4200150189, reviewer P1, first read: valid; settle at file 0's intake) · source: pr-resolve #85

Rows appended 2026-10-08 at the close of plan 016 file 0 (runs `2026-10-07_security-fixes` and
`2026-10-07_release-1-12-0`); each is the maintainer's accepted "schedule" answer to the close question, with its
place and trigger. Fourteen of them left this inbox on 2026-10-08 in the inbox pass, each with one line in
`.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Warning · src/cli/engine/emissionWrite.ts:432-435 · known residual in 1.12.0: a forged ledger row at a Cursor guard name 1.11.0 wrote, plus a forged `coOwned` hash, removes an owner's hooks entry and script at that name with no `.bak`; place: decided with the in-bound byte-proof row above at plan 019 file 1's `t10-inbox-pass` (trigger: that session's opening question batch); files `src/manifest/ownedPaths.ts`, `src/cli/engine/emissionWrite.ts` · source: /st-work · Ref: .stamity/runs/2026-10-07_security-fixes/ledger.jsonl#2026-10-07_security-fixes/review/82
- Minor · src/manifest/ownedPaths.ts · known residual in 1.12.0: an owner file that copies the charter's four headings passes the structural proof, so a forged row with its hash licenses a delete there; place: with the in-bound byte-proof row at plan 019 file 1's `t10-inbox-pass`; files `src/manifest/ownedPaths.ts` · source: /st-work · Ref: .stamity/runs/2026-10-07_security-fixes/ledger.jsonl#2026-10-07_security-fixes/review/17
- Minor · src/cli/commands/sync/engine.ts:699-710 · `sync --dry-run --force` reads a forceable Copilot collision from disk, so its preview can say Kept where the forced run deletes; place: plan 019 file 1's `t10-inbox-pass`; files `src/cli/commands/sync/engine.ts` · source: /st-work · Ref: .stamity/runs/2026-10-07_security-fixes/ledger.jsonl#2026-10-07_security-fixes/build/62

Rows appended 2026-10-08 by the inbox pass (run `2026-10-08_inbox-pass`, plan 019 file 1's `t10-inbox-pass`): the
remainders of rows the pass otherwise settled, each re-filed as a `deferred` row of
`.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl`; the row id after `#` names it. Every row the pass removed has
its one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`. Row 306's remainder was re-filed after
the review of the pass's mechanics, since its decision kept the salvage mode's trigger alive.

- Minor · src/cli/commands/clean.ts:533-540 · after `clean --pack <id>` the hooks documents still name the removed pack's hooks until the next `sync` (the scripts are kept since `249f3fa7`, so no guard fails closed); re-render them in the same run, in `u1-import-config-round-trip`'s `clean --pack` re-plan (docs/plans/016-fork-distribution-01.md) · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/1
- Minor · src/runs/blocks.ts:17-18 · the ledger CLI refuses a whole findings block for one bad line and a whole closures block for one bad closure, so a run re-files the good rows by hand (inbox row 306's remainder; the rest fixed in `c419eab1`); place: its own trigger, the next run that re-files ledger rows by hand after a refused block, which takes a salvage mode keeping the good lines and naming the bad ones; files `src/runs/blocks.ts`, `src/cli/commands/ledger.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/2
