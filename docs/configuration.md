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
| `ruleDelivery` | one of always-on \| on-demand | `on-demand` |
| `communicationStyle` | one of plain \| technical | `plain` |
| `learnings.maxCount` | a positive integer | `150` |
| `hooks.userHooksDir` | a repo-relative directory path | `none` |
| `mcp.servers` | a comma-separated list of server ids this repo can resolve — curated, or supplied by an installed pack | `none` |
| `mcp.protocolVersion` | an MCP protocol revision string | `none` |
| `model.frontier` | a model id your client accepts, or `none` to clear, for every selected client without a pin of its own (`model.<class>.<client>`) — shape-checked only (non-empty, one line), re-picked on Copilot or Codex when its saved model list lacks it, and written as typed on Cursor | `claude=fable, cursor=(client default), copilot=claude-fable-5.1, codex=gpt-6-astra` |
| `model.advanced` | a model id your client accepts, or `none` to clear, for every selected client without a pin of its own (`model.<class>.<client>`) — shape-checked only (non-empty, one line), re-picked on Copilot or Codex when its saved model list lacks it, and written as typed on Cursor | `claude=opus, cursor=(client default), copilot=claude-opus-5.5, codex=gpt-6-astra` |
| `model.standard` | a model id your client accepts, or `none` to clear, for every selected client without a pin of its own (`model.<class>.<client>`) — shape-checked only (non-empty, one line), re-picked on Copilot or Codex when its saved model list lacks it, and written as typed on Cursor | `claude=sonnet, cursor=(client default), copilot=claude-sonnet-5, codex=gpt-6-sol` |
| `model.economy` | a model id your client accepts, or `none` to clear, for every selected client without a pin of its own (`model.<class>.<client>`) — shape-checked only (non-empty, one line), re-picked on Copilot or Codex when its saved model list lacks it, and written as typed on Cursor | `claude=haiku, cursor=(client default), copilot=claude-haiku-4.5, codex=gpt-6-luna` |
| `model.frontier.claude` | a model id claude accepts, or `none` to clear — wins over `model.frontier` on claude; shape-checked only (non-empty, one line) | `fable` |
| `model.frontier.cursor` | a model id cursor accepts, or `none` to clear — wins over `model.frontier` on cursor; shape-checked only (non-empty, one line) | `(client default)` |
| `model.frontier.copilot` | a model id copilot accepts, or `none` to clear — wins over `model.frontier` on copilot; shape-checked only (non-empty, one line) | `claude-fable-5.1` |
| `model.frontier.codex` | a model id codex accepts, or `none` to clear — wins over `model.frontier` on codex; shape-checked only (non-empty, one line) | `gpt-6-astra` |
| `model.advanced.claude` | a model id claude accepts, or `none` to clear — wins over `model.advanced` on claude; shape-checked only (non-empty, one line) | `opus` |
| `model.advanced.cursor` | a model id cursor accepts, or `none` to clear — wins over `model.advanced` on cursor; shape-checked only (non-empty, one line) | `(client default)` |
| `model.advanced.copilot` | a model id copilot accepts, or `none` to clear — wins over `model.advanced` on copilot; shape-checked only (non-empty, one line) | `claude-opus-5.5` |
| `model.advanced.codex` | a model id codex accepts, or `none` to clear — wins over `model.advanced` on codex; shape-checked only (non-empty, one line) | `gpt-6-astra` |
| `model.standard.claude` | a model id claude accepts, or `none` to clear — wins over `model.standard` on claude; shape-checked only (non-empty, one line) | `sonnet` |
| `model.standard.cursor` | a model id cursor accepts, or `none` to clear — wins over `model.standard` on cursor; shape-checked only (non-empty, one line) | `(client default)` |
| `model.standard.copilot` | a model id copilot accepts, or `none` to clear — wins over `model.standard` on copilot; shape-checked only (non-empty, one line) | `claude-sonnet-5` |
| `model.standard.codex` | a model id codex accepts, or `none` to clear — wins over `model.standard` on codex; shape-checked only (non-empty, one line) | `gpt-6-sol` |
| `model.economy.claude` | a model id claude accepts, or `none` to clear — wins over `model.economy` on claude; shape-checked only (non-empty, one line) | `haiku` |
| `model.economy.cursor` | a model id cursor accepts, or `none` to clear — wins over `model.economy` on cursor; shape-checked only (non-empty, one line) | `(client default)` |
| `model.economy.copilot` | a model id copilot accepts, or `none` to clear — wins over `model.economy` on copilot; shape-checked only (non-empty, one line) | `claude-haiku-4.5` |
| `model.economy.codex` | a model id codex accepts, or `none` to clear — wins over `model.economy` on codex; shape-checked only (non-empty, one line) | `gpt-6-luna` |
| `effort.frontier` | one of minimal \| low \| medium \| high \| xhigh \| max \| ultra — carried on claude, cursor, copilot, codex; the levels are the union of the clients' documented scales, so one a selected client cannot express is refused here, except a legacy level, which is accepted and written as the nearest level that client documents: minimal is written as low on copilot, codex | `claude=high, cursor=(not expressed), copilot=high, codex=high` |
| `effort.advanced` | one of minimal \| low \| medium \| high \| xhigh \| max \| ultra — carried on claude, cursor, copilot, codex; the levels are the union of the clients' documented scales, so one a selected client cannot express is refused here, except a legacy level, which is accepted and written as the nearest level that client documents: minimal is written as low on copilot, codex | `claude=high, cursor=(not expressed), copilot=high, codex=high` |
| `effort.standard` | one of minimal \| low \| medium \| high \| xhigh \| max \| ultra — carried on claude, cursor, copilot, codex; the levels are the union of the clients' documented scales, so one a selected client cannot express is refused here, except a legacy level, which is accepted and written as the nearest level that client documents: minimal is written as low on copilot, codex | `claude=medium, cursor=(not expressed), copilot=medium, codex=medium` |
| `effort.economy` | one of minimal \| low \| medium \| high \| xhigh \| max \| ultra — carried on claude, cursor, copilot, codex; the levels are the union of the clients' documented scales, so one a selected client cannot express is refused here, except a legacy level, which is accepted and written as the nearest level that client documents: minimal is written as low on copilot, codex | `claude=low, cursor=(not expressed), copilot=low, codex=low` |
| `review.maxIterations` | a whole number of review rounds within 1..10 | `3` |
| `gates.test` | a shell command line, or `none` to clear | `detected: npm run test` |
| `gates.lint` | a shell command line, or `none` to clear | `detected: npm run lint` |
| `gates.typecheck` | a shell command line, or `none` to clear | `detected: npm run typecheck` |
| `gates.all` | a shell command line, or `none` to clear | `detected: npm run lint && npm run typecheck && npm run test` |

One row is recorded but not yet consumed. `communicationStyle` is validated, persisted and
carried through migrations, and no generated file reads it, so setting it changes what the
manifest records rather than how any emitted file asks an agent to write.

The `model.*` rows are classes, not model ids. Each names a rung, and each selected client
maps that rung to an id it accepts, so one setting travels across clients instead of being
restated per client. Claude Code maps every rung onto its own family aliases, the top rung onto
`fable`. Copilot and Codex take the first model of a priority list Stamity ships that the
account's own model list holds: `init` and `sync` read that list from the client's CLI and
keep it in `.stamity/client-models.json`, which setup git-ignores, so the manifest names no
account's models (a 1.15.0 setup used to save it under `models.listed`, and the next `sync`
moves it). A client that does not answer keeps its cached list, and a checkout with none, a
fresh clone among them, keeps the model its files already carry; `STAMITY_NO_CLIENT_PROBE=1` in
the environment skips every read. With no list read, Copilot and Codex take the first model of
the shipped list, which is what their cells above show.
Cursor writes no model unless you pin one, list or no list. Cursor offers a
sub-agent a narrower list of models than `agent models` prints, and refuses a sub-agent call
that names a model outside it: in a live run on 2026-10-15 it refused the class model picked
from the account's saved list, so Stamity picks none from that list. In one live run the same
day that sub-agent list changed with the parent agent's model; one parent model was tried, so
that the list follows the parent's model beyond that run is unverified. An unpinned sub-agent
is left to Cursor's default: Cursor documents the parent agent's model as a sub-agent's default
(cursor.com/docs/subagents, read 2026-10-15), and its refusal text says the same of an omitted
model. No live run has dispatched an unpinned Stamity sub-agent, so that it runs is
unverified. The Cursor agent-format row of the [capability matrix](capability-matrix.md) names
the record of those runs.

`model.<class>` pins one id for every selected client; `model.<class>.<client>` pins one client
and wins over the class key there; `none` clears either one. On Copilot and Codex a pin the
account's saved list does not hold is replaced by the class's first listed model, since the
client would refuse it; Cursor writes a pin as typed.
For a Codex setup with access to GPT-6 Astra, pin its exact id on Codex alone:

```sh
stamity config set model.advanced.codex gpt-6-astra
stamity config set model.frontier.codex gpt-6-astra
stamity sync
```

Stamity checks a pin's shape, and each client must support the model you name. Codex emits
`model = "gpt-6-astra"`; effort remains the class's existing level unless you set its
`effort.*` key. A pin configures emitted agents; eval runners configure their scenario and
judge model pins separately.

`mcp.servers` is the one row whose closed list is kept on a page of its own rather than spelled
in its cell, and [the MCP server reference](reference/mcp-servers.md) is that page: every id this
repo resolves on its own, with the version each is pinned to, the credentials it needs and the
blast radius of handing it to an agent. An id absent from that page resolves only when an
installed pack supplies it.

## Changing one

Config edits state; it never regenerates output. Apply a change with `stamity sync`.
The verbs, their flags and the exit model are in [the CLI reference](cli-reference.md).

Regenerate this page with `node scripts/generate-docs.mjs`.
