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
 * origin, or `GH_REPO` or `GH_HOST` naming another repository or host all
 * refuse. The proof holds only where every URL `git` pushes origin to goes
 * out as the identity the REST reads describe (`gh`'s credential alone over
 * https with no Authorization header, or the cloud proxy, whose platform app is
 * both — a named residual), and for an account without admin on the repository
 * unless an organization ruleset blocks that no repository-level act can take
 * the default branch out of, the account not an organization owner, since a
 * repository admin can lift a repository rule or classic protection, repoint
 * the default branch, or rename the repository. `hooks-loaded` is a
 * canary, not a wall: the shell guard writes it, and a steered run could
 * write it too.
 *
 * No value is ever echoed: `token-env` names variables only, and no evidence
 * string carries an environment value or the canary's raw text. Erasable
 * syntax only, since `scripts/generate-docs.mjs` loads the CLI, and with it
 * this module, by Node's type stripping.
 */

import semver from "semver";
import { CANARY_MAX_AGE_MS } from "../mcp/env.ts";
import { scanValueForSecrets } from "../mcp/secretScan.ts";
import { HOOKS_ACTIVE_ENV } from "../types/markers.ts";
import { CLAUDE_PROXY_ORIGIN, hostOf, resolveRepo } from "./pullRequest.ts";

/** One GitHub REST read: the path (`/repos/...`), answered with its HTTP status and parsed body. */
export type RestRead = (path: string) => Promise<{ status: number; json: unknown }>;

type CheckId = "hooks-loaded" | "node-engine" | "cli-pin" | "gate-scan" | "direct-push" | "input-author" | "floors";
type CheckState = "pass" | "refuse" | "unknown";
type WarningId = "cursor-egress" | "token-env" | "review-state";

export interface PreflightVerdict {
  ok: boolean;
  checks: { id: CheckId; state: CheckState; evidence: string }[];
  refusals: { id: CheckId; reason: string; fix: string }[];
  /** `names` lists `token-env`'s variables; `reason` says why `review-state` fired. */
  warnings: { id: WarningId; names?: string[]; reason?: string }[];
}

interface RepoRef {
  owner: string;
  repo: string;
}

/** One URL `git push origin` pushes to, with what git applies to it; the URL is never echoed. */
export interface PushUrlFacts {
  /** As `git remote get-url --push --all origin` prints it (`pushInsteadOf` applied). */
  url: string;
  /**
   * The `credential.helper` list git builds for this URL: every entry that
   * applies, generic and URL-scoped, in config order, an empty value resetting
   * it; `null` when an entry cannot be placed.
   */
  helpers: readonly string[] | null;
  /** Whether an `http.extraHeader` naming `Authorization`, generic or URL-scoped, applies to this URL. */
  authorizationHeader: boolean;
  /**
   * Whether git's configuration could not be read in the push's environment;
   * when true nothing about the URL is proven (`helpers` is `null`, and
   * `authorizationHeader` is `false` because no header was read).
   */
  configUnreadable: boolean;
}

export interface PreflightDeps {
  env: Readonly<Record<string, string | undefined>>;
  /** `process.versions.node`; a leading `v` is accepted. */
  nodeVersion: string;
  /**
   * `package.json`'s `engines.node` range; absent (`undefined`, none declared), any node passes.
   * `null` when package.json or its `engines.node` could not be read: that refuses, never passes.
   */
  engines?: string | null | undefined;
  /** The manifest's `generatedBy`; absent, the pin cannot be read. */
  pinnedVersion?: string | undefined;
  /**
   * True when `.stamity/manifest.json` is there but could not be read or
   * parsed: the pin and the floor copies are then named as unreadable, not as
   * missing (review/203).
   */
  manifestUnreadable?: boolean | undefined;
  runningVersion: string;
  /** Resolves true when `gate scan` can run here. */
  scanRuns: () => Promise<boolean>;
  /** `null` when `gh` is not available. */
  rest: RestRead | null;
  /**
   * The `gh` the REST reads run, as the REST runner resolves it on `PATH`: its
   * path and the file that path resolves to (`realPath` `null` when it cannot
   * be read); `null` when `PATH` holds none. A credential helper naming `gh`
   * by a path binds only where that path is one of these two.
   */
  gh: { path: string; realPath: string | null } | null;
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
  /**
   * How `git` pushes to origin, as raw facts this module decides on: origin's
   * fetch URL (`null` when it has none) and every URL `git push origin`
   * pushes to, each with its helper list and Authorization-header fact.
   */
  pushIdentity: { fetchUrl: string | null; pushUrls: readonly PushUrlFacts[] };
  /** Whether the review gate holds a counter, and the in-progress record's `usage: review` line count. */
  reviewState: { counter: boolean; usageReviewLines: number };
}

/** The floors an unattended run loads by name; each needs at least one copy, and every listed copy must exist. */
export const REQUIRED_FLOORS = ["question-protocol", "injection-screening"] as const;

const NO_REST_FIX = "add a ruleset that requires a pull request, or run as an account that can read the protection";
const OPEN_FIX =
  "add a ruleset that requires a pull request on the default branch with no direct-push bypass for this account " +
  "(a pull-request-only bypass is fine), or run as an account without that bypass";
const GH_REPO_FIX = "unset GH_REPO, or point it at the origin repository";
const GH_HOST_FIX = "unset GH_HOST, or set it to the origin's host";
const PUSH_IDENTITY_FIX = "use an https origin with `gh auth setup-git`";
/**
 * The helper branch's way out (pr/31): a gh behind a shim (scoop, Chocolatey, mise, asdf, snap) writes its helper
 * with the real executable's path, which is not the `gh` on `PATH`, so re-running setup-git alone writes the same
 * refused path; the bare form, which `PATH` decides, is accepted. One sequence run in the repository (pr/44, pr/45):
 * git builds the helper list in config order, system, global, then the repository, URL-scoped entries among them,
 * and an empty value resets it, so a repository-level empty entry clears every entry read before it — a system
 * helper, a global one and a shim's URL-scoped reset-and-path pair alike — and gh's bare form after it is the list's
 * only entry. A global `--replace-all` left that URL-scoped pair in place (pr/44), and a repository-level one left
 * the global helpers ahead of it (pr/45). An entry later in the repository's own config is read after the two, so
 * the text says they come last. It names no `--global` or `--system` write, and no helper's value, as the verdict
 * echoes none.
 */
const GH_HELPER_FIX =
  "make gh's helper the only credential helper for origin, running in the repository " +
  "`git config --replace-all credential.helper ''` then `git config --add credential.helper '!gh auth git-credential'`: " +
  "the empty entry resets the list git built from the system and global configuration (Apple's git ships a helper, " +
  "and `gh auth setup-git` run through a shim writes a URL-scoped pair), and gh's bare form after it is the one this " +
  "check accepts; a credential helper entry later in the repository's own configuration is read after them, so these " +
  "two must come last";
const HEADER_FIX =
  "remove the Authorization http.extraHeader that applies to origin (actions/checkout's persist-credentials: false), " +
  "and use an https origin with `gh auth setup-git`";
const CONFIG_FIX = "make git's configuration readable in the run's environment (`git config --list` exits 0 there)";
const PUSH_URL_FIX ="point every push URL of origin at the repository its fetch URL names";
const ORIGIN_FIX = "point origin at the GitHub repository the run pushes to";
const ADMIN_FIX = "run as an account or token without admin on this repository";
const ENGINES_FIX = "reinstall the CLI so its package.json and its engines.node range can be read";
const PUSH_RIGHT_FIX =
  "run as an account or a token with contents write on the repository (a fine-grained token's Contents: Read and write), " +
  "so the run's own branch can be pushed";
const MANIFEST_FIX = "repair .stamity/manifest.json (a regular file that parses as the manifest), or run sync to write it again";

/**
 * GitHub's owner and repository name alphabets; anything else never reaches a
 * REST path. `_` is in: every Enterprise Managed Users login carries one, and
 * u4's `NAME_PART` accepts it.
 */
const OWNER_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const REPO_SHAPE = /^[A-Za-z0-9._-]{1,100}$/;
/** A user or bot login as the issue read returns it. */
const LOGIN_SHAPE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}(?:\[bot\])?$/;

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
  /** True when every blocking ruleset reads `pull_requests_only`: the account can merge past their required review. */
  mergeBypass: boolean;
  /** The fix when it differs from the verdict's usual one. */
  fix?: string;
  /**
   * The account has no push right at all (`permissions.push` false): the
   * default branch is blocked, so the verdict reads `blocked`, but the run's own
   * branch cannot be pushed either, so the check refuses (review/198).
   */
  noPushRight?: true;
}

/** The classic protection's verdict for an account without admin on the repository. */
async function classicVerdict(rest: RestRead, base: string, branchPath: string, rulesetNote: string): Promise<DirectPushDetail> {
  const lead = rulesetNote === "" ? "" : `${rulesetNote}; `;
  const reply = await read(rest, `${base}/branches/${branchPath}/protection`);
  if (reply === null || reply.status !== 200 || !isRecord(reply.json)) {
    return {
      verdict: "unknown",
      evidence: `${lead}classic protection unreadable (${statusText(reply)}), so no direct-push block is proven`,
      mergeBypass: false,
    };
  }
  const reviews = reply.json["required_pull_request_reviews"];
  if (!isRecord(reviews)) {
    return {
      verdict: "open",
      evidence: `${lead}classic protection requires no pull request`,
      mergeBypass: false,
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
      mergeBypass: false,
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
        mergeBypass: false,
      };
    }
    if (users.includes(login.toLowerCase())) {
      return {
        verdict: "open",
        evidence: `${lead}the account is in the pull-request bypass allowances`,
        mergeBypass: false,
      };
    }
  }
  return {
    verdict: "blocked",
    evidence: "classic protection requires a pull request and binds this account",
    mergeBypass: false,
  };
}

/** A list of strings, or `null` for any other shape. */
function stringList(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

/**
 * Whether a ruleset's ref `exclude` entry may match `branch`. Over-matching is
 * the safe side: `*` and `?` cross `/`, and a class, brace or escape counts as
 * a match, since an exclude that matches takes the branch out of scope.
 */
function excludeMayMatch(pattern: string, branch: string): boolean {
  if (pattern === "~ALL" || pattern === "~DEFAULT_BRANCH") return true;
  if (/[[\]{}\\]/.test(pattern)) return true;
  const source = pattern.replace(/[.+^$|()]/g, "\\$&").replace(/\*+/g, ".*").replace(/\?/g, ".");
  const glob = new RegExp(`^${source}$`);
  return glob.test(`refs/heads/${branch}`) || glob.test(branch);
}

/**
 * Whether an organization ruleset's conditions keep `branch` of the repository
 * `repoId` in scope whatever a repository admin does: the ref condition
 * includes `~ALL` or the explicit branch with no exclude matching it, and every
 * repository condition present is by id (naming this repository) or a name
 * `~ALL` with no exclude. `~DEFAULT_BRANCH` follows a repoint, a name pattern a
 * rename, a property an edit; absent or unreadable conditions do not count.
 */
function pinsDefaultBranch(conditions: unknown, branch: string, repoId: unknown): boolean {
  if (!isRecord(conditions)) return false;
  const refName = conditions["ref_name"];
  if (!isRecord(refName)) return false;
  const include = stringList(refName["include"]);
  const exclude = stringList(refName["exclude"] ?? []);
  if (include === null || exclude === null) return false;
  if (!include.some((entry) => entry === "~ALL" || entry === `refs/heads/${branch}`)) return false;
  if (exclude.some((entry) => excludeMayMatch(entry, branch))) return false;

  if (conditions["repository_property"] !== undefined && conditions["repository_property"] !== null) return false;
  const byId = conditions["repository_id"];
  const byName = conditions["repository_name"];
  const hasId = byId !== undefined && byId !== null;
  const hasName = byName !== undefined && byName !== null;
  if (!hasId && !hasName) return false;
  if (hasId) {
    const ids = isRecord(byId) ? byId["repository_ids"] : undefined;
    if (typeof repoId !== "number" || !Array.isArray(ids) || !ids.includes(repoId)) return false;
  }
  if (hasName) {
    const names = isRecord(byName) ? stringList(byName["include"]) : null;
    const excluded = isRecord(byName) ? stringList(byName["exclude"] ?? []) : null;
    if (names === null || excluded === null || !names.includes("~ALL") || excluded.length > 0) return false;
  }
  return true;
}

/** The account's role in `org`: `member` takes an organization ruleset's exception; an owner or an unread role does not. */
async function organizationMember(rest: RestRead, org: string): Promise<{ member: boolean; evidence: string }> {
  const reply = await read(rest, `/user/memberships/orgs/${org}`);
  const role = reply !== null && reply.status === 200 && isRecord(reply.json) ? reply.json["role"] : undefined;
  if (role === "member") return { member: true, evidence: "" };
  if (role === "admin") return { member: false, evidence: "the account is an owner of the organization and can edit its rulesets" };
  if (typeof role === "string") return { member: false, evidence: "the account's organization role is not plain membership" };
  return { member: false, evidence: `the account's organization role is unreadable (${statusText(reply)})` };
}

async function inspectDirectPush(rest: RestRead, repo: RepoRef): Promise<DirectPushDetail> {
  if (!safeRepo(repo.owner, repo.repo)) {
    return { verdict: "unknown", evidence: "the origin repository's name is not a GitHub name", mergeBypass: false };
  }
  const base = `/repos/${repo.owner}/${repo.repo}`;
  const repoReply = await read(rest, base);
  if (repoReply === null || repoReply.status !== 200 || !isRecord(repoReply.json)) {
    return {
      verdict: "unknown",
      evidence: `the repository read answered ${statusText(repoReply)}`,
      mergeBypass: false,
    };
  }
  const branch = repoReply.json["default_branch"];
  if (typeof branch !== "string" || branch === "") {
    return { verdict: "unknown", evidence: "the repository read names no default branch", mergeBypass: false };
  }
  const permissions = repoReply.json["permissions"];
  if (isRecord(permissions) && permissions["push"] === false) {
    return {
      verdict: "blocked",
      evidence: "the account has no push right on the repository, so the run's own branch pushes would fail too",
      mergeBypass: false,
      noPushRight: true,
    };
  }
  // With no rights block in the reply the account may be an administrator, the
  // stricter reading. An administrator can lift a repository ruleset or classic
  // protection with one REST call, so only an organization ruleset binds it, and
  // only one whose conditions no repository-level act can move off the branch
  // (`pinsDefaultBranch`), for an account that is no organization owner.
  const isAdmin = !isRecord(permissions) || permissions["admin"] !== false;
  const repoId = repoReply.json["id"];
  const branchPath = encodeURIComponent(branch);

  const rulesReply = await read(rest, `${base}/rules/branches/${branchPath}`);
  const notes: string[] = [];
  let anyUnreadable = false;
  if (rulesReply === null || rulesReply.status !== 200 || !Array.isArray(rulesReply.json)) {
    anyUnreadable = true;
    notes.push(`branch rules unreadable (${statusText(rulesReply)})`);
  } else {
    /** Each pull_request or update rule's ruleset id, and whether it is set at organization level. */
    const organizationByRuleset = new Map<number, boolean>();
    const unreadableIds: string[] = [];
    for (const rule of rulesReply.json) {
      if (!isRecord(rule) || (rule["type"] !== "pull_request" && rule["type"] !== "update")) continue;
      const id = rule["ruleset_id"];
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
        unreadableIds.push("a rule with no ruleset id");
        continue;
      }
      organizationByRuleset.set(id, rule["ruleset_source_type"] === "Organization");
    }
    const rulesets = [...organizationByRuleset];
    const replies = await Promise.all(rulesets.map(([id]) => read(rest, `${base}/rulesets/${id}`)));
    const blocking: { id: number; bypass: string }[] = [];
    /** Organization rulesets that pin the branch, binding an administrator once its role reads plain membership. */
    const adminBlocking: { id: number; bypass: string }[] = [];
    for (const [index, [id, organization]] of rulesets.entries()) {
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
        if (isAdmin && !organization) {
          notes.push(`the account administers the repository and can lift repository ruleset ${id}`);
          continue;
        }
        if (isAdmin) {
          if (pinsDefaultBranch(reply.json["conditions"], branch, repoId)) {
            adminBlocking.push({ id, bypass });
          } else {
            notes.push(
              `organization ruleset ${id}'s conditions do not keep the default branch in scope against a repository ` +
                "admin's acts (a ~DEFAULT_BRANCH, name or property target, an exclude, or conditions unread)",
            );
          }
          continue;
        }
        blocking.push({ id, bypass });
        continue;
      }
      const how = bypass === "always" ? "always" : "no bypass value read, counted as a bypass";
      notes.push(`the account bypasses ruleset ${id} (${how})`);
    }
    if (adminBlocking.length > 0) {
      const role = await organizationMember(rest, repo.owner);
      if (role.member) blocking.push(...adminBlocking);
      else notes.push(`${role.evidence}, so no organization ruleset binds it`);
    }
    if (blocking.length > 0) {
      const named = blocking.map(({ id, bypass }) => `${id} (bypass ${bypass})`).join(", ");
      const level = isAdmin ? "organization ruleset" : "ruleset";
      return {
        verdict: "blocked",
        evidence: `active ${level} ${named} requires a pull request and the account cannot bypass it for a direct push`,
        mergeBypass: blocking.every(({ bypass }) => bypass === "pull_requests_only"),
      };
    }
    if (unreadableIds.length > 0) {
      anyUnreadable = true;
      notes.push(`unreadable: ${unreadableIds.join(", ")}`);
    }
    if (organizationByRuleset.size === 0 && unreadableIds.length === 0) notes.push("no pull_request or update rule");
  }
  if (isAdmin) {
    const lead = notes.length === 0 ? "" : `${notes.join("; ")}; `;
    const rights = isRecord(permissions) ? "administers" : "may administer (the reply carries no rights)";
    // An unread ruleset may be an organization one that binds the account, so that stays unknown.
    return {
      verdict: anyUnreadable ? "unknown" : "open",
      evidence:
        `${lead}the account ${rights} the repository and can lift a repository ruleset or classic protection; ` +
        "no organization ruleset blocks it",
      mergeBypass: false,
      fix: ADMIN_FIX,
    };
  }
  const classic = await classicVerdict(rest, base, branchPath, notes.join("; "));
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

/**
 * Whether the repository's hooks loaded. The canary first needs a session whose shell guard ran; in Claude Code's
 * cloud (`CLAUDE_CODE_REMOTE` reading `true`, REQ-FLOW-112) the shell also needs {@link HOOKS_ACTIVE_ENV} at `1`, which
 * the readiness hook writes through `$CLAUDE_ENV_FILE` at the session's start (REQ-FLOW-110). A session holding several
 * repositories loads no repository's hooks, so neither is there; a canary a steered run wrote does not stand in for it.
 */
function hooksLoaded(canary: { at: string } | null, now: Date, env: PreflightDeps["env"]): CheckResult {
  const fix =
    "run the pre-flight through the shell tool of a session whose hooks loaded, so the shell guard writes the " +
    "canary first; re-run sync if the guard is not emitted";
  if (env["CLAUDE_CODE_REMOTE"] === "true" && env[HOOKS_ACTIVE_ENV] !== "1") {
    return {
      state: "refuse",
      evidence:
        `hooks did not load: this Claude Code cloud session's shell has no ${HOOKS_ACTIVE_ENV}=1, which the readiness ` +
        "hook writes to $CLAUDE_ENV_FILE when the repository's hooks load",
      fix:
        "open the session on this one repository, one repository per session, since a session with several " +
        "repositories loads no repository's hooks; then run the pre-flight again, and re-run sync if the readiness " +
        "hook is not emitted",
    };
  }
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

function nodeEngine(nodeVersion: string, engines: string | null | undefined): CheckResult {
  const version = semver.clean(nodeVersion);
  const fix = `run under a node release inside ${engines ?? "the declared engines"}`;
  if (version === null) return { state: "refuse", evidence: "the node version is unreadable", fix };
  // Unreadable is not "none declared": no range was read, so nothing shows this node is inside it.
  if (engines === null) {
    return { state: "refuse", evidence: `node ${version}; package.json's engines.node could not be read`, fix: ENGINES_FIX };
  }
  if (engines === undefined) return { state: "pass", evidence: `node ${version}; no engines range declared`, fix };
  if (semver.validRange(engines) === null) {
    return { state: "refuse", evidence: `node ${version}; the engines range ${engines} is unreadable`, fix };
  }
  return semver.satisfies(version, engines)
    ? { state: "pass", evidence: `node ${version} is inside engines ${engines}`, fix }
    : { state: "refuse", evidence: `node ${version} is outside engines ${engines}`, fix };
}

function cliPin(pinned: string | undefined, running: string, manifestUnreadable: boolean): CheckResult {
  if (manifestUnreadable) {
    return { state: "unknown", evidence: `manifest unreadable, so no pinned version was read; the running CLI is ${running}`, fix: MANIFEST_FIX };
  }
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

function floorsCheck(floors: PreflightDeps["floors"], manifestUnreadable: boolean): CheckResult {
  if (manifestUnreadable) return { state: "refuse", evidence: "manifest unreadable, so the floor rules' copies were not read", fix: MANIFEST_FIX };
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

/** Characters that would make a `!` helper run more than one program. */
const SHELL_META = /[\s'"`$;&|<>()*?]/;

/** Whether two paths name one file: equal, or two Windows drive paths equal in any case and with either separator. */
function samePath(a: string, b: string): boolean {
  if (a === b) return true;
  const drive = /^[A-Za-z]:[\\/]/;
  const fold = (path: string): string => path.replaceAll("/", "\\").toLowerCase();
  return drive.test(a) && drive.test(b) && fold(a) === fold(b);
}

/**
 * Whether a credential helper is `gh`'s own, `!<gh> auth git-credential` as
 * `gh auth setup-git` writes it: a bare `gh` or `gh.exe`, which `PATH` decides
 * (a named residual), or a path that is the `gh` the REST reads run (pr/8).
 * Any other path refuses, `./gh` and another file named `gh` included: git
 * would push as whatever that program answers, not as the REST reads' account.
 */
function isGhCredentialHelper(helper: string | null, gh: PreflightDeps["gh"]): boolean {
  const match = /^!\s*(.+?)\s+auth\s+git-credential\s*$/.exec(helper?.trim() ?? "");
  const program = match?.[1];
  if (program === undefined) return false;
  let path: string;
  if (/^'[^']+'$/.test(program)) path = program.slice(1, -1);
  else if (/^"[^"$`\\]+"$/.test(program)) path = program.slice(1, -1);
  else if (!SHELL_META.test(program)) path = program;
  else return false;
  // No case fold (pr/33): on a case-sensitive host `sh` resolves `GH` on PATH to another file than `gh`.
  if (!/[\\/]/.test(path)) return path === "gh" || path === "gh.exe";
  return gh !== null && [gh.path, gh.realPath].some((known) => known !== null && samePath(path, known));
}

/** A push URL's transport: `https` only with no userinfo; `other` for anything not tied to a known identity. */
function pushKind(url: string): "proxy" | "https" | "ssh" | "other" {
  const trimmed = url.trim();
  if (CLAUDE_PROXY_ORIGIN.test(trimmed)) return "proxy";
  if (/^https:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return parsed.username === "" && parsed.password === "" ? "https" : "other";
    } catch {
      return "other";
    }
  }
  if (/^(?:ssh|git\+ssh|ssh\+git):\/\//i.test(trimmed)) return "ssh";
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && /^(?:[^@/\s:]+@)?[^/\s:]+:/.test(trimmed)) return "ssh";
  return "other";
}

/**
 * Whether every URL `git push origin` pushes to goes out as the identity the
 * REST reads describe, on the repository the fetch URL names; the evidence
 * never echoes a URL or a helper.
 */
function pushIdentityCheck(deps: PreflightDeps, repo: RepoRef): { bound: boolean; evidence: string; fix: string } {
  const unbound = (evidence: string, fix: string) => ({ bound: false, evidence, fix });
  const { fetchUrl, pushUrls } = deps.pushIdentity;
  const origin = fetchUrl === null ? null : resolveRepo(deps.env, fetchUrl);
  if (
    origin === null ||
    origin.owner.toLowerCase() !== repo.owner.toLowerCase() ||
    origin.repo.toLowerCase() !== repo.repo.toLowerCase()
  ) {
    return unbound("origin's fetch URL does not name the repository checked", ORIGIN_FIX);
  }
  if (pushUrls.length === 0) return unbound("git names no push URL for origin", PUSH_IDENTITY_FIX);
  const kinds = new Set<string>();
  for (const [index, facts] of pushUrls.entries()) {
    const which = pushUrls.length === 1 ? "the push URL" : `push URL ${index + 1} of ${pushUrls.length}`;
    // Any kind, the proxy included: with no config read, no header or helper is proven absent.
    if (facts.configUnreadable) {
      return unbound(`configuration unreadable: git's configuration for ${which} could not be read, so its identity is not proven`, CONFIG_FIX);
    }
    if (facts.authorizationHeader) {
      return unbound(`an Authorization http.extraHeader applies to ${which}, so git pushes as that header's credential`, HEADER_FIX);
    }
    const kind = pushKind(facts.url);
    if (kind === "ssh") return unbound(`${which} is ssh, whose key may be another identity than gh's`, PUSH_IDENTITY_FIX);
    if (kind === "other") {
      return unbound(
        `${which} carries its own credentials or uses a transport the pre-flight cannot tie to gh's identity`,
        PUSH_IDENTITY_FIX,
      );
    }
    const target = resolveRepo(deps.env, facts.url);
    const same =
      target !== null &&
      target.host === origin.host &&
      target.owner.toLowerCase() === origin.owner.toLowerCase() &&
      target.repo.toLowerCase() === origin.repo.toLowerCase();
    if (!same) return unbound(`${which} names another repository than the fetch URL's`, PUSH_URL_FIX);
    if (kind === "https") {
      const helpers = facts.helpers;
      if (helpers === null) {
        return unbound(`the credential helpers for ${which} cannot be placed, so its identity is not proven gh's`, PUSH_IDENTITY_FIX);
      }
      if (helpers.length === 0) {
        return unbound(`git pushes ${which} over https with no credential helper, so its identity is not gh's`, PUSH_IDENTITY_FIX);
      }
      if (helpers.length !== 1 || !isGhCredentialHelper(helpers[0] ?? null, deps.gh)) {
        return unbound(
          `git pushes ${which} over https through a credential helper other than gh's alone, so its identity is not proven gh's`,
          GH_HELPER_FIX,
        );
      }
    }
    kinds.add(kind);
  }
  const count = pushUrls.length === 1 ? "one push URL" : `${pushUrls.length} push URLs`;
  const ways = [
    ...(kinds.has("https") ? ["over https with gh's credential, the REST reads' identity"] : []),
    ...(kinds.has("proxy")
      ? ["through the cloud proxy, whose platform app is both the push and the REST identity (a named residual)"]
      : []),
  ];
  return { bound: true, evidence: `git pushes to ${count} on origin's repository ${ways.join(", or ")}`, fix: "" };
}

interface DirectPushCheck {
  result: CheckResult;
  /** The account can merge past a blocking ruleset's required review. */
  mergeBypass: boolean;
}

async function directPush(deps: PreflightDeps): Promise<DirectPushCheck> {
  const settle = (state: CheckState, evidence: string, fix: string) => ({
    result: { state, evidence, fix },
    mergeBypass: false,
  });
  // `gh` talks to GH_HOST when it is set, else github.com; u4's `resolveRepo`
  // takes a non-proxy origin only on that host, and the proxy origin is github.com.
  const configuredHost = deps.env["GH_HOST"]?.trim() ?? "";
  const ghHost = configuredHost === "" ? "github.com" : hostOf(configuredHost);
  const fetchUrl = deps.pushIdentity.fetchUrl?.trim() ?? "";
  const originHost = CLAUDE_PROXY_ORIGIN.test(fetchUrl) ? "github.com" : ghHost;
  if (ghHost !== originHost) {
    return settle("refuse", `GH_HOST names another host than the origin's (${originHost})`, GH_HOST_FIX);
  }
  const ghRepo = deps.ghRepoEnv?.trim() ?? "";
  if (ghRepo !== "") {
    const parsed = parseGhRepo(ghRepo);
    if (parsed === null || !safeRepo(parsed.owner, parsed.repo)) {
      return settle("refuse", "GH_REPO is set in a shape the pre-flight cannot read", GH_REPO_FIX);
    }
    if ((parsed.host === null ? ghHost : hostOf(parsed.host)) !== originHost) {
      return settle("refuse", "GH_REPO names a repository on another host than the origin's", GH_REPO_FIX);
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
    return settle("unknown", "no GitHub origin repository to check", ORIGIN_FIX);
  }
  if (deps.rest === null) {
    return settle("unknown", "no REST access (gh is unavailable), so no direct-push block is proven", NO_REST_FIX);
  }
  const name = `${deps.repo.owner}/${deps.repo.repo}`;
  const identity = pushIdentityCheck(deps, deps.repo);
  if (!identity.bound) {
    return settle("unknown", `${name}: ${identity.evidence}, so the REST reads prove nothing about it`, identity.fix);
  }
  const detail = await inspectDirectPush(deps.rest, deps.repo);
  // review/198: a run that cannot push its own branch ends with no branch, no pull request and no morning list.
  if (detail.noPushRight === true) return settle("refuse", `${name}: ${detail.evidence}`, PUSH_RIGHT_FIX);
  if (detail.verdict === "blocked") {
    return {
      result: { state: "pass", evidence: `${name}: ${detail.evidence}; ${identity.evidence}`, fix: "" },
      mergeBypass: detail.mergeBypass,
    };
  }
  return settle(
    detail.verdict === "open" ? "refuse" : "unknown",
    `${name}: ${detail.evidence}`,
    detail.fix ?? (detail.verdict === "open" ? OPEN_FIX : NO_REST_FIX),
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

function nameSegments(name: string): string[] {
  return name.toUpperCase().split(/[^A-Z0-9]+/).filter((segment) => segment !== "");
}

function credentialName(name: string): boolean {
  const segments = nameSegments(name);
  return segments.some((segment) => CREDENTIAL_SEGMENTS.has(segment)) || segments.at(-1) === "KEY";
}

/**
 * Plain path-holding variables, matched by whole name only. Their values are
 * paths: a long checkout path of letters, digits and slashes matches the
 * scanner's high-entropy row, and `PWD` reads as credential context to it. A
 * name that only ends in one (`MYSQL_PWD`) is not a path holder.
 */
const PATH_NAMES = new Set(["PWD", "OLDPWD", "HOME", "PATH", "TMPDIR", "NODE_PATH", "XDG_CONFIG_HOME"]);

/** Variables whose name or value is credential-shaped, by name only, sorted. */
function tokenEnvNames(env: PreflightDeps["env"]): string[] {
  const names: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.trim() === "") continue;
    if (credentialName(name)) {
      names.push(name);
      continue;
    }
    const pathHolder = PATH_NAMES.has(name.toUpperCase());
    // A path holder is named only on a recognised token inside it, never on the high-entropy row.
    const hits = scanValueForSecrets(name, value).filter(
      (hit) => !pathHolder || hit.patternId !== "high-entropy-string",
    );
    if (hits.length > 0) names.push(name);
  }
  return names.toSorted();
}

/** Why `review-state` warns, or `null` when it does not. */
function reviewStateReason(state: PreflightDeps["reviewState"], mergeBypass: boolean): string | null {
  const reasons = [
    ...(!state.counter && state.usageReviewLines === 0
      ? ["the review gate holds no counter and the in-progress record has no `usage: review` line"]
      : []),
    ...(mergeBypass
      ? ["the account's pull_requests_only bypass lets it merge a pull request without the required review"]
      : []),
  ];
  return reasons.length === 0 ? null : reasons.join("; ");
}

/** Run every check and fold them into one verdict. */
export async function runPreflight(deps: PreflightDeps): Promise<PreflightVerdict> {
  const [scan, push, author] = await Promise.all([gateScan(deps.scanRuns), directPush(deps), inputAuthor(deps)]);
  const results: [CheckId, CheckResult][] = [
    ["hooks-loaded", hooksLoaded(deps.canary, deps.now, deps.env)],
    ["node-engine", nodeEngine(deps.nodeVersion, deps.engines)],
    ["cli-pin", cliPin(deps.pinnedVersion, deps.runningVersion, deps.manifestUnreadable === true)],
    ["gate-scan", scan],
    ["direct-push", push.result],
    ["input-author", author],
    ["floors", floorsCheck(deps.floors, deps.manifestUnreadable === true)],
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
  const reviewReason = reviewStateReason(deps.reviewState, push.mergeBypass);
  if (reviewReason !== null) warnings.push({ id: "review-state", reason: reviewReason });

  return { ok: refusals.length === 0, checks, refusals, warnings };
}
