import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { GitRunner } from "../workspace/git.ts";

/**
 * The plan freshness guard (REQ-FLOW-091, REQ-FLOW-096): has anything a plan
 * read moved since the commit the plan was stamped at?
 *
 * A `reads` path is fresh when `git rev-list --count <stamp>..HEAD -- <path>`
 * is 0, stale `moved` when a commit since the stamp touched it, and stale
 * `missing` when it is not on disk. A stamp that names no commit, or a commit
 * HEAD does not descend from (a stamp rebased away), is `unresolved` and the
 * verdict is stale: nothing can be measured from it.
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
export type StaleReason = "moved" | "missing";

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
  const onDisk = await Promise.all(reads.map(async (path) => exists(join(cwd, path))));
  const missingOnly = (): StalePath[] =>
    reads.flatMap((path, index) => (onDisk[index] === true ? [] : [{ path, reason: "missing" as const }]));

  try {
    const stampSha = resolveCommit(git, cwd, stamp);
    if (stampSha === null || !isAncestor(git, cwd, stampSha, "HEAD")) {
      if (OBJECT_NAME.test(stamp) && isShallow(git, cwd)) {
        throw new GitFailure("the repository is a shallow clone, so the stamp may lie past its fetched history");
      }
      return { verdict: "stale", stale: missingOnly(), exempt: [], unresolved: true };
    }

    const baseSha = exemptionBase(git, cwd, stampSha, opts?.exemptSince);
    const stale: StalePath[] = [];
    const exempt: string[] = [];
    reads.forEach((path, index) => {
      const missing = onDisk[index] !== true;
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
    return { verdict: "stale", stale: missingOnly(), exempt: [], unresolved: false, error: error.message };
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
    if (fields.code === "ETIMEDOUT" || typeof fields.signal === "string") {
      throw new GitFailure(`git ${verb} timed out`, { cause: error });
    }
    if (typeof fields.code === "string") {
      throw new GitFailure(`git ${verb} could not start (${fields.code})`, { cause: error });
    }
    throw new GitFailure(`git ${verb} failed`, { cause: error });
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
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
