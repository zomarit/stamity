import { execFile } from "node:child_process";
import { bareShapeRefusal, gitDiscoveryMeetsBareShape } from "../../merge/safeWrite.ts";
import { gitProgramFor, programNotFound } from "../../shared/programPath.ts";

/**
 * The engine's one git runner that writes: commits, branch switches and pushes
 * of the run verbs (`stamity run start|checkpoint|end`).
 *
 * It takes the read runner's hardening (`./gitStatus.ts::gitCheckRunner`):
 * git by the absolute path {@link gitProgramFor} resolves on `PATH`, never by
 * its bare name; `safe.bareRepository=explicit` and `core.fsmonitor=false`
 * ahead of every command; and before any of it the look
 * (`gitDiscoveryMeetsBareShape`), so a folder a repository writer committed in
 * the shape of a bare repository starts no git at all. To those it adds
 * `--literal-pathspecs`, so a path the caller lists stages that file and no
 * other (a file named `*.md` is a name, not a pattern), as the setup root's
 * read runner (`../../merge/safeWrite.ts`) reads paths;
 * `push.followTags=false`, so a push carries no tag whatever the repository's
 * config says; and `GIT_TERMINAL_PROMPT=0`, so a push that needs credentials
 * fails instead of waiting on a prompt nobody answers.
 *
 * Unlike the read runner it keeps the caller's environment, which is where a
 * push finds its credentials (`GIT_ASKPASS`, `GIT_SSH_COMMAND`, a credential
 * helper's own variables), and drops only the variables that would point git
 * at another repository or read a path as other than a name
 * ({@link gitWriteEnv}). Its stderr is kept, since a
 * refused push says why there.
 */

/** What one git write answered. */
export interface GitWriteResult {
  /** Git's exit status; 128 when the look kept the folder from git, as git's own refusal of such a folder. */
  code: number;
  stdout: string;
  stderr: string;
  /** Present, and true, only when the look kept the folder from git: no git was started. */
  keptFromGit?: true;
}

/** The bounds of one write. */
export interface GitWriteOptions {
  /** Wall time before the call is stopped; 120 s when omitted. */
  timeoutMs?: number;
}

/** A push over a slow link is the longest write the run verbs make. */
const GIT_WRITE_TIMEOUT_MS = 120_000;

/** Output a write may print before the call fails; a status or a diff of a large change stays under it. */
const GIT_WRITE_MAX_BUFFER = 32 * 1024 * 1024;

/** The options ahead of every command, in this order. */
const PINNED_OPTIONS: readonly string[] = [
  "--literal-pathspecs",
  "-c",
  "safe.bareRepository=explicit",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "push.followTags=false",
];

/**
 * The variables that name a repository, a work tree, an index or an object
 * store other than the one discovery finds from the working folder. Inside a
 * git hook `GIT_DIR` and `GIT_INDEX_FILE` are set, and a write run there would
 * land in that other repository.
 */
const LOCATION_VARIABLES =
  /^GIT_(?:DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|COMMON_DIR|NAMESPACE|PREFIX)$/i;

/**
 * The variables that set how git reads every pathspec. `--literal-pathspecs`
 * sets the literal one itself, and git refuses to start when it meets the
 * glob, noglob or icase one beside it, so a caller's value would turn every
 * write into a refusal.
 */
const PATHSPEC_VARIABLES = /^GIT_(?:LITERAL|GLOB|NOGLOB|ICASE)_PATHSPECS$/i;

/** The argument vector git is started with: {@link PINNED_OPTIONS}, then the caller's arguments unchanged. */
export function gitWriteArgs(args: readonly string[]): string[] {
  return [...PINNED_OPTIONS, ...args];
}

/**
 * The environment a write runs under: `base` (the caller's) without the
 * repository-location variables ({@link LOCATION_VARIABLES}) and the pathspec
 * variables ({@link PATHSPEC_VARIABLES}), credentials and identity kept, and
 * `GIT_TERMINAL_PROMPT=0` whatever `base` says.
 */
export function gitWriteEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (!LOCATION_VARIABLES.test(key) && !PATHSPEC_VARIABLES.test(key)) env[key] = value;
  }
  env["GIT_TERMINAL_PROMPT"] = "0";
  return env;
}

/**
 * Run `git <args>` in `cwd` as a write.
 *
 * Resolves whenever git ran to its exit, with that exit status, a non-zero
 * one included: a refused push is an answer the caller words. Resolves with
 * 128 and `keptFromGit` when the look kept the folder from git, with git's own
 * kind of refusal on stderr. Rejects only when git could not be started (no
 * `PATH` entry holds git: Node's `ENOENT` error, no program started) or did not
 * finish (the wall time, the output bound).
 */
export function gitWrite(cwd: string, args: readonly string[], opts: GitWriteOptions = {}): Promise<GitWriteResult> {
  const env = gitWriteEnv(process.env);
  if (gitDiscoveryMeetsBareShape(cwd, env)) {
    return Promise.resolve({ code: 128, stdout: "", stderr: `${bareShapeRefusal(cwd)}\n`, keptFromGit: true });
  }
  const argv = gitWriteArgs(args);
  const git = gitProgramFor(cwd, env);
  if (git === null) return Promise.reject(programNotFound("git", "spawn", argv));
  const timeout = opts.timeoutMs ?? GIT_WRITE_TIMEOUT_MS;
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      git,
      argv,
      { cwd, env, encoding: "utf8", timeout, maxBuffer: GIT_WRITE_MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error === null) {
          resolvePromise({ code: 0, stdout, stderr });
          return;
        }
        // A number is git's own exit status; a string code (`ENOENT`, the
        // output bound) or a kill by the wall time means git did not finish.
        if (typeof error.code === "number" && error.killed !== true) {
          resolvePromise({ code: error.code, stdout, stderr });
          return;
        }
        rejectPromise(error);
      },
    ).stdin?.end();
  });
}
