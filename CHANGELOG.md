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

## [1.8.0] - 2026-09-15

### Added

- **Rules can be delivered on demand instead of loaded every session.** The setup manifest gains
  `ruleDelivery`, `"always-on"` or `"on-demand"`, read and written through `stamity config`, and a
  manifest without the key — including every manifest written before it existed — reads as
  `on-demand`. Claude Code and Copilot emit a glob-less rule that is neither `precedence: critical`
  nor floor-tagged as `.agents/skills/stamity-<rule-id>/SKILL.md`, plus that client's own native
  skills copy for the rules it demoted, rather than as a rule file; Codex folds only its critical,
  floor-tagged and nested-`AGENTS.md`-anchored rules into the always-on appendix and projects the
  rest as skills; Cursor keeps its Apply-Intelligently rules, which already defer a glob-less rule
  natively. `always-on` reproduces the 1.7.0 emission and stays selectable per repository.
- **Codex emission refuses a skills list past the client's published bound.** The name and
  description of every projected skill are summed at emission when Codex is selected and refused
  past 8,000 characters, with the measured total, the cap and the `always-on` alternative in the
  message. The capability matrix discloses the measured characters beside the cap.
- **The charter states the eval floor for model-backed features in one line.** Every emitted
  charter's conditional layer says that a model-backed feature ships with a versioned golden and
  adversarial eval set whose thresholds are declared before the run. The template stays inside its
  own line cap with the line added.
- **Every emitted charter states which version of the invariants it carries.** The charter template
  declares `invariants_version`, `invariants_ratified` and `invariants_amended`, and each client's
  charter renders `Invariants version 1.0.0 · ratified 2026-08-31 · last amended 2026-09-13` under
  `## Invariants`; `stamity check` prints an `invariants` row stating what the installed engine
  would render. A template with a missing or malformed key fails validation naming it, and one
  declaring none loads unversioned. `docs/doctrine.md` carries the amendments table and
  `GOVERNANCE.md` the bump rules the suite enforces against the block's text.
- **A security standards mapping and threat model.** `docs/security-mapping.md` crosswalks this
  project's controls to version-pinned catalogue editions — OWASP for agentic applications 2026,
  for LLM applications 2025 and the 2021 web list, NSA/CISA joint guidance, and the NIST AI RMF
  with its generative-AI profile — each named with its publisher, edition and read date. It carries
  an actor, vector, control, residual and mapped-id table over six engine surfaces plus the release
  publish path, every control traced to a `path:line`, above a section stating the gaps and the
  items that do not apply. `SECURITY.md` links it.
- **A measurements page.** `docs/measurements.md` publishes the verified merge-ready rate over the
  committed run records — 5 of 7 (0.714) — with the rule it reads, its denominator, and the
  seventeen excluded run directories each named with the evidence it lacks. Beside it is a
  committed npm-download snapshot, labelled a reach proxy: downloads count CI runs, mirrors and
  re-installs, and this project collects no telemetry. The page renders from a frozen snapshot
  committed next to it, refreshed per release.

### Changed

- **The always-on load ceilings drop to the measured composite.** Under the `on-demand` default the
  slice a client loads unconditionally measures 95 physical lines on Cursor, Claude Code and
  Copilot and 407 on Codex, against 92, 236, 236 and 1,063 before; the shared root `AGENTS.md` is
  24,904 bytes when Codex is selected and 5,192 without it, against 29,935 and 5,004. Codex keeps
  `injection-screening`, `secrets` and `security-patterns` unconditional and receives the other
  nine rules as skills, so the appendix that used to drop eight rules to fit its 32 KiB budget now
  drops none. Each ceiling fails in both directions: over is an unratified slice, under is a saving
  nobody wrote down.
- **The eval set moves to `cases-v6` under `SET-v7`.** The four thresholds and the scoring rule
  carry over from SET-v6 verbatim, and SET-v6, `cases-v5` and earlier stay retained and unchanged.
  The set is 99 cases — 50 golden, 19 adversarial, 30 probes — adding eighteen trigger probes for
  the rules now delivered as skills, whose briefs carry the extended skill surface and whose recall
  labels derive from the case's source, and three charter-only twins governed by a floor line
  alone. Eight advisory criteria that missed in two consecutive runs were disposed as the set's
  own rule requires — two promoted to binding rows on quoted source text, six deleted with their
  reasons — and the manual runner's guard now reads those dispositions off the case files. The set
  also declares incremental runs: a release's first complete run is its baseline, and a later run
  within the same configuration re-measures only the cases whose file or cited source text moved,
  carrying every other case's three admitted samples from the prior artifact with per-case
  provenance. The release checklist's eval line points at `SET-v7.md` and reads "measured", by
  the baseline run or an incremental run composed with it.
- **The two open security proof rows cite the runs that closed them.** Pack-author signing names the
  authenticated rehearsal on the 1.7.0 candidate, which signed with a real identity and passed its
  negative controls; release egress names the 1.7.0 release run, which published over OIDC with
  provenance and was confirmed by the post-publication verifier. The threat model has come off the
  same list and is now a written page.
- **Every hand-written page is re-attested at the 1.8.0 cut.** The pages in the documentation
  suite's bucket plus `GOVERNANCE.md` were checked claim by claim against the candidate tree and
  restamped `verified against the tree at the 1.8.0 release cut (2026-09-15)`. Corrections landed
  in the doctrine, getting-started, customization, contribution, governance and security pages;
  the suite holds the stamp date and refuses one later than the cut.
- **The Codex eval profiles are marked documented but unproven.** `codex-astra` and
  `codex-astra-judge` read "documented, unproven, no run of record" in the eval README and the
  profile document, with the control they lack named beside them; selecting one establishes no
  measurement. The Claude profile remains the default and now selects `rubric-v7.md`, and the
  README's current-rubric row is derived from the selected profile rather than from prose.
- **Two more lines ride every release cut.** Before the tag, every hand page is re-attested against
  the candidate tree and the suite's release-cut date moves with it; and the measurements page's
  input is refreshed — the rate is frozen into a dated snapshot, the page re-rendered from it, and
  both committed — so a run record written after the snapshot is not on the page until the next
  refresh.
- **A QA harness covers the vendor-documented halves of the manual walk-through.** It is a
  repository surface rather than a shipped one — the published package carries `dist` alone — and
  it runs keyboard journeys at 375 and 1440 in both themes with accessibility-tree and axe
  snapshots against the built site, plus headless hook deny and allow runs per client, writing one
  evidence row per QA item bound to its input hashes so a performed human row carries forward while
  its inputs are unchanged and reopens when they change.
- **The 1.8.0 release run passed every threshold and floor.** Run 30 (`evals/runs/2026-09-15-run-30/`)
  measured the whole set under SET-v7's incremental rule, declared the same day: run 27 is the
  release's baseline (604 calls), run 29 re-measured the twelve cases the repair round touched, and
  run 30 the one case the reviewed expectation amendment touched, every other case carrying its
  three admitted samples with per-case provenance and calibration fresh each time. Golden 1.000 (50 of 50)
  with every floor case passing, guardrail hold 1.000 (15 of 15), benign-twin false refusals 0 of 4,
  trigger-probe accuracy 1.000 (30 of 30) with every per-skill recall met; three admitted samples per case,
  the Claude profile, rubric v7, thresholds as declared before the run. The on-demand rule delivery
  therefore ships on by default.

### Fixed

- **The ingress report says the run goes on, and its class descriptions cannot echo a span.** The
  injection-screening rule's report of a hit on tool, web or CI ingress now says in its own words
  that the run continues on its original objective, instead of only continuing; and the
  pull-request screen's class description is the taxonomy's own one-line definition of the class
  plus the locator, never a description of what the comment said, so a redacted span has no route
  back into the report. Both are repairs of single-sample misses the 1.8.0 release run recorded.
- **The performance agent's findings carry how each cost claim was established.** A finding row
  gains a `method:` slot — a static read of the cited lines, a count executed, a benchmark run or a
  budget file — and a cost claim with nothing to put there is written as a question, not returned
  as a finding. The row that missed one sample in every release run since 1.6.0 missed two in the
  1.8.0 run before this repair.
- **The spec author's ambiguity return names the smallest unblocking input.** The return
  contract's `BLOCKED_AMBIGUITY` line asks for the competing readings and the smallest input
  that unblocks them, as the question-protocol rule already required, so a caller can answer
  without reading the sub-agent's transcript.
- **Codex setups enable the hooks feature they emit.** The generated `.codex/config.toml` carries
  `[features] hooks = true`; the client defaults the flag off, so every emitted hook was inert
  without it. The emitted hooks description and that table's comment both state the three steps
  between the file and a hook the client runs — the feature flag, project trust in the operator's
  own Codex home config, and per-hook trust by hash.
- **`worktree add` survives the Windows commondir race.** When git exits 128 reporting that it
  failed to read a sibling worktree's `commondir`, the same command is retried exactly once after
  250 ms. Any other exit 128 is git answering the request and is reported as before; a second
  failure of the same shape is reported as a real failure.
- **The atomic-write rename schedule outlasts a longer Windows hold.** The win32 schedule gains
  four more 800 ms steps, twelve in all, so its ceiling is 8,687.5 ms including jitter against
  4,687 ms before, after a Windows leg spent the old budget in full and still lost the rename.
  POSIX keeps its four retries and 750 ms, and the generated hook script's copy of the schedule
  moves with it, pinned to the engine's compiled retry count.
- **Documentation tables associate every header cell with the cells it labels.** Each rendered
  header cell carries an explicit scope — a header row's cells to their column, a body row's first
  cell to its row — and a cell already associated through `headers=` is left alone.
- **Three governing obligations are stated where the artifact is produced.** The performance agent
  states that a brief fact restated in a finding body still carries its own `path:line`; the
  security agent states that a path with no line number is a bare path, the same defect as no
  citation; the spec command states that with several next-step conditions live, the step names
  exactly one of them and never two chained with `then`.

## [1.7.0] - 2026-09-13

### Added

- **Pack authors can create detached Sigstore bundles.** The source-checkout signing helper
  uses the existing verification payload and signer declaration, checks the returned bundle,
  and refuses output paths that could overwrite pack inputs. The engine exports `pack.sign`
  and its options type; the public CLI keeps its existing commands.
- **TypeScript consumers receive public declarations.** The package exposes declarations
  alongside its existing JavaScript entry, including the dependencies needed to resolve
  reachable Sigstore types in an external project.
- **Spec and plan workflows can check structural coverage.** A projected `st-verify` companion
  detects missing, duplicate and dangling requirement or unit references in existing Markdown
  formats. Semantic review remains a separate required step.
- **Manual evaluation records admission evidence.** Session-native evaluation uses fresh
  agents without an API credential, with recorded ambient instructions and native visibility
  limits. The optional stateless API transport uses an authorized API credential. Both record
  exact inputs, model controls, traces and bounded retries, and require every calibration label
  to match before accepting scores. Deterministic tests do not establish live model behavior.
  The eval set moves to `SET-v6`: the same cases, criteria and thresholds, scored so that every
  must-NOT criterion on a floor or guardrail case stays all-or-nothing across the three samples
  while every case otherwise passes with two of three; the judge rubric moves to v7 with a
  closed citation form and the same calibration fixtures and keys.

### Changed

- **Governing prose states its obligations in words.** The 1.7.0 evaluation run measured
  where the model under test delivered the substance and dropped the named token, answered
  half of a conjunctive rule, or relaxed in the closing line what the body refused. The
  charter, the affected rules, commands and agents now say those obligations outright: the
  row and surface a quick-lane refusal names, the dated inbox block a rework appends, the
  replay branch and per-caller scope of an idempotency conflict, the accessibility clause of
  a rendered error state, the census dispatch issued in its own turn, and the secret value
  that the reply never quotes, masks or exemplifies; and, after a second measured run, the
  closing line that offered the escape the body refused, the halves of a conjunctive rule, the
  headline that answers without its citation, the screened span carried over in a paraphrase,
  and the single next step. Sealed evaluation briefs moved with the prose; no criterion or
  expected answer changed.
- **Shipped skills declare compatibility and license metadata and include invocation hints.**
  Client documentation names the supported native invocation syntax and manual fallbacks.
- **Authoring and review instructions make proof obligations explicit.** Structural checks
  retain semantic review, every finding names its evidence basis, and onboarding time limits
  keep unmet mandatory gates in the `Not done` report. Security reporting separates categories
  from mechanisms and excludes credential fragments and injected payload wording.

### Fixed

- **Native hook output follows each client's decision contract.** Portable runners translate
  allow, deny and global-stop responses with their reasons, normalize supported event payloads,
  and apply bounded execution. Documentation identifies native timeout and unsupported-event
  limitations instead of claiming uniform enforcement.
- **JavaScript projects honor an explicit typecheck script.** Generated verification gates
  retain a configured typecheck command even when no TypeScript source is detected.
- **Imported authoring scripts do not start a second process or write output.** Direct script
  invocation still forwards Node flags and arguments and preserves useful failure statuses.

## [1.6.0] - 2026-09-10

### Added

- **Explicit downstream publisher identity.** Package authors can set
  `stamity.publisher` in `package.json` for the APM and plugin generators. Both validate it
  against the GitHub owner in `repository.url` before writing, while an absent setting keeps
  the canonical publisher. Package metadata does not grant publication permission.

### Changed

- **Public and independent private APM packages carry the resolved fork layer.** Rules,
  commands, agents and skills added, replaced or patched under `fork/` now reach the generated
  package alongside existing direct `content/` customization. Replaced skills keep their
  bundled directory and name; additions keep their authored names. Winning skill companion
  files retain their bytes, patch control files stay out of installed companions, and unsafe
  paths or identity collisions fail before generation writes. CLI commands and consumer
  override precedence retain their existing behavior.
- **The enterprise guide covers private onboarding through updates and recovery.** It documents
  independent private repositories retaining upstream history, disabling Actions before importing
  historical refs, explicit private destinations, authenticated APM installation, the existing
  downstream APM and Renovate distribution, required PR checks, monitoring and recovery. Its
  capability table distinguishes APM's four primitive classes from the packaged CLI's charter,
  hooks, MCP wiring and runtime, and names the live evidence each deployment must establish.
- **Eval runners can select explicit Codex model profiles.** `codex-astra` runs Astra scenarios
  with a Sol judge; `codex-astra-judge` reverses those roles. The Claude profile remains the
  default, and calibration, isolation controls and results remain separate for each profile.

### Fixed

- **An upstream update branch whose PR creation failed can recover its missing PR.** A retry
  verifies the retained branch's merge parents, integration record, release and target identity,
  and tree before opening the PR without rewriting the branch. Existing open, closed and merged
  PRs keep their metadata and disposition. Human changes, moved targets, ambiguous ownership and
  workflow-file changes require review. Recovery reports identify the retained remote SHA and
  keep oversized integration records in the run artifact within GitHub's PR body limit.
- **Inherited public publishing workflows are restricted to the public canonical repository.**
  npm release, canonical APM verification and public docs deployment check GitHub's execution
  identity and visibility. A downstream configures its own reviewed private release destinations;
  canonical release approval and provenance controls continue to apply.
- **Upstream access and missing-history failures include recovery steps.** Diagnostics identify
  approved network, authentication and history restoration checks, including the separation
  between credential-free preparation and the publish-only update token.
- **Landing-policy checks include repository settings and classic branch protection.**
  Paginated rulesets, merge queues and repository merge methods are checked together; unreadable
  constraints stay explicitly unverified while known ancestry restrictions still warn.
- **Downstream updates satisfy inherited contribution checks.** New PRs and manual recovery
  commands use conventional titles. Configured committers sign off new integration commits;
  the local placeholder never certifies a DCO. The no-config test uses an isolated checkout,
  so configured downstreams can run the same suite.
- **Documentation remains readable across themes and wide tables support keyboard access.**
  Text and code colors retain contrast, and scrollable tables expose a visible keyboard focus.

## [1.5.0] - 2026-09-10

### Added

- **A fork layer, for downstream forks of this repository.** A package built from a fork can now
  carry a `fork/` directory — `fork/<class>/<id>.md` and `fork/skills/<id>/SKILL.md`, with
  `.customize.yaml` and `.customize.md` siblings for a patch — whose agents, rules, commands and
  skills add new ids, replace bundled ones whole, or patch them field by field, and reach the
  fork's consumers through the same emission the corpus takes, without a single edit under
  `content/`. The chain any `(class, id)` resolves through is corpus or pack → fork (a full
  replacement or a patch) → user (a full replacement or a patch): a consumer's own
  `.stamity/overrides/` tree still takes every id it claims; a pack and the fork layer never share
  an id, and whichever of the two arrives first the pack is the one refused, exactly as between a
  pack and the corpus; a fork patch of an artifact only a pack supplies waits for that pack in a
  repository that does not carry it, reported as a warning row rather than as the error a
  consumer's own orphan patch gets, and a fork patch whose id a consumer override has replaced is
  reported as inert under that override; and a fork artifact is admitted by presence, so no
  selection record deselects it. Ids are bare slugs — a fork filename or skill directory spelled
  with the engine's `stamity-`/`st-` prefix is refused at index time, and a bare slug matching a
  prefixed corpus file replaces it, prefix and all. `stamity validate` reports every replaced or
  patched id as a shadowing row marked `— fork layer` (`winner: "fork"` for a replacement and
  `layer: "fork"` for a patch in the JSON envelope), and the upstream lane derives a drift pair for
  every fork file whose bundled counterpart exists, so a release that moves a replaced or patched
  default is reported rather than silently hidden; a fork addition has no counterpart and derives nothing. A
  package with no `fork/` directory is byte-identical to one built before the layer existed — its
  index, its plans, its ledger and its goldens all unchanged — and this repository ships no
  `fork/`. `docs/enterprise-forks.md` carries the authoring guide and `docs/specs/fork-layer.md`
  the design.

### Changed

- **A skill replacement now keeps the replaced skill's emitted name.** An override — or a fork-layer
  skill — that takes a bundled skill's id is projected under the spelling that skill already ships
  under, directory and `name` alike: `.stamity/overrides/skills/qa/` declaring `id: qa` replaces
  `st-qa` and still emits as `st-qa`. It used to emit under the bare directory it was authored in,
  which moved the call site from `st-qa` to `qa` and broke every reference to the skill, including
  the ones in artifacts the replacement never touched. A skill whose id nothing bundled holds is an
  addition and still projects under its own directory name. `docs/customization.md` carries the
  corrected behaviour.

### Fixed

- **The upstream lane paired a bare-id override with a corpus path that never existed, and so
  reported no drift for it.** Ids under `.stamity/overrides/` (and now under `fork/`) are bare
  slugs while the corpus spells the same ids with a reserved filename prefix, and the shadow-pair
  derivation composed the counterpart from the bare name alone — so
  `.stamity/overrides/rules/secrets.md` was paired with `content/rules/secrets.md`, a file this
  repository has never had, and every release that changed the rule behind that override was
  reported as touching nothing. The counterpart is now the spelling that EXISTS at the target head
  among the three the corpus uses (`<id>.md`, `stamity-<id>.md`, `st-<id>.md`), so
  `.stamity/overrides/rules/secrets.md` now pairs with `content/rules/stamity-secrets.md` and a
  skill's halves pair with the bundled `content/skills/st-<id>/SKILL.md`. A file whose candidate
  spellings all miss still derives no pair: it adds an id upstream does not have, and the lane has
  nothing to compare.

## [1.4.0] - 2026-09-10

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

[Unreleased]: https://github.com/zomarit/stamity/compare/v1.6.0...HEAD
[1.6.0]: https://github.com/zomarit/stamity/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/zomarit/stamity/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/zomarit/stamity/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/zomarit/stamity/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zomarit/stamity/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zomarit/stamity/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/zomarit/stamity/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zomarit/stamity/releases/tag/v1.0.0
