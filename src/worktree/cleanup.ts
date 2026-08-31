import { readdir, rm, rmdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { acquireWriteLock } from "../merge/atomicWrite.ts";
import { EngineError } from "../types/errors.ts";
import {
  isDirty,
  listWorktrees,
  pruneWorktrees,
  readDirtyCounts,
  readStashCount,
  removeWorktree,
  resolveGitCommonDir,
  resolveWorktreeGitDir,
  runGit,
  type WorktreeDirtyCounts,
  type WorktreeGitRunner,
  type WorktreeInventoryEntry,
} from "./git.ts";
import {
  classifyReceiptEntry,
  inspectEntryState,
  readWorktreeReceipt,
  type ReceiptEntryReason,
  type WorktreeReceipt,
  type WorktreeReceiptDroppedRow,
} from "./receipt.ts";
import { worktreeLockPath, type ConsentAnswer } from "./setup.ts";

/**
 * `stamity worktree cleanup`: the inversion of a receipt, and the inventory it
 * reads to find one.
 *
 * **The receipt is the only per-file teardown authority.** Cleanup inverts what
 * a readable receipt names and nothing else. A worktree inside the farm with no
 * readable receipt — absent, malformed, or of a version this build does not
 * read — is a MANAGED-ORPHAN: it is left alone unless `--force` is given, and
 * under `--force` it is removed as a WHOLE tree (`git worktree remove --force`),
 * because with no receipt there is nothing to scope a file-by-file inversion.
 * There is deliberately no pattern-replay fallback: replaying the patterns that
 * produced a set is what missed glob-expanded copies in the design this one
 * replaces, and what it missed included credential material. No receipt means no
 * per-file authority, so the choice is the whole tree or nothing — never a
 * guess at which files this lane placed.
 *
 * **The digest gate is what keeps inversion from becoming destruction.** A
 * copied file is removed only when its bytes are the bytes that were placed; a
 * diverged copy is KEPT and reported, because the one file this lane copies by
 * default is the one whose contents are irreplaceable if the operator edited
 * them. Under a full cleanup the directory goes anyway, so only `--files-only`
 * leaves anything behind, loudly.
 *
 * **A branch is never deleted.** Not here, not under `--force`. The report
 * names the `git branch -d` line the operator may run; a directory is
 * reconstructible from a ref and a ref is not reconstructible from a directory.
 *
 * **The stash is repo-global and says so.** It is one list for the whole clone
 * and belongs to no row, so it rides on the inventory RESULT rather than on any
 * worktree — a per-worktree column would print the same number on every row and
 * read as a per-worktree fact.
 */

/**
 * How one registered worktree relates to this lane.
 *
 * `managed-orphan` is a tree INSIDE the managed farm that carries no readable
 * receipt — absent (a partial setup whose receipt write failed), malformed, or
 * of a version this build does not read. It is distinct from `other`, which is a
 * worktree OUTSIDE the farm this lane never created. An orphan is cleanable
 * under `--force`: with no receipt to scope the removal, nothing can be inverted
 * file-by-file, so `git worktree remove --force` takes the whole tree.
 */
export type WorktreeClass = "managed" | "managed-orphan" | "other" | "locked" | "prunable";

/** One inventory row: git's facts plus this lane's reading of them. */
export interface WorktreeInventoryRow {
  readonly entry: WorktreeInventoryEntry;
  readonly classification: WorktreeClass;
  /** Why it is not `managed`, when it is not. */
  readonly reason: string | null;
  /** Present for a `managed` row. */
  readonly receipt: WorktreeReceipt | null;
  /**
   * Receipt rows the reader refused, by their index in the written document.
   * Carried rather than dropped: one malformed row must not cost the inversion
   * of the good ones, and a drop nobody reported is a file left behind with no
   * trace of why.
   */
  readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
  readonly gitDir: string | null;
  readonly dirty: WorktreeDirtyCounts | null;
}

/**
 * The inventory, and the one repo-global fact that hangs off it rather than off
 * a row (REQ-WORKTREE-014).
 */
export interface WorktreeInventory {
  readonly worktrees: readonly WorktreeInventoryRow[];
  /**
   * Stash entries for the WHOLE clone. Placed here, once, because a stash
   * belongs to no worktree — the signal that work is parked somewhere is real
   * and it is not a property of any row below it.
   */
  readonly stash: { readonly entries: number };
}

/** One receipt row's disposition, as the report carries it. */
export interface CleanupFileReport {
  readonly path: string;
  readonly outcome: "removed" | "kept" | "absent" | "failed";
  readonly reason: ReceiptEntryReason | "failed";
  readonly detail: string | null;
}

/** One worktree's cleanup outcome. */
export interface CleanupWorktreeReport {
  readonly path: string;
  readonly branch: string | null;
  readonly classification: WorktreeClass;
  readonly files: readonly CleanupFileReport[];
  readonly droppedRows: readonly WorktreeReceiptDroppedRow[];
  readonly removed: boolean;
  /** The command the operator may run to delete the branch. Never run here. */
  readonly branchCommand: string | null;
  /** Why this worktree was skipped, when it was. */
  readonly skipped: string | null;
}

/** What `cleanup` returns. */
export interface WorktreeCleanupResult {
  readonly status: "complete" | "partial";
  readonly worktrees: readonly CleanupWorktreeReport[];
  readonly pruned: number;
  readonly notices: readonly string[];
  readonly stash: { readonly entries: number };
}

/** Inputs to a cleanup run. */
export interface WorktreeCleanupOptions {
  readonly repoRoot: string;
  /** Resolved by the caller through `resolveFarmDir`, so one run resolves once. */
  readonly farmDir: string;
  /** Names to clean. Empty with `all: true` means every managed worktree. */
  readonly names?: readonly string[];
  readonly all?: boolean;
  /** Leave the checkout in place; invert the files only. */
  readonly filesOnly?: boolean;
  /** Consent for removing a dirty worktree and for the `--all` sweep. */
  readonly force?: ConsentAnswer;
  /** The process working directory, injected so the refusal is testable. */
  readonly cwd: string;
  readonly run?: WorktreeGitRunner;
  readonly rerun?: string;
}

function refuse(message: string, next: string): never {
  throw new EngineError(message, { code: "VALIDATION_ERROR", next });
}

/** True when `child` is `parent` or sits underneath it. */
function isInside(child: string, parent: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith("/"));
}

// ---------------------------------------------------------------------------
// The inventory (REQ-WORKTREE-007, REQ-WORKTREE-014)
// ---------------------------------------------------------------------------

/**
 * Reads every registered worktree and partitions it.
 *
 * The order of the partition is the order of the refusals: a locked or prunable
 * registration is that before it is anything else, because neither is a tree
 * this lane may take down — one the operator locked on purpose, and one whose
 * directory is already gone.
 */
export async function readWorktreeInventory(
  opts: {
    readonly repoRoot: string;
    readonly farmDir: string;
    readonly run?: WorktreeGitRunner;
  },
): Promise<WorktreeInventory> {
  const run = opts.run ?? runGit;
  const entries = await listWorktrees(run, opts.repoRoot);
  const rows: WorktreeInventoryRow[] = [];

  for (const entry of entries) {
    // oxlint-disable-next-line no-await-in-loop -- each row costs two git reads; fanning them out spawns one process per registered worktree
    rows.push(await classifyInventoryEntry(run, entry, opts.farmDir, opts.repoRoot));
  }

  return { worktrees: rows, stash: { entries: await readStashCount(run, opts.repoRoot) } };
}

async function classifyInventoryEntry(
  run: WorktreeGitRunner,
  entry: WorktreeInventoryEntry,
  farmDir: string,
  repoRoot: string,
): Promise<WorktreeInventoryRow> {
  const base = { entry, receipt: null, droppedRows: [], gitDir: null, dirty: null } as const;

  if (entry.prunable) {
    return {
      ...base,
      classification: "prunable",
      reason: entry.prunableReason ?? "the registration points at a directory that is gone",
    };
  }
  if (entry.locked) {
    return {
      ...base,
      classification: "locked",
      reason: entry.lockReason ?? "the worktree is locked",
    };
  }
  if (resolve(entry.path) === resolve(repoRoot) || !isInside(entry.path, farmDir)) {
    return {
      ...base,
      classification: "other",
      reason: `registered outside the farm at ${farmDir}`,
    };
  }

  const gitDir = await resolveWorktreeGitDir(run, entry.path);
  const read = await readWorktreeReceipt(gitDir);
  if (read.receipt === null) {
    // Inside the farm, but with no readable receipt to scope a teardown. This is
    // a managed-orphan: cleanable only as a whole tree under --force, because no
    // receipt means no way to tell an edited copy from a placed one.
    return {
      ...base,
      gitDir,
      classification: "managed-orphan",
      reason: read.unreadable,
      dirty: await readDirtyCounts(run, entry.path),
    };
  }
  return {
    entry,
    classification: "managed",
    reason: null,
    receipt: read.receipt,
    droppedRows: read.droppedRows,
    gitDir,
    dirty: await readDirtyCounts(run, entry.path),
  };
}

// ---------------------------------------------------------------------------
// The run (REQ-WORKTREE-007)
// ---------------------------------------------------------------------------

/** Inverts the receipts of the selected worktrees. */
export async function runWorktreeCleanup(
  opts: WorktreeCleanupOptions,
): Promise<WorktreeCleanupResult> {
  const run = opts.run ?? runGit;
  const names = opts.names ?? [];
  const all = opts.all === true;
  const rerun = opts.rerun ?? "stamity worktree cleanup";

  // REQ-WORKTREE-007 calls this a `USAGE` failure, and `USAGE` is a CLI-layer
  // code (`src/cli/kit/output.ts`) that the engine cannot spell without
  // importing the CLI. So the engine classifies it as far as its own vocabulary
  // reaches and the verb re-raises it as `CliFailure { code: "USAGE" }`, the
  // shape `config get` with no key already has. Both spellings name both.
  if (names.length === 0 && !all) {
    throw new EngineError(
      "cleanup needs a name, or --all to sweep every worktree this lane manages.",
      {
        code: "VALIDATION_ERROR",
        next: `Run \`${rerun} <name>\`, or \`${rerun} --all\`.`,
      },
    );
  }

  const inventory = await readWorktreeInventory({ ...opts, run });
  const candidates = selectCandidates(inventory, opts.farmDir, names, all);

  // Before anything is removed: a process standing inside a candidate would
  // have its own working directory pulled out from under it, and git's removal
  // would half-succeed. The refusal names the directory to run from.
  for (const row of candidates) {
    if (!isInside(opts.cwd, row.entry.path)) continue;
    refuse(
      `The current directory ${opts.cwd} is inside ${row.entry.path}, which this run would remove.`,
      `Run the command from ${opts.repoRoot} instead.`,
    );
  }

  if (all && opts.force !== "granted" && candidates.length > 0) {
    refuse(
      `\`--all\` would take down ${candidates.length} worktree${candidates.length === 1 ? "" : "s"}, and this run cannot ask.`,
      `Re-run with the decision made: ${rerunWith(rerun, "--all", "-y")}`,
    );
  }

  const notices: string[] = [];
  const reports: CleanupWorktreeReport[] = [];
  const commonDir = await resolveGitCommonDir(run, opts.repoRoot);

  for (const row of candidates) {
    // oxlint-disable-next-line no-await-in-loop -- one name lock at a time; holding several at once is the repo-wide lock this design refuses
    reports.push(await cleanOne(row, opts, run, commonDir, rerun));
  }

  for (const row of inventory.worktrees) {
    if (candidates.includes(row) || isCleanable(row)) continue;
    if (row.classification === "prunable") continue;
    if (resolve(row.entry.path) === resolve(opts.repoRoot)) continue;
    reports.push(skippedReport(row));
  }

  // A managed-orphan removed under --force went as a WHOLE tree, because no
  // receipt scoped the removal to individual files. The report says exactly that.
  for (const report of reports) {
    if (report.classification === "managed-orphan" && report.removed) {
      notices.push(
        `${report.path}: removed the whole tree with --force — it carried no readable receipt, so ` +
          `nothing scoped the removal to individual files.`,
      );
    }
  }

  const prunable = inventory.worktrees.filter((row) => row.classification === "prunable");
  if (prunable.length > 0) await pruneWorktrees(run, opts.repoRoot);

  if (inventory.stash.entries > 0) {
    notices.push(
      `This clone has ${inventory.stash.entries} stash ` +
        `${inventory.stash.entries === 1 ? "entry" : "entries"}. A stash is one list for the whole ` +
        `clone and belongs to no worktree, so nothing here removed or moved it.`,
    );
  }

  const failed = reports.some((report) => report.files.some((file) => file.outcome === "failed"));
  return {
    status: failed ? "partial" : "complete",
    worktrees: reports,
    pruned: prunable.length,
    notices,
    stash: inventory.stash,
  };
}

function isCleanable(row: WorktreeInventoryRow): boolean {
  return row.classification === "managed" || row.classification === "managed-orphan";
}

function selectCandidates(
  inventory: WorktreeInventory,
  farmDir: string,
  names: readonly string[],
  all: boolean,
): WorktreeInventoryRow[] {
  // Managed AND managed-orphan are both cleanable: the orphan only as a whole
  // tree under --force, which `invertOne` enforces.
  const cleanable = inventory.worktrees.filter(isCleanable);
  if (all) return cleanable;
  const wanted = new Set(names.map((name) => resolve(farmDir, name)));
  return cleanable.filter((row) => wanted.has(resolve(row.entry.path)));
}

function skippedReport(row: WorktreeInventoryRow): CleanupWorktreeReport {
  return {
    path: row.entry.path,
    branch: row.entry.branch,
    classification: row.classification,
    files: [],
    droppedRows: row.droppedRows,
    removed: false,
    branchCommand: null,
    skipped: row.reason ?? "not managed by this lane",
  };
}

async function cleanOne(
  row: WorktreeInventoryRow,
  opts: WorktreeCleanupOptions,
  run: WorktreeGitRunner,
  commonDir: string,
  rerun: string,
): Promise<CleanupWorktreeReport> {
  const name = relative(resolve(opts.farmDir), resolve(row.entry.path)).split(sep).join("/");
  const release = await acquireWriteLock(worktreeLockPath(commonDir, name), commonDir);
  try {
    return await invertOne(row, name, opts, run, rerun);
  } finally {
    await release();
  }
}

/**
 * Rebuilds a rerun line, appending only the tokens not already in it. The CLI's
 * `rerunLine` already carries the name and the flags the operator typed, so a
 * bare `${rerun} ${name} --force` would double them ("cleanup feat feat
 * --force"). When the engine is called directly with the default base line
 * (no name), the missing name and flag ARE appended.
 */
function rerunWith(rerun: string, ...tokens: readonly string[]): string {
  const present = new Set(rerun.split(/\s+/).filter((token) => token !== ""));
  const missing = tokens.filter((token) => !present.has(token));
  return missing.length === 0 ? rerun : `${rerun} ${missing.join(" ")}`;
}

/** The report for a managed-orphan removed as a whole tree under --force. */
function orphanRemovedReport(row: WorktreeInventoryRow): CleanupWorktreeReport {
  const branch = row.entry.branch;
  return {
    path: row.entry.path,
    branch: branch === "" ? null : branch,
    classification: row.classification,
    files: [],
    droppedRows: row.droppedRows,
    removed: true,
    // Named, never run. Invariant 4: a branch is never deleted by this lane.
    branchCommand: branch !== null && branch !== "" ? `git branch -d ${branch}` : null,
    skipped: null,
  };
}

/**
 * Inverts a managed-orphan: a farm tree with no readable receipt. There is
 * nothing to invert file-by-file, so `--files-only` leaves it standing and
 * reports why; otherwise the WHOLE tree is removed under --force, and without
 * consent the run refuses BEFORE touching anything, naming the flag.
 */
async function invertOrphan(
  row: WorktreeInventoryRow,
  name: string,
  opts: WorktreeCleanupOptions,
  run: WorktreeGitRunner,
  rerun: string,
): Promise<CleanupWorktreeReport> {
  if (opts.filesOnly === true) return skippedReport(row);
  if (opts.force !== "granted") {
    refuse(
      `${row.entry.path} sits inside the farm but carries no readable receipt, so this run cannot ` +
        `verify what it placed. Removing it takes the WHOLE tree and needs --force.`,
      `Re-run with the decision made: ${rerunWith(rerun, name, "--force")}`,
    );
  }
  // Force also covers any dirtiness: with no receipt there is no placed-versus-
  // edited distinction to protect, and the operator has asked for the tree.
  await removeWorktree(run, opts.repoRoot, row.entry.path, true);
  return orphanRemovedReport(row);
}

async function invertOne(
  row: WorktreeInventoryRow,
  name: string,
  opts: WorktreeCleanupOptions,
  run: WorktreeGitRunner,
  rerun: string,
): Promise<CleanupWorktreeReport> {
  const receipt = row.receipt;
  if (receipt === null) return await invertOrphan(row, name, opts, run, rerun);

  const dirty = row.dirty !== null && isDirty(row.dirty);
  // The refusal is resolved BEFORE a single file is removed: a cleanup that is
  // going to refuse a dirty tree must mutate NOTHING. Previously the receipt was
  // inverted first, so a refused dirty cleanup had already deleted the copied
  // credential it was refusing to remove.
  if (opts.filesOnly !== true && dirty && opts.force !== "granted") {
    refuse(
      `${row.entry.path} carries uncommitted changes (${row.dirty?.modified ?? 0} modified, ${row.dirty?.untracked ?? 0} untracked), and this run cannot ask.`,
      `Re-run with the decision made: ${rerunWith(rerun, name, "--force")}`,
    );
  }

  const files: CleanupFileReport[] = [];
  const removedPaths: string[] = [];

  for (const entry of receipt.entries) {
    const absolute = join(row.entry.path, entry.path);
    // oxlint-disable-next-line no-await-in-loop -- rows share ancestor directories; the empty-ancestor sweep below reads the state this loop leaves
    const state = await inspectEntryState(absolute);
    const verdict = classifyReceiptEntry(entry, state);
    if (verdict.disposition !== "remove") {
      files.push({
        path: entry.path,
        outcome: verdict.disposition === "absent" ? "absent" : "kept",
        reason: verdict.reason,
        detail:
          verdict.reason === "diverged"
            ? "the bytes differ from what setup placed, so the copy was left where it is"
            : null,
      });
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- ordered with the state read above; a parallel unlink races its own ancestor sweep
      await rm(absolute, { force: true });
      files.push({ path: entry.path, outcome: "removed", reason: verdict.reason, detail: null });
      removedPaths.push(absolute);
    } catch (error) {
      files.push({
        path: entry.path,
        outcome: "failed",
        reason: "failed",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await pruneEmptyAncestors(removedPaths, row.entry.path);

  if (opts.filesOnly === true) {
    return cleanupReport(row, files, receipt, false, null);
  }
  await removeWorktree(run, opts.repoRoot, row.entry.path, dirty);
  return cleanupReport(row, files, receipt, true, null);
}

function cleanupReport(
  row: WorktreeInventoryRow,
  files: readonly CleanupFileReport[],
  receipt: WorktreeReceipt,
  removed: boolean,
  skipped: string | null,
): CleanupWorktreeReport {
  const branch = row.entry.branch ?? receipt.worktree.branch;
  return {
    path: row.entry.path,
    branch: branch === "" ? null : branch,
    classification: row.classification,
    files,
    droppedRows: row.droppedRows,
    removed,
    // Named, never run. Invariant 4: a branch is never deleted by this lane.
    branchCommand: removed && branch !== "" ? `git branch -d ${branch}` : null,
    skipped,
  };
}

/**
 * Removes the directories this lane created once they end up empty, deepest
 * first.
 *
 * Bottom-up because removing `a/b/c` is what makes `a/b` empty, and a top-down
 * pass would test each ancestor before its child was gone. Bounded at the
 * worktree root — nothing above it is this lane's to touch — and a non-empty
 * directory simply stops the walk, because `rmdir` refusing with ENOTEMPTY is
 * the answer rather than an error.
 */
async function pruneEmptyAncestors(
  removedPaths: readonly string[],
  worktreeRoot: string,
): Promise<void> {
  const root = resolve(worktreeRoot);
  const candidates = [...new Set(removedPaths.map((path) => dirname(resolve(path))))].toSorted(
    (a, b) => b.split(sep).length - a.split(sep).length,
  );

  for (let directory of candidates) {
    while (directory !== root && isInside(directory, root)) {
      // oxlint-disable-next-line no-await-in-loop -- the walk's next frame depends on this readdir; a parent cannot be tested before its child is gone
      const contents = await readdir(directory).catch(() => null);
      if (contents === null || contents.length > 0) break;
      // oxlint-disable-next-line no-await-in-loop -- ordered with the readdir above
      const removed = await rmdir(directory).then(
        () => true,
        () => false,
      );
      if (!removed) break;
      directory = dirname(directory);
    }
  }
}
