---
title: Workspaces
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.9.0 release cut (2026-09-21). -->
<!-- Re-open when: a workspace subcommand joins or leaves, the three member-manifest fields the
     cascade patches change, selection deltas or locked content start changing emitted files, or an
     ordinary verb starts reading `workspace.json`. `test/docsPages.test.ts` holds this page to the
     hand-page contract; `src/cli/commands/workspace.ts` and `src/workspace/` are what it describes. -->

# Workspaces

This page is for you if you run stamity in more than one repository and want one policy for all of
them. It answers what a workspace is, how to create one, and what reaches each repository when you
push that policy down.

A workspace is a `workspace.json` file in the directory that holds your repositories. The
repositories under it are its **members**. One verb reads that file and acts on it, and it takes
three subcommands: `workspace status` reports, `workspace init` creates, and `workspace sync` pushes
the policy down into every member.

## Set up a workspace

Run all three in the directory that holds your repositories.

```bash
stamity workspace init
stamity workspace status
stamity workspace sync
```

`stamity workspace init` scans for repositories, asks which ones join, and writes `workspace.json`:

```
workspace /home/you/projects/workspace.json
  registered 3 members
  + api
  + docs-site
  + web
  tools: claude
run stamity workspace sync to apply this policy to every member
```

`stamity workspace status` then reports every member and what it resolves to:

```
workspace /home/you/projects
  root: no .stamity/manifest.json of its own — informative; the root is never a cascade target
  ok            api        tools: claude
  unconfigured  docs-site  tools: claude
  unconfigured  web        tools: claude
run stamity workspace sync to apply this policy to every member
```

And `stamity workspace sync` writes the policy into each member and regenerates its files:

```
workspace /home/you/projects
  resolved root, 3 members declared
  synced   api        manifest already matched
  failed   docs-site  [VALIDATION_ERROR] Workspace member "docs-site" has no setup manifest at …
  failed   web        [VALIDATION_ERROR] Workspace member "web" has no setup manifest at …
  3 members: 1 synced, 2 failed — partial
run stamity workspace status to see what each member now declares
```

Every member needs its own setup before the cascade can reach it. Run `stamity init` inside a member
to give it one, or drop the entry from `repos[]`.

Nothing here is ambient. A member stays an ordinary setup with its own `.stamity/manifest.json` and
its own `stamity sync`. The cascade writes the workspace's decisions **into** those member
manifests. That is what keeps a member correct when somebody syncs it on its own, which is the most
likely next thing to happen to it.

## What does the manifest declare?

| Field | What it is |
|---|---|
| `version` | the schema generation, as a semantic version. `1.0.0` today |
| `defaults` | the baseline every member inherits. `defaults.tools` is required. `selection`, `maturityTier` and `mcp` are optional |
| `groups` | named deltas between the defaults and a member's own overrides. A group adds content ids, removes them, or replaces the tool list outright. Declaration order is merge order |
| `repos` | the members. Each entry is a path relative to the workspace root. Zero members is valid, because a workspace is assembled before it is filled |
| `lockedContent` | content ids no member may drop |

Only `version`, `defaults` and `repos` are written for you. `stamity workspace init` writes exactly
those three keys. Groups, locks and per-member overrides are yours to author by hand afterwards.

Two rules about `defaults.tools` are worth knowing. A manifest that omits the field is refused when
the file is read. A manifest that declares an empty list is read fine, but then fails every member
that no group or override hands a tool list of its own. A member's own schema demands at least one
tool, so nothing propagates to those members and the cascade exits 1.

Member paths are checked when the file is read. An absolute path, any `..` segment, and a NUL byte
are all refused by shape. So are two entries that spell the same directory two ways, such as `api`
and `./api`, because two entries syncing one directory would race every write.

`stamity validate` reads `workspace.json` too and reports its field defects. It reads the file in
the directory you run it in, and it does so whether or not that directory is an initialised
repository itself.

## How does stamity decide what one member gets?

Resolution runs in layers, for one member at a time:

1. Start from `defaults`.
2. Apply the deltas of every group that member names, in the manifest's declaration order.
3. Apply that member's own `overrides`.

A layer that declares a tool list replaces the list from the layer before it. Inside one layer,
removals run before additions, so an id named in both stays selected.

`lockedContent` outranks all three layers. A `removeItems` entry naming a locked id is discarded
rather than honoured, at whichever layer asked for it. A lock only defends what is already selected.
It cannot add an id no layer ever selected, and removing an id that was never selected is a silent
no-op that does not count as the lock doing work.

Resolution touches no filesystem. A member that is registered here but missing from disk resolves
like any other. Noticing that the directory is gone is the job of `workspace status` and
`workspace sync`.

## Let `stamity init` offer you a workspace

`stamity init` can create a workspace for you, and it probes once on every run to decide whether to
offer. It classifies the current directory. If the directory is neither a workspace root nor already
inside one, it scans for sibling repositories. Two or more arms the offer. Anything else arms
nothing, and the run is exactly what it was before.

On a terminal the armed offer is one confirm, asked last, defaulting to **no**. Creating a
`workspace.json` at the root of your projects directory declares an intent about repositories you
did not name. A yes opens the same preselected member list `stamity workspace init` uses. The file
is written only after the setup itself succeeded, so a failed init never leaves a workspace with an
uninitialised root behind it.

Off a terminal, nothing is created. That covers `-y`, `--json`, and piped stdin. One line prints
instead, on every such run. It names the candidate count, the first three candidate paths, and
`stamity workspace init` as the way to create one. More than three candidates are summarised as
`… and N more`. That line rides init's notes list, so it prints ahead of the panel on a live run and
inside the `--dry-run` report alike. A `--json` run also carries the candidate paths and
`workspaceCreated: false` under `decisions`.

Three edges are worth knowing:

- **An already-initialised repository suppresses the offer.** Without `--force` the setup would
  refuse anyway, so the probe never runs and there is no answer to discard. Adding `--force` is what
  makes the setup proceed, and it re-arms the offer with it.
- **Clearing every box is an answer.** Nothing is written, one line says so, and the run is not a
  failure.
- **`stamity init --dry-run` previews an answered offer.** It composes the manifest and reports it
  in the future tense without writing it.

## Create one yourself with `workspace init`

Run `stamity workspace init` in the directory that holds the repositories. Five conditions decide
what happens next. Three of them are refusals, and `--force` lifts two of those three.

| Condition | What happens |
|---|---|
| a `workspace.json` is already here | refused, naming the path. `--force` overwrites it |
| this directory is already inside an outer workspace | refused, naming the outer root and its manifest. `--force` nests a second workspace here, and the nearest manifest then wins for the directories below it |
| no repositories found | refused, naming the scan depth and the two markers a candidate carries. `--force` does **not** lift this one, because there is no recoverable fact to override |
| exactly one candidate | proceeds. One member is a workspace with room to grow |
| no terminal (`-y`, `--json`, piped stdin) | proceeds, takes every candidate, and prints the member list in full |

A candidate is a directory carrying a `.git` entry or a `.stamity/manifest.json` of its own. The
scan descends four levels, stops at the first repository on a branch, and never enters
`node_modules` or a dot-directory.

`defaults.tools` is derived rather than asked. It is the union of the selected members' own tool
lists, in the canonical tool order, falling back to `claude` when none of them declares one. The
union is deliberate: `defaults` is a baseline each member may narrow, and an intersection would drop
a client one member was already targeting.

A member whose manifest exists but does not read cleanly contributes nothing to that union. It does
not fail the creation, on the offer and on the verb alike. The tool list is a starting baseline you
can edit the moment it is written. Refusing instead would mean no workspace can be created until a
repository it does not yet manage is repaired. `stamity validate` is the surface that reports that
member.

Two flags are easy to confuse here:

- `stamity workspace init --tools <csv>` overrides the derivation outright. The offer inside
  `stamity init` takes no tools input of its own and always derives.
- `stamity init --tools <csv>` sets *this* repository's own tools. It says nothing to the workspace
  being offered.

## What does `workspace status` tell you?

Bare `stamity workspace` is `stamity workspace status`, on a terminal and on a pipe alike. There is
no key registry here for a picker to navigate, so both produce the same lines in the same order.
Colour escapes are added on a terminal that paints and omitted on a pipe.

`status` reports the nearest `workspace.json` at or above the current directory. Running it inside
`apps/web` reports the workspace that actually governs `apps/web`. The walk climbs at most ten
ancestors, and stops at the filesystem root if that comes first.

The report is two root lines, one row per declared member in declaration order, one journal line per
member still in flight, and a closing hint naming `stamity workspace sync`. A workspace with no
members prints one line saying so instead of the rows.

Each member row carries one of five states:

| Row state | What it means |
|---|---|
| `ok` | present, inside the root, and carrying its own `.stamity/manifest.json` |
| `unconfigured` | present and contained, but no member manifest. `sync` fails this row until `stamity init` runs there |
| `absent` | nothing at that path, or it is not a directory |
| `escaped` | it resolves outside the workspace root through a link. A containment question that cannot be answered reads the same way, because an unanswerable question is not a yes |
| `unresolved` | resolution refused the entry, because of an undefined group name, say. It wins the row and carries the resolver's own message, because a refused resolution has no tools, groups or locks to print |

Every row but `unresolved` also carries what that member resolves to. That is its tool list, the
group names it declares, and any locked id whose removal the lock refused. The group and lock parts
are omitted when there are none.

The **two root lines** are the workspace path, then whether the root carries a setup manifest of its
own. The second is marked informative, because the root is never a cascade target. The scan starts
at the root's children, and a member path spelled `"."` or `""` is refused by shape.

A **journal line** prints for every member whose last line in the crash trail is a `started` with no
`finished` or `skipped` line after it. That is per-member liveness, not per-run. A member's own most
recent line decides it, so a run that died mid-flight and a later run that finished the same member
cleanly leave no line behind. Only a genuinely unterminated member still prints. Several members can
be live at once, so several lines can print at once. The trail is read from a bounded 64 KiB tail
rather than the whole file. An absent journal and an unreadable one both print nothing, and a window
beginning mid-line drops its leading partial record and reads the rest.

`status` exits 0 whenever it could read the manifest, whatever the rows say. It is a report, not a
gate. Two gates exist already: `stamity validate` on the manifest's field defects, and
`stamity workspace sync` on a member that would not propagate. A defect that the *read* itself
refuses, such as two spellings of one directory, surfaces as that read's own failure at exit 1.

## What does `workspace sync` do to a member?

`stamity workspace sync` resolves its root the same way `status` does, through the same ancestor
walk. Running it inside a member directory therefore syncs the workspace that governs that member.
Before the cascade writes a single byte it prints two lines: the resolved root, then how many
members it declares. This is the one subcommand that writes into the members, so it names the root
it resolved ahead of the writes rather than only in the summary afterwards.

Two `repos[]` entries that resolve to the same real directory through a symbolic link are refused
before any member is touched. The spellings differ, so the read-time duplicate check passes them,
and both stay inside the root, so containment passes them too. Cascading both would race that one
directory's manifest write.

The cascade itself runs members in parallel, at the machine's core count, capped at eight. Rows come
back in manifest order whatever order they finished in. One member's failure is one row: it never
stops the others, and it never quietly passes either. Per member, in order:

1. **Read** that member's `.stamity/manifest.json`. No manifest fails the row by name, telling you
   to run `stamity init` there or drop the entry from `repos[]`. A manifest that exists and does not
   parse fails the row with the reader's own message.
2. **Compute the patch** over three fields: `tools`, `maturityTier` and `mcp`. A field the workspace
   does not declare is left exactly as the member has it, so a member carrying `scaleup` under a
   workspace declaring no tier keeps it. `mcp` patches as a whole block rather than field by field.
   A workspace that declares `mcp` replaces the member's entire block, its server list and its
   `protocolVersion` together. A patch that changes nothing writes nothing.
3. **Write it back** into the manifest read in step 1, validated before it persists and written
   atomically. Patching the document from disk rather than composing a fresh one is what keeps the
   member's ledger, import choice and creation stamp intact.
4. **Plan and apply** that member's own sync. That is the same path plain `stamity sync` runs inside
   it.
5. A member whose apply refused a colliding path fails its row naming the refusals. Everything else
   in that member's plan is already on disk. `stamity workspace sync --force` clears exactly the
   collision class plain `sync --force` clears, which is content the engine cannot prove it wrote at
   a name it wants. It overwrites that content behind a verified `.bak` in the member's own
   directory, per member.

Each row ends as `synced`, `failed` or `skipped`, and the tally under them names the counts and the
run's verdict. A `skipped` row was never attempted and counts toward neither side of the verdict.

Every cascade is a full re-run. No member is skipped for having succeeded before, or because the
journal says so. The idempotence a resume would buy is already bought one layer down, where a member
that is current reports every path unchanged. The run exits 0 when every member synced, and 1 on a
partial or failed one. A green run for a cascade that reached half its members would be worse than
useless in CI.

## Which settings does the cascade not propagate yet?

Selection deltas and locked content are resolved and reported, and they do not yet change an emitted
file. Each member's row names any locked id whose removal the lock refused.

The reason sits one layer down. A member's own sync refreshes its manifest selection from the full
corpus on every run, so a written selection would be overwritten before anything read it. And
`lockedContent`'s only job is to refuse removals against that same selection.

A workspace that declares a lock, a baseline selection, or a group add or remove gets one line under
the tally saying exactly this. A delta written only into a member's own `overrides` earns that line
only when a lock refused one of its removals.

## Preview a run before it writes

`--dry-run` covers all three subcommands and writes nothing anywhere.

- `stamity workspace init --dry-run` scans, asks, and prints the manifest it would write in full.
- `stamity workspace status --dry-run` is `status`. The flag is inert on a read.
- `stamity workspace sync --dry-run` names the patch it would apply per member. It writes no member
  manifest and no emitted file, and it disables the journal for that run. A preview appending a
  `started` line would manufacture the crash signal the journal exists to carry.

A sync preview reports the plan computed from the unpatched manifest, the one each member has today.
It does not invent a plan for a manifest that does not exist yet.

`--force` is read by `workspace init` and `workspace sync` only, with the two meanings described
above. `--tools` is read by `workspace init` only. Both are registered on the whole verb, so they
appear in `--help` everywhere and are inert wherever the subcommand does not read them.

## Read the output as JSON

`--json` emits exactly one document per run, and it makes that run non-interactive. So
`stamity workspace init --json` takes every candidate and discloses the list. Every document carries
the `ok`, `command` and `version` keys every stamity verb shares, plus the subcommand's own
fields:

| Subcommand | What the document adds |
|---|---|
| `workspace status` | `root`, `members` with each row's `state`, and `journal` — an array, empty when no member is in flight |
| `workspace init` | `path`, `created`, `dryRun`, `members`, the resolved `defaults`, and `manifest` in full |
| `workspace sync` | `root`, `dryRun`, `outcome`, `counts`, `repos[]` with each row's `state` and error, and `journalWarnings`. Rows the cascade reached also carry `patched` and `lockedApplied` |

Exit statuses are 0, 1 and 2 only. The failure class travels as `error.code` rather than in the
number. See the [CLI reference](cli-reference.md) for what each status and code means.

## Where does the state live?

| Path | What it is |
|---|---|
| `workspace.json` at the root | the policy. Yours to edit by hand. Only `workspace init` and an accepted offer inside `stamity init` write it |
| `<root>/.stamity/workspace-sync-journal.jsonl` | the crash trail, two lines appended per attempted member per run. Nothing reads it back to decide anything, so deleting it is always safe. Nothing rotates it either |
| `<member>/.stamity/manifest.json` | the member's own record, and the propagated policy once a cascade has run. The cascade patches three fields there, plus the `updatedAt` stamp every manifest write sets. It keeps the ledger, import choice and creation stamp. The member's own sync, step 4 of the cascade, then refreshes selection, detection and version stamps exactly as plain `stamity sync` does |

## What do the other verbs know about a workspace?

Almost nothing, and that is deliberate. `stamity sync` reads nothing workspace-related at all.
`stamity init` inside a member differs only in that its workspace offer never arms there. What
either one emits is exactly what it emits anywhere else.

Nothing is lost by that. The member's manifest already **is** the propagated policy, so a plain sync
inside it emits what the workspace decided.

`stamity validate` is the one exception. It reads `workspace.json` in the directory you run it in
and reports its field defects.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [CLI reference](cli-reference.md) — every verb, argument, flag and exit status.
- [Configuration reference](configuration.md) — the member-manifest keys the cascade writes into.
- [Troubleshooting](troubleshooting.md) — what `check` prints, and what each row means.
