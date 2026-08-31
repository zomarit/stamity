---
title: Getting started
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-30). -->
<!-- Re-open when: init's prompt budget changes, a client's first-run instruction changes, or a
     verb joins or leaves the command surface. `test/docsPages.test.ts` holds this page to the
     hand-page contract, and `docs/cli-reference.md` plus `docs/capability-matrix.md` are the
     generated pages it must never contradict. -->

# Getting started

From nothing to one proven change on your own code. Fifteen minutes for the guided
first run, plus however long `npx` takes to fetch the package.

## Before you start

Two things, and nothing else.

- **Node 22.12 or newer.** That is the published floor, and `stamity check` verifies it
  as its `node-version` row. Nothing is installed globally and no service is contacted.
- **A git repository.** Not strictly required — but setup writes dozens of files, and
  without git there is no revert path. Run `git init` first if this is a fresh directory;
  if you do not, init stops and asks before writing anything.

## Set it up

```sh
npx @zomarit/stamity init
```

Init reads the repository, decides what it can, asks what it cannot, and writes the
setup plus a manifest every later command works from.

**At most two questions on the ordinary path**, both skipped when something already
answered them:

1. **Which clients.** Asked only when nothing decided the target set — no `--tools` flag,
   and no traces of any client in the repository. If you already have a `.claude/` or a
   `.cursor/` directory, the question does not appear.
2. **What to do with what is already here.** One question in one of two shapes: a
   previous setup from the predecessor project was detected (migrate, or leave it), or an
   existing agent config file was found (supplement it, replace it, or skip it). When both
   are present the first subsumes the second. If neither is present the question does not
   appear.

`-y` takes every default and asks nothing, which is what makes the command safe to pipe
or run in CI. `--json` puts one JSON document on stdout, and because stdout belongs to
that document the run is non-interactive too — on `init`, which has no destructive
confirmation, that means every prompt resolves to its default, the same set `-y` would
take. It is **not** consent, though, and it does not imply `-y`: a command whose prompt is
a destructive confirmation refuses the run rather than assume a yes, so a pipeline that
means to delete says `-y` explicitly. [The CLI reference](cli-reference.md) states that
rule for the whole command surface.

One default differs between the interactive and non-interactive paths on purpose: a
detected previous setup is **migrated** when you answer the prompt and **skipped** when
nobody is there to answer, because migrating strips files and no machine should consent to
that on your behalf. `--dry-run` previews the whole run without writing.

## What lands

`AGENTS.md` is written for every client — the charter: repository facts, the floor
invariants, the touchpoint index. Three of the four read it natively.

`.agents/skills/` — the skills projection — is written for the clients that read that
tree, and only when one is selected. Claude Code keeps its own copy in `.claude/skills/`
instead, so a claude-only repository gets no `.agents/` tree at all: the projection
would duplicate the native copy byte for byte, for a client that never looks at it.

Then each client gets what it cannot read without help. The short version:

| Client | Entry point | Touchpoint commands | Hooks | Skills |
|---|---|---|---|---|
| Claude Code | managed import block in `CLAUDE.md` | `.claude/commands/` — `/st-<id>` | `.claude/settings.json` | copied to `.claude/skills/` |
| Cursor | `AGENTS.md`, read natively | `.cursor/skills/` | `.cursor/hooks.json` | read from `.agents/skills/` |
| Copilot | `AGENTS.md`, read natively | `.github/prompts/` — `/st-<id>` | none emitted | read from `.agents/skills/` |
| Codex | `AGENTS.md`, read natively | none — no repo-level command home | `.codex/hooks.json` | read from `.agents/skills/` |

Agents, rules and MCP documents land per client too, each in that client's own dialect.
[The capability matrix](capability-matrix.md) is the one home for every cell of that —
it renders from the adapters themselves, so it cannot drift from what is emitted.

## Do the first real change

The setup is not proven until something has run through it. That is what the onboard
walkthrough is for: six phases, sized for about fifteen minutes, on your actual code —
orient, pick one small change, name the proof, make the change, run the gate, and
optionally leave a note behind. It ends on a passing verification gate or on a named list
of what is not done. It never ends on a claim.

How you reach it depends on the client, and init prints the right line for yours:

- **Claude Code** — type `/st-onboard`.
- **Cursor** — ask in plain words: run the st-onboard workflow from `.agents/skills/`.
- **Copilot** — in chat: `@workspace run the st-onboard workflow`.
- **Codex** — ask in plain words: run the st-onboard workflow from `.agents/skills/`.

Cursor, Copilot and Codex get a plain-words line rather than a slash command because
`st-onboard` is a skill, and only Claude Code turns a project skill into a `/name`
invocation. Asking for it by name reaches a file that is genuinely on disk.

## The seven verbs

`init` · `sync` · `check` · `validate` · `add` · `config` · `clean`

`init` sets a repo up. `sync` regenerates every managed file from the manifest — run it
after any config change, because `config` edits state and never regenerates output.
`check` diagnoses and gates. `validate` checks content this repository authored. `add`
installs a pack once its trust gates pass. `config` reads and changes the setup. `clean`
removes all of it.

There is an eighth, `learn`, which agents call to record a learning through the engine's
write gates. It is plumbing, not something you type. Every flag and every exit status is
in [the CLI reference](cli-reference.md); every settable key is in
[the configuration reference](configuration.md).

## When something looks wrong

```sh
npx @zomarit/stamity check
```

`check` is the diagnosis. It runs nine environment probes, then asks one question that
matters more than the rest: **would a sync change anything?** If the answer is yes, disk
and the engine's output disagree — a managed file was hand-edited, a generated file was
deleted, a pack's content no longer matches what was installed. A failing probe or any
drift exits 1; warnings alone exit 0, so it is usable as a CI step unchanged.

Row by row, and what each remedy means: [troubleshooting](troubleshooting.md).

## Where state lives

Everything the setup knows about itself is under `.stamity/`:

| Path | What it holds |
|---|---|
| `.stamity/manifest.json` | the setup itself — clients, config, and the per-file ownership ledger |
| `.stamity/learnings/` | notes agents recorded through `stamity learn` |
| `.stamity/handoffs/` | handoff records between sessions and clients |
| `.stamity/generated/` | hook scripts and the agent tool policy, written from code |
| `.stamity/packs/` | content installed by `add`, one directory per pack |

Commit it. The manifest is the provenance record, and a teammate who clones the
repository gets the same setup without re-running init. The one file that is **not**
committed is `.env.mcp` — MCP credentials — which the setup adds to `.gitignore` for you.

## Keeping it current

```sh
npx @zomarit/stamity@latest sync
```

`sync` regenerates every managed file from the bundled content of whichever version ran
it, so pinning `@latest` on the sync is how you take an engine update. Your own edits
outside a managed block survive; the block itself is rewritten. Run `check` afterwards to
confirm the tree is clean.

## Where to go next

- [Packs and trust](packs-and-trust.md) — installing content on top of the corpus, and what the gates check.
- [Troubleshooting](troubleshooting.md) — exit codes, doctor rows, and the common failures.
