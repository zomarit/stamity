import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { isPlainObject } from "../../config/parse.ts";
import { MANIFEST_REPO_PATH, collectListedErrors, withoutListedModels } from "../../manifest/manifest.ts";
import { CLIENT_MODELS_CACHE_FILE } from "../../mcp/env.ts";
import { atomicWriteFile } from "../../merge/atomicWrite.ts";
import { MODEL_PRIORITY, modelMapPath } from "../../roster/modelDefaults.ts";
import { isModelClass, listHoldsPin, pinsFor } from "../../roster/modelLadder.ts";
import {
  fileSystemProbe,
  isFullPath,
  isNodeModulesBin,
  resolveProgramOnPath,
  searchPathOf,
  type ProgramFileProbe,
} from "../../shared/programPath.ts";
import type { Tool } from "../../types/core.ts";
import type { ListedModels, SetupManifest } from "../../types/manifest.ts";
import { detectWorkspaceContext } from "../../workspace/detect.ts";

/**
 * The client lister: the one place the engine starts a client's own CLI to read
 * which models this account may use (REQ-LADDER-006).
 *
 * Called by `init` and `sync` before they plan, never by emission or by the
 * drift gate: the answer is kept in the git-ignored cache
 * `.stamity/client-models.json` (REQ-LADDER-009, {@link resolveModelLists}),
 * never in the committed manifest, and every later plan reads that copy. `STAMITY_NO_CLIENT_PROBE=1` in the environment a
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
 *
 * On Windows an entry is judged twice: as the walk reads it (a paired `"…"`
 * stripped) and as the runtime's own lookup reads it (one leading and one
 * trailing `"` or `'` stripped, each on its own), and it is kept only when both
 * readings pass and both have a real path. The two readings differ only for an
 * entry with an unpaired quote, which names no folder as the walk reads it but
 * can name one in the tree as the child's lookup reads it; an entry with no
 * real path holds nothing to start, so dropping it costs nothing.
 */
export function trustedSearchPath(
  path: string | undefined,
  root: string | null,
  platform: NodeJS.Platform,
  probe: ProgramFileProbe,
): string | undefined {
  if (path === undefined) return undefined;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  const passes = (entry: string): boolean => {
    if (!isFullPath(entry, windows) || isNodeModulesBin(entry, windows)) return false;
    const real = root === null ? null : probe.realPath(entry);
    if (real === null) return !windows || root === null;
    return !isWithin(real, root ?? "", windows);
  };
  return path
    .split(delimiter)
    .filter((raw) =>
      windows ? passes(raw.replace(/^"(.*)"$/, "$1")) && passes(raw.replace(/^["']/, "").replace(/["']$/, "")) : passes(raw),
    )
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

// ── The kept lists (REQ-LADDER-009) ────────────────────────────────────────

/** Ceiling on the ids one client's kept list holds (REQ-LADDER-006's threat cell). */
export const MAX_LISTED_MODELS = 200;

/** Each client's model list, keyed by client. */
export type ModelLists = Partial<Record<Tool, ListedModels>>;

/** Ceiling on the bytes one cache or model map read takes; three lists of 200 ids fit many times over. */
const MAX_LIST_FILE_BYTES = 1024 * 1024;

/** The text of the regular file at `path`, or `null` when nothing is there; throws naming why it was not read. */
async function readListFile(path: string): Promise<string | null> {
  let size: number;
  try {
    const info = await lstat(path);
    if (!info.isFile()) throw new Error("it is not a regular file");
    size = info.size;
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw cause;
  }
  if (size > MAX_LIST_FILE_BYTES) throw new Error(`it is larger than ${MAX_LIST_FILE_BYTES} bytes`);
  return readFile(path, "utf8");
}

/** The defects of the cache's `listed` block: the manifest list's own validation, and the id ceiling. */
function cacheDefects(listed: unknown): string[] {
  const errors: string[] = [];
  collectListedErrors(listed, errors, "listed");
  if (isPlainObject(listed)) {
    for (const [tool, entry] of Object.entries(listed)) {
      if (isPlainObject(entry) && Array.isArray(entry["ids"]) && entry["ids"].length > MAX_LISTED_MODELS) {
        errors.push(`\`listed.${tool}.ids\` holds more than ${MAX_LISTED_MODELS} ids`);
      }
    }
  }
  return errors;
}

/**
 * The lists the cache under `rootDir` keeps, with `problem` naming why none
 * was read from a cache that is there but is not one this engine writes. A
 * cache is read with the manifest list's validation (the shape, a pin's id
 * shape, the 200-id ceiling) and the order kept as written, and taken whole or
 * not at all. Absent is no problem: a fresh clone has none.
 */
export async function readModelListCache(rootDir: string): Promise<{ lists: ModelLists; problem: string | null }> {
  const unread = (why: string): { lists: ModelLists; problem: string } => ({
    lists: {},
    problem: `the model list cache ${CLIENT_MODELS_CACHE_FILE} was not read: ${why}; delete it, and the next sync reads each client again`,
  });
  let text: string | null;
  try {
    text = await readListFile(join(rootDir, CLIENT_MODELS_CACHE_FILE));
  } catch (cause) {
    return unread(cause instanceof Error && cause.message.startsWith("it is") ? cause.message : "it could not be read");
  }
  if (text === null) return { lists: {}, problem: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return unread("it is not JSON");
  }
  if (!isPlainObject(parsed) || Object.keys(parsed).some((key) => key !== "listed")) {
    return unread("it is not an object holding `listed` alone");
  }
  const defects = cacheDefects(parsed["listed"] ?? {});
  if (defects.length > 0) return unread(`it holds ${defects.length} defect(s) a model list may not have`);
  return { lists: (parsed["listed"] ?? {}) as ModelLists, problem: null };
}

/** `lists` with its clients in sort order, so the same lists always write the same bytes. */
function sortedLists(lists: ModelLists): ModelLists {
  return Object.fromEntries(Object.entries(lists).toSorted(([a], [b]) => (a < b ? -1 : 1)));
}

/**
 * Keep `lists` in the cache under `rootDir`, atomically. Answers `null`, or the
 * warning a run prints when the write failed: the lists then held for that run
 * only and are gone after it (the manifest is written without them, so a
 * 1.15.0 manifest's lists moved that run go too), and nothing else of the run
 * is undone. Only a later sync that reads a client from its own CLI (one on
 * `PATH`, the probe switch unset) keeps that client's list again (review/117).
 */
export async function writeModelListCache(rootDir: string, lists: ModelLists): Promise<string | null> {
  try {
    await atomicWriteFile(join(rootDir, CLIENT_MODELS_CACHE_FILE), `${JSON.stringify({ listed: sortedLists(lists) }, null, 2)}\n`);
    return null;
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | null)?.code;
    return (
      `the client model lists could not be kept in ${CLIENT_MODELS_CACHE_FILE}` +
      `${typeof code === "string" ? ` (${code})` : ""}, so they held for this run only and were dropped, a 1.15.0 ` +
      "manifest's lists moved this run among them; the next sync that reads a client keeps its list again"
    );
  }
}

/** The clients a list is read for, in the order the lists are laid out. */
const TOOLS_WITH_LISTS: readonly Tool[] = ["codex", "copilot", "cursor"];

/** The clients whose model map holds every id a list moved their pick to; Cursor's drops the effort group a list decides. */
const MAP_CLIENTS: ReadonlySet<Tool> = new Set<Tool>(["codex", "copilot"]);

/** Whether `tool` is one of {@link MAP_CLIENTS}. */
function isMapClient(tool: Tool): tool is "codex" | "copilot" {
  return MAP_CLIENTS.has(tool);
}

/** The id a model value names: the text before its first `[`, trimmed, as `listHoldsPin` reads a pin. */
function baseId(value: string): string {
  return value.trim().split("[")[0] ?? "";
}

/**
 * The ids `text`, `tool`'s model map, records: every class's model, its bracket
 * options dropped, and its fallbacks; `null` for another shape, and `null` when
 * a ladder class it records carries a pick no list could have given
 * (review/109): a model that is neither one of the class's shipped candidates
 * nor the client's pin for it, or no model for a class that has candidates or a
 * pin. A list picks only among the shipped candidates, a pin binds whatever the
 * list, and only a list holding none of a class's candidates leaves it with no
 * model, which the files alone cannot tell from a hand edit, so a checkout
 * resolves that class from its own list, or with none from the shipped entry 0.
 *
 * `replaced` names the classes whose `pinReplaced` record (review/118, the
 * adapters' `pinReplacement`) names the client's pin for that class as the
 * manifest holds it now and the class's model as the pick made instead: the
 * sync that wrote the map could not honour that pin on its account's list. A
 * record naming another pin or another pick, or of another shape, is none.
 */
function mapCandidates(
  text: string,
  tool: "codex" | "copilot",
  pins: Readonly<Partial<Record<string, string>>>,
): { ids: string[]; replaced: ReadonlySet<string> } | null {
  const parsed: unknown = JSON.parse(text);
  if (!isPlainObject(parsed) || !isPlainObject(parsed["classes"])) return null;
  const candidates: string[] = [];
  const replaced = new Set<string>();
  for (const [modelClass, entry] of Object.entries(parsed["classes"])) {
    if (!isPlainObject(entry)) continue;
    const model = typeof entry["model"] === "string" ? baseId(entry["model"]) : undefined;
    if (isModelClass(modelClass)) {
      const pin = pins[modelClass];
      const shipped = MODEL_PRIORITY[tool][modelClass].map((candidate) => candidate.id);
      if (model === undefined ? shipped.length > 0 || pin !== undefined : !shipped.includes(model) && model !== (pin === undefined ? undefined : baseId(pin))) {
        return null;
      }
      const record = entry["pinReplaced"];
      if (pin !== undefined && isPlainObject(record) && record["pin"] === pin && record["by"] === entry["model"]) replaced.add(modelClass);
    }
    if (model !== undefined) candidates.push(model);
    if (Array.isArray(entry["fallbacks"])) candidates.push(...entry["fallbacks"].filter((id) => typeof id === "string"));
  }
  return { ids: candidates, replaced };
}

/** The `model:` value of a Cursor agent file's frontmatter, unquoted, or `null` where it carries none. */
function agentModel(text: string): string | null {
  const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const raw = head === undefined ? undefined : /^model: (.*)$/m.exec(head)?.[1]?.trim();
  if (raw === undefined) return null;
  if (!raw.startsWith('"')) return raw;
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/**
 * The text of each of `paths` under `rootDir` that reads, in order; a path
 * that is absent, too large, not a regular file or unreadable is left out.
 */
async function readEmitted(rootDir: string, paths: readonly string[]): Promise<string[]> {
  const texts = await Promise.all(paths.map((path) => readListFile(join(rootDir, path)).catch(() => null)));
  return texts.filter((text) => text !== null);
}

/**
 * For each listing client the ledger names files of, selected or not, a list
 * read off the files the last emission wrote, so a checkout with no cached
 * list keeps the pick already emitted, a fresh clone's drift gate reports
 * none, and a deselected client's files are proved by what they carry (the
 * sweep renders them too). Codex and Copilot: their model map
 * (`.stamity/generated/models/<client>.json`), every class's model, its bracket
 * options dropped, and its fallbacks, which are the shipped candidates the list
 * it was picked from held (the client's pins join it in
 * {@link resolveModelLists}). The resolver picks from it exactly what it picked
 * from that list. A map whose class carries a pick no list gives
 * ({@link mapCandidates}) gives nothing. Cursor: the `model:` values its agent
 * files carry with no effort group, since a list decides only whether a pin
 * takes one, and a value with a group fails the id shape, so a pin the list
 * held stays bare and one it lacked keeps its group. A file that is not
 * ledgered, is too large or has another shape gives nothing. `replaced` holds,
 * per map client, the classes its map records as having replaced the pin the
 * manifest holds now ({@link mapCandidates}).
 */
async function emittedPickLists(
  rootDir: string,
  manifest: SetupManifest,
): Promise<{ lists: ModelLists; replaced: Partial<Record<Tool, ReadonlySet<string>>> }> {
  const ledgered = new Set(manifest.ledger.map((row) => row.path));
  const replaced: Partial<Record<Tool, ReadonlySet<string>>> = {};
  const read = await Promise.all(
    TOOLS_WITH_LISTS.map(async (tool): Promise<[Tool, ListedModels] | null> => {
      const lister = LISTERS[tool];
      if (lister === undefined) return null;
      let candidates: string[] | null = null;
      if (isMapClient(tool)) {
        if (!ledgered.has(modelMapPath(tool))) return null;
        const [text] = await readEmitted(rootDir, [modelMapPath(tool)]);
        let fromMap: ReturnType<typeof mapCandidates> = null;
        try {
          fromMap = text === undefined ? null : mapCandidates(text, tool, pinsFor(manifest.models, tool));
        } catch {
          fromMap = null;
        }
        if (fromMap !== null) replaced[tool] = fromMap.replaced;
        candidates = fromMap?.ids ?? null;
      } else {
        const agents = manifest.ledger
          .filter((row) => row.adapter === tool && row.artifactType === "agent" && row.path.endsWith(".md"))
          .map((row) => row.path);
        if (agents.length === 0) return null;
        candidates = (await readEmitted(rootDir, [...new Set(agents)])).map(agentModel).filter((model) => model !== null);
      }
      return candidates === null ? null : [tool, { ids: shapedIds(candidates).slice(0, MAX_LISTED_MODELS), source: lister.source }];
    }),
  );
  return { lists: Object.fromEntries(read.filter((entry) => entry !== null)), replaced };
}

/**
 * `emitted` with each Codex and Copilot pin of `manifest` added, as its base id,
 * to that client's list (review/115), where `kept` holds the pin
 * (`listHoldsPin`, the resolver's own test), or has no list for the client and
 * the map does not record the pin as replaced (review/118): a pin then binds
 * as written, so an unsynced pin edit is drift and a sync with no cache writes
 * it, never a shipped re-pick. A pin this account's list lacks is re-picked
 * here as `sync` re-picks it, and so, on a checkout with no list, is one the
 * map records the syncing account's list as lacking, which keeps that sync's
 * pick until a list holding the pin is read. Cursor's list is left as read: a
 * pin added there would always read as listed and lose the effort group its
 * files carry.
 */
function withPins(
  emitted: ModelLists,
  manifest: SetupManifest,
  kept: ModelLists,
  replaced: Partial<Record<Tool, ReadonlySet<string>>>,
): ModelLists {
  const lists: ModelLists = { ...emitted };
  for (const tool of TOOLS_WITH_LISTS) {
    const entry = emitted[tool];
    if (entry === undefined || !isMapClient(tool)) continue;
    const account = kept[tool]?.ids;
    const pins = Object.entries(pinsFor(manifest.models, tool))
      .filter(([modelClass, pin]) => pin !== undefined && (account === undefined ? replaced[tool]?.has(modelClass) !== true : listHoldsPin(account, pin)))
      .map(([, pin]) => baseId(pin ?? ""));
    lists[tool] = { ...entry, ids: shapedIds([...entry.ids, ...pins]).slice(0, MAX_LISTED_MODELS) };
  }
  return lists;
}

/** What one verb resolves its model picks with, and what it keeps for the account. */
export interface ResolvedModelLists {
  /**
   * The lists a plan resolves with, client by client: the one read fresh, else
   * the cached one, else the one a 1.15.0 manifest still saved, else the one
   * read off the files already emitted ({@link emittedPickLists}).
   */
  readonly effective: ModelLists;
  /**
   * The lists that reproduce the files already emitted: the ones read off
   * them first, then {@link effective}'s. What the drift gate plans with.
   */
  readonly asEmitted: ModelLists;
  /**
   * The lists read off the files already emitted alone ({@link emittedPickLists}):
   * what `check`'s `model-pins` row works out the emitted model from first.
   */
  readonly emitted: ModelLists;
  /** The account's lists without those read off the files: what a live run keeps in the cache. */
  readonly kept: ModelLists;
  /** {@link kept} where it differs from what the cache holds, so a live run writes it; else `null`. */
  readonly toWrite: ModelLists | null;
  /**
   * Why a cache that is there was not read, or why a 1.15.0 manifest's lists
   * were not moved (one line each), or `null`.
   */
  readonly problem: string | null;
}

/**
 * The model lists for the setup at `rootDir` (REQ-LADDER-009): `fresh` (what
 * `init` or `sync` read from the clients this run) over the cache, over the
 * lists a 1.15.0 `manifest` still carries under `models.listed`, which move to
 * the cache at the next live run, and, for a client with none of those, over
 * the list the files already emitted give. Reads only; never starts a client.
 */
export async function resolveModelLists(
  rootDir: string,
  manifest: SetupManifest,
  fresh: ModelLists = {},
): Promise<ResolvedModelLists> {
  const [cache, fromFiles] = await Promise.all([readModelListCache(rootDir), emittedPickLists(rootDir, manifest)]);
  // A 1.15.0 manifest's lists are held to the cache reader's checks, the
  // 200-id ceiling among them, and taken whole or not at all (review/113): one
  // moved past the ceiling would write a cache every later read turns away.
  const saved = manifest.models?.listed;
  const savedDefects = saved === undefined ? [] : cacheDefects(saved);
  const migrated =
    savedDefects.length === 0
      ? null
      : `the model lists \`${MANIFEST_REPO_PATH}\` saves under \`models.listed\` were not moved to ${CLIENT_MODELS_CACHE_FILE}: ` +
        `${savedDefects.map((defect) => defect.replace(/^`listed\./, "`models.listed.")).join("; ")}; the next sync that reads a client keeps its list`;
  const kept = sortedLists({ ...(migrated === null ? saved : {}), ...cache.lists, ...structuredClone(fresh) });
  const unchanged = JSON.stringify(kept) === JSON.stringify(sortedLists(cache.lists));
  const emitted = withPins(fromFiles.lists, manifest, kept, fromFiles.replaced);
  const problems = [cache.problem, migrated].filter((problem) => problem !== null);
  return {
    effective: { ...emitted, ...kept },
    asEmitted: { ...kept, ...emitted },
    emitted,
    kept,
    toWrite: unchanged || Object.keys(kept).length === 0 ? null : kept,
    problem: problems.length === 0 ? null : problems.join("\n"),
  };
}

/**
 * `manifest` with `models.listed` set to `lists` (or without it, when empty),
 * as a new object: the in-memory copy a plan, a report or `config` resolves
 * picks from. `writeManifest` never writes the key.
 */
export function withModelLists(manifest: SetupManifest, lists: ModelLists): SetupManifest {
  const base = withoutListedModels(manifest);
  return Object.keys(lists).length === 0 ? base : { ...base, models: { ...base.models, listed: structuredClone(lists) } };
}
