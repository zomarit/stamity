import {
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { constants as FS } from "node:fs";
import type { Stats } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { lock } from "proper-lockfile";
import { readEnvBool, readEnvInt } from "../config/parse.ts";
import { EngineError } from "../types/errors.ts";
import { CONTENT_PREFIX } from "../types/markers.ts";
import { mapFsErrno } from "./fsErrors.ts";

/**
 * Atomic write substrate: cross-process write locks, temp+rename writes,
 * verified backups, and the orphan temp-file sweep. Content-agnostic — the
 * managed-block merge decision engine (`./safeWrite.ts`) composes on top.
 *
 * ## Where a write lands is checked, not assumed
 *
 * A path names a lookup, and the lookup can be re-aimed between the moment a
 * caller decides a path is safe and the moment bytes land on it: replace a
 * directory on the path with a symlink and the same string now addresses
 * another tree entirely. Four measures bind the decision to the outcome:
 *
 * 1. Every public entry `resolve()`s its path as its first act and derives the
 *    temp, backup and lock siblings from the normalised value, so the checks
 *    inspect the bytes the syscalls use. Without it a `link/../real` spelling is
 *    checked lexically (`real`, where `resolve` collapses `..`) and written
 *    wherever the kernel lands it (past `link`, where `..` is applied after the
 *    link is followed) — two different directories, one of them unchecked.
 * 2. The temp file is created `O_EXCL | O_NOFOLLOW`, so a symlink or a file
 *    pre-planted at the temp name is refused rather than written through.
 * 3. The parent directory is pinned by DESCRIPTOR — opened, then `fstat`ed —
 *    BEFORE the containment check of measure 4, and the path is read once more
 *    immediately after that check and compared against the pin; it is re-read a
 *    final time immediately before the rename. A mismatch at either point
 *    aborts the write with the temp file removed and nothing published. The
 *    order is the guarantee: pinning AFTER the check left the two describing
 *    different objects — the check cleared one directory, a swap replaced it,
 *    `stat` pinned the replacement, and the re-read before the rename agreed
 *    with the poisoned pin, so the write landed in the directory the check had
 *    refused to look at. Checking after the pin closes it: a swap before the
 *    check is what the check now sees, and a swap after it fails the compare.
 *    What this still does NOT cover is a link ALREADY in place when the run
 *    started — the open that takes the pin follows it exactly as `stat` did, so
 *    the pin records the redirected directory. Measure 4 is what covers that.
 * 4. Every write path is containment-checked before any byte — and before the
 *    `mkdir -p` that would build it — by {@link assertWriteTargetContained}.
 *    Callers holding a boundary pass `boundaryDir` and the resolved landing
 *    directory must sit inside it; callers without one still get the local rule
 *    that no symlinked directory component may resolve out of the directory
 *    holding it. The check answers with a RESOLVED landing or not at all: a
 *    component it could not `lstat` refuses the write rather than being read as
 *    absent, because an absent component ends the walk legitimately while an
 *    unreadable one leaves the rest of the path resolved by spelling alone —
 *    and a lexical landing sits inside any boundary ({@link probeComponent}).
 *
 * Measure 4 is not opt-in, and that is deliberate: it is the only one of the
 * four that a pre-existing link is visible to. Callers that own a boundary
 * still make the more precise decision (only they know which tree a write
 * belongs to), but a caller that passes nothing no longer writes with
 * containment switched off.
 *
 * Every `await` in a loop here is ordered on purpose, so `no-await-in-loop` is
 * off for the module: the lock wait re-checks the holder only after the prior
 * waiter wakes, the rename retry sleeps between attempts, the temp-file walk
 * takes its next frame from the current `readdir`, the contention probe stops
 * at the first fresh temp file, and the `.bak` search redraws a name only once
 * the previous one collided. The sweep's stat/unlink pass stays serial as
 * deliberate backpressure — a cleanup path must not fan out an unbounded
 * number of file handles. `Promise.all()` is wrong at all of them.
 */
/* oxlint-disable no-await-in-loop */

function errnoCode(err: unknown): string | undefined {
  const code = (err as NodeJS.ErrnoException | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * True when `path` is an existing directory ENTRY; false only on ENOENT — other
 * errors propagate.
 *
 * `lstat`, not `access`: `access` follows a symlink, so a link whose target does
 * not exist yet reports ENOENT and reads as "nothing here" — while a copy or a
 * write through that same name follows the link and lands on the target. For a
 * name this module is deciding whether to CREATE, a dangling link is occupied,
 * not free.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (err) {
    if (errnoCode(err) !== "ENOENT") throw err;
    return false;
  }
}

/**
 * A regular file whose inode carries more than one directory entry — a HARD
 * link. The same primitive the link guards refuse (a name in this tree for bytes
 * another name owns too), with no distinguishing bit for them to read: `lstat`
 * reports a plain regular file, `isSymbolicLink()` is `false`, and the second
 * name can sit anywhere on the volume including outside this tree.
 *
 * Directories are excluded by `isFile()`, not by omission: every POSIX directory
 * carries `nlink >= 2` (its own `.` plus each child's `..`), so the count only
 * means "these bytes have another name" for a regular file.
 *
 * It lives in the substrate, beside {@link existingFileMode}, because both are
 * facts read off a directory ENTRY that decide how a write may proceed, and
 * because every layer that needs one needs it below the merge policy that acts
 * on it. What the predicate does NOT carry is that policy: which lanes refuse a
 * shared name, which harms the refusal prevents, and the posture behind refusing
 * rather than warning are stated once, in
 * `./safeWrite.ts::refuseMergeIntoSharedFile` and the guards around it. Read
 * them before adding a caller — a site that reads `nlink` without the ordering
 * rules there can leak what it was meant to protect.
 */
export function isSharedRegularFile(entry: Stats): boolean {
  return entry.isFile() && entry.nlink > 1;
}

// ── Cross-process locking ──────────────────────────────────────────────────

/** Retry schedule proper-lockfile hands to node-retry: waits of
 *  min(minTimeout × factor^attempt, maxTimeout) = 100/200/400/800/1500ms. */
const LOCK_RETRIES = 5;
const LOCK_RETRY_MIN_MS = 100;
const LOCK_RETRY_MAX_MS = 1500;
const LOCK_RETRY_FACTOR = 2;

/**
 * Total worst-case backoff (ms) across the retry schedule — derived from the
 * constants rather than hand-written so the `LOCK_TIMEOUT` message cannot
 * drift from the real wait. Evaluates to 3000 for the current schedule.
 */
export const LOCK_RETRY_TOTAL_BACKOFF_MS: number = Array.from(
  { length: LOCK_RETRIES },
  (_, attempt) => Math.min(LOCK_RETRY_MIN_MS * LOCK_RETRY_FACTOR ** attempt, LOCK_RETRY_MAX_MS),
).reduce((sum, wait) => sum + wait, 0);

/** A held lock older than this may be stolen as abandoned. Upper bound for
 *  sub-second managed-file writes, not a guarantee on slow filesystems —
 *  raise via STAMITY_LOCK_STALE_MS there. */
const LOCK_STALE_DEFAULT_MS = 15_000;
/** Floor for an operator override: below this, proper-lockfile's own mtime
 *  refresh interval cannot keep a live lock from looking stale. */
const LOCK_STALE_MIN_MS = 2_000;

function resolveLockStaleMs(): number {
  const parsed = readEnvInt("STAMITY_LOCK_STALE_MS");
  if (parsed === undefined || parsed <= 0) return LOCK_STALE_DEFAULT_MS;
  return Math.max(parsed, LOCK_STALE_MIN_MS);
}

/**
 * Who holds an in-process lock entry: an exported {@link acquireWriteLock}
 * caller keeping a multi-step critical section open (`"external"`), or one of
 * this module's own writers holding it for a single write (`"internal-write"`).
 */
type LockHolderKind = "external" | "internal-write";

interface HeldLockEntry {
  kind: LockHolderKind;
  /** Wake callbacks for same-process acquirers queued on this path. Release
   *  wakes all; the first to run reserves, the rest re-queue with their
   *  original deadline. */
  waiters: Array<() => void>;
}

/**
 * In-process lock table for paths whose on-disk advisory lock is held by THIS
 * process. Reentrancy is scoped by holder kind: an external acquire always
 * queues behind any holder; an internal-write acquire no-ops under an external
 * holder (a nested write inside the holder's critical section — the holder
 * owns the lifecycle) and queues behind another internal-write holder, so
 * concurrent same-path writes genuinely serialize.
 */
const HELD_LOCKS = new Map<string, HeldLockEntry>();

/** Ceiling for a same-process queue wait — just above the ~3s cross-process
 *  retry budget so both contention shapes surface the same LOCK_TIMEOUT. */
const IN_PROCESS_LOCK_WAIT_MS = 5_000;

/**
 * Wait until `filePath` has no in-process holder, then reserve it for `kind`.
 * The free-check and the reservation happen in one synchronous step, so two
 * woken waiters cannot both claim the path. Re-queued waiters keep their
 * original deadline, bounding the total wait.
 */
async function reserveInProcessLock(filePath: string, kind: LockHolderKind): Promise<void> {
  const deadline = Date.now() + IN_PROCESS_LOCK_WAIT_MS;
  for (;;) {
    const held = HELD_LOCKS.get(filePath);
    if (held === undefined) {
      HELD_LOCKS.set(filePath, { kind, waiters: [] });
      return;
    }
    const remainingMs = deadline - Date.now();
    const woken =
      remainingMs > 0 &&
      (await new Promise<boolean>((resolveWake) => {
        const timer = setTimeout(() => resolveWake(false), remainingMs);
        held.waiters.push(() => {
          clearTimeout(timer);
          resolveWake(true);
        });
      }));
    if (!woken) {
      throw new EngineError(
        `Timed out waiting for the in-process write lock on ${filePath} after ` +
          `~${Math.round(IN_PROCESS_LOCK_WAIT_MS / 1000)}s. Another task in this process is ` +
          `writing to the same file; await same-path writes sequentially, or retry once it finishes.`,
        { code: "LOCK_TIMEOUT" },
      );
    }
  }
}

/** Drop the reservation and wake every queued waiter. Called AFTER the on-disk
 *  lock is released so a woken waiter cannot collide with a live lockfile. */
function releaseInProcessLock(filePath: string): void {
  const entry = HELD_LOCKS.get(filePath);
  HELD_LOCKS.delete(filePath);
  if (entry) {
    for (const wake of entry.waiters) wake();
  }
}

/** Cross-process locking is default-ON for every write path; this flag records
 *  a process-level opt-out (a CLI `--no-lock` style switch). The STAMITY_LOCK
 *  env var overrides in both directions. */
let lockingDisabledForProcess = false;

/** Disable cross-process locking for this process. Idempotent; STAMITY_LOCK=1
 *  still force-enables over it. */
export function disableCrossProcessLocking(): void {
  lockingDisabledForProcess = true;
}

/** Affirmative twin of {@link resetCrossProcessLocking}: clear the process
 *  opt-out so locking returns to its default-on state. */
export function enableDefaultCrossProcessLocking(): void {
  lockingDisabledForProcess = false;
}

/** Reset the process-level opt-out to the shipped default (locking on). */
export function resetCrossProcessLocking(): void {
  lockingDisabledForProcess = false;
}

/** Effective locking state. Precedence: STAMITY_LOCK=0 (off) or =1 (on) wins;
 *  then the process-level opt-out; otherwise on. */
function isLockingEnabled(): boolean {
  const env = readEnvBool("STAMITY_LOCK");
  if (env !== undefined) return env;
  return !lockingDisabledForProcess;
}

/** Read-only probe of the effective locking state, for diagnostics and tests. */
export function isCrossProcessLockingEnabled(): boolean {
  return isLockingEnabled();
}

/**
 * Acquire a cross-process advisory lock for `filePath` and return a release
 * function. Callers MUST release in a `finally` block; release is idempotent
 * (a second call is a no-op). When locking is opted out the returned release
 * is a no-op and no lockfile touches disk.
 *
 * Re-entrant per path in-process: a nested {@link atomicWriteFile} inside a
 * held critical section on the same path no-ops instead of deadlocking, while
 * a SIBLING acquire queues behind the holder (bounded by ~5s, then
 * `LOCK_TIMEOUT`). Cross-process contention exhausts the retry schedule
 * (~{@link LOCK_RETRY_TOTAL_BACKOFF_MS}ms) into `LOCK_TIMEOUT`; a lock
 * untouched for the staleness threshold (default 15s, STAMITY_LOCK_STALE_MS to
 * raise) is stolen as abandoned. A symlink standing at the lockfile name is
 * refused up front as `FS_ERROR` rather than mistaken for a held lock.
 */
export async function acquireWriteLock(
  filePath: string,
  boundaryDir?: string,
): Promise<() => Promise<void>> {
  return acquireWriteLockImpl(filePath, "external", boundaryDir);
}

/**
 * Shared acquire core. Module-private so callers cannot opt into the
 * internal-write reentrancy rule — the public surface stays option-free
 * apart from the containment boundary, which is not an opt-in.
 */
async function acquireWriteLockImpl(
  filePath: string,
  kind: LockHolderKind,
  boundaryDir: string | undefined,
): Promise<() => Promise<void>> {
  // Normalise before anything derives from the path: the lockfile sibling, the
  // containment check and the `mkdir -p` must all name the directory the write
  // itself will reach, and it doubles as the lock-table key so two spellings of
  // one file cannot hold the path concurrently. Idempotent on an already
  // absolute path — the shape every caller in this module passes.
  filePath = resolve(filePath);
  if (!isLockingEnabled()) {
    return async () => {
      /* locking is disabled for this process — nothing to release */
    };
  }
  const held = HELD_LOCKS.get(filePath);
  if (held !== undefined && kind === "internal-write" && held.kind === "external") {
    // Nested write inside a held external critical section: the outer holder
    // awaits this write before releasing, so it owns the lock lifecycle.
    return async () => {
      /* the outer scope holds the real lock */
    };
  }
  await reserveInProcessLock(filePath, kind);
  // proper-lockfile needs the lock target's parent to exist; the target itself
  // may not exist yet (first write), so the lockfile sits beside it.
  const lockfilePath = `${filePath}.lock`;
  try {
    // The mkdir below builds this path's parents, and the lockfile lands beside
    // the target, so both follow a planted directory link exactly as the write
    // would. Checked here rather than before the reservation on purpose: the
    // reservation is taken synchronously at call time, which is what makes
    // invocation order decide the winner among concurrent same-path writers.
    await assertWriteTargetContained(filePath, boundaryDir);
    await mkdir(dirname(filePath), { recursive: true });
    // proper-lockfile takes the lock by creating the lockfile as a DIRECTORY,
    // and `mkdir` refuses to follow a final-component symlink. A link planted at
    // the lock name therefore reads as EEXIST — "someone else holds it" — and
    // every write to this target burns the full retry budget before failing as a
    // stale lock, blaming a file that is not what the message says it is. Name
    // the real cause instead; a lock name is never legitimately a link.
    if ((await probeComponent(lockfilePath, filePath))?.isLink === true) {
      throw new EngineError(
        `Refusing to take the write lock for ${filePath}: ${lockfilePath} is a symbolic link. ` +
          `The lock is a directory this process creates and removes, so a link standing in its ` +
          `place blocks every write to this file. Remove ${lockfilePath} and re-run.`,
        { code: "FS_ERROR" },
      );
    }
    const release = await lock(filePath, {
      lockfilePath,
      realpath: false,
      stale: resolveLockStaleMs(),
      retries: {
        retries: LOCK_RETRIES,
        minTimeout: LOCK_RETRY_MIN_MS,
        maxTimeout: LOCK_RETRY_MAX_MS,
        factor: LOCK_RETRY_FACTOR,
      },
    });
    let released = false;
    return async () => {
      if (released) return; // idempotent: a second release call is a no-op
      released = true;
      try {
        await release();
      } finally {
        // Wake queued waiters only after the on-disk lock is gone so their
        // immediate re-acquire cannot collide with our live lockfile.
        releaseInProcessLock(filePath);
      }
    };
  } catch (err) {
    releaseInProcessLock(filePath);
    // proper-lockfile surfaces exhausted retries as ELOCKED.
    if (errnoCode(err) === "ELOCKED") {
      throw new EngineError(
        `Timed out acquiring the write lock on ${filePath} after ` +
          `~${Math.round(LOCK_RETRY_TOTAL_BACKOFF_MS / 1000)}s of retries. Another process is ` +
          `writing to the same file. Re-run once it finishes, or remove a stale ${lockfilePath} ` +
          `if no other process is active.`,
        { code: "LOCK_TIMEOUT", cause: err },
      );
    }
    // The lockfile is a mkdir beside the target, so a write-side errno here
    // (read-only parent, exhausted quota, no permission) is the same failure
    // the writer itself maps — surface the actionable FS_ERROR naming the
    // target instead of a bare `mkdir '….lock'` errno. Reached only after the
    // full retry budget: proper-lockfile's node-retry wrapper retries every
    // error, not just contention, so a permanent failure still waits it out.
    throw mapFsErrno(err, filePath) ?? err;
  }
}

// ── Atomic temp+rename write ───────────────────────────────────────────────

/** Errnos tolerated when fsync-ing a directory fd: platforms/filesystems that
 *  reject the operation (Windows, FAT32, some network mounts) downgrade the
 *  guarantee from "atomic and crash-durable" to "atomic", never to a failure. */
const DIR_SYNC_TOLERATED_ERRNOS = new Set(["EPERM", "ENOTSUP", "EINVAL", "EISDIR", "EBADF"]);

/**
 * Persist a just-renamed directory entry by datasync-ing the PARENT directory
 * of `filePath`. POSIX rename is atomic but the new entry is durable only
 * after the directory itself is synced. Best-effort: tolerated errnos (and an
 * open() rejection on platforms that cannot open a directory fd) are
 * swallowed; unrecognized errnos rethrow.
 */
export async function syncParentDirectory(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  let dh: FileHandle;
  try {
    // A directory fd must be opened read-only; "r+" is rejected on POSIX.
    dh = await open(dir, "r");
  } catch (err) {
    const code = errnoCode(err);
    if (code !== undefined && DIR_SYNC_TOLERATED_ERRNOS.has(code)) return;
    throw err;
  }
  try {
    await dh.datasync();
  } catch (err) {
    const code = errnoCode(err);
    if (code === undefined || !DIR_SYNC_TOLERATED_ERRNOS.has(code)) throw err;
  } finally {
    await dh.close();
  }
}

// ── Directory-identity pinning (TOCTOU) ────────────────────────────────────

/**
 * The kernel's identity for a directory entry: the pair that says "this is the
 * same object", independent of the name any path spells it under.
 *
 * A path is a lookup instruction, not a handle. Between the moment a caller
 * decides a path is SAFE to write and the moment the write lands, another
 * writer can replace a directory on that path with a symlink, and the same
 * textual path then names a different object — outside whatever boundary the
 * caller checked. Nothing in a path-based syscall notices. Pinning (dev, ino)
 * at decision time and re-reading it at mutation time is what binds the two
 * together: the operation either lands in the directory that was checked, or it
 * refuses.
 */
export interface DirectoryIdentity {
  dev: number;
  ino: number;
}

/** True when two pins name the same filesystem object. */
export function sameDirectoryIdentity(a: DirectoryIdentity, b: DirectoryIdentity): boolean {
  return a.dev === b.dev && a.ino === b.ino;
}

/** Read `dir`'s current identity by path. Throws the raw errno when it is gone. */
export async function readDirectoryIdentity(dir: string): Promise<DirectoryIdentity> {
  const info = await stat(dir);
  return { dev: info.dev, ino: info.ino };
}

/** True when `candidate` is `root` or sits underneath it, textually. `join`
 *  supplies the trailing separator so a filesystem root (`/`, `C:\`) compares
 *  as the prefix it already is instead of doubling into `//`. */
function isWithinDir(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(join(root, sep));
}

function pathEscapedBoundary(filePath: string, boundaryDir: string): EngineError {
  return new EngineError(
    `Refusing to write ${filePath}: its parent directory resolves outside ${boundaryDir}. ` +
      `A directory on the path is a symbolic link pointing out of the tree this write is ` +
      `confined to. Remove the link (or re-run against the real directory) — the engine never ` +
      `follows one out of the repository it was pointed at.`,
    { code: "FS_ERROR" },
  );
}

function pathRedirectedByLink(filePath: string, linkPath: string, target: string): EngineError {
  return new EngineError(
    `Refusing to write ${filePath}: the directory ${linkPath} on its path is a symbolic link ` +
      `pointing at ${target}, outside the directory that holds it, so the file would land in a ` +
      `tree its own path does not name. Remove the link (or re-run against the real directory) — ` +
      `the engine never follows one out of the tree it was pointed at. If the link is your own ` +
      `relocation (a home or projects directory moved to another volume), re-run against ` +
      `${target} instead.`,
    { code: "FS_ERROR" },
  );
}

// ── Physical containment of the write path ─────────────────────────────────

/** `realpath`, or `null` when the path cannot be resolved (missing, or a
 *  component that cannot be inspected). Callers fall through to the component
 *  walk, which re-reads the same path — and the walk itself refuses on any
 *  refusal that is not "absent", so a component this function could not resolve
 *  is never quietly treated as one that is not there. */
async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

/**
 * The two errnos that mean "there is nothing here to descend into", and the
 * only two the walk may read as the end of the existing path.
 *
 * `ENOENT` is the component itself being absent. `ENOTDIR` is the absent-parent
 * form of the same fact: a component earlier on the path is a regular file, so
 * everything below it is absent by construction and no `mkdir -p` can build it.
 * Neither can hide a symbolic link — a link that exists answers `lstat`, and a
 * DANGLING one answers it too, because `lstat` does not follow.
 */
const COMPONENT_ABSENT_ERRNOS = new Set(["ENOENT", "ENOTDIR"]);

/**
 * A path this writer had to inspect, whose `lstat` was refused for a reason
 * other than absence.
 *
 * Fail-closed, and the reason is the whole point of the check that calls it:
 * both probe sites ask one question — "is a symbolic link standing here" — and
 * an unanswered question is not a "no". Reading a refusal as absence ends the
 * containment walk early, finishes the remainder of the path LEXICALLY, and
 * hands {@link assertWriteTargetContained} a landing directory that was never
 * resolved — which then compares inside `boundaryDir` and clears a write whose
 * real landing is outside it. One refused `lstat` was enough to reproduce that
 * escape, so the refusal errno is now the answer rather than a shrug.
 *
 * Worded for both sites: `component` is a directory on the write path when the
 * walk raises it, and the lockfile sibling when the acquire does. The errno is
 * named because it is what separates the causes an operator can act on, and the
 * actionable sentence comes from the shared write-side errno vocabulary
 * ({@link mapFsErrno}) so a permission or mount failure is stated in the same
 * words every other write failure states it in.
 */
function pathComponentUninspectable(
  filePath: string,
  component: string,
  err: unknown,
): EngineError {
  const code = errnoCode(err);
  const actionable = mapFsErrno(err, filePath);
  return new EngineError(
    `Refusing to write ${filePath}: the path ${component} could not be inspected` +
      `${code === undefined ? "" : ` (${code})`}, so whether a symbolic link stands in its place ` +
      `is unknown. Reading that refusal as "nothing is there" would resolve the rest of the write ` +
      `path by its spelling alone and clear a write that lands somewhere else. ` +
      (actionable === null ? "" : `${actionable.message} `) +
      `Nothing was written; restore access to ${component} and re-run.`,
    { code: "FS_ERROR", cause: err },
  );
}

/**
 * `lstat` reduced to the one fact the walk needs, or `null` when the component
 * is absent — the signal to stop descending.
 *
 * Absent means exactly {@link COMPONENT_ABSENT_ERRNOS}. Every other errno is a
 * question the filesystem refused to answer, and it REFUSES the write
 * ({@link pathComponentUninspectable}) rather than resolving to `null`, which
 * the walk cannot tell from "not there".
 */
async function probeComponent(
  path: string,
  filePath: string,
): Promise<{ isLink: boolean } | null> {
  try {
    return { isLink: (await lstat(path)).isSymbolicLink() };
  } catch (err) {
    const code = errnoCode(err);
    if (code !== undefined && COMPONENT_ABSENT_ERRNOS.has(code)) return null;
    throw pathComponentUninspectable(filePath, path, err);
  }
}

/**
 * Where a symlinked component points. `realpath` answers for a live link; a
 * DANGLING one has no resolvable target yet still decides where `mkdir -p`
 * would build, so its own text is read and resolved against the real directory
 * holding it.
 */
async function resolveLinkTarget(linkPath: string, realParent: string): Promise<string> {
  const real = await realpathOrNull(linkPath);
  if (real !== null) return real;
  return resolve(realParent, await readlink(linkPath));
}

/** `dir` split into the filesystem root it starts from plus each component
 *  below it, outermost first. */
function pathWalkPlan(dir: string): { root: string; names: string[] } {
  const names: string[] = [];
  let cur = resolve(dir);
  while (dirname(cur) !== cur) {
    names.push(basename(cur));
    cur = dirname(cur);
  }
  names.reverse();
  return { root: cur, names };
}

/**
 * Resolve the directory a write will actually land in, component by component,
 * refusing on the way when `confineToOwnDirectory` is set and a symlinked
 * component points outside the directory that holds it.
 *
 * The walk stops at the first component that does not exist: nothing below it
 * exists either, and `mkdir -p` will build the remainder under the resolved
 * directory reached so far — which is what the returned path names.
 *
 * ABSENT is the only reason it stops. A component whose `lstat` is refused for
 * any other reason throws ({@link probeComponent}), because the alternative is
 * the escape this walk exists to prevent: stopping on an unanswered question
 * finishes the path by its spelling, and a lexical landing sits inside
 * `boundaryDir` whatever the link that was never inspected points at. The
 * refusal reaches every caller of {@link assertWriteTargetContained} — the
 * lock acquire, `safeWriteFile`, the `.bak` sibling, the failure log — as the
 * same `FS_ERROR` a detected escape raises, so no path materialises anything.
 */
async function resolveWriteLanding(
  parentDir: string,
  filePath: string,
  confineToOwnDirectory: boolean,
): Promise<string> {
  const absoluteParent = resolve(parentDir);
  const plan = pathWalkPlan(absoluteParent);
  let lexical = plan.root;
  let real = plan.root;
  for (const name of plan.names) {
    const next = join(lexical, name);
    const info = await probeComponent(next, filePath);
    if (info === null) break;
    if (info.isLink) {
      const target = await resolveLinkTarget(next, real);
      if (confineToOwnDirectory && !isWithinDir(target, real)) {
        throw pathRedirectedByLink(filePath, next, target);
      }
      real = target;
    } else {
      real = join(real, name);
    }
    lexical = next;
  }
  return join(real, relative(lexical, absoluteParent));
}

/**
 * Refuse a write whose path is re-aimed by a symbolic link standing in for one
 * of its directories, BEFORE any byte — or any `mkdir -p` — touches disk.
 *
 * Containment is not opt-in. Two policies, and the caller's knowledge decides
 * which applies:
 *
 * - **`boundaryDir` given.** The caller knows which tree this write belongs to,
 *   so the question is answered exactly: the fully-resolved landing directory
 *   must sit inside that root, itself resolved. Both sides come out of the SAME
 *   resolver so a boundary reached through an ancestor link (`/tmp` →
 *   `/private/tmp`, a projects directory moved to another volume) is compared on
 *   equal terms with the landing instead of failing a spelling mismatch. A link that leaves
 *   its own directory but stays inside the declared root (a monorepo pointing
 *   `.cursor/rules` at a shared directory) is legitimate, and only the caller
 *   can say so.
 * - **No `boundaryDir`.** No root is known, so the rule is local and structural:
 *   a directory component that is a symlink may not resolve outside the
 *   directory that holds it. The one shape that passes without leaving anything
 *   is a component directly under the filesystem root (`/var` → `/private/var`),
 *   because every absolute target is inside `/` — which is what keeps a host's
 *   system links working. Nothing else is exempt, and a same-name ancestor is
 *   not: a genuine relocation (`~/Projects` → `/Volumes/ext/Projects`) and a
 *   planted redirect that keeps the final component (`repo/.claude` →
 *   `~/.claude`) are the same path shape, so admitting the first admits the
 *   second — an out-of-repo write of engine content to a location the attacker
 *   chose. A user whose tree really does sit behind a relocated ancestor gets
 *   the write back by declaring the boundary (the bullet above resolves both
 *   sides, so it holds) or by spelling the path the link resolves to; both are
 *   statements about which tree the write belongs to, which is precisely what
 *   this branch does not have.
 *
 * A pre-existing link is the case the (dev, ino) pin structurally cannot cover:
 * `stat` follows the link and pins the REDIRECTED directory, so the re-read
 * before the rename re-proves the escape instead of catching it. This check
 * runs on the path as spelled and is what makes the pin's guarantee mean
 * "the directory you meant".
 */
export async function assertWriteTargetContained(
  filePath: string,
  boundaryDir?: string,
): Promise<void> {
  const parentDir = resolve(dirname(filePath));
  if (boundaryDir === undefined) {
    // A parent whose realpath is its own spelling has no link anywhere on its
    // chain, so nothing can have redirected it and the walk has nothing to find.
    if ((await realpathOrNull(parentDir)) === parentDir) return;
    await resolveWriteLanding(parentDir, filePath, true);
    return;
  }
  // Both operands are resolved by the same function, which is what keeps them
  // in one namespace. A boundary that does not exist yet (the caller is about to
  // `mkdir -p` into it) has no realpath, and its lexical spelling is not a safe
  // stand-in for one: the landing is resolved through every ancestor link, so on
  // a host where an ancestor IS a link (`/var` → `/private/var`, a projects
  // directory moved to another volume) the two sides land in different
  // namespaces and every write into the boundary is refused. The walk answers
  // for an absent boundary the same way it answers for an absent parent —
  // resolve the ancestors that exist, re-join the tail that does not.
  const boundary = await resolveWriteLanding(boundaryDir, filePath, false);
  const landing = await resolveWriteLanding(parentDir, filePath, false);
  if (!isWithinDir(landing, boundary)) throw pathEscapedBoundary(filePath, boundaryDir);
}

function directorySwappedError(filePath: string): EngineError {
  return new EngineError(
    `Refusing to complete the write of ${filePath}: its parent directory was replaced while ` +
      `the write was in flight, so the file would land in a different directory than the one ` +
      `that was checked. Nothing was written. Re-run once no other process is rewriting this ` +
      `tree.`,
    { code: "FS_ERROR" },
  );
}

/**
 * Pin `dir` by DESCRIPTOR: open it, `fstat` the open descriptor, and return
 * what that read.
 *
 * `stat(dir)` answers "what does this path name at this instant", which is a
 * weaker question than "which object is this": two path reads a syscall apart
 * can name two different directories and agree with each other, because both
 * followed the same freshly-planted link. An `open` resolves the path once and
 * hands back a reference; `fstat` on that reference reports the object the
 * reference holds, with no second lookup for anything to re-aim. The descriptor
 * is closed immediately — what the caller keeps is an identity read off an
 * object rather than off a name, which is what the containment check that runs
 * next is then compared against.
 *
 * ENOENT propagates unchanged: {@link atomicWriteFileUnlocked} reads it as
 * "create the parent and retry". Every other refusal falls back to the path
 * read — a platform that will not open a directory at all (Windows, some
 * network mounts), or a directory that is writable but not readable — so the
 * rework never turns a write that used to succeed into a failure.
 */
async function pinDirectoryIdentity(dir: string): Promise<DirectoryIdentity> {
  let dh: FileHandle;
  try {
    // Read-only: a directory fd cannot be opened writable on POSIX.
    dh = await open(dir, "r");
  } catch (err) {
    if (errnoCode(err) === "ENOENT") throw err;
    return await readDirectoryIdentity(dir);
  }
  try {
    const info = await dh.stat();
    return { dev: info.dev, ino: info.ino };
  } finally {
    await dh.close();
  }
}

/**
 * Pin the directory a write is about to land in, then containment-check the
 * path, then prove the path still names the pinned directory.
 *
 * All three steps, in that order, are the fix for a two-syscall window: with
 * the check first and the pin second, a directory swapped between them was
 * cleared as one object and pinned as another, and {@link assertParentUnchanged}
 * — which re-reads the same path — then agreed with the poisoned pin instead of
 * catching it, so the bytes landed outside `boundaryDir`. Pinning first makes
 * the check the later observation, so a swap ahead of it is what the check
 * inspects; comparing the path against the pin afterwards catches a swap that
 * lands between the two (including a swap-and-restore, where the check sees the
 * original and the pin holds the impostor).
 *
 * ENOENT propagates unchanged from the pin, but only after the containment
 * check has run: the caller answers ENOENT with `mkdir -p`, which builds
 * directories on this very path, so the check that must precede any `mkdir`
 * cannot be skipped just because the parent is absent. A containment failure
 * raised on that branch deliberately replaces the ENOENT — the path is refused,
 * not created.
 */
async function pinWriteParent(
  parentDir: string,
  filePath: string,
  boundaryDir: string | undefined,
): Promise<DirectoryIdentity> {
  let pinned: DirectoryIdentity;
  try {
    pinned = await pinDirectoryIdentity(parentDir);
  } catch (err) {
    if (errnoCode(err) === "ENOENT") await assertWriteTargetContained(filePath, boundaryDir);
    throw err;
  }
  await assertWriteTargetContained(filePath, boundaryDir);
  if (!sameDirectoryIdentity(await readDirectoryIdentity(parentDir), pinned)) {
    throw directorySwappedError(filePath);
  }
  return pinned;
}

/**
 * Refuse when `parentDir` no longer names the object that was pinned.
 *
 * `pinned` is a value, not an option: the only caller reaches this line having
 * already assigned it (a failed pin throws past here), so an "unpinned" arm
 * would be a branch no input can take.
 */
async function assertParentUnchanged(
  parentDir: string,
  pinned: DirectoryIdentity,
  filePath: string,
): Promise<void> {
  let current: DirectoryIdentity;
  try {
    current = await readDirectoryIdentity(parentDir);
  } catch {
    throw directorySwappedError(filePath);
  }
  if (!sameDirectoryIdentity(current, pinned)) throw directorySwappedError(filePath);
}

export interface AtomicWriteOptions {
  /**
   * File permission bits for the written file (e.g. 0o755 for hook scripts).
   * Applied to the temp file at creation, carried through the rename.
   *
   * Omitting it does NOT mean "the writer's default" when the target already
   * exists — see {@link existingFileMode}, which carries the current file's own
   * bits onto its replacement. Pass this only to STATE a mode; leave it unset to
   * keep whatever the operator set.
   */
  mode?: number;
  /**
   * Absolute directory the write must land inside. When set, the parent's
   * fully-resolved landing directory is checked against it before any byte is
   * written, so a symlinked directory on the path is refused rather than
   * followed. Callers that have a containment boundary (a repo root) should
   * pass it: it is both stricter (it refuses a link that stays inside its own
   * directory but leaves the repo) and more permissive where that is correct
   * (it admits a link that leaves its own directory without leaving the repo).
   * Leaving it unset does NOT disable containment — see
   * {@link assertWriteTargetContained} for the rule that applies instead.
   */
  boundaryDir?: string;
}

/**
 * Errnos a rename may lose to WITHOUT the write being wrong — someone else is
 * holding the name for a moment. Every other errno is the write's own answer and
 * is raised on the first attempt.
 *
 * `EACCES` is win32-only, and defensive. The two refusals actually seen there
 * are `ERROR_ACCESS_DENIED` and `ERROR_SHARING_VIOLATION`, which libuv reports
 * as `EPERM` and `EBUSY`; `EACCES` is the third code the same family of access
 * refusals arrives under, and none of the three describes a durable condition on
 * a name this writer created and owns. On POSIX `rename(2)` raises `EACCES` for
 * a directory-permission problem that no amount of waiting clears, so retrying
 * it there would only spend the budget before the same failure.
 */
const RENAME_RETRY_ERRNOS: ReadonlySet<string> =
  process.platform === "win32"
    ? new Set(["EBUSY", "EPERM", "EACCES"])
    : new Set(["EBUSY", "EPERM"]);

/**
 * Waits between rename attempts, in ms. Length is the number of RETRIES; the
 * first attempt is not on the schedule.
 *
 * POSIX keeps the original 50 × 2^attempt / 750 ms budget unchanged.
 * `rename(2)` is defined on the INODE and never loses to a reader, so the only
 * thing left to wait out is a filesystem stall, and a longer budget buys a
 * slower failure rather than a landed write.
 *
 * win32 gets a wider one, because there the contention is structural rather
 * than exceptional: `fs.rename` is `MoveFileExW` with
 * `MOVEFILE_REPLACE_EXISTING`, which has to remove the destination's directory
 * entry, and any handle opened without `FILE_SHARE_DELETE` refuses that — a
 * concurrent reader, the indexer, or the on-access malware scanner that opens
 * every freshly written file on a CI runner. Those holds are short but not
 * sub-second: the concurrent-reader case took ~790 ms on the runs it PASSED —
 * landing on the last of the four retries — and failed two later runs with
 * `EPERM` having spent the 750 ms budget in full, which is a budget sized just
 * under the wait rather than an unlucky test. Eight retries over 3750 ms of base
 * delay outlast a scanner pass; the schedule flattens at 800 ms rather than
 * doubling, to keep the ceiling inside ~4.7 s with jitter.
 */
const RENAME_RETRY_DELAYS_MS: readonly number[] =
  process.platform === "win32" ? [50, 100, 200, 400, 600, 800, 800, 800] : [50, 100, 200, 400];

/**
 * Fraction of a scheduled wait added at random on top of it.
 *
 * Zero on POSIX, so that schedule stays exactly what it documents. On win32 two
 * writers that collided once wait the identical interval and collide again on
 * every retry; spreading each wait by up to a quarter breaks the lockstep. It is
 * added, never subtracted, so the documented wait is a floor and the worst case
 * is a known ceiling rather than an unbounded one.
 */
const RENAME_RETRY_JITTER = process.platform === "win32" ? 0.25 : 0;

/**
 * Longest a rename can spend on retries before giving up: every scheduled wait
 * plus its maximum jitter. Derived rather than written down, so the two cannot
 * drift. 750 ms on POSIX, 4687 ms on win32.
 */
export const RENAME_RETRY_CEILING_MS: number = RENAME_RETRY_DELAYS_MS.reduce(
  (total, wait) => total + wait * (1 + RENAME_RETRY_JITTER),
  0,
);

/** The wait before retry `attempt`, jittered per {@link RENAME_RETRY_JITTER}. */
function renameRetryWaitMs(attempt: number): number | undefined {
  const wait = RENAME_RETRY_DELAYS_MS[attempt];
  if (wait === undefined) return undefined;
  return wait + Math.random() * wait * RENAME_RETRY_JITTER;
}

/** Number of retries the platform's schedule allows, exposed so a test pins the
 *  contract that is actually compiled in rather than a copy of it. */
export const RENAME_RETRY_COUNT: number = RENAME_RETRY_DELAYS_MS.length;

/**
 * Engine token in the temp-file name — `<basename>.tmp.<token><8hex>` — kept in
 * one place so the writer and {@link TMP_SUFFIX_RE} cannot drift apart, and
 * derived from {@link CONTENT_PREFIX} so renaming the engine moves both.
 *
 * The token is what makes {@link sweepOrphanTmpFiles} provably the owner of
 * everything it unlinks. `<basename>.tmp.<8hex>` is a convention several tools
 * share, and the sweep walks the whole repository, so matching the bare shape
 * removed files this engine never wrote once they were a minute old. A cleanup
 * path deleting a stranger's work is the same defect class as a write landing
 * outside the tree, and it is closed the same way — by naming what is ours
 * rather than by guessing from a shape.
 */
const TMP_ENGINE_TOKEN = CONTENT_PREFIX;

/**
 * The permission bits an existing regular file at `filePath` carries, or
 * `undefined` when there are none to carry.
 *
 * Temp+rename publishes a NEW inode, so a write that names no mode landed the
 * writer's default and the replacement lost whatever the operator had set: a
 * file deliberately `chmod 0600` came back `0644` on the next run —
 * world-readable to every other account on the host, with nothing said. That is
 * harm #1 of the shared-name rationale (`./safeWrite.ts::isSharedRegularFile`)
 * reached without any link involved, on an ordinary single-named file, and it
 * belongs here rather than at each writer: every lane that republishes a file's
 * own bytes — the managed merge, the whole-file replace, the reclaim strip, the
 * MCP ownership merge, the manifest and learnings stores — goes through this
 * one function, and a per-caller fix protects the callers someone remembered.
 *
 * `lstat`, not `stat`: a SYMLINK at the target donates nothing. The rename
 * replaces the link with a regular file (the substrate's terminal-symlink
 * contract), so neither the link's own bits — `0777` on most kernels, which
 * would publish the replacement to every account on the host — nor the target's,
 * which belong to a file this write does not touch, are the right answer.
 * Directories and devices are excluded the same way; a rename over one fails on
 * its own terms.
 *
 * Every errno reads as "nothing to preserve" rather than failing the write: the
 * lookup is an enhancement to a write that is about to happen anyway, and a
 * target that cannot be `lstat`ed is one the write itself will refuse for a
 * reason of its own.
 */
async function existingFileMode(filePath: string): Promise<number | undefined> {
  try {
    const entry = await lstat(filePath);
    return entry.isFile() ? entry.mode & 0o777 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Write `filePath` via temp+rename, taking the path's write lock for the
 * duration (see {@link acquireWriteLock}; opt out with STAMITY_LOCK=0).
 * Atomic VISIBILITY comes from the rename — a reader sees the old or the new
 * bytes, never a torn write. Durability is a two-step best-effort fsync: the
 * temp file's data before the rename, the parent directory entry after it.
 *
 * A missing parent directory is created (`mkdir -p` semantics) in every lock
 * mode. Known write-side errnos map to actionable `FS_ERROR`s via
 * `mapFsErrno`; unrecognized errnos rethrow unchanged.
 *
 * Ordering: with locking on, concurrent same-path calls queue and land in
 * invocation order. When opted out, overlapping calls land in UNSPECIFIED
 * order (each rename is still atomic) — callers needing last-write-wins must
 * await writes sequentially.
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  opts?: AtomicWriteOptions,
): Promise<void> {
  filePath = resolve(filePath);
  const release = await acquireWriteLockImpl(filePath, "internal-write", opts?.boundaryDir);
  try {
    await atomicWriteFileUnlocked(filePath, content, opts);
  } finally {
    try {
      await release();
    } catch (releaseErr) {
      // Never mask the write result with a release failure; surface it.
      console.error(
        `Failed to release the write lock on ${filePath}: ${describeError(releaseErr)}`,
      );
    }
  }
}

/**
 * The temp+rename write body of {@link atomicWriteFile} WITHOUT lock
 * acquisition. For callers that already hold the path's write lock across a
 * larger read-merge-write (explicit lock-handle passing — re-acquiring would
 * queue behind their own hold and deadlock). Every other guarantee documented
 * on {@link atomicWriteFile} applies verbatim.
 */
export async function atomicWriteFileUnlocked(
  filePath: string,
  content: string,
  opts?: AtomicWriteOptions,
): Promise<void> {
  // See measure 1 in the module header: `resolve` collapses `..` lexically while
  // the kernel applies it AFTER following a link, so a `link/../real` spelling
  // is checked as one directory and written into another. Normalising first, and
  // deriving the temp path and the pin from the result, removes the divergence —
  // the bytes land where the path text names them.
  filePath = resolve(filePath);
  const parentDir = dirname(filePath);
  const tmpPath = `${filePath}.tmp.${TMP_ENGINE_TOKEN}${randomBytes(4).toString("hex")}`;
  // O_EXCL refuses a pre-planted file at the temp name; O_NOFOLLOW refuses a
  // pre-planted SYMLINK there, which is the form that would redirect the write
  // out of the tree. The random suffix makes the plant unlikely; the flags make
  // it impossible, which is the difference between hard and prevented.
  const TMP_FLAGS = FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW;
  // Resolved lazily and once. Lazily, so the target is not touched before
  // `pinWriteParent` has containment-checked the path; once, because the ENOENT
  // retry below creates the PARENT and so cannot have brought the target into
  // being between the two calls. An explicit `opts.mode` short-circuits it —
  // that caller is stating a mode, not keeping one.
  let modeToKeep: Promise<number | undefined> | undefined;
  const preservedMode = (): Promise<number | undefined> =>
    (modeToKeep ??=
      opts?.mode === undefined ? existingFileMode(filePath) : Promise.resolve(undefined));
  const writeTmp = async (): Promise<void> => {
    const keep = await preservedMode();
    const createMode = opts?.mode ?? keep;
    const handle =
      createMode === undefined
        ? await open(tmpPath, TMP_FLAGS)
        : await open(tmpPath, TMP_FLAGS, createMode);
    try {
      // `open`'s mode argument is masked by the process umask, so a preserved
      // `0664` lands `0644` under a `0022` umask and the "preserved" file comes
      // back with the group-write bit silently dropped. `fchmod` on the open
      // handle sets the exact bits, with no path for anything to be re-aimed
      // between the two calls. Only the PRESERVED case is corrected: an explicit
      // `mode` is a request a caller made without knowing the operator's umask,
      // and widening it past that umask is not this substrate's call to make.
      if (keep !== undefined) await handle.chmod(keep);
      await handle.writeFile(content, "utf-8");
    } finally {
      await handle.close();
    }
  };
  // Not `| undefined`: both arms below either assign it or throw, so every path
  // that reaches the re-read carries a real pin.
  let pinnedParent: DirectoryIdentity;
  try {
    try {
      pinnedParent = await pinWriteParent(parentDir, filePath, opts?.boundaryDir);
      await writeTmp();
    } catch (err) {
      // ENOENT-triggered parent creation keeps the existing-parent hot path
      // free of an existence pre-check; a second failure propagates to the
      // mapped catch below. The pin has already run its containment check on
      // this branch (`pinWriteParent`), so the `mkdir -p` cannot build the
      // remainder of the path through a planted link.
      if (errnoCode(err) !== "ENOENT") throw err;
      await mkdir(parentDir, { recursive: true });
      pinnedParent = await pinWriteParent(parentDir, filePath, opts?.boundaryDir);
      await writeTmp();
    }
    // "r+" so datasync runs on a writable fd — read-only fds raise EPERM/EBADF
    // on some platforms.
    const fh = await open(tmpPath, "r+");
    try {
      await fh.datasync();
    } catch (err) {
      // The rename provides the safety guarantee; data sync is best-effort
      // durability that some filesystems (FAT32, network mounts) reject.
      const code = errnoCode(err);
      if (code !== "EPERM" && code !== "ENOTSUP" && code !== "EINVAL") throw err;
    } finally {
      await fh.close();
    }
    // Last check before the entry becomes visible: the directory both the temp
    // file and the final name resolve through must still be the one that was
    // pinned (and boundary-checked) above. A swap in that window is the whole
    // TOCTOU — caught here, it costs an unlinked temp file instead of a write
    // into someone else's tree.
    await assertParentUnchanged(parentDir, pinnedParent, filePath);
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmpPath, filePath);
        break;
      } catch (err) {
        const code = errnoCode(err);
        const wait =
          code !== undefined && RENAME_RETRY_ERRNOS.has(code)
            ? renameRetryWaitMs(attempt)
            : undefined;
        // `undefined` covers both refusals — an errno that was never transient,
        // and a transient one that has spent the platform's schedule.
        if (wait !== undefined) {
          await new Promise((resolveWait) => setTimeout(resolveWait, wait));
          continue;
        }
        throw err;
      }
    }
    await syncParentDirectory(filePath);
  } catch (err) {
    throw mapFsErrno(err, filePath) ?? err;
  } finally {
    // The temp file is already renamed away on success (ENOENT here is the
    // expected case); anything else left on disk deserves a diagnostic so the
    // operator knows to sweep it.
    try {
      await unlink(tmpPath);
    } catch (unlinkErr) {
      if (errnoCode(unlinkErr) !== "ENOENT") {
        console.error(
          `Failed to remove the temp file ${tmpPath}: ${describeError(unlinkErr)}. ` +
            `Run the orphan temp-file sweep or remove it manually.`,
        );
      }
    }
  }
}

// ── Orphan temp-file sweep ─────────────────────────────────────────────────

/** Regex-safe spelling of {@link TMP_ENGINE_TOKEN}. The token is a plain
 *  identifier today; escaping keeps that a fact about the constant rather than
 *  something the sweep depends on. */
const TMP_TOKEN_PATTERN = TMP_ENGINE_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches `<basename>.tmp.<engine-token><exactly-8-hex>` — the exact shape the
 *  writer produces (4 random bytes → 8 lowercase hex chars). End-anchored and
 *  requiring a non-empty basename so a bare suffix or another tool's 7/9-hex
 *  suffix is never swept; the engine token is what keeps a third party's own
 *  `.tmp.<8hex>` out of the match set entirely. */
const TMP_SUFFIX_RE = new RegExp(String.raw`[^/\\]\.tmp\.${TMP_TOKEN_PATTERN}[0-9a-f]{8}$`);

/** Minimum age before a temp file counts as an orphan. Younger files may be a
 *  live write on another worker; sweeping them would corrupt it. Atomic
 *  writes complete in sub-second, so a minute-old temp file is abandoned. */
const ORPHAN_TMP_MIN_AGE_MS = 60_000;

/** Directories the sweep never descends into: VCS internals and build/test
 *  output are off-limits to managed writes, so pruning them removes both the
 *  full-tree walk cost and the risk of unlinking a dependency's own artifact. */
const SWEEP_SKIP_DIRS = new Set<string>([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
]);

/**
 * Recursively collect files under `dir` matching the writer's temp shape,
 * pruning {@link SWEEP_SKIP_DIRS}. A readdir failure on `dir` itself rethrows
 * (the caller classifies ENOENT); a failure on a nested directory is reported
 * and skipped so one unreadable subtree does not abort the sweep.
 */
async function walkTmpCandidates(dir: string): Promise<string[]> {
  const candidates: string[] = [];
  const stack: Array<{ path: string; top: boolean }> = [{ path: dir, top: true }];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    let dirents;
    try {
      dirents = await readdir(frame.path, { withFileTypes: true });
    } catch (err) {
      if (frame.top) throw err;
      console.error(`Orphan temp-file scan could not read ${frame.path}: ${describeError(err)}`);
      continue;
    }
    for (const ent of dirents) {
      if (ent.isDirectory()) {
        if (!SWEEP_SKIP_DIRS.has(ent.name)) stack.push({ path: join(frame.path, ent.name), top: false });
        continue;
      }
      if (ent.isFile() && TMP_SUFFIX_RE.test(ent.name)) {
        candidates.push(join(frame.path, ent.name));
      }
    }
  }
  return candidates;
}

/** One `.tmp.<engine-token><8hex>` file found by {@link sweepOrphanTmpFiles}. */
export interface OrphanTmpSweepEntry {
  /** Absolute path of the matched temp file. */
  path: string;
  /** Age (now − mtime, ms) when the sweep observed it. */
  ageMs: number;
  /** True when the sweep removed it; false when it is younger than the
   *  threshold (possibly a live write) or the removal failed. */
  removed: boolean;
}

/**
 * Sweep writer temp files under `dir` (recursive, pruned per
 * {@link SWEEP_SKIP_DIRS}): files at or past the age threshold (default 60s —
 * a crash between temp-write and rename orphans them) are removed; younger
 * matches are reported with `removed: false` and left alone, so a live write
 * on another process is never raced. Returns one entry per matched file so
 * the caller can surface a diagnostic; a missing `dir` yields an empty report.
 */
export async function sweepOrphanTmpFiles(
  dir: string,
  opts: { olderThanMs?: number } = {},
): Promise<OrphanTmpSweepEntry[]> {
  const olderThanMs = opts.olderThanMs ?? ORPHAN_TMP_MIN_AGE_MS;
  const nowMs = Date.now();
  let candidates: string[];
  try {
    candidates = await walkTmpCandidates(dir);
  } catch (err) {
    if (errnoCode(err) !== "ENOENT") {
      console.error(`Orphan temp-file sweep could not read ${dir}: ${describeError(err)}`);
    }
    return [];
  }
  const entries: OrphanTmpSweepEntry[] = [];
  for (const path of candidates) {
    let fileStat;
    try {
      fileStat = await stat(path);
    } catch {
      continue; // vanished between readdir and stat — already cleaned up
    }
    const ageMs = nowMs - fileStat.mtimeMs;
    if (ageMs < olderThanMs) {
      entries.push({ path, ageMs, removed: false });
      continue;
    }
    try {
      await unlink(path);
      entries.push({ path, ageMs, removed: true });
    } catch (unlinkErr) {
      console.error(
        `Failed to remove the orphan temp file ${path}: ${describeError(unlinkErr)}. ` +
          `Remove it manually.`,
      );
      entries.push({ path, ageMs, removed: false });
    }
  }
  return entries;
}

/**
 * Human-readable summary of a sweep report; empty string for an empty report
 * so callers can suppress the diagnostic in the common case.
 */
export function formatOrphanTmpSweepDiagnostic(entries: readonly OrphanTmpSweepEntry[]): string {
  if (entries.length === 0) return "";
  const removed = entries.filter((entry) => entry.removed);
  const kept = entries.filter((entry) => !entry.removed);
  const parts: string[] = [];
  if (removed.length > 0) {
    parts.push(
      `Removed ${removed.length} orphan temp file(s) left behind by interrupted writes: ` +
        removed.map((entry) => entry.path).join(", "),
    );
  }
  if (kept.length > 0) {
    parts.push(
      `Left ${kept.length} temp file(s) in place (young enough to be a live write, or not ` +
        `removable): ${kept.map((entry) => entry.path).join(", ")}`,
    );
  }
  return parts.join(". ");
}

/**
 * Advisory check for a likely concurrent in-flight write under `dir`, or
 * `null` when there is no signal. Locking serializes overlapping writes, so
 * this only scans when the run opted out (STAMITY_LOCK=0 or the process-level
 * opt-out) — exactly the runs that can clobber files last-writer-wins. The
 * signal is a temp file YOUNGER than the orphan gate: the writer creates it
 * immediately before its rename, so a fresh one means a writer is mid-flight
 * right now (an aged one is a crash orphan the sweep owns). Best-effort and
 * never throws.
 */
export async function detectConcurrentWriteRisk(dir: string): Promise<string | null> {
  if (isLockingEnabled()) return null;
  const nowMs = Date.now();
  let candidates: string[];
  try {
    candidates = await walkTmpCandidates(dir);
  } catch (err) {
    // An unreadable root is not a contention signal; ENOENT (fresh checkout)
    // stays quiet, anything else gets a diagnostic.
    if (errnoCode(err) !== "ENOENT") {
      console.error(`Concurrent-write check could not read ${dir}: ${describeError(err)}`);
    }
    return null;
  }
  for (const path of candidates) {
    let fileStat;
    try {
      fileStat = await stat(path);
    } catch {
      continue;
    }
    if (nowMs - fileStat.mtimeMs < ORPHAN_TMP_MIN_AGE_MS) {
      return (
        `Another write appears to be in flight (fresh temp file ${path}). Cross-process ` +
        `locking is disabled for this run (STAMITY_LOCK=0 or an explicit opt-out), so ` +
        `concurrent runs can clobber the same files last-writer-wins. Re-enable locking or ` +
        `wait for the other run to finish.`
      );
    }
  }
  return null;
}

// ── Verified backups ───────────────────────────────────────────────────────

/**
 * Verify a just-copied backup against the IN-MEMORY source bytes BEFORE a
 * destructive overwrite proceeds. Two-step: size equality is necessary but
 * not sufficient (a partial copy can land at the same byte count), so SHA-256
 * digests are compared too. Sizes are UTF-8 BYTE lengths, not char counts —
 * multi-byte content would false-fail a char-length compare. Throws
 * `FS_ERROR` naming `operation` on any divergence, so the original is never
 * destroyed while the only recovery copy is bad. `filePath` is the file being
 * protected; it appears in messages only.
 */
export async function verifyBackup(
  filePath: string,
  bakPath: string,
  sourceContent: string,
  operation: string,
): Promise<void> {
  const sourceBytes = Buffer.byteLength(sourceContent, "utf-8");
  const bakStat = await stat(bakPath);
  if (bakStat.size !== sourceBytes) {
    throw new EngineError(
      `Backup verification failed for ${filePath}: source=${sourceBytes} bytes, ` +
        `backup=${bakStat.size} bytes. Aborting ${operation} to prevent data loss.`,
      { code: "FS_ERROR" },
    );
  }
  const sourceHash = createHash("sha256").update(sourceContent, "utf-8").digest("hex");
  const bakHash = createHash("sha256").update(await readFile(bakPath)).digest("hex");
  if (sourceHash !== bakHash) {
    throw new EngineError(
      `Backup verification failed for ${filePath}: SHA-256 mismatch ` +
        `(source=${sourceHash.slice(0, 12)}…, backup=${bakHash.slice(0, 12)}…). ` +
        `Aborting ${operation} to prevent data loss.`,
      { code: "FS_ERROR" },
    );
  }
}

/**
 * Pick a `.bak` path that does NOT overwrite an existing backup: the
 * canonical `<filePath>.bak` when free, otherwise a uniquely-suffixed
 * `<filePath>.bak.<8hex>` so a second recovery cannot clobber the copy the
 * first one wrote. A fresh suffix is drawn on collision, so the returned path
 * is free at return time.
 *
 * "Free" means no directory entry of ANY kind ({@link fileExists} uses `lstat`).
 * A symlink pre-planted at the canonical name counts as occupied even when its
 * target does not exist: a copy onto that name would follow the link and deposit
 * the file's bytes wherever it points, so the suffixed name is drawn instead.
 */
export async function resolveNonClobberingBakPath(filePath: string): Promise<string> {
  const canonical = `${filePath}.bak`;
  if (!(await fileExists(canonical))) return canonical;
  for (;;) {
    const candidate = `${filePath}.bak.${randomBytes(4).toString("hex")}`;
    if (!(await fileExists(candidate))) return candidate;
  }
}
