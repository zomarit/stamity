import type { Dirent } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import type * as NodeFsPromises from "node:fs/promises";
import { isAbsolute, join, normalize, posix } from "node:path";
import pLimit from "p-limit";
import { requireEnum, requireString, requireStringArray } from "../config/parse.ts";
import { CONTENT_CLASSES, type ContentClass, type RulePrecedence } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { MAX_USER_CONTENT_LENGTH } from "../guard/promptGuard.ts";
import {
  carriesEngineContentPrefix,
  contentPrefixFor,
  stripEngineContentPrefix,
} from "../types/markers.ts";
import { resolveBundledContentRoot, resolveBundledForkRoot } from "./contentRoot.ts";
import {
  composeFrontmatter,
  extractToolsFrontmatter,
  parseFrontmatter,
  parseFrontmatterBlock,
} from "./frontmatter.ts";
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
 * Four roots feed one index, in precedence order USER > FORK > PACK > CORPUS:
 * the bundled corpus, then any installed pack roots, then the package's own
 * fork layer ({@link ContentRoots.forkRoot} — `fork/`, the directory a
 * downstream fork of this repository fills with its own artifacts,
 * `docs/specs/fork-layer.md`), then the repo's own override tree
 * ({@link ContentRoots.overrideRoot} — `.stamity/overrides/`, the tree the
 * user-content lane writes). WITHIN a layer the first claimant of an id wins
 * and a second is reported as a {@link ContentCollision}, unchanged. ACROSS
 * layers the higher layer replaces the lower: the replaced artifacts leave
 * `items` so no consumer emits both bodies, and the replacement is recorded as
 * a {@link ContentShadow}. A shadow is a legitimate state — it is how a fork
 * or a repo customizes a shipped artifact — so it is reported, never thrown.
 * Packs are the one exception and stay strict: a pack and any other layer
 * never share an id. A pack claiming an id the corpus or an earlier pack holds
 * is refused, and so is a pack whose id the fork layer — walked AFTER it —
 * turns out to claim: the refusal fires on contact from either side of the
 * seam, and the pack is the party at fault whichever was walked first (see
 * {@link resolveLayerInto}). The fork layer is held one notch more strictly
 * than the corpus in exactly one place: a reserved-prefix filename under
 * `fork/` is refused on the NAME, before the file is opened ({@link scanClass}),
 * because a fork has no save gate to meet the rule at and the prefix is what
 * the engine mints onto its emissions — a source file wearing it would index as
 * a second spelling of one identity.
 *
 * Customization comes in two shapes, and exactly one of them applies to any
 * `(class, id)` WITHIN a layer. REPLACEMENT is the override above: a whole
 * artifact under the fork layer or the override tree takes the id. PATCHING is
 * the overlay layer — a `<slug>.customize.yaml` beside where that override
 * would sit patches the resolved artifact's frontmatter, a `<slug>.customize.md`
 * appends to its body, and the base keeps flowing from the layer that supplies
 * it. Discovery AND merge semantics both live in this module, in the
 * overlay-layer section below ({@link applyOverlays} and the helpers around
 * it), which states why they are folded in here rather than split into a
 * module of their own. The two shapes are mutually exclusive per layer and
 * their coexistence is refused, so within one layer an id is either replaced or
 * patched, never both. The chain that applies to any `(class, id)` is therefore
 * corpus or pack → fork (a full replacement or a patch) → user (a full
 * replacement or a patch): a fork patch lands on the item the corpus or a pack
 * supplies, and the user stage then replaces or patches whatever the fork stage
 * produced. The phrase "four-layer precedence" stays retired — it once counted
 * the two shapes of one layer as layers of their own.
 *
 * Neither customization layer's REACH is a gap or latent: the emission seam
 * supplies {@link ContentRoots.overrideRoot} (`src/cli/engine/emission.ts`),
 * so a repo's `.stamity/overrides/` tree wins the ids it claims on an ordinary
 * `sync`, and the bundled fork root rides with the bundled corpus root
 * ({@link buildContentIndex}) so a fork's `fork/` directory reaches every walk
 * that reads the package's corpus. A consumer that destructures a spec and
 * rebuilds one must carry all four parts — dropping `overrideRoot` or
 * `forkRoot` on the way into a narrowed context is a per-repo emission
 * difference, not an inert omission.
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
 * Which layer supplied an artifact: the bundled corpus, an installed pack, the
 * package's fork layer, or the repo's own override tree.
 *
 * Read by four lanes today. `./selection.ts::classifySelection` decides what
 * an empty selection still admits — a `fork` or `user` item is admitted by
 * presence. `../emit/skillsProjection.ts` stamps it onto every projected file
 * it emits, and `../emit/planner.ts` then reads it three times: a
 * `origin !== "pack"` filter narrows the corpus rows handed to
 * `mergeSkillProjections`; inside that function an override-layer test (`fork`
 * or `user`) is what tells a REPLACEMENT apart from a shipped skill when a pack
 * skill claims one id or one projection directory — the difference between
 * naming the file the operator or the fork wrote and naming four adapters that
 * had nothing to do with it; and `refuseOverrideDirectoryClash` ranks the
 * layers through {@link layerRankOf} to decide which of two rows in one
 * directory is the one to move.
 * `../cli/commands/validate.ts` reads it to label a shadow row's winner and a
 * patched row's base layer, so a reader can tell the fork layer from a consumer
 * override. This walk itself ranks the layers ({@link buildContentIndex}) and
 * refuses a reserved-prefix filename under the fork root ({@link scanClass}).
 *
 * What is NOT built on top of it is the rule the field was minted for: a `user`
 * body is user-owned end to end, so it should never be wrapped in a managed
 * block and never regenerated over. No adapter asks. An override that reaches
 * one is still rendered exactly like a shipped artifact, and the guard that
 * would change that is still to be written.
 */
export type ContentOrigin = "corpus" | "pack" | "fork" | "user";

/**
 * The two layers that may REPLACE or PATCH a lower one — the ones an overlay
 * pair can be discovered under. Packs add ids and never take one; the corpus
 * is the floor.
 */
export type CustomizingOrigin = Extract<ContentOrigin, "fork" | "user">;

/**
 * Precedence, as a rank: a claimant of a higher rank replaces one of a lower
 * rank, and equal ranks are a same-layer duplicate. Packs outrank the corpus
 * only nominally — a pack claiming a taken id is refused before this table is
 * consulted — so the table is the walk order restated, not a second rule.
 */
const LAYER_RANK: Readonly<Record<ContentOrigin, number>> = {
  corpus: 0,
  pack: 1,
  fork: 2,
  user: 3,
};

/**
 * The rank of the layer that supplied one artifact or projected row —
 * {@link LAYER_RANK} read through {@link originOf}, so a subject that carries
 * no origin ranks as the corpus. The one table, exported: the emission
 * planner's directory-clash rule (`../emit/planner.ts` →
 * `refuseOverrideDirectoryClash`) decides which of two rows in one directory
 * moves by this same order, and a second copy of the table over there was a
 * second place for the precedence chain to be stated.
 */
export function layerRankOf(subject: Pick<CatalogItem, "origin">): number {
  return LAYER_RANK[originOf(subject)];
}

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
   * The package's fork layer — `<packageRoot>/fork` in a source checkout,
   * `<packageRoot>/dist/fork` in the published package — walked after the
   * packs and winning every id it claims from them or the corpus. Absent means
   * the layer follows the corpus root: a caller that left `root` to the
   * bundled default gets the bundled fork root beside it
   * ({@link buildContentIndex}), and a caller that pinned a corpus root has
   * pinned its layer set and gets no fork layer it did not name. An absent
   * directory is the same non-event an absent class directory is.
   */
  forkRoot?: string;
  /**
   * The repo's override tree — `<repoRoot>/.stamity/overrides` — walked last and
   * winning every id it claims. Absent means the repo has no customization
   * lane in play, which is also what an absent directory means, so a caller
   * that always passes the path costs nothing on a repo that never used it.
   */
  overrideRoot?: string;
}

/**
 * Normalize either spelling of a content-root argument into its four parts.
 * Pure and total: a string is a corpus root with no pack roots, no fork layer
 * and no override tree; `undefined` leaves the corpus-root default to the
 * consumer ({@link buildContentIndex} resolves the bundled corpus and the fork
 * root beside it, other readers resolve their own).
 *
 * A caller that normalizes a spec only to rebuild one — a planner deriving a
 * narrowed context — carries all four parts through. An omitted part is not a
 * default; it is a layer that disappears for that caller alone, which surfaces
 * as customization silently present or absent depending on unrelated state
 * rather than as an error anyone can see.
 */
export function contentRootsOf(contentRoot?: string | ContentRoots): {
  root: string | undefined;
  packRoots: readonly PackContentRoot[];
  forkRoot: string | undefined;
  overrideRoot: string | undefined;
} {
  if (contentRoot === undefined || typeof contentRoot === "string") {
    return { root: contentRoot, packRoots: [], forkRoot: undefined, overrideRoot: undefined };
  }
  return {
    root: contentRoot.root,
    packRoots: contentRoot.packRoots ?? [],
    forkRoot: contentRoot.forkRoot,
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
 * One identity a higher layer took over from a lower one — a fork or user
 * artifact replacing a corpus, pack or (for a user winner) fork artifact of
 * the same class and id.
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
  /**
   * The claimant the index resolves to: the highest layer's first claimant.
   * Its {@link originOf} says which layer won — `fork` or `user`.
   */
  winner: CatalogItem;
  /**
   * Every lower-layer claimant it replaced, in walk order — a user winner over
   * a fork replacement of a corpus id lists the corpus claimant and the fork
   * one, in that order.
   */
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
   * Identities the fork layer or an override took over; empty unless one of
   * those roots claimed one. Optional on the type for the same reason
   * {@link CatalogItem.origin} is — an index assembled by hand walked nothing,
   * so it replaced nothing — and always set by {@link buildContentIndex}. Read
   * it as `shadows ?? []`.
   */
  shadows?: readonly ContentShadow[];
  /**
   * Entries the walk passed over that an author plausibly meant as artifacts —
   * a symlinked `SKILL.md`, and a fork-layer overlay half whose base no shipped
   * layer supplies ({@link forkOrphanSkipReason}). Optional for the same
   * hand-assembled-index reason as {@link shadows}; always set by
   * {@link buildContentIndex}.
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

/** Filename infix + extension of an overlay's frontmatter half. */
const OVERLAY_FRONTMATTER_SUFFIX = ".customize.yaml";

/** Filename infix + extension of an overlay's body half. */
const OVERLAY_BODY_SUFFIX = ".customize.md";

/**
 * Opening frontmatter fence, matched at the head of an overlay's body half. A
 * BOM is stripped before the test for the reason the frontmatter parser strips
 * one — the match is anchored at byte 0, so a mark written by a Windows editor
 * would otherwise hide the fence and turn a refusal into a silent pass.
 */
const OVERLAY_OPENING_FENCE = /^---[ \t]*(?:\r?\n|$)/;

/** UTF-8 byte-order mark. */
const BOM = 0xfe_ff;

/** Trailing newlines of a base body, normalised before the overlay separator. */
const TRAILING_NEWLINES = /(?:\r?\n)+$/;

/** Keys an overlay may never carry: they are the identity it is addressed BY. */
const OVERLAY_IDENTITY_KEYS = ["id", "type"] as const;

/**
 * Ceiling on an overlay's body half, in characters: the guard's own
 * {@link MAX_USER_CONTENT_LENGTH}, imported rather than restated.
 *
 * It was restated for a while, and the reason was architectural rather than
 * technical: `../guard/promptGuard.ts` was registry-wired by construction and
 * listed in `test/architecture/boundaries.test.ts`'s `REGISTRY_ONLY_MODULES` as
 * "imported by neither" of the two validators that cite it, so an import edge
 * from this walk would have retired that claim as a side effect of adding a
 * size check. Taking the edge deliberately is the change that retires it, and
 * that row is gone with this one — the ratchet only ever shrinks.
 *
 * One number now, so the two cannot drift apart at all. The cross-pin in
 * `test/content/catalog.test.ts` (one character over the limit and exactly at
 * it, both driven from the guard's constant) stays as the behavioural half.
 */

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
/**
 * Force an absolute file path to forward-slash form for display inside a
 * user-facing message. Content paths read as plain relative POSIX paths
 * everywhere the engine talks about them, and the absolute paths a message
 * carries for disambiguation are composed with the native `join`, so on Windows
 * they would otherwise leak backslash separators that no test — and no user
 * expecting a POSIX content path — should see. Rewriting every backslash (rather
 * than only the platform `sep`) matches the display-normalisation convention the
 * rest of the tree already uses and, unlike a `sep`-split, converts a Windows
 * absolute like `\repo\...` on any platform, so the behaviour is provable off
 * Windows too. The real stored path (`item.filePath`) is left native — only its
 * rendering here is normalised. A backslash is refused in a content id
 * (`assertSafePath`) before it could reach here as data.
 */
export function toPosixDisplayPath(p: string): string {
  return p.replaceAll("\\", "/");
}

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
 * The spelling one artifact is emitted, invoked and documented under: the
 * catalog id with the command namespacing removed and the filename prefix its
 * class earns restored. The inverse of {@link applyCommandPrefix}, and the one
 * answer every surface that names an artifact to a human shares.
 *
 * Which prefix a class earns is {@link contentPrefixFor}'s question, not one
 * re-decided here — a command or a skill lands on `st-`, an agent or a rule on
 * `stamity-`, and an installed pack's artifacts take the same two answers its
 * class earns in the corpus. It lives here because four callers needed it and
 * each spelled it out: the three adapters that mint the filename and the docs
 * lane that heads the reference entry. Four spellings of one rule is how a
 * page ends up advertising a name no install lands.
 *
 * An id authored with its prefix already on it renders once rather than
 * doubled, so the function is idempotent the way its inverse is.
 */
export function emittedIdFor(item: Pick<CatalogItem, "id" | "type">): string {
  const bare =
    item.type === "command" && item.id.startsWith(COMMAND_ID_PREFIX)
      ? item.id.slice(COMMAND_ID_PREFIX.length)
      : item.id;
  const prefix = contentPrefixFor(item);
  return bare.startsWith(prefix) ? bare : `${prefix}${bare}`;
}

/**
 * Walk the corpus — plus any installed-pack roots, plus the package's fork
 * layer, plus the repo's override tree — and index it. `contentRoot` defaults
 * to the package-bundled corpus, resolved lazily so a caller that supplies its
 * own root never triggers the probe; the widened object form
 * ({@link ContentRoots}) additionally names pack roots (as does
 * `options.packRoots`), the fork root and the override root.
 *
 * The fork root follows the corpus root's DEFAULT and not the argument: left
 * unnamed, it is the bundled `fork/` beside the bundled corpus when the corpus
 * root was also left to the default, and nothing at all when the caller pinned
 * a corpus root — a pinned root is a pinned layer set, and a fixture corpus
 * would otherwise be joined by whatever fork layer the running package
 * happens to ship. A package with no `fork/` resolves no fork root, so it walks
 * the three roots it always walked and indexes byte-identically.
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
 * whose type-qualified id is already claimed — by the corpus, by an earlier
 * pack, or by the fork layer walked after it — is refused with
 * `VALIDATION_ERROR`, not reported as a collision. The install-time collision
 * gate derives the ids a pack would introduce through {@link slugOf} and
 * {@link applyCommandPrefix}, i.e. by this walk's own rule
 * (`../pack/install.ts` → `catalogIdOf`), so that state is unreachable through
 * `add` for every id the ledger knows; this refusal is defence in depth for
 * state assembled any other way, because an installed pack silently shadowing
 * (or shadowed by) existing content is exactly the substitution attack the
 * trust model exists to rule out.
 *
 * The fork layer and the override tree are walked NEXT, in that order, and are
 * the opposite posture, because the author of each is the party the package or
 * the repo belongs to: an artifact there that claims an id a lower layer holds
 * WINS it, the replaced artifacts leave `items`, and the substitution is
 * reported through `shadows`. Precedence is decided by ONE rule
 * ({@link resolveLayerInto}) applied in two stages — corpus, packs and fork
 * first, then the override tree — so that a fork patch lands on the item the
 * corpus or a pack supplies BEFORE the user stage replaces or patches whatever
 * the fork stage produced. An absent fork or override directory contributes
 * nothing, exactly like an absent class directory — a repo that has customized
 * nothing indexes as it always did.
 */
export async function buildContentIndex(
  contentRoot?: string | ContentRoots,
  options: BuildContentIndexOptions = {},
): Promise<ContentIndex> {
  const spec = contentRootsOf(contentRoot);
  const root = spec.root ?? resolveBundledContentRoot();
  const forkRoot = spec.forkRoot ?? (spec.root === undefined ? resolveBundledForkRoot() : undefined);
  const fs = options.fs ?? defaultFs;
  const packRoots = mergePackRoots(spec.packRoots, options.packRoots ?? []);
  const overrideRoot = spec.overrideRoot;

  // The four class directories are disjoint reads, so they run together; the
  // results are consumed in `CONTENT_CLASSES` order, which is what makes the
  // walk order — and therefore which claimant of a duplicated id wins — fixed.
  // Pack, fork and override scans are equally disjoint and join the same batch;
  // ordering is imposed when the results are flattened, not by completion order.
  const [scanned, packScanned, forkScanned, overrideScanned, forkOverlays, userOverlays] =
    await Promise.all([
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
      forkRoot === undefined
        ? []
        : Promise.all(
            CONTENT_CLASSES.map((type) => scanClass(fs, forkRoot, type, { origin: "fork" })),
          ),
      overrideRoot === undefined
        ? []
        : Promise.all(
            CONTENT_CLASSES.map((type) => scanClass(fs, overrideRoot, type, { origin: "user" })),
          ),
      // Overlays live in the two customizing layers and nowhere else, so an
      // absent fork or override root skips its pass entirely — the same
      // non-event an absent class directory is, and what makes an overlay-free
      // package or repo index byte-identically.
      forkRoot === undefined ? [] : discoverOverlays(fs, forkRoot),
      overrideRoot === undefined ? [] : discoverOverlays(fs, overrideRoot),
    ]);

  // Layer order is the precedence order, and it is imposed here rather than by
  // which scan finished first.
  const shippedItems = [
    ...scanned.flatMap((result) => result.items),
    ...packScanned.flat().flatMap((result) => result.items),
  ];
  const forkItems = forkScanned.flatMap((result) => result.items);
  const userItems = overrideScanned.flatMap((result) => result.items);
  const collisions = [
    ...scanned.flatMap((result) => result.collisions),
    ...packScanned.flat().flatMap((result) => result.collisions),
    ...forkScanned.flatMap((result) => result.collisions),
    ...overrideScanned.flatMap((result) => result.collisions),
  ];

  // Two maps over one key set. `byKey` is what is IN FORCE — the resolved
  // claimant, or the merged artifact a patch produced over it — and is what
  // lookups and the next stage's patches read. `holders` is the claimant that
  // WON each key, untouched by patching: a user patch over a fork replacement
  // leaves the fork item as the holder while `byKey` carries the merge, and the
  // shadow row for that replacement is owed to the holder.
  const byKey = new Map<string, CatalogItem>();
  const holders = new Map<string, CatalogItem>();
  const duplicates = new Map<string, string[]>();
  const shadowedKeys = new Set<string>();

  // Stage one: everything the package ships, corpus and packs first, then the
  // fork layer over them. Fork patches run on what THIS stage resolved — the
  // item the corpus or a pack supplies, or the fork's own replacement of it,
  // which the exclusivity rule inside `applyOverlays` refuses. A fork patch
  // with no base here is skipped and reported, never thrown (the overlay-layer
  // header): the base may be a pack this repository has not installed.
  resolveLayerInto({ byKey, holders, duplicates, shadowedKeys }, [...shippedItems, ...forkItems]);
  const forkPatched = await applyOverlays(fs, forkOverlays, byKey, "fork");

  // Stage two: the repo's override tree over whatever stage one produced —
  // a fork replacement, a fork-patched item, or the untouched original — and
  // then the user patches over THAT. Patching runs on the RESOLVED item,
  // whichever layer holds the key: "the artifact currently in force" is the
  // only target that stays correct when a pack is installed or a fork layer
  // appears; targeting the corpus specifically would patch a body nobody emits
  // and report that the patch applied. A patched key is never a shadowed one
  // within its own layer (an overlay over a full override is refused), so the
  // shadow rows below read `holders`, which a patch never moves.
  resolveLayerInto({ byKey, holders, duplicates, shadowedKeys }, userItems);
  const userPatched = await applyOverlays(fs, userOverlays, byKey, "user");

  for (const [key, paths] of duplicates) collisions.push({ key, paths, kind: "duplicate-id" });

  // A replaced artifact leaves the index entirely: one identity, one body, so
  // a consumer iterating `items` cannot emit both the shipped original and
  // the replacement that took its id. What stays under a shadowed key is the
  // winning LAYER's claimants — the holder and any same-layer duplicate of it,
  // which is reported and unreachable but still there — and a fork item that
  // took a corpus id stays exactly as a user item that took one does.
  const survives = (item: CatalogItem): boolean => {
    const key = typeIdKey(item.type, item.id);
    if (!shadowedKeys.has(key)) return true;
    const holder = holders.get(key);
    return holder !== undefined && layerRankOf(item) === layerRankOf(holder);
  };
  const resolved = [...shippedItems, ...forkItems, ...userItems].filter(survives);
  // A patch does not move an item: the merged artifact takes the base's place in
  // walk order, keeping its file, its origin and its provenance. A user patch
  // over a fork-patched item composes — the fork's merge is the base the user's
  // merge was applied to, so the second map is read through the first.
  const items =
    forkPatched.patched.size === 0 && userPatched.patched.size === 0
      ? resolved
      : resolved.map((item) => {
          const afterFork = forkPatched.patched.get(item) ?? item;
          return userPatched.patched.get(afterFork) ?? afterFork;
        });
  return {
    items,
    byKey,
    collisions,
    shadows: buildShadows([...shippedItems, ...forkItems, ...userItems], holders, shadowedKeys),
    // The fork stage's skipped patches ride with the walk's other skipped
    // entries; the user stage refuses instead of skipping, so its list is
    // always empty and is not read.
    skipped: [
      ...scanned.flatMap((result) => result.skipped),
      ...packScanned.flat().flatMap((result) => result.skipped),
      ...forkScanned.flatMap((result) => result.skipped),
      ...overrideScanned.flatMap((result) => result.skipped),
      ...forkPatched.skipped,
    ],
  };
}

/**
 * The layer an item came from; `corpus` for an item assembled without one.
 * Structural on the one field it reads, so a projected row that carries the
 * same optional `origin` (`../emit/skillsProjection.ts` → `ProjectedFile`)
 * answers through the same rule an item does.
 */
export function originOf(item: Pick<CatalogItem, "origin">): ContentOrigin {
  return item.origin ?? "corpus";
}

/** The resolution state one stage of {@link resolveLayerInto} reads and writes. */
interface ResolutionState {
  /** What is in force per key: the claimant, or a patch's merge over it. */
  byKey: Map<string, CatalogItem>;
  /** The claimant that won each key, never replaced by a patch. */
  holders: Map<string, CatalogItem>;
  /** Same-layer duplicate claimants, by key, in walk order. */
  duplicates: Map<string, string[]>;
  /** Keys a higher layer took from a lower one. */
  shadowedKeys: Set<string>;
}

/**
 * The one precedence rule, applied to one batch of claimants in walk order.
 *
 * A first claimant takes its key. A later claimant of a HIGHER layer replaces
 * the holder and the key is recorded as shadowed; one of the SAME layer is a
 * duplicate, reported and unreachable — including two overrides, or two fork
 * files, of one id, because neither replaced anything. A pack meeting a taken
 * id, or a fork item meeting an id a pack took, is refused on contact: packs
 * add ids and never share one ({@link refusePackShadow}).
 *
 * Called once per stage rather than once over everything, so a fork patch can
 * run between the fork stage and the user stage (see {@link buildContentIndex}).
 * The rule does not know which stage it is in — the rank table is the whole of
 * it — which is what makes the two calls one loop rather than two.
 */
function resolveLayerInto(state: ResolutionState, claimants: readonly CatalogItem[]): void {
  const { byKey, holders, duplicates, shadowedKeys } = state;
  for (const item of claimants) {
    const key = typeIdKey(item.type, item.id);
    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, item);
      holders.set(key, item);
      continue;
    }
    // A pack is refused from either side of the seam: walked after the corpus
    // or an earlier pack it collides with, or walked BEFORE the fork item whose
    // id it claims. Either way the pack is the party at fault — a fork replaces
    // shipped content by design, and a pack never shares an id with anything.
    if (item.provenance !== undefined) refusePackShadow(item, existing);
    if (existing.provenance !== undefined && originOf(item) === "fork") {
      refusePackShadow(existing, item);
    }
    // Layers are walked low to high, so a higher-ranked claimant is a
    // replacement: it takes the id, and what it replaced is reported instead of
    // vanishing. Equal ranks fall through to the duplicate report below.
    if (layerRankOf(item) > layerRankOf(existing)) {
      byKey.set(key, item);
      holders.set(key, item);
      shadowedKeys.add(key);
      continue;
    }
    // First claimant stays reachable; every claimant is named in the report.
    duplicates.set(key, [...(duplicates.get(key) ?? [existing.relativePath]), item.relativePath]);
  }
}

/**
 * The pack-shadowing refusal, naming the pack artifact and the claimant it
 * collided with. Corpus items walk first and packs in sorted id order, so
 * against those the earlier claimant is always the cited owner; against the
 * fork layer the pack was walked first and the fork item is what it turned
 * out to be claiming.
 *
 * The two arms differ in what they can honestly say about how the state
 * arose and who can fix it. Against the corpus or an earlier pack, `add`
 * refused the pack at install time by this walk's own id rule, so the state
 * was assembled some other way and the consumer's remedies are the whole
 * answer. Against the fork layer the pack may well have been installed
 * cleanly — the fork file can arrive later, with a package upgrade — and the
 * collision has an author on each side: the consumer can remove the pack or
 * ask for a rename, and the fork can patch the pack's artifact instead of
 * replacing it, or ship its own under another id. Both are named, because
 * the reader may be either party.
 */
function refusePackShadow(packItem: CatalogItem, other: CatalogItem): never {
  const pack = packItem.provenance?.pack ?? "<pack-id>";
  const supplies =
    `Installed pack "${pack}" supplies ${packItem.type} "${packItem.id}" ` +
    `(${packItem.relativePath}), but that id is already ${claimantOf(other)}. Packs must ` +
    `not shadow existing content`;
  if (originOf(other) === "fork") {
    // The fork's patch spelling for this id: the fork file's own path with the
    // overlay suffix in place of the artifact extension, which is the layout for
    // a file class (`rules/ops.customize.yaml`) and a skill (`skills/ops/SKILL.customize.yaml`) alike.
    const patch = `fork/${other.relativePath.slice(0, -ARTIFACT_EXTENSION.length)}`;
    throw new EngineError(
      `${supplies}, and a pack and the fork layer never share an id: the pack is refused on ` +
        `contact whichever arrived first, so a fork file that came with a package upgrade ` +
        `refuses a pack that was installed before it. From this repository, remove the pack ` +
        `(clean --pack ${pack}) or ask the pack's author to rename the artifact. From the ` +
        `fork, patch the pack's artifact with ${patch}${OVERLAY_FRONTMATTER_SUFFIX} or ` +
        `${patch}${OVERLAY_BODY_SUFFIX} instead of replacing it, or ship the fork's artifact ` +
        `under another id.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  throw new EngineError(
    `${supplies} — \`add\` refuses this at install time, deriving the pack's ids by the same ` +
      `rule this walk uses, and this walk refuses it again as defence in depth for state ` +
      `assembled some other way. Remove the pack (clean --pack ${pack}) or rename the ` +
      `artifact in the pack.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * One row per identity a customizing layer took over, fork winners in the fork
 * layer's walk order and then user winners in the override tree's.
 *
 * `shadowed` lists EVERY lower-layer claimant of the id, not only the one that
 * held the key: a corpus that already duplicated an id has two files to account
 * for, and a report naming one of them would send the author to the wrong file
 * when the other is the one that stopped being emitted. Lower is by rank, so a
 * user winner over a fork replacement lists the corpus claimant AND the fork
 * one, while the fork item — a winner in its own stage before the user took
 * the id — wins no row of its own.
 *
 * Winners are read from `holders`, the claimant that won each key, rather than
 * from the in-force map: a user patch over a fork replacement leaves a merged
 * item in force under the fork's key, and the fork's row must not vanish
 * because a higher layer patched what it replaced.
 */
function buildShadows(
  claimants: readonly CatalogItem[],
  holders: ReadonlyMap<string, CatalogItem>,
  shadowedKeys: ReadonlySet<string>,
): ContentShadow[] {
  if (shadowedKeys.size === 0) return [];

  const contested = new Map<string, CatalogItem[]>();
  for (const item of claimants) {
    const key = typeIdKey(item.type, item.id);
    if (!shadowedKeys.has(key)) continue;
    const list = contested.get(key);
    if (list === undefined) contested.set(key, [item]);
    else list.push(item);
  }

  // Only the claimant that actually won the key wins a row: a second override
  // of the same id replaced nothing, and is reported as a duplicate instead.
  return claimants.flatMap((winner) => {
    if (layerRankOf(winner) < LAYER_RANK.fork) return [];
    const key = typeIdKey(winner.type, winner.id);
    if (holders.get(key) !== winner) return [];
    const rank = layerRankOf(winner);
    const shadowed = (contested.get(key) ?? []).filter((item) => layerRankOf(item) < rank);
    return shadowed.length === 0 ? [] : [{ type: winner.type, id: winner.id, winner, shadowed }];
  });
}

/**
 * The lowest-layer claimant a customizing artifact replaced — the corpus or
 * pack artifact whose id it took, or the fork artifact it took an id from when
 * that one was the fork's own addition — or `undefined` for an artifact that
 * replaced nothing: a shipped one, or a fork or user addition.
 *
 * Read from {@link ContentIndex.shadows} by KEY rather than by identity, so
 * the item in force under a customized id answers the same whether it is the
 * winner itself or a patch's merge over it (`items` carries the merge, the
 * shadow row carries the winner). `shadowed` is in walk order, so its first
 * entry is the lowest layer's reachable claimant — the one whose emitted
 * spelling a replacement inherits (`../emit/skillsProjection.ts`).
 */
export function replacedClaimantOf(
  index: ContentIndex,
  item: Pick<CatalogItem, "type" | "id">,
): CatalogItem | undefined {
  const shadow = (index.shadows ?? []).find((row) => row.type === item.type && row.id === item.id);
  return shadow?.shadowed[0];
}

/** How a refusal names the artifact already holding a contested id. */
function claimantOf(existing: CatalogItem): string {
  if (existing.provenance !== undefined) {
    return `claimed by installed pack "${existing.provenance.pack}" (${existing.relativePath})`;
  }
  return originOf(existing) === "fork"
    ? `claimed by the fork-layer artifact at fork/${existing.relativePath}`
    : `claimed by the corpus artifact at ${existing.relativePath}`;
}

/**
 * ── The overlay layer ────────────────────────────────────────────────────────
 *
 * An overlay states a DELTA rather than a replacement: `.customize.yaml` patches
 * the resolved artifact's frontmatter, `.customize.md` appends to its body, and
 * the base keeps flowing from the corpus or the pack that supplies it — so the
 * patch survives an upstream rewrite of everything it did not name. The
 * alternative, a full override, is a copy of the whole artifact that stops
 * tracking the original in silence.
 *
 * It lives HERE, in the walk, rather than in a module of its own. Discovery is
 * layout — which directory each class lives in, that a skill's readable file is
 * composed rather than listed, how a filename becomes a slug — and every one of
 * those facts already has its home in this file. Merging is the walk's own item
 * contract, because the merged document goes straight back through
 * {@link buildItem}. A second module would have had to import the layout, the
 * slug rule and the item builder to say anything at all, which is a seam that
 * carries no boundary.
 *
 * Every defect fails closed with `VALIDATION_ERROR` naming the absolute path and
 * the offending field — the posture the walk already takes for a malformed
 * artifact, and for the same reason. Warn-and-skip was the alternative and its
 * observable outcome is exactly the bug this layer closes: a tree that looks
 * customized and a sync that ships the bundled body.
 *
 * One defect is judged by STAGE, because the two customizing layers have
 * different reach. A USER pair addressed at an id no layer supplies is refused
 * ({@link refuseOrphanOverlay}): the file is the repo's own, the fix is one
 * rename, and a typo that stops a run is cheaper than a patch that silently
 * never lands. A FORK pair whose base neither the corpus, an installed pack nor
 * the fork layer supplies is SKIPPED — not applied, not thrown — and reported
 * through {@link ContentIndex.skipped} with {@link forkOrphanSkipReason}. The
 * fork layer is package-global where the override tree is per-repository: a
 * fork patch of a pack-supplied id is legitimate in the fork's own checkout and
 * in every consumer that installed the pack, and refusing it would hard-fail
 * `sync`, `check` and `validate` in every consumer repository WITHOUT the pack
 * — over a file inside their `node_modules` that they can fix nothing about.
 * The fork author still sees the skip: `stamity validate` prints it as a
 * warning naming the artifact the patch waits for.
 */

/** Which half of a pair an overlay file is. */
type OverlayHalfKind = "frontmatter" | "body";

/** One overlay file: where it is, and what it says. */
interface OverlayHalf {
  /** Absolute path, named in every refusal this file can cause. */
  path: string;
  /** File text, verbatim. */
  text: string;
}

/** The halves read for one artifact. Either may be absent; both may not. */
interface OverlayHalves {
  frontmatter?: OverlayHalf;
  body?: OverlayHalf;
}

/** A merged artifact, ready to go back through {@link buildItem}. */
interface MergedOverlay {
  /** Merged frontmatter map: base order first, overlay-only keys appended. */
  frontmatter: Record<string, unknown>;
  /** Merged body: the base's, one blank line, then the body half. */
  body: string;
  /**
   * The merged document as text. {@link buildItem} re-reads `tools` from the RAW
   * document rather than from the map, so a merge with no raw twin would either
   * skip the closed tool-vocabulary check or need a second implementation of it
   * — and a gate that disagrees with itself is worse than no gate.
   */
  raw: string;
  /**
   * Label for every refusal the merged artifact can raise: the base file's
   * absolute path plus every overlay path applied. The `require*` helpers
   * already prefix their messages with it and already name the field, so both
   * files and the offending key land in one line with no extra plumbing.
   */
  source: string;
}

/**
 * Which half — if either — a filename in the override tree is. `base` is the
 * name with the suffix removed and nothing else done to it; turning that into a
 * slug is {@link slugOf}'s business.
 */
function overlayHalfOf(name: string): { base: string; half: OverlayHalfKind } | null {
  if (name.endsWith(OVERLAY_FRONTMATTER_SUFFIX)) {
    return { base: name.slice(0, -OVERLAY_FRONTMATTER_SUFFIX.length), half: "frontmatter" };
  }
  if (name.endsWith(OVERLAY_BODY_SUFFIX)) {
    return { base: name.slice(0, -OVERLAY_BODY_SUFFIX.length), half: "body" };
  }
  return null;
}

/**
 * The filename one half takes for a given base name — the inverse of
 * {@link overlayHalfOf}, and why the two suffixes are spelled once. A skill's
 * halves are COMPOSED (`SKILL.customize.yaml`) rather than listed, so the walk
 * has to build those names rather than recognise them.
 */
function overlayHalfName(base: string, half: OverlayHalfKind): string {
  return `${base}${half === "frontmatter" ? OVERLAY_FRONTMATTER_SUFFIX : OVERLAY_BODY_SUFFIX}`;
}

/** True for either half; the artifact candidate filter narrows itself by it. */
function isOverlayFileName(name: string): boolean {
  return overlayHalfOf(name) !== null;
}

/**
 * Merge one pair over its base.
 *
 * Frontmatter is a SHALLOW key set: a key the overlay declares replaces the base
 * value entirely, a key whose value is null is removed, a key the overlay does
 * not name is untouched, and lists and nested maps replace whole. There are no
 * merge verbs in v1 — each one is a second language an author writes and a
 * reviewer has to simulate, and list UNION in particular is the option that
 * looks helpful and is not, because under it a tag can never be removed without
 * introducing a verb anyway.
 *
 * The body is APPEND-only. No section-anchor convention exists in any content
 * class, so an anchored insert would have to invent one; a prepended note lands
 * above the artifact's own first heading and reads as its opening, which is the
 * one position that changes how a client renders the file.
 */
function mergeOverlay(base: CatalogItem, halves: OverlayHalves): MergedOverlay {
  const patch = halves.frontmatter === undefined ? {} : readOverlayFrontmatter(halves.frontmatter);
  const appended = halves.body === undefined ? undefined : readOverlayBody(halves.body);

  const frontmatter = mergeOverlayFrontmatter(base.frontmatter, patch);
  const body = appended === undefined ? base.body : appendOverlayBody(base.body, appended);
  const applied = [halves.frontmatter?.path, halves.body?.path].filter(
    (path): path is string => path !== undefined,
  );

  return {
    frontmatter,
    body,
    raw: composeFrontmatter(frontmatter, body),
    source: `${toPosixDisplayPath(base.filePath)} (patched by ${applied.map(toPosixDisplayPath).join(", ")})`,
  };
}

/** Parse the frontmatter half and refuse anything that would move the identity. */
function readOverlayFrontmatter(half: OverlayHalf): Record<string, unknown> {
  // The document IS the block, so it goes through the frontmatter module's own
  // strict parser: one parser, one re-coding of a YAML failure into a content
  // defect, and no second implementation to disagree with the first.
  const patch = parseFrontmatterBlock(half.text, toPosixDisplayPath(half.path));

  for (const key of OVERLAY_IDENTITY_KEYS) {
    // `hasOwn`, not a value read: `id:` with no value is a removal request, and
    // removing the identity is the same defect as changing it. Ignoring the key
    // with a warning was the alternative — an ignored key is indistinguishable
    // from a working one to the author who wrote it.
    if (!Object.hasOwn(patch, key)) continue;
    throw new EngineError(
      `${toPosixDisplayPath(half.path)}: an overlay must not declare \`${key}\`. That is the identity the overlay ` +
        `is addressed BY — a patch that moved it would re-target itself and orphan its own ` +
        `base. Remove the \`${key}\` key.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return patch;
}

/**
 * Read the body half, refusing a frontmatter fence at its head and a body past
 * the user-content ceiling.
 *
 * The ceiling is measured over the RAW file text — before the BOM strip below —
 * because that is the number `stamity validate` reports for the same file
 * (`../cli/commands/validate.ts` → `cappedBody`, over the body length
 * `./userContent.ts` records at discovery). Measuring the stripped text instead
 * would put the two gates one character apart at exactly the limit.
 *
 * Held HERE and not only there because the two gates were failing closed in
 * opposite directions: validate refused an oversized body patch and the walk
 * merged it, so a repo could sync a patch its own validator rejects. Text past
 * the ceiling is truncated where the artifact re-enters agent context, so the
 * client runs a body the author was never shown a flag for — silent, which is
 * the direction this layer exists to close.
 */
function readOverlayBody(half: OverlayHalf): string {
  if (half.text.length > MAX_USER_CONTENT_LENGTH) {
    throw new EngineError(
      `${toPosixDisplayPath(half.path)}: the body patch is ${half.text.length} characters, over the ` +
        `${MAX_USER_CONTENT_LENGTH}-character ceiling on user-authored content. Text past it is ` +
        `truncated where the artifact re-enters agent context, so the patch on disk stops being ` +
        `the patch the client gets — split the patch, or move the material into a skill support ` +
        `file.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  const text = half.text.charCodeAt(0) === BOM ? half.text.slice(1) : half.text;
  if (OVERLAY_OPENING_FENCE.test(text)) {
    throw new EngineError(
      `${toPosixDisplayPath(half.path)}: a body overlay carries a body and nothing else, but this one opens with a ` +
        `\`---\` frontmatter fence. Frontmatter is patched by the other half of the pair — move ` +
        `those keys into the matching \`${OVERLAY_FRONTMATTER_SUFFIX}\` file.`,
      { code: "VALIDATION_ERROR" },
    );
  }
  return text;
}

/**
 * Shallow key-set merge, preserving the base's declared key order and appending
 * overlay-only keys in the order the overlay declared them. Order is not
 * cosmetic: a re-emitted head that reshuffled its keys is a diff nobody asked
 * for on every artifact the overlay touched.
 */
function mergeOverlayFrontmatter(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  // Null-prototype: a computed-key assignment (`merged[key] = value`) with
  // `key === "__proto__"` on an ordinary `{}` does not create an own property
  // of that name — it reassigns `merged`'s own `[[Prototype]]` through the
  // inherited setter, and the key vanishes from `Object.keys`/`Object.entries`
  // silently rather than merging. An author who names a frontmatter key
  // `__proto__` (YAML permits it) would see it disappear with no refusal, on
  // an object that never inherits that setter to begin with.
  const merged: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(base)) {
    if (!Object.hasOwn(patch, key)) {
      merged[key] = value;
      continue;
    }
    // Null is removal, in both spellings YAML gives it: `key:` and `key: null`.
    if (patch[key] !== null) merged[key] = patch[key];
  }
  for (const [key, value] of Object.entries(patch)) {
    // Removing a key the base never declared is a no-op rather than a defect:
    // the merged map is the same either way.
    if (Object.hasOwn(base, key) || value === null) continue;
    merged[key] = value;
  }
  return merged;
}

/**
 * Base body, exactly one blank line, then the appended text. The base's own
 * bytes are otherwise untouched; only its trailing newlines are normalised, so
 * a base that already ended in blank lines does not widen the separator.
 */
function appendOverlayBody(base: string, appended: string): string {
  const trimmed = base.replace(TRAILING_NEWLINES, "");
  return trimmed === "" ? appended : `${trimmed}\n\n${appended}`;
}

/**
 * A USER-stage overlay addressed at an id no layer supplies — the four layers
 * the message names are all resolved by the time a user pair is applied.
 *
 * Loud rather than inert: an overlay is addressed BY its filename, so a typo in
 * that filename is the likeliest authoring mistake and is otherwise undetectable
 * — the author sees a file on disk and an unchanged artifact, with nothing
 * connecting the two. The cost is real (a typo stops a run that used to
 * succeed), and the fix is one step either way. The fork stage takes the other
 * posture ({@link forkOrphanSkipReason}) for the reason the overlay-layer
 * header gives.
 */
function refuseOrphanOverlay(paths: readonly string[], type: ContentClass, id: string): never {
  throw new EngineError(
    `Overlay ${paths.map(toPosixDisplayPath).join(" and ")} patches ${type} "${id}", but no artifact of that id exists ` +
      `in any layer the patch can reach — not the corpus, not an installed pack, not the fork ` +
      `layer, not the override tree. An overlay is addressed by its filename, so this is usually ` +
      `a typo in it. Correct the filename, or remove the file.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * Why a fork-stage overlay with no base was passed over — the fork stage's
 * answer to the user stage's {@link refuseOrphanOverlay}, and stage-aware in
 * what it claims was searched: the override tree is not resolved when a fork
 * pair is applied, so it is not among the layers this text names. Reported
 * rather than thrown for the reason the overlay-layer header gives (the fork
 * layer is package-global), and phrased after the file path the way a skipped
 * entry's reason is (`./userContent.ts` → `SkippedUserEntry`), so `stamity
 * validate` prints it verbatim as `<fork file>  <reason>`.
 */
function forkOrphanSkipReason(type: ContentClass, id: string): string {
  return (
    `waits for an artifact no installed layer supplies — neither the corpus, an installed ` +
    `pack nor the fork layer holds ${type} "${id}", so this fork patch is skipped and nothing ` +
    `in it reaches emission; it applies when a pack supplies ${type} "${id}". If no pack ` +
    `ever will, the filename is a typo in the fork: correct it there, or remove the file.`
  );
}

/**
 * An overlay and a full override of one identity.
 *
 * A full override is the author's own file, so patching it means editing it and
 * the combination serves no purpose a text editor does not serve better.
 * Refusing it is also what keeps the effective precedence chain legible: an id
 * is either replaced or patched, never both, so a downstream report has two
 * customization outcomes to print rather than four.
 */
/**
 * Refuse an overlay filename spelled WITH an engine content prefix
 * (`stamity-`/`st-`).
 *
 * {@link slugOf} strips the prefix before resolving what a pair patches, so
 * `stamity-security.customize.yaml` and `security.customize.yaml` name the
 * exact same patch — accepting both leaves two spellings for one identity,
 * which is what let a prefix-spelled overlay pass this walk while the
 * save-path's exclusivity probe (`../content/userContent.ts` →
 * `saveIdDefect`), which composes its candidate paths from the bare id only,
 * never saw it coming. One spelling is canonical here for the same reason
 * `saveIdDefect` reserves the prefix on the save side: the bare slug.
 *
 * `halfPaths` names every half FILE this refusal is also about, in addition to
 * `path` (the file-layout half itself, or a skill's carrier directory).
 * `stamity validate` attributes an overlay refusal to a finding by matching the
 * message against a half's absolute path (`../cli/commands/validate.ts` →
 * `overlayFailure`/`halfPaths`) — it never has the carrier directory to match
 * against, only the halves inside it — so a message naming the directory alone
 * is unattributable there: it degrades to a note at exit 0 while the overlay
 * still throws on the next `sync`. Naming a half path too is what keeps this
 * refusal reachable by both readers of the message: this walk (which resolves
 * an overlay by its carrier) and `validate` (which resolves one by its halves).
 */
function refusePrefixedOverlaySpelling(
  path: string,
  base: string,
  halfPaths: readonly string[] = [],
): never {
  const bare = stripEngineContentPrefix(base);
  const halves = halfPaths.length > 0 ? ` (${halfPaths.map(toPosixDisplayPath).join(" and ")})` : "";
  throw new EngineError(
    `${toPosixDisplayPath(path)}${halves}: an overlay filename carries the engine content prefix, which names the ` +
      `generated corpus, not a repo's own patch. Save it under the bare spelling ` +
      `${JSON.stringify(bare)} instead — the canonical form the save gate's own reserved-prefix ` +
      `rule also requires.`,
    { code: "VALIDATION_ERROR" },
  );
}

function refuseOverlayExclusivity(overridePath: string, overlayPaths: readonly string[]): never {
  const overlays = overlayPaths.map(toPosixDisplayPath).join(" and ");
  const override = toPosixDisplayPath(overridePath);
  throw new EngineError(
    `The override at ${override} and the overlay ${overlays} claim one identity. An artifact ` +
      `is either REPLACED by a full override or PATCHED by an overlay, never both — a full ` +
      `override is your own file, so patch it by editing it. Remove ${overlays}, or remove ` +
      `${override}.`,
    { code: "VALIDATION_ERROR" },
  );
}

/** One artifact's overlay halves, as the override tree holds them. */
interface DiscoveredOverlay {
  /** Class the halves patch, from the class directory they were found in. */
  type: ContentClass;
  /** Filename slug they address, prefix-stripped by {@link slugOf}. */
  slug: string;
  /** Absolute path of the `.customize.yaml` half, when present. */
  frontmatterPath?: string;
  /** Absolute path of the `.customize.md` half, when present. */
  bodyPath?: string;
  /** Absolute path of a full override of the same slug — refused when present. */
  overridePath?: string;
}

/**
 * Every overlay pair under one customizing root — the override tree, or the
 * fork layer — in class order then name order.
 *
 * A distinct pass rather than a branch inside {@link scanClass}, because the two
 * answer different questions: the scan asks "is this an artifact", and an
 * overlay is emphatically not one — it is a delta addressed at an artifact some
 * other layer supplies. Overlays are looked for in the two customizing layers
 * ONLY. The corpus and pack trees are framework territory, and a patch sitting
 * beside the file it patches would be a customization the author cannot carry
 * forward — which is exactly what `fork/` exists to hold for a fork.
 */
async function discoverOverlays(fs: CatalogFs, root: string): Promise<DiscoveredOverlay[]> {
  const perClass = await Promise.all(
    CONTENT_CLASSES.map(async (type) => {
      const { dir, layout } = CLASS_LAYOUT[type];
      const entries = await listDir(fs, join(root, dir));
      if (entries === null) return [];
      return layout === "directory"
        ? scanSkillOverlays(fs, root, type, entries)
        : fileOverlays(root, type, entries);
    }),
  );
  return perClass.flat();
}

/**
 * Overlays for a file-layout class, plus the full override of the same slug when
 * the tree holds one — the two are collected in a single listing because the
 * exclusivity refusal needs both, and a second listing could disagree with the
 * first about what is on disk.
 */
function fileOverlays(root: string, type: ContentClass, entries: Dirent[]): DiscoveredOverlay[] {
  const { dir } = CLASS_LAYOUT[type];
  const found = new Map<string, DiscoveredOverlay>();
  const overrides = new Map<string, string>();

  for (const entry of entries) {
    // Regular files only: a symlink is never followed out of the tree it was
    // found in, on this pass as on every other in this module.
    if (!entry.isFile()) continue;
    const path = join(root, dir, entry.name);
    const half = overlayHalfOf(entry.name);
    if (half === null) {
      if (entry.name.endsWith(ARTIFACT_EXTENSION)) overrides.set(slugOf(basename(entry.name)), path);
      continue;
    }
    if (carriesEngineContentPrefix(half.base)) refusePrefixedOverlaySpelling(path, half.base);
    const slug = slugOf(half.base);
    const existing = found.get(slug);
    // One pair per slug: the two halves are two files describing one patch, so
    // the second one found joins the first rather than starting a second pair.
    const pair = existing ?? { type, slug };
    if (half.half === "frontmatter") pair.frontmatterPath = path;
    else pair.bodyPath = path;
    if (existing === undefined) found.set(slug, pair);
  }

  const pairs = [...found.values()];
  for (const pair of pairs) {
    const overridePath = overrides.get(pair.slug);
    if (overridePath !== undefined) pair.overridePath = overridePath;
  }
  return pairs;
}

/**
 * Overlays for the one directory-layout class. A skill's readable file is
 * COMPOSED rather than listed, and so are its overlay halves, so each skill
 * directory is listed to see which of the three files it holds.
 *
 * A directory carrying overlay halves and no `SKILL.md` is an overlay CARRIER,
 * not work in progress: the base it patches lives in the corpus or in a pack,
 * so there is nothing for the author to put beside them.
 */
async function scanSkillOverlays(
  fs: CatalogFs,
  root: string,
  type: ContentClass,
  entries: Dirent[],
): Promise<DiscoveredOverlay[]> {
  const { dir } = CLASS_LAYOUT[type];
  const skillDirs = entries.filter((entry) => entry.isDirectory());
  // Bounded like every other fan-out over this tree's own entries
  // (`READ_CONCURRENCY`, below): a repo's skill count is small by design, not
  // by guarantee, and an unbounded `Promise.all` here was the one directory
  // listing pass in this module that did not share that ceiling.
  const listings = await pLimit(READ_CONCURRENCY).map(skillDirs, (entry) =>
    listDir(fs, join(root, dir, entry.name)),
  );
  const skillBase = basename(SKILL_FILE);

  return skillDirs.flatMap((entry, index) => {
    const inner = listings[index] ?? [];
    const pathOf = (name: string): string | undefined =>
      inner.some((candidate) => candidate.name === name && candidate.isFile())
        ? join(root, dir, entry.name, name)
        : undefined;

    const frontmatterPath = pathOf(overlayHalfName(skillBase, "frontmatter"));
    const bodyPath = pathOf(overlayHalfName(skillBase, "body"));
    if (frontmatterPath === undefined && bodyPath === undefined) return [];
    if (carriesEngineContentPrefix(entry.name)) {
      refusePrefixedOverlaySpelling(
        join(root, dir, entry.name),
        entry.name,
        [frontmatterPath, bodyPath].filter((p): p is string => p !== undefined),
      );
    }
    const overridePath = pathOf(SKILL_FILE);
    return [
      {
        type,
        slug: slugOf(entry.name),
        ...(frontmatterPath === undefined ? {} : { frontmatterPath }),
        ...(bodyPath === undefined ? {} : { bodyPath }),
        ...(overridePath === undefined ? {} : { overridePath }),
      },
    ];
  });
}

/**
 * Merge every discovered pair over the item its `(class, slug)` resolves to, and
 * answer base-item → merged-item so the caller can put each merged artifact in
 * its base's place.
 *
 * `layer` is the customizing layer the pairs were discovered under. Exclusivity
 * is judged against IT: a pair may not patch an id the same layer also replaced
 * whole — that is one file too many — while a pair from a higher layer patching
 * a lower layer's replacement is the chain working (a user patch over a fork
 * replacement lands on the fork's body). The caller sequences the two layers
 * so that a fork pair only ever sees what the corpus, the packs and the fork
 * itself resolved.
 *
 * The merged document goes back through {@link buildItem} as `raw`, so it
 * re-runs the EXACT checks an authored artifact runs — including the closed
 * tool vocabulary, which is read from the raw text rather than from the map.
 * Validating the overlay in isolation was the alternative and does not work: a
 * removal is only judgeable against its base, since `description:` is a no-op
 * alone and a missing required field once merged.
 *
 * A pair with no base is the one place the two layers part: the user stage
 * refuses it, the fork stage skips it and answers the skipped halves in
 * `skipped` (the overlay-layer header states why). `skipped` is therefore
 * always empty for the user layer.
 */
async function applyOverlays(
  fs: CatalogFs,
  overlays: readonly DiscoveredOverlay[],
  byKey: Map<string, CatalogItem>,
  layer: CustomizingOrigin,
): Promise<{ patched: Map<CatalogItem, CatalogItem>; skipped: SkippedUserEntry[] }> {
  const patched = new Map<CatalogItem, CatalogItem>();
  const skipped: SkippedUserEntry[] = [];
  if (overlays.length === 0) return { patched, skipped };

  // Read first, merge second: bounded concurrency for the same reason the
  // artifact reads are bounded, and it keeps the merge loop synchronous so a
  // refusal stops it at the offending pair.
  const paths = overlays.flatMap(overlayPathsOf);
  const texts = await pLimit(READ_CONCURRENCY).map(paths, (path) => readArtifact(fs, path));
  const textByPath = new Map(paths.map((path, index) => [path, texts[index] ?? null]));

  for (const overlay of overlays) {
    const overlayPaths = overlayPathsOf(overlay);
    if (overlay.overridePath !== undefined) {
      refuseOverlayExclusivity(overlay.overridePath, overlayPaths);
    }
    const id = applyCommandPrefix(overlay.slug, overlay.type);
    const key = typeIdKey(overlay.type, id);
    const base = byKey.get(key);
    if (base === undefined) {
      // Judged by stage (the overlay-layer header): the user stage refuses,
      // the fork stage skips and reports. Refused AFTER the exclusivity check
      // above on purpose — a fork replacement beside a fork patch of one id is
      // the fork author's own defect whether or not a base exists.
      if (layer === "user") refuseOrphanOverlay(overlayPaths, overlay.type, id);
      const reason = forkOrphanSkipReason(overlay.type, id);
      skipped.push(...overlayPaths.map((filePath) => ({ type: overlay.type, filePath, reason })));
      continue;
    }
    // Exclusivity again, read by IDENTITY rather than by filename: a
    // replacement in this same layer whose declared id disagrees with its own
    // filename still REPLACED this id, and within one layer an id is either
    // replaced or patched, never both.
    if (originOf(base) === layer) refuseOverlayExclusivity(base.filePath, overlayPaths);

    const halves = halvesOf(overlay, textByPath);
    // Both halves vanished between the listing and the read. Nothing to apply,
    // and nothing an author can act on — the same non-event an absent file is.
    if (halves === null) continue;

    const merged = mergeOverlay(base, halves);
    const built = buildItem({
      type: overlay.type,
      // The base's own id, not the filename slug: the merged artifact IS that
      // artifact, so a filename disagreement the scan already reported must not
      // be reported a second time by the rebuild.
      slug: base.id,
      raw: merged.raw,
      relativePath: base.relativePath,
      filePath: base.filePath,
      // Decision-13 naming parity: one line names the base, every overlay file
      // applied, and the offending field.
      source: merged.source,
      frontmatter: merged.frontmatter,
      body: merged.body,
      origin: originOf(base),
      ...(base.provenance === undefined ? {} : { provenance: base.provenance }),
    });
    byKey.set(key, built.item);
    patched.set(base, built.item);
  }
  return { patched, skipped };
}

/** Every overlay path of one pair, frontmatter half first. */
function overlayPathsOf(overlay: DiscoveredOverlay): string[] {
  return [overlay.frontmatterPath, overlay.bodyPath].filter(
    (path): path is string => path !== undefined,
  );
}

/** The read halves of one pair, or null when neither could be read. */
function halvesOf(
  overlay: DiscoveredOverlay,
  textByPath: ReadonlyMap<string, string | null>,
): OverlayHalves | null {
  const halfAt = (path: string | undefined): OverlayHalf | undefined => {
    if (path === undefined) return undefined;
    const text = textByPath.get(path);
    return text === null || text === undefined ? undefined : { path, text };
  };
  const frontmatter = halfAt(overlay.frontmatterPath);
  const body = halfAt(overlay.bodyPath);
  if (frontmatter === undefined && body === undefined) return null;
  return {
    ...(frontmatter === undefined ? {} : { frontmatter }),
    ...(body === undefined ? {} : { body }),
  };
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
  /** Pack identity + its disclosed footprint — absent for every root that is not a pack's. */
  provenance?: { pack: string; declaredTools: readonly string[] };
}

/**
 * Refuse a fork-layer artifact filename spelled WITH an engine content prefix
 * (`stamity-`/`st-`) — `fork/rules/stamity-security.md`, or a skill directory
 * `fork/skills/st-acme-review/`.
 *
 * The fork layer's ids are bare slugs (`docs/specs/fork-layer.md`,
 * REQ-FORK-001), for the reason an overlay filename's are
 * ({@link refusePrefixedOverlaySpelling}): {@link slugOf} strips the prefix
 * before an id is derived, so `stamity-security.md` and `security.md` would
 * name one identity under two spellings, and the prefix is what the ENGINE
 * mints onto its emitted files — a source file wearing it reads as generated.
 * The override tree is not held to this at index time (its save gate refuses
 * the prefix instead, `./userContent.ts` → `saveIdDefect`); a fork has no save
 * gate, so the walk is where its authors meet the rule. The bare spelling
 * replaces a prefixed corpus file of the same id exactly as a user override
 * does — prefix and all.
 */
function refusePrefixedForkSpelling(path: string, name: string, layout: "file" | "directory"): never {
  const bare = stripEngineContentPrefix(name);
  const noun = layout === "directory" ? "skill directory" : "filename";
  throw new EngineError(
    `${toPosixDisplayPath(path)}: a fork-layer ${noun} carries the engine content prefix, which ` +
      `names the generated corpus, not the fork's own artifact. Save it under the bare spelling ` +
      `${JSON.stringify(bare)} instead — a bare slug that matches a bundled artifact's id ` +
      `replaces it, prefix and all.`,
    { code: "VALIDATION_ERROR" },
  );
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
    // An overlay half is never an artifact candidate, in any layer. `.customize.yaml`
    // was already excluded by the extension test; `.customize.md` was NOT, so a body
    // patch carrying a frontmatter block indexed as a phantom artifact at id
    // `<slug>.customize` — a claimant nobody wrote, emitted beside the artifact it
    // meant to patch. The narrowing is what makes the two files mean one thing each.
    .filter(
      (entry) =>
        layout === "directory" ||
        (entry.name.endsWith(ARTIFACT_EXTENSION) && !isOverlayFileName(entry.name)),
    );

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

    // The fork layer's one index-time spelling rule, judged on the name before
    // the file is opened — like the overlay rule it mirrors, and unlike the
    // override tree, whose prefixed files index (its save gate holds the rule).
    if (options.origin === "fork" && carriesEngineContentPrefix(entry.name)) {
      refusePrefixedForkSpelling(
        layout === "directory" ? join(root, dir, entry.name) : filePath,
        entry.name,
        layout,
      );
    }

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

    // Labelled with the absolute path, not the relative one: `skills/verify/SKILL.md`
    // spells a corpus file, a pack copy, and an override identically, and a refusal
    // that names it sends the author to whichever twin they open first. Each layer
    // has its own root, so `filePath` distinguishes them by construction — and it
    // still ends in the relative path, so nothing downstream loses that spelling.
    const parsed = parseFrontmatter(raw, toPosixDisplayPath(candidate.filePath));
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
  /**
   * Label every field-level refusal is prefixed with; {@link filePath} when
   * absent. A MERGED artifact passes a composite naming the base file and every
   * overlay applied, because a refusal caused by a patch has two candidate files
   * and naming one of them sends the author to the wrong one.
   */
  source?: string;
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
  // The absolute path labels every field-level refusal below, for the reason the
  // walk labels its parse with it: only the root tells a corpus artifact apart
  // from a pack copy or an override of the same name. `relativePath` stays the
  // indexed identity — it is what collisions and shadows are reported under.
  const source = toPosixDisplayPath(input.source ?? input.filePath);

  const declared = requireString(frontmatter, "id", { source, optional: true })?.trim();
  const bareId = declared === undefined || declared === "" ? slug : declared;
  // Validated before the command prefix goes on: `cmd-..` is a literal segment
  // name that no traversal check would object to, so prefixing first would hide
  // exactly the id this guard exists to catch.
  assertSafePath(bareId, `${source} \`id\``);
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
