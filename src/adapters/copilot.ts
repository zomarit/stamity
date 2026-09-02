/**
 * GitHub Copilot residue — the per-client half of a standards-first emission.
 *
 * The core already emitted everything portable: the `AGENTS.md` charter (which
 * Copilot reads natively, so this adapter emits NO entry-file mirror — no
 * `.github/copilot-instructions.md`, no second copy of the charter), the
 * vendor-neutral `.agents/skills/` projection Copilot reads directly, the hook
 * infrastructure, and the MCP substrate. Skills stay absent from this file for
 * that reason: the client reads the neutral tree, so a native second copy would
 * be duplicated context with no reader. What is left here is dialect and
 * placement only:
 *
 * 1. **Rules → `.github/instructions/*.instructions.md`.** Copilot scopes an
 *    instruction file with `applyTo:`, ONE glob string that carries several
 *    patterns comma-separated, so the rule's glob list is joined rather than
 *    emitted as a YAML sequence ({@link APPLY_TO_SEPARATOR} carries the
 *    separator decision and the evidence for it).
 * 2. **Agents → `.github/agents/*.agent.md`.** Repository-level custom agents,
 *    carrying `target: github-copilot`, a least-privilege `tools:` list, and a
 *    `model:` only where an operator pinned one.
 * 3. **Commands → `.github/prompts/*.prompt.md`.** The nine touchpoints, in
 *    the prompt-file shape Copilot's picker reads: a file emitted as
 *    `st-<id>.prompt.md` is invoked as `/st-<id>`, which is the route
 *    the charter's touchpoint list already tells the user about.
 * 4. **`.github/workflows/copilot-setup-steps.yml`.** The one workflow whose
 *    job name the coding agent runs before it starts work.
 * 5. **The MCP documents the core planned for this client**, placed verbatim
 *    at the paths the core chose — this adapter re-renders nothing.
 *
 * Four claims below are load-bearing enough to state rather than imply.
 *
 * **`tools:` is never omitted.** The reference is explicit that an omitted key
 * "defaults to all tools", MCP servers included, so omission is not a smaller
 * grant but the widest one. Every emitted agent therefore carries an explicit
 * list, and an agent whose grant resolves to nothing emits `[]` — Copilot's
 * documented "no tools" value and the same verdict the in-process check reaches
 * for an unrostered id (`src/tools/allowlist.ts`).
 *
 * **`model:` is pinned or absent, and effort is absent either way.** The agent
 * format reads a model ("If unset, inherits the default model"), so a class the
 * operator pinned an id for is expressible here and is emitted; with no pin the
 * key is dropped rather than filled with a name this engine chose, per the
 * ladder's never-invent rule (`src/roster/modelLadder.ts`). The EFFORT axis has
 * no carrier at all on this surface — the agent reference publishes no effort
 * key and no model-value parameter — which is a documented omission rather
 * than an oversight; the `effort-axis` cap row records it.
 *
 * **No hook configuration is emitted, and that is a decision.** The core hands
 * this adapter the same portable interchange rows as every other client
 * (`CoreEmissionPlan.hooks.interchangeFor("copilot")`), and v1 places none of
 * them: Copilot's hook surface never blocks — a hook that rejects, errors, or
 * times out is reported and the action proceeds (`CLIENT_HOOK_GUARANTEES`) —
 * and the VS Code deny-gate that could block a single tool call is still in
 * Preview ("Agent hooks are currently in Preview" —
 * code.visualstudio.com/docs/agent-customization/hooks, accessed 2026-08-17).
 * Emitting a config whose gate is advisory would ship the appearance of
 * enforcement; the honest surface is the guarantee row in
 * {@link COPILOT_DIALECT_FACTS}, which the generated capability matrix renders.
 * The revisit trigger is that gate reaching GA.
 *
 * **Two conversions are lossy, by the client's shape rather than by choice.**
 * Copilot has no description-pull activation mode, so a rule authored
 * `scope: agent-requested` emits `applyTo: "**"` and attaches everywhere; and
 * `precedence:` has no Copilot primitive at all, so rule ordering is simply not
 * expressible here. Both are declared in the dialect facts instead of being
 * silently absorbed.
 *
 * Planning is pure with respect to the working tree: the corpus is read, and
 * the repository root is probed for a lockfile so the setup workflow installs
 * with the manager the repo actually uses. Nothing is written, no clock is
 * read, and two plans over one repository produce identical bytes.
 */

import {
  COMMAND_ID_PREFIX,
  buildContentIndex,
  typeIdKey,
  type CatalogItem,
} from "../content/catalog.ts";
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
  detectionContextFromManifest,
  substituteRepoTokens,
  substituteVerificationGateTokens,
} from "../emit/substitution.ts";
import { CLIENT_HOOK_GUARANTEES } from "../hooks/model.ts";
import type { McpEmission } from "../mcp/emit.ts";
import {
  grantableFootprint,
  resolveAgentGrant,
  type ResolvedAgentGrant,
} from "../roster/agentGrants.ts";
import { resolveModelValue, type ModelPinMap } from "../roster/modelLadder.ts";
import {
  substituteCanonicalPlatformMarker,
  toCopilotToolsFrontmatter,
} from "../tools/translator.ts";
import type { AdapterOutput, ContentClass, EmissionOwner } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { contentPrefixFor } from "../types/markers.ts";

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
export const COPILOT_PROMPTS_DIR = ".github/prompts";
const PROMPTS_DIR = COPILOT_PROMPTS_DIR;

/**
 * The coding agent's environment-preparation workflow. Both the path and the
 * job name inside it are fixed by the platform: the agent looks for a job
 * called `copilot-setup-steps` in this file and runs nothing else from it.
 */
export const COPILOT_SETUP_STEPS_PATH = ".github/workflows/copilot-setup-steps.yml";

/** Job name the coding agent runs. Not a convention — the platform matches on it. */
const SETUP_STEPS_JOB = "copilot-setup-steps";

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
const ACCESS_DATE = "2026-08-17";

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
  hooksConfigPath: null,
  readsAgentsSkillsDir: true,
  agentsFormat:
    "`.github/agents/<id>.agent.md` — frontmatter (`name`, `description`, `target: github-copilot`, `tools:` alias list, `model:` only under an operator pin) over a markdown prompt",
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
        `restrictions this engine cannot answer), \`model\` follows an operator pin`,
    },
    {
      name: "effort-axis",
      value:
        "omitted — this surface publishes no effort key and no model-value parameter, the one " +
        "documented omission of the reasoning-effort axis",
    },
    {
      name: "hook-enforcement",
      value:
        HOOK_GUARANTEE === undefined
          ? "undeclared"
          : `${HOOK_GUARANTEE.failMode} — blocking exit code: ${HOOK_GUARANTEE.blockingExitCode ?? "none"}; no hook config emitted v1`,
    },
    {
      name: "deny-gate",
      value:
        "VS Code PreToolUse `permissionDecision: \"deny\"` is Preview — emitted when it reaches GA",
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
    // Hook status: "Agent hooks are currently in Preview." The deny outcome
    // exists there and is why the row below names a revisit trigger.
    { url: "https://code.visualstudio.com/docs/agent-customization/hooks", accessDate: ACCESS_DATE },
  ],
};

// ── The planner ──────────────────────────────────────────────────

/**
 * Plan Copilot's per-client rows over the core plan.
 *
 * Order is class order (agents, rules, commands, as the catalog walks them),
 * then the setup workflow, then the MCP documents — deterministic, though the
 * composer sorts by path before anything is written.
 */
export const copilotResiduePlanner: ResiduePlanner = {
  tool: TOOL,
  facts: COPILOT_DIALECT_FACTS,
  async planResidue(core: CoreEmissionPlan, ctx: EmissionContext): Promise<ResidueEmission> {
    const [items, packageManager] = await Promise.all([
      selectedItems(ctx),
      detectPackageManager(ctx.rootDir),
    ]);
    const render = bodyRenderer(ctx);
    // The operator's pins, read once: every emitted model value on this client
    // comes from them, since the projection publishes no alias vocabulary to
    // fall back to (`../roster/modelLadder.ts`).
    const pins = ctx.manifest.models?.pins ?? {};

    const rows = items.map((item) => {
      switch (item.type) {
        case "rule":
          return buildInstructionsFile(item, render);
        case "agent":
          return buildAgentFile(item, grantFor(item), render, pins);
        default:
          return buildPromptFile(item, render, pins);
      }
    });

    rows.push({
      path: COPILOT_SETUP_STEPS_PATH,
      content: buildSetupSteps(packageManager, ctx.manifest.detected?.languages ?? []),
      owner: owner(SETUP_STEPS_JOB, "infra"),
    });
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
 * inheriting one. `tools:` is always present (see the module header), and
 * `model:` appears only when the operator pinned an id for the class the agent
 * declares.
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
        `tools: ${toCopilotToolsFrontmatter(grant.allow)}`,
        ...modelLine(item, pins),
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
 * does on an agent file.
 */
export function buildPromptFile(
  item: CatalogItem,
  render: (raw: string) => string,
  pins: ModelPinMap = {},
): AdapterOutput {
  return {
    path: `${PROMPTS_DIR}/${emittedId(item)}.prompt.md`,
    content: frontmatterDocument(
      [`description: ${yamlScalar(render(item.description))}`, ...modelLine(item, pins)],
      bodyOf(render(item.body)),
    ),
    owner: owner(item.id, item.type),
  };
}

/**
 * The `model:` line for an artifact, or no line at all.
 *
 * Two conditions, both required. The artifact must DECLARE a ladder class —
 * `model_class:` frontmatter is where a role's sizing decision lives, and an
 * artifact that declares none has not asked for a model. And the operator must
 * have PINNED an id for that class: this client publishes no symbolic
 * vocabulary a class could map onto, so with no pin there is no honest value to
 * write and the key is dropped, letting the client apply its own default.
 *
 * The value is quoted like every other scalar this file emits. An operator pin
 * is free text validated for shape only, so a value carrying `: ` would open a
 * second frontmatter key if it went out bare.
 */
function modelLine(item: CatalogItem, pins: ModelPinMap): string[] {
  const declared = item.frontmatter[MODEL_CLASS_FIELD];
  if (typeof declared !== "string") return [];
  const model = resolveModelValue(declared, TOOL, pins);
  return model === undefined ? [] : [`model: ${yamlScalar(model)}`];
}

/**
 * The coding agent's setup workflow: checkout, then the dependency install this
 * repository's own package manager performs.
 *
 * Two lanes, decided by evidence rather than by assumption. A lockfile, a
 * Corepack pin, or a persisted JavaScript/TypeScript language selects the Node
 * lane and its exact install command — `npm ci` and its equivalents need a
 * lockfile, so their frozen forms are emitted only when one is actually there.
 * With no Node evidence at all the workflow checks out and stops, naming what
 * WAS detected in a comment: a fabricated install step for a stack the engine
 * cannot see would fail on the first agent run.
 *
 * Actions are referenced by major version. A full-length commit SHA is the
 * stronger supply-chain posture, and the emitted comment says so — but a SHA
 * this engine cannot verify would be a fabricated pin, which is worse than an
 * honest tag.
 */
export function buildSetupSteps(
  packageManager: PackageManagerInfo,
  languages: readonly string[],
): string {
  const named = [...languages].map((value) => value.trim()).filter((value) => value !== "");
  const isNode =
    packageManager.lockfile !== null ||
    packageManager.fromPackageJsonField ||
    named.some((language) => NODE_LANGUAGES.has(language.toLowerCase()));

  const steps = isNode
    ? nodeSteps(packageManager)
    : [
        "      # No Node toolchain was detected for this repository " +
          `(detected: ${named.length === 0 ? "nothing" : named.join(", ")}).`,
        "      # Add the runtime setup and dependency-install steps the agent needs here.",
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
    "    permissions:",
    "      contents: read",
    "    steps:",
    "      # Pin these to a full-length commit SHA for a stricter supply-chain posture.",
    "      - uses: actions/checkout@v5",
    ...steps,
    "",
  ].join("\n");
}

/** The Node lane's steps: toolchain setup, Corepack where the manager needs it, install. */
function nodeSteps(packageManager: PackageManagerInfo): string[] {
  const lines = [
    "      - uses: actions/setup-node@v5",
    "        with:",
    "          # Replace with this project's pin (.nvmrc, engines.node) when it declares one.",
    '          node-version: "lts/*"',
  ];
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
 * verification-gate commands, then the platform ask-user marker resolved for
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
  return (raw) =>
    substituteCanonicalPlatformMarker(
      substituteVerificationGateTokens(substituteRepoTokens(raw, detection), gates),
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
 * A shared rule-scope reader belongs beside the other clients that need the
 * same answer; until one exists, this is deliberately the narrow read.
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
 * The emitted filename stem and, for agents, the runtime id: the artifact's id
 * with the catalog's command namespacing removed and the filename prefix its
 * class earns restored. Copilot addresses an agent by the name in its path, and
 * the tool-policy roster keys on that same prefixed form, so the two agree by
 * construction.
 *
 * {@link contentPrefixFor} owns which prefix that is — `st-` for the invocable
 * commands and skills, `stamity-` for agents and rules, with an installed
 * pack's artifacts answering to the same class rule as the corpus's.
 */
function emittedId(item: CatalogItem): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  const prefix = contentPrefixFor(item);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
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
