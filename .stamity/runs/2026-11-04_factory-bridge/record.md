# Run record: the factory bridge, file 1

Status: closed 2026-11-05
Mode: attended
Branch: feat/factory-bridge
Plan: docs/plans/023-factory-bridge-01.md
Base: 2ce31e5a9fe3e5e302b47cc7f92cd4fed655665a
Invocation: /st-work docs/plans/023-factory-bridge-01.md
Confidence gate: medium
Effort: deep

## Frame

An item a product person marks ready should go through to a merged pull request with nobody watching, on Claude and on
Cursor, locally and in their clouds. In scope: the 14 units of the plan. Out of scope: file 2's units, new pack work, the
deep audit engine and the new brand. The operator answered at the start and is away, so each declared default is taken.

Model plan: implementers, reviewers, lenses and fixers on Opus 5.5 at high; researchers at medium; the whole-branch review
once on the frontier class. Isolation: a git worktree per unit, under the worktree farm, with one writer per file.

## Blast radius

Wide: the guard's baked setting, the pre-flight's wall, the land evidence and its second caller, `run end` and the manifest
schema. Each new setting is off by default, and with all of them off the guard's bytes do not move. The null-resolver count and
the new thread line reach every session `run land`, with `landJob` off too; both fail closed. The last rounds moved pages, one help
string and one skill reference: what a reader expects, not what a land does.

The cheapest real test of what remains: one scratch-repository job that closes a tool's thread and reads back `resolvedBy`, on a
squash-only repository, and one `decideLand` row per review-tool state asserting `refused` with `--approved` given.

## Decisions

- Default applied: plan gate → option 1, execute now (persisted plan docs/plans/023-factory-bridge-01.md)
- Freshness guard: fresh, stamped at this run's base.
- Deferral inbox: 248 rows, 6 overlap the plan's files; none is settled by the plan, so all stay in the inbox.
- Signed off (review/1, review/2): a board summary is written for the board, and only an item with a plan carries a summary, `Branch:` and `Plan:`.
- Signed off (`settings`): `classifyRange` is a new read of committed objects, not a move, so it became the unit `change-range`.
- Signed off (build/3): the logic budget moved to 2.875 MiB, with a dated reason.
- Signed off (review/13, review/14): raising `reviewTool.rounds` or `waitMinutes` is a loosening, and the strictest read takes the lowest.
- Signed off (review/15): `run land` reads the baked guard as a fourth leg, and a land that loosens a key names the key.
- Signed off (review/37): no leg wins. Legs that name different review tools go to a person through an ask.
- Signed off (review/17, review/18): a review block counts only if its comment's last editor is the tool, exactly one trusted comment carries the marker, and the tool's own `+1` is on the pull request.
- Signed off (review/22, review/26): under auto-ship a `docs`-class path must end in `.md` or `.txt`; a script inside a `.md` file is a stated limit, named in the docs.
- Signed off (review/28 to review/31): `run contract` proves the issue is open and labelled, and that its author and last label applier hold write or admin; it refuses another repository, and strips and deny-scans the criteria. The hash detects drift only.
- Signed off (review/43): a comment opener with no closer refuses, anywhere above the links; each dropped comment is counted, and a run that sees one refuses to start, with a row naming the count and the fix.
- Signed off (review/39, review/40): `classifyRange` pins the system and user attribute files off, and reads `complete: false` on a non-empty git-dir attributes file or a gitlink, so the land asks.
- Signed off (build/28): the tool named in `autonomy.reviewTool` has standing for its own findings only, bounded by the pull request's files and the plan's; every other non-write author stays refused. A person should read this before the merge.
- Signed off (review/58 to review/60, review/62): the `asks.pending` retry is bounded by the tool's wait; the loop passes `--unattended`; a held row ends the loop, as a principle.
- Signed off (build/29, review/61): `run land` resolves only threads the tool opened and no person joined, only on `clean` on the exact head; while `waiting` they are a pending gap.
- Signed off (review/4, review/5): a run belongs to a release by dates, from `CHANGELOG.md` and the run id, for every run of record.
- Departs from the plan (review/86): the land job's concurrency group is per pull request, not one `stamity-land` group, so a wait on one pull request holds no other.
- Departs from the plan (review/86): a job posts the review tool's request itself and waits within its time limit, where the plan said it does nothing while evidence is pending.
- Signed off (review/82, review/122): a job's merge method is one the ruleset and the repository both allow; a linear-history rule removes merge. A rule the token cannot read still ends on a hold reading HTTP 405.
- Signed off (review/119): a thread closed with no resolver named counts as closed over a person's comment, in every `run land`, not only a job's.
- Signed off (review/121): a job exits 0 on each normal end and shows a hold as a status line; a hold that cannot write its line exits 1.
- Signed off: a job stays quiet on a pull request that is not the run's own, which is stated in `docs/troubleshooting.md`.
- Signed off (whole-branch review, round 2): the pages narrow to what is true: `/st-work --resume` on a person's clone cannot land a cloud run, since that clone holds neither record. Changing the walk is product work, scheduled in plan file 2's follow-ups.

## Contract census

`settings` owns the shared contract and runs alone first: `AutonomyConfig`, `ResolvedAutonomy`, `GuardAutonomy`, the marker
and `const AUTONOMY`, `loosens`, `strictestAutonomy`, the moved `readSetting` and `classifyRange`. `land-wiring` owns
`LandInput`, `decideLand`, `LandPr`. Later units consume these and own none. `board-item` and `release-speed` share no contract with it.

## Log

- 2026-11-05T09:33Z usage: the whole run minutes=unreported tokens=unreported (Claude Code): per-phase usage lines were not kept on this run.
- 2026-11-05T09:33Z capacity: none. No role stopped on a limit.
- 2026-11-05T09:33Z leftovers: shown=18 real=4 fixed=2 scheduled=8 dropped=8 accepted=8 notes=unknown changed=0

## QA

Class `security-sensitive`, lens `stamity-security`. 13 rows derived, 10 auto-proven, 3 left for a person.

Auto-proven, each by the final tree's full gate (`lockf -k /tmp/stamity-machine.lock node scripts/ci/test-run.mjs --coverage`, exit 0) and the assertion named:

- Security-negative, the job's flag on an agent's line is refused: `test/hooks/personOnlyGuard.test.ts:2058`, `:2073`.
- Security-negative, `--approved` is refused in an unattended run and in a job: `test/cli/commands/runLand.test.ts:1090`, `:3015`.
- Security-negative, an administrator under a rule it could lift is refused without the opt-in: `test/runs/preflight.test.ts:276`.
- With every new setting off, the guard's text names none of them: `test/cli/engine/autonomyGate.test.ts:579`.
- First run, no workflow is written with the setting off: the case `emits nothing with the setting off` in `test/adapters/landWorkflow.test.ts`.
- Upgrade over existing state, a loosening names the `sync --loosen` line: `test/cli/commands/config.test.ts:2357`.
- The brake asks while a required check fails on the tip, and merges nothing: `test/cli/commands/runLand.test.ts:1202`.
- A silent review tool holds: `test/runs/reviewTool.test.ts:261`.
- Auto-ship holds at its limits and names both reasons over them: `test/change/autoShip.test.ts:41`, `:101`.
- A ready item writes a contract `plan check --contract` passes: `test/cli/commands/runContract.test.ts:213`.

Each of these three needs a real account, so a person walks them. None has been walked.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 1 | A ready item on Claude's scheduled task reaches a merge | On the scratch repository, with the guide's Steps 1 to 7 and 9 done, add `stamity:ready` to the prepared issue | A session starts, opens a draft from the item's branch, and the land job merges it | H | 30 | [ ] open |
| 2 | A ready item on Cursor's automation reaches a merge | With Step 8 done, add `stamity:ready` to a second prepared issue | A session starts, opens a draft, and the run or the land job merges it | H | 30 | [ ] open |
| 3 | A real administrator passes only under a rule with no bypass | On a clone of the scratch repository with `autonomy.adminRuleProof` on, run `gate preflight --unattended --dry-run` with the ruleset on, then with the bypass list set | `direct-push` reads `pass` with an `admin-can-lift` warning, then refuses | H | 5 | [ ] open |

**Sign-off** — the factory bridge, file 1, 2026-11-05

- [ ] Every H row walked or auto-proven, and passing.
- [ ] Every failing M row has a filed follow-up, linked.
- L failures are recorded, not blocking.
- Rollback: `git revert` of the merged range, and every new setting is off by default.
- Shippable: not signed. Rows 1 to 3 are open, and the next session's cut waits on them.

## Proof block

Gate results — class `security-sensitive`, base `2ce31e5a`, final tree `04966e3a`:

- scan: `node dist/cli.js gate scan --base 2ce31e5a`, pass, exit 0, no hits, 111 files scanned, none unscanned.
- classify: `node dist/cli.js gate classify --base 2ce31e5a --json`, pass, exit 0.
- leak gate: `npm run gate`, pass, exit 0, 0 hits across 1,507 files.
- lint: `npm run lint`, pass, exit 0, 0 errors, 1 old warning.
- typecheck: `npm run typecheck`, pass, exit 0.
- test: `lockf -k /tmp/stamity-machine.lock node scripts/ci/test-run.mjs --coverage`, pass, exit 0, 337 files, 20,430 tests passed, 19 skipped, floors met (statements 96.59%, branches 90.62%, functions 98.92%, lines 97.82%), no re-run.
- knip: `npm run knip`, pass, exit 0.
- hygiene: `node scripts/repo-hygiene.mjs --base 2ce31e5a9fe3e5e302b47cc7f92cd4fed655665a`, pass, exit 0.
- records: `npm run test:records` ran in CI's `records` job, not locally. CI on `04966e3a`: 21 passed, 3 skipped, `CLEAN`, both Windows legs, both fork probes and the records job included.

One earlier gate, on `77a38ff3`, was red: `test/hooks/portableRunner.test.ts` hung for 31 minutes in a `spawnSync` with no time limit, with the suite at 0% CPU, and that case failed when the stuck child was stopped by its PID. The same case passed on the trees before and after it, so this is read as a rare stall, one occurrence, not proven. The fix is scheduled in the next session's work.

Review verdicts:

- Each unit: reviewed to an approval or to the cap, the land job's last round an approve at medium, the factory guide's and the docs' rows closed in the whole-branch rounds.
- Whole-branch, on the frontier class: request-changes at medium, then two closure rounds on Opus 5.5: request-changes at medium, and an approve at high in the cap round, its fixer one effort step up. Rests on: no page tells a person their clone lands a cloud run, and each route the new section names reaches code that does what the sentence says, walked.
- The pull request's review bot, on `04966e3a`: completed on the exact head, its `+1` given, no comment, no thread.

Ledger: 178 rows. 161 fixed, 9 rejected with reasons, 8 deferred. None open.

Decisions trace: under Decisions above.

Not done:

- No real cloud run has happened: every route in `docs/factory.md` reads `not run`, and QA rows 1 to 3 are open.
- Scheduled in `docs/plans/023-factory-bridge-02.md`, Follow-ups: the safety measure's driver and its partial-miss check (build/5, review/9); a failed run-end notice said on the pull request (review/73); what a real run reads for an administrator, the webhook's key and the setup line (build/14, build/41, review/114); a person's clone landing a cloud run (build/43, build/44).
- Accepted, each stated in the docs: review/12, review/20, review/26, build/22, review/57, build/31, review/89, build/37.
- The evals were written, not run: no eval run of record on this tree.

Recommended next step: the next session's opening batch, then its units on top of this branch, and the real runs before the cut.
