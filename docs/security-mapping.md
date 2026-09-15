---
title: Security mapping
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.8.0 release cut (2026-09-15). -->
<!-- Re-open when: a catalogue edition below moves, a control's implementing symbol moves or
     loses its last production caller, or a surface is added to or removed from the engine.
     `test/docsPages.test.ts` resolves every `file::symbol` address here and pins the surface
     count, so it fails on the second and the third; the first is a calendar fact no suite sees. -->

# Security mapping

## What this is, and is not

A version-pinned crosswalk between the controls this repository implements and four external
catalogues, read on a stated date. [`SECURITY.md`](../SECURITY.md) is the control inventory —
what is defended, by which symbol, and what is not. This page is the second half: which
catalogue item each of those controls answers to, what is left over when it has run, and which
items nothing here answers at all.

It is a mapping, not a certification. No auditor read it, no scheme recognizes it, and nothing
below claims conformance with anything. A mapping is a claim about vocabulary — that a control
here corresponds to an item there — and the only thing that makes it checkable is the pairing
of an edition on one side with an address in this tree on the other. Both are printed.

The subject is narrow, which is what makes the crosswalk short. The engine runs no model, it
serves nothing over a network, and it collects no telemetry: it renders configuration text for
AI coding clients, writes it into a repository you point it at, and exits. The transparency
obligations of EU AI Act Article 50, applicable since 2026-08-02, are read in
[`GOVERNANCE.md`](../GOVERNANCE.md) as not applying to this project, "because it is not an AI
system placed on the market: it generates configuration text for AI coding clients and runs no
model of its own" — re-openable there if the project ever ships a hosted model-backed service
or publishes model-generated output to end users as its own. Everything below is therefore a
mapping of a *build-time generator's* controls, not of a deployed agent's.

One id collision to read past: `content/skills/st-verify/references/security.md` borrows
`A01`–`A10` and `ASI01`–`ASI10` as finding vocabulary for the emitted security reviewer, pinned
to a different edition of the web list than this page uses. That vocabulary is not this
crosswalk. The ids below mean the editions named in the next section and nothing else.

## Catalogue editions read on 2026-09-14

- **OWASP Top 10 for Agentic Applications** — the 2026 list, published 2025-12-09 by the OWASP
  GenAI Security Project. Ids and titles: ASI01 Agent Goal Hijack, ASI02 Tool Misuse, ASI03
  Identity & Privilege Abuse, ASI04 Agentic Supply Chain Vulnerabilities, ASI05 Unexpected Code
  Execution, ASI06 Memory & Context Poisoning, ASI07 Insecure Inter-Agent Communication, ASI08
  Cascading Failures, ASI09 Human-Agent Trust Exploitation, ASI10 Rogue Agents. The titles are
  as the project's resource page rendered them on the read date; the **ids** are the stable
  handle and are what the rows below map to, because a title can be re-worded between printings
  of one list.
- **OWASP Top 10 for LLM Applications 2025** — LLM01 Prompt Injection, LLM02 Sensitive
  Information Disclosure, LLM03 Supply Chain, LLM04 Data and Model Poisoning, LLM05 Improper
  Output Handling, LLM06 Excessive Agency, LLM07 System Prompt Leakage, LLM08 Vector and
  Embedding Weaknesses, LLM09 Misinformation, LLM10 Unbounded Consumption. A later edition of
  this list exists — the project's resource index carries an LLM Top 10 for 2026 — and this
  mapping stays pinned to the 2025 edition until a dated re-read moves it, which is the first
  re-open trigger at the top of this page.
- **OWASP Top 10:2021** — the web list, used only where a web category has a defensible reading
  for a CLI that writes files and runs no server. Per item: A01 Broken Access Control —
  applicable, as filesystem and pack-write scope; A02 Cryptographic Failures — partial, the
  Sigstore and OIDC channels only; A03 Injection — not in the web sense, and the agentic
  analogue is the deny-scan surface; A04 Insecure Design — applicable as design posture; A05
  Security Misconfiguration — applicable to the client configs this engine generates; A06
  Vulnerable and Outdated Components — applicable through dependency pins; A07 Identification
  and Authentication Failures — not applicable, there is no authentication surface; A08 Software
  and Data Integrity Failures — applicable directly (signing, SHA-pinned actions, provenance);
  A09 Security Logging and Monitoring Failures — largely not applicable, there is no logging
  surface by design; A10 Server-Side Request Forgery — not applicable, nothing here takes a
  URL from a caller and fetches it.
- **NSA/CISA and partner joint guidance** — "Deploying AI Systems Securely" (2024-04-15) and
  "AI Data Security: Best Practices for Securing Data Used to Train & Operate AI Systems"
  (2025-05-22), cited at title and date level through their alert pages. The guidance bodies
  were not retrieved for this mapping, so no recommendation text is quoted from either and no
  row claims alignment with a numbered recommendation inside them. A row that names one names
  the document, which is the strongest claim an unretrieved source supports.
- **NIST AI RMF 1.0** — NIST AI 100-1, January 2023; functions GOVERN, MAP, MEASURE, MANAGE.
  The subcategories the rows below use, quoted from that document: GOVERN 1.1 "Legal and
  regulatory requirements involving AI are understood, managed, and documented."; GOVERN 1.3
  "Processes, procedures, and practices are in place to determine the needed level of risk
  management activities based on the organization's risk tolerance."; GOVERN 1.5 "Ongoing
  monitoring and periodic review of the risk management process and its outcomes are planned and
  organizational roles and responsibilities clearly defined, including determining the frequency
  of periodic review."; GOVERN 1.6 "Mechanisms are in place to inventory AI systems and are
  resourced according to organizational risk priorities."; GOVERN 2.1 "Roles and responsibilities
  and lines of communication related to mapping, measuring, and managing AI risks are documented
  and are clear to individuals and teams throughout the organization."; MAP 1.1 "Intended
  purposes, potentially beneficial uses, context-specific laws, norms and expectations, and
  prospective settings in which the AI system will be deployed are understood and documented."
  (the subcategory continues with a list of considerations, not quoted here); MEASURE 2.7 "AI
  system security and resilience – as identified in the MAP function – are evaluated and
  documented."; MANAGE 2.1 "Resources required to manage AI risks are taken into account – along
  with viable non-AI alternative systems, approaches, or methods – to reduce the magnitude or
  likelihood of potential impacts."; MANAGE 3.1 "AI risks and benefits from third-party resources
  are regularly monitored, and risk controls are applied and documented."; MANAGE 3.2
  "Pre-trained models which are used for development are monitored as part of AI system regular
  monitoring and maintenance."
- **NIST AI 600-1**, the Generative AI Profile, July 2024. The three risks this page maps to are
  Confabulation, Information Integrity and Information Security. Prompt injection is not a
  top-level risk name in that document — it sits under Information Security and under Value Chain
  and Component Integrity — so the injection rows below name those rather than inventing an id.

## The surfaces

Six surfaces of the engine, plus the release publish path, which is a surface of this repository
rather than of the emitted setup. Every `file::symbol` address resolves to a declaration in this
tree, checked by `test/docsPages.test.ts`; a control with no implementing symbol is written as a
gap row, never as a claim.

### 1. Pack publishing and trust

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| Pack author | Publishing content that hashes to something other than what was reviewed | Four-tier ladder, pinned-or-refuse — content off the catalog pin is refused, never downgraded (`src/pack/trust.ts::resolveTrustTier`) | A pin is only as good as the catalog that issued it, and nothing here attests the catalog | ASI04, LLM03, MANAGE 3.1, "Deploying AI Systems Securely" | Gap: no catalog attestation |
| Pack author | Declaring a signature nothing checks | The declared claim is verified before any write: signature over the length-framed aggregate content hash, chained to the Sigstore trust root, signer identity and issuer matched exactly (`src/pack/trust.ts::verifyPublisherSignedClaim`, `src/pack/sigstoreVerifier.ts::verifySigstoreBundle`) | Verification says WHO signed, never that they were entitled to publish | ASI04, LLM03, GOVERN 1.6, MANAGE 3.2 | Gap: signer is not entitlement |
| Pack author | Running code at install time | Per-file integrity map required, and the npm lifecycle script names are banned outright (`src/pack/manifest.ts::validatePackManifest`, `src/pack/manifest.ts::BANNED_LIFECYCLE_SCRIPTS`) | The ban is by exact name, not by every name npm documents | ASI05, LLM03, A08 | Gap: exact-name banlist |
| Pack author | Writing outside the pack's own directory | Every pack-relative path is checked before it is joined — no absolute path, no `..` escape (`src/pack/permissions.ts::assertSafePackRelPath`) | — | ASI05, A01 | — |
| Pack author | Claiming a small footprint and shipping a large one | The `permissions` block is validated at ingress and the tool footprint is cross-checked against every pack agent's declared capabilities (`src/pack/permissions.ts::readPermissions`, `src/pack/permissions.ts::checkAgentCapabilities`, `src/pack/manifest.ts::checkFootprint`) | The `touchedPaths` half is disclosure, not a sandbox | ASI02, LLM06, MANAGE 3.1 | Gap: declared paths unverified |

### 2. Org install-source policy

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| Operator's org | Installing from a source the org has not approved | Source policy is evaluated before any install is attempted, by pack id, scope wildcard or source kind; deny wins and an `allow` list denies everything it does not name (`src/pack/orgPolicy.ts::evaluatePackSource`) | Policy is written in ids, scopes and kinds — never in trust tiers, so "minimum tier" is not expressible | LLM03, GOVERN 1.3, MANAGE 3.1 | Gap: tiers are not a policy lever |

### 3. Prompt injection and content integrity

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| Any text author | Instruction override reaching agent context through generated content | Deny-scan over four pattern sets, run against the raw and the normalized copy together, so a lookalike letter or a combining mark is not an evasion (`src/denyscan/denyScan.ts::scanNormalized`, `src/denyscan/denyScan.ts::normalizeForDenyScan`) | A pattern gate is a gate, not a proof | ASI01, LLM01, NIST AI 600-1 Information Integrity, MEASURE 2.7 | Gap: detection is pattern-bound |
| Any text author | Writing a forged instruction into memory that a later session reads back as context | The learnings-and-handoff set is applied at both write gates and by the emitted session-start screen (`src/denyscan/denyScan.ts::LEARNINGS_INJECTION_PATTERNS`) | Same pattern bound, over a surface that is read once per session | ASI06, LLM01, NIST AI 600-1 Information Integrity, "AI Data Security" | Gap: detection is pattern-bound |
| Any text author | Smuggling keywords past a human reader with invisible characters | The invisible-character class is stripped ahead of the write-path screens (`src/denyscan/denyScan.ts::INVISIBLE_SMUGGLING_CHARS`) | The Unicode tag block is excluded by design, so a dedicated rule can refuse that block on the raw text | ASI06, LLM01, NIST AI 600-1 Information Security | — |

### 4. MCP server trust

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| MCP server | Poisoning a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission (`src/mcp/descriptionScan.ts::scanMcpEntry`) | Emission-time only: it sees what the definition declared when it was written | ASI07, ASI02, LLM03 | — |
| MCP server | Redefining its tools after the operator approved them | None in this build. `src/mcp/descriptionScan.ts::hashToolManifest` and `src/mcp/descriptionScan.ts::detectToolManifestDrift` exist and are tested; no path records a hash at install and no path compares one later | Post-install redefinition is undetected | ASI07, ASI02, LLM03, MANAGE 3.1 | Gap: drift detection unwired |

### 5. Agent tool allowlists

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| A generated agent | Using a tool its role was never granted | Deny-by-default per-agent allowlist: the roster is serialized into the policy document the emitted pre-tool-use guard reads, and the guard refuses with a machine-readable reason (`src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER`) | ONE enforcement point, and it runs in the client rather than here. On a client whose hook payload names no agent, the guard is telemetry | ASI03, ASI10, LLM06, GOVERN 2.1 | Gap: client-side enforcement only |
| A generated agent | The same, at an in-process delegation boundary | None in this build. `src/tools/allowlist.ts::checkToolAccess` is the check the emitted document is pre-sanitized to agree with, and nothing under `src/` calls it | A denial is one control, not a pair | ASI03, LLM06 | Gap: in-process check unwired |

### 6. Write-path integrity and payload bounds

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| Concurrent writer, or anything at the target path | Torn writes, symlink redirection, clobbering content the engine does not own | Temp file created exclusively and without following links, atomic rename under a cross-process lock, and content outside managed blocks preserved and reclaimed (`src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts::sweepReclaimCandidates`) | — | A08, ASI08, MEASURE 2.7 | — |
| An agent | Piping an unbounded payload through a write path | Stdin is read under a 250 000-byte ceiling and rejected past it, never truncated (`src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH`) | The phase bounds beside it are dormant: `src/guard/promptGuard.ts::guardInput`, `src/guard/promptGuard.ts::validateAgentOutput`, `src/guard/promptGuard.ts::wrapWithBoundary` and `src/guard/promptGuard.ts::extractBoundedContent` have no caller outside their module | LLM10, ASI08, MEASURE 2.7 | Gap: phase IO bounds dormant |
| Anyone reading the repo | Credentials committed into generated client config | MCP configs emit each dialect's own reference form rather than a literal, and values are scanned for known secret shapes and masked wherever a finding prints (`src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets`) | Shape detection catches known shapes on sight, and nothing else | LLM02, A05, MEASURE 2.7 | Gap: detection is shape-bound |

### 7. The release publish path

| Actor | Vector | Control (path) | Residual | Mapped ids | Gap or not applicable |
|---|---|---|---|---|---|
| A build-time dependency | Reaching the publishing credential | The job that builds does not hold it: gates, the isolated third-party route job and `publish` are separate jobs, `publish` takes no checkout and verifies the tarball hash against the gate job's output (`.github/workflows/release.yml`) | A compromised build dependency runs where no credential is | ASI04, LLM03, A08, MANAGE 3.1 | — |
| Anyone | Publishing a build nobody can trace to this repository | `npm publish --provenance` over OIDC trusted publishing, so no long-lived token exists here, and third-party actions are SHA-pinned | The platform half — required reviewer, tag ruleset, trusted-publisher entry — is maintainer setup, re-verified at each cut rather than proven by a file | ASI04, A06, A08, GOVERN 1.5 | Gap: platform half is not code |

## Gaps, stated

Every gap named in a row above, collected so the list can be read without the tables:

1. **MCP tool-manifest drift detection is unwired.** The hash and compare functions exist and are
   tested; nothing records a hash at install and nothing compares one later.
2. **The in-process tool check is unwired.** The emitted client-side guard is the whole of the
   enforcement, and on a client that names no agent in its hook payload it reports rather than
   refuses.
3. **The phase IO bounds are dormant.** One byte ceiling has a production caller; the input,
   output and boundary-marker halves beside it reject nothing today.
4. **Declared pack permissions are unverified.** The `touchedPaths` half of a pack's `permissions`
   block is disclosure for a human to read. The tool-footprint half is verified.
5. **Trust tiers are not a policy lever.** The ladder classifies a pack; policy is written in pack
   ids, scopes and source kinds, so "install nothing below `publisher-signed`" cannot be said.
6. **No catalog attestation.** A pin is trusted because the catalog issued it, and nothing here
   attests the catalog itself.
7. **A verified signature is not an entitlement.** The pin comes from the pack's own declared
   signer, so a pack naming its own author verifies whoever that is.

## Not applicable, and why

- **A07 Identification and Authentication Failures, and A10 Server-Side Request Forgery.** There
  is no authentication surface and no caller-supplied URL that the engine fetches. The two
  network paths it does have are a signed-metadata fetch at verification time and a `git fetch`
  against a remote the repository already had.
- **A09 Security Logging and Monitoring Failures, largely.** There is no logging or monitoring
  surface by design: no telemetry is collected and nothing is uploaded, so the category's controls
  have nothing here to attach to. What replaces them is the artifact trail in this repository.
- **LLM04 Data and Model Poisoning, LLM07 System Prompt Leakage, LLM08 Vector and Embedding
  Weaknesses, LLM09 Misinformation.** The engine trains nothing, holds no system prompt of its
  own at runtime, embeds nothing and generates no prose a user consumes as an answer. The
  adjacent risk it does carry — content it emits becoming context an agent later trusts — is
  mapped as injection under surface 3 rather than borrowed into these ids.
- **ASI08 Cascading Failures and ASI10 Rogue Agents, in part.** These describe a running
  multi-agent system. What this repository can affect is the configuration such a system starts
  from, which is why they appear against the write-path and allowlist rows and nowhere else.
- **NIST AI RMF GOVERN 1.1 and MAP 1.1** are answered by documents rather than by code: the Article
  50 reading in [`GOVERNANCE.md`](../GOVERNANCE.md) and the scope statement at the top of this
  page. They are listed because a crosswalk that silently drops the subcategories it answers in
  prose reads as one that does not answer them at all.
- **The NIST AI 600-1 Confabulation risk** is not a property of this engine's output — it renders
  deterministic text from a corpus — but it is a property of what the emitted setup's agents
  produce, which is why the corpus carries an eval floor of its own rather than a control row here.
