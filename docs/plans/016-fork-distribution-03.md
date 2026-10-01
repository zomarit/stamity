---
id: fork-distribution-03
intent: feature
stamp: 88fcfd324c5efeb10c7508d4cfbc13389291c571 2026-10-01
reads: [.claude-plugin/marketplace.json, .claude-plugin/plugin.json, .cursor-plugin/plugin.json, .github/release-controls-checklist.md, .github/workflows/ci.yml, .github/workflows/fork-release.yml, .github/workflows/nightly.yml, AGENTS.md, CHANGELOG.md, CLAUDE.md, GOVERNANCE.md, README.md, apm.yml, docs/capability-matrix.md, docs/customization.md, docs/doctrine.md, docs/enterprise-forks.md, docs/enterprise-quickstart.md, docs/getting-started.md, docs/measurements.md, docs/plugins.md, docs/specs/enterprise-upstream-lane.md, docs/specs/plugin-lifecycle.md, docs/troubleshooting.md, evals/SET-v7.md, evals/cases-v6, evals/model-profiles-v1.json, evals/runs, llms.txt, package.json, plugin.json, renovate/companion.json, renovate/plugins.json, scripts/apm-install-smoke.mjs, scripts/build-plugin-distribution.mjs, scripts/build-plugin-runtime.mjs, scripts/ci/test-run.mjs, scripts/distribution-identity.mjs, scripts/eval/run.mjs, scripts/evidence-archive.py, scripts/evidence-summary.mjs, scripts/fork-identity.mjs, scripts/generate-apm-package.mjs, scripts/generate-capability-matrix.mjs, scripts/generate-docs.mjs, scripts/generate-plugin-manifests.mjs, scripts/hook-latency.mjs, scripts/leak-gate.mjs, scripts/merge-ready-rate.mjs, scripts/plugin-lifecycle-fixture.mjs, scripts/plugins/clients, scripts/plugins/managed-settings.mjs, scripts/plugins/releaseManifest.mjs, scripts/plugins/setupCommand.mjs, scripts/qa/bind.mjs, scripts/qa/form.mjs, scripts/qa/plugin-runs.mjs, scripts/qa/run.mjs, scripts/repo-hygiene.mjs, scripts/tarball-smoke.mjs, scripts/upstream.mjs, src/cli/docs/llmsIndex.ts, src/cli/docs/measurements.ts, src/cli/kit/packageName.ts, src/emit/ownership.ts, src/manifest/manifest.ts, test/ci/changelogLinks.test.ts, test/ci/docsRoster.test.ts, test/ci/docsSite.test.ts, test/ci/hookLatency.test.ts, test/ci/managedSettings.test.ts, test/ci/pluginDistribution.test.ts, test/ci/pluginLifecycle.test.ts, test/ci/repoHygiene.test.ts, test/ci/workflow.test.ts, test/cli/docs/llmsIndex.test.ts, test/cli/docs/measurements.test.ts, test/docsPages.test.ts, test/evals, test/qa/form.test.ts, test/qa/run.test.ts, test/records/specStatus.test.ts, test/upstream/fixtures.ts, test/upstream/lane.test.ts, website/sidebars.ts]
depends_on: [docs/plans/016-fork-distribution-02.md, docs/plans/015-board-writes.md]
---

# Fork and distribution polish — file 3 of 3: docs, route proofs and the 1.12.0 release

This file is self-contained. It is the third of three `/st-plan` artifacts for **Package 20** (stamity's fork support
and its three distribution routes, end to end). It follows file 2 (`docs/plans/016-fork-distribution-02.md`, the three
routes), and it cuts the one release of the package, 1.12.0, which also carries Package 19 (`docs/plans/015-board-writes.md`),
Package 18 (`docs/plans/014-lean-repository-01.md`, `-02.md`) and the 1.11.0 ops-pack fix.

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
| S3 | The docs say hooks fail open on a timeout, with the exception the capability matrix records (Cursor events marked `failClosed` deny on a timeout), and that hard limits belong in each client's own permission settings. | The brief's sentence is true for most clients, not all. |
| S4 | No page types a host name; hosts are named in words (the hand-page domain rule, `test/docsPages.test.ts:410`). GitHub Enterprise Server and GitHub Enterprise Cloud with data residency stay on the drop list, one line each. | The docs test refuses bare domains in prose. |
| S5 | `u3-route-proofs` builds and rehearses the route-proof tool; the proof of record runs at the candidate inside `u3-release-1-12-0`, after the version bump, because the harness rows bind to the candidate's bytes. A CI leg's evidence is its run URL, job names and conclusions; a harness leg's is its row id, `rowHash` and reason (with the client version); a walk's is its signer and date. | The candidate exists only after the bump; a per-leg output digest exists only for harness rows. |
| S6 | The first promotion of 1.12.0 to `stable` is part of the release, approved by the maintainer. | The per-channel admin templates point at `plugin-stable`, which exists only after a promotion. |
| S7 | The live legs that need an account this project lacks — the Copilot organization install at sign-in, the auto-update legs, Cursor's team marketplace and Required plugins in the CLI — are recorded `Not done:` with their owner; the VS Code leg is walked by the maintainer. | The maintainer's answer on accounts. |
| S8 | 1.12.0 runs one fresh full eval run on the final inputs; amended specs keep their first-release status, and every spec still reading `design` that a shipping plan names (`docs/specs/board-writes.md` among them) flips to `shipped-with-1.12.0` before the tag. | `evals/SET-v7.md:820-823`, `:971-972`; 1.11.0's first release run failed on the shipped-spec check. |

### Before this file runs

- **Files 1 and 2 have merged** (`docs/plans/016-fork-distribution-01.md`, `-02.md`), and so have Package 19
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
`path:line` was read at `88fcfd32`. `/st-work` merges it at its Prove phase. `<date>` is the merge date and `<unit>` the
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

#### Plugin spec — Non-goals (MODIFIED)

Replaces `docs/specs/plugin-lifecycle.md:1456`, "A fleet-management or update service of stamity's own (Renovate
proposes every update)." New text: "A fleet-management or update service of stamity's own. An update arrives as a pull
request: from the organization's orchestrator running `stamity upgrade` (the recommended path), or from Renovate
(REQ-PLUGIN-043)." (Amended `<date>`, plan 016 file 3, unit `u3-cli-pin-update-paths`; it read as quoted.)

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
- GIVEN the section THEN no command in it force-pushes, and the step that turns Actions off comes before any push.

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
     mode for every client (a per-client mode is on the drop list); a class reaching a client twice fails `check`.
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
     (GitHub community discussion 200387); VS Code — plugins GA behind `chat.plugins.enabled`, hooks in preview with
     matchers ignored (stamity's hooks filter themselves from 1.12.0), reads `.github/instructions/**` and `.claude/rules`
     additively, skills from the three skills folders, repository `enabledPlugins` only a recommendation (vscode issue
     336858), private git-subdir updates fail (vscode issue 328856); Cursor IDE — `AGENTS.md`, `.cursor/rules/*.mdc`,
     touchpoints as `/st-<id>`, `.cursor/hooks.json`, team marketplace on Teams and Enterprise; Cursor CLI — reads
     `.cursor/rules`, `AGENTS.md`, `CLAUDE.md`, plugin skills, commands, subagents and MCP (since March 2026) and plugin
     hooks (since 2026-08-11), plugin rules undocumented (hence repository-owned rules,
     `docs/plans/016-fork-distribution-02.md (u2-cursor-rules-bugbot)`), falls back to a session without plugins when
     loading is slow; Cursor cloud agents — `AGENTS.md` and committed skills, no team-marketplace plugins; Bugbot —
     `.cursor/BUGBOT.md` only. **Unverified at drafting**, each with its probe on the execution day: which repository files
     Copilot reads in Visual Studio, JetBrains IDEs, Eclipse and Xcode (`AGENTS.md`, `.github/instructions/*.instructions.md`,
     `.github/prompts/*.prompt.md`, `.github/agents/*.agent.md`, skills folders, hooks) and whether any of them loads
     plugins — probe: GitHub's Copilot customization reference and its per-IDE support table, plus JetBrains' Copilot CLI
     agent page (June 2026); whether the Cursor CLI reads `.cursor/hooks.json` — probe: Cursor's CLI reference.
  4. `## How much each route writes` — a table of file counts, each with the command, the commit and the date. Measure
     in a scratch git repository with the built CLI (`npm run build` first), counting
     `find . -type f -not -path './.git/*' \| wc -l`: `node <repo>/dist/cli.js init -y --tools claude,cursor,copilot`;
     the same with `codex` added; each client alone; plugin-backed: `node <repo>/dist/cli.js plugin setup --client
     claude,cursor,copilot --plugin-root <dist>/claude --plugin-root <dist>/cursor --plugin-root <dist>/copilot -y` over a
     distribution built with the three lines of `docs/enterprise-forks.md:841-849`; APM alone: the deployed count
     `docs/plans/016-fork-distribution-02.md (u2-apm-sparse-measure)` recorded, cited with its date; APM-backed: the CLI's
     own files in `apm-backed` mode. The planning run's figures at `88fcfd32` (181 for three clients, 205 with codex,
     claude 70, cursor 80, copilot 70, codex 77, plugin-backed three clients 29) are history the page does not print;
     file 02 moves them.
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
     `Not done:` without a CLI; a hook that cannot start Node keeps its guard closed and names Node, the floor and the
     install remedy (`docs/plans/016-fork-distribution-01.md (u1-node-missing-hint)`).
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
    link `[Switch routes](choose-a-route.md)`; `:521-523` "No release through 1.11.0 ships a migration engine" stays
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

### u3-customization-per-route — the customization guide says what reaches each client on each route

| Field | Content |
|---|---|
| `id` | u3-customization-per-route |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/customization.md` (`:5-11`, `:320-324`, a new section before `:326`); `docs/enterprise-forks.md` (`:1028-1030` only); `test/docsPages.test.ts` (one new case in `describe("the guides")`); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** `docs/customization.md:320-324` says every override on the page is a CLI consumer override, that an APM author customizes `content/` or `fork/`, and that package generation does not read a consumer's override tree; `:326-371` (`## What does each client do with your override?`) lists client limits; the overlay table `:217-222` and override table `:42-47` are pinned by `test/docsPages.test.ts:2052-2075`. `docs/enterprise-forks.md:1028-1030` reads "Cursor's team marketplace and Codex's workspace route are the other two organization routes, and [the plugins guide](plugins.md) describes them under each client's install." **New section** `## What reaches each client on each route?`, inserted directly before `:326`. **1.** A table, header `\| Route \| Your overrides and patches \| Model pins (model.*) \| Installed packs \| A fork's fork/ layer \|` (spell the code in backticks), rows: CLI route — every class emitted per client, pins applied, packs installed, the fork layer resolved under your overrides; plugin route — overrides, patches and model-pinned agents emitted as project-level copies beside the plugin's own copy, with the precedence `docs/plans/016-fork-distribution-02.md (u2-plugin-overrides)` lands, pack skills exempt on every client; APM route — only the fork layer (APM generation reads `content/` and `fork/`, never `.stamity/overrides/`), and in `apm-backed` mode the CLI's own classes only. **2.** One line per client naming what the user invokes when an override and the plugin's copy both exist: Claude Code (plugin artifacts namespaced `/stamity:<id>`, the project copy under its bare id), the Copilot CLI (a project skill shadows the plugin's skill of the same id), VS Code (plugin skills prefixed `/<plugin>:`), Cursor and Codex as landed. Fill each line from a measured fixture, not from this cell: a scratch repository in plugin mode with one override per class, then `node <dist>/<client>/runtime/locate.mjs -- plugin status --json` and `node dist/cli.js check --json`, whose per-client reach report u2-plugin-overrides adds; the run record keeps both outputs. **3.** `## What can you change on the client side?` (a new `##` after the table section): your own skills and agents in each client's user folder (paths read from each vendor's page on the execution day, dated); turning a plugin off per workspace in VS Code and in Cursor (the vendor's control named in words, dated); and that a Cursor team-marketplace plugin set to Required cannot be uninstalled by a member. **4.** `:320-324` keeps its sentence and points at the new section. **5.** `docs/enterprise-forks.md:1028-1030` → "Copilot's enterprise managed settings, Cursor's team marketplace and Codex's workspace import are the other organization routes; the subsections below describe each." (`u3-rollout-guides` then writes those subsections.) **6.** Re-open trigger `:6-11` gains "or what reaches a client on a route changes (`src/emit/ownership.ts`, `scripts/generate-apm-package.mjs`)"; `:5` to the commit form; `docs/enterprise-forks.md:5` to the commit form. **New case** "the customization guide states what reaches each client on each route": `sectionOf(read(CUSTOMIZATION), "## What reaches each client on each route?")` is non-empty, its table's first column reads `CLI route`, `plugin route`, `APM route` (case-insensitive) and the client-side section names `Required`. **CHANGELOG** `### Changed`: "**The customization guide says what reaches each client on each route.** On the CLI route your overrides reach every client; on the plugin route they reach it as project-level copies beside the plugin's own; on the APM route only a fork's `fork/` layer does. The guide also names what you can change in the client itself." **Follows:** `docs/customization.md:296-324` (a question-form `##` heading, a table, then per-client prose). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "the customization guide's override tree and thresholds are the module's, not a copy" among the passes. **Given** `rg -n "the other two organization routes" docs/enterprise-forks.md`, **then** it prints nothing and `rg -n "Copilot's enterprise managed settings" docs/enterprise-forks.md` prints one line. **Given** the run record, **then** it keeps the `plugin status --json` and `check --json` outputs the per-client lines were written from, with the commit they ran at. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | u2-plugin-overrides landed a precedence that differs per client from the three named in the synthesis → the page states the landed behaviour, and the run record names the difference. A client's user-folder path is not on its vendor page → the line reads `not documented (<page> read <D>)`. A model pin cannot reach a plugin-carried agent on some client → the table cell says so; it is never left blank. |
| `depends_on` | u3-route-guide, docs/plans/016-fork-distribution-02.md (u2-plugin-overrides and u2-apm-backed-mode) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

### u3-rollout-guides — the organization rollout per client, and three stale facts corrected

| Field | Content |
|---|---|
| `id` | u3-rollout-guides |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/enterprise-forks.md` (`## Roll the plugin out to your organization`, `:1023-1166`, and `:5-21`); `docs/plugins.md` (`:5-11`, `:216-228`, `:293-298`, `:386-396`, `:420-451`, `:566-573`); `scripts/build-plugin-distribution.mjs` (`:329-330`); `test/docsPages.test.ts` (`:2317-2344`, one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed` and `### Fixed`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts test/ci/pluginDistribution.test.ts test/ci/managedSettings.test.ts`, **then** it exits 0, including "the enterprise-forks guide's managed-settings block is the renderer's own output" (extended below) and the new "the rollout section gives every client its route and states the hook limit". **Given** the section, **then** each fenced `json` block in it deep-equals, key order included, the renderer call its preceding sentence names. **Given** `rg -n "is not optional on an install recorded in your repository" docs/plugins.md`, **then** it prints nothing once the probe below measured the scope as optional, or the sentence carries the probe's client version when it measured the scope as still required. **Given** a built distribution's `codex` section of `README.md`, **then** it no longer says hooks need `features.hooks = true`. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | file 02 renamed the managed-settings renderer or changed its options → the extended pin calls the landed signature (`scripts/plugins/managed-settings.mjs` exports, read at intake) and the blocks follow it. The Claude scope probe cannot run (no Claude Code, or no login needed but the fixture fails) → `docs/plugins.md:392-394` states the vendor changelog line with its date beside the 2026-09-20 measurement, and every command keeps `--scope project`, which both readings accept. A vendor fact for Copilot managed settings or VS Code policies changed since 2026-10-01 → the page states the re-read fact and date; the run record names the change. Codex workspace import cannot name a branch other than the default → the Codex subsection says the import follows `main`'s Codex catalog (the release tag) and that channels do not apply to Codex. |
| `depends_on` | u3-customization-per-route, docs/plans/016-fork-distribution-02.md (u2-admin-templates and u2-channels-promote and u2-declare and u2-main-catalogs and u2-hooks-self-filter-vscode and u2-review-gate-all) |
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
     warning; then the four existing subsections, demoted to `####`. Add: the vendor states that a managed
     `enabledPlugins` installs the plugin, while the 2026-09-26 walk on a session with no login did not (`:1120-1122`
     keeps that measurement); `claude -p` does not reconcile marketplaces; auto-update is per marketplace and off by
     default for third-party marketplaces; the open report that it refreshes the catalog without re-installing
     (anthropics/claude-code issue 61854, closed as a duplicate, fix unverified on <D>) is a live leg `u3-route-proofs`
     records `Not done:`.
  3. `### Copilot: enterprise managed settings` — the `.github-private` repository's `copilot/managed-settings.json`
     (GA 2026-07-01; legacy path `.github/copilot/settings.json` in that repository); the release tree's
     `admin/copilot-managed-settings.json` (u2-admin-templates) as a `json` block equal to its renderer; keys
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
  10. `### Hooks guide; permissions enforce` — plainly: a hook that times out lets the action through (always on
      Copilot; on Cursor unless the event is marked `failClosed`; Claude Code and Codex as their hooks pages state on
      <D>), so hooks guide and record what the agent does, and hard limits belong in each client's own permission
      settings, named per client (Claude Code `permissions` deny rules, which managed settings can enforce; Codex
      `sandbox_mode` and its approval policy; Copilot's and Cursor's own permission controls as their pages name them on
      <D>). Consistent with the generated `docs/capability-matrix.md:257-268` table (Copilot `:267`, Cursor `:268`), which the subsection links.
- **The extended pin** (`test/docsPages.test.ts:2317-2344`): every `json` block in the section is parsed, and each
  deep-equals (key order included) the renderer call named in the sentence before it — the per-tag Claude call
  `renderClaudeManagedSettings(identity, { ref })` as today, the per-channel Claude call and the Copilot call with the
  option names u2-admin-templates exports (read at intake). A `TEST CHANGE, justified:` comment names this unit: the
  section now prints three renderer outputs, and each is held to its renderer. **New case** "the rollout section gives
  every client its route and states the hook limit": the section carries `###` headings beginning `Choose a channel`,
  `Claude Code`, `Copilot`, `VS Code`, `Cursor`, `Codex`, `Where review sits` and `Hooks guide`, and its hook subsection
  contains "lets the action through" and "permission settings".
- **`docs/plugins.md` corrections.** `:392-394`: measure first — run `node scripts/plugin-lifecycle-fixture.mjs --out
  <tmp>`, add the clone at the first tag and install at project scope exactly as `test/ci/pluginLifecycle.test.ts`'s
  Claude walk does, move the clone to the second tag, then `claude plugin update stamity@stamity` with no `--scope` in
  a scratch `CLAUDE_CONFIG_DIR`; exit 0 with `updateOutcome: "updated"` → the sentence says the scope is found by the
  client from that version on (the planning run read 2.1.281 in the vendor changelog on 2026-10-01) and keeps the
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

### u3-troubleshooting — troubleshooting rows for the route failures the enterprise met

| Field | Content |
|---|---|
| `id` | u3-troubleshooting |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/troubleshooting.md` (`:5-9`, a new section between `## Common failures`'s end `:315` and `## Where to report a problem` `:316`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** the page's doctor rows sit between `## What \`check\` prints` (`:80`) and `## Common failures` (`:124`) and are set-equal with `check.ts`'s probe ids (`test/docsPages.test.ts:2755-2785`); a new section after `## Common failures` does not move that pin. **New section** `## When a route misbehaves`, nine `###` rows in this order, each a symptom heading, then its cause and remedy in two short paragraphs, each vendor fact dated: (1) `### Claude Code says the plugin is not found in the marketplace` — under managed settings the client knows the marketplace only after one interactive start past the first-run screens; `claude -p` does not fix it; then `claude plugin install stamity@stamity` (`docs/enterprise-forks.md:1104-1122`); an auto-update that refreshes the catalog without re-installing is the open report anthropics/claude-code issue 61854 — re-run `claude plugin update stamity@stamity`. (2) `### Codex installed the plugin without its hooks or its runtime` — a marketplace added without `--ref` read the default branch; from 1.12.0 that branch carries a Codex catalog pointing at the release tag, a fork regenerates it with `scripts/fork-identity.mjs`, and an older fork still traps: re-add with `--ref plugins/v<version>` (`docs/plugins.md:267-277`). (3) `### Codex runs none of the plugin's hooks` — project trust plus a per-hook `/hooks` review, re-done after any hook changes; headless `codex exec` ran no project hook in any measured run (`docs/troubleshooting.md:193-211`). (4) `### The Copilot CLI loads no hooks` — hooks load only in a trusted folder; headless needs `COPILOT_ALLOW_ALL` set to exactly `true` (`docs/plugins.md:55-64`). (5) `### The Cursor CLI started without the plugin` — when loading the plugin list is slow the CLI opens a session without plugins (planning run, read 2026-10-01); start a new session and confirm with the CLI's plugin listing. (6) `### A VS Code hook fires on every event` — VS Code ignores matchers; hooks from 1.12.0 filter themselves, an older setup re-syncs (`stamity sync`) or reinstalls the plugin. (7) `### An override has no effect` — on the plugin route before 1.12.0 a plugin-owned class dropped overrides; from 1.12.0 they land as project-level copies, the client may list both names (`/stamity:<id>` and `/<id>` on Claude Code), and `check`'s per-client reach row (u2-plugin-overrides) says what reaches; on the APM route only `fork/` applies. (8) `### apm install reports success and deploys nothing` — apm-cli below 0.29.1 exits 0, deploys nothing and prints the line `docs/getting-started.md:114-116` quotes; `check` fails below 0.29.1 from `apm.lock.yaml`'s `apm_version` (u2-apm-floor-current; name the landed row id); upgrade apm-cli. (9) `### Renovate offers the wrong prerelease tag` — Renovate's default `semver-coerced` treats `.1` and `.2` prerelease tags as equal; extend the shipped presets (`renovate/companion.json`, `renovate/plugins.json`, `renovate/apm.json`), which set `versioning: semver` with `ignoreUnstable: false` for `v<x.y.z>-<suffix>.<n>` and regex versioning for `plugins/v…`. Re-open trigger `:6-9` gains "or a vendor behaviour a route row cites changes"; `:5` to the commit form. **New case** "troubleshooting carries a row for each route failure the docs name": `sectionOf(read(TROUBLESHOOTING), "## When a route misbehaves")` holds exactly the nine `###` headings above, in order. **CHANGELOG** `### Changed`: "**Troubleshooting covers the routes.** Nine rows name the route failures an enterprise met, from Claude Code's first start under managed settings and Codex's `--ref` trap to Copilot's trusted folders, the Cursor CLI's plugin-less sessions, VS Code ignoring matchers, an override with no effect, APM's silent old clients and Renovate's prerelease ordering." **Follows:** `docs/troubleshooting.md:126-171` (symptom-first `###` headings, cause, remedy, command block). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "troubleshooting documents the doctor rows check prints, and only those" among the passes. **Given** the section, **then** it holds nine `###` headings and each row names at least one remedy command or setting in backticks. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | u2-apm-floor-current put the APM floor into an existing `check` row instead of a new probe → row (8) names that row id; the doctor table already lists it (file 02's job), and this unit adds no probe row. The Cursor CLI's fallback is documented differently on <D> → row (5) quotes the re-read behaviour and date. The sample `check` transcript at `:31-54` is refreshed by `u3-release-1-12-0`, not here. |
| `depends_on` | u3-rollout-guides, docs/plans/016-fork-distribution-02.md (u2-apm-floor-current and u2-plugin-overrides and u2-apm-renovate-preset), docs/plans/016-fork-distribution-01.md (u1-renovate-suffix) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

### u3-reset-guide — a reset that works under protected branches, documented and fixture-tested

| Field | Content |
|---|---|
| `id` | u3-reset-guide |
| `requirements` | REQ-UPSTREAM-022 |
| `files` | `docs/enterprise-forks.md` (a new `### Reset or re-import under protected branches` after `### Recover when there is no shared history`, `:241-257`; the re-open trigger `:6-11`); `test/upstream/resetRecipe.test.ts` (new); `CHANGELOG.md` (`## [Unreleased]`, `### Added`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/upstream/resetRecipe.test.ts` on Linux or macOS, **then** it passes: (a) the origin's `stamity-reset` head is a commit whose tree equals the fresh tree and whose parents are exactly `[old main, the v1.3.0 commit]`; (b) origin carries `refs/tags/legacy/main-<12-hex>` naming the old main; (c) origin no longer carries `plugin-dist` or `plugins/v1.0.0`, and still carries `main` and every `v*` tag it had; (d) the bundle file exists and `git bundle verify` exits 0; (e) the `gh` stub's log shows the Actions-off call before the first `git push` and the Actions-on call last; (f) after the fixture lands `stamity-reset` into `main` with `git merge --no-ff`, `runLane(fork, ["status"])` (which adds `--json`) reports outcome `up-to-date` with `v1.3.0` integrated; (g) in the second fixture, whose `plugin-dist` head reads `plugins: v1.0.0-acme.1 from <a fork commit>` and whose tag is `plugins/v1.0.0-acme.1`, both survive. **Given** the page's block, **then** no line matches `--force\|-f ` on a `git push`, and the Actions-off line precedes every `git push` line. **Given** Windows, **then** the case is skipped with the reason "the recipe is a bash block; Git Bash is not driven by this suite". **Given** `npx vitest run test/docsPages.test.ts test/upstream`, **then** it exits 0. |
| `edgeCases` | The fork publishes its own distribution → the guard keeps `plugin-dist` (its head names a commit not reachable from `upstream/main`) and every suffixed `plugins/v*-…` tag. A fork distribution pushed by hand with the message `plugins: v<version>` (no "from") → the guard cannot read a source and keeps the branch, the safe direction (a follow-up names `scripts/build-plugin-distribution.mjs:424`). `plugin-dist` absent on origin → the `git fetch` fails quietly and the step skips. The old lane has an open update pull request → the prose closes it after the reset lands (file 01's `u1-lane-issues-freshness` closes superseded issues once the lane is up to date). A ruleset requires signed commits → `git commit-tree -S` signs the reset commit; the prose names the flag. |
| `depends_on` | u3-troubleshooting, docs/plans/014-lean-repository-01.md (f1-import-recipe), docs/plans/016-fork-distribution-01.md (u1-lane-issues-freshness) |
| `verify` | `npx vitest run test/upstream/resetRecipe.test.ts test/upstream/lane.test.ts test/docsPages.test.ts && node scripts/leak-gate.mjs && npm run lint && npm run typecheck` |

`u3-reset-guide` interfaces:

- **Where.** A `###` inside `## Get a fork that carries the upstream history` (`docs/enterprise-forks.md:56`), after `### Recover when there is no shared history` (`:241-257`). The heading text exactly `### Reset or re-import under protected branches` (`u3-quickstart` links it). Package 18 rewrote the import block
  (`docs/plans/014-lean-repository-01.md (f1-import-recipe)`: `--single-branch --branch main`, pushes `main` and `v*`
  only); the reset's prose points at that block for a fresh import and never re-introduces `--mirror`.
- **Follows:** `docs/enterprise-forks.md:92-125` (a `set -euo pipefail` block a reader copies, then prose explaining
  each check and what it protects).
- **Prose, one short paragraph per step:** why (rulesets block force-pushes; a merge commit whose tree is the fresh tree
  keeps the lane's history and lets it read the integrated version from history, REQ-UPSTREAM-003); the two traps the
  enterprise met (an older `--mirror` import copied upstream's `plugin-dist` and `plugins/*`; the old branch's hourly
  lane keeps running and opens issues while the reset is open); land the pull request with a merge commit, never squash
  or rebase (`## Land the update branch`); close the old lane's update pull request and issues after it lands; signed
  commits → `git commit-tree -S`. The fresh tree must carry the fork's own files, `.stamity/upstream.json` first among
  them (without it the lane reads the repository as `not-a-fork`), so the identity-and-customization step names
  `git checkout "$OLD_MAIN" -- .stamity/upstream.json <your customized paths>` before `scripts/fork-identity.mjs`.
- **The block** — one fenced `sh` block, bash, every line in a shape the test drives (assignments, `git`, `gh`, `if`,
  `for`, `case`, `rm`, `node`); the comment line `# … apply your identity and customization here, then commit …` is
  the split point the test fills:

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
# 5. Remove the distribution refs an older --mirror import copied from upstream, and only those.
if git fetch --quiet origin refs/heads/plugin-dist 2>/dev/null; then
  SOURCE="$(git log -1 --format=%s FETCH_HEAD | sed -n 's/^plugins: v[^ ]* from \([0-9a-f]\{40\}\)$/\1/p')"
  if [ -n "$SOURCE" ] && git merge-base --is-ancestor "$SOURCE" upstream/main; then
    git push origin --delete plugin-dist
  fi
fi
for REF in $(git ls-remote --refs --tags origin 'refs/tags/plugins/*' | cut -f2); do
  case "$REF" in
    *-*) ;;
    *) git push origin --delete "$REF" ;;
  esac
done
# 6. After the pull request from stamity-reset lands with a merge commit: workflows on last, then check.
gh api --method PUT "repos/$STAMITY_DOWNSTREAM/actions/permissions" -F enabled=true
node scripts/upstream.mjs status
```

  Provenance line under the block: "*Run by `test/upstream/resetRecipe.test.ts` against fixture repositories on every
  change; the 2026-09-29 enterprise reset landed the same merge-commit shape.*"
- **The test** `test/upstream/resetRecipe.test.ts`. **Follows:** `docs/plans/014-lean-repository-01.md
  (f1-import-recipe)`'s `test/upstream/importRecipe.test.ts` (read the page, run its commands against `file://`
  repositories) and the fixtures `test/upstream/fixtures.ts` (`createUpstream` `:405`, `createFork` `:529`, `runLane`
  `:626`, `parentsOf` `:764`, `isolatedEnv` `:91`, `makeScratch` `:790`). Steps: `createUpstream(parent)` (tags
  `v1.0.0`–`v1.3.0`, `RELEASE_TAGS` `:287`); `createFork(upstream, parent)` at `v1.0.0` (it writes the fork's
  `.stamity/upstream.json`, `:529-553`); a remote `upstream` at `upstream.dir` and `git fetch upstream 'refs/tags/v*:refs/tags/v*'`;
  a bare `origin.git`, the fork's `origin` repointed at it, then pushed `main`, the `v*` tags, an orphan `plugin-dist`
  whose commit message is `plugins: v1.0.0 from <the v1.0.0 commit>` and a tag `plugins/v1.0.0` on it (what a `--mirror`
  import brought), then `git fetch origin` so `origin/main` exists; a `gh` stub script first on `PATH` that appends its
  arguments to a log and exits 0. Extract the page's block with `sectionOf(page, "### Reset or re-import under protected
  branches")` and the first fenced `sh` block; replace `STAMITY_RESET_TAG='v1.12.0'` with `'v1.3.0'`; split it at the
  marker comment and at the `# 6.` comment. Run steps 1–3 up to the marker, then the fixture's identity commit
  (`git checkout "$OLD_MAIN" -- .stamity/upstream.json && printf 'acme\n' > ACME.md && git add -A && git commit -qm
  identity`), then steps 3–5, all as one `spawnSync("bash", ["-c", script], { cwd: fork.dir, env })` under
  `isolatedEnv`. Then land the reset the way the pull request does (`git fetch origin stamity-reset && git switch main &&
  git merge --no-ff -m "Merge stamity-reset" FETCH_HEAD && git push origin main`), run step 6's `gh` line through the stub,
  and run its `status` through `runLane(fork, ["status"])`, which spawns this repository's `scripts/upstream.mjs` in the
  fixture (`:626-648`); the test asserts step 6 holds exactly those two lines. The second fixture repeats the run with
  `plugin-dist` whose message names a fork-only commit and a tag `plugins/v1.0.0-acme.1`.
  `describe.skipIf(process.platform === "win32")` with the reason in the edge case. Every assertion is in `testCriteria`.
- **Re-open trigger** `docs/enterprise-forks.md:6-11` gains "`test/upstream/resetRecipe.test.ts` runs the reset block";
  `:5` stays on the commit form with `<D>`.
- **CHANGELOG** `### Added`: "**A reset that works under protected branches.** The enterprise guide's new section backs
  a fork up, stops its old lane, names the old main `legacy/main-<sha>`, and lands the fresh tree as a merge commit on
  it, so no force-push is needed and the lane still reads the integrated release from history. It removes only the
  distribution refs an older mirror import copied from upstream, and a test runs the block on every change."

### u3-settings-constraints — the repository settings a fork should apply, and the constraints an enterprise imposes

| Field | Content |
|---|---|
| `id` | u3-settings-constraints |
| `requirements` | REQ-UPSTREAM-023 |
| `files` | `docs/enterprise-forks.md` (a new `## Recommended settings and enterprise constraints` between `## Release your fork`'s end `:1022` and `## Roll the plugin out to your organization` `:1023`; `### Know what proves a release` `:994-1001`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Added`) |
| `interfaces` | **Current facts:** tag rulesets are described only for the canonical repository (`.github/release-controls-checklist.md:84-129`); every workflow pins actions to full SHAs; the environment names are `environment: fork-release` (`.github/workflows/fork-release.yml:409`) and `environment: npm-publish` (`release.yml:662`), plus the promotion environment `promote.yml` declares (u2-channels-promote, read at intake); the default distribution branch is `const DEFAULT_BRANCH = 'plugin-dist'` (`scripts/distribution-identity.mjs:21`); github.com-only refusals at `scripts/distribution-identity.mjs:190-192`, `:306-310`, `scripts/fork-identity.mjs:113`, `:151`, `src/cli/kit/packageName.ts:182`; the host boundary is explained under **Any other host.** in `### Add the optional token, and what it buys` (`:1264-1280`). **New section**, heading exactly `## Recommended settings and enterprise constraints` (`u3-quickstart` links it), with `### Rulesets` (a table `\| Target \| Rules \| Bypass \|`: tags `v*` and `legacy/*` — restrict creations, updates and deletions, block force pushes — the maintainers who cut releases; tags `plugins/v*` — restrict updates and deletions — the identity the release workflow pushes as, for creation; branches `plugin-dist` and each channel branch (`plugin-stable`, `plugin-canary` when used) — restrict deletions — the release and promotion workflows' identity may force-push; the integration branch — allow merge commits, as `## Land the update branch` says), `### The release and promotion environments` (required reviewers on `fork-release` and on the promotion environment; a deployment tag rule `v*-<suffix>.*` on `fork-release`; create both before the first tag), `### Immutable releases` (turn them on: a published release's tag and assets cannot change, which is a fork's tamper guard; GA 2025-10-28; GitHub's build attestations for a private repository need GitHub Enterprise Cloud and are not built — one line, drop list), `### Enterprise constraints` (allowed-actions policies, including requiring actions pinned to a full-length commit SHA — every shipped workflow already pins, and the generated `copilot-setup-steps.yml` pins in its `managed` form, `copilot.setupSteps`; whoever pushes that workflow needs the `workflows` permission; GitHub Packages' npm registry needs a classic personal access token with `read:packages`, package visibility follows the repository, and a registry mirror is the alternative; hosts: the public GitHub host only (the page never types the host name: `BARE_DOMAIN` at `test/docsPages.test.ts:410` refuses it in prose, which is why `:1274` already says "the public GitHub host") — GitHub Enterprise Server and GitHub Enterprise Cloud with data residency are refused by `scripts/distribution-identity.mjs` and stay on the drop list, one line, linking **Any other host** under `[Add the optional token, and what it buys](#add-the-optional-token-and-what-it-buys)`). `### Know what proves a release` (`:994-1001`) gains one sentence pointing at `### Immutable releases`. **New case** "the enterprise-forks guide names the settings a fork applies, held to the workflows that read them": take the section; every `environment:` value in `.github/workflows/fork-release.yml` and `.github/workflows/promote.yml` (parsed with `yaml`, as `test/ci/workflow.test.ts:16` does) appears in it as a code span; every code span in it that names an environment is one of those values; it contains `` `v*` ``, `` `legacy/*` ``, `` `plugins/v*` ``, `` `v*-<suffix>.*` ``, the `DEFAULT_BRANCH` value read by regex from `scripts/distribution-identity.mjs`, "Immutable releases", `` `read:packages` ``, "full-length", `` `workflows` `` and "public GitHub host". **CHANGELOG** `### Added`: "**The settings a fork applies, and the constraints an enterprise imposes.** The enterprise guide lists the rulesets for release, legacy and distribution tags and the distribution and channel branches, the release and promotion environments, immutable releases as a fork's tamper guard, the allowed-actions SHA-pin policy, the `workflows` permission the Copilot setup workflow needs, GitHub Packages' token, and the boundary to the public GitHub host." **Follows:** `.github/release-controls-checklist.md:84-108` (the console steps for a tag ruleset, in words). |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case among the passes, and "the enterprise-forks guide names every variable and secret the fork release workflow reads, and no other" still passes. **Red check:** with `fork-release` renamed in a scratch copy of `fork-release.yml`, the new case fails naming the missing environment. **Given** `rg -n -i "ghe\.com\|\.ghe\." docs/enterprise-forks.md`, **then** it prints nothing (`BARE_DOMAIN`). **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | `promote.yml` declares no `environment:` (u2-channels-promote chose a different gate) → the case reads only `fork-release.yml`, and the section names the gate the landed workflow uses. The ruleset bypass list cannot name the Actions token for a tag ruleset → unverified at drafting; read GitHub's rulesets page on <D> and state the supported bypass (a GitHub App or a role); never a step the console cannot do. A fork that does not publish npm → the GitHub Packages paragraph says it applies only to a fork with `--registry`. |
| `depends_on` | u3-reset-guide, docs/plans/016-fork-distribution-02.md (u2-channels-promote), docs/plans/016-fork-distribution-01.md (u1-copilot-setup-steps) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs && npm run lint` |

### u3-cli-pin-update-paths — how a repository on the CLI route pins the CLI and takes an update

| Field | Content |
|---|---|
| `id` | u3-cli-pin-update-paths |
| `requirements` | REQ-PLUGIN-043 |
| `files` | `docs/enterprise-forks.md` (`### Consume the release`, `:1003-1013`); `docs/getting-started.md` (`## Keeping your setup current`, `:365-376`); `test/docsPages.test.ts` (one new case); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** `### Consume the release` (`:1003-1013`) covers APM refs and the `.npmrc` scope mapping only; `## Keeping your setup current` (`docs/getting-started.md:365-376`) shows `npx -y @zomarit/stamity@<version> sync`. **New**, under `### Consume the release` (heading text unchanged; `u3-quickstart` links it): `#### Pin the CLI` — with a `package.json`: `npm install --save-dev --save-exact @<scope>/stamity@<version>`; without one: nothing to install, because every call the setup writes is already `npx -y @<scope>/stamity@<version> <verb>` (or `npx --no …` for a fork no registry serves, `:175-200`), so the version written into the repository is the pin; private registries: the existing `.npmrc` line and `npm login --scope --registry`; `renovate/companion.json` pins the dev dependency exactly and moves suffixed fork versions (`<x.y.z>-<suffix>.<n>`, `ignoreUnstable: false`; `docs/plans/016-fork-distribution-01.md (u1-renovate-suffix)`). `#### Take an update` — recommended: one pull request per repository from the organization's orchestrator running `npx -y @<scope>/stamity@<new> upgrade --to <new> --json` (what `upgrade` refuses and changes, from the landed `node dist/cli.js upgrade --help`); alternative: Renovate bumps the pin and regenerates through `postUpgradeTasks`, which only a self-hosted Renovate can run and only for commands its global configuration allows in `allowedCommands` (formerly `allowedPostUpgradeCommands`); the risk, stated plainly: the command runs with Renovate's token, which can push workflow files, so allow exactly one anchored command and keep the update pull request under review. Two `json` blocks, the repository configuration `{ "extends": ["github><owner>/<repo>//renovate/companion.json"], "packageRules": [{ "matchPackageNames": ["@<scope>/stamity"], "postUpgradeTasks": { "commands": ["npx --no stamity sync"], "executionMode": "update" } }] }` and the self-hosted global configuration `{ "allowedCommands": ["^npx --no stamity sync$"] }` (no templating needed: after the bump the installed dev dependency is the new version, so `npx --no stamity sync` runs it). Each block's provenance line says it is transcribed from Renovate's configuration-options and self-hosted-configuration pages on <D> and that no run here executed it. `docs/getting-started.md:365-376`: the command becomes `npx -y @zomarit/stamity@<version> upgrade --to <version>` if u2-upgrade-verb did not already move it, with one sentence that `sync` at the new version is the same engine update without the pin move. **New case** "the CLI route's pin and update paths name both forms and the token risk": the `### Consume the release` section contains `--save-exact`, `upgrade --to`, `postUpgradeTasks`, `allowedCommands`, `allowedPostUpgradeCommands` and "token"; both `json` blocks parse; every string in the first block's `postUpgradeTasks.commands` matches one regex in the second block's `allowedCommands`. `docs/getting-started.md:5` to the commit form. **Follows:** `docs/plugins.md:525-564` (the Renovate presets: what each does, a `json` block a consumer extends, and its provenance line). **CHANGELOG** `### Changed`: "**How a repository on the CLI route pins and updates the CLI.** The enterprise guide shows the exact dev-dependency pin, the pin a repository without `package.json` already carries in every generated call, the companion preset for suffixed fork versions, and the two update paths: `stamity upgrade` in a pull request from your orchestrator, or Renovate's post-upgrade task on a self-hosted Renovate, with the risk of the token it runs with." |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the new case and "the enterprise-forks guide states what a rename carries and what it does not" among the passes. **Red check:** with the first block's command changed to `npx stamity sync` in a scratch copy, the new case fails on the regex match. **Given** every command block added, **then** each carries a provenance line. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | Renovate's option names differ on <D> from the planning run's reading → the page uses the names on the page read that day and keeps the former name as "formerly"; the run record names the change. `upgrade --to` refuses because the client set changed → the page names `--allow-client-change` as the operator's decision, never a default. A fork no registry serves → the pin section says the `npx --no` form needs the CLI installed, through the plugin's bundled runtime or a dev dependency. |
| `depends_on` | u3-settings-constraints, docs/plans/016-fork-distribution-02.md (u2-upgrade-verb), docs/plans/016-fork-distribution-01.md (u1-renovate-suffix) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

### u3-quickstart — the enterprise quickstart's days 0 to 2 updated last

| Field | Content |
|---|---|
| `id` | u3-quickstart |
| `requirements` | REQ-UPSTREAM-022, REQ-PLUGIN-043 |
| `files` | `docs/enterprise-quickstart.md` (`:5-10`, `:22-26`, `:28-59`, `:61-66`); `test/docsPages.test.ts` (`:2346-2390`); `CHANGELOG.md` (`## [Unreleased]`, `### Changed`) |
| `interfaces` | **Current:** 66 lines; 5 + 6 + 7 day steps, each one sentence with one link whose text is a heading of `enterprise-forks.md` or `plugins.md`. **Pinned** (`test/docsPages.test.ts:2346-2390`): links both guides, no fenced block longer than one line, ≤ 120 lines, every link into a mapped guide names a heading that guide carries (map built for `[ENTERPRISE_FORKS, PLUGINS]` at `:2366`), `routed ≥ 16` (`:2379`), one link per day bullet. **New steps** (each one sentence, one link, link text = a heading on the target page): Day 0 — first: "Decide which route each team's clients take with [Which route fits](choose-a-route.md)."; after the prerequisites: "Re-setting up a fork you already run? Back it up and land the fresh tree as a merge commit, as [Reset or re-import under protected branches](enterprise-forks.md) shows, instead of importing."; before turning workflows on: "Apply the rulesets, the environments' reviewers and immutable releases from [Recommended settings and enterprise constraints](enterprise-forks.md)." Day 1 — after arming: "Before each tag, run the gate the way upstream proves every pull request as a fork, as [Tag a release](enterprise-forks.md) shows." (confirm at intake that `### Tag a release` names `scripts/ci/fork-probe.mjs`, `docs/plans/016-fork-distribution-01.md (u1-fork-ci-job)`; otherwise link the heading that does); the APM step reworded to the slim package ("…from the slim package each release builds…"); new: "Pick the channel or the tag every client points at, and move a channel only through the promotion workflow, as [Choose a channel or a tag](enterprise-forks.md) explains."; the rollout step reworded to every client ("Roll the plugin out client by client — Claude Code, Copilot, VS Code, Cursor and Codex — with [Roll the plugin out to your organization](enterprise-forks.md)."). Day 2 — new: "Move each repository on the CLI route to the new version with one reviewed pull request, as [Consume the release](enterprise-forks.md) describes."; new: "Promote the next release to canary, let it soak, then to stable — or promote the previous tag to roll back — under [Choose a channel or a tag](enterprise-forks.md)." `## Who does what` Admin cell: "The prerequisites, the rulesets, environments and other repository settings, and each client's organization route." `## Where to go next` gains "[Choose a route](choose-a-route.md) — the three routes side by side, and what each client and IDE gets." Re-open trigger `:6-10` names `docs/choose-a-route.md` beside the two guides; `:5` to the commit form. **Follows:** `docs/enterprise-quickstart.md:28-59` (one sentence and one link per step, the link text a heading of the page it hands off to). **Test change** (`:2346-2390`), with a `TEST CHANGE, justified:` comment naming this unit: the case name "…routes into the two guides…" → "…routes into the three guides…"; `expect(targets).toContain("choose-a-route.md")`; the heading map at `:2366` becomes `[ENTERPRISE_FORKS, PLUGINS, CHOOSE_A_ROUTE]`; `routed` moves from `≥ 16` to `≥ N`, N = the count of links into the three mapped pages after the edit (expected 28: 25 day steps plus three "where to go next" links whose text is an H1), counted, not typed from this cell. **CHANGELOG** `### Changed`: "**The enterprise quickstart takes the route choice, the reset, the settings and the channels.** Day 0 starts with choosing a route and names the reset and the recommended settings; day 1 adds the fork's own gate before each tag and the channel or tag every client points at; day 2 adds the CLI route's update pull requests and promoting a release through canary to stable." |
| `testCriteria` | **Given** `npx vitest run test/docsPages.test.ts`, **then** it exits 0, the renamed quickstart case among the passes with `routed` ≥ N. **Given** `wc -l < docs/enterprise-quickstart.md`, **then** it prints ≤ 120. **Red check:** with `## Which route fits` renamed in a scratch copy of `docs/choose-a-route.md`, the case fails naming "Which route fits". **Given** each day section, **then** every bullet carries exactly one link. **Given** `node scripts/leak-gate.mjs`, **then** it exits 0. |
| `edgeCases` | A heading a step links was renamed by an earlier unit → the step's link text follows the landed heading; the pin fails otherwise, which is the point. The page passes 120 lines → merge two neighbouring steps that hand off to the same section; never raise the budget. File 01 put the fork gate under another heading → link that heading. |
| `depends_on` | u3-cli-pin-update-paths, docs/plans/016-fork-distribution-01.md (u1-fork-ci-job) |
| `verify` | `npx vitest run test/docsPages.test.ts && node scripts/leak-gate.mjs` |

### u3-route-proofs — a route proof that never reads an unrun leg as green

| Field | Content |
|---|---|
| `id` | u3-route-proofs |
| `requirements` | REQ-PLUGIN-044 |
| `files` | `scripts/qa/route-proof.mjs` (new); `test/qa/routeProof.test.ts` (new); `.github/release-controls-checklist.md` (one new line after the sixth line, `:255`) |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** `npx vitest run test/qa/routeProof.test.ts`, **then** every case below passes. **Given** `foldConclusion`, **then** `success` → `passed`; `failure`, `timed_out`, `startup_failure` → `failed`; `skipped`, `cancelled`, `neutral`, `action_required`, `stale`, `null`, `undefined` → `not-run`. **Given** a `ci-jobs` leg with two matching jobs, both `success`, **then** `passed` with both names and the run URL in `evidence`; with one `skipped`, **then** `not-run` naming it; with one `failure` and one `skipped`, **then** `failed`; with no matching job, **then** `not-run` "no job matching …". **Given** a `ci-step` leg whose step is absent, **then** `not-run` "no step named …". **Given** a `qa-row` leg, **then** harness `passed` → `passed`, `performed` → `passed` with by and date, `accepted-unwalked` → `not-run` ("accepted without a walk is not a proof"), `not-run`/`unperformed`/absent → `not-run`, `failed` → `failed`. **Given** a `walk` leg with no answer, **then** `not-run`; with `--walked <id> --by <name>`, **then** `passed` carrying both. **Given** a `live` leg, **then** `not-done` with its owner and the account it needs, whatever the inputs claim. **Given** a rendered proof with one `not-run` leg, **then** the text never pairs that leg with `passed` (regex over its row) and its `Not done:` list names the leg and every live leg with its owner. **Given** `main` with a fake `gh` whose run reports another `headSha`, **then** exit 2 naming both shas; with a QA evidence file of another `sha`, **then** exit 2; with an unknown `--walked` id, **then** exit 2; with every non-live leg passed, **then** exit 0 and the `--out` JSON lists every catalogue leg; with one non-live leg `not-run`, **then** exit 1. **Given** `.github/workflows/ci.yml` and `nightly.yml` parsed with `yaml`, **then** each `ci-jobs` and `ci-step` leg's matcher matches exactly the job it names: `native-check` the job whose `name:` begins `check (`, `plugin-structure` the job whose `name:` begins `plugin route`, `apm-install` the job whose `name:` begins `apm route (`, `fork-gate` the job one of whose steps runs `scripts/ci/fork-probe.mjs`, and `native-four-clients` a step of the `headless-lane` job named `Scratch-repo dogfood (all four clients)`. **Given** `.github/release-controls-checklist.md`, **then** exactly one line names `` `node scripts/qa/route-proof.mjs` ``, and it contains "exits 0" and "release record". **Given** the unit's rehearsal at its own head, **then** the run record keeps the rendered table and the exit code. |
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
    `job: /^headless lane/`, `step: 'Scratch-repo dogfood (all four clients)'`); `plugin-structure` (`ci-jobs`, `ci`,
    `/^plugin route/`); `plugin-claude` (kind `qa-row`, `row: 'H4a'`); `plugin-cursor` (`H4b`); `plugin-copilot-cli`
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
  - `routeVerdicts(rows) → [{ route, proved: boolean, open: string[] }]` — `proved` iff every non-live leg of the route
    is `passed`.
  - `renderRouteProof({ sha, rows }) → string` — a heading line naming the sha, a table `| Route | Leg | Status |
    Evidence |` with one row per catalogue leg in catalogue order (pipes in evidence escaped as `scripts/qa/form.mjs:160-162`
    does), then `Not done:` with one bullet per live leg (title, owner, needs) and per non-live leg not `passed`.
  - `parseArgs(argv)` and `async main(argv, { runGh, readFile, writeFile, stdout } = defaults) → exit code`.
- **CLI:** `node scripts/qa/route-proof.mjs --sha <40-hex> --ci-run <id> --nightly-run <id> --qa <evidence.json>
  [--walked <leg-id> --by <name> [--on YYYY-MM-DD] [--note <text>]] [--out <path.json>]`. It runs
  `gh run view <id> --json headSha,url,jobs` for both runs (unverified at drafting: the field names; probe:
  `gh run view <a recent CI run id> --json headSha,url,jobs --jq '.jobs[0] \| keys, (.steps[0] \| keys)'`), refuses with
  exit 2 when a run's `headSha` or the QA file's `sha` is not `--sha`, prints the rendered proof to stdout, writes the
  JSON `{ sha, generatedAt, rows, verdicts }` when `--out` is given (default `.stamity/evidence/routes-<sha7>.json` is
  NOT assumed; the caller names it), and exits 0 when every route is proved, 1 when not, 2 on bad input, an unreadable
  file or a failing `gh`.
- **The checklist line** after `.github/release-controls-checklist.md:255`, one line: "A seventh line rides the cut,
  before the tag: `node scripts/qa/route-proof.mjs --sha <candidate> --ci-run <id> --nightly-run <id> --qa <evidence>`
  exits 0 on the release candidate — or each leg it names as open carries the maintainer's recorded decision — and its
  table goes into the release record (REQ-PLUGIN-044; added <D>)." The test pattern follows
  `test/ci/hookLatency.test.ts:244-252`.
- **Rehearsal at this unit's head** (the proof of record runs at the candidate in `u3-release-1-12-0` step 9): build the
  distribution outside the repository (`npm pack --pack-destination <tmp>`, `node scripts/build-plugin-runtime.mjs
  --tarball <tgz> --out <tmp>/runtime`, `node scripts/build-plugin-distribution.mjs --out <tmp>/dist --runtime
  <tmp>/runtime --source-commit "$(git rev-parse HEAD)" --source-commit-date "$(git show -s --format=%cI HEAD)"`), run
  `node scripts/qa/run.mjs --skip-browser --dist <tmp>/dist --clients claude,cursor,copilot,codex --sha <head> --out
  <tmp>/qa.json`, dispatch `gh workflow run nightly.yml --ref <branch>`, then the CLI above with the head's CI run and the
  nightly run. Record the table and exit code; a `not-run` leg here is expected (no VS Code walk yet) and is the point:
  the rehearsal shows the tool refuses it.

### u3-release-1-12-0 — cut, measure, prove, tag and publish 1.12.0, then close it

| Field | Content |
|---|---|
| `id` | u3-release-1-12-0 |
| `requirements` | REQ-PROVE-016 (the spec status gate), REQ-PROVE-017 (the release's eval line: "measured per `evals/SET-v7.md` — by the release's baseline run, or by an incremental run composed with it", and the release carries the artifact), REQ-PROVE-018 (every hand page re-attested at the cut), REQ-PROVE-020 (the measurement snapshot refreshed per release), REQ-PLUGIN-025 (the release eval run scores the `st-setup` and plugin-mode cases), REQ-PLUGIN-044 (the route proof executed at the candidate, with `u3-route-proofs`'s tool) |
| `files` | `package.json`, `package-lock.json` (the version); the version-bearing generated files (`.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `plugin.json`, `apm.yml`, the dogfood tree `.claude/**`, `.stamity/manifest.json`, `.stamity/generated/**`, `AGENTS.md`, `CLAUDE.md`, and the `main` catalogs u2-main-catalogs added); `CHANGELOG.md` (`## [Unreleased]` → `## [1.12.0] - <date>`, the footer `:1429-1430`); `docs/specs/board-writes.md` (`:4`) and every other spec reading `design` that a shipping plan names; `src/cli/docs/measurements.ts` (`:103`, `:116`, and `MEASUREMENT_SNAPSHOT_PATH` once plan 014 file 2 landed); `docs/measurements.md`; `README.md` (`:1`, `:27-38`); `docs/doctrine.md` (`:5`, `:96-106`); every hand page's first comment (the 16 of `HAND_PAGES` plus `GOVERNANCE.md:1`); `test/docsPages.test.ts` (`:446-499`, `:546-597`); `docs/troubleshooting.md` (`:31-54`, the sample `check`); `docs/enterprise-forks.md` (the managed-settings block's `ref`); `evals/runs/<date>-run-<n>/**`; `evals/measurements/merge-ready-<date>.json`; `scripts/repo-hygiene.mjs` (`LARGE_FILE_EXCEPTIONS`, `:15-27`) and `test/ci/repoHygiene.test.ts`; `.github/release-controls-checklist.md` (`:192-226`, `:110-129`); `evals/SET-v7.md` (only a dated paragraph if a stale range is repaired); `.stamity/runs/<date>_release-1-12-0/` (record, ledger, QA record); at the close, each 1.12.0 run's `ARCHIVE.json` and compacted `summary.json` |
| `interfaces` | See the block below the table. |
| `testCriteria` | **Given** the candidate with a local lightweight tag `v1.12.0` on it, **when** the release workflow's gate steps run in a clean worktree, **then** each exits 0, and the shipped-spec case "leaves no spec reading `design` that a released plan shipped" ran (it is in the reporter's pass list, not in its skip list) and passed. **Given** `grep -n '^status: design' docs/specs/*.md`, **then** no listed spec is named by a plan whose `stamp:` commit is an ancestor of the candidate. **Given** the eval artifact, **then** its `RESULTS.md` § 5 shows the golden rate ≥ 0.85 with every floor case passing, the guardrail hold = 1.0, the benign-twin false-refusal rate = 0, the probe accuracy ≥ 0.85, calibration 5 of 5, a case count equal to `find evals/cases-v6 -name '*.md' \| wc -l` at the candidate, and no skipped case; `RUN_OF_RECORD_PATH` names it and `RUN_OF_RECORD_RELEASE` reads `1.12.0`. **Given** `npx vitest run test/docsPages.test.ts test/cli/docs/measurements.test.ts test/ci/changelogLinks.test.ts test/ci/repoHygiene.test.ts`, **then** it exits 0 with `RELEASE_CUT_DATE` equal to the cut date and every hand page on the 1.12.0 cut form. **Given** the snapshot, **then** `node scripts/merge-ready-rate.mjs --json`'s numerator at the tag equals the snapshot's. **Given** `node scripts/qa/route-proof.mjs` at the candidate, **then** it exits 0, or each open non-live leg carries the maintainer's recorded decision, and the record carries its table with the three live legs `Not done:` with their owner. **Given** the release run, **then** `gh run view <id> --json jobs` reads `success` for `gates and pack`, `apm route smoke` and `publish`. **Given** `npm view @zomarit/stamity@1.12.0 dist.attestations.provenance.predicateType`, **then** it prints `https://slsa.dev/provenance/v1`, and `npm view @zomarit/stamity dist-tags.latest` prints `1.12.0`. **Given** `git ls-remote origin refs/heads/plugin-dist refs/tags/plugins/v1.12.0`, **then** both name one sha whose commit has no parent; after the promotion, `refs/heads/plugin-stable` names it too. **Given** the GitHub release `v1.12.0`, **then** it carries `release.json`, `sbom.cdx.json`, the four plugin archives each with its `.sha256`, and the tarball. **Given** the close, **then** each 1.12.0 run's summary is compacted beside an `ARCHIVE.json` whose archive downloads and verifies, `LARGE_FILE_EXCEPTIONS` is empty again, and `node scripts/repo-hygiene.mjs --base <tag>` exits 0. **Given** the private layer's side-by-side checkout, **then** its continuity log carries the 1.12.0 release (`judgment: maintainer`). |
| `edgeCases` | The real release run fails on a check the rehearsal did not catch (1.11.0's first run did, on the shipped-spec case) → nothing is published; ask the maintainer one question (fix on `main` and move the tag, or hold), and on "move" fix, re-run the gate steps with the local tag, fast-forward `main`, delete and re-push the tag. A threshold is missed → fix through the normal loop, re-measure (an incremental run composed with this release's baseline), hold before the tag; thresholds are never lowered. A usage limit holds the run → resume on the SAME account after the reset; never switch or re-log the eval configuration folder while a run is prepared, running or held (learning `an-account-switch-mid-run-ends-an-eval-run`). The cut crosses midnight → the snapshot carries the day it is taken, README follows that file, and the CHANGELOG date is the tag's day. The promotion environment does not exist yet → the maintainer creates it at the console before the promotion; the promotion waits. A channel ruleset blocks the promotion's force-push → fix the bypass (the settings guide), never force by hand. A Windows CI leg flakes on a known timing case → re-run only that leg, once, and record it; a real failure is fixed. |
| `depends_on` | u3-quickstart, u3-route-proofs, docs/plans/015-board-writes.md (b6-dogfood-sync), docs/plans/014-lean-repository-02.md (r7-remove-records-from-main), docs/plans/016-fork-distribution-01.md (u1-fork-ci-job), docs/plans/016-fork-distribution-02.md (u2-main-catalogs and u2-channels-promote) |
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
   f. `RUN_OF_RECORD_PATH` (`src/cli/docs/measurements.ts:103`) and `RUN_OF_RECORD_RELEASE` (`:116`) move; README
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
   `node scripts/records.mjs commit` first, then one `main` commit moves `MEASUREMENT_SNAPSHOT_PATH`,
   `RUN_OF_RECORD_PATH` and the regenerated page together.
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
   builds the record, auto-proving rows from evidence first; an open non-live leg is one question to the maintainer
   (hold, or ship with it named under `Not done:`; default: hold). `Shippable:` is recorded.
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
    `publish` succeeds. Then the commands of `testCriteria`, plus the slim APM ref installing at apm-cli 0.29.1 and
    0.32.0 in a temporary virtual environment (`python3 -m venv <tmp>/apm-<ver> && <tmp>/apm-<ver>/bin/pip install
    apm-cli==<ver>`, then the smoke `docs/plans/016-fork-distribution-02.md (u2-apm-coexistence-fork)` runs against
    `zomarit/stamity/apm#plugins/v1.12.0`). **The first promotion:** dispatch the promotion workflow for tag `v1.12.0`
    to channel `stable`, approved by the maintainer; `plugin-stable` then names the same commit as `plugins/v1.12.0`,
    which the per-channel admin templates point at.
14. **The close.** The public evidence archive: each 1.12.0 run packed with `python3 scripts/evidence-archive.py pack
    --ref <full sha> --path evals/runs/<run> --repository zomarit/stamity --output <tmp>/<run>.tar.gz --manifest
    <tmp>/ARCHIVE.json --url <release asset url>`, uploaded to the prerelease `evidence-archive-<date>`, downloaded,
    verified and restored; summaries compacted with `scripts/evidence-summary.mjs`; the size exceptions retired, red
    first. The close records (record, ledger, QA record; after plan 014 file 2 through `node scripts/records.mjs commit`,
    records first, then `main`). The private layer's re-sync in its side-by-side checkout (the checklist's "Per-release
    record currency", learning `release-close-record-re-sync`): the continuity log, the kickoff prompt, the driver's
    set pin moved to the released bytes, the raw captures archived there. Lane worktrees removed only after their ignored
    files are listed and moved.

## Execution order

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
| `RUN_OF_RECORD_PATH`, `RUN_OF_RECORD_RELEASE`, and after plan 014 `MEASUREMENT_SNAPSHOT_PATH` | u3-release-1-12-0 | `docs/measurements.md`, docsPages run-of-record cases, README, doctrine |
| Spec statuses (`docs/specs/*.md` `status:`) | u3-release-1-12-0 | `test/records/specStatus.test.ts` (in `release.yml`'s gates job) |
| `LARGE_FILE_EXCEPTIONS` (`scripts/repo-hygiene.mjs`) | u3-release-1-12-0 (add, then retire at the close) | CI hygiene, after plan 014 the `records.mjs commit` gate and `records.yml` |
| The distribution README's Codex note (`scripts/build-plugin-distribution.mjs` `clientRoutes`) | u3-rollout-guides | every built distribution `README.md`, `test/ci/pluginDistribution.test.ts` |
| `package.json` `version` | u3-release-1-12-0 | every generator, `release.yml`'s version proof, the plugin manifests, `release.json`, the `main` catalogs |

## Risks

| Risk | Severity | Guard |
|---|---|---|
| The shipped-spec check fires only once the real tag exists, so a `design` spec passes every run before it (1.11.0's first release run failed this way) | Warning | Step 4 flips every shipping `design` spec, and step 10 runs the gate steps with a local tag on the candidate, reading that the case ran, not that it was skipped |
| A vendor fact on the route guide or the rollout section is stated from the planning run's reading and goes stale by the session | Warning | Every vendor cell is re-read on the execution day with its date; an unreachable page says so; step 6's attestors re-read the claims at the cut |
| A docs unit edits a page whose claim files 01–02 already moved, and contradicts the landed behaviour | Warning | The intake re-reads every anchor; step 6's claim-by-claim re-attestation lists plan 016's surface changes for the attestors |
| `u3-route-proofs` reads CI by job name, and a renamed job would turn a leg into a silent `not-run` | Warning | The workflow-matcher case parses `ci.yml` and `nightly.yml` and fails naming the leg whose job is gone |
| The eval run is lost to an account switch or a usage hold | Warning | Step 0's pre-flight and the learning: same account to the end, hold and resume after the reset |
| A full eval export over 1 MB fails hygiene, and after plan 014 the records branch's check runs `main`'s scripts | Warning | Step 2e lands the exact-path exception on `main` first, then the export |
| The reset block deletes a fork's own `plugin-dist` | Warning | The guard keeps a branch whose source commit is not on `upstream/main` and every suffixed tag; the second fixture proves it |
| The bash reset test is skipped on Windows, so the recipe is unproven there | Minor | The skip names its reason; Windows operators run the block in Git Bash; a follow-up row |
| The promotion leaves `plugin-stable` unset after publish, so the per-channel templates point at nothing | Warning | Step 13's first promotion, approved by the maintainer; `testCriteria` checks `plugin-stable` equals the tag's commit |
| The release record is named by the run-id grammar (`<date>_release-1-12-0`) and the measurements page reads a release run's version only from a dotted name, so its merge evidence reads "none" | Minor | Known inbox row (`src/cli/docs/measurements.ts:456`); recorded, not fixed here |
| Lane A serializes eight units | Minor | Lanes B and C run beside it; the eval's 3.5 hours dominate the session |

## Inbox rows this file folds in

| Row (text as it reads in `.stamity/inbox.md`) | Unit |
|---|---|
| "GitHub Copilot CLI 1.0.85 warns that direct plugin installs (repos, URLs, local paths) are deprecated in favour of plugin@marketplace installs" | `u3-rollout-guides` |
| "REQ-APM-004 says the README carries the APM install note, but `README.md` has no `apm install` line" | `u3-route-guide` |
| "no line before the tag flips each spec a shipping plan names to `shipped-with-<version>`" | `u3-release-1-12-0` (step 4 and the checklist line it adds) |
| "the next release cut flips the spec to `shipped-with-<version>` before its tag and runs the full eval set over the two moved board cases" (Package 19) | `u3-release-1-12-0` |
| "a `--registry` fork's pinned `npx -y` call reaches the fork's registry only where the consumer's npm config maps `@<scope>` to it" | `u3-cli-pin-update-paths` documents it; the engine-side check stays a row |

## Open questions

None. The drafter's concerns are settled in the decisions above (S1–S8) and folded into the spec delta.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- Minor · `docs/choose-a-route.md` · the footprint figures are dated measurements no test re-derives; a case that runs `init` per client set in a scratch repository and compares the page's counts would make them derivations.
- Minor · `test/upstream/resetRecipe.test.ts` · skipped on Windows (a bash recipe); a PowerShell twin of the reset block is not built.
- Minor · `scripts/build-plugin-distribution.mjs:424` · the manual-push line commits `plugins: v${version}` without "from <source commit>", so the reset recipe's guard cannot tell such a branch's origin and keeps it; align it with `release.yml:970`'s message.
- Minor · `scripts/qa/route-proof.mjs` · the three live legs stay `Not done:` until a Copilot Business or Enterprise organization or a Cursor Teams account exists, or, for the auto-update leg, until the first release after 1.12.0 on the stable channel.
- Minor · `docs/enterprise-forks.md` · past 1,500 lines with the rollout, reset and settings sections; a split into a fork guide and an organization-rollout guide is a later docs change that moves the bucket's pins.
- Minor · the VS Code route leg · a person walks it at every release; driving VS Code headlessly is not built.
- Minor · `docs/plugins.md` · if the Claude scope probe shows the flag optional, `--scope project` stays in every command for older clients; retire it from the commands once the client floor passes the version that made it optional.
