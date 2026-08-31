import { ADAPTER_REGISTRY } from "../../adapters/registry.ts";
import { contentRootsOf, type ContentRoots } from "../../content/catalog.ts";
import { userContentRoot } from "../../content/userContent.ts";
import { composeEmissionPlanner } from "../../emit/planner.ts";
import type { AdapterOutput, ContentClass, EmissionPlan } from "../../types/content.ts";
import type { PackageEntry } from "../../types/detect.ts";
import type { SetupManifest } from "../../types/manifest.ts";

/**
 * The emission seam — the typed boundary between the CLI commands and the
 * adapter layer that now fills it.
 *
 * Commands (init apply, sync engine, check drift) consume ONLY the
 * {@link EmissionPlanner} interface: they call {@link getEmissionPlanner},
 * pass an {@link EmissionContext}, and feed the returned
 * {@link AdapterOutput} rows into safe writes plus ledger recording. They
 * never branch on planner identity — which is why the adapter flip below
 * (no-op planner out, core-plus-registry composition in) changed zero call
 * sites, exactly as this seam promised.
 *
 * A plan is rows AND findings. {@link EmissionPlanner.planWithWarnings} returns
 * both; {@link EmissionPlanner.plan} returns the rows alone for callers with
 * nothing to print. The seam carried only the rows until the findings channel
 * was widened onto it, and the cost was exact: `../../emit/hooksInfra.ts` built
 * a diagnosis of every silently-dropped hook on every run, and this interface
 * was where it stopped — a rejected hook reached its operator as the hook not
 * firing, which is the outcome the diagnosis exists to prevent.
 *
 * It is also where the repo's own content layer is turned on. Every planner
 * this seam hands out READS `<rootDir>/.stamity/overrides/` as the highest-
 * precedence content root ({@link overlayContentRoots}), so a repo that
 * overrides a shipped agent, rule or command gets ITS body emitted wherever
 * that class reaches a selected client — through init, through sync, and
 * through the regenerate-and-diff `check` runs on the same planner. The
 * catalog walk does the merging; supplying the root is the whole wiring, and a
 * repo with no override tree indexes and plans exactly as it did before.
 *
 * That sentence says "reads" without a no-pack condition, which it could not
 * always do: one consumer downstream used to drop the root back off, because
 * `residueContext` (`../../emit/planner.ts`) rebuilds the spec once
 * `packs.items.length > 0` and rebuilt it from `{root, packRoots}` — two parts
 * of three. Every residue planner, which is every per-client agent, rule and
 * command emission, then planned without the layer in a pack-having repo. The
 * rebuild carries all three parts now, so the layer no longer appears and
 * disappears with unrelated state — the shape {@link overlayContentRoots}
 * exists to refuse. `test/cli/engine/emission.test.ts` holds the pack-having
 * repo to the same four dialects as the pack-free one, so a rebuild that
 * narrows again fails there rather than going quiet.
 *
 * ALL FOUR content classes arrive. `agent`, `rule` and `command` reach their
 * clients through the residue planners named above; `skill` reaches them
 * through the core projection instead, which is why it took a second edit to
 * get there and why it is worth stating rather than leaving to be inferred from
 * {@link OVERRIDE_EMITTING_CLASSES} below.
 *
 * The skills path has two halves and both are live. The catalog half indexes a
 * `.stamity/overrides/skills/<dir>/SKILL.md` as `origin: "user"` like any other
 * class. The projection half now takes the same roots: `ProjectSkillsOptions`
 * (`../../emit/skillsProjection.ts`) declares `contentRoot` as the full
 * `ContentRoots` spec, and `buildCoreEmissionPlan` (`../../emit/planner.ts`)
 * hands it the corpus root together with the override root rather than
 * narrowing to the corpus half — the narrowing that used to leave a user skill
 * winning its id in the index while the SHIPPED body emitted, silently. An
 * override's whole directory travels: `SKILL.md` and every support file beneath
 * it, the override's files and not the shadowed skill's. Both skill trees
 * inherit this identically, because the `.claude/skills/` copy is a path
 * re-target of these same rendered bytes (`retargetProjection`).
 *
 * Pack skills are the one thing that stays out of that widened spec: they reach
 * the same projection through their own resolution lane and are merged under a
 * directory-collision check, so indexing them a second time here would
 * double-project them into it.
 *
 * The pinned cases in `test/cli/engine/emission.test.ts` hold the text and the
 * mechanism together: one asserts the three residue classes arrive, one asserts
 * the skills class arrives in both trees with the authored body, so neither can
 * move without the other going red.
 *
 * Declared gap — `.customize.yaml` and `.customize.md`, layers 2 and 3 of the
 * four-layer precedence, are read by nothing on this path. Two layers ship:
 * canonical frontmatter, then this tree (`../../content/userContent.ts`).
 *
 * Ownership across that layer is the same install-once split installed packs
 * get (`../../pack/projection.ts`): the emitted per-client copy of a user
 * artifact is an ordinary ADAPTER-owned row — regenerated by sync, reclaimed
 * when the override goes — while the SOURCE file under `.stamity/overrides/`
 * is never planned, never wrapped in a managed block, and never reclaimed. No
 * emission path targets a path inside that tree, so the tree stays the
 * author's alone.
 *
 * Planning is pure with respect to the working tree: a planner reads its
 * context (the bundled corpus and the override tree included — content reads
 * are reads, not writes) and returns intended outputs; writing them is the
 * caller's job. Deny-scanning those bodies is deliberately NOT done here: the
 * gate belongs at save and validate time (`../../content/userContent.ts`,
 * `../commands/validate.ts`), because a scan at emission time would reprint
 * the author's own flagged text on every sync.
 */

/**
 * The content classes an override takes over at EMISSION, as opposed to merely
 * in the index — where all four merge.
 *
 * All four are here now. `skill` joined when the projection that turns a skill
 * into files started taking the override root (the skills paragraph above), and
 * this list is the assertion that it did: it is a full enumeration of
 * `ContentClass` rather than a subset, and a class dropping out of it is a
 * regression, not a configuration.
 *
 * Exported because the surfaces that REPORT an override have to say so —
 * `../commands/validate.ts` prints what each override replaced, and a second
 * copy of this set over there would have gone on claiming the opposite for as
 * long as it took anyone to notice the skills seam had widened. One list,
 * beside the mechanism it describes, so the report follows the code.
 */
export const OVERRIDE_EMITTING_CLASSES: readonly ContentClass[] = Object.freeze([
  "agent",
  "rule",
  "command",
  "skill",
]);

/**
 * Detection decisions adapters need that the manifest does not persist.
 * Recomputed live per run — mirrors the engine's `DetectedSummary` posture of
 * never trusting stale layout facts.
 *
 * The existing-config import choice is deliberately NOT here. It is a decision,
 * not a live fact: it is taken once at init and must bind every later `sync`
 * and `check`, so it is persisted on the manifest (`SetupManifest.importChoice`)
 * and read from there by the emission planner. A per-run fact could not survive
 * the run that made it, which is exactly how the choice ended up recorded but
 * never executed.
 */
export interface EmissionFacts {
  /** True when the repo had no agentic setup before this run. */
  greenfield: boolean;
  /** Live monorepo package layout; empty for single-package repos. */
  monorepoPackages: readonly PackageEntry[];
}

/** Everything a planner may read. Callers own all writes. */
export interface EmissionContext {
  /** Absolute repository root the outputs will be written under. */
  rootDir: string;
  /** The manifest driving selection — tools, content selection, dials. */
  manifest: SetupManifest;
  /** Engine version, for generator stamps inside emitted content. */
  engineVersion: string;
  /** Live per-run detection decisions (see {@link EmissionFacts}). */
  facts: EmissionFacts;
  /**
   * Content roots the plan reads. Callers leave it unset: the planner
   * {@link getEmissionPlanner} returns derives the repo's override root from
   * `rootDir` and fills the field in ({@link overlayContentRoots}), so no
   * command has to remember to. A caller that sets `overrideRoot` itself keeps
   * it — the derivation never overrules an explicit root.
   */
  contentRoot?: string | ContentRoots;
}

/** Plans the files a run should emit. Implementations must not touch the filesystem. */
export interface EmissionPlanner {
  /** Stable identifier, for diagnostics only — callers never branch on it. */
  readonly id: string;
  /**
   * The rows alone — the narrow view, for callers with no reporting surface.
   * Defined as `(await planWithWarnings(ctx)).outputs` by every implementation
   * behind this seam, so the two views describe one pass.
   */
  plan(ctx: EmissionContext): Promise<AdapterOutput[]>;
  /**
   * Rows PLUS what the planning pass found — see {@link EmissionPlan}. Both
   * commands that report to a person take this one: `init`
   * (`../commands/init/apply.ts` → `InitApplyReport.warnings`, rendered by
   * `../commands/init/panel.ts`) and `sync` (`../commands/sync/engine.ts` →
   * `SyncPlan.warnings`, rendered by `../commands/sync/report.ts`).
   *
   * The narrow {@link plan} is not a lesser twin of this: it is the same pass
   * with the findings dropped, which is the right shape only where there is no
   * surface to print them on. A command that renders and calls `plan` is the
   * defect this pair exists to make visible.
   */
  planWithWarnings(ctx: EmissionContext): Promise<EmissionPlan>;
}

/**
 * The empty planner: every plan resolves []. No longer the dispatch target —
 * {@link getEmissionPlanner} composes the real adapter registry — but kept
 * exported because its purity contract (fresh array per call, filesystem
 * untouched) still serves tests that need a planner with no output surface.
 */
export const noopEmissionPlanner: EmissionPlanner = {
  id: "noop",
  plan: async () => [],
  // Fresh arrays per call on BOTH fields, for the purity contract above: a
  // caller that mutates what it was handed cannot reach the next caller.
  planWithWarnings: async () => ({ outputs: [], warnings: [] }),
};

/**
 * The single dispatch point the adapter phase swapped: its body changed, its
 * signature and every caller stayed put. Composition is stateless — each call
 * returns a planner built from the same frozen registry, so any two returned
 * planners produce byte-identical plans for one context.
 *
 * The returned planner wraps the composed one with {@link overlayContentRoots}.
 * Doing it HERE rather than at each call site is what makes the override layer
 * unconditional: `init`, `sync` and `check` all reach the adapters through this
 * function, so none of them can be the one command that forgets, and a future
 * caller inherits the layer by construction. The planner's `id` is carried
 * through unchanged — it names the registered residue set, and a wrapper is not
 * a different plan.
 *
 * BOTH entry points are wrapped, on the same rule. A wrapper that overlaid the
 * override root on one of them would make the content layer depend on which
 * view its caller asked for — the same appears-and-disappears-with-unrelated-
 * state shape {@link overlayContentRoots} exists to refuse.
 */
export function getEmissionPlanner(): EmissionPlanner {
  const composed = composeEmissionPlanner(ADAPTER_REGISTRY);
  return {
    id: composed.id,
    plan: (ctx) => composed.plan(overlayContentRoots(ctx)),
    planWithWarnings: (ctx) => composed.planWithWarnings(overlayContentRoots(ctx)),
  };
}

/**
 * `ctx` with the repo's override tree named as the highest-precedence content
 * root, or `ctx` itself when a caller already named one.
 *
 * All three parts of the spec are carried through, never rebuilt from a subset:
 * dropping one turns a layer into something that appears or disappears with
 * unrelated state instead of failing where anyone can see it.
 *
 * A repo with no `.stamity/overrides/` directory plans byte-identically to a
 * build that never had this function. The catalog treats an absent override
 * root exactly as it treats an absent class directory — nothing to walk,
 * nothing to merge — and the corpus root is passed through untouched, so the
 * common case costs one `readdir` per content class, each answering ENOENT.
 */
function overlayContentRoots(ctx: EmissionContext): EmissionContext {
  const spec = contentRootsOf(ctx.contentRoot);
  if (spec.overrideRoot !== undefined) return ctx;
  return {
    ...ctx,
    contentRoot: {
      ...(spec.root === undefined ? {} : { root: spec.root }),
      packRoots: spec.packRoots,
      overrideRoot: userContentRoot(ctx.rootDir),
    },
  };
}
