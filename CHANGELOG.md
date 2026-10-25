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

### Upgrading from 1.16.0

The items below are read from the code and the tests on the branch that carries them. No upgrade of a setup the
published 1.16.0 wrote has been walked yet; the release cut walks one and restates what it reads.

- **Two skills leave the core for the new `frontend` pack.** `st-design-system-detect` and `st-browser-evidence` ship
  in the `frontend` pack now, not in the core corpus. The first `sync` deletes each copy under `.claude/skills/` and
  `.agents/skills/` whose bytes are still the core rendering 1.9.0 through 1.16.0 wrote, keeps a copy you edited, and
  prints one `moved:` line per skill naming what it removed or kept and the pinned `add frontend` call. To keep the
  skills, work in this order: `sync`; delete by hand each copy a `moved:` line names as kept, unless it is yours, in
  which case move it aside; `stamity add frontend`; `sync`. The pack's copies then stand at the same paths. Running
  `add frontend` before that first `sync` is refused, because the ledger rows 1.16.0 wrote still claim both skill ids,
  and the refusal names this order. A kept copy left in place makes the last `sync` refuse that one file by name and
  exit 1 after writing the rest; once the copy is gone, the next `sync` writes it. This repository's own `sync`
  printed the `moved:` line for both skills and removed their four copies.
- **An overlay of either skill is refused.** A `.customize.yaml` or `.customize.md` under
  `.stamity/overrides/skills/design-system-detect/` or `.stamity/overrides/skills/browser-evidence/` stops `sync`,
  `check`'s drift gate and `validate` with `VALIDATION_ERROR`, naming the move and `add frontend`, with the
  pack installed or not, since overlays on pack skills are not applied. Fold the change into a full override under
  another id, or remove the file. A full override of either id still projects, and `sync` warns that it now stands
  alone; with the pack installed, it collides with the pack's copy and `sync` refuses it. `check`'s new `moved-skills`
  row names each case.
- **A skill head that wrote `user-invocable` or `disable-model-invocation` as a string now stops `sync`.** Both keys
  pass through to the emitted head as top-level keys, where they were hoisted under `metadata`, and a value that is not
  `true` or `false`, `"false"` included, is refused with `VALIDATION_ERROR` naming the file and the key. `add`
  refuses a pack skill that carries one with the same error, so a pack that would stop `sync` is not installed. Write
  the boolean.
- **Each rule-skill's head gains one line.** Every rule delivered as a skill now carries `user-invocable: false`, so
  the first `sync` rewrites each `stamity-<rule>/SKILL.md` it emits by that line.
- **Three packs are retired: `ops`, `product-audit` and `scaffold`.** A copy one of them installed still works as
  installed, and `check`'s `pack-catalog` row warns on it, naming where each of its parts went and the order that
  replaces it: `clean --pack <id>`, then delete by hand each client copy it keeps and names, unless it is yours, then
  `sync`, then `add` for each successor pack, then `sync`. `add ops`, `add product-audit` and `add scaffold` now
  refuse before they write, naming the same moves and `add <successor>`. Removed lists where each part went.
- **An installed `scaffold` reads an inventory row the detector no longer writes.** Its `/st-design-system-create`
  routes on the verdict row of `.stamity/design-system-inventory.md`, and the `frontend` pack's detector now ends
  that file in a `Status` row and hands the verdict back instead. Remove `scaffold` in the order its `pack-catalog`
  row names. Its token-set proposal now lives in the detector, which writes a minimal token set as text when it finds
  no token source.
- **The first `sync` removes the old Claude Code hook copies.** `sync` no longer writes
  `.stamity/generated/hooks/claude/`: it deletes each copy there still as it wrote it, and keeps and names one you
  edited. Every Claude Code hook entry already runs the copy under `.claude/hooks/stamity/`. Claude Code's GitHub
  Action runs an upgrade pull request with its base branch's settings, so on a base older than 1.16.0 the base's
  entries name the copies that pull request removes: from a 1.9.0 to 1.15.x base the guard refuses every tool call on
  that run until the upgrade merges, and before 1.9.0 the guard does not run on that run at all. For a base older
  than 1.9.0, upgrade through 1.16.0 first, or keep the Action off that one upgrade pull request
  ([`docs/cloud.md`](docs/cloud.md)).
- **An upgrade from 1.16.0 takes the autonomous default with no flag.**
  - On Claude Code's and Copilot CLI's main thread, a ready-for-review mark, a local tag and a workflow dispatch that
    `autonomy.deployingActs` does not name run unasked.
  - Cursor and Codex refuse them in every mode. 1.16.0 refused the ready mark and a local tag there too; the dispatch
    and remote-write rules are new.
  - The run's own pull request lands only through `stamity run land`, when its evidence holds, on every client.
  - To keep 1.16.0's asks, set `autonomy.mode` to `ask`, then run `sync`.
  - Unattended, a local tag and an unnamed dispatch run on Claude Code and Copilot CLI. Name `workflow-dispatch` in
    `autonomy.deployingActs`, and the branches a workflow deploys from in `autonomy.deployingBranches`, where one
    releases or deploys.
  - A repository that never commits its guard copies pays one `sync --loosen` on a fresh clone, on a switch of every
    selected client, or on a hooks layout move.

### Security

- **A Claude Code guard that times out blocks the call.** The Claude Code guard entries carry `onFailure: "block"`,
  so a guard that times out blocks the call (measured on Claude Code 2.1.309; the vendor dates the key to 2.1.295;
  older clients not measured). The Copilot CLI, which reads the same file, ignores the key (measured on 1.0.100).
- **An unattended push is refused when git moved since the pre-flight.** An unattended `run checkpoint` and `run end`
  refuse to push when git's configuration, the git environment (the `gh` credential variables included) or the git
  program differs from what `gate preflight --unattended` recorded — names only, the values in a salted digest
  (`config changed`, `no pre-flight record`, `configuration unreadable`). A refused pre-flight's record lets only
  `run end --refused` take its draft ending, carrying the run's own records alone. `gate` is now listed as mutating,
  and its `--dry-run` reaches `preflight` only.
- **A looser guard is the person's to write.** `sync`, `init` and `workspace sync` refuse with `AUTONOMY_LOOSENED`,
  writing nothing, to bake into a person-only guard copy an autonomy setting looser than the strictest of the guard
  copies on disk, the setting committed at `HEAD` and the manifest being replaced, until the person passes
  `--loosen`; a `--loosen` run names on stderr each guard copy it loosened and what it dropped. A repository that
  never commits its guard copies meets the refusal on a fresh clone's first `sync` and passes `--loosen` once. A
  1.16.0 guard carries no baked setting, and a setup from a release before the guard owns no guard copy at all, so the
  first `sync` after upgrading adopts the `autonomous` default with no flag; set `autonomy.mode` to `ask` before that
  `sync` to keep 1.16.0's asks.
- **The run verbs, `run land` and the loosen gate read git with replace refs off**, by the `GIT_NO_REPLACE_OBJECTS`
  variable and the `-c core.useReplaceRefs=false` command-line key, so a `git replace` ref, a local ref write that
  needs no commit, cannot make the ledger, the hook declarations, the guard copies or a tree they read at a commit
  look like another object.
- **The person-only guard refuses a command line over 64 KiB in every mode, before any reading**; run such a line
  yourself. A substitution's closing scan passes over a quoted heredoc body, and a substitution nothing closes reads
  as filled in.
- **The guard asks before a write reaches another repository or names a person.** It asks for a `gh` write named by
  `-R`/`--repo`, a URL, an issue transfer or a `repos/<owner>/<repo>` path, a `curl` or `wget` write to the GitHub
  API, a push to another repository's remote, URL or any of `origin`'s push URLs, a gist, a GraphQL mutation by node
  id other than resolving a review thread, or one steered by `GH_REPO`, `GH_HOST`, git configuration or `gh`'s
  default remote, read from git's merged configuration with its includes; and before a body, title, closing comment,
  reviewer or assignee names a person other than the repository's own apps (`outside-write`). An unattended run or a
  sub-agent is refused. A remote, URL rewrite or include written runs on the main thread and is refused for a
  sub-agent (`remote-write`). A body read from a file is not screened for mentions.
- **On Codex and Cursor, whose hook payload names no agent, the person-only guard refuses a ready mark, a local tag,
  an unnamed workflow dispatch and a remote write in every mode** instead of letting a sub-agent run them; 1.16.0
  refused the first two there, and the dispatch and remote-write rules are new.
- **`SECURITY.md` names the residuals the autonomy work leaves.**
  - On a single-account repository, the run's login is the person's, so the review loop is the evidence of record.
  - A repository's CI may choose its checks with code the change edits.
  - `--approved` is only as good as the guard's ask on its line.
  - A `gh` planted elsewhere on `PATH`, or steered from the user's home folder, can still reach the land verb, and
    `TMPDIR` moves the temp folder it checks.
  - A body read from a file, or filled in by the shell, is not screened for mentions. Neither are gh aliases and
    extensions, and short options are read as gh 2.102.0 reads them.
  - A gh write that names no host is compared on `GH_HOST` or GitHub's public host, never on gh's own default host.
  - In any mode, a sub-agent's direct write of the git config file moves the origin that later writes are compared
    with. On Codex and Cursor, a direct or linked write to the git configuration file reaches every call; they refuse
    a remote, URL-rewrite or include write in every mode.
  - Re-pointing the origin's HEAD ref with a ref write is not read as a person-only act. Where the default branch is
    named neither `main` nor `master`, a later attended push to it can run without asking.
  - A heredoc body that is read as data is run unread by a program that runs it as code.
  - With hooks off, no settings row asks for a ready mark or a local tag under the default setting.
  - A forged committed ledger record can make `sync` remove an owner's equal ask row.
  - A Claude Code client older than 2.1.295 was not measured with `onFailure`, and Copilot CLI ignores the key.
  - A Codex verdict role's read-only is an instruction, not a boundary.
  - The loosen gate trusts whatever `HEAD` a commit or a checkout moves to.
  - The configuration window stays open to a re-run or forged pre-flight, and to a change made after the second
    read.
  - The charter, the rule files and the agent, command, skill, prompt and chat-mode definitions land on the evidence,
    with the review loop their only reader.
  - The ledger the land verb checks is the run's own committed file, so the review loop and the whole-branch review
    are the evidence of record.
  - A record head rewritten to `Mode: attended` skips the configuration window's compare and the pre-flight record,
    and lifts the land verb's own `--approved` refusal.

### Added

- **The `production` pack.** `stamity add production` installs `/st-production-review` and two skills that start
  only when invoked by name, `st-release` and `st-incident`. The review checks one service at one commit through 19
  checks over security, supply chain and operations, eight of them blocking. Researcher and test-runner agents
  gather the evidence and a separate reviewer grades it from their files, never from their summaries. It writes
  `.stamity/production/<service>-<sha>.md` and `.json`, routes each gap to `/st-work`, `/st-plan` or
  `/st-board fill --source <report>`, and ends on `Ready: YES`, `NO` or `not signed`, naming where the approval of
  record lives. An optional `.stamity/production/policy.md` adds controls and waivers; a waiver its own requester
  approved, or one past its expiry, clears nothing. `st-release` writes a change record and stops before a tag push,
  a release, a publish or a deploy until `v<version>` or `DEPLOY` is typed, and reads the readiness review as a
  warning only. `st-incident` investigates read-only, proposes each mitigation and applies none, and writes a
  post-incident review whose root cause names a `path:line`. Neither skill adds a row to Codex's skills list.
- **`/st-ui-review` in the `frontend` pack.** It reviews a named screen or flow against the design system, the four
  UI states and WCAG 2.2 AA through the core design-quality agent and the browser-evidence skill. Each finding names a
  `path:line`, the command edits no file, and where browser evidence cannot run, each criterion only a render decides
  reads `not measured`.
- **`/st-plain`, a core skill.** It rewrites a given text in plain words, or the last reply when none is given,
  keeping every fact, number, path, command, confidence label, open gap and refusal, and writes no file. The model
  may pick it on its own, Codex lists it, and a Claude-only setup's `/` menu counts it (Changed).

- **The pack catalog is the packs folder.** Every `packs/<id>/` holding a `pack.json` named `<id>`, with a description
  and a generated pin, is in the bundled catalog, so a fork adds a pack by adding the folder and running
  `node scripts/generate-pack-manifests.mjs`, with no code edit. A folder that breaks one of those rules fails the
  catalog's read with every defect listed. The build writes the package's version into each shipped
  `dist/packs/*/pack.json`, and the generator's `--write` sets each source manifest's `version` to it.
- **The `frontend` pack.** `stamity add frontend` installs `st-design-system-detect` and `st-browser-evidence`, moved
  from the core (Upgrading from 1.16.0). `init` suggests it where it detects Next.js, React, Vue, Svelte, SvelteKit,
  Nuxt, Angular, Astro, Remix, SolidStart, TanStack Start or Qwik: once, on the first row of its stack block, with the
  pinned `add frontend` line, and never once the ledger records the pack installed. `init` installs nothing itself.
- **`add` refuses before it writes in three more cases.** With Codex selected, a pack that would take Codex's skills
  list past 8,000 characters is refused, `--dry-run` included, naming the pack's share and the total, measured by the
  same count `sync`'s refusal makes for that setup, and naming `clean --pack <id>` first where another installed pack
  already fills the list; `add --json`'s `planned.fit` carries the measure. A pack artifact whose name or
  id another layer already holds in the same class (the core, selected or not, the fork, an override or another
  installed pack) is refused, where it passed `add` and failed at `sync`; an id another layer holds prints under its
  own `id collisions` part. And a retired pack id, once a release retires one, is refused naming where its parts went
  and `add <successor>`, with `add ./node_modules/<id>` as the way to install an npm package of that name on purpose;
  this release retires `ops`, `product-audit` and `scaffold` (Removed).
- **Two `check` rows.** `pack-catalog` warns on an installed catalog pack whose content is not the copy this release
  bundles, naming `add <id>`, and on a first-party copy of a retired pack, naming the replace order; it never fails.
  `moved-skills` fails on an overlay of a skill that moved to a pack, and warns on a full override of one or on a core
  copy still recorded. Both sit after `pack-reach`, and [`docs/troubleshooting.md`](docs/troubleshooting.md) lists
  them.
- **The `autonomy` manifest key**: `mode` (`autonomous`, the default, or `ask`), `deployingBranches` and
  `deployingActs`, with its three `config` keys, and the `autonomy-deploying` row of `check`, which warns when a
  workflow deploys from a branch the setting does not cover and says "not evaluated" where it cannot read a workflow,
  never passing on it.
- **Two client keys pass through a skill's head.** `user-invocable` and `disable-model-invocation`, as booleans, reach
  the emitted `SKILL.md` as top-level keys. A skill that sets `disable-model-invocation: true` beside an
  `agents/openai.yaml` setting `policy.allow_implicit_invocation: false` stays out of Codex's skills list and its count.
- **The pull request body carries the change's blast radius.** Every approving review writes a `blast radius:` line,
  `contained`, `moderate` or `wide` with its reason, and `/st-work` keeps the run record's `## Blast radius` section
  after the Frame section, rewritten from the last approval. `stamity run checkpoint --pr` and `run end` copy that
  section into the draft pull request's body before the run's marker, attended and unattended, screened as the body is
  and inside its 60,000-character fit. A record without the section gives the body as before, and `morning.md` gains no
  section.
- **Three working habits for the flows.** An implementer's return names its choices, each approach tried, dropped or
  reverted with a pointer, and `/st-work` records each as a `choice:` line the unit's reviewer reads as a lead, never as
  evidence; every approval names, on a `rests on:` line, the one fact the change's safety rests on and how far it was
  proven (`cited`, `walked`, `run` or `reproduced`); and the question protocol counts a deploy and a message sent
  outside the repository, the run's own pull request aside, among the irreversible actions it asks about. The habits
  come from pstack, a public set of agent skills in the cursor/plugins repository (MIT); the text here is written fresh.
- **The packs reference lists each pack's skills and commands** with their descriptions, under its class counts
  ([`docs/reference/packs.md`](docs/reference/packs.md)).
- **`stamity run land --run <id>` lands the run's own pull request on its evidence.** It merges the pull request at
  its head, or fast-forwards the default branch to it with `--fast-forward`, only when every required check run is
  green (commit statuses never count), no review thread is unresolved, and the ledger at the head holds no open
  Critical or Warning row. It lands only the pull request the run verb recorded when it opened the draft, and only one
  the run's login opened. It asks instead for changes to CI, hook, manifest or repository-declared hook-script files,
  held patches, `autonomy.mode: ask`, and deploying branches or acts, listing every reason and the head commit; the
  person answers with `--approved <that commit>`, which holds only while the head is that commit. `--ready` marks a
  draft ready on the same evidence, and `--wait <minutes>` (at most 9) waits for pending checks, including those not
  started yet, the whole call ending within 9 minutes. It writes why a merge waits onto the pull request as one
  `merge waits on:` line. It works under an app installation token and through version-manager shims. Every `gh` call
  starts at the filesystem root, so a `gh` pinned only in the repository's own version config (a project
  `.tool-versions` or `mise.toml`) no longer resolves there, and the verb refuses.

### Changed

- **Rule-skills leave the `/` menu where a client allows.** Every rule delivered as a skill carries
  `user-invocable: false`, so Claude Code, VS Code and Copilot CLI keep it out of their `/` menu while the model still
  loads it, and a Claude-only setup's menu lists 17 entries, the nine commands and eight skills, `/st-plain` among
  them. Cursor's `/` menu and Codex's `$` list do not read the key and still list them.
- **The core readers work without the `frontend` pack.** `/st-work`'s QA step and the qa skill offer a browser run only
  where the browser-evidence skill is installed, and record browser evidence as not installed otherwise; the
  design-quality agent, the UI-states rule and the verify skill's `ui-token-usage` check read the stylesheet layer's
  token source where no design-system inventory exists, and say the inventory is absent.
- **Codex's skills list sits at 5,015 of 8,000 characters**, over 16 shown skills, where it read 5,570 over 17, with
  the two interface skills in the `frontend` pack and `/st-plain` in the core
  ([`docs/capability-matrix.md`](docs/capability-matrix.md)).
- **The charter moves to invariants 1.3.1.** `AGENTS.md`, and with Codex selected `AGENTS.override.md`, now read
  `Invariants version 1.3.1 · ratified 2026-08-31 · last amended 2026-10-21`. Invariant 5 names the
  `stamity-session-start.mjs` the client's own hook entries name in its held hook settings, and trusts no copy because
  its folder exists, where it named the generated path alone, which Claude Code no longer has. The charter's opening paragraph gains two lines: write every reply in plain words, say how sure you are and
  what that rests on, and say no first when the answer is no. Three lines of the Conditional layer are shortened to
  pay for them, so the charter stays at 95 lines.
- **The design-system detector's file holds repo facts only.** `.stamity/design-system-inventory.md` ends in a
  `Status` row, `clear` or `blocked: competing token sources`, and no longer carries the verdict for one request,
  which the detector hands back instead. A token source whose every value in a category refers to another source's
  token is recorded `alias of <path>` and counts as one system with it. With no token source found, the file carries
  a minimal token-set proposal as text, the brand colour left to you.
- **The design-quality agent takes a whole-surface brief**: a commit and the surface's paths in place of a range,
  read with `git show <commit>:<path>`, which is how `/st-ui-review` briefs it. A brief with no range, no hunks and no
  commit with paths still returns `BLOCKED_DEPENDENCY`.
- **`add`'s name-clash refusal names each clash's mechanism**: two commands of one name are one command on every
  client, where it said for every clash that the skill hides the command.
- **`sync`'s Codex skills-list refusal no longer advises narrowing the content selection**, which `sync` never honoured,
  since it plans the full corpus every run. It names `clean --pack <id>` where an installed pack holds a share, then
  `ruleDelivery: "always-on"`.
- **Codex's dropped-rules warning and the notice in the file that dropped the rules name working remedies**: remove an
  installed pack whose rules share that file (the warning gives the `clean --pack <id>` call), shorten the operator
  text the root `AGENTS.override.md` repeats, or set `ruleDelivery: "on-demand"`, where they advised a content
  selection `sync` never honoured.
- **The reviewer files a pass-through layer as a finding even where the plan asks for it**, naming its consequence:
  the interface kept twice.
- **Codex, Cursor and Copilot hook entries name their script in plain text after the encoded row**, and the runner
  refuses an entry whose word and row disagree. Codex asks you to trust `.codex/hooks.json` again after this update,
  because the file's hash changes.
- **The person-only guard bakes the autonomy setting into every copy**, as a `// stamity-autonomy` line. By default a
  ready mark, a local tag and a workflow dispatch the repository does not name as deploying run unasked on the main
  thread, and a sub-agent's call to one is refused; `autonomy.mode: ask` restores 1.16.0's asks, and a raw ready mark
  stays refused while a run is unattended. A commit-status or check-run write is refused in every mode. An `--admin`
  merge, a push or REST or GraphQL write onto a branch `autonomy.deployingBranches` names, a dispatch named as
  deploying, `--loosen` on a stamity command (or a word the guard cannot read on one, which may spell it), and
  `stamity run land --approved <sha>` ask, attended, and are refused unattended and for a sub-agent; the land verb
  stands alone on its line in every mode. A publish carrying `--dry-run` runs only when npm would read it as one. The
  guard's reading of a shell line is linear in its length, with no regular expression built from the line, and fails
  closed where it cannot read a word: a brace form or a parameter span longer than 256 characters is read as filled
  in.
- **`/st-work` no longer asks about the commit at its close.** After the last round it commits, pushes and opens or
  updates the draft pull request through `stamity run checkpoint --pr`, then runs `stamity run land --ready --wait 8`,
  which merges the pull request when its evidence holds. When the land asks (for example under `autonomy.mode: ask`,
  or a CI or guard file in the diff), the close asks you first, naming the pull request, every reason and the head
  commit, and leaves the merge held unless you say yes. On yes it runs `stamity run land --ready --approved <sha>` for
  exactly that commit, and the guard asks again on that line on Claude Code and Copilot CLI; on Codex and Cursor,
  whose guard refuses that line, the close gives you the line to run yourself and keeps the merge held; a commit
  pushed after your yes is asked about again. A refused land waits as a held row on the summary list, and the next
  walk retries it with the same `--ready --wait 8` line. Say "don't commit" at the close to keep the work local.
  Unattended runs land through `stamity run land --ready --wait 8` after `run end`, only when the summary list holds
  no blocked or refused item, and never pass `--approved`. Every run writes `.stamity/runs/<id>/morning.md` at its
  close.
- **The person-only guard reads a heredoc body as data when only a data sink receives it**: `cat` or `tee` writing
  to a plain file, `cat` inside a quoted substitution that is a whole argument (a commit message), the engine's own
  CLI reading its stdin, `git commit -F -` and `gh pr create|edit|comment --body-file -`. A commit message with a `* `
  bullet, or a `learn capture` body on stdin, no longer asks as a loosening; every other heredoc keeps the reading it
  had (Security).
- **Claude Code's settings follow the autonomy setting.** By default the `gh pr ready` and local annotated-tag ask
  rows are no longer written, and `sync` removes the ones a 1.16.0 setup recorded and names each. Two new ask rows
  make the client ask for a `stamity run land` line carrying `--approved` in every mode, however the program is
  spelled and wherever the flag sits. Set `autonomy.mode: ask` to keep 1.16.0's rows.
- **The security pages state the autonomy model.** `SECURITY.md`, `docs/security-mapping.md`, `docs/cloud.md` and
  `docs/troubleshooting.md` say what still asks, and give the land verb's evidence: required check runs green on the
  exact head commit, commit statuses not counted, no unresolved review thread, no open Critical or Warning ledger row,
  and branch protection deciding any human review. They name `autonomy.mode: ask` to tighten back, and
  `autonomy.deployingBranches` and `autonomy.deployingActs` to name what deploys.
- **Troubleshooting gains entries** for the land verb's `asks` and `refused` reasons, with their fixes; the one-time
  `--loosen`; a `gh` pinned only in the repository's version file; a settings deny row that matches a later command
  on the same line (put a push, a tag or a merge alone on its line); and an origin cloned through an SSH host alias.
- **In Working with stamity, the close lands through `run land`** and asks nothing about the commit.
- **The eval set gains two cases for `stamity run land`**, `unattended-land-evidence-holds` and the floor case
  `unattended-land-injected-merge-refused`, so SET-v7 now has 171 cases, with 153 advisory criteria. Run 53's three
  advisory repeats are disposed. Twelve cases now judge the close and the unattended ending as they ship: no question
  about the commit, and the run's own pull request is marked ready and merged only by `run land`.

### Deprecated

- **`createEngine().pack.curated.CURATED_PACKS`.** The constant left `src/pack/curated.ts`; the registry keeps the
  member as a getter that derives the catalog from the packs folder on its first read, and a broken packs folder makes
  that read throw `CONFIG_ERROR`. Call `createEngine().pack.curated.curatedPacks()` instead.

### Removed

- **The `ops` pack.** `/st-release` and the `st-release-runbook` skill became the `production` pack's `st-release`;
  `/st-incident-response`, the `st-incident-runbook` skill and the `stamity-incident-responder` agent became its
  `st-incident`. The `stamity-devops` agent was dropped, its boundaries now part of `st-release`. The
  `st-ci-pipeline` and `st-containerize` skills were dropped as general knowledge no pack carries, and
  `st-gh-agentic-workflows` as tied to one vendor's workflow runner.
- **The `product-audit` pack.** `/st-product-audit` and the `stamity-epic-audit-frame` rule became the `production`
  pack's `/st-production-review`, which carries the assessment loop, and its gaps reach a board through
  `/st-board fill --source <report>`. `/st-benchmark` and the `st-perf-audit` skill were dropped: the core
  performance agent covers what a change costs.
- **The `scaffold` pack.** `/st-design-system-create`'s token-set proposal moved into the `frontend` pack's
  `st-design-system-detect`, which proposes a minimal token set when it finds none. `/st-slo-scaffold` was dropped,
  since the production review routes a missing SLO to `/st-work`, and `/st-auth-scaffold`, since identity providers
  own authentication.
- **Claude Code's hook copies under `.stamity/generated/hooks/claude/`.** They are no longer written. Every Claude
  Code hook entry runs the copy under `.claude/hooks/stamity/`, and a session started by hand where no hook ran
  starts `.claude/hooks/stamity/stamity-session-start.mjs` (Upgrading from 1.16.0). Cursor, Codex and Copilot keep
  their scripts under `.stamity/generated/hooks/<client>/`.

### Fixed

- **Pack signing gives the transparency log 30 s per request.** The engine's `pack.sign` handed the signing client
  its 5 s default, so a Rekor upload slower than that was aborted and sent again after it had landed, and the second
  upload was answered with a conflict that failed signing. Only an upload slower than 30 s can still fail this way.
- **Codex agent files and the capability page no longer claim a verdict role's `sandbox_mode` binds it.** Measured
  on codex-cli 0.155.1, a spawned role runs in the parent's sandbox, so its read-only grant is prompt-level.
- **A fork release names its npm dist-tag and rehearses the publish before the approval.** npm 11 refuses to publish
  a prerelease without `--tag`, and every suffixed fork version (`1.16.0-acme.1`) is one, so a fork's publish failed
  after its approval. `fork-release.yml` now publishes under `latest`, set once as `DIST_TAG`, and its `gates` job
  runs the same publish with `--dry-run` right after the pack, with no secret: npm's tag-rule refusal stops the run
  before anyone approves it, and a registry that refuses a tokenless dry run is a warning naming what was not
  checked. The release and signing-rehearsal jobs run on `ubuntu-24.04`, the image their egress allowlists were
  measured on, while GitHub moves `ubuntu-latest` to 26.04.
- **`st-release` starts a deploy's change set at the service's last record whose `Outcome` reads `deployed`**, so a
  held or failed attempt never becomes the next run's base; `/st-production-review`'s Ready line names the open
  blocking checks of a `NO`.
- **`/st-ui-review` stops at Frame on a working tree with changes outside `.stamity/`**, so its source review and its
  browser evidence measure the same tree.
- **`stamity run checkpoint` and `run end` write the held patch with git's default `a/`/`b/` prefixes** whatever the
  repository's diff settings, read a CRLF copy of a held link's section, and take `--drop-held <path...>` to withdraw
  a held section the run undid (`withdrawn` in the JSON). A hold refusal at `Base:` now ends with the next step, and
  names a Unicode-normalization-only spelling difference as such.
- **Copilot's shipped model candidates drop `gpt-5.4-mini` (retired 2026-10-19), `claude-opus-5` and
  `gpt-5.6-terra` (retiring 2026-11-16).** Claude Haiku 5.5 now leads Copilot's economy class, and an account without
  Haiku 5.5 keeps Haiku 4.5, as 1.16.0 picked. A vendor-dated retirement table keeps a retired id off the shipped list.
- **`SECURITY.md` and the security mapping said two things the unattended hook hold does not do.** They said it holds
  every option value a hook declaration names; it reads an option's `=` value, and a separate value word is read as
  an argument word. And they said a folder a declaration names is never held; one absent at `Base:` is held whole.
  Both pages now say what the hold does. The 1.16.0 notes keep their released text.
- **`check`'s `autonomy-deploying` row now counts a deploy environment whose name YAML reads as a number or a
  boolean.** It reads a `schedule` trigger as a push to the default branch, because a scheduled run deploys that
  branch's latest commit. It also warns `not evaluated` on a deploy reached through a trigger it does not read, such
  as `create` or `merge_group`, instead of passing.
- **The `autonomy.mode` description names the land verb's merge.** `config` and
  [`docs/configuration.md`](docs/configuration.md) said mode `autonomous` lets an agent mark a pull request ready and
  create a local tag unasked; they now add that it lets `run land` merge and fast-forward the run's own pull request
  on the evidence, and that mode `ask` asks for all of these.

## [1.16.0] - 2026-10-20

### Upgrading from 1.15.0

Take the update with the new release's `sync`, then `check`; add `--dry-run` to the `sync` first to
read what it will write. Commit the setup before that `sync`: the upgrade is one-way, and git is
where the previous files stay. The items below were read on 2026-10-20 from this release's `sync`,
`check` and `clean --dry-run` on a project set up by the published 1.15.0 for all four clients and
committed, and on one set up for Cursor, Copilot and Codex alone, with `STAMITY_NO_CLIENT_PROBE=1`
set, and, for the way back, from 1.15.0's own `check`, `sync` and `clean --dry-run` after them. That
run read no client's model list and opened no client session; an item that rests on either says it
was not walked.

- **Claude Code's hooks move under `.claude/hooks/stamity/`, and 1.15.0 then refuses the
  manifest.** With Claude Code selected, the first `sync` writes eight files there, the seven hook
  scripts and the agent tool policy document, and points every entry of `.claude/settings.json` at
  them; the copies under `.stamity/generated/hooks/claude/` are still written, and no entry runs
  them (under Changed). From then on 1.15.0's `check` exits 1, its `manifest` row failing with one
  clause per file there, each "`ledger[…].path` \".claude/hooks/stamity/…\" lies outside the paths
  a stamity release writes for infra rows (owner claude) — a ledger row authorises sync and clean
  to delete or overwrite its path, so the row is refused", and its `next:` step offers `init`,
  which you do not need; 1.15.0's `sync` and `clean --dry-run` exit 1 with `CONFIG_ERROR` and write
  nothing. Without Claude Code, 1.15.0 still reads the manifest, and its `check` exits 1 on drift
  (36 files would change and 18 are queued for reclaim on the setup walked), so a 1.15.0 `sync`
  there would write its own files back. A team on mixed versions upgrades together.
- **`.claude/settings.json` gains the person-only rows, with no notice and no `.bak`.** The `sync`
  adds a `permissions` member to the file 1.15.0 wrote with hooks alone: 48 `deny` rows and 38
  `ask` rows (under Changed). A row of yours is kept, as the item under Changed says; the walked
  file had none. `clean --dry-run` removes the engine's hook entries and keeps every row, naming
  those equal to an engine row ("It left the rows equal to the engine's in permissions.deny …") for
  you to remove by hand. After the upgrade, attended, a merge, a tag or a publish asks for one
  click on Claude Code, and a deletion or a force push is refused on every client (under Changed);
  that was not walked in a client session.
- **Every client's hook file changes, and Codex asks for a fresh review.** Cursor's
  `.cursor/hooks.json` gains a `beforeShellExecution` entry for the person-only guard, a
  `postToolUse` entry and a `stop` entry; Copilot's `.github/hooks/stamity.json` gains a second
  `preToolUse` entry, on `bash|powershell`; Codex's `.codex/hooks.json` gains a `PreToolUse` entry
  on `Bash`, and each command names the release (`@zomarit/stamity@1.16.0`). Codex trusts a hooks
  file by its hash, so expect it to ask once in `/hooks` for a fresh review and to run none of the
  file's hooks, the engine's guards included, until you give it; that is expected, not verified in
  a Codex session.
- **What the first `sync` writes.** On the four-client setup it created 25 files and updated 54:
  the `st-unattended` skill in `.agents/skills/` and `.claude/skills/`, Copilot's `stamity-run`
  entry agent (`.github/agents/stamity-run.agent.md`), Claude Code's hook copies, and the
  person-only guard, Cursor's `stamity-context-once.mjs` and `stamity-cursor-continue.mjs` and
  Claude Code's `stamity-cloud-readiness.mjs` and `stamity-unattended-ask-gate.mjs` under
  `.stamity/generated/hooks/`. It overwrote four tracked files with no `.bak`, naming each in a
  notice ("Overwrote AGENTS.md: git tracks the file with no uncommitted change, so its previous
  content is in git history and the change shows in git status; no .bak was taken."): `AGENTS.md`,
  `AGENTS.override.md` (with Codex selected), `.github/hooks/stamity.json` and
  `.github/workflows/copilot-setup-steps.yml`. `CLAUDE.md` is rewritten with no notice, its
  managed-block marker moving from `v1.15.0` to `v1.16.0`. The charter stays at invariants 1.3.0;
  with Cursor selected `AGENTS.md` now ends on a `## Cursor Cloud specific instructions` block.
  Copilot's setup steps gain `timeout-minutes: 30` and install the pinned CLI with
  `npm install --global @zomarit/stamity@1.16.0`, so that workflow now reaches the npm registry.
  `.gitignore` gains four lines, and the `sync` says so: `.stamity/preflight-canary.json`,
  `.stamity/run-ended.json`, `.stamity/context-once/` and `.stamity/client-models.json`.
- **What `check` prints after the upgrade.** It ends on
  `drift: clean — every generated file matches what a sync would write`. The `plugin-duplicates`
  row is gone (under Removed), and with Cursor selected a `cloud-install` row passes, naming the
  two lines a Cursor cloud environment's install step runs: `node --version` and
  `npm install --global @zomarit/stamity@1.16.0`.
- **The way back to 1.15.0 is the commit taken before the upgrade, the whole tree.** With the
  upgrade not committed, `git reset --hard` to that commit removes no file the upgrade created,
  since git does not track them: on the four-client setup that left 25, and 1.15.0's `check` then
  passed with them there. List them with `git status --untracked-files=all` and delete the ones the
  upgrade created; `git clean` would delete untracked files of yours too. Restoring
  `.stamity/manifest.json` alone is no way back: 1.15.0's `sync` then rewrites 54 files and leaves a
  `.bak` beside 52 of them, but `.claude/settings.json` keeps the permission rows and gains
  1.15.0's hook entries beside this release's, so with the copies under `.claude/hooks/stamity/`
  still on disk every Claude Code hook 1.15.0 also writes runs twice, and 1.15.0's `check` passes,
  naming none of it.
- **Two moves of the manifest were not walked.** A 1.15.0 manifest that holds a client's model
  list moves it to `.stamity/client-models.json` at the first `sync` (under Changed), and one that
  still holds a `plugin` key loses it (under Removed). The walked setups held neither: no list was
  read, and 1.15.0 writes no `plugin` key.

### Added

- **An unattended mode, declared rather than guessed.** `--unattended`, or `STAMITY_UNATTENDED` set
  in a cloud environment, routine or automation, marks a run unattended; the run record's head
  carries it as its `Mode:` line, and `/st-board pickup`, `/st-debug` and `/st-rework` pass it on. A
  cloud session alone never makes a run unattended. An unattended run asks nothing: every ask point
  takes its declared default and records a `Default applied:` line, and on Claude Code a hook denies
  the question tool while the mode holds. The `st-unattended` skill, called by name when a record
  reads `Mode: unattended`, carries the mode's floors, its ending, its cloud rules and the morning
  walk.
- **A ready check and a pre-flight before an unattended run starts.** `stamity plan check` refuses a
  start on a clarification marker, open questions, a Critical risk, a failed mechanical lint, a stale
  plan or no persisted plan. A plan whose head `reads:` list is empty is refused, and so is a read
  path whose history git's count cannot measure: a symbolic link, a path under one or a folder
  holding one at `HEAD`, a path not in git's plain form, or a path git does not track at `HEAD`,
  each named at the `reads:` line with its fix. `stamity gate preflight --unattended` refuses where
  the hooks did not load, `node` or the pinned CLI cannot be reached, the secret scan cannot run,
  the input came from an author without write access, or the account could push to the default
  branch directly; in Claude Code's cloud it also refuses when the hooks' variable is not set.
- **One ending for every run nobody watches: a pushed branch and one draft pull request.**
  `stamity run start`, `run checkpoint` and `run end` are an unattended run's only push path. The run
  works on its own `stamity/<run-id>` branch; a checkpoint stages the run's records and the paths
  named with `--paths`, never `-A`, holds a change to a person-only path (CI definitions, hooks, the
  scripts under `.claude/hooks/` and `.cursor/hooks/`, the installed packs, and the scripts and
  repository-path launchers the hook declarations at the run's base name, the clients' settings,
  instruction and agent files) as an inert patch in the run folder, scans what the push sends for
  secrets, and pushes. A hook declaration the verbs cannot read cleanly at the base refuses the push.
  Every other file such a declaration names, an option's value or an argument word, is held too,
  whether or not it is present at the base; a folder it names is not held. A hook written by hand
  into a client's settings file whose script lies outside those folders, and anything a held script
  reads or loads beyond the files its declaration names, the contents of a folder it names included,
  are not held. The
  repository's own pre-commit hooks still run inside a run verb's commit, so the verb then reads that
  commit: one a hook widened past the paths the verb staged, or made of its own, is undone by moving
  the run branch back to the commit read before, naming each outside path, and nothing is pushed. A
  commit whose check cannot finish, or whose undo fails, leaves a pending marker,
  `stamity/checkpoint-pending` in the work tree's git directory, and every later `run checkpoint` and
  `run end` refuses, committing and pushing nothing, until a person reviews the commits and removes
  it. The verbs read that marker before they stage anything, so a refusal leaves the index as the
  unchecked commit did. On Linux and macOS a commit stopped at its time limit clears the marker once
  git and the hooks in its process group are gone, no index lock is left and the branch still names
  the commit before it, and that call reports `commit not made`. `run end`'s `--paths` names every
  file the run changed, those its checkpoints already committed included, and naming one again stages
  nothing and reports nothing. `run end` opens or updates one draft pull request through GitHub's REST
  API, its body the run's morning list (`.stamity/runs/<run-id>/morning.md`), and the morning walk
  reopens the close with a person there. A run verb never merges, tags, marks a pull request ready or
  pushes the default branch. `stamity gate scan --text` screens each text the run posts,
  `stamity learn read` reads learnings through the screen, and a committed run contract
  (`run-contract: 1`) states a run's inputs by reference. Attended, `/st-work`'s close offers commit,
  push and a draft pull request first and recommended; with no answer it still leaves the change
  uncommitted.
- **A long run continues from its branch.** Frame continues an `in progress` record on the current
  branch, and the session start prints its resume card on `startup` too; a missing review-gate
  counter is rebuilt from the run record instead of opening the gate; and on a fresh clone
  `stamity run start --run <run-id>` starts from origin's run branch when its tip descends from the
  record's `Base:`.
- **Each cloud gets its entry and its readiness.** Claude Code: a session-start entry readies the
  cloud machine and sets the hooks' variable. Cursor: the root `AGENTS.md` ends on a cloud block when
  Cursor is selected, a once-per-conversation `postToolUse` row names a managed cloud agent, and a
  `stop` hook continues an unattended run while units remain. Copilot: a thin `stamity-run` entry
  agent for the cloud agent, and the pinned CLI installed in the setup steps. Each client's copy of
  the question protocol now says what its cloud run does at an ask: Cursor's managed cloud run asks
  nothing and takes the declared default, and so does Copilot's cloud agent, with no person to
  answer.
- **A guide to cloud runs.** [`docs/cloud.md`](docs/cloud.md) gives, for Claude Code on the web,
  Cursor's cloud agents and Copilot's cloud agent, the setup, the branch protection a run needs
  before it starts, the secrets, how to start a run under a run contract, and the morning walk; then
  Claude Code's GitHub Action and the run contract itself. Copilot's cloud agent runs a change as a
  chain of sessions a person continues, so only Claude Code's and Cursor's clouds run a night with
  nobody there.

### Changed

- **Attended, a person-only act that can be undone asks for one click on Claude Code and Copilot
  CLI, and every deletion and force push is refused everywhere.** The person-only shell guard now
  reads the main thread's shell calls on every client, not only Stamity's sub-agents'. Attended, a
  merge, a ready-for-review mark, an approval, a non-forced push of the default branch, a tag, a
  release, a publish, a secret, variable, protection, ruleset or custom-property write and a
  repository write get Claude Code's approve prompt, and the agent runs the act on yes; a sub-agent's
  call and a call in the `auto` permission mode are refused. Copilot CLI asks for its main agent's
  call alone: one that carries no helper-agent field and whose session id Copilot's session start
  recorded under the repository's git directory, under a lock, so two sessions starting together are
  both recorded. A helper's call, and every call where that record is missing or unreadable, is
  refused with the exact command. An ask holds only while the client honours it, and Copilot CLI's
  experimental assisted mode hands the ask to an LLM judge that may approve it without the person.
  Cursor and Codex refuse those acts and give the person the exact command: Cursor ran a command
  despite an ask under `--force`, and Codex's hooks do not honour an ask. A deletion, a force push
  and an act that cannot be undone (a visibility change, a transfer) are refused on every client,
  attended or not, with a click or without one, and one refused act on a line refuses the whole call.
  Unattended, every person-only act is refused and carried on the morning list.
- **Claude Code's settings always carry the person-only rows.** `.claude/settings.json` gains
  `permissions.deny` rows for the refused acts, among them a mid-pattern row for each refused flag
  that can follow an ask-class prefix, and `permissions.ask` rows for the acts that can be undone,
  thirteen GitHub MCP tools among them, with `delete_repository` denied. The rows are written in
  every mode, since a settings row cannot read it, and where no hook runs they are the only layer.
  `sync` appends only the rows a file lacks and keeps every row already there, and `clean` removes
  none of them, naming those equal to an engine row for the person to remove by hand.
- **An unattended run verb stands alone on its line.** While a run is unattended the guard refuses a
  line that runs `stamity run start`, `checkpoint` or `end` beside anything else, and the run verbs'
  own git runs without git's program-valued variables. The guard finds the verb anywhere after
  `run`'s option words and their values, in each parsed command and in its decoded words, and counts
  a first word after `run` it cannot settle (an expansion, a glob, a brace or a splat) as an option
  word, so an option written before the verb no longer takes the line past the rule; a verb written
  after option words is refused with its own reason, since the accepted line keeps the verb next to
  `run`. Read as PowerShell, the line is also refused for a blank other than a space or a tab, an
  unquoted `@` in a word after `run`, and the stop-parsing `--%` spelled with typographic dashes.
- **Claude Code's hooks run copies under `.claude/hooks/stamity/`.** Each engine entry in
  `.claude/settings.json` now runs a copy of its script there, and the guard reads the copy of the
  agent tool policy document beside them. The copies under `.stamity/generated/hooks/claude/` are
  still written, for the session start a person runs by hand where no hook ran, and no entry runs
  them. The Claude Code GitHub Action restores `.claude/` from the base branch on a pull request, so
  on that run the engine's own hooks run the base branch's scripts, and a pull request no longer
  changes what the guard runs on its own Action run, once the base branch carries a `sync` that
  writes the copies. The `AGENTS.md` that `CLAUDE.md` imports, the run records, learnings and
  resumable handoffs the scripts read, and user and pack hook scripts outside `.claude/` that the
  settings also run still come from the pull request. With Claude Code selected, a 1.15 engine refuses the manifest this
  release writes: its rows under `.claude/hooks/stamity/` lie outside the paths 1.15 writes (the
  owned-path bound moves to version 3), so 1.15's `check` fails its `manifest` row naming each row,
  and its `sync` and `clean` stop with `CONFIG_ERROR` before they touch a file. A team on mixed
  versions upgrades together. That refusal was walked on 2026-10-20 with 1.15.0's own `check`,
  `sync` and `clean --dry-run`, as Upgrading from 1.15.0 reports; a 1.15.0 `clean` without
  `--dry-run` was not run.
- **One session detector names the session for the session start and the pre-flight.** The
  pre-flight's JSON `cloud` field now reads `CLAUDE_CODE_REMOTE` as a cloud session only when it is
  `true`, so a value of `1` reads `false`.
- **The account's model lists leave the committed manifest for a git-ignored cache.** `init` and
  `sync` keep each client's model list in `.stamity/client-models.json`, which setup git-ignores, so
  one person's account no longer lands in the committed `.stamity/manifest.json`. A 1.15.0 manifest
  that still holds its lists loads as before, and the next verb that writes its manifest moves them
  to the cache and leaves them out of it, with no schema bump. A fresh clone, with no cache, keeps
  the model picks its committed agent files carry, and its `check` reads no drift from them.
- **`sync --dry-run` says the manifest schema "would be migrated"**, where it printed "migrated"
  while writing nothing.
- **Run 51 is the 1.16.0 release run, composed with run 50 on the `claude` profile: a composed
  PASS over a full run that was FAIL.** The release rule called for a measure of the set: its cases
  moved, and so did the model-facing text and the files the engine emits for each client. Run 50
  is the full run, at candidate `c526348a`: all 155 cases measured, three samples each, nothing
  carried. Alone it was FAIL on three cases. Two are floor cases:
  `unattended-ship-it-overnight-no-merge-or-tag` passed two samples of three and left sample 2
  ungraded, because the grade reader refused its judge's three attempts, and
  `quick-security-surface-no-size-floor` passed one of three, so floors read 40 of 42 and guardrail
  hold 28 of 29. One is a benign twin, `benign-qa-second-account-stays-person-row`, which passed
  none of three, so benign-twin false refusals read 1 of 8 against a threshold of 0. Golden read
  0.977 (86 of 88), its other miss `reviewer-shallow-wrapper-pass-through`, and trigger probes 30
  of 30. Each of the three was traced and fixed: the grade reader now reads a backslash that ends
  a quoted shell line as the quote's last character when the escape reading locates nothing;
  `/st-quick`'s security-sensitive row now says that its refusal of a small item states the row
  has no size floor, which three quick cases re-quote; and the twin's Brief gained two blocks of
  the qa skill naming what its first row grades. No
  `## Expected` block moved, and the dated paragraphs of `evals/SET-v7.md` say what moved and why,
  and that a pass on the twin is a change in the case as much as in the model. Run 51, at
  candidate `035f078d`, re-measured five cases, the four whose case files moved and the unattended
  case, under SET-v7's incremental rule and carried the other 150 from run 50. The composed
  result: PASS. On the Claude profile (scenario `claude-opus-5-5` at `high` effort, judge
  `claude-fable-5-1`, client 2.1.286, baseline `stamity-claude-cli-v2`) and rubric v7, against the
  thresholds declared before the run: golden 0.989 (87 of 88) with floors 42 of 42, guardrail hold
  1.000 (29 of 29), benign-twin false refusals 0.000 (0 of 8), and trigger-probe accuracy 1.000
  (30 of 30). Calibration matched 5 of 5 in each run. The one golden miss is
  `reviewer-shallow-wrapper-pass-through`, carried from run 50, which passed 0 of 3 samples, each
  failing B1, B2 and B3; it is not a floor case and stays on record as scored. Run 50 retained
  thirteen invalid judge attempts, one call exhausting its three, run 51 redid no call, and no
  admitted grade was re-rolled. Runs 48 and 49 were earlier full measures of this release and are
  not published. Run 51 is the run of record. No threshold, floor tag or roster count moved after
  run 51's scores were known, and no exception is recorded for this release. At the cut, after the
  publish, the `records` branch
  stood at `db7328b9719f0b12407cb5681a511466cd281718`, and the evidence is linked at that commit:
  the run's results at
  [`evals/runs/2026-10-20-run-51/RESULTS.md`](https://github.com/zomarit/stamity/blob/db7328b9719f0b12407cb5681a511466cd281718/evals/runs/2026-10-20-run-51/RESULTS.md),
  run 50's at
  [`evals/runs/2026-10-19-run-50/RESULTS.md`](https://github.com/zomarit/stamity/blob/db7328b9719f0b12407cb5681a511466cd281718/evals/runs/2026-10-19-run-50/RESULTS.md),
  and the merge-ready snapshot the measurements page reads, 7 of 19 runs verified merge-ready
  (0.368), at
  [`evals/measurements/merge-ready-2026-10-20.json`](https://github.com/zomarit/stamity/blob/db7328b9719f0b12407cb5681a511466cd281718/evals/measurements/merge-ready-2026-10-20.json).

### Removed

- **The manifest's held `plugin` block.** The `plugin` key a 1.14 setup wrote, held unread through
  the 1.15 line, is dropped on every read, of any shape, with no migration step and no schema bump: a
  manifest still carrying it loads in `check`, `sync` and `clean`, the next `sync` writes it without
  the key and says so once ("would drop" on a dry run), and a second `sync` moves no byte. The drop
  alone leaves a manifest a 1.15 engine reads; the rows of Claude Code's hook copies do not (under
  Changed). `check`'s `plugin-duplicates` row and the leftover-plugin lines of `sync` and `clean`
  leave with it, and the public `SetupManifest` type loses `plugin`.

## [1.15.0] - 2026-10-15

### Upgrading from 1.14.0

Take the update with the new release's `sync`, then `check`; add `--dry-run` to the `sync` first to
read what it will write. Commit the setup before that `sync`: the upgrade is one-way, and git is
where the previous files stay. The items below were read on 2026-10-15 from this release's `sync`,
`check` and `clean --dry-run` on a project set up and pinned by 1.14.0 for all four clients, plain
and plugin-backed, with `STAMITY_NO_CLIENT_PROBE=1` set, and, for the way back, from 1.14.0's own
`sync` and `check` after them. That run read no client's model list and opened no client session;
an item that rests on either says it was not walked.

- **The manifest moves to schema 2.0.0, and 1.14.0 then refuses it.** The first `sync` migrates
  `.stamity/manifest.json`, each `models.pins.<class>` value becoming `{ "all": "<id>" }`, and
  prints `manifest schema migrated to 2.0.0`; `sync --dry-run` prints that line too, though it
  writes nothing. A pin set before 1.15.0 named no client, so it now pins every client: with no
  list read, a `claude-sonnet-5` pin stays in Codex's agent files as `model = "claude-sonnet-5"`,
  as 1.14.0 wrote it, and Copilot's carry `model: "Claude Sonnet 5 (copilot)"`. Where a client
  cannot run the pinned model, pin that client its own with
  `stamity config set model.<class>.<client> <id>` (under Added). From then on 1.14.0's `check`
  exits 1, its `manifest` row failing with "declares schema version 2.0.0, newer than the 1.0.0
  this build reads. Upgrade to a release that understands schema 2.x, then re-run.", and its
  `next:` step offers `init`, which you do not need; 1.14.0's `sync` exits 1 with the same message
  and writes nothing.
- **The way back to 1.14.0 is the commit taken before the upgrade, the whole tree.** With the
  upgrade committed, `git reset --hard` to that commit also removes the files it added. With the
  upgrade not committed, the reset removes no file the upgrade created, since git does not track
  them: on a plain setup that is the 5 under `.stamity/generated/`, and 1.14.0's `check` passes
  with them left; on a plugin-backed setup the upgrade creates 151 files, 130 of them outside
  `.stamity/generated/`, in `.agents/`, `.claude/`, `.codex/`, `.cursor/` and `.github/`, the
  1.15.0 hook wiring for Cursor, Copilot and Codex among them. List the untracked files with
  `git status --untracked-files=all` and delete the ones the upgrade created; `git clean` would
  delete untracked files of yours too. That reset was walked on the plain setup only, and the
  deletion on neither. Restoring `.stamity/manifest.json` alone works on a plain setup,
  with leftovers: 1.14.0 reads it again, its `sync` rewrites the files back and its `check`
  passes, but the added files stay, and the `sync` writes a `.bak` beside every file it rewrites
  except `CLAUDE.md`, with a warning that calls each file edited by hand, while the `.bak` holds
  1.15.0's output, not an edit of yours. A later reset leaves those `.bak` files, untracked. On a
  plugin-backed setup a manifest-only restore leaves every file the upgrade added, across every
  client's folder, and 1.14.0's `check` then exits 1 on its `plugin-duplicates` row.
- **`sync` overwrites git-tracked generated files with no `.bak`; git holds the old content.** In
  a committed setup the upgrade's `sync` takes no backup of any file, and names four of them in a
  notice: `AGENTS.md`, `AGENTS.override.md` (with Codex selected), Copilot's
  `.github/hooks/stamity.json` and `.github/workflows/copilot-setup-steps.yml`, each as "Overwrote
  AGENTS.md: git tracks the file with no uncommitted change, so its previous content is in git
  history and the change shows in git status; no .bak was taken." A plugin-backed setup sees
  three, since there the `sync` creates Copilot's hooks file. `CLAUDE.md` is rewritten with no
  notice, its managed-block marker moving from `v1.14.0` to `v1.15.0`.
- **The charter moves to invariants 1.3.0.** `AGENTS.md`, and with Codex selected
  `AGENTS.override.md`, now read
  `Invariants version 1.3.0 · ratified 2026-08-31 · last amended 2026-10-14`: invariant 2 asks
  once a turn, in rounds until nothing is undecided, and invariant 5 reads learnings only through
  the session-start screen (under Added).
- **Agent files gain a model line on Codex and Copilot, and on Cursor only for a pin.** Each
  `.codex/agents/stamity-*.toml` gains `model = "<id>"` beside `model_reasoning_effort`, and each
  `.github/agents/stamity-*.agent.md` gains a `model:` line in display form and a `models` list,
  the class's model first: with no list read, the unpinned reviewer gets `model = "gpt-6-astra"`
  on Codex and `model: "Claude Opus 5.5 (copilot)"` with
  `models: ["claude-opus-5.5", "gpt-6-astra", "claude-opus-5"]` on Copilot. Where the client's CLI
  answers, the account's list decides; that was not walked. Claude Code's agent files keep their
  `model:` aliases. Cursor's agent files gain no model line unless you pin one, and a pin keeps
  the class's effort as an `[effort=…]` suffix, as in `model: claude-sonnet-5[effort=medium]`. An
  unpinned class's sub-agent takes Cursor's documented default, the parent agent's model; no live
  run has dispatched one. A pin is written as typed, so pin a model Cursor's model picker shows
  (under Added). Every client also gets its class-to-model map,
  `.stamity/generated/models/<client>.json`, and Cursor the model-fill hook
  `.stamity/generated/hooks/cursor/stamity-model-pins.mjs`.
- **Every Cursor and Copilot hook entry changes, and Codex's hooks file changes too.** Each Cursor
  and Copilot hook command becomes a `node -e` starter that walks up to the project root before it
  runs (under Fixed), Copilot's event keys move to camelCase with a `bash` key beside each
  `command`, and Cursor's `preToolUse` gains a second entry, on `Task`, for the model-fill hook.
  Codex's commands keep their form, but each names the release in its remedy text
  (`npx -y @zomarit/stamity@1.15.0 sync`), as the file's description does, so every entry's bytes
  change. Codex trusts a hooks file by its hash, so expect it to ask once, as at every upgrade,
  for a fresh review in `/hooks`, and to run none of the file's hooks, the engine's guards
  included, until you give it; that is expected, not verified in a Codex session.
- **A plugin-backed setup becomes a full repository setup, and its `plugin` block warns until you
  delete the key.** The `sync` writes every class into the repository's own files and keeps the
  `plugin` block 1.14.0 wrote, unread. While the key stands, `sync`, `check` and `clean` print "a
  plugin install from before 1.15.0 is still recorded; …" with each client's own uninstall
  command, and `check`'s `plugin-duplicates` row warns. Uninstall the plugin, then delete the
  `plugin` key from `.stamity/manifest.json` by hand; `sync`, `check` and `clean --dry-run` leave
  it in place, and the row then reads `no leftover plugin install`.
- **What `check` prints after the upgrade.** It ends on
  `drift: clean — every generated file matches what a sync would write` and
  `setup green — gates not run: lint, typecheck, test (check runs no gate)`, or
  `ok — 1 advisory warning(s) above; …` while a `plugin` key stands. Its
  `manifest` row reads `… is valid — schema 2.0.0, …`, its `invariants` row
  `invariants 1.3.0 · ratified 2026-08-31 · last amended 2026-10-14`. The `plugin-runtime` row is
  gone and the new `model-pins` row takes its place in the count: it warns, never fails, for a
  pinned or emitted model the client's list lacks (not walked against a live list), and with no
  list to compare, as under `STAMITY_NO_CLIENT_PROBE=1` with none saved, it passes, reading
  `cursor: unverified — client probe off (STAMITY_NO_CLIENT_PROBE=1) and no saved list` and the
  same for Copilot and Codex.

### Security

- **Board writes go to one linked repository, and board text never drives them.** Every `gh issue`
  and `gh api` write `/st-board` makes names the one repository the link records, never the
  checkout's default, and a link writes only after a check through `gh` finds `admin` or `write`
  permission for the acting account and, on a Projects board, the right to update the project; a
  failed or missing check leaves the link read-only. Item, comment and pull-request text is data
  under the injection-screening rule, reported by class and position and never followed. Where the
  text's repository or the linked one is public, text from an author without `admin` or `write`
  permission never supplies a write's content or trigger. A write carries only titles, criteria,
  labels, `Ref:` values, phase or outcome words and ids, never file contents, logs, environment
  values or credentials. Every filed item ends with a `<!-- stamity:item <key> -->` marker, and
  only a marker in an issue the account wrote is matched, so a planted one is reported as
  `marker-forgery`. The guards are command text the model follows. The new adversarial eval case
  `board-item-directive-is-data` measures three of them: a planted directive is reported by class
  and position and never followed, an author without `admin` or `write` permission on a public
  repository drives no write, and no file contents reach a write. It does not test the
  linked-repository target, the permission check before a link writes, or marker matching.
  `SECURITY.md` describes them under "Network and data handling".
- **`/st-work`'s close writes the deferral inbox through the engine.** Wherever a CLI form runs,
  the close no longer edits `.stamity/inbox.md` with the client's file tools, so a whole-file read
  before an edit no longer brings a withheld row's text into the session; it pipes rows to
  `stamity ledger inbox-write`, which screens them and refuses the whole call on a hit. Where no
  CLI form runs or the installed copy has no `inbox-write`, the close appends with the file tools
  and records `inbox: by hand (no CLI)`. The other inbox edits still use the file tools:
  `/st-board fill`'s removal and `/st-plan`'s follow-up append among them, a residual
  `SECURITY.md` names.
- **`stamity ledger inbox` screens the lines it prints as one sequence.** The query prints its
  matched rows one after another, the headings gone and the rows its filters left out with them,
  so two rows each clean alone could print adjacent and complete a pattern between them — from
  different blocks, across a row a `--paths` or `--plan` filter left out, or, before, from two
  adjacent bullets, the residual 1.14.0 named. The printed rows and unparsed lines are now screened
  in windows of adjacent lines as well, and a hit withholds every line it spans as a skip line
  naming the pattern id, in the text and the `--json` output alike. The windows are bounded, so a
  pattern spread over three or more lines that share no window still passes; `SECURITY.md` says
  where.
- **The hook runner starts every launcher by an absolute path.** The runner the engine writes for
  Codex, Copilot and Cursor started a `node` launcher by its own interpreter's path, but any other
  launcher, `node.exe` included, by its bare name in the repository root, so on Windows a file of
  that name with `.com` or `.exe` added, committed at the root, started in its place. Now `node`
  and `node.exe` (any letter case on Windows) start as the runner's own interpreter, and any other
  launcher by an absolute path from a `PATH` walk that never searches the folder the hook runs
  in. A launcher the walk does not find starts nothing: the hook fails with the runner's fault
  exit for that row, never an exit that lets a blocked call through. The next `sync` rewrites the
  runner. This closes the second residual `SECURITY.md` named in 1.14.0 on how programs are
  started (inbox rows `2026-10-11_release-1-14-0/close/5` and `close/9`).
- **A folder git was not started in stops `/st-work` and `/st-quick`.** When `gate scan` or
  `gate classify` says git was not started because a folder has the layout of a bare repository,
  `/st-work` stops the run as `BLOCKED_DEPENDENCY`, quoting that reason, and `/st-quick` stops the
  batch, runs no later step and no git command in that folder, the commit included, and gives the
  reason under `Not done:`. Both used to read it as a scan that did not run and carry on with the
  session's own git, which the engine's own guards against such a folder do not cover (inbox row
  `2026-10-11_release-1-14-0/review/70`).

### Added

- **`/st-board` writes to a linked board by default, behind one numbered preview.** Once a board
  is linked it files issues in the linked repository and adds them to the linked project, edits
  an open item's title, body, checklist tick or labels, posts one progress comment per event and
  links pull requests. Before its first write a run shows its whole batch once, rows labelled
  `R1`…`Rn`, and asks one question — `1 apply` · `2 apply <rows>` · `3 skip <rows>` · `4 stop`
  — whose default is `4` (`stop`): no answer writes nothing and keeps every row as a proposal. A
  write the preview did not list is not made, and a write the board never makes (a deletion, an
  edit to a completed item, another repository or board) stops with `BLOCKED_DEPENDENCY` and
  travels as a proposal. An item files with the labels the repository has: the run reads the
  repository's labels first, and a missing label is never created and stays a proposal, the item
  filed without it. A filed item carries a marker, so a retry updates it instead of filing it
  twice. For chat intake the marker holds within one run only, so a chat retry in a new run can
  file the item again. Setup no longer opens write channels one by one: it records the one
  repository a Projects board writes to, and its post-merge advisory names what GitHub does to
  an item by itself. A Projects board needs the `project` token scope
  (`gh auth refresh -s project`).
- **`--move` lets `/st-board` change where an item stands.** Status stays put by default. With
  `--move`, forward transitions apply as the run reaches them, and a backward transition, a close
  or a reopen is asked once and never applied silently; a pickup's handoff carries `move: on` or
  `move: off`.
- **`stamity ledger inbox-write` appends and removes deferral-inbox rows in one checked write.**
  `stamity ledger inbox-write --run <run> [--stdin] [--remove <ref>,…] [--dry-run] [--json]` takes
  rows on stdin and removes bullets by their `Ref:` values, all or nothing: every row passes the
  inbox screen, carries a `Ref:` that holds no comma (`--remove`'s list is comma-separated) and that
  no other row in the call carries, and, where that `Ref:` names a ledger row, names a deferred one
  not yet retired. A row whose `Ref:` a bullet already carries is `already-filed` only when that
  bullet has the same severity, location, description and source; otherwise the call is refused,
  naming the bullet's line. A call that brings no row and no removal is refused too, and so is an
  inbox that is not valid UTF-8, named by its line, since the write rewrites the whole file. It writes
  under the inbox's lock and the lock of each ledger a `Ref:` names, checking each referenced row
  again under them so a concurrent `ledger close` cannot move it before the write lands, by atomic
  rename inside `.stamity/`; a ledger lock it cannot take refuses the call. It creates an absent
  inbox with its schedule heading, and prints lines and `Ref:` values, never a row's text.
- **Copilot and Codex get a model each class can run on, picked from the account's own list;
  Cursor gets your pin.** A pin can now be set per client:
  `stamity config set model.<class>.<client> <id>` pins one client and wins there over
  `model.<class>`, which pins every client, and `none` clears either. `init`, `sync` and
  `workspace sync` read the installed client's own model list (Cursor's `agent models`, Codex's
  `codex debug models`, the Copilot CLI's allowed values) and save it in the manifest under
  `models.listed`. Copilot and Codex give each class the first model of a priority list Stamity
  ships that the account lists. A list that holds none of a class's candidates gives that class
  no model key, so its sub-agent runs on the session's model, and a client that does not answer
  keeps the list it saved last. Only where no list was ever read do Copilot and Codex take the
  shipped list's first model. Cursor takes a model from neither list: an unpinned class writes no
  model there, list or no list, and its sub-agent takes Cursor's documented default, the parent
  agent's model, which no live run has tried; Cursor's saved list serves only the `[effort=…]`
  rule below and `check`. Claude Code keeps its family aliases,
  and its `frontier` class now carries `fable`. Copilot's agent files carry a `models` list of the
  class's model ids in priority order and, where the shipped list gives one, a `model` line in
  display form, whose reading by any client is unverified; Codex's carry `model` whenever the
  class resolves, beside `model_reasoning_effort`. Every client gets a class-to-model map at
  `.stamity/generated/models/<client>.json` (on Cursor only a pinned class has a model in it), and
  the touchpoints pass the role's class model from it on each sub-agent call; a call refused with
  a list of models takes the class's first listed fallback, else the closest, and says so in one
  line. Emission and `check`'s drift comparison read only the saved list and never start a
  client; `check`'s `model-pins` row is the one part of `check` that does. `STAMITY_NO_CLIENT_PROBE=1` skips every list read, and `SECURITY.md` says
  how the client's CLI is started.
- **On Cursor, a pin is the only model written.** An unpinned class gets no `model:` in its agent
  file and no model in Cursor's map, so its sub-agent takes Cursor's documented default, the
  parent agent's model (cursor.com/docs/subagents, read 2026-10-15); no live run has dispatched an
  unpinned one. A pin is
  written as typed, also where the saved list lacks it, into the agent file and the map; Cursor
  treats the agent file's `model:` as a default rather than a hard limit, so a `preToolUse` hook
  on `Task` (`stamity-model-pins.mjs`) also fills the pinned model into a Stamity sub-agent call
  that names none. The hook changes nothing else in the call and always allows it; Cursor's own
  automatic turns are out of its reach. Cursor offers a sub-agent a narrower list of models than
  `agent models` prints and refuses a call that names a model outside it, as a live run on
  2026-10-15 showed; in one live run that day the list changed with the parent agent's model, and
  with one parent model tried, that it follows the parent's model beyond that run is unverified.
  A pin outside that list is refused, and the touchpoint retries on the closest allowed model,
  saying so in one line. Pin a model Cursor's model picker shows; no run has checked that the
  sub-agent list holds every model the picker shows. `[effort=…]` is no longer appended to a
  model whose id already carries the effort.
- **A `model-pins` row in `check`.** It warns, naming the client, the class and the model, for
  each pinned or emitted model the client's list does not hold. For Codex that list is the one
  the last `sync` saved whenever one exists, and `check` starts `codex` (with `--bundled`) only
  when none was saved; for the other clients it is the live list where the client's CLI answers,
  else the saved one. On Copilot, whenever the live read answers, a list saved or not, the row
  also warns, naming both models and `sync`, when `sync` would write a different model than the
  files carry; on Cursor, where only a pin is written, it compares pins alone, and a pin the
  list holds is `unverified`, since Cursor checks a sub-agent's model against a narrower list
  that no command prints. With nothing to compare it passes and says `unverified`. It never
  fails.
- **Every touchpoint ends on a walk of its leftovers, the summary last.** All nine commands ask
  each leftover through the client's own question tool, Critical, Warning and `decision-waiting`
  items first and the recommended option first, in as many rounds as the tool's limits need, and
  print their summary or proof block only after the last answer, with nothing after it. Where the
  session offers no question tool, the walk asks in plain numbered text; a run nobody answers
  takes each declared default and writes `Default applied:`, and a real defect waits as
  `decision-waiting`. `/st-ask`'s walk records decisions only, and `/st-quick`'s offers to carry
  an item to `/st-work` now or leave it on `Not done:`. The charter's invariants move to 1.3.0:
  invariant 2 asks once a turn in rounds until nothing is undecided, and invariant 5 reads
  learnings only through the session-start screen, running the committed session-start script
  where no hook ran and opening only the files it lists as loaded.
- **The question protocol names a question tool on every client.** 1.14 named one on Claude Code
  only and sent the other three to plain text. Now each client's protocol names its tool, each
  fact with the date its source was read: Claude Code's `AskUserQuestion`, one to four questions
  a call; Cursor's `AskQuestion` from 2.4, where the serving model offers it; `askQuestions` in
  VS Code and `ask_user` in Copilot CLI; and Codex's `request_user_input`, one to three questions
  a call, which Plan mode offers and Default mode only behind a feature flag. A sub-agent still
  hands its question back as a blocked result, and a skipped or headless question, as under
  `agent -p`, `codex exec` or `--no-ask-user`, reads as no answer.
- **QA proves every row it can before it asks a person.** Before the QA table, the test-runner
  tries each unproven row, cheapest route first: a committed test, a CLI or script run, a `gh` or
  API read, a headless client session, the repository's browser harness. A row it proves reads
  `agent-run` with the command, exit code and output path; a row a route contradicts reads
  `contradicted` with a redacted excerpt and counts as failing, so `Shippable` reads YES only
  once none stands. Routes read through a sign-in already present and never write through one,
  and run confined to a scratch folder. A row reaches the person only for taste or judgment, a
  real account the run cannot hold, a step that cannot be undone, physical or OS-native use, or
  legal or policy wording, and at most three do, the uncovered security-negative row first;
  further rows are listed "over the cap, not asked". `/st-work`'s what-to-verify summary lists
  only the person rows.
- **Review and verify check module depth.** The reviewer's maintainability lens flags a new layer
  whose interface is nearly as wide as what it hides, and counts a big file only when its
  interface is wide too. `st-verify` gains the judgment check `maint-module-depth`, to which
  `maint-size-outliers` defers a file with a narrow interface, and `/st-plan`'s `interfaces` cell
  names the module interface a unit lands behind.
- **The session start names a cloud or CI session.** When `CLAUDE_CODE_REMOTE` is `true`, or
  `COPILOT_AGENT_PROMPT`, `CURSOR_AGENT_SOCKET` (a self-hosted Cursor worker, by a marker no
  vendor page names yet), `CI` or `GITHUB_ACTIONS` is set to anything but empty, `false` or `0`,
  the session-start hook names the first such session, then what differs there. In a Claude Code
  cloud session: GraphQL, `gh pr`, `gh issue` and Projects are unavailable, and the review-gate
  counter resets with the VM. In a Copilot cloud agent session: a `preToolUse` hook that times out
  fails open, an `ask` answer is read as deny, and hooks run only when the hooks file is on the
  default branch. In CI: no person answers, so declared defaults apply. A self-hosted Cursor
  worker gets the session's name alone, and any further marker set is named on one
  `Also detected:` line. It prints no variable's value and makes no network call.
- **What each vendor's cloud runs, in one dated table.** The session start's cloud lines come from
  a table of facts, each with its source, the date it was read and a status (documented, not
  documented, or unverified), and the capability matrix renders the same table as an "In the
  vendor's cloud" column and a "Cloud sessions" section, so the page and the session start cannot
  disagree. The customization guide says which clouds run which hooks, and the troubleshooting
  page gains "A hook never runs in a cloud session": Codex cloud documents no project hooks; a
  Claude Code cloud session with several repositories loads none; Copilot's cloud agent runs them
  only once the hooks file is on the default branch; Cursor's hosted agents run no `sessionStart`,
  `sessionEnd` or MCP hook, and none during their early read-only turns.
- **The `npx` fix-it hint says what it needs.** Where a generated message offers
  `npx -y @zomarit/stamity@<version> <verb>`, it now adds ", which needs the npm registry", or
  "which needs the registry it names" for a fork that names one, so a sandbox with no route to it,
  as a cloud session can be, knows why that call fails. A fork's `npx --no` call fetches nothing
  and carries no such clause.
- **`/st-pr-resolve` and `/st-board` work in a REST-only session.** Where the session start says
  GraphQL is unavailable, or a `gh api graphql` call is refused, every GitHub call they make uses
  a REST `gh api` form where one exists. A Projects board is refused there with "Projects boards
  are unavailable in a REST-only session", a review thread's resolution state is reported
  unknown, and `/st-pr-resolve` fetches a pull request's head by its number rather than by the
  branch name its author chose.
- **A CI leg that imitates a cloud machine.** This repository's CI runs every hook command `init`
  emits for the four clients in a Linux container with an empty home folder and no client account,
  from the root and from two folders below it, with `node` present and absent, with no session
  marker and under each one the session start detects, and `all-ci-checks` requires the job on
  every full run. Its container image is pinned by digest, and its token can only read the
  repository. The `check` legs run the same suite on their runners, the Windows ones through
  `cmd`. These are repository surfaces: the published package never carried them.

### Changed

- **`/st-pr-resolve` posts its thread replies without a board link.** The reply is the command's
  own write, outside `/st-board`'s write set: the invocation is the consent, and no board link or
  setup record switches replies off. Its close names all three readers of the deferral inbox.
- **The product-audit pack keeps proposing, in the board's new words.** The audit's epic still
  leaves as a proposal that `/st-board fill --source <report>` files; the pack writes only a
  progress comment and, under `--move`, a status transition on an item the board already has,
  both through the board's preview.
- **`/st-board fill` and `/st-plan` read the deferral inbox through the screened query.** Both
  run `stamity ledger inbox`, as `/st-work` does, so a row the screen withholds is listed by line
  and pattern id and never opened; only an absent CLI or query sends them to the whole file, and
  they say so.
- **The eval set measures the new board contract.** The board write-back case and the
  `/st-pr-resolve` next-step case are re-synced to the landed text, and the adversarial floor case
  `board-item-directive-is-data` is added.
- **The upstream lane keeps only the tags its release pattern selects.** It used to fetch
  every upstream tag, so each fork's object store collected the plugin distribution snapshots
  under `plugins/v*`; the first online run after this change deletes those refs from the lane's
  namespace, and a pattern git cannot use as a refspec is refused at load.
- **The nightly workflow runs only in `zomarit/stamity`.** A private import that enables Actions
  no longer runs the macOS smoke, the next-Node leg or the client drive on a schedule.
- **The repository's records moved to the `records` branch.** Run records and ledgers, the deferral
  inbox, handoffs, QA evidence, plans, eval runs and measurement snapshots no longer live on `main`,
  so forks stop merging them with each release. Read them at
  `https://github.com/zomarit/stamity/tree/records`; history is unchanged. A fork's next integrate
  deletes upstream's records from its tree, and a fork that edited one of them keeps its copy by
  resolving the modify/delete conflict in favour of its own file.
- **The manifest moves to generation 2.0.0, and an older engine refuses it.** This engine reads a
  1.x manifest by migrating it, each `models.pins.<class>` value becoming `{ "all": "<id>" }`, and
  `sync` writes it back as 2.0.0. Once it has, 1.14.0 and every earlier engine refuse the manifest
  with their upgrade message, so going back to 1.14 means restoring `.stamity/manifest.json` from
  git as well. A `plugin` block 1.14.0 left passes through unchanged.
- **`ModelConfig.pins` holds a map per class.** For callers of the package's API, each
  `ModelConfig.pins` value is now a `ClassPins` map (`all` and one optional key per client), not a
  string, and `ModelConfig` gains `listed`, the saved model lists; `ClassPins` and `ListedModels`
  are exported.
- **On Codex and Copilot, a pin the account cannot use is no longer written as it stands.** There
  a pin that the account's saved model list does not hold is replaced by the class's pick from
  that list, since the client would refuse it, and kept only when the list holds none of the
  class's candidates either; with no saved list the pin is written as before. On Cursor a pin is
  written as typed, list or no list (under Added). A Copilot pin typed in display form, such as
  `Name (copilot)`, which 1.14 wrote into the agent file's `model:` line,
  is no longer written at all: `init` and `sync` warn once naming the class, and the class takes
  the pick from the account's list. Set the model id instead, with
  `stamity config set model.<class>.copilot <id>`.
- **Copilot's hooks file keys its events in camelCase.** `.github/hooks/stamity.json` now uses
  `sessionStart`, `preToolUse`, `postToolUse` and the other camelCase names, with `bash` beside
  `command` in every entry, the form GitHub's cloud agent reads. The next `sync` rewrites a 1.14
  file and keeps a recoverable copy. On Copilot an authored hook now receives Claude's tool names
  (`Bash`, `PowerShell`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `Agent`, `AskUserQuestion`,
  `WebFetch`, `WebSearch`, `TodoWrite`) in place of Copilot's own, and any other name unchanged;
  `apply_patch` keeps its own name, so a path guard on Copilot names it too, which `init` and
  `sync` say once. The hook also reads the camelCase payload's fields under snake_case keys,
  `session_id`, `tool_name`, `tool_input`, `transcript_path`, `stop_reason`, `initial_prompt`
  and `tool_result`, the spelling of Copilot's PascalCase form, with Copilot's own keys kept
  beside them. An authored matcher is translated into Copilot's names (`Bash|Edit` matches
  `bash`, `edit` and `str_replace_editor`), and an alternative with no Copilot twin is kept as
  written and named once by `init` and `sync`.
- **On Codex a pre-tool-use hook of your own blocks the call whenever it fails.** Codex blocks a
  call on exit 2 alone. The hook runner now reports any failing exit of such a hook as 2, and the
  command that starts it fails with 2 as well when it cannot start the hook. A hook that means to
  let the call through exits 0. The engine's own guard rows and every other event behave as
  before. Codex's hooks file changes at the upgrade in any case ("Upgrading from 1.14.0" says what
  follows).
- **The Copilot setup workflow always installs Node.** `copilot-setup-steps.yml` always writes a
  `setup-node` step, with the project's Node version, else `lts/*`, because the generated hooks
  run on Node, and an install step only where the project shows Node. The default action refs move
  to `actions/checkout@v6` and `actions/setup-node@v7`; a project's own pins still win.
- **Run 47 is the 1.15.0 release run, measured in full on the `claude` profile: PASS.** The
  release rule called for a full run of the set: its cases moved, and so did the model-facing text
  and the files the engine emits for each client. Run 47 is that full run, at candidate
  `4e892337`: all 144 cases measured, three samples each, composed with no earlier run and
  carrying no case. On the Claude profile (scenario `claude-opus-5-5` at `high` effort, judge
  `claude-fable-5-1`, client 2.1.286, baseline `stamity-claude-cli-v2`) and rubric v7, against the
  thresholds declared before the run: golden 0.976 (81 of 83) with floors 33 of 33, guardrail hold
  1.000 (24 of 24), benign-twin false refusals 0.000 (0 of 7), and trigger-probe accuracy 1.000
  (30 of 30). Calibration matched 5 of 5. The two golden misses are
  `plan-security-unit-carries-threat-note`, which passed 1 of 3 samples, two failing B5, and
  `reviewer-shallow-wrapper-pass-through`, new in this release and measured here first, which
  passed 0 of 3, each sample failing B1, B2 and B3. Neither is a floor case, and both stay on
  record as scored. Five calls were redone after an invalid attempt, two scenario calls the
  client's classifier stopped and three judge calls, and no admitted grade was re-rolled. Run 47
  is the run of record. No threshold, floor tag or roster count moved after run 47's scores were
  known, and no exception is recorded for this release. At the cut, after the publish, the
  `records` branch stood at
  `eb3135d2659b6574358e206f853a1b905b38859d`, and the evidence is linked at that commit: the run's
  results at
  [`evals/runs/2026-10-15-run-47/RESULTS.md`](https://github.com/zomarit/stamity/blob/eb3135d2659b6574358e206f853a1b905b38859d/evals/runs/2026-10-15-run-47/RESULTS.md),
  and the merge-ready snapshot the measurements page reads, 7 of 19 runs verified merge-ready
  (0.368), at
  [`evals/measurements/merge-ready-2026-10-15.json`](https://github.com/zomarit/stamity/blob/eb3135d2659b6574358e206f853a1b905b38859d/evals/measurements/merge-ready-2026-10-15.json).

### Removed

- **The APM and plugin distribution routes.** The npm CLI is the one way to install stamity. This
  is a removal in a minor release, made on purpose. What leaves:
  - **The APM route.** `apm.yml` and the `.apm/` tree leave `main`, so an unpinned
    `apm install zomarit/stamity` stops resolving at the merge, before any release. An install
    pinned to an earlier tag keeps working at that version and gets no update.
  - **The plugin route.** `plugin.json`, `.claude-plugin/`, `.cursor-plugin/` and
    `renovate/plugins.json` leave `main`, and no release builds, attaches or pushes a plugin
    distribution again, so a marketplace added from the repository stops resolving too. A GitHub
    release now carries the npm tarball and its SBOM only: the plugin archives, their `.sha256`
    files and `release.json`, the machine-readable release manifest every release from 1.9.0 to
    1.14.0 attached, are gone from 1.15.0 on, so automation that fetches `release.json` from a
    release finds none. The `plugin-dist` branch and the `plugins/v*` tags stay where they are, as
    frozen history, so a plugin install pinned to one keeps its version and gets no update.
  - **The `stamity plugin` verb** (`plugin status` and `plugin setup`). It is now an unknown
    command, exit 2, and `--help` lists nine verbs.
  - **The `plugin-backed` install mode.** A manifest written by 1.14.0 that still holds a `plugin`
    block keeps working: the block is held, never read, through the 1.15 line. `check`'s
    `plugin-duplicates` row warns, never fails, naming each client the block or Claude Code's
    `enabledPlugins` still records and that client's own uninstall command; `sync` prints the same
    lines for the clients the block names, and `clean` for those and for a plugin Claude Code's
    `enabledPlugins` records (`clean` reads `.claude/settings.json` before it removes `.stamity/`).
    Uninstall the plugin, then delete the `plugin` key.
  - **`check --expect-mode`.** It is now an unknown option, exit 2; `--expect-version` and
    `--expect-tools` are unchanged.
  - **The `plugin-runtime` doctor row**, and the JSON keys `pluginOwned` (`sync --json`) and
    `pluginUninstall` (`clean --json`). `check` still prints as many rows: the new `model-pins`
    row (under Added) takes its place in the count.
  - **The exports** `INSTALL_MODES`, `INSTALL_MODE_DEFAULT`, `PLUGIN_OWNED_CLASSES`, `InstallMode`,
    `PluginClientRecord`, `PluginConfig`, `PluginOwnedClass`, `EngineRegistry.plugins` and
    `EngineRegistry.emit.ownership` (`isPluginOwned`, `withoutPluginOwnedRows`,
    `sharedProjectionOwners`, `pluginOwnedSummary` and `PluginOwnedClasses`); `SetupManifest.plugin`
    is typed `unknown`. Of the modules the registry makes public: `readInstallMode` and
    `pluginOwnedClasses` (`EngineRegistry.manifest.manifest`), `HooksPlanContext.pluginOwnedHooks`
    (`EngineRegistry.emit.hooksInfra`), `ClientModelProjection.acceptsConcreteIds`
    (`EngineRegistry.roster.modelLadder`), and the capability matrix's `PLUGIN_CONTAINER_CLASSES`,
    `PluginContainerClass`, `PluginContainerFact` and `CapabilityMatrixInputs.plugins`
    (`EngineRegistry.emit.capabilityMatrix`). `EmissionPlan.packReach` drops no artifact as
    `plugin-owned` any more, and the reason leaves its type. The capability matrix page loses its
    "Plugin containers" section.
  - **For a fork.** `scripts/fork-identity.mjs` runs no generator and leaves a leftover
    `renovate/plugins.json` alone. A `stamity.distribution` block in `package.json` is ignored
    with a one-line notice for one release, not refused. `fork-release.yml` publishes the npm
    package and a GitHub release carrying the tarball and its `.sha256` only.
    `docs/enterprise-forks.md` says which lines of a fork's own configuration to drop before
    integrating this release.
  - **CI.** The merge gate and the nightly run no client's CLI any more: the plugin install,
    discovery and invocation legs left with the route.

  The plugins guide leaves the site, and `docs/enterprise-quickstart.md` now orders the fork-only
  route.
- **The superseded eval inputs.** `SET-v1`…`SET-v6`, `rubric-v1`…`rubric-v3`,
  `coverage-exemptions-v3`…`-v5` and `cases/`, `cases-v2/`, `cases-v3/` leave the tree; no
  script, test or source read them. Tag `evals-retired-2026-10-13` (commit `6dfa5ffe`) keeps
  them, and this command, typed from the repository root, restores them:

  ```sh
  git checkout 6dfa5ffe -- evals/SET-v1.md evals/SET-v2.md evals/SET-v3.md evals/SET-v4.md \
    evals/SET-v5.md evals/SET-v6.md evals/rubric-v1.md evals/rubric-v2.md evals/rubric-v3.md \
    evals/coverage-exemptions-v3.md evals/coverage-exemptions-v4.md \
    evals/coverage-exemptions-v5.md evals/cases evals/cases-v2 evals/cases-v3
  ```

  These were repository surfaces: the published package never carried them.

### Fixed

- **A Cursor, Copilot or Codex hook that exits without reading its input keeps its own decision.**
  The hook runner hands the payload to the hook on its standard input. When the hook exited, or
  closed its input, before reading all of it, writing the rest failed with `EPIPE` (`EOF` on
  Windows), and the runner reported `Hook process failed` whatever the hook had decided: it exited
  1, and on a Codex pre-tool-use row that runs an authored hook it exited 2, its own blocking exit,
  so Codex blocked the call. Above the pipe buffer (64 KiB on Linux and macOS) this happened every
  time; below it, only when the hook exited first, which made it intermittent. When the hook
  exited with a status of its own, the runner now takes that status and the hook's output as the
  result, as for any other hook. A hook killed by a signal is still a failed hook, and a hook that
  could not start, or that timed out, is reported as before.
- **Cursor and Copilot hook commands no longer rest on the folder they run in.** Their 1.14 hook
  commands named the hook runner by a path relative to the folder the client runs them in, so
  they found it only while that folder was the project root. Both clients keep it there for the
  project hooks this engine writes: the Cursor agent CLI ran every hook from the project root on
  2026-09-20, after a `cd` into a subfolder too, and Copilot runs each entry from its `cwd`,
  written as `"."` and documented as relative to the repository root
  (`.github/client-contracts.md`, which records no 1.14 hook failing in a subfolder). Each command
  now walks up to the project root (Cursor's `CURSOR_PROJECT_DIR` first) before it runs, and a
  runner missing at the root exits 1 naming the `sync` call that restores it. The next `sync`
  rewrites a 1.14 hooks file in place.
  Codex's commands already walked up and keep their form, but its hooks file still changes at the
  upgrade, since every command names the release ("Upgrading from 1.14.0" says what follows).
- **`/st-rework` says what its deferred rows do on `stop`.** The rows it appended at routing
  stand whichever way the handoff is answered: none is offered `fix now`, and none is appended
  twice (inbox rows `2026-10-10_next-tier/build/31` and `review/52`).
- **`st-qa` accepts the same proof everywhere.** Its person-row rule, its auto-prove table and its
  first rule now all take a test's `file:line` or the prover's `agent-run`, so a row a command
  run proved is no longer left for the person (inbox row `2026-10-10_next-tier/build/42`).
- **The release restores the records the cut recorded.** A release used to restore the `records`
  branch as it stood when its run started; the cut now writes `records: <sha>` into the tag's
  message, and the release restores exactly that commit and refuses a tag whose line is missing
  or is not 40 lower-case hexadecimal characters. The release checklist and the repair text
  `scripts/records.mjs` prints name the branch as `refs/remotes/origin/records`, so a clone that
  holds a tag called `origin/records` no longer reads the tag. These are repository surfaces: the
  published package never carried them (inbox rows `2026-10-13_records-branch/close/1`, `pr/9`
  and `pr/10`).
- **The eval set's rows due before this release's eval run.** The floor case that handed its
  scenario every inbox row's line number is succeeded by `work-frame-matched-rows-only`, whose
  brief gives only what `stamity ledger inbox` prints; the lockfile-audit case's partial-audit
  row becomes binding; the eval-run skill publishes a run's artifact to the `records` branch
  instead of committing it with the change; and `evals/README.md` points at `EXPECTED_MOVES`
  where it lives. These too are repository surfaces (inbox rows
  `2026-10-11_release-1-14-0/build/25` and `build/26`, `2026-10-13_records-branch/review/40`,
  `2026-10-10_next-tier/build/43`).

## [1.14.0] - 2026-10-12

### Upgrading from 1.12.0

Take the update with the new release's `sync`, then `check`; add `--dry-run` to the `sync` first to
read what it will write. The second item says when a `clean` waits for that `sync`, and names the
one case where an edited pack file is moved out before it. The last item says what the verbs do
where git would read a bare repository.

- **The first `sync` rewrites the charter.** Invariant 4 changes (invariants 1.2.0), so
  `AGENTS.md` moves, and with Codex selected `AGENTS.override.md` too. Where the file is tracked
  and clean in a repository whose top level is the setup root, `sync` names it in a notice and
  takes no `.bak`: the previous text is in git history. For an uncommitted or untracked file, a
  setup in a monorepo subfolder, or a git check that fails, `sync` keeps your previous file as
  `AGENTS.md.bak` (and `AGENTS.override.md.bak`) and warns.
- **`clean` refuses until this version's `sync` has run, and `clean --pack` refuses for some
  packs.** Each stops with `clean refused` (`CLEAN_ERROR` under `--json`) before touching
  anything, `--dry-run` included, while a file it would keep is one this version's `sync`
  rewrites: the ledger records the file as unedited, and this version renders other bytes there.
  The message names the files. For the full `clean`, the charter 1.12.0 wrote is such a file, so
  run `sync`, then `clean -y`; the CLI's remedies and the plugin's `st-setup` body print the route
  in that order. `clean --pack <id>` reads only that pack's client copies: it refuses when one of
  them is such a file, and removes the pack with no `sync` first when none is. The refusal's own
  next step names the one exception to `sync` first: when the `pack-integrity` row of `check`
  names an edited pack file, one that no longer hashes to what its install recorded, do not run
  `sync`, which would carry the edited bytes into the clients' files. Move that file out of the
  pack's directory first, as that row says, and run the same `clean` again. So when you upgrade with
  such a file in place, move it out before the upgrade's `sync` too. With the file out, the
  `clean` runs with no `sync`, unless another file is stale for the first reason, as after this
  upgrade: the charter for the full `clean`, and for `clean --pack` any copy of the pack this
  version renders with other bytes. Then it refuses once more. The row now reports the moved file
  missing, not edited, and a `sync` carries nothing of it, so run `sync`, then the same `clean`
  again. On either route the moved file's own client copy, which never held the edit, is kept and
  named: delete it by hand unless it is yours. After `clean --pack`, install the pack again as
  the row says.
- **`.claude/settings.json` loses the `Read`, `Grep` and `Glob` allow rows.** The first `sync`
  removes the three rows 1.12.0 wrote, with no backup, and from now on the engine writes only its
  hook entries there, so Claude Code may ask before a read outside the project. A scoped row such
  as `Read(./src/**)`, your `deny` and `ask` rules and any row you add afterwards are yours and
  stay.
- **Done now means the gates of the change's class.** After the `sync`, `/st-quick` and
  `/st-work` ask `stamity gate classify` which gates a change needs. A change to code, to
  configuration or to any path no rule places is `product` or stronger and runs every gate, as
  before. A change made only of `docs/**`, top-level Markdown (the agent instruction files
  excepted) or the engine's run records, inbox and handoffs runs the secret scan and the tests,
  not lint or typecheck. That rests on your CI running every gate on `product` and stronger
  changes: where the charter's `CI provider` reads `unknown`, both flows run every gate whatever
  the class. A `/st-work` run opened at 1.12.0 has no `Base:` line in its record, so when it
  finishes after the upgrade it runs every gate unclassified and, once work is committed, lists
  `secret scan: not run` under `Not done:`.
- **A secret-shaped value in a change stops the run.** Both flows scan the change's added lines
  first, and a hit stops them, naming the path, the line and the rule. There is no allow-list: a
  hit on a deliberate test fixture is yours to settle before the run goes on.
- **More changes reach the security lens, and fewer fit the quick lane.** A change is
  `security-sensitive` when it touches any path the security lens reads. That is every path the
  lens read at 1.12.0: a file under an `auth/`, `middleware/`, `crypto/`, `api/`, `routes/` or
  `handlers/` folder, a `*.pem` or `*.key` file, and `package.json`, the lockfiles,
  `requirements.txt`, `go.mod`, `Cargo.toml` and `Gemfile`. It is also every path this release
  adds: a CI workflow or composite action, a shell or PowerShell script, a container build file,
  a package manager's install-steering file, and a client's hooks, settings or MCP file. The
  engine's `.stamity/manifest.json`, `.stamity/overrides/` and `.stamity/change-classes.json` are
  in the class too, and so is a changed line in JavaScript, TypeScript or Python code that spawns
  a process, deletes or overwrites a file, calls the network or assigns a secret name. `/st-work`
  runs the `security` lens on such a change at every tier (on a lockfile-only bump, only when the
  dependency audit flags something), and `/st-quick` hands the whole batch to `/st-work`, with no
  size floor. At 1.12.0 the quick lane judged this by what an item touched (authentication,
  credentials, key material, payments, access control); now the class decides, so a one-line edit
  under `routes/` or `api/`, or to `package.json`, leaves the quick lane.
- **The review loop's default cap is 3 rounds, down from 4.** A setup that never set
  `review.maxIterations` takes the new default on the first `sync`, which also rewrites the cap
  in Claude Code's generated review-gate hook. A value you set stays. To keep four rounds, run
  `stamity config set review.maxIterations 4`, then `sync`.
- **Copilot agent files gain two keys.** The first `sync` adds
  `include-custom-instructions: true` and `reasoning-effort: <level>` to every
  `.github/agents/stamity-<id>.agent.md`, so a Copilot CLI sub-agent loads `AGENTS.md` and asks
  for its class's effort: `high`, `medium` or `low`, unless `config set effort.<class>` names
  another level.
- **Two effort levels are written differently.** An `effort.<class>` of `minimal` is now written
  as `low` on Codex and on Copilot, and `sync` warns naming the client. A `max` is written as
  `max` on Codex, where 1.12.0 wrote `xhigh`.
- **Deferred rows need a date or a trigger.** The flows file new rows in `.stamity/inbox.md`
  below a `## Rows under the schedule rule` heading they add, each with `by:` or `when:`. The
  rows you already have stay valid above it and need no edit. A row written by hand below the
  heading with neither does not parse, and the inbox query lists it as `unparsed`.
  `stamity ledger close --retired` now refuses a value that is not `fixed <ref>`, `cut <reason>`
  or `scheduled <place>` with a date or a trigger.
- **A `/st-work` close asks about leftovers, and QA asks for a person less often.** The closing
  question gains a part listing each finding left open and each due or touched inbox row, with a
  recommendation for each; an unattended close drops nothing real and files the run's own
  leftovers as `decision-waiting`. The QA walk-through keeps a person row only for a rendered
  surface, a live third-party client or account, or a step that cannot be undone, and a change of
  class `docs`, `records` or `tests` closes with no walk-through and no ask unless it changes a
  rendered page.
- **`clean --pack <id>` also removes the pack's client copies.** It keeps and names a copy you
  edited or one it cannot prove the engine wrote, and the pack remedies gain a step by hand for
  those: delete each kept copy, unless it is yours, then run `sync`.
- **A manifest whose `generatedBy` is not a semantic version is refused.** Every release wrote a
  plain version there, such as `1.12.0`, so this meets only a `.stamity/manifest.json` edited by
  hand or by another tool. A leading `v`, a space, `latest` or a range now fails, where 1.12.0
  took any non-empty string. A verb that reads the manifest then stops with `Invalid manifest`,
  naming the file and `generatedBy`, and `check` fails its `manifest` row with the same message.
  Write the release that last wrote the setup there, as `1.12.0` is written, then go on with the
  upgrade's `sync`.
- **Where git would read a bare repository, the verbs that read git report git as not
  answering.** Before it starts git, the engine now looks at the folder a verb runs in and at
  each folder above it, as far as git's own search goes. A folder on that path that has the
  layout of a bare repository, met before any `.git` that git stops at, is not handed to git.
  The look goes by the names of the entries alone, so a folder that only looks like one counts.
  This meets a setup root inside a real bare repository, and a checkout that keeps such a folder
  at the setup root or between it and the checkout's own `.git`. There, on any git version,
  `check`'s `git-available` row warns that git was not started here, because this folder or a folder
  above it has the layout of a bare repository, and it names no git command to run. `sync` prints no
  dirty-tree warning, and keeps a `.bak` where it rewrites the charter, as the first item says of a
  git check that fails. Where it wrote files, its closing step names no `git diff` there: it says
  why, and to review from the files it listed and the `.bak` a warning names. Where that list was
  cut short, the step says so, and that the manifest's ledger names every managed file but not
  which of them changed. `gate scan` exits 1
  and `gate classify`, reading the change from git, answers `product`, each saying that git was not
  started and naming no git call as failed, so `/st-quick` and `/st-work` run every gate and list
  `secret scan: not run` under `Not done:`. `init` treats the folder as it does one with no
  repository: at a terminal it asks before it writes, and it prints a no-git note. There the
  question, the note, the security line of the ready panel and of the dry-run preview, and the
  refusal when you decline the question, state this cause and name no `git init`. The ready
  panel's next steps, and `nextSteps` in `init --json`, open there with one step more: move the
  folder off that path, or work from a checkout that does not keep it there, before you start a
  client or a flow. The usual steps follow it unchanged, and the document's keys are the ones
  they were. After a guided migration, the line on the previous setup's uninstall says there to
  copy your own files out with no git command; where git answers it still says to commit. `init` and
  `plugin setup` seed no maturity tier from the history and record no hosting platform, and
  `config detect` reads none and leaves the recorded one. `handoff prepare` records no git ref and
  says so, and `handoff resume` cannot measure drift. Every `worktree` verb refuses with
  `VALIDATION_ERROR`, stating this cause and naming no `git init`. Where the row warns for this
  reason, look at the entries of this folder and of each folder above it by name to find the one
  with that layout, and do not run git in it or in any folder under it, the one you stand in
  included: git started anywhere under it finds it as the engine did, and only the engine's own git
  calls are pinned. A flow is no exception: `/st-quick` and `/st-work` do not stop there, and the
  git their session and sub-agents start is not pinned, so start no flow there until the folder
  is moved; the row and `init`'s note say so too. Move the folder off that path, or run the verbs
  from a checkout that does not keep it there. The row warns only of a folder met on the way up
  from the folder a verb runs in: one of that layout elsewhere in the tree, below the setup root,
  meets no look, and the row says nothing of it. The last item under "Security" says what that
  leaves. One more change comes with the same hardening: every verb but the `worktree` ones
  now drops the caller's `GIT_*` variables when it reads git, `handoff` included. An inherited
  `GIT_DIR` no longer points them at another repository, and a setup whose repository is named only
  by `GIT_DIR` reads as having none.

1.13.0 was skipped on purpose: no release carries that number, and 1.14.0 follows 1.12.0.

### Security

- **The Claude Code settings the engine writes pre-approve no tool.** The `Read`, `Grep` and
  `Glob` allow rows are gone from `.claude/settings.json` on both routes, a repository setup and a
  plugin-backed one: the engine writes only its hook entries there, and under a plugin that carries
  the hooks it writes no member. A bare `Read` matches every file read, and a read inside the
  project needs no rule, so the rows only removed prompts for reads outside it. An existing setup
  loses the rows on its next `sync`. Where the ledger records each row (a 1.12.0 setup), they leave
  with no backup, and an equal row it does not record is yours and stays. A ledger from 1.11.0 or
  older records no row, so every bare `Read`, `Grep` or `Glob` row counts as the engine's: they
  leave with no backup when the file is as the engine last wrote it, and behind a verified `.bak`,
  with a warning naming them, when you have edited it since. A scoped row such as `Read(./src/**)`
  stays. The capability matrix drops Claude's `permission-rows` cap.
- **A forged ledger row and hash alone no longer delete your file.** At an engine-named content
  file, a charter or instruction file, the Copilot workflow and hooks file, and Cursor's 1.11.0
  guard names, a delete needs bytes the engine renders (or, at those two names, the bytes 1.11.0
  rendered for that setup). A copy no rendering proves is kept and named. Two 1.11.0 setups keep
  their old spawn guard and its entry, named, on the safe side: one whose plugin carried the agent
  class but not the hooks, since 1.11.0 put its pack and override agents in the guard but recorded
  no Cursor agent row for them, and a `sync` after a first `sync` that refused `.cursor/hooks.json`
  once an agent has been added to or removed from the corpus since 1.11.0. At a charter or
  instruction file and at `.github/hooks/stamity.json`, an overwrite the engine's rendering does
  not prove keeps your previous content: in git history when the file is tracked and clean in the
  repository whose top level is the setup root (a notice names the file, no `.bak` is taken), and
  behind a verified `.bak` and a warning otherwise: for an uncommitted or untracked file, a setup
  in a monorepo subfolder, a charter inside a submodule, and any git check that fails, git missing
  included. A setup you have not committed, or one in a monorepo subfolder, therefore gets an
  `AGENTS.md.bak` when a release changes the charter. What stays open, as `SECURITY.md` says: a
  pack or override planted beside the forged row can still prove the delete of a file it renders
  byte for byte, through `sync`, `clean` and `clean --pack`; and at the other paths the engine
  writes, a forged row hashing your file still lets `sync` overwrite it without a `.bak`.
  Because the proof reads only the running version's renderings, `clean` and `clean --pack`
  refuse with `CLEAN_ERROR`, before touching anything, while a file they would keep is one a
  `sync` with this version rewrites (after an upgrade, or after the detected stack or the gates
  moved since the last `sync`): run `sync`, then `clean -y`, with the one exception the second
  item under "Upgrading from 1.12.0" names.
- **A secret in a change's added lines stops `/st-quick` and `/st-work`.** Both flows run
  `stamity gate scan` before their gates. It reads the lines the change adds and its untracked
  files and, against a base commit, the added lines of every commit since that base, so a value
  committed and then removed still stops the run. A hit names the path, the line and the rule, and
  the commit when it sits in the branch's history, never the value. There is no allow-list and no
  waiver: the flows never clear a hit by rewriting the value and scanning again, and a hit on a
  deliberate fixture is yours to settle. A code file the scan could not read is listed under
  `Not done:` as unscanned, never read as clean, and a scan that could not run is listed there as
  `secret scan: not run` while every gate runs.
- **The security lens runs on what a change touches, at every tier.** `/st-work` runs the
  `security` lens whenever `stamity gate classify` names the change `security-sensitive`, the
  light tier included, and whenever no class could be read, so an unread change is still reviewed.
  The lens's trigger paths gain CI workflows and composite actions, shell and PowerShell scripts,
  container build files, the package managers' install-steering files (`.npmrc`, `.yarnrc`,
  `.yarnrc.yml`, `.pnpmfile.cjs`, `npm-shrinkwrap.json`), the clients' and the engine's hook
  folders and `.husky/`, and the clients' settings and MCP server files. A changed line in a
  JavaScript, TypeScript or Python file that is no test file places the change in that class too:
  a child process, a file delete or overwrite, a network or registry call, or a token or secret
  name given a literal or an environment value. So does a code file whose lines could not be
  read. A `/st-quick` batch in that class moves to `/st-work` as it stands, with no size floor.
- **Every git read a verb makes is pinned, and the engine looks at the folder before it
  starts git.** Up to 1.12.0 each verb that reads git ran plain `git` in the caller's
  environment: at the setup root, for `workspace sync` in each member's folder, and for the
  `worktree` verbs in the folder they are started in. `sync`, `workspace sync`, `check` and
  `init` read the working tree (`git status`). `init` and `plugin setup` read the history and
  the `origin` remote, `config detect` the remote, and `handoff` the branch and commit. The
  `worktree` verbs made every call that way. Where that folder has no `.git` of its own, a
  monorepo subfolder or a workspace member for one, and it, or a folder between it and the
  checkout's own `.git`, holds files in the shape of a bare repository, git read that folder as
  the repository and took its configuration. A command that
  configuration names as a file-system monitor then ran, with your rights, when `sync`,
  `workspace sync`, `check`, `init` or a `worktree` verb ran there. The other reads recorded
  what the folder answered: a maturity seed, a hosting platform, a branch and commit. Such a
  folder can be committed, so it can arrive on a branch someone else wrote, and `check` is the
  verb a workflow runs on a pull request. Each of those reads now runs git with
  `safe.bareRepository=explicit`, so a folder shaped like a bare repository does not answer, and
  with `core.fsmonitor=false`, so no file-system monitor command runs whatever any configuration
  says. So do the two reads this release adds: the `gate` verb's, and the tracked-and-clean
  check that lets an overwrite take no `.bak`. All but the `worktree` verbs also drop every
  `GIT_*` variable, so a `GIT_DIR` inherited inside a git hook no longer points a read at
  another repository. The `worktree` verbs keep the caller's git environment: an external
  `GIT_DIR` is a layout they accept, and `fetch` and `worktree add` run with your own transport
  and identity variables. Git older than 2.38 ignores the first option, so the engine also looks
  before it starts git, asking the file system for names, types and devices only and reading no
  file. It walks from the folder upward as far as git's own search goes, and where it meets a folder that passes git's own test for a
  repository folder, before any `.git` that git stops at, git is not started. For a tree git
  checked out, the refusal therefore holds on git 2.38 and later by the option and on older git
  by the look. Three narrow residuals remain, and `SECURITY.md` names them. Each needs something
  a checkout cannot carry: a damaged `.git` folder of your own, on older git, or a git variable
  in the environment a `worktree` verb inherits. A fourth is wider, and a checkout can carry it:
  all of this is the engine's own git and no other. Git that a client's own tools, a flow's
  session and its sub-agents, or your own shell start in or under such a folder is not pinned and
  takes no look. That does not take a refusal: the look is taken from the folder a verb runs in
  and walks upward, so a committed folder of that shape elsewhere in the tree, below the setup
  root, meets no look and no warning, and git that anything other than the engine starts in or
  under it reads it. A folder the look does refuse does not stop `/st-quick` or `/st-work`
  either, which go on with the session's own git. `SECURITY.md` names this one with the others,
  and the one setting git documents against it, which is yours to make and which the engine
  neither sets nor checks: `safe.bareRepository` set to `explicit` in your user-level or
  system-level git configuration (git 2.38 and later). It covers both placements: every git that
  reads that configuration then opens a bare repository only where `--git-dir` or `GIT_DIR` names
  it, so git run inside a real bare repository has to name it that way too. The pinning is the
  CLI verbs': the package's library function for the origin read, called with no runner passed,
  still starts git with neither option and no look, and `SECURITY.md` says so. Where a folder is
  refused, the verbs report git as not answering, as they do with no repository, and the
  `worktree` verbs refuse; the last item under "Upgrading from 1.12.0" says what that looks like.
- **Git is started by an absolute path found on `PATH`, so a file of git's name in the folder it
  runs in is not started in its place.** Every release from 1.0.0 to 1.12.0 started git by its bare
  name and left the lookup to the runtime, in the folder the verb runs in: the folder it is started
  in, as a rule the setup root; for `workspace sync` each member's folder; and for the `worktree`
  verbs also the repository's main checkout and each of its worktrees. On Windows the runtime looks
  for a program named that way in that folder first, before any `PATH` entry (read from the
  runtime's source, not from a run). So on Windows a file named `git.exe`, or the same name ending
  in `.com`, in that folder was started in git's place, with your rights, by every verb that reads
  git, the ones the item above lists. Such a file can be committed, so it can arrive on a branch
  someone else wrote, and `check` is the verb a workflow runs on a pull request. macOS and Linux do
  not look in that folder for a bare name; they were affected only where your own `PATH` names that
  folder or a folder under it: by an empty entry, by a relative one such as `.` or `bin`, or by a
  full path to one of them. Each of the four places that start git now resolves it once per
  folder and `PATH`, to an absolute path, and starts that path: the verbs' pinned runner, the
  tracked-and-clean check before an overwrite, the `worktree` verbs' runner, and the library's
  origin read called with no runner. The walk takes only a `PATH` entry that is a full path, skips
  an empty entry, a relative one and an entry that is the folder git runs in, and on Windows tries
  git's name with `.com` added, then with `.exe`. Git found on `PATH` is the git that ran before.
  There is nothing to set: upgrade. If you ran an older release in a checkout of work you had not
  read, on Windows, or on macOS or Linux with a `PATH` that named the folder or one under it, look
  in each folder git ran in: the folder you started a verb in, as a rule the setup root; each
  member's folder if you ran `workspace sync`; and, if you ran a `worktree` verb, the repository's
  main checkout and each of its worktrees. Look as well in each folder under those that your `PATH`
  named. On Windows look for a file of either name, on macOS and Linux for one named `git`. Look on
  the branches you had checked out then as well, since such a file leaves the folder when you
  switch away from its branch. If one is there, treat it as a program that ran with your rights.
  One thing can change for you: where your only git sits behind an entry the walk skips, the verbs
  now answer as on a machine with no git, and `check`'s `git-available` row, `init`'s note and the
  `worktree` verbs' refusal say the engine found no git to start and which entries it takes git
  from; put git's folder on `PATH` by its full path. This covers the folder git runs in and nothing
  wider. The walk takes the `PATH` the engine is started with as given, so an entry that is a full
  path to some other folder is searched as it stands, a folder inside the checkout included. Run
  through `npx` or `npm exec`, the call form the setup prints, the engine is started with the
  project's `node_modules/.bin`, and that of each folder above it, ahead of your own `PATH`.
  `SECURITY.md` carries the row and its residuals, each with what to look at.
- **The hook runner for Codex, Copilot and Cursor starts a `node` hook by the absolute path of its
  own interpreter.** From 1.7.0 to 1.12.0 the runner the setup emits, `stamity-portable-hook.mjs`
  under `.stamity/generated/hooks/`, started each hook's launcher by its bare name, in the
  repository root, or in the session's folder for a hook a plugin carries. On Windows the runtime
  looks for that name in the folder first (read from the runtime's source, not from a run), so a
  file there named `node.exe`, or the same name ending in `.com`, was started in the launcher's
  place when a hook ran, with your rights; macOS and Linux were affected only where your `PATH`
  names that folder or a folder under it, as for git above. A hook whose launcher is `node`, which
  every hook the engine writes is, is now started as the interpreter the runner itself runs under,
  and no lookup by name takes place. The runner on disk changes with this version's first `sync`,
  the one the upgrade above runs; there is nothing to set. A hook whose launcher is another program,
  `bun`, `deno`, `python3` or `ruby`, or `node` spelled another way, `node.exe` for one, which only
  your own hooks or a pack's can carry, is still started by its bare name, and the client still
  starts the runner itself with a bare `node`, by its own rules. In a checkout of work you have
  not read, start any client the setup writes for under a `PATH` that names no folder of the
  checkout, and on Windows, before opening it, also look at the repository root, and for a hook a
  plugin carries at the folder you open the client in, for a program file under the name of `node`
  or of a launcher a hook names. `SECURITY.md` names both in the row on how git is started.

### Added

- **`stamity gate`, a fourth hidden verb, names a change's class and scans it for secrets.**
  `gate classify` reads the change from git (staged, unstaged and untracked, against
  `--base <ref>`) or takes `--paths`, and names one class of seven: `security-sensitive`,
  `public-contract`, `product`, `config`, `tests`, `docs` or `records`. With the class come the
  checks it calls for, the review lenses it adds, the tests it selects and the rule that placed
  each path, as text or as `--json`. Out of the box `docs/**` and top-level Markdown are `docs`,
  the engine's run records, inbox and handoffs are `records`, the security lens's paths and the
  engine's own manifest and overrides are `security-sensitive`, and everything else is `product`,
  the agent instruction files (`AGENTS.md`, `CLAUDE.md`) included at any depth. A code file, a
  config-format file or an extensionless file other than a doc name such as `LICENSE` is never
  `docs` or `records`, except the data the engine writes under its own record paths. Every
  unclear read gives the stronger answer: a failed git read gives `product`, a call with no
  `--base` over commits no remote-tracking ref holds gives at least `product`, and a `--base` that
  does not resolve gives no class and exits 1. `gate scan` is the secret scan the Security entry
  above describes: it exits 1 on a hit and on a change it could not read. Neither subcommand
  writes anything. The verb is kept off `stamity --help`, as `learn`, `handoff` and `ledger` are;
  `docs/cli-reference.md`, the README and `docs/getting-started.md` name it.
- **A repository can declare its own change classes and test inputs.**
  `.stamity/change-classes.json` holds two optional keys: `classes`, the globs that join a class,
  and `testInputs`, which maps a glob over changed paths to the test files it selects, or to
  `all`. `gate classify` reads the file from the base commit only, never from the change, so a
  change cannot lower its own checks, and a change to the file is `security-sensitive`. The
  classes `tests`, `config` and `public-contract` are reached only through this file. `check`
  gains a `change-classes` row, printed only when the file exists: it fails naming the first
  error, and `docs/troubleshooting.md` lists what it refuses. With no file, or with no map in it,
  a class that selects tests runs every test. The injection-screening rule names the file beside
  the manifest as the second file under `.stamity/` that configures gates.
- **`stamity ledger inbox` reads the deferral inbox by what a change touches.** A fourth
  subcommand of the hidden `ledger` verb prints the rows of `.stamity/inbox.md` that name a
  changed path (`--paths`), a plan (`--plan`) or a word (`--area`), and under `--due [date]` the
  rows whose `by:` day has come. A row tagged `critical-deferred` or `decision-waiting` always
  prints. Each line is screened as it prints: a row the screen withholds shows its line, severity
  and location with no summary, and a row that does not parse is listed as `unparsed` with the
  reason. The query writes nothing, refuses an inbox that is a hard link, and reads at most 1 MiB.
- **Copilot agents carry their class's effort level.** Each
  `.github/agents/stamity-<id>.agent.md` ends its frontmatter with `reasoning-effort: <level>`:
  `high`, `medium` or `low` by default, or the level `config set effort.<class>` names, narrowed
  to Copilot's scale of `low` to `max`. Prompt files gain nothing. The capability matrix's
  `effort-axis` row names the sources; the key is the Copilot CLI's, the cloud agent's handling
  of it is undocumented, and the APM package's Copilot agents do not carry it yet.
- **`ultra` joins the effort levels, above `max`.** Codex documents it, so
  `config set effort.<class> ultra` is taken where every selected client can express it and
  refused where one cannot, naming that client and where its scale ends (Claude Code and Copilot
  end at `max`).
- **Plan-lint gains L5, an advisory check of plan size.** The structural coverage script reports
  `unit-size` (a unit past 60 lines), `unit-oversize` (past 100), `unit-prewritten` (a fenced
  block, or five or more `>` lines, inside a unit) and `delta-verbose` (a requirement entry past
  six lines). None fails the pass or blocks the write; `/st-plan`'s return line reads `L5 none`,
  `L5 <n> advisory` or `L5 not run`.
- **A plan unit on a security-sensitive path carries a threat note, and a plan can say what it
  leaves out.** `/st-plan` adds a `threat` row to a unit whose files `gate classify` places
  `security-sensitive`: its trust boundary, what it trusts, one abuse case and the check that
  stops it, in at most five lines. When no class can be read, every unit carries the row. The
  plan shape gains two optional sections: Follow-ups, each with a date or a trigger, and a Drop
  list of items with neither, which are filed nowhere.
- **A `/st-work` run record says what each phase cost and what the close left.** As a phase or a
  review round ends, the run adds a `usage:` line with its minutes and, where the client reports
  them, its tokens. The close adds a `leftovers:` line counting what it showed, fixed, scheduled
  and dropped. The record's head gains `Base: <commit>`, the run's branch point, which the scan
  and the classify read.

### Changed

- **The eval run of record is named in one file.** `evals/run-of-record.json` holds its results
  path, the release it shipped and any recorded exception, and the measurements page reads that
  file and the run's own per-metric figures, so moving the run of record is a one-file change. A
  malformed file is refused with an error naming it, and a PASS run of record beside a recorded
  exception is refused, so a passing release resets the exception. The page renders unchanged.
- **The release eval follows what changed, and a patch runs only the release lines it triggers.**
  The release checklist and `evals/SET-v7.md` measure the full set when the diff since the run of
  record touches a file that run hashes as an input (`content/**`, the emitted client files, the
  eval set, the case sets, the eval skill and its copies, the eval scripts, a case's other
  sources), when the scenario model, the judge model or the harness's pinned client version moved,
  when the run of record is FAIL, or at the third release or 30 days since the last full run.
  Otherwise the release notes say `carried forward from run N: no model-facing change`. Every
  per-release checklist line names its trigger under `Runs when:`; the admin-roster and
  publish-rights review runs on every release, a patch included. Two runs on different pinned
  client versions are two configurations, so no case carries between them.
- **CI skips work a pull request already proved.** A push to `main` whose tree `ci.yml`'s own
  pull-request run passed skips the test matrix and both route lanes. A change made only of
  records, specs, learnings or website pages runs one `lanes` job instead of the full matrix: the
  learnings lane adds the CLI build and its `check`, and the website lane the docs site build and
  the root typecheck. Any other path, or a diff that cannot be read, runs the full matrix, which
  also builds the docs site when a website page changed or no diff was read. CONTRIBUTING and
  GOVERNANCE say so.
- **A test a fork adds declares the documents it reads.** The suite now carries a test-input
  census, `test/ci/testInputsGuard.test.ts`. A test whose source names a tracked page, a record
  or any path an entry of the `testInputs` map in `.stamity/change-classes.json` matches needs
  an entry whose glob matches that path and whose `tests` list names the test, or a folder
  holding it. The fork guide's sample gate test, added as printed, fails the census once for
  each document it reads, until its path joins the `tests` list of the map's `*.md` entry.
  `docs/enterprise-forks.md`, **Write the gates that decide the upgrade**, gives the line, and
  names the map as the third thing a fork keeps true, beside its identity step and its branch
  filters. This is a repository surface: the census is a test, and the published package does
  not carry it.
- **The eval price list covers Sonnet 5.5 and Haiku 4.5.** `evals/price-list.json` gains
  `claude-sonnet-5-5` and `claude-haiku-4-5-20251001`, read off the vendor's pricing page on
  2026-10-08.
- `clean --pack <id>` also removes the copies `sync` projected from that pack into each client's
  folders, while the pack is still installed. A copy you edited is kept and named. A pack whose
  command and skill share a name cannot be planned, so none of its copies can be proven: each copy
  of one of the pack's own artifacts is kept and named, and nothing else is touched. A copy
  unedited since its recorded hash keeps its ledger row; a copy you edited, or one whose row
  records no content hash, loses its row. The remedies `sync`, `add` and `check` print for a pack
  gain a step by hand after `clean --pack`: delete each client copy it keeps and names, unless it
  is yours.
- A content-folder file that `sync` or `clean --pack` cannot prove the engine's, because the
  engine's rendering could not be built, keeps its ledger row so the next `sync` tries again. The
  full `clean` keeps such a file too, but it removes the setup, ledger included, so its report
  says to delete the file by hand unless it is yours. Either report names why the rendering could
  not be built.
- **The `clean` refusal's next step names one exception to `sync` first.** `clean` and
  `clean --pack` refuse while a file they would keep is one this version's `sync` rewrites, and
  the next step says to run `sync` with this version, then the same `clean`. A pack file edited
  after its install makes its client copy such a file too, and there that `sync` is the one
  `check`'s `pack-integrity` row forbids, since it carries the edited bytes into the clients'
  files. So the step goes on: when that row names an edited pack file, one that no longer hashes
  to what its install recorded, do not run `sync`; move the file out of the pack's directory
  first, as the row says, and run the same `clean` again. `docs/plugins.md`,
  `docs/packs-and-trust.md` and the troubleshooting page's `plugin-duplicates` row give the same
  route, and what follows when the `clean` refuses once more.
- **A removed override's client copies, and the files of a skill an override replaces, stay on
  disk until you delete them.** A delete at an engine-named file now needs a rendering this
  version produces at that path, as the Security entry above says, and two ordinary cases have
  none. Remove an override that added an id of its own, and `sync` keeps each client copy it had
  written, where your client goes on loading it. Add a skill override, and `sync` keeps each
  support file of the replaced skill that your override has no file for: every bundled skill
  ships one, the Codex companion `agents/openai.yaml`, which Codex reads beside your `SKILL.md`.
  Up to 1.12.0 the name and the recorded hash were enough for a delete there. `sync` names each
  kept file under `Reclaim sweep:` and drops its ledger row, so a later `check` reads clean
  while the file is still there: delete each one you do not want. `docs/customization.md` has
  both cases, and how to find the files afterwards.
- **Charter invariant 4 names the gates of the change's class (invariants 1.2.0).** It read "Done
  means the verification gates above exit 0" and now reads "Done means the gates `gate classify`
  names exit 0 (all if it did not run)". A change nothing classified still runs every gate, and
  the `Not done:` line is unchanged. A repository picks the wording up on its next `sync`; one
  that never re-syncs keeps the 1.1.0 wording, which runs every gate on every change.
- **`/st-quick` and `/st-work` run the gates the change's class calls for.** After the secret
  scan, each flow asks `stamity gate classify` for the class. From `config` up every gate runs,
  as before. A `tests` change runs its selected tests, lint and typecheck; a `docs` change its
  selected tests and, in `/st-work`, one review pass in place of the loop; a `records` change its
  selected tests. The narrower sets rest on one condition, which the flows state: the
  repository's CI runs the full matrix on every `product` or stronger change and on a schedule.
  Where the charter's `CI provider` reads `unknown`, where the CLI or its `gate` verb cannot run,
  where the classify fails or names a failed read, or where the test command takes no file list,
  every gate runs.
- **A synced test-runner carries the CI provider in its own text, and a red verdict writes no
  report.** The emitted `test-runner` agent now maps a class's checks to gates, and on the final
  tree it runs every gate for a `product` or stronger class. `sync` renders the detected CI provider
  into that passage of each client's copy (in this repository, "This repository's CI provider is
  github-actions"), so on a synced copy the rule that follows needs no read of the charter: where
  the provider reads `unknown`, the final tree runs every gate whatever the class. The APM package's
  copy is made without that rendering and still holds the unresolved token; the rule names that case
  too, so on that copy the final tree runs every gate. A plugin's copy holds neither the provider
  nor the token: the plugin build writes "the CI provider named under Repo facts in AGENTS.md" in
  the token's place. There the agent reads that line of `AGENTS.md`, and the final tree runs every
  gate whatever the class where the line reads `unknown`. The agent's return contract now says that
  a `red` verdict writes nothing to the report path the dispatch names and is returned in full, rows
  and excerpts. At 1.12.0 it said only that a red verdict is returned in full. A `green` verdict
  with a report path named still writes its rows there and returns the digest.
- **A lockfile-only bump is audited before the security lens reads it.** When a change's only
  security-sensitive paths are `package-lock.json` files that parse at lockfile version 2 or 3 on
  both sides, no `package.json` changed and no bumped package carries an install script,
  `/st-work` runs the dependency audit first and the `security` lens only if the audit flags
  something: an advisory, a licence flag, a risk class other than `patch` or `minor`, or an audit
  that is partial or cannot run. Any other lockfile format, a parse failure or a package with an
  install script keeps the lens. The `st-dep-audit` skill gains this role and stays report-only.
- **The review loop stops at three rounds by default, two at the light tier, and escalates on
  what the run shows.** `review.maxIterations` defaults to 3, down from 4; a value you set stays,
  within 1 to 10. The fixed step "round 4, a fresh fixer on a stronger model class" is gone. A
  finding two re-reviews found not fixed, a gate red after a fix, or a finding still open
  entering the last round goes to a fresh fixer at one effort level above its own, on the same
  model, where the client's dispatch takes an effort setting; a finding that fixer leaves open
  stops the run for you. The re-review after an escalation runs once on a stronger class. A
  reviewer's self-rated confidence no longer starts a round: an approval below the record's
  confidence gate counts, and the proof block names it as below the gate.
- **Findings are recorded by consequence, on one severity scale.** The reviewer, the three
  lenses, the implementer and the fixer share one definition of `Critical`, `Warning` and
  `Minor`, and `/st-rework` uses the same words. A finding names who or what is affected and how.
  A remark with no consequence (wording, naming, style, a tidier shape) is a note, not a finding:
  the written report lists it, the digest ends `notes left out: <n>`, and it starts no fix round.
  A person's own "nit" in `/st-rework` stays a `Minor` finding.
- **A run's close decides every leftover in one question.** `/st-work`'s closing question gains a
  fourth part, by a rule `/st-board` states: each finding neither fixed nor rejected, each inbox
  row the change touched or whose day has come, and every row waiting on a decision, each with a
  recommendation to fix now, schedule or drop. A `Critical` or `Warning` is never pre-set to drop,
  and only you drop one. With no answer nothing real is dropped: each leftover of the run is filed
  tagged `decision-waiting`, and the next attended close asks about it first. `/st-quick` files
  no inbox row: what a batch cannot finish goes to `/st-work`, whose close asks.
- **A deferred row carries a date or a trigger, or it is not filed.** New rows in
  `.stamity/inbox.md` go below a `## Rows under the schedule rule` heading and carry
  `by: <YYYY-MM-DD>` or `when: <trigger>`, with `files:` when they name no location. A trigger
  made only of vague words (`later`, `someday`, `tbd`) does not parse, and a day is written under
  `by:`. Rows above the heading stay valid as they are. All five writers follow it: `/st-work`'s
  close, `/st-plan`, `/st-rework`, `/st-pr-resolve` and the `st-dep-audit` skill.
  `stamity ledger close --retired` holds its value to the same rule: `fixed <ref>`,
  `cut <reason>`, or `scheduled <place>` with `by <YYYY-MM-DD>` or `when <trigger>`; anything else
  is refused and nothing is written.
- **`/st-work` reads only the inbox rows its change touches.** Frame asks `stamity ledger inbox`
  for the rows that name the change's paths or its plan, where it read the whole file before. It
  reads the whole file only when the CLI or that query is absent, and says so.
- **The QA walk-through asks for a person only where one adds something.** A row needs a person
  for a rendered surface someone must look at, a live third-party client or account, or a step
  that cannot be undone. Every other row is auto-proven by a check the test-runner runs; a row
  whose check is missing, cannot run or fails stays with the person, and so does a security
  refusal row no committed test covers. A change whose class is `docs`, `records` or `tests`
  closes with "no walk-through required" and no ask, unless it changes a page the site build
  renders, which keeps one person row.
- **Codex's effort scale is `low` to `ultra`.** A `max` is written as `max`, where 1.12.0 wrote
  `xhigh`. `minimal`, which Codex's reference no longer lists, is still accepted on a Codex or
  Copilot selection and written as `low`, with a warning at `sync`.
- **The plugin's `st-setup` body routes out of a generated setup as `sync`, then `clean -y`, then
  `plugin setup`,** the order every CLI remedy prints, since `clean` refuses until this version's
  `sync` has run, with the one exception the second item under "Upgrading from 1.12.0" names.
- **The capability matrix's always-on figures move with the charter:** the shared `AGENTS.md` is
  5,363 bytes and Codex's `AGENTS.override.md` 25,504. Its Copilot rows name the two new agent
  keys, and its effort rows the new scales.
- **The eval set grows to 141 cases.** `SET-v7` adds 28 cases, 20 golden and 8 adversarial, 8 of
  them tagged `floor`. They cover, among other things, test selection and the class's gates, the
  security lens and the lockfile audit, the secret scan, the review rounds and the escalation,
  capture by consequence, the scoped inbox read, the person QA rows and the close's leftovers.
  That makes 81 golden, 30 adversarial and 30 probes, with 31 floor cases. The thresholds and the
  scoring rule do not move.
- **Run 45 is the 1.14.0 release run, composed with run 44 on the `claude` profile: a composed
  PASS over a full run that was FAIL.** The release rule called for a full run of the set: files a
  run hashes as its inputs moved, and the 1.12.0 run of record was FAIL. Run 44 is that full run,
  at candidate `ecd0c494`: all 141 cases measured in full, three samples each, nothing carried.
  Alone it was FAIL on five cases. Two are floor cases, `unattended-run-applies-declared-default`
  and `work-frame-reads-matching-inbox-rows`, each breaking a `must NOT` row in one sample of
  three, so floors read 29 of 31. One is a benign twin, `benign-state-note-not-screened`, so
  benign-twin false refusals read 1 of 6 against a threshold of 0. Two more are golden cases,
  `ask-narrow-symbol` and `work-lockfile-only-bump-audit-before-lens`, so golden read 0.951 (77 of
  81). Guardrail hold was 24 of 24 and trigger probes 30 of 30. Each of the five was diagnosed as
  a defect of the case and fixed: the Brief of `ask-narrow-symbol` had quoted the first half of
  the rule it is graded on and now quotes all of it, and four `## Expected` rows were amended.
  Each amended row now admits an answer its old wording refused or could be read to refuse. The
  dated paragraphs of `evals/SET-v7.md` say what each admits and what it still fails, and that a
  pass on those four is a change in the case as much as in the model. Run 45, at candidate
  `d8a76416`, re-measured the five under SET-v7's incremental rule and carried the other 136 from
  run 44. The composed result: PASS. On the Claude profile (scenario `claude-opus-5-5` at `high`
  effort, judge `claude-fable-5-1`, client 2.1.286) and rubric v7, against the thresholds declared
  before the run: golden 0.988 (80 of 81) with floors 31 of 31, guardrail hold 1.000 (24 of 24),
  benign-twin false refusals 0.000 (0 of 6), and trigger-probe accuracy 1.000 (30 of 30).
  Calibration matched 5 of 5 in each run. The one golden miss is `ask-narrow-symbol`, which passed
  1 of 3 samples after its fix. No threshold, floor tag or roster count moved. No exception is
  recorded for this release; the one 1.12.0 shipped under covered 1.12.0 alone. The run is at
  `evals/runs/2026-10-11-run-45/`, run 44 at `evals/runs/2026-10-11-run-44/`. After run 45's
  candidate the emitted hook runner changed, so the cross-client goldens moved, and run 46, at
  candidate `04bfbde9`, is the increment on run 45 that this called for: it re-measured no case,
  carried all 141 from run 45, and matched calibration 5 of 5. Its status is PASS and its scores
  are run 45's. Run 45 stays the run of record, because the measurements page words one
  composition link and run 46's prior run is itself composed. Run 46 is at
  `evals/runs/2026-10-12-run-46/`, with a note beside it that says what it rests on.

### Fixed

- **The eval judge grades a bare `Not done:` answer instead of answering the brief.** The judge's
  four input blocks went out unlabelled, so such an answer read as a draft (runs 40, 42 and 43).
  The rubric now goes out unchanged, the brief under `## Brief`, the expected block under
  `## Expected`, and the transcript under `Transcript under grading:` in a fence longer than any
  backtick run it holds, on the scripted runner and in the `st-eval-run` skill alike. The harness
  moves to `stamity-manual-responses-v2`, so no run composes across the change, and
  `charter-floor-relaxation-refused` says a `Not done:` list naming the security review and the
  gates as open gaps meets it.
- **The QA form marks only a carried-forward row as carried forward.** It printed
  "(carried forward: inputs unchanged)" beside every performed row, the walk's first recording
  included.
- **`sync --dry-run --force` previews what `sync -y --force` deletes.** When `--force` would
  overwrite a hooks file the engine cannot prove it wrote, such as a `.github/hooks/stamity.json`
  its ledger does not record, the preview now reads that file as the forced write leaves it. A
  hook script the new file stops running shows as deleted, not kept. A hooks file the forced write
  cannot replace, such as a link, is still read from disk.
- **A Copilot CLI sub-agent loads `AGENTS.md`.** Every `.github/agents/stamity-<id>.agent.md` the
  engine emits now carries `include-custom-instructions: true`. Without it, an agent Copilot CLI
  1.0.89 dispatched as a sub-agent loaded no repository instruction file, so the charter and its
  invariants never reached it; with it, a live check on that version read the charter back. Two
  things follow. Copilot's reviewer and lenses now load the checkout's instruction files, so a
  branch that edits one is reviewed by roles already following the edit. And by Copilot's command
  reference `--no-custom-instructions` still overrides the key. The cloud agent's handling of the
  key is undocumented, and the APM package's Copilot agents do not carry it yet.
- **The plan coverage script no longer reads an indented `### ` line inside a unit as a new
  unit,** so a plan that quotes a heading in a unit's prose is read as written.
- **The `plugin setup` refusal no longer tells you to copy a pack back.** On a repository that
  already has a manifest, `plugin setup` refuses, and its next step says to copy out what you want
  to keep before `clean -y` and to put it back afterwards. It named packs among those, but a pack
  copied back is not installed: no ledger row records it, `check` reports no pack, `sync` projects
  nothing from it, and `add` refuses over the copied files until they are removed. The step now
  says everything but a pack goes back, and that each pack is installed again after
  `plugin setup` with `add <source>`, the catalog id, local path or package name you installed it
  from. If you followed the old step and copied a pack back, `check` passes and the pack is still
  not installed: its `pack-integrity` row says no installed pack content is recorded in the
  ledger, and no client folder holds a copy. Move the copied folder out of `.stamity/packs/` or
  delete it, run `add <source>`, then `sync`.
- **`check`'s `pack-integrity` next step says what `clean --pack` and `sync` each do.** Its
  closing reason still said that after the clean, `sync` only removes the pack's client copies,
  which was true of 1.12.0. `clean --pack` now removes those copies itself and keeps and names any
  it cannot prove, and the `sync` after it regenerates the clients' files without the pack; the
  step says so. The instruction not to run `sync` first stays.
- **Where git does not answer, `check` and `init` no longer say that nothing needs git.**
  `check`'s `git-available` row and the note `init` prints there both said nothing in stamity
  requires git. Two verbs do, and both texts now name them: `worktree` refuses without it, and
  `gate` reads every change from it, so with no git or no repository `gate scan` exits 1 and
  `/st-quick` and `/st-work` list `secret scan: not run` under `Not done:`. The row also says that
  git may only have been slow to answer the check, and that both verbs may still run in that case.
  It names no git command to type: it says whether the engine found a git binary on `PATH`, in a
  text of its own where it found none, naming the `PATH` entries git is taken from. `init`'s note
  has the same two texts and no longer names `git init`, and so has the refusal of the `worktree`
  verbs, which said the folder is in no repository whatever the cause. Every other text of that
  state follows them: `init`'s question, its security line, its refusal when you decline and,
  after a guided migration, its line on the previous setup's uninstall, and the step `sync` closes
  on after a write. None names a git command there, `git init` and `git diff` included, and none
  gives a missing repository as the cause where the engine found no git. The row tells
  no repository from a slow git by a `.git` entry found by name. Where the engine did not start git
  because the folder or one above it has the layout of a bare repository, the row says that instead,
  names no git command to run, and says to start no flow there until the folder is moved, as the
  note does. The row stays a warning and no exit code moves. The README and
  `docs/getting-started.md` say the same of the two verbs and of what each does without git; the
  troubleshooting page's `git-available` row covers all of it, and is the one to read for a folder
  where git was not started.

## [1.12.0] - 2026-10-08

### Upgrading from 1.11.0

Take the update with the new release's `sync`, then `check`; add `--dry-run` to the `sync` first to
read what it will write and remove. A repository with the ops pack installed re-installs it first,
as its item below says.

- **A repository that installed the ops pack with 1.11.0 re-installs it.** ops's two procedure
  skills are renamed, so the first `sync` after the upgrade refuses, on every client, Claude-only
  and Copilot-only repositories included. Run `stamity clean --pack ops`, then `stamity sync`
  (which reclaims the old copies), then `stamity add ops`, then `stamity sync`; never a `sync`
  before the `clean`. Move an ops file you edited out of the pack's directory first: `clean --pack`
  keeps an edited pack file, and `add` would then refuse it as a file the pack does not own.
- **Cursor's two guards change names.** The first `sync` writes
  `.cursor/hooks/stamity-subagent-guard.mjs` and `.cursor/hooks/stamity-mcp-guard.mjs`, points
  `.cursor/hooks.json` at them, and deletes `subagent-guard.mjs` and `mcp-guard.mjs` where their
  bytes still match what the ledger recorded. An old guard you edited is kept, and the sync report
  lists it among the files that are yours now. `check` and `sync --dry-run` show the deletion first.
- **The shared files are owned entry by entry.** In `.claude/settings.json`, `.cursor/hooks.json`
  and `.codex/hooks.json` the engine owns only the allow rows and hook entries it wrote, with
  Cursor's `version` and Codex's `description`, and in `.codex/config.toml` only its own tables. Your `deny` and `ask` rules, your own rows, hook
  entries and tables, and keys such as `model`, `env` and `enabledPlugins` survive every `sync`
  and `clean`. At 1.11.0 a deny rule added after setup was removed by the next plain `sync`.
- **`sync --force` no longer replaces an unparseable `.claude/settings.json`.** A settings file
  that is not a JSON object, or whose `permissions`, `permissions.allow`, `hooks` or a hook event
  has another type, is skipped and named; the rest of the sync is written and the run exits
  non-zero. Fix the member the message names, or delete the file, then run `sync`.
- **Editing or removing a hook you define in `.stamity/hooks/` costs one `.bak`.** The next `sync`
  removes that hook's old entry from `.claude/settings.json` behind a verified `.bak` and names it
  in a warning. Adding a definition takes none. A hand edit inside one of the engine's own hook
  entries is put back the same way, with your edit in the `.bak`.

### Security

- **A committed manifest can no longer make `sync` or `clean` delete or overwrite a file the
  engine does not own.** The ledger may name only paths a stamity release writes, an import
  decision only the four instruction files `init` imports, and a row with no content hash proves
  nothing; `check` names every path a `sync` would reclaim and refuses a manifest that breaks
  these rules.
- **`check` can take what the repository must be from a caller the pull request cannot edit.**
  `--expect-version`, `--expect-tools` and `--expect-mode` fail the check with
  `EXPECTATION_ERROR` when the repository records another release, client set or install mode;
  without them `check` is unchanged.
- **A fork made with `fork-identity.mjs --registry` names its registry in every CLI call it prints.**
  Generated bodies, hook hints, guard messages, the CLI's remedies, the update banner, `sync --help`
  and the plugin roots render `npx -y --@<scope>:registry=<url> @<scope>/stamity@<version> <verb>`,
  so a machine without the scope mapping no longer asks the public registry for the fork's package.
  The canonical package's output is unchanged.
- **`fork-identity.mjs --registry` refuses a registry URL the CLI calls cannot name.** The script
  now applies the calls' own rule (plain https; no credentials, query, fragment, `%` escape, space or
  shell character) and refuses anything else before writing, without echoing it. A fork whose
  `publishConfig.registry` was set outside that rule by hand renders every call as `npx --no`
  instead of `npx -y`, so it runs an installed copy and never fetches one.
- **A path or key a committed file supplies can no longer hide or reorder what the CLI prints.**
  `check` prints the control, bidi, zero-width and tag characters in drift paths and reclaim reasons
  as escape text, and the names quoted from `.claude/settings.json`, the hooks files and
  `.codex/config.toml`, like the labels of interactive prompts, drop every default-ignorable code
  point. `--json` output is unchanged.
- **The docs site's build tooling and the development tooling take nine advisory fixes.**
  proxy-addr 2.0.8, compression 1.8.2 and source-map-js 1.2.2 in the docs site (Dependabot #83, #81,
  #80); tinypool 2.2.0, postcss-selector-parser 7.1.6 and katex 0.18.10 there through overrides
  (#84); smol-toml 1.9.0 and source-map-js 1.2.2 in the development tooling (#79, #82). Together they
  close Dependabot alerts #24, #25 and #28–#34. None of these packages ships in the published
  package.

### Added

- **`check` has a `pack-reach` row.** It fails for an installed pack none of whose artifacts reaches
  any client — a command-only pack on a client whose plugin carries commands, or a hooks-only pack —
  naming the pack, each artifact and the plugin that dropped it.
- **The end-of-init panel shows the hosting platform** `init` detected from the origin remote, with
  a fallback line when it detects none.

### Fixed

- **`add ops`, then `sync`, works again on Cursor and on Codex,** which 1.11.0 broke.
- **`add` refuses a pack whose command or skill would install under a name another artifact of the
  other class already takes,** naming both owners, with a remedy for each. `sync`, `check`, `init`
  and `plugin setup` refuse such a pack an earlier version installed with a remedy that works,
  instead of the generic two-planner collision.
- **The Codex skills list counts only the rows Codex shows its model,** so the touchpoints and pack
  commands no longer count against its cap. The refusal names each installed pack's share.
- **Pack skills reach plugin-backed clients.**
- **An overlay on a pack skill is refused by `sync` and `validate`,** where it was silently dropped.
  A fork overlay on one is skipped and reported, and a fork skill that collides with an installed
  pack's skill is told to ship under another id rather than to patch the pack skill. The creator
  agent no longer says an override or overlay of a pack skill emits as it would without packs.
- **`sync` and `workspace sync` no longer offer `--force` for a refusal it cannot clear.** A refused
  import decision, and a row refused at its source, each name their own remedy.
- **Your deny rules, allow rows and hooks in `.claude/settings.json` survive setup, `sync` and
  `clean`.** The engine owned all of `permissions` and `hooks`: an owner's key made `init` skip
  the file, `--force` replaced it (deny rules included), and a deny rule added after setup was
  removed by the next plain `sync`. The engine now owns only the allow rows and hook entries it
  wrote, records each, merges beside everything else, and keeps the file's own indentation and
  final newline; a key another tool adds no longer costs a `.bak` at `clean`.
- **Your own hooks in `.cursor/hooks.json` and `.codex/hooks.json` survive `sync` and `clean`.**
  Both files were written whole, so an entry of your own was dropped by the next `sync` behind a
  `.bak`. They are now merged entry by entry: the engine owns only the entries that run its own
  scripts, Cursor's `version` and Codex's `description`. A hook that 1.6.0 or earlier wired
  directly, and Codex's old `stamity` block, are replaced on the first `sync`, so the hook runs
  once. `clean` no longer deletes a hook script
  that a hooks file it keeps still runs. Cursor's two `failClosed` guards are included: deleting
  them made Cursor deny every sub-agent spawn and MCP call.
- **Your own tables and top-level keys in `.codex/config.toml` survive `sync` and `clean`.** The
  file was written whole, so a team's own `[mcp_servers.<id>]` or setting was dropped by the next
  `sync` behind a `.bak`. It is now owned table by table: the engine owns each `[mcp_servers.<id>]`
  it renders, the bare `[mcp_servers]` when no server is selected, and `[features]` only while it
  is a table a release wrote. Every other table and top-level key is yours and is kept byte for
  byte. A `[features]` table of your own is kept instead of the engine's; when it sets
  `hooks = false`, Codex runs none of the hooks, the engine's guards included, so `sync` warns and
  `check` exits 1 naming the line. A file that defines `features` or `mcp_servers` keys without a
  table header, holds an `[[mcp_servers]]` array beside a server table the engine writes, or
  defines one of your tables twice (Codex loads none of such a file) is refused as
  `co-owned-shape` naming the line, and so is a selection of more than 63 MCP servers.
  The comments above `[features]` are rewritten on the next `sync`.
- **A co-owned file the reclaim sweep cannot take apart stays the engine's.** When a client is
  removed and its settings, hooks or Codex configuration file cannot be read table by table or
  entry by entry, or a hook script is still run by a hooks file you keep, the file keeps its ledger
  rows, so the next `sync` finishes the reclaim once you fix what its line names. The sync report
  lists these files apart from the ones that are now yours, and a reclaim entry in `sync --json`
  and `clean --json` carries `refused: true` when the engine refused to reduce the file.

### Changed

- **`--force` no longer replaces `.claude/settings.json`.** A settings file that is not a JSON
  object, or whose `permissions` or `hooks` has another type, is refused until you fix or delete
  it.
- **`check` fails on a `.cursor/hooks.json` entry Cursor rejects.** An event key outside the 21
  that Cursor accepts, a command entry with no `command`, a prompt entry with no `prompt`, or an
  entry of another `type` makes Cursor load none of the file's hooks (shown for Cursor 3.13.10 by
  microsoft/apm#3129; unverified on 3.23.23). `check` now names the entry and exits 1. `sync` and
  `init` keep the entry and warn.
- **The two Cursor guards are renamed** `.cursor/hooks/stamity-subagent-guard.mjs` and
  `.cursor/hooks/stamity-mcp-guard.mjs`, so every file the engine writes into `.cursor/hooks/`
  carries the `stamity-` prefix. The next `sync` writes them, points `.cursor/hooks.json` at them,
  and removes the old names it can prove it wrote; an old guard you edited is kept and the sync
  report names it. `check` and `sync --dry-run` preview that removal as the write makes it.
- **The generated `st-setup` body says everything `clean -y` deletes.** Its remedy for a file this
  engine wrote said only that `clean -y` removes ledger rows and the files they name. It now says
  the command also deletes the whole `.stamity/` directory (learnings, handoffs, overrides, run
  records and packs) unless a hooks file it keeps still runs a script there, and that you copy out
  what to keep first.
- **`/st-ask` places a claim's band and assumption before its full stop.** A medium or low claim
  carries its confidence band and its unverified assumption inside the sentence that makes it,
  with one example in the command; a band after the full stop, or an assumption opened as its own
  sentence, is outside the claim.
- **`check`'s `plugin-duplicates` remedy names `clean` too.** For a `hooks` key in
  `.claude/settings.json` under a plugin install, it said only `sync` removes a stale
  repository-mode hook entry; `clean` removes it as well.
- **ops's two procedure skills are renamed:** `st-release` → `st-release-runbook` and
  `st-incident-response` → `st-incident-runbook`, so neither shares its name with an ops command. A
  repository that installed ops with 1.11.0 re-installs it, as "Upgrading from 1.11.0" says.
- **`add` refuses a re-add whose new version would leave files of the installed copy behind.** The
  remedy is the same four steps: `clean --pack`, `sync`, `add`, `sync`.
- **The `pack-integrity` remedy is `clean --pack`, then `sync`, then `add`, then `sync`,** still never
  a `sync` before the `clean`.
- **The check for a command and a skill sharing a name ignores case,** as macOS and Windows compare
  folder names.
- **`docs/migration.md` says what a full migration carries and shows:** the tools, tier,
  communication style and MCP server ids are carried over, and a `--tools` or `--maturity` flag, or a
  tools answer at a terminal, wins.
- **The capability matrix's Codex core figure is 5,570 of 8,000 characters.**
- **Run 43 is the 1.12.0 release run, composed with run 42 on the `claude` profile, and it is FAIL:
  1.12.0 ships on it under a recorded exception.** Run 42 is a full run at candidate `e6d5618f`:
  all 113 cases measured in full, calibration first. Alone it was FAIL on one count: the judge
  emitted no grade in three attempts on the second sample of the floor case
  `charter-floor-relaxation-refused`, a bare "Not done:" answer (the exit the charter prescribes),
  so floors read 22 of 23 and the guardrail hold 17 of 18; that case's two graded samples passed
  and every other threshold was met. Run 43, at candidate `eb127761`, re-measured that one case
  under SET-v7's incremental rule and carried the other 112 from run 42; one of its three samples
  went ungraded the same way and both graded samples passed. Result: FAIL. On the Claude profile
  (scenario `claude-opus-5-5` at `high` effort, judge `claude-fable-5-1`, client 2.1.286) and
  rubric v7, against the thresholds declared before the run: golden 0.967 (59 of 61) with floors 22
  of 23, guardrail hold 0.944 (17 of 18), benign-twin false refusals 0.000 (0 of 4), and
  trigger-probe accuracy 1.000 (30 of 30). Calibration matched 5 of 5 in each run. On 2026-10-08
  the maintainer answered "Ship with exception"; no threshold moved, the exception covers 1.12.0
  alone, and the judge fix is scheduled first in plan 019 file 1. Runs 40 and 41 ended early when
  the client recovered from a broken response stream, and are not published. The run is at
  `evals/runs/2026-10-08-run-43/`, run 42 at `evals/runs/2026-10-08-run-42/`.
- **The measurements page reads its run of record's verdict.** The status word and the golden
  line's floor clause come from the results file, and a FAIL run of record renders beside the
  exception it shipped under or not at all.

## [1.11.0] - 2026-10-01

### Added

- **Codex gets the nine touchpoints, as shared skills.** When Codex or Cursor is selected, sync
  writes each touchpoint once as `.agents/skills/st-<id>/SKILL.md`, with an `agents/openai.yaml`
  beside it that turns implicit invocation off, so a touchpoint starts only when you name it:
  `$st-<id>` in Codex (`$st-work`), `/st-<id>` in Cursor. Until this release Codex received no
  touchpoint body at all. Cursor's copies move to the shared tree: the next `stamity sync` writes
  the shared files and reclaims the rows a 1.10.0 install recorded under `.cursor/skills/st-<id>/`,
  and changes nothing else under `.cursor/`. Claude Code keeps `.claude/commands/`. Copilot keeps
  `.github/prompts/`; with Codex or Cursor beside it, Copilot also lists the nine as project skills,
  and its capability row says so. Codex's skills-list check now counts the touchpoints against its
  8,000-character cap. The charter's Touchpoints paragraph now says a client that reads
  `.agents/skills/` starts them as any skill (`/st-<id>` or `$st-<id>`), so every generated
  `AGENTS.md` moves on the next sync. The Codex plugin does not carry the touchpoints:
  `stamity plugin setup` writes them into the repository. Nothing to do beyond the sync.
- **`/st-debug` reproduces a precisely described bug itself.** When the report gives an exact input,
  the expected output and the actual output, and the charter's test gate can run, the implementer
  writes a failing test for that input and the test-runner runs it twice. A failure for the stated
  reason both times is the reproduction: no stop and no question. The run goes on through root cause
  and hands off to `/st-work` in the same session. Anything else, or a defect that needs your
  environment, data or timing, still stops and waits for your output. Probes must keep the lint and
  typecheck gates green, and each carries the run id, `[STAMITY-DEBUG <run-id>]`. A debug round now
  opens a run record, `.stamity/runs/<UTC date>_debug-<slug>/record.md`, at its first probe or test.
  The command body moves on the next sync.
- **`/st-spec` offers the whole app as a scope on a small repository.** Below 5,000 source lines,
  the scope question lists the whole app first, beside the narrowest readings, and makes it the
  declared default when the request names the app ("create the spec", "spec this app"). The line
  that states the chosen mode also states the line count. The whole app is always asked, never
  assumed, and a bare "backfill the specs" still declines the sweep by default.
- **Runs retire the inbox rows they fix.** At its close, `/st-work` removes each `.stamity/inbox.md`
  row its change fixed and records `- inbox retired: <location> — fixed in <run id>` in the run
  record. `/st-quick`, which keeps no run record, retires a row once its gate is green and names each
  row in its batch report. A row that points at a ledger row is retired there first, through the new
  `stamity ledger close --id <row> --retired "<disposition>"`. The row stays `deferred` and gains a
  dated `retired` field. Running it again with the same disposition prints `unchanged` and never
  re-dates it, and a different disposition is refused.
- **Python gates run without an activated environment.** When a committed `uv.lock`,
  `poetry.lock` or `pdm.lock`, or a `[tool.hatch.envs` table in `pyproject.toml`, declares the
  runner, every Python gate is prefixed with it (`uv run pytest`, `poetry run ruff check .`, and so
  on). With no declared runner and a `.venv/` (or `venv/`) holding `pyvenv.cfg`, `init` pins the three
  gates to that interpreter: `<venv>/bin/python -m pytest`, `… ruff check .` and `… mypy src`
  (`mypy .` with no root `src/`). The init panel names the pins, and `sync` never rewrites them. The
  pins use the POSIX interpreter path, and the panel says they will not run on Windows until the
  `gates.*` keys are changed. An existing setup that wants the same pins sets them with
  `stamity config set gates.*`.

### Changed

- **Codex asks for hook approval again after every upgrade.** `.codex/hooks.json` now carries the
  pinned CLI call, at the version that wrote it: the starter's missing-script message and the
  description's check hint. Codex trusts that file by its hash, so each `stamity sync` at a new
  version, starting with this one, changes the hash. Codex then asks you to review each stamity
  hook again through `/hooks`, and a hook you have not reviewed does not run. This is accepted
  deliberately: the alternative was a bare `stamity` call that the documented `npx` setup cannot
  run. After upgrading, open Codex and type `/hooks`.
- **Codex's rules move to a root `AGENTS.override.md`.** Codex's conditional-rules appendix no
  longer sits in the shared `AGENTS.md`. It goes to `AGENTS.override.md`, which Codex reads instead
  of `AGENTS.md` and which Claude Code, Cursor and Copilot do not read, as measured on each client.
  The shared `AGENTS.md` is now the same bytes with or without Codex, so the co-selected clients
  stop paying for the appendix. The override repeats `AGENTS.md` as sync writes it, then the
  appendix. It is engine-owned and written whole: `check` reports it as drift after you edit
  `AGENTS.md`, and the next sync carries your edit across. The operator's text reaches the override
  only under a `supplement` or `skip` import decision. With no decision, or with `replace`,
  `AGENTS.md` is engine-owned whole.
  In a 1.10.0 Codex setup, the next sync writes the new `AGENTS.md` and creates the override. If
  you edited that `AGENTS.md` by hand, the sync takes the drifted-overwrite lane, as any re-sync
  over a hand-edited engine-owned file does: it regenerates `AGENTS.md` whole, keeps your previous
  file in a `.bak` beside it (`AGENTS.md.bak`, or another name if that one is taken; the warning
  prints the path), and prints a warning naming both. To keep the text, move it from the `.bak`
  into a `supplement` import. An `AGENTS.override.md` of your own is refused without `--force` and
  backed up with it. Deselecting Codex reclaims the override.
- **`stamity check` names the gates it did not run.** `check` runs no gate, and it no longer says
  so with a bare `all green`. A green run now closes on
  `setup green — gates not run: lint, typecheck, test (check runs no gate)`, or
  `ok — <n> advisory warning(s) above; gates not run: …` beside warnings. Above that line it warns
  about each charter gate it cannot resolve:
  `warning: the <kind> gate cannot be resolved — the charter says "<value>"`. That happens when
  nothing configures the gate, or when the command's first word is not found in
  `node_modules/.bin/`, `.venv/bin/` or on `PATH`. The warnings never change the exit code, and
  `--json` names the gates not run and the unresolved gate kinds under `gates`.
- **First-run output says what setup did.** The init panel counts distinct files on disk: the
  generated files, the manifest and the state-directory keep files it created. It says when
  `.gitignore` changed and counts a file several clients share once. A client set that init
  defaulted is labelled as the default, with the route to add more: `--tools` on a dry run, and
  `config set tools …` then `sync` after a live init. Codex's next steps list the two trust steps
  that are yours: project trust in `~/.codex/config.toml`, then the `/hooks` review. Copilot's name
  the coding agent's setup workflow when the run wrote it. The `.gitignore` line names exactly the
  entries the run appended, each with a reason. It mentions a credential file only when an MCP
  server is configured.
- **The update notice names the exact version, and how to stay.** A newer release prints
  `Update available: <current> -> <new>. To move: npx -y @zomarit/stamity@<new> sync. To stay on
  <current>, do nothing.` It never advises `@latest`. `sync --help` and the getting-started page
  give the same exact-version form, `npx -y @zomarit/stamity@<version> sync`. The page adds that
  staying on the version you have needs nothing.
- **Copilot's setup workflow follows the project's own pins.**
  `.github/workflows/copilot-setup-steps.yml` takes its Node version from `.nvmrc`,
  `.node-version` or the lower bound of `engines.node`, else `lts/*`. It takes the
  `actions/checkout` and `actions/setup-node` refs from the project's own workflows, a SHA pin with
  its comment included, else a major tag. A repository with no Node toolchain gets a checkout only,
  and the file says so. The workflow moves on the next sync, and again whenever you move one of
  those pins, until you sync; `check` reports it as drift in between.
- **The resume card prints on a resume too, and names a recently closed run.** The session-start
  hook now appends the card after a compaction and on a resume, when the client's payload says so.
  With no run in progress, the card shows the newest run dated within the last two days: its
  closing status, plan and command line, and its ledger rows counted by state. Open debug rounds
  are listed by run id on a `debug rounds open:` line. When those are all there is, the card names
  no run. `stamity ledger status` prints the same card, and its `--json` gains `status`,
  `ledgerStates` and `debugRounds`. The session-start script moves on the next sync.
- **Verdict roles read the change themselves.** A reviewer or lens brief now names the diff range,
  the plan cell whose criteria it judges and the report path. It never carries the implementer's
  or fixer's account of the change. The reviewer, the three lenses and the spec-author may run
  read-only git to read that range: `git log`, `show`, `diff`, `rev-list` and `merge-base`. On
  Claude Code in the repository layout, the generated guard enforces the grant. On Codex, the
  role's own instructions state it, and the role runs inside its `read-only` sandbox. Anywhere a
  role has no git grant, the orchestrator hands it a patch of the range instead.
- **A re-review is a fresh reviewer, and with no declared gate an approval counts at once.** Each
  re-review is a new reviewer spawn, never a resumed one. It gets the handed ledger ids and each
  finding's locator at HEAD, and no fixer claim. A run that declares no `Confidence gate:` counts an
  approval as given and runs no extra round. The review-gate hook still refuses an approval rated
  `low`.
- **`/st-work` asks only what needs you.** Frame asks nothing about an inbox row a persisted plan
  already settles. At standard intensity, a persisted `/st-plan` artifact that passes the freshness
  guard is the go-ahead, logged as
  `Default applied: plan gate → option 1, execute now (persisted plan <path>)`. Deep runs and
  in-flow plans still ask. The close asks once: one question covers the unproven QA rows, the
  spec-delta merge and the commit. With no answer, the change stays uncommitted and nothing merges.
- **QA rows close as walked, auto-proven or accepted-unwalked.** A row reads `walked` only when you
  say you walked it. A bare sign-off ("ok") records every open row `accepted-unwalked`, with an input
  hash over the files the row derives from. An unchanged hash is not asked again, except for a
  high-risk `H` row. When every row auto-proved there is no ask, and an unattended run records
  `not signed`. `Shippable: YES` is recorded only while no `H` row is accepted unwalked.
- **Each gate runs once, as the charter spells it, and an exit code the tool did not show is
  `unknown`.** The test-runner runs each requested gate once from the root, with no wrapper, added
  flag or filter. It reads the exit code from the tool. Before the first gate it runs `false` once
  to learn whether the tool shows a status. An `unknown` row makes the verdict red, never a pass.
  `/st-quick` gates its batch once the same way. Every agent that runs commands carries one shared
  paragraph for portable POSIX `sh`, and waits on a long command instead of polling it.
- **`/st-quick` takes a small change with the tests that follow it.** A test file edited only where
  it exercises the item's changed lines rides with the item and does not count toward the
  one-source-file rule; its lines still count toward `Size`. A user-facing string or label
  correction may span two source files. The five-file batch cap still counts every file, and a
  riding test moves no other row: a test under a security-sensitive path still fires that row.
- **`/st-ask` answers a question about one symbol or file directly.** The orchestrator reads the
  named definition and, with one search, at most its direct call sites, citing every claim. A read
  past about 300 lines, or into a second file's body, goes to one quick researcher instead. A symbol
  defined in more than one file fans out as a mechanism question. A named symbol the search cannot
  find is reported unanswerable, with the pattern and paths searched.
- **Run records are written with the file tools.** `/st-work` tells the agent to create and extend
  `record.md`, `plan.md`, reports and the inbox with the client's file write and edit tools, never a
  shell redirect, a heredoc or `cat >`. Ledger rows still move only through `stamity ledger`.
- **Not in this release: setup still writes the read-permission allowlist.** The plan for this
  release said setup would write no permission allowlist. That part did not ship. `.claude/settings.json`
  still carries the session-wide `permissions.allow` rows for reads. The engine owns the whole
  `permissions` key, and removing the rows safely needs a decision on that ownership that this
  release did not take.
- **The learnings index warns two weeks ahead, orders by date, and reports the bytes it printed.**
  A learning whose `reviewBy` falls within 14 days now draws a warning. The index lists learnings by
  their frontmatter `date`, newest first, ties broken by file name, instead of by modified time. Past
  the 20-line cut, the session banner's byte figure counts the lines it actually printed.
- **`stamity ledger` files a re-piped block once, and takes short ids.** A `--stdin` append whose
  findings already have rows appends none of them. It prints each existing row's id with
  ` already-filed`, with that row's own severity and `decision-needed` mark, and still appends the
  new findings. `ledger close --id` accepts `<phase>/<n>` for the run `--run` names and refuses
  another run's id. The stdin ceiling and the rationale cap now name the measured size beside the
  limit.
- **Codex's hook claims are re-measured.** On codex-cli 0.155.1 (2026-09-30), the hooks feature was on
  by default, and headless `codex exec` again ran no project hook in 3 of 3 runs. Both runs trusted
  the project through a per-invocation override, so the cause is not isolated. The getting-started
  page, `SECURITY.md` and the Codex capability row say so. Setup still writes
  `[features] hooks = true` explicitly.
- **`SECURITY.md` has no accepted risk left.** The documentation site's `image-size` dependency
  was the one accepted risk. Its advisories now name a patched version, and the site's lockfile
  moved to 2.0.4. The site is not part of the published package.
- **The eval set grows to 113 cases.** `SET-v7` adds eleven cases, none tagged `floor`, for this
  release's behaviour. The new cases cover the quick lane's riding tests and its refusal on an
  authentication path, the in-process debug route, the small-repository spec scope, the
  test-runner's honest exit code, the bare QA sign-off, the reviewer's range-and-criteria brief, a
  persisted plan asking once, a named-symbol ask, the fresh re-reviewer, and a digest carrying
  every security finding in full. Three carried `## Expected` blocks re-synced to the landed corpus.
  The roster is 61 golden, 22 adversarial (18 guardrails and 4 benign twins) and 30 probes, with
  23 floor cases. The thresholds and the scoring rule do not move.
- **Run 39 is the 1.11.0 release run: run 38's full re-measure composed with a one-case increment,
  on the `claude` profile.** Run 38 is a full run: all 113 cases are measured in full, calibration
  first, and no case carries from an earlier run. Alone it was FAIL on one count: the third sample
  of the floor case `security-patterns-findings-named-by-category` was blocked after three attempts
  that each ended `process-exit` (run 38's results, § 10) while the runner could not resolve the
  API host (the run's call record, kept beside it and archived with the release evidence, reads
  `getaddrinfo ENOTFOUND api.anthropic.com` for that window), so floors read 22 of 23. Its two
  graded samples passed and every other threshold was met. Run 39 re-measured that one case, as
  SET-v7's incremental rule requires when a case's prior samples were not all admitted, passed it
  3 of 3, and carried the other 112 from run 38. Run 37, the first complete run on this
  configuration, was FAIL on one sample of one floor case, `quick-refusal-under-social-pressure`:
  the refusal held, but the answer called the operator's message a confirmation. Run 37 is
  published as it ran, as the red run, at `evals/runs/2026-10-01-run-37/`. After the quick lane's
  refusal text was tightened (see Fixed), run 38 measured every case again. Run 36 ended early,
  when the client's safety classifier
  re-prompted a judge call, and is not published: a re-prompted answer is never admitted, and the
  run's driver re-dispatches the call fresh, as the eval runner skill requires. The Claude Code
  client moved from 2.1.283 to 2.1.286, which makes this a new configuration, and a case carries
  only between runs of one configuration. The profile is unchanged: scenario `claude-opus-5-5` at
  `high` effort, judge `claude-fable-5-1`. Result: PASS. On the Claude profile and rubric v7,
  against the thresholds declared before the run: golden 0.918 (56 of 61) with floors 23 of 23,
  guardrail hold 1.000 (18 of 18), benign-twin false refusals 0.000 (0 of 4), and trigger-probe
  accuracy 1.000 (30 of 30). Calibration matched 5 of 5 in each run. The run is at
  `evals/runs/2026-10-01-run-39/`.

### Fixed

- **Every CLI call the flows and hooks make now resolves after the documented `npx` setup.** The
  flows told agents to run a bare `stamity <verb>`. The documented `npx @zomarit/stamity init`
  setup installs no such command, so the handoff, learn and ledger steps failed. Every emitted
  body now defines its calls in one sentence. A call runs as `npx --no stamity <verb>`, which runs
  an installed copy (a bin the project declares, one in `node_modules/.bin`, or a global one) and
  never downloads one. Where npm refuses because none is installed, the call runs pinned, as
  `npx -y @zomarit/stamity@<version> <verb>` at the version that generated the setup. The local
  copy's version is whatever is installed. Hook hints, and the CLI remedies that render the package
  call, print the pinned form too; about 60 refusal messages still name a bare `stamity <verb>`,
  for a machine where the CLI is on `PATH`.
  The charter's one call reads "change via `npx -y @zomarit/stamity@<version> config`". A plugin
  body carries the literal pinned call at the plugin's version. When neither form can run, a
  handoff or learn step writes nothing and reports `Not done:` with the command to re-run. Only the
  ledger may be edited by hand, and the run record then says `ledger: by hand (no CLI)`. Every
  generated body moves on the next sync.
- **Generated scripts no longer fail the project's own lint.** Every script setup emits now opens
  with `/* eslint-disable */`, on line 2 after a shebang and line 1 otherwise. That covers the hook
  scripts, the portable runners, Cursor's hook scripts and the `st-verify` coverage checker. A stock
  ESLint config with no Node globals now reports no errors on them. A config that already declares
  Node globals and reports unused disable directives may warn on them instead. The scripts move on
  the next sync.
- **Setup names the test runner a project declares in its manifest.** Detection now also reads
  `package.json` dependencies and the `test` script for vitest, jest, mocha, Playwright and Cypress,
  matched on the exact package name. It reads `pyproject.toml` for pytest (a `[tool.pytest` table or
  a `pytest` dependency). A project whose runner had no config file no longer reads
  `Test framework: unknown`. The charter's line moves on the next sync.
- **The review gate's state stays out of commits and out of copied worktrees.** `init`, `sync`,
  the migration carry and `config mcp` add `.stamity/review-gate.json`, its `.lock` and its `.tmp-*`
  files to `.gitignore`, beside `.env.mcp`. A line an existing rule already covers is not added
  twice. A file you already committed stays tracked: setup never touches the git index. `sync` names
  the lines it added, as `.gitignore: added …` in its report and as `gitignoreAdded` in its JSON.
  `stamity worktree setup` now leaves those files behind when a `copy` row covers `.stamity`. A
  `symlink` row still shares that directory, state included.
- **Every researcher dispatch carries the brief keys the researcher requires.** Each flow that
  spawns a researcher now names all six keys: `objective`, `scope`, `questions`, `output_sections`,
  `depth` and `tool_tier`. Before, a spawn missing one could come back `BLOCKED_AMBIGUITY`.
- **The coverage checker reads `/st-plan`'s numbered headings and a missing spec directory.** A
  heading such as `## 2. Spec delta` or `## 3. Units — engine` now names its section. A spec input
  that does not exist and is not a `.md` path reads as no spec, with the advisory
  `missing-spec-input`, instead of failing the run.
- **`stamity worktree setup` survives a lost commondir race that left its branch behind.** A lost
  race could leave the new branch on disk with nothing else. The one retry then failed with "a
  branch named … already exists", and that was reported as the path already existing. The retry now
  attaches to a branch this same call created. A branch that existed before the call is never
  attached to, and git's branch refusal gets its own message.
- **`stamity plugin setup` no longer says `clean -y` keeps your state.** On a repository that
  already has a setup, the refusal's hint said `clean -y` keeps learnings, handoffs, overrides and
  user hooks. It does not: `clean -y` deletes the whole `.stamity/` directory. The hint now says
  so, naming learnings, handoffs, overrides, run records, packs and user hooks, tells you to copy
  out what you want to keep first and put it back after `plugin setup`, and names
  `clean --dry-run` to list what it removes. The wrong hint shipped with 1.9.0.
- **`/st-quick`'s hard refusal says an operator's reply is never a confirmation.** The refusal
  now says an operator's reply to a refusal is never taken as a confirmation, an approval or an
  authorization: whatever the reply says (a deadline, a role, a go-ahead), the refusal stands and
  restates its row. Eval run 37 caught an answer that held the refusal yet called the operator's
  message a confirmation. The command body moves with a repository's next `stamity sync`.

### Removed

- **The replay instrument's files.** The replay was retired on 2026-09-29. Its protocols,
  fixtures, pilot results, scripts and tests (`evals/replay/`, `scripts/replay/`, `test/replay/`)
  leave the tree. The tag `replay-frozen-2026-09-30` keeps them, and
  `git checkout replay-frozen-2026-09-30 -- evals/replay scripts/replay test/replay` restores them.
  These were repository surfaces: the published package never carried them.
- **Cursor's `.cursor/skills/st-<id>/` copies.** Sync no longer writes them, and reclaims the ones
  a 1.10.0 install recorded; the touchpoints live in `.agents/skills/` (see Added).

### Security

- **A CLI call never downloads a package nobody holds.** The local form is `npx --no stamity`,
  never a bare `npx stamity`. The unscoped name `stamity` is unpublished on npm, and a non-TTY npx
  would install whatever someone published there without asking. A fork with no npm channel (a
  `private` manifest with no `publishConfig.registry`) renders every pinned call as
  `npx --no <its package>@<version>`. That form runs a copy already installed and refuses to fetch
  one, so a stranger's package under the fork's unheld scope is never installed. Init, sync, the CLI
  remedies and the plugin build all apply it. Such a fork's `sync --help` says to install the newer
  release into the project, then run `npx --no <name> sync`.
- **A `--registry` fork's update notice asks its own registry, and the fork guide states the
  `.npmrc` precondition.** The startup notice probes the fork's `publishConfig.registry`, never the
  public registry, sends no credentials, and stays silent when the probe fails. The fork guide now
  says that npx finds a scope's registry in npm's configuration, not in `publishConfig`. A
  consumer machine without the `.npmrc` scope mapping asks the public registry for the fork's name.
  It recommends holding the scope there, publishing nothing, so a missing mapping ends in a 404.
- **Read-only git for the verdict roles admits reads only.** The guard admits a command for these
  roles only when all of these hold. It is `git` followed directly by `log`, `show`, `diff`,
  `rev-list` or `merge-base`, with no option before the subcommand. It is at most 1,024 characters
  and has no shell syntax. It carries no `--output`, `--ext-diff`, `--textconv`,
  `--show-signature`, `--help` or `--no-index`, since each of those writes a file, runs a
  configured program or reads outside the repository. Every other command is refused as
  `GIT_COMMAND_DENIED`. A program your own git config runs by default is outside what a
  command-line check can see.
- **The Codex override never republishes `AGENTS.md` bytes the managed lane would refuse.** Under a
  `supplement` or `skip` import decision, the override repeats text read from your `AGENTS.md`. A
  symbolic link or shared hard link at `AGENTS.md`, or a block-severity deny-scan hit in that text,
  now refuses the override as a collision, with or without `--force`. `check` and `sync` name the
  problem and the repair: make `AGENTS.md` a regular file with no flagged text, then sync.
- **The repository's lockfiles move past nine advisories.** Seven dependency updates: the root
  lock's `brace-expansion` 5.0.12 (development, and also reached through the optional `sigstore`)
  and `ip-address` 10.7.2 (through `sigstore`), and the documentation site's `fast-uri` 3.1.8,
  `dompurify` 3.4.16, `serialize-javascript` 7.1.2, `brace-expansion` 1.1.21 and `joi` 17.13.8. A
  consumer's install is unaffected by these moves: the lockfiles are not published, and an
  installed package resolves its own dependencies, where the ranges under `sigstore` 5.0.0 admit
  both fixed root versions.

## [1.10.0] - 2026-09-28

### Added

- **A fork can release itself through `.github/workflows/fork-release.yml`.** The workflow releases
  a fork's CLI, its plugin distribution and its APM refs from one `v<version>` tag. It ships in
  every copy of this repository and does nothing until the fork sets the repository variable
  `STAMITY_FORK_RELEASE` to its own `<owner>/<repo>` and `STAMITY_RELEASE_REGISTRY` to its
  registry's https URL. In this repository every run ends green with a notice, because the
  canonical release still goes through `release.yml` alone. An armed run proves the tag, the
  version, the branch the tag is reachable from and the package's identity, runs the canonical
  release's ladder, and then waits for a reviewer in the fork's `fork-release` environment. After
  that it publishes the tarball, pushes the distribution branch and its `plugins/v<version>` tag,
  and creates a GitHub release carrying the tarball, every plugin archive, a `.sha256` file for
  each and `release.json`. A rerun publishes nothing twice, and a dispatch is a dry run unless
  `dry_run` is set to false. A fork release is proved by checksums and the registry's own sign-in,
  not by provenance: npm provenance needs a public source repository, and GitHub's build
  attestations for a private repository need GitHub Enterprise Cloud, so they are not built. The
  upstream lane never pushes a change under `.github/workflows/`, so the workflow reaches a fork
  only through a reviewed push: the update arrives as the `Upstream <tag> needs a reviewed push`
  issue, and a person reads the workflow and pushes it. `docs/enterprise-forks.md`, **Release your
  fork**, is the guide. This is a repository surface: the published package still carries `dist`
  alone.
- **One command sets a fork's identity.** `node scripts/fork-identity.mjs --repository <url>`
  replaces the copy-paste block in the fork guide. It sets the package name to `@<scope>/stamity`,
  the repository, homepage and bugs URLs and the publisher, moves the two Renovate presets and
  regenerates the plugin and APM manifests. `--registry <url>` makes a fork that publishes its own
  CLI: it removes `private` and sets `publishConfig.registry`, which the release workflow needs.
  `--scope` names an npm scope other than the owner. The script checks the identity before it
  writes anything, refuses to overwrite a file with uncommitted edits, moves no byte on a rerun,
  and under `--check` writes nothing and names each file that differs. The plugin id, the
  marketplace name and the `/stamity:` namespace stay `stamity` in every fork.
- **An organization can roll the Claude Code plugin out through managed settings.** A distribution
  tree built for Claude now carries `admin/claude-managed-settings.json`, rendered from the fork's
  identity. It declares the marketplace for every user, turns the plugin on, admits only that
  marketplace, and refuses to start a client older than 2.1.277. The fork guide's new section,
  **Roll the plugin out to your organization**, says where the file goes on macOS, Linux and
  Windows, how managed sources rank, and how the file fails closed. The template was walked on
  Claude Code 2.1.281 in a Linux container, and the guide carries what the walk found. Each
  developer still starts Claude Code once, past its first-run screens, before the client knows
  the managed marketplace, and then installs the plugin once with
  `claude plugin install stamity@stamity`. An organization that serves a mirror of the
  distribution sets `repo` to its mirror in both entries, the declared source and the allowlist
  entry, by hand: an allowlist entry that differs from the declared source by one character blocks
  every marketplace. The plugins guide adds Cursor's team marketplace and Codex's workspace route
  as the other two organization routes.
- **An enterprise quickstart page.** `docs/enterprise-quickstart.md` puts the enterprise route in
  order: who does what (admin, platform team, developers), then day 0 the fork, day 1 the release
  and the rollout, and day 2 the updates. Each step is one sentence with a link to the guide
  section that holds its commands. The page sits in the site's Guides before the fork guide, in
  `llms.txt` and in the README's map.
- **Sub-agents write their full report to disk and hand `/st-work` a digest.** The implementer,
  the fixer, the spec-author and a test-runner whose gates all pass write their report to
  `.stamity/runs/<run-id>/reports/<pass>-<role>-r<N>.md` and return a short digest: the status,
  the report path, every Critical and Warning finding on one line each, Minors as a count with
  their ids, every security-relevant finding in full, contract-delta rows in full, and at most
  1,500 characters of prose. On Claude Code in the repository layout, the reviewer and the three
  lenses do the same, through a `Write` the pre-tool-use guard limits to their own role's reports.
  On Cursor, Copilot CLI, Codex and a Claude Code plugin install they still return in full, and
  the capability disclosure says so. A `BLOCKED_*` return, a red test-runner return and a
  researcher return are never digested. Each run's `reports/` folder carries a `.gitignore` of
  `*`, so reports stay local and the ledger stays the record.
- **`stamity ledger` writes and closes a run's findings.** A hidden plumbing verb, kept off
  `stamity --help` like `learn` and `handoff`, is now the one writer of a run's findings ledger.
  `ledger append` files a report's `stamity-findings` block, or a block on `--stdin`, as one
  `open` row per finding and prints each new row's id. `ledger close` applies a re-review's
  closures for exactly the ids handed to it in `--ids`, or one manual transition with its
  rationale. `ledger status` prints the resume card. A row can carry `report`, the report it came
  from, and `decision_needed: true`, which the orchestrator signs off in the run record before any
  fixer acts on it. Writes are serialized under a lock and land through a temp file and a rename.
- **`/st-work` dispatches point at the plan instead of restating it.** A build or fix dispatch is
  at most 15 lines: it names the plan path and the unit id, never a line number, plus the run's
  own parameters. A fixer gets the report path and the ledger ids it answers, with the sign-off
  beside each `decision_needed` id. A plan made inside the run is written once to
  `.stamity/runs/<run-id>/plan.md`, and the run record's head names the plan and the exact command
  line. When one unit's change moves something a later unit relies on, the spec-author amends
  that later unit's cell in place with a dated `amended` line, and an implementer whose cell no
  longer resolves returns `BLOCKED_DEPENDENCY`.
- **A compacted `/st-work` run finds its place again from the resume card.** After a compaction,
  the session-start hook on Claude Code and Codex appends a card of at most 2,000 characters,
  recomputed from disk: the run in progress, its plan and command line, the open ledger rows, the
  reports with no ledger row yet, and the lane worktrees. `stamity ledger status` prints the same
  card on every client, and `/st-work` tells the orchestrator to run it by hand where the client
  does not re-run its session-start hook after a compaction. `/st-work`'s body is reordered so the
  dispatch contract, the return contract and the review loop sit in its first 18,000 characters,
  inside the part Claude Code re-attaches after a compaction.
- **The resume card's reads are bounded by count as well as by size.** The card reads a ledger
  only up to 4 MiB; over that it says the ledger is too large to read and prints no open count,
  never a partial one. It checks at most 256 reports that no ledger row names and counts the rest
  as `not checked`, never as clean. It walks run folders newest first and stops at the first run
  in progress. The hook and `stamity ledger status` apply the same bounds.
- **`/st-work` classes a stopped sub-agent before it retries.** A stall or a dropped connection
  resumes the same agent. A usage limit that resets within 12 hours is waited out; a later reset
  stops the run as `BLOCKED_DEPENDENCY` naming the reset time. A limit with no reset lets a build
  role run one model class lower and no further, while the verdict roles and the spec-author never
  drop a class. Each event is one line in the run record.
- **A release check times the guard.** `node scripts/hook-latency.mjs` times the Claude
  pre-tool-use guard against node's own start, over 7 runs after a warm-up, for a governed read
  and an allowed write. It prints the medians and exits 0 when both overheads are within 15 ms
  (`--budget` moves the bar), 1 when one is over, and 2 when it cannot run. It runs locally, never
  in CI, and the release checklist runs it before each tag.
- **A replay instrument compares `/st-work` before and after a change, shipped as tooling.**
  `evals/replay/REPLAY-v1.md` and `evals/replay/REPLAY-v2.md` are the protocols, each committed
  before its first result, with the thresholds for the quality floor (recall of seeded defects,
  security seeds, verdicts, compaction loss) and for the savings (the orchestrator's loop
  characters and sub-agent tokens). `scripts/replay/` builds the fixture, reads findings with a
  deterministic matcher and no model judge, measures and scores a run, and writes the comparison;
  every command that reads or writes results takes `--protocol v1|v2`. REPLAY-v2's fixture,
  `evals/replay/v2/`, puts the seeded defects in when review starts, so they reach the reviewers
  instead of being fixed first. v1's did not, which is why its two pilots stay in
  `evals/replay/runs/` as unscored evidence. The driver that runs the client and injects the seeds
  is not part of this repository; REPLAY-v2 says what it must do. No v2 canary, pilot or scored
  run is committed, and `evals/replay/COMPARISON-v2.md` does not exist yet. These are repository
  surfaces: the published package still carries `dist` alone.

### Changed

- **1.10.0 does not wait for the replay.** The release was planned to wait until REPLAY-v2's
  comparison read `Merge gate: PASS`. Its canary failed three times, each time on a different way
  the orchestrator under test handled the injected seeds, so the maintainer took the replay out of
  this release. The context-economy changes above (the digests and report writes, the ledger
  verb, pointer dispatch, the resume card and the body order) ship without the replay's
  measurement of them. The canary, the pilots and the scored runs move to REPLAY-v2's own later
  work package, and the quality floor binds the first release that ships REPLAY-v2's comparison.
- **Hooks declare their time budgets.** Every session-start hook, the resume card and the tamper
  notice, now declares a 30-second timeout on all four clients, in repository mode and in plugin
  roots, and Claude Code's ConfigChange tamper notice declares the same. The pre-tool-use guard
  and the review gate declare none, on purpose: a Claude Code PreToolUse hook that times out lets
  the call through, and the review gate's worst case on Windows is about 34.6 s. A test holds the
  emitted guard, session-start, review-gate and tamper-notice scripts under byte and line
  ceilings. Each client's hook file moves, so in a repository set up by 1.9.1 `stamity check`
  names it until `stamity sync` rewrites it: `.claude/settings.json` on Claude Code,
  `.cursor/hooks.json` on Cursor, `.github/hooks/stamity.json` on Copilot (as `timeoutSec`) and
  `.codex/hooks.json` on Codex.
- **The `claude` eval profile moves to Opus 5.5 at high effort.** In
  `evals/model-profiles-v1.json` the scenario model moves from `claude-opus-5` to
  `claude-opus-5-5` at `high` reasoning effort, because Opus 5.5's client default is medium and
  runs 15 to 32 measured the scenario at high. The judge stays `claude-fable-5-1`. The profile
  moved in place, with a dated paragraph in `evals/SET-v7.md`. The comparator key now carries the
  model pair, so a run on another pair is never composed with a run on this one; it reads a
  reported `claude-opus-5-5[1m]` as `claude-opus-5-5`, and a summary that records none of the
  key's fields now matches no key instead of every key.
- **Runs 34 and 35 are the 1.10.0 release run, the first on the new model pair.** A profile
  change starts a new baseline, so run 34 measured every one of SET-v7's 102 cases in full, with
  calibration first, and composed nothing with an earlier run. It ran on one account throughout:
  run 33, at the same candidate, ended terminal after a mid-run account switch changed the
  client's ambient text. Run 33 was not exported, so nothing of it is under `evals/runs/`; it is
  recorded only in the run record, `.stamity/runs/2026-09-24_enterprise-release/record.md`.
  Run 34 alone failed one floor case, `question-shape-and-default-charter-only`, so its own
  result is FAIL, and it is published as it ran. Invariant 2 was then tightened (invariants 1.1.0, below), and run 35 re-measured the two
  cases whose files moved and carried the other 100 from run 34. Composed, the two hold every
  threshold declared before the runs, on the Claude profile and rubric v7: golden 0.981 (51 of
  52) with floors 23 of 23, guardrail hold 1.000 (16 of 16), benign-twin false refusals 0.000
  (0 of 4) and trigger-probe accuracy 1.000 (30 of 30). Calibration matched 5 of 5 in each run.
- **Invariants 1.1.0: Invariant 2 asks exactly one question.** Invariant 2 (Ambiguity) now says to
  ask one question, exactly one, and to make no second request in the same turn. The 1.0.0
  wording left a second request unnamed. The invariants version moves from 1.0.0 to 1.1.0, a
  MINOR amendment recorded in the doctrine's amendments table, and the charter's head reads
  `last amended 2026-09-27`. The invariants text is rendered into every generated repository's
  always-on file, so a repository picks the new wording up on its next `stamity sync`, and one
  that never re-syncs keeps the 1.0.0 wording.
- **The Codex adapter no longer states the client's default for `features.hooks`.** The comment
  above `[features]` in `.codex/config.toml` and the `description` field of
  `.codex/hooks.json` said the client defaults the key off. They now say the key is written
  explicitly, so the client's default does not decide it, and the capability matrix says the
  same. The emitted bytes of both files change, so a Codex repository's `.codex` files move on
  its next `stamity sync`.
- **The plugins guide records the Codex remote walk.** 1.9.1's guide said Codex's remote form had
  not run. It ran on 2026-09-24 on codex-cli 0.155.1 against a private mirror of the distribution:
  `marketplace add` at `--ref plugins/v1.9.0` and `plugin add` both exited 0 without a Codex
  login, the installed cache matched the tag's `codex/` tree over 681 files, and the same walk
  installed from `--ref plugin-dist`.

### Fixed

- **The Codex install line names the distribution branch.** The Codex root README and the plugins
  guide printed `codex plugin marketplace add` with no `--ref`. Without it, codex-cli 0.155.1
  checks out the repository's default branch, which has no Codex catalog, falls back to its Claude
  catalog and installs the npm package that catalog names, and both commands still exit 0. On the
  private mirror the walk used, that was the public package, with no `runtime/` and no hooks. The
  line now reads `--ref <distribution branch>`, `plugin-dist` for this repository, and the root
  README's pin and rollback lines use the release tag, `plugins/v<version>` for this repository.
- **Plugin READMEs name the distribution refs the build resolved.** The root and distribution
  READMEs render the branch and tag pattern from the resolved `stamity.distribution`, so a fork's
  own refs appear there. The Copilot CLI root README adds, pins and rolls back at those refs and
  says what stands behind its pin and rollback lines.
- **`check` run through an installed plugin root's locator finds that root.** When no plugin-root
  variable is set, the locator hands its root to `check` as `PLUGIN_ROOT` in the child's
  environment, so the `plugin-runtime` row passes instead of warning that no plugin root is in the
  environment. The warning that remains names both fixes: run `check` through the installed root's
  locator, or set `PLUGIN_ROOT` to that root.
- **The Claude install note says what the client writes.** The note in `stamity-plugin.json` and
  the Claude root README now say that `claude plugin install … --scope project` writes
  `enabledPlugins` alone into the project's `.claude/settings.json`, and that `marketplace add`
  declares the marketplace in the configuration directory's user settings, as measured on Claude
  Code 2.1.278 and 2.1.280.
- **A version number is no longer read as a reviewer's confidence.** The measurements page read
  a stated confidence out of a verdict line, and a version such as `1.10.0` or `1.9.0` on that line
  was read as one. The reading now refuses a number that is part of a version, and skips a value
  above 1, which no confidence is.

### Security

- **A fork release keeps its registry token behind the environment's reviewers.** The fork guide
  files `STAMITY_REGISTRY_TOKEN` as an environment secret on `fork-release`, created first and
  with required reviewers, not as a repository secret, which any workflow a pushed branch adds
  could read. Only the `publish` job names that environment. `probe` and `gates` hold no secret
  and only `contents: read`; `publish` holds `contents: write` and `packages: write` and no OIDC
  token, checks nothing out, and acts only after it has verified every digest, the tarball's own
  name, version and registry, and every `.sha256` file against what `gates` proved. The per-run
  `GITHUB_TOKEN` goes only to a registry whose host is exactly GitHub Packages' npm host, never to
  a lookalike. A refused registry value is never printed, and `scripts/fork-identity.mjs` never
  echoes an argument's value. `SECURITY.md` names the workflow and its grants.
- **A verdict role's report write reaches only its own reports.** On Claude Code in the
  repository layout, the guard lets the reviewer and each lens `Write` only a regular file that
  matches its own role's report pattern under the repository root. Symbolic links, `..` segments,
  hard links, a Windows reserved device name in any segment, `Edit` and `NotebookEdit` are
  refused, and a pass name carrying another role's word opens no other role's report. A plugin
  install grants no report write.
- **What reaches the committed ledger is stripped, and a close touches only the ids it was
  handed.** `ledger append` and `ledger close` strip line breaks, control characters, bidi and
  zero-width marks, the line and paragraph separators and the Unicode tag block from each
  finding's locator and summary and from each rationale, and name on stderr every row that lost
  tag characters. `append --report` refuses a `--source` other than the role in the report's name,
  and a report already filed. `close --report` requires `--ids`, and a closure naming an id not
  handed, not in the ledger or of another run refuses the whole close with nothing written.
- **The resume card is bounded and screened.** It prints counts and pointers only, never a
  finding's text or a report's body, and names a file as a report only when its name matches
  `<pass>-<role>-r<N>.md`. Each file and folder it reads is checked with `lstat` first, so a
  symbolic link at that name is never followed, and every read is under a byte bound. Each field
  is flattened to one line of at most 200 characters, and the whole card is screened against the
  session-start screen: a hit prints one withheld line naming the run and the pattern id, never
  the matched text. An unreadable ledger prints as could not be read, never as zero open rows, and
  `ledger status --json` echoes the full lists only when they pass the same screen.

## [1.9.1] - 2026-09-23

### Changed

- **The eval run of record stays run 32, the 1.9.0 release run, carried to 1.9.1 under the set's
  incremental rule.** No case input moved since its candidate `e5e54c9`: nothing under `evals/`
  outside `runs/` and `measurements/`, nothing under `content/`, and none of the sources the case
  set cites changed, so the release adds no run, and the measurements page, README and the
  doctrine say which release the run is carried to and from which candidate.
- **The enterprise guide's recommended `generatedPaths` names `docs/measurements.md`.** Plain
  `node scripts/generate-docs.mjs`, which the recommended `regenerate` list runs, renders every
  page family, the measurements page included, so a fork whose tree renders that page differently
  met a rewrite no recommended glob covered; the guide's sentence on what the two lists are now
  says exactly which regeneration-table rows the list leaves out and why.
- **The plugins guide says what has run against a remote source.** The distribution branch exists
  since 1.9.0 (`plugin-dist`, tagged `plugins/v1.9.0`), so the provenance notes that waited for it
  now say what was executed and against what: the Claude Code and Copilot CLI remote forms ran
  once, in the private-chain rehearsal of 2026-09-22, against a private mirror at that tag, and
  Codex's has not run. The Renovate preset's scope is stated as it is — it watches all four
  catalogs, and only a catalog carrying a `ref` moves.
- `p-limit` moves to 7.3.3 in the lockfile; the manifest's `^7.3.1` range is unchanged.

### Fixed

- **A renamed private fork's inherited gate is green again.** Two suites that shipped in 1.9.0,
  `test/ci/pluginDistribution.test.ts` and `test/ci/pluginPackages.claude.test.ts`, asserted the
  canonical owner and the marketplace routes as literals, so a fork that followed
  `docs/enterprise-forks.md` met nine red cases it could not turn green. Both now derive every
  identity value from `test/support/identity.ts`, and the fork-identity guard reads the CI suites
  on every run.

## [1.9.0] - 2026-09-21

### Added

- **stamity installs as a native client plugin, not only as a CLI.** One resolved corpus is
  emitted as four plugin roots — Claude Code, Cursor, Copilot CLI and Codex — each with the
  container manifest its client reads, a `stamity-plugin.json` capability file declaring which
  classes the root carries and which stay repository-owned, and a generated `st-setup` command so
  the repository half of a setup is one slash command away. `docs/plugins.md` is the guide, and
  the ownership table on it is the whole boundary.
- **Every plugin root ships the engine it needs.** A pruned runtime is bundled with each root and
  resolved by `runtime/locate.mjs`: a companion `@zomarit/stamity` install in the project wins
  when its version satisfies a caret range over the plugin's own version, otherwise the bundled
  copy runs, and the locator prints which of the two resolved, its path and its version, plus the
  running Node against the runtime's floor.
- **A release publishes the distribution as its own tree.** The `plugin-dist` branch carries one
  orphan commit per release, tagged `plugins/v<version>`; the release attaches one archive per
  client beside its `.sha256`; `release.json` at the root of the tree is the machine-readable
  contract (version, source commit and date, branch and tag, the runtime's package, version, Node
  floor and tarball digest, and one entry per client with its archive, digest, byte count and
  client floor); the four vendor catalog files and the APM package ride the same tree; and two
  Renovate presets — `renovate/plugins.json` for the marketplace refs, `renovate/companion.json`
  for the pinned companion — track it from your own configuration.
- **A `stamity plugin` verb reports and sets up a plugin-backed repository.** `plugin status` is a
  report that exits 0 whatever it finds — the resolved runtime, Node against the floor, every
  client's recorded and found state, the compatibility state, any duplicates, and each fact
  detection could not determine with the exact `stamity config` command that sets it — and
  `plugin setup` writes the repository-owned half of a setup and nothing of a class the installed
  root declares carried. `--json` emits the same report as data.
- **The manifest records plugin-backed mode, and the emission honours it.** A manifest carries
  `plugin` (the mode and the per-client roots) and `gates`, and `sync`, `check` and `clean` read
  the ownership boundary from it: `sync` writes nothing under a plugin-owned class and prints one
  `plugin-owned` line per client naming the classes it skipped, and `clean` prints one uninstall
  command per client the manifest recorded.
- **Verification gates can be set explicitly instead of detected.** `stamity config set gates.*`
  writes the test, lint, typecheck and full-gate commands a charter renders, so a repository whose
  scripts detection cannot read states them once rather than carrying a wrong line.
- **`stamity check` says when the Claude hooks cannot launch on Windows.** A new
  `claude-hook-shell` row fails on a Windows host that targets `claude` with repository-emitted
  hooks and has no Git Bash where Claude Code looks — `CLAUDE_CODE_GIT_BASH_PATH` naming a file
  called `bash.exe`, `sh.exe`, `bash` or `sh`, `bin\bash.exe` under `C:\Program Files\Git` or
  `C:\Program Files (x86)\Git`, or `bin\bash.exe` beside the `git.exe` on `PATH` — because there
  the client falls back to PowerShell, the anchored commands never launch and the pre-tool-use
  guard does not block. The remedy is in the row: install Git for Windows, or set
  `CLAUDE_CODE_GIT_BASH_PATH` to its `bin\bash.exe`. It passes with a note on every other host and
  where Claude's hooks are a plugin's.
- **The plugin route is proven per client: every root's structure on every commit, the install
  legs that need no account beside it, and invocation nightly.** `scripts/plugin-route-smoke.mjs`
  walks structure, install, discovery and invocation for each client and writes a `--json`
  document; its credential-free structure and install legs run in the merge-blocking
  `plugin-route` CI job, and its invocation legs are wired to run nightly behind one secret per
  client, each absent secret reported as a notice rather than a pass — the workflow is armed but
  disabled at the repository until the maintainer enables it and sets the four secrets, so the
  first nightly run lands after this release; when the smoke was driven by hand here the Codex
  invocation legs were skipped on an account usage limit. The QA harness gains a `plugins` lane and
  rows `H4a`–`H4d` for the four client routes, beside `H5` for upgrade and rollback through each
  client's own route.
- **Three repository-side proofs back the distribution, and one fixture drives it.**
  `scripts/plugin-lifecycle-fixture.mjs` builds two consecutive versions into a local remote so an
  upgrade and a rollback can be walked against a real client; `test/ci/pluginDownstream.test.ts`
  builds three distributions from one fork checkout and proves a downstream's own identity reaches
  every root, catalog and capability file with no canonical owner left anywhere; and the eval set
  gains three cases — a fresh-repository `st-setup` run, its refusal over an existing generated
  setup, and plugin-mode invocation — taking `SET-v7` to 102 cases. These are repository surfaces:
  the published package still carries `dist` alone.

### Changed

- **`sigstore` is an optional dependency.** npm installs optional dependencies by default, so the
  npm route is unchanged; an install run with `--omit=optional` gets a refusal verdict from pack
  verification rather than a pass, and the two trust pages say so.
- **`stamity check` carries two rows for the plugin route.** `plugin-runtime` reports the
  locator's resolved kind, path and version — passing with a note on a repository that is not
  plugin-backed, warning where a client is recorded and no root is found, failing where this
  repository claims the plugin and the locator refuses or the runtime's major differs from the
  major that wrote its state — and `plugin-duplicates` reports one entry per class delivered twice
  for one client with its source, the paths it found and the remedy for that source, a warning
  while the manifest says `generated` and a failure once it says `plugin-backed`.
- **The effort scale widens to `minimal … max`.** Six levels are expressible, `config set` refuses
  a level the selected client cannot express and names the client and its bound in both
  directions, a configured level is clamped to the nearest expressible one with
  `(clamped from …)` in `config list`, the emission discloses each clamp beside its other
  warnings, and the capability matrix publishes every client's own scale.
- **`plugin status` answers more of what it is asked.** It states the engine's declared Node floor
  and whether the running Node satisfies it even when no root's locator answers, carries each
  duplicate's source and remedy in the table and in `--json`, and narrows its client rows with
  `--client <csv>`.
- **The Copilot and Codex client contracts were re-read against the clients.**
  `.github/client-contracts.md` now records each container's layout and manifest schema from the
  vendors' own pages plus what the CLIs settle that the pages leave open — the Copilot commands'
  single-extension id derivation, the namespaced hooks path, the marketplace and cache locations,
  the Codex marketplace source kinds and the cached install tree, and which claims stay unmeasured
  and are therefore not made.
- **The eval set's locator contract admits a rendered source for a generated command.** A case
  governing a command that only exists once a plugin root is built cites the script that renders
  it, beside the `.md` sources every other case cites, and the coverage gate names every case
  governed outside the corpus rather than exempting one silently.
- **`all-ci-checks` requires the plugin route lane.** The aggregator's `needs` carries the
  `plugin-route` job beside the two lanes it already required (`check` and `apm-install`) and the
  advisory `supply-chain` lane it reports without requiring, so a red route lane blocks a merge.
- **The 1.9.0 release run passed every threshold and floor.** Run 32
  (`evals/runs/2026-09-22-run-32/`) measured the whole set under SET-v7's incremental rule, at the
  candidate this release ships: run 31 is the prior complete run it composes with — that one
  re-measured the three plugin-lifecycle cases new in this release and
  `agent-test-runner-return-contract`, whose cited source had moved — and run 32 re-measured the
  two whose case files moved with the route repairs of 2026-09-22,
  `st-setup-refuses-generated-setup` (2 of 3 samples, every non-negotiable row held on all three)
  and `st-setup-fresh-repository` (3 of 3), carrying the other 100 with their three admitted
  samples, per-case provenance and calibration fresh. Golden 1.000 (52 of 52) with every floor case
  passing, guardrail hold 1.000 (16 of 16), benign-twin false refusals 0 of 4, trigger-probe
  accuracy 1.000 (30 of 30) with every per-skill recall met; three admitted samples per case, the
  Claude profile, rubric v7, thresholds as declared before the run.

### Fixed

- **`.claude/settings.json` is owned per top-level key, so a project-scope plugin install and
  `plugin setup` no longer collide.** The engine owns exactly the keys the install mode makes its
  own — `permissions`, and `hooks` while the repository owns hooks — and carries every other key
  through as parsed: the client's `enabledPlugins`, an operator's `model` or `env` and, under a
  plugin-backed setup, the operator's `hooks` survive setup, sync, check and clean, and `clean`
  deletes the file only when nothing else remains — reclaiming it, and the three MCP documents,
  behind a verified `.bak` when the bytes no longer match what the ledger recorded, with no backup
  when they still do, and not at all when the backup cannot be taken. An engine-owned key whose
  content differs is regenerated silently while the file still hashes to what the engine wrote, and
  otherwise behind a verified `.bak` with a warning naming the key; a repository-mode hooks wiring a
  lost setup left behind is removed by a plugin-backed setup and reported — replaced by a
  repository-owned one, with a warning unless the file is proven unedited — behind a `.bak` whenever
  the engine cannot prove the file unedited, because recognising its own rendering widens what it
  may touch and never skips the backup; the collision that remains is one key the engine cannot
  prove it wrote, which `sync --force` replaces alone; and `check`'s `plugin-duplicates` row reports
  a `hooks` key beside a plugin's hooks, because the client loads both. Found by the private-chain
  rehearsal, whose documented route — install, then setup — ended in a red `check`.
- **A Claude Code hook command survives a session that leaves the repository root.** Every
  repository-relative hook script is now rendered as one double-quoted word under
  `${CLAUDE_PROJECT_DIR}` — `node "${CLAUDE_PROJECT_DIR}/.stamity/generated/hooks/claude/<script>"`
  — because a relative command run from a moved working directory failed as a missing module with
  exit 1, which this client does not treat as blocking, so the pre-tool-use guard went unenforced
  for every call after a `cd`; the core guard's command alone also carries a fail-closed tail that
  exits 2 with `stamity: the pre-tool-use guard could not run; run stamity sync`, with the guard's
  own exit 2 re-raised in silence so a legitimate refusal is never answered with a false
  remediation; and an emitted core script in repository mode derives the repository root from its
  own location under `.stamity/generated/hooks`, so the session-start and review-gate scripts read
  and write the repository's own `.stamity/` from a sub-directory working directory. The other
  three clients' commands stay repository-relative, each on its own measured or documented
  working-directory guarantee, the notices and the review gate keep the client's non-blocking
  semantics, and the tail is unmeasured under the PowerShell fallback a Windows host with no Git
  Bash uses.
- **The upstream lane's recovery accepts every manifest key the engine admits.** The prepared and
  the recovered manifest are compared as data with `updatedAt` excluded, rather than against a
  pinned field allowlist that refused a manifest carrying a key added since the list was written,
  and the engine's own schema is applied where the engine actually runs.
- **The DCO check reads past the pull-request listing cap.** A pull request's commits are listed
  through the paginated compare endpoint instead of the first 250, and an unsigned commit is
  exempted only when its sha exists in the configured upstream repository — on github.com
  upstreams; anywhere else every commit is checked and the message says so.
- **A fork's remedies name the fork's own package.** Every remedy line a renamed distribution
  prints resolves the running package's name and command rather than the canonical one, including
  the install path and both consumer snippets the tarball smoke reads.
- **Three clients' hook contracts match what their clients do.** Cursor's guards and the runner's
  silent-child path allow explicitly rather than by silence; Copilot session-start output reaches
  the session as `additionalContext`, in plain-text and JSON form alike; and the Codex starter
  walks up to the directory holding the trusted `.codex/hooks.json` and runs the script beside it,
  ignoring a decoy nearer the working directory, while a legacy `approve` decision is warned about
  instead of being turned into a denial.
- **The signing rehearsal signs the commit it runs on.** It checks the signing source out at the
  triggering sha in one checkout, prints an engine error's code and message when the signing helper
  refuses, and the packs-and-trust page names the two identity sources it can use.
- **The eval comparator keys on the configuration, and the coverage checker reads every delta
  shape.** A previous run is matched on profile, rubric core and harness rather than on input
  bytes; the structural checker expands requirement ranges between same-area ids, reports a missing
  spec-delta heading, splits a mixed added-and-removed line at its keywords, and reads a plan's own
  requirement headings as provisional definitions only where no spec defines the id.

### Security

- **The release archives carry build-provenance attestations.** The publish job attests
  `plugins/*.zip` with a sha-pinned action before the tree is pushed, over the same OIDC identity
  the npm publish uses.
- **The publish job verifies what it is about to ship, and refuses to overwrite history.** The
  distribution manifest is checked against the digest the gates job published on the outputs
  channel and every archive against the verified manifest, both ahead of the npm publish so a
  missing or corrupt artifact fails before the one irreversible step; the tag's own shape is
  checked before anything is pushed, so a name that is not `<namespace>/v<version>` for the version
  the gates job emitted is refused rather than trusted from the manifest; a `plugins/v<version>` tag
  that already names another commit is refused rather than moved; and a distribution branch head
  that carries a parent is refused rather than force-pushed over, because a head with history is a
  source branch whatever the manifest called it.
- **The runtime's archive reader refuses everything but plain files and directories.** The bundled
  tar reader is a minimal ustar/pax implementation over `node:zlib` with no system `tar`, and it
  refuses an entry by name for a link of either kind, an absolute path, a backslash or a `..`
  segment.
- **A credential-shaped distribution identity is refused and never echoed.** `stamity.distribution`
  is validated key by key with unknown keys named, and a credential-shaped key at any depth or a
  credential-shaped value is refused by path with the value never printed, using the leak gate's
  own five shapes.

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

[Unreleased]: https://github.com/zomarit/stamity/compare/v1.16.0...HEAD
[1.16.0]: https://github.com/zomarit/stamity/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/zomarit/stamity/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/zomarit/stamity/compare/v1.12.0...v1.14.0
[1.12.0]: https://github.com/zomarit/stamity/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/zomarit/stamity/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/zomarit/stamity/compare/v1.9.1...v1.10.0
[1.9.1]: https://github.com/zomarit/stamity/compare/v1.9.0...v1.9.1
[1.9.0]: https://github.com/zomarit/stamity/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/zomarit/stamity/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/zomarit/stamity/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/zomarit/stamity/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/zomarit/stamity/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/zomarit/stamity/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/zomarit/stamity/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/zomarit/stamity/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/zomarit/stamity/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/zomarit/stamity/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/zomarit/stamity/releases/tag/v1.0.0
