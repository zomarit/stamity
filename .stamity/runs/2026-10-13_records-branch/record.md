# Run 2026-10-13_records-branch — Package 18: a lean repository, file 2 (plan 014): the records move to their own branch

Status: closed — merged as pull request #101 (2026-10-14 at c96c7146); the records live on the `records` branch
Plan: docs/plans/014-lean-repository-02.md, re-planned in-flow by .stamity/runs/2026-10-13_records-branch/plan.md (freshness guard: stale; every unit's anchors moved, and plan 019 file 1 reshaped the CI lane it retires)
Base: 5284eaaae829506f8f28312e697fa02af138fabb (pull request #100's final head; this run's branch `records-branch` stacks on it, opening answer 3)
Invocation: /st-work docs/plans/014-lean-repository-02.md — Package 18, run overnight and unattended on the opening batch's answers; re-plan in-flow with the persisted plan as input; the session passes the plan gate; `r0`–`r5` tonight, `r6`–`r8` and pull request 2's first push wait for the maintainer.
Confidence gate: medium
Intensity: deep (a new records branch and its publishing script, the CI job that blocks merges, the test suite split in two)
Isolation: one git worktree per lane under ~/Projects/zomarit/.stamity-worktrees/stamity/ (named at dispatch), node_modules symlinked to the main checkout; one writer per lane; no lane runs `git stash`; lanes write no records

The session's opening answers, sign-offs and morning note are in `.stamity/runs/2026-10-13_lean-repository/record.md`.

## Frame

- **Outcome:** the repository's records leave `main` for an orphan `records` branch at the same paths, with `main`
  working when no record is present (`npm test` reads none; a records suite runs where they are restored), the
  measurements page and the hand pages linking into the branch, `scripts/records.mjs` publishing and restoring them,
  and CI's canonical `records` job blocking merges — the npm package, the plugin distribution and the CLI unchanged.
  Tonight `r0`–`r5`; the outward steps `r6`–`r8` wait for the maintainer. Out of scope: file 1, any product change,
  a release, the persisted drop list.
- **The inbox (Frame step 4, 22:37Z):** `stamity ledger inbox --plan docs/plans/014-lean-repository-02.md --paths
  <file 2's files>`: 148 rows, 33 matched, 0 unparsed, 0 skipped. Settled by this plan: line 104 and line 105 (placed
  in `r5` by an earlier close; folded as `r5b`), line 133 (its trigger is the next change to
  `scripts/ci/records-only.mjs`, which `r5` makes; folded into `r5`), line 193 (`r1`'s edge case: the inbox parser now
  lives in `src/runs/inboxStore.ts`; folded into `r1`), line 195 (the `records_only` output's leaving: `r5` removes
  it) and line 247 (`2026-10-11_release-1-14-0/close/10`, the measurements page's one composition link, placed for this
  plan's build; decided in the re-plan). The other 27 stay in the inbox (the plan gate's default): lines 83, 108, 109,
  110, 155, 212, 213, 214, 215, 217, 218, 221, 222, 223, 242 and 264 name these files without being plan 014's work,
  and lines 231–235, 253 and 257–261 carry their own `when:` for a later session.

## r1 — the records suite

- **Build** (implementer, Opus 5.5, effort `high`, lane `p18-r1` from `8e9f588b`): the first dispatch (23:35Z)
  returned `BLOCKED_DEPENDENCY` — `test/ci/testScheduling.test.ts` pins the default suite's file set, and
  `test/support/support.test.ts` refuses a `src/` import from a support module; both answered (S15, the plan's cell
  amended at 23:39Z). The second (23:40Z–01:52Z) built the unit: `vitest.records.config.ts`, `npm run test:records`,
  the records check (`test/support/recordsPresent.ts`), the ledger, inbox and spec-status splits, the hermetic
  `.gitignore` cases, the scheduling test's two discovery sets; records suite 3 files and 15 tests, `npm test` 295 files
  with none under `test/records/`; the records check refuses a copy without `.stamity/runs`. It returned
  `BLOCKED_FAILURE` on the full `npm test` alone — three red runs, only timeouts in untouched process-spawning files,
  each passing alone under the lock, at load averages of 30–55 from other projects — and was committed on that
  evidence (S17): `356901ca` in its lane, cherry-picked onto `records-branch` (from `5284eaaa`) as `3190fa20`.
  Its finding W-1 is ledger `build/1` (S18: `r5` closes it in this branch).
- **`gate classify --base 5284eaaa`** (01:53Z): `security-sensitive` (`.stamity/change-classes.json`), lens
  `stamity-security`. Review and lens dispatched 01:54Z.

- **Review** (`reports/r1-reviewer-r1.md`): request-changes, confidence medium — W-1 (no case pins the POSIX
  exclude of `test/records/**`; ledger `review/1`) and M-1 (two messages still say "tracked ledger"; `review/2`).
  Security lens (`reports/r1-security-r1.md`): W-1 (an in-progress run's legal `open` row turns the records suite
  red; `review/3`, decision needed, S20). One fixer for all three, dispatched 02:02Z.
- **Fix round 1** (fixer, `reports/r1-fixer-r1.md`): a POSIX discovery case that fails if `test/records/**` reaches
  the default suite; the two messages; `partitionByRunStatus` in `test/support/recordGates.ts` skipping a run whose
  record reads `Status: in progress` in its first 15 lines from the ledger and `Ref:` checks, four fixture cases
  (three red with the check switched off); `npm run test:records` in the main checkout, holding three in-progress runs,
  now passes. Commit `45a79110` on `records-branch`. **Round 2** (`reports/r1-reviewer-r2.md`): **approve**, confidence
  medium; `review/1`–`/3` fixed.

## The lanes (from `3190fa20`, 01:53Z)

- **Lane X, `r1b`** (`reports/r1b-implementer-r1.md`): `10a38b54` — eight cases that read plans 006, 013-02, 015 and
  017-01, the newest run's `inputs.json`, run 27's summary and run 43's `inputs.json` move to `test/records/`
  (`specPlanCoverage`, `rubricCoreHash`, `run27Repeats`, `evalRunInputs`); the plan 007 case and run 24's
  evidence-summary case go synthetic, each checked to fail a degenerate input; the records suite 7 files, 23 tests.
  Review dispatched 02:02Z.
- **Lane Y, `r2`** (`reports` none: `BLOCKED_DEPENDENCY` returned in full): built and committed by the session as
  `495e3bd1` (S21) — the pinned snapshot, `RECORDS_BLOB_URL`, `measurementInputs` and `measurementsAction`, the
  generator's skip and refusal, the page changed in its four record links only, eight new cases (seven red first); in a
  records-free copy `--page all` exits 0 with the notice, `--page measurements` exits 1 naming the inputs, a partial
  restore is refused, and a later snapshot leaves the page byte-identical. Twenty existing cases (`r2b`'s) and one
  hand-page case (`r3`'s) are red at this commit by plan. Ledger `build/2`, `build/3`. `r2b` and the review dispatched
  02:03Z.
- **Lane Z, `r4`** (`reports/r4-implementer-r1.md`): `bb44ee41` — `scripts/records.mjs` (`setup`, `restore`,
  `commit`, `verify`, `guard`, `init`), `scripts/records-paths.mjs`, the four templates, and
  `test/ci/recordsScript.test.ts` (20 cases over temporary `file://` origins; three shown to fail with their guard
  disabled); the in-progress rule built in (S20, sent at 02:00Z). Two Minors (`build/4`: the gate starts `npm` without
  a shell, so `commit` cannot publish on Windows; `build/5`: `commit` never moves the local `records` branch). Class
  `product`, the security lens added by topic; review, lens and `r5` dispatched 02:16Z.
- **Lane X, `r1b`** review (`reports/r1b-reviewer-r1.md`): **approve**, confidence medium; one Minor (`review/7`:
  two spec citations point at the moved tests' old homes, for the Prove spec delta).
- **Lane Y, `r2`** review (`reports/r2-reviewer-r1.md`): request-changes — `review/4` (a canonical-route literal the
  fork-identity census counts; sent to `r2b`), `review/5` (the snapshot-refresh hint and the checklist; the hint in a
  lane Y fix round, the checklist in `r7`), `review/6` (a script-level exit test, in `r3`); S22.
- **Lane Y, `r2b`** (`reports/r2b-implementer-r1.md`): `e09bd3d1` — the twenty cases `r2` left red pass again, ten
  moved whole to `test/records/measurements.test.ts` and ten synthetic, no assertion dropped; no test spells the
  canonical route (`review/4` routed here, S22); one `testInputs` line. Its Minor `build/6` (five renderer-logic
  cases moved, as listed). **Review** (`reports/r2b-reviewer-r1.md`): **approve**, confidence medium; two Minors
  (`review/12`: the URL pin became a shape check; `review/13`: more renderer cases than `build/6` counted left
  `npm test`). The append from the report was refused (two summaries of 305 characters against the ledger's 300); the
  two rows were appended from a trimmed `--stdin` block, the report unchanged.
- **Lane Y, `r2`'s hint fix** (`reports/r2-fixer-r1.md`): `71ba5cc2` — `scripts/merge-ready-rate.mjs:59-60` says the
  page renders the pinned snapshot, and how the pin moves (`review/5`, script half).
- **Lane Z, `r4`'s review** (`reports/r4-reviewer-r1.md`): request-changes — `review/9` (Critical: a second
  machine's older copy silently reverts a published record), `review/10` (the restore advice could lose unpublished
  edits), `review/11` (a dry run moves `origin/records`); **lens** (`reports/r4-security-r1.md`): `review/8` (the
  records workflow's leak gate reads main's ignore rules, so it never scans an ignored file pushed to `records`).
  S24. **Fix round 1** (`reports/r4-fixer-r1.md`, worktree `p18-z4` from `bb44ee41`, beside lane Z): `103fd63a` — the
  sync base `refs/worktree/stamity/records-base` (no fetch moves it), `commit` refusing a moved branch, the three-way
  `restore`, the dry run into a scratch ref, the template's leak gate on a worktree of the pushed commit, vitest run
  through `process.execPath` (`build/4`), the local `records` branch fast-forwarded (`build/5`); 10 of 24 cases red on
  `bb44ee41`. Its own W-1 (`review/14`: a deletion from another machine would be re-published) is S25, appended from
  a `--stdin` block (the fixer's digest carried it, not a findings block); a second fix dispatched 02:38Z.
- **Lane Z, `r4`'s second fix** (`reports/r4-fixer-r2.md`): `d0194c9c` — `restore` deletes a record the other side
  deleted only when the copy on disk has the base's bytes; an edited copy is a conflict (nothing written, base
  unmoved); `--force` and a missing base delete nothing; each deletion is listed. Three cases, red on `103fd63a` by
  their failure messages (that run's output went through a filter, so its exit code was not read). Class `product`;
  the re-review and a security re-check of `review/8` and the new delete path dispatched 02:43Z.
- **Lane Z, `r5`**: the first dispatch returned `BLOCKED_DEPENDENCY` (ledger `build/7`: removing the four record-path
  entries from the test-input map turns the census guard red while the records are tracked), nothing committed;
  S23 (the entries leave in `r7`). The retry (`reports/r5-implementer-r1.md`): `7f00502d` — the classifier keeps its
  three lanes (the `records` lane and the `records_only` output removed); the canonical `records` job (no `needs`,
  guard → restore → `test:records` → the leak gate with `--root` over a worktree of `origin/records`, sent to it at
  02:23Z as `review/8`'s CI half → drift); `all-ci-checks` asserting it; `release.yml`'s two steps; the Dependabot
  entry for `records`; three lanes in CONTRIBUTING and GOVERNANCE; `--no-textconv` (inbox row 133, untestable on git
  2.52: a plain `git show` runs no textconv). 27 cases red first; `test/ci` and the docs pages under the machine lock,
  exit 0 (1,225 passed); lint, typecheck, knip exit 0. Minors `build/8` (about 805 changed lines, twice the unit
  ceiling) and `build/9` (two spec citations of the classifier's moved lines, for Prove). Class
  `security-sensitive`; review, lens and `r5b` dispatched 02:40Z.
- **Lane Y, `r3`** (`reports/r3-implementer-r1.md`): `fb2a2737` — five hand pages link records on the `records`
  branch; the fork guide's `generatedPaths` drops the measurements page; headers on the commit form re-attested
  2026-10-14, `REATTESTATION_DATE` moved; the disclosure and release-rule cases moved to `test/records/docsPages.test.ts`;
  two cases in a records-free copy prove the guide's regenerate list and the generator's exits (`review/6`). Each
  check red first; its verify, `testInputsGuard`, `forkIdentity`, `test/cli/docs` and typecheck exit 0. Minors
  `build/10`–`build/12`, appended from a trimmed `--stdin` block (summaries of 314 and 301 characters). The review
  and `r2`'s closure re-review (`review/4`–`6`) dispatched 02:42Z.

- **Lane Y, `r2`'s round 2** (`reports/r2-reviewer-r2.md`): `review/4` and `review/6` closed fixed; `review/5` left
  open (the script's header at `:6-8` still made the claim the hint fixed); a new Warning, `review/15` (the page's own
  refresh sentence still said `--write` refreshes it). **Fix round 2** (`reports/r2-fixer-r2.md`): `c895a04e` — the
  header, the page sentence naming the snapshot's home on `records` and the three steps, the moved wording case, and
  an exact `RECORDS_BLOB_URL` pin on the canonical checkout (`review/12`, folded in); each red first. **Round 3**
  (`reports/r2-reviewer-r3.md`): **approve**; `review/5`, `/12`, `/15` closed fixed. `r7`'s checklist line names the
  same three steps (plan, 02:47Z).
- **Lane Z, `r4`'s round 2** (`reports/r4-reviewer-r2.md`): `review/9`, `/10`, `/11`, `/14`, `build/4`, `build/5` closed
  fixed; three Warnings — `review/21` (decision needed: `restore --force` moved the base past a deletion it kept;
  S26), `review/22` and `review/23` (no case for `commit` without a base, nor for the deletion pass's symlink
  refusal). **Security re-check** (`reports/r4-security-r2.md`): `review/8` closed fixed in both halves; two Minors,
  `review/24` (case-insensitive disks) and `review/25` (a records commit carrying non-record paths the leak gate
  skips). All five, plus the note that `restore` names what it re-creates, in fix round 2 (`p18-z4`, dispatched 02:53Z),
  the last the review cap allows for `r4`.
- **Lane Z, `r5`'s review** (`reports/r5-reviewer-r1.md`): **approve**; one Minor, `review/16` (CONTRIBUTING and
  GOVERNANCE call `docs/plans/` a website-lane path, though plans are records). **Lens** (`reports/r5-security-r1.md`):
  0 findings.
- **Lane Z, `r5b`** (`reports/r5b-implementer-r1.md`): `5c2f9b9e` — row 104 (every `ci.yml` pull-request run's check
  suite on the head counts as `ci.yml`'s own; the newest run decides) and row 105 (`docs-site.yml`'s pull-request
  trigger narrowed to `docs/specs/**`, `README.md` and itself; the site builds once, in `ci.yml`, under
  `all-ci-checks`); new cases red first; `test/ci` under the machine lock exit 0 (1,125 passed); lint, typecheck,
  knip exit 0. Two pre-existing Minors, `build/13` and `build/14` (linked files outside `docs/` in no blocking site
  build). Class `security-sensitive`; review and lens dispatched 02:54Z.
- **Lane Y, `r3`'s review** (`reports/r3-reviewer-r1.md`): request-changes, confidence high — `review/17` (Warning:
  the README's and the fork guide's records-branch links are resolved by no suite); Minors `review/18`–`/20`.
- `build/2` and `build/3` closed fixed by hand (02:56Z), each on its unit's approving review.

## Integration (02:55Z, in the main checkout)

`records-branch` from `45a79110`, each lane commit cherry-picked in order with no conflict (the shared `testInputs`
map merged clean): lane X `10a38b54` → `caa5d1b5`; lane Y `495e3bd1` → `1ec8704e`, `e09bd3d1` → `ad7e7e47`,
`71ba5cc2` → `70c625e4`, `fb2a2737` → `fbb04346`, `c895a04e` → `f5b22716`; lane Z `bb44ee41` → `93ef9c76`, then
`r4`'s fixes from `p18-z4` `103fd63a` → `51b07c46`, `d0194c9c` → `8eae487c`, then `7f00502d` → `4461b04c`,
`5c2f9b9e` → `5557c330`. The full suite runs on `5557c330` in the pinned worktree `p18-suite` (built first, alone
under the machine lock), dispatched 02:56Z. Lane W (`p18-w`, branch `records-branch-lane-w`, from `5557c330`) takes
the integration fix round: `review/16`–`/20`, `build/10`, `build/11` (dispatched 02:56Z).

**Suite round 1** (`reports/integration-test-runner-r1.md`, written by the orchestrator from the runner's digest, as
a red verdict writes none): at `5557c330`, build, `test:records` (9 files, 57 tests), lint, typecheck, knip and the
leak gate exit 0; the full suite exits 1 with one failure of 14,091 tests — the census guard: lane X's
`test/records/specPlanCoverage.test.ts` names a spec page that no map entry lists for it, because lane Z's `r5`
dropped `test/records` from the `docs/specs/**` entry in a tree without that file (`build/15`, Critical: a contract
across two file-disjoint lanes). The four live client walks passed. `build/15` was sent to lane W's fixer at 03:09Z,
in its files and its verify. `r5b`'s review (`reports/r5b-reviewer-r1.md`): request-changes — `review/26` (S28),
Minors `review/27` (to Prove's spec delta) and `review/28` (pre-existing); its lens (`reports/r5b-security-r1.md`):
0 findings. `r5b`'s fix round 1 runs in lane Z (dispatched 03:01Z).

- **`r5b`'s fix round 1** (`reports/r5b-fixer-r1.md`): `d5887ba8` — both of `ci.yml`'s pull-request site builds copy
  `llms.txt` and upload the site as `docs-site.yml`'s build did (same pin, `if-no-files-found: error`, distinct
  names), pinned in `test/ci/workflow.test.ts`; red first; the four named `test/ci` files under the lock exit 0.
  Integrated as `4510bf38` (03:11Z); its re-review and a lens re-check dispatched 03:11Z.
- **Lane W, the integration fix round** (`reports/integration-fixer-r1.md`): `60564d4f` — `build/15` (the map lists
  `test/records/specPlanCoverage.test.ts` for its spec page; the guard passes whole), `review/17` (a records-suite case
  resolving every records-branch link on the pages `main` tracks), `review/18` (no repo-relative record link on README,
  the doctrine and the fork guide, by `isRecordPath`), `build/11`, `build/10` (`test/support/pageSections.ts`),
  `review/19` (SECURITY.md), `review/20` (README's figure equals the page's, with a case), `review/16` (CONTRIBUTING and
  GOVERNANCE name the records); each new case red first; its verify, `test:records` (58), lint, typecheck, knip exit 0.
  Its own Minor `review/29` (the relative-link refusal covers three pages), for the close. Integrated as `f86401ee`
  (03:12Z); class `security-sensitive` (the map); re-review and lens dispatched 03:12Z.
- **`r5b`'s round 2** (`reports/r5b-reviewer-r2.md`): **approve**; `review/26` closed fixed. Lens re-check
  (`reports/r5b-security-r2.md`): 0 findings.
- **Lane W's round 2** (`reports/integration-reviewer-r2.md`): **approve**; `build/15`, `review/16`–`/20`,
  `build/10`, `build/11` closed fixed. Lens (`reports/integration-security-r1.md`): 0 findings.
- **`r4`'s fix round 2** (`reports/r4-fixer-r3.md`): `6440a9da` — S26's forced deletion pass, the cases for `commit`
  with no base and for the symlink refusal, case-folded comparison, `restore` refusing a ref holding a non-record path,
  a line per re-created record; 7 of 31 cases red first, and the reviewer's two mutations shown red. Its two Minors,
  `review/30` (decision needed) and `review/31`: S29. **The case-folding fix** (`reports/r4-fixer-r4.md`): `ca7c3cb1`
  — one tree check for both commands, `commit` running it before any gate or push, case-folded pairs refused; three
  cases red first. Its own Minor `review/32` (the case-pair advice names a step the script cannot do for a pair already
  on `records`), for the close: `r4` is at the review cap. Both integrated: `6440a9da` → `c0184bb1`, `ca7c3cb1` →
  `bef46934` (03:21Z). `r4`'s third and last review round and a lens re-check dispatched 03:21Z.

**Integration pass 2 (03:21Z):** `records-branch` at `bef46934` holds every unit and fix. The final-tree suite runs in
`p18-suite` moved to `bef46934` (queued on the machine lock behind the `r7` rehearsal, S30); the whole-branch
review's first pass on Fable 5.1 (S27) reads `5284eaaa..bef46934`; both dispatched 03:21Z.

- **`r4`'s round 3, the last** (`reports/r4-reviewer-r3.md`): request-changes; `review/21`–`/25`, `/30`, `/31` closed
  fixed; one new Warning, `review/33` (folder names differing only in case pass the case-pair check). Lens round 3
  (`reports/r4-security-r3.md`): `review/24` and `/25` fixed; one Minor, `review/34` (the fold is `toLowerCase`, not
  the disks' Unicode fold). `r4` stops at the review cap: `review/32`–`/34` are S32's design question for the
  maintainer; tonight's records hold no case pair and no non-ASCII path, so none blocks `r6`.
- **The `r7` rehearsal** (S30, `reports/rehearsal-implementer-r1.md`): in the throwaway worktree `p18-r7` from
  `f86401ee`, 489 record paths untracked (the handoffs placeholder kept), the four map entries removed, committed as
  `354e9cf5` on `rehearsal-r7-never-push`, never pushed. Build, lint, typecheck, knip, the leak gate and `guard` ("no
  record path is tracked at HEAD") exit 0; the full suite exits 1 on one case, the lane-path floor at
  `test/ci/testInputsGuard.test.ts:377` (77 lane paths left once the 33 plans leave, against `> 100`), with the census
  gaps at 0 — so S23's premise holds and `r7` lowers that floor (`build/16`, the plan's `r7` cell). `build/7` closed
  fixed by hand on this evidence. The branch and the worktree were deleted at 03:27Z (ignored: `dist/`, `website/build/`
  and the `node_modules` link only).

**Suite round 2, the final tree** (`reports/integration-test-runner-r2.md`, written by the orchestrator from the
runner's digest): at `bef46934`, alone under the machine lock — build, the full suite (295 files, 14,086 tests passed,
18 skipped, the four live walks included), `test:records` (58), lint, typecheck, knip and the leak gate all exit 0.
`guard` refuses the 489 tracked records, the expected state until `r7`; the runner listed it as a Critical, and,
screened, it is no defect and has no ledger row.

**The whole-branch review, first pass** (S27, Fable 5.1, `reports/whole-branch-reviewer-r1.md`, over
`5284eaaa..bef46934`): request-changes, confidence medium, one finding — `review/35` (Warning, decision needed: the
records branch's own workflow checks out `main` for its tooling, so the import commit's first `records.yml` run is red
until this branch merges); S33 takes the smallest fix, in the record and the plan, not the code. It found the record set
one everywhere, the order `r7` → first push → CI working in a fresh clone and skipped in a fork, the measurements
page's pin, steps, drift step and release restore in agreement, no regression to file 1, and nothing in a changed line that does not belong in a
public record. Its residuals: `node dist/cli.js check` in `r7`'s records-free verify, and the first
Windows run of `test/ci/recordsScript.test.ts`'s real-gates case at the first push.

## Prepared for the maintainer's `r6` (read-only, 22:44Z)

`gh api repos/zomarit/stamity/rulesets` lists two: `main-policy` (21666686, branch, active, `include: ["~DEFAULT_BRANCH"]`,
rules `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request`, `required_status_checks`, bypass: the
repository-admin role) and `release-tags` (21666689, tag, active, `include: ["refs/tags/v*"]`, rules `creation`,
`update`, `deletion`, `non_fast_forward`). Neither matches `refs/heads/records`, so `r6`'s step 1 needs no exclusion;
no `records` branch exists on the remote (`git ls-remote --heads origin records` prints nothing). The outward steps,
each the maintainer's, once `r1`–`r5` are green and the branch's records are still tracked (`git status --porcelain`
empty), with `<sha>` the branch head:

1. `node scripts/records.mjs init --base <sha>` — builds the orphan import commit, verifies it, pushes `records`.
2. `gh api -X POST repos/zomarit/stamity/rulesets --input -` with
   `{"name":"records","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["refs/heads/records"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"}],"bypass_actors":[]}`.
3. `gh run list --branch records --limit 1 --json conclusion,headSha` — amended by S33 (03:35Z): this first run of the
   import commit is red by construction (it checks out `main`, which gets `scripts/records.mjs` and `test:records` only
   when this branch merges); nothing waits on it. After the merge, `gh run rerun <its id>` and read `success` there.
4. Then `r7` (the removal, the records-ritual texts, `setup`), and only then the branch's first push for CI.

**Updated 03:23Z, after tonight's build** (the order is S31):

- `init` reads the records from the commit, never from the disk, so tonight's untracked run folders do not matter; it
  refuses only if a `records` branch exists (local or on `origin`) or a listed path is not a regular record file. A
  read-only check at `bef46934` found 489 record files (the count `r0` captured), none `init` would refuse, and no two
  paths equal under case folding; it imports them plus the branch's four files (`README.md`, `.gitignore`,
  `.gitattributes`, `.github/workflows/records.yml`).
- `init` also sets the checkout's sync base (S24): run it from the checkout that will publish later (the main
  checkout). Any other checkout or worktree runs `node scripts/records.mjs restore` once before its first `commit`.
- The branch's workflow scans the pushed commit with the leak gate's `--root` on a worktree of it (`review/8`), so step
  3's first run is the records' first full scan.
- `r7` also removes the four record-path entries of `.stamity/change-classes.json` (S23), and its release-checklist
  line names the measurements page's three steps (`review/5`, `review/15`); the rehearsal's commands are in
  `reports/rehearsal-implementer-r1.md` (S30).
- The shas: the tag `evals-retired-2026-10-13` is the annotated object `e3a3528541b3d06870c19902d79e1afdd9946385` on
  `6dfa5ffe36890ee04e1d3d3508100b5974d47207`; #99's head `47be2027557301f90ef138b8e1e46313b999e80d`; #100's head
  `5284eaaae829506f8f28312e697fa02af138fabb`; `records-branch`'s head `bef4693410017157b21b99dc570eaf8593db30c0`
  (until a later line here moves it).

## r0 — the before-state (at `ee8aa3b8`, pull request #100's head)

Captured by a test-runner in a worktree pinned to the base (`p18-r0`), 23:57Z–00:00Z (`reports/r0-test-runner-r1.md`
was not written: a red return comes back in full; its figures are copied here); scratch outputs outside both
checkouts.

- **(1) The npm package:** `npm run build` then `npm pack --dry-run --json`: 249 files, packed 771,358 bytes,
  unpacked 2,645,411 bytes, `shasum` `261987fb5172a43d180bef7ac5e32f05198a6811`, `integrity`
  `sha512-gl+Tm2gAgkAIGfbPvy6ELywSc4KMkeQgww712dGnIvPztfNGexPX52OYuKlZ6dfL12OBdPgqvXGhCHEQFkxXhQ==`; the sorted
  path-and-size list's sha256 `49fe9f8865f3da3257a2de07a66015c57338975197fa41d41127d183be733483`.
- **(2) The plugin distribution:** refused twice with exit 2 — the persisted command passes `--runtime` a directory
  it expects to exist (a runtime built by `scripts/build-plugin-runtime.mjs` from the packed tarball). The plan's `r0`
  cell is amended (00:00Z) to CI's three lines and the capture re-run (00:01Z–00:05Z, `reports/r0-test-runner-r2.md`):
  `npm pack` (tarball `zomarit-stamity-1.14.0.tgz`, sha256
  `c260253036108fd7046a52411597ef2e9fdf2f1643be60a4da5128ddc26e7d84`, 249 files), then twice the runtime from it and
  the distribution with `--source-commit ee8aa3b8fed6d32d7e199d02dd7a5cf34389c4bc --source-commit-date
  2026-10-13T23:51:26Z --version 1.14.0`. **Deterministic:** the runtime trees (657 regular files, plus two `.bin`
  symlinks) list-hash `ec59b1dddd27395eb6a406db44be35e0ee1a91f0436f24a7500e063a8fefb351` both times; the distribution
  trees (2,938 files, four zips: Claude 716, Cursor 729, Copilot 716, Codex 703 files) list-hash
  `d419de4db4494c33a0c4e996d436d80ee3bcc6fa781d427d6da2c4c34de7c8ee` both times. `r8` repeats these inputs exactly.
- **(3) The records manifest:** `git ls-tree -r ee8aa3b8 -- <the ten pathspecs>` without `.stamity/handoffs/.gitkeep`:
  489 rows, all blobs, sha256 `4aded929281c5792870c1c4d25fd252c3f779555260f55b1b156a516101f79aa`; the name-only count
  agrees (489). By pathspec: `.stamity/runs` 203, `.stamity/inbox.md` 1, `.stamity/handoffs` 5, `.stamity/evidence`
  11, `docs/plans` 33, `evals/runs` 221, `evals/measurements` 12, `evals/reach` 1, the two `evals/` files 1 each.
- **(4) The generated pages:** `node scripts/generate-docs.mjs` wrote ten pages and left the tree clean
  (`git status --porcelain` empty); sha256 of each — `docs/measurements.md`
  `ff21aa44352e2221a5f83829b11e0b25e0c6ade34a1e6faeb336f529d0541848`, `llms.txt`
  `89651a4289b61389b59c5184ffe35c2bd365b636ecd5ad0cd8877447e29155af`, `docs/cli-reference.md`
  `b23baf0339a91a026bee92cffa8aaca6c189be989e4d7fdf88ef06b47a30e89b`, `docs/configuration.md`
  `8d2fb9c06d52e6aea06ea2a1fa69b8188f3c459dee6e15928209bb84093f93f5`, `docs/reference/agents.md`
  `10f84d56eedd21676ee1210c23c31c2ded424d67b2096bed820744ca87c1e04e`, `docs/reference/commands.md`
  `6178e410a174b33186dd8f9877a67fd4345cd64a80493ad324113d12eb719f4b`, `docs/reference/mcp-servers.md`
  `09f5888ece845c21324806f5815b4d7662723375754252ddda6b69f98e60d742`, `docs/reference/packs.md`
  `cd004dadac944b33e0dda943b1b6967da2504dd60464b7c98af385c497d3f170`, `docs/reference/rules.md`
  `3016ff9d7c6b4078f799d5bb1305cfab26be871c1b70a6c3655a5eb46c24d17d`, `docs/reference/skills.md`
  `694c2826e71fd31089ea318e47e0123fa7b2af03974a85e03625efa3a0961c7b`.
- **The base moved to `5284eaaa`** (pull request #100's final head, after the review bot's fix batch; only
  `scripts/upstream.mjs`, its lane tests, two docs, one spec and the CHANGELOG changed): captures (1)–(4) re-taken
  there (00:36Z–00:40Z, test-runner, returned in full) — the npm listing, `shasum` and `integrity`, the tarball, the
  runtime and distribution list hashes (built with the same provenance inputs), the records manifest (489 rows,
  `4aded929…`) and all ten page hashes are **equal** to the values above, checked with `cmp`/`diff` against the earlier
  lists. The baselines stand for this branch's base, `5284eaaa`.
- **(5) The record-reading census:** 82 case sites (84 with the `it.each` instances) read a record directly and seven
  more indirectly, by file and case in the re-plan's research (folded into `plan.md`'s units `r1`, `r1b`, `r2b`, `r3`).

## r6 — the records branch (2026-10-14, the morning batch's answer 3)

- **S32's fix and the base:** `ac055243` (folder-case pairs, printable ASCII, the repair advice) passed its fresh review
  (`reports/r4-reviewer-r4.md`, approve; `review/32`–`/34` closed fixed; lens `reports/r4-security-r4.md`: two Minors,
  `review/36`, `/37`, taken into S34's follow-up round) and was integrated as `c8cb301f` (07:47Z). A read-only check on
  that exact base: 489 regular records, none outside the portable-name rule, no case pair of files or folders.
- **Init (07:48:07Z):** `node scripts/records.mjs init --base c8cb301f28811b82c5f83c1ee8c53ba8c64e8f46`, exit 0 —
  "imported 489 record(s) and 4 template(s) … as `fbb96b35093061d55d56491068911657f210b0f1`", "verified: 489 record
  path(s) carry the same mode and blob", "pushed origin/records". The main checkout's sync base is `fbb96b35`.
- **Ruleset (07:48:15Z):** `records`, id `25061761`, branch, active, `include: ["refs/heads/records"]`, rules
  `deletion` and `non_fast_forward`, `bypass_actors: []`; `gh api repos/zomarit/stamity/rules/branches/records` lists
  both rules from ruleset `25061761`.
- **The refused force push (07:48:29Z, the QA machine row):** from a throwaway bare clone,
  `git push --force origin refs/heads/main:refs/heads/records` exits 1 — "GH013: Repository rule violations found for
  refs/heads/records … Cannot force-push to this branch", "[remote rejected] main -> records". `records` stays at
  `fbb96b35`; the clone was deleted.
- **Verify:** `node scripts/records.mjs verify --base c8cb301f…` exit 0; `git merge-base origin/main origin/records`
  exit 1 (no shared history); `git ls-tree --name-only origin/records` lists `.gitattributes`, `.github`,
  `.gitignore`, `.stamity`, `README.md`, `docs`, `evals`.
- **The first `Records` run** (38530718822, push of `fbb96b35`): failure at "Restore the pushed records into the
  checkout" — `Cannot find module '…/scripts/records.mjs'`, because `main` gets the tooling only when this branch
  merges (S33); checkout, Node and install passed. Re-run after the merge.
- **QA, the person row (07:52:52Z):** the maintainer opened `https://github.com/zomarit/stamity/tree/records` and
  answered "Looks right (Recommended)" to "does github.com/zomarit/stamity/tree/records look right — the README
  rendering as the records branch's guide, and the .stamity, docs and evals folders present, on one import commit?".
  Passed. With the refused force push above (machine), two of the three QA rows; the third, a fresh clone's
  `npm test` without `setup` (machine), is proven by the records-free suite at `f73b6086` (suite round 3, below).

## r7 — the records leave `main` (2026-10-14, the morning batch's answer 4)

- **S34's round** (`reports/r4-fixer-r6.md`): `eb81124f` — portable record names (`[A-Za-z0-9._-]` per segment, no
  trailing dot, no Windows device name) in the tree check and `init`, a literal pathspec in the printed repair, and
  `init` refusing case pairs; nine cases red first. Re-review (`reports/r4-reviewer-r5.md`) **approve**; lens
  (`reports/r4-security-r5.md`) 0 findings; `review/36`, `/37` closed fixed. Two notes for the close (no row): a
  non-portable name already on `records` gets no printed repair (only a raw push can put one there), and `init` could
  import a case variant of `main`'s placeholder (moot: `init` ran once, on a base holding only the placeholder).
- **`r7`** (`reports/r7-implementer-r1.md`): `074c11d8` in the main checkout — `commit --dry-run` listed nothing (last
  night's three runs read `Status: in progress`), so nothing was published; `verify --base HEAD` exit 0; 489 record
  paths untracked with `git rm -r --cached` (on disk still), `setup` wrote the exclude block and restored nothing; the
  four record-path map entries removed (S23); the lane-path floor `> 100` → `> 60` (77 remain), a justified test
  change (`build/16`); CONTRIBUTING's "Keep the records" section, `evals/README.md`, the release checklist's
  three-step line, the two pointers, the CHANGELOG entry. The marker check exits 1 (the inbox fold needs no pathspec).
  `guard`, the `ls-files` check, the `.gitignore` diff, 27 targeted test files (2,501), `test:records` (58), lint,
  typecheck, knip, the leak gate and `node dist/cli.js check` (here and records-free) exit 0. Its Minor `build/17`:
  the persisted plan's amendment notes go to `records` with `commit`, since plans are records now.
- **Integrated:** `eb81124f` → `f73b6086` on top of `074c11d8` (08:01Z). The review and lens of `r7`, and the
  final-tree suite in `p18-suite` moved to `f73b6086` (records-free, as CI sees it), dispatched 08:01Z.
- **Suite round 3, records-free** (`reports/integration-test-runner-r3.md`): at `f73b6086` in `p18-suite` (the checkout
  to that head took the records off its disk, as in CI) — build, the full suite (295 files, 14,096 tests passed, 18
  skipped, the live walks included), lint, typecheck, knip, the leak gate (1,277 files), `guard` ("no record path is
  tracked at HEAD") and `node dist/cli.js check` ("drift: clean") exit 0; `npm run test:records` refuses as it should
  (exit 1, "The records are not in this checkout. Run `node scripts/records.mjs restore` (a fresh clone: `… setup`)").
- **`r7`'s review** (`reports/r7-reviewer-r1.md`): request-changes — the deleted set is exactly the record pathspecs
  at `c8cb301f` minus the placeholder, each byte-equal on `origin/records`; `review/39` (Warning: in a fork with no
  `records` branch, `setup` fails and its hint suggests `init`), `review/40` (Warning: the eval-run skill and the eval
  set's run-artifact contract still say to commit `RESULTS.md` on `main`), Minors `review/41`–`/44`. **Lens**
  (`reports/r7-security-r1.md`): one Minor, `review/38` (a release's evidence on `records` is cited by path only).
  The maintainer's answers (08:19:22Z): `review/39` — pass `--ref` through `setup`; `review/40` — deferred to 1.15.0's
  prep (Package 24), whose release runs the full eval set anyway (closed `deferred`; its inbox row is written at the
  close); `review/38` — name `git rev-parse origin/records` at the cut. Fix round 1 for `review/38`, `/39`, `/41`–`/44`
  dispatched in the main checkout (08:20Z).
- **`r7`'s round 2** (`reports/r7-reviewer-r2.md`): **approve**, confidence high; `review/38`, `/39`, `/41`–`/44`
  closed fixed (the fork recipe checked step by step; plain `setup` unchanged; the checklist's order and pinned-sha
  links consistent with the page's three steps).
- **The first push (08:31Z):** a screen of every added line and every commit message from `origin/main` to `4d003d60`
  (21 commits) for text that does not belong in a public record found one hit, a test-fixture comment in the
  measurements page's own words for a run left out of the rate — not a match;
  `git push -u origin records-branch` at `4d003d60856e57a61d6c8841cbee1db68e4d1b7b`; pull request **#101** opened as a
  draft, "refactor(records): move the repository's records to the records branch". CI 38535670017, PR checks
  38535669942 and Docs site 38535669920 started 08:31Z, watched to the end.

## r8 — the after-measure (`reports/r8-test-runner-r1.md`, at `4d003d60` against `5284eaaa` and `r0`)

- **(1) The npm package:** the same 249 paths; 246 files byte-equal (`dist/cli.js`, `dist/src.js`, `dist/index.js`
  among them); three differ — `README.md` (this branch's record links and merge-ready figure), `dist/types/cli/docs/
  measurements.d.ts` (S12) and the packed `package.json` (the `test:records` script `r1` added; npm always packs it).
  The base re-packed equals `r0` exactly (sha256 `c2602530…`, shasum `261987fb…`).
- **(2) The plugin distribution:** with `r0`'s provenance inputs, the runtime differs in 4 of 657 files and the
  distribution in 25 of 2,938, every one traced to the three files above (their runtime copies, `RUNTIME.json`'s
  tarball sha, `release.json`'s shas and the four zips); the base re-run equals `r0`'s list-hashes.
- **(3) The generated pages:** the nine pages other than `docs/measurements.md` are byte-equal to `r0`'s; that page
  keeps every number and changes four record-link targets and `review/15`'s refresh sentence.
- **(4) The fork-import dry run** (file 1's recipe, `main` at `4d003d60`): exactly `refs/heads/main` and the 16 `v*`
  tags, `size-pack` 32.37 MiB, no `records` or `plugin-dist` ref or object, no record path at `main` but the
  placeholder.
- **(5) The records:** `9239379c..4d003d60` over the ten pathspecs shows only deletions (391); `main` holds only the
  placeholder; `verify --base c8cb301f` against `origin/records` exits 0.
- **(3′) The APM figure:** not measured (the opening answer N6).
- Ledger: the packed `package.json` as an exception to invariants 1 and 2 (decision needed), for the maintainer at the
  stop before the merge.
- **CI at `4d003d60` (read to the end 08:43Z):** CI 38535670017 `success` — `records (restored from the records
  branch)` passed against `origin/records`, and `check` on lts, the Node 22 floor, `windows-1` and `windows-2`, the
  three APM routes, the plugin route, both advisories and `all-ci-checks` passed (`lanes` and `prove-pr` skipped by
  design); PR checks 38535669942 and Docs site 38535669920 `success`. 18 checks passed, 3 skipped.

## Prove — the spec delta (`reports/prove-spec-author-r1.md`)

- The spec author (read-only git) wrote twelve spec files: REQ-PROVE-023, -024, -025 added; REQ-PROVE-009, -016, -017,
  -020, -021, -030, -031, -033, -036, REQ-PLUGIN-020, -025, REQ-APM-002 (the vendored-tree size not measured, N6),
  REQ-CTX-006 and REQ-UPSTREAM-001, -007 amended, each as built (S10's kept classifier and `changes` job; S24–S26's
  sync base and three-way restore; the portable-name and case-pair rules; `setup --ref`); a one-line banner in six
  more specs citing a moved path. It wrote five dated amendment notes into the persisted plan, a record now
  (`build/17`): they are published with `records.mjs commit` at the close. Six Minors, each known or informational.
- Screened by the orchestrator as public text (20 hits of
  "handoffs", the records path, and nothing else) and committed by explicit path as `d5e9804a` (08:51Z). PR #101's description was
  edited first (its PR-checks run 38538015180 finished `success` before the push), then `git push origin
  records-branch` (`4d003d60..d5e9804a`, 08:51Z). CI on `d5e9804a`, the local final gates in `p18-suite`, and the
  whole-branch review's delta pass on Fable 5.1 (S27) dispatched 08:51Z.
- **CI at `d5e9804a` (08:51Z push):** red only in the `records` job — `test/records/docsPages.test.ts:286`, the spec
  delta's template sentence (`docs/specs/prove-behavior-and-value.md:926`) spelling the records URL before a `<path>`
  placeholder (ledger `pr/1`, Critical); every other job, both Windows legs included, passed. The local final gates
  at the same head (`reports/integration-test-runner-r4.md`): the full suite (295 files, 14,097 tests), `npm run
  check`, lint, typecheck, knip, the leak gate and `guard` exit 0; `test:records` fails on the same line.
- **The whole-branch review's delta pass** (S27, Fable 5.1, `reports/whole-branch-reviewer-r2.md`, over
  `bef46934..d5e9804a`): **approve**, confidence medium, one Minor — `review/45` (decision needed: the branch's own
  README on `records` is still the template `init` imported, stating the earlier name rule and repair; no verb carries
  branch files across), for the maintainer at the stop before the merge.
- **Fix batch 1** (`reports/pr-fixer-r1.md`): `81ebb89e` — the sentence names `RECORDS_BLOB_URL` plus the record's
  path; the strict check unchanged; `test:records` 58 of 58. Re-review (`reports/pr-reviewer-r1.md`): **approve**,
  confidence high; `pr/1` closed fixed. Pushed 09:07Z; CI 38540087685 `success` (the `records` job, both Windows
  legs, every route, `all-ci-checks`), PR checks and Docs site `success`, read to the end at 09:21Z.
- **Marked ready (09:21:20Z); the review bot** (review 5515894747, 09:35Z, on `81ebb89e`): three P2 comments — `pr/2`
  (4269106220: `commit -m --dry-run` would take the flag as the message and publish), `pr/3` (4269106225: the
  three-way restore compared blobs, not modes), `pr/4` (4269106230: a release restores the moving `origin/records`,
  not the cut's commit; decision needed). Screened: code review only, kept. The pull request went back to draft
  (09:36Z). The maintainer's answers (10:49:41Z): `pr/4` — log the restored sha now, pin it at 1.15.0's prep;
  `prove/1` — the packed `package.json`'s script line is a planned exception with README and `dist/types` (closed
  `rejected`, as accepted); `review/45` — refresh the branch's README right after the merge.
- **Fix batch 2** (`reports/pr-fixer-r2.md`): `371445b4` — a recognised flag is never an option value
  (`commit -m --dry-run` exits 2); restore and the deletion rule compare mode with blob; `release.yml` prints the
  restored records commit; four cases red first. `4fcd26c2` — REQ-PROVE-024's sentence says bytes and mode. Pushed
  10:58Z (`81ebb89e..4fcd26c2`); CI, the re-review and a lens dispatched 10:58Z.
- **Batch 2's review** (`reports/pr-reviewer-r2.md`): **approve**; `pr/2`–`/4` closed fixed; three of its notes
  became `pr/6`–`/8`. **Lens** (`reports/pr-security-r1.md`): `pr/5` (Minor: the workflows named the records by the
  short ref `origin/records`, which a same-named tag would shadow). Batch 2's CI run was cancelled by batch 3's push
  (its finished jobs had passed).
- **Fix batch 3** (`reports/pr-fixer-r3.md`): `c96c7146` — `refs/remotes/origin/records` in `ci.yml`, `release.yml`
  and the script's defaults; the mode-only conflict advice no longer loops; modes follow `core.fileMode`; REQ-PROVE-024
  says both; six cases red first. Its two notes, `pr/9` and `pr/10` (the short name left in the checklist's notes
  command and the printed repair steps, both run by a person, who sees git's ambiguity warning), go to the close.
  Re-review (`reports/pr-reviewer-r3.md`) **approve**; lens (`reports/pr-security-r2.md`) 0 findings; `pr/5`–`/8`
  closed fixed (by hand: one report's closures used a status the ledger refuses, the other repeated `pr/5`).
- **CI at `c96c7146`** (read to the end 11:23Z): CI 38554750778 `success` — the `records` job, `check` on lts, the
  floor, `windows-1` and `windows-2`, the APM and plugin routes, `all-ci-checks`; PR checks and Docs site `success`;
  18 passed, 3 skipped. The bot's three comments answered in-thread (replies 4270127360, 4270127740, 4270128119); P2s
  earn no further bot review, so #101 stays a draft until its fast-forward merge.

## The merge and after (2026-10-14, the maintainer's answer at 11:24:57Z)

- **Merged:** `main` fast-forwarded `5284eaaa..c96c7146` at 11:25:31Z under the admin bypass (the pull request was a
  draft); GitHub marked #101 merged at 11:25:31Z. `main`'s push runs on `c96c7146`: CI 38556469631 `success`
  (`prove-pr` found the tree proved; the `records` job ran on the push anyway, as built, and passed; `all-ci-checks`
  passed) and Docs site 38556469594 `success`.
- **The records branch's first run, re-run** (S33): `Records` 38530718822 on the import commit `fbb96b35` — `success`
  now that `main` holds the tooling. Dependabot's new entry for `records` ran `success` (38556487600).
- **The branch's README refreshed** (`review/45`, the maintainer's answer 10:49:41Z): from a scratch worktree of
  `refs/remotes/origin/records`, `README.md` replaced by `main`'s `scripts/records/README.md` at `c96c7146` (the other
  three branch files already equal their templates), committed as `7538cfb5` and pushed as a fast-forward (11:27Z);
  its `Records` run 38556642474 `success` on every step (restore, the records suite, the leak gate over the pushed
  commit, hygiene, the measurements drift). The scratch worktree was removed.
- **This checkout's sync base:** `node scripts/records.mjs restore` (exit 0) wrote nothing, kept one pending edit (the
  persisted plan's amendment notes) and moved the base `fbb96b35` → `7538cfb5`; `commit --dry-run` leaves out the
  three runs still in progress, lists `M docs/plans/014-lean-repository-02.md`, and its gates pass.
