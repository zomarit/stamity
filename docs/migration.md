---
slug: /migration-from-hatch3r
title: Migrating from hatch3r
---
<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.9.0 release cut (2026-09-21). -->
<!-- Re-open when: hatch3r's own `clean` semantics change, or when what `src/migration/` detects, carries or
     strips changes (`src/migration/detect.ts` and `src/migration/carry.ts` are the code this page describes).
     `test/docsPages.test.ts` holds this page to the hand-page contract, pins two claims no other check can reach —
     Path B names the manifest a plain clean deletes, the last step names `.env.mcp` before the uninstall — and needs
     one hand page stamped at the release cut for its `RELEASE_CUT_DATE` pin: this is that page, so the stamp's release-cut form is load-bearing and moves only at a cut. -->

# Migrating from hatch3r

This page is for you if hatch3r set up your repository and you want to move it to stamity.
By the end, stamity is running, your learnings and MCP credentials have come across, and you
have removed hatch3r yourself.

Start in the repository as it is, without cleaning anything up first:

```sh
npx @zomarit/stamity init
```

Init finds hatch3r before it writes anything, and asks what to do about it. Answer `full` and
the run prints its decision, then reports what moved:

```text
migrate: full — .hatch3r is being carried over
  migrated: 7 learning(s) carried (1 skipped), 3 file(s) stripped of old managed blocks, 1 file(s) deleted, .env.mcp carried
```

The rest of this page explains those counts, names what does not transfer, and ends with the
one step stamity leaves to you.

## Do you need this page?

You need it if hatch3r left either of these in your repository:

- a `.hatch3r/` state directory;
- managed blocks marked `HATCH3R:BEGIN` and `HATCH3R:END` inside your tool instruction files.

In a monorepo it can be both, in every workspace package. If you have neither, you do not need
this page. Read [getting started](getting-started.md) instead.

## Path A — migrate in place (recommended)

Run init in the repository as it is. This path carries the most across. It is also the only
one that still has hatch3r's manifest to read.

```sh
npx @zomarit/stamity init
```

### What init looks for

Init scans for hatch3r before it writes anything. It looks for `.hatch3r/` at the repository
root and in every workspace package. It also reads your tool instruction files:

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
- `.github/copilot-instructions.md`
- the `.md` and `.mdc` files directly under `.cursor/rules/`

In those files it looks for whole-line managed-block markers. All three comment syntaxes
hatch3r emitted count. A version stamp on the `BEGIN` line is optional and changes nothing.
The `.cursor/rules/` directory is read one level deep, and by those two extensions only.
Whatever else you keep there is never opened.

Finding a state directory or a marked file turns the ordinary existing-config question into
the migration question.

### What answering `full` does

Answering `full` does three things in one pass.

**1. It reads `hatch.json` as defaults.** Target tools, maturity tier, communication style and
MCP server ids become the defaults this init offers you. They are offered, never adopted
wholesale. Each field is read on its own, and tolerantly. A manifest that cannot be parsed
costs you the old defaults, not the migration. A field that does not map is dropped rather
than guessed, and detection fills the gap.

**2. It carries learnings and `.env.mcp`.** Learnings are re-persisted through stamity's own
store. Each one is re-validated, re-sanitized and re-stamped on the way in, rather than
trusted. `.env.mcp` stays exactly where it is, and its bytes are not rewritten. The carry adds
it to `.gitignore`, unless a rule already in that file covers it. One thing about the file does
change. If it carries any group or other permission bit, the carry tightens the mode to
owner-only, because the file holds live tokens. Windows has no POSIX mode to set, so that pass
is skipped there rather than reported as a tightening it did not perform.

**3. It strips the old managed blocks.** The parser works on character offsets of the original
file. Every byte outside a matched block comes back identical: line endings, trailing
whitespace, and the blank lines around the block. A pair it cannot resolve leaves that file
untouched rather than guessing where the block ended.

Nothing is destroyed that held anything else. A file that was *only* a managed block is
removed. A file that had your own content around one keeps that content.

### Seeing the numbers before you agree to them

Add `--dry-run` to plan the whole thing and write nothing at all. No file, no directory and no
`.gitignore` line is written:

```sh
npx @zomarit/stamity init --dry-run
```

It prints the same counts a real run would produce.

## Path B — uninstall hatch3r first

Take Path A unless you have a reason not to. Path B still works and still migrates. It costs
you something Path A keeps, and the cost is named below. Decide with it in front of you.

To take hatch3r out yourself first, use its own uninstall verb. hatch3r's README states it as:

```sh
npx hatch3r clean
```

Then set stamity up in the cleaned repository:

```sh
npx @zomarit/stamity init
```

### What a plain clean removes

A plain clean removes hatch3r's adapter outputs and its manifest, `.hatch3r/hatch.json`. It
also removes three more of its own outputs: `.worktreeinclude`, the `.hatch3r-archive/`
directory, and any `.bak` file it left beside a file it sweeps.

It keeps the rest of `.hatch3r/`: learnings, handoffs, overrides, snapshots and customizations.
It keeps `.env.mcp` too. Add `--dry-run` to preview the sweep, and `--yes` to skip its prompt.

How it decides which files are its adapter outputs matters, because it is not by name. It walks
whole directories, for each tool its manifest records, or for all three tools when the manifest
is already gone:

- `.claude/`
- `.cursor/`
- `.github/instructions/`, `.github/agents/`, `.github/prompts/`, `.github/skills/` and
  `.github/checks/`

It adds five individual files to that sweep: `CLAUDE.md`, `.mcp.json`, `.vscode/mcp.json`,
`.github/copilot-instructions.md` and `.github/workflows/copilot-setup-steps.yml`.

A file it finds there is trimmed back to your text when it carries a `HATCH3R` block with your
own content around it. It is deleted outright when it does not. So a file of your own that
happens to live in one of those directories, and never carried a block, goes with the sweep.
Preview the sweep first and read the exact list it prints under "Would remove". Move anything
of yours out of the way before you agree to it.

### What Path B costs you: the config defaults

Detection fires on three kinds of evidence, any one of them alone. A state directory is enough.
A marked instruction file is enough. A workspace package holding its own state directory is
enough. A plain clean leaves the state directory standing, so init still finds `.hatch3r/`,
still reports a predecessor, and still offers the migration.

What is gone is the file inside it that the first carry step opens. With no `hatch.json` left
to read, the defaults read comes back empty. Init then offers you no old values for target
tools, maturity tier, communication style or MCP server ids. That is the "Config choices" row
of the table below. Each of those comes from detection and from your answers instead. Nothing
flags the difference at the time, because init reports "a predecessor setup" either way.

The other two carry surfaces never went through the manifest, so they still work. Learnings are
read out of `.hatch3r/learnings/`, and `.env.mcp` off the repository root. Neither lookup asks
the manifest anything.

The third step has nothing left to do. hatch3r's own clean already stripped its blocks. What
survives around them is what its strip wrote. That is its own trim of your text, rather than
the byte-for-byte span stamity's parser leaves.

### Recovering those defaults by hand

The cost is recoverable, as long as you take the values before you take the manifest. Read them
out of `.hatch3r/hatch.json` **first**. Two of them go straight back on the init line:

```sh
npx @zomarit/stamity init --tools <csv> --maturity <tier>
```

The other two are `config` calls afterwards:

```sh
npx @zomarit/stamity config set communicationStyle <value>
npx @zomarit/stamity config mcp add <id>
npx @zomarit/stamity sync
```

`sync` is on that list because the `config` verb edits state and never regenerates output.

### Never purge before you migrate

Do not run hatch3r's clean with `--purge` before migrating. That flag deletes `.hatch3r/` and
`.env.mcp` on top of the standard clean. It destroys the learnings the carry would have brought
across, and the MCP credentials it would have kept. It is irreversible. `.hatch3r/snapshots/`
goes with the directory, so the pre-clean rollback point is gone too. There is no undo and no
re-import.

So a plain clean costs you the defaults transfer. It also costs whatever unmarked file of yours
the sweep happens to reach. Path B is fine when two things are true. Answering the tools and
maturity questions again is cheaper for you than reading a manifest first. And the preview list
names nothing you want to keep. If either half is not true, take Path A.

## What transfers, and what starts fresh

| Transfers | How |
|---|---|
| Learnings | re-persisted through stamity's store, so each one passes the current write gates on the way in |
| `.env.mcp` | left in place, bytes unchanged, mode tightened to owner-only where it was loose, and gitignored |
| Config choices | read out of `hatch.json` as *defaults offered at init* — **Path A only**: a plain clean removes that manifest |
| Your own content | anything outside a managed block survives the strip byte for byte — **Path A only**: on Path B what survives is hatch3r's own trim of it |

| Starts fresh | Why |
|---|---|
| The manifest | a stamity manifest records a stamity setup; there is nothing to translate |
| Snapshots and telemetry | re-derived, and a stale snapshot describes a tree that no longer exists |
| Pack receipts | a receipt records a trust decision stamity never made; packs are re-verified by re-installing them |
| Every adapter output | regenerated from the corpus; carrying one would import a stale render |

### Why a learning might not arrive

Not every learning arrives. Some files are skipped before stamity's store is ever asked:

- hatch3r's own scaffolding in its learnings directory, `README.md` and `INDEX.md` — these are
  its generated files rather than your notes;
- any file whose frontmatter does not carry all five of hatch3r's learning head keys: `id`,
  `topic`, `applies-to`, `confidence` and `created`;
- any file that cannot be read;
- any name that reduces to an empty slug.

A head that is not valid YAML fails the second rule, so a stray note is not treated as a
learning at all. The store then skips more on its own terms: schema, size, the injection
screen, a name collision, and the learnings directory's own file cap.

Carried plus skipped accounts for the whole directory. The carried count is always printed, and
the skipped count sits beside it whenever it is not zero. Nothing disappears without a count
behind it.

## Why your overrides are reported, not converted

If you customized individual artifacts under `.hatch3r/overrides/`, init tells you the directory
is there and then leaves it alone.

This is deliberate. The two projects do not share an artifact id set. An automatic remap would
silently point your customization at the wrong artifact. A customization aimed at the wrong
target is worse than one that was never carried, because it looks like it worked.

Salvage them as your own content instead. Open each override and decide whether what it says is
still what you want. Re-express it as user content in the new setup. That means text outside a
managed block in the relevant file, or your own rule or skill. Then delete the old override.

## How to migrate from a script

A non-interactive run defaults the migration to **skip**, not to migrate. Piped stdin, `-y` and
`--json` are all non-interactive.

The migration is the one step where "take the default" and "take the prompt's default"
deliberately disagree. The prompt defaults to migrating, which strips files. No CI job should
consent to that on your behalf.

To migrate from a script, say so explicitly:

```sh
npx @zomarit/stamity init --migrate full -y
```

On a piped or `-y` run the line prints for both modes, and names hatch3r's own directory:

```text
migrate: full — .hatch3r is being carried over
migrate: skip — .hatch3r was left untouched (this run is not interactive, and a full migration deletes files, so it is never the unattended default). Migrate it later by re-running `stamity init --force --migrate full`.
```

So a machine run that just stripped blocks never does it silently.

A `--json` run prints no prose at all, because stdout there belongs to the single envelope.
That envelope records the mode in `decisions.migrate` and the detection in
`decisions.predecessorDetected`. No field of it names the directory. The two learning counts
ride in `carry.learningsCarried` and `carry.learningsSkipped`.

## Your last step — remove hatch3r yourself

A finished migration leaves hatch3r on disk and still live. Init carries learnings and
credentials, and strips the old managed blocks. It removes nothing else.

Nearly every file hatch3r emitted carries a `HATCH3R` block, and its JSON surfaces are the
exception. A block is not what spares any of them. What spares them is the strip's input list.
That list is the instruction surfaces named under Path A, and nothing else. hatch3r's
agents, skills, slash commands, hook scripts and CI workflow are never opened.

The one overlap is `.cursor/rules/`, which is on that list. A Cursor migration strips each of
hatch3r's rule files there down to its frontmatter. It counts each one among the stripped
files, and leaves the stub for the uninstall below.

The panel init prints at the end says the same. It names the hatch3r paths it can see, and it
hands the removal back to you. The removal is hatch3r's own uninstall, run by you. The order
below is one-way.

1. **Migrate, then look at what came across.** Run `npx @zomarit/stamity check`. Read the
   learnings that landed in `.stamity/learnings/`, and any overrides worth salvaging.
2. **Copy `.env.mcp` somewhere outside the repository.** The carry adopted hatch3r's file where
   it stood, and made no second copy. That file is now this setup's live credential file. A
   plain clean keeps it, and `--purge` deletes it. That is why the back-up belongs before the
   uninstall rather than after it.
3. **Run hatch3r's own uninstall, without `--purge`:**

   ```sh
   npx hatch3r clean
   ```

   It removes hatch3r's adapter outputs and its manifest, `.hatch3r/hatch.json`. It also takes
   its `.worktreeinclude`, its `.hatch3r-archive/` and any `.bak` beside a swept file. It keeps
   the rest of `.hatch3r/`.

   It does not remove anything stamity already handled. The old managed blocks are gone from
   your instruction files, stripped at init. The learnings and credentials it carried are now
   this setup's.

   Its run may end by offering to reinitialize hatch3r. Decline, and do not take that prompt's
   default without reading it. Each workspace package holding its own state is a separate
   scope, and needs its own run.
4. **Re-run `npx @zomarit/stamity check`.** Run `sync` if it reports files missing.
5. **Remove `.hatch3r/` yourself.** stamity never deletes it. It is not stamity's directory. It
   may hold overrides you still want to read. And a migration that deleted the source before
   you had checked the result would leave you nothing to compare against.

### Why step 3 is an eyes-open step

That sweep reaches stamity too. hatch3r finds its outputs by directory rather than by name, and
stamity writes into the same directories at the same paths. A Claude-tool migration puts its
rules, agents, commands and skills under `.claude/`, and its bridge block in `CLAUDE.md`. Every
one of those files sits inside the walk described under Path B.

The files under `.claude/` carry no markers at all. stamity records their ownership in the
manifest's ledger rather than in their bytes. The one marked file in that walk is `CLAUDE.md`,
and hatch3r's detector does not recognize its `STAMITY:BEGIN` / `STAMITY:END` block. Either way
the sweep sees no `HATCH3R` block and deletes them.

Preview the sweep first, and read the "Would remove" list against that:

```sh
npx hatch3r clean --dry-run
```

What comes back afterwards is every generated file. The `check` verb counts all of them and
lists the first 20 by path, then `… and N more`. The `sync` verb writes every one back from the
corpus.

What does not come back is your own prose outside a managed block. That is the text you keep in
`CLAUDE.md` below this setup's block, which init prepends above whatever the file already held.
It is also the same text in `.github/copilot-instructions.md`, if you migrated Copilot. Both
files are on the exact-file sweep list above. After the strip took the `HATCH3R` block out of
them, there is nothing left that hatch3r recognizes, so each is deleted whole. That prose is in
no ownership ledger and no corpus, so nothing can regenerate it.

Commit the repository before you run the sweep, so that prose is recoverable from git. Or move
it out of the tree. Or skip the sweep and remove the leftovers by hand with `git rm`.

### One file is worth losing on purpose

If hatch3r's `.claude/settings.json` was already there at init, stamity refused to claim it. The
file is in no ownership ledger and carries no markers. So init left it untouched, said so in a
warning, and named it on the panel's own list of what was left in place. That means hatch3r's
hooks are still the ones wired up. Remove that file and run `sync` to install this setup's.

### In a monorepo, handle each package

Init reports every workspace package that carried its own state directory. The strip reaches
every one of them. A package's own marked instruction files are stripped in the same pass: its
`CLAUDE.md`, its `AGENTS.md`, and its `.cursor/rules/`.

What the carry does not read is a package's own state directory. Learnings, manifest and
overrides come from the root's `.hatch3r/` only. Those packages are named for you rather than
carried, so handle each one yourself before you delete anything.
