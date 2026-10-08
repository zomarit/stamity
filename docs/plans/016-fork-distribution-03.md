---
id: fork-distribution-03
intent: feature
stamp: 88fcfd324c5efeb10c7508d4cfbc13389291c571 2026-10-01
reads: [.claude-plugin/marketplace.json, .claude-plugin/plugin.json, .cursor-plugin/plugin.json, .github/release-controls-checklist.md, .github/workflows/ci.yml, .github/workflows/fork-release.yml, .github/workflows/nightly.yml, AGENTS.md, CHANGELOG.md, CLAUDE.md, GOVERNANCE.md, README.md, apm.yml, docs/capability-matrix.md, docs/customization.md, docs/doctrine.md, docs/enterprise-forks.md, docs/enterprise-quickstart.md, docs/getting-started.md, docs/measurements.md, docs/plugins.md, docs/specs/enterprise-upstream-lane.md, docs/specs/plugin-lifecycle.md, docs/troubleshooting.md, evals/SET-v7.md, evals/cases-v6, evals/model-profiles-v1.json, evals/runs, llms.txt, package.json, plugin.json, renovate/companion.json, renovate/plugins.json, scripts/apm-install-smoke.mjs, scripts/build-plugin-distribution.mjs, scripts/build-plugin-runtime.mjs, scripts/ci/test-run.mjs, scripts/distribution-identity.mjs, scripts/eval/run.mjs, scripts/evidence-archive.py, scripts/evidence-summary.mjs, scripts/fork-identity.mjs, scripts/generate-apm-package.mjs, scripts/generate-capability-matrix.mjs, scripts/generate-docs.mjs, scripts/generate-plugin-manifests.mjs, scripts/hook-latency.mjs, scripts/leak-gate.mjs, scripts/merge-ready-rate.mjs, scripts/plugin-lifecycle-fixture.mjs, scripts/plugins/clients, scripts/plugins/managed-settings.mjs, scripts/plugins/releaseManifest.mjs, scripts/plugins/setupCommand.mjs, scripts/qa/bind.mjs, scripts/qa/form.mjs, scripts/qa/plugin-runs.mjs, scripts/qa/run.mjs, scripts/repo-hygiene.mjs, scripts/tarball-smoke.mjs, scripts/upstream.mjs, src/cli/docs/llmsIndex.ts, src/cli/docs/measurements.ts, src/cli/kit/packageName.ts, src/emit/ownership.ts, src/manifest/manifest.ts, test/ci/changelogLinks.test.ts, test/ci/docsRoster.test.ts, test/ci/docsSite.test.ts, test/ci/hookLatency.test.ts, test/ci/managedSettings.test.ts, test/ci/pluginDistribution.test.ts, test/ci/pluginLifecycle.test.ts, test/ci/repoHygiene.test.ts, test/ci/workflow.test.ts, test/cli/docs/llmsIndex.test.ts, test/cli/docs/measurements.test.ts, test/docsPages.test.ts, test/evals, test/qa/form.test.ts, test/qa/run.test.ts, test/records/specStatus.test.ts, test/upstream/fixtures.ts, test/upstream/lane.test.ts, website/sidebars.ts, .claude/agents, .claude/rules, .claude/settings.json, .claude/skills, .github/workflows/pack-signing-rehearsal.yml, .github/workflows/release.yml, .github/workflows/upstream-update.yml, .stamity/manifest.json, .stamity/overrides, .stamity/runs/2026-09-30_release-1-11-0/record.md, scripts/plugin-route-smoke.mjs, scripts/plugins/clients/copilot.mjs, src/detect/repoAnalyzer.ts, test/ci/forkIdentityScript.test.ts, test/ci/pluginPackages.copilot.test.ts, test/ci/pluginRoute.test.ts, test/cli/notice/updateNotice.test.ts, test/detect/repoAnalyzer.test.ts]
depends_on: [docs/plans/016-fork-distribution-00.md, docs/plans/016-fork-distribution-02.md, docs/plans/015-board-writes.md]
---

# Fork and distribution polish — file 3 of 4: docs, route proofs and the 1.12.0 release

This file is self-contained. It is the fourth of four `/st-plan` artifacts for **Package 20** (stamity's fork support
and its three distribution routes, end to end). It follows file 2 (`docs/plans/016-fork-distribution-02.md`, the three
routes), and it cuts the one release of the package, 1.12.0, which also carries Package 19 (`docs/plans/015-board-writes.md`),
Package 18 (`docs/plans/014-lean-repository-01.md`, `-02.md`) and the 1.11.0 ops-pack fix.

1.12.0 is taken by file 0's release (2026-10-07); a release this file names as 1.12.0 takes the next minor number when it runs.

intent chosen: feature because the request asks for the three routes to be documented, chosen between and rolled out
"as a feature and capability within the harness for future organizations", and for every route to be proved on the
release; no dependency moves, so the migration intent does not fire.

## Context

Files 1 and 2 make each route work; nothing yet tells an organization which route to take, how to roll it out per
client, how to reset a fork under protected branches, or which repository settings to apply. No page compares the
routes; `docs/enterprise-forks.md:1028-1030` names Cursor's team marketplace and Codex's workspace import as "the other
two organization routes" and leaves out Copilot's enterprise managed settings; three route facts in the docs went stale
on newer clients; and no tool reads every route's proof for one candidate and refuses to call an unrun leg green.

This file writes the docs (a route-selection page, the per-client rollout, troubleshooting, customization per route,
the reset, settings and constraints, the CLI pin and update paths, the quickstart last), adds the route-proof tool, and
cuts 1.12.0 with one fresh full eval run. **Out of scope:** the drop list, and any fleet service of stamity's own.

## Decisions

### The maintainer's walk (2026-10-01, through the question tool; every answer the recommended option unless the row says otherwise)

| Question | Answer |
|---|---|
| Where the package goes | Its own **Package 20**, after Package 11 track B and before Package 12, so Package 12 re-proves the final distribution once and its "nothing actionable left" close stays true. Order: Package 19 → Package 18 → Track B → Package 20 → Package 12. |
| The 1.11.0 ops-pack regression (`stamity add ops`, then `sync` fails on Cursor and on Codex alone) | Its own `/st-debug` run before Package 19, merged to `main` without a release; not in this plan. |
| Where each release's slim APM package lives | A folder of the distribution tree, fetched alone (`apm install <owner>/<repo>/apm#plugins/v<version>`); measured first, with an orphan tag as the fallback. |
| What APM alone can do, and how the CLI joins | APM alone works: every placeholder is filled at generation time and the charter rides through APM where a target can take it. A repository that also runs the CLI gets an `apm-backed` mode in which the CLI writes only the charter, hooks, MCP wiring and state, and `check` fails any class delivered twice. |
| How the package ships | **1.12.0 at its end:** one fresh full eval run (about 3.5 h unattended), QA and the tag. It also carries Packages 19 and 18 and the ops-pack fix. |
| Optional plugin items | **All four:** release channels with a verified promotion and a soak; `plugin setup --declare`; overrides in plugin mode; the review gate on every client. |
| Optional CLI and fork items | **`stamity upgrade` only.** Review reasons in `--json` and `release.json`, `stamity status --json` and a release on lane merge go to the drop list. |
| Accounts for live proofs | **VS Code with Copilot on the maintainer's machine only.** The Copilot organization install, the auto-update legs and Cursor's team marketplace stay `Not done:` with their owner. |

### What 1.11.0 already settled (no unit here)

- **Codex no longer grows the shared `AGENTS.md`.** 1.11.0 moved Codex's rules into a root `AGENTS.override.md`; with Codex selected `AGENTS.md` stays 5,330 bytes and the 25,360-byte override is read by Codex alone (measured 2026-10-01 with the released 1.11.0 CLI; at 1.10.0 the same fixture's `AGENTS.md` grew from 5,279 to 25,277 bytes).
- **Codex gets the nine touchpoint workflows** as shared `.agents/skills/` skills (`$st-<id>`).
- **`test/replay/fixture.test.ts` is gone** with the rest of the replay (`d5d3fee7`).
- **Owned by other packages:** the import without `--mirror`, the lane's release-tag-only fetch with the snapshot sweep, the nightly guard and the records move are Package 18 (`docs/plans/014-lean-repository-01.md`, `-02.md`); the paired with/without value evidence (brief Q5) is Package 11 track B.

### Settled by this plan (declared defaults; the maintainer may reverse any before the run starts)

| # | Default | Why |
|---|---|---|
| S1 | The route-selection page is hand-written, at `docs/choose-a-route.md`; its derivable half links the generated capability matrix instead of restating it. | Decision guidance and dated vendor facts about IDEs no adapter declares; a generated page would add a renderer and pins for no derivation gain. |
| S2 | A coverage cell names what reaches the surface, `not supported`, or `not documented (<page> read <date>)` when the vendor page is silent; never a guess. | The IDE rows rest on vendor pages the planning run could not all read. |
| S3 | the docs state, per client and route, what a hook does on a timeout, when Node is missing and when the guard crashes, measured at the unit's head on the release's tree (a timeout lets the action through on every client except Cursor's events marked `failClosed`; Claude Code's CLI-route guard denies on a launch failure; the plugin route's guard fails open; the others as measured after file 01's rework), and that hard limits belong in each client's own permission settings. (revised 2026-10-06; it read: "The docs say hooks fail open on a timeout, with the exception the capability matrix records".) | S3's one sentence ("fail open on a timeout, except Cursor's `failClosed`") is wrong for Claude Code's launch path (exit 2 on every call without Node, r6 M12) and for Copilot (any non-zero preToolUse exit denies, r3 C9.6). |
| S4 | No page types a host name; hosts are named in words (the hand-page domain rule, `test/docsPages.test.ts:410`). GitHub Enterprise Server and GitHub Enterprise Cloud with data residency stay on the drop list, one line each. | The docs test refuses bare domains in prose. |
| S5 | `u3-route-proofs` builds and rehearses the route-proof tool; the proof of record runs at the candidate inside `u3-release-1-12-0`, after the version bump, because the harness rows bind to the candidate's bytes. A CI leg's evidence is its run URL, job names and conclusions; a harness leg's is its row id, `rowHash` and reason (with the client version); a walk's is its signer and date. | The candidate exists only after the bump; a per-leg output digest exists only for harness rows. |
| S6 | The first promotion of 1.12.0 to `stable` is part of the release, approved by the maintainer. | The per-channel admin templates point at `plugin-stable`, which exists only after a promotion. |
| S7 | The live legs that need an account this project lacks — the Copilot organization install at sign-in, the auto-update legs, Cursor's team marketplace and Required plugins in the CLI — are recorded `Not done:` with their owner; the VS Code leg is walked by the maintainer. | The maintainer's answer on accounts. |
| S8 | 1.12.0 runs one fresh full eval run on the final inputs; amended specs keep their first-release status, and every spec still reading `design` that a shipping plan names (`docs/specs/board-writes.md` among them) flips to `shipped-with-1.12.0` before the tag. | `evals/SET-v7.md:820-823`, `:971-972`; 1.11.0's first release run failed on the shipped-spec check. |
| S9 | A `not-run` non-live route leg may ship named under `Not done:` on the maintainer's recorded decision (default: hold); a `failed` leg always holds the release and is fixed through the normal loop. | the criteria of REQ-PLUGIN-044: a `not-run` row names its cause and may stand under `Not done:` (invariant 4), while the checklist does not read green while a `failed` row stands. |
| S10 | The Copilot tag-move defect is its own unit (`u3-copilot-tag-move`, lane A before `u3-rollout-guides`), with its own requirement (REQ-PLUGIN-060). | It changes two generators and three shipped surfaces; a docs-only unit should not carry a product fix. |
| S11 | The settings guide recommends restricting the creation, update and deletion of `plugins/v*` tags with the release's deploy key as the only bypass (file 1's `u1-fork-release-hardening` adds the optional deploy-key push); a fork without the key restricts updates and deletions and is told the creation gap. | `GITHUB_TOKEN` cannot be a bypass actor (u2-channels-promote's research), and `fork-release.yml` pushes with it today (`:686`, `:746`); the merge chose the deploy key over documenting the gap (2026-10-06). |
| S12 | The Cursor CLI marketplace leg is walked after publish against `plugins/v<version>`; before publish it reads `not-done` and does not hold the cut. | The Cursor CLI indexes only a remote git URL under a signed-in account (help, 2026.10.01; `test/ci/pluginLifecycle.test.ts:106-107`); the candidate's tag does not exist before publish. A failure after publish is fixed in the next patch, never by moving the tag. |
| S13 | Codex's hook leg folds to `not-done` ("not provable headless") unless the harness ran it with the project `.codex/` layer trusted and it passed or failed. | Codex loads project hooks only for a trusted layer; `codex exec` ran none in every measured run (learning `codex-hooks-default-on-and-codex-exec-ran-none`). |
| S14 | The smoke tags each leg it skips for want of `--invoke` (`requires: 'invoke'`); the route proof claims every other leg. | Reading the claim off the smoke keeps one source for the credential boundary (the CI comment calls it the smoke's answer, `ci.yml:471-480`). |
| S15 | The route-proof JSON and the QA evidence reach the GitHub release by `gh release upload` after publish. | The canonical repository's releases are mutable today (D4-M9); attaching them from the workflow is a follow-up for when immutable releases are turned on. |
| S16 | The pin folder in the docs' examples is `tools/stamity/`. | A neutral path; the contract is root-only detection, not the folder's name. |

### The maintainer's walk on the updated brief (2026-10-06, through the question tool; every answer the recommended option)

On 2026-10-06 the enterprise sent an updated brief: the earlier items with fresh measurements on its fork (it has
since built a fleet rollout in its own orchestrator, tried it on disposable copies of two real canary repositories and
reviewed it in 19 automated passes; no repository carries stamity yet), eleven new items (C14, N6–N8, F11–F15 and the brief's S4 and S5; the brief's S-labels are not this plan's S-rows) and a sixth principle — the CLI is safe to run unattended next
to a token: offline unless asked, never interactive, kept away from the caller's credentials. Eight research passes
the same day re-measured every claim on `main` at `d10db029` (1.11.0 plus the pack-engine fixes of #77) in throwaway
repositories, mapped each to this plan, and re-read the vendor documentation. Five security defects of the released
1.11.0 surfaced that this plan did not cover. Then the maintainer answered:

| Question | Answer |
|---|---|
| When the security fixes run | **Their own run before Package 19:** the new file `docs/plans/016-fork-distribution-00.md` (file 0) holds the owned-path bound for the ledger, per-entry ownership of `.claude/settings.json` and the hook files (absorbing `u1-settings-key-ownership`), `check --expect-*` and registry-bound CLI calls for forks; one pull request to `main`, no release; the next release ships it (Track B's cut if Track B releases, else 1.12.0). |
| Fork items whose revisit triggers fired | **Build** F11 (the lane takes the package files: it resolves `package.json` and the lockfile from upstream plus the fork's identity and sets the next `-<suffix>.N`), F6 (a GitHub App token for the lane) and the brief's S1 (fork attestations, opt-in; the canonical release attests `release.json` and the tarball too; file 1's S19). **F3**, a release on lane merge, stays on the drop list. |
| Supply-chain additions | **Build** N2 (a published `npm-shrinkwrap.json`) and the brief's S5 + S4 (npm's sha512 integrity in `release.json` and a digest per client root, checked by the promotion; file 2's S18). **F13/F14**, publishing only the routes a fork uses, stays on the drop list. |
| New CLI behaviours | **Build** N7 (exit code 3, "re-sync needed", separating drift the owner's own changes cause from tampering), a per-file import mode with a config key (N1) and a JSON output contract (C1 part 1: a schema version and warning codes with a severity). **C1 part 2**, review reasons and release classification, stays on the drop list (inbox ``"review reasons in every write command's `--json`" at 077e8a78``). |

Every defect the research found is fixed whether or not a question asked about it. Terraform and HCL detection
(brief N1), `status --json` (C12) and the reusable check action (C11; its engine flags are built in file 0) stay on the
drop list with the rest of the 2026-10-01 drop list; the `st` bin is deprecated here and removed at 2.0.0.

### What the updated brief says that is wrong or already fixed (no unit)

- `sync --help` and the update banner no longer print `@latest` (1.11.0); the banner names the exact newer version,
  but compares it with the running CLI rather than the repository's pin (`u2-upgrade-verb`).
- The generated skills no longer call a bare `stamity` (`16555b1f`); the Copilot setup workflow reads `.nvmrc`,
  `.node-version` and `engines.node` (`84a87300`); the update notice asks a `--registry` fork's own registry
  (`test/cli/notice/updateNotice.test.ts:460`).
- The brief's S2: every `uses:` line in this repository's workflows is a full-SHA pin (71 references); only the generated Copilot
  workflow carries tags (`u1-copilot-setup-steps`).
- F6: the upstream lane uses no `step-security/harden-runner`; its six uses sit in canonical-only jobs of `release.yml`
  and `pack-signing-rehearsal.yml`.
- P5: the Copilot root has kept its hook configuration at `com.github.copilot/hooks/hooks.json` since `plugins/v1.9.0`.
- P13: Claude Code applies managed settings in interactive and `-p` runs alike, so no interactive first start is
  needed; anthropics/claude-code#83368 is an `autoUpdate` persistence bug, not a headless one (read 2026-10-06).
- P10: plugin hooks run in the Cursor CLI since 2026-06-22, not 11 August (Cursor CLI changelog, read 2026-10-06).
- P2 and D4: Copilot's enterprise managed settings are generally available since 2026-07-01 at
  `copilot/managed-settings.json` in the enterprise's `.github-private` repository, with the older
  `.github/copilot/settings.json` still read; the brief's "public preview" is the May 2026 state.
- F8: the four credential-shaped lines are `test/ci/forkIdentityScript.test.ts:325`, `:363`, `:378` and `:379`. F1's
  docs count is 43 lines on 6 hand-written pages, plus 6 in CONTRIBUTING, SECURITY and CODE_OF_CONDUCT and 1 in README.
- N4: three clients write 181 paths in an empty repository and 180 plus a changed `.gitignore` in a real one at the
  head — this plan's own figure, 9 more than the brief's 1.10 count.

### Facts this plan stated that moved by 2026-10-06

- apm-cli **0.33.0** (2026-10-02) is the current client, not 0.32.0. It shipped APM's native Codex hook shape
  (microsoft/apm PR #3060); Cursor's hook bug, microsoft/apm#3129, is still open, so the drop row on hooks and MCP
  through APM is half fired and stays.
- `check` runs fifteen doctor rows: #77 added `pack-reach` between `plugin-duplicates` and `invariants`.
- The four plugin archives are 5.65 MB at `plugins/v1.11.0`, not about 7.3 MB.
- Cursor runs every matching hook from `.cursor/hooks.json` and from `.claude/settings.json` (its Third-Party Imports
  are on by default, and the Cursor CLI cannot turn them off), so a repository set up for Claude Code and Cursor fires
  each stamity hook twice in Cursor today.
- Codex records hook trust against each hook's hash, so any version string in `.codex/hooks.json` makes every upgrade
  ask the user to trust the hooks again.

### Before this file runs

- **Files 0, 1 and 2 have merged** (`docs/plans/016-fork-distribution-00.md` before Package 19; `-01.md` and `-02.md` in two sessions each), and so have Package 19
  (`docs/plans/015-board-writes.md`, through its last unit `b6-dogfood-sync`) and Package 18 (through
  `docs/plans/014-lean-repository-02.md`'s `r7-remove-records-from-main`). `test -f scripts/records.mjs` decides which
  record mechanics the release steps use.
- **The eval configuration folder's login is not touched** from the eval run's start to its end (learning
  `an-account-switch-mid-run-ends-an-eval-run`).
- **The maintainer is available** for the start-of-session question batch, the VS Code walk, the QA checkpoint, the
  publish approval and the first channel promotion.

## Spec delta

This slice adds REQ-PLUGIN-043 and REQ-PLUGIN-044 to `docs/specs/plugin-lifecycle.md`, and REQ-UPSTREAM-022 and
REQ-UPSTREAM-023 to `docs/specs/enterprise-upstream-lane.md`, and modifies one non-goal of the plugin spec. Every
`path:line` was read at `88fcfd32`. The spec line ranges the MODIFIED entries cite, and the plan-internal `:line` cites in
the amendment paragraphs, were read at `88fcfd32` or before the 2026-10-06 merge and predate later spec growth; each change
is located by its quoted text, which is verbatim and unique. `/st-work` merges it at its Prove phase. `<date>` is the merge date and `<unit>` the
unit id; each entry names the units that implement it. The release unit (`u3-release-1-12-0`) cites the existing
REQ-PROVE-016 and defines nothing here.

Files 1 and 2 (`docs/plans/016-fork-distribution-01.md`, `-02.md`) and Packages 18 and 19 merge before this file. Where
they moved a cited line, the merging unit re-reads it at intake. Each `####` heading lands in its spec as a `###` heading
in that spec's own form, without the parenthetical. The ids were confirmed free by reading the four target specs whole
at `88fcfd32`; the repository-wide `rg` over `docs/` could not run in the drafting session, so the merging unit runs it
first.

### A. `docs/specs/plugin-lifecycle.md`

#### REQ-PLUGIN-043 The docs name the three routes, how to choose one, how to roll each out, and what each client gets (ADDED)

Added `<date>` (plan 016 file 3, units `u3-route-guide`, `u3-rollout-guides`, `u3-troubleshooting`,
`u3-customization-per-route`, `u3-cli-pin-update-paths` and `u3-quickstart`). The documentation covers the three routes —
native (the CLI and generated files), plugin, and APM — in five parts:

- **Choosing.** A new page compares the routes: what each delivers, its measured footprint, coverage per client and IDE
  (VS Code, Visual Studio, JetBrains, Eclipse, Xcode, Copilot CLI, Copilot cloud agent, Cursor IDE, CLI and cloud agent),
  how updates work, customization, credentials, admin work and the Node requirement. README, getting-started and the
  enterprise quickstart link to it.
- **Rolling out.** Per route, the organization steps: Claude managed settings (channels, auto-update, the strict opt-in,
  the first interactive start, `-p`); Copilot managed settings (`.github-private` → `copilot/managed-settings.json`); VS Code
  policies (`ChatPluginsEnabled`, `ChatEnabledPlugins`, `ChatExtraMarketplaces`, `ChatStrictMarketplaces`); Cursor's team
  marketplace on the channel branch; the Codex workspace import and its default-branch trap; private repository access;
  where review sits; auto-update risk answered by a canary channel and a soak; and that a hook that times out lets the
  action through — except Cursor's events marked `failClosed`, which deny — so hard limits belong in each client's
  permission settings.
- **Troubleshooting rows** for: Claude's first start under managed settings and its auto-update; the Codex `--ref` trap and
  per-hook trust; Copilot CLI trusted folders; the Cursor CLI starting without plugins; VS Code ignoring matchers; an
  override with no effect; APM doing nothing below 0.29.1; Renovate misordering prerelease tags.
- **Customization per route** in `docs/customization.md`: native, overrides work; plugin, overrides emitted with
  file 2's per-client precedence; APM, the fork layer only. Plus the client-side options: users' own skills and agents,
  disabling a plugin per workspace in VS Code and Cursor, and that Cursor's Required plugins cannot be uninstalled.
- **Pinning and updating the CLI:** an exact dev-dependency pin with and without `package.json`; private registries and
  the consumer's `@<scope>` mapping; the companion preset for suffixed versions; and the two update paths —
  `stamity upgrade` in a pull request from the organization's orchestrator (recommended), or Renovate `postUpgradeTasks`
  under the self-hosted `allowedCommands`, with its risk stated (those commands run with a token that can write
  workflows).

The enterprise quickstart's days 0 to 2 are updated last. Three stale facts are corrected, each against a dated source:
Claude's `plugin update` scope handling since 2.1.281 (`docs/plugins.md:392-394`); Codex hooks on by default
(`scripts/build-plugin-distribution.mjs:329-330`); managed `enabledPlugins` and auto-install (`docs/enterprise-forks.md:1104-1122`).
`docs/enterprise-forks.md:1028-1030`, which names Cursor's team marketplace and Codex's workspace route as "the other two
organization routes", gains Copilot's enterprise route.

- **Units:** `u3-route-guide`, `u3-rollout-guides`, `u3-troubleshooting`, `u3-customization-per-route`,
  `u3-cli-pin-update-paths`, `u3-quickstart` (last).
- **Evidence (before):** no page chooses between the routes; `docs/enterprise-forks.md:1028-1030` omits Copilot's GA
  enterprise route; the three stale facts above. A new page moves the docs pins: the sidebar, the llms index and
  `test/docsPages.test.ts` (learning `surface-pins-are-literals-that-drift`).
- **Proof:** `test/docsPages.test.ts`, `test/cli/docs/llmsIndex.test.ts`, the site build; each command block's
  provenance line under the plugin spec's provenance rule for command blocks.

Criteria:
- GIVEN the docs suite WHEN it runs THEN the new page passes every hand-page case and appears in the sidebar, `llms.txt`
  and the README map, and README, getting-started and the quickstart each link to it.
- GIVEN the new page's coverage matrix THEN it has one row per surface listed above and one column per route, and every
  cell names what reaches that surface, "not supported", or "not documented (<page> read <date>)", each with a dated
  source.
- GIVEN each route's rollout section THEN it names each item listed above for that route.
- GIVEN the troubleshooting page THEN it carries one row per symptom listed above, each with a cause and a remedy.
- GIVEN `docs/customization.md` THEN it states the behaviour of each route and the three client-side options.
- GIVEN the CLI pin section THEN it shows both pin forms and both update paths, and names the token risk of
  `postUpgradeTasks`.
- GIVEN every command block on the changed pages THEN it carries a provenance line naming the run it was copied from, or
  the vendor page and access date and the proof that will run it, as the plugin spec's provenance rule asks.
- GIVEN `docs/enterprise-forks.md` THEN no sentence says Copilot has no organization route, and the three corrected facts
  each cite their source with a date.

**Amended 2026-10-06 (the updated brief) — REQ-PLUGIN-043 The docs name the three routes, how to choose one, how to roll each out, and what each client gets (MODIFIED):**
Replaces text of this file's ADDED entry (`docs/plans/016-fork-distribution-03.md:95-152`):

- In **Rolling out** (`:105-111`): "Claude managed settings (channels, auto-update, the strict opt-in, the first interactive
  start, `-p`)" → "Claude managed settings (channels, auto-update, the strict opt-in, a managed entry replacing a project
  entry of the same name, settings applied in interactive and `-p` runs with the install in the background)"; "Cursor's
  team marketplace on the channel branch" → "Cursor's team marketplace on the channel branch, the Cursor CLI's
  `--git-ref` pin and `marketplace update`, and cloud agents that load no plugin hook and no session-start context"; and
  "and that a hook that times out lets the action through — except Cursor's events marked `failClosed`, which deny — so
  hard limits belong in each client's permission settings." → "and, per client and route, what a hook does when it times
  out, when Node is missing and when the guard crashes — Claude Code's CLI-route guard denies, its plugin-route guard
  fails open, Cursor's events marked `failClosed` deny, and the rest as measured on the release's tree — so hard limits
  belong in each client's permission settings."
- In **Troubleshooting rows** (`:112-114`): after "Renovate misordering prerelease tags" add "; setup refused over a
  secret-shaped line and how to find it; `check` drift after a `package.json` script or lockfile change; a hook that
  cannot start Node; generated files a `.gitignore` hides; a backup `sync` left beside an edited file".
- In **Customization per route** (`:115-117`): add "and what `stamity validate` reports per client on each install mode".
- In **Pinning and updating the CLI** (`:118-122`): after "the companion preset for suffixed versions;" add "a pin folder,
  with detection reading only the repository root as a contract; an install from the release asset with no registry
  token; the published shrinkwrap; the CI check with the approved release's expectations, its 're-sync needed' exit, no
  registry request and no credential beside the CLI;".
- The stale-facts sentence (`:124-126`) gains: "the Copilot refresh spelling and its tag move and rollback
  (REQ-PLUGIN-060); the Cursor CLI's pin and re-index (`docs/plugins.md:455-458`, `scripts/qa/form.mjs:154`); the Cursor
  team marketplace's branch (`docs/plugins.md:225`); Claude Code's managed settings in `-p` runs (vendor re-read
  2026-10-06); the Cursor CLI's plugin-hook date (2026-06-22)".
- Criterion "GIVEN the troubleshooting page THEN it carries one row per symptom listed above, each with a cause and a
  remedy." stays and now counts fourteen symptoms. New criteria: "GIVEN the rollout section's hook subsection THEN it holds
  one table row per client and route — Claude Code CLI route, Claude Code plugin route, Copilot CLI and cloud agent,
  VS Code, Cursor CLI route, Cursor plugin route, Codex — each naming the timeout, Node-missing and crashed-guard
  behaviour." and "GIVEN `docs/enterprise-forks.md` THEN `#### Install without a registry token` and `#### Check a consumer
  in CI` exist under `### Consume the release`, and the first shows `npm cache add` and `npm ci --prefer-offline
  --ignore-scripts`."

#### REQ-PLUGIN-044 Each route is proved on the release candidate (ADDED)

Added `<date>` (plan 016 file 3, unit `u3-route-proofs`). On the release candidate, each route is proved:

- **native:** the tarball smoke, and the generated files checked per client;
- **plugin:** the lifecycle walk, plus a VS Code load leg on the maintainer's machine;
- **APM:** the slim-ref smoke at 0.29.1 and 0.32.0, and the coexistence leg (file 2);
- **fork:** the fork CI job (file 1) green on the candidate.

A leg that could not run is never green. A live leg that needs an account this project does not have is recorded
`Not done:` with its owner: the Copilot organization-settings install at sign-in, the auto-update legs, and Cursor's team
marketplace and Required plugins in the CLI.

- **Units:** `u3-route-proofs`.
- **Evidence:** the accounts available are VS Code and Copilot on the maintainer's machine only; there is no Copilot
  Business or Enterprise organization and no Cursor Teams account (the maintainer's answer, 2026-10-01). The lifecycle walk
  already counts a skipped leg apart from passes (`docs/specs/plugin-lifecycle.md:809-811`), and the private-chain record
  names the Cursor team marketplace as not walked (`:1097-1100`).
- **After publish:** the release's first promotion moves `plugin-stable` to the release's distribution commit, approved
  by the maintainer, so the per-channel admin templates resolve.
- **Proof:** `scripts/qa/route-proof.mjs` and `test/qa/routeProof.test.ts`; the route proof record of the release run,
  where each leg carries the evidence its source can give — a CI leg its run URL, job names and conclusions; a harness
  leg its row id, `rowHash` and reason, with the client version; a walk its signer and date — and the QA form's rows.

Criteria:
- GIVEN the record THEN it names the candidate sha and carries one row per leg listed above, each `passed`, `failed`,
  `not-run` with its cause, or `Not done:` with its owner.
- GIVEN any leg that did not run THEN no summary line counts it as passed, and the release checklist does not read green
  while a `failed` row stands.
- GIVEN the three account-bound legs THEN each is a `Not done:` row naming its owner and the account it needs.
- GIVEN the record THEN the leak gate passes over it.
- GIVEN the release published THEN `plugin-stable` names the same commit as `plugins/v<version>` after the first
  promotion.

**Amended 2026-10-06 (the updated brief) — REQ-PLUGIN-044 Each route's proof is read on the release candidate, and a leg that did not run is never green (MODIFIED):**
Replaces text of this file's ADDED entry (`docs/plans/016-fork-distribution-03.md:154-186`); folds inbox ``"title and opening line say each route is proved" at 077e8a78``:

- The title "Each route is proved on the release candidate" → "Each route's proof is read on the release candidate, and a
  leg that did not run is never green" (S9 lets a `not-run` leg ship named under `Not done:`).
- "**native:** the tarball smoke, and the generated files checked per client;" → "**native:** the tarball smoke, the
  generated files checked per client, and the hook legs per client (`H1a`–`H1d`), Codex's recorded `Not done:` as not
  provable headless unless the project `.codex/` layer is trusted;"
- "**plugin:** the lifecycle walk, plus a VS Code load leg on the maintainer's machine;" → "**plugin:** CI's structure
  and credential-free install, read per leg from the smoke's report so a skipped leg it claims is `not-run`; the
  lifecycle walk; a VS Code load leg on the maintainer's machine; and, after publish, the Cursor CLI marketplace at
  `--git-ref plugins/v<version>`;"
- "**APM:** the slim-ref smoke at 0.29.1 and 0.32.0, and the coexistence leg (file 2);" → "**APM:** the slim-ref smoke at
  0.29.1 and the current apm-cli (0.33.0 on 2026-10-02), and the coexistence leg (file 2);"
- After "and Cursor's team marketplace and Required plugins in the CLI." add: "The record's JSON, with each client's
  version, is attached to the GitHub release."
- New criteria: "GIVEN a CI run whose `plugin route` job succeeded while a leg the smoke claims without an account was
  skipped THEN that route leg is `not-run`, never `passed`." "GIVEN the published release THEN its assets include the
  route-proof JSON and the QA evidence of the candidate."

#### Plugin spec — Non-goals (MODIFIED)

Replaces `docs/specs/plugin-lifecycle.md:1456`, "A fleet-management or update service of stamity's own (Renovate
proposes every update)." New text: "A fleet-management or update service of stamity's own. An update arrives as a pull
request: from the organization's orchestrator running `stamity upgrade` (the recommended path), or from Renovate
(REQ-PLUGIN-043)." (Amended `<date>`, plan 016 file 3, unit `u3-cli-pin-update-paths`; it read as quoted.)

#### REQ-PLUGIN-060 The Copilot CLI's pin, move and rollback are the commands the client accepts (ADDED)

Added `<date>` (plan 016 file 3, unit `u3-copilot-tag-move`). The Copilot CLI registers a marketplace name once: adding
`stamity` again at another ref is refused and leaves the ref where it was, and a marketplace with an installed plugin is
removed only with `--force`, which uninstalls it. Every place stamity prints the Copilot route — the distribution tree's
`README.md`, the Copilot root's `README.md` and `docs/plugins.md` — prints a pin, a move to another release and a
rollback as the same three commands, `copilot plugin marketplace remove stamity --force`,
`copilot plugin marketplace add <owner>/<repo>#plugins/v<version>` and `copilot plugin install stamity@stamity`, and the
refresh as `copilot plugin update stamity@stamity`, the spelling the client's help gives a marketplace plugin. It
supersedes the plugin-lifecycle spec's Copilot rollback sentence ("an uninstall-then-re-add rollback").

- **Units:** `u3-copilot-tag-move`.
- **Evidence (before):** `scripts/build-plugin-distribution.mjs:299-300`, `scripts/plugins/clients/copilot.mjs:244-256` and
  `docs/plugins.md:428-438` print uninstall, re-add, install, "not executed". Measured 2026-10-06 on GitHub Copilot CLI
  1.0.89 with scratch `HOME` and `COPILOT_HOME`: the re-add exits 1 (`Marketplace "stamity" already registered`) and the
  install then reinstalls the version it started from; `marketplace remove` without `--force` exits 1; remove `--force`,
  add, install moves `plugins/v1.10.0` → `plugins/v1.11.0` and back.
- **Proof:** `test/ci/pluginDistribution.test.ts`, `test/ci/pluginPackages.copilot.test.ts`, `test/docsPages.test.ts`; the
  walk re-run at the unit's head, in its run record.

Criteria:
- GIVEN a built distribution THEN its Copilot section's rollback block is exactly the three commands with
  `plugins/v<previous>`, its update line is `copilot plugin update stamity@stamity`, and it prints no
  `copilot plugin uninstall stamity` line.
- GIVEN the Copilot root's built README THEN it prints the same three commands and the qualified refresh, and no
  sentence saying the rollback was not executed.
- GIVEN `docs/plugins.md` THEN its Copilot pin, update and rollback paragraph prints the same three commands followed by
  a provenance line naming the Copilot CLI version and the walk's date.
- GIVEN the Copilot CLI on the execution day WHEN the walk runs in a scratch `COPILOT_HOME` against two published
  `plugins/v*` tags THEN the move and the rollback each end on the target version, and the run record keeps every exit
  code.

### B. `docs/specs/enterprise-upstream-lane.md`

#### REQ-UPSTREAM-022 — Resetting or re-importing a fork under protected branches is documented and fixture-tested (ADDED)

From plan 016 file 3, units `u3-reset-guide` and `u3-quickstart`. The guide carries a section, "Reset or re-import under
protected branches", for a fork whose rulesets block force-pushes. In order:

1. take a git bundle backup;
2. turn Actions off first, because the old lane keeps running and opens issues;
3. tag the old `main` as `legacy/main-<sha>`;
4. prune the lane's worktrees and `.stamity/upstream-work/`;
5. land a merge commit whose tree is the fresh tree, with the old `main` and the upstream tag as parents
   (`git commit-tree <fresh-tree> -p <old main> -p <upstream tag>`), so no force-push is needed and the lane reads the
   integrated version from history;
6. delete any `plugin-dist` branch and `plugins/*` tags an older `--mirror` import brought (Package 18 drops `--mirror`
   for new imports);
7. turn workflows on last;
8. confirm `status` reports `up-to-date`.

A fixture test runs the section's commands.

- **Units:** `u3-reset-guide`; `u3-quickstart` links it from day 0.
- **Evidence (before):** the guide has no reset section (research return, 2026-10-01); the enterprise reset of 2026-09-29
  landed such a merge commit and kept the lane's history; the manual rescue in the upstream-lane spec uses the same
  `commit-tree` with two parents (`docs/specs/enterprise-upstream-lane.md:234-237`).
- **Proof:** a test under `test/upstream/` over temporary repositories that runs the section's git commands, substituting
  `file://` remotes; `test/docsPages.test.ts`.

Criteria (an `#### Acceptance` subsection under the requirement, because they run the guide's commands rather than the
lane's verbs):
- GIVEN a fork fixture with history, a customization and an old lane state WHEN the section's commands run THEN the new
  `main` head is a merge commit whose tree equals the fresh tree and whose parents are the old `main` and the upstream
  tag's commit, and `refs/tags/legacy/main-<sha>` names the old `main`.
- GIVEN that head WHEN `node scripts/upstream.mjs status --json` runs THEN the outcome is `up-to-date` with the upstream
  tag as integrated.
- GIVEN a fixture carrying `plugin-dist` and `plugins/v1.0.0` from a mirror import WHEN the clean-up step runs THEN
  neither ref remains, and every `v*` tag and `main` survive.
- GIVEN a fixture carrying a fork-owned `plugins/*` tag whose object differs from the object of upstream's tag of the
  same name WHEN the clean-up step runs THEN that tag survives (`u3-reset-guide` testCriteria (h)).
- GIVEN the reset commit not yet on `origin/main` WHEN the step that turns workflows on runs THEN it exits non-zero with
  a message naming the merge-commit requirement and turns no workflow on; and GIVEN the reset landed with a merge commit
  WHEN it runs again THEN it turns workflows on (`u3-reset-guide` testCriteria (f)).
- GIVEN the section THEN no command in it force-pushes, and the step that turns Actions off comes before any push.

**Amended 2026-10-06 (the updated brief) — REQ-UPSTREAM-022 — Resetting or re-importing a fork under protected branches is documented and fixture-tested (MODIFIED):**
Replaces text of this file's ADDED entry (`docs/plans/016-fork-distribution-03.md:197-237`); folds inbox rows
`2026-10-01_pr73-review-round-1/review/10`,
``"block 1 disables all repository Actions before pushing the reset branch" at 077e8a78``,
``"fetching the upstream reset tag into a local tag of the same name fails" at 077e8a78`` and
``"block 1 deletes `plugin-dist` and the mirrored `plugins/*` tags right after pushing the reset branch" at 077e8a78``:

- Step 2, "turn Actions off first, because the old lane keeps running and opens issues;" → "turn the lane's workflow off
  first, because the old lane keeps running and opens issues — only that workflow, so the reset pull request's own checks
  run;"
- Step 5 gains: "the upstream tag is fetched into a scratch ref, so a fork's own tag of that name cannot block it;"
- Step 6, "delete any `plugin-dist` branch and `plugins/*` tags an older `--mirror` import brought (Package 18 drops
  `--mirror` for new imports);" → "once the reset has landed, and only then, delete the refs an import copied from
  upstream — `plugin-dist`, `plugins/*` tags, plain `v*` tags and branches whose head is upstream history — each only when
  its object is upstream's own; a refused deletion is reported and kept;"
- Step 7, "turn workflows on last;" → "turn the lane's workflow on last;"
- Criterion 1, "the new `main` head is a merge commit whose tree equals the fresh tree and whose parents are the old
  `main` and the upstream tag's commit" → "the `stamity-reset` head is a commit whose tree equals the fresh tree and whose
  parents are the old `main` and the upstream tag's commit, and after the pull request lands with a merge commit `main`
  contains it" (inbox `2026-10-01_pr73-review-round-1/review/10`).
- Criterion 3, "THEN neither ref remains, and every `v*` tag and `main` survive." → "THEN neither ref remains, upstream's
  plain `v*` tags and its branches are gone, and `main`, `legacy/main-<sha>`, the fork's own tags and the fork's own
  branches survive; before the reset lands, no ref is deleted."
- Criterion 6, "and the step that turns Actions off comes before any push." → "and the step that turns the lane's workflow
  off comes before any push, and no step turns all of Actions off."
- New criterion: "GIVEN a fork that carries its own tag named like the upstream reset tag WHEN the first block runs THEN it
  exits 0 and the reset commit's second parent is upstream's tagged commit."

#### REQ-UPSTREAM-023 — Recommended repository settings and enterprise constraints are documented (ADDED)

From plan 016 file 3, unit `u3-settings-constraints`. The guide lists the settings a fork should apply and the
constraints an enterprise imposes.

- **Settings:** tag rulesets for `v*` and `legacy/*` (restrict create, update and delete; block force-push); `plugins/v*`
  with a bypass for the release identity; `plugin-dist` and the channel branches restricted from deletion, while the
  release or promotion identity may force-push them; the `fork-release` environment's required reviewers and a deployment
  tag rule `v*-<suffix>.*`; immutable releases as the fork's tamper guard; merge commits allowed for lane landings.
- **Constraints:** allowed-actions policies, including "require full-length SHA pins"; the `workflows` permission that
  `copilot-setup-steps.yml` needs (file 1); GitHub Packages npm needs a classic token with `read:packages`, its
  visibility follows the repository, and a registry mirror is the alternative; hosts are github.com only.
- **Not built, said plainly:** GitHub attestations for a private fork need GitHub Enterprise Cloud (plan 010, D1).

- **Units:** `u3-settings-constraints`.
- **Evidence (before):** tag rulesets appear only in the canonical checklist (`.github/release-controls-checklist.md:93-129`);
  every repository workflow is SHA-pinned; the github.com-only refusals are at `scripts/distribution-identity.mjs:190-192`,
  `:306-310`, `scripts/fork-identity.mjs:113`, `:151` and `src/cli/kit/packageName.ts:182`. Immutable releases are GA
  since 2025-10-28; attestations on private or internal repositories need GitHub Enterprise Cloud (research return,
  2026-10-01).
- **Proof:** `test/docsPages.test.ts`, which pins the section's headings and the names it prints against the workflows
  that read them.

Criteria (an `#### Acceptance` subsection under the requirement):
- GIVEN the guide THEN it carries one settings row per item listed above, each naming the GitHub setting and the ref
  pattern it applies to.
- GIVEN every environment, variable or tag pattern the section names THEN `fork-release.yml`, `promote.yml` or the lane
  workflow reads it, and every such name those workflows read appears in the section.
- GIVEN the constraints list THEN it names the SHA-pin policy, the `workflows` permission, the `read:packages` token and
  the github.com-only host boundary, and links the guide's host-boundary paragraph.
- GIVEN the section THEN it states that attestations are not built for a private fork and why.

**Amended 2026-10-06 (the updated brief) — REQ-UPSTREAM-023 — Recommended repository settings and enterprise constraints are documented (MODIFIED):**
Replaces text of this file's ADDED entry (`docs/plans/016-fork-distribution-03.md:239-269`):

- **Settings**, "`plugins/v*` with a bypass for the release identity; `plugin-dist` and the channel branches restricted
  from deletion, while the release or promotion identity may force-push them;" → "`plugins/v*` restricted from updates
  and deletions, and from creation once the release pushes with an identity a ruleset can list; `plugin-dist` restricted
  from deletion; each channel branch restricted from creation, updates, deletions and force pushes, with the promotion's
  deploy key as the bypass;" and "the `fork-release` environment's required reviewers" → "the `fork-release` and promotion
  environments' required reviewers, at least two when Prevent self-review is on;"; add "the lane under a signed-commit
  rule (its merge commit and upstream's commits carry no signature); the lane's GitHub App with narrowed permissions".
- **Constraints**, after "including "require full-length SHA pins";" add "the one non-GitHub action the inherited
  workflows use, `step-security/harden-runner`, and how to allow or avoid it;"; "GitHub Packages npm needs a classic token
  with `read:packages`, its visibility follows the repository, and a registry mirror is the alternative;" → "GitHub
  Packages npm needs a classic token with `read:packages` (SSO-authorised), its visibility follows the repository, the
  fork release checks it, and the release asset installs with no registry token;".
- **Not built, said plainly**, "GitHub attestations for a private fork need GitHub Enterprise Cloud (plan 010, D1)." →
  "**Opt-in, said plainly:** a fork release's build attestations are opt-in and need GitHub Enterprise Cloud on a private
  or internal repository (file 1); npm provenance is for npmjs.org only."
- Criterion "GIVEN the section THEN it states that attestations are not built for a private fork and why." → "GIVEN the
  section THEN it states that attestations are opt-in, what they need, and the `gh attestation verify` command."
- New criteria: "GIVEN the section THEN the `plugins/v*` row names the creation rule exactly when `fork-release.yml`
  pushes the distribution with an identity a ruleset can list, and otherwise names the gap and `GITHUB_TOKEN`." "GIVEN
  the section THEN it names `step-security/harden-runner` with the SHA `release.yml` pins, and every App variable or
  secret the lane workflow reads."

#### REQ-UPSTREAM-030 — Upstream never moves a pushed release tag; a failed release is followed by the next patch (ADDED)

From plan 016 file 3, unit `u3-release-1-12-0`. A fork's lane fetches upstream's tags with a forced refspec
(`+refs/tags/*:refs/stamity-upstream/tags/*`, `scripts/upstream.mjs:1017`) and selects what it integrates from them, so a
tag that moves after a fork fetched it changes what that fork integrates with no record on upstream's side. Upstream
therefore never moves or deletes a pushed `v*` tag — a bypass actor of the `release-tags` ruleset included — and a release
run that fails after its tag push is followed by the next patch release, whose CHANGELOG section names the tagged,
unpublished version. The release-controls checklist (Control 2) and the enterprise-forks guide (`## Keep upgrades cheap
downstream`) state the rule; file 1's `movedTags` (its freshness requirement) reports a move should one happen anyway.

- **Units:** `u3-release-1-12-0`.
- **Evidence (before):** the 1.11.0 release run failed on the shipped-spec check after its tag push, and `v1.11.0` was
  re-pointed to the fix (`.stamity/runs/2026-09-30_release-1-11-0/record.md:6-7`); Control 2 gives a bypass actor the
  right to move a tag (`.github/release-controls-checklist.md:97-101`); this plan's release unit planned the same move.
- **Proof:** `test/docsPages.test.ts` (the checklist paragraph and the guide bullet); the 1.12.0 release record.

Criteria (an `#### Acceptance` subsection under the requirement):
- GIVEN `.github/release-controls-checklist.md` THEN its Control 2 section says a bypass actor never moves or deletes a
  pushed `v*` tag and that a failed release run is followed by the next patch, naming `scripts/upstream.mjs`.
- GIVEN `docs/enterprise-forks.md` THEN `## Keep upgrades cheap downstream` carries the bullet "Never move a pushed release
  tag" and its count sentence reads "These seven".
- GIVEN the 1.12.0 release THEN `git ls-remote origin refs/tags/v1.12.0` names the commit the release record's tag line
  names, and the record carries no tag deletion or re-push (`judgment: maintainer`).

## Units

Every `path:line` below was read at `88fcfd32`. Packages 19 (plan 015) and 18
(plan 014) and files 01 and 02 of this plan land before this file runs; each unit's first act is the freshness guard:
re-read every anchor it cites, and where an earlier package or file moved a line or already changed a claim, work from
the landed text and say so in the run record. No unit here touches `content/**`, so no dogfood sync runs and no eval
case `source:` range moves, except where `u3-release-1-12-0` repairs a range an earlier file left stale.

Hand-page rule used throughout (from `test/docsPages.test.ts:430-431`, `:862-938` and plan 014's `f1-import-recipe`):
a hand page edited between release cuts moves its first comment to the commit form
`<!-- HAND-WRITTEN PAGE — verified against the tree at commit <base7>. Re-attested <D>. -->`, where `<base7>` is the
commit the unit started from (a commit cannot name its own sha) and `<D>` is the session date; `REATTESTATION_DATE`
(`test/docsPages.test.ts:597`) must equal the newest commit-form date. `u3-route-guide` moves that constant to `<D>`; every
later docs unit stamps the same `<D>`; `u3-release-1-12-0` restamps the whole bucket to the 1.12.0 cut form. A hand page
names no host and links nowhere outside the tree except `https://github.com/zomarit/stamity/...`
(`ALLOWED_URL` `:407`, `BARE_DOMAIN` `:410`, checked at `:791-823`): a vendor source is named in words with its path and
access date, the style of `docs/plugins.md:119-134`. Every command block a unit adds carries a provenance line — the
client and version it ran on, or the vendor page, its access date and the proof that will run it (REQ-PLUGIN-024,
`docs/specs/plugin-lifecycle.md` "As built (2026-09-20)").

### u3-route-guide — a new page that helps an organization choose between the CLI, plugin and APM routes

| Field | Content |
|---|---|
| `id` | u3-route-guide |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/choose-a-route.md` (new); `website/sidebars.ts` (`:53`); `src/cli/docs/llmsIndex.ts` (`:15`, a new entry after `:151-157`); `llms.txt` (regenerated); `README.md` (`:1`, `:60-62`, `:114`, a new map row after `:122`); `docs/doctrine.md` (`:5`, `:121-122`); `docs/getting-started.md` (`:5`, `## Set stamity up` at `:34-43`, the glossary at `:385-405`); `docs/plugins.md` (`:5`, `## Move an existing setup` at `:501-523`); `scripts/qa/run.mjs` (`:68-88`, the `PAGES` list and its comment); `test/docsPages.test.ts` (`:33-34`, `:69`, `:117-138`, `:141-174`, `:309-335`, `:546-597`, `:779-784`, one new case in `describe("the guides")`); `CHANGELOG.md` (`## [Unreleased]`, `### Added`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** the tree after the unit, **when** `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/ci/docsSite.test.ts test/cli/docs/llmsIndex.test.ts test/qa/run.test.ts` runs, **then** it exits 0, the renamed case "all sixteen exist and carry real content" among the passes, together with "every sidebar-listed hand page declares its H1 as its title", "the doctrine page counts the hand bucket the way this suite does", "is reachable: every guide is in the agent-native index, and every mapped one on the map" and the new "the route guide covers every client and IDE on every route". **Given** `wc -l < README.md`, **then** it prints a number ≤ 160 and `README_MAX_LINES` reads 160. **Given** `node scripts/generate-docs.mjs --page llms`, **then** `git diff --exit-code llms.txt` exits 0 and `grep -c '](docs/choose-a-route.md)' llms.txt` prints 1. **Red checks, each run once and reverted:** with `'choose-a-route'` removed from `website/sidebars.ts`, the sidebar case fails naming `docs/choose-a-route.md`; with the llms entry removed, "is reachable" fails naming it; with the README row removed, "is reachable" fails naming it. **Given** the page's matrix section, **then** every one of its 39 cells (13 rows × 3 route columns) is non-empty, and every cell of the nine rows whose facts come only from vendor pages (VS Code with Copilot, Visual Studio, JetBrains IDEs, Eclipse, Xcode, Copilot cloud agent, Cursor CLI, Cursor cloud agents, Cursor Bugbot) carries a date `YYYY-MM-DD` — both asserted by the new case. **Given** every command block the page carries, **then** each is followed by an italic provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it prints its `PASS` line and exits 0. **Given** the pull request, **then** CI's docs-site build (`onBrokenLinks: 'throw'`) is green. **Given** the footprint commands the page prints, **when** re-run at the same commit, **then** they print the same counts. |
| `edgeCases` | A vendor page is unreachable on the execution day → that cell reads `not documented (<source in words> unreachable on <D>)`, never a guess, and the run record lists it. `README.md` would exceed 160 lines with the pointer sentence → re-wrap it inside `:59-62`'s existing lines, or leave `:60-62` unchanged and let the map row be README's link; the budget moves by the map row only, never more. The page links `[What reaches each client on each route?](customization.md)` and `[Choose a channel or a tag](enterprise-forks.md)` before the next two units write those headings → the links resolve to the pages meanwhile (the link check reads files, `test/docsPages.test.ts:810-821`), and lane A runs both units next. `docs/plugins.md`'s move-setup section was already rewritten by `docs/plans/016-fork-distribution-01.md (u1-clean-keeps-state)` → leave its text, add only the link to `## Switch routes`. `REATTESTATION_DATE` already reads `<D>` (another same-day pass moved it) → leave the constant, add no second TEST CHANGE paragraph. A record the page cites now lives on the `records` branch (plan 014 file 2) → link it as `https://github.com/zomarit/stamity/blob/records/<path>`. A host name such as `github.com`, `cursor.com` or a GitHub Enterprise host typed in prose → the hand-page case fails on `BARE_DOMAIN`; spell the source in words. |
| `depends_on` | docs/plans/016-fork-distribution-01.md (u1-clean-keeps-state), docs/plans/016-fork-distribution-02.md (u2-repo-file-waste and u2-apm-backed-mode and u2-apm-slim-package and u2-upgrade-verb and u2-channels-promote) |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/docsRoster.test.ts test/ci/docsSite.test.ts test/cli/docs/llmsIndex.test.ts test/qa/run.test.ts && node scripts/generate-docs.mjs --page llms && git diff --exit-code llms.txt && node scripts/leak-gate.mjs && npm run lint && npm run typecheck` |

`u3-route-guide` interfaces:

- **Decision: a hand-written page, slug `docs/choose-a-route.md`, frontmatter `title: Choose a route` equal to its H1
  `# Choose a route`.** Why hand-written: the page is decision guidance plus dated vendor facts about IDEs that no
  adapter declares. Its derivable half already renders in the generated `docs/capability-matrix.md` (`## Coverage at a
  glance` `:26`, `## Plugin containers` `:106`, `## Hook guarantee honesty` `:257`), which the page links instead of
  restating. A generated page would add a renderer, a byte-compare test, a CONTRIBUTING regeneration row and a
  `generatedPaths` entry in the fork guide's recommended configuration (`docs/enterprise-forks.md:297-303`) for no
  derivation gain. **Follows:** `docs/plugins.md:1-22` (frontmatter, the two-comment head, an opening paragraph naming
  the reader and the outcome) and the hand-page contract `test/docsPages.test.ts:846-860`.
- **Head, exactly this shape** (the first six lines after the frontmatter carry both comments, `:852`):
  `<!-- HAND-WRITTEN PAGE — verified against the tree at commit <base7>. Re-attested <D>. -->` and
  `<!-- Re-open when: a container's carried classes change (scripts/plugins/clients/*.mjs), the APM package's classes
  or the install modes change (scripts/generate-apm-package.mjs, src/manifest/manifest.ts), a footprint figure below is
  re-measured, or a vendor page behind a client or IDE row is re-read on a later date than the newest this page
  carries. test/docsPages.test.ts holds this page to the hand-page contract. -->` (with the paths in backticks).
- **Sections, these `##` headings exactly** (`u3-quickstart` links them by text, `test/docsPages.test.ts:2361-2376`):
  1. `## The three routes` — one table, header `| Route | What lands in the repository | What the client carries |
     How updates arrive | What it needs |`, rows: **CLI route** (`npx @zomarit/stamity init` writes every class into the
     repository; updates by `stamity upgrade --to <version>` in a pull request; needs Node 22.22.2+), **plugin route**
     (a client installs the plugin from a marketplace; the root carries agents, skills, commands and hooks and the
     engine; `/stamity:st-setup` or `/st-setup` writes the charter, the classes the root does not carry, MCP and
     `.stamity/`; updates through the client's marketplace on a channel; needs plugin support in the client, admin setup
     per client, Node), **APM route** (`apm install <owner>/<repo>/apm#plugins/v<version>` deploys agents, commands,
     rules and skills from the release's slim package, alone, or beside the CLI in the `apm-backed` install mode where
     the CLI writes only the charter, hooks, MCP wiring and state; updates by Renovate's `apm` manager; needs apm-cli
     0.29.1+, a token for a private repository). Facts from the landed files: the install mode values in
     `src/manifest/manifest.ts` (today `generated` and `plugin-backed`, `:1172`; `apm-backed` from
     `docs/plans/016-fork-distribution-02.md (u2-apm-backed-mode)`), the install spec in `release.json`
     (`scripts/plugins/releaseManifest.mjs:33,215-223`, moved by u2-apm-slim-package).
  2. `## Which route fits` — six one-line rules: every client the team uses reads plugins → plugin route; Copilot in
     Visual Studio, JetBrains, Eclipse or Xcode, or any client without plugin support → CLI route (repository files are
     what those surfaces read); the organization already ships agent content through APM → APM route, `apm-backed` when
     it also wants the charter, hooks and MCP; one repository or a trial → CLI route; a repository takes one install
     mode for every client (a per-client mode is on the drop list); a class APM and the CLI both deliver to one client fails `check` in every install mode; a repository copy of a class the plugin carries fails it under `plugin-backed` and warns under `generated` (file 02's decision S6; name the landed row).
  3. `## What each client and IDE gets` — one matrix, header `| Client or IDE | CLI route | Plugin route | APM route |`,
     13 rows in this order: Claude Code · Codex · Copilot CLI · Copilot cloud agent · VS Code with Copilot · Visual
     Studio · JetBrains IDEs · Eclipse · Xcode · Cursor IDE · Cursor CLI · Cursor cloud agents · Cursor Bugbot. A cell
     names the classes that reach that surface (charter, rules, agents, commands or prompts, skills, hooks, MCP) or reads
     `not supported` / `not documented`, each vendor fact with its dated source in words. **Known at drafting** (planning
     run, read 2026-10-01; each is re-read on the execution day): Claude Code CLI route — `CLAUDE.md` managed block,
     `.claude/` commands, agents, rules, skills, hooks in `.claude/settings.json`, `.mcp.json`
     (`docs/getting-started.md:159-164`, `docs/capability-matrix.md:131-162`); Claude plugin route — agents, skills,
     commands, hooks carried, `/stamity:<id>`, rules and MCP repository-owned (`docs/capability-matrix.md:115-120`);
     Codex — skills and hooks carried, agents, touchpoints (`$st-<id>` in `.agents/skills/`), rules and MCP
     repository-owned; plugin hooks need project trust and per-hook `/hooks` trust, re-trust after a hook changes; APM
     codex target deploys agents and skills only (`scripts/apm-install-smoke.mjs:23-30`); Copilot CLI — reads
     `AGENTS.md`, `.github/instructions`, `.github/agents`, `.github/prompts`, skills from `.github/skills/`,
     `.agents/skills/` and `.claude/skills/`, `.github/hooks/stamity.json` in trusted folders; plugins install at user
     level and project skills shadow plugin skills; it also reads `.claude/settings.json` (`enabledPlugins`,
     `extraKnownMarketplaces`, `hooks`); Copilot cloud agent — repository files, hooks read from the default branch
     (`docs/customization.md:349-352`), plugins from `.github/copilot/settings.json`, private marketplaces reported broken
     (GitHub community discussion 200387); VS Code — agent plugins behind `chat.plugins.enabled`, released as VS Code's agent-plugins page states on <D> (preview in the brief, generally available in the planning run's reading), hooks in preview with
     matchers ignored (stamity's hooks filter themselves from 1.12.0), reads `.github/instructions/**` and `.claude/rules`
     additively, skills from the three skills folders, repository `enabledPlugins` only a recommendation (vscode issue
     336858), private git-subdir updates fail (vscode issue 328856); Cursor IDE — `AGENTS.md`, `.cursor/rules/*.mdc`,
     touchpoints as `/st-<id>`, `.cursor/hooks.json`, team marketplace on Teams and Enterprise; Cursor CLI — reads
     `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`, plugin skills, commands, subagents and MCP (since March 2026) and plugin hooks (since 2026-06-22, Cursor CLI changelog read 2026-10-06); pins a marketplace with `agent plugin marketplace add <git-url> --git-ref <ref>` and re-indexes it with `marketplace update` (a signed-in account), plugin rules undocumented (hence repository-owned rules,
     `docs/plans/016-fork-distribution-02.md (u2-cursor-rules-bugbot)`), falls back to a session without plugins when
     loading is slow; Cursor cloud agents — `AGENTS.md`, committed skills and the command hooks of `.cursor/hooks.json`, but no `sessionStart` hook, so no learnings or handoff index on any route; no team-marketplace plugin loads (a known issue, Cursor forum 170280, 2026-09-02), so on the plugin route no stamity hook runs there, the guard included; Bugbot — the root `.cursor/BUGBOT.md`; `.cursor/rules/*.mdc` do not apply, and plugins are not mentioned (Cursor's Bugbot page, read 2026-10-06). **Unverified at drafting**, each with its probe on the execution day: which repository files
     Copilot reads in Visual Studio, JetBrains IDEs, Eclipse and Xcode (`AGENTS.md`, `.github/instructions/*.instructions.md`,
     `.github/prompts/*.prompt.md`, `.github/agents/*.agent.md`, skills folders, hooks) and whether any of them loads
     plugins — probe: GitHub's Copilot customization reference and its per-IDE support table, plus JetBrains' Copilot CLI
     agent page (June 2026); whether the Cursor CLI reads `.cursor/hooks.json` — probe: Cursor's CLI reference.
  4. `## How much each route writes` — a table of file counts, each with the command, the commit and the date. Measure in a scratch git repository committed before setup, with the built CLI (`npm run build` first), counting `git status --porcelain --untracked-files=all` after the command — `??` rows as paths created, ` M` rows as files changed: `node <repo>/dist/cli.js init -y --tools claude,cursor,copilot`;
     the same with `codex` added; each client alone; plugin-backed: `node <repo>/dist/cli.js plugin setup --client
     claude,cursor,copilot --plugin-root <dist>/claude --plugin-root <dist>/cursor --plugin-root <dist>/copilot -y` over a
     distribution built with the three lines of `docs/enterprise-forks.md:841-849`; APM alone: the deployed count
     `docs/plans/016-fork-distribution-02.md (u2-apm-sparse-measure)` recorded, cited with its date; APM-backed: the CLI's
     own files in `apm-backed` mode. The figures at `d10db029` — 181 paths for the three clients in an empty repository; 180 paths and a changed `.gitignore` in one holding `.gitignore`, `README.md` and `package.json` (measured 2026-10-06) — are history the page does not print; files 00–02 move them, and the page prints the execution-day counts.
  5. `## How updates arrive` — CLI: `stamity upgrade --to <version>` (refuses a changed client set without
     `--allow-client-change`, a downgrade without `--allow-downgrade`, a major jump without `--allow-major`), or the
     `renovate/companion.json` pin; plugin: the client's marketplace on a channel (`plugin-stable`, optional
     `plugin-canary`) that moves only through the verified promotion, or a fixed `plugins/v<version>` tag; APM: Renovate's
     `apm` manager with `renovate/apm.json`. Link `[Choose a channel or a tag](enterprise-forks.md)`.
  6. `## Customizing on each route` — three lines and a link to the heading `u3-customization-per-route` writes,
     `[What reaches each client on each route?](customization.md)`.
  7. `## Credentials and access` — npm: a scope mapped to the registry in `.npmrc`, a GitHub Packages registry needs a
     classic token with `read:packages`; plugin marketplaces: each machine's own git credentials, a Cursor team
     marketplace needs Cursor's GitHub App or "Serve marketplace from Cursor"; APM: `GITHUB_APM_PAT_<ORG>`, then
     `GITHUB_APM_PAT`, `GITHUB_TOKEN`, `GH_TOKEN` (`docs/enterprise-forks.md:805-811`).
  8. `## What an administrator sets up` — per route, one line each, linking
     `[Roll the plugin out to your organization](enterprise-forks.md)`.
  9. `## Node on every route` — the floor 22.22.2 (`package.json` `engines`); every hook runs `node`; a plugin root
     bundles the engine, not Node; APM alone needs no Node for its four classes, but `st-learn` and `st-handoff` report
     `Not done:` without a CLI; what a hook does when it cannot start Node differs by client and route — the table under [Hooks guide; permissions enforce](enterprise-forks.md) states it, and a guard that blocks names Node, the floor and the install remedy (`docs/plans/016-fork-distribution-01.md (u1-node-missing-hint)`).
  10. `## Switch routes` — CLI to plugin: `stamity clean -y` (keeps `.stamity/` state from 1.12.0; `--purge` removes it)
      then `stamity plugin setup --client <csv>`; plugin to CLI: `stamity clean -y`, then `init`; CLI to APM-backed: the
      steps u2-apm-backed-mode documents. Read the landed `clean` help (`node dist/cli.js clean --help`) first.
  11. `## Where to go next` — getting started, plugins, enterprise quickstart, customization.
- **The pins a new hand page moves** (learning `surface-pins-are-literals-that-drift`), each in this change:
  - `website/sidebars.ts:53`: `present(['getting-started', 'choose-a-route', 'working-with-stamity', 'plugins',
    'doctrine'])`.
  - `src/cli/docs/llmsIndex.ts`: after the getting-started entry (`:151-157`) add `{ path: "docs/choose-a-route.md",
    title: "Choose a route", description: "choosing between the CLI route, the plugin route and the APM route — what each
    puts in the repository and in each client, what each client and IDE reads, the footprint, how updates arrive,
    customization, credentials, admin work and the Node requirement.", regenerateCommand: null }`; the module comment
    `:15` "the twelve guides" → "the thirteen guides"; then `node scripts/generate-docs.mjs --page llms`.
  - `README.md`: a map row after `:122`, one line: ``| [`docs/choose-a-route.md`](docs/choose-a-route.md) | Choosing
    between the CLI route, the plugin route and the APM route — what each delivers, what each client and IDE gets, the
    footprint, updates and admin work. |``; `:114` "the twelve guides" → "the thirteen guides"; `:60-62` re-wrapped in
    place to end "…and the other two install routes, which [Choose a route](docs/choose-a-route.md) compares."; `:1` to
    the commit form.
  - `test/docsPages.test.ts`: path constant `const CHOOSE_A_ROUTE = "docs/choose-a-route.md";` placed first in the
    alphabetical block (before `:127`), with the block comment `:117-126` corrected to "the route guide sits first here
    and LAST there, the customization guide second here and SIXTH there"; `CHOOSE_A_ROUTE` APPENDED to `GUIDES`
    after `SECURITY_MAPPING` (`:173`) with a comment in the style of `:170-172` (appended so the ordinals the block
    comment names do not move); `:33-34` "fifteen … twelve guides" → "sixteen … thirteen guides"; `:69` "all fifteen" →
    "all sixteen"; `:141`, `:144` "twelve" → "thirteen"; the case name `:784` → "all sixteen exist and carry real
    content" and its comment `:779-783` gains ', "all sixteen" when the route guide did'; `README_MAX_LINES` `:335`
    159 → 160 with a paragraph in the form of `:330-334`: "TEST CHANGE, justified: 159 to 160, the cost of ONE more map
    row, on the same reasoning a fifth time. `docs/choose-a-route.md` is a new hand page (plan 016 file 3, unit
    u3-route-guide), so the map owes it a row. The `llms.txt` row's guide count moved from twelve to thirteen IN PLACE
    and paid for nothing."; `REATTESTATION_DATE` `:597` → `"<D>"` with a "TEST CHANGE, justified: MOVED <D>" paragraph
    naming the pages this pass re-read (the new page written; README, doctrine, getting started and plugins edited).
  - **New case** in `describe("the guides")`: "the route guide covers every client and IDE on every route" — take
    `sectionOf(read(CHOOSE_A_ROUTE), "## What each client and IDE gets")`; its first table's header row equals
    `| Client or IDE | CLI route | Plugin route | APM route |`; its first-column labels equal, in order, the 13 labels
    above; no cell is empty after trimming; and every cell of the nine vendor-only rows (VS Code with Copilot, Visual
    Studio, JetBrains IDEs, Eclipse, Xcode, Copilot cloud agent, Cursor CLI, Cursor cloud agents, Cursor Bugbot) matches
    `/\b20\d{2}-\d{2}-\d{2}\b/`.
  - `docs/doctrine.md:121-122`: "the twelve guides under `docs/`" → "the thirteen guides under `docs/`" and "holds all
    fifteen" → "holds all sixteen" (pinned at `test/docsPages.test.ts:2017-2027`); `:5` to the commit form.
  - `docs/getting-started.md`: first line under `## Set stamity up` (`:34`): "This page walks the CLI route.
    [Choose a route](choose-a-route.md) compares it with the plugin route and the APM route."; a glossary row
    `| route | one of the three ways stamity reaches a repository: the CLI route, the plugin route and the APM route. |`;
    `:5` to the commit form.
  - `docs/plugins.md:501-523` (`## Move an existing setup`): if it still says `clean` deletes the whole `.stamity/`
    (`:512-516`), rewrite it to the landed `clean` (engine-owned files removed, user state kept unless `--purge`) and
    link `[Switch routes](choose-a-route.md)`; `:521-523` "No release through 1.12.0 ships a migration engine" stays
    true and is kept; `:5` to the commit form.
  - `scripts/qa/run.mjs`: `PAGES` (`:79-88`) gains `{ route: '/docs/choose-a-route', file:
    'docs/choose-a-route/index.html' }`, and the comment (`:68-78`) "Eight, chosen…" → "Nine, chosen…" with the reason
    "the route guide, the release's widest hand-written matrix". The H2 and H3 rows then bind to that page
    (`scripts/qa/run.mjs` `pageHashes`); `test/qa/run.test.ts`'s fixture list (`:182-188`) is a subset and needs no move.
- **CHANGELOG** `## [Unreleased]` → `### Added`, house style: "**A page that helps you choose a route.**
  `docs/choose-a-route.md` compares the three ways stamity reaches a repository — the CLI route, the plugin route and
  the APM route: what each puts in the repository and in each client, what each client and IDE reads (Claude Code,
  Codex, the Copilot CLI and cloud agent, VS Code, Visual Studio, JetBrains, Eclipse, Xcode, and Cursor's IDE, CLI,
  cloud agents and Bugbot), the measured footprint, how updates arrive, what you can customize, the credentials and
  admin work each needs, and the Node requirement. README and getting started link it."

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** none beyond the unit's list; the new docs case gains the checks below.
- **interfaces, added:** *Vendor facts refreshed* — every cell below carries "(read 2026-10-06)" and is re-read on <D> (source: the vendor pages `vendor-facts.md` lists; a page unreachable on <D> keeps the 2026-10-06 reading with both dates):
  - **Claude Code:** a managed `extraKnownMarketplaces.<name>` takes `source` plus optional `autoUpdate`, `ref` and `sha` (a `sha` "skips updates even if `autoUpdate` is `true`"); a managed entry "replaces a lower-precedence entry with the same name, and the two entries' fields don't merge"; managed settings apply at session start in interactive and `claude -p` runs alike, and plugin installs run in the background (`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` waits for them); a project `.claude/settings.json` marketplace applies in `-p` only after the folder's trust was accepted interactively; `plugin update` finds the scope itself since 2.1.281, and 2.1.291's help says "restart required to apply" (D4-M10).
  - **Copilot CLI:** reads `.github/copilot/settings.json` and `.claude/settings.json` "for the shared cross-tool subset"; a repository-level `autoUpdate` is "accepted and ignored"; installs land in `~/.copilot/installed-plugins/<marketplace>/<plugin>`; a marketplace name is registered once (D4-M5).
  - **Copilot cloud agent:** installs the plugins `enabledPlugins` lists in the repository's `.github/copilot/settings.json`, and since 2026-07-27 the enterprise's managed settings reach it (GitHub changelog); reaching a private marketplace is undocumented.
  - **VS Code with Copilot:** agent plugins behind `chat.plugins.enabled`, marketplaces from `chat.plugins.marketplaces`, the four device policies; a repository declaration in `.claude/settings.json` or `.github/copilot/settings.json` is a recommendation shown "the first time a chat message is sent"; the Local harness ignores matchers; the release status of agent plugins as VS Code's agent-plugins page states it on <D> (the brief reads preview, the planning run read generally available since 2026-08-12; settle it there, inbox W10 of r6).
  - **Visual Studio, JetBrains IDEs, Eclipse, Xcode** (GitHub's customization cheat sheet): prompt files supported in Visual Studio, preview in JetBrains IDEs and Xcode, not in Eclipse; skills supported in Visual Studio, preview in JetBrains IDEs; hooks marked unsupported in all four. **JetBrains hooks** read "available but unproven": the cheat sheet marks them unsupported while JetBrains' changelog of 2026-06-02 moves hooks, skills and prompt files to general availability and begins a phased move to the Copilot CLI agent; no run here has seen a hook fire there.
  - **Cursor IDE:** Third-Party Imports are on by default and run every matching hook from every source — `.cursor/hooks.json` and `.claude/settings.json` among them — and load `.claude/skills/`, so a repository set up for Claude Code and Cursor fires each stamity hook twice in Cursor unless files 00–02 changed that (state the landed behaviour).
  - **Cursor CLI:** `agent plugin marketplace add <git-url> --git-ref <branch, tag or commit>` (CLI changelog 2026-07-13; help read on 2026.10.01, D4-M10), `list`, `update` (re-index) and `remove`; the marketplace commands need a signed-in account ("Authentication required", `test/ci/pluginLifecycle.test.ts:106-107`); plugin hooks run in the CLI since 2026-06-22; a slow plugin list opens a session without plugins (changelog date 2026-06-09 or 2026-07-06, unsettled); the IDE's Third-Party Imports toggle does not apply to the CLI, which has no key to turn them off; plugin rules in the CLI undocumented.
  - **Cursor cloud agents:** run the command hooks of `.cursor/hooks.json` but not `sessionStart`, `sessionEnd`, the MCP hooks, the Tab hooks or `workspaceOpen` (Cursor's hooks page), so on every route no learnings or handoff index reaches them; team-marketplace plugins do not load there (Cursor staff, forum thread 170280, 2026-09-02, a known issue), so on the plugin route a cloud agent runs no stamity hook, the guard included (SECURITY: the guard is absent there).
  - **Cursor Bugbot:** the root `.cursor/BUGBOT.md`; `.cursor/rules/*.mdc` do not apply to Bugbot runs; plugins are not mentioned.
  - **Codex:** hook trust is recorded against each hook's hash, so a changed hook is skipped until trusted again; project hooks load only when the project `.codex/` layer is trusted; `codex plugin marketplace add` without `--ref` reads the default branch.
  - **APM:** apm-cli 0.33.0 (published 2026-10-02) is the current client; hooks and MCP through APM stay unbuilt (Cursor's hook bug, microsoft/apm#3129, open on 2026-10-06).
- **interfaces, added:** *The footprint at the head.* Measured 2026-10-06 with the head's CLI (r1, and again D4-M1): `init -y --tools claude,cursor,copilot` creates 181 paths in an empty git repository; in one that already holds `.gitignore`, `README.md` and `package.json` it creates 180 and changes `.gitignore`. The section counts the way the brief does ("files created and `.gitignore` changed"): a fixture committed before setup, then `git status --porcelain --untracked-files=all` after the command — `??` rows are paths created, ` M` rows files changed. The table's header is `| Setup | Paths created | Files changed | Command | Commit | Date |`; its rows: the three clients in an empty repository and in a repository holding `.gitignore`, `README.md` and `package.json`; with `codex` added; each client alone; plugin-backed for the three clients; APM alone (u2-apm-sparse-measure's deployed count, cited with its date); `apm-backed` (the CLI's own files). The `d10db029` figures are the run record's "before"; the page prints the execution-day counts after files 00–02 land.
- **interfaces, added:** *Principle 2's deviations, said as choices.* One paragraph at the end of `## Which route fits` names what `check` does not count as a duplicate: one client reading another client's file (Cursor's Third-Party Imports of `.claude/`, Copilot reading `.claude/rules`), recorded as capability-matrix residue (file 02's S1 and S6); an override's project copy beside the plugin's own (Claude Code lists `/<id>` and `/stamity:<id>`, `u2-plugin-overrides`); and a repository copy of a class the plugin carries, which warns under `generated` (a repository mid-move keeps a green CI) and fails under `plugin-backed`.
- **testCriteria, added:** **Given** the new case "the route guide covers every client and IDE on every route", **then** it also asserts that the JetBrains IDEs row contains "available but unproven", that the Cursor cloud agents row contains `sessionStart`, that `## How much each route writes`'s first table has the header `| Setup | Paths created | Files changed | Command | Commit | Date |` with every Commit cell holding a 7–40-character hex sha (bare or in a code span) and every Date cell matching `/\b20\d{2}-\d{2}-\d{2}\b/`, that `## Which route fits` names `generated`, `plugin-backed` and `apm-backed`, and that `## Node on every route` links `enterprise-forks.md` (`test/docsPages.test.ts`). **Given** the footprint commands the page prints, **when** they re-run at the same commit in a fresh fixture, **then** `git status --porcelain --untracked-files=all` gives the same created and changed counts (the run record keeps both runs).
- **edgeCases, added:** VS Code's page states agent plugins' status differently on <D> from both readings → the cell quotes the page and its date, and the run record names the change. Files 00–02 changed Cursor's double hook firing → the Cursor IDE cell states the landed behaviour from a measured fixture (`init -y --tools claude,cursor`, then the two hook files read), never this cell's 2026-10-06 reading. A count the page prints differs from the run record's re-run at the same commit → the page is wrong; re-measure before the unit closes.

### u3-customization-per-route — the customization guide says what reaches each client on each route

| Field | Content |
|---|---|
| `id` | u3-customization-per-route |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/customization.md` (`:5-11`, `:320-324`, a new section before `:326`); `docs/enterprise-forks.md` (`:1028-1030` only); `test/docsPages.test.ts` (one new case in `describe("the guides")`); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** `docs/customization.md:320-324` says every override on the page is a CLI consumer override, that an APM author customizes `content/` or `fork/`, and that package generation does not read a consumer's override tree; `:326-371` (`## What does each client do with your override?`) lists client limits; the overlay table `:217-222` and override table `:42-47` are pinned by `test/docsPages.test.ts:2052-2075`. `docs/enterprise-forks.md:1028-1030` reads "Cursor's team marketplace and Codex's workspace route are the other two organization routes, and [the plugins guide](plugins.md) describes them under each client's install." **New section** `## What reaches each client on each route?`, inserted directly before `## What does each client do with your override?` (`:345` at `d10db029`). **1.** A table, header `\| Route \| Your overrides and patches \| Model pins (model.*) \| Installed packs \| A fork's fork/ layer \|` (spell the code in backticks), rows: CLI route — every class emitted per client, pins applied, packs installed, the fork layer resolved under your overrides; plugin route — overrides, patches and model-pinned agents emitted as project-level copies beside the plugin's own copy, with the precedence `docs/plans/016-fork-distribution-02.md (u2-plugin-overrides)` lands, pack skills exempt on every client; APM route — only the fork layer (APM generation reads `content/` and `fork/`, never `.stamity/overrides/`), and in `apm-backed` mode the CLI's own classes only. **2.** One line per client naming what the user invokes when an override and the plugin's copy both exist: Claude Code (plugin artifacts namespaced `/stamity:<id>`, the project copy under its bare id), the Copilot CLI (a project skill shadows the plugin's skill of the same id), VS Code (plugin skills prefixed `/<plugin>:`), Cursor and Codex as landed. Fill each line from a measured fixture, not from this cell: a scratch repository in plugin mode with one override per class, then `node <dist>/<client>/runtime/locate.mjs -- plugin status --json` and `node dist/cli.js check --json`, whose per-client reach report u2-plugin-overrides adds; the run record keeps both outputs. **3.** `## What can you change on the client side?` (a new `##` after the table section): your own skills and agents in each client's user folder (paths read from each vendor's page on the execution day, dated); turning a plugin off per workspace in VS Code and in Cursor (the vendor's control named in words, dated); and that a Cursor team-marketplace plugin set to Required cannot be uninstalled by a member. **4.** `:320-324` keeps its sentence and points at the new section. **5.** `docs/enterprise-forks.md:1028-1030` → "Copilot's enterprise managed settings, Cursor's team marketplace and Codex's workspace import are the other organization routes; the subsections below describe each." (`u3-rollout-guides` then writes those subsections.) **6.** Re-open trigger `:6-11` gains "or what reaches a client on a route changes (`src/emit/ownership.ts`, `scripts/generate-apm-package.mjs`)"; `:5` to the commit form; `docs/enterprise-forks.md:5` to the commit form. **New case** "the customization guide states what reaches each client on each route": `sectionOf(read(CUSTOMIZATION), "## What reaches each client on each route?")` is non-empty, its table's first column reads `CLI route`, `plugin route`, `APM route` (case-insensitive) and the client-side section names `Required`. **CHANGELOG** `### Changed`: "**The customization guide says what reaches each client on each route.** On the CLI route your overrides reach every client; on the plugin route they reach it as project-level copies beside the plugin's own; on the APM route only a fork's `fork/` layer does. The guide also names what you can change in the client itself." **Follows:** `docs/customization.md:296-324` (a question-form `##` heading, a table, then per-client prose). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "the customization guide's override tree and thresholds are the module's, not a copy" among the passes. **Given** `rg -n "the other two organization routes" docs/enterprise-forks.md`, **then** it prints nothing and `rg -n "Copilot's enterprise managed settings" docs/enterprise-forks.md` prints one line. **Given** the run record, **then** it keeps the `plugin status --json` and `check --json` outputs the per-client lines were written from, with the commit they ran at. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | u2-plugin-overrides landed a precedence that differs per client from the three named in the synthesis → the page states the landed behaviour, and the run record names the difference. A client's user-folder path is not on its vendor page → the line reads `not documented (<page> read <D>)`. A model pin cannot reach a plugin-carried agent on some client → the table cell says so; it is never left blank. |
| `depends_on` | u3-route-guide, docs/plans/016-fork-distribution-02.md (u2-plugin-overrides and u2-apm-backed-mode) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** `docs/customization.md` (`## What does taking a bundled id do?` `:172-175`). Anchors moved since `88fcfd32`: the CLI-consumer sentence the unit keeps is now `:339-343`, and `## What does each client do with your override?` is `:345`, so the new section goes directly before `:345`.
- **interfaces, added:** **7.** One paragraph after the table names `stamity validate` as the way a user reads it for their own repository. After file 02 (`u2-plugin-overrides`, which makes `validate` derive `emits` per client from the install mode, the plugin-owned classes and the reach entries; `u2-apm-backed-mode`, which reports an override of an APM-carried class as having no effect under `apm-backed`), `validate` says per client whether each override reaches it and why not when it does not. Before writing the paragraph, measure: one override per class (`.stamity/overrides/agents/reviewer.md`, a rule, a command, a skill) in three scratch repositories — `generated` (`init -y --tools claude,copilot`), `plugin-backed` (`plugin setup --client claude,copilot` over a built distribution) and `apm-backed` (a local APM package installed first, then `init --install-mode apm-backed`) — and run `node dist/cli.js validate --json` in each; quote the landed field names and wording; the run record keeps the three outputs. At `d10db029` the same plugin-backed fixture reported `{"outcome":"replaced","type":"agent","id":"reviewer","emits":true}` while `sync` wrote no `.claude/agents/` (r3, C8.1). **8.** `:172-175` ("All four classes emit: agents, rules and commands reach their clients through the residue planners, and skills reach them through the core projection.") becomes route-aware: on the CLI route all four classes emit that way; on the plugin route and under `apm-backed` the shadowing line says per client whether the override reaches it, and [What reaches each client on each route?](#what-reaches-each-client-on-each-route) says why.
- **testCriteria, added:** **Given** the case "the customization guide states what reaches each client on each route", **then** the section also names `stamity validate` and the three install-mode values `generated`, `plugin-backed` and `apm-backed`, and the sentence at `## What does taking a bundled id do?` that begins "All four classes emit" contains "CLI route" (`test/docsPages.test.ts`). **Given** the run record, **then** it keeps the three `validate --json` outputs with the commit they ran at.
- **edgeCases, added:** `validate` landed without a per-client field → the page states what the landed output shows, never a per-client report the CLI does not print, and the run record names the gap as an inbox row. An override of an APM-carried class under `apm-backed` → the APM row says it has no effect there and names the fork layer as that route's customization path.

### u3-rollout-guides — the organization rollout per client, and three stale facts corrected

| Field | Content |
|---|---|
| `id` | u3-rollout-guides |
| `requirements` | REQ-PLUGIN-043, REQ-PLUGIN-060 |
| `files` | `docs/enterprise-forks.md` (`## Roll the plugin out to your organization`, `:1023-1166`, and `:5-21`); `docs/plugins.md` (`:5-11`, `:216-228`, `:293-298`, `:386-396`, `:420-451`, `:566-573`); `scripts/build-plugin-distribution.mjs` (`:329-330`); `test/docsPages.test.ts` (`:2317-2344`, one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed` and `### Fixed`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts test/ci/pluginDistribution.test.ts test/ci/managedSettings.test.ts`, **then** it exits 0, including "the enterprise-forks guide's managed-settings block is the renderer's own output" (extended below) and the new "the rollout section gives every client its route and states the hook limit". **Given** the section, **then** each fenced `json` block in it deep-equals, key order included, the renderer call its preceding sentence names. **Given** `rg -n "is not optional on an install recorded in your repository" docs/plugins.md`, **then** it prints nothing once the probe below measured the scope as optional, or the sentence carries the probe's client version when it measured the scope as still required. **Given** a built distribution's `codex` section of `README.md`, **then** it no longer says hooks need `features.hooks = true`. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | file 02 renamed the managed-settings renderer or changed its options → the extended pin calls the landed signature (`scripts/plugins/managed-settings.mjs` exports, read at intake) and the blocks follow it. The Claude scope probe cannot run (no Claude Code, or no login needed but the fixture fails) → `docs/plugins.md:392-394` states the vendor changelog line with its date beside the 2026-09-20 measurement, and every command keeps `--scope project`, which both readings accept. A vendor fact for Copilot managed settings or VS Code policies changed since 2026-10-01 → the page states the re-read fact and date; the run record names the change. Codex workspace import cannot name a branch other than the default → the Codex subsection says the import follows `main`'s Codex catalog (the release tag) and that channels do not apply to Codex. |
| `depends_on` | u3-copilot-tag-move, docs/plans/016-fork-distribution-01.md (u1-node-missing-hint), docs/plans/016-fork-distribution-02.md (u2-admin-templates and u2-channels-promote and u2-declare and u2-main-catalogs and u2-hooks-self-filter-vscode and u2-review-gate-all) |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/pluginDistribution.test.ts test/ci/managedSettings.test.ts && node scripts/leak-gate.mjs && npm run lint` |

`u3-rollout-guides` interfaces:

- **Follows:** `docs/enterprise-forks.md:1023-1166` (the Claude rollout's own shape: a template block held to its
  renderer, then where the file goes, the first start, how it fails, what was measured) and `docs/plugins.md:112-134`
  (a command block, then its italic provenance line naming the client and version or the vendor page and date).
- **Current section.** `## Roll the plugin out to your organization` (`docs/enterprise-forks.md:1023`) is Claude-only:
  intro `:1025-1030` (rewritten first by u3-customization-per-route), the per-tag template block `:1039-1062`, the four
  keys `:1064-1074`, the mirror note `:1079-1085`, `### Put the file where the client reads it` `:1087`, `### Start Claude Code once on each machine` `:1104`, `### Know how the file fails closed` `:1124`, `### Know what was measured` `:1141`. **Pinned:** `test/docsPages.test.ts:2317-2344` takes `sectionOf(…, "## Roll the
  plugin out to your organization")`, parses its FIRST `json` block and requires it to equal
  `renderClaudeManagedSettings(identity, { ref })` with the ref read from the block (`scripts/plugins/managed-settings.mjs`,
  imported at `:30`). The heading text stays, and so does a per-tag Claude block as the section's first `json` block.
  `u3-quickstart` links `Roll the plugin out to your organization` and `Start Claude Code once on each machine` by text,
  so both texts stay (their level may change).
- **New subsections, in this order** (`###` unless noted; these texts exactly, because `u3-quickstart` links
  `Choose a channel or a tag`):
  1. `### Choose a channel or a tag` — the channels the release keeps in `stamity.distribution.channels` (default
     `{ stable: "plugin-stable" }`, optional `canary`) move only through the promotion workflow behind an environment
     with required reviewers, after it verified the tag's orphan commit message `plugins: v<version> from <sha>`,
     `release.json`'s version and every archive's `.sha256`; `soakDays` (default 0) holds a promotion until the tag is
     that old, and the page recommends at least three days on canary before stable; rollback is promoting the previous
     tag; `plugins/v<version>` is the fixed pin; `plugin-dist` always carries the newest release and is not a channel.
     Facts from the landed `scripts/promote-channel.mjs` and `.github/workflows/promote.yml`
     (`docs/plans/016-fork-distribution-02.md (u2-channels-promote)`).
  2. `### Claude Code: managed settings` — the per-tag block first (the pin above), then the per-channel block
     (`autoUpdate: true`, `ref` = the channel) and a sentence naming the strict-allowlist opt-in and its fail-closed
     warning; then the four existing subsections, demoted to `####`. Add: (a) a managed entry replaces a project entry of the same name; (b) the vendor's statement that managed settings apply in interactive and `claude -p` runs alike with plugin installs in the background (`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`), beside the 2026-09-26 walk's measurement and the <D> re-walk; (c) auto-update is per marketplace and off by default for third-party marketplaces, issue 83368 (closed) and issue 61854 (closed as a duplicate) named with their states on <D>, and the auto-update leg stays a live leg `u3-route-proofs` records `Not done:`.
  3. `### Copilot: enterprise managed settings` — the `.github-private` repository's `copilot/managed-settings.json`
     (GA 2026-07-01; legacy path `.github/copilot/settings.json` in that repository); the release tree's `admin/copilot/managed-settings.stable.json` (u2-admin-templates; its `.tag` and `.strict` twins named in prose) as a `json` block equal to its renderer; keys
     `extraKnownMarketplaces` (`source: github`, `repo`, `ref`), `enabledPlugins`, per-entry `autoUpdate`, optional
     `strictKnownMarketplaces`; Copilot Business or Enterprise only; installed at sign-in and refetched hourly; reaches
     the Copilot CLI and VS Code; the cloud agent installs from a project's own `.github/copilot/settings.json`
     (`stamity plugin setup --declare`, u2-declare).
  4. `### VS Code: device policies` — `ChatPluginsEnabled`, `ChatEnabledPlugins`, `ChatExtraMarketplaces`,
     `ChatStrictMarketplaces`; the user setting `chat.plugins.enabled`; repository `enabledPlugins` is a recommendation
     only; hooks are in preview and ignore matchers, and stamity's hooks filter themselves from 1.12.0
     (u2-hooks-self-filter-vscode).
  5. `### Cursor: team marketplace` — Import from Repo on the channel branch (plugins added later are picked up), Auto
     Refresh (needs Cursor's GitHub App; re-indexes within 10 minutes), Default Off / Default On / Required, one team
     marketplace on the Teams plan, Organization Groups on Enterprise, "Serve marketplace from Cursor" for members without
     GitHub access; no ref pin, so the channel is the pin and rollback is a promotion; cloud agents load no
     team-marketplace plugin; whether the Cursor CLI installs a Required plugin is undocumented (a live leg).
  6. `### Codex: workspace import` — the admin imports a GitHub marketplace into the workspace and sets each plugin
     Installed, Available or Not available per role (`docs/plugins.md:293-298`); the import reads the default branch and
     syncs daily; from 1.12.0 the default branch carries a Codex catalog that points at the release tag
     (u2-main-catalogs), so the import resolves the full root; plugin hooks need `/hooks` trust and a re-trust after any
     hook changes.
  7. `### The CLI route and the APM route` — no client admin for the CLI route: one pull request per repository running
     `stamity upgrade --to <version>`, opened by the organization's own orchestrator (the pattern only; a shipped fleet
     workflow is on the drop list); APM consumers pin `<owner>/<repo>/apm#plugins/v<version>` in `apm.yml` and extend
     `renovate/apm.json`.
  8. `### Private repositories` — per client: each machine's git credentials (Claude Code, Codex, the Copilot CLI);
     VS Code falls back to cloning; Cursor needs its GitHub App or serves the marketplace itself; the Copilot cloud agent's
     private marketplaces are reported broken; APM reads the token order at `:805-811`.
  9. `### Where review sits` — moved from `docs/plugins.md:566-573` and extended: a channel moves only when a reviewer
     approves the promotion; a catalog or mirror repository's pull request is where Renovate's update is read; what a
     client auto-updates to is only what was promoted. `docs/plugins.md:566-573` keeps two sentences and links here.
  10. `### Hooks guide; permissions enforce` — the per-client table above (a timeout, Node missing, a crashed guard), then: hooks guide and record what the agent does, and hard limits belong in each client's own permission settings, named per client (Claude Code `permissions` deny rules, which managed settings can enforce; Codex
      `sandbox_mode` and its approval policy; Copilot's and Cursor's own permission controls as their pages name them on
      <D>). Consistent with the generated `docs/capability-matrix.md:257-268` table (Copilot `:267`, Cursor `:268`), which the subsection links.
- **The extended pin** (`test/docsPages.test.ts:2317-2344`): every `json` block in the section is parsed, and each
  deep-equals (key order included) the renderer call named in the sentence before it — the per-tag Claude call
  `renderClaudeManagedSettings(identity, { ref })` as today, the per-channel Claude call and the Copilot call with the
  option names u2-admin-templates exports (read at intake). A `TEST CHANGE, justified:` comment names this unit: the
  section now prints three renderer outputs, and each is held to its renderer. **New case** "the rollout section gives
  every client its route and states the hook limit": the section carries `###` headings beginning `Choose a channel`,
  `Claude Code`, `Copilot`, `VS Code`, `Cursor`, `Codex`, `Where review sits` and `Hooks guide`, and its hook subsection holds the seven-row table and contains "permission settings" and "exit 2".
- **`docs/plugins.md` corrections.** `:392-394`: measure first — run `node scripts/plugin-lifecycle-fixture.mjs --out
  <tmp>`, add the clone at the first tag and install at project scope exactly as `test/ci/pluginLifecycle.test.ts`'s
  Claude walk does, move the clone to the second tag, then `claude plugin update stamity@stamity` with no `--scope` in
  a scratch `CLAUDE_CONFIG_DIR`; exit 0, then `claude plugin list --json` in a new process reads the second version → the sentence says the scope is found by the client from that version on (an `updateOutcome: "updated"` while the list still names the first version is the lag of inbox `2026-10-03_pack-engine-defects/prove/2`: keep `--scope project` and name the client version) (the planning run read 2.1.281 in the vendor changelog on 2026-10-01) and keeps the
  2026-09-20 measurement as history; every command line keeps `--scope project`. `:420-445`: the Copilot paragraph gains
  "an organization rolls it out through Copilot's enterprise managed settings" with a link to the rollout section, and
  `:433-435`'s "opting in is a user-settings step" becomes "a user-settings or managed-settings step". `:216-228` and
  `:447-451`: Cursor's organization recipe and "the channel is the pin" link to the rollout section. `:293-298`: Codex's
  workspace paragraph links it. `:566-573`: two sentences and the link. `:5` to the commit form; the re-open trigger's
  newest vendor date `:8` moves to the newest page re-read.
- **`scripts/build-plugin-distribution.mjs:329-330`** (the Codex note in every distribution `README.md`): "Plugin hooks
  additionally need `features.hooks = true`, project trust, and a per-hook trust review before any of them runs." →
  "Plugin hooks run once the project is trusted and each hook passes the per-hook trust review (`/hooks`); the hooks
  feature itself is on by default (codex-cli 0.155.1, measured 2026-09-30)." `test/ci/pluginDistribution.test.ts` covers
  the README sections; no other line moves.
- **Header** `docs/enterprise-forks.md:5` stays on the commit form; the re-open trigger `:16-21` gains "or when a
  client's organization route (Copilot managed settings, VS Code policies, Cursor's team marketplace, Codex's workspace
  import) changes on its vendor page".
- **CHANGELOG** `### Changed`: "**The enterprise guide rolls stamity out to every client.** The rollout section now
  covers channels and promotion, Claude Code's and Copilot's managed settings, VS Code's device policies, Cursor's team
  marketplace and Codex's workspace import, private repositories, where review sits, and what a hook can and cannot
  enforce." `### Fixed`: "**Three stale route facts.** The plugins guide says when `claude plugin update` finds the
  install's scope itself, the distribution's README no longer says Codex hooks need `features.hooks = true` (they are
  on by default), and the managed-settings section separates what the vendor states about `enabledPlugins` from what the
  walk measured."

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **interfaces, added:** the required-check example passes `--expect-version`, `--expect-tools` and `--expect-mode` from an input of the central required workflow (never from the consumer's own files), names `EXPECTATION_ERROR`, and tells a rollout to vet `check --json` `drift.reclaim` and to compare a manifest's ledger with `ownedPaths` before running `sync`.
- **interfaces, added:** **The Claude scope probe proves the update in a new process (inbox `2026-10-03_pack-engine-defects/prove/2`).** On Claude Code 2.1.291, `plugin update --scope project` reported the update while `claude plugin list` in the same walk still listed the old version (that row); `claude plugin update --help` on 2.1.291 says "restart required to apply" and `--scope … (default: auto-detect)` (r5, measured 2026-10-06), and the vendor changelog dates auto-detection to 2.1.281 (`vendor-facts.md`). The probe therefore reads `claude plugin list --json` in a new process with the same `CLAUDE_CONFIG_DIR` after the update and takes that listing, not `updateOutcome`, as the result.
- **testCriteria, added:** **Given** the probe record, **then** it names the client version, the update's exit code and output, and the version a new-process `claude plugin list --json` reported.
- **edgeCases, added:** The new-process listing still shows the old version → the sentence keeps "`--scope project` is not optional" for that client version, the record says so, and the lifecycle walk's own assertion (`test/ci/pluginLifecycle.test.ts:1019-1023`) is the same defect (inbox `2026-10-03_pack-engine-defects/prove/2`; outside this slice, see Notes).
- **files, added:** `docs/plugins.md` (`:225` and `:455-458`); `scripts/qa/form.mjs` (`:154`, H5's Cursor route text); `docs/enterprise-forks.md` (`### Start Claude Code once on each machine` `:1106-1124`, re-walked); `test/qa/form.test.ts` (`:263-269`, passes unedited: the new Cursor text keeps `--plugin-dir`). Anchors moved since `88fcfd32`: `## Roll the plugin out to your organization` is `:1025` and the section runs to `:1168`.
- **interfaces, added:** **Subsection 10, `### Hooks guide; permissions enforce`, becomes a table.** Header exactly `| Client and route | A hook times out | Node is missing | The guard crashes or is missing |`; first-column labels, in order: `Claude Code, CLI route`, `Claude Code, plugin route`, `Copilot CLI and cloud agent`, `VS Code`, `Cursor, CLI route`, `Cursor, plugin route`, `Codex`. Each cell is filled at the unit's head from a probe and a dated vendor page: every emitted hook command of a four-client `init -y` fixture (and the plugin roots' `hooks.json`) is run with `echo '{}' | env -i PATH=/usr/bin:/bin CLAUDE_PROJECT_DIR="$PWD" /bin/sh -c '<command>'` (Node missing) and with the guard script deleted (crash), its exit code read, and the client's documented meaning of that code applied; the run record keeps every probe's output. **Baseline at `d10db029`** (r3's probes, 2026-10-06): Claude Code CLI route — a timeout lets the call through (the guard row sets no `timeout`, default 600 s); Node missing → exit 2, every tool call blocked, the main thread's included; a launch failure → exit 2, every call; an evaluation failure → exit 2 for `stamity-*` agents only. Claude Code plugin route — the plugin's PreToolUse has no tail, so Node missing exits 127, a non-blocking error: the guard does not run. Copilot CLI and cloud agent — timeouts always fail open; "exit 2, crashes, and other non-zero exits all fail-closed" for preToolUse, so Node missing (127) denies every tool call, a runner fault exits 0, a missing guard script exits 1 and denies. VS Code — any other exit "show a non-blocking warning … and continue". Cursor — non-zero exits and timeouts fail open except on events marked `failClosed` (`subagentStart`, `beforeMCPExecution`), where Node missing denies every subagent spawn and every MCP call; Third-Party Imports also run the Claude command, whose exit 2 Cursor reads as a block (inferred, not run). Codex — Node missing (127) and a crash (1) continue. **Expected at 1.12.0, per file 01's missing-Node rework** (verify against the landed unit, never assume): Claude Code's CLI-route guard still denies the calls it governs, the plugin-route guard fails open, Copilot, VS Code and Codex continue, Cursor's `failClosed` events deny. Under the table, two sentences: hooks guide and record what an agent does, so hard limits belong in each client's own permission settings (Claude Code `permissions` deny rules, which managed settings can enforce; Codex `sandbox_mode` and its approval policy; Copilot's and Cursor's own controls as their pages name them on <D>); and the generated [Hook guarantee honesty](capability-matrix.md) table (`docs/capability-matrix.md:259-270`) is the per-client exit-code reference. This corrects decision S3 (see Decisions, S3).
- **interfaces, added:** **Subsection 3, Copilot.** The organization file is `copilot/managed-settings.json` in the enterprise's `.github-private` repository, generally available since 2026-07-01, with the older `.github/copilot/settings.json` still read; it covers VS Code and the Copilot CLI on Copilot Business and Enterprise, and the 2026-07-27 changelog extends managed settings to the Copilot app and the cloud agent. The block shown is the renderer's output for `admin/copilot/managed-settings.stable.json` (u2-admin-templates; its `.tag` and `.strict` twins named in prose). Moving the organization to another release is one edit of `ref` in that file (clients refetch on sign-in and hourly); one developer's own CLI pin moves with the three commands `u3-copilot-tag-move` prints (remove `--force`, add at the tag, install; measured 2026-10-06 on 1.0.89), and its refresh is `copilot plugin update stamity@stamity` (the client's help, 1.0.89).
- **interfaces, added:** **Subsection 2, Claude Code.** (a) A managed marketplace entry replaces a project entry of the same name, and their fields do not merge: under a managed `stamity` at `plugin-stable`, a repository's `plugin setup --declare plugins/v<version>` (u2-declare) is not the copy the client uses, and under a `.strict` managed file a project declaration of another ref is not admitted at all — declare the channel the organization manages. (b) The vendor states, read 2026-10-06, that managed settings apply at session start in interactive and `claude -p` runs alike and that plugin installs run in the background (`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` makes a run wait), while the 2026-09-26 walk on 2.1.281 with no login recorded the marketplace only after an interactive start (`docs/enterprise-forks.md:1106-1124`). Re-walk on <D> in a scratch `CLAUDE_CONFIG_DIR` with the file at the Linux path: a `claude -p` run with and without `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`, then `claude plugin list --json`; state the re-walk's result, keep the 2026-09-26 one as history, and rename `### Start Claude Code once on each machine` only if the re-walk shows no interactive start is needed (u3-quickstart then links the landed heading). (c) Auto-update: anthropics/claude-code issue 83368 ("autoUpdate in `extraKnownMarketplaces` logs a successful sync but never persists") is closed, and issue 61854 is closed as a duplicate; the version that fixed it is stated only as its page names it on <D>; the live leg stays `Not done:`.
- **interfaces, added:** **Subsection 5, Cursor.** The Cursor CLI pins a user-scoped marketplace with `agent plugin marketplace add <git-url> --git-ref <ref>` (CLI changelog 2026-07-13; help read on 2026.10.01) and re-indexes it with `agent plugin marketplace update <name>`; on a self-hosted git marketplace `update` reports "0 plugins indexed" (Cursor staff, forum thread 169587, 2026-08-26), so the workaround is `remove` then `add`; the marketplace commands need a signed-in account. Clients pick up a team-marketplace re-index on start-up and window focus (forum thread 166454). `--declare` has no Cursor target: plugin modes are set only in the dashboard and `.cursor/cli.json` takes permissions only. Cloud agents run no team-marketplace plugin and no `sessionStart` hook (see u3-route-guide), so a repository whose cloud agents need the guard keeps the CLI route's committed `.cursor/hooks.json` (SECURITY). Teams plans allow one team marketplace; Enterprise allows more and adds Organization Groups; Auto Refresh needs Cursor's GitHub App and re-indexes at most once every 10 minutes; "Serve marketplace from Cursor" keeps a synced copy for members without GitHub access.
- **interfaces, added:** **Subsection 8, Private repositories.** Installing the CLI from GitHub Packages' npm registry needs a classic personal access token with `read:packages`, authorised for SSO where the organization uses it, for every developer and pipeline (GitHub's npm-registry page: "only supports authentication using a personal access token (classic)"); the alternative needs no registry token: [Install without a registry token](#install-without-a-registry-token) (same page; the heading lands with `u3-cli-pin-update-paths`, and the link check skips fragments). A fork whose policy admits only GitHub-owned actions meets one non-GitHub action in its inherited workflows: [Recommended settings and enterprise constraints](#recommended-settings-and-enterprise-constraints) names it.
- **interfaces, added:** **Subsection 1, channels.** A rollback is promoting the previous tag, and it reaches only clients that accept a lower version (Claude Code compares versions); the others take the per-client rollback commands.
- **interfaces, added:** **`docs/plugins.md` and the QA form.** `:225` "pointed at your mirror of the distribution branch" → "pointed at the channel branch your mirror carries (`plugin-stable`), which moves only through a promotion — `plugin-dist` moves on every release". `:455-458` ("**Cursor: no vendor-documented pin, update or rollback command on 2026-09-21.**" and its first sentence) → the Cursor CLI's `--git-ref` pin and `marketplace update`, dated, with the self-hosted re-index bug; the team marketplace keeps "the channel is the pin". `scripts/qa/form.mjs:154` (``cursor: '`--plugin-dir` tree replacement — this client documents no install, update or rollback subcommand'``) → ``cursor: '`--plugin-dir` tree replacement — the Cursor CLI pins and re-indexes a marketplace (`plugin marketplace add --git-ref`, `marketplace update`), but only for a remote git URL under a signed-in account, so this walk replaces the tree; the marketplace route is walked after publish (route proof leg `plugin-cursor-cli`)'``.
- **interfaces, added:** **The Claude scope probe** proves the update by `claude plugin list --json` in a new process (2.1.291's help: "restart required to apply"), not by `updateOutcome: "updated"`, which inbox `2026-10-03_pack-engine-defects/prove/2` shows misleading on 2.1.291.
- **testCriteria, added:** **Given** the case "the rollout section gives every client its route and states the hook limit", **then** the `Hooks guide` subsection's first table has exactly the header and the seven first-column labels above, no empty cell, and the subsection contains "permission settings" and "exit 2"; the `Copilot` subsection contains `admin/copilot/managed-settings.stable.json` and `copilot/managed-settings.json` and not `admin/copilot-managed-settings.json`; the `Cursor` subsection contains `--git-ref` and `marketplace update`; the `Claude Code` subsection contains `CLAUDE_CODE_SYNC_PLUGIN_INSTALL` (`test/docsPages.test.ts`). **Given** `rg -n "documents no install, update or rollback subcommand" scripts/qa/form.mjs` and `rg -n "pointed at your mirror of the distribution branch" docs/plugins.md`, **then** both print nothing. **Given** `npx vitest run test/qa/form.test.ts`, **then** it exits 0 unedited. **Given** the run record, **then** it keeps every hook probe's command, exit code and stderr, and the Claude re-walk's outputs.
- **edgeCases, added:** File 01's rework landed a behaviour other than the expected column → the table states the measured behaviour and the run record names the difference. VS Code is not on the machine → its row cites VS Code's hooks reference with its date and reads "not measured". The Claude re-walk cannot run (no client, or the scratch config refuses) → the subsection states the vendor fact with its date beside the 2026-09-26 measurement, the heading keeps its text, and the run record says so. The vendor states a Copilot precedence between a managed and a project entry of one name on <D> → the Copilot subsection states it; otherwise "undocumented (read <D>)".

### u3-troubleshooting — troubleshooting rows for the route failures the enterprise met

| Field | Content |
|---|---|
| `id` | u3-troubleshooting |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/troubleshooting.md` (`:5-9`, a new section between `## Common failures`'s end `:315` and `## Where to report a problem` `:316`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** the page's doctor rows sit between `## What \`check\` prints` (`:80`) and `## Common failures` (`:124`) and are set-equal with `check.ts`'s probe ids (`test/docsPages.test.ts:2755-2785`); a new section after `## Common failures` does not move that pin. **New section** `## When a route misbehaves`, fourteen `###` rows in this order, each a symptom heading, then its cause and remedy in two short paragraphs, each vendor fact dated: (1) `### Claude Code says the plugin is not found in the marketplace` — under managed settings the plugin installs in the background at session start, in interactive and `claude -p` runs alike (vendor, read 2026-10-06), so a short run can end before it lands; `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` makes it wait. The 2026-09-26 walk on 2.1.281 with no login saw the marketplace only after an interactive start (`docs/enterprise-forks.md:1104-1122`; state the <D> re-walk's result). An auto-update that logs a sync and never persists was anthropics/claude-code issue 83368 (closed); issue 61854 is closed as a duplicate. Confirm with `claude plugin list --json` in a new session. (2) `### Codex installed the plugin without its hooks or its runtime` — a marketplace added without `--ref` read the default branch; from 1.12.0 that branch carries a Codex catalog pointing at the release tag, a fork regenerates it with `scripts/fork-identity.mjs`, and an older fork still traps: re-add with `--ref plugins/v<version>` (`docs/plugins.md:267-277`). (3) `### Codex runs none of the plugin's hooks` — project trust plus a per-hook `/hooks` review, re-done after any hook changes; headless `codex exec` ran no project hook in any measured run (`docs/troubleshooting.md:193-211`). (4) `### The Copilot CLI loads no hooks` — hooks load only in a trusted folder; headless needs `COPILOT_ALLOW_ALL` set to exactly `true` (`docs/plugins.md:55-64`). (5) `### The Cursor CLI started without the plugin` — when loading the plugin list is slow the CLI opens a session without plugins (planning run, read 2026-10-01); start a new session and confirm with the CLI's plugin listing. (6) `### A VS Code hook fires on every event` — VS Code ignores matchers; hooks from 1.12.0 filter themselves, an older setup re-syncs (`stamity sync`) or reinstalls the plugin. (7) `### An override has no effect` — on the plugin route before 1.12.0 a plugin-owned class dropped overrides; from 1.12.0 they land as project-level copies, the client may list both names (`/stamity:<id>` and `/<id>` on Claude Code), and `check`'s per-client reach row (u2-plugin-overrides) says what reaches; on the APM route only `fork/` applies. (8) `### apm install reports success and deploys nothing` — apm-cli below 0.29.1 exits 0, deploys nothing and prints the line `docs/getting-started.md:114-116` quotes; `check` fails below 0.29.1 from `apm.lock.yaml`'s `apm_version` (u2-apm-floor-current; name the landed row id); upgrade apm-cli. (9) `### Renovate offers the wrong prerelease tag` — Renovate's default `semver-coerced` treats `.1` and `.2` prerelease tags as equal; the shipped presets (`renovate/companion.json`, `renovate/plugins.json`, `renovate/apm.json`) stay strict and offer no prerelease; run `node scripts/fork-identity.mjs --suffix <id>` in the fork, which retargets them to `v<x.y.z>-<id>.<n>` and `plugins/v<x.y.z>-<id>.<n>` with the suffix required and `ignoreUnstable: false` (`docs/plans/016-fork-distribution-01.md (u1-renovate-suffix)`), and extend the fork's presets. Re-open trigger `:6-9` gains "or a vendor behaviour a route row cites changes"; `:5` to the commit form. **New case** "troubleshooting carries a row for each route failure the docs name": `sectionOf(read(TROUBLESHOOTING), "## When a route misbehaves")` holds exactly the fourteen `###` headings above, in order. **CHANGELOG** `### Changed`: "**Troubleshooting covers the routes.** Fourteen rows name the route failures an enterprise met — the nine route rows plus a setup refused over a secret-shaped line, drift after a `package.json` or lockfile change, a hook that cannot start Node, generated files a `.gitignore` hides, and a backup `sync` left beside an edited file — from Claude Code's first start under managed settings and Codex's `--ref` trap to Copilot's trusted folders, the Cursor CLI's plugin-less sessions, VS Code ignoring matchers, an override with no effect, APM's silent old clients and Renovate's prerelease ordering." **Follows:** `docs/troubleshooting.md:126-171` (symptom-first `###` headings, cause, remedy, command block). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "troubleshooting documents the doctor rows check prints, and only those" among the passes. **Given** the section, **then** it holds fourteen `###` headings and each row names at least one remedy command or setting in backticks. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | u2-apm-floor-current put the APM floor into an existing `check` row instead of a new probe → row (8) names that row id; the doctor table already lists it (file 02's job), and this unit adds no probe row. The Cursor CLI's fallback is documented differently on <D> → row (5) quotes the re-read behaviour and date. The sample `check` transcript at `:31-54` is refreshed by `u3-release-1-12-0`, not here. |
| `depends_on` | u3-rollout-guides, docs/plans/016-fork-distribution-02.md (u2-apm-floor-current and u2-plugin-overrides and u2-apm-renovate-preset), docs/plans/016-fork-distribution-01.md |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** none; anchors moved since `88fcfd32`: `## Common failures` runs `:126-316` and `## Where to report a problem` is `:318`, so the new section goes between them.
- **interfaces, added:** five rows after row (9), each a symptom heading, its cause and its remedy, every vendor fact dated:
  - **(10) `### Setup refuses a file because one line looks like a secret`** — the prompt-injection screen's `inline-secret-assignment` pattern (a key such as `token`, `secret`, `password` or `api_key`, then `:` or `=`, then eight or more characters) matched a line of an owner file the setup keeps beside the charter (`--import-config supplement`). At the head an `AGENTS.md` line `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` refuses `init` with exit 1, "inline-secret-assignment at offset 49" and a redacted match, and no manifest is written (r6 M11). From 1.12.0 a reference such as `${{ secrets.NAME }}` passes and a refusal names `path:line:column` (file 01's secret-screen unit; quote the landed message). Remedy: open the named line and move a literal credential out of the file, or give that one path its own import mode (file 01's per-file import mode; its config key as landed), so one line no longer refuses the whole repository.
  - **(11) `` ### `check` reports drift after a change to `package.json` or a lockfile ``** — `check` re-runs detection, so a root `package.json` script, a new lockfile or a new root manifest changes what a `sync` would write (at the head: a `test` script added → `check` exit 1, "drift: 9 file(s) would change"; `pnpm-lock.yaml` added → the same, r6 M9; a root `package.json` → one file, D4-M3). From 1.12.0 `check` exits 3, "re-sync needed", for drift the repository owner's own change caused, and keeps exit 1 for tampering (file 01's exit-code unit; quote its wording). Remedy: run the pinned `sync` in the same pull request; a required check that only reports can read exit 3 as "regenerate", not as a finding. A pin folder below the root changes nothing (detection reads the root, [Pin the CLI](enterprise-forks.md)).
  - **(12) `### A hook cannot start Node`** — each client reacts differently, in the table under [Hooks guide; permissions enforce](enterprise-forks.md); the Claude Code CLI route's guard message is the row above (link the landed heading of `:215-272`, which file 01 rewrites). Remedy: Node 22.22.2 or newer on the PATH the client passes to its hooks, then a new session.
  - **(13) `### CI says generated files are missing that are on your disk`** — a `.gitignore` rule hides a generated path, so `init` and `sync` write it, your `check` is clean, and a fresh clone has none of it (at the head: `.claude/` ignored → `init` exit 0 with no warning, local `check` exit 0, a fresh clone's `check` exit 1, "59 ledgered file(s) missing", r6 M8). From 1.12.0 `init` and `sync` warn and `check` names the path (file 01's ignored-output unit). Remedy: `git check-ignore -v <path>` names the rule; delete it or add a `!` line for each generated path, then commit the files.
  - **(14) `` ### `sync` left a backup of a file you edited ``** — `sync` regenerated a managed file you had edited and kept your bytes (at the head `.claude/agents/stamity-reviewer.md.bak` beside the file, untracked and not ignored, so `git add -A` commits it; r6 M10, r1 C5.e). From 1.12.0 the backup lands in a gitignored state folder and `sync --json` names it repository-relative (file 01's fold of that finding into `u1-import-config-round-trip`; folder and field as landed). Remedy: never commit a backup; move the change into an override ([Customization](customization.md)) or outside the managed block, then delete the backup.
- **interfaces, added:** row (1) rewritten for the vendor re-read: under managed settings the plugin installs in the background at session start, in interactive and `claude -p` runs alike, so a short run can end before it lands — `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` makes it wait — and the 2026-09-26 walk on 2.1.281 with no login saw the marketplace only after an interactive start (state the <D> re-walk's result); an auto-update that logs a sync and never persists was issue 83368 (closed), issue 61854 is closed as a duplicate; confirm with `claude plugin list --json` in a new session. Row (3) gains: Codex records trust against each hook's hash, so a hook command that changes — a version string inside it, say — asks for trust again after every upgrade (read 2026-10-06; name whether 1.12.0's `.codex/hooks.json` still carries a version, read from the landed file); project hooks load only for a trusted project `.codex/` layer, and the route proof records Codex hooks as not provable headless unless that layer is trusted. Row (5) gains the unsettled date (2026-06-09 or 2026-07-06) of the plugin-less fallback.
- **testCriteria, added:** **Given** the new case, **then** `sectionOf(read(TROUBLESHOOTING), "## When a route misbehaves")` holds exactly the fourteen `###` headings, in order, and each of rows (10)–(14) names at least one command, flag or setting in backticks (`test/docsPages.test.ts`).
- **edgeCases, added:** A file-01 unit landed a different exit code, message or field than this cell names → the row quotes the landed one; a row never names behaviour the head does not have. A file-01 unit did not land (cut at its own intake) → its row describes the `d10db029` behaviour and its workaround only, and the run record names the missing unit.
- **Replaces:** "under managed settings the client knows the marketplace only after one interactive start past the first-run screens; `claude -p` does not fix it; then `claude plugin install stamity@stamity` (`docs/enterprise-forks.md:1104-1122`); an auto-update that refreshes the catalog without re-installing is the open report anthropics/claude-code issue 61854 — re-run `claude plugin update stamity@stamity`." → row (1) as rewritten above.

### u3-reset-guide — a reset that works under protected branches, documented and fixture-tested

| Field | Content |
|---|---|
| `id` | u3-reset-guide |
| `requirements` | REQ-UPSTREAM-022 |
| `files` | `docs/enterprise-forks.md` (a new `### Reset or re-import under protected branches` after `### Recover when there is no shared history`, `:241-257`; the re-open trigger `:6-11`); `test/upstream/resetRecipe.test.ts` (new); `CHANGELOG.md` (`## [Unreleased]`, `### Added`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/upstream/resetRecipe.test.ts` on Linux or macOS, **then** it passes: (a) the origin's `stamity-reset` head is a commit whose tree equals the fresh tree and whose parents are exactly `[old main, the v1.3.0 commit]`; (b) origin carries `refs/tags/legacy/main-<12-hex>` naming the old main; (c) see (c′); (d) the bundle file exists and `git bundle verify` exits 0; (e) see (e′); (f) the second block run before the merge, with `RESET_COMMIT` set to the sha the first block printed, exits 1 with "the reset commit is not on main: land the stamity-reset pull request with a merge commit, not a squash or rebase" on stderr and the stub's log gains no Actions-on call; after the fixture lands `stamity-reset` into `main` with `git merge --no-ff`, the second block's guard passes, and `runLane(fork, ["status"])` (which adds `--json`), standing in for its `status` line, reports outcome `up-to-date` with `v1.3.0` integrated; (g) in the second fixture, whose `plugin-dist` head reads `plugins: v1.0.0-acme.1 from <a fork commit>` and whose tag is `plugins/v1.0.0-acme.1`, both survive; (h) in the second fixture, a tag `plugins/v1.0.1` on a fork-built orphan commit whose subject reads `plugins: v1.0.1 from <a fork commit>` survives, while upstream carries its own `plugins/v1.0.1` on another object. **Given** the page's two blocks, **then** no line matches `--force\|-f ` on a `git push`, the Actions-off line precedes every `git push` line, and the Actions-on line sits in the second block, after its guard. **Given** Windows, **then** the case is skipped with the reason "the recipe is two bash blocks; Git Bash is not driven by this suite". **Given** `npx vitest run test/docsPages.test.ts test/upstream`, **then** it exits 0. |
| `edgeCases` | The fork publishes its own distribution → the guard keeps `plugin-dist` (its head names a commit not reachable from `upstream/main`) and every `plugins/*` tag whose object differs from upstream's — a suffixed `plugins/v*-…` tag upstream never carries, and a fork's own unsuffixed release tag. A fork distribution pushed by hand with the message `plugins: v<version>` (no "from") → the guard cannot read a source and keeps the branch, the safe direction (a follow-up names `scripts/build-plugin-distribution.mjs:424`). `plugin-dist` absent on origin → the `git fetch` fails quietly and the step skips. The old lane has an open update pull request → the prose closes it after the reset lands (file 01's `u1-lane-issues-freshness` closes superseded issues once the lane is up to date). A ruleset requires signed commits on `main` → `git commit-tree -S` signs the reset commit, but the landing brings upstream's unsigned commits too, so the prose says the rule's bypass list must name whoever merges (GitHub's page read on <D>) and that a squash, which GitHub would sign, drops the second parent the lane reads. |
| `depends_on` | u3-troubleshooting, docs/plans/014-lean-repository-01.md (f1-import-recipe), docs/plans/016-fork-distribution-01.md (u1-lane-issues-freshness) |
| `verify` | `npx vitest run test/upstream/resetRecipe.test.ts test/upstream/lane.test.ts test/docsPages.test.ts && node scripts/leak-gate.mjs && npm run lint && npm run typecheck` |

`u3-reset-guide` interfaces:

- **Where.** A `###` inside `## Get a fork that carries the upstream history` (`docs/enterprise-forks.md:56`), after `### Recover when there is no shared history` (`:241-257`). The heading text exactly `### Reset or re-import under protected branches` (`u3-quickstart` links it). Package 18 rewrote the import block
  (`docs/plans/014-lean-repository-01.md (f1-import-recipe)`: `--single-branch --branch main`, pushes `main` and `v*`
  only); the reset's prose points at that block for a fresh import and never re-introduces `--mirror`.
- **Follows:** `docs/enterprise-forks.md:92-125` (a `set -euo pipefail` block a reader copies, then prose explaining
  each check and what it protects).
- **Prose, one short paragraph per step:** why (rulesets block force-pushes; a merge commit whose tree is the fresh tree
  keeps the lane's history and lets it read the integrated version from history, REQ-UPSTREAM-003); the traps the enterprise met (an older `--mirror` import copied upstream's `plugin-dist`, `plugins/*`, plain `v*` tags and non-release branches such as `replay-v2`; the old branch's hourly lane keeps running and opens issues while the reset is open); land the pull request with a merge commit, never squash
  or rebase (`## Land the update branch`); close the old lane's update pull request and issues after it lands; signed
  commits → `git commit-tree -S`. The fresh tree must carry the fork's own files, `.stamity/upstream.json` first among
  them (without it the lane reads the repository as `not-a-fork`), so the identity-and-customization step names
  `git checkout "$OLD_MAIN" -- .stamity/upstream.json <your customized paths>` before `scripts/fork-identity.mjs`.
- **The blocks** — two fenced `sh` blocks, bash, every line in a shape the test drives (assignments, `git`, `gh`, `if`,
  `for`, `rm`, `printf`, `node`, and the second block's guard). The first runs steps 1–4, deletes nothing, and prints `RESET_COMMIT=<sha>` as its last line; its comment line `# … apply your identity and customization
  here, then commit …` is the split point the test fills. The prose says that when the terminal is lost after that push, `git rev-parse origin/stamity-reset` prints the same sha, and that re-running the block is not the recovery, because the `legacy/main-…` tag it would create already exists. The second
  is labelled "Run after the pull request from `stamity-reset` lands with a merge commit", and its guard refuses to turn
  workflows on until the reset commit is on `origin/main`; a squash or rebase landing never puts it there, so the
  refusal names the merge-commit requirement rather than asking for a landing that already happened:

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
STAMITY_RESET_TAG='v1.12.0'
# 1. Back up every ref, then stop the old lane before anything moves.
git bundle create ../stamity-private-backup.bundle --all
gh api --method PUT "repos/$STAMITY_DOWNSTREAM/actions/permissions" -F enabled=false
# 2. Name the old main, and clear the lane's leftovers.
OLD_MAIN="$(git rev-parse origin/main)"
git tag "legacy/main-$(git rev-parse --short=12 "$OLD_MAIN")" "$OLD_MAIN"
git push origin "refs/tags/legacy/main-$(git rev-parse --short=12 "$OLD_MAIN")"
rm -rf .stamity/upstream-work
git worktree prune
# 3. Build the fresh tree: the upstream release plus your identity and customization.
git fetch upstream main "refs/tags/$STAMITY_RESET_TAG:refs/tags/$STAMITY_RESET_TAG"
git switch -c stamity-reset "$STAMITY_RESET_TAG"
# … apply your identity and customization here, then commit …
FRESH_TREE="$(git rev-parse 'HEAD^{tree}')"
UPSTREAM_COMMIT="$(git rev-parse "$STAMITY_RESET_TAG^{commit}")"
# 4. Land the fresh tree as a merge commit on the old main: no force-push.
RESET_COMMIT="$(git commit-tree "$FRESH_TREE" -p "$OLD_MAIN" -p "$UPSTREAM_COMMIT" -m "Reset onto upstream $STAMITY_RESET_TAG")"
git push origin "$RESET_COMMIT:refs/heads/stamity-reset"
printf 'RESET_COMMIT=%s\n' "$RESET_COMMIT"
# 5. Remove the distribution refs an older --mirror import copied from upstream, and only those.
if git fetch --quiet origin refs/heads/plugin-dist 2>/dev/null; then
  SOURCE="$(git log -1 --format=%s FETCH_HEAD | sed -n 's/^plugins: v[^ ]* from \([0-9a-f]\{40\}\)$/\1/p')"
  if [ -n "$SOURCE" ] && git merge-base --is-ancestor "$SOURCE" upstream/main; then
    git push origin --delete plugin-dist
  fi
fi
for REF in $(git ls-remote --refs --tags origin 'refs/tags/plugins/*' | cut -f2); do
  ORIGIN_OID="$(git ls-remote --refs origin "$REF" | cut -f1)"
  UPSTREAM_OID="$(git ls-remote --refs upstream "$REF" | cut -f1)"
  if [ -n "$UPSTREAM_OID" ] && [ "$ORIGIN_OID" = "$UPSTREAM_OID" ]; then
    git push origin --delete "$REF"
  fi
done
```

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
RESET_COMMIT='<the sha the first block printed>'
# 6. Only once the reset commit is on main: workflows on last, then check.
git fetch origin main && git merge-base --is-ancestor "$RESET_COMMIT" origin/main || { echo "the reset commit is not on main: land the stamity-reset pull request with a merge commit, not a squash or rebase" >&2; exit 1; }
gh api --method PUT "repos/$STAMITY_DOWNSTREAM/actions/permissions" -F enabled=true
node scripts/upstream.mjs status
```

  Provenance line under each block: "*Run by `test/upstream/resetRecipe.test.ts` against fixture repositories on every
  change; the 2026-09-29 enterprise reset landed the same merge-commit shape.*"
- **The test** `test/upstream/resetRecipe.test.ts`. **Follows:** `docs/plans/014-lean-repository-01.md
  (f1-import-recipe)`'s `test/upstream/importRecipe.test.ts` (read the page, run its commands against `file://`
  repositories) and the fixtures `test/upstream/fixtures.ts` (`createUpstream` `:405`, `createFork` `:529`, `runLane`
  `:626`, `parentsOf` `:764`, `isolatedEnv` `:91`, `makeScratch` `:790`). Steps: `createUpstream(parent)` (tags
  `v1.0.0`–`v1.3.0`, `RELEASE_TAGS` `:287`); `createFork(upstream, parent)` at `v1.0.0` (it writes the fork's
  `.stamity/upstream.json`, `:529-553`); a remote `upstream` at `upstream.dir` and `git fetch upstream 'refs/tags/v*:refs/tags/v*'`;
  an orphan `plugin-dist` in the upstream fixture whose commit message is `plugins: v1.0.0 from <the v1.0.0 commit>` and
  a tag `plugins/v1.0.0` on it; a bare `origin.git`, the fork's `origin` repointed at it, then pushed `main`, the `v*`
  tags, and upstream's `plugin-dist` and `plugins/v1.0.0` fetched and pushed unchanged, at upstream's object ids (what a
  `--mirror` import brought), then `git fetch origin` so `origin/main` exists; a `gh` stub script first on `PATH` that
  appends its arguments to a log and exits 0. Extract the first and second fenced `sh` blocks of `sectionOf(page, "###
  Reset or re-import under protected branches")`; in the first, replace `STAMITY_RESET_TAG='v1.12.0'` with `'v1.3.0'`
  and split it at the marker comment. Run steps 1–3 up to the marker, then the fixture's identity commit
  (`git checkout "$OLD_MAIN" -- .stamity/upstream.json && printf 'acme\n' > ACME.md && git add -A && git commit -qm
  identity`), then steps 3–5, all as one `spawnSync("bash", ["-c", script], { cwd: fork.dir, env })` under
  `isolatedEnv`, and read the sha from its last `RESET_COMMIT=` line. The red case: the second block, with that sha in
  place of `<the sha the first block printed>` and without its `status` line, run the same way before the merge, exits 1
  and the stub's log gains no Actions-on call. Then land the reset the way the pull request does (`git fetch origin
  stamity-reset && git switch main && git merge --no-ff -m "Merge stamity-reset" FETCH_HEAD && git push origin main`),
  run the second block the same way again (it exits 0 and the stub logs the Actions-on call), and run its `status` through
  `runLane(fork, ["status"])`, which spawns this repository's `scripts/upstream.mjs` in the fixture (`:626-648`); the test asserts the second block holds, in order, `set -euo pipefail`, the three assignments, the `# 5.` comment and the guard, the step-6 clean-up, the scratch-ref delete, the `# 7.` comment, the `gh workflow enable` line and the `status` line. The second fixture repeats the run with `plugin-dist` whose message names a fork-only
  commit, a tag `plugins/v1.0.0-acme.1`, and a tag `plugins/v1.0.1` on a fork-built orphan commit whose subject reads
  `plugins: v1.0.1 from <a fork commit>`, while its upstream tags its own `plugins/v1.0.1` on another commit.
  `describe.skipIf(process.platform === "win32")` with the reason in the edge case. Every assertion is in `testCriteria`.
- **Re-open trigger** `docs/enterprise-forks.md:6-11` gains "`test/upstream/resetRecipe.test.ts` runs the reset blocks";
  `:5` stays on the commit form with `<D>`.
- **CHANGELOG** `### Added`: "**A reset that works under protected branches.** The enterprise guide's new section backs
  a fork up, stops its old lane, names the old main `legacy/main-<sha>`, and lands the fresh tree as a merge commit on
  it, so no force-push is needed and the lane still reads the integrated release from history. It stops only the upstream lane, so the reset's own pull request runs its checks; once the reset has landed it removes only what an import copied from upstream — the distribution branch and tags, the plain release tags and branches whose head is upstream history, each checked against upstream's own object — turns the lane back on last, and a test runs both blocks on every change."

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** none beyond the unit's list (`test/docsPages.test.ts` gains the Renovate-rule check below).
- **interfaces, added:** **The blocks, replacing both of the unit's blocks.** Block 1 stops only the lane, so the reset pull request's required checks still run (inbox ``"block 1 disables all repository Actions before pushing the reset branch" at 077e8a78``: disabling all of Actions, as the import does before any ref exists, `docs/enterprise-forks.md:104`, would leave the reset's checks unrun under branch protection), fetches the reset tag into a scratch ref (inbox ``"fetching the upstream reset tag into a local tag of the same name fails" at 077e8a78``: a fork's own tag of that name makes `refs/tags/<tag>:refs/tags/<tag>` fail), and deletes nothing (inbox ``"block 1 deletes `plugin-dist` and the mirrored `plugins/*` tags right after pushing the reset branch" at 077e8a78``: an abandoned reset leaves every ref where it was). Block 2 runs after the reset landed and removes only refs whose object is upstream's own — the distribution branch and tags, the plain release tags, and branches whose head is upstream history — then turns the lane on:

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
STAMITY_RESET_TAG='v1.12.0'
# 1. Back up every ref, then stop the old lane before anything moves.
git bundle create ../stamity-private-backup.bundle --all
gh workflow disable upstream-update.yml --repo "$STAMITY_DOWNSTREAM"
# 2. Name the old main, and clear the lane's leftovers.
OLD_MAIN="$(git rev-parse origin/main)"
git tag "legacy/main-$(git rev-parse --short=12 "$OLD_MAIN")" "$OLD_MAIN"
git push origin "refs/tags/legacy/main-$(git rev-parse --short=12 "$OLD_MAIN")"
rm -rf .stamity/upstream-work
git worktree prune
# 3. Build the fresh tree: the upstream release plus your identity and customization.
git fetch --no-tags upstream main "refs/tags/$STAMITY_RESET_TAG:refs/stamity-reset/$STAMITY_RESET_TAG"
git switch -c stamity-reset "refs/stamity-reset/$STAMITY_RESET_TAG"
# … apply your identity and customization here, then commit …
FRESH_TREE="$(git rev-parse 'HEAD^{tree}')"
UPSTREAM_COMMIT="$(git rev-parse "refs/stamity-reset/$STAMITY_RESET_TAG^{commit}")"
# 4. Land the fresh tree as a merge commit on the old main: no force-push.
RESET_COMMIT="$(git commit-tree "$FRESH_TREE" -p "$OLD_MAIN" -p "$UPSTREAM_COMMIT" -m "Reset onto upstream $STAMITY_RESET_TAG")"
git push origin "$RESET_COMMIT:refs/heads/stamity-reset"
printf 'RESET_COMMIT=%s\n' "$RESET_COMMIT"
```

```sh
set -euo pipefail
STAMITY_DOWNSTREAM='acme/stamity-private'
STAMITY_RESET_TAG='v1.12.0'
RESET_COMMIT='<the sha the first block printed>'
# 5. Only once the reset commit is on main.
git fetch --no-tags origin main && git merge-base --is-ancestor "$RESET_COMMIT" origin/main || { echo "the reset commit is not on main: land the stamity-reset pull request with a merge commit, not a squash or rebase" >&2; exit 1; }
# 6. Remove what an import copied from upstream, and only that: each ref's object must be upstream's.
git fetch --no-tags --quiet upstream main
git fetch --no-tags --quiet origin
if git fetch --quiet origin refs/heads/plugin-dist 2>/dev/null; then
  SOURCE="$(git log -1 --format=%s FETCH_HEAD | sed -n 's/^plugins: v[^ ]* from \([0-9a-f]\{40\}\)$/\1/p')"
  if [ -n "$SOURCE" ] && git merge-base --is-ancestor "$SOURCE" upstream/main; then
    git push origin --delete plugin-dist || printf 'kept plugin-dist: the push was refused\n'
  fi
fi
for REF in $(git ls-remote --refs --tags origin 'refs/tags/plugins/*' 'refs/tags/v*' | cut -f2); do
  ORIGIN_OID="$(git ls-remote --refs origin "$REF" | cut -f1)"
  UPSTREAM_OID="$(git ls-remote --refs upstream "$REF" | cut -f1)"
  if [ -n "$UPSTREAM_OID" ] && [ "$ORIGIN_OID" = "$UPSTREAM_OID" ]; then
    git push origin --delete "$REF" || printf 'kept %s: the push was refused\n' "$REF"
  fi
done
for REF in $(git ls-remote --refs --heads origin | cut -f2); do
  [ "$REF" = refs/heads/main ] && continue
  HEAD_OID="$(git ls-remote --refs origin "$REF" | cut -f1)"
  if git merge-base --is-ancestor "$HEAD_OID" upstream/main 2>/dev/null; then
    git push origin --delete "$REF" || printf 'kept %s: the push was refused\n' "$REF"
  else
    printf 'kept %s: its head is not upstream history\n' "$REF"
  fi
done
git update-ref -d "refs/stamity-reset/$STAMITY_RESET_TAG"
# 7. The lane on last, then check.
gh workflow enable upstream-update.yml --repo "$STAMITY_DOWNSTREAM"
node scripts/upstream.mjs status
```

- **interfaces, added:** **Prose.** Step 1: a lane run already in progress finishes after `disable`; `gh run list --workflow upstream-update.yml --status in_progress --repo "$STAMITY_DOWNSTREAM"` names it, and the reader waits for it before step 2. Step 6: plain upstream `v*` tags matter because a release outranks its own prereleases in semver order (`v1.12.0` > `v1.12.0-acme.1`), so a consumer resolving the fork repository's tags by semver without the suffix requirement is offered upstream's code under the fork's name; the lane never needs them (it reads its own namespace, `scripts/upstream.mjs:1017`), and the shipped presets retargeted with `--suffix` require the suffix (u1-renovate-suffix, u2-apm-renovate-preset), so a fork that keeps them is safe on the presets and the deletion is hygiene. A deletion a ruleset refuses prints `kept <ref>` and the block goes on; a maintainer on that ruleset's bypass list deletes it later, or keeps it. Consumers pinned to a mirrored upstream `plugins/v*` tag in the fork move to the fork's own release first. A branch whose head is upstream history carries no commit of its own, so deleting it loses nothing the bundle does not keep; every other branch is printed as kept (the old lane's `stamity-upstream/*` branches, `stamity-reset`, channel branches), and the prose says to close the old lane's pull request and issues and delete their branches by hand. A fork whose integration branch is not `main` substitutes it in both blocks and the guard. Signed commits: `git commit-tree -S` signs the reset commit only; the landing also brings upstream's commits, which carry no signature (D4-M8: 177 of the 178 commits between `v1.10.0` and `v1.11.0`, and all 243 between `v1.9.0` and `v1.10.0`), so a "Require signed commits" rule on `main` refuses the landing unless its bypass list names whoever merges — GitHub's rules page read on <D> (unverified here: no repository with that rule was available); never squash, which drops the second parent. The guide's APM Renovate samples (`docs/enterprise-forks.md:733-760`) are replaced by `extends renovate/apm.json` (u2-apm-renovate-preset), whose retargeted rules require the suffix; this unit's docs check holds that no sample rule in the guide can match a plain upstream tag.
- **testCriteria, added:** **(c′)** after block 1 alone, before the landing, origin still carries `plugin-dist`, `plugins/v1.0.0`, every `v*` tag and the upstream-only branch `replay-x` (inbox ``"block 1 deletes `plugin-dist` and the mirrored `plugins/*` tags right after pushing the reset branch" at 077e8a78``); after block 2, origin no longer carries `plugin-dist`, `plugins/v1.0.0`, upstream's `v1.0.0`…`v1.3.0` (objects equal to upstream's) or `replay-x` (its head an upstream `main` commit), and still carries `main`, `legacy/main-<12-hex>`, the fork's own tag `v1.0.0-acme.1` and the fork's own branch `acme-work`, whose head is a fork commit; block 2's stdout names `kept refs/heads/acme-work` and `kept refs/heads/stamity-reset`. **(e′)** the `gh` stub's log shows `workflow disable upstream-update.yml --repo acme/stamity-private` as block 1's only `gh` call, logged before its first `git push`, and `workflow enable upstream-update.yml --repo acme/stamity-private` as block 2's only `gh` call, logged after the guard; no logged call names `actions/permissions` (inbox ``"block 1 disables all repository Actions before pushing the reset branch" at 077e8a78``). **(i)** in the second fixture, whose local repository and origin carry the fork's own lightweight tag `v1.3.0` on a fork commit, block 1 exits 0 (inbox ``"fetching the upstream reset tag into a local tag of the same name fails" at 077e8a78``), the reset commit's second parent is upstream's `v1.3.0` commit, after block 2 origin still carries the fork's `v1.3.0` (its object differs from upstream's), and no `refs/stamity-reset/*` ref remains locally. **(j)** with a `pre-receive` hook on origin that refuses deleting `refs/tags/v1.0.0` (a stand-in for a ruleset), block 2 exits 0, prints `kept refs/tags/v1.0.0: the push was refused`, deletes the other refs above, and still logs the enable call. **(k)** every fenced `json` block of `docs/enterprise-forks.md` that carries `"matchManagers": ["apm"]` either has an `extends` naming a shipped preset or an `allowedVersions` whose regex refuses `v1.12.0` (`test/docsPages.test.ts`). **(f′)** as (f), with the guard's `git fetch --no-tags origin main`. Fixture additions (`test/upstream/resetRecipe.test.ts`): the upstream fixture gains a branch `replay-x` at an upstream `main` commit, mirrored to origin with the rest; the fork pushes its own tag `v1.0.0-acme.1` and branch `acme-work`; the second fixture replaces its local and origin `v1.3.0` with a fork-made lightweight tag; case (j) installs the `pre-receive` hook in `origin.git/hooks/`.
- **edgeCases, added:** A lane run in progress at `disable` → it finishes; the prose's `gh run list` line names it, and nothing in the blocks waits. `gh workflow disable` refused because the workflow file is absent on the default branch (a fork without a lane) → there is no lane to stop; the step prints the refusal and the reader goes on. A `v*` or `plugins/v*` ruleset refuses a delete → `kept <ref>` and the block continues to the enable call (case (j)). A branch with no commit of its own → deleted (every commit is upstream's; the bundle keeps its name). A tag on origin whose name upstream also carries but whose object differs (a fork's own tag of that name) → kept (case (i)). The integration branch is not `main` → substituted by the reader; the blocks name `main`.
- **Replaces:** "(c) origin no longer carries `plugin-dist` or `plugins/v1.0.0`, and still carries `main` and every `v*` tag it had;" → "(c) see (c′);" and "(e) the `gh` stub's log shows the first block's Actions-off call before its first `git push`, and the second block's Actions-on call last, after the merge;" → "(e) see (e′);"
- **From file 1 (merge, 2026-10-06):** after `git checkout "$OLD_MAIN" -- .stamity/upstream.json …`, the recipe runs `node scripts/fork-identity.mjs <identity arguments> --lane-config` to bring the old file up to the shipped template (identity gate, `identityFiles`); the fresh tree's version follows the fork version scheme (`<base>-<suffix>.1`, or the next N when the fork already released that base); the recipe says whether to carry `.stamity/upstream/integrations/` into the fresh tree (leaving it out is safe — history is the marker — while a carried record of a re-pointed tag would trip the moved-tag stop of `u1-lane-issues-freshness`); and its `fork-identity.mjs` step also rewrites the nine docs pages of `u1-fork-docs-identity`.
- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"the manual-push line commits `plugins: v${version}` without "from <source commit>"" at 077e8a78`` — aligns the manual-push subject with `release.yml:970`.
- Inbox fold (2026-10-08, run 2026-10-08_inbox-pass): ``"the reset block's `gh workflow disable` fails under `set -e`" at 077e8a78`` — tolerates that one failure.

### u3-settings-constraints — the repository settings a fork should apply, and the constraints an enterprise imposes

| Field | Content |
|---|---|
| `id` | u3-settings-constraints |
| `requirements` | REQ-UPSTREAM-023 |
| `files` | `docs/enterprise-forks.md` (a new `## Recommended settings and enterprise constraints` between `## Release your fork`'s end `:1022` and `## Roll the plugin out to your organization` `:1023`; `### Know what proves a release` `:994-1001`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Added`) |
| `interfaces` | **Current facts:** tag rulesets are described only for the canonical repository (`.github/release-controls-checklist.md:84-129`); every workflow pins actions to full SHAs; the environment names are `environment: fork-release` (`.github/workflows/fork-release.yml:409`) and `environment: npm-publish` (`release.yml:662`), plus the promotion environment `promote.yml` declares (u2-channels-promote, read at intake); the default distribution branch is `const DEFAULT_BRANCH = 'plugin-dist'` (`scripts/distribution-identity.mjs:21`); github.com-only refusals at `scripts/distribution-identity.mjs:190-192`, `:306-310`, `scripts/fork-identity.mjs:113`, `:151`, `src/cli/kit/packageName.ts:182`; the host boundary is explained under **Any other host.** in `### Add the optional token, and what it buys` (`:1264-1280`). **New section**, heading exactly `## Recommended settings and enterprise constraints` (`u3-quickstart` links it), with `### Rulesets` (a table `\| Target \| Rules \| Bypass \|`, each row's reason in the 2026-10-06 amendment below: tags `v*` and `legacy/*` — Restrict creations, Restrict updates, Restrict deletions, Block force pushes — the maintainers who cut releases; tags `plugins/v*` — Restrict updates and Restrict deletions, and Restrict creations too only when the release pushes the distribution with an identity a ruleset can list (a deploy key or a GitHub App); branch `plugin-dist` — Restrict deletions only; each channel branch (`plugin-stable`, `plugin-canary` when used) — Restrict creations, Restrict updates, Restrict deletions, Block force pushes — bypass "Deploy keys", the promotion's key stored as `STAMITY_PROMOTE_DEPLOY_KEY` in the `plugin-promotion` environment; the integration branch — allow merge commits, as `## Land the update branch` says), `### The release and promotion environments` (required reviewers on `fork-release` and on the promotion environment; a deployment tag rule `v*-<suffix>.*` on `fork-release`; create both before the first tag), `### Immutable releases` (turn them on: a published release's tag and assets cannot change, which is a fork's tamper guard; GA 2025-10-28; build attestations are opt-in for a fork release and need GitHub Enterprise Cloud on a private or internal repository; `gh attestation verify` checks an asset), `### Enterprise constraints` (allowed-actions policies, including requiring actions pinned to a full-length commit SHA — every shipped workflow already pins, and the generated `copilot-setup-steps.yml` pins in its `managed` form, `copilot.setupSteps`; whoever pushes that workflow needs the `workflows` permission; GitHub Packages' npm registry needs a classic personal access token with `read:packages`, package visibility follows the repository, and a registry mirror is the alternative; hosts: the public GitHub host only (the page never types the host name: `BARE_DOMAIN` at `test/docsPages.test.ts:410` refuses it in prose, which is why `:1274` already says "the public GitHub host") — GitHub Enterprise Server and GitHub Enterprise Cloud with data residency are refused by `scripts/distribution-identity.mjs` and stay on the drop list, one line, linking **Any other host** under `[Add the optional token, and what it buys](#add-the-optional-token-and-what-it-buys)`). `### Know what proves a release` (`:994-1001`) gains one sentence pointing at `### Immutable releases`. **New case** "the enterprise-forks guide names the settings a fork applies, held to the workflows that read them": take the section; every `environment:` value in `.github/workflows/fork-release.yml` and `.github/workflows/promote.yml` (parsed with `yaml`, as `test/ci/workflow.test.ts:16` does) appears in it as a code span; every code span in it that names an environment is one of those values; it contains `` `v*` ``, `` `legacy/*` ``, `` `plugins/v*` ``, `` `v*-<suffix>.*` ``, the `DEFAULT_BRANCH` value read by regex from `scripts/distribution-identity.mjs`, "Immutable releases", `` `read:packages` ``, "full-length", `` `workflows` `` and "public GitHub host". **CHANGELOG** `### Added`: "**The settings a fork applies, and the constraints an enterprise imposes.** The enterprise guide lists the rulesets for release, legacy and distribution tags and the distribution and channel branches, the release and promotion environments, immutable releases as a fork's tamper guard, the allowed-actions SHA-pin policy, the `workflows` permission the Copilot setup workflow needs, GitHub Packages' token, and the boundary to the public GitHub host." **Follows:** `.github/release-controls-checklist.md:84-108` (the console steps for a tag ruleset, in words). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case among the passes, and "the enterprise-forks guide names every variable and secret the fork release workflow reads, and no other" still passes. **Red check:** with `fork-release` renamed in a scratch copy of `fork-release.yml`, the new case fails naming the missing environment. **Given** `rg -n -i "ghe\.com\|\.ghe\." docs/enterprise-forks.md`, **then** it prints nothing (`BARE_DOMAIN`). **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | `promote.yml` declares no `environment:` (u2-channels-promote chose a different gate) → the case reads only `fork-release.yml`, and the section names the gate the landed workflow uses. The ruleset bypass list cannot name the Actions token for a tag ruleset → unverified at drafting; read GitHub's rulesets page on <D> and state the supported bypass (a GitHub App or a role); never a step the console cannot do. A fork that does not publish npm → the GitHub Packages paragraph says it applies only to a fork with `--registry`. |
| `depends_on` | u3-reset-guide, docs/plans/016-fork-distribution-02.md (u2-channels-promote), docs/plans/016-fork-distribution-01.md |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs && npm run lint` |

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** `docs/enterprise-forks.md` (`### Know what proves a release` `:996-1003`: the sentence "the maintainer's decision of 2026-09-24 leaves them unbuilt until a company asks for them" only if file 01's attestation unit left it; the section now runs between `## Release your fork`'s end `:1023` and `## Roll the plugin out to your organization` `:1025`).
- **interfaces, added:** **`### Rulesets`, rows replaced** (table `| Target | Rules | Bypass |`): tags `v*` and `legacy/*` — Restrict creations, Restrict updates, Restrict deletions, Block force pushes — the maintainers who cut releases (a reset's `legacy/main-…` tag and its removal of plain upstream `v*` tags need that bypass, or run before the ruleset exists). Tags `plugins/v*` — Restrict updates and Restrict deletions, and Restrict creations too **when the release pushes the distribution with an identity a ruleset can list** (a deploy key or a GitHub App): GitHub cannot list a workflow's per-run `GITHUB_TOKEN` as a bypass actor (u2-channels-promote's research: HTTP 422 "Actor GitHub Actions integration must be part of the ruleset source or owner organization"), and `fork-release.yml` pushes the distribution with it (`.github/workflows/fork-release.yml:673`, `:686`, `:744-746`), so today a creation rule refuses your own release; until the push changes, any writer can create a higher `plugins/v…-<suffix>.N` tag, which the suffix-aware presets offer every consumer — keep write access narrow, point consumers at a channel (a promotion verifies the tag against the release's assets), and verify attestations where they are on (SECURITY; decision S11). Branch `plugin-dist` — Restrict deletions only: the release force-pushes it with the per-run token, and a stricter rule fails the release at `Push plugin distribution` (`.github/release-controls-checklist.md:126-129`). Each channel branch (`plugin-stable`, `plugin-canary` when used) — Restrict creations, Restrict updates, Restrict deletions, Block force pushes — bypass "Deploy keys", with the promotion's key stored as `STAMITY_PROMOTE_DEPLOY_KEY` in the `plugin-promotion` environment (u2-channels-promote); without the creation rule any writer can create a channel branch no promotion made, and every client following it installs it (SECURITY). The integration branch — allow merge commits (`## Land the update branch`); pull requests and reviews as you require (the lane always opens a pull request, and the landing stays a person's decision); signed commits under `### Signed commits`.
- **interfaces, added:** **`### The release and promotion environments`** gains: with **Prevent self-review** on, the person who pushed the tag or dispatched the promotion cannot approve their own run even as a required reviewer, so name at least two reviewers (or a team of two or more), or leave self-review allowed with one maintainer (GitHub's environments page, read 2026-10-06).
- **interfaces, added:** **`### Signed commits`** (new `###`): the lane's merge commit is made by `git commit` in the workflow with no signing (`commitInWorktree`, `scripts/upstream.mjs:1653-1660`), and upstream's own commits carry no signature (D4-M8), so a "Require signed commits" rule on the integration branch refuses a lane landing unless its bypass list names the identity that merges; a squash, which GitHub signs, destroys the ancestry the lane reads (`## Land the update branch`). How GitHub presents the refusal on a pull request is read from its rules page on <D> (not measured here); the reset's `-S` signs one commit only (u3-reset-guide).
- **interfaces, added:** **`### The lane's GitHub App`** (new `###`, heading text exact: u3-quickstart links it): create a GitHub App owned by the organization with repository permissions Contents: write, Pull requests: write and Issues: write (the lane opens issues), Metadata: read, and Administration: read only if your policy allows it (without it the landing-policy check reads *not fully checked*, as `## Land the update branch` says); give it no Workflows permission — the lane never pushes a workflow change, and GitHub then refuses one outright, a second guard. Install it on the fork repository only: one installation has one permission set, so adding another repository to it grants the same write access there. The workflow mints a one-hour token per run with the GitHub-owned `actions/create-github-app-token`, `owner` and `repositories` set explicitly (with `owner` and no `repositories` the token covers every repository of the installation; with neither, only the workflow's own) and `permission-*` inputs narrowing it to the three writes. The App id and private key go where the landed workflow reads them (file 01's App-token unit; name them as landed), the key in an environment limited to the default branch. The per-run repository token and the fine-grained `STAMITY_UPSTREAM_TOKEN` stay the fallbacks (`### Add the optional token, and what it buys`).
- **interfaces, added:** **`### Immutable releases`** — the attestation sentence becomes: build attestations are opt-in for a fork release (file 01's attestation unit; its variable as landed), and need GitHub Enterprise Cloud on a private or internal repository; a consumer verifies an asset with `gh attestation verify <asset> --repo <owner>/<repo>`; npm provenance is for npmjs.org only, so a fork on GitHub Packages carries attestations and checksums, not provenance.
- **interfaces, added:** **`### Enterprise constraints`** gains: (a) an allowed-actions policy that admits only GitHub-owned actions meets one other action in the inherited workflows, `step-security/harden-runner` at `e14015d583714f6e62063499dc959a02595150a1` (v2.21.1), used six times (`.github/workflows/release.yml:129`, `:579`, `:731`; `.github/workflows/pack-signing-rehearsal.yml:39`, `:111`, `:199`), all in jobs guarded to the public canonical repository (`release.yml:83`, `:558`, `:654`; `pack-signing-rehearsal.yml:30`, `:101`, `:192`); both workflows still trigger in a fork (every `v*` tag; a `main` push touching their paths, `pack-signing-rehearsal.yml:4-13`), and whether the policy fails such a run although its jobs are skipped is unverified — allowlist that SHA, or disable the two workflows in the fork (`gh workflow disable release.yml`, `gh workflow disable pack-signing-rehearsal.yml`), which do no work there; the lane itself uses no non-GitHub action. (b) GitHub Packages' npm registry takes only a classic personal access token (SSO-authorised) with `read:packages`; the package's visibility follows its repository, and the fork release refuses a public repository and checks the published package's visibility (file 01's visibility check; its variable and messages as landed); the release asset installs with no registry token ([Install without a registry token](#install-without-a-registry-token)).
- **testCriteria, added:** **Given** the case "the enterprise-forks guide names the settings a fork applies, held to the workflows that read them", **then** it also requires "Restrict creations" in the `v*` row and in the channel row, `STAMITY_PROMOTE_DEPLOY_KEY`, "Deploy keys", "Prevent self-review", "Require signed commits", `gh attestation verify`, "classic", and `step-security/harden-runner` with the 40-hex SHA that `.github/workflows/release.yml` pins (read by regex, so a pin bump moves the page or fails here); every `vars.` or `secrets.` name containing `APP` that `.github/workflows/upstream-update.yml` reads appears as a code span under `### The lane's GitHub App`; the section does not contain "not built"; and the `plugins/v*` row is derived: when the `Push plugin distribution` step of `fork-release.yml` reads a deploy-key secret, the row contains "Restrict creations", else the section contains `GITHUB_TOKEN` and "creation" in the gap sentence (`test/docsPages.test.ts`). **Red checks**, each once and reverted: with the harden-runner SHA changed in a scratch copy of `release.yml`, the case fails naming it; with `fork-release.yml`'s push step given a deploy-key secret in a scratch copy, the case fails until the `plugins/v*` row carries "Restrict creations".
- **edgeCases, added:** File 01's App-token unit names no `APP` variable (it took another shape) → the subsection names what the landed workflow reads, and the `APP`-derived check reads that shape's names instead (named in the run record). A fork's plan gives environments no required reviewers on a private repository (Free, Pro and Team plans) → the section says so beside the two-reviewer advice. GitHub lets the per-run token bypass a ruleset by <D> → the `plugins/v*` row states it with the page's date and the creation rule applies as for the other tags.
- **Replaces:** "tags `plugins/v*` — restrict updates and deletions — the identity the release workflow pushes as, for creation; branches `plugin-dist` and each channel branch (`plugin-stable`, `plugin-canary` when used) — restrict deletions — the release and promotion workflows' identity may force-push;" → the `plugins/v*`, `plugin-dist` and channel rows above.
- **From file 1 (merge, 2026-10-06):** fork attestations are built, opt-in (`STAMITY_RELEASE_ATTEST=true`, `u1-fork-attestations`), need a public repository or GitHub Enterprise Cloud, and are checked with `gh attestation verify`; the constraints list names the App's three permissions (Contents, Pull requests and Issues write) on a one-repository installation, that `actions/create-github-app-token` and `actions/attest-build-provenance` are GitHub-owned, and the variables and secrets file 1 reads: `STAMITY_RELEASE_ATTEST`, `STAMITY_RELEASE_PUBLIC`, `STAMITY_UPSTREAM_APP_CLIENT_ID`, `STAMITY_UPSTREAM_APP_KEY`, `STAMITY_UPSTREAM_SCHEDULE`, `STAMITY_LANDING_POLICY`, and the release deploy key below.
- **Tag creation (merge, 2026-10-06; replaces the drafted "recommend the creation rule only for a bypassable push identity"):** file 1's `u1-fork-release-hardening` adds an optional deploy-key push for `plugin-dist` and `plugins/v*` (as `promote.yml` does for channels), so the guide recommends restricting the creation, update and deletion of `plugins/v*` tags with that deploy key as the only bypass; a fork that sets no key restricts updates and deletions and is told the creation gap.
- **Scanner incidents (brief F8, merge 2026-10-06):** the guide names the upstream test-data commits whose credential-shaped literals enterprise scanners flagged (`4a68125b` and `a86a8db4`, 2026-09-24, in `test/ci/forkIdentityScript.test.ts`), so a fork can close those older incidents as test data; file 1's `u1-secret-shaped-fixtures` builds such values at run time from then on.

### u3-cli-pin-update-paths — how a repository on the CLI route pins the CLI and takes an update

| Field | Content |
|---|---|
| `id` | u3-cli-pin-update-paths |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/enterprise-forks.md` (`### Consume the release`, `:1003-1013`); `docs/getting-started.md` (`## Keeping your setup current`, `:365-376`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** `### Consume the release` (`:1003-1013`) covers APM refs and the `.npmrc` scope mapping only; `## Keeping your setup current` (`docs/getting-started.md:365-376`) shows `npx -y @zomarit/stamity@<version> sync`. **New**, under `### Consume the release` (heading text unchanged; `u3-quickstart` links it): `#### Pin the CLI` — with a `package.json`: `npm install --save-dev --save-exact @<scope>/stamity@<version>`; without one: nothing to install, because every call the setup writes is already `npx -y @<scope>/stamity@<version> <verb>` (or `npx --no …` for a fork no registry serves; a fork's calls name its registry from 1.12.0, file 0 — `:175-200` re-read at intake), so the version written into the repository is the pin; private registries: the existing `.npmrc` line and `npm login --scope --registry`; `renovate/companion.json` pins the dev dependency exactly and moves suffixed fork versions (`<x.y.z>-<suffix>.<n>`, `ignoreUnstable: false`; `docs/plans/016-fork-distribution-01.md (u1-renovate-suffix)`). `#### Take an update` — recommended: one pull request per repository from the organization's orchestrator running `npx -y @<scope>/stamity@<new> upgrade --to <new> --json` (what `upgrade` refuses and changes, from the landed `node dist/cli.js upgrade --help`); alternative: Renovate bumps the pin and regenerates through `postUpgradeTasks`, which only a self-hosted Renovate can run and only for commands its global configuration allows in `allowedCommands` (formerly `allowedPostUpgradeCommands`); the risk, stated plainly: the command runs with Renovate's token, which can push workflow files, so allow exactly one anchored command and keep the update pull request under review. Two `json` blocks, the repository configuration `{ "extends": ["github><owner>/<repo>//renovate/companion.json"], "packageRules": [{ "matchPackageNames": ["@<scope>/stamity"], "postUpgradeTasks": { "commands": ["npx --no stamity sync"], "executionMode": "update" } }] }` and the self-hosted global configuration `{ "allowedCommands": ["^npx --no stamity sync$"] }` (no templating needed: after the bump the installed dev dependency is the new version, so `npx --no stamity sync` runs it). Each block's provenance line says it is transcribed from Renovate's configuration-options and self-hosted-configuration pages on <D> and that no run here executed it. `docs/getting-started.md:365-376`: the command becomes `npx -y @zomarit/stamity@<version> upgrade --to <version>` if u2-upgrade-verb did not already move it, with one sentence that `sync` at the new version is the same engine update without the pin move. **New case** "the CLI route's pin and update paths name both forms and the token risk": the `### Consume the release` section contains `--save-exact`, `upgrade --to`, `postUpgradeTasks`, `allowedCommands`, `allowedPostUpgradeCommands` and "token"; both `json` blocks parse; every string in the first block's `postUpgradeTasks.commands` matches one regex in the second block's `allowedCommands`. `docs/getting-started.md:5` to the commit form. **Follows:** `docs/plugins.md:525-564` (the Renovate presets: what each does, a `json` block a consumer extends, and its provenance line). **CHANGELOG** `### Changed`: "**How a repository on the CLI route pins and updates the CLI.** The enterprise guide shows the exact dev-dependency pin, the pin a repository without `package.json` already carries in every generated call, the companion preset for suffixed fork versions, and the two update paths: `stamity upgrade` in a pull request from your orchestrator, or Renovate's post-upgrade task on a self-hosted Renovate, with the risk of the token it runs with." |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "the enterprise-forks guide states what a rename carries and what it does not" among the passes. **Red check:** with the first block's command changed to `npx stamity sync` in a scratch copy, the new case fails on the regex match. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | Renovate's option names differ on <D> from the planning run's reading → the page uses the names on the page read that day and keeps the former name as "formerly"; the run record names the change. `upgrade --to` refuses because the client set changed → the page names `--allow-client-change` as the operator's decision, never a default. A fork no registry serves → the pin section says the `npx --no` form needs the CLI installed, through the plugin's bundled runtime or a dev dependency. |
| `depends_on` | u3-settings-constraints, docs/plans/016-fork-distribution-00.md, docs/plans/016-fork-distribution-02.md, docs/plans/016-fork-distribution-01.md |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** `test/detect/repoAnalyzer.test.ts` (one case in `describe("analyzeRepo")`, `:80`); `docs/enterprise-forks.md` (`### Consume the release` is `:1005-1015` at `d10db029`); `docs/getting-started.md` (`## Keeping your setup current` is `:365`).
- **interfaces, added:** **`#### Pin the CLI` gains the pin folder.** A dedicated folder (`tools/stamity/` in the examples) holds `package.json` with one exact dev dependency, its lock and a scope-only `.npmrc`; the repository runs the CLI from it with `npm exec --prefix tools/stamity --no -- stamity <verb>` from the root (D4-M2: offline, the scope mapped to an unreachable registry, printed `1.11.0`, exit 0). **Root-only detection is a contract:** `analyzeRepo` reads the repository root (and the workspace packages a root manifest declares, `src/detect/repoAnalyzer.ts:407-458`), so the folder changes no generated byte (D4-M3: the folder committed with its `node_modules` on disk, `check` exit 0, "drift: clean", and `sync` changed only `.stamity/manifest.json`; the same `package.json` at the root drifts one file; D4-M4: also with a root `workspaces: ["tools/*"]` covering the folder, whose `package.json` carries no `name`). The contract is pinned by the new detection case below; the page advises keeping the folder's `package.json` unnamed or outside any workspace glob. Generated calls of a fork name its registry (file 0's registry-bound calls; quote the landed form from a generated `AGENTS.md`), so a machine without the scope mapping reaches the fork's registry, never the public one; the registry's own credential is still needed, or the token-free install below. GitHub Packages' npm registry takes only a classic personal access token with `read:packages` (SSO-authorised) for every developer and pipeline.
- **interfaces, added:** **The shrinkwrap** (file 02): from 1.12.0 the package carries `npm-shrinkwrap.json`. npm honours a published shrinkwrap for `npm install` (the tree lands nested under the package) and for `npx -y <package>@<version>`: D4-M7 measured it through a local registry with npm 10.9.8 — a probe whose shrinkwrap pins `ms` 2.0.0 while a fresh resolution picks 2.1.3 got 2.0.0 both ways. So a pinned `npx` call and the pin folder both install the tree the release was tested with; `u3-release-1-12-0` step 13 re-measures it on the published package. The `st` bin prints its deprecation notice and goes at 2.0.0 (file 02).
- **interfaces, added:** **`#### Install without a registry token`** (new `####`, heading text exact): the release asset is the registry's tarball byte for byte (D4-M6: for 1.11.0 the asset's sha512 equals `npm view @zomarit/stamity@1.11.0 dist.integrity`; from 1.12.0 `release.json` names that integrity, file 02). Download it with read access to the release's repository (`gh release download v<version> --repo <owner>/<repo> --pattern '<scope>-stamity-<version>.tgz'`; a private fork's release needs a token with `contents: read`, not `read:packages`), compare its sha512 with the pin folder lock's `integrity`, run `npm cache add <asset>`, then `npm ci --prefer-offline --ignore-scripts` in the pin folder. D4-M6 measured it (npm 10.9.8, Node 22.22.3, scratch npm config and cache, the scope mapped to an unreachable registry and the lock's `resolved` pointing there): exit 0, 88 packages — the CLI from the cache by its integrity with no request to the scope's registry, its 87 dependencies from the public registry; without `npm cache add`, the same `npm ci` exits 1 on `ECONNREFUSED` to the scope's registry. One `sh` block with that sequence and its provenance line; the unit's two Renovate `json` blocks stay as planned.
- **interfaces, added:** **`#### Check a consumer in CI`** (new `####`, heading text exact): run `check` with the approved release's expectations (file 0's `check --expect-version <v> --expect-tools <csv> --expect-mode <mode>`; flag names as landed), read exit 3 ("re-sync needed", file 01) as "run the pinned `sync` in this pull request" and exit 1 as a failure to review; set `STAMITY_NO_UPDATE_CHECK=1` (or `CI=true`) so `check` sends no registry request (name file 02's landed notice gate); run the CLI in a job or container that holds no write credential, because a same-user child process can read its parent's start-up environment (on Linux `/proc/<pid>/environ` passes the same-user check; macOS hands a same-user process's arguments and environment to `sysctl kern.procargs2` — a third-party source, named as such), and do the clone, install, push and pull-request work in a separate step that treats the CLI's output as untrusted input — the split `fork-release.yml` already makes between `gates` and `publish`.
- **interfaces, added:** **`#### Take an update` gains the orchestrator's lessons** (brief C13, as the pattern only; the fleet workflow stays on the drop list): one pull request per repository; while it is open, merge the default branch into it and run the pinned `sync` again rather than rebuilding it; skip a repository whose pin is current and whose `check` exits 0; the writer is a GitHub App token requested with `owner` and `repositories` set and `permission-*` inputs narrowed to contents, pull requests and workflows, its key in an environment limited to the default branch; a removal also takes the repository off the target list (else the next run reinstalls it), and an open removal pull request is rebuilt from the default branch, because its own commit deleted the manifest `clean` reads; where a ruleset requires signed commits, create the commits through the GitHub API (how GitHub signs them is read from its page on <D>). Renovate's `postUpgradeTasks` run only on a self-hosted Renovate, only for commands its global `allowedCommands` (formerly `allowedPostUpgradeCommands`) admits, and with the token Renovate holds — the risk the vendor's page states (read 2026-10-06).
- **testCriteria, added:** **Given** a fixture root with `README.md` and a root `package.json` holding one `test` script, **when** `analyzeRepo` runs before and after `tools/stamity/package.json` (`{"private":true,"devDependencies":{"@acme/stamity":"1.12.0-acme.1"}}`), `tools/stamity/package-lock.json`, `tools/stamity/.npmrc` and `tools/stamity/node_modules/@acme/stamity/package.json` are added, **then** the two results are deep-equal except `rootDir` ("a pin folder below the root changes no detected fact", `test/detect/repoAnalyzer.test.ts`). **Given** the case "the CLI route's pin and update paths name both forms and the token risk", **then** the section also contains `npm cache add`, `--prefer-offline`, `--ignore-scripts`, `npm exec --prefix`, `npm-shrinkwrap.json`, `STAMITY_NO_UPDATE_CHECK`, `/proc`, "classic" and the landed `--expect-` flag names, and the headings `#### Install without a registry token` and `#### Check a consumer in CI` exist (`test/docsPages.test.ts`). **Given** the unit's head, **when** D4-M6's sequence re-runs against the newest published release's asset with scratch npm config and cache, **then** `npm ci` exits 0 with no request to the scope's registry, and the run record keeps the log lines.
- **edgeCases, added:** npm 11 treats `cache add` or `--prefer-offline` differently → the unit re-measures on the npm the docs name, and the provenance line carries that version. The asset of the release under test predates `release.json`'s integrity field → compare against the lock's `integrity` alone and say so. File 0's flag names or file 01's exit code differ from this cell → the page uses the landed ones; the docs case reads the flag names from `node dist/cli.js check --help`. A pin folder covered by a workspace glob with a named `package.json` → unmeasured; the page advises against it.
- **Merge note (2026-10-06):** file 1's `u1-drift-cause` lands the root-only detection contract and its test; this unit documents the contract and extends that test if a case is missing, rather than adding a second one.

### u3-quickstart — the enterprise quickstart's days 0 to 2 updated last

| Field | Content |
|---|---|
| `id` | u3-quickstart |
| `requirements` | REQ-UPSTREAM-022, REQ-PLUGIN-043 |
| `files` | `docs/enterprise-quickstart.md` (`:5-10`, `:22-26`, `:28-59`, `:61-66`); `test/docsPages.test.ts` (`:2346-2390`); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** 66 lines; 5 + 6 + 7 day steps, each one sentence with one link whose text is a heading of `enterprise-forks.md` or `plugins.md`. **Pinned** (`test/docsPages.test.ts:2346-2390`): links both guides, no fenced block longer than one line, ≤ 120 lines, every link into a mapped guide names a heading that guide carries (map built for `[ENTERPRISE_FORKS, PLUGINS]` at `:2366`), `routed ≥ 16` (`:2379`), one link per day bullet. **New steps** (each one sentence, one link, link text = a heading on the target page): Day 0 — first: "Decide which route each team's clients take with [Which route fits](choose-a-route.md)."; after the prerequisites: "Re-setting up a fork you already run? Back it up and land the fresh tree as a merge commit, as [Reset or re-import under protected branches](enterprise-forks.md) shows, instead of importing."; before turning workflows on: "Apply the rulesets, the environments' reviewers and immutable releases from [Recommended settings and enterprise constraints](enterprise-forks.md)." Day 1 — after arming: "Dispatch the release rehearsal from the release branch and push the tag only once it is green, as [Tag a release](enterprise-forks.md) shows." (confirm at intake that `### Tag a release` names `scripts/ci/fork-probe.mjs`, `docs/plans/016-fork-distribution-01.md (u1-fork-ci-job)`; otherwise link the heading that does); the APM step reworded to the slim package ("…from the slim package each release builds…"); new: "Pick the channel or the tag every client points at, and move a channel only through the promotion workflow, as [Choose a channel or a tag](enterprise-forks.md) explains."; the rollout step reworded to every client ("Roll the plugin out client by client — Claude Code, Copilot, VS Code, Cursor and Codex — with [Roll the plugin out to your organization](enterprise-forks.md)."). Day 2 — new: "Move each repository on the CLI route to the new version with one reviewed pull request, as [Consume the release](enterprise-forks.md) describes."; new: "Promote the next release to canary, let it soak, then to stable — or promote the previous tag to roll back — under [Choose a channel or a tag](enterprise-forks.md)." `## Who does what` Admin cell: "The prerequisites, the rulesets, environments and other repository settings, and each client's organization route." `## Where to go next` gains "[Choose a route](choose-a-route.md) — the three routes side by side, and what each client and IDE gets." Re-open trigger `:6-10` names `docs/choose-a-route.md` beside the two guides; `:5` to the commit form. **Follows:** `docs/enterprise-quickstart.md:28-59` (one sentence and one link per step, the link text a heading of the page it hands off to). **Test change** (`:2346-2390`), with a `TEST CHANGE, justified:` comment naming this unit: the case name "…routes into the two guides…" → "…routes into the three guides…"; `expect(targets).toContain("choose-a-route.md")`; the heading map at `:2366` becomes `[ENTERPRISE_FORKS, PLUGINS, CHOOSE_A_ROUTE]`; `routed` moves from `≥ 16` to `≥ N`, N = the count of links into the three mapped pages after the edit (expected 33: 30 day steps plus three "where to go next" links whose text is an H1), counted, not typed from this cell. **CHANGELOG** `### Changed`: "**The enterprise quickstart takes the route choice, the reset, the settings and the channels.** Day 0 starts with choosing a route and names the reset and the recommended settings; day 1 adds the fork's own gate before each tag and the channel or tag every client points at; day 2 adds the CLI route's update pull requests and promoting a release through canary to stable." |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the renamed quickstart case among the passes with `routed` ≥ N. **Given** `wc -l < docs/enterprise-quickstart.md`, **then** it prints ≤ 120. **Red check:** with `## Which route fits` renamed in a scratch copy of `docs/choose-a-route.md`, the case fails naming "Which route fits". **Given** each day section, **then** every bullet carries exactly one link. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | A heading a step links was renamed by an earlier unit → the step's link text follows the landed heading; the pin fails otherwise, which is the point. The page passes 120 lines → merge two neighbouring steps that hand off to the same section; never raise the budget. File 01 put the fork gate under another heading → link that heading. |
| `depends_on` | u3-cli-pin-update-paths, docs/plans/016-fork-distribution-01.md (u1-fork-ci-job) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** none.
- **interfaces, added:** new steps, each one sentence and one link whose text is a heading of the target page (read the landed headings at intake): Day 0 — "Create the lane's GitHub App with only the permissions the lane uses, as [The lane's GitHub App](enterprise-forks.md) describes." (after the rulesets step); the step that links ``Configure `.stamity/upstream.json` `` is reworded to "Point the update lane at the upstream, with the identity gate ahead of `check` and your integration branch named, in [Configure `.stamity/upstream.json`](enterprise-forks.md)." (file 01's lane-config writer). Day 1 — the fork-gate step becomes "Dispatch the release rehearsal from the release branch and push the tag only once it is green, as [Tag a release](enterprise-forks.md) shows." (file 01's npm dry run before the approval); new: "Turn on build attestations if your organization is on GitHub Enterprise Cloud, as [Know what proves a release](enterprise-forks.md) describes."; new: "Make `check` a required check in every consumer repository, with the approved version, clients and install mode as its expectations, as [Check a consumer in CI](enterprise-forks.md) shows." Day 2 — new: "Install the CLI in pipelines without a registry token, from the release asset, as [Install without a registry token](enterprise-forks.md) shows."; new: "Watch the lane and the releases it has not taken, counting only published releases, under [<the heartbeat subsection's heading>](enterprise-forks.md)." (u1-lane-issues-freshness adds it after `:1299`). `## Who does what`: the Admin cell gains "the lane's GitHub App"; the Platform team cell gains "the consumer check".
- **testCriteria, added:** **Given** the quickstart case, **then** `routed` ≥ N with N counted after the edit (expected 33: 30 day steps plus three "where to go next" links whose text is an H1), and every new step's link text is a heading the target guide carries (`test/docsPages.test.ts`). **Given** `wc -l < docs/enterprise-quickstart.md`, **then** it prints ≤ 120.
- **edgeCases, added:** A file-00 or file-01 unit a step names did not land → drop that step and say so in the run record; never link a heading that does not exist. The heartbeat subsection carries no heading of its own → link the nearest heading that contains the recipe.
- **From file 1 (merge, 2026-10-06):** one step each for `fork-identity.mjs --lane-config`, the lane's GitHub App, the two release variables (`STAMITY_RELEASE_ATTEST`, `STAMITY_RELEASE_PUBLIC`) and the release deploy key, the schedule variable and the landing-policy declaration.

### u3-route-proofs — a route proof that never reads an unrun leg as green

| Field | Content |
|---|---|
| `id` | u3-route-proofs |
| `requirements` | REQ-PLUGIN-044 |
| `files` | `scripts/qa/route-proof.mjs` (new); `test/qa/routeProof.test.ts` (new); `.github/release-controls-checklist.md` (one new line after the sixth line, `:255`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/qa/routeProof.test.ts`, **then** every case below passes. **Given** `foldConclusion`, **then** `success` → `passed`; `failure`, `timed_out`, `startup_failure` → `failed`; `skipped`, `cancelled`, `neutral`, `action_required`, `stale`, `null`, `undefined` → `not-run`. **Given** a `ci-jobs` leg with two matching jobs, both `success`, **then** `passed` with both names and the run URL in `evidence`; with one `skipped`, **then** `not-run` naming it; with one `failure` and one `skipped`, **then** `failed`; with no matching job, **then** `not-run` "no job matching …". **Given** a `ci-step` leg whose step is absent, **then** `not-run` "no step named …". **Given** a `qa-row` leg, **then** harness `passed` → `passed`, `performed` → `passed` with by and date, `accepted-unwalked` → `not-run` ("accepted without a walk is not a proof"), `not-run`/`unperformed`/absent → `not-run`, `failed` → `failed`. **Given** a `walk` leg with no answer, **then** `not-run`; with `--walked <id> --by <name>`, **then** `passed` carrying both. **Given** a `live` leg, **then** `not-done` with its owner and the account it needs, whatever the inputs claim. **Given** a rendered proof with one `not-run` leg, **then** the text never pairs that leg with `passed` (regex over its row) and its `Not done:` list names the leg and every live leg with its owner. **Given** `main` with a fake `gh` whose run reports another `headSha`, **then** exit 2 naming both shas; with a QA evidence file of another `sha`, **then** exit 2; with an unknown `--walked` id, **then** exit 2; with every non-live leg passed, **then** exit 0 and the `--out` JSON lists every catalogue leg; with one non-live leg `not-run`, **then** exit 1. **Given** `.github/workflows/ci.yml` and `nightly.yml` parsed with `yaml`, **then** each `ci-jobs` and `ci-step` leg's matcher matches exactly the job it names: `native-check` the job whose `name:` begins `check (`, `plugin-structure` the job whose `name:` begins `plugin route`, `apm-install` the job whose `name:` begins `apm route (`, `fork-gate` the job one of whose steps runs `scripts/ci/fork-probe.mjs`, and `native-four-clients` a step of the `headless-lane` job named `Scratch-repo dogfood (all four clients)`. **Given** `.github/release-controls-checklist.md`, **then** exactly one line names `` `node scripts/qa/route-proof.mjs` ``, and it contains "exits 0", "`failed`" and "release record". **Given** the unit's rehearsal at its own head, **then** the run record keeps the rendered table and the exit code. |
| `edgeCases` | The fork job is renamed by a later change → the workflow-matcher case fails naming `fork-gate`, never a silent `not-run`. A nightly dispatch on the candidate fails in a later step (a vendor install) while the dogfood step passed → `native-four-clients` reads the step, so it stays `passed`, and the job's failure is not this leg's. `gh` is not signed in → exit 2 with gh's own message. A harness row for a client the operator has no login for is `not-run` → the leg is `not-run` and the release's QA asks the maintainer whether to hold or ship with it named (`u3-release-1-12-0` step 9); the module never folds it. |
| `depends_on` | docs/plans/016-fork-distribution-01.md (u1-fork-ci-job), docs/plans/016-fork-distribution-02.md (u2-apm-floor-current and u2-apm-coexistence-fork and u2-hooks-self-filter-vscode) |
| `verify` | `npx vitest run test/qa/routeProof.test.ts test/ci/hookLatency.test.ts && npm run lint && npm run typecheck`, then the rehearsal command below at the unit's head |

`u3-route-proofs` interfaces:

- **Why a tool, and why this shape.** The legs mostly exist already: CI's `check` legs run the tarball smoke and the
  dogfood check (`release.yml:301-302` shape, `ci.yml:360`); nightly's `Scratch-repo dogfood (all four clients)` step
  packs the tarball and runs `init` and `check` for all four clients (`.github/workflows/nightly.yml:146-192`); CI's
  `plugin route (structure and credential-free install)` job; the QA harness's `H4a`–`H4d` and `H5` rows
  (`scripts/qa/form.mjs:103-157`); CI's `apm route (…)` legs; the fork job file 01 adds. What is missing is one place
  that reads them all for ONE sha and refuses to call an unrun leg green, which `scripts/qa/run.mjs` does for its own
  rows ("WHAT IT NEVER DOES. Invent a pass.", `:15-19`) and nothing does across CI. **Follows:** `scripts/qa/form.mjs`
  (a frozen catalogue, a pure renderer, a status the renderer never decides) and `scripts/qa/bind.mjs:33`
  (`ROW_STATUSES`). It does NOT extend the harness's 14 rows: that would move `test/qa/form.test.ts:148` ("renders all
  fourteen rows"), `test/qa/run.test.ts:349` and the harness header, for rows that come from CI rather than from a run on
  this machine. Node built-ins plus `gh` through `execFileSync` with an argument array; the runner is injectable.
- **Module API** (`scripts/qa/route-proof.mjs`, all exported):
  - `LEG_STATUSES = Object.freeze(['passed', 'failed', 'not-run', 'not-done'])`; `ROUTES = Object.freeze(['native',
    'plugin', 'apm', 'fork'])`.
  - `ROUTE_LEGS` (frozen), each `{ id, route, kind, title, … }`, in this order: `native-check` (kind `ci-jobs`,
    workflow `ci`, `job: /^check \(/`); `native-four-clients` (kind `ci-step`, workflow `nightly`,
    `job: /^headless lane/`, `step: 'Scratch-repo dogfood (all four clients)'`); `plugin-structure` (`ci-report`, `ci`, `/^plugin route/`, artifact `plugin-route-report`); `plugin-claude` (kind `qa-row`, `row: 'H4a'`); `plugin-cursor` (`H4b`); `plugin-copilot-cli`
    (`H4c`); `plugin-codex` (`H4d`); `plugin-lifecycle` (`H5`); `plugin-vscode` (kind `walk`, title "VS Code with Copilot,
    `chat.plugins.enabled` on, installs the Copilot root from the candidate's distribution, lists `st-work`, and a hook
    fires for a matching event and stays silent for another" — the steps are the load proof
    `docs/plans/016-fork-distribution-02.md (u2-hooks-self-filter-vscode)` recorded); `apm-install` (`ci-jobs`, `ci`,
    `/^apm route \(/` — the floor, the current client, the failure witness and the coexistence leg); `fork-gate`
    (`ci-jobs`, `ci`, the regex of the fork job's `name:` as u1-fork-ci-job lands it); `live-copilot-org` (kind `live`,
    title "Copilot enterprise managed settings install the plugin at sign-in", `owner: 'the maintainer'`,
    `needs: 'a GitHub organization on Copilot Business or Enterprise with a .github-private repository'`);
    `live-auto-update` (`live`, "a channel's auto-update delivers the next release to Claude Code, the Copilot CLI and
    VS Code", owner the maintainer, needs "a second release on the stable channel after 1.12.0, a machine under managed
    settings, and for Copilot an organization"); `live-cursor-team` (`live`, "Cursor's team marketplace imports the
    channel branch, and the Cursor CLI installs a Required plugin", owner the maintainer, needs "a Cursor Teams or
    Enterprise account").
  - `foldConclusion(conclusion: string \| null \| undefined): 'passed' \| 'failed' \| 'not-run'` — the table in
    `testCriteria`.
  - `foldLeg(leg, inputs) → { id, route, title, status, evidence, reason, owner?, needs? }` with `inputs = { sha, ci:
    { headSha, url, jobs: [{ name, conclusion, steps: [{ name, conclusion }] }] }, nightly: { …same }, qa: { sha, rows:
    [{ row, status, reason, rowHash }] }, walks: { [legId]: { by, on, note? } } }`. `ci-jobs`: the jobs whose `name`
    matches; any `failed` → `failed`, else any `not-run` → `not-run`, else `passed`; none → `not-run`. `ci-step`: the
    first matching job, then the step by exact name. `qa-row`: by the harness status, the evidence naming the row id, its
    `rowHash` and its reason (which carries each leg's client version, `scripts/qa/plugin-runs.mjs:68-70`).
    `walk`: `passed` only with an answer. `live`: always `not-done`.
  - `routeVerdicts(rows) → [{ route, proved: boolean, open: string[] }]` — `proved` iff every leg of the route whose status is not `not-done` is `passed`.
  - `renderRouteProof({ sha, rows }) → string` — a heading line naming the sha, a table `| Route | Leg | Status |
    Evidence |` with one row per catalogue leg in catalogue order (pipes in evidence escaped as `scripts/qa/form.mjs:160-162`
    does), then `Not done:` with one bullet per live leg (title, owner, needs) and per non-live leg not `passed`.
  - `parseArgs(argv)` and `async main(argv, { runGh, readFile, writeFile, stdout } = defaults) → exit code`.
- **CLI:** `node scripts/qa/route-proof.mjs --sha <40-hex> --ci-run <id> --nightly-run <id> --qa <evidence.json>
  [--walked <leg-id> --by <name> [--on YYYY-MM-DD] [--note <text>]]… [--published] [--out <path.json>]`, the `--walked`
  group repeatable. It runs
  `gh run view <id> --json headSha,url,jobs` for both runs (unverified at drafting: the field names; probe:
  `gh run view <a recent CI run id> --json headSha,url,jobs --jq '.jobs[0] \| keys, (.steps[0] \| keys)'`), refuses with
  exit 2 when a run's `headSha` or the QA file's `sha` is not `--sha`, prints the rendered proof to stdout, writes the JSON `{ sha, generatedAt, published, rows, verdicts }` when `--out` is given (default `.stamity/evidence/routes-<sha7>.json` is
  NOT assumed; the caller names it), and exits 0 when every route is proved, 1 when not, 2 on bad input, an unreadable
  file or a failing `gh`.
- **The checklist line** after `.github/release-controls-checklist.md:255`, one line: "A seventh line rides the cut,
  before the tag: `node scripts/qa/route-proof.mjs --sha <candidate> --ci-run <id> --nightly-run <id> --qa <evidence>`
  exits 0 on the release candidate — or, with no leg `failed`, each `not-run` leg carries the maintainer's recorded
  decision — and its table goes into the release record (REQ-PLUGIN-044; added <D>)." The test pattern follows
  `test/ci/hookLatency.test.ts:244-252`.
- **Rehearsal at this unit's head** (the proof of record runs at the candidate in `u3-release-1-12-0` step 9): build the
  distribution outside the repository (`npm pack --pack-destination <tmp>`, `node scripts/build-plugin-runtime.mjs
  --tarball <tgz> --out <tmp>/runtime`, `node scripts/build-plugin-distribution.mjs --out <tmp>/dist --runtime
  <tmp>/runtime --source-commit "$(git rev-parse HEAD)" --source-commit-date "$(git show -s --format=%cI HEAD)"`), run
  `node scripts/qa/run.mjs --skip-browser --dist <tmp>/dist --clients claude,cursor,copilot,codex --sha <head> --out
  <tmp>/qa.json`, dispatch `gh workflow run nightly.yml --ref <branch>`, then the CLI above with the head's CI run and the
  nightly run. Record the table and exit code; a `not-run` leg here is expected (no VS Code walk yet) and is the point:
  the rehearsal shows the tool refuses it.

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** `scripts/plugin-route-smoke.mjs` (`leg` `:694-696`; the four skips for want of `--invoke`: claude `:887-891`, cursor `:938-942`, copilot `:1068`, codex `:1319-1322`); `test/ci/pluginRoute.test.ts` (new cases); `.github/workflows/ci.yml` (the step `Plugin route smoke (no invocation legs)` `:659-663`, and one new step after it); `test/ci/workflow.test.ts` (the plugin-route lane's smoke pins `:672-686` plus the upload step).
- **interfaces, added:** **Why (r6 W9).** CI's `plugin route` job is green when its legs are SKIPPED (`ci.yml:655-658`: "a SKIPPED leg is green here"), so `plugin-structure` folded from the job's conclusion reads a run whose vendor installs failed as `passed` — the brief's "7 passed, 0 failed, 9 skipped" case. The leg now reads the smoke's per-leg results. **The smoke:** `leg(name, status, reason, requires = null)` returns `{ leg, status, reason, requires, command: null, exitCode: null, binaryVersion: null, transcriptSha256: null }`; the four skips that exist because the run lacks `--invoke` pass `requires: 'invoke'`; every other leg carries `requires: null` — a skip for an unset binary (`:1872`), a failed structure (`:1869`), a stop (`:1865`, `:1907`) or an earlier leg that could not run (`blocked`, `:1625-1628`) stays claimed. The JSON shape grows one key per leg; `scripts/qa/plugin-runs.mjs` reads `legs` and ignores it. **CI:** the smoke step ends `--client claude,cursor,copilot,codex --json "$RUNNER_TEMP/plugin-route.json"`; a new step `Upload the plugin route report` follows it with `if: always()`, `uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7.0.1` (the pin the other workflows use) and `with: { name: plugin-route-report, path: ${{ runner.temp }}/plugin-route.json, retention-days: 30, if-no-files-found: warn }`; the job's permissions stay `{ contents: read }`. **The route proof:** `plugin-structure` becomes kind `ci-report`: `{ id: 'plugin-structure', route: 'plugin', kind: 'ci-report', workflow: 'ci', job: /^plugin route/, artifact: 'plugin-route-report' }`; the CLI downloads the artifact with `gh run download <ci-run> --name plugin-route-report --dir <tmp>` and passes the parsed report as `inputs.reports['plugin-route-report']`; fold — the job's `foldConclusion` is `failed` → `failed`; no report → `not-run` "no plugin-route-report artifact on run <id>"; the report's `sha256s['scripts/plugin-route-smoke.mjs']` differs from the candidate's file → `not-run` "the report is another smoke's"; any claimed leg (`requires !== 'invoke'`) `FAIL` → `failed`; any claimed leg `SKIPPED` → `not-run` naming `<client> <leg>: <reason>`; all claimed legs `PASS` → `passed`, the evidence listing per client the claimed legs and, apart, "not claimed (needs --invoke): …". **Hook legs** (route `native`, kind `qa-row`): `native-hooks-claude` (`H1a`), `native-hooks-cursor` (`H1c`), `native-hooks-copilot` (`H1d`) fold as every `qa-row` does; `native-hooks-codex` (`H1b`) carries `headless: 'not-provable'`: harness `passed` → `passed`, `failed` → `failed`, anything else → `not-done` with `owner: 'the maintainer'` and `needs: 'an interactive Codex session, or a codex exec run with the project .codex/ layer trusted in the home Codex configuration — Codex loads project hooks only for a trusted layer (learning codex-hooks-default-on-and-codex-exec-ran-none)'`. **The Cursor CLI marketplace leg** `plugin-cursor-cli` (kind `walk`, `when: 'published'`, route `plugin`, title "The Cursor CLI adds this repository's marketplace with `--git-ref plugins/v<version>`, lists it, and a discovery run in a scratch repository lists `st-work`"): without `--published` → `not-done`, owner the maintainer, needs "the published `plugins/v<version>` tag: the Cursor CLI indexes only a remote git URL under a signed-in account"; with `--published` and a `--walked plugin-cursor-cli` answer → `passed`; with `--published` and no answer → `not-run`. **`routeVerdicts`:** `proved` iff every leg of the route whose status is not `not-done` is `passed`. **CLI:** `--walked <leg-id> --by <name> [--on YYYY-MM-DD] [--note <text>]` repeats, each group its own leg; `--published` marks the run made after publish. **Q2:** the `--out` JSON (`{ sha, generatedAt, published, rows, verdicts }`) is the dated per-client result `u3-release-1-12-0` attaches to the GitHub release; each `qa-row` leg's evidence carries the row's client version from its reason.
- **testCriteria, added:** **Given** a CI run whose `plugin route` job is `success` and whose report holds `copilot install` `SKIPPED` "STAMITY_COPILOT_BIN unset" with `requires: null`, **then** `plugin-structure` is `not-run` naming `copilot install`; **given** the brief's shape — 7 `PASS`, 0 `FAIL`, 9 `SKIPPED`, every `SKIPPED` carrying `requires: 'invoke'` — **then** `passed`; with one of the nine carrying `requires: null`, **then** `not-run`; with no report, **then** `not-run` "no plugin-route-report artifact"; with a claimed `FAIL`, **then** `failed`; with a report whose smoke digest differs from the candidate's, **then** `not-run` (`test/qa/routeProof.test.ts`). **Given** the smoke run without `--invoke` against the suite's built distribution with no client binary exported, **then** every leg whose reason contains `--invoke` carries `requires: 'invoke'`, every other leg carries `requires: null`, and every `structure` leg carries `requires: null` (`test/ci/pluginRoute.test.ts`). **Given** `ci.yml` parsed, **then** the smoke step contains `--json "$RUNNER_TEMP/plugin-route.json"`, the step after it is `Upload the plugin route report` with `if: always()`, a `uses:` pinned to 40 hex and `name: plugin-route-report`, and the job's permissions are still `{ contents: read }` (`test/ci/workflow.test.ts`). **Given** a QA file whose `H1b` is `not-run`, **then** `native-hooks-codex` is `not-done` with its owner and needs, and `native` reads proved when every other native leg passed; with `H1b` `passed`, **then** `passed`; with `failed`, **then** `failed` and exit 1. **Given** no `--published`, **then** `plugin-cursor-cli` is `not-done`; with `--published --walked plugin-cursor-cli --by m`, **then** `passed`; with `--published` alone, **then** `not-run` and exit 1. **Given** two `--walked` groups, **then** each leg carries its own signer. **Given** the workflow-matcher case, **then** the `ci-report` leg's matcher matches exactly the job whose `name:` begins `plugin route`.
- **edgeCases, added:** A CI run made before the upload step existed → no artifact → `not-run`, never `passed`. The artifact expired (30 days) → `gh run download` fails → `not-run` with gh's message, and the proof re-runs on a fresh CI run of the candidate. A later smoke adds a credential-bound leg without `requires: 'invoke'` → it is claimed and reads `not-run` until tagged, the safe direction; the smoke case above fails first.
- **Replaces:** "`[--walked <leg-id> --by <name> [--on YYYY-MM-DD] [--note <text>]] [--out <path.json>]`" → "`[--walked <leg-id> --by <name> [--on YYYY-MM-DD] [--note <text>]]… [--published] [--out <path.json>]`, the `--walked` group repeatable"

### u3-release-1-12-0 — cut, measure, prove, tag and publish 1.12.0, then close it

| Field | Content |
|---|---|
| `id` | u3-release-1-12-0 |
| `requirements` | REQ-PROVE-016 (the spec status gate), REQ-PROVE-017 (the release's eval line: "measured per `evals/SET-v7.md` — by the release's baseline run, or by an incremental run composed with it", and the release carries the artifact), REQ-PROVE-018 (every hand page re-attested at the cut), REQ-PROVE-020 (the measurement snapshot refreshed per release), REQ-PLUGIN-025 (the release eval run scores the `st-setup` and plugin-mode cases), REQ-PLUGIN-044 (the route proof executed at the candidate, with `u3-route-proofs`'s tool), REQ-UPSTREAM-030 (a pushed release tag never moves; a failed release cuts the next patch) |
| `files` | `package.json`, `package-lock.json` (the version); the version-bearing generated files (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `plugin.json`, `apm.yml`, the dogfood tree `.claude/**`, `.stamity/manifest.json`, `.stamity/generated/**`, `AGENTS.md`, `CLAUDE.md`, and the `main` catalogs u2-main-catalogs added); `CHANGELOG.md` (`## [Unreleased]` → `## [1.12.0] - <date>`, the footer `:1429-1430`); `docs/specs/board-writes.md` (`:4`) and every other spec reading `design` that a shipping plan names; `evals/run-of-record.json` (`path`, `release`, `exception`); `src/cli/docs/measurements.ts` (`MEASUREMENT_SNAPSHOT_PATH` once plan 014 file 2 landed); `docs/measurements.md`; `README.md` (`:1`, `:27-38`); `docs/doctrine.md` (`:5`, `:96-106`); every hand page's first comment (the 16 of `HAND_PAGES` plus `GOVERNANCE.md:1`); `test/docsPages.test.ts` (`:446-499`, `:546-597`); `docs/troubleshooting.md` (`:31-54`, the sample `check`); `docs/enterprise-forks.md` (the managed-settings block's `ref`); `evals/runs/<date>-run-<n>/**`; `evals/measurements/merge-ready-<date>.json`; `scripts/repo-hygiene.mjs` (`LARGE_FILE_EXCEPTIONS`, `:15-27`) and `test/ci/repoHygiene.test.ts`; `.github/release-controls-checklist.md` (`:192-226`, `:110-129`); `evals/SET-v7.md` (only a dated paragraph if a stale range is repaired); `.stamity/runs/<date>_release-1-12-0/` (record, ledger, QA record); at the close, each 1.12.0 run's `ARCHIVE.json` and compacted `summary.json` |
| `interfaces` | See the block below the table. amended 2026-10-08: 1.12.0 shipped from plan 016 file 0 (v1.12.0 at 8236fa2c); this unit's cut is the next release, 1.14.0 (1.13.0 is skipped) |
| `testCriteria` | **Given** the candidate with a local lightweight tag `v1.12.0` on it, **when** the release workflow's gate steps run in a clean worktree, **then** each exits 0, and the shipped-spec case "leaves no spec reading `design` that a released plan shipped" ran (it is in the reporter's pass list, not in its skip list) and passed. **Given** `grep -n '^status: design' docs/specs/*.md`, **then** no listed spec is named by a plan whose `stamp:` commit is an ancestor of the candidate. **Given** the eval artifact, **then** its `RESULTS.md` § 5 shows the golden rate ≥ 0.85 with every floor case passing, the guardrail hold = 1.0, the benign-twin false-refusal rate = 0, the probe accuracy ≥ 0.85, calibration 5 of 5, a case count equal to `find evals/cases-v6 -name '*.md' \| wc -l` at the candidate, and no skipped case; `evals/run-of-record.json`, read through `readRunOfRecord`, names it as `path` and reads `1.12.0` as `release`. **Given** `npx vitest run test/docsPages.test.ts test/cli/docs/measurements.test.ts test/ci/changelogLinks.test.ts test/ci/repoHygiene.test.ts`, **then** it exits 0 with `RELEASE_CUT_DATE` equal to the cut date and every hand page on the 1.12.0 cut form. **Given** the snapshot, **then** `node scripts/merge-ready-rate.mjs --json`'s numerator at the tag equals the snapshot's. **Given** `node scripts/qa/route-proof.mjs` at the candidate, **then** it exits 0, or, with no leg `failed`, each `not-run` leg carries the maintainer's recorded decision, and the record carries its table with the three live legs `Not done:` with their owner. **Given** the release run, **then** `gh run view <id> --json jobs` reads `success` for `gates and pack`, `apm route smoke` and `publish`. **Given** `npm view @zomarit/stamity@1.12.0 dist.attestations.provenance.predicateType`, **then** it prints `https://slsa.dev/provenance/v1`, and `npm view @zomarit/stamity dist-tags.latest` prints `1.12.0`. **Given** `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.12.0`, **then** both name one sha whose commit has no parent; after the promotion, `refs/heads/plugin-stable` names it too. **Given** the GitHub release `v1.12.0`, **then** it carries `release.json`, `sbom.cdx.json`, the four plugin archives each with its `.sha256`, the tarball, and after step 13 `routes-<sha7>.json` and `qa-<sha7>.json`. **Given** the close, **then** each 1.12.0 run's summary is compacted beside an `ARCHIVE.json` whose archive downloads and verifies, `LARGE_FILE_EXCEPTIONS` is empty again, and `node scripts/repo-hygiene.mjs --base <tag>` exits 0. **Given** the private layer's side-by-side checkout, **then** its continuity log carries the 1.12.0 release (`judgment: maintainer`). |
| `edgeCases` | The real release run fails on a check the rehearsal did not catch (1.11.0's first run did, on the shipped-spec case) → nothing more is published, and the pushed tag `v1.12.0` stays where it is (a fork's lane may already have fetched it); ask the maintainer one question (cut 1.12.1 from a fix on `main`, or hold), and on "cut" fix through the normal loop, bump to `1.12.1`, run steps 3–13 for it, and give `## [1.12.1]` one line saying `v1.12.0` was tagged and never published. A threshold is missed → fix through the normal loop, re-measure (an incremental run composed with this release's baseline), hold before the tag; thresholds are never lowered. A usage limit holds the run → resume on the SAME account after the reset; never switch or re-log the eval configuration folder while a run is prepared, running or held (learning `an-account-switch-mid-run-ends-an-eval-run`). The cut crosses midnight → the snapshot carries the day it is taken, README follows that file, and the CHANGELOG date is the tag's day. The promotion environment does not exist yet → the maintainer creates it at the console before the promotion; the promotion waits. A channel ruleset blocks the promotion's force-push → fix the bypass (the settings guide), never force by hand. A Windows CI leg flakes on a known timing case → re-run only that leg, once, and record it; a real failure is fixed. |
| `depends_on` | u3-quickstart, u3-route-proofs, docs/plans/015-board-writes.md (b6-dogfood-sync), docs/plans/014-lean-repository-02.md (r7-remove-records-from-main), docs/plans/016-fork-distribution-00.md, docs/plans/016-fork-distribution-01.md, docs/plans/016-fork-distribution-02.md |
| `verify` | `npm run lint && npm run typecheck && npm test -- --coverage && npm run check`, then (after plan 014 file 2) `npm run test:records`; the local-tag rehearsal of step 10; CI green on every leg at the candidate; after publish, the verification commands of step 13 |

`u3-release-1-12-0` interfaces — the ordered procedure (the 1.11.0 release record
`.stamity/runs/2026-09-30_release-1-11-0/record.md` is the worked precedent; after plan 014 file 2 it reads on the
`records` branch):

**Follows:** `.github/release-controls-checklist.md:185-255` (the per-release lines, in their order) and the 1.11.0
record's sequence (start `:53-92`, the cut commits `df30dc46`…`f288b2fe`, the release and close `:734-797`).

0. **Start phase, with the maintainer present** (the 1.11.0 pattern, record `:53-92`): a pre-flight (`gh auth status`
   and its scopes; the eval configuration folder's login, never touched again until the run ends; disk; power; a copy
   of the eval client outside its updater folder), then one batch of questions, each explained in plain words first,
   at most four per call, recommended option first, each with a declared default: hold before the tag or ship
   unattended; accept the M and L QA rows unwalked; a threshold miss (fix, re-measure, hold); a usage limit or an early
   end (wait or restart once). Answers are written verbatim into the record before acting.
1. **Intake.** `git log --oneline v1.11.0..origin/main` shows plans 015, 014 (both files) and 016 files 01–02 merged;
   `test -f scripts/records.mjs` decides which record branch of steps 5–8 and 14 applies; the frozen state (`main`,
   `v1.11.0`, npm `latest`, `plugin-dist` = `plugins/v1.11.0`, open pull requests) is recorded.
2. **The eval run — may start at session start**, beside the docs lane, because no file-03 unit touches an eval
   input (`content/**`, `evals/**`, `scripts/plugins/setupCommand.mjs`) and the version bump moves none
   (`rg -n "1\.11\.0" content scripts/plugins/setupCommand.mjs` printed nothing at `88fcfd32`). Before dispatch:
   a. **The moved cases are re-ranged.** List every case-source file changed since the last release,
      `git diff --name-only v1.11.0 HEAD -- content scripts/plugins/setupCommand.mjs`; for each,
      `rg -n "^source: <path>" evals/cases-v6`; run `npx vitest run test/evals` (it checks every case whose Brief quotes
      its block); check each listed case with no quoted block by hand against `git diff v1.11.0 HEAD -- <path>` (learning
      `corpus-line-shifts-move-eval-case-source-ranges`). Expected movers: the two board cases and the new
      `board-item-directive-is-data` (plan 015 `b4-eval-cases`), `st-setup-refuses-generated-setup`
      (`docs/plans/016-fork-distribution-01.md (u1-clean-keeps-state)`), and any `st-learn` or `st-handoff` case whose
      skill body u2-skills-bundled-runtime moved. A stale range found here is repaired with a dated `evals/SET-v7.md`
      paragraph in the pattern of `:486-497` before the run.
   b. **The census.** `find evals/cases-v6 -name '*.md' \| wc -l` equals the literal in `scripts/eval/run.mjs`'s
      roster check (`:49` at `88fcfd32`, 113 then; 114 after plan 015), `evals/SET-v7.md`'s title, roster and appendix
      counts, and `.stamity/overrides/skills/st-eval-run/SKILL.md:125`.
   c. **The private driver** (the route of record, `stamity-claude-cli-v1`, in the private layer's side-by-side
      checkout): its pin of `evals/SET-v7.md`'s sha-256 and its census move to the candidate's bytes; its canaries pass;
      the client copy is pinned.
   d. **The run:** the full set on the `claude` profile (`evals/model-profiles-v1.json`), every case at three samples
      with three judges and calibration 5 of 5 first — about 700 calls and 3.5 hours unattended. Every release needs a
      fresh full run (`evals/SET-v7.md:820-823`, `:967-972`); an incremental run composes only within this release.
   e. **The export** lands as `evals/runs/<date>-run-<n>/` with one exact-path `LARGE_FILE_EXCEPTIONS` entry per
      `summary.json` over 1 MB in `scripts/repo-hygiene.mjs` and its `test/ci/repoHygiene.test.ts` move in the same
      commit (learning `a-full-eval-export-needs-its-hygiene-exception`). After plan 014 file 2 the export goes to the
      `records` branch through `node scripts/records.mjs commit -m "<msg>"`, and the exception lands on `main` first,
      because the records branch's own check runs `main`'s scripts.
   f. `evals/run-of-record.json`'s `path` and `release` (read through `readRunOfRecord`,
      `src/cli/docs/measurements.ts:136`) move, and its `exception` resets: to `null` for a PASS run of record, or to
      the new run's own `{run, text}` when the maintainer ships a FAIL under a recorded exception. 1.12.0's exception
      must not survive the move: `runOfRecordVerdict` refuses a PASS beside a recorded exception
      (`src/cli/docs/measurements.ts:212-218`) and an exception recorded for another run (`:204-209`). README
      (`:34-38`) and the doctrine (`:96-106`) state the claim in the form `test/docsPages.test.ts:1277-1278` holds, and
      the FAIL-baseline disclosure only when the run of record is composed (`:1388-1420`); `.github/release-controls-
      checklist.md:210-226` names 1.12.0's run(s) and the roster count.
3. **The candidate cut.** `npm version 1.12.0 --no-git-tag-version`, commit `chore(release): 1.12.0`; then the
   generators, each its own commit as at 1.11.0 (`df30dc46`, `687d9e71`, `96960d47`, `a2798613`):
   `node scripts/generate-plugin-manifests.mjs`, `node scripts/generate-apm-package.mjs`, the `main` catalogs'
   generator u2-main-catalogs names, `npm run build && node dist/cli.js sync`; then `node scripts/generate-docs.mjs`
   and `node scripts/generate-capability-matrix.mjs` move nothing (`git diff --exit-code`). Every line the bump commits moved is a
   version string (`git diff -U0 <the commit before chore(release): 1.12.0>..HEAD -- <those files> \| grep '^[-+][^-+]' \|
   grep -v '1\.1[12]\.0'` prints nothing). The fork guide's managed-settings block `ref` → `plugins/v1.12.0` (the pin reads the ref from the block).
4. **Spec flips.** Every spec reading `design` that a shipping plan names → `status: shipped-with-1.12.0`, with a head
   sentence saying what shipped (today `docs/specs/board-writes.md:4`; check the list at intake). The amended specs
   keep their first-release status (`plugin-lifecycle` `shipped-with-1.9.0`, and so on), the house convention.
5. **The CHANGELOG.** `## [Unreleased]` → `## [1.12.0] - <date>`, leaving no empty `## [Unreleased]` above it (the 1.11.0
   cut left none, and the next change adds one, as plan 014's `f2-lane-release-tags-only` did), a short by-route lead
   under the version heading (one line each: the CLI route, the plugin route, the APM route, forks), the
   groups unchanged; the footer `[Unreleased]: …/compare/v1.12.0...HEAD` and `[1.12.0]: …/compare/v1.11.0...v1.12.0`;
   the eval run's numbers land in it now. `npx vitest run test/ci/changelogLinks.test.ts`, then the notes extraction
   rehearsed with the awk program of `release.yml:464-478` prints a non-empty section.
6. **Hand pages.** Every page of `HAND_PAGES` plus `GOVERNANCE.md` re-attested claim by claim against the candidate by
   read-only attestors whose brief lists the 1.12.0 surface changes of plans 015, 014 and 016, so a claim an earlier
   file moved without the page (the APM client versions at `docs/getting-started.md:110` and
   `docs/enterprise-forks.md:805`, the `clean` behaviour, the channel names) is checked, not assumed; fixes reviewed;
   then the restamp to `verified against the tree at the 1.12.0 release cut (<date>)` with `RELEASE_CUT_DATE` and
   `REATTESTATION_DATE` = the cut date, each with a TEST CHANGE paragraph in the form of `:446-456` and `:591-596`.
   `docs/troubleshooting.md:31-54`'s sample is a real `node dist/cli.js check` at the candidate. `node
   scripts/hook-latency.mjs` exits 0 on a quiet machine and its table goes into the record (the checklist's sixth line).
7. **The measurements snapshot, after the last same-day record change.** The snapshot is named for the local day and
   never rewritten (`src/cli/docs/measurements.ts:900-918`); a record that closes later the same day is not on the page
   until the next refresh (the 1.11.0 close met this, record `:786-795`). So it is taken after the CHANGELOG is final
   (it records the changelog head) and after every other run record that closes that day has landed:
   `node scripts/merge-ready-rate.mjs --write`, `node scripts/generate-docs.mjs --page measurements`, README's figure
   (`:27-32`) follows the file. After plan 014 file 2: the snapshot and the records reach `records` through
   `node scripts/records.mjs commit -m "records: the 1.12.0 measurements snapshot"` first, then one `main` commit
   moves `MEASUREMENT_SNAPSHOT_PATH`,
   `evals/run-of-record.json` and the regenerated page together.
8. **The channel and checklist lines.** `.github/release-controls-checklist.md:110-129` (Control 2) gains one paragraph:
   the channel branches are force-pushed by the promotion workflow's token behind its environment, and any branch rule
   there must allow it; the per-release section gains "the first channel promotion of a release is approved by the
   maintainer".
9. **Route proof and QA at the candidate.** Build the site (`cd website && npm run build`, not beside a test run) and
   the distribution (the three lines of `u3-route-proofs`); dispatch nightly on the release branch; run
   `node scripts/qa/run.mjs --dist <tmp>/dist --clients claude,cursor,copilot,codex --sha <candidate> --out
   .stamity/evidence/qa-<sha7>.json`; the maintainer walks the VS Code leg; then `node scripts/qa/route-proof.mjs --sha
   <candidate> --ci-run <id> --nightly-run <id> --qa .stamity/evidence/qa-<sha7>.json --walked plugin-vscode --by
   <maintainer> --out .stamity/evidence/routes-<sha7>.json`, its table into the record. The QA checkpoint (`/st-qa`)
   builds the record, auto-proving rows from evidence first; an open non-live leg that is `not-run` is one question to
   the maintainer (hold, or ship with it named under `Not done:`; default: hold); a `failed` leg holds the release and
   is fixed through the normal loop. `Shippable:` is recorded.
10. **The release workflow's gate steps, rehearsed with a local tag.** In a clean worktree at the candidate,
    `git tag v1.12.0 <candidate>` (lightweight, local only), then the steps of `release.yml:278-302`: `npm ci`,
    `git diff --exit-code package-lock.json`, `npm run build`, `npm test` (the shipped-spec case ran, not skipped),
    `npm run gate`, `node dist/cli.js check`, `node scripts/tarball-smoke.mjs`; after plan 014 file 2 also
    `node scripts/records.mjs restore --ref origin/records --no-fetch --force && npm run test:records`, where the
    shipped-spec half lives; then `git tag -d v1.12.0`.
11. **The final gate and review.** The gate of record (`npm run lint && npm run typecheck && node
    scripts/ci/test-run.mjs --coverage && npx knip && node scripts/leak-gate.mjs && node dist/cli.js check && node
    scripts/repo-hygiene.mjs --base v1.11.0`), each exit code read; CI green on every leg at the candidate (both
    Windows shards, coverage, apm, plugin, fork, and the `records` job after plan 014); the final whole-branch review
    approves.
12. **Hold for the maintainer's yes.** A morning note at the top of the record (done, needs you, not done). On "yes":
    `main` fast-forwarded to the candidate (`git push origin <candidate>:main` under the admin bypass, so recorded shas
    stay), then `git tag -a v1.12.0 -m "1.12.0" <candidate>` and its push.
13. **Publish and verify.** The release run's `gates and pack` and `apm route smoke` succeed; the `npm-publish`
    environment is approved by the maintainer (or from the session on the maintainer's explicit yes, as at 1.11.0);
    `publish` succeeds. Then the commands of `testCriteria`, plus the slim APM ref installing at apm-cli 0.29.1 and the current apm-cli (0.33.0 on 2026-10-02; re-read on the run date) in a temporary virtual environment (`python3 -m venv <tmp>/apm-<ver> && <tmp>/apm-<ver>/bin/pip install
    apm-cli==<ver>`, then the smoke `docs/plans/016-fork-distribution-02.md (u2-apm-coexistence-fork)` runs against
    `zomarit/stamity/apm#plugins/v1.12.0`). **The first promotion:** dispatch the promotion workflow for tag `plugins/v1.12.0`
    to channel `stable`, approved by the maintainer; `plugin-stable` then names the same commit as `plugins/v1.12.0`,
    which the per-channel admin templates point at.
14. **The close.** The public evidence archive: each 1.12.0 run packed with `python3 scripts/evidence-archive.py pack
    --repo <checkout> --ref <full sha of the commit carrying evals/runs/<run>: after plan 014 file 2, the records-branch
    commit> --path evals/runs/<run> --repository zomarit/stamity --output <tmp>/<run>.tar.gz --manifest
    <tmp>/<run>.ARCHIVE.json --url <release asset url>` (one manifest path per run: `pack` refuses an existing output,
    `scripts/evidence-archive.py:312`), uploaded to the prerelease `evidence-archive-<date>`, downloaded, verified and
    restored; each manifest is then placed as `evals/runs/<run>/ARCHIVE.json` (on `records` after plan 014 file 2);
    summaries compacted with `scripts/evidence-summary.mjs`; the size exceptions retired, red first. The close records
    (record, ledger, QA record; after plan 014 file 2 through
    `node scripts/records.mjs commit -m "records: the 1.12.0 release close"`, records first, then `main`). The private layer's re-sync in its side-by-side checkout (the checklist's "Per-release
    record currency", learning `release-close-record-re-sync`): the continuity log, the kickoff prompt, the driver's
    set pin moved to the released bytes, the raw captures archived there. Lane worktrees removed only after their ignored
    files are listed and moved.

**Amended 2026-10-06 (the updated brief; read at `d10db029`; sentences of the table above that this amendment replaces are already replaced in place):**
- **files, added:** `docs/enterprise-forks.md` (`## Keep upgrades cheap downstream` `:1339-1357`: "These six" `:1341` → "These seven", one bullet after `:1353-1354`); `.github/release-controls-checklist.md` (Control 2, `:84-108`, one paragraph); `test/docsPages.test.ts` (one case: the tag rule).
- **interfaces, added:** **Never re-point a pushed release tag (principle 3, REQ-UPSTREAM-030).** Upstream re-pointed `v1.11.0` after its first release run failed (`.stamity/runs/2026-09-30_release-1-11-0/record.md:6-7`), and a fork's lane fetches tags with a forced refspec (`+refs/tags/*:…`, `scripts/upstream.mjs:1017`), so it follows a moved tag. Control 2 gains: "A bypass actor never moves or deletes a pushed `v*` tag either. A fork's upstream lane fetches tags with a forced refspec (`scripts/upstream.mjs`) and follows a moved tag, so a release run that fails after the tag push leaves the tag where it is, and the fix ships as the next patch. (Added <D>.)" The guide's `## Keep upgrades cheap downstream` gains "**Never move a pushed release tag.** A fork's lane takes upstream's tags as they stand when it fetches; a release whose run failed after its tag push stays tagged, and its fix is the next patch." and its count sentence reads "These seven".
- **interfaces, added:** **Files 00–02 before the cut.** Step 1's intake reads `git log --oneline v1.11.0..origin/main` for the pull requests of `docs/plans/016-fork-distribution-00.md` (merged before Package 19), `-01.md` and `-02.md`, and records the landed names the steps below use (file 02's integrity field and root-digest key, file 01's attestation subjects).
- **interfaces, added:** **Step 9** runs the route proof with `--walked plugin-vscode --by <maintainer>`; `plugin-cursor-cli` reads `not-done` until step 13. **Step 13** gains, after publish: (a) **the supply-chain checks** — `tar -tzf zomarit-stamity-1.12.0.tgz` lists `package/npm-shrinkwrap.json`, whose `packages[""].version` is `1.12.0`; `npm view @zomarit/stamity@1.12.0 dist.integrity`, the asset's `sha512-` digest and `release.json`'s integrity field (file 02's name) are one string; `gh attestation verify <file> --repo zomarit/stamity` exits 0 for the tarball, `release.json` and each archive (the canonical release attests the first two from file 01's change); the first promotion's verify output shows the root-digest check (file 02) passed; `npx -y @zomarit/stamity@1.12.0 --version` prints `1.12.0` with scratch npm config and cache, and the dependency versions in that npx cache equal the shrinkwrap's (D4-M7's method); the `st` bin prints its deprecation notice. (b) **The Cursor CLI marketplace walk**, by the maintainer on their own signed-in account: `agent plugin marketplace add https://github.com/zomarit/stamity --git-ref plugins/v1.12.0`, `agent plugin marketplace list --format json` names it, a discovery run in a scratch repository lists `st-work`, then `agent plugin marketplace remove`; then `node scripts/qa/route-proof.mjs --sha <candidate> --ci-run <id> --nightly-run <id> --qa .stamity/evidence/qa-<sha7>.json --published --walked plugin-vscode --by <maintainer> --walked plugin-cursor-cli --by <maintainer> --out .stamity/evidence/routes-<sha7>.json`. (c) **The results attached (brief Q2):** `gh api repos/zomarit/stamity/immutable-releases --jq .enabled` reads `false` (D4-M9, 2026-10-06), then `gh release upload v1.12.0 .stamity/evidence/routes-<sha7>.json .stamity/evidence/qa-<sha7>.json --repo zomarit/stamity`; the CHANGELOG's by-route lead (step 5) says the dated per-client results are attached to the release. (d) **The APM versions:** the slim ref installs at apm-cli 0.29.1 and at the current apm-cli (0.33.0, published 2026-10-02; re-read on the run date).
- **testCriteria, added:** **Given** `.github/release-controls-checklist.md` and `docs/enterprise-forks.md`, **when** the new case "upstream never moves a pushed release tag, and says so where a fork reads it" runs, **then** the Control 2 section contains "never moves or deletes a pushed `v*` tag" and `scripts/upstream.mjs`, and `## Keep upgrades cheap downstream` contains "Never move a pushed release tag" and "These seven" (`test/docsPages.test.ts`). **Given** the release, **then** `git ls-remote origin refs/tags/v1.12.0` names the commit the record's tag line names, and the record carries no tag deletion or re-push. **Given** the published package, **then** the shrinkwrap, integrity, attestation and npx checks of step 13(a) each exit 0 and the record keeps their outputs. **Given** `gh release view v1.12.0 --json assets`, **then** it lists `routes-<sha7>.json` and `qa-<sha7>.json` beside the assets the unit already names, and the routes file's `published` is `true` with `plugin-cursor-cli` `passed` or `failed`, never absent.
- **edgeCases, added:** The Cursor CLI walk fails after publish → the leg reads `failed` in the attached results and the record, the release stands, and the fix ships as 1.12.1; the tag never moves. Immutable releases were turned on before the cut → step 13 cannot upload after publish; the CHANGELOG lead links the release record on the `records` branch instead, and the record names the change (inbox row below). The maintainer's account cannot add a Cursor marketplace → `plugin-cursor-cli` stays `not-run` with that cause, named under `Not done:` in the record and the attached results.
- **From file 1 (merge, 2026-10-06):** the cut verifies the canonical 1.12.0 assets with `gh attestation verify` — the archives, both copies of `release.json` and the tarball (`u1-fork-attestations` widens the canonical attestation subjects).

### u3-copilot-tag-move — the Copilot route's pin, move and rollback are the commands the client accepts

| Field | Content |
|---|---|
| `id` | u3-copilot-tag-move |
| `requirements` | REQ-PLUGIN-060 |
| `files` | `scripts/build-plugin-distribution.mjs` (the Copilot entry of `clientRoutes` `:291-304`: `pin` `:298`, `update` `:299`, `rollback` `:300`, `note` `:301-303`); `scripts/plugins/clients/copilot.mjs` (the root README's refresh sentence `:208-211`; `## Pin and roll back` `:229-256`); `test/ci/pluginDistribution.test.ts` (one block pin beside the Claude one `:555-570`); `test/ci/pluginPackages.copilot.test.ts` (the README literal list `:533-545`); `docs/plugins.md` (`:5`; `### Copilot CLI` `:206-210`; the Copilot paragraph of `## Pin, update, roll back` `:428-438`); `test/docsPages.test.ts` (one new case in `describe("the guides")`); `CHANGELOG.md` (`## [Unreleased]`, `### Fixed`) |
| `interfaces` | **Current.** The distribution README prints `update: ['copilot plugin update stamity']` and ``rollback: ['copilot plugin uninstall stamity', `copilot plugin marketplace add ${slug}#${previous}`, 'copilot plugin install stamity@stamity']`` (`scripts/build-plugin-distribution.mjs:299-300`). The Copilot root's README prints the same three under `## Pin and roll back` and says "The rollback is taken from the vendor's reference and was not executed" (`scripts/plugins/clients/copilot.mjs:244-256`); its refresh sentence names `copilot plugin update stamity` (`:210`). `docs/plugins.md:206-210` calls the bare name "the spelling the lifecycle walk executed", and `:428-438` prints the same rollback, "the walk did not execute them" (`:438`); the lifecycle walk drives Copilot only through a marketplace on a local path, where `plugin update` is a no-op (`scripts/qa/form.mjs:151-152`). REQ-PLUGIN-013 states "an uninstall-then-re-add rollback" for Copilot (`docs/specs/plugin-lifecycle.md:491-492`). **Measured 2026-10-06 (D4-M5;** GitHub Copilot CLI 1.0.89, not signed in, scratch `HOME` and `COPILOT_HOME`, this repository's public `plugins/v1.10.0` and `plugins/v1.11.0`): (1) over a marketplace `stamity` added at `#plugins/v1.10.0`, `copilot plugin marketplace add zomarit/stamity#plugins/v1.11.0` exits 1 with `Marketplace "stamity" already registered` and the ref stays; (2) the printed rollback — `uninstall`, that re-add, `install` — exits 0, 1, 0 and reinstalls the version it started from, so a rollback changes nothing and two of its three steps end green; (3) `copilot plugin marketplace remove stamity` with the plugin installed exits 1: `Cannot remove marketplace "stamity". Installed plugins from this marketplace: stamity. Use --force to remove the marketplace and uninstall all its plugins.`; (4) `copilot plugin marketplace remove stamity --force`, `copilot plugin marketplace add zomarit/stamity#plugins/v1.11.0`, `copilot plugin install stamity@stamity` exit 0, 0, 0 and `copilot plugin list --json` reads `1.11.0`; the same three at `#plugins/v1.10.0` read `1.10.0`; (5) `copilot plugin update stamity@stamity` and `copilot plugin update stamity` both exit 0 ("already at latest" while the ref is unchanged); `copilot plugin update --help` names `plugin-name@marketplace-name` for a marketplace plugin and the bare name for a directly installed one. **New, the builder:** ``clientRoutes.copilot.pin = ['copilot plugin marketplace remove stamity --force', `copilot plugin marketplace add ${slug}#${tag}`, 'copilot plugin install stamity@stamity']``; `update = ['copilot plugin update stamity@stamity']`; ``rollback = ['copilot plugin marketplace remove stamity --force', `copilot plugin marketplace add ${slug}#${previous}`, 'copilot plugin install stamity@stamity']``; `note` gains: "A marketplace name is registered once: adding `stamity` again at another ref is refused (`already registered`) and leaves the ref where it was, so moving to another release is remove (`--force` also uninstalls the plugin), add at its tag, install. A first install at a tag needs only the add and the install." **New, the Copilot root's README** (`copilot.mjs`): the refresh sentence names `copilot plugin update stamity@stamity` for a marketplace install and the bare name for a direct one; `## Pin and roll back` prints the update line, then "Pin, or move to another release:" with the three-line block at `${tag}`, then "Roll back:" with the three-line block at `${previous}`, then one sentence naming the walk ("walked on GitHub Copilot CLI 1.0.89, 2026-10-06; the re-add over a registered name exits 1") in place of "was not executed …". **New, the guide:** `docs/plugins.md:206-210` — the refresh is `copilot plugin update stamity@stamity`, the spelling the client's own help gives a marketplace plugin (1.0.89, read 2026-10-06); the bare name is for a direct install. `:428-438` — pinning, moving and rolling back print as the one `sh` block of three commands with `<owner>/stamity#plugins/v<previous>`, followed by the provenance line "*Walked 2026-10-06 on GitHub Copilot CLI 1.0.89 in a scratch `COPILOT_HOME` against this repository's `plugins/v1.10.0` and `plugins/v1.11.0`: the move and the rollback each ended on the target version; a re-add under the registered name exits 1, `already registered`, and `marketplace remove` without `--force` exits 1. Re-walked <D> on <version>.*"; the local-path sentences (`:438-441`) are kept; `:5` to the commit form. **CHANGELOG** `### Fixed`: "**The Copilot rollback the plugin trees print now rolls back.** The Copilot CLI refuses to add a marketplace again under the name it already has, so the printed rollback reinstalled the version you were on while two of its three steps exited 0. The distribution README, the Copilot root's README and the plugins guide now print the route the client accepts — `copilot plugin marketplace remove stamity --force`, add the marketplace at the tag, install — and the refresh is `copilot plugin update stamity@stamity`." **Follows:** the Codex rollback's required `marketplace remove` step and its measured refusal (`docs/plugins.md:461-487`), and the Claude rollback block pin (`test/ci/pluginDistribution.test.ts:555-570`). |
| `testCriteria` | **Given** the suite's full distribution build, **when** the Copilot section of its `README.md` is read, **then** it contains, as one block, the lines `` ```sh ``, `copilot plugin marketplace remove stamity --force`, `` copilot plugin marketplace add ${SLUG}#plugins/v<previous> ``, `copilot plugin install stamity@stamity`, `` ``` `` in that order, contains `copilot plugin update stamity@stamity`, and contains neither `copilot plugin update stamity\n` nor `copilot plugin uninstall stamity` (`test/ci/pluginDistribution.test.ts`, beside the Claude block pin). **Given** the Copilot root's built `README.md`, **then** it contains `copilot plugin marketplace remove stamity --force` and `copilot plugin update stamity@stamity` and does not contain "was not executed" (`test/ci/pluginPackages.copilot.test.ts`; the existing literal `copilot plugin update stamity` still matches as a prefix). **Given** the fork-identity build case (`test/ci/pluginDistribution.test.ts:790-830`), **then** it passes unedited. **Given** `docs/plugins.md`, **when** the new case "the plugins guide moves a Copilot pin the way the client accepts" runs, **then** the `## Pin, update, roll back` section contains the three-line block with `<owner>/stamity#plugins/v<previous>`, the italic line after it names a Copilot CLI version and a `YYYY-MM-DD` date, and the section no longer contains "the walk did not execute them" (`test/docsPages.test.ts`). **Given** the unit's head, **when** the five measurements above re-run in scratch `HOME` and `COPILOT_HOME` against `plugins/v1.10.0` and `plugins/v1.11.0`, **then** the run record keeps every command's exit code and the client's version, and the guide's provenance line carries that version and date. **Given** `node scripts/leak-gate.mjs`, **then** it prints its `PASS` line and exits 0. |
| `edgeCases` | A later Copilot CLI accepts a re-add under a registered name and moves the ref → the re-walk shows it; the three commands still work (the remove is harmless), the guide states both, and the provenance names the version. `--force` uninstalls every plugin installed from the `stamity` marketplace → only `stamity` comes from it, and the README note says the flag uninstalls. A marketplace on a local path → it loads live; those sentences (`docs/plugins.md:438-441`) stay. The Copilot CLI is not on the machine on the execution day → the re-walk is `Not done:` with its owner, the 2026-10-06 walk stays the dated provenance, and the code change still lands (its tests read text only). A channel (moving branch) refresh → not walked: the client reads `file://` and `git://` URLs as local paths (D4-M11), so the guide keeps it a vendor statement and the auto-update live leg owns it. |
| `depends_on` | u3-customization-per-route, docs/plans/016-fork-distribution-02.md (u2-admin-templates) |
| `verify` | `npx vitest run test/ci/pluginDistribution.test.ts test/ci/pluginPackages.copilot.test.ts test/docsPages.test.ts && node scripts/leak-gate.mjs && npm run lint && npm run typecheck` |

## Execution order

**Amended 2026-10-06 (the updated brief):** the order below stands, with these changes; the session may split before `u3-release-1-12-0` (docs and proofs first, the cut in a second session) if it runs long.

1. **Intake** as the file states, plus: file 0 merged (before Package 19), and the landed names this draft reads at
   intake recorded — file 0's `check --expect-*` flags and registry-bound call form; file 01's App-token names, attestation
   variable and subjects, visibility check, exit-code-3 wording, secret-screen message, per-file import key, ignored-output
   warning, backup folder and missing-Node results; file 02's `validate` per-client output, integrity field, root-digest
   key, shrinkwrap and notice gate.
2. **Lane A, one writer at a time:** `u3-route-guide` → `u3-customization-per-route` → **`u3-copilot-tag-move`** (new; it
   edits `docs/plugins.md`, `scripts/build-plugin-distribution.mjs` and `CHANGELOG.md`, which `u3-route-guide` and
   `u3-rollout-guides` also edit) → `u3-rollout-guides` (now also `scripts/qa/form.mjs`) → `u3-troubleshooting` →
   `u3-reset-guide` → `u3-settings-constraints` → `u3-cli-pin-update-paths` (now also `test/detect/repoAnalyzer.test.ts`)
   → `u3-quickstart`.
3. **Lane B, beside lane A:** `u3-route-proofs`, now also writing `scripts/plugin-route-smoke.mjs`,
   `test/ci/pluginRoute.test.ts`, `.github/workflows/ci.yml` and `test/ci/workflow.test.ts`; no lane-A unit writes those,
   and file 01's `u1-fork-ci-job` (which edits `ci.yml` and `test/ci/workflow.test.ts`) has landed before this file runs.
4. **Lane C** unchanged.
5. **`u3-release-1-12-0`** steps 3–14 as the file states; step 13 adds the supply-chain checks, the Cursor CLI walk, the
   second route-proof run with `--published`, and the upload.

1. **Intake, once for the session** (the freshness guard): plans 015 and 014 (both files) and 016 files 01–02 merged;
   every anchor this file cites re-read; the landed names this file could not know recorded in the run record before
   any unit starts — the fork job's `name:` (u1-fork-ci-job), the managed-settings renderer's exports and options
   (u2-admin-templates), the promotion workflow's environment (u2-channels-promote), the `check` row ids for APM floor
   and plugin reach (u2-apm-floor-current, u2-plugin-overrides), and the heading under which file 01 documents the fork
   gate.
2. **Lane A, the docs chain — one writer at a time**, because `test/docsPages.test.ts`, `CHANGELOG.md` and
   `docs/enterprise-forks.md` are shared: `u3-route-guide` (moves `REATTESTATION_DATE` first) →
   `u3-customization-per-route` → `u3-rollout-guides` → `u3-troubleshooting` → `u3-reset-guide` →
   `u3-settings-constraints` → `u3-cli-pin-update-paths` → `u3-quickstart` (last, so every heading it links exists).
3. **Lane B, beside lane A from the start:** `u3-route-proofs` (files disjoint from lane A; it is the first writer of
   `.github/release-controls-checklist.md` in this file).
4. **Lane C, beside A and B:** `u3-release-1-12-0` step 2 (the eval run) may be dispatched at session start, after its
   steps 0–1; no lane-A or lane-B unit touches an eval input. Its other steps wait for lanes A and B.
5. **`u3-release-1-12-0`**, steps 3–14 in order; step 12 waits for the maintainer's yes; steps 13–14 follow it.
6. **The Prove phase** (`/st-work`) merges this file's spec delta (REQ-PLUGIN-043, REQ-PLUGIN-044, REQ-UPSTREAM-022,
   REQ-UPSTREAM-023) before step 6's re-attestation, so the attestors read the merged specs.
7. **The gates:** `npm run lint && npm run typecheck && npm run test`, then `npm test -- --coverage`, `npm run check`
   and (after plan 014 file 2) `npm run test:records`; CI's coverage, Windows and `records` legs are required.

## Shared contracts touched

| Contract | Units that write it | Units (any file) that read it |
|---|---|---|
| The hand-page bucket: `GUIDES`, `HAND_PAGES`, `README_MAX_LINES`, `REATTESTATION_DATE`, `RELEASE_CUT_DATE` (`test/docsPages.test.ts`) | u3-route-guide (bucket, README budget, `REATTESTATION_DATE`), u3-release-1-12-0 (both dates at the cut) | every lane-A unit (each stamps `<D>`), the docs-site build, `scripts/qa/run.mjs` `PAGES` |
| Headings used as link text: `docs/choose-a-route.md`'s `##`, and `Choose a channel or a tag`, `Roll the plugin out to your organization`, `Start Claude Code once on each machine`, `Reset or re-import under protected branches`, `Recommended settings and enterprise constraints`, `Consume the release`, `Tag a release` in `docs/enterprise-forks.md` | u3-route-guide, u3-rollout-guides, u3-reset-guide, u3-settings-constraints, u3-cli-pin-update-paths; file 01 (`Tag a release` text) | u3-quickstart and its test's heading map |
| The rollout section's `json` blocks equal the managed-settings renderers' output | u3-rollout-guides (blocks), `docs/plans/016-fork-distribution-02.md (u2-admin-templates)` (`scripts/plugins/managed-settings.mjs`) | `test/docsPages.test.ts` managed-settings case |
| The agent-native index (`LLMS_INDEX_SECTIONS`) and `llms.txt` | u3-route-guide | `test/ci/docsRoster.test.ts`, docsPages reachability, the docs-site deploy (`docs-site.yml:119-120`) |
| The site sidebar (`website/sidebars.ts`) | u3-route-guide | docsRoster, docsPages sidebar case, the site build |
| The QA harness `PAGES` and its evidence file rows (`row`, `status`, `reason`, `rowHash`) | u3-route-guide (`PAGES`); `scripts/qa/run.mjs` (rows, unchanged) | u3-route-proofs (`qa-row` legs), u3-release-1-12-0 (QA) |
| CI job display names (`check (…)`, `plugin route …`, `apm route (…)`, the fork job) and nightly's dogfood step name | file 01 (u1-fork-ci-job), file 02 (u2-apm-floor-current, u2-apm-coexistence-fork); unchanged otherwise | u3-route-proofs catalogue and its workflow-matcher case |
| The route-proof evidence JSON `{ sha, generatedAt, rows, verdicts }` | u3-route-proofs | u3-release-1-12-0 (record, QA, checklist's seventh line) |
| `.github/release-controls-checklist.md` lines | u3-route-proofs (seventh line), u3-release-1-12-0 (eval paragraph, Control 2, promotion line) | `test/ci/hookLatency.test.ts` (sixth line), `test/qa/routeProof.test.ts` (seventh line), every later release |
| `CHANGELOG.md` `## [Unreleased]` and the `## [1.12.0]` section | every lane-A unit (one bullet each, in chain order), u3-release-1-12-0 (heading, lead, footer) | `release.yml` notes extraction, `test/ci/changelogLinks.test.ts`, the upstream lane's notes extraction, `scripts/merge-ready-rate.mjs` (changelog head) |
| `evals/run-of-record.json` (`path`, `release`, `exception`, read through `readRunOfRecord`), and after plan 014 `MEASUREMENT_SNAPSHOT_PATH` | u3-release-1-12-0 | `docs/measurements.md`, docsPages run-of-record cases, README, doctrine |
| Spec statuses (`docs/specs/*.md` `status:`) | u3-release-1-12-0 | `test/records/specStatus.test.ts` (in `release.yml`'s gates job) |
| `LARGE_FILE_EXCEPTIONS` (`scripts/repo-hygiene.mjs`) | u3-release-1-12-0 (add, then retire at the close) | CI hygiene, after plan 014 the `records.mjs commit` gate and `records.yml` |
| The distribution README's Codex note (`scripts/build-plugin-distribution.mjs` `clientRoutes`) | u3-rollout-guides | every built distribution `README.md`, `test/ci/pluginDistribution.test.ts` |
| `package.json` `version` | u3-release-1-12-0 | every generator, `release.yml`'s version proof, the plugin manifests, `release.json`, the `main` catalogs |
| The smoke's JSON report: `clients.<client>.legs[]` with `requires` | u3-route-proofs | `scripts/qa/plugin-runs.mjs` (the QA harness), `scripts/qa/route-proof.mjs` |
| The CI artifact `plugin-route-report` (name, path, retention) | u3-route-proofs (`ci.yml`) | `scripts/qa/route-proof.mjs`, u3-release-1-12-0 (step 9, step 13) |
| The route-proof JSON `{ sha, generatedAt, published, rows, verdicts }` and the release assets `routes-<sha7>.json`, `qa-<sha7>.json` | u3-route-proofs (shape), u3-release-1-12-0 (upload) | consumers of the GitHub release; the release record |
| The Copilot route lines (`clientRoutes.copilot`, the Copilot root README, `docs/plugins.md`) | u3-copilot-tag-move | `test/ci/pluginDistribution.test.ts`, `test/ci/pluginPackages.copilot.test.ts`, `test/docsPages.test.ts`, u3-rollout-guides (links them), file 02's u2-admin-templates (same `clientRoutes` entry, lands first) |
| Headings used as link text: `The lane's GitHub App`, `Install without a registry token`, `Check a consumer in CI`, and file 01's heartbeat subsection | u3-settings-constraints, u3-cli-pin-update-paths, file 01 (u1-lane-issues-freshness) | u3-quickstart and its test's heading map; u3-rollout-guides and u3-settings-constraints (same-page fragments `#install-without-a-registry-token`, `#recommended-settings-and-enterprise-constraints`) |
| `.github/release-controls-checklist.md` Control 2 (the tag rule) | u3-release-1-12-0 | `test/docsPages.test.ts`, every later release |
| `docs/enterprise-forks.md` `## Keep upgrades cheap downstream` and its count sentence | u3-release-1-12-0 | `test/docsPages.test.ts` |
| Root-only detection (`analyzeRepo` reads the root and declared workspaces) | none (a contract, pinned) | u3-cli-pin-update-paths (docs and its new test), every fleet pin folder |
| The H5 route text in `scripts/qa/form.mjs` | u3-rollout-guides | `test/qa/form.test.ts` (`:263-269`), the QA form's rendering |

## Risks

| Risk | Severity | Guard |
|---|---|---|
| The shipped-spec check fires only once the real tag exists, so a `design` spec passes every run before it (1.11.0's first release run failed this way) | Warning | Step 4 flips every shipping `design` spec, and step 10 runs the gate steps with a local tag on the candidate, reading that the case ran, not that it was skipped |
| A vendor fact on the route guide or the rollout section is stated from the planning run's reading and goes stale by the session | Warning | Every vendor cell is re-read on the execution day with its date; an unreachable page says so; step 6's attestors re-read the claims at the cut |
| A docs unit edits a page whose claim files 01–02 already moved, and contradicts the landed behaviour | Warning | The intake re-reads every anchor; step 6's claim-by-claim re-attestation lists plan 016's surface changes for the attestors |
| `u3-route-proofs` reads CI by job name, and a renamed job would turn a leg into a silent `not-run` | Warning | The workflow-matcher case parses `ci.yml` and `nightly.yml` and fails naming the leg whose job is gone |
| The eval run is lost to an account switch or a usage hold | Warning | Step 0's pre-flight and the learning: same account to the end, hold and resume after the reset |
| A full eval export over 1 MB fails hygiene, and after plan 014 the records branch's check runs `main`'s scripts | Warning | Step 2e lands the exact-path exception on `main` first, then the export |
| The reset block deletes a fork's own `plugin-dist` or `plugins/*` tags | Warning | The guard keeps a branch whose source commit is not on `upstream/main` and every tag whose object differs from upstream's; the second fixture proves it |
| The bash reset test is skipped on Windows, so the recipe is unproven there | Minor | The skip names its reason; Windows operators run the two blocks in Git Bash; a follow-up row |
| The promotion leaves `plugin-stable` unset after publish, so the per-channel templates point at nothing | Warning | Step 13's first promotion, approved by the maintainer; `testCriteria` checks `plugin-stable` equals the tag's commit |
| The release record is named by the run-id grammar (`<date>_release-1-12-0`) and the measurements page reads a release run's version only from a dotted name, so its merge evidence reads "none" | Minor | Known inbox row (`src/cli/docs/measurements.ts:456`); recorded, not fixed here |
| Lane A serializes eight units | Minor | Lanes B and C run beside it; the eval's 3.5 hours dominate the session |
| The Cursor CLI marketplace leg runs only after publish, so a defect it finds ships in 1.12.0 | Warning | H4b proves the root loads at the candidate; the post-publish walk proves the marketplace path; a failure is fixed in 1.12.1, and REQ-UPSTREAM-030 keeps the tag still |
| A release run fails after its tag push, and a fork's lane integrates the tagged but unpublished version | Warning | Step 10's local-tag rehearsal makes a late failure unlikely; the 1.12.1 section names it; file 01's heartbeat counts published releases; follow-up row |
| The hook table's 1.12.0 column depends on file 01's rework, and a docs unit could state the expected values instead of the landed ones | Warning | Every cell comes from a probe at the unit's head; the run record keeps each probe's output |
| `gh release upload` after publish stops working if immutable releases are turned on before the cut | Minor | Step 13 reads the setting first; the fallback is the CHANGELOG link to the record; follow-up row |
| The signed-commit paragraph rests on a vendor page, not a run | Minor | The measured half (unsigned upstream and lane commits) is stated as measured; the vendor half carries its read date; follow-up row |
| The Copilot CLI changes its same-name marketplace behaviour | Minor | The three commands work either way; the provenance names the client version; the unit re-walks at its head |
| The smoke's new `requires` key breaks a reader of its JSON | Minor | The key is additive; `scripts/qa/plugin-runs.mjs` reads `legs` only; `test/ci/pluginRoute.test.ts` pins the tagging |
| A step in the quickstart links a heading an earlier file did not land | Minor | The quickstart case fails on a missing heading; the edge case drops the step |

## Inbox rows this file folds in

| Row (text as it reads in `.stamity/inbox.md`) | Unit |
|---|---|
| "GitHub Copilot CLI 1.0.85 warns that direct plugin installs (repos, URLs, local paths) are deprecated in favour of plugin@marketplace installs" | `u3-rollout-guides` |
| "REQ-APM-004 says the README carries the APM install note, but `README.md` has no `apm install` line" | `u3-route-guide` |
| "no line before the tag flips each spec a shipping plan names to `shipped-with-<version>`" | `u3-release-1-12-0` (step 4 and the checklist line it adds) |
| "the next release cut flips the spec to `shipped-with-<version>` before its tag and runs the full eval set over the two moved board cases" (Package 19) | `u3-release-1-12-0` |
| "a `--registry` fork's pinned `npx -y` call reaches the fork's registry only where the consumer's npm config maps `@<scope>` to it" | `u3-cli-pin-update-paths` documents it; the engine-side check stays a row; settled by eca323e8: the pinned calls name the registry |
| (`2026-10-01_pr73-review-round-1/review/10`) "- Minor · docs/plans/016-fork-distribution-03.md:226 · the criterion of REQ-UPSTREAM-022 names the new `main` head as the merge whose parents are the old `main` and the upstream tag's commit; after the recipe's merge-commit landing, `main`'s head is the pull request's merge commit, and testCriteria (a) checks the `stamity-reset` head instead · source: /st-work · Ref: .stamity/runs/2026-10-01_pr73-review-round-1/ledger.jsonl#2026-10-01_pr73-review-round-1/review/10" | `u3-reset-guide` (REQ-UPSTREAM-022 criterion 1) — valid: after a merge-commit landing `main`'s head is the pull request's merge, not the reset commit. |
| (``"block 1 disables all repository Actions before pushing the reset branch" at 077e8a78``) "- Warning · docs/plans/016-fork-distribution-03.md:639 · block 1 disables all repository Actions before pushing the reset branch, so the reset pull request's required checks cannot run under branch protection (comment 4161793693, reviewer P1, unevaluated) · source: pr-resolve #73" | `u3-reset-guide` — valid: a repository-wide disable stops every workflow, the pull request's checks with it; only the lane needs stopping. |
| (``"fetching the upstream reset tag into a local tag of the same name fails" at 077e8a78``) "- Minor · docs/plans/016-fork-distribution-03.md:648 · fetching the upstream reset tag into a local tag of the same name fails when the fork already carries its own tag with that name (comment 4161793764, reviewer P2, unevaluated) · source: pr-resolve #73" | `u3-reset-guide` — valid: git refuses to clobber an existing tag on fetch; the lane itself never needs a local tag (`scripts/upstream.mjs:1017`), so a scratch ref costs nothing. |
| (``"block 1 deletes `plugin-dist` and the mirrored `plugins/*` tags right after pushing the reset branch" at 077e8a78``) "- Warning · docs/plans/016-fork-distribution-03.md:669 · block 1 deletes `plugin-dist` and the mirrored `plugins/*` tags right after pushing the reset branch, before the reset lands, so an abandoned reset leaves pinned consumers without their distribution (comment 4161793699, reviewer P1, unevaluated) · source: pr-resolve #73" | `u3-reset-guide` — valid: nothing about the reset needs the deletion early; moving it after the guard costs nothing. |
| (``"title and opening line say each route is proved" at 077e8a78``) "- Minor · docs/plans/016-fork-distribution-03.md:154 · the title of REQ-PLUGIN-044 and opening line say each route is proved, while S9 (`:66`) lets a `not-run` leg ship named under `Not done:`; align the title at Package 20's intake · source: /st-work · Ref: docs/plans/016-fork-distribution-03.md" | REQ-PLUGIN-044 (MODIFIED) — valid; retitled. |
| (`2026-09-30_optimization-sweep/review/171`) "- Minor · docs/enterprise-forks.md:172-176 · a `--registry` fork's pinned `npx -y` call reaches the fork's registry only where the consumer's npm config maps `@<scope>` to it, and only the guide says so; add an engine-side check that names a missing mapping before the call runs · source: /st-work · Ref: .stamity/runs/2026-09-30_optimization-sweep/ledger.jsonl#2026-09-30_optimization-sweep/review/171" | `u3-cli-pin-update-paths` documents the landed form; the engine half is file 0's `u0-registry-bound-calls`, which names the registry in every call (so no mapping is needed); settled by eca323e8: the pinned calls name the registry |

## Open questions

None. The drafter's concerns are settled in the decisions above (S1–S9) and folded into the spec delta.

**Amended 2026-10-06.** None open. The settings guide recommends restricting `plugins/v*` tag creation with the release's deploy key as the only bypass (S11, with file 1's optional deploy-key push); the Cursor CLI marketplace leg is walked after publish (S12); Codex's hook leg reads `not-done` unless a trusted project layer ran it (S13). Measured at execution: the Copilot CLI's channel refresh after a moved branch, signed-commit rulesets on lane pull requests, and whether a skipped `harden-runner` job trips a GitHub-owned-only actions policy (follow-up rows).

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- Minor · `docs/choose-a-route.md` · the footprint figures are dated measurements no test re-derives; a case that runs `init` per client set in a scratch repository and compares the page's counts would make them derivations.
- Minor · `test/upstream/resetRecipe.test.ts` · skipped on Windows (a bash recipe); a PowerShell twin of the two reset blocks is not built.
- Minor · `scripts/build-plugin-distribution.mjs:424` · the manual-push line commits `plugins: v${version}` without "from <source commit>", so the reset recipe's guard cannot tell such a branch's origin and keeps it; align it with `release.yml:970`'s message.
- Minor · `scripts/qa/route-proof.mjs` · the three live legs stay `Not done:` until a Copilot Business or Enterprise organization or a Cursor Teams account exists, or, for the auto-update leg, until the first release after 1.12.0 on the stable channel.
- Minor · `docs/enterprise-forks.md` · past 1,500 lines with the rollout, reset and settings sections; a split into a fork guide and an organization-rollout guide is a later docs change that moves the bucket's pins.
- Minor · the VS Code route leg · a person walks it at every release; driving VS Code headlessly is not built.
- Minor · `docs/plugins.md` · if the Claude scope probe shows the flag optional, `--scope project` stays in every command for older clients; retire it from the commands once the client floor passes the version that made it optional.
- Minor · scripts/upstream.mjs:1017 · a release run that fails after its tag push leaves a `v*` tag with no GitHub release, and a fork's lane integrates it like any release (it reads git only, by design); REQ-UPSTREAM-030 keeps the tag still and the next patch follows, and file 01's heartbeat counts published releases, but the lane itself has no signal for an unpublished tag · source: /st-plan · Ref: docs/plans/016-fork-distribution-03.md
- Minor · .github/workflows/release.yml:1048-1078 · the route-proof and QA results reach the GitHub release by a `gh release upload` after publish, which works only while immutable releases stay off here (`gh api repos/zomarit/stamity/immutable-releases` read `enabled: false` on 2026-10-06); attaching them from the release workflow would survive turning them on · source: /st-plan · Ref: docs/plans/016-fork-distribution-03.md
- Minor · the Copilot CLI channel refresh · whether `copilot plugin update stamity@stamity` follows a channel branch that moved, or needs `copilot plugin marketplace update stamity` first, is unmeasured: the client reads `file://` and `git://` marketplace URLs as local paths (1.0.89, 2026-10-06), so the walk needs a remote branch that moves; the auto-update live leg records it · source: /st-plan · Ref: docs/plans/016-fork-distribution-03.md
- Minor · docs/enterprise-forks.md · how GitHub treats a lane pull request under a "Require signed commits" rule — upstream's commits carry no signature (177 of 178 between `v1.10.0` and `v1.11.0`) and neither does the lane's merge commit — is read from GitHub's page, not measured; a probe needs a scratch repository with that rule · source: /st-plan · Ref: docs/plans/016-fork-distribution-03.md
- Minor · docs/enterprise-forks.md · whether a GitHub-owned-only allowed-actions policy fails a `release.yml` or `pack-signing-rehearsal.yml` run in a fork although every job using `step-security/harden-runner` is skipped there is unmeasured; the settings guide offers allowlisting the SHA or disabling both workflows · source: /st-plan · Ref: docs/plans/016-fork-distribution-03.md
