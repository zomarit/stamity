---
title: Client capability matrix
---

<!-- GENERATED FILE — do not edit by hand. Rewrite it with `node scripts/generate-capability-matrix.mjs`. -->

# Client capability matrix

Every cell below renders from code: the dialect facts each client's residue planner
declares, the hook-guarantee ladder the emitters read, the dated table of what each vendor's
cloud runs, and the tool-allowlist coverage the translator applies. A test re-renders this
page and byte-compares this file, so it cannot be hand-edited and cannot lag a change to
those declarations.

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

| Client | Entry file | Reads `.agents/skills/` | Hook config | Hook enforcement | MCP dialect | In the vendor's cloud |
|---|---|---|---|---|---|---|
| `claude` | `CLAUDE.md` | no | `.claude/settings.json` | `fail-closed` — blocks on exit `2` | `claude-json` | repository hooks run in a one-repository session; none with several repositories — read 2026-10-15 |
| `cursor` | none — `AGENTS.md` is native | yes | `.cursor/hooks.json` | `opt-in-fail-closed` — blocks on exit `2` | `cursor-json` | repository hooks run, without `sessionStart`, `sessionEnd` or the MCP hooks — read 2026-10-15 |
| `copilot` | none — `AGENTS.md` is native | yes | `.github/hooks/stamity.json` | `fail-closed` — blocks on exit `2` | `vscode-json` | repository hooks run, loaded from the clone, only when on the default branch — read 2026-10-15 |
| `codex` | none — `AGENTS.md` is native | yes | `.codex/hooks.json` | `fail-closed` — blocks on exit `2` | `codex-toml` | no project hooks documented; assume none run — read 2026-10-15 |

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
| `codex` | 407 | skill, on demand | the charter plus the rules that must be unconditional — critical, floor-tagged, or anchored to a nested instruction file; the rest are skills — 25800 bytes, in its own `AGENTS.override.md` |

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

**What co-selecting codex costs every other client: nothing at the root.** Codex's rules
appendix goes to a codex-only root `AGENTS.override.md`, which codex reads instead of
`AGENTS.md` and no other client reads at all, so the shared root `AGENTS.md` is 5610 bytes with
codex selected and 5610 without it. The override repeats the charter — an operator's own text
in `AGENTS.md` included — and adds the appendix: 25800 bytes, ≈4.6x the shared file, paid by
codex alone. It is regenerated from `AGENTS.md` as each sync leaves it, and leaves out the one
part of that file it does not repeat, Cursor's cloud block below. Under a `supplement` or
`skip` import decision the operator's own text in `AGENTS.md` survives, so an edit to that text
reaches codex at the next sync and `check` reports it as drift on the override until then. With
no import decision, or `replace`, `AGENTS.md` is engine-owned whole: a hand edit to it is drift
the next sync restores behind a `.bak`, and it never reaches the override. An `AGENTS.md` that
is a symbolic or hard link, or whose operator text carries a block-severity injection pattern,
is not repeated: `sync` and `check` report the override as a collision.

**What co-selecting cursor costs every client that reads the shared file.** With cursor
selected, the root `AGENTS.md` ends on a `Cursor Cloud specific instructions` block — Node
first, the skill paths, the learnings read, the draft pull request and the unattended rule — 14
lines counted apart from the line figures above, so the file is 6476 bytes with cursor and 5610
without it. A cursor session therefore loads its ceiling plus the block, 95 + 14 = 109 lines,
as a claude or copilot session on a selection with cursor loads its own ceiling plus the block.
Cursor and copilot read it natively, and claude pays it too, through its `CLAUDE.md`'s
`@AGENTS.md` import: on a claude and cursor selection a claude session loads the block every
time. Codex reads its own `AGENTS.override.md` instead wherever one is emitted, which never
carries it, and nested `AGENTS.md` copies do not either. With the root `AGENTS.md` recorded as
`skip` the block is not written, and `init` and `sync` say so in their warnings.

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
list at 8000 characters when the context window is unknown. The full selection measures 4759 —
the shipped skills and the projected rules, the rows the client shows its model; a touchpoint
is left out of that list by its `agents/openai.yaml` policy and counts for nothing — and
emission refuses outright rather than truncating past the cap, the same way it refuses an
oversized instruction file. The remaining headroom is what a repository's own skills, and an
installed pack's, spend into.

The appendix is shaped to the client's own 32 KiB ceiling, lowest risk first — rules marked
critical are kept longest, then floor-tagged rules, then declared precedence, then id. On the
full selection it drops 0 rules. The emitted file names any it dropped in its own omission
notice, so the current set is read there rather than here. Re-measure with `node
scripts/generate-capability-matrix.mjs` after a corpus change.

## Dialect facts by client

### `claude`

| Fact | Declared value |
|---|---|
| Rule shape | `.claude/rules/<id>.md` with frontmatter `paths:` — a YAML glob list, matched when Claude reads a file; a rule with no `paths` is loaded unconditionally at launch, at CLAUDE.md priority. Also read by VS Code Copilot |
| Agent format | `.claude/agents/<id>.md` — frontmatter (`name`, `description`, `tools:` comma list, `model:` alias or pinned id, `effort:` level) over a markdown system prompt; the class-to-model map at `.stamity/generated/models/claude.json` |
| Hook config | `.claude/settings.json` |
| Reads `.agents/skills/` | no |
| MCP dialect | `claude-json` |
| Entry file | `CLAUDE.md` |

Declared caps:

| Cap | Declared value |
|---|---|
| `entry-file-budget` | ~200-line CLAUDE.md working target; the bridge emits one managed import block, leaving the budget to the user |
| `hook-enforcement` | fail-closed — blocking exit code: 2 |
| `skills-access` | native — the projection is copied to `.claude/skills/<skill>/SKILL.md`, this client's project-level skills location, so the client loads a skill when it is relevant and `/<skill>` invokes one directly |
| `command-surface` | native — one file per touchpoint command at `.claude/commands/<id>.md`, invoked as `/<id>`; description-only frontmatter, so no command pre-approves a tool |
| `review-gate` | work-scoped gate on `TaskCompleted` + `SubagentStop` — Claude-only extensions, non-portable. fail-closed: a completion with an open review round is refused, and the gate opens at the round cap so it can never wedge a run |
| `config-change-event` | `ConfigChange` tamper wiring — Claude-only extension, non-portable |
| `effort-scale` | low, medium, high, xhigh, max — the levels this client's `effort:` key accepts; available levels depend on the model, so a level the chosen model does not offer falls back to that model's own default (code.claude.com/docs/en/sub-agents, accessed 2026-09-17). A level below this scale is raised to `low` rather than dropped, and the emission discloses it |

Sources:

- <https://code.claude.com/docs/en/memory> — accessed 2026-09-30
- <https://code.claude.com/docs/en/skills> — accessed 2026-09-30
- <https://code.claude.com/docs/en/sub-agents> — accessed 2026-09-30
- <https://code.claude.com/docs/en/hooks> — accessed 2026-09-30
- <https://code.claude.com/docs/en/settings> — accessed 2026-09-30

### `cursor`

| Fact | Declared value |
|---|---|
| Rule shape | `.cursor/rules/<id>.mdc` — `description` plus `globs` as an unquoted comma-separated list, the vendor's separator (its own example puts a space after the comma; the no-spaces form is this engine's choice — cursor.com/docs/context/rules, accessed 2026-09-30); `alwaysApply: false` on every emitted rule |
| Agent format | `.cursor/agents/<id>.md` — `description`, `model` (the operator's pin for the role's class, as typed; a pin that is not a listed variant carries this client's `[effort=…]` parameter. Only a pin is written. Cursor offers a sub-agent a narrower list of models than `agent models` prints, and refuses a `Task` call that names a model outside it: in a live run on 2026-10-15 it refused the class model picked from the account's saved list, so no model is picked from that list. In one live run the same day that sub-agent list changed with the parent agent's model; one named parent model was tried, so that the list follows the parent's model beyond that run is unverified (`.stamity/runs/2026-10-14_cli-native/record.md` on the `records` branch, QA row 3, its first two prover rounds). An unpinned role's key is omitted, so its sub-agent runs on the parent agent's model: Cursor documents the parent agent's model as a sub-agent's default unless its `model` names an id (cursor.com/docs/subagents, read 2026-10-15), and its refusal text says the same of an omitted model. No live run has dispatched this setup's unpinned sub-agent, so that it runs is unverified (the same record, QA row 3's re-walk on the fix). A pinned model is a default, not a hard limit; Stamity carries it on the dispatch and by a hook — the touchpoints pass the class model from `.stamity/generated/models/cursor.json` (the same model id, without an engine-added `[effort=…]` group) on each sub-agent call, and a `preToolUse` hook on `Task` fills it into a Stamity call that names none (`updated_input`; cursor.com/docs/agent/subagents and cursor.com/docs/hooks, accessed 2026-10-14)), `readonly` |
| Hook config | `.cursor/hooks.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `cursor-json` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `rule body` | 500 lines per rule, refused above |
| `hook enforcement` | Exit 2 denies; failClosed: true also denies hook errors and timeouts, and this client counts no output as such a failure (cursor.com/docs/hooks, accessed 2026-09-17), so every allow is written explicitly. Emitted on both guards, the person-only shell guard on beforeShellExecution and any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on |
| `hook timeout` | timeoutMs converts to native timeout seconds, rounded up; the portable runner also bounds the child to the requested milliseconds |
| `command surface` | `.agents/skills/<id>/SKILL.md` with `disable-model-invocation: true`, invoked as `/<id>` — this client folded slash commands into skills, so no `.cursor/commands/` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills, in the shared tree Codex reads too, one file per touchpoint |
| `user hook enforcement` | explicit exit-2 denial applies on supported events; authored pre-tool-use rows also opt into failClosed for hook errors and timeouts, and no output counts as one of those failures (cursor.com/docs/hooks, accessed 2026-09-17), so a row that decides nothing is emitted as an explicit allow. Session-start and session-end responses cannot block |
| `MCP tool surface` | servers expose tools through mcp.json; the current contract documents no fixed per-session tool-count cap |
| `workdir guard` | not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release |
| `effort-scale` | minimal, low, medium, high, xhigh, max, ultra: pass-through — parameter ids and values vary by model (cursor.com/docs/sdk/typescript, accessed 2026-09-17). The level rides inside the model value as `[effort=<level>]` and this client parses the group rather than ruling on the value, so nothing is narrowed here: a level the chosen model does not offer is the model's to reject. No group follows an id that already names its effort variant (one on the account's list, or one ending on an effort word), and no key is emitted at all until a model id is pinned |

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
| Agent format | `.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `include-custom-instructions: true`, `tools:` alias list, `model:` the class model's display name as `<name> (copilot)` where the shipped list gives one (whether any reader takes it on a `target: github-copilot` agent is unverified), `models:` the class's CLI ids in priority order whenever the class resolves — the operator's pin, else the first shipped candidate the account's saved list holds, else, only when no list was read, the shipped list's first entry; a saved list holding none of the class's candidates writes neither key — `reasoning-effort:` at the declared class's level) over a markdown prompt; the class-to-model map at `.stamity/generated/models/copilot.json` |
| Hook config | `.github/hooks/stamity.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `vscode-json` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `agent-prompt-chars` | 30000 |
| `charter-budget` | ~2 pages; AGENTS.md is native, so no mirror is emitted |
| `command-surface` | native — the nine touchpoints ship as prompt files in .github/prompts/, invoked as /st-<id>; the format's `agent` and `tools` keys stay unemitted (per-prompt restrictions this engine cannot answer), `model` follows an operator pin. With Codex or Cursor selected beside it, the same nine also ship in `.agents/skills/` with `disable-model-invocation: true`, a tree this client reads, so they list twice for the operator: Copilot CLI 1.0.89 shows them as project skills (`copilot skill list`) beside the prompt files, and keeps them out of the model's own skills list (measured 2026-09-30) |
| `effort-axis` | emitted — `reasoning-effort: <level>` per agent, on the scale `low` … `max` (Copilot CLI reference, accessed 2026-10-10; the key in the 1.0.89 loader and its changelog, 1.0.66 and 1.0.88); a live run on Copilot CLI 1.0.89 (2026-10-11) loaded an agent carrying `reasoning-effort: high` and its sub-agent ran at that level (`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` branch, QA row 2); a level the model does not offer is reported and falls back to the session's; the cloud agent's handling of the key is undocumented (custom-agents configuration page, accessed 2026-10-10) |
| `sub-agent-instructions` | emitted — `include-custom-instructions: true` on every agent (Copilot CLI changelog 1.0.86; the key sits in the 1.0.89 loader's frontmatter keys); a live sub-agent check on Copilot CLI 1.0.89 (2026-10-10) found that an agent without it loads no `AGENTS.md`, and a live run on 1.0.89 (2026-10-11) with the key emitted loaded it: the sub-agent quoted the charter's version line (`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` branch, QA row 2); `--no-custom-instructions` overrides it (Copilot CLI command reference, accessed 2026-10-10; unverified on 1.0.89, where no live run passed the flag); the cloud agent's handling of the key is undocumented (custom-agents configuration page, accessed 2026-10-10) |
| `model-pick` | emitted — `models: [<id>, …]` per agent whenever the class resolves, the class's CLI ids in priority order: the runtime uses the first one the plan can access, falls back to the session's model when none resolves, and `models` overrides `model`; under an Auto session model a sub-agent inherits the resolved session model whatever the file says (Copilot CLI command reference, read 2026-10-14). That behaviour is the reference's claim: no live run has loaded an agent carrying `models` or `model`, and which CLI version's loader takes `models` is unchecked. No `modelPolicy` is written, so a `/subagents` override still wins. `model:` carries the display name in the qualified `<name> (copilot)` form VS Code's custom-agents page documents (read 2026-10-14), only where the shipped list gives one; whether VS Code reads it on these agents is unverified, since every one sets `target: github-copilot`. A pin typed as a display name is not written, and `sync` warns. The class-to-model map at `.stamity/generated/models/copilot.json` holds the same ids |
| `cloud-model` | the task's model picker decides — the cloud agent runs on the model picked when the task is assigned or started, and on Auto where no picker is offered; its model page names no custom-agent model key, so the agent file's `model` and `models` are not documented to bind there (cloud agent model page, read 2026-10-14) |
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
- <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-14
- <https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference> — accessed 2026-10-10
- <https://code.visualstudio.com/docs/agent-customization/custom-agents> — accessed 2026-10-14
- <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/changing-the-ai-model> — accessed 2026-10-14

### `codex`

| Fact | Declared value |
|---|---|
| Rule shape | no glob-scoped rule layer; conditional rules down-convert into nested AGENTS.md files and a Codex-only root AGENTS.override.md, which this client reads instead of the shared AGENTS.md (documented lossy — upstream gap: open codex#34002) |
| Agent format | TOML subagent definitions under .codex/agents/ — `model` whenever the class resolves (the operator's pin, else the first shipped candidate the account's saved `codex debug models` list holds, else, only when no list was read, the shipped list's first entry; a saved list holding none of the class's candidates writes none) and `model_reasoning_effort` at the class's level; a value in the file takes precedence over the spawn's and the parent's (subagents page, accessed 2026-10-14); the class-to-model map at `.stamity/generated/models/codex.json` |
| Hook config | `.codex/hooks.json` |
| Reads `.agents/skills/` | yes |
| MCP dialect | `codex-toml` |
| Entry file | none — `AGENTS.md` is native |

Declared caps:

| Cap | Declared value |
|---|---|
| `AGENTS.md budget` | 32768 bytes (32 KiB) |
| `hook enforcement` | exit 2 denies supported tool calls after native /hooks trust; the core role guard is telemetry because PreToolUse has no agent identity. Hosted tools and specialized paths may bypass hooks; use native sandbox/permissions for enforcement. Three steps stand between the emitted hooks.json and a hook that runs — the hooks feature, which Codex turns on by default and this engine renders as `[features] hooks = true` in .codex/config.toml, though an owner's own `[features]` table is kept in its place and `check` fails while a kept key sets hooks false (`hooks`, `"hooks"` or `'hooks'` in `[features]`, a root `features.hooks`, or the `codex_hooks` alias); `projects.<path>.trust_level = "trusted"` in the operator's own Codex home config; and a per-hook hash review through the interactive /hooks command, or --dangerously-bypass-hook-trust for automation that cannot take that step. Headless `codex exec` ran no project hook on codex-cli 0.154.0 in this repository's 2026-09-15 measurement, with the feature on, the project trusted through a per-invocation `-c` override and hook trust bypassed. On codex-cli 0.155.1 (measured 2026-09-30) the hooks feature is on by default, a project-file `hooks = false` did not turn it off under that same override, and `codex exec` again ran no project hook in 3 of 3 runs; because the override may leave the project `.codex/` layer unloaded, the cause is not isolated (exec itself, or a layer that never loaded), and a run with the project trusted in the home config is unmeasured. So a hook is enforcement in the interactive client, and nothing measured in the headless lane. |
| `per-agent tool allowlist` | no native per-agent tools list is documented as of 2026-09-10; no placeholder key is emitted. sandbox_mode carries the supported filesystem boundary; the policy grant remains a prompt-level restriction. |
| `command-surface` | `.agents/skills/st-<id>/SKILL.md`, invoked as `$st-<id>` — the nine touchpoint bodies ship as shared skills, one file each, read by Cursor too, each with an `agents/openai.yaml` companion carrying `policy.allow_implicit_invocation: false`. Measured on codex-cli 0.155.1 (2026-09-30): `$st-work` loads the touchpoint. Whether a plain ask can still start one is unmeasured. Custom prompts are not used: they live in the user's Codex home directory, not the repository, and are deprecated in favour of skills |
| `effort-scale` | low, medium, high, xhigh, max, ultra — the levels this client's `model_reasoning_effort` key accepts; the available levels depend on the model and client (learn.chatgpt.com/docs/config-file/config-reference, accessed 2026-10-10). This is the only supported client documenting `ultra`. The reference no longer lists `minimal`; this client's parser still takes it, so `minimal` is accepted and written as `low`, with a disclosure |
| `model-escalation` | a per-call escalation does not change the model of a role whose agent file carries `model` — a value in the file takes precedence over the spawn's, the `[agents]` default's and the parent's, for `model` and `model_reasoning_effort` alike, so such a role runs on its file's model whatever model the call names (learn.chatgpt.com/docs/agent-configuration/subagents, read 2026-10-14). A file carries `model` whenever its class resolves: the operator's pin, else the first shipped candidate the account's saved list holds, else, only when no list was read, the shipped list's first entry; a saved list holding none of the class's candidates writes no `model`, and neither does an agent that declares no ladder class, and there the spawn's model, else the parent's, applies, so an escalation does bind. Escalating a role whose file carries `model` means pinning its class (`stamity config set model.<class>.codex <id>`) and re-syncing |

Sources:

- <https://learn.chatgpt.com/docs/agent-configuration/subagents> — accessed 2026-10-14
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

## Cloud sessions

What each client's vendor-hosted session runs of this setup's hooks, and what it does not
enforce there, one dated fact a row. The session-start hook names a detected cloud session and
prints the session line each of that client's rows carries. A row marked `not documented`
states the assumption made where the cited page is silent; one marked `unverified` names the
part no page read on its date supports. The person check column names the run that saw a fact
happen in that cloud, and reads `not run` where none has.

| Client | Subject | Fact | Session start prints | Status | Source | Person check |
|---|---|---|---|---|---|---|
| `claude` | Project hooks | Claude Code on the web runs the hooks in the clone's `.claude/settings.json` in a session with one repository. A session with several repositories loads no repository's hooks, and user-level `~/.claude/settings.json` hooks stay on the operator's machine. | — | documented | <https://code.claude.com/docs/en/cloud-environments> — accessed 2026-10-15 | not run |
| `claude` | Session marker | `CLAUDE_CODE_REMOTE` is `true` in the session VM and never `true` locally. | — | documented | <https://code.claude.com/docs/en/cloud-environments> — accessed 2026-10-15 | not run |
| `claude` | GitHub access | The GitHub proxy refuses GraphQL with a 403, so `gh pr`, `gh issue` and Projects v2 fail; `gh api` over REST works. | GraphQL, gh pr, gh issue and Projects are unavailable here; use gh api. | documented | <https://code.claude.com/docs/en/cloud-environments> — accessed 2026-10-15 | not run |
| `claude` | Session state | A reclaimed VM is rebuilt fresh when the session reopens, so state the hooks wrote there, the review gate's round counter included, does not carry over. | A missing review-gate counter is rebuilt from the run record on this branch. | documented | <https://code.claude.com/docs/en/cloud-environments> — accessed 2026-10-15 | not run |
| `claude` | Draft pull request | The GitHub proxy refuses a tag push and a branch deletion but no branch push, the default branch's included, so a run opens its draft pull request over `gh api` (REST) and only branch protection or a ruleset keeps it off the default branch. | — | documented | <https://code.claude.com/docs/en/cloud-environments> — accessed 2026-10-18 | not run |
| `claude` | Questions | A question Claude asks holds the session idle until a person answers it, up to the environment's expiry, and the session continues from the answer; with nobody there, an unattended run takes its declared default instead of asking. | — | documented | <https://code.claude.com/docs/en/claude-code-on-the-web> — accessed 2026-10-18 | not run |
| `claude` | GitHub Action job cap | The GitHub Action runs as a GitHub Actions job, and a job on a GitHub-hosted runner is stopped and failed at 6 hours of execution time: a surface for a short task, never an overnight surface. | — | documented | <https://docs.github.com/en/actions/reference/limits> — accessed 2026-10-18 | not run |
| `claude` | GitHub Action questions | The Action's page names no question tool among the tools a run is given by default, and nobody sits in the job to answer one; that it has none rests on that silence, so a run there takes its declared defaults. | — | not documented, read 2026-10-18 | <https://code.claude.com/docs/en/github-actions> — accessed 2026-10-18 | not run |
| `claude` | GitHub Action configuration | On a pull request the Action restores `.claude/`, `CLAUDE.md` and the other Claude configuration paths from the base branch before Claude starts, keeping the pull request's copies under `.claude-pr/` for reference, so the hook entries are the base branch's. The scripts Stamity's own entries start, and the agent tool policy document the guard reads, are copies under `.claude/hooks/stamity/`, inside the restore, so those scripts are the base branch's too. A user hook or a pack hook keeps its script at its own path outside `.claude/`, so on a pull request that script is the pull request's, and the Action runs it. A pull request that legitimately changes `.claude/` sees that change reverted on the Action's run, a limit the Action states in its source (`src/github/operations/restore-config.ts`) rather than on this page. | — | documented | <https://github.com/anthropics/claude-code-action/blob/main/docs/security.md> — accessed 2026-10-18 | not run |
| `cursor` | Project hooks | Cursor's cloud agents run the command hooks in the repository's `.cursor/hooks.json`, except `sessionStart`, `sessionEnd` and the MCP hooks; user-level hooks are not available there. | — | documented | <https://cursor.com/docs/hooks> — accessed 2026-10-15 | not run |
| `cursor` | Self-hosted workers | Pool and My Machines workers run the same command-based project hooks, and `sessionStart` and `sessionEnd` fire when a session claims and releases the worker. | — | documented | <https://cursor.com/docs/hooks> — accessed 2026-10-15 | not run |
| `cursor` | Session marker | `CURSOR_AGENT_SOCKET` is the agent's identity socket: always set on a Cursor-managed VM, and set per claimed agent by a self-hosted worker started with `--identity-socket`, so it marks a Cursor agent machine (managed or self-hosted). | — | documented | <https://cursor.com/docs/cloud-agent/identity> — accessed 2026-10-18 | not run |
| `cursor` | MCP hooks | `beforeMCPExecution` does not run in Cursor-hosted cloud agents. Whether it runs on a self-hosted worker the page does not say, so the session start there claims nothing about it. | — | unverified | <https://cursor.com/docs/hooks> — accessed 2026-10-15 | not run |
| `cursor` | Read-only turns | No hook runs during a cloud agent's early read-only turns, `subagentStart` included. The page says so of cloud agents and not separately of self-hosted workers, so the session start there claims nothing about it. | — | unverified | <https://cursor.com/docs/hooks> — accessed 2026-10-15 | not run |
| `cursor` | Draft pull request | A cloud agent opens pull requests and tries to fix CI failures on the ones it creates. Whether such a pull request is a draft the page does not say, so a run opens its own draft through the run verbs and never marks it ready. The platform's own push and pull request, its CI fixes included, meet no shell guard, held-path hold or scan, so branch protection on the default branch is needed to keep them off it. | — | not documented, read 2026-10-18 | <https://cursor.com/docs/cloud-agent/capabilities> — accessed 2026-10-18 | not run |
| `cursor` | Questions | A cloud agent waits on a person only through a subscription its prompt describes, such as asking in Slack and continuing once someone replies. The page says nothing of a question asked without one, so an unattended run asks nothing and takes its declared default. | — | not documented, read 2026-10-18 | <https://cursor.com/docs/cloud-agent/capabilities> — accessed 2026-10-18 | not run |
| `copilot` | Project hooks | The cloud agent loads hooks from `.github/hooks/*.json` in the cloned repository, the only hook configuration its sandbox holds by default, and honours only `bash` (or `command`) entries. `sessionStart` fires once per job. | — | documented | <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-15 | not run |
| `copilot` | Session marker | `COPILOT_AGENT_PROMPT` holds the prompt the cloud agent's job was invoked with. | — | documented | <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-15 | not run |
| `copilot` | Hook timeouts | A timed-out hook fails open on every event, `preToolUse` included. | A preToolUse hook that times out fails open. | documented | <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-15 | not run |
| `copilot` | Ask decisions | A `preToolUse` decision of `ask` is treated as `deny`: no user is there to answer. | An ask answer is read as deny. | documented | <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-15 | not run |
| `copilot` | Default branch | The cloud agent uses a hooks file only when it is present on the repository's default branch. | Hooks run only when the hooks file is on the default branch; this clone's copy is the one loaded. | documented | <https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/use-hooks> — accessed 2026-10-15 | not run |
| `copilot` | Tool arguments | `toolArgs` is typed `unknown`, and the page names no argument of `edit`, `create` or `view`. The hook runner turns a `filePath` argument into `file_path`; if these tools name it `path` (a question raised in review on 2026-10-14), an authored hook reading `file_path` finds none, in the CLI and the cloud agent alike. | — | unverified | <https://docs.github.com/en/copilot/reference/hooks-reference> — accessed 2026-10-15 | not run |
| `copilot` | Draft pull request | The cloud agent pushes to one branch and opens a draft pull request, and cannot mark it ready for review, approve it or merge it. GitHub Actions workflows on it wait for a write-access person's approval unless the repository lets them run automatically. | — | documented | <https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/risks-and-mitigations> — accessed 2026-10-18 | not run |
| `copilot` | Session limit | Each cloud agent session stops at 59 minutes, a limit that cannot be extended, so a long run is a chain of sessions, each ending in a pushed checkpoint. | — | documented | <https://docs.github.com/en/copilot/concepts/copilot-surfaces/copilot-on-github> — accessed 2026-10-18 | not run |
| `copilot` | Next session | A write-access person's `@copilot` comment on the pull request starts a new session there, which remembers the earlier sessions on that pull request; the agent answers no comment from anyone without write access. | — | documented | <https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-github> — accessed 2026-10-18 | not run |
| `codex` | Project hooks | The Codex Cloud page documents no project hooks, so assume none run there: the task's sandbox is the enforcement. | — | not documented, read 2026-10-15 | <https://learn.chatgpt.com/docs/cloud> — accessed 2026-10-15 | not run |
| `codex` | Cloud orchestration | The hooks page says command hooks and hooks from local configuration are not supported under cloud orchestration (its Work Cloud section), and names no Codex Cloud behaviour. | — | documented | <https://learn.chatgpt.com/docs/hooks> — accessed 2026-10-15 | not run |

## Agent tool-allowlist enforcement coverage

How far each client can actually hold an agent to its granted tools. Where a client
exposes no primitive the emission is none at all — a guessed frontmatter key reads to an
operator as a restriction that is not there. 4 clients, one row each:

| Client | Mechanism | Strength |
|---|---|---|
| `claude` | `tools:` sub-agent frontmatter allowlist (comma-separated names); an omitted field inherits every tool, and a list resolving to nothing refuses the spawn; the four verdict roles also carry `Write`, which the generated pre-tool-use guard admits only for a regular file matching the row's `writePaths` under the repository root — never `Edit` or `NotebookEdit`; the four verdict roles and the spec-author also carry `Bash`, which the guard admits only for `git` with one read-only subcommand (log, show, diff, rev-list, merge-base) and nothing that writes a file or runs a configured program — never `PowerShell` | hard |
| `cursor` | `readonly:` boolean — blocks file edits and state-changing shell commands, but cannot name individual tools, so network and delegation grants are unexpressed; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder; for read-only git a verdict role relies on the client itself, because `readonly: true` blocks state-changing shell commands and names no read-only subcommand list | soft |
| `copilot` | `tools:` alias list where `[]` grants nothing; tool-level only, with no sub-tool (per-shell-command) granularity; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder; no verdict role gets `execute`, since nothing here can limit a shell to read-only git, so the brief must carry the diff | hard |
| `codex` | no documented native per-agent `tools` key in `.codex/agents/*.toml`; the role grant is developer-instruction prose, while `sandbox_mode` supplies the supported filesystem boundary; verdict roles (reviewer, security, performance, design-quality) stay read-only here and return their full report inline, because nothing on this client can scope a write to the reports folder; their role sentence permits read-only git (log, show, diff, rev-list, merge-base) inside the `read-only` sandbox, as prose only | soft (provisional) |

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
| Claude Code AGENTS.md support change | drop the bridge | Fired — Claude Code 2.1.277+ reads `AGENTS.md` only where no `CLAUDE.md` exists; stamity emits a `CLAUDE.md`, so the `@AGENTS.md` bridge import is the vendor's documented shape for that case and stays emitted for the one entry file. | `claude`, oldest source read 2026-09-30 |
| Agent Plugins scope expansion | container widens | No container is emitted: the plugin route was deleted in 1.15.0, and the CLI writes every class into the repository. A wider Agent Plugins format re-opens whether a container is worth shipping again, not the shape of one. | `claude`, oldest source read 2026-09-30 |
| VS Code deny-gate GA | recheck editor-specific hook compatibility | CLI/cloud preToolUse hooks are emitted now, with timeout fail-open. [VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks) remain Preview; editor-specific compatibility needs separate verification. | `copilot`, oldest source read 2026-09-10 |
