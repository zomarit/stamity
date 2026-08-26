import { CONTENT_CLASSES, type ContentClass, type ContentSelection } from "../types/content.ts";
import type { MaturityTier, Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import type { McpConfig } from "../types/manifest.ts";
import {
  WORKSPACE_MANIFEST_FILE,
  type WorkspaceGroupDelta,
  type WorkspaceManifest,
  type WorkspaceRepoEntry,
} from "./model.ts";

/**
 * Precedence: what one member repository actually gets from its workspace.
 *
 * The layers are `defaults` -> the group deltas the member opts into -> the
 * member's own overrides, with `lockedContent` outranking all three. Group
 * order is the manifest's declaration order, never the order a member happens
 * to list its group names in: two members naming the same groups must resolve
 * identically, or the workspace has no single policy to propagate.
 *
 * Resolution is pure — no filesystem, no clock, no IO. A member registered in
 * the manifest but missing from disk resolves to a config like any other;
 * noticing that the directory is gone is the cascade's job, and folding that
 * check in here would make the precedence rules untestable without a tree on
 * disk. Nothing in the returned config shares a reference with the manifest
 * either, so a caller that mutates one member's resolved config cannot corrupt
 * the workspace baseline for the next member in the cascade.
 */

/** The effective configuration for one member repository. */
export interface ResolvedRepoConfig {
  /** The member's path as the manifest declares it, relative to the workspace root. */
  repoPath: string;
  /** Target tools, after the last layer that declared a tool list. */
  tools: Tool[];
  /** Effective content selection, deduplicated, in first-appearance order. */
  selection: ContentSelection;
  maturityTier?: MaturityTier;
  mcp?: McpConfig;
  /**
   * Locked ids whose removal this member actually attempted and the lock
   * refused — the report a workspace lead reads to see where policy is being
   * pushed back on. A lock that nothing tried to drop leaves no entry here:
   * echoing every locked id would restate the manifest instead of describing
   * this resolution.
   */
  lockedApplied: string[];
}

/**
 * Resolve the effective configuration for the member at `repoPath`.
 *
 * Path matching is by normalized shape, so `./apps/web/` and `apps\web` both
 * find the entry declared as `apps/web`. Two entries that normalize alike are a
 * manifest defect the read layer rejects; here the first declared wins.
 *
 * Throws `VALIDATION_ERROR` when the path names no registered member, or when
 * the member opts into a group the manifest never defines. Both are authoring
 * mistakes with no defensible fallback: silently resolving without an undefined
 * group would hand back a config that is missing exactly the policy the author
 * asked for.
 */
export function resolveRepoConfig(
  manifest: WorkspaceManifest,
  repoPath: string,
): ResolvedRepoConfig {
  const entry = findRepoEntry(manifest, repoPath);
  const deltas = matchedGroupDeltas(manifest, entry);
  const locked = new Set(manifest.lockedContent ?? []);
  const lockedApplied = new Set<string>();

  const items = perClass((cls) => new Set(manifest.defaults.selection?.items[cls] ?? []));
  let tools = manifest.defaults.tools;

  for (const delta of deltas) {
    if (delta.toolOverrides !== undefined) tools = delta.toolOverrides;
    applyDelta(items, locked, lockedApplied, delta.removeItems, delta.addItems);
  }
  if (entry.overrides?.tools !== undefined) tools = entry.overrides.tools;
  applyDelta(
    items,
    locked,
    lockedApplied,
    entry.overrides?.removeItems,
    entry.overrides?.addItems,
  );

  const { maturityTier, mcp } = manifest.defaults;
  return {
    repoPath: entry.path,
    tools: [...tools],
    selection: buildSelectionFromIds(perClass((cls) => [...items[cls]])),
    ...(maturityTier === undefined ? {} : { maturityTier }),
    ...(mcp === undefined ? {} : { mcp: cloneMcp(mcp) }),
    lockedApplied: [...lockedApplied].toSorted(compare),
  };
}

/**
 * Shape per-class id lists into a {@link ContentSelection}: every class present,
 * duplicates collapsed, first appearance wins the position. The result copies
 * its input, so the selection a caller receives is never an alias of the list
 * it passed in.
 */
export function buildSelectionFromIds(
  ids: Partial<Record<ContentClass, string[]>>,
): ContentSelection {
  return { items: perClass((cls) => [...new Set(ids[cls] ?? [])]) };
}

/**
 * Apply one layer's deltas in place.
 *
 * Removals run before additions, so a layer that names the same id in both ends
 * up keeping it — a layer's own intent should not depend on which field the
 * author wrote first. A removal naming a locked id is discarded rather than
 * honoured, which is the whole of the lock: it defends what is already
 * selected, and cannot conjure an id no layer ever selected, because a bare id
 * carries no content class to file it under.
 *
 * Removing an id that is not selected is a silent no-op and never counts as the
 * lock doing work — nothing was defended.
 */
function applyDelta(
  items: Record<ContentClass, Set<string>>,
  locked: ReadonlySet<string>,
  lockedApplied: Set<string>,
  removeItems: Partial<Record<ContentClass, string[]>> | undefined,
  addItems: Partial<Record<ContentClass, string[]>> | undefined,
): void {
  for (const cls of CONTENT_CLASSES) {
    const selected = items[cls];
    for (const id of removeItems?.[cls] ?? []) {
      if (!selected.has(id)) continue;
      if (locked.has(id)) {
        lockedApplied.add(id);
        continue;
      }
      selected.delete(id);
    }
    for (const id of addItems?.[cls] ?? []) selected.add(id);
  }
}

/** The manifest entry for `repoPath`, or a `VALIDATION_ERROR` naming what is registered. */
function findRepoEntry(manifest: WorkspaceManifest, repoPath: string): WorkspaceRepoEntry {
  const wanted = normalizeRepoPath(repoPath);
  const entry = manifest.repos.find((repo) => normalizeRepoPath(repo.path) === wanted);
  if (entry !== undefined) return entry;

  const registered = manifest.repos.map((repo) => repo.path);
  const known =
    registered.length === 0
      ? "The manifest registers no repositories."
      : `Registered: ${registered.join(", ")}.`;
  throw new EngineError(
    `Repository ${repoPath} is not registered in the workspace manifest. ${known} ` +
      `Add it to repos[] in ${WORKSPACE_MANIFEST_FILE}, or resolve one of the registered paths.`,
    { code: "VALIDATION_ERROR" },
  );
}

/**
 * The group deltas that apply to `entry`, in manifest declaration order.
 *
 * Walking the manifest's groups and keeping the ones the member named — rather
 * than walking the member's names and looking each up — is what makes the merge
 * order the manifest's. A named group the manifest does not define is a
 * `VALIDATION_ERROR`: it is a typo, and dropping it would quietly resolve a
 * member without the policy it asked for.
 */
function matchedGroupDeltas(
  manifest: WorkspaceManifest,
  entry: WorkspaceRepoEntry,
): WorkspaceGroupDelta[] {
  const wanted = entry.groups ?? [];
  if (wanted.length === 0) return [];

  const groups = manifest.groups ?? [];
  const defined = new Set(groups.map((group) => group.name));
  for (const name of wanted) {
    if (defined.has(name)) continue;
    const known =
      defined.size === 0
        ? "The manifest defines no groups."
        : `Defined groups: ${[...defined].join(", ")}.`;
    throw new EngineError(
      `Repository ${entry.path} references group "${name}", which the workspace manifest ` +
        `does not define. ${known} Define it in groups[] in ${WORKSPACE_MANIFEST_FILE}, ` +
        `or drop the reference from this repository's groups.`,
      { code: "VALIDATION_ERROR" },
    );
  }

  const selected = new Set(wanted);
  return groups.filter((group) => selected.has(group.name));
}

/**
 * A repo path reduced to its comparable shape: POSIX separators, no empty or
 * `.` segments, so leading `./`, doubled slashes, and a trailing slash all
 * collapse. Case is preserved — a case-insensitive filesystem does not make
 * `Apps/Web` the same declaration as `apps/web`. `..` segments survive
 * untouched: rejecting a path that climbs out of the workspace is the read
 * layer's safety gate, and quietly normalizing one here would hide it.
 */
function normalizeRepoPath(path: string): string {
  return path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/** A detached copy: a caller mutating the resolved MCP block must not reach the manifest. */
function cloneMcp(mcp: McpConfig): McpConfig {
  return {
    servers: [...mcp.servers],
    ...(mcp.protocolVersion === undefined ? {} : { protocolVersion: mcp.protocolVersion }),
  };
}

/**
 * A value per content class. The classes are listed rather than folded over
 * {@link CONTENT_CLASSES} so that adding a class to the closed set is a compile
 * error here — a fold would type-check and silently drop the new class.
 */
function perClass<T>(make: (cls: ContentClass) => T): Record<ContentClass, T> {
  return {
    agent: make("agent"),
    skill: make("skill"),
    rule: make("rule"),
    command: make("command"),
  };
}

/** Byte-order comparison, so reported ids do not reorder with the machine's locale. */
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
