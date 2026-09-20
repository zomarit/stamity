---
title: Packs and trust
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: a trust tier is added or removed, the signed payload or the `signing.signer`
     grammar changes, the bundle bound changes, the shipped signature verifier is replaced, `add`
     gains or loses a flag, the org trust policy grammar changes, or the published package stops
     exporting `createEngine` or `SetupManifest` from `src/index.ts`. `test/docsPages.test.ts` holds
     this page to the hand-page contract and `src/pack/trust.ts` is the ladder's source of truth. -->

# Packs and trust

A pack is content you install on top of the corpus, and this page is for the operator installing
one and the author publishing one. By the end you can install a pack, read the trust tier it
resolved to, sign a pack of your own, set an org policy, and remove a pack again.

## Install a pack

Preview first. `--dry-run` runs every install gate and writes nothing:

```sh
stamity add ops --dry-run
```

`add` names the pack and its version, then prints the gate chain, the facts it settled, and
everything it would write:

```text
  manifest           pass
  trustTier          pass
  orgPolicy          n/a
  signing            n/a
  lifecycleScripts   n/a
  integrityMap       pass
  bodyScan           pass
  mcpServers         n/a
  hooks              n/a
  footprint          pass
  declaredTools      pass
  ruleActivation     n/a
  permissions        pass
  agentCapabilities  pass

  files              9
  footprint          53.9 KiB of 5.0 MiB allowed
  target             .stamity/packs/ops
  trust              curator-verified — catalog pin verified: aggregate content SHA 90f6a36e3c96… matches and the catalog grants "curator-verified"

  will install
    agents
      agents/stamity-devops.md                   4.4 KiB  ~1134 tok
      …
    skills
      skills/st-release/SKILL.md                 7.0 KiB  ~1777 tok
      …

  context cost  ~13725 tokens across 9 file(s)

  scope
    declared tools  claude, cursor, copilot, codex
    tool footprint  read, edit, execute, spawn
    touched paths   CHANGELOG.md, package.json, .github/workflows/**, …

  runs on this machine
    no hook or MCP server definitions — this pack wires no commands

  nothing written (--dry-run)
```

Drop `--dry-run` to install. Nothing is prompted along the way. An install gate either passes or
refuses, so there is no yes-or-no question a prompt could ask.

Read the `runs on this machine` block every time. Path, size and token count describe prose.
A `hooks/*.json` entry becomes a command in your client's own settings file, and it runs on every
matching tool call. An `mcp_servers/*.json` entry becomes a launcher your editor spawns at
start-up. Those two classes are the difference between installing text and installing execution,
so they are in the default view rather than behind a flag.

Add `--preview` to print every planned file body in full. The footprint gate has already capped
the total, so the preview needs no pager.

### Where a pack can come from

There are three routes, and **none of them fetches**:

```sh
stamity add ops                 # a catalog id
stamity add ./packs/ops         # a local directory
stamity add @acme/ops           # a package already under node_modules/
```

A catalog id resolves to content shipped inside this package. A path is a directory on your disk.
A scoped name is a package you already installed yourself. There is no download step and no
background update check.

The three first-party packs, and what each one ships, are on
[the packs reference](reference/packs.md). That page renders from their manifests.

### Update a pack by adding it again

**Updating a pack means adding it again.** There is no auto-update path for any source.
Re-running the install line re-runs every install gate against the new content and replaces what
was landed. So re-add is the update, and it is the only way to pick up a change.

## Which rung of the trust ladder a pack lands on

Four rungs, ascending. Each one names who did the work.

| Tier | What it rests on |
|---|---|
| `pinned-unsigned` | the floor — only the pack's own manifest integrity map anchors the content |
| `scanned` | a catalog ran its checks over this exact content hash |
| `publisher-signed` | the author signed the aggregate content hash with a detached Sigstore bundle, **and the bundle verified** |
| `curator-verified` | a catalog curator reviewed this exact content hash |

Two rules govern every path through the ladder.

**Pinned-or-refuse.** A catalog pin names one immutable content hash. Content that hashes to
anything else is refused outright. It is never quietly downgraded to a lower rung, because a
mismatch means the pack is not the thing that was pinned. This holds at install and at re-install
alike, which is what keeps the update path from being the way around it.

**Claims are not evidence.** A signing declaration raises the *claimed* tier only. The claim holds
when its detached bundle verifies, and not before.

## What a verified signature proves

The check is armed. A pack that declares `signing.method: "sigstore"` names a detached bundle it
ships at `signing.bundlePath`. The install runs that bundle through the official Sigstore client
before anything is written.

A pass means four things at once. The signature covers the pack's aggregate content hash. The
signing certificate chains to a Fulcio root in the Sigstore trust root. The signature is on a
transparency log and the certificate is on a certificate-transparency log. The certificate carries
the identity the pack declares. A failure at any step is a **refusal**, never a downgrade to a
lower rung.

A pass does not mean the signer was entitled to publish the pack. The identity is pinned by the
pack's own declaration, so a pack naming its own author verifies whoever that is. The name is
therefore the thing to read, and `stamity add` prints it while you can still act on it. The trust
line of a verified pack states the certificate identity and the issuer that vouched for it. It
reads `publisher-signed — … bundle verified: signed by <identity> via <issuer>`. The install
receipt records the same sentence. Deciding whether that name is the right one is yours, and the
install will not decide it for you.

**What gets signed.** Not the pack directory, and not the bare hash. The signed payload is the
aggregate content hash, lower-cased and length-framed as `64:<hex>` in UTF-8
(`src/pack/trust.ts::sigstoreSignedPayload`). An author who signs anything else produces a bundle
the signature gate refuses. The author helper below reuses that serialization directly.

**Declaring a signer is mandatory.** `signing.signer` reads `"<oidc-issuer> <certificate-identity>"`.
That is the OIDC issuer URL, one space, then the identity in the certificate's subject alternative
name. The identity is an email address or a URI. Neither half may contain a space, which is what
makes the split unambiguous. A signer is **required** for `signing.method: "sigstore"`, and one
that does not parse is refused rather than ignored. Both refusals are the same rule. A claim that
pins nobody is satisfied by *any* Sigstore identity, which is anyone who can sign anything. Such a
pack would still reach the `publisher-signed` rung, with no waiver anywhere on the command line.
A pack that names no verifiable signer is refused when its `pack.json` is read, before any tier is
resolved.

**The bundle itself is bounded.** The declared `bundlePath` must be a regular file inside the
pack. A symlink, a pipe or a device node is refused. The file is at most 1 MiB. Real bundles are a
few kilobytes, and the limit refuses rather than truncates, because half a bundle is not a bundle.

### The one network call an install makes

**Verifying a signed pack is the only network access a pack install performs.** It is also one of
the two the engine performs while it works. Verification fetches the Sigstore trust root over TUF.
The transparency-log proofs travel inside the bundle. `init`, `sync`, `check`, and installing any
pack that declares no signature do not even load the Sigstore client. The trust metadata is cached
under your user cache directory, never inside the repository. A host that cannot reach the mirror
cannot check a signature, so an offline machine cannot install a signed pack at all.

**Since 1.9.0 the Sigstore client is an optional dependency.** npm installs it by default, so the
ordinary install is unchanged; an install run with `--omit=optional` has no verifier, and a build
that cannot load one **refuses** the claim — never a pass, and never the pin-waivable `unarmed`.
Deleting the client is therefore not a way to switch signature checking off; it is a way to make
every signed pack fail to install.

The second is `stamity worktree setup`. When no local branch of the requested name exists and the
repository has an `origin` remote, it runs `git fetch origin <branch>` against your repository's
own remote (`src/worktree/git.ts::fetchBranch`). A transport failure refuses with `NETWORK_ERROR`,
and a `--dry-run` never runs the fetch at all.

One further path is network-capable and is no part of any command's work. The startup update
notice asks the public npm registry whether a newer version exists. It is a GET at most once a
day. `STAMITY_NO_UPDATE_CHECK=1` turns it off, and so do `NO_UPDATE_NOTIFIER` and `CI` on any
non-empty value. [`SECURITY.md`](../SECURITY.md) states the same boundary as a control, and lists
both exceptions.

### Nothing waives a failed signature check

**A verified claim is not waivable, and neither is a failed one.** `--allow-untrusted` waives the
**absence** of a trust basis, so it has no effect on a declared signing claim. No flag on the
command line reaches it. A catalog pin does not reach a failed check either.

The ladder has one narrow substitution. A verifier can report that it could not *evaluate* a claim
at all. In that case a pin that verified at a rung the catalog's own work backs stands in, and the
signature gate records `n/a`. Those rungs are `scanned` and `curator-verified`. The shipped
verifier never reports that, because it evaluates, so its refusals stay refusals. The rule survives
for a caller that injects a verifier which cannot judge.

No first-party pack declares `signing`. Each one rests on its catalog pin instead, so today this
is a path the ladder defines rather than one you will meet.

## Sign a pack you publish

Signing needs an OIDC identity, so it does not run from an ordinary terminal. Use a GitHub
Actions job that grants `id-token: write`, or a process whose environment already carries an
identity token in `SIGSTORE_ID_TOKEN`. The official Sigstore client this package installs offers
those two identity sources and no interactive browser flow.

Work from a stamity source checkout on Node >=22.22.2. Prepare the pack's content and its
integrity map first. Then declare the exact OIDC issuer and certificate identity in `pack.json`:

```json
{
  "signing": {
    "method": "sigstore",
    "signer": "<oidc-issuer> <certificate-identity>",
    "bundlePath": "pack.sigstore.json"
  }
}
```

That is the `signing` section of the existing `pack.json`, alongside its `name`, `version` and
`integrity`. The [concrete GitHub Actions example](../.github/pack-signing-example.json) shows the
issuer and identity forms. Replace its repository, workflow and tag with the authorized signing
job's actual identity. The bundle sits outside the content directories and is excluded from its
own integrity map.

```sh
npm ci --ignore-scripts
node scripts/sign-pack.mjs /path/to/pack
node dist/cli.js add /path/to/pack --dry-run
node dist/cli.js add /path/to/pack
```

Build the CLI first if this checkout has no `dist/`. Run those commands in the job that holds
the identity. Without one the script refuses and writes no bundle.

A refusal the engine itself raises prints its code and message, so you can see which gate said no.
Any other failure prints one fixed line instead. Provider text can carry an identity token, and a
log is not the place for one.

### Sign from TypeScript instead of the script

The published package ships type declarations for its JavaScript API. `package.json` points both
`types` and the `"."` export's `types` condition at `dist/types/index.d.ts`, so a TypeScript
consumer needs no separate types package for stamity itself. `createEngine` and `SetupManifest` are
both importable from `@zomarit/stamity`, along with the types those two reach.

```ts
import { createEngine } from "@zomarit/stamity";

const result = await createEngine().pack.sign.signPack("/path/to/pack");
```

`createEngine().pack.sign.signPack(...)` is the same function `scripts/sign-pack.mjs` calls, so the
API route and the script route sign identically.

In CI, prepare and validate content in a job without `id-token: write`. Run signing in a separate
protected job that grants it. Install dependencies before granting access to an external signing
identity, and run only reviewed signer code in that job. No token argument, stored signing key or
credential file is passed to the script. In Actions the per-run identity is process state that
`id-token: write` grants. Anywhere else the client reads `SIGSTORE_ID_TOKEN` from the environment,
and that token is a credential: keep it short-lived and out of every log and artifact. Publish only
the content, the manifest and the detached bundle. Never publish environment dumps or signing logs
that contain provider requests.

The script reuses `sigstoreSignedPayload` from the verifier, checks integrity before signing,
verifies the returned bundle against the declared issuer and identity, rechecks its inputs, and
writes atomically. Unsafe bundle paths, wrong signers, malformed responses and changed content all
refuse without claiming success.

To publish an update, change the content and its integrity map, set the new pack version and the
appropriate signing identity, sign again, and repeat `add`. A changed content hash cannot reuse
the old signature.

## Install a pack that nothing vouches for

A pack with no trust basis at all is refused by default. That means no catalog pin and no signing
declaration:

```text
error: pack "my-pack" has no trust basis — no catalog pin, no signing declaration — and such packs are refused by default
  why: pack bodies land directly in agent context, and its hook and MCP server definitions become commands your client runs as you — a hook on every matching tool call, an MCP launcher at editor start-up — so nothing attests who wrote the code you would be running
  next: install from the curated catalog or a signed build, or — for a pack you authored yourself — re-run with --allow-untrusted, reading the `runs on this machine` block before you accept
```

The waiver is a flag, so the decision is visible in the command line and therefore in a CI log. An
interactive answer nobody can audit later would hide it:

```sh
stamity add ./my-pack --allow-untrusted
```

Use it for packs you authored yourself. Read the `runs on this machine` block before you accept,
because nothing attests who wrote the code you would be running.

There is no `--force`. Collisions are never overridable. A pack that would write over a path it
does not own is refused. Supply that silently replaces your own files is the failure the ownership
ledger exists to prevent. Clear the paths instead.

## Limit which sources your repositories accept

An organisation that wants to narrow the sources its repositories may install from checks in a
policy file at `.stamity/policy.json`.

The file is loaded as soon as the pack manifest has been read and validated. That is before the
trust tier resolves and before a single content byte is read, so a malformed policy refuses every
install whose manifest parses. The policy is then *applied* once the tier has resolved, as the
second gate after the manifest read. It waits that long because the `catalog-pinned` kind it
judges exists only once the catalog pin has verified. It is applied again at projection, so a pack
installed before a policy existed stops being projected once the policy denies it. That takes no
re-install and loses no files.

Entries name a pack id such as `ops` or `@acme/ops`, a scope wildcard such as `@acme/*`,
everything as `*`, or a source kind. The three source kinds are `local-path`, `npm-package` and
`catalog-pinned`. Two rules decide every install:

- **Deny-wins.** A deny match refuses the source whatever the allow list says. With an `allow`
  list present, only allow-matched sources pass. Without one, everything not denied passes. No
  file at all means no policy, because the policy is opt-in.
- **Fail-closed.** A policy that exists but cannot be read as exactly the documented shape refuses
  every install until it is fixed. "Could not read it, so allowed everything" is the one outcome
  the file exists to prevent.

A policy cannot be written in terms of the trust ladder. There is no minimum-tier setting, and the
grammar has no tier token. Policy decides which *sources* may supply packs, and the ladder
classifies what a pack is worth trusting once a source is allowed.

Read the source kind from the policy's point of view, not from the line `add` prints. A catalog
install resolves to a directory inside the engine package, so that line honestly reports
`local-path`. The policy still judges the same install as `catalog-pinned`, because its verified
pin granted a catalog rung. So `deny: ["local-path"]` means "no unreviewed directory installs" and
leaves the curated catalog reachable.

One bound applies to the source-kind tokens at projection rather than at install. At install the
kind comes from the source being installed. At projection it is read back out of the receipt `add`
wrote into the pack's own directory. A receipt that has been deleted or edited into something
unparsable leaves the kind unknown, and an unknown kind matches no kind token. A
`deny: ["npm-package"]` rule therefore does not reach that pack at projection, while a rule naming
the pack, its scope, or `*` still does. That direction is deliberate, because an unreadable
receipt must not silently widen a kind rule onto packs whose provenance nobody can check. It is
also not a hiding place. The receipt is ledgered like every other installed byte, so deleting or
editing it is a failing `pack-integrity` row in `stamity check`. If a rule has to hold whatever
state a pack directory is left in, write it by name, by scope, or as `*`.

### Write the policy with `stamity config policy`

`stamity config policy` is the writer. Do not hand-author the file. Every pattern is checked
against the grammar above *before* anything is written. Fail-closed is exactly why that matters.
A typo in a hand-edited policy refuses every install in the repository until somebody finds it.

```sh
stamity config policy list                    # the standing rules, and the mode they put you in
stamity config policy init                    # an empty, inert policy to start from
stamity config policy deny local-path         # no unreviewed directory installs
stamity config policy allow catalog-pinned    # nothing but the curated catalog
stamity config policy remove local-path       # drop a rule from wherever it sits
```

`allow` and `deny` create the file if there is none, and both are idempotent. `--dry-run` prints
the document instead of writing it. Those two middle lines produce:

```json
{
  "version": 1,
  "packs": {
    "deny": [
      "local-path"
    ],
    "allow": [
      "catalog-pinned"
    ]
  }
}
```

Two consequences are printed as they happen, because both are repository-wide. Adding the
**first** `allow` entry switches the repo into allowlist mode, where a source matching no allow
entry is refused. Installed packs are included, and they stop projecting at the next `sync`.
Removing the **last** one switches it back. It drops the key rather than leaving `"allow": []`
behind, which is a valid document that denies everything.

If a policy is already on disk and does not parse, every action refuses with the defect named.
`stamity config policy init --force` is the way back out.

## Check an installed pack for edits

`add` records a SHA-256 for every byte it writes. `stamity check` re-hashes those files on every
run and reports them in its `pack-integrity` row:

```text
  ok    pack-integrity       10 installed pack file(s) still match the hashes recorded at install
```

An edit to `.stamity/packs/**` after the install returned shows up as what it is, rather than as
ordinary regeneration drift that `sync` would then propagate into your emitted agent files:

```text
  fail  pack-integrity       1 of 10 installed pack file(s) no longer match what was verified at install: …
```

The check is read-only and never repairs. What to do about a mismatch is your decision. Re-install
the pack, or accept the edit knowing the row will keep reporting it.

## Remove one pack

```sh
stamity clean --pack ops
```

That removes exactly one pack, meaning its files and its ledger rows. It also takes that pack's
selected MCP servers out of the merged client config files, and out of the `mcp.servers` selection
in `.stamity/manifest.json`. This is the last moment they can be proved. An entry you had tuned
yourself is kept and reported as yours.

Every other pack's files and rows are left alone. Outside the pack's own directory, two things
change. `.stamity/manifest.json` loses exactly this pack's ledger rows and has its `mcp.servers`
selection trimmed. When the pack supplied a selected server, the merged client MCP documents that
removal edited change too. Their adapter-owned ledger rows are re-hashed to the bytes now on disk,
so the ledger keeps asserting what is actually there.

Ownership is matched on exact equality, so `@acme/ops` can never match `@acme/ops-extra`. The
state directory stays, because every other owner is still live. A file the safety gates kept loses
its row anyway and becomes yours to keep or delete, and the output says so. That covers bytes you
edited, and an unlink that was refused.

Follow it with `stamity sync`, which reclaims any projected copies of that pack's content now that
its rows are gone. Plain `stamity clean` with no flag removes the whole setup, packs included.

## Author your own pack

Read [`packs/ops/`](../packs/ops/) as the worked example. It is a `pack.json` manifest beside
class directories such as `agents/`, `skills/` and `commands/`, which hold the content itself. The
manifest declares the pack's name, version, description, an integrity map with a digest per file,
and its declared scope. The scope says which tools the pack targets and what it touches.

Three constraints shape what you can ship. Lifecycle scripts are banned outright, so a pack never
runs code at install time. Total content is measured against a footprint cap, which is 5 MiB
unless the pack declares a tighter one of its own. Installed file count is capped at 500. A pack
is bounded content, not an open-ended payload.

Regenerate the first-party manifests after editing a pack. The plain invocation verifies each pack
against its existing map and fails on the drift an edit just introduced. Rewriting a map is the
maintenance mode, and that split is deliberate:

```sh
node scripts/generate-pack-manifests.mjs --write
```

What the gate chain checks, where it stops, and what it explicitly does not defend are in
[`SECURITY.md`](../SECURITY.md).
