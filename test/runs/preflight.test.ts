import { describe, expect, it } from "vitest";
import {
  CANARY_MAX_AGE_MS,
  directPushVerdict,
  REQUIRED_FLOORS,
  runPreflight,
  type PreflightDeps,
  type PreflightVerdict,
  type PushUrlFacts,
  type RestRead,
} from "../../src/runs/preflight.ts";

/**
 * u8-preflight-core (REQ-FLOW-101): the unattended pre-flight's checks as pure functions.
 *
 * The wall is `direct-push`: a run starts only where REST proves the account cannot push to the
 * default branch of the `origin` repository. Every case below feeds the documented response shapes
 * of the four GitHub reads (the repository, the branch's rules, one ruleset, classic protection) and
 * asserts the activated verdict against the one a no-op would give.
 */

interface Reply {
  status: number;
  json: unknown;
}

/**
 * A table-driven stand-in for `RestRead`. Mock reason: `RestRead` is the injected seam for `gh api`;
 * the real dependency needs the network and a live account with a chosen protection shape, which a
 * unit test cannot have. An unrouted path answers 599, so a read the algorithm was not expected to
 * make shows in `calls` and never passes as a 200.
 */
function restTable(routes: Record<string, Reply>): { rest: RestRead; calls: string[] } {
  const calls: string[] = [];
  const rest: RestRead = (path) => {
    calls.push(path);
    return Promise.resolve(routes[path] ?? { status: 599, json: null });
  };
  return { rest, calls };
}

const REPO = { owner: "o", repo: "r" };
const NOW = new Date("2026-10-15T12:00:00.000Z");

function secondsBefore(seconds: number): string {
  return new Date(NOW.getTime() - seconds * 1000).toISOString();
}

/** The repository read: id 42, default branch `main`, the account's rights as given. */
function repoReply(permissions: Record<string, boolean> | undefined): Reply {
  return { status: 200, json: { id: 42, default_branch: "main", ...(permissions === undefined ? {} : { permissions }) } };
}

const WRITER = { admin: false, maintain: false, push: true, triage: true, pull: true };
const ADMIN = { admin: true, maintain: true, push: true, triage: true, pull: true };

function pullRequestRule(rulesetId: number, reviews = 1, source: "Repository" | "Organization" = "Repository"): Record<string, unknown> {
  return {
    type: "pull_request",
    parameters: { required_approving_review_count: reviews, dismiss_stale_reviews_on_push: false },
    ruleset_source_type: source,
    ruleset_source: source === "Repository" ? "o/r" : "o",
    ruleset_id: rulesetId,
  };
}

/** The credential helper `gh auth setup-git` writes. */
const GH_HELPER = "!/opt/homebrew/bin/gh auth git-credential";

const FETCH_URL = "https://github.com/o/r.git";
const PROXY_URL = "http://proxy@127.0.0.1:43123/git/o/r";

/** One push URL's facts: by default origin's own https URL, gh's helper alone, no Authorization header. */
function pushTo(url = FETCH_URL, helpers: readonly string[] | null = [GH_HELPER], authorizationHeader = false): PushUrlFacts {
  return { url, helpers, authorizationHeader };
}

function ruleset(id: number, enforcement: string, bypass: string | undefined, conditions?: unknown): Reply {
  return {
    status: 200,
    json: {
      id,
      name: "main",
      target: "branch",
      enforcement,
      ...(bypass === undefined ? {} : { current_user_can_bypass: bypass }),
      ...(conditions === undefined ? {} : { conditions }),
      rules: [{ type: "pull_request" }],
    },
  };
}

/** An organization ruleset's conditions: every repository by name, the given ref include and exclude. */
function orgConditions(include: string[], exclude: string[] = [], repository?: Record<string, unknown>): unknown {
  return {
    ref_name: { include, exclude },
    ...(repository ?? { repository_name: { include: ["~ALL"], exclude: [], protected: false } }),
  };
}

const MEMBER: Reply = { status: 200, json: { state: "active", role: "member", organization: { login: "o" } } };

const NOT_FOUND: Reply = { status: 404, json: { message: "Branch not protected" } };

/** Every check green: a fresh canary, node inside engines, the pin met, the scan runnable, a blocking ruleset, both floors. */
function greenDeps(overrides: Partial<PreflightDeps> = {}): PreflightDeps {
  const { rest } = restTable({
    "/repos/o/r": repoReply(WRITER),
    "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(7)] },
    "/repos/o/r/rulesets/7": ruleset(7, "active", "never"),
  });
  return {
    env: {},
    nodeVersion: "22.22.2",
    engines: ">=22.22.2",
    pinnedVersion: "1.16.0",
    runningVersion: "1.16.0",
    scanRuns: () => Promise.resolve(true),
    rest,
    repo: REPO,
    ghRepoEnv: null,
    canary: { at: secondsBefore(5) },
    now: NOW,
    floors: [
      { id: "question-protocol", path: "x/rules/question.md", exists: true },
      { id: "injection-screening", path: "x/rules/screening.md", exists: true },
    ],
    pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [pushTo()] },
    reviewState: { counter: true, usageReviewLines: 0 },
    ...overrides,
  };
}

function check(verdict: PreflightVerdict, id: string): { state: string; evidence: string } {
  const found = verdict.checks.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`no check ${id}`);
  return found;
}

function refusal(verdict: PreflightVerdict, id: string): { reason: string; fix: string } | undefined {
  return verdict.refusals.find((entry) => entry.id === id);
}

describe("runPreflight — the all-green baseline", () => {
  it("passes every check and reports ok with no refusal", async () => {
    const verdict = await runPreflight(greenDeps());
    expect(verdict.checks.map((entry) => entry.id)).toEqual([
      "hooks-loaded",
      "node-engine",
      "cli-pin",
      "gate-scan",
      "direct-push",
      "input-author",
      "floors",
    ]);
    expect(verdict.checks.every((entry) => entry.state === "pass")).toBe(true);
    expect(verdict.refusals).toEqual([]);
    expect(verdict.ok).toBe(true);
  });
});

describe("directPushVerdict — rulesets", () => {
  it("an active ruleset the account always bypasses (this repository's shape) is open, and the pre-flight refuses", async () => {
    const { rest } = restTable({
      "/repos/o/r": repoReply(ADMIN),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(25061761)] },
      "/repos/o/r/rulesets/25061761": ruleset(25061761, "active", "always"),
      "/repos/o/r/branches/main/protection": { status: 200, json: { enforce_admins: { enabled: false } } },
    });
    expect(await directPushVerdict(rest, REPO)).toBe("open");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("refuse");
    expect(verdict.ok).toBe(false);
  });

  it("the same ruleset with classic protection unreadable is unknown, and still refuses", async () => {
    // A writer, not an administrator: since review/37 an administrator settles before classic protection is read.
    const { rest } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(3)] },
      "/repos/o/r/rulesets/3": ruleset(3, "active", "always"),
      "/repos/o/r/branches/main/protection": NOT_FOUND,
    });
    expect(await directPushVerdict(rest, REPO)).toBe("unknown");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(refusal(verdict, "direct-push")).toBeDefined();
    expect(verdict.ok).toBe(false);
  });

  it("a ruleset with no current_user_can_bypass field counts as a bypass", async () => {
    const { rest } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(3)] },
      "/repos/o/r/rulesets/3": ruleset(3, "active", undefined),
      "/repos/o/r/branches/main/protection": NOT_FOUND,
    });
    expect(await directPushVerdict(rest, REPO)).not.toBe("blocked");
  });

  it.each(["pull_requests_only", "never"])("a bypass of %s blocks a direct push", async (bypass) => {
    // A writer: since review/37 a repository ruleset no longer binds an administrator (see the administrator cases).
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9)] },
      "/repos/o/r/rulesets/9": ruleset(9, "active", bypass),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
    // A blocking ruleset settles it: classic protection is never read.
    expect(calls).not.toContain("/repos/o/r/branches/main/protection");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("pass");
  });

  it("an update rule blocks like a pull_request rule", async () => {
    const { rest } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": {
        status: 200,
        json: [{ type: "update", ruleset_source_type: "Repository", ruleset_source: "o/r", ruleset_id: 4 }],
      },
      "/repos/o/r/rulesets/4": ruleset(4, "active", "never"),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
  });

  it("an evaluate-mode ruleset is not active and does not count, where the same ruleset active does", async () => {
    const routes = (enforcement: string): Record<string, Reply> => ({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(5)] },
      "/repos/o/r/rulesets/5": ruleset(5, enforcement, "never"),
      "/repos/o/r/branches/main/protection": NOT_FOUND,
    });
    expect(await directPushVerdict(restTable(routes("evaluate")).rest, REPO)).toBe("unknown");
    expect(await directPushVerdict(restTable(routes("disabled")).rest, REPO)).toBe("unknown");
    expect(await directPushVerdict(restTable(routes("active")).rest, REPO)).toBe("blocked");
  });

  it("a rule type other than pull_request or update reads no ruleset", async () => {
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": {
        status: 200,
        json: [{ type: "deletion", ruleset_source_type: "Repository", ruleset_source: "o/r", ruleset_id: 6 }],
      },
      "/repos/o/r/rulesets/6": ruleset(6, "active", "never"),
      "/repos/o/r/branches/main/protection": NOT_FOUND,
    });
    expect(await directPushVerdict(rest, REPO)).toBe("unknown");
    expect(calls).not.toContain("/repos/o/r/rulesets/6");
  });

  it("one blocking ruleset beside a bypassed one blocks", async () => {
    const { rest } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(1), pullRequestRule(2)] },
      "/repos/o/r/rulesets/1": ruleset(1, "active", "always"),
      "/repos/o/r/rulesets/2": ruleset(2, "active", "never"),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
  });

  it("an administrator under a repository ruleset with no bypass is open and refuses with the admin fix (review/37)", async () => {
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply(ADMIN),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9)] },
      "/repos/o/r/rulesets/9": ruleset(9, "active", "never"),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("open");
    // An administrator can switch classic protection off too, so it is never read.
    expect(calls).not.toContain("/repos/o/r/branches/main/protection");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("refuse");
    expect(refusal(verdict, "direct-push")?.fix).toBe("run as an account or token without admin on this repository");
  });

  it("an administrator under an organization ruleset with no bypass is blocked, since it cannot lift that rule", async () => {
    // Since review/60 and review/65 the ruleset's conditions must pin the branch and the account must be a plain
    // organization member; this case carries both, and the cases below take each away.
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply(ADMIN),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9, 1, "Organization")] },
      "/repos/o/r/rulesets/9": ruleset(9, "active", "never", orgConditions(["~ALL"])),
      "/user/memberships/orgs/o": MEMBER,
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
    expect(calls).toContain("/user/memberships/orgs/o");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("pass");
  });

  describe("an administrator and an organization ruleset's conditions (review/60, review/65)", () => {
    const adminUnder = (conditions: unknown, membership: Reply = MEMBER): RestRead =>
      restTable({
        "/repos/o/r": repoReply(ADMIN),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9, 1, "Organization")] },
        "/repos/o/r/rulesets/9": ruleset(9, "active", "never", conditions),
        "/user/memberships/orgs/o": membership,
      }).rest;

    it.each([
      ["~ALL", orgConditions(["~ALL"])],
      ["the explicit default branch", orgConditions(["refs/heads/main"])],
      ["an exclude that cannot match the branch", orgConditions(["~ALL"], ["refs/heads/release/v1"])],
      ["the repository by id", orgConditions(["refs/heads/main"], [], { repository_id: { repository_ids: [7, 42] } })],
    ])("a ref target of %s blocks", async (_label, conditions) => {
      expect(await directPushVerdict(adminUnder(conditions), REPO)).toBe("blocked");
    });

    it.each([
      ["~DEFAULT_BRANCH, which follows a repoint", orgConditions(["~DEFAULT_BRANCH"])],
      ["another branch only", orgConditions(["refs/heads/trunk"])],
      ["an exclude of ~DEFAULT_BRANCH", orgConditions(["~ALL"], ["~DEFAULT_BRANCH"])],
      ["an exclude pattern matching the branch", orgConditions(["~ALL"], ["refs/heads/ma*"])],
      ["an exclude with a character class", orgConditions(["~ALL"], ["refs/heads/[xyz]"])],
      ["a repository name pattern, which follows a rename", orgConditions(["~ALL"], [], { repository_name: { include: ["r*"], exclude: [] } })],
      ["a repository name ~ALL with an exclude", orgConditions(["~ALL"], [], { repository_name: { include: ["~ALL"], exclude: ["x"] } })],
      ["a repository property", orgConditions(["~ALL"], [], { repository_property: { include: [], exclude: [] } })],
      ["a repository id list without this repository", orgConditions(["~ALL"], [], { repository_id: { repository_ids: [7] } })],
      ["no repository condition", { ref_name: { include: ["~ALL"], exclude: [] } }],
      ["no conditions", undefined],
      ["an unreadable ref condition", { ref_name: { include: "~ALL" }, repository_name: { include: ["~ALL"], exclude: [] } }],
    ])("a target of %s does not bind the administrator: open, refused with the admin fix", async (_label, conditions) => {
      const rest = adminUnder(conditions);
      expect(await directPushVerdict(rest, REPO)).toBe("open");
      const verdict = await runPreflight(greenDeps({ rest }));
      expect(check(verdict, "direct-push").state).toBe("refuse");
      expect(refusal(verdict, "direct-push")?.fix).toBe("run as an account or token without admin on this repository");
    });

    it.each([
      ["an organization owner", { status: 200, json: { state: "active", role: "admin" } }],
      ["a role the read does not return (404, an outside collaborator)", { status: 404, json: { message: "Not Found" } }],
      ["a role the token cannot read (403)", { status: 403, json: { message: "Forbidden" } }],
    ] as const)("%s gets no organization-ruleset exception", async (_label, membership) => {
      const rest = adminUnder(orgConditions(["~ALL"]), membership);
      expect(await directPushVerdict(rest, REPO)).toBe("open");
      const verdict = await runPreflight(greenDeps({ rest }));
      expect(check(verdict, "direct-push").state).toBe("refuse");
    });

    it("a writer under the same ~DEFAULT_BRANCH organization ruleset is still blocked, reading no role", async () => {
      const { rest, calls } = restTable({
        "/repos/o/r": repoReply(WRITER),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9, 1, "Organization")] },
        "/repos/o/r/rulesets/9": ruleset(9, "active", "never", orgConditions(["~DEFAULT_BRANCH"])),
      });
      expect(await directPushVerdict(rest, REPO)).toBe("blocked");
      expect(calls).not.toContain("/user/memberships/orgs/o");
    });
  });

  it("a reply with no rights block is taken as an administrator, and an unread ruleset beside it is unknown", async () => {
    const noRights = restTable({
      "/repos/o/r": repoReply(undefined),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9)] },
      "/repos/o/r/rulesets/9": ruleset(9, "active", "never"),
    }).rest;
    expect(await directPushVerdict(noRights, REPO)).toBe("open");
    const unread = restTable({
      "/repos/o/r": repoReply(ADMIN),
      "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(9)] },
      "/repos/o/r/rulesets/9": { status: 404, json: { message: "Not Found" } },
    }).rest;
    expect(await directPushVerdict(unread, REPO)).toBe("unknown");
  });

  it("an account with no push right is blocked without reading the rules", async () => {
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply({ admin: false, push: false, pull: true }),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
    expect(calls).toEqual(["/repos/o/r"]);
  });
});

describe("directPushVerdict — classic protection", () => {
  const classic = (permissions: Record<string, boolean>, protection: Record<string, unknown>): RestRead =>
    restTable({
      "/repos/o/r": repoReply(permissions),
      "/repos/o/r/rules/branches/main": { status: 200, json: [] },
      "/repos/o/r/branches/main/protection": { status: 200, json: protection },
      "/user": { status: 200, json: { login: "Robot" } },
    }).rest;
  const reviews = (allowances?: Record<string, unknown>): Record<string, unknown> => ({
    required_approving_review_count: 1,
    ...(allowances === undefined ? {} : { bypass_pull_request_allowances: allowances }),
  });

  it("an administrator with enforce_admins off is open and refuses; a writer under the same protection is blocked", async () => {
    const protection = { required_pull_request_reviews: reviews(), enforce_admins: { enabled: false } };
    expect(await directPushVerdict(classic(ADMIN, protection), REPO)).toBe("open");
    const verdict = await runPreflight(greenDeps({ rest: classic(ADMIN, protection) }));
    expect(check(verdict, "direct-push").state).toBe("refuse");
    expect(await directPushVerdict(classic(WRITER, protection), REPO)).toBe("blocked");
  });

  it("an administrator with enforce_admins on is open, since it can turn enforce_admins off (review/37)", async () => {
    // This pinned `blocked` before review/37: the same administrator can lift enforce_admins with one REST call and push.
    const protection = { required_pull_request_reviews: reviews(), enforce_admins: { enabled: true } };
    expect(await directPushVerdict(classic(ADMIN, protection), REPO)).toBe("open");
    const verdict = await runPreflight(greenDeps({ rest: classic(ADMIN, protection) }));
    expect(refusal(verdict, "direct-push")?.fix).toBe("run as an account or token without admin on this repository");
  });

  it("protection without required_pull_request_reviews is open", async () => {
    expect(await directPushVerdict(classic(WRITER, { enforce_admins: { enabled: true } }), REPO)).toBe("open");
  });

  it("the account named in the pull-request allowances is open; one outside them is blocked", async () => {
    const named = { required_pull_request_reviews: reviews({ users: [{ login: "robot" }], teams: [], apps: [] }) };
    expect(await directPushVerdict(classic(WRITER, named), REPO)).toBe("open");
    const other = { required_pull_request_reviews: reviews({ users: [{ login: "someone" }], teams: [], apps: [] }) };
    expect(await directPushVerdict(classic(WRITER, other), REPO)).toBe("blocked");
  });

  it("a team or app allowance cannot be proven to exclude the account, so it is unknown", async () => {
    const teams = { required_pull_request_reviews: reviews({ users: [], teams: [{ slug: "core" }], apps: [] }) };
    expect(await directPushVerdict(classic(WRITER, teams), REPO)).toBe("unknown");
    const apps = { required_pull_request_reviews: reviews({ users: [], teams: [], apps: [{ slug: "bot" }] }) };
    expect(await directPushVerdict(classic(WRITER, apps), REPO)).toBe("unknown");
  });

  it("a write token, no ruleset and a 404 on protection is unknown, so the pre-flight refuses", async () => {
    const { rest } = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 200, json: [] },
      "/repos/o/r/branches/main/protection": NOT_FOUND,
    });
    expect(await directPushVerdict(rest, REPO)).toBe("unknown");
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(verdict.ok).toBe(false);
  });

  it("a 403 on any read is unknown, and a thrown read is unknown", async () => {
    const forbidden = restTable({ "/repos/o/r": { status: 403, json: { message: "Forbidden" } } }).rest;
    expect(await directPushVerdict(forbidden, REPO)).toBe("unknown");
    const rulesForbidden = restTable({
      "/repos/o/r": repoReply(WRITER),
      "/repos/o/r/rules/branches/main": { status: 403, json: {} },
      "/repos/o/r/branches/main/protection": { status: 403, json: {} },
    }).rest;
    expect(await directPushVerdict(rulesForbidden, REPO)).toBe("unknown");
    // Mock reason: a `gh` process that dies mid-call surfaces as a rejected read; no real process can be made to die on cue here.
    const throwing: RestRead = () => Promise.reject(new Error("gh exited 1"));
    expect(await directPushVerdict(throwing, REPO)).toBe("unknown");
  });

  it("an unreadable ruleset beside open classic protection is unknown, where a readable bypassed one is open", async () => {
    const routes = (rulesetReply: Reply): RestRead =>
      restTable({
        "/repos/o/r": repoReply(WRITER),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(3)] },
        "/repos/o/r/rulesets/3": rulesetReply,
        "/repos/o/r/branches/main/protection": { status: 200, json: { enforce_admins: { enabled: true } } },
      }).rest;
    expect(await directPushVerdict(routes({ status: 404, json: { message: "Not Found" } }), REPO)).toBe("unknown");
    expect(await directPushVerdict(routes(ruleset(3, "active", "always")), REPO)).toBe("open");
  });

  it("a branch name is encoded into the path", async () => {
    const { rest, calls } = restTable({
      "/repos/o/r": { status: 200, json: { default_branch: "release/1.x", permissions: WRITER } },
      "/repos/o/r/rules/branches/release%2F1.x": { status: 200, json: [pullRequestRule(8)] },
      "/repos/o/r/rulesets/8": ruleset(8, "active", "never"),
    });
    expect(await directPushVerdict(rest, REPO)).toBe("blocked");
    expect(calls).toContain("/repos/o/r/rules/branches/release%2F1.x");
  });
});

describe("runPreflight — direct-push inputs", () => {
  it("repo null (no origin, a non-GitHub host) is unknown and reads nothing", async () => {
    const { rest, calls } = restTable({});
    const verdict = await runPreflight(greenDeps({ rest, repo: null }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(verdict.ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("rest null (no gh) is unknown, with the fix the plan names", async () => {
    const verdict = await runPreflight(greenDeps({ rest: null }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(refusal(verdict, "direct-push")?.fix).toBe(
      "add a ruleset that requires a pull request, or run as an account that can read the protection",
    );
    expect(verdict.ok).toBe(false);
  });

  it("GH_REPO naming another repository beside an origin of o/r refuses, where GH_REPO naming origin passes", async () => {
    const other = await runPreflight(greenDeps({ ghRepoEnv: "other/repo" }));
    expect(check(other, "direct-push").state).toBe("refuse");
    expect(other.ok).toBe(false);
    const same = await runPreflight(greenDeps({ ghRepoEnv: "O/R" }));
    expect(check(same, "direct-push").state).toBe("pass");
    const hosted = await runPreflight(greenDeps({ ghRepoEnv: "github.com/o/r" }));
    expect(check(hosted, "direct-push").state).toBe("pass");
    const blank = await runPreflight(greenDeps({ ghRepoEnv: "  " }));
    expect(check(blank, "direct-push").state).toBe("pass");
  });

  it("GH_REPO on another host, or in a shape that cannot be read, refuses", async () => {
    const elsewhere = await runPreflight(greenDeps({ ghRepoEnv: "git.example.com/o/r" }));
    expect(check(elsewhere, "direct-push").state).toBe("refuse");
    // Since review/63 and review/64 the push identity is read from origin's URLs, so the enterprise case names its own.
    const enterpriseUrl = "https://git.example.com/o/r.git";
    const enterprise = await runPreflight(
      greenDeps({
        ghRepoEnv: "git.example.com/o/r",
        env: { GH_HOST: "git.example.com" },
        pushIdentity: { fetchUrl: enterpriseUrl, pushUrls: [pushTo(enterpriseUrl)] },
      }),
    );
    expect(check(enterprise, "direct-push").state).toBe("pass");
    const url = await runPreflight(greenDeps({ ghRepoEnv: "https://github.com/o/r" }));
    expect(check(url, "direct-push").state).toBe("refuse");
  });

  it("GH_REPO on github.com beside an origin on the GH_HOST enterprise host refuses (review/21)", async () => {
    const env = { GH_HOST: "ghe.example.com" };
    const crossHost = await runPreflight(greenDeps({ env, ghRepoEnv: "github.com/o/r" }));
    expect(check(crossHost, "direct-push").state).toBe("refuse");
    expect(check(crossHost, "direct-push").evidence).toContain("another host");
    // The origin's URLs sit on the GH_HOST host, as they must for the push identity to resolve (review/63, review/64).
    const gheUrl = "https://ghe.example.com/o/r.git";
    const bare = await runPreflight(
      greenDeps({
        env: { GH_HOST: "https://GHE.example.com:443/" },
        ghRepoEnv: "o/r",
        pushIdentity: { fetchUrl: gheUrl, pushUrls: [pushTo(gheUrl)] },
      }),
    );
    expect(check(bare, "direct-push").state).toBe("pass");
  });

  it("a proxy origin reads as github.com, so a GH_HOST naming another host refuses (review/39)", async () => {
    const proxy = { fetchUrl: PROXY_URL, pushUrls: [pushTo(PROXY_URL, null)] };
    const { rest, calls } = restTable({});
    const elsewhere = await runPreflight(greenDeps({ rest, pushIdentity: proxy, env: { GH_HOST: "ghe.example.com" } }));
    expect(check(elsewhere, "direct-push").state).toBe("refuse");
    expect(refusal(elsewhere, "direct-push")?.fix).toBe("unset GH_HOST, or set it to the origin's host");
    expect(calls).toEqual([]);
    const home = await runPreflight(greenDeps({ pushIdentity: proxy, env: { GH_HOST: "github.com" } }));
    expect(check(home, "direct-push").state).toBe("pass");
  });

  it("an origin name carrying path characters is unknown and builds no path", async () => {
    const { rest, calls } = restTable({});
    const verdict = await runPreflight(greenDeps({ rest, repo: { owner: "..", repo: "r/../x" } }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(calls).toEqual([]);
  });
});

describe("runPreflight — the push identity (review/36)", () => {
  const fix = "use an https origin with `gh auth setup-git`";

  it.each([
    ["gh's helper at a plain path", GH_HELPER],
    ["gh's helper at a quoted Windows path", "!'C:\\Program Files\\GitHub CLI\\gh.exe' auth git-credential"],
    ["gh's helper on PATH", "!gh auth git-credential"],
  ])("an https origin with %s passes", async (_label, helper) => {
    const verdict = await runPreflight(greenDeps({ pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [pushTo(FETCH_URL, [helper])] } }));
    expect(check(verdict, "direct-push").state).toBe("pass");
    expect(check(verdict, "direct-push").evidence).toContain("gh's credential");
  });

  it("the cloud proxy origin passes and names its residual", async () => {
    const verdict = await runPreflight(greenDeps({ pushIdentity: { fetchUrl: PROXY_URL, pushUrls: [pushTo(PROXY_URL, null)] } }));
    expect(check(verdict, "direct-push").state).toBe("pass");
    expect(check(verdict, "direct-push").evidence).toContain("residual");
  });

  it.each([
    ["an ssh push URL", pushTo("git@github.com:o/r.git", [])],
    ["an ssh:// push URL", pushTo("ssh://git@github.com/o/r.git", [GH_HELPER])],
    ["an https push URL carrying credentials", pushTo("https://x-access-token:s3cr3tvalue@github.com/o/r", [GH_HELPER])],
    ["a plain http push URL", pushTo("http://github.com/o/r", [GH_HELPER])],
    ["no credential helper", pushTo(FETCH_URL, [])],
    ["a helper list that cannot be placed", pushTo(FETCH_URL, null)],
    ["osxkeychain", pushTo(FETCH_URL, ["osxkeychain"])],
    ["gh's helper beside another", pushTo(FETCH_URL, [GH_HELPER, "osxkeychain"])],
    ["a helper chaining a command", pushTo(FETCH_URL, ["!evil && /usr/bin/gh auth git-credential"])],
    ["a helper that is not gh", pushTo(FETCH_URL, ["!/tmp/not-gh auth git-credential"])],
    ["gh's binary on another verb", pushTo(FETCH_URL, ["!/usr/bin/gh auth status"])],
  ])("%s is unknown, refused with the gh fix, and reads nothing", async (_label, facts) => {
    const { rest, calls } = restTable({});
    const verdict = await runPreflight(greenDeps({ rest, pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [facts] } }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(refusal(verdict, "direct-push")?.fix).toBe(fix);
    expect(verdict.ok).toBe(false);
    expect(calls).toEqual([]);
    // Neither the URL nor a helper is ever echoed.
    const text = JSON.stringify(verdict);
    expect(text).not.toContain(facts.url);
    for (const helper of facts.helpers ?? []) expect(text).not.toContain(helper);
  });

  it("an Authorization http.extraHeader on the push URL is unknown and reads nothing, the same URL without it passes (review/63)", async () => {
    const { rest, calls } = restTable({});
    const headed = await runPreflight(
      greenDeps({ rest, pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [pushTo(FETCH_URL, [GH_HELPER], true)] } }),
    );
    expect(check(headed, "direct-push").state).toBe("unknown");
    expect(check(headed, "direct-push").evidence).toContain("Authorization http.extraHeader");
    expect(refusal(headed, "direct-push")?.fix).toContain("persist-credentials: false");
    expect(calls).toEqual([]);
    // The cloud proxy is no exception: a header that applies to it sends that header's credential too.
    const proxied = await runPreflight(
      greenDeps({ pushIdentity: { fetchUrl: PROXY_URL, pushUrls: [pushTo(PROXY_URL, null, true)] } }),
    );
    expect(check(proxied, "direct-push").state).toBe("unknown");
    const clean = await runPreflight(greenDeps({ pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [pushTo()] } }));
    expect(check(clean, "direct-push").state).toBe("pass");
  });

  const twice = (second: PushUrlFacts): PreflightDeps["pushIdentity"] => ({ fetchUrl: FETCH_URL, pushUrls: [pushTo(), second] });

  it.each([
    ["ssh", pushTo("git@github.com:o/r.git", []), "push URL 2 of 2 is ssh"],
    ["on another repository", pushTo("https://github.com/someone/else.git"), "push URL 2 of 2 names another repository"],
    ["under an Authorization header", pushTo(FETCH_URL, [GH_HELPER], true), "applies to push URL 2 of 2"],
    ["through another helper", pushTo(FETCH_URL, ["osxkeychain"]), "push URL 2 of 2"],
  ] as const)("every push URL is read: a second one %s is unknown and reads nothing (review/64)", async (_label, second, evidence) => {
    const { rest, calls } = restTable({});
    const verdict = await runPreflight(greenDeps({ rest, pushIdentity: twice(second) }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(check(verdict, "direct-push").evidence).toContain(evidence);
    expect(calls).toEqual([]);
  });

  it("two push URLs that both bind pass (review/64)", async () => {
    const both = await runPreflight(greenDeps({ pushIdentity: twice(pushTo("https://GitHub.com/O/R")) }));
    expect(check(both, "direct-push").state).toBe("pass");
    expect(check(both, "direct-push").evidence).toContain("2 push URLs");
  });

  it("a push URL on another repository, no push URL, or a fetch URL off the checked repository is unknown", async () => {
    const elsewhere = await runPreflight(
      greenDeps({ pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [pushTo("https://github.com/o/other")] } }),
    );
    expect(check(elsewhere, "direct-push").state).toBe("unknown");
    expect(refusal(elsewhere, "direct-push")?.fix).toBe("point every push URL of origin at the repository its fetch URL names");
    const none = await runPreflight(greenDeps({ pushIdentity: { fetchUrl: FETCH_URL, pushUrls: [] } }));
    expect(check(none, "direct-push").state).toBe("unknown");
    const noFetch = await runPreflight(greenDeps({ pushIdentity: { fetchUrl: null, pushUrls: [pushTo()] } }));
    expect(check(noFetch, "direct-push").state).toBe("unknown");
    const offRepo = await runPreflight(
      greenDeps({ pushIdentity: { fetchUrl: "https://github.com/o/other.git", pushUrls: [pushTo("https://github.com/o/other.git")] } }),
    );
    expect(check(offRepo, "direct-push").state).toBe("unknown");
  });
});

describe("runPreflight — hooks-loaded (a canary, not a wall)", () => {
  it("no canary refuses", async () => {
    const verdict = await runPreflight(greenDeps({ canary: null }));
    expect(check(verdict, "hooks-loaded").state).toBe("refuse");
    expect(verdict.ok).toBe(false);
  });

  it("a canary 121 s old refuses; one exactly 120 s old passes", async () => {
    expect(CANARY_MAX_AGE_MS).toBe(120_000);
    const stale = await runPreflight(greenDeps({ canary: { at: secondsBefore(121) } }));
    expect(check(stale, "hooks-loaded").state).toBe("refuse");
    expect(stale.ok).toBe(false);
    const edge = await runPreflight(greenDeps({ canary: { at: secondsBefore(120) } }));
    expect(check(edge, "hooks-loaded").state).toBe("pass");
    expect(check(edge, "hooks-loaded").evidence).toContain("canary");
  });

  it("a canary dated after now, or with no readable time, refuses", async () => {
    const future = await runPreflight(greenDeps({ canary: { at: secondsBefore(-30) } }));
    expect(check(future, "hooks-loaded").state).toBe("refuse");
    const garbled = await runPreflight(greenDeps({ canary: { at: "not a time" } }));
    expect(check(garbled, "hooks-loaded").state).toBe("refuse");
    expect(check(garbled, "hooks-loaded").evidence).not.toContain("not a time");
  });
});

describe("runPreflight — node, pin, scan, floors", () => {
  it("node below engines refuses naming both versions", async () => {
    const verdict = await runPreflight(greenDeps({ nodeVersion: "v20.11.1", engines: ">=22.22.2" }));
    const node = check(verdict, "node-engine");
    expect(node.state).toBe("refuse");
    expect(node.evidence).toContain("20.11.1");
    expect(node.evidence).toContain(">=22.22.2");
    expect(refusal(verdict, "node-engine")?.reason).toContain("20.11.1");
    expect(verdict.ok).toBe(false);
  });

  it("no engines range passes; an unreadable node version refuses", async () => {
    const free = await runPreflight(greenDeps({ engines: undefined }));
    expect(check(free, "node-engine").state).toBe("pass");
    const odd = await runPreflight(greenDeps({ nodeVersion: "banana" }));
    expect(check(odd, "node-engine").state).toBe("refuse");
  });

  it("a pin the running CLI does not match refuses naming both; no pin is unknown", async () => {
    const drift = await runPreflight(greenDeps({ pinnedVersion: "1.15.0", runningVersion: "1.16.0" }));
    expect(check(drift, "cli-pin").state).toBe("refuse");
    expect(check(drift, "cli-pin").evidence).toContain("1.15.0");
    expect(check(drift, "cli-pin").evidence).toContain("1.16.0");
    const none = await runPreflight(greenDeps({ pinnedVersion: undefined }));
    expect(check(none, "cli-pin").state).toBe("unknown");
    expect(none.ok).toBe(false);
  });

  it("a scan that cannot run refuses; one that throws is unknown", async () => {
    const no = await runPreflight(greenDeps({ scanRuns: () => Promise.resolve(false) }));
    expect(check(no, "gate-scan").state).toBe("refuse");
    // Mock reason: the real scan's failure modes (git missing, a corrupt index) cannot be staged in a unit test.
    const broken = await runPreflight(greenDeps({ scanRuns: () => Promise.reject(new Error("git not found")) }));
    expect(check(broken, "gate-scan").state).toBe("unknown");
    expect(broken.ok).toBe(false);
  });

  it("a floor file missing, a floor absent from the list, or no floors at all refuses", async () => {
    expect([...REQUIRED_FLOORS]).toEqual(["question-protocol", "injection-screening"]);
    const missing = await runPreflight(
      greenDeps({
        floors: [
          { id: "question-protocol", path: "x/a.md", exists: true },
          { id: "injection-screening", path: "x/b.md", exists: false },
        ],
      }),
    );
    expect(check(missing, "floors").state).toBe("refuse");
    expect(check(missing, "floors").evidence).toContain("x/b.md");
    const absent = await runPreflight(
      greenDeps({ floors: [{ id: "question-protocol", path: "x/a.md", exists: true }] }),
    );
    expect(check(absent, "floors").state).toBe("refuse");
    expect(check(absent, "floors").evidence).toContain("injection-screening");
    const empty = await runPreflight(greenDeps({ floors: [] }));
    expect(check(empty, "floors").state).toBe("refuse");
  });

  it("one client's copy missing among several refuses", async () => {
    const verdict = await runPreflight(
      greenDeps({
        floors: [
          { id: "question-protocol", path: "x/one/q.md", exists: true },
          { id: "question-protocol", path: "x/two/q.md", exists: false },
          { id: "injection-screening", path: "x/one/s.md", exists: true },
        ],
      }),
    );
    expect(check(verdict, "floors").state).toBe("refuse");
  });
});

describe("runPreflight — input-author", () => {
  const authorRoutes = (permission: Reply, issueRepo = "o/r"): Record<string, Reply> => ({
    "/repos/o/r": repoReply(WRITER),
    "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(7)] },
    "/repos/o/r/rulesets/7": ruleset(7, "active", "never"),
    [`/repos/${issueRepo}/issues/12`]: { status: 200, json: { number: 12, user: { login: "alice", type: "User" } } },
    "/repos/o/r/collaborators/alice/permission": permission,
  });

  it("no item passes without a read", async () => {
    const { rest, calls } = restTable(authorRoutes({ status: 200, json: { permission: "write" } }));
    const verdict = await runPreflight(greenDeps({ rest }));
    expect(check(verdict, "input-author").state).toBe("pass");
    expect(calls.some((path) => path.includes("/issues/"))).toBe(false);
  });

  it.each([
    ["admin", "pass"],
    ["write", "pass"],
    ["read", "refuse"],
    ["none", "refuse"],
  ] as const)("an author with %s permission reads %s", async (permission, state) => {
    const { rest } = restTable(authorRoutes({ status: 200, json: { permission, role_name: permission } }));
    const verdict = await runPreflight(greenDeps({ rest, item: { owner: "o", repo: "r", number: 12 } }));
    expect(check(verdict, "input-author").state).toBe(state);
    expect(verdict.ok).toBe(state === "pass");
  });

  it("an unreadable permission is unknown and refuses", async () => {
    const { rest } = restTable(authorRoutes({ status: 404, json: { message: "Not Found" } }));
    const verdict = await runPreflight(greenDeps({ rest, item: { owner: "o", repo: "r", number: 12 } }));
    expect(check(verdict, "input-author").state).toBe("unknown");
    expect(verdict.ok).toBe(false);
  });

  it("an item on another repository is read there, and its author's permission on origin", async () => {
    const { rest, calls } = restTable(authorRoutes({ status: 200, json: { permission: "write" } }, "t/board"));
    const verdict = await runPreflight(greenDeps({ rest, item: { owner: "t", repo: "board", number: 12 } }));
    expect(check(verdict, "input-author").state).toBe("pass");
    expect(calls).toContain("/repos/t/board/issues/12");
    expect(calls).toContain("/repos/o/r/collaborators/alice/permission");
    expect(calls).not.toContain("/repos/t/board/collaborators/alice/permission");
  });

  it("an Enterprise Managed Users author and owner (a `_` in the name) are read, not refused (review/19)", async () => {
    const emu = { owner: "acme_corp", repo: "r" };
    const { rest } = restTable({
      "/repos/acme_corp/r": repoReply(WRITER),
      "/repos/acme_corp/r/rules/branches/main": { status: 200, json: [pullRequestRule(7)] },
      "/repos/acme_corp/r/rulesets/7": ruleset(7, "active", "never"),
      "/repos/acme_corp/r/issues/12": { status: 200, json: { number: 12, user: { login: "jdoe_acme", type: "User" } } },
      "/repos/acme_corp/r/collaborators/jdoe_acme/permission": { status: 200, json: { permission: "write" } },
    });
    // The origin's URLs name the same repository, as the push identity requires since review/63 and review/64.
    const emuUrl = "https://github.com/acme_corp/r.git";
    const verdict = await runPreflight(
      greenDeps({
        rest,
        repo: emu,
        item: { ...emu, number: 12 },
        pushIdentity: { fetchUrl: emuUrl, pushUrls: [pushTo(emuUrl)] },
      }),
    );
    expect(check(verdict, "direct-push").state).toBe("pass");
    expect(check(verdict, "input-author").state).toBe("pass");
  });

  it("an item with no rest or no origin is unknown", async () => {
    const noRest = await runPreflight(greenDeps({ rest: null, item: { owner: "o", repo: "r", number: 12 } }));
    expect(check(noRest, "input-author").state).toBe("unknown");
    const noOrigin = await runPreflight(greenDeps({ repo: null, item: { owner: "o", repo: "r", number: 12 } }));
    expect(check(noOrigin, "input-author").state).toBe("unknown");
  });
});

describe("runPreflight — warnings", () => {
  it("a token-shaped environment value is named, its value absent from the serialized verdict", async () => {
    // Built at run time so this file carries no credential-shaped literal of its own.
    const tokenValue = ["ghp", "_", "Zq8".repeat(12)].join("");
    const verdict = await runPreflight(
      greenDeps({ env: { HARMLESS_LOOKING: tokenValue, NPM_TOKEN: "plain", PWD: "/work", HOME: "/home/u" } }),
    );
    const tokenEnv = verdict.warnings.find((warning) => warning.id === "token-env");
    expect(tokenEnv?.names).toEqual(["HARMLESS_LOOKING", "NPM_TOKEN"]);
    expect(JSON.stringify(verdict)).not.toContain(tokenValue);
    expect(JSON.stringify(verdict)).not.toContain("Zq8Zq8");
    // A warning never refuses.
    expect(verdict.ok).toBe(true);
  });

  it("a long checkout path in PWD, OLDPWD, HOME or PATH is never named (review/20)", async () => {
    // 46 letters and slashes: secretScan's high-entropy row matches it, and `PWD` is credential context to it.
    const checkout = "/Users/denismasatovic/Projects/zomarit/stamity";
    const verdict = await runPreflight(
      greenDeps({ env: { PWD: checkout, OLDPWD: checkout, HOME: checkout, PATH: checkout, NODE_PATH: checkout } }),
    );
    expect(verdict.warnings.find((warning) => warning.id === "token-env")).toBeUndefined();
    // A recognised token inside a path holder is still named.
    const tokenValue = ["ghp", "_", "Zq8".repeat(12)].join("");
    const leaked = await runPreflight(greenDeps({ env: { PATH: `/bin:${tokenValue}` } }));
    expect(leaked.warnings.find((warning) => warning.id === "token-env")?.names).toEqual(["PATH"]);
  });

  it("a long password in a name only ending in PWD is named: path holders match whole names (review/66)", async () => {
    // 48 base64-shaped characters, built at run time: the high-entropy row with PWD as credential context.
    const password = ["Kq7", "Zp2", "Wm9", "Xr4"].join("").repeat(4);
    const verdict = await runPreflight(greenDeps({ env: { MYSQL_PWD: password, DB_PWD: password, PWD: password } }));
    expect(verdict.warnings.find((warning) => warning.id === "token-env")?.names).toEqual(["DB_PWD", "MYSQL_PWD"]);
    expect(JSON.stringify(verdict)).not.toContain(password);
  });

  it("no credential-shaped variable gives no token-env warning", async () => {
    const verdict = await runPreflight(greenDeps({ env: { HOME: "/home/u", PATH: "/bin", PWD: "/w", EMPTY_TOKEN: "" } }));
    expect(verdict.warnings.find((warning) => warning.id === "token-env")).toBeUndefined();
  });

  it("a Cursor agent machine warns on egress; elsewhere it does not", async () => {
    const cursor = await runPreflight(greenDeps({ env: { CURSOR_AGENT_SOCKET: "/tmp/sock" } }));
    expect(cursor.warnings.map((warning) => warning.id)).toContain("cursor-egress");
    expect(cursor.ok).toBe(true);
    const local = await runPreflight(greenDeps());
    expect(local.warnings.map((warning) => warning.id)).not.toContain("cursor-egress");
  });

  it("review-state warns when the review gate holds no counter and the record has no usage: review line (review/18)", async () => {
    // This test pinned the rule's approving-review count before review/18; the signed-off reading is the run's own
    // review state, so a zero-review rule with a review recorded no longer warns, and an unreviewed run always does.
    const routes = (reviews: number): RestRead =>
      restTable({
        "/repos/o/r": repoReply(WRITER),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(7, reviews)] },
        "/repos/o/r/rulesets/7": ruleset(7, "active", "never"),
      }).rest;
    const unreviewed = await runPreflight(
      greenDeps({ rest: routes(1), reviewState: { counter: false, usageReviewLines: 0 } }),
    );
    const warning = unreviewed.warnings.find((entry) => entry.id === "review-state");
    expect(warning?.reason).toContain("usage: review");
    expect(unreviewed.ok).toBe(true);
    const counted = await runPreflight(greenDeps({ rest: routes(0), reviewState: { counter: true, usageReviewLines: 0 } }));
    expect(counted.warnings.map((entry) => entry.id)).not.toContain("review-state");
    const recorded = await runPreflight(greenDeps({ rest: routes(0), reviewState: { counter: false, usageReviewLines: 2 } }));
    expect(recorded.warnings.map((entry) => entry.id)).not.toContain("review-state");
  });

  it("a pull_requests_only bypass warns review-state that the account can merge without the review (review/38)", async () => {
    const routes = (bypass: string): RestRead =>
      restTable({
        "/repos/o/r": repoReply(WRITER),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(7)] },
        "/repos/o/r/rulesets/7": ruleset(7, "active", bypass),
      }).rest;
    const bypassing = await runPreflight(greenDeps({ rest: routes("pull_requests_only") }));
    expect(check(bypassing, "direct-push").state).toBe("pass");
    const warning = bypassing.warnings.find((entry) => entry.id === "review-state");
    expect(warning?.reason).toContain("merge a pull request without the required review");
    const bound = await runPreflight(greenDeps({ rest: routes("never") }));
    expect(bound.warnings.map((entry) => entry.id)).not.toContain("review-state");
  });
});
