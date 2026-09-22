# Client contract evidence

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 8354fe1. Re-attested 2026-09-22 against the vendor pages each bullet cites and four Copilot CLI measurements of that date. -->
<!-- Re-open when: a cited vendor page changes what a client guarantees, an adapter emits a
     different configuration key, or a measurement supersedes a dated one below.
     `test/docsPages.test.ts` holds this page to the evidence-page contract and to the Codex
     hook-loading facts. -->

One currency claim, and it is the header above: every bullet's cited page was re-read on the date
that header names, and a claim resting on a measurement instead carries its own date in place.
These source-derived fixtures exercise emitted configuration and local hook processes;
they do not claim authenticated client sessions, native trust approval, or human QA.

- **Claude:** existing command files retain `/st-*` compatibility with skills; no command
  migration is needed. The bridge keeps the managed `AGENTS.md` import and removes the
  duplicated skill-discovery paragraph. Skill license and compatibility metadata use the
  supported fields. A hook handler "run[s] in the current directory with Claude Code's
  environment" — the session's own working directory, which a `cd` in the Bash tool moves for the
  rest of the session — while `${CLAUDE_PROJECT_DIR}` is "the project root where the session
  started" and is exported to the handler in both shell and exec form; shell form is "passed to a
  shell: `sh -c` on macOS and Linux, Git Bash on Windows, or PowerShell when Git Bash isn't
  installed", and that page asks that "in shell form, wrap each placeholder in double quotes"; exit
  2 "means a blocking error" and on `PreToolUse` "blocks the tool call", while "Any other exit code
  doesn't block on its own for most hook events" — the qualifier is the vendor's, and `PreToolUse`
  is one of the events it covers (hooks page, read 2026-09-21). The consequence is the anchoring this
  repository emits: every repository-relative hook command is rendered as one double-quoted word
  under that variable, because a relative command run from a moved working directory fails as
  `Cannot find module` with exit 1 — which does not block, so the pre-tool-use guard went unenforced
  for every call after a `cd` (189 occurrences in one consumer run). Measured 2026-09-20 in a
  disposable fixture on claude 2.1.278: the pre-change emission recorded one hook call for the `cd`
  itself and none after it, with the denied file read successfully; the anchored emission recorded
  the denial and the allowance from the same sub-directory, which also measures that headless
  `claude -p` exports the variable. The core guard's command alone carries a POSIX fail-closed tail
  (`|| { s=$?; [ "$s" -eq 2 ] && exit 2; echo …; exit 2; }`) so a guard that cannot launch blocks
  instead of passing, while the guard's OWN exit 2 is re-raised in silence — exit 2 is the status on
  which the page says stderr returns to the model, so a tail that printed on every non-zero status
  would answer each legitimate refusal with a false remediation. The whole anchoring is unmeasured
  under the PowerShell fallback the page names for a Windows host with no Git Bash, and the
  expectation there is worse than "no tail": `${CLAUDE_PROJECT_DIR}` is PowerShell variable syntax
  rather than an environment lookup (`$env:NAME`), so every one of the five anchored rows would
  expand to an empty root and never launch — a possible regression on that host from "ran while the
  session sat at the root" to "never runs", recorded as unmeasured rather than claimed either way.
  [Skills](https://code.claude.com/docs/en/skills),
  [memory and imports](https://code.claude.com/docs/en/memory),
  [hooks](https://code.claude.com/docs/en/hooks) (all three read 2026-09-21).
- **Codex:** `.agents/skills` supports named `$st-*` invocation. Optional `agents/openai.yaml`
  companions add display names and default prompts. Hooks use command strings, and three
  loading steps all have to hold before the client runs one. First, `features.hooks` must be
  on: the adapter writes `[features] hooks = true` into `.codex/config.toml`, and that key was
  measured on 2026-09-15 to flip the feature on codex-cli 0.154.0. Second, the project must
  carry `projects.<path>.trust_level = "trusted"`. Third, each hook needs per-hook `/hooks`
  trust, or an invocation started with `--dangerously-bypass-hook-trust`. They do not consume
  Stamity digests as approval. Neither page states a default for that key as read 2026-09-21 —
  the config reference marks other `[features]` keys "on by default" in so many words and this one
  not, and an earlier hooks-page read of 2026-09-17 did call it on by default — so this page states
  the emitted key rather than a default, which is also what the 2026-09-15 measurement covers: it
  never ran without the key. Headless `codex exec` on codex-cli 0.154.0 ran zero
  project hooks with the feature on, the project trusted and hook trust bypassed (measured
  2026-09-15; three runs, no observation file written, no hook-discovery line in the debug
  log). An emitted hook therefore enforces nothing on that lane, and a QA row that asks it to
  is measuring the client.
  INTERACTIVELY it does enforce, measured 2026-09-22 at 14:41Z on codex-cli 0.155.1 — a newer build
  than the headless fact above — by walking the emitted hooks in the QA hook fixture:
  `features.hooks = true` came from the emitted `.codex/config.toml`, the client asked for the two
  trust decisions and recorded both in the operator's home config (the project's `trust_level =
  "trusted"`, the hook's `trusted_hash`), and it then rendered `Blocked by hook` for
  `qa-denied.txt` carrying the emitted hook's own `permissionDecision: deny` while reading
  `qa-allowed.txt`; the hook's own log holds one `denied` and one `allowed` line (sha-256
  `756246be52bd0bd85faab288f1e8ae5b43e98d42d3750734478c0d108081097b`). So the three loading steps
  above are the whole of it on that lane: with them satisfied the emitted document is enforcement
  in an interactive session, and the headless lane's zero remains the headless lane's.
  "Commands run with the session cwd as their working directory", and the same page asks that a
  repo-local hook "prefer resolving from the git root instead of using a relative path such as
  `.codex/hooks/...`" because "Codex may be started from a subdirectory" (hooks page, read
  2026-09-21) — which is what the emitted starter does: it walks UP from `process.cwd()` to the
  directory holding the trusted `.codex/hooks.json` and launches the script beside it, covering a
  session in a sub-directory of the project and not one outside its ancestry. Session-relative hook CWD
  requires locating the nearest initialized project. PreToolUse carries no calling-agent identity, and some tool paths bypass hooks. No
  native per-agent `tools` key is documented; generated developer instructions carry the
  category restriction and `sandbox_mode` the filesystem boundary. Unsupported PreToolUse
  `ask`/stop controls become explicit denials pending manual review; unsupported output flags
  are diagnosed without losing a denial.
  [Skills](https://learn.chatgpt.com/docs/build-skills),
  [hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-15, re-read 2026-09-17 and
  2026-09-21),
  [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) (read
  2026-09-15, re-read 2026-09-17 and 2026-09-21),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

### Codex plugin container (2026-09-20)

The container is an Agent Plugins 1.0.0 package whose root `plugin.json` is the closed
ten-field schema: `$schema` and `name` the only required keys, `author` closed to
name/email/url, `additionalProperties: false`, and `$schema` pinned by `const`. Clients never
fetch the schema, so the vendored copy at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json`
is the only enforcement there is
([schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), read 2026-09-20 and
re-read 2026-09-21, when the published document and the vendored copy still agreed field for
field). A plugin
carries SKILLS only — agents, commands and rules are outside the v1 format and the migration page
converts them to skills — so the emitted root carries `skills/` and `hooks/` and declares agent,
command, rule and MCP as repository-owned. `extensions.com.openai` carries `apps`, `hooks` and
`interface`, but `hooks/hooks.json` is discovered by default with no manifest field, and the two
vendor pages disagree about where an override lives; discovery satisfies both readings, so the
root ships the file at the default path and emits no `extensions` key at all. The twelve
lifecycle event names are vendored at `test/fixtures/plugins/codex-hook-events.json`; `command`
and `mcp_tool` handlers run while `prompt` and `agent` handlers are skipped.
[Build plugins](https://developers.openai.com/plugins/build/plugins) (read 2026-09-20, re-read
2026-09-21),
[plugins overview](https://learn.chatgpt.com/docs/plugins) (read 2026-09-20, re-read 2026-09-21),
[hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-20, re-read 2026-09-21).

Marketplaces resolve from `$REPO_ROOT/.agents/plugins/marketplace.json`, the legacy
`.claude-plugin/marketplace.json`, and `~/.agents/plugins/marketplace.json`. An entry's
`source.path` must start with `./` and stay inside the marketplace root; `source` kinds are
`local`, `url`, `git-subdir` (with `ref` or `sha`) and `npm`; every entry must carry
`policy.installation`, `policy.authentication` and `category`; no entry `version` is documented;
and an entry the client cannot resolve is skipped SILENTLY, which is why the suite asserts the
installed cache tree rather than the marketplace file it wrote. Measured 2026-09-20 on codex-cli
0.154.0 in a scratch `CODEX_HOME`: `codex plugin marketplace add <root>` followed by
`codex plugin add stamity@<marketplace>` exited 0 with no login, wrote `[marketplaces.<name>]` and
`[plugins."<name>@<marketplace>"] enabled = true` into that home's `config.toml`, and cached the
root under `<CODEX_HOME>/plugins/cache/<marketplace>/<plugin>/<version>/` byte-identical file by
file. [Build plugins](https://developers.openai.com/plugins/build/plugins) (read 2026-09-20,
re-read 2026-09-21).

The root variable is `PLUGIN_ROOT` — with `PLUGIN_DATA`, and `CLAUDE_PLUGIN_ROOT` and
`CLAUDE_PLUGIN_DATA` carried for compatibility — and it is exported to the hook process. Hook
commands run with the SESSION working directory, not the plugin root, so every emitted command
addresses its script absolutely through the variable and the runner it launches reports on the
working directory it was given. On top of the three repository-side loading steps the Codex
bullet above records, a PLUGIN's hooks are skipped until the operator trusts them, so `hooks`
carried in a plugin root means shipped and discoverable, never enforced.
[Hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-20, re-read 2026-09-21).

Unstated on every page read 2026-09-20 and re-read 2026-09-21, and therefore not claimed here. Which layer expands
`${PLUGIN_ROOT}` inside a hook `command` string — the client or the shell — is not stated on the
hooks or the build page; the vendor's own example writes the variable there, so the root does too
and the expansion stays unmeasured. No minimum client version for plugins appears on any of the
eight pages read, so the capability file's `clientFloor` is `unknown` with that citation. And
whether `codex exec` loads a plugin's skills at all is unproven: a scratch `CODEX_HOME` carries
no credential and the run refused with `401 Unauthorized` (measured 2026-09-20), so the suite
prints the exec output as a measurement and asserts nothing on it. Re-read all three at the next
codex minor.

What `codex exec` may WRITE was measured on 2026-09-22 on codex-cli 0.154.0, and it decides how a
setup session has to be launched. The default sandbox is READ-ONLY: the setup line's `mkdir
.stamity` was refused under it. `--sandbox workspace-write` lets the repository be written — the
same `mkdir .stamity` succeeded — but still refuses the repository's OWN `.codex/` directory, which
is where `plugin setup` writes this client's repository-owned agent class. With `--add-dir
<repo>/.codex` beside that mode, `.codex` was created and written. So the route proof's Codex setup
session runs `--sandbox workspace-write --add-dir <repo>/.codex`, and an interactive session asks
the operator for the same write instead. The flag surface is the client's own: `-s, --sandbox`
takes `read-only`, `workspace-write` or `danger-full-access`, and `--add-dir <DIR>` names
"additional directories that should be writable alongside the primary workspace" (`codex exec
--help` on 0.154.0, read 2026-09-22).

- **Cursor:** neutral-tree skills support `/st-*` invocation. Native hook timeouts use
  seconds; explicit exit 2 denies supported actions and `failClosed` covers errors and
  timeouts. PreToolUse `ask` is unenforced, so portable `ask` denies pending human review.
  Session-start and post-tool context map to `additional_context`. Identity-free tool
  payloads cannot enforce calling-role grants. The former fixed MCP tool-count claim is
  absent from the current contract and is removed. Hooks run from the WORKSPACE root, not from the
  session's shell directory: measured 2026-09-20 on the Cursor agent CLI 2026.09.15 in a disposable
  fixture whose extra user hook logged its own `process.cwd()`, every one of six hook invocations
  recorded the fixture root — including the three after the model had run `cd sub` in the shell —
  and the denial was still enforced on the calls that followed. The vendor page now states the same
  rule and scopes it by source: a project hook in `.cursor/hooks.json` runs "from the project
  root", a user hook in `~/.cursor/hooks.json` runs from `~/.cursor/` (hooks page, read
  2026-09-21) — so a repository-relative command is correct for the project rows this engine emits
  and would not be for a user row of the same shape. The client also exports a
  project-root variable name (`CURSOR_PROJECT_DIR`, observed in the same log; values never read), so
  an anchor is available if that behaviour ever changes, but the emitted repository-relative command
  needs none today. The vendor pages refused every connection from the measuring host on 2026-09-20, which is why the
  measurement above was taken; they answered that same host on 2026-09-21, and the three cited
  below were re-read then. What the hooks page settles beside the working directory: exit 2 blocks
  and is "equivalent to returning `permission: "deny"`"; any other non-zero exit is a hook
  failure that "fail[s] open by default" unless `failClosed: true` is set, and no output counts as
  one of those failures; and where several sources match, "any deny wins over ask, and ask wins
  over allow". [Skills](https://cursor.com/docs/skills),
  [hooks](https://cursor.com/docs/hooks), [MCP](https://cursor.com/docs/mcp) (all three read
  2026-09-21).
- **Copilot:** repository command hooks run in CLI/cloud, with PascalCase event aliases
  preserving canonical tool-name matcher semantics. PreToolUse rejects nonzero exits and
  explicit deny; timeouts always fail-open. String and object tool arguments normalize at
  the portable boundary. Session-start command output is injected as additionalContext
  (the hooks reference, read 2026-09-17 and again 2026-09-21). Each hook entry carries its own
  working directory, `cwd`, documented as "relative to repository root" and emitted as `"."`, so a
  repository-relative command needs no anchor here (hooks reference, read 2026-09-21). An emitted
  hook file is loaded only where the FOLDER IS TRUSTED, which is the fact a headless run turns on:
  `COPILOT_ALLOW_ALL` set to exactly `"true"` "additionally trusts the working directory without
  prompting, which loads that directory's skills, plugins, MCP servers, and hooks, including hooks
  that run shell commands", while the other truthy spellings — and `--allow-all-tools`, whose own
  help defers to that variable — "only auto-approve tools" (`copilot help environment` on 1.0.87,
  read 2026-09-22, stdout sha-256 `dac68e84255d3a00ab9c013f5d9accd8079f9c7fb8c1b5a5df23653e60d6c662`).
  Measured 2026-09-22 on the same build: one hook fixture recorded NOTHING under the flag alone, and
  seven hook observations with the variable set, one of them a `PreToolUse` denial the client
  rendered as `Denied by preToolUse hook: hook exited with code 2` — so a QA row that drives this
  client without the variable measures folder trust rather than the emitted wiring. Only
  machine-wide policy hooks "are available regardless of folder trust state"; the repository-level
  files this engine writes (`.github/hooks/*.json`) are not, and neither are a plugin's own. The
  PascalCase aliases are the vendor's "VS Code compatible format" (`SessionStart`, `PreToolUse`,
  fields in snake_case), and a PascalCase `PreToolUse` entry takes Claude's matcher semantics
  instead of the native regex rule, where "`*`, `**`, or an empty `matcher` value fires for every
  tool" (the hooks reference, fetched 2026-09-22, sha-256
  `39d4274e9ca1aea384f57693c76252e6b53e857d28578d9d2e11d4cea1021d40`). The cloud
  configuration must reach the default branch through the normal review/approval path.
  [Hook schema and decisions](https://docs.github.com/en/copilot/reference/hooks-reference),
  [cloud discovery](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks).

### Copilot CLI plugin container (2026-09-20)

A published plugin root is a different address space from the repository surface above, and the
two disagree on more than one path. Measured for the generated `copilot` root against
[the CLI plugin reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference)
and [the hooks reference](https://docs.github.com/en/copilot/reference/hooks-reference)
(both read 2026-09-20 and re-read 2026-09-21), with the client itself — GitHub Copilot CLI 1.0.85, in a scratch
`COPILOT_HOME` — settling what the pages leave open.

The manifest is `plugin.json` at the root, and its exact `$schema` value opts the plugin into
Agent Plugins 1.0. That schema, vendored at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json`
from [the published document](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json)
(read 2026-09-20, re-read 2026-09-21), is closed: ten properties, `additionalProperties: false`, `$schema` and `name`
required, `author` closed to `name`/`email`/`url`, `name` bounded by a pattern with a lookahead,
no logo field and no component path fields at all. The CLI reports and ignores an unknown
top-level key; the vendored schema refuses it, which is the stricter of the two gates and the one
this repository holds itself to.

Layout, as the reference's own table states it: `com.github.copilot/agents/`,
`com.github.copilot/commands/`, `com.github.copilot/rules/`, `com.github.copilot/hooks/hooks.json`
and `com.github.copilot/lsp.json`, with `skills/` and `mcp.json` FIXED at the root for Agent
Plugins 1.0. The hooks path is the namespaced one — confirmed on the page, where bare `hooks.json`
and `hooks/hooks.json` are named as the LEGACY-plugin fallback and not as an Agent Plugins 1.0
location. The table gives directories and states no file extension for any of them. Agents are
`<id>.agent.md` on the page. Commands are not: the page never says, so the root measured it, and
the CLI derives an id by stripping ONE extension — `st-work.prompt.md` registers `st-work.prompt`,
`st-work.md` registers `st-work`. The container therefore takes `<id>.md`, and `.prompt.md` stays
what it has always been here, the spelling of the REPOSITORY's `.github/prompts/`. Rules stay
repository-owned: the directory exists and its file format is not stated. `${PLUGIN_ROOT}` is
documented for MCP `args`, `env` and `cwd`, for agent frontmatter and for LSP configuration; its
expansion inside a hook `command` string is still not stated on any reference page, and the
generated root uses it in hook commands anyway because it is the only documented handle on an
installed root's own files. Its EXPORT is no longer unstated, and the two surfaces differ. For a
plugin's HOOKS the CLI's own changelog says the process receives `PLUGIN_ROOT`,
`COPILOT_PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` (the 1.0.26 entry, unchanged in 1.0.85 and 1.0.87;
read by the release's Copilot investigation on 2026-09-22 and recorded rather than re-derived here
— the shipped binary's strings are compressed, so a grep over it confirms nothing either way). For
a plugin's COMMANDS no such variable arrives at all: the session environment a command's shell sees
carries `COPILOT_CLI` and `COPILOT_HOME` and nothing ending in `PLUGIN_ROOT` (measured 2026-09-22
on 1.0.87). A command that needs its own root therefore asks the client for it, and only one of the
two listings answers. `copilot plugin list --json` does NOT: its `installedFrom` is the MARKETPLACE
directory the plugin was added from, and the catalog inside that directory is what maps the
plugin's name to a root beneath it. `copilot skill list --json` does, and a plugin's rows there
come in TWO shapes. A carried SKILL's `path` is `<root>/skills/<name>`. A carried COMMAND's `path`
is the commands directory itself, `<root>/com.github.copilot/commands`, with no name segment — and
a builtin row's path is under the CLI's own package cache, so no derivation may simply trust a path
it finds. Against the installed stamity root on 1.0.87 the listing is 22 rows: ten plugin skills,
ten plugin commands, two builtin, and no agent rows at all. So the generated `st-setup` command
takes the part of `path` before `/skills/` where a row has one and the part before
`/com.github.copilot/` otherwise, and it STOPS rather than guessing when no entry matches or when
two entries yield different roots; the root it derives goes to the locator as `--plugin-root`.
Measured 2026-09-22 on 1.0.87 in a scratch `COPILOT_HOME`: against the installed root for the
census above, and against a throwaway root of one skill and one command for the two path shapes,
where `installedFrom` was the marketplace directory, the skill row's path its `copilot/skills/`
subtree and the command row's path its `copilot/com.github.copilot/commands` directory (that
install also reported `"source": "live"` and said in the client's own words that it loads live from
that directory and copied nothing).

Discovery and cache paths, from the same reference. A marketplace manifest is read from
`marketplace.json`, `.plugin/marketplace.json`, `.github/plugin/marketplace.json` or
`.claude-plugin/marketplace.json`, in that order; a plugin manifest from `plugin.json` for Agent
Plugins 1.0, and from `.plugin/plugin.json`, `plugin.json`, `.github/plugin/plugin.json` or
`.claude-plugin/plugin.json` for a legacy plugin. An install lands at
`~/.copilot/installed-plugins/MARKETPLACE/PLUGIN-NAME`, or at
`~/.copilot/installed-plugins/_direct/SOURCE-ID/` when it came straight from a path, a repository
or a URL; `COPILOT_HOME` moves the whole directory. A REMOTE marketplace's install is a cached copy
— a plugin edited in place changes nothing until it is installed again — while a LOCAL
directory-source marketplace is not copied at all: "Path-sourced plugins in a local
(directory-source) marketplace load live from their real directory — editing one takes effect on
`/restart` or in a new session, with no `copilot plugin update` needed" (the CLI plugin reference,
read 2026-09-21), which is what the route proof measured on 1.0.85 on 2026-09-20: the installed
entry reported `"source": "live"`, nothing was copied, and `installed-plugins/` was never written.
`copilot plugin install` warned on 1.0.85 that direct installs are deprecated in favour of the
`plugin@marketplace` form. Whichever of those locations a client reads, in this container's shape
or another's, the identity it finds there is the PUBLISHER's and never the canonical one: a
downstream that set `stamity.publisher` and repointed `repository.url` gets roots and catalogs
carrying its own owner and its own https source url wherever ours would have stood, built and
compared root by root in `test/ci/pluginDownstream.test.ts` (measured 2026-09-20).

Two consequences for any test that claims a plugin was discovered. Skill precedence is
first-found, with a project's own `.github/skills/`, `.agents/skills/` and `.claude/skills/` AHEAD
of a plugin's, so a skill id proven inside this checkout proves the checkout; the leg in
`test/ci/pluginPackages.copilot.test.ts` runs in a scratch working directory and a scratch
`COPILOT_HOME`, and asserts the deployed tree and the plugin list rather than a name. And a
headless prompt run needs credentials: `copilot -p … -s` exited 1 with `No authentication
information found` in that scratch home on 2026-09-20, so the prompt lane is recorded as a
measurement and never as an assertion. `copilot skill list` needs none, and on 2026-09-20 it
listed all twenty ids this root carries.

The second-client native-memory trigger has fired: Claude and Codex both offer local
memory. Retain `st-learn` because its repository evidence is versioned and portable across
clients and machines. Reassess when durable, repository-scoped, cross-vendor memory is
available; preserve historical learnings during that review.
[Claude memory](https://code.claude.com/docs/en/memory),
[Codex memory](https://learn.chatgpt.com/docs/customization/memories).

Local evidence lives in `test/adapters/`, `test/hooks/portableRunner.test.ts`,
`test/hooks/scripts.test.ts`, `test/emit/hooksInfra.test.ts`,
`test/emit/skillsProjection.test.ts` and `test/cli/commands/initPanel.test.ts`.
The argv fixture includes spaces and shell metacharacters; malformed payload diagnostics
must not echo credential or tool-input fragments. Generated outputs remain subject to
the normal drift, lifecycle, public-consumer and full verification gates.
