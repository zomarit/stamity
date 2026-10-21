import {
  measureCodexSkillsList,
  shownSkillRows,
  type CodexSkillsListMeasure,
  type CodexSkillsListShare,
} from "../../adapters/codex.ts";
import { buildContentIndex, typeIdKey } from "../../content/catalog.ts";
import { userContentRoot } from "../../content/userContent.ts";
import { buildCoreEmissionPlan } from "../../emit/planner.ts";
import type { PackInstallPlan } from "../../pack/install.ts";
import { PACK_CONTENT_CLASSES } from "../../pack/manifest.ts";
import { resolveInstalledPackContent, type StagedPack } from "../../pack/projection.ts";
import { grantableFootprint } from "../../roster/agentGrants.ts";
import type { ContentClass, ContentSelection } from "../../types/content.ts";
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
 * place of any installed copy, and counts it with `measureCodexSkillsList`,
 * the one function `sync`'s refusal reads, so the two cannot disagree.
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
 * The fit of `plan`'s pack in the setup `manifest` records, as the next `sync`
 * would measure it. Only a setup that selects Codex is measured.
 *
 * The emission is planned the way `sync` plans its own
 * (`../commands/sync/engine.ts` → `planSync`): the repository's override tree
 * as the top content root, and the selection set to every artifact of the
 * bundled content, the rule `./emissionWrite.ts` → `fullCorpusSelection`
 * states. That rule is restated here rather than imported because the
 * layering keeps two wave-13 modules of different units apart
 * (`test/architecture`), as `sync` and `clean` each build their own planner
 * call. The package identity a `sync` passes is left out: it renders only
 * the `${STAMITY:CLI}` token in bodies, and the list reads names and
 * descriptions.
 */
export async function planPackFit(
  rootDir: string,
  manifest: SetupManifest,
  plan: PackInstallPlan,
  engineVersion: string,
): Promise<PackFitReport> {
  if (!manifest.tools.includes("codex")) return { codex: { applies: false } };

  const staged = stagedPackOf(plan);
  const [index, packs] = await Promise.all([
    buildContentIndex(),
    resolveInstalledPackContent(rootDir, manifest, undefined, { staged }),
  ]);
  const core = await buildCoreEmissionPlan(
    {
      rootDir,
      manifest: { ...manifest, selection: everyItemOf(index.items) },
      engineVersion,
      facts: { monorepoPackages: [] },
      contentRoot: { overrideRoot: userContentRoot(rootDir) },
    },
    packs,
  );

  // Which pack supplied each item, keyed by class and id, as the adapter's own
  // attribution reads it (`../../adapters/codex.ts` → `selectedItems`).
  const packOf = new Map<string, string>();
  for (const item of packs.items) {
    if (item.provenance !== undefined) {
      packOf.set(typeIdKey(item.type, item.id), item.provenance.pack);
    }
  }
  const measure = measureCodexSkillsList(shownSkillRows(core.skills), packOf);
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

/** Every artifact id of `items`, per class: the selection `sync` plans with. */
function everyItemOf(items: readonly { type: ContentClass; id: string }[]): ContentSelection {
  const selected: Record<ContentClass, string[]> = { agent: [], skill: [], rule: [], command: [] };
  for (const item of items) selected[item.type].push(item.id);
  return { items: selected };
}
