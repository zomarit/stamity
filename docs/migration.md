---
slug: /migration-from-hatch3r
---
<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-26). -->
<!-- Re-open when: the predecessor's own `clean` semantics change, or what `src/migration/`
     detects, carries or strips changes. `test/docsPages.test.ts` holds this page to the
     hand-page contract; `src/migration/detect.ts` and `src/migration/carry.ts` are the code
     this page describes, and `test/migration/` is what proves it. -->

# Migrating from hatch3r

stamity is the successor to hatch3r. This page is the honest floor: what moves, what does
not, and why. Nothing here is automatic beyond what is described — where a transfer could
guess wrong, it reports instead.

This page is the only one in this repository that spells the predecessor's name. Every
other file goes through the detection module's own record, so the name never spreads.
That is also why the FILE is `docs/migration.md` while the PUBLISHED page is
`/docs/migration-from-hatch3r` — the `slug` above. A migrant searches for the old name,
so the URL has to carry it; the filename cannot, because every page that linked this one
would then carry it too, and `scripts/leak-gate.mjs` holds the name to an allowlist of
literal paths that it scans itself under the same rules.

## Who this is for

You have a repository that hatch3r set up. On disk that means a `.hatch3r/` state
directory, or managed blocks marked `HATCH3R:BEGIN` / `HATCH3R:END` inside your tool
instruction files, or both. In a monorepo it can mean both in every workspace package.

If you have neither, you do not need this page — read [getting started](getting-started.md).

## Path A — guided (recommended)

Run init **in the repository as it is**, without cleaning anything first. This is the path
that carries the most across, and the only one that still has hatch3r's manifest to read:

```sh
npx @zomarit/stamity init
```

Init scans for the predecessor before it writes anything. It looks for `.hatch3r/` at the
repository root and in every workspace package, and it reads your tool instruction files —
`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` and the `.md` and
`.mdc` files directly under `.cursor/rules/` — for whole-line managed-block markers in any
of the three comment syntaxes hatch3r emitted, with or without a version stamp on the
`BEGIN` line. That directory is read one level deep and by those two extensions only;
whatever else you keep there is never opened.

Finding either one turns the ordinary existing-config question into the migration
question, and answering it "migrate" does three things in one pass:

1. **Reads `hatch.json` as defaults.** Target tools, maturity tier, communication style
   and MCP server ids become the *offered* defaults for this init — never a manifest that
   is adopted wholesale. Each field is read independently and tolerantly: a manifest that
   cannot be parsed costs you the old defaults, not the migration. A field that does not
   map is dropped rather than guessed, and detection fills the gap.
2. **Carries learnings and `.env.mcp`.** Learnings are re-persisted through stamity's own
   store, so each one is re-validated, re-sanitized and re-stamped on the way in rather
   than trusted. `.env.mcp` stays exactly where it is — its bytes are never rewritten — and
   is added to `.gitignore`. One thing about it does change: if it carries any group or
   other permission bit, the carry tightens the mode to owner-only, because the file holds
   live tokens. On Windows, where there is no POSIX mode to set, that pass is skipped
   rather than reported as a tightening it did not perform.
3. **Strips the old managed blocks.** The parser works on character offsets of the
   original file, so every byte outside a matched block comes back identical — line
   endings, trailing whitespace, the blank lines around the block. A pair it cannot
   resolve leaves that file untouched rather than guessing where the block ended.

Nothing is destroyed that held anything else: a file that was *only* a managed block is
removed, a file that had your own content around one keeps that content.

`--dry-run` plans the whole thing and writes nothing at all — no file, no directory, no
`.gitignore` line — and prints the same counts a real run would produce. Use it first if
you want to see the numbers before you agree to them.

## Path B — clean slate (alternative)

Take Path A unless you have a reason not to. Path B — uninstalling hatch3r first, then
setting stamity up in the emptied repository — still works and still migrates, but it
costs you something Path A keeps. The cost is named below; decide with it in front of you.

If you would rather take hatch3r out yourself first, use its own uninstall verb. The
predecessor's README states it as:

```sh
npx hatch3r clean
```

Then set stamity up in the cleaned repository:

```sh
npx @zomarit/stamity init
```

**What a plain `clean` removes.** hatch3r's adapter outputs **and its manifest**,
`.hatch3r/hatch.json`. It **keeps** the rest of `.hatch3r/` — learnings, handoffs,
overrides, snapshots, customizations — along with `.env.mcp`. Add `--dry-run` to preview,
`--yes` to skip its prompt.

How it decides which files are "its adapter outputs" matters, because it is not by name. It
walks whole directories — `.claude/`, `.cursor/`, and `.github/instructions/`,
`.github/agents/`, `.github/prompts/`, `.github/skills/`, `.github/checks/` — for each tool
its manifest records, or for all three when the manifest is already gone, and it adds the
individual files `CLAUDE.md`, `.mcp.json`, `.vscode/mcp.json`,
`.github/copilot-instructions.md` and `.github/workflows/copilot-setup-steps.yml`. A file it
finds there is trimmed back to your text when it carries a `HATCH3R` block with your own
content around it, and **deleted outright** when it does not. So a file of your own that
happens to live in one of those directories and never carried a block goes with the sweep.
`--dry-run` prints the exact list under "Would remove": read it before you agree to it, and
move anything of yours out of the way first.

**What Path B therefore costs you: the config defaults.** Detection needs the state
directory, and a plain `clean` leaves it standing: init still finds `.hatch3r/`, so it still
reports a predecessor and still offers the migration. What is gone is the file inside it that
the first of the three carry steps opens. With no `hatch.json` left to read, the defaults read
comes back empty, so init
offers you no old values for target tools, maturity tier, communication style or MCP server
ids — the "Config choices" row of the table below — and each of those comes from detection
and from your answers instead. Nothing flags the difference at the time; init reports "a
predecessor setup" either way.

The other two carry surfaces never went through the manifest, so they still work: learnings
are read out of `.hatch3r/learnings/` and `.env.mcp` off the repository root, and neither
lookup asks the manifest anything. The third has nothing left to do — hatch3r's own `clean`
already stripped its blocks, so what survives around them is what its strip wrote, which is
its own trim of your text rather than the byte-for-byte span this engine's parser leaves.

That cost is recoverable by hand, as long as you take the values before you take the
manifest. Read them out of `.hatch3r/hatch.json` **first**: two go straight back on the
init line as `--tools <csv>` and `--maturity <tier>`, and the other two are
`config set communicationStyle <value>` and `config mcp add <id>` afterwards, followed by
`sync`, because `config` edits state and never regenerates output.

**Do not run `hatch3r clean --purge` before migrating.** `--purge` deletes `.hatch3r/` and
`.env.mcp` on top of the standard clean. That destroys the learnings the carry would have
brought across and the MCP credentials it would have kept, and it is irreversible —
`.hatch3r/snapshots/` goes with the directory, so the pre-clean rollback point is gone
too. There is no undo and no re-import.

So a plain `clean` costs you the defaults transfer, plus whatever unmarked file of yours the
sweep above happens to reach. If answering the tools and maturity questions again is cheaper
than reading a manifest first, and the `--dry-run` list names nothing you want to keep, Path B
is fine. If either half of that is not true, take Path A.

## What transfers and what starts fresh

| Transfers | How |
|---|---|
| Learnings | re-persisted through stamity's store, so each one passes the current write gates on the way in |
| `.env.mcp` | left in place, bytes unchanged, mode tightened to owner-only where it was loose, and gitignored |
| Config choices | read out of `hatch.json` as *defaults offered at init* — **Path A only**: a plain `clean` removes that manifest |
| Your own content | anything outside a managed block survives the strip byte for byte |

| Starts fresh | Why |
|---|---|
| The manifest | a stamity manifest records a stamity setup; there is nothing to translate |
| Snapshots and telemetry | re-derived, and a stale snapshot describes a tree that no longer exists |
| Pack receipts | a receipt records a trust decision this engine never made — packs are re-verified by re-installing them |
| Every adapter output | regenerated from the corpus; carrying one would import a stale render |

Not every learning necessarily arrives. Two classes are skipped by name — hatch3r's own
seeded `README.md` and `INDEX.md` in its learnings directory, which are its scaffolding
rather than your notes — and anything the store refuses on schema, size, the injection
screen or a name collision is skipped too. Carried plus skipped accounts for the whole
directory, and both numbers are printed, so nothing disappears without a count behind it.

## Overrides are reported, never mapped

If you customized individual artifacts under `.hatch3r/overrides/`, init tells you the
directory is there and then leaves it alone.

This is deliberate. The two projects do not share an artifact id set, so an automatic
remap would silently point your customization at the wrong artifact — and a
customization aimed at the wrong target is worse than one that was never carried,
because it looks like it worked.

Salvage them as your own content instead: open each override, decide whether what it says
is still what you want, and re-express it as user content in the new setup — text outside
a managed block in the relevant file, or your own rule or skill. Then delete the old
override.

## Automation skips the migration

A non-interactive run — piped stdin, `-y`, or `--json` — defaults the migration to
**skip**, not to migrate. The migration is the one step where "take the default" and
"take the prompt's default" deliberately disagree: the prompt defaults to migrating,
which strips files, and no CI job should consent to that on your behalf.

To migrate from a script, say so explicitly:

```sh
npx @zomarit/stamity init --migrate full -y
```

Either way the run prints a line saying which mode it took and naming the predecessor's
own directory, so a machine run that just stripped blocks never does it silently.

## Your last step

A finished migration leaves hatch3r on disk and still live. Init carries learnings and
credentials and strips the old managed blocks; it removes nothing else — and the agents,
slash commands, rules and CI workflows hatch3r emitted never carried a block, so nothing in
the strip ever saw them. The panel init prints at the end says exactly that, names the
predecessor paths it can see, and hands the removal back to you: it is hatch3r's own
uninstall, run by you. The order is one-way.

1. **Migrate, then look at what came across.** `npx @zomarit/stamity check`, the learnings
   that landed in `.stamity/learnings/`, and any overrides worth salvaging.
2. **Copy `.env.mcp` somewhere outside the repository.** The carry adopted hatch3r's file
   where it stood — no second copy was made — so that file is now this setup's live
   credential file. A plain `clean` keeps it and `--purge` deletes it, which is why the
   back-up belongs before the uninstall rather than after it.
3. **Run hatch3r's own uninstall, without `--purge`:**

   ```sh
   npx hatch3r clean
   ```

   It removes hatch3r's adapter outputs and its manifest, `.hatch3r/hatch.json`, and keeps
   the rest of `.hatch3r/`. What it does **not** remove is anything this engine already
   handled: the old managed blocks are gone from your instruction files, stripped at init,
   and the learnings and credentials it carried are now this setup's. Its live run ends by
   offering to reinitialize hatch3r, with **yes** as the default — answer no. Each workspace
   package holding its own state is a separate scope and needs its own run.
4. **Re-run `npx @zomarit/stamity check`,** and `sync` if it reports files missing.
5. **Remove `.hatch3r/` yourself.** stamity never deletes it: it is not this engine's
   directory, it may hold overrides you still want to read, and a migration that deleted the
   source before you had checked the result would leave you nothing to compare against.

**Step 3 is an eyes-open step, because that sweep reaches this setup too.** hatch3r finds its
outputs by directory rather than by name, and this engine writes into the same directories at
the same paths: a Claude-tool migration puts its rules, agents, commands and skills under
`.claude/` and its bridge block in `CLAUDE.md`, and every one of those files sits inside the
walk described under Path B. They carry `STAMITY:BEGIN` / `STAMITY:END` markers, which
hatch3r's block detector does not recognize, so it reads them as unmarked and deletes them.
Run `npx hatch3r clean --dry-run` first and read the "Would remove" list against that. What
comes back afterwards is every generated file — `check` lists each one as `missing` by path
and `sync` writes it back from the corpus. What does not come back is your own prose outside
a managed block, such as the text you keep in `CLAUDE.md` above this setup's block: it is in
no ownership ledger and no corpus, so nothing can regenerate it. Move that out of the tree
first, or skip the sweep and remove the leftovers by hand with `git rm`.

One file on that list is worth losing on purpose. If hatch3r's `.claude/settings.json` was
already there at init, this engine refused to claim it — the file is in no ownership ledger
and carries no markers, so init left it untouched and said so in a warning — which means
hatch3r's hooks are still the ones wired up. Removing that file and running `sync` is what
installs this setup's.

In a monorepo, check each workspace package. Init reports every package that carried its
own state directory, but the carry reads one state directory — the root's. Packages
beyond it are named for you rather than migrated behind your back, so handle those
yourself before you delete anything.
