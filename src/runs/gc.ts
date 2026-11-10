import type { Stats } from "node:fs";
import { lstat, open, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { EngineError } from "../types/errors.ts";
import { STATE_DIR } from "../types/markers.ts";
import { isInside, readWorktreeInventory, type WorktreeClass } from "../worktree/cleanup.ts";
import {
  GIT_FETCH_TIMEOUT_MS,
  hasOriginRemote,
  isDirty,
  pruneWorktrees,
  runGit,
  type WorktreeGitRunner,
} from "../worktree/git.ts";
import {
  RECORD_FILE,
  RECORD_HEAD_LINES,
  RECORD_HEAD_READ_BYTES,
  RECORD_STATUS_PATTERN,
  REPORTS_DIR,
  RUNS_SEGMENTS,
  isRunId,
} from "./layout.ts";

/**
 * `stamity gc`'s engine (REQ-FLOW-177): what local state the setup's runs left, how large it is, and — only when
 * asked — the freeing of it.
 *
 * Two calls, so a preview and a sweep can never disagree about what they read: {@link planGc} reads everything and
 * writes nothing, and {@link applyGc} acts on exactly the plan it is handed. The plan already carries the would-free
 * set, so a dry run's `freed` is what `--apply` would free, and an applied run's `freed` is what it did free.
 *
 * Four bounds hold on every act, and each one is checked where the act happens rather than once up front:
 *
 * 1. **The root bound.** A file is removed only under `<root>/.stamity/`, never through a link: the walk does not
 *    follow one, a link it meets is kept and named, and the apply re-reads the file and its folder's real path
 *    before the unlink, so a folder swapped for a link between the plan and the sweep is refused, not followed.
 *    A link at `.stamity/handoffs` or at its `archive/` stops the handoff sweep whole, at the plan and again at the
 *    apply. A worktree registration is pruned only when every prunable one sits in the managed farm.
 * 2. **The tracked bound.** git's own tracked list for `.stamity/` is read once, and no path on it is ever removed;
 *    a list git will not give stops the run, because nothing could then prove a file untracked.
 * 3. **No remote write.** A branch is deleted with `git branch -d` (never `-D`), only when merged into the main
 *    checkout's HEAD and checked out nowhere, and only with `--branches`; a remote-tracking ref is dropped with
 *    `git update-ref -d` against its read value, only when `git ls-remote` shows origin no longer has the branch.
 *    Nothing is pushed and no remote branch is touched.
 * 4. **No dirty tree.** No worktree is removed at all: the inventory lists them, a dirty one as `dirty`, and the
 *    only worktree act is `git worktree prune`, which drops registrations whose folder is already gone.
 * 5. **No open run.** A run folder is touched only when its `record.md` head reads a closed status (`Status: closed
 *    …`, as a run writes it at its end). An open run, or one whose record is missing, a link or unreadable, keeps its
 *    whole folder, reports included, and the report marks it `open`.
 *
 * Handoffs reach this module as an injected {@link HandoffSweep}: the store is the engine registry's, and the CLI
 * hands its preview and its one-handoff archive down, so this file names the store's verdicts without importing the
 * store. The apply acts on the previewed list, not on a fresh read: each archived handoff past retention is removed
 * here under the same re-check as a run file, and each expired one is archived by id after the same re-check.
 *
 * `freed.paths` holds three spellings, one per kind of thing freed: a repo-relative POSIX path for a file under
 * `.stamity/`, a full ref name (`refs/heads/…`, `refs/remotes/…`) for a ref, and the absolute path git records for
 * a pruned worktree registration.
 */

/** The default age, in days, past which a report file is freed. */
export const GC_DEFAULT_REPORT_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/** The handoff store's folder under `.stamity/`, and its archive under that. */
const HANDOFF_SEGMENTS = ["handoffs"] as const;
const HANDOFF_ARCHIVE_SEGMENTS = ["handoffs", "archive"] as const;

/** A record status value that says the run is over: `closed`, then anything (a date, a reason). */
const CLOSED_STATUS_PATTERN = /^closed\b/iu;

/** The local branch namespace a run's branch lives in. */
const RUN_BRANCH_PREFIX = "refs/heads/stamity/";

/** The remote-tracking namespace for origin's copies of those branches. */
const RUN_TRACKING_PREFIX = "refs/remotes/origin/stamity/";

/** One handoff file the store's sweep would act on. */
export interface HandoffTarget {
  readonly id: string;
  /** Absolute path of the file. */
  readonly path: string;
}

/**
 * The handoff store's prune, as two calls: `preview` names what the store's sweep would archive and delete without
 * moving anything, and `archive` moves one live handoff into the archive (`store.archiveHandoff`). The deletes are
 * this module's own, bounded like every other file it removes.
 */
export interface HandoffSweep {
  preview(rootDir: string, now: Date): Promise<{ archive: HandoffTarget[]; remove: HandoffTarget[] }>;
  archive(rootDir: string, id: string): Promise<void>;
}

export interface GcOptions {
  /** The main checkout's root: the `.stamity/` the sweep may touch is this root's. */
  readonly repoRoot: string;
  /** The managed farm, resolved by the caller through `resolveFarmDir`. */
  readonly farmDir: string;
  readonly now: Date;
  readonly reportsOlderThanDays: number;
  /** `--runs-older-than`; null leaves run folders alone apart from their old reports. */
  readonly runsOlderThanDays: number | null;
  /** `--branches`: delete merged local `stamity/*` branches. */
  readonly branches: boolean;
  readonly handoffs: HandoffSweep;
  readonly run?: WorktreeGitRunner;
}

interface GcRunRow {
  readonly run: string;
  readonly bytes: number;
  readonly reportsBytes: number;
  readonly ageDays: number;
  /** Whether git tracks any file in the folder. */
  readonly tracked: boolean;
  /** The record head does not read a closed status (or cannot be read), so nothing in the folder is freed. */
  readonly open: boolean;
}

interface GcBranchRow {
  readonly name: string;
  readonly merged: boolean;
  /** Whether this invocation frees it: `--branches`, merged, and checked out nowhere. */
  readonly eligible: boolean;
}

/** A worktree's class: the inventory's, with `other` spelled `outside` and a dirty farm tree spelled `dirty`. */
type GcWorktreeClass = Exclude<WorktreeClass, "other"> | "outside" | "dirty";

interface GcWorktreeRow {
  readonly path: string;
  readonly class: GcWorktreeClass;
  /** git's ignored entries in the tree, directories collapsed; empty for a registration whose folder is gone. */
  readonly ignored: readonly string[];
}

interface GcKept {
  readonly path: string;
  readonly reason: string;
}

/** The report, the same shape on a dry run and on an applied one. */
export interface GcReport {
  readonly dryRun: boolean;
  readonly runs: readonly GcRunRow[];
  readonly reports: { readonly files: number; readonly bytes: number; readonly eligible: number };
  readonly branches: readonly GcBranchRow[];
  readonly staleTracking: readonly string[];
  readonly worktrees: readonly GcWorktreeRow[];
  readonly handoffs: { readonly archived: readonly string[]; readonly eligible: readonly string[] };
  readonly freed: { readonly bytes: number; readonly paths: readonly string[] };
  /** What the sweep saw and left, with why: a link, a tracked file, a registration outside the farm. */
  readonly kept: readonly GcKept[];
  /** Acts that were attempted and failed; empty on a dry run. */
  readonly failed: readonly GcKept[];
}

interface FileTarget {
  readonly abs: string;
  readonly rel: string;
  readonly bytes: number;
}

/** Everything {@link applyGc} needs beyond the report: the exact acts, already bounded. */
export interface GcPlan {
  readonly report: GcReport;
  readonly repoRoot: string;
  readonly stateDir: string;
  readonly realStateDir: string | null;
  readonly files: readonly FileTarget[];
  /** Run folders whose emptied directories the sweep then removes, deepest first. */
  readonly emptyDirCandidates: readonly string[];
  readonly handoffArchive: readonly (FileTarget & { readonly id: string })[];
  readonly handoffRemove: readonly (FileTarget & { readonly id: string })[];
  readonly sweepHandoffs: boolean;
  readonly prune: readonly string[];
  readonly tracking: readonly { readonly ref: string; readonly sha: string }[];
  readonly branchesToDelete: readonly string[];
}

interface WalkEntry {
  readonly abs: string;
  readonly rel: string;
  readonly kind: "file" | "link" | "dir";
  readonly bytes: number;
  readonly mtimeMs: number;
}

const toPosix = (path: string): string => path.split(sep).join("/");

function errnoCode(cause: unknown): string | undefined {
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code: unknown }).code)
    : undefined;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

async function lstatOrNull(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (cause) {
    if (errnoCode(cause) === "ENOENT") return null;
    throw cause;
  }
}

/**
 * Every entry under `dir`, never through a link. A link is returned as itself (zero bytes) and not descended, so
 * a report folder that is a link to elsewhere is reported and left, never walked or emptied.
 */
async function walk(dir: string, repoRoot: string): Promise<WalkEntry[]> {
  const out: WalkEntry[] = [];
  const names = await readdir(dir);
  for (const name of names.toSorted()) {
    const abs = join(dir, name);
    // oxlint-disable-next-line no-await-in-loop -- one lstat per entry, in order; a fan-out buys nothing on a local folder
    const stats = await lstatOrNull(abs);
    if (stats === null) continue;
    const rel = toPosix(relative(repoRoot, abs));
    if (stats.isSymbolicLink()) {
      out.push({ abs, rel, kind: "link", bytes: 0, mtimeMs: stats.mtimeMs });
    } else if (stats.isDirectory()) {
      out.push({ abs, rel, kind: "dir", bytes: 0, mtimeMs: stats.mtimeMs });
      // oxlint-disable-next-line no-await-in-loop -- depth-first, so a deep folder never holds every handle at once
      out.push(...(await walk(abs, repoRoot)));
    } else if (stats.isFile()) {
      out.push({ abs, rel, kind: "file", bytes: stats.size, mtimeMs: stats.mtimeMs });
    }
  }
  return out;
}

/** git's tracked list under `.stamity/`, POSIX and repo-relative. A refusal stops the run: nothing is then provable. */
async function readTracked(run: WorktreeGitRunner, repoRoot: string): Promise<ReadonlySet<string>> {
  const outcome = await run({ args: ["ls-files", "-z", "--", STATE_DIR], cwd: repoRoot });
  if (outcome.status !== 0) {
    throw new EngineError(
      `git would not list the tracked files under ${STATE_DIR}/ in ${repoRoot}, so no file there can be shown ` +
        `untracked and nothing was removed.`,
      { code: "VALIDATION_ERROR", why: outcome.stderr.trim() || `git exited ${String(outcome.status)}` },
    );
  }
  return new Set(outcome.stdout.split("\0").filter((path) => path !== ""));
}

/** Days since the date a run id starts with, or null for a date that does not parse. */
function runAgeDays(runId: string, now: Date): number | null {
  const stamp = Date.parse(`${runId.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(stamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - stamp) / MS_PER_DAY));
}

const sum = (entries: readonly { bytes: number }[]): number =>
  entries.reduce((total, entry) => total + entry.bytes, 0);

/** The refs under `prefix`, or null when git refuses the read: a refusal is not an empty namespace. */
async function readRefs(
  run: WorktreeGitRunner,
  repoRoot: string,
  prefix: string,
): Promise<{ ref: string; sha: string }[] | null> {
  const outcome = await run({
    args: ["for-each-ref", "--format=%(refname)%00%(objectname)", prefix],
    cwd: repoRoot,
  });
  if (outcome.status !== 0) return null;
  return outcome.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [ref = "", sha = ""] = line.split("\0");
      return { ref, sha };
    })
    .filter((row) => row.ref.startsWith(prefix) && row.sha !== "");
}

/** git's ignored entries in one tree, directories collapsed (`--ignored=traditional`); null when git refuses. */
async function readIgnored(run: WorktreeGitRunner, worktreePath: string): Promise<string[] | null> {
  const outcome = await run({
    args: ["status", "--porcelain=v1", "-z", "--ignored=traditional", "--untracked-files=normal"],
    cwd: worktreePath,
  });
  if (outcome.status !== 0) return null;
  return outcome.stdout
    .split("\0")
    .filter((token) => token.startsWith("!! "))
    .map((token) => token.slice(3).replace(/\/$/u, ""))
    .toSorted();
}

/**
 * Whether the run's record head reads a closed status. A record that is missing, a link, not a regular file or
 * unreadable reads as not closed, so the run is kept: only the run's own word that it is over lets gc touch it.
 */
async function recordIsClosed(runPath: string): Promise<boolean> {
  const path = join(runPath, RECORD_FILE);
  let raw: string;
  try {
    const stats = await lstat(path);
    if (!stats.isFile()) return false;
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(RECORD_HEAD_READ_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      raw = buffer.toString("utf8", 0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
  const body = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  for (const line of body.split(/\r?\n/u).slice(0, RECORD_HEAD_LINES)) {
    const status = RECORD_STATUS_PATTERN.exec(line)?.[1];
    if (status !== undefined) return CLOSED_STATUS_PATTERN.test(status.trim());
  }
  return false;
}

/**
 * The first handoff folder that exists and is not a plain folder (a link, most likely), repo-relative; null when
 * both are plain folders or absent. The handoff folder is checked before its archive, so a linked parent is never
 * read through.
 */
async function linkedHandoffFolder(stateDir: string, repoRoot: string): Promise<string | null> {
  for (const segments of [HANDOFF_SEGMENTS, HANDOFF_ARCHIVE_SEGMENTS]) {
    const path = join(stateDir, ...segments);
    // oxlint-disable-next-line no-await-in-loop -- the parent first, so the archive is never read through a link
    const stats = await lstatOrNull(path);
    if (stats === null) return null;
    if (!stats.isDirectory()) return toPosix(relative(repoRoot, path));
  }
  return null;
}

interface RunsRead {
  readonly rows: GcRunRow[];
  readonly reports: { files: number; bytes: number; eligible: number };
  readonly files: FileTarget[];
  readonly emptyDirCandidates: string[];
  readonly kept: GcKept[];
}

async function readRuns(
  opts: GcOptions,
  stateIsLink: boolean,
  tracked: ReadonlySet<string>,
): Promise<RunsRead> {
  const result: RunsRead = {
    rows: [],
    reports: { files: 0, bytes: 0, eligible: 0 },
    files: [],
    emptyDirCandidates: [],
    kept: [],
  };
  const runsDir = join(opts.repoRoot, ...RUNS_SEGMENTS);
  const runsRel = toPosix(join(...RUNS_SEGMENTS));
  if (stateIsLink) {
    result.kept.push({ path: STATE_DIR, reason: "a link, not followed: nothing under it is read or removed" });
    return result;
  }
  const runsStats = await lstatOrNull(runsDir);
  if (runsStats === null) return result;
  if (!runsStats.isDirectory()) {
    result.kept.push({ path: runsRel, reason: "not a folder (a link is not followed)" });
    return result;
  }

  const reportCutoff = opts.now.getTime() - opts.reportsOlderThanDays * MS_PER_DAY;
  const chosen = new Map<string, FileTarget>();
  for (const name of (await readdir(runsDir)).toSorted()) {
    if (!isRunId(name)) continue;
    const runPath = join(runsDir, name);
    // oxlint-disable-next-line no-await-in-loop -- one run folder at a time keeps the walk's handles bounded
    const stats = await lstatOrNull(runPath);
    if (stats === null) continue;
    if (!stats.isDirectory()) {
      result.kept.push({ path: `${runsRel}/${name}`, reason: "not a folder (a link is not followed)" });
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- as above
    const entries = await walk(runPath, opts.repoRoot);
    const files = entries.filter((entry) => entry.kind === "file");
    const reportsRel = `${runsRel}/${name}/${REPORTS_DIR}`;
    const reportsRoot = entries.find((entry) => entry.rel === reportsRel);
    const reportFiles =
      reportsRoot?.kind === "dir" ? files.filter((entry) => entry.rel.startsWith(`${reportsRel}/`)) : [];
    const ageDays = runAgeDays(name, opts.now) ?? Math.floor((opts.now.getTime() - stats.mtimeMs) / MS_PER_DAY);
    // oxlint-disable-next-line no-await-in-loop -- one record head per run, as above
    const closed = await recordIsClosed(runPath);

    result.rows.push({
      run: name,
      bytes: sum(files),
      reportsBytes: sum(reportFiles),
      ageDays,
      tracked: files.some((entry) => tracked.has(entry.rel)),
      open: !closed,
    });
    result.reports.files += reportFiles.length;
    result.reports.bytes += sum(reportFiles);

    for (const link of entries.filter((entry) => entry.kind === "link")) {
      result.kept.push({ path: link.rel, reason: "a link, not followed" });
    }
    if (!closed) {
      result.kept.push({
        path: `${runsRel}/${name}`,
        reason: "open: its record does not read a closed status, so the whole run stays",
      });
      continue;
    }

    const choose = (entry: WalkEntry): void => {
      if (tracked.has(entry.rel)) return;
      chosen.set(entry.abs, { abs: entry.abs, rel: entry.rel, bytes: entry.bytes });
    };
    for (const entry of reportFiles) {
      if (entry.mtimeMs >= reportCutoff) continue;
      if (tracked.has(entry.rel)) {
        result.kept.push({ path: entry.rel, reason: "tracked by git" });
        continue;
      }
      result.reports.eligible += 1;
      choose(entry);
    }
    if (opts.runsOlderThanDays !== null && ageDays > opts.runsOlderThanDays) {
      for (const entry of files) choose(entry);
      if (files.some((entry) => tracked.has(entry.rel))) {
        result.kept.push({ path: `${runsRel}/${name}`, reason: "holds tracked files, which stay" });
      }
      result.emptyDirCandidates.push(
        ...entries
          .filter((entry) => entry.kind === "dir")
          .map((entry) => entry.abs)
          .toReversed(),
        runPath,
      );
    }
  }
  result.files.push(...[...chosen.values()].toSorted((a, b) => a.rel.localeCompare(b.rel)));
  return result;
}

/**
 * Reads everything `gc` reports and decides every act it would take. Writes nothing, and runs no git command
 * that writes; `git ls-remote` is the one call that leaves the machine, and it reads.
 */
export async function planGc(opts: GcOptions): Promise<GcPlan> {
  const run = opts.run ?? runGit;
  const repoRoot = opts.repoRoot;
  const stateDir = join(repoRoot, STATE_DIR);
  const stateStats = await lstatOrNull(stateDir);
  const stateIsLink = stateStats?.isSymbolicLink() === true;
  const realStateDir = stateStats?.isDirectory() === true ? await realpath(stateDir) : null;
  const tracked = await readTracked(run, repoRoot);
  const kept: GcKept[] = [];

  const runs = await readRuns(opts, stateIsLink, tracked);
  kept.push(...runs.kept);

  // Worktrees: listed, never removed. The only act is a prune of registrations whose folder is gone.
  const inventory = await readWorktreeInventory({ repoRoot, farmDir: opts.farmDir, run });
  const worktrees: GcWorktreeRow[] = [];
  const prunableInFarm: string[] = [];
  let prunableOutside = false;
  const checkedOut = new Set<string>();
  for (const row of inventory.worktrees) {
    if (row.entry.branch !== null) checkedOut.add(row.entry.branch);
    if (resolve(row.entry.path) === resolve(repoRoot)) continue;
    const inFarm = isInside(row.entry.path, opts.farmDir);
    let klass: GcWorktreeClass;
    if (row.classification === "other") klass = "outside";
    else if (row.classification === "prunable" && !inFarm) klass = "outside";
    else if ((row.classification === "managed" || row.classification === "managed-orphan") && row.dirty !== null &&
      isDirty(row.dirty)) klass = "dirty";
    else klass = row.classification;
    if (row.classification === "prunable") {
      if (inFarm) prunableInFarm.push(row.entry.path);
      else prunableOutside = true;
    }
    if (klass === "dirty") kept.push({ path: row.entry.path, reason: "uncommitted changes; gc never removes a tree" });
    // oxlint-disable-next-line no-await-in-loop -- one status per tree, as the inventory reads them
    const ignored = row.classification === "prunable" ? [] : await readIgnored(run, row.entry.path);
    if (ignored === null) {
      kept.push({ path: row.entry.path, reason: "git would not read its status, so its ignored files are not known" });
    }
    worktrees.push({ path: row.entry.path, class: klass, ignored: ignored ?? [] });
  }
  if (prunableOutside && prunableInFarm.length > 0) {
    for (const path of prunableInFarm) {
      kept.push({ path, reason: "a gone registration outside the farm stops the prune, which takes every one" });
    }
  }
  const prune = prunableOutside ? [] : prunableInFarm;

  // Branches: merged means an ancestor of the main checkout's HEAD — the test `git branch -d` itself makes.
  const branches: GcBranchRow[] = [];
  const branchesToDelete: string[] = [];
  const branchRefs = await readRefs(run, repoRoot, RUN_BRANCH_PREFIX);
  if (branchRefs === null) {
    kept.push({ path: RUN_BRANCH_PREFIX, reason: "git would not list these branches, so none is known" });
  }
  for (const { ref } of branchRefs ?? []) {
    const name = ref.slice("refs/heads/".length);
    // oxlint-disable-next-line no-await-in-loop -- one ancestry test per branch
    const ancestry = await run({ args: ["merge-base", "--is-ancestor", ref, "HEAD"], cwd: repoRoot });
    const merged = ancestry.status === 0;
    const eligible = opts.branches && merged && !checkedOut.has(name);
    if (opts.branches && merged && checkedOut.has(name)) {
      kept.push({ path: ref, reason: "checked out in a worktree" });
    }
    if (eligible) branchesToDelete.push(name);
    branches.push({ name, merged, eligible });
  }

  // Tracking refs: stale only on origin's own word.
  const trackingRead = await readRefs(run, repoRoot, RUN_TRACKING_PREFIX);
  if (trackingRead === null) {
    kept.push({ path: RUN_TRACKING_PREFIX, reason: "git would not list these refs, so none is known stale" });
  }
  const trackingRefs = trackingRead ?? [];
  const tracking: { ref: string; sha: string }[] = [];
  if (trackingRefs.length > 0 && (await hasOriginRemote(run, repoRoot))) {
    const remote = await run({
      args: ["ls-remote", "--heads", "origin", "refs/heads/stamity/*"],
      cwd: repoRoot,
      timeoutMs: GIT_FETCH_TIMEOUT_MS,
    });
    if (remote.status === 0) {
      const present = new Set(
        remote.stdout
          .split("\n")
          .map((line) => line.split("\t")[1] ?? "")
          .filter((ref) => ref.startsWith(RUN_BRANCH_PREFIX))
          .map((ref) => ref.slice(RUN_BRANCH_PREFIX.length)),
      );
      for (const row of trackingRefs) {
        if (!present.has(row.ref.slice(RUN_TRACKING_PREFIX.length))) tracking.push(row);
      }
    } else {
      kept.push({ path: RUN_TRACKING_PREFIX, reason: "origin did not answer, so no tracking ref is known stale" });
    }
  }

  // Handoffs: the store's own verdicts, never read through a linked folder, each target a regular file inside the
  // handoff folder, and kept whole when any file the sweep would touch is tracked.
  const linkedHandoffs = stateIsLink ? null : await linkedHandoffFolder(stateDir, repoRoot);
  if (linkedHandoffs !== null) {
    kept.push({ path: linkedHandoffs, reason: "a link, not followed: the handoff sweep did not run" });
  }
  const read =
    stateIsLink || linkedHandoffs !== null
      ? { archive: [], remove: [] }
      : await opts.handoffs.preview(repoRoot, opts.now);
  const handoffsDir = join(stateDir, ...HANDOFF_SEGMENTS);
  const regular = async (targets: readonly HandoffTarget[]): Promise<(FileTarget & { id: string })[]> => {
    const out: (FileTarget & { id: string })[] = [];
    for (const target of targets) {
      const rel = toPosix(relative(repoRoot, target.path));
      // oxlint-disable-next-line no-await-in-loop -- one lstat per handoff the store named
      const stats = isInside(target.path, handoffsDir) ? await lstatOrNull(target.path) : null;
      if (stats?.isFile() !== true) {
        kept.push({ path: rel, reason: "not a regular file inside .stamity/handoffs (a link is not followed)" });
        continue;
      }
      out.push({ id: target.id, abs: target.path, rel, bytes: Number(stats.size) });
    }
    return out;
  };
  const archiveTargets = await regular(read.archive);
  const removeTargets = await regular(read.remove);
  const handoffTargets = [...archiveTargets, ...removeTargets];
  const trackedHandoff = handoffTargets.find((target) => tracked.has(target.rel));
  const sweepHandoffs = trackedHandoff === undefined && handoffTargets.length > 0;
  if (trackedHandoff !== undefined) {
    kept.push({ path: trackedHandoff.rel, reason: "tracked by git, so the handoff sweep did not run" });
  }
  const handoffArchive = sweepHandoffs ? archiveTargets : [];
  const handoffRemove = sweepHandoffs ? removeTargets : [];

  const freedFiles = [...runs.files, ...handoffRemove];
  const report: GcReport = {
    dryRun: true,
    runs: runs.rows,
    reports: runs.reports,
    branches,
    staleTracking: tracking.map((row) => row.ref),
    worktrees,
    handoffs: {
      archived: archiveTargets.map((target) => target.id).toSorted(),
      eligible: removeTargets.map((target) => target.id).toSorted(),
    },
    freed: {
      bytes: sum(freedFiles),
      paths: [
        ...freedFiles.map((file) => file.rel),
        ...prune,
        ...tracking.map((row) => row.ref),
        ...branchesToDelete.map((name) => `refs/heads/${name}`),
      ],
    },
    kept,
    failed: [],
  };
  return {
    report,
    repoRoot,
    stateDir,
    realStateDir,
    files: runs.files,
    emptyDirCandidates: runs.emptyDirCandidates,
    handoffArchive,
    handoffRemove,
    sweepHandoffs,
    prune,
    tracking,
    branchesToDelete,
  };
}

/**
 * The file still where the plan saw it: a regular file, under `.stamity/`, in a folder whose real path is the one
 * the plan's root resolves to. A link swapped in between the plan and the sweep fails this, and is not followed.
 */
async function stillBounded(plan: GcPlan, abs: string): Promise<string | null> {
  if (plan.realStateDir === null || !isInside(abs, plan.stateDir) || abs === plan.stateDir) {
    return "outside .stamity/";
  }
  const stats = await lstatOrNull(abs);
  if (stats === null) return "already gone";
  if (!stats.isFile()) return "no longer a regular file";
  const expected = join(plan.realStateDir, relative(plan.stateDir, dirname(abs)));
  try {
    return (await realpath(dirname(abs))) === expected ? null : "its folder now resolves elsewhere through a link";
  } catch {
    return "already gone";
  }
}

/** Acts on exactly the plan: removes its files, runs the handoff sweep, prunes, drops refs, deletes branches. */
export async function applyGc(
  plan: GcPlan,
  opts: Pick<GcOptions, "handoffs" | "run">,
): Promise<GcReport> {
  const run = opts.run ?? runGit;
  const failed: GcKept[] = [];
  const kept: GcKept[] = [...plan.report.kept];
  const freedPaths: string[] = [];
  let freedBytes = 0;

  const remove = async (file: FileTarget): Promise<void> => {
    const refusal = await stillBounded(plan, file.abs);
    if (refusal === "already gone") return;
    if (refusal !== null) {
      kept.push({ path: file.rel, reason: refusal });
      return;
    }
    try {
      await unlink(file.abs);
      freedPaths.push(file.rel);
      freedBytes += file.bytes;
    } catch (cause) {
      failed.push({ path: file.rel, reason: describe(cause) });
    }
  };

  for (const file of plan.files) {
    // oxlint-disable-next-line no-await-in-loop -- each unlink is preceded by its own re-check
    await remove(file);
  }
  for (const dir of plan.emptyDirCandidates) {
    if (!isInside(dir, plan.stateDir) || dir === plan.stateDir) continue;
    try {
      // oxlint-disable-next-line no-await-in-loop -- deepest first, so a parent is tried after its children
      const stats = await lstatOrNull(dir);
      if (stats?.isDirectory() !== true) continue;
      // oxlint-disable-next-line no-await-in-loop -- as above
      await rmdir(dir);
    } catch (cause) {
      // A folder still holding a tracked or kept file is not empty, and stays; that is the bound, not a failure.
      if (errnoCode(cause) !== "ENOTEMPTY" && errnoCode(cause) !== "EEXIST" && errnoCode(cause) !== "ENOENT") {
        failed.push({ path: toPosix(relative(plan.repoRoot, dir)), reason: describe(cause) });
      }
    }
  }

  // The handoff sweep acts on the previewed list: a folder that became a link since the plan stops it whole, each
  // expired handoff is archived by id after its own re-check, and each one past retention is removed as a run file
  // is, so nothing outside `.stamity/` is reached through a link.
  if (plan.sweepHandoffs) {
    const linked = await linkedHandoffFolder(plan.stateDir, plan.repoRoot);
    if (linked === null) {
      for (const target of plan.handoffArchive) {
        // The store archives by id, reading `handoffs/<id>.md`: a file under any other name would have the store
        // move a different handoff than the one re-checked here, so it stays.
        if (target.abs !== join(plan.stateDir, ...HANDOFF_SEGMENTS, `${target.id}.md`)) {
          kept.push({ path: target.rel, reason: "its file name is not <id>.md, so archiving it by id would move another file" });
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- each move is preceded by its own re-check
        const refusal = await stillBounded(plan, target.abs);
        if (refusal === "already gone") continue;
        if (refusal !== null) {
          kept.push({ path: target.rel, reason: refusal });
          continue;
        }
        try {
          // oxlint-disable-next-line no-await-in-loop -- as above
          await opts.handoffs.archive(plan.repoRoot, target.id);
        } catch (cause) {
          failed.push({ path: target.rel, reason: describe(cause) });
        }
      }
      for (const target of plan.handoffRemove) {
        // oxlint-disable-next-line no-await-in-loop -- each unlink is preceded by its own re-check
        await remove(target);
      }
    } else {
      kept.push({ path: linked, reason: "a link since the preview, not followed: the handoff sweep did not run" });
    }
  }

  if (plan.prune.length > 0) {
    try {
      await pruneWorktrees(run, plan.repoRoot);
      freedPaths.push(...plan.prune);
    } catch (cause) {
      failed.push({ path: plan.prune.join(", "), reason: describe(cause) });
    }
  }

  for (const { ref, sha } of plan.tracking) {
    // oxlint-disable-next-line no-await-in-loop -- one ref at a time, each against the value the plan read
    const outcome = await run({ args: ["update-ref", "-d", ref, sha], cwd: plan.repoRoot });
    if (outcome.status === 0) freedPaths.push(ref);
    else failed.push({ path: ref, reason: outcome.stderr.trim() || `git exited ${String(outcome.status)}` });
  }

  for (const name of plan.branchesToDelete) {
    // oxlint-disable-next-line no-await-in-loop -- one branch at a time; `-d` makes git's own merge test again
    const outcome = await run({ args: ["branch", "-d", "--", name], cwd: plan.repoRoot });
    if (outcome.status === 0) freedPaths.push(`refs/heads/${name}`);
    else failed.push({ path: `refs/heads/${name}`, reason: outcome.stderr.trim() || `git exited ${String(outcome.status)}` });
  }

  return {
    ...plan.report,
    dryRun: false,
    freed: { bytes: freedBytes, paths: freedPaths },
    kept,
    failed,
  };
}
