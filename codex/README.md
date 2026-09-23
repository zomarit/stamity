# stamity for Codex

A plugin root built from the stamity corpus at version 1.9.1, commit 27c9cc50cff48fbb3dcc3ce73c9637dbc1104eee (2026-09-23T12:50:31+02:00).

## Install

```sh
codex plugin marketplace add zomarit/stamity
codex plugin add stamity@stamity
```

`/plugins` lists what the running session has installed, and is the view to check the install
against before anything else.

## Invoke

- skills: `$<id>`

A skill this root adds is picked up by a FRESH session — installing or upgrading mid-session does
not put it in reach of the session that ran the install. Start a new one before you look for it.

## Set the repository up

This root carries no `st-setup` command — this client documents no project-scoped command directory. Run the setup yourself instead,
once per repository, from that repository's directory:

```sh
node "<plugin root>/runtime/locate.mjs" -- plugin setup --client codex -y --plugin-root "<plugin root>"
```

`<plugin root>` is a path YOU substitute, and `$PLUGIN_ROOT` is not it: that variable is
exported to hook processes and to nothing else, so in your own shell it expands to nothing and
the line above would send `node` to `/runtime/locate.mjs`. An install through the
marketplace above puts this root at

```
<CODEX_HOME>/plugins/cache/stamity/stamity/1.9.1/
```

where `<CODEX_HOME>` is `~/.codex` unless you have set it, the first `stamity`
is the marketplace's name and the second is this plugin's. Run `codex plugin list --json` if
the version directory is not the one above.

It writes the repository-owned half this root does not carry: the charter with this repository's
facts and gates, and the client configuration.

## Hooks

The hook document is at `hooks/hooks.json`, where this client discovers it by default. Three
steps still stand between an installed plugin and a hook that runs: `features.hooks = true` in
`.codex/config.toml` (written by the setup above), project trust in the Codex home config, and a
per-hook trust review through `/hooks`. A headless run proves discovery, never enforcement.

## Pin, roll back, remove

```sh
codex plugin marketplace upgrade
codex plugin marketplace remove stamity
codex plugin remove stamity@stamity
```

The marketplace entry resolves to a branch, so an install takes whatever that branch points at.
Pin by adding the marketplace at a tag; roll back by removing the marketplace, re-adding it at the
previous tag and installing again — `marketplace remove` is listed by `codex plugin marketplace
--help` on 0.155.1 (read 2026-09-22), and the re-point of a git marketplace already on record is
unmeasured, which is why the removal comes first. `codex plugin remove` uninstalls and clears the
local cache.

## Where this root is read

The CLI. This client's IDE extension reads no plugins at all, so an editor session sees only what
`plugin setup` wrote into the repository — which is another reason to run the setup line above
rather than treat the install as the whole story.

## What this root does not carry

- subagents — the Agent Plugins container carries no agent class (agent-plugins.org specification, 2026-09-20); stamity plugin setup writes .codex/agents/
- commands — this client documents no project-scoped command directory
- rules — glob-less rules ride as skills; the container carries no rules class
- MCP servers — MCP server selection and credential references are repository-owned
- the charter (`AGENTS.md`) and every `.stamity/` state file: they describe one repository, and
  this root is installed into many.

Source: https://stamity.dev · https://github.com/zomarit/stamity
