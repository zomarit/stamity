---
id: plugin-lifecycle-03
intent: feature
stamp: ec6668d7e81fb9425f2c0838c949f560373e1166 2026-09-17
reads: [AGENTS.md, .github/workflows/ci.yml, .github/workflows/nightly.yml, .github/release-controls-checklist.md, .github/client-contracts.md, scripts/apm-install-smoke.mjs, scripts/qa/run.mjs, scripts/qa/form.mjs, scripts/qa/hook-runs.mjs, scripts/qa/bind.mjs, scripts/qa/fixtures.mjs, scripts/leak-gate.mjs, test/ci/apmInstall.test.ts, test/ci/apmDownstream.test.ts, test/ci/downstreamFixture.ts, test/ci/workflow.test.ts, test/cli/flows.e2e.test.ts, test/cli/dogfoodDist.e2e.test.ts, test/evals, evals/README.md, evals/SET-v7.md, evals/cases-v6, evals/coverage-exemptions-v6.md, content/skills/st-qa/SKILL.md, content/skills/st-eval-run/SKILL.md, docs/specs/apm-canonical-distribution.md, docs/enterprise-forks.md, .stamity/runs/2026-09-10_enterprise-downstreams/record.md, .stamity/runs/2026-09-16_package-14/record.md, .stamity/learnings, .stamity/inbox.md, CHANGELOG.md]
depends_on: [docs/plans/008-plugin-lifecycle-02.md]
---

# Plugin-backed distribution lifecycle — file 3 of 3: lifecycle proofs, private chain, eval, QA, release close

intent chosen: feature because net-new capabilities are named — the same routing as files 1 and
2, restated so this file stands alone. File 1 (`docs/plans/008-plugin-lifecycle-01.md`) builds the
roots, the runtime, the catalogs and the release workflow; file 2
(`docs/plans/008-plugin-lifecycle-02.md`) gives a repository the plugin-backed mode, the verb, the
effort scale and the documentation. This file proves the consumer lifecycle per client, rehearses the
private chain, extends the eval set and the QA form, and prepares the 1.9.0 candidate.

## Context

The request's acceptance target is a repository that adopts a pinned plugin, completes explicit
local setup, uses the supported workflows and upgrades through a reviewed version change without
duplicate components, lost customizations or a local source build — and it says manifest
generation alone does not count. The tree already knows what it cannot prove: the QA harness
measured Claude hooks headlessly at every 1.8.0 and Package 14 candidate while the Codex row stayed
`not-run` (headless codex loads no project hooks) and the Cursor and Copilot rows stayed `not-run`
(no binary on the maintainer's machine); the nightly headless drive is armed and not enabled; the
APM route is the one lane that reads a deployed tree rather than an exit code. The maintainer's
decisions of 2026-09-17 bind: headless proof where a route exists, human QA rows recorded as
performed or not-run elsewhere; a controlled private chain with the maintainer's fixture
repositories; everything ships as 1.9.0.

Research findings that shaped this file: every client now has a scripted route to at least
discovery — Claude (`claude plugin validate --strict`, `claude --plugin-dir … -p`), Cursor (the
`agent` CLI, `--plugin-dir`, `-p/--print`, installed by the vendor's shell installer rather than
npm), the Copilot CLI (`npm install -g @github/copilot`, `copilot plugin install ./root`,
`copilot -p … -s`), Codex (a local `.agents/plugins/marketplace.json`, `codex exec`); each needs the
client's own authentication for an invocation, so the invocation legs run where the credential is
(the maintainer's machine through the QA harness, and the nightly lane once a secret exists) and CI
runs the credential-free legs (validate, local install, deployed-tree comparison). The 2026-09-10
private APM proof is the shape of the private chain: a private package, a consumer, a real
Renovate run, a reviewed merge, transient credentials, owner-dependent items named as not done.

Dimension defaults assumed (recorded, not asked): the fixture versions for upgrade and rollback
are `1.9.0-fixture.1` and `1.9.0-fixture.2` built from the candidate with a version override and
pushed only to the maintainer's fixture repositories, never to the canonical branch; the QA form
gains one row per client for the plugin lifecycle (`H4a`–`H4d`) and one for upgrade and rollback
(`H5`), measured by a new `plugin-runs.mjs` lane in the harness; the eval additions land in
`cases-v6/` under `SET-v7.md`'s "What v7 adds" rule with the coverage gate reading them; the
release eval is the incremental run composed with the last full run under the incremental rule;
the human QA rows for Cursor's Customize view and Codex's `/plugins` view stay human.

The spec exists at `status: design` since 2026-09-17 with this frontmatter, intent and invariants
(the requirement paragraphs are the three files' delta sections): frontmatter
`id: plugin-lifecycle`, `status: design`, `obsolete_when: every supported client installs the corpus
through its own plugin container and the generated-setup route is retired`. Intent: ship the corpus
as a per-client plugin package that a consumer installs, pins, upgrades and rolls back through the
client's own container instead of copying generated files into the repository; the plugin owns the
portable content classes and carries its own runtime, while the repository keeps the files that
state facts about that repository — charter, gates, glob-scoped rules, MCP documents and local
state; the spec records observable requirements for generation, declaration, distribution, the
`stamity plugin` verb, the clean-then-setup route for a repository with a generated setup, and the proofs that each client discovers
and runs what was built. Invariants: one root per supported client under the built distribution
tree, generated from the resolved corpus and never hand-edited; two generator runs over one commit
are byte-identical; the plugin owns agents, skills, commands, hooks, and rules only where the
container carries rules, and a plugin-shipped body never writes a repository-owned file; no
credential or secret-shaped value enters a generated file, a catalog, a release artifact or a
recorded proof; an unresolved token or an unreadable runtime
fails closed with a named path and a non-zero exit, never a partial write; CLI-only installs, the
APM package bytes and the committed manifests stay byte-identical; a proof leg that could not run
is reported as skipped with its reason and never counted as a pass.

Out of scope for this file: the release cut itself (the tag, the publish approval, the record
re-sync run under `.github/release-controls-checklist.md` after the candidate is green — routine
steps under the maintainer's standing release authority), any enterprise-owned deployment
(recorded as owner-dependent), and telemetry.

## Spec delta

Stated against `docs/specs/plugin-lifecycle.md` (`status: design`; file 1 states the
allocation). This file ADDS REQ-PLUGIN-020–023 and REQ-PLUGIN-025. No existing requirement is
modified or retired.

### REQ-PLUGIN-020 Per-client install, discovery and invocation proof

Given each built root, When the client proof runs, Then the installed tree's per-file sha-256
listing equals the built root's listing for every carried class, the client's discovery output
lists the expected ids (`st-work` among the commands or skills, `stamity-reviewer` among the
agents where the client carries agents), and a scripted invocation returns the marker string the
case declares: Claude through `claude plugin validate --strict` exiting 0 and `claude -p` with
`--plugin-dir`; Cursor through `agent --plugin-dir <root> -p`; the Copilot CLI through
`copilot plugin install ./<root>` and `copilot -p … -s`; Codex through a local
`.agents/plugins/marketplace.json` entry and `codex exec`; each real-client leg runs only when
`STAMITY_<CLIENT>_BIN` names an executable and otherwise records `skipped: STAMITY_<CLIENT>_BIN unset`,
which the proof summary counts apart from passes and never reports as green; and the QA form's
rows `H4a`–`H4d` carry the same measurements with `performed`, `passed`, `failed` or `not-run` and
a reason.

### REQ-PLUGIN-021 Upgrade and rollback proof

Given two fixture versions of the distribution pushed to a fixture repository, When a consumer
installs the first, updates to the second and rolls back through each client's own route, Then
after the update the client's discovery lists the second version's marker id and the installed
`stamity-plugin.json` reports the second version, after the rollback the installed tree's per-file
sha-256 listing equals the first version's listing exactly, `stamity plugin status` exits 0 in all
three states with `compatibility.state: "compatible"`, and every repository-owned file's sha-256
is unchanged at every step; a client whose installed version offers no rollback command (Cursor
and Codex per the vendor pages of 2026-09-17, and Claude Code unless its CLI lists `rollback` at
execution time) records the reinstall-at-previous-pin route instead, and the QA row `H5` says
which route was walked per client.

### REQ-PLUGIN-022 Downstream-customized packages proof

Given the fork fixture of `test/ci/downstreamFixture.ts`, When the generator runs in that checkout,
Then each client root carries the fork's body bytes for every replaced id with 0 occurrences of the
upstream body for that id, the fork-only ids exactly once each under their bare directories, the
patched ids with the patch witness appended, the unmodified upstream ids byte-identical to the
unforked build, the root's `stamity-plugin.json` carries the fixture's `sourceCommit`, and the
catalog files carry the fixture's publisher and repository url with 0 occurrences of the canonical
url.

### REQ-PLUGIN-023 Controlled private chain proof

Given a private mirror repository holding the distribution tree (which is also an APM package),
a private catalog referencing it, one consumer repository on the plugin route pinned to
`plugins/v<A>` and one on the APM route depending on `<mirror>#plugins/v<A>`, When `plugins/v<B>` is
pushed and a real Renovate run processes both consumers — the plugin one with the shipped presets,
the APM one with Renovate's native `apm` manager — Then Renovate opens exactly one pull request per
consumer, the plugin one changing only the catalog `ref` (and the companion pin when configured)
to B and the APM one changing only `apm.yml` and its lock, merging and reinstalling upgrades each
consumer to B with discovery listing the B marker, pinning back to A restores trees whose per-file
sha-256 listings equal the A listings, a second Renovate run after the merges opens 0 pull requests, and the recorded transcript and every committed artifact
contain 0 matches for the leak gate's credential shapes; items the maintainer's fixture plan cannot
enforce (required-check enforcement on a private plan, the enterprise's own catalog approval) are
recorded as owner-dependent `Not done` lines, never as passes.

### REQ-PLUGIN-025 Eval coverage for the generated command and plugin-mode invocation

Given the eval set, When the release eval run executes, Then `cases-v6/` carries at least one
golden and one adversarial case for the generated `st-setup` command and at least one golden case
for plugin-mode invocation of a carried command, agent and skill under their namespaced forms,
each with its `source:` range, rubric and threshold declared under `evals/SET-v7.md` before the run;
`test/evals/coverage.test.ts` and `test/evals/locators.test.ts` exit 0 over the additions; the
committed run artifact under `evals/runs/` records a per-metric score at or above its threshold for
those cases; and a case that could not execute is recorded as blocked with its reason rather than
scored.

## Units

Batches: V1, V2, V3 and V5 in parallel once file 1's distribution builds and file 2's verb exists;
V4 after V2 (it reuses the fixture versions); V6 after V1–V5; V7 last. Every `verify` is the charter
gate plus the coverage flag CI enforces; V1 and V2 add the QA harness run. Contract census before
dispatch: `scripts/qa/form.mjs` `QA_ROWS` (V1 adds `H4a`–`H4d`, V2 adds `H5` — V1 lands first and V2
appends), `hook-runs.mjs` `CLIENT_RUNNERS` (V1 only), `nightly.yml` and `ci.yml` job maps (V1 only),
`evals/SET-v7.md` counts (V5 only), `CHANGELOG.md` (V7 only).

### V1 — per-client-route-proof (B1)

| Field | Content |
|---|---|
| `id` | v1-client-route-proof |
| `requirements` | REQ-PLUGIN-020 |
| `files` | `scripts/plugin-route-smoke.mjs` (new), `test/ci/pluginRoute.test.ts` (new), `scripts/qa/plugin-runs.mjs` (new), `scripts/qa/form.mjs` (rows `H4a`–`H4d`), `scripts/qa/run.mjs` (the `plugins` lane dispatch), `scripts/qa/hook-runs.mjs` (`CLIENT_RUNNERS.cursor` gains `binary: "agent"` with `args: ["-p", PROMPT]` and `CLIENT_RUNNERS.copilot` gains `args: ["-p", PROMPT, "-s"]`, each citing the vendor page and 2026-09-17; the module header's "no measured non-interactive invocation" sentence is rewritten), `.github/workflows/ci.yml` (job `plugin-route`: builds the distribution, runs the credential-free legs), `.github/workflows/nightly.yml` (the armed drive step gains the four invocation legs behind per-client secrets, still exiting 0 with a notice when absent), `test/ci/workflow.test.ts` (the lane map and the new job's pins), `.stamity/runs/2026-09-17_plugin-lifecycle/record.md` (new; the run record every unit of this file appends to) |
| `interfaces` | `node scripts/plugin-route-smoke.mjs --dist <dir> --client <csv> [--bin-claude <path>] [--bin-cursor <path>] [--bin-copilot <path>] [--bin-codex <path>] [--invoke]` — per client, in order: `structure` (the root's `stamity-plugin.json` parses; every `carried` class's file count equals the declaration; the container manifest validates against the vendored schema), `install` (Claude: `claude plugin validate --strict <root>` exit 0 and, when `--invoke`, `claude --plugin-dir <root> -p "<prompt>" --output-format stream-json --verbose` in a scratch repository; Cursor: `agent --plugin-dir <root> -p "<prompt>"`; Copilot: `copilot plugin marketplace add <dist>` then `copilot plugin install stamity@stamity` in a scratch `HOME`, then the deployed tree under `~/.copilot/installed-plugins/stamity/stamity` compared file by file with the root, then `copilot -p "<prompt>" -s` when `--invoke`; Codex: a scratch repository whose `.agents/plugins/marketplace.json` names `<dist>/codex`, then `codex exec "<prompt>"` when `--invoke`), `discovery` (the invocation transcript, or the client's list output where one exists, contains the marker ids `st-work` and, where agents are carried, `stamity-reviewer` under the client's declared invocation form from `stamity-plugin.json`), `invocation` (the prompt asks the client to run the plugin's `st-setup` command in the scratch repository; the leg passes when `.stamity/manifest.json` appears with `plugin.mode: "plugin-backed"` — the instrument is the file, never the model's reply, the `hook-runs.mjs` posture); result lines `plugin-route: <client> <leg> PASS|FAIL|SKIPPED (<reason>)` and exit 0 only when no leg failed, 1 on any failure, 2 when the smoke could not run; a client whose binary flag is absent records every client leg as `SKIPPED (STAMITY_<CLIENT>_BIN unset)`. `test/ci/pluginRoute.test.ts`: the structure leg always; the install and discovery legs `describe.skipIf(process.env["STAMITY_<CLIENT>_BIN"] === undefined)` per client. `ci.yml` job `plugin-route` (merge-blocking, added to the `all-ci-checks` aggregator): builds the runtime and the distribution, installs `@anthropic-ai/claude-code` and `@github/copilot` from npm and the Cursor `agent` from the vendor installer, exports the four `STAMITY_<CLIENT>_BIN` variables where an install succeeded, runs the smoke without `--invoke`; a client whose install fails in CI is a `SKIPPED` leg with the installer's stderr in the log, never a red job. `nightly.yml`: the same smoke with `--invoke` behind `ANTHROPIC_API_KEY`, `COPILOT_GITHUB_TOKEN`, `CURSOR_API_KEY`, `CODEX_API_KEY` secrets, each absent secret a notice. `plugin-runs.mjs` (QA lane): runs the smoke with `--invoke` against the local binaries and writes one row per client into the evidence JSON with the transcript hashes, so `H4a`–`H4d` are auto-proven where a binary and a credential exist and `not-run` with the binary probe's reason otherwise |
| `testCriteria` | the structure leg passes for all four roots on every CI leg; with `STAMITY_CLAUDE_BIN` set locally, `claude plugin validate --strict` exits 0 on the claude root and the `-p` transcript lists `stamity:st-work` (or `/stamity:st-work`) and `stamity:stamity-reviewer`; the Copilot deployed tree equals the root's sha-256 map; the Codex transcript lists `st-work` among discovered skills; a root with a deliberately removed `commands/st-work.md` fails the structure leg naming the class count; the QA harness run at the candidate writes `H4a` as `passed` (Claude, maintainer's machine) and each of `H4b`–`H4d` as `passed` or `not-run` with the probe's reason, never absent; the record cites every transcript hash |
| `edgeCases` | Claude's bare `/st-work` form: the transcript is searched for both the namespaced and the bare form and the record states which resolved (this measurement decides the inbox follow-up on corpus cross-references); a client that lists skills but cannot run `st-setup` headlessly (Codex, if `exec` refuses shell commands under its default sandbox) records the invocation leg as `not-run` with the sandbox reason and keeps the discovery pass; Windows: the smoke spawns binaries with `shell: false` and records the `.cmd` shim limit exactly as `hook-runs.mjs` does |
| `depends_on` | docs/plans/008-plugin-lifecycle-01.md, docs/plans/008-plugin-lifecycle-02.md |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/plugin-route-smoke.mjs --dist dist/plugins --client claude,cursor,copilot,codex` |

### V2 — upgrade-and-rollback-fixture (B1; parallel with V1)

| Field | Content |
|---|---|
| `id` | v2-upgrade-rollback |
| `requirements` | REQ-PLUGIN-021, REQ-PLUGIN-013 |
| `files` | `scripts/plugin-lifecycle-fixture.mjs` (new), `test/ci/pluginLifecycle.test.ts` (new), `scripts/qa/form.mjs` (row `H5`), `scripts/qa/plugin-runs.mjs` (the upgrade and rollback walk), `.stamity/runs/2026-09-17_plugin-lifecycle/record.md` |
| `interfaces` | `node scripts/plugin-lifecycle-fixture.mjs --out <dir> --versions 1.9.0-fixture.1,1.9.0-fixture.2 [--push <git url>]` builds two distribution trees from the candidate with `--version` overrides (the second adds one marker skill `st-fixture-marker` to a temporary `fork/` so discovery can tell the versions apart), commits each as an orphan commit in a bare fixture repository under `<dir>/remote.git` with tags `plugins/v1.9.0-fixture.1` and `plugins/v1.9.0-fixture.2`, and, with `--push`, pushes both to the maintainer's fixture remote; the consumer walk per client: install at `.1` (Claude: `claude plugin marketplace add <remote>#plugin-dist` then `claude plugin install stamity@stamity --scope project` in a scratch repository, which writes `.claude/settings.json`; Copilot: `copilot plugin marketplace add <remote>` and `copilot plugin install stamity@stamity`; Cursor and Codex: the local-path routes of V1 with the `.1` tree, because no pinned remote install is established), record the installed tree's sha-256 map, `stamity plugin status --json` through the locator, then update (Claude: `claude plugin update stamity`; Copilot: `copilot plugin update stamity`; Cursor and Codex: replace the local tree), assert the `.2` marker is discovered and `stamity-plugin.json` says `.2`, then roll back (Claude: `claude plugin rollback stamity` only when the installed client's `claude plugin --help` lists that subcommand — two reads of the vendor's CLI reference on 2026-09-17 disagreed on its existence — otherwise reinstall `.1` by re-adding the marketplace at the `.1` tag; Copilot: reinstall `.1` the same way, recorded as the reinstall route; Cursor and Codex: replace the local tree; every client's row names the route actually walked), assert the sha-256 map equals the `.1` map, and assert the repository-owned files' sha-256 map is unchanged at every step; results as `plugin-lifecycle: <client> <step> PASS|FAIL|SKIPPED` |
| `testCriteria` | the fixture builder produces two trees whose only differences are the version strings, `release.json`, the catalog `ref`s and the marker skill (asserted by a diff over the two roots); with `STAMITY_CLAUDE_BIN` set the Claude walk passes all three states and `claude plugin rollback` restores the `.1` map; the Copilot walk passes with the reinstall route recorded; the Cursor and Codex walks pass by tree replacement with the route named in the row; `plugin status --json` reports `compatible` in all three states; `H5` is written by the harness with the walked route per client |
| `edgeCases` | Claude's project-scope install rewrites `.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`) — that is the client's own explicit install write, asserted as the only change outside `~/.claude`; auto-update stays off for the fixture marketplace (third-party default) and the walk asserts no version change between the install and the explicit update; a `rollback` on a client version below 2.1.268 has no `--json`, so the walk reads `stamity-plugin.json` instead of the command's output |
| `depends_on` | docs/plans/008-plugin-lifecycle-01.md, docs/plans/008-plugin-lifecycle-02.md |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/plugin-lifecycle-fixture.mjs --out /tmp/lifecycle --versions 1.9.0-fixture.1,1.9.0-fixture.2` |

### V3 — downstream-customized-packages (B1; parallel)

| Field | Content |
|---|---|
| `id` | v3-downstream-packages |
| `requirements` | REQ-PLUGIN-022 |
| `files` | `test/ci/pluginDownstream.test.ts` (new), `test/ci/downstreamFixture.ts` (the fixture gains a `stamity.distribution` block with publisher `acme` and repository `https://github.com/acme/stamity-private` in its `package.json` copy, and `EXPECTED_PLUGIN_FILES`, the per-client oracle of the same shape as `EXPECTED_PRIMITIVES`), `.github/client-contracts.md` (one sentence: downstream roots carry the fork's identity) |
| `interfaces` | the test calls `downstreamCheckout(root)` then runs `scripts/build-plugin-distribution.mjs --out <root>/dist/plugins --runtime <runtime built once per suite>` as a child process from the fixture checkout and asserts `EXPECTED_PLUGIN_FILES`: for each client, `[path, body]` pairs — e.g. `claude/agents/stamity-add-agent.md` → `\nFork add agent.\n`, `claude/agents/stamity-replace-agent.md` → `\nFork replace agent.\n`, `claude/agents/stamity-patch-agent.md` → `\nOriginal patch-agent.\n\nPatch witness agent.\n`, `cursor/rules/stamity-patch-rule.mdc` (body after the head) → the patched body, `claude/skills/add-skill/references/own.txt` → `Replacement companion.`-style witness bytes, `claude/skills/st-replace-skill/SKILL.md` without `upstream.txt` beside it; plus `stamity-plugin.json.sourceCommit` equal to the fixture checkout's `HEAD` (the fixture is `git init`ed with one commit), the Claude marketplace's `owner.name` equal to `acme` and `plugins[0].source.url` equal to `https://github.com/acme/stamity-private.git`, and a grep over the whole tree for `zomarit` returning 0 hits; the unforked build (the same script over the real checkout) is compared for the untouched ids byte for byte |
| `testCriteria` | every oracle pair matches; the consumer-only override under `.stamity/overrides/` of the fixture never appears in any root; a case-collision fixture (`fork/agents/Add-Agent.md` beside `add-agent.md`) is refused by the generator with exit 1 naming both paths; a symlink under `fork/skills/` is refused; the fixture checkout renamed to `@acme/stamity` with `private: true` passes `npm test` and the tarball smoke (the audit's A2 fixes, exercised on the route the enterprise will use) |
| `edgeCases` | a fork with no `fork/` directory produces the unforked build byte for byte; a fork publisher whose `repository.url` is on a non-github host gets `git-subdir` catalogs with that url and no `github` source |
| `depends_on` | docs/plans/008-plugin-lifecycle-01.md |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### V4 — private-chain-rehearsal (B2; after V2; maintainer-run)

| Field | Content |
|---|---|
| `id` | v4-private-chain |
| `requirements` | REQ-PLUGIN-023 |
| `files` | `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` (new: the rehearsal record, credential-free), `.stamity/runs/2026-09-17_plugin-lifecycle/renovate-consumer.json` (new: the consumer's `renovate.json` as used, with the private repository named by a placeholder owner), `docs/plugins.md` (the `## Private catalogs and Renovate` section's example block is copied from this run — file 2's C7 owns the page; this unit hands C7 the block through the record) |
| `interfaces` | the walk, in order, each step with its command and its observed output hashed into the record: (1) mirror `plugin-dist` at `plugins/v1.9.0-fixture.1` into the maintainer's private fixture repository (`git push <private> plugins/v1.9.0-fixture.1:refs/tags/plugins/v1.9.0-fixture.1` and the branch), (2) a private catalog: the mirror's own `.claude-plugin/marketplace.json` and `.github/plugin/marketplace.json` rewritten with `stamity.distribution.repository` pointing at the private url (the same script, run in the mirror with a `package.json` carrying the private identity — V3's route), (3) two consumer repositories pinned at `.1`: one on the plugin route (the Claude project-scope route, `extraKnownMarketplaces` naming the private repository, `enabledPlugins`, `plugin setup` run, `check` green) and one on the APM route (`apm.yml` depending on `<private owner>/<mirror>#plugins/v1.9.0-fixture.1`, installed with `apm install` under the same personal access token — the route proven on 2026-09-10, now against the same mirror and tag series), (4) push `.2` to the private repository, (5) a real Renovate run (the self-hosted `renovate` npm package at the version current on the day, with a personal access token in the environment only) over both consumers — the plugin consumer with `renovate.json` `{ "extends": ["github><private owner>/stamity//renovate/plugins.json", "github><private owner>/stamity//renovate/companion.json"] }`, the APM consumer with Renovate's native `apm` manager and the `versioning: "semver"` package rule `docs/enterprise-forks.md` already documents, (6) assert exactly one pull request per consumer: the plugin one touching only the catalog `ref` lines (and the companion pin when declared), the APM one touching only `apm.yml` and its lock, (7) merge, reinstall (`claude plugin update stamity`), assert the `.2` marker is discovered and `plugin status` reports `compatible`, (8) pin back to `.1` (edit the `ref`, `claude plugin rollback stamity`), assert the sha-256 map equals the `.1` map, (9) a second Renovate run opens 0 pull requests, (10) run `scripts/leak-gate.mjs` over the record directory and the consumer checkout and assert 0 hits; (11) in the private mirror, run `node scripts/upstream.mjs integrate` against the next upstream tag with a consumer manifest carrying `ruleDelivery`, and delete the update pull request once so the recovery path rebuilds it — both succeed (the audit's A1 fix, exercised on the route the enterprise will use); items the fixture plan cannot enforce (required checks on the private plan, an enterprise catalog approval, network mirroring) are written as `Not done: <item> — owner-dependent` lines |
| `testCriteria` | the record carries every step above with its command, its exit code and the sha-256 of its captured output; the pull request number and the two tag names appear in the record; the leak gate over the record directory reports 0 hits; `docs/plugins.md`'s Renovate example equals the consumer's `renovate.json` byte for byte |
| `edgeCases` | Renovate's `github-tags` datasource needs the tags visible to the token — a token without `repo` read on the private mirror yields 0 updates, which the record names as the failure to look for; the Copilot CLI half of the private route is walked only for the marketplace add and install (its update path is the same command) and stated as such |
| `depends_on` | v2-upgrade-rollback |
| `verify` | `node scripts/leak-gate.mjs` (over the checkout with the record present) `&& npm run test -- test/ci/leakGate.test.ts` |

### V5 — eval-cases-and-release-run (B1; parallel with V1–V3)

| Field | Content |
|---|---|
| `id` | v5-eval-cases |
| `requirements` | REQ-PLUGIN-025 |
| `files` | `evals/cases-v6/golden/st-setup-fresh-repository.md` (new), `evals/cases-v6/golden/plugin-mode-invocation.md` (new), `evals/cases-v6/adversarial/st-setup-refuses-generated-setup.md` (new), `evals/SET-v7.md` ("What v7 adds" gains the three cases with their counts moved; the case index and the coverage table), `evals/coverage-exemptions-v6.md` (only if a plugin-only artifact needs an exemption — `st-setup` is generated, not corpus, so it is covered by the two cases naming its rendered source in `scripts/plugins/setupCommand.mjs`), `test/evals/coverage.test.ts` and `test/evals/locators.test.ts` (only if the locator rule needs to admit a `scripts/` source path — decide by running them first), `evals/runs/<date>-run-<n>/` (the release run artifact, produced by the manual harness session through the `st-eval-run` skill) |
| `interfaces` | each case follows the `cases-v6/` shape (frontmatter with `id`, `source:` path and line range, the inlined brief, `## Expected` with binding and advisory criteria): `st-setup-fresh-repository` — brief: a scratch repository with no `.stamity/`, the plugin root in the environment; expected: the transcript runs `plugin status --json` first, then `plugin setup --client <client> -y`, never `init`, and ends with a status summary naming the repository-owned files written; `st-setup-refuses-generated-setup` (adversarial) — brief: a repository with a generated setup; expected: the transcript shows the `plugin migrate` preview and stops for the operator, never `--apply`, never `init --force`; `plugin-mode-invocation` — brief: the operator asks for `/stamity:st-plan` on a small change; expected: the run spawns `stamity:stamity-researcher` (the namespaced agent) and cites the charter's `Verification gates` phrase rather than a `${STAMITY:` token. Thresholds: the SET-v7 rule unchanged (the two-class rule, the four metrics and their floors); the three cases join the golden and adversarial counts in `SET-v7.md` and the index. The release run: the incremental rule of `SET-v7.md` (`--prior-run <last full run>`, re-measuring the affected cases plus the three additions), prepared and exported through the private driver the `st-eval-run` skill names |
| `testCriteria` | `test/evals/coverage.test.ts` and `test/evals/locators.test.ts` exit 0 with the three cases; the calibration fixtures pass 5/5 before scores are admitted; the run artifact records the three cases at or above every floor, or a `blocked` disposition with the reason (a case that cannot run through the route of record is blocked, not scored); the artifact is committed under `evals/runs/` before the tag |
| `edgeCases` | the route of record drives Claude only, so the plugin-mode case measures the Claude namespaced form; Cursor, Copilot and Codex invocation stays a V1 measurement, stated in the case's brief; a red metric on the additions repairs the generated command's body (file 1's `setupCommand.mjs`) and re-runs the affected cases under the incremental rule |
| `depends_on` | docs/plans/008-plugin-lifecycle-01.md, docs/plans/008-plugin-lifecycle-02.md |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run test -- test/evals` |

### V6 — qa-checkpoint (B3; after V1–V5)

| Field | Content |
|---|---|
| `id` | v6-qa-checkpoint |
| `requirements` | REQ-PLUGIN-020, REQ-PLUGIN-021 |
| `files` | `.stamity/evidence/qa-<candidate sha>.json` (written by the harness), `.stamity/runs/2026-09-17_plugin-lifecycle/qa.md` (new: the walk-through table in the `st-qa` shape and the sign-off block), `.stamity/runs/2026-09-17_plugin-lifecycle/record.md` |
| `interfaces` | `node scripts/qa/run.mjs --site website/build --sha <candidate>` with the hooks lane and the new plugins lane; the walk-through table (seven columns, risk-sorted, minutes per row) derives from the triggers: user-visible surfaces (the four install routes, `st-setup`, `plugin status`, `plugin setup`), error paths (the locator's exit-2 messages, the setup refusal over a generated setup), config and migration (a clean first run and an upgrade over existing state — `H5`), security-adjacent (the leak gate over the distribution, the credential-shape refusal in the distribution block); auto-proven rows cite the evidence file's row hashes; the human rows are Cursor's Customize view install, Codex's `/plugins` view and per-hook `/hooks` trust, and the Copilot CLI's first-run authentication; the sign-off block states `Shippable: YES` or `NO` with the rollback path (`claude plugin rollback`, the reinstall routes, a repository cleaned with `stamity clean -y` before `plugin setup` is restored by `git checkout` of the removed files — stated in the row) |
| `testCriteria` | `H1a`–`H1d`, `H2`, `H3a`–`H3d`, `H4a`–`H4d` and `H5` are present in the evidence file with a status each; every human row is `performed` or `not-run` with a reason — no row is absent and no row is signed off without a walk or a stated non-performance (the pattern the Package 14 record names as the acceptance line it did not meet); the sign-off names the candidate sha |
| `edgeCases` | the harness reopens a `performed` row when its inputs move (`bind.mjs` carry-forward) — the candidate is re-measured after every fixer round; a client binary absent on the machine keeps its rows `not-run` with the probe's message |
| `depends_on` | v1-client-route-proof, v2-upgrade-rollback, v3-downstream-packages, v4-private-chain, v5-eval-cases |
| `verify` | `node scripts/qa/run.mjs --site website/build --sha <candidate> && npm run test -- test/qa` |

### V7 — release-candidate-and-close (B4; last)

| Field | Content |
|---|---|
| `id` | v7-release-close |
| `requirements` | REQ-PLUGIN-020, REQ-PLUGIN-025 |
| `files` | `CHANGELOG.md` (the `## [1.9.0] - <date>` section: Added — native plugin packages per client from one resolved corpus, the bundled runtime and locator, the distribution branch and release archives with `release.json` and Renovate presets, the `stamity plugin` verb with setup, status and migrate, plugin-backed mode in the manifest, explicit gate configuration, the plugins guide; Changed — `sigstore` is optional for the runtime, `check` gains two doctor rows, the Copilot and Codex client contracts re-read; Security — build-provenance attestations for the archives), `package.json` (version 1.9.0), the regenerated manifests (`node scripts/generate-plugin-manifests.mjs`, `node scripts/generate-apm-package.mjs`, `node scripts/generate-docs.mjs`, `node scripts/generate-capability-matrix.mjs`, `npm run build && node dist/cli.js sync`), every hand page's re-attestation stamp and `test/docsPages.test.ts` `RELEASE_CUT_DATE` (the checklist's fourth line), `docs/measurements.md` through `node scripts/merge-ready-rate.mjs --write` then `node scripts/generate-docs.mjs --page measurements` (the fifth line), `.stamity/runs/2026-09-17_plugin-lifecycle/record.md` (the closing entry: gates, harness, evidence, carried items, the `Not done` lines from V4), `docs/specs/plugin-lifecycle.md` and `docs/specs/model-ladder.md` (`status: shipped-with-1.9.0` at the close; both exist at `design` since 2026-09-17) |
| `interfaces` | the release checklist's five per-release lines, in order, each recorded in the record with its evidence: the eval artifact under `evals/runs/` (V5), the public metadata and admin roster review (console state, recorded as looked at), the hand-page re-attestation and the `RELEASE_CUT_DATE` move, the measurements refresh, and the private record re-sync after the tag (learning: release-close record re-sync); the candidate is green on `npm run check` locally and on every CI leg including Windows and the new `plugin-route` job, and the `release.yml` dry-run rehearsal summary names `plugin-dist` and `plugins/v1.9.0`; the tag and the publish approval follow under the maintainer's standing release authority and are not units here |
| `testCriteria` | `npm run check` exits 0 at the candidate; every CI leg is green; `node scripts/generate-plugin-manifests.mjs --check`, `node scripts/generate-apm-package.mjs --check` and the docs self-consistency step exit 0; the CHANGELOG section exists for `1.9.0` (the release workflow refuses a version without one); the record's closing entry cites the harness evidence at the final candidate sha and the run-24-style eval artifact; the `Not done` lines are present and name their owners |
| `edgeCases` | a fixer round after the harness moves the candidate: the evidence file is re-measured at the new sha and the record names both (the Package 14 pattern); the Windows leg exposes a path defect: fixed at the comparison seam, not skipped |
| `depends_on` | v6-qa-checkpoint |
| `verify` | `npm run check && node scripts/generate-plugin-manifests.mjs --check && node scripts/generate-apm-package.mjs --check` |

## Risks

- **Critical (mitigated by the decision of 2026-09-17, not blocking):** invocation legs need each
  client's credential and the vendor CLIs' current behaviour; a leg that cannot run is `SKIPPED`
  or `not-run` with the reason, never green, and the QA form carries the human rows. Mitigation:
  V1 separates structure, install, discovery and invocation so the credential-free legs gate CI.
- **Warning:** the Cursor `agent` CLI and the Copilot CLI have no vendor-stated rollback command
  (2026-09-17). Mitigation: V2 walks the reinstall route and names it in `H5` and in the guide.
- **Warning:** headless Codex proves discovery, never hook enforcement (learning). Mitigation: V1's
  Codex leg asserts nothing about hooks; the `/hooks` trust review stays a human row.
- **Warning:** the private chain needs a personal access token and the maintainer's fixture
  repositories. Mitigation: transient credentials in the environment only, the leak gate over
  every record, owner-dependent items written as `Not done`.
- **Warning:** the release eval run costs most of a five-hour usage window (the eval-run
  operations notes); the incremental rule keeps the release run to the affected cases plus three.
- **Warning:** Claude's namespaced invocation may leave the corpus's bare `/st-work` references
  unresolved. Mitigation: V1 measures both forms; the inbox row for client-neutral cross-references
  is executed before the cut only if the measurement shows the bare form failing.
- **Minor:** the fixture versions carry a prerelease suffix the Renovate tag regex ignores by
  design; the private chain's Renovate run therefore uses fixture tags without the suffix
  (`plugins/v1.9.0` and `plugins/v1.9.1` in the private mirror only), stated in V4's record.

## Open questions

None carried. The proof depth, the private-chain scope and the release sequencing were decided by
the maintainer on 2026-09-17 and are applied as written.
