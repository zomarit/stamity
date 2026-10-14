import { execFile } from "node:child_process";
import {
  fileSystemProbe,
  resolveProgramOnPath,
  searchPathOf,
  type ProgramFileProbe,
} from "../../shared/programPath.ts";
import type { Tool } from "../../types/core.ts";
import type { ListedModels } from "../../types/manifest.ts";

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
 * Nothing a client prints is trusted until parsed. The program is found by a
 * `PATH` walk that never searches the working folder (`resolveProgramOnPath`),
 * so a file a repository commits under a client's name is not what starts; the
 * output must open with that client's own header or the outcome is
 * `unreadable`; and an id is kept only when it has the shape of a model id
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
  return text.replace(/^﻿/, "").replaceAll(ANSI_SEQUENCE, "").split(/\r?\n/);
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
}

/** The first of `programs` the walk finds, by name and absolute path, or `null`. */
function findProgram(
  programs: readonly string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
  platform: NodeJS.Platform,
  probe: ProgramFileProbe,
): { name: string; path: string } | null {
  const path = searchPathOf(env, platform);
  for (const name of programs) {
    const found = resolveProgramOnPath(name, { platform, path, cwd, probe });
    if (found !== null) return { name, path: found };
  }
  return null;
}

/**
 * Read `tool`'s model list for this account by starting its own CLI, once.
 *
 * `absent` when the switch is set, when the client has no listing command
 * (Claude Code), or when no `PATH` entry the walk accepts holds the program —
 * on Windows that includes an npm shim (`codex.cmd`), which is not started
 * without a shell, so the shipped fallback applies there. `timeout` when the
 * child outlives the ceiling and is killed. `unreadable` when it exits non-zero,
 * prints past the byte ceiling, or prints something that is not the client's
 * listing; the message names the call and never repeats the child's output.
 * Never throws.
 */
export function listClientModels(
  tool: Tool,
  env: NodeJS.ProcessEnv,
  cwd: string,
  options: ListClientModelsOptions = {},
): Promise<ModelListOutcome> {
  const lister = LISTERS[tool];
  if (lister === undefined || env["STAMITY_NO_CLIENT_PROBE"] === "1") return Promise.resolve({ kind: "absent" });
  const platform = options.platform ?? process.platform;
  const program = findProgram(lister.programs, env, cwd, platform, options.probe ?? fileSystemProbe);
  if (program === null) return Promise.resolve({ kind: "absent" });
  const args = tool === "codex" && options.codexBundled === true ? [...lister.args, "--bundled"] : [...lister.args];
  const call = `${program.name} ${args.join(" ")}`;

  return new Promise((resolveOutcome) => {
    const child = execFile(
      program.path,
      args,
      {
        cwd,
        env,
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
