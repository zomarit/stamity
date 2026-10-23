import { execFile, spawn } from "node:child_process";
import { setTimeout as sleepFor } from "node:timers/promises";
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
  /**
   * review/179: on POSIX, git starts as the leader of a process group of its own (a new session), and the wall time
   * stops the whole group, its hooks and their children included, a stop then a kill after
   * {@link GROUP_STOP_GRACE_MS}, and waits for it to be gone before the call rejects with
   * {@link GitWriteGroupStopped}. Only the checkpoint's commit passes it. Ignored on Windows, where the call runs as
   * when it is omitted.
   */
  processGroup?: boolean;
}

/**
 * review/179: a {@link GitWriteOptions.processGroup} write the wall time or the output bound stopped, once its group
 * was signalled and waited for. `groupGone` is true only when the wall time stopped it and no process was left in
 * the group by the end of the wait ({@link GROUP_GONE_WAIT_MS}); an output past the bound sets it false whatever the
 * group did, so a caller that clears state on it fails closed there. A process that left the group on purpose (its
 * own `setsid`) is outside what the group shows.
 */
export class GitWriteGroupStopped extends Error {
  /** As Node's own wall-time error names it: the call was stopped, not answered. */
  readonly killed = true;
  readonly signal: NodeJS.Signals = "SIGTERM";
  readonly groupGone: boolean;

  constructor(message: string, groupGone: boolean) {
    super(message);
    this.name = "GitWriteGroupStopped";
    this.groupGone = groupGone;
  }
}

/** A push over a slow link is the longest write the run verbs make. */
const GIT_WRITE_TIMEOUT_MS = 120_000;

/** Output a write may print before the call fails; a status or a diff of a large change stays under it. */
const GIT_WRITE_MAX_BUFFER = 32 * 1024 * 1024;

/** review/179: how long a stopped group is given after the stop before the kill. */
const GROUP_STOP_GRACE_MS = 2_000;

/** review/179: how long, after the kill, the runner waits for the group to be gone before it answers that it is not. */
const GROUP_GONE_WAIT_MS = 10_000;

/** review/179: how often the runner asks whether the group is still there. */
const GROUP_POLL_MS = 25;

/**
 * The options ahead of every command, in this order. review/116: `core.useReplaceRefs=false` beside the
 * `GIT_NO_REPLACE_OBJECTS` variable ({@link gitWriteEnv}), since on git 2.19 to 2.42 a repository's own
 * `core.useReplaceRefs=true` beats the variable, and a command-line key beats every config file.
 */
const PINNED_OPTIONS: readonly string[] = [
  "-c",
  "safe.bareRepository=explicit",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "push.followTags=false",
  "-c",
  "core.useReplaceRefs=false",
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
 * git's environment variables whose value is a program git runs, and
 * `SSH_ASKPASS`, which git runs when no askpass helper is set, as the ssh it
 * starts does (defense in depth beside the empty `GIT_ASKPASS` below): the set
 * the shell guard's line-wide rule names (`PROGRAM_VARIABLES` in
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
  "SSH_ASKPASS",
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
 * review/114: and `GIT_NO_REPLACE_OBJECTS=1` whatever `base` says, so no `git replace` ref (a local ref write that
 * needs no commit) can make an object read as another: the ledger, the trees and the declarations the run verbs read
 * are the ones the commit holds.
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
  env[NO_REPLACE_OBJECTS] = "1";
  return env;
}

/** review/114: the variable that turns git's replace refs off for a call; the git surface record reads it as runner-set. */
export const NO_REPLACE_OBJECTS = "GIT_NO_REPLACE_OBJECTS";

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
  if (opts.processGroup === true && process.platform !== "win32") return gitWriteInGroup(git, argv, cwd, env, timeout, opts.input);
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

/** Signals every process in the group `pid` leads; a group already gone is no error. */
function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: nothing is left in the group. EPERM: a member is not ours to signal; the wait below reports it.
  }
}

/** Whether any process is still in the group `pid` leads; one the runner may not signal still counts. */
function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Waits until the group `pid` leads is gone or `ms` has passed: whether it is gone. */
async function groupGoneWithin(pid: number, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (groupAlive(pid)) {
    if (Date.now() >= deadline) return false;
    // oxlint-disable-next-line no-await-in-loop -- a poll: each ask waits on the one before
    await sleepFor(GROUP_POLL_MS);
  }
  return true;
}

/** Stops the group `pid` leads, a stop then a kill after the grace, and answers whether it is gone (review/179). */
async function stopGroup(pid: number): Promise<boolean> {
  signalGroup(pid, "SIGTERM");
  if (await groupGoneWithin(pid, GROUP_STOP_GRACE_MS)) return true;
  signalGroup(pid, "SIGKILL");
  return groupGoneWithin(pid, GROUP_GONE_WAIT_MS);
}

/**
 * review/179: {@link gitWrite} with {@link GitWriteOptions.processGroup} on POSIX. Node's `execFile` passes no
 * `detached` to the program it starts and stops only that program, so this starts git with `spawn` as a group leader
 * and holds the wall time and the output bound itself, with the same answers: git's exit status, a non-zero one
 * included; a rejection when git could not start; and, when the wall time or the output bound stopped it, a
 * {@link GitWriteGroupStopped} once the whole group was stopped and waited for.
 */
function gitWriteInGroup(git: string, argv: readonly string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number, input: string | undefined): Promise<GitWriteResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(git, argv, { cwd, env, detached: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const sizes = { out: 0, err: 0 };
    let settled = false;
    /** Set once the call is stopped: why, and the group's stop, which `close` waits for before it answers. */
    let stopped: { why: string; gone: Promise<boolean>; overBound: boolean } | null = null;
    const stop = (why: string, overBound: boolean): void => {
      if (stopped !== null) return;
      const { pid } = child;
      stopped = { why, gone: pid === undefined ? Promise.resolve(false) : stopGroup(pid), overBound };
      // As Node's own kill does: git's ends of the pipes are let go, so `close` follows git's exit even where a
      // process outside the group still holds them.
      child.stdout.destroy();
      child.stderr.destroy();
    };
    const timer = setTimeout(() => stop(`git did not finish within ${timeout} ms; its process group was stopped`, false), timeout);
    const collect = (into: Buffer[], key: "out" | "err") => (chunk: Buffer) => {
      sizes[key] += chunk.length;
      if (sizes[key] > GIT_WRITE_MAX_BUFFER) stop(`git's ${key === "out" ? "stdout" : "stderr"} passed ${GIT_WRITE_MAX_BUFFER} bytes; its process group was stopped`, true);
      else into.push(chunk);
    };
    child.stdout.on("data", collect(out, "out"));
    child.stderr.on("data", collect(err, "err"));
    child.on("error", (cause) => {
      // Git could not start (no exit follows), or a signal could not be sent; only the first answer counts.
      if (stopped !== null || settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(cause);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (stopped !== null) {
        const { why, gone, overBound } = stopped;
        // An output past the bound never reads as gone: the commit may have been cut off at any point (fail closed).
        void gone.then((isGone) => rejectPromise(new GitWriteGroupStopped(why, isGone && !overBound)));
        return;
      }
      if (typeof code === "number") {
        resolvePromise({ code, stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
        return;
      }
      // Stopped by a signal the runner did not send: git did not finish, and nothing says what its group did.
      rejectPromise(Object.assign(new Error(`git was stopped by ${signal ?? "a signal"}`), { signal }));
    });
    // A git that exits before it reads all of `input` closes the pipe: as in gitWrite, the exit status is the answer.
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}
