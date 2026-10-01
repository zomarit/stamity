---
id: lean-repository-02
intent: refactor
stamp: 9239379c39e2a4440581da1eaf6f7bb6a6ab204e 2026-10-01
reads: [src/cli/docs/measurements.ts, scripts/generate-docs.mjs, scripts/merge-ready-rate.mjs, vitest.config.ts, package.json, .gitignore, test/records/ledgers.test.ts, test/records/specStatus.test.ts, test/authoring/specPlanCoverage.test.ts, test/cli/docs/measurements.test.ts, test/cli/docs/llmsIndex.test.ts, test/docsPages.test.ts, test/evals/rubricCoreHash.test.ts, test/evals/manualRunner.test.ts, test/evals/support.ts, test/ci/evidenceSummary.test.ts, test/ci/workflow.test.ts, test/ci/forkIdentity.test.ts, scripts/ci/records-only.mjs, test/ci/recordsOnly.test.ts, .github/workflows/ci.yml, .github/workflows/release.yml, .github/workflows/fork-release.yml, scripts/leak-gate.mjs, scripts/repo-hygiene.mjs, scripts/eval/run.mjs, scripts/qa/run.mjs, src/runs/ledgerStore.ts, src/handoffs/store.ts, src/hooks/scripts.ts, src/merge/atomicWrite.ts, README.md, docs/doctrine.md, docs/enterprise-forks.md, docs/plugins.md, SECURITY.md, CONTRIBUTING.md, GOVERNANCE.md, evals/README.md, .github/release-controls-checklist.md, docs/specs/prove-behavior-and-value.md, docs/specs/plugin-lifecycle.md, docs/specs/apm-canonical-distribution.md, docs/specs/orchestrator-context.md, docs/specs/enterprise-upstream-lane.md, website/src/remark/repoLinks.ts, website/docusaurus.config.ts]
depends_on: [docs/plans/014-lean-repository-01.md]
---

# A lean repository — file 2 of 2: the records move to their own branch

This file is self-contained. It is the second of two `/st-plan` artifacts that make the git repository lean for
enterprise forks and git-sourced installs without losing anything of the product, and it ships as its own pull
request after file 1 (`docs/plans/014-lean-repository-01.md`) merges.

intent chosen: refactor because the request is a structure change with the product's behaviour preserved (the npm
package, the plugin distribution, the APM content and the CLI do not change) and asks for a clean-up; no dependency
moves, so the migration intent does not fire.

## Context

`main` carries the maintainer's working records beside the product: run records and ledgers, the deferral inbox,
handoffs, QA evidence, plans, eval runs and measurement snapshots — 392 of the 1,694 tracked files and 9.8 of 31.0 MiB
at `9239379c` (measured with `git ls-tree -r -l`). Every channel that takes the tree takes them too:

- **Forks** merge each release commit whole (`scripts/upstream.mjs:2129`), and records were about 90% of the changed
  lines from v1.10.0 to v1.11.0 (37 of 462 files) and about 80% from v1.9.1 to v1.10.0.
- **APM** clones the whole tree at a tag and keeps it under `apm_modules/` (`docs/specs/apm-canonical-distribution.md:74-83`).
  The v1.11.0 tree is 1,691 files / 42.3 MiB, three uncompacted 4 MB eval summaries included.
- **A fork can't simply delete them.** Its own release runs `npm test` (`.github/workflows/fork-release.yml:304`), which
  pins upstream's records (`test/records/ledgers.test.ts:42-55`, `src/cli/docs/measurements.ts:103`).
- **They collide with a fork's own records** at the same paths (`.stamity/inbox.md`, `docs/plans/` numbering).

This file moves the records to an orphan `records` branch in this repository, at the same relative paths. It decouples
the tests, the measurements generator and CI first, so `main` works with no record present. History is not rewritten.

**Out of scope:**
- file 1;
- any product (CLI or `content/**`) change;
- a release cut;
- the items on the drop list.

## Decisions

### The maintainer's walk (2026-10-01; every answer the recommended option)

| Question | Answer |
|---|---|
| Where the records live | An orphan `records` branch in this repository: one public repository still, forks merge only release tags so they never receive it, and the pattern is `plugin-dist`'s. |
| How the maintainer's own records are written | In place: records stay as ordinary files where the commands write them today, hidden from `main` by a local exclude; `node scripts/records.mjs commit` publishes them after the gates pass on that exact commit; `restore` fills a fresh clone. No product change. |
| Whether the "no records on `main`" check binds forks | Canonical repository only. |
| How it ships | Two pull requests (file 1 first); no release cut by this plan. |
| Whether the new records CI job blocks merges | Yes in `zomarit/stamity`; skipped, and counted as passing, everywhere else. |

### Settled by this plan (declared defaults; the maintainer may reverse any before the run starts)

1. **The records set** is `.stamity/runs/**`, `.stamity/inbox.md`, `.stamity/handoffs/**` except `.stamity/handoffs/.gitkeep`
   (which init's scaffold writes, `src/emit/stateScaffold.ts:32-44`), `.stamity/evidence/**`, `docs/plans/**`,
   `evals/runs/**`, `evals/measurements/**`, `evals/reach/**`, `evals/EVIDENCE-STORAGE.md` and
   `evals/ARCHIVE-MIGRATION-2026-09-15.json`. `.stamity/learnings/**`, `docs/specs/**` and every other path stay on `main`.
2. **No symlinks.** The ledger (`src/runs/ledgerStore.ts:157-165`), the eval runner (`scripts/eval/run.mjs:147-149`) and
   the handoff archive (`src/merge/atomicWrite.ts:710-713`) refuse a symlinked record folder, and the resume card
   ignores one (`.stamity/generated/hooks/claude/stamity-session-start.mjs:957-960`). So the records stay real files at
   their usual paths, and only the local `.git/info/exclude` hides them from `main`. `main`'s `.gitignore` gains no
   rule, so forks inherit none.
3. **The publish filter is `main`'s own `.gitignore`.** `scripts/records.mjs commit` lists files with
   `git ls-files -z --others --cached --exclude-from=.gitignore -- <records pathspecs>`. That applies the runtime and raw
   eval rules (`.gitignore:38-53`) and not the local exclude block.
4. **The measurements page stays on `main`** as a generated page.
   - Its three inputs are named by constants on `main`: `RUN_OF_RECORD_PATH` and `REACH_SNAPSHOT_PATH` exist; a new
     `MEASUREMENT_SNAPSHOT_PATH` replaces the newest-by-filename pick. A new snapshot on `records` changes nothing until
     `main` moves the pin.
   - With none of the three inputs on disk (`main`'s CI, a fork), `generate-docs.mjs --page all` skips the page with a
     notice.
   - With only some present, or under an explicit `--page measurements` with any missing, it exits 1 naming them. A
     partial restore is a broken state, not a fork.
5. **Record links on the hand pages and the generated page become absolute** `https://github.com/zomarit/stamity/blob/records/<path>`
   URLs. The link checks already allow that host (`test/docsPages.test.ts:407`). The site's link rewriter leaves
   absolute URLs alone (`website/src/remark/repoLinks.ts:86`).
6. **Spec citations into moved paths get one dated banner per section**, at the Prove phase, not per-citation rewrites
   (the replay precedent, `docs/specs/orchestrator-context.md:4,45,148,564`). Historical CHANGELOG entries stay as
   written.
7. **The branch starts as one orphan import commit** built from the records at the pull request's last commit before
   the removal. Each record's earlier history stays in `main`'s history. The pull request merges by **fast-forward**
   (`git push origin <gated head>:main` under the admin bypass), so the import commit's base sha stays on `main`.
8. **Release-close order.** Publish records first (`records.mjs commit`), then land `main`'s pin bump with the
   regenerated page. The other order turns `main`'s records job red until the records arrive.
9. **`records.mjs commit`'s gates run through an injectable gate runner** in the module API, used by the tests. The CLI
   has no flag that skips a gate.
10. **The records-only CI lane retires.** With no record on `main`, nothing can be records-only.

## Behavioral invariants

| # | Invariant | Verified by | Status |
|---|---|---|---|
| 1 | The npm package's file list and bytes do not change (`files: ["dist"]`; the measurements code is not bundled into `dist` — the generators load the TypeScript sources natively) | `npm run build && npm pack --dry-run --json` before and after (`r0`, `r8`) | uncovered → unit 0 |
| 2 | The plugin distribution tree does not change | `scripts/build-plugin-distribution.mjs` output hashed before and after (`r0`, `r8`) | uncovered → unit 0 |
| 3 | The APM package, plugin manifests and every generated page other than `docs/measurements.md` regenerate byte-identically | CI generate-and-diff (`.github/workflows/ci.yml:318-329`) | covered |
| 4 | The CLI behaves the same | `npm test` (no product suite changes behaviour) | covered |
| 5 | Every record reaches the `records` branch with the same blob id | `node scripts/records.mjs verify --base <sha>` (`r4` builds it; `r6` and `r7` run it); `r0` keeps the pre-move manifest | uncovered → unit 0 |
| 6 | Every record-integrity check still runs against the real records | `npm run test:records` over the restored records (`r1`, `r1b`, `r2`, `r3`), in CI's merge-blocking `records` job (`r5`) | covered once `r1` lands; `r0` counts today's record-reading cases |
| 7 | The measurements page keeps the same numbers; only its record links change | `r0` keeps the page; `r2` diffs the regenerated page and finds only link-target changes | uncovered → unit 0 |
| 8 | History is not rewritten | `git merge-base --is-ancestor 9239379c39e2a4440581da1eaf6f7bb6a6ab204e origin/main` after the merge | covered (fast-forward merge) |
| 9 | The upstream lane integrates a release as before | `npx vitest run test/upstream` | covered |

## Spec delta

This slice adds three requirements and modifies existing ones. Every `path:line` was read at `9239379c`. `/st-work`
merges it at its Prove phase. `<date>` is the merge date and `<unit>` the unit id.

### A. `docs/specs/prove-behavior-and-value.md`

#### REQ-PROVE-023 — Records live on the `records` branch, and `main` tracks none (ADDED)

The repository's records live on an orphan branch `records`, at the same relative paths:

- `.stamity/runs/**`, `.stamity/inbox.md`, `.stamity/handoffs/**` except `.stamity/handoffs/.gitkeep`, `.stamity/evidence/**`
- `docs/plans/**`
- `evals/runs/**`, `evals/measurements/**`, `evals/reach/**`
- `evals/EVIDENCE-STORAGE.md`, `evals/ARCHIVE-MIGRATION-2026-09-15.json`

After the move `main` tracks none of them. `.stamity/learnings/**`, `.stamity/handoffs/.gitkeep` and `docs/specs/**`
stay. History is not rewritten.

- **The import.** The branch starts as one import commit, built from those paths at the pull request's last commit
  before the removal.
- **The ruleset.** A ruleset on `records` blocks force pushes and deletion, with an empty bypass list.
- **The maintainer's checkout.** Records stay as ordinary files at their usual paths, hidden from `main`'s index by
  entries that `node scripts/records.mjs setup` writes to `.git/info/exclude`. `main`'s `.gitignore` gains no rule and
  no symlink is used.
- **The guard** runs only in the canonical repository: `ci.yml`'s `records` job is guarded to
  `github.repository == 'zomarit/stamity'`.

- **Evidence:** today's readers are `RUNS_DIR`, `SNAPSHOT_DIR`, `REACH_SNAPSHOT_PATH` and `RUN_OF_RECORD_PATH`
  (`src/cli/docs/measurements.ts:75,78,84,103`), `trackedLedgers` (`test/records/ledgers.test.ts:214-219`, through
  `git ls-files -- .stamity/runs`), and the records-only lane's path list (`scripts/ci/records-only.mjs:28-33`).
- **Expand/contract.** Expand: `records.mjs init` creates the branch and `verify` proves blob identity. Contract: the
  removal commit, last in the same pull request. Rollback: revert the removal commit; history holds every blob.
- **Proof:** tests of `records.mjs guard` and `verify` over fixture repositories, CI, and one QA row for the ruleset.

Criteria:
- GIVEN `main` after the move WHEN `node scripts/records.mjs guard` runs THEN it exits 0. GIVEN a commit that adds
  `.stamity/runs/x/record.md` THEN it exits 1 naming that path.
- GIVEN the pre-removal sha WHEN `node scripts/records.mjs verify --base <sha>` runs THEN it exits 0, and every moved
  path at `<sha>` has the same blob id on `origin/records`.
- GIVEN `main` and `records` WHEN `git merge-base origin/main origin/records` runs THEN it exits 1, since the records
  branch is an orphan. AND `9239379c` is an ancestor of `main`.
- GIVEN `git diff <pre-PR base> HEAD -- .gitignore` THEN the output is empty. AND `.stamity/learnings/`,
  `.stamity/handoffs/.gitkeep` and `docs/specs/` are still tracked in `HEAD`.
- GIVEN the ruleset read through `gh api repos/zomarit/stamity/rulesets/<id>` THEN it targets `refs/heads/records`,
  carries the `deletion` and `non_fast_forward` rules, and has an empty bypass list. `judgment: maintainer`
- GIVEN a repository other than `zomarit/stamity` WHEN CI runs THEN the `records` job is skipped.

#### REQ-PROVE-024 — `scripts/records.mjs` publishes and restores records without touching `main` (ADDED)

Six verbs. Exit codes: 0 done, 1 refused, 2 bad arguments.

1. **`setup`** writes a marked block of `.git/info/exclude` entries for the record paths, idempotently, then runs `restore`.
2. **`restore [--ref <ref>] [--no-fetch] [--force]`** writes each file of the records branch (default `origin/records`)
   under the record paths into the checkout.
   - It refuses, listing the paths, where a local file differs, unless `--force` is given.
   - It never deletes a local file and never writes through a symlinked parent.
3. **`commit -m <msg> [--dry-run] [--allow-deletions]`** builds a commit on top of `origin/records` from the record
   files on disk, through a separate index, so `main`'s index is never touched.
   - The file list is `main`'s `.gitignore`-filtered list (settled default 3).
   - It refuses symlinks, and refuses deletions unless `--allow-deletions` is given.
   - It gates the exact commit before pushing: the leak gate with `--root` and `repo-hygiene.mjs --repo <scratch>
     --base origin/records` on a scratch worktree of the commit, then `npm run test:records`.
   - It pushes without force. `--dry-run` runs the gates and moves no ref.
4. **`verify --base <sha> [--ref <ref>]`** proves every record path at `<sha>` has the same blob id at the ref.
5. **`guard`** exits 1 naming each record path tracked in `HEAD`.
6. **`init --base <sha>`** is run once. It creates the orphan branch from the records at `<sha>`, plus four files from
   templates under `scripts/records/`: `README.md`, `.gitignore`, `.gitattributes` and `.github/workflows/records.yml`.

- **Evidence:** hygiene runs its runtime check over tracked files (`scripts/repo-hygiene.mjs:47-57`), but its
  raw-evidence, size and email checks only with `--base` (`:162-203`). The leak gate's `--root` is at
  `scripts/leak-gate.mjs:22-24`. The exit-code convention is `scripts/merge-ready-rate.mjs:28`.
- **Proof:** `test/ci/recordsScript.test.ts` over temporary repositories with a local bare remote.

Criteria:
- GIVEN `setup` run twice THEN `.git/info/exclude` is byte-identical after the second run. AND `git status --porcelain`
  lists no record path.
- GIVEN a local record file that differs from the ref WHEN `restore` runs THEN it exits 1 naming the file and writes
  nothing. With `--force` it overwrites. GIVEN a local file absent from the ref THEN it still exists after either run.
- GIVEN `commit` WHEN it runs THEN `main`'s `git diff --cached` is unchanged, and no ref other than `records` and
  `origin/records` moves.
- GIVEN a symlink, a `calls/` payload or a `reports/` file among the records WHEN `commit` builds THEN the symlink
  refuses the run (exit 1 naming it), and the other two are absent from the built tree.
- GIVEN a record deleted on disk WHEN `commit` runs without `--allow-deletions` THEN it exits 1 naming the path.
- GIVEN a built commit that the leak gate, the hygiene check or the records suite fails WHEN `commit` runs THEN nothing
  is pushed and it exits 1 naming the gate. GIVEN `--dry-run` THEN the gates run and no ref moves.
- GIVEN `origin/records` moved since the fetch WHEN the push is rejected as non-fast-forward THEN `commit` exits 1
  naming `restore`. No force push is attempted.
- GIVEN a blob that differs at one path WHEN `verify` runs THEN it exits 1 naming that path.
- GIVEN a `records` branch that already exists locally or on the remote WHEN `init` runs THEN it exits 1 and no ref
  moves.

#### REQ-PROVE-025 — The records suite runs apart from `npm test`, wherever records are restored (ADDED)

Every record-integrity case moves into `test/records/**` and runs as `npm run test:records` (`vitest.records.config.ts`).
The cases come from:
- `test/records/ledgers.test.ts` and `test/records/specStatus.test.ts`;
- `test/authoring/specPlanCoverage.test.ts`;
- `test/cli/docs/measurements.test.ts` and `test/docsPages.test.ts`;
- `test/evals/rubricCoreHash.test.ts` and `test/evals/manualRunner.test.ts`.

How the suite behaves:
- It reads the records at their usual repo-root paths after `records.mjs restore`, and enumerates them from disk,
  never through `git ls-files`.
- Its global setup fails loudly when the records are absent.
- `npm test` excludes `test/records/**` and reads no record. Product tests that borrowed a real record get small
  synthetic fixtures.

The suite runs in four places:
1. `ci.yml`'s `records` job, guarded to `zomarit/stamity` and required through `all-ci-checks` there (skipped, and
   counted as passing, elsewhere). That job also runs the leak gate over the restored records, the measurements drift
   check and `records.mjs guard`.
2. `release.yml`'s canonical `gates` job, after a restore.
3. `.github/workflows/records.yml` on every push to `records`.
4. The gate of `records.mjs commit`.

- **Evidence:** `vitest.config.ts:75` includes `test/**/*.test.ts`. `test/records/ledgers.test.ts:214-219` reads
  `git ls-files`, and its "reports folder" cases (`:588-601`) use `git check-ignore`, which reads `.git/info/exclude`.
  `test/records/specStatus.test.ts:219-227` reads `docs/plans/` when the module loads.
- **Proof:** tests and CI.

Criteria:
- GIVEN a fresh clone of `main` with no record on disk WHEN `npm test` runs THEN it exits 0. WHEN `npm run test:records`
  runs THEN it exits non-zero with a message naming `node scripts/records.mjs restore`.
- GIVEN a checkout prepared by `records.mjs setup` (exclude entries present) WHEN `npm run test:records` runs THEN it
  exits 0, AND the ledger case lists at least one `ledger.jsonl` under `.stamity/runs/`. WHEN `npm test` runs THEN it
  exits 0 too.
- GIVEN `package.json` THEN a `test:records` script runs `vitest.records.config.ts`, AND `npm test` runs no file under
  `test/records/`.
- GIVEN `ci.yml` and `release.yml` THEN each restores `origin/records` before `npm run test:records`. AND
  `scripts/ci/records-only.mjs` and the `changes` job are absent. AND `all-ci-checks` requires `records` to read
  `success` in `zomarit/stamity` and `skipped` elsewhere. AND `fork-release.yml` is byte-unchanged.
- GIVEN a push to `records` WHEN `records.yml` runs THEN the leak gate, the hygiene check and `npm run test:records`
  each run, and any failure is red.

#### REQ-PROVE-016 — The spec status gate (MODIFIED)

Replaces `docs/specs/prove-behavior-and-value.md:372-374`, "A records test requires every `docs/specs/*.md` `status` to
read `design`, `shipped` or `shipped-with-<semver>` and refuses `draft`; a spec named by a plan whose `stamp:` commit
precedes the newest `v*` tag may not read `design` either (`test/records/specStatus.test.ts:47`)." New text:

A test requires every `docs/specs/*.md` `status` to read `design`, `shipped` or `shipped-with-<semver>`, and refuses
`draft`. It reads `docs/specs/` alone and runs under `npm test`. A spec named by a plan whose `stamp:` commit precedes
the newest `v*` tag may not read `design` either. That half reads `docs/plans/` from the restored records
(REQ-PROVE-023) and runs in the records suite (REQ-PROVE-025). (Amended `<date>`, plan 014 file 2, unit `<unit>`.)

- **Evidence:** the vocabulary is `test/records/specStatus.test.ts:47`, its case is at `:250-255`, the shipped scan is at
  `:262-269`, and the plan read is at `:220`, `:224-227`.

Criteria:
- GIVEN a spec reading `draft` in a checkout with no `docs/plans/` WHEN `npm test` runs THEN it fails naming the file
  and the three forms.
- GIVEN a spec reading `design` that a pre-tag plan names WHEN `npm run test:records` runs THEN it fails naming the plan
  and the tag.

#### REQ-PROVE-017 — Eval documentation currency (MODIFIED, appended)

Added after `docs/specs/prove-behavior-and-value.md:395`: Amended `<date>` (plan 014 file 2). The run artifacts now
live on the `records` branch, the route of record's protocol `evals/runs/2026-09-11-run-24/PROTOCOL.md` included.
`evals/README.md` links them as `https://github.com/zomarit/stamity/blob/records/<path>`. The release's composed
artifact reaches `records` through `records.mjs commit` before the tag, and `main`'s `RUN_OF_RECORD_PATH` names it.

- **Evidence:** `evals/README.md:37-38`.

Criteria:
- GIVEN `evals/README.md` THEN every link into `evals/runs/` uses the absolute records form, AND the current-rubric row
  still equals the default profile's `rubric` (`test/evals/readmeCurrency.test.ts`).

#### REQ-PROVE-020 — The measurement report (MODIFIED)

Section banner, as the first line under the heading:

> The records moved to the `records` branch on `<date>`. Every path below under `.stamity/runs/`, `.stamity/evidence/`,
> `.stamity/handoffs/`, `.stamity/inbox.md`, `docs/plans/`, `evals/runs/`, `evals/measurements/` or `evals/reach/`
> reads on that branch.

Replaces `docs/specs/prove-behavior-and-value.md:433-436`, "`docs/measurements.md` (absent at `949bde9`) renders from
the committed snapshot `evals/measurements/merge-ready-<date>.json` — 5 of 7 at the first — refreshed per release by
`node scripts/merge-ready-rate.mjs --write` (`.github/release-controls-checklist.md:228-233`)". New text:

`docs/measurements.md` stays on `main` as a generated page. Its inputs are named by three constants on `main`:
`RUN_OF_RECORD_PATH`, `REACH_SNAPSHOT_PATH`, and `MEASUREMENT_SNAPSHOT_PATH`. The last names one
`evals/measurements/merge-ready-<date>.json` and replaces the newest-by-filename pick. The inputs themselves live on the
`records` branch, so a new snapshot there changes nothing until `main` moves the pin.

- `node scripts/merge-ready-rate.mjs --write` writes the snapshot in the checkout, and `records.mjs commit` publishes it.
- With none of the three inputs on disk, `generate-docs.mjs --page all` skips the page with a printed notice. With some
  but not all, or under `--page measurements` with any missing, it exits 1 naming them.
- The page links each record as `https://github.com/zomarit/stamity/blob/records/<path>`. The hand-page links into
  records in `README.md`, `docs/doctrine.md` and `docs/enterprise-forks.md` use the same form.

(Amended `<date>`, plan 014 file 2, unit `<unit>`; it read as quoted above. The stale checklist citation `:228-233` is
corrected in the same edit.)

- **Evidence:** `readMeasurementSnapshot` takes the newest file by filename (`src/cli/docs/measurements.ts:861-891`,
  `snapshotFiles(...).at(-1)` at `:882`). The other pins are at `:84` and `:103`.

Criteria:
- GIVEN `main` THEN each of the three constants names exactly one file, and `readMeasurementSnapshot` reads the pinned
  path.
- GIVEN the records restored and a later `merge-ready-<date>.json` added WHEN the page regenerates THEN
  `docs/measurements.md` is byte-identical.
- GIVEN no record on disk WHEN `node scripts/generate-docs.mjs` runs THEN it exits 0, prints a notice naming the skipped
  page and the missing inputs, and leaves `docs/measurements.md` unchanged. With `--page measurements`, or with only
  some inputs present, it exits 1 naming the missing ones.
- GIVEN the page, `README.md`, `docs/doctrine.md` and `docs/enterprise-forks.md` THEN no repo-relative link points into
  a record path.
- GIVEN the pinned inputs WHEN the page regenerates twice THEN the outputs are byte-identical.

#### REQ-PROVE-021 — QA automation and binding (MODIFIED)

Replaces `docs/specs/prove-behavior-and-value.md:567-568`, "It writes `.stamity/evidence/qa-<sha>.json` beside the
browser evidence (`…/browser-caec7fa.json`)". New text:

It writes `.stamity/evidence/qa-<sha>.json` at that path in the checkout. `main` does not track the path
(REQ-PROVE-023). The file reaches the `records` branch only through `node scripts/records.mjs commit`, where it sits
beside the browser evidence (`.stamity/evidence/browser-caec7fa.json` on that branch).

Criteria:
- GIVEN a harness run in a checkout prepared by `setup` THEN `git status --porcelain` lists no `.stamity/evidence/` path.
- GIVEN `records.mjs commit --dry-run` THEN the built tree carries the new evidence file.

### B. `docs/specs/plugin-lifecycle.md`

#### REQ-PLUGIN-020 — the records-only amendment superseded (MODIFIED)

The paragraph at `docs/specs/plugin-lifecycle.md:910-915` keeps its text and gains the lead "**Superseded `<date>`** by
the amendment below." Appended after it:

Amended `<date>` (plan 014 file 2, unit `<unit>`). With the records on the `records` branch, `main` carries no record.
`scripts/ci/records-only.mjs` and `ci.yml`'s `changes` → `records` split retire, so "merge-blocking through
`all-ci-checks`" holds on every change again. `ci.yml`'s new `records` job restores the records and runs the records
suite in the canonical repository.

Criteria:
- GIVEN `ci.yml` THEN no job reads `records_only`, AND `plugin-route`, `check` and `apm-install` carry no records-only
  condition (`test/ci/workflow.test.ts`).

#### REQ-PLUGIN-025 — Eval coverage for the generated command and plugin-mode invocation (MODIFIED)

Replaces `docs/specs/plugin-lifecycle.md:1162-1163`, "the committed run artifact under `evals/runs/` records a per-metric
score". New text: "the run artifact under `evals/runs/` on the `records` branch, named by `main`'s
`RUN_OF_RECORD_PATH`, records a per-metric score".

Criteria:
- GIVEN the release eval run WHEN it is published THEN its artifact is committed to `records` by `records.mjs commit`,
  AND `main`'s `RUN_OF_RECORD_PATH` names its `RESULTS.md`.

### C. `docs/specs/apm-canonical-distribution.md`

#### REQ-APM-002 — the apm-install smoke on every change (MODIFIED)

Replaces `docs/specs/apm-canonical-distribution.md:118-125`. New text: "`ci.yml` runs the smoke at 0.29.1 (minimum),
0.30.0 (current) and 0.29.0 (`--expect-failure`), required through `all-ci-checks` on every change." It previously added
"on every change that is not records-only", and said a records-only change skips `apm-install` beside `check` and
`plugin-route`, with the `records` job running in their place (`.github/workflows/ci.yml:19-31` at `b855876a`). The new
text records that amendment with its date, plan and unit.

Criteria:
- GIVEN `ci.yml` THEN the `apm-install` job carries no records-only condition.

**The vendored-tree prose (amendment, no requirement).** Replaces `:77-78`, "870 files and 19 MB for this repository
(tests, evals, source, site)". New text: "`<N>` files and `<S>` MB for this repository at `<sha>`, measured `<date>`
after the records moved to the `records` branch (source, tests, the current eval inputs, site)", with the amendment note
in the convention of `:123-125`. `<N>`, `<S>` and `<sha>` come from unit `r8-after-measure`. The vendored-tree note in
`docs/getting-started.md:125-128` states no figure and stays.

### D. `docs/specs/orchestrator-context.md`

#### REQ-CTX-006 — the ledger criteria (MODIFIED)

- **The `:1174` criterion.** It reads "GIVEN `test/records/ledgers.test.ts` WHEN it validates every committed ledger
  THEN:". It becomes "GIVEN the records restored by `node scripts/records.mjs restore` WHEN `npm run test:records`
  validates every `ledger.jsonl` under `.stamity/runs/` on disk THEN:". The three sub-bullets stay.
- **The `:1188-1191` criterion.** It becomes "GIVEN a synthetic run fixture whose ledger rows carry `report` and
  `decision_needed` WHEN `computeMergeReadyRate` reads it under `npm test` THEN it reports the same open-row count and
  the same rate it reports with those two keys removed."

### E. `docs/specs/enterprise-upstream-lane.md`

#### REQ-UPSTREAM-001 — the example configuration (MODIFIED)

The example `generatedPaths` at `docs/specs/enterprise-upstream-lane.md:157` drops `"docs/measurements.md"`.

#### REQ-UPSTREAM-007 — the recommended lists (MODIFIED)

Replaces `:308-310`, "with `.stamity/manifest.json` and `docs/measurements.md` added because `sync` and plain
`generate-docs.mjs` write them". New text: "with `.stamity/manifest.json` added because `sync` writes it.
`docs/measurements.md` is not listed: a fork holds no records, and `generate-docs.mjs --page all` skips that page there
with a notice (REQ-PROVE-020)."

Criteria:
- GIVEN a fork fixture with no records WHEN the guide's regenerate list runs THEN `docs/measurements.md` is
  byte-unchanged, AND no tracked path outside `generatedPaths` is reported, AND `docs/enterprise-forks.md` no longer
  lists or justifies the page.

### F. The dated banners

Every other section of `docs/specs/*.md` that cites a moved path gets the banner text shown under REQ-PROVE-020. Find
the sections with
`git grep -n -E '\.stamity/(runs|evidence|handoffs)/|\.stamity/inbox\.md|docs/plans/|evals/(runs|measurements|reach)/' -- docs/specs`.
The banner is navigation, not a requirement change.

## Units

No unit touches `content/**`, so no eval case moves and no dogfood sync runs.

### r0-baselines — capture the before-state the invariants compare against

| Field | Content |
|---|---|
| `id` | r0-baselines |
| `requirements` | REQ-PROVE-023 |
| `files` | the executing run's own record only (`.stamity/runs/<run>/record.md`), plus scratch outputs outside the repository |
| `interfaces` | With `<base>` = the `main` commit the run starts from, capture into the record: **(1)** `npm run build && npm pack --dry-run --json` → each file's `path` and `size`, plus the reported `shasum` and `integrity`. **(2)** `node scripts/build-plugin-distribution.mjs --out <scratch>/dist-before --runtime <scratch>/runtime-before --source-commit <base> --source-commit-date <base's committer date, ISO> --version <package.json version>`, then the sha256 of the sorted `<path>\t<sha256>` list of every file under `--out`. Provenance is an input, never a clock read (`scripts/build-plugin-distribution.mjs:31`), so fixed inputs give a fixed tree. **(3)** The records manifest: `git ls-tree -r <base> -- .stamity/runs .stamity/inbox.md .stamity/handoffs .stamity/evidence docs/plans evals/runs evals/measurements evals/reach evals/EVIDENCE-STORAGE.md evals/ARCHIVE-MIGRATION-2026-09-15.json`, minus `.stamity/handoffs/.gitkeep`, as a row count plus sha256. **(4)** `sha256` of `docs/measurements.md` and of every generated page `node scripts/generate-docs.mjs` writes. **(5)** The count of record-reading test cases in the census below, with names. |
| `testCriteria` | **Given** `<base>`, **when** the five captures run, **then** each command exits 0. **And** the manifest count equals `git ls-tree -r --name-only <base> -- <the same pathspecs> \| grep -v '^\.stamity/handoffs/\.gitkeep$' \| wc -l`. **And** two consecutive runs of capture (2) print the same hash, proving the tree is deterministic before anything depends on it. |
| `edgeCases` | Capture (2) differs between two runs → record the differing files. Invariant 2 is then compared over the remaining files only, with the reason. `npm pack --dry-run --json` reports a different `shasum` for an unchanged file list → the build is not byte-reproducible. Invariant 1 then compares the file list and sizes only, and says so in the record. |
| `depends_on` | none |
| `verify` | the five capture commands exit 0, and capture (2) is stable across two runs |

### r1-records-suite — the records suite, and the ledger and spec-status splits

| Field | Content |
|---|---|
| `id` | r1-records-suite |
| `requirements` | REQ-PROVE-025, REQ-PROVE-016, REQ-CTX-006 |
| `files` | `vitest.records.config.ts` (new), `vitest.config.ts`, `package.json`, `test/support/recordsPresent.ts` (new), `test/support/recordGates.ts` (new), `test/support/specStatusRules.ts` (new), `test/records/ledgers.test.ts`, `test/records/specStatus.test.ts`, `test/runs/ledgerGates.test.ts` (new), `test/authoring/specStatusRules.test.ts` (new) |
| `interfaces` | **`vitest.records.config.ts`:** `defineConfig({ test: { include: ["test/records/**/*.test.ts"], environment: "node", testTimeout: 180_000, globalSetup: ["test/support/recordsPresent.ts"] } })`. The timeout matches the leak-gate budget at `test/ci/leakGate.test.ts:68`. **`test/support/recordsPresent.ts`** (global setup, default export) throws unless all four hold: `.stamity/runs/*/ledger.jsonl` matches at least one file; `docs/plans/*.md` matches at least one; `evals/runs/` holds at least one directory named like `2026-10-01-run-39`; `evals/measurements/` holds at least one `merge-ready-*.json`. The message: "The records are not in this checkout. Run `node scripts/records.mjs restore` (a fresh clone: `node scripts/records.mjs setup`), then `npm run test:records`." **`package.json`:** add `"test:records": "vitest run --config vitest.records.config.ts"` beside `"test": "vitest run"`. **`vitest.config.ts`:** the root `include: ["test/**/*.test.ts"]` (`:75`) gains `exclude: [...configDefaults.exclude, "test/records/**"]`. The Windows `parallel` project (`:51-58`, `include: ["test/**/*.test.ts"]`, `exclude: [...configDefaults.exclude, ...heavy]`) gains `"test/records/**"` in its exclude; confirm `heavy` names no `test/records/` file. **Ledgers:** the pure functions and constants at `test/records/ledgers.test.ts:78-229` (`parseInbox` `:130`, `inboxRefs` `:194`, the deferred-row accounting `:205-211`, `INBOX_PATH` `:34`, the legacy pins `:42-55`) move to `test/support/recordGates.ts`. The tree cases stay in `test/records/ledgers.test.ts` (`:231-330`: "finds the ledgers to check", parse, unique ids, legacy vocabulary, no `open` row, deferred accounting, and the three inbox cases), with `trackedLedgers` (`:214-219`, `git ls-files -- .stamity/runs`) replaced by `ledgersOnDisk()`: `.stamity/runs/<dir>/ledger.jsonl` for each directory, POSIX-spelled and sorted. The fixture cases (`:349-568`) move to `test/runs/ledgerGates.test.ts`. So do the two `.gitignore` cases (`:588-601`), made hermetic: `mkdtemp`, `git init`, copy `main`'s `.gitignore` in, then `git -C <tmp> check-ignore -q <path>` with the same expectations. In a checkout with the local exclude block, `git check-ignore` reads `.git/info/exclude` and would flip "leaves the ledger and the run record tracked". **Spec status:** the pure functions at `test/records/specStatus.test.ts:65-217` (`frontmatterField`, `danglingProblems` `:170-173`, the `SPEC_REFERENCE` scan, the shipped-spec state machine `:185-217`) move to `test/support/specStatusRules.ts`. The vocabulary case (`:250`, over `docs/specs/` alone) and the fixture cases (`:283-378`) move to `test/authoring/specStatusRules.test.ts`. `test/records/specStatus.test.ts` keeps "finds the specs and the plans that name them" (`:245`), "names no spec file the tree does not carry" (`:257`) and the shipped check (`:262`); that last one needs `main`'s tags and full history. Each moved case keeps its name, with a `TEST CHANGE, justified:` comment naming this unit. |
| `testCriteria` | **Given** this checkout with the records still tracked, **when** `npm run test:records` runs, **then** it exits 0 and reports the moved ledger and spec-status cases. **Given** the same checkout, **when** `npm test` runs, **then** it exits 0 and runs no file under `test/records/`; the new `test/runs/ledgerGates.test.ts` and `test/authoring/specStatusRules.test.ts` cases pass. **Given** a temporary copy of the tree with `.stamity/runs` removed, **when** `npm run test:records` runs there, **then** it exits non-zero with the setup message. **Given** a scratch clone with the exclude block `records.mjs setup` will write, **when** `npx vitest run test/runs/ledgerGates.test.ts` runs, **then** the two `.gitignore` cases pass. |
| `edgeCases` | A moved case drops a `src/` file below a per-file coverage floor: none is expected, because the floors bind only `src/merge/**` and `src/emit/**` (`vitest.config.ts:111-197`) and no moved case imports them. Still, run `npm test -- --coverage` once. A Windows path in `ledgersOnDisk` must be spelled POSIX: `join` then `replaceAll("\\", "/")`. `docs/plans/` absent in the records suite → the global setup catches it before any case runs. |
| `depends_on` | r0-baselines |
| `verify` | `npm run test:records && npm test && npm run lint && npm run typecheck` |

### r1b-records-suite-eval-cases — the eval and plan-coverage cases move or go synthetic

| Field | Content |
|---|---|
| `id` | r1b-records-suite-eval-cases |
| `requirements` | REQ-PROVE-025 |
| `files` | `test/authoring/specPlanCoverage.test.ts`, `test/records/specPlanCoverage.test.ts` (new), `test/evals/rubricCoreHash.test.ts` (moved to `test/records/rubricCoreHash.test.ts`), `test/evals/manualRunner.test.ts`, `test/records/run27Repeats.test.ts` (new), `test/ci/evidenceSummary.test.ts` |
| `interfaces` | **`test/authoring/specPlanCoverage.test.ts`:** the case at `:73` ("reads the persisted candidate plan with all ten requirements", `readFileSync("docs/plans/006-finish-implementation.md")` against `docs/specs/implementation-finish.md`) moves to `test/records/specPlanCoverage.test.ts`. The case at `:220` ("scopes all twenty-two requirements of the persisted Prove plan", plan 007) becomes synthetic in place. The plan text has a `## Spec delta` line `ADDED: REQ-X-001 … REQ-X-003 … ADDED at the merge: REQ-X-004`, plus a `## Units` section of table-form units whose `requirements` rows cover all four. The spec has `## Requirements` with four `### REQ-X-00n` headings. Assert `status` `pass` and `scope` length 4. These are the two shapes plan 007 adds over the case at `:81`: the colon form, and a second ADDED clause. **`test/evals/rubricCoreHash.test.ts`** moves whole to `test/records/rubricCoreHash.test.ts`. It reads the newest `evals/runs/*/inputs.json` (`:36-58`) and imports `REPO_ROOT` and `RUBRIC_FILE` from `test/evals/support.ts`; fix the relative imports. **`test/evals/manualRunner.test.ts`:** the run-27 block (`:1430-1440`) moves to `test/records/run27Repeats.test.ts`. That covers the module-level read `JSON.parse(read("evals/runs/2026-09-15-run-27/summary.json"))` at `:1434`, the `run27CandidateInHistory` probe, and the `it.skipIf` case "reads every one of run 27's eight repeats as disposed…". It keeps its imports from `scripts/eval/run.mjs` (`undisposedRepeats`, `parseCase`) and `CASES_DIR`. In the records job the full history makes the candidate visible, so the skip no longer fires there. **`test/ci/evidenceSummary.test.ts`:** the case at `:59` reads run 24's real `summary.json` at `:60`. It builds its input from the existing synthetic `original()` (`:16-26`) instead, with `aggregate.rows` and `coverage` taken from `test/evals/fixtures/historical-replay/run-24/calls.json` as `:65-67` already does. The case keeps its intent: the compaction keeps the metrics, verdicts and advisory fields and drops only `aggregate.rows` and `coverage`. |
| `testCriteria` | **Given** this checkout, **when** `npm run test:records` runs, **then** the moved cases pass. **When** `npm test` runs, **then** it passes with no `readFileSync` of `docs/plans/` or `evals/runs/` left outside `test/records/` (`rg -n "docs/plans/\|evals/runs/" test --glob '!test/records/**'` lists only comments, fixture strings and the `historical-replay` fixtures). |
| `edgeCases` | The run-27 probe meets a shallow checkout → it still skips, with its reason, as before. `test/evals/fixtures/historical-replay/**` stays; it holds the original pre-compaction bytes of archived evidence, not a copy of any tracked record (run 13's `summary.json` differs from the tracked compact one, checked at `9239379c`). |
| `depends_on` | r1-records-suite |
| `verify` | `npm run test:records && npm test && npm run lint && npm run typecheck` |

### r2-measurements-page — pinned inputs, absolute record links, and a generator that tolerates no records

| Field | Content |
|---|---|
| `id` | r2-measurements-page |
| `requirements` | REQ-PROVE-020, REQ-CTX-006 |
| `files` | `src/cli/docs/measurements.ts`, `scripts/generate-docs.mjs`, `docs/measurements.md`, `test/cli/docs/measurements.test.ts`, `test/cli/docs/llmsIndex.test.ts`, `test/records/measurements.test.ts` (new) |
| `interfaces` | See the block below the table. |
| `testCriteria` | The criteria of REQ-PROVE-020. **Given** `r0`'s copy of `docs/measurements.md`, **when** the page regenerates with the records present, **then** `git diff --word-diff` shows only link targets changing from relative to `https://github.com/zomarit/stamity/blob/records/…` (invariant 7). **Given** `npm test`, **then** it exits 0. **Given** `npm run test:records`, **then** it exits 0, the drift case included. |
| `edgeCases` | The pinned snapshot is missing but the other two inputs are present → `--page all` exits 1 (partial), naming it. A future release moves `RUN_OF_RECORD_PATH` and `MEASUREMENT_SNAPSHOT_PATH` in the same `main` commit as the regenerated page, after the records arrive (settled default 8). `src/cli/docs/**` is not bundled into `dist` (`grep -l RUN_OF_RECORD_PATH dist/*.js` finds nothing at `9239379c`), so the npm package does not move. |
| `depends_on` | r1-records-suite |
| `verify` | `npm test && npm run test:records && npm run lint && npm run typecheck && node scripts/generate-docs.mjs && git diff --exit-code -- docs ':!docs/measurements.md'` |

`r2-measurements-page` interfaces:

- **`src/cli/docs/measurements.ts` (current).**
  - `RUNS_DIR = ".stamity/runs"` (`:75`), `SNAPSHOT_DIR = "evals/measurements"` (`:78`),
    `REACH_SNAPSHOT_PATH = "evals/reach/npm-downloads-2026-09-14.json"` (`:84`),
    `RUN_OF_RECORD_PATH = "evals/runs/2026-10-01-run-39/RESULTS.md"` (`:103`).
  - `snapshotFiles(root)` lists `merge-ready-*.json`, sorted (`:862-868`).
  - `readMeasurementSnapshot(root = repoRoot())` reads `snapshotFiles(root).at(-1)` and fails with `VALIDATION_ERROR`
    when there is none (`:880-891`).
  - `writeMeasurementSnapshot(root, date)` never rewrites (`:900-918`).
  - `computeMergeReadyRate(root)` reads `.stamity/runs` and `CHANGELOG.md` from one root (`:730-748`).
  - The reach and run-of-record reads throw when missing (`:943-962`).
- **`src/cli/docs/measurements.ts` (new).**
  - `export const MEASUREMENT_SNAPSHOT_PATH = "evals/measurements/merge-ready-2026-10-01.json"`, beside
    `RUN_OF_RECORD_PATH`, with a doc comment saying a release moves it in the same `main` commit as the regenerated page.
  - `readMeasurementSnapshot(root = repoRoot(), path = MEASUREMENT_SNAPSHOT_PATH)` reads that path and fails naming it
    and `node scripts/records.mjs restore`. `snapshotFiles` stays for `writeMeasurementSnapshot`'s never-rewrite rule.
  - `export const RECORDS_BLOB_URL = "https://github.com/zomarit/stamity/blob/records/"`. Every link the page renders
    into a record path becomes `${RECORDS_BLOB_URL}${path}`: the snapshot, the run of record, its prior runs, the reach
    snapshot (link sites near `:1081`, `:1144`, `:1246`). Links into `main` paths stay relative.
  - `export function measurementInputs(root = repoRoot()): { present: string[]; missing: string[] }` checks
    `[RUN_OF_RECORD_PATH, REACH_SNAPSHOT_PATH, MEASUREMENT_SNAPSHOT_PATH]`.
  - `export function measurementsAction(which: string, inputs: { present: string[]; missing: string[] }): "render" | "skip" | { refuse: string[] }`
    decides: `which === "all"` and no input present → `"skip"`; any input missing otherwise → `{ refuse: missing }`;
    else `"render"`.
  - The module comment (`:39-47`) names the records branch.
- **`scripts/generate-docs.mjs`.** `render(which)` (`:68-90`) calls `renderMeasurements()` at `:85-86`. It now imports
  `measurementInputs` and `measurementsAction` beside `MEASUREMENTS_DOC_PATH` and `renderMeasurements` (`:63-65`):
  - `"skip"` → print to stderr `generate-docs: measurements page skipped — no records in this checkout (missing <paths>); node scripts/records.mjs restore brings them` and leave the page out of `pages`;
  - `{ refuse }` → print `generate-docs: the measurements page needs <paths>` and exit 1 before any write;
  - `"render"` → as today.
- **`docs/measurements.md`** is regenerated with the records present.
- **`test/cli/docs/measurements.test.ts`.** The cases that read real records move to `test/records/measurements.test.ts`
  with their names:

  | Line | Case |
  |---|---|
  | `:190` | byte-matches the committed page |
  | `:294` | agrees with the registry's own week window |
  | `:461` | quotes the run of record's four metric scores |
  | `:516` | says how the run of record was measured |
  | `:931` | snapshot parses |
  | `:941` | records what it was computed from |
  | `:952` | names a run only once |
  | `:1395` | `merge-ready-rate.mjs` prints the same report |
  | `:1402` | prints a human summary |
  | `:1424` | `generate-docs.mjs --page measurements` writes the rendered page |

  The cases that only borrowed a record switch to synthetic inputs:
  - **Render fixture** (cases `:195`, `:203`, `:213`, `:227`, `:233`, `:240`, `:266`, `:277`, `:582`, `:597`, `:1355`):
    - a temp root from the existing `fixture()` (`:138-167`);
    - `writeMeasurementSnapshot(root, "2026-10-01")`, which writes the pinned filename;
    - a synthetic reach JSON at `REACH_SNAPSHOT_PATH`: `accessed`, `label`, `source`, `lastWeek` and `lastMonth` as
      `{ downloads, start, end }`, and `daily { start, end, downloads: [{ day, downloads }] }` with at least two rows;
    - a synthetic full-run `RESULTS.md` at `RUN_OF_RECORD_PATH`: `Status: **PASS**`, a `## 5. Per-metric scores beside
      their declared thresholds` section with the header row `\| Metric \| Score (SET-v6 rule) \|…` and the four metric
      rows, and no `## 0.` section.
  - **Results pair** (cases `:621`, `:650`, `:675`, `:778`, `:796`, `:809`, `:840`, `:864`, `:900`):
    - a synthetic full results file with `## 1. Set version and sha` and `## 3. Why the run happened`;
    - a synthetic composed one with `## 0. Composition` naming "prior complete run is `<id>`", the line
      "N case(s) re-measured in this run; M case(s) carried", a `\| Re-measured case \| Why \|` table and a
      `\| Carried case \| Case file sha256 \| Sources compared \|` table;
    - § 5 rows matching the substrings the edits at `:873`, `:882` and `:889` key on;
    - ids matching `EVAL_RUN_ID` (`src/cli/docs/measurements.ts:966`).
  - **Link assertions.** The ones at `:220`, `:590` and `:602` expect the absolute form for record links.
  - **The `:1341` case** "reads the newest snapshot by filename date" becomes "reads the pinned snapshot, not the newest
    file", with a `TEST CHANGE, justified:` comment.
  - **New default-suite cases:**
    - `measurementsAction` over the three states;
    - `measurementInputs` over a temp root;
    - the REQ-CTX-006 equality: `computeMergeReadyRate` over a `fixture()` run whose ledger rows carry `report` and
      `decision_needed` equals the same fixture without them (open-row count and rate).
- **`test/cli/docs/llmsIndex.test.ts:345`** runs `generate-docs.mjs` under `--page all`. It passes in both states, since
  its compared paths already leave the page out (`:347-352`), and gains an assertion that the skip notice prints when no
  record is present.

### r3-hand-page-links — the hand pages point into the records branch

| Field | Content |
|---|---|
| `id` | r3-hand-page-links |
| `requirements` | REQ-PROVE-020, REQ-UPSTREAM-001, REQ-UPSTREAM-007 |
| `files` | `README.md`, `docs/doctrine.md`, `docs/enterprise-forks.md`, `docs/plugins.md`, `SECURITY.md`, `test/docsPages.test.ts`, `test/records/docsPages.test.ts` (new) |
| `interfaces` | **`README.md`:** the links at `:31` (snapshot), `:34` (run of record) and `:41` (reach) become `https://github.com/zomarit/stamity/blob/records/<path>`. `:138` "Every link on this page is repo-relative, so the docs are read from the tree." becomes "…repo-relative, except the links into the `records` branch, which holds the run records and the eval evidence." `:149-155` (`.stamity/` holds "the manifest, learnings, handoffs, runs, overrides, the inbox") says that in this repository the runs, handoffs, evidence and inbox live on the `records` branch. The consumer layout in `docs/getting-started.md:313-324` is product documentation and does not change. **`docs/doctrine.md`:** links `:98`, `:101`, `:105` → absolute; the comment `:10` and the code span `:143` gain "on the `records` branch". **`docs/enterprise-forks.md`:** the plan-005 links `:84`, `:121` → absolute. `docs/measurements.md` leaves `generatedPaths` (`:302`). The explanation `:310-319` becomes: "`docs/measurements.md` is not listed: a fork holds no records, so `generate-docs.mjs` skips that page there with a notice and leaves the committed page as it is." The code span `:1145` gains "on the `records` branch". **`docs/plugins.md`:** the code spans `:100`, `:104`, `:564` gain "(on the `records` branch)". **`SECURITY.md:315`:** "…archived under `.stamity/runs/2026-09-14_package-11/evidence/` on the `records` branch." **`test/docsPages.test.ts`:** the README check (`:1254-1262`, `existsSync` for every non-anchor target) skips targets matching `ALLOWED_URL` (`:407`), as the hand-page check does at `:811`. `RUN_OF_RECORD_CLAIM` (`:1277-1278`) also accepts the prefix `https://github.com/zomarit/stamity/blob/records/` before `(evals\/runs\/[^)\s]+)`; the capture group is unchanged, so the comparison with `RUN_OF_RECORD_PATH` at `:1296` holds. `failBaselineDisclosure` (`:1372`) accepts the same prefix. The case at `:1388` ("%s discloses a FAIL baseline behind the composed run of record") moves to `test/records/docsPages.test.ts`. The case at `:1426` uses a synthetic results file with a § 5 "NOT met" row and no case listed. The case at `:1442` is deleted, with a one-line reason: it duplicates `test/cli/docs/measurements.test.ts:623-624`. **Headers:** each edited hand page's attestation moves to the commit form `Re-attested <date>` (regex `:431`). `REATTESTATION_DATE` (`:597`) equals the newest such date (`:924-929`). |
| `testCriteria` | The fourth REQ-PROVE-020 criterion. **Given** `docs/enterprise-forks.md`, **then** its `generatedPaths` example no longer lists `docs/measurements.md` and its explanation no longer justifies it (`rg -n "docs/measurements.md" docs/enterprise-forks.md` shows neither line). **Given** a scratch copy of the tree with no record on disk, **when** the guide's `regenerate` commands run there, **then** `docs/measurements.md` is byte-unchanged (r2's skip) and `git status --porcelain` lists no tracked path outside the guide's `generatedPaths`; together these are the REQ-UPSTREAM-007 criteria. **Given** `npx vitest run test/docsPages.test.ts`, **then** it passes with no record on disk. **Given** `npm run test:records`, **then** the moved case passes. **Given** `cd website && npm run build`, **then** it completes with `onBrokenLinks: 'throw'` (`website/docusaurus.config.ts:111`). |
| `edgeCases` | A link with a `#L12` anchor or a query string fails `ALLOWED_URL` → link whole files only. The site build runs in CI's docs-site workflow; do not run it beside a test runner's full gate on the same machine (`test/qa/hookRuns.test.ts:167` is load-sensitive). |
| `depends_on` | r2-measurements-page |
| `verify` | `npx vitest run test/docsPages.test.ts && npm run test:records && npm run lint` |

### r4-records-script — `scripts/records.mjs`, its path list and the branch templates

| Field | Content |
|---|---|
| `id` | r4-records-script |
| `requirements` | REQ-PROVE-024 |
| `files` | `scripts/records.mjs` (new), `scripts/records-paths.mjs` (new), `scripts/records/README.md` (new), `scripts/records/gitignore` (new), `scripts/records/gitattributes` (new), `scripts/records/workflow.yml` (new), `test/ci/recordsScript.test.ts` (new) |
| `interfaces` | See the block below the table. |
| `testCriteria` | The criteria of REQ-PROVE-024, each one a case in `test/ci/recordsScript.test.ts`. The fixture is a temporary bare repository acting as `origin` plus a clone of it, with a `main` that carries a records folder, and `init` run first. **Given** the CLI with an unknown verb or a missing `-m`, **then** it exits 2 with the usage line. |
| `edgeCases` | **`git clean -X`** in a checkout with unpublished records deletes them, because they are ignored there; CONTRIBUTING says so (`r7`), and `commit --dry-run` lists pending changes. **Two machines:** the second commit is rejected as non-fast-forward, so run `restore` (which lists conflicts and refuses to overwrite) and then commit again. **A lane worktree** shares `.git/info/exclude` with the main checkout, so a record written there is ignored and is lost when the lane is removed. Lanes write no records; the orchestrator writes them in the main checkout. **Executable bits:** mode `100755` round-trips through `restore`. |
| `depends_on` | r1-records-suite |
| `verify` | `npx vitest run test/ci/recordsScript.test.ts && npm run lint && npm run typecheck` |

`r4-records-script` interfaces:

- **`scripts/records-paths.mjs`.**
  - `export const RECORDS_PATHSPECS = Object.freeze(['.stamity/runs', '.stamity/inbox.md', '.stamity/handoffs', '.stamity/evidence', 'docs/plans', 'evals/runs', 'evals/measurements', 'evals/reach', 'evals/EVIDENCE-STORAGE.md', 'evals/ARCHIVE-MIGRATION-2026-09-15.json'])`.
  - `export const KEEP_ON_MAIN = Object.freeze(['.stamity/handoffs/.gitkeep'])`.
  - `export function isRecordPath(path)` takes a POSIX repo-relative path. It is true when the path equals a pathspec or
    sits under one, false for `KEEP_ON_MAIN`, and false for any path with a `.` or `..` segment.
- **`scripts/records.mjs`.** Node built-ins and `git` only. It runs `git` with `execFileSync` and argument arrays, never
  a shell. Its module API is `setup`, `restore`, `publish`, `verify`, `guard` and `init`, each `async (options) → { code, lines }`;
  the CLI maps `code` to the exit status.
- **`setup`.**
  - It appends this block to `.git/info/exclude`, or replaces the block if present, so a second run is byte-identical:
    `# >>> stamity records (node scripts/records.mjs setup) — records live on the records branch`, one root-anchored
    entry per pathspec (`/.stamity/runs/`, `/.stamity/inbox.md`, …, `/evals/ARCHIVE-MIGRATION-2026-09-15.json`), then
    `# <<< stamity records`.
  - In a linked worktree it writes the common directory's exclude (`git rev-parse --git-common-dir`).
  - Then it runs `restore`.
- **`restore({ ref = 'origin/records', fetch = true, force = false })`.**
  1. With `fetch`, it runs `git fetch --no-tags origin records`.
  2. `git ls-tree -r -z <ref> -- <RECORDS_PATHSPECS>`, minus `KEEP_ON_MAIN`, gives the files.
  3. Each file is compared with the working tree (`git hash-object --path=<p> <file>` against the tree's oid).
     - **Missing:** write the blob from `git cat-file blob <oid>`, creating parents and `chmod 0o755` for mode `100755`.
     - **Equal:** skip it.
     - **Differs:** collect it.
  4. With anything collected and no `force`, it returns `{ code: 1 }` listing the paths and writes nothing.
  5. A parent that is a symlink → `{ code: 1 }` naming it.
  6. It never deletes a working-tree file.
- **`publish({ message, dryRun = false, allowDeletions = false, runGates = defaultGates })`** — the CLI verb is `commit`.
  1. `git fetch --no-tags origin records`. `origin/records` absent → `{ code: 1 }` "no records branch: run `init`".
  2. The files are `git ls-files -z --others --cached --exclude-from=.gitignore -- <RECORDS_PATHSPECS>`, minus
     `KEEP_ON_MAIN`. `lstat` each; a symlink → `{ code: 1 }` naming it.
  3. With `GIT_INDEX_FILE=<git-dir>/records.index`: `git read-tree origin/records`. For each file,
     `git update-index --add --cacheinfo <mode>,<git hash-object -w --path=<p> <file>>,<p>`. Paths under the pathspecs
     in `origin/records` but absent on disk are deletions: listed with `{ code: 1 }`, unless `allowDeletions`, in which
     case `git update-index --force-remove <p>`.
  4. `tree = git write-tree`. Equal to `origin/records^{tree}` → `{ code: 0 }` "nothing to publish".
  5. `commit = git commit-tree <tree> -p origin/records -m <message>`. `git commit-tree` honours `commit.gpgSign`.
  6. `runGates({ commit, base: 'origin/records' })`. The default runs `git worktree add --detach <tmp> <commit>`, then
     `node scripts/leak-gate.mjs --root <tmp>`, `node scripts/repo-hygiene.mjs --repo <tmp> --base origin/records` and
     `npm run test:records`, the last in the main checkout, whose on-disk records are the commit's. It reads each exit
     code and always runs `git worktree remove --force <tmp>`. The first failing gate → `{ code: 1 }` naming it, and
     nothing is pushed.
  7. `dryRun` → print the A/M/D list and the commit sha, then `{ code: 0 }`; no ref moves.
  8. `git push origin <commit>:refs/heads/records` with no force. A non-fast-forward rejection → `{ code: 1 }` "the
     records branch moved: run `restore`, then `commit` again". Success → `git update-ref refs/remotes/origin/records <commit>`.
- **`verify({ base, ref = 'origin/records' })`.** It compares `git ls-tree -r <base> -- <RECORDS_PATHSPECS>` with the same
  listing at `<ref>`, both minus `KEEP_ON_MAIN`, as sets of `<mode> <oid> <path>`. Equal → `{ code: 0 }`; otherwise
  `{ code: 1 }` listing each differing path. The scaffold files sit outside the pathspecs.
- **`guard({ ref = 'HEAD' })`.** `git ls-tree -r --name-only <ref> -- <RECORDS_PATHSPECS>`, minus `KEEP_ON_MAIN`. Any path
  → `{ code: 1 }` listing them.
- **`init({ base })`.**
  1. After `git fetch --no-tags origin`, `refs/heads/records` or `refs/remotes/origin/records` existing → `{ code: 1 }`.
  2. Into a temporary index from `git read-tree --empty`, add every `git ls-tree -r <base> -- <RECORDS_PATHSPECS>` row
     (minus `KEEP_ON_MAIN`) with `update-index --cacheinfo`.
  3. Add the four templates at the branch root: `scripts/records/README.md` → `README.md`, `scripts/records/gitignore` →
     `.gitignore`, `scripts/records/gitattributes` → `.gitattributes`, `scripts/records/workflow.yml` →
     `.github/workflows/records.yml`.
  4. `write-tree`, then `commit-tree` with no parent and `-m "records: import the records from main at <base>"`.
  5. `git update-ref refs/heads/records <commit>`, then `verify({ base, ref: 'refs/heads/records' })`.
  6. `git push origin refs/heads/records:refs/heads/records`, which fails if the branch exists remotely. Then
     `git update-ref refs/remotes/origin/records <commit>`.
- **The templates.**
  - `scripts/records/README.md` says what the branch holds and that it shares no history with `main` and is never
    merged into it, so forks and installs never receive it. It gives `node scripts/records.mjs setup` (restore into a
    checkout of `main`) and `node scripts/records.mjs commit -m "<message>"` (publish), and says pushes are never forced
    and the branch cannot be deleted.
  - `scripts/records/gitignore` holds `main`'s record-relevant rules: `/.stamity/runs/*/reports/`,
    `/.stamity/runs/*/ledger.jsonl.lock`, `/.stamity/runs/*/ledger.jsonl.tmp.*`, `/evals/runs/*/calls/`,
    `/evals/runs/*/calls.json`, `/evals/runs/*/samples.jsonl`, `/evals/runs/*/*-attempt-*.json`,
    `/evals/runs/*/sample-*.json`, `/evals/runs/*/isolation-*.json`, `/evals/runs/*/provider-responses.jsonl`,
    `.DS_Store` and `._*`.
  - `scripts/records/gitattributes` is `* text=auto eol=lf`.
  - `scripts/records/workflow.yml` is the block below. Its action pins equal `ci.yml`'s.

```yaml
# The records branch's own check. It lives only on `records`: a push runs the workflow stored in the
# pushed commit, so main's workflows never see a records push, and this file never runs on main.
name: Records
on:
  push:
    branches: [records]
permissions:
  contents: read
jobs:
  records:
    if: github.repository == 'zomarit/stamity'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - name: Checkout main (the tools, the specs, the tags and the records branch)
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: main
          fetch-depth: 0
          persist-credentials: false
      - name: Set up Node
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: '24'
          cache: npm
      - name: Install
        run: npm ci
      - name: Restore the pushed records into the checkout
        env:
          RECORDS_SHA: ${{ github.sha }}
        run: node scripts/records.mjs restore --ref "$RECORDS_SHA" --no-fetch --force
      - name: Records suite
        run: npm run test:records
      - name: Leak gate (the restored records are untracked and not ignored here)
        run: npm run gate
      - name: Hygiene over the pushed commits
        env:
          RECORDS_SHA: ${{ github.sha }}
          BEFORE_SHA: ${{ github.event.before }}
        run: |
          git worktree add --detach .records-tree "$RECORDS_SHA"
          if [ "$BEFORE_SHA" = "0000000000000000000000000000000000000000" ]; then
            node scripts/repo-hygiene.mjs --repo .records-tree
          else
            node scripts/repo-hygiene.mjs --repo .records-tree --base "$BEFORE_SHA"
          fi
      - name: Measurements page drift
        run: node scripts/generate-docs.mjs --page measurements && git diff --exit-code docs/measurements.md
```

### r5-ci-records-job — CI restores the records, and the records-only lane retires

| Field | Content |
|---|---|
| `id` | r5-ci-records-job |
| `requirements` | REQ-PROVE-025, REQ-PLUGIN-020, REQ-APM-002 |
| `files` | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/ci/records-only.mjs` (deleted), `test/ci/recordsOnly.test.ts` (deleted), `test/ci/workflow.test.ts`, `test/ci/forkIdentity.test.ts`, `CONTRIBUTING.md` (the lane passage `:112-117` only), `GOVERNANCE.md` (`:88-94`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | The CI criteria of REQ-PROVE-025, REQ-PLUGIN-020 and REQ-APM-002, as `test/ci/workflow.test.ts` cases. **Given** `npm test`, **then** it exits 0. |
| `edgeCases` | A pull request from a contributor's fork runs in `zomarit/stamity`, so `github.repository` is the canonical name and the job runs with the base repository's `origin/records`. The schedule and `workflow_dispatch` run the job too. `origin/records` absent (before `r6`) → the restore step fails; push the branch for CI only after `r7` (Execution order). The local gate never runs the records suite, so CONTRIBUTING tells a contributor who changes `src/cli/docs/**`, `test/records/**` or the ledger grammar to run `npm run test:records` after `setup` (`r7`). |
| `depends_on` | r4-records-script |
| `verify` | `npx vitest run test/ci && npm run lint && npm run typecheck` |

`r5-ci-records-job` interfaces:

- **`.github/workflows/ci.yml` (current).**
  - Triggers: `push`/`pull_request` to `main`, `workflow_dispatch`, and a weekly schedule (`:109-117`).
  - The `changes` job (`:131-162`) runs `node scripts/ci/records-only.mjs --base "$BASE_SHA"` and outputs
    `records_only`.
  - `check` has `needs: changes` and `if: needs.changes.outputs.records_only != 'true'` (`:164-166`); so do
    `apm-install` and `plugin-route`.
  - The `records` lane (`:665-719`) runs `npx vitest run test/records test/docsPages.test.ts
    test/cli/docs/measurements.test.ts test/authoring/specPlanCoverage.test.ts test/ci/leakGate.test.ts`, then
    generate-and-diff and the leak gate.
  - `all-ci-checks` (`:826-848`) has `needs: [changes, check, records, supply-chain, apm-install, plugin-route]` and
    asserts the split both ways. The lane map is in the comments at `:19-31` and `:44-45`.
- **`ci.yml` (new).**
  - Delete `changes`, the old `records` lane and their comments. Drop `needs: changes` and the `records_only`
    conditions everywhere.
  - Add the job `records` with `name: records (restored from the records branch)`,
    `if: github.repository == 'zomarit/stamity'`, `runs-on: ubuntu-latest`, `timeout-minutes: 15` and
    `permissions: contents: read`. Its steps:
    1. checkout with `fetch-depth: 0` and `persist-credentials: false`, which fetches `origin/records`, the tags and
       `main`'s history the shipped-spec and run-27 cases need;
    2. setup-node 24 with `cache: npm`;
    3. `npm ci`;
    4. `node scripts/records.mjs guard`;
    5. `node scripts/records.mjs restore --ref origin/records --no-fetch --force`;
    6. `npm run test:records`;
    7. `npm run gate`, which now also scans the restored records, untracked and not ignored here;
    8. `node scripts/generate-docs.mjs --page measurements && git diff --exit-code docs/measurements.md`.
  - `all-ci-checks` gets `needs: [check, records, supply-chain, apm-install, plugin-route]`. With `REPO` passed through
    `env:` (never interpolated into the script), it asserts `check`, `apm-install` and `plugin-route` read `success`,
    and `records` reads `success` when `$REPO` is `zomarit/stamity`, `skipped` otherwise.
- **`.github/workflows/release.yml`.** The `gates` job is already canonical-only (`:83`). After `npm ci` (`:281`) it runs
  `git fetch --no-tags origin records:refs/remotes/origin/records` and
  `node scripts/records.mjs restore --ref origin/records --no-fetch --force`. After `npm test` (`:290`) it runs
  `npm run test:records`. The shipped-spec case needs the tags and `main`'s history, so give the job's checkout
  `fetch-depth: 0` if it is shallow.
- **`.github/workflows/fork-release.yml`** stays byte-unchanged. A fork has no records branch.
- **`test/ci/workflow.test.ts`.**
  - Drop the `RECORDS_SUITES` import (`:21`), the records-lane pins (`:729-813`) and the split's aggregator pins
    (`:946-959`).
  - Pin the new job: the guard string, the step order (guard, restore, `test:records`, gate, drift), and no `needs`.
  - Pin the aggregator assertions, that `check`, `apm-install` and `plugin-route` carry no `records_only`, and the
    `release.yml` restore before `npm run test:records`.
  - The page pin at `:1748-1752` (CONTRIBUTING contains `scripts/ci/records-only.mjs`) becomes CONTRIBUTING containing
    `scripts/records.mjs`.
  - Every `zomarit/stamity` literal added moves the census in `test/ci/forkIdentity.test.ts:209` (`{ route: 13 }`,
    compared at `:235-239`), with a reason.
  - If `test/ci/forkReleaseWorkflow.test.ts` compares `fork-release.yml`'s gate ladder with `release.yml`'s, the
    canonical-only records steps are excluded there by name (contract census).
- **`CONTRIBUTING.md:112-117`** ("A change made only of records takes a records-only lane…") and **`GOVERNANCE.md:88-94`**
  say instead:
  - records live on the `records` branch and never land on `main`;
  - CI's `records` job, merge-blocking in this repository, restores them and runs `npm run test:records`, the leak gate
    over them, the measurements drift check and `node scripts/records.mjs guard`.

### r6-records-branch — create the branch, protect it, and see its first check green

| Field | Content |
|---|---|
| `id` | r6-records-branch |
| `requirements` | REQ-PROVE-023 |
| `files` | none on `main`; it creates the `records` branch and one ruleset |
| `interfaces` | **Preconditions:** `r1`–`r5` green locally; the records are still tracked on the pull-request branch; `git status --porcelain` is empty. `<sha>` = the branch head. **1. Rulesets in the way:** `gh api repos/zomarit/stamity/rulesets` lists the rulesets; `gh api repos/zomarit/stamity/rulesets/<id>` shows each one's `target` and `conditions.ref_name`. If a branch ruleset's `include` holds `~ALL` or a pattern matching `refs/heads/records`, add `refs/heads/records` to its `exclude`. This is outward-facing, so the maintainer approves. **2. Create:** `node scripts/records.mjs init --base <sha>`. It pushes `records`; the maintainer approves the push. **3. Protect:** `gh api -X POST repos/zomarit/stamity/rulesets --input -` with `{"name":"records","target":"branch","enforcement":"active","conditions":{"ref_name":{"include":["refs/heads/records"],"exclude":[]}},"rules":[{"type":"deletion"},{"type":"non_fast_forward"}],"bypass_actors":[]}`. The maintainer approves. **4. Check:** `gh run list --branch records --limit 1 --json conclusion,headSha` reads `success` for the import commit. **5. Record** the import commit's sha, the `verify` output and the ruleset id in the run record, which stays tracked until `r7`. |
| `testCriteria` | **Given** `origin/records`, **then** `node scripts/records.mjs verify --base <sha>` exits 0, `git merge-base origin/main origin/records` exits 1, and `git ls-tree --name-only origin/records` lists `README.md`, `.gitignore`, `.gitattributes`, `.github`, `.stamity`, `docs` and `evals`. **Given** the ruleset, **then** the REQ-PROVE-023 ruleset criterion holds. **Given** a force push attempted with `git push --force origin <sha>:refs/heads/records` from a scratch clone, **then** GitHub refuses it. This one check is run once and its refusal recorded; it changes nothing. |
| `edgeCases` | The ruleset POST fails on plan limits → stop; the maintainer decides, and the branch stays unprotected meanwhile, which the record says. The first `records.yml` run is red → fix forward on `records` (template fix through `records.mjs commit`, and the same fix in `scripts/records/workflow.yml` on the PR branch). Never force-push. `init` refuses because a stale `records` exists → stop and ask; never delete a remote branch without the maintainer's word. |
| `depends_on` | r4-records-script, r5-ci-records-job, approval of each outward push owner: maintainer |
| `verify` | `node scripts/records.mjs verify --base <sha>` exits 0, and the records workflow run reads `success` |

### r7-remove-records-from-main — the contract step, and the texts that describe it

| Field | Content |
|---|---|
| `id` | r7-remove-records-from-main |
| `requirements` | REQ-PROVE-023, REQ-PROVE-017, REQ-PROVE-021, REQ-PLUGIN-025 |
| `files` | the record paths (untracked from `main`; local files kept), `CONTRIBUTING.md` (the records ritual), `evals/README.md`, `.github/release-controls-checklist.md`, `test/evals/fixtures/historical-replay/README.md` (`:14-15`), `scripts/evidence-archive.md` (`:24`), `CHANGELOG.md` |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** the PR head, **then** the REQ-PROVE-023 guard criterion holds, `git ls-files -- <RECORDS_PATHSPECS>` prints only `.stamity/handoffs/.gitkeep`, and `git diff <base> HEAD -- .gitignore` is empty. **Given** this checkout after `setup`, **then** `npm test` and `npm run test:records` both exit 0. **Given** a fresh scratch clone with no `setup` run, **then** `npm test` exits 0 and `npm run test:records` exits non-zero with the setup message. |
| `edgeCases` | A record edited on disk between steps 1 and 2 → step 2's `verify` fails; publish again first. The removal commit is reverted later → the records reappear on `main` from history, and `guard` then fails in CI, which is the signal to re-run this unit. A fork that edited one of upstream's records meets a modify/delete conflict at its next integrate; the CHANGELOG entry tells it to keep its own copy. |
| `depends_on` | r6-records-branch |
| `verify` | `node scripts/records.mjs guard && npm test && npm run test:records && npm run lint && npm run typecheck && npm run gate` |

`r7-remove-records-from-main` interfaces:

1. **Publish anything** the pull-request branch changed in the records since `r6`:
   `node scripts/records.mjs commit -m "records: the pull-request branch's records at <HEAD>"`. It answers "nothing to
   publish" when nothing changed.
2. `node scripts/records.mjs verify --base HEAD` → exit 0.
3. `git rm -r -q --cached -- .stamity/runs .stamity/inbox.md .stamity/handoffs ':(exclude).stamity/handoffs/.gitkeep' .stamity/evidence docs/plans evals/runs evals/measurements evals/reach evals/EVIDENCE-STORAGE.md evals/ARCHIVE-MIGRATION-2026-09-15.json`
   The files stay on disk.
4. `node scripts/records.mjs setup`, then `git status --porcelain` lists no record path, and
   `node scripts/records.mjs guard` exits 0 once the commit is made.
5. **`CONTRIBUTING.md`, the records ritual.**
   - Records live on `records` and are published with `node scripts/records.mjs commit -m "<message>"`.
   - A new clone runs `node scripts/records.mjs setup`.
   - Never run `git clean -X` in a checkout holding unpublished records.
   - A change to `src/cli/docs/**`, `test/records/**` or the ledger grammar also runs `npm run test:records`.
   - The release close publishes records first, then lands `main`'s pin bump.
   - Lanes write no records.
6. **`evals/README.md`.**
   - The rows at `:37-38` link `https://github.com/zomarit/stamity/blob/records/evals/runs/2026-09-11-run-24/PROTOCOL.md`
     and the runs folder. The row text keeps `stamity-claude-cli-v1` (`test/evals/readmeCurrency.test.ts:176-184`).
   - `:484-488` and `:539-543` say where a run is committed (`records`).
   - The run links in `:342-373` become absolute.
7. **`.github/release-controls-checklist.md`.**
   - `:192-196` and `:210-226`: the release's eval artifact lives on `records`.
   - `:248-255`: `merge-ready-rate.mjs --write` writes the snapshot in the checkout; `records.mjs commit` publishes it
     with the run record; then `main` moves `MEASUREMENT_SNAPSHOT_PATH` and regenerates the page, before the tag.
8. **The one-line pointers.** `test/evals/fixtures/historical-replay/README.md:14-15` and `scripts/evidence-archive.md:24`
   point at the `records` branch.
9. **`CHANGELOG.md`** gets a `### Changed` entry under `## [Unreleased]`:

   > **The repository's records moved to the `records` branch.** Run records and ledgers, the deferral inbox, handoffs,
   > QA evidence, plans, eval runs and measurement snapshots no longer live on `main`, so forks stop merging them with
   > each release and APM installs stop vendoring them. Read them at `https://github.com/zomarit/stamity/tree/records`;
   > history is unchanged. A fork's next integrate deletes upstream's records from its tree, and a fork that edited one
   > of them keeps its copy by resolving the modify/delete conflict in favour of its own file.

### r8-after-measure — prove the invariants and measure what a fork and an APM install now get

| Field | Content |
|---|---|
| `id` | r8-after-measure |
| `requirements` | REQ-PROVE-023 |
| `files` | the executing run's own record only (published with `records.mjs commit`), plus scratch outputs outside the repository |
| `interfaces` | At the PR head `<head>`: **(1)** re-run `r0`'s captures 1, 2 and 4 and compare them. The npm listing is equal; the distribution hash is equal; the generated pages are equal except `docs/measurements.md`, whose diff is link targets only. **(2) Fork import dry run** with file 1's recipe against `file://<this repository>` at `<head>`: `git clone --bare --single-branch --branch main file://<repo> <scratch>/import.git`, then a push of `refs/heads/main` and `refs/tags/v*` into an empty `<scratch>/dest.git`. Record `git -C <scratch>/dest.git for-each-ref --format=%(refname)` (exactly `main` plus the `v*` tags), `git -C <scratch>/dest.git count-objects -vH`, and that no `records` or `plugin-dist` ref exists there. **(3) APM figure:** `git ls-tree -r -l <head> \| awk '{n++; s+=$4} END {print n, s}'` gives `<N>` files and `<S>` bytes for the vendored-tree amendment (§ C), as MB to one decimal. **(4)** `git diff --name-status 9239379c39e2a4440581da1eaf6f7bb6a6ab204e <head> -- <RECORDS_PATHSPECS>` shows only deletions (`D`), and `git ls-tree -r --name-only <head> -- <RECORDS_PATHSPECS>` lists only `.stamity/handoffs/.gitkeep`. |
| `testCriteria` | **Given** the four measurements, **then** invariants 1, 2, 5 and 7 hold (or the record names the deterministic-build exception `r0` found). **And** the dry-run import holds no record path and no `records` or `plugin-dist` ref. **And** `<N>` is below 1,200. |
| `edgeCases` | The dry-run import shows a non-`v*` tag → file 1's recipe regressed; stop and fix it there. `<N>` is 1,200 or more → a records path was missed; compare against `r0`'s manifest. |
| `depends_on` | r7-remove-records-from-main |
| `verify` | the four measurements are recorded and the criteria hold |

## Execution order

1. **`r0-baselines`** first.
2. **`r1-records-suite`**, then three lanes beside each other, with disjoint files:
   - `r1b-records-suite-eval-cases`;
   - `r2-measurements-page` → `r3-hand-page-links`;
   - `r4-records-script` → `r5-ci-records-job`.
3. **`r6-records-branch`** once `r1`–`r5` are green locally. It pushes `records` and creates the ruleset; each outward
   step waits for the maintainer's approval.
4. **`r7-remove-records-from-main`**, then push the pull-request branch for CI. Earlier pushes would run `ci.yml`'s
   `records` job before `origin/records` exists.
5. **`r8-after-measure`**.
6. **The Prove phase:** merge the spec delta, write the dated banners (§ F) and the APM amendment with `r8`'s numbers.
7. **The gates:**
   - locally, `npm run lint && npm run typecheck && npm run test`, then `npm run test:records`, then `npm run check`;
   - in CI, the coverage and Windows legs and the merge-blocking `records` job.
8. **Merge by fast-forward**: `git push origin <gated head>:main` under the admin bypass, after both aggregators read
   `pass` (settled default 7). The pull-request title is a conventional-commit subject, for example
   `refactor(records): move the repository's records to the records branch`.
9. **The close's own records** go to `records` with `node scripts/records.mjs commit`.

## Risks

| Risk | Severity | Guard |
|---|---|---|
| A branch ruleset that targets all branches blocks the maintainer's direct pushes to `records` | Warning | `r6` reads every ruleset first and excludes `refs/heads/records` where needed |
| Unpublished records are lost to `git clean -X`, a deleted clone, or a lane removal | Warning | The CONTRIBUTING rule; `commit --dry-run` lists pending changes; `commit` refuses deletions by default; lanes write no records |
| A bad record on `records` blocks every pull request, because the records job is merge-blocking | Warning | `records.mjs commit` gates the exact commit before pushing; `records.yml` re-runs the gates; fix forward on `records` |
| A change to the measurements code or the ledger grammar passes the local gate and fails CI, because `npm test` skips the records suite | Warning | CONTRIBUTING names when to run `npm run test:records`; the merge-blocking CI job catches the rest |
| `release.yml`'s `gates` checkout lacks the history the shipped-spec check needs | Warning | `r5` sets `fetch-depth: 0` for that job if it is shallow |
| A rebase merge re-creates the pull request's shas and strands the import commit's recorded base | Warning | Merge by fast-forward (settled default 7) |
| Links outside this repository to `blob/main/<record path>` stop resolving | Minor | The CHANGELOG names the branch; `blob/<sha>/…` permalinks keep working |
| The records workflow's action pins go stale, because Dependabot and Renovate watch the default branch | Minor | Inbox row; refresh `scripts/records/workflow.yml` and the branch file at each pin sweep |
| A fork's next integrate meets modify/delete conflicts on records it edited | Minor | The CHANGELOG entry tells it to keep its own copy |

## Open questions

None. The maintainer answered the five questions of the walk on 2026-10-01; the remaining readings are settled above
as declared defaults.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- **`scripts/build-plugin-distribution.mjs`:** the distribution tree carries four full client roots and four zips. That
  is 2,882 files and 21.5 MiB at `plugins/v1.11.0`, and an APM install from `#plugins/v<version>` vendors all of it. An
  APM-only projection would cut it, for example through APM's virtual subdirectory packages, a sparse cone.
- **`docs/specs/apm-canonical-distribution.md`:** after the move an APM install of the source tree still vendors tests,
  scripts and the site, about 20 MiB. APM now supports virtual subdirectory packages, which bears on the accepted
  whole-tree cost; re-open that decision with a measurement.
- **`scripts/records/workflow.yml`:** Dependabot and Renovate do not watch the `records` branch, so its action pins need
  a manual refresh at each pin sweep.
- **`docs/specs/apm-canonical-distribution.md:132-133`:** REQ-APM-004 says the README carries the APM install note, but
  `README.md` has no `apm install` line. The drift predates this plan.
- **`src/runs/ledgerStore.ts:157-165`:** capture as a learning that the ledger, the eval runner and the handoff archive
  refuse symlinked record folders and the resume card ignores them. It was found by this plan's research. Capturing it
  moves the learning-count pin in `docs/troubleshooting.md`, so the executing run lands both.

## Drop list

| Item | Why dropped | What would bring it back |
|---|---|---|
| A product setting for where records go | Touches the CLI, the command texts and the eval cases; the in-place layout needs none | An enterprise asks to keep its own records out of its product repository |
| A separate public records repository | A third repository to run; the branch gives forks and installs the same result | The records branch slows contributors' full clones, for example past 200 MB |
| `--records` flags on the eval runner and the generators | CI and the maintainer restore the records into the checkout, so the default paths work | A context that cannot restore into a checkout |
| A derived rubric-core pin on `main` | The merge-blocking records job runs the rubric-core check on every pull request | The records job stops being merge-blocking |
| A records-on-`main` guard in forks | A fork's own records are the fork's decision | A fork asks for it |
| Rewriting history | Breaks forks' merge bases, recorded commit ids and npm provenance links | Never |
