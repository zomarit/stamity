import type { Tool } from "../types/core.ts";

/**
 * Handoff artifacts: the cross-tool resume boundary.
 *
 * Resuming work inside one tool is the tool's own job — its native session
 * transcript is richer than anything this engine could write. Crossing tools
 * has no native mechanism at all, and transcript formats are explicitly
 * unstable, so the engine owns exactly that gap: a plain markdown file at
 * `.stamity/handoffs/<id>.md` with a YAML head one agent writes and a different
 * tool's agent reads.
 *
 * That read is why the shape is closed rather than free-form. A handoff is
 * untrusted input arriving in another agent's context, so every field it
 * carries is either checked (`../handoffs/validation.ts`) or absent — an
 * open map would let the writer smuggle configuration into the reader.
 */

/**
 * Lifecycle states. `expired` is a distinct terminal-ish state rather than a
 * derived predicate: a sweep marks a stale handoff once, and every later reader
 * sees the same fact instead of re-deriving it against its own clock.
 */
export type HandoffStatus = "active" | "in-progress" | "completed" | "archived" | "expired";

/** All {@link HandoffStatus} values, in lifecycle order. */
export const HANDOFF_STATUSES: readonly HandoffStatus[] = [
  "active",
  "in-progress",
  "completed",
  "archived",
  "expired",
] as const;

const VALID_HANDOFF_STATUSES: ReadonlySet<string> = new Set(HANDOFF_STATUSES);

/**
 * Permitted state transitions. Two invariants the table encodes:
 *
 * - No path runs backwards. Reopening finished work means writing a new
 *   handoff, so a resumed thread keeps its own provenance instead of
 *   overwriting the record of what was already done.
 * - `archived` is terminal, and every other state can reach it — archiving is
 *   always available as the disposal route, including for expired entries.
 */
export const VALID_STATUS_TRANSITIONS: Record<HandoffStatus, readonly HandoffStatus[]> = {
  "active": ["in-progress", "completed", "archived", "expired"],
  "in-progress": ["completed", "archived", "expired"],
  "completed": ["archived"],
  "expired": ["archived"],
  "archived": [],
};

/** True iff `to` is reachable from `from` per {@link VALID_STATUS_TRANSITIONS}. */
export function isValidStatusTransition(from: HandoffStatus, to: HandoffStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

/** Type guard over the closed {@link HandoffStatus} set. */
export function isHandoffStatus(value: unknown): value is HandoffStatus {
  return typeof value === "string" && VALID_HANDOFF_STATUSES.has(value);
}

/**
 * The YAML head of a handoff file. Six required fields carry the identity,
 * lifecycle and integrity of the artifact; the three optional ones are
 * provenance that improves a resume when present and is never invented when
 * absent.
 */
export interface HandoffFrontmatter {
  /** Identifier matching `HANDOFF_ID_PATTERN`: date, slug, short hash. */
  id: string;
  status: HandoffStatus;
  /** Authoring timestamp, ISO-8601. */
  created: string;
  /** Expiry timestamp, ISO-8601. Past it, the content is stale, not wrong. */
  expires: string;
  /** One-line statement of what the next agent is picking up. */
  summary: string;
  /** Tool whose agent wrote the handoff. */
  fromTool?: Tool;
  /** Tool the handoff was written for; absent means any tool may resume. */
  toTool?: Tool;
  /** Git ref the work sat on, for drift detection at resume time. */
  gitRef?: string;
  /**
   * `sha256:<64 hex>` over the trimmed `summary`, a newline, and the trimmed
   * body — the tamper check. The summary is inside the span because it is the
   * first thing the next agent reads; the other head fields stay outside so a
   * legitimate `status` transition does not break the digest. Computed by
   * `computeHandoffIntegrity`.
   */
  integrity: string;
}

/** A parsed handoff, carrying the file it came from for provenance. */
export interface Handoff {
  frontmatter: HandoffFrontmatter;
  body: string;
  filePath: string;
}
