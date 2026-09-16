---
title: Security mapping
---

<!-- HAND-WRITTEN PAGE — verified against the tree at commit e79dcf0. Re-attested 2026-09-16 in the Package 14 rewrite. -->
<!-- Re-open when: a catalogue edition below moves, a control's implementing symbol moves, or a
     surface is added to or removed from the engine. `test/docsPages.test.ts` resolves every
     `file::symbol` address and pins the surface count, so it catches the last two, not the first. -->

# Security mapping

This page maps the controls stamity runs to the OWASP agentic, LLM and web lists, the NSA/CISA
and partner joint guidance, and the NIST AI RMF. A security reviewer reads it to learn which
catalogue item each control answers, what that control still leaves open, and which items
nothing here answers at all.

It is a mapping, not a certification. No auditor read it. No scheme recognizes it. Nothing below
claims conformance with anything. A mapping is a claim about vocabulary: that a control here
corresponds to an item there. What makes such a claim checkable is a pairing. One side names a
catalogue edition. The other names an address in this tree. Both are printed below.

[`SECURITY.md`](../SECURITY.md) is the other half. It is the control inventory: what is
defended, by which symbol, and what is not. Read it for what runs today. Read this page for the
catalogue item each of those controls answers.

## What the mapping covers

The subject is narrow, which is what keeps the crosswalk short. The engine runs no model. It
serves nothing over a network. It collects no telemetry. It renders configuration text for AI
coding clients, writes that text into a repository you point it at, and exits. Everything below
therefore maps a build-time generator's controls, not a deployed agent's.

[`GOVERNANCE.md`](../GOVERNANCE.md) reads the transparency obligations of EU AI Act Article 50,
applicable since 2026-08-02, as not applying to this project. Its reason: the project "is
not an AI system placed on the market: it generates configuration text for AI coding clients and
runs no model of its own." That reading re-opens there if the project ever ships a hosted
model-backed service, or publishes model-generated output to end users as its own.

One id collision is worth reading past. The verify skill's security reference,
`content/skills/st-verify/references/security.md`, borrows `A01`–`A10` and `ASI01`–`ASI10` as
finding vocabulary for the emitted security reviewer. It pins them to a different edition of the
web list than this page uses. That vocabulary is not this crosswalk. The ids below mean the
editions in the next section and nothing else.

## Which editions the ids below mean

Every catalogue here was read on 2026-09-14. An id means the edition named in this section. A
later printing of the same list does not move it. Only a dated re-read does.

### The OWASP agentic list

The 2026 list, published 2025-12-09 by the OWASP GenAI Security Project.

| Id | Title |
|---|---|
| ASI01 | Agent Goal Hijack |
| ASI02 | Tool Misuse |
| ASI03 | Identity & Privilege Abuse |
| ASI04 | Agentic Supply Chain Vulnerabilities |
| ASI05 | Unexpected Code Execution |
| ASI06 | Memory & Context Poisoning |
| ASI07 | Insecure Inter-Agent Communication |
| ASI08 | Cascading Failures |
| ASI09 | Human-Agent Trust Exploitation |
| ASI10 | Rogue Agents |

The titles are as the project's resource page rendered them on the read date. The ids are the
stable handle, and they are what the rows below map to. A title can be re-worded between
printings of one list.

### The OWASP LLM list

OWASP Top 10 for LLM Applications 2025.

| Id | Title |
|---|---|
| LLM01 | Prompt Injection |
| LLM02 | Sensitive Information Disclosure |
| LLM03 | Supply Chain |
| LLM04 | Data and Model Poisoning |
| LLM05 | Improper Output Handling |
| LLM06 | Excessive Agency |
| LLM07 | System Prompt Leakage |
| LLM08 | Vector and Embedding Weaknesses |
| LLM09 | Misinformation |
| LLM10 | Unbounded Consumption |

A later edition exists: the project's resource index carries an LLM Top 10 for 2026. This
mapping stays on the 2025 edition until a dated re-read moves it. That re-read is the first
re-open trigger at the top of this page.

### The OWASP web list

OWASP Top 10:2021. It is used only where a web category has a defensible reading for a CLI that
writes files and runs no server.

| Id | Item | How it is read here |
|---|---|---|
| A01 | Broken Access Control | Applicable, as filesystem and pack-write scope. |
| A02 | Cryptographic Failures | Partial. The Sigstore and OIDC channels only. |
| A03 | Injection | Not in the web sense. The agentic analogue is the deny-scan surface. |
| A04 | Insecure Design | Applicable, as design posture. |
| A05 | Security Misconfiguration | Applicable to the client configs this engine generates. |
| A06 | Vulnerable and Outdated Components | Applicable, through dependency pins. |
| A07 | Identification and Authentication Failures | Not applicable. There is no authentication surface. |
| A08 | Software and Data Integrity Failures | Applicable directly: signing, SHA-pinned actions, provenance. |
| A09 | Security Logging and Monitoring Failures | Largely not applicable. There is no logging surface, by design. |
| A10 | Server-Side Request Forgery | Not applicable. Nothing here takes a URL from a caller and fetches it. |

### The joint guidance

Two documents from NSA, CISA and partners.

| Document | Published |
|---|---|
| "Deploying AI Systems Securely" | 2024-04-15 |
| "AI Data Security: Best Practices for Securing Data Used to Train & Operate AI Systems" | 2025-05-22 |

Both are cited at title and date level, through their alert pages. The guidance bodies were not
retrieved for this mapping. No recommendation text is quoted from either, and no row claims
alignment with a numbered recommendation inside them. A row that names one names the document.
That is the strongest claim an unretrieved source supports.

### The NIST AI RMF

NIST AI 100-1, January 2023. Its four functions are GOVERN, MAP, MEASURE and MANAGE. The rows
below use these subcategories, quoted from that document.

| Subcategory | What it says |
|---|---|
| GOVERN 1.1 | "Legal and regulatory requirements involving AI are understood, managed, and documented." |
| GOVERN 1.3 | "Processes, procedures, and practices are in place to determine the needed level of risk management activities based on the organization's risk tolerance." |
| GOVERN 1.5 | "Ongoing monitoring and periodic review of the risk management process and its outcomes are planned and organizational roles and responsibilities clearly defined, including determining the frequency of periodic review." |
| GOVERN 1.6 | "Mechanisms are in place to inventory AI systems and are resourced according to organizational risk priorities." |
| GOVERN 2.1 | "Roles and responsibilities and lines of communication related to mapping, measuring, and managing AI risks are documented and are clear to individuals and teams throughout the organization." |
| MAP 1.1 | "Intended purposes, potentially beneficial uses, context-specific laws, norms and expectations, and prospective settings in which the AI system will be deployed are understood and documented." |
| MEASURE 2.7 | "AI system security and resilience – as identified in the MAP function – are evaluated and documented." |
| MANAGE 2.1 | "Resources required to manage AI risks are taken into account – along with viable non-AI alternative systems, approaches, or methods – to reduce the magnitude or likelihood of potential impacts." |
| MANAGE 3.1 | "AI risks and benefits from third-party resources are regularly monitored, and risk controls are applied and documented." |
| MANAGE 3.2 | "Pre-trained models which are used for development are monitored as part of AI system regular monitoring and maintenance." |

MAP 1.1 continues with a list of considerations in the source document. That list is not quoted
here.

### The generative-AI profile

NIST AI 600-1, July 2024. Three of its risks are mapped below: Confabulation, Information
Integrity and Information Security. Prompt injection is not a top-level risk name in that
document. It sits under Information Security, and under Value Chain and Component Integrity. The
injection rows below therefore name those rather than inventing an id.

## How to read a row

Each surface below is one table, and every row carries the same six columns.

| Column | What it tells you |
|---|---|
| Actor | Who is in a position to run the vector. |
| Vector | What that actor would do. |
| Control | What stops it, and the `file::symbol` address of the code that does the stopping. |
| Residual | What is still true after the control has run. |
| Mapped ids | The catalogue items the control answers. |
| Gap | Named when the surface is left open. Every gap is repeated in one list further down. |

Every address resolves to a declaration in this tree, and `test/docsPages.test.ts` checks each
one on every run. A control with no implementing symbol is written as a gap row, never as a
claim.

## The surfaces

Six surfaces belong to the engine. The seventh is the release publish path, which is a surface
of this repository rather than of the emitted setup.

### 1. Pack publishing and trust

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| Pack author | Publishes content that hashes to something other than what was reviewed | A four-tier ladder, pinned or refuse. Content off the catalog pin is refused, never downgraded. Code: `src/pack/trust.ts::resolveTrustTier` | A pin is only as good as the catalog that issued it, and nothing here attests the catalog | ASI04, LLM03, MANAGE 3.1, "Deploying AI Systems Securely" | No catalog attestation |
| Pack author | Declares a signature nothing checks | The declared claim is verified before any write. The signature covers the length-framed aggregate content hash and chains to the Sigstore trust root. Signer identity and issuer must match exactly. Code: `src/pack/trust.ts::verifyPublisherSignedClaim`, `src/pack/sigstoreVerifier.ts::verifySigstoreBundle` | Verification says who signed. It never says they were entitled to publish | ASI04, LLM03, GOVERN 1.6, MANAGE 3.2 | A signer is not an entitlement |
| Pack author | Runs code at install time | A per-file integrity map is required, and the npm lifecycle script names are banned outright. Code: `src/pack/manifest.ts::validatePackManifest`, `src/pack/manifest.ts::BANNED_LIFECYCLE_SCRIPTS` | The ban is by exact name, not by every name npm documents | ASI05, LLM03, A08 | The banlist is exact-name |
| Pack author | Writes outside the pack's own directory | Every pack-relative path is checked before it is joined. No absolute path passes, and no `..` escape. Code: `src/pack/permissions.ts::assertSafePackRelPath` | None | ASI05, A01 | None |
| Pack author | Claims a small footprint and ships a large one | The `permissions` block is validated at ingress. The tool footprint is cross-checked against every pack agent's declared capabilities, and installed bytes and file count are both bounded. Code: `src/pack/permissions.ts::readPermissions`, `src/pack/permissions.ts::checkAgentCapabilities`, `src/pack/manifest.ts::checkFootprint` | The `touchedPaths` half is disclosure, not a sandbox | ASI02, LLM06, MANAGE 3.1 | Declared paths are unverified |

### 2. Org install-source policy

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| The operator's org | Installs from a source the org has not approved | Source policy is evaluated before any install is attempted, by pack id, scope wildcard or source kind. A deny match wins. An `allow` list denies everything it does not name. Code: `src/pack/orgPolicy.ts::evaluatePackSource` | Policy is written in ids, scopes and kinds, never in trust tiers, so a minimum tier cannot be expressed | LLM03, GOVERN 1.3, MANAGE 3.1 | Tiers are not a policy lever |

### 3. Prompt injection and content integrity

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| Any text author | Reaches agent context with an instruction override, carried in generated content | A deny scan over four pattern sets. It runs against the raw copy and the normalized copy together, so a lookalike letter or a combining mark is not an evasion. Code: `src/denyscan/denyScan.ts::scanNormalized`, `src/denyscan/denyScan.ts::normalizeForDenyScan` | A pattern gate is a gate, not a proof | ASI01, LLM01, NIST AI 600-1 Information Integrity, MEASURE 2.7 | Detection is pattern-bound |
| Any text author | Writes a forged instruction into memory that a later session reads back as context | The learnings-and-handoff pattern set runs at both write gates and in the emitted session-start screen. Code: `src/denyscan/denyScan.ts::LEARNINGS_INJECTION_PATTERNS` | The same pattern bound, over a surface that is read once per session | ASI06, LLM01, NIST AI 600-1 Information Integrity, "AI Data Security" | Detection is pattern-bound |
| Any text author | Smuggles keywords past a human reader with invisible characters | The invisible-character class is stripped ahead of the write-path screens. Code: `src/denyscan/denyScan.ts::INVISIBLE_SMUGGLING_CHARS` | The Unicode tag block is excluded from that class by design, so a dedicated rule refuses the block on the raw text instead | ASI06, LLM01, NIST AI 600-1 Information Security | None |

### 4. MCP server trust

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| MCP server | Poisons a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission. Code: `src/mcp/descriptionScan.ts::scanMcpEntry` | Emission time only. It sees what the definition declared when it was written | ASI07, ASI02, LLM03 | None |
| MCP server | Redefines its tools after the operator approved them | None in this build. `src/mcp/descriptionScan.ts::hashToolManifest` and `src/mcp/descriptionScan.ts::detectToolManifestDrift` exist and are tested. No path records a hash at install, and no path compares one later | Redefinition after install is undetected | ASI07, ASI02, LLM03, MANAGE 3.1 | Drift detection is unwired |

### 5. Agent tool allowlists

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A generated agent | Uses a tool its role was never granted | A deny-by-default allowlist per agent. The roster is serialized into the policy document the emitted pre-tool-use guard reads, and the guard refuses with a machine-readable reason. Code: `src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER` | There is one enforcement point, and it runs in the client rather than here. On a client whose hook payload names no agent, the guard is telemetry | ASI03, ASI10, LLM06, GOVERN 2.1 | Enforcement is client-side only |
| A generated agent | The same, at an in-process delegation boundary | None in this build. `src/tools/allowlist.ts::checkToolAccess` is the check the emitted document is pre-sanitized to agree with, and nothing under `src/` calls it | A denial is one control, not a pair | ASI03, LLM06 | The in-process check is unwired |

### 6. Write-path integrity and payload bounds

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A concurrent writer, or anything sitting at the target path | Tears a write, redirects it through a symlink, or clobbers content the engine does not own | The temp file is created exclusively and without following links. The rename is atomic and runs under a cross-process lock. Content outside managed blocks is preserved and reclaimed. Code: `src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts::sweepReclaimCandidates` | None | A08, ASI08, MEASURE 2.7 | None |
| An agent | Pipes an unbounded payload through a write path | Stdin is read under a 250 000-byte ceiling. A payload past it is refused, never truncated. Code: `src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH` | The phase bounds beside it are dormant. `src/guard/promptGuard.ts::guardInput`, `src/guard/promptGuard.ts::validateAgentOutput`, `src/guard/promptGuard.ts::wrapWithBoundary` and `src/guard/promptGuard.ts::extractBoundedContent` have no caller outside their own module | LLM10, ASI08, MEASURE 2.7 | Phase IO bounds are dormant |
| Anyone reading the repo | Finds credentials committed into generated client config | MCP configs emit each dialect's own reference form rather than a literal value. Values are scanned for known secret shapes, and a finding prints masked. Code: `src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets` | Shape detection catches known shapes on sight, and nothing else | LLM02, A05, MEASURE 2.7 | Detection is shape-bound |

### 7. The release publish path

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A build-time dependency | Reaches the publishing credential | The job that builds does not hold it. The gate job, the isolated third-party route job and `publish` are separate jobs. `publish` takes no checkout, and it verifies the tarball hash against the gate job's output. Code: `.github/workflows/release.yml` | A compromised build dependency runs where no credential is | ASI04, LLM03, A08, MANAGE 3.1 | None |
| Anyone | Publishes a build nobody can trace to this repository | `npm publish --provenance` over OIDC trusted publishing. No long-lived token exists here, and third-party actions are SHA-pinned | The platform half is maintainer setup rather than a file: the required reviewer, the tag ruleset and the trusted-publisher entry. It is re-verified at each cut | ASI04, A06, A08, GOVERN 1.5, MANAGE 2.1 | The platform half is not code |

## Gaps this mapping leaves open

Every gap named in a row above, collected so the list reads without the tables.

1. **MCP tool-manifest drift detection is unwired.** The hash and compare functions exist and are
   tested. Nothing records a hash at install, and nothing compares one later.
2. **The in-process tool check is unwired.** The emitted client-side guard is the whole of the
   enforcement. On a client that names no agent in its hook payload, it reports rather than
   refuses.
3. **The phase IO bounds are dormant.** One byte ceiling has a production caller. The input,
   output and boundary-marker halves beside it reject nothing today.
4. **Declared pack permissions are unverified.** The `touchedPaths` half of a pack's
   `permissions` block is disclosure for a human to read. The tool-footprint half is verified.
5. **Trust tiers are not a policy lever.** The ladder classifies a pack. Policy is written in
   pack ids, scopes and source kinds, so "install nothing below `publisher-signed`" cannot be
   said.
6. **No catalog attestation.** A pin is trusted because the catalog issued it, and nothing here
   attests the catalog itself.
7. **A verified signature is not an entitlement.** The pin comes from the pack's own declared
   signer, so a pack naming its own author verifies whoever that is.

## What is not applicable, and why

**A07 Identification and Authentication Failures, and A10 Server-Side Request Forgery.** There is
no authentication surface, and no caller-supplied URL that the engine fetches. It has two network
paths. One is a signed-metadata fetch at verification time. The other is a `git fetch` against a
remote the repository already had.

**A09 Security Logging and Monitoring Failures, largely.** There is no logging or monitoring
surface, by design. No telemetry is collected and nothing is uploaded, so the category's controls
have nothing here to attach to. What replaces them is the artifact trail in this repository.

**LLM04 Data and Model Poisoning, LLM07 System Prompt Leakage, LLM08 Vector and Embedding
Weaknesses, and LLM09 Misinformation.** The engine trains nothing. It holds no system prompt of
its own at runtime, embeds nothing, and generates no prose a user consumes as an answer. It does
carry one adjacent risk: content it emits becomes context an agent later trusts. That risk is
mapped as injection under surface 3, rather than borrowed into these ids.

**ASI08 Cascading Failures and ASI10 Rogue Agents, in part.** Both describe a running multi-agent
system. What this repository can affect is the configuration such a system starts from. That is
why they appear against the write-path and allowlist rows, and nowhere else.

**GOVERN 1.1 and MAP 1.1** are answered by documents rather than by code. The Article 50 reading
in [`GOVERNANCE.md`](../GOVERNANCE.md) answers the first, and the scope statement at the top of
this page answers the second. They are listed because a crosswalk that silently drops the
subcategories it answers in prose reads as one that does not answer them at all.

**The Confabulation risk in NIST AI 600-1** is not a property of this engine's output, which is
deterministic text rendered from a corpus. It is a property of what the emitted setup's agents
produce. That is why the corpus carries an eval floor of its own, rather than a control row here.
