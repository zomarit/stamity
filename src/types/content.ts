/**
 * Content-domain shapes: the closed set of canonical content classes, the
 * parsed canonical-file shape, selection, and adapter emission results.
 * Types-leaf module — imports sibling `src/types` files only.
 */
import type { Tool } from "./core.ts";

/**
 * The canonical content classes, closed by design. Hook scripts, MCP config,
 * and similar emissions are infra-owned configuration, not content — they are
 * ledgered with `artifactType: "infra"` (see `LedgerEntry` in `manifest.ts`)
 * instead of joining this set.
 */
export const CONTENT_CLASSES = ["agent", "skill", "rule", "command"] as const;
export type ContentClass = (typeof CONTENT_CLASSES)[number];

/**
 * Rule ordering bucket. Adapters sort rule emissions so higher-priority
 * buckets appear first in generated output; absence reads as `"normal"`.
 * Priority order: critical > high > normal > low.
 */
export type RulePrecedence = "critical" | "high" | "normal" | "low";

/** A canonical content artifact, parsed from disk with frontmatter split from body. */
export interface CanonicalFile {
  /** Absolute path of the source file. */
  path: string;
  /** Path relative to the content root (e.g. `rules/stamity-security.md`). */
  relativePath: string;
  /** Content class, derived from the directory the file lives in. */
  type: ContentClass;
  /** Stable artifact id from frontmatter (without the `stamity-` filename prefix). */
  id: string;
  /** Full parsed frontmatter; typed readers narrow the keys they consume. */
  frontmatter: Record<string, unknown>;
  /** Markdown body with the frontmatter block removed. */
  body: string;
  /** Classification tags from frontmatter; first tag is the primary classification. */
  tags: string[];
  /** Rule ordering bucket; meaningful for rules only. */
  precedence?: RulePrecedence;
  /**
   * Present when the artifact was supplied by an installed pack rather than
   * the corpus (the live-emission wiring): `pack` is the installed
   * pack's id. Absent — never `undefined`-valued — for corpus artifacts, so
   * pre-pack consumers see the original shape byte-for-byte.
   */
  provenance?: { pack: string };
}

/** Selected artifact ids per content class — the resolved result of selection. */
export interface ContentSelection {
  items: Record<ContentClass, string[]>;
}

/**
 * Ledger attribution for one emitted path — the same triple recorded in
 * `LedgerEntry`, restated here so an emission row can carry several of them.
 */
export interface EmissionOwner {
  adapter: Tool;
  artifactId: string;
  artifactType: ContentClass | "infra";
}

/**
 * One file an adapter wants written. `owner` is the ledger attribution — the
 * same triple recorded in `LedgerEntry` — so every emission enters the
 * ownership ledger at write time.
 */
export interface AdapterOutput {
  /** Repo-relative target path. */
  path: string;
  /** Full file content to write (managed-block wrapping included where applicable). */
  content: string;
  /** Ledger attribution for the emitted path. */
  owner: EmissionOwner;
  /**
   * Additional owners of the same path. The ledger is designed for
   * multi-owner rows — one PATH may carry rows from several adapters, and a
   * shared file leaves the emission set only when EVERY owner stops emitting
   * it (`src/manifest/ledger.ts` module doc) — so a shared standards file
   * (the root `AGENTS.md`, the `.agents/skills/` tree) survives deselection
   * of one tool. Consumers expand each co-owner into its own ledger row via
   * {@link outputOwners}; the file is still written exactly once. Absent means
   * single-owner, byte-identical to the pre-co-owner behavior.
   */
  coOwners?: readonly EmissionOwner[];
  /**
   * Marks a residue row that SUBSTITUTES its content for a shared core row at
   * the same path instead of colliding with it (owners are unioned; the write
   * stays single). Consumed by the plan composer (`src/emit/planner.ts`) —
   * e.g. the codex adapter delivering a root-appendix `AGENTS.md` body. A
   * replacement for a path the core plan does not share, or a second
   * replacement for one path, is a composer-refused planner defect.
   */
  replacesSharedPath?: boolean;
}

/**
 * One planning pass's whole result: the files to write, and everything the
 * pass found that an operator has to be told about.
 *
 * The findings channel is here rather than on {@link AdapterOutput} because
 * these are facts about the PLAN, not about a file. A user hook rejected at
 * parse time has no output row to hang a warning on — being absent from the
 * output set is exactly the defect — and a policy document past the guard's
 * size cap is one row whose consequence is repo-wide. Carrying the findings
 * beside the rows is what stops a planner producing a diagnosis its caller
 * has no way to receive (`src/emit/hooksInfra.ts` → `CoreHooksPlan.warnings`
 * is the producer this exists to deliver).
 */
export interface EmissionPlan {
  /** The files to write, sorted by path — the same rows the narrow view returns. */
  outputs: AdapterOutput[];
  /**
   * Non-fatal findings from the planning pass, in producer order. Each is a
   * silent failure an operator would otherwise meet as behaviour: a hook that
   * never fires, a pack agent that installs and can do nothing, a policy
   * document that denies every agent in the repo. Empty is the ordinary case.
   *
   * Consumers RENDER these. `src/cli/commands/sync/report.ts` and
   * `src/cli/commands/init/panel.ts` are the two surfaces that do; a consumer
   * that receives the field and drops it puts every row back into the silence
   * the row exists to break.
   */
  warnings: string[];
}

/**
 * Every owner of an output — `owner` first, then `coOwners` — deduplicated by
 * adapter, as fresh objects. Ledger row identity is the `(adapter, path)`
 * pair, so within one output (one path) a repeated adapter collapses to its
 * first triple: expanding the result one-row-per-owner can never mint
 * duplicate ledger rows.
 */
export function outputOwners(output: AdapterOutput): EmissionOwner[] {
  const owners: EmissionOwner[] = [];
  const seen = new Set<Tool>();
  for (const owner of [output.owner, ...(output.coOwners ?? [])]) {
    if (seen.has(owner.adapter)) continue;
    seen.add(owner.adapter);
    owners.push({
      adapter: owner.adapter,
      artifactId: owner.artifactId,
      artifactType: owner.artifactType,
    });
  }
  return owners;
}

/** Outcome of merging one adapter output into the working tree. */
export interface MergeResult {
  path: string;
  action: "created" | "updated" | "skipped" | "unchanged";
  /** Present when the write degraded (e.g. user content preserved around a stale block). */
  warning?: string;
  /**
   * Present when the write did something worth SAYING but nothing worth
   * warning about — the first adoption of a file the operator already had, for
   * instance, where the engine added its markers and preserved every byte.
   *
   * Separate from {@link warning} because the two are read differently and
   * were rendered identically. A yellow `warning:` on a happy-path outcome
   * trains an operator to discount the colour, which costs on the run where a
   * real degradation is reported. Renderers print notices plainly.
   */
  notice?: string;
}

/**
 * What a class-specific reducer found in a CO-OWNED file — one the engine writes
 * by merging its own content into a document the operator also authors, so
 * neither party owns the whole of it.
 *
 * The reclaim sweep (`../merge/reclaim.ts`) consumes this and the MCP filter
 * (`../manifest/mcpFilter.ts`) produces it, which is why the vocabulary lives
 * down here with {@link MergeResult} rather than in either of them: the sweep
 * cannot answer "which bytes here are mine" without knowing the document's
 * format, and the format's module has no business knowing the sweep's gates.
 *
 * Every variant carries its own `detail`, because only the reducer can say why
 * in the document's own words; the sweep quotes it into the report.
 */
export type CoOwnedReduction =
  /** Nothing in the file is the operator's, so the sweep may unlink it whole. */
  | { kind: "engine-only"; detail: string }
  /**
   * The engine's content removed; `content` is everything else. It always
   * differs from the input — a reduction that would change nothing answers
   * `untouched`, so the sweep never rewrites a file to its own bytes.
   */
  | { kind: "reduced"; content: string; detail: string }
  /** Nothing the engine can prove it wrote, or nothing readable — leave it be. */
  | { kind: "untouched"; detail: string };

/**
 * Reduce one co-owned document, given the bytes on disk decoded as UTF-8.
 *
 * Pure by contract: the reclaim sweep owns every read and every write on that
 * lane, re-proving the target's (dev, ino) in the same tick as the syscall that
 * follows, so a reducer that touched disk would be writing during the read-only
 * planning pass and slip that pin.
 */
export type CoOwnedReducer = (content: string) => CoOwnedReduction;
