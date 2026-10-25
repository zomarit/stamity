/**
 * Cursor residue: conditional MDC rules, agents, explicit command skills and hooks.
 * Portable hook argv stays exec-form behind the native command-string launcher.
 * timeoutMs converts to native seconds; failClosed gates authored tool hooks and
 * adapter guards, while the identity-free core role guard remains telemetry.
 * Current contracts: https://cursor.com/docs/hooks (2026-09-17) and /docs/skills (2026-09-10).
 */

import { buildPortableHookRunner, portableHookCommand, PORTABLE_RUNNER_FILE, ROOT_VARIABLE_PATH } from "../hooks/portableRunner.ts";
import {
  buildContentIndex,
  typeIdKey,
  type CatalogItem,
} from "../content/catalog.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { verificationGatesFromManifest } from "../emit/agentsMd.ts";
import { HOOKS_GENERATED_DIR } from "../emit/hooksInfra.ts";
import {
  SKILLS_PROJECTION_DIR,
  frontmatterScalar,
  projectTouchpointSkills,
} from "../emit/skillsProjection.ts";
import type {
  AdapterDialectFacts,
  CoreEmissionPlan,
  EmissionContext,
  ResidueEmission,
  ResiduePlanner,
} from "../emit/planner.ts";
import {
  cliCallContextOf,
  detectionContextFromManifest,
  substituteCliTokens,
  substituteRepoTokens,
  substituteVerificationGateTokens,
  type CliCallContext,
} from "../emit/substitution.ts";
import { CANONICAL_HOOK_EVENTS, type CanonicalHookEvent, type HookInterchange } from "../hooks/model.ts";
import {
  buildContextOnceScript,
  buildCursorContinueScript,
  CONTEXT_ONCE_FILE,
  CURSOR_CONTINUE_FILE,
  IDENTITY_FREE_PRE_TOOL_USE_PAYLOADS,
  PERSON_ONLY_GUARD_FILE,
} from "../hooks/scripts.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import { RUNTIME_AGENT_IDS } from "../roster/agentPolicies.ts";
import { modelMapPath } from "../roster/modelDefaults.ts";
import {
  CLIENT_MODEL_PROJECTION,
  EFFORT_PLACEHOLDER,
  MODEL_LADDER,
  isModelClass,
  nearestExpressibleEffort,
  pinsFor,
  resolveModelValue,
  type EffortMap,
  type ModelPickSource,
  type ModelPinMap,
} from "../roster/modelLadder.ts";
import { cliCallHint, pinnedCliCall } from "../shared/cliCall.ts";
import {
  substituteCanonicalPlatformMarker,
  toCursorReadonlyFrontmatter,
} from "../tools/translator.ts";
import type { AdapterOutput } from "../types/content.ts";
import type { EffortLevel, ModelClass } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX, GENERATED_SCRIPT_LINT_DIRECTIVE } from "../types/markers.ts";

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
 * A skill that declines model invocation is the vendor's own answer to "where
 * does a project slash command live now", and it keeps the charter's
 * `/st-<id>` touchpoint spelling literally true on this client.
 *
 * The directory is the shared {@link SKILLS_PROJECTION_DIR}, not
 * `.cursor/skills/`. This client loads project skills from `.agents/skills/`
 * as well as its own tree (cursor.com/docs/skills, accessed 2026-08-22), and
 * Codex reads only the shared one, so the nine bodies ship there once
 * ({@link projectTouchpointSkills}) and the two clients co-own each file. A
 * repository set up by an earlier version keeps `.cursor/skills/st-<id>/`
 * rows in its ledger; the next sync plans none, so the sweep reclaims them.
 *
 * Discovery still overlaps elsewhere. This client also reads, "for
 * compatibility", `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`
 * and `~/.codex/skills/` (same page). So in a repo that selects `claude`
 * alongside this client, the content skills are discovered twice under one
 * name — once from the core projection, once from the byte-identical native
 * copy the claude adapter re-targets into `.claude/skills/` — and that page
 * documents no tie-break. The touchpoints are not among them: the native copy
 * leaves command rows out, since Claude keeps `.claude/commands/`. The cost is
 * context duplication on the always-available slice plus an undefined `/name`
 * resolution, not a wrong emission: both trees are this engine's,
 * byte-identical by construction, so whichever wins is the same bytes.
 */
export const CURSOR_COMMANDS_DIR: string | null = SKILLS_PROJECTION_DIR;

/** Repo-relative hook configuration document. */
export const CURSOR_HOOKS_CONFIG_PATH = ".cursor/hooks.json";

/** Repo-relative home of the two adapter-owned guard scripts. */
export const CURSOR_GUARD_DIR = ".cursor/hooks";

/**
 * The spawn guard: denies a sub-agent id outside the shipped roster. Both
 * guards carry the `stamity-` prefix because `.cursor/hooks/` is a folder
 * owners keep their own hook scripts in (REQ-FLOW-038).
 */
export const SUBAGENT_GUARD_PATH = `${CURSOR_GUARD_DIR}/stamity-subagent-guard.mjs`;

/** The MCP guard: denies a server outside the resolved `.cursor/mcp.json` set. */
export const MCP_GUARD_PATH = `${CURSOR_GUARD_DIR}/stamity-mcp-guard.mjs`;

/**
 * The person-only shell guard (REQ-FLOW-102, REQ-FLOW-120): a CORE script the
 * hooks plan places for every selected client (`../emit/hooksInfra.ts`), which
 * this adapter wires to `beforeShellExecution` alone. The plan gives it no
 * portable row here, so Cursor runs one copy, never a second through
 * `preToolUse`.
 */
export const PERSON_ONLY_GUARD_PATH = `${HOOKS_GENERATED_DIR}/cursor/${PERSON_ONLY_GUARD_FILE}`;

/**
 * The guards' names up to 1.11.0, in the order of the two above. Nothing
 * writes them any more; they are still read, so the first `sync` after an
 * upgrade can move the guards. `.cursor/hooks.json`'s spec recognises an entry
 * running one as the engine's and replaces it with the current one, the
 * reclaim sweep removes each old file as a `path-renamed` candidate only when
 * its bytes still hash to what the ledger recorded (an edited one is kept and
 * reported), and no verb deletes one while a hooks document it keeps still
 * runs it. The owned-path bound (`../manifest/ownedPaths.ts`) keeps both names
 * so their ledger rows validate.
 */
export const LEGACY_CURSOR_GUARD_PATHS = [`${CURSOR_GUARD_DIR}/subagent-guard.mjs`, `${CURSOR_GUARD_DIR}/mcp-guard.mjs`] as const;

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
 * names no event on it at all (cursor.com/docs/hooks, accessed
 * 2026-09-17).
 *
 * Emitting the computed name was silent in both directions: the config still
 * parsed, the key still sat in `.cursor/hooks.json`, and the one canonical
 * event it stood for never fired on this client while the portable model went
 * on promising authors six events every client can honour. Nothing on either
 * side reports a `hooks.json` key the client does not recognise, so the suite
 * pins all six strings against the documented event list instead.
 *
 * All six were re-read against that page on 2026-09-17 (`sessionStart`,
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
 * Client-specific events with no portable counterpart, used by the three guards.
 * They are extensions by definition — no other target client exposes a spawn
 * or an MCP-execution decision point — so they live outside
 * {@link EVENT_RENAME} instead of pretending to be portable.
 *
 * `subagentStart` carries `subagent_type`, the only Cursor payload field that
 * names the agent about to run; `beforeMCPExecution` carries the server
 * identity of a pending MCP call as `tool_name` plus EITHER `url` (a remote
 * server) OR `command` (a stdio one) — the three spellings
 * {@link buildMcpGuardScript} matches on (cursor.com/docs/hooks, both
 * input schemas accessed 2026-09-17). `beforeShellExecution` carries the
 * pending shell call's `command` at the top level, which the person-only guard
 * reads ({@link PERSON_ONLY_GUARD_PATH}; `../hooks/scripts.ts`).
 */
export const CURSOR_GUARD_EVENTS = {
  subagentSpawn: "subagentStart",
  mcpExecution: "beforeMCPExecution",
  shellExecution: "beforeShellExecution",
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

/**
 * True for an interchange row running a script the core generated for this
 * client — under either root the row can be addressed through.
 *
 * `hookScriptsRoot` is the client's own view of that directory when something
 * relocated the scripts after the plan (`../emit/planner.ts`,
 * `EmissionContext.facts`): a plugin container addresses them through its root
 * variable, and testing the repository prefix ALONE made every core row read as
 * AUTHORED there. That is not a cosmetic miss — {@link rowOptsIntoBlocking}
 * reads this answer, so the core pre-tool-use guard would have silently opted
 * back into `failClosed` on the one client whose body cannot reach a verdict.
 */
function isCoreScriptRow(row: HookInterchange, hookScriptsRoot?: string): boolean {
  const prefixes =
    hookScriptsRoot === undefined
      ? [CORE_SCRIPT_PREFIX]
      : [CORE_SCRIPT_PREFIX, `${hookScriptsRoot}/`];
  return row.command.some((token) => prefixes.some((prefix) => token.startsWith(prefix)));
}

/**
 * Whether this row's exit status is authoritative enough to opt into blocking:
 * a gate event, and a body that can reach a refusal on this client.
 */
function rowOptsIntoBlocking(
  event: CanonicalHookEvent,
  row: HookInterchange,
  hookScriptsRoot?: string,
): boolean {
  if (!BLOCKING_EVENTS.has(event)) return false;
  return CORE_GUARD_REACHES_VERDICT || !isCoreScriptRow(row, hookScriptsRoot);
}

// ── Declared dialect facts ───────────────────────────────────────

/** Ledger artifact ids for this adapter's infra emissions. */
const ARTIFACT_IDS = {
  hooksConfig: "cursor-hooks-config",
  subagentGuard: "cursor-subagent-guard",
  mcpGuard: "cursor-mcp-guard",
  modelMap: "cursor-model-map",
  modelPins: "cursor-model-pins",
  continueRun: "cursor-continue",
  contextOnce: "cursor-context-once",
  mcp: "mcp-config",
} as const;

/**
 * The model-fill hook (REQ-LADDER-007): a `preToolUse` script on Cursor's
 * `Task` tool that writes the class's model into a Stamity sub-agent call that
 * names none ({@link buildModelPinsHookScript}). It sits beside the portable
 * runner, in the folder whose every script `.cursor/hooks.json`'s recogniser
 * counts as the engine's (`../manifest/hookDocuments.ts`).
 */
export const MODEL_PINS_HOOK_PATH = `${HOOKS_GENERATED_DIR}/cursor/stamity-model-pins.mjs`;

/**
 * The continue hook (REQ-FLOW-109): a `stop` script that keeps an unattended run
 * going on a Cursor agent machine while its record leaves units
 * ({@link buildCursorContinueScript}). It sits beside the model-fill hook, in
 * the folder `.cursor/hooks.json`'s recogniser counts as the engine's.
 */
export const CURSOR_CONTINUE_HOOK_PATH = `${HOOKS_GENERATED_DIR}/cursor/${CURSOR_CONTINUE_FILE}`;

/**
 * The continue hook's `loop_limit`: the most follow-ups Cursor runs from it in
 * one conversation (cursor.com/docs/hooks). Fixed and emitted, so a planted
 * record cannot keep an agent looping past it.
 */
export const CURSOR_CONTINUE_LOOP_LIMIT = 50;

/**
 * The context-once hook (REQ-FLOW-115): a `postToolUse` script that prints the
 * session index once per conversation on a Cursor agent machine, where no
 * `sessionStart` runs ({@link buildContextOnceScript}). It sits beside the
 * continue hook, in the folder `.cursor/hooks.json`'s recogniser counts as the engine's.
 */
export const CURSOR_CONTEXT_ONCE_HOOK_PATH = `${HOOKS_GENERATED_DIR}/cursor/${CONTEXT_ONCE_FILE}`;

/** The tool Cursor spawns a sub-agent through, and the model-fill hook's matcher (cursor.com/docs/hooks, read 2026-10-14). */
const SUBAGENT_TOOL = "Task";

/**
 * This client's documented effort scale, rendered from the projection row so
 * the capability page and the resolver cannot disagree about which levels it
 * accepts. The citation is inline because the scale sits on a page read for
 * this claim alone, not on the pages the row group's own sources cover.
 */
const EFFORT_SCALE_CAP =
  `${CLIENT_MODEL_PROJECTION.cursor.effortScale.join(", ")}: ` +
  `${CLIENT_MODEL_PROJECTION.cursor.effortScaleNote ?? ""} ` +
  "(cursor.com/docs/sdk/typescript, accessed 2026-09-17). The level rides inside the model " +
  "value as `[effort=<level>]` and this client parses the group rather than ruling on the " +
  "value, so nothing is narrowed here: a level the chosen model does not offer is the " +
  "model's to reject. No group follows an id that already names its effort variant (one " +
  "on the account's list, or one ending on an effort word), and no key is emitted at all " +
  "until a model id is pinned";

/** What this client can and cannot do, as the generated capability matrix reads it. */
export const cursorDialectFacts: AdapterDialectFacts = {
  tool: "cursor",
  ruleShape:
    "`.cursor/rules/<id>.mdc` — `description` plus `globs` as an unquoted comma-separated list, the vendor's separator (its own example puts a space after the comma; the no-spaces form is this engine's choice — cursor.com/docs/context/rules, accessed 2026-09-30); `alwaysApply: false` on every emitted rule",
  hooksConfigPath: CURSOR_HOOKS_CONFIG_PATH,
  readsAgentsSkillsDir: true,
  agentsFormat:
    "`.cursor/agents/<id>.md` — `description`, `model` (the operator's pin for the role's class, as typed; a pin that is not a listed variant carries this client's `[effort=…]` parameter. Only a pin is written. Cursor offers a sub-agent a narrower list of models than `agent models` prints, and refuses a `Task` call that names a model outside it: in a live run on 2026-10-15 it refused the class model picked from the account's saved list, so no model is picked from that list. In one live run the same day that sub-agent list changed with the parent agent's model; one named parent model was tried, so that the list follows the parent's model beyond that run is unverified (`.stamity/runs/2026-10-14_cli-native/record.md` on the `records` branch, QA row 3, its first two prover rounds). An unpinned role's key is omitted, so its sub-agent runs on the parent agent's model: Cursor documents the parent agent's model as a sub-agent's default unless its `model` names an id (cursor.com/docs/subagents, read 2026-10-15), and its refusal text says the same of an omitted model. No live run has dispatched this setup's unpinned sub-agent, so that it runs is unverified (the same record, QA row 3's re-walk on the fix). A pinned model is a default, not a hard limit; Stamity carries it on the dispatch and by a hook — the touchpoints pass the class model from `.stamity/generated/models/cursor.json` (the same model id, without an engine-added `[effort=…]` group) on each sub-agent call, and a `preToolUse` hook on `Task` fills it into a Stamity call that names none (`updated_input`; cursor.com/docs/agent/subagents and cursor.com/docs/hooks, accessed 2026-10-14)), `readonly`",
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
        "Exit 2 denies; failClosed: true also denies hook errors and timeouts, and this client counts no output as such a failure (cursor.com/docs/hooks, accessed 2026-09-17), so every allow is written explicitly. Emitted on " +
        (CORE_GUARD_REACHES_VERDICT
          ? "the pre-tool-use gate, both guards and the person-only shell guard on beforeShellExecution"
          : "both guards, the person-only shell guard on beforeShellExecution and any authored pre-tool-use row, but NOT on the core pre-tool-use guard: this client's tool-call payload names no calling agent, so that guard is emitted as telemetry and has no verdict to block on"),
    },
    {
      name: "hook timeout",
      value:
        "timeoutMs converts to native timeout seconds, rounded up; the portable runner also bounds the child to the requested milliseconds",
    },
    {
      name: "command surface",
      value:
        CURSOR_COMMANDS_DIR === null
          ? "none — no project surface for an explicitly invoked body is documented, so the touchpoint command bodies are not emitted on this client"
          : `\`${CURSOR_COMMANDS_DIR}/<id>/SKILL.md\` with \`disable-model-invocation: true\`, invoked as \`/<id>\` — this client folded slash commands into skills, so no \`.cursor/commands/\` directory appears in current docs and the touchpoint bodies ship as explicitly invoked skills, in the shared tree Codex reads too, one file per touchpoint`,
    },
    {
      name: "user hook enforcement",
      value:
        "explicit exit-2 denial applies on supported events; authored pre-tool-use rows also opt into failClosed for hook errors and timeouts, and no output counts as one of those failures (cursor.com/docs/hooks, accessed 2026-09-17), so a row that decides nothing is emitted as an explicit allow. Session-start and session-end responses cannot block",
    },
    {
      name: "MCP tool surface",
      value:
        "servers expose tools through mcp.json; the current contract documents no fixed per-session tool-count cap",
    },
    {
      name: "workdir guard",
      value:
        "not emitted — mitigated a pre-3.0 path-escape class; revisit if that class recurs on a supported release",
    },
    { name: "effort-scale", value: EFFORT_SCALE_CAP },
  ],
  // Revalidated against every cited page; unsupported historical caps are removed.
  citations: [
    { url: "https://cursor.com/docs/context/rules", accessDate: "2026-09-10" },
    { url: "https://cursor.com/docs/agent/subagents", accessDate: "2026-09-10" },
    { url: "https://cursor.com/docs/hooks", accessDate: "2026-09-17" },
    { url: "https://cursor.com/docs/skills", accessDate: "2026-09-10" },
    { url: "https://cursor.com/docs/mcp", accessDate: "2026-09-10" },
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
 * detection facts, verification-gate commands, the pinned CLI call, then the platform ask-user
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
    const cli = cliCallContextOf(ctx);
    const render = (raw: string): string =>
      substituteCanonicalPlatformMarker(
        substituteCliTokens(
          substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
          cli,
        ),
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

    const rows: AdapterOutput[] = [
      { path: `.stamity/generated/hooks/cursor/${PORTABLE_RUNNER_FILE}`, content: buildPortableHookRunner("cursor"), owner: { adapter: "cursor", artifactId: "cursor-portable-hook", artifactType: "infra" } },];

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
    const pins = pinsFor(ctx.manifest.models, "cursor");
    const efforts = ctx.manifest.models?.effort ?? {};
    // The account's own list, as `init` and `sync` kept it in the git-ignored
    // cache and laid it in memory (REQ-LADDER-009). The resolver
    // picks nothing from it on this client (ledger row qa/1): it only tells a
    // pin that is a listed effort variant, which takes no `[effort=…]` group,
    // from one that is not. Emission reads the saved copy and never starts the
    // client (REQ-LADDER-006).
    const listed = ctx.manifest.models?.listed?.cursor?.ids;
    const pick: ModelPickSource = listed === undefined ? {} : { listed };
    const spawnable: string[] = [...RUNTIME_AGENT_IDS];
    // Each emitted agent's runtime id by its declared class, for the model map.
    const roles: Partial<Record<string, ModelClass>> = {};

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
      const declaredClass = agent.frontmatter["model_class"];
      if (isModelClass(declaredClass)) roles[runtimeId] = declaredClass;
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
          pick,
        ),
        owner: { adapter: "cursor", artifactId: agent.id, artifactType: "agent" },
      });
    }

    // The touchpoints are the shared rows Codex emits too: rendered tool-neutral
    // by the core helper, so the composer finds the same bytes from both
    // adapters and writes each file once, owned by both. Cursor reads
    // `disable-model-invocation`, never Codex's companion, so it plans none
    // (REQ-FLOW-033).
    if (CURSOR_COMMANDS_DIR !== null) {
      for (const row of projectTouchpointSkills(admitted("command"), ctx, { policy: false })) {
        rows.push({
          path: row.path,
          content: row.content,
          owner: { adapter: "cursor", artifactId: row.artifactId, artifactType: "command" },
        });
      }
    }

    // The class-to-model map the touchpoints read when they pass `model` on a
    // sub-agent call, and the hook that fills it into a call that names none.
    const modelMap = buildCursorModelMap(roles, pins, efforts, pick);
    rows.push(
      {
        path: modelMapPath("cursor"),
        content: `${JSON.stringify(modelMap, null, 2)}\n`,
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.modelMap, artifactType: "infra" },
      },
      {
        path: MODEL_PINS_HOOK_PATH,
        content: buildModelPinsHookScript(modelMap),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.modelPins, artifactType: "infra" },
      },
      {
        path: CURSOR_CONTINUE_HOOK_PATH,
        // The layout decided as the Claude adapter's ask gate's is: the repository copy finds its root from
        // where it sits, a plugin root's copy from the bounded variable or the working directory.
        content: buildCursorContinueScript({ layout: ctx.facts.hookScriptsRoot === undefined ? "generated" : "container" }),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.continueRun, artifactType: "infra" },
      },
      {
        path: CURSOR_CONTEXT_ONCE_HOOK_PATH,
        // The layout decided as the continue hook's is.
        content: buildContextOnceScript({ layout: ctx.facts.hookScriptsRoot === undefined ? "generated" : "container" }),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.contextOnce, artifactType: "infra" },
      },
      {
        path: SUBAGENT_GUARD_PATH,
        // Every id this run can legitimately spawn: the shipped roster, plus
        // the agents actually emitted above. A pack agent emitted without a
        // roster row would otherwise be denied at the spawn guard while its own
        // file sits in `.cursor/agents/` inviting the spawn — a refusal the
        // operator cannot act on, since the id IS installed.
        content: buildSubagentGuardScript(spawnable, cliCallContextOf(ctx)),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.subagentGuard, artifactType: "infra" },
      },
      {
        path: MCP_GUARD_PATH,
        content: buildMcpGuardScript(cliCallContextOf(ctx)),
        owner: { adapter: "cursor", artifactId: ARTIFACT_IDS.mcpGuard, artifactType: "infra" },
      },
      {
        path: CURSOR_HOOKS_CONFIG_PATH,
        content: buildHooksJson(core.hooks.interchangeFor("cursor"), cliCallContextOf(ctx), ctx.facts.hookScriptsRoot, { modelPins: true, continueRun: true, contextOnce: true }),
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

/**
 * `reviewer` → `stamity-reviewer`: the runtime, wire-visible form of an AGENT or
 * RULE id, the two classes that keep the long prefix. Commands take the typed
 * `st-` form from `emittedIdFor` inside the shared touchpoint projection — an id
 * the operator types is not the same contract as one the spawn guard matches.
 */
function prefixedId(id: string): string {
  return `${CONTENT_PREFIX}${id}`;
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
 * PIN, PICK OR OMIT, on the model field. Its vocabulary is a concrete model
 * id — optionally parameterised in brackets, `composer-2.5[fast=false]`,
 * options comma-separated inside one group — or the client's own keyword for
 * deferring to the session's model (cursor.com/docs/agent/subagents, read
 * 2026-10-14). This client publishes no model-agnostic alias a ladder class
 * could map onto, so the class resolves through the one projection table
 * ({@link resolveModelValue}) with `pick`, the account's saved list
 * (REQ-LADDER-006): an operator pin the list holds (or any pin, with no list)
 * emits that id verbatim, carrying the `[effort=…]` parameter this client uses
 * as its effort carrier unless the id names its effort variant already; a pin
 * the list lacks, or no pin, takes the first shipped candidate the list holds,
 * at the class's effort variant; with no pin and no list, no key at all.
 *
 * A DEFAULT, NOT A LIMIT. Cursor does not bind a sub-agent to this field: an
 * enterprise fork measured on 3.13.25 that the model passed on the `Task` call
 * decides. The touchpoints therefore pass the class's model from
 * {@link buildCursorModelMap}'s map, and {@link buildModelPinsHookScript}
 * fills it into a call that names none; this field is what a call outside both
 * paths falls back to.
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
 * The absent key, with no pin and no list, is the point, not a gap. Writing
 * that defer-to-the-session keyword restates the client's own documented
 * default as though the engine had decided something, and an id the account
 * does not offer fails the spawn. Silence says exactly what is true — this
 * engine knows no model the account offers — and the client then applies the
 * default that belongs to it.
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
  pick: ModelPickSource = {},
): string {
  const lines = [`description: ${frontmatterScalar(item.description)}`];

  const declaredClass = item.frontmatter["model_class"];
  // A class off the ladder, or one with no pin, is left unwritten rather than
  // picked: a model outside the client's sub-agent list fails the call, whereas
  // an absent key runs the sub-agent on the parent agent's model and works (ledger row qa/1).
  const model =
    typeof declaredClass === "string"
      ? resolveModelValue(declaredClass, "cursor", pins, efforts, pick)
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

/** One class in the model map: the pinned model the agent files carry, absent with no pin, and `fallbacks`, always empty here. */
export interface CursorModelMapClass {
  model?: string;
  fallbacks: string[];
}

/** `.stamity/generated/models/cursor.json`: every ladder class's model, and each emitted role's class. */
export interface CursorModelMap {
  classes: Record<ModelClass, CursorModelMapClass>;
  roles: Record<string, ModelClass>;
}

/**
 * The class-to-model map (REQ-LADDER-007) the touchpoints read to pass
 * `model` on each sub-agent call, and the one {@link buildModelPinsHookScript}
 * builds in. Every ladder class is present in the ladder's order, `frontier`
 * included although no agent file declares it, because a flow escalates a role
 * to it on the call.
 *
 * `model` is what a `Task` call can pass: an id the account lists, or the
 * operator's pin exactly as typed — never a bracket group the engine added.
 * {@link buildCursorAgent} writes the same model id, so a file and a call never
 * disagree on the model; the file may add `[effort=…]` to a pin that is not a
 * listed variant, a form Cursor documents for agent files only
 * (cursor.com/docs/agent/subagents, read 2026-10-14), so the map leaves it
 * out (review/100). With no pin `model` is absent, list or no list, and the
 * class reads `{ "fallbacks": [] }`: Cursor checks a call's model against a
 * sub-agent list no command prints, and an absent one takes the parent's
 * (ledger row 2026-10-14_cli-native/qa/1). `fallbacks` stays in the shape the
 * other clients' maps share, and is always empty here, since every entry would
 * be a model the operator did not pin. `roles` maps each emitted agent's
 * runtime id to the class its frontmatter declares, sorted by id so the bytes
 * are stable.
 */
export function buildCursorModelMap(
  roles: Readonly<Partial<Record<string, ModelClass>>>,
  pins: ModelPinMap = {},
  efforts: EffortMap = {},
  pick: ModelPickSource = {},
): CursorModelMap {
  const classes = {} as Record<ModelClass, CursorModelMapClass>;
  for (const { modelClass, defaultEffort } of MODEL_LADDER) {
    // The level the resolver appended as `[effort=…]`, if it appended one: the
    // operator's, else the ladder's, on this client's scale.
    const effort = nearestExpressibleEffort(efforts[modelClass] ?? defaultEffort, "cursor");
    const model = callableModel(resolveModelValue(modelClass, "cursor", pins, efforts, pick), pins[modelClass], effort);
    classes[modelClass] = { ...(model === undefined ? {} : { model }), fallbacks: [] };
  }
  const sorted: Record<string, ModelClass> = {};
  for (const id of Object.keys(roles).toSorted()) {
    const modelClass = roles[id];
    if (modelClass !== undefined) sorted[id] = modelClass;
  }
  return { classes, roles: sorted };
}

/**
 * The agent file's model `value` without the `[effort=…]` group the engine
 * appended to it, or `value` itself when the engine appended none. The
 * resolver appends the group only to a value with no bracket of its own, so a
 * value equal to the operator's `pin` as typed is kept whole: a group there is
 * the operator's, not the engine's.
 */
function callableModel(value: string | undefined, pin: string | undefined, effort: EffortLevel | undefined): string | undefined {
  const template = CLIENT_MODEL_PROJECTION.cursor.effortTemplate;
  if (value === undefined || value === pin?.trim() || template === null || effort === undefined) return value;
  const added = template.replace(EFFORT_PLACEHOLDER, effort);
  const base = value.slice(0, value.length - added.length);
  return value.endsWith(added) && !base.includes("[") ? base : value;
}

// ── Hooks ────────────────────────────────────────────────────────

/** One `hooks.json` entry: a command line, optionally narrowed and blocking. */
interface CursorHookEntry {
  command: string;
  timeout?: number;
  matcher?: string;
  failClosed?: boolean;
  /** On `stop` alone: the most follow-ups the hook's answers run in one conversation. */
  loop_limit?: number;
}

/**
 * The `.cursor/hooks.json` document: portable interchange rows renamed into
 * the client's taxonomy, plus the two adapter-owned guards
 * ({@link SUBAGENT_GUARD_PATH}, {@link MCP_GUARD_PATH}; their 1.11.0 names,
 * {@link LEGACY_CURSOR_GUARD_PATHS}, are never written here) and the core
 * person-only shell guard on `beforeShellExecution` ({@link PERSON_ONLY_GUARD_PATH}).
 *
 * The document is co-owned entry by entry (REQ-FLOW-037,
 * `../manifest/hookDocuments.ts`): this function renders the engine's
 * entries, and the write lane merges them beside an owner's own.
 *
 * Native command strings launch the portable runner, which keeps the authored
 * argv intact and translates supported hookSpecificOutput fields. timeoutMs is
 * rounded up to native seconds; the child keeps its exact millisecond deadline.
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
 *
 * Every repository command is the walk-up starter (`portableHookCommand`,
 * REQ-FLOW-084): it finds the folder holding `.cursor/hooks.json` from wherever
 * the session started, so a hook runs the same from a subfolder as from the
 * root. `cli` pins the sync call the starter names when its script is missing.
 *
 * `opts.modelPins` appends the model-fill hook ({@link MODEL_PINS_HOOK_PATH})
 * to `preToolUse`, after the planned rows, matched to `Task` and never
 * `failClosed`: it rewrites a call's input and decides nothing, so a crash or a
 * timeout lets the call through on the model it named (cursor.com/docs/hooks,
 * read 2026-10-14: without `failClosed` a crash, a timeout, a non-zero exit or
 * no output lets the call through; invalid JSON on stdout blocks it, which is
 * why the script answers valid JSON on every path it controls). It runs through the
 * starter directly, not through the portable runner, which drops Cursor's
 * `updated_input` (`../hooks/portableRunner.ts`). The residue planner sets it;
 * a direct call without it renders the document as before the hook existed.
 *
 * `opts.continueRun` appends the continue hook ({@link CURSOR_CONTINUE_HOOK_PATH})
 * to `stop`, after the planned rows, under {@link CURSOR_CONTINUE_LOOP_LIMIT} and
 * never `failClosed`: a stop decides nothing. It too runs through the starter
 * directly, which hands Cursor its `followup_message` as written, and its row
 * names its own event. The residue planner sets it, as it sets `modelPins`.
 *
 * `opts.contextOnce` appends the context-once hook ({@link CURSOR_CONTEXT_ONCE_HOOK_PATH})
 * to `postToolUse`, after the planned rows, never `failClosed`: it adds context
 * and decides nothing. It runs through the starter directly, its row naming
 * `post_tool_use`, and writes Cursor's own `additional_context`. The residue
 * planner sets it too.
 */
export function buildHooksJson(
  rows: readonly HookInterchange[],
  cli: CliCallContext,
  hookScriptsRoot?: string,
  opts: { modelPins?: boolean; continueRun?: boolean; contextOnce?: boolean } = {},
): string {
  const syncCall = pinnedCliCall(cli.packageName, cli.version, "sync", cli);
  const events: Record<string, CursorHookEntry[]> = {};
  // The core's rows already carry the client's view of their own scripts. The
  // adapter's own scripts do not: they are placed AND wired by this adapter, so
  // their commands are where a plugin's configuration could keep a repository
  // path. Their script rows keep their repository paths either way — that is
  // where this repository writes the bytes, and the plugin emitter relocates
  // them from there.
  const placed = (file: string): string =>
    hookScriptsRoot === undefined ? file : `${hookScriptsRoot}/${file.slice(file.lastIndexOf("/") + 1)}`;
  // In a repository each adapter script runs through the same walk-up starter
  // as the planned rows, so a session started in a subfolder still reaches it;
  // with the script missing the starter exits 1 naming the sync call. The row
  // it carries names the script and the event it is wired to; a script reads its payload, if at all, and no argument.
  const adapterScriptCommand = (file: string, event: CanonicalHookEvent = "pre_tool_use"): string =>
    hookScriptsRoot === undefined
      ? portableHookCommand("cursor", { event, command: ["node", file] }, { syncCall, script: file })
      : shellCommand(["node", placed(file)]);

  for (const event of CANONICAL_HOOK_EVENTS) {
    const entries = rows
      .filter((row) => row.event === event)
      .map((row) => {
        // Keys are assigned rather than spread-merged: assignment order is the
        // serialized key order, so `command, matcher?, failClosed?` stays fixed
        // and the emitted bytes are stable. Absent optionals are never written,
        // so an omitted key is absent rather than present-and-undefined.
        const entry: CursorHookEntry = { command: portableHookCommand("cursor", row, { syncCall }) };
        if (row.timeoutMs !== undefined) entry.timeout = Math.ceil(row.timeoutMs / 1000);
        if (row.matcher !== undefined) entry.matcher = row.matcher;
        if (rowOptsIntoBlocking(event, row, hookScriptsRoot)) entry.failClosed = true;
        return entry;
      });
    if (event === "pre_tool_use" && opts.modelPins === true) {
      entries.push({ command: adapterScriptCommand(MODEL_PINS_HOOK_PATH), matcher: SUBAGENT_TOOL });
    }
    if (event === "post_tool_use" && opts.contextOnce === true) {
      entries.push({ command: adapterScriptCommand(CURSOR_CONTEXT_ONCE_HOOK_PATH, "post_tool_use") });
    }
    if (event === "stop" && opts.continueRun === true) {
      entries.push({ command: adapterScriptCommand(CURSOR_CONTINUE_HOOK_PATH, "stop"), loop_limit: CURSOR_CONTINUE_LOOP_LIMIT });
    }
    if (entries.length === 0) continue;
    events[EVENT_RENAME[event]] = entries;
  }

  // Both guards opt into blocking: an allowlist that logs and proceeds is not
  // an allowlist. Each fails open internally on an ambiguity it cannot judge —
  // announced on stderr, never silently — so the residual fail-closed surface is
  // a crashed or timed-out script, not a guess; a missing one makes the starter
  // exit 1, which `failClosed` turns into a refusal.
  events[CURSOR_GUARD_EVENTS.subagentSpawn] = [{ command: adapterScriptCommand(SUBAGENT_GUARD_PATH), failClosed: true }];
  events[CURSOR_GUARD_EVENTS.mcpExecution] = [{ command: adapterScriptCommand(MCP_GUARD_PATH), failClosed: true }];
  // The person-only shell guard, run by the starter directly and never through
  // the portable runner: it already writes Cursor's own `permission` document,
  // which the runner reads as an undecidable key and refuses on every call. It
  // answers allow or deny on every path it controls; `failClosed` turns a crash, a timeout or a
  // missing script into a refusal, so a push it cannot judge does not go through.
  events[CURSOR_GUARD_EVENTS.shellExecution] = [{ command: adapterScriptCommand(PERSON_ONLY_GUARD_PATH), failClosed: true }];

  return `${JSON.stringify({ version: 1, hooks: events }, null, 2)}\n`;
}

/** Shell-safe tokens: anything outside this set forces quoting. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/*
 * `ROOT_VARIABLE_PATH` — the one `$`-carrying token admitted past single-quoting
 * — is imported from `../hooks/portableRunner.ts`. It was a byte-twin of
 * `./claude.ts`'s copy; the shape now has one home, so it can no longer be
 * narrowed in one renderer and left wide in the other.
 *
 * Rendered DOUBLE-quoted rather than bare: the variable expands to the plugin's
 * ABSOLUTE install path, which can hold a space, and double quotes are the one
 * rendering that keeps the expansion and survives one.
 */

/** argv rendered as one POSIX command line, each token quoted only if it needs it. */
function shellCommand(argv: readonly string[]): string {
  return argv
    .map((token) => {
      if (SHELL_SAFE.test(token)) return token;
      if (ROOT_VARIABLE_PATH.test(token)) return `"${token}"`;
      return `'${token.replaceAll("'", `'\\''`)}'`;
    })
    .join(" ");
}

// ── Guard scripts ────────────────────────────────────────────────

/** Shared head: shebang, the lint directive (REQ-FLOW-001), summary, and the trust posture the bytes must keep. */
function guardHeader(summary: readonly string[]): string {
  return [
    "#!/usr/bin/env node",
    GENERATED_SCRIPT_LINT_DIRECTIVE,
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
 * the "message shown in client when denied" (cursor.com/docs/hooks,
 * accessed 2026-09-17). The refusal event goes to stderr through
 * {@link NOTICE_HELPER}, where the operator and any log pipeline can see it —
 * stdout is the decision channel and must carry the verdict alone.
 *
 * EVERY PATH WRITES A VERDICT, including the allow — see {@link ALLOW_HELPER}.
 * Silence used to be the allow, on the build's own reading that a hook writing
 * nothing has made no decision. The page read on 2026-09-17 settles it the
 * other way: its `failClosed` clause counts NO OUTPUT among the hook failures
 * that block the action, and both guards are wired `failClosed: true`, so a
 * silent allow is a blocked spawn and a blocked MCP call on any client that
 * implements that sentence. The explicit allow is correct under either reading,
 * which is why it is written rather than waited on.
 */
const DENY_HELPER = `function deny(hook, event, userMessage) {
  notice(hook, event);
  process.stdout.write(JSON.stringify({ permission: "deny", user_message: userMessage }));
}`;

/**
 * The other half of the verdict channel: the allow this client has to be told.
 *
 * Paired with {@link DENY_HELPER} so the two decisions leave by the same door,
 * and called on every path that is not a refusal — including the payload the
 * spawn guard cannot judge and the MCP call allowed while one manifest is
 * broken, both of which still announce themselves on stderr through
 * {@link NOTICE_HELPER} first.
 */
const ALLOW_HELPER = `function allow() {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
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
 *
 * `cli` is the package and version the refusal's re-sync hint pins
 * ({@link cliCallHint}): a bare `stamity sync` in a refusal the model reads
 * back fails on the documented `npx` setup, which installs no binary.
 */
export function buildSubagentGuardScript(roster: readonly string[], cli: CliCallContext): string {
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
const SYNC_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "sync", cli))};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

const { payload, problem } = readPayload();
const agentId = typeof payload.subagent_type === "string" ? payload.subagent_type : "";

// Nothing to judge: say so on stderr rather than passing the spawn through in
// silence. The spawn still proceeds, and it takes an explicit allow to say so —
// no output is a failClosed failure on this client.
if (agentId === "") {
  notice("stamity-cursor-subagent-guard", {
    reasonCode: "SPAWN_PAYLOAD_UNUSABLE",
    detail: problem === null ? "payload carried no subagent_type" : problem,
    at: new Date().toISOString(),
  });
  allow();
} else if (agentId.startsWith(NAMESPACE) && !ROSTER.has(agentId)) {
  deny(
    "stamity-cursor-subagent-guard",
    { reasonCode: "AGENT_NOT_ON_ROSTER", agentId, at: new Date().toISOString() },
    'Blocked the spawn of "' +
      agentId +
      '": no agent with that id ships in this setup, so it holds no tool policy. ' +
      "Spawn one of: " +
      [...ROSTER].join(", ") +
      ". If the roster changed, re-run " + SYNC_CALL + ".",
  );
} else {
  // Out of scope, or rostered. The spawn proceeds and the verdict says so.
  allow();
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
 * `stamity sync`, each as {@link cliCallHint} spells it for `cli` — the
 * installed form and the pinned npx fallback — because the documented `npx`
 * setup installs no binary for a bare verb to reach. Deleting the entry from
 * `.cursor/hooks.json` is not on that list — the next sync rewrites the file
 * and `stamity check` reports the edit as drift until it does, which is the
 * advice the generated header four lines above already gives.
 */
export function buildMcpGuardScript(cli: CliCallContext): string {
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
    "To stop the guard, change the selection — the refusals below name the two",
    "calls, adding a server and then re-syncing — or deselect this client;",
    "editing .cursor/hooks.json does not stick.",
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
const SYNC_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "sync", cli))};
const MCP_ADD_CALL = ${JSON.stringify(cliCallHint(cli.packageName, cli.version, "config mcp add <id>", cli))};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

${DENY_HELPER}

${ALLOW_HELPER}

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
      ", then re-run " +
      SYNC_CALL +
      ".",
  );
} else if (allowed.size === 0) {
  deny(
    HOOK,
    { reasonCode: "NO_MCP_SERVERS_CONFIGURED", ...event },
    "Blocked every MCP call: this setup configured no MCP servers, so there is " +
      "no allowlist to match against. Add one with " +
      MCP_ADD_CALL +
      ". Then re-run " +
      SYNC_CALL +
      ".",
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
      MCP_ADD_CALL +
      ". Then re-run " +
      SYNC_CALL +
      ".",
  );
} else if (faults.length > 0) {
  // Allowed on the manifests that DID load. The broken one still cost the
  // operator whatever it configured, so it is announced rather than left to be
  // discovered as a server that silently stopped being reachable.
  notice(HOOK, { reasonCode: "MCP_MANIFEST_UNREADABLE", faults, ...event });
  allow();
} else {
  // On the allowlist. The verdict is written rather than implied: no output is
  // a failClosed failure here, and this guard is wired failClosed: true.
  allow();
}
`;
}

/**
 * The model-fill hook (REQ-LADDER-007), wired on `preToolUse` for `Task`.
 *
 * Cursor's `preToolUse` answer may carry `updated_input`, the "modified tool
 * input to use instead" (cursor.com/docs/hooks, read 2026-10-14), and the model
 * on the `Task` call is the one that decides the sub-agent's (see
 * {@link buildCursorAgent}). So a call to an emitted Stamity agent that names
 * no model gets the class's model from `map`, built in, and nothing else of it
 * changes: the input is copied whole and `model` set on the copy. The map holds
 * a model only for a class the operator pinned, so an unpinned class's call is
 * left as it is and runs on the parent agent's model: Cursor refused a model
 * this hook filled from the account's list (ledger row 2026-10-14_cli-native/qa/1).
 *
 * It narrows its own reach rather than trusting the matcher's: the payload's
 * `tool_name` must be `Task` exactly (the matcher is a pattern, and an MCP
 * tool's name can contain the word), `tool_input.model` must be absent, and
 * `tool_input.subagent_type` must be an own key of the map's roles inside the
 * generated-content prefix, with a model for its class. The payload's top-level
 * `model` is the session's, not the call's, and is never read.
 *
 * EVERY PATH ANSWERS `allow`, as valid JSON, and exits 0: the hook only ever
 * adds a model, so it neither widens nor narrows a permission, and this client
 * blocks a permission hook's call on invalid JSON even without `failClosed`.
 * A payload it cannot read is passed through and named on stderr, as the spawn
 * guard names one.
 */
export function buildModelPinsHookScript(map: CursorModelMap): string {
  return `${guardHeader([
    "stamity — model-fill hook for sub-agent calls.",
    "",
    "Wired on preToolUse for Task. When a call spawns one of this setup's agents",
    "and names no model, it answers with the call's input plus the model the",
    "class-to-model map below gives that agent's class, which only an operator's",
    "pin puts there; every other call is allowed unchanged. It always allows, as",
    "valid JSON, and never blocks.",
  ])}

import { readFileSync } from "node:fs";

const NAMESPACE = ${JSON.stringify(CONTENT_PREFIX)};
const TOOL = ${JSON.stringify(SUBAGENT_TOOL)};
const MAP = ${JSON.stringify(map, null, 2)};

${REASON_HELPER}

${READ_PAYLOAD}

${NOTICE_HELPER}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The class's model for a Task call that names none, or null to leave the call as it is.
function modelFor(payload) {
  if (payload.tool_name !== TOOL) return null;
  const input = payload.tool_input;
  if (!isObject(input) || (input.model !== undefined && input.model !== null)) return null;
  const agentId = input.subagent_type;
  if (typeof agentId !== "string" || !agentId.startsWith(NAMESPACE) || !Object.hasOwn(MAP.roles, agentId)) return null;
  const modelClass = MAP.roles[agentId];
  const entry = Object.hasOwn(MAP.classes, modelClass) ? MAP.classes[modelClass] : undefined;
  return isObject(entry) && typeof entry.model === "string" ? entry.model : null;
}

let answer = { permission: "allow" };
try {
  const { payload, problem } = readPayload();
  if (problem !== null) {
    notice("stamity-cursor-model-pins", { reasonCode: "TASK_PAYLOAD_UNUSABLE", detail: problem, at: new Date().toISOString() });
  } else {
    const model = modelFor(payload);
    if (model !== null) answer = { permission: "allow", updated_input: { ...payload.tool_input, model } };
  }
} catch (err) {
  notice("stamity-cursor-model-pins", { reasonCode: "MODEL_FILL_FAILED", detail: reasonOf(err), at: new Date().toISOString() });
}
process.stdout.write(JSON.stringify(answer));
`;
}

// ── Shared rendering ─────────────────────────────────────────────

// `frontmatterScalar` (the description and model-pin injection guard) has one
// home, `src/emit/skillsProjection.ts`, which the touchpoint skills share.

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
