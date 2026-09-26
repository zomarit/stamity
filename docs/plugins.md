---
title: Plugins
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit fcc4f59e. Re-attested 2026-09-26 against the Codex remote walk of 2026-09-24 and the organization routes. -->
<!-- Re-open when: the capability-file schema changes shape, the locator's exit codes or its
     candidate order move, or a vendor page behind a command block is re-read on a later access
     date than the newest this page carries, 2026-09-24. `test/docsPages.test.ts` holds this
     page to the hand-page contract; `docs/capability-matrix.md` carries the dated source URL
     behind each client's container facts, and `docs/cli-reference.md` is what the `stamity
     plugin` blocks must not contradict. -->

# Plugins

This page is for someone installing stamity as a **client plugin** rather than as a CLI. The two
routes deliver the same corpus and differ in who owns the files: `npx @zomarit/stamity init`
writes every artifact into your repository, while a plugin install carries most of them inside
the client's own plugin root and leaves your repository holding only what a plugin cannot carry.

Read [Getting started](getting-started.md) instead if you want the CLI route. Nothing here
replaces it — a repository can run on either, and the plugin route still writes a manifest,
still runs `check`, and is still uninstalled with `clean`.

## Who owns what

One table, and it is the whole boundary. **Carried** means the plugin root ships the class and
the client reads it from there; **repository-owned** means `stamity plugin setup` writes it into
your repository, exactly as `init` would.

| Class | Claude Code | Cursor | Copilot CLI | Codex |
|---|---|---|---|---|
| agent | carried | carried | carried | repository-owned |
| skill | carried | carried | carried | carried |
| command | carried | carried | carried | repository-owned |
| rule | repository-owned | carried | repository-owned | repository-owned |
| hooks | carried | carried | carried | carried |
| mcp | repository-owned | repository-owned | repository-owned | repository-owned |

The reasons, one line each, are the ones each container declares in its own capability file:

- **Claude Code, rule** — the plugin manifest has no `rules` field, so a glob-scoped rule cannot
  ride in the container; `plugin setup` writes it to `.claude/rules/`, and a rule with no globs
  is already delivered as a skill.
- **Cursor, command** — carried, and it lands under `skills/`: this client converts a command
  into a skill carrying `disable-model-invocation: true`, which is the shape it reads.
- **Copilot CLI, rule** — the container defines a rules directory whose file format the vendor
  does not state, and this engine has no Copilot rule surface; `plugin setup` writes
  `.github/instructions/` instead.
- **Copilot CLI, command** — carried as `<id>.md`, not the repository's `<id>.prompt.md`: the CLI
  strips exactly one extension, so `.prompt.md` would register ids the corpus never names.
- **Codex, agent and command** — the Agent Plugins container carries no agent class, and this
  client documents no project-scoped command directory; `plugin setup` writes `.codex/agents/`.
- **Copilot CLI, hooks** — carried, and loaded only in a **trusted folder**. Interactively that is
  the client's own trust prompt; headlessly it is `COPILOT_ALLOW_ALL` set to exactly `true`, which
  "additionally trusts the working directory without prompting, which loads that directory's
  skills, plugins, MCP servers, and hooks" — every other truthy spelling, and the
  `--allow-all-tools` flag on its own, only auto-approve tools and load no hooks at all
  (`copilot help environment` on 1.0.87, read 2026-09-22; measured the same day, where one hook
  fixture recorded nothing under the flag alone and seven observations with the variable set, one
  of them the client's own `Denied by preToolUse hook: hook exited with code 2`). Only machine-wide
  policy hooks load "regardless of folder trust state"; a repository's `.github/hooks/*.json` and a
  plugin's own hooks do not (the vendor's hooks reference, read 2026-09-22).
- **Codex, hooks** — carried means shipped and discoverable, not enforced by shipping alone: a
  plugin's hooks are skipped until the operator trusts them, and a headless run on codex-cli
  0.154.0 ran no project hook at all.
- **Every client, mcp** — MCP server selection and its credential references are one repository's
  decision, never a plugin's.

One consequence of that split is worth knowing before you move clients over one at a time. The
vendor-neutral `.agents/skills/` tree is **co-owned**: it stays written while any client still in
generated mode reads it, and a client whose plugin carries `skill` simply stops being one of its
owners (`src/emit/ownership.ts`, `sharedProjectionOwners`). So a plugin-backed client sitting
beside a generated one that reads that tree receives the same skills twice by construction — once
from its plugin, once from the shared tree. `plugin-duplicates` does not report it, and that is
deliberate rather than a blind spot: removing the tree would strip the generated client of the
skills it has no other route to. The way out is not to delete anything, it is to move the last
reader onto the plugin too, at which point the tree has no owners left and is reclaimed.

The same split is rendered from the container modules themselves, with each client's dated source
URL, under **Plugin containers** in [the capability matrix](capability-matrix.md).

## Install

Each block below carries a provenance line. A block that says **executed** was run on a real client
on the date its line gives, and the output is what this page describes. A block that says **from
the vendor's documentation** is transcribed from a page read on the date its line gives and has
not been run here. Two proofs have since run — the release's route proof, and the upgrade-and-rollback lifecycle
walk — and between them they executed the LOCAL form of every client's route, a marketplace or a
plugin directory on disk. They did not execute the same commands as each other, so each block below
names which one ran what. Neither executed the remote `<owner>/stamity#plugin-dist` source against
this repository's own distribution, and nothing has since. The branch exists — the 1.9.0 release
published `plugin-dist`, one orphan commit, tagged `plugins/v1.9.0` — and the walks of a remote
source ran against a private mirror of it instead. The private-chain rehearsal of 2026-09-22
pointed Claude Code and Copilot CLI at that mirror pinned at the tag. The Codex walk of 2026-09-24
added it to codex-cli 0.155.1 at both release tags and at the distribution branch. Both are
recorded in `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`, the Codex walk under its
"The Codex half (E3)" section. No block on this page is presented as executed when it was not.

`<owner>/stamity` below is your own mirror or this repository, whichever your organization serves
from. The branch a release publishes the distribution to is `plugin-dist`, and each release also
tags it `plugins/v<version>` — a tag is what you point a marketplace at when you want a pin.

### Claude Code

```sh
claude plugin marketplace add <owner>/stamity#plugin-dist
claude plugin install stamity@stamity --scope project
```

*From the vendor's plugin-marketplaces and CLI reference pages, accessed 2026-09-21; the remote
source above is unexecuted against this repository's distribution. Its GitHub-source form ran once,
in the private-chain rehearsal of 2026-09-22: `plugin marketplace add` on a private catalog
repository whose Claude entry is a `git-subdir` source pinning a private mirror at
`plugins/v1.9.0`, then the project-scope install from it, both exit 0 on Claude Code 2.1.278. Two
proofs executed different halves of this route,
both on Claude Code 2.1.278 on 2026-09-20. The route proof took the root's own side and never ran
these two commands: `claude plugin validate --strict <root>/claude` printed `✔ Validation passed`
and exited 0, and a `--plugin-dir` run listed the plugin's ids and then ran the setup command. The
two commands above were walked by the lifecycle proof instead — `plugin marketplace add`, then
`plugin install stamity@stamity --scope project` — against a CLONE of the distribution tree checked
out at the tag, with that clone's catalog `source` rewritten to the relative root path a local
mirror serves, because a local bare repository is not a marketplace source this client takes.*

The two commands write to two places. `marketplace add` declares the marketplace in the **user**
settings of your Claude configuration directory (`extraKnownMarketplaces` there), and
`plugin install … --scope project` writes only the enablement into your repository's own
`.claude/settings.json`:

```json
{
  "enabledPlugins": { "stamity@stamity": true }
}
```

`stamity plugin setup` keeps that key beside its own `permissions`, in either order, and says so:
the file is owned per top-level key, so the client's enablement — and the marketplace declaration
below, if you add it — survive setup, `sync`, `check` and `clean` (the rule is under
[Set the repository up](#set-the-repository-up)).

What makes the decision reviewable is a declaration you write into the project settings yourself —
the same `extraKnownMarketplaces` block beside the enablement, so the committed file names the
source as well as the plugin:

```json
{
  "extraKnownMarketplaces": {
    "stamity": { "source": { "source": "github", "repo": "<owner>/stamity" } }
  },
  "enabledPlugins": { "stamity@stamity": true }
}
```

One caveat travels with that declaration: the `plugin` subcommands read it by name and not by
source. In a configuration directory that has never run `marketplace add`, `plugin install
stamity@stamity` answers "not found in marketplace" and `marketplace update stamity` answers
"Marketplace not found" until `marketplace add` has run; the vendor documents the project
declaration's effect at session start, which was not measured here *(measured 2026-09-22 on Claude
Code 2.1.278 by the private-chain rehearsal)*.

`marketplace add` also takes a git URL with a `#ref`, or a **local path** — which is how you try
a root you built yourself without publishing it anywhere *(from the same vendor page, accessed
2026-09-21)*. A local BARE repository is not one of those forms: the route proof measured
`marketplace add <path>#<tag>` answering `Path does not exist` and a `file://` URL answering
`Invalid marketplace source format`, so a mirror you serve from disk is a checked-out directory.

### Copilot CLI

```sh
npm install -g @github/copilot
copilot plugin marketplace add <owner>/stamity#plugin-dist
copilot plugin install stamity@stamity
```

*From the vendor's CLI plugin reference, accessed 2026-09-21. The route proof executed this route
from a marketplace on disk. The remote form ran once, in the private-chain rehearsal of
2026-09-22 — `copilot plugin marketplace add <owner>/stamity-plugins-mirror#plugins/v1.9.0`, then
the install, both exit 0 on GitHub Copilot CLI 1.0.87 — against a private mirror at that tag, not
against this repository's own distribution.* Take the
marketplace route rather than a direct install: `copilot plugin install <path>` still works and
prints a deprecation warning in favour of `plugin@marketplace` *(executed 2026-09-20 on GitHub
Copilot CLI 1.0.85, which installed 10 skills unauthenticated and listed `stamity` under `copilot
plugin list --json`)*.

Where an install lands, and whether it is a copy at all, depends on the marketplace's own source. A
**remote** marketplace install is a cached copy under
`~/.copilot/installed-plugins/<marketplace>/<plugin>`, or `_direct/<source-id>/` for a direct one:
a root you edit on disk changes nothing in the client until you install it again, and `copilot
plugin update stamity` is the refresh — the bare plugin name, the spelling the lifecycle walk
executed and a built tree's `README.md` prints; the vendor's reference spells a marketplace
install's refresh `plugin-name@marketplace-name`, and that `stamity@stamity` form is vendor-stated
for a remote marketplace and unmeasured here for `update`. A marketplace on a **local path** is the
other case, and nothing is copied — the plugin loads live from the directory it sits in, an edit
takes effect on `/restart` or in a new session, and no `plugin update` is needed *(vendor-stated
for a directory-source marketplace, read 2026-09-21; measured 2026-09-20 on 1.0.85, which reported
the installed entry's source as `live`, copied nothing, never wrote `installed-plugins/`, and
answered `plugin update` with "there is nothing to update")*.

Project skills win over plugin skills on this client — `.github/skills/`, `.agents/skills/` and
`.claude/skills/` are searched first — so a plugin skill with the same id as one of yours is
shadowed rather than merged.

### Cursor

For an organization, the route is the dashboard, not the CLI. Team marketplaces come with Cursor's
Teams and Enterprise plans: **Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace**,
pointed at your mirror of the distribution branch. Each plugin in a team marketplace takes one of
three install modes, **Default Off**, **Default On** or **Required**, and Required is the one that
rolls the plugin out to the whole team, as the managed-settings template does for Claude Code in
[the enterprise forks guide](enterprise-forks.md). Restrict who sees the marketplace under
**Marketplace Settings → Marketplace Access**. Cursor re-indexes a marketplace *"at most once
every 10 minutes, batching rapid pushes to the latest commit"*.

*From the vendor's plugins page (`/docs/plugins` on Cursor's documentation site), accessed
2026-09-21 and again 2026-09-24 for the plans and the three modes. The dashboard is an
organization action in a browser, and a team marketplace needs a team account, so no proof here
executes it; what the route proof executed for this client is the `--plugin-dir` form below.*

For one developer, install from the Customize view, or run the agent against a root on disk:

```sh
agent --plugin-dir ./cursor --trust
```

*Executed 2026-09-20 on the Cursor agent CLI 2026.09.15.* `--trust` is not optional for a
headless run — without it the run exits 1 on the Workspace Trust prompt. Asked for every skill the
plugin provides, including the ones it may not invoke itself, the client returned exactly the 18
ids the root ships. `~/.cursor/plugins/local` is the drop directory when you would rather not pass
a flag.

Each `--plugin-dir` run also leaves an empty directory behind in your own home, at
`~/.cursor/projects/<slug>`, where the slug is the working directory's path truncated to 42
characters with a hash appended *(observed 2026-09-20 on the same build)*. It is the client's own
per-project scratch, it holds nothing of the plugin, and deleting it costs nothing.

### Codex

```sh
codex plugin marketplace add <owner>/stamity --ref plugin-dist
codex plugin add stamity@stamity
```

*Executed 2026-09-24 on codex-cli 0.155.1 against a private mirror of the distribution, not
against this repository's own.
`codex plugin marketplace add <owner>/stamity-plugins-mirror --ref plugins/v1.9.0`, then
`codex plugin add stamity@stamity`, both exited 0 with Codex not logged in.
The clone authenticated through the machine's git credential helper, and no token was passed.
The installed cache's per-file sha-256 map equalled the tag's `codex/` tree over 681 files. The
same walk added the mirror at `--ref plugin-dist`, the branch form above, and installed a root
equal to the `plugins/v1.9.1` tree over 682 files. The local form ran first, on 2026-09-20 on
codex-cli 0.154.0, against a marketplace on a local path in a scratch `CODEX_HOME`: both commands
exited 0 with no login, and the installed cache tree was byte-identical to the built root over all
45 files outside its bundled `runtime/`, which the route proof compared again at the 1.9.1 cut.*

**The `--ref` is not optional, and it matters most for a private fork.** Without it, Codex checks
out the repository's default branch, which carries no Codex catalog: the distribution's Codex
catalog lives only on the distribution branch and its tags. codex-cli 0.155.1 then falls back to
that branch's Claude catalog and installs the npm package the catalog names, and both commands
still exit 0 with nothing in their output to say so. On the private mirror the walk measured, the
result was the PUBLIC package from the public registry, with no `runtime/`, no hooks and no
locator — for a private fork, the public source in place of its own. The same line against this
repository's own slug is expected to behave the same way, because its default branch carries the
same npm-sourced Claude catalog, but that was not measured. Pin with `--ref plugins/v<version>`
in place of the branch. This is the line the Codex root's own `README.md` prints.

Codex keeps a git marketplace's checkout at `$CODEX_HOME/.tmp/marketplaces/<name>` and records its
source and `ref` in `config.toml` under `[marketplaces.<name>]`. `codex plugin list --json` names
the marketplace's source without its ref, so `config.toml` is where you read which ref you are on
*(measured 2026-09-24 on 0.155.1)*.

A marketplace entry on its own installs nothing — both commands are needed. The marketplace file
this repository publishes lives at `.agents/plugins/marketplace.json`, and an entry's `source` is
a `git-subdir` object for a remote tree or a `local` path for one on disk; a local `source.path`
must start with `./` and stay inside the marketplace root.

Installs land under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`. `/plugins` in a
running session is the view that shows what is installed, and **skills need a fresh session** —
an install does not reach the session that performed it.

An administrator who wants the plugin available across a ChatGPT workspace uses the vendor's
workspace route instead, which is admin-gated. The admin imports a GitHub marketplace into the
workspace, and then sets each plugin to **Installed**, **Available** or **Not available** for each
role. *From OpenAI's enterprise plugin-management page (`/docs/enterprise/plugin-management` on
its ChatGPT learning site), accessed 2026-09-24. It is a workspace admin's action, so no proof here
executes it.*

A built distribution tree carries its own `README.md` with each client's install, pin, update and
rollback lines already filled in for the tag that tree was built at — including the flag this
client takes to select a ref. Read it from the tree you mirrored rather than substituting a ref
into the commands above by hand.

## Set the repository up

An install gives the client the plugin. It does not give your repository a charter, a manifest or
the files no container carries. One command does that, and every client's plugin ships it:

- **Claude Code** — `/stamity:st-setup`
- **Cursor** and **Copilot CLI** — `/st-setup`
- **Codex** — no command class rides in that container, so run the line the root's own `README.md`
  prints: the locator at `<root>/runtime/locate.mjs`, followed by `plugin setup`.
  On Codex that run needs permission to write. An interactive session asks you for it. A headless
  `codex exec` does not ask: its default sandbox is read-only, so the setup cannot even create
  `.stamity/`, and `--sandbox workspace-write` still refuses the repository's own `.codex/` — which
  is exactly where this client's repository-owned agents land. Grant both: `codex exec --sandbox
  workspace-write --add-dir <repo>/.codex` (measured 2026-09-22 on codex-cli 0.154.0).

On the Copilot CLI that command has one step before the others, and it is there because this client
passes a command's shell no plugin-root variable at all — the session environment carries
`COPILOT_CLI` and `COPILOT_HOME` and nothing ending in `PLUGIN_ROOT` (measured 2026-09-22 on
1.0.87). So `/st-setup` asks the client where its own root is, and the listing that answers is
`copilot skill list --json`. A plugin's rows there take two shapes: a carried skill's `path` ends
`/skills/<name>`, and a carried command's `path` is the commands directory itself,
`<root>/com.github.copilot/commands`, with no name on the end — while a builtin row's path sits in
the CLI's own cache. So the command reads the root as the part of the path before `/skills/` where
a row has one and before `/com.github.copilot/` otherwise, and it stops rather than guessing when
nothing matches or when two rows disagree; the root it derives is what it hands the locator as
`--plugin-root`. `copilot plugin list --json` does not answer it — its `installedFrom` is the
MARKETPLACE directory the plugin was added from, and the catalog inside that directory is what
points at a root beneath it (all measured 2026-09-22 on 1.0.87).

Each of those runs `stamity plugin setup` through the plugin's own runtime. What it writes:

- `AGENTS.md`, and the managed block in `CLAUDE.md`
- `.claude/rules/` and the other repository-owned classes from the table above
- `.claude/settings.json` **without** a `hooks` object, when the plugin owns hooks. The file is
  merged by top-level key: setup adds `permissions` (and `hooks` only when the repository owns
  hooks) and keeps every other key in place — including the `enabledPlugins` that
  `plugin install --scope project` wrote. A `permissions` or `hooks` key the engine did not record
  and that differs from what it renders is a collision: remove that key and re-run, or
  `sync --force` replaces only the engine's keys behind a verified `.bak`. A repository-mode
  `hooks` wiring an earlier setup left behind — its commands run scripts under
  `.stamity/generated/hooks/` — is removed and reported, behind a `.bak` whenever the engine cannot
  prove the file unedited (a lost setup left no ledger row, so it cannot); `clean` leaves such a
  wiring in place and `sync` removes it. `clean` reclaims this file the way it writes it: behind a
  verified `.bak`, named, when the bytes no longer match what the ledger recorded, with no backup
  when they still do, and not at all when the backup cannot be taken. Under a plugin install, a
  `hooks` key in this file is loaded by the client beside the plugin's hooks and `check` reports it
  as an unmanaged duplicate.
- MCP documents, when you select servers
- `.stamity/` — the manifest, the ledger, and the state directories

What it never writes: a single file of a class the installed root declares `carried`. That is the
whole of the boundary, and `sync` honours it afterwards — it writes nothing under a plugin-owned
class and prints one `plugin-owned` line per client naming the classes it skipped.

Two refusals worth knowing before you run it. On a repository that already carries a generated
setup it writes nothing and exits 1, naming the two-step route (see
[Move an existing setup](#move-an-existing-setup)). With no `--plugin-root` and no root variable
in the environment it exits 1 naming the variables it looked for.

Then read the status table:

```sh
stamity plugin status
```

It exits 0 whatever it finds — it is a report, not a gate — and prints one row each for the
resolved `runtime`, the `node` version against the floor, every client (what the manifest records,
whether a root was found and its version, the client floor, whether the client is selected), the
`compatibility` state, any `duplicates`, and `setup`, which lists each fact detection could not
determine with the exact `stamity config` command that sets it. `stamity plugin status --json`
emits the same report as data.

## Pin, update, roll back

There is no common answer here, and this page states the gap where there is one rather than
inventing a command. Every block below is *from the vendor's documentation, accessed 2026-09-21*,
unless it says otherwise; the release's lifecycle proof walked each client's upgrade and rollback
against two built versions on 2026-09-20, with the Claude rollback re-walked on 2026-09-22, and
where it measured something the documentation does not say, the measurement is what this page
states.

**Claude Code.** A marketplace added at a tag or a commit is the pin, and

```sh
claude plugin update stamity@stamity --scope project
```

is the refresh. `--scope project` is not optional on an install recorded in your repository:
without it the command defaults to user scope and refuses with `Plugin "stamity" is not installed
at scope user` *(measured 2026-09-20 on 2.1.278)*. Auto-update is **off by default for third-party
marketplaces**, so an update is something you run; `DISABLE_AUTOUPDATER` switches the client's own
updater off as well. Rolling back takes three commands, not two:

```sh
claude plugin marketplace add <owner>/stamity#plugins/v<previous>
claude plugin install stamity@stamity --scope project
claude plugin update stamity@stamity --scope project
```

*Walked 2026-09-22 on Claude Code 2.1.278 by the release's lifecycle proof, with exactly these
three commands: the marketplace re-added at the previous tag, then `plugin install stamity@stamity
--scope project`, then `plugin update stamity@stamity --scope project`. The third command's
`--json` output reported `updateOutcome: "updated"`, `oldVersion` `1.9.0-fixture.2` and
`newVersion` `1.9.0-fixture.1`, exit 0 — asserted by `test/ci/pluginLifecycle.test.ts`, whose
`rollback-documented` row names the three commands as executed with the third's exit code and its
stdout digest, and the QA harness's `H5` row carries that suite's rows at the candidate.* The
first two commands are the documented
route and they are not sufficient on their own: with the plugin already installed, `marketplace
add` answers that the source is already on disk and `install` answers "already installed … it loads
in place", leaving the recorded version where it was — the walk asserts that, which is what makes
the move attributable to the third command. The third line is what re-records the version, and the
client's own message is what names it. A `plugin rollback` subcommand is **settled absent**:
`claude plugin rollback stamity` answers `error: unknown command 'rollback'` on 2.1.278, and no
vendor page read 2026-09-21 names one. The reinstall route above is the rollback.

**Copilot CLI.** Pinning is the same move as installing — add the marketplace at
`#plugins/v<version>` — and `copilot plugin update stamity` is the refresh: the bare plugin name,
which is the spelling the lifecycle walk executed and the one a built tree's `README.md` prints
*(executed 2026-09-20 on 1.0.85, where it answered "there is nothing to update" against a
marketplace on a local path)*. The vendor's reference spells a remote marketplace's refresh as
`plugin-name@marketplace-name` — `copilot plugin update stamity@stamity` — and that form is
vendor-stated, not measured here. Rolling back is uninstall, re-add at the previous tag, install
(`copilot plugin uninstall stamity`, then
`copilot plugin marketplace add <owner>/stamity#plugins/v<previous>`, then
`copilot plugin install stamity@stamity` — the lines a built tree's `README.md` prints, from the
vendor's reference; the walk did not execute them). For a
marketplace on a local path there is nothing to update or roll back through the CLI: the plugin
loads live, so both are a replacement of the tree the marketplace points at *(measured 2026-09-20
on 1.0.85)*. `COPILOT_AUTO_UPDATE=false`, or
`autoUpdate: false` in the configuration, turns off the session-start auto-update of FIRST-PARTY
plugins — the built-in marketplaces — which is skipped in CI by default anyway; a third-party
marketplace like this one is not auto-updated at all. *From the vendor's CLI plugin reference,
accessed 2026-09-21.*

**Cursor and Codex: no vendor-documented pin, update or rollback command on 2026-09-21.** For
Cursor the served version is whichever commit the marketplace branch points at, so pinning and
rolling back are branch moves on your mirror, and the re-index above is the delay you plan
around; a root passed with `--plugin-dir` is replaced in place. For Codex,
`codex plugin marketplace upgrade` refreshes git-sourced catalogs only — *the subcommand is listed
by `codex plugin marketplace --help` on codex-cli 0.154.0, read 2026-09-20, and answered "No
configured Git marketplaces to upgrade" for a marketplace on a local path* — so an update is the
marketplace moved plus `codex plugin add stamity@stamity` again, and the route back a built tree's
`README.md` prints is four commands:

```sh
codex plugin remove stamity@stamity
codex plugin marketplace remove stamity
codex plugin marketplace add <owner>/stamity --ref plugins/v<previous>
codex plugin add stamity@stamity
```

*Walked 2026-09-24 on codex-cli 0.155.1 by the Codex walk, with exactly these four commands,
against a private mirror, moving from `plugins/v1.9.0` to `plugins/v1.9.1`. Each exited 0.
`plugin remove` deleted that version's cache directory, `marketplace remove` deleted the
marketplace checkout and its `config.toml` table, and the re-add and install gave a root equal to
the new tag's `codex/` tree over 682 files. Earlier, on 2026-09-20 on 0.154.0, the update and the
rollback of a marketplace on a local path were walked as the directory moved in place and
`codex plugin add stamity@stamity` again; re-adding that directory answered "already added".* The
`marketplace remove` step is required, not a precaution. Re-adding a git marketplace that is
already on record at another ref exits 1 with `marketplace 'stamity' is already added from a
different source; remove it before adding this source`, and it leaves the ref, the checkout and
the installed version where they were *(measured 2026-09-24 on 0.155.1)*.
`codex plugin remove` takes the qualified id: `codex plugin remove stamity` refuses with `plugin
requires --marketplace unless passed as <plugin>@<marketplace>`, and `codex plugin remove
stamity@stamity` purges that version's local cache, which is why the route ends in `plugin add`
again *(both measured 2026-09-20 on 0.154.0)*.

## Keep the runtime in step

A plugin root ships its own copy of the engine, so a plugin install needs nothing else to work.
A repository that *also* depends on the package directly is the one making the decision about
which engine reads its state, and the locator honours that:

```sh
npm install -D @zomarit/stamity@<version>
```

When the project holds a companion install whose version satisfies the root's compatible range,
the companion wins; otherwise the bundled copy runs. The range is a caret over the plugin's own
version, and the locator applies it in four shapes — `^1.9.0` is the same major at or ahead of
that version, `^0.7.2` the same minor, `^0.0.3` exactly that version, and a prerelease range
accepts only the identical prerelease. A prerelease companion never satisfies a released range.

Pin the companion exactly rather than to a range: the `renovate/companion.json` preset below does
that for you. `stamity plugin status` is where you read which of the two actually resolved, its
path and its version, and whether the running Node satisfies the runtime's floor.

## Move an existing setup

A repository with a generated setup is **not** migrated in place. `stamity plugin setup` refuses
on the manifest's presence, ahead of any detection walk, so a refused run writes nothing at all.
The route is two commands:

```sh
stamity clean -y
stamity plugin setup --client <csv>
```

`clean` removes what the engine wrote: every ledger row and its file, and the generated state.
It **keeps** your learnings, your handoffs, your overrides under `.stamity/overrides/` and your
own hooks — none of them is a ledger row, and none of them is the engine's to take. It also
prints one uninstall command line per client the manifest recorded, so the plugin side can be
removed the same way it was added.

There is no migration engine in 1.9.1. Detecting a generated setup, previewing the removals and
refusing on a conflict were planned and cut: the clean-then-setup route above is the documented
one, and it is the one this page will describe until a later minor ships the engine.

## Private catalogs and Renovate

An organization that does not fetch from this repository mirrors the distribution instead —
either the `plugin-dist` branch itself, or the four archives a release attaches, each beside its
`.sha256`. `release.json` at the root of that tree is the machine-readable contract: the version,
the source commit and its date, the branch and tag, the runtime's package, version, Node floor
and tarball digest, and one entry per client with its archive, digest, byte count and client
floor. Verify the digest you fetched against it before you serve it.

Two Renovate presets ship in this repository, and they do different jobs:

- **`renovate/plugins.json`** watches all four marketplace files for a `"ref": "plugins/v…"`
  value and opens a pull request when a newer release tag exists. Only a catalog that carries a
  `ref` moves: the Claude catalog on a `github` or `git-subdir` source — which is what this
  repository's own distribution publishes — and a Codex catalog pointed at a mirror rather than
  its own tree. The Copilot and Cursor catalogs address their roots by relative path, a Codex
  catalog on its own tree is `local`, and a Claude catalog on an `npm` or `archive` source carries
  no `ref`, so none of those is bumped by the preset.
- **`renovate/companion.json`** pins the repository's own `@zomarit/stamity` dependency to one
  exact version rather than a range, so the companion cannot drift away from the pinned plugin.

Extend them from your own configuration. The block below is the plugin consumer's `renovate.json`
as the private-chain rehearsal executed it, less the `$schema` line naming Renovate's schema (a
hand page here links inside the tree only), where `<owner>/stamity-plugins-mirror` is the private
mirror that carries the moved presets; a consumer of this repository's own distribution writes
`zomarit/stamity` in both lines:

```json
{
  "extends": [
    "github><owner>/stamity-plugins-mirror//renovate/plugins.json",
    "github><owner>/stamity-plugins-mirror//renovate/companion.json"
  ]
}
```

*Executed 2026-09-22 by the private-chain rehearsal (renovate 44.107.0): one pull request per
consumer, the plugin consumer's changing one file and one line — the catalog's `ref` — and the APM
consumer's changing `apm.yml`, its lock and the deployed files; a second run after the merges
opened none; the record is `.stamity/runs/2026-09-17_plugin-lifecycle/private-chain.md`.*

**Where the review step actually sits.** No client delivers a plugin update as a pull request.
Claude Code's marketplace auto-update, Cursor's team-marketplace re-index and the Copilot CLI's
own updater are all unreviewed pushes when they are on, and a managed-settings policy is an
administrator action rather than a review. So the reviewed object is **your organization's catalog
or mirror repository** — that is where Renovate's pull request lands, where a human reads the diff
between one release tag and the next, and where a merge is the approval. The clients then deliver
only what that repository already carries. An organization that skips that step has no review step
at all, whatever its client settings say.

## Troubleshooting

`stamity check` carries two rows for this route, and both are described with every other row in
[the troubleshooting guide](troubleshooting.md):

- **`plugin-runtime`** — the locator's resolved kind, path and version. It passes with a note
  when the manifest records no plugin client and no plugin root is in the environment — the
  ordinary state for a repository that is not plugin-backed, and nothing to act on. It warns
  only where a client IS recorded and no root is found: run check through the installed root's
  locator (`node <root>/runtime/locate.mjs -- check`), which hands it the root as `PLUGIN_ROOT`,
  or set `PLUGIN_ROOT` to that root. It fails on two states, and both are
  plugins this repository claims — a recorded client, or `mode: "plugin-backed"`: the locator
  refuses, or the resolved runtime's major differs from the major that wrote your `.stamity/`
  state. A refusal with no client recorded and no `plugin-backed` mode warns instead — the root
  variable came from elsewhere in your environment, and another session's broken plugin is not
  this repository's defect.
- **`plugin-duplicates`** — one entry per class delivered twice for one client, with its source
  (`ledger`, `apm` or `unmanaged`), the paths it found (the first three, sorted, then `+N more`;
  an `apm` entry has no file, so its path is the dependency line that matched) and the remedy for
  that source. It is a warning while the
  manifest still says `mode: "generated"` — coexistence is the expected state before you clean —
  and a failure once the manifest records `mode: "plugin-backed"`. The mode is one decision for
  the repository, and the client the entry names is where the duplicate was found. The `apm`
  source reads `apm.yml` in both shapes an APM manifest takes — a flat `dependencies:` list and
  the `dependencies:` → `apm:` section the [enterprise guide](enterprise-forks.md) shows — and
  matches a dependency that names this repository's slug or package name as a whole token,
  case-insensitively, in its bare, GitHub-URL and subpath spellings alike. On Claude Code, a
  `hooks` key in `.claude/settings.json` under a plugin install is an `unmanaged` finding of this
  row too, because the client loads it beside the plugin's hooks: remove the key, or keep personal
  rows in `.claude/settings.local.json`; `sync` removes a stale repository-mode rendering by itself
  (`clean` does not — it strips only the keys the mode owns).

Neither row removes anything. Every remedy is a step you run.
