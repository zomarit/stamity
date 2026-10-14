---
id: lean-repository-02
intent: refactor
stamp: 6dfa5ffe36890ee04e1d3d3508100b5974d47207 2026-10-13
reads: [src/cli/docs/measurements.ts, scripts/generate-docs.mjs, vitest.config.ts, package.json, test/records/ledgers.test.ts, test/records/specStatus.test.ts, test/runs/inboxStore.test.ts, test/authoring/specPlanCoverage.test.ts, test/cli/docs/measurements.test.ts, test/cli/docs/llmsIndex.test.ts, test/docsPages.test.ts, test/evals/rubricCoreHash.test.ts, test/evals/manualRunner.test.ts, test/evals/support.ts, test/ci/evidenceSummary.test.ts, test/ci/workflow.test.ts, test/ci/forkIdentity.test.ts, test/ci/forkReleaseWorkflow.test.ts, test/ci/recordsOnly.test.ts, test/ci/testInputsGuard.test.ts, scripts/ci/records-only.mjs, scripts/ci/pr-proven.mjs, .github/workflows/ci.yml, .github/workflows/release.yml, .github/workflows/fork-release.yml, .github/workflows/docs-site.yml, .github/dependabot.yml, .stamity/change-classes.json, scripts/leak-gate.mjs, scripts/repo-hygiene.mjs, src/runs/ledgerStore.ts, src/runs/inboxStore.ts, src/merge/atomicWrite.ts, scripts/eval/run.mjs, .gitignore, CONTRIBUTING.md, GOVERNANCE.md, docs/specs/prove-behavior-and-value.md, docs/specs/plugin-lifecycle.md, docs/specs/apm-canonical-distribution.md, docs/specs/orchestrator-context.md, docs/specs/enterprise-upstream-lane.md]
depends_on: [.stamity/runs/2026-10-13_lean-repository/plan.md]
---

# Plan 014 file 2, re-planned in-flow — the records move to their own branch

The in-flow plan of run `2026-10-13_records-branch`. It re-plans `docs/plans/014-lean-repository-02.md` (stamp
`9239379c`, 2026-10-01; stale: every unit's anchors moved, and plan 019 file 1 reshaped the CI lane it retires) with
that file as input, under the opening batch's first answer, and is the copy every dispatch points at. **Unit ids are
kept**; two units are added (`r2b`, `r5b`). The persisted plan stays the record of the why — its Context, the
maintainer's walk of 2026-10-01, its settled defaults 1–10 except where amended below, its Risks and its Drop list — and
it holds the full interface texts the cells below cite "as persisted" (the `records.mjs` verbs, the templates, the
`records.yml` block). Every `path:line` here was read at `6dfa5ffe`; this branch stacks on pull request 1, so a unit
whose files pull request 1 also edits (`r3`, `r5`'s docs, `r7`) re-reads its anchors at dispatch.

**Tonight:** `r0`–`r5` (with `r1b`, `r2b`, `r5b`). **The maintainer's:** `r6` (the `records` push, the ruleset, the
first `records.yml` run), `r7` (the removal; the branch's first push for CI comes after it), `r8`, and the Prove phase
with the spec delta, which describes the state after `r7`.

## What changed from the persisted plan (each a sign-off in the session record)

1. **`r5` keeps `scripts/ci/records-only.mjs` and the `changes` job.** Since plan 019 file 1 the script is the
   classifier of four CI lanes (records, specs, learnings, website) feeding the `lanes` job, the proven-push skip and
   `all-ci-checks`; retiring it would remove the whole lanes side. `r5` removes the `records` lane from it and the
   kept-one-release `records_only` output instead, and REQ-PROVE-025's criterion is restated to match (spec delta).
2. **The canonical `records` job has no `needs`** and runs on every trigger, a proven push included: its input,
   `origin/records`, is not part of the tree a pull request's run proved. `all-ci-checks` asserts it outside its three
   shapes — `success` in `zomarit/stamity`, `skipped` elsewhere — with the repository passed through `env:`.
3. **`release.yml` gains two separately named steps** (restore after `Install`, the records suite after `Test`) and no
   extra fetch: its `gates` checkout already has `fetch-depth: 0` and so `origin/records` (`release.yml:161-167`,
   `:230-236`); `test/ci/forkReleaseWorkflow.test.ts` compares ten named steps only, so `fork-release.yml` stays
   byte-unchanged.
4. **The records census grew** from the persisted plan's list to 82 case sites (the research census, `r0`'s capture
   5): cases in `test/authoring/specPlanCoverage.test.ts` (`:273`, `:292`, `:296`, `:366`), `test/evals/manualRunner.test.ts`
   (`:1746`, and the run-27 read at `:1568` happens at collection, so the whole file fails without records),
   `test/docsPages.test.ts` (`:864`, `:1681`, `:1697`, `:1705`), `test/cli/docs/llmsIndex.test.ts:141` and
   `test/runs/inboxStore.test.ts:67` join the move.
5. **`r2` reads four inputs, not three:** the page also renders from the run of record's prior complete run
   (`src/cli/docs/measurements.ts:1269-1291`, reached at `:1626`; run 44's `RESULTS.md` for run 45) and, when present,
   its `NOTE.md`. `MEASUREMENT_SNAPSHOT_PATH` pins the snapshot the page renders today. **`r2` splits:** `r2` (source,
   generator, page, the new default-suite cases) and `r2b` (the existing cases moved or made synthetic), one lane.
6. **Inbox row 247** (`2026-10-11_release-1-14-0/close/10`, placed for this build: the page words one composition
   link, so a run composed on a composed run cannot become the run of record): **kept as built** — the one-link rule
   stands, run 45 stays the run of record until the next release's eval run replaces it; the close retires the row.
7. **The npm package invariant** (persisted invariant 1) compares the packed file list and every byte outside
   `dist/types/`: `tsdown` emits declarations for all of `src/**` (`tsdown.config.mjs:299-303`), so
   `dist/types/cli/docs/measurements.d.ts` moves with `r2`'s exports; it is not reachable through `package.json`'s
   `exports` (`:34-40`), and the record names the change.
8. **`r3` also edits `test/cli/docs/llmsIndex.test.ts`** (its `:141` case refuses any `scheme:` target in `README.md`)
   and the hand-page link check (`test/docsPages.test.ts:864`).
9. **Folded:** inbox row 133 into `r5` (the `git show` at `scripts/ci/records-only.mjs:221` takes `--no-textconv`, as
   the file's other reads do; its trigger is this change); inbox rows 104 and 105 as `r5b`; inbox row 195 is fixed by
   `r5` (the `records_only` output leaves); inbox row 193 by `r1` (the parser is imported from
   `src/runs/inboxStore.ts`, not moved). The persisted `r4` fold (a Dependabot entry for the `records` branch) lands in
   `r5`, which owns the pin of Dependabot's entries (`test/ci/workflow.test.ts:4666-4674`).
10. **REQ-PROVE-016's new text keeps** today's "passes while no test cites any" clause (`:463-470`), which the
    persisted text dropped.
11. **The APM figure** (`r8`'s capture 3 and § C's vendored-tree prose) is skipped (the opening default N6): the route
    leaves in the next release.

## Settled defaults

As persisted, 1–10 — the records set; no symlinks; the publish filter is `main`'s `.gitignore`; the measurements page
stays on `main` as a generated page (now with four named inputs, item 5 above); absolute record links; one dated
banner per spec section; one orphan import commit, merged by fast-forward; records first at a release close; an
injectable gate runner; and — amended — **10. The records-only *lane* retires** (the `records` lane of the classifier
and the `records_only` output), while the classifier, the `changes` job and the `lanes` job stay (item 1).

## Units

No unit touches `content/**`, so no eval case moves and no dogfood sync runs.

### r0-baselines — the before-state (the orchestrator, after pull request 1 is integrated)

| Field | Content |
|---|---|
| `id` | r0-baselines |
| `requirements` | REQ-PROVE-023 |
| `files` | this run's record; scratch outputs outside both checkouts |
| `interfaces` | As persisted, at `<base>` = pull request 1's final head: **(1)** `npm run build && npm pack --dry-run --json` (file list, sizes, `shasum`, `integrity`); **(2)** the plugin distribution tree's hash with fixed provenance inputs, twice — amended 00:00Z (the persisted command leaves out the runtime, which `--runtime` reads as an existing directory): CI's three lines (`.github/workflows/ci.yml:629-641`), `npm pack --pack-destination <scratch>`, `node scripts/build-plugin-runtime.mjs --tarball <the tarball> --out <scratch>/runtime-before-N`, then `node scripts/build-plugin-distribution.mjs --out <scratch>/dist-before-N --runtime <scratch>/runtime-before-N --source-commit <base> --source-commit-date 2026-10-13T23:51:26Z --version 1.14.0`, for N = 1, 2, and `r8` repeats them with the same inputs; **(3)** the records manifest over the ten pathspecs minus `.stamity/handoffs/.gitkeep`, row count and sha256; **(4)** sha256 of `docs/measurements.md` and of every page `node scripts/generate-docs.mjs` writes; **(5)** the record-reading census (82 case sites, research table), by file and case. |
| `testCriteria` | As persisted. |
| `edgeCases` | As persisted; invariant 1 per item 7 above. |
| `depends_on` | none |
| `verify` | the five captures exit 0, and capture (2) is stable across two runs |

### r1-records-suite — the records suite, and the ledger, inbox and spec-status splits

| Field | Content |
|---|---|
| `id` | r1-records-suite |
| `requirements` | REQ-PROVE-025, REQ-PROVE-016, REQ-CTX-006 |
| `files` | `vitest.records.config.ts` (new), `vitest.config.ts`, `package.json`, `test/support/recordsPresent.ts` (new), `test/support/recordGates.ts` (new), `test/support/specStatusRules.ts` (new), `test/records/ledgers.test.ts`, `test/records/specStatus.test.ts`, `test/records/inbox.test.ts` (new), `test/runs/ledgerGates.test.ts` (new), `test/runs/inboxStore.test.ts`, `test/authoring/specStatusRules.test.ts` (new), `.stamity/change-classes.json` (the moved files' `testInputs`), `test/ci/testScheduling.test.ts` (amended 23:39Z, S15: its two discovery cases pin the default suite's file set — both expected sets leave out `test/records/**`, with a `TEST CHANGE, justified:` comment naming this unit, plus one check that `vitest.records.config.ts` finds exactly the `test/records/` files) |
| `interfaces` | **`vitest.records.config.ts`:** `include: ["test/records/**/*.test.ts"]`, `environment: "node"`, `testTimeout: 180_000` (`GATE_RUN_TIMEOUT_MS`, `test/support/leakGateRun.ts:49`), the private temp root of `vitest.config.ts`'s exported `privateTempRoot` (`:19-23`) with `test/support/recordsPresent.ts` added to its `globalSetup`. **`recordsPresent.ts`** (default-export global setup) as persisted: it throws, with the persisted message naming `node scripts/records.mjs restore` and `setup`, unless `.stamity/runs/*/ledger.jsonl`, `docs/plans/*.md`, an `evals/runs/<YYYY-MM-DD>-run-<n>/` folder and an `evals/measurements/merge-ready-*.json` each match at least once. **`package.json`:** `"test:records": "vitest run --config vitest.records.config.ts"` beside `"test"` (`:57`). **`vitest.config.ts`:** the root `include` (`:151`) gains `exclude: [...configDefaults.exclude, "test/records/**"]`; the win32 `parallel` project's `exclude` (`:131`) gains `"test/records/**"` (`heavy`, `:112-118`, names none). **Ledgers** (`test/records/ledgers.test.ts`, 727 lines): import `parseInbox`, `INBOX_PATH`, `INBOX_SEVERITIES`, `SCHEDULE_RULE_HEADING`, `InboxProblem` from `src/runs/inboxStore.ts` and `parseLedger` from `test/support/ledgerGrammar.ts` as today (`:6-14`; inbox row 193: imported, never moved); move the pure helpers `renderProblem`, `duplicateIds`, `retiredProblems` with `runDateOf` and `RETIRED_LEAD`, `openRowLabels`, `inboxRefs`, `unaccountedDeferrals`, `RETIRED_DATE` and the two `LEGACY_*` pins (`:53-164`) to `test/support/recordGates.ts`; keep the tree cases (`:184-300`) with `trackedLedgers` (`:166-172`, `git ls-files`) replaced by `ledgersOnDisk()` (`.stamity/runs/<dir>/ledger.jsonl` per directory, POSIX-spelled, sorted); move both fixture describes (`:302-693`) to `test/runs/ledgerGates.test.ts`, and the two `.gitignore` cases (`:701-726`) there too, made hermetic (copy `main`'s `.gitignore` into a temporary repository and run `git check-ignore --no-index`, the pattern of `test/ci/repoHygiene.test.ts:156`). **Inbox:** the case "parses this repository's inbox with no problem, one row per bullet" (`test/runs/inboxStore.test.ts:67`) moves to `test/records/inbox.test.ts`. **Spec status** (`test/records/specStatus.test.ts`, 551 lines): the pure functions and constants (`:56-238`, without the tree helpers) move to `test/support/specStatusRules.ts`; the vocabulary case "holds every spec's status to the declared vocabulary" (`:337`, `docs/specs/` alone) and the fixture cases (a)–(h) (`:375-550`) move to `test/authoring/specStatusRules.test.ts`; the records file keeps `:332`, `:344` and the shipped check `:349-362` with its module-level plan reads (`:306-317`). Each moved case keeps its name and carries a `TEST CHANGE, justified:` comment naming this unit. Every moved or new test's reads are declared in `.stamity/change-classes.json`'s `testInputs`. |
| `testCriteria` | As persisted: `npm run test:records` exits 0 with the records present; `npm test` exits 0 and runs no file under `test/records/`; a temporary copy without `.stamity/runs` makes `npm run test:records` exit non-zero with the setup message; with the exclude block `setup` will write, the two `.gitignore` cases pass. Plus: `test/ci/testInputsGuard.test.ts` passes. |
| `edgeCases` | As persisted (coverage floors bind none of the moved cases; POSIX spelling on Windows). |
| `depends_on` | r0-baselines |
| `verify` | `npm run test:records && npx vitest run test/runs test/authoring test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck`, then `lockf -k /tmp/stamity-machine.lock npm test` (this unit runs alone, before the lanes) |

### r1b-records-suite-eval-cases — the eval and plan-coverage cases move or go synthetic (lane X)

| Field | Content |
|---|---|
| `id` | r1b-records-suite-eval-cases |
| `requirements` | REQ-PROVE-025 |
| `files` | `test/authoring/specPlanCoverage.test.ts`, `test/records/specPlanCoverage.test.ts` (new), `test/evals/rubricCoreHash.test.ts` → `test/records/rubricCoreHash.test.ts`, `test/evals/manualRunner.test.ts`, `test/records/run27Repeats.test.ts` (new), `test/records/evalRunInputs.test.ts` (new), `test/ci/evidenceSummary.test.ts`, `.stamity/change-classes.json` (`testInputs`) |
| `interfaces` | As persisted, at today's lines: `specPlanCoverage` `:73` (plan 006) moves; `:220` (plan 007) becomes the persisted synthetic case in place; the four cases that read other real plans move too — `:273` (plan 015's continuation line), `:292` (plan 013-02), `:296` (plan 017-01's `a1-docs-contract`), `:366` (plan 015's first `### ADDED REQ-`). `rubricCoreHash.test.ts` moves whole (it reads the newest `evals/runs/*/inputs.json`, `:44-62`; fix its imports from `test/evals/support.ts`). `manualRunner.test.ts`: the run-27 block (`:1564-1577`, including the collection-time read `:1568` and the `run27CandidateInHistory` probe) moves to `test/records/run27Repeats.test.ts`, and "keys two client versions apart through the harness…" (`:1746`, reading run 43's `inputs.json` at `:1747`) to `test/records/evalRunInputs.test.ts`; both keep their imports from `scripts/eval/run.mjs`. `evidenceSummary.test.ts:59` builds its input from the synthetic `original()` (`:16-26`) as persisted. |
| `testCriteria` | As persisted, plus: `rg -n "docs/plans/|evals/runs/" test --glob '!test/records/**'` lists only comments, fixture strings and `test/evals/fixtures/historical-replay/`; `test/ci/testInputsGuard.test.ts` passes. |
| `edgeCases` | As persisted. |
| `depends_on` | r1-records-suite |
| `verify` | `npm run test:records && npx vitest run test/authoring test/evals test/ci/evidenceSummary.test.ts test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` |

### r2-measurements-page — pinned inputs, absolute record links, a generator that tolerates no records (lane Y, first)

| Field | Content |
|---|---|
| `id` | r2-measurements-page |
| `requirements` | REQ-PROVE-020, REQ-CTX-006 |
| `files` | `src/cli/docs/measurements.ts`, `scripts/generate-docs.mjs`, `docs/measurements.md`, `test/cli/docs/measurements.test.ts` (the new cases only), `test/cli/docs/llmsIndex.test.ts` |
| `interfaces` | The persisted design, at today's lines (`src/cli/docs/measurements.ts`, 1,655 lines): constants `:75-90`; `readRunOfRecord` `:139-172`; `snapshotFiles` `:1137-1143`; `readMeasurementSnapshot` `:1156-1166`; `writeMeasurementSnapshot` `:1179-1194`; `computeMergeReadyRate` `:1005-1127`; the reach and results throws `:1218-1238`; `renderMeasurements` `:1490-1654`. **New:** `MEASUREMENT_SNAPSHOT_PATH` = the snapshot the page renders at the base (`docs/measurements.md:14` names it; `merge-ready-2026-10-13.json` at `6dfa5ffe`) with the persisted doc comment; `readMeasurementSnapshot(root, path = MEASUREMENT_SNAPSHOT_PATH)` failing with the path and `node scripts/records.mjs restore`; `RECORDS_BLOB_URL`; record links absolute at the four sites (`:1368` prior run, `:1448` note, `:1521` snapshot, `:1623` run of record), `main` links (`:1442`, `:1643`) relative; `measurementInputs(root)` returns `{ present, missing }` over the run of record's `RESULTS.md`, the reach snapshot, the pinned snapshot and — once the run of record's results are present and name a prior complete run (`compositionOf`) — that prior run's `RESULTS.md` (a `NOTE.md` stays optional); `measurementsAction(which, inputs)` as persisted. **`scripts/generate-docs.mjs`:** `render` `:72-92` (measurements `:85-87`, imports `:60-69`) takes the action — skip with the persisted notice, refuse with exit 1 before any write, or render. **`docs/measurements.md`** regenerates with links only changed. **New default-suite cases** in `test/cli/docs/measurements.test.ts`: `measurementsAction` over its three states, `measurementInputs` over a temporary root (with and without a prior run named), and the REQ-CTX-006 equality over a `fixture()` run whose rows carry `report` and `decision_needed`. **`test/cli/docs/llmsIndex.test.ts:345`** gains the skip-notice assertion when no record is present. Inbox row 247: the one-link rule stays (item 6). |
| `testCriteria` | The REQ-PROVE-020 criteria (as persisted) with four inputs; `r0`'s page against the regenerated one differs in link targets only (invariant 7). |
| `edgeCases` | As persisted; plus the prior run named but absent → refused as partial. |
| `depends_on` | r1-records-suite |
| `verify` | `npm run test:records && npx vitest run test/cli/docs && npm run lint && npm run typecheck && node scripts/generate-docs.mjs && git diff --exit-code -- docs ':!docs/measurements.md'` |

### r2b-measurements-cases — the measurements cases that read real records move or go synthetic (lane Y, second)

| Field | Content |
|---|---|
| `id` | r2b-measurements-cases |
| `requirements` | REQ-PROVE-025 |
| `files` | `test/cli/docs/measurements.test.ts`, `test/records/measurements.test.ts` (new), `.stamity/change-classes.json` (`testInputs`) |
| `interfaces` | The persisted tables, at today's lines. **Move** (a fact about a real record): `:261`, `:365`, `:569`, `:851`, `:1785`, `:1795`, `:1806`, `:2438`, `:2445`, `:2467`, and the cases the census adds that assert a real run's facts — `:689`, `:764`, `:818`, `:1113`, `:1141`, `:1170`, `:1184`, `:1239` and the describe "the page says why its run of record happened" (`:1497-1782`) — to `test/records/measurements.test.ts`, names kept. Amended 02:03Z (ledger `build/2`): also "freezes the live
computation and reads it back byte-for-byte" (base `:2351`), which the pinned read turns red, and every other case `r2`
left red (its report lists twenty, at base `:284`, `:689`, `:764`, `:917`, `:936`, `:1034`, `:1141`, `:1170`, `:1184`,
`:1239`, `:1355`, `:1368`, `:1399`, `:2351`, `:2384`, `:2398` and four in `:1497-1782`), moved or made synthetic by the
same rule. **Synthetic** (the renderer's logic, a record only borrowed as input): the render-fixture cases (`:266`, `:274`, `:284`, `:298`, `:304`, `:311`, `:337`, `:348`, `:917`, `:936`, `:2398`) and the results-pair cases (`:980`, `:1009`, `:1034`, `:1337`, `:1355`, `:1368`, `:1399`, `:1423`, `:1459`), with the persisted fixtures — `fixture()` (`:209-238`), `writeMeasurementSnapshot(root, <the pinned date>)`, a synthetic reach JSON, a synthetic run of record with its prior run — replacing `placeRenderInputs` (`:504-522`) and `readResults` (`:402-404`) where they copy a real file. A case that fits neither rule moves, and the report says why. Link assertions (`:291`, `:924`, `:941`, `:1146`, `:1359`, `:1387`, `:1415`, `:1533`) expect the absolute form for record links; `:1529` (`SET-v7.md`, a `main` path) stays relative. "reads the newest snapshot by filename date, not by write order" (`:2384-2396`) becomes "reads the pinned snapshot, not the newest file" with a `TEST CHANGE, justified:` comment. |
| `testCriteria` | `npm test` passes with no read of a real record left in `test/cli/docs/measurements.test.ts`; `npm run test:records` passes with the moved cases; `test/ci/testInputsGuard.test.ts` passes. |
| `edgeCases` | A synthetic results file must carry the sections the renderer keys on (`## 0. Composition`, `## 1.`, `## 3.`, `## 5.`), as persisted. |
| `depends_on` | r2-measurements-page |
| `verify` | `npm run test:records && npx vitest run test/cli/docs test/ci/testInputsGuard.test.ts && npm run lint && npm run typecheck` |

### r3-hand-page-links — the hand pages point into the records branch (lane Y, third; anchors re-read at dispatch)

| Field | Content |
|---|---|
| `id` | r3-hand-page-links |
| `requirements` | REQ-PROVE-020, REQ-UPSTREAM-001, REQ-UPSTREAM-007 |
| `files` | `README.md`, `docs/doctrine.md`, `docs/enterprise-forks.md`, `docs/plugins.md`, `SECURITY.md`, `test/docsPages.test.ts`, `test/cli/docs/llmsIndex.test.ts`, `test/records/docsPages.test.ts` (new), `.stamity/change-classes.json` (`testInputs`) |
| `interfaces` | As persisted, re-anchored at the branch's base (pull request 1 edits `docs/enterprise-forks.md` and `test/docsPages.test.ts`). Additions: the hand-page link check (`test/docsPages.test.ts:864`, `existsSync` at `:890-893`) skips targets matching `ALLOWED_URL` (`:421`) as the README check will; `docs/doctrine.md:98`, `:101` and `docs/enterprise-forks.md`'s plan links (`:87`, `:124` at `6dfa5ffe`) become absolute; `test/cli/docs/llmsIndex.test.ts:141` ("resolves every repo-relative link in README.md", refusing any `scheme:` target at `:146`) accepts the records URL prefix and still refuses any other scheme; the README check `:1320-1332`, `RUN_OF_RECORD_CLAIM` `:1343-1344`, `failBaselineDisclosure` `:1445`, the `it.each` at `:1488` (moved), `:1526` (synthetic), `:1542` (deleted as the duplicate of a measurements case, with its reason), and the three cases "the release eval follows what changed" (`:1681`, `:1697`, `:1705`, reading the run of record's `inputs.json` at `:1637-1642`), moved. Each edited hand page's header takes the commit form; `REATTESTATION_DATE` moves to this unit's date. |
| `testCriteria` | As persisted, plus `npx vitest run test/cli/docs/llmsIndex.test.ts` passes with no record on disk; and (amended 02:11Z, ledger `review/6`) the records-free scratch case also runs `node scripts/generate-docs.mjs --page measurements` there and expects exit 1 naming the missing inputs, and `--page all` exit 0 with the notice, at the script level. |
| `edgeCases` | As persisted (whole-file links only; no site build beside a full gate). |
| `depends_on` | r2b-measurements-cases |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs/llmsIndex.test.ts test/ci/testInputsGuard.test.ts && npm run test:records && npm run lint` |

### r4-records-script — `scripts/records.mjs`, its path list and the branch templates (lane Z, first)

| Field | Content |
|---|---|
| `id` | r4-records-script |
| `requirements` | REQ-PROVE-024 |
| `files` | `scripts/records.mjs` (new), `scripts/records-paths.mjs` (new), `scripts/records/README.md`, `scripts/records/gitignore`, `scripts/records/gitattributes`, `scripts/records/workflow.yml` (new), `test/ci/recordsScript.test.ts` (new), `.stamity/change-classes.json` (`testInputs`), `test/ci/forkIdentity.test.ts` (only if the new test or script carries a canonical literal the census counts) |
| `interfaces` | As persisted, verbatim: the module API (`setup`, `restore`, `publish` as the CLI verb `commit`, `verify`, `guard`, `init`, each `async (options) → { code, lines }`, git through `execFileSync` with argument arrays), the exclude block, the templates and the `records.yml` block (its action pins equal `ci.yml`'s: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`, `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0`). Facts read today: the leak gate lists `git ls-files --cached --others --exclude-standard` (`scripts/leak-gate.mjs:740-751`), so `--exclude-standard` honours `.git/info/exclude` — in a checkout after `setup` a plain `npm run gate` skips unpublished records, while `commit`'s gate runs it with `--root` on the scratch worktree of the built commit, where they are tracked; `repo-hygiene.mjs` runs its runtime check over the index and its raw-evidence, size and email checks only with `--base`, over the diff from the index to the base (`:53-63`, `:159-206`). The `.gitignore` rules the template copies are `main`'s `:39-41`, `:47-53`, `:74-75` (unchanged). |
| `testCriteria` | As persisted (every REQ-PROVE-024 criterion a case over a temporary bare `origin` and a clone); plus `test/ci/testInputsGuard.test.ts` and the fork-identity census pass. |
| `edgeCases` | As persisted (`git clean -X`, two machines, a lane worktree shares the exclude file, mode `100755`). |
| `depends_on` | r1-records-suite |
| `verify` | `npx vitest run test/ci/recordsScript.test.ts test/ci/testInputsGuard.test.ts test/ci/forkIdentity.test.ts && npm run lint && npm run typecheck` |

### r5-ci-records-job — CI restores the records, and the records lane leaves the classifier (lane Z, second)

| Field | Content |
|---|---|
| `id` | r5-ci-records-job |
| `requirements` | REQ-PROVE-025, REQ-PROVE-031, REQ-PLUGIN-020, REQ-APM-002 |
| `files` | `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/dependabot.yml`, `scripts/ci/records-only.mjs`, `test/ci/recordsOnly.test.ts`, `test/ci/workflow.test.ts`, `test/ci/forkIdentity.test.ts`, `.stamity/change-classes.json`, `CONTRIBUTING.md` (`:117-150` only), `GOVERNANCE.md` (`:89-110` only) |
| `interfaces` | **The classifier** (`scripts/ci/records-only.mjs`): delete `RECORDS_PATHS` and `isRecordsPath` (`:48-53`, `:91-93`), the `records:` lane (`:62`), `recordsOnly` (`:110`, `:174`) and the `records_only=` line (`:187`); five outputs stay; the file name stays (its comment `:2-3`); the `git show` of the base class file (`:221`) takes `--no-textconv` (inbox row 133). **`ci.yml`:** keep `changes` (`:163-196`), `prove-pr` (`:208-238`), the proven-push skip and `lanes` (`:775-864`); drop the `records_only` output (`:175-177`); add the job `records` after `lanes` in job order — `name: records (restored from the records branch)`, `if: github.repository == 'zomarit/stamity'`, no `needs`, `runs-on: ubuntu-latest`, `timeout-minutes: 15`, `permissions: contents: read`, steps: checkout (the file's pin, `fetch-depth: 0`, `persist-credentials: false`), setup-node 24 with `cache: npm`, `npm ci`, `node scripts/records.mjs guard`, `node scripts/records.mjs restore --ref origin/records --no-fetch --force`, `npm run test:records`, `npm run gate`, `node scripts/generate-docs.mjs --page measurements && git diff --exit-code docs/measurements.md`; `all-ci-checks` (`:977-1009`) `needs` gains `records`, and outside its three shapes it asserts, with `REPO: ${{ github.repository }}` in a step `env:`, `records` = `success` when `$REPO` is `zomarit/stamity` and `skipped` otherwise; the lane-map comments (`:19-53`) name three lanes and add the `records` job. **`release.yml` `gates`:** a step "Restore the records" after `Install` (`:281`) running `node scripts/records.mjs restore --ref origin/records --no-fetch --force`, and "Records suite" after `Test` (`:290`) running `npm run test:records`; no extra fetch; `fork-release.yml` byte-unchanged. **`.github/dependabot.yml`:** a `github-actions` entry for `/` with `target-branch: records` (the persisted `r4` fold), moving the entry-list pin (`test/ci/workflow.test.ts:4666-4674`). **`.stamity/change-classes.json`** (amended 02:21Z, S23, ledger `build/7`): drop only `test/records` and `test/records/specStatus.test.ts` from the `docs/specs/**` entry (`:82-83`), since the `records` job runs them; the four record-path entries (`:29-71`) stay while the records are tracked (removing them now turns `test/ci/testInputsGuard.test.ts` red, 18 and 209 gaps) and leave in `r7`, with the untracking. **`test/ci/workflow.test.ts`:** job order and its title count (`:247`, `:261-271`), the aggregator's `needs` (`:563-571`) and its executed form (`render()` models `needs.records.result`, `Results` gains `records`, `REPO` through the spawn environment, `:1156-1311`), `OUTPUTS` without `records_only` (`:814`, `:828-830`), a describe for the new job (guard, step order, no `needs`, permissions), the `release.yml` restore before `test:records`, the CONTRIBUTING and GOVERNANCE pins (`:2073-2085`) keeping `scripts/ci/records-only.mjs` and adding `scripts/records.mjs`; the fork-identity census (`test/ci/forkIdentity.test.ts:209`) moves by the code literals added, with its reason. **`test/ci/recordsOnly.test.ts`:** drop "the records list" (`:144-213`) and the `records_only` expectations; keep the lane, map and closure cases (`:849` is the erasable-syntax learning's proof). **`CONTRIBUTING.md:117-150`, `GOVERNANCE.md:89-110`:** three lanes; the `records` job, merge-blocking here, restores the records and runs `npm run test:records`, the leak gate over them, the drift check and `guard`; `test/docsPages.test.ts:2281-2295` reads `LANE_PATHS`' keys, so the pages name exactly the three lanes. |
| `testCriteria` | The CI criteria of REQ-PROVE-025 (as restated), REQ-PLUGIN-020 and REQ-APM-002, as `test/ci/workflow.test.ts` cases; `test/ci/recordsOnly.test.ts`, `test/ci/testInputsGuard.test.ts` (its `laned > 100` holds before `r7`) and `test/docsPages.test.ts` pass. |
| `edgeCases` | As persisted (a contributor's fork's pull request runs in the canonical repository; `origin/records` absent before `r6` → the restore step fails, so the branch is not pushed for CI before `r7`). |
| `depends_on` | r4-records-script |
| `verify` | `lockf -k /tmp/stamity-machine.lock npx vitest run test/ci test/docsPages.test.ts && npm run lint && npm run typecheck` (under the machine lock: `test/ci` holds `test/ci/pluginLifecycle.test.ts`, the four clients' live walks) |

### r5b-ci-folds — the two CI rows placed in `r5` (lane Z, third)

| Field | Content |
|---|---|
| `id` | r5b-ci-folds |
| `requirements` | REQ-PROVE-030 (the proven push), REQ-PROVE-031 |
| `files` | `scripts/ci/pr-proven.mjs`, `test/ci/prProven.test.ts`, `.github/workflows/docs-site.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | Inbox row 104 (`2026-10-08_maintainer-tooling/review/130`): `scripts/ci/pr-proven.mjs:82-96` accepts every `ci.yml` pull-request run's check suite on the head, the newest run deciding, so a reopened pull request's older suite no longer makes the merge push read unproven. Inbox row 105 (`…/review/124`): `docs-site.yml`'s pull-request build narrows so a pull request that changes the website and code builds the site once (the `check` job's LTS leg builds it under `site_build`, `ci.yml:441-459`, and `all-ci-checks` gates it); read both rows in full through `stamity ledger inbox --paths scripts/ci/pr-proven.mjs .github/workflows/docs-site.yml`. |
| `testCriteria` | A case in `test/ci/prProven.test.ts` with two pull-request runs on one head; a `test/ci/workflow.test.ts` pin of the narrowed trigger. |
| `edgeCases` | A docs-only pull request still builds the site somewhere that blocks the merge. |
| `depends_on` | r5-ci-records-job |
| `verify` | `lockf -k /tmp/stamity-machine.lock npx vitest run test/ci && npm run lint && npm run typecheck` (under the machine lock, as for `r5`) |

### r6-records-branch, r7-remove-records-from-main, r8-after-measure — the maintainer's steps

As persisted, with: `r7` also removes the four record-path entries of `.stamity/change-classes.json`'s map in the commit
that untracks the records, and `test/ci/testInputsGuard.test.ts` passes after it (S23, ledger `build/7`; the second half
of `build/1`); `r6`'s ruleset reads prepared tonight (read-only `gh api`, the exact morning commands in the
record); `r7` also takes its inbox fold (the marker check's pattern matches QA-table text in two closed records: a
`:!.stamity/runs` pathspec in the `/st-debug` marker check, or the records leaving `main` removes both hits — the
latter, once `r7` lands) and checks `test/ci/testInputsGuard.test.ts`'s `laned > 100` (`:377`) after the record paths
are untracked — the rehearsal (S30, `reports/rehearsal-implementer-r1.md`, ledger `build/16`) shows 77 lane paths left once
`docs/plans/**` leaves, so `r7` lowers that floor as a justified test change, the gaps check already 0; `r6`'s first `records.yml` run is red by construction and its success is read from a re-run after the merge (S33, `review/35`; the persisted `r6` verify gains the amendment at Prove); `r7`'s verify adds `node dist/cli.js check` in the records-free tree (S33); `r7`'s release-checklist rewrite gives the record-currency line the same three steps the
measurements page now names — `node scripts/merge-ready-rate.mjs --write`, `node scripts/records.mjs commit -m
<message>`, then the pin moved in the `main` commit that regenerates the page (`review/5`'s checklist half and
`review/15`, added 02:47Z); `r8` skips capture 3 (the APM figure) and § C's vendored-tree prose (item 11).

## Spec delta (merged at Prove, after `r7`)

As persisted (§ A–F), with: REQ-PROVE-023, -024, -025 added at the reserved ids (`docs/specs/prove-behavior-and-value.md:34-35`);
REQ-PROVE-025's CI criterion reads "the classifier has no `records` lane and no `records_only` output" in place of
"`scripts/ci/records-only.mjs` and the `changes` job are absent"; REQ-PROVE-016 (heading `:454`, text `:456-458`)
keeps "passes while no test cites any" (`:463-470`); REQ-PROVE-020 (heading `:525`, text `:529-532`) names four inputs;
REQ-PROVE-031 (heading `:901`, lanes `:903-905`) lists three lanes; the citations of tests the units moved point
at their new homes (ledger `review/7`, `r1b`'s review: REQ-PROVE-009's proof line names
`test/records/rubricCoreHash.test.ts` and `npm run test:records`, REQ-PROVE-036 the run-43 case in
`test/records/evalRunInputs.test.ts`; and each unit's own proposed spec delta in its report); REQ-PLUGIN-020's records-only and lanes amendments
(`docs/specs/plugin-lifecycle.md:1076-1088`) gain the "Superseded" lead; REQ-PLUGIN-025 (`:1328`); REQ-APM-002
(`docs/specs/apm-canonical-distribution.md:122-133`) without the vendored-tree prose; REQ-CTX-006's criteria
(`docs/specs/orchestrator-context.md:1302`, `:1316-1319`); REQ-UPSTREAM-001 (`:140`) and -007 (`:292`) found by their
quoted text, pull request 1 having moved lines in that spec. Added 02:43Z: REQ-PROVE-024 states the sync base (S24:
`commit` builds on the last synced records commit and refuses a moved branch, naming `restore`; the three-way
`restore`; its "no ref other than `records` and `origin/records` moves" also allows the per-worktree base ref, wording
in `reports/r4-fixer-r1.md`) and S25's narrowed rule ("restore never deletes a file holding unpublished bytes"); the
persisted plan's two lines that state the old rules (`docs/plans/014-lean-repository-02.md:161`, `:594`) gain an
amendment note naming S24, S25, S26 and S29's content (REQ-PROVE-024 likewise: a forced `restore` removes stale copies too; `restore` refuses a ref holding a non-record path or two paths equal under case folding, before any write; `commit` runs the same tree check before any push); the two citations of the classifier's moved lines (`build/9`:
`docs/specs/everyday-flows.md:2822`, `docs/specs/prove-behavior-and-value.md:962`) re-point. Added 03:01Z: REQ-PROVE-030 states `r5b`'s second-producer rule (every `ci.yml` pull-request run's check suite on the head is `ci.yml`'s own; the newest run decides; ledger `review/27`) and REQ-PROVE-031 the one pull-request site build with its `llms.txt` copy and upload (S28).

## Execution order

1. `r0` once pull request 1's branch is integrated; this branch `records-branch` starts at its head.
2. `r1` alone (its verify runs the full `npm test` under the machine lock).
3. Three lanes in parallel: X (`r1b`), Y (`r2` → `r2b` → `r3`), Z (`r4` → `r5` → `r5b`); no lane runs the full suite.
4. A per-unit review (Opus 5.5, effort `high`) and the security lens where `gate classify` names it.
5. Integration on `records-branch`, the full suite alone under the machine lock, `npm run test:records`, knip; the
   branch stays local (no push before `r7`). The whole-branch review on Fable 5.1 runs once `r6`–`r8` and the spec
   delta are in, before the merge.
