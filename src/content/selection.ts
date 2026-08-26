/**
 * Selection: which artifacts of the indexed corpus a setup installs, and how a
 * persisted selection is replayed at emission time.
 *
 * Selection is EXPLICIT here — id lists plus tag and language filters run
 * against the catalog, with no bundle arithmetic in the engine. Named bundles
 * ("minimal", "full", an archetype) are a CLI concern that layers on top by
 * handing this resolver the ids it stands for, so the engine keeps one
 * selection model instead of one per bundle vocabulary.
 *
 * Two halves sharing one vocabulary:
 *
 *   - {@link resolveSelection} turns filters into a {@link ContentSelection} —
 *     what a setup installs, recorded in the manifest.
 *   - {@link buildSelectionAllowlist} + {@link classifySelection} replay that
 *     record when files are emitted — what a generated tree is allowed to
 *     contain. Sharing the membership rule is what keeps a selection made at
 *     install time from disagreeing with the filter applied at emission time.
 *
 * Floor artifacts (`floor:*` tags) resist deselection at both ends: the
 * resolver admits them whatever the ids and tag filters say, and the classifier
 * never drops one — an absent floor artifact reads as `keep-protected-missing`,
 * so a caller can repair a hand-edited manifest instead of silently shipping a
 * setup with its security floor removed. Language is the one filter floor does
 * not bypass: a `lang:python` artifact in a Go repo is inapplicable, not merely
 * unwanted.
 *
 * ## What the floor actually holds
 *
 * A protection mechanism that protects nothing is indistinguishable from an
 * absent one, and this one held zero artifacts until the membership below was
 * declared — every agent and every security rule was silently deselectable, and
 * `keep-protected-missing` was unreachable. Membership is a property of the
 * CONTENT (a `floor:*` tag on the artifact), not a list in this module, so
 * adding an artifact to the floor is a source edit a reviewer sees:
 *
 * - **`floor:spine`** — the five agents every command flow routes through:
 *   researcher, implementer, reviewer, fixer, test-runner. The line is drawn at
 *   "a shipped command delegates to it and has no alternative path": deselect
 *   the reviewer and `/stamity-work` still runs, but its review phase silently
 *   becomes a no-op, which is worse than a missing command. `spec-author` and
 *   `creator` sit outside — they serve specific workflows (`/stamity-spec`,
 *   scaffolding), so a setup that does not use those workflows can legitimately
 *   drop them.
 * - **`floor:security`** — the rules whose removal changes what the generated
 *   setup permits rather than how it reads: secrets handling, security
 *   patterns, and injection screening. These are the reason the mechanism
 *   exists; a "lean" setup that quietly shed them would be the failure mode the
 *   floor was built to prevent.
 *
 * `test/content/floorMembership.test.ts` pins both sets, so widening or
 * narrowing the floor is a deliberate edit with a visible diff.
 *
 * ## The user layer
 *
 * An artifact from the repo's override tree (`origin: "user"`) is admitted by
 * PRESENCE: {@link classifySelection} keeps it whatever the tracked selection
 * says, the same "installed = selected" rule installed packs get. The file is
 * in the tree because someone in this repo put it there, and a manifest written
 * before it existed is not a deselection of it.
 *
 * That rule is also what keeps the floor whole when an override takes a floor
 * artifact's id. The catalog has already dropped the replaced artifact from the
 * index, so the id is claimed by exactly one item; keeping that item by
 * presence is keeping the floor, and no `keep-protected-missing` verdict is
 * raised for an id that is present. {@link resolveSelection} is unchanged — it
 * intersects filters against whatever the index holds — so a user artifact that
 * a filter leaves out of the RECORD is still emitted; presence in the tree is
 * the stronger statement, and the two halves disagree only in the direction
 * that keeps the author's file.
 */

import { CONTENT_CLASSES, type ContentClass, type ContentSelection } from "../types/content.ts";
import { EngineError } from "../types/errors.ts";
import {
  COMMAND_ID_PREFIX,
  applyCommandPrefix,
  originOf,
  typeIdKey,
  type CatalogItem,
  type ContentIndex,
} from "./catalog.ts";
import { filterByLanguages, isFloorTag } from "./tags.ts";

/**
 * How a tracked selection treats one artifact:
 *
 * - `keep` — the selection admits it, its class is unfiltered, or it came from
 *   the repo's override tree and is admitted by presence.
 * - `drop` — absent from its class's selected ids.
 * - `keep-protected-missing` — a floor artifact absent from the selection.
 *   Still emitted, and worth surfacing: {@link resolveSelection} records floor
 *   artifacts unconditionally, so this state only arises from a hand-edited or
 *   truncated manifest.
 */
export type SelectionVerdict = "keep" | "drop" | "keep-protected-missing";

/**
 * Per-class selected-id sets. A class key ABSENT from the map is unfiltered —
 * every artifact of that class passes — which is what lets a partial record
 * (an older manifest, a class added after it was written) fail open instead of
 * emitting nothing.
 */
export type SelectionAllowlist = Partial<Record<ContentClass, ReadonlySet<string>>>;

/** Filters {@link resolveSelection} intersects against the catalog. */
export interface ResolveSelectionOptions {
  /**
   * Explicit ids per class. A class key present restricts that class to its
   * ids; a class key absent leaves the class unfiltered, so `{}` selects the
   * whole corpus. Command ids resolve in either form (`plan`, `cmd-plan`).
   */
  ids?: Partial<Record<ContentClass, string[]>>;
  /** Project languages; `lang:*`-tagged artifacts survive only on a match. Empty fails open. */
  languages?: string[];
  /** When non-empty, a non-floor artifact must carry at least one of these tags. */
  includeTags?: string[];
  /** A non-floor artifact carrying any of these tags is dropped. */
  excludeTags?: string[];
}

/**
 * Derive the emission allowlist from a tracked selection.
 *
 * Pure and total: every class the record carries as an array becomes a set,
 * and a class whose entry is missing or not an array contributes nothing, so
 * that class stays unfiltered. An EMPTY selection is a real answer — all four
 * classes present and empty means "install nothing", and only floor artifacts
 * survive it (as `keep-protected-missing`).
 */
export function buildSelectionAllowlist(selection: ContentSelection): SelectionAllowlist {
  const allowlist: SelectionAllowlist = {};
  for (const type of CONTENT_CLASSES) {
    // Typed as `string[]`, read defensively: this record round-trips through a
    // manifest file a user can edit.
    const ids = selection.items[type];
    if (!Array.isArray(ids)) continue;
    allowlist[type] = new Set<string>(ids);
  }
  return allowlist;
}

/**
 * Is `id` admitted for its class? An unfiltered class (no key in the allowlist)
 * admits everything, so the answer reads as "will this be emitted", not "was
 * this literally listed".
 *
 * Command ids are matched in both spellings. The catalog stores the namespaced
 * `cmd-` form, while a manifest hand-edited or written from a user argument
 * often carries the bare one; a membership test that saw only one of them would
 * drop every selected command.
 */
export function isIdInSelection(
  allowlist: SelectionAllowlist,
  type: ContentClass,
  id: string,
): boolean {
  const selected = allowlist[type];
  if (selected === undefined) return true;
  if (selected.has(id)) return true;
  if (type !== "command") return false;
  return selected.has(applyCommandPrefix(id, type)) || selected.has(stripCommandPrefix(id));
}

/**
 * The verdict for one indexed artifact under a tracked selection — the single
 * predicate every emission filter and every drift check reads, so the two
 * cannot disagree about what a setup should contain.
 */
export function classifySelection(
  item: CatalogItem,
  allowlist: SelectionAllowlist,
): SelectionVerdict {
  // Admitted by presence (see the module note): the repo authored this file
  // into its own override tree, so no selection record deselects it — and when
  // it has taken a floor artifact's id, keeping it IS keeping the floor.
  if (originOf(item) === "user") return "keep";
  if (isIdInSelection(allowlist, item.type, item.id)) return "keep";
  return item.tags.some(isFloorTag) ? "keep-protected-missing" : "drop";
}

/**
 * Resolve filters against the indexed corpus into the selection a setup
 * installs.
 *
 * Stages, in order:
 *
 *   1. Floor admission — a `floor:*`-tagged artifact is admitted whatever the
 *      ids and tag filters say. Deselecting one is a source edit (remove the
 *      tag), never a configuration choice.
 *   2. Explicit ids — per class, and only for the classes named.
 *   3. Tag filters — `includeTags` is an OR-match requirement, `excludeTags`
 *      is subtractive. Tags match literally: they are authoring tokens, and
 *      case-folding them would make `ctx:Team-only` a second, silent facet.
 *   4. Language — applied to floor artifacts too (see the module note).
 *
 * Every id named in `opts.ids` must exist in the index; unknown ids raise
 * `VALIDATION_ERROR` naming ALL of them, so fixing a stale selection is one
 * pass rather than one round-trip per typo. Resolving to zero items is a
 * legitimate result, not an error.
 */
export function resolveSelection(
  index: ContentIndex,
  opts: ResolveSelectionOptions,
): ContentSelection {
  const requested = buildRequestedAllowlist(opts.ids);
  assertKnownIds(index, opts.ids);

  const include = normaliseTags(opts.includeTags);
  const exclude = normaliseTags(opts.excludeTags);

  const admitted = index.items.filter((item) => {
    if (item.tags.some(isFloorTag)) return true;
    if (!isIdInSelection(requested, item.type, item.id)) return false;
    if (include.size > 0 && !item.tags.some((tag) => include.has(tag))) return false;
    return !item.tags.some((tag) => exclude.has(tag));
  });

  const selected = filterByLanguages(admitted, opts.languages ?? []);

  const items = emptyItems();
  for (const item of selected) items[item.type].push(item.id);
  return { items };
}

/** Total number of selected ids across every class. */
export function countSelectionItems(selection: ContentSelection): number {
  return CONTENT_CLASSES.reduce((total, type) => total + (selection.items[type]?.length ?? 0), 0);
}

/**
 * One-line human summary in class order (`3 agents, 1 rule`). An empty
 * selection says so rather than rendering as an empty string, which in a CLI
 * line reads as a missing value instead of a deliberate one.
 */
export function selectionSummary(selection: ContentSelection): string {
  const parts = CONTENT_CLASSES.flatMap((type) => {
    const count = selection.items[type]?.length ?? 0;
    return count === 0 ? [] : [`${count} ${type}${count === 1 ? "" : "s"}`];
  });
  return parts.length === 0 ? "nothing selected" : parts.join(", ");
}

/**
 * Every selected id as one flat set, for the "did this selection change"
 * comparisons that do not care which class an id came from. Ids are unique
 * across classes as stored (commands carry their `cmd-` prefix), so flattening
 * cannot merge two artifacts into one entry.
 */
export function getAllContentIds(selection: ContentSelection): Set<string> {
  const ids = new Set<string>();
  for (const type of CONTENT_CLASSES) {
    for (const id of selection.items[type] ?? []) ids.add(id);
  }
  return ids;
}

/** Selected-id sets from the requested ids; a class the caller did not name stays unfiltered. */
function buildRequestedAllowlist(
  ids: ResolveSelectionOptions["ids"],
): SelectionAllowlist {
  const requested: SelectionAllowlist = {};
  if (ids === undefined) return requested;
  for (const type of CONTENT_CLASSES) {
    const list = ids[type];
    if (list === undefined) continue;
    requested[type] = new Set(list.map((id) => applyCommandPrefix(id.trim(), type)));
  }
  return requested;
}

/** Reject ids no artifact in the index answers to, naming every one of them. */
function assertKnownIds(index: ContentIndex, ids: ResolveSelectionOptions["ids"]): void {
  if (ids === undefined) return;
  const unknown: string[] = [];
  for (const type of CONTENT_CLASSES) {
    for (const id of ids[type] ?? []) {
      const resolved = applyCommandPrefix(id.trim(), type);
      if (index.byKey.has(typeIdKey(type, resolved))) continue;
      unknown.push(`${type} ${JSON.stringify(id)}`);
    }
  }
  if (unknown.length === 0) return;
  throw new EngineError(
    `Unknown content ${unknown.length === 1 ? "id" : "ids"} in the selection: ` +
      `${unknown.join(", ")}. Every selected id must exist in the installed content corpus — ` +
      `correct the ids or drop them from the selection.`,
    { code: "VALIDATION_ERROR" },
  );
}

/** Trimmed, non-empty tag filters as a set. Matching stays case-sensitive. */
function normaliseTags(tags: readonly string[] | undefined): Set<string> {
  const wanted = new Set<string>();
  for (const tag of tags ?? []) {
    const value = tag.trim();
    if (value !== "") wanted.add(value);
  }
  return wanted;
}

function stripCommandPrefix(id: string): string {
  return id.startsWith(COMMAND_ID_PREFIX) ? id.slice(COMMAND_ID_PREFIX.length) : id;
}

/** A selection record with every class present and empty — the shape callers can index blind. */
function emptyItems(): Record<ContentClass, string[]> {
  return { agent: [], skill: [], rule: [], command: [] };
}
