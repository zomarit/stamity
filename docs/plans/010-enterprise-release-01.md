---
id: enterprise-release-01
intent: feature
stamp: d072a347ec44abd365850f44692be6ce1a4225d7 2026-09-24
reads: [AGENTS.md, package.json, renovate/plugins.json, renovate/companion.json, .github/workflows/release.yml, .github/workflows/upstream-update.yml, .github/release-controls-checklist.md, scripts/distribution-identity.mjs, scripts/generate-plugin-manifests.mjs, scripts/generate-apm-package.mjs, scripts/build-plugin-distribution.mjs, scripts/build-plugin-runtime.mjs, scripts/plugins/catalogs.mjs, scripts/plugins/locate.mjs, scripts/plugins/clients/claude.mjs, scripts/plugins/clients/codex.mjs, scripts/plugin-lifecycle-fixture.mjs, src/plugins/capabilityFile.ts, src/cli/commands/check.ts, src/hooks/model.ts, src/hooks/scripts.ts, src/emit/hooksInfra.ts, src/runs/layout.ts, src/runs/cardSource.ts, src/runs/resumeCard.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/cli/docs/llmsIndex.ts, test/ci/workflow.test.ts, test/ci/workflowExpression.ts, test/ci/upstreamWorkflow.test.ts, test/ci/forkIdentity.test.ts, test/ci/distributionIdentity.test.ts, test/ci/downstreamFixture.ts, test/support/identity.ts, test/ci/pluginLocate.test.ts, test/ci/pluginDistribution.test.ts, test/ci/pluginPackages.claude.test.ts, test/ci/pluginPackages.codex.test.ts, test/cli/commands/check.test.ts, test/emit/hooksInfra.test.ts, test/hooks/sessionStartCard.test.ts, test/runs/resumeCardParity.test.ts, test/replay/oracle.test.ts, test/ci/evidenceArchive.test.ts, test/docsPages.test.ts, test/ci/docsRoster.test.ts, test/cli/docs/llmsIndex.test.ts, docs/enterprise-forks.md, docs/plugins.md, docs/troubleshooting.md, docs/capability-matrix.md, docs/doctrine.md, README.md, website/sidebars.ts, docs/specs/plugin-lifecycle.md, docs/specs/orchestrator-context.md, docs/plans/009-orchestrator-context-economy-01.md, .stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md, .stamity/runs/2026-09-23_orchestrator-context/ledger.jsonl, .stamity/learnings, .stamity/inbox.md]
---

# Enterprise end to end and the 1.10.0 cut — file 1 of 2: the enterprise work

This file is self-contained: every unit below can be built by an implementer holding no session history. File 2
(`docs/plans/010-enterprise-release-02.md`) is the 1.10.0 cut. REPLAY-v2 has its own plan
(`docs/plans/011-replay-v2.md`), and its committed comparison gates the tag.

## Context

A company needs a fork whenever it changes the product or ships it under its own name. Today such a fork has four
gaps. It has no release path beyond a manual build-and-push recipe (`docs/enterprise-forks.md:782-845`). Its identity
step is a copy-paste block (`:121-161`). Codex's remote route has never run (`docs/plugins.md:90-95`). And there is no
admin rollout template. This file builds the lean core the maintainer kept on 2026-09-23:
- a fork release workflow;
- an identity script;
- the Codex route proof;
- a Claude Code managed-settings template;
- a short quickstart page.

It also builds the two plugin-route QA findings (`prove/337`, `prove/338`), the hook budgets two Warnings deferred
(`build/31`, `build/139`, with the Minors `build/32` and `build/40`), and the two Windows test timeouts found on
`main`'s own CI after the session-1 close.

Out of scope: the proposals decided and not built (below) and any change to the canonical `release.yml`.

## Decisions (the maintainer, 2026-09-24, through the question tool, one per turn, recommended option first; all answered by 10:33Z)

| # | Decision |
|---|---|
| D1 | E1 signing: **checksums only**. A fork's release ships SHA-256 files and `release.json` digests, and the company's registry login and its own git are the trust. npm provenance is out, because it needs a public source repository. The repo's pack signing is out, because it would publish the private repository's name to a public transparency log. GitHub's build attestations (GitHub Enterprise Cloud on a private repository) go on the not-built list below. |
| D2 | Hook budgets: **the proposed set**. Session-start hooks time out at 30 s on all four clients. The guard and the review gate carry no timeout, on purpose, pinned by a test. CI enforces byte and line ceilings on the emitted scripts (guard ≤ 24,576 bytes / 600 lines; session start ≤ 49,152 bytes / 1,100 lines). The card refuses a ledger over 4 MiB and reads at most 256 reports, so `build/32` and `build/40` ride along. Guard latency is checked by a local script (≤ 15 ms over node's own start), recorded at the release, not in CI. |
| D3 | (file 2) Plan 009's four eval case gaps stay deferred; the new baseline measures the 102 existing cases. |
| D4 | (file 2) The eval profile moves **in place**, with a dated SET-v7 paragraph, and **the model pair joins the comparator key**. |

## Assumed defaults (taken on the research's recommendation; the maintainer reviews them here)

| Item | Default taken | Why |
|---|---|---|
| E1 destinations | Repository variables and a secret, not a checked-in file | Inert in every copy, the canonical repository included. The values never land in files the upstream lane merges. `stamity.distribution` has defaults, so it cannot signal "unnamed". |
| E1 APM ref | The source tag `v<version>` and `plugins/v<version>` both serve as APM refs; no new tagging code | Both refs already exist in the flow (REQ-APM-008; `scripts/build-plugin-distribution.mjs:9-15`). The guide names both install specs. |
| E1 push logic | Copied from `release.yml:923-1003` into the fork workflow, not extracted into a shared script | Extracting would edit the canonical release path in the release that ships the fork workflow. |
| E1 CHANGELOG | Not required for a fork tag | A fork's suffixed versions have no canonical CHANGELOG section. |
| E1 egress | No allowlist. The trust split is the control, as the upstream lane does (`.github/workflows/upstream-update.yml:62-67`) | The registry host is a variable. |
| E2 name | `--scope` only. The package is always `@<scope>/stamity` | A fork-owned command name is on the not-built list. The plugin id, the marketplace name and the `/stamity:` namespace all derive from the unscoped name (`scripts/generate-plugin-manifests.mjs` `pluginName`; `scripts/plugins/catalogs.mjs:305-325`), so they stay `stamity` in every fork. |
| E2 lockfile | The guide keeps `npm install --package-lock-only` after the script | This keeps the script offline and lean. |
| E2 flags | `--check` only; no `--json` or `--dry-run` | Lean. |
| E1 × E2 | `--registry <url>` makes the fork a CLI-publishing fork: it removes `private` and sets `publishConfig.registry` | npm refuses a `private: true` package (`test/ci/forkIdentity.test.ts:278-279`), which today's identity step sets. |
| E3 | Recorded as a new section of `private-chain.md`. The scope includes the route back and the no-`--ref` probe. Skill discovery is recorded `not-run` | This sits beside the Claude Code and Copilot CLI walks and settles two claims the docs mark unmeasured. A skill-discovery run needs a login in a scratch home. |
| E4 template | Rendered by the distribution builder into `admin/claude-managed-settings.json` from the fork's identity. The default `ref` is the release tag and the minimum client is 2.1.277. No vendored JSON schema | Derived, never hand-typed, and it travels with the tag an admin pins. 2.1.277 is the first client where an invalid allowlist fails closed. The SchemaStore schema allows unknown keys at its top level, so it cannot catch a renamed key. |
| E4 walk | Run by the session through the client's managed-settings directory variable (`CLAUDE_CODE_MANAGED_SETTINGS_PATH`, measured in the 2.1.280 binary) with a scratch configuration directory | No root access is needed. The admin docs name only the documented OS paths. |
| E5 | `docs/enterprise-quickstart.md`, in the sidebar's Guides before `enterprise-forks`; page-level links with the section named in prose | The hand-page link check reads a `#fragment` as part of the path (`test/docsPages.test.ts:694-700`). |
| E6 | `prove/337`: the locator hands `PLUGIN_ROOT` to `check` through the child's environment. `prove/338`: the note text is corrected | `check` has no options (`src/cli/commands/check.ts:1471-1479`), and the environment route works for any runtime in range. |
| CHANGELOG | Written once, by file 2's cut unit | One writer per artifact. |

## Not built — revisit only when a company asks

- A staging branch with promote pull requests for Copilot and Cursor updates.
- A bulk setup pull-request bot.
- `fork doctor`.
- A built-in GitHub App token for the upstream lane.
- A no-fork company add-on.
- GitHub Enterprise Server and GitLab remotes in the generators.
- A nightly check that installs from a private fork.
- A fork-owned command name.
- No-shell hooks for Windows (the `check` row and Git for Windows stay the answer).
- GitHub build attestations for fork releases (D1).
- Cursor's team-marketplace walk, which waits for a team account.

## Research (2026-09-24; eight researchers at Opus 5.5; outside sources accessed 2026-09-24)

**E1**
- Canonical-only guards: `release.yml:83`, `:558`, `:653-656`, and the shell backstop at `:700-709`.
- The upstream lane merges and never pushes a range that touches `.github/workflows/`; it opens a "needs a reviewed push" issue instead (`upstream-update.yml:21-34`, `:799-812`). So a new workflow reaches a fork only through a person's reviewed push.
- `test/ci/workflow.test.ts` holds closed lists the new workflow must amend:
  - `npm publish` only in `release.yml:publish` (`:3752-3757`);
  - no `NODE_AUTH_TOKEN` anywhere (`:3779-3807`);
  - the closed secrets list (`:3810-3839`);
  - write-grant jobs (`:3863-3898`);
  - the id-token holders (`:3759-3777`);
  - SHA pins (`:3841-3861`).
- GitHub Packages: `https://npm.pkg.github.com`, scoped names only, `GITHUB_TOKEN` with `packages: write` (docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).
- npm provenance needs a public repository (docs.npmjs.com/generating-provenance-statements).
- Private-repository attestations need GitHub Enterprise Cloud (docs.github.com/en/actions/concepts/security/artifact-attestations).
- A `GITHUB_TOKEN` push starts no other workflow (docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

**E2**
- The block's steps are `docs/enterprise-forks.md:125-141`.
- The two presets:
  - `renovate/plugins.json:13` `depNameTemplate`, the repository the tag manager watches;
  - `renovate/companion.json:7` `matchPackageNames`, the npm package it pins.
- Today's rewrite is a plain `replaceAll` (`:134-136`). It is not idempotent, and a fork slug with `zomarit/stamity` as a prefix would be rewritten twice.
- `scripts/distribution-identity.mjs` is a module only: `resolveDistributionIdentity(pkg)` at `:278` throws on any problem and requires a github.com repository whose owner equals the publisher (`:305-313`).
- `test/ci/forkIdentity.test.ts` counts canonical spellings per test file (`:186-242`). A new test derives canonical values through `test/support/identity.ts`.

**E3**
- The walks of 2026-09-22 are recorded in `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`, rows 11a-11f, in the format `| # | Step | Command | Exit · output sha-256 · facts |`, with full digests at `:299-360`.
- The mirror is `<owner>/stamity-plugins-mirror` (private); its `plugin-dist` branch carries tags `plugins/v1.9.0` and `plugins/v1.9.1`.
- The Codex root README and `docs/plugins.md:232` leave out `--ref`. The default branch carries no Codex catalog (`scripts/build-plugin-distribution.mjs:19`), so a remote add without `--ref` probably finds nothing (unverified; the walk settles it).
- A failed marketplace entry is skipped silently, so the cache is the proof (`scripts/plugin-route-smoke.mjs:1264-1307`).

**E4**
- Managed settings live at:
  - macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`;
  - Linux/WSL: `/etc/claude-code/managed-settings.json`;
  - Windows: `C:\Program Files\ClaudeCode\managed-settings.json`;
  - plus a `managed-settings.d/` drop-in folder.
- Managed sources rank remote, then MDM/HKLM, then the file, then HKCU. The rule is "first-wins": a file is silently ignored under console or MDM policy (code.claude.com/docs/en/managed-settings).
- `strictKnownMarketplaces` matches exactly (a differing `ref` does not match), and an invalid value is enforced as an empty allowlist from 2.1.277. A file that is not valid JSON stops Claude Code from starting.
- `requiredMinimumVersion` refuses to start an older client; an invalid value is dropped (code.claude.com/docs/en/plugin-marketplaces, /managed-settings, /setup).
- Cursor: team marketplaces are on Teams and Enterprise; each plugin is Default Off, Default On or Required (cursor.com/docs/plugins).
- Codex: workspace admins import a GitHub marketplace, and each plugin is Installed, Available or Not available per role (learn.chatgpt.com/docs/enterprise/plugin-management).

**Hook budgets**
- `HookInterchange.timeoutMs` exists (`src/hooks/model.ts:202-208`), but no core row sets it (`src/emit/hooksInfra.ts:438-446`; `test/emit/hooksInfra.test.ts:563`).
- The adapters already render it:
  - Claude: `timeout` in seconds (`src/adapters/claude.ts:949`);
  - Cursor: `timeout` (`src/adapters/cursor.ts:839`);
  - Copilot: `timeoutSec` (`src/adapters/copilot.ts:743`);
  - Codex: `timeout` (`src/adapters/codex.ts:684-686`).
- Every client fails open on a timeout. Claude Code's default is 600 s, and a timed-out PreToolUse hook does not block the call (code.claude.com/docs/en/hooks). Copilot's default is 30 s (docs.github.com/en/copilot/reference/hooks-reference).
- The review gate's win32 worst case is about 34.6 s (`src/hooks/scripts.ts:2007-2026`).
- The card reads the ledger whole (`src/runs/cardSource.ts:216-222`; twin `src/runs/resumeCard.ts:252-268`), and the ledger is rewritten whole with rows changing state in place, so a tail read would drop open rows.
- Emitted Claude scripts in this checkout:

  | Script | Bytes | Lines |
  |---|---|---|
  | Guard | 19,125 | 475 |
  | Session start | 39,677 | 887 |
  | Review gate | 40,740 | 891 |
  | Tamper notice | 2,383 | 67 |

- Guard latency baseline: medians of 5 warm runs — node start 30.9 ms, a non-Write call 33.3 ms, an allowed Write 36.0 ms.

## Shared contracts (census before parallel edits)

| # | Contract | Writers, in order | Readers |
|---|---|---|---|
| C1 | `package.json` identity fields: `name` (`@<scope>/stamity`), `repository`, `homepage`, `bugs`, `stamity.publisher`, and either `private: true` with no `publishConfig` or no `private` with `publishConfig.registry` | `e2-fork-identity-script` (the only writer) | `e1-fork-release-workflow`'s identity proofs, the generators, `docs-guides` |
| C2 | `docs/plugins.md` | `e6-locator-check-root` (lines 518-521 only), then `docs-guides` | — |
| C3 | `docs/enterprise-forks.md` | `docs-guides` only | `docs-quickstart` links to it |
| C4 | `test/docsPages.test.ts` | `docs-guides`, then `docs-quickstart`; file 2's units after both | — |
| C5 | `test/ci/forkIdentity.test.ts` | `e1-fork-release-workflow` (only if a literal count moves), then `docs-guides` (the opt-in group calls the script) | — |
| C6 | `test/ci/workflow.test.ts` | `e1-fork-release-workflow` only | — |
| C7 | `scripts/build-plugin-distribution.mjs`; `test/ci/pluginDistribution.test.ts` | `e4-managed-settings-render` only; then `e3-codex-install-ref` for the one Codex pin | the walk |
| C8 | `scripts/plugins/clients/claude.mjs` | `e6-claude-install-note` only | — |
| C9 | The emitted hooks: `test/corpus/__snapshots__/emissionGoldens.test.ts.snap`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, `.stamity/generated/hooks/**`, the dogfood `.claude/settings.json` and the other clients' hook files | `hook-row-timeout`, then `card-read-caps` (the same lane, in order) | `hook-script-ceilings` |
| C10 | `.github/release-controls-checklist.md` | `hook-latency-local` (one line), then file 2's cut | — |
| C11 | `test/replay/oracle.test.ts` | `win-timeouts` only; REPLAY-v2 writes a new oracle suite file (plan 011) | — |
| C12 | `CHANGELOG.md`, `README.md`, `docs/doctrine.md` | `docs-quickstart` (README map row and counts, doctrine counts), then file 2 | — |
| C13 | `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` | `e3-codex-remote-walk` only | `docs-guides` cites it |

## Spec delta

`/st-work` merges these at its Prove phase: the plugin requirements into `docs/specs/plugin-lifecycle.md`, the context
requirements into `docs/specs/orchestrator-context.md`. The ADDED requirements are new; each MODIFIED one names its
change and keeps its existing statement otherwise.

### REQ-PLUGIN-027 — A fork releases through its own workflow

ADDED. `.github/workflows/fork-release.yml` releases a fork's CLI, plugin distribution and APM refs from one tag. It
is inert until the fork names its destinations in repository variables, and the canonical `release.yml` stays
canonical-only. A fork's release is proved by checksums and the registry's own authentication. It carries no
provenance and no attestation: npm provenance needs a public source repository, and GitHub attestations need GitHub
Enterprise Cloud and are not built (decided 2026-09-24).

- GIVEN the canonical repository, or a fork whose `STAMITY_FORK_RELEASE` is unset or names another repository, WHEN a
  `v*` tag is pushed THEN the probe job ends green with `armed=false`, and no gates or publish job runs.
- GIVEN an armed fork whose `STAMITY_RELEASE_REGISTRY` is not an https URL, or carries userinfo, a query or a
  fragment, WHEN the workflow runs THEN the probe fails naming the variable and never prints its value.
- GIVEN an armed fork with all of the following, WHEN the tag is pushed THEN gates run the canonical ladder holding
  no secret, and publish verifies every digest before npm, publishes the tarball to the registry, pushes the
  distribution branch and the `plugins/v<version>` tag, and creates a release carrying the tarball, `release.json`
  and every `.sha256` file:
  - a tag `v<package.json version>` reachable from the release branch;
  - a package name other than the canonical one;
  - no `private: true`;
  - `publishConfig.registry` equal to the registry variable.
- GIVEN any one of those proofs failing WHEN gates run THEN they fail before any publish step, with a remedy naming
  `scripts/fork-identity.mjs`.
- GIVEN a publish re-run for a version already published with the same integrity WHEN it runs THEN npm is skipped and
  no ref moves; a tag that points elsewhere is refused, never moved.

### REQ-PLUGIN-028 — One command sets a fork's identity

ADDED. `node scripts/fork-identity.mjs --repository <url> [--scope <scope>] [--registry <url>] [--check]` replaces the
guide's copy-paste identity block. It does the following:
- sets the package name `@<scope>/stamity`. The unscoped name stays `stamity`, so the plugin id, the marketplace name
  and the command namespace do not change.
- sets the repository, homepage, bugs URL and publisher.
- sets `private: true` without `publishConfig`, or, with `--registry`, sets `publishConfig.registry` and no `private`.
- moves the two Renovate presets.
- regenerates the plugin and APM manifests.
- validates through `scripts/distribution-identity.mjs`.

It imports no history and switches no workflow.

- GIVEN a downstream checkout WHEN the command runs with a github.com repository URL THEN every field and both
  presets hold the fork's values, and both generators' `--check` exit 0.
- GIVEN the command run a second time with the same arguments THEN it exits 0, reports every file unchanged, and
  moves no byte.
- GIVEN `--check` on a tree that differs from the targets THEN it exits 1, names each drifting file, and writes
  nothing.
- GIVEN an invalid identity (a repository URL off github.com, an uppercase scope, an unclean registry URL) THEN it
  exits 1, writes nothing and echoes no URL. GIVEN a file it would change that has uncommitted edits THEN it exits 1
  naming the file. GIVEN bad arguments THEN it exits 2.

### REQ-PLUGIN-029 — A Claude Code managed-settings template for an organization's rollout

ADDED. The distribution builder renders `admin/claude-managed-settings.json` from the fork's identity:
- the company marketplace in `extraKnownMarketplaces`;
- the plugin on for everyone in `enabledPlugins`;
- only that marketplace admitted by `strictKnownMarketplaces`;
- `requiredMinimumVersion` at least 2.1.277, the first client where an invalid allowlist fails closed.

The fork guide documents where the file goes on each OS and how managed sources are ordered. `docs/plugins.md`
carries a short paragraph each on Cursor's "Required" team-marketplace mode and Codex's workspace route.

- GIVEN any identity WHEN the template renders THEN it holds exactly the four keys in a fixed order, the marketplace
  key and plugin id equal the rendered Claude catalog's, and the allowlist entry equals the declared marketplace
  source field for field. An unequal pair blocks every marketplace for every user.
- GIVEN a minimum version below 2.1.277, or one that is not a semantic version, THEN the renderer throws naming the
  field.
- GIVEN a distribution build that includes Claude THEN the file is written, parses, is byte-identical across builds
  and passes the credential scan; a build without Claude writes none.
- GIVEN the template installed through the client's managed-settings directory THEN the walk record shows the
  marketplace declared, the plugin installed, another marketplace refused, and a client below the minimum refusing
  to start.

### REQ-PLUGIN-030 — An enterprise quickstart page

ADDED. `docs/enterprise-quickstart.md` is a hand page that orders the enterprise route by day (day 0 the fork, day 1
release and rollout, day 2 updates) and by role (admin, platform team, developers). It links into
`docs/enterprise-forks.md` and `docs/plugins.md` rather than repeating them.

- GIVEN the docs suite WHEN it runs THEN the page passes every hand-page case, and appears in the sidebar's Guides
  before the fork guide, in `llms.txt` and in the README map.
- GIVEN the page THEN every step is one sentence with a page-level link, and no command block from the two guides is
  repeated.

### REQ-CTX-016 — Declared hook budgets

ADDED. Every hook the engine wires declares its budget.
- **Session-start rows** (the resume card and the tamper notice) declare `timeoutMs: 30000` on all four clients, in
  repository mode and in plugin roots.
- **The pre-tool-use guard and the review gate** declare no timeout, on purpose. A timed-out Claude PreToolUse hook
  lets the call through, and the review gate's win32 worst case is about 34.6 s.
- **The emitted scripts** stay under declared byte and line ceilings:
  - guard: ≤ 24,576 bytes and 600 lines;
  - session start: ≤ 49,152 bytes and 1,100 lines;
  - the review gate and the tamper notice: their measured size plus 25%.
- **Guard latency** over node's own start stays ≤ 15 ms, as the median of 7 warm runs. It is measured locally at
  each release, not in CI.

- GIVEN an emitted configuration on any client THEN its session-start entries carry a 30-second timeout, and its
  guard and review-gate entries carry none.
- GIVEN any core hook script over its ceiling THEN the budget test fails naming the script, its size and the budget.
- GIVEN `node scripts/hook-latency.mjs` at a release THEN it prints the median table, and exits 0 when both overheads
  are ≤ 15 ms, 1 when either is over, and 2 when it cannot run.

### REQ-CTX-013 — The resume card, and `stamity ledger status`

MODIFIED (`build/32`, `build/40`). The card's reads are bounded by count as well as by size:
- The ledger is read only up to 4 MiB. Over that, the card says the ledger is too large to read and prints no open
  count, never a partial one.
- At most 256 reports are read. The rest are counted as not checked, never listed as clean.
- Record heads are read newest first, and the walk stops at the first run in progress.

- GIVEN a ledger over 4,194,304 bytes WHEN the card prints THEN its ledger line reads `ledger: too large to read (over
  4 MiB)  ·  the ledger is the recovery point`.
- GIVEN 257 unledgered reports that carry findings THEN the reports line counts 256 and appends `, not checked: 1`.
- GIVEN the hook and `stamity ledger status` on the same fixture THEN they print the same card.

### REQ-PLUGIN-007 — Locator resolution order and refusals

MODIFIED (`prove/337`). The locator hands its root to `check` through the child's environment.

- GIVEN `locate.mjs -- check`, no plugin-root variable set, and `stamity-plugin.json` beside the runtime, WHEN the
  locator spawns THEN the child's environment carries `PLUGIN_ROOT=<root>` and its argv is unchanged.
- An already-set root variable passes through untouched.
- `plugin` subcommands still receive `--plugin-root`.

### REQ-PLUGIN-016 — sync, check and clean honor the ownership boundary

MODIFIED (`prove/337`). The `plugin-runtime` row's warning names a step a person can take: `run check through the
installed root's locator (node <root>/runtime/locate.mjs -- check) or set PLUGIN_ROOT to that root`.

- GIVEN a recorded client and a `check` run through the locator THEN the row reads `pass`.

### REQ-PLUGIN-023 — Controlled private chain proof

MODIFIED (E3). The Codex half of the private route is walked against the private mirror and recorded in the same
record with the same row format. The record's "Not done" line narrows to Cursor's team marketplace.

- GIVEN the walk THEN add, install, the cache's per-file sha-256 map against the tag's `codex/` tree, setup and the
  route back are recorded with exit codes and digests, and the leak gate passes over the record.

## Units

### win-timeouts — explicit timeouts on the two slow Windows cases (first, before the first push)

| Field | Content |
|---|---|
| `id` | win-timeouts |
| `requirements` | REQ-CTX-015 |
| `files` | `test/replay/oracle.test.ts`, `test/ci/evidenceArchive.test.ts` |
| `interfaces` | `test/replay/oracle.test.ts:127-142`: the `it("compile every static pattern, and the static oracles read fail on the seeded tree, pass on the base and after the fixes", () => {…})` call gains the third argument `60_000` and the trailing comment `// 21.1 s on main's Windows leg (run 35981189856, attempt 1) against the 20 s default; 9.2-14.5 s on the nine rounds before`. `test/ci/evidenceArchive.test.ts:150`: the `it.each(["git", "working-tree"])("captures and restores %s evidence when Windows stat APIs report different ctime and modes", (capture) => {…})` call gains the third argument `60_000` and the comment `// 23.7 s on the same Windows leg; pre-existing`. The idiom is `test/ci/workflow.test.ts:4089` (`}, 60_000); // a real npm audit through cmd.exe on the Windows leg can exceed the 20 s default`). `vitest.config.ts:59-60` stays at 20,000. The run's first two ledger rows are these two cases (source `ci`, severity Warning), closed by this unit |
| `testCriteria` | GIVEN the two files WHEN `npx vitest run test/replay/oracle.test.ts test/ci/evidenceArchive.test.ts` runs THEN it exits 0, and each named case's call ends with `, 60_000)`. GIVEN the package branch's first CI round THEN the Windows leg passes both cases, or the record names the re-run |
| `edgeCases` | A case that really hangs still fails at 60 s: the limit is finite. `it.each`'s third argument applies to both rows, `git` and `working-tree`. No other case's timeout moves |
| `depends_on` | none |
| `verify` | `npx vitest run test/replay/oracle.test.ts test/ci/evidenceArchive.test.ts && npm run lint` |

### e6-locator-check-root — the locator hands its root to `check` (prove/337)

| Field | Content |
|---|---|
| `id` | e6-locator-check-root |
| `requirements` | REQ-PLUGIN-007, REQ-PLUGIN-016 |
| `files` | `scripts/plugins/locate.mjs`, `src/cli/commands/check.ts`, `test/ci/pluginLocate.test.ts`, `test/cli/commands/check.test.ts`, `docs/plugins.md` (the `plugin-runtime` remedy lines 518-521 only), `docs/troubleshooting.md` (the `plugin-runtime` row, line 102) |
| `interfaces` | **Spawn.** In `scripts/plugins/locate.mjs`, beside the argv builder at `:362-370`, which adds `--plugin-root` only when `stamityArgs[0] === 'plugin'`, the locator spawns the runtime with `env: { ...process.env, PLUGIN_ROOT: <root> }` when all three hold: `stamityArgs[0] === 'check'`; no variable in `ROOT_VARIABLES` holds a non-blank value (trimmed; blank and absent read alike); and `<root>/stamity-plugin.json` is a regular file. **The variable list.** `ROOT_VARIABLES = ['CLAUDE_PLUGIN_ROOT', 'CURSOR_PLUGIN_ROOT', 'PLUGIN_ROOT', 'COPILOT_PLUGIN_ROOT']` is a copied literal with a comment naming `src/plugins/capabilityFile.ts:441-446` as its source, because `locate.mjs` imports builtins only. **Unchanged.** The argv, since `check` takes no options (`check.ts:1471-1479`). When a root variable is already set, the environment passes through untouched, and the shadowing rule at `:349-355` stays. **Header.** The comment at `:342-361` says the root reaches `plugin` subcommands as a flag and `check` through the environment. **Remedy.** `src/cli/commands/check.ts:926-927` becomes `run check through the installed root's locator (node <root>/runtime/locate.mjs -- check) or set PLUGIN_ROOT to that root`. **Docs.** `docs/plugins.md:518-521` and `docs/troubleshooting.md:102` carry the same remedy |
| `testCriteria` | (a) `test/ci/pluginLocate.test.ts`, extending the case at `:425-446`: GIVEN a root with `stamity-plugin.json` and no root variable WHEN `locate.mjs -- check` runs THEN the fake CLI receives argv `["check"]` and `PLUGIN_ROOT=<root>` (the fake CLI echoes `process.env.PLUGIN_ROOT`). (b) GIVEN `CLAUDE_PLUGIN_ROOT=/elsewhere` THEN the child sees `/elsewhere` there and no added `PLUGIN_ROOT`. (c) GIVEN a root without `stamity-plugin.json` THEN no variable is added. (d) GIVEN `plugin status` THEN argv carries `--plugin-root <root>` as today. (e) `PLUGIN_ROOT="  "` counts as unset. (f) `test/cli/commands/check.test.ts:1893-1908` asserts the new remedy text, with an inline reason for the moved pin. (g) GIVEN a manifest recording a client WHEN `check` runs through the locator THEN it prints `pass` on `plugin-runtime`. (h) A test pins the locator's copied list equal to `PLUGIN_ROOT_VARIABLES` |
| `edgeCases` | A whitespace-only variable is blank. `sync` and every other subcommand get neither the flag nor the variable. A root whose `stamity-plugin.json` is a directory or a symbolic link gets no variable |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/pluginLocate.test.ts test/cli/commands/check.test.ts && npm run lint && npm run typecheck` |

### e6-claude-install-note — the Claude install note says what the client writes (prove/338)

| Field | Content |
|---|---|
| `id` | e6-claude-install-note |
| `requirements` | REQ-PLUGIN-002 |
| `files` | `scripts/plugins/clients/claude.mjs` (the `DISTRIBUTION.note` text at `:162-177`), `test/ci/pluginPackages.claude.test.ts` (`:575-589`) |
| `interfaces` | The clause at `claude.mjs:165-166` is replaced. The note now says that `claude plugin install … --scope project` "writes `enabledPlugins` alone into the project's `.claude/settings.json`; `marketplace add` declares the marketplace in the configuration directory's user settings (measured on Claude Code 2.1.278, 2026-09-22, and 2.1.280, 2026-09-23)". The note still reaches `stamity-plugin.json` through `scripts/plugins/capability.mjs:156`, fed by `scripts/generate-plugin-packages.mjs:579`, and the Claude root README through `claude.mjs:241`, unchanged in mechanism. `docs/plugins.md:122-125` is already right and does not move |
| `testCriteria` | The case at `:575-589` adds three assertions on the note: `toContain("\`enabledPlugins\` alone")`, `toContain("user settings")` and `not.toContain("extraKnownMarketplaces")`. A generated Claude root's README contains "user settings" |
| `edgeCases` | The Cursor, Copilot and Codex notes are byte-unchanged, asserted by comparing each generated `stamity-plugin.json` `distribution.note` before and after |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/pluginPackages.claude.test.ts test/ci/pluginPackages.test.ts && npm run lint` |

### e2-fork-identity-script — one command sets a fork's identity (E2)

| Field | Content |
|---|---|
| `id` | e2-fork-identity-script |
| `requirements` | REQ-PLUGIN-028, REQ-PLUGIN-011, REQ-PLUGIN-009 |
| `files` | `scripts/fork-identity.mjs` (new), `test/ci/forkIdentityScript.test.ts` (new) |
| `interfaces` | **CLI.** `node scripts/fork-identity.mjs --repository <url> [--scope <npm-scope>] [--registry <https-url>] [--check] [--help]`. The header carries `// Usage:` and `// Exit codes: 0 applied or already current, 1 invalid identity, dirty target, generator failure or drift under --check, 2 bad arguments`, as `scripts/generate-apm-package.mjs:1-16` does. Arguments are parsed by hand from `process.argv.slice(2)`, as in `generate-apm-package.mjs:339-359`. `--help`/`-h` prints the usage and exits 0. A missing `--repository` or an unknown flag prints the usage and exits 2. **`--repository`** accepts `https://github.com/<owner>/<repo>`, a `git+` prefix and a `.git` suffix. **`package.json` targets:** `name: "@<scope>/stamity"`, where the scope defaults to the owner lowercased and must match `^[a-z0-9-~][a-z0-9-._~]*$`; `repository: { "type": "git", "url": "git+https://github.com/<owner>/<repo>.git" }`; `homepage` in the canonical `package.json`'s form with the fork's `<owner>/<repo>`; `bugs: { "url": "https://github.com/<owner>/<repo>/issues" }`; `stamity.publisher: "<owner>"`, with the other `stamity` keys kept; and either `private: true` (a boolean) with `publishConfig` deleted, or, with `--registry`, `private` deleted and `publishConfig: { "registry": "<url>" }`. The registry must be https with no userinfo, query or fragment. That is the clean-URL rule of `scripts/distribution-identity.mjs:123-140`, re-stated locally with a comment naming it. **Serialisation.** `JSON.stringify(pkg, null, 2) + "\n"`; a test proves an unrenamed checkout round-trips byte-identical. **Presets.** `renovate/plugins.json` `depNameTemplate` becomes `"<owner>/<repo>"`, and `renovate/companion.json` `matchPackageNames[0]` becomes `"@<scope>/stamity"`. Each current value is found with `JSON.parse`, then exactly that quoted JSON string is replaced once in the text, which keeps the hand formatting, and the result is parsed again. **Validation before any write.** `resolveDistributionIdentity(candidate)` from `./distribution-identity.mjs` must not throw; the scope rule; the registry rule. A failure exits 1 naming the field and never echoes a URL. **Dirty check.** For each file whose target bytes differ from its current bytes, a non-empty `git status --porcelain -- <file>` exits 1 naming the file, and nothing is written. A file already at its target is never written. **Writes.** `<file>.tmp-<pid>` then `renameSync`, LF only. **Generators.** After the writes, `spawnSync(process.execPath, [<repo>/scripts/generate-plugin-manifests.mjs])` and then `generate-apm-package.mjs`, both with `--check` in check mode. A non-zero exit exits 1 with `rerun node scripts/fork-identity.mjs once the generator's error is fixed`. **Output.** One line per file, either `updated <path> (<changed keys>)` or `unchanged <path>`; then the generators' output; then `identity: @<scope>/stamity published by <owner>`. **`--check`.** No write. Exits 1 when any file differs from its target (printing `drift <path> (<keys>)`) or a generator's `--check` fails. **Not done by the script** (the maintainer's scope): no history import, no workflow switching, no lockfile edit (the guide keeps `npm install --package-lock-only`). The script lives in `scripts/`, outside the `src/` boundary map (the learning `engine-layer-modules-cannot-drive-init` concerns `src/` only), and imports nothing from `src/` |
| `testCriteria` | The workspace is built by `downstreamCheckout` (`test/ci/downstreamFixture.ts:93`, which copies `src`, `scripts` and `assets`), and the test copies `renovate/` itself. (a) `--repository https://github.com/Acme-Corp/stamity-internal` gives `name: "@acme-corp/stamity"`, the repository, homepage and bugs values, `stamity.publisher: "Acme-Corp"`, `private: true`, no `publishConfig`, `depNameTemplate: "Acme-Corp/stamity-internal"` and `matchPackageNames: ["@acme-corp/stamity"]`; then `generate-plugin-manifests.mjs --check` and `generate-apm-package.mjs --check` both exit 0. (b) A second identical run exits 0, prints `unchanged` for every file, and every file's sha-256 is unchanged. (c) `--check` on the unrenamed tree exits 1, and every file's sha-256 is unchanged. (d) Adding `--registry https://npm.pkg.github.com` gives no `private`, `publishConfig.registry: "https://npm.pkg.github.com"`, and a regenerated `.claude-plugin/marketplace.json` whose entry source is `{ "source": "npm", "package": "@acme-corp/stamity", … }`. (e) Canonical values in the test come from `test/support/identity.ts`, so `test/ci/forkIdentity.test.ts:186-242` stays green unedited |
| `edgeCases` | `--repository https://gitlab.com/a/b` exits 1, writes nothing, and the URL is absent from stderr. `--scope Acme` exits 1. No arguments exit 2 with the usage. Owner `zomarit` with repository `stamity-private` rewrites the presets once, and a rerun is a no-op. A dirty `package.json` that would change exits 1 naming it; a dirty file already at its target proceeds. A failing generator exits 1 naming the rerun, and a rerun after the fix completes. `--registry http://x` or `https://u:p@x` exits 1 without echoing the value |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/forkIdentityScript.test.ts test/ci/forkIdentity.test.ts test/ci/distributionIdentity.test.ts && npm run lint && npm run typecheck && npm run knip` |

### e1-fork-release-workflow — a fork's own release workflow, inert until named (E1)

| Field | Content |
|---|---|
| `id` | e1-fork-release-workflow |
| `requirements` | REQ-PLUGIN-027 |
| `files` | `.github/workflows/fork-release.yml` (new), `test/ci/forkReleaseWorkflow.test.ts` (new), `test/ci/workflow.test.ts` (closed-list amendments, each with an inline reason), `test/ci/forkIdentity.test.ts` (only if a canonical-literal count moves) |
| `interfaces` | **Header comment.** It states the trust split: probe and gates hold no secret; publish checks out nothing and runs npm and git only over the artifact whose digests it verified. It also states that the workflow is inert until armed; that the canonical `release.yml` stays canonical-only; that there are no attestations (the maintainer's decision of 2026-09-24; revisit when a company asks); that no CHANGELOG section is required; and that there is no egress allowlist, because the registry host is a variable and the trust split is the control (`upstream-update.yml:62-67`). **Triggers.** `push: tags: ['v*']`, and `workflow_dispatch` with the input `dry_run` (boolean, default `true`), in the `release.yml:53-62` shape. Workflow `permissions: contents: read`. `concurrency: { group: fork-release-${{ github.ref }}, cancel-in-progress: false }`. **Job `probe`** (`permissions: contents: read`, output `armed`). One bash step, with env `ARM: ${{ vars.STAMITY_FORK_RELEASE }}`, `REGISTRY: ${{ vars.STAMITY_RELEASE_REGISTRY }}`, `BRANCH: ${{ vars.STAMITY_RELEASE_BRANCH }}` and `REPO: ${{ github.repository }}`, works through these cases in order: (1) `REPO` equals the canonical `zomarit/stamity`: a notice that the canonical repository releases through `release.yml`, then `armed=false` and exit 0; (2) `ARM` is empty or differs from `REPO`: a notice naming both variables to set, then `armed=false` and exit 0; (3) `REGISTRY` is not `https://…`, or holds userinfo, a query or a fragment: `::error::` naming the variable, never its value, and exit 1; (4) `BRANCH` is set and fails git's ref-name rule: an error and exit 1; (5) otherwise `armed=true`. The pattern is `upstream-update.yml:119-186`. **Job `gates`** (`needs: probe`, `if: needs.probe.outputs.armed == 'true'`, `permissions: contents: read`, no `secrets.` reference). It checks out with `fetch-depth: 0` and runs setup-node at the SHA and node version `release.yml` pins. A proofs step (bash) requires all of the following, and each failure prints the remedy `run node scripts/fork-identity.mjs --repository <url> --registry <url>`: the tag ref equals `v` plus `package.json`'s version; `git merge-base --is-ancestor "$GITHUB_SHA" "origin/${BRANCH:-main}"`; `name` is not `@zomarit/stamity`; `private` is not `true`; `publishConfig.registry` equals `REGISTRY`, with trailing slashes normalised; and when the registry host is `npm.pkg.github.com`, the name's scope equals the owner lowercased. Then the ladder is copied from `release.yml:278-302`: `npm ci --ignore-scripts`, the lockfile diff, `npm run build`, `npm test`, `npm run gate`, `node dist/cli.js check` and `node scripts/tarball-smoke.mjs`. Then `node scripts/generate-apm-package.mjs --check`, `node scripts/generate-plugin-manifests.mjs --check`, and pack with the SHA-256 as a job output (`release.yml:307-319`). Then `node scripts/build-plugin-runtime.mjs --tarball <tgz> --out dist/plugin-runtime` and `node scripts/build-plugin-distribution.mjs --out dist/plugins --runtime dist/plugin-runtime --source-commit "$GITHUB_SHA" --source-commit-date <ISO>` (`release.yml:337-378`); the branch, tag and archive names are read back from `release.json`. Finally, upload-artifact with `include-hidden-files: true` and 7-day retention. **Job `publish`** (`needs: [probe, gates]`, `if:` armed and either a tag push or a dispatch with `inputs.dry_run == false`; `environment: fork-release`; `permissions: contents: write, packages: write`; no `id-token`). In order: (1) the backstop "Refuse an unarmed destination" re-checks `ARM == REPO` and that `REPO` is not canonical; (2) download the artifact; (3) verify the tarball and every archive digest against gates' outputs before anything irreversible (`release.yml:801-886`); (4) setup-node with `registry-url: ${{ vars.STAMITY_RELEASE_REGISTRY }}`; (5) the npm step, with env `NODE_AUTH_TOKEN: ${{ startsWith(vars.STAMITY_RELEASE_REGISTRY, 'https://npm.pkg.github.com') && secrets.GITHUB_TOKEN \|\| secrets.STAMITY_REGISTRY_TOKEN }}`; (6) the orphan push of the distribution branch and tag, copied from `release.yml:923-1003`: dates come from the manifest so a rerun makes the identical sha, a tag is never moved, and a branch head with a parent is refused; (7) `gh release create "v<version>" --verify-tag --target "$GITHUB_SHA"` with the tarball, `release.json` and every `*.sha256` file, skipped when the release exists with the same assets. **The npm step's bash:** an empty token exits 1 before npm with `set the STAMITY_REGISTRY_TOKEN secret, or publish to GitHub Packages`. It then reads `existing="$(npm view "<name>@<version>" dist.integrity --registry "$REGISTRY" 2>/dev/null \|\| true)"`: if that equals the packed tarball's integrity, it prints `already published` and skips; if it is non-empty and different, it exits 1 (another tarball holds this version); otherwise it runs `npm publish "./$TARBALL" --registry "$REGISTRY"`, with no `--provenance` and no `--access`. **Job `dry-run-summary`** (armed, and the complement of publish's condition) prints what would be published (`release.yml:1089-1137`). **Pins.** Every `uses:` is pinned to the same 40-hex SHA `release.yml` pins, with `# vX.Y.Z`. **`test/ci/workflow.test.ts` amendments**, each with an inline reason naming this unit: `npm publish` is admitted in `fork-release.yml:publish` (`:3752-3757`); `NODE_AUTH_TOKEN` is admitted in `fork-release.yml`'s publish job only (`:3779-3807`); the secrets list (`:3810-3839`) gains `STAMITY_REGISTRY_TOKEN`; the write-grant jobs (`:3863-3898`) gain `fork-release.yml:publish`; the id-token holders (`:3759-3777`) are unchanged |
| `testCriteria` | Conditions are evaluated through `test/ci/workflowExpression.ts`, whose context is a generic record; one case first proves that `vars.*` resolves. Bash steps are executed on POSIX legs, and on win32 they are skipped with the reason stated, as the suite's other bash cases are. (a) The probe script: unset variables give exit 0 with `armed=false` and a notice. `ARM` naming another repository gives `armed=false`. `REGISTRY` set to `http://x`, `https://u:p@x` or `https://x?y` gives exit 1 with the value absent from the output. `REPO=zomarit/stamity` with `ARM` set gives `armed=false`. Valid values give `armed=true`. (b) Over the `TRIGGER_SHAPES` rows (`test/ci/workflow.test.ts:2046-2089`) × armed ∈ {true, false}: publish runs only for an armed tag push and an armed dispatch with `dry_run` false, and gates only when armed. (c) `gates` declares only `contents: read` and references no `secrets.`. (d) The proofs script in a scratch repository: the canonical name, `private: true`, a `publishConfig.registry` mismatch, an unscoped name with GitHub Packages, and a tag commit unreachable from `origin/main` each give exit 1; a consistent tree gives exit 0. (e) The push step runs against a scratch bare repository with the harness at `:3274-3490`: the first run creates the branch and tag; a rerun moves no ref; a tag already pointing elsewhere is refused with exit 1. (f) The npm step runs with `npm` stubbed on `PATH` (a stub that records its argv; inline reason: the registry is network): an equal integrity makes no publish call; an empty `npm view` makes one `publish` call with `--registry`; a different integrity gives exit 1; an empty token with a non-GitHub registry gives exit 1 before any npm call. (g) Every workflow-wide gate in `workflow.test.ts` passes with the amendments: pins, permissions, referenced scripts, and no internal ids |
| `edgeCases` | An organisation-level `STAMITY_FORK_RELEASE` naming another repository leaves the workflow unarmed. A dispatch without `dry_run` publishes nothing (the default is true). The tag `v1.10.0-acme.1` with `package.json` at `1.10.0-acme.1` passes the proofs. An unset `STAMITY_RELEASE_BRANCH` means `main`. Artifactory without the token fails before npm with the remedy |
| `depends_on` | none; C1 fixes the `package.json` contract |
| `verify` | `npx vitest run test/ci/forkReleaseWorkflow.test.ts test/ci/workflow.test.ts test/ci/forkIdentity.test.ts test/ci/upstreamWorkflow.test.ts && npm run lint && npm run typecheck` |

### e4-managed-settings-render — the admin template rendered from the identity (E4)

| Field | Content |
|---|---|
| `id` | e4-managed-settings-render |
| `requirements` | REQ-PLUGIN-029 |
| `files` | `scripts/plugins/managed-settings.mjs` (new), `test/ci/managedSettings.test.ts` (new), `scripts/build-plugin-distribution.mjs` (writes the file and adds one README line), `test/ci/pluginDistribution.test.ts` (one new case) |
| `interfaces` | **Constants.** `export const MIN_CLAUDE_VERSION = '2.1.277'`, with a comment: the first client where an invalid `strictKnownMarketplaces` fails closed (https://code.claude.com/docs/en/managed-settings, accessed 2026-09-24). `export const MANAGED_SETTINGS_KEYS = ['extraKnownMarketplaces', 'enabledPlugins', 'strictKnownMarketplaces', 'requiredMinimumVersion']`, each with the documentation URL and access date in a comment. **Renderer.** `export function renderClaudeManagedSettings(identity, { ref, minimumVersion = MIN_CLAUDE_VERSION })`, where `identity` is `buildCatalogIdentity(pkg, resolved)` (`scripts/plugins/catalogs.mjs:305-325`). With `S = { "source": "github", "repo": identity.slug, "ref": ref }`, it returns `{ "extraKnownMarketplaces": { [identity.name]: { "source": S } }, "enabledPlugins": { [identity.name + "@" + identity.name]: true }, "strictKnownMarketplaces": [ S ], "requiredMinimumVersion": minimumVersion }`, in that key order. The repository is always on github.com, because the identity refuses any other host (`scripts/distribution-identity.mjs:305-311`). **Validation.** `ref` must pass the git ref-name rule `REF_NAME` of `distribution-identity.mjs` (no `..`, no trailing `/`); `minimumVersion` must match `^\d+\.\d+\.\d+$` and compare ≥ `MIN_CLAUDE_VERSION` numerically. Each failure throws naming the field. **Builder.** `scripts/build-plugin-distribution.mjs` writes `admin/claude-managed-settings.json` = `JSON.stringify(renderClaudeManagedSettings(identity, { ref: <the release tag rendered from distribution.tagPattern> }), null, 2) + "\n"` when `claude` is among the built clients. It also adds one README line under the Claude install section: `An organization can roll this plugin out through Claude Code's managed settings: admin/claude-managed-settings.json (see the fork guide, "Roll the plugin out to your organization").` |
| `testCriteria` | (a) The keys equal `MANAGED_SETTINGS_KEYS` in order. (b) The marketplace key and the plugin id equal `renderClaudeMarketplace(identity, v, sha).name` and `.plugins[0].name`. (c) `strictKnownMarketplaces[0]` deep-equals `extraKnownMarketplaces[name].source`. (d) `strictKnownMarketplaces` is never empty. (e) `minimumVersion` `2.1.276`, `2.1` or `latest` throws. (f) A fixture identity for `@acme-corp/stamity` at `Acme-Corp/stamity-internal` gives key `stamity`, plugin `stamity@stamity` and repo `Acme-Corp/stamity-internal`. (g) `test/ci/pluginDistribution.test.ts`: the build writes `admin/claude-managed-settings.json`, which parses; two builds are byte-identical; the credential scan (`:522`) covers the file; and a build whose clients exclude claude writes no such file |
| `edgeCases` | A `ref` containing `..` throws. A missing `ref` throws: the builder always passes the tag, and an admin who wants the branch edits both places, which the guide says. If the distribution tree has a pinned file inventory, it gains exactly this file |
| `depends_on` | none |
| `verify` | `npx vitest run test/ci/managedSettings.test.ts test/ci/pluginDistribution.test.ts && npm run lint` |

### e4-managed-settings-walk — the template walked live on the client (E4)

| Field | Content |
|---|---|
| `id` | e4-managed-settings-walk |
| `requirements` | REQ-PLUGIN-029 |
| `files` | `.stamity/runs/2026-09-24_enterprise-release/managed-settings-walk.md` (new, in this run's record folder) |
| `interfaces` | **Setup** (session-run, no maintainer step). Claude Code as installed, recording `claude --version`. A scratch `CLAUDE_CONFIG_DIR` under the session scratchpad. `CLAUDE_CODE_MANAGED_SETTINGS_PATH=<scratch>/policy`, a directory the client's policy walk reads. It was measured in the 2.1.280 binary and is undocumented, so the admin docs name only the documented OS paths. The directory holds `managed-settings.json`, rendered by `renderClaudeManagedSettings` for the canonical identity at `plugins/v1.9.1`, the public distribution, so no credential is needed. **Steps.** Each row records the UTC time, the exit code and the sha-256 of the raw captured output, in the `private-chain.md` row format. W1: `claude plugin marketplace list` names the managed marketplace. W2: `claude plugin install stamity@stamity` succeeds; the fact measured is whether the allowlist also gates the plugin entry's own source. W3: `claude plugin marketplace add anthropics/claude-code`, a source not on the allowlist, is refused. W4: a second policy directory with `requiredMinimumVersion: "99.0.0"` makes the client refuse to start, with a non-zero exit and a message naming the version. W5: a policy whose allowlist `ref` differs from the declared source's `ref` refuses the install; this is the lock-out the render test guards. **Cleanup.** The scratch directories are deleted at the end. A result that contradicts the template or the planned docs opens a ledger row, which `docs-guides` answers before it writes |
| `testCriteria` | Every step row carries its time, exit code and a 12-hex digest, and the full digests are listed. `node scripts/leak-gate.mjs; echo exit=$?` prints `exit=0` with the record present. W2's and W5's facts are stated in the record's summary lines |
| `edgeCases` | The client auto-updated (2.1.281 on 2026-09-24): the record names the version measured. A subcommand that needs a login is recorded `not-run` with its message, never as a pass. If W2 is refused because the allowlist also gates the plugin entry's own source, the renderer's allowlist gains that source field for field from the rendered Claude catalog's plugin entry. That edit goes to `scripts/plugins/managed-settings.mjs` and its test, in this lane after `e4-managed-settings-render` has landed, and W2 re-runs; `REQ-PLUGIN-029`'s criteria hold only after W2 passes |
| `depends_on` | e4-managed-settings-render |
| `verify` | `node scripts/leak-gate.mjs; echo exit=$?` |

### e3-codex-remote-walk — Codex's remote route proved against the private mirror (E3)

| Field | Content |
|---|---|
| `id` | e3-codex-remote-walk |
| `requirements` | REQ-PLUGIN-023, REQ-PLUGIN-020 |
| `files` | `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`: a new section `## The Codex half (E3), <date>`, and the "Not done: the Cursor and Codex halves" line at `:280-283` narrowed to Cursor |
| `interfaces` | **Prerequisites.** `gh auth status` is logged in, and `gh auth setup-git`, so git over `https://github.com/…` authenticates through the credential helper. `gh repo view <owner>/stamity-plugins-mirror` succeeds; if the mirror is gone, `scripts/plugin-lifecycle-fixture.mjs --push` rebuilds it and the rebuild is recorded. The codex-cli version is recorded (0.155.1 on 2026-09-24). A scratch `CODEX_HOME` sits under the session scratchpad, while the real `HOME` is kept, because git reads its credential helper from `$HOME/.gitconfig`. A fresh consumer clone is made. **Row format.** Each step records the UTC time, the exit code and the sha-256 of the raw capture; only placeholder-rewritten fragments are quoted. **Steps.** C1 `codex --version`. C2 `codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugins/v1.9.0`; if it is refused for authentication, C2b tries the `https://github.com/<owner>/stamity-plugins-mirror.git` form. C3 `codex plugin add stamity@stamity`. C4 `codex plugin list --json` names `stamity` at 1.9.0. C5: exactly one directory `$CODEX_HOME/plugins/cache/stamity/stamity/1.9.0/` exists, and its per-file sha-256 map equals the one of `git archive plugins/v1.9.0 codex`, with `runtime/` reported separately. C6 `node <cache>/runtime/locate.mjs --project <consumer> -- plugin setup --client codex -y` exits 0, and `.codex/config.toml` holds `features.hooks = true`; then `… -- check`, which on 1.9.x roots reads `warn plugin-runtime` (`prove/337` reproduced, not a blocker). C7, the route back: `codex plugin remove stamity@stamity`, `codex plugin marketplace remove stamity`, `marketplace add … --ref plugins/v1.9.1`, then `plugin add`, giving a 1.9.1 cache with `skills/fixture-marker/`; then `marketplace add … --ref plugins/v1.9.0` over the recorded marketplace, recording the answer and where the ref ends up. C8: in a second scratch `CODEX_HOME`, `codex plugin marketplace add <owner>/stamity-plugins-mirror` with no `--ref`, which settles whether the documented install line works. C9: skill discovery is `not-run`; it needs a login in a scratch home (the learning `codex-hooks-need-the-features-flag-and-exec-runs-none`). C10: `node scripts/leak-gate.mjs` over the checkout with the record present, plus a hand sweep for absolute paths, tokens, e-mail and the owner's name. **Rules.** No token in any argv. `auth.json` is never persisted. The scratch homes are deleted at the end. The new section carries a table in the rows-11a-11f format, the facts that differ from the docs, and its digests appended to "Captured output digests" |
| `testCriteria` | Every step has its time, exit code and digest. C5's comparison script prints `equal` over the whole `codex/` tree, and its output digest is recorded. `node scripts/leak-gate.mjs; echo exit=$?` prints `exit=0` with the record present. C8's outcome is one recorded fact, "works" or "no catalog" |
| `edgeCases` | A shorthand authentication failure leads to the URL form, and both are recorded. "Already added" on the re-point is recorded as a fact. A missing mirror is rebuilt and recorded; if it cannot be rebuilt, the walk ends `BLOCKED_DEPENDENCY` and the maintainer is asked |
| `depends_on` | none |
| `verify` | `node scripts/leak-gate.mjs; echo exit=$?` |

### e3-codex-install-ref — the Codex root README's install line, settled by the walk

| Field | Content |
|---|---|
| `id` | e3-codex-install-ref |
| `requirements` | REQ-PLUGIN-020 |
| `files` | `scripts/plugins/clients/codex.mjs` (the install lines at `:155-160` and `:204-217`), `test/ci/pluginPackages.codex.test.ts`, `test/ci/pluginDistribution.test.ts` (only the Codex `--ref` pin at `:535-557`) |
| `interfaces` | If the walk's C8 finds no catalog without `--ref`, the Codex root README's install line becomes `codex plugin marketplace add <owner>/<repo> --ref <distribution branch>`, with `--ref <tag>` named for a pin. That matches the distribution README's form (`scripts/build-plugin-distribution.mjs:295-309`) for the same identity. If C8 shows the no-ref form works, no product file changes: the unit closes with the walk's row as evidence, and its ledger row is `rejected` with that reason |
| `testCriteria` | GIVEN one identity THEN the Codex root README's install command equals the distribution README's; a new case in `test/ci/pluginPackages.codex.test.ts` extracts both lines and compares them |
| `edgeCases` | If the walk shows that `--ref <branch>` fails but a tag works, the line uses the tag form and the docs say why. **Folded in at Frame (inbox rows 76 and 100).** The walk's C2 executes the remote `--ref` form the distribution README asserts (`scripts/build-plugin-distribution.mjs:274`), which settles row 76. The literal-against-literal Codex `--ref` pin at `test/ci/pluginDistribution.test.ts:535-557` (row 100) becomes the derived comparison above: that pin moves into `test/ci/pluginPackages.codex.test.ts` or is replaced there, with an inline reason |
| `depends_on` | e3-codex-remote-walk, e4-managed-settings-render; that unit writes `test/ci/pluginDistribution.test.ts` first |
| `verify` | `npx vitest run test/ci/pluginPackages.codex.test.ts test/ci/pluginPackages.test.ts test/ci/pluginDistribution.test.ts && npm run lint` |

### hook-row-timeout — session-start rows declare a 30-second budget; the guard and review gate declare none

| Field | Content |
|---|---|
| `id` | hook-row-timeout |
| `requirements` | REQ-CTX-016 |
| `files` | Hand-written: `src/hooks/model.ts` (the constant), `src/emit/hooksInfra.ts` (the core-row loop at `:438-446`), `test/emit/hooksInfra.test.ts` (`:563`, narrowed with its reason), `docs/capability-matrix.md` (one sentence at `:173`). Regenerated, not hand-written: `test/corpus/__snapshots__/emissionGoldens.test.ts.snap` and `test/emit/__snapshots__/crossClientGoldens.test.ts.snap`, via `npx vitest run test/corpus/emissionGoldens.test.ts test/emit/crossClientGoldens.test.ts --update`, with the file names first and `--update` last (the learning `vitest-update-flag-takes-an-optional-value`); and the dogfood hook files and `.stamity/manifest.json`, via `npm run build && node dist/cli.js sync` |
| `interfaces` | **Constant.** `export const HOOK_SESSION_START_TIMEOUT_MS = 30_000;` in `src/hooks/model.ts`, beside `HookInterchange`. Its comment cites Copilot's documented default of 30 s, Claude Code's and Codex's 600 s, and why the guard and the review gate carry none: a timed-out Claude PreToolUse hook does not block the call (code.claude.com/docs/en/hooks, accessed 2026-09-24), and the review gate's win32 worst case is about 34.6 s (`src/hooks/scripts.ts:2007-2026`). **Core rows.** In `hooksInfra.ts`, the row pushed at `:438-446` becomes `{ event: script.event, command: [...], ...(script.event === "session_start" ? { timeoutMs: HOOK_SESSION_START_TIMEOUT_MS } : {}) }`. **Adapters.** Unchanged; they already render the field. Claude renders `timeout: max(1, ceil(ms / 1000))`, so 30 (`claude.ts:949`); Cursor renders `timeout: 30` (`cursor.ts:839`); Copilot renders `timeoutSec: 30` (`copilot.ts:743`); Codex renders `timeout = 30` (`codex.ts:684-686`). **Plugin roots.** A plugin root's `hooks/hooks.json` is the hooks half of a repository-mode emission (`scripts/plugins/clients/claude.mjs:85-90`), so it carries the same timeout |
| `testCriteria` | (a) The core `session_start` rows, for the card and the tamper notice, carry `timeoutMs: 30000`. (b) The Claude `.claude/settings.json` SessionStart entries carry `"timeout": 30`, Cursor's `sessionStart` carries `timeout: 30`, Copilot's carries `timeoutSec: 30`, and Codex's carries `timeout = 30`. (c) The `pre_tool_use` guard rows and the review-gate rows carry no timeout; the narrowed test at `:563` states why. (d) A built Claude plugin root's `hooks/hooks.json` carries `"timeout": 30` on SessionStart, asserted in `test/ci/pluginPackages.claude.test.ts` or the plugin golden. (e) A second `node dist/cli.js sync` moves no file |
| `edgeCases` | A user hook row's own `timeoutMs` passes unchanged. Codex's SessionEnd stays at 3 s (`codex.ts:645`). Copilot's portable runner still warns and yields on its own timeout (`src/hooks/portableRunner.ts:158-167`) |
| `depends_on` | none |
| `verify` | `npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm run test -- --coverage` |

### card-read-caps — the card's ledger and report reads bounded by count (build/32, build/40)

| Field | Content |
|---|---|
| `id` | card-read-caps |
| `requirements` | REQ-CTX-013 |
| `files` | Hand-written: `src/runs/layout.ts`, `src/runs/cardSource.ts`, `src/runs/resumeCard.ts`, `test/hooks/sessionStartCard.test.ts`, `test/runs/resumeCardParity.test.ts`, and `docs/plans/009-orchestrator-context-economy-01.md` (one dated amendment line on its S2 cell, naming this plan). Regenerated: the same goldens and dogfood files as `hook-row-timeout`, since the session-start body changes |
| `interfaces` | **Constants.** `export const LEDGER_READ_MAX_BYTES = 4_194_304;` and `export const REPORT_READS_MAX = 256;` in `src/runs/layout.ts`, embedded in the hook body through `JSON.stringify`, like the other card constants (`cardSource.ts:95-101`). **S1, record heads.** Run names are walked newest first by code-unit order, and the walk stops at the first run in progress. That picks the same run as today's "greatest in-progress name", reading fewer heads. **S2, ledger.** When `lstat` reports a size over `LEDGER_READ_MAX_BYTES`, the ledger is not read. The card's ledger line becomes `ledger: too large to read (over 4 MiB)  ·  the ledger is the recovery point`, with no open count. The set of ledgered reports is then unknown, so every report counts as unledgered, subject to S3. **S3, reports.** At most `REPORT_READS_MAX` report files are read, in code-unit order as today. The rest are not read, and the reports line appends `, not checked: <n>` after its list. **Parity.** Both twins, `cardSource.ts` and `resumeCard.ts:252-268`, implement the same logic, and the parity test covers the new cases. A tail read is ruled out: the ledger is rewritten whole and rows change state in place (`src/runs/ledgerStore.ts:461`, `:600`), so open rows can sit anywhere |
| `testCriteria` | (a) A ledger of 4,194,305 bytes: the card's ledger line reads exactly `ledger: too large to read (over 4 MiB)  ·  the ledger is the recovery point`. (b) A ledger of exactly 4,194,304 bytes is read as today. (c) 257 report files, each with a finding line and none ledgered: the line reads `reports without a ledger row: 256 (…), not checked: 1`. (d) `stamity ledger status` and the hook print the same card for (a), (b) and (c). (e) A newer closed run beside an older in-progress run: the card names the in-progress run. (f) Every card stays ≤ 2,000 characters |
| `edgeCases` | An over-cap ledger with 25 reports: all 25 are listed as unledgered, and the list shrinks to fit. The git-metadata cap (4,096 bytes) is unchanged. A report of exactly 1 MiB is still read. The twin's unbounded `readLedger` (`src/runs/resumeCard.ts:227-236`, inbox row 229, folded in at Frame) is capped by the same constant, so `stamity ledger status` cannot stall on a hostile-size ledger |
| `depends_on` | hook-row-timeout; it regenerates the same files, so it runs in the same lane, after it |
| `verify` | `npm run build && node dist/cli.js sync && npm run lint && npm run typecheck && npm run test -- --coverage` |

### hook-script-ceilings — byte and line ceilings on the emitted hook scripts

| Field | Content |
|---|---|
| `id` | hook-script-ceilings |
| `requirements` | REQ-CTX-016 |
| `files` | `src/hooks/scripts.ts` (the budget table), `test/hooks/scriptBudget.test.ts` (new) |
| `interfaces` | **Budget table.** `export const HOOK_SCRIPT_BUDGETS: Readonly<Record<string, { readonly bytes: number; readonly lines: number }>>`, keyed by script file name. `stamity-pre-tool-use-guard.mjs`: `{ bytes: 24_576, lines: 600 }`. `stamity-session-start.mjs`: `{ bytes: 49_152, lines: 1_100 }`. `stamity-review-gate.mjs` and `stamity-config-tamper-notice.mjs`: the size measured after `card-read-caps`, times 1.25, with bytes rounded up to a multiple of 1,024 and lines rounded up to a multiple of 10. Measured on 2026-09-24: the review gate 40,740 bytes / 891 lines, giving 51,200 / 1,120; the tamper notice 2,383 / 67, giving 3,072 / 90. The measured values sit in a comment beside each entry. **Test.** For each of the four tools, it renders `planCoreHookScripts(policiesPath, tool)` in both the generated layout and a plugin-root layout, takes the larger of the two, and asserts `Buffer.byteLength(content) <= bytes` and the count of `\n` `<= lines`. The failure message is `<tool>/<file>: <n> bytes of <budget> (<l> of <m> lines). Reduce the script, or move the budget in src/hooks/scripts.ts with the reason it moved`, modelled on `scripts/size-budget.mjs:99-102` |
| `testCriteria` | (a) Every tool × core script is within both ceilings. (b) An oversized render (a test-only wrapper that appends 30 KiB) fails with the message naming the file and both numbers |
| `edgeCases` | CRLF and LF count alike, because only `\n` is counted. A tool without a given script, such as no review gate for a client, is skipped, not failed |
| `depends_on` | hook-row-timeout, card-read-caps |
| `verify` | `npx vitest run test/hooks/scriptBudget.test.ts && npm run lint && npm run typecheck && npm run knip` |

### hook-latency-local — the guard's latency checked locally at each release

| Field | Content |
|---|---|
| `id` | hook-latency-local |
| `requirements` | REQ-CTX-016 |
| `files` | `scripts/hook-latency.mjs` (new), `test/ci/hookLatency.test.ts` (new), `.github/release-controls-checklist.md` (one line in the release steps) |
| `interfaces` | **CLI.** `node scripts/hook-latency.mjs [--runs <n>] [--guard <path>]`. The default guard is `.stamity/generated/hooks/claude/stamity-pre-tool-use-guard.mjs`, and the default is 7 runs after 1 warm-up. **Measurement.** Wall time is measured with `process.hrtime.bigint()` around `spawnSync(process.execPath, [guard], { input })`, with no shell. There are two payloads: a non-Write call, `{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"ls"}}`, and an allowed Write. For the Write, the payload shape comes from the batch-sync-3 measurement report under `.stamity/runs/2026-09-23_orchestrator-context/reports/` when present; otherwise it is a `Write` to a path the guard allows for a verdict role. Node's own start is measured with `spawnSync(process.execPath, ["-e", ""])`. **Output.** A table of case, median ms and overhead ms (the case's median minus node start's median). **Exit codes.** 0 when every overhead is ≤ 15 ms; 1 when one is over, printing `guard overhead <x> ms over the 15 ms budget`; 2 when the guard is missing or a spawn fails. **Checklist.** `.github/release-controls-checklist.md` gains one line in the release steps: `node scripts/hook-latency.mjs` exits 0, and its table goes into the release record |
| `testCriteria` | (a) A fake guard that exits 0 at once gives exit 0 and a three-row table. (b) A fake guard that busy-waits 40 ms gives exit 1, and the message names the overhead. (c) A missing guard path gives exit 2. (d) The checklist line exists and names the command |
| `edgeCases` | A guard that exits non-zero on a payload gives exit 2, naming the case. On Windows the spawn has no shell and quotes `process.execPath` correctly |
| `depends_on` | hook-script-ceilings |
| `verify` | `npx vitest run test/ci/hookLatency.test.ts && node scripts/hook-latency.mjs; echo exit=$?` |

### docs-guides — the fork guide and the plugins guide carry E1, E2, E3, E4 and E6

| Field | Content |
|---|---|
| `id` | docs-guides |
| `requirements` | REQ-PLUGIN-027, REQ-PLUGIN-028, REQ-PLUGIN-029, REQ-PLUGIN-023 |
| `files` | `docs/enterprise-forks.md`, `docs/plugins.md`, `test/ci/forkIdentity.test.ts` (the opt-in `STAMITY_FORK_SUITE` group calls the script instead of its own copies at `:64-99`), `test/docsPages.test.ts` (new pins) |
| `interfaces` | **`docs/enterprise-forks.md` (1): "Set the private package's identity" (`:121-161`).** The fenced block becomes `node scripts/fork-identity.mjs --repository "$STAMITY_PRIVATE_URL"`, then `npm install --package-lock-only` and `npm ci --ignore-scripts`. The prose adds `--registry <url>` for a fork that publishes its CLI, and `--scope <scope>` when the npm scope differs from the owner. It keeps every pinned string at `:149-155` and `:176-184`: `test/support/identity.ts`, "Your rename needs no test edit at all.", both preset names, and `scripts/tarball-smoke.mjs`. **(2): a new section "Release your fork".** It replaces the manual push recipe at `:825-845` and keeps the tree explanation at `:782-824`. It covers: the repository variables `STAMITY_FORK_RELEASE` (equal to `<owner>/<repo>`), `STAMITY_RELEASE_REGISTRY` and the optional `STAMITY_RELEASE_BRANCH`; the secret `STAMITY_REGISTRY_TOKEN`, which GitHub Packages does not need; the `fork-release` environment with required reviewers; the tag form, `v<version>` equal to `package.json`, such as `v1.10.0-acme.1`; what a run does; that a rerun is safe; that a release is proved by checksums, not provenance or attestation, and why; that the 1.10.0 upstream update brings this workflow through the reviewed-push path, since the lane never pushes a workflow change; and a developer's npm configuration for a scoped private registry, `@<scope>:registry=<url>`. **(3): a new section "Roll the plugin out to your organization"**, after the release section. It covers: the upstream identity's rendering of `admin/claude-managed-settings.json` as a JSON block; the three OS paths and the `managed-settings.d/` folder; first-wins across managed sources, and `/status` → Setting sources to see which one won; the fail-closed warnings (invalid JSON stops Claude Code; an allowlist that is empty, or whose `ref` differs from the declared source's, blocks every marketplace); that private repositories need git credentials on each machine; and the walk's measured facts, citing `.stamity/runs/2026-09-24_enterprise-release/managed-settings-walk.md`. **`docs/plugins.md`.** The Cursor block (`:200-210`) gains the team-marketplace paragraph: Teams and Enterprise, the modes Default Off, Default On and Required, from cursor.com/docs/plugins, accessed 2026-09-24. The Codex sentence (`:252-253`) becomes the workspace-route paragraph: import a GitHub marketplace, and Installed, Available or Not available per role, from learn.chatgpt.com/docs/enterprise/plugin-management, accessed 2026-09-24. The Codex remote-form lines (`:90-95`, `:229-241`, `:394-420`) cite the E3 walk's section. The install line follows `e3-codex-install-ref`. **Links.** No cross-page `#fragment` link, because the link check reads a fragment as part of the path. **`test/docsPages.test.ts`.** New pins: the guide names `scripts/fork-identity.mjs` and the file exists (modelled on `:1954-1963`); every variable and secret the release section names appears in `.github/workflows/fork-release.yml`, and every `vars.`/`secrets.` name the workflow reads appears in the guide; the managed-settings JSON block in the guide deep-equals `renderClaudeManagedSettings(<canonical identity>, { ref })`, where `ref` is read from the block itself, so a version bump does not break the pin. **Re-attestation.** `REATTESTATION_DATE` (`:503`) moves when the rewritten pages carry the commit-form currency header (`:804-817`) |
| `testCriteria` | (a) The identity block contains `node scripts/fork-identity.mjs` and no `node -e`. (b) The pins at `test/docsPages.test.ts:1915-1941` stay green. (c) `STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts` passes with the script doing the rename. (d) The variable and secret names match both ways between the guide and the workflow. (e) The guide's JSON block equals the renderer's output. (f) The Cursor and Codex paragraphs each carry a URL and an access date. (g) Every hand-page case passes: the link check, the currency header and the re-open line |
| `edgeCases` | If the walk contradicted the template, its ledger row is answered here, and the docs say what was measured. A `#fragment` link to another page fails the link check, so page-level links only |
| `depends_on` | e1-fork-release-workflow, e2-fork-identity-script, e4-managed-settings-render, e4-managed-settings-walk, e6-locator-check-root, e3-codex-remote-walk, e3-codex-install-ref |
| `verify` | `npx vitest run test/docsPages.test.ts test/ci/forkIdentity.test.ts && STAMITY_FORK_SUITE=1 npx vitest run test/ci/forkIdentity.test.ts && node scripts/leak-gate.mjs; echo exit=$?` |

### docs-quickstart — the enterprise quickstart page and its surface pins (E5)

| Field | Content |
|---|---|
| `id` | docs-quickstart |
| `requirements` | REQ-PLUGIN-030 |
| `files` | `docs/enterprise-quickstart.md` (new); `test/docsPages.test.ts` (the path constant `:117-127`, `GUIDES` `:141-158`, the count comments `:23` and `:130-134`, the case name "all fourteen" `:664`, `README_MAX_LINES` `:306` to 159 with a TEST CHANGE note); `website/sidebars.ts` (Guides at `:76-83`, the page before `enterprise-forks`); `src/cli/docs/llmsIndex.ts` (a Guides entry in `:149-236`, the prose count at `:15`); `llms.txt` (regenerated by `node scripts/generate-docs.mjs --page llms`); `README.md` (a map row at `:122-131`, "the eleven guides" at `:114` becomes twelve); `docs/doctrine.md` (the counts at `:117-118`) |
| `interfaces` | **Page head.** Frontmatter `title: Enterprise quickstart`, equal to the H1. A currency header and a `Re-open when:` line naming `test/docsPages.test.ts`, within the first 6 lines after the frontmatter (`test/docsPages.test.ts:726-740`). **Intro.** "This page is for…". **`## Who does what`.** A table: admin (the prerequisites, Actions and branch controls, the managed-settings rollout), platform team (the fork, its releases, the catalog repository), developers (install and pin). **`## Day 0: make the fork`.** Import the history; Set the private package's identity, one command; Configure `.stamity/upstream.json`; Turn the workflows on last. Each is named in prose with a page-level link to `enterprise-forks.md`. **`## Day 1: release and roll out`.** Release your fork, Ship your fork through APM, and Roll the plugin out to your organization link to `enterprise-forks.md`; Install and Set the repository up link to `plugins.md`. **`## Day 2: take updates`.** Take the next release, Resolve a conflict, Land the update branch, and Back out link to `enterprise-forks.md`; Pin, update, roll back, Keep the runtime in step, and Private catalogs and Renovate link to `plugins.md`. **`## Where to go next`.** **Content rules.** Every step is one sentence and one link. No command block from the two guides is repeated. The page is over 500 characters (the suite's floor) and at most 120 lines. It follows the suite-enforced hand-page contract and the pages' shared conventions: the "This page is for…" opening, imperative headings, and the closing "Where to go next" |
| `testCriteria` | (a) The hand-page suite passes over fifteen pages, as do the roster, the sidebar, the byte-compared `llms.txt` (`test/cli/docs/llmsIndex.test.ts:39`) and the doctrine counts (`test/docsPages.test.ts:1753-1754`). (b) The page links `enterprise-forks.md` and `plugins.md` and holds no fenced block longer than one line. (c) `README.md` is ≤ 159 lines with one quickstart row. (d) Removing the sidebar entry turns the suite red; this is checked once by hand in the lane and recorded in the unit report |
| `edgeCases` | A `#fragment` link fails the link check, so none is used. The title must equal the H1 |
| `depends_on` | docs-guides |
| `verify` | `node scripts/generate-docs.mjs --page llms && npx vitest run test/docsPages.test.ts test/cli/docs/llmsIndex.test.ts test/ci/docsRoster.test.ts && npm run lint` |

## Execution order and lanes

The package branch is `package-16-enterprise-release`, cut from `main` `d072a347`. `win-timeouts` lands first, and the
draft pull request opens on that commit, so every later round runs CI early. Each lane is a worktree under
`~/Projects/zomarit/.stamity-worktrees/stamity/`. It starts with `git reset --hard <package-branch>` and a
`node_modules` symlink, stages by explicit path, never uses `git stash`, runs `npm run knip` before every push and
`date -u` before every record stamp.

| Wave | Units, parallel within a wave | Why this wave |
|---|---|---|
| 0 | `win-timeouts` | Before the first pull request round |
| A | `e6-locator-check-root`, `e6-claude-install-note`, `e2-fork-identity-script`, `e1-fork-release-workflow`, `e4-managed-settings-render`, `hook-row-timeout`, `e3-codex-remote-walk` (session-run) | File-disjoint, and C1 fixes the one shared contract |
| B | `card-read-caps` (after `hook-row-timeout`, same lane), `e4-managed-settings-walk` (session-run), `e3-codex-install-ref` | Each needs one unit of wave A |
| C | `hook-script-ceilings`, then `hook-latency-local`; `docs-guides` | The sizes after B; the docs after every code unit |
| D | `docs-quickstart` | `test/docsPages.test.ts` after `docs-guides` |

Plan 011's REPLAY-v2 instrument lanes (`scripts/replay/`, `evals/replay/`, `test/replay/` new files, and the private
driver) are file-disjoint from every unit here and run beside waves A-C. No full test suite and no docs-site build
runs on this machine while a replay run is live (the concurrent-load learning).

## Risks

| Risk | Severity | Guard |
|---|---|---|
| A registry token reaches code the build runs | Warning | The token appears only in `publish`, which checks out nothing and runs only npm and git over the digest-verified artifact; `gates` holds no secret; test (c) of `e1-fork-release-workflow` |
| Imported canonical `v*` tags, or a tag on an unmerged branch, publish a fork release | Warning | The version, ancestry and non-canonical-name proofs in `gates`: a canonical tag's commit carries `@zomarit/stamity` and fails the name proof |
| The managed-settings template locks every user out of every marketplace | Warning | The field-for-field equality and non-empty tests; the walk's W5; the guide's fail-closed warning |
| A client renames a managed-settings key later | Minor | A pinned key list carrying the docs URLs and access dates; the release checklist's docs re-read |
| A timeout accidentally added to the guard opens Claude's guard | Warning | The pinned-absence test in `hook-row-timeout` |
| A 30-second session-start timeout discards the whole start output on a hung disk | Minor | The read caps keep the worst case far under 30 s; `docs/capability-matrix.md` says so |
| The card's two twins drift | Warning | The parity test covers every new case |
| The E3 captures leak an owner name or token | Warning | Digest-only rows, placeholders, the leak gate by exit code, and a hand sweep |
| The docs pins drift silently (the surface-pins learning) | Warning | `docs-quickstart` moves every literal it names; the docs roster derives the rest |
| A fork on 1.10.0 must push the new workflow by hand | Minor | Expected: the upstream lane never pushes workflow changes. File 2's CHANGELOG says so |

## Open questions

None. Every decision point was answered (D1-D4) or taken as a recorded default above.

## Follow-ups (appended to `.stamity/inbox.md` at this plan's write)

- GitHub build attestations for fork releases: revisit when a company asks (D1).
- The hard-coded `stamity@stamity` install strings (`scripts/build-plugin-distribution.mjs:237`, `:251`;
  `scripts/plugins/clients/claude.mjs:207`, `:227`, `:237-238`): they matter only with a fork-owned command name,
  which is not built.
- Whether `allowManagedHooksOnly` blocks a force-enabled plugin's hooks: unmeasured; the walk has no login for a
  session run.
- Cursor's team-marketplace walk: waits for a team account or a company that uses Cursor.
