---
id: plugin-lifecycle
# A design document, authored from docs/plans/008-plugin-lifecycle-01.md to -03.md on 2026-09-17 and excluded from the site build.
status: design
obsolete_when: every supported client installs the corpus through its own plugin container and the generated-setup route is retired, or a decision row cuts the surface
---
# Plugin lifecycle

The requirement set for distributing this product as a native plugin per client (Claude Code,
Cursor, the GitHub Copilot CLI, Codex) from one resolved corpus, with a bundled runtime, a
versioned release and update contract an organization's catalog and Renovate can consume, a
plugin-backed project setup mode, and a demonstrated consumer lifecycle. Requirement paragraphs
are the plan files' own delta sections, assembled here so the two cannot disagree; `/st-work`
moves `status` to `shipped-with-1.9.0` at the close. `REQ-PLUGIN-018` is not allocated: the
CLI-to-plugin migration it would have carried was cut on 2026-09-17 because the consuming
enterprise re-creates its private fork and sets its repositories up fresh.

## Intent

Ship the corpus as a per-client plugin package that a consumer installs, pins, upgrades and rolls
back through the client's own container, instead of copying generated files into the consumer's
repository. The plugin owns the portable content classes and carries its own runtime, while the
repository keeps the files that must state facts about that repository: charter, gates,
glob-scoped rules, MCP documents and local state. This spec records observable requirements for
generation, declaration, distribution, the `stamity plugin` verb, the clean-then-setup route for a
repository with a generated setup, and the proofs that each client discovers and runs what was
built.

## Context

The request of 2026-09-17 from a consuming organization, the eleven decisions the maintainer took
that day, the research that shaped the design and the audit of the earlier Codex and GPT-6 Astra
sessions are recorded in the three plan files and in
`.stamity/runs/2026-09-17_codex-astra-audit/findings.md`. The APM canonical distribution, fork
layer and enterprise upstream lane specs stay as shipped; REQ-PLUGIN-026 says so.

## Invariants

- One root per supported client under the built distribution tree, generated from the resolved
  corpus and never hand-edited; two generator runs over one commit are byte-identical.
- The plugin owns agents, skills, commands, hooks, and rules only where the container carries
  rules; a plugin-shipped body never writes a repository-owned file.
- No credential or secret-shaped value enters a generated file, a catalog, a release artifact or a
  recorded proof.
- An unresolved token or an unreadable runtime fails closed with a named path and a non-zero
  exit, never a partial write.
- CLI-only installs, the APM package bytes and the committed manifests stay byte-identical; plugin
  support is additive.
- A proof leg that could not run is reported as skipped with its reason and never counted as a
  pass.

## Requirements

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

As built on 2026-09-19, three points the paragraph above leaves open are settled in
`scripts/distribution-identity.mjs`. `stamity.publisher` and `stamity.distribution` are
independently optional: a manifest carrying a distribution block and no publisher still defaults
the publisher to the owner in `repository.url` (`:258-293`). A credential-shaped key is refused by
its path rather than only at the block's top level, so the refusal names `sources.<client>.<key>`
(`:70-98`). The host boundary is per kind: the identity's own `repository.url` stays on
github.com (`:289`), a `github` source on any other host is refused with a message naming
`git-subdir` as the host-neutral kind (`:178-185`), and `git-subdir` and `archive` admit any
https host whose URL carries no credentials in its userinfo, which also refuses an ssh remote
(`:114-128`).

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

As built on 2026-09-19, the schema half of that paragraph lives in
`scripts/plugins/releaseManifest.mjs` and draws two lines. `distribution.commit` is `null` while
the commit is unknown and is never absent, because a commit cannot carry its own sha inside its
tree (`:97-100`, `:150-151`). `validateReleaseManifest` returns one message per defect, each
prefixed by its JSON path, and performs no cross-check between `packages[]` and `catalogs`, since
a cross-check turns one wrong client into two messages (`:232-233`). The digest-to-archive
comparison and the catalog-existence check are the release job's, not the schema's.

### REQ-PLUGIN-012 Release workflow publishes the distribution

Given a `v<version>` tag push, When `release.yml` runs, Then the gates job uploads a
`release-plugins` artifact holding the distribution tree, four archives, four checksum files and
`release.json`; the publish job, after the npm publish, pushes the tree as one orphan-branch commit
on `plugin-dist`, creates the `plugins/v<version>` tag on it, attaches the archives, checksums and
`release.json` to the GitHub release, and records build-provenance attestations for the archives;
a dispatch with `dry_run` unset or `true` prints the branch, tag and archive names it would publish
and pushes nothing; and `test/ci/workflow.test.ts` pins each of those facts.

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

### REQ-PLUGIN-024 Documentation and pinned surfaces

Given the shipped documentation, When `docs/plugins.md` is read, Then it names the install
command for each of the four clients, the pin, update and rollback commands per client, the
ownership split, the `stamity plugin` subcommands, the Renovate presets and the private-mirror
route, with every command block copied from an executed run; the README's `## Commands` list, the
getting-started page's verb list and the CLI reference name `plugin`; the capability matrix
carries a `Plugin containers` section rendered from data; `llms.txt`, the sidebar and the README
map carry the new guide; and `test/docsPages.test.ts` exits 0 with its arrays and count words
moved in the same change.

### REQ-PLUGIN-025 Eval coverage for the generated command and plugin-mode invocation

Given the eval set, When the release eval run executes, Then `cases-v6/` carries at least one
golden and one adversarial case for the generated `st-setup` command and at least one golden case
for plugin-mode invocation of a carried command, agent and skill under their namespaced forms,
each with its `source:` range, rubric and threshold declared under `evals/SET-v7.md` before the run;
`test/evals/coverage.test.ts` and `test/evals/locators.test.ts` exit 0 over the additions; the
committed run artifact under `evals/runs/` records a per-metric score at or above its threshold for
those cases; and a case that could not execute is recorded as blocked with its reason rather than
scored.

### REQ-PLUGIN-026 Existing routes unchanged

Given the repository at the change's head, When the existing surfaces are compared with their
pre-change bytes, Then `init`, `sync`, `check` and `clean` on a manifest without a `plugin` field
produce byte-identical output trees (the cross-client golden snapshot is unchanged without `-u`),
`node scripts/generate-apm-package.mjs --check` and `node scripts/generate-plugin-manifests.mjs --check`
exit 0 on the committed files, every existing command name and public JavaScript import
resolves unchanged, and the full gate exits 0.

## Non-goals

- A self-contained executable per platform (Node at the engine floor is the declared prerequisite).
- Publishing to any vendor's public marketplace (an organization's own git repository is the
  catalog; the public branch of this repository is the public catalog).
- A fleet-management or update service of stamity's own (Renovate proposes every update).
- The CLI-to-plugin migration engine and the coexistence suite (cut 2026-09-17; inbox row).

## References

- `docs/plans/008-plugin-lifecycle-01.md`, `-02.md`, `-03.md` — the units and their evidence.
- `.stamity/runs/2026-09-17_codex-astra-audit/findings.md` — the audit whose fix batch opens the plan.
- `docs/specs/apm-canonical-distribution.md`, `docs/specs/fork-layer.md`,
  `docs/specs/enterprise-upstream-lane.md` — the routes this spec extends and leaves as shipped.
