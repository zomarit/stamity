import { lstat, readFile, readdir } from "node:fs/promises";
import { join, posix as posixPath, relative, resolve, sep } from "node:path";
import { isPlainObject, parseJsonStrict, unknownFields } from "../config/parse.ts";
import { checkLauncherArgv, type LauncherRefusalCode } from "../shared/launcherAllowlist.ts";
import { EngineError } from "../types/errors.ts";
import { CANONICAL_HOOK_EVENTS, isCanonicalHookEvent, type HookInterchange } from "./model.ts";

/**
 * User-authored hooks: first-class input, not decoration.
 *
 * Hooks a repo writes for itself live beside the generated setup, are read
 * here, and are carried through emission with the generated core set — the
 * returned shape is what emission consumes, so an authored hook cannot end up
 * parsed-but-never-emitted.
 *
 * A hook file is JSON declaring `{"hooks": [ ... ]}`. Ingress is strict,
 * because an accepted entry becomes an entry in the CLIENT'S OWN settings file
 * — `.claude/settings.json` and its siblings — and the client runs that command
 * on every matching tool call, with the operator's privileges. What lands there
 * is therefore judged as code, not as configuration: unknown fields are
 * rejected rather than dropped (a typo'd `timeout` must not silently become no
 * timeout), commands are exec-form argv, no argument may fetch over the
 * network, and every path an argument references stays inside the repo.
 *
 * The centre of that posture is {@link checkLauncherArgv}
 * (`../shared/launcherAllowlist.ts`), the fails-closed launcher allow-list this
 * lane shares with the pack MCP lane: `argv[0]` must be an allowed launcher,
 * no argument may carry an inline-code flag, and exactly one argument must name
 * a committed, repo-contained, existing script file. That is what makes the
 * load-time-execution claim true rather than aspirational — the deny-list it
 * replaced named twelve shells and passed `["node", "-e", …]`,
 * `["python3", "-c", …]` and `["env", "FOO=1", "node", "-e", "1"]`, every one of
 * which runs arbitrary code with no shell and no metacharacter anywhere in the
 * argv.
 *
 * Reading never throws on a bad hook. Defective entries — and files that cannot
 * be read at all — land in `errors` while healthy ones still load, so one
 * malformed or unreadable file cannot disarm a repo's whole hook set. Only the
 * hooks DIRECTORY being unreadable for a reason other than absence is fatal.
 */

/** Why a hook entry was rejected. One code per defect class, in check order. */
export type HookParseErrorCode =
  | "INVALID_JSON"
  | "UNREADABLE_FILE"
  | "UNKNOWN_EVENT"
  | "SHELL_FORM_COMMAND"
  | "NETWORK_FETCH"
  | "LAUNCHER_NOT_ALLOWED"
  | "INLINE_CODE_FLAG"
  | "NO_SCRIPT_ARGUMENT"
  | "MISSING_SCRIPT"
  | "UNSAFE_PATH";

/**
 * Launcher refusal -> hook defect class. The two path outcomes fold into the
 * codes this lane already reports for a path defect, so an operator reading
 * `UNSAFE_PATH` gets one meaning whether the offending path was the script or
 * an argument beside it; the three argv-shape outcomes keep their own codes,
 * because "this launcher is not allowed" and "this file does not exist" are
 * different things to fix.
 */
const LAUNCHER_DEFECT: Readonly<Record<LauncherRefusalCode, HookParseErrorCode>> = {
  LAUNCHER_NOT_ALLOWED: "LAUNCHER_NOT_ALLOWED",
  INLINE_CODE_FLAG: "INLINE_CODE_FLAG",
  NO_SCRIPT_ARGUMENT: "NO_SCRIPT_ARGUMENT",
  SCRIPT_OUTSIDE_REPO: "UNSAFE_PATH",
  SCRIPT_MISSING: "MISSING_SCRIPT",
};

export interface HookParseError {
  /** POSIX repo-relative path of the offending file. */
  file: string;
  code: HookParseErrorCode;
  /** Names the offending entry by index and states the fix. */
  message: string;
}

/** A parsed user hook, carrying the file that declared it for provenance. */
export interface UserHookDefinition extends HookInterchange {
  /** POSIX repo-relative path of the declaring file. */
  sourceFile: string;
}

export interface ReadHooksResult {
  hooks: UserHookDefinition[];
  errors: HookParseError[];
}

const HOOK_FILE_EXTENSION = ".json";
const DOCUMENT_FIELDS = ["hooks"] as const;
const HOOK_FIELDS = ["event", "matcher", "command", "timeoutMs"] as const;

/** Control operators that only mean anything to a shell, so their presence implies one. */
const SHELL_CONTROL_PATTERN = /[;|&`<>]|\$\(/;

/**
 * Network reach in a hook command. Matched against the whole command line so
 * the fetcher is caught whether it is the executable or an argument.
 */
const NETWORK_PATTERNS: readonly RegExp[] = [
  /(?:^|[\s/\\])curl\s/i,
  /(?:^|[\s/\\])wget\s/i,
  /\bfetch\(/,
  /\bhttps?:\/\//i,
];

/** Extensions that mark an argument as code the hook expects to execute. */
const SCRIPT_EXTENSIONS = [".mjs", ".cjs", ".js", ".ts", ".sh", ".bash", ".py", ".rb"];

/**
 * Read every hook declared under `hooksDir`.
 *
 * `rootDir` is the anchor for every repo-relative path an entry names — both
 * the containment judgement and the existence probe — and for the `sourceFile`
 * provenance on what is returned. Callers that know the root pass it, and
 * emission always does: the hooks directory is configurable to any depth
 * (`hooks`, `.stamity/hooks`, `.config/stamity/hooks` are all valid manifest
 * values), so the root cannot be recovered by counting segments above it.
 * Omitting it falls back to the grandparent, which is the root only for the
 * documented `<root>/.stamity/hooks` layout; a wrong anchor rejects a committed
 * script as missing and reports paths relative to somewhere else.
 *
 * Absence is not an error: a repo with no hooks and a repo whose hooks folder
 * was never created return the same empty result. Files are read in name order
 * and entries in declaration order; nothing is deduplicated, because two hooks
 * on one event is a legitimate authoring choice and collapsing them is an
 * emission-phase policy.
 */
export async function readHookDefinitions(
  hooksDir: string,
  rootDir?: string,
): Promise<ReadHooksResult> {
  const dir = resolve(hooksDir);
  const repoRoot = rootDir === undefined ? resolve(dir, "..", "..") : resolve(rootDir);

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { hooks: [], errors: [] };
    throw new EngineError(
      `Cannot read the hooks directory ${dir}: ${describeErrno(cause)}. ` +
        `Make it a readable directory, or remove it to run without user hooks.`,
      { code: "FS_ERROR", cause },
    );
  }

  // Files are classified in name order first, then loaded concurrently: the fold below
  // walks that same order, so concurrency never reorders hooks or errors.
  const sorted = entries.toSorted((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const loaded = await Promise.all(
    sorted.map((entry) => {
      const absolute = join(dir, entry.name);
      const file = repoRelative(repoRoot, absolute);

      // A symbolic link is not a reviewable, repo-committed file: its target can sit
      // anywhere on the machine and change after the file was reviewed.
      if (entry.isSymbolicLink()) {
        return {
          hooks: [],
          errors: [
            {
              file,
              code: "UNSAFE_PATH" as const,
              message: `${entry.name} is a symbolic link. Commit the hook file itself so its contents are reviewable.`,
            },
          ],
        };
      }
      if (!entry.isFile() || !entry.name.endsWith(HOOK_FILE_EXTENSION)) {
        return { hooks: [], errors: [] };
      }
      return readHookFile(absolute, file, repoRoot);
    }),
  );

  return {
    hooks: loaded.flatMap((result) => result.hooks),
    errors: loaded.flatMap((result) => result.errors),
  };
}

/** Load and validate one hook file. Every defect it finds is reported against `file`. */
async function readHookFile(
  absolute: string,
  file: string,
  repoRoot: string,
): Promise<ReadHooksResult> {
  let raw: string;
  try {
    raw = await readFile(absolute, "utf8");
  } catch (cause) {
    // Deleted between the listing and the read — nothing to report, nothing to load.
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return { hooks: [], errors: [] };
    // Every other errno is ONE file's defect, reported and skipped. Throwing here
    // aborted the whole read — emission and validation both — against this
    // module's own contract that a bad hook costs itself and not the hook set.
    return {
      hooks: [],
      errors: [
        {
          file,
          code: "UNREADABLE_FILE",
          message:
            `${file} could not be read (${describeErrno(cause)}), so the hooks it declares are skipped. ` +
            `Make it readable, or remove it to run without those hooks.`,
        },
      ],
    };
  }

  const declared = readDocument(raw, file);
  if (!declared.ok) {
    return { hooks: [], errors: [{ file, code: declared.code, message: declared.message }] };
  }

  const outcomes = await Promise.all(
    declared.entries.map((value, index) => validateEntry(value, `hooks[${index}]`, repoRoot)),
  );

  const hooks: UserHookDefinition[] = [];
  const errors: HookParseError[] = [];
  for (const outcome of outcomes) {
    if (outcome.ok) hooks.push({ ...outcome.hook, sourceFile: file });
    else errors.push({ file, code: outcome.code, message: outcome.message });
  }
  return { hooks, errors };
}

type Rejection = { readonly ok: false; readonly code: HookParseErrorCode; readonly message: string };

function reject(code: HookParseErrorCode, message: string): Rejection {
  return { ok: false, code, message };
}

/** Parse one file down to its hook entries. Shape defects read as INVALID_JSON. */
function readDocument(
  raw: string,
  file: string,
): { readonly ok: true; readonly entries: readonly unknown[] } | Rejection {
  let document: unknown;
  try {
    document = parseJsonStrict(raw, file);
  } catch (cause) {
    return reject("INVALID_JSON", cause instanceof Error ? cause.message : String(cause));
  }

  // `parseJsonStrict` already rejected a non-object root; the guard re-states it for the type.
  if (!isPlainObject(document)) {
    return reject("INVALID_JSON", `${file}: expected an object at the document root.`);
  }

  const stray = unknownFields(document, DOCUMENT_FIELDS);
  if (stray.length > 0) {
    return reject("INVALID_JSON", `unknown field(s) ${stray.join(", ")}; a hook file declares only \`hooks\`.`);
  }
  const declared = document.hooks;
  if (!Array.isArray(declared)) {
    return reject("INVALID_JSON", "`hooks` is required and must be an array of hook objects.");
  }
  return { ok: true, entries: declared };
}

/**
 * Validate one entry, returning at most one defect: checks run in a fixed
 * order and the first failure is the reported one, so an operator gets a
 * single unambiguous reason per hook.
 *
 * The network scan deliberately runs before the exec-form check. A command
 * that reaches out over the network is the severe finding whether it was
 * written as argv or as a shell line, and letting the shape verdict shadow it
 * would report the lesser defect.
 */
async function validateEntry(
  value: unknown,
  label: string,
  repoRoot: string,
): Promise<{ readonly ok: true; readonly hook: HookInterchange } | Rejection> {
  if (!isPlainObject(value)) {
    return reject("INVALID_JSON", `${label} must be an object.`);
  }

  const stray = unknownFields(value, HOOK_FIELDS);
  if (stray.length > 0) {
    return reject(
      "INVALID_JSON",
      `${label} carries unknown field(s) ${stray.join(", ")}; supported: ${HOOK_FIELDS.join(", ")}.`,
    );
  }

  const event = value.event;
  if (typeof event !== "string") {
    return reject("INVALID_JSON", `${label}.event is required and must be a string.`);
  }
  if (!isCanonicalHookEvent(event)) {
    return reject(
      "UNKNOWN_EVENT",
      `${label}.event "${event}" is not a portable hook event. Use one of: ${CANONICAL_HOOK_EVENTS.join(", ")}.`,
    );
  }

  const rawCommand = value.command;
  const commandLine = flattenCommand(rawCommand);
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(commandLine))) {
    return reject(
      "NETWORK_FETCH",
      `${label}.command reaches the network. Commit the code the hook runs and invoke it from the repo instead.`,
    );
  }
  if (typeof rawCommand === "string") {
    return reject(
      "SHELL_FORM_COMMAND",
      `${label}.command is a shell string. Use exec form — an argv array such as ["node", ".stamity/hooks/guard.mjs"].`,
    );
  }
  if (!isStringArray(rawCommand) || rawCommand.length === 0) {
    return reject("INVALID_JSON", `${label}.command must be a non-empty array of strings.`);
  }
  const launcher = checkLauncherArgv(rawCommand, repoRoot);
  if (!launcher.ok) {
    return reject(LAUNCHER_DEFECT[launcher.code], `${label}.command ${launcher.reason}`);
  }
  const shellish = rawCommand.find((argument) => SHELL_CONTROL_PATTERN.test(argument));
  if (shellish !== undefined) {
    return reject(
      "SHELL_FORM_COMMAND",
      `${label}.command argument ${JSON.stringify(shellish)} carries a shell operator, which exec form never interprets.`,
    );
  }

  const matcher = value.matcher;
  if (matcher !== undefined && typeof matcher !== "string") {
    return reject("INVALID_JSON", `${label}.matcher must be a string when present.`);
  }
  const timeoutMs = value.timeoutMs;
  if (timeoutMs !== undefined && !isPositiveInteger(timeoutMs)) {
    return reject("INVALID_JSON", `${label}.timeoutMs must be a positive whole number of milliseconds.`);
  }

  const pathDefect = await checkPaths(rawCommand, label, repoRoot);
  if (pathDefect) return pathDefect;

  return {
    ok: true,
    hook: {
      event,
      command: rawCommand,
      ...(matcher === undefined ? {} : { matcher }),
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    },
  };
}

/**
 * Every path-shaped argument must stay inside the repo; the code the hook
 * executes must additionally exist and be a regular file.
 *
 * Containment is checked for all of them because a path leaving the repo is a
 * trust defect regardless of what it is for. Existence is checked only for the
 * executable and for arguments that name a script, so an output path the hook
 * itself creates is not mistaken for a missing one.
 *
 * The SCRIPT argument has already been ruled on by {@link checkLauncherArgv},
 * which is the gate of record for it. This pass is what covers the arguments
 * BESIDE it — a `--config=…`, an output path, a data file — which the launcher
 * gate deliberately says nothing about beyond "it is not the program".
 */
async function checkPaths(
  command: readonly string[],
  label: string,
  repoRoot: string,
): Promise<Rejection | null> {
  const candidates = command
    .map((argument, index) => ({ index, candidate: pathCandidate(argument) }))
    .filter(({ candidate }) => isPathShaped(candidate));

  // Containment is lexical, so every path is judged before the filesystem is touched.
  const escaping = candidates.find(({ candidate }) => escapesRepo(candidate));
  if (escaping !== undefined) {
    return reject(
      "UNSAFE_PATH",
      `${label}.command references ${JSON.stringify(escaping.candidate)}, which resolves outside the repository. Hook scripts live in the repo and are committed with it.`,
    );
  }

  const executed = candidates.filter(
    ({ index, candidate }) => index === 0 || hasScriptExtension(candidate),
  );
  const probes = await Promise.all(
    executed.map(async ({ candidate }) => ({
      candidate,
      state: await probeScript(resolve(repoRoot, candidate)),
    })),
  );

  for (const { candidate, state } of probes) {
    if (state === "missing") {
      return reject(
        "MISSING_SCRIPT",
        `${label}.command references ${JSON.stringify(candidate)}, which does not exist. Commit the script before wiring the hook.`,
      );
    }
    if (state === "symlink") {
      return reject(
        "UNSAFE_PATH",
        `${label}.command references ${JSON.stringify(candidate)}, a symbolic link whose target is not reviewable in this repo.`,
      );
    }
    if (state === "not-a-file") {
      return reject(
        "MISSING_SCRIPT",
        `${label}.command references ${JSON.stringify(candidate)}, which is not a regular file.`,
      );
    }
  }
  return null;
}

type ScriptState = "file" | "missing" | "symlink" | "not-a-file";

/** `lstat`, not `stat`: a symlink is a defect here, not something to follow. */
async function probeScript(absolute: string): Promise<ScriptState> {
  try {
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) return "symlink";
    return stats.isFile() ? "file" : "not-a-file";
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw new EngineError(`Cannot stat the hook script ${absolute}: ${describeErrno(cause)}.`, {
      code: "FS_ERROR",
      cause,
    });
  }
}

/** Whole command line for the network scan, from either shape. */
function flattenCommand(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((part) => typeof part === "string").join(" ");
  return "";
}

/**
 * The path an argument carries. A flag contributes its `=` value (`--config=x`
 * points at `x`) and nothing otherwise, so a bare switch is never scanned as a
 * path.
 */
function pathCandidate(argument: string): string {
  if (!argument.startsWith("-")) return argument;
  const separator = argument.indexOf("=");
  return separator === -1 ? "" : argument.slice(separator + 1);
}

function isPathShaped(candidate: string): boolean {
  if (candidate === "") return false;
  return candidate.includes("/") || candidate.includes("\\") || hasScriptExtension(candidate);
}

function hasScriptExtension(candidate: string): boolean {
  const lower = candidate.toLowerCase();
  return SCRIPT_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/**
 * Absolute paths and any path normalising above its anchor escape the repo.
 * Backslashes count as separators so a path authored on Windows is judged the
 * same way on every platform.
 */
function escapesRepo(candidate: string): boolean {
  const unified = candidate.replaceAll("\\", "/");
  if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified)) return true;
  const normalized = posixPath.normalize(unified);
  return normalized === ".." || normalized.startsWith("../");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function repoRelative(repoRoot: string, absolute: string): string {
  return relative(repoRoot, absolute).split(sep).join("/");
}

function describeErrno(cause: unknown): string {
  const code = (cause as NodeJS.ErrnoException).code;
  return code ?? (cause instanceof Error ? cause.message : String(cause));
}
