import { parseGitRemote } from "../workspace/git.ts";

/**
 * The draft pull request an unattended run ends on (REQ-FLOW-092), as logic
 * over one injected REST seam, so every branch of it is provable with no
 * network.
 *
 * The seam is the shape of the CLI's `gh api` runner
 * (`../cli/engine/ghRunner.ts::ghApi`), restated here because the engine never
 * imports the CLI. Every path this module builds is a fixed template whose
 * parts are validated first, the methods are `GET`, `POST` and `PATCH`, and a
 * pull request's body is replaced only when it already ends with this run's
 * own marker: any other open pull request on the branch, a person's, keeps its
 * body and gets the text as one comment. No call here merges, marks ready, or
 * goes through GraphQL.
 */

/** One REST call and its answer, as `ghApi` takes and returns them. */
export interface RestRequest {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
}

/** GitHub's answer: the HTTP status and the JSON body (`null` when there was none). */
export interface RestResponse {
  status: number;
  json: unknown;
}

/** The REST seam {@link ensureDraftPr} calls. */
export type GhApi = (request: RestRequest) => Promise<RestResponse>;

/** What the run asks for. */
export interface DraftPrRequest {
  owner: string;
  repo: string;
  /** The run's own branch, pushed already. */
  head: string;
  /** The branch the pull request targets. */
  base: string;
  title: string;
  /** The morning list's body; this run's marker is appended where it does not already end it. */
  body: string;
  runId: string;
}

/**
 * What happened: a pull request found and its body replaced (`existing`), a
 * person's pull request commented on (`commented`), one opened as a draft
 * (`created`) or, where the repository takes no drafts, as a normal one titled
 * `[DRAFT]` (`created-fallback`); else why none was.
 */
export type PrOutcome =
  | { number: number; url: string; how: "existing" | "commented" | "created" | "created-fallback" }
  | { notDone: string };

/** An owner, a repository or a run id: the characters GitHub and the run folder allow, never a path part of its own. */
const NAME_PART = /^[A-Za-z0-9._-]+$/;

/** Characters git's `check-ref-format` forbids anywhere in a branch name. */
const REF_FORBIDDEN = ["~", "^", ":", "?", "*", "[", "\\", "..", "@{"];

/** The HTML comment that ends a body this run wrote (the marker form of `st-board.md`'s board writes). */
export function runMarker(runId: string): string {
  return `<!-- stamity:run ${runId} -->`;
}

function isNamePart(value: string): boolean {
  return NAME_PART.test(value) && value !== "." && value !== "..";
}

/** A branch name git would accept, and nothing a query string could be steered by unencoded. */
function isBranchName(value: string): boolean {
  if (value === "" || value === "HEAD" || value.length > 255) return false;
  if (value.startsWith("-") || value.startsWith("/") || value.endsWith("/") || value.endsWith(".")) return false;
  if (value.endsWith(".lock") || /[\s\p{Cc}]/u.test(value)) return false;
  return !REF_FORBIDDEN.some((token) => value.includes(token));
}

/** `body` ending with `marker`, appended on its own line where it does not already end the text. */
function withMarker(body: string, marker: string): string {
  const trimmed = body.trimEnd();
  return trimmed.endsWith(marker) ? trimmed : `${trimmed}\n\n${marker}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOk(status: number): boolean {
  return status >= 200 && status < 300;
}

/** The fields of one pull request this module reads, or `null` when the answer does not carry them. */
interface FoundPr {
  number: number;
  url: string;
  body: string;
}

function prFields(value: unknown): FoundPr | null {
  if (!isRecord(value)) return null;
  const { number, html_url: url, body } = value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) return null;
  if (typeof url !== "string") return null;
  return { number, url, body: typeof body === "string" ? body : "" };
}

/**
 * The open pull request whose head is exactly `owner:head`, from a list
 * answer. Matched again here rather than trusted to the query: GitHub answers
 * a `head` filter it cannot read with every open pull request.
 */
function openPrOnBranch(json: unknown, owner: string, head: string): FoundPr | null {
  if (!Array.isArray(json)) return null;
  for (const entry of json) {
    if (!isRecord(entry) || !isRecord(entry["head"])) continue;
    const { ref, label } = entry["head"];
    if (ref !== head || (label !== undefined && label !== `${owner}:${head}`)) continue;
    const found = prFields(entry);
    if (found !== null) return found;
  }
  return null;
}

/** Every message a 422 answer carries, its `errors[]` included, as one lowercased text. */
function validationText(json: unknown): string {
  if (!isRecord(json)) return "";
  const parts: string[] = [];
  if (typeof json["message"] === "string") parts.push(json["message"]);
  if (Array.isArray(json["errors"])) {
    for (const entry of json["errors"]) {
      if (typeof entry === "string") parts.push(entry);
      else if (isRecord(entry) && typeof entry["message"] === "string") parts.push(entry["message"]);
    }
  }
  return parts.join("\n").toLowerCase();
}

/** True for the error Node raises where no program of the name could be started. */
function programMissing(error: unknown): boolean {
  return isRecord(error) && error["code"] === "ENOENT";
}

/**
 * Open or update the run's one draft pull request.
 *
 * 1. `GET …/pulls?head=<owner>:<head>&state=open`: an open one on the branch
 *    whose body ends with this run's marker gets its body replaced, the body
 *    alone (`PATCH …/pulls/<n>`); any other gets the body as one comment
 *    (`POST …/issues/<n>/comments`), its own body untouched.
 * 2. Else `POST …/pulls` with `draft: true`.
 * 3. A 422 saying one already exists looks again (step 1) and never falls
 *    back; a 422 naming drafts posts a normal one titled `[DRAFT] <title>`.
 * 4. Else `{ notDone: "draft PR not opened (<head>)" }`; with no `gh` at all,
 *    `{ notDone: "gh not found" }`. Never a throw.
 */
export async function ensureDraftPr(gh: GhApi, request: DraftPrRequest): Promise<PrOutcome> {
  const { owner, repo, head, base, title, runId } = request;
  if (!isNamePart(owner) || !isNamePart(repo) || !isNamePart(runId) || !isBranchName(head) || !isBranchName(base)) {
    return { notDone: "draft PR not opened (an owner, repository, branch or run id failed validation)" };
  }
  const notOpened: PrOutcome = { notDone: `draft PR not opened (${head})` };
  const marker = runMarker(runId);
  const body = withMarker(request.body, marker);
  const repoPath = `repos/${owner}/${repo}`;

  /** Step 1 over an open pull request already found. */
  const update = async (found: FoundPr): Promise<PrOutcome> => {
    if (found.body.trimEnd().endsWith(marker)) {
      const patched = await gh({ method: "PATCH", path: `${repoPath}/pulls/${found.number}`, body: { body } });
      return isOk(patched.status) ? { number: found.number, url: found.url, how: "existing" } : notOpened;
    }
    const commented = await gh({ method: "POST", path: `${repoPath}/issues/${found.number}/comments`, body: { body } });
    return isOk(commented.status) ? { number: found.number, url: found.url, how: "commented" } : notOpened;
  };

  /** The lookup; `undefined` when GitHub did not answer it, so no step after it can be trusted. */
  const lookup = async (): Promise<FoundPr | null | undefined> => {
    const query = `head=${encodeURIComponent(`${owner}:${head}`)}&state=open`;
    const listed = await gh({ method: "GET", path: `${repoPath}/pulls?${query}` });
    return isOk(listed.status) ? openPrOnBranch(listed.json, owner, head) : undefined;
  };

  /** One `POST …/pulls`: the outcome, or the 422's text for the caller to read. */
  const create = async (payload: Record<string, unknown>, how: "created" | "created-fallback"): Promise<PrOutcome | { rejected: string }> => {
    const created = await gh({ method: "POST", path: `${repoPath}/pulls`, body: payload });
    if (created.status === 422) return { rejected: validationText(created.json) };
    const fields = isOk(created.status) ? prFields(created.json) : null;
    return fields === null ? notOpened : { number: fields.number, url: fields.url, how };
  };

  /** A 422 saying the branch already has one: look again and update it, never the fallback. */
  const relook = async (): Promise<PrOutcome> => {
    const again = await lookup();
    return again === null || again === undefined ? notOpened : update(again);
  };

  try {
    const found = await lookup();
    if (found === undefined) return notOpened;
    if (found !== null) return await update(found);

    const first = await create({ title, head, base, body, draft: true }, "created");
    if (!("rejected" in first)) return first;
    if (first.rejected.includes("already exists")) return await relook();
    if (!first.rejected.includes("draft")) return notOpened;

    const fallback = await create({ title: `[DRAFT] ${title}`, head, base, body }, "created-fallback");
    if (!("rejected" in fallback)) return fallback;
    return fallback.rejected.includes("already exists") ? await relook() : notOpened;
  } catch (error) {
    return programMissing(error) ? { notDone: "gh not found" } : notOpened;
  }
}

/** The proxy origin Claude Code's cloud gives a checkout: `http://<user>@127.0.0.1:<port>/git/<owner>/<repo>`. */
const CLAUDE_PROXY_ORIGIN = /^http:\/\/[^/@\s]+@127\.0\.0\.1:[0-9]{1,5}\/git\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;

/** `GH_HOST` as a bare lowercase host: no scheme, no port, no trailing `/`. */
function hostOf(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/:].*$/, "");
}

/**
 * The GitHub repository `origin` names, or `null` where it names none `gh`
 * would reach. Accepted: Claude Code's proxy shape; else a remote on the host
 * `gh` talks to — `GH_HOST` when it is set, `github.com` when it is not, so a
 * `github.com` origin under a `GH_HOST` naming another host is `null`, since
 * every call would go to that other host. Any other host is `null`, and so is
 * an owner or repository outside `[A-Za-z0-9._-]`.
 */
export function resolveRepo(env: NodeJS.ProcessEnv, originUrl: string): { owner: string; repo: string } | null {
  const proxied = CLAUDE_PROXY_ORIGIN.exec(originUrl.trim());
  let owner: string;
  let repo: string;
  if (proxied !== null) {
    owner = proxied[1] ?? "";
    repo = proxied[2] ?? "";
  } else {
    const parsed = parseGitRemote(originUrl);
    if (parsed === null) return null;
    const configured = env["GH_HOST"];
    const host = configured === undefined || configured.trim() === "" ? "github.com" : hostOf(configured);
    if (parsed.host !== host) return null;
    ({ owner, repo } = parsed);
  }
  return isNamePart(owner) && isNamePart(repo) ? { owner, repo } : null;
}
