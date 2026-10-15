import { lstat } from "node:fs/promises";
import { join } from "node:path";
import type { GitRunner } from "../workspace/git.ts";

/**
 * The plan freshness guard (REQ-FLOW-091, REQ-FLOW-096): has anything a plan
 * read moved since the commit the plan was stamped at?
 *
 * A `reads` path is fresh when `git rev-list --count <stamp>..HEAD -- <path>`
 * is 0, stale `moved` when a commit since the stamp touched it, and stale
 * `missing` when it is not on disk, whatever its history says. A stamp that
 * names no commit, or a commit HEAD does not descend from (a stamp rebased
 * away), is `unresolved` and the verdict is stale: nothing can be measured
 * from it.
 *
 * A plan chain passes `exemptSince`, the chain's run base (`Base:`), never the
 * plans' stamp. A moved path is then exempt only when
 * `git rev-list --count <stamp>..<exemptSince> -- <path>` is 0, so every commit
 * that moved it lies after the base — the chain's own earlier files. A commit
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
 * (`../cli/engine/gitStatus.ts::gitCheckRunner`). A git failure on a resolved
 * stamp is not caught: it rejects the promise, and the caller reads it as
 * unknown.
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

  const stampSha = resolveCommit(git, cwd, stamp);
  if (stampSha === null || !isAncestor(git, cwd, stampSha, "HEAD")) {
    const stale: StalePath[] = [];
    reads.forEach((path, index) => {
      if (onDisk[index] !== true) stale.push({ path, reason: "missing" });
    });
    return { verdict: "stale", stale, exempt: [], unresolved: true };
  }

  const baseSha = exemptionBase(git, cwd, stampSha, opts?.exemptSince);
  const stale: StalePath[] = [];
  const exempt: string[] = [];
  reads.forEach((path, index) => {
    if (onDisk[index] !== true) {
      stale.push({ path, reason: "missing" });
      return;
    }
    if (countCommits(git, cwd, `${stampSha}..HEAD`, path) === 0) return;
    if (baseSha !== null && countCommits(git, cwd, `${stampSha}..${baseSha}`, path) === 0) {
      exempt.push(path);
      return;
    }
    stale.push({ path, reason: "moved" });
  });

  return { verdict: stale.length === 0 ? "fresh" : "stale", stale, exempt, unresolved: false };
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** The full sha `name` resolves to as a commit, or null when it names none. */
function resolveCommit(git: GitRunner, cwd: string, name: string): string | null {
  if (!OBJECT_NAME.test(name)) return null;
  try {
    const sha = git(["rev-parse", "--verify", "--quiet", `${name}^{commit}`], cwd).trim();
    return OBJECT_NAME.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** `git merge-base --is-ancestor` exits 1 when not an ancestor; the runner throws on it. */
function isAncestor(git: GitRunner, cwd: string, ancestor: string, descendant: string): boolean {
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant], cwd);
    return true;
  } catch {
    return false;
  }
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
  const output = git(["--literal-pathspecs", "rev-list", "--count", range, "--", path], cwd).trim();
  const count = Number(output);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`git rev-list --count ${range} printed ${JSON.stringify(output)}, not a count.`);
  }
  return count;
}
