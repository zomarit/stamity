/**
 * The ownership boundary between this engine and an installed plugin.
 *
 * A repository running on a plugin receives some classes of content from the
 * client's own plugin root rather than from emission. This module is the ONE
 * place that decides which — four adapters, the core composer and the sync
 * report all ask here — because a class skipped in one adapter and not in
 * another is content delivered twice or not at all, and neither failure has a
 * surface that would report it.
 *
 * Nothing here reads the filesystem or the environment. The manifest records
 * the boundary (`../types/manifest.ts` → {@link PluginConfig}), and
 * `pluginOwnedClasses` (`../manifest/manifest.ts`) is the single resolver of
 * what the recorded mode MEANS; this module is that resolver's emission-side
 * vocabulary, not a second opinion about it.
 *
 * Three rules hold across every function below:
 *
 * 1. **Mode decides.** A client record under `mode: "generated"` is a
 *    repository noting the root it knows about before it migrates. Ownership
 *    moves only under `plugin-backed`, which is `pluginOwnedClasses`'s rule
 *    and is not re-stated here.
 * 2. **Selection decides.** A tool recorded in `plugin.clients` but absent
 *    from `manifest.tools` is ignored: emission never planned for it, so
 *    nothing about it can be skipped. `stamity plugin status` reports that
 *    client as recorded-but-not-selected; emission stays silent about it.
 * 3. **Per class, never per client.** A record that owns `agent` leaves
 *    `rule`, `skill`, `command` and `hooks` to emission. A client is never
 *    dropped wholesale.
 */
import { pluginOwnedClasses } from "../manifest/manifest.ts";
import type { EmissionOwner } from "../types/content.ts";
import { TOOLS, type Tool } from "../types/core.ts";
import {
  PLUGIN_OWNED_CLASSES,
  type PluginOwnedClass,
  type SetupManifest,
} from "../types/manifest.ts";

/**
 * Does `tool`'s plugin own `cls` in this repository?
 *
 * The predicate every consumer reads. It delegates rather than deciding: the
 * mode rule, the per-tool record lookup and the membership re-check all live
 * in `pluginOwnedClasses`, so a manifest answered here and a manifest answered
 * by `check` or `clean` cannot disagree.
 */
export function isPluginOwned(
  manifest: SetupManifest | null | undefined,
  tool: Tool,
  cls: PluginOwnedClass,
): boolean {
  return pluginOwnedClasses(manifest, tool).has(cls);
}

/**
 * Which of the `.agents/skills/` readers still OWN that tree.
 *
 * The vendor-neutral projection is one directory several clients read, so it
 * is co-owned: it survives the deselection of any single owner and is
 * reclaimed when the last one drops (`../manifest/ledger.ts`). A reader whose
 * plugin carries `skill` is no longer an owner — the plugin delivers those
 * skills to that client — so it leaves the list, and the tree is emitted while
 * any reader remains.
 *
 * `readers` arrives already filtered to the selected tools that declare they
 * read the tree (`./planner.ts`), and the returned list preserves that order:
 * the ledger's owner list is compared as a set but written in the order the
 * composer built it, and re-sorting here would churn every co-owned row.
 */
export function sharedProjectionOwners(
  manifest: SetupManifest | null | undefined,
  readers: readonly Tool[],
): Tool[] {
  return readers.filter((tool) => !isPluginOwned(manifest, tool, "skill"));
}

/** One selected client's plugin-owned classes, for a report to print. */
export interface PluginOwnedClasses {
  tool: Tool;
  classes: PluginOwnedClass[];
}

/**
 * What the plugin owns, per selected client — the sync report's
 * `plugin-owned` lines and the setup panel's.
 *
 * Restricted to `manifest.tools` and ordered by {@link TOOLS}, because the
 * summary answers "what did this run NOT emit, and for whom": a client
 * emission never planned for has nothing to report here. Classes come back in
 * {@link PLUGIN_OWNED_CLASSES} declaration order rather than in the order the
 * record happened to list them, so two manifests recording the same ownership
 * print the same line.
 *
 * A client with an empty answer is omitted rather than printed as an empty
 * row: "claude: " would read as a claim about claude that is not being made.
 */
export function pluginOwnedSummary(
  manifest: SetupManifest | null | undefined,
): PluginOwnedClasses[] {
  const selected = new Set(manifest?.tools ?? []);
  const summary: PluginOwnedClasses[] = [];
  for (const tool of TOOLS) {
    if (!selected.has(tool)) continue;
    const owned = pluginOwnedClasses(manifest, tool);
    if (owned.size === 0) continue;
    summary.push({ tool, classes: PLUGIN_OWNED_CLASSES.filter((cls) => owned.has(cls)) });
  }
  return summary;
}

/**
 * The ownable class a planned row belongs to, or `null` when no plugin can own
 * it.
 *
 * Content rows answer from their own `artifactType`. Infra rows cannot: the
 * class covers the client bridge, the settings document, the MCP placement and
 * the hook wiring alike, and only the last of those is something a plugin
 * carries. So each adapter names its OWN hook infra artifact ids and passes
 * them in — the ids are that adapter's private vocabulary, and a central list
 * of them here would be a second place to update when a row is added.
 */
function ownedClassOfRow(
  owner: EmissionOwner,
  hookInfraArtifactIds: ReadonlySet<string>,
): PluginOwnedClass | null {
  if (owner.artifactType !== "infra") return owner.artifactType;
  return hookInfraArtifactIds.has(owner.artifactId) ? "hooks" : null;
}

/**
 * `rows` minus the ones `tool`'s plugin owns — each adapter's residue filter.
 *
 * Order and identity are preserved for every surviving row: the composer sorts
 * by path afterwards, but a row that came through here must be byte-identical
 * to the row that went in, which is what makes a repository with no `plugin`
 * field emit exactly what it emitted before this boundary existed.
 *
 * `exemptPaths` carries the rows whose ownership was already settled where they
 * were BUILT, and it exists for exactly one case: an installed pack's skill.
 * Pack content is repository-installed, no plugin ships it, and its row looks
 * from here like any other `skill` row — the provenance that distinguishes it
 * lives on the projection row (`ProjectedFile.origin`) and does not survive the
 * re-target into {@link EmissionOwner}. So the adapter that knows names the
 * path, rather than this function guessing from one.
 */
export function withoutPluginOwnedRows<Row extends { path: string; owner: EmissionOwner }>(
  manifest: SetupManifest | null | undefined,
  tool: Tool,
  rows: readonly Row[],
  hookInfraArtifactIds: ReadonlySet<string>,
  exemptPaths: ReadonlySet<string> = new Set(),
): Row[] {
  const owned = pluginOwnedClasses(manifest, tool);
  if (owned.size === 0) return [...rows];
  return rows.filter((row) => {
    if (exemptPaths.has(row.path)) return true;
    const cls = ownedClassOfRow(row.owner, hookInfraArtifactIds);
    return cls === null || !owned.has(cls);
  });
}
