---
title: CLI reference
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-docs.mjs`. -->

# CLI reference

Every command, argument, flag and exit status, rendered from the program. The command
list is the registered command set, and each command's flags are read back from its own
registrations — so this page cannot describe a flag the CLI does not have, or miss one it
does.

`stamity` with no arguments prints help and exits 0: a first touch is not a
mistake.

## Every command

| Command | Advertised | Effect | What it does |
|---|---|---|---|
| `stamity init` | yes | writes | set up this repo: detect the stack, decide the defaults, write the state |
| `stamity sync` | yes | writes | regenerate every managed file from the manifest and bundled content |
| `stamity check` | yes | reads only | diagnose the environment and gate on drift between disk and the engine's output |
| `stamity validate` | yes | reads only | check the content, hooks, learnings and credentials this repo authored |
| `stamity add` | yes | writes | install a content pack: run the gate chain, show every command it would wire, then write |
| `stamity config` | yes | writes | inspect and change the setup: keys, detection refresh, MCP servers |
| `stamity workspace` | yes | writes | one policy across several repositories: status, guided creation, and the cascade |
| `stamity worktree` | yes | writes | parallel checkouts of this repository: the inventory, guided setup, and receipt-based teardown |
| `stamity clean` | yes | writes | remove every generated file and the .stamity/ state directory |
| `stamity learn` | plumbing | writes | capture a learning through the engine's write gates (plumbing) |

## What every command shares

These are registered by the program, not by the individual commands, so they behave
identically everywhere they apply.

| Flag | Applies to | What it does |
|---|---|---|
| `-h, --help` | program | print usage and exit |
| `-v, --version` | program | print the version and exit |
| `--no-color` | program | disable colored output |
| `--json` | every command | machine-readable JSON output (non-interactive) |
| `-y, --yes` | every command | take the non-interactive path: every prompt resolves to its default, and a destructive confirmation proceeds instead of declining |
| `--dry-run` | mutating commands | preview changes without writing |

### JSON output

`--json` produces exactly one JSON document on stdout, and nothing else, for every
run that reaches a command — all 10 of the commands above, success and
failure alike. Human output is suppressed in the same run, so a reader never has to
separate prose from payload. Every document carries `ok`, `command` and `version`;
a success adds the command's own fields, and a failure adds `error` with `code` and
`message`.

A command line that is rejected before any command runs (exit `2` below — an unknown verb,
a missing required argument, a value outside a flag's choices) never reaches an action, so
**stdout is empty** and the diagnostic is on stderr. Parse stdout only after checking that
the status is not `2`.

The `error` object carries two OPTIONAL further lines, `why` and
`next`, which mirror the `why:` / `next:` lines the human
rendering prints. They appear when the failure was raised with them and are absent
otherwise: a throw site that knows the cause and the remedy states them, and one that does
not omits the keys rather than filling them with a guess. Treat both as optional when
parsing.

`--json` makes a run NON-INTERACTIVE — stdout belongs to the single document, so no
prompt can be written there — but it is NOT consent. It does not imply `-y, --yes`:
a command whose prompt is a destructive confirmation refuses the run instead of proceeding
on an assumed yes, so a pipeline that means to delete says `-y` explicitly.
Diagnostics still go to stderr, which is what keeps stdout parseable.

### Exit statuses

Three, and only three.

| Status | What it means |
|---|---|
| `0` | the command succeeded — `--help` and `--version` leave through here too |
| `1` | the command ran and failed; the code below says which failure it was |
| `2` | the command line was rejected before any command ran |

A failure is always status `1`. Which failure it was travels in the error document's
`error.code` field, not in the exit number, so a CI script branches on the code
string — there is no second numbering to read.

| `error.code` | What failed |
|---|---|
| `VALIDATION_ERROR` | content or config in this repository is structurally invalid |
| `CONFIG_ERROR` | an input file is malformed — manifest, YAML, pack manifest |
| `ADAPTER_ERROR` | a target-tool adapter could not produce its output |
| `UNKNOWN_ERROR` | an internal fault; the engine reached a state it does not classify |
| `INTEGRITY_ERROR` | output cannot be regenerated to match its source |
| `FS_ERROR` | a filesystem operation failed |
| `CLEAN_ERROR` | removal failed part-way |
| `NETWORK_ERROR` | a git transport failed — `worktree setup` could not reach `origin` to plan its branch; a remote with no such branch is not this |
| `LOCK_TIMEOUT` | a write lock could not be taken before the retry schedule ran out; another `stamity` run was holding it |

Two more codes exist only at the CLI edge and never come from the engine:
`USAGE` for a rejected command line, and `FAILURE` for a fault that
carries no engine classification.

## `stamity init`

set up this repo: detect the stack, decide the defaults, write the state

May write when it runs, so `--dry-run` previews any change without making it.

| Flag | What it does | Default |
|---|---|---|
| `--tools <csv>` | target tools, comma-separated (claude, cursor, copilot, codex) | — |
| `--maturity <tier>` | investment-calibration tier — one of `solo`, `team`, `scaleup`, `enterprise` | — |
| `--migrate <mode>` | what to do with a detected predecessor setup — one of `full`, `skip` | — |
| `--import-config <mode>` | what to do with an existing agent config file — one of `supplement`, `replace`, `skip` | — |
| `--force` | replace an existing setup in place | — |

## `stamity sync`

regenerate every managed file from the manifest and bundled content

May write when it runs, so `--dry-run` previews any change without making it.

| Flag | What it does | Default |
|---|---|---|
| `--force` | overwrite colliding unmanaged files after a verified .bak | — |

## `stamity check`

diagnose the environment and gate on drift between disk and the engine's output

Reads only. Nothing is written, so there is no preview mode to need.

Adds no flags of its own beyond the shared matrix above.

## `stamity validate`

check the content, hooks, learnings and credentials this repo authored

Reads only. Nothing is written, so there is no preview mode to need.

Adds no flags of its own beyond the shared matrix above.

## `stamity add`

install a content pack: run the gate chain, show every command it would wire, then write

May write when it runs, so `--dry-run` previews any change without making it.

| Argument | What it is |
|---|---|
| `<pack-spec>` | catalog id (ops), pack directory (./packs/ops), or an installed package name (@acme/ops) |

| Flag | What it does | Default |
|---|---|---|
| `--allow-untrusted` | install a pack with no trust basis at all — its hook and MCP definitions become commands your client runs as you (for packs you authored) | — |
| `--preview` | print every planned file's full body (bounded by the pack's footprint cap) | — |

## `stamity config`

inspect and change the setup: keys, detection refresh, MCP servers

May write when it runs, so `--dry-run` previews any change without making it.

| Argument | What it is |
|---|---|
| `[subcommand]` | list \| get \| set \| detect \| mcp \| policy — omit on a terminal for the interactive picker |
| `[key]` | config key, the mcp action (list \| add \| remove), or the policy action (list \| init \| allow \| deny \| remove) |
| `[value]` | new value, the MCP server id, or the policy pattern |

| Flag | What it does | Default |
|---|---|---|
| `--force` | config policy init: replace an existing .stamity/policy.json — including a defective one, which is the way out of a fail-closed policy | — |

## `stamity workspace`

one policy across several repositories: status, guided creation, and the cascade

May write when it runs, so `--dry-run` previews any change without making it.

| Argument | What it is |
|---|---|
| `[subcommand]` | status \| init \| sync — omit for status |

| Flag | What it does | Default |
|---|---|---|
| `--tools <csv>` | defaults.tools for the created workspace, comma-separated (claude, cursor, copilot, codex) — workspace init only | — |
| `--force` | workspace init: overwrite a workspace.json already at this directory, or create one nested inside an outer workspace. workspace sync: in every member, overwrite colliding unmanaged files after a verified .bak | — |

## `stamity worktree`

parallel checkouts of this repository: the inventory, guided setup, and receipt-based teardown

May write when it runs, so `--dry-run` previews any change without making it.

| Argument | What it is |
|---|---|
| `[subcommand]` | list \| setup \| cleanup — omit for list |
| `[name]` | the worktree name — its directory under the farm, and the branch it checks out |

| Flag | What it does | Default |
|---|---|---|
| `--use-existing` | worktree setup: attach to an existing local branch of that name | — |
| `--no-use-existing` | worktree setup: refuse rather than attach to an existing local branch | — |
| `--track` | worktree setup: track the remote branch of that name | — |
| `--no-track` | worktree setup: create a new local branch off HEAD instead of tracking | — |
| `--copy-secrets` | worktree setup: copy entries marked `secret` in the policy — without it they are skipped and the report says so | — |
| `--all` | worktree cleanup: sweep every worktree this lane manages | — |
| `--files-only` | worktree cleanup: invert the receipt's files and leave the checkout in place | — |
| `--force` | worktree cleanup: proceed on a worktree carrying uncommitted changes | — |

## `stamity clean`

remove every generated file and the .stamity/ state directory

May write when it runs, so `--dry-run` previews any change without making it.

| Flag | What it does | Default |
|---|---|---|
| `--pack <id>` | remove one installed pack — its files and ledger rows — and keep everything else | — |

## `stamity learn`

capture a learning through the engine's write gates (plumbing)

Plumbing. This verb is not listed in `stamity --help` because its caller is generated
agent content rather than a person. Hidden is not secret — `stamity learn --help` prints
in full — and it is documented here because a verb that exists and is undocumented is
worse than one that is merely unadvertised.

May write when it runs, so `--dry-run` previews any change without making it.

| Argument | What it is |
|---|---|
| `<subcommand>` | the only verb — one of `capture` |

| Flag | What it does | Default |
|---|---|---|
| `--title <text>` | what the learning is about; also its file-name slug | required |
| `--summary <text>` | one index line, under 200 characters | required |
| `--confidence <level>` | how much evidence backs the finding — one of `low`, `medium`, `high` | `medium` |
| `--body-file <path>` | read the body from a file instead of stdin | — |

Regenerate this page with `node scripts/generate-docs.mjs`.
