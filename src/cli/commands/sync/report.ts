import { countSelectionItems } from "../../../content/selection.ts";
import { formatReclaimReport } from "../../../merge/reclaim.ts";
import {
  PACK_OWNER_PREFIX,
  isPackOwner,
  type LedgerEntry,
  type SetupManifest,
} from "../../../types/manifest.ts";
import type { Palette } from "../../kit/terminal.ts";
import type { SyncApplyReport, SyncPlan, SyncPlanEntry } from "./engine.ts";

/**
 * Sync's two output surfaces over one engine result: the palette-injected
 * human report and the machine JSON payload. Both read the same plan + apply
 * report, and every count the human text prints comes from the same fields the
 * payload carries, so the two can never disagree.
 *
 * Provenance is the manifest file itself: {@link provenanceFromManifest}
 * rolls it up for display — rendered by sync's report here and displayed by
 * the check command. No separate provenance file exists.
 *
 * The dirty-tree warning is deliberately NOT part of the rendered report: it
 * is a WARNING the command emits on stderr, never a gate — the payload carries
 * the raw {@link SyncPlan.dirty} facts for machine callers instead.
 */

/** Display rollup of the manifest-as-provenance. */
export interface ProvenanceRollup {
  generatedBy: string;
  updatedAt: string;
  manifestVersion: string;
  /** One row per target tool (manifest order), plus any stray ledger owner after. */
  perAdapter: { adapter: string; files: number; stampedVersion: string | null }[];
  /** One row per installed pack with ledger rows, in first-appearance order. */
  packs: { packId: string; files: number }[];
}

/** Per-file lines rendered before the report collapses to a `… and N more` row. */
const MAX_FILE_LINES = 20;

/** The honest empty-build line (exact wording is load-bearing for the command layer). */
const EMPTY_BUILD_LINE =
  "no generated outputs in this build yet — this manifest's content selection is empty, so " +
  "there is nothing to emit; `stamity config` selects content";

/**
 * Roll `manifest` up into its provenance display shape. Adapter rows are
 * grouped under the manifest's target tools first — a tool with zero emitted
 * files still gets a row, because "0 files" is an answer — followed by any
 * ledger owner the tools list no longer names. `stampedVersion` is the single
 * version stamped across that adapter's rows, or `null` when rows disagree or
 * carry no stamp.
 */
export function provenanceFromManifest(manifest: SetupManifest): ProvenanceRollup {
  const adapterRows = new Map<string, LedgerEntry[]>();
  const packRows = new Map<string, number>();
  for (const entry of manifest.ledger) {
    if (isPackOwner(entry.adapter)) {
      const packId = entry.adapter.slice(PACK_OWNER_PREFIX.length);
      packRows.set(packId, (packRows.get(packId) ?? 0) + 1);
      continue;
    }
    const rows = adapterRows.get(entry.adapter) ?? [];
    rows.push(entry);
    adapterRows.set(entry.adapter, rows);
  }

  const targetTools = new Set<string>(manifest.tools);
  const owners = [
    ...manifest.tools,
    ...[...adapterRows.keys()].filter((owner) => !targetTools.has(owner)),
  ];
  const perAdapter = owners.map((adapter) => {
    const rows = adapterRows.get(adapter) ?? [];
    const stamps = new Set(rows.map((row) => row.stampedVersion));
    const [stamp] = stamps;
    return {
      adapter,
      files: rows.length,
      stampedVersion: stamps.size === 1 && stamp !== undefined ? stamp : null,
    };
  });

  return {
    generatedBy: manifest.generatedBy,
    updatedAt: manifest.updatedAt,
    manifestVersion: manifest.version,
    perAdapter,
    packs: [...packRows].map(([packId, files]) => ({ packId, files })),
  };
}

/** The manifest whose provenance the report shows: the persisted one when the
 *  run wrote it, the plan's (pre-write) view on a dry run. */
function provenanceSource(plan: SyncPlan, report: SyncApplyReport): SetupManifest {
  return report.manifest ?? plan.manifest;
}

/**
 * True for the honesty rule: this plan emits nothing, and the manifest selects
 * nothing for it to emit.
 *
 * Anchored on the PLAN, not on the planner's identity. The condition used to
 * open with `plan.plannerId === "noop"`, which is a fact about which planner
 * the seam dispatched rather than about the repository — and since the seam
 * flipped to the composed planner, no production run can satisfy it. That made
 * this branch and its `emptyBuild` payload field unreachable code that a test
 * kept apparently covered by mocking the seam with a hardcoded `id: "noop"`,
 * under a comment claiming it was the path production users see.
 *
 * The two remaining clauses ARE about the repository and both are reachable: a
 * plan with no entries over a selection with no items is a real state (a
 * manifest whose selection is empty), and it is exactly the state the line
 * describes. A repo that selected content and got no entries no longer takes
 * this branch — it takes the ordinary tally, which reports the zero honestly
 * instead of blaming the build.
 */
function isEmptyBuild(plan: SyncPlan): boolean {
  return plan.entries.length === 0 && countSelectionItems(plan.manifest.selection) === 0;
}

function paintAction(action: SyncPlanEntry["action"] | "skipped", palette: Palette): string {
  if (action === "create") return palette.green(action);
  if (action === "collision") return palette.yellow(action);
  if (action === "unchanged" || action === "skipped") return palette.dim(action);
  return palette.cyan(action);
}

/** Merge-result verb → the report's action token (the plan's vocabulary). */
const WROTE_TOKEN = {
  created: "create",
  updated: "update",
  unchanged: "unchanged",
  skipped: "skipped",
} as const;

/** Per-file rows capped at {@link MAX_FILE_LINES}, with the overflow named. */
function fileLines(rows: readonly string[]): string[] {
  if (rows.length <= MAX_FILE_LINES) return [...rows];
  return [...rows.slice(0, MAX_FILE_LINES), `  … and ${rows.length - MAX_FILE_LINES} more`];
}

/**
 * Sweep entries the gates refused to act on — user-edited bytes, or an
 * ownership proof the sweep would not accept.
 */
function salvagedEntries(report: SyncApplyReport): string[] {
  return (report.reclaimed?.entries ?? [])
    .filter(
      (entry) => entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path",
    )
    .map((entry) => entry.path);
}

/**
 * The salvage disclosure, owed for the same reason scoped `clean` prints one
 * (`../clean.ts`): a path the sweep kept has just lost the ledger rows that
 * made it reclaimable, so no future sync or clean will ever look at it again.
 * Saying nothing would leave behaviour-bearing files behind silently.
 */
function salvageLines(report: SyncApplyReport, palette: Palette): string[] {
  const kept = salvagedEntries(report);
  if (kept.length === 0) return [];
  const named = fileLines(kept.map((path) => `    ${path}`));
  return [
    palette.yellow(
      report.dryRun
        ? `  ${kept.length} path(s) would stay on disk with their ledger rows dropped — nothing would reclaim them later:`
        : `  ${kept.length} kept file(s) are yours now — their ledger rows are dropped, so no sync or clean will touch them again:`,
    ),
    ...named,
  ];
}

function provenanceLines(rollup: ProvenanceRollup, palette: Palette): string[] {
  const lines = [
    palette.dim(
      `provenance (the manifest is the record): generated by ${rollup.generatedBy} · ` +
        `updated ${rollup.updatedAt} · schema ${rollup.manifestVersion}`,
    ),
  ];
  for (const row of rollup.perAdapter) {
    const stamp = row.stampedVersion === null ? "" : ` (stamped v${row.stampedVersion})`;
    lines.push(palette.dim(`  ${row.adapter}: ${row.files} file(s)${stamp}`));
  }
  for (const pack of rollup.packs) {
    lines.push(palette.dim(`  pack ${pack.packId}: ${pack.files} file(s)`));
  }
  return lines;
}

/**
 * The human report body for one sync run. Written to stdout by the command
 * layer; contains the verdicts, the per-file merge warnings, the reclaim
 * summary, and the provenance rollup — never the stderr dirty-tree warning.
 *
 * Honesty rule: a plan with no entries over a manifest that selects nothing
 * says so ({@link isEmptyBuild}) instead of implying files were written.
 *
 * TWO warning sources, printed under one `warning:` prefix because an operator
 * reads them as one list of things that did not go as stated:
 *
 * 1. `SyncApplyReport.wrote[].warning` — the per-file verdicts the merge engine
 *    returned (a skipped collision, a force-overwrite naming its `.bak`).
 *    Applied runs only: a dry run has no `wrote[]`.
 * 2. {@link SyncPlan.warnings} — the hooks-planner channel
 *    (`../../../emit/hooksInfra.ts` → `CoreHooksPlan.warnings`): a user or pack
 *    hook rejected at parse time and so never firing, a pack agent whose grant
 *    resolved empty, a policy document past the guard's size cap. Printed on
 *    every branch, dry run included, because it is a PLANNING fact and a
 *    preview that hides a rejected hook is the same silence one lane earlier.
 *
 * Source 2 reaches here through `EmissionPlanner.planWithWarnings`
 * (`../../engine/emission.ts`) and `./engine.ts`, which carries it onto the
 * plan. It used to reach nothing at all — the seam returned `AdapterOutput[]`
 * alone, so the composer built the diagnosis and dropped it — and while that
 * was true a sync that re-emitted a rejected hook stayed silent about it.
 */
export function renderSyncReport(
  plan: SyncPlan,
  report: SyncApplyReport,
  palette: Palette,
): string {
  const lines: string[] = [];

  if (isEmptyBuild(plan)) {
    lines.push(EMPTY_BUILD_LINE);
    lines.push(
      report.dryRun
        ? palette.dim("dry run: only the manifest refresh was previewed; nothing was written")
        : palette.dim(`manifest refreshed: ${report.manifestPath}`),
    );
  } else if (report.dryRun) {
    lines.push(
      palette.bold(
        `plan: ${report.created} create, ${report.updated} update, ` +
          `${report.unchanged} unchanged, ${report.skipped} collision`,
      ),
    );
    const rows = plan.entries
      .filter((entry) => entry.action !== "unchanged")
      .map((entry) => {
        const marker = entry.action === "collision" ? " (would refuse)" : "";
        const detail = entry.detail === undefined ? "" : `\n      ${palette.dim(entry.detail)}`;
        return `  ${paintAction(entry.action, palette)}  ${entry.path}${marker}${detail}`;
      });
    lines.push(...fileLines(rows));
  } else {
    lines.push(
      palette.bold(
        `synced: ${report.created} created, ${report.updated} updated, ` +
          `${report.unchanged} unchanged, ${report.skipped} skipped`,
      ),
    );
    const rows = report.wrote
      .filter((result) => result.action !== "unchanged")
      .map((result) => `  ${paintAction(WROTE_TOKEN[result.action], palette)}  ${result.path}`);
    lines.push(...fileLines(rows));
    // Notices before warnings, and plain rather than yellow: a first adoption
    // is a normal outcome, and colouring it as a degradation is what makes the
    // colour stop meaning anything on the run that has a real one.
    for (const result of report.wrote) {
      if (result.notice !== undefined) lines.push(`  ${result.notice}`);
    }
    for (const result of report.wrote) {
      if (result.warning !== undefined) lines.push(palette.yellow(`  warning: ${result.warning}`));
    }
  }

  // Outside the branch, on purpose: a planning finding is true of the run
  // whether or not anything was written, so the dry run and the empty build
  // print it too. Empty is the ordinary case and prints nothing.
  for (const warning of plan.warnings ?? []) {
    lines.push(palette.yellow(`  warning: ${warning}`));
  }

  if (report.reclaimed !== null) {
    const reclaimText = formatReclaimReport(report.reclaimed);
    if (reclaimText !== "") lines.push(reclaimText);
    lines.push(...salvageLines(report, palette));
  }

  lines.push(...provenanceLines(provenanceFromManifest(provenanceSource(plan, report)), palette));
  return lines.join("\n");
}

/**
 * The machine payload for `--json` mode. Plain JSON-serializable data only,
 * and every count equals the number the human report prints — both are read
 * off the same {@link SyncApplyReport} fields.
 */
export function syncJsonPayload(plan: SyncPlan, report: SyncApplyReport): Record<string, unknown> {
  const reclaimed = report.reclaimed;
  return {
    dryRun: report.dryRun,
    plannerId: plan.plannerId,
    manifestMigrated: plan.manifestMigrated,
    manifestPath: report.manifestPath,
    emptyBuild: isEmptyBuild(plan),
    counts: {
      created: report.created,
      updated: report.updated,
      unchanged: report.unchanged,
      skipped: report.skipped,
      collisions: plan.collisions.length,
      reclaimCandidates: plan.reclaim.length,
      reclaimDeleted: reclaimed?.deletedCount ?? 0,
      reclaimStripped: reclaimed?.strippedCount ?? 0,
      reclaimSkipped: reclaimed?.skippedCount ?? 0,
      // Same entries the human report's salvage disclosure counts, so the two
      // surfaces cannot disagree about how many files were left behind.
      reclaimSalvaged: salvagedEntries(report).length,
    },
    entries: plan.entries.map((entry) => ({ ...entry })),
    // The paths this run refused, distinct from `counts.collisions`: a plan
    // collision under `--force` is written, so the two numbers differ exactly
    // where a machine caller cares. Copied, never aliased.
    refused: [...report.refused],
    wrote: report.wrote.map((result) => ({ ...result })),
    // The same rows the human report prints as its second warning source, so a
    // machine caller gating on a clean sync sees the rejected hook the operator
    // sees. Copied, never aliased onto the plan's array.
    warnings: [...(plan.warnings ?? [])],
    // One `structuredClone` rather than a spread plus a nested `entries.map`
    // copy: reclaim is the only nested field in this payload, the clone is deep
    // (so nothing handed to the caller aliases the sweep report), and
    // `structuredClone(null)` is `null`, so the absent-reclaim case needs no
    // branch of its own. `ReclaimReport` is plain data — strings, numbers and
    // string unions — so it is structured-cloneable by construction.
    reclaim: structuredClone(reclaimed),
    provenance: provenanceFromManifest(provenanceSource(plan, report)),
    dirty: { ...plan.dirty },
  };
}
