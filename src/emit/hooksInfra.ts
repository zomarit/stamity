/**
 * Core 6-intent hooks emission planning: the engine-owned half of the hook
 * surface, planned once and handed to every adapter.
 *
 * Hooks are engine-emitted infrastructure — generated config plus
 * repo-committed scripts — not prose a client interprets. This module plans
 * three kinds of row for the selected tools:
 *
 * 1. **Core scripts** — the three bodies `planCoreHookScripts` builds
 *    (session-start context load, pre-tool-use guard, config-tamper notice),
 *    one copy per selected tool under {@link HOOKS_GENERATED_DIR}. Copies are
 *    per-tool because the guard body bakes the client's honest fail mode from
 *    `CLIENT_HOOK_GUARANTEES`; tools whose guarantees agree produce identical
 *    bytes, and the layout still keeps them apart so a future divergence is a
 *    content change, not a path migration.
 * 2. **The policy document** — one `agent-tool-policies.json` serialized from
 *    the shipped roster PLUS a row per installed-pack agent handed in as
 *    {@link HooksPlanContext.packAgents}, placed beside the per-tool script
 *    directories and read by every guard copy through the same fixed relative
 *    climb. The document is emitted once and co-owned:
 *    {@link PlannedPolicyDocument.owners} is the designated owner list the plan
 *    composer expands into co-owned ledger rows, so deselecting one tool never
 *    orphans the file for the rest. Pack rows are the second half of the
 *    live-emission invariant for the agent class: without them the
 *    generated guard answers `NO_POLICY` for every agent an install added, so a
 *    pack's own commands are inert on a repo that installed it cleanly. Each
 *    row is the grant the pack's disclosed footprint bounds, resolved by the
 *    same function the install preview and the four adapters call, so the
 *    document, the preview, and the emitted agent files cannot disagree about
 *    one agent's privilege.
 * 3. **Interchange rows** — the portable `HookInterchange` form of the core
 *    scripts, every user-authored hook read from the repo's user hooks
 *    directory, and every hook an installed pack supplies. Adapters transform
 *    these rows into client config dialects; event renaming and config-file
 *    placement are their residue, and every adapter receives the same
 *    portable plan.
 *
 * The user lane is load-bearing: user hooks are read at plan time and carried
 * with the generated core set, so an authored hook cannot end up
 * parsed-but-never-emitted. Parse defects surface as returned warnings —
 * never a throw — and each warning names the offending file, so one malformed
 * hook costs itself, not the plan.
 *
 * Installed-pack hooks ride the SAME lane (the live-emission invariant's hook
 * seam): the composer reads them through the user-hook reader's own
 * ingress — exec-form argv, no network fetch, repo-contained script paths —
 * and hands them in as {@link HooksPlanContext.packHooks}. A pack hook is
 * therefore armed by installing the pack, which is what the install preview
 * and the pack's permission manifest disclose at consent time; refusing to
 * emit it after accepting the install is the inert-install failure the
 * invariant exists to rule out.
 *
 * Trust posture, asserted by the suite: every command is exec-form argv
 * (never a shell line), script bytes carry no network vocabulary beyond what
 * the script builders already gate, and planning is deterministic — two plans
 * over identical input produce identical bytes, which is what makes the
 * emitted set hash-trust friendly for clients that trust scripts by digest.
 * Planning is pure: nothing here writes; reads of the user hooks directory
 * are reads of context.
 */

import { resolve } from "node:path";
import type { HookInterchange } from "../hooks/model.ts";
import { MAX_POLICY_FILE_BYTES, planCoreHookScripts } from "../hooks/scripts.ts";
import { readHookDefinitions, type ReadHooksResult } from "../hooks/userHooks.ts";
import { resolveAgentGrant } from "../roster/agentGrants.ts";
import { AGENT_POLICY_ROSTER, type GrantableToolCategory } from "../roster/agentPolicies.ts";
import {
  AGENT_TOOL_POLICIES_FILE,
  buildAgentToolPoliciesJson,
  validateToolPolicies,
  type AgentToolPolicy,
} from "../tools/allowlist.ts";
import { TOOLS, type Tool } from "../types/core.ts";
import type { SetupManifest } from "../types/manifest.ts";
import { STATE_DIR } from "../types/markers.ts";

// ── Layout ───────────────────────────────────────────────────────

/**
 * Root of everything the engine generates inside the state directory —
 * distinct from the user-owned subtrees beside it (`hooks/`, `learnings/`,
 * `handoffs/`, `overrides/`), which regeneration never rewrites.
 */
export const GENERATED_DIR = `${STATE_DIR}/generated`;

/** Per-tool hook script root: scripts land under `<here>/<tool>/<file>`. */
export const HOOKS_GENERATED_DIR = `${GENERATED_DIR}/hooks`;

/** Repo-relative path of the single emitted policy document. */
export const AGENT_TOOL_POLICIES_PATH = `${GENERATED_DIR}/${AGENT_TOOL_POLICIES_FILE}`;

/**
 * Where the guard finds the policy document, relative to its own directory:
 * two levels up from `<hooks root>/<tool>/` is {@link GENERATED_DIR}. Derived
 * from the same constants as {@link AGENT_TOOL_POLICIES_PATH} so the pair
 * cannot drift apart silently — and the suite re-derives the climb from the
 * emitted guard bytes to prove the placement matches.
 */
const POLICIES_PATH_FROM_SCRIPT = `../../${AGENT_TOOL_POLICIES_FILE}`;

/**
 * Default user hooks directory when the manifest does not configure one — the
 * state directory's `hooks/` folder. It is a default, not a required shape:
 * the manifest accepts any repo-relative directory, which is why the reader is
 * handed the repo root explicitly rather than deriving it from this layout.
 */
const DEFAULT_USER_HOOKS_DIR = `${STATE_DIR}/hooks`;

/**
 * Tools whose adapter has somewhere to WRITE hook configuration.
 *
 * Planning is keyed on selection, and selection is not the same question. A
 * tool with no hook config path receives the plan's scripts and interchange
 * rows, writes its per-tool script copies to disk, and then registers none of
 * them: the bytes land and nothing ever executes them, and a hook the repo
 * authored is validated, accepted, and dropped without a word.
 *
 * Copilot is the row that is absent. Its adapter declares
 * `hooksConfigPath: null` (`../adapters/copilot.ts`) and documents the omission
 * at length — agent hooks are Preview there — so this is a restatement of an
 * adapter fact, not a second opinion about it, and the suite re-derives it from
 * the adapters' own dialect facts so the two cannot drift.
 *
 * Engine modules cannot import the adapter layer (the architecture boundary
 * runs the other way), which is why the fact is restated here rather than read.
 */
const HOOK_CONFIG_CAPABLE_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["claude", "cursor", "codex"]);

// ── Plan shape ───────────────────────────────────────────────────

/** One planned per-tool script copy. */
export interface PlannedHookScript {
  /** Repo-relative POSIX path under {@link HOOKS_GENERATED_DIR}. */
  path: string;
  /** Full generated script body. */
  content: string;
  /** The selected tool this copy belongs to — its ledger owner. */
  tool: Tool;
}

/** The single emitted policy document, co-owned by every selected tool. */
export interface PlannedPolicyDocument {
  /** Repo-relative POSIX path — {@link AGENT_TOOL_POLICIES_PATH}. */
  path: string;
  /** Serialized roster document, newline-terminated. */
  content: string;
  /**
   * Designated owner list, in canonical tool order. The plan composer expands
   * this into one co-owned ledger row per tool; an empty list (no tools
   * selected) tells the composer there is nothing to write.
   */
  owners: readonly Tool[];
}

/** Everything hooks emission plans for one run. */
export interface CoreHooksPlan {
  /**
   * Per-tool script rows, tools in canonical {@link TOOLS} order, scripts in
   * `planCoreHookScripts` order within each tool.
   */
  scripts: PlannedHookScript[];
  /** The single shared policy document (see {@link PlannedPolicyDocument}). */
  policyDocument: PlannedPolicyDocument;
  /**
   * The portable hook rows one tool's adapter transforms into its config
   * dialect: core scripts first, then user hooks, then installed-pack hooks,
   * each lane in declaration order. A tool outside the selection has no
   * planned scripts, so it gets an empty list.
   */
  interchangeFor(tool: Tool): HookInterchange[];
  /**
   * Non-fatal findings: user- and pack-hook parse rejections (each naming its
   * file and its lane), roster and pack rows the document emitter would
   * sanitize away, every diagnostic a pack agent's grant resolution produced, a
   * document that outgrew the size the guard will parse, every selected tool
   * that takes no hook configuration (see {@link HOOK_CONFIG_CAPABLE_TOOLS}),
   * and the case no per-tool row can reach — accepted hook rows on a build that
   * selects no tool at all. Absence of the user hooks directory is a non-event,
   * not a warning.
   *
   * This list is an OUTPUT, not a diagnostic side-channel: every row is a
   * silent failure an operator would otherwise discover from behaviour — a
   * rejected hook that simply never fires, a hook accepted with no client to
   * wire it into, a pack agent that installs and can do nothing, a policy
   * document past the cap that locks every agent in the repo out of every tool.
   *
   * Delivery is the CONSUMER's obligation and this module cannot discharge it:
   * planning is pure, so nothing here prints. The field travels out on
   * `CoreEmissionPlan.hooks.warnings` (`./planner.ts`), which returns it to the
   * CLI on `EmissionPlan.warnings` through
   * `EmissionPlanner.planWithWarnings` — the seam that used to drop it, and the
   * reason every row above was computed on each run and shown on none.
   *
   * Two consumers carry it to a screen today: `sync` (via `SyncPlan.warnings`,
   * printed by `../cli/commands/sync/report.ts` on every branch, dry run
   * included) and `init` (via `InitApplyReport.warnings`, printed by
   * `../cli/commands/init/panel.ts` and by init's dry-run report). Those two
   * files are where the delivery claim belongs and where their suites pin it;
   * naming them here is a pointer, not a second record. A consumer that carries
   * the plan and drops this field turns every row above back into the silence
   * the row exists to break — a defect in the consumer, not a diagnostic it may
   * decline.
   */
  warnings: string[];
}

/**
 * One installed-pack agent, in the shape the emission composer hands over.
 *
 * The three inputs are exactly what {@link resolveAgentGrant} rules on, and no
 * more: this module never reads a pack directory, a manifest or a frontmatter
 * block of its own. Planning stays pure, and the composer keeps owning pack
 * discovery — the same split the hook lane already uses for
 * {@link HooksPlanContext.packHooks}.
 */
export interface PackAgentDeclaration {
  /** Runtime (prefixed) agent id — the id both enforcement points match on. */
  readonly runtimeId: string;
  /** Pack supplying the agent; recorded on the emitted row as its provenance. */
  readonly packId: string;
  /** The agent file's parsed frontmatter. Only `capabilities:` is read. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** The pack's declared tool footprint — the ceiling the grant is bounded by. */
  readonly declaredTools: readonly GrantableToolCategory[];
}

/**
 * The slice of the CLI layer's `EmissionContext` this planner reads, restated
 * structurally: the architecture gate forbids engine modules importing the
 * CLI layer, and the real context satisfies this shape by construction.
 */
export interface HooksPlanContext {
  /** Absolute repository root the outputs will be written under. */
  rootDir: string;
  /** The manifest driving selection — tools and user-hook wiring are read here. */
  manifest: Pick<SetupManifest, "tools" | "hooks">;
  /**
   * Hook definitions supplied by installed packs, already read through THIS
   * lane's ingress (`../pack/projection.ts` → `packHookDefinitions`) — the
   * live-emission invariant's hook seam. The composer resolves the
   * installed pack set once per plan and hands the result over rather than
   * letting this module re-derive it, so pack discovery stays in one place.
   * Omitted (a direct caller, a repo with no packs) plans the core + user
   * lanes alone and is byte-identical to a pack-unaware build.
   */
  packHooks?: ReadHooksResult;
  /**
   * Installed-pack agents with their frontmatter and their pack's declared tool
   * footprint — the agent-class half of the same seam `packHooks` covers for
   * hooks. `buildCoreEmissionPlan` (`./planner.ts`) resolves the installed pack
   * set once per plan and passes the declarations it already carries
   * (`../pack/projection.ts` → `ResolvedPackContent.agents`), so pack discovery
   * stays in one place here too. Omitted (a direct caller, a repo with no
   * packs) emits the shipped roster alone, byte-identical to a pack-unaware
   * build.
   */
  packAgents?: readonly PackAgentDeclaration[];
}

// ── Pack agent rows ──────────────────────────────────────────────

/** {@link composePackPolicyRows} output: the rows, and what they cost to produce. */
interface PackPolicyRows {
  readonly rows: AgentToolPolicy[];
  readonly warnings: string[];
}

/**
 * Turn the composer's pack-agent declarations into policy rows.
 *
 * Every row is the grant {@link resolveAgentGrant} computed — the INTERSECTION
 * of the agent's own `capabilities:` with the footprint its pack declared, not
 * the declaration. Accepting an install is consent to what the preview showed;
 * it is not a second, wider grant applied at emission time.
 *
 * Three outcomes, and each is deliberate:
 *
 * - **Roster collision.** A pack agent whose id the shipped roster carries
 *   resolves from the roster, and contributes NO row: one id, one row, or the
 *   first-match lookup on both enforcement points becomes order-dependent. The
 *   resolver has already emitted a diagnostic if the pack file would have
 *   produced a different grant, so a pack shipping a file under a core id is
 *   visible rather than silent.
 * - **Empty grant.** No row, plus a warning naming the agent and the reason —
 *   the diagnostics the resolver produced. An empty row and an absent row reach
 *   the same verdict at the guard (deny), so the row would buy nothing; the
 *   warning is the part that was missing, because a silently ungranted agent
 *   reads as installed and does nothing.
 * - **A grant.** One row carrying its pack as {@link AgentToolPolicy.source},
 *   so an operator auditing privilege in the emitted document can see which
 *   install put it there.
 */
function composePackPolicyRows(declarations: readonly PackAgentDeclaration[]): PackPolicyRows {
  const rows: AgentToolPolicy[] = [];
  const warnings: string[] = [];

  for (const declaration of declarations) {
    const grant = resolveAgentGrant({
      runtimeId: declaration.runtimeId,
      frontmatter: declaration.frontmatter,
      declaredTools: declaration.declaredTools,
    });
    // Diagnostics already open with the runtime id, so the prefix names the
    // lane and the pack and nothing repeats.
    const lane = `pack agent grant [${declaration.packId}]`;
    for (const diagnostic of grant.diagnostics) warnings.push(`${lane}: ${diagnostic}`);

    if (grant.source === "roster") continue;
    if (grant.allow.length === 0) {
      warnings.push(
        `${lane}: ${declaration.runtimeId} resolved to no tool categories, so the emitted policy ` +
          `document carries no row for it and the generated guard denies every tool it requests. ` +
          `Declare what the agent needs in its \`capabilities:\` frontmatter, inside the pack's ` +
          `\`permissions.toolFootprint\`.`,
      );
      continue;
    }

    rows.push({
      agentId: grant.runtimeId,
      allow: [...grant.allow],
      rationale:
        `Supplied by installed pack "${declaration.packId}". Granted the intersection of the ` +
        `agent's declared \`capabilities:\` and the pack's declared tool footprint — the same ` +
        `footprint the install preview disclosed before any byte landed.`,
      source: { kind: "pack", packId: declaration.packId },
    });
  }

  return { rows, warnings };
}

// ── Planning ─────────────────────────────────────────────────────

/**
 * Plan the core hooks emission for the manifest's selected tools.
 *
 * Selection is normalized to canonical {@link TOOLS} order (deduplicated), so
 * the plan is a function of the selected set alone and not of the order the
 * manifest happens to list it in — two spellings of one selection produce
 * identical bytes. Unselected tools get no script rows at all: an orphan copy
 * would be an unledgered file the reclaim sweep has to chase.
 *
 * User hooks are read from `manifest.hooks.userHooksDir` (default
 * {@link DEFAULT_USER_HOOKS_DIR}), resolved against the repo root; an
 * absolute configured path passes through unchanged. The repo root travels
 * with it, because the manifest accepts a directory at any depth (`hooks`,
 * `.config/stamity/hooks`) and the reader anchors containment, script-existence
 * and provenance paths on the root it is given — deriving one from the hooks
 * directory's position would reject a committed script as missing everywhere
 * but the default layout. The configured path itself is handed over as-is —
 * emission never rewrites script content or commands read from it, because
 * user hooks are the user's trust domain: the reader's ingress checks (exec
 * form, no network, repo containment) are the gate, and the accepted rows are
 * wired verbatim into every selected tool's interchange list. Rejected entries
 * become warnings; healthy entries in the same file still load.
 *
 * Both halves of the policy set are validated before serialization because the
 * document emitter sanitizes silently: any row it would drop or truncate is
 * reported here as a warning instead of vanishing between roster and document.
 * The two halves are validated separately so a defect reads as the roster's or
 * as an installed pack's — one label over a merged set would send an operator
 * to the wrong file. The one defect that could span both halves, a pack agent
 * re-using a core id, never reaches the merged set: {@link composePackPolicyRows}
 * drops it in favour of the roster row.
 *
 * The serialized document is size-checked against the ceiling the generated
 * guard will parse. That cap is a whole-file bound, so a pack whose rows push
 * the document past it does not merely lose its own rows — the guard refuses
 * the file and every agent, core and pack, is denied. Reporting it here is what
 * keeps that a warning rather than a silent, repo-wide lockout.
 */
export async function planHooksInfra(ctx: HooksPlanContext): Promise<CoreHooksPlan> {
  const tools = TOOLS.filter((tool) => ctx.manifest.tools.includes(tool));
  const packPolicies = composePackPolicyRows(ctx.packAgents ?? []);
  const policies: AgentToolPolicy[] = [...AGENT_POLICY_ROSTER, ...packPolicies.rows];
  const warnings: string[] = [
    ...validateToolPolicies(AGENT_POLICY_ROSTER).map((issue) => `agent-tool-policy roster: ${issue}`),
    ...validateToolPolicies(packPolicies.rows).map((issue) => `agent-tool-policy pack rows: ${issue}`),
    ...packPolicies.warnings,
  ];

  const policyContent = `${buildAgentToolPoliciesJson(policies)}\n`;
  const policyBytes = Buffer.byteLength(policyContent, "utf8");
  if (policyBytes > MAX_POLICY_FILE_BYTES) {
    warnings.push(
      `agent-tool-policy document: ${policyBytes} bytes over the ${MAX_POLICY_FILE_BYTES}-byte cap ` +
        `the generated guard parses, so the guard refuses the whole file and denies every agent — ` +
        `the ${packPolicies.rows.length} installed-pack row(s) included. Uninstall a pack, or trim ` +
        `the rationales the document carries.`,
    );
  }

  const scripts: PlannedHookScript[] = [];
  const rowsByTool = new Map<Tool, HookInterchange[]>();
  for (const tool of tools) {
    const rows: HookInterchange[] = [];
    for (const script of planCoreHookScripts(POLICIES_PATH_FROM_SCRIPT, tool)) {
      const path = `${HOOKS_GENERATED_DIR}/${tool}/${script.fileName}`;
      scripts.push({ path, content: script.content, tool });
      rows.push({ event: script.event, command: ["node", path] });
    }
    rowsByTool.set(tool, rows);
  }

  const userHooksDir = ctx.manifest.hooks?.userHooksDir ?? DEFAULT_USER_HOOKS_DIR;
  const read = await readHookDefinitions(resolve(ctx.rootDir, userHooksDir), ctx.rootDir);

  // Lane order is fixed — core scripts, then the repo's own hooks, then the
  // hooks installed packs supply — so a plan is a function of its inputs and
  // the repo's own wiring always precedes third-party supply on an event.
  let acceptedHookRows = 0;
  for (const [label, lane] of [
    ["user hook", read],
    ["pack hook", ctx.packHooks ?? { hooks: [], errors: [] }],
  ] as const) {
    for (const error of lane.errors) {
      warnings.push(`${label} ${error.file} [${error.code}]: ${error.message}`);
    }
    for (const hook of lane.hooks) {
      // Re-stated field by field: the reader's rows carry provenance
      // (`sourceFile`), and the interchange handed to adapters is the portable
      // schema alone — provenance for defects already travels in `warnings`.
      const row: HookInterchange = {
        event: hook.event,
        command: hook.command,
        ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
        ...(hook.timeoutMs === undefined ? {} : { timeoutMs: hook.timeoutMs }),
      };
      acceptedHookRows += 1;
      for (const rows of rowsByTool.values()) rows.push(row);
    }
  }

  // The blind spot the per-tool row below cannot cover. That row is raised once
  // per SELECTED tool, so a selection of none raises none of them — while the
  // push above wrote each accepted row into a row map holding no lists, which
  // discards it without touching a single branch. An empty selection is
  // therefore the one state where a hook passes every ingress check and
  // disappears with nothing anywhere saying so.
  //
  // Reachability, stated plainly rather than implied: the manifest validator
  // refuses both halves of it — `tools: []` (`../manifest/manifest.ts:607-608`)
  // and any unknown tool name (`:611-612`) — so no validated CLI run arrives
  // here with an empty selection, and this row is defence in depth, not a live
  // defect being patched. It is kept because this planner's context type is
  // structural (`HooksPlanContext.manifest` is a `Pick`, not a validated
  // manifest): a direct caller — the suite included — reaches the state, and a
  // silent-drop branch inside the module whose whole contract is "no accepted
  // hook is dropped without a word" is worth closing wherever it can be entered
  // from, not only where today's validator happens to permit.
  //
  // Gated on rows rather than on selection: selecting no tool is an ordinary
  // empty build, and a repo with no authored hooks has lost nothing. The row is
  // about the hooks that vanished, so with none accepted there is nothing to
  // report.
  if (tools.length === 0 && acceptedHookRows > 0) {
    const wirable = TOOLS.filter((tool) => HOOK_CONFIG_CAPABLE_TOOLS.has(tool)).join(", ");
    warnings.push(
      `hook wiring: ${acceptedHookRows} accepted hook row(s) from this repo and its installed ` +
        `packs have no selected client to be wired into, so none of them will ever run. No ` +
        `per-client notice covers this — those are raised once per selected tool, and this build ` +
        `selects none. Select a client that takes hook configuration (${wirable}) for these ` +
        `hooks to be registered.`,
    );
  }

  // Named, not inferred. A tool with no hook config home still gets its script
  // copies and its interchange rows, so the bytes land and nothing registers
  // them — and an authored hook that passed every ingress check is dropped in
  // silence. The row says which tool, how much, and what stops working.
  //
  // Iterated over the row map rather than over `tools`: the map was keyed from
  // that same list above, so reading the rows out of it carries the count
  // without an absent-key fallback that no input can reach.
  for (const [tool, rows] of rowsByTool) {
    if (HOOK_CONFIG_CAPABLE_TOOLS.has(tool)) continue;
    const toolScripts = scripts.filter((script) => script.tool === tool);
    const bytes = toolScripts.reduce(
      (total, script) => total + Buffer.byteLength(script.content, "utf8"),
      0,
    );
    const authored = rows.length - toolScripts.length;
    warnings.push(
      `hook wiring [${tool}]: this client takes no hook configuration, so the ${bytes} bytes of ` +
        `generated hook scripts written for it are never executed` +
        (authored > 0
          ? `, and ${authored} accepted hook row(s) from this repo and its installed packs are dropped rather than wired`
          : "") +
        `. Nothing here is broken; the gate that binds on this client is its own permission rules.`,
    );
  }

  return {
    scripts,
    policyDocument: {
      path: AGENT_TOOL_POLICIES_PATH,
      content: policyContent,
      owners: tools,
    },
    // Deep-fresh rows per call (commands included), so one consumer
    // annotating its rows cannot bleed into another adapter's view.
    interchangeFor: (tool) => structuredClone(rowsByTool.get(tool) ?? []),
    warnings,
  };
}
