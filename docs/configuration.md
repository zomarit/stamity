---
title: Configuration reference
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# Configuration reference

Every key `stamity config` addresses, rendered from the closed registry the command reads.
The registry is the whole surface: `config set` refuses any key not listed here by name,
so a key absent from this table cannot be written even if the manifest would accept it.

Values live in `.stamity/manifest.json`. Editing that file by hand is not the supported
path — `config set` validates the result against the manifest schema before it writes,
and prints the same refusal the writer would have produced.

On a terminal, `stamity config` with no subcommand opens a navigable picker over the same
rows `config list` prints, and applies the one key it settles per run through the validation
and write path `config set` uses. Scripts, pipes and CI see no prompt — there, bare `config`
is `config list`.

## Stored and effective

A key reads two ways, and they disagree whenever a key is unset.

| Reading | What it is | Where you see it |
|---|---|---|
| Stored | the value the manifest carries, or nothing at all | `stamity config get <key>` — an unset key prints its default in parentheses |
| Effective | what binds after engine defaults are applied | `stamity config list` — every key, marked `(set)` or `(default)` |

An unset key is not an absent opinion: an engine default is deciding, and the third
column below is that decision. Setting a key to the same value it already resolves to
changes nothing except that the choice becomes yours and survives a default change.

Some of those decisions are per client, because the model and effort rows resolve through
each selected client's own projection. The column is measured against a manifest that
selects every supported client and persists nothing else, so where the clients disagree the
cell names each one — and `stamity config list` prints that same shape for whichever
clients your own manifest selects.

## Keys

| Key | Accepted value | Effective when unset |
|---|---|---|
| `tools` | a comma-separated subset of claude, cursor, copilot, codex | always set — the manifest schema requires it |
| `platform` | one of github \| azure-devops \| gitlab | `none` |
| `maturityTier` | one of solo \| team \| scaleup \| enterprise | `solo` |
| `communicationStyle` | one of plain \| technical | `plain` |
| `learnings.maxCount` | a positive integer | `150` |
| `hooks.userHooksDir` | a repo-relative directory path | `none` |
| `mcp.servers` | a comma-separated list of server ids this repo can resolve — curated, or supplied by an installed pack | `none` |
| `mcp.protocolVersion` | an MCP protocol revision string | `none` |
| `model.frontier` | a model id your client accepts — passed through verbatim, shape-checked only (non-empty, one line) | `(client default)` |
| `model.advanced` | a model id your client accepts — passed through verbatim, shape-checked only (non-empty, one line) | `claude=opus, cursor=(client default), copilot=(client default), codex=(client default)` |
| `model.standard` | a model id your client accepts — passed through verbatim, shape-checked only (non-empty, one line) | `claude=sonnet, cursor=(client default), copilot=(client default), codex=(client default)` |
| `model.economy` | a model id your client accepts — passed through verbatim, shape-checked only (non-empty, one line) | `claude=haiku, cursor=(client default), copilot=(client default), codex=(client default)` |
| `effort.frontier` | one of low \| medium \| high — carried on claude, cursor, codex, omitted on copilot | `claude=high, cursor=(not expressed), copilot=(not expressed), codex=high` |
| `effort.advanced` | one of low \| medium \| high — carried on claude, cursor, codex, omitted on copilot | `claude=high, cursor=(not expressed), copilot=(not expressed), codex=high` |
| `effort.standard` | one of low \| medium \| high — carried on claude, cursor, codex, omitted on copilot | `claude=medium, cursor=(not expressed), copilot=(not expressed), codex=medium` |
| `effort.economy` | one of low \| medium \| high — carried on claude, cursor, codex, omitted on copilot | `claude=low, cursor=(not expressed), copilot=(not expressed), codex=low` |
| `review.maxIterations` | a whole number of review rounds within 1..10 | `4` |

## Changing one

Config edits state; it never regenerates output. Apply a change with `stamity sync`.
The verbs, their flags and the exit model are in [the CLI reference](cli-reference.md).

Regenerate this page with `node scripts/generate-docs.mjs`.
