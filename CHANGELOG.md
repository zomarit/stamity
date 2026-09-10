# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!--
  AUTHORING NOTE — commit types map to Keep-a-Changelog groups deliberately, not 1:1.
  The conventional-commit types this repository uses (CONTRIBUTING.md: feat, fix, refactor,
  test, docs, chore, ci, perf, build, style) do not line up one-for-one with the six groups
  below. Categorize each entry by the effect on a consumer of the package, using this mapping:

    feat  → Added      when it introduces a capability
            Changed    when it reshapes an existing one
    fix   → Fixed
    perf  → Changed
    refactor / build / style / test / chore / ci
          → usually omitted (no consumer-visible effect); include under Changed only when the
            change alters shipped behaviour, install output, or a documented surface
    docs  → Changed    when it moves a user-facing document or claim; omitted otherwise
    a removal          → Removed
    a deprecation      → Deprecated
    a security fix     → Security

  Sections use `## [x.y.z] - YYYY-MM-DD` headings. The release workflow
  (.github/workflows/release.yml, "Compose release notes") extracts the section whose heading
  matches the version being released; a version with no matching section fails the release
  before anything is published.
-->

## [Unreleased]

### Added

- **An APM install route, served from this repository.**
  `apm install zomarit/stamity --target claude` now deploys the package this repository already
  generates — `apm.yml` plus the `.apm/` projection of the corpus — and
  `apm install zomarit/stamity#v<tag> --target <claude|copilot|cursor|codex>` pins it to a release.
  The route was correct and unreachable until APM's type-detection cascade was fixed: through
  apm-cli 0.29.0 a root `plugin.json` carrying the Agent Plugins schema outranked an `apm.yml`, so
  this tree typed as an Agent Plugin, deployed zero primitives and exited 0. 0.29.1 moved an
  eligible manifest to the head of the cascade, which makes 0.29.1 the client floor for this route
  and 0.30.0 the current tested client; an older client prints "Agent Plugins v1.0.0 packages
  install natively only for the 'copilot' target" and deploys nothing, and the remedy is to upgrade
  it. What arrives is 10 agents, 9 commands, 12 rules and 8 skills, each at the path its target
  reads, with codex taking the agents and skills and folding instructions into `AGENTS.md` on
  `apm compile`. CI proves it on every push: `scripts/apm-install-smoke.mjs` installs into a
  throwaway consumer and reads the deployed tree at 0.29.1 and 0.30.0, plus a leg on 0.29.0 under
  `--expect-failure` so the check keeps proving it can still see the original silent failure — and
  the release workflow runs the same smoke against the canonical ref in its own credential-free
  job, which the publish job needs before anything ships.
  The README and `docs/getting-started.md` carry the route, its floor and its symptom.
- **An enterprise upstream lane, for forks of this repository.** A fork that customises anything
  here can now take an upstream release without losing that work. `node scripts/upstream.mjs` (also
  `npm run upstream`) carries the verbs `status`, `preview`, `integrate`, `continue`, `validate`,
  `abort` and `help`; one configuration file, `.stamity/upstream.json`, declares the upstream, the
  integration branch, the release pattern, the fork's own gates, its regeneration commands, its
  generated paths, watched globs and shadowed defaults; and every integration writes
  `.stamity/upstream/integrations/<tag>.json` inside a merge commit carrying
  `Stamity-Upstream-Release`, `Stamity-Upstream-Commit` and `Stamity-Upstream-Gates` trailers. The
  merge happens on an isolated update branch in its own worktree, so the integration branch and the
  operator's working tree are never written; generated paths are regenerated rather than
  hand-merged; no conflict marker can be committed; and the fork's own gates decide whether the
  outcome is `integrated` or `validation-failed`. `.github/workflows/upstream-update.yml` is the
  opt-in GitHub layer — a probe that keeps a repository with no configuration green, a `prepare`
  job that runs the fork's code with no secret in its environment, and a `publish` job that holds
  the write grants and runs only git and `gh`. `test/upstream/lane.test.ts` is the acceptance suite
  over temporary repositories, and `docs/enterprise-forks.md` is the guide. This repository carries
  no `.stamity/upstream.json`, so nothing here runs the lane.

### Removed

- **The separate APM mirror repository, as a distribution channel.** It existed only because APM's
  type-detection cascade routed past this repository's root, so it served a timed copy of the same
  generated package under a name nobody contributes to. With the cascade fixed and the route proven
  from `zomarit/stamity` at `main` and at `v1.3.0` and gated on every release from here on,
  consumers install from this repository;
  the mirror's install command is replaced rather than redirected, and the mirror is retired after
  this release.

## [1.3.0] - 2026-09-09

### Changed

- The published Node floor is `>= 22.22.2`, raised from `>= 22.12`. There were two floors and the
  lower one was the published promise: at `>= 22.12` an `npm install` in this repository reported
  `EBADENGINE` for fifteen packages of its own toolchain, headed by tsdown (`^22.18.0`) and ESLint
  (`^22.13.0`), so the number a consumer was held to was one nobody here developed on. The raise
  goes past both and leaves a single floor. It now matches the highest range the committed runtime
  graph declares — the sigstore 5 graph's `^22.22.2 || ^24.15.0 || >=26.0.0` — so a consumer
  on a Node below it was already meeting `EBADENGINE` from that graph at install. The gap the
  raise closes is that nothing in the tree read the declaration against the graph the declaration
  is a promise about, which is how a dependency major that raises its own `engines.node` reaches a
  user as `EBADENGINE` with every gate here green. A new suite (`test/ci/engines.test.ts`) now
  holds `engines.node` at or above every runtime dependency's own range, and the CI floor leg, the
  README, the getting-started page and the bug-report template move with the number.
- A `/st-work` run's close now appends what it deferred instead of letting it die in the run's own
  ledger: every row that closed `deferred` is written to `.stamity/inbox.md` in the row grammar
  `/st-board` declares — severity, `file:line` or `—`, the evidence in one line,
  `source: /st-work`, and a `Ref:` back to the ledger row it came from — and the close refuses to
  write the run record while any row still reads `open`. `/st-board`'s inbox census names the
  fifth writer that appends and adds a completeness pass to the ways an entry leaves. The ledger
  row gains an optional eighth field, `retired`, written only when its inbox row leaves. All of
  it is shipped prompt text, so every `init` and `sync` emits the new wording.
- `SECURITY.md` names the one verb that writes outside the repository you point it at. `stamity
  workspace sync` takes the nearest workspace root at or above you, patches the manifest of every
  member repository that root's `workspace.json` declares, runs each member's own sync inside it,
  and — on a cascade that is not a `--dry-run` preview — appends a crash journal at
  `<root>/.stamity/workspace-sync-journal.jsonl`. "Network and data handling" said "exactly three
  paths write outside it" and Reporting sent the reader to those same three, which was true of a
  single repository and not of a workspace root; both now say which reading they are making.
- The getting-started guide states what the clients question falls back to: on a terminal it is a
  checkbox menu, and anywhere else — a pipe, a captured log, `TERM=dumb`, a window too short to
  draw the menu — a numbered list you answer by typing the numbers, comma-separated. Its list of
  what init writes and commits, and the worktree section of `docs/working-with-stamity.md`, now
  name the managed block in `CLAUDE.md` beside `AGENTS.md`, `.agents/` and the client trees.

### Fixed

- The help output takes the CLI's one colour decision. `--no-color` is read off the argv the CLI
  was handed, before any parsing, so its answer on the help path no longer rests on the
  undocumented order in which commander parses an option run and acts on `--help` — on commander
  15 that order already gave the right answer, which is why the recorded premise did not
  reproduce. And commander's help writer is pointed at the same colour decision the rest of the
  CLI makes, where it used to decide from
  the real `process.stdout` and its own reading of `NO_COLOR`/`FORCE_COLOR` — a reading that
  ignored the terminal facts the CLI was handed and stripped the wordmark's escapes on every
  process whose stdout is not a terminal, which is why the flag's effect on help was
  unobservable. There is one answer now rather than two.
- The typed numbered menu — the fallback every raw-menu-incapable terminal takes — right-aligns
  its row numbers so a list of ten or more choices (the 17-key `config` picker) keeps its labels
  in one column, and returns the default on an empty choice list instead of asking `Choose 1-0`,
  a range with no member in it.
- The interactive menu — the arrow-key list a raw-capable terminal gets — completes its restore
  sequence past a failing step: the two steps that touch the terminal, raw mode off and the cursor
  shown, each run best-effort, so one that throws on a terminal that went away no longer skips the
  drain, the leftover mark, the pause and the session restore after it, nor replaces the outcome
  the block was guarding. A write that throws inside its key handler now rejects the pending
  prompt, where the throw used to leave the run awaiting a promise nothing would settle.
- Menu frame lines are cut on code points rather than UTF-16 units, so a line clamped at the
  terminal's width no longer ends in a lone surrogate where an emoji or another non-BMP character
  straddled the cut.
- `sync` refuses an override skill whose directory is a shipped skill's projection directory,
  naming the override to rename and the skill it collides with; the collision used to surface as
  the composer's content-equality refusal, which named four adapters, a shared path, and neither
  skill.
- A workspace scan that exhausts the process's file descriptors (`EMFILE`, `ENFILE`) now fails
  loudly instead of reading as "no repository here", where it used to report a shorter member list
  than the tree holds with nothing to say a directory was never read; and the walk now holds at
  most sixteen directory entries in flight per level.
- Cursor emission spells a command id once: an id authored with its prefix already on it rendered
  `st-st-work` in that client's tree alone.
- A generated reference page refuses a title that is blank, opens with whitespace or `#`, or
  carries a `:`, rather than writing frontmatter that publishes the page under a label nobody
  chose.
- The migration page declares its title, so its browser tab and its link unfurls read the page's
  name rather than `migration`.

### Security

- The pack verifier's Sigstore client moves to `sigstore` 5.0.0, with `@sigstore/verify` 4.1.2
  (from 3.1.1, across its 4.0.0 major, which dropped Node 20), `@sigstore/bundle` 5.0.0,
  `@sigstore/core` 4.0.1 (from 3.2.1) and `@sigstore/tuf` 5.0.0. The hardenings the move picks up
  are the `@sigstore/verify` 4.1.0–4.1.2 changes — repeated copies of one transparency-log
  entry are counted once toward the log threshold, so a bundle can no longer meet it with
  duplicates; a DSSE bundle whose entry is a Rekor v2 entry verifies; and checkpoint parsing is
  tightened — `@sigstore/core` 4.0.1's ASN.1 parser hardening, which sits on the certificate
  parsing the verify path does, and `@sigstore/tuf` 5.0.0's refreshed TUF seed files, which arrive
  with `tuf-js` 4 → 6; `sigstore` 5.0.0 itself only drops Node 20. What this changes is what
  `stamity add` accepts when a pack declares `signing.method: "sigstore"` — this repository
  verifies signatures and signs nothing, so no publishing path here moves with it. `p-limit` moves
  to 7.3.2 in the same group.

## [1.2.0] - 2026-09-07

### Added

- An eval lane for the corpus, whose output a model produces: a versioned set under `evals/`
  (`SET-v4` current, `v1`–`v3` retained as immutable baselines), sealed tool-free cases pinning
  the behaviours the corpus promises and the guardrails it claims, a written judge rubric
  calibrated against human-labelled fixtures, the `st-eval-run` manual runner, and a committed
  run artifact per run. The release flow requires a full run's artifact before a tag.
- `stamity config policy list|init|allow|deny|remove`: a writer for the organisation's pack
  policy file, so the refusal messages that name that file point at something the product can
  create.
- `stamity handoff` — `prepare`, `resume`, `list`, `complete`, `prune` — as hidden plumbing
  behind the handoff skill, on the model of `stamity learn capture`. Hidden is not secret:
  `stamity handoff --help` prints in full and the CLI reference documents the verb.
- A generated MCP server reference page, rendered from the catalog the engine already carries:
  every id this project resolves on its own, the version each is pinned to, the credentials it
  needs, and the blast radius of handing it to an agent.
- `docs/doctrine.md`: the four pillars with their public enforcement surfaces, the root question
  every artifact has to answer, and the mechanism that removes one once it stops answering.
- Every touchpoint now closes on one recommended next step derived from the run's own state
  rather than from a fixed menu; `/st-spec`, `/st-ask`, `/st-debug`, `/st-quick`, `/st-rework`
  and `/st-pr-resolve` gained the line the other three already carried.
- `stamity check` warns when a managed file repeats its own managed block below the END marker,
  so the repository loads that content twice (`preserved-duplicate`).

### Changed

- The CLI wordmark is re-derived from the SVG at 62 columns so the `a` reads as an `a`, and it
  stays out of a pane narrower than 65 columns rather than wrapping into half blocks.
- The raw-mode menus carry the product's design language — a bold question, a dim hint, and one
  ground-independent accent on the cursor and the checked box — and, on Enter, replace the frame
  with the question and the answer chosen, so a scrolled-back session reads as a record of what
  was asked and answered. The accent drops to plain ink under `NO_COLOR`, at 16 colours, and on
  a dumb terminal.
- `docs/working-with-stamity.md` is rewritten around one spine diagram and a first-match routing
  table for all nine touchpoints, and moves to directly after getting-started; the docs site
  renders mermaid fences as diagrams. The nine verbs' gloss lives in the CLI reference alone, and
  the touchpoints' one-liners mirror the charter under a drift test.
- The landing page's copy control is visible at rest — it was invisible until hover — both
  call-to-action links carry icons, and a copied state is announced to assistive technology. The
  announcement is armed per control, so the word-wrap button the theme renders beside the copy
  button cannot poison it.
- The published logic bundle drops documentation comments no entry reads: 2,081,093 bytes to
  1,074,318 against the unchanged 2 MiB ceiling, with the emitted tree byte-identical.
- The light intensity tier runs the security lens on a trigger-path match instead of skipping
  every specialist, so the charter's universal floor holds at every tier; the whole-branch deep
  review is anchored where it runs, after the review loop converges and before the QA checkpoint.
- The security review agent carries the security floor tag, so selection can no longer drop it.
- The injection-screening rule screens tool results, fetched web or API bodies and CI logs — run-
  time ingress that never lands in the state directory — the same way it screens state text, and
  reports a hit by class, by the tool or source that returned it, by where in the body it sat,
  and by outcome. A pattern id is named only where a catalog scan actually ran, which this
  ingress has none of.
- The charter's invariants say in as many words that a hand-off framed so the operator can close
  without the floor is itself the relaxation, and that handing the operator a line, diff, or file
  body to paste is an orchestrator editing product files.
- The quick lane's refusal names the threshold row that fired and closes the hand-off route:
  writing the refused change out for the operator to paste is the same refused change.
- `/st-rework`'s plan-lint runs and reports `L4` — every unit's `requirements` field cites a
  requirement id the spec carries, or the literal `spec carries no ids`, with blank never passing
  — and its critical-deferred inbox row now opens with `/st-board`'s four-field row grammar, so
  the reader that must surface the row can parse it.
- The eval set's expectations move through reviewed diffs rather than in place. `SET-v4`'s
  Package 4 repairs delete the five advisory criteria that had failed in two consecutive runs and
  were not promotable — 71 advisory criteria to 66, the 408 binding unchanged — and re-anchor the
  charter-floor case's hand-off boundary on three markers a transcript shows rather than on
  phrasing.
- `stamity add` now points at `check`, whose pack-integrity row re-hashes every installed byte,
  instead of at `validate`, which never scanned installed pack bodies.
- The product-audit pack proposes its epic set in the run report and writes only through the
  board's own write-back channels; it no longer claims to open board items or labels itself.
- README states the GitHub CLI alongside Node: the engine's only prerequisite is Node `>= 22.12`,
  and two of the nine touchpoints — `/st-board` and `/st-pr-resolve` — shell out to an
  authenticated `gh` when they work a real board or pull request.
- `docs/specs/` and `docs/plans/` are kept off the docs site, and links into them are rewritten as
  repository links.

### Fixed

- `handoff resume --dry-run` previews the status advance instead of taking it: it names the
  transition it would record and writes nothing. The integrity check, the expiry and transition
  screens and the drift report all still run, so the preview answers the question that was asked.
- A checkout that translated line endings no longer reads as hand-edited. The engine hashes the
  LF bytes it writes, so a working copy under `core.autocrlf=true` missed the ledger on every
  managed file; the miss is now retried against the same content folded to LF, and agreement
  there takes the no-backup path — no `.bak` beside every engine-owned file, and no warning about
  an edit nobody made. Content that differs any other way still takes the verified `.bak`.
- The review-gate hook's round counter lost an increment on Windows under concurrent writers:
  transient sharing faults (`EACCES`, `EBUSY`, `EPERM`) on the lock, the read, the publish rename,
  the unlock and the stat were read as permanent answers, and one path reset the counter. Every
  site now waits them out on the engine's own retry schedule; a counter that cannot be trusted
  drops the round and says so; and the lock's wait ceiling is stated (25 s) so a herd cannot
  escape the client's hook budget. Waiters no longer read a live holder as a dead one either: the
  holder re-stamps the lock before each retry pause, and the idle window is derived from the same
  retry budgets rather than typed beside them, so a holder inside its own budget re-arms the wait
  instead of consuming it. The lock's own sharing tolerance is Windows-only, so on POSIX a durable
  refusal — an unwritable state directory — answers at once rather than costing the idle window.
- A managed lock could be stolen from a live holder: the refresh cadence is now stated rather than
  derived, so a descheduled holder is not read as abandoned.
- The no-backup overwrite fast path took a hand-edited, marker-less file whole with no `.bak`; it
  now applies only while the on-disk bytes still hash to what the engine wrote.
- `init --dry-run` and `sync --dry-run` disagreed about the three merged MCP documents; both now
  answer from the same merge.
- `TERM=dumb` painted bold and yellow escapes around the typed fallback where 1.1.0 wrote none.
- `config policy` printed an absolute, machine-specific path; every display and JSON site now
  prints it repo-relative and POSIX.
- The docs site's diagram reflowed the page on first paint and shipped two mermaid palette pairs
  under 3:1; the palette is stated once for both colour modes and the diagram's box is reserved
  before it draws.
- The CLI reference's note under a hidden verb names that verb rather than a different one — the
  `stamity handoff` section said `stamity learn --help`.
- The configuration reference no longer calls `mcp.servers` the one row whose accepted values are
  a closed list; several rows have one. What is singular about that row is that its list is kept
  on a page of its own instead of in its cell.

### Security

- `SECURITY.md` records the documentation site's `image-size` advisories as an accepted risk
  rather than tracked work, and says why: the package is a build-time dependency of the site under
  `website/`, absent from the published npm package, parsing only images committed here, and no
  patched version exists upstream. The entry names what would re-open it.

## [1.1.0] - 2026-09-01

### Added

- Skill-override emission: a pack skill can override a shipped skill of the same id, and the
  pack's support files are screened before they are emitted.
- Overlay layers: layered configuration overlays that compose over the base emission.
- Workspace surface: the workspace engine and its CLI entry point.
- A managed worktree lane for driving work in a dedicated worktree.
- Raw-mode interactive menus for `init`, and a configuration picker.

### Changed

- Documentation: added the lifecycle guide, the tier riders, and the reference introduction;
  published the overlay, workspace-surface, and worktree lane designs; and re-attested the
  customization, workspace, and lifecycle pages against the landed engine work.
- The docs-site deploy is armed only by a succeeded real release, rather than by any push.
- Security: `SECURITY.md` ("Publishing this package") now records the three platform release
  controls (required reviewer, `v*` tag ruleset, npm trusted publisher) as in force, rather
  than as not yet armed.
- CLI reference: mutating commands are described as "May write when it runs" — the previous
  blanket "Writes when it runs" was wrong for the commands whose bare invocation is a read.

## [1.0.1] - 2026-08-31

### Added

- A generated APM package projection: the `apm.yml` manifest and the `.apm/` primitive tree,
  regenerated and verified alongside the other published surfaces.

### Changed

- Unified the pack surface onto the `st-` prefix, slimmed the tracked assets, and quieted the
  migration path.
- Brand: the social preview is the dark card, and the social cards carry the wordmark alone.

### Fixed

- Release: the GitHub-release step now names the repository explicitly, closing the gap where
  the artifact-only publish job had no git directory to infer the repository from.
- Site: `llms.txt` is served at the site root, and the homepage points at stamity.dev.

## [1.0.0] - 2026-08-31

### Added

- Initial public release. The engine; the SDLC touchpoint command surface; four-client
  emission (Claude, Cursor, Copilot, and Codex); the first-party packs; and the documentation
  site.

[Unreleased]: https://github.com/zomarit/stamity/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/zomarit/stamity/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zomarit/stamity/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zomarit/stamity/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/zomarit/stamity/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zomarit/stamity/releases/tag/v1.0.0
