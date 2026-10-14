import { accessSync, constants, realpathSync, statSync } from "node:fs";

/**
 * Where a program started by its bare name is looked up, decided here rather
 * than by the runtime.
 *
 * A child process started by a bare name is found by the runtime's own walk,
 * and that walk can reach the folder the child runs in: on Windows it looks
 * there first, before any `PATH` entry, and on POSIX an empty `PATH` entry or a
 * relative one names that folder. The engine starts git in the setup root, a
 * folder whose files are a repository's content, so the program it starts must
 * never be a file of the folder git runs in. {@link resolveProgramOnPath} takes
 * the same walk over the `PATH` entries that are full paths to some other
 * folder, and the caller starts the absolute path it returns.
 *
 * That folder is all the walk keeps out. It takes `PATH` as given: an entry
 * that is a full path to another folder is searched as it stands, a folder
 * elsewhere in the same checkout included, so whatever sets the `PATH` the
 * engine is started with chooses the program.
 *
 * The walk is pure over its parameters: the platform whose rules apply, the
 * `PATH` value, the working folder and the probe that reads the disk are all
 * handed in, so the Windows rules are provable on a POSIX host and the reverse.
 * Zero internal imports, so every layer that starts a program may import it.
 */

/** The two reads the walk makes, behind one seam. */
export interface ProgramFileProbe {
  /**
   * True when `path` is a regular file the platform would start: on POSIX one
   * with an execute bit, which the runtime's own walk passes over a file for
   * lacking; on Windows any regular file, since the extension is what makes a
   * file a program there. A link is followed, a folder is never a program.
   */
  isProgramFile(path: string): boolean;
  /** Where `path` really is, every link resolved, or `null` when it names nothing that can be reached. */
  realPath(path: string): string | null;
}

/** What one walk is taken over. */
export interface ProgramSearch {
  /** The platform whose rules apply: separators, the `PATH` delimiter, extensions. */
  readonly platform: NodeJS.Platform;
  /** The `PATH` value to walk; `undefined` for none. */
  readonly path: string | undefined;
  /** The folder the program will be started in. Never searched. */
  readonly cwd: string;
  readonly probe: ProgramFileProbe;
}

/** The probe every production caller uses: the file system the process runs on. */
export const fileSystemProbe: ProgramFileProbe = {
  isProgramFile(path) {
    try {
      // Windows has no execute bit, and `X_OK` answers existence there.
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  },
  realPath(path) {
    // The native call first: it answers in the letter case the file system
    // stores, so two spellings of one folder compare equal on a file system
    // that folds case. It fails on a few Windows volumes the other one reads.
    try {
      return realpathSync.native(path);
    } catch {
      try {
        return realpathSync(path);
      } catch {
        return null;
      }
    }
  },
};

/** A `PATH` entry that names one folder whatever folder the child runs in: rooted, and on Windows on a named drive or share. */
export function isFullPath(entry: string, windows: boolean): boolean {
  if (!windows) return entry.startsWith("/");
  // `C:\tools` and `\\server\share`. Not `C:tools` (the drive's current
  // folder) and not `\tools` (the current drive): both follow the child.
  return /^[A-Za-z]:[\\/]/.test(entry) || /^[\\/]{2}[^\\/]/.test(entry);
}

/** One spelling for a real path, so two of them compare: no trailing separator, and no letter case on Windows. */
function folderKey(realPath: string, windows: boolean): string {
  const trimmed = realPath.replace(windows ? /[\\/]+$/ : /\/+$/, "");
  return windows ? trimmed.toLowerCase() : trimmed;
}

/**
 * The file names tried in each folder. POSIX starts the name as given. Windows
 * starts only `.com` and `.exe` files for a bare name, in that order, and the
 * name as given when it already carries an extension — the names the runtime
 * itself tries (libuv's `search_path`), minus the bare name in the working
 * folder.
 */
function candidateNames(name: string, windows: boolean): readonly string[] {
  if (!windows) return [name];
  const dot = name.indexOf(".");
  return dot !== -1 && dot < name.length - 1 ? [name] : [`${name}.com`, `${name}.exe`];
}

/**
 * The absolute path of the program a bare `name` stands for, or `null` when no
 * `PATH` entry this walk accepts holds it.
 *
 * Entry by entry, in `PATH` order, and the first regular file wins:
 *
 * - an entry that is not a full path is skipped: an empty one and a relative
 *   one both name the working folder or a folder under it;
 * - an entry whose real path is the working folder's is skipped, however it is
 *   spelled — a trailing separator, a link, another letter case on Windows;
 * - an entry with no real path holds nothing and is skipped.
 *
 * The answer is the entry as `PATH` spells it with the file name after it, not
 * a real path: a program reached through a link is started by the same name the
 * runtime's own walk would have started it by.
 *
 * `null` too for a name that is not bare (it carries a separator, or a drive on
 * Windows), for no `PATH`, and for a working folder with no real path: there is
 * then nothing to compare an entry with, and nothing is compared by guess.
 */
export function resolveProgramOnPath(name: string, search: ProgramSearch): string | null {
  const windows = search.platform === "win32";
  if (name === "" || (windows ? /[\\/:]/ : /\//).test(name)) return null;
  if (search.path === undefined) return null;
  const workingFolder = search.probe.realPath(search.cwd);
  if (workingFolder === null) return null;
  const names = candidateNames(name, windows);

  for (const raw of search.path.split(windows ? ";" : ":")) {
    // A quoted entry is legal on Windows, and the runtime's own walk strips the pair.
    const entry = windows ? raw.replace(/^"(.*)"$/, "$1") : raw;
    if (!isFullPath(entry, windows)) continue;
    const folder = search.probe.realPath(entry);
    if (folder === null || folderKey(folder, windows) === folderKey(workingFolder, windows)) continue;
    const prefix = (windows ? /[\\/]$/ : /\/$/).test(entry) ? entry : `${entry}${windows ? "\\" : "/"}`;
    for (const candidate of names) {
      if (search.probe.isProgramFile(`${prefix}${candidate}`)) return `${prefix}${candidate}`;
    }
  }
  return null;
}

/**
 * The `PATH` value in `env` as the runtime reads it for a child: the exact name
 * on POSIX; on Windows any letter case (the system spells it `Path`), and of
 * several spellings in a plain object the first in sort order, which is the one
 * Node keeps when it hands the object to a child.
 */
export function searchPathOf(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string | undefined {
  if (platform !== "win32") return env["PATH"];
  const key = Object.keys(env)
    .toSorted()
    .find((name) => name.toUpperCase() === "PATH");
  return key === undefined ? undefined : env[key];
}

/**
 * The platform this process runs on, read once when the module loads. It is a
 * fact of the process and does not change, and the walk that finds the program
 * to start must follow the real one whatever a later reader of
 * `process.platform` is shown.
 */
const HOST_PLATFORM: NodeJS.Platform = process.platform;

/** The git each working folder and `PATH` resolved to, for the life of the process. */
const gitPrograms = new Map<string, string>();

/**
 * The absolute path of the git to start in `cwd`, under the environment the
 * child is given, or `null` when no `PATH` entry {@link resolveProgramOnPath}
 * accepts holds one — which every caller answers as it answers a machine with
 * no git installed.
 *
 * Resolved once per working folder and `PATH` value, then remembered: a verb
 * that makes twenty git calls in one folder walks `PATH` once. An answer of
 * nothing is not remembered, so a working folder made after the first call, or
 * a git installed after it, is found by the next one.
 */
export function gitProgramFor(cwd: string, env: NodeJS.ProcessEnv): string | null {
  const path = searchPathOf(env, HOST_PLATFORM);
  const key = `${cwd}\0${path ?? ""}`;
  const known = gitPrograms.get(key);
  if (known !== undefined) return known;
  const program = resolveProgramOnPath("git", { platform: HOST_PLATFORM, path, cwd, probe: fileSystemProbe });
  if (program !== null) gitPrograms.set(key, program);
  return program;
}

/**
 * The error Node raises for a start that finds no program, for a caller that
 * looked first and found none: the same message, `code`, `syscall`, `path` and
 * `spawnargs`, so a reader of the failure cannot tell the two apart.
 */
export function programNotFound(name: string, call: "spawn" | "spawnSync", args: readonly string[]): NodeJS.ErrnoException {
  return Object.assign(new Error(`${call} ${name} ENOENT`), {
    code: "ENOENT",
    syscall: `${call} ${name}`,
    path: name,
    spawnargs: [...args],
  });
}
