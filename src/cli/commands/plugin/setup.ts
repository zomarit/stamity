/**
 * The setup engine behind `stamity plugin setup` (REQ-PLUGIN-015): a repository
 * that runs on an installed plugin root gets the files the REPOSITORY owns, and
 * nothing of the classes the plugin carries.
 *
 * Two halves on init's own pattern, so the plugin route is not a second setup
 * path with its own semantics: {@link planPluginSetup} decides — it reads each
 * root's capability file into a {@link PluginConfig} and asks init's prompt-free
 * planner for the rest — and {@link applyPluginSetup} hands that straight to
 * `applyInit`. Every question the plugin route does not answer differently (the
 * state scaffold, the merge engine, the ledger, the already-initialised refusal,
 * the dry-run contract) is therefore init's answer, verbatim.
 *
 * WHY THIS FILE IS IN THE CLI LAYER, and not beside the capability reader it
 * uses (`../../../plugins/capabilityFile.ts`, which is engine). Composing
 * `../init/plan.ts` and `../init/apply.ts` is the whole of what this module
 * does, and those are `src/cli/**` at wave 14 — so an engine home would be a
 * `no-cli` boundary violation by construction, in the value imports and in the
 * type imports alike. It sits at wave 15 for the reason `../workspace.ts`
 * states for itself: a module whose job is to drive a wave-14 command engine
 * belongs one layer above it, not beside it under another unit.
 *
 * The consequence is deliberate, and stated here rather than discovered
 * downstream: this module is NOT in `EngineRegistry`. The composition root sits
 * at wave 12 and may not reach the CLI layer at all, so `src/plugins/` holds
 * the capability reader — which IS registry-wired — while the setup engine
 * reaches a caller through `../plugin.ts` (unit C4), like every other command
 * module.
 *
 * What this module RECORDS versus what ENFORCES it. The `plugin` block it puts
 * on the manifest is the boundary's single source of truth; the emission pass
 * that reads it and skips the owned classes is `../../../emit/ownership.ts` (unit
 * C3). Recording is deliberately separate from enforcing: the manifest outlives
 * this run, and `sync`, `check` and `clean` all have to reach the same answer
 * later without a plugin root in hand.
 */
import {
  CARRIABLE_CLASSES,
  carriedClasses,
  uncarriableClasses,
  type PluginCapabilityFile,
} from "../../../plugins/capabilityFile.ts";
import { TOOLS, type Tool } from "../../../types/core.ts";
import { EngineError } from "../../../types/errors.ts";
import type { PluginClientRecord, PluginConfig } from "../../../types/manifest.ts";
import { applyInit, type InitApplyReport } from "../init/apply.ts";
import { buildInitDecisions, type InitDecisions } from "../init/plan.ts";

/** One installed root: the tool it is being set up for, where it is, and what it declares. */
export interface PluginSetupRoot {
  /** The tool this root is being set up for; must equal the root's own `client`. */
  tool: Tool;
  /** Absolute path of the installed plugin root, for the messages that name it. */
  root: string;
  /** The parsed `stamity-plugin.json` (see `../../../plugins/capabilityFile.ts`). */
  file: PluginCapabilityFile;
}

/** Inputs for {@link planPluginSetup} and {@link applyPluginSetup}. */
export interface PluginSetupInput {
  rootDir: string;
  roots: readonly PluginSetupRoot[];
  engineVersion: string;
  dryRun: boolean;
  /** Injected clock, so a setup's manifest timestamps are the caller's to fix. */
  now: Date;
}

/** What a plugin-backed setup decided, before anything is written. */
export interface PluginSetupPlan {
  /** Init's own prompt-free decisions, for exactly the tools the roots name. */
  decisions: InitDecisions;
  /** The ownership boundary this run will record on the manifest. */
  plugin: PluginConfig;
}

/**
 * Decide a plugin-backed setup: validate the roots against each other, read the
 * boundary off their capability files, and run init's planner for those tools.
 *
 * Every refusal here happens BEFORE the planner runs, so a contradictory
 * invocation costs no detection walk and, more importantly, cannot half-decide:
 * a run that refuses names one defect against inputs, not a partial plan.
 */
export async function planPluginSetup(input: PluginSetupInput): Promise<PluginSetupPlan> {
  const { rootDir, roots } = input;

  if (roots.length === 0) {
    throw new EngineError(
      "Plugin setup needs at least one installed plugin root. Pass --plugin-root, or set " +
        "CLAUDE_PLUGIN_ROOT, CURSOR_PLUGIN_ROOT, PLUGIN_ROOT or COPILOT_PLUGIN_ROOT.",
      { code: "CONFIG_ERROR" },
    );
  }

  const seen = new Set<Tool>();
  const clients: Partial<Record<Tool, PluginClientRecord>> = {};
  // TOOLS order, not argument order: two invocations naming the same roots in a
  // different order must produce one manifest, byte for byte.
  for (const entry of TOOLS.map((tool) => roots.find((row) => row.tool === tool)).filter(
    (row): row is PluginSetupRoot => row !== undefined,
  )) {
    if (entry.file.client !== entry.tool) {
      throw new EngineError(
        `The plugin root at ${entry.root} declares client ${entry.file.client}, but it was ` +
          `requested for ${entry.tool}. Set up each client from its own root.`,
        { code: "CONFIG_ERROR" },
      );
    }
    // Beside the client check, and for the same reason: a root is a document
    // from outside this repository, and the classes it claims are recorded as
    // an ownership transfer. A claude root declaring `rule: carried` would stop
    // `.claude/rules/` being emitted while no container delivers a rule to
    // claude, so the repository would lose its always-on layer to a plugin that
    // does not carry one. Refused by name rather than filtered away, because a
    // silent filter records a boundary the root does not describe.
    const uncarriable = uncarriableClasses(entry.file);
    if (uncarriable.length > 0) {
      throw new EngineError(
        `The plugin root at ${entry.root} declares it carries ` +
          `${uncarriable.join(", ")} for ${entry.tool}, which that client's plugin container ` +
          `has no surface for — it carries ${CARRIABLE_CLASSES[entry.tool].join(", ")}. This ` +
          `root was not built by a generator this engine can set up from.`,
        { code: "CONFIG_ERROR" },
      );
    }
    const classes = carriedClasses(entry.file);
    if (classes.length === 0) {
      throw new EngineError(
        `The plugin root at ${entry.root} carries no class for ${entry.tool}: every class it ` +
          `declares is repository-owned or unsupported, so there is nothing for a plugin-backed ` +
          `setup to hand over. Run \`stamity init --tools ${entry.tool}\` instead.`,
        { code: "CONFIG_ERROR" },
      );
    }
    clients[entry.tool] = { version: entry.file.version, classes };
    seen.add(entry.tool);
  }

  // Asserted after the loop rather than inside it: the loop walks TOOLS, so a
  // duplicate is invisible from within it — the second row for a tool is simply
  // never visited, and the setup would silently use whichever root `find` hit.
  if (seen.size !== roots.length) {
    const duplicated = TOOLS.filter((tool) => roots.filter((row) => row.tool === tool).length > 1);
    throw new EngineError(
      `Two plugin roots were given for ${duplicated.join(", ")}. One root per client.`,
      { code: "CONFIG_ERROR" },
    );
  }

  const decisions = await buildInitDecisions(rootDir, { tools: [...seen] });
  return { decisions, plugin: { mode: "plugin-backed", clients } };
}

/**
 * Run a plugin-backed setup through `applyInit`.
 *
 * `force: false` is not a default this module chose to leave alone — it is the
 * requirement. A repository that already carries a generated setup must be
 * cleaned before it can run on a plugin, so the already-initialised refusal
 * `applyInit` raises is the intended outcome and travels up unchanged;
 * `../plugin.ts` (unit C4) is what turns it into the
 * `stamity clean -y`, then `stamity plugin setup` sentence for the operator.
 */
export async function applyPluginSetup(input: PluginSetupInput): Promise<InitApplyReport> {
  const { decisions, plugin } = await planPluginSetup(input);
  return applyInit({
    rootDir: input.rootDir,
    decisions,
    engineVersion: input.engineVersion,
    dryRun: input.dryRun,
    force: false,
    now: input.now,
    plugin,
  });
}
