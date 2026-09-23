# stamity for Cursor

A plugin root built from the stamity corpus at version 1.9.1, commit 27c9cc50cff48fbb3dcc3ce73c9637dbc1104eee (2026-09-23T12:50:31+02:00).

## Install

An organization adds a team marketplace in the Cursor dashboard (Dashboard → Plugins & MCPs → Team Marketplaces → Add Marketplace), sets the install mode (Default Off, Default On, Required), may restrict it under Marketplace Settings → Marketplace Access, and Cursor re-indexes a marketplace at most once every 10 minutes, batching rapid pushes to the latest commit (cursor.com/docs/plugins, accessed 2026-09-20).

That is the route for a team. One developer trying this root out needs no marketplace at all:
point the CLI straight at the directory, or drop it into the client's own local plugin directory.

```sh
agent --plugin-dir ./cursor
cp -R ./cursor ~/.cursor/plugins/local/stamity
```

## Invoke

- agents: `/<id>`
- commands: `/<id>`
- skills: `/<id>`

Run `/st-setup` once after installing. It writes the repository-owned half this root does not
carry — the charter with this repository's facts and gates, and the client configuration — through
the runtime bundled at `runtime/`.

## Pin and roll back

This client's CLI documents no plugin `install`, `update`, `rollback` or `uninstall`
subcommand (`cursor.com` CLI reference, accessed 2026-09-20), so there is no command to pin
with and none to roll back with. Both are done by moving the source this root is served from,
and a local copy is changed by REINSTALLING it — replacing the directory under
`~/.cursor/plugins/local/`, or re-running `--plugin-dir` against the new one.

A team marketplace imported from a repository tracks that repository's latest commit, so the
version an organization serves is whichever commit its mirror branch points at. Pin by pointing
the mirror branch at a tag and moving it deliberately; roll back by moving it back. Allow up to
ten minutes for the re-index either way.

## What this root does not carry

- MCP servers — MCP server selection and credential references are repository-owned
- the charter (`AGENTS.md`) and every `.stamity/` state file: they describe one repository, and
  this root is installed into many.

The nine touchpoint commands travel under `skills/`: this client converts a command into a skill carrying disable-model-invocation: true, and its commands/ discovery reads files rather than directories (cursor.com/docs/skills and /docs/reference/plugins, 2026-09-20), so the nine touchpoints ride under skills/ as the client renders them.

Source: https://stamity.dev · https://github.com/zomarit/stamity
