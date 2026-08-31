---
title: Workspaces
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit f5a451b. -->
<!-- Re-open when: a workspace subcommand joins or leaves, the bridge's three-field set changes,
     selection deltas or locked content start propagating into emission, or ordinary commands
     become workspace-aware. `test/docsPages.test.ts` holds this page to the hand-page contract;
     `src/cli/commands/workspace.ts` owns the verb and `src/workspace/` owns the engine under it. -->

# Workspaces

A workspace is one policy over several repositories sitting under one directory. It is a
`workspace.json` at that directory — the parent of the repositories, not a file inside any of
their `.stamity/` state directories — plus one verb that reads it: `stamity workspace status`
reports, `stamity workspace init` creates, `stamity workspace sync` pushes the policy down into
every member.

Nothing about it is ambient. A member stays an ordinary setup with its own
`.stamity/manifest.json` and its own `stamity sync`; what the cascade does is write the
workspace's decisions **into** those member manifests, so a member is still correct when somebody
syncs it alone — the most likely next thing to happen to it.

## What the manifest declares

| Field | What it is |
|---|---|
| `version` | schema generation, a semantic version. `1.0.0` today |
| `defaults` | the baseline every member inherits. `defaults.tools` is required — a workspace whose defaults target nothing generates nothing anywhere. `selection`, `maturityTier` and `mcp` are optional |
| `groups` | named deltas between the defaults and a member's own overrides: add content ids, remove them, or replace the tool list outright. Declaration order is merge order |
| `repos` | the members, each a path relative to the workspace root. Absolute paths and traversal are refused when the file is read; zero members is valid, since a workspace is assembled before it is filled |
| `lockedContent` | content ids no member may drop. Applied last, so a `removeItems` naming a locked id is discarded rather than honoured |

Resolution for one member runs defaults → matched group deltas in declaration order → that
member's own `overrides`, with locks applied over the top. It touches no filesystem, so a member
registered here and missing from disk resolves like any other; noticing the directory is gone
belongs to `status` and `sync`.

`workspace init` writes exactly three keys — `version`, `defaults` and `repos`. Groups, locks and
per-member overrides are hand-authored afterwards, and `stamity validate` reports their field
defects whether or not the workspace root is an initialised repository itself.

## Getting one

Two doors, and neither creates a workspace as a side effect.

**The offer inside `stamity init`.** Every init probes once: it classifies this directory, and if
it is neither a workspace root nor already inside one, it scans for sibling repositories. Two or
more arms the offer; anything else arms nothing and the run is exactly what it was before.

On a terminal the armed offer is one confirm, asked last, defaulting to **no** — creating a
`workspace.json` at the root of somebody's projects directory declares an intent about
repositories nobody named. A yes opens the same preselected member list the verb uses, and the
file is written only after the setup itself succeeded, so a failed init leaves no workspace with
an uninitialised root behind it.

Off a terminal — `-y`, `--json`, or piped stdin — nothing is created and one line prints instead,
on every such run: the candidate count, the first three candidate paths followed by `… and N
more` when there are more, and `stamity workspace init` as the way to create one. That line rides
init's notes list, so it lands in the panel and in the `--dry-run` report alike, and a `--json`
run also carries the candidate paths and `workspaceCreated: false` under `decisions`.

Three edges are worth knowing. On an **already-initialised** repository the offer is suppressed,
as every other init prompt is — the apply would refuse, so the answer would be discarded — and
`--force`, which is what makes that apply proceed, re-arms it. **Clearing every box is an
answer**: nothing is written, one line says so, and the run is not a failure. And `stamity init
--dry-run` on an answered offer composes the manifest and reports it in the future tense without
writing it, the way the rest of that command previews.

**The verb.** `stamity workspace init`, run in the directory that holds the repositories.

| Condition | What happens |
|---|---|
| a `workspace.json` is already here | refused, naming the path. `--force` overwrites it |
| this directory is already inside an outer workspace | refused, naming the outer root and its manifest. `--force` nests a second workspace here — the nearest manifest wins for the directories below it, which is how the engine models nesting |
| no repositories found | refused, naming the scan depth — four levels — and the two markers a candidate carries. `--force` does **not** lift this one: there is no recoverable fact to override |
| exactly one candidate | proceeds. One member is a workspace with room to grow |
| no terminal (`-y`, `--json`, piped) | proceeds, takes every candidate, and prints the member list in full |

A candidate is a directory carrying a `.git` entry or a `.stamity/manifest.json` of its own; the
scan stops at the first repository on a branch and never enters `node_modules` or a dot-directory.

`defaults.tools` is derived rather than asked: the union of the selected members' own tool lists,
in the canonical tool order, falling back to `claude` when none declares one. Union rather than
intersection, because `defaults` is a baseline each member may narrow and an intersection would
drop a client one member was already targeting. `--tools <csv>` overrides the derivation outright
on the verb, `stamity workspace init` — not on the offer inside `stamity init`, which takes no
tools input of its own and always derives. `stamity init --tools` sets *this* repository's own
tools; it says nothing to the workspace being offered, and a run naming both a workspace-shaped
directory and `--tools` still derives the workspace's defaults from the union. A member whose
manifest exists but does not read cleanly contributes nothing to the union rather than failing the
creation — on the offer and on the verb alike — because the tool list is a starting baseline you
can edit the moment it is written, while refusing would mean no workspace can be created until a
repository it does not yet manage is repaired. `stamity validate` is the surface that reports that
member.

## `workspace status`

Bare `stamity workspace` is `status`, on a terminal and on a pipe alike — there is no key registry
here for a picker to navigate, so both produce the same bytes. It reports the nearest
`workspace.json` at or above the current directory, so running it inside `apps/web` reports the
workspace that actually governs `apps/web`. The report is a root line, one row per declared member
in declaration order, and at most one journal line.

| Row state | What it means |
|---|---|
| `ok` | present, inside the root, and carrying its own `.stamity/manifest.json` |
| `unconfigured` | present and contained, but no member manifest — `sync` will fail this row until `stamity init` runs there |
| `absent` | nothing at that path, or it is not a directory |
| `escaped` | it resolves outside the workspace root through a link. A containment question that cannot be answered reads the same way, because an unanswerable one is not a yes |
| `unresolved` | resolution refused the entry — an undefined group name, say. It wins the row, carrying the resolver's own message, because a refused resolution has no tools, groups or locks to print |

Every other row also carries what that member resolves to: its tool list, the group names that
matched, and any locked id whose removal the lock refused.

The **root line** names the workspace root and says whether it carries a setup manifest of its
own. It is marked informative: the root is never a cascade target, since the scan starts at the
root's children and a member path spelled `"."` or `""` is refused by shape.

The **journal line** appears only when the crash trail holds a `started` entry with no `finished`
or `skipped` entry for the same run and member — the member in flight when a process died. It is
read from a bounded 64 KiB tail rather than the whole file, and an absent journal, an unreadable
one, or a window beginning mid-line each print nothing.

`status` exits 0 whenever it could read the manifest, whatever the rows say: it is a report, not a
gate. Two gates exist already — `stamity validate` on the manifest's field defects and `workspace
sync` on a member that would not propagate — and a third disagreeing with either about severity is
how a CI step starts getting ignored. A defect the *read* refuses, such as two spellings of one
directory, surfaces as that read's own failure instead, at exit 1.

## `workspace sync`

The cascade, running members in parallel — the machine's core count, capped at eight, since a
member sync is write-heavy. Rows come back in manifest order whatever
order they finished in, and one member's failure is one row: it never stops the others, and it
never quietly passes either. Per member, in order:

1. **Read** that member's `.stamity/manifest.json`. No manifest fails the row by name, telling you
   to run `stamity init` there or drop the entry from `repos[]`; a manifest that exists and does
   not parse fails the row with the reader's own message.
2. **Compute the patch** over three fields — `tools`, `maturityTier`, `mcp` — from what the
   workspace resolved. A field the workspace does not declare is left exactly as the member has
   it, so a member carrying `scaleup` under a workspace declaring no tier keeps it. `mcp` patches
   as a whole block, not field by field: a workspace that declares `mcp` replaces the member's
   entire block — its server list and its `protocolVersion` together — rather than merging server
   names into what the member already had. A patch that changes nothing writes nothing.
3. **Write it back** into the manifest read in step 1, validated before it persists and written
   atomically. Patching the document from disk rather than composing a fresh one is what keeps the
   member's ledger, import choice and creation stamp intact.
4. **Plan and apply** that member's own sync — the same path plain `stamity sync` runs inside it.
5. A member whose apply refused a colliding path fails its row naming the refusals; everything
   else in that member's plan is already on disk.

**What does not propagate yet.** Selection deltas and locked content are resolved and reported —
each member's row names any locked id whose removal the lock refused — and they do not yet change
an emitted file. The reason sits one layer down: a member's own sync refreshes its manifest
selection from the full corpus on every run, so a written selection would be overwritten before
anything read it, and `lockedContent`'s only job is to refuse removals against that same
selection. A workspace declaring either gets one line under the tally saying exactly that.

Every cascade is a full re-run: no member is skipped for having succeeded before or because the
journal says so, since the idempotence a resume would buy is already bought a layer down, where a
member that is current reports every path unchanged. The run exits 0 when every member synced and
1 on a partial or failed one — a green run for a cascade that reached half its members is worse
than useless in CI.

## Previewing, and machine output

`--dry-run` covers all three subcommands and writes nothing anywhere. `workspace init --dry-run`
scans, asks, and prints the manifest it would write in full. `workspace status --dry-run` is
`status`; the flag is inert on a read. `workspace sync --dry-run` names the patch it would apply
per member, writes no member manifest and no emitted file, and disables the journal for that run —
a preview appending a `started` line would manufacture the crash signal the journal exists to
carry. The plan it reports is computed from the unpatched manifest: the one each member has today,
rather than an invented plan for a manifest that does not exist yet.

`--json` emits exactly one document per run. `status` carries the root, the member rows and the
journal entry; `init` carries the path, `created`, `dryRun`, the members, the resolved defaults and
the manifest; `sync` publishes the cascade's own result — `outcome`, `counts`, `repos[]` with each
row's `state` and error, and `journalWarnings` — with the bridge's `patched` and `lockedApplied`
added onto the rows it reached. Exit statuses are 0, 1 and 2 only, and the failure class travels
as `error.code` rather than in the number. `--json` also makes a run non-interactive, so
`workspace init --json` takes every candidate and discloses the list.

## Where the state lives

| Path | What it is |
|---|---|
| `workspace.json` at the root | the policy. Yours to edit by hand; only `workspace init` writes it |
| `<root>/.stamity/workspace-sync-journal.jsonl` | the crash trail, two lines appended per attempted member per run. Nothing reads it back to decide anything — `status` displays its last unterminated entry and that is all — so deleting it is always safe. Nothing rotates it either |
| `<member>/.stamity/manifest.json` | the member's own provenance record, and the propagated policy once a cascade has run. The bridge patches three fields there and leaves the rest of the document as it found it |

Ordinary commands are not workspace-aware: `stamity init` and `stamity sync` run inside a member
behave exactly as they do anywhere else. That is deliberate, and mostly unnecessary to fix — the
member's manifest already **is** the propagated policy, so a plain sync inside it emits what the
workspace decided.

## Where to go next

- [Getting started](getting-started.md) — install, what lands, and the first proven change.
- [CLI reference](cli-reference.md) — every verb, argument, flag and exit status.
- [Configuration reference](configuration.md) — the member-manifest keys the cascade writes into.
- [Troubleshooting](troubleshooting.md) — what `check` prints, and what each row means.
