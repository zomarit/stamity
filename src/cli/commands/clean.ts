import { createHash } from "node:crypto";
import { constants as fsConstants, type Stats } from "node:fs";
import { copyFile, link, lstat, readFile, readdir, rm, rmdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { copilotReleasedPaths, withRecordedSetupSteps, withSetupStepsRendered } from "../../adapters/copilot.ts";
import { resolveAutonomy } from "../../config/autonomy.ts";
import { PERSON_ONLY_GUARD_FILE } from "../../hooks/scripts.ts";
import { importBackupPathDefect, readManifest, writeManifest } from "../../manifest/manifest.ts";
import {
  filterMcpJsonOnDisk,
  filterMcpServers,
  type FilterMcpResult,
} from "../../manifest/mcpFilter.ts";
import type { PackSuppliedServer } from "../../mcp/catalog.ts";
import { MERGED_MCP_JSON_PATHS, engineOwnedServerIds } from "../../mcp/emit.ts";
import {
  CLIENT_MODELS_CACHE_FILE,
  CONTEXT_ONCE_DIR,
  GITIGNORE_FILE,
  GITIGNORE_LINES_KEPT_ONCE_WRITTEN,
  gitignoreRecordOf,
  PREFLIGHT_CANARY_FILE,
  presentGitignoreTargets,
  RUN_ENDED_MARKER_FILE,
  reconcileGitignore,
  type GitignoreReconcile,
} from "../../mcp/env.ts";
import { assertWriteTargetContained, isSharedRegularFile } from "../../merge/atomicWrite.ts";
import { formatReclaimReport, sweepReclaimCandidates, type ReclaimReport } from "../../merge/reclaim.ts";
import { applyCommandPrefix, buildContentIndex, slugOf } from "../../content/catalog.ts";
import { analyzeRepo, summarizeDetection } from "../../detect/repoAnalyzer.ts";
import { extractManagedBlock } from "../../merge/managedBlocks.ts";
import { ledgerHashIndex, ledgerPathSet, safeWriteFile } from "../../merge/safeWrite.ts";
import { planPackRemoval } from "../../pack/install.ts";
import { packDirRelPath } from "../../pack/receipt.ts";
import { discoverInstalledPacks, packMcpServers, withoutPolicyWarningPrint } from "../../pack/projection.ts";
import { toLedgerEntries, trustedInfraPaths, type ReclaimCandidate } from "../../manifest/ledger.ts";
import { OWNED_PATHS, needsRenderingProof } from "../../manifest/ownedPaths.ts";
import {
  MANIFEST_FILE,
  PACK_OWNER_PREFIX,
  isPackOwner,
  packOwner,
  type CoOwnership,
  type ImportBackup,
  type LedgerEntry,
  type SetupManifest,
} from "../../types/manifest.ts";
import { CONTENT_CLASSES, type AdapterOutput, type ContentClass, type MergeResult } from "../../types/content.ts";
import { TOOLS } from "../../types/core.ts";
import { REVIEW_GATE_LOCK_SUFFIX, REVIEW_GATE_STATE_FILE, REVIEW_GATE_TEMP_INFIX, STATE_DIR } from "../../types/markers.ts";
import { removeStateScaffold } from "../../emit/stateScaffold.ts";
import {
  coOwnedDocumentLanes,
  coOwnedOwnershipOf,
  coOwnedReclaimReducers,
  coOwnedReclaimRenderings,
  engineRenderingsFor,
  fullCorpusSelection,
  hookScriptRetention,
  ledgerRowsForOutput,
  outputWriteOptions,
  syncRenderingsFor,
  provenLegacyCursorGuards,
  type EmissionPlanFor,
  type LegacyCursorIdentity,
  type RenderingProof,
} from "../engine/emissionWrite.ts";
import { keepSavedModelLists, resolveModelLists, withModelLists } from "../engine/clientModels.ts";
import { getEmissionPlanner } from "../engine/emission.ts";
import { assertNotLoosened } from "../engine/autonomyGate.ts";
import { CliFailure } from "../kit/output.ts";
import { hasNpmChannel, packageCommand, packageName, registryOption } from "../kit/packageName.ts";
import type { CliContext, CommandModule, CommandResult } from "../kit/program.ts";
import { confirm, promptGate } from "../kit/prompts.ts";

/**
 * `stamity clean` — the uninstall verb, in two scopes.
 *
 * Default scope: every client stops emitting everything, and the user's state
 * stays (REQ-FLOW-028). Three properties define it, and each one is a
 * deliberate inversion of a default the rest of the CLI holds:
 *
 * 1. **Uninstall the setup, keep the state.** The removal set is built straight
 *    from the ledger rather than through `computeReclaimCandidates`: every
 *    client row, the copies `sync` projected from a pack included. A pack's own
 *    `pack:<id>` rows are left out, so the installed packs stay under
 *    `.stamity/packs/` with learnings, handoffs, overrides, run records and the
 *    rest, and the next `init` takes a bundled catalog pack back once `add`'s gates pass again
 *    (`../../pack/install.ts::adoptInstalledPacks`). `--purge` puts the pack
 *    rows back in and deletes `.stamity/` whole, as every release up to 1.16.0
 *    did.
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
 * the output says so. While the pack is still installed, the sweep also takes
 * the copies `sync` projected from it into the clients' folders, each deleted
 * only as bytes the running engine renders there from the pack
 * ({@link findPackCopies}); afterwards no rendering could prove them. A copy
 * the proof could not judge, because the pack could not be planned, keeps its
 * row (review/61). The closing next-step is the pinned `sync`, which
 * regenerates the clients' files without the pack; the reinit offer stays
 * full-clean-only.
 *
 * Order of operations: sweep first, the setup's own state after it. The plan is
 * read into memory before either, so the ordering costs nothing — but touching
 * the state directory last means a crash mid-sweep leaves the ledger on disk and
 * a re-run finishes the job. What the sweep will not do is documented in
 * `../../merge/reclaim.ts`: user bytes outside a managed block survive (the
 * block is stripped instead), unsafe paths are refused, missing files are
 * reported rather than fatal. After the sweep, on a live run, the default scope
 * removes the engine's machine-local files ({@link removeMachineLocalFiles}),
 * then the review gate's state ({@link removeSetupRecord}), then the store
 * placeholders, and prunes each folder left empty; a link at any of those
 * names, a linked store folder included, is left and named. `--purge` removes
 * the directory whole instead. `.gitignore` is not the sweep's: after those,
 * the full clean takes back each ignore line the ledger records the setup
 * appending (`coOwned.lines`, REQ-FLOW-016) whose ignored file is gone, and
 * deletes the file when the setup created it and nothing else is left. The
 * manifest goes last of all, with `.stamity/` once empty
 * ({@link removeSetupManifest}), so a step that fails before it leaves the
 * ledger a re-run finishes from. A line it never recorded — every line of a setup from 1.16.0 or
 * earlier — stays, and so does `.env.mcp`'s, which no verb takes back
 * (review/28). While a hook still runs from the state directory (below), every
 * line stays.
 *
 * One exception keeps the setup's record (S17): a hooks document the sweep
 * leaves in place — an owner's entries kept in it, or a file it cannot read —
 * that still runs a hook script under `.stamity/` holds that script back, and
 * deleting the directory would take it anyway. One that still runs a copy
 * under Claude Code's hook folder (`.claude/hooks/stamity/`) keeps it too,
 * since the ledger in it is what lets a re-run remove that copy (review/159).
 * The run says so, names the
 * document, and `--json` lists the held scripts as `stateDirKept`. The default
 * scope then keeps the manifest, so the re-run after that wiring is gone still
 * reads the ledger and takes back the ignore lines; every other file it removes
 * goes as usual, and each held script stays with its folders.
 */

/** Fresh row copy, so a candidate never aliases the manifest the caller holds. */
function cloneEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry };
}

/**
 * Every ledger row as a reclaim candidate — the clients' rows, and the
 * `pack:<id>` rows only under `purge` (REQ-FLOW-028): without it the installed
 * packs stay. The copies `sync` projected from a pack are client rows, so they
 * go either way.
 *
 * The reason is uniformly `"adapter-removed"`: it is the strongest of the three
 * (it outranks `path-renamed` and `deselected` when several rows name one path)
 * and it is the literal truth here — after this run no owner emits anything.
 *
 * Every row but the `.gitignore` rows: their lines are taken back last of all
 * ({@link takeBackGitignoreLines}), never by the sweep. And no row at a path the
 * operator took over (REQ-FLOW-149, `copilotReleasedPaths`): a row a sync has
 * not yet dropped still names a file that is theirs now, `--purge` or not.
 */
export function planCleanCandidates(manifest: SetupManifest, opts: { purge: boolean }): ReclaimCandidate[] {
  const released = copilotReleasedPaths(manifest);
  return manifest.ledger
    .filter((entry) => entry.path !== GITIGNORE_FILE && (opts.purge || !isPackOwner(entry.adapter)))
    .filter((entry) => !released.has(entry.path))
    .map((entry) => ({ entry: cloneEntry(entry), reason: "adapter-removed" }));
}

/**
 * Take back the `.gitignore` lines the setup recorded appending (REQ-FLOW-016):
 * each one whose ignored file is gone now, after the sweep and the state
 * directory, so a line goes only once nothing is left for it to ignore — and
 * `.env.mcp`'s never goes ({@link GITIGNORE_LINES_KEPT_ONCE_WRITTEN}). The file goes
 * when the setup created it and nothing of the owner's is in it. `null` when
 * the ledger records no line (a setup from 1.16.0 or earlier), which leaves
 * the file as it is.
 *
 * Its refusals (a linked `.gitignore`, a block-severity injection pattern in
 * the bytes it would keep) fail the run after the rest of the clean is done,
 * and name the lines left, since the caller removes the manifest that recorded
 * them before it rethrows the refusal.
 */
async function takeBackGitignoreLines(rootDir: string, manifest: SetupManifest): Promise<GitignoreReconcile | null> {
  const previous = gitignoreRecordOf(manifest.ledger);
  if (previous === null || (previous.lines ?? []).length === 0) return null;
  const present = await presentGitignoreTargets(rootDir);
  const keep = (previous.lines ?? []).filter((line) => present.has(line));
  try {
    return await reconcileGitignore(rootDir, { required: keep, previous });
  } catch (cause) {
    const left = (previous.lines ?? []).filter((line) => !present.has(line) && !GITIGNORE_LINES_KEPT_ONCE_WRITTEN.includes(line));
    throw new CliFailure({
      code: "FS_ERROR",
      message: `generated files were removed, but the ${GITIGNORE_FILE} lines this setup added were not taken back`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: `delete these lines from ${GITIGNORE_FILE} by hand: ${left.join(", ")}`,
    });
  }
}

/** One backup a full clean moved back over the instruction file it was taken of. */
interface RestoredBackup {
  path: string;
  backup: string;
}

/** One recorded backup a full clean left where it is, and why. */
interface SkippedRestore extends RestoredBackup {
  reason: string;
}

/** What {@link restoreImportBackups} did with each recorded backup. */
interface RestoreOutcome {
  restored: RestoredBackup[];
  restoreSkipped: SkippedRestore[];
}

/** The `replace` decisions that record a backup, the only ones a full clean restores from. */
function recordedBackups(manifest: SetupManifest): { path: string; backup: ImportBackup }[] {
  return (manifest.importChoice ?? []).flatMap((decision) =>
    decision.mode === "replace" && decision.backup !== undefined ? [{ path: decision.path, backup: decision.backup }] : [],
  );
}

/** `lstat`, or `null` when nothing is at `absPath`. */
async function lstatOrNull(absPath: string): Promise<Stats | null> {
  try {
    return await lstat(absPath);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
}

/**
 * Why the recorded backup of `path` may not be moved back, or `null` when it may
 * (REQ-FLOW-027). Every check the manifest reader made is made again here, since
 * this is the step that moves the file: `path` is an instruction file `init` imports,
 * the backup is that file's own `.bak` name in its folder, neither name leaves
 * the tree through a link, nothing is at `path` (a file there after the sweep is
 * never a move destination), and the backup is a regular file with one name
 * whose bytes hash to the recorded `sha256`.
 */
async function restoreRefusal(rootDir: string, path: string, backup: ImportBackup): Promise<string | null> {
  if (!OWNED_PATHS.importTargets.includes(path)) return `${path} is not an instruction file init imports`;
  const defect = importBackupPathDefect(path, backup.path);
  if (defect !== null) return `the recorded backup ${JSON.stringify(backup.path)} ${defect}`;
  const target = join(rootDir, ...path.split("/"));
  const source = join(rootDir, ...backup.path.split("/"));
  try {
    await assertWriteTargetContained(target, rootDir);
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  if ((await lstatOrNull(target)) !== null) return `${path} is there, so the backup was not moved over it`;
  const stats = await lstatOrNull(source);
  if (stats === null) return `${backup.path} is gone`;
  if (stats.isSymbolicLink()) return `${backup.path} is a symbolic link, so its bytes are not the backup's`;
  if (!stats.isFile()) return `${backup.path} is not a regular file`;
  if (isSharedRegularFile(stats)) return `${backup.path} is a hard link, so its bytes carry a second name this tree cannot see`;
  const hash = createHash("sha256").update(await readFile(source)).digest("hex");
  if (hash !== backup.sha256) {
    return `${backup.path} hashes to ${hash}, not the ${backup.sha256} init recorded, so it was edited since`;
  }
  return null;
}

/** The `link` errors of a file system that keeps no hard links (exFAT, FAT32, some network mounts): the move copies instead. */
const NO_HARD_LINKS: ReadonlySet<string> = new Set(["EPERM", "ENOTSUP", "EOPNOTSUPP", "ENOSYS", "EXDEV"]);

/**
 * Move `source` to `target` without ever replacing a file at `target`: a hard
 * link, which fails with `EEXIST` when anything is there, then the old name
 * removed. On a file system that keeps no hard links ({@link NO_HARD_LINKS})
 * the bytes are copied with `COPYFILE_EXCL`, which refuses the same way. So a
 * file that appears at `target` after the restore's checks is kept, and the
 * backup with it. `null` when moved, else why not. `linkFile` is `link`; a
 * test hands in one that refuses as such a file system does.
 */
export async function moveWithoutClobber(
  source: string,
  target: string,
  linkFile: (existing: string, created: string) => Promise<void> = link,
): Promise<string | null> {
  const messageOf = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));
  const appeared = "a file appeared at the target after the checks, so the backup was not moved over it";
  try {
    await linkFile(source, target);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return appeared;
    if (code === undefined || !NO_HARD_LINKS.has(code)) return `the move failed: ${messageOf(cause)}`;
    try {
      await copyFile(source, target, fsConstants.COPYFILE_EXCL);
    } catch (copyCause) {
      if ((copyCause as NodeJS.ErrnoException).code === "EEXIST") return appeared;
      return `the move failed: ${messageOf(copyCause)}`;
    }
  }
  try {
    await unlink(source);
  } catch (cause) {
    return `the file is back, but the backup could not be removed (${messageOf(cause)}); delete it by hand`;
  }
  return null;
}

/**
 * Move each recorded backup of a `replace` import back over the instruction
 * file it was taken of, after the sweep removed the engine's file there
 * (REQ-FLOW-027). One that fails a check ({@link restoreRefusal}) stays where
 * it is, and so does whatever is at its path; the reason is reported. A move
 * that fails ({@link moveWithoutClobber}) is reported the same way, so one backup never stops the rest.
 */
async function restoreImportBackups(rootDir: string, manifest: SetupManifest): Promise<RestoreOutcome> {
  const outcome: RestoreOutcome = { restored: [], restoreSkipped: [] };
  for (const { path, backup } of recordedBackups(manifest)) {
    // oxlint-disable-next-line no-await-in-loop -- one decision per instruction file, checked and moved in order
    let reason = await restoreRefusal(rootDir, path, backup);
    // oxlint-disable-next-line no-await-in-loop
    if (reason === null) reason = await moveWithoutClobber(join(rootDir, ...backup.path.split("/")), join(rootDir, ...path.split("/")));
    if (reason === null) outcome.restored.push({ path, backup: backup.path });
    else outcome.restoreSkipped.push({ path, backup: backup.path, reason });
  }
  return outcome;
}

/**
 * The closing lines on what a default clean kept under the state directory: what is left, the packs, and each name it left.
 * How to remove the rest depends on the manifest (review/57): once it is gone no `clean --purge` finds a record, so the
 * line says to delete the folder by hand; while a hook still runs from the state directory it stays, and `--purge`
 * deletes the rest once that wiring is gone.
 */
function keptStateLines(kept: readonly string[], packsKept: readonly string[], state: StateRemoval | null, wiringHeld: boolean): string[] {
  const removeRest = wiringHeld
    ? `Once that wiring is gone, ${packageCommand("clean --purge")} deletes these too.`
    : `To remove these too, delete ${STATE_DIR}/ yourself: the setup's record is gone, so no clean removes them now.`;
  return [
    ...(kept.length === 0 ? [] : [`Kept under ${STATE_DIR}/: ${kept.join(", ")}. ${removeRest}`]),
    ...(packsKept.length === 0
      ? []
      : [
          `The installed pack(s) ${packsKept.join(", ")} stay under ${STATE_DIR}/packs/. The next ${packageCommand("init")} takes one back only ` +
            `if it is a first-party pack from the bundled catalog and every gate add runs passes again on its kept files; ` +
            `it names any other kept pack and records none of its files, so re-install that one with ${packageCommand("add <source>")}.`,
        ]),
    ...(state?.left ?? []).map(({ path, why }) => `Left ${path}: ${why}. Delete it by hand unless it is yours.`),
  ];
}

/** The closing lines on the recorded backups: each one moved back, and each one left with its reason. */
function restoreLines(outcome: RestoreOutcome): string[] {
  return [
    ...outcome.restored.map(({ path, backup }) => `Restored ${path} from ${backup}: your file is back as it was before setup.`),
    ...outcome.restoreSkipped.map(
      ({ path, backup, reason }) => `Left ${backup} in place and did not restore ${path}: ${reason}. Move it back by hand if it is yours.`,
    ),
  ];
}

/**
 * The closing sentence on what a live full clean did to `.gitignore`; `held` when
 * the state directory was kept, so the take-back did not run (review/29).
 */
function gitignoreOutcomeLine(outcome: GitignoreReconcile | null, held: boolean): string {
  if (held) {
    return (
      `Left your ${GITIGNORE_FILE} untouched: ${STATE_DIR}/ is kept, and a hook still wired to it can write the files ` +
      `its lines ignore. Once that wiring is gone, the re-run takes back the lines this setup added.`
    );
  }
  if (outcome === null) return `Left your ${GITIGNORE_FILE} untouched: this setup recorded no line of its own in it.`;
  const recorded = outcome.record.lines ?? [];
  const kept = recorded.filter((line) => !GITIGNORE_LINES_KEPT_ONCE_WRITTEN.includes(line));
  const keptForGood = recorded.filter((line) => GITIGNORE_LINES_KEPT_ONCE_WRITTEN.includes(line));
  const parts = [
    ...(outcome.deleted ? [`Removed ${GITIGNORE_FILE}: the setup created it, and nothing of yours was in it.`] : []),
    ...(!outcome.deleted && outcome.removed.length > 0
      ? [`Took back the ${GITIGNORE_FILE} line(s) this setup added: ${outcome.removed.join(", ")}.`]
      : []),
    ...(kept.length > 0 ? [`Kept the ${GITIGNORE_FILE} line for ${kept.join(", ")}: that file is still there, so git keeps ignoring it.`] : []),
    ...(keptForGood.length > 0
      ? [`Kept the ${GITIGNORE_FILE} line for ${keptForGood.join(", ")}: clean never takes it back, so a token file in any checkout stays ignored.`]
      : []),
  ];
  return parts.length > 0 ? parts.join(" ") : `Left your ${GITIGNORE_FILE} untouched: no line this setup added is left in it.`;
}

/**
 * The running engine's renderings at the candidates' paths, for the sweep's
 * rendering proof (REQ-PLUGIN-046): the clients this setup wrote for, planned
 * the way `sync` plans
 * (`./sync/engine.ts`'s `renderingPlanner`, which the layering keeps this verb
 * from importing), with this engine's version and package identity. Read before
 * the sweep, while the packs and overrides they are rendered from are on disk.
 * With them, what `sync` with this version writes at those paths
 * (`syncRenderings`), which the sweep marks a kept file against
 * ({@link refuseStaleRenderings}). `manifest` is {@link renderingManifest}'s,
 * so a model a list picked renders as the files carry it.
 */
async function cleanRenderings(
  rootDir: string,
  manifest: SetupManifest,
  candidates: readonly ReclaimCandidate[],
  engineVersion: string,
): Promise<RenderingProof & { syncRenderings: ReadonlyMap<string, ReadonlySet<string>> }> {
  const paths = candidates.map((candidate) => candidate.entry.path);
  const [proof, syncRenderings] = await Promise.all([
    // Under `off` the plan renders no setup workflow, which an unedited copy's delete needs (REQ-FLOW-149).
    engineRenderingsFor(rootDir, withSetupStepsRendered(manifest), paths, cleanPlanner(rootDir, engineVersion), legacyCursorIdentity()),
    syncRenderingsFor(rootDir, manifest, paths, cleanPlanner(rootDir, engineVersion)),
  ]);
  // An earlier release's unedited copy, as its row records it (review/66).
  return { ...(await withRecordedSetupSteps(rootDir, manifest, proof)), syncRenderings };
}

/**
 * `manifest` with the model lists that reproduce the files already emitted
 * laid in memory (`resolveModelLists(...).asEmitted`, the drift gate's): the
 * committed manifest carries no list (REQ-LADDER-009), so without them a Codex
 * or Copilot pick a list moved, or a Cursor pin a list kept bare, renders
 * otherwise, no rendering proves the file, and every run refuses it as stale
 * while the `sync` it names writes the same bytes again (review/114). Both
 * rendering proofs plan from it; nothing writes it.
 */
async function renderingManifest(rootDir: string, manifest: SetupManifest): Promise<SetupManifest> {
  return withModelLists(manifest, (await resolveModelLists(rootDir, manifest)).asEmitted);
}

/**
 * This installation's package identity, under which the frozen 1.11.0 builder
 * re-renders the guards 1.11.0 wrote at their old names (REQ-FLOW-038), as
 * `sync` passes it (`./sync/engine.ts`).
 */
function legacyCursorIdentity(): LegacyCursorIdentity {
  return { packageName: packageName(), npmChannel: hasNpmChannel() };
}

/** What one planner run showed: every path it renders, or `null` when it could not be built, and each path's bytes. */
interface PlanSeen {
  paths: Set<string> | null;
  contents?: Map<string, string>;
}

/**
 * The planner call the rendering proof injects, built as `sync` builds its
 * own. With `seen`, the run also records every path it rendered, so
 * `clean --pack` can tell which paths the pack's presence adds
 * ({@link findPackCopies}); why a plan could not be built is the proof's own
 * `renderingsUnbuilt`.
 */
function cleanPlanner(rootDir: string, engineVersion: string, seen?: PlanSeen): EmissionPlanFor {
  return async (setupClients, facts) => {
    const outputs = await getEmissionPlanner().plan({
      rootDir,
      manifest: setupClients,
      engineVersion,
      packageName: packageName(),
      npmChannel: hasNpmChannel(),
      ...registryOption({}),
      facts,
    });
    if (seen !== undefined) {
      seen.paths = new Set(outputs.map((output) => output.path));
      seen.contents = new Map(outputs.map((output) => [output.path, output.content]));
    }
    return outputs;
  };
}

/** The pack folders whose files project into the clients, by the content class each holds. */
const PACK_CLASS_DIRS: Readonly<Record<string, ContentClass>> = {
  agents: "agent",
  skills: "skill",
  rules: "rule",
  commands: "command",
};

/**
 * The artifact a pack-relative path names, as `<class>:<slug>` — a skill by
 * its folder, any other class by its `.md` file's stem, the engine prefix
 * taken off as the catalog takes it (`../../content/catalog.ts::slugOf`) — or
 * `null` for a file that is no artifact (the receipt, hooks, MCP servers).
 */
function packArtifactOf(relPath: string): string | null {
  const segments = relPath.split("/");
  const type = PACK_CLASS_DIRS[segments[0] ?? ""];
  const name = segments[1];
  if (type === undefined || name === undefined) return null;
  if (type === "skill") return segments.length >= 3 ? `${type}:${slugOf(name)}` : null;
  return segments.length === 2 && name.endsWith(".md") ? `${type}:${slugOf(name.slice(0, -".md".length))}` : null;
}

/**
 * Every artifact pack `packId` ships, read from the pack itself and never from
 * a plan, so it holds when the pack cannot be planned: the artifacts its own
 * ledger rows name (`artifactId` is `<pack id>/<pack-relative path>`, read
 * past the whole id, whose scope holds a `/` of its own: review/86), and
 * those its folder holds now. The rows keep an artifact whose file was moved
 * out of the folder (`check`'s pack-integrity remedy, review/71).
 */
async function packArtifacts(rootDir: string, manifest: SetupManifest, packId: string): Promise<Set<string>> {
  const owner = packOwner(packId);
  const prefix = `${packId}/`;
  const rels = manifest.ledger
    .filter((row) => row.adapter === owner && row.artifactId.startsWith(prefix))
    .map((row) => row.artifactId.slice(prefix.length));
  const dir = join(rootDir, ...packDirRelPath(packId).split("/"));
  for (const classDir of Object.keys(PACK_CLASS_DIRS)) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- four fixed folders, read in order
      const entries = await readdir(join(dir, classDir), { withFileTypes: true });
      for (const entry of entries) {
        rels.push(entry.isDirectory() ? `${classDir}/${entry.name}/SKILL.md` : `${classDir}/${entry.name}`);
      }
    } catch {
      // reason: a class folder the pack does not ship, or a pack folder that
      // is gone, adds no artifact; the ledger rows above still name its own.
    }
  }
  return new Set(rels.map(packArtifactOf).filter((key): key is string => key !== null));
}

/**
 * True when client row `row` is one of `artifacts` by both its record and its
 * path: its class and catalog id name the artifact, and the name its path
 * projects under — the folder after `skills/`, else the file name up to its
 * first dot — slugs to that id. A forged row can name a pack artifact, but at
 * any other path than the one that artifact projects to it is not taken
 * (review/68).
 */
function isPackArtifactRow(row: LedgerEntry, artifacts: ReadonlySet<string>): boolean {
  if (!(CONTENT_CLASSES as readonly string[]).includes(row.artifactType)) return false;
  const type = row.artifactType as ContentClass;
  const slug = slugOf(projectedNameOf(row.path));
  return applyCommandPrefix(slug, type) === row.artifactId && artifacts.has(`${type}:${slug}`);
}

/** The artifact name a client path projects under: the folder after `skills/`, else the file name up to its first dot. */
function projectedNameOf(path: string): string {
  const segments = path.split("/");
  const skillsAt = segments.indexOf("skills");
  const name = skillsAt >= 0 && skillsAt < segments.length - 1 ? segments[skillsAt + 1] : segments.at(-1);
  return (name ?? "").split(".")[0] ?? "";
}

/** The client copies `clean --pack` sweeps beside the pack's own files. */
interface PackCopies {
  /** The ledger rows of the copies, as they stand in the manifest. */
  rows: ReadonlySet<LedgerEntry>;
  /** The copies as sweep candidates. */
  candidates: ReclaimCandidate[];
  /** The proof, planned with the pack installed, at the pack's paths and its copies'. */
  proof: RenderingProof;
  /** Why the plan with the pack installed could not be built, or `null` when it was. */
  unplanned: string | null;
  /** Why the plan without the pack could not be built, so no copy was looked for, or `null`. */
  unexamined: string | null;
  /**
   * The client documents both plans render, but with other bytes: each names
   * something of the pack's (Cursor's spawn guard and the model maps list its
   * agents, Codex's override file inlines its rules), so `clean --pack`
   * re-renders them without it ({@link rewriteHookDocuments}). The merged MCP
   * documents are not among them: {@link removePackMcpEntries} takes the pack
   * out of those.
   */
  rerendered: string[];
}

/**
 * The copies `sync` projected from pack `packId` into the clients' folders
 * (REQ-PLUGIN-046, unit d1a2): the emission is planned twice, once as the
 * manifest stands and once with this pack's `pack:<id>` rows removed, both for
 * the clients the setup wrote for and both under the proof's policy opt-out
 * (`engineRenderingsFor`), so a pack the org policy denies is still rendered.
 * A client's row whose path the first plan renders and the second does not is
 * a copy. A path both render is not one, even where the bytes differ (a shared
 * policy document): the next `sync` rewrites it.
 *
 * A client row of one of the pack's own artifacts ({@link packArtifacts},
 * {@link isPackArtifactRow}) at a path the second plan does not render is a
 * copy too, rendered or not: an artifact whose file was moved out of the pack
 * folder is still the pack's by its row (review/71).
 *
 * Only a path that needs the rendering proof can be a copy: elsewhere no
 * rendering proves a delete, and the row is left for `sync` as before.
 *
 * When the first plan cannot be built (a pack whose own command and skill
 * share a name, which the planner refuses), the copies are only the rows of
 * the pack's own artifacts, read from the pack and not from a plan, so a
 * retired engine file, a removed override or a forged row elsewhere is left
 * alone (review/68, review/70). No rendering proves any of them: the sweep
 * keeps each unjudged, with its row, and names it (review/61). It never falls
 * back to the recorded hash, which a forged row could match. When the second
 * plan cannot be built, no copy can be told from a shared path, none is
 * taken, and the run says so.
 *
 * The same two plans name the documents the pack changes without owning
 * (`rerendered`): a client row's path both render with other bytes.
 */
async function findPackCopies(
  rootDir: string,
  manifest: SetupManifest,
  packId: string,
  packRows: readonly ReclaimCandidate[],
  engineVersion: string,
): Promise<PackCopies> {
  const owner = packOwner(packId);
  const clientRows = manifest.ledger.filter(
    (row) => (TOOLS as readonly string[]).includes(row.adapter) && needsRenderingProof(row.path),
  );
  const installed: PlanSeen = { paths: null };
  const proof = await engineRenderingsFor(
    rootDir,
    manifest,
    [...packRows.map((candidate) => candidate.entry.path), ...clientRows.map((row) => row.path)],
    cleanPlanner(rootDir, engineVersion, installed),
  );
  const none = { rows: new Set<LedgerEntry>(), candidates: [], proof, unplanned: null, unexamined: null, rerendered: [] };
  if (clientRows.length === 0) return none;
  const removed: PlanSeen = { paths: null };
  const withoutProof = await engineRenderingsFor(
    rootDir,
    { ...manifest, ledger: manifest.ledger.filter((row) => row.adapter !== owner) },
    clientRows.map((row) => row.path),
    cleanPlanner(rootDir, engineVersion, removed),
  );
  const withoutPack = removed.paths;
  if (withoutPack === null) return { ...none, unexamined: withoutProof.renderingsUnbuilt ?? "the plan could not be built" };
  const withPack = installed.paths;
  const artifacts = await packArtifacts(rootDir, manifest, packId);
  const rows = new Set(
    clientRows.filter(
      (row) =>
        !withoutPack.has(row.path) && (withPack?.has(row.path) === true || isPackArtifactRow(row, artifacts)),
    ),
  );
  const withBytes = installed.contents;
  const withoutBytes = removed.contents;
  const rerendered = [
    ...new Set(
      manifest.ledger
        .filter((row) => (TOOLS as readonly string[]).includes(row.adapter) && !MERGED_MCP_JSON_PATHS.has(row.path))
        .map((row) => row.path),
    ),
  ].filter((path) => {
    const before = withBytes?.get(path);
    const after = withoutBytes?.get(path);
    return before !== undefined && after !== undefined && before !== after;
  });
  return {
    rows,
    // "deselected": the client is still a target, and no plan without the pack produces the artifact.
    candidates: [...rows].map((row) => ({ entry: cloneEntry(row), reason: "deselected" })),
    proof,
    unplanned: withPack === null ? (proof.renderingsUnbuilt ?? "the plan could not be built") : null,
    unexamined: null,
    rerendered,
  };
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

const REINIT_OFFER = `start fresh: ${packageCommand("init")}`;

/** The one-per-line next-step block every exit path ends with. */
function nextSteps(ctx: CliContext, steps: readonly string[]): void {
  ctx.io.out("\nnext:\n");
  for (const [index, step] of steps.entries()) {
    ctx.io.out(`  ${index + 1}. ${step}\n`);
  }
}

/**
 * Nothing to clean: a repo with no manifest is already in the target state. A
 * `--purge` that finds a state directory but no manifest (a default clean ran
 * first) says it removes nothing without that record, and what does (review/57).
 */
async function nothingToClean(ctx: CliContext, rootDir: string, purge: boolean): Promise<CommandResult> {
  const stateLeft = purge && (await lstatOrNull(join(rootDir, STATE_DIR))) !== null;
  ctx.io.out(
    `Nothing to clean — this repo has no ${STATE_DIR}/ manifest.` +
      (stateLeft
        ? ` ${packageCommand("clean --purge")} removes ${STATE_DIR}/ only by the setup's record, and there is none, so what is ` +
          `under ${STATE_DIR}/ stays: delete ${STATE_DIR}/ yourself to remove it.`
        : "") +
      "\n",
  );
  nextSteps(ctx, [REINIT_OFFER]);
  return {
    exitCode: 0,
    json: { removed: 0, stripped: 0, skipped: 0, stateDirRemoved: false, entries: [] },
  };
}

/** How many kept files the refusal names before it counts the rest. */
const STALE_NAMED = 3;

/**
 * Refuse before anything is touched when the sweep would keep a file a `sync`
 * with this version rewrites (review/128): its bytes still hash to what the
 * ledger records, and `sync` with this version writes its path with other bytes
 * — an earlier version wrote it, or detection or the gates moved since the last
 * `sync` (`../../merge/reclaim.ts`'s `staleRendering`). Keeping
 * it would strand an unedited engine file once the ledger goes; after that
 * `sync` the proof holds and the clean removes it. Runs on the preview sweep,
 * before the confirmation, so `--dry-run` refuses the same way. A retired
 * artifact, an edited file and one the proof could not judge are never marked.
 *
 * One case is not cleared by that `sync`, and the next step names it: a pack
 * file edited after install renders other bytes at its client copy, so the copy
 * is marked here too, in both forms of the command, and a `sync` would carry
 * the edit into the client's files — the step `check`'s pack-integrity row
 * forbids (`packReinstallSteps`, `../../pack/verifyInstalled.ts`). With the
 * edited file out of the pack's directory no rendering names the copy, so it
 * is kept and named and the run goes through with no `sync`. The exception is
 * worded on an edited file, not on a failing row: once the file is out the row
 * reports it missing, a `sync` carries nothing of it, and a copy that is stale
 * for another reason still needs that `sync`.
 */
function refuseStaleRenderings(ctx: CliContext, manifest: SetupManifest, preview: ReclaimReport, rerun: string): void {
  const stale = preview.entries.filter((entry) => entry.staleRendering === true).map((entry) => entry.path);
  if (stale.length === 0) return;
  const named =
    stale.slice(0, STALE_NAMED).join(", ") + (stale.length > STALE_NAMED ? ` and ${stale.length - STALE_NAMED} more` : "");
  const wroteBy =
    manifest.generatedBy === ctx.app.version ? "" : ` Version ${manifest.generatedBy} last wrote this setup.`;
  throw new CliFailure({
    code: "CLEAN_ERROR",
    message: `clean refused: ${stale.length} file(s) the ledger records as unedited differ from what this version renders there — ${named}`,
    why:
      `each still hashes to what the ledger records, but this version (${ctx.app.version}) renders other bytes at its path, ` +
      `so the delete cannot be proven and clean would leave the file behind.${wroteBy} Nothing was removed. ` +
      `A sync rewrites these paths, so if one of them is yours rather than the engine's, move it aside first.`,
    next:
      `run ${packageCommand("sync")} with this version first, then ${packageCommand(rerun)} — ` +
      `unless the pack-integrity row of ${packageCommand("check")} names an edited pack file, one that no longer ` +
      `hashes to what its install recorded: then do not run sync, which would carry the edited bytes into the ` +
      `clients' files; move that file out of the pack's directory first, as that row says, and run ` +
      `${packageCommand(rerun)} again`,
  });
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
    env: ctx.app.runtime.env,
    palette: ctx.palette,
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

/** What the default clean took out of the state directory, and each name it left because no file the engine wrote is there. */
interface StateRemoval {
  removed: string[];
  left: { path: string; why: string }[];
}

/** Why a linked store folder is left: its placeholder is not under this repository (review/60). */
const LINK_NOT_FOLLOWED = "it is a link, so clean did not follow it";

/** The engine's machine-local files directly under the state directory (REQ-FLOW-028, plan round 1's W-5). */
const MACHINE_LOCAL_FILES: readonly string[] = [PREFLIGHT_CANARY_FILE, RUN_ENDED_MARKER_FILE, CLIENT_MODELS_CACHE_FILE];

/**
 * Unlink `path` when it is a regular file; leave a link, a folder or anything
 * else at its name and say so, since that is not a file the engine wrote. A
 * missing file is nothing to do. A failed unlink stops the run: the manifest is
 * still there, so a re-run finishes.
 */
async function unlinkRegularFile(rootDir: string, path: string, removal: StateRemoval): Promise<void> {
  const absPath = join(rootDir, ...path.split("/"));
  const stats = await lstatOrNull(absPath);
  if (stats === null) return;
  if (!stats.isFile()) {
    removal.left.push({ path, why: stats.isSymbolicLink() ? "it is a link, so clean did not follow it" : "it is not a regular file" });
    return;
  }
  await removeOrFail(path, () => unlink(absPath));
  removal.removed.push(path);
}

/** Run one removal of the state directory's own files; a failure names the path and leaves the manifest for a re-run. */
async function removeOrFail(path: string, remove: () => Promise<unknown>): Promise<void> {
  try {
    await remove();
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new CliFailure({
      code: "FS_ERROR",
      message: `generated files were removed, but ${path} could not be deleted`,
      why: cause instanceof Error ? cause.message : String(cause),
      next: `close anything holding ${path} open, then re-run stamity clean`,
    });
  }
}

/**
 * The engine's machine-local files (REQ-FLOW-028): the pre-flight canary, the
 * run-ended marker, the client model cache, and each regular file directly
 * under the context-once folder, then that folder once empty. So no file is
 * left whose ignore line the take-back removes. Each is `lstat`-checked: a link
 * is left and named, and keeps its ignore line, since the take-back sees it.
 */
async function removeMachineLocalFiles(rootDir: string, removal: StateRemoval): Promise<void> {
  for (const path of MACHINE_LOCAL_FILES) {
    // oxlint-disable-next-line no-await-in-loop -- three fixed names, each its own file
    await unlinkRegularFile(rootDir, path, removal);
  }
  const markers = join(rootDir, ...CONTEXT_ONCE_DIR.split("/"));
  const stats = await lstatOrNull(markers);
  if (stats === null) return;
  if (!stats.isDirectory()) {
    removal.left.push({ path: `${CONTEXT_ONCE_DIR}/`, why: stats.isSymbolicLink() ? "it is a link, so clean did not follow it" : "it is not a folder" });
    return;
  }
  for (const name of (await readdir(markers)).toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- one marker per conversation, each its own file
    await unlinkRegularFile(rootDir, `${CONTEXT_ONCE_DIR}/${name}`, removal);
  }
  try {
    await rmdir(markers);
  } catch {
    // reason: not silent — a folder still holding what was left is named through `left`, and its ignore line stays.
  }
}

/**
 * The setup's own record under the state directory (REQ-FLOW-028): the review
 * gate's counter, its lock folder (removed even while held: it is machine-local
 * and no run outlives the setup) and its publish temp files. Only regular files
 * and a real lock folder go. The manifest is not among them: it goes last of all
 * ({@link removeSetupManifest}).
 */
async function removeSetupRecord(rootDir: string, removal: StateRemoval): Promise<void> {
  await unlinkRegularFile(rootDir, REVIEW_GATE_STATE_FILE, removal);
  const lockPath = `${REVIEW_GATE_STATE_FILE}${REVIEW_GATE_LOCK_SUFFIX}`;
  const lockAbs = join(rootDir, ...lockPath.split("/"));
  const lock = await lstatOrNull(lockAbs);
  if (lock?.isDirectory() === true) {
    await removeOrFail(lockPath, () => rm(lockAbs, { recursive: true, force: true }));
    removal.removed.push(`${lockPath}/`);
  } else if (lock !== null) {
    await unlinkRegularFile(rootDir, lockPath, removal);
  }
  const stem = REVIEW_GATE_STATE_FILE.slice(STATE_DIR.length + 1) + REVIEW_GATE_TEMP_INFIX;
  let names: string[] = [];
  try {
    names = await readdir(join(rootDir, STATE_DIR));
  } catch {
    // reason: not silent — no state directory holds no temp file.
  }
  for (const name of names.filter((entry) => entry.startsWith(stem)).toSorted()) {
    // oxlint-disable-next-line no-await-in-loop -- one temp file per interrupted publish
    await unlinkRegularFile(rootDir, `${STATE_DIR}/${name}`, removal);
  }
}

/**
 * Remove every empty folder under `dir`, bottom up, and `dir` itself once
 * empty; `true` when `dir` went. A link is never followed: only a real folder
 * is walked, and a folder holding anything stays with what it holds.
 */
async function pruneEmptyFolders(dir: string): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  let left = entries.length;
  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop -- bottom up: a folder is judged once its own folders are pruned
    if (entry.isDirectory() && (await pruneEmptyFolders(join(dir, entry.name)))) left -= 1;
  }
  if (left > 0) return false;
  try {
    await rmdir(dir);
    return true;
  } catch {
    return false;
  }
}

/** What is left directly under the state directory, folders ending in `/`, sorted; empty when it is gone. */
async function keptStateEntries(rootDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(rootDir, STATE_DIR), { withFileTypes: true });
    return entries.map((entry) => (entry.isDirectory() ? `${entry.name}/` : entry.name)).toSorted();
  } catch {
    return [];
  }
}

/** Whether the state directory is a real folder: no step of the default scope works over one that is a link, which no setup writes. */
async function isRealStateDir(rootDir: string): Promise<boolean> {
  return (await lstatOrNull(join(rootDir, STATE_DIR)))?.isDirectory() === true;
}

/**
 * The default scope's state step (REQ-FLOW-028), on a live run after the sweep:
 * the machine-local files, the review gate's state, the store placeholders (a
 * store folder that is a link is left and named, review/60), then each folder
 * left empty, which keeps every held hook script with its folders. The manifest
 * stays for {@link removeSetupManifest}, so a failure here leaves the ledger a
 * re-run finishes from (review/58).
 */
async function removeSetupState(rootDir: string): Promise<StateRemoval> {
  const removal: StateRemoval = { removed: [], left: [] };
  if (!(await isRealStateDir(rootDir))) return removal;
  await removeMachineLocalFiles(rootDir, removal);
  await removeSetupRecord(rootDir, removal);
  const scaffold = await removeStateScaffold(rootDir);
  removal.removed.push(...scaffold.removed);
  removal.left.push(...scaffold.linked.map((path) => ({ path, why: LINK_NOT_FOLLOWED })));
  await pruneEmptyFolders(join(rootDir, STATE_DIR));
  return removal;
}

/**
 * The default scope's last step: the manifest, after the `.gitignore` take-back,
 * then `.stamity/` itself once empty. Every earlier step can fail with the
 * ledger still on disk, so a re-run finishes the clean (review/58, review/61).
 */
async function removeSetupManifest(rootDir: string, removal: StateRemoval): Promise<void> {
  if (!(await isRealStateDir(rootDir))) return;
  await unlinkRegularFile(rootDir, `${STATE_DIR}/${MANIFEST_FILE}`, removal);
  await pruneEmptyFolders(join(rootDir, STATE_DIR));
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

/** What {@link rewriteHookDocuments} did: the ledger rows each written document earns, and what it could not do. */
interface HookDocumentRewrite {
  /** Repo-relative path → the rows the written document earns, replacing the clients' rows there. */
  rows: Map<string, LedgerEntry[]>;
  /** The documents whose bytes the write changed, the ones the run reports as rewritten. */
  rewritten: string[];
  /** One line per document left as it was, the plan that could not be built, or a write's notice, and why. */
  notes: string[];
}

/**
 * The hooks documents this setup wrote that `clean --pack <id>` re-renders
 * without the pack ({@link rewriteHookDocuments}): none when the pack ships no
 * hooks (no ledger row of its under its `hooks/` folder), since no document
 * runs a hook of its then.
 */
function hookDocumentsOf(
  manifest: SetupManifest,
  packSupply: readonly PackSuppliedServer[],
  packId: string,
  candidates: readonly ReclaimCandidate[],
): string[] {
  const hooksDir = `${packDirRelPath(packId)}/hooks/`;
  if (!candidates.some((candidate) => candidate.entry.path.startsWith(hooksDir))) return [];
  return [...hookScriptRetention(manifest, packSupply).hookDocuments].filter((path) => manifest.ledger.some((row) => row.path === path));
}

/**
 * Why `clean --pack` leaves `documents` for the next `sync`, or `null` when it
 * rewrites them: the documents name the scripts and the pinned version of the
 * CLI that renders them, and `clean` writes no script, so under a CLI other
 * than the one that last wrote the setup (`generatedBy`) a document could name
 * a script never written or drop a newer guard. The full and scoped cleans'
 * own refusal of other renderings is {@link refuseStaleRenderings}.
 */
function hookRewriteHold(
  manifest: SetupManifest,
  documents: readonly string[],
  hookDocuments: ReadonlySet<string>,
  engineVersion: string,
): string | null {
  if (documents.length === 0 || manifest.generatedBy === engineVersion) return null;
  return (
    `This is version ${engineVersion}, but version ${manifest.generatedBy} last wrote this setup, so ` +
    `${documents.join(", ")} were not rewritten and ${keptOf(documents, hookDocuments, "still run the pack's hooks")} until the next sync.`
  );
}

/**
 * What `documents` left as they are still hold: `hooksOnly` when every one is
 * a hooks document, else the plain sentence for a set that also holds a
 * document naming the pack's agents or rules ({@link PackCopies.rerendered}).
 */
function keptOf(documents: readonly string[], hookDocuments: ReadonlySet<string>, hooksOnly: string): string {
  return documents.every((path) => hookDocuments.has(path)) ? hooksOnly : "still carry what the pack added to them";
}

/**
 * Rewrite every hooks document the setup wrote from the setup without the pack
 * being removed (inbox `pass/1`, REQ-FLOW-027), before the sweep, so no client
 * still runs the pack's hooks once the run ends, and the sweep's script keep no
 * longer holds them. `shrunk` is the rendering manifest with the pack's rows and its
 * selected servers taken out; it is planned the way `sync` plans
 * ({@link cleanPlanner}, full-corpus selection, fresh detection). Each document
 * goes through the lane `init` writes it with: a co-owned one through its
 * lane's `materialize`, under the ownership the current ledger records, so the
 * owner's entries stay; Copilot's whole-file hooks document through the
 * merge engine with `outputWriteOptions`, whose drift rule backs up an edited
 * one. A plan that cannot be built rewrites nothing and says so: the documents
 * then wait for `sync`, as before. So does a setup whose `autonomy` is looser
 * than the guard in force: the settings document's ask rows are rendered from
 * it, and the loosen gate `sync` runs refuses it here too (REQ-FLOW-138), so a
 * recorded ask row never leaves without the person's `--loosen`.
 * `documents` also holds the documents that name the pack's agents or rules
 * ({@link PackCopies.rerendered}), so Cursor's spawn guard stops admitting the
 * pack's agents in the same run (build/40); `hookDocuments` tells the notes
 * which of them run hooks.
 */
async function rewriteHookDocuments(
  rootDir: string,
  manifest: SetupManifest,
  shrunk: SetupManifest,
  documents: readonly string[],
  hookDocuments: ReadonlySet<string>,
  packSupply: readonly PackSuppliedServer[],
  engineVersion: string,
): Promise<HookDocumentRewrite> {
  const rewrite: HookDocumentRewrite = { rows: new Map(), rewritten: [], notes: [] };
  if (documents.length === 0) return rewrite;
  let outputs: readonly AdapterOutput[];
  try {
    const [index, repoInfo] = await Promise.all([buildContentIndex(), analyzeRepo(rootDir)]);
    const setup = { ...structuredClone(shrunk), selection: fullCorpusSelection(index), detected: summarizeDetection(repoInfo) };
    outputs = await withoutPolicyWarningPrint(() =>
      cleanPlanner(rootDir, engineVersion)(setup, { monorepoPackages: repoInfo.monorepoPackages }),
    );
  } catch (cause) {
    const why = (cause instanceof Error ? cause.message : String(cause)).split("\n")[0] ?? "";
    rewrite.notes.push(`The setup could not be planned without the pack (${why}), so ${documents.join(", ")} ${keptOf(documents, hookDocuments, "still run its hooks")} until the next sync.`);
    return rewrite;
  }
  const guardCopies = outputs.filter((output) => output.path.split("/").at(-1) === PERSON_ONLY_GUARD_FILE).map((output) => output.path);
  try {
    await assertNotLoosened(rootDir, resolveAutonomy(shrunk), {
      loosen: false,
      copies: { planned: guardCopies, baking: [] },
      remedy: packageCommand("sync --loosen"),
    });
  } catch (cause) {
    const failure = cause as { message?: unknown; why?: unknown; next?: unknown };
    const said = [failure.message, failure.why, failure.next].filter((part): part is string => typeof part === "string" && part !== "");
    rewrite.notes.push(
      `${documents.join(", ")} were not rewritten, so they ${keptOf(documents, hookDocuments, "still run the pack's hooks")}: ${said.join("; ")}. ` +
        `Put back the stricter autonomy setting in ${STATE_DIR}/${MANIFEST_FILE}, or have the person loosen it, then sync.`,
    );
    return rewrite;
  }
  const lanes = coOwnedDocumentLanes(shrunk, packSupply, manifest.ledger, await provenLegacyCursorGuards(rootDir, manifest.ledger, legacyCursorIdentity()));
  const ledgerHashes = ledgerHashIndex(rootDir, manifest.ledger);
  const ledgerPaths = ledgerPathSet(rootDir, manifest.ledger.map((row) => row.path));
  for (const path of documents) {
    const output = outputs.find((candidate) => candidate.path === path);
    if (output === undefined) continue;
    const target = join(rootDir, ...path.split("/"));
    const lane = lanes.get(path);
    const managedBody = extractManagedBlock(output.content, target);
    let written: { result: MergeResult; content: string | null; record?: CoOwnership };
    try {
      if (lane === undefined) {
        // oxlint-disable-next-line no-await-in-loop -- one write per document, each its own file
        const result = await safeWriteFile(target, output.content, outputWriteOptions(managedBody, engineVersion, false, rootDir, ledgerPaths, ledgerHashes));
        written = { result, content: null };
      } else {
        const ownership = coOwnedOwnershipOf(manifest.ledger, path, { boundaryDir: rootDir, ledgerHashes });
        // oxlint-disable-next-line no-await-in-loop
        const { writtenContent, writtenRecord, ...result } = await lane.materialize(target, output.content, ownership);
        written = { result, content: writtenContent, ...(writtenRecord === null ? {} : { record: writtenRecord }) };
      }
    } catch (cause) {
      const kept = hookDocuments.has(path) ? "still runs the pack's hooks" : "still carries what the pack added to it";
      rewrite.notes.push(`${path} was not rewritten (${cause instanceof Error ? cause.message : String(cause)}), so it ${kept} until the next sync.`);
      continue;
    }
    if (written.result.warning !== undefined) rewrite.notes.push(written.result.warning);
    if (written.result.notice !== undefined && written.result.notice !== "") rewrite.notes.push(written.result.notice);
    if (written.result.action === "skipped") continue;
    if (written.result.action !== "unchanged") rewrite.rewritten.push(path);
    rewrite.rows.set(path, toLedgerEntries(ledgerRowsForOutput(output, written.content, managedBody, engineVersion, written.record)));
  }
  return rewrite;
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
 * The pack's projected copies leave with it ({@link findPackCopies}), and so do
 * their rows, a kept copy's included — except a copy the proof could not judge
 * because the pack could not be planned, which keeps its row (review/61).
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
  rendered: SetupManifest,
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
  // Planned while the pack is still installed and before anything is written:
  // the pack's own content is what proves its copies (REQ-PLUGIN-046).
  const copies = await findPackCopies(rootDir, rendered, packId, candidates, ctx.app.version);
  const alsoCopies =
    copies.rows.size === 0 ? "" : `, its ${copies.rows.size} client copy(ies)`;
  const swept = [...candidates, ...copies.candidates];
  const sweepOptions = {
    rootDir,
    trustedExactPaths: trustedInfraPaths(manifest.ledger),
    coOwnedPaths: coOwnedReclaimReducers(manifest, packSupply, await coOwnedReclaimRenderings(rootDir, manifest)),
    ...hookScriptRetention(manifest, packSupply),
    // Rendered while the pack is still installed, so the pack's own content
    // still proves itself and its copies (REQ-PLUGIN-046).
    ...copies.proof,
    syncRenderings: await syncRenderingsFor(
      rootDir,
      rendered,
      copies.candidates.map((candidate) => candidate.entry.path),
      cleanPlanner(rootDir, ctx.app.version),
    ),
  };
  // Before the confirmation and before the client documents are touched: a
  // copy a sync with this version rewrites refuses the run (review/128).
  refuseStaleRenderings(ctx, manifest, await sweepReclaimCandidates(swept, { ...sweepOptions, consent: false }), `clean --pack ${packId}`);
  // The documents this run re-renders without the pack — the hooks documents, then the ones naming
  // its agents or rules — and why it leaves them for `sync` instead.
  const hookDocuments = hookDocumentsOf(manifest, packSupply, packId, candidates);
  const hookSet = new Set(hookDocuments);
  const documents = [...hookDocuments, ...copies.rerendered.filter((path) => !hookSet.has(path))];
  const hookHold = hookRewriteHold(manifest, documents, hookSet, ctx.app.version);

  // --dry-run neither prompts nor refuses: it writes nothing, so the
  // destructive gate has nothing to gate.
  if (!ctx.dryRun) {
    const alsoMcp =
      selectedFromPack.length === 0
        ? ""
        : `, plus its selected MCP server(s) (${selectedFromPack.join(", ")}) in the client config files`;
    const alsoHooks =
      documents.length === 0 || hookHold !== null
        ? ""
        : `, and rewrite ${documents.join(", ")} without ${documents.every((path) => hookSet.has(path)) ? "its hooks" : "what it added"} (an edited one is kept as a .bak)`;
    await confirmDestruction(ctx, {
      refusedWhat: `pack "${packId}" (${candidates.length} installed file(s)${alsoCopies})`,
      question: `Remove pack "${packId}" — ${candidates.length} installed file(s) under ${STATE_DIR}/${alsoCopies}, plus its ledger rows${alsoMcp}${alsoHooks}?`,
    });
  }

  ctx.spinner.start(
    ctx.dryRun
      ? `Inspecting ${swept.length} path(s) of pack "${packId}"...`
      : `Removing ${swept.length} path(s) of pack "${packId}"...`,
  );
  // Documents first: while the pack is still installed, a failure here leaves a
  // repo the next `sync` re-emits into, rather than one holding an entry nobody
  // can prove and a selection nobody can resolve.
  const mcp = await removePackMcpEntries(rootDir, manifest, packId, packSupply, !ctx.dryRun);
  // The hooks documents next, from the setup without the pack, so the sweep below
  // finds no document still running the pack's hooks (inbox `pass/1`).
  const owner = packOwner(packId);
  const shrunk: SetupManifest = {
    ...rendered,
    ledger: rendered.ledger.filter((entry) => entry.adapter !== owner),
    ...(rendered.mcp === undefined
      ? {}
      : { mcp: { ...rendered.mcp, servers: rendered.mcp.servers.filter((id) => !selectedFromPack.includes(id)) } }),
  };
  const hooks: HookDocumentRewrite | null = ctx.dryRun
    ? null
    : hookHold !== null
      ? { rows: new Map(), rewritten: [], notes: [hookHold] }
      : await rewriteHookDocuments(
          rootDir,
          manifest,
          shrunk,
          documents,
          hookSet,
          packSupply.filter((server) => server.sourcePackId !== packId),
          ctx.app.version,
        );
  const report = await sweepReclaimCandidates(swept, { ...sweepOptions, consent: !ctx.dryRun });
  ctx.spinner.stop();

  // Copies the proof could not judge (the pack could not be planned): unproven
  // is not disproven, so each keeps its row for the next sync (review/61).
  const unproven = new Set(report.entries.filter((entry) => entry.unproven === true).map((entry) => entry.path));
  const droppedCopies = [...copies.rows].filter((row) => !unproven.has(row.path));

  let removedRows = 0;
  if (!ctx.dryRun) {
    // A judged copy's row leaves with the pack's rows, kept file or not: no
    // rendering will prove it once the pack is gone, so the kept file is the
    // owner's.
    const dropped = new Set(droppedCopies);
    const kept = manifest.ledger
      .filter((entry) => entry.adapter !== owner && !dropped.has(entry))
      .map((entry) => rehashRewritten(entry, mcp.rewritten));
    removedRows = manifest.ledger.length - kept.length;
    // A rewritten hooks document's client rows give way to the rows its write earns, in place.
    const placed = new Set<string>();
    const ledger = kept.flatMap((entry) => {
      const rows = hooks?.rows.get(entry.path);
      if (rows === undefined || !(TOOLS as readonly string[]).includes(entry.adapter)) return [entry];
      if (placed.has(entry.path)) return [];
      placed.add(entry.path);
      return rows;
    });
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
    // A 1.15.0 manifest's saved model lists move to the cache first, as `sync`
    // moves them: the write leaves `models.listed` out (REQ-LADDER-009).
    for (const warning of await keepSavedModelLists(rootDir)) ctx.io.err(`warning: ${warning}\n`);
    await writeManifest(
      rootDir,
      { ...manifest, ledger, ...(mcpConfig === undefined ? {} : { mcp: mcpConfig }) },
      { now: ctx.app.runtime.clock.now() },
    );
  }

  const formatted = formatReclaimReport(report);
  if (formatted !== "") ctx.io.out(`${formatted}\n`);

  // Files still on disk after the sweep (edited bytes, a refused unlink) are
  // salvage: their rows are gone, so nothing will ever reclaim them. An
  // unproven copy is not: its row stays.
  const salvaged = report.entries.filter(
    (entry) =>
      (entry.action === "skipped-user-content" || entry.action === "skipped-unsafe-path") && entry.unproven !== true,
  ).length;
  const copyPaths = new Set(copies.candidates.map((candidate) => candidate.entry.path));
  const keptCopies = report.entries
    .filter((entry) => copyPaths.has(entry.path) && entry.action.startsWith("skipped"))
    .map((entry) => entry.path);

  if (ctx.dryRun) {
    const copySentence =
      (droppedCopies.length === 0 ? "" : ` and the rows of its ${droppedCopies.length} client copy(ies)`) +
      (unproven.size === 0 ? "" : `, keeping the rows of the ${unproven.size} copy(ies) it could not judge`);
    ctx.io.out(
      `Dry run: nothing was written and the manifest still records the pack. ` +
        `A real run also drops its ${candidates.length} ledger row(s)${copySentence}` +
        `${mcpSentence(mcp)} and leaves the rest of ${STATE_DIR}/ intact.\n`,
    );
    if (hookHold !== null) ctx.io.out(`${hookHold}\n`);
    else if (documents.length > 0) {
      const none = documents.every((path) => hookSet.has(path)) ? "none still runs its hooks" : "none still carries what it added";
      ctx.io.out(`A real run also rewrites ${documents.join(", ")} from the setup without the pack, so ${none}.\n`);
    }
    nextSteps(ctx, [`apply it: ${packageCommand(`clean --pack ${packId}`)}`]);
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
    if (hooks !== null && hooks.rewritten.length > 0) {
      ctx.io.out(`Rewrote ${hooks.rewritten.join(", ")} without the pack's ${hooks.rewritten.every((path) => hookSet.has(path)) ? "hooks" : "content"}.\n`);
    }
    for (const note of hooks?.notes ?? []) ctx.io.out(`${note}\n`);
    if (salvaged > 0) {
      ctx.io.out(
        `${salvaged} kept file(s) are user-owned now — their ledger rows are dropped, so no clean or sync will touch them again.\n`,
      );
    }
    if (copies.unplanned !== null && copies.rows.size > 0) {
      // Only an unjudged copy keeps its row; a judged one (edited, or hashless) is salvage above.
      const unjudged = [...copies.rows].filter((row) => unproven.has(row.path)).length;
      ctx.io.out(
        `Pack "${packId}" could not be planned as installed (${copies.unplanned}), so none of its ` +
          `${copies.rows.size} client copy(ies) can be proven the engine's: each is kept and named above. ` +
          `${unjudged} of them, unedited since their recorded hash, keep their ledger rows; a copy you ` +
          `edited, or one whose row records no content hash, loses its row and is yours now.\n`,
      );
    }
    if (copies.unexamined !== null) {
      ctx.io.out(
        `The setup could not be planned without pack "${packId}" (${copies.unexamined}), so its client ` +
          `copies were not looked for: their rows stay.\n`,
      );
    }
    nextSteps(ctx, [
      ...(keptCopies.length === 0
        ? []
        : [`delete by hand each client copy kept above, unless it is yours: ${keptCopies.join(", ")}`]),
      `regenerate the clients' files without the pack: ${packageCommand("sync")}`,
    ]);
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
      hookDocumentsRewritten: (hooks?.rewritten ?? []).filter((path) => hookSet.has(path)),
      // Every document rewritten without the pack: the hooks documents and those naming its agents or rules.
      documentsRewritten: hooks?.rewritten ?? [],
    },
  };
}

// ── Command ────────────────────────────────────────────────────

export const cleanCommand: CommandModule = {
  name: "clean",
  summary: `remove every generated file and the setup's own state, keeping yours under ${STATE_DIR}/`,
  mutating: true,

  configure(cmd) {
    cmd.option(
      "--pack <id>",
      "remove one installed pack — its files and ledger rows — and keep everything else",
    );
    cmd.option(
      "--purge",
      `also delete the whole ${STATE_DIR}/ directory: learnings, handoffs, overrides, installed packs and run records`,
    );
  },

  async run(ctx, opts): Promise<CommandResult> {
    const rootDir = ctx.app.runtime.cwd;
    const packId = typeof opts["pack"] === "string" ? opts["pack"] : undefined;
    const purge = opts["purge"] === true;
    // Refused before anything is read or written: the two scopes contradict each other.
    if (purge && packId !== undefined) {
      throw new CliFailure({
        code: "VALIDATION_ERROR",
        message: "--purge deletes the whole state directory and cannot be combined with --pack",
        why: `--pack removes one installed pack and keeps everything else, ${STATE_DIR}/ included`,
        next: `run ${packageCommand(`clean --pack ${packId}`)} to remove that pack, or ${packageCommand("clean --purge")} to remove everything`,
      });
    }

    // A corrupt manifest surfaces the engine's own CONFIG_ERROR untouched: its
    // message already names every defect and offers delete-and-reinitialise,
    // which is the better repair path than anything this command could add.
    const manifest = await readManifest(rootDir);
    if (manifest === null) return await nothingToClean(ctx, rootDir, purge);
    const rendered = await renderingManifest(rootDir, manifest);

    if (packId !== undefined) return await runScopedClean(ctx, rootDir, manifest, packId, rendered);

    const candidates = planCleanCandidates(manifest, { purge });
    // The packs this run leaves installed, by the ledger that recorded them (REQ-FLOW-028).
    const packsKept = purge ? [] : installedPackIds(manifest);

    // Read-only, so it runs ahead of the confirmation: the preview sweep below
    // needs it, and so does the live one.
    const packSupply = await installedPackMcpSupply(rootDir, manifest);
    const sweepOptions = {
      rootDir,
      trustedExactPaths: trustedInfraPaths(manifest.ledger),
      // No deselection step here, and none is owed: the full clean sweeps the
      // client documents themselves, and it resolves pack supply BEFORE the
      // sweep, so the reducer can still prove a pack-supplied entry. The
      // selection goes with the state directory a few lines below.
      // An entry running a 1.11.0 guard name is the engine's only while that guard is proven (row 585).
      coOwnedPaths: coOwnedReclaimReducers(
        manifest,
        packSupply,
        await coOwnedReclaimRenderings(rootDir, manifest),
        await provenLegacyCursorGuards(rootDir, manifest.ledger, legacyCursorIdentity()),
      ),
      ...hookScriptRetention(manifest, packSupply),
      ...(await cleanRenderings(rootDir, rendered, candidates, ctx.app.version)),
      // The ledger goes below with the manifest: a file the proof could not judge
      // is named for a delete by hand, never promised a retry (review/87).
      setupRemoved: true,
    };
    // Gates 1-4 with nothing written, before the confirmation: a file a sync
    // with this version rewrites refuses the run, `--dry-run` included (review/128).
    ctx.spinner.start(`Inspecting ${candidates.length} recorded path(s)...`);
    const preview = await sweepReclaimCandidates(candidates, { ...sweepOptions, consent: false });
    ctx.spinner.stop();
    refuseStaleRenderings(ctx, manifest, preview, purge ? "clean -y --purge" : "clean -y");

    // --dry-run neither prompts nor refuses: it writes nothing, so the
    // destructive gate has nothing to gate.
    if (!ctx.dryRun) {
      await confirmDestruction(
        ctx,
        purge
          ? {
              refusedWhat: `${candidates.length} generated file(s) and ${STATE_DIR}/`,
              question: `Remove ${candidates.length} generated file(s) and the ${STATE_DIR}/ state directory (learnings, handoffs and installed packs included)?`,
            }
          : {
              refusedWhat: `${candidates.length} generated file(s)`,
              question:
                `Remove ${candidates.length} generated file(s) and the setup's own files under ${STATE_DIR}/? ` +
                `Learnings, handoffs, overrides, run records and installed packs under ${STATE_DIR}/ stay; ` +
                `to delete them too, run ${packageCommand("clean --purge")} instead of this run.`,
            },
      );
    }

    let report = preview;
    if (!ctx.dryRun) {
      ctx.spinner.start(`Removing ${candidates.length} recorded path(s)...`);
      report = await sweepReclaimCandidates(candidates, { ...sweepOptions, consent: true });
      ctx.spinner.stop();
    }
    // After the sweep took the engine's file from each path a `replace` import
    // wrote over: the owner's file comes back from its recorded backup (REQ-FLOW-027).
    const backups = recordedBackups(manifest);
    const restore = ctx.dryRun || backups.length === 0 ? null : await restoreImportBackups(rootDir, manifest);

    // A hooks document the sweep left in place that still runs a hook script
    // under the state directory holds that script back, since deleting it would
    // leave the hook pointing at nothing (S17, `../../merge/reclaim.ts::hookDocumentsLeftInPlace`).
    // A document that runs only scripts elsewhere (Cursor's guards) keeps those
    // alone. A held copy under Claude Code's hook folder (`OWNED_PATHS.hookRoots`)
    // keeps the ledger too: it is the only record a re-run can remove that copy
    // by (review/159). `--purge` then keeps the whole directory; the default
    // scope keeps the manifest beside the held scripts, so the re-run reads the
    // ledger and takes back the ignore lines (review/29).
    const underStateDir = (path: string): boolean => path.startsWith(`${STATE_DIR}/`);
    const underHookRoot = (path: string): boolean => OWNED_PATHS.hookRoots.some((root) => path.startsWith(root));
    const keepsState = (path: string): boolean => underStateDir(path) || underHookRoot(path);
    const wiringKept = (report.wiringKept ?? []).filter((doc) => doc.scripts.some(keepsState));
    const stateDirKept = [...new Set(wiringKept.flatMap((doc) => doc.scripts.filter(keepsState)))];
    // The machine-local files, the review gate's state and the placeholders, in
    // that order, then the empty folders (REQ-FLOW-028); live runs only. The
    // manifest goes last, after the ignore lines below (review/58).
    const state = ctx.dryRun || purge ? null : await removeSetupState(rootDir);
    const purgeRemoved = !ctx.dryRun && purge && stateDirKept.length === 0 && (await removeStateDir(rootDir));

    const formatted = formatReclaimReport(report);
    if (formatted !== "") ctx.io.out(`${formatted}\n`);
    for (const doc of wiringKept) {
      ctx.io.out(
        doc.unreadable === true
          ? `Kept ${STATE_DIR}/: ${doc.path} could not be read (a link, a hard link, or a file it cannot open), so ` +
              `nothing proves it no longer runs a hook script under it. Replace it with a regular file (or delete it), ` +
              `then re-run stamity clean.\n`
          : doc.scripts.some(underStateDir)
            ? `Kept ${STATE_DIR}/: ${doc.path} still runs a hook script under it, so deleting it would leave that hook ` +
                `pointing at nothing. Remove that wiring, then re-run stamity clean.\n`
            : `Kept ${STATE_DIR}/: ${doc.path} still runs the engine's hook scripts under ` +
                `${OWNED_PATHS.hookRoots.filter((root) => doc.scripts.some((script) => script.startsWith(root))).join(", ")}, ` +
                `and the ledger in ${STATE_DIR}/ is what lets a re-run remove them. Remove that wiring, then re-run stamity clean.\n`,
      );
    }

    // The ignore lines last, so the lane reads which ignored files are gone; after the
    // sweep's report, so a refusal here still leaves what was removed on the screen.
    // Not while a hook still runs from the state directory: it can write the files
    // those lines ignore (review/29), and the re-run, which still has the manifest, takes them back.
    const gitignoreHeld = stateDirKept.length > 0;
    let gitignore: GitignoreReconcile | null = null;
    let refused: CliFailure | null = null;
    try {
      gitignore = ctx.dryRun || gitignoreHeld ? null : await takeBackGitignoreLines(rootDir, manifest);
    } catch (cause) {
      if (!(cause instanceof CliFailure)) throw cause;
      refused = cause;
    }
    // The manifest last of all, unless a hook still runs from the state directory: an error
    // before this line leaves the ledger a re-run finishes from (review/58, review/61). The
    // take-back's own refusal still ends the clean here: it names the lines to delete by
    // hand, and a re-run would only meet the same refusal.
    if (state !== null && !gitignoreHeld) await removeSetupManifest(rootDir, state);
    if (refused !== null) throw refused;
    const stateDirRemoved = ctx.dryRun ? false : purge ? purgeRemoved : !(await exists(join(rootDir, STATE_DIR)));
    // What is left directly under the state directory, less each name clean left on purpose, which `left` names (review/59).
    const leftNames = new Set((state?.left ?? []).map(({ path }) => path.slice(STATE_DIR.length + 1).split("/")[0]));
    const kept = ctx.dryRun || purge ? [] : (await keptStateEntries(rootDir)).filter((entry) => !leftNames.has(entry.replace(/\/$/, "")));

    if (ctx.dryRun) {
      // The take-back reads which ignored files are gone after the run, so the
      // preview names the recorded lines and the rule, not a verdict per line.
      const recorded = (gitignoreRecordOf(manifest.ledger)?.lines ?? []).filter((line) => !GITIGNORE_LINES_KEPT_ONCE_WRITTEN.includes(line));
      ctx.io.out(
        purge
          ? `Dry run: nothing was written and ${STATE_DIR}/ is untouched. A real run also deletes ${STATE_DIR}/ and everything in it.\n`
          : `Dry run: nothing was written and ${STATE_DIR}/ is untouched. A real run also removes the setup's own files ` +
              `under ${STATE_DIR}/ (the manifest, the review gate's state and the machine-local files) and keeps the rest: ` +
              `learnings, handoffs, overrides, run records and installed packs. To delete those too, run ` +
              `${packageCommand("clean --purge")} instead of this run.\n`,
      );
      if (recorded.length > 0) {
        ctx.io.out(
          `A real run also takes back the ${GITIGNORE_FILE} line(s) this setup added, each once the file it ignores ` +
            `is gone: ${recorded.join(", ")}.\n`,
        );
      }
      if (backups.length > 0) {
        ctx.io.out(
          `A real run also moves back each backup init recorded of your file, once the engine's file is gone and the ` +
            `backup still hashes to what init recorded: ${backups.map(({ path, backup }) => `${backup.path} -> ${path}`).join(", ")}.\n`,
        );
      }
      nextSteps(ctx, [`apply it: stamity clean${purge ? " --purge" : ""}`]);
    } else {
      ctx.io.out(
        `${ctx.palette.green("Clean complete")} — ${report.deletedCount} file(s) deleted, ` +
          `${report.strippedCount} rewritten to keep user content, ${report.skippedCount} skipped` +
          `${stateDirRemoved ? `, ${STATE_DIR}/ removed` : ""}.\n`,
      );
      for (const line of keptStateLines(kept, packsKept, state, gitignoreHeld)) ctx.io.out(`${line}\n`);
      ctx.io.out(`${gitignoreOutcomeLine(gitignore, gitignoreHeld)}\n`);
      for (const line of restore === null ? [] : restoreLines(restore)) ctx.io.out(`${line}\n`);
      nextSteps(ctx, [REINIT_OFFER]);
    }

    return {
      exitCode: 0,
      json: {
        removed: report.deletedCount,
        stripped: report.strippedCount,
        skipped: report.skippedCount,
        stateDirRemoved,
        purge,
        // What is left directly under the state directory, folders ending in `/` (REQ-FLOW-028).
        kept,
        // Each name the default scope left on purpose (a link, or not the kind of file it wrote), and why; never in `kept` (review/59).
        left: state?.left ?? [],
        packsKept,
        // The held-back scripts that kept the state directory, when any did (S17).
        ...(stateDirKept.length > 0 ? { stateDirKept } : {}),
        // The recorded `.gitignore` lines taken back, when any were (REQ-FLOW-016).
        ...(gitignore !== null && gitignore.removed.length > 0 ? { gitignoreRemoved: gitignore.removed } : {}),
        // The backups of `replace` imports moved back and left, when the setup recorded any (REQ-FLOW-027).
        ...(restore === null ? {} : { restored: restore.restored, restoreSkipped: restore.restoreSkipped }),
        entries: report.entries,
      },
    };
  },
};
