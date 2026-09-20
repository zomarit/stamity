---
id: plugin-lifecycle-02
intent: feature
stamp: ec6668d7e81fb9425f2c0838c949f560373e1166 2026-09-17
reads: [AGENTS.md, src/types/manifest.ts, src/manifest/manifest.ts, src/manifest/ledger.ts, src/types/content.ts, src/types/core.ts, src/types/markers.ts, src/roster/modelLadder.ts, src/cli.ts, src/cli/kit/program.ts, src/cli/commands/init.ts, src/cli/commands/init/plan.ts, src/cli/commands/init/apply.ts, src/cli/commands/sync.ts, src/cli/commands/sync/engine.ts, src/cli/commands/sync/report.ts, src/cli/commands/check.ts, src/cli/commands/clean.ts, src/cli/commands/config.ts, src/cli/commands/workspace.ts, src/cli/docs/cliReference.ts, src/cli/docs/configReference.ts, src/cli/docs/llmsIndex.ts, src/cli/notice/updateNotice.ts, src/composition/root.ts, src/emit/planner.ts, src/emit/agentsMd.ts, src/emit/hooksInfra.ts, src/emit/skillsProjection.ts, src/emit/substitution.ts, src/emit/capabilityMatrix.ts, src/detect/verificationGates.ts, src/detect/repoAnalyzer.ts, src/migration/detect.ts, src/migration/carry.ts, src/content/userContent.ts, src/hooks/userHooks.ts, src/adapters/claude.ts, src/adapters/cursor.ts, src/adapters/copilot.ts, src/adapters/codex.ts, src/adapters/registry.ts, test/cli/surface.e2e.test.ts, test/architecture/boundaries.test.ts, test/docsPages.test.ts, test/composition/root.test.ts, test/cli/docs/cliReference.test.ts, test/emit/capabilityMatrix.test.ts, docs/getting-started.md, docs/troubleshooting.md, docs/configuration.md, docs/cli-reference.md, docs/capability-matrix.md, README.md, CONTRIBUTING.md, website/sidebars.ts, llms.txt, .stamity/learnings, .stamity/inbox.md]
depends_on: [docs/plans/008-plugin-lifecycle-01.md]
---

# Plugin-backed distribution lifecycle — file 2 of 3: setup mode, effort scale, documentation

intent chosen: feature because net-new capabilities are named (a plugin-backed setup mode, an
explicit setup verb, the effort scale) — the same routing as file 1, restated so this file stands alone.
File 1 (`docs/plans/008-plugin-lifecycle-01.md`) produces the plugin roots, the bundled runtime,
the locator, the catalogs, `release.json` and the release workflow; this file makes a consuming
repository able to run on those roots and read about them. File 3 proves the
lifecycle per client.

## Context

A repository that installs a Stamity plugin today still has to run `stamity init`, which writes
every component class into the repository — so agents, skills, commands and hooks would exist twice,
once in the plugin and once on disk. This file adds the ownership boundary: a manifest that records
plugin-backed mode per client, emission that skips the classes the plugin owns, `check` rows that
see the runtime and duplicates, `clean` that stays on its side, a `stamity plugin` verb with
`status` and `setup`, explicit gate configuration so no charter carries an unusable
placeholder, and the documentation with every pinned surface. The maintainer's decisions of
2026-09-17 bind here as in file 1: facts, uncarriable rules, MCP documents and state stay in the
repository; one new verb; charter-reference tokens in plugin bodies.

Three readings the spec author could not settle from the decisions, resolved by this plan:
(a) `plugin setup` on a repository that already has a generated setup writes nothing and exits 1
naming `stamity clean -y` followed by `stamity plugin setup`; (b) the `plugin-duplicates` doctor row is `warn` while the
manifest still says `mode: "generated"` (coexistence is the expected state before the operator cleans
and must not break a consumer's CI) and `fail` once the manifest records `plugin-backed` for the
duplicated client (a duplicate after setup is a defect); (c) `clean` prints one uninstall
command line per client recorded in `plugin.clients`, in `TOOLS` order.

Shared intake, read inline, is file 1's; the learnings that bind this file are the surface pins
(a verb moves seven literals), the local gate weaker than CI (coverage floors and the Windows
leg), and the dogfood sync (any corpus or hook-body change regenerates the tracked trees).
Research findings that shaped this file: the ledger owner vocabulary (`Tool | pack:<id>`) is
deliberately closed and reclaim excludes pack rows by construction — this plan adds no third owner
kind, it records plugin ownership in the manifest and stops emitting the owned classes, so reclaim
and drift stay one mechanism; `stamity config detect` is the only way to correct a detected fact
today and no key sets a verification command; the predecessor migration's detect → offer →
carry pattern was the analog for a migration engine the maintainer cut on 2026-09-17 (the
consuming enterprise sets its repositories up fresh; `stamity clean -y` then `plugin setup` is the
documented route for a repository with a generated setup, and it keeps learnings, handoffs,
overrides and user hooks because none of them is a ledger row); the update notice writes only its cache stamp and
session-start hooks are read-only, which is the guarantee REQ-PLUGIN-019 carries forward.

Dimension defaults assumed (recorded, not asked): `plugin setup` reuses `applyInit` with a
manifest whose `plugin` field is set, so the two-prompt budget and the `-y` rule are init's own;
`stamity plugin` is advertised (not a plumbing
verb) and sits after `worktree` and before `clean` in help order; the README's `## Commands`
list grows to ten verbs and the guide count to eleven; `docs/plugins.md` sits in the sidebar's
`Start here` category after `working-with-stamity`.

One rider the maintainer added to the package on 2026-09-17: the effort ladder widens from the
three-level band (`low, medium, high`) to the clients' documented scales, because the deep-review
class could not ask for more than `high` on any client although Claude Code documents `xhigh` and
`max` and Codex documents `xhigh` (vendor pages read 2026-09-17). Decided with the maintainer:
add `xhigh` and `max`, and `minimal` since it is on Codex's documented scale; refuse a level at
`stamity config set` when a selected client cannot express it; emit the client's nearest
expressible level with a disclosure when a narrower client joins later; class defaults unchanged
(`frontier` stays `high`), so no golden, dogfood tree or eval baseline moves. Unit C9 carries it.

A second rider of 2026-09-17, a cut: the consuming enterprise will re-create its private fork
fresh on 1.9.0 and set its repositories up fresh, so the CLI-to-plugin migration engine (preview,
hash-verified removals, conflict refusal) and the coexistence suite are not in this package. The
ownership boundary, the idempotent setup and duplicate detection stay, because the plugin route
cannot work without them. The documented route for a repository that already has a generated
setup is `stamity clean -y` followed by `stamity plugin setup`; an inbox row of 2026-09-17 holds the
migration for a later minor.

Out of scope for this file: any change to the four adapters' rendering (file 1's P2b owns the
hook-command root); the proofs (file 3); a managed-settings or admin-console story for any client;
a `stamity update` verb (the client's own update and rollback commands are the update path);
moving a class's default effort (a separate decision after a measurement); the migration engine
and the coexistence suite (cut, see above).

## Spec delta

Stated against `docs/specs/plugin-lifecycle.md` (`status: design`; file 1 states the
allocation). This file ADDS REQ-PLUGIN-013–017, REQ-PLUGIN-019, REQ-PLUGIN-024 and REQ-PLUGIN-026, and it ADDS
REQ-LADDER-001 stated against `docs/specs/model-ladder.md` (`status: design`, one requirement,
written on 2026-09-17 beside the plugin spec). No existing requirement is modified or
retired.

### REQ-PLUGIN-013 Pinning, refresh, rollback and repository-state compatibility

Given a consumer pinned to `plugins/v<A>`, When it installs at A, refreshes to `plugins/v<B>` and
pins back to A through the client's own commands as `docs/plugins.md` states them, Then the
installed tree at each A install has an identical per-file sha-256 listing, the B install differs
only in the paths B changed, and no step deletes a repository-owned file; a repository whose
`.stamity` state was written under A stays readable under B — `stamity check` exits 0,
`stamity plugin status --json` reports `compatibility.state: "compatible"` when the plugin major
equals the manifest's `generatedBy` major and `"mismatch"` with the two versions otherwise — and
0 ledger rows are rewritten by the read.

### REQ-PLUGIN-014 Manifest records plugin-backed mode additively

Given the manifest schema, When the plugin fields are added, Then `MANIFEST_VERSION` is unchanged,
an optional `plugin` object accepts `mode` of exactly `generated` or `plugin-backed` plus an
optional `clients` map from tool to `{ version, classes }` where `classes` is a subset of
`agent, skill, command, rule, hooks`, an optional `gates` object accepts `test`, `lint`,
`typecheck` and `all` as non-empty single-line command strings, every manifest fixture written
before the fields existed parses unchanged and round-trips without gaining a key, and a manifest
carrying an unknown key under `plugin` or `gates` is refused naming the key.

### REQ-PLUGIN-015 Plugin setup writes repository-owned files only, idempotently

Given a repository with a plugin root available and no generated setup, When
`stamity plugin setup --client claude --plugin-root <root> -y` runs, Then it exits 0 having
written only repository-owned paths — `AGENTS.md`, `CLAUDE.md`, `.claude/rules/*` for glob-scoped
rules, `.claude/settings.json` without a `hooks` object, MCP documents when servers are selected,
and `.stamity/` state — and 0 files of a class the root's `stamity-plugin.json` declares
`carried`; a second identical invocation exits 0 and reports 0 changed paths with every
previously written file's sha-256 unchanged; when a generated setup is already present it writes
0 files, exits 1 and names `stamity clean -y` followed by `stamity plugin setup`; an unreadable `--plugin-root` exits 1 naming
the path; and without `--plugin-root` the root is read from `CLAUDE_PLUGIN_ROOT`,
`CURSOR_PLUGIN_ROOT` or `PLUGIN_ROOT`, refusing with exit 1 when none is set.

### REQ-PLUGIN-016 sync, check and clean honor the ownership boundary

Given a manifest recording `plugin.mode: "plugin-backed"` with `clients.claude.classes` of
`agent, skill, command, hooks`, When `stamity sync` runs, Then it writes 0 files under
`.claude/agents`, `.claude/skills`, `.claude/commands` and `.stamity/generated/hooks/claude`, the
`hooks` object is absent from `.claude/settings.json`, glob-scoped rules under `.claude/rules` are
still written, and the report prints one `plugin-owned` line per client naming the classes; When
`stamity check` runs, Then it prints the doctor rows `plugin-runtime` (the locator's resolved kind,
path and version, or `warn` with `no plugin root in the environment` when no root variable is set)
and `plugin-duplicates` (see REQ-PLUGIN-019); and When `stamity clean -y` runs, Then it removes only
ledger rows, removes 0 files inside any plugin root, and prints one uninstall command line per
client recorded in `plugin.clients`.

### REQ-PLUGIN-017 Explicit facts and gates replace placeholders

Given `stamity config set gates.test "npm run test:unit"`, When the charter is rendered, Then its
`Verification gates` section carries that exact string for the Tests row, the other rows carry the
detected commands, and `${STAMITY:VERIFY_GATE_ALL}` renders from the configured `all` when set and
from the detected composition otherwise; Given a fact detection could not determine, When
`stamity plugin status` runs, Then it lists that fact as `unconfigured` with the exact
`stamity config` command that sets it, and the rendered charter still carries the literal
`unknown` for it rather than an invented value; and the rendered file contains 0 occurrences of
`${STAMITY:`.

### REQ-PLUGIN-019 Coexistence is detected and nothing is rewritten silently

Given a repository where a generated file, an APM-deployed file or a hand-placed file and an
installed plugin carry the same class for one client, When `stamity check` runs, Then the
`plugin-duplicates` row names each duplicated class with its path, its source (`ledger`, `apm` or
`unmanaged`) and the remedy for that source (`stamity clean -y` then `plugin setup`, the APM dependency to remove, or
the file to remove or keep as an override), its status is `warn` (exit 0) while the manifest says
`mode: "generated"` and `fail` (exit 1) once the manifest records `plugin-backed` for that client;
`stamity plugin status --json` carries `coexistence: true` with the same list; and across
`status`, `check`, `setup` (refused) and a session-start hook run, the sha-256 of every generated
file and every file under the plugin root is unchanged, so removal happens only through the
operator's own `stamity clean -y`.

### REQ-PLUGIN-024 Documentation and pinned surfaces

Given the shipped documentation, When `docs/plugins.md` is read, Then it names the install
command for each of the four clients, the pin, update and rollback commands per client, the
ownership split, the `stamity plugin` subcommands, the Renovate presets and the private-mirror
route, with every command block copied from an executed run; the README's `## Commands` list, the
getting-started page's verb list and the CLI reference name `plugin`; the capability matrix
carries a `Plugin containers` section rendered from data; `llms.txt`, the sidebar and the README
map carry the new guide; and `test/docsPages.test.ts` exits 0 with its arrays and count words
moved in the same change.

### REQ-PLUGIN-026 Existing routes unchanged

Given the repository at the change's head, When the existing surfaces are compared with their
pre-change bytes, Then `init`, `sync`, `check` and `clean` on a manifest without a `plugin` field
produce byte-identical output trees (the cross-client golden snapshot is unchanged without `-u`),
`node scripts/generate-apm-package.mjs --check` and `node scripts/generate-plugin-manifests.mjs --check`
exit 0 on the committed files, every existing command name and public JavaScript import
resolves unchanged, and the full gate exits 0.

### REQ-LADDER-001 Effort levels widen to the clients' documented scales

Given `EFFORT_LEVELS` of `minimal, low, medium, high, xhigh, max` in that order and a per-client
scale on every projection row (Claude `low … max`, Codex `minimal … xhigh`, Cursor the whole list
as a pass-through, Copilot none), When `stamity config set effort.frontier xhigh` runs on a
manifest selecting `claude` and `codex`, Then the key is written and the emitted Claude agents of
that class carry `effort: xhigh` and `.codex/config.toml` carries `model_reasoning_effort = "xhigh"`;
When `stamity config set effort.frontier max` runs on a manifest selecting `codex`, Then it exits
1 with `VALIDATION_ERROR` naming `codex`, its top level `xhigh` and the two remedies (pick `xhigh`
or lower, or deselect the client) and writes nothing; When a manifest already carrying `effort.frontier: max` gains
`codex` through `config set tools`, Then the next `sync` emits `xhigh` for that class on Codex and
prints one disclosure line naming the class, the requested level and the emitted level; and When
no `effort.*` key is set, Then every emitted file is byte-identical to the 1.8.0 emission
(the cross-client golden snapshot is unchanged without `-u`).

## Units

Batches: C1 first; C2, C3, C6 in parallel after C1; C4 and C9 after C2, C3, C6 (C9 owns no
file C4 touches); C7 last, after C4 and C9. The migration engine and the coexistence suite that
were planned here earlier on 2026-09-17 were cut the same day (see Context); their
non-mutation assertion lives in C3. Every `verify` is the charter
gate plus the coverage flag CI enforces; C2 and C3 add the dogfood sync because they can move
emitted bytes only when a `plugin` or `gates` field is set — the committed dogfood manifest sets
neither, so its tree must not move. Contract census before dispatch (invariant 6):
`SetupManifest` and `MANIFEST_FIELD_ORDER` (C1 only), `KEY_SPECS` (C2 only), `DoctorCheck` ids and
the troubleshooting guide's doctor table (C3 only), `COMMANDS` and the seven verb pins (C4 only),
`EngineRegistry` (amended 2026-09-20: C6 adds the `plugins` group holding `capabilityFile` ALONE —
the setup engine and `status` are CLI-layer modules, see C6 and C4).

### C1 — manifest-plugin-fields (B0)

| Field | Content |
|---|---|
| `id` | c1-manifest-fields |
| `requirements` | REQ-PLUGIN-014 |
| `files` | `src/types/manifest.ts`, `src/manifest/manifest.ts`, `src/index.ts` (type exports), `test/manifest/manifest.test.ts` |
| `interfaces` | `export type InstallMode = "generated" \| "plugin-backed"; export const INSTALL_MODES: readonly InstallMode[] = ["generated", "plugin-backed"]; export const INSTALL_MODE_DEFAULT: InstallMode = "generated"; export type PluginOwnedClass = ContentClass \| "hooks"; export const PLUGIN_OWNED_CLASSES: readonly PluginOwnedClass[] = ["agent", "skill", "command", "rule", "hooks"]; export interface PluginClientRecord { version: string; classes: readonly PluginOwnedClass[] } export interface PluginConfig { mode: InstallMode; clients?: Partial<Record<Tool, PluginClientRecord>> } export interface GatesConfig { test?: string; lint?: string; typecheck?: string; all?: string }`; `SetupManifest` gains `plugin?: PluginConfig` and `gates?: GatesConfig` (both documented on the `ModelConfig` precedent: additive, optional, no `MANIFEST_VERSION` bump); `MANIFEST_FIELD_ORDER` gains `plugin: true` after `models` and `gates: true` after `plugin`; `collectManifestErrors` gains `collectPluginErrors` (mode membership, tool membership via `VALID_TOOLS`, `version` a non-empty semver by `semver.valid`, `classes` a non-empty subset of `PLUGIN_OWNED_CLASSES` with no duplicates, unknown keys refused by name) and `collectGatesErrors` (each value a non-empty single-line string ≤ 512 characters, unknown keys refused); readers `export function readInstallMode(manifest: SetupManifest \| null \| undefined): InstallMode` and `export function pluginOwnedClasses(manifest: SetupManifest \| null \| undefined, tool: Tool): ReadonlySet<PluginOwnedClass>` (empty unless `mode` is `plugin-backed` and the tool has a record) and `export function readGates(manifest: SetupManifest \| null \| undefined): GatesConfig` (`{}` when absent); `extractPreservedManifestFields` carries both fields across a regeneration |
| `testCriteria` | every existing manifest fixture parses unchanged and `writeManifest` round-trips it without a `plugin` or `gates` key; a manifest with `plugin: { mode: "plugin-backed", clients: { claude: { version: "1.9.0", classes: ["agent", "skill", "command", "hooks"] } } }` validates and `pluginOwnedClasses(m, "claude")` is that set while `pluginOwnedClasses(m, "cursor")` is empty; `mode: "other"`, `classes: []`, `classes: ["agent", "agent"]`, `clients: { vim: … }`, `gates: { test: "" }`, `gates: { deploy: "x" }` each produce one error naming the key; `readInstallMode(null)` is `generated`; the serialized key order places `plugin` and `gates` after `models` |
| `edgeCases` | `plugin.mode: "generated"` with a `clients` map is legal (a repository can record roots it knows about before migrating) and `pluginOwnedClasses` still returns empty; a `gates.all` set without `gates.test` leaves the Tests row to detection |
| `depends_on` | none |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### C2 — gates-config-and-charter (B1)

| Field | Content |
|---|---|
| `id` | c2-gates-config |
| `requirements` | REQ-PLUGIN-017 |
| `files` | `src/cli/commands/config.ts`, `src/detect/verificationGates.ts`, `src/emit/agentsMd.ts`, `src/emit/skillsProjection.ts` (the `verificationGatesFor` call site only), `src/cli/docs/configReference.ts` (only if the key table needs a new column; the page renders from `KEY_SPECS`), `docs/configuration.md` (regenerated), `test/cli/commands/config.test.ts`, `test/detect/verificationGates.test.ts`, `test/emit/agentsMd.test.ts` |
| `interfaces` | `KEY_SPECS` gains four rows `gates.test`, `gates.lint`, `gates.typecheck`, `gates.all` with `hint: "a shell command line, or `none` to clear"`, `read: (m) => m.gates?.<k> ?? null`, `resolve: (m) => m.gates?.<k> ?? "detected: <the detected command or unknown>"`, `apply: (draft, raw) => { if (raw === "none") delete draft.gates?.<k>; else (draft.gates ??= {})[k] = raw }`; `verificationGatesFor(detected, configured?: GatesConfig): VerificationGateSet` — a configured entry wins over detection per key; `all` composes as today from the (possibly configured) three when `configured.all` is absent; `verificationGatesFromManifest(manifest)` passes `readGates(manifest)`; the charter's `Verification gates` rows render the resulting set unchanged in shape; `stamity config list` prints the four keys with `detected:` prefixes for unset ones |
| `testCriteria` | `config set gates.test "npm run test:unit"` writes the key and `config get gates.test` prints it; `config set gates.test none` removes it; the rendered `AGENTS.md` for a manifest with `gates.test` set carries `- Tests: \`npm run test:unit\`` and the detected Lint row; with nothing configured the golden snapshot is byte-identical; `config set gates.lint ""` exits 1 with `VALIDATION_ERROR` naming the key; a two-line value, a value over 512 characters, and a value carrying a backtick or the `${STAMITY:` prefix each exit 1 the same way (amended 2026-09-20 from exit 64: `src/types/errors.ts` retired the sysexits translation and every failure exits 1 with the kind in `error.code`) |
| `edgeCases` | a configured gate on a repository where detection found `unknown` replaces the `unknown` sentinel; `config detect` never clears a configured gate; `${STAMITY:VERIFY_GATE_ALL}` with a configured `test` and detected `lint`/`typecheck` composes all three |
| `depends_on` | c1-manifest-fields |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-docs.mjs && git diff --exit-code docs/configuration.md llms.txt` |

### C3 — ownership-in-emission-and-doctor (B1; parallel with C2, C6)

| Field | Content |
|---|---|
| `id` | c3-ownership-boundary |
| `requirements` | REQ-PLUGIN-016, REQ-PLUGIN-019, REQ-PLUGIN-013, REQ-PLUGIN-026 |
| `files` | `src/emit/ownership.ts` (new), `src/emit/planner.ts` (core skips), `src/emit/hooksInfra.ts` (script rows for plugin-owned hooks), `src/adapters/claude.ts`, `src/adapters/cursor.ts`, `src/adapters/copilot.ts`, `src/adapters/codex.ts` (each `planResidue` skips plugin-owned classes; claude's `buildSettingsJson` omits `hooks` when hooks are plugin-owned), `src/cli/commands/check.ts` (two doctor rows), `src/cli/commands/clean.ts` (uninstall lines), `src/cli/commands/sync/report.ts` (the `plugin-owned` line), `docs/troubleshooting.md` (the doctor table gains two rows; the "Only three rows can fail" sentence becomes four — `plugin-duplicates` can fail), `test/emit/ownership.test.ts` (new), `test/emit/planner.test.ts`, `test/adapters/{claude,cursor,copilot,codex}.test.ts`, `test/cli/commands/check.test.ts`, `test/cli/commands/clean.test.ts`, `test/docsPages.test.ts` (the doctor-id census at lines 1717–1739 reads the ids from `check.ts`; the guide must list both new ids — this unit owns the guide edit, C7 owns nothing in `troubleshooting.md`) |
| `interfaces` | `ownership.ts`: `export function isPluginOwned(manifest: SetupManifest, tool: Tool, cls: PluginOwnedClass): boolean` (delegates to `pluginOwnedClasses`); `export function sharedProjectionOwners(manifest: SetupManifest, readers: readonly Tool[]): Tool[]` — the selected readers of `.agents/skills/` that still own `skill` in generated mode; the core skills projection is emitted when that list is non-empty and co-owned by exactly those tools; `export function pluginOwnedSummary(manifest: SetupManifest): { tool: Tool; classes: PluginOwnedClass[] }[]` for the sync report and the panel. Adapters: each `planResidue` filters its rows by `!isPluginOwned(ctx.manifest, TOOL, rowClass)` where `rowClass` is the row's `owner.artifactType` (`infra` rows for hook scripts and hook config map to `hooks`; the claude settings file is split: the `permissions` half always emits, the `hooks` object only when hooks are not plugin-owned); the native skill copies (claude `.claude/skills`, and every `nativeSkillRows` call) are skipped when `skill` is plugin-owned for that tool. `check.ts`: `plugin-runtime` — `pass` with `runtime <kind> <version> at <path>` when a root variable is set and `<root>/runtime/locate.mjs --print` exits 0 (spawned with `process.execPath`, 5 s timeout), `pass` with its note when the manifest records no plugin client and no root variable is set (amended 2026-09-20: a repository using no plugin has nothing to act on, and the unconditional `warn` printed an advisory on every run of this repository's own check), `warn` `no plugin root in the environment; run this check through the plugin's st-setup or set CLAUDE_PLUGIN_ROOT` when a client is recorded and no root is found, `fail` when the locator exits 2 (its message quoted) or when `readInstallMode` is `plugin-backed` and the runtime's major differs from the manifest's `generatedBy` major; `plugin-duplicates` — for each tool in `plugin.clients`, three sources of duplicates of the classes that client's record lists: `ledger` (rows whose `artifactType`, hook rows as `hooks`, is in `classes`), `apm` (the repository's `apm.yml` declares a dependency whose name or spec contains the plugin's package id — an APM deployment writes the same agents, skills and commands into the client directories without a ledger row), and `unmanaged` (files under that client's native directories — `.claude/agents`, `.claude/commands`, `.claude/skills`, `.cursor/agents`, `.cursor/rules`, `.github/agents`, `.github/prompts`, `.codex/agents`, `.agents/skills` — whose emitted id is one the plugin carries, read through the existing `emittedIdFor` spelling, and which no ledger row owns); `pass` `no duplicated classes` when all three are empty, `warn` when any is non-empty and `mode` is `generated`, `fail` when any is non-empty and `mode` is `plugin-backed`; detail lists `<tool>: <class> (<n> file(s), <source>) — <remedy>` with the remedy per source: ledger → `stamity clean -y` then `stamity plugin setup --client <tool>`, apm → `the APM dependency <name> deploys the same classes; remove it from apm.yml and run apm install, or keep the plugin uninstalled`, unmanaged → `not written by this engine; remove the file or keep it as an override under .stamity/overrides/`; `check --json` carries both rows. No verb deletes a duplicate; every remedy is the operator's own step. `clean.ts`: after the sweep, one line per `plugin.clients` entry in `TOOLS` order: `claude: claude plugin uninstall stamity@<marketplace or "your marketplace">`, `cursor: uninstall the stamity plugin from Cursor's Customize view`, `copilot: copilot plugin uninstall stamity`, `codex: codex plugin remove stamity@<your marketplace>` (amended 2026-09-20 from the `/plugins` view wording: `codex --help` on 0.154.0 documents `codex plugin remove`; cursor still has no CLI form established); `sync/report.ts`: `plugin-owned  claude: agent, skill, command, hooks` lines from `pluginOwnedSummary` |
| `testCriteria` | with no `plugin` field every adapter test, the planner test and the cross-client golden are byte-identical (no `-u`); with claude plugin-backed for `agent, skill, command, hooks`: the claude residue has no rows under `.claude/agents`, `.claude/skills`, `.claude/commands`, no hook script rows, `.claude/settings.json` parses to `{ permissions: { allow: [...] } }` with no `hooks` key, and `.claude/rules/*` rows are present; with all four tools plugin-backed for `skill` the core plan has no `.agents/skills` rows, with codex generated it has them co-owned by codex alone; `check` on a manifest with `plugin.clients.claude` and ledger rows of class `agent` reports `plugin-duplicates` `warn` under `mode: generated` and `fail` under `mode: plugin-backed`, and `pass` when the rows are absent; a fixture whose `apm.yml` declares `dependencies: [acme/stamity-mirror#plugins/v1.9.0]` and whose `.claude/agents/stamity-reviewer.md` has no ledger row reports one `apm` duplicate and one `unmanaged` duplicate with their remedies; `plugin-runtime` is `pass` with its note when no plugin client is recorded and no root variable is set and `warn` when a client is recorded and none is found (amended 2026-09-20), `pass` with `CLAUDE_PLUGIN_ROOT` set to a fixture root whose `runtime/locate.mjs` prints `{ "runtime": { "kind": "bundled", "version": "<engine version>" } }`, and `fail` when the fixture prints a different major; `clean -y` on a manifest with two recorded clients prints two uninstall lines and removes no file outside the ledger; the troubleshooting guide's doctor table lists the two ids and the docs census passes; every generated hook script under `.stamity/generated/hooks/<tool>/` run with the fixture payloads of `test/hooks/scripts.test.ts` inside a `git init` fixture leaves `git status --porcelain` empty apart from the `.stamity/` state files the script already owns, and `check` and `plugin status` change no file (the non-mutation half of REQ-PLUGIN-019) |
| `edgeCases` | a tool absent from `manifest.tools` but present in `plugin.clients` is ignored by emission and reported by `plugin status` (C4) as `recorded but not selected`; a pack skill row (`origin: pack`) is never skipped by plugin ownership — packs are repository-installed content and keep their rows; the locator spawn on Windows uses `process.execPath` with `shell: false` |
| `depends_on` | c1-manifest-fields |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && npm run build && node dist/cli.js sync && node dist/cli.js check` |

### C4 — plugin-verb (B2; after C2, C3, C6)

| Field | Content |
|---|---|
| `id` | c4-plugin-verb |
| `requirements` | REQ-PLUGIN-015, REQ-PLUGIN-016, REQ-PLUGIN-017, REQ-PLUGIN-019, REQ-PLUGIN-013 |
| `files` | `src/cli/commands/plugin.ts` (new), `src/cli.ts` (register after `worktreeCommand`; the two count comments become "Ten advertised, twelve registered"), `src/cli/docs/cliReference.ts` (no change expected — it renders from `COMMANDS`), `docs/cli-reference.md` (regenerated), `test/cli/commands/plugin.test.ts` (new), `test/cli/surface.e2e.test.ts` (`ADVERTISED` gains `plugin` after `worktree`; the two count literals move to 10), `test/architecture/boundaries.test.ts` (`PLAN_MAP` rows, amended 2026-09-20 with the placements below: `"src/cli/commands/plugin.ts": { unit: "pl-c4", wave: 15 }`, `"src/emit/ownership.ts": { unit: "pl-c3", wave: 5 }`, `"src/plugins/capabilityFile.ts": { unit: "pl-c6", wave: 2 }`, `"src/cli/commands/plugin/setup.ts": { unit: "pl-c4", wave: 15 }` — re-keyed to C4 to avoid a same-wave cross-unit edge, with authorship kept in the file's comment — `"src/cli/commands/plugin/status.ts": { unit: "pl-c4", wave: 15 }`, `"src/cli/commands/plugin/probe.ts": { unit: "pl-c4", wave: 14 }`), `test/cli/docs/cliReference.test.ts` (no literal to move; it derives from `COMMANDS`) |
| `interfaces` | `export const pluginCommand: CommandModule = { name: "plugin", summary: "run this repository on an installed stamity plugin: status, setup", mutating: true, args: [{ name: "subcommand", description: "status (default), setup", required: false }], configure(cmd) { cmd.option("--client <csv>", "clients to act on (claude, cursor, copilot, codex)").option("--plugin-root <path>", "the installed plugin root; defaults to CLAUDE_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT, PLUGIN_ROOT or COPILOT_PLUGIN_ROOT") }, run }`; the closed subcommand set `["status", "setup"]` with the `workspace.ts` refusal shape for anything else, which the funnel reports as exit 1 with `USAGE` (amended 2026-09-20: exit 2 does not exist in this CLI). `src/cli/commands/plugin/status.ts` (new, wave 15 — amended 2026-09-20 from the engine placement `src/plugins/status.ts`: it composes a duplicates remedy through the CLI's package-name kit, so it is a CLI-layer sibling of the setup engine; the shared probe module `src/cli/commands/plugin/probe.ts` at wave 14 is the one home `check` and `status` both read, holding `probePluginRuntime`, `collectPluginDuplicates` and the four root variables, extracted from `check.ts` with every doctor row's bytes unchanged): `export interface PluginStatusReport { installMode: InstallMode; runtime: { kind: "companion" \| "bundled" \| "none"; path: string \| null; version: string \| null; message: string \| null }; node: { version: string; floor: string; ok: boolean }; clients: { tool: Tool; recorded: PluginClientRecord \| null; rootFound: boolean; rootVersion: string \| null; clientFloor: string \| "unknown"; selected: boolean }[]; compatibility: { state: "compatible" \| "mismatch" \| "not-applicable"; pluginVersion: string \| null; manifestVersion: string \| null }; duplicates: { tool: Tool; class: PluginOwnedClass; files: number }[]; coexistence: boolean; setup: { needed: boolean; unconfigured: { fact: string; command: string }[] } }` and `export async function buildPluginStatus(rootDir: string, engine: EngineRegistry, opts: { pluginRoot?: string; env: NodeJS.ProcessEnv; nodeVersion: string }): Promise<PluginStatusReport>` — `runtime` comes from spawning `<pluginRoot>/runtime/locate.mjs --print`; `unconfigured` lists each `detected` fact rendered as `unknown` with the command `stamity config detect`, and each unset gate with `stamity config set gates.<k> "<command>"` — a gate already pinned is never listed, and nothing at all is listed before a manifest exists (amended 2026-09-20); `setup.needed` is true when no manifest exists. `status` prints a plain table (rows `runtime`, `node`, one per client, `compatibility`, `duplicates`, `setup`) and exits 0 always; `--json` emits the report. `setup`: refuses (exit 1, `VALIDATION_ERROR`, no writes) when a manifest exists — message `a generated setup exists; run <packageCommand("clean")> -y, then <packageCommand("plugin")> setup --client <csv>`, rendered through the running package's own name (amended 2026-09-20: a renamed fork's operator has no binary called `stamity`); otherwise reads each selected root's `stamity-plugin.json` (`--plugin-root` or the environment; `--client` defaults to the root's `client`), builds `InitDecisions` through `buildInitDecisions(rootDir, { tools: clients })` (the init planner, no prompt), and calls `applyInit({ rootDir, decisions, engineVersion, dryRun: ctx.dryRun, force: false, now, plugin: { mode: "plugin-backed", clients } })` — `InitApplyOptions` gains the optional `plugin` field which `applyInit` copies onto the manifest before planning (C6 owns that edit); the panel prints the `plugin-owned` lines from C3. |
| `testCriteria` | `stamity plugin` and `stamity plugin status` print the same bytes and exit 0 on an uninitialised repository (with `setup.needed: true`); `plugin setup --client claude --plugin-root <fixture root> -y` on a fresh fixture writes `AGENTS.md`, `CLAUDE.md`, `.claude/rules/`, `.claude/settings.json` without `hooks`, `.stamity/manifest.json` with `plugin.mode: "plugin-backed"` and `clients.claude.classes` equal to the root's `carried` classes, and no `.claude/agents`, `.claude/skills`, `.claude/commands`; a second run is a run on a repository that now carries a manifest, so it REFUSES with `VALIDATION_ERROR` (exit 1), writes nothing and leaves the sha-256 map unchanged (amended 2026-09-20 from "reports `0 changed`", which contradicted the next clause and the plan's own reading (a)); that refusal names the clean-then-setup route through the running package's own name; without `--plugin-root` and no root variable, `setup` exits 1 naming the four variables; `plugin status --json` after `stamity clean -y` and `plugin setup` on the generated fixture carries `coexistence: false` and `compatibility.state: "compatible"`; a fixture root whose `stamity-plugin.json` says `version: "2.0.0"` yields `compatibility.state: "mismatch"` naming both versions; `stamity --help` lists ten advertised verbs; the CLI reference regenerates with a `## \`stamity plugin\`` section; `stamity plugin bogus` exits 1 with `USAGE` naming the two subcommands (amended 2026-09-20 from exit 2) |
| `edgeCases` | `--client cursor` with a claude root: refused with exit 1 (`the root at <path> declares client claude`); a root without `stamity-plugin.json`: exit 1 naming the file; a monorepo: `setup` writes the nested `AGENTS.md` copies exactly as init does; `-y` is inert, because the init planner `setup` calls asks nothing (amended 2026-09-20 from "asks init's own questions (the two-prompt budget)": `plugin setup` is prompt-free) |
| `depends_on` | c2-gates-config, c3-ownership-boundary, c6-setup-engine |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-docs.mjs && git diff --exit-code docs/cli-reference.md llms.txt` |

### C6 — setup-engine (B1; parallel with C2, C3)

| Field | Content |
|---|---|
| `id` | c6-setup-engine |
| `requirements` | REQ-PLUGIN-015 |
| `files` | `src/cli/commands/plugin/setup.ts` (new; amended 2026-09-20 from `src/plugins/setup.ts` — see `interfaces`), `src/cli/commands/init/apply.ts` (the optional `plugin` field on `InitApplyOptions`, copied onto the created manifest), `src/plugins/capabilityFile.ts` (new: the reader of `stamity-plugin.json`), `test/cli/commands/pluginSetup.test.ts` (new; the fork-identity gate applies the moment it sits under `test/cli/`, so the fixture derives the companion package name from `package.json`), `test/plugins/capabilityFile.test.ts` (new), `test/cli/commands/initApply.test.ts` (the new option is covered), `src/composition/root.ts` (the registry group `plugins: { capabilityFile }`; `test/composition/root.test.ts` derives membership from disk), `test/architecture/boundaries.test.ts` (`PLAN_MAP` rows), `.oxlintrc.json` (the derived deny-lists) |
| `interfaces` | `capabilityFile.ts`: `export interface PluginCapabilityFile { schemaVersion: 1; client: Tool; version: string; sourceCommit: string; invocation: Record<string, string>; clientFloor: { version: string; citation?: { url: string; accessDate: string }; reason?: string }; prerequisites: { node: string; git: "optional" \| "required"; [client: string]: string }; classes: Record<"agent" \| "skill" \| "command" \| "rule" \| "hooks" \| "mcp", { status: "carried" \| "repository-owned" \| "unsupported"; count?: number; reason?: string }>; runtime: { path: string; locator: string; companion: { package: string; compatible: string } } } export async function readCapabilityFile(pluginRoot: string): Promise<PluginCapabilityFile>` (strict: unknown keys and a `schemaVersion` other than 1 refused with `CONFIG_ERROR` naming the key; `client` validated against `VALID_TOOLS`); `export function carriedClasses(file: PluginCapabilityFile): PluginOwnedClass[]` (the `carried` entries excluding `mcp`); `export function resolvePluginRoot(opts: { flag?: string; env: NodeJS.ProcessEnv }): string \| null` (`flag`, else `CLAUDE_PLUGIN_ROOT`, `CURSOR_PLUGIN_ROOT`, `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT` in that order — four variables, against REQ-PLUGIN-015's three; the spec paragraph records the correction). `setup.ts` lives at `src/cli/commands/plugin/setup.ts` at wave 15, amended 2026-09-20 from the engine placement `src/plugins/setup.ts` at wave 14: it must import the CLI's `init/plan.ts` and `init/apply.ts`, which the architecture gate's rule 1 (the engine never imports the CLI, no waiver), rule 2 (a wave-12 registry cannot hold a wave-14 edge), rule 5 (a registry module with no production caller) and the eslint `no-restricted-imports` rule each refuse — the placement `workspace.ts` already justifies for a command that drives the emission engine; only the capability-file reader stays in the engine. Until C4's verb lands, rules 4 and 5 are red on this unit's branch by design, so C6 and C4 integrate together. Its contents: `export interface PluginSetupInput { rootDir: string; roots: { tool: Tool; root: string; file: PluginCapabilityFile }[]; engineVersion: string; dryRun: boolean; now: Date } export async function planPluginSetup(input): Promise<{ decisions: InitDecisions; plugin: PluginConfig }>` (decisions via `buildInitDecisions(rootDir, { tools: roots.map(r => r.tool) })`; `plugin.clients[tool] = { version: file.version, classes: carriedClasses(file) }`) and `export async function applyPluginSetup(input): Promise<InitApplyReport>` (`applyInit({ rootDir, decisions, engineVersion, dryRun, force: false, now, plugin })`); `InitApplyOptions.plugin?: PluginConfig` — when present `createManifest` receives it and the planner therefore skips the owned classes (C3) |
| `testCriteria` | `readCapabilityFile` on file 1's claude root parses and `carriedClasses` is `[agent, skill, command, hooks]`; a file with `schemaVersion: 2` or an extra top-level key is refused naming it; `resolvePluginRoot` prefers the flag, then the four variables in order; `applyPluginSetup` on a fresh fixture with the claude root writes only the repository-owned paths listed in REQ-PLUGIN-015 and a manifest whose `plugin` field equals the planned one; with `dryRun: true` it writes nothing and returns the same `wrote` list; a second apply refuses with init's own `VALIDATION_ERROR` (a manifest exists), which C4 translates into the clean-then-setup sentence rendered through `packageCommand()` (amended 2026-09-20 from "the migrate sentence"; the migration engine was cut on 2026-09-17) |
| `edgeCases` | two roots for two clients in one call (claude and cursor) write one manifest with two `clients` entries and `tools: [claude, cursor]`; a root whose `client` is not in the requested `--client` list is refused before planning; a capability file declaring `hooks: repository-owned` (the codex spike outcome) leaves hooks in generated mode for that client |
| `depends_on` | c1-manifest-fields |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage` |

### C9 — effort-scale (B2; after C2 and C3; parallel with C4)

| Field | Content |
|---|---|
| `id` | c9-effort-scale |
| `requirements` | REQ-LADDER-001 |
| `files` | `src/types/core.ts`, `src/roster/modelLadder.ts`, `src/cli/commands/config.ts` (the effort rows' `apply`, after C2's gates rows have landed), `src/emit/planner.ts` (one call appending the disclosures to `EmissionPlan.warnings` in `composeEmissionPlanner`, after C3's edit), `src/adapters/claude.ts`, `src/adapters/cursor.ts`, `src/adapters/codex.ts` (each `facts.caps` gains an `effort-scale` row carrying the scale's own citation; the existing rows' citation dates do NOT move — amended 2026-09-20; no rendering change), `docs/configuration.md` and `docs/capability-matrix.md` (regenerated), `test/roster/modelLadder.test.ts`, `test/cli/commands/config.test.ts`, `test/emit/planner.test.ts`, `test/adapters/{claude,cursor,codex}.test.ts`, `test/emit/capabilityMatrix.test.ts` |
| `interfaces` | `src/types/core.ts`: `export const EFFORT_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const` (ordered weakest to strongest; the comment replaces "the band the supported clients share" with "the union of the clients' documented scales; each projection row declares its own scale"), `EffortLevel` and `VALID_EFFORT_LEVELS` follow; `export function effortRank(level: EffortLevel): number`. `modelLadder.ts`: `ClientModelProjection` gains `readonly effortScale: readonly EffortLevel[]` and, amended 2026-09-20, a citation FIELD OF ITS OWN, `readonly effortScaleCitation`, rather than re-dating the row's existing citation — the scale pages are not the pages the row's model keys were read from, and the claude suite pins every row citation to 2026-09-10, so moving that date would claim a re-reading nobody performed (claude `["low", "medium", "high", "xhigh", "max"]`, scale citation `https://code.claude.com/docs/en/sub-agents` 2026-09-17, "available levels depend on the model"; codex `["minimal", "low", "medium", "high", "xhigh"]`, scale citation `https://learn.chatgpt.com/docs/config-file/config-reference` 2026-09-17, "xhigh is model-dependent"; cursor the full list with `effortScaleNote: "pass-through — parameter ids and values vary by model"`, scale citation `https://cursor.com/docs/sdk/typescript` 2026-09-17; copilot `[]` with a `null` scale citation); `export function nearestExpressibleEffort(level: EffortLevel, tool: Tool): EffortLevel \| undefined` — the requested level when the scale holds it, else the highest scale entry ranked below it, else the lowest entry above it (only `minimal` on a scale starting at `low`), `undefined` on an empty scale; `resolveEffortValue(modelClass, tool, efforts)` resolves the requested level (operator map, else the class default) and returns `nearestExpressibleEffort(requested, tool)`; `export function effortDisclosures(manifest: SetupManifest): string[]` — for each selected tool with a non-null carrier and each class whose resolved level differs from the requested one: `effort [<tool>]: <class> asks for <requested>; this client's scale ends at <emitted>, emitted <emitted>` (or "starts at" for the upward case). `config.ts`: the four `effort.<class>` rows' `apply` refuses with `EngineError` (`VALIDATION_ERROR`, exit 1 — amended 2026-09-20: the CLI retired the sysexits translation, ledger row build/34) when any tool in `draft.tools` has a non-null carrier whose `effortScale` lacks the level: `effort.<class> <level> is not expressible on <tool> (its scale ends at <top>); set <top> or lower, or deselect the client`; `resolve` renders per client as today and appends ` (clamped from <requested>)` where the emitted level differs. `planner.ts`: `warnings.push(...effortDisclosures(ctx.manifest))` beside the hooks-plan warnings. The class defaults (`frontier: high`, `advanced: high`, `standard: medium`, `economy: low`) are unchanged |
| `testCriteria` | with no `effort` map every adapter test and the cross-client golden are byte-identical (no `-u`); `config set effort.frontier xhigh` on `tools: [claude, codex]` writes the key and the claude agent for a frontier-class role renders `effort: xhigh` while codex renders `model_reasoning_effort = "xhigh"`; `config set effort.frontier max` on `tools: [codex]` exits 1 with `VALIDATION_ERROR` and the message above and the manifest is unchanged; `config set effort.frontier max` on `tools: [claude]` succeeds; `config set effort.economy minimal` on `tools: [claude, codex]` exits 1 the same way naming claude and its lowest level `low` (both amended 2026-09-20 from exit 64); a manifest with `effort.frontier: max` and `tools: [claude, codex]` (written directly, the later-selection case) emits `xhigh` on codex and the plan's warnings contain exactly one disclosure line for codex and none for claude; `config list` prints `codex=xhigh (clamped from max)` for that manifest; cursor emits `[effort=max]` verbatim; copilot emits nothing for the axis; `docs/configuration.md` regenerates with the six-level hint and `docs/capability-matrix.md` with the three `effort-scale` caps; every scale's own `effortScaleCitation` carries its 2026-09-17 access date while every projection row's existing model citation keeps 2026-09-10 unmoved (amended 2026-09-20) |
| `edgeCases` | an operator map naming a level the running engine does not know (a manifest written by a newer engine) is refused by `collectManifestErrors` naming the level, as today; `nearestExpressibleEffort("minimal", "claude")` is `low` (upward case); the eval profiles (`evals/model-profiles-v1.json`) pin `high` by their own field and are untouched; a `max` request on Cursor rides through to a model that may reject it, which the capability matrix row states |
| `depends_on` | c2-gates-config, c3-ownership-boundary |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-docs.mjs && node scripts/generate-capability-matrix.mjs && git diff --exit-code docs/configuration.md docs/capability-matrix.md llms.txt && npm run build && node dist/cli.js check` |

### C7 — docs-and-pins (B3; after C4 and C9)

| Field | Content |
|---|---|
| `id` | c7-docs-and-pins |
| `requirements` | REQ-PLUGIN-024, REQ-PLUGIN-013 |
| `files` | `docs/plugins.md` (new hand page), `README.md` (`## Commands` ten verbs; one map row for the guide; the budget constant moves by exactly one row), `docs/getting-started.md` (`## The ten verbs`; a `## Install as a plugin instead` section pointing at the guide), `src/emit/capabilityMatrix.ts` (`CapabilityMatrixInputs.plugins: readonly PluginContainerFact[]` with `{ tool, container: string, carries: PluginOwnedClass[], repositoryOwned: PluginOwnedClass[], invocation: string, floor: string, rootVariable: string, citations }` rendered as a `## Plugin containers` section; the `Agent Plugins scope expansion` revisit row is rewritten to name the emitted roots), `docs/capability-matrix.md` (regenerated), `src/cli/docs/llmsIndex.ts` (the guide entry), `llms.txt` (regenerated), `website/sidebars.ts` (`present(['getting-started', 'working-with-stamity', 'plugins', 'doctrine'])`), `test/docsPages.test.ts` (`GUIDES` gains `PLUGINS` after `WORKING_WITH_STAMITY`; the README `ADVERTISED` array and count word `ten verbs`; the getting-started verb assertions; the `llms.txt` guide count; the CONTRIBUTING regeneration-command count from four to five; `README_MAX_LINES` +1 with the justified-change comment), `test/emit/capabilityMatrix.test.ts`, `test/ci/docsRoster.test.ts` (only if it pins the guide count) |
| `interfaces` | `docs/plugins.md` sections, in order: `# Plugins` (who the page is for, the ownership split in one table: class × client × owner), `## Install` (one subsection per client with the executed command block: Claude `claude plugin marketplace add <owner>/stamity#plugin-dist` then `claude plugin install stamity@stamity --scope project`, project settings example with `extraKnownMarketplaces` and `enabledPlugins`; Copilot CLI `copilot plugin marketplace add <owner>/stamity` … `copilot plugin install stamity@stamity`; Cursor: the team-marketplace route for an organization (dashboard import of the mirror repository, install mode, group restriction, the 10-minute re-index) and the Customize view or `agent --plugin-dir` route for one developer; Codex: the repository marketplace file with a `git-subdir` or `local` source, the `/plugins` view, and the workspace publish route an admin uses to share privately), `## Set the repository up` (`/stamity:st-setup` on Claude, the equivalent on each client, what `plugin setup` writes and what it never writes), `## Pin, update, roll back` (per client: Claude `claude plugin update`, then `claude plugin rollback` if the installed client lists it and otherwise the reinstall-at-previous-pin route — the page states which one the release's V2 walk used — auto-update off by default for third-party marketplaces, `DISABLE_AUTOUPDATER`; Copilot `copilot plugin update`, `COPILOT_AUTO_UPDATE=false`; Cursor and Codex: `not stated by the vendor on 2026-09-17` with the reinstall route), `## Keep the runtime in step` (companion pin `npm install -D @zomarit/stamity@<version>`, the compatibility rule, `stamity plugin status`), `## Move an existing setup` (`stamity clean -y` then `plugin setup`: what clean keeps — learnings, handoffs, overrides, user hooks — and what it removes; the migration engine is not in 1.9.0), `## Private catalogs and Renovate` (mirror the branch or the archives, `release.json`, the two presets, `renovate.json` `extends` example, and one paragraph on where the review step sits: no client delivers an update as a pull request — Claude marketplace auto-update, Cursor's team-marketplace re-index and Copilot's first-party auto-update are unreviewed pushes and managed settings are admin actions — so the reviewed object is the organization's catalog or mirror repository, where Renovate's pull request lands, and the clients then deliver only what that repository already carries), `## Troubleshooting` (the two doctor rows by name, pointing at the troubleshooting guide). Currency header: `verified against the tree at commit <sha>` and a re-open trigger naming the capability file schema, the locator's exit codes and the vendor pages' access dates |
| `testCriteria` | `test/docsPages.test.ts` passes with the new guide in `GUIDES`, `MAPPED_GUIDES` and the README map; the README list equals the ten-verb `ADVERTISED` array and contains `ten verbs`; the getting-started page contains every advertised verb; the capability matrix regenerates byte-identical to the committed page and its `Plugin containers` section lists four rows; `llms.txt` carries `docs/plugins.md` with `null` as its regeneration command; the sidebar builds without a dropped-id warning; every command block in `docs/plugins.md` is copied from a run recorded in file 3's V1 (the record cites the transcript) |
| `edgeCases` | the guide's Cursor and Codex pin sections state the vendor gap rather than a command; the README budget moves by exactly one line for the map row and the reason is written in the test's justified-change comment |
| `depends_on` | c4-plugin-verb, c9-effort-scale |
| `verify` | `npm run lint && npm run typecheck && npm run test -- --coverage && node scripts/generate-capability-matrix.mjs && node scripts/generate-docs.mjs && git diff --exit-code docs llms.txt` |

## Risks

- **Warning:** the ownership boundary touches every adapter's `planResidue`; a class skipped in one
  adapter and not another is delivered twice or not at all. Mitigation: C3's ownership module is
  the single predicate, and the adapter tests assert the skipped set per class with the golden
  snapshot proving generated mode unchanged.
- **Warning:** a verb moves seven hand-maintained pins (learning). Mitigation: C4 lists each pin as
  a file it owns, and C7 moves the two docs arrays with the prose in one change.
- **Warning:** `check`'s `plugin-runtime` row spawns the locator; a hung locator would hang
  `check`. Mitigation: a 5-second timeout and `warn` on timeout with the message.
- **Warning:** the local gate is weaker than CI: C3 touches path composition and file-mode
  behaviour; a CI round-trip for the Windows leg is budgeted before it is declared done.
- **Minor:** `docs/plugins.md` copies command blocks from executed runs, which means C7 closes only
  after file 3's V1 has run at least the Claude leg; the page ships with the Cursor and Codex pin
  sections stating the vendor gap.

## Open questions

None carried. The three readings the spec author flagged are resolved in Context; the assumed
dimension defaults are recorded there and are re-stated in the run record.
