<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.9.0 release cut (2026-09-21). -->
<!-- Re-open when: a `file::symbol` address below stops resolving, a control in the table loses its
     last caller under `src/`, a new install route or execution surface ships, a control named under
     "Publishing this package" changes in `.github/workflows/release.yml`, or the crosswalk in
     `docs/security-mapping.md` stops agreeing with the table below. `test/docsPages.test.ts` fails on
     the first two and on a broken link to the fifth; `test/ci/workflow.test.ts` fails on the fourth. -->

# Security

This page is for a security reviewer deciding whether to trust stamity, and for anyone who found a
vulnerability in it. It states what the engine defends today, what it does not defend, and where to
send a report.

Every control below names a file and a symbol inside it, written `file::symbol`. Nothing here asks
you to take the claim on faith: `test/docsPages.test.ts` checks that each address exists and that
something under `src/` calls it. A claim that outlives its code fails the suite, not this page.

## How to report a vulnerability

Report it through
[GitHub private vulnerability reporting](https://github.com/zomarit/stamity/security/advisories/new).
Your report stays private to the maintainer until a fix ships. The advisory flow can request a CVE at
publication. Do not open a public issue for a vulnerability, and do not disclose it elsewhere first.
No email address is published for this. The advisory form is the channel.

Expect an acknowledgement within seven days. That is an estimate, not a funded SLA. One person
maintains this repository, and an honest number beats a response window nobody is on call for. There
is no bug bounty either: a report is acknowledged and fixed, not paid.

A useful report names the command you ran, the repository state you ran it in, what happened, and
what you expected instead. The CLI writes into the repository you point it at, plus the three paths
outside it named under "Network and data handling". So a scratch repository plus one command is
usually the whole reproduction.

One verb reaches further, and for it the reproduction is a scratch workspace root plus its members.
`stamity workspace sync` (`src/cli/commands/workspace.ts::runSync`) takes the nearest directory
holding a `workspace.json` regular file. It probes the current directory and then at most ten
ancestors above it, stopping earlier if the filesystem root arrives first
(`src/workspace/detect.ts::detectWorkspaceContext`). It writes into every member repository that
file's `repos[]` declares. Each member's `.stamity/manifest.json` is patched, and then that member's
own sync runs inside it. A cascade that is not a `--dry-run` preview also appends a crash journal at
`<root>/.stamity/workspace-sync-journal.jsonl` (`src/workspace/sync.ts::createJournal`).

## Supported versions

| Version | Supported |
|---|---|
| `1.x` | Yes — security fixes land on the latest `1.x` release. |
| `0.x` | No. Nothing before `1.0.0` is a supported build. |

## Where content comes from

Three sources install a PACK, and no more. Nothing on any of them is fetched over the network.

1. **Bundled first-party packs** shipped inside this package. They resolve through the curated
   catalog by bare id (`stamity add ops`).
2. **A local directory** named by a path-shaped spec (`stamity add ./packs/ops`). An explicit path
   always means the directory, even when a catalog entry shares its name.
3. **A package already present under `node_modules/`**, named by its package name
   (`stamity add @acme/ops`). This one is a real route, not a footnote. The default refusal coaches
   an operator toward it, and `--help` documents it.

Every route runs the same gate chain. The org trust policy narrows them
(`src/pack/orgPolicy.ts::evaluatePackSource`) — by pack id, by scope wildcard, or by source kind.

Since 1.9.0 there is a second way corpus content reaches a repository, and it is not a pack route:
a **client plugin**. Your client installs a plugin root from a marketplace you point it at, that
root carries the agents, skills, commands and hooks its container can hold, and it ships a bundled
copy of this engine that `stamity plugin setup` then runs to write the repository-owned half. What
checks that route is not the pack gate chain: it is the client's own install, plus the digest and
the provenance attestation the release attaches to each archive, plus the corpus this repository
publishes being the corpus the root was built from. So a plugin root is content you trust the way
you trust the marketplace that served it. The engine's own contribution is that `sync` writes
nothing under a class the installed root declares it carries, and that `stamity check` fails its
`plugin-runtime` row — and `plugin status` reports the compatibility state — when the resolved
runtime's major differs from the one that wrote your `.stamity/` state
(`src/cli/commands/check.ts::checkPluginRuntime`,
`src/cli/commands/plugin/status.ts::compatibilityOf`); the locator itself refuses only a missing
runtime or a Node below the floor (`scripts/plugins/locate.mjs`). [The plugins
guide](docs/plugins.md) states the whole boundary.

There are three kind tokens, not two: `local-path`, `npm-package` and `catalog-pinned`. The last is
granted only to a catalog install whose pin verified against the pack's aggregate content hash. So
`allow: ["catalog-pinned"]` is how an org permits nothing but the catalog. And `deny:
["catalog-pinned"]` is how it distrusts the curated list outright, rather than having that install
re-read as a local path. Deny wins. An `allow` list denies everything it does not name. Absent a
policy file, every route is open.

## What the engine defends today

Addresses are `file::symbol`, not `file:line`. A symbol survives an edit above it, and every one
below is asserted to exist by `test/docsPages.test.ts`.

| Actor | Vector | Control | Where | Residual |
|---|---|---|---|---|
| Pack author | Publishing content that hashes to something other than what was reviewed | Four-tier trust ladder, pinned-or-refuse. Content off the catalog pin is refused, never quietly downgraded | `src/pack/trust.ts::resolveTrustTier` | A pin is only as good as the catalog that issued it, and nothing here attests the catalog |
| Pack author | Declaring a signature nothing checks | A declared `sigstore` claim is verified before any write. `signing.signer` is REQUIRED: a claim that pins no identity is refused at ingress, never verified against an empty policy. The detached bundle must carry a signature over the pack's length-framed aggregate content hash, chain to the Sigstore trust root, and match that signer's identity and issuer exactly. A failed check refuses the install, and `--allow-untrusted` does not reach it | `src/pack/trust.ts::verifyPublisherSignedClaim`, `src/pack/sigstoreVerifier.ts::verifySigstoreBundle`, `src/pack/trust.ts::sigstoreSignedPayload` | Verification says WHO signed, never that they were entitled to publish — see below |
| Pack author | Running code at install time | A per-file SHA-256 integrity map is required, not optional. The npm lifecycle script names in `BANNED_LIFECYCLE_SCRIPTS` are banned outright by exact name: the install, prepare, pack, publish, uninstall, version, start/stop/restart and test hooks, plus `dependencies`. So installing never runs pack-authored code | `src/pack/manifest.ts::validatePackManifest`, `src/pack/manifest.ts::BANNED_LIFECYCLE_SCRIPTS` | The list is exact names, not every name npm documents: `preprepare` and `postprepare` are not on it. And nothing stops code that runs LATER — see "Hook and MCP execution" |
| Pack author | Writing outside the pack's own directory | Every pack-relative path is checked before it is joined. No absolute paths, and no `..` escape | `src/pack/permissions.ts::assertSafePackRelPath` | — |
| Pack author | Claiming a small footprint and shipping a large one | The `permissions` block is strictly validated at ingress, and a malformed declaration fails the load. The `toolFootprint` half is then cross-checked against every pack agent's `capabilities:` frontmatter. A capability the footprint does not name refuses the install before a byte lands, and so does content exceeding the pack's own declared `maxFootprintBytes` | `src/pack/permissions.ts::readPermissions`, `src/pack/permissions.ts::checkAgentCapabilities`, `src/pack/manifest.ts::checkFootprint` | Those two halves are the checked ones. The rest is DISCLOSURE, not a sandbox: nothing cross-checks `touchedPaths` against the files the pack actually ships |
| Operator's org | Installing from a source the org has not approved | Source policy evaluated before any install is attempted | `src/pack/orgPolicy.ts::evaluatePackSource` | Policy is written in pack ids, scopes and source kinds — never in trust tiers |
| Any text author | Prompt injection and instruction override reaching agent context | Deny-scan over four pattern sets: content, injection, learnings-and-handoff injection, and MCP poisoning. Each is scanned raw ∪ normalized, so a lookalike letter or a combining mark is not an evasion. The fourth set is the memory vector. A learning or a handoff is written once and read back as agent context in a later session. So a forged instruction header, a frontmatter head impersonating engine config, a forged managed-block marker or a cross-agent override is refused. The learnings and handoff write gates refuse it, and so does the emitted session-start screen | `src/denyscan/denyScan.ts::scanNormalized`, `src/denyscan/denyScan.ts::normalizeForDenyScan`, `src/denyscan/denyScan.ts::LEARNINGS_INJECTION_PATTERNS` | A pattern gate is a gate, not a proof |
| Any text author | Smuggling keywords past a reader with invisible characters | The invisible-character class is stripped ahead of the write-path screens — user content, pack bodies, learnings, handoffs — and by the emitted session-start screen, which embeds the same class (`src/hooks/scripts.ts`). The MCP metadata screens do not strip: a word-adjacent invisible run is rejoined for them by the normalized copy `scanNormalized` already scans | `src/denyscan/denyScan.ts::INVISIBLE_SMUGGLING_CHARS` | The class excludes the Unicode tag block deliberately, so `unicode-tag-smuggling` can refuse that block on the raw text. The prompt guard's own strip is unwired — see "Bounded phase IO" below |
| MCP server | Poisoning a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission | `src/mcp/descriptionScan.ts::scanMcpEntry` | A server that redefines its tools after install is NOT detected — see below |
| A generated agent | Using a tool its role was never granted | Deny-by-default per-agent allowlist over tool categories. The named roster is serialized into the policy document the emitted pre-tool-use guard reads, pre-sanitized to exactly what an access check would authorize. The guard refuses with a machine-readable reason code. On Claude Code its command is anchored on `${CLAUDE_PROJECT_DIR}` and fails closed: a guard that cannot launch exits 2 rather than letting the call through, which it did for every call after a `cd` out of the repository root before 1.9.0 | `src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER` | ONE enforcement point, and it is the emitted client-side guard — the in-process check is built but unwired, see below. On a client whose hook payload names no agent the guard is telemetry, and the fail-closed tail is unmeasured under the PowerShell fallback a Windows host with no Git Bash uses |
| An agent | Piping an unbounded payload through the `learn` or `handoff` write path | Stdin is read under a 250 000-byte ceiling and REJECTED past it, not truncated. On the `learn` and `handoff` read the bound counts bytes rather than characters, so a body of multi-byte UTF-8 is refused well short of that many characters. The same number is applied as a CHARACTER ceiling over a user-content overlay body. `stamity validate` reports a body past it as a finding, and the engine's read of that body refuses it | `src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH`, applied over stdin in `src/cli/commands/learn.ts` and `src/cli/commands/handoff.ts`, and as a character ceiling in `src/cli/commands/validate.ts` and `src/content/catalog.ts::readOverlayBody` | The 500 KB and 1 MB phase bounds beside it are unwired — see below |
| Concurrent writer, or anything at the target path | Torn writes, symlink redirection, clobbering content the engine does not own | Temp file created `O_EXCL \| O_NOFOLLOW`, plus an atomic rename under a cross-process lock. Content outside managed blocks is preserved and reclaimed | `src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts::sweepReclaimCandidates` | — |
| Anyone reading the repo | Credentials committed into generated config | MCP configs emit the reference form each dialect's own client resolves, never literal values. That is `${VAR}` for Claude Code, `${env:VAR}` for Cursor, `${input:<id>}` plus an `inputs` entry for VS Code, `$COPILOT_MCP_<VAR>` for Copilot, and the variable name alone for Codex. Values are scanned for known secret shapes and masked wherever a finding is printed | `src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets` | Shape detection catches known shapes on sight, and nothing else |

## Network and data handling

The engine performs no network I/O while it works, with the two exceptions named next. Nothing is
uploaded, and no telemetry or analytics is collected. The repository you ran the CLI in is where the
engine's outputs land.

In a single repository, exactly three paths write outside it:

- the startup update notice's stamp file, under your user cache directory
  (`src/cli/notice/updateNotice.ts::noticeCacheDir`);
- the Sigstore TUF metadata cache, under the platform's cache root
  (`src/pack/sigstoreVerifier.ts::sigstoreCachePath`);
- the checkouts `stamity worktree setup` makes in the farm directory beside the repository
  (`src/worktree/policy.ts::WORKTREE_FARM_DIR_NAME`). A farm inside the repository is refused.

At a workspace root, the `workspace sync` cascade also writes into the member repositories. That
cascade is described under "How to report a vulnerability". Nothing else the CLI produces leaves the
repository.

**Verifying a signed pack is the first exception.** Installing a pack that declares
`signing.method: "sigstore"` fetches the Sigstore project's trust root over TUF before the bundle is
checked (`src/pack/sigstoreVerifier.ts::verifySigstoreBundle`). The mirror is the client's default,
named in that file. It happens only then: `init`, `sync`, `check`, and every install of a pack that
declares no signature do not even load the client. No first-party pack declares one. Since 1.9.0
that client is an OPTIONAL dependency: npm installs it by default, and an install run with
`--omit=optional` cannot verify a signed pack at all, which refuses the install rather than passing
it ([the trust guide](docs/packs-and-trust.md) states both halves). The exchange
fetches signed metadata and sends nothing about you or the repository. The metadata is cached under
your user cache directory (`src/pack/sigstoreVerifier.ts::sigstoreCachePath`), never inside the
repository being installed into. A host that cannot reach the mirror gets a refusal, not a pass.

**`stamity worktree setup` is the second exception.** Resolving the branch plan runs
`git fetch origin <branch>` under a timeout (`src/worktree/git.ts::fetchBranch`). It does that only
when no local branch of the requested name exists and the repository has an `origin` remote. A
preview (`--dry-run`) never contacts it, and a transport failure refuses with `NETWORK_ERROR` rather
than guessing at the branch. The remote is the one your repository already had: the engine configures
none, runs no package manager, and fetches no pack content over it.

One further code path is network-capable, and it is not part of any command's work. The startup
update notice asks the public npm registry whether a version newer than the running one exists
(`src/cli/notice/updateNotice.ts`). It sends the package name and nothing else. It is bounded by a
1.5-second timeout, caches its answer for a day, fails silently, and never rewrites an install — the
answer is a banner. Set `STAMITY_NO_UPDATE_CHECK=1` to turn it off. `NO_UPDATE_NOTIFIER` and `CI` on
any non-empty value do the same.

## Publishing this package

A release is built and published by `.github/workflows/release.yml`. What a consumer can check are
properties of that file, rather than properties of a maintainer's laptop.

- **The job that builds does not hold the credential.** One job runs the build, the suite, the leak
  gate and the packed-artifact smoke on the shipping commit. An isolated `apm-route` job runs the
  third-party APM interpreter without publishing credentials and without access to the tarball. The
  `publish` job holds the publishing credential and takes no checkout of this repository. Its whole
  tool surface is four SHA-pinned actions — harden-runner, setup-node, download-artifact and
  attest-build-provenance — plus npm (which the job first upgrades by one registry download
  pinned to the exact version 12.0.2 and asserts against the trusted-publishing floor before
  use), the GitHub CLI, `node` running programs written inline in the workflow, POSIX shell with
  `sha256sum`, and **git**, which is the tool that writes to the remote:
  the distribution branch and its tag are pushed out of a repository this job creates inside the
  artifact it has just verified (`git init`, one orphan commit whose dates come from the manifest,
  then `git push --force` over a token-bearing https remote). It verifies the tarball's SHA-256
  against the first job's OUTPUT, a channel separate from the artifact under verification, and the
  plugin distribution's manifest the same way. So a compromised build-time dependency runs in the
  job that has no credential.
- **No stored npm token.** Publishing is `npm publish --provenance` over GitHub OIDC trusted
  publishing. The publishing job mints a short-lived credential per run, so there is no long-lived
  publishing credential in this repository to leak or to rotate.
- **A run that can publish must come from a `v*` tag.** The tag's name must equal the version
  `package.json` declares, and its commit must be reachable from `main`. All three proofs run before
  the pack step, on a tag push and on a maintainer-dispatched release alike. A dispatch from a branch
  fails there. A rehearsal dispatch runs every release gate, publishes nothing, and prints the
  proofs it skipped.
- **The GitHub release carries the bytes.** It carries the tarball, its SHA-256 in the release body,
  and a CycloneDX SBOM when generation succeeds. When generation does not succeed, the body states
  the SBOM is absent.
- **The plugin distribution is verified before it is published, and history is never overwritten.**
  Since 1.9.0 the same run publishes four client plugin archives, a `plugin-dist` branch and a
  `plugins/v<version>` tag. Every archive is checked against the manifest the gates job published
  on the outputs channel before the npm publish runs, so a missing or corrupt artifact refuses
  ahead of the one irreversible step; each archive then carries a build-provenance attestation
  minted over the same OIDC identity. The branch is replaced by a single orphan commit whose git
  dates come from the manifest, so a re-run reproduces one sha — and the push refuses three
  states: a tag whose name is not `<namespace>/v<version>` for the version the gates job emitted,
  so the manifest's word for where to push is checked for shape rather than trusted; a remote head
  that carries a parent, because a head with history is a source branch whatever the manifest
  called it; and a release tag that already names a different commit.

What no file here can do is the platform half, and that is maintainer setup rather than code. It is
three things. A required reviewer on the `npm-publish` deployment environment, a `v*` tag ruleset,
and the trusted-publisher entry on the registry. That entry names this repository, this workflow
file and that environment.

Each of those is now in force: the `npm-publish` environment requires a reviewer before a
publish runs, the `v*` tag ruleset governs release-tag creation, update and deletion, and the
registry's trusted-publisher entry is configured, so published versions authenticate over OIDC
and carry npm provenance rather than a stored token. Every step that depends on one says so
where it depends on it.

## What it does not defend

- **Privilege.** The CLI runs as you, with your filesystem rights, in a repository you point it at.
  It is not a sandbox and does not pretend to be one.
- **Hook and MCP execution.** The engine writes hook scripts and hook CONFIG. Your AI client runs
  them, with your privileges. Reading `.stamity/generated/hooks/` covers only the scripts this engine
  generates. What decides whether a command runs at all is the client's own config. There are four
  of those: `.claude/settings.json`, `.cursor/hooks.json`, `.github/hooks/stamity.json` and
  `.codex/hooks.json`. A hook a PACK supplies lands in one of them, never under
  `.stamity/generated/`. On Codex, three things decide it rather than one. The first is
  `features.hooks = true` in `.codex/config.toml`, which this engine emits; the vendor states no
  default. The second is the project's trust level. The third is the per-hook review through
  the interactive `/hooks` command, or `--dangerously-bypass-hook-trust` for automation that cannot
  take that step. With all three in place, headless `codex exec` on codex-cli 0.154.0 loaded no
  project hook layer at all in the 2026-09-15 measurement. So a hook on that client is enforcement
  in the interactive session and nothing in the headless lane (`src/adapters/codex.ts`, the
  `hook enforcement` fact).
  An MCP server definition likewise becomes a launcher your editor spawns at start-up. Read all
  five, and read the `runs on this machine` block `stamity add` prints before accepting a pack.
- **Who a signature names.** A verified bundle proves that an identity signed exactly these bytes. It
  does not prove that identity was entitled to publish this pack. The pin comes from the pack's own
  `signing.signer`, so a pack naming its own author verifies whoever that is. There is no
  authorization model, no publisher registry, and no revocation list beyond what the Sigstore trust
  root itself carries. Read a `publisher-signed` tier as an attributable signature, not as an
  endorsement.
- **Verification without the network.** The trust root is fetched at verification time, so a host
  that cannot reach the mirror cannot check a signature. That path refuses rather than passing, which
  is the safe direction. It does mean an offline machine cannot install a signed pack at all.
  `src/pack/trust.ts::notYetArmedSigstoreVerifier` is the honest stand-in for a caller that injects a
  verifier which cannot judge. Nothing selects it on its own, and a build whose `sigstore` dependency
  is broken refuses too.
- **A second, in-process tool check.** One thing stands between a running agent and a tool call, and
  it is the guard script your client runs. `src/tools/allowlist.ts::checkToolAccess` is the in-process
  check the emitted policy document is pre-sanitized to agree with, and it has no production caller.
  Nothing calls it at a delegation boundary, and it refuses nothing outside this repository's own
  suite. Read a denial as one control, not as a pair.
- **Bounded phase IO.** `src/guard/promptGuard.ts` defines a 500 KB phase-input bound, a 1 MB
  agent-output bound, and boundary-marker wrapping. Only `MAX_USER_CONTENT_LENGTH` above has
  production callers: the overlay path applies it as a 250 000-character ceiling, and the
  `learn` and `handoff` stdin reads apply it as a byte one. `guardInput`, `validateAgentOutput`,
  `wrapWithBoundary` and `extractBoundedContent` have none outside their own module, and reject
  nothing today.
- **MCP tool-manifest drift.** `hashToolManifest` and `detectToolManifestDrift` exist and are tested,
  and nothing calls them. No path records a manifest hash at install, and no path compares one later.
  A server that redefines its tools after you approved it is not detected in this build.
- **Pattern gates are gates, not proofs.** Deny-scan and secret-shape detection catch known shapes on
  sight. Neither is evidence that a file is clean.
- **Declared pack permissions.** The `permissions` block's `touchedPaths` half says what a pack
  intends to touch. Nothing verifies that claim against the shipped files, and nothing refuses an
  install for exceeding it. That half is disclosure for a human to read, not a sandbox, so treat it
  the way you would treat a pack's README. The `toolFootprint` half is verified: a pack agent
  declaring a capability the footprint does not name refuses the install
  (`src/pack/permissions.ts::checkAgentCapabilities`).
- **Trust tiers as a policy lever.** The trust ladder classifies a pack; org policy decides which
  SOURCES may install. There is no "minimum tier" setting. Policy cannot be written in terms of the
  ladder, only in terms of pack ids, scopes and source kinds.

## Standards mapping

[`docs/security-mapping.md`](docs/security-mapping.md), written 2026-09-15, crosswalks the table
above to external catalogues. They are the OWASP agentic list, the OWASP LLM list, the OWASP web
list, the NSA/CISA and partner joint guidance, and the NIST AI RMF with its generative-AI profile. It
is version-pinned to the editions it names, each read on a stated date. A mapping to "OWASP ASI"
with no version is a mapping to whatever that list says today.

It is a mapping, not a certification: no auditor read it, no scheme recognizes it, and it claims
conformance with nothing. What it adds to this page is the other direction. It states seven surfaces
as actor/vector/control/residual rows, carrying the catalogue ids each control answers to, and it
collects the gaps those rows leave open into one list.

OWASP ids also occur here as borrowed vocabulary rather than as a crosswalk. `A01`–`A10` and
`ASI01`–`ASI10` are the finding vocabulary the emitted security reviewer writes in, and the category
labels on the verify skill's security-axis checks
(`content/skills/st-verify/references/security.md`). `LLM01` appears in the deny-scan module header.
Those labels carry their own edition pin, which is not the one the mapping page uses. That page says
so where it says which edition each id belongs to.

## What is still open

One item here is an **accepted risk** rather than tracked work. It is separated from the table below
so the difference is visible.

The documentation site under `website/` builds with Docusaurus, which reaches `image-size` through
its MDX loader. Two high-severity advisories describe denial of service through infinite loops in
that package's ICNS, JXL and HEIF parsers, and **no fixed version exists**. Both advisories publish
no patched release, every published version including the newest is in range, the upstream project is
archived, and no Docusaurus release moves off it. Rechecked 2026-09-10: Docusaurus stable remains
3.10.2, with v4 GA still unavailable, and both advisories still list no patched version
([dated primary sources](.github/release-egress.md)).

It is accepted rather than fixed because the exposure does not reach anyone installing this package.
`image-size` is a build-time dependency of the documentation site, absent from the published npm
package entirely, and the only images it parses are files committed to this repository. Neither
advisory has a remote-input path here. A community republish of the package would silence the alert,
and is deliberately not used. It carries no provenance attestation. That is a bar this package meets
for its own artifacts, and will not waive for a transitive one. **Re-open when** Docusaurus drops the
dependency, an advisory publishes a patched version, or the site starts parsing images it did not
author.

Below is implementation and the proofs that closed it, tracked separately from accepted risk. Both
rows shipped their proof at 1.7.0. Each names the run that carries it, so you can open the run rather
than take the sentence.

| Work | Current boundary |
|---|---|
| Pack-author signing | `scripts/sign-pack.mjs` signs the existing payload, verifies the declared identity and writes the detached bundle atomically. See [the author workflow](docs/packs-and-trust.md). Local cryptographic fixtures substitute the external identity service in the suite. The authenticated live-signing proof is closed: the [rehearsal on the 1.7.0 candidate](https://github.com/zomarit/stamity/actions/runs/34758487370) signed with a real GitHub OIDC and Sigstore identity and passed its negative controls. Its artifacts are archived under `.stamity/runs/2026-09-14_package-11/evidence/`. Every rehearsal run is public in two ways, by design: it writes two entries to the public Sigstore transparency log under this repository's workflow identity, and it uploads the signed fixture packs as run artifacts. Those packs hold one throwaway rule file and no product content, and the rehearsal publishes nothing else |
| Release egress | `gates`, `apm-route` and `publish` use fail-closed per-job policies. Artifact storage is limited to the current official GitHub account roster. [Endpoint evidence and proof boundaries](.github/release-egress.md) distinguish implementation, changed-job rehearsal and the final credential-bearing publish path. That last boundary is closed: the [1.7.0 release run](https://github.com/zomarit/stamity/actions/runs/34771477218) published over OIDC with provenance, confirmed by the post-publication verifier. The rehearsal-only summary executes no third-party code |

A threat model over the emitted surfaces was a third item on this list, and it has come off. The
seven-surface actor/vector/control/residual table with its mapped ids is written, in
[`docs/security-mapping.md`](docs/security-mapping.md). The table on this page stays what it was, a
control inventory. The mapping is the model beside it, and it is re-run when a catalogue edition
moves or a control's implementing symbol does. Its own re-open trigger names both.

What that page does not do is close the gaps it names. Those are the ones under "What it does not
defend" above, stated there first. Read this page as the whole of the claim, and read the output the
engine writes into your repository as code you are responsible for.
