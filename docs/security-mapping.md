---
title: Security mapping
---

<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.15.0 release cut (2026-10-15). -->
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
| A09 | Security Logging and Monitoring Failures | Not applicable as written. There is no logging surface, by design. This repository's artifact trail is what stands in its place. |
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
of this repository rather than of the emitted setup. Its last row is the one exception: the call
a fork's emitted setup makes to fetch the package that path publishes.

### 1. Pack publishing and trust

Since 1.9.0 the Sigstore client is an **optional** dependency of this package, so an install run
with `--omit=optional` carries no verifier — and the control below still holds: a build that
cannot load the client **refuses** the claim — never a pass, and never the pin-waivable
`unarmed` (`src/pack/sigstoreVerifier.ts`).

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
| A pull request author | Drops a client with its guards, or moves the pinned release, and `check` stays green | `check --expect-version` and `--expect-tools` take the expected release and clients from the caller and fail with `EXPECTATION_ERROR`. Code: `src/cli/commands/check.ts::evaluateExpectations` | Only as strong as its caller: without the flags, or with values the pull request can edit, `check` trusts the committed manifest | A05, A08, ASI04, GOVERN 1.5 | None |
| A pull request author, or an agent working on a change | Lowers the checks its own change gets by editing the class file inside that change | `gate classify` names the class a flow's gates follow, and with a `--base` that resolves it reads `.stamity/change-classes.json` only as the base commit's blob, never the head's copy or the work tree's. A change to the file is `security-sensitive` by a built-in rule, a base copy the validator refuses applies only its raising entries, and a read that fails never gives a class below `product`: a change git could not read gets `product` with no lens, and a failed read of its lines `security-sensitive`. Code: `src/cli/commands/gate.ts::readBaseClassFile`, `src/change/classify.ts::parseClassFile` | Only as strong as its caller: the verb names a class and runs no gate, and the base is the caller's word, so a base that already holds the change's edit to the class file reads that edit. A change git could not read gets `product`, below the class its paths might have earned, and with it no security lens: `/st-work` runs that lens at every tier when the `reason` names a failed read; `/st-quick` then moves to `/st-work` only a batch with a path the security agent's trigger table names, and any other batch stays in the quick lane, where no lens runs; and a caller that reads the class alone gets no lens. Two known residuals in 1.15.0, each tracked in `.stamity/inbox.md` as the row named, both in the line rules: the `secret-name` rule misses a match longer than 1 024 characters that straddles the edge of one of its windows (`2026-10-08_product-core/review/139`), and no line rule covers a raw socket call, so a change whose lines hold one gets no lens from them (`2026-10-08_product-core/review/201`) | A05, A08, GOVERN 1.3 | None |

### 3. Prompt injection and content integrity

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| Any text author | Reaches agent context with an instruction override, carried in generated content | A deny scan over four pattern sets. It runs against the raw copy and the normalized copy together, so a lookalike letter or a combining mark is not an evasion. Code: `src/denyscan/denyScan.ts::scanNormalized`, `src/denyscan/denyScan.ts::normalizeForDenyScan` | A pattern gate is a gate, not a proof | ASI01, LLM01, NIST AI 600-1 Information Integrity, MEASURE 2.7 | Detection is pattern-bound |
| Any text author | Writes a forged instruction into memory that a later session reads back as context | The learnings-and-handoff pattern set runs at both write gates and in the emitted session-start screen. Code: `src/denyscan/denyScan.ts::LEARNINGS_INJECTION_PATTERNS` | The same pattern bound, over a surface that is read once per session | ASI06, LLM01, NIST AI 600-1 Information Integrity, "AI Data Security" | Detection is pattern-bound |
| Any text author | Smuggles keywords past a human reader with invisible characters | The invisible-character class is stripped ahead of the write-path screens. Code: `src/denyscan/denyScan.ts::INVISIBLE_SMUGGLING_CHARS` | The Unicode tag block is excluded from that class by design, so a dedicated rule refuses the block on the raw text instead | ASI06, LLM01, NIST AI 600-1 Information Security | None |
| Any repository writer, a pull request included | Steers a run through the deferral inbox, whose rows a flow reads back into context | `ledger inbox` refuses an inbox that is a symbolic link, a hard link, not a regular file or over 1 MiB before a byte is read. It then screens every bullet, as written and as it prints, against the block rows of the three catalogs the session-start screen reads, with the exfil-signal rows that screen drops kept in, and then screens the lines it prints as one sequence, in windows of adjacent lines, so a pattern split over two rows that print adjacent, from different blocks or across a row its filter left out, is withheld too. A hit prints a pattern id, never the row's text. The inbox's three readers, `/st-work`, `/st-board`'s `fill` and `/st-plan`'s intake, read through it. `ledger inbox-write`, the close's write wherever a CLI form runs, screens every row it appends and refuses the whole call on a hit, takes the inbox's lock and then each referenced ledger's, checks each referenced row again under them, writes by atomic rename inside `.stamity/`, and prints no row's text. Code: `src/cli/commands/ledger.ts::readInbox`, `src/cli/commands/ledger.ts::INBOX_SCREEN`, `src/cli/commands/ledger.ts::inboxSequenceHits`, `src/cli/commands/ledger.ts::runInboxWrite`, `src/runs/ledgerStore.ts::writeInbox` | Two known residuals. The screens read bounded windows of adjacent lines, not the whole output, so a pattern spread over three or more printed lines that share no window passes; the split over two adjacent bullets that 1.14.0 let through (tracked in `.stamity/inbox.md` as the row `2026-10-10_next-tier/review/26`) is now withheld. Only the close writes through the engine: `fill`'s removal of a triaged entry and `/st-plan`'s follow-up append, with `/st-rework`, `/st-pr-resolve`, the dep-audit skill and `/st-quick`'s removal, still edit the inbox with the client's file tools, and so does the close where no CLI form runs or the installed copy has no `inbox-write`, recording `inbox: by hand (no CLI)`, so on a client whose edit tool reads a file before it writes, a withheld row's text reaches the orchestrating session's context (tracked as the Warning follow-up of the run `2026-10-12_board-writes`) | ASI06, LLM01, NIST AI 600-1 Information Integrity | Detection is pattern-bound |
| Any repository writer, a pull request included | Steers a compacted or resumed session through the resume card, which reads run state back into context | After a compaction or on a resume the emitted session-start hook appends a card of counts and pointers read off disk: the run record's head, open ledger row ids, the reports whose findings never reached the ledger, and lane paths, never a finding's text or a report's body. Each file it reads is `lstat`-checked at its own name and read under a byte bound, each field is flattened to one line, its control, bidi and zero-width characters dropped and capped at 200 characters, and the whole card is screened raw, invisible-stripped and normalized against the session-start screen; a hit replaces it with one line naming the run and the pattern id. Code: `src/runs/resumeCard.ts::screenCard`, `src/runs/resumeCard.ts::collectResumeCard`, `src/runs/layout.ts::UNPRINTABLE_CHARS` | What passes is writer-authored text that reaches the model as data, and the files the card points at, the record body, the ledger's rows and the reports, meet no screen when the resumed session opens them. The link check is an `lstat` before a read by path, not a no-follow open, so a link swapped in between the two is read through | ASI06, LLM01, NIST AI 600-1 Information Integrity | The files the card points at are unscreened |
| A verdict role or the orchestrating session | Carries text into the committed ledger through a report's findings or closures, or through a manual close's rationale | `ledger append` and `ledger close` are the ledger's one writer. A finding's locator and summary must each be one line of at most 300 characters, and a rationale or a retired disposition at most 2 000; each is stripped of line breaks, tabs, the C0 and C1 controls, DEL, the bidi and zero-width marks and the Unicode tag block before it is written. A report is read only under a report name directly in the run's reports folder, with no link on its path and at most 1 MiB. Code: `src/runs/ledgerStore.ts::committedText`, `src/runs/blocks.ts::printableText`, `src/runs/layout.ts::UNICODE_TAG_CHARS`, `src/runs/ledgerStore.ts::resolveReportPath` | The strip is not a screen: no deny-scan pattern runs over a finding, a closure or a rationale before it is committed, so an instruction spelled in printable characters lands in the ledger as written, and a later reader sees it unscreened. A hand edit to the committed ledger passes through none of this | ASI06, LLM01, GOVERN 1.5 | The strip is not a screen |
| A pull request author | Edits an instruction file so the roles that review the change already follow the edit | None in this build, on any client whose sub-agents are handed the checkout's instruction files. On Copilot the engine asks for the load: since 1.14.0 every emitted Copilot agent carries `include-custom-instructions: true`, so that a sub-agent loads the charter, and with it the reviewer and the three lenses load the checkout's instruction files. On Claude Code the client does it with no engine key: a reviewer session of the 1.14.0 release run (2026-10-11) was handed the checkout's `CLAUDE.md`, `AGENTS.md` and rules files. No screen reads a hand edit to those files first. Code: `src/adapters/copilot.ts::buildAgentFile` | A branch that edits an instruction file is reviewed by roles already following the edit. Observed on Claude Code in the main checkout and inferred for a branch's checkout; on Copilot it follows from the emitted key, which a live check of Copilot CLI 1.0.89 saw load the charter; not measured on Cursor or Codex, and inferred there until it is. A known residual in 1.15.0: the Copilot case is tracked in `.stamity/inbox.md` as the row `2026-10-10_next-tier/review/22`, and the residual on every client is tracked as the row `2026-10-11_release-1-14-0/review/36` of the ledger `.stamity/runs/2026-10-11_release-1-14-0/ledger.jsonl` | ASI01, LLM01 | Review roles load the change's own instructions |

### 4. MCP server trust

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| MCP server | Poisons a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission. Code: `src/mcp/descriptionScan.ts::scanMcpEntry` | Emission time only. It sees what the definition declared when it was written | ASI07, ASI02, LLM03 | None |
| MCP server | Redefines its tools after the operator approved them | None in this build. `src/mcp/descriptionScan.ts::hashToolManifest` and `src/mcp/descriptionScan.ts::detectToolManifestDrift` exist and are tested. No path records a hash at install, and no path compares one later | Redefinition after install is undetected | ASI07, ASI02, LLM03, MANAGE 3.1 | Drift detection is unwired |

### 5. Agent tool allowlists and unattended runs

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A generated agent | Uses a tool its role was never granted | A deny-by-default allowlist per agent. The roster is serialized into the policy document the emitted pre-tool-use guard reads, and the guard refuses with a machine-readable reason. Code: `src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER`. Two admissions ride the same guard outside the categories, the guard's alone: a verdict role's report `Write` under its `writePaths`, and read-only git through `Bash` for the four verdict roles and the spec-author (`src/roster/agentPolicies.ts::READ_ONLY_GIT_SUBCOMMANDS`) | There is one enforcement point, and it runs in the client rather than here. On a client whose hook payload names no agent, the guard is telemetry | ASI03, ASI10, LLM06, GOVERN 2.1 | Enforcement is client-side only |
| A generated agent | The same, at an in-process delegation boundary | None in this build. `src/tools/allowlist.ts::checkToolAccess` is the check the emitted document is pre-sanitized to agree with, and nothing under `src/` calls it | A denial is one control, not a pair | ASI03, LLM06 | The in-process check is unwired |
| The main thread of any session, attended or not, or the text that steers it | Runs a person-only act (a force push, a push of a tag or of the default branch, a remote branch deletion, a merge or a review approval, a release, a publish, a secret, protection or repository write), or in a run nobody watches pushes around the run verbs | The person-only shell guard the engine emits for every client reads each shell call as a shell would split it and classes each person-only act it finds, naming the rule: a deletion, a force push or an act that cannot be undone is refused on every client, attended or not, and one such act on a line refuses the whole call; attended, an act that can be undone asks on Claude Code for one click, refused where a sub-agent runs it or in Claude Code's `auto` permission mode, and on Copilot CLI for the person's own agent alone, a call with no helper field whose session id Copilot's session start recorded (measured on 1.0.98, 2026-10-19), while Cursor, which ran a command despite a `beforeShellExecution` ask under `--force` (measured 2026-10-18) and whose hooks page says `preToolUse`'s ask is not enforced, and Codex, whose hooks page says an ask is not honoured, refuse it. While a run is unattended, by its records or `STAMITY_UNATTENDED`, it refuses every person-only act on every client and also every raw `git push`, `gh pr create`, `gh pr edit`, `gh pr update-branch`, `gh pr close` and `gh pr reopen`, a `gh` group outside gh's built-in commands (an alias or an extension) and `gh alias set` or `import`, `gh extension exec`, a REST write or GraphQL mutation that moves a branch or a pull request, a `git remote` write and a `git config` write of a `remote.*` or `url.*` key, and a line, whatever program it runs, that sets one of git's program-valued variables or one of its configuration variables, `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` among them, and a line that runs `stamity run start`, `checkpoint` or `end` unless the verb stands alone on it as one simple command, its only redirection a closing `2>&1`. A tag includes a `git update-ref` write on `refs/tags/`, a publish includes npm's unique prefixes of `publish` and a manager run through Corepack, and the merge queue's `enqueuePullRequest` is a merge. A `git symbolic-ref` write naming a tag is a tag, and one pointing a name at the default branch a push of that branch to come, and the symref commands of a `git update-ref --stdin` text the line carries are read the same way, each wherever it stands in the text; each curl request after `--next` is judged alone, and a curl body counts as one attached or in a short cluster as well as apart, and so does a curl method, a letter after another value letter being that letter's value; a curl or wget long option counts from any prefix of two or more letters of a long option the guard lists, read as the first it begins, and gh's `-i` clustered with a method or a field, and its `-X=<method>`, count as gh reads them; both verdicts read a REST path with its dot segments resolved as well as written; `gh repo sync` naming a destination repository is a force push under `--force`, and otherwise a push of the default branch unless `--branch` names another branch the line shows; `gh repo unarchive` is a repository write, as `gh repo archive` is; and the GraphQL repository-settings, protection, ruleset and custom-property mutations, and a custom-property REST write, are protection writes. A shell call it cannot read, a line nested more than four levels deep among them, is refused, as is a push naming a refspec where the local tags pass 10,000 names (`TAG_NAMES_OVER_10000`) or `packed-refs` passes 8 MiB (`PACKED_REFS_OVER_8388608`), a tag entry that is not a regular file being read as absent, and so is an HTTP call whose method or targets the line hides (`HTTP_TARGET_HIDDEN`): a method held in a variable or a substitution, attached in a short cluster too or cut from the line by an unquoted one, a curl or wget configuration file the line names, a curl write its globbing expands unless `-g` is set, a wget write reading `-i`, and a curl short cluster holding `:` among other letters. On Claude Code the table's refuse-class prefix forms are also `permissions.deny` rows, with a mid-pattern row for each refused flag that can follow an ask-class prefix, and its ask-class ones `permissions.ask` rows, and fourteen rows more name the GitHub MCP server's merge, branch-content, branch-creation, review-submitting, pull-request-creating, pull-request-update and repository-delete tools by name, as its tool list named them on 2026-10-16, thirteen asking and `delete_repository` denied, with a `PreToolUse` hook on those tools that refuses each while a run is unattended; a pull-request update through that server asks whole. Code: `src/hooks/personOnly.ts::personOnlyVerdict`, `src/hooks/personOnly.ts::unattendedPushVerdict`, `src/hooks/personOnly.ts::CLAUDE_DENY_ROWS`, `src/hooks/scripts.ts::buildPersonOnlyGuardScript` | A command reaches the guard as text, so a respelling the text hides passes, a gh alias or extension attended and a `git update-ref --stdin` text read from a file among them, a REST target held in a variable too, and a client that runs no hook, or a hook that fails open, refuses nothing. An attended ask holds only while the client honours it (Claude Code's hook ask in bypass-permissions mode measured on 2.1.302, not documented, and re-measured before each release; Copilot CLI's on 1.0.98, whose experimental assisted mode may hand the ask to an LLM judge a hook cannot see), and where no hook runs a respelling no settings row names costs one click, a colon-refspec deletion behind an ask prefix among them. Lines run inside another line, PowerShell's command wrappers and script blocks, `cmd /c` and `/k`, a rebase exec line and a bisect run command, are read as their own, a directory change inside one included, a Windows-path git inside a PowerShell payload is read as git, and gh's alias for the create-and-push form and a `-c` pair outside the display and identity keys are refused in an unattended run. The attended table's accepted gaps, which the unattended rules cover, and those they do not, a PowerShell encoded command and a line piped into `iex`, are named in SECURITY.md, as are a git builtin running a program the repository's configuration names, an attended clone whose `origin/HEAD` no run verb has pointed at the default branch, and more than 2,000 run folders, past which the guard refuses every call the unattended rule would read, which a run can set first, a program-valued variable set through a PowerShell `env:` drive command other than `Set-Item` and `New-Item` among the ways, and a hook the run writes, which a run verb's commit or push runs, and so are the GitHub MCP server on the clients that take no per-tool deny, the server configured under another name than `github` on Claude Code and, attended, a working directory Claude Code keeps across calls that its payload may not name, a symbolic ref already on disk, a branch switch earlier on the line before a push whose destination is implied, and a method, body or URL from curl's or wget's default configuration file | ASI02, ASI03, LLM06, A01 | The guard reads text |
| An unattended run, or the text that steers one | Starts on an account that can push to the default branch, so nothing but the run's own steps stands between it and `main` | The pre-flight passes only when every check passes, any `unknown` refusing. Running it first is the unattended skill's text, which the model follows: no run verb reads its verdict. Its wall is REST reads the engine makes itself, through `gh`, proving the account cannot push to the default branch of the `origin` it resolved, where every push URL goes out as the REST reads' identity; an account with no push right at all is refused, since the run could not push its own branch; an account that administers the repository counts as blocked only by an organization ruleset that pins the default branch, under a plain `member` role. Code: `src/runs/preflight.ts::runPreflight`, `src/runs/preflight.ts::inspectDirectPush` | The wall binds an account, not a person: behind Claude Code's cloud proxy the platform's shared app identity, custom repository and organization roles that can lift a counted ruleset, an administrator's repository-level acts, `PATH` choosing the `gh` a credential helper runs, and a `GIT_CONFIG_*` value changed after the pre-flight stay open, as SECURITY.md names | ASI03, ASI10, LLM06, A01, MANAGE 2.1 | The wall binds an account, not a person |
| An unattended run, or the text that steers one | Pushes a change to the files that decide what every later run may do, or a credential | `run checkpoint` and `run end` are the run's only push path: they refuse a default branch, a detached `HEAD` and a checkout that is not the record's `Branch:`, point `origin/HEAD` at the default branch GitHub's REST API names, refuse an unattended run when neither REST nor `origin/HEAD` names the default branch (`run start` exits 1, `checkpoint` and `end` refuse the commit), refuse once origin's fetch URL or a push URL, as git resolves it, names another repository than the one `run start` pinned in the run folder's `origin.json`, stage only the run's own files and the named paths, move the change under the person-only paths, Claude Code's and Cursor's hook scripts under `.claude/hooks/` and `.cursor/hooks/` among them, and a symbolic link at a held glob's folder, into an inert patch and restore them in the index, hold `.stamity/packs/`, the hooks folder `Base:`'s manifest names and each script and repository-path launcher a hook declaration at `Base:` names the same way, refusing before they stage on anything they cannot resolve cleanly there, refuse the push while a commit it sends or `HEAD`'s tree still changes a held path, scan what the push sends, every commit none of origin's branches and tags reaches included (read with `git ls-remote origin`, never from a remote-tracking ref), and hold it on a hit or a remote that read cannot reach, check the push's own command against the guard's table, and push no tag. Code: `src/cli/commands/run.ts::runCheckpoint`, `src/cli/commands/run.ts::alignOriginHead`, `src/cli/commands/run.ts::originRefusal`, `src/cli/commands/run.ts::heldOf`, `src/change/personOnlyPaths.ts::heldPaths`, `src/cli/commands/run.ts::hookPathsAt` | The held set is a glob list: an environment file can name a build file outside it. The hook hold reads the declarations at `Base:` alone: a hook written by hand into a client's settings file whose script lies outside the held folders, a module a held script loads from outside them, and a run that rewrites its record head's `Base:` stay open. A multi-root workspace file, and every folder's editor settings and tasks files, are held. The origin pin is a file in the run folder, so a run that rewrites it together with git's configuration passes its check | ASI02, ASI05, LLM06, A08 | The held set is a glob list, and the origin pin a work-tree file |

### 6. Write-path integrity and payload bounds

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A concurrent writer, or anything sitting at the target path | Tears a write, redirects it through a symlink, or clobbers content the engine does not own | The temp file is created exclusively and without following links. The rename is atomic and runs under a cross-process lock. Content outside managed blocks is preserved and reclaimed. Code: `src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts::sweepReclaimCandidates` | None | A08, ASI08, MEASURE 2.7 | None |
| An agent | Pipes an unbounded payload through a write path | Stdin is read under a 250 000-byte ceiling. A payload past it is refused, never truncated. Code: `src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH` | The phase bounds beside it are dormant. `src/guard/promptGuard.ts::guardInput`, `src/guard/promptGuard.ts::validateAgentOutput`, `src/guard/promptGuard.ts::wrapWithBoundary` and `src/guard/promptGuard.ts::extractBoundedContent` have no caller outside their own module | LLM10, ASI08, MEASURE 2.7 | Phase IO bounds are dormant |
| Anyone reading the repo | Finds credentials committed into generated client config | MCP configs emit each dialect's own reference form rather than a literal value. Values are scanned for known secret shapes, and a finding prints masked. Code: `src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets` | Shape detection catches known shapes on sight, and nothing else | LLM02, A05, MEASURE 2.7 | Detection is shape-bound |
| Anyone committing to the repository, an agent included | Commits a credential in a change's added lines, or commits one and removes it again before the push | `gate scan` reads the lines a change adds, its untracked files included, and with a `--base` the added lines of every commit since that base, merges left out, through the shipped secret patterns. A hit names path, line and rule, never the value, and exits 1. So does a change the scan could not read. There is no allow-list and no waiver. Code: `src/change/scan.ts::scanAddedLines`, `src/cli/commands/gate.ts::readHistory` | Six known residuals in 1.15.0, each tracked in `.stamity/inbox.md` as the row named. A value added in a merge commit and removed later is never scanned (`2026-10-08_product-core/close/2`). A UTF-16 file committed and removed again since the base is only named, and the scan exits 0 (`2026-10-08_product-core/close/3`). A staged copy of a UTF-16 file that the work tree has changed again is neither decoded nor named, so the bytes a commit would record for it are not scanned (`2026-10-08_product-core/review/127`). Three value shapes pass: a short credential in an extensionless shell script or a `.ksh` file (`2026-10-08_product-core/close/5`), a quoted `=`-padded value of 40 to 59 characters under a name that names no credential (`2026-10-08_product-core/close/7`), and a quoted mask directly followed by more text in a shell file (`2026-10-08_product-core/close/9`) | LLM02, MEASURE 2.7 | Detection is shape-bound |
| Anyone whose text an unattended run sends out, the run itself included | Carries a credential out in a pull request's title or body, a morning list, a comment or a reply | `gate scan --text` screens every line of the outbound file with the change scan's own patterns and exits 1 on a hit or a line past the cap, naming the line and the rule and never the value; the run verbs screen the draft pull request's title and body the same way before they post. Code: `src/runs/morning.ts::screenOutbound`, `src/change/scan.ts::scanAddedLines` | Shape detection catches known shapes on sight, and nothing else. That a flow posts only from the scanned file is model-followed text, outside the run verbs' own step | LLM02, MEASURE 2.7 | Detection is shape-bound |
| The orchestrating session | Retires a deferred finding with a disposition that says nothing a reader can check | From 2026-10-10 (UTC) a new `ledger close --retired` value must parse under the schedule grammar: fixed with a ref, cut with a reason, or scheduled to a place with a day or a trigger that names an event. A value that does not parse is refused with nothing written. Code: `src/runs/disposition.ts::parseDisposition` | The grammar reads shape alone: a place is never resolved or opened, so a schedule to a plan file or an anchor that does not exist parses. A known residual in 1.15.0, tracked in `.stamity/inbox.md` as the row `2026-10-10_next-tier/review/95` | GOVERN 1.5 | None |
| Any repository writer, a pull request included | Edits the committed manifest so `sync` or `clean` deletes or overwrites a file the engine does not own | The ledger is bounded to the paths a release writes, and a row outside it refuses the whole manifest. Inside the bound, a delete or a backup-free overwrite needs a recorded hash that matches the bytes, or a managed block that spans the file, and a row with no hash proves nothing by itself. Before a backup-free overwrite at an `AGENTS.md` in any folder, `AGENTS.override.md` and the Copilot setup workflow, the bytes must also show the engine wrote them, and `CLAUDE.md` is proved only by a managed block that spans it. At those paths and at `.github/hooks/stamity.json`, an overwrite the incoming rendering does not prove keeps the previous content recoverable: in git history when the file is tracked and clean, behind a verified `.bak` otherwise. A whole-file delete at an engine-named file in a content folder, at those instruction files, at `.github/hooks/stamity.json` and at Cursor's two 1.11.0 guard names needs more: bytes that hash to a rendering the running engine produces at that path (at the two guard names, the guard 1.11.0 rendered for that setup), or a managed block that spans the file. There a forged row and hash, and an owner's copy of the charter's headings, no longer prove a delete, and a file no rendering proves is kept and named. `check` names every path a `sync` would reclaim. Code: `src/manifest/ownedPaths.ts::ownedPathDefect`, `src/manifest/ownedPaths.ts::bytesShowEngineOutput`, `src/manifest/ownedPaths.ts::needsRenderingProof`, `src/cli/engine/emissionWrite.ts::engineRenderingsFor`, `src/merge/safeWrite.ts::safeWriteFile` | The manifest carries no signature, so a forged row inside the bound whose hash matches the bytes still proves what a recorded hash proves on its own. Three cases are known residuals in 1.15.0, each tracked where [SECURITY.md](../SECURITY.md) names it. (1) An overwrite of an instruction file or of `.github/hooks/stamity.json` that git tracks with no uncommitted change takes no `.bak`, under a forged row hashing an owner's file too: the previous content is in git history. That check starts git as the next row states, so for a tree git checked out a setup root with no `.git` of its own that holds committed bare-repository files does not answer it, on git 2.38 and later by the option and on an older git by the look, and the `.bak` is taken; that row names what is left. Elsewhere inside the bound a backup-free overwrite, and a delete at the engine's state and pack folders and at the `stamity-` Cursor guards, still rest on the recorded hash alone. (2) The rendering is built from the setup's installed packs and overrides, which a repository writer can plant: a planted pack or override whose rendering copies an owner's file byte for byte, beside a forged row hashing it, still proves that delete. (3) A selected `[mcp_servers.<id>]` table in `.codex/config.toml`, and the bare `[mcp_servers]` table rendered when none is selected, is proved by its record alone | A01, A08, ASI06, MEASURE 2.7 | In-bound records are unauthenticated |
| Any repository writer, a pull request included | Commits a folder shaped like a bare repository where the engine runs git, at the setup root or above the folder a verb runs in, so that git reads it as the repository and takes its configuration, index and refs | Every git process a CLI verb starts outside the `worktree` verbs (the reads of `sync`, `check`, `init`, `config detect`, `handoff` and `gate`, and the tracked-and-clean check before an overwrite) is started one way: with `safe.bareRepository=explicit`, which git honours from 2.38, with `core.fsmonitor=false`, and in the caller's environment with every `GIT_*` variable left out. The `worktree` verbs pass the same two options and keep the caller's environment, git's own variables included. Before any of them starts git, a look that asks `lstat`, and `stat` for each `.git` entry, walks from the folder git is to run in towards the filesystem root and refuses a level that passes git's own test for a repository folder by entry names (`HEAD` beside `commondir`, or beside both `objects` and `refs`), unless the walk ends first: at a `.git` that is a regular file or a folder passing the same test, or a link to either, at another file system (not on Windows) or at the root. A refusal starts no git and reads as git not answering; `check` warns that git was not started because the folder or one above it has the layout of a bare repository, names no git command to run there, and says to run no git in that folder or in any folder under it. `sync`'s closing step after a write, `init`'s no-git note and declined-question refusal, `gate`'s reason and the `worktree` verbs' refusal state the same cause and name no git command. `check`'s row and `init`'s note also say to start no flow there until the folder is moved, and `init`'s next steps, on the ready panel and in `--json`, open with moving it. Code: `src/cli/engine/gitStatus.ts::gitCheckRunner`, `src/merge/safeWrite.ts::runGitCheck`, `src/worktree/git.ts::runGit`, `src/merge/safeWrite.ts::gitDiscoveryMeetsBareShape` | It holds for a tree git checked out and for the git the CLI's verbs themselves start, and no further: on git 2.38 and later by the option, on an older git by the look, and no git older than 2.38 was run for it. A caller of the package's library is outside it: `src/workspace/git.ts::detectRepoGitIdentity` called with no runner starts git by an absolute path, as the next row states, and as plain git in every other way, with neither option and no look, and the two verbs that use it pass the pinned runner. Four known residuals in 1.15.0; the first three are each tracked as the row named of the ledger `.stamity/runs/2026-10-11_release-1-14-0/ledger.jsonl`, and the fourth by this page and SECURITY.md alone, since the row that tracked it closed with the flows' stop. On a git older than 2.38, a leftover `.git` folder on the operator's own machine, or one in a tree that did not come from git, that holds the names the look asks for and that git cannot open ends the look as safe, and that git then walks past it and opens a folder of the shape at that level or at any level above it (run on git 2.52 with the option at its default, and on no older git); no commit can hold a `.git` entry (`2026-10-11_release-1-14-0/fix/13`). The next two are the `worktree` verbs' alone, because they keep the caller's git environment: a `GIT_COMMON_DIR` exported with no `GIT_DIR`, with which a git older than 2.38 opens a committed folder the look passes (`2026-10-11_release-1-14-0/fix/14`), and a relative `GIT_DIR`, with which no look is taken and which can name a folder the tree holds, on any git version (`2026-10-11_release-1-14-0/review/51`). The fourth is every git the engine does not start: a client's own tools, a flow's session and its sub-agents, and the operator's shell start git with neither option and no look, so started in or under a committed folder of the shape that git can open, that git reads it as the repository. It does not take a refusal: the look is taken from the folder a verb runs in and walks upward, so such a folder elsewhere in the tree, below the setup root, meets no look and no warning. Where the look does refuse, `/st-work` and `/st-quick` stop on `gate`'s reason, with no later step and no git command in that folder; in 1.14.0 they read it as a scan that did not run and went on with the session's own git. The stop comes at the `gate` call, so git the session started before it has already run, and no other flow reads the reason as a stop. Git documents one setting against it, which is the operator's to make and which the engine neither sets nor checks: `safe.bareRepository` set to `explicit` in the user-level or system-level git configuration, read by git 2.38 and later. Every git process that reads that configuration then opens a bare repository only where `--git-dir` or `GIT_DIR` names it, git run inside a real bare repository included, and that covers a folder of the shape below the setup root as it covers one the look refuses | ASI05, A08 | Only the engine's own git is covered |
| Any repository writer, a pull request included | Commits a file under git's program name in a folder the engine runs git in, so that the file is started in git's place | Every place that starts git starts it by an absolute path, never by its bare name: the verbs' pinned runner, the tracked-and-clean check before an overwrite, the `worktree` verbs' runner and the library's origin read called with no runner. Each resolves git once per working folder and `PATH` value by a walk of the engine's own, which takes only a `PATH` entry that is a full path, skips an empty entry, a relative one and an entry whose real path is the working folder's, and on Windows tries the name with `.com` added, then with `.exe`. Where no entry holds git, no program is started and each caller answers as on a machine with no git installed; `check`'s `git-available` row, `init`'s no-git note and the `worktree` verbs' refusal then say the engine found no git to start, and name no git command to type. Every release from 1.0.0 to 1.12.0 named git bare and left the lookup to the runtime, which on Windows looks in the folder the child runs in before any `PATH` entry. Code: `src/shared/programPath.ts::resolveProgramOnPath`, `src/shared/programPath.ts::gitProgramFor`, `src/cli/engine/clientModels.ts::listClientModels` | It holds for the git the engine itself starts and for the folder that git runs in, and no wider: the walk takes the `PATH` the engine is started with as given, so an entry that is a full path to some other folder is searched as it stands, a folder inside the checkout included. Since 1.15.0 the walk for git skips every `node_modules/.bin` entry, the folders `npx` puts ahead of the operator's own entries. One other start is covered: the hook runner the engine emits for Codex, Copilot and Cursor starts every launcher by an absolute path, `node` and `node.exe` (any letter case on Windows) as its own interpreter and any other launcher from the same walk, without its `node_modules/.bin` skip, done again inside the runner, so it never takes one from the folder the hook runs in; a launcher the walk does not find starts nothing, and the hook fails without letting a blocked call through. Until 1.15.0 the runner started any launcher but `node`, `node.exe` included, by its bare name in the repository root. Since 1.15.0 a third start is covered, by a stricter walk: `init`, `sync`, `workspace sync` and `check`'s `model-pins` row start each selected client's own CLI to read its model list (`cursor-agent models` or `agent models`, `codex debug models`, `copilot help config`), found on a `PATH` with every relative entry, every entry inside the project tree and every `node_modules/.bin` dropped, refused when its real path lies inside the tree, and started from the user's home folder with that trimmed `PATH`, the operator's environment and so the operator's client account, its input closed and a 10-second limit; `STAMITY_NO_CLIENT_PROBE=1` starts none. The client's own listing call may reach its vendor over the network, which was not checked. None beyond these is covered: the command lines a client starts, git that anything other than the engine starts, and what git itself starts. SECURITY.md says of each what an operator can do. That the runtime on Windows looks in the working folder first is read from its source, not from a run | ASI05, A08 | `PATH` is taken as given; beside git, only the hook runner's start of its launcher and the client model lister are covered |
| Any tool or person editing a client config the engine also writes | Loses an owner's deny rule, allow row, hook entry or Codex table to `sync`, `clean` or `--force` | `.claude/settings.json`, `.cursor/hooks.json` and `.codex/hooks.json` are owned entry by entry, and `.codex/config.toml` table by table. A removal without a verified `.bak` needs a proof by path or by re-rendering, and `--force` changes no owner content. No `permissions.deny` or `permissions.ask` row leaves `.claude/settings.json`: `sync` keeps each byte for byte and `clean` names those equal to an engine row of either table that it left. Code: `src/manifest/coOwnedJson.ts::planCoOwnedJson`, `src/manifest/codexConfigToml.ts::planCodexConfigToml`, `src/manifest/claudeSettings.ts::reduceClaudeSettingsToForeignContent` | An entry another tool or a pull request adds is kept, and `check` does not report it as drift. A checkout synced from an unreleased build before 1.16.0 keeps the deny rows it wrote for acts that now ask, so those acts stay refused there until the person removes the rows, which `clean` names | A05, A08, ASI02, MEASURE 2.7 | Added entries are not drift |

### 7. The release publish path

| Actor | Vector | Control | Residual | Mapped ids | Gap |
|---|---|---|---|---|---|
| A build-time dependency | Reaches the publishing credential | The job that builds does not hold it. The gate job and `publish` are separate jobs. `publish` takes no checkout, and it verifies the tarball hash against the gate job's output. Code: `.github/workflows/release.yml` | A compromised build dependency runs where no credential is | ASI04, LLM03, A08, MANAGE 3.1 | None |
| Anyone | Publishes a build nobody can trace to this repository | `npm publish --provenance` over OIDC trusted publishing. No long-lived token exists here, and third-party actions are SHA-pinned | The platform half is maintainer setup rather than a file: the required reviewer, the tag ruleset and the trusted-publisher entry. It is re-verified at each cut | ASI04, A06, A08, GOVERN 1.5, MANAGE 2.1 | The platform half is not code |
| Anyone holding a fork's package name on the public registry | Serves a look-alike to a `--registry` fork's generated CLI call | Every pinned call a `--registry` fork renders carries `--@<scope>:registry=<url>`. A URL outside a strict plain-https grammar is refused by `fork-identity.mjs` before writing, and renders `npx --no` if it was set by hand. Code: `src/shared/cliCall.ts::scopeRegistryArg` | Unmeasured under PowerShell's `npx.ps1` shim | ASI04, LLM03, A08, A06 | None |

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
8. **In-bound ledger records are unauthenticated.** The manifest carries no signature, so a
   forged row inside the owned-path bound whose hash matches the bytes still proves what a
   recorded hash proves on its own. At an instruction file, an engine-named file in a content
   folder, Copilot's hooks file and Cursor's two 1.11.0 guard names that is no longer a delete:
   a delete there needs the running engine's own rendering, which an owner's copy of the
   charter's headings does not match. Three cases stay open. The first is what a forged row
   still reaches: an overwrite of an instruction file or of Copilot's hooks file that git tracks
   with no uncommitted change, which takes no `.bak` because git history holds the previous
   content; a backup-free overwrite at any other path inside the bound; and a delete at the
   engine's state and pack folders and at the `stamity-` Cursor guards. The last two still rest
   on the recorded hash alone. The second is a planted pack or override whose rendering copies
   an owner's file, and the third the Codex `[mcp_servers]` table, proved by its record alone.
   These are known residuals in 1.15.0, and SECURITY.md names where each is tracked.
9. **An entry added to a co-owned config is not drift.** An allow row, hook entry or table that
    another tool or a pull request adds to `.claude/settings.json`, `.cursor/hooks.json`,
    `.codex/hooks.json` or `.codex/config.toml` is kept as the owner's, and `check` stays green.
    Only a Cursor entry Cursor rejects and a kept key that turns Codex's hooks off fail it.
10. **Review roles load the change's own instructions.** On every client whose sub-agents are
    handed the checkout's instruction files, a branch that edits one is reviewed by roles
    already following the edit, and no screen reads that edit first. Copilot's reviewer and
    three lenses load them by the key the engine emits. On Claude Code a reviewer session was
    observed to be handed them by the client, in the main checkout, and the same is inferred for
    a branch's checkout. Cursor and Codex were not measured. A known residual in 1.15.0;
    SECURITY.md names where it is tracked.
11. **Only the engine's own git is covered against a committed bare-repository folder.** The
    options the engine passes to git and the look it takes before git hold for the git the
    CLI's verbs themselves start, in a tree git checked out. Git that a client's own tools, a
    flow's session and its sub-agents, or the operator's shell start has neither, and started in
    or under a committed folder of that shape that git can open, it reads that folder as the
    repository. That does not take a refusal: the look is taken from the folder a verb runs in
    and walks upward, so such a folder elsewhere in the tree, below the setup root, meets no
    look and no warning. A folder the look does refuse stops `/st-quick` and `/st-work` at their
    `gate` call, and no other flow; git the session started before that call has already run
    there. Git documents one setting against it,
    `safe.bareRepository` set to `explicit` in the operator's own user-level or system-level git
    configuration (git 2.38 and later), which the engine neither sets nor checks and which
    covers both placements. A caller of the package's library is outside the claim too: its
    origin read, called with no runner, starts git with neither option and no look, and the
    verbs that use it pass the pinned runner. Three narrower cases stay open beside it.
    The first is on a git older than 2.38: a leftover `.git` folder that git cannot open ends
    the look as safe, and that git walks past it. The other two are the `worktree` verbs' alone,
    which keep the caller's git environment: a `GIT_COMMON_DIR` exported with no `GIT_DIR`, on a
    git older than 2.38, and a relative `GIT_DIR`, on any git. These are known residuals in
    1.15.0, and SECURITY.md names where each is tracked.
12. **`PATH` is taken as given, `node_modules/.bin` aside.** The engine starts git by an
    absolute path it resolves itself, and never from the folder git runs in: an empty `PATH`
    entry, a relative one and an entry that is that folder are skipped. Since 1.15.0 so is
    every `node_modules/.bin` entry, at any level. `npx` and `npm exec` put the project's, and
    that of each folder above it, ahead of the operator's own entries, and in 1.14.0 a file of
    git's name there was the git the engine started (seen on one POSIX host with npm 10.9.8,
    not run on Windows). Every other entry is searched as it stands. An entry that is a full
    path to some other folder counts whatever that folder is, one inside the checkout included,
    so whatever sets the `PATH` the engine is started with chooses the git. The claim is for
    git's start in the folder it runs in, and no wider. The row holds where that `PATH` names no
    folder of the branch but its `node_modules/.bin`. A known residual in 1.15.0; SECURITY.md
    says what to look for.
13. **Beside git, only the hook runner's launcher and the client model lister are covered.** The
    lister starts each selected client's own CLI from the user's home folder, never a program
    inside the project tree or a `node_modules/.bin`, and that client's own call may reach its
    vendor over the network (`STAMITY_NO_CLIENT_PROBE=1` starts none). The hook runner the
    engine emits for Codex, Copilot and Cursor starts the launcher every hook the engine writes
    names, `node`, by its own interpreter's absolute path. Since 1.15.0 it starts `node.exe` the
    same way and any other launcher by an absolute path from the engine's `PATH` walk, never from
    the folder the hook runs in; until then it started those by a bare name in the repository
    root, the lookup the row closes for git. The runner's walk keeps `node_modules/.bin` entries
    (item (2) of SECURITY.md's row for a file committed under git's program name). Three other
    starts are found by a bare name. The
    hook lines and MCP launchers the engine writes are started by the client, by the client's
    rules, which were not checked. Git that the operator's shell, a
    client's tools or a flow's session start is found by their rules, and what git itself
    starts, a hook, a helper or a transport program, by git's. Against each, SECURITY.md names
    what an operator looks at before running in a checkout of work they have not read. Known
    residuals in 1.15.0.
14. **The files the resume card points at are unscreened.** The card itself is screened, and
    carries counts and pointers only; the record body, the ledger's rows and the reports it names
    meet no screen when a resumed session opens them.
15. **The ledger writer's strip is not a screen.** A finding, a closure or a rationale is stripped
    of control and invisible characters and bounded in length, and no deny-scan pattern reads it, so
    an instruction in printable characters lands as written.
16. **The guard reads text.** The person-only shell guard sees a command as text, so a respelling
    the text hides passes, and a client that runs no hook, or a hook that fails open, refuses
    nothing. Attended, an ask holds only while the client honours it, and where no hook runs a
    respelling no settings row names costs one click. A git, shell or gh alias, a gh extension, a symref command word the line cannot show,
    a `git update-ref --stdin` text read from a file and a REST target held in a variable, which the
    guard judges as the literal word, are such respellings; unattended, a `gh` group outside gh's built-in commands and
    `gh alias set` or `import` are refused. A line nested more than four levels deep is refused as
    one the guard cannot decide. The attended table's accepted gaps are covered in an unattended run
    by the push rule and the pre-flight's REST check. PowerShell's command wrappers and script blocks, `cmd /c` and
    `/k`, a rebase exec line and a bisect run command are read as lines of their own, and gh's
    alias for the create-and-push form is refused while a run is unattended. A directory change
    inside those lines is followed, a Windows-path git inside a PowerShell payload is read as git,
    and an unattended git call with a `-c` pair outside the display and identity keys is refused.
    A PowerShell encoded command and a line piped into `iex` pass both verdicts, and a git builtin
    can run a program the repository's own configuration names, which a run can set first, so no
    reading of one command line closes it. Unattended, a line that sets one of git's program-valued
    or configuration variables is refused whatever program it runs, `GIT_CONFIG_GLOBAL` and
    `GIT_CONFIG_SYSTEM` among them, `export`, and `declare`, `typeset` or `local` given `-x`, with a
    value or without one, a name `read`, `for`, `printf -v`, `mapfile`, `readarray` or `getopts`
    assigns with no `=`, any of them named on a line that turns allexport on with `set`'s letter or
    the option's name, and PowerShell's `Set-Item env:` and `New-Item env:` among the spellings; a
    program-valued variable set through another of PowerShell's `env:` drive commands passes, a
    respelling SECURITY.md names. So do `readonly NAME=…` and zsh's `readonly -x`, `select`, zsh's
    `print -v` and `foreach`, `: ${NAME:=…}`, allexport turned on by zsh's `setopt -a` or by a shell
    started with `-a`, and `source <file>`, on a line of their own in a shell that persists, each
    changing the environment a later verb's git starts from, since a run verb's own line holds the
    verb alone; set that way, a program-valued variable is removed from the verb's git and a
    `GIT_CONFIG_*` one reaches it; the pre-flight's refusal of an account that can push to the
    default branch is the control that holds. A hook the run writes runs inside a run verb's commit or push,
    which keeps the repository's hooks, and the pre-flight's refusal of an account that can push to
    the default branch is the control that holds. On the clients that take no per-tool deny from
    the engine, a merge, branch write or review approval through the GitHub MCP server is a tool
    call no shell guard sees, and on Claude Code its ask and deny rows miss the server configured
    under another name than `github`. A `git config` write of a `url.*` key is refused beside a
    `remote.*` one, the run verbs' origin pin the second check on the push it would move. Attended,
    a directory Claude Code keeps across calls is read from the payload's working directory, which
    was not checked to follow it. Attended, in a clone where `origin/HEAD` is absent or names an
    older default and no run verb has run since, or where the default's name holds a character the
    run verbs' push check does not read, so they leave the ref unwritten, a push of a default branch
    named neither `main` nor `master` passes the person-only rule. Past 2,000 run folders the guard refuses every call the
    unattended rule would read, attended sessions included, and past 10,000 local tag names, or a `packed-refs` file
    past 8 MiB, it refuses every push naming a refspec, attended sessions included, a tag entry that is
    not a regular file being read as absent. Attended, a symbolic ref already on
    disk, a branch switch earlier on the line before a push whose destination is implied, and a
    method, body or URL from curl's or wget's default configuration file pass the person-only
    rule, the remote's own protection the control that holds; unattended, the raw-push refusal
    holds the first two, and the pre-flight's refusal of an account that can push to the default
    branch holds the third on that branch alone: a write such a file hides reaches the run's own
    branch around the run verbs, the held paths and the last scan. A curl or wget configuration
    file the line names, and an HTTP method held in a variable or a substitution, are refused as
    `HTTP_TARGET_HIDDEN`. SECURITY.md names each.
17. **The pre-flight's wall binds an account, not a person.** It proves what the account the run
    acts as can do, read once at the start: the cloud proxy's shared app identity, custom repository
    and organization roles, an administrator's repository-level acts, `PATH` choosing the `gh` a
    credential helper runs, the environment the run verbs start under (`PATH`, `HOME`,
    `XDG_CONFIG_HOME`) choosing the git they run and the global configuration it reads, and a
    `GIT_CONFIG_*` value changed or gained after it stay open, an earlier line of a shell that
    persists and Claude Code's environment file among the ways, which the cloud readiness hook's
    `npm ci` install scripts inherit and can append to, and a run verb's line the stand-alone rule
    skips, since it finds the verb by its name in the line's text, which a launcher the guard does
    not unwrap, a name split by quotes or a line built by an expression can hide, the pre-flight's
    refusal of an account that can push to the default branch the control that holds.
18. **The held set is a glob list, and the origin pin a work-tree file.** What the held set does
    not name is pushed as any other change: an environment file can name a build file outside it.
    A multi-root workspace file, and every folder's editor settings, tasks and MCP-server files,
    are held, and so is a symbolic link at a held glob's folder. The hook hold reads the declarations at
    `Base:` alone: a hook written by hand into a client's settings file whose script lies outside the
    held folders, a module a held script loads from outside them, and a run that rewrites its record
    head's `Base:` stay open. The run verbs check the push
    against the repository `run start` pinned in the run folder, so a run that rewrites that file
    together with git's configuration passes the check.

## What is not applicable, and why

**A07 Identification and Authentication Failures, and A10 Server-Side Request Forgery.** There is
no authentication surface, and no caller-supplied URL that the engine fetches. It has five network
paths. One is a signed-metadata fetch at verification time. Another is a `git fetch` against a
remote the repository already had. The third is the startup update notice, a fixed query to the
npm registry, at most once a day. The fourth is `gh api`, which the unattended pre-flight and the
run verbs start under the operator's own `gh` login, on REST paths in a closed alphabet, never a
URL, at the host the repository's `origin` names. The fifth is the run verbs' `git push` of the
run's branch to that `origin`.

**A09 Security Logging and Monitoring Failures.** There is no logging or monitoring surface, by
design. No telemetry is collected and nothing is uploaded, so the category's controls have nothing
here to attach to. What replaces them is the artifact trail in this repository.

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
