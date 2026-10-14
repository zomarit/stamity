import { execFile } from "node:child_process";
import { homedir } from "node:os";
import {
  fileSystemProbe,
  isFullPath,
  resolveProgramOnPath,
  searchPathOf,
  type ProgramFileProbe,
} from "../../shared/programPath.ts";
import type { Tool } from "../../types/core.ts";
import type { ListedModels } from "../../types/manifest.ts";
import { detectWorkspaceContext } from "../../workspace/detect.ts";

/**
 * The client lister: the one place the engine starts a client's own CLI to read
 * which models this account may use (REQ-LADDER-006).
 *
 * Called by `init` and `sync` before they plan, never by emission or by the
 * drift gate: the answer is persisted under `models.listed.<client>`, and every
 * later plan reads that copy. `STAMITY_NO_CLIENT_PROBE=1` in the environment a
 * caller hands in makes every call answer `absent` with nothing started, so a
 * test run or this repository's own `sync` never reads the machine's accounts
 * even where a caller forgot to check the switch first.
 *
 * No program the repository can place is started, and nothing a client prints
 * is trusted until parsed. The program is found by a `PATH` walk
 * (`resolveProgramOnPath`) over the entries left once every entry the walk
 * itself skips (an empty one, `.` or any other relative one), every entry
 * inside the working folder's tree, and every entry named `node_modules/.bin`
 * at any level, is dropped: npm and `npx` put the project's own
 * `node_modules/.bin` folders ahead of the user's `PATH`, and a repository can
 * commit one or have a dependency install a `bin` there. A program the walk
 * still finds whose real path lies inside the working tree (a link from outside
 * pointing in) is refused, never started. The child is given that trimmed
 * `PATH` too, so a launcher that finds its interpreter by name
 * (`#!/usr/bin/env node`) cannot reach one the repository placed. And the child
 * is started in the user's home folder, never in the working tree, so a
 * project-scoped setting the repository carries is not what the client reads;
 * a home whose real path lies inside the working tree is refused, and nothing
 * starts. Home, not the temp folder: each client keeps its account and its
 * user settings under home already, so a setting found there is the
 * operator's own, while on Linux the temp folder is shared with every local
 * account. So a file a repository carries under a
 * client's name, or under an interpreter's, is not what starts. The output must open with that client's own header or the
 * outcome is `unreadable`, which limits what is kept, not what runs; and an id is kept only when it has the shape of a model id
 * (letters, digits and `._:/-`, at most 100 characters), which no line break,
 * space or quote passes, so a kept id is always a value `modelPinDefect` in the
 * manifest validator accepts. The child gets no stdin, no window and a bounded
 * wall time, after which it is killed outright.
 */

/** What one read of a client's model list came to. */
export type ModelListOutcome =
  | { kind: "listed"; ids: string[]; source: ListedModels["source"] }
  | { kind: "absent" }
  | { kind: "timeout" }
  | { kind: "unreadable"; message: string };

/** Ceiling on one listing's wall time (REQ-LADDER-006: read once within 10 s). */
export const CLIENT_LIST_TIMEOUT_MS = 10_000;

/** Ceiling on what a listing may print; Codex's full catalogue is about half a megabyte. */
const MAX_LISTING_BYTES = 8 * 1024 * 1024;

/** The shape a listed id must have to be kept. */
const MODEL_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/;

/** Terminal colour and cursor sequences a CLI may print even to a pipe. */
// oxlint-disable-next-line no-control-regex -- matching the escape byte IS the point
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** How one client is asked. */
interface ClientLister {
  /** Program names tried in order; the first `PATH` holds is started. */
  readonly programs: readonly string[];
  readonly args: readonly string[];
  readonly source: ListedModels["source"];
  /** What the output must be, as the `unreadable` message words it. */
  readonly header: string;
  readonly parse: (output: string) => string[] | null;
}

/** The ids in `candidates` that have a model id's shape, first occurrence only. */
function shapedIds(candidates: Iterable<string>): string[] {
  const ids: string[] = [];
  for (const id of candidates) {
    if (MODEL_ID_SHAPE.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** `text` without colour sequences, a byte-order mark or Windows line ends, split into lines. */
function plainLines(text: string): string[] {
  return text.replace(/^\uFEFF/, "").replaceAll(ANSI_SEQUENCE, "").split(/\r?\n/);
}

/** The lines after a first non-blank line equal to `header`, or `null` when the output opens otherwise. */
function afterHeader(text: string, header: string): string[] | null {
  const lines = plainLines(text);
  const start = lines.findIndex((line) => line.trim() !== "");
  if (start === -1 || lines[start]?.trim() !== header) return null;
  return lines.slice(start + 1);
}

/**
 * The ids Cursor's `agent models` printed, in its order, or `null` when the
 * output is not that listing. Each model is one `<id> - <name>` line under an
 * `Available models` header; the closing tip and blank lines are not models.
 */
export function parseCursorModels(text: string): string[] | null {
  const lines = afterHeader(text, "Available models");
  if (lines === null) return null;
  const ids = shapedIds(lines.map((line) => /^(\S+) - \S/.exec(line.trim())?.[1] ?? ""));
  return ids.length === 0 ? null : ids;
}

/**
 * The slugs Codex's `codex debug models` printed, in its order, or `null` when
 * the output is not that catalogue: a JSON object whose `models` array holds
 * objects with a string `slug`. Hidden entries are kept, since a pin may name
 * one the account can still run.
 */
export function parseCodexModels(json: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("models" in parsed) || !Array.isArray(parsed.models)) {
    return null;
  }
  const slugs = (parsed.models as unknown[]).map((entry) =>
    typeof entry === "object" && entry !== null && "slug" in entry && typeof entry.slug === "string" ? entry.slug : "",
  );
  const ids = shapedIds(slugs);
  return ids.length === 0 ? null : ids;
}

/**
 * The values Copilot CLI's `copilot help config` lists for its `model`
 * setting, in its order, or `null` when the output is not that page. The values
 * are the quoted `- "<id>"` lines straight after the `` `model`: `` entry, and
 * the first line of any other shape ends them.
 */
export function parseCopilotHelpConfig(text: string): string[] | null {
  const lines = afterHeader(text, "Configuration Settings:");
  if (lines === null) return null;
  const entry = lines.findIndex((line) => /^\s*`model`:/.test(line));
  if (entry === -1) return null;
  const values: string[] = [];
  for (const line of lines.slice(entry + 1)) {
    const value = /^\s*- "([^"]*)"\s*$/.exec(line)?.[1];
    if (value === undefined) break;
    values.push(value);
  }
  const ids = shapedIds(values);
  return ids.length === 0 ? null : ids;
}

/**
 * Each listing client's call. Cursor's CLI is installed as `cursor-agent` and,
 * on newer installs, also as `agent`; the specific name is tried first.
 */
const LISTERS: Readonly<Partial<Record<Tool, ClientLister>>> = {
  cursor: {
    programs: ["cursor-agent", "agent"],
    args: ["models"],
    source: "cursor-agent-models",
    header: "output opening with `Available models`",
    parse: parseCursorModels,
  },
  codex: {
    programs: ["codex"],
    args: ["debug", "models"],
    source: "codex-debug-models",
    header: "a JSON object with a `models` array",
    parse: parseCodexModels,
  },
  copilot: {
    programs: ["copilot"],
    args: ["help", "config"],
    source: "copilot-help-config",
    header: "output opening with `Configuration Settings:`",
    parse: parseCopilotHelpConfig,
  },
};

/** The seams a test turns; production takes the defaults. */
export interface ListClientModelsOptions {
  /** Wall-time ceiling; {@link CLIENT_LIST_TIMEOUT_MS} by default. */
  readonly timeoutMs?: number;
  /** Codex only: list the catalogue shipped with the binary, with no refresh over the network. */
  readonly codexBundled?: boolean;
  /** The platform whose `PATH` rules apply; the host's by default. */
  readonly platform?: NodeJS.Platform;
  /** The file-system reads the `PATH` walk makes. */
  readonly probe?: ProgramFileProbe;
  /**
   * The user's home folder, where the child is started; `os.homedir()` by
   * default. Refused, with nothing started, when its real path lies inside the
   * working tree.
   */
  readonly home?: string;
}

/** A `PATH` entry npm or `npx` adds for a project's installed binaries, at any level. */
const NODE_MODULES_BIN = {
  posix: /(?:^|\/)node_modules\/\.bin\/*$/,
  win32: /(?:^|[\\/])node_modules[\\/]\.bin[\\/]*$/i,
} as const;

/** Whether real path `inner` is real path `root` or lies below it. */
function isWithin(inner: string, root: string, windows: boolean): boolean {
  const key = (path: string): string => {
    const trimmed = path.replace(windows ? /[\\/]+$/ : /\/+$/, "");
    return windows ? trimmed.replaceAll("/", "\\").toLowerCase() : trimmed;
  };
  const [child, parent] = [key(inner), key(root)];
  return child === parent || child.startsWith(`${parent}${windows ? "\\" : "/"}`);
}

/**
 * `path` without the entries a repository can fill: every entry the walk skips
 * for not being a full path (the walk's own `isFullPath`, so the child's `PATH`
 * follows the walk's rule: an empty entry, `.` or any other relative one names
 * whatever folder the child runs in), every `node_modules/.bin` folder, and
 * every entry whose real path is the working folder or lies below it.
 * `undefined` stays `undefined`; a working folder with no real path is answered
 * by the walk itself, which then searches nothing.
 */
function trustedSearchPath(
  path: string | undefined,
  root: string | null,
  platform: NodeJS.Platform,
  probe: ProgramFileProbe,
): string | undefined {
  if (path === undefined) return undefined;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  return path
    .split(delimiter)
    .filter((raw) => {
      // A quoted entry is legal on Windows, and the walk strips the pair before it judges one.
      const entry = windows ? raw.replace(/^"(.*)"$/, "$1") : raw;
      if (!isFullPath(entry, windows)) return false;
      if (NODE_MODULES_BIN[windows ? "win32" : "posix"].test(entry)) return false;
      const real = root === null ? null : probe.realPath(entry);
      return real === null || !isWithin(real, root ?? "", windows);
    })
    .join(delimiter);
}

/**
 * The real path of the folder the child is started in: `home`, or the user's
 * home when none is given, so long as it lies outside the working tree; `null`
 * when it lies inside, or names nothing that can be read.
 */
function homeOutside(home: string | undefined, root: string, windows: boolean, probe: ProgramFileProbe): string | null {
  let folder: string;
  try {
    folder = home ?? homedir();
  } catch {
    return null;
  }
  const real = folder === "" ? null : probe.realPath(folder);
  return real === null || isWithin(real, root, windows) ? null : real;
}

/**
 * What the walk found for a client: a program to start, with the trimmed search
 * path its child is given and the folder it is started in; one refused, with
 * the reason; or nothing.
 */
type FoundProgram =
  | { kind: "found"; name: string; path: string; searchPath: string | undefined; folder: string }
  | { kind: "refused"; message: string }
  | null;

/**
 * The key `env` holds its search path under, as the child reads it: `PATH` on
 * POSIX; on Windows the first spelling in sort order of any letter case, the
 * one Node keeps when it hands a plain object to a child (and the one
 * `searchPathOf` reads).
 */
function searchPathKey(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (platform !== "win32") return "PATH";
  return (
    Object.keys(env)
      .toSorted()
      .find((name) => name.toUpperCase() === "PATH") ?? "Path"
  );
}

/**
 * The child's environment: `env` with its search path replaced by the trimmed
 * one, under the same key, and nothing else changed. The walk's trim is not
 * enough on its own: a client launcher that starts its interpreter by name
 * (`#!/usr/bin/env node`) searches the child's `PATH`, which would otherwise
 * still hold the repository's `node_modules/.bin`.
 */
function childEnv(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  searchPath: string | undefined,
): NodeJS.ProcessEnv {
  if (searchPath === undefined) return env;
  return { ...env, [searchPathKey(env, platform)]: searchPath };
}

/**
 * The first of `programs` the walk finds outside the tree under `treeRoot`, by
 * name and absolute path, with the folder its child is started in. The walk is
 * given `treeRoot` as the folder it never searches.
 */
function findProgram(
  programs: readonly string[],
  env: NodeJS.ProcessEnv,
  treeRoot: string,
  platform: NodeJS.Platform,
  probe: ProgramFileProbe,
  home: string | undefined,
): FoundProgram {
  const windows = platform === "win32";
  const root = probe.realPath(treeRoot);
  const path = trustedSearchPath(searchPathOf(env, platform), root, platform, probe);
  for (const name of programs) {
    const found = resolveProgramOnPath(name, { platform, path, cwd: treeRoot, probe });
    if (found === null) continue;
    const real = probe.realPath(found);
    if (root === null || real === null || isWithin(real, root, windows)) {
      return { kind: "refused", message: `\`${name}\` on PATH resolves inside the working tree, so it was not started` };
    }
    const folder = homeOutside(home, root, windows, probe);
    if (folder === null) {
      return { kind: "refused", message: `no home folder outside the working tree to start \`${name}\` in, so it was not started` };
    }
    return { kind: "found", name, path: found, searchPath: path, folder };
  }
  return null;
}

/**
 * The `treeRoot` every verb hands {@link listClientModels} for the repository at
 * `rootDir`: the root of the enclosing workspace when the repository is a member
 * of one, found the way the workspace verbs find it
 * (`detectWorkspaceContext`, the nearest `workspace.json` at or above), else
 * `rootDir` itself. Every repository of a workspace can place a file under the
 * workspace root, so a `PATH` entry in the root's own tree or a sibling member
 * supplies no client program, whichever verb starts the lister.
 */
export async function listerTreeRoot(rootDir: string): Promise<string> {
  return (await detectWorkspaceContext(rootDir)).workspaceRoot ?? rootDir;
}

/**
 * Read `tool`'s model list for this account by starting its own CLI, once.
 *
 * `absent` when the switch is set, when the client has no listing command
 * (Claude Code), or when no `PATH` entry the walk accepts holds the program —
 * on Windows that includes an npm shim (`codex.cmd`), which is not started
 * without a shell, so the shipped fallback applies there. `timeout` when the
 * child outlives the ceiling and is killed. `unreadable`, with nothing started,
 * when the program found resolves into the working tree or no home folder
 * outside that tree holds the child; and when it exits non-zero,
 * prints past the byte ceiling, or prints something that is not the client's
 * listing; the message names the call and never repeats the child's output.
 * Never throws.
 *
 * `treeRoot` is the root of the working tree the lister keeps out: no `PATH`
 * entry in that tree is searched or handed to the child, and no program whose
 * real path lies in it is started. It is not where the child runs: the lister
 * chooses that folder itself, the user's home (`options.home`), so long as
 * home lies outside the tree.
 */
export function listClientModels(
  tool: Tool,
  env: NodeJS.ProcessEnv,
  treeRoot: string,
  options: ListClientModelsOptions = {},
): Promise<ModelListOutcome> {
  const lister = LISTERS[tool];
  if (lister === undefined || env["STAMITY_NO_CLIENT_PROBE"] === "1") return Promise.resolve({ kind: "absent" });
  const platform = options.platform ?? process.platform;
  const program = findProgram(lister.programs, env, treeRoot, platform, options.probe ?? fileSystemProbe, options.home);
  if (program === null) return Promise.resolve({ kind: "absent" });
  if (program.kind === "refused") return Promise.resolve({ kind: "unreadable", message: program.message });
  const args = tool === "codex" && options.codexBundled === true ? [...lister.args, "--bundled"] : [...lister.args];
  const call = `${program.name} ${args.join(" ")}`;

  return new Promise((resolveOutcome) => {
    const child = execFile(
      program.path,
      args,
      {
        cwd: program.folder,
        env: childEnv(env, platform, program.searchPath),
        encoding: "utf8",
        timeout: options.timeoutMs ?? CLIENT_LIST_TIMEOUT_MS,
        killSignal: "SIGKILL",
        maxBuffer: MAX_LISTING_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        resolveOutcome(outcomeOf(error, stdout, lister, call));
      },
    );
    // No answer is ever typed: a CLI that stops to ask reads end-of-file at once.
    child.stdin?.end();
  });
}

/** One finished call, classified. */
function outcomeOf(
  error: (Error & { code?: unknown; killed?: boolean }) | null,
  stdout: string,
  lister: ClientLister,
  call: string,
): ModelListOutcome {
  if (error !== null) {
    if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
      return { kind: "unreadable", message: `\`${call}\` printed more than ${MAX_LISTING_BYTES} bytes` };
    }
    if (error.code === "ENOENT") return { kind: "absent" };
    if (error.killed === true) return { kind: "timeout" };
    const status = typeof error.code === "number" ? `exited with status ${error.code}` : "failed to run";
    return { kind: "unreadable", message: `\`${call}\` ${status}` };
  }
  const ids = lister.parse(stdout);
  if (ids === null) {
    return { kind: "unreadable", message: `\`${call}\` printed no model list (expected ${lister.header})` };
  }
  return { kind: "listed", ids, source: lister.source };
}
