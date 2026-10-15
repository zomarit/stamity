/**
 * The unattended pre-flight's checks (REQ-FLOW-101), as pure functions over
 * injected reads.
 *
 * An unattended run starts only when every check passes. `ok` is false on any
 * `refuse` and on any `unknown`: a state the engine could not read is never
 * taken as safe. Warnings never refuse.
 *
 * The wall is `direct-push`: REST reads the engine makes itself, through the
 * injected {@link RestRead}, about the `origin` repository it resolved itself,
 * must prove the account cannot push to the default branch — an active ruleset
 * whose pull-request or update rule the account cannot bypass for a direct
 * push, or classic protection requiring a pull request that binds this
 * account. No protection, a direct-push bypass, a 403, a 404, a non-GitHub
 * origin, or `GH_REPO` naming another repository all refuse. `hooks-loaded`
 * is a canary, not a wall: the shell guard writes it, and a steered run could
 * write it too.
 *
 * No value is ever echoed: `token-env` names variables only, and no evidence
 * string carries an environment value or the canary's raw text. Erasable
 * syntax only, since `scripts/generate-docs.mjs` loads the CLI, and with it
 * this module, by Node's type stripping.
 */

import semver from "semver";
import { scanValueForSecrets } from "../mcp/secretScan.ts";

/** One GitHub REST read: the path (`/repos/...`), answered with its HTTP status and parsed body. */
export type RestRead = (path: string) => Promise<{ status: number; json: unknown }>;

type CheckId = "hooks-loaded" | "node-engine" | "cli-pin" | "gate-scan" | "direct-push" | "input-author" | "floors";
type CheckState = "pass" | "refuse" | "unknown";
type WarningId = "cursor-egress" | "token-env" | "review-state";

export interface PreflightVerdict {
  ok: boolean;
  checks: { id: CheckId; state: CheckState; evidence: string }[];
  refusals: { id: CheckId; reason: string; fix: string }[];
  warnings: { id: WarningId; names?: string[] }[];
}

interface RepoRef {
  owner: string;
  repo: string;
}

export interface PreflightDeps {
  env: Readonly<Record<string, string | undefined>>;
  /** `process.versions.node`; a leading `v` is accepted. */
  nodeVersion: string;
  /** `package.json`'s `engines.node` range; absent, any node passes. */
  engines?: string | undefined;
  /** The manifest's `generatedBy`; absent, the pin cannot be read. */
  pinnedVersion?: string | undefined;
  runningVersion: string;
  /** Resolves true when `gate scan` can run here. */
  scanRuns: () => Promise<boolean>;
  /** `null` when `gh` is not available. */
  rest: RestRead | null;
  /** The `origin` repository; `null` for no origin or a non-GitHub host. */
  repo: RepoRef | null;
  /** `GH_REPO` as set, or `null`. */
  ghRepoEnv: string | null;
  /** The shell guard's canary, `.stamity/preflight-canary.json`, or `null` when absent. */
  canary: { at: string } | null;
  now: Date;
  /** The board item the run takes as input, by reference. */
  item?: { owner: string; repo: string; number: number } | undefined;
  /** The emitted copies of the floor rules, one entry per client copy. */
  floors: readonly { id: string; path: string; exists: boolean }[];
}

/** The canary's oldest accepted age. */
export const CANARY_MAX_AGE_MS = 120_000;

/** The floors an unattended run loads by name; each needs at least one copy, and every listed copy must exist. */
export const REQUIRED_FLOORS = ["question-protocol", "injection-screening"] as const;

const NO_REST_FIX = "add a ruleset that requires a pull request, or run as an account that can read the protection";
const OPEN_FIX =
  "add a ruleset that requires a pull request on the default branch with no direct-push bypass for this account " +
  "(a pull-request-only bypass is fine), or run as an account without that bypass";
const GH_REPO_FIX = "unset GH_REPO, or point it at the origin repository";

/** GitHub's owner and repository name alphabets; anything else never reaches a REST path. */
const OWNER_SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_SHAPE = /^[A-Za-z0-9._-]{1,100}$/;
/** A user or bot login as the issue read returns it. */
const LOGIN_SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?$/;

function safeRepo(owner: string, repo: string): boolean {
  return OWNER_SHAPE.test(owner) && REPO_SHAPE.test(repo) && repo !== "." && repo !== "..";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function read(rest: RestRead, path: string): Promise<{ status: number; json: unknown } | null> {
  try {
    return await rest(path);
  } catch {
    return null;
  }
}

function statusText(reply: { status: number } | null): string {
  return reply === null ? "a failed read" : `HTTP ${reply.status}`;
}

interface DirectPushDetail {
  verdict: "blocked" | "open" | "unknown";
  evidence: string;
  /** Whether the blocking control requires an approving review; `null` when it says nothing or nothing blocks. */
  reviewRequired: boolean | null;
}

function reviewCount(value: unknown): boolean | null {
  return typeof value === "number" ? value >= 1 : null;
}

/** The blocking classic protection's verdict, given the repository read's rights. */
async function classicVerdict(
  rest: RestRead,
  base: string,
  branchPath: string,
  isAdmin: boolean,
  rulesetNote: string,
): Promise<DirectPushDetail> {
  const lead = rulesetNote === "" ? "" : `${rulesetNote}; `;
  const reply = await read(rest, `${base}/branches/${branchPath}/protection`);
  if (reply === null || reply.status !== 200 || !isRecord(reply.json)) {
    return {
      verdict: "unknown",
      evidence: `${lead}classic protection unreadable (${statusText(reply)}), so no direct-push block is proven`,
      reviewRequired: null,
    };
  }
  const reviews = reply.json["required_pull_request_reviews"];
  if (!isRecord(reviews)) {
    return {
      verdict: "open",
      evidence: `${lead}classic protection requires no pull request`,
      reviewRequired: null,
    };
  }
  const enforceAdmins = reply.json["enforce_admins"];
  if (isAdmin && !(isRecord(enforceAdmins) && enforceAdmins["enabled"] === true)) {
    return {
      verdict: "open",
      evidence: `${lead}the account administers the repository and enforce_admins is off`,
      reviewRequired: null,
    };
  }
  const allowances = reviews["bypass_pull_request_allowances"];
  const listed = (key: string): unknown[] => {
    const value = isRecord(allowances) ? allowances[key] : undefined;
    return Array.isArray(value) ? value : [];
  };
  if (listed("teams").length > 0 || listed("apps").length > 0) {
    return {
      verdict: "unknown",
      evidence:
        `${lead}the pull-request bypass lists teams or apps, ` +
        "which cannot be proven to exclude the account",
      reviewRequired: null,
    };
  }
  const users = listed("users")
    .map((user) => (isRecord(user) && typeof user["login"] === "string" ? user["login"].toLowerCase() : null))
    .filter((login): login is string => login !== null);
  if (users.length > 0) {
    const me = await read(rest, "/user");
    const login = me !== null && me.status === 200 && isRecord(me.json) ? me.json["login"] : undefined;
    if (typeof login !== "string") {
      return {
        verdict: "unknown",
        evidence: `${lead}the account's login is unreadable (${statusText(me)}) against the pull-request bypass`,
        reviewRequired: null,
      };
    }
    if (users.includes(login.toLowerCase())) {
      return {
        verdict: "open",
        evidence: `${lead}the account is in the pull-request bypass allowances`,
        reviewRequired: null,
      };
    }
  }
  return {
    verdict: "blocked",
    evidence: "classic protection requires a pull request and binds this account",
    reviewRequired: reviewCount(reviews["required_approving_review_count"]),
  };
}

async function inspectDirectPush(rest: RestRead, repo: RepoRef): Promise<DirectPushDetail> {
  if (!safeRepo(repo.owner, repo.repo)) {
    return { verdict: "unknown", evidence: "the origin repository's name is not a GitHub name", reviewRequired: null };
  }
  const base = `/repos/${repo.owner}/${repo.repo}`;
  const repoReply = await read(rest, base);
  if (repoReply === null || repoReply.status !== 200 || !isRecord(repoReply.json)) {
    return {
      verdict: "unknown",
      evidence: `the repository read answered ${statusText(repoReply)}`,
      reviewRequired: null,
    };
  }
  const branch = repoReply.json["default_branch"];
  if (typeof branch !== "string" || branch === "") {
    return { verdict: "unknown", evidence: "the repository read names no default branch", reviewRequired: null };
  }
  const permissions = repoReply.json["permissions"];
  if (isRecord(permissions) && permissions["push"] === false) {
    return {
      verdict: "blocked",
      evidence: "the account has no push right on the repository (the run's own branch pushes will fail too)",
      reviewRequired: null,
    };
  }
  // With no rights block in the reply the account may be an administrator: the
  // classic rule then asks for enforce_admins, the stricter reading.
  const isAdmin = !isRecord(permissions) || permissions["admin"] !== false;
  const branchPath = encodeURIComponent(branch);

  const rulesReply = await read(rest, `${base}/rules/branches/${branchPath}`);
  const notes: string[] = [];
  let anyUnreadable = false;
  if (rulesReply === null || rulesReply.status !== 200 || !Array.isArray(rulesReply.json)) {
    anyUnreadable = true;
    notes.push(`branch rules unreadable (${statusText(rulesReply)})`);
  } else {
    const reviewsByRuleset = new Map<number, boolean | null>();
    const unreadableIds: string[] = [];
    for (const rule of rulesReply.json) {
      if (!isRecord(rule) || (rule["type"] !== "pull_request" && rule["type"] !== "update")) continue;
      const id = rule["ruleset_id"];
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
        unreadableIds.push("a rule with no ruleset id");
        continue;
      }
      const parameters = rule["parameters"];
      const required =
        rule["type"] === "pull_request" && isRecord(parameters)
          ? reviewCount(parameters["required_approving_review_count"])
          : null;
      const known = reviewsByRuleset.get(id);
      reviewsByRuleset.set(id, known === true || required === true ? true : (known ?? required));
    }
    const rulesets = [...reviewsByRuleset];
    const replies = await Promise.all(rulesets.map(([id]) => read(rest, `${base}/rulesets/${id}`)));
    for (const [index, [id, reviewRequired]] of rulesets.entries()) {
      const reply = replies[index] ?? null;
      if (reply === null || reply.status !== 200 || !isRecord(reply.json)) {
        unreadableIds.push(`ruleset ${id} (${statusText(reply)})`);
        continue;
      }
      if (reply.json["enforcement"] !== "active") {
        notes.push(`ruleset ${id} is not active`);
        continue;
      }
      const bypass = reply.json["current_user_can_bypass"];
      if (bypass === "never" || bypass === "pull_requests_only") {
        return {
          verdict: "blocked",
          evidence: `active ruleset ${id} requires a pull request and the account's bypass is ${bypass}`,
          reviewRequired,
        };
      }
      const how = bypass === "always" ? "always" : "no bypass value read, counted as a bypass";
      notes.push(`the account bypasses ruleset ${id} (${how})`);
    }
    if (unreadableIds.length > 0) {
      anyUnreadable = true;
      notes.push(`unreadable: ${unreadableIds.join(", ")}`);
    }
    if (reviewsByRuleset.size === 0 && unreadableIds.length === 0) notes.push("no pull_request or update rule");
  }
  const classic = await classicVerdict(rest, base, branchPath, isAdmin, notes.join("; "));
  // An unread ruleset may have been the one that blocks; an open classic
  // verdict beside it proves neither way, so it stays unknown.
  if (classic.verdict === "open" && anyUnreadable) {
    return { ...classic, verdict: "unknown" };
  }
  return classic;
}

/**
 * Whether REST proves the account cannot push to `repo`'s default branch:
 * `blocked` (proven), `open` (it can), or `unknown` (not readable — refused
 * like `open`).
 */
export async function directPushVerdict(rest: RestRead, repo: RepoRef): Promise<"blocked" | "open" | "unknown"> {
  return (await inspectDirectPush(rest, repo)).verdict;
}

interface CheckResult {
  state: CheckState;
  evidence: string;
  fix: string;
}

function hooksLoaded(canary: { at: string } | null, now: Date): CheckResult {
  const fix =
    "run the pre-flight through the shell tool of a session whose hooks loaded, so the shell guard writes the " +
    "canary first; re-run sync if the guard is not emitted";
  if (canary === null) return { state: "refuse", evidence: "no hooks canary: the shell guard did not run", fix };
  const at = Date.parse(canary.at);
  if (Number.isNaN(at)) return { state: "refuse", evidence: "the hooks canary carries no readable time", fix };
  const age = now.getTime() - at;
  if (age < 0) return { state: "refuse", evidence: "the hooks canary is dated after now", fix };
  const seconds = Math.floor(age / 1000);
  if (age > CANARY_MAX_AGE_MS) {
    return { state: "refuse", evidence: `the hooks canary is ${seconds} s old, past ${CANARY_MAX_AGE_MS / 1000} s`, fix };
  }
  return { state: "pass", evidence: `hooks canary (a canary, not a wall) written ${seconds} s ago`, fix };
}

function nodeEngine(nodeVersion: string, engines: string | undefined): CheckResult {
  const version = semver.clean(nodeVersion);
  const fix = `run under a node release inside ${engines ?? "the declared engines"}`;
  if (version === null) return { state: "refuse", evidence: "the node version is unreadable", fix };
  if (engines === undefined) return { state: "pass", evidence: `node ${version}; no engines range declared`, fix };
  if (semver.validRange(engines) === null) {
    return { state: "refuse", evidence: `node ${version}; the engines range ${engines} is unreadable`, fix };
  }
  return semver.satisfies(version, engines)
    ? { state: "pass", evidence: `node ${version} is inside engines ${engines}`, fix }
    : { state: "refuse", evidence: `node ${version} is outside engines ${engines}`, fix };
}

function cliPin(pinned: string | undefined, running: string): CheckResult {
  if (pinned === undefined) {
    return {
      state: "unknown",
      evidence: `no pinned version recorded; the running CLI is ${running}`,
      fix: "run sync so the manifest records the pinned version, then call the CLI at that version",
    };
  }
  return pinned === running
    ? { state: "pass", evidence: `the running CLI ${running} is the pinned version`, fix: "" }
    : {
        state: "refuse",
        evidence: `the running CLI ${running} is not the pinned version ${pinned}`,
        fix: `call the CLI at the pinned version ${pinned}, or run sync with this release to move the pin`,
      };
}

async function gateScan(scanRuns: () => Promise<boolean>): Promise<CheckResult> {
  const fix = "make `gate scan` runnable here (git and the CLI installed), then re-run the pre-flight";
  try {
    return (await scanRuns())
      ? { state: "pass", evidence: "gate scan runs", fix }
      : { state: "refuse", evidence: "gate scan cannot run", fix };
  } catch {
    return { state: "unknown", evidence: "gate scan failed before answering", fix };
  }
}

function floorsCheck(floors: PreflightDeps["floors"]): CheckResult {
  const fix = "run sync so the question protocol and the injection-screening rule are emitted for this client";
  const absent = REQUIRED_FLOORS.filter((id) => !floors.some((floor) => floor.id === id));
  const missing = floors.filter((floor) => !floor.exists).map((floor) => `${floor.id} at ${floor.path}`);
  if (absent.length > 0 || missing.length > 0) {
    const parts = [
      ...(absent.length > 0 ? [`not listed: ${absent.join(", ")}`] : []),
      ...(missing.length > 0 ? [`missing: ${missing.join(", ")}`] : []),
    ];
    return { state: "refuse", evidence: `floor rules ${parts.join("; ")}`, fix };
  }
  return { state: "pass", evidence: `floors loaded: ${REQUIRED_FLOORS.join(", ")} (${floors.length} copies)`, fix };
}

/** `[HOST/]OWNER/REPO` as `gh` reads `GH_REPO`; `null` for any other shape. */
function parseGhRepo(value: string): { host: string | null; owner: string; repo: string } | null {
  const parts = value.split("/");
  if (parts.length === 2 && parts[0] !== undefined && parts[1] !== undefined) {
    return { host: null, owner: parts[0], repo: parts[1] };
  }
  if (parts.length === 3 && parts[0] !== undefined && parts[1] !== undefined && parts[2] !== undefined) {
    return { host: parts[0], owner: parts[1], repo: parts[2] };
  }
  return null;
}

interface DirectPushCheck {
  result: CheckResult;
  reviewRequired: boolean | null;
  blocked: boolean;
}

async function directPush(deps: PreflightDeps): Promise<DirectPushCheck> {
  const settle = (state: CheckState, evidence: string, fix: string) => ({
    result: { state, evidence, fix },
    reviewRequired: null,
    blocked: false,
  });
  const ghRepo = deps.ghRepoEnv?.trim() ?? "";
  if (ghRepo !== "") {
    const parsed = parseGhRepo(ghRepo);
    if (parsed === null || !safeRepo(parsed.owner, parsed.repo)) {
      return settle("refuse", "GH_REPO is set in a shape the pre-flight cannot read", GH_REPO_FIX);
    }
    const ghHost = deps.env["GH_HOST"]?.trim().toLowerCase();
    if (parsed.host !== null && parsed.host.toLowerCase() !== "github.com" && parsed.host.toLowerCase() !== ghHost) {
      return settle("refuse", "GH_REPO names a repository on another host", GH_REPO_FIX);
    }
    const sameAsOrigin =
      deps.repo !== null &&
      parsed.owner.toLowerCase() === deps.repo.owner.toLowerCase() &&
      parsed.repo.toLowerCase() === deps.repo.repo.toLowerCase();
    if (deps.repo !== null && !sameAsOrigin) {
      return settle("refuse", `GH_REPO names ${parsed.owner}/${parsed.repo}, not the origin repository`, GH_REPO_FIX);
    }
  }
  if (deps.repo === null) {
    const fix = "point origin at the GitHub repository the run pushes to";
    return settle("unknown", "no GitHub origin repository to check", fix);
  }
  if (deps.rest === null) {
    return settle("unknown", "no REST access (gh is unavailable), so no direct-push block is proven", NO_REST_FIX);
  }
  const detail = await inspectDirectPush(deps.rest, deps.repo);
  const name = `${deps.repo.owner}/${deps.repo.repo}`;
  if (detail.verdict === "blocked") {
    return {
      result: { state: "pass", evidence: `${name}: ${detail.evidence}`, fix: "" },
      reviewRequired: detail.reviewRequired,
      blocked: true,
    };
  }
  return settle(
    detail.verdict === "open" ? "refuse" : "unknown",
    `${name}: ${detail.evidence}`,
    detail.verdict === "open" ? OPEN_FIX : NO_REST_FIX,
  );
}

async function inputAuthor(deps: PreflightDeps): Promise<CheckResult> {
  const fix = "start from an item an admin or write author opened, or have one restate it";
  const item = deps.item;
  if (item === undefined) return { state: "pass", evidence: "no item named; input by path", fix };
  if (!safeRepo(item.owner, item.repo) || !Number.isSafeInteger(item.number) || item.number <= 0) {
    return { state: "refuse", evidence: "the item reference is not a GitHub issue reference", fix };
  }
  if (deps.rest === null || deps.repo === null || !safeRepo(deps.repo.owner, deps.repo.repo)) {
    return { state: "unknown", evidence: "the item's author cannot be read without REST and a GitHub origin", fix };
  }
  const ref = `${item.owner}/${item.repo}#${item.number}`;
  const issue = await read(deps.rest, `/repos/${item.owner}/${item.repo}/issues/${item.number}`);
  const user = issue !== null && issue.status === 200 && isRecord(issue.json) ? issue.json["user"] : undefined;
  const login = isRecord(user) ? user["login"] : undefined;
  if (typeof login !== "string" || !LOGIN_SHAPE.test(login)) {
    return { state: "unknown", evidence: `${ref}: the author is unreadable (${statusText(issue)})`, fix };
  }
  // The permission is read on origin, the repository the run pushes to, never on the item's own repository.
  const origin = `${deps.repo.owner}/${deps.repo.repo}`;
  const reply = await read(deps.rest, `/repos/${origin}/collaborators/${encodeURIComponent(login)}/permission`);
  const permission = reply !== null && reply.status === 200 && isRecord(reply.json) ? reply.json["permission"] : undefined;
  if (typeof permission !== "string") {
    const evidence = `${ref}: ${login}'s permission on ${origin} is unreadable (${statusText(reply)})`;
    return { state: "unknown", evidence, fix };
  }
  if (permission === "admin" || permission === "write") {
    return { state: "pass", evidence: `${ref}: ${login} has ${permission} on ${origin}`, fix };
  }
  const level = permission === "read" ? "read" : "no write";
  return { state: "refuse", evidence: `${ref}: ${login} has ${level} permission on ${origin}`, fix };
}

/**
 * Name segments that mark a credential: `GH_TOKEN`, `AWS_SECRET_ACCESS_KEY`,
 * `GH_PAT`; `PWD` and `SSH_AUTH_SOCK` are not.
 */
const CREDENTIAL_SEGMENTS = new Set([
  "TOKEN",
  "TOKENS",
  "SECRET",
  "SECRETS",
  "PASSWORD",
  "PASSWD",
  "APIKEY",
  "CREDENTIAL",
  "CREDENTIALS",
  "PAT",
]);

function credentialName(name: string): boolean {
  const segments = name.toUpperCase().split(/[^A-Z0-9]+/).filter((segment) => segment !== "");
  return segments.some((segment) => CREDENTIAL_SEGMENTS.has(segment)) || segments.at(-1) === "KEY";
}

/** Variables whose name or value is credential-shaped, by name only, sorted. */
function tokenEnvNames(env: PreflightDeps["env"]): string[] {
  const names: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.trim() === "") continue;
    if (credentialName(name) || scanValueForSecrets(name, value).length > 0) names.push(name);
  }
  return names.toSorted();
}

/** Run every check and fold them into one verdict. */
export async function runPreflight(deps: PreflightDeps): Promise<PreflightVerdict> {
  const [scan, push, author] = await Promise.all([gateScan(deps.scanRuns), directPush(deps), inputAuthor(deps)]);
  const results: [CheckId, CheckResult][] = [
    ["hooks-loaded", hooksLoaded(deps.canary, deps.now)],
    ["node-engine", nodeEngine(deps.nodeVersion, deps.engines)],
    ["cli-pin", cliPin(deps.pinnedVersion, deps.runningVersion)],
    ["gate-scan", scan],
    ["direct-push", push.result],
    ["input-author", author],
    ["floors", floorsCheck(deps.floors)],
  ];
  const checks = results.map(([id, result]) => ({ id, state: result.state, evidence: result.evidence }));
  const refusals = results
    .filter(([, result]) => result.state !== "pass")
    .map(([id, result]) => ({ id, reason: result.evidence, fix: result.fix }));

  const warnings: PreflightVerdict["warnings"] = [];
  const cursorSocket = deps.env["CURSOR_AGENT_SOCKET"];
  if (cursorSocket !== undefined && cursorSocket !== "") warnings.push({ id: "cursor-egress" });
  const names = tokenEnvNames(deps.env);
  if (names.length > 0) warnings.push({ id: "token-env", names });
  if (push.blocked && push.reviewRequired !== true) warnings.push({ id: "review-state" });

  return { ok: refusals.length === 0, checks, refusals, warnings };
}
