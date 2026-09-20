---
title: Plugins
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 3f76070. Re-attested 2026-09-20 in the plugin-lifecycle package. -->
<!-- Re-open when: the capability-file schema changes shape, the locator's exit codes or its
     candidate order move, or a vendor page behind a command block is re-read on a later access
     date than the 2026-09-20 one every block here carries. `test/docsPages.test.ts` holds this
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
- **Codex, hooks** — carried means shipped and discoverable, never enforced: a plugin's hooks are
  skipped until the operator trusts them, and a headless run on codex-cli 0.154.0 ran no project
  hook at all.
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

Each block below carries a provenance line. A block that says **executed** was run on a real
client on 2026-09-20 and the output is what this page describes. A block that says **from the
vendor's documentation** is transcribed from a page read on 2026-09-20 and has not been run here;
the release's own route proof runs it. No block on this page is presented as executed when it was
not.

`<owner>/stamity` below is your own mirror or this repository, whichever your organization serves
from. The branch a release publishes the distribution to is `plugin-dist`, and each release also
tags it `plugins/v<version>` — a tag is what you point a marketplace at when you want a pin.

### Claude Code

```sh
claude plugin marketplace add <owner>/stamity#plugin-dist
claude plugin install stamity@stamity --scope project
```

*From the vendor's plugin-marketplaces and CLI reference pages, accessed 2026-09-20; executed by
the route proof of the next session.* What **is** measured about this root: `claude plugin
validate --strict <root>/claude` prints `✔ Validation passed` and exits 0 *(executed 2026-09-20 on
Claude Code 2.1.278)*.

`--scope project` records the install in your repository's own settings rather than in your user
profile, which is what makes the decision reviewable:

```json
{
  "extraKnownMarketplaces": {
    "stamity": { "source": { "source": "github", "repo": "<owner>/stamity" } }
  },
  "enabledPlugins": { "stamity@stamity": true }
}
```

`marketplace add` also takes a git URL with a `#ref`, or a **local path** — which is how you try
a root you built yourself without publishing it anywhere *(from the same vendor page, accessed
2026-09-20)*.

### Copilot CLI

```sh
npm install -g @github/copilot
copilot plugin marketplace add <owner>/stamity#plugin-dist
copilot plugin install stamity@stamity
```

*From the vendor's CLI plugin reference, accessed 2026-09-20; executed by the route proof of the
next session.* Take the marketplace route rather than a direct install: `copilot plugin install
<path>` still works and prints a deprecation warning in favour of `plugin@marketplace`
*(executed 2026-09-20 on GitHub Copilot CLI 1.0.85, which installed 10 skills unauthenticated and
listed `stamity` under `copilot plugin list --json`)*.

Installs land under `~/.copilot/installed-plugins/<marketplace>/<plugin>`, or
`_direct/<source-id>/` for a direct one. **They are cached.** A plugin root you edit on disk
changes nothing in the client until you install it again; for a marketplace install, `copilot
plugin update stamity` is the refresh.

Project skills win over plugin skills on this client — `.github/skills/`, `.agents/skills/` and
`.claude/skills/` are searched first — so a plugin skill with the same id as one of yours is
shadowed rather than merged.

### Cursor

For an organization, the route is the dashboard, not the CLI: **Dashboard → Plugins & MCPs → Team
Marketplaces → Add Marketplace**, pointed at your mirror of the distribution branch. Choose the
install mode there (Default Off, Default On, Required), and restrict who sees it under
**Marketplace Settings → Marketplace Access**. Cursor re-indexes a marketplace *"at most once
every 10 minutes, batching rapid pushes to the latest commit"*.

*From the vendor's plugins page, accessed 2026-09-20; executed by the route proof of the next
session.*

For one developer, install from the Customize view, or run the agent against a root on disk:

```sh
agent --plugin-dir ./cursor --trust
```

*Executed 2026-09-20 on the Cursor agent CLI 2026.09.15.* `--trust` is not optional for a
headless run — without it the run exits 1 on the Workspace Trust prompt. Asked for every skill the
plugin provides, including the ones it may not invoke itself, the client returned exactly the 18
ids the root ships. `~/.cursor/plugins/local` is the drop directory when you would rather not pass
a flag.

### Codex

```sh
codex plugin marketplace add <owner>/stamity
codex plugin add stamity@stamity
```

*Executed 2026-09-20 on codex-cli 0.154.0, against a marketplace on a local path in a scratch
`CODEX_HOME`: both commands exited 0 with no login, and the installed cache tree was byte-identical
to the built root over all 48 files. The `<owner>/stamity` spelling of a remote source is from the
vendor's build page, accessed 2026-09-20, and is executed by the route proof of the next session.*

A marketplace entry on its own installs nothing — both commands are needed. The marketplace file
this repository publishes lives at `.agents/plugins/marketplace.json`, and an entry's `source` is
a `git-subdir` object for a remote tree or a `local` path for one on disk; a local `source.path`
must start with `./` and stay inside the marketplace root.

Installs land under `~/.codex/plugins/cache/<marketplace>/<plugin>/<version>/`. `/plugins` in a
running session is the view that shows what is installed, and **skills need a fresh session** —
an install does not reach the session that performed it.

An administrator who wants the plugin available across a workspace publishes it through the
vendor's workspace route instead, which is admin-gated.

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

Each of those runs `stamity plugin setup` through the plugin's own runtime. What it writes:

- `AGENTS.md`, and the managed block in `CLAUDE.md`
- `.claude/rules/` and the other repository-owned classes from the table above
- `.claude/settings.json` **without** a `hooks` object, when the plugin owns hooks
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
inventing a command. Every block below is *from the vendor's documentation, accessed 2026-09-20;
executed by the route proof of the next session*, unless it says otherwise.

**Claude Code.** A marketplace added at a tag or a commit is the pin, and

```sh
claude plugin update stamity
```

is the refresh. Auto-update is **off by default for third-party marketplaces**, so an update is
something you run; `DISABLE_AUTOUPDATER` switches the client's own updater off as well. To roll
back, re-add the marketplace at the previous tag and install again:

```sh
claude plugin marketplace add <owner>/stamity#plugins/v<previous>
claude plugin install stamity@stamity --scope project
```

A `plugin rollback` subcommand is **not established**: one vendor page quoted it in slash form on
2026-09-20 and the CLI reference did not list it. This page will not promise it until the release's
own lifecycle proof measures it against an installed client.

**Copilot CLI.** `copilot plugin update stamity` refreshes a marketplace install; pinning is the
same move as installing — add the marketplace at `#plugins/v<version>`. `COPILOT_AUTO_UPDATE=false`
stops the CLI updating *itself* behind you. Rolling back is uninstall, re-add at the previous tag,
install. *From the vendor's CLI plugin reference, accessed 2026-09-20.*

**Cursor and Codex: no vendor-documented pin, update or rollback command on 2026-09-20.** For
Cursor the served version is whichever commit the marketplace branch points at, so pinning and
rolling back are branch moves on your mirror, and the re-index above is the delay you plan
around. For Codex, `codex plugin marketplace upgrade` refreshes the catalog — *the subcommand is
listed by `codex plugin marketplace --help` on codex-cli 0.154.0, read 2026-09-20* — and the route
back to a previous version is `codex plugin remove stamity` followed by adding the marketplace at
the earlier tag and `codex plugin add` again.

## Keep the runtime in step

A plugin root ships its own copy of the engine, so a plugin install needs nothing else to work.
A repository that *also* depends on the package directly is the one making the decision about
which engine reads its state, and the locator honours that:

```sh
npm install -D @zomarit/stamity@<version>
```

When the project holds a companion install whose version satisfies the root's compatible range,
the companion wins; otherwise the bundled copy runs. The range is a caret over the plugin's own
version, and the locator applies it in four shapes — `^1.8.0` is the same major at or ahead of
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

There is no migration engine in 1.9.0. Detecting a generated setup, previewing the removals and
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

- **`renovate/plugins.json`** tracks the `"ref": "plugins/v…"` value inside each of the four
  marketplace files and opens a pull request when a newer release tag exists.
- **`renovate/companion.json`** pins the repository's own `@zomarit/stamity` dependency to one
  exact version rather than a range, so the companion cannot drift away from the pinned plugin.

Extend them from your own configuration:

```json
{
  "extends": [
    "github>zomarit/stamity//renovate/plugins.json",
    "github>zomarit/stamity//renovate/companion.json"
  ]
}
```

*This is the shape, not an executed run: the presets are committed and readable in this tree, and
the release's own proof step is what executes them against a real Renovate.*

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
  only where a client IS recorded and no root is found. It fails on two states, and both are
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
  case-insensitively, in its bare, GitHub-URL and subpath spellings alike.

Neither row removes anything. Every remedy is a step you run.
