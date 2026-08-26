/**
 * Claude Code residue — the per-client half of a standards-first emission.
 *
 * The core already emitted everything portable: the `AGENTS.md` charter, the
 * vendor-neutral `.agents/skills/` projection, the hook scripts plus the
 * policy document, and the MCP substrate. Claude Code reads neither
 * `AGENTS.md` nor `.agents/skills/`, so this adapter's residue is the bridge,
 * the dialects, and a NATIVE copy of rows the core already rendered — never a
 * second render:
 *
 * 1. **`CLAUDE.md` → one managed block bridging into the charter.** An
 *    `@AGENTS.md` import (code.claude.com/docs/en/memory — imports resolve
 *    recursively from the file's own directory) plus one pointer line naming
 *    {@link CLAUDE_SKILLS_DIR}, the directory this client actually reads.
 *    Default-on, no opt-in flag anywhere: the block is the whole emission, and
 *    the merge engine owns preserving user prose around it
 *    (`src/merge/managedBlocks.ts`).
 * 2. **Skills → `.claude/skills/<skill>/…`** ({@link CLAUDE_SKILLS_DIR}), the
 *    client's project-level skills location — re-targeted from the core's
 *    already-rendered rows ({@link retargetProjection}), so the native copy is
 *    byte-identical to the vendor-neutral one by construction rather than by
 *    two renders agreeing. These rows are ADAPTER-owned, unlike the co-owned
 *    tree they came from: the copy exists because THIS client cannot read that
 *    tree, so it is reclaimed when the tool is deselected.
 * 3. **Rules → `.claude/rules/<id>.md`** with frontmatter `description` and
 *    `paths:` — a YAML LIST of the canonical globs (a comma inside one glob
 *    survives, which the predecessor's CSV form could not promise). A rule
 *    authored `scope: agent-requested` emits description-only, no `paths`.
 *    That is NOT a description-pull on this client: "Rules without `paths`
 *    frontmatter are loaded at launch with the same priority as
 *    `.claude/CLAUDE.md`" and "are loaded unconditionally and apply to all
 *    files" (code.claude.com/docs/en/memory § "Organize rules with
 *    `.claude/rules/`", accessed 2026-08-18). So the three agent-requested
 *    rules cost this client launch context, where Cursor pulls the same
 *    bodies on relevance — a per-client cost the capability matrix states
 *    rather than a shape this adapter can change. Also read by VS Code
 *    Copilot, which consumes the same directory shape.
 * 4. **Agents → `.claude/agents/<id>.md`** with rich frontmatter: `name`,
 *    `description`, a `tools:` comma-list allowlist resolved through
 *    {@link resolveAgentGrant}, and `model:`/`effort:` projected from the
 *    canonical `model_class` through the shared ladder — never invented where
 *    the ladder answers nothing.
 * 5. **Commands → `.claude/commands/<id>.md`** ({@link CLAUDE_COMMANDS_DIR}),
 *    the touchpoint commands as native slash commands, with the same
 *    description-only frontmatter discipline the sibling adapters use.
 * 6. **`.claude/settings.json`** — whole-file JSON (plain `.json` takes no
 *    managed block per `src/types/markers.ts`): the core hook interchange
 *    transformed to the client shape, the `ConfigChange` tamper wiring, the
 *    review-gate wiring below, and the read-only permissions chain.
 * 7. **The work-scoped review gate** ({@link CLAUDE_REVIEW_GATE_PATH}) beside
 *    the three core hook scripts. Adapter-owned rather than core, because it
 *    rides two events only this client fires ({@link REVIEW_GATE_EVENTS}).
 * 8. **The MCP documents the core planned for this client**, placed verbatim.
 *
 * **The permissions chain is read-only.** Permission rules outrank hooks on
 * this client, so the allowlist is emitted as permission rules and the
 * generated pre-tool-use guard stays the per-agent backstop. The rows derive
 * from the shipped roster, not from a hand-kept list: union the categories any
 * `AGENT_POLICY_ROSTER` row grants (`read`, `edit`, `execute`, `network` — no
 * row grants `spawn` or `planning`), keep only the categories safe to
 * pre-approve for a whole session ({@link SESSION_PREAPPROVED_CATEGORIES} —
 * `read`), render that through the Claude tool-name table, and drop the two
 * names that sit in the table only so the guard can categorize them per-agent
 * (`Task`, the spawn alias; `Skill`, procedure ingestion). For the shipped
 * roster that is three rows: `Read`, `Grep`, `Glob`.
 *
 * Shell (`Bash`, `PowerShell`), network (`WebFetch`, `WebSearch`), and write
 * (`Edit`, `Write`, `NotebookEdit`) tools are deliberately ABSENT. An allow row
 * is session-global and covers the main thread, which the guard exempts by
 * design — pre-approving those categories would take the client's own approval
 * prompt off shell execution and network egress for the whole session. The
 * roster still grants them to the agents that need them; the human keeps the
 * first-use prompt.
 *
 * **Dropped, deliberately, from the predecessor's surface:** the Agent-Teams
 * echo gates — prompt hooks that asked the model to grade its own work — every
 * experimental flag, and the advisory-hooks rule class (its event classes died
 * with the prose-hook model). The suite asserts their absence rather than
 * trusting this comment. `TaskCompleted` is no longer part of that list: what
 * rides it now is a committed, reviewable script that decides from counter
 * state, which is the opposite of an echo gate. `TeammateIdle` stays dropped.
 *
 * Planning is pure with respect to the working tree: the corpus is read as
 * context, nothing is written, no clock is read, and two plans over one
 * repository produce identical bytes.
 */

import {
  COMMAND_ID_PREFIX,
  buildContentIndex,
  typeIdKey,
  type CatalogItem,
} from "../content/catalog.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { AGENTS_MD_FILE, verificationGatesFromManifest } from "../emit/agentsMd.ts";
import type {
  AdapterDialectFacts,
  CoreEmissionPlan,
  EmissionContext,
  ResidueEmission,
  ResiduePlanner,
} from "../emit/planner.ts";
import { HOOKS_GENERATED_DIR } from "../emit/hooksInfra.ts";
import { NATIVE_SKILL_DIRS, retargetProjection } from "../emit/skillsProjection.ts";
import {
  detectionContextFromManifest,
  substituteRepoTokens,
  substituteVerificationGateTokens,
} from "../emit/substitution.ts";
import {
  CANONICAL_HOOK_EVENTS,
  CLAUDE_EVENT_NAMES,
  CLIENT_EXTENSION_EVENTS,
  CLIENT_HOOK_GUARANTEES,
  type HookInterchange,
} from "../hooks/model.ts";
import {
  REVIEW_GATE_FILE,
  REVIEW_GATE_STATE_FILE,
  buildReviewGateScript,
} from "../hooks/scripts.ts";
import { readReviewCap } from "../manifest/manifest.ts";
import type { McpEmission } from "../mcp/emit.ts";
import { wrapInManagedBlock } from "../merge/managedBlocks.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import { AGENT_POLICY_ROSTER } from "../roster/agentPolicies.ts";
import { resolveEffortValue, resolveModelValue } from "../roster/modelLadder.ts";
import type { ToolCategory } from "../tools/categories.ts";
import {
  substituteCanonicalPlatformMarker,
  toClaudeToolsFrontmatter,
} from "../tools/translator.ts";
import type { AdapterOutput, ContentClass, EmissionOwner } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { CONTENT_PREFIX } from "../types/markers.ts";

// ── Client layout ────────────────────────────────────────────────

/** The tool this planner speaks for; also the ledger owner of every row it returns. */
const TOOL: Tool = "claude";

/** The entry-file bridge into the charter — the one mirror any client gets. */
export const CLAUDE_MD_PATH = "CLAUDE.md";

/** Path-scoped rules directory (also read by VS Code Copilot). */
const RULES_DIR = ".claude/rules";

/** Sub-agent definitions, rich frontmatter over a markdown system prompt. */
const AGENTS_DIR = ".claude/agents";

/**
 * The client's project-level skills location — `.claude/skills/<skill>/SKILL.md`,
 * scoped to "this project only" (code.claude.com/docs/en/skills § "Where skills
 * live", accessed 2026-08-17). Read from {@link NATIVE_SKILL_DIRS} rather than
 * spelled again here, so the location is stated once and the capability matrix,
 * the projection, and this adapter cannot disagree about it.
 *
 * An empty value means the table lost this client's row upstream. The planner
 * then emits NO native copy and the dialect facts say so, because the honest
 * answer to an unknown directory is silence — a spelled-out fallback would be a
 * fabricated pin, and the suite asserts the real value rather than trusting it.
 */
export const CLAUDE_SKILLS_DIR: string = NATIVE_SKILL_DIRS[TOOL] ?? "";

/**
 * Project-level slash commands: one markdown file per command, invoked by its
 * FILE NAME (`.claude/commands/deploy.md` → `/deploy`). Custom commands were
 * merged into skills — a command file and a skill directory of the same name
 * create the same command and behave the same way — and a command file accepts
 * the skill frontmatter set minus `name` and `paths`, which the client ignores
 * there (code.claude.com/docs/en/skills § "How a skill gets its command name",
 * accessed 2026-08-17).
 */
export const CLAUDE_COMMANDS_DIR = ".claude/commands";

/** Project settings: hooks wiring plus the permissions chain. Whole-file JSON. */
export const CLAUDE_SETTINGS_PATH = ".claude/settings.json";

/**
 * The work-scoped review gate, placed beside the three core hook scripts under
 * the per-tool generated hooks directory. Adapter-owned: `planCoreHookScripts`
 * deliberately does not return it, because it rides events only this client
 * fires, so the client that wires those events is the one that places it.
 */
export const CLAUDE_REVIEW_GATE_PATH = `${HOOKS_GENERATED_DIR}/${TOOL}/${REVIEW_GATE_FILE}`;

/**
 * The client's configuration-change event — a per-client EXTENSION outside the
 * six-intent portable set (`CANONICAL_HOOK_EVENTS`), so it is NON-PORTABLE by
 * construction: no other target client fires it, and the portable wiring of
 * the same script (session start) stays in place beside it
 * (code.claude.com/docs/en/hooks, accessed 2026-08-17).
 */
const CONFIG_CHANGE_EVENT = "ConfigChange";

/**
 * The extension events the review gate rides: this client's rows in
 * `CLIENT_EXTENSION_EVENTS`, minus the one {@link CONFIG_CHANGE_EVENT} already
 * claims, in table order. Derived rather than re-spelled so the table stays
 * the single source of what this client fires — and the suite pins the exact
 * pair (`TaskCompleted`, `SubagentStop`), so a rename or a new row fails a
 * test here instead of silently un-wiring the gate or handing it an event
 * nobody scoped it to.
 *
 * Deliberately NONE of the six canonical events. `Stop` would gate every
 * session rather than a work run's completion, which is the difference between
 * a review loop and a session the operator cannot end
 * (code.claude.com/docs/en/hooks, accessed 2026-08-17: exit 2 on
 * `TaskCompleted` prevents the task being marked completed; on `SubagentStop`
 * it prevents the sub-agent stopping, which is why the gate's `SubagentStop`
 * pass counts a round and never blocks).
 */
const REVIEW_GATE_EVENTS: readonly string[] = CLIENT_EXTENSION_EVENTS.filter(
  (row) => row.tool === TOOL && row.event !== CONFIG_CHANGE_EVENT,
).map((row) => row.event);

/**
 * File name of the generated tamper-notice script, restated from
 * `src/hooks/scripts.ts` (which does not export it). The suite pins the pair:
 * the `ConfigChange` entry must point at a script the interchange also carries
 * on its portable event, so a rename upstream fails a test here rather than
 * silently un-wiring the extension.
 */
const TAMPER_NOTICE_SCRIPT_FILE = "stamity-config-tamper-notice.mjs";

/**
 * Access date carried by every platform citation in {@link CLAUDE_DIALECT_FACTS}.
 *
 * Re-read on this date to settle the rule LOAD MODE, which the facts below had
 * wrong: a `.claude/rules/` file with no `paths:` is not description-pulled, it
 * is "loaded at launch with the same priority as `.claude/CLAUDE.md`"
 * (code.claude.com/docs/en/memory § "Organize rules with `.claude/rules/`").
 * The whole citation set is stamped with the same date because they were
 * re-verified together.
 */
const ACCESS_DATE = "2026-08-18";

// ── Permissions chain ────────────────────────────────────────────

/**
 * Names present in the Claude tool-name table ONLY so the generated
 * pre-tool-use guard can put a category verdict on them per-agent (the category
 * resolution in `src/tools/translator.ts`): `Task` is the accepted
 * alias of the `spawn` delegation tool, `Skill` is procedure ingestion under
 * `read`. Neither belongs in the session-global permissions chain — a
 * pre-approval there would cover the MAIN thread too, taking delegation and
 * skill ingestion off the client's own approval path.
 */
const GUARD_MAP_ONLY_NAMES: ReadonlySet<string> = new Set(["Task", "Skill"]);

/**
 * Categories this file pre-approves session-globally: `read` alone.
 *
 * A `permissions.allow` row is not a sub-agent grant. It is a session-wide
 * standing consent that also covers the MAIN thread — the one thread the
 * generated `PreToolUse` guard deliberately exempts, because the guard reasons
 * per `stamity-*` agent and the main thread is not one. So every category
 * outside `read` that lands here silently retires the client's own approval
 * prompt for shell execution, network egress, and file writes across the whole
 * session, in exchange for saving a keystroke.
 *
 * The roster still grants `edit`, `execute`, and `network` where an agent needs
 * them; withholding them here does not withhold them from the agent. It only
 * keeps the human in the loop the first time each is used, which is the
 * difference between "the setup declares what its agents may do" and "the setup
 * turned off your prompts". A privilege that widens blast radius stays
 * prompt-on-use.
 */
const SESSION_PREAPPROVED_CATEGORIES: ReadonlySet<ToolCategory> = new Set<ToolCategory>(["read"]);

/**
 * The permissions allowlist, derived — not hand-kept — from the intersection of
 * the roster's category union with {@link SESSION_PREAPPROVED_CATEGORIES},
 * rendered through the Claude tool-name table and minus
 * {@link GUARD_MAP_ONLY_NAMES}. `toClaudeToolsFrontmatter` already normalizes
 * to canonical category order with duplicates collapsed, so the row order is
 * deterministic by construction.
 */
const CLAUDE_PERMISSION_ROWS: readonly string[] = toClaudeToolsFrontmatter(
  AGENT_POLICY_ROSTER.flatMap((row) => row.allow).filter((category) =>
    SESSION_PREAPPROVED_CATEGORIES.has(category),
  ),
)
  .split(", ")
  .filter((name) => name !== "" && !GUARD_MAP_ONLY_NAMES.has(name));

// ── Dialect facts ────────────────────────────────────────────────

/** This client's honest hook guarantee, read from the shared table rather than restated. */
const HOOK_GUARANTEE = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === TOOL);

/**
 * What Claude Code can and cannot express, as data the generated capability
 * matrix renders. Every claim traces to a citation with an access date; the
 * hook row derives from `CLIENT_HOOK_GUARANTEES` so the matrix and the
 * emitted guard bodies cannot disagree about what this client enforces.
 */
export const CLAUDE_DIALECT_FACTS: AdapterDialectFacts = {
  tool: TOOL,
  ruleShape:
    "`.claude/rules/<id>.md` with frontmatter `paths:` — a YAML glob list, matched when Claude reads a file; a rule with no `paths` is loaded unconditionally at launch, at CLAUDE.md priority. Also read by VS Code Copilot",
  hooksConfigPath: CLAUDE_SETTINGS_PATH,
  readsAgentsSkillsDir: false,
  agentsFormat:
    "`.claude/agents/<id>.md` — frontmatter (`name`, `description`, `tools:` comma list, `model:` alias or pinned id, `effort:` level) over a markdown system prompt",
  mcpDialect: "claude-json",
  entryFile: CLAUDE_MD_PATH,
  caps: [
    {
      name: "entry-file-budget",
      value:
        "~200-line CLAUDE.md working target; the bridge emits one managed block (import + skills pointer), leaving the budget to the user",
    },
    { name: "permission-rows", value: String(CLAUDE_PERMISSION_ROWS.length) },
    {
      name: "hook-enforcement",
      value:
        HOOK_GUARANTEE === undefined
          ? "undeclared"
          : `${HOOK_GUARANTEE.failMode} — blocking exit code: ${HOOK_GUARANTEE.blockingExitCode ?? "none"}`,
    },
    {
      name: "skills-access",
      value:
        CLAUDE_SKILLS_DIR === ""
          ? "no native location is declared for this client, so no copy is emitted and a skill is used by naming its `SKILL.md` path in the chat"
          : `native — the projection is copied to \`${CLAUDE_SKILLS_DIR}/<skill>/SKILL.md\`, this client's project-level skills location, so the client loads a skill when it is relevant and \`/<skill>\` invokes one directly`,
    },
    {
      name: "command-surface",
      value: `native — one file per touchpoint command at \`${CLAUDE_COMMANDS_DIR}/<id>.md\`, invoked as \`/<id>\`; description-only frontmatter, so nothing is pre-approved that the permissions chain does not already grant`,
    },
    {
      name: "review-gate",
      value: `work-scoped gate on \`${REVIEW_GATE_EVENTS.join("` + `")}\` — Claude-only extensions, non-portable. ${HOOK_GUARANTEE?.failMode ?? "undeclared"}: a completion with an open review round is refused, and the gate opens at the round cap so it can never wedge a run`,
    },
    {
      name: "config-change-event",
      value: "`ConfigChange` tamper wiring — Claude-only extension, non-portable",
    },
  ],
  citations: [
    { url: "https://code.claude.com/docs/en/memory", accessDate: ACCESS_DATE },
    { url: "https://code.claude.com/docs/en/skills", accessDate: ACCESS_DATE },
    { url: "https://code.claude.com/docs/en/sub-agents", accessDate: ACCESS_DATE },
    { url: "https://code.claude.com/docs/en/hooks", accessDate: ACCESS_DATE },
    { url: "https://code.claude.com/docs/en/settings", accessDate: ACCESS_DATE },
  ],
};

// ── The planner ──────────────────────────────────────────────────

/**
 * Plan Claude Code's per-client rows over the core plan: the bridge, the
 * native skills copy, the rule / agent / command dialects, the settings
 * document, the review gate, and the MCP placement. Ordering is bridge, then
 * skills, then catalog walk order, then settings, then gate, then MCP —
 * deterministic, though the composer sorts by path before anything is written.
 */
export const claudeResiduePlanner: ResiduePlanner = {
  tool: TOOL,
  facts: CLAUDE_DIALECT_FACTS,
  async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
    const items = await selectedItems(ctx);
    const render = bodyRenderers(ctx);

    const rows: AdapterOutput[] = [buildClaudeMd(ctx.engineVersion)];
    // Re-targeted, not re-rendered: the same bytes the core already produced,
    // under the one root this client reads. Two paths, two owners, identical
    // content — the composer dedups by PATH, so both trees are written and the
    // native one is reclaimed with the tool.
    if (CLAUDE_SKILLS_DIR !== "") {
      for (const file of retargetProjection(core.skills, CLAUDE_SKILLS_DIR)) {
        rows.push({
          path: file.path,
          content: file.content,
          owner: owner(file.artifactId, file.artifactType),
        });
      }
    }
    for (const item of items) {
      if (item.type === "rule") rows.push(buildRuleFile(item, render.rule));
      else if (item.type === "command") rows.push(buildCommandFile(item, render.command));
      else {
        rows.push(buildAgentFile(item, grantFor(item), modelFrontmatter(item, ctx), render.agent));
      }
    }
    rows.push({
      path: CLAUDE_SETTINGS_PATH,
      content: buildSettingsJson(core),
      owner: owner("claude-settings", "infra"),
    });
    rows.push(buildReviewGate(ctx));
    // Placed verbatim: the core rendered these documents and chose their paths,
    // and an adapter that re-derived either would be a second writer.
    for (const emission of core.mcpFor(TOOL)) rows.push(mcpRow(emission));

    return { outputs: rows };
  },
};

// ── Selection ────────────────────────────────────────────────────

/**
 * The rules, agents and commands this setup emits, in catalog walk order.
 *
 * Skills are absent from this list because they are not a per-item dialect
 * here: the core renders them once and the planner re-targets those rows
 * wholesale into {@link CLAUDE_SKILLS_DIR}. Three filters apply: the catalog's
 * own reachability (a contested id emits once, from the claimant `byKey`
 * resolves), the manifest's selection record, and an artifact's optional
 * `tools:` restriction.
 */
async function selectedItems(ctx: EmissionContext): Promise<CatalogItem[]> {
  const index = await buildContentIndex(ctx.contentRoot);
  const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
  return index.items.filter(
    (item) =>
      item.type !== "skill" &&
      index.byKey.get(typeIdKey(item.type, item.id)) === item &&
      classifySelection(item, allowlist) !== "drop" &&
      (item.tools === undefined || item.tools.includes(TOOL)),
  );
}

/**
 * The tool grant for one agent, by its RUNTIME id — the prefixed form both
 * enforcement points speak.
 *
 * Resolved through the shared resolver rather than by a roster lookup of this
 * adapter's own, so this client, its three siblings, the generated guard and
 * the install preview cannot end up disagreeing about what one agent may do. A
 * shipped agent still resolves from its roster row and emits byte-identically
 * to the lookup this replaced.
 *
 * PACK CEILING. A pack-supplied agent's grant is its own `capabilities:`
 * frontmatter INTERSECTED with the footprint its pack disclosed at install.
 * That footprint reaches this layer stamped on the catalog item
 * (`../content/catalog.ts` -> `CatalogItem.provenance`), put there once by the
 * installed-pack projection, so no adapter re-derives it by reading pack files
 * of its own — four readers of the same files is four chances to disagree
 * about one agent's privilege. Two things are still deliberately NOT done: a
 * corpus agent is never handed a ceiling (it has no pack, and the resolver's
 * `undefined` says so), and an agent's own capabilities are never passed as
 * its own ceiling — an intersection with itself grants whatever a hand-edited
 * file asks for.
 */
function grantFor(item: CatalogItem): ResolvedAgentGrant {
  const pack = item.provenance;
  return resolveAgentGrant({
    runtimeId: emittedId(item),
    frontmatter: item.frontmatter,
    // A pack item carries its supplier's disclosed footprint (stamped on the
    // walk by `../pack/projection.ts`), which is the ceiling its own
    // `capabilities:` are intersected with. A corpus item has no pack at all,
    // and that is exactly what an omitted `declaredTools` says.
    ...(pack === undefined ? {} : { declaredTools: grantableFootprint(pack.declaredTools) }),
  });
}

/** The `model:` and `effort:` lines for one agent, or nothing where the ladder answers nothing. */
function modelFrontmatter(item: CatalogItem, ctx: EmissionContext): string[] {
  const modelClass = item.frontmatter["model_class"];
  if (typeof modelClass !== "string") return [];

  const models = ctx.manifest.models;
  const model = resolveModelValue(modelClass, TOOL, models?.pins);
  const effort = resolveEffortValue(modelClass, TOOL, models?.effort);
  // Quoted through {@link yamlScalar}, like every other value this file writes
  // into frontmatter. Both are OPERATOR input: `stamity config set model.<class>`
  // and its effort sibling validate a pin's shape, not its YAML class, so a
  // value opening on `*`, `&`, `@`, `%` or `` ` `` is accepted by the config
  // gate and then rendered as a YAML alias, reserved indicator or tag — which
  // makes every agent file carrying it unparseable, while `check` and
  // `validate` stay green because neither parses the emitted frontmatter.
  return [
    ...(model === undefined ? [] : [`model: ${yamlScalar(model)}`]),
    ...(effort === undefined ? [] : [`effort: ${yamlScalar(effort)}`]),
  ];
}

// ── Builders ─────────────────────────────────────────────────────

/**
 * The `CLAUDE.md` bridge: one managed block, stamped with the engine version,
 * holding the `@AGENTS.md` import and a pointer line locating the skills. The
 * row content IS the block — default-on, no opt-in conditional — and user prose
 * around it on disk is the merge engine's to preserve, not this planner's to
 * read.
 *
 * The pointer names {@link CLAUDE_SKILLS_DIR} — the directory this client
 * reads, not the vendor-neutral tree it cannot. That is the whole difference
 * the native copy buys: the pointer can now describe how the client actually
 * reaches a skill instead of disclaiming a load path, and a reader following
 * the first line gets the documented behaviour rather than a dead end. With no
 * native location declared, the pointer is dropped rather than aimed at a tree
 * this client does not read.
 */
function buildClaudeMd(engineVersion: string): AdapterOutput {
  const inner = [
    `@${AGENTS_MD_FILE}`,
    ...(CLAUDE_SKILLS_DIR === ""
      ? []
      : [
          "",
          `Skills for this setup are markdown procedures under \`${CLAUDE_SKILLS_DIR}/\`. Claude Code reads them from there: it loads one when the work matches its description, and you can invoke any of them directly by name — \`/stamity-onboard\`, for example.`,
        ]),
  ].join("\n");
  return {
    path: CLAUDE_MD_PATH,
    content: wrapInManagedBlock(inner, CLAUDE_MD_PATH, engineVersion),
    owner: owner("claude-md-bridge", "infra"),
  };
}

/**
 * One rule in the `.claude/rules` dialect. Canonical `globs` become the
 * `paths:` YAML list verbatim — each glob its own quoted element, so a comma
 * INSIDE a glob (a brace expansion like `*.{ts,tsx}`) never splits it the way
 * a CSV form would. No globs (the `agent-requested` authoring shape;
 * `scope: always` does not exist in this corpus by construction) emits
 * description-only — which this client loads UNCONDITIONALLY at launch, at
 * `.claude/CLAUDE.md` priority, not on model pull (see the module header's
 * citation). Emitting the description alone is still right: the client offers
 * no description-pull shape to emit instead, and a `paths:` list invented to
 * narrow the load would attach the rule to files its author never scoped it
 * to.
 */
function buildRuleFile(item: CatalogItem, render: (raw: string) => string): AdapterOutput {
  const globs = declaredGlobs(item);
  const head = [`description: ${yamlScalar(item.description)}`];
  if (globs.length > 0) {
    head.push(`paths: [${globs.map((glob) => JSON.stringify(glob)).join(", ")}]`);
  }
  return {
    path: `${RULES_DIR}/${emittedId(item)}.md`,
    content: frontmatterDocument(head, bodyOf(render(item.body))),
    owner: owner(item.id, item.type),
  };
}

/**
 * One agent with the rich frontmatter the client reads: `name`,
 * `description`, `tools`, and the ladder's `model` / `effort` lines where the
 * canonical `model_class` resolves to one.
 *
 * `tools:` is never omitted. An absent key makes the sub-agent inherit every
 * tool (code.claude.com/docs/en/sub-agents, accessed 2026-08-17), so omission
 * is the WIDEST grant; an empty grant emits the explicit empty string, the
 * fail-closed end of the dialect — the client refuses to spawn an agent whose
 * list resolves to no tool.
 */
function buildAgentFile(
  item: CatalogItem,
  grant: ResolvedAgentGrant,
  model: readonly string[],
  render: (raw: string) => string,
): AdapterOutput {
  const tools = toClaudeToolsFrontmatter(grant.allow);
  const head = [
    `name: ${emittedId(item)}`,
    `description: ${yamlScalar(item.description)}`,
    `tools: ${tools === "" ? '""' : tools}`,
    ...model,
  ];

  return {
    path: `${AGENTS_DIR}/${emittedId(item)}.md`,
    content: frontmatterDocument(head, bodyOf(render(item.body))),
    owner: owner(item.id, item.type),
  };
}

/**
 * One touchpoint command as a native slash command, invoked by its file name.
 *
 * `description` alone. The client accepts the whole skill frontmatter set here
 * (minus `name` and `paths`, which it ignores in a command file), and a
 * command that arrives pre-authorized widens what a session does by default:
 * `allowed-tools` reads as a restriction to anyone auditing the file while
 * actually being a grant, and `model` / `effort` on a command would override
 * the per-role allocation the agent files already carry. The body renderer is
 * the agent one — command prose carries the same `${STAMITY:VERIFY_GATE_*}`
 * commands, and emitting one raw would hand the model a broken template
 * variable where a runnable command belongs.
 */
function buildCommandFile(item: CatalogItem, render: (raw: string) => string): AdapterOutput {
  return {
    path: `${CLAUDE_COMMANDS_DIR}/${emittedId(item)}.md`,
    content: frontmatterDocument(
      [`description: ${yamlScalar(item.description)}`],
      bodyOf(render(item.body)),
    ),
    owner: owner(item.id, item.type),
  };
}

/**
 * The work-scoped review gate script, carrying this repo's clamped round cap
 * and this client's honest blocking strength.
 *
 * The cap comes from `readReviewCap`, the one function every consumer clamps
 * through, so the number in the emitted script is the number the work
 * command's prose and `stamity config` state. A client with no guarantee row
 * falls back to blocking: an exit status a client ignores costs nothing, while
 * assuming it ignores one would silently disarm the gate.
 */
function buildReviewGate(ctx: EmissionContext): AdapterOutput {
  return {
    path: CLAUDE_REVIEW_GATE_PATH,
    content: buildReviewGateScript({
      statePath: REVIEW_GATE_STATE_FILE,
      maxIterations: readReviewCap(ctx.manifest),
      failMode: HOOK_GUARANTEE?.failMode ?? "fail-closed",
    }),
    owner: owner("claude-review-gate", "infra"),
  };
}

// ── Settings ─────────────────────────────────────────────────────

/** One `type: "command"` hook in the client's config shape. */
interface ClaudeHookCommand {
  type: "command";
  command: string;
  /** Seconds — the client's unit, converted from the interchange request. */
  timeout?: number;
}

/** One matcher group under an event key. */
interface ClaudeHookEntry {
  matcher?: string;
  hooks: ClaudeHookCommand[];
}

/**
 * `.claude/settings.json`: the permissions chain plus the hook wiring, as one
 * whole-file JSON document (plain `.json` takes no managed block — it has no
 * comment syntax to carry markers, per `src/types/markers.ts`).
 *
 * The hook transform is mechanical over the portable interchange: PascalCase
 * event names from `CLAUDE_EVENT_NAMES`, one entry per row in declaration
 * order (core scripts, then user hooks, then installed-pack hooks — the
 * core plan's lane order), matcher
 * carried only where the row declares one, the exec-form argv joined into the
 * command string (`node <script>` — this adapter wraps nothing in `sh -c`,
 * though the client parses what it writes with a shell; see
 * {@link shellWord}), and the
 * `timeoutMs` request converted to this client's whole-second `timeout`
 * field. On top of that, the per-client extensions, in
 * `CLIENT_EXTENSION_EVENTS` order: the tamper-notice script is ALSO wired to
 * `ConfigChange` (non-portable — see {@link CONFIG_CHANGE_EVENT}) while its
 * portable session-start wiring stays, exactly the dual reading the script
 * body is written for; and the review gate takes
 * {@link REVIEW_GATE_EVENTS}, the two events that carry a work run's
 * completion and its finishing reviewers. Insertion order is fixed, so the
 * whole-file JSON is byte-stable across runs and the drift check has nothing
 * to report.
 */
function buildSettingsJson(core: CoreEmissionPlan): string {
  const rows = core.hooks.interchangeFor(TOOL);

  const hooks: Record<string, ClaudeHookEntry[]> = {};
  for (const event of CANONICAL_HOOK_EVENTS) {
    const entries = rows.filter((row) => row.event === event).map(hookEntry);
    if (entries.length > 0) hooks[CLAUDE_EVENT_NAMES[event]] = entries;
  }

  const tamper = rows.find(
    (row) => row.event === "session_start" && argvTail(row) === TAMPER_NOTICE_SCRIPT_FILE,
  );
  if (tamper !== undefined) {
    // No matcher: the notice should fire on every configuration change the
    // client reports, and the script itself names the changed file from the
    // payload — narrowing here would trade coverage for nothing.
    hooks[CONFIG_CHANGE_EVENT] = [hookEntry({ event: tamper.event, command: tamper.command })];
  }
  // Same wiring as the extension above — no matcher, one exec-form command —
  // on each of the two events, and the ONE script decides per event what to do
  // with the payload it was handed.
  for (const event of REVIEW_GATE_EVENTS) {
    hooks[event] = [{ hooks: [commandHook(["node", CLAUDE_REVIEW_GATE_PATH])] }];
  }

  return `${JSON.stringify({ permissions: { allow: CLAUDE_PERMISSION_ROWS }, hooks }, null, 2)}\n`;
}

/** One interchange row as a client config entry. */
function hookEntry(row: HookInterchange): ClaudeHookEntry {
  return {
    ...(row.matcher === undefined ? {} : { matcher: row.matcher }),
    hooks: [commandHook(row.command, row.timeoutMs)],
  };
}

/** One exec-form argv as the client's `type: "command"` handler. */
function commandHook(argv: readonly string[], timeoutMs?: number): ClaudeHookCommand {
  return {
    type: "command",
    command: argv.map(shellWord).join(" "),
    // The client's `timeout` is whole seconds (code.claude.com/docs/en/hooks,
    // accessed 2026-08-17); the interchange request is milliseconds. Ceil, so
    // a sub-second request rounds up to the nearest second the client can
    // express instead of truncating to an instant timeout.
    ...(timeoutMs === undefined ? {} : { timeout: Math.max(1, Math.ceil(timeoutMs / 1000)) }),
  };
}

/** Shell-safe tokens: anything outside this set forces quoting. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/**
 * One argv element into the joined command string.
 *
 * The join is a CLIENT-FORMAT requirement, not a safety step. A hook entry here
 * carries one `command` STRING and the client hands it to a shell — `sh -c` on
 * macOS and Linux, Git Bash on Windows (code.claude.com/docs/en/hooks, accessed
 * 2026-08-22) — so the exec-form argv the interchange carries has to be rendered
 * back into a command line before it can be written at all.
 *
 * POSIX single-quoting, the same rendering `./cursor.ts` reaches for at the same
 * dialect gap: a token made only of shell-safe characters is written bare, and
 * anything else is wrapped in single quotes with each embedded `'` closed,
 * escaped and reopened (`'\''`). Single and not double, because double quotes
 * change what an element MEANS rather than only where it ends — inside them
 * `$VAR` still expands and `\` still escapes, so `back\slash` reaches the client
 * as `backslash` and `$HOME` as the operator's home directory. Single quotes
 * suspend every expansion the shell has, so a POSIX shell re-splits the line
 * into exactly the argv the author declared. The empty element fails the
 * shell-safe test, renders `''`, and survives as an element instead of
 * disappearing between two spaces.
 *
 * The guarantee stops at the argument boundaries. Quoting cannot decide whether
 * a command SHOULD run: that is `src/shared/launcherAllowlist.ts` at ingress,
 * refusing any argv whose `argv[0]` is not an allowed launcher, that carries an
 * inline-code flag, or that names anything but exactly one committed,
 * repo-contained script — with `src/hooks/userHooks.ts` refusing `;`, `|`, `&`,
 * a backtick, `<`, `>` and `$(` in any element on top of it. The allow-list is
 * what makes an emitted line safe to run; the rendering here only keeps it the
 * line the author wrote. And the boundary claim is POSIX: the PowerShell
 * fallback the page names for a Windows host without Git Bash escapes an
 * embedded quote its own way, and one rendering cannot satisfy both.
 *
 * DEFERRAL — this renderer is a copy of `./cursor.ts`, not a shared helper.
 *   Wanted:    one module both adapters read, so the two cannot drift into two
 *              answers for one question the way they just did.
 *   Blocker:   the shared home would be a new `src/shared/` module plus an edit
 *              to `./cursor.ts`, both outside the file set this change owns.
 *   Meanwhile: the predicate and the escape below are byte-identical to
 *              `./cursor.ts`'s `SHELL_SAFE` and `shellCommand`. Change one and
 *              the other is wrong; a shared helper is what retires that rule.
 *
 * DEFERRAL — the argv does not reach the client AS argv.
 *   Available: this client's hook entry also takes an exec form — `command` as
 *              the executable plus an `args` array, "passed directly without
 *              shell interpretation" (same page, accessed 2026-08-22) — which
 *              would retire the quoting question rather than answer it.
 *   Blocker:   the page dates no client version to `args`, and a settings file
 *              cannot feature-detect. A client that predates the field reads the
 *              entry as shell form and runs `node` with no script, which disarms
 *              every hook silently instead of failing loudly.
 *   Trigger:   re-open when the docs name the version that introduced `args`, or
 *              when this repo pins a minimum client version at or above it.
 *              Adopting it also rewrites `docs/capability-matrix.md` and both
 *              emission goldens, so it lands as its own unit, not as a rider.
 */
function shellWord(word: string): string {
  return SHELL_SAFE.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`;
}

/** Final path segment of a row's script argument, or empty when there is none. */
function argvTail(row: HookInterchange): string {
  const script = row.command[1] ?? "";
  return script.slice(script.lastIndexOf("/") + 1);
}

// ── Shared rendering ─────────────────────────────────────────────

/**
 * The body transforms, split per contract. Rule bodies resolve repo detection
 * facts and the platform ask-user marker. Agent AND command bodies
 * additionally resolve the verification-gate tokens — both carry
 * `${STAMITY:VERIFY_GATE_*}` commands, and emitting one raw would hand the
 * model a broken template variable where a runnable command belongs. The two
 * share one function rather than each getting a near-copy: they need the same
 * passes, and a second spelling is how one lane silently loses a pass.
 */
function bodyRenderers(ctx: EmissionContext): {
  rule: (raw: string) => string;
  agent: (raw: string) => string;
  command: (raw: string) => string;
} {
  const detection = detectionContextFromManifest(ctx.manifest);
  const gates = verificationGatesFromManifest(ctx.manifest);
  const withGates = (raw: string): string =>
    substituteCanonicalPlatformMarker(
      substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
      TOOL,
    );
  return {
    rule: (raw) => substituteCanonicalPlatformMarker(substituteRepoTokens(raw, detection), TOOL),
    agent: withGates,
    command: withGates,
  };
}

/** One MCP document the core planned, carried through with a per-dialect ledger id. */
function mcpRow(emission: McpEmission): AdapterOutput {
  return {
    path: emission.path,
    content: emission.content,
    owner: owner(`mcp-${emission.dialect}`, "infra"),
  };
}

/**
 * The emitted filename stem and, for agents, the runtime id: the artifact's id
 * with the catalog's command namespacing removed and the `stamity-` filename
 * prefix restored. A command is invoked by its file name, and the tool-policy
 * roster keys on the same prefixed form as an agent's frontmatter `name:`, so
 * the typed command, the emitted `name:`, and the guard's governed namespace
 * all agree by construction.
 */
function emittedId(item: CatalogItem): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  return bare.startsWith(CONTENT_PREFIX) ? bare : `${CONTENT_PREFIX}${bare}`;
}

/** Ledger attribution — every row this adapter returns is owned by `claude`. */
function owner(artifactId: string, artifactType: ContentClass | "infra"): EmissionOwner {
  return { adapter: TOOL, artifactId, artifactType };
}

/**
 * Declared globs as a de-duplicated list, from either authoring shape — a
 * YAML list, or one comma-separated string. Anything else reads as no scope
 * (the description-only emission) rather than throwing: over-broad load is
 * recoverable, a dropped rule is invisible. Deliberately the narrow local
 * read, matching the sibling adapters, until a shared rule-scope reader
 * exists.
 */
function declaredGlobs(item: CatalogItem): string[] {
  const declared = item.frontmatter["globs"];
  const raw =
    typeof declared === "string"
      ? declared.split(",")
      : Array.isArray(declared)
        ? declared.filter((entry) => typeof entry === "string")
        : [];

  const seen = new Set<string>();
  for (const glob of raw) {
    const value = glob.trim();
    if (value !== "") seen.add(value);
  }
  return [...seen];
}

/**
 * Frontmatter over a body: fenced head, one blank line, body, one trailing
 * newline. The client parses frontmatter at byte 0 only, so the fence opens
 * the file with nothing before it.
 */
function frontmatterDocument(lines: readonly string[], body: string): string {
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

/** A rendered body with its surrounding blank lines removed — the emitted slice. */
function bodyOf(rendered: string): string {
  return rendered.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "");
}

/**
 * A frontmatter value as a double-quoted YAML scalar. Always quoted, never
 * conditionally: descriptions routinely carry `: `, which changes how a plain
 * scalar parses. Line breaks collapse to spaces first; JSON's escaping is a
 * valid YAML double-quoted scalar, so an embedded quote survives as itself.
 */
function yamlScalar(value: string): string {
  return JSON.stringify(value.replace(/\s*[\r\n]+\s*/g, " ").trim());
}
