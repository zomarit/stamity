<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-26). -->
<!-- Re-open when: a trust tier is added or removed, the Sigstore verifier is armed, or the
     org policy grammar changes. `test/docsPages.test.ts` holds this page to the hand-page
     contract; `src/pack/trust.ts` is the ladder's source of truth and `../SECURITY.md` is the
     one home for what the engine defends. -->

# Packs and trust

A pack is content installed on top of the corpus — agents, skills, rules, commands, hooks
and MCP server definitions, shipped together and installed as a unit. The corpus is what
every setup gets; a pack is what you add when a repository needs more.

The three first-party packs and what each ships are on
[the packs reference](reference/packs.md), which renders from their manifests.

## Installing one

```sh
stamity add ops                 # a catalog id
stamity add ./packs/ops         # a local directory
stamity add @acme/ops           # a package already under node_modules/
```

Those are the three routes, and **none of them fetches**. A catalog id resolves to content
shipped inside this package; a path is a directory on your disk; a scoped name is a package
you already installed yourself. There is no download step and no background update check.

Before anything is written, `add` shows you: the gate table, the resolved trust tier and
what it rests on, every file that would land with its size and token estimate, one
context-cost line, the pack's declared scope, and — in the default view, not behind a flag —
**every command line the pack would wire into something that runs it**. Add `--preview` to
print every file body in full; the footprint gate has already capped the total, so it needs
no pager. `--dry-run` plans without writing.

That command-line block is in the default view for a reason. Path and size describe prose.
A `hooks/*.json` entry becomes a command in your client's own settings file that runs on
every matching tool call, and an `mcp_servers/*.json` entry becomes a launcher your editor
spawns at start-up. Those two classes are the difference between installing text and
installing execution.

**Updating a pack means adding it again.** There is no auto-update path for any source.
Re-running the install line re-runs every gate against the new content and replaces what
was landed, so re-add is the update — and it is the only way to pick up a change.

## The trust ladder

Four rungs, ascending. Each names who did the work.

| Tier | What it rests on |
|---|---|
| `pinned-unsigned` | the floor — only the pack's own manifest integrity map anchors the content |
| `scanned` | a catalog ran its checks over this exact content hash |
| `publisher-signed` | the author signed the aggregate content hash with a detached Sigstore bundle, **and the bundle verified** |
| `curator-verified` | a catalog curator reviewed this exact content hash |

Two rules govern every path through it.

**Pinned-or-refuse.** A catalog pin names one immutable content hash. Content that hashes
to anything else is refused outright, never quietly downgraded to a lower rung — a
mismatch means the pack is not the thing that was pinned. This holds at install and at
re-install alike, which is what keeps the update path from being the way around it.

**Claims are not evidence.** A signing declaration raises the *claimed* tier only. The
claim holds when its detached bundle verifies, and not before.

## Signature verification is not armed

Say this plainly, because the tier exists and the check does not: **this build ships no
Sigstore verifier.** The seam is there and the implementation behind it reports `unarmed`
rather than a verdict, so a publisher-signed claim is **refused**, not trusted and not
waved through on the declaration alone.

The distinction the unarmed report preserves is between "this build could not check" and
"this build checked and the signature is wrong" — those are different facts and the
refusal says which one it is. The way forward it names is a catalog-pinned source.

Note what does *not* help here: `--allow-untrusted` waives the **absence** of a trust
basis, so it has no effect on a declared signing claim. No flag reaches it: a pack that
claims a signature this build cannot verify stays refused whatever you pass on the command
line.

One thing does reach it, and it is not a flag — the catalog pin the refusal already names.
When the same pack also arrives through a pin that **verified**, at a rung the catalog's
own work backs (`scanned` or `curator-verified`), the unverifiable claim is recorded as
`n/a` instead of refused and the install proceeds on the pin. That is the whole point of
reporting `unarmed` rather than a verdict: unevaluable is not false, and the pin has
already named these exact bytes. Neither weaker case stands in — a pin whose content
hashes to something else is refused before this gate by pinned-or-refuse, and a
`pinned-unsigned` pin carries no catalog work to lend. No first-party pack declares
`signing`, so today this is a path the ladder defines rather than one you will meet.

## `--allow-untrusted`

A pack with no trust basis at all — no catalog pin, no signing declaration — is refused by
default. The waiver is a flag, so the decision is visible in the command line and therefore
in a CI log, rather than buried in an interactive answer nobody can audit later:

```sh
stamity add ./my-pack --allow-untrusted
```

The refusal states what the waiver accepts, and it is worth reading before you type it:
pack bodies land directly in agent context, and the pack's hook and MCP server definitions
become **commands your client runs as you** — a hook on every matching tool call, an MCP
launcher at editor start-up. Nothing attests who wrote the code you would be running.

Use it for packs you authored yourself, and read the `runs on this machine` block before
you accept.

There is no `--force`. Collisions are never overridable: a pack that would write over a
path it does not own is refused, because supply that silently replaces your own files is
the failure the ownership ledger exists to prevent. Clear the paths instead.

## The org trust policy

An organization that wants to narrow the sources its repositories may install from checks
in a policy file at `.stamity/policy.json`. It is consulted as the first gate after the
pack manifest is read, and again at projection — so a pack installed before a policy
existed stops being projected once the policy denies it, without a re-install and without
losing its files.

Entries name a pack id (`ops`, `@acme/ops`), a scope wildcard (`@acme/*`), everything
(`*`), or a source kind (`local-path`, `npm-package`, `catalog-pinned`). Two rules:

- **Deny-wins.** A deny match refuses the source whatever the allow list says. With an
  `allow` list present, only allow-matched sources pass; without one, everything not denied
  passes. No file at all means no policy — the policy is opt-in.
- **Fail-closed.** A policy that exists but cannot be read as exactly the documented shape
  refuses every install until it is fixed. "Could not read it, so allowed everything" is
  the one outcome the file exists to prevent.

## After the install

`add` records a SHA-256 for every byte it writes. `stamity check` re-hashes those files on
every run — its `pack-integrity` row — so an edit to `.stamity/packs/**` after the install
returned shows up as what it is, rather than as ordinary regeneration drift that `sync`
would then propagate into your emitted agent files.

The check is read-only and never repairs. What to do about a mismatch is your decision:
re-install the pack, or accept the edit knowing the row will keep reporting it.

## Removing one

```sh
stamity clean --pack ops
```

That removes exactly one pack — its files and its ledger rows — and leaves everything else
alone. Ownership is matched on exact equality, so `@acme/ops` can never match
`@acme/ops-extra`. The state directory stays, because every other owner is still live. A
file the safety gates kept — bytes you edited, an unlink that was refused — loses its row
anyway and becomes yours to keep or delete, and the output says so.

Follow it with `stamity sync`, which reclaims any projected copies of that pack's content
now that its rows are gone. Plain `stamity clean` with no flag removes the whole setup,
packs included.

## Authoring one

Read [`packs/ops/`](../packs/ops/) as the worked example: a `pack.json` manifest beside
class directories (`agents/`, `skills/`, `commands/`) holding the content itself. The
manifest declares the pack's name, version, description, an integrity map with a digest
per file, and its declared scope — which tools it targets and what it touches.

Two constraints shape what you can ship. Lifecycle scripts are banned outright — a pack
never runs code at install time. And every file is measured against a footprint cap, so a
pack is bounded content rather than an open-ended payload.

Regenerate the first-party manifests after editing a pack:

```sh
node scripts/generate-pack-manifests.mjs
```

What the gate chain checks, where it stops, and what it explicitly does not defend:
[`SECURITY.md`](../SECURITY.md).
