import { execFileSync } from "node:child_process";
import { bareShapeRefusal, gitDiscoveryMeetsBareShape } from "../../merge/safeWrite.ts";
import { gitProgramFor, programNotFound } from "../../shared/programPath.ts";
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
  /**
   * Why git did not answer, where the read knows: `bare-layout` when the look
   * the runner takes before it starts git kept the folder from git
   * ({@link gitCheckRunner}). Absent when git answered, and for every other
   * cause (no binary, no repository, a git too slow for the probe), which the
   * read cannot tell apart.
   */
  reason?: "bare-layout";
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
 *
 * `cwd` is the setup root, and the default runner is {@link execGitCheck}: for
 * a tree git checked out, a folder a repository writer committed in the shape
 * of a bare repository does not answer, but for what that runner's look leaves
 * ({@link gitCheckRunner}), and no configured file-system monitor command runs
 * (review/112).
 * Where that runner's look kept the folder from git, the status says so in its
 * `reason`, so a caller can name that cause and send nobody to run git there.
 */
export function readWorkingTreeStatus(cwd: string, runner: GitRunner = execGitCheck): WorkingTreeStatus {
  try {
    return { available: true, ...parsePorcelainStatus(runner(["status", "--porcelain"], cwd)) };
  } catch (error) {
    const unavailable: WorkingTreeStatus = { available: false, dirty: false, changedCount: 0 };
    return keptFromGit(error) ? { ...unavailable, reason: "bare-layout" } : unavailable;
  }
}

/**
 * True for the error {@link gitCheckRunner} throws when its look keeps a folder
 * from git: no git was started. Exported for a caller that runs the runner
 * itself and words the failure (`gate`, `../commands/gate.ts`), so it names
 * this cause and no git call as failed. The mark is read, never git's message:
 * git's own refusal of such a folder is a text translated by locale.
 */
export function keptFromGit(error: unknown): boolean {
  return error instanceof Error && (error as { keptFromGit?: unknown }).keptFromGit === true;
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
 * The default runner is {@link execGitCheck}, as for the working tree (build/69).
 */
export function readHistoryFacts(cwd: string, runner: GitRunner = execGitCheck): HistoryFacts | null {
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
 * The caller's environment minus every `GIT_*` variable (inside a git hook
 * `GIT_DIR` and `GIT_INDEX_FILE` would point the read at another repository),
 * plus `GIT_OPTIONAL_LOCKS=0`, so `status` never takes the index lock a
 * concurrent git command holds — as the overwrite lane's tracked-and-clean
 * check runs git (`../../merge/safeWrite.ts::gitCheckEnv`).
 */
function gitCheckEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^GIT_/i.test(key)) env[key] = value;
  }
  env["GIT_OPTIONAL_LOCKS"] = "0";
  return env;
}

/**
 * A {@link GitRunner} that can also hand git text on its stdin (`input`), for a
 * list too long for the command line, which Windows caps at 32,767 characters
 * (`--stdin`, pr/49). It is a {@link GitRunner} wherever one is taken; a call
 * with no `input` gives git no stdin, as a {@link GitRunner} call does.
 */
export type GitInputRunner = (args: readonly string[], cwd: string, input?: string) => string;

/**
 * The stdin of a `--stdin` read of every commit `HEAD` reaches and none of
 * `tips` does: `HEAD`, then `^<tip>` for each tip, a line each (pr/49). It
 * stands for `HEAD --not <tips>` on the command line, which a few hundred tips
 * would take past Windows' 32,767 characters; `--ignore-missing` before
 * `--stdin` on the command line skips a tip this clone lacks, as it did there.
 */
export function revisionLines(tips: readonly string[]): string {
  return ["HEAD", ...tips.map((tip) => `^${tip}`), ""].join("\n");
}

/** The bounds one {@link gitCheckRunner} puts on every git call it makes. */
export interface GitCheckRunnerOptions {
  /** Wall time per call; the two readers here keep the 5-second default. */
  timeoutMs?: number;
  /** Bytes of stdout per call before the call fails; omitted keeps Node's default. */
  maxBuffer?: number;
}

/**
 * The hardened git construction, mirroring `src/workspace/git.ts`: synchronous
 * git, argv only, stdout captured, stdin and stderr discarded (`shortlog` must
 * never fall back to reading stdin) unless the call gives `input`, which git
 * then reads on stdin ({@link GitInputRunner}), bounded wall time and output — in
 * {@link gitCheckEnv}, with two options ahead of every command.
 * `safe.bareRepository=explicit` (protected configuration, so honoured from the
 * command line) refuses a committed folder shaped like a bare repository, and
 * `core.fsmonitor=false` runs no file-system monitor command, whatever any
 * config says (`../../merge/safeWrite.ts::runGitCheck`).
 *
 * A git older than 2.38 ignores the first option, so the runner looks before
 * it starts git (`gitDiscoveryMeetsBareShape`): where that look finds git's
 * discovery would meet a folder shaped like a bare repository, no git is
 * started and the call throws as it does when git refuses the folder, exit
 * status 128 included. That error alone is marked `keptFromGit`, which
 * {@link readWorkingTreeStatus} and {@link keptFromGit}'s other callers read.
 * The look holds for a tree git checked out, and what it leaves is said on it
 * (`../../merge/safeWrite.ts::gitDiscoveryMeetsBareShape`).
 *
 * Git is started by an absolute path, the one {@link gitProgramFor} resolves on
 * `PATH` for the working folder, never by its bare name: a file of git's name
 * in the folder git runs in is not the program started, on any platform. Where
 * no `PATH` entry holds git the call throws what Node throws on a machine with
 * no git installed (`ENOENT`, no exit status), and no program is started.
 *
 * Exported so every other git read of the CLI runs the same construction:
 * `gate` (`../commands/gate.ts`) passes its own wider bounds, since a change's
 * diff can outgrow a status probe.
 */
export function gitCheckRunner(options: GitCheckRunnerOptions = {}): GitInputRunner {
  const timeout = options.timeoutMs ?? GIT_FACT_TIMEOUT_MS;
  const { maxBuffer } = options;
  return (args, cwd, input) => {
    if (gitDiscoveryMeetsBareShape(cwd)) {
      throw Object.assign(new Error(bareShapeRefusal(cwd)), { status: 128, keptFromGit: true });
    }
    const env = gitCheckEnv();
    const pinned = ["-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", ...args];
    const git = gitProgramFor(cwd, env);
    if (git === null) throw programNotFound("git", "spawnSync", pinned);
    return execFileSync(git, pinned, {
      cwd,
      env,
      encoding: "utf8",
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
      ...(input === undefined ? {} : { input }),
      timeout,
      ...(maxBuffer === undefined ? {} : { maxBuffer }),
      windowsHide: true,
    });
  };
}

/** The seam both readers run by default: {@link gitCheckRunner} at its 5-second default. */
const execGitCheck: GitRunner = gitCheckRunner();
