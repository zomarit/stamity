import { execFileSync } from "node:child_process";
import type { GitRunner } from "../../workspace/git.ts";

/**
 * Working-tree and history facts, as pure parses over the engine's
 * {@link GitRunner} seam.
 *
 * Same two rules as `src/workspace/git.ts`: parsing takes git output as a
 * string so the grammar tests need no repository, and both readers are total —
 * a missing git binary, a non-repository directory, or an unborn `HEAD` yields
 * `available: false` / `null`, never a throw. Detection over asking: absence
 * is an answer.
 */

/** What `git status` said about a directory's working tree. */
export interface WorkingTreeStatus {
  /** False when git could not answer at all (no binary, not a repository). */
  available: boolean;
  dirty: boolean;
  /** Porcelain entries: one per changed path, a rename counting once. */
  changedCount: number;
}

/** Repository history shape, seeding maturity heuristics. */
export interface HistoryFacts {
  commitCount: number;
  contributorCount: number;
}

/** Ceiling on one probe's wall time; a hung git must not stall the whole run. */
const GIT_FACT_TIMEOUT_MS = 5_000;

/**
 * Parse `git status --porcelain` output. Every non-blank line is exactly one
 * changed entry — porcelain v1 prints a rename (`R  old -> new`) as a single
 * line, so line counting already counts it once. Tolerates CRLF and a
 * trailing newline.
 */
export function parsePorcelainStatus(output: string): { dirty: boolean; changedCount: number } {
  const changedCount = output.split(/\r?\n/).filter((line) => line.trim() !== "").length;
  return { dirty: changedCount > 0, changedCount };
}

/**
 * Read working-tree cleanliness for the sync dirty-tree warning. Total: any
 * git failure collapses to `available: false` with a clean-looking zero count,
 * which callers must read as "unknown", not "clean".
 */
export function readWorkingTreeStatus(cwd: string, runner: GitRunner = execGit): WorkingTreeStatus {
  try {
    return { available: true, ...parsePorcelainStatus(runner(["status", "--porcelain"], cwd)) };
  } catch {
    return { available: false, dirty: false, changedCount: 0 };
  }
}

/**
 * Count contributors out of `git shortlog -sn HEAD` output — lines shaped
 * `<spaces><count><whitespace><name>`. Parsed, not trusted: lines that do not
 * match (stray messages, blanks) are ignored rather than miscounted, and
 * names are opaque — any non-blank UTF-8 name counts.
 */
export function parseShortlogContributors(output: string): number {
  return output.split(/\r?\n/).filter((line) => /^\s*\d+\s+\S/.test(line)).length;
}

/**
 * Read commit and contributor counts for init's maturity seed. Returns `null`
 * whenever history cannot be read — git missing, not a repository, or a
 * zero-commit repo whose `HEAD` names no revision yet. `rev-list` output is
 * validated digit-by-digit: garbage stdout is "unavailable", never `NaN`.
 */
export function readHistoryFacts(cwd: string, runner: GitRunner = execGit): HistoryFacts | null {
  try {
    const countOutput = runner(["rev-list", "--count", "HEAD"], cwd).trim();
    if (!/^\d+$/.test(countOutput)) return null;
    return {
      commitCount: Number.parseInt(countOutput, 10),
      contributorCount: parseShortlogContributors(runner(["shortlog", "-sn", "HEAD"], cwd)),
    };
  } catch {
    return null;
  }
}

/**
 * Default seam, mirroring the construction in `src/workspace/git.ts`:
 * synchronous git, stdout captured, stdin and stderr discarded (`shortlog`
 * must never fall back to reading stdin), bounded wall time.
 */
const execGit: GitRunner = (args, cwd) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: GIT_FACT_TIMEOUT_MS,
  });
