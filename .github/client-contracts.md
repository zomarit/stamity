# Client contract evidence

<!-- HAND-WRITTEN PAGE — verified against the tree at commit 0ca2600. Re-attested 2026-09-17 against the vendor pages each bullet cites. -->
<!-- Re-open when: a cited vendor page changes what a client guarantees, an adapter emits a
     different configuration key, or a measurement supersedes a dated one below.
     `test/docsPages.test.ts` holds this page to the evidence-page contract and to the Codex
     hook-loading facts. -->

Revalidated 2026-09-10 against released 1.6.0 source and the current official pages.
These source-derived fixtures exercise emitted configuration and local hook processes;
they do not claim authenticated client sessions, native trust approval, or human QA.

- **Claude:** existing command files retain `/st-*` compatibility with skills; no command
  migration is needed. The bridge keeps the managed `AGENTS.md` import and removes the
  duplicated skill-discovery paragraph. Skill license and compatibility metadata use the
  supported fields. [Skills](https://code.claude.com/docs/en/skills),
  [memory and imports](https://code.claude.com/docs/en/memory),
  [hooks](https://code.claude.com/docs/en/hooks).
- **Codex:** `.agents/skills` supports named `$st-*` invocation. Optional `agents/openai.yaml`
  companions add display names and default prompts. Hooks use command strings, and three
  loading steps all have to hold before the client runs one. First, `features.hooks` must be
  on: the adapter writes `[features] hooks = true` into `.codex/config.toml`, and that key was
  measured on 2026-09-15 to flip the feature on codex-cli 0.154.0. Second, the project must
  carry `projects.<path>.trust_level = "trusted"`. Third, each hook needs per-hook `/hooks`
  trust, or an invocation started with `--dangerously-bypass-hook-trust`. They do not consume
  Stamity digests as approval. The hooks page read 2026-09-17 says the feature is on by
  default; the 2026-09-15 measurement never ran without the key, so this page states the
  emitted key rather than a default. Headless `codex exec` on codex-cli 0.154.0 ran zero
  project hooks with the feature on, the project trusted and hook trust bypassed (measured
  2026-09-15; three runs, no observation file written, no hook-discovery line in the debug
  log). An emitted hook therefore enforces nothing on that lane, and a QA row that asks it to
  is measuring the client. Session-relative hook CWD requires locating the nearest initialized
  project. PreToolUse carries no calling-agent identity, and some tool paths bypass hooks. No
  native per-agent `tools` key is documented; generated developer instructions carry the
  category restriction and `sandbox_mode` the filesystem boundary. Unsupported PreToolUse
  `ask`/stop controls become explicit denials pending manual review; unsupported output flags
  are diagnosed without losing a denial.
  [Skills](https://learn.chatgpt.com/docs/build-skills),
  [hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-15, re-read 2026-09-17),
  [config reference](https://learn.chatgpt.com/docs/config-file/config-reference) (read
  2026-09-15, re-read 2026-09-17),
  [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).

### Codex plugin container (2026-09-20)

The container is an Agent Plugins 1.0.0 package whose root `plugin.json` is the closed
ten-field schema: `$schema` and `name` the only required keys, `author` closed to
name/email/url, `additionalProperties: false`, and `$schema` pinned by `const`. Clients never
fetch the schema, so the vendored copy at `test/fixtures/plugins/agent-plugins-1.0.0.schema.json`
is the only enforcement there is
([schema](https://agent-plugins.org/schemas/1.0.0/plugin.schema.json), read 2026-09-20). A plugin
carries SKILLS only — agents, commands and rules are outside the v1 format and the migration page
converts them to skills — so the emitted root carries `skills/` and `hooks/` and declares agent,
command, rule and MCP as repository-owned. `extensions.com.openai` carries `apps`, `hooks` and
`interface`, but `hooks/hooks.json` is discovered by default with no manifest field, and the two
vendor pages disagree about where an override lives; discovery satisfies both readings, so the
root ships the file at the default path and emits no `extensions` key at all. The twelve
lifecycle event names are vendored at `test/fixtures/plugins/codex-hook-events.json`; `command`
and `mcp_tool` handlers run while `prompt` and `agent` handlers are skipped.
[Build plugins](https://developers.openai.com/plugins/build/plugins) (read 2026-09-20),
[plugins overview](https://learn.chatgpt.com/docs/plugins) (read 2026-09-20),
[hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-20).

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
file. [Build plugins](https://developers.openai.com/plugins/build/plugins) (read 2026-09-20).

The root variable is `PLUGIN_ROOT` — with `PLUGIN_DATA`, and `CLAUDE_PLUGIN_ROOT` and
`CLAUDE_PLUGIN_DATA` carried for compatibility — and it is exported to the hook process. Hook
commands run with the SESSION working directory, not the plugin root, so every emitted command
addresses its script absolutely through the variable and the runner it launches reports on the
working directory it was given. On top of the three repository-side loading steps the Codex
bullet above records, a PLUGIN's hooks are skipped until the operator trusts them, so `hooks`
carried in a plugin root means shipped and discoverable, never enforced.
[Hooks](https://learn.chatgpt.com/docs/hooks) (read 2026-09-20).

Unstated on every page read 2026-09-20, and therefore not claimed here. Which layer expands
`${PLUGIN_ROOT}` inside a hook `command` string — the client or the shell — is not stated on the
hooks or the build page; the vendor's own example writes the variable there, so the root does too
and the expansion stays unmeasured. No minimum client version for plugins appears on any of the
eight pages read, so the capability file's `clientFloor` is `unknown` with that citation. And
whether `codex exec` loads a plugin's skills at all is unproven: a scratch `CODEX_HOME` carries
no credential and the run refused with `401 Unauthorized` (measured 2026-09-20), so the suite
prints the exec output as a measurement and asserts nothing on it. Re-read all three at the next
codex minor.

- **Cursor:** neutral-tree skills support `/st-*` invocation. Native hook timeouts use
  seconds; explicit exit 2 denies supported actions and `failClosed` covers errors and
  timeouts. PreToolUse `ask` is unenforced, so portable `ask` denies pending human review.
  Session-start and post-tool context map to `additional_context`. Identity-free tool
  payloads cannot enforce calling-role grants. The former fixed MCP tool-count claim is
  absent from the current contract and is removed. [Skills](https://cursor.com/docs/skills),
  [hooks](https://cursor.com/docs/hooks), [MCP](https://cursor.com/docs/mcp).
- **Copilot:** repository command hooks run in CLI/cloud, with PascalCase event aliases
  preserving canonical tool-name matcher semantics. PreToolUse rejects nonzero exits and
  explicit deny; timeouts always fail-open. String and object tool arguments normalize at
  the portable boundary. Session-start command output is injected as additionalContext
  (docs.github.com hooks reference, 2026-09-17). The cloud configuration must reach the
  default branch through the normal review/approval path.
  [Hook schema and decisions](https://docs.github.com/en/copilot/reference/hooks-reference),
  [cloud discovery](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks).

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
