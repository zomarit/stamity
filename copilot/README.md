# stamity for the GitHub Copilot CLI

A plugin root built from the stamity corpus at version 1.9.0, commit 719ea79983a2a2024af3eba8b9bce7928ba24308 (2026-09-23T01:16:44+02:00).

## Install

```sh
npm install -g @github/copilot
copilot plugin marketplace add zomarit/stamity
copilot plugin install stamity@stamity
```

`copilot plugin install ./copilot` takes this directory straight off disk, which is the route
the route proof uses; the vendor deprecates direct installs in favour of the marketplace form
above (measured on 1.0.85, 2026-09-20).

A plugin named `stamity` already installed from another marketplace is the client's own refusal,
not this root's: uninstall the other one, or install from a marketplace you control.

## Where an install lands, and what a reinstall is for

```
~/.copilot/installed-plugins/<marketplace>/<plugin>   # installed through a marketplace
~/.copilot/installed-plugins/_direct/<source-id>/     # installed directly
```

`COPILOT_HOME` moves both. An install is a CACHED COPY, so editing a local plugin directory
changes nothing until you reinstall it — `copilot plugin install` again, or
`copilot plugin update stamity` for a marketplace install. `copilot plugin list` names what is
installed, and `copilot plugin uninstall stamity` removes it.

Set `COPILOT_AUTO_UPDATE=false` to stop the CLI downloading a newer version of itself behind a
run you meant to keep reproducible.

## Invoke

- agents: `/agent <id> (or --agent=<id>)`
- commands: `/<id>`
- skills: `/<id>`

A project's own `.github/skills/`, `.agents/skills/` and `.claude/skills/` are searched before
a plugin's, so a skill id this root ships is shadowed by a repository file of the same id.

Run `/st-setup` once after installing. It writes the repository-owned half this root does not
carry — the charter with this repository's facts and gates, and the client configuration —
through the runtime bundled at `runtime/`.

## Pin and roll back

```sh
copilot plugin update stamity
```

The marketplace entry resolves to a branch, so an install takes whatever that branch points at.
Pin by adding the marketplace at a tag; roll back by reinstalling at the previous tag.

## What this root does not carry

- rules — the Copilot CLI container defines com.github.copilot/rules/ but its file format is not stated (docs.github.com cli-plugin-reference, 2026-09-20) and this engine has no Copilot rule surface; stamity plugin setup writes .github/instructions/ for VS Code and the CLI alike
- MCP servers — MCP server selection and credential references are repository-owned
- the charter (`AGENTS.md`) and every `.stamity/` state file: they describe one repository, and
  this root is installed into many.

One spelling in this root is unverified against a vendor page and is measured by the route proof
rather than promised here: ${PLUGIN_ROOT} expansion inside a hook command, and its export to a hook process, are not stated on the hooks reference (docs.github.com hooks-reference, 2026-09-20); the variable is the only documented handle on the installed root, so every command uses it unmeasured.

The vendor's plugin-client list names the Copilot CLI, the cloud agent and the Copilot app; VS
Code is not on it (read 2026-09-20). The same artifacts reach Copilot in VS Code as repository
files written by `stamity plugin setup`.

Source: https://stamity.dev · https://github.com/zomarit/stamity
