<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.0.0 release cut (2026-08-30). -->
<!-- Re-open when: a trust tier is added or removed, the signed payload or the
     `signing.signer` grammar or requirement changes, the bundle bound changes, the shipped
     signature verifier is replaced, or the org policy grammar changes. `test/docsPages.test.ts` holds this page to the hand-page
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

## What a publisher-signed claim is checked against

The check is armed. A pack that declares `signing.method: "sigstore"` names a detached
bundle it ships (`signing.bundlePath`), and the install runs that bundle through the
official Sigstore client before anything is written.

What a pass means, exactly: the signature covers the pack's aggregate content hash, the
signing certificate chains to a Fulcio root in the Sigstore trust root, the signature is on
a transparency log and the certificate on a certificate-transparency log, and the
certificate carries the identity the pack declares. A failure at any step is a **refusal**,
never a downgrade to a lower rung.

What a pass does *not* mean is that the signer was entitled to publish the pack. The pin is
the pack's own declaration, so a pack naming its own author verifies whoever that is. So the
name is the thing to read, and `stamity add` prints it while you can still act on it: the
trust line of a verified pack states the certificate identity and the issuer that vouched
for it — `publisher-signed — … bundle verified: signed by <identity> via <issuer>` — and the
install receipt records the same sentence. Deciding whether that name is the right one is
yours; the install will not decide it for you.

**What gets signed.** Not the pack directory and not the bare hash: the aggregate content
hash, lower-cased and length-framed as `64:<hex>` in UTF-8
(`src/pack/trust.ts::sigstoreSignedPayload`). An author signing anything else produces a
bundle this gate refuses. There is no signing helper in this package yet — producing the
bundle is the author's step, against that serialization.

**Declaring a signer is mandatory.** `signing.signer` reads
`"<oidc-issuer> <certificate-identity>"` — the OIDC issuer, one space, then the identity in
the certificate's subject alternative name. Neither half may contain a space, which is what
makes the split unambiguous. It is **required** for `signing.method: "sigstore"`, and a
signer that does not parse is refused rather than ignored. Both refusals are the same rule:
a claim that pins nobody is satisfied by *any* Sigstore identity — anyone who can sign
anything — and would still put the pack on the `publisher-signed` rung with no waiver
anywhere on the command line. A pack that names no verifiable signer is refused when its
`pack.json` is read, before any tier is resolved.

**The bundle itself is bounded.** The declared `bundlePath` must be a regular file inside
the pack — never a symlink, a pipe or a device node — and at most 1 MiB. Real bundles are a
few kilobytes; the limit refuses rather than truncates, because half a bundle is not a
bundle.

**This is the one thing in the CLI that reaches the network.** Verifying a signed pack
fetches the Sigstore trust root over TUF; the transparency-log proofs travel inside the
bundle. `init`, `sync`, `check`, and installing any pack that declares no signature contact
nothing — the client is not even loaded. The trust metadata is cached under your user cache
directory, never inside the repository. [`SECURITY.md`](../SECURITY.md) states the same
boundary as a control.

**A verified claim is not waivable, and neither is a failed one.** `--allow-untrusted`
waives the **absence** of a trust basis, so it has no effect on a declared signing claim:
no flag on the command line reaches it. A catalog pin does not reach a failed check either.
The ladder still has one narrow substitution — when a verifier reports that it could not
EVALUATE a claim at all, a pin that verified at a rung the catalog's own work backs
(`scanned` or `curator-verified`) stands in and the gate records `n/a`. The shipped
verifier never reports that: it evaluates, so its refusals stay refusals. The rule survives
for a caller that injects a verifier which cannot judge.

No first-party pack declares `signing` — each rests on its catalog pin — so today this is a
path the ladder defines rather than one you will meet.

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
