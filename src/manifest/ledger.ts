import type { ContentClass } from "../types/content.ts";
import type { Tool } from "../types/core.ts";
import { EngineError } from "../types/errors.ts";
import { isPackOwner, type LedgerEntry } from "../types/manifest.ts";

/**
 * Pure data logic over the ownership ledger — the manifest's record of every
 * emitted path and its owner. Deselection is removal from the ledger, and
 * removal from the ledger is exactly what makes a path reclaim-eligible: there
 * is no per-run baseline snapshot, ever. The reclaim sweep diffs the CURRENT
 * emission set against the LEDGER UNION built here.
 *
 * Everything in this module is a function of its arguments: no filesystem, no
 * clock, no manifest IO (that boundary is `manifest.ts`). A ledger row for a
 * file the filesystem no longer has still diffs and reclaims cleanly — what is
 * actually on disk is the sweep's concern, not this module's.
 *
 * Identity: a row is identified by its `(adapter, path)` pair, compared
 * case-sensitively as POSIX strings — Windows callers normalize before a path
 * enters the ledger. One PATH may carry rows from several adapters (a shared
 * `AGENTS.md`); such a path leaves the emission set only when every owner
 * stops emitting it, which is why reclaim eligibility is judged against the
 * union of paths, never against a single adapter's rows.
 *
 * Owners come in two kinds (`LedgerOwner`), and both regeneration functions
 * here act on the adapter kind only: {@link replaceAdapterEntries} rebuilds
 * one tool's rows, and {@link computeReclaimCandidates} judges rows against an
 * emission set. A `pack:<id>` row is neither regenerated nor emitted, so it
 * passes through both untouched — its lifecycle is the explicit install and
 * uninstall in `../pack/install.ts`, and a sync must never queue installed
 * pack content for reclaim.
 *
 * Every returned row is a fresh object with absent — not `undefined`-valued —
 * optional keys, so results can be handed straight to the manifest serializer
 * and compared for deep equality without aliasing the caller's input.
 */

// ── Row identity ───────────────────────────────────────────────────────────

/**
 * Composite row identity: owner + path. An owner is a `Tool` id or a
 * `pack:<id>` string, neither of which contains a NUL, so the separator
 * cannot collide with either half.
 */
function rowKey(entry: LedgerEntry): string {
  return `${entry.adapter}\u0000${entry.path}`;
}

/** Artifact identity within one adapter, for rename detection. */
function artifactKey(entry: LedgerEntry): string {
  return `${entry.adapter}\u0000${entry.artifactId}`;
}

/**
 * Fresh row carrying exactly the ledger fields. Optionals the source lacks are
 * left absent rather than set to `undefined`, and any extra fields a richer
 * emission record carries are dropped — the persisted shape is the ledger's,
 * not the emitter's.
 */
function cloneEntry(entry: LedgerEntry): LedgerEntry {
  return {
    path: entry.path,
    adapter: entry.adapter,
    artifactId: entry.artifactId,
    artifactType: entry.artifactType,
    ...(entry.contentHash !== undefined ? { contentHash: entry.contentHash } : {}),
    ...(entry.stampedVersion !== undefined ? { stampedVersion: entry.stampedVersion } : {}),
  };
}

/** Case-sensitive POSIX code-unit order on `path`; ties resolved by stability. */
function byPath(a: LedgerEntry, b: LedgerEntry): number {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

// ── Recording ──────────────────────────────────────────────────────────────

/**
 * One artifact an emission run produced. Structurally the same fields as
 * {@link LedgerEntry} on purpose: recording an emission IS writing its ledger
 * row. The separate name marks the emission side of the boundary, and lets a
 * future emission record grow runtime-only fields without them leaking into
 * the persisted ledger — {@link toLedgerEntries} copies only the ledger
 * fields.
 */
export interface EmittedArtifact {
  /** Repo-relative emitted path (POSIX, case-sensitive). */
  path: string;
  /** Adapter that emitted the path. */
  adapter: Tool;
  /** Id of the source artifact, or a stable infra emission id. */
  artifactId: string;
  /** Content class of the source, or `"infra"` for non-content emissions. */
  artifactType: ContentClass | "infra";
  /** Hash of the emitted content at write time. */
  contentHash?: string;
  /** Engine version stamped into the managed block at write time. */
  stampedVersion?: string;
}

/** Ledger rows for an emission run, in emission order, sharing no reference
 *  with the input. */
export function toLedgerEntries(emitted: readonly EmittedArtifact[]): LedgerEntry[] {
  return emitted.map(cloneEntry);
}

/**
 * The ledger with `adapter`'s rows replaced by `entries`: every row the
 * adapter previously owned is dropped, the new rows are appended, and the
 * result is stable-sorted by path — a canonical order, so regenerating in a
 * different emission order cannot churn the persisted manifest. Rows of every
 * other owner pass through untouched — shared-path co-owners, and every
 * `pack:<id>` row, which no tool id can match — which is what makes "replace
 * with `[]`" the deselection of an entire adapter and nothing else.
 *
 * Contract: every row in `entries` carries `adapter` as its owner — emission
 * builds them via {@link toLedgerEntries} from its own run, so a mis-tagged
 * row is a programming error upstream, not a state this function repairs.
 */
export function replaceAdapterEntries(
  ledger: readonly LedgerEntry[],
  adapter: Tool,
  entries: readonly LedgerEntry[],
): LedgerEntry[] {
  const kept = ledger.filter((entry) => entry.adapter !== adapter);
  return [...kept, ...entries].map(cloneEntry).toSorted(byPath);
}

/**
 * The union of every path any adapter owns — the reclaim sweep's baseline.
 * A path several adapters share appears once; membership is case-sensitive.
 */
export function ledgerUnionPaths(ledger: readonly LedgerEntry[]): ReadonlySet<string> {
  return new Set(ledger.map((entry) => entry.path));
}

/**
 * Recorded `infra` paths, normalised to the reclaim sweep's key form — the
 * `trustedExactPaths` allowlist every caller of `sweepReclaimCandidates` owes
 * it.
 *
 * Infra rows are the paths the engine writes under names it did NOT mint:
 * `.codex/config.toml`, `.cursor/hooks.json`, the copilot setup workflow,
 * `AGENTS.md`. Nothing about those names proves engine authorship, so without
 * this allowlist they fail the sweep's ownership-marker gate as
 * `skipped-unsafe-path` — while the same run drops their ledger rows, leaving
 * behaviour-bearing files on disk that no later sync or clean can ever reclaim.
 * Exemption is from the NAME gate only: gate 4 still requires the recorded
 * content hash to match the bytes on disk, so a user-edited infra file is kept,
 * not deleted.
 *
 * One definition, because two would drift: `clean` and `sync` must judge
 * ownership identically or the verb that ran last decides what survives.
 */
export function trustedInfraPaths(ledger: readonly LedgerEntry[]): Set<string> {
  return new Set(
    ledger
      .filter((entry) => entry.artifactType === "infra")
      .map((entry) => (entry.path.startsWith("./") ? entry.path.slice(2) : entry.path)),
  );
}

// ── Diff ───────────────────────────────────────────────────────────────────

/** Row-level difference between two ledger states, keyed by `(adapter, path)`. */
export interface LedgerDiff {
  /** Rows whose key exists only in `next`. */
  added: LedgerEntry[];
  /** Rows whose key exists only in `prev`. */
  removed: LedgerEntry[];
  /** Rows whose key exists in both — carried as NEXT's row, so a content hash
   *  or version stamp that moved between the two states survives the diff. */
  retained: LedgerEntry[];
}

/**
 * Diff two ledger states by row key. `retained ∪ added` reconstructs `next`
 * and `retained ∪ removed` covers `prev`'s keys, so applying a diff loses
 * nothing. Order is deterministic: `added` and `retained` in `next`'s order,
 * `removed` in `prev`'s order.
 */
export function diffLedgers(
  prev: readonly LedgerEntry[],
  next: readonly LedgerEntry[],
): LedgerDiff {
  const prevKeys = new Set(prev.map(rowKey));
  const nextKeys = new Set(next.map(rowKey));
  const added: LedgerEntry[] = [];
  const retained: LedgerEntry[] = [];
  for (const entry of next) {
    (prevKeys.has(rowKey(entry)) ? retained : added).push(cloneEntry(entry));
  }
  const removed = prev.filter((entry) => !nextKeys.has(rowKey(entry))).map(cloneEntry);
  return { added, removed, retained };
}

// ── Reclaim eligibility ────────────────────────────────────────────────────

/** A ledger row whose file the reclaim sweep may act on, with why it became
 *  eligible. */
export interface ReclaimCandidate {
  entry: LedgerEntry;
  reason: "deselected" | "adapter-removed" | "path-renamed";
}

/**
 * The rows whose paths no current emission produces — the reclaim sweep's
 * input. Judged against the whole emission set, not per owner: a path several
 * adapters share stays off the candidate list until EVERY owner stops
 * emitting it, and then every one of its rows becomes a candidate.
 *
 * Reasons, in precedence order per row:
 *
 * - `"adapter-removed"` — the row's adapter is no longer an active target;
 *   every row of a dropped adapter classifies this way.
 * - `"path-renamed"` — the adapter is active and the same artifact owns
 *   another path that IS currently emitted. Detecting this needs the new row
 *   present in `ledger` (pass the post-replacement state, or a union of old
 *   and new); against a stale ledger the reason degrades to `"deselected"`,
 *   never the other way.
 * - `"deselected"` — the adapter is active and the artifact simply is not
 *   emitted any more.
 *
 * Filesystem state plays no part here — a candidate for a file already gone
 * from disk is the sweep's to skip.
 *
 * Pack rows are excluded outright: `currentEmission` describes what the
 * adapters produced this run and never contains installed pack content, so
 * judging a pack row against it would classify every installed pack file as
 * orphaned on the first sync after the install. Uninstall produces those
 * candidates instead (`../pack/install.ts` -> `planPackRemoval`).
 */
export function computeReclaimCandidates(
  ledger: readonly LedgerEntry[],
  currentEmission: ReadonlySet<string>,
  activeAdapters: ReadonlySet<Tool>,
): ReclaimCandidate[] {
  const survivingArtifacts = new Set(
    ledger.filter((entry) => currentEmission.has(entry.path)).map(artifactKey),
  );
  const candidates: ReclaimCandidate[] = [];
  for (const entry of ledger) {
    const owner = entry.adapter;
    if (isPackOwner(owner)) continue;
    if (currentEmission.has(entry.path)) continue;
    let reason: ReclaimCandidate["reason"];
    if (!activeAdapters.has(owner)) {
      reason = "adapter-removed";
    } else if (survivingArtifacts.has(artifactKey(entry))) {
      reason = "path-renamed";
    } else {
      reason = "deselected";
    }
    candidates.push({ entry: cloneEntry(entry), reason });
  }
  return candidates;
}

// ── Containment ────────────────────────────────────────────────────────────

/** Windows absolute forms POSIX checks miss: a drive letter (`C:/x`, `C:x`)
 *  and a UNC share (`\\server\share`). */
const WINDOWS_ABSOLUTE_PATTERN = /^(?:[A-Za-z]:|\\\\)/;

/**
 * Why `path` cannot address a file under the repo root, or `null` when it can.
 * Judged by shape, never by resolving against the filesystem — the same
 * posture as the manifest persistence gate, so a ledger this check passes is
 * not later refused at write time. Any `..` segment is refused outright, even
 * one that would normalize back inside the root: a ledger row authorises a
 * future deletion, so its path is written plainly or not at all.
 */
function containmentDefect(path: string): string | null {
  if (path === "") return "is empty";
  if (path.includes("\u0000")) return "contains a NUL byte";
  if (path.startsWith("/") || path.startsWith("\\")) return "is an absolute path";
  if (WINDOWS_ABSOLUTE_PATTERN.test(path)) return "is an absolute path";
  if (path.includes("\\")) return "uses a backslash separator (ledger paths are POSIX)";
  if (path.split("/").includes("..")) return "climbs toward the repo root with a `..` segment";
  return null;
}

/**
 * Assert every ledger path stays inside the repo rooted at `rootDir`. All
 * defective rows are named in ONE `VALIDATION_ERROR` throw — a hand-edited
 * ledger is repairable in a single sitting — and a clean ledger returns
 * without side effects. Nested relative paths are accepted; absolute paths
 * (POSIX or Windows-shaped) and `..` climbs are refused.
 */
export function assertLedgerContainment(ledger: readonly LedgerEntry[], rootDir: string): void {
  const defects: string[] = [];
  for (const [index, entry] of ledger.entries()) {
    const defect = containmentDefect(entry.path);
    if (defect !== null) {
      defects.push(`\`ledger[${index}].path\` ${JSON.stringify(entry.path)} ${defect}`);
    }
  }
  if (defects.length > 0) {
    throw new EngineError(
      `Ledger containment check failed for the repo at ${rootDir}: ${defects.join("; ")}. ` +
        `A ledger row authorises the reclaim sweep to act on its path, so every path must ` +
        `be repo-relative POSIX with no \`..\` segment. Fix or drop the row(s) named above.`,
      { code: "VALIDATION_ERROR" },
    );
  }
}

// ── Ownership queries ──────────────────────────────────────────────────────

/**
 * Every row owning `path` (case-sensitive exact match), in ledger order, as
 * fresh objects. Several rows mean a shared emission (one file, several
 * adapters); an empty result means the ledger does not govern the path.
 */
export function ownersOfPath(ledger: readonly LedgerEntry[], path: string): LedgerEntry[] {
  return ledger.filter((entry) => entry.path === path).map(cloneEntry);
}
