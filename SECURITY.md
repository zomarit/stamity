<!-- HAND-WRITTEN PAGE — verified against the tree at the 1.15.0 release cut (2026-10-15). -->
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
what you expected instead. The CLI writes into the repository you point it at, plus the four paths
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
| Any repository writer | Steering a compacted session through the resume card, which reads run state back into the model's context and the terminal | After a compaction or on a resume the emitted session-start hook appends the resume card of the run in progress, and on a fresh start (`startup`) only the card of the run in progress whose record's `Branch:` names the branch `.git/HEAD` names, read without starting git (a linked worktree's `gitdir:` followed): an attended record only while it is dated within the last two UTC days, an unattended one at any age, and no card at all on a detached or unreadable `HEAD` (a reftable repository's among them) or for a record with no `Branch:` line. `stamity ledger status` prints the same lines by hand, preferring the run in progress on the checked-out branch, and its `--json` adds the record's `branch`, screened with the lists, and `onCurrentBranch`. On a compaction or a resume with no run in progress, the newest run dated within the last two UTC days whose record head reads gets the closed card instead: that run's closing `Status:` value, its plan and command lines, and its ledger rows counted by state — no lists. The card is counts and pointers read off disk: the run record's head (its status picks the run and is printed on the closed card, and its plan and command lines are printed), open ledger row ids, the reports whose findings never reached the ledger, and lane worktree paths — never a finding's text or a report's body. Only a file whose name matches `<pass>-<role>-r<N>.md` is ever named as a report; any other `.md` file in the reports folder is only counted, as not report-named, because its name is whatever the writer chose. A ledger that is there but is not a regular file, or whose read fails, is printed as could not be read, and one over 4 194 304 bytes (4 MiB) by `lstat` is not read at all and is printed as too large to read — either way never as zero open rows or a partial count, and `ledger status` also warns on stderr; an absent ledger is a run with no rows yet. Each file and folder the card reads is `lstat`-checked at its own name as a regular file or a real directory before it is read, so a symbolic link found at that name is never followed, and the record head (65 536 bytes, read into a fixed buffer), each report (1 048 576 bytes; a larger one is listed unread), the ledger (4 194 304 bytes) and the git metadata (4 096 bytes) are read under byte bounds. Run folders are walked newest first by name and the walk stops at the first run in progress (on a startup, the first on the checked-out branch), so each record head it reads costs at most its 65 536 bytes, and with no such run every record head is read. A run whose id carries `_debug-` (a debug round's record) is never picked, in progress or closed. Its run id is listed instead, when its record head reads in progress, on a `debug rounds open:` line of its own before the card's `next:` line, and that list shrinks like the others; every debug round's record head is read for each card, whether or not a run is in progress. With no run to pick, open debug rounds alone print a card that names no run; a startup prints neither that card nor the closed one. At most 256 report-named files that no ledger row names are checked; the rest are counted as not checked, never listed as clean. Each field is flattened to one line: C0 controls and DEL become spaces; the C1 controls, U+061C, the zero-width marks U+200B–U+200F, the line and paragraph separators U+2028 and U+2029, the bidi controls U+202A–U+202E and U+2066–U+2069, U+2060 and U+FEFF are dropped; the Unicode tag block is kept so the screen still sees it; and the field is capped at 200 characters. The whole card is then screened raw ∪ invisible-stripped ∪ normalized against the session-start screen, and a hit replaces it with one line naming the run (or `no run in progress` on the card that names none) and the pattern id, never the matched text. `ledger status --json` echoes the full lists and the record's status only when neither the card nor those matched: the card names at most ten items of each list and the in-progress card never prints the status, so the full lists and the status, flattened the same way, are screened by the same union on their own | `src/runs/resumeCard.ts::screenCard`, `src/runs/resumeCard.ts::collectResumeCard`, `src/runs/cardSource.ts::buildResumeCardSource`, `src/runs/layout.ts::REPORT_NAME_PATTERN`, `src/runs/layout.ts::UNPRINTABLE_CHARS`, `src/cli/commands/ledger.ts::statusJson` | The screen is the session-start subset, so the exfil-signal rows it drops are not checked here either. What passes is still writer-authored text: a status, plan or invocation line, an open row's id (any string `id` in the committed ledger, which a hand edit sets), an open debug round's run id (a folder name), a report name (lowercase letters, digits and hyphens) or a lane path any repository writer can set reaches the model as data, and the files the card points at — the record body, the ledger's rows, the reports — meet no screen when the resumed session opens them. The link check is an `lstat` before a read by path, not a no-follow open, so a link swapped in between the two is read through, and a ledger, report or git metadata file grown or swapped in between is read whole: the ledger, report and git metadata bounds are the size that `lstat` saw, and only the record head is read into a fixed buffer. The check is on each name's last segment only: `.stamity` itself, the git dir a `.git` pointer file names and the common dir resolved from it are walked as given, so a link at a parent segment is followed. A record written in progress with a `Branch:` line naming a branch greets every fresh session on that branch with its card, an attended one for two days and an unattended one until its record closes, and that card is the same screened counts and pointers. A client whose hook sends no compaction, resume or startup source never prints the card, and the hand-run command is then the only path |
| A verdict role or the orchestrating session | Carrying text into the committed ledger through a report's findings or closures block, or through a manual close's rationale | `stamity ledger append` and `ledger close` are the ledger's one writer, and a row's text is stripped before it is written. A finding's locator and summary must each be one line of at most 300 characters; each is stripped by `printableText` — line breaks and tabs become spaces, and the C0 and C1 controls, DEL, U+061C, the zero-width marks, U+2028, U+2029, the bidi controls, U+2060 and U+FEFF are dropped — and then of the Unicode tag block, U+E0000–U+E007F, which `printableText` keeps for the screens. A closure's rationale (one line of at most 2 000 characters) and a manual `ledger close --rationale` (non-empty and at most 2 000 characters after the strip) get the same two strips. So does the disposition a `ledger close --id --retired` records, under the same 2 000-character cap. From 2026-10-10 (UTC) a new `--retired` value must also parse under the schedule grammar: `fixed <ref>`, `cut <reason>`, `scheduled <place> · by <YYYY-MM-DD>` or `scheduled <place> · when <trigger>`, where a place is a plan file directly under `docs/plans/` with an anchor, a board item or a handoff path. Any other shape is refused with nothing written, and so are a `by` date that names no calendar day, a trigger that is empty, names no event (`later`, `someday`, `eventually`, `tbd`, `hygiene batch`, or filler words alone) or holds a day, and a ref, a reason or a board item made only of such words. Each row whose text lost tag characters is named in a stderr warning, and the write goes ahead. `ledger append --report` refuses a `--source` that differs from the role segment of the report's name, so one role's findings are never filed as another's. `ledger close --report` refuses to run without `--ids`, and a closure whose ledger id was not handed, is not a row or names another run refuses the whole close with nothing written. A report is read only when its name is a report name directly inside the run's reports folder, no segment of its path is a symbolic link, and it is a regular file of at most 1 048 576 bytes, opened no-follow where the platform has it. `ledger append` refuses a report the ledger already carries rows from (`ledger close --report` makes no such check), and both refuse a ledger that is a link or over 4 194 304 bytes (4 MiB), checked by `lstat`, again on the open descriptor and by the read itself | `src/runs/ledgerStore.ts::committedText`, `src/runs/blocks.ts::printableText`, `src/runs/layout.ts::UNICODE_TAG_CHARS`, `src/runs/ledgerStore.ts::resolveReportPath`, `src/runs/ledgerStore.ts::applyClosures`, `src/runs/disposition.ts::parseDisposition`, `src/cli/commands/ledger.ts::runAppend`, `src/cli/commands/ledger.ts::runClose` | The ledger's link check is an `lstat`, and the read after it opens the ledger no-follow where the platform has it and asks the open file's type again, so there a link swapped in between the two is refused rather than read through. Where the platform has no no-follow open, Windows for one, the open follows such a link, and what it read is written back as the lines an append or a close keeps; the write itself lands by rename, which replaces a link rather than writing through it. The strip is not a screen: no deny-scan pattern runs over a finding, a closure or a rationale before it is committed, so an instruction spelled in printable characters lands in the ledger as written. The ledger's text is data a later reader sees unscreened, a resumed session that opens the rows included; the resume card carries only their ids. `--stdin` carries no report name, so its `--source` is checked only as a lowercase slug. A `--stdin` finding whose phase, source and stripped evidence equal a row this run already holds is not appended, and its line names that row's id with `already-filed`. The `--source` check ties the flag to the report's file name, not to who wrote the file. A hand edit to the committed ledger passes through none of this, and an append or a close keeps every line it does not write byte for byte. The schedule grammar reads shape alone: a place is text, never resolved or opened, so a `scheduled` value naming a plan file or an anchor that does not exist parses and retires the row — a known residual in 1.15.0, tracked in `.stamity/inbox.md` (on the `records` branch) as the row `2026-10-10_next-tier/review/95` |
| Any repository writer, a pull request included | Steering a run through the deferral inbox, whose rows a flow reads back into the model's context | `stamity ledger inbox` is the query the inbox's three readers read `.stamity/inbox.md` through — `/st-work` at Frame and at the close, `/st-board`'s `fill` at its intake and `/st-plan`'s shared intake — and it writes nothing. The read refuses before a byte is read: each path segment is `lstat`-checked top down, so a symbolic link at `.stamity` or at the inbox is refused rather than read through; the inbox must be a regular file with one link, so a hard link is refused as a second name for bytes that may sit outside the checkout; and a file over 1 048 576 bytes (1 MiB) is refused. The open is no-follow where the platform has it, the file type, the link count and the size are asked again of the open descriptor, and the read takes at most the ceiling plus one byte from that descriptor, so an inbox swapped for a link or grown after the checks is refused too. A refusal carries none of the file's text and tells the caller not to read the file whole in the query's place. Every bullet is then screened before anything of it prints, as written and as it prints, each beside its invisible-stripped copy and that copy's normalized form, against the block rows of the three catalogs the session-start screen reads, with the exfil-signal rows that screen drops (`remote-exec-pipe`, `send-data-external`, `image-url-exfiltration`) kept in. A bullet over 4 096 characters is skipped unscreened, named by its line number alone. A hit prints `skipped: <line> (<pattern id>)` and never the row's text. A row that parses, and whose severity and location each pass the screen alone, is withheld rather than dropped: matched, it prints its line number, severity and location with the pattern id where its description would stand, so a deferral the screen refuses still comes back to the run that touches its file. A matched row's composed line is screened once more before it prints, every printed field is sanitised, and the unparsed lines and the skip lines are listed up to fifty each. The matched rows and the unparsed lines then print one after another, the headings gone and the rows the filters left out with them, so that sequence is screened as it prints, in windows of adjacent lines, each holding as many as fit in 8 193 characters and at least two: a pattern split over two rows from different blocks, or over two rows kept apart in the file only by a row the query leaves out, is a hit, and a hit withholds every line it spans as a skip line, in the human output and the JSON alike. `/st-work`'s close writes the inbox through `stamity ledger inbox-write` wherever a CLI form runs and the installed copy has that verb, which takes the rows to append on stdin and the bullets to remove by their `Ref:` values, so there the session never opens the file to edit it. The call is all or nothing: each bullet, the bullets joined, and each parsed row's fields pass the same screen, and a hit refuses the whole call, naming the stdin line and the pattern id and never the text; every appended row carries a `Ref:` that holds no comma, since `--remove` lists its `Ref:` values comma-separated, and that no other appended row carries, a `Ref:` into a run's ledger must name a `deferred` row with no `retired` value, that ledger read no-follow under the inbox read's rules — a symbolic link, a hard link or a file over 4 194 304 bytes (4 MiB) is refused unread — and any other `Ref:` lands only as a re-date of the bullet the same call removes; a removal matches exactly one bullet; and a row whose `Ref:` a bullet already carries is reported `already-filed` only where that bullet has the same severity, location, description and source, and otherwise refuses the call, naming the bullet's line. The write takes the inbox's lock, then the lock of each run ledger a `Ref:` names, in path order, reads the inbox again under them through the query's no-follow reader, decoding it strictly so an inbox holding a byte that is not valid UTF-8 is refused, naming the line and none of its text, rather than rewritten with that byte replaced on a line the write never touched, and checks each referenced ledger row again, so a concurrent `ledger close` cannot move one between that check and the write, and lands by an atomic rename inside `.stamity/`, so a link planted at the name is replaced, never written through; a ledger lock it cannot take refuses the call; an absent inbox is created holding the schedule heading and the rows. Its output names lines and `Ref:` values, never a row's text | `src/cli/commands/ledger.ts::readInbox`, `src/cli/commands/ledger.ts::INBOX_SCREEN`, `src/cli/commands/ledger.ts::screenInboxLine`, `src/cli/commands/ledger.ts::inboxSequenceHits`, `src/merge/atomicWrite.ts::isSharedRegularFile`, `src/cli/commands/ledger.ts::runInboxWrite`, `src/runs/ledgerStore.ts::writeInbox` | A pattern gate is a gate, not a proof. In 1.14.0 the query read one bullet at a time, so a pattern split over two adjacent bullets passed (tracked in `.stamity/inbox.md` on the `records` branch as the row `2026-10-10_next-tier/review/26`); the screen of the printed sequence now withholds that split, and the one in different blocks or across a filtered row, but it reads bounded windows, not the whole output: every two adjacent lines share a window, and so does every run of lines whose joined text is at most 4 096 characters, so a pattern spread over three or more printed lines longer than that together can fall in no one window and pass. It reads only what the query prints: a row the query leaves unmatched is not in the sequence, and a hand read of the file is screened by none of it. The query is the only screen on a read, and only the close's write goes through the engine. The inbox's other writes still edit `.stamity/inbox.md` with the client's file tools: `/st-board`'s `fill` removing an entry it triaged and `/st-plan` appending a follow-up row, and beside them `/st-rework`'s and `/st-pr-resolve`'s appended rows, the dep-audit skill's, and `/st-quick`'s removal of a fixed row's bullet. No text limits such an edit to the lines it changes, so on a client whose edit tool reads a file before it writes, that read brings the whole inbox, a withheld row's text included, into the orchestrating session's context, which the query had kept out — a known residual, tracked as the Warning follow-up of the run `2026-10-12_board-writes`. And `/st-quick` names no query where it matches a batch's items against the inbox's rows. Where the CLI or the query is absent, each of the three readers reads the whole file, unscreened, and says so, and a hand read of the file passes through none of this. So does the close's own write where no CLI form runs or the installed copy has no `inbox-write`: it appends with the file tools and records `inbox: by hand (no CLI)` in its record, the same whole-file exposure as the other writers' edits. What passes the screen is still writer-authored text that reaches the model as data |
| MCP server | Poisoning a tool description a model reads | Tool descriptions and their element surfaces are scanned at emission | `src/mcp/descriptionScan.ts::scanMcpEntry` | A server that redefines its tools after install is NOT detected — see below |
| A generated agent | Using a tool its role was never granted | Deny-by-default per-agent allowlist over tool categories. The named roster is serialized into the policy document the emitted pre-tool-use guard reads, pre-sanitized to exactly what an access check would authorize. The guard refuses with a machine-readable reason code. On Claude Code its command is anchored on `${CLAUDE_PROJECT_DIR}` and fails closed: a guard that cannot launch exits 2 rather than letting the call through, which it did for every call after a `cd` out of the repository root before 1.9.0. On Claude Code in the repository layout, the four verdict roles may `Write` only a regular file matching their own `writePaths` under the repository root the guard's own location names; symlinks, `..` segments, hard links and `Edit`/`NotebookEdit` are refused. The same four roles and the spec-author also carry `Bash` there, which the guard admits one command at a time only when it is `git` followed directly by `log`, `show`, `diff`, `rev-list` or `merge-base` (`src/roster/agentPolicies.ts::READ_ONLY_GIT_SUBCOMMANDS`), is at most 1 024 characters, is spelled only in the characters the guard's allowlist names (ASCII letters and digits, the space, and `.`, `_`, `/`, `:`, `@`, `^`, `~`, `=`, `+`, `,` and `-`), so that no shell syntax rides along (no quote, `;`, `\|`, `&`, `$`, backtick, redirect, glob, brace or newline) and `%`, `#`, `!`, a parenthesis, a tab and any non-ASCII character refuse as well (`git log --format=%h` is refused), and carries no option before the subcommand and no later option starting `--output`, `--ext-diff`, `--textconv`, `--show-signature`, `--help` or `--no-index`; any other command refuses as `GIT_COMMAND_DENIED`, `PowerShell` is never admitted | `src/tools/allowlist.ts::buildAgentToolPoliciesJson`, `src/roster/agentPolicies.ts::AGENT_POLICY_ROSTER` | ONE enforcement point, and it is the emitted client-side guard — the in-process check is built but unwired, see below. On a client whose hook payload names no agent the guard is telemetry, and the fail-closed tail is unmeasured under the PowerShell fallback a Windows host with no Git Bash uses. A verdict role may create or overwrite any report of its own role, in any run, an earlier round's included; the per-role pattern keeps it off the other roles' reports, not off its own. The git check reads the command line only: a diff driver, a textconv filter or `log.showSignature` that the repository's or the user's git config runs by default still runs on `git log`, `show` or `diff` without appearing in the command |
| An agent | Piping an unbounded payload through the `learn`, `handoff` or `ledger append` write path | Stdin is read under a 250 000-byte ceiling and REJECTED past it, not truncated. On the `learn`, `handoff` and `ledger append --stdin` reads the bound counts bytes rather than characters, so a body of multi-byte UTF-8 is refused well short of that many characters. The same number is applied as a CHARACTER ceiling over a user-content overlay body. `stamity validate` reports a body past it as a finding, and the engine's read of that body refuses it | `src/guard/promptGuard.ts::MAX_USER_CONTENT_LENGTH`, applied over stdin in `src/cli/commands/learn.ts`, `src/cli/commands/handoff.ts` and `src/cli/commands/ledger.ts`, and as a character ceiling in `src/cli/commands/validate.ts` and `src/content/catalog.ts::readOverlayBody` | The 500 KB and 1 MB phase bounds beside it are unwired — see below |
| Concurrent writer, or anything at the target path | Torn writes, symlink redirection, clobbering content the engine does not own | Temp file created `O_EXCL \| O_NOFOLLOW`, plus an atomic rename under a cross-process lock. Content outside managed blocks is preserved and reclaimed | `src/merge/atomicWrite.ts::atomicWriteFile`, `src/merge/managedBlocks.ts::extractCustomContent`, `src/merge/reclaim.ts::sweepReclaimCandidates` | — |
| Any repository writer, a pull request included | Editing the committed `.stamity/manifest.json` so `sync` or `clean` deletes or overwrites a file the engine does not own | The ledger is bounded to the paths a stamity release writes. A row outside that bound refuses the whole manifest: `check` fails naming the row, and `sync` and `clean` act on nothing. An import decision binds only the four instruction files `init` imports. Inside the bound, a delete or a backup-free overwrite needs a recorded hash that matches the bytes, or a managed block that spans the file, and a row with no hash proves nothing by itself. Before a backup-free overwrite at an `AGENTS.md` in any folder, `AGENTS.override.md` and the Copilot setup workflow, the bytes must also show the engine wrote them, and `CLAUDE.md` is proved only by a managed block that spans it. At those paths and at `.github/hooks/stamity.json`, an overwrite that the incoming rendering does not prove (the bytes on disk equal it once `\r\n` reads as `\n`) and that no managed block spanning the file proves keeps the previous content recoverable: with no `.bak` and a notice when the file is tracked and clean in the repository whose top level is the setup root, since git history holds it and the overwrite shows in `git status`, and behind a verified `.bak` and a warning otherwise: for an uncommitted or untracked file, a setup in a monorepo subfolder, a charter inside a submodule, and whenever git is absent or a git check fails. Those checks run git from the setup root, never the file's own folder, started as the next row states, which is where a folder shaped like a bare repository is refused and how far that holds, and no file-system monitor or filter command runs: the file's bytes are compared with the committed blob in process. A whole-file delete at an engine-named file in a content folder, an `AGENTS.md` in any folder, `AGENTS.override.md`, `CLAUDE.md`, the Copilot setup workflow, `.github/hooks/stamity.json` and Cursor's two 1.11.0 guard names needs more: bytes that hash to a rendering the running engine produces at that path for the clients the setup wrote for (at the two guard names, the guard 1.11.0 rendered for that setup), or a managed block that spans the file. Those clients are the manifest's and any client a ledger row names, so a forged row can add one. When one of them reads per-folder files, the rendering at every requested `<dir>/AGENTS.md` also includes the root charter as the engine renders it before an import decision on the root, so there only a byte-for-byte copy of the engine's own charter becomes deletable. There a forged row and hash, and an owner's copy of the charter's headings, no longer prove a delete; a file no rendering proves is kept and named. A Cursor hooks entry that runs an old guard name is the engine's only when it equals the entry 1.11.0 rendered and its script is absent or that rendering. `check` names every path a `sync` would reclaim before any sync runs, and a reclaim under a `.stamity/`, state or pack folder that is itself a link is refused | `src/manifest/ownedPaths.ts::ownedPathDefect`, `src/manifest/ownedPaths.ts::bytesShowEngineOutput`, `src/manifest/ownedPaths.ts::needsRenderingProof`, `src/cli/engine/emissionWrite.ts::engineRenderingsFor`, `src/merge/reclaim.ts::sweepReclaimCandidates`, `src/merge/safeWrite.ts::safeWriteFile` | The manifest carries no signature, so a forged row INSIDE the bound whose hash matches the bytes still proves what a recorded hash proves on its own. Three cases are known residuals. (1) At an instruction file and at `.github/hooks/stamity.json`, an overwrite of a file git tracks with no uncommitted change takes no `.bak`, under a forged row hashing an owner's file too: the owner's previous content is in git history, recoverable, and the overwrite shows in `git status` and in the notice `sync` prints — the declared default of the rows `build/62` and `review/109` of the ledger `.stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl` (on the `records` branch), against the alternatives of a `.bak` on every such overwrite or a machine-local record of the hashes this checkout's engine wrote. Git before 2.38 ignores `safe.bareRepository`, so there the check rests on the look the next row states: for a tree git checked out, a setup root with no `.git` of its own, such as a monorepo subfolder, that holds committed bare-repository files is refused before git starts, its index answers nothing, and that overwrite takes the `.bak`; what the look leaves on such a git is the next row's residual `2026-10-11_release-1-14-0/fix/13`. Elsewhere inside the bound a backup-free overwrite still rests on the recorded hash alone, so a forged row hashing an owner's file at another path the engine writes lets `sync` replace it with no `.bak`. A delete at the engine's state and pack folders and at the `stamity-` Cursor guards still rests on the recorded hash alone; at the guards it is tracked as the deferred row `2026-10-08_inbox-pass/pass/4` of the ledger `.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl` (on the `records` branch). (2) The rendering is built from the setup's installed packs and overrides, which a repository writer can plant too. A planted pack (a folder under `.stamity/packs/` and its `pack:` rows) or override whose rendering copies an owner's file byte for byte, beside a forged row hashing it, still proves that delete through `sync`, `clean`, and `clean --pack`, the verb the engine prints to remove that pack. The proof renders every installed pack whatever the org policy says, so a planted pack folder widens what it renders even under a policy that denies every pack, though that pack is never projected — named by the rows `review/63`, `review/65` and `review/69` of the ledger `.stamity/runs/2026-10-08_maintainer-tooling/ledger.jsonl` (on the `records` branch). (3) A selected `[mcp_servers.<id>]` table in `.codex/config.toml` is proved by its record alone, and so is the bare `[mcp_servers]` table the engine renders when no server is selected: a forged `coOwned` record that hashes an owner's bare `[mcp_servers]` makes it the engine's, and owner servers written under it as dotted keys are then refreshed away with no `.bak` — tracked as the deferred row `2026-10-08_inbox-pass/pass/3` of the ledger `.stamity/runs/2026-10-08_inbox-pass/ledger.jsonl` (on the `records` branch), and first named as the row `review/50` of the ledger `.stamity/runs/2026-10-07_security-fixes/ledger.jsonl` (on the `records` branch). `check` names each such reclaim before a `sync` acts on it |
| Any repository writer, a pull request included | Committing a folder in the shape of a bare repository where the engine runs git, at the setup root or above the folder a verb runs in, so that git reads that folder as the repository and takes its configuration, index and refs | Every git process a CLI verb starts outside the `worktree` verbs, the run verbs and the unattended pre-flight's push read is started one way: the working-tree read of `sync`, `check` and `init`, the history read of `init`, the origin read of `init` and `config detect`, the branch and commit reads of `handoff`, every read of `gate classify` and `gate scan`, and the tracked-and-clean check before an overwrite. Each call passes `safe.bareRepository=explicit`, with which git from 2.38 opens a bare repository only where it is named to it and never by discovery (an older git ignores the option without an error), and `core.fsmonitor=false`, so no file-system monitor command runs whatever any configuration says; and each runs in the caller's environment with every `GIT_*` variable left out and `GIT_OPTIONAL_LOCKS=0` set, so a `GIT_DIR` inherited inside a git hook points no read at another repository. The `worktree` verbs pass the same two options and keep the caller's whole environment, git's own variables included: they run `git fetch` and `git worktree add` in the operator's own repository, with the operator's remote, credentials and hooks, and an external `GIT_DIR` is a layout they answer for. The run verbs, `stamity run start`, `run checkpoint` and `run end`, start every git call but the secret scan's and the prerequisite read's, which are `gate`'s own on the pinned runner, through a write runner of their own: the same two options and `push.followTags=false` ahead of every command, so a push carries no tag whatever the repository's configuration says, git by the absolute path the next row states, `:(literal)` magic on every path after `--`, so a listed path stages that file and no other, and `GIT_TERMINAL_PROMPT=0`, so a push that needs credentials fails rather than waits on a prompt nobody answers. That runner keeps the caller's environment, which is where a push finds its credentials, and leaves out only the variables that name another repository, work tree, index or object store (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_COMMON_DIR`, `GIT_NAMESPACE`, `GIT_PREFIX`) and the four that set how git reads a pathspec, so a git hook's `GIT_DIR` points no commit at another repository. In an unattended run it also leaves out git's program-valued variables (`GIT_SSH_COMMAND`, `GIT_ASKPASS`, `GIT_EXEC_PATH` and seven more, `SSH_ASKPASS` among them), in any letter case and with an empty value too, and sets `GIT_ASKPASS` to the empty string, so no askpass program runs; each verb prints the names it removed, `removed from git's environment: <names>`, and lists them in its JSON's `gitEnvRemoved`, never a value. The `GIT_CONFIG_*` variables stay, since the pre-flight vetted them, and so do `PATH`, `HOME` and `XDG_CONFIG_HOME`. The unattended pre-flight's read of how `git push origin` pushes starts git as the pinned runner does, with the two options, the look and every `GIT_*` variable left out, and then puts back the `GIT_CONFIG_*` variables the caller's environment sets, so it reads the configuration the push will apply, and a read that fails refuses the start. Before any of these calls starts git, the engine takes a look of its own, with no git in it: from the real path of the folder git is to run in it walks towards the filesystem root, asking `lstat` whether a name exists, its type and its device, and `stat` the type of each `.git` entry, as git takes it, and reading no file's content. A level is refused when it passes git's own test for a repository folder by entry names: `HEAD` beside `commondir`, or beside both `objects` and `refs`, where a link counts as the entry it stands in for. The walk ends without a refusal at a level whose `.git` is a regular file (or a live link to one), or a folder (or a live link to one) that passes the same test; at the first level on another file system than the starting folder's, except on Windows; and at the filesystem root. Those are the places git's own walk is taken to end, and residual (1) names where that is not so. On a refusal no git is started and the caller reads it as git not answering: `sync`, `check` and `init` read the working tree as unavailable and `check` warns that git was not started because the folder or one above it has the layout of a bare repository, naming no git command to run there and saying to run no git in that folder or in any folder under it; `sync`'s closing step after a write, `init`'s no-git note and its refusal when the question is declined say the same and name no git command; `check`'s row and `init`'s note also say to start no flow there until the folder is moved, and `init`'s ready panel and its `--json` document open their next steps with moving it, before a client or a flow is started; `init` seeds no history, `init` and `config detect` read no platform, `handoff` reads no ref, `gate classify` gives `product` and `gate scan` exits 1, each saying that git was not started and naming no git call as failed, the overwrite takes the `.bak`, and a `worktree` verb refuses with that cause and names no git command. So for a tree git checked out, a committed folder of that shape does not answer a read started that one way: on git 2.38 and later by the option and by the look, on an older git by the look alone. The `worktree` verbs take the same look, handed the environment they keep, and it reads three of git's variables there: with `GIT_DIR` set no look is taken, since git then runs no discovery; `GIT_OBJECT_DIRECTORY` stands in for `objects`; and with `GIT_DISCOVERY_ACROSS_FILESYSTEM` set to any value git does not read as false (empty, `false`, `no`, `off` or a zero) the walk does not end at another file system. It reads no other variable | `src/cli/engine/gitStatus.ts::gitCheckRunner`, `src/merge/safeWrite.ts::runGitCheck`, `src/worktree/git.ts::runGit`, `src/merge/safeWrite.ts::gitDiscoveryMeetsBareShape`, `src/cli/engine/gitWrite.ts::gitWrite`, `src/cli/commands/gate.ts::readPushIdentity` | The claim is for a tree git checked out and for the git the CLI's verbs themselves start, and no further. It is the verbs' claim and not the library's. The package's API carries the origin read as a function too, `src/workspace/git.ts::detectRepoGitIdentity`, and its default is not the pinned runner: a caller of the library who passes it no runner starts git by an absolute path, as the next row states, and as plain git in every other way, with neither option, no look and the caller's whole environment, and in a folder of the shape that git can open, it returns the origin the folder itself names. `init` and `config detect` pass that function the pinned runner, so no verb reaches the default. No git older than 2.38 was run for it: what such a git opens is read from git's source and was probed on git 2.52 with the option switched off. The look decides by names alone, so it also refuses a level that holds the names and that git could not open, and a verb run there reports git as not answering. Four cases are known residuals in 1.15.0. The first three are each tracked as the row named of the ledger `.stamity/runs/2026-10-11_release-1-14-0/ledger.jsonl` (on the `records` branch); the fourth is tracked by this page alone, since the row that tracked it closed with the flows' stop below. (1) On a git older than 2.38, a `.git` folder that holds those names and that git cannot open, one whose `HEAD` holds nothing git can use for instance, ends the look as safe, while that git walks past it and opens a folder of the shape at that level or at any level above it. That walk was run, on git 2.52 with the option at its default, which is how an older git reads it, and on no older git: started in a folder holding such a `.git`, and in a folder below one, git opened a folder of the shape at the same level, one level up and two levels up. No commit can hold a `.git` entry, so this takes a leftover or damaged `.git` on the operator's own machine, or a tree that did not come from git (`2026-10-11_release-1-14-0/fix/13`). On git 2.38 and later, in that layout, git itself refuses the folder under the option the engine passes (run on git 2.52), and `check` then prints its other `git-available` text, which names no git command that looks for a repository. The next two are the `worktree` verbs' alone, because those verbs keep the caller's git environment: each variable comes from the environment the verb is started in, and the engine sets neither. (2) With `GIT_COMMON_DIR` exported and no `GIT_DIR`, a git older than 2.38 takes part of a repository from the folder the variable names and so opens a committed folder on fewer entries than the look asks for; the look does not read that variable, so it passes a folder that such a git opens (`2026-10-11_release-1-14-0/fix/14`). (3) With `GIT_DIR` set the verbs take no look, whatever the value. Git resolves a relative value against the folder it runs in, so such a value can name a folder the tree holds, and a committed folder of the shape there is opened on any git version, since `safe.bareRepository=explicit` allows a repository that `GIT_DIR` names; this one is read from the code and from git's documented behaviour, not run (`2026-10-11_release-1-14-0/review/51`). (4) Everything above is the git the CLI's verbs themselves start, and no other. Git that anything else starts carries neither option and takes no look: a client's own tools, a flow's session and the sub-agents it dispatches, and the operator's shell. The roles that read a change run `git diff`, `git show` and `git log` themselves; their text allows no `-c` option, and on Claude Code the emitted guard refuses any option ahead of the subcommand, so they cannot pass the two options. Started in or under a committed folder of the shape that git can open, such a git reads that folder as the repository, as the Vector column says. That does not take a refusal by the look. The look is taken from the folder a verb runs in and walks upward, so a committed folder of the shape elsewhere in the tree, below the setup root, meets no look and no warning: `check`'s `git-available` row says nothing of it and passes where git answers at the setup root, and where git can open that folder, git that anything other than the engine starts in or under it reads it all the same. Where the look does refuse a folder, `gate scan` and `gate classify` say there that git was not started and that plain git would open the folder, and the two flows that run them stop on that `reason`: `/st-work` stops the run as `BLOCKED_DEPENDENCY`, quoting it, and `/st-quick` stops the batch, runs no later step and no git command in that folder, the commit included, and gives the reason under `Not done:`. In 1.14.0 both read it as a scan that did not run and went on with git of the session's own. The stop comes at the `gate` call, so git the session started before that call has already run there, and only those two flows read the reason as a stop; `check`'s row, `init`'s note and the first of `init`'s next steps say there to start no flow until the folder is moved. Git documents one setting against this, and it is the operator's to make: `safe.bareRepository` set to `explicit` in their own user-level or system-level git configuration. Git reads it from 2.38, and only from the system and user-level configuration or the command line, never from a repository's own file; an older git ignores it. Every git process that reads that configuration then opens a bare repository only where `--git-dir` or `GIT_DIR` names it, whoever starts it, so a folder of the shape that git merely discovers is refused, wherever in the tree it sits: the setting covers a folder below the setup root as it covers one the look refuses. It holds per user or per machine, so a CI runner needs its own. It also changes work inside a real bare repository: git run in one without naming it is refused too, and has to be given `--git-dir` or `GIT_DIR`. The engine neither sets that setting nor checks for it. This residual is read from the engine's code and the flow texts, not from a run of a flow; what the setting does is read from git's manual and was run on git 2.52. The run verbs' runner keeps every `GIT_*` variable it does not name, `GIT_CONFIG_*` among them, and in an attended run `GIT_SSH_COMMAND` and git's other program-valued variables too, so configuration the environment supplies applies to a run's commits and pushes; the pre-flight reads it the same way, and a value changed after the pre-flight goes unseen, as "Cloud and unattended runs" below says |
| Any repository writer, a pull request included | Committing a file under git's program name in a folder the engine runs git in, so that the file is started in git's place | Every place that starts git starts it by an absolute path, never by its bare name: the pinned runner of the CLI's verbs, the tracked-and-clean check before an overwrite, the `worktree` verbs' runner, the run verbs' write runner, and the library's origin read called with no runner. Each resolves git once per working folder and `PATH` value, by a walk of the engine's own, and starts the path that walk found. The walk goes over `PATH` in order and takes only an entry that is a full path. An empty entry and a relative one are skipped, since both name the working folder or a folder under it, and so is an entry whose real path is the working folder's, however it is spelled: a trailing separator, a link, another letter case on Windows. In each entry it tries the file names the runtime itself tries for a bare name: on POSIX the name as given, which must be a regular file with an execute bit, and on Windows the name with `.com` added, then with `.exe`. The first file found is started, by the entry as `PATH` spells it, so git found on `PATH` is the git that ran before. Where no entry holds git, no program is started and each caller answers as it does on a machine with no git installed: `sync`, `check` and `init` read the working tree as unavailable, `gate scan` exits 1 saying no git binary was found, the overwrite takes the `.bak`, a `worktree` verb refuses, and `check`'s `git-available` row, `init`'s no-git note and that refusal say the engine found no git to start and which entries it takes git from, naming no git command to type. Every release from 1.0.0 to 1.12.0 named git bare wherever it started it and left the lookup to the runtime. On Windows the runtime looks for a bare name in the folder the child runs in before any `PATH` entry, and on POSIX in each folder `PATH` names, which is that folder or a folder under it where an entry is empty, relative such as `.` or `bin`, or a full path to the folder or to one under it, so a file of git's name in such a folder was the program started, with the operator's rights, by every verb that reads git | `src/shared/programPath.ts::resolveProgramOnPath`, `src/shared/programPath.ts::gitProgramFor`, `src/hooks/portableRunner.ts::buildPortableHookRunner` | The claim is for the git the engine itself starts and for the folder that git runs in, and no wider. Five things stood outside it as known residuals in 1.14.0, each given with what an operator can do about it; (2) is closed in 1.15.0 and (1) is narrowed, and (1), (3), (4) and (5) are known residuals in 1.15.0. (1) The walk takes the `PATH` the engine is started with as given, with one kind of entry left out: an entry that is a full path to some other folder is searched as it stands, a folder inside the checkout included, so whatever sets that `PATH` chooses the git. The kind left out is a `node_modules/.bin` folder, at any level. `npx` and `npm exec` put the project's, and that of each folder above it, ahead of the operator's own entries, and in 1.14.0 a file of git's name there was the git the engine started, on every platform (seen on one POSIX host with npm 10.9.8, not run on Windows). Since 1.15.0 the walk for git skips every such entry, so that file is never started as git. Any other entry into the checkout still chooses the git. This row holds where the `PATH` the engine runs under names no folder of the branch but its `node_modules/.bin`: with a copy of the CLI installed outside the checkout and started under the operator's own `PATH`, or under `npx` with no other entry into the checkout. In a checkout of work they have not read, an operator reads the `PATH` a verb will run under for a folder of the checkout before running it. (2) Closed in 1.15.0: the hook runner the engine emits for Codex, Copilot and Cursor, `stamity-portable-hook.mjs` under `.stamity/generated/hooks/`, starts every launcher by an absolute path, never by its bare name. A launcher written `node` or `node.exe`, in any letter case on Windows, as every hook the engine writes is, starts as the interpreter the runner itself runs under, so no lookup by name takes place. Any other launcher, `bun`, `deno`, `python3` or `ruby`, which a pack or a hook definition of the operator's can name, is found by the walk this row describes for git, done again inside the runner, which is a standalone script: only a `PATH` entry that is a full path, never one whose real path is the folder the hook runs in, and on Windows the name with `.com`, then `.exe`. A launcher that walk does not find starts nothing, and the hook fails with the runner's fault exit for that row, naming the launcher, never an exit that lets a blocked call through. A launcher written as a path is resolved against the folder the hook runs in, as written. The runner a `sync` of 1.14.0 wrote started any launcher but `node`, `node.exe` included, by its bare name with the repository root as the working folder, so on Windows a file there under the launcher's name with `.com` or `.exe` added was started in its place; the runners of 1.7.0 to 1.12.0 started `node` that way too. A `sync` of 1.15.0 rewrites the runner, and until it runs the older runner stays in place. The runner's walk takes `PATH` as given and skips no `node_modules/.bin` entry, so (1) holds for a launcher as it stood for git in 1.14.0: an entry that is a full path into the checkout, `node_modules/.bin` under `npx` for one, is searched as it stands. The runner's tests hold the Windows letter cases and the root's program file, and run them on Windows only. (3) The command lines the engine writes for a client to start, the hook lines and the MCP launchers, name their program bare as well: `node`, `npx`, or the launcher a pack or the catalog names. The client starts them and finds the program by its own rules, in the folder and under the `PATH` it runs with, and how each client does that was not checked. An operator starts a client under a `PATH` that holds no folder of the checkout, and on Windows first looks at the repository root for a program file under the name of `node` or of a launcher a hook names; "Hook and MCP execution" below names the files that hold those lines. (4) Git that anything else starts is found by that starter's rules and not by this walk: the operator's shell, a client's own tools, a flow's session and the sub-agents it dispatches. The Windows command prompt, for one, looks in the current folder before `PATH` (its documented behaviour, not run for this page). In a checkout of work they have not read, an operator looks in the folder for a file of git's name before running git there, or starting a client or a flow there. (5) What git in turn starts, a hook, a credential helper, a transport program such as ssh, git finds by its own rules, from its configuration and its `PATH`: the absolute path is for git alone, and how git looks those up was not checked. The `worktree` verbs' `fetch` and `worktree add` run the repository's hooks and transport, as the row above says. Which hooks and which programs is set by the `.git` folder and by the operator's git configuration, which no commit carries, though a hooks folder that configuration names can be a folder of the checkout, `.husky/` for one. An operator reads the hooks git is set to run, and the commands that configuration names, as programs those verbs run. Beside those five, an operator whose only git sits behind an entry the walk skips, an empty or relative one, a `node_modules/.bin` one or the folder itself, gets git reported as not found until its folder is on `PATH` by its full path. That the runtime on Windows looks in the working folder first is read from its source (libuv's `search_path`), not from a run. The walk's Windows rules are held by cases that hand the platform in and run on every host, and one case, which seeds a program file under git's name at a repository's root, runs on Windows only |
| Any tool or person editing a client config the engine also writes | Losing an owner's deny rule, allow row, hook entry or Codex table to `sync`, `clean` or `--force` | `.claude/settings.json`, `.cursor/hooks.json` and `.codex/hooks.json` are owned entry by entry, and `.codex/config.toml` table by table. The engine records each allow row, hook entry, member and table it wrote by hash and keeps everything else byte for byte. In `.claude/settings.json` it also writes the person-only `permissions.deny` rows (deletions, force pushes and acts that cannot be undone) and `permissions.ask` rows (the acts that can be undone) the file lacks, after the rows already there, and removes no `permissions.deny` row and no `permissions.ask` row: `sync` keeps every row of both lists byte for byte and in place, an owner's row equal to an engine row included, whatever the ledger's age, and `clean` leaves every row of both lists and names those equal to an engine row of either table, for the person to remove by hand, since a hash cannot tell the engine's row from an owner's equal one. An owner's deny row equal to an engine ask row still refuses, since the client reads a deny row before an ask row. On Claude Code it writes no allow row since 1.14.0, so it pre-approves no tool there: every release from 1.1.0 to 1.12.0 rendered `Read`, `Grep` and `Glob` into `permissions.allow`, and the first `sync` on 1.14.0 takes them out by the ledger it finds. Under a ledger 1.12.0 wrote, which records each row, it removes each of those three that the ledger records, with no backup, while an equal row the ledger does not record stays the owner's. Under a ledger from 1.11.0 or older, whose rows carry no such record, all three leave by their names alone, an equal row the owner added included: with no backup when the file still hashes to what the ledger recorded, and behind a verified `.bak` and a warning when it was edited since. It removes one of its own entries, never a deny row, without a verified `.bak` only when the entry is recorded and lies inside what it can prove by path or by re-rendering; a recorded hash outside that bound proves nothing. `--force` changes no owner content in these files, and a shape the engine cannot merge beside is refused as `co-owned-shape`. `clean` keeps a hook script that a kept hooks file still runs. `check` fails on a `.cursor/hooks.json` entry Cursor rejects, and on a kept key that turns Codex's `hooks` feature off | `src/manifest/coOwnedJson.ts::planCoOwnedJson`, `src/manifest/coOwnedJson.ts::reduceCoOwnedJson`, `src/manifest/codexConfigToml.ts::planCodexConfigToml`, `src/manifest/hookDocuments.ts::cursorHookDefects`, `src/manifest/claudeSettings.ts::reduceClaudeSettingsToForeignContent` | An entry, allow row or table that another tool or a pull request adds is the owner's. It is kept, and `check` does not report it as drift, because `check` previews exactly what `sync` would write. A deny or ask row the engine wrote stays after `clean` until the person removes it, which `clean` names. No release up to 1.15.0 wrote either list, so no installed file holds a row that moved from deny to ask; a checkout synced from an unreleased build before 1.16.0 keeps the deny rows that build wrote for acts that now ask, and since the client reads a deny row first, those acts stay refused there until the person removes the rows, which `clean` names. Read these four files in review as code that runs |
| A pull request author | Dropping a client together with its guards, or moving the pinned release, so the committed setup still checks green | `check --expect-version` and `--expect-tools` take the release and the client set from the caller, and fail with `EXPECTATION_ERROR` (exit 1) when the repository records another. `--expect-version` also compares the running CLI | `src/cli/commands/check.ts::evaluateExpectations` | Only as strong as its caller: the values must come from somewhere the pull request cannot edit, such as a required workflow's input. Without the flags, `check` is unchanged and trusts the committed manifest |
| A pull request author, or an agent working on a change | Lowering the checks its own change gets, by editing the class file inside that change | `stamity gate classify` names the class a flow's gates follow. With a `--base` that resolves, it reads `.stamity/change-classes.json` only as the base commit's blob (`git cat-file blob`, so no textconv or filter rewrites it): the head copy and the work tree's are never read, and a change to the file is `security-sensitive` by a built-in rule. A base with no file gives the built-in rules alone. A base copy the validator refuses gives at least `product` and applies only its raising entries (`product`, `public-contract`, `security-sensitive`), never a lowering one, and an entry there that is not a file is refused, never read as absent. With no `--base`, no class file is read. An unclear read never gives a class below `product`: a change git could not read (no work tree, no git binary, a timeout, an oversized output) gives `product` with the failure named and no lens, a failed read of its lines keeps the path classes and gives `security-sensitive`, and a `--base` that does not resolve gives no class and exit 1. The project root is found in the base commit's tree too, so a `.stamity/` folder the change adds moves no boundary | `src/cli/commands/gate.ts::readBaseClassFile`, `src/change/classify.ts::parseClassFile` | Only as strong as its caller. The verb names a class and its checks and runs none of them: the flow that asked runs the gates. The base is the caller's word, so a base that already holds the change's edit to the class file reads that edit. A change git could not read gets `product`, which sits below the `public-contract` or `security-sensitive` its paths might have earned: the checks are the same three, and what is shed is the security lens. `/st-work` runs that lens at every tier when the `reason` names a failed read, and `/st-quick` then moves a batch whose paths the security agent's trigger table names to `/st-work`; a caller that reads the class alone gets no lens. Two cases are known residuals in 1.15.0, each tracked in `.stamity/inbox.md` (on the `records` branch) as the row named, both in the line rules that raise a change to `security-sensitive` by what its changed lines hold. The `secret-name` rule reads a long line in windows of 4 096 characters that overlap by 1 024, so a match longer than 1 024 characters that straddles a window's edge is missed (`2026-10-08_product-core/review/139`). And no line rule covers a raw socket call (`net.connect`, `net.createConnection`, `tls.connect`), so a change whose lines hold one gets no lens from them (`2026-10-08_product-core/review/201`) |
| Anyone holding a fork's package name on the public registry | Serving a look-alike to a `--registry` fork's generated CLI call on a machine with no mapping for the fork's scope | A fork made with `scripts/fork-identity.mjs --registry` names its registry in every pinned call it renders: generated bodies, hook hints, guard messages, the CLI's remedies, the update banner and `sync --help`, as `npx -y --@<scope>:registry=<url> @<scope>/stamity@<version> <verb>`. The URL must be plain https with no credentials, query, fragment, `%` escape, space or shell character. `fork-identity.mjs` refuses any other URL before writing, and a `publishConfig.registry` set outside that rule by hand renders `npx --no`, which runs only an installed copy | `src/shared/cliCall.ts::scopeRegistryArg` | Whether PowerShell's `npx.ps1` shim passes the `--@<scope>:registry=<url>` word through intact is unmeasured. The canonical package's calls name no registry and resolve through npm's configuration, as before |
| Anyone reading the repo | Credentials committed into generated config | MCP configs emit the reference form each dialect's own client resolves, never literal values. That is `${VAR}` for Claude Code, `${env:VAR}` for Cursor, `${input:<id>}` plus an `inputs` entry for VS Code, `$COPILOT_MCP_<VAR>` for Copilot, and the variable name alone for Codex. Values are scanned for known secret shapes and masked wherever a finding is printed | `src/mcp/emit.ts::envPlaceholder`, `src/mcp/secretScan.ts::detectSecrets` | Shape detection catches known shapes on sight, and nothing else |
| Anyone committing to the repository, an agent included | Committing a credential in a change's added lines, or committing one and removing it again before the push | `stamity gate scan`, which `/st-quick` and `/st-work` run before their gates, reads the lines a change adds, its untracked files included, and with a `--base` the added lines of every commit since that base, merges left out, so a value committed and removed again still stops the run. Each added line is taken apart into name and value pairs and read by the shipped secret patterns. A hit names its path, its line and the rule, and its commit when it comes from history, never the value, masked or not, and the scan has no allow-list and no waiver. A hit exits 1. So does a change the scan could not read (a git failure, a base that does not resolve, a failed line or history read), and so does an added line over 262 144 characters, which is not read and is named in the `reason`, so a read that failed never exits 0. A code file the read cannot show is listed as `unscanned`, and any other file left unread as `skipped`, so neither reads as clean, with one exception the residuals name, and it works in both directions: for a UTF-16 file and for a file outside the project, a staged copy left unread is not named once the work tree's copy of that file was read, and for a file outside the project a work-tree copy left unread is not named once its staged copy was read. A file outside the project is scanned too, and a work-tree file that opens with a UTF-16 byte-order mark is decoded and scanned | `src/change/scan.ts::scanAddedLines`, `src/cli/commands/gate.ts::scanChange`, `src/cli/commands/gate.ts::readHistory`, `src/mcp/secretScan.ts::scanValueForSecrets` | Shape detection catches known shapes on sight, and nothing else. With no `--base` only the uncommitted change is read, and the output says so. A file listed as `unscanned` or `skipped` does not fail the scan: the exit stays 0, the flows put the `unscanned` files under `Not done:`, and they do not read `skipped`. Six cases are known residuals in 1.15.0, each tracked in `.stamity/inbox.md` (on the `records` branch) as the row named. The history read leaves merges out, so a value added in a merge commit and removed later is never scanned (`2026-10-08_product-core/close/2`). The history read decodes no UTF-16, so such a file committed and removed again since the base is only named, in `skipped` or, under a code extension, in `unscanned`, and the scan exits 0 (`2026-10-08_product-core/close/3`). Only the work tree's copy of a UTF-16 file is decoded: a staged copy the work tree has changed again is not decoded and, once the work tree's copy was read, is named in neither `skipped` nor `unscanned`, so the bytes `git commit` would record for that file are not scanned, nothing in the output says so, and a value staged there and edited out of the work tree leaves the exit at 0 (`2026-10-08_product-core/review/127`); the same filter drops the name of a staged copy the scan cannot read, a binary one, of a file outside the project once its work-tree copy was read as text, and, the other way round, the name of a work-tree copy it cannot read, a binary one (a NUL in its first 8 000 bytes and no UTF-16 byte-order mark), of a file outside the project once the lines its staged copy adds were read, so the work tree's bytes for that file are neither scanned nor named and the exit stays 0; that row covers neither case. Three value shapes pass: a short credential in a plain `NAME=value` line of an extensionless shell script or a `.ksh` file, neither of which is read as a shell file (`2026-10-08_product-core/close/5`); a quoted `=`-padded value of 40 to 59 characters under a name that names no credential, where the unquoted spelling in a config file can still hit (`2026-10-08_product-core/close/7`); and, in a shell file, a quoted mask directly followed by more text, as in `NAME="x"<rest>`, which reads as a masked value (`2026-10-08_product-core/close/9`) |
| An unattended run, or the text that steers one | Starting a run nobody watches on an account that can push to the default branch, so that nothing but the run's own steps stands between it and `main` | `stamity gate preflight --unattended` is the `st-unattended` skill's first act, before any fetch or push, and the skill reads any exit but 0 as a refusal. That order is model-followed text, not engine code: no run verb reads a pre-flight verdict, so `run start`, `run checkpoint` and `run end` each run without one. The verdict passes only when every check passes: a check that reads `unknown` refuses as one that fails does, and a warning refuses nothing. The wall is `direct-push`: REST reads the engine makes itself, through `gh`, about the `origin` repository it resolved itself, must prove the account cannot push to the default branch. That takes an active ruleset whose pull-request or update rule the account cannot bypass for a direct push (its bypass reads `never` or `pull_requests_only`), or classic protection that requires a pull request and whose bypass list does not hold the account. An account with no push right on the repository at all (`permissions.push` false) is refused, since the run could not push its own branch either. A classic bypass list that names any team or app reads `unknown`, since no read proves the account outside it, and so refuses. No protection, a bypass, a ruleset left unread beside an open verdict, a 403 or a 404, a non-GitHub origin, and `GH_REPO` or `GH_HOST` naming another repository or host each refuse. The proof counts only where every URL `git push origin` pushes to goes out as the identity the REST reads describe, on the repository origin's fetch URL names: over https with `gh`'s credential helper as the only helper and no `Authorization` extra header, or through the cloud proxy's origin. An ssh URL, a URL carrying its own credentials, any other helper, a push URL naming another repository and a configuration git cannot read each refuse. An account that administers the repository can lift a repository ruleset or classic protection, so for it only an organization ruleset counts: one whose conditions name the default branch or `~ALL` with no exclude that may match it, and target the repository by id or by `~ALL` with no exclude and by no repository property, and only while the account's organization role reads plain `member`. Beside the wall, a passing verdict needs a canary the shell guard writes when it allows the pre-flight, at most 120 seconds old (a canary, not a wall: a steered run could write it too), a node release inside the package's `engines` range, the running CLI at the pinned version, `gate scan` runnable, the question-protocol and injection-screening rules emitted, and, for a run started from a board item, an item author with `admin` or `write` on `origin`. Its warnings name credential-shaped environment variables by name and never by value, flag Cursor's agent socket, and say when the review gate holds no counter or a `pull_requests_only` bypass lets the account merge past the required review | `src/runs/preflight.ts::runPreflight`, `src/runs/preflight.ts::inspectDirectPush`, `src/runs/preflight.ts::pushIdentityCheck`, `src/cli/commands/gate.ts::readPushIdentity` | Only as strong as the flow that runs it first: a run that skips it, through steered text or on a client that loads no skill, meets only the shell guard and the remote's own protection. And only as strong as the protection the repository carries and the account the run acts as, and strongest when that account has no admin on the repository. The pre-flight reads that state once, at the start, and reads nothing the run does after it. Its residuals are named under "Cloud and unattended runs" below: the cloud proxy's shared app identity, custom repository and organization roles, an administrator's repository-level acts, `PATH` choosing the `gh` a credential helper runs, and a `GIT_CONFIG_*` value changed after it |
| The main thread of any session, attended or not, or the text that steers it | Running a person-only act — a force push, a push of a tag or of the default branch, a remote branch deletion (a pull request closed with `--delete-branch` among them), a tag (a `git update-ref` write on `refs/tags/` among them), a merge or a review approval, a ready-for-review mark, a release, a publish (npm's unique prefixes of `publish`, such as `npm pub`, and a manager run through Corepack among them), a secret, variable, protection, ruleset or custom-property write, or a write to the repository itself — or, in a run nobody watches, pushing around the run verbs | The person-only shell guard the engine emits for every client reads each shell call before it runs and classes each person-only act it finds, naming the rule. A deletion, a force push or an act that cannot be undone is refused on every client, attended or not: a remote branch, tag, release, asset (`--clobber` among them), secret, variable, protection rule, ruleset, custom property, deployment environment, repository or package version (`npm unpublish`, `npm dist-tag rm`) deleted, a local tag deleted or moved (`-d` or `-f`), a force push (`--force`, `--force-with-lease`, a `+` refspec, `--mirror`, `gh repo sync --force` among them), and a repository's visibility or owner changed. Attended, an act that can be undone asks on Claude Code for one click, the hook's `ask` answer, and the agent runs it on yes; it is refused instead where a sub-agent runs it (any agent identity the payload names), since the act is the person's, and in Claude Code's `auto` permission mode, where a classifier may settle a prompt. Copilot CLI, Cursor and Codex refuse it, the reason telling the agent to give the person the exact command: Copilot CLI holds an ask (1.0.89 under `-p --allow-all-tools`, measured 2026-10-18, and its documentation says an interactive session prompts), but its tool-call payload names no calling agent, so the guard cannot keep the ask for the person alone; Cursor 2026.10.14 ran the command despite a `beforeShellExecution` ask under `--force` (measured 2026-10-18); and Codex's hooks page says an ask is parsed and not honoured, so the call would go through. The verdict reads every act on a line, at every place its git runs and in both readings of a PowerShell call, so one refuse-class act refuses the whole call and a deletion never rides an approval. It reads the line as a shell would split it: quotes, segments, subshells and command substitutions, `sh -c` and `eval` arguments, wrappers such as `env`, `sudo` and `corepack`, package runners such as `npx`, a program word's trailing `@<version>` cut (`npx npm@10`), and git's global options, a `-c remote.<name>.push` read as the refspec a bare push takes. A `git symbolic-ref` write is read too: one naming a tag is refused as a tag, and one pointing a name at the default branch as a push of that branch to come; so are the symref commands of a `git update-ref --stdin` text the line carries (`symref-create`, `symref-update`, `symref-delete`), read as `git symbolic-ref` is, each wherever it stands in the text, a second one after an escaped line break (`\n`, `\0`) among them. Each curl request after `--next` (or `-:`) is judged alone, with its own method, body and targets, and a curl body counts as one in every spelling: apart, attached (`-d@<file>`, `-d'{…}'`, `-F<field>`, `-T<path>`) or as a short cluster's first value letter (`-sd@<file>`), and so does a curl method (`-XDELETE`, `-sX$M`), a letter after another value letter being that letter's value (`-oX` names a file). A curl or wget long option counts from any prefix of two or more letters of a long option the guard lists, read as the first listed option it begins (`--req`, `--me`), so a prefix the tool itself refuses as ambiguous only adds a refusal, and gh's `-i` clustered with a method or a field (`-iXDELETE`) and its `-X=<method>` count as gh reads them. Both verdicts read a REST path with its dot segments resolved (`.` and `..`, as curl resolves them before sending) as well as written, so a protected route reached through one is refused as that route. `gh repo sync` naming a destination repository is read as a push to it: under `--force` a force push, and with no `--branch`, a default branch or a branch the line cannot show a push of the default branch, while a sync of the local checkout, with no repository named, writes nothing remote and passes when attended. An implied destination is read against the branch where the command runs: the payload's working directory, each `cd` or `git -C` at a command position, PowerShell's location commands and `$env:GIT_DIR`. A `HEAD` it cannot read counts as the default branch, and `main` and `master` always count. While a run is unattended — an in-progress record in any run folder reads `Mode: unattended` (every run folder's head is read; past 2,000 run folders the read faults, naming `RUN_FOLDERS_OVER_2000`, and the guard refuses each call the unattended rule would have refused), or `STAMITY_UNATTENDED` is set to any value but empty, `false` or `0` and no in-progress record reads `Mode: attended` — it also refuses every raw `git push` and `git subtree push`, a git call carrying a `-c alias.*` pair or a subcommand it does not know as a git builtin, so an aliased git push and one whose subcommand is computed, `gh pr create`, `gh pr edit`, `gh pr update-branch`, `gh pr close` and `gh pr reopen`, `gh repo sync` and `gh repo create --push`, a `gh` group that is not one of gh's built-in commands (an alias or an extension), `gh alias set` and `gh alias import`, `gh extension exec`, and a REST write or GraphQL mutation that moves a branch or a pull request (on `pulls`, `contents/`, `git/` refs and objects, or `merges`), a `git remote` write (`add`, `set-url`, `rename`, `remove`, `set-head`, `set-branches`), a `git config` write of a `remote.*` or `url.*` key or section and a `git config` edit, and a line that sets one of git's program-valued variables (`GIT_EDITOR`, `GIT_SSH_COMMAND`, `GIT_EXEC_PATH` and seven more, `SSH_ASKPASS` among them) or one of its configuration variables (`GIT_CONFIG_COUNT`, `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM`) anywhere on it, whatever program it runs, and a line that runs `stamity run start`, `checkpoint` or `end` (its parsed command at any depth, or text naming the verb beside the package) unless the verb stands alone on it as one simple command: `stamity`, `st`, or `npx` with `-y`, `--yes`, `--no` or `--no-yes` and an optional `--@<scope>:registry=<url>`, then `stamity` or `<pkg>@<semver>`, then `run <verb>`, literal option words and at most one closing `2>&1`, with no other command, prefix assignment, wrapper, nested line, `$`, backtick, backslash or redirection, so nothing on the verb's line changes the environment its git runs in; each refusal naming `stamity run checkpoint` and `run end` as the push path and the record or the variable that made the session unattended. A reply on a comments endpoint passes. The merge queue's GraphQL `enqueuePullRequest` is read as a merge, so it asks or is refused as a merge does. The GraphQL repository-settings mutations (`updateRepository`, `archiveRepository`, `unarchiveRepository` and their schema siblings), the branch protection rule, ruleset and custom-property mutations, and a REST write of a custom property's value or definition (`properties/` under a repository, an organization or an enterprise) are read as protection writes, which ask or are refused as the classes above say, their deletions refused everywhere, and so is `gh repo unarchive`, as `gh repo archive` is. A shell call it cannot read, or a fault while deciding one, is refused, never asked about, since the person cannot judge a hidden act from the prompt either, and a line nested more than four levels deep is one it cannot read (`NESTING_DEPTH`). So is a push naming a refspec in a repository whose local tags pass either of the tag reader's two ceilings: past 10,000 tag names the read faults, naming `TAG_NAMES_OVER_10000`, and past an 8 MiB `packed-refs` file, naming `PACKED_REFS_OVER_8388608`; a `packed-refs` file or a loose tag entry that is not a regular file (a link, a FIFO) is read as absent, so a tag stored that way is not read as one. So is an HTTP call whose method or targets the line hides (`HTTP_TARGET_HIDDEN`): a method held in a variable or a substitution (`-X "$M"`, `--request "$(…)"`, wget's `--method` or a wgetrc `method=`), attached in a short cluster too (`-sX$M`, gh's `-iX$M`), or cut from the line by an unquoted one, a curl or wget configuration file the line names (`-K`, `--config`), a curl write whose target curl's globbing would expand (`{` or `[`) unless `-g` or `--globoff` is set, a wget write reading its targets from `-i`, and a curl short cluster holding `:` among other letters, which starts a request where the line does not show. On Claude Code the table's prefix forms are also settings rows, each a form the guard classes the same way: the refuse-class ones are `permissions.deny` rows, with a mid-pattern row for each refused flag that can follow an ask-class prefix (`--force`, `-f`, `--mirror`, `--prune`, `--delete`, `-d` and a `+` refspec after `git push`, `-d` and `-f` after `git tag`, `-d` after `gh pr merge`, `--clobber` after `gh release upload`, `--visibility` after `gh repo edit`, `--force` after `gh repo sync`), since a `*` inside a Bash row matches anywhere on the line and the client reads a deny row before an ask row (measured on Claude Code 2.1.302, 2026-10-18), and the ask-class ones are `permissions.ask` rows. Fourteen rows more name the GitHub MCP server's tools, calls no shell guard reads as a line, as the server's published tool list named them when read on 2026-10-16: thirteen ask rows, its merge (`merge_pull_request`), branch content and branch creation (`push_files`, `create_or_update_file`, `delete_file`, `update_pull_request_branch`, `create_branch`), review submission and approval (`pull_request_review_write`, `create_pull_request_review`, `submit_pending_pull_request_review`), pull-request update, state and ready for review among it (`update_pull_request`, `update_pull_request_state`, `update_pull_request_draft_state`) and pull-request creation (`create_pull_request`), and one deny row, repository deletion (`delete_repository`). A `PreToolUse` entry on those fourteen tools runs the person-only guard, with its fail-closed tail: it refuses `delete_repository`, refuses every one of them while a run is unattended, since a settings row cannot read the mode, and refuses a sub-agent's call and one in the `auto` permission mode, as on the shell. A row cannot read a tool's arguments, so each tool is classed whole: a pull-request update through that server asks whole, and `delete_file`, a commit rather than a ref deletion, asks | `src/hooks/personOnly.ts::personOnlyVerdict`, `src/hooks/personOnly.ts::unattendedPushVerdict`, `src/hooks/personOnly.ts::CLAUDE_DENY_ROWS`, `src/hooks/scripts.ts::buildPersonOnlyGuardScript` | A command reaches the guard as text, so a respelling the text hides passes: a git, shell or gh alias, a gh extension (the gh forms refused unattended), a computed `sh -c "$(…)"`, a repository's own push configuration, a `git update-ref --stdin` text read from a file or a symref command word the line cannot show, a symbolic ref already on disk, a branch switch earlier on the line before a push whose destination is implied, a method, body or URL from curl's or wget's default configuration file, a REST target held in a variable, which the guard judges as the literal word, a GraphQL mutation read from a file, and a REST body read from a file, except where the guard reads a body the line cannot show as the refusing value: a review, refused as an approval, a repository settings `PATCH`, refused as a visibility change, and a `git/refs` `PATCH`, refused as a forced ref update (`src/hooks/personOnly.ts::personOnlyVerdict`). The guard is the client's hook, so a client that runs no hook, or a hook that fails open, refuses nothing, and where no hook runs Claude Code's settings rows are the only layer. An attended ask holds only while the client honours it. An attended session keeps its own pushes. While a run is unattended, what the push rule cannot read still passes it: a line whose program word is computed, a shell alias or function, a script the run writes and then runs, and a GraphQL mutation read from a file, and such a push steps around the run verbs, the held paths and the last scan. The pre-flight's REST check guards only the default branch, so it holds back none of these on any other branch. On Claude Code the MCP rows name a server configured as `github`, so one configured under another name escapes them. A hook the run writes runs when a run verb commits or pushes. Each gap, the attended table's accepted ones among them, is named under "Cloud and unattended runs" below, the GitHub MCP server on the other clients and a hook the run writes among them |
| An unattended run, or the text that steers one | Pushing a change to the files that decide what every later run may do, or a credential, from a run nobody watches, or leaving the run on the default branch | `stamity run start` puts an unattended run on a branch of its own: on the default branch or at a detached `HEAD` it switches to `stamity/<run-id>`. `run checkpoint` and `run end` are the run's only push path. They refuse a commit on a default branch (read from GitHub's REST API, then `origin/HEAD`, with `main` and `master` always counted), at a detached `HEAD`, or on a checkout that is not the record's `Branch:`. Where REST names the default branch and `refs/remotes/origin/HEAD` is absent or names another branch, `run start`, `run checkpoint` and `run end` point that ref at the branch REST names, as `git remote set-head origin -a` would, so the shell guard counts the same default branch; nothing is written under `--dry-run`. Unattended, they refuse when neither source names the default branch, the `main` and `master` fallback: `run start` exits 1, reading the mode from the run's record where one is there and from `STAMITY_UNATTENDED` otherwise, and `run checkpoint` and `run end` refuse the commit before staging. `run start` pins origin's repository in the run folder's `origin.json`, read from origin's fetch URL and from every push URL as git resolves it, `insteadOf` and `pushInsteadOf` applied, and `checkpoint` and `end` resolve them again before they stage: a URL naming another repository than the pin refuses as `origin changed` (`run start` fails as `Not done: origin changed` where a pin already there names another one or cannot be read), and an unattended run with no readable pin refuses as `origin not pinned`. They stage only the run folder's record, ledger, plan, morning list, origin pin and held patch, the deferral inbox and the paths named with `--paths`, never `-A` and never `-f`. Under `Mode: unattended`, or with no `Mode:` line in the record's head while `STAMITY_UNATTENDED` is set to any value but empty, `false` or `0`, they write the change against `Base:` under the person-only paths — CI definitions, hook and guard configuration, the clients' settings, the class file, CODEOWNERS, the charter and instruction files, the clients' agent, command, skill and MCP definitions, and the cloud agents' environment files — to an inert patch in the run folder, and restore those paths to `Base:` in the index, so the push carries the patch and not the change. A symbolic link the change adds or retypes at a held glob's folder (`.claude`, `.github/workflows`, any folder's `.vscode`) is held as a held file is, since it would put a folder of the run's choosing where that glob reads. Under the same mode they refuse the push, and rewrite no history, while a commit the push would send (each commit none of origin's branches and tags reaches) or `HEAD`'s tree still changes a held path. They scan what the push sends, `HEAD`'s tree against `Base:` and every commit none of origin's branches and tags reaches, read from the remote with `git ls-remote origin` and never from a remote-tracking ref, those below `Base:` included, merges left out, and hold the push on a hit, a failed scan or an incomplete one, and before the commit where that read fails; check the push's own command against the guard's person-only table; and push `HEAD` to the run's branch with no tag. Only once the push step passes does `end` open or update the run's draft pull request (`checkpoint` only with `--pr`): a branch refusal, a failed stage, hold or commit, a held path in what the push sends, a scan hit, a failed or incomplete scan and a refused or failed push each return before that step, so a run held there opens none. No run verb marks a pull request ready, merges it or tags | `src/cli/commands/run.ts::runCheckpoint`, `src/cli/commands/run.ts::alignOriginHead`, `src/cli/commands/run.ts::pinOrigin`, `src/cli/commands/run.ts::originRefusal`, `src/cli/commands/run.ts::heldOf`, `src/change/personOnlyPaths.ts::heldPaths`, `src/change/personOnlyPaths.ts::PERSON_ONLY_PATHS`, `src/change/scan.ts::scanAddedLines`, `src/runs/pullRequest.ts::ensureDraftPr` | The held set is a glob list, so a file outside it is pushed as any other: an environment file can name a build file outside the held set. A multi-root workspace file, and every folder's editor settings, tasks and MCP-server files, the tasks file with its folder-open task, are held. The scan carries the secret scan's own residuals, named in the row above, and a file it lists as `unscanned` does not hold the push; the verb names it. An attended run's checkpoint holds nothing. A run declared only by `--unattended`, whose record does not exist yet, is not refused at `run start` on the fallback, and its first `run checkpoint` is. The origin pin is a file in the run folder, so a run that rewrites it together with git's configuration moves the push and passes the check, as "Cloud and unattended runs" names |
| Anyone whose text an unattended run sends out, the run itself included | Carrying a credential out of the run in a pull request's title or body, a morning list, a comment or a reply | `stamity gate scan --text <file> --label <label>` reads the file as the outbound text and screens every line with the change scan's own patterns, the label standing as the path. A hit, or a line past the scan's cap, which is not read and so is never clean, exits 1, naming the label, the line and the rule and no part of the value, and so do a file it cannot read and one over 250 000 characters. The flows post a text only from the file that scan passed. The run verbs screen the draft pull request's title and body the same way before they post: a title that matches becomes `Run <run-id>`, and a body that matches is replaced by one naming the lines and rules matched and pointing at the morning list on the branch | `src/runs/morning.ts::screenOutbound`, `src/change/scan.ts::scanAddedLines`, `src/cli/commands/gate.ts::runTextScan` | Shape detection catches known shapes on sight, and nothing else. That a flow posts only from the scanned file is model-followed text, not engine code: the engine screens on its own only in the run verbs' pull-request step |

## Network and data handling

The engine performs no network I/O while it works, with the three exceptions named next; the client
programs it starts to read a model list, named after them, may make network calls of their own.
Nothing is uploaded, and no telemetry or analytics is collected. The repository you ran the CLI in
is where the engine's outputs land.

In a single repository, exactly four paths write outside it:

- the startup update notice's stamp file, under your user cache directory
  (`src/cli/notice/updateNotice.ts::noticeCacheDir`);
- the Sigstore TUF metadata cache, under the platform's cache root
  (`src/pack/sigstoreVerifier.ts::sigstoreCachePath`);
- the checkouts `stamity worktree setup` makes in the farm directory beside the repository
  (`src/worktree/policy.ts::WORKTREE_FARM_DIR_NAME`). A farm inside the repository is refused;
- a scratch folder named `stamity-held-…` under the system's temporary directory, which
  `stamity run checkpoint` and `run end` create in an unattended run that holds a change, where git
  writes the held patch before its bytes move into the run folder, and which they remove before
  going on (`src/cli/commands/run.ts::runCheckpoint`).

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

**The unattended pre-flight and the run verbs are the third exception.** `stamity gate preflight
--unattended` reads, through GitHub's REST API, the `origin` repository, the rules on its default
branch and the rulesets behind them, its classic protection, the account's own login where that
protection's pull-request bypass lists users, the account's organization role and, for a run
started from a board item, that item's author and the author's permission. `stamity run
start`, `run checkpoint` and `run end` read the repository's default branch the same way, and the
pull-request step of `checkpoint --pr` and of `end` looks up the run's open pull request, opens a
draft, replaces its body or comments on it. Every one of those calls goes through one door: `gh api`,
under the operator's own `gh` login (`src/cli/engine/ghRunner.ts::ghApi`). The methods are `GET`,
`POST` and `PATCH`. The path is a REST path in a closed alphabet, never `graphql` and never a URL of
its own, and a write reaches only the pull-request list, one pull request or a comment on one, never
a merge, a ref, a file, a ruleset or a secret. The host is named on every call, the one the origin
was matched on. `gh` gets the caller's environment, its token included, with its prompts and its
update check off, and a 60-second limit. It is started by an absolute path, found on `PATH` with
every relative entry, every entry that is the working folder and every `node_modules/.bin` entry
skipped; every other entry counts as it stands, so whatever sets that `PATH` chooses the `gh`, as
residual (1) of the row on how git is started says for git. Beside the door, `checkpoint` and `end`
push the run's branch to `origin`, once origin still names the repository `run start` pinned, with
git (`src/cli/engine/gitWrite.ts::gitWrite`), under the
operator's own git credentials, and the text a pull request carries is screened before it posts,
as the outbound-text row above states. No other verb starts `gh`, and none of these calls is made by
`init`, `sync`, `check` or the other `gate` subcommands.

**Reading a client's model list starts that client's own CLI.** `init`, `sync` (`--dry-run`
included) and `workspace sync` read the model list of each selected client but Claude Code, and
`check`'s `model-pins` row reads it again, by starting the client's own CLI once per client:
`cursor-agent models` (or `agent models`), `codex debug models`, which `check` runs, with
`--bundled`, only when no Codex list was kept, or `copilot help config` (`src/cli/engine/clientModels.ts::listClientModels`). The
program is found by the engine's `PATH` walk over the entries left once every relative entry,
every entry inside the project tree and every `node_modules/.bin` entry are dropped, and one whose
real path lies inside the tree is refused, never started. For every verb, the tree is the enclosing
workspace's root when the repository is a member of one, found as the workspace commands find it,
else the repository's own root; no program the repository or a sibling member carries is started. It runs with the operator's environment, so under the operator's own client account and
sign-in, given that trimmed `PATH`, started in the user's home folder (nothing starts when home
lies inside the tree), with its input closed, no window, a 10-second limit after which it is
killed, and at most 8 MiB of output read. Only ids shaped like a model id are kept, at most 200 a
client, kept in `.stamity/client-models.json`, never in the manifest. The engine hands the program nothing but
those arguments, but the client's own listing call may reach its vendor over the network under
that account (`codex debug models` without `--bundled` may refresh its catalogue), and may write
its own files under the home folder; what each client does there was not checked.
`STAMITY_NO_CLIENT_PROBE=1` in the environment starts none of them. Emission and `check`'s drift
comparison start no client: emission reads the kept list, and the drift comparison reads the lists the
emitted files give first, as the next paragraph says.

**The kept model lists stay on the machine.** Each selected client's list is kept in
`.stamity/client-models.json`, which setup adds to `.gitignore`, so the committed manifest names no
account's models (REQ-LADDER-009). A 1.15.0 manifest that still saves them under `models.listed`
loads, and the next `sync` moves them to that file and writes the manifest without the key; a
history committed before then still holds them. The cache is read with the manifest list's checks
(the id shape, at most 200 ids a client, the order as written) and taken whole or not at all, and a
1.15.0 manifest's lists move only when they pass the same checks. A planted cache steers picks within
these bounds: on Codex and Copilot it can move a class to a later shipped candidate, and a list holding
none of a class's candidates leaves that class with no model, so it runs on the client's own default
model; on Cursor a list holding a pin keeps it bare, without its effort group. `sync` reads each client
again and keeps the fresh list in place of the cached one. `check`'s `model-pins` row warns on a pin or
an emitted model the reference list lacks, and never fails. The reference is the live list for Cursor
and Copilot; for Codex, once a cache exists, `check` does not read Codex again and the cache is the
reference, so the row does not catch a planted Codex cache. With no cache, a fresh clone among them,
the pick already emitted is kept, read from the ledgered `.stamity/generated/models/` maps of Codex
and Copilot and from the `model:` lines of Cursor's ledgered agent files, and `model-pins` reads as
unverified. `check`'s drift comparison reads those emitted lists first, with the manifest's pins
added where this checkout has no list for the client or its list holds the pin, so a pick the files
carry is not drift and an unsynced pin edit that `sync` would write is. It keeps only a pick some
list could have made, each class on a shipped candidate for it or on its pin; a class the files leave
with no model though it has candidates, or on any other id, reads as drift unless this checkout's own
list gives the same. A committed edit moving a class to a later shipped candidate, with its files to
match, is therefore not drift; the diff of `.stamity/generated/models/` shows it. With
`STAMITY_NO_CLIENT_PROBE=1` set, no list is read; delete the cache to drop the lists already kept.

**Board writes are the touchpoints' own, not the engine's.** `/st-board` and `/st-pr-resolve` call
the authenticated GitHub CLI, `gh`, or a configured GitHub MCP server from the agent's session; the
engine makes none of these calls. Once a board is linked, `/st-board` writes to it by default: it
files issues in the linked repository and adds them to the linked project, edits an open item's
title, body, checklist or labels, posts progress comments and links pull requests, and, only under
`--move`, changes where an item stands, closes it or reopens it (the `## Write-back contract` of
`content/commands/st-board.md`). Every write goes to the one repository and board the link names,
and every `gh issue` and `gh api` write names that repository rather than the checkout's default.
Before a link writes, a check through `gh` requires `admin` or `write` permission for the acting
account and, on a Projects board, the right to update the project; a failed or missing check leaves
the link read-only. A run shows its whole batch once, in one numbered preview, before its first
write; no answer means stop, and a write the preview did not list is not made. A write carries an
item's title, criteria, labels, `Ref:` and filed-item marker, phase or outcome words and ids, never
file contents, logs, environment values or credentials. The board never deletes an item, edits a
completed one, creates a label, or writes to another repository or board. Text read from the board,
an item, a comment or a pull request, is data under the injection-screening rule, reported by class
and position and never followed. Where the text's repository or the linked one is public, text from
an author without `admin` or `write` permission never supplies the content or the trigger of a
write, and a filed-item marker in an item the account did not write is never matched.
`/st-pr-resolve`'s thread replies are its own write, outside this set, and need no board link. These
guards are model-followed text, not engine code. At each release's full run the eval case
`board-item-directive-is-data` measures three of them: a planted directive is reported by class and
position and never followed, an author without `admin` or `write` permission on a public repository
drives no write, and no file contents reach a write. It does not test the one-repository target,
the write check, or marker matching.

One further code path is network-capable, and it is not part of any command's work. The startup
update notice asks the npm registry the running package publishes to — the public one for
`@zomarit/stamity`, and for a fork made with `scripts/fork-identity.mjs --registry` that registry and
never the public one — whether a version newer than the running one exists
(`src/cli/notice/updateNotice.ts`). It sends the package name and nothing else. It is bounded by a
1.5-second timeout, caches its answer for a day, fails silently, and never rewrites an install — the
answer is a banner. For a `--registry` fork, the banner's move command names that registry too
(`--@<scope>:registry=<url>`), and a registry the call grammar refuses produces no banner. Set `STAMITY_NO_UPDATE_CHECK=1` to turn it off. `NO_UPDATE_NOTIFIER` and `CI` on
any non-empty value do the same.

## Publishing this package

A release is built and published by `.github/workflows/release.yml`. What a consumer can check are
properties of that file, rather than properties of a maintainer's laptop.

- **The job that builds does not hold the credential.** One job runs the build, the suite, the leak
  gate and the packed-artifact smoke on the shipping commit. The `publish` job holds the publishing
  credential and takes no checkout of this repository. Its whole tool surface is three SHA-pinned
  actions — harden-runner, setup-node and download-artifact — plus npm (which the job first
  upgrades by one registry download pinned to the exact version 12.0.2 and asserts against the
  trusted-publishing floor before use), the GitHub CLI, and POSIX shell with `sha256sum` and `awk`.
  It verifies the tarball's SHA-256 against the first job's OUTPUT, a channel separate from the
  artifact under verification. So a compromised build-time dependency runs in the job that has no
  credential.
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

A second release workflow ships in this repository: `.github/workflows/fork-release.yml`, which lets a
private fork release itself. It does nothing in this repository. Its first job sees the canonical
repository, ends green with a notice, and every other job is skipped, so it publishes nothing from
here and reads no secret here. In a fork that arms it, its `publish` job holds `contents: write`
and `packages: write` and no OIDC token. It runs in the fork's `fork-release` environment, which
holds it for a reviewer only once the fork adds a required reviewer there — platform setup, like
this repository's own half below — and for a registry other than GitHub Packages it reads the
fork's own stored token, `STAMITY_REGISTRY_TOKEN`. The fork guide, `docs/enterprise-forks.md`, describes that setup.

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
- **The project's npm settings.** The documented `npx` call applies the `.npmrc` of the project
  it runs in before stamity starts, so nothing in stamity reads it first. In a checkout you have
  not read, a `node-options` or `script-shell` line there runs the checkout's own code ahead of
  every check stamity makes, and a `registry` or `@zomarit:registry` line chooses where the
  package itself is fetched from. `--node-options=` clears a `node-options` line for one run and
  none of the others, so read the file first, as the getting-started page says (checked with npm
  10.9.8).
- **Hook and MCP execution.** The engine writes hook scripts and hook CONFIG. Your AI client runs
  them, with your privileges. Reading `.stamity/generated/hooks/` covers only the scripts this engine
  generates. What decides whether a command runs at all is the client's own config. There are four
  of those: `.claude/settings.json`, `.cursor/hooks.json`, `.github/hooks/stamity.json` and
  `.codex/hooks.json`. A hook a PACK supplies lands in one of them, never under
  `.stamity/generated/`. On Codex, three things decide it rather than one. The first is the
  `hooks` feature in `.codex/config.toml`. The engine writes `[features]` with `hooks = true`, but
  since 1.12.0 a `[features]` table of your own is kept instead of the engine's. When a kept key
  sets the feature to `false` (bare, quoted, `features.hooks` at the root, or the `codex_hooks`
  alias), Codex runs none of the hooks, the guards included: `sync` and `init` keep it and warn,
  and `check` exits 1 naming the line. Codex runs hooks by default (codex-cli 0.160.1, read
  2026-10-07), so a `[features]` table without the key leaves them on. The second is the project's
  trust level. The third is the per-hook review through the interactive `/hooks` command, or
  `--dangerously-bypass-hook-trust` for automation that cannot take that step. Headless `codex exec`
  on codex-cli 0.154.0 ran no project hook in three runs in the 2026-09-15 measurement, and on
  0.155.1 it again ran none in 3 of 3 runs (2026-09-30). Both trusted the project only through a
  per-invocation override, so the cause is not isolated, and a run trusted in the home config is
  unmeasured. So a hook on that client is enforcement in the interactive session and nothing
  measured in the headless lane (`src/adapters/codex.ts`, the `hook enforcement` fact). An
  MCP server definition likewise becomes a launcher your editor spawns at start-up. Read all five,
  and read the `runs on this machine` block `stamity add` prints before accepting a pack. Hook lines
  and MCP launchers name a program bare: see residual (3) of the row on how git is started. The
  hook runner itself starts its launcher by an absolute path, as (2) there says.
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
- **The instruction files a verdict role loads.** A sub-agent that is handed the checkout's
  instruction files follows them as instructions, so on a branch that edits one, the roles
  reviewing that branch already follow the edit. This is not one client's residual. On Copilot
  the engine asks for the load: since 1.14.0 every `.github/agents/stamity-<id>.agent.md` it
  emits carries `include-custom-instructions: true` (`src/adapters/copilot.ts::buildAgentFile`),
  because without the key a sub-agent Copilot CLI 1.0.89 dispatched loaded no `AGENTS.md`
  (checked live on 2026-10-10) and the charter and its invariants never reached it. With the
  key, Copilot's reviewer and its three lenses load the checkout's instruction files. On Claude
  Code no engine key is involved and the client does it: in the 1.14.0 release run, on
  2026-10-11, a reviewer session was handed the checkout's `CLAUDE.md` and `AGENTS.md` as
  project instructions that override its defaults, and three files under `.claude/rules/` as it
  read files. That is what was observed, on that one client. The session ran in the main
  checkout, so the files it was handed were `main`'s: that a verdict role started in a branch's
  checkout is handed that branch's copies is inferred from it, not observed. Cursor and Codex
  were not measured. Nothing here shows their sub-agents are kept from the checkout's
  instruction files, so the residual is inferred for them too until a measurement says
  otherwise. No screen reads a hand edit to those files before a role loads them, and a change
  to `AGENTS.md`, `CLAUDE.md` or a file under `.claude/rules/` is classed `product` by the
  built-in rules, so the edit brings no security lens by itself. This is a known residual in
  1.15.0. The Copilot case is tracked in `.stamity/inbox.md` as the row
  `2026-10-10_next-tier/review/22`, and the residual on every client is tracked as the row
  `2026-10-11_release-1-14-0/review/36` of the ledger
  `.stamity/runs/2026-10-11_release-1-14-0/ledger.jsonl`; both files are on the `records` branch.
- **Bounded phase IO.** `src/guard/promptGuard.ts` defines a 500 KB phase-input bound, a 1 MB
  agent-output bound, and boundary-marker wrapping. Only `MAX_USER_CONTENT_LENGTH` above has
  production callers: the overlay path applies it as a 250 000-character ceiling, and the
  `learn`, `handoff` and `ledger append --stdin` reads apply it as a byte one. `guardInput`,
  `validateAgentOutput`, `wrapWithBoundary` and `extractBoundedContent` have none outside their
  own module, and reject nothing today.
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

### Cloud and unattended runs

A run nobody watches — a cloud session, a scheduled routine, a headless call — runs the pre-flight
as the unattended skill's first act, pushes through the run verbs and ends on a draft pull request,
with the shell guard's person-only table in front of every shell call: the rows above name each
control. Attended, the same table asks on Claude Code for one click on a person-only act that can be
undone and refuses it on Copilot CLI, Cursor and Codex, and a deletion, a force push or an act that
cannot be undone stays refused on every client, with a click or without one. The pre-flight's place at the start is the skill's text: no run verb requires a passing
verdict. Protect the default branch so the account the run acts as cannot push to it, since the
pre-flight refuses otherwise. For an account without admin, an active ruleset or classic protection
that requires a pull request and that the account cannot bypass counts; an account with no push
right at all is refused, since the run could not push its own branch. For an account that
administers the repository only an organization ruleset counts, so a repository ruleset leaves it
refused. What stays open is named here, as accepted risk:

- **Runtime ingress.** Text a run reads while it works, a board item, a comment or a review thread,
  is screened by the model, not enforced: the injection-screening rule is a floor the run loads,
  and no engine code stops an instruction in that text from being followed.
- **Client hooks.** A Copilot hook that times out fails open, so a guard that does not answer in
  time lets the call through. Cursor's read-only first turns run no hooks, and no shell guard sees
  Cursor's own push: the push its cloud agent makes is the platform's, not a shell call. Codex's
  non-interactive mode was seen running no project hooks, where the pre-flight then refuses: no
  guard writes its canary, so `hooks-loaded` fails and the run does not start.
- **How each client answers an ask.** Attended safety on Claude Code rests on the client holding the
  guard's `ask`. Claude Code 2.1.302 holds a hook's `ask` in bypass-permissions mode (measured on
  2026-10-18 in throwaway folders; its documentation does not state it), and a `-p` run denies it
  for want of a person, as it denies a settings ask row; its settings `permissions.ask` rows are
  documented to prompt in every mode. That reading is re-measured before each release with
  `node scripts/qa/hook-runs.mjs --ask`, which the release checklist runs with
  `--require-observation`, so an unmeasured Claude Code holds the tag, per installed client, and a
  client whose ask lets the command run moves to refusing. Copilot CLI, Cursor and Codex refuse every ask-class act, for the
  reasons the guard's row above gives, so on them a person runs the act from the exact command.
  Code: `src/hooks/scripts.ts::buildPersonOnlyGuardScript`.
- **Where no hook runs.** On Claude Code with no hook loaded, the settings rows are the only layer,
  and an ask prefix row also matches a line that adds a refused flag later. The mid-pattern deny
  rows refuse the common spellings (a `--force` or `--prune` after `--tags` or `--all`, a `-d` after
  `gh pr merge 7`, a `--clobber` after `gh release upload v1 a`, a `--visibility` after
  `gh repo edit --default-branch x`), but a respelling no row names costs one click there: a
  colon-refspec deletion behind an ask prefix (a `:v1` refspec after `--tags origin`) has no row,
  since a row ending in ` :*` after a `*` matched nothing in the same measurement. With the hook
  loaded, the guard refuses each of them. Code: `src/hooks/personOnly.ts::CLAUDE_DENY_ROWS`,
  `src/hooks/personOnly.ts::CLAUDE_ASK_ROWS`.
- **The GitHub MCP server on the other clients.** On Claude Code, thirteen `permissions.ask` rows
  and one `permissions.deny` row name the GitHub MCP server's merge, branch-content,
  branch-creation, review-submitting, pull-request-creating, pull-request-update and
  repository-delete tools by name, as its published tool list named them on 2026-10-16, and a `PreToolUse`
  hook on those tools refuses every one while a run is unattended. Cursor, Copilot and Codex take no
  per-tool deny from the engine, and no ask row. Where a GitHub MCP
  server is set up on one of them, a merge, a branch write, a review approval or a ready-for-review
  mark it makes is a tool call, not a shell call, so no shell guard sees it: only the remote's own
  protection, and on the default branch the pre-flight's wall, stand in front of it. On Claude Code
  the rows name a server configured as `github`, the key the engine writes, so the same server
  configured under another name escapes them, and so does a tool the server adds or renames after
  that date.
- **Claude Code's working directory.** Claude Code keeps the shell's working directory from one call
  to the next. The guard reads where a command runs from the working directory the client's payload
  names and from each `cd` or `git -C` on the line itself. Whether Claude Code's field follows a
  directory an earlier call moved to was not checked. If it does not, a push whose destination is
  implied, run from a checkout of the default branch an earlier `cd` reached, is judged on another
  branch and can pass. This is attended only: while a run is unattended, every raw push is refused
  whatever the branch.
- **The default branch's name in a clone no run verb ran in.** The shell guard reads the default
  branch only from `refs/remotes/origin/HEAD`, and `main` and `master` always count. In an attended
  clone where that ref is absent or names an older default, and no run verb has run since (or
  GitHub's REST API gave the run verbs no answer), a push of a default branch with another name
  passes the person-only rule, and only the remote's own protection stands in front of it.
  `stamity run start`, `run checkpoint` and `run end` point the ref at the branch REST names, which
  closes the gap for every clone a run verb has run in, with one exception: where the default
  branch's name holds a character outside the letters, digits, `.`, `_`, `/` and `-` the push check
  reads, or starts with `-`, they leave the ref unwritten and say so, and the gap stays open in that
  clone too. In a reftable repository the guard reads no loose ref file, so the written ref does not
  reach it. Code:
  `src/cli/commands/run.ts::alignOriginHead`, `src/hooks/scripts.ts::buildPersonOnlyGuardScript`.
- **A symbolic ref already on disk.** The guard reads a `git symbolic-ref` write on the line it
  judges. A symbolic ref written before, by a shell redirect, the Write tool or the person, is not
  on that line: `git push origin <name>` then sends the branch the ref points at, and the guard
  compares only the literal name. So in an attended session a push of the default branch through
  such a ref passes the person-only rule, and only the remote's own protection stands in front of
  it. While a run is unattended, every raw push is refused whatever the branch. Code:
  `src/hooks/personOnly.ts::personOnlyVerdict`.
- **A branch switch before an implied push on the same line.** The guard judges a push whose
  destination is implied against the branch it reads before the line runs. So `git switch main &&
  git push`, `git checkout main && git push origin HEAD` and `git symbolic-ref HEAD refs/heads/main
  && git push` are judged on the branch the checkout was on, and in an attended session they pass
  the person-only rule: only the remote's own protection stands in front of them. While a run is
  unattended, every raw push is refused whatever the branch.
- **curl's and wget's default configuration files.** A configuration file the line names is refused
  (`HTTP_TARGET_HIDDEN`). The default ones are read without being named: curl's `.curlrc` (found
  through `CURL_HOME` or `XDG_CONFIG_HOME`, and skipped when `-q` is the first option) and wget's
  `.wgetrc`, the file `WGETRC` names, or the system wgetrc can set a method, a body or a URL the line
  does not show. So a call the guard reads as a read can be a write, a merge or a protection write
  among them, and in an attended session only the remote's own protection stands in front of it.
  While a run is unattended, the pre-flight's refusal of an account that can push to the default
  branch holds that branch alone: a write such a file hides reaches the run's own branch around the
  run verbs, the held paths and the last scan, as the other respellings do.
- **Respelling.** A pattern deny rule can be respelled: a Claude Code `permissions.deny` row matches
  a command's prefix, and the shell guard reads a command as text. So a git, shell or gh alias, a gh
  extension, a computed `sh -c "$(…)"`, a REST target held in a variable (the call is judged on the
  literal word, so a computed URL passes, where a method held in one is refused as a hidden call,
  `HTTP_TARGET_HIDDEN`), a repository's own push configuration (`remote.<name>.push`,
  `push.default=matching`), a symref command word the line cannot show (`symref-%s` with the
  command as printf's argument, or a variable holding it), a `git update-ref --stdin` text read
  from a file and a GraphQL mutation read from a file pass the person-only table's patterns.
  While a run is unattended, the push rule refuses every raw `git push`, whatever its configuration, and a git call carrying a `-c alias.*`
  pair or a subcommand it does not know as a git builtin, so an aliased git push and one whose
  subcommand is computed are refused. It refuses a `gh` group that is not one of gh's built-in
  commands, an alias or an extension, and `gh alias set` and `gh alias import` too, so an aliased gh
  merge is refused. What the rule cannot read still passes it: a line whose program word is
  computed (`sh -c "$(…)"`), a shell alias or function, a script the run writes and then runs, a
  REST target held in a variable, and a GraphQL mutation read from a file. Such a push steps
  around the run verbs, the held paths and the last scan. The pre-flight's REST check guards only
  the default branch, so it is no backstop here: a push of that kind to any other branch carries a
  workflow change unheld and unscanned, and a `push`-triggered workflow runs it.
- **Programs the repository's configuration names.** A git builtin can run a program the
  repository's own git configuration names, such as a submodule's update command or the file-system
  monitor, and a run can set such a program first, with a `git config` write or an edit to the
  configuration file, and then run the builtin. Neither line is a push the guard can read, so no
  reading of one command line closes this. The program runs inside git, not as a shell call the
  guard sees, so a push it makes steps around the run verbs, the held paths and the last scan, as a
  respelled one does. The push rule allows `git submodule update`, which a repository with
  submodules needs, and `git status`. On the builtin's own line it refuses such a program: while a
  run is unattended, a git call carrying a `-c` or `--config-env` pair outside the display and
  identity keys (`color.*`, `advice.*`, `core.quotepath`, `init.defaultBranch`, `user.name`,
  `user.email`) is refused, `git -c core.fsmonitor=… status` among them. Unattended too, a line is
  refused whatever program it runs, a `stamity run checkpoint` or `run end` line, `npx`, `node` and
  `npm test` alike, when it sets one of git's configuration variables (`GIT_CONFIG_COUNT`,
  `GIT_CONFIG_KEY_<n>`, `GIT_CONFIG_VALUE_<n>`, `GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_GLOBAL`,
  `GIT_CONFIG_SYSTEM`), in any form that sets one, PowerShell's `Set-Item env:` among them, or one of
  git's program-valued variables (`GIT_EDITOR`, `GIT_SEQUENCE_EDITOR`, `GIT_SSH_COMMAND`, `GIT_SSH`,
  `GIT_EXTERNAL_DIFF`, `GIT_ASKPASS`, `GIT_PAGER`, `GIT_PROXY_COMMAND`, `GIT_EXEC_PATH`, and
  `SSH_ASKPASS`, which git runs when no askpass helper answers), wherever
  on the line, `export`, and `declare`, `typeset` or `local` given `-x`, with a value or without one,
  a name `read`, `for`, `printf -v`, `mapfile`, `readarray` or `getopts` assigns with no `=`, any
  of them named on a line that turns allexport on with `set`'s letter or the option's name (`set -a`,
  `set -o allexport`, `setopt allexport`), PowerShell's `$env:`, `Set-Item env:` and `New-Item env:` and
  `[Environment]::SetEnvironmentVariable` among the spellings. A run verb's own line holds the verb
  alone, so no spelling of any kind rides it: anything beside the verb refuses the line. Code:
  `src/hooks/personOnly.ts::unattendedPushVerdict`, `src/cli/engine/gitWrite.ts::gitWriteEnv`. A
  program-valued variable set through another of PowerShell's `env:` drive commands, such as
  `Set-Content env:GIT_EXEC_PATH …`, passes, and the respelling residual above covers it. These
  spellings pass the rule too, on a line of their own in a shell that persists, and each changes the
  environment a later verb's git starts from: `readonly NAME=…`, `select`, zsh's `print -v` and
  `foreach`, and `: ${NAME:=…}`, each of which sets a value that reaches it when the variable is
  already in the environment; zsh's `readonly -x NAME=…`, which exports the variable whether or not
  it was before; allexport turned on by zsh's `setopt -a` or by a shell started with `-a`
  (`bash -a -c '…'`), which exports a variable one of those forms then sets; and `source <file>`
  (or `. <file>`), since the guard does not read the file, which can set or export any of them.
  On the verb's own line each is refused, since the verb stands alone there. Set on an earlier
  line, a program-valued variable is removed from the verb's git, which names it, and a
  `GIT_CONFIG_*` one is kept, as "The configuration window" below says. The control that holds is
  the pre-flight's refusal of an account that can push to the default branch: a push such a git
  makes meets the protection the pre-flight proved there, and reaches any other branch unheld.
- **Hooks the run writes.** The run verbs keep the repository's hooks: a commit or push of theirs
  runs the repository's own pre-commit and pre-push checks, by design
  (`src/cli/engine/gitWrite.ts::gitWrite`). So a hook a run writes runs when `run checkpoint` or
  `run end` commits or pushes, inside git and with the push's credentials, and a push it makes
  steps around the held paths and the last scan, as a configured program's does. It runs nothing
  the run could not start from its own shell. The control that holds is the pre-flight's refusal of
  an account that can push to the default branch: such a push meets the protection the pre-flight
  proved there, and reaches any other branch unheld.
- **The environment.** Every command in Claude Code's cloud can read the environment, a token the
  session holds included. The pre-flight's `token-env` warning names credential-shaped variables, by
  name only, and removes none.
- **Claude Code's GitHub Action on a pull request.** On a pull request, the Action restores `.claude/`
  and `CLAUDE.md` from the base branch, but the hook scripts those settings start, under
  `.stamity/generated/hooks/`, and the `AGENTS.md` that `CLAUDE.md` imports come from the pull
  request, so a pull request can change what the guard runs and what the agent reads on its own
  Action run.
- **The record head.** The guard reads whether a run is unattended off the run records, so a run
  that rewrites its own record head escapes the unattended push rule: a record rewritten to read
  `Mode: attended`, or closed while `STAMITY_UNATTENDED` is unset, no longer makes the session
  unattended, and the run's raw pushes meet only the person-only table and the REST check. The run
  verbs read the same head's `Mode:` (`STAMITY_UNATTENDED` only where it has no `Mode:` line), so a
  head rewritten to `Mode: attended` turns off their hold too: `run checkpoint` and `run end` then
  push a change to the person-only paths as any other, with no patch and no held-path refusal, and
  only the secret scan and the person-only table still read the push.
- **The run folder ceiling.** The guard and the ask gate read every run folder's head, so a pile of
  folders named to sort first pushes no open unattended record out of the read. Past 2,000 run
  folders the read faults, naming `RUN_FOLDERS_OVER_2000`: the guard then refuses every call the
  unattended rule would have refused, attended sessions included, until old run folders are moved
  out, and the ask gate lets the question through with its fault note. Code:
  `src/hooks/scripts.ts::buildPersonOnlyGuardScript`, `src/hooks/scripts.ts::buildUnattendedAskGate`.
- **The tag ceiling.** The guard reads the local tag names, loose and packed, so a refspec naming a
  tag by its bare name reads as a tag push. Past 10,000 tag names the read faults, naming
  `TAG_NAMES_OVER_10000`, and a `packed-refs` file past 8 MiB faults too, naming
  `PACKED_REFS_OVER_8388608`, as the run folder ceiling does: the guard then refuses every push that
  names a refspec in that repository, attended sessions included, rather than read a cut-off list as
  whole, and a call that reads no tag (a status, a fetch, a push with no refspec) still passes. Code:
  `src/hooks/scripts.ts::buildPersonOnlyGuardScript`.
- **The final round's window.** With `STAMITY_UNATTENDED` set and no run in progress, the ask gate
  lets a question through only while `.stamity/run-ended.json` names the closed unattended run
  whose `Branch:` is the checkout's branch, and its `at` is at most 15 minutes old: the final round
  is person-paced, several question calls, so its window is its own, not the pre-flight canary's
  120 seconds. Only `run end --final-round`, the run's last, writes it; a plain `run end` and
  `run start` remove it. The window that is left: for those 15 minutes, a later unattended session
  on that branch, in the same checkout, can put a question before its own `run start`. The gate
  is the backstop, since the skill puts no question before Frame. The marker is a file a run can
  write, as the record head above is, and it opens nothing while a record reads in progress. A
  worktree policy never carries the marker into another checkout: a `.stamity` copy row skips it,
  and a row naming it is refused. A `symlink` row on `.stamity` still shares it live, so a checkout
  linked that way reads the marker its source checkout wrote. Code:
  `src/hooks/scripts.ts::buildUnattendedAskGate`, `src/cli/commands/run.ts::markRunEnded`,
  `src/worktree/policy.ts::resolveStrategy`, `src/worktree/policy.ts::assertRulesAdmissible`.
- **The origin pin.** `origin.json` is a file in the run folder, read as data. A run that rewrites it
  together with git's configuration (`.git/config`) before its next checkpoint moves the push and the
  pin as one, and the check passes. The pin holds against origin's URL, a push URL, or a `url.*`
  rewrite (`insteadOf`, `pushInsteadOf`) changed alone. The shell guard refuses a `git remote` write
  and a `git config` write of a `remote.*` or `url.*` key, and the pin is the second check: a rewrite
  the guard misses meets it at the next `run checkpoint` or `run end`, which refuses the push.
- **The cloud proxy.** Behind Claude Code's cloud proxy the push and the REST reads run as the
  platform's shared app identity, so the pre-flight binds the push to that app, not to the person,
  and what it proves is what that app can do on the repository.
- **Custom roles.** A custom repository role that can edit rules, without admin, can lift a
  repository ruleset the pre-flight counted as blocking, since it reads only the account's admin
  right. A custom organization role that manages rulesets lets a member who administers the
  repository lift an organization ruleset the pre-flight counted as blocking, since the role read
  takes `member` as plain membership.
- **An administrator's acts.** An administrator's repository-level acts — a transfer, a rename, a
  default-branch change — can take the default branch out of an organization ruleset's reach. The
  shell guard holds their known forms, and repository acts respelled past it are a residual, so the
  wall is strongest when the account the run acts as has no admin on the repository.
- **`PATH`.** `PATH` decides which `gh` a credential helper written as `!gh auth git-credential`
  runs: the pre-flight reads the helper's program name, not the binary it resolves to.
- **A `gh` behind a shim.** A helper that names gh by a path binds only where that path is the
  `gh` the REST reads run, or the file it resolves to. So a gh installed behind a shim (scoop,
  Chocolatey, mise, asdf, snap), whose `gh auth setup-git` writes the real executable's path, is
  refused by path. The way out is the bare `!gh auth git-credential` helper, the `PATH` residual
  above, which is matched as exactly `gh` or `gh.exe` with no case fold. Code:
  `src/runs/preflight.ts::isGhCredentialHelper`.
- **The run verbs' environment.** The environment the run verbs start under picks the git they run
  and the global configuration it reads: `PATH` chooses the git, which they start by the absolute
  path their `PATH` walk finds, and `HOME` and `XDG_CONFIG_HOME` choose the global configuration
  file, since the verbs keep the caller's environment. Set on the verb's own line they are refused,
  since the verb stands alone there; set earlier in a shell that persists, or by the platform, they
  reach its git, since the push rule reads git's own variables only. Code: `src/shared/programPath.ts::gitProgramFor`,
  `src/cli/engine/gitWrite.ts::gitWriteEnv`. The control that holds is the pre-flight's refusal of
  an account that can push to the default branch: a push such a git makes meets the protection the
  pre-flight proved there.
- **The configuration window.** A `GIT_CONFIG_*` value changed between the pre-flight and the push
  goes unseen. The pre-flight reads git's configuration through git, in the environment the push
  will use, those variables included, and refuses a read that fails as "configuration unreadable",
  so only a value changed after it is missed. The run verbs keep the `GIT_CONFIG_*` variables while
  they remove the program-valued ones, so such a variable gained after the pre-flight, set on an
  earlier line of a shell that persists or by a line of Claude Code's environment file, reaches
  their git. The stand-alone rule for a run verb's line finds the verb by its name in the line's
  text, so a launcher the guard does not unwrap, a name split by quotes or a line built by an
  expression can skip it, and an environment such a line sets reaches the run verbs' git the same
  way.
- **Claude Code's cloud readiness hook.** On a Claude Code cloud machine (`CLAUDE_CODE_REMOTE` is
  `true`) the readiness hook appends `export STAMITY_HOOKS_ACTIVE=1` to `$CLAUDE_ENV_FILE`, whose
  lines Claude Code runs before every later shell command of the session, then runs `npm ci` where
  `node_modules` is missing and a lockfile is there. `npm ci` runs the locked dependencies' install
  scripts, and they inherit `CLAUDE_ENV_FILE`, so one can append lines that run before every later
  shell command, a `GIT_CONFIG_*` variable the run verbs' git keeps among them. The pre-flight's
  `hooks-loaded` reading of that variable is a canary, not a wall: an install script can write it
  too. The control that holds is the lockfile a person reviewed. Code:
  `src/hooks/scripts.ts::buildCloudReadinessScript`.
- **Build files outside the held set.** An environment file can name a build file outside the held
  set — a dev container's build file in another folder, the image a cloud environment builds —
  which no glob list can follow, so an unattended run can change a later cloud run's setup through
  it, unlisted.

The attended guard's accepted gaps. In an attended session the person-only table is the guard's
whole check, and these forms pass it, neither asked for nor refused:

- gh's own field conversions and its current-branch placeholder are read as literal text, so an
  attended REST commit or ref update made from a checkout on the default branch passes;
- a batch ref update whose list element is given whole as a GraphQL variable passes.

The GraphQL forms of a tag-ref create and of a ref delete are read in an attended session too, as
their REST twins are, the create asking and the delete refused, and a ref path with a percent-encoded letter is read decoded, so it is
refused as the ref it names; a path with dot segments is read resolved as well as written, so it
is refused as the route curl sends it to. Code: `src/hooks/personOnly.ts::personOnlyVerdict`.

In an unattended run the unattended rules cover each of these: the push rule refuses every raw
`git push`, every REST write on `contents/` and `git/` refs and objects and every GraphQL branch or
ref move, whatever the branch, and the pre-flight's REST check that the account cannot push to the
default branch stays the wall for that branch alone.

Lines that run inside another line are read as their own by both verdicts, the always-on one and
the unattended one: PowerShell's command wrappers (`pwsh -c`, `powershell -Command`,
`Invoke-Expression`) and a PowerShell script block (`{git push}`), `cmd /c` and `/k`, each
`git rebase --exec` line and the command `git bisect run` runs. A person-only act wrapped in one is
read as one standing alone, asked for or refused by its class, and in an unattended run a raw push
wrapped in one is refused. gh's alias for the
create-and-push form, `gh repo new --push`, is refused in an unattended run as `gh repo create
--push` is. In a PowerShell payload and a `cmd` line a backslash is a plain character, PowerShell's
escape being the backtick, and a program word reads by its file name, so a git named by a Windows
path inside a PowerShell payload (`C:\…\git.exe push`) is read as git by both verdicts. Nested
lines are read up to four levels deep: a line nested deeper is one neither verdict can decide, so
the guard refuses it, naming `NESTING_DEPTH`, and never allows it. Code:
`src/hooks/personOnly.ts::personOnlyVerdict`, `src/hooks/personOnly.ts::unattendedPushVerdict`.

The guard's place reader follows a directory change inside each of those lines too, a `cmd /c` or
`/k` line, a rebase exec line, a bisect run command and a PowerShell script block among them, and
inside a program word that holds a whole line, so an implied push there is judged on the branch the
line moves to. A `git -C` or `--git-dir` value the line cannot show, a brace placeholder among them,
is a place it cannot read, and an implied push from it is refused as one to the default branch. Code:
`src/hooks/scripts.ts::buildPersonOnlyGuardScript`.

Gaps the unattended rules do not cover:

- a PowerShell encoded command (`-EncodedCommand`) and a line another command pipes into `iex` are
  data to the guard, not a line it reads, so a push in one passes both verdicts.

A multi-root workspace file, and every folder's editor settings and tasks files with their
folder-open task, are held paths, not only the root's, and so is every folder's editor MCP-server
file: an unattended run's change to one is held for the person.

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

Two advisories, in three Dependabot alerts, are open and watched rather than fixed. Each alert is
rated high, and none names a patched version (read live on 2026-10-15). They are known residuals
in 1.15.0, tracked in `.stamity/inbox.md` (on the `records` branch) as the row
`2026-10-08_product-core/close/1`:

- `http-cache-semantics` <= 4.2.0 (GHSA-ch52-4w7c-c8xp, high, max-stale handling can disclose
  cross-user cached responses), alerts #23 and #27, no patched version. #23 is `package-lock.json`,
  the root lockfile, where the package is locked at 4.2.0 and reaches the published CLI through
  the optional `sigstore` dependency's signing path; #27 is `website/package-lock.json`, the docs
  site's lockfile, which ships in no package. The advisory names no fix: 4.3.0, the one release
  since, changes Vary matching and exposes the response status.
- `braces` <= 3.0.3 (GHSA-vfj7-8cjw-p6xm, high, stack exhaustion through deeply nested patterns),
  alert #26, no patched version, in `website/package-lock.json` only: the published CLI does not
  reach it.

Each lockfile moves once its advisory names a patched version. Neither advisory is an accepted
risk: no decision recorded here accepts one, and both stay tracked as the row above names. One
item was recorded on this page as an accepted risk, in those words and with its reasons, and it
is retired: the documentation site's `image-size` dependency, reached through Docusaurus's MDX
loader, where two high-severity advisories described denial of service through infinite loops in
its ICNS, JXL and HEIF parsers while no fixed version existed. Both advisories now name 2.0.3 as patched, the re-open trigger this page set, and
the site's lockfile moved to 2.0.4 on 2026-09-28, from the same package and maintainer rather than a
republish ([dated primary sources](.github/release-egress.md)).

Below is implementation and the proofs that closed it. Both rows shipped their proof at 1.7.0. Each
names the run that carries it, so you can open the run rather than take the sentence.

| Work | Current boundary |
|---|---|
| Pack-author signing | `scripts/sign-pack.mjs` signs the existing payload, verifies the declared identity and writes the detached bundle atomically. See [the author workflow](docs/packs-and-trust.md). Local cryptographic fixtures substitute the external identity service in the suite. The authenticated live-signing proof is closed: the [rehearsal on the 1.7.0 candidate](https://github.com/zomarit/stamity/actions/runs/34758487370) signed with a real GitHub OIDC and Sigstore identity and passed its negative controls. Its artifacts are archived under `.stamity/runs/2026-09-14_package-11/evidence/` on the `records` branch. Every rehearsal run is public in two ways, by design: it writes two entries to the public Sigstore transparency log under this repository's workflow identity, and it uploads the signed fixture packs as run artifacts. Those packs hold one throwaway rule file and no product content, and the rehearsal publishes nothing else |
| Release egress | `gates` and `publish` use fail-closed per-job policies. Artifact storage is limited to the current official GitHub account roster. [Endpoint evidence and proof boundaries](.github/release-egress.md) distinguish implementation, changed-job rehearsal and the final credential-bearing publish path. That last boundary is closed: the [1.7.0 release run](https://github.com/zomarit/stamity/actions/runs/34771477218) published over OIDC with provenance, confirmed by the post-publication verifier. The rehearsal-only summary executes no third-party code |

A threat model over the emitted surfaces was a third item on this list, and it has come off. The
seven-surface actor/vector/control/residual table with its mapped ids is written, in
[`docs/security-mapping.md`](docs/security-mapping.md). The table on this page stays what it was, a
control inventory. The mapping is the model beside it, and it is re-run when a catalogue edition
moves or a control's implementing symbol does. Its own re-open trigger names both.

What that page does not do is close the gaps it names. Those are the ones under "What it does not
defend" above, stated there first. Read this page as the whole of the claim, and read the output the
engine writes into your repository as code you are responsible for.
