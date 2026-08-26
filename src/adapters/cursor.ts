/**
 * Cursor residue planner — the per-client half of a Cursor setup, and nothing
 * else.
 *
 * The core emits the standards surface once: the root `AGENTS.md` charter
 * (native on Cursor — no entry file, no bridge rule), the vendor-neutral
 * `.agents/skills/` projection, the hook scripts and their policy document.
 * What is left over is genuinely Cursor-shaped and lives here:
 *
 * 1. **`.cursor/rules/*.mdc`** — the client's rule dialect, carrying the glob
 *    quirk documented at {@link buildMdcRule}.
 * 2. **`.cursor/agents/*.md`** — `description` / `model` / `readonly`
 *    frontmatter over the authored agent body.
 * 3. **`.cursor/hooks.json`** — the portable interchange rows renamed into
 *    Cursor's camelCase event taxonomy ({@link EVENT_RENAME}) and rendered as
 *    shell command strings, plus the two guard entries below.
 * 4. **`.cursor/hooks/subagent-guard.mjs` + `.cursor/hooks/mcp-guard.mjs`** —
 *    the two gates Cursor can enforce that no other surface covers: a spawn
 *    guard bound to the one event carrying agent identity, and an MCP
 *    allowlist bound to the one event carrying server identity.
 * 5. **`.cursor/mcp.json`** — the core's `cursor-json` MCP document, placed
 *    verbatim. This module renders no MCP content of its own.
 * 6. **`.cursor/skills/<id>/SKILL.md`** — the nine touchpoint command bodies,
 *    on the one project surface this client documents for an explicitly
 *    invoked body ({@link CURSOR_COMMANDS_DIR}).
 *
 * Guarantee honesty (`CLIENT_HOOK_GUARANTEES`): a Cursor hook is ADVISORY by
 * default — a rejecting hook is logged and the action proceeds — and blocks
 * only where the entry declares `failClosed: true`. The rows that declare it
 * are the rows that can mean it: the two guards above, whose events carry the
 * identity each judges, and any pre-tool-use row this repo or a pack authored.
 * Observational rows (session start, the tamper notice) do not, because
 * blocking on a notice would trade a real session for a log line — and neither
 * does the CORE pre-tool-use guard, which this client's identity-free tool-call
 * payload leaves as telemetry ({@link CORE_GUARD_REACHES_VERDICT}). What this
 * client does not get: the interchange's `timeoutMs`, which is dropped rather
 * than rescaled — the config dialect does carry a per-entry `timeout` in
 * SECONDS (cursor.com/docs/agent/hooks, accessed 2026-08-17), so the gap is a
 * conversion this emission does not yet make, not a field the client lacks.
 * And no way for a USER hook to request blocking — every wired user row is
 * advisory unless its event is the pre-tool-use gate. Both gaps are stated in
 * {@link cursorDialectFacts} rather than papered over.
 *
 * Deliberately NOT emitted, and each absence is a decision:
 *
 * - **A bridge rule / entry-file mirror.** `AGENTS.md` is native here, so a
 *   second copy would be a second source of truth for the same standards.
 * - **An environment descriptor.** The charter carries repo facts; a parallel
 *   machine-readable copy drifted from it in the predecessor design.
 * - **Any always-applied rule.** A rule activates in one of TWO sanctioned
 *   modes — glob-scoped, or agent-requested by description (content-classes
 *   SoT, class row 5; a maintainer ruling of 2026-08-16, which settled the
 *   contradiction with the rules-layer SoT's narrower "glob-conditional only"
 *   wording in favour of the two-mode reading and kept the shipped
 *   agent-requested rules). Neither mode is always-on: that layer IS the
 *   charter, so `alwaysApply: true` is never emitted and a rule declaring
 *   `scope: always` is refused by name instead of quietly becoming session
 *   noise.
 * - **A working-directory guard.** It mitigated a pre-3.0 Cursor path-escape
 *   class and is not carried in this version. Revisit trigger: a repeat of the
 *   symlink/working-directory escape class on a supported Cursor release, or a
 *   payload field that lets the guard bind without realpath probing every read.
 *
 * Platform facts are data ({@link cursorDialectFacts}, {@link EVENT_RENAME}),
 * each with a citation and an access date, because the capability matrix is
 * generated from this module rather than maintained beside it. Rows carrying
 * the earlier access dates were verified against those pages then and are
 * re-verified per release; a taxonomy the client renames upstream is a
 * currency finding on the next pass, not a silent no-op.
 *
 * Planning is pure: corpus reads are reads of context, nothing is written, and
 * two plans over one input are byte-identical (stable ordering, no clock in
 * the emitted bytes).
 */

import {
  COMMAND_ID_PREFIX,
  buildContentIndex,
  typeIdKey,
  type CatalogItem,
} from "../content/catalog.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { verificationGatesFromManifest } from "../emit/agentsMd.ts";
import { HOOKS_GENERATED_DIR } from "../emit/hooksInfra.ts";
import type {
  AdapterDialectFacts,
  CoreEmissionPlan,
  EmissionContext,
  ResidueEmission,
  ResiduePlanner,
} from "../emit/planner.ts";
import {
  detectionContextFromManifest,
  substituteRepoTokens,
  substituteVerificationGateTokens,
} from "../emit/substitution.ts";
import { CANONICAL_HOOK_EVENTS, type CanonicalHookEvent, type HookInterchange } from "../hooks/model.ts";
import { IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS } from "../hooks/scripts.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import { RUNTIME_AGENT_IDS } from "../roster/agentPolicies.ts";
import { resolveModelValue, type EffortMap, type ModelPinMap } from "../roster/modelLadder.ts";
import {
  substituteCanonicalPlatformMarker,
  toCursorReadonlyFrontmatter,
} from "../tools/translator.ts";
import type { AdapterOutput } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX } from "../types/markers.ts";

// ── Layout ───────────────────────────────────────────────────────

/** Repo-relative root of the client's rule dialect. */
export const CURSOR_RULES_DIR = ".cursor/rules";

/** Repo-relative root of the client's agent definitions. */
export const CURSOR_AGENTS_DIR = ".cursor/agents";

/**
 * Repo-relative root of the surface the touchpoint command bodies land on, or
 * `null` if this client ever stops documenting one.
 *
 * `.cursor/commands/` is NOT that surface: the client folded slash commands
 * into skills in 2.4, the page that documented the commands directory now
 * documents skills, and its built-in `/migrate-to-skills` converts "both
 * user-level and workspace-level" commands into skills carrying
 * `disable-model-invocation: true` — the field whose whole job is to preserve
 * explicit-invocation behaviour (cursor.com/docs/skills, accessed 2026-08-17).
 * Emitting into a directory no current page names would be an invented path;
 * emitting a skill that declines model invocation is the vendor's own answer
 * to "where does a project slash command live now", and it keeps the charter's
 * `/stamity-<id>` touchpoint spelling literally true on this client.
 *
 * The core's `.agents/skills/` projection is the SKILL class and is untouched
 * by this: disjoint CONTENT (skill bodies there, touchpoint command bodies
 * here), one writer each. What is NOT disjoint is discovery. This client loads
 * project skills from `.agents/skills/` AND `.cursor/skills/`, and "for
 * compatibility" also from `.claude/skills/`, `.codex/skills/`,
 * `~/.claude/skills/` and `~/.codex/skills/` (cursor.com/docs/skills, accessed
 * 2026-08-22). So in a repo that selects `claude` alongside this client, the
 * same skills are discovered twice under one name — once from the core
 * projection, once from the byte-identical native copy the claude adapter
 * re-targets into `.claude/skills/` — and that page documents no tie-break.
 * The cost is context duplication on the always-available slice plus an
 * undefined `/name` resolution, not a wrong emission: both trees are this
 * engine's, byte-identical by construction, so whichever wins is the same
 * bytes.
 *
 * Deliberately not acted on here. Suppressing the `.claude/skills/` re-target
 * when a client that reads `.agents/skills/` is co-selected would change what
 * a claude-only repo receives on a second client's selection — a behaviour
 * decision, not an adapter detail. Carrying the fact into the generated
 * capability matrix needs a `cross-root discovery` cap row on this client's
 * facts and on the two sibling clients that read each other's roots, which is
 * a three-adapter change plus a page re-render.
 */
export const CURSOR_COMMANDS_DIR: string | null = ".cursor/skills";

/** Repo-relative hook configuration document. */
export const CURSOR_HOOKS_CONFIG_PATH = ".cursor/hooks.json";

/** Repo-relative home of the two adapter-owned guard scripts. */
export const CURSOR_GUARD_DIR = ".cursor/hooks";

/** The spawn guard: denies a sub-agent id outside the shipped roster. */
export const SUBAGENT_GUARD_PATH = `${CURSOR_GUARD_DIR}/subagent-guard.mjs`;

/** The MCP guard: denies a server outside the resolved `.cursor/mcp.json` set. */
export const MCP_GUARD_PATH = `${CURSOR_GUARD_DIR}/mcp-guard.mjs`;

/**
 * Per-rule body budget. Cursor's own guidance caps a rule at 500 lines
 * (cursor.com/docs/context/rules, accessed 2026-08-13); a rule over it is a
 * corpus defect this module refuses by name rather than emitting a file the
 * client may truncate at an arbitrary point.
 */
export const CURSOR_RULE_LINE_CAP = 500;

/** Prefix of the MCP tool names a client surfaces, e.g. `mcp__github__search`. */
const MCP_TOOL_PREFIX = "mcp__";

// ── Event taxonomy ───────────────────────────────────────────────

/**
 * Canonical interchange event → Cursor `hooks.json` event name.
 *
 * FIVE rows are the mechanical snake_case → lowerCamelCase rename the portable
 * model is built around. The sixth is not, and it is the reason this table is
 * written out rather than computed: this client names the prompt-submission
 * hook `beforeSubmitPrompt` — "Called right after user hits send but before
 * backend request. Can prevent submission." — and the string `userPromptSubmit`
 * names no event on it at all (cursor.com/docs/agent/hooks, accessed
 * 2026-08-22).
 *
 * Emitting the computed name was silent in both directions: the config still
 * parsed, the key still sat in `.cursor/hooks.json`, and the one canonical
 * event it stood for never fired on this client while the portable model went
 * on promising authors six events every client can honour. Nothing on either
 * side reports a `hooks.json` key the client does not recognise, so the suite
 * pins all six strings against the documented event list instead.
 *
 * All six were re-read against that page on 2026-08-22 (`sessionStart`,
 * `preToolUse`, `postToolUse`, `stop` and `sessionEnd` verbatim, plus the
 * `beforeSubmitPrompt` correction above). A literal table also keeps a future
 * canonical rename from silently changing what gets emitted — the same reason
 * `CLAUDE_EVENT_NAMES` is a literal table.
 */
export const EVENT_RENAME: Readonly<Record<CanonicalHookEvent, string>> = {
  session_start: "sessionStart",
  pre_tool_use: "preToolUse",
  post_tool_use: "postToolUse",
  user_prompt_submit: "beforeSubmitPrompt",
  stop: "stop",
  session_end: "sessionEnd",
};

/**
 * Client-specific events with no portable counterpart, used by the two guards.
 * They are extensions by definition — no other target client exposes a spawn
 * or an MCP-execution decision point — so they live outside
 * {@link EVENT_RENAME} instead of pretending to be portable.
 *
 * `subagentStart` carries `subagent_type`, the only Cursor payload field that
 * names the agent about to run; `beforeMCPExecution` carries the server
 * identity of a pending MCP call as `tool_name` plus EITHER `url` (a remote
 * server) OR `command` (a stdio one) — the three spellings
 * {@link buildMcpGuardScript} matches on (cursor.com/docs/agent/hooks, both
 * input schemas accessed 2026-08-22).
 */
export const CURSOR_GUARD_EVENTS = {
  subagentSpawn: "subagentStart",
  mcpExecution: "beforeMCPExecution",
} as const;

/**
 * The one canonical event whose rows are gates rather than observations. A
 * pre-tool-use hook exists to decide, so a row on it opts into fail-closed —
 * otherwise the script would refuse a call the client then allows anyway.
 *
 * Necessary, not sufficient: the event says a row is ALLOWED to be a gate, and
 * {@link rowOptsIntoBlocking} decides whether the row in hand can mean it. On
 * this client the core guard cannot ({@link CORE_GUARD_REACHES_VERDICT}), so
 * the opt-in is per ROW rather than per event.
 */
const BLOCKING_EVENTS: ReadonlySet<CanonicalHookEvent> = new Set(["pre_tool_use"]);

/**
 * Repo-relative prefix every core-emitted hook script for this client sits
 * under, derived from the constant the core builds those paths from
 * (`../emit/hooksInfra.ts` → `HOOKS_GENERATED_DIR`, joined with the tool name
 * exactly as `planCoreHooks` joins it). Derived rather than restated so a
 * relocation upstream moves both ends at once instead of silently reclassifying
 * every core row as authored.
 */
const CORE_SCRIPT_PREFIX = `${HOOKS_GENERATED_DIR}/cursor/`;

/**
 * Whether the CORE pre-tool-use guard can reach a verdict on this client.
 *
 * Read from the fact the guard's own body is generated from
 * (`../hooks/scripts.ts` → `IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS`, exported for
 * exactly this reason) rather than asserted here, so the config row and the
 * script bytes cannot disagree.
 *
 * It is `false` here. This client's tool-call payload names no calling agent —
 * `subagentStart`'s `subagent_type` is the only field that names one, and that
 * is a different event ({@link CURSOR_GUARD_EVENTS}) — so the guard's scope
 * test returns early on every call it will ever see, and `planCoreHookScripts`
 * generates its body as telemetry: `BLOCKING = false`, exit 0 on every path,
 * under a banner reading "Telemetry only on this client". Declaring
 * `failClosed` on that row would advertise an enforcement point the bytes
 * cannot reach, and would buy nothing for it: with no verdict to block on, the
 * flag's only remaining reach is turning a crashed or timed-out RECORD-KEEPER
 * into a blocked tool call.
 *
 * Authored rows are untouched by this. A repo's own pre-tool-use hook judges
 * whatever the payload does carry, so its exit status is its own to mean.
 */
const CORE_GUARD_REACHES_VERDICT = !IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS.has("cursor");

/** True for an interchange row running a script the core generated for this client. */
function isCoreScriptRow(row: HookInterchange): boolean {
  return row.command.some((token) => token.startsWith(CORE_SCRIPT_PREFIX));
}

/**
 * Whether this row's exit status is authoritative enough to opt into blocking:
 * a gate event, and a body that can reach a refusal on this client.
 */
function rowOptsIntoBlocking(event: CanonicalHookEvent, row: HookInterchange): boolean {
  if (!BLOCKING_EVENTS.has(event)) return false;
  return CORE_GUARD_REACHES_VERDICT || !isCoreScriptRow(row);
}

// ── Declared dialect facts ───────────────────────────────────────

/** Ledger artifact ids for this adapter's infra emissions. */
const ARTIFACT_IDS = {
  hooksConfig: "cursor-hooks-config",
  subagentGuard: "cursor-subagent-guard",
  mcpGuard: "cursor-mcp-guard",
  mcp: "mcp-config",
} as const;

/** What this client can and cannot do, as the generated capability matrix reads it. */
export const cursorDialectFacts: AdapterDialectFacts = {
  tool: "cursor",
  ruleShape:
    "`.cursor/rules/<id>.mdc` — `description` plus `globs` as an unquoted comma-separated list with no spaces; `alwaysApply: false` on every emitted rule",
  hooksConfigPath: CURSOR_HOOKS_CONFIG_PATH,
  readsAgentsSkillsDir: true,
  agentsFormat:
    "`.cursor/agents/<id>.md` — `description`, `model` (the operator's pinned id for the role's class, carrying this client's `[effort=…]` parameter; the key is omitted entirely when no pin names one, so the client applies its own default rather than the engine restating it), `readonly`",
  mcpDialect: "cursor-json",
  entryFile: null,
  caps: [
    { name: "rule body", value: `${CURSOR_RULE_LINE_CAP} lines per rule, refused above` },
    {
      name: "hook enforcement",
      // The second sentence is DERIVED from the same fact the emitted rows are
      // (see {@link CORE_GUARD_REACHES_VERDICT}), so the operator-facing claim
      // and `buildHooksJson`'s output cannot drift into disagreeing about which
      // rows block. Hand-written, they already had: the row counted the core
      // pre-tool-use guard as a blocking emission after that guard's body had
      // been regenerated as telemetry on this client.
      value:
        "advisory by default; an entry declaring failClosed: true blocks on the exit-2 status. Emitted on " +
        (CORE_GUARD_REACHES_VERDICT
          ? "the pre-tool-use gate and both guards"
          : "both guards and on any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on"),
    },
    {
      name: "hook timeout",
      value:
        "the config dialect carries a per-entry timeout in SECONDS; the interchange states one in milliseconds and it is dropped rather than rescaled at emission, so a declared timeout does not reach this client",
    },
    {
      name: "command surface",
      value:
        CURSOR_COMMANDS_DIR === null
          ? "none — no project surface for an explicitly invoked body is documented, so the touchpoint command bodies are not emitted on this client"
          : `\`${CURSOR_COMMANDS_DIR}/<id>/SKILL.md\` with \`disable-model-invocation: true\` — this client folded slash commands into skills, so no \`.cursor/commands/\` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills`,
    },
    {
      name: "user hook enforcement",
      value:
        "advisory unless the hook declares the pre-tool-use event; the interchange schema carries no per-hook blocking request",
    },
    {
      name: "MCP tool surface",
      value:
        "client-side lazy loading around a ~40-tool session budget, so a wide server selection can crowd out the rest",
    },
    {
      name: "workdir guard",
      value:
        "not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release",
    },
  ],
  // Re-verified page by page on the per-release currency pass. The MCP row
  // keeps the older date deliberately: the path and the `mcpServers` key were
  // re-confirmed on 2026-08-17, but the ~40-tool session budget that row's cap
  // rests on is no longer stated on that page, so the claim stands on the
  // reading that produced it rather than on a date it cannot support.
  //
  // These dates move on the release currency pass, which is also when the
  // generated matrix is re-rendered — so a mid-cycle re-read recorded in a
  // code comment (the hooks and skills pages, 2026-08-22) sits AHEAD of the row
  // it belongs to. The direction is the safe one: a row never claims a reading
  // that did not happen, it only under-reports one that did.
  citations: [
    { url: "https://cursor.com/docs/context/rules", accessDate: "2026-08-17" },
    { url: "https://cursor.com/docs/agent/subagents", accessDate: "2026-08-17" },
    { url: "https://cursor.com/docs/agent/hooks", accessDate: "2026-08-17" },
    { url: "https://cursor.com/docs/skills", accessDate: "2026-08-17" },
    { url: "https://cursor.com/docs/mcp", accessDate: "2026-06-09" },
  ],
};

// ── The planner ──────────────────────────────────────────────────

/**
 * Plan every Cursor-shaped row for one run.
 *
 * Rules and agents are read from the corpus through the same selection
 * allowlist the rest of emission uses, so a floor artifact survives a
 * hand-edited manifest and a deselected one is dropped here and reclaimed by
 * the ledger. An artifact restricted to other clients (`tools:` frontmatter)
 * is skipped — this is the only layer that can honour that restriction, since
 * the core surface is tool-neutral by construction.
 *
 * Bodies get the same substitution pass the core applies to skills — repo
 * detection facts, verification-gate commands, then the platform ask-user
 * marker resolved for THIS client rather than to the neutral table. The
 * per-client resolution is the reason agent and rule bodies are emitted here
 * instead of once in the core.
 *
 * Rows come back sorted by path so the plan is a function of its inputs alone.
 */
export const cursorResiduePlanner: ResiduePlanner = {
  tool: "cursor",
  facts: cursorDialectFacts,
  async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
    const index = await buildContentIndex(ctx.contentRoot);
    const allowlist = buildSelectionAllowlist(ctx.manifest.selection);
    const detection = detectionContextFromManifest(ctx.manifest);
    const gates = verificationGatesFromManifest(ctx.manifest);
    const render = (raw: string): string =>
      substituteCanonicalPlatformMarker(
        substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
        "cursor",
      );

    const admitted = (type: CatalogItem["type"]): CatalogItem[] =>
      index.items.filter(
        (item) =>
          item.type === type &&
          // First claimant of a contested id wins, matching catalog reachability.
          index.byKey.get(typeIdKey(item.type, item.id)) === item &&
          (item.tools === undefined || item.tools.includes("cursor")) &&
          classifySelection(item, allowlist) !== "drop",
      );

    const rows: AdapterOutput[] = [];

    for (const rule of admitted("rule")) {
      rows.push({
        path: `${CURSOR_RULES_DIR}/${prefixedId(rule.id)}.mdc`,
        content: buildMdcRule(rule, render(rule.body)),
        owner: { adapter: "cursor", artifactId: rule.id, artifactType: "rule" },
      });
    }

    // Both allocation axes, because on this client they travel together: the
    // effort level has no standalone key here and rides inside the model value,
    // so reading pins without efforts would emit the ladder's default effort
    // over an operator setting `stamity config` already displays as binding.
    const pins = ctx.manifest.models?.pins ?? {};
    const efforts = ctx.manifest.models?.effort ?? {};
    const spawnable: string[] = [...RUNTIME_AGENT_IDS];

    // Each grant is RESOLVED rather than looked up: a roster row still answers
    // for every core id, and an installed pack's agent — which has no row at
    // all — is ruled on from its own `capabilities:` bounded by the footprint
    // its pack disclosed at install, which the walk stamps onto the item
    // (`../pack/projection.ts`). A corpus agent carries no provenance, and an
    // omitted `declaredTools` is what says "there is no pack"; a pack agent
    // whose supplier disclosed nothing keeps the fail-closed end — an empty
    // ceiling grants nothing and the agent emits `readonly: true`.
    for (const agent of admitted("agent")) {
      const runtimeId = prefixedId(agent.id);
      const pack = agent.provenance;
      spawnable.push(runtimeId);
      rows.push({
        path: `${CURSOR_AGENTS_DIR}/${runtimeId}.md`,
        content: buildCursorAgent(
          agent,
          resolveAgentGrant({
            runtimeId,
            frontmatter: agent.frontmatter,
            ...(pack === undefined
              ? {}
              : { declaredTools: grantableFootprint(pack.declaredTools) }),
          }),
          render(agent.body),
          pins,
          efforts,
        ),
        owner: { adapter: "cursor", artifactId: agent.id, artifactType: "agent" },
      });
    }

    // Absent surface, absent rows: a client that documents no home for an
    // explicitly invoked body gets none invented for it, and the fact lives in
    // this adapter's declared caps where the capability matrix renders it.

    if (CURSOR_COMMANDS_DIR !== null) {
      for (const command of admitted("command")) {
        const name = commandName(command);
        rows.push({
          path: `${CURSOR_COMMANDS_DIR}/${name}/SKILL.md`,
          content: buildCursorCommand(command, name, render(command.body)),
          owner: { adapter: "cursor", artifactId: command.id, artifactType: "command" },
        });
      }
    }

    rows.push(
      {
        path: SUBAGENT_GUARD_PATH,
        // Every id this run can legitimately spawn: the shipped roster, plus
        // the agents actually emitted above. A pack agent emitted without a
        // roster row would otherwise be denied at the spawn guard while its own
        // file sits in `.cursor/agents/` inviting the spawn — a refusal the
        // operator cannot act on, since the id IS installed.
        content: buildSubagentGuardScript(spawnable),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.subagentGuard, artifactType: "infra" },
      },
      {
        path: MCP_GUARD_PATH,
        content: buildMcpGuardScript(),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.mcpGuard, artifactType: "infra" },
      },
      {
        path: CURSOR_HOOKS_CONFIG_PATH,
        content: buildHooksJson(core.hooks.interchangeFor("cursor")),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.hooksConfig, artifactType: "infra" },
      },
    );

    // The core rendered these; this adapter only places them. Zero selected
    // servers yields zero documents — an absent config, never an empty one.
    for (const emission of core.mcpFor("cursor")) {
      rows.push({
        path: emission.path,
        content: emission.content,
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.mcp, artifactType: "infra" },
      });
    }

    return { outputs: rows.toSorted((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) };
  },
};

/** `reviewer` → `stamity-reviewer`: the runtime, wire-visible form of an id. */
function prefixedId(id: string): string {
  return `${CONTENT_PREFIX}${id}`;
}

/**
 * `cmd-work` → `stamity-work`: the catalog's command namespacing removed, the
 * runtime prefix restored. It is the emitted directory name AND the skill's
 * `name`, which is what the operator types after the slash — so the charter's
 * `/stamity-work` touchpoint spelling and the file on disk agree by
 * construction rather than by convention.
 */
function commandName(item: CatalogItem): string {
  return prefixedId(
    item.id.startsWith(COMMAND_ID_PREFIX) ? item.id.slice(COMMAND_ID_PREFIX.length) : item.id,
  );
}

// ── Rules ────────────────────────────────────────────────────────

/** Accepted `scope:` values. Anything else is a typo, and is named rather than guessed. */
const RULE_SCOPES = new Set(["always", "agent-requested", "conditional"]);

/**
 * One `.mdc` rule: derived activation frontmatter over the rendered body.
 *
 * The client quirk this function exists for: `globs` is emitted as an
 * UNQUOTED, comma-separated list with NO space after the comma —
 * `globs: src/auth/**,src/api/**`. The documented form is a comma-separated
 * string (cursor.com/docs/context/rules, accessed 2026-08-13); the bracketed
 * array is undocumented, and a space after the separator is reported to stop
 * the rule attaching at all. Both failure modes are silent — the rule simply
 * never fires — which is why the shape is asserted byte-for-byte in the suite.
 * It diverges from the in-repo `.mdc` companion generator, which keeps the
 * JSON-array form for authoring-time twins; this emission is the one a client
 * reads.
 *
 * A glob whose own text contains a comma cannot be represented in that form at
 * all, so it is refused rather than emitted as two corrupt patterns. Interior
 * spaces are preserved: only the SEPARATOR must stay space-free.
 *
 * Activation, complete, and matching the in-repo `.mdc` companion generator's
 * transform except where this client's charter layer changes it: `conditional`
 * with globs emits the quirk line plus `alwaysApply: false`; `agent-requested`,
 * or a glob-less `conditional`, emits `alwaysApply: false` alone (the
 * description-driven mode); globs declared without a scope read as
 * `conditional`, tolerated because that emission is unambiguous.
 * `alwaysApply: true` is never emitted — the always-on layer is the charter, so
 * `scope: always` is refused by name.
 *
 * A scope that CONTRADICTS declared globs — `agent-requested` alongside
 * `globs` — is refused for the same reason the companion generator refuses it:
 * the two name different activation modes and neither resolution is
 * recoverable downstream. Honouring the globs auto-attaches a rule its author
 * declared description-driven; dropping them narrows one the author scoped. A
 * mis-attached rule fails silently in this client, so the contradiction is
 * named at build time instead.
 *
 * Throws `VALIDATION_ERROR` for an unknown scope, a malformed or
 * unrepresentable `globs` value, an always-scoped rule, a scope contradicting
 * declared globs, or a body over {@link CURSOR_RULE_LINE_CAP} lines.
 */
export function buildMdcRule(item: CatalogItem, body: string): string {
  const source = `rule "${item.id}"`;
  const scope = readScope(item, source);
  if (scope === "always") {
    throw new EngineError(
      `${source} declares \`scope: always\`, which this client would emit as an ` +
        `always-applied rule. Rules attach on globs; content that must bind every ` +
        `session belongs in the AGENTS.md charter. Give the rule \`scope: conditional\` ` +
        `with \`globs\`, or \`scope: agent-requested\`, or move it into the charter.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const globs = readGlobs(item, source);
  if (scope === "agent-requested" && globs.length > 0) {
    throw new EngineError(
      `${source} declares \`scope: agent-requested\` and \`globs\`, which name two ` +
        `different activation modes: description-driven, and auto-attach on those paths. ` +
        `Declare \`scope: conditional\` to attach on the globs, or drop the \`globs\` line ` +
        `to keep the rule description-driven.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const rendered = body.endsWith("\n") ? body : `${body}\n`;
  const lines = countLines(rendered);
  if (lines > CURSOR_RULE_LINE_CAP) {
    throw new EngineError(
      `${source} renders to ${lines} lines, over this client's ${CURSOR_RULE_LINE_CAP}-line ` +
        `per-rule budget. Split the rule, or move the detail into a skill the rule points at.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const activation =
    globs.length === 0
      ? ["alwaysApply: false"]
      : [`globs: ${globs.join(",")}`, "alwaysApply: false"];

  return `---\ndescription: ${frontmatterScalar(item.description)}\n${activation.join("\n")}\n---\n${rendered}`;
}

/** The declared scope, validated. Absent reads as description-driven. */
function readScope(item: CatalogItem, source: string): string | undefined {
  const value = item.frontmatter["scope"];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !RULE_SCOPES.has(value)) {
    throw new EngineError(
      `${source}: unknown \`scope\` value ${JSON.stringify(value)}. Declare one of ` +
        `${[...RULE_SCOPES].join(", ")}.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return value;
}

/**
 * Declared globs, trimmed and de-duplicated, from either authoring shape: a
 * YAML list, or the one comma-separated string a single-line frontmatter uses.
 * An empty value reads as absent — that is the description-driven rule.
 */
function readGlobs(item: CatalogItem, source: string): string[] {
  const value = item.frontmatter["globs"];
  if (value === undefined || value === null) return [];

  const declared: readonly string[] | null =
    typeof value === "string"
      ? value.split(",")
      : Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string")
        ? value
        : null;
  if (declared === null) {
    throw new EngineError(
      `${source}: \`globs\` must be a list of glob strings or one comma-separated string.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const globs: string[] = [];
  for (const entry of declared) {
    const glob = entry.trim();
    if (glob === "") continue;
    if (glob.includes(",")) {
      throw new EngineError(
        `${source}: glob ${JSON.stringify(glob)} contains a comma, which is this client's ` +
          `glob separator — the value cannot be written without splitting it into two ` +
          `patterns. Rewrite the glob without a comma.`,
        { code: "VALIDATION_ERROR" },
      );
    }
    if (!globs.includes(glob)) globs.push(glob);
  }
  return globs;
}

// ── Agents ───────────────────────────────────────────────────────

/**
 * One `.cursor/agents/<id>.md`: derived frontmatter over the rendered body.
 *
 * The emitted FILENAME is the identity the spawn guard polices — a file at
 * `.cursor/agents/stamity-reviewer.md` is spawned as `stamity-reviewer`, which
 * is the id {@link buildSubagentGuardScript} matches against the roster.
 *
 * PIN OR OMIT, on the model field. Its vocabulary is a concrete model id —
 * optionally parameterised in brackets, `composer-2.5[fast=false]`, options
 * comma-separated inside one group — or the client's own keyword for deferring
 * to the session's model (cursor.com/docs/agent/subagents, accessed
 * 2026-08-17). This client publishes no model-agnostic alias a ladder class
 * could map onto, so the class resolves through the one projection table
 * ({@link resolveModelValue}): an operator pin for the class emits that id
 * verbatim, carrying the `[effort=…]` parameter this client uses as its effort
 * carrier, and NO pin emits no key at all.
 *
 * BOTH AXES, ONE CALL. `efforts` is passed beside `pins` rather than left to
 * default because effort has no standalone key on this client (one effort
 * axis, carried per client where supported) — it exists only as a
 * parameter of the model value, so an operator's per-class level reaches the
 * emitted file through this argument or not at all. Omitting it would leave a
 * pinned class emitting the LADDER's default effort while `stamity config`
 * displays the operator's, which is the engine outranking the operator: the
 * exact inversion the pin-or-omit rule above exists to end, one axis over. The
 * parameter is additive and defaults to the ladder's own answer, so a caller
 * holding no operator settings still gets the class's declared effort.
 *
 * The absent key is the point, not a gap. Writing that defer-to-the-session
 * keyword restates the client's own documented default as though the engine
 * had decided something, and it inverts the pinning mandate (pinned explicit
 * ids on router-active platforms, operator override) with an in-code choice
 * nothing in the design sanctions. Silence says exactly what is true — this
 * engine pinned nothing here — and the client then applies the default that
 * belongs to it.
 *
 * `readonly: true` is the strongest per-agent restriction this client
 * expresses: it blocks edits and state-changing commands, but cannot name
 * individual tools, so network and delegation grants stay unexpressed here and
 * are carried by the pre-tool-use guard. The key is emitted only when the
 * grant earns it; its absence is the client's permissive default, which is
 * also why a MALFORMED grant (every category reserved) and an agent with no
 * resolvable grant at all both fall back to `readonly: true` rather than to
 * omission — deny-by-default is the posture, and a roster gap must not read as
 * a licence. The grant arrives already resolved so this adapter never reads the
 * roster itself and the four clients cannot disagree about one agent; on a pack
 * agent it is the pack's intersected ceiling, never its declaration, so an
 * agent that loses `readonly` here lost it to something the operator approved
 * at install.
 */
export function buildCursorAgent(
  item: CatalogItem,
  grant: ResolvedAgentGrant,
  body: string,
  pins: ModelPinMap = {},
  efforts: EffortMap = {},
): string {
  const lines = [`description: ${frontmatterScalar(item.description)}`];

  const declaredClass = item.frontmatter["model_class"];
  // A class off the ladder, or one with no pin, is left unwritten rather than
  // guessed: an invented model value fails at spawn time, whereas an absent key
  // takes the client's own default and works.
  const model =
    typeof declaredClass === "string"
      ? resolveModelValue(declaredClass, "cursor", pins, efforts)
      : undefined;
  // Through the same scalar renderer as the description above: a pin is
  // operator free text whose shape check does not know YAML, so an unquoted
  // `*evil` would emit an alias node and break the file for the client.
  if (model !== undefined) lines.push(`model: ${frontmatterScalar(model)}`);

  if (toCursorReadonlyFrontmatter(grant.allow) ?? true) {
    lines.push("readonly: true");
  }

  const rendered = body.endsWith("\n") ? body : `${body}\n`;
  return `---\n${lines.join("\n")}\n---\n${rendered}`;
}

// ── Commands ─────────────────────────────────────────────────────

/**
 * One touchpoint command as this client's explicitly invoked skill.
 *
 * Three frontmatter keys, and no fourth. `name` and `description` are the two
 * the format requires; `disable-model-invocation: true` is what makes the file
 * a COMMAND rather than a skill — the body is included when the operator types
 * `/<name>` and never pulled in by the agent on its own judgement
 * (cursor.com/docs/skills, accessed 2026-08-17). A `paths` scope would be the
 * fourth, and it is deliberately absent: a touchpoint is invoked, not attached.
 *
 * The vocabulary is this client's own and is NOT normalised toward the other
 * clients' command frontmatter — per-client residue is what this layer is for,
 * and a key borrowed from a sibling dialect reads as a restriction the runtime
 * here never applies.
 */
export function buildCursorCommand(item: CatalogItem, name: string, body: string): string {
  const front = [
    `name: ${name}`,
    `description: ${frontmatterScalar(item.description)}`,
    "disable-model-invocation: true",
  ];
  const rendered = body.endsWith("\n") ? body : `${body}\n`;
  return `---\n${front.join("\n")}\n---\n${rendered}`;
}

// ── Hooks ────────────────────────────────────────────────────────

/** One `hooks.json` entry: a command line, optionally narrowed and blocking. */
interface CursorHookEntry {
  command: string;
  matcher?: string;
  failClosed?: boolean;
}

/**
 * The `.cursor/hooks.json` document: portable interchange rows renamed into
 * the client's taxonomy, plus the two adapter-owned guards.
 *
 * Two dialect gaps are crossed here. The interchange carries exec-form argv
 * (never a shell line, so nothing at ingress can smuggle a shell operator);
 * this client's config takes one command STRING, so argv is joined with POSIX
 * quoting — a token needing quotes gets them, so a path with a space survives
 * as one argument instead of becoming two. And `timeoutMs` has no field here,
 * so it is dropped: a client that cannot honour a request proceeds without it,
 * and inventing a key would read as a guarantee that is not there.
 *
 * Order is fixed and total: event keys in canonical order, then the guard
 * events, and within an event the rows in the order the core planned them —
 * core scripts first, user hooks after, declaration order preserved. Events
 * with no rows are absent rather than present-and-empty.
 *
 * Blocking is decided per row, not per event ({@link rowOptsIntoBlocking}): the
 * gate event admits a row, and the row still has to be able to mean it. The one
 * row that cannot on this client is the core pre-tool-use guard — see
 * {@link CORE_GUARD_REACHES_VERDICT}.
 */
export function buildHooksJson(rows: readonly HookInterchange[]): string {
  const events: Record<string, CursorHookEntry[]> = {};

  for (const event of CANONICAL_HOOK_EVENTS) {
    const matching = rows.filter((row) => row.event === event);
    if (matching.length === 0) continue;
    events[EVENT_RENAME[event]] = matching.map((row) => {
      // Keys are assigned rather than spread-merged: assignment order is the
      // serialized key order, so `command, matcher?, failClosed?` stays fixed
      // and the emitted bytes are stable. Absent optionals are never written,
      // so an omitted key is absent rather than present-and-undefined.
      const entry: CursorHookEntry = { command: shellCommand(row.command) };
      if (row.matcher !== undefined) entry.matcher = row.matcher;
      if (rowOptsIntoBlocking(event, row)) entry.failClosed = true;
      return entry;
    });
  }

  // Both guards opt into blocking: an allowlist that logs and proceeds is not
  // an allowlist. Each fails open internally on an ambiguity it cannot judge —
  // announced on stderr, never silently — so the residual fail-closed surface is
  // a crashed or timed-out script, not a guess.
  events[CURSOR_GUARD_EVENTS.subagentSpawn] = [
    { command: shellCommand(["node", SUBAGENT_GUARD_PATH]), failClosed: true },
  ];
  events[CURSOR_GUARD_EVENTS.mcpExecution] = [
    { command: shellCommand(["node", MCP_GUARD_PATH]), failClosed: true },
  ];

  return `${JSON.stringify({ version: 1, hooks: events }, null, 2)}\n`;
}

/** Shell-safe tokens: anything outside this set forces quoting. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** argv rendered as one POSIX command line, each token quoted only if it needs it. */
function shellCommand(argv: readonly string[]): string {
  return argv
    .map((token) =>
      SHELL_SAFE.test(token) ? token : `'${token.replaceAll("'", `'\\''`)}'`,
    )
    .join(" ");
}

// ── Guard scripts ────────────────────────────────────────────────

/** Shared head: shebang, summary, and the trust posture the bytes must keep. */
function guardHeader(summary: readonly string[]): string {
  return [
    "#!/usr/bin/env node",
    ...summary.map((line) => (line === "" ? "//" : `// ${line}`)),
    "//",
    "// Generated file — regenerate it rather than editing; local edits are overwritten.",
    "// Trust posture: exec form, repo-committed, no dynamic evaluation, no network",
    "// reach, and output determined by repo state alone.",
  ].join("\n");
}

/** One readable sentence out of a thrown value, whatever the runtime threw. */
const REASON_HELPER = `function reasonOf(err) {
  if (err === null || err === undefined) return "unknown error";
  const message = typeof err === "object" && typeof err.message === "string" ? err.message : String(err);
  const code = typeof err === "object" && typeof err.code === "string" ? err.code + ": " : "";
  return code + message;
}`;

/**
 * Reads the whole stdin payload, and says WHY when it could not.
 *
 * The empty payload is still the answer on every failure — a guard that
 * crashed on a payload shape it did not expect would take the session with it,
 * and both guards are wired `failClosed: true`. What changed is that the
 * failure is no longer swallowed: `problem` carries the reason, and each guard
 * decides whether that is a refusal (the MCP guard, which can name no server)
 * or a pass-through worth one stderr line (the spawn guard, which can name no
 * agent to judge). A silent `{}` made the roster allowlist a no-op with zero
 * signal, which is the one outcome neither guard's header claims.
 */
const READ_PAYLOAD = `function readPayload() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    return { payload: {}, problem: "stdin was unreadable (" + reasonOf(err) + ")" };
  }
  if (raw.trim() === "") return { payload: {}, problem: "stdin carried no payload" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { payload: {}, problem: "payload was not a JSON object" };
    }
    return { payload: parsed, problem: null };
  } catch (err) {
    return { payload: {}, problem: "payload was not valid JSON (" + reasonOf(err) + ")" };
  }
}`;

/**
 * The stderr channel, alone: one JSON line naming the hook and what it saw.
 *
 * Every diagnostic these guards emit goes through here, so stdout stays the
 * decision channel and a log pipeline reads one line shape whether the outcome
 * was a refusal or a pass-through the operator should still know about.
 */
const NOTICE_HELPER = `function notice(hook, event) {
  process.stderr.write(JSON.stringify({ hook, ...event }) + "\\n");
}`;

/**
 * How a decision reaches this client: the verdict is a JSON document written to
 * stdout, `permission` is one of `allow | deny | ask`, and `user_message` is
 * the "message shown in client when denied" (cursor.com/docs/agent/hooks,
 * accessed 2026-08-22). The refusal event goes to stderr through
 * {@link NOTICE_HELPER}, where the operator and any log pipeline can see it —
 * stdout is the decision channel and must carry the verdict alone.
 *
 * One reading here is the build's, not the vendor's: a hook that writes NOTHING
 * on stdout has made no decision and the action proceeds. That page documents
 * the three permission values and the fail-closed clause ("hook failures
 * (crash, timeout, invalid JSON) block the action") but never the empty-stdout
 * case, so the pass-through path rests on an undocumented reading. Revisit
 * trigger: that page gaining an explicit empty-output rule, or a `failClosed`
 * entry observed blocking on a hook that exited 0 with no stdout — either would
 * mean these guards must write an explicit `permission: "allow"` instead.
 */
const DENY_HELPER = `function deny(hook, event, userMessage) {
  notice(hook, event);
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: userMessage }));
}`;

/**
 * The spawn guard, bound to the one event that names the agent about to run.
 *
 * Scope is the generated-content prefix: the client's own sub-agents and
 * anything else pass through untouched, because a guard that denied them would
 * brick the session it exists to protect. Inside that prefix the roster is the
 * whole allowlist — an id this setup never shipped is denied, which is the
 * spawn-time half of the deny-by-default posture the pre-tool-use guard
 * carries for tool calls.
 *
 * The allowlist is baked in, de-duplicated and sorted, so the script needs no
 * companion document at run time and its bytes change only when the set of
 * spawnable ids does — the shipped roster, plus any pack agent this run
 * actually emitted a definition for.
 *
 * A payload this guard cannot read is the one case it can neither allow on
 * purpose nor refuse: it names no agent, so there is nothing to match against
 * the roster. It stays a pass-through — denying every spawn on a payload-shape
 * change would brick the session — but it is ANNOUNCED, one stderr line naming
 * the reason. Silent was the defect: `failClosed: true` covers a crash, and a
 * guard that returned an empty payload never crashed, so the allowlist became a
 * no-op with no signal anywhere while the header claimed the opposite.
 */
export function buildSubagentGuardScript(roster: readonly string[]): string {
  const ids = [...new Set(roster)].toSorted();
  return `${guardHeader([
    "stamity — sub-agent spawn guard.",
    "",
    "Denies a spawn whose agent id carries the generated-content prefix but is",
    "not on the shipped roster. Ids outside that prefix are not this setup's to",
    "police and pass through. Wired to the spawn event with failClosed: true, so",
    "a crash or a timeout denies rather than waving the spawn through.",
    "",
    "A payload that cannot be read names no agent, so it is not a crash and not",
    "a refusal: the spawn proceeds and the reason is written to stderr, because",
    "an allowlist that quietly stops matching is worse than one that says so.",
  ])}

import { readFileSync } from "node:fs";

const NAMESPACE = ${JSON.stringify(CONTENT_PREFIX)};
const ROSTER = new Set(${JSON.stringify(ids, null, 2)});

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

const { payload, problem } = readPayload();
const agentId = typeof payload.subagent_type === "string" ? payload.subagent_type : "";

// Nothing to judge: say so on stderr rather than passing the spawn through in
// silence. The verdict channel stays empty, so the spawn still proceeds.
if (agentId === "") {
  notice("stamity-cursor-subagent-guard", {
    reasonCode: "SPAWN_PAYLOAD_UNUSABLE",
    detail: problem === null ? "payload carried no subagent_type" : problem,
    at: new Date().toISOString(),
  });
}

// Out of scope, or rostered: no verdict written, so the spawn proceeds.
if (agentId.startsWith(NAMESPACE) && !ROSTER.has(agentId)) {
  deny(
    "stamity-cursor-subagent-guard",
    { reasonCode: "AGENT_NOT_ON_ROSTER", agentId, at: new Date().toISOString() },
    'Blocked the spawn of "' +
      agentId +
      '": no agent with that id ships in this setup, so it holds no tool policy. ' +
      "Re-run \`stamity sync\` if the roster changed, or spawn one of: " +
      [...ROSTER].join(", ") +
      ".",
  );
}
`;
}

/**
 * The MCP guard, bound to the one event that names the server behind a pending
 * call.
 *
 * The allowlist is the resolved `.cursor/mcp.json` set — this project's file
 * beside the guard, plus the operator's own user-level file, so a personally
 * configured server keeps working. A call is matched on any identity the
 * payload can supply: the server name inside an `mcp__server__tool` name, a
 * remote server's URL, or a stdio server's full command line.
 *
 * Posture is deny-by-default, which is the difference between an allowlist and
 * a log: with no configured server there is nothing to match against, so every
 * MCP call is denied — cheaper than an allowlist that silently allows
 * everything the day its manifest goes missing.
 *
 * ABSENT AND BROKEN ARE DIFFERENT REFUSALS. A missing manifest is the ordinary
 * state of a repo that selected no servers. A manifest that exists and does not
 * parse — or a user-level file the process cannot read — is an operator-fixable
 * fault, and folding it into the same `continue` produced the worst message a
 * fail-closed gate can write: every MCP call refused, the stated cause ("this
 * setup configured no MCP servers") false, the stated next step ("add one")
 * useless, and the real cause — a JSON syntax error at a named path — printed
 * nowhere. The two now carry different reason codes, and a manifest that fails
 * while ANOTHER one still supplies servers is announced on stderr instead of
 * disappearing behind a call that happened to be allowed.
 *
 * NEXT STEPS ARE DURABLE ONES. The refusals name what an operator can change
 * and keep: the selection (`stamity config mcp add <id>`) followed by
 * `stamity sync`. Deleting the entry from `.cursor/hooks.json` is not on that
 * list — the next sync rewrites the file and `stamity check` reports the edit as
 * drift until it does, which is the advice the generated header four lines
 * above already gives.
 */
export function buildMcpGuardScript(): string {
  return `${guardHeader([
    "stamity — MCP server allowlist guard.",
    "",
    "Denies a pending MCP call whose server is absent from the resolved",
    ".cursor/mcp.json set (this project's file plus the operator's user-level",
    "one). Deny-by-default: no configured server means nothing to match, so",
    "every mcp__ call is refused and the message says why.",
    "",
    "A manifest that exists but does not parse is reported as its own refusal,",
    "naming the path and the parser message — not folded into the absent case.",
    "To stop the guard, change the selection (stamity config mcp add <id>, then",
    "stamity sync) or deselect this client; editing .cursor/hooks.json does not",
    "stick.",
  ])}

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// This script sits at ${MCP_GUARD_PATH}; the project manifest is its sibling
// one level up, and the operator's own file lives under the home directory.
const MANIFESTS = [join(HERE, "..", "mcp.json"), join(homedir(), ".cursor", "mcp.json")];
const TOOL_PREFIX = ${JSON.stringify(MCP_TOOL_PREFIX)};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

function normalize(value) {
  return String(value).replace(/\\s+/g, " ").trim();
}

// Every spelling of a configured server: its name, a remote URL, and the full
// stdio command line — the payload supplies whichever the call was made with.
// \`faults\` collects manifests that exist and could not be used; a manifest that
// is simply absent is not a fault, it is a repo that selected no servers.
function allowedIdentities() {
  const allowed = new Set();
  const faults = [];
  for (const file of MANIFESTS) {
    let raw;
    try {
      raw = readFileSync(file, "utf8");
    } catch (err) {
      if (err === null || typeof err !== "object" || err.code !== "ENOENT") {
        faults.push({ path: file, detail: reasonOf(err) });
      }
      continue;
    }
    let doc;
    try {
      doc = JSON.parse(raw);
    } catch (err) {
      faults.push({ path: file, detail: reasonOf(err) });
      continue;
    }
    const servers = doc !== null && typeof doc === "object" ? doc.mcpServers : null;
    if (servers === null || typeof servers !== "object") {
      faults.push({ path: file, detail: "no mcpServers object" });
      continue;
    }
    for (const [name, server] of Object.entries(servers)) {
      allowed.add(name);
      if (server === null || typeof server !== "object") continue;
      if (typeof server.url === "string" && server.url !== "") {
        allowed.add(normalize(server.url));
      }
      if (typeof server.command === "string" && server.command !== "") {
        const args = Array.isArray(server.args) ? server.args : [];
        allowed.add(normalize([server.command, ...args].join(" ")));
      }
    }
  }
  return { allowed, faults };
}

function faultLine(faults) {
  return faults.map((fault) => fault.path + " (" + fault.detail + ")").join("; ");
}

function identityOf(payload) {
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : "";
  if (toolName.startsWith(TOOL_PREFIX)) {
    const server = toolName.slice(TOOL_PREFIX.length).split("__")[0];
    if (server) return server;
  }
  if (typeof payload.url === "string" && payload.url !== "") return normalize(payload.url);
  if (typeof payload.command === "string" && payload.command !== "") {
    return normalize(payload.command);
  }
  return "";
}

const HOOK = "stamity-cursor-mcp-guard";
const { payload, problem } = readPayload();
const { allowed, faults } = allowedIdentities();
const identity = identityOf(payload);
const event = { server: identity, at: new Date().toISOString() };

if (allowed.size === 0 && faults.length > 0) {
  // The manifests exist and could not be used. Refusing is still right — an
  // unreadable allowlist allows nothing — but the cause and the fix are the
  // file, not the selection, so they are named instead of the absent-case text.
  deny(
    HOOK,
    { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event },
    "Blocked every MCP call: no MCP manifest could be read, so there is no " +
      "allowlist to match against. Fix " +
      faultLine(faults) +
      ", then re-run \`stamity sync\`.",
  );
} else if (allowed.size === 0) {
  deny(
    HOOK,
    { reasonCode: "NO_MCP_SERVERS_CONFIGURED", ...event },
    "Blocked every MCP call: this setup configured no MCP servers, so there is " +
      "no allowlist to match against. Add one with \`stamity config mcp add <id>\` " +
      "and re-run \`stamity sync\`.",
  );
} else if (identity === "") {
  deny(
    HOOK,
    {
      reasonCode: "MCP_SERVER_UNIDENTIFIED",
      detail: problem === null ? "payload named no server" : problem,
      ...event,
    },
    "Blocked an MCP call that names no server this guard can recognise, so it " +
      "cannot be matched against .cursor/mcp.json. Report the client payload shape.",
  );
} else if (!allowed.has(identity)) {
  deny(
    HOOK,
    { reasonCode: "MCP_SERVER_NOT_CONFIGURED", ...event },
    'Blocked an MCP call to "' +
      identity +
      '": it is absent from the resolved .cursor/mcp.json set. Add it with ' +
      "\`stamity config mcp add <id>\` and re-run \`stamity sync\`.",
  );
} else if (faults.length > 0) {
  // Allowed on the manifests that DID load. The broken one still cost the
  // operator whatever it configured, so it is announced rather than left to be
  // discovered as a server that silently stopped being reachable.
  notice(HOOK, { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event });
}
`;
}

// ── Shared rendering ─────────────────────────────────────────────

/**
 * Any operator- or corpus-supplied value as a single-line frontmatter scalar
 * that cannot escape its own line. Two callers: the artifact description, and
 * the model pin — both free text validated for shape rather than for YAML.
 *
 * A line break is the injection vector: a description carrying one would append
 * whatever follows as another frontmatter key, and an activation key smuggled
 * that way silently changes when the artifact loads. Runs of breaks collapse to
 * a space; a value that would then corrupt the plain-scalar parse — an interior
 * quote or backslash, a `: ` mapping indicator, a ` #` comment introducer, or a
 * leading YAML indicator — is emitted JSON-quoted, which is a valid YAML
 * double-quoted scalar. Well-formed one-line descriptions pass through
 * unchanged.
 */
function frontmatterScalar(value: string): string {
  const singleLine = value.replace(/\s*[\r\n]+\s*/g, " ").trim();
  if (singleLine === "") return singleLine;
  const needsQuoting =
    /["\\]/.test(singleLine) ||
    /:(\s|$)/.test(singleLine) ||
    /\s#/.test(singleLine) ||
    /^(?:[,[\]{}#&*!|>'%@`]|[-?:](?:\s|$))/.test(singleLine);
  return needsQuoting ? JSON.stringify(singleLine) : singleLine;
}

/**
 * Physical lines, `wc -l` style: a trailing newline terminates the last line
 * rather than opening an empty one, and a final line without a newline still
 * counts. Empty content → 0.
 */
function countLines(raw: string): number {
  if (raw === "") return 0;
  const lines = raw.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}
