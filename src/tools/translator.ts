/**
 * Client tool dialects: render a category grant into the frontmatter shape a
 * given target client actually reads.
 *
 * One policy vocabulary ({@link ToolCategory}) reaches four clients that name
 * tools differently and enforce grants with different primitives — an
 * enumerated allowlist on two of them, a single boolean on a third, nothing
 * per-agent on the fourth. This module is the seam where the shared vocabulary
 * becomes client dialect, so a policy stays authored once and nothing upstream
 * of it learns a client's tool names.
 *
 * Three properties every transform here holds:
 *
 * 1. **Privilege never widens.** A category maps to an explicit list of names;
 *    a category a client cannot express contributes nothing. The worst a
 *    mapping gap can do is under-grant, which fails loudly at runtime, rather
 *    than hand out a capability the policy withheld.
 * 2. **Output is a function of the granted SET.** Categories resolve in the
 *    canonical taxonomy order, duplicates collapse, and reserved categories
 *    (which no policy can grant) are stripped — so a re-ordered grant list
 *    never shows up as a diff in a generated artifact.
 * 3. **Tables are data.** Adding a client, or extending one client's tool
 *    names, is an edit to a table constant, not to a transform.
 *
 * Platform facts below carry an access date. They are dialect claims about
 * software that ships weekly; the per-release currency pass re-verifies each
 * cited page and updates the tables, and any row it cannot verify is marked
 * provisional rather than presented as current.
 */

import { TOOLS, VALID_TOOLS, type Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import {
  ALL_TOOL_CATEGORIES,
  isReservedToolCategory,
  isToolCategory,
  type CategoryToolNames,
  type ToolCategory,
} from "./categories.ts";

// ── Client tool-name tables ──────────────────────────────────────

/**
 * Claude Code sub-agent tool names
 * (code.claude.com/docs/en/sub-agents, accessed 2026-08-13).
 *
 * Names are drawn from the set a BACKGROUND sub-agent keeps, because
 * background is the default spawn mode and every other built-in tool is
 * stripped there whether inherited or listed — naming one would emit a grant
 * that silently resolves to nothing. `Agent` is the current name of the
 * delegation tool (`Task` remains an accepted alias), which is why `spawn`
 * lists it first rather than the older token.
 *
 * Task/Skill category resolution (a build decision closing the mapping the
 * adapter contract left open):
 *
 * - `Task` is the accepted alias of `Agent`, so it sits in `spawn` beside it.
 *   The generated pre-tool-use guard derives its name→category map from this
 *   table; a client payload naming the alias would otherwise refuse as
 *   `UNKNOWN_TOOL` — an under-grant, but a wrong denial.
 * - `Skill` is procedure ingestion — loading a `SKILL.md` into context — which
 *   is side-effect-free by itself, so it maps to `read`
 *   (code.claude.com/docs/en/skills, accessed 2026-08-14).
 *
 * MCP tools are deliberately absent: they are addressed per server
 * (`mcp__<server>`), so no static table can enumerate them. The emitting
 * adapter appends those grants from the server set the operator selected.
 */
const CLAUDE_TOOL_NAMES: CategoryToolNames = {
  read: ["Read", "Grep", "Glob", "Skill"],
  edit: ["Edit", "Write", "NotebookEdit"],
  execute: ["Bash", "PowerShell"],
  network: ["WebFetch", "WebSearch"],
  spawn: ["Agent", "Task"],
  planning: ["TodoWrite"],
};

/**
 * PROVISIONAL. Codex custom agents are TOML files under `.codex/agents/`
 * whose documented keys are `name`, `description`, `developer_instructions`,
 * plus `config.toml` keys (`model`, `model_reasoning_effort`, `sandbox_mode`,
 * `mcp_servers`, `skills.config`) — there is no per-agent tool allowlist
 * (learn.chatgpt.com/docs/agent-configuration/subagents, accessed
 * 2026-08-13). `sandbox_mode` (`read-only` / `workspace-write`) is the
 * candidate native primitive.
 *
 * Until the adapter phase decides that mapping, the Claude comma-list dialect
 * is emitted as a placeholder and the coverage row is flagged
 * {@link AdapterAllowlistCoverage.provisional} so no reader mistakes it for a
 * verified grant. Refining it is an edit to this constant and that flag.
 */
const CODEX_TOOL_NAMES: CategoryToolNames = CLAUDE_TOOL_NAMES;

/**
 * GitHub Copilot custom-agent primary aliases
 * (docs.github.com/en/copilot/reference/custom-agents-configuration, accessed
 * 2026-08-13). Each alias covers a family of concrete tools — `read` covers
 * `Read`/`NotebookRead`, `search` covers `Grep`/`Glob` — which is why the
 * `read` category, spanning file reads and code search, emits two aliases.
 */
const COPILOT_TOOL_NAMES: CategoryToolNames = {
  read: ["read", "search"],
  edit: ["edit"],
  execute: ["execute"],
  network: ["web"],
  spawn: ["agent"],
  planning: ["todo"],
};

/**
 * The categories Cursor's `readonly` boolean actually speaks about: it blocks
 * file edits and state-changing shell commands and says nothing about the
 * rest (cursor.com/docs/agent/subagents, accessed 2026-08-13). A grant of
 * `network` or `spawn` is therefore invisible to the primitive — the boolean
 * approximates the grant, it does not carry it.
 */
const CURSOR_MUTATING_CATEGORIES: ReadonlySet<ToolCategory> = new Set(["edit", "execute"]);

// ── Grant resolution ─────────────────────────────────────────────

/**
 * Normalize a grant: reject unknown categories, drop reserved ones, and
 * return what is left in canonical taxonomy order with duplicates collapsed.
 *
 * Validation is over `unknown` despite the declared parameter type, because a
 * grant reaches this module from parsed roster data — the type is a claim.
 * An unknown category is thrown rather than skipped: silently dropping it
 * would emit a narrower allowlist than the policy states and leave the agent
 * failing at runtime with no line pointing at the typo.
 *
 * Reserved categories are stripped instead, matching the policy layer, where
 * no grant can hold one — they are inert placeholders, so passing one through
 * to a client dialect would mean inventing a name for a capability that has
 * none.
 */
function resolveGrant(categories: readonly ToolCategory[]): ToolCategory[] {
  for (const granted of categories) {
    const category: string = granted;
    if (!isToolCategory(category)) {
      throw new EngineError(
        `Unknown tool category "${category}" in a client tool-dialect transform. ` +
          `Known categories: ${ALL_TOOL_CATEGORIES.join(", ")}.`,
        { code: "VALIDATION_ERROR" },
      );
    }
  }
  return ALL_TOOL_CATEGORIES.filter(
    (category) => !isReservedToolCategory(category) && categories.includes(category),
  );
}

/**
 * Resolve a grant against one client's table. Names emit in canonical
 * category order, then in table order within a category; a name listed under
 * two categories emits once, at its first position.
 */
function renderToolNames(
  categories: readonly ToolCategory[],
  names: CategoryToolNames,
): string[] {
  const out: string[] = [];
  for (const category of resolveGrant(categories)) {
    for (const name of names[category] ?? []) {
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

// ── Per-client transforms ────────────────────────────────────────

/**
 * Claude Code `tools:` frontmatter value — a comma-separated allowlist.
 *
 * An empty grant renders the empty string, which the caller must emit as an
 * explicit empty list rather than dropping the field: an ABSENT `tools:` key
 * makes the sub-agent inherit every tool, so omitting it on an empty grant
 * would invert the policy. An empty list is the fail-closed end of the
 * dialect — Claude Code refuses to spawn a sub-agent whose list resolves to
 * no tool (code.claude.com/docs/en/sub-agents, accessed 2026-08-13).
 */
export function toClaudeToolsFrontmatter(categories: readonly ToolCategory[]): string {
  return renderToolNames(categories, CLAUDE_TOOL_NAMES).join(", ");
}

/**
 * GitHub Copilot `tools:` frontmatter value, rendered as a YAML flow sequence
 * (`["read", "search"]`) so it drops straight into the frontmatter line.
 *
 * An empty grant renders `[]`, which is Copilot's documented "no tools"
 * value — again distinct from omitting the key, which enables every tool
 * (docs.github.com/en/copilot/reference/custom-agents-configuration, accessed
 * 2026-08-13). Aliases are a closed vocabulary of lower-case words, so the
 * quoting needs no escaping pass.
 */
export function toCopilotToolsFrontmatter(categories: readonly ToolCategory[]): string {
  const aliases = renderToolNames(categories, COPILOT_TOOL_NAMES);
  return `[${aliases.map((alias) => `"${alias}"`).join(", ")}]`;
}

/**
 * Codex agent `tools` value in the Claude comma-list dialect — provisional,
 * see {@link CODEX_TOOL_NAMES}.
 */
export function toCodexToolsFrontmatter(categories: readonly ToolCategory[]): string {
  return renderToolNames(categories, CODEX_TOOL_NAMES).join(", ");
}

/**
 * Cursor `readonly:` frontmatter value — the only per-agent primitive the
 * client exposes.
 *
 * `true` when the grant holds neither `edit` nor `execute` (the strongest
 * restriction Cursor can express applies), `false` when it holds either.
 *
 * `null` means "no verdict": the grant named categories, but every one of
 * them was reserved, so nothing in it describes a capability the boolean
 * models. That is a malformed grant — the policy layer strips reserved
 * categories and reports them — and answering it with a manufactured `true`
 * would hide the roster bug behind a plausible-looking emission. A caller
 * that receives `null` falls back to its own deny-by-default posture
 * (`readonly: true`); it must not fall through to omitting the field, whose
 * default is the permissive `false`.
 *
 * An EMPTY grant is well-formed rather than malformed — it grants nothing —
 * and returns `true`, the safe minimum.
 */
export function toCursorReadonlyFrontmatter(categories: readonly ToolCategory[]): boolean | null {
  const granted = resolveGrant(categories);
  if (granted.length === 0) return categories.length === 0 ? true : null;
  return !granted.some((category) => CURSOR_MUTATING_CATEGORIES.has(category));
}

// ── Coverage matrix ──────────────────────────────────────────────

/**
 * What a client can actually enforce about a grant.
 *
 * The matrix exists so a gap is a stated fact rather than a silence. When a
 * client exposes no primitive, the honest emission is none at all — a guessed
 * frontmatter key is worse than an absent one, because the downstream runtime
 * ignores what it does not recognise and the operator reads the emitted line
 * as a restriction that is not there.
 */
export interface AdapterAllowlistCoverage {
  readonly tool: Tool;
  /** The client-native primitive the grant is emitted into. */
  readonly mechanism: string;
  /**
   * - `hard` — the client refuses tools outside the emitted allowlist.
   * - `soft` — the emitted primitive narrows behaviour but cannot carry the
   *   whole grant, so it approximates it.
   * - `none` — the client exposes no per-agent primitive; nothing is emitted
   *   and the grant survives only as prose in the agent body.
   */
  readonly strength: "hard" | "soft" | "none";
  /** Set when the row rests on an unverified dialect assumption. */
  readonly provisional?: boolean;
}

/**
 * One row per {@link Tool}, in canonical tool order. A client absent from
 * this matrix has an undeclared enforcement story, so the row set is asserted
 * against {@link TOOLS} in the suite rather than kept in sync by habit.
 */
export const ADAPTER_ALLOWLIST_COVERAGE: readonly AdapterAllowlistCoverage[] = [
  {
    // code.claude.com/docs/en/sub-agents (accessed 2026-08-13)
    tool: "claude",
    mechanism:
      "`tools:` sub-agent frontmatter allowlist (comma-separated names); an omitted field inherits every tool, and a list resolving to nothing refuses the spawn",
    strength: "hard",
  },
  {
    // cursor.com/docs/agent/subagents (accessed 2026-08-13)
    tool: "cursor",
    mechanism:
      "`readonly:` boolean — blocks file edits and state-changing shell commands, but cannot name individual tools, so network and delegation grants are unexpressed",
    strength: "soft",
  },
  {
    // docs.github.com/en/copilot/reference/custom-agents-configuration (accessed 2026-08-13)
    tool: "copilot",
    mechanism:
      "`tools:` alias list where `[]` grants nothing; tool-level only, with no sub-tool (per-shell-command) granularity",
    strength: "hard",
  },
  {
    // learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-08-13)
    tool: "codex",
    mechanism:
      "no documented per-agent tool allowlist in `.codex/agents/*.toml`; the comma-list dialect is emitted as a placeholder and `sandbox_mode` is the candidate native primitive",
    strength: "soft",
    provisional: true,
  },
];

/**
 * Render the coverage matrix as a markdown table for the generated
 * capability documentation, so the doc is derived from the data the
 * transforms use rather than maintained beside it.
 */
export function buildAllowlistCoverageTable(): string {
  const rows = ADAPTER_ALLOWLIST_COVERAGE.map((row) => {
    const strength = row.provisional === true ? `${row.strength} (provisional)` : row.strength;
    return `| \`${row.tool}\` | ${row.mechanism} | ${strength} |`;
  });
  return ["| Client | Mechanism | Strength |", "|---|---|---|", ...rows].join("\n");
}

// ── Ask-user platform table ──────────────────────────────────────

/**
 * How one client asks its operator a question at an ASK checkpoint.
 *
 * `toolName` is `null` when the client documents no native question tool. The
 * bias is to leave it `null` rather than guess: a wrong tool name fails at the
 * exact moment the agent needed an answer, and it fails quietly, whereas the
 * plain-text fallback always reaches the operator.
 */
export interface AskUserToolEntry {
  readonly tool: Tool;
  readonly toolName: string | null;
  /** Guidance rendered into generated content — at most two sentences. */
  readonly note: string;
}

const ASK_USER_TOOLS: Readonly<Record<Tool, AskUserToolEntry>> = {
  claude: {
    tool: "claude",
    toolName: "AskUserQuestion",
    // code.claude.com/docs/en/sub-agents (accessed 2026-08-13): AskUserQuestion
    // is removed from every sub-agent context, even when the agent lists it, so
    // the ask belongs to whoever holds the main conversation.
    note: "**Platform:** Ask through the `AskUserQuestion` tool. A delegated sub-agent cannot call it — the tool is stripped from every sub-agent context — so a sub-agent returns its question as a blocked result and the delegating agent runs the ask.",
  },
  cursor: {
    tool: "cursor",
    toolName: null,
    // cursor.com/docs/agent/subagents (accessed 2026-08-13): no native question tool.
    note: "**Platform:** Cursor documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one.",
  },
  copilot: {
    tool: "copilot",
    toolName: null,
    // docs.github.com/en/copilot/reference/custom-agents-configuration (accessed 2026-08-13).
    note: "**Platform:** GitHub Copilot documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one.",
  },
  codex: {
    tool: "codex",
    toolName: null,
    // learn.chatgpt.com/docs/agent-configuration/subagents (accessed 2026-08-13).
    note: "**Platform:** Codex documents no native question tool. Use the plain-text fallback below for every ASK checkpoint, and stop for the answer instead of assuming one.",
  },
};

/**
 * The entry for one client. Total over {@link Tool}, so callers never branch
 * on a missing row; an unrecognised value throws, because the target list is
 * parsed from the manifest and a typo there would otherwise substitute
 * `undefined` into generated content.
 */
export function getAskUserToolEntry(tool: Tool): AskUserToolEntry {
  const name: string = tool;
  if (!VALID_TOOLS.has(name)) {
    throw new EngineError(
      `Unknown target tool "${name}" has no ask-user entry. Known tools: ${TOOLS.join(", ")}.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return ASK_USER_TOOLS[tool];
}

/**
 * Marker written into canonical content at the point where the question
 * protocol needs a platform-specific instruction. It survives on disk so the
 * corpus stays client-agnostic, and resolves per target during emission.
 */
export const PLATFORM_TOOL_MARKER = "<!-- STAMITY:PLATFORM-TOOL -->";

/**
 * Render every client's ask-user row as a markdown table — for documentation
 * read across clients, where naming one platform's tool would strand the
 * others.
 */
export function buildAskUserPlatformTable(): string {
  const rows = TOOLS.map((tool) => {
    const entry = getAskUserToolEntry(tool);
    const name = entry.toolName === null ? "_none documented_" : `\`${entry.toolName}\``;
    return `| \`${tool}\` | ${name} | ${entry.note} |`;
  });
  return ["| Client | Native question tool | Guidance |", "|---|---|---|", ...rows].join("\n");
}

/**
 * Replace every {@link PLATFORM_TOOL_MARKER} in a canonical body with the
 * target client's ask-user note.
 *
 * Content without the marker is returned unchanged, which keeps the call
 * cheap on the majority of files and makes the transform safe to run over a
 * whole corpus. Splitting on the literal and joining is deliberate:
 * `replaceAll` with a string replacement still expands `$&` and friends, and
 * a note is prose that may contain them.
 */
export function substituteCanonicalPlatformMarker(content: string, tool: Tool): string {
  if (!content.includes(PLATFORM_TOOL_MARKER)) return content;
  return content.split(PLATFORM_TOOL_MARKER).join(getAskUserToolEntry(tool).note);
}
