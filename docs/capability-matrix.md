---
title: Client capability matrix
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-capability-matrix.mjs`. -->

# Client capability matrix

Every cell below renders from code: the dialect facts each client's residue planner
declares, the hook-guarantee ladder the emitters read, and the tool-allowlist coverage the
translator applies. A test re-renders this page and byte-compares this file, so it cannot
be hand-edited and cannot lag a change to those declarations.

That is the whole of the guarantee, and its edges are worth stating. The byte-compare pins
this page to what the adapters DECLARE. It does not pin a declaration to what an adapter
EMITS — that holds only where a test pins the two together, as `test/emit/hooksInfra.test.ts`
does for the hook-config column — and it pins nothing at all to a client's live
documentation. A declared value is prose someone wrote into a constant: read a cell as what
the adapter says, and the access date beside it as how old the saying is.

A platform fact is only as current as the access date beside it. Each client's sources carry
the date its documentation was last read; re-read them per release and the diff of this page
is the currency report. The named conditions that re-open a decision are at the foot of the
page, under Currency and revisit triggers.

## Coverage at a glance

| Client | Entry file | Reads `.agents/skills/` | Hook config | Hook enforcement | MCP dialect |
|---|---|---|---|---|---|
| `claude` | `CLAUDE.md` | no | `.claude/settings.json` | `fail-closed` — blocks on exit `2` | `claude-json` |
| `cursor` | none — `AGENTS.md` is native | yes | `.cursor/hooks.json` | `opt-in-fail-closed` — blocks on exit `2` | `cursor-json` |
| `copilot` | none — `AGENTS.md` is native | yes | `.github/hooks/stamity.json` | `fail-closed` — blocks on exit `2` | `vscode-json` |
| `codex` | none — `AGENTS.md` is native | yes | `.codex/hooks.json` | `fail-closed` — blocks on exit `2` | `codex-toml` |

## Always-on cost by client

What a session pays before it has done anything: the charter every client reads, plus every
rule that client cannot attach conditionally. The charter TEMPLATE is capped at 150 physical
lines, and what a session actually loads is that template plus whatever rules the client's own
delivery leaves in front of it.

| Client | Always-on lines | Delivery of description-scoped rules | What it loads unconditionally |
|---|---|---|---|
| `claude` | 95 | skill, on demand | the charter alone — a rule with no globs is delivered as a skill instead, and every other rule attaches on paths |
| `cursor` | 95 | rule, pulled on relevance | the charter alone — a rule with no globs is pulled in when the conversation matches it |
| `copilot` | 95 | skill, on demand | the charter alone — a rule with no globs is delivered as a skill instead, and every other rule attaches on paths |
| `codex` | 407 | skill, on demand | the charter plus the rules that must be unconditional — critical, floor-tagged, or anchored to a nested instruction file; the rest are skills |

Measured under `ruleDelivery: on-demand`, the shipped default. A rule that carries no globs has
no attach trigger, so under `always-on` claude and copilot load its whole body every session;
under `on-demand` it is projected as `.agents/skills/stamity-<rule-id>/SKILL.md` and the client
opens it when its description matches. Cursor is the one client that never needed the option —
its own rule layer already pulls such a rule on relevance. A repository can take the other
shape back with `stamity config set ruleDelivery always-on`, which moves the first two columns
and nothing else.

The line figures are the ratchet ceilings in `src/content/charter.ts`, each pinned at the load
measured on the last corpus refresh: the corpus suite fails the build when a client's real
composite differs from its cell in either direction, so a cell that grew is a slice nobody
authorised and one that shrank is a saving nobody wrote down. They are a bound a reader can
plan against, not a reading this page took as it rendered.

**What co-selecting codex costs every other client.** Selecting `codex` does not add a
codex-only file. It rewrites the root `AGENTS.md` that every other selected client already
reads, so a claude+codex repository hands claude the codex rules appendix too: 24952 bytes of
shared instruction text against 5192 without it — ≈4.8x the always-on bytes every co-selected
client pays.

**What codex folds, and what it pulls.** Under the delivery mode above, the appendix carries 3
rules — `injection-screening`, `secrets`, `security-patterns` — and they are there for the
reason the client has no conditional layer to put them anywhere else: each is either marked
critical or carries a `floor:*` tag, and a floor that loads on relevance is a floor that stops
binding the moment the model does not notice it applies. The other 9 rules are projected as
`.agents/skills/stamity-<rule-id>/SKILL.md` instead, one directory each.

**What that costs the clients beside it.** Those directories sit in the SHARED
`.agents/skills/` tree, which cursor, copilot and codex all read — a directory cannot be made
client-specific, so it holds the union of every selected client's demotions. Co-selecting
`codex` therefore hands `cursor` 9 and `copilot` 7 rules a second time: each is already
delivered to that client as its own `.mdc` rule or `.instructions.md` file, and is now also
description-pullable as a skill. The duplicate is pulled on relevance and never loaded at
launch, so it moves none of the line figures above — and a selection without `codex` does not
pay it at all. `claude` is absent from that list because it reads no shared tree: its native
skills directory carries only the rules it demoted itself.

That trade is paid in a second budget, so it is measured too. The client holds every skill's
name and description for the whole session in order to decide when to open one, and caps that
list at 8000 characters when the context window is unknown. The full selection measures 5570 —
the shipped skills plus the projected rules — and emission refuses outright rather than
truncating past the cap, the same way it refuses an oversized instruction file. The remaining
headroom is what a repository's own skills spend into.

The appendix is shaped to the client's own 32 KiB ceiling, lowest risk first — rules marked
critical are kept longest, then floor-tagged rules, then declared precedence, then id. On the
full selection it drops 0 rules. The emitted file names any it dropped in its own omission
notice, so the current set is read there rather than here. Re-measure with `node
scripts/generate-capability-matrix.mjs` after a corpus change.

## Plugin containers

A release also publishes one plugin root per client. Each root's own emitter module decides
which artifact classes travel inside it and which stay in the repository, and this table is
built from those modules rather than beside them. `carried` means the root ships the class
and the client reads it from there; the repository-owned column is what
`stamity plugin setup` writes instead. Together the two columns cover every class, so no
class is left without an owner.

| Client | Container manifest | Carries | Repository-owned | Invocation | Root variable | Client floor |
|---|---|---|---|---|---|---|
| `claude` | `.claude-plugin/plugin.json` | agent, skill, command, hooks | rule, mcp | agents `@stamity:<id>`, commands `/stamity:<id>`, skills `/stamity:<id>` | `CLAUDE_PLUGIN_ROOT` | 2.1.224 — the archive-source floor; no floor for the plugin system as a whole is stated |
| `cursor` | `.cursor-plugin/plugin.json` | agent, skill, command, rule, hooks | mcp | agents `/<id>`, commands `/<id>`, skills `/<id>` | `CURSOR_PLUGIN_ROOT` | unknown — no minimum version stated on cursor.com/docs/reference/plugins, cursor.com/docs/plugins or the CLI reference (accessed 2026-09-20) |
| `copilot` | `plugin.json` | agent, skill, command, hooks | rule, mcp | agents `/agent <id> (or --agent=<id>)`, commands `/<id>`, skills `/<id>` | `PLUGIN_ROOT` | unknown — no minimum CLI version for plugins stated on the four docs.github.com pages read 2026-09-20; the CLI itself needs Node 22 or later |
| `codex` | `plugin.json` | skill, hooks | agent, command, rule, mcp | skills `$<id>` | `PLUGIN_ROOT` | unknown — no minimum version is stated on any of the eight vendor pages read 2026-09-20 (the build and submission pages above, learn.chatgpt.com/docs/plugins, /docs/hooks and /docs/config-file/config-reference, the Agent Plugins specification and its 1.0.0 schema); the surface was measured against codex-cli 0.154.0 |

Sources:

- `claude`: <https://code.claude.com/docs/en/plugin-marketplaces> — accessed 2026-09-20
- `cursor`: <https://cursor.com/docs/reference/plugins> — accessed 2026-09-20
- `copilot`: <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference> — accessed 2026-09-20
- `codex`: <https://developers.openai.com/plugins/build/plugins> — accessed 2026-09-20

## Dialect facts by client

### `claude`

| Fact | Declared value |
|---|---|
| Rule shape | `.claude/rules/<id>.md` with frontmatter `paths:` — a YAML glob list, matched when Claude reads a file; a rule with no `paths` is loaded unconditionally at launch, at CLAUDE.md priority. Also read by VS Code Copilot |
| Agent format | `.claude/agents/<id>.md` — frontmatter (`name`, `description`, `tools:` comma list, `model:` alias or pinned id, `effort:` level) over a markdown system prompt |
| Hook config | `.claude/settings.json` |
| Reads `.agents/skills/` | no |
| MCP dialect | `claude-json` |
| Entry file | `CLAUDE.md` |

Declared caps:

| Cap | Declared value |
|---|---|
| `entry-file-budget` | ~200-line CLAUDE.md working target; the bridge emits one managed import block, leaving the budget to the user |
| `permission-rows` | 3 |
| `hook-enforcement` | fail-closed — blocking exit code: 2 |
| `skills-access` | native — the projection is copied to `.claude/skills/<skill>/SKILL.md`, this client's project-level skills location, so the client loads a skill when it is relevant and `/<skill>` invokes one directly |
| `command-surface` | native — one file per touchpoint command at `.claude/commands/<id>.md`, invoked as `/<id>`; description-only frontmatter, so nothing is pre-approved that the permissions chain does not already grant |
| `review-gate` | work-scoped gate on `TaskCompleted` + `SubagentStop` — Claude-only extensions, non-portable. fail-closed: a completion with an open review round is refused, and the gate opens at the round cap so it can never wedge a run |
| `config-change-event` | `ConfigChange` tamper wiring — Claude-only extension, non-portable |
| `effort-scale` | low, medium, high, xhigh, max — the levels this client's `effort:` key accepts; available levels depend on the model, so a level the chosen model does not offer falls back to that model's own default (code.claude.com/docs/en/sub-agents, accessed 2026-09-17). A level below this scale is raised to `low` rather than dropped, and the emission discloses it |

Sources:

- <https://code.claude.com/docs/en/memory> — accessed 2026-09-10
- <https://code.claude.com/docs/en/skills> — accessed 2026-09-10
- <https://code.claude.com/docs/en/sub-agents> — accessed 2026-09-10
- <https://code.claude.com/docs/en/hooks> — accessed 2026-09-10
- <https://code.claude.com/docs/en/settings> — accessed 2026-09-10

### `cursor`

| Fact | Declared value |
|---|---|
| Rule shape | `.cursor/rules/<id>.mdc` — `description` plus `globs` as an unquoted comma-separated list with no spaces; `alwaysApply: false` on every emitted rule |
| Agent format | `.cursor/agents/<id>.md` — `description`, `model` (the operator's pinned id for the role's class, carrying this client's `[effort=…]` parameter; the key is omitted entirely when no pin names one, so the client applies its own default rather than the engine restating it), `readonly` |
| Hook config | `.cursor/hooks.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `cursor-json` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `rule body` | 500 lines per rule, refused above |
| `hook enforcement` | Exit 2 denies; failClosed: true also denies hook errors and timeouts, and this client counts no output as such a failure (cursor.com/docs/hooks, accessed 2026-09-17), so every allow is written explicitly. Emitted on both guards and on any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on |
| `hook timeout` | timeoutMs converts to native timeout seconds, rounded up; the portable runner also bounds the child to the requested milliseconds |
| `command surface` | `.cursor/skills/<id>/SKILL.md` with `disable-model-invocation: true` — this client folded slash commands into skills, so no `.cursor/commands/` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills |
| `user hook enforcement` | explicit exit-2 denial applies on supported events; authored pre-tool-use rows also opt into failClosed for hook errors and timeouts, and no output counts as one of those failures (cursor.com/docs/hooks, accessed 2026-09-17), so a row that decides nothing is emitted as an explicit allow. Session-start and session-end responses cannot block |
| `MCP tool surface` | servers expose tools through mcp.json; the current contract documents no fixed per-session tool-count cap |
| `workdir guard` | not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release |
| `effort-scale` | minimal, low, medium, high, xhigh, max: pass-through — parameter ids and values vary by model (cursor.com/docs/sdk/typescript, accessed 2026-09-17). The level rides inside the model value as `[effort=<level>]` and this client parses the group rather than ruling on the value, so nothing is narrowed here: a level the chosen model does not offer is the model's to reject, and no key is emitted at all until a model id is pinned |

Sources:

- <https://cursor.com/docs/context/rules> — accessed 2026-09-10
- <https://cursor.com/docs/agent/subagents> — accessed 2026-09-10
- <https://cursor.com/docs/hooks> — accessed 2026-09-17
- <https://cursor.com/docs/skills> — accessed 2026-09-10
- <https://cursor.com/docs/mcp> — accessed 2026-09-10

### `copilot`

| Fact | Declared value |
|---|---|
| Rule shape | `.github/instructions/<id>.instructions.md` with `applyTo:` — ONE glob string, patterns comma-separated, never a YAML list |
| Agent format | `.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `tools:` alias list, `model:` only under an operator pin) over a markdown prompt |
| Hook config | `.github/hooks/stamity.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `vscode-json` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `agent-prompt-chars` | 30000 |
| `charter-budget` | ~2 pages; AGENTS.md is native, so no mirror is emitted |
| `command-surface` | native — the nine touchpoints ship as prompt files in .github/prompts/, invoked as /st-<id>; the format's `agent` and `tools` keys stay unemitted (per-prompt restrictions this engine cannot answer), `model` follows an operator pin |
| `effort-axis` | omitted — this surface publishes no effort key and no model-value parameter, the one documented omission of the reasoning-effort axis |
| `hook-enforcement` | preToolUse exit 2, errors and JSON deny block. Timeouts always fail-open; other events are advisory unless documented. The identity-free core role guard is telemetry. sessionStart output reaches the session: it is injected as additionalContext (docs.github.com hooks reference, 2026-09-17). |
| `deny-gate` | Repository hooks target Copilot CLI/cloud. preToolUse denies via native JSON or nonzero exit; timeouts fail-open. The core role guard has no calling-agent identity and remains telemetry. |
| `rule-activation` | glob only; no description-pull mode, so an agent-requested rule emits applyTo: "**" |
| `rule-precedence` | not expressible — Copilot has no ordering primitive |
| `mcp-documents` | two — the editor `vscode-json` document plus the coding agent's `copilot-env` repo settings |
| `mcp-approval` | configuration-time — a coding-agent server is approved by a repository administrator when it is entered in the repository's Copilot settings, so a server's trust is decided when it is configured, not when the agent runs; the editor `vscode-json` document is the user's own and that approval does not cover it (coding-agent MCP configuration docs, re-read 2026-08-22 for this claim alone) |

Sources:

- <https://docs.github.com/en/copilot/reference/custom-agents-configuration> — accessed 2026-09-10
- <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment> — accessed 2026-09-10
- <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide> — accessed 2026-09-10
- <https://code.visualstudio.com/docs/copilot/customization/prompt-files> — accessed 2026-09-10
- <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-09-17

### `codex`

| Fact | Declared value |
|---|---|
| Rule shape | no glob-scoped rule layer; conditional rules down-convert into nested AGENTS.md files (documented lossy — upstream gap: open codex#34002) |
| Agent format | TOML subagent definitions under .codex/agents/ |
| Hook config | `.codex/hooks.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `codex-toml` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `AGENTS.md budget` | 32768 bytes (32 KiB) |
| `hook enforcement` | exit 2 denies supported tool calls after native /hooks trust; the core role guard is telemetry because PreToolUse has no agent identity. Hosted tools and specialized paths may bypass hooks; use native sandbox/permissions for enforcement. Three steps stand between the emitted hooks.json and a hook that runs — `features.hooks = true`, which this engine writes into .codex/config.toml and the client defaults OFF; `projects.<path>.trust_level = "trusted"` in the operator's own Codex home config; and a per-hook hash review through the interactive /hooks command, or --dangerously-bypass-hook-trust for automation that cannot take that step — and with all three in place headless `codex exec` on codex-cli 0.154.0 still loaded no project hook layer at all in this repository's 2026-09-15 measurement, so a hook is enforcement in the interactive client and nothing in that lane. |
| `per-agent tool allowlist` | no native per-agent tools list is documented as of 2026-09-10; no placeholder key is emitted. sandbox_mode carries the supported filesystem boundary; the policy grant remains a prompt-level restriction. |
| `command-surface` | none — custom prompts live in the user's Codex home directory, not the repository, and are deprecated in favour of skills, so the nine touchpoint bodies are not emitted here; the charter's touchpoint index still names them |
| `effort-scale` | minimal, low, medium, high, xhigh — the levels this client's `model_reasoning_effort` key accepts; xhigh is model-dependent, so a model that does not offer it falls back to that model's own default (learn.chatgpt.com/docs/config-file/config-reference, accessed 2026-09-17). This is the only supported client documenting `minimal`, and the only one that cannot be asked for `max`: a `max` request is emitted as `xhigh` with a disclosure, never dropped |

Sources:

- <https://learn.chatgpt.com/docs/agent-configuration/subagents> — accessed 2026-09-10
- <https://learn.chatgpt.com/docs/hooks> — accessed 2026-09-17
- <https://learn.chatgpt.com/docs/config-file/config-reference> — accessed 2026-09-15
- <https://learn.chatgpt.com/docs/custom-prompts> — accessed 2026-09-10

## Hook guarantee honesty

A hook written once is a gate on some of these clients and telemetry on others. Each row
states what that client enforces, read from the same table the emitters use, so this page
and the emitted guards cannot disagree. Rows keep the ladder order: strongest first.

| Client | Fail mode | Blocking exit code | What an operator actually gets |
|---|---|---|---|
| `claude` | `fail-closed` | `2` | Exit 2 blocks the pending action and returns stderr to the agent; exit 0 with structured stdout feeds the session instead. |
| `codex` | `fail-closed` | `2` | Exit-2 denies supported tool calls after native /hooks trust. PreToolUse carries no agent identity, so the core role guard is telemetry; hosted tools and specialized paths may bypass hooks. |
| `copilot` | `fail-closed` | `2` | preToolUse exit 2, errors and JSON deny block. Timeouts always fail-open; other events are advisory unless documented. The identity-free core role guard is telemetry. sessionStart output reaches the session: it is injected as additionalContext (docs.github.com hooks reference, 2026-09-17). |
| `cursor` | `opt-in-fail-closed` | `2` | Exit 2 denies the action. failClosed opts supported events into denial on hook errors and timeouts; the identity-free core role guard remains telemetry. |

## Agent tool-allowlist enforcement coverage

How far each client can actually hold an agent to its granted tools. Where a client
exposes no primitive the emission is none at all — a guessed frontmatter key reads to an
operator as a restriction that is not there. 4 clients, one row each:

| Client | Mechanism | Strength |
|---|---|---|
| `claude` | `tools:` sub-agent frontmatter allowlist (comma-separated names); an omitted field inherits every tool, and a list resolving to nothing refuses the spawn; the four verdict roles also carry `Write` in the repository layout, which the generated pre-tool-use guard admits only for a regular file matching the row's `writePaths` under the repository root — never `Edit` or `NotebookEdit`; a plugin install (a plugin hook root or plugin-owned hooks) renders no `Write`, and those roles return their full report inline there | hard |
| `cursor` | `readonly:` boolean — blocks file edits and state-changing shell commands, but cannot name individual tools, so network and delegation grants are unexpressed; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder | soft |
| `copilot` | `tools:` alias list where `[]` grants nothing; tool-level only, with no sub-tool (per-shell-command) granularity; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder | hard |
| `codex` | no documented native per-agent `tools` key in `.codex/agents/*.toml`; the role grant is developer-instruction prose, while `sandbox_mode` supplies the supported filesystem boundary; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder | soft (provisional) |

## Currency and revisit triggers

The standing check is per release: re-read each client's sources, regenerate this page, and
the diff is the currency report. On top of it, these named conditions each re-open a
decision when they fire. A row states where its condition stands in this repo today and the
oldest access date among the watched client's sources — the bound on how stale that status
can be, since nothing here re-reads a page on its own.

| Revisit when | Then | Status today | Where the status is read |
|---|---|---|---|
| Antigravity adoption/demand | adapter #5 | No adapter, so no row above carries a source for it — the trigger is adoption or demand, not a page this repo re-reads. | unwatched — no supported client carries a source for it |
| codex#34002 resolution | native glob emission | Open — that client's declared rule shape still down-converts conditional rules into nested `AGENTS.md` files. | `codex`, oldest source read 2026-09-10 |
| Claude Code AGENTS.md support change | drop the bridge | Unchanged — `claude` is the one client still declaring an entry file, so the bridge block stays emitted. | `claude`, oldest source read 2026-09-10 |
| Agent Plugins scope expansion | container widens | Four containers are emitted — one root per client, built by `scripts/generate-plugin-packages.mjs` — and the Plugin containers section above states what each carries. The condition is now about the classes a container may hold: an agent or a command class reaching the Agent Plugins format would move two of codex's repository-owned rows into its root. | `claude`, oldest source read 2026-09-10 |
| VS Code deny-gate GA | recheck editor-specific hook compatibility | CLI/cloud preToolUse hooks are emitted now, with timeout fail-open. [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks) remain Preview; editor-specific compatibility needs separate verification. | `copilot`, oldest source read 2026-09-10 |
