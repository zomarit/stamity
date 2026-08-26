import type { MaturityTier, Tool } from "../types/core.ts";
import type { ContentClass, ContentSelection } from "../types/content.ts";
import type { ErrorCode } from "../types/errors.ts";
import type { McpConfig } from "../types/manifest.ts";

/**
 * The workspace model: the shape of `workspace.json` and the result of one
 * cascade sync across its members.
 *
 * A workspace is a directory holding several repositories that share one
 * policy. The engine owns PROPAGATION — pushing defaults, group deltas, and
 * locked content down into every member — because the coding clients cover
 * multi-root ACCESS only and nothing in them cascades configuration.
 *
 * Types and constants only. Manifest IO, precedence resolution, and the
 * cascade itself live in sibling modules that import these shapes, so the
 * model stays readable as one screen of contract.
 */

/**
 * Workspace manifest filename. It sits at the workspace root, not inside the
 * per-repo state dir: the workspace is the parent of the member repos and its
 * manifest is authored and reviewed like any other project config.
 */
export const WORKSPACE_MANIFEST_FILE = "workspace.json";

/** Current workspace manifest schema generation. */
export const WORKSPACE_MANIFEST_VERSION = "1.0.0";

/** The baseline every member inherits before group deltas and its own overrides. */
export interface WorkspaceDefaults {
  /** Target tools generated for every member unless a later layer replaces the list. */
  tools: Tool[];
  /** Baseline content selection; absent means members keep whatever they selected locally. */
  selection?: ContentSelection;
  /** Investment-calibration dial propagated to members; never gates content admission. */
  maturityTier?: MaturityTier;
  /** MCP server selection propagated to members. */
  mcp?: McpConfig;
}

/**
 * A named policy layer between the defaults and a member's own overrides — the
 * bundle a member opts into by naming it in {@link WorkspaceRepoEntry.groups}.
 *
 * Deltas, not a second config: a group adds and removes selected ids and may
 * replace the tool list, so it can never redefine the workspace shape. `name`
 * is a field on the delta rather than an object key so that declaration order
 * in {@link WorkspaceManifest.groups} is the merge order — key order in a JSON
 * object is not a contract worth depending on.
 */
export interface WorkspaceGroupDelta {
  /** Group name; referenced by {@link WorkspaceRepoEntry.groups}. */
  name: string;
  /** Content ids added on top of the previous layer, per class. */
  addItems?: Partial<Record<ContentClass, string[]>>;
  /** Content ids removed from the previous layer, per class. */
  removeItems?: Partial<Record<ContentClass, string[]>>;
  /** Replaces the previous layer's tool list entirely when present. */
  toolOverrides?: Tool[];
}

/** A member's own last-layer deltas — the same add/remove algebra as a group. */
export interface WorkspaceRepoOverrides {
  /** Replaces the previous layer's tool list entirely when present. */
  tools?: Tool[];
  addItems?: Partial<Record<ContentClass, string[]>>;
  removeItems?: Partial<Record<ContentClass, string[]>>;
}

/** One member repository registered in the workspace. */
export interface WorkspaceRepoEntry {
  /**
   * Path relative to the workspace root. Absolute paths and traversal are
   * rejected at manifest-read time — a manifest is an executable instruction
   * to write into a directory, so the path is validated before it is used.
   */
  path: string;
  /** Names of groups whose deltas apply, resolved in manifest declaration order. */
  groups?: string[];
  overrides?: WorkspaceRepoOverrides;
}

/**
 * The persisted workspace manifest — schema generation
 * {@link WORKSPACE_MANIFEST_VERSION}.
 *
 * Resolution order per member: defaults -> matched group deltas in declaration
 * order -> the member's own overrides, with {@link lockedContent} applied last
 * so the workspace baseline outranks every layer below it.
 */
export interface WorkspaceManifest {
  version: string;
  defaults: WorkspaceDefaults;
  /** Group deltas, in merge order. Unreferenced groups cost nothing. */
  groups?: WorkspaceGroupDelta[];
  repos: WorkspaceRepoEntry[];
  /**
   * Content ids no member may drop. Applied after the override merge, so a
   * `removeItems` entry naming a locked id is discarded rather than honoured.
   * This is what makes a workspace-wide baseline — a security rule set, say —
   * enforceable instead of advisory.
   */
  lockedContent?: string[];
}

/**
 * Aggregate disposition of one cascade: `passed` when every targeted member
 * synced, `failed` when every one errored, `partial` for any mix. Skipped
 * members are not failures and never turn a clean run into a partial one.
 */
export type WorkspaceSyncOutcome = "passed" | "partial" | "failed";

/** Per-member tallies backing {@link WorkspaceSyncOutcome}. `total` counts every entry. */
export interface WorkspaceSyncCounts {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * A structured per-member failure. The typed `code` travels beside the message
 * so callers branch on the failure class instead of grepping prose out of a
 * flattened string.
 */
export interface WorkspaceRepoSyncError {
  repoPath: string;
  code: ErrorCode;
  message: string;
}

/** Outcome for one member. `error` is present exactly when `ok` is false. */
export interface WorkspaceRepoSyncResult {
  repoPath: string;
  ok: boolean;
  error?: WorkspaceRepoSyncError;
}

/** The full result of one cascade: verdict, tallies, and every member's row. */
export interface WorkspaceSyncResult {
  outcome: WorkspaceSyncOutcome;
  counts: WorkspaceSyncCounts;
  repos: WorkspaceRepoSyncResult[];
}
