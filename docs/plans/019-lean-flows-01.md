---
id: lean-flows-01
intent: feature
stamp: 2104b177e6c4cc9592e289d72a4ffac9c9a87e92 2026-10-06
reads: [.github/workflows/ci.yml, .github/workflows/pr-checks.yml, .github/workflows/pack-signing-rehearsal.yml, .github/workflows/docs-site.yml, .github/workflows/release.yml, .github/dependabot.yml, .github/release-controls-checklist.md, scripts/ci/records-only.mjs, scripts/ci/test-run.mjs, scripts/eval/usage.mjs, src/cli/docs/measurements.ts, vitest.config.ts, test/ci/workflow.test.ts, test/ci/recordsOnly.test.ts, test/ci/leakGate.test.ts, test/ci/testScheduling.test.ts, test/docsPages.test.ts, test/cli/docs/measurements.test.ts, test/evals/rubricCoreHash.test.ts, test/evals/usage.test.ts, evals/SET-v7.md, evals/README.md, evals/price-list.json, docs/specs/prove-behavior-and-value.md, docs/specs/apm-canonical-distribution.md, docs/specs/plugin-lifecycle.md, .stamity/inbox.md, .stamity/learnings]
---

# Lean flows — file 1 of 3: the maintainers' tooling (CI, the release rules, the records)

This file is self-contained. It is one of three `/st-plan` artifacts for **Package 23** ("make Stamity fast and lean, for
users and for us"). This file changes no model-facing text: CI, the release rules, the eval's run-of-record source, the
price list, this repository's own gate command and one inbox sweep. One session, one pull request, no release. Files 2
and 3 (`docs/plans/019-lean-flows-02.md`, `-03.md`) change the product.

intent chosen: feature because each unit adds a capability to the repository's tooling (a proven-push skip, three CI
lanes, a change-aware release rule, one run-of-record source); no defect is being diagnosed.

## Context

Measured over 22 maintainer sessions (2026-09-20 → 10-06) and 1,527 CI runs (2026-09-01 → 10-06): 58 of 97 pushes to `main` re-tested a tree
that had already passed as a pull request (976 of 1,586 push job-minutes), and five went red on Windows only; since the records lane landed,
37% of CI minutes in the six days after it (a short series) still went to full runs on website, spec and learnings
changes; the whole-tree leak gate runs 18 times
per CI run; a full eval run costs $85–99 and 70–78 busy minutes, and 1.11.0 paid $286 because runs repeated, one in full
only because two places hard-coded the previous release's runs 34 and 35. CI minutes are free here; the cost is the wait on the session's critical
path and the flaky reds. Out of scope: moving the Windows leg off pull requests (it catches real defects), a merge
queue, records off `main` (plan 014).

## Decisions

### The maintainer's walk (2026-10-07)

Taken on 2026-10-07, every answer the recommended option except one: build all three files of this plan, before
Package 19 and after plan 016 file 0 and its patch release 1.11.1; review loops cap at three rounds and escalate on
what the run shows; the release eval becomes change-aware with a periodic full run; website, docs-page, spec and
learnings changes get CI lanes, with the rule that every test that can fail on a change runs before `main` moves and
the full matrix runs on every product change and weekly; builders **keep effort `high`** (the one answer that was
not the recommended option); the declared defaults below stand.

### Settled by this plan (declared defaults; the maintainer may reverse any before the run starts)

| # | Default |
|---|---|
| S1 | The proven-push check compares trees, not shas: a push to `main` is proven when its commit's tree equals the head tree of a pull request whose `all-ci-checks` check run concluded `success`. It covers fast-forward merges and up-to-date rebase merges. Any API error, missing row or other conclusion reads not proven. |
| S2 | Lanes extend `scripts/ci/records-only.mjs` into one lane classifier (`records`, `website`, `specs`, `learnings`, `full`). The `website` lane also takes docs pages outside `docs/plans/` and `docs/specs/` (the site build reads `docs/`), adding their reading tests. A change whose paths all sit in lanes runs the union of their suites; any other path runs `full`. |
| S3 | The website lane makes the docs-site build part of the required result (a lane job runs it), so `all-ci-checks` never passes a website change whose site does not build. |
| S4 | The learnings lane builds and runs `node dist/cli.js check`, because `check` validates learnings. |
| S5 | The leak gate runs once per test file process, through a support helper the two whole-tree callers share; nothing is cached across processes or commits. |
| S6 | The five serial Windows files are spread by a weight table in `vitest.config.ts` (or a custom sequencer), not by path hash. |
| S7 | Dependabot gets a `security` group per npm entry with `applies-to: security-updates`. |
| S8 | `evals/run-of-record.json` (`{"path": "...", "release": "..."}`) is the one source; the run number stays derived from the path. |
| S9 | The change-aware eval rule (unit `t7`) is in. Its periodic full run: every third release or 30 days after the last full run, whichever comes first. |
| S10 | This repository pins `gates.test` to `node scripts/ci/test-run.mjs --coverage`, CI's own ubuntu command, so one local run gives the result and the coverage floors. |
| S11 | The inbox sweep retires only rows whose settling change is on `main`, each with that evidence. |

## Spec delta

New ids start at REQ-PROVE-030 (023–025 belong to plan 014; 026–029 are headroom).

### REQ-PROVE-030 — A push whose tree already passed as a pull request skips the test matrix (ADDED)

GIVEN a push to `main` whose commit tree equals a pull request head tree with a successful `all-ci-checks` WHEN
`ci.yml` runs THEN its prove job reads proven, the test matrix, `apm-install` and `plugin-route` skip, and
`all-ci-checks` passes on the proven branch. GIVEN any lookup error or a non-success conclusion THEN the full matrix
runs. GIVEN a push THEN every push-only workflow runs as before.

### REQ-PROVE-031 — Website, spec and learnings changes take lanes (ADDED)

GIVEN a change whose every path is in a lane's path set WHEN `ci.yml` runs THEN that lane's suites and build steps run
and the full matrix skips; a change of lane paths only runs the union; any other path, any event other than push or
pull request, a bad base or an empty diff runs the full matrix.

### REQ-APM-002 — The smoke is required on every change no lane covers (MODIFIED)

`docs/specs/apm-canonical-distribution.md:118-125`: "required through `all-ci-checks` on every change that is not
records-only" becomes "… on every change that no lane covers and no proven push skips".

### REQ-PLUGIN-020 — The plugin route is required on every change no lane covers (MODIFIED)

`docs/specs/plugin-lifecycle.md:987-1002`: the same change of words as REQ-APM-002.

### REQ-PROVE-032 — One file names the eval run of record (ADDED)

GIVEN `evals/run-of-record.json` WHEN the measurements generator, the docs tests or the eval driver need the run of
record THEN they read that file; moving the run of record is a one-file change.

### REQ-PROVE-033 — The release eval follows what changed (ADDED)

GIVEN a release whose diff since the run of record touches no `content/**` file, no emitted client file (the
cross-client goldens), no file of the eval set, and no scenario model, judge model or pinned client version, and fewer
than three releases and 30 days have passed since the last full run, THEN the release carries the run of record forward
and its notes say so; otherwise it runs the full set.

### REQ-PROVE-017 — The checklist's eval line reads the change-aware rule (MODIFIED)

`docs/specs/prove-behavior-and-value.md:440-443`: the eval line reads the rule of REQ-PROVE-033.

### REQ-PROVE-020 — "Carried forward" returns in one named form (MODIFIED)

`docs/specs/prove-behavior-and-value.md:492-500`: the retired carried-to criterion stays retired except the one form
REQ-PROVE-033 names ("carried forward from run N: no model-facing change").

### REQ-PROVE-034 — A patch takes the patch lane (ADDED)

GIVEN a patch release THEN each per-release checklist line runs only when its named trigger input changed since the
last release, and the line names that trigger.

## Units

### t1-proven-push — a push whose tree already passed skips the test matrix

| Field | Content |
|---|---|
| `id` | t1-proven-push |
| `requirements` | REQ-PROVE-030, REQ-APM-002, REQ-PLUGIN-020 |
| `files` | `scripts/ci/pr-proven.mjs` (new), `test/ci/prProven.test.ts` (new), `.github/workflows/ci.yml`, `test/ci/workflow.test.ts`, `docs/specs/prove-behavior-and-value.md`, `docs/specs/apm-canonical-distribution.md`, `docs/specs/plugin-lifecycle.md` |
| `interfaces` | `decide({event, ref, tree, prRuns}) → {proven: boolean, reason: string}`, pure; `prRuns` = `[{headTree, checkConclusion}]` read with `gh api` (check runs named `all-ci-checks` on pull-request runs; `checks: read`, `actions: read`), as `pr-checks.yml:69-97` does; any error → `{proven: false}`. Job `prove-pr` (push only) outputs `proven`; heavy jobs add `&& needs.prove-pr.outputs.proven != 'true'`; the aggregator gains a third legal shape: proven, with `check`, `apm-install`, `plugin-route` and `records` skipped |
| `testCriteria` | GIVEN a push whose tree equals a successful PR head tree THEN `decide` returns proven. GIVEN a PR run with `failure`, `cancelled` or `stale`, or no row, or an API error THEN not proven. GIVEN a pull_request event THEN never proven. GIVEN the aggregator executed with proven and skipped heavy jobs THEN it passes; with proven and a failed `prove-pr` THEN it fails (`workflow.test.ts:902-984` pattern) |
| `edgeCases` | A rebase merge of a stale branch has a tree no PR run tested → not proven → full CI. `supply-chain` is advisory and red beside a green gate → read the `all-ci-checks` row, never the run conclusion (`workflow.test.ts:924-943`) |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/prProven.test.ts test/ci/workflow.test.ts` |

### t2-ci-lanes — website and docs-page, spec and learnings lanes beside the records lane

| Field | Content |
|---|---|
| `id` | t2-ci-lanes |
| `requirements` | REQ-PROVE-031, REQ-APM-002, REQ-PLUGIN-020 |
| `files` | `scripts/ci/records-only.mjs` (becomes the lane classifier; file name kept or renamed with every reference), `test/ci/recordsOnly.test.ts`, `.github/workflows/ci.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | `LANE_PATHS` and `LANE_SUITES` keyed by lane; `decide({event, base, paths}) → {lane: 'records'\|'website'\|'specs'\|'learnings'\|'full', lanes: string[], reason}`; the `changes` job outputs `lane` (keeping `records_only` derived for one release if the aggregator needs it). Suites: website = `test/ci/docsSite`, `docsRoster`, `tableHeaderScope`, `test/docsPages`, `test/ci/workflow` (website package bijection), `test/ci/leakGate`, plus the docs-site build, and for docs pages also their readers (`test/cli/docs/cliReference`, `configReference`, `measurements`, `referencePages`, `test/cli/commands/check`, `test/content/invariantsVersion`, `test/emit/capabilityMatrix`); specs = the records suites ∪ `test/records/specStatus`, `test/authoring/specPlanCoverage`, `test/ci/docsRoster`; learnings = `test/learnings/repoLearnings`, `test/ci/leakGate`, plus `npm run build` and `node dist/cli.js check`. Each list is confirmed by reading every test that names the lane's paths, as the records list was |
| `testCriteria` | GIVEN each lane's paths alone THEN `decide` names that lane; GIVEN two lanes' paths THEN the union; GIVEN a near miss (`website-old/x`, `.stamity/learnings.md`, `content/**`) THEN `full`; GIVEN `docs/specs.md` (a page, not a spec) THEN `website`. GIVEN the ci.yml step for each lane THEN its suite list equals `LANE_SUITES` (`workflow.test.ts:791-793` pattern). GIVEN the aggregator THEN exactly one lane side ran |
| `edgeCases` | A website lockfile bump (Dependabot) → website lane with the site build, not the full matrix. A plan naming a new spec in the same change → specs lane, which runs `specStatus` |
| `depends_on` | t1-proven-push |
| `verify` | `npx vitest run test/ci/recordsOnly.test.ts test/ci/workflow.test.ts` |

### t3-leak-gate-once — one whole-tree scan per test file process

| Field | Content |
|---|---|
| `id` | t3-leak-gate-once |
| `requirements` | spec carries no ids |
| `files` | `test/ci/leakGate.test.ts`, `test/docsPages.test.ts`, `test/support/leakGateRun.ts` (new) |
| `interfaces` | `runLeakGateOnce(): Promise<{status, stdout, stderr}>`, memoised per process; the 180 s budget moves to the one call; every existing assertion keeps reading the shared result |
| `testCriteria` | GIVEN `npx vitest run test/ci/leakGate.test.ts` THEN the gate process spawns once (counted through the helper) and every case asserts as before. GIVEN a planted-free tree THEN `PASS - 0 hits` still prints. GIVEN a gate failure THEN every case reading it fails |
| `edgeCases` | A cache across processes would hide a file added between runs → the memo lives in module scope only |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/leakGate.test.ts test/docsPages.test.ts test/ci/recordsOnly.test.ts` |

### t4-shard-balance — the serial Windows files split across both shards

| Field | Content |
|---|---|
| `id` | t4-shard-balance |
| `requirements` | spec carries no ids |
| `files` | `vitest.config.ts`, `test/ci/testScheduling.test.ts` |
| `interfaces` | A weight table naming the five `windows-fixtures` files with a shard each, applied by a `sequence.sequencer` (or a file split) so each shard holds two or three of them |
| `testCriteria` | GIVEN the scheduling config THEN shards 1 and 2 each hold at least two of the five serial files. GIVEN the existing pins (`testScheduling.test.ts:38-86`) THEN they still hold |
| `edgeCases` | A sixth heavy file added later → the test names the table as the place to add it |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/testScheduling.test.ts test/ci/workflow.test.ts` |

### t5-dependabot-security-groups — security updates arrive grouped

| Field | Content |
|---|---|
| `id` | t5-dependabot-security-groups |
| `requirements` | spec carries no ids |
| `files` | `.github/dependabot.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | Per npm entry (root, `website/`): `groups: { security: { applies-to: security-updates, patterns: ["*"] } }` beside the existing groups, read at GitHub's Dependabot options page (record the access date in the commit) |
| `testCriteria` | GIVEN the parsed file THEN each npm entry has a `security` group with `applies-to: security-updates`, and the existing `production` and `development` groups stay |
| `edgeCases` | The key is not accepted on an ecosystem → leave that entry and say so in the PR |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/workflow.test.ts` |

### t6-run-of-record — one file names the eval run of record

| Field | Content |
|---|---|
| `id` | t6-run-of-record |
| `requirements` | REQ-PROVE-032 |
| `files` | `evals/run-of-record.json` (new), `src/cli/docs/measurements.ts`, `test/cli/docs/measurements.test.ts`, `test/docsPages.test.ts`, `test/evals/rubricCoreHash.test.ts`, the two places that hard-coded runs 34 and 35 and so forced run 38 to run in full (named in the 1.11.0 release record's sign-off S10, `.stamity/runs/2026-09-30_release-1-11-0/record.md`), `docs/specs/prove-behavior-and-value.md` |
| `interfaces` | `evals/run-of-record.json = {"path": "evals/runs/2026-10-01-run-39/RESULTS.md", "release": "1.11.0"}`; `measurements.ts:103,116` read it; `rubricCoreHash`'s "newest run folder" keeps its own meaning and gets a name that says so |
| `testCriteria` | GIVEN a scratch copy where the JSON names another run THEN the generator, the docs tests and the driver's incremental composition all follow it. GIVEN a grep of code and tests for the run-39 path THEN only the JSON carries it |
| `edgeCases` | Prose in docs and specs that names "run 39" stays prose; only code and tests read the file |
| `depends_on` | none |
| `verify` | `npx vitest run test/cli/docs/measurements.test.ts test/docsPages.test.ts test/evals` |

### t7-release-rules — a change-aware eval per release, and a patch lane

| Field | Content |
|---|---|
| `id` | t7-release-rules |
| `requirements` | REQ-PROVE-033, REQ-PROVE-034, REQ-PROVE-017, REQ-PROVE-020 |
| `files` | `evals/SET-v7.md` (the release-rule paragraphs at `:172-208`, `:820-823`, `:969-972`), `evals/README.md`, `.github/release-controls-checklist.md`, `docs/specs/prove-behavior-and-value.md`, `test/docsPages.test.ts` (`:1307-1311`), `test/cli/docs/measurements.test.ts` (`:597-605`), `test/ci/hookLatency.test.ts` (keep its one-line rule) |
| `interfaces` | The rule text of REQ-PROVE-033 and -034 in the set's own words; each checklist per-release line gains "runs when: <trigger>"; the "carried to" wording the tests refuse today is re-admitted only in the form the rule names ("carried forward from run N: no model-facing change") |
| `testCriteria` | GIVEN the checklist THEN every per-release line names its trigger. GIVEN the docs tests THEN "carried forward" in the rule's form passes and any other carried-to wording still fails. GIVEN `test/evals` THEN the threshold strings `scripts/eval/run.mjs:36-37` read survive the edit |
| `edgeCases` | Editing SET-v7 is itself an eval-set change, so the next release runs in full. A release that changes nothing model-facing but falls on the third release or past 30 days runs in full too |
| `depends_on` | t6-run-of-record |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs/measurements.test.ts test/evals test/ci/hookLatency.test.ts` |

### t8-price-rows — Sonnet 5.5 and Haiku 4.5 priced

| Field | Content |
|---|---|
| `id` | t8-price-rows |
| `requirements` | spec carries no ids |
| `files` | `evals/price-list.json`, `test/evals/usage.test.ts` (only if it counts rows) |
| `interfaces` | Two rows in the existing shape (`inputPerMTok`, `outputPerMTok`, `cacheWrite5mPerMTok`, `cacheWrite1hPerMTok`, `cacheReadPerMTok`) from the vendor pricing page, with `accessDate` moved |
| `testCriteria` | GIVEN `npx vitest run test/evals/usage.test.ts` THEN it passes and a usage file with a Sonnet 5.5 call is priced, not `unpriced` |
| `edgeCases` | The page gives a model id that differs from the one in the call records → key the row by the id the records carry |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals/usage.test.ts` |

### t9-repo-gate-coverage — this repository's test gate is CI's coverage run

| Field | Content |
|---|---|
| `id` | t9-repo-gate-coverage |
| `requirements` | spec carries no ids |
| `files` | `.stamity/manifest.json` (through `stamity config set gates.test`), the regenerated `AGENTS.md` and emitted copies |
| `interfaces` | `node dist/cli.js config set gates.test "node scripts/ci/test-run.mjs --coverage"`, then `sync` |
| `testCriteria` | GIVEN `AGENTS.md` THEN its Tests gate reads the coverage command and its full gate chains it. GIVEN `npx vitest run test/records test/learnings test/qa` THEN green |
| `edgeCases` | A fresh worktree lane has no `dist/` → the gate still needs `npm run build` first, as today |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && node dist/cli.js check && npx vitest run test/records` |

### t10-inbox-sweep — rows a change already settled leave the inbox

| Field | Content |
|---|---|
| `id` | t10-inbox-sweep |
| `requirements` | REQ-FLOW-024 |
| `files` | `.stamity/inbox.md` and the ledgers whose rows it retires |
| `interfaces` | For each of `.stamity/inbox.md` lines 108, 194, 195, 198, 199, 220, 221, 229, 234 and 255 (at `2104b177`; re-find by text), the settling change is named and the row leaves through the retire path `/st-work`'s close uses |
| `testCriteria` | GIVEN `npx vitest run test/records` THEN green, and each retired row has its evidence in the commit message |
| `edgeCases` | A row only partly settled → stays, with its remaining part rewritten |
| `depends_on` | none |
| `verify` | `npx vitest run test/records test/learnings` |

## Execution order

1. Measure first: confirm the CI numbers in Context on the last 30 runs (`gh api`), so the PR states the baseline.
2. Lane A (CI): `t1-proven-push` → `t2-ci-lanes` (both edit the aggregator). Lane B: `t3`, `t4`, `t5`. Lane C (evals):
   `t6` → `t7` → `t8`. `t9` and `t10` last, in the integration branch.
3. The full suite alone with `STAMITY_CLAUDE_BIN` unset (the reason recorded), coverage, knip, then CI on the PR. The
   PR's own CI shows the lane split working on itself.

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | After the merge, the push run on `main` shows `prove-pr` proven and the matrix skipped | auto (the run's job list) |
| 2 | A website-only Dependabot PR takes the website lane with the site build | auto at the next such PR |
| 3 | The release checklist reads as a patch lane a person can follow | person |

## Risks

- **Warning:** the proven-push skip trusts the pull request's run; a run tests GitHub's merge commit, whose tree equals
  the head only when the branch is up to date. Mitigation: S1 compares the pushed tree with the PR head tree, and an
  out-of-date branch never matches.
- **Warning:** a lane suite list goes stale when a new test reads a lane path. Mitigation: the census in `t2` and the
  full weekly run; file 2's declared-reads guard later covers it.
- **Warning:** `t7` reverses a binding rule (the walk took it); the loss is that model drift with no repository
  change shows only at the periodic or model-change run.
- **Minor:** plans 014 and 015 edit the same eval counts and specs; whichever lands second re-bases (contract census).

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · `docs/troubleshooting.md:37` · prints "14 learning(s)" while the tree holds 18, and no test reads the count ·
  source: /st-plan · Ref: docs/plans/019-lean-flows-01.md

## Drop list

| Item | Revisit when |
|---|---|
| Move the Windows leg off pull requests | the full run passes 20 minutes |
| A merge queue or auto-merge | records leave `main` (plan 014) |
| Judge-calibration reuse between runs | it costs more than $5 a run |
