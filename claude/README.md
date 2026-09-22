# stamity for Claude Code

A plugin root built from the stamity corpus at version 1.9.0, commit 719ea79983a2a2024af3eba8b9bce7928ba24308 (2026-09-23T01:16:44+02:00).

## Install

```sh
claude plugin marketplace add zomarit/stamity#plugin-dist
claude plugin install stamity@stamity --scope project
```

## Invoke

- agents: `@stamity:<id>`
- commands: `/stamity:<id>` (the bare `/st-work` form resolves when it is unambiguous)
- skills: `/stamity:<id>`

Run `/stamity:st-setup` once after installing. It writes the repository-owned half this root
does not carry — the charter with this repository's facts and gates, and the client configuration —
through the runtime bundled at `runtime/`.

## Pin, update, roll back

The marketplace entry above resolves to a branch, so an install takes whatever that branch points
at. Pin by adding the marketplace at a tag or a commit instead of `#plugin-dist`, and record the
pin with the repository rather than in a shell history. The refresh, at the install's own scope:

```sh
claude plugin update stamity@stamity --scope project
```

Rolling back takes three commands, not two — measured 2026-09-22 on Claude Code 2.1.278: the
marketplace re-added at the previous tag answers that the source is already on disk, the reinstall
answers already installed, and the third command is what re-records the version. A `rollback`
subcommand answers `error: unknown command 'rollback'` on that build.

```sh
claude plugin marketplace add zomarit/stamity#plugins/v<previous>
claude plugin install stamity@stamity --scope project
claude plugin update stamity@stamity --scope project
```

The route in full, as `stamity-plugin.json` records it: an operator runs `claude plugin marketplace add <owner/repo | git URL#ref | local path>` and `claude plugin install stamity@stamity --scope project`, which writes `enabledPlugins` and `extraKnownMarketplaces`; a third-party marketplace has auto-update off by default, so `claude plugin update stamity@stamity --scope project` is the refresh — the scope has to match the install's, so a user-scope install refreshes with `--scope user` — and a marketplace added at a tag or a commit is the pin. A `rollback` subcommand is settled absent: one vendor page quoted it in slash form and the CLI reference omitted it (code.claude.com/docs/en/plugin-marketplaces and code.claude.com/docs/en/cli-reference, accessed 2026-09-20), and `claude plugin rollback stamity` answers `error: unknown command 'rollback'` on 2.1.278 (measured 2026-09-22). The route back is three commands, walked the same day: the marketplace re-added at the previous tag, `claude plugin install stamity@stamity --scope project`, then `claude plugin update stamity@stamity --scope project` — the first two answer already on disk and already installed and leave the recorded version where it was, and the third is what re-records it.

## What this root does not carry

- glob-scoped rules — the Claude Code plugin manifest has no rules field (json.schemastore.org/claude-code-plugin-manifest.json, 2026-09-20); glob-scoped rules are written by stamity plugin setup into .claude/rules/; glob-less rules ride as skills
- MCP servers — MCP server selection and credential references are repository-owned
- the charter (`AGENTS.md`, `CLAUDE.md`) and every `.stamity/` state file: they describe one
  repository, and this root is installed into many.

Source: https://stamity.dev · https://github.com/zomarit/stamity
