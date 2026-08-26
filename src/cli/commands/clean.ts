import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { readManifest, writeManifest } from "../../manifest/manifest.ts";
import {
  filterMcpJsonOnDisk,
  filterMcpServers,
  type FilterMcpResult,
} from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import {
  MERGED_MCP_JSON_PATHS,
  engineOwnedServerIds,
  mcpReclaimReducers,
} from "../../mcp/emit.ts";
import { formatReclaimReport, sweepReclaimCandidates } from "../../merge/reclaim.ts";
import { planPackRemoval } from "../../pack/install.ts";
import { discoverInstalledPacks, packMcpServers } from "../../pack/projection.ts";
import { trustedInfraPaths, type ReclaimCandidate } from "../../manifest/ledger.ts";
import {
  PACK_OWNER_PREFIX,
  isPackOwner,
  packOwner,
  type LedgerEntry,
  type SetupManifest,
} from "../../types/manifest.ts";
import { STATE_DIR } from "../../types/markers.ts";
import { CliFailure } from "../kit/output.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { confirm, promptGate } from "../kit/prompts.ts";

/**
 * `stamity clean` — the uninstall verb, in two scopes.
 *
 * Default scope: every owner stops emitting everything. Three properties define
 * it, and each one is a deliberate inversion of a default the rest of the CLI
 * holds:
 *
 * 1. **Uninstall-all, packs included.** The removal set is built straight from
 *    the ledger rather than through `computeReclaimCandidates`, which excludes
 *    `pack:<id>` rows on purpose (a sync must never reclaim installed pack
 *    content). Clean's remit is exactly the uninstall those rows are waiting
 *    for, so `planPackRemoval` per pack id would be equivalent — one direct
 *    construction keeps a single code path instead of two that must agree.
 * 2. **Destructive default-deny.** Everywhere else this CLI prefers detection
 *    over asking and treats a non-interactive run as "proceed with defaults".
 *    Here a non-TTY run without `-y` REFUSES: the default answer to "delete
 *    the user's files" is no, and a pipeline that means it says `-y`.
 * 3. **The reinit offer is printed, never prompted.** The prompt budget belongs
 *    to `init` (≤2 prompts, TTY-gated); clean ends with a next-step line, so a
 *    user who wants a fresh setup types the command themselves.
 *
 * `--pack <id>` narrows the remit to one installed pack. Candidates come from
 * the engine's `planPackRemoval` — exact owner equality on `pack:<id>`, so
 * `@acme/ops` can never match `@acme/ops-extra`, and the pack's engine-written
 * receipt row is included like any other of its rows. The sweep runs under the
 * same gates and the same trusted-infra exemption as the full clean; afterwards
 * exactly this pack's rows are dropped and the SHRUNK ledger is written back.
 * The state directory stays — every other owner is still live — and the sweep's
 * own parent prune removes the pack's now-empty directories. A file the gates
 * kept (operator-edited bytes, a refused unlink) still loses its row: keeping a
 * row whose hash no longer matches would only arm a later clean against bytes
 * the engine cannot prove it wrote, so the file becomes user-owned salvage and
 * the output says so. The closing next-step is `stamity sync`, which reclaims
 * any projected copies of the pack's content now that its rows are gone; the
 * reinit offer stays full-clean-only.
 *
 * Order of operations: sweep first, state directory last. The plan is read into
 * memory before either, so the ordering costs nothing — but removing the state
 * dir last means a crash mid-sweep leaves the ledger on disk and a re-run
 * finishes the job. What the sweep will not do is documented in
 * `../../merge/reclaim.ts`: user bytes outside a managed block survive (the
 * block is stripped instead), unsafe paths are refused, missing files are
 * reported rather than fatal. `.gitignore` entries are left alone — the file is
 * the user's, and stale ignore lines are inert.
 */

/** Fresh row copy, so a candidate never aliases the manifest the caller holds. */
function cloneEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry };
}

/**
 * Every ledger row as a reclaim candidate — adapter rows AND `pack:<id>` rows.
 *
 * The reason is uniformly `"adapter-removed"`: it is the strongest of the three
 * (it outranks `path-renamed` and `deselected` when several rows name one path)
 * and it is the literal truth here — after this run no owner emits anything.
 */
export function planCleanCandidates(manifest: SetupManifest): ReclaimCandidate[] {
  return manifest.ledger.map((entry) => ({ entry: cloneEntry(entry), reason: "adapter-removed" }));
}

/** Distinct installed pack ids the ledger records, for the unknown-id refusal. */
function installedPackIds(manifest: SetupManifest): string[] {
  const ids = new Set<string>();
  for (const entry of manifest.ledger) {
    if (isPackOwner(entry.adapter)) ids.add(entry.adapter.slice(PACK_OWNER_PREFIX.length));
  }
  return [...ids].toSorted();
}

/** True when `dir` exists (as anything). Absence is a fact here, never an error. */
async function exists(dir: string): Promise<boolean> {
  try {
    await stat(dir);
    return true;
  } catch {
    return false;
  }
}

const REINIT_OFFER = "start fresh: npx @zomarit/stamity init";

/** The one-per-line next-step block every exit path ends with. */
function nextSteps(ctx: CliContext, steps: readonly string[]): void {
  ctx.io.out("\nnext:\n");
  for (const [index, step] of steps.entries()) {
    ctx.io.out(`  ${index + 1}. ${step}\n`);
  }
}

/** Nothing to clean: a repo with no manifest is already in the target state. */
function nothingToClean(ctx: CliContext): CommandResult {
  ctx.io.out(`Nothing to clean — this repo has no ${STATE_DIR}/ manifest.\n`);
  nextSteps(ctx, [REINIT_OFFER]);
  return {
    exitCode: 0,
    json: { removed: 0, stripped: 0, skipped: 0, stateDirRemoved: false, entries: [] },
  };
}

/**
 * The destructive gate. Only `-y` passes; a TTY asks, defaulting to no; every
 * other run — non-TTY stdin, or `--json`, whose stdout belongs to the response
 * envelope and has nowhere to print a question — refuses instead of assuming
 * the answer. `--json` is a formatting choice and carries no consent: the
 * machine-readable spelling of an irreversible delete must still be told yes.
 * Both scopes share the mechanics; what is at stake is named by the caller's
 * strings.
 */
async function confirmDestruction(
  ctx: CliContext,
  strings: { refusedWhat: string; question: string },
): Promise<void> {
  if (ctx.yes) return;
  const gate = promptGate({
    stdinIsTTY: ctx.terminal.stdinIsTTY,
    yes: ctx.yes,
    json: ctx.json,
  });
  if (!gate.interactive) {
    throw new CliFailure({
      code: "CLEAN_ERROR",
      message: `clean refused: removing ${strings.refusedWhat} needs confirmation`,
      why: "stdin is not a terminal, so the confirmation prompt cannot be answered — and a destructive command never assumes yes",
      next: "re-run with -y to confirm, or run it from a terminal",
    });
  }
  const proceed = await confirm(gate, ctx.promptIo, {
    question: strings.question,
    defaultYes: false,
  });
  if (!proceed) {
    throw new CliFailure({
      code: "CLEAN_ERROR",
      message: "clean cancelled — nothing was removed",
      why: "the confirmation was declined",
      next: "re-run and answer y, or pass -y to skip the prompt",
    });
  }
}

/** Remove the state directory itself, reporting whether it was there to remove. */
async function removeStateDir(rootDir: string): Promise<boolean> {
  const target = join(rootDir, STATE_DIR);
  const present = await exists(target);
  if (!present) return false;
  try {
    await rm(target, { recursive: true, force: true });
  } catch (cause) {
    throw new CliFailure({
      code: "FS_ERROR",
      message: `generated files were removed, but ${STATE_DIR}/ could not be deleted`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: `close anything holding ${STATE_DIR}/ open, then re-run stamity clean`,
    });
  }
  return true;
}

/**
 * Every MCP server this repo's installed packs still supply — the ownership
 * input BOTH scopes need, resolved once per run because both uses of it must
 * agree.
 *
 * The sweep needs it as reducers for the three merged client MCP documents.
 * `.mcp.json`, `.cursor/mcp.json` and `.vscode/mcp.json` are written by MERGING,
 * so the hash the ledger recorded for them covers emission ∪ the operator's own
 * entries; without a reducer the sweep reads a match as sole authorship and
 * unlinks a document holding a hand-added server (`../../merge/reclaim.ts`
 * gate 4). With one, the engine's entries leave and everything else stays.
 * {@link removePackMcpEntries} needs the same rows to prove which entries a
 * pack being uninstalled put there.
 *
 * A pack whose supply cannot be resolved contributes nothing instead of failing
 * the command. `discoverInstalledPacks` refuses a row whose content directory is
 * gone — correct for every verb that is about to USE the pack, and wrong for the
 * one verb that exists to clear that state: uninstall must still run over a repo
 * whose pack files were deleted by hand. The cost of the fallback is bounded and
 * in the safe direction: a pack-supplied entry the engine can then no longer
 * prove it wrote is judged the operator's and kept, never deleted unproven.
 */
async function installedPackMcpSupply(
  rootDir: string,
  manifest: SetupManifest,
): Promise<PackSuppliedServer[]> {
  try {
    return await packMcpServers(await discoverInstalledPacks(rootDir, manifest), rootDir);
  } catch {
    // reason: not silent — the sweep still runs, still reports one entry per
    // candidate, and a kept entry says in its own detail that the engine could
    // not prove it wrote it.
    return [];
  }
}

/** Bytes at `absPath`, or `null` when it is not there. Absence is a fact here. */
async function readTextOrNull(absPath: string): Promise<string | null> {
  try {
    return await readFile(absPath, "utf8");
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** No selection survives the uninstall: the ids being removed are going away. */
const NOTHING_KEPT: ReadonlySet<string> = new Set<string>();

/** What the uninstall did to one pack's servers in the shared client documents. */
interface McpUninstallReport {
  /** Selected ids this pack supplied — the ids the selection must stop naming. */
  deselected: string[];
  /** Repo-relative path -> the bytes now on disk, for each document rewritten. */
  rewritten: Map<string, string>;
  /** Ids left in a document because their bytes are no longer the engine's. */
  kept: string[];
  /** One line per document the removal could not complete, and why. */
  refusals: string[];
}

/**
 * The SELECTED server ids `packId` supplies — the set the uninstall removes.
 *
 * One definition, two readers: the confirmation prompt names this set before
 * anything is written, and {@link removePackMcpEntries} acts on it. Deriving it
 * twice is how a prompt ends up promising something other than what the run does.
 */
function selectedServersOfPack(
  manifest: SetupManifest,
  packId: string,
  supply: readonly PackSuppliedServer[],
): string[] {
  const supplied = new Set(
    supply.filter((server) => server.sourcePackId === packId).map((server) => server.id),
  );
  return (manifest.mcp?.servers ?? []).filter((id) => supplied.has(id));
}

/**
 * Take the uninstalled pack's SELECTED servers out of the three merged client
 * documents, while the engine can still prove it wrote them.
 *
 * Ordering is the whole point of doing this here. `engineOwnedServerIds` proves
 * authorship by RE-RENDERING an entry (`../../mcp/emit.ts`), so it can only
 * prove an id it can still resolve. The moment this command drops the pack's
 * files and its `pack:<id>` ledger rows, nothing renders the pack's ids: every
 * later lane — `sync`, `check`, even a full `clean` — then correctly-
 * conservatively judges the entry the operator's and keeps it. Uninstall-first
 * therefore used to strand a credentialed third-party launcher permanently, and
 * the remedy `sync` printed (`config mcp remove <id>`) could no longer remove
 * anything. This runs at the last moment the proof exists.
 *
 * Narrow on purpose, in three directions at once:
 *
 * - **Only this pack's ids**, and only the ones the SELECTION names. An id the
 *   manifest never selected was never this engine's to write, whatever a
 *   document happens to hold under that name.
 * - **Only entries whose bytes still match the engine's rendering.** The set is
 *   `engineOwnedServerIds ∩ the pack's selected ids`, so an operator who tuned
 *   the pack's entry owns it from that moment and it survives — reported as
 *   `kept` rather than removed silently.
 * - **Never a delete.** `filterMcpServers` removes entries and prunes the
 *   `inputs` rows only the removed servers referenced; every other entry, every
 *   top-level field, and the file itself stay. Other servers are still selected
 *   here, so these documents are still live emission targets — unlike the
 *   reclaim sweep's lane, which reaches a path only once nothing emits it.
 *
 * No per-document failure aborts the uninstall. A symlinked or hard-linked
 * target is refused by the writer (`../../manifest/mcpFilter.ts`), and an
 * unparseable one is left exactly as it is; both come back as a `refusals` line
 * the caller prints, because a pack whose files are already gone must not be
 * left half-uninstalled by a document the engine may not touch.
 */
async function removePackMcpEntries(
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
  supply: readonly PackSuppliedServer[],
  apply: boolean,
): Promise<McpUninstallReport> {
  const deselected = selectedServersOfPack(manifest, packId, supply);
  const report: McpUninstallReport = { deselected, rewritten: new Map(), kept: [], refusals: [] };
  // A pack supplying no SELECTED server costs the client documents nothing —
  // not a read, not a rewrite. That is the overwhelmingly common uninstall.
  if (deselected.length === 0) return report;

  const wanted = new Set(deselected);
  // Three fixed paths, three different files: disjoint writes, so they run
  // together. `Promise.all` preserves input order, which is what keeps the
  // report deterministic without serialising the I/O.
  const perDoc = await Promise.all(
    [...MERGED_MCP_JSON_PATHS].map(async (path) => {
      const absPath = join(rootDir, ...path.split("/"));
      try {
        // Read for the ownership proof only: `engineOwnedServerIds` returns
        // catalog ids and quotes nothing, which is why this may run ahead of
        // the writer's link refusal — the same posture `sync` takes at its own
        // merge (`./sync/engine.ts`). The write below re-reads behind it.
        const raw = await readTextOrNull(absPath);
        if (raw === null) return null;
        const owned = new Set(
          [...engineOwnedServerIds(path, [], raw, supply)].filter((id) => wanted.has(id)),
        );
        const result: FilterMcpResult | null = apply
          ? await filterMcpJsonOnDisk(absPath, owned, NOTHING_KEPT)
          : filterMcpServers(raw, owned, NOTHING_KEPT);
        return result === null ? null : { path, result };
      } catch (cause) {
        return {
          path,
          refusal:
            `${path} could not be rewritten (${cause instanceof Error ? cause.message : String(cause)}), ` +
            `so it still holds ${deselected.join(", ")}. Remove the entry by hand.`,
        };
      }
    }),
  );

  const kept = new Set<string>();
  for (const outcome of perDoc) {
    if (outcome === null) continue;
    if ("refusal" in outcome) {
      report.refusals.push(outcome.refusal);
      continue;
    }
    const { path, result } = outcome;
    if (result.unparseable !== undefined) {
      report.refusals.push(
        `${path} is not valid JSON (${result.unparseable}), so which of its entries this repo ` +
          `wrote cannot be read — it was left untouched. Remove ${deselected.join(", ")} by hand.`,
      );
      continue;
    }
    for (const id of result.preservedUserServers) if (wanted.has(id)) kept.add(id);
    if (apply && result.removed.length > 0) report.rewritten.set(path, result.content);
  }
  report.kept = [...kept].toSorted();
  return report;
}

/**
 * `entry` with its recorded hash refreshed when this run rewrote the path it
 * names, and untouched otherwise.
 *
 * `contentHash` records what the engine last WROTE at a path, so leaving the
 * pre-removal hash behind would have the ledger assert bytes that are no longer
 * there. Only a row that already carried a hash is updated: this refreshes an
 * existing claim, it never mints a new one on a row that made none.
 */
function rehashRewritten(entry: LedgerEntry, rewritten: ReadonlyMap<string, string>): LedgerEntry {
  const written = rewritten.get(entry.path);
  if (written === undefined || entry.contentHash === undefined) return entry;
  return { ...cloneEntry(entry), contentHash: sha256(written) };
}

/** The MCP clause of the dry-run sentence; empty when the pack supplies none. */
function mcpSentence(mcp: McpUninstallReport): string {
  if (mcp.deselected.length === 0) return "";
  return (
    `, takes its selected MCP server(s) (${mcp.deselected.join(", ")}) out of ` +
    `${[...MERGED_MCP_JSON_PATHS].join(", ")} and out of the selection`
  );
}

// ── Scoped mode: --pack <id> ───────────────────────────────────

/**
 * Uninstall one pack and leave every other owner alone.
 *
 * The full clean deletes the state directory, ledger and all; here the ledger
 * must survive minus exactly this pack's rows, so after the sweep the shrunk
 * manifest is written back in place. Rows are dropped UNCONDITIONALLY — also
 * for files the sweep kept — because a row without matching bytes is not
 * ownership, it is a stale claim; the kept file is the operator's from then on.
 * A dry run drops nothing and prompts for nothing.
 *
 * Two things leave the repo besides the pack's own files, and both leave HERE
 * because this is the last moment they can (see {@link removePackMcpEntries}):
 * the pack's selected MCP servers are taken out of the three merged client
 * documents, and their ids are taken out of the selection. Order of operations
 * is documents, then sweep, then manifest — so a failure anywhere leaves a state
 * the next `sync` repairs by re-emitting what is still selected, rather than one
 * where the selection names an id nothing can resolve.
 */
async function runScopedClean(
  ctx: CliContext,
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
): Promise<CommandResult> {
  // planPackRemoval validates the id shape first, so `--pack ../x` is refused
  // as a VALIDATION_ERROR before it is ever matched against the ledger.
  const candidates = planPackRemoval(manifest, packId);
  if (candidates.length === 0) {
    const installed = installedPackIds(manifest);
    throw new CliFailure({
      code: "VALIDATION_ERROR",
      message: `no pack "${packId}" is installed — the ledger has no rows owned by ${packOwner(packId)}`,
      why:
        installed.length > 0
          ? `installed pack(s): ${installed.join(", ")}`
          : "no packs are installed in this repo",
      next:
        installed.length > 0
          ? "re-run with one of the installed pack ids"
          : "install one first: stamity add <pack-spec>",
    });
  }

  // Resolved BEFORE the sweep deletes the pack's files: after that, nothing can
  // render its server ids, and an id that cannot be rendered cannot be proved.
  const packSupply = await installedPackMcpSupply(rootDir, manifest);
  const selectedFromPack = selectedServersOfPack(manifest, packId, packSupply);

  // --dry-run neither prompts nor refuses: it writes nothing, so the
  // destructive gate has nothing to gate.
  if (!ctx.dryRun) {
    const alsoMcp =
      selectedFromPack.length === 0
        ? ""
        : `, plus its selected MCP server(s) (${selectedFromPack.join(", ")}) in the client config files`;
    await confirmDestruction(ctx, {
      refusedWhat: `pack "${packId}" (${candidates.length} installed file(s))`,
      question: `Remove pack "${packId}" — ${candidates.length} installed file(s) under ${STATE_DIR}/, plus its ledger rows${alsoMcp}?`,
    });
  }

  ctx.spinner.start(
    ctx.dryRun
      ? `Inspecting ${candidates.length} path(s) of pack "${packId}"...`
      : `Removing ${candidates.length} path(s) of pack "${packId}"...`,
  );
  // Documents first: while the pack is still installed, a failure here leaves a
  // repo the next `sync` re-emits into, rather than one holding an entry nobody
  // can prove and a selection nobody can resolve.
  const mcp = await removePackMcpEntries(rootDir, manifest, packId, packSupply, !ctx.dryRun);
  const report = await sweepReclaimCandidates(candidates, {
    rootDir,
    consent: !ctx.dryRun,
    trustedExactPaths: trustedInfraPaths(manifest.ledger),
    coOwnedPaths: mcpReclaimReducers(packSupply),
  });
  ctx.spinner.stop();

  let removedRows = 0;
  if (!ctx.dryRun) {
    const owner = packOwner(packId);
    const ledger = manifest.ledger
      .filter((entry) => entry.adapter !== owner)
      .map((entry) => rehashRewritten(entry, mcp.rewritten));
    removedRows = manifest.ledger.length - ledger.length;
    // The selection lets go of every id this pack supplied — including one whose
    // on-disk entry was kept because the operator had tuned it. Keeping it
    // selected would fail every later `sync` on an id nothing resolves, which is
    // the failure whose own remedy could not clean up after itself.
    const mcpConfig =
      manifest.mcp === undefined || mcp.deselected.length === 0
        ? manifest.mcp
        : {
            ...manifest.mcp,
            servers: manifest.mcp.servers.filter((id) => !mcp.deselected.includes(id)),
          };
    await writeManifest(
      rootDir,
      { ...manifest, ledger, ...(mcpConfig === undefined ? {} : { mcp: mcpConfig }) },
      { now: ctx.app.runtime.clock.now() },
    );
  }

  const formatted = formatReclaimReport(report);
  if (formatted !== "") ctx.io.out(`${formatted}\n`);

  // Files still on disk after the sweep (edited bytes, a refused unlink) are
  // salvage: their rows are gone, so nothing will ever reclaim them.
  const salvaged = report.entries.filter(
    (entry) => entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path",
  ).length;

  if (ctx.dryRun) {
    ctx.io.out(
      `Dry run: nothing was written and the manifest still records the pack. ` +
        `A real run also drops its ${candidates.length} ledger row(s)` +
        `${mcpSentence(mcp)} and leaves the rest of ${STATE_DIR}/ intact.\n`,
    );
    nextSteps(ctx, [`apply it: stamity clean --pack ${packId}`]);
  } else {
    ctx.io.out(
      `${ctx.palette.green(`Pack "${packId}" removed`)} — ${report.deletedCount} file(s) deleted, ` +
        `${report.skippedCount} skipped, ${removedRows} ledger row(s) dropped.\n`,
    );
    if (mcp.deselected.length > 0) {
      ctx.io.out(
        `MCP: ${mcp.deselected.join(", ")} dropped from the selection` +
          `${mcp.rewritten.size === 0 ? "" : ` and removed from ${[...mcp.rewritten.keys()].join(", ")}`}. ` +
          `Every entry those files hold that this repo did not write is untouched, and .env.mcp is ` +
          `yours — the credentials in it stay.\n`,
      );
    }
    if (mcp.kept.length > 0) {
      ctx.io.out(
        `Kept your own definition of ${mcp.kept.join(", ")} — those entries no longer match what ` +
          `this repo renders for them, so they are yours now. Remove them by hand if you meant to.\n`,
      );
    }
    for (const refusal of mcp.refusals) ctx.io.out(`${refusal}\n`);
    if (salvaged > 0) {
      ctx.io.out(
        `${salvaged} kept file(s) are user-owned now — their ledger rows are dropped, so no clean or sync will touch them again.\n`,
      );
    }
    nextSteps(ctx, ["reclaim any projected copies of the pack's content: stamity sync"]);
  }

  return {
    exitCode: 0,
    json: {
      removed: report.deletedCount,
      stripped: report.strippedCount,
      skipped: report.skippedCount,
      stateDirRemoved: false,
      entries: report.entries,
      pack: packId,
      removedRows,
      mcpServersDeselected: mcp.deselected,
      mcpDocumentsRewritten: [...mcp.rewritten.keys()],
      mcpServersKept: mcp.kept,
    },
  };
}

// ── Command ────────────────────────────────────────────────────

export const cleanCommand: CommandModule = {
  name: "clean",
  summary: `remove every generated file and the ${STATE_DIR}/ state directory`,
  mutating: true,

  configure(cmd) {
    cmd.option(
      "--pack <id>",
      "remove one installed pack — its files and ledger rows — and keep everything else",
    );
  },

  async run(ctx, opts): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const packId = typeof opts["pack"] === "string" ? opts["pack"] : undefined;

    // A corrupt manifest surfaces the engine's own CONFIG_ERROR untouched: its
    // message already names every defect and offers delete-and-reinitialise,
    // which is the better repair path than anything this command could add.
    const manifest = await readManifest(rootDir);
    if (manifest === null) return nothingToClean(ctx);

    if (packId !== undefined) return await runScopedClean(ctx, rootDir, manifest, packId);

    const candidates = planCleanCandidates(manifest);

    // --dry-run neither prompts nor refuses: it writes nothing, so the
    // destructive gate has nothing to gate.
    if (!ctx.dryRun) {
      await confirmDestruction(ctx, {
        refusedWhat: `${candidates.length} generated file(s) and ${STATE_DIR}/`,
        question: `Remove ${candidates.length} generated file(s) and the ${STATE_DIR}/ state directory (learnings, handoffs and installed packs included)?`,
      });
    }

    ctx.spinner.start(
      ctx.dryRun
        ? `Inspecting ${candidates.length} recorded path(s)...`
        : `Removing ${candidates.length} recorded path(s)...`,
    );
    const report = await sweepReclaimCandidates(candidates, {
      rootDir,
      consent: !ctx.dryRun,
      trustedExactPaths: trustedInfraPaths(manifest.ledger),
      // No deselection step here, and none is owed: the full clean sweeps the
      // client documents themselves, and it resolves pack supply BEFORE the
      // sweep, so the reducer can still prove a pack-supplied entry. The
      // selection goes with the state directory a few lines below.
      coOwnedPaths: mcpReclaimReducers(await installedPackMcpSupply(rootDir, manifest)),
    });
    ctx.spinner.stop();

    const stateDirRemoved = ctx.dryRun ? false : await removeStateDir(rootDir);

    const formatted = formatReclaimReport(report);
    if (formatted !== "") ctx.io.out(`${formatted}\n`);

    if (ctx.dryRun) {
      ctx.io.out(
        `Dry run: nothing was written and ${STATE_DIR}/ is untouched. ` +
          `A real run also deletes ${STATE_DIR}/ and everything in it.\n`,
      );
      nextSteps(ctx, ["apply it: stamity clean"]);
    } else {
      ctx.io.out(
        `${ctx.palette.green("Clean complete")} — ${report.deletedCount} file(s) deleted, ` +
          `${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped` +
          `${stateDirRemoved ? `, ${STATE_DIR}/ removed` : ""}.\n`,
      );
      ctx.io.out("Left your .gitignore untouched — stale ignore lines are harmless.\n");
      nextSteps(ctx, [REINIT_OFFER]);
    }

    return {
      exitCode: 0,
      json: {
        removed: report.deletedCount,
        stripped: report.strippedCount,
        skipped: report.skippedCount,
        stateDirRemoved,
        entries: report.entries,
      },
    };
  },
};
