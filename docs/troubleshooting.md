---
title: Troubleshooting
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-30). -->
<!-- Re-open when: a doctor probe is added or removed, an error code starts or stops being
     thrown, or the three-status exit model changes. `test/docsPages.test.ts` holds this page
     to the hand-page contract; `src/cli/commands/check.ts` owns the probes and
     `docs/cli-reference.md` is the generated home for the exit model. -->

# Troubleshooting

Start here:

```sh
npx @zomarit/stamity check
```

Almost every question on this page is one that `check` already answers. It reads only —
nothing on this page's diagnosis path writes to your repository.

## The exit model

Three statuses, and only three.

| Exit | What it means |
|---|---|
| `0` | the command succeeded — `--help` and `--version` leave through here too |
| `1` | the command ran and failed |
| `2` | the command line was rejected before any command ran |

**A failure is always `1`.** Which failure it was travels in the error's `code` field, not
in the exit number, so a CI script branches on the code string rather than on a second
numbering that does not exist. Run with `--json` to read it:

| `code` | What failed |
|---|---|
| `VALIDATION_ERROR` | content or config in this repository is structurally invalid |
| `CONFIG_ERROR` | an input file is malformed — manifest, YAML, pack manifest |
| `ADAPTER_ERROR` | a target-tool adapter could not produce its output |
| `INTEGRITY_ERROR` | output cannot be regenerated to match its source |
| `FS_ERROR` | a filesystem operation failed |
| `CLEAN_ERROR` | removal failed part-way |
| `LOCK_TIMEOUT` | a write lock could not be taken before the retry schedule ran out |
| `UNKNOWN_ERROR` | an internal fault the engine does not classify |

One code is declared and never thrown: `NETWORK_ERROR`. Nothing in this build fetches, so
no path produces it and a CI branch on it can never be taken.

On exit `2` **stdout is empty** — the command line never reached an action — and the
diagnostic is on stderr. Parse stdout only after checking that the status is not `2`. The
full table, including the two codes that exist only at the CLI edge, is in
[the CLI reference](cli-reference.md).

## What `check` prints

Nine probes, then the drift gate, then a provenance rollup. A `fail` gates the exit code;
a `warn` is advisory and exits 0 — a missing state subdirectory or an absent git binary is
a legal repository, and a pipeline that failed on those would train you to ignore the
command.

Only three rows can fail: `node-version`, `manifest`, `pack-integrity`.

| Row | What a bad verdict means, and what to do |
|---|---|
| `node-version` | **Can fail.** Your Node is below the published floor. Install one in range, or switch with your version manager, then re-run. |
| `git-available` | Warns when git did not answer — no binary on PATH, or this is not a repository. Nothing requires git; sync's dirty-tree warning simply stays silent. |
| `manifest` | **Can fail.** Absent means the repo was never set up: run `init`. Defective prints the engine's own field-level message — fix the field it names. |
| `state-dirs` | Warns when `.stamity/learnings/` or `.stamity/handoffs/` is missing. Nothing is lost: they recreate on first write, and `sync` rewrites them now. |
| `learnings` | Warns when a recorded learning is invalid or sits past the file cap (those do not load). Run `validate` for the per-file detail. |
| `tmp-hygiene` | Warns on a live concurrent write, or on `.tmp.<hex>` litter from a write interrupted between the temp file and the rename. The row reports; it never deletes. |
| `env-mcp` | Warns when MCP servers are selected but `.env.mcp` is absent or a credential is still blank — a server whose credential is empty fails at start-up. `config mcp add <id>` recreates the file with the names it needs. |
| `tool-traces` | Warns when a client the manifest targets has nothing emitted for it in the ledger. `sync` writes its files and records them. |
| `pack-integrity` | **Can fail.** An installed pack's bytes no longer match what was recorded at install. Re-install that pack — do **not** reach for `sync`, which would carry the edited bytes into your emitted setup. |

Below the rows, one question: **would a sync change anything?** That is the drift gate, and
it runs the same read-only plan `sync` itself runs, so "check says clean" and "sync writes
nothing" are the same statement rather than two implementations that must agree.

If it says `drift: not evaluated`, it names the real reason — either the manifest could not
be read (the `manifest` row above already says so, with the fix), or the plan itself threw:
a pack that bricks projection, invalid content, a malformed override. Those are different
problems and the line tells you which one you have.

## Common failures

### Drift after editing a managed file

You edited inside a `STAMITY:BEGIN` / `STAMITY:END` block and `check` now reports drift.
That is the gate working: managed blocks are regenerated, so an edit inside one is an edit
the next sync overwrites.

```sh
npx @zomarit/stamity sync
```

To keep the change, move it **outside** the block. Text outside a managed block is yours
and survives every sync. If you deleted a generated file instead, sync rewrites it.

### A client is missing

The setup was generated for clients the manifest names, so a client with no files is
usually a client that was never selected:

```sh
npx @zomarit/stamity config get tools
npx @zomarit/stamity config set tools claude,cursor
npx @zomarit/stamity sync
```

`config` edits state and never regenerates output — the `sync` is what writes the files.
Note that some absences are correct rather than broken: Codex has no repository-level
command home, and Copilot takes no hook configuration. [The capability matrix](capability-matrix.md)
is the one home for which client gets what.

### `CONFIG_ERROR` naming a missing corpus

A message about bundled content not being found, naming a package root and the paths it
probed, means the installed package is incomplete — the corpus that ships inside it is not
where the engine expects it. Reinstall the package. In a source checkout, run
`npm run build`, which stages the corpus under `dist/`.

This is an install problem, not a repository problem: nothing in your tree can cause it and
nothing in your tree fixes it.

### `LOCK_TIMEOUT`

Two `stamity` runs tried to write the same file. Re-run once the other finishes. If nothing
else is running, a lockfile was left behind by an interrupted run — the message names the
exact path, so remove that one and re-run.

### Permission and filesystem errors

`FS_ERROR` names the operation and the path. The usual causes are a read-only parent
directory, an exhausted quota, or a path you do not own. Every write goes through a
temp file and an atomic rename, so a failure leaves the previous file intact rather than a
half-written one.

### `stamity init` refuses on a repo that already has a setup

That is deliberate — a second `init` never silently replaces the first. Use `sync` to
regenerate, `config` to change a choice, or `init --force` if you genuinely want to replace
the setup in place.

## Reporting something

- **A bug or a question** — [open an issue](https://github.com/zomarit/stamity/issues).
  Include the command you ran, its `--json` output if it failed, and your Node version.
- **A security vulnerability** — do not open a public issue. Use
  [the private advisory form](https://github.com/zomarit/stamity/security/advisories/new).
  What is in scope, and what the engine defends today, is in [`SECURITY.md`](../SECURITY.md).
