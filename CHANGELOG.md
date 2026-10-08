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
  rendered for that setup). A copy no rendering proves is kept and named. At a charter or
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

[Unreleased]: https://github.com/zomarit/stamity/compare/v1.12.0...HEAD
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
