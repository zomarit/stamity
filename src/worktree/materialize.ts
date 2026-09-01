import { constants } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readdir, rm, stat, symlink } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { assertWriteTargetContained } from "../merge/atomicWrite.ts";
import { digestFile, type WorktreeReceiptEntry } from "./receipt.ts";

/**
 * Materialization: placing the machine-local files a checkout cannot carry, one
 * entry at a time, with an outcome per entry.
 *
 * **Nothing here checks before it writes.** A `copy` goes through
 * `copyFile(src, dest, COPYFILE_EXCL)` and a `symlink` through `symlink(target,
 * dest)`; both refuse an existing destination AT THE SYSCALL with `EEXIST`,
 * which is reported as `skipped (already present)` — a legitimate outcome for a
 * re-run — and every other errno is a failure. This is the discipline the write
 * substrate already applies to its own temp file (`O_EXCL | O_NOFOLLOW`): the
 * flags make a pre-planted name impossible rather than unlikely, and an
 * `existsSync` before the write cannot tell "this run already did it" from
 * "another process is doing it right now", which is exactly the distinction the
 * report needs.
 *
 * **Modes are stated, not inherited by luck.** A copy carries the source's
 * permission bits explicitly, because a mode that arrives through a umask is a
 * mode nobody chose; a `secret` entry is forced to `0600` regardless of the
 * source's bits, because a `0600` file coming back `0644` is world-readable to
 * every other account on the host with nothing said.
 *
 * **Windows is designed for, and a CI leg now runs the suite there too**
 * [secfix A11]. A symlink refused with `EPERM` or `EACCES` falls back to a
 * copy and SAYS so — a reported fallback, never a silent substitution — and
 * every other errno stays a failure. A secret copy is not mode-hardened
 * there, because the platform has no POSIX mode to harden, and the result
 * says the permissions were left to the platform rather than reporting a
 * tightening that did not happen. The symlink-fallback branch is reached
 * through the injected `platform` and `symlinkImpl` seams on every platform
 * this suite runs on; on the real Windows CI leg it is additionally reached
 * by the live platform itself.
 *
 * Every `await` in a loop here is ordered on purpose, so `no-await-in-loop` is
 * off for the module: entries share parent directories, so two `mkdir` calls
 * racing inside one batch would report an errno that says nothing about the
 * entry it hit, and the directory walk takes its next frame from the current
 * `readdir`. Fanning either out would also open an unbounded number of file
 * handles on a tree the operator never sized. `Promise.all()` is wrong at all
 * of them.
 */
/* oxlint-disable no-await-in-loop */

/** What can actually be performed. `skip` never reaches this module. */
export type MaterializeStrategy = "copy" | "symlink";

/**
 * Per-entry outcome. `absent` (no source to place) and `skipped` (destination
 * already present) are NOT failures — only `failed` feeds the partial-success
 * contract upstream. `withheld` [secfix A2] is a child of a copied directory
 * whose basename identifies it as a known credential and for which secrets
 * consent was NOT granted this run — nothing was written, unlike `skipped`,
 * where the destination already holds bytes.
 */
export type MaterializeOutcome = "materialized" | "skipped" | "absent" | "failed" | "withheld";

/** One path to place, as the policy resolved it. */
export interface MaterializeRequest {
  /** Repo-relative POSIX path, identical in the source tree and the worktree. */
  readonly relPath: string;
  readonly strategy: MaterializeStrategy;
  /** Forces `0600` on POSIX and a stated residual on win32. */
  readonly secret: boolean;
}

/** Where to read from, where to write to, and the two injected seams. */
export interface MaterializeOptions {
  /** The repository root the entries are read from. */
  readonly sourceRoot: string;
  /** The new worktree's root. Every write is containment-checked against it. */
  readonly worktreeRoot: string;
  /**
   * Platform branch, injected so the win32 posture is testable without a
   * Windows runner. Defaults to the live platform.
   */
  readonly platform?: NodeJS.Platform;
  /**
   * The link syscall, injected so the `EPERM`/`EACCES` fallback and the
   * no-fallback errnos can be exercised: a POSIX `symlink(2)` into a writable
   * directory cannot be made to raise either on demand.
   */
  readonly symlinkImpl?: (target: string, destination: string) => Promise<void>;
  /**
   * Longest-prefix carve-outs, for a directory entry whose subtree carries a
   * `skip` override. Injected rather than resolved here so this module never
   * has to read the policy document.
   */
  readonly isSkipped?: (relPath: string) => boolean;
  /**
   * [secfix A2] Identity check for a child discovered while expanding a
   * copied DIRECTORY: true when the child's basename is one this repository
   * treats as a live credential, whatever the parent row's own `secret` flag
   * says. Injected the same way `isSkipped` is — this module never reads the
   * policy document — so a `copy` row naming an ordinary directory that
   * happens to contain `.env.mcp` elevates that ONE child to the same
   * treatment a top-level secret row gets: forced `0600`, and — when
   * {@link secretsGranted} is not `true` — withheld rather than copied.
   */
  readonly isKnownCredential?: (relPath: string) => boolean;
  /**
   * [secfix A2] Whether this run has consent to copy secret material. Read
   * only for a child elevated by {@link isKnownCredential}; a row already
   * marked `secret` by the caller is unaffected — the consent decision for
   * those already happened one layer up, before `materializeEntries` was
   * ever called.
   */
  readonly secretsGranted?: boolean;
}

/** One entry's result. The report and the receipt are both built from these. */
export interface MaterializeResult {
  readonly relPath: string;
  /** The strategy the policy asked for. */
  readonly requested: MaterializeStrategy;
  /** The strategy actually performed — a fallback records `copy`. */
  readonly strategy: MaterializeStrategy;
  readonly outcome: MaterializeOutcome;
  /** Human-readable detail: the skip reason, or the failure's message. */
  readonly reason?: string;
  /** Octal mode string of what is at the destination, where the platform has one. */
  readonly mode?: string;
  /** Digest of the bytes at the destination. Absent for a symlink. */
  readonly sha256?: string;
  /** Set when a refused symlink was copied instead. */
  readonly fallbackFrom?: "symlink";
  /** libuv errno for a failure, when the failure carried one. */
  readonly errno?: string;
  /** Present for a `secret` entry: whether `0600` was actually applied. */
  readonly secretModeApplied?: boolean;
}

const SECRET_FILE_MODE = 0o600;

/** Errnos that mean "this platform will not make a link", not "the write failed". */
const SYMLINK_FALLBACK_ERRNOS: ReadonlySet<string> = new Set(["EPERM", "EACCES"]);

/**
 * Materializes every request, in order, and returns one result per placed path.
 *
 * A directory named by a `copy` row is expanded to its files first, so the
 * strategy applies to the whole subtree and each file gets its own digest in
 * the receipt — a single row for a directory would have no digest, and cleanup
 * would then keep the whole tree as unverifiable. Sequential rather than
 * parallel: entries share parent directories, and one `mkdir` race inside a
 * batch would report an errno that says nothing about the entry it hit.
 */
export async function materializeEntries(
  requests: readonly MaterializeRequest[],
  opts: MaterializeOptions,
): Promise<MaterializeResult[]> {
  const results: MaterializeResult[] = [];
  for (const request of requests) {
    const expanded = await expandRequest(request, opts);
    if (expanded === null) {
      results.push(await materializeEntry(request, opts));
      continue;
    }
    if (
      expanded.requests.length === 0 &&
      expanded.failures.length === 0 &&
      expanded.withheld.length === 0
    ) {
      results.push({
        relPath: request.relPath,
        requested: request.strategy,
        strategy: request.strategy,
        outcome: "skipped",
        reason: "every path under this directory is skipped by the policy",
      });
      continue;
    }
    for (const child of expanded.requests) results.push(await materializeEntry(child, opts));
    // [secfix A6a] Reported as failed ROWS, not thrown: an unreadable
    // subdirectory must not discard the sibling files this same directory row
    // already collected and materialized above.
    results.push(...expanded.failures);
    // [secfix A2] A withheld credential child: nothing was written, and
    // `receiptEntryFor` (below) excludes `outcome: "withheld"` the same way it
    // already excludes `absent` and `failed` — no receipt row for bytes that
    // were never placed.
    results.push(...expanded.withheld);
  }
  return results;
}

/**
 * The files under a `copy` row that names a directory, or null when the request
 * is not one (a file, a symlink row, or an absent source — each of which
 * {@link materializeEntry} answers on its own).
 *
 * `failures` carries one row per subdirectory the walk could not enumerate —
 * [secfix A6a] an unreadable subdirectory used to throw out of this function
 * and escape {@link materializeEntries} entirely, discarding every result the
 * batch had already collected, siblings included. The walk instead reports it
 * and keeps going, the same "returned, not thrown" contract REQ-WORKTREE-011
 * asks of a failure past the point real work has already landed.
 */
async function expandRequest(
  request: MaterializeRequest,
  opts: MaterializeOptions,
): Promise<{
  requests: MaterializeRequest[];
  failures: MaterializeResult[];
  withheld: MaterializeResult[];
} | null> {
  if (request.strategy !== "copy") return null;
  let entry;
  try {
    entry = await lstat(join(opts.sourceRoot, request.relPath));
  } catch {
    // An unreadable source is materializeEntry's answer to give (`absent`, or a
    // failure carrying the errno); expansion has nothing to say about it.
    return null;
  }
  if (!entry.isDirectory()) return null;

  const collected: MaterializeRequest[] = [];
  const failures: MaterializeResult[] = [];
  const withheld: MaterializeResult[] = [];
  const walk = async (relDir: string): Promise<void> => {
    let children;
    try {
      children = await readdir(join(opts.sourceRoot, relDir), { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      failures.push({
        relPath: relDir,
        requested: request.strategy,
        strategy: request.strategy,
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
        ...(code === undefined ? {} : { errno: code }),
      });
      return;
    }
    for (const child of children) {
      const relPath = posix.join(relDir, child.name);
      if (opts.isSkipped?.(relPath) === true) continue;
      // A symlink child is NOT copied: `copyFile` would follow it and stamp the
      // link's 0777 (or the target's) onto bytes the operator never chose that
      // mode for, and a link's provenance inside a copied credential directory
      // is exactly the ambiguity this lane refuses. It is skipped, not
      // followed. (materialize.ts header: "a mode nobody chose".)
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) {
        await walk(relPath);
        continue;
      }
      // [secfix A2] A child whose basename identifies it as a known
      // credential gets EXACTLY the treatment a top-level secret row gets,
      // whatever the parent directory row's own `secret` flag says: elevated
      // and forced to `0600` when this run has consent, or withheld — never
      // copied, never silently inherited as non-secret — when it does not.
      const elevated = request.secret || opts.isKnownCredential?.(relPath) === true;
      if (elevated && !request.secret && opts.secretsGranted !== true) {
        withheld.push({
          relPath,
          requested: "copy",
          strategy: "copy",
          outcome: "withheld",
          reason: "this run had no consent to copy secret material (--copy-secrets)",
        });
        continue;
      }
      collected.push({ relPath, strategy: "copy", secret: elevated });
    }
  };
  await walk(request.relPath);
  return { requests: collected, failures, withheld };
}

/**
 * Depth-first search under `sourceRoot`/`relDir` for the first file whose
 * basename `isKnownCredential` accepts. [secfix S1-W6] Used only by
 * {@link placeSymlink}'s pre-flight refusal — a `copy` row's own credential
 * scan ({@link expandRequest}'s walk) exists to ELEVATE a matching child, not
 * merely to detect one, and stays separate rather than sharing this helper.
 *
 * Deliberately ignores `isSkipped`: a `skip` carve-out excludes a path from a
 * `copy` row's file-by-file walk, but a `symlink` row exposes its whole
 * subtree as one link regardless of any carve-out declared for a path inside
 * it — honouring `isSkipped` here would let a policy row that protects
 * nothing under a link still suppress this refusal. Symlink children are
 * skipped, the same as the `copy` walk, so a cycle through a linked sibling
 * cannot recurse forever.
 *
 * [security round-3 M3] This scan answers for the subtree AS IT STANDS AT
 * SETUP, once. A symlink row that clears it remains a STANDING alias into a
 * live directory — unlike a `copy`, nothing here re-checks it later, and a
 * file added to that directory after setup (a credential dropped in by a
 * later tool run, an editor, a second developer) is never scanned again. An
 * operator who meets this refusal once must not conclude a `symlink` row is
 * durably credential-checked; it is checked at THIS moment only.
 */
async function findCredentialInSubtree(
  sourceRoot: string,
  relDir: string,
  isKnownCredential: (relPath: string) => boolean,
): Promise<string | null> {
  let children;
  try {
    children = await readdir(join(sourceRoot, relDir), { withFileTypes: true });
  } catch {
    // An unreadable subtree has nothing for this scan to report; the link
    // attempt itself is what surfaces the read failure.
    return null;
  }
  for (const child of children) {
    const relPath = posix.join(relDir, child.name);
    if (child.isSymbolicLink()) continue;
    if (child.isDirectory()) {
      // oxlint-disable-next-line no-await-in-loop -- depth-first by construction; the next frame depends on this one
      const found = await findCredentialInSubtree(sourceRoot, relPath, isKnownCredential);
      if (found !== null) return found;
      continue;
    }
    if (isKnownCredential(relPath)) return relPath;
  }
  return null;
}

/**
 * Materializes one path. Never throws for an entry-level problem: every failure
 * comes back as `outcome: "failed"` carrying the errno, because a run that
 * created a worktree and then lost one entry has something to report that a
 * throw would drop.
 */
export async function materializeEntry(
  request: MaterializeRequest,
  opts: MaterializeOptions,
): Promise<MaterializeResult> {
  const source = join(opts.sourceRoot, request.relPath);
  const destination = join(opts.worktreeRoot, request.relPath);

  try {
    // Containment first, before a single directory is created: the destination
    // is resolved through every link on its chain and refused if it lands
    // outside the worktree root.
    await assertWriteTargetContained(destination, opts.worktreeRoot);
    await mkdir(dirname(destination), { recursive: true });

    return request.strategy === "symlink"
      ? await placeSymlink(request, source, destination, opts)
      : await placeCopy(request, source, destination, opts, "copy");
  } catch (error) {
    return failure(request, request.strategy, error);
  }
}

async function placeCopy(
  request: MaterializeRequest,
  source: string,
  destination: string,
  opts: MaterializeOptions,
  performed: MaterializeStrategy,
  fallbackFrom?: "symlink",
): Promise<MaterializeResult> {
  const fallback = fallbackFrom === undefined ? {} : { fallbackFrom };

  let sourceMode: number;
  try {
    const link = await lstat(source);
    if (link.isSymbolicLink()) {
      // `copyFile` FOLLOWS a symlink source, so the bytes that land are the
      // target's and the mode that describes them must be the TARGET's real
      // mode — never the link's own 0777, which is "a mode nobody chose" (see
      // the header). If the target is missing, the mode never gets applied:
      // `copyFile` below follows the dangling link and reports the real ENOENT
      // as a FAILURE, which is a different fact from an absent source.
      sourceMode = await stat(source).then((entry) => entry.mode & 0o777, () => SECRET_FILE_MODE);
    } else {
      sourceMode = link.mode & 0o777;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        relPath: request.relPath,
        requested: request.strategy,
        strategy: performed,
        outcome: "absent",
        reason: `${source} is not present, so there was nothing to place`,
        ...fallback,
      };
    }
    throw error;
  }

  try {
    await copyFile(source, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return await skipExisting(request, destination, opts, performed, fallbackFrom);
    // COPYFILE_EXCL means any file at the destination on a non-EEXIST failure
    // was created by THIS call, so removing it cannot destroy someone else's
    // bytes — and leaving a half-copied credential file behind is the outcome
    // that has to not happen.
    await rm(destination, { force: true }).catch(() => undefined);
    return failure(request, performed, error, fallbackFrom);
  }

  // [m1] `applyMode` chmods the file `copyFile` above just created. A failure
  // here (an unusual filesystem denying `chmod`) must not leave that file
  // stranded: `outcome: "failed"` produces no receipt row
  // ({@link receiptEntryFor}), so bytes landed with no row would be bytes
  // cleanup has no authority over — for the entry this lane copies by
  // default, that is a credential nothing can ever un-place. The same
  // COPYFILE_EXCL reasoning as the copy failure above applies: this call
  // created the file, so removing it here cannot destroy anyone else's bytes.
  let mode: Pick<MaterializeResult, "mode" | "secretModeApplied">;
  try {
    mode = await applyMode(request, destination, sourceMode, opts);
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined);
    return failure(request, performed, error, fallbackFrom);
  }
  return {
    relPath: request.relPath,
    requested: request.strategy,
    strategy: performed,
    outcome: "materialized",
    ...mode,
    ...(await digestOf(destination)),
    ...fallback,
  };
}

async function placeSymlink(
  request: MaterializeRequest,
  source: string,
  destination: string,
  opts: MaterializeOptions,
): Promise<MaterializeResult> {
  // The SOURCE is checked, not the destination: a link whose target does not
  // exist is a dangling link in a fresh worktree, which reports as materialized
  // and works for nobody. The destination is still left to the syscall.
  let sourceIsDirectory: boolean;
  try {
    sourceIsDirectory = (await lstat(source)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        relPath: request.relPath,
        requested: "symlink",
        strategy: "symlink",
        outcome: "absent",
        reason: `${source} is not present, so there was nothing to link`,
      };
    }
    throw error;
  }

  // [secfix S1-W6] A `copy` row over a directory elevates a nested credential
  // by IDENTITY (A2) — a `symlink` row over the same shape must not bypass
  // that by construction. A symlink links its whole subtree as ONE unit, so
  // there is no per-file boundary to elevate or withhold at the way `copy`
  // has: the row is refused OUTRIGHT, before the syscall, naming the file and
  // pointing at `copy` (which DOES have a consent gate) as the route.
  if (sourceIsDirectory && opts.isKnownCredential !== undefined) {
    const credential = await findCredentialInSubtree(opts.sourceRoot, request.relPath, opts.isKnownCredential);
    if (credential !== null) {
      return {
        relPath: request.relPath,
        requested: "symlink",
        strategy: "symlink",
        outcome: "failed",
        reason:
          `${credential} inside this directory is a known credential, and a symlink links its whole ` +
          `subtree as one unit — there is no per-file boundary to gate consent at the way a \`copy\` ` +
          `row has. Set this row's strategy to \`copy\` (with --copy-secrets) so the credential is ` +
          `placed under the same consent gate a top-level secret row gets, or carve it out with a ` +
          `\`skip\` row of its own. This check answers for the directory as it stands right now — a ` +
          `symlink row that later clears it stays a standing alias into a live directory, so a file ` +
          `added there afterward is never re-checked.`,
      };
    }
  }

  const link = opts.symlinkImpl ?? ((target: string, path: string) => symlink(target, path));
  try {
    await link(source, destination);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") return await skipExisting(request, destination, opts, "symlink");
    if (code === undefined || !SYMLINK_FALLBACK_ERRNOS.has(code)) {
      return failure(request, "symlink", error);
    }
    if (sourceIsDirectory) {
      return {
        relPath: request.relPath,
        requested: "symlink",
        strategy: "symlink",
        outcome: "failed",
        reason:
          `the link was refused with ${code} and ${source} is a directory, so the copy fallback ` +
          `does not apply — a directory copied in place of a link is a duplicated tree the ` +
          `operator never asked for. Set this row's strategy to \`copy\` or \`skip\`.`,
        errno: code,
      };
    }
    return await placeCopy(request, source, destination, opts, "copy", "symlink");
  }

  return {
    relPath: request.relPath,
    requested: "symlink",
    strategy: "symlink",
    outcome: "materialized",
  };
}

/**
 * The EEXIST answer. The destination's bytes are left exactly as they are, and
 * the row still carries the digest and mode of what is THERE — a re-run's
 * receipt replaces its predecessor, so a skipped row that recorded nothing
 * would drop the only teardown authority over a file the first run placed.
 *
 * A secret entry is hardened even on the skip path: an already-present
 * credential file at `0644` is world-readable to every other account on the
 * host, and this lane placed it.
 */
async function skipExisting(
  request: MaterializeRequest,
  destination: string,
  opts: MaterializeOptions,
  performed: MaterializeStrategy,
  fallbackFrom?: "symlink",
): Promise<MaterializeResult> {
  const entry = await lstat(destination);
  const mode =
    entry.isFile() && !entry.isSymbolicLink()
      ? await applyMode(request, destination, entry.mode & 0o777, opts)
      : {};

  return {
    relPath: request.relPath,
    requested: request.strategy,
    strategy: performed,
    outcome: "skipped",
    reason: "already present",
    ...mode,
    ...(performed === "copy" ? await digestOf(destination) : {}),
    ...(fallbackFrom === undefined ? {} : { fallbackFrom }),
  };
}

/**
 * States the destination's mode. A secret entry is forced to `0600`; anything
 * else is set to the source's own bits, so a umask cannot quietly widen or
 * narrow what was copied.
 *
 * On win32 nothing is attempted: the platform has no POSIX mode, so a `chmod`
 * there would report a tightening it did not perform. The result says so
 * instead.
 */
async function applyMode(
  request: MaterializeRequest,
  destination: string,
  sourceMode: number,
  opts: MaterializeOptions,
): Promise<Pick<MaterializeResult, "mode" | "secretModeApplied">> {
  const platform = opts.platform ?? process.platform;
  if (platform === "win32") {
    return request.secret ? { secretModeApplied: false } : {};
  }
  const mode = request.secret ? SECRET_FILE_MODE : sourceMode;
  await chmod(destination, mode);
  return {
    mode: formatMode(mode),
    ...(request.secret ? { secretModeApplied: true } : {}),
  };
}

async function digestOf(destination: string): Promise<Pick<MaterializeResult, "sha256">> {
  const sha256 = await digestFile(destination);
  return sha256 === null ? {} : { sha256 };
}

function formatMode(mode: number): string {
  return `0${(mode & 0o777).toString(8)}`;
}

function failure(
  request: MaterializeRequest,
  performed: MaterializeStrategy,
  error: unknown,
  fallbackFrom?: "symlink",
): MaterializeResult {
  const code = (error as NodeJS.ErrnoException).code;
  return {
    relPath: request.relPath,
    requested: request.strategy,
    strategy: performed,
    outcome: "failed",
    reason: error instanceof Error ? error.message : String(error),
    ...(code === undefined ? {} : { errno: code }),
    ...(fallbackFrom === undefined ? {} : { fallbackFrom }),
  };
}

/**
 * The receipt row for one result, or null when there is nothing to invert.
 *
 * `materialized` and `skipped` both produce a row: the skip means the file is
 * present at the destination, and the digest recorded is the digest of what is
 * actually there, so cleanup's gate answers the same question either way.
 * `absent` and `failed` produce nothing — a receipt row is authority to remove,
 * and neither of those placed anything to remove.
 */
export function receiptEntryFor(result: MaterializeResult): WorktreeReceiptEntry | null {
  if (result.outcome !== "materialized" && result.outcome !== "skipped") return null;
  return {
    path: result.relPath,
    strategy: result.strategy,
    ...(result.mode === undefined ? {} : { mode: result.mode }),
    ...(result.sha256 === undefined ? {} : { sha256: result.sha256 }),
  };
}
