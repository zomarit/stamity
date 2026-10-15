---
id: cli-native-01
intent: feature
stamp: c96c714683de0c70a89db703900fa16cae47b43c 2026-10-14
reads: [src/cli.ts, src/cli/commands/plugin.ts, src/cli/commands/plugin/probe.ts, src/cli/commands/plugin/setup.ts, src/cli/commands/plugin/status.ts, src/plugins/capabilityFile.ts, src/emit/ownership.ts, src/types/manifest.ts, src/manifest/manifest.ts, src/adapters/claude.ts, src/adapters/codex.ts, src/adapters/copilot.ts, src/adapters/cursor.ts, src/emit/planner.ts, src/emit/hooksInfra.ts, src/types/content.ts, src/cli/engine/emissionWrite.ts, src/cli/commands/check.ts, src/cli/commands/clean.ts, src/cli/commands/sync/report.ts, src/cli/commands/init/apply.ts, src/composition/root.ts, src/index.ts, src/cli/kit/packageName.ts, src/emit/capabilityMatrix.ts, src/cli/docs/llmsIndex.ts, src/shared/cliCall.ts, scripts/fork-identity.mjs, scripts/distribution-identity.mjs, scripts/plugins, scripts/qa/run.mjs, scripts/qa/form.mjs, scripts/eval/run.mjs, .github/workflows/ci.yml, .github/workflows/nightly.yml, .github/workflows/release.yml, .github/workflows/fork-release.yml, test/ci/workflow.test.ts, test/docsPages.test.ts, test/cli/surface.e2e.test.ts, test/architecture/boundaries.test.ts, test/records/specStatus.test.ts, test/emit/syncDriftProof.e2e.test.ts, evals/SET-v7.md, evals/cases-v6, docs/specs/plugin-lifecycle.md, docs/specs/apm-canonical-distribution.md, docs/specs/fork-layer.md, docs/specs/everyday-flows.md, docs/specs/prove-behavior-and-value.md, package.json, .stamity/change-classes.json, vitest.config.ts]
---

# CLI-native — file 1 of 4: one distribution route (the APM and plugin routes deleted)

This file is self-contained. It is the first of four `/st-plan` artifacts for **Package 24**, which makes Stamity
CLI-native on every client and in every place and is cut as **1.15.0**. This file deletes the APM and plugin
distribution routes, so the npm CLI is the one route. It lands first: the per-client model pins (file 2) and the
corpus work (file 3) change the manifest, `check` and the adapters this deletion edits. File 4 prepares the cut.

intent chosen: feature because the package adds capabilities (per-client model pins, a close walk on every touchpoint,
prove-before-asking QA, deep-module checks, cloud fixes) and this file's removal rides as the package's breaking
removal, named under `Removed` in the changelog; bug and refactor do not fit, since external contracts move.

## Context

From 1.10.0 to 1.14.0 the plugin route had zero downloads and no known user, while the two routes carry about 120
files and 43k lines on plugin and APM paths (generated trees included), plugin-mode branches in about 20 other `src/`
files, about 495 tests, four CI jobs, nine release steps and seven fork-release steps. The maintainer chose one route,
the npm CLI, removed in a minor: 1.15.0, not 2.0.0. Out of scope: the `plugin-dist` branch and the `plugins/v*` tags
(they stay as frozen history), the container layout `hookScriptsRoot` (dead but harmless; a follow-up), and the
client-CLI installs CI loses (a later package brings them back on the repository route).

## Decisions

### The maintainer's walks (2026-10-13 and 2026-10-14)

Taken on 2026-10-13 after a research round on six field reports and an enterprise fork's report on Cursor model pins:
every client gets a working model pin from the account's own list; all nine touchpoints end on a walk of their
leftovers; the person's QA list is proven first and capped at three rows; deep modules enter as checks in review and
verify; the cloud gaps are fixed from research and the vendors' docs only, with no run in any vendor's cloud ("fix
only according to research and docs, dont run in the cloud"); the APM and plugin routes are deleted in the next
release ("no existing users, you can throw it all out in the next release"), which is 1.15.0 (the maintainer's choice
over 2.0.0). On 2026-10-14 the declared defaults below were confirmed as they stand, with seven corrections from a
later cloud research round, and the `plugin-dist` branch and its tags stay.

### Declared defaults this file builds

- **D1.** Delete the `stamity plugin` verb, the `plugin-backed` install mode and its branches, `src/plugins/`, the
  exported `InstallMode` and `Plugin*` types, `scripts/plugins/` and the plugin and APM build scripts, the generated
  trees and manifests (`.apm/`, `apm.yml`, `.claude-plugin/`, `.cursor-plugin/`, `plugin.json`,
  `renovate/plugins.json`, `package.json`'s `stamity.distribution`), the CI jobs and the release, fork-release and
  nightly steps for both routes, the dedicated tests and fixtures, the eval cases `plugin-mode-invocation`,
  `st-setup-fresh-repository` and `st-setup-refuses-generated-setup`, and the docs for both routes.
- **D2.** `check`'s `plugin-duplicates` row stays for one release as a warning that names a leftover plugin install.
- **D3.** The requirements with a CLI or fork job move to the fork and flow specs before the two route specs retire;
  `scripts/fork-identity.mjs` and `scripts/distribution-identity.mjs` stop depending on plugin modules.
- **D4.** No ref is deleted: `plugin-dist` and the six `plugins/v*` tags stay.
- **D5.** `CHANGELOG.md` names both routes, the removed command, mode, flag, JSON keys and exported types under
  `Removed`, plainly: a removal in a minor.

### Settled by this plan

- **Both route specs stay on disk** as stubs marked retired in 1.15.0, each pointing at the new homes: deleting them
  turns the records suite red, because committed plans name them (`test/records/specStatus.test.ts:166-169`). Their
  `status:` stays inside the allowed vocabulary.
- **The manifest's `plugin` block is held for one release:** accepted without validation, never used, written back
  verbatim by `sync` through the 1.15 line, and read only by the `plugin-duplicates` warning, which `sync` also prints.
  Removing it from the schema now would make `check`, `sync` and `clean` refuse every manifest that still holds it
  (`src/manifest/manifest.ts:1033-1038`); dropping it on the first `sync` would end the warning after one run. File 2's
  manifest migration leaves it as it is; the release after 1.15.0 removes it (a follow-up below).
- **Moved requirements keep their ids** (`REQ-PLUGIN-027`, `-028`, `-045` to `-048` and the others below): about 398
  citations stay valid.
- **Removed outright:** `--expect-mode`, the `pluginOwned` (sync) and `pluginUninstall` (clean) JSON keys, the
  `plugin-runtime` doctor row, the `plugin-owned` pack-drop reason, the QA harness rows H4a–H4d and H5.
- **A fork's `stamity.distribution` block** is ignored with a one-line notice for one release, not refused.
- **`docs/enterprise-quickstart.md`** is rewritten as the fork-only day-0/1/2 page; its slot stays.
- **`evals/SET-v7.md`** is edited in place with a dated paragraph, not cut as a new set.

## Spec delta

Each moved requirement is defined exactly once, in its new home; the stub of its old spec lists it as "moved to
<spec>". Every requirement of the two route specs with no CLI or fork job is retired in its stub with the disposition
"retired 1.15.0: the route is deleted"; that includes the whole APM route spec, whose downstream-publisher half moves
to the fork identity requirement below.

### REQ-PLUGIN-027 — A fork releases through its own workflow (moved to fork-layer.md) (MODIFIED)
Route clauses dropped (the plugin distribution, the `plugins/v*` tags). Given a fork's armed release workflow, When it
releases, Then it publishes the npm package only, verifies digests, is idempotent, and never moves a tag.

### REQ-PLUGIN-028 — One command sets a fork's identity (moved to fork-layer.md) (MODIFIED)
"Regenerates plugin and APM manifests" and the `renovate/plugins.json` move dropped; the APM route's publisher-identity
half joins it. Given `fork-identity.mjs` with a name, URLs, a publisher and a registry, Then it sets them, `--check`
reports drift with exit 1, and no value is echoed.

### REQ-PLUGIN-048 — A registry fork's pinned calls name its registry (moved to fork-layer.md) (MODIFIED)
Unchanged in substance; its call-form half points at the flows spec's call-form requirement.

### REQ-PLUGIN-045 — The ownership ledger is bounded (moved to everyday-flows.md) (MODIFIED)
Moved beside the flows' ownership requirements, unchanged in substance.

### REQ-PLUGIN-046 — Imports, the rendering proof, git by an absolute path, the bare-repository look (moved to everyday-flows.md) (MODIFIED)
Moved with its amendments, unchanged in substance.

### REQ-PLUGIN-047 — `check` expectations (moved to everyday-flows.md) (MODIFIED)
`--expect-mode` removed; `--expect-version` and `--expect-tools` unchanged.

### REQ-PLUGIN-005 — The emitted runner starts `node` by an absolute path (moved to everyday-flows.md) (MODIFIED)
Only its CLI amendment moves; the plugin-root half retires.

### REQ-PLUGIN-016 — The ledger bound, settings co-ownership, the node row and the pack-reach row (moved to everyday-flows.md) (MODIFIED)
Its amendments with a CLI job move; the plugin-ownership half retires.

### REQ-PLUGIN-017 — Explicit gates beat detection (moved to everyday-flows.md) (MODIFIED)
The `plugin status` half dropped.

### REQ-PLUGIN-014 — The manifest's `gates` object (moved to everyday-flows.md) (MODIFIED)
Its surviving half — the `gates` object, its 512-character limit and the backtick refusal — is CLI behaviour, so it
moves by rule D3; its plugin half retires (amended 2026-10-14 from `d8`'s return, `build/37`, upheld by its review).

### REQ-PLUGIN-020 — The CI lanes, the proven push, the nightly guard and the records job (moved to prove-behavior-and-value.md) (MODIFIED)
Its amendments with a CI job move; the per-client plugin install proof retires.

### REQ-PLUGIN-025 — The release eval artifact on the records branch (moved to prove-behavior-and-value.md) (MODIFIED)
Its amendment moves; the plugin-mode eval coverage retires.

### REQ-FORK-010 — The fork layer's consumers (MODIFIED)
Its APM half dropped.

### REQ-FORK-011 — Public and private compatibility (MODIFIED)
Its APM half dropped.

- REMOVED REQ-PLUGIN-026 — retired 1.15.0: the routes it kept unchanged are deleted.
- REMOVED REQ-PLUGIN-029 — retired 1.15.0: the managed-settings template served the plugin rollout only.
- REMOVED REQ-PLUGIN-030 — retired 1.15.0: superseded by the fork-only quickstart page.
- Plan 016 file 1's planned plugin requirements are re-targeted by plan 016's own re-plan, not here.

## Units

### d1-fork-identity — the identity scripts stop depending on plugin modules

| Field | Content |
|---|---|
| `id` | d1-fork-identity |
| `requirements` | REQ-PLUGIN-028, REQ-PLUGIN-048 |
| `files` | `scripts/fork-identity.mjs` (drop the `./plugins/tokens.mjs` import at `:46`, the generator spawns at `:62` and `:275-296`, the `renovate/plugins.json` retarget at `:228-234`), `scripts/registry-url.mjs` (new: the `REGISTRY_URL` rule restated), `src/shared/cliCall.ts` (the comment at `:97-98` that names the deleted plugin modules), `test/ci/forkIdentityScript.test.ts`, `test/ci/forkIdentity.test.ts` |
| `interfaces` | `scripts/registry-url.mjs` exports `REGISTRY_URL: RegExp`, byte-equal in `source` and `flags` to `src/shared/cliCall.ts:100`; `fork-identity.mjs` keeps its flags and exit codes; no generator runs |
| `testCriteria` | GIVEN the two `REGISTRY_URL`s THEN a test asserts equal `source` and `flags` (the pin `test/ci/pluginModules.test.ts:262-263` held, which file 1 deletes). GIVEN `--registry https://r.example/a%20b` THEN exit 1 and the value is not echoed. GIVEN `--check` on a tree with no `renovate/plugins.json` THEN exit 0. GIVEN a second run THEN no byte moves |
| `edgeCases` | A fork tree still holding `renovate/plugins.json` → left untouched, not retargeted, `--check` still exit 0 |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/forkIdentityScript.test.ts test/ci/forkIdentity.test.ts test/shared/cliCall.test.ts` |

### d2-eval-cases — three route cases leave the set

| Field | Content |
|---|---|
| `id` | d2-eval-cases |
| `requirements` | spec carries no ids |
| `files` | delete `evals/cases-v6/golden/plugin-mode-invocation.md`, `evals/cases-v6/golden/st-setup-fresh-repository.md`, `evals/cases-v6/adversarial/st-setup-refuses-generated-setup.md`; `evals/SET-v7.md` (`:1`, `:76`, `:108-109`, `:129-130`, `:444-478`, `:2718-2725`, index rows `:2852`, `:2891`, `:2921`, coverage `:2976-2981`, appendix `:3043`, `:3056`, one dated paragraph); `evals/README.md:566`; `test/evals/coverage.test.ts:57-105`; `test/evals/support.ts:116-143`; `test/evals/manualRunner.test.ts:1747-1752`; `scripts/eval/run.mjs:50`, `:54-59`; `.stamity/overrides/skills/st-eval-run/SKILL.md` (`:133-135`, `:290`) |
| `interfaces` | Roster after the change: 139 cases (79 golden, 30 adversarial, 30 probes), binding 747, advisory 118; "What v7 adds" 61 cases in 8 groups; the scenario and call counts in the eval-run skill recomputed (3 scenarios and 6 calls per case) |
| `testCriteria` | GIVEN `npx vitest run test/evals` THEN green, the roster test recomputing every count from the case files. GIVEN `coverage.test.ts` THEN its "governed outside `content/`" list is empty and the assertion says so. GIVEN `parseSource("scripts/plugins/setupCommand.mjs:1-5")` THEN `null` |
| `edgeCases` | A carried-forward incremental run naming a deleted case id → the dated paragraph says the full set runs at the next release (the set changed) |
| `depends_on` | none |
| `verify` | `npx vitest run test/evals` |

### d3-ci-qa — the CI, release, fork-release and nightly steps for both routes

| Field | Content |
|---|---|
| `id` | d3-ci-qa |
| `requirements` | REQ-PLUGIN-027 |
| `files` | `.github/workflows/ci.yml` (jobs `apm-install` `:481-569` and `plugin-route` `:571-782`, the generate `--check` lines `:405-406` and `:843-844`, the aggregator `:1043-1103`, header comments), `.github/workflows/nightly.yml` (`headless-lane` plugin half `:202-539`, header `:110-130`; the scratch-repo dogfood `:154-200` stays), `.github/workflows/release.yml` (`:12-25`, `:94-100`, `:118-120`, `:337-411`, `apm-route` `:548-639`, `publish.needs`, the `attestations` and `artifact-metadata` permissions, `:729-742`, `:836-902`, `:917-1050`, `:1079-1088`, dry-run lines), `.github/workflows/fork-release.yml` (the plugin steps listed in its header and `:179-848`), `test/ci/workflow.test.ts`, `test/ci/forkReleaseWorkflow.test.ts`, `.github/release-egress.md:12-75`, `GOVERNANCE.md:54-82`, `scripts/qa/run.mjs`, `scripts/qa/form.mjs`, delete `scripts/qa/plugin-runs.mjs` and `test/qa/pluginRuns.test.ts`, `test/qa/run.test.ts`, `test/qa/form.test.ts` |
| `interfaces` | `all-ci-checks.needs` = `[changes, prove-pr, check, lanes, records, supply-chain]` (plus `dependency-review` as today); a proven push still asserts `skipped`; `publish.needs = [gates]`; `id-token: write` and the Sigstore egress hosts stay (npm provenance); the QA form drops rows H4a–H4d and H5 |
| `testCriteria` | GIVEN `workflow.test.ts` THEN no job, step or permission names the plugin or APM route, the aggregator's `needs` and per-shape assertions match the list above, and the nightly's scratch-repo dogfood still runs. GIVEN `forkReleaseWorkflow.test.ts` THEN the fork release publishes the npm package only. GIVEN an evidence file that still carries H4a or H5 THEN `scripts/qa/form.mjs` renders without throwing and lists them as retired |
| `edgeCases` | A required check named only by the deleted jobs → none: the ruleset requires `all-ci-checks` and `all-pr-checks` only, both kept |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/workflow.test.ts test/ci/forkReleaseWorkflow.test.ts test/qa` |
| `threat` | Trust boundary: the workflows hold `id-token` and publish rights. Trusts: the gates job's outputs. Abuse case: a removed step leaves a job that publishes without the digest check. Check: `workflow.test.ts` asserts `publish.needs = [gates]` and that every remaining publish step sits after the gates' verification; the security lens reads the release diff |

### d4-docs-site — the pages for both routes

| Field | Content |
|---|---|
| `id` | d4-docs-site |
| `requirements` | REQ-PLUGIN-030 |
| `files` | delete `docs/plugins.md`; edit `docs/enterprise-quickstart.md` (rewritten, fork-only), `docs/getting-started.md` (`:96-147`, `:194-216`, `:199` "The ten verbs" → nine, `:413`), `docs/enterprise-forks.md` (`:741-954`, `:1075-1220`, the `plugin-dist` lines of "Release your fork", and `:138-257`, the fork identity section, which still describes the preset move and the generator run `d1` removed; amended 2026-10-14 from `d1`'s review), `docs/troubleshooting.md`, `docs/customization.md` (the two APM lines only), `docs/packs-and-trust.md`, `docs/security-mapping.md`, `README.md` (`:79`, `:115-116`, `:124`, `:130-131`), `SECURITY.md` (`:66-81`, the plugin clauses of `:109`, `:116`'s `--expect-mode`, `:118`, `:202-214`, `:227-240`, `:398`), `CONTRIBUTING.md` (`:86-111`, `:164-165`, `:202`, `:252-271`, `:429`), `.github/release-controls-checklist.md` (`:110-129`, `:202`), `.github/client-contracts.md`, `website/sidebars.ts` (`:53`, `:81`), `docs/doctrine.md:130-131` (the hand-page count words: eleven guides, fourteen pages; amended 2026-10-14 from `d4`'s return), `src/cli/docs/llmsIndex.ts` (`:115`, `:168-173`, `:213`, `:223`), `llms.txt` (regenerated in this lane: no other lane feeds it), `test/docsPages.test.ts` |
| `interfaces` | README and getting-started name nine verbs; the llms index says "nine verbs"; `test/docsPages.test.ts` imports nothing under `scripts/plugins/` (its `:48` and `:52` imports go) and its `GUIDES` list drops `PLUGINS` |
| `testCriteria` | GIVEN `docsPages.test.ts` THEN README's verb list has nine items and the getting-started array matches. GIVEN `node scripts/generate-docs.mjs --page llms` THEN `git diff --exit-code llms.txt` exits 0. GIVEN `SECURITY.md` THEN no line cites `checkPluginRuntime`, `compatibilityOf` or `--expect-mode` |
| `edgeCases` | A page linking `docs/plugins.md` → the link checker (`test/ci/docsSite.test.ts`) fails until the link is removed or pointed at getting-started |
| `depends_on` | none |
| `verify` | `npx vitest run test/docsPages.test.ts test/cli/docs/llmsIndex.test.ts test/ci/docsSite.test.ts test/ci/docsRoster.test.ts test/upstream/importRecipe.test.ts` |

### d5-scripts-trees — the build scripts, generated trees and their tests

| Field | Content |
|---|---|
| `id` | d5-scripts-trees |
| `requirements` | spec carries no ids |
| `files` | delete `scripts/plugins/**` and `scripts/{generate-plugin-packages,generate-apm-package,build-plugin-distribution,plugin-container-facts,build-plugin-runtime,apm-install-smoke,plugin-route-smoke,generate-plugin-manifests,plugin-lifecycle-fixture}.mjs`; delete `.apm/**`, `apm.yml`, `plugin.json`, `.claude-plugin/**`, `.cursor-plugin/**`, `renovate/plugins.json`; delete `test/ci/plugin*.test.ts` (15), `test/ci/apm{Install,Package,Downstream}.test.ts`, `test/ci/managedSettings.test.ts`, `test/ci/releaseManifest.test.ts`, `test/fixtures/plugins/**`; edit `scripts/distribution-identity.mjs` (shrinks to the publisher check), its consumers `scripts/fork-identity.mjs:44` and `test/docsPages.test.ts:50`, `scripts/generate-capability-matrix.mjs` (`:60`, `:68`), `src/emit/capabilityMatrix.ts` (the "Plugin containers" section and its inputs), `docs/capability-matrix.md` (regenerated in this lane), `package.json:47-52`, `test/ci/distributionIdentity.test.ts`, `test/ci/nativeTypescript.test.ts` (`:23-24`), `test/ci/downstreamFixture.ts`, `test/emit/capabilityMatrix.test.ts` (`:27`), `vitest.config.ts` (`:37-64`, `:107-124`), `test/ci/testScheduling.test.ts`, `eslint.config.js:181`, `.stamity/change-classes.json:115-123`, `test/ci/forkIdentity.test.ts` (`:133-199`, the canonical-spelling census: drop the entries for every file this unit deletes and re-count those `d3` and this unit edit; amended 2026-10-14 from `d1`'s finding), `src/cli/docs/measurements.ts` (`:1736`, the First-run proof no longer names the deleted `apm-install` job) and `test/cli/docs/measurements.test.ts:781` (amended from `d3`'s finding; `docs/measurements.md` renders from the records, so the integrator regenerates it where they are restored), `scripts/qa/hook-runs.mjs` (`:92-93`, `:167`: comments naming importers this unit deletes) |
| `interfaces` | `resolveDistributionIdentity(pkg) → { publisher: string; notices: string[] }`: `publisher` as today (`scripts/distribution-identity.mjs:278-322`); a `stamity.distribution` key is ignored and yields the notice "package.json `stamity.distribution` is ignored since 1.15.0; remove it"; any other unknown `stamity` key is still refused. The capability matrix renders with no plugin input; the Windows shard table keeps one serial file per shard |
| `testCriteria` | GIVEN `node scripts/generate-capability-matrix.mjs` THEN `git diff --exit-code docs/capability-matrix.md` exits 0. GIVEN `testInputsGuard.test.ts` THEN no `testInputs` entry names a missing file. GIVEN a fork `package.json` with `stamity.distribution` THEN `resolveDistributionIdentity` returns the notice and `fork-identity.mjs --check` exits 0 |
| `edgeCases` | The leak gate and hygiene scan after the deletion → both still exit 0 (neither names a deleted path) |
| `depends_on` | d1-fork-identity, d2-eval-cases, d3-ci-qa, d4-docs-site |
| `verify` | `npx vitest run test/ci/distributionIdentity.test.ts test/ci/forkIdentityScript.test.ts test/ci/nativeTypescript.test.ts test/emit/capabilityMatrix.test.ts test/docsPages.test.ts test/ci/testInputsGuard.test.ts test/ci/testScheduling.test.ts test/ci/leakGate.test.ts test/ci/repoHygiene.test.ts` (knip moved to `d6`: the deleted modules' last importers are `d6`'s tests; amended 2026-10-14 from `d5`'s return) |

### d6-verb — the `stamity plugin` verb leaves

| Field | Content |
|---|---|
| `id` | d6-verb |
| `requirements` | REQ-PLUGIN-047 |
| `files` | delete `src/cli/commands/plugin.ts`, `src/cli/commands/plugin/setup.ts`, `src/cli/commands/plugin/status.ts`, `src/plugins/capabilityFile.ts` (its `PLUGIN_ROOT_VARIABLES` moves into `plugin/probe.ts` until `d7` deletes that file), `test/cli/commands/plugin.test.ts`, `test/cli/commands/pluginSetup.test.ts`, `test/plugins/capabilityFile.test.ts`; edit `src/cli.ts` (`:14`, `:32`, `:47-49`, `:61-65`, `:76`), `src/composition/root.ts` (`EngineRegistry.plugins`, `:138`, `:345-359`, `:488`), `docs/cli-reference.md` (regenerated in this lane), `test/pack/packEngineDefects.test.ts` (`:10`, `:21`, `:162`), `test/merge/settingsKeyOwnership.test.ts` (the plugin describes `:262`, `:407`, `:506-656`), `test/cli/surface.e2e.test.ts` (`ADVERTISED`, the counts at `:75`, `:77`, `:106`), `test/architecture/boundaries.test.ts` (the `PLAN_MAP` rows for `plugin.ts`, `setup.ts`, `status.ts` `:638-640` and `capabilityFile.ts` `:662` only; `probe.ts`'s row `:637` stays until `d7`), `.stamity/change-classes.json:135-136`, `.oxlintrc.json` (`:81`, `:131`: the `**/plugins/**` entry of two deny-lists, which the architecture test derives from the folders on disk; amended 2026-10-14 from the unit's blocked return) |
| `interfaces` | `--help` lists nine verbs; thirteen are registered; `EngineRegistry` has no `plugins` group |
| `testCriteria` | GIVEN `stamity plugin status` THEN exit 2 as an unknown command. GIVEN `surface.e2e.test.ts` THEN nine advertised and thirteen registered. GIVEN `node scripts/generate-docs.mjs` THEN `git diff --exit-code docs/cli-reference.md` exits 0. GIVEN `.claude/settings.json` with `enabledPlugins` THEN `sync` and `clean` keep the key (the co-owned path). GIVEN `boundaries.test.ts` THEN every remaining `src/` file is mapped |
| `edgeCases` | A user script calling `stamity plugin setup` → the unknown-command error names `stamity --help`; the changelog's `Removed` names the verb |
| `depends_on` | d5-scripts-trees |
| `verify` | `npx vitest run test/cli/surface.e2e.test.ts test/architecture/boundaries.test.ts test/cli/docs/cliReference.test.ts test/merge/settingsKeyOwnership.test.ts test/pack/packEngineDefects.test.ts test/composition test/ci/testInputsGuard.test.ts && npm run typecheck && npm run knip` |

### d7-engine — the install mode, its types and branches

| Field | Content |
|---|---|
| `id` | d7-engine |
| `requirements` | REQ-PLUGIN-045, REQ-PLUGIN-046, REQ-PLUGIN-047 |
| `files` | delete `src/emit/ownership.ts`, `src/cli/commands/plugin/probe.ts`, `test/emit/ownership.test.ts`. Edit: `src/types/manifest.ts` (`:261-341`, `:416-425`: the mode types go; `plugin?` becomes an opaque held value), `src/manifest/manifest.ts` (`:206`, `:230-233`, `:618-715`, `:1024`, `:1228`, `:1247`, `:1272`, `:1315-1348`), `src/adapters/claude.ts` (`:113`, `:488-497`, `:518-519`, `:538-540`, `:551-557`, `:826-836`), `src/adapters/codex.ts` (`:28`, `:299-311`, `:510-511`), `src/adapters/copilot.ts` (`:24`, `:309-316`, `:372-373`), `src/adapters/cursor.ts` (`:23`, `:289-300`, `:530-531`), `src/emit/planner.ts` (`:66`, `:465`, `:1035-1047`, `:1171-1283`), `src/emit/hooksInfra.ts` (`:291-303`, `:442-450`, `:500-515`), `src/types/content.ts:190-199`, `src/cli/engine/emissionWrite.ts` (`:22`, `:905`), `src/cli/commands/check.ts` (the plugin rows and flags; `judgeNodeFloor`, `requiredNodeRange`, `majorOf` move in from `probe.ts`), `src/cli/commands/clean.ts` (`:368-415`, `:1090-1126`), `src/cli/commands/sync/report.ts` (`:2`, `:205-220`, `:333`, `:385-391`), `src/cli/commands/init/apply.ts` (`:45`, `:98-110`, `:682`), `src/composition/root.ts` (the `emitOwnership` import), `src/index.ts:63-96`, `src/cli/kit/packageName.ts:245`, `test/architecture/boundaries.test.ts` (the `probe.ts` row `:637` and the `ownership.ts` row `:487`), `docs/troubleshooting.md` (`:108-114`, the doctor rows and the flag this unit removes; amended 2026-10-14 from `d4`'s finding), and the tests: `test/cli/commands/check.test.ts` (with `:2499`, which reads a deleted plugin module at run time), `test/cli/checkExpectations.test.ts`, `test/manifest/manifest.test.ts`, `test/emit/planner.test.ts`, `test/emit/plannerPackReach.test.ts`, `test/adapters/{claude,cursor,copilot,codex}.test.ts`, `test/cli/commands/syncEngine.test.ts`, `test/cli/commands/initApply.test.ts`, `test/cli/commands/clean.test.ts`, `test/cli/engine/emissionWrite.test.ts`, the co-owned JSON, Claude settings and owned-paths tests, `test/cli/kit/packageName.test.ts:381-425`. Added 2026-10-14 from the unit's blocked return: `test/pack/projection.test.ts` (`:492-533`, the plugin-backed half becomes a held-block assertion), `docs/cli-reference.md` (regenerated by `node scripts/generate-docs.mjs --page cli`), `test/emit/plannerNameClash.test.ts` (`:171`, the name-clash remedy no longer names the deleted verb), `src/tools/translator.ts` (`:333`, the capability text drops the deleted mode) |
| `interfaces` | `checkPluginDuplicates(root, manifestRaw, settingsJson) → DoctorRow`, about 60 lines in `check.ts`, importing no plugin module: reads (a) the held `plugin` key of the manifest file as raw JSON, (b) `.claude/settings.json` `enabledPlugins` holding `stamity@…`; status always `warn` naming each client (only the ids `claude`, `cursor`, `copilot`, `codex` are printed) and its vendor uninstall command (`clean.ts:395-402`'s wording), else `pass` "no leftover plugin install". The held `plugin` block is never validated or used and is written back verbatim by `sync` through the 1.15 line, so the warning lasts the release; `sync` prints the same warning lines. `check --json` loses the `plugin-runtime` row and `--expect-mode`; `sync --json` loses `pluginOwned`; `clean --json` loses `pluginUninstall` |
| `testCriteria` | GIVEN a manifest holding `{"plugin":{"mode":"plugin-backed","clients":{"claude":{"version":"1.14.0","classes":["skill"]}}}}` THEN `check` exits 0 with `plugin-duplicates` = `warn` naming claude, `sync` emits the claude skills, prints the warning, and keeps the block value-identical (the serializer sorts nested keys). GIVEN the cross-client goldens THEN byte-identical without `-u` (generated mode never took the plugin branches). GIVEN the doctor row list THEN one row fewer, pinned. GIVEN `npm run typecheck && npm run lint && npm run knip` THEN exit 0 |
| `edgeCases` | `enabledPlugins` names another product's plugin → no warning; a `plugin` value that is not an object, or names an unknown client → accepted, kept, and the unknown name never printed |
| `depends_on` | d6-verb |
| `verify` | `npx vitest run test/cli/commands/check.test.ts test/cli/checkExpectations.test.ts test/manifest test/emit test/adapters test/architecture/boundaries.test.ts test/composition test/cli/commands/syncEngine.test.ts test/cli/commands/initApply.test.ts test/cli/commands/clean.test.ts test/cli/engine/emissionWrite.test.ts && npm run typecheck && npm run lint && npm run knip` |
| `threat` | Trust boundary: the manifest is read from the working tree. Trusts: nothing in the held `plugin` block. Abuse case: a crafted block steers `sync` or `clean`, or prints text into the warning. Check: the block is read only as JSON for the warning; only known client ids are printed; a test feeds a hostile block and asserts emission is byte-identical to a manifest without it |

### d8-specs-changelog — the requirements rehomed, the stubs, `Removed`

| Field | Content |
|---|---|
| `id` | d8-specs-changelog |
| `requirements` | REQ-PLUGIN-005, REQ-PLUGIN-014, REQ-PLUGIN-016, REQ-PLUGIN-017, REQ-PLUGIN-020, REQ-PLUGIN-025, REQ-PLUGIN-026, REQ-PLUGIN-027, REQ-PLUGIN-028, REQ-PLUGIN-029, REQ-PLUGIN-030, REQ-PLUGIN-045, REQ-PLUGIN-046, REQ-PLUGIN-047, REQ-PLUGIN-048, REQ-FORK-010, REQ-FORK-011 |
| `files` | `docs/specs/fork-layer.md`, `docs/specs/everyday-flows.md`, `docs/specs/prove-behavior-and-value.md` (also `:990-993`, citations into `scripts/qa/run.mjs` and `form.mjs` that `d3` moved, and `:1463`, an example naming a script `d5` deletes), `docs/specs/plugin-lifecycle.md` and `docs/specs/apm-canonical-distribution.md` (stubs: a "Retired in 1.15.0" header, each retired id's definition with its disposition, each moved id as "moved to <spec>"), `docs/specs/enterprise-upstream-lane.md`, the stray route mentions in `docs/specs/{model-ladder,worktree-lane,orchestrator-context,implementation-finish}.md`, `CHANGELOG.md` (`## [Unreleased]` → `### Removed`) |
| `interfaces` | This file's Spec delta, applied; `Removed` lists: the APM route, the plugin route, `stamity plugin`, the `plugin-backed` mode, `--expect-mode`, the `pluginOwned` and `pluginUninstall` JSON keys, the `plugin-runtime` doctor row, the exports `INSTALL_MODES`, `INSTALL_MODE_DEFAULT`, `PLUGIN_OWNED_CLASSES`, `InstallMode`, `PluginClientRecord`, `PluginConfig`, `PluginOwnedClass`, `EngineRegistry.plugins`, and the capability matrix's `PLUGIN_CONTAINER_CLASSES`, `PluginContainerClass`, `PluginContainerFact` and `CapabilityMatrixInputs.plugins` (public through `EngineRegistry.emit.capabilityMatrix`; amended 2026-10-14 from `d5`'s review); one sentence that this is a removal in a minor, on purpose |
| `testCriteria` | GIVEN `npm run test:records` THEN green (no plan names a missing spec). GIVEN `test/authoring/specStatusRules.test.ts` THEN every moved id is defined once. GIVEN `test/ci/changelogLinks.test.ts` THEN green. GIVEN the structural coverage script over this plan and `docs/specs` THEN no dangling id |
| `edgeCases` | A moved requirement whose text names a deleted file → the clause is dropped with "(route clause dropped 1.15.0)", never left pointing at a missing path |
| `depends_on` | d6-verb, d7-engine |
| `verify` | `npx vitest run test/authoring/specStatusRules.test.ts test/ci/changelogLinks.test.ts && npm run test:records` |

### d9-upgrade-proof — a 1.14.0 tree upgrades through the current `sync` and `check`

| Field | Content |
|---|---|
| `id` | d9-upgrade-proof |
| `requirements` | REQ-PLUGIN-046 |
| `files` | `test/emit/upgradeFrom1140.e2e.test.ts` (new), `test/fixtures/release-1-14-0-tree/` (new: produced once by the released `@zomarit/stamity@1.14.0` `init --tools claude,cursor,copilot,codex -y`, kept to the files `sync` and `check` read and rewrite), `.stamity/change-classes.json` (`testInputs` for the new test) |
| `interfaces` | The test copies the fixture into a `mkdtemp` git repository, runs the built `dist/cli.js sync` then `check`, and asserts the exit codes and that every file the 1.14.0 tree held is either rewritten by the owner rules or left as the user's; a second variant adds the held `plugin` block |
| `testCriteria` | GIVEN the 1.14.0 fixture THEN `sync` exits 0, a second `sync` moves no byte, and `check` exits 0. GIVEN the variant with a `plugin` block THEN `check` exits 0 with `plugin-duplicates` = `warn`. GIVEN `testInputsGuard.test.ts` THEN green |
| `edgeCases` | The fixture exceeds the hygiene size budget → keep the manifest plus the files `sync` owns for two clients, and say which clients in the test's header |
| `depends_on` | d7-engine |
| `verify` | `npm run build && npx vitest run test/emit/upgradeFrom1140.e2e.test.ts test/ci/testInputsGuard.test.ts test/ci/repoHygiene.test.ts` |

## Inbox rows this file matched

`stamity ledger inbox --plan docs/plans/020-cli-native-01.md --paths <this file's paths>` matched 61 rows; with the
other three files, 84 unique rows. Each is folded, placed, or left with its reason (ids are the `Ref:` fragment).

| Ref | Disposition |
|---|---|
| `2026-09-17_plugin-lifecycle/prove/101` | fixed by the deletion: the plugin hook root exists only inside a plugin root (`d5`, `d7`) |
| `2026-10-03_pack-engine-defects` (the row on `src/emit/ownership.ts:139-160`) | fixed by the deletion: `d7` deletes the file and the mode |
| `2026-10-11_release-1-14-0/review/7` | fixed by the deletion: `d6` deletes `plugin.ts` |
| `2026-10-10_next-tier/review/21`, `review/23` | moot: already true at head (`src/adapters/copilot.ts:216-217`); closed when `e8` touches the file |
| `2026-10-11_release-1-14-0/review/5` | folded into `d8` (below) |
| `2026-09-17_plugin-lifecycle/prove/252`, `prove/296` | left; the lines they cite sit in the nightly's plugin half that `d3` deletes, so the close re-checks them as fixed by the deletion |
| `2026-10-11_release-1-14-0/close/4`, `close/6`, `close/7`, `close/8` | placed: to the docs package (Package 21) |
| `2026-10-11_release-1-14-0/fix/13`, `fix/14`, `review/51`, `review/65`, `fix/32`, `fix/33`, `review/36` (and `fix/25`, `fix/29`, `review/68` of the same cluster) | placed: re-dated `when: touched`, locations re-pinned |
| `2026-09-30_optimization-sweep/review/77`, `review/78` | left: charter-gate resolution and a Windows probe in `check.ts`, not this package's behaviour |
| `2026-10-03_pack-engine-defects/review/48`, `close/1`; `2026-10-11_release-1-14-0/review/30`, `build/20`, `review/31`, `fix/8` | left: pack behaviour, a later package's |
| `docs/plans/016-fork-distribution-02.md` (the `st` alias row); `2026-10-08_inbox-pass/pass/1`; `2026-10-11_release-1-14-0/close/2`, `close/3`, `build/39` | left: placed with plan 016's re-plan or decided there |
| `2026-10-08_maintainer-tooling/build/19` | left: its trigger is a website- or learnings-only pull request |
| `2026-10-10_next-tier/review/22`, `build/14` | left: a residual and a vendor-documentation trigger, not settled by this package |
| `2026-10-10_next-tier/build/44`, `review/87`; `2026-10-11_release-1-14-0/build/24` | left: each asks for a derivation test, not the retyped counts `d2` and `f9` write |
| `2026-10-10_next-tier/build/47`, `build/48`; `2026-10-11_release-1-14-0/spec/6`, `spec/8` | left: citation re-pins and eval merges outside the moved requirements |
| `2026-10-11_release-1-14-0/fix/22` | left: changes the look's return value, the re-dated cluster's design |
| `2026-10-11_release-1-14-0/build/13`, `build/14`, `build/16`, `build/17`, `build/23`, `close/12` | left: security-page design, a resolver test, a lockfile trigger, an old changelog entry, a per-row rule |
| `2026-10-13_records-branch/review/29` | left: placed with the docs package |

- Inbox fold into `d8` (`2026-10-11_release-1-14-0/review/5`): when `d8` drops the APM clause at
  `docs/specs/everyday-flows.md:1590-1591`, the sentence above it (`:1588-1589`) and its twin at
  `docs/specs/model-ladder.md:243` cite the live Copilot CLI 1.0.89 check instead of the documentation alone.

## Execution order

1. `d1`, `d2`, `d3`, `d4` in four worktree lanes at once: their files are disjoint. Each lane runs its own `verify`
   only, not the full suite: the deletion's intermediate trees are not green as a whole until `d7` lands (the plugin
   tests still read the deleted docs and workflows), so the full suite runs once on the integrated tree after `d9`.
2. `d5` → `d6` → `d7` → `d8` → `d9` in one integration lane, on top of the four lanes, in this order (`d5` and `d6`
   share `change-classes.json`; `d7` needs the verb gone; `d8` needs the final code).
3. A derived file that only one lane's sources feed is regenerated in that lane (`llms.txt` in `d4`, the capability
   matrix in `d5`, `docs/cli-reference.md` in `d6`); every other derived file is regenerated by the integration step,
   never by a lane: the dogfood copies (`npm run build && node dist/cli.js sync`) and the two golden snapshots (`npx
   vitest run test/emit/crossClientGoldens.test.ts test/corpus/emissionGoldens.test.ts --update`, the files first and
   the flag last), each diff read before it is committed.
4. Then typecheck, lint, knip, the full suite alone under the machine lock, `npm run check`, the dogfood check, the
   leak gate and the hygiene check, each read by its exit code. Files 2 and 3 start only on that green tree.

## QA walk

No person row: every behaviour here is proven by a committed test or a generated-and-diff check. The person's check
of the release notes' `Removed` wording rides file 4's walk.

## Risks

- **Warning** — a user who installs from `main` without a pin (`apm install zomarit/stamity`, a marketplace add of the
  repository) breaks at the merge, not the release: `main` loses the trees. Mitigation: the changelog and
  getting-started say so; the frozen `plugin-dist` branch and tags still resolve.
- **Warning** — the merge gate and the nightly lose CI's only real client-CLI installs. Mitigation: named in the
  changelog; a later package restores them on the repository route.
- **Warning** — forks that merge upstream conflict on `fork-release.yml` and `stamity.distribution`. Mitigation: the
  notice instead of a refusal, and `docs/enterprise-forks.md` says what to delete.
- **Minor** — the Windows shard balance (`vitest.config.ts:63-69`) was computed with the plugin tests in; re-measure
  after the first CI run on the PR.

## Open questions

None.

## Follow-ups (appended to `.stamity/inbox.md` when this plan lands)

- Minor · src/emit/hooksInfra.ts:110-120 · `hookScriptsRoot` and the adapters' container forms lost their only producer
  with the plugin route; remove them · source: /st-plan · Ref: docs/plans/020-cli-native-01.md · when: touched
- Minor · src/manifest/manifest.ts · the held `plugin` block and the `plugin-duplicates` warning outlive their one
  release; remove both, with a manifest migration step · source: /st-plan · Ref: docs/plans/020-cli-native-01.md ·
  when: the first release cut after 1.15.0

## Drop list

| Item | Revisit when |
|---|---|
| Renumbering the moved `REQ-PLUGIN` ids into `REQ-FORK`/`REQ-FLOW` | a spec reorganisation needs the ids to match their homes |
| A retired-spec allowance in the records gate, so the stubs can go | the committed plans naming the two specs are archived |
