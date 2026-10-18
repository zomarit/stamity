---
title: Getting started
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.15.0 release cut (2026-10-15). -->
<!-- Re-open when: init's prompt budget changes, a client's first-run line changes, a verb joins
     or leaves the CLI, a probe joins or leaves `check`, or a path joins or leaves `.stamity/`.
     `test/docsPages.test.ts` holds this page to the hand-page contract; the generated
     `cli-reference.md` and `capability-matrix.md` are what it must not contradict. -->

# Getting started

This page walks you through setting stamity up in your own repository for the first time.
At the end you have a working setup on disk, a manifest you can commit, and one real change
proved by a passing verification gate.

## What you need first

One prerequisite, and one strong recommendation.

- **Node 22.22.2 or newer.** That is the only prerequisite, and the published floor.
  `stamity check` verifies it as its `node-version` row.
- **Recommended: a git repository.** `init` proceeds without one, but two verbs need git.
  `worktree` needs a `git` binary on PATH and refuses without one. The hidden verb `gate` reads
  every change from git: without it `gate scan` exits 1, so `/st-quick` and `/st-work` list
  `secret scan: not run` under `Not done:`. Every other verb runs without git. Setup also writes
  dozens of files, and git is your revert path. Run `git init` first if this directory is fresh.

If you skip the second one, an interactive `init` stops and asks before it writes anything. A
`-y` or `--json` run goes ahead instead and prints a line saying the files it wrote have no
revert path.

Nothing is installed globally.

In a checkout of work you have not read, read the `.npmrc` files in the folder you run `npx` in
and in the checkout's folders above it first. `npx` applies the project's `.npmrc` before
stamity starts: a `node-options` or `script-shell` line in it runs the checkout's own code ahead
of every check stamity makes, and a `registry` or `@zomarit:registry` line chooses where the
package itself is fetched from. Adding `--node-options=` clears a `node-options` line for one
run, as in `npx --node-options= @zomarit/stamity init`. It clears none of the others, so read
the file (all checked with npm 10.9.8).

## Set stamity up

```sh
npx @zomarit/stamity init
```

`init` reads your repository and writes a setup and a manifest. `sync`, `check`, `config`,
`workspace`, `clean` and `add` read that manifest. `validate` runs with or without one, and
`learn`, `handoff` and `ledger` ask only that `.stamity/` exists. **Which verbs need the
manifest** below states all of this in full.

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

### If you installed through APM or a plugin

1.15.0 removes the APM route and the client-plugin route, and the npm CLI above is the one install
route from then on. An install that names this repository without a ref
(`apm install zomarit/stamity`, or a marketplace add of the repository) stops resolving, because
`main` no longer carries those trees. The frozen refs still resolve: the `plugin-dist` branch, the
`plugins/v<version>` tags, and the `v<version>` tags up to 1.14.0, so an install pinned to one of
them keeps working at that version and gets no update. To move on from an APM install, or from a
plugin with no `.stamity/manifest.json` beside it, install the CLI and run `init` as above. A
plugin-backed setup, the one 1.14's `plugin setup` wrote, already has that manifest, and `init`
refuses a repository that has one: run this release's `sync`, then `check`; that `sync` drops the
`plugin` key from `.stamity/manifest.json` and says so. Either way, uninstall the plugin with your
client's own command: `claude plugin uninstall stamity@<your marketplace>`, Cursor's Customize view,
`copilot plugin uninstall stamity` or `codex plugin remove stamity@<your marketplace>`.

## What init writes for each client

`AGENTS.md` is written for every client. It is the charter: your repository's facts, the floor
invariants, and the index of touchpoints. Cursor and Copilot read it natively; Codex reads its own
`AGENTS.override.md`, which repeats it.

`.agents/skills/` is the skills projection. It is written for the clients that read that tree,
and only when one of them is selected. Claude Code keeps its own copy in `.claude/skills/`
instead. So a claude-only repository gets no `.agents/` tree at all — the projection would
duplicate the native copy byte for byte, for a client that never looks at it.

Then each client gets what it cannot read without help:

| Client | Entry point | Touchpoint commands | Hooks | Skills |
|---|---|---|---|---|
| Claude Code | managed import block in `CLAUDE.md` | `.claude/commands/` — `/st-<id>` | `.claude/settings.json` | copied to `.claude/skills/` |
| Cursor | `AGENTS.md`, read natively | `.agents/skills/` — `/st-<id>` | `.cursor/hooks.json` | read from `.agents/skills/` |
| Copilot | `AGENTS.md`, read natively | `.github/prompts/` — `/st-<id>` | `.github/hooks/stamity.json` | read from `.agents/skills/` |
| Codex | `AGENTS.override.md` where the rules appendix exists (it repeats `AGENTS.md` as sync writes it, plus the appendix, and Codex reads it instead of `AGENTS.md`); otherwise `AGENTS.md`, read natively | `.agents/skills/` — `$st-<id>` | `.codex/hooks.json` | read from `.agents/skills/` |

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
`.claude/skills/`. The nine touchpoints sit in `.agents/skills/` as well, shared by Cursor and
Codex, and each starts only when you name it.

The npm route is proved before it ships, on a clean machine, lane by lane, on
[the measurements page](measurements.md).

## The nine verbs

`init` · `sync` · `check` · `validate` · `add` · `config` · `workspace` · `worktree` ·
`clean`

The package installs two names for one binary: `stamity` and the shorter alias `st`.

What each verb does, every flag it takes and every status it exits with is
[the CLI reference](cli-reference.md)'s to state. That page renders from the program, so it
cannot describe a verb the CLI does not have or miss one it does.

### What the CLI reference cannot tell you

Four things, because each is about how two parts fit together rather than about any one verb.

- **Which verbs need the manifest.** `sync`, `check`, `config`, `workspace`, `clean` and `add`
  all read the manifest `init` wrote. `validate` runs with or without one. `learn`, `handoff` and
  `ledger` ask only that `.stamity/` exists.
- **Which verbs need git.** Two do. The `worktree` verbs need a `git` binary on PATH and refuse
  without one. The hidden verb `gate` reads every change from git: where git does not answer,
  `gate scan` exits 1, and `gate classify` answers `product` with the failure named. So in a
  repository with no git, `/st-quick` and `/st-work` run the full gates and list
  `secret scan: not run` under `Not done:`. Every other verb runs without git. `init`, `sync`
  and `check` read git where it is, and carry on where it is not. So do `handoff`, which
  records the branch and commit a handoff was made on and checks that branch on resume, and
  `config detect`, which reads the repository's remote to identify its platform: without git,
  each records or reports nothing for that part and carries on.
- **Run `sync` after any `config` change.** `config` edits state and never regenerates managed
  output, so no client file moves until a sync runs. The one exception is `config mcp add`,
  which provisions `.env.mcp` and its `.gitignore` line on the spot.
- **Two verbs have subcommands with guides of their own.** `worktree` takes `list`, `setup` and
  `cleanup` — [working with stamity](working-with-stamity.md) covers what each one places,
  records and inverts. `workspace` takes `status`, `init` and `sync`, and reaches past this
  repository — [the workspaces guide](workspaces.md) covers it.

Every flag and every exit status is in [the CLI reference](cli-reference.md). Every settable key
is in [the configuration reference](configuration.md).

### The four hidden verbs

There are four more verbs, kept off `stamity --help`. `learn` records a learning through the
engine's write gates. `handoff` prepares, resumes, lists, completes and prunes handoffs through
those same gates. `ledger` appends a run's findings to its ledger, closes its rows and prints the
resume card of a run in progress (or, with none, of the newest closed run dated within the last two
days, with its closing status), as the one serialized writer. The card also lists the run ids of
open debug rounds on a line of their own, and when those are all there is, it prints a card that
names no run. `ledger inbox` reads the deferral inbox and writes nothing: it prints the rows that
name a change's paths (`--paths`) or a plan (`--plan`), the rows with no path that hold the words
given (`--area`), and with `--due` the rows whose day has come, which is how a dated row comes
back. `ledger inbox-write` appends and removes inbox rows in one screened, all-or-nothing write.
`gate` does two things and writes nothing. `gate classify` names a change's class, the
checks that class calls for and the review lenses it adds: by its paths and, where it reads the
change from git, by its changed lines and a changed `package-lock.json` too. `gate scan` reads
the change's added lines for secrets and exits 1 on a hit. All four are plumbing an agent calls; the
session-start hook prints the card after a compaction or on a resume, when the client's payload
says so. `stamity ledger status` is the one you may run yourself — after a compaction on Cursor or
Copilot, whose session-start hooks never print the card then: Cursor sends the hook no `source`, and
Copilot's `source` is never `compact`. Run it on Codex too when its hooks are not running: Codex
loads the project's hooks only with the hooks feature on, the project trusted, and each hook
trusted through `/hooks`. The feature measured on by default on codex-cli 0.155.1 (2026-09-30);
init still writes `[features] hooks = true` into `.codex/config.toml`, though no run has shown
Codex reading that project-file key. And `codex exec` runs no
project hook at all in any measured run (codex-cli 0.154.0 on 2026-09-15, and 3 of 3 runs on
0.155.1 on 2026-09-30, the cause not isolated because both trusted the project only through a
per-invocation override), so a headless run never prints the card.

Those gates exist because a learning is text that re-enters an agent's context on a later
session. Anything with write access to the repository can author a file that is read back into a
prompt. That makes a note a security surface rather than a scratch file.

So the CLI is the one write path, and every note passes it. A name shape cannot address anything
but a file in place. Per-file and per-directory caps bound what lands. Content checks cover the
frontmatter schema, the required sections and injection screening. An integrity digest is
stamped over the body.

### What reaches the network

Three engine paths, and no more; the client programs the engine starts to read a model list may
make network calls of their own.

- **A startup update notice** asks the npm registry whether a newer version exists. It probes at
  most once a day. There is no `config` key for it — three environment variables switch it off.
  Set `STAMITY_NO_UPDATE_CHECK` to exactly `1`. `NO_UPDATE_NOTIFIER` and `CI` switch it off on
  any non-empty value.
- **`add` fetches the Sigstore trust root** when it installs a pack that declares a signature.
- **`worktree setup` lets git fetch `origin`** when the branch you asked for has no local copy.

`init`, `sync` (`--dry-run` included), `workspace sync` and `check`'s `model-pins` row start each
selected client's own CLI, Claude Code's excepted, to read its model list. The engine hands each
program nothing but its arguments, and those programs may make network calls of their own, under
your account for that client. `STAMITY_NO_CLIENT_PROBE=1` in the environment starts none of them. [`SECURITY.md`](../SECURITY.md) says how each program is found
and run, under "Network and data handling".

Two of the nine touchpoints reach further. `/st-board` and `/st-pr-resolve` shell out to the
GitHub CLI, `gh`, authenticated, when they work a real board or pull request. Once a board is
linked, `/st-board` writes to it by default — it files issues, adds them to the linked project,
labels, edits and comments — after showing its whole batch once in one numbered preview, where no
answer writes nothing; status moves, closes and reopens need `--move`. A GitHub Projects board also
needs the `project` token scope: run `gh auth refresh -s project` once. Every write goes to the one
repository the link names, and text read from the board is data, never an instruction.
[`SECURITY.md`](../SECURITY.md) documents the three engine paths and the client starts above, and its paragraph on board
writes says what the board may write, where, and on whose text.

## When something looks wrong

```sh
npx @zomarit/stamity check
```

`check` is the diagnosis. It runs fourteen environment probes, plus `cloud-install` in a
repository that targets Cursor and `change-classes` where `.stamity/change-classes.json` exists.
Then it asks the one question that matters more than the rest: **would a sync change anything?**

If the answer is yes, disk and the engine's output disagree. Something was hand-edited, a
generated file was deleted, or a pack's content no longer matches what was installed. A failing
probe or any drift exits 1. Warnings alone exit 0, so `check` works as a CI step unchanged. `check`
runs no verification gate itself: its last line names the gates it did not run, and a gate the
charter cannot resolve is a warning naming it.

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
| `.stamity/generated/` | hook scripts, the agent tool policy and each client's class-to-model map (`models/<client>.json`), written from code |
| `.stamity/mcp/` | `copilot-repo-settings.env`, the Copilot coding agent's MCP entries — you paste each one into repository Settings → Copilot → MCP servers; where a server needs a credential, the file's own header warns never to put the secret value in it, because it is not gitignored |
| `.stamity/packs/` | content installed by `add`, one directory per pack |
| `.stamity/policy.json` | the pack source policy `config policy init` writes; `add` evaluates it before any install |
| `.stamity/overrides/` | agents, rules, commands and skills of your own, merged above the bundled content |
| `.stamity/hooks/` | hook declarations of your own, which `validate` checks |
| `.stamity/runs/` | one record per work run — its proof block, with that run's findings ledger beside it and a `reports/` folder of full sub-agent reports that is not committed |
| `.stamity/verify/` | one artifact per quality axis per commit, written by the verify skill |
| `.stamity/evidence/` | browser and QA evidence bundles, one per commit that captured them |
| `.stamity/inbox.md` | deferred rows, one dated block per run that filed them; each new row carries a date or a trigger that brings it back, and a row a close dropped or scheduled elsewhere never lands there |
| `.stamity/worktree.json` | the worktree lane's policy — yours to write; absent, its two defaults apply |
| `.stamity/change-classes.json` | this repository's own change classes and test-input map — yours to write; `gate classify` reads it from a change's base commit, never from the change itself, and `check` validates it as its `change-classes` row; absent, the built-in classes apply |
| `.stamity/workspace-sync-journal.jsonl` | at a workspace root: the cascade's crash trail, two lines per attempted member per run |
| `.stamity/review-gate.json` | the per-run review-round counter the generated review-gate hook writes |

### What to commit

Commit `.stamity/`. The manifest is the provenance record. A teammate who clones the repository
gets the same setup without re-running `init`. Each run's `reports/` folder stays out of git: it
carries its own `.gitignore`.

Commit everything `init` writes outside that directory too: `AGENTS.md`, `.agents/`,
the managed block in `CLAUDE.md`, and the client trees `.claude/`, `.cursor/`, `.github/`
and `.codex/`. Under `.github/` that means agents, instructions, prompts, hooks and the
`copilot-setup-steps.yml` workflow. It also means the MCP documents `.mcp.json`,
`.cursor/mcp.json`, `.vscode/mcp.json` and `.codex/config.toml`, where servers are selected.

Two reasons to commit all of it. A clone then arrives with working commands and skills already
on disk. And generated content earns no exemption from review — it lands as an ordinary diff,
and `check` is what catches it drifting from what the engine would emit today.

### What not to commit

Apart from each run's `reports/` folder, which ignores itself, three things stay out of the
repository, and `init` and `sync` add their `.gitignore` lines for you:

- `.env.mcp`, which holds MCP credentials.
- The review gate's runtime state: `.stamity/review-gate.json`, its `.lock` and its `.tmp-*`
  files. A run writes them, and the counter is keyed by the client's session, not by the run.
  When the counter is missing, as on a cloud machine that was reclaimed, the gate rebuilds the
  round count from the `usage: review` lines of the in-progress run record on this branch and
  holds completion until a review is recorded; with no such record, the gate is open.
- `.stamity/context-once/`, where Cursor's hook keeps one empty marker per conversation on a
  Cursor agent machine, so the session index is printed once per conversation there.

A line your `.gitignore` already covers, with `.stamity/` or `.env*` for example, is not added
twice. A file you committed before the line existed stays tracked: setup never touches the git index.

Because everything else is committed, a second checkout of this repository arrives with the
whole setup in place and only those files missing. Placing `.env.mcp` is exactly what
`stamity worktree setup` does when it creates one. It refuses a row that names the review gate's
state, and a `copy` row over a parent such as `.stamity` leaves those files behind, so a review
round counted in one worktree does not gate another. A `symlink` row over that parent is the
exception: the link shares the directory live, state included, and setup cannot split it.

## Keeping your setup current

```sh
npx -y @zomarit/stamity@<version> sync
```

`sync` regenerates every managed file from the bundled content of whichever version ran it, so
running it at a newer version is how you take an engine update. Name the exact version you are
moving to; when a newer release exists, the update notice prints this command with it filled in.
Staying on the version you have needs nothing — the setup keeps the version it was generated
with until you run a newer one. Your own edits outside a managed block survive;
the block itself is rewritten. Run `check` afterwards to confirm the tree is clean.

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
| verb | one of the nine names you type after `stamity`: `init`, `sync`, `check`, `validate`, `add`, `config`, `workspace`, `worktree`, `clean`. |
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
