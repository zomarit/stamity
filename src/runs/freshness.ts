import { lstat } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import type { GitRunner } from "../workspace/git.ts";

/**
 * The plan freshness guard (REQ-FLOW-091, REQ-FLOW-096): has anything a plan
 * read moved since the commit the plan was stamped at?
 *
 * A `reads` path is fresh when `git rev-list --count <stamp>..HEAD -- <path>`
 * is 0, stale `moved` when a commit since the stamp touched it, and stale
 * `missing` when it is not on disk. Three refusals come before any history
 * count, and no chain base exempts them:
 *
 * - `spelling`: a path not in git's plain form (an empty, `.` or `..` segment,
 *   a leading or trailing separator, an absolute path, a backslash). The walk
 *   and the count would judge two spellings, and git reads a trailing
 *   separator as "folders only", so a count over it is 0 for a file.
 * - `link`: a path that is a symbolic link, lies under one, or names a folder
 *   whose tree at HEAD holds one. Git counts the link's own history, never its
 *   target's, so a count over it cannot see the target move. The link is found
 *   by an `lstat` walk from `cwd`, segment by segment, and by the tree mode at
 *   HEAD (120000), so a checkout that stores links as plain files
 *   (`core.symlinks=false`) is caught too.
 * - `untracked`: a path on disk that HEAD's tree holds as no file, folder or
 *   gitlink (an untracked or ignored file, a path inside a submodule, another
 *   letter case on a case-insensitive disk), or a folder HEAD's tree holds
 *   whose disk copy or index holds such an entry below it (a file, a non-empty
 *   folder, a nested repository; ignored ones, and ones only staged or added
 *   with intent-to-add, too). Git counts 0 for that content forever.
 *
 * A stamp that names no commit, or a commit HEAD does not descend from (a
 * stamp rebased away), is `unresolved` and the verdict is stale: nothing can
 * be measured from it.
 *
 * A plan chain passes `exemptSince`, the chain's run base (`Base:`), never the
 * plans' stamp. A moved path is then exempt only when
 * `git rev-list --count <stamp>..<exemptSince> -- <path>` is 0, so every commit
 * that moved it lies after the base — the chain's own earlier files. A path
 * missing on disk counts as moved when a commit since the stamp touched it (an
 * earlier file of the chain deleted or renamed it), and is exempt on the same
 * rule; one no commit since the stamp touched stays `missing`. A commit
 * between the stamp and the base keeps it stale. The exemption is granted only
 * where the base is a commit that descends from the stamp and that HEAD
 * descends from; any other base exempts nothing, so a base older than the
 * stamp or off HEAD's history cannot widen it.
 *
 * Every path is one argv entry after `--`, read literally
 * (`--literal-pathspecs`, as `../merge/safeWrite.ts` runs it): a space or a
 * glob character in a path is part of its name. A stamp or a base is passed to
 * git only once it reads as a hexadecimal object name, so neither can be taken
 * for an option. The runner is the caller's: the CLI passes its hardened one
 * (`../cli/engine/gitStatus.ts::gitCheckRunner`). Only git's own "no" (exit
 * status 1 from `rev-parse --verify --quiet` or `merge-base --is-ancestor`)
 * is read as an answer. Any other failure — another exit status, a timeout, no
 * git, the runner's bare-layout refusal — and a stamp git cannot find in a
 * shallow clone are reported in `error` with their reason, the verdict stale
 * and `unresolved` false: the stamp was not shown wrong, nothing was measured.
 *
 * Erasable syntax only, as the rest of `src/runs`.
 */

/** Why a read path is stale. */
export type StaleReason = "moved" | "missing" | "link" | "spelling" | "untracked";

/** One stale read path. */
export interface StalePath {
  path: string;
  reason: StaleReason;
}

/** The guard's verdict over one plan's `reads`. */
export interface FreshnessResult {
  verdict: "fresh" | "stale";
  stale: StalePath[];
  /** Paths that moved only after `exemptSince`, in `reads` order. */
  exempt: string[];
  /** True when the stamp names no commit HEAD descends from. */
  unresolved: boolean;
  /** Set when git failed rather than answered; the verdict is then stale and nothing was measured. */
  error?: string;
}

/** A full or abbreviated object name; sha-256 repositories included. */
const OBJECT_NAME = /^[0-9a-f]{7,64}$/i;

/** What the walk finds along a read path: the path itself, a missing segment, a link on the way, or a spelling it never walks. */
type DiskState = "present" | "missing" | "link" | "spelling";

/**
 * What HEAD's tree holds at a read path: a file, a folder or a gitlink; a link at, above or below it; a folder
 * whose disk copy or index holds entries outside the tree; or nothing.
 */
type TreeState = "tracked" | "link" | "untracked" | "absent";

const LINK_MODE = "120000";
const TREE_MODE = "040000";
const GITLINK_MODE = "160000";

/**
 * Check `reads` against `stamp` in the repository at `cwd`.
 */
export async function freshness(
  git: GitRunner,
  cwd: string,
  stamp: string,
  reads: string[],
  opts?: { exemptSince?: string },
): Promise<FreshnessResult> {
  const onDisk = await Promise.all(reads.map(async (path): Promise<DiskState> => (plainPath(path) ? diskState(cwd, path) : "spelling")));
  const diskOnly = (): StalePath[] =>
    reads.flatMap((path, index) => {
      const state = onDisk[index];
      return state === undefined || state === "present" ? [] : [{ path, reason: state }];
    });

  try {
    const stampSha = resolveCommit(git, cwd, stamp);
    if (stampSha === null || !isAncestor(git, cwd, stampSha, "HEAD")) {
      if (OBJECT_NAME.test(stamp) && isShallow(git, cwd)) {
        throw new GitFailure("the repository is a shallow clone, so the stamp may lie past its fetched history");
      }
      return { verdict: "stale", stale: diskOnly(), exempt: [], unresolved: true };
    }

    const baseSha = exemptionBase(git, cwd, stampSha, opts?.exemptSince);
    const stale: StalePath[] = [];
    const exempt: string[] = [];
    reads.forEach((path, index) => {
      const state = onDisk[index];
      if (state === "spelling" || state === "link") {
        stale.push({ path, reason: state });
        return;
      }
      const tree = treeState(git, cwd, path);
      if (tree === "link" || tree === "untracked" || (tree === "absent" && state === "present")) {
        stale.push({ path, reason: tree === "link" ? "link" : "untracked" });
        return;
      }
      const missing = state !== "present";
      if (countCommits(git, cwd, `${stampSha}..HEAD`, path) === 0) {
        if (missing) stale.push({ path, reason: "missing" });
        return;
      }
      if (baseSha !== null && countCommits(git, cwd, `${stampSha}..${baseSha}`, path) === 0) {
        exempt.push(path);
        return;
      }
      stale.push({ path, reason: missing ? "missing" : "moved" });
    });

    return { verdict: stale.length === 0 ? "fresh" : "stale", stale, exempt, unresolved: false };
  } catch (error) {
    if (!(error instanceof GitFailure)) throw error;
    return { verdict: "stale", stale: diskOnly(), exempt: [], unresolved: false, error: error.message };
  }
}

/** A git call that failed rather than answered; caught in {@link freshness} and reported in `error`. */
class GitFailure extends Error {}

/**
 * Run one git call, throwing {@link GitFailure} with its reason on any failure.
 * With `noOnStatus1`, git's exit status 1 is its answer "no" and returns null.
 */
function runGit(git: GitRunner, cwd: string, args: readonly string[], noOnStatus1: boolean): string | null {
  try {
    return git(args, cwd);
  } catch (error) {
    const fields = (typeof error === "object" && error !== null ? error : {}) as {
      status?: unknown;
      code?: unknown;
      signal?: unknown;
      keptFromGit?: unknown;
    };
    const verb = args.find((arg) => !arg.startsWith("-")) ?? "";
    if (fields.keptFromGit === true) {
      const reason = `git ${verb} was not started: the folder has the layout of a bare repository`;
      throw new GitFailure(reason, { cause: error });
    }
    if (fields.status === 1 && noOnStatus1) return null;
    if (typeof fields.status === "number") {
      throw new GitFailure(`git ${verb} exited ${fields.status}`, { cause: error });
    }
    // Node stops a child past the runner's output bound with a signal; that is not a timeout.
    if (fields.code === "ENOBUFS") {
      throw new GitFailure(`git ${verb} printed more than the runner reads`, { cause: error });
    }
    if (fields.code === "ETIMEDOUT" || typeof fields.signal === "string") {
      throw new GitFailure(`git ${verb} timed out`, { cause: error });
    }
    if (typeof fields.code === "string") {
      throw new GitFailure(`git ${verb} could not start (${fields.code})`, { cause: error });
    }
    throw new GitFailure(`git ${verb} failed`, { cause: error });
  }
}

/**
 * Walk `path` from `cwd` one segment at a time with `lstat`, which never follows
 * a link: the first segment that is a symbolic link makes it `link`, the first
 * one absent makes it `missing`.
 */
async function diskState(cwd: string, path: string): Promise<DiskState> {
  const segments = path.split("/");
  const prefixes = segments.map((_, index) => join(cwd, ...segments.slice(0, index + 1)));
  const stats = await Promise.all(prefixes.map(async (prefix) => lstat(prefix).catch(() => null)));
  for (const stat of stats) {
    if (stat === null) return "missing";
    if (stat.isSymbolicLink()) return "link";
  }
  return "present";
}

/**
 * Whether `path` is in git's plain form, as `git ls-files` prints it: `/`-separated, relative, no
 * backslash, and no empty, `.` or `..` segment (which also refuses a leading or trailing separator).
 */
function plainPath(path: string): boolean {
  if (path.includes("\\") || posix.isAbsolute(path) || win32.isAbsolute(path)) return false;
  return path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Read HEAD's tree at a plain `path`: one recursive listing gives the folders above it, the entry
 * itself and, for a folder, every entry below it. A folder holding no link is then listed on disk
 * and in the index ({@link untrackedBelow}), since a history count never sees what the tree does
 * not hold. Where the entry is absent, the first segment the listing does not reach as a folder is
 * looked up alone, since a link above the path hides it.
 */
function treeState(git: GitRunner, cwd: string, path: string): TreeState {
  const entries = listTree(git, cwd, ["-r", "-t"], path);
  const mode = entries.get(path);
  if (mode === LINK_MODE) return "link";
  if (mode === TREE_MODE) {
    for (const [name, entryMode] of entries) if (entryMode === LINK_MODE && name.startsWith(`${path}/`)) return "link";
    return untrackedBelow(git, cwd, path) ? "untracked" : "tracked";
  }
  if (mode === GITLINK_MODE || mode?.startsWith("100") === true) return "tracked";
  if (mode !== undefined) return "absent";
  const segments = path.split("/");
  for (let index = 1; index < segments.length; index += 1) {
    const prefix = segments.slice(0, index).join("/");
    if (entries.get(prefix) === TREE_MODE) continue;
    return listTree(git, cwd, [], prefix).get(prefix) === LINK_MODE ? "link" : "absent";
  }
  return "absent";
}

/** `git ls-tree -z HEAD -- <path>` with `flags`, read literally, as a map from each listed name to its mode. */
function listTree(git: GitRunner, cwd: string, flags: readonly string[], path: string): Map<string, string> {
  const output = runGit(git, cwd, ["--literal-pathspecs", "ls-tree", ...flags, "-z", "HEAD", "--", path], false) ?? "";
  const entries = new Map<string, string>();
  for (const record of output.split("\0")) {
    const tab = record.indexOf("\t");
    if (tab !== -1) entries.set(record.slice(tab + 1), record.slice(0, record.indexOf(" ")));
  }
  return entries;
}

/**
 * Whether the folder `path` holds any entry HEAD's tree does not, in two literal reads. First the disk against
 * the index: `git ls-files --others` with no exclude option, so ignored entries count too. `--directory` lists
 * an untracked folder as one entry, so the output stays small under a large one, and `--no-empty-directory`
 * leaves out a folder holding no file, which git could not record. A nested repository is listed as one entry.
 * Then the index against HEAD: `git diff-index --cached --diff-filter=A`, the entries the index holds and HEAD's
 * tree does not (staged, or added with intent-to-add), which the first read counts as tracked. Only whether a
 * read prints anything is used; one past the runner's output bound fails, as any other git failure.
 */
function untrackedBelow(git: GitRunner, cwd: string, path: string): boolean {
  const others = ["--literal-pathspecs", "ls-files", "--others", "--directory", "--no-empty-directory", "-z", "--", path];
  if ((runGit(git, cwd, others, false) ?? "") !== "") return true;
  const added = ["--literal-pathspecs", "diff-index", "--cached", "--name-only", "--diff-filter=A", "-z", "HEAD", "--", path];
  return (runGit(git, cwd, added, false) ?? "") !== "";
}

/** The full sha `name` resolves to as a commit, or null when it names none (`--quiet` exits 1). */
function resolveCommit(git: GitRunner, cwd: string, name: string): string | null {
  if (!OBJECT_NAME.test(name)) return null;
  const output = runGit(git, cwd, ["rev-parse", "--verify", "--quiet", `${name}^{commit}`], true);
  if (output === null) return null;
  const sha = output.trim();
  if (!OBJECT_NAME.test(sha)) throw new GitFailure(`git rev-parse printed ${JSON.stringify(sha)}, not an object name`);
  return sha;
}

/** `git merge-base --is-ancestor` exits 1 when not an ancestor; any other failure throws. */
function isAncestor(git: GitRunner, cwd: string, ancestor: string, descendant: string): boolean {
  return runGit(git, cwd, ["merge-base", "--is-ancestor", ancestor, descendant], true) !== null;
}

/** Whether the repository is a shallow clone, where a missing stamp proves nothing. */
function isShallow(git: GitRunner, cwd: string): boolean {
  return runGit(git, cwd, ["rev-parse", "--is-shallow-repository"], false)?.trim() === "true";
}

/** The base an exemption is measured from, or null when none is granted. */
function exemptionBase(
  git: GitRunner,
  cwd: string,
  stampSha: string,
  exemptSince: string | undefined,
): string | null {
  if (exemptSince === undefined) return null;
  const baseSha = resolveCommit(git, cwd, exemptSince);
  if (baseSha === null) return null;
  if (!isAncestor(git, cwd, stampSha, baseSha)) return null;
  if (!isAncestor(git, cwd, baseSha, "HEAD")) return null;
  return baseSha;
}

function countCommits(git: GitRunner, cwd: string, range: string, path: string): number {
  const args = ["--literal-pathspecs", "rev-list", "--count", range, "--", path];
  const output = (runGit(git, cwd, args, false) ?? "").trim();
  const count = Number(output);
  if (!Number.isInteger(count) || count < 0) {
    throw new GitFailure(`git rev-list --count ${range} printed ${JSON.stringify(output)}, not a count.`);
  }
  return count;
}
