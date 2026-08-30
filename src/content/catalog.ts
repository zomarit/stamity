import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type * as NodeFsPromises from "node:fs/promises";
import { isAbsolute, join, normalize, posix } from "node:path";
import pLimit from "p-limit";
import { requireEnum, requireString, requireStringArray } from "../config/parse.ts";
import { CONTENT_CLASSES, type ContentClass, type RulePrecedence } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { stripEngineContentPrefix } from "../types/markers.ts";
import { resolveBundledContentRoot } from "./contentRoot.ts";
import { extractToolsFrontmatter, parseFrontmatter } from "./frontmatter.ts";
// Type-only: the skipped-entry vocabulary has one home, and it is the module
// that already reports it to authors. No runtime edge is created.
import type { SkippedUserEntry } from "./userContent.ts";

/**
 * The content catalog: the one walk that turns the bundled corpus on disk into
 * an addressable index. Selection, emission, and every lookup command read the
 * corpus through here, so the layout conventions — which directories are class
 * directories, where a skill's readable file lives, which files are artifacts
 * at all — are stated once instead of re-derived per consumer. Installed packs
 * join the same walk as additional roots ({@link PackContentRoot}) under the
 * same layout contract, which is what makes an installed pack live content
 * rather than inert bytes (the live-emission invariant).
 *
 * Two failure postures, split by defect class:
 *
 *   - A file that does not declare frontmatter is not an artifact. A README in
 *     a class directory, a support file under `agents/shared/`, a rule's `.mdc`
 *     twin: each is skipped, and the walk carries on. Absence of a class
 *     directory is the same non-event, which is what makes an empty corpus a
 *     legitimate state rather than an error.
 *   - A file that declares frontmatter and gets it wrong is a corpus defect and
 *     throws `VALIDATION_ERROR` naming the artifact: malformed YAML, a `tags`
 *     value that is not a list of strings, an unknown tool name, an id that
 *     tries to address a path outside the content root. There is no warnings
 *     channel to absorb these — a broken artifact that indexes to a half-formed
 *     entry is worse than a run that stops and names the file to fix.
 *
 * Three roots feed one index, in precedence order USER > PACK > CORPUS: the
 * bundled corpus, then any installed pack roots, then the repo's own override
 * tree ({@link ContentRoots.overrideRoot} — `.stamity/overrides/`, the tree the
 * user-content lane writes). WITHIN a layer the first claimant of an id wins
 * and a second is reported as a {@link ContentCollision}, unchanged. ACROSS
 * layers the higher layer replaces the lower: the replaced artifacts leave
 * `items` so no consumer emits both bodies, and the replacement is recorded as
 * a {@link ContentShadow}. A shadow is a legitimate state — it is how a repo
 * customizes a shipped artifact — so it is reported, never thrown. Packs are
 * the one exception and stay strict: a pack claiming an id the corpus or an
 * earlier pack already holds is refused (see {@link buildContentIndex}).
 *
 * Declared gap, ONE half. Replacing a whole artifact is the only customization
 * layer implemented here: the `.customize.yaml` / `.customize.md` overlay
 * surfaces — the other two layers of the four-layer customization contract —
 * are read by nothing in this module and by nothing downstream of it, so an
 * artifact is customized by taking its id, not by patching its frontmatter or
 * appending to its body.
 *
 * The override layer's REACH is not a gap and is not latent: the emission seam
 * supplies {@link ContentRoots.overrideRoot} (`src/cli/engine/emission.ts`),
 * so a repo's `.stamity/overrides/` tree wins the ids it claims on an ordinary
 * `sync`. A consumer that destructures a spec and rebuilds one must carry all
 * three parts — dropping `overrideRoot` on the way into a narrowed context is
 * a per-repo emission difference, not an inert omission.
 *
 * Reading is injectable ({@link CatalogFs}) so the walk can be exercised against
 * a virtual volume; nothing else in the module touches the filesystem.
 */

/**
 * The filesystem surface the walk uses. `node:fs/promises` satisfies it, and so
 * does an in-memory volume — the seam exists so corpus-shape cases can be run
 * without a fixture directory on disk.
 */
export type CatalogFs = Pick<typeof NodeFsPromises, "readdir" | "readFile">;

/**
 * Which layer supplied an artifact: the bundled corpus, an installed pack, or
 * the repo's own override tree.
 *
 * Read the rule below as the contract a consumer MUST honour, not as behaviour
 * already in place: no emission path reads this field yet. Its only consumer in
 * `src/` is `./selection.ts::classifySelection`, and every adapter renders an
 * item the same way whatever layer produced it. The rule the field exists to
 * carry — a `user` body is user-owned end to end, so it is never wrapped in a
 * managed block and never regenerated over — is therefore a guard still to be
 * built on top of it, in the same change that threads the override root into
 * emission. Until that lands, an override reaching an adapter is emitted
 * exactly like a shipped artifact.
 */
export type ContentOrigin = "corpus" | "pack" | "user";

/** One indexed artifact: its identity, where it came from, and its full text. */
export interface CatalogItem {
  /** Content class, derived from the class directory the artifact lives in. */
  type: ContentClass;
  /** Catalog id: the frontmatter `id`, `cmd-`-prefixed for commands. */
  id: string;
  /** Absolute path of the readable file (a skill's `SKILL.md`, not its directory). */
  filePath: string;
  /** POSIX path of the same file relative to the root that supplied it (the
   *  content root for corpus artifacts, the pack root for pack artifacts). */
  relativePath: string;
  /** Frontmatter `description`; empty string when undeclared. */
  description: string;
  /** Frontmatter `tags`; first tag is the primary classification. Empty when undeclared. */
  tags: string[];
  /** Rule ordering bucket; absent unless declared. */
  precedence?: RulePrecedence;
  /** Tool restriction from frontmatter; absent means the artifact ships to every tool. */
  tools?: Tool[];
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Full frontmatter map; typed readers narrow the keys they consume. */
  frontmatter: Record<string, unknown>;
  /**
   * Layer this artifact came from. The walk sets it on every item it produces,
   * including corpus ones; it is optional on the type only so an item assembled
   * by hand — a fixture, a caller composing one item — need not restate the
   * common case. Read it through {@link originOf}, which answers `corpus` for
   * an item that carries none, rather than comparing the field to `"corpus"`
   * and getting `false` for a hand-built artifact.
   */
  origin?: ContentOrigin;
  /**
   * Present when the artifact came from an installed pack root rather than
   * the corpus (see {@link PackContentRoot}); `pack` is the pack id. Absent —
   * never `undefined`-valued — for corpus artifacts, so a no-packs walk
   * yields the pre-pack item shape byte-for-byte.
   *
   * `declaredTools` carries the supplying pack's disclosed tool footprint, so
   * an emitter rendering a grant for a pack agent has the ceiling that grant
   * is bounded by without reading a pack file of its own. Presence of
   * `provenance` is what says "there is a pack" — an empty `declaredTools` is
   * a real ceiling of nothing, not a missing one.
   */
  provenance?: { pack: string; declaredTools: readonly string[] };
}

/**
 * One installed pack joined to the walk as an additional content root. The
 * pack's class directories (`agents/`, `skills/`, `rules/`, `commands/`) use
 * the same layout contract as the corpus, so the same scan reads them; every
 * artifact found under `root` carries `provenance: { pack }`.
 */
export interface PackContentRoot {
  /** Installed pack id — recorded as item provenance and named in refusals. */
  pack: string;
  /** Absolute root of the pack's installed content (its class dirs live under it). */
  root: string;
  /**
   * The pack's disclosed tool footprint, stamped onto every item found under
   * `root` (see {@link CatalogItem.provenance}). Absent reads as "declares
   * none", which is the deny-by-default ceiling, so a caller that has not
   * resolved a footprint never widens one by omission.
   */
  declaredTools?: readonly string[];
}

/**
 * Multi-root walk spec — the widened form of the `contentRoot` argument. The
 * emission composer hands this to residue planners inside their context so
 * their existing `buildContentIndex(ctx.contentRoot)` calls pick up installed
 * packs without an adapter edit; every other caller keeps passing a string.
 */
export interface ContentRoots {
  /** Corpus root; the package-bundled corpus when absent. */
  root?: string;
  /** Installed-pack roots joined to the walk after the corpus. */
  packRoots?: readonly PackContentRoot[];
  /**
   * The repo's override tree — `<repoRoot>/.stamity/overrides` — walked last and
   * winning every id it claims. Absent means the repo has no customization
   * lane in play, which is also what an absent directory means, so a caller
   * that always passes the path costs nothing on a repo that never used it.
   */
  overrideRoot?: string;
}

/**
 * Normalize either spelling of a content-root argument into its three parts.
 * Pure and total: a string is a corpus root with no pack roots and no override
 * tree; `undefined` leaves the corpus-root default to the consumer
 * ({@link buildContentIndex} resolves the bundled corpus, other readers resolve
 * their own).
 *
 * A caller that normalizes a spec only to rebuild one — a planner deriving a
 * narrowed context — carries all three parts through. An omitted part is not a
 * default; it is a layer that disappears for that caller alone, which surfaces
 * as customization silently present or absent depending on unrelated state
 * rather than as an error anyone can see.
 */
export function contentRootsOf(contentRoot?: string | ContentRoots): {
  root: string | undefined;
  packRoots: readonly PackContentRoot[];
  overrideRoot: string | undefined;
} {
  if (contentRoot === undefined || typeof contentRoot === "string") {
    return { root: contentRoot, packRoots: [], overrideRoot: undefined };
  }
  return {
    root: contentRoot.root,
    packRoots: contentRoot.packRoots ?? [],
    overrideRoot: contentRoot.overrideRoot,
  };
}

/**
 * A contested identity found during the walk. Both kinds are reported rather
 * than thrown: the corpus still indexes, and the caller decides whether to warn
 * or to fail.
 *
 * - `duplicate-id` — two or more artifacts of one class claim the same id, so
 *   `paths` lists every claimant in walk order and only the first is reachable
 *   through {@link ContentIndex.byKey}.
 * - `filename-mismatch` — one artifact whose declared id disagrees with the
 *   slug of the file that declares it. The declaration wins (the id is the
 *   artifact's identity, the filename is a convention), and `paths` holds the
 *   single offending file. Worth surfacing because the two are expected to
 *   agree: a mismatch usually means a rename touched one half.
 */
export interface ContentCollision {
  /** Type-qualified key in contention, per {@link typeIdKey}. */
  key: string;
  /** Every implicated POSIX content-root-relative path, in walk order. */
  paths: string[];
  kind: "duplicate-id" | "filename-mismatch";
}

/**
 * One identity a higher layer took over from a lower one — a user artifact
 * replacing a corpus or pack artifact of the same class and id.
 *
 * Distinct from {@link ContentCollision} on purpose: a collision is two
 * claimants inside ONE layer, which nobody asked for and only the first of
 * which is reachable, while a shadow is the customization lane working. The
 * replaced artifacts are gone from {@link ContentIndex.items} — one identity,
 * one body — so this row is the only record that they were ever there, and it
 * carries whole items rather than paths so a report can name the file on disk.
 */
export interface ContentShadow {
  /** Class of the contested identity. */
  type: ContentClass;
  /** The catalog id both layers claim. */
  id: string;
  /** The claimant the index resolves to: the highest layer's first claimant. */
  winner: CatalogItem;
  /** Every lower-layer claimant it replaced, in walk order. */
  shadowed: readonly CatalogItem[];
}

/** The indexed corpus. */
export interface ContentIndex {
  /** Every artifact, in walk order: class order, then entry name within a class. */
  items: CatalogItem[];
  /** Type-qualified lookup. First claimant wins; later ones are reported in `collisions`. */
  byKey: Map<string, CatalogItem>;
  /** Contested identities; empty for a clean corpus. */
  collisions: ContentCollision[];
  /**
   * Identities an override took over; empty unless an override root claimed
   * one. Optional on the type for the same reason {@link CatalogItem.origin}
   * is — an index assembled by hand walked nothing, so it replaced nothing —
   * and always set by {@link buildContentIndex}. Read it as `shadows ?? []`.
   */
  shadows?: readonly ContentShadow[];
  /**
   * Entries the walk passed over that an author plausibly meant as artifacts —
   * today, a symlinked `SKILL.md`. Optional for the same hand-assembled-index
   * reason as {@link shadows}; always set by {@link buildContentIndex}.
   *
   * Reported rather than thrown, and reported rather than silently dropped:
   * following the link is the wrong answer (its target sits wherever it likes,
   * outside the tree the operator reviewed), but so is a walk that leaves the
   * author with a tree that looks customized and a `sync` that emits the
   * bundled body.
   */
  skipped?: readonly SkippedUserEntry[];
}

/** Options for {@link buildContentIndex}. */
export interface BuildContentIndexOptions {
  /** Filesystem to read through. Defaults to `node:fs/promises`. */
  fs?: CatalogFs;
  /**
   * Installed-pack roots joined to the walk after the corpus — the canonical
   * way to request a merged index. Merged with any pack roots the first
   * argument carries ({@link ContentRoots}); exact duplicates collapse, and
   * one pack id claiming two different roots is refused.
   */
  packRoots?: readonly PackContentRoot[];
}

/** Prefix that keeps command ids from shadowing a skill or agent of the same name. */
export const COMMAND_ID_PREFIX = "cmd-";

/** Where each class lives, and whether its artifacts are files or directories. */
const CLASS_LAYOUT: Record<ContentClass, { dir: string; layout: "file" | "directory" }> = {
  agent: { dir: "agents", layout: "file" },
  skill: { dir: "skills", layout: "directory" },
  rule: { dir: "rules", layout: "file" },
  command: { dir: "commands", layout: "file" },
};

/** The readable file inside a skill directory. */
const SKILL_FILE = "SKILL.md";

/** Artifact file extension. `.mdc` rule twins do not match, and are not artifacts. */
const ARTIFACT_EXTENSION = ".md";

/** Concurrent artifact reads per class directory. */
const READ_CONCURRENCY = 8;

/** Accepted `precedence:` values, ordered high to low. */
const RULE_PRECEDENCES = [
  "critical",
  "high",
  "normal",
  "low",
] as const satisfies readonly RulePrecedence[];

const defaultFs: CatalogFs = { readdir, readFile };

/**
 * Refuse any content-root-relative path that could address something outside
 * the content root: an absolute path (POSIX, Windows drive, or UNC), a `..`
 * segment, a backslash separator, or a null byte. `label` names the surface the
 * path came from, so a refusal points at the offending file or frontmatter key.
 *
 * Applied to both halves of the walk — the composed path of every entry, and
 * every declared id — because ids are not inert: emission derives output
 * filenames from them, so an id carrying a traversal segment is a write outside
 * the target tree waiting for a consumer, not a naming nit.
 */
export function assertSafePath(relativePath: string, label: string): void {
  const refuse = (why: string): never => {
    throw new EngineError(
      `Unsafe content path in ${label}: ${JSON.stringify(relativePath)} (${why}). ` +
        `Content paths are plain relative POSIX paths contained in the content root.`,
      { code: "VALIDATION_ERROR" },
    );
  };

  if (relativePath === "") refuse("empty path");
  if (relativePath.includes("\0")) refuse("null byte");
  // Judged before the POSIX checks: a Windows-authored path must not be read as
  // one long filename that happens to contain `..`.
  if (relativePath.includes("\\")) refuse("backslash separator");
  if (isAbsolute(relativePath) || relativePath.startsWith("/") || /^[A-Za-z]:/.test(relativePath)) {
    refuse("absolute path");
  }
  if (relativePath.split("/").includes("..")) refuse("`..` segment");
  // Defence in depth: whatever the segments looked like, the normalised form
  // must not climb out.
  const normalized = normalize(relativePath);
  if (normalized.startsWith("..") || isAbsolute(normalized)) {
    refuse("normalises outside the content root");
  }
}

/**
 * The `byKey` lookup key. Type-qualified because ids are only unique within a
 * class — a `plan` skill and a `plan` command are two artifacts, not a
 * collision.
 */
export function typeIdKey(type: ContentClass, id: string): string {
  return `${type}:${id}`;
}

/**
 * Add {@link COMMAND_ID_PREFIX} to a command id. Other classes pass through
 * unchanged, and an already-prefixed id is returned as-is, so the function is
 * idempotent and a round-trip cannot produce `cmd-cmd-`.
 */
export function applyCommandPrefix(id: string, type: ContentClass): string {
  if (type !== "command" || id.startsWith(COMMAND_ID_PREFIX)) return id;
  return `${COMMAND_ID_PREFIX}${id}`;
}

/**
 * Walk the corpus — plus any installed-pack roots, plus the repo's override
 * tree — and index it. `contentRoot` defaults to the package-bundled corpus,
 * resolved lazily so a caller that supplies its own root never triggers the
 * probe; the widened object form ({@link ContentRoots}) additionally names pack
 * roots (as does `options.packRoots`) and the override root.
 *
 * An absent class directory contributes nothing, so an empty corpus yields an
 * empty index rather than a failure — that is the state of a checkout whose
 * corpus has not been staged, and every consumer already has to render "no
 * content" sensibly. The same holds per pack: a pack that ships only classes
 * this walk does not read (hooks, MCP definitions) contributes nothing here.
 *
 * Pack roots are walked AFTER the corpus, sorted by pack id, so the merged
 * item order is a property of what is installed and never of argument order.
 * Identity is stricter across the seam than within the corpus: a pack item
 * whose type-qualified id is already claimed — by the corpus or by an earlier
 * pack — is refused with `VALIDATION_ERROR`, not reported as a collision. The
 * install-time collision gate derives the ids a pack would introduce through
 * {@link slugOf} and {@link applyCommandPrefix}, i.e. by this walk's own rule
 * (`../pack/install.ts` → `catalogIdOf`), so that state is unreachable through
 * `add`; this refusal is defence in depth for state assembled any other way,
 * because an installed pack silently shadowing (or shadowed by) existing
 * content is exactly the substitution attack the trust model exists to rule
 * out.
 *
 * The override tree is walked LAST and is the opposite posture, because the
 * author of that tree is the repo itself: an override that claims an id the
 * corpus or a pack holds WINS it, the replaced artifacts leave `items`, and the
 * substitution is reported through `shadows`. An absent override directory
 * contributes nothing, exactly like an absent class directory — a repo that has
 * customized nothing indexes as it always did.
 */
export async function buildContentIndex(
  contentRoot?: string | ContentRoots,
  options: BuildContentIndexOptions = {},
): Promise<ContentIndex> {
  const spec = contentRootsOf(contentRoot);
  const root = spec.root ?? resolveBundledContentRoot();
  const fs = options.fs ?? defaultFs;
  const packRoots = mergePackRoots(spec.packRoots, options.packRoots ?? []);
  const overrideRoot = spec.overrideRoot;

  // The four class directories are disjoint reads, so they run together; the
  // results are consumed in `CONTENT_CLASSES` order, which is what makes the
  // walk order — and therefore which claimant of a duplicated id wins — fixed.
  // Pack and override scans are equally disjoint and join the same batch;
  // ordering is imposed when the results are flattened, not by completion order.
  const [scanned, packScanned, overrideScanned] = await Promise.all([
    Promise.all(CONTENT_CLASSES.map((type) => scanClass(fs, root, type, { origin: "corpus" }))),
    Promise.all(
      packRoots.map((packRoot) =>
        Promise.all(
          CONTENT_CLASSES.map((type) =>
            scanClass(fs, packRoot.root, type, {
              origin: "pack",
              provenance: {
                pack: packRoot.pack,
                declaredTools: packRoot.declaredTools ?? [],
              },
            }),
          ),
        ),
      ),
    ),
    overrideRoot === undefined
      ? []
      : Promise.all(
          CONTENT_CLASSES.map((type) => scanClass(fs, overrideRoot, type, { origin: "user" })),
        ),
  ]);

  // Layer order is the precedence order, and it is imposed here rather than by
  // which scan finished first.
  const shippedItems = [
    ...scanned.flatMap((result) => result.items),
    ...packScanned.flat().flatMap((result) => result.items),
  ];
  const userItems = overrideScanned.flatMap((result) => result.items);
  const collisions = [
    ...scanned.flatMap((result) => result.collisions),
    ...packScanned.flat().flatMap((result) => result.collisions),
    ...overrideScanned.flatMap((result) => result.collisions),
  ];

  const byKey = new Map<string, CatalogItem>();
  const duplicates = new Map<string, string[]>();
  const shadowedKeys = new Set<string>();
  for (const item of [...shippedItems, ...userItems]) {
    const key = typeIdKey(item.type, item.id);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, item);
      continue;
    }
    // Pack items are refused on contact (corpus items walk first, packs in
    // sorted id order, so the earlier claimant is always the refusal's cited
    // owner); corpus-internal duplicates keep the report-only posture.
    if (item.provenance !== undefined) {
      throw new EngineError(
        `Installed pack "${item.provenance.pack}" supplies ${item.type} "${item.id}" ` +
          `(${item.relativePath}), but that id is already ${claimantOf(existing)}. Packs must ` +
          `not shadow existing content — \`add\` refuses this at install time, deriving the ` +
          `pack's ids by the same rule this walk uses, and this walk refuses it again as ` +
          `defence in depth for state assembled some other way. Remove the pack ` +
          `(clean --pack ${item.provenance.pack}) or rename the artifact in the pack.`,
        { code: "VALIDATION_ERROR" },
      );
    }
    // Layers are walked low to high, so the only cross-layer claim that reaches
    // here is an override over corpus or pack content: it takes the id, and
    // what it replaced is reported instead of vanishing. Two claimants inside
    // the SAME layer — including two overrides — fall through to the duplicate
    // report below, because neither of them replaced anything.
    if (originOf(item) === "user" && originOf(existing) !== "user") {
      byKey.set(key, item);
      shadowedKeys.add(key);
      continue;
    }
    // First claimant stays reachable; every claimant is named in the report.
    duplicates.set(key, [...(duplicates.get(key) ?? [existing.relativePath]), item.relativePath]);
  }
  for (const [key, paths] of duplicates) collisions.push({ key, paths, kind: "duplicate-id" });

  const items = [
    // A replaced artifact leaves the index entirely: one identity, one body, so
    // a consumer iterating `items` cannot emit both the shipped original and
    // the override that took its id.
    ...shippedItems.filter((item) => !shadowedKeys.has(typeIdKey(item.type, item.id))),
    ...userItems,
  ];
  return {
    items,
    byKey,
    collisions,
    shadows: buildShadows(shippedItems, userItems, byKey, shadowedKeys),
    skipped: [
      ...scanned.flatMap((result) => result.skipped),
      ...packScanned.flat().flatMap((result) => result.skipped),
      ...overrideScanned.flatMap((result) => result.skipped),
    ],
  };
}

/** The layer an item came from; `corpus` for an item assembled without one. */
export function originOf(item: CatalogItem): ContentOrigin {
  return item.origin ?? "corpus";
}

/**
 * One row per identity an override took over, ordered by the override tree's
 * walk order.
 *
 * `shadowed` lists EVERY lower-layer claimant of the id, not only the one that
 * held `byKey`: a corpus that already duplicated an id has two files to account
 * for, and a report naming one of them would send the author to the wrong file
 * when the other is the one that stopped being emitted.
 */
function buildShadows(
  shippedItems: readonly CatalogItem[],
  userItems: readonly CatalogItem[],
  byKey: ReadonlyMap<string, CatalogItem>,
  shadowedKeys: ReadonlySet<string>,
): ContentShadow[] {
  if (shadowedKeys.size === 0) return [];

  const replaced = new Map<string, CatalogItem[]>();
  for (const item of shippedItems) {
    const key = typeIdKey(item.type, item.id);
    if (!shadowedKeys.has(key)) continue;
    const claimants = replaced.get(key);
    if (claimants === undefined) replaced.set(key, [item]);
    else claimants.push(item);
  }

  // Only the override that actually holds the key wins a row: a second override
  // of the same id replaced nothing, and is reported as a duplicate instead.
  return userItems.flatMap((winner) => {
    const key = typeIdKey(winner.type, winner.id);
    const shadowed = replaced.get(key);
    if (shadowed === undefined || byKey.get(key) !== winner) return [];
    return [{ type: winner.type, id: winner.id, winner, shadowed }];
  });
}

/** How a refusal names the artifact already holding a contested id. */
function claimantOf(existing: CatalogItem): string {
  return existing.provenance === undefined
    ? `claimed by the corpus artifact at ${existing.relativePath}`
    : `claimed by installed pack "${existing.provenance.pack}" (${existing.relativePath})`;
}

/**
 * Both pack-root sources as one list: exact `(pack, root)` duplicates
 * collapse, one pack id claiming two different roots is refused (two walks of
 * one pack would double every item, and neither root can be preferred without
 * guessing), and the result is sorted by pack id so the walk order is a
 * function of what is installed.
 */
function mergePackRoots(
  a: readonly PackContentRoot[],
  b: readonly PackContentRoot[],
): PackContentRoot[] {
  const byPack = new Map<string, PackContentRoot>();
  for (const candidate of [...a, ...b]) {
    const existing = byPack.get(candidate.pack);
    if (existing === undefined) {
      byPack.set(candidate.pack, {
        pack: candidate.pack,
        root: candidate.root,
        // Carried, not re-derived: the footprint travels with the root that
        // resolved it, so a merged list cannot lose a ceiling on the way in.
        ...(candidate.declaredTools === undefined ? {} : { declaredTools: candidate.declaredTools }),
      });
      continue;
    }
    if (existing.root !== candidate.root) {
      throw new EngineError(
        `Pack "${candidate.pack}" was handed to the content walk with two different roots ` +
          `(${existing.root} and ${candidate.root}). One installed pack has one content root; ` +
          `fix the caller assembling the pack-root list.`,
        { code: "VALIDATION_ERROR" },
      );
    }
  }
  return [...byPack.values()].toSorted((x, y) => (x.pack < y.pack ? -1 : x.pack > y.pack ? 1 : 0));
}

/** Every artifact sharing an id, across classes. Empty when nothing claims it. */
export function getAllItemsById(index: ContentIndex, id: string): CatalogItem[] {
  return index.items.filter((item) => item.id === id);
}

/**
 * The readable file path for one artifact, or null when the index does not
 * carry it. Commands resolve under either form of their id — the catalog stores
 * `cmd-plan`, callers holding a manifest or a user argument often have `plan` —
 * because {@link applyCommandPrefix} is idempotent.
 */
export function resolveArtifactFilePath(
  index: ContentIndex,
  type: ContentClass,
  id: string,
): string | null {
  return index.byKey.get(typeIdKey(type, applyCommandPrefix(id, type)))?.filePath ?? null;
}

interface ScanResult {
  items: CatalogItem[];
  collisions: ContentCollision[];
  skipped: SkippedUserEntry[];
}

/**
 * Why a composed `SKILL.md` was passed over. Stated once so this walk and the
 * override-tree walk that shares the vocabulary (`./userContent.ts` →
 * {@link discoverSkippedUserEntries}) report a link the same way.
 */
const SYMLINK_SKIP_REASON =
  `is a symlink, and the content walk reads regular files and real directories only — ` +
  `this SKILL.md is not indexed, so the skill contributes nothing to emission or validate. ` +
  `Replace the link with the file itself.`;

/**
 * The kind of one skill directory's composed `SKILL.md`, read from a listing
 * of the directory rather than by opening the path.
 *
 * `readdir` with file types reports a link AS a link (it does not follow), and
 * it is the only probe the injectable {@link CatalogFs} seam offers — which is
 * the point: the walk stays runnable against a virtual volume, and no `lstat`
 * has to join the seam for one file kind. A directory that cannot be listed,
 * or has no `SKILL.md` at all, answers `"file"`: the read that follows already
 * treats absence as "not an artifact", and inventing a skip row for a
 * work-in-progress skill would report the author's own scaffolding as a defect.
 */
async function skillArtifactEntry(
  fs: CatalogFs,
  root: string,
  dir: string,
  skillDir: string,
): Promise<"file" | "symlink"> {
  const entries = await listDir(fs, join(root, dir, skillDir));
  const entry = entries?.find((candidate) => candidate.name === SKILL_FILE);
  if (entry === undefined) return "file";
  return entry.isSymbolicLink() ? "symlink" : "file";
}

/** What a root is, for the items its scan produces. */
interface ScanOptions {
  /** Layer the root belongs to; stamped on every item found under it. */
  origin: ContentOrigin;
  /** Pack identity + its disclosed footprint — absent for the corpus and the override tree. */
  provenance?: { pack: string; declaredTools: readonly string[] };
}

/**
 * Read one class directory. Entries are sorted by name so the walk order — and
 * therefore which claimant of a duplicated id wins — is the same on every
 * platform and every filesystem.
 *
 * Only the entry kind the class expects is considered: a directory under
 * `agents/` (the `shared/` and `modes/` support trees) is walked over rather
 * than descended into, and a loose file under `skills/` is ignored. Nothing but
 * a regular file is read, so a symlink in the corpus is never followed out of
 * the content root.
 *
 * That guarantee used to hold for three classes out of four. A skill's
 * readable file is COMPOSED (`skills/<dir>/SKILL.md`) rather than listed, so
 * the entry-kind filter judged the directory and nothing judged the file
 * inside it: a symlinked `SKILL.md` in a real skill directory was opened
 * through the link, and its target's bytes reached emission (into a tracked
 * repo path) and `validate` (into CI logs). The composed file is now listed
 * too ({@link skillArtifactEntry}) and a link is skipped and REPORTED, because
 * a walk that silently drops the file an author put there is how a repo ends
 * up emitting the bundled body while its tree looks customized.
 *
 * `options` says which layer the root is: every item carries its `origin`, and
 * a pack root additionally stamps `provenance`. The frontmatter contract does
 * not vary by layer — a pack artifact or an override that gets its frontmatter
 * wrong throws the same named `VALIDATION_ERROR` a corpus artifact would, and
 * an override whose declared id disagrees with its filename is reported the
 * same way too. Leniency for user-authored content belongs to the quality gates
 * that judge a body, not to the reader that has to index it.
 */
async function scanClass(
  fs: CatalogFs,
  root: string,
  type: ContentClass,
  options: ScanOptions,
): Promise<ScanResult> {
  const { provenance } = options;
  const { dir, layout } = CLASS_LAYOUT[type];
  const entries = await listDir(fs, join(root, dir));
  const result: ScanResult = { items: [], collisions: [], skipped: [] };
  if (entries === null) return result;

  const named = entries
    .filter((entry) => (layout === "directory" ? entry.isDirectory() : entry.isFile()))
    .filter((entry) => layout === "directory" || entry.name.endsWith(ARTIFACT_EXTENSION));

  // A skill's readable file is composed, not listed, so its kind has to be
  // read from its own directory before it is opened. One extra listing per
  // skill directory; file-layout classes were already judged above.
  const probes =
    layout === "directory"
      ? await Promise.all(named.map((entry) => skillArtifactEntry(fs, root, dir, entry.name)))
      : named.map(() => "file" as const);

  const candidates: { relativePath: string; filePath: string; slug: string }[] = [];
  for (const [index, entry] of named.entries()) {
    const segments = layout === "directory" ? [dir, entry.name, SKILL_FILE] : [dir, entry.name];
    const relativePath = posix.join(...segments);
    assertSafePath(relativePath, `${dir} content walk`);
    const filePath = join(root, ...segments);

    if (probes[index] === "symlink") {
      result.skipped.push({ type, filePath, reason: SYMLINK_SKIP_REASON });
      continue;
    }
    candidates.push({
      relativePath,
      filePath,
      slug: slugOf(layout === "directory" ? entry.name : basename(entry.name)),
    });
  }

  // Bounded rather than unbounded: a corpus is a few hundred files, and one
  // `Promise.all` over all of them would open every descriptor at once.
  const raws = await pLimit(READ_CONCURRENCY).map(candidates, (candidate) =>
    readArtifact(fs, candidate.filePath),
  );

  for (const [index, candidate] of candidates.entries()) {
    const raw = raws[index];
    if (raw === null || raw === undefined) continue;

    const parsed = parseFrontmatter(raw, candidate.relativePath);
    // No frontmatter block: a README, a support file, a rule's `.mdc` twin read
    // by a future layout change. Not an artifact, not a defect.
    if (!parsed.hadFrontmatter) continue;

    const built = buildItem({
      type,
      slug: candidate.slug,
      raw,
      relativePath: candidate.relativePath,
      filePath: candidate.filePath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
      origin: options.origin,
      ...(provenance === undefined ? {} : { provenance }),
    });
    result.items.push(built.item);
    if (built.collision !== null) result.collisions.push(built.collision);
  }

  return result;
}

interface BuildItemInput {
  type: ContentClass;
  slug: string;
  raw: string;
  relativePath: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
  body: string;
  origin: ContentOrigin;
  provenance?: { pack: string; declaredTools: readonly string[] };
}

/**
 * Turn one parsed document into a catalog entry.
 *
 * The declared id wins over the filename slug, and a disagreement is reported
 * rather than repaired: renaming a file is a corpus edit this reader must not
 * make on the author's behalf, and silently indexing under one of two names is
 * how a cross-reference ends up pointing at nothing.
 */
function buildItem(input: BuildItemInput): { item: CatalogItem; collision: ContentCollision | null } {
  const { frontmatter, relativePath, slug, type } = input;
  const source = relativePath;

  const declared = requireString(frontmatter, "id", { source, optional: true })?.trim();
  const bareId = declared === undefined || declared === "" ? slug : declared;
  // Validated before the command prefix goes on: `cmd-..` is a literal segment
  // name that no traversal check would object to, so prefixing first would hide
  // exactly the id this guard exists to catch.
  assertSafePath(bareId, `${relativePath} \`id\``);
  const id = applyCommandPrefix(bareId, type);

  const precedence = requireEnum(frontmatter, "precedence", RULE_PRECEDENCES, {
    source,
    optional: true,
  });
  // Re-read from the raw document: `tools` is the one frontmatter field whose
  // vocabulary is closed, and the frontmatter module owns that validation.
  const tools = extractToolsFrontmatter(input.raw, source);

  const item: CatalogItem = {
    type,
    id,
    filePath: input.filePath,
    relativePath,
    description: requireString(frontmatter, "description", { source, optional: true }) ?? "",
    tags: requireStringArray(frontmatter, "tags", { source, optional: true }) ?? [],
    ...(precedence === undefined ? {} : { precedence }),
    ...(tools === undefined ? {} : { tools }),
    body: input.body,
    frontmatter,
    origin: input.origin,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
  };

  const collision =
    id === applyCommandPrefix(slug, type)
      ? null
      : { key: typeIdKey(type, id), paths: [relativePath], kind: "filename-mismatch" as const };
  return { item, collision };
}

/** Directory entries sorted by name, or null when the directory is absent. */
async function listDir(fs: CatalogFs, dirPath: string): Promise<Dirent[] | null> {
  try {
    return (await fs.readdir(dirPath, { withFileTypes: true })).toSorted(byName);
  } catch (error) {
    return isMissing(error) ? null : rethrow(error);
  }
}

/** File text, or null when the file is absent (a skill directory without its `SKILL.md`). */
async function readArtifact(fs: CatalogFs, filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    return isMissing(error) ? null : rethrow(error);
  }
}

/**
 * Absence, in every form the walk can meet it: the path is not there, or a path
 * segment turned out not to be a directory. Anything else — a permission
 * failure, an I/O error — is a real failure and propagates.
 */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR";
}

function rethrow(error: unknown): never {
  throw error;
}

/** Codepoint order, so the walk does not vary with the host locale. */
function byName(a: Dirent, b: Dirent): number {
  if (a.name < b.name) return -1;
  return a.name > b.name ? 1 : 0;
}

/** Filename without its `.md` extension. */
function basename(name: string): string {
  return name.slice(0, -ARTIFACT_EXTENSION.length);
}

/**
 * The id a filename implies. The engine's filename prefixes — `stamity-` on
 * agents and rules, `st-` on commands and skills — are a convention that
 * namespaces generated files inside a user's repo; neither is part of the
 * artifact's identity, so whichever one is present comes off before the
 * comparison with the declared id. Both are stripped by ONE rule rather than by
 * a class switch: a filename is walked before its class is settled, and the two
 * prefixes are reserved against user ids either way.
 *
 * Exported because the id a file implies is not this walk's private business:
 * the pack install-time collision gate has to derive the ids a pack WOULD
 * introduce before any of it is walked, and deriving them by a different rule
 * is what made that gate structurally unable to fire (`../pack/install.ts` →
 * `catalogIdOf`). One rule, one home.
 */
export function slugOf(name: string): string {
  return stripEngineContentPrefix(name);
}
