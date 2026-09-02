<!-- HAND-WRITTEN PAGE — verified against the tree at commit 6865e31. -->
<!-- Re-open when: any `file::symbol` address below stops resolving, a named control loses its
     last production caller, a new install source or execution surface ships, a control named
     under "Publishing this package" changes in `.github/workflows/release.yml`, or the external
     mapping in "Standards mapping" is authored. `test/docsPages.test.ts` fails on the first;
     `test/ci/workflow.test.ts` fails on the fourth. -->

# Security

> What follows is what this build defends today, stated so it can be checked against the code
> rather than believed. Every control names a file and an enclosing symbol, and
> `test/docsPages.test.ts` asserts that each one exists and that something under `src/` calls
> it — a claim that outlives its implementation fails the suite rather than this page.

## Reporting

Report a suspected vulnerability through GitHub private vulnerability reporting:
<https://github.com/zomarit/stamity/security/advisories/new>. The report stays private to the
maintainer until a fix ships, and the advisory flow can request a CVE at publication. Do not
open a public issue for a vulnerability, and do not disclose it elsewhere first. No email
address is published for this: the advisory form is the channel.

Expect an acknowledgement within seven days. That is an estimate, not a funded SLA — one
person maintains this repository, and an honest number beats a response window nobody is on
call for. There is no bug bounty either: a report is acknowledged and fixed, not paid. A
useful report names the command you ran, the repository state you ran it in, what happened,
and what you expected instead. The CLI only writes into a repository you control, so a
scratch repo plus one command is usually the whole reproduction.

## Supported versions

| Version | Supported |
|---|---|
| `1.x` | Yes — security fixes land on the latest `1.x` release. |
| `0.x` | No. Nothing before `1.0.0` is a supported build. |

## Where content comes from

Three sources install, and no more. Nothing on any of them is fetched over the network.

1. **Bundled first-party packs** shipped inside this package, resolved through the curated
   catalog by bare id (`stamity add ops`).
2. **A local directory** named by a path-shaped spec (`stamity add ./packs/ops`). An explicit
   path always means the directory, even when a catalog entry shares its name.
3. **A package already present under `node_modules/`** named by its package name
   (`stamity add @acme/ops`). This one is a real route, not a footnote: the default refusal
   coaches an operator toward it and `--help` documents it.

Every route runs the same gate chain, and the org trust policy
(`src/pack/orgPolicy.ts::evaluatePackSource`) is the lever that narrows them — by pack id,
by scope wildcard, or by source kind (`local-path` vs `npm-package`). Deny wins, and an
`allow` list denies everything it does not name. Absent a policy file, all three are open.

## What the engine defends today

Addresses are `file::symbol`, not `file:line`: a symbol survives an edit above it, and every
one below is asserted to exist by `test/docsPages.test.ts`.

| Actor | Vector | Control | Where | Residual |
|---|---|---|---|---|
| Pack author | Publishing content that hashes to something other than what was reviewed | Four-tier trust ladder, pinned-or-refuse: content off the catalog pin is refused, never quietly downgraded | `src/pack/trust.ts::resolveTrustTier` | A pin is only as good as the catalog that issued it, and nothing here attests the catalog |
| Pack author | Declaring a signature nothing checks | A declared `sigstore` claim is verified before any write: `signing.signer` is REQUIRED (a claim that pins no identity is refused at ingress, never verified against an empty policy), and the detached bundle must carry a signature over the pack's length-framed aggregate content hash, chain to the Sigstore trust root, and match that signer's identity and issuer exactly. A failed check refuses the install, and `--allow-untrusted` does not reach it | `src/pack/trust.ts::verifyPublisherSignedClaim`, `src/pack/sigstoreVerifier.ts::verifySigstoreBundle`, `src/pack/trust.ts::sigstoreSignedPayload` | Verification says WHO signed, never that they were entitled to publish — see below |
| Pack author | Running code at install time | Per-file SHA-256 integrity map is required, not optional, and every npm lifecycle script name is banned outright, so installing never runs pack-authored code | `src/pack/manifest.ts::validatePackManifest`, `src/pack/manifest.ts::BANNED_LIFECYCLE_SCRIPTS` | Nothing stops code that runs LATER — see "Hook and MCP execution" |
| Pack author | Writing outside the pack's own directory | Every pack-relative path is checked before it is joined — no absolute paths, no `..` escape | `src/pack/permissions.ts::assertSafePackRelPath` | — |
| Pack author | Claiming a small footprint and shipping a large one | The `permissions` block is strictly validated at ingress and a malformed declaration fails the load | `src/pack/permissions.ts::readPermissions` | The block is DISCLOSURE, not a sandbox: nothing cross-checks it against the files and nothing refuses an install for exceeding it |
| Operator's org | Installing from a source the org has not approved | Source policy evaluated before any install is attempted | `src/pack/orgPolicy.ts::evaluatePackSource` | Policy is written in pack ids, scopes and source kinds — never in trust tiers |
| Any text author | Prompt injection and instruction override reaching agent context | Deny-scan over three pattern sets — content, injection, MCP poisoning — scanned raw ∪ normalized, so a lookalike letter or a combining mark is not an evasion | `src/denyscan/denyScan.ts::scanNormalized`, `src/denyscan/denyScan.ts::normalizeForDenyScan` | A pattern gate is a gate, not a proof |
| Any text author | Smuggling keywords past a reader with invisible characters | Invisible-character class stripped before every screen | `src/denyscan/denyScan.ts::INVISIBLE_SMUGGLING_CHARS` | — |
| MCP server | Poisoning a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission | `src/mcp/descriptionScan.ts::scanMcpEntry` | A server that redefines its tools after install is NOT detected — see below |
| A generated agent | Using a tool its role was never granted | Deny-by-default per-agent allowlist over tool categories: the named roster is serialized — pre-sanitized to exactly what an access check would authorize — into the policy document the emitted pre-tool-use guard reads, and the guard refuses with a machine-readable reason code | `src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER` | ONE enforcement point, and it is the emitted client-side guard — the in-process check is built but unwired, see below. On a client whose hook payload names no agent the guard is telemetry |
| An agent | Piping an unbounded payload through the `learn` write path | Stdin is read under a 250 000-character ceiling and REJECTED past it, not truncated | `src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH`, applied in `src/cli/commands/learn.ts` | The 500 KB / 1 MB phase bounds beside it are unwired — see below |
| Concurrent writer, or anything at the target path | Torn writes, symlink redirection, clobbering content the engine does not own | Temp file created `O_EXCL \| O_NOFOLLOW` plus atomic rename under a cross-process lock; content outside managed blocks is preserved and reclaimed | `src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts` | — |
| Anyone reading the repo | Credentials committed into generated config | MCP configs emit `${env:VAR}` placeholders, never literal values; values are scanned for known secret shapes and masked wherever a finding is printed | `src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets` | Shape detection catches known shapes on sight, and nothing else |

## Network and data handling

The engine performs no network I/O while it works, with the one exception named next. Nothing
is uploaded, no telemetry or analytics is collected, and every byte the CLI produces lands in
the repository you ran it in.

**Verifying a signed pack is the exception.** Installing a pack that declares
`signing.method: "sigstore"` fetches the Sigstore project's trust root over TUF before the
bundle is checked (`src/pack/sigstoreVerifier.ts::verifySigstoreBundle`; the mirror is the
client's default, named in that file). It is the only network access any command's work
performs, and it happens only then: `init`, `sync`, `check`, and every install of a pack that
declares no signature do not even load the client — and no first-party pack declares one. The
exchange fetches signed metadata and sends nothing about you or the repository; the metadata is
cached under your user cache directory (`src/pack/sigstoreVerifier.ts::sigstoreCachePath`),
never inside the repository being installed into. A host that cannot reach the mirror gets a
refusal, not a pass.

One further code path is network-capable and it is not part of any command's work: the startup update
notice asks the public npm registry whether a version newer than the running one exists
(`src/cli/notice/updateNotice.ts`). It sends the package name and nothing else, is bounded by
a 1.5-second timeout, caches its answer for a day, fails silently, and never rewrites an
install — the answer is a banner. Set `STAMITY_NO_UPDATE_CHECK=1` to turn it off;
`NO_UPDATE_NOTIFIER` and `CI` on any non-empty value do the same.

## Publishing this package

A release is built and published by `.github/workflows/release.yml`, and what a consumer can
check are properties of that file rather than of a maintainer's laptop:

- **The job that builds does not hold the credential.** One job runs the build, the suite, the
  leak gate and the packed-artifact smoke on the shipping commit; a second job holds the publish
  credential, takes no checkout, and runs only npm, the GitHub CLI and three SHA-pinned actions (harden-runner, setup-node, download-artifact) against a tarball
  whose SHA-256 it verifies against the first job's OUTPUT — a channel separate from the artifact
  under verification. A compromised build-time dependency runs in the job that has no credential.
- **No stored npm token.** Publishing is `npm publish --provenance` over GitHub OIDC trusted
  publishing: the publishing job mints a short-lived credential per run, so there is no long-lived
  publishing credential in this repository to leak or to rotate.
- **A run that can publish must come from a `v*` tag** whose name equals the version
  `package.json` declares, and whose commit is reachable from `main`. Both proofs run before the
  pack step, on a tag push and on a maintainer-dispatched release alike; a dispatch from a branch
  fails there. A rehearsal dispatch runs every gate, publishes nothing, and prints the proofs it
  skipped.
- **The GitHub release carries the bytes.** The tarball, its SHA-256 in the release body, and a
  CycloneDX SBOM when generation succeeds — stated as absent in the body when it does not.

What no file here can do is the platform half, and it is maintainer setup rather than code: a
required reviewer on the `npm-publish` deployment environment, a `v*` tag ruleset, and the
trusted-publisher entry on the registry naming this repository, this workflow file and that
environment. Each of those is now in force: the `npm-publish` environment requires a reviewer before a
publish runs, the `v*` tag ruleset governs release-tag creation, update and deletion, and the
registry's trusted-publisher entry is configured, so published versions authenticate over OIDC
and carry npm provenance rather than a stored token. Every step that depends on one says so
where it depends on it.

## What it does not defend

- **Privilege.** The CLI runs as you, with your filesystem rights, in a repository you
  point it at. It is not a sandbox and does not pretend to be one.
- **Hook and MCP execution.** The engine writes hook scripts and hook CONFIG; your AI client
  runs them, with your privileges. Reading `.stamity/generated/hooks/` covers only the scripts
  this engine generates. What decides whether a command runs at all is the client's own
  config — `.claude/settings.json`, `.cursor/hooks.json`, `.codex/hooks.json` — and a hook a
  PACK supplies lands there, never under `.stamity/generated/`. An MCP server definition
  likewise becomes a launcher your editor spawns at start-up. Read all four, and read the
  `runs on this machine` block `stamity add` prints before accepting a pack.
- **Who a signature names.** A verified bundle proves that an identity signed exactly these
  bytes. It does not prove that identity was entitled to publish this pack: the pin comes from
  the pack's own `signing.signer`, so a pack naming its own author verifies whoever that is.
  There is no authorization model, no publisher registry, and no revocation list beyond what
  the Sigstore trust root itself carries. Read a `publisher-signed` tier as an attributable
  signature, not as an endorsement.
- **Verification without the network.** The trust root is fetched at verification time, so a
  host that cannot reach the mirror cannot check a signature. That path refuses rather than
  passing, which is the safe direction — and it does mean an offline machine cannot install a
  signed pack at all. `src/pack/trust.ts::notYetArmedSigstoreVerifier` is the honest stand-in
  for a caller that injects a verifier which cannot judge; nothing selects it on its own, and a
  build whose `sigstore` dependency is broken refuses too.
- **A second, in-process tool check.** One thing stands between a running agent and a tool
  call, and it is the guard script your client runs. `src/tools/allowlist.ts::checkToolAccess`
  — the in-process check the emitted policy document is pre-sanitized to agree with — has no
  production caller: nothing calls it at a delegation boundary, and it refuses nothing outside
  this repository's own suite. Read a denial as one control, not as a pair.
- **Bounded phase IO.** `src/guard/promptGuard.ts` defines a 500 KB phase-input bound, a
  1 MB agent-output bound, and boundary-marker wrapping. Only the 250 000-character user-
  content ceiling above has a production caller; `guardInput`, `validateAgentOutput`,
  `wrapWithBoundary` and `extractBoundedContent` have none outside their own module and
  reject nothing today.
- **MCP tool-manifest drift.** `hashToolManifest` and `detectToolManifestDrift` exist and
  are tested, and nothing calls them: no path records a manifest hash at install and no path
  compares one later. A server that redefines its tools after you approved it is not
  detected in this build.
- **Pattern gates are gates, not proofs.** Deny-scan and secret-shape detection catch known
  shapes on sight. Neither is evidence that a file is clean.
- **Declared pack permissions.** The `permissions` block says what a pack intends to touch.
  Nothing verifies the claim and nothing refuses an install for exceeding it — the block is
  disclosure for a human to read, not a sandbox. Treat a pack's declaration the way you would
  treat its README.
- **Trust tiers as a policy lever.** The trust ladder classifies a pack; org policy decides
  which SOURCES may install. There is no "minimum tier" setting — policy cannot be written in
  terms of the ladder, only in terms of pack ids, scopes, and source kinds.

## Standards mapping

Not written. The table above is this repository's own actor/vector/control/residual model and
maps to no external control catalogue: there is no OWASP ASI mapping, no version-pinned
crosswalk, no NSA/CISA joint-guidance anchor, and no NIST AI RMF table anywhere in this tree.

It is listed here rather than omitted because an unstated obligation reads as one nobody
took on. Writing it needs the catalogue versions read and cited at a fixed date — a mapping
to "OWASP ASI" with no version is not a mapping — and a client set that has stopped moving.
The controls it would map already exist and are addressed above.

## Known gaps

One item on this page is an **accepted risk** rather than tracked work, and it is separated
from the table below so the difference is visible.

The documentation site under `website/` builds with Docusaurus, which reaches `image-size`
through its MDX loader. Two high-severity advisories describe denial of service through
infinite loops in that package's ICNS, JXL and HEIF parsers, and **no fixed version exists**:
both advisories publish no patched release, every published version including the newest is
in range, the upstream project is archived, and no Docusaurus release moves off it. It is
accepted rather than fixed because the exposure does not reach anyone installing this
package: `image-size` is a build-time dependency of the documentation site, absent from the
published npm package entirely, and the only images it parses are files committed to this
repository. Neither advisory has a remote-input path here. A community republish of the
package would silence the alert, and is deliberately not used — it carries no provenance
attestation, which is a bar this package meets for its own artifacts and will not waive for a
transitive one. **Re-open when** Docusaurus drops the dependency, an advisory publishes a
patched version, or the site starts parsing images it did not author.

Three gaps, tracked as work rather than accepted as risk:

| Gap | Why it is deferred |
|---|---|
| Ship the author-side signing step | The verifier is armed and the payload is specified, but nothing in this package produces a bundle: signing a pack is a manual step against `src/pack/trust.ts::sigstoreSignedPayload`, so the rung is checkable and not yet exercised by anything published here |
| Write the standards mapping above | Needs version-pinned catalogue reads against a final client set |
| Narrow the release runner's egress allowlists | Both release jobs block egress against a hand-written allowlist. It is a first pass reasoned from what each step contacts rather than from observed traffic — the wildcard covering the artifact hand-off between the two jobs especially — and the run insights from the first release are what narrow it |

A threat model over the emitted surfaces is a fourth item and is deliberately NOT on this
list as "re-run a pass": no threat-model document exists to re-run, and the table above is a
control inventory rather than one. Writing it is a separate, contested piece of work.

Until those land, read this page as the whole of the claim, and read the output the engine
writes into your repository as code you are responsible for.
