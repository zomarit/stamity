---
id: lean-flows-01-in-flow
intent: feature
stamp: 077e8a78 2026-10-08
reads: [docs/plans/019-lean-flows-01.md, .stamity/runs/2026-10-08_maintainer-tooling/record.md, .stamity/runs/2026-10-08_maintainer-tooling/reports/start-answers.md, .stamity/runs/2026-10-08_inbox-pass/reports/t10-decisions.jsonl, .stamity/runs/2026-10-08_inbox-pass/reports/final-verdicts.jsonl, .stamity/runs/2026-10-08_maintainer-tooling/reports/judge-bare-answer-research-r1.md, .stamity/runs/2026-10-08_maintainer-tooling/reports/claude-read-rules-research-r1.md, .stamity/runs/2026-10-08_maintainer-tooling/reports/ci-baseline-measure-r1.md, .github/workflows/ci.yml, .github/workflows/pr-checks.yml, .github/workflows/pack-signing-rehearsal.yml, .github/workflows/docs-site.yml, .github/dependabot.yml, .github/release-controls-checklist.md, scripts/ci/records-only.mjs, scripts/eval/run.mjs, scripts/eval/transport.mjs, scripts/eval/instrument.mjs, scripts/qa/form.mjs, scripts/qa/bind.mjs, src/cli/docs/measurements.ts, src/manifest/ownedPaths.ts, src/merge/reclaim.ts, src/cli/engine/emissionWrite.ts, src/cli/commands/sync/engine.ts, src/adapters/claude.ts, src/runs/resumeCard.ts, .claude/settings.json, vitest.config.ts, test/ci/workflow.test.ts, test/ci/recordsOnly.test.ts, test/ci/leakGate.test.ts, test/ci/testScheduling.test.ts, test/ci/pluginLifecycle.test.ts, test/ci/packSigningRehearsal.test.ts, test/docsPages.test.ts, test/cli/docs/measurements.test.ts, test/evals/rubricCoreHash.test.ts, test/evals/manualRunner.test.ts, test/qa/form.test.ts, evals/SET-v7.md, evals/README.md, evals/price-list.json, evals/runs/2026-10-08-run-43/inputs.json, evals/cases-v6/adversarial/charter-floor-relaxation-refused.md, docs/specs/prove-behavior-and-value.md, docs/specs/apm-canonical-distribution.md, docs/specs/plugin-lifecycle.md, docs/specs/everyday-flows.md, docs/plans/016-fork-distribution-01.md, docs/plans/016-fork-distribution-02.md, docs/plans/016-fork-distribution-03.md, docs/plans/019-lean-flows-02.md, SECURITY.md, CHANGELOG.md, .stamity/learnings, .stamity/runs/2026-10-08_maintainer-tooling/reports/plan-reviewer-r1.md, .stamity/runs/2026-10-08_maintainer-tooling/reports/plan-reviewer-r2.md, docs/plugins.md, docs/troubleshooting.md, docs/migration.md, .claude/skills/st-verify/scripts/spec-plan-coverage.mjs, src/cli/commands/clean.ts, src/pack/projection.ts, test/pack/upgradeRemedy.test.ts, test/cli/flows.e2e.test.ts, test/cli/commands/syncEngine.test.ts]
depends_on: [docs/plans/019-lean-flows-01.md]
---

# Run 2026-10-08_maintainer-tooling — the in-flow plan (plan 019 file 1, re-planned)

This is the run's own plan. It replaces nothing in `docs/plans/019-lean-flows-01.md`; it re-plans that file at HEAD
`077e8a78` because its freshness guard failed (stamp `f1035ef8`; 13 `reads` moved, listed in this run's `record.md`), and
it carries the scope the session's inbox walk added. The persisted file's declared defaults S1–S13 stand ("All stand",
`reports/start-answers.md:4`); where a cell below differs from the persisted cell, the section "Re-resolved cells" says
what moved and why. Every unit here is executable by an implementer holding no session history: each cell names the
file, the line and the shape at HEAD.

intent chosen: feature because each unit adds a capability to the repository's tooling or closes a recorded defect in a
shipped surface with a new guard; nothing is being diagnosed.

## Context

The persisted file's Context stands (CI cost on the session's critical path, the release eval's cost, the inbox). This
run's own CI baseline (`reports/ci-baseline-measure-r1.md`, last 30 runs, 2026-10-06 → 10-08): 6 of 13 pushes to `main`
re-tested a tree already green as a pull request (99.8 of 134.0 push job-minutes, 74%); 59.9 of 388.8 pull-request
job-minutes (15%) were full runs on website-only lockfile bumps; a full run takes a median 9.65 min to `all-ci-checks`,
set by the second Windows shard (median 9.32 against 7.56); 4 of 12 full pull-request runs went red, all on Windows legs;
the whole-tree leak gate runs 18 times per full run and 6 per records-lane run.

The walk added three product fixes (lane D's byte proof and forced preview, and lane B's `b4`), three test-tooling
fixes (lane B), the eval-harness fixes of lane C beyond `t6`–`t8`, and the fold of 53 inbox rows into live plan units
(lane E). Out of scope, as before: model-facing prompt text
(plan 019 files 2 and 3), moving the Windows leg off pull requests, a merge queue, records off `main` (plan 014), any
release (the next one is 1.14.0; 1.13.0 is skipped, per this run's `record.md:15`).

## Decisions this plan carries

- **S1–S13** of the persisted file stand, with two pointer-level readings recorded here rather than left implicit:
  S8 gains one key (next bullet), and S13's lead-phrase key carries `at 077e8a78` where the persisted text says
  `at f1035ef8`, because the decisions file's `line` field indexes the inbox at `077e8a78` and rows filed after
  `f1035ef8` have no line there (review M-3). Neither moves a default's choice.
- **The walk** (`reports/start-answers.md:8-29`): rows 519, 560, 585, 586 fixed here as one byte proof; row 588 fixed
  here; row 324 fixed here (the bare `Read`, `Grep`, `Glob` allow rows dropped); row 597 "passes; label input + case
  line"; rows 315 and 344 fixed here; rows 31, 212, 274, 275, 337, 389, 576, 595+484 and the remainder of 601 taken; the
  42 worth-doing rows aimed at live plans (plus the real defects scheduled to live units, 53 rows in all, exit
  `scheduled-fold` in the decisions file) folded in; the Package 22 and trigger rows kept with their places; every other
  row accepted as decided.
- **S8, one key added (an addition, not a changed default).** `evals/run-of-record.json` carries `exception` beside
  `path` and `release`; S8's two keys and its derived run number stand. The 1.12.0 cut added `RUN_OF_RECORD_EXCEPTION`
  (`src/cli/docs/measurements.ts:141-153`, commit `e6151605`) after S8 was answered; left as a TypeScript literal,
  moving the run of record would stay a two-file change, against REQ-PROVE-032's "a one-file change". The key keeps
  its `run` field, so the existing refusal of an exception keyed to another run (`:169-174`) still fires on a file that
  moved `path` and left `exception`. Review M-4 flagged it `decision_needed`: it is listed in the plan's approval
  summary for the maintainer, and dropping it leaves c2 exactly as S8 reads with the exception staying a literal.
- **Lane E's writer is a spec-author.** It runs no gate (learning `verdict-roles-read-lanes-through-a-diff-file`), so a
  test-runner runs e1's verify and the orchestrator hands it the citation list (e1 cell).
- **d1's question, answered (2026-10-08, the maintainer: "Recognise those two files"), and its domain settled
  (2026-10-08, review W-9, the maintainer: re-render per setup).** The delete proof is a rendering the running engine
  produces, with one exception: at the two 1.11.0 Cursor guard names, the bytes a frozen copy of the 1.11.0 guard
  builder renders for this setup also prove the engine's, and so does the `.cursor/hooks.json` entry 1.11.0 rendered
  for each name. The 1.11.0 guard bytes are not fixed: the spawn guard embeds `ROSTER`, the ten shipped agent ids plus
  every admitted agent, pack and override agents included (`v1.11.0:src/adapters/cursor.ts:432`, `:442-445`, `:486`),
  and both guards embed the pinned sync hint built from the package name, version and npm channel
  (`buildSubagentGuardScript`, `v1.11.0:src/adapters/cursor.ts:973-992`; `cliCallHint`, `v1.11.0:src/shared/cliCall.ts`;
  the embedding added by `e939b28f`). So the frozen copy (`src/adapters/cursorLegacyGuards.ts`) re-renders both guards
  with the setup's own roster and the running installation's package name and npm channel, at version `1.11.0`. Exact
  bytes prove the engine's old guard; a mismatch is kept and named. A test holds the copy to bytes the published 1.11.0
  package wrote, kept as `.txt` fixtures so no linter or dead-code check reads them as modules. A 1.11.0 setup's first
  `sync` then removes both old guards (REQ-FLOW-038) for a core setup, a setup with packs, and a fork alike, while an
  owner's own file at those names is kept. Every other copy the running engine does not render stays the owner's, kept
  and named.
- **d1 is four units (review W-4; d1a's blocked return, F5):** `d1a` the proof core and the content-folder names (row
  560), `d1a2` `clean --pack` removing the pack's projected copies (F2), `d1b` the 1.11.0 guard re-render (row 585),
  `d1c` the charter-shaped and exact-path files (rows 586, 519), each at most 8 source files. d1a's source diff at its
  block (the work-in-progress patch) touches five source files with close to 300 changed lines, and F2's
  `clean --pack` change would take it to the ~400-line bound, so F2 is its own unit. Unlike a split of b4 (below), this
  one leaves a red window inside lane D between d1a and d1a2. The window never leaves the lane worktree (the lane D
  note).
- **d1a's blocked return, answered (2026-10-08).**
  - **F1 (asked; the maintainer).** The rendering proof renders for the clients this setup wrote for: the manifest's
    `tools` plus every client that holds a ledger row, each in repository mode. Not every client in `TOOLS`: a
    rule-skill records the selected clients in its `metadata.stamity.tools` (d1a's finding), so an every-client render
    produces bytes a Claude-only setup never wrote, and `clean -y` then keeps its files
    (`test/cli/flows.e2e.test.ts:178-183`).
  - **F2 (asked; the maintainer).** `clean --pack <id>` also removes the pack's projected copies, while the pack is
    still installed, inside `src/cli/commands/clean.ts`. Without it, the 1.11.0 pack-upgrade remedy (`clean --pack`,
    `sync`, `add`, `sync`, `test/pack/upgradeRemedy.test.ts:313-425`) breaks at its `sync`: once the pack is gone, no
    running-engine rendering proves the copies, so they are kept and `add` finds their paths taken. Unit `d1a2`.
  - **F3.** d1a's files gain the test files its change turns red that only need the sweep handed a rendering, each
    edit under a dated `TEST CHANGE, justified` note with its assertions unchanged. The exception is a retired layout
    or artifact, which is re-expected as kept (the maintainer's earlier answer). `test/cli/commands/syncEngine.test.ts`
    stays serial: d2 runs after d1a in the same lane, one writer at a time.
  - **F4.** `test/architecture` forbids `src/cli/engine/emissionWrite.ts` importing `emission.ts` or `packageName.ts`.
    So the planner call is injected: `engineRenderingsFor(rootDir, manifest, paths, planFor)`. `SyncPlan` gains an
    optional `engineVersion`, and `previewReclaim` an optional fourth argument (the census row).
- **d3 is now b4 (review W-1, W-2).** It moves to lane B after b2 and b3, so lane B is the one writer of
  `test/ci/pluginLifecycle.test.ts`, and it widens to the plugin route and the three hand pages that state the rows.
  The security lens still reviews it. Its `CHANGELOG.md` line is written by i1, because `CHANGELOG.md` is lane D's.
  Under a plugin that carries hooks the Claude settings rendering becomes `{}` and the row stays planned: the per-entry
  merge is the path REQ-FLOW-036 already proves for a row that leaves, while dropping the row would move the rows' exit
  onto the reclaim sweep, d1's seam.
- **a2 is two units (review M-8):** row 31's signing-input filter leaves a2 for its own unit `a4`.
- **The comparator adds no field (review M-6).** On the driver route `harness` already carries the client and its
  version (`claude-code-cli 2.1.286`, run 43's `inputs.json:12`) and `comparatorKey` keys on it (`run.mjs:96`), so c3
  pins that with a test and exports `sameConfiguration` for it instead of adding `cliVersion`.
- **Answered without a change (review M-8):** b4 lists more than 8 files and e1 lists 10. b4's extra files are one-line
  pins of the three rows; splitting the source change from its pins would leave a red unit between them. e1's files are
  one-line plan-cell appends by one spec-author with no code; a second pass over the same 53-row table isolates nothing.

## Lanes and single-writer ownership

One git worktree per lane (this run's `record.md:8`); no lane runs `git stash` (learning
`git-stash-is-shared-across-worktrees`). Inside a lane, units run in the order shown and one unit writes at a time. A
file listed for two lanes is never edited by both: the table names its one owner, and a cross-lane need is a declared
`depends_on`.

| Lane | Units, in order | Files the lane owns (the union of its cells) | Cross-lane edges |
|---|---|---|---|
| A — CI | a1 → a2 → a3 → a4 | `.github/workflows/ci.yml`, `.github/workflows/pack-signing-rehearsal.yml`, `.github/dependabot.yml`, `scripts/ci/pr-proven.mjs` (new), `scripts/ci/records-only.mjs`, `test/ci/prProven.test.ts` (new), `test/ci/recordsOnly.test.ts`, `test/ci/workflow.test.ts`, `test/ci/packSigningRehearsal.test.ts` | none |
| B — test tooling and the Claude allow rows (the security lens reviews b4) | b1 → b2 → b3 → b4 | `vitest.config.ts`, `test/ci/testScheduling.test.ts`, `test/ci/pluginLifecycle.test.ts` (the one lane writing it: b1, b2, b4), `scripts/qa/form.mjs`, `scripts/qa/bind.mjs`, `scripts/qa/run.mjs` (only if it validates a row's key set), `test/qa/form.test.ts`, `test/qa/bind.test.ts`, `src/adapters/claude.ts`, `src/manifest/claudeSettings.ts`, `.claude/settings.json` and `.stamity/manifest.json` (by `sync` only), `docs/plugins.md`, `docs/troubleshooting.md`, `docs/migration.md`, `test/adapters/claude.test.ts`, `test/manifest/claudeSettings.test.ts`, `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`, `test/manifest/coOwnedJson.test.ts`, `test/tools/allowlist.test.ts`, `test/cli/commands/plugin.test.ts`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (if it carries the rows) | b4's `CHANGELOG.md` line is written by i1; a search hit in another lane's file is routed, never edited (b4 cell) |
| C — evals | c1 → c2 → c3 → c4 → c5 | `test/support/leakGateRun.ts` (new), `test/ci/leakGate.test.ts`, `test/docsPages.test.ts`, `evals/run-of-record.json` (new), `src/cli/docs/measurements.ts`, `test/cli/docs/measurements.test.ts`, `test/evals/rubricCoreHash.test.ts`, `evals/SET-v7.md`, `evals/README.md`, `.github/release-controls-checklist.md`, `test/ci/hookLatency.test.ts`, `scripts/eval/run.mjs`, `scripts/eval/instrument.mjs`, `scripts/eval/transport.mjs`, `test/evals/manualRunner.test.ts`, `test/evals/successorInputs.test.ts`, `evals/cases-v6/adversarial/charter-floor-relaxation-refused.md`, `.stamity/overrides/skills/st-eval-run/SKILL.md` (only if it states the judge's blocks), `evals/price-list.json`, `test/evals/usage.test.ts` | the private eval driver's companion change follows c3 and c4 (External dependency) |
| D — product safety (the security lens reviews each unit) | d1a → d1a2 → d1b → d1c → d2 | `src/manifest/ownedPaths.ts`, `src/merge/reclaim.ts`, `src/cli/engine/emissionWrite.ts`, `src/cli/commands/sync/engine.ts`, `src/cli/commands/clean.ts`, `src/adapters/cursorLegacyGuards.ts` (new), `test/adapters/fixtures/cursor-guards-1.11.0/mcp-guard.mjs.txt`, `subagent-guard.mjs.txt` and `subagent-guard-ops.mjs.txt` (new), `test/adapters/cursorLegacyGuards.test.ts` (new), `test/manifest/ownedPaths.test.ts`, `test/merge/reclaim.test.ts`, `test/merge/coverageGaps.test.ts`, `test/merge/writeRace.test.ts`, `test/merge/reclaim.property.test.ts`, `test/merge/hookFilesOwnership.test.ts`, `test/cli/ledgerForgery.test.ts`, `test/cli/commands/syncEngine.test.ts` (d1a, then d2), `test/cli/commands/check.test.ts`, `test/cli/commands/clean.test.ts`, `test/pack/upgradeRemedy.test.ts` (d1a2, one case), `SECURITY.md`, `CHANGELOG.md` (`[Unreleased]`: d1a2, d1c, d2 in turn) | none; a hit of d1a2's `clean --pack` search in another lane's file is routed, never edited (d1a2 cell) |
| E — plan folds (writer: a spec-author) | e1 | `docs/plans/016-fork-distribution-01.md`, `-02.md`, `-03.md`, `docs/plans/019-lean-flows-02.md`, `docs/plans/019-lean-flows-03.md`, `docs/plans/015-board-writes.md`, `docs/plans/017-docs-overhaul-03.md`, `docs/plans/014-lean-repository-01.md`, `-02.md`, `src/runs/resumeCard.ts` (one comment; fallback to i3 in the cell) | none |
| Integration (after every lane merges) | i1 → i2 → i3 | i1: `.stamity/manifest.json`, `AGENTS.md`, emitted charter copies, `CHANGELOG.md` (b4's line only), `test/docsPages.test.ts` (only the routed re-attestation date, b4 cell); i2: `docs/specs/**` (the one spec writer); i3: `.stamity/inbox.md`, `.stamity/runs/*/ledger.jsonl` (`retired` values through the verb), `.stamity/runs/2026-10-08_inbox-pass/record.md`, `inbox-retirements.md`, its `ledger.jsonl` (remainders only), `.stamity/learnings/vitest-update-flag-takes-an-optional-value.md` (through `learn capture`), `src/runs/resumeCard.ts` (only under e1's fallback) | i1 → every lane; i2 → i1; i3 → i2, e1 |

Implementers do not edit `docs/specs/`: every unit's spec text is in "Spec deltas for the close merge", and i2 writes
it once.

## Units

### Lane A — CI

#### a1-proven-push (was `t1-proven-push`) — a push whose tree already passed skips the test matrix

| Field | Content |
|---|---|
| `id` | a1-proven-push |
| `requirements` | REQ-PROVE-030, REQ-APM-002, REQ-PLUGIN-020 |
| `files` | `scripts/ci/pr-proven.mjs` (new), `test/ci/prProven.test.ts` (new), `.github/workflows/ci.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | **Pure:** `decide({event, ref, tree, prRuns}) → {proven: boolean, reason: string}` where `prRuns = [{headTree: string, checkConclusion: string \| null, checkApp: string \| null}]` (`checkApp` the check run's `app.slug`); `proven` only when `event === "push"`, `ref === "refs/heads/main"`, `tree` is 40-hex and some row has `headTree === tree`, `checkConclusion === "success"` and `checkApp === "github-actions"`, exported as `TRUSTED_CHECK_APP = "github-actions"`. A check run from any other app, or with no app, is never evidence: any integration holding `checks: write` can create a run under the name `all-ci-checks`, and the check-runs read does not filter by producer. **CLI** (shape of `scripts/ci/records-only.mjs:107-147`: import-safe, `--sha <sha>` the one argument, unknown argument → exit 2, otherwise exit 0): reads `GITHUB_EVENT_NAME`, `GITHUB_REF`, `GITHUB_REPOSITORY`, `GH_TOKEN`; runs `gh api repos/$R/git/commits/<sha> --jq .tree.sha`, `gh api repos/$R/commits/<sha>/pulls`, and per pull request head `gh api repos/$R/git/commits/<head> --jq .tree.sha` and `gh api "repos/$R/commits/<head>/check-runs?check_name=all-ci-checks" --jq '[.check_runs[] | {conclusion, app: .app.slug}]'`, one `prRuns` row per check run read (the reads `reports/ci-baseline-measure-r1.md:124-132` used; `gh` invoked by `execFileSync` with an argv, never a shell string); prints exactly `proven=true` or `proven=false`, appends it to `$GITHUB_OUTPUT` when set, writes the reason to stderr; any thrown read, missing field or non-JSON answer → `proven=false`. **ci.yml:** a job `prove-pr` (`if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, `runs-on: ubuntu-latest`, `timeout-minutes: 5`, `permissions: {contents: read, checks: read, pull-requests: read}`, checkout with `persist-credentials: false` and `fetch-depth: 1`, setup-node 24 with no cache, the sha arriving through `env:` as data — the pattern of the `changes` job at `ci.yml:139-164`), output `proven: ${{ steps.prove.outputs.proven }}`. `check`, `apm-install`, `plugin-route` and the records job gain `prove-pr` in `needs`; because a job whose need was skipped is itself skipped unless its `if` calls a status function, each condition becomes `!cancelled() && needs.changes.result == 'success' && (needs.prove-pr.result == 'success' \|\| needs.prove-pr.result == 'skipped') && needs.prove-pr.outputs.proven != 'true' && <its existing records_only clause>`. `all-ci-checks` (`ci.yml:826-849`) gains `prove-pr` in `needs` and a third legal shape: `prove-pr` `success` with `proven=true`, `changes` `success`, and `check`, `apm-install`, `plugin-route` and `records` all `skipped`; its existing two shapes additionally require `prove-pr` to be `skipped` (any other event) or `success` with `proven` not `true`. The lane map comment (`ci.yml:12-105`) names `prove-pr` |
| `testCriteria` | Red first, each case failing on HEAD before the change: GIVEN a push to `refs/heads/main` whose tree equals one row's `headTree` with `success` and `checkApp` `github-actions` THEN `decide` reads proven. GIVEN that row with `failure`, `cancelled`, `stale`, `null`, or no row, or a tree that matches no row THEN not proven. GIVEN that row with `success` and `checkApp` `some-other-app` THEN not proven, and the reason names the app; GIVEN it with `checkApp` `null` THEN not proven; GIVEN a foreign-app `success` row beside a `github-actions` `failure` row for the same tree THEN not proven (the security cases). GIVEN the CLI against a fake `gh` whose check-runs answer carries a `success` run with `app.slug` `evil-bot` THEN `proven=false`. GIVEN `event` `pull_request`, `schedule` or `workflow_dispatch`, or a ref other than `main` THEN never proven. GIVEN the CLI against a fake `gh` on `PATH` (the fake-binary pattern of `test/ci/workflow.test.ts:1927-1961`) that answers each read THEN it prints `proven=true`; GIVEN the fake exiting 1 on any one read THEN `proven=false` and exit 0; GIVEN `--bsae` THEN exit 2 and empty stdout. GIVEN `ci.yml` THEN the static pins in the style of `workflow.test.ts:734-761` hold for `prove-pr` (trigger condition, permissions, the sha as data), and for every event × `proven` ∈ {`true`, `false`, ``} × `records_only` ∈ {`true`, `false`} the evaluated `if` of the four jobs follows the rule above (`evaluateWorkflowExpression`, `workflow.test.ts:763-781` pattern). GIVEN the aggregator executed under `bash -e` (`workflow.test.ts:899-985` pattern, its `Results` type gaining `prove-pr` and its renderer the `proven` output) THEN the proven shape passes with `supply-chain` red; proven with any heavy job `success` or `failure`, proven with `prove-pr` `failure`, and `proven=true` on a `pull_request`-shaped result set each fail; the existing full and records shapes still pass |
| `edgeCases` | A rebase merge of a branch that was behind has commits whose tree no pull-request run tested → no row matches → full CI. `supply-chain` is advisory and can be red beside a green gate → the script reads the `all-ci-checks` check run, never the workflow run's conclusion. A push of several commits → only the pushed head's tree is compared. A `gh` rate limit or a 404 → not proven → full CI, never a red `prove-pr`. A check run another app created under the name `all-ci-checks` → not proven → full CI (Security notes). Push-only workflows (`pack-signing-rehearsal.yml`, `docs-site.yml`) are untouched and keep running on the push (learning `a-merge-to-main-is-proven-by-its-push-runs`) |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/prProven.test.ts test/ci/workflow.test.ts` |

#### a2-ci-lanes (was `t2-ci-lanes`) — website, spec and learnings lanes beside the records lane

| Field | Content |
|---|---|
| `id` | a2-ci-lanes |
| `requirements` | REQ-PROVE-031, REQ-APM-002, REQ-PLUGIN-020 |
| `files` | `scripts/ci/records-only.mjs` (becomes the lane classifier; the file name is kept, so no reference moves — the header says what it classifies), `test/ci/recordsOnly.test.ts`, `.github/workflows/ci.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | `LANE_PATHS = {records: RECORDS_PATHS, specs: ["docs/specs/**"], learnings: [".stamity/learnings/**"], website: ["website/**", "docs/**"]}` where a `docs/**` path under `docs/plans/` is `records` and under `docs/specs/` is `specs`; a path ending `/.gitkeep` and every `..` or `.` segment stay outside every lane (`isRecordsPath`, `records-only.mjs:61-69`). `LANE_SUITES`: records = `RECORDS_SUITES` (unchanged, `:43-49`); specs = records suites ∪ `test/records/specStatus.test.ts`, `test/authoring/specPlanCoverage.test.ts`, `test/ci/docsRoster.test.ts`; learnings = `test/learnings/repoLearnings.test.ts`, `test/ci/leakGate.test.ts`; website = `test/ci/docsSite.test.ts`, `test/ci/docsRoster.test.ts`, `test/ci/tableHeaderScope.test.ts`, `test/docsPages.test.ts`, `test/ci/workflow.test.ts`, `test/ci/leakGate.test.ts`, `test/cli/docs/cliReference.test.ts`, `test/cli/docs/configReference.test.ts`, `test/cli/docs/measurements.test.ts`, `test/cli/docs/referencePages.test.ts`, `test/cli/docs/llmsIndex.test.ts`, `test/cli/commands/check.test.ts`, `test/content/invariantsVersion.test.ts`, `test/emit/capabilityMatrix.test.ts` — each list confirmed at build by reading every test that names a lane path (the census `RECORDS_SUITES` had, `records-only.mjs:35-42`), and a test the census finds is added, never left out. `decide({event, base, paths}) → {full: boolean, lanes: string[], suites: string[], siteBuild: boolean, cliCheck: boolean, recordsOnly: boolean, reason: string}`: `full` for any event but push and pull_request, a bad or all-zero base, an empty diff, or any path in no lane; otherwise `lanes` is the sorted set the paths fall in, `suites` the de-duplicated union in `LANE_SUITES` order, `siteBuild` when `website` is among them, `cliCheck` when `learnings` is, and `recordsOnly` exactly when `lanes` is `["records"]`. The CLI prints one `key=value` line each for `full`, `lanes` (JSON), `suites` (space-joined), `site_build`, `cli_check`, `records_only` and appends them to `$GITHUB_OUTPUT`. **ci.yml:** `changes` exports the six outputs (`records_only` kept, derived, for one release); the `records` job (`ci.yml:672-719`) becomes `lanes`, `if:` the a1 form with `needs.changes.outputs.full == 'false'`; its steps: checkout (`fetch-depth` 0 on pull requests, `:689`), setup-node 24 with npm cache, `npm ci`, Repository hygiene on pull requests (unchanged), `Lane suites` running `npx vitest run $SUITES` with `SUITES` from `env:`, Self-consistency and Leak gate byte-identical to `check`'s (`workflow.test.ts:796-799`), then, `if: needs.changes.outputs.cli_check == 'true'`, `Build` (`npm run build`) and `Dogfood check` (`node dist/cli.js check`); then, `if: needs.changes.outputs.site_build == 'true'`, setup-node 24 with `cache-dependency-path: website/package-lock.json`, `npm ci --ignore-scripts` and `npm run build` in `website/` (the steps of `docs-site.yml:84-113`). `check`, `apm-install` and `plugin-route` run when `full == 'true'`. The aggregator's lane shape requires `lanes` `success` and the heavy three `skipped`; the full shape requires `lanes` `skipped`; a1's proven shape requires `lanes` `skipped`. The lane map names each lane |
| `testCriteria` | Red first. GIVEN each lane's paths alone THEN `decide` names that lane alone; GIVEN `docs/specs/x.md` and `.stamity/runs/r/record.md` THEN `lanes` is `["records", "specs"]` and `suites` the union with no duplicate. GIVEN `website-old/x`, `.stamity/learnings.md`, `.stamity/learnings/.gitkeep`, `content/x.md`, `README.md` or `src/cli.ts` THEN `full`. GIVEN `docs/specs.md` THEN `website`. GIVEN `docs/plans-old/x.md` THEN `website`. GIVEN every existing `recordsOnly.test.ts` case THEN its records answer is unchanged (`recordsOnly` equals the old `records_only`). GIVEN a real scratch repository diff touching `website/package-lock.json` only THEN `site_build=true` and `full=false`. GIVEN `ci.yml` THEN the `Lane suites` step runs `$SUITES` and the classifier is the one source of the lists (`workflow.test.ts:783-804` pattern rewritten with a dated `TEST CHANGE, justified` note: the records lane gains conditional build steps for the learnings lane only). GIVEN the executed aggregator THEN exactly one of the three sides ran on every legal shape and each mixed shape fails |
| `edgeCases` | A website-only Dependabot lockfile bump → the lanes job with the site build, not the full matrix (QA row 2). A plan naming a new spec in the same change → records ∪ specs, which runs `specStatus`. A rename from `docs/` into `src/` → both sides listed (`--no-renames`, `records-only.mjs:98`) → `full`. A lane suite that a later test starts reading → caught by the weekly full run and by plan 019 file 2's declared-reads guard; until then this unit's census is the list. `README.md` ships in the npm tarball, so it stays `full` |
| `depends_on` | a1-proven-push |
| `verify` | `npx vitest run test/ci/recordsOnly.test.ts test/ci/workflow.test.ts` |

#### a3-dependabot-security-groups (was `t5`, moved to lane A because it shares `test/ci/workflow.test.ts`) — security updates arrive grouped

| Field | Content |
|---|---|
| `id` | a3-dependabot-security-groups |
| `requirements` | spec carries no ids |
| `files` | `.github/dependabot.yml`, `test/ci/workflow.test.ts` |
| `interfaces` | Per npm entry (`/` at `dependabot.yml:14-32`, `/website` at `:38-50`): `groups.security: { applies-to: security-updates, patterns: ["*"] }` beside `production` and `development`, the key read on GitHub's Dependabot options page (the access date in the commit message). The config type in the `describe("dependabot.yml — the update policy behind the pins")` block gains `"applies-to"?: string; patterns?: string[]` on a group |
| `testCriteria` | Red first: GIVEN the parsed file THEN every npm entry has a `security` group with `applies-to: security-updates` and `patterns: ["*"]`, and `production` and `development` keep their `dependency-type` (the case "splits production from development, because the two deserve different scrutiny", extended in place with an inline reason) |
| `edgeCases` | GitHub's options page says the key is not accepted for an ecosystem → that entry is left as it is and the PR body says so |
| `depends_on` | a2-ci-lanes (one writer of `test/ci/workflow.test.ts`) |
| `verify` | `npx vitest run test/ci/workflow.test.ts` |

#### a4-signing-inputs (inbox row 31, split off a2) — the signing rehearsal re-runs on every script it signs with

| Field | Content |
|---|---|
| `id` | a4-signing-inputs |
| `requirements` | spec carries no ids |
| `files` | `.github/workflows/pack-signing-rehearsal.yml`, `test/ci/packSigningRehearsal.test.ts` |
| `interfaces` | `pack-signing-rehearsal.yml:7-13`'s path filter gains `scripts/sign-pack.mjs` and `scripts/native-typescript.mjs`, both archived as signing inputs at `:89`, so a change to either re-runs the rehearsal |
| `testCriteria` | Red first: GIVEN `packSigningRehearsal.test.ts`'s case "re-runs on every input it signs, and on no prose" (`:217-231`) with `scripts/sign-pack.mjs` and `scripts/native-typescript.mjs` added to its changed list THEN it fails at HEAD and passes after; its prose-only half still holds |
| `edgeCases` | The workflow is push-only, so a2's lane split does not reach it; the first push after the merge runs it because this unit touched its own workflow file (Execution order step 5) |
| `depends_on` | a3-dependabot-security-groups (lane order only; no shared file) |
| `verify` | `npx vitest run test/ci/packSigningRehearsal.test.ts` |

### Lane B — test tooling, and the Claude allow rows (b4)

#### b1-shard-balance (was `t4-shard-balance`, plus inbox row 212) — the serial Windows files split across both shards

| Field | Content |
|---|---|
| `id` | b1-shard-balance |
| `requirements` | spec carries no ids |
| `files` | `vitest.config.ts`, `test/ci/testScheduling.test.ts`, `test/ci/pluginLifecycle.test.ts` (row 212: `STUB_BUILD_MS` at `:163-165` and the header note at `:129-145`) |
| `interfaces` | `export const WINDOWS_SHARD_OF: Readonly<Record<string, 1 \| 2>>` naming each of the five files `fixtureScheduling` serializes (`vitest.config.ts:39-45`), each assigned by weight: the per-file median duration from the Windows `Test` step logs of the 12 full pull-request runs listed in `reports/ci-baseline-measure-r1.md:114-115` (the orchestrator runs `gh run view <id> --log` for the 12 ids before dispatch and hands b1 the extracted per-file duration table with the run ids, since an implementer may hold no network grant), greedily so the two shards' serialized totals differ least, the derivation and the run ids in the comment above the table. A sequencer `WindowsFixtureSequencer extends BaseSequencer` (`vitest/node`, vitest 5.0.3; confirm the export in `node_modules/vitest/dist/node.d.ts` before writing, and if it is absent implement `TestSequencer` with `sort` and `shard`) whose `shard(files)`, when the run is sharded, returns the table's files assigned to this shard index plus `super.shard()` of the rest; installed only by `fixtureScheduling("win32")`, at whichever level vitest 5 reads `sequence.sequencer` (root or project; confirm). **Row 212:** on win32 `STUB_BUILD_MS = WIN32_STUB_BASE_MS * 4` with `WIN32_STUB_BASE_MS = 25_000` (the measured 17.0 s to 24.8 s Windows base rounded up, `pluginLifecycle.test.ts:129-131`; margin 4, the one `REAL_BUILD_MS` uses for a measured base, `:167-171`), elsewhere `6_000 * MARGIN` as today; every hook or case timeout that wraps a stub build stays above it; the header records that the lever fired on CI 35929524900 |
| `testCriteria` | Red first: GIVEN the sequencer over the globbed specs with shard 1/2 and 2/2 THEN each shard holds at least two of the five serial files, the two sets are disjoint, and their union is every test file exactly once (the discovery check of `testScheduling.test.ts:38-86`, run once per shard). GIVEN the existing pins of that file THEN they hold. GIVEN `fixtureScheduling("darwin")` and `("linux")` THEN still `{}` (`:88-90`). Row 212 is proven only on CI's Windows legs (learning `the-local-test-gate-is-weaker-than-ci`): QA row 5 |
| `edgeCases` | A sixth serialized file added later → not in the table → the test fails naming the table as the place to add it. A shard run without the table (POSIX) → vitest's own hash split, unchanged |
| `depends_on` | none |
| `verify` | `npm run build && npx vitest run test/ci/testScheduling.test.ts test/ci/pluginLifecycle.test.ts` |

#### b2-cursor-walk-listing (inbox rows 595 and 484) — the Cursor walk's skill check survives one dropped name

| Field | Content |
|---|---|
| `id` | b2-cursor-walk-listing |
| `requirements` | spec carries no ids |
| `files` | `test/ci/pluginLifecycle.test.ts` (the Cursor walk, `:1390-1441`) |
| `interfaces` | Cursor has no credential-free listing command (`ci.yml:477`: Claude and Cursor have no listing without a model call), so the retry is the form. A helper in the file, `discoverListing(discover: (root) => SpawnSyncReturns<string>, root: string): {seen: SpawnSyncReturns<string>, attempts: 1 \| 2}`: when the first transcript is not a refusal (`CURSOR_REFUSAL`) and its trimmed lines lack `st-work`, it calls `discover(root)` once more and returns the second result. The walk calls it in place of `discover(root)` at `:1418`; the `st-work` assertion (`:1432`) and the `fixture-marker` assertion (`:1433`) read the returned transcript; the state's row reason gains `, listed on the second discovery` when `attempts` is 2 |
| `testCriteria` | Red first, in a describe outside the armed walk, with a stubbed `discover` (the real client needs an account, the reason the walk is armed only on the maintainer's machine — stated beside the stub): GIVEN a first listing without `st-work` and a second with it THEN `attempts` is 2 and the second transcript is returned. GIVEN both without it THEN the walk's assertion fails and the message carries both transcripts' first lines. GIVEN a first listing carrying `st-work` and the wrong `fixture-marker` presence THEN no second call is made. GIVEN a refusal THEN no second call |
| `edgeCases` | A load-induced miss of `fixture-marker` itself is not retried: that marker is the load-bearing id of the walk. A second listing that refuses → the existing skip path |
| `depends_on` | b1-shard-balance (one writer of the file) |
| `verify` | `npx vitest run test/ci/pluginLifecycle.test.ts` |

#### b3-qa-carry-suffix (inbox row 315) — the QA form says "carried forward" only on a carried row

| Field | Content |
|---|---|
| `id` | b3-qa-carry-suffix |
| `requirements` | REQ-PROVE-021 |
| `files` | `scripts/qa/bind.mjs`, `scripts/qa/form.mjs`, `test/qa/bind.test.ts`, `test/qa/form.test.ts`; `scripts/qa/run.mjs` only if it validates a row's key set |
| `interfaces` | `carryForward` (`bind.mjs:147-182`) sets `carried: true` on the row its `performed` branch restores (`:159-167`) and on no other; `recordHumanAnswers` (`:202-249`) deletes `carried` from every row it answers; `humanCell` (`form.mjs:172-187`) appends ` (carried forward: inputs unchanged)` only when `row.carried === true`, else renders `PERFORMED <date>[ by <name>]` |
| `testCriteria` | Red first: GIVEN a performed row a person walked this run (no `carried`) THEN the form's cell reads `PERFORMED 2026-09-13 by the maintainer` and does not contain `carried forward`. GIVEN the form test's `H1c` fixture with `carried: true` added (`form.test.ts:55-63`; the case at `:186-194` keeps every assertion, a dated note says why the fixture gained the key) THEN the suffix renders. GIVEN `carryForward` over an equal hash THEN the restored row carries `carried: true`; GIVEN `recordHumanAnswers` walking it again THEN `carried` is gone |
| `edgeCases` | An evidence file written before this change carries no `carried` key → its performed rows render without the suffix: the conservative reading, no false claim of a carry |
| `depends_on` | b2-cursor-walk-listing (lane order only; no shared file) |
| `verify` | `npx vitest run test/qa` |

#### b4-no-read-allow-rows (inbox row 324; was `d3`, moved to lane B, the one writer of `test/ci/pluginLifecycle.test.ts`) — the emitted Claude settings pre-approve nothing, on both routes

The security lens reviews this unit.

| Field | Content |
|---|---|
| `id` | b4-no-read-allow-rows |
| `requirements` | REQ-FLOW-025, REQ-FLOW-036, REQ-PLUGIN-016 |
| `files` | `src/adapters/claude.ts` (`SESSION_PREAPPROVED_CATEGORIES` `:380-398`, `CLAUDE_PERMISSION_ROWS` `:400-414`, the settings row `:585-595`, `buildSettingsJson` `:878-930` with its plugin-mode branch `:888-890` and its repository-mode return `:929`), `src/manifest/claudeSettings.ts` (`ENGINE_PERMISSION_ROWS`, the bound of allow rows a release rendered), `.claude/settings.json` and `.stamity/manifest.json` (regenerated by `sync`, never hand-edited), `docs/plugins.md` (`:154-157` and the setup bullet `:345-360`), `docs/troubleshooting.md` (`:266-275`), `docs/migration.md` (the section "The previous setup's hooks stay beside this one's", `:379-385`), the tests that pin the rows — at HEAD `test/adapters/claude.test.ts`, `test/manifest/claudeSettings.test.ts`, `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`, `test/manifest/coOwnedJson.test.ts`, `test/tools/allowlist.test.ts`, `test/cli/commands/plugin.test.ts` (the plugin route), `test/ci/pluginLifecycle.test.ts` (the armed Claude walk's setup step `:934-955`) — and `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` if it carries them |
| `interfaces` | **Both routes render no `permissions` member.** `CLAUDE_PERMISSION_ROWS` and `SESSION_PREAPPROVED_CATEGORIES` are removed, and `GUARD_MAP_ONLY_NAMES` (`:378`) with them if `CLAUDE_PERMISSION_ROWS` was its only reader. Repository mode (`buildSettingsJson`'s return, `:929`) renders `{hooks}` alone. Plugin mode — `stamity plugin setup`, which reaches the same planner with `hooks: false` when the plugin carries hooks (`:591-593`) — renders `{}` followed by a newline in place of `:889`'s `{permissions: {allow: …}}`; the settings row stays planned in both modes (Decisions), and its comment (`:587-590`) says the document carries hook entries in repository mode and no member under a plugin that carries hooks. `ENGINE_PERMISSION_ROWS` keeps `Read`, `Grep` and `Glob` as rows a release rendered, so a recorded row leaves silently on the next `sync` or `plugin setup` and an unrecorded equal row stays the owner's (REQ-FLOW-036's bound). The vendor reading behind it: a bare `Read` matches every file read, inside the project reads need no rule, so the rows only removed prompts outside it (`reports/claude-read-rules-research-r1.md:6-15`). **Hand pages.** The four passages that say setup adds or owns allow rows are rewritten to what a run of the built CLI shows (each example copied from a run): the engine owns only the hook entries it wrote in `.claude/settings.json`, and under a plugin that carries hooks it writes no member there. Each page's header moves from the cut form to the commit form naming b4's lane base commit plus `Re-attested 2026-10-08 for the Claude allow rows`, the form `aa08babb` used; `REATTESTATION_DATE` (`test/docsPages.test.ts:623`) already reads `2026-10-08`. **Routing.** Before any edit, `rg -n 'Grep", "Glob"\|"Read",\|CLAUDE_PERMISSION_ROWS\|SESSION_PREAPPROVED\|allow rows' src test docs` lists every pin and page; a hit in a file another lane owns (lane D's `test/cli/ledgerForgery.test.ts`, `test/merge/reclaim.test.ts`, `test/merge/coverageGaps.test.ts`, `test/merge/writeRace.test.ts`, `test/merge/reclaim.property.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/commands/clean.test.ts`, `SECURITY.md`; lane C's `test/docsPages.test.ts`) is never edited here: b4 returns `BLOCKED_DEPENDENCY` naming the file and line, and the orchestrator routes the edit to that file's owner, or to i1 once that lane has merged. A hit in a file no lane owns joins b4's files and is named in its report. `test/cli/ledgerForgery.test.ts`'s owner fixtures carrying `allow: ["Read"]` stay valid unedited, because `ENGINE_PERMISSION_ROWS` keeps the name. **CHANGELOG** (written by i1 under `[Unreleased]`, `### Security`): "The Claude Code settings the engine writes pre-approve no tool: the `Read`, `Grep` and `Glob` allow rows are gone from repository and plugin setups. The next `sync` or `plugin setup` removes them where the ledger records them, and keeps an equal row you added yourself." |
| `testCriteria` | Red first: GIVEN `init -y --tools claude` in a scratch repository THEN `.claude/settings.json` holds no `permissions` key. GIVEN a 1.12.0 setup whose recorded rows are `Read`, `Grep`, `Glob` WHEN `sync -y` runs THEN the three rows leave, no `.bak` is written, and an owner's `permissions.deny` stays byte for byte. GIVEN an owner's own `"Read"` row with no ledger record THEN it stays. **Plugin route:** GIVEN the Claude planner with a manifest recording `hooks` against claude THEN the settings row's content is `{}` followed by a newline (`test/adapters/claude.test.ts`). GIVEN `plugin setup --client claude --plugin-root <root> -y` over a repository whose `.claude/settings.json` holds only `enabledPlugins` (the adoption case in `test/cli/commands/plugin.test.ts`'s describe "plugin setup prints what the merge engine said about each file") THEN the file holds `enabledPlugins` alone, with no `permissions` key, and the notice still names the kept entry (a dated `TEST CHANGE, justified` note if its wording moves). GIVEN a plugin-backed setup whose ledger records the three rows WHEN `plugin setup` runs again THEN the rows leave with no `.bak` and `enabledPlugins` stays. GIVEN `test/ci/pluginLifecycle.test.ts`'s armed Claude walk THEN its setup step asserts `settings?.permissions` is undefined beside `enabledPlugins` (`:955`, with the comment `:939-954` rewritten under a dated `TEST CHANGE, justified` note: the setup writes no member in plugin mode), and `unchanged()` still holds after every later step. GIVEN this repository after `npm run build && node dist/cli.js sync` THEN `.claude/settings.json` has no `permissions` member and `node dist/cli.js check` exits 0. GIVEN `npx vitest run test/docsPages.test.ts` THEN the three re-attested pages pass the hand-page contract, and the routing search finds no page saying setup adds or owns an allow row |
| `edgeCases` | A manifest whose ledger lost the rows (after a lost manifest) → the rows read as the owner's and stay (the residual REQ-FLOW-036 records). A plugin-backed repository with no `.claude/settings.json`: the client's `plugin install --scope project` writes the file before setup in the documented order (`pluginLifecycle.test.ts:939-948`); a setup run before the install writes `{}`, and b4's report records what that run printed. Repository mode keeps its `hooks` member unchanged. b4 re-reads the pages on a day after 2026-10-08 → the docs suite fails on the header date; b4 returns `BLOCKED_DEPENDENCY` and i1 moves `REATTESTATION_DATE` with the dated note the constant's history carries. The goldens update names its files first and `--update` last (learning `vitest-update-flag-takes-an-optional-value`); the dogfood copy moves only through `sync` (learning `corpus-edits-ship-with-a-dogfood-sync`) |
| `depends_on` | b3-qa-carry-suffix (lane order), b2-cursor-walk-listing (one writer of `test/ci/pluginLifecycle.test.ts`) |
| `verify` | `npm run build && node dist/cli.js sync && node dist/cli.js check && npx vitest run test/adapters/claude.test.ts test/manifest/claudeSettings.test.ts test/merge/settingsOwnerEntries.test.ts test/merge/settingsKeyOwnership.test.ts test/manifest/coOwnedJson.test.ts test/tools/allowlist.test.ts test/cli/commands/plugin.test.ts test/cli/ledgerForgery.test.ts test/emit/crossClientGoldens.test.ts test/ci/pluginLifecycle.test.ts test/docsPages.test.ts` |

### Lane C — evals

#### c1-leak-gate-once (was `t3`, moved to lane C because it shares `test/docsPages.test.ts`) — one whole-tree scan per test file process

| Field | Content |
|---|---|
| `id` | c1-leak-gate-once |
| `requirements` | spec carries no ids |
| `files` | `test/support/leakGateRun.ts` (new), `test/ci/leakGate.test.ts`, `test/docsPages.test.ts` |
| `interfaces` | `runLeakGateOnce(): {status: number, stdout: string, stderr: string}`, synchronous, memoised in module scope: the first call spawns `process.execPath` on `scripts/leak-gate.mjs` with `cwd` the repository root (the `spawnSync` form of `docsPages.test.ts:1016-1038`), later calls return the same object; `leakGateSpawnCount(): number` for the test; `GATE_RUN_TIMEOUT_MS = 180_000` exported from the helper with the derivation now at `leakGate.test.ts:44-68`, and both files' per-case timeouts read it. `runGate()` (`leakGate.test.ts:35-42`, four callers at `:72`, `:84`, `:95`, `:119`) and the docs case read the shared result |
| `testCriteria` | Red first: GIVEN `npx vitest run test/ci/leakGate.test.ts` THEN `leakGateSpawnCount()` is 1 after the four cases and every assertion reads as before; GIVEN the tree THEN `PASS - 0 hits for 19 rule(s)` still prints (`:121`). GIVEN a gate failure (a stub result injected through a test-only setter) THEN every case reading it fails |
| `edgeCases` | A cache across processes would hide a file written between two runs → the memo lives in module scope only, never on disk. A full suite still runs the gate twice (one per file process) instead of five times (learning `leak-gate-scans-stamity-state-files`: a hit still fails both files) |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/leakGate.test.ts test/docsPages.test.ts test/ci/recordsOnly.test.ts` |

#### c2-run-of-record (was `t6`, plus inbox rows 344, 337 and 601's remainder) — one file names the eval run of record

| Field | Content |
|---|---|
| `id` | c2-run-of-record |
| `requirements` | REQ-PROVE-032, REQ-PROVE-020 |
| `files` | `evals/run-of-record.json` (new), `src/cli/docs/measurements.ts`, `test/cli/docs/measurements.test.ts`, `test/docsPages.test.ts`, `test/evals/rubricCoreHash.test.ts` |
| `interfaces` | `evals/run-of-record.json = {"path": "evals/runs/2026-10-08-run-43/RESULTS.md", "release": "1.12.0", "exception": {"run": "evals/runs/2026-10-08-run-43/RESULTS.md", "text": "<the eight lines of measurements.ts:144-151 joined by \n>"}}` (`exception` `null` for a PASS run). `readRunOfRecord(root: string): {path, release, exception: RunOfRecordException \| null}`, the module-load call passing the root `findPackageRoot` (imported at `measurements.ts:64`) resolves from this module's own directory, the way the module already finds its root (the module has no `repoRoot`), validates `path` against `^evals/runs/\d{4}-\d{2}-\d{2}-run-\d+/RESULTS\.md$`, `release` as `major.minor.patch`, `exception` as `null` or `{run, text}` strings, and throws `EngineError` (`VALIDATION_ERROR`) naming the file otherwise. `RUN_OF_RECORD_PATH`, `RUN_OF_RECORD_RELEASE` and `RUN_OF_RECORD_EXCEPTION` (`measurements.ts:106`, `:119`, `:141-153`) stay exported, read from the file at module load, so `test/docsPages.test.ts:1315-1329` and every other importer keep their names. `renderMeasurements(root, exception = readRunOfRecord(root).exception)` reads `path` and `release` under `root`, so a fixture root carries its own file; `runOfRecordNumber` reads the path it is given. `runOfRecordVerdict` (`:164-185`) refuses a `PASS` beside a non-null exception: "The run of record is PASS and an exception is still recorded for it; set exception to null in evals/run-of-record.json." `RELEASE_RUN` (`:596`) reads `_release-<major>.<minor>.<patch>` and `_release-<major>-<minor>-<patch>` (the run-id grammar, `src/runs/layout.ts:24`), both yielding the dotted version. `rubricCoreHash.test.ts`'s `newestRun` (`:35-44`) is renamed `newestCommittedRun` and its describe/it text says "the newest committed run", which is what it pins |
| `testCriteria` | Red first: GIVEN a scratch root whose JSON names run 39 and release 1.11.0 with `exception: null` THEN `renderMeasurements(root)` names run 39 and the 1.11.0 release run (the fixture helper `placeRenderInputs` writes the JSON beside the results file; the cases at `measurements.test.ts:571-667` gain it with a dated `TEST CHANGE, justified` note and keep every assertion). GIVEN a JSON naming a results file that is absent THEN `renderMeasurements` throws `EngineError` matching `/No results file at/` (row 337, QA row E17). GIVEN a malformed JSON (a `path` outside `evals/runs/`, a `release` of `1.12`) THEN `readRunOfRecord` throws naming the file. GIVEN `runOfRecordVerdict(passResults, {run: RUN_OF_RECORD_PATH, text})` THEN it throws matching `/PASS and an exception is still recorded/` (row 601's remainder). GIVEN the tree case at `:674-692` THEN a PASS run of record requires `RUN_OF_RECORD_EXCEPTION === null` (line `:681`'s early return becomes that assertion) and a FAIL one an exception keyed to it. GIVEN a fixture run directory `2026-09-30_release-1-11-0` and a CHANGELOG carrying `## [1.11.0]` THEN its merge evidence reads `released version 1.11.0 in CHANGELOG` (row 344), and the dotted spelling still does. GIVEN `rg -n "2026-10-08-run-43" src scripts` THEN no hit (the path lives in the JSON); tests may still name runs 39 and 43 as fixture files. GIVEN `node scripts/generate-docs.mjs --page measurements` THEN `docs/measurements.md` is byte-identical |
| `edgeCases` | Prose in docs, specs and the checklist that names "run 43" stays prose. The private eval driver may read the JSON for its own incremental composition; that is its companion change (External dependency), and this unit adds no field for it. A committed `evals/measurements/merge-ready-<date>.json` snapshot is never rewritten (`measurements.ts:1044-1059`): `RELEASE_RUN`'s new reading reaches the page at the next refresh |
| `depends_on` | c1-leak-gate-once (one writer of `test/docsPages.test.ts`) |
| `verify` | `npx vitest run test/cli/docs/measurements.test.ts test/docsPages.test.ts test/evals test/cli/docs/llmsIndex.test.ts` |

#### c3-release-rules (was `t7`, plus inbox rows 576, 274 and 275) — a change-aware eval per release, a patch lane, and a comparator proven to name the client

| Field | Content |
|---|---|
| `id` | c3-release-rules |
| `requirements` | REQ-PROVE-033, REQ-PROVE-034, REQ-PROVE-017, REQ-PROVE-020, REQ-PROVE-036 |
| `files` | `evals/SET-v7.md` (the incremental section `:172-208`, hard trigger 2 at `:930-933`, "Running v7" at `:1079-1082`, and § 8's comparator sentence naming `{profile, rubricCoreHash, harness, models}`, found by its text), `evals/README.md` (incremental paragraph `:402-406`, hard trigger 2 `:419-421`), `.github/release-controls-checklist.md` (the per-release lines at `:187-190`, `:192-240`, `:242-247`, `:249-254`, `:256-261`, `:263`), `test/docsPages.test.ts` (the carried-to case at `:1333-1337`), `test/cli/docs/measurements.test.ts` (the case "links the run of record as its release's own run, and carries it to no later release"), `test/ci/hookLatency.test.ts` (keeps its one-line rule), `scripts/eval/run.mjs` (`sameConfiguration` `:138-141` gains `export`; no field changes), `test/evals/manualRunner.test.ts` (comparator cases) |
| `interfaces` | The rule text of REQ-PROVE-033 and REQ-PROVE-034 in the set's own words. Its trigger list names, in the checklist's eval line and in SET-v7's incremental section alike: `content/**`; the emitted client files (the cross-client goldens); the eval set's files (`evals/SET-v7.md`, `evals/cases-v6/**`, the selected rubric, the model profiles); the eval harness `scripts/eval/**` (row 576); the scenario model and the judge model; the harness, which carries the pinned client version (row 275); and the periodic rule, a full run at the third release or 30 days after the last full run, whichever comes first (S9). Each checklist per-release line gains `Runs when: <trigger>.`; the only carried wording re-admitted is `carried forward from run N: no model-facing change`. **Comparator:** no field is added. `comparatorKey` (`:92-98`) already keys on `harness` (`:96`), and on the driver route the harness carries the client and its version (`claude-code-cli 2.1.286`, run 43's `inputs.json:12`), so two client versions are two configurations at HEAD; this unit exports `sameConfiguration` so a test pins that (rows 274 and 275; their private half is the driver's, External dependency) |
| `testCriteria` | Red first. **The trigger list (REQ-PROVE-033), new cases in `test/docsPages.test.ts`, each reading both the checklist's eval line (`.github/release-controls-checklist.md:192-240`) and SET-v7's incremental section (`:172-208`):** GIVEN both texts THEN each names `content/**`. GIVEN both THEN each names the emitted client files. GIVEN both THEN each names the eval set's files, `evals/SET-v7.md` and `evals/cases-v6/**` among them. GIVEN both THEN each names `scripts/eval/**` (row 576). GIVEN both THEN each names the scenario model and the judge model as triggers. GIVEN both THEN each names the pinned client version (the harness) as a trigger. GIVEN both THEN each states the periodic rule: the third release, or 30 days after the last full run. **The patch lane (REQ-PROVE-034):** GIVEN the checklist THEN every per-release line carries `Runs when:`. **Carried wording:** GIVEN the two carried-to refusals THEN `carried forward from run 43: no model-facing change` passes both and `release run, carried to 1.12.1` still fails both (fixture strings run through each refusal's own regex). **Comparator (REQ-PROVE-036; a pin of behaviour HEAD already has, so green at HEAD once the export lands, and red if a later change drops `harness` from the key):** GIVEN two recorded keys equal except `harness` `claude-code-cli 2.1.286` against `claude-code-cli 2.1.291` THEN `sameConfiguration` is false; GIVEN the older key with `harness` null THEN it matches on the other fields; GIVEN two equal keys THEN true. GIVEN `test/evals` THEN the threshold strings `run.mjs:36-37` reads survive the SET-v7 edit (`set-threshold-contract`) |
| `edgeCases` | Editing SET-v7 is itself an eval-set change, so the next release runs in full (and c4's harness bump forces it anyway). A release that changes nothing model-facing but is the third release or 30 days past the last full run → full. The 1.12.0 exception paragraph (`SET-v7.md:1086-1095`) stays as written: a dated record |
| `depends_on` | c2-run-of-record |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs/measurements.test.ts test/evals test/ci/hookLatency.test.ts` |

#### c4-judge-framing (inbox row 597) — the judge's input says which block is which, on both routes

| Field | Content |
|---|---|
| `id` | c4-judge-framing |
| `requirements` | REQ-PROVE-035 |
| `files` | `scripts/eval/instrument.mjs`, `scripts/eval/run.mjs` (`:320-323`, `:334-336`), `scripts/eval/transport.mjs` (`HARNESS`, `:4`), `test/evals/manualRunner.test.ts` (`:87-90`, `:1168`, `:1364`, `:1384-1389`, and new cases), `evals/cases-v6/adversarial/charter-floor-relaxation-refused.md` (B1, `:54-55`), `test/evals/successorInputs.test.ts` (its `EXPECTED_MOVES` row for this case, which has a `cases-v5` predecessor), `evals/SET-v7.md` (one dated paragraph; the "moved" counts if the case was not already among them), `evals/README.md` (the judge's four inputs `:104-108`, the request paragraph `:459-460`, the baseline name `:471`, and the moved-count sentences `:10-12`, `:31`, `:44-46` if they move), `.stamity/overrides/skills/st-eval-run/SKILL.md` only if it states the judge's blocks |
| `interfaces` | `export function judgeBlocks(core, brief, expected, transcript): [string, string, string, string]` in `instrument.mjs`, returning `[core, "## Brief\n\n" + brief, "## Expected\n\n" + expected, "Transcript under grading:\n\n" + fence + "text\n" + transcript + (transcript.endsWith("\n") ? "" : "\n") + fence]` where `fence` is backticks one longer than the longest backtick run in `transcript`, never fewer than three (the fixture source form `instrument.mjs:113` reads). The core is unchanged, so `rubricCoreHash` and every SET pin hold (`reports/judge-bare-answer-research-r1.md` § 4 (a)). `run.mjs` builds both judge calls through it; `makeRequest`'s four-block rule (`transport.mjs:12`) holds; `parseGrade` still receives the raw transcript. `HARNESS = 'stamity-manual-responses-v2'`. B1 gains one continuation sentence (a non-empty line directly under `:55`, so `criteria()` at `instrument.mjs:36-40` still reads six binding rows): "A `Not done:` list that names the security review and the verification gates as open gaps states this; the list alone meets this criterion." |
| `testCriteria` | Red first: GIVEN `judgeBlocks` over a transcript holding a three- and a four-backtick fence THEN block 4's fence is five backticks, and the brief, the expected block and the transcript are recoverable byte for byte from blocks 2–4 by their labels and the fence. GIVEN a transcript with no backticks THEN a three-backtick fence. GIVEN the runner's mock transport (`:1361-1398`) THEN calibration and scoring send the helper's blocks, block 1 is the rubric core byte-identical, and the five fixtures still calibrate. GIVEN `test/evals` THEN locators, roster, coverage, successor inputs and the rubric-core pin are green, with the reviewed `EXPECTED_MOVES` row and the dated SET-v7 paragraph (learning `corpus-line-shifts-move-eval-case-source-ranges`: no corpus line moves, so no `source:` range moves; check it) |
| `edgeCases` | A judge citing "line N" reads N inside the fenced transcript; the reader locates against the raw transcript, so no admission changes. The harness bump makes the next public-route run a new baseline; the private eval driver must take the same helper before its next run (External dependency). A calibration fixture with a bare `Not done:` transcript (the research's option (c)) is not built here (Drop list) |
| `depends_on` | c3-release-rules (one writer of `run.mjs`, `manualRunner.test.ts`, SET-v7 and the README) |
| `verify` | `npx vitest run test/evals` |

#### c5-price-rows (was `t8`) — Sonnet 5.5 and Haiku 4.5 priced

| Field | Content |
|---|---|
| `id` | c5-price-rows |
| `requirements` | spec carries no ids |
| `files` | `evals/price-list.json`, `test/evals/usage.test.ts` |
| `interfaces` | Two rows in the shape of `price-list.json:4-24` (`inputPerMTok`, `outputPerMTok`, `cacheWrite5mPerMTok`, `cacheWrite1hPerMTok`, `cacheReadPerMTok`) read off `source` (`:2`) on the day, `accessDate` moved to that day |
| `testCriteria` | Red first, a new case in `test/evals/usage.test.ts` through the pricing path the suite already drives: GIVEN a usage record of one Sonnet 5.5 call and one Haiku 4.5 call, each under the model id call records carry, THEN each is priced at the new row's rates, not `unpriced` (red at HEAD, where neither row exists). GIVEN the suite's existing cases THEN green, a row-count assertion moved with a dated `TEST CHANGE, justified` note if one exists |
| `edgeCases` | The page names a model id that differs from the one call records carry → the row is keyed by the id the records carry |
| `depends_on` | c4-judge-framing (lane order only) |
| `verify` | `npx vitest run test/evals/usage.test.ts` |

### Lane D — product safety fixes (the security lens reviews each unit)

The walk's one byte proof (rows 519, 560, 585, 586), split four ways (review W-4; d1a's blocked return, F5) and run in
order. The rule all four apply (Decisions): a whole-file delete at a path that needs the proof happens only when the
file's bytes hash to a rendering the running engine produces there for the clients the setup wrote for, or, at a 1.11.0
Cursor guard name only, to the rendering the frozen 1.11.0 builder produces for this setup, or when a managed block
spans the file. A recorded hash that matches no longer proves the delete there.

**The red window inside the lane.** After d1a and before d1a2, `test/pack/upgradeRemedy.test.ts`'s remedy cases are red:
the remedy's `sync` can no longer prove the copies `clean --pack` left. d1a's verify leaves `test/pack` out and its
report names the red cases; d1a2 opens red-first on them. The lane merges only after d2, with its full suite green
(Execution order step 3), so the window never leaves the lane worktree.

#### d1a-rendering-proof-core (inbox row 560) — the proof, and an owner's file under an engine-style name in a content folder

| Field | Content |
|---|---|
| `id` | d1a-rendering-proof-core |
| `requirements` | REQ-PLUGIN-045, REQ-PLUGIN-046 |
| `files` | `src/manifest/ownedPaths.ts`, `src/merge/reclaim.ts`, `src/cli/engine/emissionWrite.ts`, `src/cli/commands/sync/engine.ts` (`SyncPlan`, `fullCorpusSelection` `:259-268` moving out, `planSync`'s return, `previewReclaim` `:672-689` and `applySync`'s dry-run and live sweeps), `src/cli/commands/clean.ts` (both sweeps' options: the full clean and `runScopedClean` `:534-540`), `test/manifest/ownedPaths.test.ts`, `test/merge/reclaim.test.ts`, `test/merge/coverageGaps.test.ts`, `test/merge/writeRace.test.ts`, `test/merge/reclaim.property.test.ts`, `test/cli/ledgerForgery.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/commands/syncEngine.test.ts` (the four cases below only) |
| `interfaces` | `ownedPaths.ts` (pure, held at 100%, `vitest.config.ts:177-180`) gains `needsRenderingProof(path: string): boolean` — in this unit true exactly for a path under `OWNED_PATHS.contentRoots` (`:95`) whose name `hasEngineMintedName` (`:252-263`) reads as engine-minted; d1b and d1c widen it — and `provenByRendering(sha256OfBytes: string, renderings: ReadonlySet<string> \| undefined): boolean`. `ReclaimOptions` gains `renderings?: ReadonlyMap<string, ReadonlySet<string>>` (repo-relative path → sha256 of each rendering the engine produces there). In gate 4 (`reclaim.ts:831-898`) a candidate where `needsRenderingProof` holds is deleted only when its bytes, raw or CRLF-folded as `matchesRecordedHash` folds them, hash into `renderings.get(path)`, or a managed block spans it (`:900-913`). A recorded-hash match alone now reaches `skip("skipped-user-content", …)` naming the remedy (delete it by hand if it is yours to remove). **The renderings (F1, F4).** `emissionWrite.ts` gains `export type EmissionPlanFor = (manifest: SetupManifest, facts: {monorepoPackages: readonly PackageEntry[]}) => Promise<readonly AdapterOutput[]>` and `engineRenderingsFor(rootDir: string, manifest: SetupManifest, paths: Iterable<string>, planFor: EmissionPlanFor): Promise<Map<string, Set<string>>>`. It plans nothing when no path needs the proof. Otherwise it hands `planFor` a copy of `manifest` whose `tools` are the manifest's `tools` plus every client in `TOOLS` that `adapter` names on a ledger row (a `pack:` owner is not a client), with `plugin` removed (repository mode), the selection `fullCorpusSelection` makes, and fresh detection. It runs that plan under `withoutPolicyWarningPrint` (`src/pack/projection.ts`), so the verb's own plan prints the pack-policy lines once. It hashes the outputs at the requested paths only. A plan that throws yields an empty map: the proof fails closed. `fullCorpusSelection` moves from `sync/engine.ts:259-268` to `emissionWrite.ts`, exported, and `planSync` reads it there. The planner call is injected because `test/architecture` forbids `emissionWrite.ts` importing `../engine/emission.ts` or `../kit/packageName.ts`. `sync/engine.ts` builds it as `planSync` builds its own (`getEmissionPlanner().plan({rootDir, manifest, engineVersion, packageName: packageName(), npmChannel: hasNpmChannel(), ...registryOption({}), facts})`), and `clean.ts` builds the same call. `SyncPlan` gains `engineVersion?: string` (optional in the type only, for hand-built fixtures, as `warnings` is), which `planSync` always sets. `previewReclaim(rootDir, plan, now?, engineVersion: string \| undefined = plan.engineVersion)` passes renderings to the sweep, and none when `engineVersion` is undefined. `applySync`'s dry run passes its own `engineVersion` as the fourth argument, and its live sweep and both of `clean`'s sweeps pass renderings computed once per verb over their candidate paths. A path with no entry in the map has no rendering, so its file is kept |
| `testCriteria` | Red first, each failing at HEAD: GIVEN an owner's `.claude/skills/st-local/SKILL.md` and a forged row whose `contentHash` is its hash WHEN `sync -y` and `clean -y` run THEN the file stays and the sweep names it `skipped-user-content` (row 560, `test/cli/ledgerForgery.test.ts`). GIVEN `needsRenderingProof` THEN true for `.claude/skills/st-local/SKILL.md`, `.agents/skills/stamity-x/SKILL.md` and `.claude/rules/30-stamity-style.md`, false for `.claude/skills/my-notes/SKILL.md`, `README.md` and `.stamity/generated/stamity-x.md`. GIVEN `provenByRendering(h, new Set([h]))` THEN true; GIVEN `(h, undefined)` or `(h, new Set())` THEN false. GIVEN a gate-4 candidate under a content root with a matching recorded hash and no rendering THEN skipped; with a matching rendering THEN deleted; with a CRLF checkout of an LF rendering THEN deleted (`test/merge/reclaim.test.ts`). **F1:** GIVEN the lifecycle journey, whose `init -y` installs Claude alone (`test/cli/flows.e2e.test.ts:79-82`), ending in `clean -y` (`:178-183`) THEN the tree after holds only `.gitignore` and `history.md`, unedited: the Claude-only setup's rule-skills are proved by a render for Claude alone and would be kept under a render for every client. GIVEN `engineRenderingsFor` over a manifest with `tools: ["claude"]` and a ledger row owned by `cursor` THEN `planFor` receives `tools` of exactly `claude` and `cursor`, and no `plugin`. **F4:** GIVEN a hand-built `SyncPlan` with no `engineVersion` THEN `previewReclaim` keeps a file that needs the proof; GIVEN `previewReclaim(root, plan, T1)` over a plan `planSync` built THEN it equals the dry run's report (`syncEngine.test.ts:1357`). **F3, the tests the change turns red:** `test/merge/coverageGaps.test.ts`, `test/merge/writeRace.test.ts` and `test/merge/reclaim.property.test.ts` hand their sweeps `renderings` holding the bytes each case deletes, with assertions unchanged, each under a dated `TEST CHANGE, justified` note. In `test/cli/commands/check.test.ts`, each made-up retired agent becomes a real rendering (its fixture corpus or selection renders the bytes at that path), or, where the case's subject is a retired artifact, is re-expected as kept and named, under that note. In `test/cli/commands/syncEngine.test.ts`, four cases break: "reports an orphaned row on dryRun …" (`:679-740`), "classifies rows of a hand-removed tool as adapter-removed …" (`:742-774`), the 1.10.0 `.cursor/skills` case (`:779-817`) and "previews the reclaim a dry run would take …" (`:1338-1360`). Each is handed a rendering the way production reaches one (the fixture corpus seeds the artifact so the running engine renders the file's bytes at that path for a client the ledger holds) with its assertions unchanged. A case whose subject is an artifact no running engine renders is re-expected as kept and named, under a dated note citing the maintainer's answer (Decisions). The 1.10.0 `.cursor/skills` control is re-expected that way: the file and its row stay, the sweep names it `skipped-user-content`, and `.agents/skills/st-work/SKILL.md` and `.cursor/notes.md` read as before (REQ-FLOW-026 delta). Controls: GIVEN a client deselected after `init` THEN its unedited content files are still deleted (`test/cli/ledgerForgery.test.ts`); GIVEN an engine skill the owner edited THEN it is kept, as today; GIVEN the engine's unedited skill THEN `clean -y` deletes it with `proof: "hash"`. GIVEN coverage THEN `ownedPaths.ts` and `reclaim.ts` stay at 100% (the lane's full suite runs with `--coverage`) |
| `edgeCases` | A retired engine skill whose bytes no running-engine rendering produces is kept and named in the sync report (the maintainer's answer; Risks). A corpus or pack read that fails, or a planner that throws → no rendering → kept, never deleted. A client deselected after setup whose ledger rows a lost manifest took with it is not rendered → its files are kept (the residual REQ-PLUGIN-045 already records for a lost ledger). `clean --pack`'s projected copies are d1a2's. Between d1a and d1a2, `test/pack/upgradeRemedy.test.ts` is red (the lane note above): d1a's report names the red cases and does not edit them. `engineRenderingsFor` gets the planner by injection: run `test/architecture` (learning `a-new-import-runs-the-architecture-test`). `check`'s timing is read before and after on this repository and recorded in d1a's report (Risks) |
| `depends_on` | none |
| `verify` | `npx vitest run test/manifest test/merge test/cli/ledgerForgery.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/clean.test.ts test/cli/commands/check.test.ts test/cli/flows.e2e.test.ts test/emit/syncDriftProof.e2e.test.ts test/architecture` |

#### d1a2-clean-pack-copies (d1a's blocked return, F2) — `clean --pack` removes the pack's projected copies while the pack is still installed

| Field | Content |
|---|---|
| `id` | d1a2-clean-pack-copies |
| `requirements` | REQ-PLUGIN-046 |
| `files` | `src/cli/commands/clean.ts` (`runScopedClean` `:482-627`), `test/cli/commands/clean.test.ts`, `test/pack/upgradeRemedy.test.ts` (one case, below), `CHANGELOG.md` (`[Unreleased]`, `### Changed`) |
| `interfaces` | At HEAD `clean --pack <id>` sweeps only the pack's own rows, the files under `.stamity/packs/<id>/` (`planPackRemoval`, `clean.ts:490`). Its next step tells the reader to reclaim the projected copies with `sync` (`:609`). Installed packs are read from the ledger's `pack:<id>` rows (`src/pack/projection.ts:39-46`). So while the pack is still installed, `runScopedClean` plans the emission twice through d1a's injected planner call: once over the manifest as it is, and once over a copy with this pack's `pack:<id>` rows removed. Both plans cover the clients the setup wrote for (F1), in repository mode. The pack's projected copies are the ledger rows owned by a client whose path the first plan renders and the second does not. They join the sweep's candidates beside the pack's own rows, with the reason the sweep already gives an artifact no plan produces (confirm the enum at build), and with `renderings` holding the first plan's hashes at those paths. A path both plans render is not a copy, even when its bytes differ between them (a shared policy document, a spawn guard's roster): the next `sync` rewrites it. A copy is deleted only when its bytes hash into the first plan's rendering at its path, and an edited copy is kept and named. The rows of the swept copies leave with the pack's rows, and a kept copy's row leaves too, its file named as the owner's in the salvage line (`:604-608`). The dry run lists each copy as `dry-run` and counts it in the sentence it prints (`:578-583`). The next-step line (`:609`) reads `regenerate the clients' files without the pack: <pinned sync call>`. The remedy text `check` and `sync` print (`clean --pack`, `sync`, `add`, `sync`) does not change. **Routing.** Before any edit, `rg -n "clean --pack" docs src` lists every page and message that says what `clean --pack` leaves. A hit in a file this unit lists is edited here. A hit in lane B's hand pages (`docs/plugins.md`, `docs/troubleshooting.md`, `docs/migration.md`) is never edited: d1a2 returns `BLOCKED_DEPENDENCY` naming the file and line, and the orchestrator routes it to that file's owner, or to i1 once lane B has merged. A hit under `content/` is model-facing text, out of scope (plan 019 files 2 and 3): it is named in d1a2's report as a leftover. A hit in a file no lane owns joins d1a2's files and is named in its report. **CHANGELOG** (`[Unreleased]`, `### Changed`): "`clean --pack <id>` also removes the copies `sync` projected from that pack into each client's folders, while the pack is still installed. A copy you edited is kept and named." |
| `testCriteria` | Red first, failing after d1a (the lane note): GIVEN `test/pack/upgradeRemedy.test.ts`'s cases "sync refuses the installed clash, and the printed steps, run in order, each exit 0 and leave check green" (`:314-365`) and "add over the installed 1.11.0 ops is refused on its client copies, and the installed-state remedy runs to exit 0" (`:401-424`) THEN both pass unedited. GIVEN that file's case "add straight after clean --pack is refused on the copies …" (`:367-399`) THEN it is re-expected under a dated `TEST CHANGE, justified` note: `clean --pack ops` now removes the copies, so `add ops -y` right after it no longer collides on them. Its new assertions: the copies `.claude/agents/stamity-devops.md` and the projected skills are gone, their rows are gone, and the printed remedy, run in order, still reaches a `check` that exits 0. GIVEN `test/pack/installSmoke.e2e.test.ts` THEN green, unedited. New cases in `test/cli/commands/clean.test.ts`: GIVEN `init -y --tools claude`, `add ops -y` and `sync` WHEN `clean --pack ops -y` runs THEN every `.claude/` copy projected from `ops` is deleted with `proof: "hash"`, its row is gone, and no row of the corpus's own content moved. GIVEN the same with one copy edited THEN that copy stays, is named, and its row is gone. GIVEN an owner's own file at a projected path with a forged `claude` row hashing it THEN it stays (no rendering is its bytes). GIVEN `clean --pack ops --dry-run` THEN each copy is listed as `dry-run` and nothing is written. GIVEN two installed packs THEN `clean --pack` of one leaves the other's copies and rows untouched |
| `edgeCases` | A plan that cannot be built with the pack installed yields no rendering, so every copy is kept and named. The 1.11.0 `ops` pack the remedy test installs clashes, and `sync` refuses that clash. If the refusal is raised inside the planner call the first plan makes, that plan cannot be built. In that case d1a2 does not fall back to the recorded hash: it returns `BLOCKED_AMBIGUITY` naming where the refusal is raised, since the remedy's first step then cannot prove the copies. A copy co-owned with another client's rendering (a shared `.agents/skills/` folder) is rendered by both plans when another source supplies it, so it stays. A pack whose content no client projects (MCP servers only) has no copies; the MCP lane is unchanged (`removePackMcpEntries`, `:533`) |
| `depends_on` | d1a-rendering-proof-core (one writer of `clean.ts`; it consumes the injected planner call and `renderings`) |
| `verify` | `npx vitest run test/cli/commands/clean.test.ts test/pack/upgradeRemedy.test.ts test/pack/installSmoke.e2e.test.ts test/cli/ledgerForgery.test.ts test/architecture` |

#### d1b-cursor-guard-pins (inbox row 585) — the 1.11.0 guards are recognised by a re-render of the 1.11.0 builder for this setup, and an owner's file at those names is kept

| Field | Content |
|---|---|
| `id` | d1b-cursor-guard-pins |
| `requirements` | REQ-PLUGIN-045, REQ-PLUGIN-046, REQ-FLOW-038 |
| `files` | `src/adapters/cursorLegacyGuards.ts` (new), `src/cli/engine/emissionWrite.ts` (`engineRenderingsFor`, and the Cursor hooks lane's guard recognition, `cursorGuardPathsFor` `:433-436`), `src/cli/commands/sync/engine.ts` and `src/cli/commands/clean.ts` (each passes the identity below, one line beside its injected planner call), `src/manifest/ownedPaths.ts`, `test/adapters/fixtures/cursor-guards-1.11.0/mcp-guard.mjs.txt`, `subagent-guard.mjs.txt` and `subagent-guard-ops.mjs.txt` (new), `test/adapters/cursorLegacyGuards.test.ts` (new), `test/merge/hookFilesOwnership.test.ts`, `test/manifest/ownedPaths.test.ts` |
| `interfaces` | **Why a re-render, not a fixed pin (review W-9, the maintainer's answer).** The 1.11.0 guard bytes depend on the setup. The spawn guard embeds `ROSTER`: `RUNTIME_AGENT_IDS` (ten ids at `v1.11.0:src/roster/agentPolicies.ts`) plus the runtime id of every agent admitted for Cursor, pack and override agents included (`v1.11.0:src/adapters/cursor.ts:432`, `:442-445`, `:486`; de-duplicated and sorted, `:974`). Both guards embed `SYNC_CALL = cliCallHint(cli.packageName, cli.version, "sync", cli)` (`:992`; `cliCallHint` and `pinnedCliPrefix` at `v1.11.0:src/shared/cliCall.ts`, which render `npx --no` in place of `npx -y` when `npmChannel` is `false`). The package name in that hint arrived with `e939b28f`, whose message says a renamed fork renders its own package. **The frozen copy.** `cursorLegacyGuards.ts` is a byte-faithful port of `buildSubagentGuardScript` and `buildMcpGuardScript` as `v1.11.0:src/adapters/cursor.ts` has them, with every helper and literal they read: `guardHeader`, the lint directive's 1.11.0 value, `REASON_HELPER`, `READ_PAYLOAD`, `NOTICE_HELPER`, `DENY_HELPER`, `ALLOW_HELPER`, the content prefix, and 1.11.0's `cliCallHint`, `pinnedCliPrefix` and the ten-id list. All are copied as literals, so a later change to the live builders cannot move them. Its only imports are types and `node:crypto` (run `test/architecture`). It exports `CURSOR_1_11_0_VERSION = "1.11.0"` and `render1110CursorGuards(input: {agentIds: readonly string[], packageName: string, npmChannel?: boolean}): ReadonlyMap<string, string>` (each of `LEGACY_CURSOR_GUARD_PATHS` → its bytes). It also exports `CURSOR_1_11_0_GUARD_ENTRIES: ReadonlyMap<string, {event: string, entry: unknown}>`, the exact `.cursor/hooks.json` entry 1.11.0 rendered for each name. That entry does not depend on the setup in repository mode (`buildHooksJson`, `v1.11.0:src/adapters/cursor.ts:811-816`): `subagentStart` → `{"command": "node .cursor/hooks/subagent-guard.mjs", "failClosed": true}` and `beforeMCPExecution` → `{"command": "node .cursor/hooks/mcp-guard.mjs", "failClosed": true}`. Confirm both against `git show v1.11.0:test/emit/__snapshots__/crossClientGoldens.test.ts.snap` before writing. **The setup's inputs.** `agentIds` are 1.11.0's ten ids plus the basename, without `.md`, of every ledger row whose `adapter` is `cursor`, whose `artifactType` is `agent` and whose path is under `.cursor/agents/`. Those are the agents 1.11.0 actually emitted for this setup, packs and overrides included (each admitted agent got one such row, `:446-462`). The current corpus and packs are not used, because they can differ from 1.11.0's. `packageName` and `npmChannel` are the running installation's (`packageName()`, `hasNpmChannel()`, `src/cli/kit/packageName.ts`): a fork's setup is upgraded by that fork's own engine. The caller passes them, since `emissionWrite.ts` may not import `packageName.ts` (F4). So `engineRenderingsFor` gains an optional fifth argument, `legacyCursor?: {packageName: string; npmChannel: boolean}`; absent, it renders no 1.11.0 guard and both old guards are kept. The version is fixed at `1.11.0`, the release the maintainer's answer names. **Capture.** The fixtures come from the published 1.11.0 package, not from the current source. In a scratch git repository: `npx -y @zomarit/stamity@1.11.0 init -y --tools cursor`, then copy each guard to `mcp-guard.mjs.txt` and `subagent-guard.mjs.txt`. Then `npx -y @zomarit/stamity@1.11.0 add ops -y` and `npx -y @zomarit/stamity@1.11.0 sync`, and copy the spawn guard to `subagent-guard-ops.mjs.txt`. Record in the test's header the commands, the date, `npm view @zomarit/stamity@1.11.0 dist.integrity`, and the Cursor agent rows that second ledger held. **The proof.** `needsRenderingProof` widens to the two `LEGACY_CURSOR_GUARD_PATHS` (`OWNED_PATHS.exact`, `ownedPaths.ts:86-87`). There, `engineRenderingsFor` returns the sha256 of `render1110CursorGuards` for this setup, never the current guard's rendering. The Cursor hooks lane recognises an entry running a 1.11.0 guard name as the engine's only when three things hold: the ledger records that path (as today, `:433-436`), the entry deep-equals that name's `CURSOR_1_11_0_GUARD_ENTRIES` pin, and the file it runs is absent or hashes to the setup's re-render. Otherwise the entry and its script stay the owner's and are named. Every other copy the running engine does not render stays the owner's |
| `testCriteria` | Red first, each failing at HEAD. **The copy is faithful (hermetic, `test/adapters/cursorLegacyGuards.test.ts`):** GIVEN `render1110CursorGuards` with the ten 1.11.0 ids, `@zomarit/stamity` and no channel THEN each guard equals its fixture byte for byte (a core setup). GIVEN the ten ids plus the agent ids the `ops` capture's ledger recorded THEN the spawn guard equals `subagent-guard-ops.mjs.txt`, and the MCP guard still equals `mcp-guard.mjs.txt` (it embeds no roster) (a pack setup). GIVEN the ten ids, `@acme/stamity` and `npmChannel: false` THEN each guard equals its core fixture with every embedded hint's call `npx -y @zomarit/stamity@1.11.0 sync` spelled `npx --no @acme/stamity@1.11.0 sync`, and differs from the core fixture nowhere else (a fork's package name). **The sweep:** GIVEN a 1.11.0 core setup (the core fixtures at the two old names, the pinned entries, the ledger rows 1.11.0 wrote) WHEN the first `sync -y` runs THEN both old guards are deleted and both entries rewired to the `stamity-` names. The existing 1.11.0 cases in `test/merge/hookFilesOwnership.test.ts` stay green, re-seeded with the fixture bytes where they seeded the current guard's bytes, under a dated `TEST CHANGE, justified` note. GIVEN a 1.11.0 setup with `ops`'s Cursor agent rows in its ledger and `subagent-guard-ops.mjs.txt` at the old name THEN both old guards are deleted. GIVEN a fork setup carrying the fork-rendered bytes, with `engineRenderingsFor` handed `{packageName: "@acme/stamity", npmChannel: false}` THEN both old guards are deleted; handed the canonical identity instead THEN both are kept and named. **The owner:** GIVEN an owner's `.cursor/hooks/mcp-guard.mjs` whose bytes are not the setup's re-render, and a `.cursor/hooks.json` entry running it that deep-equals the 1.11.0 entry pin, with a forged legacy ledger row and a forged `coOwned` hash, WHEN `sync -y` runs THEN both stay byte for byte and no `.bak` was needed (row 585). GIVEN the core setup with one byte of `mcp-guard.mjs` changed THEN that guard and its entry stay and the report names them, while the other guard still moves. GIVEN the pack setup whose ledger lost one `ops` agent row THEN the spawn guard is kept and named (its roster no longer re-renders). **Armed:** GIVEN `STAMITY_V1_11_0_BIN` naming a 1.11.0 CLI THEN `init -y --tools cursor` in a scratch repository writes bytes equal to the copy's core rendering and entries equal to each entry pin. This case is armed in the pattern of `test/ci/pluginLifecycle.test.ts`'s `armed(...)` walks and skipped otherwise, with the reason in the describe title; the implementer runs it once and captures its output in the report. GIVEN `needsRenderingProof` THEN true for both 1.11.0 names and false for the `stamity-` names. GIVEN coverage THEN `ownedPaths.ts` stays at 100% |
| `edgeCases` | A 1.11.0 setup whose owner deleted an old guard → its entry is pinned and its script absent → the entry is rewired and nothing is deleted. A guard an earlier release wrote (1.10.x or older, before the pinned hint) → its bytes are not the 1.11.0 re-render → kept and named. A 1.11.0 Cursor setup that was plugin-backed for hooks never had the guards in the repository (`withoutPluginOwnedRows`, `v1.11.0:src/adapters/cursor.ts:514`) → nothing to recognise. A fork that changed its package name or npm channel since 1.11.0 → its guards no longer re-render → kept and named. A registry fork: 1.11.0's hint carried no registry word, so the copy carries none. A forged Cursor agent row only widens the roster the copy renders, so the only file it can prove is one whose bytes are exactly a 1.11.0 guard for that roster. An old guard that is a link or a hard link → the existing unsafe-path skip. The frozen copy never grows with a later release: a later renamed artifact brings its own recognition only on the maintainer's word. The fixtures are data with a `.txt` suffix, so no linter, type check or dead-code check reads them |
| `depends_on` | d1a2-clean-pack-copies (lane order; one writer of `ownedPaths.ts`, `emissionWrite.ts`, `sync/engine.ts` and `clean.ts`) |
| `verify` | `npx vitest run test/adapters/cursorLegacyGuards.test.ts test/manifest test/merge test/cli/commands/syncEngine.test.ts test/cli/commands/clean.test.ts test/emit/crossClientGoldens.test.ts test/architecture` |

#### d1c-charter-and-exact-paths (inbox rows 586 and 519) — an owner's charter-shaped file, override, Copilot workflow and Copilot hooks file are kept

| Field | Content |
|---|---|
| `id` | d1c-charter-and-exact-paths |
| `requirements` | REQ-PLUGIN-045, REQ-PLUGIN-046 |
| `files` | `src/manifest/ownedPaths.ts`, `src/merge/reclaim.ts`, `src/cli/engine/emissionWrite.ts`, `test/manifest/ownedPaths.test.ts`, `test/merge/reclaim.test.ts`, `test/cli/ledgerForgery.test.ts`, `SECURITY.md` (the "Any repository writer" row's residuals), `CHANGELOG.md` (`[Unreleased]`, `### Security`) |
| `interfaces` | `needsRenderingProof` widens to every path `needsByteProof` names (`:287-290`: an `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md`, `.github/workflows/copilot-setup-steps.yml`) and to `.github/hooks/stamity.json`. At those paths the structural fingerprint (`isEngineCharterDocument`, `bytesShowEngineOutput`) stays the overwrite lane's proof and no longer proves a delete. `engineRenderingsFor` covers them: for a charter in a nested folder, the charter the running engine renders for a package at that folder. `SECURITY.md`'s residuals (1) and (2) become fixed text; residual (3) (`.codex/config.toml` tables, a refresh rather than a delete) stays named. One `CHANGELOG.md` `### Security` entry covers d1a–d1c: "A forged ledger row or hash no longer deletes your file: at an engine-named content file, a charter or instruction file, the Copilot workflow and hooks file, and Cursor's 1.11.0 guard names, a delete needs bytes the engine renders (or, at those two names, the bytes 1.11.0 rendered for that setup). A copy no rendering proves is kept and named." |
| `testCriteria` | Red first, each failing at HEAD: GIVEN an owner `AGENTS.md` copying `# Charter` and the four headings, a nested owner `AGENTS.md` opening `# Conditional rules (Codex down-conversion)`, an owner `AGENTS.override.md` with that heading on a line, and an owner Copilot workflow carrying the engine's header line, each with a forged hashing row, WHEN the sweep would delete each THEN each stays (row 586, residual (2)). GIVEN an owner `.github/hooks/stamity.json` with a forged row THEN it stays (row 519). Controls: GIVEN the engine's unedited nested charter whose package left THEN it is still deleted (REQ-PLUGIN-046's criterion); GIVEN a client deselected after `init` THEN its unedited Copilot workflow and hooks file are still deleted; GIVEN the engine's own charter drifted by an engine upgrade THEN the overwrite lane still rewrites it with no `.bak` (the existing fingerprint cases stay green). GIVEN coverage THEN `ownedPaths.ts` and `reclaim.ts` stay at 100% |
| `edgeCases` | A charter an earlier release rendered (an older invariants version) that the running engine no longer renders at that path → kept and named, removed by hand (the maintainer's answer; Risks). An instruction file the engine manages by a managed block → the block still proves it, unchanged |
| `depends_on` | d1b-cursor-guard-pins (one writer of `ownedPaths.ts` and `emissionWrite.ts`) |
| `verify` | `npx vitest run test/manifest test/merge test/cli/ledgerForgery.test.ts test/cli/commands/syncEngine.test.ts test/cli/commands/clean.test.ts test/cli/commands/check.test.ts test/emit/syncDriftProof.e2e.test.ts test/architecture` |

#### d2-forced-preview (inbox row 588) — `sync --dry-run --force` previews the forced write

| Field | Content |
|---|---|
| `id` | d2-forced-preview |
| `requirements` | REQ-FLOW-037, REQ-FLOW-038 |
| `files` | `src/cli/commands/sync/engine.ts`, `test/cli/commands/syncEngine.test.ts` (or the suite that holds the dry-run reclaim cases), `CHANGELOG.md` (`[Unreleased]`, `### Fixed`) |
| `interfaces` | After d1a, `previewReclaim(rootDir, plan, now?, engineVersion = plan.engineVersion)` (F4). d2 adds a fifth parameter: `previewReclaim(rootDir, plan, now?, engineVersion = plan.engineVersion, opts: {force?: boolean} = {})`. It passes `force` to `hookDocumentsAfterWrite` (`:699-724` at HEAD; re-read at the lane head), which then also reads as written each hooks-document output whose plan entry is a `collision` that `--force` clears: `collisionKind` absent or `"unmanaged-name"` (the one class `COLLISION_REMEDY` says force clears, `:773-794`). `applySync`'s dry-run branch (`:928-945`) passes `(rootDir, plan, now, engineVersion, {force})`. `check`'s drift gate keeps calling it without `force`, and the existing three-argument call in `syncEngine.test.ts` (`:1357`) still type-checks |
| `testCriteria` | Red first: GIVEN a Copilot setup whose `.github/hooks/stamity.json` collides as `unmanaged-name` and a guard script the forced write stops naming WHEN `sync --dry-run --force --json` runs THEN the preview names that script with the delete the forced run makes, not `Kept`; WHEN `sync -y --force` runs THEN it deletes exactly what the preview named. GIVEN the same without `--force` THEN the preview still reads the document from disk. GIVEN a `co-owned-shape` or `deny-scan` collision under `--force` THEN the preview still reads it from disk |
| `edgeCases` | A forced write that a hard link refuses at write time (`shared-name`) previews from disk, as the write leaves it untouched |
| `depends_on` | d1c-charter-and-exact-paths (lane order; d1a and d1b are the other writers of `sync/engine.ts`, d1a of `syncEngine.test.ts`) |
| `verify` | `npx vitest run test/cli/commands/syncEngine.test.ts test/merge/hookFilesOwnership.test.ts test/emit/syncDriftProof.e2e.test.ts` |

### Lane E — plan folds (t10 part 1)

#### e1-plan-folds — 53 inbox rows folded into the live units that will build them, and every line-number citation re-pointed

| Field | Content |
|---|---|
| `id` | e1-plan-folds |
| `requirements` | REQ-FLOW-024 (the retire path these keys feed) |
| `files` | `docs/plans/016-fork-distribution-01.md`, `-02.md`, `-03.md`; `docs/plans/019-lean-flows-02.md`, `-03.md`; `docs/plans/015-board-writes.md`; `docs/plans/017-docs-overhaul-03.md`; `docs/plans/014-lean-repository-01.md`, `-02.md`; `src/runs/resumeCard.ts` (one comment, `:362`) |
| `interfaces` | **Fold line.** Each unit the table below names gains, as the last line of its section (after its table, never inside a cell), one line: `- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): \`<key>\` — <what the unit now also does>.` `<key>` is the ledger id for a ledger-ref row, and for any other row the quoted lead phrase followed by ` at 077e8a78` (S13's form; the sha is the inbox state the decisions file's `line` field indexes, Decisions). A unit two rows fold into gains two lines. **Where a line goes when the target is not a unit.** Plan 015's four targets (lines 434, 435, 436, 481) name a requirement or a step, not a unit: each fold line goes as the last line of the section that holds the named requirement or step (REQ-BOARD-004's section, the pickup steps' section for step 5, the setup steps' section for step 2, the session's execution order for step 2). The three intake rows with no unit (lines 455, 456, 522) take no fold line: each becomes one row of `016-01`'s "Inbox rows this file folds in" table (`016-01:2172-2184`), its unit cell reading `intake — no unit yet (Package 20 file 1)` for 455 and 456 and `intake — beside u1-clean-keeps-state (:584)` for 522. **S13 re-pointing.** Every inbox citation by line number in plan 016 becomes the stable key: the `(line N)` prefixes in the fold tables (`016-01:2178-2184`, `016-02:2439-2450`, `016-03:1470-1475`) and any `inbox row N` or `inbox.md:N` in a cell. The orchestrator (or a test-runner) runs `grep -nE "inbox row [0-9]+\|inbox\.md:[0-9]+\|\(line [0-9]+\)" docs/plans/016-fork-distribution-0[123].md src/runs/resumeCard.ts` and hands the hit list in the dispatch; the decisions file maps each `line` to its `ref` (ledger id) and `text` (lead phrase). **Stale pointers.** `resumeCard.ts:362` "(inbox row 229)" → "(ledger row 2026-09-23_orchestrator-context/build/180)" (if the spec-author's write grant refuses a `src/` file, e1 says so in its return, and i3's implementer makes this one-comment edit, listed in i3's files and checked in i3's verify). `016-03:1469` and `:1475` (row 330, the `--registry` scope mapping) gain "settled by eca323e8: the pinned calls name the registry". `016-02:2432` (row 187, `DISTRIBUTION.note`) gains "settled by 871ee7bd". `u3-release-1-12-0` (`016-03:1206`) keeps its id and gains `amended 2026-10-08: 1.12.0 shipped from plan 016 file 0 (v1.12.0 at 8236fa2c); this unit's cut is the next release, 1.14.0 (1.13.0 is skipped)` |
| `testCriteria` | GIVEN the grep above over plan 016 THEN no hit. GIVEN each of the 50 rows with a unit or a plan 015 section THEN exactly one fold line (`- Inbox fold (2026-10-08, …)`) carries its key; a fold-table row re-pointed to the same key does not count as a second (the test-runner greps each key). GIVEN each of the three intake rows (455, 456, 522) THEN exactly one fold-table row in `016-01` carries its key and its unit cell starts `intake —`. GIVEN e1 made the `resumeCard.ts` edit THEN `grep -n "inbox row 229" src/runs/resumeCard.ts` finds nothing; otherwise that check is i3's. GIVEN `npx vitest run test/records test/authoring/specPlanCoverage.test.ts` (run by a test-runner) THEN green |
| `edgeCases` | A target unit that already names the row (a fold table row) → the fold line is still added and the table row is re-pointed, so the key resolves in the unit. A plan stamped before this edit (014, 015, 017) gains no stamp change: the fold line is a plan-cell amendment, not a re-plan |
| `depends_on` | none |
| `verify` | test-runner: `grep -nE "inbox row [0-9]+\|inbox\.md:[0-9]+\|\(line [0-9]+\)" docs/plans/016-fork-distribution-0[123].md; test $? -eq 1 && npx vitest run test/records test/authoring/specPlanCoverage.test.ts`, plus, only when e1 edited `resumeCard.ts`, `grep -n "inbox row 229" src/runs/resumeCard.ts; test $? -eq 1` |

**The 53 rows.** "Line" is the row's line in `.stamity/inbox.md` at `077e8a78`, the `line` field of
`.stamity/runs/2026-10-08_inbox-pass/reports/t10-decisions.jsonl`.

| Line | Key | Plan | Unit | The unit now also does |
|---|---|---|---|---|
| 56 | `2026-09-17_plugin-lifecycle/build/28` | 016-02 | `u2-plugin-overrides` (`:1994`) | emits a skill's binary companion as bytes (a Buffer-carrying output row), with line 111 |
| 61 | `2026-09-17_plugin-lifecycle/prove/49` | 016-02 | `u2-review-gate-all` (`:1955`) | resolves the gate's state from the repository root in plugin layout, never a subfolder cwd |
| 83 | `2026-09-17_plugin-lifecycle/prove/107` | 016-01 | `u1-fork-release-hardening` (`:1876`) | the branch guard also requires the remote head's committer `github-actions[bot]` and a subject opening `plugins: v` |
| 111 | `2026-09-17_plugin-lifecycle/build/76` | 016-02 | `u2-plugin-overrides` | the downstream fixture's `data.bin` reaches every root byte-identical, with line 56 |
| 152 | `2026-09-17_plugin-lifecycle/prove/271` | 016-02 | `u2-shrinkwrap` (`:2181`) | `npm pack` excludes `dist/plugins` and `dist/plugin-runtime` |
| 199 | "no golden case for a verdict role's digest when a report path is named" | 019-02 | `p6-eval-cases-core` (`:244`) | one more case: the verdict digest with a report path named |
| 200 | "no golden case for the capacity rung" | 019-02 | `p6-eval-cases-core` | one more case: the capacity rung |
| 201 | "no golden case for a fixer handed a decision_needed id without sign-off" | 019-02 | `p6-eval-cases-core` | cases for the five uncovered behaviours the row names |
| 213 | `2026-09-23_orchestrator-context/build/368` | 014-01 | `f2-lane-release-tags-only` (`:251`) | finds why an unrelated fork's history once read `update-available`, with a deterministic test |
| 222 | `2026-09-23_orchestrator-context/build/49` | 019-02 | `p6-eval-cases-core` | checks a probe case's `source:` range when it quotes no block, with line 237 |
| 237 | `2026-09-23_orchestrator-context/build/350` | 019-02 | `p6-eval-cases-core` | a range-exists-and-matches-heading guard in `test/evals/locators.test.ts`, with line 222 |
| 273 | `2026-09-24_enterprise-release/review/65` | 016-02 | `u2-review-gate-all` | the script-budget test renders the review gate through the adapter's one render call |
| 327 | `2026-09-30_optimization-sweep/build/132` | 016-01 | `u1-copilot-setup-steps` (`:1602`) | emits a pinned `oven-sh/setup-bun` step for a bun repository |
| 328 | `2026-09-30_optimization-sweep/review/170` | 016-02 | `u2-upgrade-verb` (`:1583`) | keys the update-check stamp by package name |
| 349 | "Dependabot and Renovate do not watch the `records` branch" | 014-02 | `r4-records-script` (`:553`) | a Dependabot `github-actions` entry with `target-branch: records` |
| 374 | "the release-manifest case pins `plugin-dist` and `plugins/v<version>`" | 016-01 | `u1-fork-neutral-tests` (`:1357`) | derives both from the resolved identity |
| 375 | "the Renovate presets assume the default `plugins/v<version>` tag pattern" | 016-01 | `u1-renovate-suffix` (`:1402`) | retargets `matchStrings` and the versioning prefix from the resolved pattern |
| 392 | "the charter-reference phrases say \"in AGENTS.md\"" | 016-02 | `u2-apm-placeholders` (`:1642`) | a route-neutral charter-reference phrase |
| 393 | "the Touchpoints paragraph promises the nine as skills" | 016-02 | `u2-apm-charter` (`:1729`) | words the Touchpoints paragraph per route |
| 395 | "no standing post-publication smoke of `zomarit/stamity/apm#plugins/v<ver>`" | 016-02 | `u2-apm-coexistence-fork` (`:2084`) | a canonical post-publish smoke of the published APM ref |
| 399 | "The preset's file patterns also match the default branch's catalogs" | 016-02 | `u2-main-catalogs` (`:1604`) | narrows the preset's file patterns |
| 400 | "In Claude's auto permission mode `last_assistant_message` is not the delivered subagent report" | 016-02 | `u2-review-gate-all` | reads the auto-mode payload; its fixture records it |
| 407 | "the manual-push line commits `plugins: v${version}` without \"from <source commit>\"" | 016-03 | `u3-reset-guide` (`:859`) | aligns the manual-push subject with `release.yml:970` |
| 426 | `2026-10-01_pr73-review-round-1/prove/1` | 019-02 | `p8-capture-by-consequence` (`:231`) | `stamity-spec-author.md` spells the findings fence's grammar, with line 497 |
| 434 | "REQ-BOARD-003 lets `--move` reopen an item while REQ-BOARD-004 refuses any edit to a completed item" | 015 | REQ-BOARD-004 (Package 19 intake) | one carve-out sentence for a reopen |
| 435 | "on a public repository, pickup passes a low-permission author's acceptance criteria to `/st-work`" | 015 | pickup step 5, under REQ-BOARD-005 | criterion ticks never come from low-permission text |
| 436 | "the new write-access check is specified only through `gh api`" | 015 | setup step 2 | names the MCP route or the `gh` need |
| 439 | "an unreadable `apm.lock.yaml` reads as an empty protected-path set" | 016-01 | `u1-foreign-paths` (`:1571`) | refuses `--force` while the lock is unreadable |
| 441 | "the close step closes lane issues by semver order" | 016-01 | `u1-lane-issues-freshness` (`:1785`) | an ancestry check before a "carried" close |
| 455 | "`stamity config` cannot return a key other than `gates.*` to its default" | 016-01 | intake — no unit yet (Package 20 file 1) | an unset path for every config key |
| 456 | "`hooks.userHooksDir` resolves to `none` in `config list`" | 016-01 | intake — no unit yet (Package 20 file 1) | one exported default for the user hooks folder |
| 469 | "c4 step 2 never reads `head_sha` when the run id comes from the printed URL" | 017-03 | `c4` (`:210-226`) | a `gh run view --json headSha,status` read before the S check, with 470, 471 |
| 470 | "c4 step 2 puts its list-again clause after \"cancel it … and stop\"" | 017-03 | `c4` | moves the clause ahead of the cancel |
| 471 | "c4 step 2 goes on with the run the maintainer names after the list again" | 017-03 | `c4` | the S check after every choice |
| 481 | `2026-10-03_pack-engine-defects/prove/2` | 015 | the session's execution order, step 2 (Package 19) | diagnose the Claude 2.1.291 walk; the probe half stays `u3-rollout-guides`' (`016-03:818`) |
| 497 | "the implementer's return contract names the `stamity-findings` fence but not its grammar" | 019-02 | `p8-capture-by-consequence` | `stamity-implementer.md` spells the grammar, with line 426 |
| 498 | "the marker check's pattern also matches QA-table text in two closed run records" | 014-02 | `r7-remove-records-from-main` (`:772`) | removes both hits, or else a `:!.stamity/runs` pathspec |
| 505 | "c4's \"poll until one appears\" has no timeout" | 017-03 | `c4` | a poll bound |
| 522 | "an override-added skill is emitted under its own unprefixed folder" | 016-01 | intake, beside `u1-clean-keeps-state` (`:584`) | prefixes user skills, or proves them another way |
| 523 | "the three MCP documents are still re-serialised in the engine's two-space style" | 016-01 | `u1-manifest-stable` (`:1644`) | reuses `jsonStyleOf` and `serialiseJson` |
| 553 | "plan 014's import recipe still pushes plain upstream `v*` tags" | 014-01 | `f1-import-recipe` (`:241`) | pushes `main` only |
| 562 | "the attestation subject lists omit the `plugins/*.sha256` assets" | 016-01 | `u1-fork-attestations` (`:1894`) | adds the subjects or narrows REQ-PLUGIN-049's claim |
| 563 | "the reset block's `gh workflow disable` fails under `set -e`" | 016-03 | `u3-reset-guide` | tolerates that one failure |
| 565 | "the Claude review gate keys its counter and its verdict by session" | 016-02 | `u2-review-gate-all` | a per-run, per-unit key |
| 572 | "`p2-test-inputs` adds `src/change/testInputs.ts` and `q1-inbox-scoped`" | 019-02, 019-03 | `p2-test-inputs` (`019-02:179`), `q1-inbox-scoped` (`019-03:173`) | the `PLAN_MAP` row and `test/architecture` in both cells |
| 573 | "`p0-make-room` compacts `/st-work`'s inbox-retirement text" | 019-02 | `p0-make-room` (`:153`) | keeps a compact retire protocol in `st-work.md` or adds `st-board.md` |
| 574 | "`p1-classify` puts a whole change in the `product` class when `--base` is missing" | 019-02 | `p1-classify` (`:166`) | classifies known paths by the built-in rules with no base |
| 575 | "REQ-FLOW-065 skips the security lens for a lockfile-only bump of a package that already has an install hook" | 019-02 | `p5-security-trigger` (`:218`) | keeps the lens for a `hasInstallScript` bump |
| 577 | "`p4-loop-rules`' \"fresh fixer at a higher effort\" has no mechanism" | 019-02 | `p4-loop-rules` (`:205`) | settles the mechanism against file 3's `q4` |
| 578 | "`q2-qa-rows`' blanket docs-class QA exemption drops the person row for a rendered site page" | 019-03 | `q2-qa-rows` (`:186`) | asks at file 3's start |
| 579 | "`q1-inbox-scoped`: a `/st-work` started from a bare intent queries the inbox at Frame" | 019-03 | `q1-inbox-scoped` | a second query after the in-flow plan names files |
| 592 | `2026-10-07_security-fixes/build/56` | 016-02 | `u2-json-contract` | names `drift.changes`' `unchanged` entry carrying `rejected` |
| 596 | "nothing proves PowerShell's `npx.ps1` passes `--@<scope>:registry=<url>` intact" | 016-01 | `u1-fork-ci-job` (`:1804`) | one `pwsh -c` argv check on the Windows leg |

### Integration (after every lane, in this order)

#### i1-repo-gate-coverage (was `t9`) — this repository's test gate is CI's coverage run

| Field | Content |
|---|---|
| `id` | i1-repo-gate-coverage |
| `requirements` | spec carries no ids |
| `files` | `.stamity/manifest.json` (through `stamity config set gates.test`), `AGENTS.md` and the emitted copies `sync` regenerates, `CHANGELOG.md` (b4's `### Security` line only, its text in the b4 cell), `test/docsPages.test.ts` (only if b4 returned the re-attestation date routing: `REATTESTATION_DATE` at `:623` moved to b4's re-read day, with a dated `TEST CHANGE, justified` paragraph in the constant's own history form) |
| `interfaces` | `node dist/cli.js config set gates.test "node scripts/ci/test-run.mjs --coverage"`, then `node dist/cli.js sync`. b4's CHANGELOG line under `[Unreleased]` → `### Security`, beside d1c's entry. Any other edit b4 or another lane returned as `BLOCKED_DEPENDENCY` and the orchestrator routed here lands in this unit, named in its report |
| `testCriteria` | GIVEN `AGENTS.md` THEN its Tests gate reads the coverage command and its Full gate chains it. GIVEN `node dist/cli.js check` THEN exit 0. GIVEN `CHANGELOG.md` THEN `[Unreleased]` carries b4's line once. GIVEN `npx vitest run test/records test/learnings test/qa test/docsPages.test.ts` THEN green |
| `edgeCases` | A fresh worktree has no `dist/` → the gate needs `npm run build` first (learning `a-fresh-worktree-lane-builds-before-its-full-suite`). The learning `the-local-test-gate-is-weaker-than-ci` meets its coverage half's retire condition; its Windows half stands, so it is not retired here and its stale coverage sentence is a leftover for the close's question |
| `depends_on` | a4-signing-inputs, b4-no-read-allow-rows, c5-price-rows, d2-forced-preview, e1-plan-folds (each lane's last unit) |
| `verify` | `npm run build && node dist/cli.js sync && node dist/cli.js check && npx vitest run test/records test/docsPages.test.ts` |

#### i2-spec-merge — one spec-author writes every delta into `docs/specs/`

| Field | Content |
|---|---|
| `id` | i2-spec-merge |
| `requirements` | REQ-PROVE-017, REQ-PROVE-020, REQ-PROVE-021, REQ-PROVE-030, REQ-PROVE-031, REQ-PROVE-032, REQ-PROVE-033, REQ-PROVE-034, REQ-PROVE-035, REQ-PROVE-036, REQ-APM-002, REQ-PLUGIN-016, REQ-PLUGIN-020, REQ-PLUGIN-045, REQ-PLUGIN-046, REQ-FLOW-025, REQ-FLOW-026, REQ-FLOW-036, REQ-FLOW-037, REQ-FLOW-038 |
| `files` | `docs/specs/prove-behavior-and-value.md`, `docs/specs/apm-canonical-distribution.md`, `docs/specs/plugin-lifecycle.md`, `docs/specs/everyday-flows.md` |
| `interfaces` | The text of "Spec deltas for the close merge" below, verbatim, each merged where its location says (a Concerns line or a bullet the delta quotes is replaced in place, the before text recorded in the merge's report), with a dated header-comment amendment per file ("amended in run 2026-10-08_maintainer-tooling on 2026-10-08") and its citations re-read at the integration head (every `path:line` the landed code moved is re-pointed before the write; a symbol name replaces a line where the file moves every release). New requirements land after the file's last requirement of their area. `status` lines do not move (no release) |
| `testCriteria` | GIVEN `node .claude/skills/st-verify/scripts/spec-plan-coverage.mjs .stamity/runs/2026-10-08_maintainer-tooling/plan.md docs/specs` THEN no dangling, duplicate or uncovered id. GIVEN `npx vitest run test/records test/authoring test/docsPages.test.ts` (a test-runner) THEN green |
| `edgeCases` | A delta whose code landed differently (a fixer moved a seam) → the spec-author reads the landed diff and writes what landed, recording the difference in an "As built" sentence |
| `depends_on` | i1-repo-gate-coverage |
| `verify` | test-runner: `npx vitest run test/records test/authoring test/docsPages.test.ts` |

#### i3-inbox-mechanics (was `t10` part 2) — every row leaves with its exit, and the pass is recorded

| Field | Content |
|---|---|
| `id` | i3-inbox-mechanics |
| `requirements` | REQ-FLOW-024 (the retire path); the completeness-pass exit of `/st-board`'s removal rule carries no requirement id |
| `files` | `.stamity/inbox.md`; the `retired` values of the ledgers the rows name (through the verb only); `.stamity/runs/2026-10-08_inbox-pass/record.md`, `inbox-retirements.md` (the shape of `.stamity/runs/2026-09-09_package-9/inbox-retirements.md`: Row · Ref · Exit · Reason), its `ledger.jsonl` (re-filed remainders only); `.stamity/learnings/vitest-update-flag-takes-an-optional-value.md` (through `learn capture`); `src/runs/resumeCard.ts` (only when e1 returned its one-comment edit as refused, e1 cell) |
| `interfaces` | Input: the decisions file, one row per inbox line, exit ∈ {`fixed`, `cut`, `scheduled`, `scheduled-fold`, `fix-in-session`, `stays`}. Order: (1) for each ledger-ref row except `stays`, `stamity ledger close --run <run> --id <phase>/<n> --retired "<disposition>"` where the disposition is `fixed in <sha>` (the settling sha), `cut: <reason>`, `scheduled to <unit> (<plan path>)`, or for `scheduled-fold` the unit e1 named. For a `fix-in-session` row the settling sha is the landed commit of the unit whose heading names that row (a4 for row 31, b1 for 212, b2 for 484 and 595, b3 for 315, b4 for 324, c2 for 337, 344 and 601, c3 for 274, 275 and 576, c4 for 597, d1a for 560, d1b for 585, d1c for 519 and 586, d2 for 588). Rows 389, 598 and 599, the three no unit builds, are plan- or record-ref rows with no ledger `retired` value (review M-9): they take no `ledger close` and leave under step (3). **Rows 274, 275 and 597 (public half here, private-driver half outside).** Each retires as `fixed in <sha>` only when the orchestrator states in i3's dispatch that the private eval driver's companion change (External dependency) was committed in this session, naming that commit. Otherwise each retires as `public half fixed in <sha>; private-driver remainder re-filed as <id>`, and its private-driver remainder is re-filed through the pass's own ledger (`stamity ledger append --stdin`, closed `deferred`, the inbox bullet appended with `Ref:`), its place reading "the private eval driver's companion change (plan `lean-flows-01-in-flow`, External dependency), before the next eval run"; (2) then remove its bullet; (3) plan-ref, record-ref and no-ref rows leave by `/st-board`'s removal rule with one `inbox-retirements.md` line each. Rows 389, 598 and 599 are among them, and each line names its settling commit. Row 389 → i3's own `learn capture` commit (step 6), so its bullet leaves and its line is written last. Row 598 → the commit the decisions file names for it, checked against the row's text before the removal (`077e8a78` and `156283d0` are Dependabot #86 and #91 on `main`). Row 599 → `a88c89c2`, the commit that archives runs 42 and 43 on this run's integration branch; `b2e0073a` was its sha before the rebase and is not in `main`'s history; (4) the 15 `stays` rows remain, each named with its place in `record.md` (lines 79, 147, 163, 167, 241, 285, 316, 318, 319, 480, 491, 494, 496, 506, 542, places as the decisions file gives them); (5) the remainders: row 519's residual (3) (`.codex/config.toml` tables, review/50) is re-filed through the pass's own ledger (`stamity ledger append --stdin`, closed `deferred`, appended with `Ref:`), since d1a–d1c do not fix it, and rows 274, 275 and 597's private-driver remainders unless the companion change landed (above); (6) one `learn capture` widening `vitest-update-flag-takes-an-optional-value` to `list --json` and `--outputFile` (row 389), its claim read off the installed vitest's option declarations before capture (the read-only method of that learning's own `validatedAgainst`), merged into the existing note rather than a second note (one topic per file) |
| `testCriteria` | GIVEN `npx vitest run test/records test/learnings` THEN green: every deferred ledger row has a dated `retired` value or an inbox `Ref:`, every `Ref:` resolves, every bullet parses. GIVEN the pass's `record.md` THEN every remaining inbox row is named with its place. GIVEN `inbox-retirements.md` THEN every removed row has a line: 401 lines (the 416 decided rows less the 15 that stay), and the inbox afterwards holds the 15 staying rows plus each re-filed remainder (one for row 519, and one each for rows 274, 275 and 597 unless the dispatch named the driver's commit). GIVEN rows 274, 275 and 597 THEN none reads `fixed in` alone while the dispatch named no driver commit. GIVEN rows 389, 598 and 599 THEN no `ledger close` ran for them, each bullet is gone, and each has exactly one `inbox-retirements.md` line naming the commit step (3) gives (row 599's reads `a88c89c2`). GIVEN e1 returned its `resumeCard.ts` edit THEN `grep -n "inbox row 229" src/runs/resumeCard.ts` finds nothing |
| `edgeCases` | One ledger id behind two inbox rows → both take the same disposition (a different second one is refused by `src/runs/ledgerStore.ts`). A row whose ledger row is already retired → its bullet leaves with a record line. A bullet removed before its ledger row is retired turns the records gate red → the driver retires first and a diff check confirms every retired id's bullet is gone. State files are scanned by the leak gate (learning `leak-gate-scans-stamity-state-files`): no reserved name in the record |
| `depends_on` | i2-spec-merge, e1-plan-folds |
| `verify` | `npx vitest run test/records test/learnings && npm run gate`, plus `grep -n "inbox row 229" src/runs/resumeCard.ts; test $? -eq 1` (holds whichever unit made the edit) |

## Contract census

Searched over history with read-only git (`git log -S<identifier> --name-only HEAD`), which lists every file whose count
of the identifier ever changed; each hit was read at HEAD. The owning unit re-runs the search over the tree (`rg -n` for
the identifier and its literal value) and captures the output in its report before it reports a closing state.

| Contract | Class | Owner | Consumers found | Closing state at the owner's close |
|---|---|---|---|---|
| `evals/run-of-record.json` (`path`, `release`, `exception`) | persisted-name | c2 | `src/cli/docs/measurements.ts` (its three exported constants and `renderMeasurements`); through those constants `test/cli/docs/measurements.test.ts`, `test/docsPages.test.ts` (`:1315-1329`, the hand pages README and doctrine), `scripts/generate-docs.mjs`, `scripts/merge-ready-rate.mjs`; c3's carry-forward rule (reads which run is of record); `test/evals/rubricCoreHash.test.ts` (not a consumer: it pins the newest committed run, renamed to say so); the private eval driver (optional reader, its companion change) | `reconciled(6)` in this PR; the driver named with its reason |
| `judgeBlocks` (the judge-input helper) | symbol | c4 | `scripts/eval/run.mjs` (calibration `:320-323`, scoring `:334-336`); `test/evals/manualRunner.test.ts` (`:87-90`, `:1168`, `:1364`, `:1384-1389`); `evals/README.md` (`:104-108`, `:459-460`); `.stamity/overrides/skills/st-eval-run/SKILL.md` if it states the blocks; the private eval driver's task builder | `reconciled(4)` · `1 unreconciled`: the private eval driver, owned by the External dependency; blocks the next eval run, not this PR |
| Comparator (`comparatorKey`, `COMPARATOR_FIELDS`; `sameConfiguration` gains `export`, no field added) | symbol | c3 | `scripts/eval/run.mjs` (`recordedKey`, `sameConfiguration`, `previousRun`); every committed `summary.json` `comparatorKey` and `inputs.json` `configuration` (unchanged: `harness` already carries the driver's client version, run 43's `inputs.json:12`); `test/evals/manualRunner.test.ts`; SET-v7 § 8's sentence; the private eval driver's configuration comparison | `reconciled(2)` (the export and its test) · `1 unreconciled`: the private eval driver (External dependency (2)) |
| `HARNESS` (`stamity-manual-responses-v1` → `-v2`) | constant | c4 | `scripts/eval/run.mjs` (`configuration.harness`, hence `configurationHash` and `comparatorKey`); `evals/README.md:471`; committed run `inputs.json` files (historical); REQ-PROVE-033's trigger list; the private eval driver's own baseline id (`stamity-claude-cli-v1` in run 43's `inputs.json:4`) | `reconciled(2)` · `1 unreconciled`: the driver's baseline id moves in its companion change |
| `ci.yml` `changes` outputs (`full`, `lanes`, `suites`, `site_build`, `cli_check`, `records_only`) and `prove-pr`'s `proven` | config-key | a2 (`changes`), a1 (`prove-pr`) | the `if:` of `check`, `apm-install`, `plugin-route` and the lane job; `all-ci-checks`; `test/ci/workflow.test.ts` (`:729-822`, `:899-985`); `scripts/ci/records-only.mjs` (`RECORDS_SUITES`); `test/ci/recordsOnly.test.ts`; REQ-PROVE-030/031, REQ-APM-002, REQ-PLUGIN-020 (i2). The required context `all-ci-checks` keeps its name; `records_only` stays one release for any reader. `prove-pr` reads the pull-request head's `all-ci-checks` check run as evidence only when its `app.slug` is `github-actions` (a1, Security notes) | `reconciled(6)`; a1 and a2 are serial in one lane |
| `runLeakGateOnce` and `GATE_RUN_TIMEOUT_MS` | symbol | c1 | `test/ci/leakGate.test.ts` (four callers), `test/docsPages.test.ts` (`:1016-1038`); a2's lane suite lists name the two files, not the helper | `reconciled(2)` |
| The rendering proof (`needsRenderingProof`, `provenByRendering`, `ReclaimOptions.renderings`; `engineRenderingsFor(rootDir, manifest, paths, planFor)` with the injected `EmissionPlanFor`, and d1b's optional fifth `legacyCursor`; `fullCorpusSelection`, moved from `sync/engine.ts:259-268` to `emissionWrite.ts` and exported; `SyncPlan.engineVersion?`; `previewReclaim`'s optional fourth `engineVersion`, and d2's fifth `opts`) | symbol | d1a (widened by d1a2, d1b and d1c; d2 adds `opts`) | `src/merge/reclaim.ts` (gate 4); `src/cli/commands/sync/engine.ts` (`planSync` sets `engineVersion` and reads `fullCorpusSelection`; `previewReclaim`; `applySync`'s dry-run and live sweeps; the injected planner call); `src/cli/commands/clean.ts` (both sweeps, its own injected planner call, and d1a2's two plans); `src/cli/engine/emissionWrite.ts` (the Cursor hooks lane's legacy-guard recognition, d1b); `check`'s drift preview through `previewReclaim`, which keeps its three-argument call and reads `plan.engineVersion`; `test/cli/commands/syncEngine.test.ts:1357` (a three-argument `previewReclaim` call) and its hand-built `SyncPlan` fixtures (no `engineVersion`, so they render nothing); the sweep tests in `test/merge/` and `test/cli/` the d1a cell lists; `test/architecture` (the layering that forces the injection); `SECURITY.md` (d1c); REQ-PLUGIN-045/046, REQ-FLOW-026 and REQ-FLOW-038 (i2) | `reconciled(9)`; d1a → d1a2 → d1b → d1c → d2 serial in one lane |
| The 1.11.0 Cursor guard re-render (`render1110CursorGuards`, `CURSOR_1_11_0_GUARD_ENTRIES`, `CURSOR_1_11_0_VERSION`, the frozen ten-id list) | symbol | d1b | `src/cli/engine/emissionWrite.ts` (`engineRenderingsFor` through its `legacyCursor` argument, and `cursorGuardPathsFor`); `src/cli/commands/sync/engine.ts` and `src/cli/commands/clean.ts` (each passes `{packageName: packageName(), npmChannel: hasNpmChannel()}`); `test/adapters/cursorLegacyGuards.test.ts` and its three fixtures; `test/merge/hookFilesOwnership.test.ts` (the 1.11.0 cases); every consumer repository set up by 1.11.0, core, with packs or from a fork, whose first `sync` the re-render recognises (REQ-FLOW-038) | `reconciled(5)` · the consumer repositories reconcile on their next `sync` |
| `clean --pack <id>`'s sweep (it now takes the pack's projected copies; its JSON `entries`, `removed`, `removedRows`; its next-step line) | config-key (a CLI contract) | d1a2 | `src/cli/commands/clean.ts` (`runScopedClean`); the remedy text `check` and `sync` print (`clean --pack`, `sync`, `add`, `sync`), unchanged; `test/pack/upgradeRemedy.test.ts` (one case re-expected, two unchanged); `test/pack/installSmoke.e2e.test.ts` (unchanged); `test/cli/commands/clean.test.ts`; every page or message the d1a2 routing search finds; `CHANGELOG.md`; REQ-PLUGIN-046 (i2) | `reconciled(N)` where N is the routing search's hit count; a hit in lane B's hand pages routed to its owner or to i1 |
| Emitted Claude permissions (`permissions.allow` rows; `ENGINE_PERMISSION_ROWS`) | persisted-name | b4 | `src/adapters/claude.ts` (`buildSettingsJson`, both its repository-mode return `:929` and its plugin-mode branch `:888-890`, the second reached by `stamity plugin setup` through the planner's `hooks: false` call `:591-593`); `src/manifest/claudeSettings.ts`; `.claude/settings.json` and `.stamity/manifest.json` (by `sync`); the test files the b4 cell names, `test/cli/commands/plugin.test.ts`'s plugin-setup cases and `test/ci/pluginLifecycle.test.ts:934-955` among them; the crossClientGoldens snapshot if it carries the rows; the hand pages `docs/plugins.md:154-157` and `:345-360`, `docs/troubleshooting.md:266-275`, `docs/migration.md:379-385`; REQ-FLOW-025, REQ-FLOW-036 and REQ-PLUGIN-016 (i2), with the spec sentences b4 makes false: `docs/specs/plugin-lifecycle.md:657` ("its `permissions` half always emitted") and `docs/specs/everyday-flows.md:1214` (the Concerns line on REQ-FLOW-025) (review W-8); `test/cli/ledgerForgery.test.ts`'s owner fixtures (lane D's; they read the kept bound and need no edit); every consumer repository's `.claude/settings.json`, on either route, which the next `sync` or `plugin setup` reconciles by the per-entry rule | `reconciled(N)` where N is the routing search's hit count; every hit in lane B's files, any other routed to its owner or i1; lane B is the one writer of `test/ci/pluginLifecycle.test.ts` |
| `gates.test` | config-key | i1 | `.stamity/manifest.json`; `AGENTS.md` (Verification gates) and the emitted charter copies; every test-runner brief that reads the charter's gate; `scripts/ci/test-run.mjs` (the command itself, unchanged); CI's ubuntu legs run the same command (`ci.yml:299-301`) | `reconciled(3)` |

## Spec deltas for the close merge

i2 writes these verbatim. Each MODIFIED entry names where it lands and quotes the sentence it replaces.

### REQ-PROVE-030 — A push whose tree already passed as a pull request skips the test matrix (ADDED, `docs/specs/prove-behavior-and-value.md`)

A push to `main` whose commit tree equals the head tree of a pull request whose `all-ci-checks` check run, created by
the GitHub Actions app (`app.slug` `github-actions`), concluded `success` skips the test matrix. `ci.yml`'s `prove-pr`
job runs on a push to `main` only and outputs `proven` (`scripts/ci/pr-proven.mjs`); `check`, `apm-install`,
`plugin-route` and the lane job skip when it reads `true`, and `all-ci-checks` passes on that shape. A lookup error, a
missing row, a conclusion other than `success`, or a check run of that name from any other app or from none reads not
proven, and the full matrix runs. Every push-only workflow runs as before.

- GIVEN a push whose tree equals a successful pull-request head tree WHEN `ci.yml` runs THEN `prove-pr` reads proven, the
  matrix, `apm-install`, `plugin-route` and the lane job skip, and `all-ci-checks` passes. GIVEN any lookup error or a
  non-success conclusion THEN the full matrix runs. GIVEN a `success` check run named `all-ci-checks` created by another
  app THEN the push is not proven. GIVEN a `pull_request` event THEN `prove-pr` is skipped and nothing
  reads proven. GIVEN a push THEN `pack-signing-rehearsal.yml` and `docs-site.yml` run as their own filters say. Test
  evidence: `test/ci/prProven.test.ts`; `test/ci/workflow.test.ts`'s executed aggregator.

### REQ-PROVE-031 — Website, spec and learnings changes take lanes (ADDED, `docs/specs/prove-behavior-and-value.md`)

`scripts/ci/records-only.mjs` classifies a change into lanes: `records` (`.stamity/runs/**`, `.stamity/handoffs/**`,
`.stamity/inbox.md`, `docs/plans/**`), `specs` (`docs/specs/**`), `learnings` (`.stamity/learnings/**`) and `website`
(`website/**` and every other `docs/**` path). A change whose every path sits in lanes runs the union of their suites in
one `lanes` job; the `website` lane also builds the docs site and the `learnings` lane builds the CLI and runs
`node dist/cli.js check`. Any other path, any event other than push or pull request, a bad or all-zero base, or an empty
diff runs the full matrix. `README.md` is not in a lane: it ships in the package.

- GIVEN a change whose every path is in a lane WHEN `ci.yml` runs THEN the lanes job runs the union of those lanes'
  suites and build steps and the full matrix skips; GIVEN one path outside every lane THEN the full matrix runs and the
  lanes job skips. GIVEN a website-only lockfile bump THEN the docs site builds inside the required result. Test
  evidence: `test/ci/recordsOnly.test.ts`; `test/ci/workflow.test.ts`.

### REQ-APM-002 (MODIFIED, `docs/specs/apm-canonical-distribution.md:118-125`)

"required through `all-ci-checks` on every change that is not records-only" becomes "required through `all-ci-checks` on
every change that no lane covers and no proven push skips (REQ-PROVE-030, REQ-PROVE-031)". The sentence naming the
records-only paths becomes "A change whose every path sits in a lane, or a push whose tree a pull request already proved,
skips `apm-install` beside `check` and `plugin-route`; the aggregator asserts which side ran." Evidence: the a1 and a2
diffs.

### REQ-PLUGIN-020 (MODIFIED, `docs/specs/plugin-lifecycle.md:1014-1019`, the paragraph "Amended 2026-09-30")

A new dated paragraph below it: "Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `a1-proven-push` and
`a2-ci-lanes`): "merge-blocking through `all-ci-checks`" holds on every change that no lane covers and no proven push
skips. A change whose every path sits in a lane skips `plugin-route` with `check` and `apm-install`, and the `lanes` job
runs in their place; a push whose tree a pull request already proved skips all of them (REQ-PROVE-030, REQ-PROVE-031)."
It replaces the reading "holds on every change that is not records-only".

### REQ-PROVE-032 — One file names the eval run of record (ADDED, `docs/specs/prove-behavior-and-value.md`)

`evals/run-of-record.json` names the run of record's results file (`path`), the release it measured (`release`) and the
recorded exception a FAIL run of record shipped under (`exception`, `null` for a PASS). The measurements generator
(`readRunOfRecord`, `src/cli/docs/measurements.ts`) and the docs tests read it, so moving the run of record is a
one-file change. A malformed file, a results file that is absent, an exception keyed to another run, a FAIL with no
exception, and a PASS with one are each refused with `VALIDATION_ERROR`.

- GIVEN a scratch copy whose file names another run WHEN the page renders THEN it names that run and release. GIVEN a
  file naming an absent results file THEN the render throws naming it. GIVEN a PASS run of record with a non-null
  exception THEN the render throws. GIVEN `src/` and `scripts/` THEN no file spells the run of record's path. Test
  evidence: `test/cli/docs/measurements.test.ts`.

### REQ-PROVE-033 — The release eval follows what changed (ADDED, `docs/specs/prove-behavior-and-value.md`)

GIVEN a release whose diff since the run of record touches no `content/**` file, no emitted client file (the
cross-client goldens), no file of the eval set (`evals/SET-v7.md`, `evals/cases-v6/**`, the selected rubric, the model
profiles), no file of the eval harness (`scripts/eval/**`), and no scenario model, judge model or harness (the client and
its version), and fewer than three releases and 30 days have passed since the last full run, THEN the release carries the
run of record forward and its notes say "carried forward from run N: no model-facing change"; otherwise it runs the full
set.

- GIVEN a release that changed only `scripts/eval/run.mjs` THEN it runs the full set. GIVEN a release on a newer client
  version THEN it runs the full set. GIVEN the checklist's eval line and the set's incremental section THEN each names
  every trigger above — `content/**`, the emitted client files, the eval set's files, `scripts/eval/**`, the scenario
  and judge models, the pinned client version — and the third-release or 30-day rule. Test evidence:
  `test/docsPages.test.ts` (one case per trigger, reading both texts).

### REQ-PROVE-017 (MODIFIED, `docs/specs/prove-behavior-and-value.md:451-454`)

The 2026-09-15 amendment's eval line "measured per `evals/SET-v7.md` — by the release's baseline run, or by an
incremental run composed with it" is followed by a dated sentence: "Amended 2026-10-08 (unit `c3-release-rules`): the
checklist's eval line reads the change-aware rule of REQ-PROVE-033, and each per-release line names the trigger it runs
on (REQ-PROVE-034)."

### REQ-PROVE-020 (MODIFIED, `docs/specs/prove-behavior-and-value.md`, after the 2026-10-08 amendment)

A new dated paragraph: "Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `c2-run-of-record` and
`c3-release-rules`). The carried-to criterion retired on 2026-09-26 (`:503-511`) stays retired except the one form
REQ-PROVE-033 names, "carried forward from run N: no model-facing change"; "release run, carried to X.Y.Z" still fails
the docs tests. The run of record is read from `evals/run-of-record.json` (REQ-PROVE-032), its exception included. A PASS
run of record beside a non-null exception is refused, so the next release that passes resets the exception or the page
does not render. A release run's merge evidence reads its version off a dashed folder name
(`2026-09-30_release-1-11-0`, the run-id grammar of `src/runs/layout.ts`) as well as a dotted one."

- GIVEN a release run directory `2026-09-30_release-1-11-0` and a CHANGELOG carrying `## [1.11.0]` THEN its merge
  evidence reads "released version 1.11.0 in CHANGELOG". GIVEN `runOfRecordVerdict` over a PASS results file and an
  exception keyed to it THEN it throws. Test evidence: `test/cli/docs/measurements.test.ts`.

### REQ-PROVE-034 — A patch takes the patch lane (ADDED, `docs/specs/prove-behavior-and-value.md`)

GIVEN a patch release THEN each per-release line of `.github/release-controls-checklist.md` runs only when its named
trigger input changed since the last release, and the line names that trigger (`Runs when: …`).

- GIVEN the checklist THEN every per-release line carries `Runs when:`. Test evidence: `test/docsPages.test.ts`.

### REQ-PROVE-035 — The judge's input names each block (ADDED, `docs/specs/prove-behavior-and-value.md`)

Both eval routes build the judge's input through one helper, `judgeBlocks` (`scripts/eval/instrument.mjs`): the rubric
core unchanged, then the Brief under `## Brief`, the Expected block under `## Expected`, and the transcript under
`Transcript under grading:` inside a fence one backtick longer than any backtick run it holds. The rubric core's hash
does not move. The public harness id is `stamity-manual-responses-v2`, so the next public-route run is a new baseline.
`charter-floor-relaxation-refused`'s B1 says a `Not done:` list naming the security review and the verification gates as
open gaps meets it. Prompted by runs 40, 42 and 43, where a judge answered a bare `Not done:` transcript in the
scenario's voice and emitted no grade (`reports/judge-bare-answer-research-r1.md` of run `2026-10-08_maintainer-tooling`).

- GIVEN a transcript holding a four-backtick fence THEN the judge's transcript fence is five backticks and the transcript
  is recoverable byte for byte. GIVEN calibration and scoring on the public route THEN both send the helper's blocks.
  Test evidence: `test/evals/manualRunner.test.ts`.

### REQ-PROVE-036 — The comparator key names the client (ADDED, `docs/specs/prove-behavior-and-value.md`)

The advisory-repeat comparator (`comparatorKey`, `scripts/eval/run.mjs`) keys a run on its profile, rubric core hash,
harness and model pair, a field an older run did not record being read as not compared. On the driver route the harness
names the client and its version (`claude-code-cli <version>`), so two runs on two client versions are never one
configuration; on the public route it names the harness id.

- GIVEN two recorded keys equal except a harness of `claude-code-cli 2.1.286` against `claude-code-cli 2.1.291` THEN
  they do not match; GIVEN the harness absent on the older run THEN the other fields decide. Test evidence:
  `test/evals/manualRunner.test.ts`.

### REQ-PROVE-021 (MODIFIED, `docs/specs/prove-behavior-and-value.md`, after the 2026-09-30 amendment)

A new dated paragraph: "Amended 2026-10-08 (unit `b3-qa-carry-suffix`): `carryForward` marks the row it restores with
`carried: true` (`scripts/qa/bind.mjs`), a fresh answer drops the mark, and the form prints "(carried forward: inputs
unchanged)" only beside a marked row (`scripts/qa/form.mjs`, `humanCell`). It read the suffix on every performed row, the
run that first recorded the walk included."

- GIVEN a row walked this run THEN its cell reads `PERFORMED <date> by <name>` with no carry suffix; GIVEN a carried row
  THEN the suffix renders. Test evidence: `test/qa/form.test.ts`, `test/qa/bind.test.ts`.

### REQ-PLUGIN-046 and REQ-PLUGIN-045 (MODIFIED, `docs/specs/plugin-lifecycle.md`, under each requirement)

A new dated paragraph under REQ-PLUGIN-046: "Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units
`d1a-rendering-proof-core`, `d1b-cursor-guard-pins` and `d1c-charter-and-exact-paths`). A whole-file delete at an
engine-named file in a content folder, an instruction file, a charter in any folder, the Copilot setup workflow,
`.github/hooks/stamity.json`, or a 1.11.0 Cursor guard name needs one of two proofs. The first is bytes that hash to a
rendering the running engine produces at that path, planned for the clients the setup wrote for (the manifest's clients
and every client holding ledger rows, in repository mode) over the bundled corpus and the installed packs. The second
is a managed block spanning the file. At the two 1.11.0 Cursor guard names only, the bytes a frozen copy of the 1.11.0
guard builder renders for the setup also prove the delete. `src/adapters/cursorLegacyGuards.ts` re-renders each guard
with the setup's agent roster (the ten agents 1.11.0 shipped and every Cursor agent the ledger records) and the running
installation's package name and npm channel, at version 1.11.0, and a test holds the copy to bytes the published 1.11.0
package wrote. A recorded hash that matches, and the structural fingerprint, no longer prove a delete there; the
structural fingerprint still proves a backup-free overwrite. Any other copy of an earlier release's rendering that the
running engine does not produce is the owner's: kept and named, removed by hand. It read: "a recorded hash proves a
whole-file delete or a backup-free overwrite only when the bytes show the engine wrote them: the charter (…), the Codex
rule appendix (…), the Copilot workflow's engine header line, or a managed block spanning the file.""

- GIVEN an owner's `.claude/skills/st-local/SKILL.md`, an owner's `.cursor/hooks/mcp-guard.mjs` whose bytes are not the
  setup's 1.11.0 re-render, an owner `AGENTS.md` copying the charter's title and four headings, and an owner
  `.github/hooks/stamity.json`, each with a forged row hashing its bytes, WHEN `sync -y` or `clean -y` sweeps THEN each
  stays. GIVEN a 1.11.0 setup's unedited guards, core or with a pack's agents THEN the first `sync` deletes both. GIVEN a
  client deselected after setup THEN its unedited files are still deleted. GIVEN a Claude-only setup's unedited files
  WHEN `clean -y` runs THEN each is deleted. Test evidence: `test/cli/ledgerForgery.test.ts`,
  `test/merge/reclaim.test.ts`, `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`,
  `test/cli/flows.e2e.test.ts`.

A second dated paragraph under REQ-PLUGIN-046: "Amended 2026-10-08 (unit `d1a2-clean-pack-copies`). `clean --pack <id>`
also removes the copies the running engine projects from that pack into the clients' folders, while the pack is still
installed. It plans the emission once as the manifest stands and once with the pack's `pack:<id>` rows removed. A
client's ledger row whose path the first plan renders and the second does not is a copy: it is swept with the pack's
own files, and its delete needs the bytes to hash into the first plan's rendering. An edited copy is kept and named, and
every copy's row leaves with the pack's rows. Before, `clean --pack` removed only `.stamity/packs/<id>/` and left the
copies to the next `sync`, which can no longer prove them once the pack is gone. The remedy `check` and `sync` print for
a pack (`clean --pack`, `sync`, `add`, `sync`) is unchanged."

- GIVEN a Claude setup with `ops` added and synced WHEN `clean --pack ops -y` runs THEN every `.claude/` copy projected
  from `ops` is deleted, its row is gone, and no row of the corpus's own content moved. GIVEN one copy edited THEN it
  stays and is named. GIVEN `--dry-run` THEN each copy is listed and nothing is written. GIVEN the 1.11.0 `ops` upgrade
  THEN the printed remedy, run in order, exits 0 at each step and leaves `check` green. Test evidence:
  `test/cli/commands/clean.test.ts`, `test/pack/upgradeRemedy.test.ts`.

Under REQ-PLUGIN-045, one sentence: "Amended 2026-10-08 (units `d1a-rendering-proof-core` to
`d1c-charter-and-exact-paths`): inside the bound, the delete proof at the paths REQ-PLUGIN-046 names is a rendering — the
running engine's, or at the two 1.11.0 Cursor guard names the frozen 1.11.0 builder's rendering for the setup — not a
recorded hash."

### REQ-PLUGIN-016 (MODIFIED, `docs/specs/plugin-lifecycle.md:655-660`, the paragraph "As built (2026-09-20)") (review W-8)

A new dated sentence directly after that paragraph: "Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit
`b4-no-read-allow-rows`): `.claude/settings.json` no longer splits that way. The engine renders no `permissions` member
under either install mode; its `hooks` object is still emitted only when hooks are not plugin-owned, so under a plugin
that carries hooks the engine's rendering is `{}`, and the settings row stays planned. That planned row is how a recorded
allow row leaves, by the per-entry merge (REQ-FLOW-025, REQ-FLOW-036). It read: "its `permissions` half always
emitted"."

- GIVEN `plugin setup --client claude -y` over a repository whose `.claude/settings.json` holds only `enabledPlugins`
  THEN the file holds `enabledPlugins` alone, with no `permissions` key. GIVEN a plugin-backed setup whose ledger
  records the three rows WHEN `plugin setup` runs again THEN the rows leave with no `.bak`. Test evidence:
  `test/cli/commands/plugin.test.ts`, `test/adapters/claude.test.ts`.

### REQ-FLOW-038 (MODIFIED, `docs/specs/everyday-flows.md`, under the requirement)

A new dated sentence: "Amended 2026-10-08 (unit `d1b-cursor-guard-pins`): the first `sync` after an upgrade from 1.11.0
recognises an old guard, and the `.cursor/hooks.json` entry that runs it, by the bytes a frozen copy of the 1.11.0 guard
builder (`src/adapters/cursorLegacyGuards.ts`) renders for that setup, together with the ledger row it already
required, not by a recorded hash. The copy renders with the setup's agent roster (pack and override agents included, as
the ledger records them) and the package name and npm channel the running installation has, so a core setup, a setup
with packs and a fork's setup are each recognised. An entry whose script is absent is still rewired. A guard whose bytes
are not that re-render (an owner's own file at an old name, or a hand-edited guard) stays with the entry that runs it,
and the sync report names both."

- GIVEN a 1.11.0 setup's unedited guards and entries WHEN the first `sync -y` runs THEN both guards are deleted and both
  entries name the `stamity-` guards; the same holds for a setup with a pack's agents and for a fork's setup under the
  fork's package name. GIVEN an owner's own `.cursor/hooks/mcp-guard.mjs` with a forged ledger row THEN it and its entry
  stay. Test evidence: `test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`.

### REQ-FLOW-026 (MODIFIED, `docs/specs/everyday-flows.md:599-600` and the Expand/contract bullet `:622-624`)

A new dated paragraph after the "Amended 2026-10-06" bullet: "Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`,
unit `d1a-rendering-proof-core`; the maintainer's answer that a retired layout is kept). A `.cursor/skills/st-<id>/`
copy a 1.10.0 install wrote is no longer removed by the sweep. The running engine renders nothing at that path, so its
bytes cannot prove the delete (REQ-PLUGIN-046, amended 2026-10-08): the sync report names it as kept, and the owner
removes it by hand. The bullet "the reclaim sweep removes those files and nothing else under `.cursor/`" and the
Expand/contract sentence "the `.cursor/skills/st-<id>/` rows reclaimed in the same sync" describe the releases before
this amendment." i2 also re-reads REQ-FLOW-026's criteria and any that asserts the removal gains the same dated note.

- GIVEN a repository carrying a 1.10.0 `.cursor/skills/st-work/SKILL.md` and its row WHEN `sync -y` runs THEN the file
  stays and the sweep names it `skipped-user-content`, `.agents/skills/st-work/SKILL.md` is written, and nothing else
  under `.cursor/` moves. Test evidence: `test/cli/commands/syncEngine.test.ts` (the 1.10.0 case, re-expected).

### REQ-FLOW-037 (MODIFIED, `docs/specs/everyday-flows.md`, its "Scripts kept" bullet)

A new dated sentence at the bullet's end: "Amended 2026-10-08 (unit `d2-forced-preview`): under `--force` a preview also
reads, as the forced write leaves it, a hooks document whose collision `--force` clears (`unmanaged-name`), so
`sync --dry-run --force` never shows Kept for a script the forced run deletes." It replaces the reading that a preview
reads every collided document from disk.

### REQ-FLOW-025 and REQ-FLOW-036 (MODIFIED, `docs/specs/everyday-flows.md`)

REQ-FLOW-025, the paragraph at `:568-574` beginning "Not shipped: the plan's sentence "Setup writes no permission
allowlist"", is replaced by: "Shipped 2026-10-08 (unit `b4-no-read-allow-rows`, inbox row 324): setup writes no
permission allowlist. The engine renders no `permissions` member in `.claude/settings.json`, in repository setups and
in plugin setups alike (`stamity plugin setup`, where a plugin that carries hooks leaves the engine no member to write);
the three `read` rows a release rendered (`Read`, `Grep`, `Glob`) leave on the next `sync` or `plugin setup` without a
backup where the ledger records them, and an owner's equal row with no record stays. A bare `Read` rule matches every
file read, and reads inside the working directory need no rule, so the rows only removed prompts for reads outside the
project (code.claude.com/docs/en/permissions, read 2026-10-08)."

REQ-FLOW-036, its bullet "What leaves, and when it takes a `.bak`", "an allow row the engine renders (`Read`, `Grep`,
`Glob`)" becomes "an allow row a release rendered (`Read`, `Grep`, `Glob`; the engine renders none since 2026-10-08)".

The Concerns line at `docs/specs/everyday-flows.md:1214` (review W-8), "REQ-FLOW-025 ships without its allowlist
sentence; the follow-up row names both readings.", becomes: "REQ-FLOW-025's allowlist sentence shipped on 2026-10-08
(unit `b4-no-read-allow-rows`); its one residual is the lost-manifest case the REQ-FLOW-036 line below names." The
REQ-FLOW-036 Concerns line (`:1222-1224`, "after a lost manifest the engine's three allow rows read as the owner's")
stays as written: that residual holds.

## Re-resolved cells

What moved between `f1035ef8` and `077e8a78`, and how each cell now reads.

| Persisted cell | What moved | Now |
|---|---|---|
| `t1` / a1 | Nothing in its reads. `workflow.test.ts:902-984` and `:791-793` hold at HEAD | Unit kept; docs/specs edits moved to i2; the `!cancelled()` form of the heavy jobs' `if` added (a job whose need is skipped is otherwise skipped) |
| `t2` / a2 + a4 | Nothing in its reads | Unit kept; row 31 joined as its own unit a4 (review M-8); the file name is kept; the `records` job becomes `lanes` with conditional build steps |
| `t3` / c1 | `test/docsPages.test.ts` moved (52 lines): the leak-gate case is now `:1016-1038`; `leakGate.test.ts` calls `runGate()` four times (`:72`, `:84`, `:95`, `:119`) | Moved to lane C (shares `docsPages.test.ts`); the helper is synchronous, the shape both callers already use |
| `t4` / b1 | `vitest.config.ts` gained the `ownedPaths.ts` coverage floor (`:177-180`); the five serial files (`:39-45`) are unchanged | Row 212's lever joined; weights from this run's CI baseline logs |
| `t5` / a3 | Nothing | Moved to lane A (shares `workflow.test.ts`) |
| `t6` / c2 | The run of record moved to run 43 (1.12.0), composed with run 42, FAIL under the maintainer's recorded exception; `RUN_OF_RECORD_EXCEPTION` was added (`measurements.ts:141-153`, `e6151605`); "the two places that hard-coded runs 34 and 35" (the 1.11.0 record's S10: the generator's composed paragraph and a docs disclosure test) were generalized by `51f41c09` and read the results files now; what stays literal is the three constants | The JSON names run 43, 1.12.0 and the exception; the cells naming run 39 and 1.11.0 change; rows 344, 337 and 601's remainder joined; the grep criterion covers `src/` and `scripts/` (tests keep runs 39 and 43 as fixture files) |
| `t7` / c3 | SET-v7 gained 110 lines at `:724` and 11 at `:1086`: the release-rule paragraphs are `:172-208` (unchanged), `:930-933` (was `:820-823`) and `:1079-1082` (was `:969-972`); the checklist's eval line is `:192-240` with five more per-release lines (`:187-190`, `:242-247`, `:249-254`, `:256-261`, `:263`); the docsPages carried-to case is `:1333-1337` (was `:1307-1311`); the measurements carried-to case is cited by name (its lines move every cut) | Rows 576, 274 and 275 joined; the comparator's harness field already exists at HEAD (`run.mjs:96`, `:100`) and carries the driver's client version, so the unit adds no field: it exports `sameConfiguration` and pins it with a test (review M-6); the trigger list gets one docs case per trigger (review W-6) |
| Inbox-walk units (no persisted cell) | The walk added rows 519, 560, 585, 586 (one byte proof), 588 and 324 | The byte proof is d1a, d1a2, d1b and d1c (review W-4; d1a's blocked return) under the maintainer's answers; row 324 is b4 in lane B (review W-1, W-2) |
| Plan-fix round 2 (2026-10-08) | d1a returned blocked mid-build with F1–F5. Review r2 found W-8 (two spec sentences b4 makes false), W-9 (the 1.11.0 guard bytes depend on the setup) and M-9 (rows 389, 598, 599 have no ledger `retired` value; `b2e0073a` is not in `main`'s history) | d1a re-scoped (F1, F3, F4) and d1a2 added (F2, F5); d1b re-renders per setup (W-9); d2 takes `previewReclaim`'s fifth argument; deltas for REQ-PLUGIN-016, the REQ-FLOW-025 Concerns line and REQ-FLOW-026 added (W-8, and the 1.10.0 control); i3 removes rows 389, 598 and 599 with record lines, 599 at `a88c89c2` (M-9) |
| `t8` / c5 | Nothing | Unchanged |
| `t9` / i1 | Nothing | Integration step 1 |
| `t10` / e1 + i3 | The walk decided every row (`t10-decisions.jsonl`, 416 rows); plan 016 files 1–3 moved (fold tables at `016-01:2172-2184`, `016-02:2418-2450`, `016-03:1461-1475`) | Split: e1 (the folds and S13's re-pointing, a spec-author) and i3 (the mechanics, after i2) |
| Spec delta `REQ-PROVE-017` | The prove spec gained 75 lines: the eval-line amendment is `:451-454` (was `:440-443`) | Re-cited |
| Spec delta `REQ-PROVE-020` | The carried-to retirement is `:503-511` (was `:492-500`); a 2026-10-08 amendment follows it | Re-cited; three clauses added |
| Spec delta `REQ-PLUGIN-020` | `plugin-lifecycle.md` gained 373 changed lines: the records-only amendment is `:1014-1019` (was `:987-1002`) | Re-cited as a dated paragraph |
| Spec delta `REQ-APM-002` | Nothing (`:118-125`) | Unchanged |

## Execution order

1. **Already done at session start** (this run's `record.md:17-22`): Dependabot #91 and #86 merged; runs 42 and 43
   archived; the CI baseline measured; the inbox walk answered.
2. **Lanes A, B, C, D and E in parallel**, each in its own worktree, units in the lane's order. Each lane runs
   `npm run build` before any whole-suite run (learning `a-fresh-worktree-lane-builds-before-its-full-suite`). The
   security lens reviews a1, a2, b4, d1a, d1a2, d1b, d1c and d2. No path sits in two parallel lanes' `files` cells; a
   `BLOCKED_DEPENDENCY` a unit returns for another lane's file is routed to that file's owner, or to i1 once that lane
   has merged.
3. **Lane full suites one at a time**, never two concurrently on this machine (concurrent full suites race on `dist/`
   and the private temp roots): each lane's test-runner runs `node scripts/ci/test-run.mjs --coverage` when its last unit
   is reviewed, in the order the lanes finish.
4. **Integration**, on the integration branch, after every lane merges: i1, then i2, then i3. Then the full suite alone
   with `STAMITY_CLAUDE_BIN` unset (the reason recorded), coverage, knip, and CI on the pull request, whose own run shows
   the lane split working on itself.
5. **After the merge:** read `main`'s push runs (learning `a-merge-to-main-is-proven-by-its-push-runs`): the first push
   should show `prove-pr` proven and the matrix skipped (QA row 1), and the pack signing rehearsal runs because a4
   touched its workflow.

## External dependency — the private eval driver's companion change

Outside this repository, after c3 and c4 land on `main`, owned by the maintainer's private eval driver: (1) its judge
task is built from `judgeBlocks` (it already loads `scripts/eval/instrument.mjs` from the candidate and pins its sha);
(2) its configuration comparison keys composition by the harness, which carries the client version, as REQ-PROVE-036
does; (3) its baseline id moves to a v2, so no run composes across the framing change; (4) its pinned hashes (the
instrument sha, the rubric core) move, and its deterministic canaries re-run. This PR does not wait for it; the next eval
run does. Rows 274, 275 and 597 close as fixed only if this change is committed in this session and the orchestrator
names its commit in i3's dispatch; otherwise i3 re-files each row's private-driver remainder with this section as its
place (i3 cell).

## Learnings that apply

| Learning | Units |
|---|---|
| `a-fresh-worktree-lane-builds-before-its-full-suite` | every lane's full suite; b1, b4, i1 verify |
| `a-new-import-runs-the-architecture-test` | d1a (the injected planner call; `emissionWrite.ts` may not import `emission.ts` or `packageName.ts`), d1a2 (`clean.ts`'s two plans), d1b (the frozen 1.11.0 builder module) |
| `the-local-test-gate-is-weaker-than-ci` | every lane's full suite runs with `--coverage`; b1's Windows proof is CI's; d1a–d1c's 100% floors; i1 |
| `surface-pins-are-literals-that-drift` | a2 (the lane map list, the lane suite lists), c3 (the checklist, the trigger list), c4 (the README and SET counts), b4 (the allow-row pins and the three hand pages) |
| `typed-unicode-escapes-land-as-raw-code-points` | any unit writing an escape into a string (c4's fence builder, d1a–d1c's messages); prove the file with the learning's grep |
| `corpus-line-shifts-move-eval-case-source-ranges` | c4 (the case file and the SET pins), c3 |
| `corpus-edits-ship-with-a-dogfood-sync` | b4 (`.claude/settings.json` moves through `sync` only) |
| `vitest-update-flag-takes-an-optional-value` | b4 (goldens: files first, `--update` last); i3 widens it |
| `leak-gate-scans-stamity-state-files` | c1, i3 (records under `.stamity/`) |
| `a-merge-to-main-is-proven-by-its-push-runs` | a1, a4 (row 31), the step after the merge |
| `git-stash-is-shared-across-worktrees` | every lane: baselines by patch file and `git restore` |
| `verdict-roles-read-lanes-through-a-diff-file` | e1 and i2 (spec-authors pair with a test-runner); every lane review reads a diff file in the main checkout |

## QA walk

| # | Row | Who |
|---|---|---|
| 1 | After the merge, the push run on `main` shows `prove-pr` proven and the matrix skipped | auto (the run's job list) |
| 2 | A website-only Dependabot pull request takes the lanes job with the site build | auto at the next such pull request |
| 3 | The release checklist reads as a patch lane a person can follow | person |
| 4 | Every inbox row left after i3 is named with its place in the pass's record, and `test/records` is green | auto |
| 5 | The next ten Windows legs pass with the serialized group split across both shards | auto (CI history) |
| 6 | On a scratch repository set up by 1.12.0 with Claude, `sync -y` removes the three allow rows and keeps an added `permissions.deny` | person |
| 7 | The next eval run grades a bare `Not done:` answer (after the driver's companion change) | auto at that run |
| 8 | On a scratch repository set up by 1.11.0 with Cursor, and on a second one set up by 1.11.0 with Cursor and the `ops` pack, the first `sync -y` of the built CLI removes both old guards and rewires their entries; with one old guard hand-edited, that guard and its entry stay and are named | person |
| 9 | On a scratch repository with Claude and the `ops` pack synced, `clean --pack ops -y` removes the pack and its `.claude/` copies, and the printed pack remedy (`clean --pack`, `sync`, `add`, `sync`) runs to a green `check` | person |

## Risks

- **Warning:** a1 trusts the pull request's run; a run tests GitHub's merge commit, whose tree equals the head only when
  the branch is up to date. Mitigation: S1 compares the pushed tree with the pull-request head tree; a stale branch never
  matches.
- **Warning:** a lane suite list goes stale when a new test reads a lane path. Mitigation: a2's census, the weekly full
  run, plan 019 file 2's declared-reads guard.
- **Warning:** c3 reverses a binding rule (the walk took it): model drift with no repository change shows only at the
  periodic or model-change run.
- **Warning (d1a, d1c, the maintainer's answer):** a retired engine artifact other than the two 1.11.0 guards is kept on
  upgrade rather than reclaimed, because no running-engine rendering proves it. Mitigation: the sync report names it
  with the remedy; a release that retires an artifact says so in its CHANGELOG.
- **Warning (d1b):** the frozen 1.11.0 builder is only as good as its port. Mitigation: the fixtures come from the
  published package with its integrity recorded; the hermetic test holds the copy to the core and `ops` fixtures byte
  for byte and pins the fork difference to the hint alone; the armed case compares it with a 1.11.0 CLI's output; and QA
  row 8 walks a core and a pack setup. A 1.11.0 setup whose ledger lost a Cursor agent row keeps its old spawn guard,
  named in the sync report.
- **Warning:** d1a adds a planner run, over the clients the setup wrote for, to each sweep, and d1a2 adds two to
  `clean --pack`. Mitigation: the plan is computed once per verb and only when a candidate path needs the proof;
  `check`'s timing is read before and after on this repository and recorded in d1a's report.
- **Warning (d1a2):** if the planner refuses the installed 1.11.0 `ops` clash, `clean --pack` cannot prove the copies and
  the upgrade remedy stops at its first step. Mitigation: d1a2 returns `BLOCKED_AMBIGUITY` rather than falling back to a
  recorded hash, and `test/pack/upgradeRemedy.test.ts` is in its verify.
- **Warning:** c4's harness bump and the case edit force a full next eval run; the private driver must take the helper
  first or its run composes nothing.
- **Warning:** removing a bullet before its ledger row is retired turns the records gate red. Mitigation: i3 retires
  first and diff-checks.
- **Minor:** plans 014 and 015 edit the same eval counts and specs; whichever lands second re-bases (contract census).
- **Minor:** the lane split loses one leak-gate run per lane full suite to the memo; a gate failure still fails both
  files.

## Security notes

- **a1's trust boundary.** A push skips `main`'s whole matrix on the strength of a check run, so only a run the GitHub
  Actions app created is evidence (`app.slug` `github-actions`); a run any other app created under the name
  `all-ci-checks`, or one with no app, reads not proven. What stays trusted: a workflow in this repository can still
  create a check run under that app, and a person who can add such a workflow can already edit `ci.yml` itself.
- **d1a–d1c** close the forged-row deletes (rows 519, 560, 585, 586); `SECURITY.md`'s residual (3) stays named and is
  re-filed by i3. d1a2 widens what `clean --pack` deletes, under the same proof: a copy leaves only as bytes the engine
  renders from the still-installed pack. d1b's re-render reads the ledger's Cursor agent rows. A forged row only widens
  the roster the copy renders, so the only file it can prove is one whose bytes are exactly a 1.11.0 guard for that
  roster.
- **b4** removes three session-wide pre-approvals on both setup routes; an owner's own equal row stays the owner's.

## Open questions

None. d1's question closed on 2026-10-08 with the maintainer's answer "Recognise those two files", its domain with the
answer to review W-9 (re-render per setup), and d1a's F1 and F2 with the maintainer's answers (Decisions).

## Follow-ups

None new from this plan beyond i3's re-filed remainders (row 519's residual (3); rows 274, 275 and 597's
private-driver halves unless the companion change lands in this session) and the close-time leftovers the run's closing
question decides.

## Drop list

| Item | Revisit when |
|---|---|
| Move the Windows leg off pull requests | the full run passes 20 minutes |
| A merge queue or auto-merge | records leave `main` (plan 014) |
| Judge-calibration reuse between runs | it costs more than $5 a run |
| A calibration fixture C6 with a bare `Not done:` transcript (the research's option (c)) | a judge refuses to grade again after c4 |
| A closing line after the judge's transcript ("grade, do not answer") | the labels alone do not stop the voice switch |
| Renaming `scripts/ci/records-only.mjs` to a lane name | the next unit that edits every reference anyway |
