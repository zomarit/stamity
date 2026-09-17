---
id: plugin-lifecycle-01
intent: feature
stamp: ec6668d7e81fb9425f2c0838c949f560373e1166 2026-09-17
reads: [AGENTS.md, package.json, tsdown.config.mjs, knip.json, .stamity/runs/2026-09-17_codex-astra-audit/findings.md, .github/workflows/upstream-update.yml, .github/workflows/pr-checks.yml, .github/workflows/pack-signing-rehearsal.yml, scripts/upstream.mjs, scripts/sign-pack.mjs, scripts/pack-signing-rehearsal.mjs, src/pack/sign.ts, scripts/eval/run.mjs, content/skills/st-verify/scripts/spec-plan-coverage.mjs, docs/packs-and-trust.md, docs/enterprise-forks.md, CHANGELOG.md, CONTRIBUTING.md, evals/README.md, scripts/generate-plugin-manifests.mjs, scripts/generate-apm-package.mjs, scripts/distribution-identity.mjs, scripts/tarball-smoke.mjs, scripts/apm-install-smoke.mjs, scripts/size-budget.mjs, scripts/leak-gate.mjs, scripts/native-typescript.mjs, src/content/catalog.ts, src/content/contentRoot.ts, src/content/ruleDelivery.ts, src/content/selection.ts, src/emit/planner.ts, src/emit/hooksInfra.ts, src/emit/skillsProjection.ts, src/emit/substitution.ts, src/hooks/scripts.ts, src/hooks/portableRunner.ts, src/hooks/model.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/adapters/registry.ts, src/shared/paths.ts, src/shared/launcherAllowlist.ts, src/types/content.ts, src/types/manifest.ts, src/types/markers.ts, .github/workflows/release.yml, .github/workflows/ci.yml, .github/release-egress.md, .github/client-contracts.md, test/ci/pluginManifests.test.ts, test/ci/apmPackage.test.ts, test/ci/workflow.test.ts, test/ci/downstreamFixture.ts, test/ci/engines.test.ts, docs/capability-matrix.md, docs/specs/apm-canonical-distribution.md, docs/specs/fork-layer.md, docs/specs/enterprise-upstream-lane.md, .stamity/learnings, .stamity/inbox.md]
---

# Plugin-backed distribution lifecycle — file 1 of 3: packages, runtime, distribution

intent chosen: feature because net-new capabilities are named ("generate complete native plugin
packages", "add a plugin-backed project setup mode", "expose a versioned release and update
contract") and the request says "add" and "support"; the roadmap reading (eight areas needing
sequencing) was put to the maintainer, who answered that the whole request is one item to
implement and ship next as 1.9.0 — so one feature plan, split into three sequenced files at the
producer / consumer / proof seams, each self-complete. File 2 is
`docs/plans/008-plugin-lifecycle-02.md` (plugin-backed setup mode, migration, docs) and file 3 is
`docs/plans/008-plugin-lifecycle-03.md` (lifecycle proofs, private chain, eval, QA, release
close); each names its predecessor in its head.

## Context

A consuming organization wants to install Stamity as a native plugin per client from an
organization-managed catalog, pin a version, and take reviewed updates through Renovate, on top of
the CLI, APM and fork routes that already ship. Today the repository publishes manifest-only plugin
surfaces (`.claude-plugin/`, `.cursor-plugin/`, root `plugin.json`) that point at `content/`, an npm
tarball, and an APM package; nothing installs as a self-contained plugin, nothing bundles the
runtime, and no machine-readable release contract exists beyond the tarball digest. This file
plans the producer half: per-client plugin roots generated from the resolved corpus by the real
per-client emission planners, a bundled runtime with a locator, a distribution configuration, the
catalog files, `release.json`, Renovate presets, and the release workflow that publishes a
distribution branch, a tag and release archives.

Decisions the maintainer took on 2026-09-17, applied as written: (1) one feature plan, executed and
shipped next as 1.9.0; (2) Node at the engine floor is a declared prerequisite, no self-contained
executable; (3) headless proof where a route exists, human QA rows elsewhere; (4) built roots live
on an orphan distribution branch tagged per version plus zip archives on the GitHub release;
(5) bundled runtime in every root with a repository-pinned companion override; (6) Codex and
Copilot-in-VS-Code: verify first, deliver the best native mechanism, declare it; (7) facts,
uncarriable rules, MCP documents and state stay repository-owned; (8) charter-reference
substitution of `${STAMITY:*}` tokens in plugin roots, APM unchanged; (9) one new verb
`stamity plugin`; (10) a controlled private chain proof with the maintainer's fixture repositories.

Shared intake, read inline: the charter's repo facts and gates (`AGENTS.md`); the eight spec
headers under `docs/specs/` (every one `shipped-with-*`; the closest truths are the APM canonical
distribution, fork layer and enterprise upstream lane specs); all seven learnings (dogfood sync,
leak gate over state files, surface pins, local gate weaker than CI, release-close record re-sync,
codex headless hooks, worktree commondir race — each shapes a unit or a risk below); the deferral
inbox (no active rows). Research fan-out: seven read-only researchers (vendor contracts, content
pipeline, ownership and verbs, release pipeline, runtime bundling, docs and QA evidence, vendor gap
closure), 2026-09-17. Findings that changed the design: Codex has an Agent Plugins 1.0 container
(`plugin.json` at the root, `skills/`, `mcp.json`, `PLUGIN_ROOT`); Claude Code namespaces plugin
commands and agents (`/stamity:st-work`, `stamity:stamity-reviewer`) and has `--plugin-dir`,
`claude plugin validate --strict` and `claude plugin rollback`; the Copilot CLI installs a local
directory with `copilot plugin install ./root` and reads Agent Plugins 1.0 roots; Cursor's `agent`
CLI has `-p` and `--plugin-dir`; the launcher allowlist forbids `npx` and absolute paths in hook
declarations, so a locator must be a committed script the hook spawns; `dist/` cannot run without
five production dependencies beside it; the two `scripts/*.mjs` generators bypass the planner and
would not carry hooks, so this plan runs the real planners instead.

Dimension defaults assumed (recorded, not asked):
- The source repository's four committed manifests and the APM package keep their bytes; the
  distribution tree is build output under `dist/plugins/`, never committed to `main`.
- Plugin id `stamity` on every client, so Claude's namespaced forms are `/stamity:<command>` and
  `stamity:<agent>`; the corpus's cross-references (`/st-work`) are left as they are in 1.9.0 and
  file 3's invocation proof measures whether the bare form resolves.
- `sigstore` and its tree are excluded from the bundled runtime by moving `sigstore` to
  `optionalDependencies` (its import is already lazy and the verifier already reports an unarmed
  seam); the npm route is unchanged because npm installs optional dependencies by default.
- Distribution branch `plugin-dist`, tag `plugins/v<version>` (outside the `v*` tag ruleset),
  archives `stamity-plugin-<client>-<version>.zip`, checksums `<archive>.sha256`.
- Marketplace entries pin `ref` to the tag; sha-level pinning reads `release.json`
  `distribution.commit`, because a commit cannot carry its own sha inside its tree.
- `release.json` carries the source commit's committer date, not a wall clock, so two builds of one
  commit are byte-identical.

Two later decisions of 2026-09-17 reshape the package. First, the consuming enterprise will
re-create its private fork fresh on 1.9.0, so the CLI-to-plugin migration engine and the
coexistence suite are cut from the package (file 2 records the cut; the ownership boundary and the
idempotent setup stay). Second, the maintainer asked for an audit of everything the Codex and
GPT-6 Astra sessions touched (the Astra model-pin run, Package 13 enterprise downstreams, Package
10 with its readiness and session-eval runs; public window `d6096ac^..6ad4e0d` plus five private
run directories). The audit ran on 2026-09-17 as six read-only reviews; its record is
`.stamity/runs/2026-09-17_codex-astra-audit/findings.md`: two Criticals, sixteen Warnings, about
forty Minors. Its Criticals and public-repository Warnings are batch A below, first in the
package, because the plugin roots inherit the hook runtime and the enterprise fork route runs
through the upstream lane. The audit itself changed nothing.

Out of scope for this file: the consumer-side verb and manifest fields (file 2); every proof
beyond the generator's own tests (file 3); telemetry; a self-contained executable; changing the
APM package's bytes beyond the two keys DOC-4 restores; the audit's Minors (one inbox row points
at the record); any private hosting, credential or catalog approval, which stay with the consuming
organization.

## Spec delta

Stated against `docs/specs/plugin-lifecycle.md` (`status: design`, area `PLUGIN`; assembled from
the three files' delta sections on 2026-09-17, so the spec and the plans carry the same paragraphs;
`/st-work` marks it `shipped-with-1.9.0` at the close). This file ADDS REQ-PLUGIN-001–012. File 2 adds the setup-mode, documentation and
existing-routes requirements; file 3 adds the proof and eval requirements. The audit fix batch
MODIFIES six shipped requirements, stated below against their own specs; nothing is retired.

### MODIFIED REQ-UPSTREAM-016

Given a fork whose manifest carries any key the running engine's schema admits (the 18 keys of
`MANIFEST_FIELD_ORDER` today, more tomorrow), When the missing-pull-request recovery re-validates
the manifest, Then it compares the on-disk manifest to the branch's manifest with only `updatedAt`
masked and accepts any key set the engine's own validator accepts; a test binds the workflow's
comparison to `MANIFEST_FIELD_ORDER`, `TOOLS` and `MANIFEST_VERSION` so a new key cannot silently
break recovery again.

### MODIFIED REQ-UPSTREAM-011

Given an integration branch protected by rulesets only, When the landing-policy check reads the
classic-protection endpoint and receives a 404, Then it records "no classic protection" rather than
"unverified", and the pull-request body carries the not-fully-checked note only when rulesets or
repository settings were unreadable.

### MODIFIED REQ-UPSTREAM-017

Given a downstream that renamed the package and set `private: true` as `docs/enterprise-forks.md`
instructs, When it runs the recommended gate and the regenerate list, Then the tarball smoke
installs and imports the renamed package, every test that pins the canonical name or privacy is
gated on `stamity.publisher` and `private` or listed in the guide as a fork-edited test, the
regenerated marketplace carries a git source rather than an unpublished npm package, and the guide
states the github.com boundary of the generators beside its portability claim.

### MODIFIED REQ-FINISH-001

Given the Cursor and Copilot hook contracts as their pages read on 2026-09-17, When the guards and
the portable runner emit their decisions, Then every allow path on Cursor writes an explicit
`{"permission":"allow"}`, Copilot `sessionStart` output reaches the session as `additionalContext`,
the Codex starter resolves the hook script from the directory holding `.codex/hooks.json` rather
than the nearest match above the session directory, and every vendor literal in the runner and
the adapters carries a citation with an access date.

### MODIFIED REQ-FINISH-005

Given the pack-signing rehearsal, When it runs, Then it signs the source at the commit the workflow
runs on (or a pinned commit that is an ancestor of `main`, asserted by its test), re-runs on any
change under `src/pack/**`, `src/merge/**` or the lockfile, and the author documentation states that
signing needs a GitHub Actions job with `id-token: write` or `SIGSTORE_ID_TOKEN`; the signing script
prints an `EngineError`'s message instead of a generic line.

### MODIFIED REQ-FINISH-003

Given a plan whose spec delta uses a prose range, an absent or suffixed `## Spec delta` heading,
or a line carrying both ADDED and REMOVED, When the structural coverage checker runs, Then it
expands the range (or reports `partial-scope`), reports `missing-spec-delta`, and classifies the
added ids as scoped, so none of the three shapes passes with requirements out of scope.

### REQ-PLUGIN-001 Plugin roots from the resolved corpus

Given the corpus under `content/` plus an optional `fork/` layer, When
`node scripts/generate-plugin-packages.mjs --out-dir <dir> --runtime <extracted tarball>` runs, Then
`<dir>/claude`, `<dir>/cursor`, `<dir>/copilot` and `<dir>/codex` each hold the client's container
manifest and every artifact class that container carries, rendered by that client's own residue
planner over a full selection; a second run over the same inputs is byte-identical; a fork
addition, replacement or patch lands under the emitted id the CLI route uses; and
`--check --out-dir <dir>` exits 1 naming the first differing file and the regeneration command
when any byte moved.

### REQ-PLUGIN-002 Capability declaration per root

Given a generated root, When `stamity-plugin.json` is read, Then it carries `schemaVersion: 1`,
`client`, `version`, `sourceCommit` (40 hex), `invocation` forms, `clientFloor` with a vendor
citation and an ISO access date, `prerequisites.node` equal to `package.json` `engines.node`, one
`classes.<class>` entry per class in `agent, skill, command, rule, hooks, mcp` whose `status` is
`carried`, `repository-owned` or `unsupported` and whose non-`carried` entries carry a `reason`,
and `runtime.locator`, `runtime.companion.package` and `runtime.companion.compatible`; a test
asserts that every artifact class the corpus indexes is either `carried` with a count equal to the
files in the root or declared with a reason.

### REQ-PLUGIN-003 Companion files and the generated setup command travel

Given a skill directory with `references/`, `scripts/` or `assets/` files and a root whose client
carries commands, When the root is generated, Then every regular file under the skill directory is
present byte-for-byte beside its `SKILL.md`, a path containing `..`, a backslash or a symlink is
refused with exit 1 naming it, and the root carries a generated `st-setup` command whose body runs
`plugin status` and `plugin setup` through `runtime/locate.mjs` with that client's root variable.

### REQ-PLUGIN-004 Charter-reference substitution of tokens in plugin bodies

Given the ten corpus files that carry `${STAMITY:*}` tokens, When a root is generated, Then no file
under the root contains the string `${STAMITY:`, each gate token reads as the fixed phrase naming
its row under `Verification gates` in `AGENTS.md`, each fact token reads as the fixed phrase naming
its row under `Repo facts`, an unknown token fails the generator with exit 1 naming the file and
token, and `node scripts/generate-apm-package.mjs --check` still exits 0 on the committed
`.apm/` tree.

### REQ-PLUGIN-005 Plugin hooks resolve their roots and never write configuration

Given a root's hook configuration and scripts, When the configuration is parsed, Then every command
names a script under the client's root variable (`${CLAUDE_PLUGIN_ROOT}`, `${CURSOR_PLUGIN_ROOT}`,
`${PLUGIN_ROOT}`) and no repository-relative `.stamity/generated/hooks` path; When a session-start
script runs from a repository with the root variable set and `STAMITY_REPO_ROOT` unset, Then it
reads that repository's `.stamity/` from the working directory, reads the policy document from the
root variable's `hooks/agent-tool-policies.json`, and `git status --porcelain` is unchanged after
the run.

### REQ-PLUGIN-006 Bundled runtime runs standalone and passes the leak gate

Given a root's `runtime/` directory copied alone to an empty directory, When
`node runtime/dist/cli.js --version` runs there with no other install, Then it prints the release
version and exits 0; When `scripts/leak-gate.mjs --include-build` runs beside the copied root, Then
it reports zero hits over a non-zero file count; and `node scripts/size-budget.mjs` reports the
logic budget unchanged because the emitter lives under `scripts/`.

### REQ-PLUGIN-007 Locator resolution order and refusals

Given `runtime/locate.mjs`, When it runs with `--print` inside a repository whose
`node_modules/@zomarit/stamity/package.json` version satisfies the declared compatible range, Then
its JSON names `runtime.kind: "companion"` and that path; When the companion is absent or outside
the range, Then it names `runtime.kind: "bundled"`; When Node is below the floor, Then it exits 2
with a message naming the floor, the found version and the install instruction; When no runtime
resolves, Then it exits 2 naming both probed paths; and in no case does it spawn a program found on
`PATH`.

### REQ-PLUGIN-008 Prerequisites declared and probed

Given a root, When `stamity-plugin.json` is read, Then `prerequisites` declares `node` (the floor
range), `git` (`optional`) and the client floor; When `runtime/locate.mjs --print` runs, Then its
JSON reports `node.ok`, `node.floor` and `node.version`; and the `plugin-runtime` doctor row of
file 2 reads the same declaration.

### REQ-PLUGIN-009 Distribution configuration without credentials

Given `package.json` with a `stamity.distribution` block, When `scripts/distribution-identity.mjs`
resolves it, Then `publisher`, `repository`, `branch`, `tagPattern` and per-client `sources`
(`kind` in `git-subdir | github | archive | npm`) are returned with defaults derived from
`repository.url` when the block is absent; a key named `token`, `password`, `secret`, `auth` or
`credential`, or any value matching the leak gate's credential shapes, is refused with exit 1
without echoing the value; and an unknown key is refused by name.

### REQ-PLUGIN-010 Catalog files per client with configurable sources

Given the distribution root, When it is generated, Then `.claude-plugin/marketplace.json` lists
one plugin whose `source` is `{ "source": "git-subdir", "url", "path": "claude", "ref": "plugins/v<version>" }`
by default, `.github/plugin/marketplace.json` lists the `copilot` root with `owner`, `metadata` and
a relative-path `source`, `.cursor-plugin/marketplace.json` lists the `cursor` root,
`.agents/plugins/marketplace.json` lists the `codex` root, every entry's `version` equals the
release version, and a configuration selecting `archive` or `npm` for a client changes only that
entry's `source` object.

### REQ-PLUGIN-011 Machine-readable release manifest and Renovate presets

Given the distribution root, When `release.json` is read, Then it validates against the schema in
`scripts/plugins/releaseManifest.mjs` (`schemaVersion: 1`, `version`, `sourceCommit`,
`sourceCommitDate`, `distribution.branch|tag|commit`, `runtime.package|version|nodeFloor|tarballSha256`,
`packages[]` with `client|path|archive|sha256|bytes|clientFloor`, `catalogs`,
`apm.manifest|primitives|installSpec`), every `sha256` equals the archive's digest, the tree also
validates as an APM package (`apm.yml` plus `.apm/` at its root, byte-identical to the checkout's
committed package for the same corpus), and `renovate/plugins.json` plus `renovate/companion.json` parse as
Renovate presets whose datasources are `github-tags` and `npm` and whose regex manager matches the
marketplace `ref` field.

### REQ-PLUGIN-012 Release workflow publishes the distribution

Given a `v<version>` tag push, When `release.yml` runs, Then the gates job uploads a
`release-plugins` artifact holding the distribution tree, four archives, four checksum files and
`release.json`; the publish job, after the npm publish, pushes the tree as one orphan-branch commit
on `plugin-dist`, creates the `plugins/v<version>` tag on it, attaches the archives, checksums and
`release.json` to the GitHub release, and records build-provenance attestations for the archives;
a dispatch with `dry_run` unset or `true` prints the branch, tag and archive names it would publish
and pushes nothing; and `test/ci/workflow.test.ts` pins each of those facts.

## Units

Batches: A (the audit fixes, A1–A7) runs first and in parallel where the file sets are disjoint
(A1, A2a, A3, A5, A6 in parallel; A2b after A2a; A4 after A3, because both touch the contracts
page and the capability matrix; A7 is the maintainer's private-checkout list); then B0 is the
contract; B1 runs in parallel after B0; B2 after B1; B3 last. P2b depends on A3 because both
rewrite the emitted hook bodies. Every unit's
`verify` is the charter gate plus the coverage flag CI enforces (learning: the local gate is weaker
than CI); units that touch `src/hooks/*` or `src/emit/*` add the dogfood sync and budget a CI
round-trip for the Windows leg. One writer per file: where two units name one file, the later
batch owns it. Contract census before B1 dispatch (invariant 6): `EmissionContext.facts`,
`HookInterchange.command`, `HOOKS_GENERATED_DIR`, `resolveDistributionIdentity`, the four
committed manifests' bytes, and `release.yml` step names — each has exactly one writer below.

### A1 — upstream-lane-recovery-schema (A; audit FORK-1, FORK-4, minor 404 note)

| Field | Content |
|---|---|
| `id` | a1-upstream-recovery |
| `requirements` | REQ-UPSTREAM-016, REQ-UPSTREAM-011 |
| `files` | `.github/workflows/upstream-update.yml`, `.github/workflows/pr-checks.yml`, `test/upstream/workflowRecovery.test.ts`, `test/upstream/workflowLandingPolicy.test.ts`, `test/ci/upstreamWorkflow.test.ts`, `test/ci/workflow.test.ts` (the pr-checks pins), `docs/enterprise-forks.md` (the recovery paragraph at 734-739 and the DCO paragraph at 412-419), `docs/specs/enterprise-upstream-lane.md` (482-491) |
| `interfaces` | Recovery step (`upstream-update.yml:979-1012`): replace the literal version, tools list and 17-key allowlist with `jq -S 'del(.updatedAt)'` deep-equality between the two manifests plus the existing `updatedAt` timestamp regex; validation of the key set is delegated to the engine by running `node dist/cli.js validate --json` (or the published binary the job already installs) on the branch checkout and failing on a non-zero exit — the engine's own schema is the only schema. Test: `workflowRecovery.test.ts` gains a case whose fixture manifest carries every optional key (`ruleDelivery`, `mcp`, `hooks`, `models`, `learnings`, `toolOptions`, `importChoice`) and a case that derives the fixture from `MANIFEST_FIELD_ORDER` (import `src/types/manifest.ts` and `createManifest`) so an added field is exercised the day it lands. DCO (`pr-checks.yml:88-93`): the commit list excludes commits reachable from the upstream namespace (`refs/stamity-upstream/*` when present, else the pull request's merge base with the configured upstream URL fetched read-only); the 250 cap applies to the remaining fork-authored commits; the message names the exclusion. Landing policy (`upstream-update.yml:618-634`): a 404 body containing `Branch not protected` sets `classic=none` and counts as checked; only a 403 or a malformed body marks the surface unverified; the not-fully-checked note is emitted only when a surface stayed unverified. Docs: the guide's recovery paragraph says "every byte except `updatedAt`, validated by the engine", the DCO paragraph states the upstream-commit exclusion, and the spec's 482-491 sentence moves with it |
| `testCriteria` | the workflow's jq program (extracted as the existing tests extract it) accepts a manifest with `ruleDelivery` and every other optional key and refuses one with a `ledgar` typo through the engine's validator exit code; a synthetic update PR listing 300 upstream commits plus 3 fork commits passes the DCO job's shell (executed in a scratch repository the way `test/ci/workflow.test.ts:1348-1499` executes release proofs); the 404 body yields `checked=true` and no note; a 403 yields the note; the guide and spec sentences match the workflow's comparison in words |
| `edgeCases` | a fork whose engine is older than the branch's manifest: the validator refuses with its own schema-generation message and recovery stops with that text, never a silent pass; a repository with no upstream namespace fetched: the DCO exclusion is empty and the cap applies to all listed commits, stated in the message |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### A2a — fork-identity-runtime (A; audit FORK-2, minor remedy strings)

| Field | Content |
|---|---|
| `id` | a2a-fork-identity-runtime |
| `requirements` | REQ-UPSTREAM-017 |
| `files` | `scripts/tarball-smoke.mjs`, `src/cli/notice/updateNotice.ts` (export of the package-facts reader for the remedy helper), `src/cli/kit/packageName.ts` (new), `src/cli/commands/check.ts`, `src/cli/commands/sync.ts`, `src/cli/commands/handoff.ts`, `src/cli/commands/learn.ts`, `src/cli/commands/clean.ts`, `src/cli/commands/add.ts`, `src/cli/commands/sync/engine.ts`, `test/cli/kit/packageName.test.ts` (new), the touched commands' tests, `docs/cli-reference.md` (regenerated only if a summary moves) |
| `interfaces` | `packageName.ts`: `export function packageCommand(verb: string): string` returning `npx <name from resolveOwnPackageFacts()> <verb>` (falls back to `npx @zomarit/stamity` only when the facts resolve to the unnamed sentinel, and says so in a comment); every literal `npx @zomarit/stamity …` in the seven command files becomes `packageCommand("…")`; `tarball-smoke.mjs` reads `pkg.name` for the install path (`:92`) and both consumer snippets (`:130,152`) |
| `testCriteria` | `grep -rn "@zomarit/stamity" src/cli/commands src/cli/engine` returns 0 hits; a renamed `package.json` (`@acme/stamity`) makes `check`'s manifest-missing remedy print `npx @acme/stamity init` (harness with a pseudo package root); the tarball smoke passes against a renamed, `private: true` copy of the checkout in a temp directory (the guide's bootstrap block executed) |
| `edgeCases` | the `st` alias is not used in remedies (the scoped name is what `npx` resolves); the unnamed sentinel path prints the canonical fallback and is covered by one test |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/tarball-smoke.mjs` |

### A2b — fork-identity-tests-and-guide (A; audit FORK-3, FORK-5, minors marketplace-private and spec status; DOC-2)

| Field | Content |
|---|---|
| `id` | a2b-fork-identity-guide |
| `requirements` | REQ-UPSTREAM-017 |
| `files` | `test/cli/notice/updateNotice.test.ts`, `test/docsPages.test.ts` (the canonical-name and privacy pins), `test/cli/binMap.test.ts`, `test/ci/apmInstall.test.ts`, `test/ci/repoHygiene.test.ts`, `test/ci/evidenceSummary.test.ts`, `test/upstream/lane.test.ts` (the one canonical literal), `test/ci/packSigningRehearsal.test.ts` (the guard literals are correct as canonical-only tests: gate them on the identity), `test/support/identity.ts` (new: `canonical()` reads `package.json` and `stamity.publisher`, returns `{ canonical: boolean, name, publisher, private }`), `scripts/generate-plugin-manifests.mjs` (marketplace `source` becomes a `github` source with the repository when `pkg.private === true`), `test/ci/pluginManifests.test.ts`, `docs/enterprise-forks.md` (the fork-edited tests list at 151-153 becomes the derived rule "tests read `test/support/identity.ts`; none needs editing"; the github.com boundary beside 786-787; the baseline tag as `STAMITY_BASELINE_TAG` at 102), `docs/specs/enterprise-upstream-lane.md:473-474`, `docs/specs/apm-canonical-distribution.md:156-157`, `docs/specs/fork-layer.md:216-217` (the three "pending" sentences become "shipped in 1.6.0; evidence at docs/plans/005-enterprise-downstream-support.md:222-256") |
| `testCriteria` | with `package.json` renamed to `@acme/stamity`, `stamity.publisher: "acme"`, `repository.url` on `acme/stamity`, and `private: true` in a temp copy of the checkout, `npm test` passes (the suite run in that copy through the same harness `test/ci/apmDownstream.test.ts` uses to build a downstream checkout); the regenerated marketplace in that copy carries `{ "source": "github", "repo": "acme/stamity" }` and no npm source; the three spec sentences no longer contain "pending"; `test/docsPages.test.ts` holds the guide's new sentences |
| `edgeCases` | the canonical checkout is unchanged byte for byte in every generated file (the identity helper returns `canonical: true` and every pin keeps its literal path) |
| `depends_on` | a2a-fork-identity-runtime |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-plugin-manifests.mjs --check` |

### A3 — hook-contracts-cursor-copilot-codex (A; audit HOOK-1, HOOK-2, HOOK-4, HOOK-5, minors)

| Field | Content |
|---|---|
| `id` | a3-hook-contracts |
| `requirements` | REQ-FINISH-001 |
| `files` | `src/adapters/cursor.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts`, `src/hooks/portableRunner.ts`, `src/hooks/model.ts`, `src/hooks/scripts.ts` (the guard bodies' allow path), `src/emit/hooksInfra.ts` (the dead warning-class sentence), `test/adapters/{cursor,copilot,codex}.test.ts`, `test/hooks/portableRunner.test.ts`, `test/hooks/scripts.test.ts`, `test/corpus/hookWiring.test.ts`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (regenerated: the emitted bytes move by design), the dogfood tree, `docs/capability-matrix.md` (regenerated from the facts), `docs/troubleshooting.md` (the Copilot session-start sentence), `.github/client-contracts.md` (HOOK-2's sentence only; A4 owns the Codex paragraph) |
| `interfaces` | Cursor: the sub-agent guard and the MCP guard write `{"permission":"allow"}` on every allow path; the runner, for cursor `pre_tool_use` rows whose child produced no decision, writes the same; the dialect fact at `cursor.ts:264,284` names "no output" in the `failClosed` clause with the 2026-09-17 access date. Copilot: on `session_start`, plain-text child output is wrapped as `{ "additionalContext": <text> }` and a JSON `additionalContext` maps to `out.additionalContext`; the "manual read" fallback (`copilot.ts:297`), `model.ts:112`, the matrix rows 182 and 234, the troubleshooting sentence and the contracts sentence are rewritten to "injected as additionalContext (docs.github.com hooks reference, 2026-09-17)"; runner-level faults on the identity-free core guard exit 0 with the stderr warning on Copilot, as on Codex. Codex: the starter resolves the hook script from the directory that holds `.codex/hooks.json` (walk up to that file, then use its directory), never from an unrelated nearer match; the emitted `description` says script bytes are outside the trust hash and `stamity check` is the control; legacy `approve` is ignored with a warning on Codex as on the other clients; `session_end` rows without a timeout get `timeout: 3`. Every vendor literal in the runner and the three adapters gains an inline `// <url> (accessed 2026-09-17)` or moves into the adapter's `citations`; the Cursor module cites one URL and one date. `hooksInfra.ts:160`'s sentence about a warning class the planner never emits is deleted |
| `testCriteria` | the Cursor golden `.cursor/hooks/*.mjs` bodies contain `"permission":"allow"` on the allow branch and `cursor.test.ts` asserts a run of each guard against an allowed payload writes it; the runner with a cursor `pre_tool_use` row and a silent child writes the allow object; a Copilot `session_start` plain-text child output arrives as `{"additionalContext": …}` in the runner's stdout; the Codex starter placed in `a/b/.codex/hooks.json` with a decoy script at `a/.stamity/generated/hooks/codex/…` runs the `a/b` script; `grep -c "accessed 2026-09-17" src/hooks/portableRunner.ts` is at least 10; the capability matrix regenerates byte-identical to the committed page; `node dist/cli.js check` is clean after the dogfood sync |
| `edgeCases` | Claude's guards keep their silent allow (that client documents exit code semantics only); a Copilot `session_start` child that writes JSON without `additionalContext` passes through unchanged with a warning naming the unknown field |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check && node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/capability-matrix.md` |

### A4 — docs-and-records-currency (A; audit DOC-1, DOC-3, DOC-4, EVAL-2, PRIV-1)

| Field | Content |
|---|---|
| `id` | a4-docs-currency |
| `requirements` | REQ-FINISH-001, REQ-FORK-010 |
| `files` | `.github/client-contracts.md` (the Codex paragraph: the three loading steps, the 2026-09-15 headless measurement, the access dates; the page joins the re-attestation bucket in `test/docsPages.test.ts` or moves under `docs/`), `CHANGELOG.md` (the link table gains `[1.7.0]` and `[1.8.0]`, `[Unreleased]` compares `v1.8.0...HEAD`), `test/ci/changelogLinks.test.ts` (new: every `## [x.y.z]` heading has a link definition and the compare range chains), `scripts/generate-apm-package.mjs` (`headFor` passes `license`, `compatibility`, `allowed-tools` and `metadata` through for skills), `.apm/**` (regenerated), `test/ci/apmPackage.test.ts` (the skill frontmatter key set), `CONTRIBUTING.md` (the eval paragraph states the two-class rule and the runner's no-run-of-record status), `.stamity/overrides/skills/st-eval-run/SKILL.md` (section 5 restated as the two-class rule; `session-native-v1.md` marked historical), `.claude/skills/st-eval-run/SKILL.md` (dogfood copy), `evals/README.md` (the v2 configuration moves under a retained heading; the moved-Expected sentence mirrors SET-v7; `runs 1–10` for rubric-v4), `evals/rubric-v7.md:3` (the selector sentence), `evals/MODEL-PROFILES-v1.md:65-67`, `.stamity/runs/2026-09-11_package-10-readiness/handoff.md` (a dated "earlier state" paragraph pointing at commit `6ad4e0d` and runs 13 and 14), `docs/specs/apm-canonical-distribution.md` (the four downstream-contract requirements move under `## Requirements`, where the structural checker reads definitions; their text is unchanged) |
| `testCriteria` | the contracts page names `features.hooks`, `projects.<path>.trust_level` and the headless `exec` result with dates and passes the hand-page contract; `changelogLinks.test.ts` passes and fails on a heading without a definition; `.apm/skills/st-qa/SKILL.md` carries `license` and `compatibility` and `generate-apm-package.mjs --check` exits 0; `test/evals/readmeCurrency.test.ts` gains the moved-Expected sentence pin and passes; the emitted `.claude/skills/st-eval-run/SKILL.md` equals the override; the readiness handoff's first paragraph names `6ad4e0d` |
| `edgeCases` | the APM key pass-through must not change any non-skill primitive's bytes (the apmPackage test's per-class key sets prove it); the changelog test tolerates the Keep-a-Changelog footer order the release workflow's awk extractor relies on |
| `depends_on` | a3-hook-contracts |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-apm-package.mjs --check && npm run build && node dist/cli.js sync` |

### A5 — signing-rehearsal-pin (A; audit SIGN-1, SIGN-2, minor bootstrap labels)

| Field | Content |
|---|---|
| `id` | a5-signing-rehearsal |
| `requirements` | REQ-FINISH-005 |
| `files` | `.github/workflows/pack-signing-rehearsal.yml`, `scripts/pack-signing-rehearsal.mjs`, `scripts/sign-pack.mjs`, `src/pack/sign.ts` (the `:116` comment), `test/ci/packSigningRehearsal.test.ts`, `docs/packs-and-trust.md` (203-230, 248-253), `SECURITY.md` (the rehearsal's public outputs sentence beside 276) |
| `interfaces` | the rehearsal checks out `src/`, `package.json` and `package-lock.json` at `github.sha` (the reviewed script stays pinned by its own test), so the proof witnesses the code that ships; `paths:` gains `src/pack/**`, `src/merge/**`, `package-lock.json`; `packSigningRehearsal.test.ts` asserts that any `SIGNING_SOURCE_SHA` still present is an ancestor of `origin/main` (`git merge-base --is-ancestor`) and evaluates the job `if` over repository, privacy and ref shapes with `evaluateWorkflowExpression`; `sign-pack.mjs` prints `error.message` for an `EngineError` and passes `label: "signing script"` to the bootstrap; `pack-signing-rehearsal.mjs` calls the bootstrap; the docs page says signing needs a GitHub Actions job with `id-token: write` or `SIGSTORE_ID_TOKEN`; SECURITY.md names the rehearsal's transparency-log entries and archived fixture packs as its public outputs |
| `testCriteria` | the workflow suite fails on a dangling pin (fixture: a sha not in the ancestry) and passes at HEAD; a workflow-dispatch rehearsal on `main` after the change concludes `success` (run URL in the record); `sign-pack.mjs` on a pack with a wrong integrity map prints the `INTEGRITY_ERROR` message; the docs sentence is present |
| `edgeCases` | a run on a fork (guard false) never reaches the sign job, unchanged; the paths filter must not trigger on `docs/**` |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && gh workflow run pack-signing-rehearsal.yml --ref main` (then read the run) |

### A6 — eval-comparator-and-checker (A; audit EVAL-1, CHECK-1, minor checker shapes)

| Field | Content |
|---|---|
| `id` | a6-eval-and-checker |
| `requirements` | REQ-FINISH-003, REQ-FINISH-008 |
| `files` | `scripts/eval/run.mjs`, `test/evals/manualRunner.test.ts`, `content/skills/st-verify/scripts/spec-plan-coverage.mjs`, `test/authoring/specPlanCoverage.test.ts`, `content/skills/st-verify/SKILL.md` (one sentence: definitions come from spec files, a plan's own delta headings are read as provisional definitions when no spec exists), the projected copies of the script (`.claude/skills/st-verify/scripts/`, `.apm/skills/st-verify/scripts/`, dogfood sync), `evals/SET-v7.md` (the sentence naming what the comparator keys on) |
| `interfaces` | `run.mjs`: `previousRun()` keys on `{ profile, rubricCoreHash, harness }` (the driver's notion) and ignores case and content bytes; a test with two runs differing by one case byte and the same advisory failing in both finds the prior run. Checker: `references()` expands `…`, `to`, `through` and `-` ranges between same-area ids; a plan without a `## Spec delta` heading (prefix match `## Spec delta`) reports `missing-spec-delta`; a line carrying ADDED/MODIFIED/REMOVED is split at the keywords before classification; a `### REQ-` heading inside the plan's spec delta counts as a provisional definition when no spec defines the id (reported as `provisional-definition`, status stays `pass`); unit ids strip a trailing `:`; tokens exclude `]`, `:` and `(`; the shorthand requires a preceding `, ` or line start; the backreference is replaced by a post-check |
| `testCriteria` | `specPlanCoverage.test.ts` gains one case per shape: prose range with a missing middle id → `missing-coverage`; absent heading → `missing-spec-delta`; mixed line → the added id in scope; provisional definitions → pass with the finding; `### U1: x` → unit id `U1`; `[REQ-X-001](#x)` → no `invalid-reference`; `budget -200ms` → no reference; the checker over `docs/plans/007-prove-behavior-and-value.md` now scopes 22 requirements; `manualRunner.test.ts` covers the new comparator key |
| `edgeCases` | a range spanning areas (`REQ-PLUGIN-001 … REQ-LADDER-003`) is refused as `invalid-reference`; a provisional definition that also exists in a spec is a `duplicate-requirement` |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node scripts/generate-apm-package.mjs --check` |

### A7 — private-checkout-tasks (A; audit PRIV-2 to PRIV-5; maintainer's private checkout only)

| Field | Content |
|---|---|
| `id` | a7-private-checkout |
| `requirements` | REQ-UPSTREAM-018 |
| `files` | the private layer's release verifier (the 1.8.0 copy and the morning script), a `README.md` beside each of the five run directories' scripts, the two cramped STATE files (a reading-guide paragraph, no rewrite), the readiness `qa-final-preparation` retention decision, the storage policy's ignore rule |
| `interfaces` | the verifier reads the two APM binaries from `STAMITY_APM_MINIMUM` and `STAMITY_APM_CURRENT` (defaulting to a `verify-tools/` directory the morning script provisions with pinned `apm-cli` 0.29.1 and 0.30.0); every one-off script directory gains a `README.md` line "historical, do not run; outputs are hash-pinned evidence" and the scripts that would overwrite evidence exit unless `STAMITY_REPLAY=1`; the two STATE files gain a top paragraph naming their readable successors; the 1.29 GB untracked tree: delete the regenerable build source and the unused Copilot runtime under a one-line retention decision, archive the 28 MB fixture tree with `capture: working-tree`, fix the top-level ignore rule that names a path that does not exist; the fixture repositories of 2026-09-10 and the `/tmp` residue get a deletion decision; the record states whether the token that reached the two Renovate debug logs was rotated |
| `testCriteria` | the morning sequence runs end to end on a machine after a reboot with no `/tmp` state; the private layer's hygiene CI passes; the retention decision is one dated line in the storage policy |
| `edgeCases` | none — every item is a maintainer action with a recorded outcome, and an item the maintainer declines is written as declined |
| `depends_on` | none |
| `verify` | the private layer's own hygiene check (not this repository's gates) |

### P1 — distribution-contract (B0)

| Field | Content |
|---|---|
| `id` | p1-distribution-contract |
| `requirements` | REQ-PLUGIN-009, REQ-PLUGIN-011 |
| `files` | `scripts/distribution-identity.mjs`, `scripts/plugins/releaseManifest.mjs` (new), `renovate/plugins.json` (new), `renovate/companion.json` (new), `test/ci/distributionIdentity.test.ts` (new), `test/ci/releaseManifest.test.ts` (new), `package.json` (the `stamity.distribution` block for this repository and `sigstore` moved to `optionalDependencies`), `knip.json` (the `renovate/` presets are data, no change expected; the moved dependency stays referenced) |
| `interfaces` | `resolveDistributionIdentity(pkg)` keeps its return `{ publisher, repository, ownerSlug }` and gains `distribution`: `{ branch: string /* default "plugin-dist" */, tagPattern: string /* default "plugins/v<version>" */, sources: Record<"claude"\|"cursor"\|"copilot"\|"codex", { kind: "git-subdir"\|"github"\|"archive"\|"npm"; url?: string; repo?: string; path: string; registry?: string }> }`; defaults: `kind: "git-subdir"`, `url: "<repository>.git"`, `path: <client>`; refusals throw `Error` with the messages `package.json stamity.distribution.<key> is not a supported key`, `package.json stamity.distribution refuses credential-shaped keys (<key>)`, `package.json stamity.distribution.sources.<client>.kind must be one of git-subdir, github, archive, npm`; the credential-shape test reuses the regex sources of `scripts/leak-gate.mjs` lines 576–586 by importing nothing (copy the five patterns into a `CREDENTIAL_SHAPES` array with a comment naming their origin, because the gate's module runs on import). `releaseManifest.mjs` exports `RELEASE_MANIFEST_SCHEMA_VERSION = 1`, `function buildReleaseManifest(input: { version, sourceCommit, sourceCommitDate, distribution: { branch, tag, commit: string \| null }, runtime: { package, version, nodeFloor, tarballSha256 }, packages: Array<{ client, path, archive, sha256, bytes, clientFloor }>, catalogs: Record<client, string>, apm: { manifest: string; primitives: string; installSpec: string } }): object` (key order fixed as listed) and `function validateReleaseManifest(value: unknown): string[]` (empty array when valid; one message per defect naming the JSON path). `renovate/plugins.json`: `{ "$schema": "https://docs.renovatebot.com/renovate-schema.json", "customManagers": [{ "customType": "regex", "managerFilePatterns": ["/(^\|/)\\.claude-plugin/marketplace\\.json$/", "/(^\|/)\\.github/plugin/marketplace\\.json$/", "/(^\|/)\\.cursor-plugin/marketplace\\.json$/", "/(^\|/)\\.agents/plugins/marketplace\\.json$/"], "matchStrings": ["\"ref\":\\s*\"(?<currentValue>plugins/v[^\"]+)\""], "depNameTemplate": "zomarit/stamity", "datasourceTemplate": "github-tags", "versioningTemplate": "regex:^plugins/v(?<major>\\d+)\\.(?<minor>\\d+)\\.(?<patch>\\d+)$" }] }`; `renovate/companion.json`: a `packageRules` entry matching `@zomarit/stamity` with `rangeStrategy: "pin"`; both files' publisher/package strings are rendered from the identity by the emitter of P8 for a downstream, and the committed copies carry this repository's values |
| `testCriteria` | absent block resolves to the defaults above; each refusal message above is asserted verbatim on a synthetic `package.json`; a value `ghp_` followed by 36 alphanumerics is refused and the message does not contain it; `buildReleaseManifest` output is byte-stable across two calls; `validateReleaseManifest` returns `[]` for a built manifest and one path-named message for each of: missing `sourceCommit`, a `sha256` that is not 64 hex, an unknown client; both presets parse as JSON and the regex manager's `matchStrings` matches the string `"ref": "plugins/v1.9.0"` and captures `plugins/v1.9.0` |
| `edgeCases` | `repository.url` on a non-github host: `github`-kind sources are refused with a message naming `git-subdir` as the host-neutral kind; `sigstore` absent from `node_modules` after the move: `test/pack/sigstoreVerifier.test.ts` must still see the unarmed verdict path pass (run it in the unit) |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run knip` |

### P2a — plugin-package-emitter-core (B1)

| Field | Content |
|---|---|
| `id` | p2a-emitter-core |
| `requirements` | REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-003, REQ-PLUGIN-004 |
| `files` | `scripts/generate-plugin-packages.mjs` (new), `scripts/plugins/corpusStage.mjs` (new), `scripts/plugins/tokens.mjs` (new), `scripts/plugins/capability.mjs` (new), `scripts/plugins/layout.mjs` (new), `scripts/plugins/setupCommand.mjs` (new), `test/ci/pluginPackages.test.ts` (new), `CONTRIBUTING.md` (one regeneration-table row: `dist/plugins/` → `node scripts/generate-plugin-packages.mjs --out-dir dist/plugins --runtime <dir>`; the count sentence at `CONTRIBUTING.md:1-8` moves from four to five, and the `test/docsPages.test.ts` assertion that reads it moves with it in file 2's C7 — this unit leaves the test red only if C7 is not merged in the same batch, so land the row and the test change together: the CONTRIBUTING row is this unit's, the test line is C7's, and B3 integration runs both) |
| `interfaces` | CLI: `node scripts/generate-plugin-packages.mjs --out-dir <dir> --runtime <extracted-package-dir> [--client <csv>] [--check] [--source-commit <sha>] [--source-commit-date <iso>]`; exit 0 ok, 1 render/write/drift failure, 2 bad arguments (the `prepareNativeTypescriptCli` bootstrap of `scripts/native-typescript.mjs`, the `--check`/`--out-dir` grammar and the `fail()`/`usage()` shapes follow `scripts/generate-apm-package.mjs` lines 328–349 and 700–770). `corpusStage.mjs`: `async function stageSubstitutedCorpus({ contentRoot, forkRoot, tokens }): Promise<{ root: string; forkRoot?: string; dispose(): Promise<void> }>` copies `content/` and `fork/` into a temp directory with every `.md` body passed through `tokens.substitute`, refusing (exit 1) a file whose body still contains `${STAMITY:` after the pass. `tokens.mjs`: `export const CHARTER_REFERENCE_PHRASES: Record<token, string>` mapping the nine tokens of `src/emit/substitution.ts:86-96` — `${STAMITY:LINTER}` → `the linter named under Repo facts in AGENTS.md`, `${STAMITY:TEST_FRAMEWORK}` → `the test framework named under Repo facts in AGENTS.md`, `${STAMITY:CI_PROVIDER}` → `the CI provider named under Repo facts in AGENTS.md`, `${STAMITY:MATURITY_TIER}` → `the maturity tier named under Repo facts in AGENTS.md`, `${STAMITY:VERIFY_GATE_TEST}` → `the Tests command listed under Verification gates in AGENTS.md`, `…_LINT` → `the Lint command …`, `…_TYPECHECK` → `the Typecheck command …`, `…_ALL` → `the Full gate command …`, `${STAMITY:INVARIANTS_VERSION}` → refused (charter-only token; the charter is never a plugin body); `substitute(body): { text: string; unresolved: string[] }`. Planning: the emitter imports `../src/emit/planner.ts` `composeEmissionPlanner`, `../src/adapters/registry.ts` `ADAPTER_REGISTRY`, `../src/content/selection.ts` `resolveSelection`, `../src/content/catalog.ts` `buildContentIndex`; per client it builds a synthetic `SetupManifest` (`version: MANIFEST_VERSION`, `generatedBy: <release version>`, `tools: [client]`, `ruleDelivery: "on-demand"`, `selection: resolveSelection(index, { ids: [] })` i.e. everything, `ledger: []`, no `detected`, no `mcp`) and an `EmissionContext { rootDir: <temp empty dir>, manifest, engineVersion, facts: { monorepoPackages: [], hookScriptsRoot: "${<VAR>}/hooks" }, contentRoot: { root: staged.root, forkRoot: staged.forkRoot } }`, calls `planWithWarnings`, and hands `outputs` to `layout.mjs`. `layout.mjs`: `function pluginPathFor(client, row: AdapterOutput): string \| null` — the per-client table in P3–P6; `null` drops the row (charter and entry files, MCP documents, `.stamity/` scaffolds, the settings file's permission half); a non-null path is validated with `assertSafePath` from `src/content/catalog.ts`. `capability.mjs`: `function buildCapabilityFile({ client, version, sourceCommit, invocation, clientFloor, classes, runtime }): object` producing the REQ-PLUGIN-002 shape with fixed key order; `classes` is computed from the layout table (a class whose table entry is `null` for that client is `repository-owned` with the table's reason; a class the vendor container lacks is `unsupported`). `setupCommand.mjs`: `function renderSetupCommand(client, rootVar): string` — frontmatter `description: "Set this repository up for the stamity plugin: resolve facts and gates, write the repository-owned files, report duplicates."`, body: run `node "<rootVar>/runtime/locate.mjs" -- plugin status --json`; when `setup.needed` is true run `… -- plugin setup --client <client> -y`; when `duplicates` is non-empty print them with their remedies (`stamity clean -y` then `plugin setup` for engine-written files, the APM dependency to remove, the unmanaged file to remove or keep as an override) and stop for the operator; finish with `… -- plugin status` (the verb and its JSON keys are file 2's C4). Output: `<out>/<client>/…` plus `<out>/<client>/README.md` (install command for that client, the invocation forms, the pinning and rollback commands from `docs/plugins.md` of file 2 by section name); `--check` byte-compares every rendered file against `<out>` and reports unexpected files as drift (the `.apm/` orphan rule) |
| `testCriteria` | determinism: two runs into two directories produce identical sha256 tree maps; `--check` exits 0 after a write and exits 1 naming the file after one byte is appended to `claude/agents/stamity-reviewer.md`, and exits 1 naming an added file `claude/agents/extra.md`; no file under any root contains `${STAMITY:`; `content/commands/st-work.md`'s rendered body under `claude/commands/st-work.md` contains `the Full gate command listed under Verification gates in AGENTS.md`; a synthetic corpus with `${STAMITY:UNKNOWN}` fails with exit 1 naming the file; a skill with `references/x.txt` and `scripts/run.mjs` lands both byte-identical under `claude/skills/<dir>/`; a synthetic skill companion named `..\x` is refused; every `stamity-plugin.json` validates the REQ-PLUGIN-002 key set and its `classes.<c>.count` equals the files found; the downstream fixture of `test/ci/downstreamFixture.ts` produces `claude/agents/stamity-add-agent.md`, `claude/agents/stamity-replace-agent.md` with the fork body, `cursor/rules/stamity-patch-rule.mdc` with the patched body, and `claude/skills/add-skill/references/own.txt` |
| `edgeCases` | a fork skill that replaces a bundled skill projects under the replaced skill's directory (`replacedClaimantOf`) — asserted on `st-replace-skill`; a corpus collision (`index.collisions.length > 0`) refuses the run with exit 1 before any write; `--client codex` alone still renders `stamity-plugin.json` for codex with the spike's outcome (P6); an empty `fork/` directory is not an error |
| `depends_on` | p1-distribution-contract, p2b-hook-scripts-root |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-plugin-packages.mjs --out-dir /tmp/plugins --runtime <extracted tarball dir> && node scripts/generate-plugin-packages.mjs --check --out-dir /tmp/plugins --runtime <same>` |

### P2b — hook-scripts-root (B1; parallel with P1's tests, before P2a)

| Field | Content |
|---|---|
| `id` | p2b-hook-scripts-root |
| `requirements` | REQ-PLUGIN-005 |
| `files` | `src/emit/planner.ts` (the `EmissionContext.facts` type only), `src/emit/hooksInfra.ts`, `src/hooks/scripts.ts`, `src/hooks/portableRunner.ts`, `src/adapters/claude.ts` (the `shellWord` join must not single-quote a word that starts with `${`), `src/adapters/codex.ts`, `src/adapters/cursor.ts`, `src/adapters/copilot.ts` (hook-config rendering only), `test/emit/hooksInfra.test.ts`, `test/hooks/scripts.test.ts`, `test/hooks/portableRunner.test.ts`, `test/adapters/{claude,codex,cursor,copilot}.test.ts`, `test/emit/__snapshots__/crossClientGoldens.test.ts.snap` (regenerated only if the repository-mode bytes move, which they must not), the dogfood tree (`.stamity/generated/hooks/**`, regenerated by `npm run build && node dist/cli.js sync`) |
| `interfaces` | `EmissionContext.facts` gains `hookScriptsRoot?: string` ("where the generated hook scripts live from the client's point of view; absent means `HOOKS_GENERATED_DIR/<tool>`"). `planHooksInfra` composes each `PlannedHookScript.path` as before but each `HookInterchange.command` as `["node", "<hookScriptsRoot>/<file>"]` when the fact is set; `AGENT_TOOL_POLICIES_PATH` stays the repository path, and the planned policy document is additionally returned as `policyDocument` for the emitter to place at `<root>/hooks/agent-tool-policies.json`. `src/hooks/scripts.ts`: the emitted bodies gain `function policyDocumentPath(root)` — `const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? process.env.CURSOR_PLUGIN_ROOT ?? process.env.PLUGIN_ROOT; if (pluginRoot) { const p = join(pluginRoot, "hooks", "agent-tool-policies.json"); if (existsSync(p)) return p; } return join(root, ".stamity", "generated", "agent-tool-policies.json");` — used by the pre-tool-use guard and the review gate; `RESOLVE_REPO_ROOT` is unchanged. `portableHookCommand(tool, row)`: when `row.command[1]` starts with `${`, every tool (codex included) renders `node <path> <data>` and skips the cwd-walking starter, because the plugin root variable already locates the script. Claude's `shellWord`: a word starting with `${` and containing no whitespace or quote is emitted bare, wrapped in double quotes when it contains a space |
| `testCriteria` | repository mode: every adapter test and the cross-client golden are byte-identical to the current snapshot (no `-u`); with `hookScriptsRoot: "${CLAUDE_PLUGIN_ROOT}/hooks"` the claude settings hooks read `node "${CLAUDE_PLUGIN_ROOT}/hooks/stamity-session-start.mjs"` (or bare, when no space) and no `.stamity/generated` string appears in the hooks object; codex's hook command for the same fact is `node ${PLUGIN_ROOT}/hooks/<file> <data>` with no `-e`; the generated session-start script, run with `CLAUDE_PLUGIN_ROOT` pointing at a temp root holding `hooks/agent-tool-policies.json`, reads that document (assert via the guard's decision on a policy that denies one tool) and, with the variable unset, reads `.stamity/generated/agent-tool-policies.json`; a run of each generated script inside a `git init` fixture leaves `git status --porcelain` empty apart from `.stamity/` state files the script already owns |
| `edgeCases` | `STAMITY_REPO_ROOT` set to a directory outside the cwd's ancestry stays ignored (existing bound); a plugin root variable set to a directory without the policy document falls back to the repository document; Windows paths — the plugin root variable is opaque text and is never `join`ed with a POSIX literal (the Windows leg is the confirmation of record) |
| `depends_on` | a3-hook-contracts |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check` |

### P3 — claude-root (B2)

| Field | Content |
|---|---|
| `id` | p3-claude-root |
| `requirements` | REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005 |
| `files` | `scripts/plugins/clients/claude.mjs` (new), `test/ci/pluginPackages.claude.test.ts` (new) |
| `interfaces` | layout table (`pluginPathFor("claude", row)`): `.claude/agents/<id>.md` → `agents/<id>.md`; `.claude/commands/<id>.md` → `commands/<id>.md`; `.claude/skills/<dir>/…` → `skills/<dir>/…` (the native copy, which already includes the demoted rule-skills for claude); `.agents/skills/**` → `null` (claude does not read it); `.claude/rules/<id>.md` → `null` with reason `the Claude Code plugin manifest has no rules field; glob-scoped rules are written by stamity plugin setup into .claude/rules/`; `.claude/settings.json` → the `hooks` object alone is re-emitted as `hooks/hooks.json` (`{ "hooks": { … } }`, the plugin hooks schema), the `permissions` half is `null` (repository-owned); `.stamity/generated/hooks/claude/<file>.mjs` → `hooks/<file>.mjs`; policy document → `hooks/agent-tool-policies.json`; `CLAUDE.md`, `AGENTS.md`, `.mcp.json` → `null` (repository-owned: facts and gates; MCP server selection and credential references). Manifest `.claude-plugin/plugin.json`: `{ "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json", "name": "stamity", "version", "description", "author", "homepage", "repository", "license", "keywords", "agents": ["./agents/<id>.md", …], "commands": "./commands/", "skills": "./skills/", "hooks": "./hooks/hooks.json" }` (agents as a file list, per `scripts/generate-plugin-manifests.mjs` lines 32–46). `invocation`: `{ "commands": "/stamity:<id>", "agents": "stamity:<id>", "skills": "/stamity:<id>" }`. `clientFloor`: `2.1.224` (archive sources; `code.claude.com/docs/en/plugin-marketplaces`, accessed 2026-09-17); a `rollback` subcommand was quoted from one read of the CLI reference that day and absent from another, so the capability file records it as `not established` until file 3's V2 measures the installed client. `classes`: agent/skill/command/hooks `carried`; rule `repository-owned` (glob-less rules ride as skills — say so in the reason); mcp `repository-owned` |
| `testCriteria` | the generated root passes `claude plugin validate --strict ./claude` when `STAMITY_CLAUDE_BIN` is set (the test is `describe.skipIf` on the variable, the pattern of `test/ci/apmInstall.test.ts:527-544`) and always passes a schema check of `.claude-plugin/plugin.json` against the schemastore schema vendored as a test fixture; `hooks/hooks.json` parses, every `command` contains `${CLAUDE_PLUGIN_ROOT}/hooks/` and none contains `.stamity/generated`; `agents/` holds ten files whose ids equal the corpus agents' emitted ids; `commands/` holds the nine corpus commands plus `st-setup.md`; `skills/` holds every corpus skill plus the claude-demoted rule-skills and nothing else; no `rules/`, no `.mcp.json`, no `CLAUDE.md` in the root |
| `edgeCases` | a corpus agent with `tools:` excluding claude is absent from the root (selection replay keeps the exclusion); a hook row with a `matcher` keeps it; the review gate's two extension events are present as in the repository emission |
| `depends_on` | p2a-emitter-core |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### P4 — cursor-root (B2; parallel with P3, P5, P6)

| Field | Content |
|---|---|
| `id` | p4-cursor-root |
| `requirements` | REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005 |
| `files` | `scripts/plugins/clients/cursor.mjs` (new), `test/ci/pluginPackages.cursor.test.ts` (new) |
| `interfaces` | layout: `.cursor/rules/<id>.mdc` → `rules/<id>.mdc`; `.cursor/agents/<id>.md` → `agents/<id>.md`; `.cursor/skills/<dir>/…` (the command-as-skill surface, `CURSOR_COMMANDS_DIR`) → `commands/<dir>/…`; `.agents/skills/**` → `skills/**` (cursor reads the vendor-neutral tree, so the plugin carries it under its `skills` field); `.cursor/hooks.json` → `hooks/hooks.json` with commands rewritten to `${CURSOR_PLUGIN_ROOT}/hooks/<file>`; `.cursor/hooks/*.mjs` and `.stamity/generated/hooks/cursor/*.mjs` → `hooks/<file>`; `.cursor/mcp.json`, `AGENTS.md` → `null`. Manifest `.cursor-plugin/plugin.json`: `{ "name": "stamity", "version", "description", "author", "homepage", "repository", "license", "keywords", "logo": "assets/logo.svg", "rules": "./rules/", "agents": "./agents/", "commands": "./commands/", "skills": "./skills/", "hooks": "./hooks/hooks.json" }` with `assets/logo.svg` copied into the root. `invocation`: `{ "commands": "/<id>", "skills": "/<id>", "agents": "<id>" }` marked `citation: not stated on cursor.com/docs/reference/plugins (accessed 2026-09-17)` — file 3's V1 measures the real form and P4's follow-up fills the field from the measurement. `clientFloor`: `unknown` with reason `the reference page states no minimum version (accessed 2026-09-17)`. `classes`: rule/agent/command/skill/hooks `carried`; mcp `repository-owned`. Distribution route recorded in the root's README and the capability file's `distribution` note: an organization creates a team marketplace in the Cursor dashboard (`Dashboard → Plugins → Team Marketplaces → Add Marketplace`, `Import from Repo` for a GitHub repository, or `Add to Marketplace` per plugin), sets the install mode (`Default Off`, `Default On`, `Required`) and optionally restricts it to organization groups; Cursor re-indexes an imported repository at most every 10 minutes to its latest commit, so the version an organization serves is the commit its mirror branch points at (`cursor.com/docs/plugins`, accessed 2026-09-17); no submission to the public Cursor Marketplace is needed |
| `testCriteria` | every `rules/*.mdc` head carries `description`, `globs` (unquoted comma list, no spaces) and `alwaysApply: false` exactly as `test/adapters/cursor.test.ts` pins for the repository emission (byte-equal to the adapter's rendering for the same corpus); `hooks/hooks.json` events are a subset of `sessionStart, sessionEnd, afterFileEdit, beforeShellExecution` plus whatever the adapter emits today, and every command contains `${CURSOR_PLUGIN_ROOT}/hooks/`; `skills/` equals the `.agents/skills/` projection for a cursor-only selection; the root passes `agent --plugin-dir ./cursor -p "list the skills you can invoke"` when `STAMITY_CURSOR_BIN` is set (output contains `st-work`) |
| `edgeCases` | a rule with no globs stays a rule on cursor (the client pulls it on relevance); a fork `.customize.yaml` patch changes the `.mdc` head; the logo file missing from the checkout fails the run with the message of `scripts/generate-plugin-manifests.mjs` lines 176–184 |
| `depends_on` | p2a-emitter-core |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### P5 — copilot-root (B2; parallel)

| Field | Content |
|---|---|
| `id` | p5-copilot-root |
| `requirements` | REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005 |
| `files` | `scripts/plugins/clients/copilot.mjs` (new), `test/ci/pluginPackages.copilot.test.ts` (new), `.github/client-contracts.md` (one dated paragraph: the Copilot CLI plugin container, its marketplace discovery paths and the hooks file path as measured) |
| `interfaces` | spike step first (30 minutes, recorded in the unit's test file header): read `docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference` for the literal Agent Plugins 1.0 layout table and confirm the hooks path spelling (`com.github.copilot/hooks/hooks.json` is the inferred spelling from 2026-09-17; the legacy `hooks/hooks.json` is the documented fallback) — the unit ships whichever the page states verbatim and cites it. Layout (Agent Plugins 1.0): root `plugin.json` `{ "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", "name": "stamity", "version", "description", "author", "homepage", "repository", "license", "keywords" }`; `.github/agents/<id>.agent.md` → `com.github.copilot/agents/<id>.agent.md`; `.github/prompts/<id>.prompt.md` → `com.github.copilot/commands/<id>.prompt.md`; `.agents/skills/**` → `skills/**`; `.github/hooks/stamity.json` → `<hooks path from the spike>` with commands on `${PLUGIN_ROOT}/hooks/<file>`; hook scripts → `hooks/<file>`; `.github/instructions/*.instructions.md` → `null` with reason `the Copilot CLI container carries no instructions class; stamity plugin setup writes .github/instructions/ for VS Code and the CLI alike`; `.github/workflows/copilot-setup-steps.yml`, `.vscode/mcp.json`, `AGENTS.md` → `null`. `invocation`: `{ "commands": "/<id>", "skills": "<id> by name", "agents": "@<id>" }` with the same measurement caveat as P4. `clientFloor`: `unknown` (no version stated on the three pages read 2026-09-17), `prerequisites` adds `copilot: npm install -g @github/copilot` |
| `testCriteria` | root `plugin.json` validates against the Agent Plugins 1.0.0 schema (vendored fixture, `additionalProperties: false`); `skills/` matches the copilot native projection; every hook command contains `${PLUGIN_ROOT}/hooks/`; hook event names are the camelCase set of `docs.github.com/en/copilot/reference/hooks-reference` and the adapter's own mapping; when `STAMITY_COPILOT_BIN` is set, `copilot plugin install ./copilot` exits 0 and `copilot -p "list your available skills" -s` output contains `st-work` (a `describe.skipIf` leg) |
| `edgeCases` | Copilot in VS Code: the capability file's `classes.rule` reason names the repository-delivered `.github/instructions/` files and `docs/plugins.md` says VS Code has no container (file 2's C7 owns the page); a plugin name collision with a pre-existing `~/.copilot/installed-plugins/<marketplace>/stamity` is the client's own refusal, recorded in the README |
| `depends_on` | p2a-emitter-core |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### P6 — codex-root (B2; parallel; begins with the container spike)

| Field | Content |
|---|---|
| `id` | p6-codex-root |
| `requirements` | REQ-PLUGIN-001, REQ-PLUGIN-002, REQ-PLUGIN-005 |
| `files` | `scripts/plugins/clients/codex.mjs` (new), `test/ci/pluginPackages.codex.test.ts` (new), `.github/client-contracts.md` (one dated paragraph: the Codex plugin container as verified, the marketplace file paths, `PLUGIN_ROOT`, and what remained unstated), `docs/capability-matrix.md` via `src/emit/capabilityMatrix.ts` only if a revisit-trigger row must change (the `Agent Plugins scope expansion` row at line 263 says "No container is emitted"; it changes to name the emitted root — that edit belongs to file 2's C7, this unit only records the fact in the contracts file) |
| `interfaces` | spike (60 minutes, before any code): quote verbatim from `developers.openai.com/plugins/build/plugins`, `learn.chatgpt.com/docs/plugins` and the installed `codex --help` / `codex plugin --help` (a) the manifest field list, (b) whether `extensions.com.openai.hooks` takes a `hooks.json` path and its event names, (c) the hook process working directory, (d) install/pin/update/uninstall for a marketplace-sourced plugin, (e) the minimum codex version; record each as established or `not stated on <url>`. Layout (Agent Plugins 1.0): root `plugin.json` as in P5 plus `extensions.com.openai` when (b) is established; `.agents/skills/**` → `skills/**`; `.codex/agents/<id>.toml` → `null` with reason `the container carries no agent class; stamity plugin setup writes .codex/agents/`; commands → `null` (`the client documents no project-scoped command directory`, the existing adapter fallback wording at `src/adapters/codex.ts:371-378`); `.codex/hooks.json` → `hooks/hooks.json` under `${PLUGIN_ROOT}` only when (b) is established, else `hooks` is `repository-owned` with the spike's citation; `.codex/config.toml`, `AGENTS.md` → `null`. `invocation`: `{ "skills": "$<id>" }`. `clientFloor`: from (e) or `unknown`. Marketplace: `.agents/plugins/marketplace.json` at the distribution root with a relative `source.path: "codex"` (P8) |
| `testCriteria` | root `plugin.json` validates against the Agent Plugins 1.0.0 schema; `skills/` equals the codex native projection including the codex-demoted rule-skills; the capability file declares `agent`, `command` and `rule` as `repository-owned` with the reasons above and `hooks` per the spike; when `STAMITY_CODEX_BIN` is set, a fixture repository whose `.agents/plugins/marketplace.json` names `../dist/plugins/codex` runs `codex exec "list the skills available to you"` and the output contains `st-work` (a `describe.skipIf` leg; the learning says headless codex proves discovery, never hook enforcement — the test asserts nothing about hooks) |
| `edgeCases` | the spike finds no hook pointer: the unit ships without `hooks/`, the capability file says `hooks: repository-owned` with the URL and date, and `.stamity/inbox.md` gains one row naming the re-check trigger (the next codex minor); the spike finds a container field the schema forbids: it is not emitted and the reason is recorded |
| `depends_on` | p2a-emitter-core |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### P7 — runtime-bundle-and-locator (B1; parallel with P2a)

| Field | Content |
|---|---|
| `id` | p7-runtime-and-locator |
| `requirements` | REQ-PLUGIN-006, REQ-PLUGIN-007, REQ-PLUGIN-008 |
| `files` | `scripts/plugins/runtime.mjs` (new), `scripts/plugins/locate.mjs` (new; copied verbatim into every root as `runtime/locate.mjs`), `scripts/build-plugin-runtime.mjs` (new), `test/ci/pluginRuntime.test.ts` (new), `test/ci/pluginLocate.test.ts` (new) |
| `interfaces` | `node scripts/build-plugin-runtime.mjs --tarball <file.tgz> --out <dir>`: extracts the tarball's `package/` into `<dir>` (so `<dir>/package.json` and `<dir>/dist/` exist and `findPackageRoot` from `<dir>/dist/cli.js` resolves `<dir>`), then runs `npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund` inside `<dir>` against a `package-lock.json` copied from the repository (the lockfile is the source of truth; `--omit=optional` is what excludes `sigstore` after P1's move), then removes `<dir>/node_modules/.package-lock.json` and every `*.md`, `*.map`, `test/`, `docs/` entry under `node_modules` (a documented prune list in the script header), then writes `<dir>/RUNTIME.json` `{ "package", "version", "nodeFloor", "tarballSha256", "dependencies": { name: version } }`; exit 0/1/2 as the other scripts. `locate.mjs` (no imports beyond `node:fs`, `node:path`, `node:child_process`, `node:os`): usage `node locate.mjs [--print] [--project <dir>] [--companion <package>] -- <stamity args>`; `resolveProject()`: `--project` if given, else `STAMITY_REPO_ROOT` when it is an ancestor-or-equal of `cwd` (the bound of `src/hooks/scripts.ts:426-439`), else `cwd`; `findCompanion(projectDir, packageName, compatibleRange)`: walk up from `projectDir` to the first directory holding `package.json`, probe `node_modules/<packageName>/package.json`, accept when `satisfiesCaret(version, compatibleRange)` where `compatibleRange` is `^<plugin version>` read from `../stamity-plugin.json` (a minimal caret comparator: same major, `>=` minor.patch, prerelease refused); `bundled()`: `<dir of locate.mjs>/dist/cli.js`; `checkNode(floor)`: `process.versions.node` against the floor major.minor.patch from `<dir>/package.json` `engines.node`; `--print` writes `{ "project", "runtime": { "kind": "companion" \| "bundled", "path", "version" }, "node": { "version", "floor", "ok" } }` and exits 0/2; otherwise `spawnSync(process.execPath, [runtimePath, ...args], { cwd: project, stdio: "inherit" })` and exits with the child's status; refusals (exit 2): `stamity plugin: Node <found> is below the floor <floor>; install Node <floor> or newer (https://nodejs.org) and retry`, `stamity plugin: no runtime found — probed <companion path> and <bundled path>; reinstall the plugin`; it never consults `PATH` |
| `testCriteria` | a runtime built from `npm pack` of the checkout answers `node runtime/dist/cli.js --version` with the package version in an empty temp directory; `runtime/node_modules` contains `commander`, `p-limit`, `semver`, `yaml`, `proper-lockfile` and not `sigstore`; `scripts/leak-gate.mjs --include-build` run beside the runtime reports `0 hits` over more than 0 files (the `tarball-smoke.mjs` copy-in pattern, lines 48–118); the runtime's byte size is printed and asserted under 12 MiB (measured at the unit; the number is a declared budget, moved only with a reason); `locate.mjs --print` in a fixture with a companion at the plugin version reports `companion`, with the companion at the next major reports `bundled`, with no companion reports `bundled`; `--project /elsewhere` wins over cwd; a fake `process.versions.node` below the floor (injected through `STAMITY_LOCATE_NODE_VERSION`, test-only, documented) exits 2 with the floor message; a bundled `dist/cli.js` removed exits 2 naming both probed paths; `locate.mjs -- --version` prints the version through the resolved runtime; a `stamity` shim placed first on `PATH` is never executed (assert by making it exit 99) |
| `edgeCases` | Windows: `process.execPath` spawn with `shell: false` (the same posture as `portableRunner`), paths joined with `node:path`; a companion `package.json` that fails to parse is treated as absent with a warning on stderr; a project directory with no `package.json` anywhere above it has no companion and uses the bundled copy; a prerelease plugin version (`1.9.0-rc.1`) accepts only an equal companion |
| `depends_on` | p1-distribution-contract |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && npm pack --pack-destination /tmp && node scripts/build-plugin-runtime.mjs --tarball /tmp/zomarit-stamity-*.tgz --out /tmp/runtime` |

### P8 — distribution-root-and-catalogs (B2; after P1, P7; parallel with P3–P6)

| Field | Content |
|---|---|
| `id` | p8-distribution-root |
| `requirements` | REQ-PLUGIN-010, REQ-PLUGIN-011 |
| `files` | `scripts/plugins/catalogs.mjs` (new), `scripts/build-plugin-distribution.mjs` (new), `test/ci/pluginDistribution.test.ts` (new) |
| `interfaces` | `node scripts/build-plugin-distribution.mjs --out <dir> --runtime <dir from P7> [--source-commit <sha>] [--source-commit-date <iso>] [--distribution-commit <sha>]` runs `generate-plugin-packages.mjs` for the four clients into `<dir>/<client>/`, runs `generate-apm-package.mjs --out-dir <dir>` so the distribution root is also a complete APM package (`apm.yml` and `.apm/` from the same corpus and fork layer; an organization then mirrors ONE tree per version and points both its APM engine — `apm install <owner>/<mirror>#plugins/v<version>`, bumped by Renovate's native `apm` manager as proven on 2026-09-10 — and its plugin catalogs at the same tag), zips each root as `<dir>/stamity-plugin-<client>-<version>.zip` (deterministic: entries sorted, mtime fixed to the source commit date, via `node:zlib` plus a minimal zip writer in `scripts/plugins/zip.mjs` or the `archiver`-free approach the unit documents), writes `<archive>.sha256` files, writes `release.json` through `buildReleaseManifest` (`distribution.commit` is `null` unless `--distribution-commit` is passed; the manifest gains `apm: { manifest: "apm.yml", primitives: ".apm", installSpec: "<owner>/<repo>#plugins/v<version>" }` — P1's schema carries the field), writes the four catalog files and `<dir>/README.md`. `catalogs.mjs`: `renderClaudeMarketplace(identity, version, sourceCommit)` → `{ "name": "stamity", "owner": { "name", "url" }, "description", "version", "plugins": [{ "name": "stamity", "source": <by kind: git-subdir → { source: "git-subdir", url, path: "claude", ref: "plugins/v<version>" }; github → { source: "github", repo, ref }; archive → { source: "archive", url: <release asset url>, sha256 }; npm → the existing npm form>, "description", "version", "author", "homepage", "repository", "license", "keywords" }] }`; `renderCopilotMarketplace(...)` → `{ "name": "stamity", "owner": { "name", "email"? (omitted unless `stamity.distribution.ownerEmail` is set) }, "metadata": { "description", "version" }, "plugins": [{ "name": "stamity", "description", "version", "source": "./copilot" }] }`; `renderCursorMarketplace(...)` → `{ "name": "stamity", "plugins": [{ "name": "stamity", "source": "./cursor", "version" }] }` (the fields the reference page states; `pluginRoot` is not emitted because it was not established on 2026-09-17); `renderCodexMarketplace(...)` → `{ "name": "stamity", "plugins": [{ "name": "stamity", "version", "source": <by kind: the distribution-root default is `{ "source": "local", "path": "./codex" }`; `git-subdir` → `{ "source": "git-subdir", "url", "path": "./codex", "ref": "plugins/v<version>" }` (a `sha` selector is also documented); `npm` → `{ "source": "npm", "package", "version", "registry" }`> }] }` per `developers.openai.com/plugins/build/plugins` (accessed 2026-09-17: repo marketplace at `$REPO_ROOT/.agents/plugins/marketplace.json`, personal at `~/.agents/plugins/marketplace.json`, `.claude-plugin/marketplace.json` read for compatibility; an organization shares privately by publishing the plugin to its workspace, which needs admin access; public use goes through the vendor's submission portal, which this plan never requires) |
| `testCriteria` | `release.json` validates with `validateReleaseManifest` and each `packages[].sha256` equals `sha256sum` of the archive; two builds over one commit date produce identical archives (sha256 equal) and identical `release.json`; the Claude marketplace entry's `source` is the git-subdir object with `ref: "plugins/v<version>"` by default and switches whole when `stamity.distribution.sources.claude.kind` is `archive`; the Copilot marketplace carries `owner`, `metadata.version` and a relative `source`; no catalog file or archive contains a string matching the leak gate's credential shapes (run the gate over `<dir>`); the distribution README names each client's install, pin, update and rollback command and the APM install spec; `node scripts/generate-apm-package.mjs --check --out-dir <dir>` exits 0 on the built tree; with `STAMITY_APM_BIN` set, `scripts/apm-install-smoke.mjs --source <dir> --targets claude,copilot,cursor,codex` passes against the distribution tree exactly as it does against the checkout (a `describe.skipIf` leg beside the existing one in `test/ci/apmInstall.test.ts`) |
| `edgeCases` | `--distribution-commit` given: `release.json` carries it and the Claude entry additionally carries `sha`; a client excluded by `--client` still gets no catalog entry rather than an entry pointing at a missing root; a version with a prerelease suffix renders the tag `plugins/v1.9.0-rc.1` and the tag regex in `renovate/plugins.json` does not match it (documented as intended: Renovate proposes releases only) |
| `depends_on` | p1-distribution-contract, p7-runtime-and-locator, p3-claude-root, p4-cursor-root, p5-copilot-root, p6-codex-root |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/build-plugin-distribution.mjs --out /tmp/dist-plugins --runtime /tmp/runtime` |

### P9 — release-workflow-distribution (B3; after P8)

| Field | Content |
|---|---|
| `id` | p9-release-workflow |
| `requirements` | REQ-PLUGIN-012 |
| `files` | `.github/workflows/release.yml`, `.github/release-egress.md`, `.github/release-controls-checklist.md` (one paragraph: the `plugins/v*` tag namespace is outside the `v*` ruleset by construction, and the `plugin-dist` branch needs a branch rule allowing the workflow's token to push), `test/ci/workflow.test.ts`, `test/ci/repoHygiene.test.ts` (only if it enumerates workflow jobs), `docs/enterprise-forks.md` (one section: building a private distribution with `scripts/build-plugin-distribution.mjs` and pushing it to the fork's own branch — the page's re-open trigger names workflow job changes) |
| `interfaces` | gates job, after `Tarball smoke`: step `Build plugin runtime` (`node scripts/build-plugin-runtime.mjs --tarball "$TARBALL" --out plugin-runtime`), step `Build plugin distribution` (`node scripts/build-plugin-distribution.mjs --out dist/plugins --runtime plugin-runtime --source-commit "$GITHUB_SHA" --source-commit-date "$(git show -s --format=%cI "$GITHUB_SHA")"`), step `Upload plugin distribution` (artifact `release-plugins`, path `dist/plugins`, retention 7 days, `if-no-files-found: error`); outputs `plugins_manifest_sha256`. publish job, after `Publish to npm with provenance`: step `Download plugin distribution` (artifact `release-plugins` into `plugins/`), step `Verify plugin distribution digest` (sha256 of `release.json` against the gates output, fail closed on mismatch), step `Attest plugin archives` (`actions/attest-build-provenance` pinned by sha, `subject-path: plugins/*.zip`, permissions add `attestations: write` beside the existing `id-token: write`), step `Push plugin distribution` (`git init` in `plugins/`, `git checkout --orphan plugin-dist`, commit with author `github-actions[bot]`, message `plugins: v$VERSION from $GITHUB_SHA`, push `HEAD:refs/heads/plugin-dist --force-with-lease`? — no: push `HEAD:refs/heads/plugin-dist` and `refs/tags/plugins/v$VERSION` with `GITHUB_TOKEN`, permissions `contents: write` which the job already needs for `gh release create`; then re-render `release.json` with `--distribution-commit "$(git rev-parse HEAD)"` into the release assets only, so the branch's own copy carries `null` and the asset carries the sha), step `Create GitHub release` gains `plugins/*.zip plugins/*.sha256 plugins/release.json` in `$ASSETS`; the `dry-run-summary` job prints the branch, tag and archive names. Egress: `github.com` is already in the allowlist for `gh release create`; the attestation endpoints are read from the action's documentation and added to `release-egress.md` with the rehearsal evidence; `harden-runner` policy stays `block` |
| `testCriteria` | `test/ci/workflow.test.ts` gains assertions that: the gates job builds the runtime and the distribution after the tarball smoke and uploads `release-plugins`; the publish job downloads it, verifies its digest on the outputs channel, attests, pushes the branch and the tag after the npm publish, and attaches the archives, checksums and manifest; the dry-run job names the branch and tag; the canonical-repository guard is unchanged on every publishing job; a workflow-dispatch rehearsal (`dry_run: true`) on `main` completes green with the summary naming `plugin-dist` and `plugins/v1.9.0` and pushing nothing (evidence: the run URL in the run record) |
| `edgeCases` | the branch already carries a commit (second release): the orphan commit replaces the branch head (`--force` on the branch push is the intended behaviour and is documented; the tags keep every prior release reachable); a re-run of the publish job after a partial failure: the tag push is idempotent when the tag already points at the same commit and fails closed otherwise; a fork with the canonical guard false never reaches the push step |
| `depends_on` | p8-distribution-root |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && gh workflow run release.yml --ref main -f dry_run=true` (rehearsal, then read the summary) |

## Risks

- **Critical (from the audit, closed by A3 before any root is built):** the emitted Cursor guards
  allow by silence while the vendor's current `failClosed` wording counts no output as a failure;
  an explicit allow is correct under either reading, so A3 emits it and file 3's V1 measures the
  client. The upstream-lane recovery schema (A1) is the other Critical; the fork route the
  enterprise will use is not proved (V4) until A1 and A2 have landed.
- **Critical (mitigated, not blocking):** the release workflow's push and attestation steps touch
  the egress allowlist and the publishing credential path. Mitigation: P9 runs the dry-run
  rehearsal before the tag, `release-egress.md` records the observed endpoints, and the
  `plugins/v*` namespace is verified against the `v*` ruleset in the checklist paragraph.
- **Warning:** Claude Code namespaces plugin commands (`/stamity:st-work`), so corpus prose that
  says `/st-work` may not resolve inside the plugin. Mitigation: the capability file declares the
  invocation forms, file 3's V1 measures the bare form, and a corpus follow-up (client-neutral
  cross-references) is queued in `.stamity/inbox.md` pending that measurement.
- **Warning:** Cursor's install sources, pinning and rollback, and the Copilot CLI's minimum
  version and Agent Plugins hooks path were not established from the vendor pages on 2026-09-17.
  Mitigation: P4, P5 and P6 open with a quoting spike; every unestablished fact ships as
  `unknown` with the URL and date, never as a guess.
- **Warning:** moving `sigstore` to `optionalDependencies` changes the runtime's dependency
  posture. Mitigation: P1 runs the verifier's unarmed-path tests; the npm route installs optional
  dependencies by default, so `stamity add` of a signed pack is unchanged there.
- **Warning:** `dist/` runs only with its dependencies beside it; the bundled runtime is ~4 MiB
  per root with the prune list applied. Mitigation: P7 declares a 12 MiB budget per root and the
  size is printed by the build.
- **Warning:** the local gate is weaker than CI (learning): P2b touches emitted hook bytes and
  path composition; the Windows leg is the confirmation of record and a CI round-trip is budgeted.
- **Minor:** `sourceCommitDate` fixes zip mtimes, so archives are reproducible only per commit;
  a rebuild of a tag from a different checkout of the same commit is identical by construction.

## Open questions

None carried. Every decision the maintainer took on 2026-09-17 is applied as written; the assumed
dimension defaults are recorded in Context and are re-stated in the run record.
