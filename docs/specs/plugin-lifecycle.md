---
id: plugin-lifecycle
# A design document, authored from docs/plans/008-plugin-lifecycle-01.md to -03.md on 2026-09-17, amended from docs/plans/010-enterprise-release-01.md on 2026-09-26 and from docs/plans/013-optimization-sweep-02.md and -03.md on 2026-09-30, amended at the close of run 2026-10-03_pack-engine-defects on 2026-10-06, amended from docs/plans/016-fork-distribution-00.md at the Prove phase of run 2026-10-07_security-fixes on 2026-10-07, amended in run 2026-10-08_maintainer-tooling on 2026-10-08, and excluded from the site build.
status: shipped-with-1.12.0
obsolete_when: every supported client installs the corpus through its own plugin container and the generated-setup route is retired, or a decision row cuts the surface
---
# Plugin lifecycle

The requirement set for distributing this product as a native plugin per client (Claude Code,
Cursor, the GitHub Copilot CLI, Codex) from one resolved corpus, with a bundled runtime, a
versioned release and update contract an organization's catalog and Renovate can consume, a
plugin-backed project setup mode, and a demonstrated consumer lifecycle. Requirement paragraphs
are the plan files' own delta sections, assembled here so the two cannot disagree; `/st-work`
moved `status` to `shipped-with-1.9.0` at that close. `REQ-PLUGIN-018` is not allocated: the
CLI-to-plugin migration it would have carried was cut on 2026-09-17 because the consuming
enterprise re-creates its private fork and sets its repositories up fresh.

REQ-PLUGIN-027 to REQ-PLUGIN-030, and every paragraph headed "Amended 2026-09-26", come from the
spec delta of `docs/plans/010-enterprise-release-01.md` (the enterprise work of Package 16) and
from the deltas its units' reports declared. They shipped with 1.10.0, while `status` still named
1.9.0, the release that shipped REQ-PLUGIN-001 to 026. Their
`path:line` citations are to the tree at `e995fe02`, re-pointed to the package head `0a251039`
where the cited file changed since.

The paragraphs headed "Amended 2026-10-06" under REQ-PLUGIN-016 and REQ-PLUGIN-019 come from the
spec deltas the units `u4a-pack-skill-origin` and `u4b-pack-reach-row` declared in run
`2026-10-03_pack-engine-defects`, merged at its close, measured against the code where a report and
the code differ. They cite the tree at `eb4f0727` and shipped with 1.12.0.

REQ-PLUGIN-045 to REQ-PLUGIN-048, and the paragraphs headed "Amended 2026-10-07" under REQ-PLUGIN-015 and
REQ-PLUGIN-016, come from the spec delta of `docs/plans/016-fork-distribution-00.md` — file 0 of plan 016, the five
security fixes of the released 1.11.0 — merged at the Prove phase of run `2026-10-07_security-fixes`. The ids
REQ-PLUGIN-031 to 044 belong to files 1 to 3 of the same plan, which merge later, so the ids here leave a gap. The
"Evidence" sentences cite the tree the defects were measured on, `d10db029`; the sentences headed "Amended 2026-10-07
(build)" say what the build settled and name the code by path and symbol on the run's integration branch
(`fix/plan-016-file-0` at `fa8163a3`; the registry unit and the hook-file unit's JSON half, integrated after the merge,
at their integration commits, `u0-registry-bound-calls` at `6d2fb2e7` and the JSON half at `8d4b932e`). All five units
are integrated. They shipped with 1.12.0, which set `status` to `shipped-with-1.12.0`.

The paragraphs headed "Amended 2026-10-08" that name run `2026-10-08_maintainer-tooling` come from that run's spec
deltas (plan 019 file 1), each taken from the latest unit or fixer report that states it and read against the
integration head `47acb16e`; lane D's, under REQ-PLUGIN-045 and REQ-PLUGIN-046, against `dbd54fc7`. They are
unreleased, and `status` does not move.

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
layer and enterprise upstream lane specs stay as shipped; REQ-PLUGIN-026 says so. The enterprise
work of 2026-09-24 — a fork's own release workflow, a one-command identity step, the Codex half of
the private route, a Claude Code managed-settings template and a quickstart page — and the
maintainer's decisions behind it are recorded in `docs/plans/010-enterprise-release-01.md`.

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

Amended 2026-09-26 (plan 010 file 1, unit `e6-claude-install-note`, `prove/338`; the statement
above is unchanged, because it pins the capability file's keys and not the note's words): the
Claude root's `distribution.note` says what each command writes. `claude plugin install
stamity@stamity --scope project` writes `enabledPlugins` alone into the project's
`.claude/settings.json`, and `claude plugin marketplace add` declares the marketplace in the
configuration directory's user settings, measured on Claude Code 2.1.278 (2026-09-22) and 2.1.280
(2026-09-23). The note no longer credits the install with `extraKnownMarketplaces`
(`scripts/plugins/clients/claude.mjs:162-168`; test: `test/ci/pluginPackages.claude.test.ts`).

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

Amended 2026-09-30 (`docs/plans/013-optimization-sweep-02.md`, units `sw26-cli-token` and
`sw26-engine-cli-call-form`; cited at `b855876a`): the wired list holds ten tokens, and nine are mapped. The tenth,
`${STAMITY:CLI}`, maps to a literal rather than a phrase: the pinned call `npx -y <package>@<plugin version>`, or
`npx --no <package>@<plugin version>` for a package with no npm channel, from inputs the plugin build passes in, so
the value is fixed at build time and never read off the consuming repository; a build that passes none leaves the
token unresolved and the body is refused (`scripts/plugins/tokens.mjs:12-17`, `:50-62`, `:107-118`).
`${STAMITY:INVARIANTS_VERSION}` is still refused. The call form itself is REQ-FLOW-002 in
`docs/specs/everyday-flows.md`.

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
client moves back to a required dependency (`test/docsPages.test.ts:1887-1894`).

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

Amended 2026-09-26 (plan 010 file 1, `prove/337`): the locator hands its root to `check` through
the child's environment.

- GIVEN `locate.mjs -- check`, no plugin-root variable set, and `stamity-plugin.json` beside the
  runtime, WHEN the locator spawns THEN the child's environment carries `PLUGIN_ROOT=<root>` and
  its argv is unchanged.
- An already-set root variable passes through untouched.
- `plugin` subcommands still receive `--plugin-root`.

As built (2026-09-26): `checkEnvironment` (`scripts/plugins/locate.mjs:400-406`) adds
`PLUGIN_ROOT` only when all three hold: the subcommand is `check`; no variable in `ROOT_VARIABLES`
(`:382`) holds a value that is not blank after trimming, so a blank one reads as unset; and
`<root>/stamity-plugin.json` is a regular file (`isRegularFile`, `:385-391`), so a directory or a
symbolic link there adds nothing. The spawn passes that environment at `:408-413`. `withPluginRoot`
(`:367-375`) is unchanged, so `plugin` subcommands still get the flag and every other subcommand
gets neither the flag nor the variable. `check` takes no options, which is why its root travels
in the environment. `ROOT_VARIABLES` is a copy of `PLUGIN_ROOT_VARIABLES`
(`src/plugins/capabilityFile.ts:441`), because the locator imports builtins only, and a test pins
the two equal. Tests: `test/ci/pluginLocate.test.ts:487`, the describe "hands check its root
through the child's environment (prove/337)".

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
the publisher to the owner in `repository.url` (`resolveDistributionIdentity`, `:278-299`). A
credential-shaped key is refused by its path rather than only at the block's top level, so the
refusal names `sources.<client>.<key>` (`refuseCredentials`, `:82-110`). The host boundary is per
kind: the identity's own `repository.url` stays on github.com (`:301-311`), a `github` source on
any other host is refused with a message naming `git-subdir` as the host-neutral kind
(`:186-195`), and `git-subdir` and `archive` admit any https host whose URL carries no credentials
in its userinfo, which also refuses an ssh remote (`requireCleanUrl`, `:123-139`). Line ranges
re-pointed 2026-09-22 at the shipping tree.

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

Amended 2026-09-26 (plan 010 file 1, unit `e2-fork-identity-script`): a fork moves the two presets
with `scripts/fork-identity.mjs` (REQ-PLUGIN-028) instead of by hand. The script finds each current
value by parsing — `renovate/plugins.json`'s `customManagers[0].depNameTemplate` and
`renovate/companion.json`'s `packageRules[0].matchPackageNames[0]` — and replaces exactly that
quoted string once in the text, so the file keeps its hand formatting, and it refuses a rewrite
whose result parses to anything but that one change (`scripts/fork-identity.mjs:199-250`). The
preset files themselves are unchanged in this repository.

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
`codex plugin remove stamity@stamity` (amended 2026-09-22 from the bare `codex plugin remove
stamity`: on codex-cli 0.154.0 `plugin remove` takes `<plugin>@<marketplace>`, the spelling
`clean -y` prints and the 2026-09-21 paragraph under REQ-PLUGIN-021 records) followed by adding
the marketplace at the earlier tag and `codex plugin add` again — four commands as the built tree's
`README.md` prints them (amended 2026-09-22): `codex plugin remove stamity@stamity`,
`codex plugin marketplace remove stamity`, `codex plugin marketplace add <owner>/stamity --ref
plugins/v<previous>`, `codex plugin add stamity@stamity`. The `marketplace remove` verb was first
read from `codex plugin marketplace --help` on 0.155.1. Amended 2026-09-26 (plan 010 file 1, the
Codex walk E3): all four commands were walked on 2026-09-24 on codex-cli 0.155.1 against a private
mirror, each exiting 0, and the walk measured why `marketplace remove` must come before the re-add
— it is required, not a precaution. A re-add at another ref over a git marketplace already on
record exits 1 with `marketplace 'stamity' is already added from a different source; remove it
before adding this source`, and the ref, the checkout and the installed version stay where they
were (`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md:303-310`). `docs/plugins.md`
prints the same four and says which were walked (`docs/plugins.md:437-454`). The clause is
therefore amended
to read "through the route `docs/plugins.md` records per client — a vendor command where one
exists, and a documented re-add at the earlier pin where none does" (`docs/plugins.md:364-459`,
the **Pin, update, roll back** section, re-pointed 2026-09-26), which is what the lifecycle proof will
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
called `stamity`. (Amended 2026-09-30, `docs/plans/013-optimization-sweep-02.md` unit
`sw26-engine-cli-call-form`: `packageCommand()` now prints the pinned call at the running version,
`npx -y <name>@<version> <verb>`, or `npx --no …` for a package with no npm channel, and keeps
`--no` when it cannot pin; `src/cli/kit/packageName.ts:196-227` at `b855876a`.) Placement moved with the architecture gate: the setup engine is a CLI-layer
module at `src/cli/commands/plugin/setup.ts` (wave 15) because it must import the CLI's
`init/plan.ts` and `init/apply.ts`, and `status` is its CLI-layer sibling for the same reason one
level removed (its duplicates remedy composes through the CLI's package-name kit); only the
capability-file reader stays in the engine, registered as the group `plugins: { capabilityFile }`.
`plugin setup` is prompt-free — the init planner it calls asks nothing — so `-y` is inert.

As built (2026-09-22), amended 2026-10-07 (plan 016 file 0, unit `u0-settings-ownership`): `.claude/settings.json`
is owned per entry, not as a file and not per top-level key (REQ-FLOW-036). The engine owns each `permissions.allow` row
and each hook entry it wrote. It carries every other member through as its parsed value, in the file's own indentation,
key order, line ending and final newline: the client's `enabledPlugins`, an operator's `model`, `env`,
`permissions.deny` and `ask`, and their own rows and entries. So a setup run after
`claude plugin install stamity@stamity --scope project` merges into the file the client wrote and prints a notice naming
what it kept. In the other order the client's key lands beside a ledgered file and survives the same way. A lost setup
can leave a repository-mode hook entry behind, recognised by a command that runs a script under
`.stamity/generated/hooks/`. That entry is the engine's to touch even with no ledger row: a plugin-backed setup removes
it and a repository-owned one replaces it, behind a verified `.bak` unless the ledger proves it. The file collides only
when it is not a JSON object, cannot be serialised back, or a member the engine writes into has another type. The
refusal names the member, and `--force` does not clear it. A symbolic or hard link at the path is refused before any
read. The `hooks` half of the boundary REQ-PLUGIN-016 draws is unchanged. (It read "owned per top-level key" and
"`--force` clears it behind a verified `.bak` of the file, replacing only the engine's keys".)

As built (2026-10-07): the per-entry core is `src/manifest/coOwnedJson.ts`, which `src/manifest/claudeSettings.ts`
parameterises (`claudeSettingsSpec`: the `permissions.allow` rows bounded by `ENGINE_PERMISSION_ROWS`, the hook entries
recognised by `isEngineHookGroup`); the link refusal is `refuseLinkedCoOwnedTarget(filePath)` in the core, its texts
unchanged; the record is `LedgerEntry.coOwned`. A leading byte-order mark is kept on the write
(`src/manifest/jsonMembers.ts`, `JsonStyle.bom`), and a document that cannot round-trip — a duplicate key, a number a
double cannot hold exactly (`roundTripLoss`) — is backed up before any write, its warning naming why. The criteria are
those of REQ-FLOW-036.

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

Amended 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). "Only ledger rows" is bounded. Every row names a path
inside the owned-path bound of REQ-PLUGIN-045, or the manifest is refused when it is read: `check` fails its `manifest`
row naming the row, and `sync` and `clean` act on nothing. Inside the bound, a row licenses a whole-file delete or an
overwrite without a backup only together with the bytes: a recorded `contentHash` that matches the file, an
engine-minted name in a content folder, and at an instruction file or the Copilot setup workflow bytes that show the
engine wrote them (REQ-PLUGIN-046); or a managed block spanning the file. A row with no `contentHash` proves nothing:
the sweep keeps its file, and an overwrite takes a verified `.bak` first.

- GIVEN a committed ledger row outside the bound WHEN `check` runs THEN it exits 1 and the `manifest` row names the row;
  WHEN `sync -y` or `clean -y` runs THEN it exits 1 with `CONFIG_ERROR` naming the row and `git status --porcelain`
  prints nothing.
- GIVEN an in-bound engine-named row with no `contentHash` WHEN `sync -y` reclaims it THEN the file stays and the sweep
  names it `skipped-unsafe-path`.

As built (2026-10-07): the evidence, measured at `d10db029` — hand-added rows made `sync -y` (exit 0) delete five owner
files and overwrite a sixth with no `.bak`, `clean -y` deleted the same, and `check` reported them only as "5 queued for
reclaim" (`src/manifest/ledger.ts:157-163`, `src/merge/reclaim.ts:327-338`, `:345-347`, `:372-375`, `:743-763`,
`src/merge/safeWrite.ts:863-877`, `:922-932`, `src/cli/commands/check.ts:1503` at that commit). The bound and its proofs
are those of REQ-PLUGIN-045 and REQ-PLUGIN-046, with their tests.

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

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `b4-no-read-allow-rows`): `.claude/settings.json` no
longer splits that way. The engine renders no `permissions` member under either install mode; its `hooks` object is
still emitted only when hooks are not plugin-owned, so under a plugin that carries hooks the engine's rendering is `{}`,
and the settings row stays planned (`src/adapters/claude.ts`, `buildSettingsJson` and the settings row it feeds). That
planned row is how a recorded allow row leaves, by the per-entry merge, on the next `sync` (REQ-FLOW-025,
REQ-FLOW-036); `plugin setup` refuses a repository that already carries a setup, so it is not that path. A `permissions`
member that is not an object, or an `allow` that is not an array, still collides on both routes, as it did while
releases up to 1.12.0 rendered the rows (`planClaudeSettings`, `src/manifest/claudeSettings.ts`). It read: "its
`permissions` half always emitted".

- GIVEN `plugin setup --client claude -y` over a repository whose `.claude/settings.json` holds only `enabledPlugins`
  THEN the file holds the client's bytes unchanged, `enabledPlugins` alone with no `permissions` key, the settings row
  reports `unchanged`, and the notice names the kept entry. GIVEN a plugin-backed setup whose ledger records the three
  rows WHEN `sync -y` runs THEN the rows leave with no `.bak` and `enabledPlugins` stays. Test evidence:
  `test/cli/commands/plugin.test.ts`, `test/cli/commands/pluginSetup.test.ts`, `test/adapters/claude.test.ts`,
  `test/merge/settingsKeyOwnership.test.ts`.

As built (2026-09-21), one row of the runtime surface these doctor rows share: the `node` row is
never `unstated` when no root's locator answers. `requiredNodeRange()` moved out of its private home
in `check.ts` into the shared probe, where `engineNodeFacts()` reads this build's declared
`>=22.22.2` and computes `ok` against it, and ONE exported tri-state `judgeNodeFloor` is called by
both readers, so `check`'s row stays byte-identical arm by arm instead of two surfaces composing the
same judgment twice.

As built (2026-09-22), amended 2026-10-07 (plan 016 file 0, unit `u0-settings-ownership`): the settings document under
the boundary. `sync` and `check` plan `.claude/settings.json` per entry (REQ-FLOW-036), and `check`'s drift gate previews
exactly the write `sync` would make. The engine owns each `permissions.allow` row and each hook entry it wrote. The
ledger records each by the hash of its canonical JSON, and the engine owns nothing else in the file: it never writes or
removes `permissions.deny`, `permissions.ask` or an owner's entry. An entry equal to the rendering needs no proof. An
engine entry that leaves or changes goes silently only when the ledger records it (or proves the file unedited) and it
lies inside the engine's bound: an allow row a release rendered (`Read`, `Grep`, `Glob`; the engine renders none since
2026-10-08, and before it read "an allow row the engine renders"), or a hook entry whose every command runs a script under
`.stamity/`. Otherwise it goes behind a verified `.bak`, whose warning names the entry and `.claude/settings.local.json`
for personal rows. `clean`, and a client's removal through the reclaim sweep, remove the engine's entries, a stale
repository-mode hook entry included (recognised by its script under `.stamity/generated/hooks/`). They keep every other
member and delete the file only when the engine created it and nothing foreign remains
(`reduceClaudeSettingsToForeignContent`; `src/merge/reclaim.ts`, gate 4). The reclaim takes a backup only when an entry
it removes is not proven. A key another tool added needs none. A backup that cannot be taken refuses the removal and
leaves the file untouched: a backup or nothing. The file collides only when it is not a JSON object or a member the
engine writes into has another type. The collision names the member, `--force` does not clear it, and `check`'s step
for it does not offer `--force`. Under a plugin-backed setup an operator's own `hooks` key is still reported by
`check`'s `plugin-duplicates` row and by `plugin status` as an `unmanaged` hooks duplicate
(`src/cli/commands/plugin/probe.ts`, `settingsHooksDuplicate`). (It read "strip only the keys the install mode makes the
engine's" and "behind a verified `.bak` when the file's bytes no longer hash to what the ledger recorded".) Amended
2026-10-07 (build): "runs a script under `.stamity/`" reads as the script the command executes, in the engine's own
script folders — `.stamity/generated/hooks/` or an installed pack's `.stamity/packs/<id>/`, never the user's
`.stamity/hooks/` (`commandRunsStateScript`, `src/manifest/coOwnedJson.ts`); a user-hook entry is proven only by
re-rendering a definition still in `.stamity/hooks/`. `check`'s drift gate passes the write's own ledger hashes to the
prediction, so "previews exactly the write" holds for every co-owned lane. A hashless co-owned row reads as drifted. A
refused document keeps its ledger rows and record, and `clean` keeps every engine hook script a kept hooks document
still runs.

- GIVEN a plugin-backed setup and a `.claude/settings.json` to which another tool added a key WHEN `clean -y` runs THEN the
  file holds exactly that foreign key, and no `.bak` exists anywhere in the repository.
- GIVEN an engine hook entry the operator edited WHEN `clean -y` runs THEN a verified `.bak` exists and the output names
  that entry.

As built (2026-10-07): the lanes are registered in `coOwnedDocumentLanes` (`src/cli/engine/emissionWrite.ts`), and the
ownership each verb passes is `coOwnedOwnershipOf`; the proof by re-rendering a user hook is `coOwnedReclaimRenderings`
in the same module. Tests: `test/merge/settingsOwnerEntries.test.ts`, `test/merge/settingsKeyOwnership.test.ts`,
`test/manifest/coOwnedJson.test.ts`, `test/merge/reclaim.test.ts` (100% coverage).

Amended 2026-09-26 (plan 010 file 1, `prove/337`): the `plugin-runtime` row's warning names a step
a person can take. The `warn` for a recorded client with no root in the environment now reads
`no plugin root in the environment; run check through the installed root's locator (node
<root>/runtime/locate.mjs -- check) or set PLUGIN_ROOT to that root`. It used to end `run this
check through the plugin's st-setup or set CLAUDE_PLUGIN_ROOT`, and neither half could be
followed: the generated st-setup command never runs `check`, and the variable named one client.

- GIVEN a recorded client and a `check` run through the locator THEN the row reads `pass`.

As built (2026-09-26): the warning is `src/cli/commands/check.ts:921-927`, and the locator hands
the root over as REQ-PLUGIN-007's amendment states. `docs/plugins.md:560` and
`docs/troubleshooting.md:102` print the same remedy. Tests: `test/cli/commands/check.test.ts:1901`
pins the warning, and `:1918` runs the real locator into the row and reads `pass`. The Codex walk
of 2026-09-24 reproduced the old warning on a 1.9.0 root, where it named the Claude variable on a
Codex-only consumer (`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md:302`).

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, units `u4a-pack-skill-origin` and
`u4b-pack-reach-row`, integrated as `efc7b79d` and `778c9ef0` with their fix rounds; cited at
`eb4f0727`). Two facts about installed packs under the boundary.

- **Pack skills reach plugin-backed clients; nothing else of a pack is exempt.** The 2026-09-20 sentence
  "a pack skill row is exempt" held for no row: the pack skill lane built its rows without `origin`,
  so both exemptions read them as core rows and dropped them. `projectOnePackSkill` now stamps
  `origin: "pack"` on every row it builds, `SKILL.md` and support files alike
  (`src/pack/projection.ts:623-634`). The shared tree keeps every reader as an owner of a pack row
  (`src/emit/planner.ts:1016-1023`), and Claude's native copy keeps a pack row when its plugin
  carries `skill` (`src/adapters/claude.ts:548-562`). So an installed pack's skill directory is
  written into each selected client's skills tree (`.claude/skills/` for Claude Code, the shared
  `.agents/skills/` for Cursor, Copilot and Codex) even where that client's plugin carries the
  `skill` class. The exemption is for skills only: pack commands, agents, rules and hooks are still
  dropped wherever the client's plugin carries their class, and the `pack-reach` row names each one.
- **The doctor rows gain `pack-reach`,** printed after `plugin-duplicates` and before `invariants`,
  so `check` prints fifteen rows (`src/cli/commands/check.ts:1415-1437`, `:1458-1463`). Its judgment
  is the emission plan's own `packReach` (`src/types/content.ts:146-201`; set at
  `src/emit/planner.ts:1131-1133` by `packReachOf`, `:1146-1258`), read off each artifact's `tools:`
  list and `isPluginOwned` rather than off the planned rows, because a pack rule reaches Codex as
  text inside the composite appendix, which no per-rule row owns. A pack skill reaches every selected
  client; an agent, rule or command reaches every client its `tools:` list admits whose plugin does
  not carry its class; each accepted pack hook file reaches every client whose hooks this repository
  wires; an MCP server reaches every selected client once `manifest.mcp.servers` selects it, and
  none, dropped as `not selected`, until then. The row (`checkPackReach`,
  `src/cli/commands/check.ts:1143-1294`) reads:
  - `pass` with no readable manifest, and with no `pack:` row in the ledger, planning nothing
    (`:1188-1193`); otherwise `pass` when no pack is in a state below, naming the artifact counts and
    any artifact that reaches no client for a reason of its own (`:1280-1293`);
  - `fail`, so `check` exits 1, for an installed pack none of whose artifacts reaches a selected
    client and that supplies no unselected MCP server (`:1231-1234`, `:1266-1276`). It names the
    pack, each artifact and why (the plugin that carries its class, or its own `tools:` list), then
    the remedies that run: `clean --pack <id>` in the pinned call form, and, where an artifact's
    `tools:` list names a client, the `config set tools` call that adds it, then `sync`
    (`describeSilentPack`, `:1336-1360`);
  - `warn`, exit 0, for a pack that reaches some client while a plugin drops one of its artifacts for
    another, each named; a pack whose only remaining delivery is an MCP server nobody selected,
    naming `config mcp add <id>`; a pack the organisation's trust policy denies; and a pack that
    ships nothing a client loads, every hook row it ships rejected (`:1235-1262`, `:1277-1279`);
  - `warn` "not evaluated" when the plan cannot be built, the drift gate carrying the failure
    (`:1216-1224`).

  With a pack installed the row runs one emission plan of its own beside the drift gate's, and keeps
  that plan's policy-denial lines off stderr so each prints once (`withoutPolicyWarningPrint`,
  `src/pack/projection.ts:463-478`). Every pack-supplied id it prints passes through `sanitizeLabel`.

- GIVEN `plugin.mode: "plugin-backed"` with every selected client's plugin carrying `skill` and an
  installed pack skill WHEN `stamity sync` runs THEN the pack skill's files are written into each
  client's skills tree and no corpus skill is (`test/pack/projection.test.ts:492`;
  `test/pack/packEngineDefects.test.ts:680`, D1).
- GIVEN an installed command-only pack and a plugin that carries `command` for the only selected
  client WHEN `stamity check` runs THEN `pack-reach` is `fail`, names the pack, the command and the
  plugin, and `check` exits 1 with drift clean; GIVEN a second selected client whose plugin does not
  carry `command` THEN it is `warn`, naming the dropped command and the client it reaches; GIVEN no
  pack installed THEN it is `pass` and nothing is planned (`test/cli/commands/check.test.ts`,
  describe "check — pack-reach", `:3452`; `packEngineDefects.test.ts:705`, D2).
- GIVEN a pack whose only artifact is an MCP server the manifest does not select THEN `pack-reach` is
  `warn`, naming `config mcp add <id>`; GIVEN a pack the trust policy denies, or one whose every hook
  row was rejected, THEN it is `warn`; GIVEN a plan that cannot be built THEN it is `warn` "not
  evaluated" and the drift gate fails (the same describe; `test/emit/plannerPackReach.test.ts`).

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
`.prompt.md` precede the bare `.md` they end with (`NATIVE_CONTENT_EXTENSIONS`,
`src/cli/commands/plugin/probe.ts:464-480`),
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

Amended 2026-10-06 (run `2026-10-03_pack-engine-defects`, unit `u4a-pack-skill-origin` and its
`review/5` fix, integrated as `efc7b79d`; cited at `eb4f0727`). The companion of REQ-PLUGIN-016's
pack-skill exemption: a client's `skill` ledger row inside an installed pack skill's folder is not a
duplicate and is not counted. A pack skill's client rows are recorded like a core skill's, and
`origin` never reaches the ledger, so the folder is read off the install's own `pack:<id>` rows,
whose artifact ids are `<id>/skills/<folder>/…` (`packSkillDirs`,
`src/cli/commands/plugin/probe.ts:729-764`); a row is skipped when its path is under that client's
own skills directory, in one of those folders (`isPackSkillRow`, `:766-780`, applied to the ledger
source at `:809-811`). The key is the folder, not each recorded file, so a support file no pack row
records is exempt too. A core skill is never skipped: the catalog and the projection merge refuse a
core skill that shares a pack skill's folder before anything is written. Every other row of a
carried class, a pack command's or agent's included, is still reported.

- GIVEN a core skill's ledger rows and an installed pack skill's rows beside a plugin that carries
  `skill` WHEN `stamity check` runs THEN `plugin-duplicates` is `fail` naming the core skill's path
  and not the pack skill's; once emission re-runs under the plugin THEN it is `pass`, while each
  client's ledger still holds the pack skill's files (`test/cli/commands/check.test.ts:2942`, and the
  unrecorded support-file case at `:3051`).
- GIVEN a stale pack command and agent beside a plugin that carries their classes THEN
  `plugin-duplicates` is `fail` naming both, and not the pack skill beside them (`:3134`).

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
a reason. (Amended 2026-09-30, `docs/plans/013-optimization-sweep-02.md` unit
`qa-harness-accepted-unwalked`: a row may also read `accepted-unwalked`, a person's sign-off without
a walk, which holds for its run only and reopens as `unperformed` on the next one;
`scripts/qa/bind.mjs:29-36` at `b855876a`, REQ-PROVE-021.)

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

Amended 2026-09-30 (`docs/plans/013-optimization-sweep-03.md`, unit `sw06-records-only-ci-lane`, ledger
`build/82`): "merge-blocking through `all-ci-checks`" holds on every change that is not records-only. A push or pull
request whose every changed path is a record — under `.stamity/runs/`, `.stamity/handoffs/` or `docs/plans/`, or
`.stamity/inbox.md` — skips `plugin-route`, `check` and `apm-install`, and runs the `records` job in their place; the
aggregator asserts which side ran, so a records-only pass never stands in for a full one
(`.github/workflows/ci.yml:19-31` at `b855876a`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `a1-proven-push` and `a2-ci-lanes`): "merge-blocking
through `all-ci-checks`" holds on every change that no lane covers and no proven push skips. A change whose every path
sits in a lane skips `plugin-route` with `check` and `apm-install`, and the `lanes` job runs in their place; a push
whose tree a pull request already proved skips all of them (REQ-PROVE-030, REQ-PROVE-031;
`.github/workflows/ci.yml:19-68` at `47acb16e`). It replaces the reading "holds on every change that is not
records-only".

Amended 2026-09-26 (plan 010 file 1, units `e3-codex-remote-walk` and `e3-codex-install-ref`): the
Codex route now runs against a remote source, and its install line carries a ref. On codex-cli
0.155.1, `codex plugin marketplace add <owner>/<repo> --ref <ref>` cloned a private mirror of the
distribution through git's credential helper, with Codex not logged in and no token in any argv,
and `codex plugin add stamity@stamity` installed a root whose per-file sha-256 map equals the
tag's `codex/` tree: 681 files at `plugins/v1.9.0`, 682 at `plugins/v1.9.1`
(`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md:295-299`, `:305-308`). The same walk
measured the form without `--ref`: the default branch carries no Codex catalog, so the client falls
back to that branch's Claude catalog and installs the npm package it names — on the mirror, the
public package, with no `runtime/`, no hooks and no locator — and both commands still exit 0
(`:311-317`). For a private fork that swaps the private source for the public registry, so:

- GIVEN one identity THEN the Codex root README's install command equals the distribution README's,
  `codex plugin marketplace add <owner>/<repo> --ref <distribution branch>`, its pin is
  `--ref <release tag>`, and neither README offers a `marketplace add` without `--ref`.
- GIVEN `docs/plugins.md` THEN every Codex `marketplace add` line carries `--ref`, and the page says
  why the form without it installs the npm package instead of the distribution's Codex root.

As built (2026-09-26): the Codex root README prints the branch form at
`scripts/plugins/clients/codex.mjs:163`, the reason at `:167-171`, the pin at `:222` and the route
back at `:229-238`, each built from the resolved `stamity.distribution` (`:150-155`), so a fork
with its own branch and tag pattern gets its own refs; the distribution README prints the same
lines (`scripts/build-plugin-distribution.mjs:305-322`). The route back is REQ-PLUGIN-013's four
commands, walked by the same walk (see the amendment there). Tests:
`test/ci/pluginPackages.codex.test.ts:528`, the describe "the root README's routes against the
distribution README's, for one identity"; `test/ci/pluginDistribution.test.ts:744`, "a fork with its
own distribution branch and tag pattern"; `test/docsPages.test.ts:2172`, "the plugins guide adds a
Codex marketplace only at a ref". The page's Codex block and its reason are
`docs/plugins.md:235-264`. Two things stay unmeasured and the record says so: the form without
`--ref` against this repository's own public slug (`private-chain.md:378-380`), and skill discovery
in a Codex session, which needs a login (`:319`).

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

As built (2026-09-22): the maintainer-run private-chain rehearsal, file 3's V4, ran on this day
against the maintainer's own private fixture repositories, and its record is the proof of record —
`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`, every step with its command, its exit
code and the sha-256 of its captured output. Every Then-clause above is met as measured, with two
amendments. The APM pull request changes `apm.yml`, its lock AND the files the install deploys,
because Renovate's native `apm` manager runs `apm install` inside its own run — the rehearsal's
pull request carried the marker skill's file beside the manifest and the lock — so "changing only
`apm.yml` and its lock" reads as the manifest, the lock and what that install deploys. And the
per-file sha-256 equality of the pinned-back trees excludes the client's own `.orphaned_at`
bookkeeping file, which Claude Code writes into the superseded version's cache directory at an
update; the 288 content files compare equal. The owner-dependent items are recorded in that record
as `Not done` lines, never as passes: required-check enforcement on the private plan, the
enterprise's own catalog approval, and network mirroring of the distribution to a host that is not
github.com (the record's remaining `Not done` lines are scope statements, not owner items). One
finding of the rehearsal went back to the code: the documented consumer route — the client's
install first, then `plugin setup` — ended in a red `check` (`collision .claude/settings.json`, the
file the client had written and the setup then skipped), fixed on the branch by key-level
ownership of that file. The two fixture versions the rehearsal reused are REQ-PLUGIN-021's.

Amended 2026-09-26 (plan 010 file 1, E3): the Codex half of the private route is walked against the
private mirror and recorded in the same record with the same row format. The record's "Not done"
line narrows to Cursor's team marketplace.

- GIVEN the walk THEN add, install, the cache's per-file sha-256 map against the tag's `codex/`
  tree, setup and the route back are recorded with exit codes and digests, and the leak gate passes
  over the record.

As built (walked 2026-09-24): the section "The Codex half (E3), 2026-09-24" is
`.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md:272-362`, each row with its UTC time,
its exit code and the sha-256 of its raw capture, and the full digests under "Captured output
digests" (`:396` onward). Add, install and list are rows E3-C2 to E3-C4 (`:295-297`); the cache's
sha-256 map equals the `plugins/v1.9.0` `codex/` tree over 681 files (E3-C5b, `:299`), and a
control comparison against the other tag reads `DIFFERENT`, so the comparison tells versions apart
(`:309`). Setup (E3-C6, `:300-302`): on the existing plugin consumer the Codex setup was refused,
because that repository already carries a generated setup, so it ran in a fresh repository, where
it exited 0 and wrote `[features] hooks = true`. The route back (E3-C7, `:303-310`) is
REQ-PLUGIN-013's four commands. The leak gate exited 0 with the record present (E3-C10, `:320`).
The "Not done" line on the private route now names the Cursor half only, and says the Cursor team
marketplace is not walked at all (`:372-375`); two new "Not done" lines name skill discovery in a
Codex session (`:376-377`) and the form without `--ref` against this repository's public slug
(`:378-380`).

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
section (the opening paragraph of `## Install` in `docs/plugins.md`) rather than left to the reader to infer per block. Executed:
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
moving the last reader rather than deleting the tree (`docs/plugins.md:69-77`, the disposition
recorded under REQ-PLUGIN-019). The pinned surfaces moved in the same change: README's
`## Commands` at ten verbs with `plugin` between `worktree` and `clean` and `README_MAX_LINES`
157 → 158 for the one added row, getting-started's verb list and its install-as-a-plugin section,
the llms index entry with `regenerateCommand: null` because the page is hand-written
(`src/cli/docs/llmsIndex.ts:170-174`) and `llms.txt`, the sidebar entry, and `test/docsPages.test.ts`'s
arrays, count words, guide counts and `REATTESTATION_DATE` 2026-09-20 with three pages re-stamped.

The two `docs/plugins.md` citations above were re-pointed on 2026-09-27 to the tree at
`d227ca57`. Each was read at `558bca5a`, where it was last set. The co-ownership passage is at the
same lines, `docs/plugins.md:69-77`, with the same text. The install section's opening paragraph
is cited by name, because it was reworded after `558bca5a`: it now dates each block by its own
provenance line and records the remote walks against a private mirror.

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

The clause about the committed run artifact is MET, and the eval of record is now run 32
(2026-09-22): `evals/runs/2026-09-22-run-32/`, status PASS over 102 cases at eval candidate
`e5e54c9`, with no case, cited source, rubric, set or instrument byte moving between that candidate
and the sha that ships, named in the run record's session-4 proof block — the invariant that holds
for it whatever the session's last commit: `scripts/plugins/setupCommand.mjs`, the one cited source
outside the corpus, is byte-identical through this session, and no case, rubric, set or instrument
byte moved between `e5e54c9` and it. It is an increment under SET-v7's incremental rule (§ 0) composed
with run 31 — 17 calls, five calibration fixtures matched 5 of 5 on the first attempt (§ 9), then two
cases at three samples for two roles — re-measuring `st-setup-refuses-generated-setup` and
`st-setup-fresh-repository`, whose cited source lines the route repairs of 2026-09-22 moved (§ 3: the
locator hands a plugin subcommand its root, and the Copilot `st-setup` body became discovery-first
with one root rule and two stops), and carrying the other 100 cases with the three admitted samples
run 31 published, each found byte-identical in its case file and every cited source range at both
candidates (§ 0). Every metric sits at or above its declared threshold (§ 5): golden rubric pass rate
1.000 (52/52) with floors 23/23, adversarial guardrail hold rate 1.000 (16/16), benign-twin
false-refusal rate 0.000 (0/4) and trigger-probe accuracy 1.000 (30/30). The two re-measured cases
passed (§ 6): `st-setup-fresh-repository` 3 of 3 samples, `st-setup-refuses-generated-setup` 2 of 3
under the two-of-three rule with its one failing sample decided on B2. The clause about a case
recorded as blocked names nothing this run: 6 scenario samples of 6 and 6 independent judges of 6 were
admitted, with no blocked logical call. The set's own sha moved twice since run 31 recorded
`78c85cf7…`, both times by the two case-index rows this spec's own range moves rewrote and by nothing
else, so run 32 records SET-v7 at `f0d013ef…`. Run 31 is the run it composes with: candidate
`063832d`, which is where the three cases above were first measured, along with
`agent-test-runner-return-contract` on a moved source.

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

### REQ-PLUGIN-027 A fork releases through its own workflow

Added 2026-09-26 (plan 010 file 1, E1). `.github/workflows/fork-release.yml` releases a fork's CLI,
plugin distribution and APM refs from one tag. It is inert until the fork names its destinations in
repository variables, and the canonical `release.yml` stays canonical-only. A fork's release is
proved by checksums and the registry's own authentication. It carries no provenance and no
attestation: npm provenance needs a public source repository, and GitHub attestations need GitHub
Enterprise Cloud and are not built (decided 2026-09-24).

- GIVEN the canonical repository, or a fork whose `STAMITY_FORK_RELEASE` is unset or names another
  repository, WHEN a `v*` tag is pushed THEN the probe job ends green with `armed=false`, and no
  gates or publish job runs.
- GIVEN an armed fork whose `STAMITY_RELEASE_REGISTRY` is not an https URL, or carries userinfo, a
  query or a fragment, WHEN the workflow runs THEN the probe fails naming the variable and never
  prints its value.
- GIVEN an armed fork with all of the following, WHEN the tag is pushed THEN gates run the canonical
  ladder holding no secret, and publish verifies every digest before npm, publishes the tarball to
  the registry, pushes the distribution branch and the `plugins/v<version>` tag, and creates a
  release carrying the tarball, `release.json` and every `.sha256` file:
  - a tag `v<package.json version>` reachable from the release branch;
  - a package name other than the canonical one;
  - no `private: true`;
  - `publishConfig.registry` equal to the registry variable.
- GIVEN any one of those proofs failing WHEN gates run THEN they fail before any publish step, with
  a remedy naming `scripts/fork-identity.mjs`.
- GIVEN a publish re-run for a version already published with the same integrity WHEN it runs THEN
  npm is skipped and no ref moves; a tag that points elsewhere is refused, never moved.
- GIVEN the fork guide's "Release your fork" section THEN every `STAMITY_` name it prints is read
  by `.github/workflows/fork-release.yml`, and every `vars.` or `secrets.` name the workflow reads is
  printed there (added from the `docs-guides` unit's report).

As built (2026-09-26), in `.github/workflows/fork-release.yml`. The **probe** (`:77-163`) ends green
with `armed=false` and a notice for the canonical repository (`:104-111`) and for a fork whose
`STAMITY_FORK_RELEASE` is empty or names another repository (`:113-120`); it refuses a registry
that is not https, or carries userinfo, a query, a fragment or white space, naming the variable and
never its value (`:122-142`), and a release branch git would not accept as a name (`:144-156`). It
reads the registry once and hands it on as a job output, so the value gates prove and the value
publish uses cannot differ (`:86-89`, `:158-162`). **Gates** (`:166-397`) hold `contents: read` and
no secret (`:172-173`). Their proofs (`:211-289`) require the tag to be `v` plus `package.json`'s
version and its commit to be reachable from the release branch on every run that can publish
(`:226-250`); a dispatch rehearsal skips those two and says so. On every run they refuse the
canonical name, `private: true`, a `publishConfig.registry` other than the variable, and, on GitHub
Packages, a scope other than the owner (`:252-278`); a failure prints the remedy naming
`scripts/fork-identity.mjs` (`:280-283`). The ladder copied from `release.yml` follows (`:292-316`),
then the pack and the plugin build. **Publish** (`:399-797`) runs in the `fork-release`
environment with `contents: write` and `packages: write` and no `id-token` (`:409-415`). It
re-checks the destination (`:419-441`), then verifies the tarball digest and every archive digest
against the gates job's outputs before anything irreversible (`:456-520`). Two checks beyond the
plan came from review: the tarball's own `package.json` must be the only member at that path, a
regular file, with every member under `package/`, and must carry the proved name, version and
registry (`:534-594`, `review/54`), and every `plugins/*.sha256` file must state the digest the
verified manifest carries, with none missing or extra (`:600-627`, `review/32`). The npm step
gives the per-run token only to the exact host `npm.pkg.github.com`, and the
`STAMITY_REGISTRY_TOKEN` secret otherwise (`:646`); it exits 1 before npm with no credential,
skips a version already published with the same integrity, refuses one published from another
tarball, and publishes with no `--provenance` (`:650-666`). Because publish names the `fork-release`
environment, the guide files `STAMITY_REGISTRY_TOKEN` as a secret of that environment, not of the
repository: an environment secret reaches only a job that names the environment, and only after a
reviewer approves it (`docs/enterprise-forks.md:887-900`). The distribution push refuses to move a
tag that names another commit and to force-push over a branch head that has a parent (`:671-751`),
and the release step uploads only the assets a re-run finds missing (`:757-797`). A dispatch that
leaves `dry_run` at its default `true` runs `dry-run-summary` instead of publish (`:799-809`).
Tests: `test/ci/forkReleaseWorkflow.test.ts`, and the closed lists in `test/ci/workflow.test.ts`
that now admit `fork-release.yml`'s publish job. The guide is `docs/enterprise-forks.md:868-985`;
the variable pin is `test/docsPages.test.ts:2073`. No fork's real release by this workflow is
recorded in this tree: what is proved here is proved by those tests.

### REQ-PLUGIN-028 One command sets a fork's identity

Added 2026-09-26 (plan 010 file 1, E2).
`node scripts/fork-identity.mjs --repository <url> [--scope <scope>] [--registry <url>] [--check]`
replaces the guide's copy-paste identity block. It does the following:

- sets the package name `@<scope>/stamity`. The unscoped name stays `stamity`, so the plugin id, the
  marketplace name and the command namespace do not change.
- sets the repository, homepage, bugs URL and publisher.
- sets `private: true` without `publishConfig`, or, with `--registry`, sets `publishConfig.registry`
  and no `private`.
- moves the two Renovate presets.
- regenerates the plugin and APM manifests.
- validates through `scripts/distribution-identity.mjs`.

It imports no history and switches no workflow.

- GIVEN a downstream checkout WHEN the command runs with a github.com repository URL THEN every field
  and both presets hold the fork's values, and both generators' `--check` exit 0.
- GIVEN the command run a second time with the same arguments THEN it exits 0, reports every file
  unchanged, and moves no byte.
- GIVEN `--check` on a tree that differs from the targets THEN it exits 1, names each drifting file,
  and writes nothing.
- GIVEN an invalid identity (a repository URL off github.com, an uppercase scope, an unclean registry
  URL) THEN it exits 1, writes nothing and echoes no URL. GIVEN a file it would change that has
  uncommitted edits THEN it exits 1 naming the file. GIVEN bad arguments THEN it exits 2.
- GIVEN a file already at its target that has uncommitted edits THEN the command proceeds, and GIVEN
  a generator that fails THEN it exits 1 naming the rerun, and the identity it wrote stays in place
  (added from the unit's report).
- GIVEN the fork guide's identity step THEN its command block installs first, runs
  `node scripts/fork-identity.mjs --repository`, refreshes the lockfile after it, and carries no
  `node -e` (added from the `docs-guides` unit's report).

As built (2026-09-26), in `scripts/fork-identity.mjs`: the usage and exit codes are its header
(`:5-19`). `--repository` accepts only `https://github.com/<owner>/<repo>`, with a `git+` prefix and a
`.git` suffix allowed, and a refusal never echoes the URL (`:106-118`); an unknown argument written
as `--flag=value`, or a value with no flag, is refused without echoing the value (`:95-103`,
`review/17`). The scope defaults to the owner in lower case and must be a lowercase npm scope
(`:318-321`). `--registry` must be https with no userinfo, query or fragment — wider than the
identity module's own clean-URL rule, which does not refuse a query or a fragment (`:125-147`). The
target manifest (`:150-171`) sets the homepage to `https://github.com/<owner>/<repo>`, not the
canonical product site, which has no fork counterpart (plan cell amended 2026-09-24 on
`review/18`). Every target is computed and validated through `resolveDistributionIdentity` before any
write (`:218-252`); a target file that would change and has uncommitted edits is refused, and a file
already at its target is never written (`:325-347`); each write is a temporary file and a rename that
cleans up after a failed rename (`:268-281`); the two generators run after the writes, with
`--check` under `--check` (`:283-304`); the output is one `updated`, `unchanged` or `drift` line per
file, then the identity line (`:327-351`). Tests: `test/ci/forkIdentityScript.test.ts`; the opt-in
`STAMITY_FORK_SUITE` group of `test/ci/forkIdentity.test.ts` now runs the script; the guide's pin is
`test/docsPages.test.ts:2050`. One gap is recorded, not closed: with `--registry
https://npm.pkg.github.com`, a `--scope` other than the owner is accepted here and refused later by
REQ-PLUGIN-027's gates.

### REQ-PLUGIN-029 A Claude Code managed-settings template for an organization's rollout

Added 2026-09-26 (plan 010 file 1, E4). The distribution builder renders
`admin/claude-managed-settings.json` from the fork's identity:

- the company marketplace in `extraKnownMarketplaces`;
- the plugin on for everyone in `enabledPlugins`;
- only that marketplace admitted by `strictKnownMarketplaces`;
- `requiredMinimumVersion` at least 2.1.277, the first client where an invalid allowlist fails
  closed.

The fork guide documents where the file goes on each OS and how managed sources are ordered.
`docs/plugins.md` carries a short paragraph each on Cursor's "Required" team-marketplace mode and
Codex's workspace route.

- GIVEN any identity WHEN the template renders THEN it holds exactly the four keys in a fixed order,
  the marketplace key and plugin id equal the rendered Claude catalog's, and the allowlist entry
  equals the declared marketplace source field for field. An unequal pair blocks every marketplace
  for every user.
- GIVEN a minimum version below 2.1.277, or one that is not a semantic version, THEN the renderer
  throws naming the field. GIVEN a missing or malformed `ref` THEN it throws naming the field (added
  from the unit's report).
- GIVEN a distribution build that includes Claude THEN the file is written, parses, is
  byte-identical across builds and passes the credential scan; a build without Claude writes none.
- GIVEN the template installed at the client's documented Linux policy path THEN the walk record
  shows the marketplace declared, the plugin installed, another marketplace refused, and a client
  below the minimum refusing to start. (Amended 2026-09-26 from "through the client's
  managed-settings directory": the plan cell records that `CLAUDE_CODE_MANAGED_SETTINGS_PATH` is a
  stub in the public builds 2.1.276 to 2.1.281, so the walk ran in a throwaway Linux container at
  `/etc/claude-code/managed-settings.json`.)
- GIVEN the fork guide THEN its managed-settings JSON block equals `renderClaudeManagedSettings` for
  the canonical identity at the block's own ref, key order included (added from the `docs-guides`
  unit's report).

As built (2026-09-26), in `scripts/plugins/managed-settings.mjs`: `MIN_CLAUDE_VERSION` is `2.1.277`
(`:21`) and `MANAGED_SETTINGS_KEYS` the four keys in order (`:24`). `renderClaudeManagedSettings`
(`:100-112`) builds the declared source and the allowlist entry with one function, so the two
cannot differ in spelling (`:105`). It refuses an identity without a name or an `owner/repo` slug
(`:54-62`), a ref that fails the ref-name rule, holds `..` or ends in `/` (`:65-73`, with `REF_NAME`
at `:44` a copy of the identity module's, pinned by a test), and a minimum version that is not plain
`x.y.z` without leading zeros or is below the floor (`:48`, `:76-93`; `review/5`). The
builder writes the file only when Claude is built (`scripts/build-plugin-distribution.mjs:565-569`)
and prints one README line naming it (`:247-249`). Tests: `test/ci/managedSettings.test.ts` and
`test/ci/pluginDistribution.test.ts:587`; the guide's block pin is `test/docsPages.test.ts:2097`.
The guide's section is `docs/enterprise-forks.md:986-1129`; the Cursor and Codex paragraphs are
`docs/plugins.md:202-216` and `:280-285`. The template names the repository the tree was built
from. An organization that serves a mirror of the distribution sets `repo` to its mirror's
`<owner>/<repo>` by hand in both managed entries, the source under `extraKnownMarketplaces` and the
entry in `strictKnownMarketplaces`, and keeps the two identical, because the renderer has no command
that takes another repository and one differing character blocks every marketplace
(`docs/enterprise-forks.md:1042-1048`).

The walk (`.stamity/runs/2026-09-24_enterprise-release/managed-settings-walk.md`), on Claude Code
2.1.281 on Linux, with no login and no credential in the container, measured the fourth criterion
with one condition the plan did not foresee. The marketplace is declared only after one interactive
start past the first-run screens: before it, `marketplace list` shows none and the install fails
"not found in marketplace", and a headless `claude -p` without a login does not record it (W1).
The install then succeeds, and the allowlist does not gate the plugin entry's own source, so the
renderer needed no change (W2); another marketplace is refused as "blocked by enterprise policy"
(W3); under a floor of 99.0.0 a session, `claude -p` and `claude plugin list` exit 1 naming both
versions, while `claude --version` still answers (W4); and an allowlist whose `ref` differs from the
declared source's locks the plugin out for a new user and for one who already has it (W5). Not
measured: whether a logged-in session installs the enabled plugin without `claude plugin install`,
`/status`, the macOS and Windows paths, the `managed-settings.d/` folder, the ranking of managed
sources, and 2.1.277 as the first client that fails closed — those rest on the vendor's pages, as
the guide says (`docs/enterprise-forks.md:1123-1127`).

### REQ-PLUGIN-030 An enterprise quickstart page

Added 2026-09-26 (plan 010 file 1, E5). `docs/enterprise-quickstart.md` is a hand page that orders the
enterprise route by day (day 0 the fork, day 1 release and rollout, day 2 updates) and by role
(admin, platform team, developers). It links into `docs/enterprise-forks.md` and `docs/plugins.md`
rather than repeating them.

- GIVEN the docs suite WHEN it runs THEN the page passes every hand-page case, and appears in the
  sidebar's Guides before the fork guide, in `llms.txt` and in the README map.
- GIVEN the page THEN every step is one sentence with a page-level link, and no command block from
  the two guides is repeated.
- GIVEN the page THEN every link into `docs/enterprise-forks.md` or `docs/plugins.md` names, as its
  link text, a heading that page carries (added from the unit's report: it stands in for the
  `#fragment` links the hand-page link check does not allow).

As built (2026-09-26): the page is `docs/enterprise-quickstart.md`, 66 lines, with "Who does what"
(`:20-26`), the three days (`:28-59`) and "Where to go next" (`:61-66`). It sits in the sidebar's
Guides before `enterprise-forks` (`website/sidebars.ts:81-82`), in the llms index
(`src/cli/docs/llmsIndex.ts:213`, `llms.txt:31`) and in the README map (`README.md:130`). The
case "the enterprise quickstart routes into the two guides and repeats none of their commands"
(`test/docsPages.test.ts:2126`) holds the last two criteria.

### REQ-PLUGIN-045 The ledger names only paths the engine writes, and a row proves a delete or an overwrite only with the bytes

Added 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). The manifest is committed, and `sync` and `clean` act on
what its ledger names, so the ledger is bounded by one exported value, `OWNED_PATHS` (`src/manifest/ownedPaths.ts`). It
lists the sixteen platform files the engine writes at names it did not mint (`AGENTS.md`, `AGENTS.override.md`,
`CLAUDE.md`, `.claude/settings.json`, `.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`,
`.codex/hooks.json`, `.cursor/hooks.json`, `.cursor/hooks/stamity-mcp-guard.mjs`,
`.cursor/hooks/stamity-subagent-guard.mjs`, the 1.11.0 guard names `.cursor/hooks/mcp-guard.mjs` and
`.cursor/hooks/subagent-guard.mjs`, `.github/hooks/stamity.json`, `.github/workflows/copilot-setup-steps.yml`); a
charter `AGENTS.md` in any folder; the twelve content folders (`.agents/skills/`, `.claude/agents/`,
`.claude/commands/`, `.claude/rules/`, `.claude/skills/`, `.codex/agents/`, `.cursor/agents/`, `.cursor/rules/`,
`.cursor/skills/` — written by 1.0.0 to 1.10.0 — `.github/agents/`, `.github/instructions/`, `.github/prompts/`); the
state folders `.stamity/generated/` and `.stamity/mcp/`; and an installed pack's own folder `.stamity/packs/<id>/`. An
`infra` row may name a platform file, a charter, a state folder or, for its `pack:<id>` owner, its pack folder; an
agent, skill, rule or command row only a content folder. A row outside the bound refuses the manifest when it is read.
Inside it, a whole-file delete or an overwrite without a backup needs a recorded `contentHash` that matches the file —
plus, in a content folder, a name the engine minted (a `st-` or `stamity-` basename, or a skill folder so named directly
under a `skills/` folder) — or a managed block spanning the file. A row with no `contentHash` proves nothing. `check`
names every path a `sync` would reclaim, with the action and the proof, in its text and in `--json` (`drift.reclaim`),
and publishes the bound as `ownedPaths`; a later unit that adds an emitted path extends the bound and raises its
`version`.

Amended 2026-10-07 (build): a `drift.reclaim` entry whose action is `keep`, `refuse` or `gone` also carries `why`, the
sweep's reason; `check`'s text prints every reclaim line, with no "… and N more" fold, and shows a control character in
a path as an escape. A whole-file delete also needs every segment below the bound folder, the folders and the file alike,
to be listed under exactly the row's spelling, the file's real parent to lie inside the real path of the bound folder the
row claims, and no symbolic link among `.stamity/`, a state folder or a pack folder on its own path. On the co-owned
path, a row with no `contentHash` reads as drifted, so the reduction takes a verified `.bak` first. The exact list is
sixteen paths, not the fourteen the delta drafted: the two guard names of REQ-FLOW-038 joined it beside the two 1.11.0
names, which stay so their rows validate for the first sync after an upgrade, and `OWNED_PATHS.version` is 2.

- GIVEN a committed repository and an added `infra` row for `docs/owner.md` recording that file's hash WHEN `check`,
  `sync -y` or `clean -y` runs THEN `check` exits 1 naming the row, `sync` and `clean` exit 1 with `CONFIG_ERROR` naming
  it, and no file changed.
- GIVEN hashless rows for `notes/st-owner.md`, `src/stamity-x.ts`, `packages/app/skills/st-foo/index.ts` and
  `lib/30-stamity-y.js`, and hashed `infra` rows for `.stamity/learnings/keep-me.md` and `.github/workflows/ci.yml`, THEN
  each is refused the same way.
- GIVEN the rows every release from 1.0.0 to 1.11.0 writes THEN each lies in the bound; GIVEN every planner output for
  every client set, both install modes, every MCP dialect, an installed pack and a user override of each class THEN each
  lies in the bound.
- GIVEN an engine-named row with no `contentHash` WHEN `sync -y` reclaims it THEN the file stays; GIVEN a hashless row
  for an owner's file that `init` skipped WHEN `sync -y` overwrites it THEN a verified `.bak` holds the owner's bytes.
- GIVEN a deselected engine file WHEN `check --json` runs THEN `drift.reclaim` names its path with `action: "delete"` and
  `proof: "hash"`, and the text names it; GIVEN any repository THEN `check --json` carries `ownedPaths`.
- GIVEN an engine-named row with no `contentHash` WHEN `check --json` runs THEN its `drift.reclaim` entry has
  `action: "refuse"` and a non-empty `why` (added from the build).
- GIVEN 25 deselected rows with `strip` and `reduce` actions among them WHEN `check` runs THEN all 25 reclaim lines print
  and none reads "… and N more"; GIVEN a row whose path holds a control character THEN its line shows the escape, never
  the raw byte (added from the build).
- GIVEN a hashed row spelled `.claude/agents/Stamity-x.md` for a file listed as `.claude/agents/stamity-x.md` on a
  case-folding file system WHEN `sync -y` reclaims it THEN the file stays (added from the build).
- GIVEN a bound content folder whose subfolder is a symbolic link to a folder outside it, and a hashed row through that
  link WHEN `sync -y` reclaims it THEN the file stays (added from the build).
- GIVEN `.stamity/generated/` committed as a symbolic link and a hashed row under it WHEN `sync -y` reclaims it THEN the
  file stays (added from the build).
- GIVEN a forged hashless `.claude/settings.json` row and an owner's `permissions` and `hooks` WHEN `sync -y` or
  `clean -y` reduces the file THEN a verified `.bak` holds the owner's bytes first (added from the build).

As built (2026-10-07): before the change no single list of the engine's paths existed (the constants sat in the four
adapters and six other modules); `infra` rows were trusted by type alone (`src/manifest/ledger.ts:157-163` at
`d10db029`), and a hash proved a delete anywhere under `.stamity/` (`src/merge/reclaim.ts:345-347`, `:372-375` there).
Measured 2026-10-06: every release from 1.0.0 to 1.11.0 records a hash on every row, and 5,288 rows in 19 ledgers fall
inside the bound with the artifact-type split above. The bound is `OWNED_PATHS`, `ownedPathKind` and `ownedFolderOf` in
`src/manifest/ownedPaths.ts`, read by manifest validation (`src/manifest/manifest.ts`), the planner's containment check
(`src/manifest/ledger.ts`), the reclaim sweep (`src/merge/reclaim.ts`) and `check --json`. Tests:
`test/manifest/ownedPaths.test.ts` (the bound over every planner output and over the frozen rows of every release,
`test/manifest/fixtures/released-ledger-rows.json`), `test/cli/ledgerForgery.test.ts`, `test/merge/reclaim.test.ts` and
`test/merge/reclaim.property.test.ts` (`src/merge/reclaim.ts` and `src/manifest/ownedPaths.ts` held at 100%),
`test/cli/commands/check.test.ts`. Plan 016 file 2's `u2-release-integrity` publishes the bound in `release.json` as
`ownedPaths`.

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `d1a-rendering-proof-core` to
`d1c-charter-and-exact-paths` and lane D's fixer rounds): inside the bound, a delete at the paths REQ-PLUGIN-046 names
needs a rendering — the running engine's, or at the two 1.11.0 Cursor guard names the frozen 1.11.0 builder's
rendering for the setup — beside the recorded hash the bytes match, which no longer proves it alone (or a managed
block spanning the file, which a recorded hash the bytes do not match vetoes). A backup-free overwrite at a charter or
instruction file and at `.github/hooks/stamity.json` needs the incoming rendering or a managed block spanning the
file, or it keeps the previous content recoverable (REQ-PLUGIN-046, amended 2026-10-08; `needsRenderingProof` and
`renderingProofClass`, `src/manifest/ownedPaths.ts`). Elsewhere inside the bound the recorded hash still proves what
the paragraph above says: a delete at the state and pack folders and at the `stamity-` Cursor guards, and a
backup-free overwrite at any other path the engine writes. `SECURITY.md` names both among its known residuals.

### REQ-PLUGIN-046 An import decision binds only as `init` records it, and an instruction file leaves only on its own bytes

Added 2026-10-07 (plan 016 file 0, unit `u0-ledger-bound`). `init` records one decision per pre-existing instruction
file (`importChoice`). The engine cannot authenticate a committed record — the manifest carries no signature, and a key
kept in the repository would be as forgeable as the record — so a decision binds only while it agrees with what only
the engine's own actions leave behind. A decision names one of the four files `init` imports (`AGENTS.md`, `AGENT.md`,
`CLAUDE.md`, `.github/copilot-instructions.md`), or the manifest is refused. A `skip` decision and a ledger row for the
same path refuse the manifest: the engine never records a row for a skipped file. `sync` never writes a whole engine file
over an instruction file that holds the owner's text outside the engine's managed block — the shape only `supplement`
leaves: under any other decision the path is an `import-decision` collision, `--force` does not clear it, and the remedy
names `init --force --import-config replace`. At `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md` and
`.github/workflows/copilot-setup-steps.yml`, a recorded hash proves a whole-file delete or a backup-free overwrite only
when the bytes show the engine wrote them: the charter (first non-blank line `# Charter`, then `## Repo facts`,
`## Invariants`, `## Touchpoints` and `## Conditional layer` in order, no managed-block markers), the Codex rule appendix
(first non-blank line opening `# Conditional rules (Codex down-conversion)`), the Copilot workflow's engine header line,
or a managed block spanning the file. Otherwise the sweep keeps the file and an overwrite takes a verified `.bak` first.

Amended 2026-10-07 (build): `AGENTS.override.md`, `CLAUDE.md` and the Copilot workflow need this byte proof only at the
repository root; a charter `AGENTS.md` needs it in any folder. The root `AGENTS.override.md` proves itself when the Codex
appendix heading `## Conditional rules (Codex down-conversion)` stands on a line of its own — under `skip` the engine
writes it as the owner's `AGENTS.md` text plus that section — while a hand-edited override still fails its recorded
hash, so it is kept on reclaim and backed up on write. In the write lane, a managed block spanning the file proves the
bytes too.

- GIVEN `importChoice` naming `.cursor/hooks.json` as `skip` THEN the manifest is refused and `check` exits 1 naming the
  decision.
- GIVEN a `skip` decision and a ledger row for the same path THEN the manifest is refused and `AGENTS.md` is
  byte-identical after `sync -y`.
- GIVEN a supplemented owner `AGENTS.md` whose decision reads `replace`, or none WHEN `sync -y` or `sync -y --force` runs
  THEN it exits 1, `AGENTS.md` is byte-identical, no `.bak` exists, and `check --json` names the path with
  `collisionKind: "import-decision"`.
- GIVEN an owner's `docs/AGENTS.md` and a forged row hashing its bytes WHEN `sync -y` runs THEN the file stays; GIVEN the
  engine's unedited per-package charter whose package left THEN it is deleted.
- GIVEN the charter rendered at the head and one written by 1.0.0 THEN both pass the recogniser; GIVEN `# Charter`
  followed by notes, or a file carrying STAMITY markers, THEN it fails.
- GIVEN the engine's root `AGENTS.override.md` written under `skip` (the owner's `AGENTS.md` text plus the Codex
  appendix section) WHEN `sync -y` rewrites it THEN no `.bak` is taken; GIVEN the same file with the heading
  `## Conditional rules (Codex down-conversion)` removed THEN a verified `.bak` holds it first (added from the build).

As built (2026-10-07): measured 2026-10-06 on 1.11.0, `skip` for Cursor's hook file and both guards (rows and files
removed) left `check` at exit 0 while `cursor` stayed selected; `supplement` flipped to `replace` made `sync` overwrite
the owner's `AGENTS.md`; flipped to `skip` with the rows' hash set to the file, `sync` deleted `AGENTS.md` whole. Every
release's charter carries the four headings; 1.0.0 to 1.7.0 carry no `Invariants version` line. The recognisers are
`needsByteProof`, `isEngineCharterDocument` and `bytesShowEngineOutput` in `src/manifest/ownedPaths.ts`; the collision
kind is `import-decision` in `src/cli/commands/sync/engine.ts`. Tests: `test/cli/ledgerForgery.test.ts`,
`test/manifest/manifest.test.ts`, `test/manifest/ownedPaths.test.ts` (with `test/manifest/fixtures/charter-1.0.0.md`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, units `d1a-rendering-proof-core`, `d1b-cursor-guard-pins` and
`d1c-charter-and-exact-paths`, with lane D's fixer rounds 1, 3 and 4; inbox rows 519, 560, 585 and 586). A whole-file
delete at an engine-named file in a content folder, an `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md`
and the Copilot setup workflow at the repository root, `.github/hooks/stamity.json`, or one of Cursor's two 1.11.0
guard names needs one of two proofs, and a recorded hash the bytes do not match vetoes both. The first is bytes that
hash to the row's recorded hash and, raw or with `\r\n` read as `\n`, to a rendering the running engine produces at
that path, planned for the clients the setup wrote for (the manifest's clients and every client a ledger row names,
each in repository mode) over the bundled corpus, the override tree and the installed packs. Every installed pack is
rendered whatever the organisation's trust policy says, so the first `sync` after the policy denies a pack proves and
removes that pack's copies, while the projection itself still writes nothing of a denied pack; the plan is hashed and
discarded, never written. The second is a managed block spanning the file. At an `AGENTS.md` below the root, when a
client of the setup reads per-folder files, the renderings also include the root charter as the engine renders it
before an import decision on the root, so the engine's unedited copy whose package has left is still proven and
removed. At the two 1.11.0 Cursor guard names only, the rendering is the guard a frozen copy of the 1.11.0 builder
(`src/adapters/cursorLegacyGuards.ts`) renders for the setup: the ten agents 1.11.0 shipped plus every Cursor agent
the ledger records, the running installation's package name and npm channel, at version 1.11.0. A test holds the copy
to four fixtures captured from the published 1.11.0 package, each pinned by its SHA-256 (REQ-FLOW-038, amended
2026-10-08). A recorded hash that matches, and the structural fingerprint, no longer prove a delete there on their own
(`src/merge/reclaim.ts`, gate 4: the matching hash, then the rendering). The fingerprint still decides which
instruction files may reach the proof: a file it does not read as the engine's falls to the managed-block rules, so
`CLAUDE.md` is proven only by a block that spans it.

A file whose bytes no built rendering matches — an owner's file, or a copy an earlier release rendered that the running
engine no longer produces — is kept as `skipped-user-content`, its report entry names the path's class and the step to
delete it by hand, and its row leaves the ledger. A file the proof could not judge, because the plan could not be
built, is kept unjudged: its entry carries `unproven: true` and names why, and its row stays, so the next `sync` tries
again. Under the full `clean`, which removes the setup with its ledger, that entry instead says no sync will try again
and to delete the file by hand unless it is the owner's. A rendering built for the path judges the file whatever else
failed to build, so the 1.11.0 re-render decides at the old guard names even when the running engine's plan threw. A
proven delete keeps `proof: "hash"` and names the rendering in its detail (`engineRenderingsFor` and
`provenLegacyCursorGuards`, `src/cli/engine/emissionWrite.ts`; gate 4's `renderingRefusal`, `src/merge/reclaim.ts`;
`ignoringPolicyDenialForProof`, `src/pack/projection.ts`).

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, lane D's fixer rounds 4 to 6, under the declared default of
the ledger rows `build/62` and `review/109`; a `.bak` on every such overwrite, or a machine-local record of the hashes
this checkout's engine wrote, are the alternatives the run's record leaves to the maintainer). At a charter or
instruction file and at `.github/hooks/stamity.json`, a whole-file overwrite the ledger records keeps the bytes it
replaces recoverable unless the incoming rendering proves them (they equal it once `\r\n` reads as `\n`) or a managed
block spans the file. The previous content is then kept in git history, with no `.bak` and a notice naming it, when
the file is tracked and clean in the repository whose top level is the setup root. Otherwise it is kept behind a
verified `.bak` and a warning: for an uncommitted or untracked file, a setup in a monorepo subfolder, a charter inside
a submodule, and whenever git is absent or a git check fails or outlives its 5-second timeout. The checks run git from
the setup root, never the file's own folder, with every `GIT_*` variable stripped and `safe.bareRepository=explicit`
and `core.fsmonitor=false` on every call. They require one ordinary, merged, regular-file index entry that agrees with
`HEAD`, and the bytes read under the write lock must hash in process to that entry's blob, raw or with `\r\n` read as
`\n`; no call reads work-tree content, so no filter command runs (`overwriteNeedsRecovery` and `isTrackedAndClean`,
`src/merge/safeWrite.ts`). A file whose fingerprint fails, or whose bytes drifted from the recorded hash, takes the
`.bak` as before. So the structural fingerprint no longer proves a backup-free overwrite on its own there. The notice
also prints for the engine's own committed, unedited `AGENTS.md` on a release that changes the charter, and an
uncommitted setup, or one in a monorepo subfolder, gets an `AGENTS.md.bak`. The notice reads as that routine case: the
previous content is in git history and the change shows in `git status`. A `.bak` taken because git could not confirm
the previous bytes are committed says so and names the `.bak`, and "may be yours" stays for bytes the fingerprint does
not read as the engine's (`review/129`, `review/132`). For the delete and the overwrite alike, the paragraph above
read: "a recorded hash proves a whole-file delete or a backup-free overwrite only when the bytes show the engine wrote
them: the charter (…), the Codex rule appendix (…), the Copilot workflow's engine header line, or a managed block
spanning the file." A delete there still needs that matching recorded hash; the hash and the fingerprint together no
longer prove it, nor a backup-free overwrite.

`SECURITY.md`'s manifest-forgery row names three known residuals inside the bound. (1) At an instruction file and at
`.github/hooks/stamity.json`, an overwrite of a file git tracks with no uncommitted change takes no `.bak`, under a
forged row hashing an owner's file too: the owner's previous content is in git history, and the overwrite shows in
`git status` and in the notice. Git before 2.38 ignores `safe.bareRepository`, and the engine does not check git's
version, so there a setup root with no `.git` of its own that holds committed bare-repository files can answer the
check from its own index. Elsewhere inside the bound a backup-free overwrite still rests on the recorded hash alone,
and so does a delete at the state and pack folders and at the `stamity-` Cursor guards. (2) A planted pack or override
whose rendering copies an owner's file byte for byte, beside a forged row hashing it, still proves that delete through
`sync`, `clean` and `clean --pack`, and a planted pack folder widens what the proof renders even under a policy that
denies every pack (ledger rows `review/63`, `review/65` and `review/69` of run `2026-10-08_maintainer-tooling`). (3) A
selected `[mcp_servers.<id>]` table in `.codex/config.toml`, and the bare `[mcp_servers]` table the engine renders
when no server is selected, are proved by their record alone (REQ-FLOW-037): a forged `coOwned` record that hashes an
owner's bare `[mcp_servers]` makes it the engine's, and owner servers written under it as dotted keys are then
refreshed away with no `.bak`. It is tracked as the deferred row `2026-10-08_inbox-pass/pass/3`
(`.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl`).

- GIVEN an owner's `.claude/skills/st-local/SKILL.md`, an owner's `.cursor/hooks/mcp-guard.mjs` whose bytes are not the
  setup's 1.11.0 re-render, an owner `AGENTS.md` copying the charter's title and four headings at the root, an owner
  nested `AGENTS.md` opening with the Codex appendix title, an owner `AGENTS.override.md` with the appendix heading on a
  line, an owner Copilot workflow with the engine's header line, and an owner `.github/hooks/stamity.json`, each under a
  forged row hashing it, WHEN `sync -y` or `clean -y` sweeps THEN each stays (added 2026-10-08).
- GIVEN a 1.11.0 setup's unedited guards, core, with a local pack's agents or with an override agent, THEN the first
  `sync` deletes both; GIVEN a client deselected after setup THEN its unedited files are still deleted, a deselected
  Copilot's workflow and hooks file included; GIVEN a Claude-only setup's unedited files WHEN `clean -y` runs THEN each
  is deleted; GIVEN the engine's unedited per-package charter whose package left, under a `supplement` or `skip` decision
  on the root, WHEN `sync -y` runs THEN it is deleted (added 2026-10-08).
- GIVEN a deny-all policy over an installed, projected pack WHEN `sync -y` runs THEN every copy is deleted and none is
  written, and an owner's file at a copy's name under a forged row is kept (added 2026-10-08).
- GIVEN a proof plan that cannot be built WHEN `sync -y` sweeps THEN each file that needs the proof is kept with
  `unproven: true`, its row stays and the entry names why; WHEN the full `clean -y` sweeps THEN the entry says the setup
  is being removed and to delete the file by hand unless it is yours; GIVEN a file whose bytes match no built rendering
  THEN it is kept with no mark and its row leaves (added 2026-10-08).
- GIVEN Copilot selected and forged rows hashing an owner's untracked root `AGENTS.md` and `.github/hooks/stamity.json`
  WHEN `sync -y` runs THEN a verified `.bak` holds each owner file; GIVEN the same repository committed THEN no `.bak`
  exists and the notice names git history (added 2026-10-08).
- GIVEN such an overwrite of a tracked file with an uncommitted or staged edit, an `assume-unchanged` or unmerged entry, a
  setup root that is not the repository's top level, no setup root, git missing, or `GIT_DIR` aimed at another
  repository THEN it takes the `.bak`; GIVEN a committed bare-repository-shaped folder beside the hooks file whose config
  names a file-system monitor, or a clean filter on a stat-dirty tracked file, THEN neither command runs, and every git
  call the check makes carries `safe.bareRepository=explicit` and `core.fsmonitor=false` (added 2026-10-08).

Tests for the criteria added 2026-10-08: `test/cli/ledgerForgery.test.ts`, `test/merge/reclaim.test.ts`,
`test/merge/hookFilesOwnership.test.ts`, `test/adapters/cursorLegacyGuards.test.ts`, `test/manifest/ownedPaths.test.ts`,
`test/merge/safeWrite.test.ts`, `test/cli/flows.e2e.test.ts`.

Amended 2026-10-08 (run `2026-10-08_maintainer-tooling`, unit `d1a2-clean-pack-copies`, with lane D's fixer rounds 1
and 2). `clean --pack <id>` also removes the copies `sync` projected from that pack into the clients' folders, while the
pack is still installed. Only a client row at a path that needs the rendering proof can be a copy. It plans the emission
twice, both times for the clients the setup wrote for and with every installed pack rendered whatever the trust policy
says: once as the manifest stands, and once with the pack's `pack:<id>` rows removed. A copy is a client row whose path
the first plan renders and the second does not, or a row of one of the pack's own artifacts at a path the second plan
does not render. The pack's artifacts are read off its own rows and its folder, and a row matches one by class, catalog
id and the name its path projects under, so an artifact whose file was moved out of the pack folder is still the
pack's, and a forged row naming an artifact at another path is not. Each copy joins the sweep and leaves only as bytes
the first plan renders; an edited copy, or an owner's file at a copy's name under a forged row, is kept and named, and a
judged copy's row leaves with the pack's rows, kept or not. When the first plan cannot be built (a pack whose own command
and skill share a name, which the planner refuses), the copies are only the rows of the pack's own artifacts. None can
be proven, so each is kept and named: one unedited since its recorded hash keeps its row, one edited or hashless loses
it, and the run never falls back to the recorded hash. When the second plan cannot be built, no copy is looked for,
their rows stay, and the run says so. `--dry-run` lists each copy and writes nothing; the confirmation names the copy
count; the next steps name each kept copy for a delete by hand "unless it is yours", then the pinned `sync`. The pack
remedies the CLI prints — the name-clash refusal's, `add`'s replace steps and `check`'s pack-integrity one — gain the
same step by hand after `clean --pack`: "delete by hand each client copy it keeps and names, unless it is yours". `add`'s
remedy for a pack no longer installed reads `sync`, that step, `add`, `sync` (`findPackCopies`,
`src/cli/commands/clean.ts`; `remedyOf`, `src/emit/planner.ts`; `replaceSteps`, `src/cli/commands/add.ts`;
`packReinstallSteps`, `src/pack/verifyInstalled.ts`). Before, `clean --pack` removed only `.stamity/packs/<id>/` and
left the copies to the next `sync`, which no rendering can prove once the pack is gone.

- GIVEN a Claude setup with `ops` added and synced WHEN `clean --pack ops -y` runs THEN every `.claude/` copy projected
  from `ops` is deleted with `proof: "hash"`, its row is gone, and no other row moved; GIVEN one copy edited, or an
  owner's file at a copy's name under a forged row, THEN it stays and is named; GIVEN `--dry-run` THEN each copy is listed
  and nothing is written; GIVEN two packs THEN the other pack's copies and rows are untouched; GIVEN a deny-all policy
  THEN the copies are still found and deleted (added 2026-10-08).
- GIVEN the 1.11.0 `ops` clash WHEN `clean --pack ops -y` runs THEN it keeps and names the copies of the pack's own
  artifacts and nothing else (a retired engine row and owner files under forged rows stay untouched), the unedited ones
  keep their rows, and the printed remedy with its step by hand runs to a green `check`; GIVEN a setup that cannot be
  planned without the pack THEN no copy is taken and every copy keeps its bytes and its row; GIVEN a scoped pack whose
  edited file was moved out of its folder as `check`'s integrity remedy says THEN the printed steps run to a green
  `check` (added 2026-10-08).

Tests for these criteria: `test/cli/commands/clean.test.ts` (the `clean --pack` copies cases: the proof-hash delete,
the edited copy, the forged row, `--dry-run`, two packs, a deny-all policy, the unplannable pack and the setup that
cannot be planned without it) and `test/pack/upgradeRemedy.test.ts` (the 1.11.0 `ops` clash and the integrity remedy's
printed steps, a scoped pack's included).

### REQ-PLUGIN-047 `check` takes the expected release, client set and install mode from its caller

Added 2026-10-07 (plan 016 file 0, unit `u0-check-expectations`). `check` proves the files match the manifest and the
running CLI, and a pull request can change both. Three flags take the expectation from a caller the pull request cannot
edit, such as a required workflow's input: `--expect-version <semver>` (the running CLI and the manifest's `generatedBy`
both equal it), `--expect-tools <csv>` (the manifest's clients equal it as a set) and `--expect-mode <mode>` (the
manifest records that install mode; the values are `INSTALL_MODES`). With any of them `check` prints one more row,
`expectations`, and a `--json` object of the same name; a mismatch fails the run with `error.code: "EXPECTATION_ERROR"`,
exit 1, naming the expected and the recorded value and the step that restores it. Without them the output is
byte-identical to before.

Amended 2026-10-07 (build): `error.next` joins its steps with `"; "`, as `error.why` joins the mismatches, one step per
mismatch in the same order. With `--expect-version` given, every step runs the expected release — the client-set and
install-mode steps too — so following the steps in order leaves `generatedBy` at the expected release; without it they
run the running release. An `--expect-version` carrying build metadata (`1.12.0+acme.1`) is refused with
`VALIDATION_ERROR`, because npm versions carry none. The expected-release calls read the identity record
`packageCommand` reads, registry included (`packageCommandAt`, `src/cli/kit/packageName.ts`), so a registry fork's
steps name its registry (REQ-PLUGIN-048).

- GIVEN a repository whose manifest dropped `cursor` with its rows and files WHEN `check --expect-tools claude,cursor`
  runs THEN it exits 1 with `EXPECTATION_ERROR` and `expectations.tools.missing` is `["cursor"]`; WHEN plain `check` runs
  THEN its output is unchanged.
- GIVEN `--expect-version` other than the running release or the manifest's `generatedBy` THEN `check` exits 1 naming
  which; GIVEN `--expect-mode generated` on a plugin-backed manifest THEN it exits 1.
- GIVEN an invalid value (`--expect-version 1.x`, `--expect-tools claude,emacs`) THEN it exits 1 with `VALIDATION_ERROR`
  before any probe; GIVEN `--expect-mode bogus` THEN it exits 2.
- GIVEN `docs/cli-reference.md` THEN it lists the three flags and the `EXPECTATION_ERROR` code, and
  `docs/troubleshooting.md` documents the `expectations` row.
- GIVEN `--expect-version 1.12.0+acme.1` THEN `check` exits 1 with `VALIDATION_ERROR` before any probe; GIVEN a failing
  `--expect-version` and a failing `--expect-tools` THEN `error.next` holds one step per mismatch separated by `"; "`, and
  every step names the expected release; GIVEN a registry fork THEN each step carries `--@<scope>:registry=<url>`
  (added from the build).

As built (2026-10-07): measured 2026-10-06 on 1.11.0, dropping `cursor` with its 78 rows and 76 files, guards included,
left `check` at exit 0, and `check --help` offered `--json` and `-y` only. The flags, `evaluateExpectations` and the
remedy steps are in `src/cli/commands/check.ts`; the code is in `src/types/errors.ts` and `CODE_MEANINGS`
(`src/cli/docs/cliReference.ts`). Tests: `test/cli/checkExpectations.test.ts`, `test/cli/commands/check.test.ts`, and
the surface suites (`test/types/errors.test.ts`, `test/cli/docs/cliReference.test.ts`,
`test/resilience/failureClass.test.ts`, `test/docsPages.test.ts`). The reusable check action that would run these flags
from a trusted workflow is not built.

### REQ-PLUGIN-048 A registry fork's every pinned CLI call names its registry for its scope

Added 2026-10-07 (plan 016 file 0, unit `u0-registry-bound-calls`). A fork made with `fork-identity.mjs --registry
<url>` publishes `@<scope>/stamity` to its own registry, and npx finds a scope's registry only in npm's configuration:
on a machine without the scope mapping, a bare `npx -y @<scope>/stamity@<v>` asks the default registry, where anyone may
hold that name. So every pinned call the CLI renders for such a fork — the emitted bodies, hook hints, guard messages,
`.codex/hooks.json`, the CLI's remedies, the update banner, `sync --help` and the plugin roots' bodies — names the
registry for the scope ahead of the package: `npx -y --@<scope>:registry=<url> @<scope>/stamity@<version> <verb>`. npm
then takes the fork's package from the fork's registry and every other package from the default one. The canonical
build and a fork with no `publishConfig.registry` render what they rendered before. A registry that is not a plain https
URL is never written into a command; such a fork renders `npx --no`, which fetches nothing.

Amended 2026-10-07 (build): such a fork is not made in the first place — `scripts/fork-identity.mjs --registry` refuses
a URL outside the same `REGISTRY_URL` grammar at fork creation, naming the rule and never echoing the value, so one
grammar holds from the fork to every rendered call.

- GIVEN a fork whose `package.json` names `publishConfig.registry` WHEN `init` writes four clients THEN every pinned call
  carries `--@<scope>:registry=<url>` before the package spec, and none is bare.
- GIVEN the same fork THEN `sync --help` and the update banner name the registry the same way; GIVEN the canonical
  package THEN every surface is byte-identical to before.
- GIVEN a stub fork registry and a stub default registry that serves a look-alike under the fork's name WHEN the
  rendered call runs on a machine with no scope mapping THEN the fork's build runs and the default registry is asked only
  for unscoped dependencies.
- GIVEN a registry with credentials, a query, a fragment or a shell metacharacter THEN no call names it and the CLI's
  calls render `npx --no`.
- GIVEN `scripts/fork-identity.mjs --registry` with a URL outside `REGISTRY_URL` (`https://r.example/a%20b`,
  `https://u:p@r.example`, one holding `$` or a space) THEN it exits 1 with nothing written, the message names the plain
  https rule, and no output line contains the value (added from the build).

As built (2026-10-07): measured 2026-10-06, a `--registry` fork wrote 44 pinned calls in 23 files with no registry;
against local registry stubs, npm 10.9.8, 11.21.0 and 12.2.0 alike ran a public look-alike for the bare call, the fork's
build for the scoped-registry call, and failed with 404 for `--registry <url>`. The rendering is `scopeRegistryArg` and
`REGISTRY_URL` in `src/shared/cliCall.ts`, restated in `scripts/plugins/tokens.mjs` and held equal by
`test/ci/pluginModules.test.ts`; the identity read is `npmRegistry()` and `packageCommandAt` in
`src/cli/kit/packageName.ts`. Tests: `test/shared/cliCall.test.ts`, `test/emit/noBareCliCall.test.ts`,
`test/corpus/npxScopeRegistry.test.ts`, `test/cli/commands/sync.test.ts`, `test/cli/notice/updateNotice.test.ts`,
`test/ci/forkIdentityScript.test.ts`. Plan 016 file 2's `u2-upgrade-verb` and `u2-apm-placeholders` use the same
rendering.

## Non-goals

- A self-contained executable per platform (Node at the engine floor is the declared prerequisite).
- Publishing to any vendor's public marketplace (an organization's own git repository is the
  catalog; the public branch of this repository is the public catalog).
- A fleet-management or update service of stamity's own (Renovate proposes every update).
- The CLI-to-plugin migration engine and the coexistence suite (cut 2026-09-17; inbox row).

## References

- `docs/plans/008-plugin-lifecycle-01.md`, `-02.md`, `-03.md` — the units and their evidence.
- `docs/plans/010-enterprise-release-01.md` — REQ-PLUGIN-027 to 030 and the 2026-09-26
  amendments, with their units and decisions.
- `docs/plans/016-fork-distribution-00.md` — REQ-PLUGIN-045 to 048 and the 2026-10-07 amendments of REQ-PLUGIN-015 and
  016, with their units, declared defaults S1–S19 and their dated build amendments.
- `.stamity/runs/2026-10-07_security-fixes/record.md` and its `ledger.jsonl` — the build, the review rounds and the
  sign-offs the "Amended 2026-10-07 (build)" sentences record.
- `.stamity/runs/2026-10-08_maintainer-tooling/plan.md`, its `record.md` and its `ledger.jsonl` — the in-flow plan's
  spec deltas, the declared defaults, the sign-offs and the ledger rows the paragraphs headed "Amended 2026-10-08" cite.
- `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md` (its Codex section) and
  `.stamity/runs/2026-09-24_enterprise-release/managed-settings-walk.md` — the two walks of
  2026-09-24 and 2026-09-26 the amendments cite.
- `.stamity/runs/2026-09-17_codex-astra-audit/findings.md` — the audit whose fix batch opens the plan.
- `docs/specs/apm-canonical-distribution.md`, `docs/specs/fork-layer.md`,
  `docs/specs/enterprise-upstream-lane.md` — the routes this spec extends and leaves as shipped.
