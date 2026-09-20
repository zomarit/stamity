---
title: Getting started
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 3f76070. Re-attested 2026-09-20 in the plugin-lifecycle package. -->
<!-- Re-open when: init's prompt budget changes, a client's first-run line changes, a verb joins
     or leaves the CLI, a probe joins or leaves `check`, a path joins or leaves `.stamity/`, or the
     APM route's client floor or per-target output moves. `test/docsPages.test.ts` holds this page
     to the hand-page contract; the generated `cli-reference.md` and `capability-matrix.md` are
     what it must not contradict. -->

# Getting started

This page walks you through setting stamity up in your own repository for the first time.
At the end you have a working setup on disk, a manifest you can commit, and one real change
proved by a passing verification gate.

## What you need first

One prerequisite, and one strong recommendation.

- **Node 22.22.2 or newer.** That is the only prerequisite, and the published floor.
  `stamity check` verifies it as its `node-version` row.
- **Recommended: a git repository.** Git is optional for every verb but `worktree`, which needs
  a `git` binary on PATH and refuses without one; `init` proceeds without it. But setup writes
  dozens of files, and git is your revert path. Run `git init` first if this directory is fresh.

If you skip the second one, an interactive `init` stops and asks before it writes anything. A
`-y` or `--json` run goes ahead instead and prints a line saying the files it wrote have no
revert path.

Nothing is installed globally.

## Set stamity up

```sh
npx @zomarit/stamity init
```

`init` reads your repository and writes a setup and a manifest. `sync`, `check`, `config`,
`workspace`, `clean` and `add` read that manifest. `validate` runs with or without one, and
`learn` and `handoff` ask only that `.stamity/` exists. **Which verbs need the manifest** below
states all of this in full.

### The two questions init asks

At most two questions are asked on the ordinary path. Each one is skipped when something
already answered it.

1. **Which clients do you want?** This is asked only when nothing else decided the set: no
   `--tools` flag, and no trace of any client in the repository. If you already have a
   `.claude/` or a `.cursor/` directory, the question does not appear.
2. **What should happen to what is already here?** This is one question in one of two shapes. A
   previous setup from the predecessor project was found, so you choose to migrate it or leave
   it. Or an existing agent config file was found, so you choose to supplement it, replace it,
   or skip it. When both are present, the first question replaces the second. When neither is
   present, no question is asked.

On a terminal, the clients question is a **checkbox menu**: the arrow keys move between rows,
space toggles a client on or off, enter confirms, and ctrl-c cancels. Anywhere else you get a
numbered list instead, which you answer by typing the numbers separated by commas. A pipe, a
captured log, `TERM=dumb` and a window too short to draw the menu all take that path.

### The two questions only some repositories see

Two further questions sit outside that ceiling. Neither is on the ordinary path, and both are
asked after the two above.

- **Continue without git?** Asked only where git does not answer in this directory. Answering
  no cancels the run and writes nothing.
- **Create a workspace here?** Asked only where this directory is standalone and holds two or
  more repositories. The default is no, and a non-interactive run never creates one.
  [The workspaces guide](workspaces.md) explains what a yes sets up.

### Running init without answering anything

`-y` takes every default and asks nothing. That is what makes `init` safe to pipe or run in CI.

`--json` puts one JSON document on stdout. Because stdout belongs to that document, the run is
non-interactive too. On `init` that means every prompt resolves to its default — the same set
`-y` would take.

`--json` is **not** consent, and it does not imply `-y`. A verb whose prompt is a destructive
confirmation refuses the run rather than assume a yes. A pipeline that means to delete says `-y`
explicitly. [The CLI reference](cli-reference.md) states that rule for every verb.

One default differs between the two paths on purpose. A detected previous setup is **migrated**
when you answer the prompt, and **skipped** when nobody is there to answer. Migrating strips
files, and no machine should consent to that on your behalf.

`--dry-run` previews the whole run without writing. `--tools <csv>` names the clients up front.
`--force` replaces an existing setup in place.

## Install through APM instead

If your team already uses APM — the Agent Package Manager — the same corpus installs straight
from this repository as an APM package. That route needs no npm and runs no init walk.

```sh
apm install zomarit/stamity --target claude
```

Pin the ref for a repeatable install:

```sh
apm install zomarit/stamity#v<version> --target <claude|copilot|cursor|codex>
```

**The client floor is apm-cli 0.29.1.** That release fixed a type-detection cascade which used
to route this repository's tree past its own APM package. 0.30.0 is the current tested client.

An older client fails without failing. It exits 0, deploys nothing, and prints:

```
Agent Plugins v1.0.0 packages install natively only for the 'copilot' target
```

If you see that line with zero primitives deployed, upgrade the client and install again. Use
`pip install --upgrade apm-cli`, `brew upgrade apm`, or whatever self-update your client offers.

What arrives: 10 agents, 9 commands, 10 rules and 10 skills, each at the path its target reads.
`codex` takes the agents and the skills only. APM's codex profile carries no command or rule
class, and it folds instructions into `AGENTS.md` when you run `apm compile`.

One difference from the npm route is worth knowing. An APM install clones this whole repository
at the ref into your `apm_modules/` directory — tests, site and all — and deploys the primitives
out of it. APM gitignores that directory itself. The primitives it deploys are the corpus,
projected for APM by this repository's own generator and byte-checked in CI.

APM delivers those four primitive classes and no more. The charter, hooks, MCP wiring and the
engine itself stay with the packaged CLI route. For public downstreams or independent private
packages, [the enterprise guide](enterprise-forks.md) covers source and fork customization,
publisher identity, private authentication and the update lifecycle.

## Install as a plugin instead

The third route is a **client plugin**. Your client installs the plugin from a marketplace, the
plugin carries the agents, skills, commands and hooks inside its own root, and one command —
`/stamity:st-setup` on Claude Code, `/st-setup` on Cursor and the Copilot CLI — writes the files
no container can carry: the charter, the rules your client reads by glob, your MCP documents and
`.stamity/` itself. There is no `init` walk on that route, and no npm install either.

The ownership split per class per client, the install commands, pinning and rollback, and the
private-catalog route are [the plugins guide](plugins.md)'s to state.

## What init writes for each client

`AGENTS.md` is written for every client. It is the charter: your repository's facts, the floor
invariants, and the index of touchpoints. Three of the four clients read it natively.

`.agents/skills/` is the skills projection. It is written for the clients that read that tree,
and only when one of them is selected. Claude Code keeps its own copy in `.claude/skills/`
instead. So a claude-only repository gets no `.agents/` tree at all — the projection would
duplicate the native copy byte for byte, for a client that never looks at it.

Then each client gets what it cannot read without help:

| Client | Entry point | Touchpoint commands | Hooks | Skills |
|---|---|---|---|---|
| Claude Code | managed import block in `CLAUDE.md` | `.claude/commands/` — `/st-<id>` | `.claude/settings.json` | copied to `.claude/skills/` |
| Cursor | `AGENTS.md`, read natively | `.cursor/skills/` | `.cursor/hooks.json` | read from `.agents/skills/` |
| Copilot | `AGENTS.md`, read natively | `.github/prompts/` — `/st-<id>` | `.github/hooks/stamity.json` | read from `.agents/skills/` |
| Codex | `AGENTS.md`, read natively | none — no repo-level command home | `.codex/hooks.json` | read from `.agents/skills/` |

Agents, rules and MCP documents land per client too, each in that client's own dialect.
[The capability matrix](capability-matrix.md) is the one home for every cell of that. It renders
from the adapters themselves, so it cannot drift from what is emitted.

## Make your first real change

Your setup is not proven until something has run through it. The onboard walkthrough is what
proves it. It is six phases on your actual code: orient, pick one small change, name the proof,
make the change, run the verification gate, and optionally leave a note behind.

The six phases are sized for about fifteen minutes. That is a budget, not a promise about your
repository. The walk ends on a passing verification gate, or on a named list of what is not
done. It never ends on a claim.

How you reach it depends on your client. `init` prints the right line for yours:

- **Claude Code** — type `/st-onboard`.
- **Cursor** — type `/st-onboard`.
- **Copilot** — in the chat, type `@workspace run the st-onboard workflow`.
- **Codex** — type `$st-onboard`.

Cursor and Codex find skills in `.agents/skills/` and invoke them from there. Copilot's named
workflow request reaches the same projection. Claude Code reads its own copy under
`.claude/skills/`. Codex has no emitted project command directory, so its charter is where its
touchpoints are listed.

Both install routes are proved on a clean machine before either ships.
[The measurements page](measurements.md) has the first-run proof, lane by lane.

## The ten verbs

`init` · `sync` · `check` · `validate` · `add` · `config` · `workspace` · `worktree` ·
`plugin` · `clean`

The package installs two names for one binary: `stamity` and the shorter alias `st`.

What each verb does, every flag it takes and every status it exits with is
[the CLI reference](cli-reference.md)'s to state. That page renders from the program, so it
cannot describe a verb the CLI does not have or miss one it does.

### What the CLI reference cannot tell you

Four things, because each is about how two parts fit together rather than about any one verb.

- **Which verbs need the manifest.** `sync`, `check`, `config`, `workspace`, `clean` and `add`
  all read the manifest `init` wrote. `validate` runs with or without one. `plugin status` reads
  it where there is one and reports its absence where there is not; `plugin setup` refuses on a
  manifest, because writing one is what it does. `learn` and `handoff` ask only that `.stamity/`
  exists.
- **Which verbs need git.** `init`, `sync` and `check` read git where it is, and carry on where
  it is not. The `worktree` verbs need a `git` binary on PATH and refuse without one. The rest
  never call git.
- **Run `sync` after any `config` change.** `config` edits state and never regenerates managed
  output, so no client file moves until a sync runs. The one exception is `config mcp add`,
  which provisions `.env.mcp` and its `.gitignore` line on the spot.
- **Two verbs have subcommands with guides of their own.** `worktree` takes `list`, `setup` and
  `cleanup` — [working with stamity](working-with-stamity.md) covers what each one places,
  records and inverts. `workspace` takes `status`, `init` and `sync`, and reaches past this
  repository — [the workspaces guide](workspaces.md) covers it.

Every flag and every exit status is in [the CLI reference](cli-reference.md). Every settable key
is in [the configuration reference](configuration.md).

### The two hidden verbs

There are two more verbs, kept off `stamity --help`. `learn` records a learning through the
engine's write gates. `handoff` prepares, resumes, lists, completes and prunes handoffs through
those same gates. Both are plumbing an agent calls, not something you type.

Those gates exist because a learning is text that re-enters an agent's context on a later
session. Anything with write access to the repository can author a file that is read back into a
prompt. That makes a note a security surface rather than a scratch file.

So the CLI is the one write path, and every note passes it. A name shape cannot address anything
but a file in place. Per-file and per-directory caps bound what lands. Content checks cover the
frontmatter schema, the required sections and injection screening. An integrity digest is
stamped over the body.

### What reaches the network

Three things, and no more.

- **A startup update notice** asks the npm registry whether a newer version exists. It probes at
  most once a day. There is no `config` key for it — three environment variables switch it off.
  Set `STAMITY_NO_UPDATE_CHECK` to exactly `1`. `NO_UPDATE_NOTIFIER` and `CI` switch it off on
  any non-empty value.
- **`add` fetches the Sigstore trust root** when it installs a pack that declares a signature.
- **`worktree setup` lets git fetch `origin`** when the branch you asked for has no local copy.

Two of the nine touchpoints reach further. `/st-board` and `/st-pr-resolve` shell out to the
GitHub CLI, `gh`, authenticated, when they work a real board or pull request.
[`SECURITY.md`](../SECURITY.md) documents every one of these paths.

## When something looks wrong

```sh
npx @zomarit/stamity check
```

`check` is the diagnosis. It runs eleven environment probes. Then it asks the one question that
matters more than the rest: **would a sync change anything?**

If the answer is yes, disk and the engine's output disagree. Something was hand-edited, a
generated file was deleted, or a pack's content no longer matches what was installed. A failing
probe or any drift exits 1. Warnings alone exit 0, so `check` works as a CI step unchanged.

For a missing generated file, run `stamity sync`, then `stamity check` again. If you hand-edited
managed content, move your edits to the documented [override path](customization.md) before you
sync, and inspect any collision it reports. An `unknown` verification gate needs the project's
real command configured and redetected. Do not invent one, and do not run the literal word
`unknown`.

If the onboarding clock runs out after a touched-test pass, that is partial evidence. Report
`Not done:` until every declared test, lint and typecheck gate exits 0.

Row by row, with what each remedy means: [troubleshooting](troubleshooting.md).

## Where stamity keeps its state

Everything the setup knows about itself lives under `.stamity/`:

| Path | What it holds |
|---|---|
| `.stamity/manifest.json` | the setup itself — clients, config, and the per-file ownership ledger |
| `.stamity/learnings/` | notes agents recorded through `stamity learn` |
| `.stamity/handoffs/` | handoff records between sessions and clients |
| `.stamity/generated/` | hook scripts and the agent tool policy, written from code |
| `.stamity/mcp/` | `copilot-repo-settings.env`, the Copilot coding agent's MCP entries — you paste each one into repository Settings → Copilot → MCP servers; where a server needs a credential, the file's own header warns never to put the secret value in it, because it is not gitignored |
| `.stamity/packs/` | content installed by `add`, one directory per pack |
| `.stamity/overrides/` | agents, rules, commands and skills of your own, merged above the bundled content |
| `.stamity/runs/` | one record per work run — its proof block, with that run's findings ledger beside it |
| `.stamity/verify/` | one artifact per quality axis per commit, written by the verify skill |
| `.stamity/evidence/` | browser and QA evidence bundles, one per commit that captured them |
| `.stamity/inbox.md` | deferred rows, one dated block per run that filed them |
| `.stamity/worktree.json` | the worktree lane's policy — yours to write; absent, its two defaults apply |
| `.stamity/workspace-sync-journal.jsonl` | at a workspace root: the cascade's crash trail, two lines per attempted member per run |
| `.stamity/review-gate.json` | the per-run review-round counter the generated review-gate hook writes |

### What to commit

Commit `.stamity/`. The manifest is the provenance record. A teammate who clones the repository
gets the same setup without re-running `init`.

Commit everything `init` writes outside that directory too: `AGENTS.md`, `.agents/`,
the managed block in `CLAUDE.md`, and the client trees `.claude/`, `.cursor/`, `.github/`
and `.codex/`. Under `.github/` that means agents, instructions, prompts, hooks and the
`copilot-setup-steps.yml` workflow. It also means the MCP documents `.mcp.json`,
`.cursor/mcp.json`, `.vscode/mcp.json` and `.codex/config.toml`, where servers are selected.

Two reasons to commit all of it. A clone then arrives with working commands and skills already
on disk. And generated content earns no exemption from review — it lands as an ordinary diff,
and `check` is what catches it drifting from what the engine would emit today.

### What not to commit

One file stays out of the repository: `.env.mcp`, which holds MCP credentials. It is the single
entry `init` adds to your `.gitignore` for you.

Because everything else is committed, a second checkout of this repository arrives with the
whole setup in place and that one file missing. Placing it is exactly what
`stamity worktree setup` does when it creates one.

`review-gate.json` is the one path that is neither committed nor ignored. A run writes it,
nothing commits it, and nothing ignores it. Leave it in that state. It is runtime state for the
run that wrote it, and its absence means the review gate is open. A path that is
untracked and un-ignored is one `stamity worktree setup` refuses to carry across, so a review
round counted in one worktree never gates another.

## Keeping your setup current

```sh
npx @zomarit/stamity@latest sync
```

`sync` regenerates every managed file from the bundled content of whichever version ran it.
Pinning `@latest` on the sync is how you take an engine update. Your own edits outside a managed
block survive; the block itself is rewritten. Run `check` afterwards to confirm the tree is
clean.

## Where to go next

- [Working with stamity](working-with-stamity.md) — which of the nine touchpoints to open, what it may do, and what it leaves on disk.
- [Customization](customization.md) — replacing or patching a shipped artifact, without editing a file stamity ships.
- [Packs and trust](packs-and-trust.md) — installing content on top of the corpus, the trust tier it lands on, and what `add` refuses.
- [Troubleshooting](troubleshooting.md) — the exit model, every `check` row, and the common failures.

## Words this documentation uses

One spelling per idea, across every page.

| Word | What it means here |
|---|---|
| stamity | the product: this CLI, and the setup it generates. Written lowercase everywhere, including at the start of a sentence. |
| corpus | the canonical content stamity ships — `content/` plus `packs/`. Authored once, emitted per client. |
| charter | the always-on file every generated setup carries: your repository's facts, the floor invariants, and the touchpoint index. It is written as `AGENTS.md`. |
| touchpoint | one of the nine `/st-` slash commands your agent runs. Your client decides the invocation form. |
| verb | one of the ten names you type after `stamity`: `init`, `sync`, `check`, `validate`, `add`, `config`, `workspace`, `worktree`, `plugin`, `clean`. |
| manifest | `.stamity/manifest.json` — the record of your setup: its clients, its config, and every file stamity wrote. |
| managed block | the span between a `STAMITY:BEGIN` and a `STAMITY:END` marker. Every sync rewrites it; the text outside it is yours. |
| drift | disk and the engine's output disagreeing. `check` asks whether a sync would change anything, and names each file that would. |
| gate | always said with which one. The **verification gates** are lint, typecheck and tests. The **save gate** admits a file to `.stamity/overrides/`. The **leak gate** is this repository's own scan of its own tree. |
| override | a file of yours under `.stamity/overrides/` that replaces a shipped artifact whole. |
| overlay | a patch that states a delta over a shipped artifact, and leaves everything it did not name flowing from the corpus. |
| pack | content installed on top of the corpus by `add`, one directory per pack under `.stamity/packs/`. |
| fork layer | the `fork/` directory inside a forked package, holding that fork maintainer's own artifacts. Your overrides still outrank it. |
| hand-written page, generated page | a page a person wrote and dated, against one rendered from code. A generated page is byte-compared with a fresh render, so it cannot go stale quietly. |
| the predecessor project | the setup tool stamity replaces. The migration guide is the one page that names it. |
