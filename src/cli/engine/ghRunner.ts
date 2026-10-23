import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import {
  fileSystemProbe,
  isNodeModulesBin,
  programNotFound,
  resolveProgramOnPath,
  searchPathOf,
} from "../../shared/programPath.ts";
// The one host grammar (review/202): a bare lowercase host name, as `gh api --hostname` takes it.
import { HOST_NAME } from "../../runs/pullRequest.ts";

/**
 * The engine's one door onto GitHub's REST API: `gh api`, under the operator's
 * own `gh` login, for the run verbs' draft pull request and the unattended
 * pre-flight's reads.
 *
 * What the door lets through is closed here, before `gh` starts:
 *
 * - the methods are `GET`, `POST` and `PATCH`; no `PUT` and no `DELETE`;
 * - the path is a REST path in a closed alphabet, never `graphql` (the only
 *   route to "ready for review", and refused in Claude Code's cloud), never a
 *   word `gh` would read as a flag, and never a URL of its own (no scheme, no
 *   `:`, no `//`), so every call goes to the API root of the named host;
 * - the host is named on every call (`--hostname`), the one the caller
 *   matched the repository on, never `gh`'s own default;
 * - a write reaches only a pull request, its body, or a comment on it
 *   ({@link WRITE_PATHS}); a merge, a ref, a file, a ruleset or a secret is no
 *   write this door makes, whatever the caller built.
 *
 * `gh` is started by an absolute path, the one {@link resolveProgramOnPath}
 * finds on `PATH` outside the working folder and outside any
 * `node_modules/.bin` folder, never by its bare name. The status is read from
 * the head `--include` prints, so a 4xx answer is a status, not a throw.
 *
 * `stamity run land` (REQ-FLOW-132) needs three calls this door refuses, so
 * each is a fixed-purpose function of its own beside it, its path built here
 * from validated parts and never from a caller's text: {@link ghMergePull}
 * (`PUT …/pulls/<n>/merge` with the head `sha`), {@link ghReviewThreads} and
 * {@link ghMarkReady} (`POST graphql`, each with its one constant document,
 * {@link ghGraphqlArgs} refusing any other). {@link ghApi} itself still
 * refuses `PUT`, every merge path and `graphql`.
 */

/** The closed method set. */
type GhMethod = "GET" | "POST" | "PATCH";

/** One REST call. `path` is relative to the API root, with or without a leading `/`. */
export interface GhRequest {
  method: GhMethod;
  path: string;
  body?: unknown;
  /** The GitHub host the call goes to (`gh api --hostname`): the host the repository was matched on. */
  hostname: string;
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
  /**
   * review/75: the absolute path of the `gh` to start, one {@link ghProgramPath} resolved and the caller checked;
   * resolved again from `PATH` when omitted. So a caller that vetted one program runs that program on every call.
   */
  program?: string;
}

/** A call {@link ghApi} refused before `gh` started; `code` is `GH_REFUSED`. */
interface GhRefusal extends Error {
  code: "GH_REFUSED";
}

const GH_TIMEOUT_MS = 60_000;

/** A list of pull requests or a protection document stays far under this. */
const GH_MAX_BUFFER = 16 * 1024 * 1024;

const METHODS: ReadonlySet<string> = new Set<GhMethod>(["GET", "POST", "PATCH"]);

/**
 * A REST path: it starts with a letter or digit, so `gh` never reads it as a
 * flag, and holds only the characters a path and an encoded query need. No
 * space, no quote, no `{` (`gh`'s own placeholders), no `#`, and no `:`, so no
 * scheme: `gh api` sends an endpoint holding `://` to that URL as given.
 */
const PATH_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._~%/?=&,+-]*$/;

/**
 * `gh`'s own words for a missing or refused login, matched in its stderr to
 * class the failure (`GH_NOT_LOGGED_IN`); the stderr itself is never a class.
 */
const NO_LOGIN = /gh auth login|not logged in/i;

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
  if (typeof request.hostname !== "string" || !HOST_NAME.test(request.hostname)) {
    return { refused: "gh api: the host is not a host name this runner sends to" };
  }
  const path = request.path.replace(/^\//, "");
  if (!PATH_SHAPE.test(path) || path.includes("//")) return { refused: "gh api: the path is not a REST path this runner sends" };
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
 * {@link ghApi}: `api --hostname <host> --include --method <M>`, `--input -`
 * when a body goes on stdin, then the path.
 */
export function ghApiArgs(request: GhRequest): string[] {
  const checked = checkedPath(request);
  if ("refused" in checked) throw refusal(checked.refused);
  return [
    "api",
    "--hostname",
    request.hostname,
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

/** Variables that keep `gh`'s ANSI colours on a pipe, which would wrap the JSON body and break its parse. */
const COLOUR_FORCING: ReadonlySet<string> = new Set(["CLICOLOR_FORCE", "GH_FORCE_TTY"]);

/**
 * The environment `gh` runs under: the caller's, its token included, with
 * `gh`'s own prompts and update check off and its colours off (`NO_COLOR`,
 * the colour-forcing variables dropped, in any case Windows spells them).
 */
function ghEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.fromEntries(Object.entries(base).filter(([key]) => !COLOUR_FORCING.has(key.toUpperCase())));
  return { ...kept, GH_PROMPT_DISABLED: "1", GH_NO_UPDATE_NOTIFIER: "1", NO_COLOR: "1" };
}

/**
 * The absolute path of the `gh` every call here starts for `opts` (its folder and its environment), or `null` where
 * no accepted `PATH` entry holds one: what `run land` checks lies outside the work tree and the temp folders before
 * it trusts GitHub's answers.
 */
export function ghProgramPath(opts: GhApiOptions = {}): string | null {
  return ghProgram(opts.cwd ?? process.cwd(), ghEnv(opts.env ?? process.env));
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
 * login, no network), its `code` the class a caller may report without the
 * stderr (review/199): `GH_NOT_LOGGED_IN` where `gh` asked for a login, else
 * `GH_NO_STATUS`. Any answer GitHub gave, a 4xx included, resolves. A
 * body `gh` never read (it exited first) is no throw: the exit decides.
 */
export function ghApi(request: GhRequest, opts: GhApiOptions = {}): Promise<GhResponse> {
  return startGh(() => ghApiArgs(request), request.body, opts);
}

/**
 * Start `gh` with the arguments `build` returns (a throw there is a rejection before `gh` starts) and `body`, as JSON,
 * on its stdin; resolve GitHub's answer as {@link ghApi} does.
 */
function startGh(build: () => string[], body: unknown, opts: GhApiOptions): Promise<GhResponse> {
  let args: string[];
  try {
    args = build();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  const cwd = opts.cwd ?? process.cwd();
  const env = ghEnv(opts.env ?? process.env);
  if (opts.program !== undefined && !isAbsolute(opts.program)) return Promise.reject(refusal("gh: the program to start is not an absolute path"));
  const gh = opts.program ?? ghProgram(cwd, env);
  if (gh === null) return Promise.reject(programNotFound("gh", "spawn", args));
  const input = body === undefined ? "" : JSON.stringify(body);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = execFile(
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
        const code = NO_LOGIN.test(stderr) ? "GH_NOT_LOGGED_IN" : "GH_NO_STATUS";
        rejectPromise(Object.assign(new Error(`gh api answered no HTTP status: ${first.slice(0, 200)}`), { code }));
      },
    );
    // `gh` can exit before it reads a body larger than the pipe buffer (no
    // login, say); the write then fails with EPIPE, which unheard would be an
    // uncaught throw. The exit callback above decides the outcome instead.
    child.stdin?.on("error", () => undefined);
    child.stdin?.end(input);
  });
}

/** A pull request named by its repository and number, on the host the repository was matched on. */
export interface PullRef {
  hostname: string;
  owner: string;
  repo: string;
  number: number;
}

/** The merge methods GitHub's merge call takes. */
export type MergeMethod = "merge" | "squash" | "rebase";

const MERGE_METHODS: ReadonlySet<string> = new Set<MergeMethod>(["merge", "squash", "rebase"]);

/** A full commit id, SHA-1 or SHA-256. */
const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const PART_SHAPE = new RegExp(`^${PART}$`);

/** Why `ref` is not one this runner builds a path from, or `null`. */
function pullRefRefusal(ref: PullRef): string | null {
  if (typeof ref.hostname !== "string" || !HOST_NAME.test(ref.hostname)) return "the host is not a host name this runner sends to";
  for (const part of [ref.owner, ref.repo]) {
    if (typeof part !== "string" || !PART_SHAPE.test(part) || part === "." || part === "..") return "the repository is not one this runner names";
  }
  if (!Number.isSafeInteger(ref.number) || ref.number < 1) return "the pull request number is not a number this runner sends";
  return null;
}

/**
 * The argument vector of {@link ghMergePull}: `PUT repos/<owner>/<repo>/pulls/<n>/merge`, the body on stdin. Throws
 * a {@link GhRefusal} for a part that fails validation, a `sha` that is not a full commit id, or an unknown method.
 */
export function ghMergeArgs(request: PullRef & { sha: string; method: MergeMethod }): string[] {
  const refused = pullRefRefusal(request);
  if (refused !== null) throw refusal(`gh merge: ${refused}`);
  if (typeof request.sha !== "string" || !FULL_SHA.test(request.sha)) throw refusal("gh merge: the head is not a full commit id");
  if (!MERGE_METHODS.has(request.method)) throw refusal(`gh merge: ${String(request.method)} is not a merge method`);
  const path = `repos/${request.owner}/${request.repo}/pulls/${request.number}/merge`;
  return ["api", "--hostname", request.hostname, "--include", "--method", "PUT", "--input", "-", path];
}

/**
 * Merge one pull request at exactly `sha` (`PUT …/pulls/<n>/merge` with `{ sha, merge_method }`): GitHub refuses
 * with 409 when the head moved. Never an admin route: the caller merges only on a `clean` mergeable state.
 */
export function ghMergePull(request: PullRef & { sha: string; method: MergeMethod }, opts: GhApiOptions = {}): Promise<GhResponse> {
  return startGh(() => ghMergeArgs(request), { sha: request.sha, merge_method: request.method }, opts);
}

/**
 * The one review-thread read (a constant document): the authenticated login, then per thread whether it is resolved,
 * who resolved it, and every comment's author (review/71), each a person (`User`) or an app (`Bot`), with the
 * thread's comment count, so a thread holding more comments than one page reads as not read whole.
 */
export const REVIEW_THREADS_QUERY =
  "query($owner:String!,$repo:String!,$number:Int!,$after:String){viewer{login}repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$after){nodes{isResolved resolvedBy{login}comments(first:100){totalCount nodes{author{__typename login}}}}pageInfo{hasNextPage endCursor}}}}}";

/** The one mutation: mark the pull request with this node id ready for review (a constant document). */
export const MARK_READY_MUTATION =
  "mutation($id:ID!){markPullRequestReadyForReview(input:{pullRequestId:$id}){pullRequest{isDraft}}}";

const GRAPHQL_DOCUMENTS: ReadonlySet<string> = new Set([REVIEW_THREADS_QUERY, MARK_READY_MUTATION]);

/**
 * The argument vector of a GraphQL call: `POST graphql`, the document and its variables on stdin. Throws a
 * {@link GhRefusal} for any document but {@link REVIEW_THREADS_QUERY} and {@link MARK_READY_MUTATION}, so no caller
 * reaches GitHub's GraphQL with text of its own.
 */
export function ghGraphqlArgs(request: { hostname: string; query: string }): string[] {
  if (typeof request.hostname !== "string" || !HOST_NAME.test(request.hostname)) throw refusal("gh graphql: the host is not a host name this runner sends to");
  if (!GRAPHQL_DOCUMENTS.has(request.query)) throw refusal("gh graphql: the document is not one this runner sends");
  return ["api", "--hostname", request.hostname, "--include", "--method", "POST", "--input", "-", "graphql"];
}

function graphql(hostname: string, query: string, variables: Record<string, unknown>, opts: GhApiOptions): Promise<GhResponse> {
  return startGh(() => ghGraphqlArgs({ hostname, query }), { query, variables }, opts);
}

/** One page (100 threads) of a pull request's review threads, after the cursor `after` where given. */
export function ghReviewThreads(request: PullRef & { after?: string }, opts: GhApiOptions = {}): Promise<GhResponse> {
  const refused = pullRefRefusal(request);
  if (refused !== null) return Promise.reject(refusal(`gh graphql: ${refused}`));
  const { owner, repo, number } = request;
  return graphql(request.hostname, REVIEW_THREADS_QUERY, { owner, repo, number, after: request.after ?? null }, opts);
}

/** Mark the pull request whose GraphQL node id is `id` ready for review. */
export function ghMarkReady(request: { hostname: string; id: string }, opts: GhApiOptions = {}): Promise<GhResponse> {
  if (typeof request.id !== "string" || !/^[A-Za-z0-9_=-]{1,128}$/.test(request.id)) return Promise.reject(refusal("gh graphql: the node id is not one this runner sends"));
  return graphql(request.hostname, MARK_READY_MUTATION, { id: request.id }, opts);
}
