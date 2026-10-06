# Run 2026-10-06_rehearsal-bounded-content — the pack signing rehearsal's bounded input carries the corpus

Status: closed — merged to `main` by fast-forward as PR #78 (`d85bb76e`, 2026-10-06T11:54:34Z), without a release; the push run of the Pack signing rehearsal on `d85bb76e` green; ledger 4 rows, 0 open
Plan: .stamity/runs/2026-10-06_rehearsal-bounded-content/plan.md
Invocation: /st-work Fix the pack signing rehearsal on main, red since 1fa55344 (run 37450946980): its verify job extracts a bounded source tree with no content/, and since PR #77 planPackInstall runs the cross-class name check, which reads the bundled corpus and throws "Bundled content not found". Add content to the rehearsal's archived input (the workflow's archive line and the script's prepare list), with a test that fails while the bounded input lacks the corpus. Carried from /st-quick, refused at its Security-sensitive surface row (credential handling: the sign job extracts the same archive while it holds id-token: write).
Intensity: standard — three files, about 30 lines, but the change widens the input of a job that holds a signing credential; the security lens runs on the trigger-path match, and the one review is the final review before a merge, at Fable 5.1
Confidence gate: medium
Isolation: one manual worktree lane outside the checkout (`rehearsal`, branch `fix/rehearsal-bounded-content` from `main` at `c48bace2`, `node_modules` symlinked); one unit, so nothing runs in parallel
Opened: 2026-10-06T11:33Z

## Frame (Phase 0)

**Outcome.** The push-to-`main` signing rehearsal passes again: its `verify` job finds the corpus that `planPackInstall`'s
name check reads. A test fails while the archived input lacks the corpus.

In scope:
- `content` added to the archive the `prepare` job builds (`.github/workflows/pack-signing-rehearsal.yml`, the "Archive
  only reviewed input paths" step) and to the `git ls-files` list `prepare` hashes into `inputs.json`
  (`scripts/pack-signing-rehearsal.mjs`), so the receipt names every archived input;
- a test in `test/ci/packSigningRehearsal.test.ts` that runs the rehearsal's `verify` from a tree holding only what the
  workflow archives, with the local witness the existing test uses.

Out of scope:
- the workflow's `paths:` filter (`.stamity/inbox.md:31`, a plan-level decision left in the inbox);
- any change to `planPackInstall` or the name check: a published install always carries `dist/content`, so the check is
  right to need the corpus;
- the push runs' other workflows.

**How it was found.** The close of run `2026-10-03_pack-engine-defects` read `main`'s push runs after the merge. The
rehearsal's `verify` job failed at 10:39:34Z with its generic line. The run's own artifacts (`signing-input`,
`signed-packs`) were downloaded and extracted as the job does, and the script's `verify` was run with the run's context:
- the swallowed error is `EngineError: Bundled content not found`, `code: CONFIG_ERROR`;
- the stack: `resolveBundledContentRoot` ← `buildContentIndex` (`src/content/catalog.ts:883`) ← `collectNameClashes`
  (`src/pack/install.ts:899`) ← `planPackInstall` (`src/pack/install.ts:1218`) ← the script's `verify`;
- with `content/` at `1fa55344` added to that extracted tree, the same `verify` passed against the real Sigstore bundles.

The last green rehearsal ran on `3fd0db4b` (2026-10-01), before the name check existed. PR checks never run the
rehearsal (`on: push`, `main` only), and the local test runs `verify` from the full checkout, where `content/` is
present.

**Deferral inbox (step 4).** `:31` (the `paths:` filter leaves archived scripts outside it) overlaps the workflow file;
not settled here, left in the inbox. `:39` touches the test file for an unrelated reason; left.

**Spawn plan and cost (step 3).**

| Phase | Role | Count | Class |
|---|---|---|---|
| Build | implementer | 1 | Opus 5.5 |
| Prove | test-runner | 1 to 2 | Opus 5.5 |
| Prove | security lens | 1 | Opus 5.5 |
| Prove | reviewer (the final review before the merge) | 1, plus a re-review if needed | Fable 5.1 |

Order of magnitude: five spawns, under a million sub-agent tokens; wall clock is the full gate and CI.

**Understand (Phase 1).** No researcher. The cause was reproduced from the failing run's own artifacts above. The one
open question, which other files read the archive's path list, goes into the unit's brief.

## Plan (Phase 2)

`plan.md` beside this record: one unit, `u1-rehearsal-content`, implementing REQ-FINISH-005's restored push-run proof.
- **Plan-artifact intake:** no `docs/plans/` artifact covers this request, so the plan is in-flow.
- **Contract census:** one unit, no peer.
- **Plan gate:** execute now. The maintainer's answer (2026-10-06, "Fix it now (Recommended)") named this exact
  change: `content/` added to the trimmed input in the workflow's archive line and the script's input list, a test that
  fails without it, the security lens and a review, PR CI, then a fast-forward to `main` once green.

## Build (Phase 3)

- 11:33Z: `u1-rehearsal-content` dispatched to an implementer at Opus 5.5 in the `rehearsal` lane.
- **u1-rehearsal-content.** DONE (report 11:39Z).
  - `content` was added to the archive's `tar` list and to `prepare`'s `git ls-files` list.
  - Two new cases:
    - `verify` run from a tree that holds only the paths the parsed workflow archives, with `node_modules` linked as
      a junction and the existing local witness;
    - a guard that the receipt's paths and the archive's paths stay in step.
  - The witness moved, unchanged, into shared helpers (`TEST CHANGE, justified`).
  - Red first: the new `verify` case failed with "Bundled content not found", the same stack as the reproduction. The
    guard also fails when `content` leaves the script's list only.
  - Gates: build, the rehearsal and architecture tests (47 passed), typecheck, knip and the leak gate all exit 0.
    Lint first exited 1 on four errors in the new test, fixed inline; it now exits 0, with the one warning that
    predates this run.
  - Census: `clean`. No other reader of the archive's path list or of this `inputs.json`; the other `inputs.json`
    hits are the eval runner's own file of that name.
  - One Minor, `build/1`: the guard reads `prepare`'s list by parsing the script's text, because the unit adds no
    export. A reshaped call makes the test throw by name.
- **Committed** as `d85bb76e` and pushed. PR #78 opened as a draft at 11:41Z.
- **Prove, 11:40Z.** Dispatched in parallel:
  - the security lens, at Opus 5.5, on the trigger-path match: the `sign` job's archive;
  - the final review before the merge, at Fable 5.1;
  - the full local gate in the lane, at Opus 5.5, alone among live checks, with `STAMITY_CLAUDE_BIN` unset as the
    ops-pack run recorded.
- **Security lens** (report 11:42Z): posted, no findings.
  - The `sign` job runs one command, whose `sign` action loads only `src/pack/sign.ts` and builtins. That import graph
    reaches neither `contentRoot.ts` nor `catalog.ts`, so nothing reads `content/` while the token is held.
  - The digest is taken after `content` joins the archive. Both jobs check it before extracting with `filter='data'`.
  - Permissions, egress lists, pinned actions and the absence of a checkout in `sign` are unchanged.
  - Not a finding: the `paths:` filter still leaves out `content/**`. That is the plan's out-of-scope row, and inbox
    `:31` covers the same filter.
- **Final review at Fable 5.1** (report 11:46Z): approve, confidence medium, which meets the gate.
  - Every cell of the unit holds on the diff.
  - On the base, `verify` from the archived tree throws the stated error with no catch on that path.
  - The lifted witness helpers match the old lines character for character, with all five round-trip assertions
    kept.
  - Three Minors, ledgered:
    - `review/1`: the guard's text parse. A duplicate of `build/1`, closed `rejected`. `build/1` itself is closed
      `rejected` by the plan's no-export interface: a reshaped call fails loudly.
    - `review/2`: junction removal on Windows is unverified. It stays open until PR #78's Windows legs report.
    - `review/3`: the test borrows the dev `node_modules`, while `prepare` installs production dependencies only.
      Closed `rejected` as predating this change; the push run proves the production set.
- **Full gate on `d85bb76e`** (test-runner, the `rehearsal` lane, alone, each gate once as written;
  `STAMITY_CLAUDE_BIN` unset; report 11:53Z): every gate passes.
  - The suite: 10,795 passed, none failing, 14 skipped. The rehearsal file passed 15 of 15. The Cursor, Copilot and
    Codex walks pass.
  - Coverage: no "does not meet" line.
  - `check`, knip and the leak gate pass.
- **PR CI on `d85bb76e`** (run 37458048795, with `PR checks` 37458048873): green on every leg, both Windows shards
  included. `review/2` closed `rejected`, not a defect: the test, junction included, ran green on both shards.
- **Ledger:** 4 rows, all Minors, all `rejected` with reasons, 0 open.

## QA checkpoint (2026-10-06)

Built with st-qa by name. The change is CI configuration, a script and tests. There is no user-facing surface, so
browser evidence does not apply. Four rows were derived:
- two from the config trigger: the archive list's first run, and the update leg over an installed revision;
- one from the security trigger: the archive enters the job that holds the signing token;
- one for the receipt list.

All four are auto-proven, and none needed a person.

| # | Scenario | Steps | Expected | Risk | Minutes | Proof |
|---|---|---|---|---|---|---|
| 2 | A push to `main` that touches the rehearsal's inputs passes the Pack signing rehearsal | After #78's merge, open the repository's Actions tab, then the workflow "Pack signing rehearsal", then the run on `d85bb76e`; wait for it to finish (about 7 minutes) | `prepare`, `sign` and `verify` each succeed; the `verify` log ends "pack-signing-rehearsal: verify passed" | M | 9 | auto-proven: push run 37459556084 on `d85bb76e`, conclusion success; `verify passed` at 12:01:23Z |

**Appendix: auto-proven rows.** Each rests on the full gate on `d85bb76e` (`env -u STAMITY_CLAUDE_BIN npx vitest run`,
pass, 10,795 passed) and on PR CI on every leg. Line numbers are at `d85bb76e`.

| # | Scenario | Risk | Evidence |
|---|---|---|---|
| 1 | A tampered pack is refused from the archived tree: changed bytes, changed payload, wrong identity, malformed bundle, stale update signature | H | `test/ci/packSigningRehearsal.test.ts:334` (five refusals) in the case at `:313`; the push run's `verify` (`scripts/pack-signing-rehearsal.mjs:82-107`, every negative asserted) |
| 3 | Revision 2 installs over the installed revision 1 from the archived tree | M | `test/ci/packSigningRehearsal.test.ts:335` (two installs) in the case at `:313`; the push run's `verify` |
| 4 | The receipt names every source path the archive carries | L | `test/ci/packSigningRehearsal.test.ts:304` |

All 4 rows are auto-proven.

**Sign-off** — the signing rehearsal's archived input, 2026-10-06:

- [x] Every H row walked or auto-proven, and passing: row 1 is auto-proven.
- [x] Every failing M row has a filed follow-up, linked: none fails.
- L failures are recorded, not blocking: none.
- Rollback: `git revert --no-edit d85bb76e` in a pull request. The rehearsal then fails again; the product is unaffected
  either way.
- Shippable: YES. No H row is accepted unwalked.

## Close (2026-10-06)

- **The merge.** `main` was fast-forwarded from `c48bace2` to `d85bb76e` under the admin bypass at 11:54:34Z, after PR
  CI passed. PR #78 reads MERGED at 11:54:34Z, with `d85bb76e` as its merge commit. This was the maintainer's answer
  "Fix it now (Recommended)", which named the fast-forward once green. No tag, no publish.
- **The push run that is the fix's proof:** the Pack signing rehearsal on `d85bb76e` (run 37459556084, started
  11:54:36Z).
  - `prepare` passed at 11:55:30Z, `sign` at 11:56:41Z and `verify` at 12:01:23Z, against the real signing service.
  - The red run 37450946980 on `1fa55344` is superseded.
- **The learning** `a-merge-to-main-is-proven-by-its-push-runs`, captured through `learn capture`, with `reviewBy` and
  `validatedAgainst`. `check` reads 18 learnings, all valid.
- **Measurements.** Today's snapshot `evals/measurements/merge-ready-2026-10-06.json` was written at the earlier close
  and is never rewritten on the same day, so the page stays byte-stable. This run reaches the next day's snapshot.

## Proof block (2026-10-06 — merged to `main` by fast-forward, without a release)

- **Candidate and merge.** `d85bb76e` on `fix/rehearsal-bounded-content` (PR #78): one commit, three files over `main`
  `c48bace2` (+135 / −33). `main` was fast-forwarded to it at 11:54:34Z, after PR CI passed (this record's Close
  section).
- **Build isolation.** One manual worktree lane, `rehearsal`, declared at Frame. One unit, nothing in parallel.
- **Gates.** The gate of record is the full gate on `d85bb76e`, the merged tree; this run's records add nothing outside
  `.stamity/`.

  Gate results (the full gate of record on `d85bb76e`):

  | Gate | Command | Result |
  |---|---|---|
  | build | `npm run build` | pass |
  | lint | `npm run lint` | pass (the one known warning, `content/skills/st-verify/scripts/spec-plan-coverage.mjs:1`) |
  | typecheck | `npm run typecheck` | pass |
  | suite | `env -u STAMITY_CLAUDE_BIN npx vitest run` (JSON reporter) | pass: 10,795 passed, none failing, 14 skipped; `packSigningRehearsal` 15 of 15; the Cursor, Copilot and Codex walks pass |
  | coverage | `env -u STAMITY_CLAUDE_BIN npm test -- --coverage` | pass: no "does not meet" line; 96.76% statements, 90.31% branches |
  | drift | `node dist/cli.js check` | pass: setup green, drift clean |
  | unused code | `npx knip` | pass |
  | leak gate | `node scripts/leak-gate.mjs` | pass: 0 hits for 19 rules across 1,741 files |
  | PR CI | run 37458048795, `PR checks` 37458048873 | pass on every leg, both Windows shards included |
  | push run | Pack signing rehearsal 37459556084 on `d85bb76e` | pass: `prepare`, `sign` and `verify`, against the real signing service |

- **The fix's proof.**
  - The new `verify` case failed with "Bundled content not found" on the base and passes on `d85bb76e`.
  - The red run 37450946980 was reproduced from its own artifacts, and passed with `content/` added.
  - The push run on the merge commit is green.
- **Review verdicts.** The record declares `Confidence gate: medium`.

  Review verdicts, per round (each round a fresh spawn):

  | Pass | Round | Model | Verdict | Confidence | Where |
  |---|---|---|---|---|---|
  | u1-rehearsal-content, the final review before the merge | 1 | Fable 5.1 | approve | medium | record.md:99-109 |

- **The specialist pass.** The standard tier runs the security lens on a trigger-path match. It ran on the `sign` job's
  archive and posted 0 findings (record.md:92-98). No other lens's surface was touched.
- **Security.** Nothing the `sign` job runs reads the corpus while the token is held. The digest checks, the `data`
  extraction filter, permissions, egress lists and pinned actions are unchanged.
- **QA checkpoint.** 4 rows, all auto-proven, the H row among them. Shippable: YES. Browser evidence does not apply.
- **Decisions trace.** The maintainer's answer (2026-10-06): "Fix it now (Recommended)". It covered the change, the
  security lens and a review, PR CI, and the fast-forward once green. Earlier, `/st-quick` refused the item at its
  Security-sensitive surface row (credential handling), and the item moved here intact. The orchestrator closed
  `build/1` and `review/1`–`review/3` (record.md:99-109, and the PR CI line above).
- **Ledger.** `ledger.jsonl`: 4 rows, 0 open, all Minors, all `rejected` with reasons.
- **Learnings.** One captured: `a-merge-to-main-is-proven-by-its-push-runs`.
- **Artifacts touched** (path, then its owner):

  | Path | Owner |
  |---|---|
  | `.github/workflows/pack-signing-rehearsal.yml`, `scripts/pack-signing-rehearsal.mjs`, `test/ci/packSigningRehearsal.test.ts` | the implementer |
  | `record.md`, `plan.md`, `ledger.jsonl` | the orchestrator, through the file tools and the ledger CLI |
  | `.stamity/learnings/a-merge-to-main-is-proven-by-its-push-runs.md` | the orchestrator, through `learn capture` |

- **Per-action attribution.**

  | Role | Model | Tool and surface | Outcome |
  |---|---|---|---|
  | implementer | Opus 5.5 | the `rehearsal` lane | the unit, red then green |
  | security lens | Opus 5.5 | read-only | 0 findings |
  | reviewer, the final review before the merge | Fable 5.1 | read-only | approve, medium |
  | test-runner | Opus 5.5 | the `rehearsal` lane, each gate once | the full gate above |
  | orchestrator | the session, Opus 5.5 | the reproduction, `stamity ledger`, the question tool, st-qa | sign-offs, the merge, this close |

- **Process slips, recorded:**
  - Two time stamps were first written ahead of the clock or off by minutes (the dispatch and the security report), and
    were corrected from `date -u` and the report's time before commit.
  - The reports folder's `.gitignore` in the main checkout was written with a shell redirect, not the file tools.
- **Recommended next step.** Package 19, plan 015: `/st-board` writes by default, in a fresh session. Its kickoff is
  ready.
