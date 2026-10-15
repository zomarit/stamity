import { describe, expect, it } from "vitest";
import {
  CANARY_MAX_AGE_MS,
  directPushVerdict,
  REQUIRED_FLOORS,
  runPreflight,
  type PreflightDeps,
  type PreflightVerdict,
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

/** The repository read: default branch `main`, the account's rights as given. */
function repoReply(permissions: Record<string, boolean> | undefined): Reply {
  return { status: 200, json: { default_branch: "main", ...(permissions === undefined ? {} : { permissions }) } };
}

const WRITER = { admin: false, maintain: false, push: true, triage: true, pull: true };
const ADMIN = { admin: true, maintain: true, push: true, triage: true, pull: true };

function pullRequestRule(rulesetId: number, reviews = 1): Record<string, unknown> {
  return {
    type: "pull_request",
    parameters: { required_approving_review_count: reviews, dismiss_stale_reviews_on_push: false },
    ruleset_source_type: "Repository",
    ruleset_source: "o/r",
    ruleset_id: rulesetId,
  };
}

function ruleset(id: number, enforcement: string, bypass: string | undefined): Reply {
  return {
    status: 200,
    json: {
      id,
      name: "main",
      target: "branch",
      enforcement,
      ...(bypass === undefined ? {} : { current_user_can_bypass: bypass }),
      rules: [{ type: "pull_request" }],
    },
  };
}

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
    const { rest } = restTable({
      "/repos/o/r": repoReply(ADMIN),
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
    const { rest, calls } = restTable({
      "/repos/o/r": repoReply(ADMIN),
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

  it("an administrator with enforce_admins on is blocked", async () => {
    const protection = { required_pull_request_reviews: reviews(), enforce_admins: { enabled: true } };
    expect(await directPushVerdict(classic(ADMIN, protection), REPO)).toBe("blocked");
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
    const enterprise = await runPreflight(
      greenDeps({ ghRepoEnv: "git.example.com/o/r", env: { GH_HOST: "git.example.com" } }),
    );
    expect(check(enterprise, "direct-push").state).toBe("pass");
    const url = await runPreflight(greenDeps({ ghRepoEnv: "https://github.com/o/r" }));
    expect(check(url, "direct-push").state).toBe("refuse");
  });

  it("an origin name carrying path characters is unknown and builds no path", async () => {
    const { rest, calls } = restTable({});
    const verdict = await runPreflight(greenDeps({ rest, repo: { owner: "..", repo: "r/../x" } }));
    expect(check(verdict, "direct-push").state).toBe("unknown");
    expect(calls).toEqual([]);
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

  it("a blocking rule that requires no approving review warns review-state; one requiring a review does not", async () => {
    const routes = (reviews: number): RestRead =>
      restTable({
        "/repos/o/r": repoReply(WRITER),
        "/repos/o/r/rules/branches/main": { status: 200, json: [pullRequestRule(7, reviews)] },
        "/repos/o/r/rulesets/7": ruleset(7, "active", "never"),
      }).rest;
    const unreviewed = await runPreflight(greenDeps({ rest: routes(0) }));
    expect(unreviewed.warnings.map((warning) => warning.id)).toContain("review-state");
    expect(unreviewed.ok).toBe(true);
    const reviewed = await runPreflight(greenDeps({ rest: routes(1) }));
    expect(reviewed.warnings.map((warning) => warning.id)).not.toContain("review-state");
  });
});
