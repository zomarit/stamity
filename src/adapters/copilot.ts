/**
 * Copilot residue: rules, agents, prompt files, setup workflow and repository hooks.
 * Hook output translates from the portable schema. PreToolUse denies on explicit
 * rejection and errors; timeouts remain fail-open. Identity-free role guards are
 * telemetry. Other events retain their documented limitations.
 * Current contract: https://docs.github.com/en/copilot/reference/hooks-reference
 * (2026-10-14).
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  buildPortableHookRunner,
  COPILOT_RUNTIME_TOOL_NAMES,
  portableHookCommand,
  PORTABLE_RUNNER_FILE,
} from "../hooks/portableRunner.ts";
import type { CanonicalHookEvent, HookInterchange } from "../hooks/model.ts";
import {
  buildContentIndex,
  emittedIdFor,
  typeIdKey,
  type CatalogItem,
} from "../content/catalog.ts";
import { declaredRuleGlobs } from "../content/ruleDelivery.ts";
import { buildSelectionAllowlist, classifySelection } from "../content/selection.ts";
import { detectPackageManager, type PackageManagerInfo } from "../detect/packageManager.ts";
import { verificationGatesFromManifest } from "../emit/agentsMd.ts";
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
import { CLIENT_HOOK_GUARANTEES } from "../hooks/model.ts";
import { printableName } from "../manifest/coOwnedJson.ts";
import type { McpEmission } from "../mcp/emit.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import { MODEL_PRIORITY, modelMapPath, pickModel } from "../roster/modelDefaults.ts";
import {
  CLIENT_MODEL_PROJECTION,
  isModelClass,
  listHoldsPin,
  MODEL_LADDER,
  pinsFor,
  resolveEffortValue,
  resolveModelValue,
  type EffortMap,
  type ModelPickSource,
  type ModelPinMap,
} from "../roster/modelLadder.ts";
import { pinnedCliCall, pinnedCliPrefix } from "../shared/cliCall.ts";
import {
  substituteCanonicalPlatformMarker,
  toCopilotToolsFrontmatter,
} from "../tools/translator.ts";
import type { AdapterOutput, ContentClass, EmissionOwner } from "../types/content.ts";
import type { ModelClass, Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";

// ── Client layout ────────────────────────────────────────────────

/** The tool this planner speaks for; also the ledger owner of every row it returns. */
const TOOL: Tool = "copilot";

/** Path-scoped custom instructions (code.visualstudio.com/docs/copilot/copilot-customization). */
const INSTRUCTIONS_DIR = ".github/instructions";

/**
 * Repository-level custom agents. The org/enterprise form drops the `.github/`
 * prefix; a repository setup emits the repository form only
 * (docs.github.com/en/copilot/reference/custom-agents-configuration).
 */
const AGENTS_DIR = ".github/agents";

/**
 * Prompt files — Copilot's picker surface for the touchpoint commands.
 *
 * Exported because the init panel names it: this client's ready-steps used to
 * offer `@workspace` alone while nine `/st-*` prompt files sat installed
 * and unmentioned, so the panel reads the directory from here rather than
 * spelling a second copy that can drift (`../cli/commands/init/panel.ts`).
 */
export const COPILOT_HOOKS_PATH = ".github/hooks/stamity.json";

export const COPILOT_PROMPTS_DIR = ".github/prompts";
const PROMPTS_DIR = COPILOT_PROMPTS_DIR;

/** The `/st-work` prompt file: the flow the cloud agent's entry points at. */
const WORK_PROMPT_PATH = `${PROMPTS_DIR}/st-work.prompt.md`;

/**
 * The cloud agent's entry (REQ-FLOW-118). A prompt file is not run by name on
 * Copilot's cloud agent, and the work prompt is over the agent prompt cap, so a
 * thin agent names the file instead of carrying it. Adapter-emitted with no
 * corpus file and no roster row; the `stamity-` stem keeps it apart from a
 * hand-written agent (REQ-FLOW-038).
 */
export const COPILOT_RUN_AGENT_PATH = `${AGENTS_DIR}/stamity-run.agent.md`;

/**
 * The coding agent's environment-preparation workflow. Both the path and the
 * job name inside it are fixed by the platform: the agent looks for a job
 * called `copilot-setup-steps` in this file and runs nothing else from it.
 */
export const COPILOT_SETUP_STEPS_PATH = ".github/workflows/copilot-setup-steps.yml";

/** Job name the coding agent runs. Not a convention — the platform matches on it. */
const SETUP_STEPS_JOB = "copilot-setup-steps";

/**
 * The setup job's `timeout-minutes` (REQ-FLOW-117). The environment page cited
 * in {@link COPILOT_DIALECT_FACTS} lists the key among the job's customizable
 * settings with a maximum of 59; half that bounds an install that hangs, well
 * above what a dependency install takes.
 */
const SETUP_STEPS_TIMEOUT_MINUTES = 30;

/**
 * Documented character cap on the markdown BELOW an agent file's frontmatter —
 * the prompt Copilot actually ingests. Over it, the prompt is truncated or
 * rejected with no signal, which is why emission refuses rather than warns.
 */
export const COPILOT_AGENT_PROMPT_CAP = 30_000;

/** `applyTo` value for a rule with no glob scope: every file in the repository. */
const APPLY_TO_EVERY_FILE = "**";

/**
 * Separator between patterns inside one `applyTo` string.
 *
 * A bare comma: the documented spelling. The reference states the rule in prose
 * — "You can specify multiple patterns by separating them with commas" — and
 * its own two-pattern example (a `.ts` glob and a `.tsx` one) carries no space
 * after the comma
 * (docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide,
 * re-read 2026-08-22 for this claim alone; {@link ACCESS_DATE} stays the
 * all-or-nothing currency stamp for {@link COPILOT_DIALECT_FACTS} and is not
 * re-stamped by a single-claim read).
 *
 * A padded `", "` also matched, because the reader trims each pattern after
 * splitting (`splitGlobAware(applyTo, ',')` then `pattern.trim()`,
 * github.com/microsoft/vscode/pull/250754, accessed 2026-08-17). That trim
 * lives in the client's matcher rather than in the published format, so padding
 * bought readability at the price of a dependency on an unrelated code path
 * staying put. The unpadded form is free of it, reads byte-identical to any
 * trimming reader, and is what the format documents.
 */
const APPLY_TO_SEPARATOR = ",";

/** Frontmatter key an artifact declares its ladder class in (see `../roster/modelLadder.ts`). */
const MODEL_CLASS_FIELD = "model_class";

/** Languages whose presence makes the Node lane of the setup workflow the right one. */
const NODE_LANGUAGES: ReadonlySet<string> = new Set(["javascript", "typescript"]);

/**
 * Access date carried by every platform citation in {@link COPILOT_DIALECT_FACTS}.
 *
 * One date for the whole list, so the currency pass is all-or-nothing:
 * every claim below was re-read against its cited page on this date, and a pass
 * that verified only some of them would have to split the constant rather than
 * quietly re-stamp the rest.
 */
const ACCESS_DATE = "2026-09-10";

/**
 * This client's effort key and scale, as the projection row declares them
 * (`../roster/modelLadder.ts`): the emitted line takes its key from here and
 * the capability row its scale's two ends, so neither restates the row.
 */
const { effortKey: EFFORT_KEY, effortScale: EFFORT_SCALE } = CLIENT_MODEL_PROJECTION[TOOL];

// ── Dialect facts ────────────────────────────────────────────────

/** This client's honest hook guarantee, read from the shared table rather than restated. */
const HOOK_GUARANTEE = CLIENT_HOOK_GUARANTEES.find((row) => row.tool === TOOL);

/**
 * What Copilot can and cannot express, as data the generated capability matrix
 * renders. Every claim traces to a citation with an access date; the hook row
 * is derived from {@link CLIENT_HOOK_GUARANTEES} so the matrix and the emitted
 * guard bodies cannot disagree about what this client enforces.
 */
export const COPILOT_DIALECT_FACTS: AdapterDialectFacts = {
  tool: TOOL,
  ruleShape:
    "`.github/instructions/<id>.instructions.md` with `applyTo:` — ONE glob string, patterns comma-separated, never a YAML list",
  hooksConfigPath: COPILOT_HOOKS_PATH,
  readsAgentsSkillsDir: true,
  agentsFormat:
    "`.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `include-custom-instructions: true`, `tools:` alias list, `model:` the class model's display name as `<name> (copilot)` where the shipped list gives one (whether any reader takes it on a `target: github-copilot` agent is unverified), `models:` the class's CLI ids in priority order whenever the class resolves — the operator's pin, else the first shipped candidate the account's saved list holds, else, only when no list was read, the shipped list's first entry; a saved list holding none of the class's candidates writes neither key — `reasoning-effort:` at the declared class's level) over a markdown prompt; the class-to-model map at `.stamity/generated/models/copilot.json`",
  mcpDialect: "vscode-json",
  entryFile: null,
  caps: [
    { name: "agent-prompt-chars", value: String(COPILOT_AGENT_PROMPT_CAP) },
    { name: "charter-budget", value: "~2 pages; AGENTS.md is native, so no mirror is emitted" },
    {
      name: "command-surface",
      value:
        `native — the nine touchpoints ship as prompt files in ${PROMPTS_DIR}/, invoked as ` +
        `/st-<id>; the format's \`agent\` and \`tools\` keys stay unemitted (per-prompt ` +
        `restrictions this engine cannot answer), \`model\` follows an operator pin. With Codex ` +
        `or Cursor selected beside it, the same nine also ship in \`.agents/skills/\` with ` +
        `\`disable-model-invocation: true\`, a tree this client reads, so they list twice for the ` +
        `operator: Copilot CLI 1.0.89 shows them as project skills (\`copilot skill list\`) beside ` +
        `the prompt files, and keeps them out of the model's own skills list (measured 2026-09-30)`,
    },
    // Dated inline, and ACCESS_DATE is not re-stamped: this one claim was read
    // on 2026-10-10 (the CLI command reference, cited below under its own date,
    // the 1.0.89 loader and its changelog, and the custom-agents page), so the
    // all-or-nothing rule holds (as it did on 2026-09-30, when two rule rows
    // below were unverified). The live load is QA row 2 of run
    // 2026-10-10_next-tier (2026-10-11T01:30:41Z), whose agent carried
    // `reasoning-effort: high` and whose sub-agent ran at `high`. The scale's
    // two ends are read off the projection row the emission resolves through,
    // so the row cannot name a level the files never carry.
    {
      name: "effort-axis",
      value:
        `emitted — \`reasoning-effort: <level>\` per agent, on the scale \`${EFFORT_SCALE[0]}\` … ` +
        `\`${EFFORT_SCALE.at(-1)}\` (Copilot CLI reference, accessed 2026-10-10; the key in the ` +
        "1.0.89 loader and its changelog, 1.0.66 and 1.0.88); a live run on Copilot CLI 1.0.89 " +
        "(2026-10-11) loaded an agent carrying `reasoning-effort: high` and its sub-agent ran at " +
        "that level (`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` branch, QA row 2); " +
        "a level the model " +
        "does not offer is reported and falls back to the session's; the cloud agent's handling of " +
        "the key is undocumented (custom-agents configuration page, accessed 2026-10-10)",
    },
    // Dated inline, and ACCESS_DATE is not re-stamped: this one claim was read
    // on 2026-10-10 (the CLI changelog, the 1.0.89 loader, the live check, the
    // CLI command reference and the custom-agents page), so the all-or-nothing
    // rule holds. The first live check proved the gap; QA row 2 of the same run
    // (2026-10-11T01:30:41Z) proved the key's effect on 1.0.89, its sub-agent
    // quoting the charter's version line the run before the key answered
    // `CHARTER: NONE` to. The override flag is the reference's claim alone.
    {
      name: "sub-agent-instructions",
      value:
        "emitted — `include-custom-instructions: true` on every agent (Copilot CLI changelog " +
        "1.0.86; the key sits in the 1.0.89 loader's frontmatter keys); a live sub-agent check on " +
        "Copilot CLI 1.0.89 (2026-10-10) found that an agent without it loads no `AGENTS.md`, and " +
        "a live run on 1.0.89 (2026-10-11) with the key emitted loaded it: the sub-agent quoted the " +
        "charter's version line (`.stamity/runs/2026-10-10_next-tier/record.md` on the `records` " +
        "branch, QA row 2); " +
        "`--no-custom-instructions` overrides it (Copilot CLI command reference, accessed " +
        "2026-10-10; unverified on 1.0.89, where no live run passed the flag); the cloud agent's " +
        "handling of the key is undocumented (custom-agents configuration page, accessed 2026-10-10)",
    },
    // Dated inline, and ACCESS_DATE is not re-stamped: these claims were read
    // on 2026-10-14 (the CLI command reference's custom-agent table, VS Code's
    // custom-agents page and the cloud agent's model page, the last two cited
    // below under that date), so the all-or-nothing rule holds.
    {
      name: "model-pick",
      value:
        "emitted — `models: [<id>, …]` per agent whenever the class resolves, the class's CLI ids in " +
        "priority order: the " +
        "runtime uses the first one the plan can access, falls back to the session's model when " +
        "none resolves, and `models` overrides `model`; under an Auto session model a sub-agent " +
        "inherits the resolved session model whatever the file says (Copilot CLI command reference, " +
        "read 2026-10-14). That behaviour is the reference's claim: no live run has loaded an agent " +
        "carrying `models` or `model`, and which CLI version's loader takes `models` is unchecked. " +
        "No `modelPolicy` is written, so a `/subagents` override still wins. `model:` carries the " +
        "display name in the qualified `<name> (copilot)` form VS Code's custom-agents page documents " +
        "(read 2026-10-14), only where the shipped list gives one; whether VS Code reads it on these " +
        "agents is unverified, since every one sets `target: github-copilot`. A pin typed as a " +
        "display name is not written, and `sync` warns. The class-to-model map at " +
        "`.stamity/generated/models/copilot.json` holds the same ids",
    },
    {
      name: "cloud-model",
      value:
        "the task's model picker decides — the cloud agent runs on the model picked when the task " +
        "is assigned or started, and on Auto where no picker is offered; its model page names no custom-agent model " +
        "key, so the agent file's `model` and `models` are not documented to bind there (cloud " +
        "agent model page, read 2026-10-14)",
    },
    {
      name: "hook-enforcement",
      value:
        HOOK_GUARANTEE === undefined
          ? "undeclared"
          : HOOK_GUARANTEE.notes,
    },
    {
      name: "deny-gate",
      value:
        "Repository hooks target Copilot CLI/cloud. preToolUse denies via native JSON or nonzero exit; timeouts fail-open. The core role guard has no calling-agent identity and remains telemetry.",
    },
    {
      name: "rule-activation",
      value: "glob only; no description-pull mode, so an agent-requested rule emits applyTo: \"**\"",
    },
    { name: "rule-precedence", value: "not expressible — Copilot has no ordering primitive" },
    {
      name: "mcp-documents",
      value: "two — the editor `vscode-json` document plus the coding agent's `copilot-env` repo settings",
    },
    // The two MCP documents differ in who vouches for a server, not in shape.
    // A coding-agent server is entered in the repository's Copilot settings —
    // the surface a repository administrator holds — so the decision to trust
    // it is taken once, when it is configured, and the agent's own run asks
    // nobody. The editor document is a working-tree file the user owns, and no
    // repository-side approval reaches it. Placement is read from the
    // coding-agent MCP configuration page recorded in `../mcp/emit.ts`'s
    // header (re-read 2026-08-22 for this claim alone; {@link ACCESS_DATE}
    // stays the all-or-nothing currency stamp for the citation list below and
    // a single-claim read does not re-stamp it).
    {
      name: "mcp-approval",
      value:
        "configuration-time — a coding-agent server is approved by a repository administrator when it " +
        "is entered in the repository's Copilot settings, so a server's trust is decided when it is " +
        "configured, not when the agent runs; the editor `vscode-json` document is the user's own and " +
        "that approval does not cover it (coding-agent MCP configuration docs, re-read 2026-08-22 for " +
        "this claim alone)",
    },
  ],
  citations: [
    // Agent frontmatter vocabulary: `target` (`vscode` | `github-copilot`,
    // unset = both), `tools` ("If unset, defaults to all tools"), `model`
    // ("If unset, inherits the default model"), and the 30,000-character
    // prompt maximum. No effort key appears on this page.
    {
      url: "https://docs.github.com/en/copilot/reference/custom-agents-configuration",
      accessDate: ACCESS_DATE,
    },
    // The setup workflow's path and its job-name requirement, verbatim: "The
    // job MUST be called `copilot-setup-steps` or it will not be picked up".
    {
      url: "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/customize-the-agent-environment",
      accessDate: ACCESS_DATE,
    },
    // Instruction-file placement and the two-pattern `applyTo` example the
    // comma separator above is read from.
    {
      url: "https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide",
      accessDate: ACCESS_DATE,
    },
    // Prompt-file placement (`.github/prompts`), invocation ("type `/`
    // followed by the prompt name"), and the frontmatter keys this adapter
    // deliberately leaves unemitted.
    {
      url: "https://code.visualstudio.com/docs/copilot/customization/prompt-files",
      accessDate: ACCESS_DATE,
    },
    // Repository hook discovery, the entry keys `type`, `bash`, `cwd`, `matcher` and
    // `timeoutSec`, the camelCase event names, fail behavior, and the
    // sessionStart `additionalContext` injection the portable runner writes.
    // Re-read whole on 2026-10-14, when the hooks file took the camelCase names
    // and the `bash` key, and every claim in this comment re-checked with them.
    { url: "https://docs.github.com/en/copilot/reference/hooks-reference", accessDate: "2026-10-14" },
    // The `--reasoning-effort` levels (`low` through `max`), the fallback for
    // a model or effort that cannot be honoured, the default that a sub-agent
    // receives no repository instruction files, and the priority of
    // `--no-custom-instructions` over `include-custom-instructions`. Read
    // 2026-10-10 for those claims; its frontmatter table spells the effort key
    // `reasoningEffort`, which is not the spelling the 1.0.89 loader carries.
    {
      url: "https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference",
      accessDate: "2026-10-10",
    },
    // The agent file's `model` as a model name or a prioritized list, in the
    // qualified `Model Name (vendor)` form, e.g. `GPT-5 (copilot)`.
    { url: "https://code.visualstudio.com/docs/agent-customization/custom-agents", accessDate: "2026-10-14" },
    // The cloud agent's model: picked when a task starts, Auto where no picker
    // is offered; no custom-agent model key is named.
    {
      url: "https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/changing-the-ai-model",
      accessDate: "2026-10-14",
    },
  ],
};

// ── The planner ──────────────────────────────────────────────────

/**
 * Plan Copilot's per-client rows over the core plan.
 *
 * Order is class order (agents, rules, commands, as the catalog walks them),
 * then the cloud agent's entry, then the setup workflow, then the MCP
 * documents — deterministic, though the composer sorts by path before anything
 * is written.
 */
export const copilotResiduePlanner: ResiduePlanner = {
  tool: TOOL,
  facts: COPILOT_DIALECT_FACTS,
  async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
    const [items, packageManager, setupPins] = await Promise.all([
      selectedItems(ctx),
      detectPackageManager(ctx.rootDir),
      readSetupStepsPins(ctx.rootDir),
    ]);
    const render = bodyRenderer(ctx);
    // The operator's pins, read once: a pin outranks the pick on its class
    // (`../roster/modelLadder.ts`).
    const pins = pinsFor(ctx.manifest.models, TOOL);
    // The operator's effort overrides, read once beside them: a class with none
    // runs at the ladder's own default.
    const efforts = ctx.manifest.models?.effort ?? {};
    // The account's own list, as `init` and `sync` kept it in the git-ignored
    // cache and laid it in memory (REQ-LADDER-009): a class with no pin takes the
    // first shipped candidate on it, and with no list the shipped list's entry 0.
    // Emission reads that copy and never starts the client (REQ-LADDER-006).
    const listed = ctx.manifest.models?.listed?.[TOOL]?.ids;
    // Each emitted agent's runtime id by its declared class, for the model map.
    const roles: Partial<Record<string, ModelClass>> = {};

    // A demoted rule is NOT written here: the core projected it as a skill
    // under `.agents/skills/stamity-<id>/`, which this client reads directly,
    // and an instructions file beside it would restore the always-on load the
    // demotion exists to reclaim (`../content/ruleDelivery.ts`).
    const demoted = core.demotedRules[TOOL];
    const rows = items.flatMap((item): AdapterOutput[] => {
      switch (item.type) {
        case "rule":
          return demoted.has(item.id) ? [] : [buildInstructionsFile(item, render)];
        case "agent": {
          const declared = item.frontmatter[MODEL_CLASS_FIELD];
          if (isModelClass(declared)) roles[emittedId(item)] = declared;
          return [buildAgentFile(item, grantFor(item), render, pins, efforts, listed)];
        }
        default:
          return [buildPromptFile(item, render, pins, listed)];
      }
    });
    rows.push(...runAgentRows(rows));

    rows.push({
      path: modelMapPath(TOOL),
      content: `${JSON.stringify(buildCopilotModelMap(roles, pins, efforts, listed), null, 2)}\n`,
      owner: owner("copilot-model-map", "infra"),
    });
    const cli = cliCallContextOf(ctx);
    rows.push({ path: COPILOT_HOOKS_PATH, content: buildCopilotHooksJson(core.hooks.interchangeFor(TOOL), cli), owner: owner("copilot-hooks", "infra") });
    rows.push({ path: `.stamity/generated/hooks/copilot/${PORTABLE_RUNNER_FILE}`, content: buildPortableHookRunner("copilot"), owner: owner("copilot-portable-hook", "infra") });
    rows.push({
      path: COPILOT_SETUP_STEPS_PATH,
      content: buildSetupSteps(packageManager, ctx.manifest.detected?.languages ?? [], setupPins, cli),
      owner: owner(SETUP_STEPS_JOB, "infra"),
    });
    // Placed verbatim: the core rendered these documents and chose their paths,
    // and an adapter that re-derived either would be a second writer.
    for (const emission of core.mcpFor(TOOL)) rows.push(mcpRow(emission));
    return { outputs: rows, warnings: [...copilotMatcherWarnings(core.hooks.interchangeFor(TOOL)), ...displayNamePinWarnings(pins), "hook fallback [copilot]: sessionStart output is injected as additionalContext (docs.github.com hooks reference, 2026-09-17), so the learning/handoff index reaches the session. Hook timeouts remain fail-open; use native permission controls for mandatory enforcement."] };
  },
};

// ── Selection ────────────────────────────────────────────────────

/**
 * The rules, agents and commands this setup emits, in catalog walk order.
 *
 * Skills are absent by design — the core projects them once into
 * `.agents/skills/`, which Copilot reads directly. Three filters apply: the
 * catalog's own reachability (a contested id emits once, from the claimant
 * `byKey` resolves), the manifest's selection record (a floor artifact survives
 * a hand-edited manifest; a deselected one is dropped and reclaimed), and an
 * artifact's optional `tools:` restriction.
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
 * One resolver answers, rather than a roster lookup of this adapter's own
 * (`../roster/agentGrants.ts`): the in-process check at the delegation
 * boundary, the emitted policy document, the install preview and this file all
 * rule on the same inputs, so four clients cannot end up disagreeing about what
 * one agent may do. A shipped agent still resolves from its roster row and
 * emits byte-identically to the lookup this replaced.
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

// ── Builders ─────────────────────────────────────────────────────

/**
 * One rule as a path-scoped instruction file.
 *
 * `applyTo` takes a single glob string, patterns comma-separated — the joined
 * form is the dialect, not a formatting choice — and a rule with no globs
 * attaches to every file, because Copilot cannot pull a rule in by description
 * the way Cursor's agent-requested mode does. The rule's own trigger-phrased
 * `description` still ships, so the model can tell when the file is actually
 * relevant.
 */
export function buildInstructionsFile(
  item: CatalogItem,
  render: (raw: string) => string,
): AdapterOutput {
  const globs = declaredGlobs(item);
  const applyTo =
    globs.length === 0 ? APPLY_TO_EVERY_FILE : globs.join(APPLY_TO_SEPARATOR);
  return {
    path: `${INSTRUCTIONS_DIR}/${emittedId(item)}.instructions.md`,
    content: frontmatterDocument(
      [`applyTo: ${yamlScalar(applyTo)}`, `description: ${yamlScalar(render(item.description))}`],
      bodyOf(render(item.body)),
    ),
    owner: owner(item.id, item.type),
  };
}

/**
 * One agent as a repository-level custom agent.
 *
 * `target: github-copilot` routes the definition to the coding agent. The key
 * is emitted rather than left off deliberately: unset "defaults to both
 * environments", and this setup's agents are written for the cloud surface the
 * rest of this file emits for, so naming the target states the scope instead of
 * inheriting one. `include-custom-instructions: true` opts the agent into the
 * repository instruction files: a live sub-agent check on Copilot CLI 1.0.89
 * (2026-10-10) found that an agent dispatched through `task` without it loads
 * no `AGENTS.md`, so the charter, the invariants and the repo facts never reach
 * it (REQ-FLOW-071; the key since CLI 1.0.86, per its changelog). `tools:` is
 * always present (see the module header), the class's `model:` and `models:`
 * follow ({@link agentModelLines}), and `reasoning-effort:` closes the list at
 * that class's level (REQ-LADDER-004).
 *
 * The prompt is measured before the document is composed: the cap applies to
 * the markdown below the frontmatter, which is exactly what the platform
 * ingests — so a model key and a longer description cost the prompt nothing.
 */
export function buildAgentFile(
  item: CatalogItem,
  grant: ResolvedAgentGrant,
  render: (raw: string) => string,
  pins: ModelPinMap = {},
  efforts: EffortMap = {},
  listed?: readonly string[],
): AdapterOutput {
  const id = emittedId(item);
  const prompt = bodyOf(render(item.body));
  if (prompt.length > COPILOT_AGENT_PROMPT_CAP) {
    throw new EngineError(
      `Copilot agent "${id}" would emit a ${prompt.length}-character prompt, over the ` +
        `${COPILOT_AGENT_PROMPT_CAP}-character limit GitHub enforces on ` +
        `${AGENTS_DIR}/${id}.agent.md — the platform truncates or rejects it with no signal. ` +
        `Shorten the agent's canonical body, or move detail into a skill it can load on demand.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return {
    path: `${AGENTS_DIR}/${id}.agent.md`,
    content: frontmatterDocument(
      [
        `name: ${id}`,
        `description: ${yamlScalar(render(item.description))}`,
        "target: github-copilot",
        "include-custom-instructions: true",
        `tools: ${toCopilotToolsFrontmatter(grant.allow)}`,
        ...agentModelLines(item, pins, efforts, listed),
        ...effortLine(item, efforts),
      ],
      prompt,
    ),
    owner: owner(item.id, item.type),
  };
}

/**
 * One touchpoint command as a prompt file, reachable as `/st-<id>` — the
 * picker names a prompt by its filename unless the file overrides it, and the
 * emitted stem is the same one the charter's touchpoint list tells users about.
 *
 * `description` and, under an operator pin, `model` are all that is emitted.
 * The format also defines `agent` (the renamed `mode`) and a per-prompt
 * `tools:` list, and both stay off: they are per-prompt RESTRICTIONS whose
 * right value this engine does not have, and a guessed key reads as a
 * restriction that is not there. `model` is the one that changed hands — it is
 * an operator's declared answer rather than a guess whenever a pin exists for
 * the class the command declares, and stays absent otherwise, exactly as it
 * does on an agent file. `listed` is the account's saved model list, which
 * re-picks a pin the account lacks as it does for the agent files.
 */
export function buildPromptFile(
  item: CatalogItem,
  render: (raw: string) => string,
  pins: ModelPinMap = {},
  listed?: readonly string[],
): AdapterOutput {
  return {
    path: `${PROMPTS_DIR}/${emittedId(item)}.prompt.md`,
    content: frontmatterDocument(
      [`description: ${yamlScalar(render(item.description))}`, ...modelLine(item, pins, listed)],
      bodyOf(render(item.body)),
    ),
    owner: owner(item.id, item.type),
  };
}

/**
 * The cloud agent's entry rows: the entry when the work prompt it names is
 * planned, else none — an entry naming a deselected prompt would point at
 * nothing. An agent already planned at the entry's path (a pack agent with the
 * id `run`) is refused by name, rather than left to the composer's
 * two-contents refusal, which would name this adapter twice.
 */
export function runAgentRows(rows: readonly AdapterOutput[]): AdapterOutput[] {
  if (!rows.some((row) => row.path === WORK_PROMPT_PATH)) return [];
  if (rows.some((row) => row.path === COPILOT_RUN_AGENT_PATH)) {
    throw new EngineError(
      `An agent is planned at ${COPILOT_RUN_AGENT_PATH}, the path of Copilot's cloud entry agent. ` +
        `Rename the agent whose id is "run", or deselect it.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return [buildRunAgentFile()];
}

/**
 * The cloud agent's entry as a custom agent (REQ-FLOW-117, REQ-FLOW-118).
 *
 * A thin pointer, never the flow: it names {@link WORK_PROMPT_PATH} and the
 * plan the issue names, so the flow has one copy. `target` and
 * `include-custom-instructions` follow {@link buildAgentFile}'s reasons, the
 * charter reaching the session either way. `tools: ["*"]` is the custom-agents
 * reference's spelling for every available tool, the repository's MCP servers
 * included (its Tools section, read 2026-10-18 for this claim alone; unset
 * means the same): the entry runs the whole flow as the default agent would,
 * and no roster grant exists for it (Copilot's guards are identity-free).
 * `model:` is unset: the cloud agent picks its model when the task starts.
 *
 * The 59-minute session cap, `@copilot continue`, and the prompt-file rule are
 * vendor-documented and not run here, with no cloud-agent account.
 */
export function buildRunAgentFile(): AdapterOutput {
  const prompt = [
    "# Run a planned change",
    "",
    "A prompt file is not run by name on this agent, so this file is the entry point. It carries no copy of the flow.",
    "",
    `1. Read \`${WORK_PROMPT_PATH}\` whole and follow it as your instructions.`,
    "2. Read the plan file the issue names, and work it through that flow. An issue that names no plan is itself the request.",
    "3. When the run record reads `Mode: unattended`, follow the `st-unattended` skill as well.",
    "4. A session here stops at 59 minutes. Size each unit to one session, and commit and push a checkpoint " +
      "before about minute 45 (in an unattended run, through `stamity run checkpoint`). The next session starts " +
      "on a person's `@copilot continue` on the same pull request and resumes from the committed record.",
    "5. Where no sub-agent tool is available, run the flow's roles in line, one at a time in their order, " +
      "and the proof block says so.",
  ].join("\n");
  return {
    path: COPILOT_RUN_AGENT_PATH,
    content: frontmatterDocument(
      [
        "name: stamity-run",
        `description: ${yamlScalar(
          "Starts a planned stamity run on the cloud agent: reads the /st-work prompt file and the plan the issue names, then follows them.",
        )}`,
        "target: github-copilot",
        "include-custom-instructions: true",
        'tools: ["*"]',
      ],
      prompt,
    ),
    owner: owner("run", "agent"),
  };
}

/**
 * The `model:` line for a prompt file, or no line at all. Agents carry the
 * pick through {@link agentModelLines}; a prompt runs in the session, so it
 * takes a model only under an operator pin.
 *
 * Two conditions, both required. The artifact must DECLARE a ladder class —
 * `model_class:` frontmatter is where a role's sizing decision lives, and an
 * artifact that declares none has not asked for a model. And the operator must
 * have PINNED an id for that class: this client publishes no symbolic
 * vocabulary a class could map onto, so with no pin there is no honest value to
 * write and the key is dropped, letting the client apply its own default.
 *
 * Under a pin, the value is the one the agent files and the map carry for the
 * class ({@link classModels}): the pin passes through {@link idPins}, so a pin
 * typed as a display name writes no line here either and the warning that says
 * it is written nowhere stays true (ledger row 2026-10-14_cli-native/review/138);
 * and a pin the saved list lacks is replaced by the class's pick from it, kept
 * only when the list holds none of the class's candidates, and written as typed
 * when no list was saved (review/140). The pick never reaches a prompt with no
 * pin. Efforts are not passed: Copilot carries effort in a key of its own, so
 * the level never changes the model value or the pick.
 *
 * The value is quoted like every other scalar this file emits. An operator pin
 * is free text validated for shape only, so a value carrying `: ` would open a
 * second frontmatter key if it went out bare.
 */
function modelLine(item: CatalogItem, pins: ModelPinMap, listed: readonly string[] | undefined): string[] {
  const declared = item.frontmatter[MODEL_CLASS_FIELD];
  if (!isModelClass(declared)) return [];
  const pin = idPins(pins)[declared];
  if (pin === undefined || pin.trim() === "") return [];
  const { model } = classModels(declared, pins, {}, listed);
  return model === undefined ? [] : [`model: ${yamlScalar(model)}`];
}

/** One class's model on this client and its other candidates, as the agent files and the map carry them. */
interface ClassModels {
  /** The model the resolver answers: the pin, else the pick; absent when none resolves. */
  readonly model?: string;
  /** The class's other shipped candidates, on the saved list where there is one, in priority order. */
  readonly fallbacks: readonly string[];
}

/**
 * The class's model through the one resolver, with the pick
 * (REQ-LADDER-006): the operator's pin (re-picked when the saved list lacks
 * it), else the first shipped candidate the saved list holds, else the shipped
 * list's entry 0. The fallbacks are the pick's candidates without the model,
 * so a pinned class still lists the shipped ones behind the pin for a plan
 * that cannot access it. No Copilot candidate carries an effort variant, so the
 * pick reads no level.
 */
function classModels(
  modelClass: ModelClass,
  pins: ModelPinMap,
  efforts: EffortMap,
  listed: readonly string[] | undefined,
): ClassModels {
  const pick: ModelPickSource = listed === undefined ? {} : { listed };
  const model = resolveModelValue(modelClass, TOOL, idPins(pins), efforts, pick);
  const picked = pickModel(TOOL, modelClass, undefined, listed);
  const candidates = picked === undefined ? [] : [picked.id, ...picked.fallbacks];
  return {
    ...(model === undefined ? {} : { model }),
    fallbacks: candidates.filter((id) => id !== model),
  };
}

/**
 * A pin typed as a qualified display name, `<name> (<vendor>)`, the form VS
 * Code's `model:` takes. A CLI id carries no space and no parenthesis, so a
 * value ending on a parenthesised word after a space is a name, not an id.
 */
const DISPLAY_NAME_PIN = /\s\([^()]+\)$/;

/**
 * The pins that bind on this client: every one but a display-name pin
 * (ledger row 2026-10-14_cli-native/build/65). Such a pin is not written into
 * `models`, which takes CLI ids, nor moved to `model:`, which nothing is shown
 * to read on these `github-copilot` agents, nor into a prompt file's `model:`
 * ({@link modelLine}, review/138); its class takes the pick instead, and
 * {@link displayNamePinWarnings} says so.
 */
function idPins(pins: ModelPinMap): ModelPinMap {
  const kept: Partial<Record<ModelClass, string>> = {};
  for (const [modelClass, pin] of Object.entries(pins)) {
    if (isModelClass(modelClass) && pin !== undefined && !DISPLAY_NAME_PIN.test(pin.trim())) kept[modelClass] = pin;
  }
  return kept;
}

/**
 * One warning per class whose Copilot pin is a display name, naming the class,
 * the value and what a pin takes.
 *
 * The pin is the manifest's text, which validation refuses only a line break
 * in, and `sync` prints warnings to the terminal as they are. So it is printed
 * through {@link printableName}, the adapter-layer twin of the
 * `sanitizeLabel` form `check`'s model-pins row prints the same value in:
 * tabs become spaces and every control, bidi, tag and default-ignorable code
 * point is dropped, so no escape sequence reaches the operator's terminal
 * (ledger row 2026-10-14_cli-native/review/114).
 */
function displayNamePinWarnings(pins: ModelPinMap): string[] {
  const lines: string[] = [];
  for (const { modelClass } of MODEL_LADDER) {
    const pin = pins[modelClass];
    if (pin === undefined || !DISPLAY_NAME_PIN.test(pin.trim())) continue;
    lines.push(
      `model pin [copilot]: ${modelClass} is pinned to "${printableName(pin.trim())}", a display name; Copilot pins take ` +
        `model ids (such as ${MODEL_PRIORITY.copilot[modelClass][0]?.id ?? "a listed id"}), so the pin is not ` +
        `written and ${modelClass} takes the pick from the account's model list. Set an id with ` +
        `\`stamity config set model.${modelClass}.copilot <id>\`.`,
    );
  }
  return lines;
}

/** The display name the shipped list gives a Copilot model id, from any class, or `undefined`. */
function displayName(id: string): string | undefined {
  for (const candidates of Object.values(MODEL_PRIORITY.copilot)) {
    const display = candidates.find((candidate) => candidate.id === id)?.display;
    if (display !== undefined) return display;
  }
  return undefined;
}

/**
 * The `model:` and `models:` lines for an agent, or no line at all
 * (REQ-LADDER-007).
 *
 * Two keys, in the two shapes the vendors document. The CLI reference says the
 * CLI reads `models`, CLI ids in priority order, uses the first one the plan
 * can access and overrides `model` with it; VS Code's custom-agents page gives
 * `model` as the qualified display name, `<name> (copilot)`. So `models`
 * carries the class's model first and its other candidates behind it, and
 * `model` carries the first one's display name — only where the shipped list
 * gives one, since an id is not a display name. Whether VS Code reads `model`
 * on these agents is unverified: every one sets `target: github-copilot`, and
 * the line is kept because it is harmless where nothing reads it. No live run
 * has loaded either key yet. `modelPolicy` is never written: its `required`
 * value would lock out the operator's own `/subagents` override. A pin typed
 * as a display name binds nowhere and is dropped ({@link idPins}).
 *
 * An artifact that declares no class, or a class off the ladder, has asked for
 * no model. Every value is quoted like every other scalar this file emits: a
 * pin is free text validated for shape only, so a value carrying `: ` would
 * open a second frontmatter key if it went out bare.
 */
function agentModelLines(
  item: CatalogItem,
  pins: ModelPinMap,
  efforts: EffortMap,
  listed: readonly string[] | undefined,
): string[] {
  const declared = item.frontmatter[MODEL_CLASS_FIELD];
  if (!isModelClass(declared)) return [];
  const { model, fallbacks } = classModels(declared, pins, efforts, listed);
  if (model === undefined) return [];
  const display = displayName(model);
  return [
    ...(display === undefined ? [] : [`model: ${yamlScalar(`${display} (copilot)`)}`]),
    `models: [${[model, ...fallbacks].map((id) => yamlScalar(id)).join(", ")}]`,
  ];
}

/** A pin the account's saved list lacked, as the manifest holds it, and the model its class took instead. */
export interface PinReplacement {
  pin: string;
  by: string;
}

/**
 * The record a class's map entry carries when the operator's id `pin` did not
 * bind because the saved list `listed` lacked it and the class took `model`
 * instead (review/118). A checkout with no list of its own reads it
 * (`../cli/engine/clientModels.ts`) to keep that pick, where a pin with no
 * record reads as an unsynced edit. None where the pin bound, where no list
 * was read, where a re-pick found nothing on the list and kept the pin, or for
 * a display-name pin, which binds nowhere ({@link idPins}).
 */
function pinReplacement(
  pin: string | undefined,
  model: string | undefined,
  listed: readonly string[] | undefined,
): PinReplacement | undefined {
  if (pin === undefined || pin.trim() === "" || model === undefined || listed === undefined) return undefined;
  return listHoldsPin(listed, pin) || model === pin.trim() ? undefined : { pin, by: model };
}

/** `.stamity/generated/models/copilot.json`: every ladder class's model, and each emitted role's class. */
export interface CopilotModelMap {
  classes: Record<ModelClass, { model?: string; fallbacks: string[]; pinReplaced?: PinReplacement }>;
  roles: Record<string, ModelClass>;
}

/**
 * The class-to-model map (REQ-LADDER-007) the touchpoints read to pass
 * `model` on a sub-agent call. Every ladder class is present in the ladder's
 * order, `frontier` included although no agent file declares it, because a
 * flow escalates a role to it on the call; each holds the CLI id the agent
 * files put first in `models` and the candidates behind it, and `pinReplaced`
 * where the saved list lacked the class's pin ({@link pinReplacement}).
 * `roles` maps each emitted agent's runtime id to its declared class, sorted
 * by id so the bytes are stable.
 */
export function buildCopilotModelMap(
  roles: Readonly<Partial<Record<string, ModelClass>>>,
  pins: ModelPinMap = {},
  efforts: EffortMap = {},
  listed?: readonly string[],
): CopilotModelMap {
  const classes = {} as CopilotModelMap["classes"];
  const bound = idPins(pins);
  for (const { modelClass } of MODEL_LADDER) {
    const { model, fallbacks } = classModels(modelClass, pins, efforts, listed);
    const replaced = pinReplacement(bound[modelClass], model, listed);
    classes[modelClass] = {
      ...(model === undefined ? {} : { model }),
      fallbacks: [...fallbacks],
      ...(replaced === undefined ? {} : { pinReplaced: replaced }),
    };
  }
  const sorted: Record<string, ModelClass> = {};
  for (const id of Object.keys(roles).toSorted()) {
    const modelClass = roles[id];
    if (modelClass !== undefined) sorted[id] = modelClass;
  }
  return { classes, roles: sorted };
}

/**
 * The `reasoning-effort:` line for an agent, or no line at all.
 *
 * The level is the declared class's, operator override first, narrowed to this
 * client's scale by the ladder (`../roster/modelLadder.ts`); an agent that
 * declares no class, or one off the ladder, has asked for none. Unlike the
 * model line it needs no pin: the level is a property of the class. Written
 * bare, as this file's other fixed-vocabulary values are: the resolver answers
 * only a level of the scale, never operator free text. Prompt files carry
 * none, since a prompt runs in the session at the session's own effort.
 */
function effortLine(item: CatalogItem, efforts: EffortMap): string[] {
  const declared = item.frontmatter[MODEL_CLASS_FIELD];
  if (typeof declared !== "string") return [];
  const level = resolveEffortValue(declared, TOOL, efforts);
  return EFFORT_KEY === null || level === undefined ? [] : [`${EFFORT_KEY}: ${level}`];
}

/**
 * The coding agent's setup workflow: checkout, Node, then the dependency
 * install this repository's own package manager performs.
 *
 * Node is installed in every repository (REQ-FLOW-022): the hooks this engine
 * writes for Copilot (`.github/hooks/stamity.json`) run on `node`, whatever
 * the project itself is written in, and the agent's machine is not promised one.
 *
 * The install step has two lanes, decided by evidence rather than by
 * assumption. A lockfile, a Corepack pin, or a persisted JavaScript/TypeScript
 * language selects the Node lane and its exact install command — `npm ci` and
 * its equivalents need a lockfile, so their frozen forms are emitted only when
 * one is actually there. With no Node evidence at all no install step is
 * written, and a comment names what WAS detected: a fabricated install step
 * for a stack the engine cannot see would fail on the first agent run.
 *
 * The project's own pins decide the versions ({@link readSetupStepsPins}): the
 * Node version from `.nvmrc`, `.node-version` or `engines.node`, and each
 * action's ref from the first workflow of the project's own that uses it — a
 * SHA pin with its trailing comment included. Where the project names none,
 * an action is referenced by its major tag ({@link DEFAULT_ACTION_REFS}) and
 * Node by the current LTS. A full-length commit SHA is the stronger
 * supply-chain posture, and the emitted
 * comment says so — but a SHA this engine cannot verify would be a fabricated
 * pin, which is worse than an honest tag.
 *
 * `check` re-plans live, so a project that moves one of its own pins sees this
 * file reported as drifted until the next sync copies the new pin.
 *
 * With `cli` — the planner always passes it — the last steps install the pinned
 * CLI globally, in both lanes ({@link pinnedCliInstall}), and run
 * `stamity --version`, so the flows' `gate scan` and `ledger status` find
 * `stamity` on `PATH` with no registry fetch
 * (REQ-FLOW-111). A package with no npm channel gets a comment instead of the
 * install. Without `cli` no CLI step is written, which is what the direct calls
 * that pin the lanes alone rely on.
 */
export function buildSetupSteps(
  packageManager: PackageManagerInfo,
  languages: readonly string[],
  pins: SetupStepsPins,
  cli?: CliCallContext,
): string {
  const named = [...languages].map((value) => value.trim()).filter((value) => value !== "");
  const isNode =
    packageManager.lockfile !== null ||
    packageManager.fromPackageJsonField ||
    named.some((language) => NODE_LANGUAGES.has(language.toLowerCase()));

  const steps = isNode
    ? nodeSteps(packageManager, pins)
    : [
        ...setupNodeStep(pins),
        "      # No Node toolchain was detected for this repository " +
          `(detected: ${named.length === 0 ? "nothing" : named.join(", ")}).`,
        "      # Node is here for the generated hooks; this file installs no dependencies for that stack.",
      ];
  const copied = [pins.checkout, pins.setupNode].flatMap((pin) => (pin === null ? [] : [pin.source]));
  // Every action the project does not pin itself keeps the SHA-pin advice
  // (review/96), so a file whose checkout is SHA-pinned still says its
  // tag-referenced setup-node could be pinned too.
  const tagged = (
    [
      ["actions/checkout", pins.checkout],
      ["actions/setup-node", pins.setupNode],
    ] as const
  ).flatMap(([name, pin]) => (pin === null ? [name] : []));
  const refNote =
    copied.length === 0
      ? ["      # Pin these to a full-length commit SHA for a stricter supply-chain posture."]
      : [
          `      # Action refs follow this project's own workflows (${[...new Set(copied)].join(", ")}) ` +
            "where they use the action, else a major tag; each sync re-reads them.",
          ...(tagged.length === 0
            ? []
            : [
                `      # ${tagged.join(" and ")} ${tagged.length === 1 ? "is" : "are"} at a major tag: ` +
                  `pin ${tagged.length === 1 ? "it" : "them"} to a full-length commit SHA for a stricter supply-chain posture.`,
              ]),
        ];

  return [
    "name: Copilot Setup Steps",
    "",
    "# Prepares the environment the GitHub Copilot coding agent works in. The agent runs",
    `# the job named \`${SETUP_STEPS_JOB}\` below and nothing else in this file.`,
    "# Generated — edits are overwritten on the next sync.",
    "",
    "on:",
    "  workflow_dispatch:",
    "  push:",
    "    paths:",
    `      - ${COPILOT_SETUP_STEPS_PATH}`,
    "  pull_request:",
    "    paths:",
    `      - ${COPILOT_SETUP_STEPS_PATH}`,
    "",
    "jobs:",
    `  ${SETUP_STEPS_JOB}:`,
    "    runs-on: ubuntu-latest",
    "    # The platform accepts at most 59 here; a stuck install stops at this bound.",
    `    timeout-minutes: ${SETUP_STEPS_TIMEOUT_MINUTES}`,
    "    permissions:",
    "      contents: read",
    "    steps:",
    ...refNote,
    `      - uses: ${actionUse("checkout", pins.checkout)}`,
    ...steps,
    ...(cli === undefined ? [] : cliSteps(cli)),
    "",
  ].join("\n");
}

/**
 * The pinned CLI's steps: its global install and the proof that `stamity`
 * resolves, or, for a package with no npm channel, a comment saying why there
 * is no install.
 */
function cliSteps(cli: CliCallContext): string[] {
  const install = pinnedCliInstall(cli);
  if (install === null) {
    return [
      "      # This package has no npm channel, so no CLI is installed from a registry here: the flows'",
      "      # `npx --no` calls run a copy the project installs, and `gate scan` and `ledger status` stop without one.",
    ];
  }
  return [
    "      # The pinned stamity CLI, at the version this file was generated with: the flows'",
    "      # `gate scan` and `ledger status` then find `stamity` on PATH with no registry fetch.",
    `      - run: ${install}`,
    "      - run: stamity --version",
  ];
}

/**
 * The global install of the pinned CLI — `npm install --global <package>@<version>`,
 * the scope's registry setting ahead of the spec where the package names one —
 * or `null` for a package with no npm channel, whose name no registry may be
 * asked for (`npx --no`, `docs/enterprise-forks.md`).
 *
 * Built from {@link pinnedCliPrefix}, the verbless form of the
 * {@link pinnedCliCall} every hook entry and body runs: its words after
 * `npx -y` are exactly npm's install arguments, so the install names the one
 * package, version and registry those calls name, validated by the one rule
 * (`VALIDATION_ERROR` on an unrunnable name, an unpinned version or a registry
 * outside the plain-https grammar). Global, because a repository with no
 * `package.json` has no project to install into, and because the bodies try
 * `npx --no stamity <verb>` first, which npm answers from a global bin without
 * asking a registry. `check`'s `cloud-install` row prints the same line for a
 * Cursor environment.
 */
export function pinnedCliInstall(cli: CliCallContext): string | null {
  if (cli.npmChannel === false) return null;
  const words = pinnedCliPrefix(cli.packageName, cli.version, cli).split(" ");
  return ["npm", "install", "--global", ...words.slice(2)].join(" ");
}

/** The `setup-node` step every lane writes: the project's Node pin, else the current LTS. */
function setupNodeStep(pins: SetupStepsPins): string[] {
  return [
    `      - uses: ${actionUse("setup-node", pins.setupNode)}`,
    "        with:",
    pins.node === null
      ? `          # No ${NODE_PIN_FILES.join(", ")} or engines.node pin was found, so the current LTS.`
      : `          # From this project's ${pins.node.source}; each sync re-reads it.`,
    `          node-version: "${pins.node?.version ?? "lts/*"}"`,
  ];
}

/** The Node lane's steps: toolchain setup, Corepack where the manager needs it, install. */
function nodeSteps(packageManager: PackageManagerInfo, pins: SetupStepsPins): string[] {
  const lines = setupNodeStep(pins);
  if (packageManager.name === "pnpm" || packageManager.name === "yarn") {
    // Corepack ships with Node and provisions both; bun is not a Corepack manager.
    lines.push("      - run: corepack enable");
  }
  if (packageManager.name === "bun") {
    lines.push("      # bun is not preinstalled on GitHub-hosted runners — add its setup step here.");
  }
  lines.push(`      - run: ${installCommand(packageManager)}`);
  return lines;
}

/**
 * The major tag each action is used at when the project's own workflows name
 * none: GitHub's current majors, `actions/checkout@v6` and
 * `actions/setup-node@v7` (the plan's decision D16, 2026-10-14). Per action,
 * because the two release their majors apart.
 */
const DEFAULT_ACTION_REFS: Readonly<Record<"checkout" | "setup-node", string>> = Object.freeze({
  checkout: "v6",
  "setup-node": "v7",
});

/** `actions/<name>@<ref>`, with a copied pin's trailing comment kept. */
function actionUse(name: "checkout" | "setup-node", pin: ActionPin | null): string {
  if (pin === null) return `actions/${name}@${DEFAULT_ACTION_REFS[name]}`;
  return `actions/${name}@${pin.ref}${pin.comment === null ? "" : ` # ${pin.comment}`}`;
}

/** One action ref copied from the project's own workflows. */
export interface ActionPin {
  /** The ref after `@`: a tag, a branch or a commit SHA. */
  readonly ref: string;
  /** The text after `#` on the same line (a SHA pin's version note), or `null`. */
  readonly comment: string | null;
  /** The repo-relative workflow the ref was copied from. */
  readonly source: string;
}

/** What the setup workflow copies from the project's own configuration. */
export interface SetupStepsPins {
  /** The Node version and the file it came from; `null` renders `lts/*`. */
  readonly node: { readonly version: string; readonly source: string } | null;
  /** The `actions/checkout` ref; `null` renders the major tag. */
  readonly checkout: ActionPin | null;
  /** The `actions/setup-node` ref; `null` renders the major tag. */
  readonly setupNode: ActionPin | null;
}

/** No project pins: every value at its default. */
export const NO_SETUP_STEPS_PINS: SetupStepsPins = { node: null, checkout: null, setupNode: null };

/** The version files read before `engines.node`, in precedence order. */
const NODE_PIN_FILES = [".nvmrc", ".node-version"] as const;

/** The directory GitHub reads workflows from; only its immediate files count. */
const WORKFLOWS_DIR = ".github/workflows";

/**
 * A value safe to write into the quoted `node-version` scalar: a version, a
 * partial one, an alias such as `lts/iron` or `node`. Anything else (a quote,
 * a space, a second line) is not copied.
 */
const NODE_VERSION_VALUE = /^[A-Za-z0-9.*/_+-]{1,40}$/u;

/**
 * A `uses:` line naming checkout or setup-node, quoted or not, with its ref
 * and an optional trailing comment.
 */
const ACTION_USE_LINE =
  /^\s*(?:-\s+)?uses:\s*(["']?)actions\/(checkout|setup-node)@([A-Za-z0-9._/-]{1,100})\1\s*(?:#\s*([^\r\n]*?))?\s*$/u;

/**
 * Read the project's own pins for the setup workflow. Every read is tolerant: a
 * missing or unreadable file answers "no pin", never an error, so a repository
 * with none of these files gets the defaults.
 *
 * The workflow scan skips the file this adapter emits
 * ({@link COPILOT_SETUP_STEPS_PATH}), so the emission never reads its own
 * output and a second sync writes the same bytes. Files are read in name order
 * and lines in file order; the first `uses:` of each action wins.
 */
export async function readSetupStepsPins(rootDir: string): Promise<SetupStepsPins> {
  const [node, actions] = await Promise.all([readNodePin(rootDir), readActionPins(rootDir)]);
  return { node, ...actions };
}

/** `.nvmrc`, then `.node-version`, then `engines.node`'s floor. */
async function readNodePin(
  rootDir: string,
): Promise<{ version: string; source: string } | null> {
  for (const file of NODE_PIN_FILES) {
    // oxlint-disable-next-line no-await-in-loop -- precedence order: the first file present wins
    const text = await readTextOrNull(join(rootDir, file));
    const first = text?.split(/\r?\n/u).map((line) => line.trim()).find((line) => line !== "");
    if (first !== undefined && NODE_VERSION_VALUE.test(first)) return { version: first, source: file };
  }
  const manifest = await readTextOrNull(join(rootDir, "package.json"));
  if (manifest === null) return null;
  let engines: unknown;
  try {
    engines = (JSON.parse(manifest) as { engines?: unknown }).engines;
  } catch {
    return null;
  }
  const range =
    typeof engines === "object" && engines !== null
      ? (engines as Record<string, unknown>)["node"]
      : undefined;
  if (typeof range !== "string") return null;
  const floor = engineRangeFloor(range);
  return floor === null ? null : { version: floor, source: "package.json engines.node" };
}

/**
 * The lower bound an `engines.node` range names, at the precision it names it:
 * `22` stays `22`, `>=22.12` gives `22.12`, `^20.11.0` gives `20.11.0`,
 * `22.x` gives `22`. Only the first `||` alternative is read, and a range
 * with no lower bound (`<23`, `*`) or a strict one (`>22`) names none, so
 * the workflow keeps the LTS default rather than guessing.
 */
export function engineRangeFloor(range: string): string | null {
  const first = (range.split("||")[0] ?? "").trim().replace(/^(>=|\^|~|=)\s+/u, "$1");
  const comparator = first.split(/\s+/u)[0] ?? "";
  const match = /^(?:>=|\^|~|=)?v?(\d+(?:\.\d+){0,2})(?:\.[xX*])*$/u.exec(comparator);
  return match?.[1] ?? null;
}

/** The first `actions/checkout` and `actions/setup-node` refs in the project's own workflows. */
async function readActionPins(
  rootDir: string,
): Promise<{ checkout: ActionPin | null; setupNode: ActionPin | null }> {
  const found: { checkout: ActionPin | null; setupNode: ActionPin | null } = {
    checkout: null,
    setupNode: null,
  };
  let names: string[];
  try {
    const entries = await readdir(join(rootDir, WORKFLOWS_DIR), { withFileTypes: true });
    names = entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/iu.test(entry.name))
      .map((entry) => entry.name)
      .filter((name) => name !== basename(COPILOT_SETUP_STEPS_PATH))
      .toSorted();
  } catch {
    return found;
  }
  const texts = await Promise.all(
    names.map(async (name) => ({
      source: `${WORKFLOWS_DIR}/${name}`,
      text: await readTextOrNull(join(rootDir, WORKFLOWS_DIR, name)),
    })),
  );
  for (const { source, text } of texts) {
    for (const line of text?.split(/\r?\n/u) ?? []) {
      const match = ACTION_USE_LINE.exec(line);
      if (match === null) continue;
      const pin: ActionPin = { ref: match[3] ?? "", comment: match[4] || null, source };
      if (match[2] === "checkout") found.checkout ??= pin;
      else found.setupNode ??= pin;
    }
  }
  return found;
}

/** A file's text, or `null` when it is absent or unreadable. */
async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The install command for one manager. A frozen-lockfile form is emitted only
 * when the lockfile exists — `npm ci` fails outright without one, so guessing
 * it would trade a reproducible install for a broken workflow.
 */
function installCommand(packageManager: PackageManagerInfo): string {
  const frozen = packageManager.lockfile !== null;
  switch (packageManager.name) {
    case "npm":
      return frozen ? "npm ci" : "npm install";
    case "pnpm":
      return frozen ? "pnpm install --frozen-lockfile" : "pnpm install";
    case "bun":
      return frozen ? "bun install --frozen-lockfile" : "bun install";
    case "yarn":
      // Plain `install` is the one spelling both Yarn Classic and Berry accept;
      // Berry is immutable in CI by default, so the frozen intent survives.
      return "yarn install";
  }
}

/** One MCP document the core planned, carried through with a per-dialect ledger id. */
function mcpRow(emission: McpEmission): AdapterOutput {
  return {
    path: emission.path,
    content: emission.content,
    owner: owner(`mcp-${emission.dialect}`, "infra"),
  };
}

// ── Shared rendering ─────────────────────────────────────────────

/**
 * The body transform every emitted artifact goes through: repo detection facts,
 * verification-gate commands, the pinned CLI call, then the platform ask-user marker resolved for
 * THIS client (the one substitution a once-emitted core file cannot make).
 *
 * The gate pass is not optional. Agent and command bodies carry
 * `${STAMITY:VERIFY_GATE_*}` tokens, and emitting one raw would hand the model a
 * broken template variable where a runnable command belongs.
 *
 * Frontmatter descriptions go through the same transform as bodies. Tokens
 * resolve on the way OUT to an adapter's output (`src/emit/substitution.ts`),
 * and a description is part of that output — a leaked token there would be no
 * less broken for sitting above the fence, and {@link yamlScalar} collapses
 * whatever the substitution inserts back onto one line.
 */
function bodyRenderer(ctx: EmissionContext): (raw: string) => string {
  const detection = detectionContextFromManifest(ctx.manifest);
  const gates = verificationGatesFromManifest(ctx.manifest);
  const cli = cliCallContextOf(ctx);
  return (raw) =>
    substituteCanonicalPlatformMarker(
      substituteCliTokens(
        substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
        cli,
      ),
      TOOL,
    );
}

/**
 * Declared globs as a de-duplicated list, from either authoring shape — a YAML
 * list, or one comma-separated string. Anything else reads as no scope at all
 * rather than throwing: a malformed `globs:` is the cursor companion
 * generator's defect to report, and this adapter's fallback (`applyTo: "**"`)
 * over-attaches rather than dropping the rule from the setup.
 *
 * The extraction itself is {@link declaredRuleGlobs} (`../content/
 * ruleDelivery.ts`), the shared reader; only the de-duplication is local to
 * this adapter's own `applyTo` rendering.
 */
function declaredGlobs(item: CatalogItem): string[] {
  return [...new Set(declaredRuleGlobs(item))];
}

/**
 * The emitted filename stem and, for agents, the runtime id: the artifact's id
 * with the catalog's command namespacing removed and the filename prefix its
 * class earns restored. Copilot addresses an agent by the name in its path, and
 * the tool-policy roster keys on that same prefixed form, so the two agree by
 * construction.
 *
 * {@link emittedIdFor} owns the whole answer — `st-` for the invocable commands
 * and skills, `stamity-` for agents and rules, with an installed pack's
 * artifacts answering to the same class rule as the corpus's. This is a named
 * alias for it, so the adapters cannot disagree about one artifact's name.
 */
function emittedId(item: CatalogItem): string {
  return emittedIdFor(item);
}

/** Ledger attribution — every row this adapter returns is owned by `copilot`. */
function owner(artifactId: string, artifactType: ContentClass | "infra"): EmissionOwner {
  return { adapter: TOOL, artifactId, artifactType };
}

/**
 * Frontmatter over a body: fenced head, one blank line, body, one trailing
 * newline. Copilot parses frontmatter at byte 0 only, so the fence opens the
 * file with nothing before it.
 */
function frontmatterDocument(lines: readonly string[], body: string): string {
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`;
}

/** A rendered body with its surrounding blank lines removed — the emitted slice. */
function bodyOf(rendered: string): string {
  return rendered.replace(/^(?:[ \t]*\r?\n)+/, "").replace(/(?:\r?\n[ \t]*)+$/, "");
}

/**
 * A frontmatter value as a double-quoted YAML scalar.
 *
 * Always quoted, never conditionally: descriptions routinely carry `: ` and
 * glob strings carry `*`, `[`, and `{`, each of which changes how a plain
 * scalar parses. Line breaks collapse to spaces first — a value that escaped
 * its own line would append whatever followed as a frontmatter key. JSON's
 * escaping is a valid YAML double-quoted scalar, so an embedded quote or
 * backslash survives as itself.
 */
function yamlScalar(value: string): string {
  return JSON.stringify(value.replace(/\s*[\r\n]+\s*/g, " ").trim());
}

/**
 * Canonical event → the camelCase event name this client keys
 * `.github/hooks/*.json` by (REQ-FLOW-086).
 *
 * The event name's CASING selects the PAYLOAD FORMAT, not a cosmetic spelling:
 * a camelCase name delivers camelCase payload fields (`toolName`, `toolArgs`,
 * `sessionId`), while the PascalCase alias delivers the VS Code compatible
 * format (hooks reference, casing re-read 2026-09-20). Every example for
 * Copilot's cloud agent is camelCase, and that agent reads no
 * `.claude/settings.json` hooks (the plan's decision D16, 2026-10-14), so the
 * camelCase keys are the ones that reach it. Two names are not the mechanical
 * rename: the prompt event is `userPromptSubmitted` and the end of the
 * agent's turn is `agentStop`.
 *
 * The portable runner turns the camelCase payload back into the interchange's
 * keys before any script reads it: `session_id`, `tool_name`, `tool_input`
 * (with `filePath` also given as `file_path`), and `hook_event_name` in its
 * PascalCase spelling; `transcriptPath`, `stopReason`, `initialPrompt` and
 * `toolResult` are also given as `transcript_path`, `stop_reason`,
 * `initial_prompt` and `tool_result` (review/133). The Claude tool name is restored only for the tools
 * {@link COPILOT_RUNTIME_TOOL_NAMES} lists, and the input stays Copilot's own.
 * `apply_patch` keeps its name and its patch text (review/94), so a path guard
 * written for Claude's `Edit` and `Write` must also name it here
 * ({@link copilotMatcherWarnings} says so).
 *
 * A literal table, as `CLAUDE_EVENT_NAMES` and Cursor's `EVENT_RENAME` are,
 * so a canonical rename cannot silently change what gets emitted.
 */
export const COPILOT_EVENT_NAMES: Readonly<Record<CanonicalHookEvent, string>> = Object.freeze({
  session_start: "sessionStart",
  pre_tool_use: "preToolUse",
  post_tool_use: "postToolUse",
  user_prompt_submit: "userPromptSubmitted",
  stop: "agentStop",
  session_end: "sessionEnd",
});

/**
 * Claude names a matcher may use that the runner never hands a hook, each with
 * the name it does hand: `Task`, Claude Code's earlier name for its spawn tool,
 * which the guard still places beside `Agent` (`../tools/translator.ts`). A
 * matcher on `Task` therefore matches Copilot's `task`, whose hook then reads
 * `Agent` (build/58).
 */
const CLAUDE_MATCHER_ALIASES: Readonly<Record<string, string>> = Object.freeze({ Task: "Agent" });

/**
 * Claude tool name → the Copilot runtime names it stands for: the inverse of
 * the runner's {@link COPILOT_RUNTIME_TOOL_NAMES}, so the matcher a hook is
 * keyed by and the `tool_name` it then reads come from one table, plus
 * {@link CLAUDE_MATCHER_ALIASES}.
 */
const COPILOT_MATCHER_NAMES: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [runtime, claude] of Object.entries(COPILOT_RUNTIME_TOOL_NAMES)) {
    map.set(claude, [...(map.get(claude) ?? []), runtime]);
  }
  for (const [alias, claude] of Object.entries(CLAUDE_MATCHER_ALIASES)) map.set(alias, map.get(claude) ?? []);
  return map;
})();

/**
 * The runtime names an author may already have written: the table's, plus
 * `apply_patch`, which reaches a hook under its own name (review/94).
 */
const COPILOT_RUNTIME_NAMES: ReadonlySet<string> = new Set([...Object.keys(COPILOT_RUNTIME_TOOL_NAMES), "apply_patch"]);

/** Claude's two single-file write tools, whose path guards Copilot's `apply_patch` slips past. */
const PATH_GUARDED_TOOLS: ReadonlySet<string> = new Set(["Edit", "Write"]);

/** A top-level alternative that is a plain tool name: the characters a tool or MCP name uses, no regex syntax. */
const PLAIN_TOOL_NAME = /^[A-Za-z_][\w-]*$/u;

/**
 * Walk a regular expression's source, skipping escaped characters and
 * character classes, and hand each other character to `visit` with the group
 * depth after it. False when the parentheses or a class do not balance, or
 * when `visit` stops the walk by answering `false`.
 */
function walkRegex(source: string, visit: (char: string, index: number, depth: number) => boolean | void): boolean {
  let depth = 0;
  let inClass = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")" && --depth < 0) return false;
    if (visit(char, index, depth) === false) return false;
  }
  return depth === 0 && !inClass;
}

/**
 * A matcher's parts (M-1 of the fix round, signed off): an optional `^`, an
 * optional group wrapping the whole rest (`(` or `(?:`, closed by its last
 * character), the top-level `|`-alternatives inside it, and an optional `$`.
 * `null` when the source does not balance, so it is kept whole.
 */
function matcherParts(matcher: string): { anchor: string; open: string | null; alternatives: string[]; end: string } | null {
  const anchor = matcher.startsWith("^") ? "^" : "";
  let body = matcher.slice(anchor.length);
  const end = body.endsWith("$") && !body.endsWith("\\$") ? "$" : "";
  body = body.slice(0, body.length - end.length);
  const prefix = body.startsWith("(?:") ? "(?:" : body.startsWith("(") && !body.startsWith("(?") ? "(" : null;
  let open: string | null = null;
  if (prefix !== null) {
    let close = -1;
    walkRegex(body, (char, index, depth) => {
      if (char === ")" && depth === 0) {
        close = index;
        return false;
      }
      return undefined;
    });
    if (close === body.length - 1) {
      open = prefix;
      body = body.slice(prefix.length, -1);
    }
  }
  const alternatives: string[] = [];
  let from = 0;
  const balanced = walkRegex(body, (char, index, depth) => {
    if (char === "|" && depth === 0) {
      alternatives.push(body.slice(from, index));
      from = index + 1;
    }
  });
  if (!balanced) return null;
  alternatives.push(body.slice(from));
  return { anchor, open, alternatives, end };
}

/** An authored matcher in Copilot's runtime vocabulary; see {@link translateCopilotMatcher}. */
export interface CopilotMatcher {
  /** The matcher Copilot is given. */
  readonly matcher: string;
  /** Plain-name alternatives that are neither a Claude name with a runtime twin nor a runtime name. */
  readonly untranslated: string[];
  /** The Claude names that were translated, in matcher order. */
  readonly claudeNames: string[];
}

/**
 * An authored matcher in Copilot's runtime vocabulary (REQ-FLOW-086).
 *
 * The matcher is a regular expression, read as its top-level alternatives,
 * with an anchor at either end and one group wrapping the rest kept
 * ({@link matcherParts}; review/97 and the round's M-1 sign-off). Each
 * alternative that is a plain tool name is translated: a Claude tool name
 * becomes the runtime names it stands for (`^(Bash|Edit)$` →
 * `^(bash|edit|str_replace_editor)$`), a runtime name passes unchanged, and
 * any other name is kept in place and returned in `untranslated`. Every other
 * alternative (`mcp__.*`, a nested group, a class) is kept exactly as written,
 * so `Bash|mcp__.*` → `bash|mcp__.*`. A source that does not balance is kept
 * whole.
 */
export function translateCopilotMatcher(matcher: string): CopilotMatcher {
  const parts = matcherParts(matcher);
  if (parts === null) return { matcher, untranslated: [], claudeNames: [] };
  const { anchor, open, end } = parts;
  const names: string[] = [];
  const untranslated: string[] = [];
  const claudeNames: string[] = [];
  for (const alternative of parts.alternatives) {
    const runtime = PLAIN_TOOL_NAME.test(alternative) ? COPILOT_MATCHER_NAMES.get(alternative) : undefined;
    if (runtime !== undefined) {
      names.push(...runtime);
      claudeNames.push(alternative);
    } else {
      names.push(alternative);
      if (PLAIN_TOOL_NAME.test(alternative) && !COPILOT_RUNTIME_NAMES.has(alternative)) untranslated.push(alternative);
    }
  }
  const list = [...new Set(names)].join("|");
  return {
    matcher: `${anchor}${open === null ? list : `${open}${list})`}${end}`,
    untranslated: [...new Set(untranslated)],
    claudeNames: [...new Set(claudeNames)],
  };
}

/**
 * What `init` and `sync` say about the authored matchers on this client,
 * each matcher quoted whole through `JSON.stringify`, never as fragments:
 *
 * - one line per distinct matcher with a plain-name alternative that has no
 *   runtime twin, kept as written (build/57, review/97, the round's M-1);
 * - one line, once, when a matcher names `Edit` or `Write` without
 *   `apply_patch`: Copilot also edits files through `apply_patch`, which
 *   reaches the hook under its own name with patch text and no `file_path`,
 *   so a path guard there must name it as well (review/94).
 */
export function copilotMatcherWarnings(rows: readonly HookInterchange[]): string[] {
  const untranslated = new Set<string>();
  const pathGuards = new Set<string>();
  for (const row of rows) {
    if (row.matcher === undefined) continue;
    const read = translateCopilotMatcher(row.matcher);
    if (read.untranslated.length > 0) untranslated.add(row.matcher);
    // No Claude name translates to apply_patch, so a matcher covers it only by naming it.
    const namesPatch = matcherParts(row.matcher)?.alternatives.includes("apply_patch") ?? false;
    if (read.claudeNames.some((name) => PATH_GUARDED_TOOLS.has(name)) && !namesPatch) pathGuards.add(row.matcher);
  }
  const lines = [...untranslated].map(
    (matcher) =>
      `hook matcher [copilot]: ${JSON.stringify(matcher)} names a tool with no Copilot runtime name, which is kept as written and may match no call there.`,
  );
  if (pathGuards.size > 0) {
    lines.push(
      "hook matcher [copilot]: Copilot also edits files through apply_patch, which reaches a hook under that name with its " +
        `patch text and no file_path; a path guard matched on Edit or Write (${[...pathGuards].map((matcher) => JSON.stringify(matcher)).join(", ")}) must also name apply_patch.`,
    );
  }
  return lines;
}

/**
 * Copilot's repository hooks file, keyed by {@link COPILOT_EVENT_NAMES}.
 *
 * Every literal below is this client's wire vocabulary, read from the hooks
 * reference listed in {@link COPILOT_DIALECT_FACTS.citations}: the entry `type`
 * (`"command"`), the `bash` command the cloud agent runs with `command` beside
 * it for the other runners (one string in both: the walk-up starter reads the
 * same under `sh` and `cmd`), the working directory key `cwd`
 * (repository-relative, `"."` being the repository root), the `matcher` key in
 * runtime tool names ({@link translateCopilotMatcher}), and the seconds-valued
 * `timeoutSec` this engine rounds the portable milliseconds up into.
 * https://docs.github.com/en/copilot/reference/hooks-reference (casing fact
 * re-read 2026-09-20; the `bash` key and the camelCase keys from the plan's
 * decision D16, 2026-10-14)
 */
export function buildCopilotHooksJson(rows: readonly HookInterchange[], cli?: CliCallContext): string {
  // The walk-up starter (REQ-FLOW-084) names this pinned call when its runner is missing.
  // Pinned on purpose (inbox row 257, decided in plan 021): an upgrade rewrites this file.
  const starter = cli === undefined ? {} : { syncCall: pinnedCliCall(cli.packageName, cli.version, "sync", cli) };
  const hooks: Record<string, object[]> = {};
  for (const row of rows) {
    const command = portableHookCommand("copilot", row, starter);
    (hooks[COPILOT_EVENT_NAMES[row.event]] ??= []).push({
      type: "command", bash: command, command, cwd: ".",
      ...(row.matcher === undefined ? {} : { matcher: translateCopilotMatcher(row.matcher).matcher }),
      ...(row.timeoutMs === undefined ? {} : { timeoutSec: Math.ceil(row.timeoutMs / 1000) }),
    });
  }
  return `${JSON.stringify({ version: 1, hooks }, null, 2)}\n`;
}
