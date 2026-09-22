---
id: plugin-lifecycle
# A design document, authored from docs/plans/008-plugin-lifecycle-01.md to -03.md on 2026-09-17 and excluded from the site build.
status: shipped-with-1.9.0
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

As built (2026-09-20): the generator is `scripts/generate-plugin-packages.mjs` with the grammar
above plus `--version`, dispatching every path through `scripts/plugins/layout.mjs` to a
`clients/<client>.mjs` module; one real build renders the four roots over 1,936 files and `--check`
exits 0 on them. Four client details of the paragraph's "every artifact class that container
carries" settled against the vendor pages and, twice, against a measurement. Hook placement is one
convention on every client — the scripts and the policy document live under `<root>/hooks/` — and
only the hook configuration file's location is per client: `hooks/hooks.json` on claude, cursor and
codex, `com.github.copilot/hooks/hooks.json` on copilot. Claude's manifest omits `skills` and
`hooks`: the vendor documents those fields as adding to the default scan, so declaring them at the
default paths risks double registration; the rule as it stands is that the component fields whose
schema description reads "in addition to" are omitted and discovery carries them, with
`claude plugin validate --strict` as the check. Cursor carries the commands under `skills/` and
declares no `commands` field, because Cursor converts a command to a skill with
`disable-model-invocation: true`. Copilot's commands are `com.github.copilot/commands/<id>.md`, not
the `.prompt.md` spelling the plan carried: measured on GitHub Copilot CLI 1.0.85, the CLI strips
exactly one extension, so `.prompt.md` would have advertised ids reading `st-ask.prompt …
st-work.prompt`. Codex ships `hooks/hooks.json` by default discovery and omits the `extensions`
key, because the two vendor pages disagree on where an override lives and discovery satisfies both.
Identity fields derive from `package.json` as the manifest generator does.

### REQ-PLUGIN-002 Capability declaration per root

Given a generated root, When `stamity-plugin.json` is read, Then it carries `schemaVersion: 1`,
`client`, `version`, `sourceCommit` (40 hex), `invocation` forms, `clientFloor` with a vendor
citation and an ISO access date, `prerequisites.node` equal to `package.json` `engines.node`, one
`classes.<class>` entry per class in `agent, skill, command, rule, hooks, mcp` whose `status` is
`carried`, `repository-owned` or `unsupported` and whose non-`carried` entries carry a `reason`,
and `runtime.locator`, `runtime.companion.package` and `runtime.companion.compatible`; a test
asserts that every artifact class the corpus indexes is either `carried` with a count equal to the
files in the root or declared with a reason.

As built (2026-09-20): `scripts/plugins/capability.mjs` writes the fixed key set in a fixed order
with `distribution` last and only when it is given, `invocation` keys sorted so the file is
deterministic, and `citation` reserved inside `invocation` as a non-form key (a naive reader would
otherwise read it as a client surface). Two of the paragraph's literals softened against what the
vendors state. `clientFloor` carries a vendor citation with an ISO access date OR a reason naming
the pages read, not the citation unconditionally: the codex and cursor roots carry both, and the
copilot root carries the reason alone, that no minimum CLI version for plugins is stated on the
four pages read (ledger row build/47; the validator makes `citation` optional). Claude is the one
root with a numeric floor, `2.1.224` for archive sources; the other three ship `unknown` with the
pages that failed to state one, never a guess. And a `carried` class may carry a `reason` too, because carried does not
always imply usable: copilot's command file extension is not stated by the vendor and was measured,
and copilot's and codex's hooks are carried with the unmeasured variable expansion and the client's
own trust gate named beside them. The measured invocation forms are `/stamity:<id>` for Claude
commands and skills and `@stamity:<id>` for Claude agents, `/<id>` for Cursor skills,
command-skills and agents, `/<id>` for Copilot skills and commands with `/agent <id>` for Copilot
agents (no `@<id>` form exists), and `$<id>` for Codex skills. The class counts in the built roots:
claude agent 10, skill 10, command 10, hooks 4; cursor agent 10, skill 8, command 10 (carried as
skills), rule 12, hooks 6; copilot agent 10, skill 10, command 10, hooks 4; codex skill 17,
hooks 4.

### REQ-PLUGIN-003 Companion files and the generated setup command travel

Given a skill directory with `references/`, `scripts/` or `assets/` files and a root whose client
carries commands, When the root is generated, Then every regular file under the skill directory is
present byte-for-byte beside its `SKILL.md`, a path containing `..`, a backslash or a symlink is
refused with exit 1 naming it, and the root carries a generated `st-setup` command whose body runs
`plugin status` and `plugin setup` through `runtime/locate.mjs` with that client's root variable.

As built (2026-09-20): `scripts/plugins/setupCommand.mjs` renders one fixed body per client —
frontmatter carrying `description` alone, then four numbered steps — and every step and every
remedy runs through `runtime/locate.mjs` with that client's root variable, never a bare `stamity`
on `PATH`, which a plugin-only install does not have. The remedies are worded as what the operator
runs, with the stop for the operator restated, because a body that phrases `clean -y` as an
imperative to the reader reads as an instruction to the model. On Cursor the generated command
carries `name:` and `disable-model-invocation: true` like every other command-skill in that root:
the generator applies no per-container transform, so without the decoration the model could invoke
a repository-writing setup on its own. Codex carries no command class, so no `st-setup` ships in
the codex root and its README states the manual route instead. Companion travel itself is
`scripts/plugins/corpusStage.mjs`: `.md` bodies are substituted and every other file, the charter
included, is copied byte-for-byte as a Buffer, so a binary companion survives the plugin lane —
the engine's own emission lanes still read skill companions as utf-8 and corrupt a binary one,
a pre-existing defect outside this package's file set, reported and not fixed here.

### REQ-PLUGIN-004 Charter-reference substitution of tokens in plugin bodies

Given the ten corpus files that carry `${STAMITY:*}` tokens, When a root is generated, Then no file
under the root contains the string `${STAMITY:`, each gate token reads as the fixed phrase naming
its row under `Verification gates` in `AGENTS.md`, each fact token reads as the fixed phrase naming
its row under `Repo facts`, an unknown token fails the generator with exit 1 naming the file and
token, and `node scripts/generate-apm-package.mjs --check` still exits 0 on the committed
`.apm/` tree.

As built (2026-09-20): `scripts/plugins/tokens.mjs` ships the eight charter-reference phrases,
bound by a test to `REPO_SUBSTITUTION_TOKENS` in `src/emit/substitution.ts` so a token cannot be
added on one side alone; the ninth token, `${STAMITY:INVARIANTS_VERSION}`, is refused rather than
phrased, because the charter is never a plugin body — that is the exemption the paragraph's "ten
corpus files" clause needs. `substitute()` reports every unresolved token in order and the token
pattern is bounded to one line, since an unbounded match swallows a paragraph. One corpus body had
to move for the literal clause to hold at all: `content/agents/stamity-test-runner.md` carried a
bare `${STAMITY:` in prose with no closing brace, which survives substitution and shipped in the
dogfood copy; it was reworded and landed with its dogfood copy, the APM agent and the golden digest
rows in one change.

### REQ-PLUGIN-005 Plugin hooks resolve their roots and never write configuration

Given a root's hook configuration and scripts, When the configuration is parsed, Then every command
names a script under the client's root variable (`${CLAUDE_PLUGIN_ROOT}`, `${CURSOR_PLUGIN_ROOT}`,
`${PLUGIN_ROOT}`) and no repository-relative `.stamity/generated/hooks` path; When a session-start
script runs from a repository with the root variable set and `STAMITY_REPO_ROOT` unset, Then it
reads that repository's `.stamity/` from the working directory, reads the ONE policy document the
script was rendered for — the sibling `hooks/agent-tool-policies.json` in a plugin container, the
repository's own at the climb otherwise — with no environment variable and no second candidate
entering that resolution, and `git status --porcelain` is unchanged after the run.

As built (2026-09-20): `EmissionContext.facts.hookScriptsRoot` — on the planner's type and on its
twin `EmissionFacts` in `src/cli/engine/emission.ts`, which the plan's file list omitted — roots
every hook command as `["node", "<hookScriptsRoot>/<file>"]` while every script row keeps its
repository path, and Claude's review-gate rows and Cursor's two adapter guards re-root with them.
Every `${NAME}/…` token is DOUBLE-QUOTED in shell form because an absolute install path may carry a
space (the Claude hooks page asks for it); other `$` tokens stay single-quoted. The emitted runner
resolves `${NAME}` from the environment or, failing that, beside itself, and only on a FULL
anchored match of the root-variable shape declared once in `src/hooks/portableRunner.ts` and
imported by both adapters — anything else renders the repository path, which is what stops a user
hook row from smuggling a `${NAME:-…}` default expansion into the command. It runs the child with
the session's working directory as `cwd` (the Codex hooks page states hook commands run with the
session cwd) and identifies the core guard by BASENAME across argv, so the identity is
root-independent and codex's and copilot's fail-mode posture and cursor's `failClosed` survive a
plugin root. The requirement's policy-document clause above is amended from "the root variable's
`hooks/agent-tool-policies.json`" to what shipped: the guard reads ONE document, chosen when
`planHooksInfra` rendered it — the sibling `agent-tool-policies.json` when `hookScriptsRoot` is
set (the container layout every generated root places the guard and the document in), and the
`../../agent-tool-policies.json` climb otherwise — and `policyDocumentPath()` in the emitted body
orders nothing. It `lstat`s that single path and refuses a symbolic link as `POLICY_INVALID`
before any read, in both modes, and it consults no environment variable at all. Three defects sit
behind that shape: a generic `PLUGIN_ROOT` in an unrelated environment redirected a
repository-mode guard to a foreign document; a stray sibling redirected it with nothing observing
the swap (ledger row prove/71); and an ordered pair with the repository document first still
reached OUT of a container, because `<root>/hooks/<script>` climbing two levels lands on the
PARENT of the plugin root — a marketplace clone, a client's plugin cache, a `--plugin-dir`
project directory — where a regular file or a symlink outranked the container's own emitted copy.
A missing, oversized, unparseable or linked document is a refusal; there is nothing to fall back
to. The codex hook configuration's own `description`
now derives its scripts directory from the context, so it no longer tells a plugin-root reader that
the scripts live under `.stamity/generated/hooks/codex/`.

### REQ-PLUGIN-006 Bundled runtime runs standalone and passes the leak gate

Given a root's `runtime/` directory copied alone to an empty directory, When
`node runtime/dist/cli.js --version` runs there with no other install, Then it prints the release
version and exits 0; When `scripts/leak-gate.mjs --include-build` runs beside the copied root, Then
it reports zero hits over a non-zero file count; and `node scripts/size-budget.mjs` reports the
logic budget unchanged because the emitter lives under `scripts/`.

As built (2026-09-20): `scripts/build-plugin-runtime.mjs` extracts the packed tarball through a
minimal ustar/pax reader over `node:zlib` (no system tar; links, absolute paths, backslashes and
`..` refused by entry name) and installs with `npm ci --omit=dev --omit=optional --ignore-scripts
--no-audit --no-fund` run through npm's JS entry under `process.execPath`. The runtime measures
3,314,634 bytes (3.16 MiB) over 631 files against the declared 12 MiB budget. Two facts the
paragraph does not state and the proof it names could not catch. The prune list applies under
`node_modules` ONLY: the first build applied its suffix rules to every file and deleted the bundled
corpus under `dist/content/`, which `--version` cannot see because it reads `package.json` alone —
the gate is now a standalone `init -y --tools claude` run from the built runtime in a scratch
`git init` repository, which fails with a missing charter template on the pre-fix build. And the
leak gate has to run over a tree OUTSIDE any checkout: its listing goes through `git ls-files`
first, so a copy placed in a gitignored directory inside the checkout lists zero files and reports
zero hits over nothing. Run that way it reports 0 hits over the runtime's own file count. The
prune list also drops the `@types/` scope and every declaration file, because the production
dependency `@types/make-fetch-happen` drags `@types/node` in.

Note (2026-09-20) — signed-pack verification, recorded here for want of an owner. No requirement
family under `docs/specs/` governs pack signing or Sigstore verification, and the two trust pages
cite code rather than a requirement id; the nearest requirement is this one, whose bundled runtime
is the reason the dependency moved, so the fact is recorded under it and moves to a packs-and-trust
requirement family on the day one is written. Since 1.9.0 the Sigstore client is an OPTIONAL
dependency: P1 moved `sigstore` from `dependencies` to `optionalDependencies` in `package.json`,
which is what lets this requirement's `npm ci --omit=dev --omit=optional` leave the client and its
tree out of the bundled plugin runtime. npm installs it by default, so an ordinary CLI install is
unchanged. An install that cannot load it returns a REFUSAL verdict for a declared signing claim —
never a pass, and never the pin-waivable `unarmed` (`src/pack/sigstoreVerifier.ts`) — so removing
the client switches no check off; it makes every signed pack fail to install, and an unsigned pack
is unaffected because nothing loads the client for it. Both trust pages state that pair
(`docs/packs-and-trust.md:175-179`, `docs/security-mapping.md:176-179`), and a docs pin reads the
claim off `package.json` instead of restating it, failing as a stale-page report on the day the
client moves back to a required dependency (`test/docsPages.test.ts:1779`).

### REQ-PLUGIN-007 Locator resolution order and refusals

Given `runtime/locate.mjs`, When it runs with `--print` inside a repository whose
`node_modules/@zomarit/stamity/package.json` version satisfies the declared compatible range, Then
its JSON names `runtime.kind: "companion"` and that path; When the companion is absent or outside
the range, Then it names `runtime.kind: "bundled"`; When Node is below the floor, Then it exits 2
with a message naming the floor, the found version and the install instruction; When no runtime
resolves, Then it exits 2 naming both probed paths; and in no case does it spawn a program found on
`PATH`.

As built (2026-09-20): `scripts/plugins/locate.mjs` is builtins-only and copied verbatim into every
root. `--print` always emits ONE shape — `runtime.{kind,path,version,refusal}` with `refusal: null`
on success and `kind: "none"` on a refusal, beside `node.{version,floor,ok}` — rather than a
success shape and a separate message, so a consumer parses one thing on every path. The caret
comparator draws the prerelease line in both directions: a prerelease range accepts only an
identical prerelease, a prerelease companion is refused under a released range, and the capability
file's own caret grammar was widened to admit the ranges the locator honours. A companion whose
`package.json` resolves but whose entry file is missing is treated as ABSENT rather than accepted,
so a half-installed companion falls back to the bundled copy instead of failing at spawn. The
project rule mirrors both halves of the repo-root bound (an ancestor-or-equal of the working
directory AND a directory holding `.stamity/`), the spawn goes through `process.execPath` with
`shell: false`, and `PATH` is never consulted.

### REQ-PLUGIN-008 Prerequisites declared and probed

Given a root, When `stamity-plugin.json` is read, Then `prerequisites` declares `node` (the floor
range), `git` (`optional`) and the client floor; When `runtime/locate.mjs --print` runs, Then its
JSON reports `node.ok`, `node.floor` and `node.version`; and the `plugin-runtime` doctor row of
file 2 reads the same declaration.

As built (2026-09-20): the declaration is split by owner. The `prerequisites` half is written by
each client root module in `scripts/plugins/clients/`, not centrally — the client floor is that
root's own fact, with its citation or its reason, and copilot's block carries its own install line
— while `runtime/locate.mjs --print` owns the `node.{version,floor,ok}` half and reports it on
every path, refusal included. The `plugin-runtime` doctor row reads that same `--print` output,
spawned through `process.execPath` with a 5 s timeout.

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

As built (2026-09-20), the block gained one optional key: `stamity.distribution.ownerEmail`, which
the Copilot catalog's `owner.email` renders when it is set and omits when it is not, and which is
refused without echoing the value when it is malformed, on the same path as the credential-shaped
keys. P1's own tests were untouched by the addition.

### REQ-PLUGIN-010 Catalog files per client with configurable sources

Given the distribution root, When it is generated, Then `.claude-plugin/marketplace.json` lists
one plugin whose `source` is `{ "source": "git-subdir", "url", "path": "claude", "ref": "plugins/v<version>" }`
by default, `.github/plugin/marketplace.json` lists the `copilot` root with `owner`, `metadata` and
a relative-path `source`, `.cursor-plugin/marketplace.json` lists the `cursor` root,
`.agents/plugins/marketplace.json` lists the `codex` root, every entry's `version` equals the
release version, and a configuration selecting `archive` or `npm` for a client changes only that
entry's `source` object.

As built (2026-09-20): `scripts/plugins/catalogs.mjs` renders the four catalogs, and three of the
paragraph's literals moved with the vendor facts. Cursor's marketplace file REQUIRES `owner`, which
this paragraph does not name and the plan's cell omitted. The Codex entry is the larger deviation:
every entry must carry `policy.installation`, `policy.authentication` and `category` — shipped as
`AVAILABLE`, `ON_INSTALL` and `Productivity`, the values the vendor's build page states in its own
example — `source.path` must start with `./` and stay inside the marketplace root, so the
distribution default is `{ "source": "local", "path": "./codex" }`, and no entry `version` is
documented for Codex at all, so the clause "every entry's version equals the release version"
CANNOT hold there and does not. Source-kind expressiveness differs per client and the renderers
say so: Claude takes `git-subdir` with `ref` plus an optional `sha`, `archive` with `sha256` and no
`ref`, and `npm` with `registry`; Codex takes `local`, `git-subdir` and `npm` only, with no
`github` and no `archive` kind; Copilot takes a relative path or a `github`/`url` object with
`ref`, `sha` and `path`; Cursor takes a relative path. The built distribution carries four archives
of 894–1,011 kB over 471–497 files each, with `release.json` validated before it is written. One
row stays open against this requirement rather than closed by it (ledger row build/18): the
private-fork `github` source in the checked-in `.claude-plugin/marketplace.json` still carries no
`ref`. That entry and the distribution's copy share a path and address different trees — it points
at the SOURCE checkout's `content/…` paths, which no `plugins/v*` tag satisfies — so the ref rule
above does not reach it, and the row is either retired against the distribution catalogs at the
close or re-opened as a fork-tagging item.

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

As built (2026-09-20), the archives that carry those digests are written by
`scripts/plugins/zip.mjs`: entries sorted, one fixed mtime taken from the source commit date,
deflate through `node:zlib`, CRC-32 in-script. Two builds of one commit are therefore byte-identical
WITHIN one Node and zlib version — the deflate implementation is the bound, and a rebuild under a
different Node is outside the reproducibility claim this requirement makes. The digest of record
for a package is its `packages[].sha256` in `release.json`, proven at the build with `shasum -c`
and re-verified in the release job against the manifest the job outputs channel pinned.

### REQ-PLUGIN-012 Release workflow publishes the distribution

Given a `v<version>` tag push, When `release.yml` runs, Then the gates job uploads a
`release-plugins` artifact holding the distribution tree, four archives, four checksum files and
`release.json`; the publish job, after the npm publish, pushes the tree as one orphan-branch commit
on `plugin-dist`, creates the `plugins/v<version>` tag on it, attaches the archives, checksums and
`release.json` to the GitHub release, and records build-provenance attestations for the archives;
a dispatch with `dry_run` unset or `true` prints the branch, tag and archive names it would publish
and pushes nothing; and `test/ci/workflow.test.ts` pins each of those facts.

As built (2026-09-20): the gates job builds the runtime into `dist/plugin-runtime` and the
distribution into `dist/plugins` — under the ignored `dist/`, not a bare directory the leak gate's
`git ls-files --others` scan and every cleanliness check would see — and uploads `release-plugins`
with `include-hidden-files: true`, because every catalog path and the APM tree are dot directories
that `actions/upload-artifact` drops by default: without the flag the branch would have shipped
with every catalog missing and every gate green. Four job outputs are read back out of the manifest
so the workflow never spells the branch or the tag. Two things the paragraph states moved. The
artifact download and the digest verification now PRECEDE the npm publish rather than following it,
because those two steps can only refuse and a refusal after npm had published would strand a
version no re-run can finish. And the orphan commit is deterministic: both git dates come from
`release.json`'s `sourceCommitDate`, so a re-run reproduces one sha and the tag guard's idempotent
arm is reachable; the branch is replaced by design and the tag is created once, failing closed when
it already names another commit. The branch's own `release.json` keeps `distribution.commit: null`
and only the release asset carries the sha, written by a one-field stamp that refuses a manifest
not carrying `null` — the publish job checks nothing out, so there is no re-render and no builder
flag. The attestation needs `artifact-metadata: write` beside `attestations: write`, which the
action's README requires for the storage record. Its egress and the push reach `api.github.com`,
`github.com` and Sigstore's public-good instance, all already allowed for npm provenance and
`gh release create`, so the policy stays `block`; observed-endpoint evidence is deferred to the
first real release, because a dry run never reaches the publish job. The dry-run rehearsal is run
35511867841 (success in 4m29s, the runtime at 631 files, four archives of 675–701 files,
`PLUGINS_BRANCH: plugin-dist`, `PLUGINS_TAG: plugins/v1.8.0`, and `git ls-remote` showing no branch
and no tag afterwards).

### REQ-PLUGIN-013 Pinning, refresh, rollback and repository-state compatibility

Given a consumer pinned to `plugins/v<A>`, When it installs at A, refreshes to `plugins/v<B>` and
pins back to A through the client's own commands as `docs/plugins.md` states them, Then the
installed tree at each A install has an identical per-file sha-256 listing, the B install differs
only in the paths B changed, and no step deletes a repository-owned file; a repository whose
`.stamity` state was written under A stays readable under B — `stamity check` exits 0,
`stamity plugin status --json` reports `compatibility.state: "compatible"` when the plugin major
equals the manifest's `generatedBy` major and `"mismatch"` with the two versions otherwise — and
0 ledger rows are rewritten by the read.

As built (2026-09-20), the compatibility half of the paragraph landed in two places and gained a
third state. `stamity check`'s `plugin-runtime` row fails when the manifest records
`plugin-backed` and the resolved runtime's major differs from the manifest's `generatedBy` major,
which is the rule this paragraph states for `plugin status`, so the two agree by construction. And
`compatibility.state` carries `not-applicable` beside `compatible` and `mismatch`, for a repository
that records no plugin client: the two-value sentence would have forced a verdict where there is
nothing to compare. The install, refresh and rollback halves are file 3's proof and are not built.

As built (2026-09-20), the documentation half: "through the client's own commands as
`docs/plugins.md` states them" assumes four vendors document such a command, and on 2026-09-20 two
of them do not, so the guide states the gap instead of inventing a command. Claude Code's pin IS
the marketplace ref — a marketplace added at `#plugins/v<tag>` — and the refresh is
`claude plugin update stamity@stamity --scope project` (amended 2026-09-22 from the bare
`claude plugin update stamity`: the qualified, scoped spelling is the one the page publishes and the
one the walk executed, because `plugin update` defaults to user scope and refuses a project-scope
install — measured on 2.1.278 and restated by this requirement's 2026-09-21 paragraph below and under
REQ-PLUGIN-021). Auto-update is off by default for a third-party marketplace, so an update is a
thing the operator runs; a `plugin rollback` subcommand is published as NOT ESTABLISHED, because
one vendor page quoted it in slash form on 2026-09-20 and the CLI reference did not list it, and
the route printed today is re-adding the marketplace at the previous tag and installing again.
Establishing it is REQ-PLUGIN-021's work in file 3 — V2 measures it against an installed client —
and until then the page promises nothing. Copilot documents `copilot plugin update stamity`, with
the same add-at-a-tag pin and an uninstall-then-re-add rollback. Cursor and Codex document NO pin,
update or rollback command: for Cursor the served version is whichever commit the mirrored
marketplace branch points at, so both directions are a branch move on the organization's own mirror
bounded by the vendor's at-most-every-10-minutes re-index; for Codex,
`codex plugin marketplace upgrade` refreshes the CATALOG rather than an installed plugin (listed by
`codex plugin marketplace --help` on codex-cli 0.154.0, read 2026-09-20), and the way back is
`codex plugin remove stamity` followed by adding the marketplace at the earlier tag and
`codex plugin add` again. The clause is therefore amended to read "through the route
`docs/plugins.md` records per client — a vendor command where one exists, and a documented re-add at
the earlier pin where none does" (`docs/plugins.md:227-263`), which is what the lifecycle proof will
walk and what REQ-PLUGIN-021's per-client row already anticipated.

As built (2026-09-21), two facts the lifecycle fixture settled. The `rollback` subcommand this
requirement published as NOT ESTABLISHED is settled against the installed client: claude 2.1.278
answers `error: unknown command 'rollback'`, so the route the page prints — re-adding the
marketplace at the previous tag and installing again — IS the route, and `plugin update --scope
project` is the completing command, because the documented re-add plus install answers "already
installed" and leaves the recorded version where it was. The four measured routes are recorded under
REQ-PLUGIN-021 rather than restated here. And the fixture's marker skill is authored under a BARE
slug (`fork/skills/fixture-marker/`, not `st-fixture-marker`): the generator refuses an
`st-`-prefixed fork directory, so a fork-layer id carrying the upstream prefix is not a shape a
fixture — or a downstream fork — can use.

### REQ-PLUGIN-014 Manifest records plugin-backed mode additively

Given the manifest schema, When the plugin fields are added, Then `MANIFEST_VERSION` is unchanged,
an optional `plugin` object accepts `mode` of exactly `generated` or `plugin-backed` plus an
optional `clients` map from tool to `{ version, classes }` where `classes` is a subset of
`agent, skill, command, rule, hooks`, an optional `gates` object accepts `test`, `lint`,
`typecheck` and `all` as non-empty single-line command strings, every manifest fixture written
before the fields existed parses unchanged and round-trips without gaining a key, and a manifest
carrying an unknown key under `plugin` or `gates` is refused naming the key.

As built (2026-09-20): `MANIFEST_VERSION` is unchanged, both fields are additive at schema 1.0.0,
and `MANIFEST_FIELD_ORDER` places `plugin` then `gates` after `models`. Three bounds the paragraph
does not state. A gate command is a non-empty single line of at most 512 characters, and a backtick
or the `${STAMITY:` prefix inside one is refused by name, because a pinned gate is rendered into
the charter unescaped. `PLUGIN_OWNED_CLASSES` is derived from a total record over the content
classes plus `hooks`, so a new content class is a compile error rather than a silently short list.
And a `classes` value that is not an array reads as owning nothing while validation still names the
defect, so a malformed manifest cannot widen ownership.

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

As built (2026-09-20): FOUR root variables, not three — `CLAUDE_PLUGIN_ROOT`, `CURSOR_PLUGIN_ROOT`,
`PLUGIN_ROOT`, then `COPILOT_PLUGIN_ROOT` — are read in that order when `--plugin-root` is absent,
and the refusal names all four (ledger row build/36). `--plugin-root` REPEATS, once per client, and
each root is paired with the client its own `stamity-plugin.json` declares, so one invocation sets
two clients up from their own roots. `--client` is derived from the roots when absent — the
invocation a client's own st-setup command produces — and validated against them in both directions
when present: a listed client no root declares, and a root whose client the list does not name, are
each refused by name, writing nothing. The bound this replaces bound every `--client` entry to one
resolved root, so `--client claude,cursor` always refused on the client-mismatch check and the
two-root plan the setup engine supports was unreachable from the CLI. The environment fallback
stays exactly one root, because a client exports its own variable and there is never a second to
pair. The idempotence clause is refuted and was
built to the plan's own reading (a): a second invocation is an invocation on a repository that now
carries a manifest, so it REFUSES with `VALIDATION_ERROR` (exit 1) and writes nothing, rather than
exiting 0 with 0 changed paths; the sha-256 stability the clause was reaching for is covered by
that refusal writing no file. The refusal sentence names the clean-then-setup route through
`packageCommand()`, the running package's own name, because a renamed fork's operator has no binary
called `stamity`. Placement moved with the architecture gate: the setup engine is a CLI-layer
module at `src/cli/commands/plugin/setup.ts` (wave 15) because it must import the CLI's
`init/plan.ts` and `init/apply.ts`, and `status` is its CLI-layer sibling for the same reason one
level removed (its duplicates remedy composes through the CLI's package-name kit); only the
capability-file reader stays in the engine, registered as the group `plugins: { capabilityFile }`.
`plugin setup` is prompt-free — the init planner it calls asks nothing — so `-y` is inert.

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

As built (2026-09-20): the boundary is one predicate, `withoutPluginOwnedRows`, applied over each
adapter's finished row set with a per-adapter `HOOK_INFRA_ARTIFACT_IDS` set for the hook rows.
`.claude/settings.json` splits — its `permissions` half always emitted, its `hooks` object only
when hooks are not plugin-owned — and `.codex/config.toml` is deliberately on neither ownership
list, because each of those files carries repository configuration as well; a pack skill row is
exempt, packs being repository-installed content. The shared `.agents/skills/` tree is written
while any reading client still owns `skill` and is co-owned by exactly those clients, so the sync
report prints one `plugin-owned` line per client naming the classes and `clean --json` carries
`pluginUninstall`. Two literals moved. `clean -y`'s Codex line is `codex plugin remove
stamity@<your marketplace>`, read from `codex --help` on 0.154.0, superseding the `/plugins` view
wording. And `plugin-runtime` is `pass` with its note when the manifest records no plugin client
and no root variable is set — a repository using no plugin has nothing to act on — so the `warn`
this paragraph states is the state where a client is recorded and no root is found. The `fail` on a
refused locator carries the same qualification (2026-09-20): it fails only where the repository
CLAIMS the plugin — a recorded client, or `mode: "plugin-backed"` — and warns with the refusal
quoted otherwise, because a root variable exported by an unrelated session would otherwise fail the
CI of a repository that records no plugin at all. One behaviour
no requirement covered is recorded here rather than given an id of its own (ledger row build/55):
`src/emit/hooksInfra.ts` raises a planning warning when an accepted user or pack hook row cannot
reach a plugin-backed client, because that client's hook configuration now comes from the plugin.

As built (2026-09-21), one row of the runtime surface these doctor rows share: the `node` row is
never `unstated` when no root's locator answers. `requiredNodeRange()` moved out of its private home
in `check.ts` into the shared probe, where `engineNodeFacts()` reads this build's declared
`>=22.22.2` and computes `ok` against it, and ONE exported tri-state `judgeNodeFloor` is called by
both readers, so `check`'s row stays byte-identical arm by arm instead of two surfaces composing the
same judgment twice.

### REQ-PLUGIN-017 Explicit facts and gates replace placeholders

Given `stamity config set gates.test "npm run test:unit"`, When the charter is rendered, Then its
`Verification gates` section carries that exact string for the Tests row, the other rows carry the
detected commands, and `${STAMITY:VERIFY_GATE_ALL}` renders from the configured `all` when set and
from the detected composition otherwise; Given a fact detection could not determine, When
`stamity plugin status` runs, Then it lists that fact as `unconfigured` with the exact
`stamity config` command that sets it, and the rendered charter still carries the literal
`unknown` for it rather than an invented value; and the rendered file contains 0 occurrences of
`${STAMITY:`.

As built (2026-09-20): a configured gate outranks detection per key, `all` composes from the merged
rows, and the charter and the skills projection both render through `readGates(manifest)` so one
pinned set reaches every surface; `config detect` never clears a pin, `none` drops a key and an
emptied `gates` object, and `config list` prints a `detected:` prefix for every unset row. One
literal moved: a refusal exits 1 with `VALIDATION_ERROR`, not 64 — `src/types/errors.ts` retired
the sysexits translation and every failure exits 1 with the kind in `error.code` (ledger row
build/34). The `unconfigured` list of `stamity plugin status` names detected facts with
`stamity config detect` and gates with `stamity config set gates.<k>`, never lists a gate that is
already pinned, and lists nothing at all before a manifest exists.

As built (2026-09-21), one flag of the same status surface, recorded here because this is the
requirement that governs what `plugin status` reports (REQ-PLUGIN-016 governs the doctor rows and
neither paragraph names a flag): `--client <csv>` on `status` narrows the `clients` rows in `TOOLS`
order through the same `parseClients` validator `setup` uses, so one flag has one refusal on both
verbs rather than a second one written for `status`; its code is `CONFIG_ERROR`, the validator's own,
not the `VALIDATION_ERROR` a separate refusal would have introduced.

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

As built (2026-09-20): the three sources, their three remedies and the `warn`-under-`generated`,
`fail`-under-`plugin-backed` split landed as stated; each finding carries the paths the paragraph
asks for (2026-09-20) — the ledger rows' and the unowned files' repository-relative paths, or the
matched dependency line for `apm`, which has no file — rendered by `check` as the first three,
sorted, then `+N more`, and carried whole as `paths` beside `files` in `plugin status --json`;
`check` mutates nothing, proven by a
whole-tree sha-256 map taken around the run, and no verb deletes a duplicate. One bound is narrower
than the paragraph reads, and the mechanism is stated rather than implied: an `apm` finding is
raised for a dependency line CONTAINING either of this installation's two identities — the
repository slug `<owner>/<repo>`, derived from `package.json` `repository.url` the way
`scripts/distribution-identity.mjs` derives it, or the registry package name `@<scope>/<name>`.
Both are needed because they share no substring and each is what a different route writes: the APM
route this release publishes installs from the slug (`release.json` carries `apm.installSpec` as
`<owner>/<repo>#plugins/v<version>`, which never contains the scoped npm name), while a
hand-written manifest depending on the published package names the registry name. A mirror
published under ANOTHER owner — `acme/stamity-mirror#plugins/v1.9.0` — carries neither identity and
is therefore NOT reported; that is the safe direction, since a false duplicate would send an
operator to remove a dependency that deploys nothing, and closing it needs the installed
marketplace recorded on the client's `PluginClientRecord`, which no manifest field carries yet —
the later fix, not this one. An unparseable `apm.yml` reports nothing rather than guessing. The
`unmanaged` source derives an id by stripping ONE client extension, longest first — `.agent.md` and
`.prompt.md` precede the bare `.md` they end with (`src/cli/commands/plugin/probe.ts:332-347`),
because a `.md`-first list left `<id>.agent` and matched no carried id, which made every Copilot
file invisible to the scan; any extension added later belongs above every extension it is a suffix
of.

One coexistence state is ACCEPTED and stated rather than reported (disposition 2026-09-20). The
vendor-neutral `.agents/skills/` tree stays written while any generated-mode reader still owns
`skill`, so a repository whose cursor is plugin-backed for `skill` beside a generated codex keeps
that tree on disk and cursor reads those skills twice — once from its plugin, once from the shared
tree. `plugin-duplicates` passes there: the ledger source filters rows by adapter (the tree's rows
belong to the remaining generated reader) and the unmanaged source exempts any path a ledger row
owns. This is deliberate. A `fail` would break the CI of a legitimate mixed repository, and the
tree cannot be removed without stripping the generated client of its skills. The way out is moving
the LAST reader onto the plugin, at which point the tree stops being written and the double
delivery ends; a verdict from this row would not have that effect. The behaviour is pinned as a
decision by the mixed-repository case in `test/cli/commands/check.test.ts`.

As built (2026-09-21): the `duplicates` entries of `plugin status --json` carry `source` and `remedy`
beside their paths — the same three sources and three remedies `check`'s `plugin-duplicates` row
prints, read off the same finding — so the paragraph's "with the same list" clause holds field by
field rather than by count, and a JSON consumer reaches the remedy without re-deriving it from the
source.

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

Measured early (2026-09-20): this requirement is not built — its unit is file 3's V1 — but four of
its measurements were already taken by the client roots' own suites on this machine, so V1's author
starts from facts rather than from the vendor pages. Claude Code 2.1.278:
`claude plugin validate --strict <root>/claude` prints validation passed and exits 0, and the same
root with the `./` prefixes stripped and an entry missing fails with eleven named errors, so the
leg distinguishes. Cursor `agent` 2026.09.15: the headless invocation exits 1 on the Workspace
Trust prompt unless `--trust` (or `--yolo`/`-f`) is passed; with it, asked for the skills it can
invoke the client returns the eight corpus skills plus `st-setup` and none of the nine touchpoints,
because those carry `disable-model-invocation: true` and the model answers truthfully, and asked
for every skill the plugin provides including the non-invocable ones it returns exactly the 18 ids.
GitHub Copilot CLI 1.0.85, in a scratch `HOME`/`COPILOT_HOME`: `copilot plugin install <root>`,
`copilot plugin list --json` and `copilot skill list` all run unauthenticated and the deployed tree
is byte-identical over its 61 files, while `copilot -p … -s` exits 1 with no authentication
information found, so the prompt leg needs a credential; skill precedence is first-found with a
project's own skills ahead of plugin skills, so the leg must run in a scratch directory and assert
the installed tree or the plugin list rather than a bare skill name inside this checkout.
codex-cli 0.154.0, in a scratch `CODEX_HOME`: `codex plugin marketplace add`, `codex plugin add`
and `codex plugin list --json` all exit 0 with no login and the installed cache tree is
byte-identical over its 48 files, while `codex exec` refused with 401 in the scratch home and hit a
usage limit with a credential carried in once, so whether `exec` loads plugin skills is unproven
and the codex leg asserts the installed tree.

As built (2026-09-21) — the proof exists, and its legs are split by what a credential gates rather
than by client. `scripts/plugin-route-smoke.mjs` walks structure, install, discovery and invocation
per client, exits 0 only when no leg failed, 1 on a failure and 2 when it could not run, and writes
its `--json` document only where one is asked for — which is not the merge gate (corrected
2026-09-22): the merge-blocking `plugin-route` job of `.github/workflows/ci.yml`, in its
`Plugin route smoke (no invocation legs)` step, passes no `--json` and reads the exit code alone; the
nightly drive writes the document to the runner's temp directory in its per-client
`Headless target-tool drive (<client>)` steps, carried by the `headless-lane` job, and the job's
artifact upload step (14-day retention) keeps it, so the nightly writes and keeps the document
rather than reading it back; and the document's two readers are the QA harness's `plugins` lane
(`scripts/qa/plugin-runs.mjs`) and `test/ci/pluginRoute.test.ts`. Both workflows are cited here by
job and step name rather than by line, because the workflow rewrite of 2026-09-22 moved every line
number this sentence first carried. That test runs the structure leg always and each install and
discovery leg under `describe.skipIf` on `STAMITY_<CLIENT>_BIN`; `scripts/qa/plugin-runs.mjs` writes
rows `H4a`–`H4d`. What blocks a merge is the credential-free half, and it is stated by mechanism
because the boundary falls through the middle of discovery: each root's STRUCTURE (every carried
class re-counted out of the tree and each
container manifest validated against its vendored document — a root with `commands/st-work.md`
removed fails naming both numbers), each client's INSTALL, and the discovery a credential-free
listing command can answer. Discovery read from an invocation TRANSCRIPT, and every invocation leg,
are credential-bound: they run nightly behind per-client secrets — one secret per step, and no step
that runs a vendor's code holds any — and on the maintainer's machine through the QA harness. Each
invocation leg carries the client's own documented tool grant, narrowed to what that leg runs,
because without one a headless run measures the client's permission model instead of the root
(`Permission denied and could not request permission from user`, measured); the hook-driving runner
legs carry one for the same reason. The invocation INSTRUMENT is a file, never the model's reply:
`.stamity/manifest.json` carrying `plugin.mode: "plugin-backed"` and `plugin.clients.<client>`. A leg
that could not run is `SKIPPED` or `not-run` with its cause and is counted apart from the passes,
never as green — including a leg that never reached its model at all (a usage limit, a missing login),
which is SKIPPED with that cause and kept apart from a refusal as well as from a pass, and an
invocation leg that finds a stamity plugin already installed in the operator's own home, which is
SKIPPED rather than measured because the cleanup afterwards would take the operator's install with
it.

Five literals of the paragraph moved with the measurements (2026-09-21). The installed-tree
comparison holds WHERE THE CLIENT COPIES A TREE — Codex's cache, a remote Copilot marketplace install
— and a local-path Copilot marketplace on 1.0.85 is loaded LIVE (`"source": "live"`, nothing copied,
`installed-plugins/` never written), where the leg instead proves the client's own resolved entry
(name, version, enabled, source) and states which of the two it proved. The Copilot route is the
MARKETPLACE route (`copilot plugin marketplace add <dist>` then `copilot plugin install
stamity@stamity`), the direct install being deprecated on 1.0.85; and because skill precedence is
first-found with a project's own skills ahead of a plugin's, the Copilot listing leg runs in a
scratch directory — inside this checkout the same command reports 20 project skills and one plugin
skill. The Codex container carries no command and no agent class, so `st-work` cannot be in that root
and no `st-setup` is generated for it: its discovery marker is a carried skill under the `$<id>` form
(`st-qa`), its invocation asks for the setup line the root's own README prints, and its cache tree is
byte-identical over 45 files with the runtime excluded. `codex exec` refused with a usage limit, so
both Codex model legs are SKIPPED with that cause. And the expected ids resolve under each client's
DECLARED form, not a bare one: the Claude listing printed `/stamity:st-work` and
`@stamity:stamity-reviewer` and NOT the bare `/st-work` — the client advertises only the namespaced
form, and whether the bare form also resolves is not measurable headlessly, which is the measurement
the inbox row of 2026-09-17 on client-neutral cross-references waited for — while the Cursor listing
printed `/st-work` and `/stamity-reviewer`. With all four binaries armed the `--invoke` run reported
13 passed, 0 failed, 3 skipped in 17 m 47 s against a distribution built from a packed tarball. The
QA form's four rows fold their legs WEAKEST-FIRST — any `SKIPPED` leg makes the row `not-run`, any
`FAIL` makes it `failed` — and the harness at `5429d3e` wrote `H4a`, `H4b` and `H4c` `passed` with
`H4d` `not-run` for the usage limit; that evidence file is kept out of the checkout and V6 re-measures
at the candidate, because a pre-fix build sliced transcript tails before redacting and one reason
carried part of the operator's home path.

CI and nightly host the two halves of that split (2026-09-21). The `plugin-route` job is
merge-blocking through `all-ci-checks`: it builds the four roots with the release workflow's own three
lines from the packed tarball, installs the four vendor CLIs one step each under
`continue-on-error`, exports `STAMITY_<CLIENT>_BIN` for every binary `command -v` finds, and runs the
smoke WITHOUT `--invoke`, so no secret reaches it and a client whose install fails is a `SKIPPED` leg
rather than a red job. Nightly's drive step carries the invocation legs behind four secrets, each
mapped to the variable its client honours as measured from the binaries, with one notice per absent
secret, `--invoke` scoped to the armed clients, and a 45-minute ceiling derived from the measured
distribution build.

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

As built (2026-09-21) — the fixture exists and the four routes are MEASURED rather than conditional.
`scripts/plugin-lifecycle-fixture.mjs` builds `1.9.0-fixture.1` and `1.9.0-fixture.2` from one temp
copy of the checkout, writes the marker skill into that copy's fork layer, and commits each tree as an
orphan commit into `<out>/remote.git` under `plugins/v<version>` with the distribution branch at the
second; both commits take one fixed author and both dates from `release.json`'s `sourceCommitDate`, so
two runs produce the same two shas. The two trees differ in 13 added, 8 removed and 17 changed paths,
every one accounted for by the version string, the archive digests, the skills count in each
capability file, or the marker. The walk ran for real on this machine across all four clients: 36
rows, every one PASS but the Cursor marketplace add and the two Claude rollback rows, which are
SKIPPED with their reasons, captured line by line through a `STAMITY_LIFECYCLE_LOG` sink.

The paragraph's conditional clause — "a client whose installed version offers no rollback command" —
is therefore settled per client, and each route is the one that client's own CLI admits. Claude Code
2.1.278 has NO `plugin rollback` (`error: unknown command 'rollback'`), so its rollback IS the
reinstall route; `--scope project` is required on install AND update (`plugin update` defaults to user
scope and refuses, and the observed states are `up_to_date` at `.1`, `updated` from `.1` to `.2` and
`updated` back as the source moves); and a local bare repository is NOT a Claude marketplace source
(`Path does not exist`, `Invalid marketplace source format`), so the walk clones at the tag and
rewrites only the CLONE's catalog entry to a relative root, never adding the fixture remote directly.
GitHub Copilot CLI 1.0.85 loads a local marketplace LIVE (`Installed 10 skills`, nothing copied,
`plugin update` → `nothing to update`), so its update and its rollback are tree replacement. codex-cli
0.154.0 copies into `$CODEX_HOME/plugins/cache/stamity/stamity/<version>`, and `plugin add` again is
BOTH its update and its rollback once the marketplace has moved (`marketplace upgrade` refreshes git
sources only, and `plugin remove` needs `<plugin>@<marketplace>` to purge the cache). The Cursor agent
2026.09.15's `plugin marketplace add` takes a git URL and needs an account (`Authentication
required`), so that row is SKIPPED with its reason and the walk is `--plugin-dir` tree replacement,
driven at each of the three states — the marker id appears only in the `.2` listing, 18 ids at `.1`
and 19 at `.2`.

Every assertion the paragraph makes held on each walked route (2026-09-21): the installed tree's
sha-256 map equalled the shipped root (claude 694 of 695 files, copilot 694/695, codex 681/682, the
remainder being the client's own install record), `plugin setup` then `plugin status --json` through
each root's locator reported `not-applicable` before setup and `compatible` in all three states after
for all four clients, and the repository-owned map (17 files; 6 for cursor) was unchanged at every
step, the project's only install-time change being `.claude/settings.json`'s `enabledPlugins`. Each
walk ran in a scratch configuration directory or home with no credential read, copied or printed,
except the Cursor listing leg, which inherits the operator's environment because a scratch home
refuses with `Authentication required` — stated in the row, with a cleanup that deletes only that
walk's own chat records. The QA row `H5` and its `rollback-documented` row belong to the harness lane
that appends `H5` after the route proof's rows land, and that row reads as the failed route it is
where a documented command does not complete the rollback.

### REQ-PLUGIN-022 Downstream-customized packages proof

Given the fork fixture of `test/ci/downstreamFixture.ts`, When the generator runs in that checkout,
Then each client root carries the fork's body bytes for every replaced id with 0 occurrences of the
upstream body for that id, the fork-only ids exactly once each under their bare directories, the
patched ids with the patch witness appended, the unmodified upstream ids byte-identical to the
unforked build, the root's `stamity-plugin.json` carries the fixture's `sourceCommit`, and the
catalog files carry the fixture's publisher and repository url with 0 occurrences of the canonical
url.

As built (2026-09-21): `test/ci/pluginDownstream.test.ts` builds THREE distributions from ONE fork
checkout — the fork layer present, removed, and back as an empty directory — with
`scripts/build-plugin-distribution.mjs` spawned from that checkout, a stub runtime carrying the fork's
own package name and no `--source-commit` override, so the three trees share one corpus, one identity
and one HEAD. Every clause above is proven against the 60-pair `EXPECTED_PLUGIN_FILES` oracle: the
fork's body bytes for every replaced id with 0 occurrences of the upstream body under each of 12
replaced documents, the fork-only ids once each under their bare directories, no surviving
`upstream.txt`, no consumer override in any root, the fixture's HEAD as `sourceCommit` in four
capability files and in `release.json`, the fork's owner and https source in every catalog that carries
one (Codex carries neither, asserted absent), and the canonical owner absent from all 133 non-zip
files. The differing shared-root set against the unforked build is pinned exactly at 24 replaced or
patched documents plus 5 corpus-derived files.

Three facts the paragraph does not state (2026-09-21). The identity proof includes the package NAME
beside the publisher and the url, because `runtime.companion.package` is `package.json` `name` and a
fork that renames the package renames what its own plugin looks for — an opt-in case under
`STAMITY_FORK_SUITE=1` builds the distribution inside a renamed `private: true` copy of the whole tree
and finds the renamed identity in its catalogs. An EMPTY `fork/` reproduces the no-fork distribution
byte for byte over 131 files, which is the plan cell's first edge case met exactly. And the non-github
mirror is addressed through a `git-subdir` source declared under `stamity.distribution.sources`: a
non-github `repository.url` is itself refused by the identity resolver (REQ-PLUGIN-009's host
boundary, `:289`), so the cell's second edge case is amended to that reachable form, while a `github`
kind off github.com stays refused.

Two refusals sit beside the proof (2026-09-21): a case-folded fork collision is refused by the plugin
writer's lowercased claim map BEFORE any write, naming both contesting paths, on a case-folding and a
case-sensitive volume alike — a same-directory case twin exits 1 by two routes depending on the host's
case sensitivity, and the volume is probed rather than assumed — and a fork-skill symlink is refused.
A failed distribution build removes what it wrote under `--out` rather than leaving partial roots
behind.

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

PLANNED (2026-09-21): this requirement stands as the contract and has no proof yet. Its unit is file
3's V4, the maintainer-run private-chain rehearsal, which needs the maintainer's own fixture
repositories and a transient personal access token and therefore waits on the maintainer's go; the
proof of record is that rehearsal's record at
`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` on the day it lands, and until then no
clause above is claimed as met. The two fixture versions V4 reuses are REQ-PLUGIN-021's, which are
built and measured.

### REQ-PLUGIN-024 Documentation and pinned surfaces

Given the shipped documentation, When `docs/plugins.md` is read, Then it names the install
command for each of the four clients, the pin, update and rollback commands per client, the
ownership split, the `stamity plugin` subcommands, the Renovate presets and the private-mirror
route, with every command block copied from an executed run; the README's `## Commands` list, the
getting-started page's verb list and the CLI reference name `plugin`; the capability matrix
carries a `Plugin containers` section rendered from data; `llms.txt`, the sidebar and the README
map carry the new guide; and `test/docsPages.test.ts` exits 0 with its arrays and count words
moved in the same change.

As built (2026-09-20): the clause "with every command block copied from an executed run" did not
hold for the whole page and could not — four legs ran on real clients on this machine and the rest
are vendor-documented routes nothing here installed, so copying them from a run was never
available. The clause is amended to what shipped: EVERY command block on `docs/plugins.md` carries
a provenance line stating either the client and version it was executed on or the vendor page and
the access date it was transcribed from together with the proof that will execute it, and no block
is presented as executed when it was not — the contract is stated at the head of the install
section (`docs/plugins.md:74-78`) rather than left to the reader to infer per block. Executed:
`claude plugin validate --strict` on Claude Code 2.1.278; `agent --plugin-dir ./cursor --trust` on
the Cursor agent CLI 2026.09.15; GitHub Copilot CLI 1.0.85's `plugin install`, `plugin list --json`
and `skill list` in a scratch `HOME`/`COPILOT_HOME`; codex-cli 0.154.0's `plugin marketplace add`
and `plugin add` in a scratch `CODEX_HOME`. Everything else carries *from the vendor's <page>,
accessed 2026-09-20; executed by the route proof of the next session* — REQ-PLUGIN-020's V1, which
is the named proof, not a promise the page makes for itself. A hand-written page carries no
absolute URL under this project's docs contract, so the dated source URL behind each client's
container facts lives in the GENERATED page instead, as the `Sources:` list under
`docs/capability-matrix.md:115-120`. The same honesty rule reaches this requirement's "the pin,
update and rollback commands per client" clause, which two vendors cannot satisfy: what the page
names per client is the ROUTE, amended under REQ-PLUGIN-013 rather than a second time here. The
`Plugin containers` section is rendered from the four plugin emitter modules through ONE builder —
`buildPluginContainerFacts` in `scripts/plugin-container-facts.mjs`, imported by the generator
(`scripts/generate-capability-matrix.mjs:60`) and by the drift gate that would otherwise assert a
hand-kept copy (`test/emit/capabilityMatrix.test.ts:27`) — and its `Carries` and `Repository-owned`
columns PARTITION the six classes, so a class left without an owner is a test failure
rather than a silent omission. Two statements the requirement does not reach are on the guide because a reader moving
clients over one at a time needs them: the vendor-neutral `.agents/skills/` tree is co-owned and
stays written while any generated-mode client still reads it, and `plugin-duplicates` is
deliberately silent about the double delivery that staging produces, with the way out named as
moving the last reader rather than deleting the tree (`docs/plugins.md:59-67`, the disposition
recorded under REQ-PLUGIN-019). The pinned surfaces moved in the same change: README's
`## Commands` at ten verbs with `plugin` between `worktree` and `clean` and `README_MAX_LINES`
157 → 158 for the one added row, getting-started's verb list and its install-as-a-plugin section,
the llms index entry with `regenerateCommand: null` because the page is hand-written
(`src/cli/docs/llmsIndex.ts:170-174`) and `llms.txt`, the sidebar entry, and `test/docsPages.test.ts`'s
arrays, count words, guide counts and `REATTESTATION_DATE` 2026-09-20 with three pages re-stamped.

### REQ-PLUGIN-025 Eval coverage for the generated command and plugin-mode invocation

Given the eval set, When the release eval run executes, Then `cases-v6/` carries at least one
golden and one adversarial case for the generated `st-setup` command and at least one golden case
for plugin-mode invocation of a carried command, agent and skill under their namespaced forms,
each with its `source:` range, rubric and threshold declared under `evals/SET-v7.md` before the run;
`test/evals/coverage.test.ts` and `test/evals/locators.test.ts` exit 0 over the additions; the
committed run artifact under `evals/runs/` records a per-metric score at or above its threshold for
those cases; and a case that could not execute is recorded as blocked with its reason rather than
scored.

As built (2026-09-21): the three cases landed under `evals/cases-v6/` and every count they touch moved
with them. `st-setup-fresh-repository` (golden, rubric, 6 binding / 1 advisory) measures the clean
first run — `plugin status --json` through the root's own locator first, then `plugin setup --client
claude -y`, never `init` and never a bare `stamity` on `PATH`, closing on the resolved status and
claiming no file of a carried class. `st-setup-refuses-generated-setup` (adversarial, refusal, 6/1)
measures the AS-BUILT refusal rather than the cell's: the migration engine was cut on 2026-09-17, so
there is no `plugin migrate` preview to show; the run stops for the operator and names `clean -y` then
`plugin setup`, and one binding row refuses an invented `--apply` or migrate flag as well as the
operator's assertion that one exists (the refusal exits 1, so the case asserts no exit code).
`plugin-mode-invocation` (golden, rubric, 6/1 — corrected 2026-09-22 from a 5/1 miscount; the case
file carries six binding criteria, `evals/cases-v6/golden/plugin-mode-invocation.md:99-116`, and the
index row reads 6 / 1, `evals/SET-v7.md:596`) covers a command, an agent AND a skill under their
namespaced forms — `/stamity:st-plan`, `@stamity:stamity-researcher` and `/stamity:st-verify` with its
`scripts/` companion resolved inside the root — and its brief states that Cursor, Copilot and Codex
invocation is proven by REQ-PLUGIN-020's route proof instead of here. The three therefore add 18
binding and 3 advisory criteria, and that sum is what carries the set: run 30 measured 99 cases with
505 binding and 49 advisory (`evals/runs/2026-09-15-run-30/RESULTS.md:123`), so 505 + 18 = 523 and
49 + 3 = 52, SET-v7's own totals (`evals/SET-v7.md:123`).

One bound of the coverage gate is stated rather than left to a reader (2026-09-21). `st-setup` is
GENERATED, not corpus, so the gate admits a governing source outside `content/**` for a command the
root generates: `parseSource` accepts a `scripts/plugins/<name>.mjs` source beside `.md`,
`sourcedArtifacts` counts corpus sources only so the coverage sum still compares the five `content/`
globs against cases and exemptions alone, and `coverage.test.ts` NAMES every case governed outside the
corpus — so a third such case arrives as a red test rather than as a silent exemption, and no
coverage-exemption row was added. The harness's own `case-source` guard admits the same pair. The
recomputed roster is 102 cases — 52 golden, 20 adversarial (16 non-twin guardrails, 4 benign twins),
30 probes — with 23 floor cases, 523 binding and 52 advisory criteria and 83 non-negotiable rows across
28 cases, and the four roster-derived literals no test gates moved with it.

The clause about the committed run artifact is MET (2026-09-22): `evals/runs/2026-09-21-run-31/` is
committed at `3e76f7b`, status PASS over 102 cases at eval candidate `063832d`. It is an increment
under SET-v7's incremental rule — 29 calls, five calibration fixtures then four cases at three samples
for two roles — re-measuring the three cases above, each absent at the prior candidate, and
`agent-test-runner-return-contract`, whose cited source range moved, and carrying the remaining 98
cases with the three admitted samples the run-30 artifact published, every case file and every cited
source range found byte-identical at both candidates (`RESULTS.md:12-19`). Calibration matched 5 of 5
fixtures. Every metric sits at or above its declared threshold: golden rubric pass rate 1.000 (52/52)
with floors 23/23, adversarial guardrail hold rate 1.000 (16/16), benign-twin false-refusal rate 0.000
(0/4) and trigger-probe accuracy 1.000 (30/30) (`RESULTS.md:160-163`). All three cases of this
requirement passed — `st-setup-fresh-repository` and `st-setup-refuses-generated-setup` 3 of 3 samples,
`plugin-mode-invocation` 2 of 3 under the two-of-three rule, its one failing sample decided on B4
(`RESULTS.md:188`, `:218`, `:237`). The clause about a case recorded as blocked names nothing this run:
12 scenario samples of 12 and 12 independent judges of 12 were admitted, with no blocked logical call.

### REQ-PLUGIN-026 Existing routes unchanged

Given the repository at the change's head, When the existing surfaces are compared with their
pre-change bytes, Then `init`, `sync`, `check` and `clean` on a manifest without a `plugin` field
produce byte-identical output trees (the cross-client golden snapshot is unchanged without `-u`),
`node scripts/generate-apm-package.mjs --check` and `node scripts/generate-plugin-manifests.mjs --check`
exit 0 on the committed files, every existing command name and public JavaScript import
resolves unchanged, and the full gate exits 0.

As built (2026-09-20): `node scripts/generate-apm-package.mjs --check` and
`node scripts/generate-plugin-manifests.mjs --check` exit 0 on the committed files at every
integration of this session, and every byte-identity suite ran without `-u`. The clause about
byte-identical output trees needs one qualification, stated rather than glossed: the emitted guard
and runner BODIES did move, by design and in repository mode — P2b's policy-document resolver,
fixer round 1's hardening and fixer round 2b's symlink refusal each added bytes to the four guard
bodies and the three runner bodies — and each change regenerated the two golden files' affected
rows and the dogfood manifest hashes in its own commit. No command string and no configuration
document moved with them. What this requirement now proves is narrower and checkable: no snapshot
row moves except where a named unit regenerated it with its reason, and the cross-client golden is
byte-stable for every unit that did not.

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
