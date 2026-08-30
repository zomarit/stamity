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
| `copilot` | none — `AGENTS.md` is native | yes | none emitted | `fail-open` — never blocks | `vscode-json` |
| `codex` | none — `AGENTS.md` is native | yes | `.codex/hooks.json` | `fail-closed` — blocks on exit `2` | `codex-toml` |

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
| `entry-file-budget` | ~200-line CLAUDE.md working target; the bridge emits one managed block (import + skills pointer), leaving the budget to the user |
| `permission-rows` | 3 |
| `hook-enforcement` | fail-closed — blocking exit code: 2 |
| `skills-access` | native — the projection is copied to `.claude/skills/<skill>/SKILL.md`, this client's project-level skills location, so the client loads a skill when it is relevant and `/<skill>` invokes one directly |
| `command-surface` | native — one file per touchpoint command at `.claude/commands/<id>.md`, invoked as `/<id>`; description-only frontmatter, so nothing is pre-approved that the permissions chain does not already grant |
| `review-gate` | work-scoped gate on `TaskCompleted` + `SubagentStop` — Claude-only extensions, non-portable. fail-closed: a completion with an open review round is refused, and the gate opens at the round cap so it can never wedge a run |
| `config-change-event` | `ConfigChange` tamper wiring — Claude-only extension, non-portable |

Sources:

- <https://code.claude.com/docs/en/memory> — accessed 2026-08-18
- <https://code.claude.com/docs/en/skills> — accessed 2026-08-18
- <https://code.claude.com/docs/en/sub-agents> — accessed 2026-08-18
- <https://code.claude.com/docs/en/hooks> — accessed 2026-08-18
- <https://code.claude.com/docs/en/settings> — accessed 2026-08-18

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
| `hook enforcement` | advisory by default; an entry declaring failClosed: true blocks on the exit-2 status. Emitted on both guards and on any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on |
| `hook timeout` | the config dialect carries a per-entry timeout in SECONDS; the interchange states one in milliseconds and it is dropped rather than rescaled at emission, so a declared timeout does not reach this client |
| `command surface` | `.cursor/skills/<id>/SKILL.md` with `disable-model-invocation: true` — this client folded slash commands into skills, so no `.cursor/commands/` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills |
| `user hook enforcement` | advisory unless the hook declares the pre-tool-use event; the interchange schema carries no per-hook blocking request |
| `MCP tool surface` | client-side lazy loading around a ~40-tool session budget, so a wide server selection can crowd out the rest |
| `workdir guard` | not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release |

Sources:

- <https://cursor.com/docs/context/rules> — accessed 2026-08-17
- <https://cursor.com/docs/agent/subagents> — accessed 2026-08-17
- <https://cursor.com/docs/agent/hooks> — accessed 2026-08-17
- <https://cursor.com/docs/skills> — accessed 2026-08-17
- <https://cursor.com/docs/mcp> — accessed 2026-06-09

### `copilot`

| Fact | Declared value |
|---|---|
| Rule shape | `.github/instructions/<id>.instructions.md` with `applyTo:` — ONE glob string, patterns comma-separated, never a YAML list |
| Agent format | `.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `tools:` alias list, `model:` only under an operator pin) over a markdown prompt |
| Hook config | none emitted |
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
| `hook-enforcement` | fail-open — blocking exit code: none; no hook config emitted v1 |
| `deny-gate` | VS Code PreToolUse `permissionDecision: "deny"` is Preview — emitted when it reaches GA |
| `rule-activation` | glob only; no description-pull mode, so an agent-requested rule emits applyTo: "**" |
| `rule-precedence` | not expressible — Copilot has no ordering primitive |
| `mcp-documents` | two — the editor `vscode-json` document plus the coding agent's `copilot-env` repo settings |

Sources:

- <https://docs.github.com/en/copilot/reference/custom-agents-configuration> — accessed 2026-08-17
- <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment> — accessed 2026-08-17
- <https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide> — accessed 2026-08-17
- <https://code.visualstudio.com/docs/copilot/customization/prompt-files> — accessed 2026-08-17
- <https://code.visualstudio.com/docs/agent-customization/hooks> — accessed 2026-08-17

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
| `hook enforcement` | fail-closed — a refusing hook exits 2 and the pending action stops |
| `per-agent tool allowlist` | none documented (provisional, re-verified 2026-08-17) — the comma-list dialect is a placeholder and `sandbox_mode` is the native primitive that binds |
| `command-surface` | none — custom prompts live in the user's Codex home directory, not the repository, and are deprecated in favour of skills, so the nine touchpoint bodies are not emitted here; the charter's touchpoint index still names them |

Sources:

- <https://learn.chatgpt.com/docs/agent-configuration/subagents> — accessed 2026-08-17
- <https://learn.chatgpt.com/docs/hooks> — accessed 2026-08-17
- <https://learn.chatgpt.com/docs/config-file/config-reference> — accessed 2026-08-17
- <https://learn.chatgpt.com/docs/custom-prompts> — accessed 2026-08-17

## Hook guarantee honesty

A hook written once is a gate on some of these clients and telemetry on others. Each row
states what that client enforces, read from the same table the emitters use, so this page
and the emitted guards cannot disagree. Rows keep the ladder order: strongest first.

| Client | Fail mode | Blocking exit code | What an operator actually gets |
|---|---|---|---|
| `claude` | `fail-closed` | `2` | Exit 2 blocks the pending action and returns stderr to the agent; exit 0 with structured stdout feeds the session instead. |
| `codex` | `fail-closed` | `2` | Adopts the interchange shape verbatim, exit-2 blocking included; emission is a config-dialect transform, not a semantic one. |
| `cursor` | `opt-in-fail-closed` | `2` | Advisory by default — a rejecting hook is logged and the action proceeds. Blocking requires opting the hook into fail-closed where it is declared. |
| `copilot` | `fail-open` | never blocks | Never blocks: a hook that rejects, errors, or times out is reported and the action proceeds, so treat a hook here as telemetry and put the gate in a permission rule. |

## Agent tool-allowlist enforcement coverage

How far each client can actually hold an agent to its granted tools. Where a client
exposes no primitive the emission is none at all — a guessed frontmatter key reads to an
operator as a restriction that is not there. 4 clients, one row each:

| Client | Mechanism | Strength |
|---|---|---|
| `claude` | `tools:` sub-agent frontmatter allowlist (comma-separated names); an omitted field inherits every tool, and a list resolving to nothing refuses the spawn | hard |
| `cursor` | `readonly:` boolean — blocks file edits and state-changing shell commands, but cannot name individual tools, so network and delegation grants are unexpressed | soft |
| `copilot` | `tools:` alias list where `[]` grants nothing; tool-level only, with no sub-tool (per-shell-command) granularity | hard |
| `codex` | no documented per-agent tool allowlist in `.codex/agents/*.toml`; the comma-list dialect is emitted as a placeholder and `sandbox_mode` is the candidate native primitive | soft (provisional) |

## Currency and revisit triggers

The standing check is per release: re-read each client's sources, regenerate this page, and
the diff is the currency report. On top of it, these named conditions each re-open a
decision when they fire. A row states where its condition stands in this repo today and the
oldest access date among the watched client's sources — the bound on how stale that status
can be, since nothing here re-reads a page on its own.

| Revisit when | Then | Status today | Where the status is read |
|---|---|---|---|
| Antigravity adoption/demand | adapter #5 | No adapter, so no row above carries a source for it — the trigger is adoption or demand, not a page this repo re-reads. | unwatched — no supported client carries a source for it |
| codex#34002 resolution | native glob emission | Open — that client's declared rule shape still down-converts conditional rules into nested `AGENTS.md` files. | `codex`, oldest source read 2026-08-17 |
| Claude Code AGENTS.md support change | drop the bridge | Unchanged — `claude` is the one client still declaring an entry file, so the bridge block stays emitted. | `claude`, oldest source read 2026-08-18 |
| Agent Plugins scope expansion | container widens | No container is emitted. Skills reach this client at its native skills location instead, per its declared `skills-access` cap. | `claude`, oldest source read 2026-08-18 |
| VS Code deny-gate GA | Copilot enforcement upgrade | Still Preview — the `copilot` deny-gate cap emits the gate when it reaches GA. | `copilot`, oldest source read 2026-08-17 |
