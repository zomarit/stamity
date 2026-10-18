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
 * `:(literal)` magic on every path the caller lists after `--`
 * ({@link gitWriteArgs}), so a listed path stages that file and no other (a
 * file named `*.md` is a name, not a pattern). The magic sits on each path
 * rather than in a global `--literal-pathspecs`, because git exports that
 * flag to every hook it runs as `GIT_LITERAL_PATHSPECS=1`, and a repository's
 * pre-commit or pre-push hook that selects files by glob would then match
 * none and pass; per-path magic leaves the hooks in the repository's own
 * pathspec mode;
 * `push.followTags=false`, so a push carries no tag whatever the repository's
 * config says; and `GIT_TERMINAL_PROMPT=0`, so a push that needs credentials
 * fails instead of waiting on a prompt nobody answers.
 *
 * Unlike the read runner it keeps the caller's environment, which is where an
 * attended push finds its credentials (`GIT_ASKPASS`, `GIT_SSH_COMMAND`, a
 * credential helper's own variables), and drops only the variables that would
 * point git at another repository or change how a pathspec is read
 * ({@link gitWriteEnv}). An unattended run's write also drops git's
 * program-valued variables ({@link GIT_PROGRAM_VARIABLES}, REQ-FLOW-122), so
 * its push rests on the pre-flight's rule instead: an https push URL whose
 * credential comes from gh's helper, which the configuration, and the
 * `GIT_CONFIG_*` variables the pre-flight vetted, still name. Its stderr is
 * kept, since a refused push says why there.
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
  /**
   * Text git reads on its stdin, which then ends; omitted, stdin ends at once.
   * A long list goes here rather than on the command line, which Windows caps
   * at 32,767 characters (`--stdin`, pr/49).
   */
  input?: string;
  /**
   * An unattended run's write: git starts without the program-valued
   * variables {@link GIT_PROGRAM_VARIABLES} names (REQ-FLOW-122). Omitted or
   * false, the environment is as for every write.
   */
  unattended?: boolean;
}

/** A push over a slow link is the longest write the run verbs make. */
const GIT_WRITE_TIMEOUT_MS = 120_000;

/** Output a write may print before the call fails; a status or a diff of a large change stays under it. */
const GIT_WRITE_MAX_BUFFER = 32 * 1024 * 1024;

/** The options ahead of every command, in this order. */
const PINNED_OPTIONS: readonly string[] = [
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
 * The variables that set how git reads every pathspec. Under the literal one
 * git reads `:(literal)` as part of the name, so every listed path is refused
 * as matching no file; under the icase one a listed path also stages a file
 * whose name differs only in case. Either one would also reach the
 * repository's hooks and change what they check.
 */
const PATHSPEC_VARIABLES = /^GIT_(?:LITERAL|GLOB|NOGLOB|ICASE)_PATHSPECS$/i;

/**
 * git's environment variables whose value is a program git runs: the set the
 * shell guard's line-wide rule names (`PROGRAM_VARIABLES` in
 * `src/hooks/personOnly.ts`), held here as its own list since the guard module
 * stays self-contained, and kept equal to it by a parity test. An unattended
 * write starts git without them (REQ-FLOW-122): set earlier in a shell that
 * persists, or by the platform, each would run a program inside the run verb's
 * git. `PATH`, `HOME` and `XDG_CONFIG_HOME` stay, a named residual.
 */
export const GIT_PROGRAM_VARIABLES: readonly string[] = [
  "GIT_EDITOR",
  "GIT_SEQUENCE_EDITOR",
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_EXTERNAL_DIFF",
  "GIT_ASKPASS",
  "GIT_PAGER",
  "GIT_PROXY_COMMAND",
  "GIT_EXEC_PATH",
];

/** Whether `key` names one of {@link GIT_PROGRAM_VARIABLES}, in any case, as Windows reads a name. */
function isProgramVariable(key: string): boolean {
  return GIT_PROGRAM_VARIABLES.includes(key.toUpperCase());
}

/** The askpass variable an unattended write sets to the empty string ({@link gitWriteEnv}). */
const ASKPASS = "GIT_ASKPASS";

/** The pathspec magic that makes git read the rest of the argument as a name. */
const LITERAL_MAGIC = ":(literal)";

/**
 * The argument vector git is started with: {@link PINNED_OPTIONS}, then the
 * caller's arguments, each one after the first `--` given {@link LITERAL_MAGIC}.
 *
 * As git reads it, every argument after `--` is a path, so callers pass plain
 * paths there and pass `--` only to commands that take paths after it (not
 * `push`). An option value that is itself `--` goes attached
 * (`--message=--`), or it would be read as the separator. An empty argument
 * stays empty, so git refuses it as it would: with the magic it would match
 * every path.
 */
export function gitWriteArgs(args: readonly string[]): string[] {
  const separator = args.indexOf("--");
  if (separator === -1) return [...PINNED_OPTIONS, ...args];
  const paths = args.slice(separator + 1).map((path) => (path === "" ? path : `${LITERAL_MAGIC}${path}`));
  return [...PINNED_OPTIONS, ...args.slice(0, separator + 1), ...paths];
}

/**
 * The environment a write runs under: `base` (the caller's) without the
 * repository-location variables ({@link LOCATION_VARIABLES}) and the pathspec
 * variables ({@link PATHSPEC_VARIABLES}), credentials and identity kept, and
 * `GIT_TERMINAL_PROMPT=0` whatever `base` says. With `unattended`, also without
 * the program-valued variables ({@link GIT_PROGRAM_VARIABLES}), an empty one
 * included, and with `GIT_ASKPASS` set to the empty string (review/18): git
 * reads a set-but-empty one as "no askpass" and then consults neither
 * `core.askPass` nor `SSH_ASKPASS`, so with the terminal prompt off nothing
 * prompts. The `GIT_CONFIG_*` variables stay, since the pre-flight vetted them.
 */
export function gitWriteEnv(base: NodeJS.ProcessEnv, opts: { unattended?: boolean } = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(base)) {
    if (LOCATION_VARIABLES.test(key) || PATHSPEC_VARIABLES.test(key)) continue;
    if (opts.unattended === true && isProgramVariable(key)) continue;
    env[key] = value;
  }
  if (opts.unattended === true) env[ASKPASS] = "";
  env["GIT_TERMINAL_PROMPT"] = "0";
  return env;
}

/**
 * The names of the program-valued variables `base` sets, an empty value
 * included, in {@link GIT_PROGRAM_VARIABLES}' order: the ones an unattended
 * write removes ({@link gitWriteEnv}), for the verb's text. An empty
 * `GIT_ASKPASS` is left out, since the write starts git with it empty as it
 * was. Names only, never a value.
 */
export function gitProgramVariablesIn(base: NodeJS.ProcessEnv): string[] {
  const rank = (key: string): number => GIT_PROGRAM_VARIABLES.indexOf(key.toUpperCase());
  return Object.entries(base)
    .filter(([key, value]) => value !== undefined && isProgramVariable(key) && !(value === "" && key.toUpperCase() === ASKPASS))
    .map(([key]) => key)
    .toSorted((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Run `git <args>` in `cwd` as a write, `opts.input` on its stdin where given.
 *
 * Resolves whenever git ran to its exit, with that exit status, a non-zero
 * one included: a refused push is an answer the caller words. Resolves with
 * 128 and `keptFromGit` when the look kept the folder from git, with git's own
 * kind of refusal on stderr. Rejects only when git could not be started (no
 * `PATH` entry holds git: Node's `ENOENT` error, no program started) or did not
 * finish (the wall time, the output bound).
 */
export function gitWrite(cwd: string, args: readonly string[], opts: GitWriteOptions = {}): Promise<GitWriteResult> {
  const env = gitWriteEnv(process.env, { unattended: opts.unattended === true });
  if (gitDiscoveryMeetsBareShape(cwd, env)) {
    return Promise.resolve({ code: 128, stdout: "", stderr: `${bareShapeRefusal(cwd)}\n`, keptFromGit: true });
  }
  const argv = gitWriteArgs(args);
  const git = gitProgramFor(cwd, env);
  if (git === null) return Promise.reject(programNotFound("git", "spawn", argv));
  const timeout = opts.timeoutMs ?? GIT_WRITE_TIMEOUT_MS;
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(
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
    );
    const { input } = opts;
    if (input === undefined) {
      child.stdin?.end();
      return;
    }
    // A git that exits before it reads all of `input` closes the pipe: the write's error is not the answer, the
    // exit status the callback above gets is, so the error is taken here and never thrown as an unhandled event.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(input);
  });
}
