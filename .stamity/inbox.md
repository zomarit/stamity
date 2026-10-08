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
row for Package 18's import recipe. Thirty-six of them, the import-recipe row among them, left this inbox on 2026-10-08
in the inbox pass, each with one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`.

- Minor · package.json · the `st` alias prints a deprecation line from the release that carries plan 016 file 2's `u2-shrinkwrap`; remove the `st` bin, `src/st.ts` and its tsdown entry at 2.0.0, with a CHANGELOG line · source: /st-plan · Ref: docs/plans/016-fork-distribution-02.md

Rows appended 2026-10-08 by the inbox pass (run `2026-10-08_inbox-pass`, plan 019 file 1's `t10-inbox-pass`): the
remainders of rows the pass otherwise settled, each re-filed as a `deferred` row of
`.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl`; the row id after `#` names it. Every row the pass removed has
its one line in `.stamity/runs/2026-10-08_inbox-pass/inbox-retirements.md`. Row 306's remainder was re-filed after
the review of the pass's mechanics, since its decision kept the salvage mode's trigger alive. Row 519's residual (3)
was re-filed when row 519 left in the pass's part 2, since the fixes that settled the row leave it open; its
remainder at the current `stamity-` Cursor guards was re-filed after the branch review of run
`2026-10-08_maintainer-tooling`, for the same reason.

- Minor · src/cli/commands/clean.ts:533-540 · after `clean --pack <id>` the hooks documents still name the removed pack's hooks until the next `sync` (the scripts are kept since `249f3fa7`, so no guard fails closed); re-render them in the same run, in `u1-import-config-round-trip`'s `clean --pack` re-plan (docs/plans/016-fork-distribution-01.md) · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/1
- Minor · src/runs/blocks.ts:17-18 · the ledger CLI refuses a whole findings block for one bad line and a whole closures block for one bad closure, so a run re-files the good rows by hand (inbox row 306's remainder; the rest fixed in `c419eab1`); place: its own trigger, the next run that re-files ledger rows by hand after a refused block, which takes a salvage mode keeping the good lines and naming the bad ones; files `src/runs/blocks.ts`, `src/cli/commands/ledger.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/2
- Minor · src/manifest/codexConfigToml.ts:233-247 · a selected `[mcp_servers.<id>]` table and the bare `[mcp_servers]` table are proved by their `coOwned` record alone, so a forged record hashing an owner's bare `[mcp_servers]` lets `sync` refresh away the owner's servers written under it as dotted keys, with no `.bak` (inbox row 519's residual (3), named in `SECURITY.md`; the rest of the row fixed in `f50f5ce3`, `6dfed840`, `b8ecdff3`, `0889d018`); place: its own trigger, an owner's report of a server key lost to a refresh or the next change to `classify` there, whichever comes first, which takes a byte proof for those tables; files `src/manifest/codexConfigToml.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/3
- Minor · src/manifest/ownedPaths.ts:326 · `needsRenderingProof` leaves out the current `stamity-` Cursor guard scripts, so a delete there still rests on the recorded hash alone and a forged row hashing an owner's file at a guard name lets `sync` or `clean` delete it (inbox row 519's remainder at the current guards, named in `SECURITY.md`; the rest of the row fixed in `f50f5ce3`, `6dfed840`, `b8ecdff3`, `0889d018`); place: Package 20 file 1's intake (docs/plans/016-fork-distribution-01.md, its inbox fold table), beside a machine-local record of the hashes this checkout's engine wrote, which closes this remainder and the backup-free overwrite residual together; files `src/manifest/ownedPaths.ts`, `src/merge/reclaim.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_inbox-pass/ledger.jsonl#2026-10-08_inbox-pass/pass/4

Rows appended 2026-10-08 by the run `2026-10-08_maintainer-tooling` (plan 019 file 1, pull request #92), each a
`deferred` row of `.stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl` that the run's close question scheduled
to the place it names; the row id after `#` names it.

- Minor · scripts/plugins/setupCommand.mjs:172-174 · the plugin package's `st-setup` command body still gives the route out of a generated setup as `clean -y`, then `plugin setup`, without the leading `sync` the CLI now prints, and the adversarial case `st-setup-refuses-generated-setup` inlines that body; place: plan 019 file 2 (model-facing text); files `scripts/plugins/setupCommand.mjs`, `evals/cases-v6/adversarial/st-setup-refuses-generated-setup.md`, `evals/SET-v7.md` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/build/75
- Minor · scripts/ci/pr-proven.mjs:82-96 · a head with two `ci.yml` pull-request runs (a reopened pull request) carries the older run's `all-ci-checks` in a second check suite, so the merge push reads not proven and runs full CI (safe, only slower); place: plan 014 file 2's `r5-ci-records-job` (docs/plans/014-lean-repository-02.md), accepting every `ci.yml` pull-request run's suite on the head with the newest run deciding; files `scripts/ci/pr-proven.mjs`, `test/ci/prProven.test.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/review/130
- Warning · .github/workflows/ci.yml:439-457 · a pull request that changes the website and code builds the docs site twice, in `docs-site.yml` and on the LTS leg; place: plan 014 file 2's `r5-ci-records-job`, narrowing `docs-site.yml`'s pull-request build now that `all-ci-checks` gates the site; files `.github/workflows/docs-site.yml`, `test/ci/workflow.test.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/review/124
- Warning · src/merge/safeWrite.ts:1055-1061 · a recovering overwrite of a charter or Copilot's hooks file starts three git processes per file, so an upgrade that rewrites N charters in a monorepo spawns 3N; place: Package 20 file 1 (docs/plans/016-fork-distribution-01.md), beside the machine-local record of the hashes this checkout's engine wrote (the place of `pass/4` above), which would replace these git checks and let a monorepo-subfolder setup trust its parent repository instead of always taking a `.bak`; files `src/merge/safeWrite.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/review/123
- Minor · src/cli/commands/sync/engine.ts · in `hookDocumentsAfterWrite`'s unforced branch, a symlinked hooks file that is not a collision may preview a delete the run does not make (older, unverified, harmless); place: its trigger, the next change to that branch, which first checks it with a symlinked hooks file; files `src/cli/commands/sync/engine.ts`, `test/cli/commands/syncEngine.test.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/build/61
- Minor · test/ci/pluginLifecycle.test.ts · the Claude walk's 600 s budget (`WALK_MS`) is unchanged though a second skill listing can now run; place: Package 19 step 2, which diagnoses the Claude walk and measures the budget; files `test/ci/pluginLifecycle.test.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/build/11
- Minor · test/ci/pluginLifecycle.test.ts:1561-1563 · the Claude walk's only `st-work` check is the model's listing, which a retry draws twice; place: Package 19 step 2, adding a file check on the plugin tree's `skills/st-work/SKILL.md`; files `test/ci/pluginLifecycle.test.ts` · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/review/13
- Minor · .github/workflows/ci.yml · the `lanes` job's 20-minute timeout is not yet measured on a runner; place: its trigger, the first website-only or learnings-only pull request after the merge (QA row 2); files `.github/workflows/ci.yml` if it fails · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/build/19
- Minor · scripts/ci/records-only.mjs:84-105 · the `lanes` job never ran on pull request #92, so the website lane's suite list and the learnings lane's build order rest on the census and the static pins; place: its trigger, the first website-only or learnings-only pull request after the merge (QA row 2); files `scripts/ci/records-only.mjs`, `.github/workflows/ci.yml` if it fails · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/review/131
- Minor · .github/dependabot.yml · the security groups are checked offline only; place: its trigger, the first grouped Dependabot security pull request, which shows GitHub applies them; files `.github/dependabot.yml` if not · source: /st-work · Ref: .stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl#2026-10-08_maintainer-tooling/build/22
