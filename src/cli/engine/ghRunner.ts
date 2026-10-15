import { execFile } from "node:child_process";
import {
  fileSystemProbe,
  isNodeModulesBin,
  programNotFound,
  resolveProgramOnPath,
  searchPathOf,
} from "../../shared/programPath.ts";

/**
 * The engine's one door onto GitHub's REST API: `gh api`, under the operator's
 * own `gh` login, for the run verbs' draft pull request and the unattended
 * pre-flight's reads.
 *
 * What the door lets through is closed here, before `gh` starts:
 *
 * - the methods are `GET`, `POST` and `PATCH`; no `PUT` and no `DELETE`;
 * - the path is a REST path in a closed alphabet, never `graphql` (the only
 *   route to "ready for review", and refused in Claude Code's cloud) and never
 *   a word `gh` would read as a flag;
 * - a write reaches only a pull request, its body, or a comment on it
 *   ({@link WRITE_PATHS}); a merge, a ref, a file, a ruleset or a secret is no
 *   write this door makes, whatever the caller built.
 *
 * `gh` is started by an absolute path, the one {@link resolveProgramOnPath}
 * finds on `PATH` outside the working folder and outside any
 * `node_modules/.bin` folder, never by its bare name. The status is read from
 * the head `--include` prints, so a 4xx answer is a status, not a throw.
 */

/** The closed method set. */
export type GhMethod = "GET" | "POST" | "PATCH";

/** One REST call. `path` is relative to the API root, with or without a leading `/`. */
export interface GhRequest {
  method: GhMethod;
  path: string;
  body?: unknown;
}

/** What GitHub answered: the HTTP status and the body as JSON (`null` for an empty or non-JSON body). */
export interface GhResponse {
  status: number;
  json: unknown;
}

/** Where and how long one call runs. */
export interface GhApiOptions {
  /** The folder `gh` is started in, never searched for it; the process's own folder when omitted. */
  cwd?: string;
  /** The environment `gh` gets, credentials included; the process's own when omitted. */
  env?: NodeJS.ProcessEnv;
  /** Wall time before the call is stopped; 60 s when omitted. */
  timeoutMs?: number;
}

/** A call {@link ghApi} refused before `gh` started; `code` is `GH_REFUSED`. */
export interface GhRefusal extends Error {
  code: "GH_REFUSED";
}

const GH_TIMEOUT_MS = 60_000;

/** A list of pull requests or a protection document stays far under this. */
const GH_MAX_BUFFER = 16 * 1024 * 1024;

const METHODS: ReadonlySet<string> = new Set<GhMethod>(["GET", "POST", "PATCH"]);

/**
 * A REST path: it starts with a letter or digit, so `gh` never reads it as a
 * flag, and holds only the characters a path and an encoded query need. No
 * space, no quote, no `{` (`gh`'s own placeholders), no `#`.
 */
const PATH_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._~%/:?=&,+-]*$/;

/** A repository name part, as `owner` and `repo` are validated everywhere a path is built. */
const PART = "[A-Za-z0-9._-]+";

/**
 * Every path a write may name: the pull request list (to open one), one pull
 * request (to replace its body), and a comment on one, as an issue comment or
 * a review-comment reply. Nothing after the number, so `…/merge` and
 * `…/requested_reviewers` are no write of this door.
 */
const WRITE_PATHS: readonly RegExp[] = [
  new RegExp(`^repos/${PART}/${PART}/pulls$`),
  new RegExp(`^repos/${PART}/${PART}/pulls/[1-9][0-9]*$`),
  new RegExp(`^repos/${PART}/${PART}/issues/[1-9][0-9]*/comments$`),
  new RegExp(`^repos/${PART}/${PART}/pulls/[1-9][0-9]*/comments$`),
];

function refusal(message: string): GhRefusal {
  return Object.assign(new Error(message), { code: "GH_REFUSED" as const });
}

/** `path` without its leading `/`, or the reason it is refused. */
function checkedPath(request: GhRequest): { path: string } | { refused: string } {
  if (!METHODS.has(request.method)) return { refused: `gh api: method ${String(request.method)} is not one this runner sends` };
  const path = request.path.replace(/^\//, "");
  if (!PATH_SHAPE.test(path)) return { refused: "gh api: the path is not a REST path this runner sends" };
  const segments = path.split("?", 1)[0]?.split("/") ?? [];
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return { refused: "gh api: the path holds a dot segment" };
  }
  if (segments[0]?.toLowerCase() === "graphql") return { refused: "gh api: graphql is not a call this runner makes" };
  if (request.method !== "GET" && !WRITE_PATHS.some((shape) => shape.test(path))) {
    return { refused: `gh api: ${request.method} is sent only to a pull request or a comment on one` };
  }
  return { path };
}

/**
 * The argument vector `gh` is started with for `request`, after the checks of
 * {@link ghApi}: `api --include --method <M>`, `--input -` when a body goes on
 * stdin, then the path.
 */
export function ghApiArgs(request: GhRequest): string[] {
  const checked = checkedPath(request);
  if ("refused" in checked) throw refusal(checked.refused);
  return [
    "api",
    "--include",
    "--method",
    request.method,
    ...(request.body === undefined ? [] : ["--input", "-"]),
    checked.path,
  ];
}

/**
 * Read what `gh api --include` printed: the status from the head's first line
 * (`HTTP/2.0 422 Unprocessable Entity`), the body after the first blank line.
 * `null` when the output carries no such head (`gh` failed before any answer).
 */
export function parseGhInclude(stdout: string): GhResponse | null {
  const match = /^HTTP\/[0-9.]+ ([1-5][0-9]{2})\b/.exec(stdout);
  if (match === null) return null;
  const blank = /\r?\n\r?\n/.exec(stdout);
  const text = blank === null ? "" : stdout.slice(blank.index + blank[0].length).trim();
  let json: unknown = null;
  if (text !== "") {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  return { status: Number(match[1]), json };
}

/**
 * The environment `gh` runs under: the caller's, its token included, with
 * `gh`'s own prompts and update check off.
 */
function ghEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1" };
}

/** The absolute path of the `gh` to start in `cwd`, or `null` where no accepted `PATH` entry holds one. */
function ghProgram(cwd: string, env: NodeJS.ProcessEnv): string | null {
  const platform = process.platform;
  const windows = platform === "win32";
  const delimiter = windows ? ";" : ":";
  const path = searchPathOf(env, platform)
    ?.split(delimiter)
    .filter((entry) => !isNodeModulesBin(entry, windows))
    .join(delimiter);
  return resolveProgramOnPath("gh", { platform, path, cwd, probe: fileSystemProbe });
}

/**
 * One REST call through `gh api`. Rejects with a {@link GhRefusal} before `gh`
 * starts for a method or a path outside the closed sets; with Node's `ENOENT`
 * error, no program started, where no `PATH` entry holds `gh`; and with an
 * error naming `gh`'s first stderr line where `gh` printed no HTTP head (no
 * login, no network). Any answer GitHub gave, a 4xx included, resolves.
 */
export function ghApi(request: GhRequest, opts: GhApiOptions = {}): Promise<GhResponse> {
  let args: string[];
  try {
    args = ghApiArgs(request);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  const cwd = opts.cwd ?? process.cwd();
  const env = ghEnv(opts.env ?? process.env);
  const gh = ghProgram(cwd, env);
  if (gh === null) return Promise.reject(programNotFound("gh", "spawn", args));
  const input = request.body === undefined ? "" : JSON.stringify(request.body);
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      gh,
      args,
      { cwd, env, encoding: "utf8", timeout: opts.timeoutMs ?? GH_TIMEOUT_MS, maxBuffer: GH_MAX_BUFFER, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null && (typeof error.code !== "number" || error.killed === true)) {
          rejectPromise(error);
          return;
        }
        const response = parseGhInclude(stdout);
        if (response !== null) {
          resolvePromise(response);
          return;
        }
        const first = stderr.split(/\r?\n/).find((line) => line.trim() !== "") ?? "no output";
        rejectPromise(new Error(`gh api answered no HTTP status: ${first.slice(0, 200)}`));
      },
    ).stdin?.end(input);
  });
}
