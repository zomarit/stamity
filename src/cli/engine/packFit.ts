import {
  measureCodexSkillsListFor,
  type CodexSkillsListMeasure,
  type CodexSkillsListShare,
} from "../../adapters/codex.ts";
import { buildContentIndex, type ContentIndex } from "../../content/catalog.ts";
import { userContentRoot } from "../../content/userContent.ts";
import { analyzeRepo, summarizeDetection } from "../../detect/repoAnalyzer.ts";
import { buildCoreEmissionPlan, type EmissionContext } from "../../emit/planner.ts";
import type { PackInstallPlan } from "../../pack/install.ts";
import { PACK_CONTENT_CLASSES } from "../../pack/manifest.ts";
import {
  resolveInstalledPackContent,
  selectionWithInstalledPacks,
  type StagedPack,
} from "../../pack/projection.ts";
import { grantableFootprint } from "../../roster/agentGrants.ts";
import type { ContentSelection } from "../../types/content.ts";
import type { SetupManifest } from "../../types/manifest.ts";

/**
 * Whether a planned pack fits the clients' fixed listing budgets, measured
 * before `add` writes anything (REQ-PACK-004).
 *
 * Today one client has such a budget: Codex holds the name and description of
 * every skill it shows its model for the whole session, and `sync` refuses a
 * list past {@link CodexSkillsListMeasure.cap} (`../../adapters/codex.ts`). A
 * pack `add` admitted could therefore install cleanly and fail the very next
 * `sync`. The check plans the core emission with the incoming pack staged in
 * place of any installed copy, and counts it with `measureCodexSkillsListFor`,
 * the one path to the count `sync`'s refusal reads: the same shown rows,
 * touchpoints included, attributed the same way.
 *
 * A CLI-layer module, not an engine-registry one: `add` is its only caller,
 * so `src/composition/root.ts` does not import it.
 */
export interface PackFitReport {
  codex:
    | { applies: false }
    | {
        applies: true;
        measure: CodexSkillsListMeasure;
        /** `measure.total` is at or under `measure.cap`. */
        fits: boolean;
        /** The incoming pack's share; zero when none of its skills is shown. */
        packShare: CodexSkillsListShare;
      };
}

/**
 * Pack classes the catalog walk and the skills projection read. The staged
 * pack carries these alone: `hooks/` and `mcp_servers/` reach no skills list,
 * and their readers anchor paths to the installed layout under the repository,
 * which a source directory outside it is not.
 */
const LISTED_CLASSES: ReadonlySet<string> = new Set(["agents", "skills", "rules", "commands"]);

/**
 * What `add` hands the fit check so it plans with `sync`'s own inputs rather
 * than a copy of them: the selection rule (`./emissionWrite.ts` →
 * `fullCorpusSelection`) and this installation's package identity
 * (`../kit/packageName.ts`), which the pinned CLI call renders from in any
 * skill head that carries the token. Injected, not imported: the layering
 * keeps this module apart from both wave-13 modules of other units
 * (`test/architecture`), and `add` sits above them, as `EmissionPlanFor`
 * (`./emissionWrite.ts`) is supplied by its callers.
 */
export interface PackFitPlanning {
  /** The selection `sync` plans with, from the bundled content index. */
  selection: (index: ContentIndex) => ContentSelection;
  /** The package every pinned call names, as `sync` passes it. */
  identity: Pick<EmissionContext, "packageName" | "npmChannel" | "npmRegistry">;
}

/**
 * The fit of `plan`'s pack in the setup `manifest` records, as the next `sync`
 * would measure it. Only a setup that selects Codex is measured.
 *
 * The emission is planned the way `sync` plans its own
 * (`../commands/sync/engine.ts` → `planSync`): the repository's override tree
 * as the top content root, `planning`'s selection and identity, detection
 * read fresh as `sync` reads it (repo tokens render in a skill's head), and the
 * residue context the composer hands each client (`../../emit/planner.ts` →
 * `residueContext`): the pack roots joined to the content roots and the pack
 * items to the selection. The count itself is the adapter's
 * (`measureCodexSkillsListFor`). `test/cli/engine/packFit.test.ts` holds this
 * total equal to the one `sync`'s refusal prints for the same setup.
 */
export async function planPackFit(
  rootDir: string,
  manifest: SetupManifest,
  plan: PackInstallPlan,
  engineVersion: string,
  planning: PackFitPlanning,
): Promise<PackFitReport> {
  if (!manifest.tools.includes("codex")) return { codex: { applies: false } };

  const staged = stagedPackOf(plan);
  const [index, repoInfo, packs] = await Promise.all([
    buildContentIndex(),
    analyzeRepo(rootDir),
    resolveInstalledPackContent(rootDir, manifest, undefined, { staged }),
  ]);
  const overrideRoot = userContentRoot(rootDir);
  const ctx: EmissionContext = {
    rootDir,
    manifest: {
      ...manifest,
      selection: planning.selection(index),
      detected: summarizeDetection(repoInfo),
    },
    engineVersion,
    ...planning.identity,
    facts: { monorepoPackages: repoInfo.monorepoPackages },
    contentRoot: { packRoots: [], overrideRoot },
  };
  const core = await buildCoreEmissionPlan(ctx, packs);
  const residueCtx: EmissionContext =
    packs.items.length === 0
      ? ctx
      : {
          ...ctx,
          contentRoot: { packRoots: packs.packRoots, overrideRoot },
          manifest: selectionWithInstalledPacks(ctx.manifest, packs.items),
        };
  const measure = await measureCodexSkillsListFor(core, residueCtx);
  return {
    codex: {
      applies: true,
      measure,
      fits: measure.total <= measure.cap,
      packShare: measure.packs.get(staged.id) ?? { characters: 0, skills: 0 },
    },
  };
}

/**
 * `plan`'s pack as {@link resolveInstalledPackContent} takes one not yet
 * installed: its source root, the listed classes its write set lands, and the
 * footprint its receipt would record (`../../pack/receipt.ts`).
 */
function stagedPackOf(plan: PackInstallPlan): StagedPack {
  const present = new Set<string>(plan.writeSet.map((entry) => entry.contentClass));
  return {
    id: plan.manifest.name,
    root: plan.source.packRoot,
    classesPresent: PACK_CONTENT_CLASSES.filter(
      (cls) => present.has(cls) && LISTED_CLASSES.has(cls),
    ),
    declaredTools: grantableFootprint(plan.manifest.permissions?.toolFootprint),
  };
}
