import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ghApi, ghApiArgs } from "../../src/cli/engine/ghRunner.ts";
import {
  CLAUDE_PROXY_ORIGIN,
  ensureDraftPr,
  HOST_NAME,
  hostOf,
  resolveRepo,
  runMarker,
  type DraftPrRequest,
  type GhApi,
  type RestRequest,
  type RestResponse,
} from "../../src/runs/pullRequest.ts";

/**
 * The draft pull request's logic (REQ-FLOW-092) over a recorded REST seam.
 *
 * Every case below drives `ensureDraftPr` through {@link scriptedGh}, a stand-in
 * for `ghApi`. Mock reason: the real seam calls GitHub's network under the
 * operator's login, which no test may do, and the answers this logic branches
 * on (a draft refused with 422, a race that already opened one) are vendor
 * answers no local server reproduces. The seam itself is proven in
 * `test/cli/engine/ghRunner.test.ts`.
 */

const RUN = "2026-10-16_cloud";
const MARKER = runMarker(RUN);
const BRANCH = "stamity/2026-10-16_cloud";

const REQUEST: DraftPrRequest = {
  host: "github.com",
  owner: "acme",
  repo: "app",
  head: BRANCH,
  base: "main",
  title: "Cloud runs",
  body: "# Morning list\n\nnone\n",
  runId: RUN,
};

// The lookup filters by base as well as head (pr/52): one head may have open pull requests into other bases.
const LOOKUP = `repos/acme/app/pulls?head=${encodeURIComponent(`acme:${BRANCH}`)}&state=open&base=main`;

type Answer = RestResponse | Error;

/** Every call each case's stand-in recorded, read by the person-only assertion after the case. */
const recorded: RestRequest[][] = [];

/** A recorded stand-in for `ghApi`: answers each call from `answers` in order and records it; an unscripted call fails the test. */
function scriptedGh(answers: readonly Answer[]): { gh: GhApi; calls: RestRequest[] } {
  const calls: RestRequest[] = [];
  recorded.push(calls);
  let next = 0;
  const gh: GhApi = (request) => {
    calls.push(request);
    const answer = answers[next];
    next += 1;
    if (answer === undefined) return Promise.reject(new Error(`unscripted call ${request.method} ${request.path}`));
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  };
  return { gh, calls };
}

/** An open pull request into `main`: the lookup now matches the base too (pr/52), so each fixture names it. */
function openPr(number: number, body: string | null, head = BRANCH): Record<string, unknown> {
  return { number, html_url: `https://github.com/acme/app/pull/${number}`, body, head: { ref: head, label: `acme:${head}` }, base: { ref: "main" } };
}

const CREATED = { status: 201, json: { number: 12, html_url: "https://github.com/acme/app/pull/12" } };
const DRAFTS_REFUSED = {
  status: 422,
  json: { message: "Validation Failed", errors: [{ message: "Draft pull requests are not supported in this repository." }] },
};
const ALREADY_EXISTS = {
  status: 422,
  json: { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: `A pull request already exists for acme:${BRANCH}.` }] },
};

/** The threat row's assertion, over every call a case recorded: no merge, no ready, no GraphQL, no PUT. */
function expectNoPersonOnlyCall(calls: readonly RestRequest[]): void {
  for (const call of calls) {
    expect(call.method, call.path).not.toBe("PUT");
    expect(["GET", "POST", "PATCH"]).toContain(call.method);
    expect(call.path).not.toMatch(/merge|ready|graphql/i);
  }
}

describe("ensureDraftPr", () => {
  // The testCriteria row holds across every case, so it runs after each one.
  afterEach(() => {
    expectNoPersonOnlyCall(recorded.splice(0).flat());
  });

  it("replaces only the body of an open pull request carrying this run's marker, and posts nothing", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [openPr(7, `old list\n\n${MARKER}\n`)] },
      { status: 200, json: openPr(7, "new") },
    ]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 7, url: "https://github.com/acme/app/pull/7", how: "existing" });
    expect(calls).toEqual([
      { method: "GET", path: LOOKUP, hostname: "github.com" },
      { method: "PATCH", path: "repos/acme/app/pulls/7", body: { body: `# Morning list\n\nnone\n\n${MARKER}` }, hostname: "github.com" },
    ]);
  });

  it("comments on an open pull request without the marker and leaves its body untouched", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [openPr(9, "A person's description.")] },
      { status: 201, json: { id: 1 } },
    ]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 9, url: "https://github.com/acme/app/pull/9", how: "commented" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET ${LOOKUP}`, "POST repos/acme/app/issues/9/comments"]);
    expect(calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("comments where the open pull request carries another run's marker", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [openPr(9, `list\n\n${runMarker("2026-10-15_other")}`)] },
      { status: 201, json: { id: 1 } },
    ]);

    expect(await ensureDraftPr(gh, REQUEST)).toMatchObject({ number: 9, how: "commented" });
    expect(calls[1]?.method).toBe("POST");
  });

  it("opens one draft when the branch has none", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, CREATED]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 12, url: "https://github.com/acme/app/pull/12", how: "created" });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({
      method: "POST",
      path: "repos/acme/app/pulls",
      hostname: "github.com",
      body: { title: "Cloud runs", head: BRANCH, base: "main", body: `# Morning list\n\nnone\n\n${MARKER}`, draft: true },
    });
  });

  it("keeps a body that already ends with the marker as it is", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, CREATED]);

    await ensureDraftPr(gh, { ...REQUEST, body: `list\n\n${MARKER}\n` });

    expect(calls[1]?.body).toEqual({ title: "Cloud runs", head: BRANCH, base: "main", body: `list\n\n${MARKER}`, draft: true });
  });

  it("falls back to a normal pull request titled [DRAFT] when the repository refuses drafts", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, DRAFTS_REFUSED, CREATED]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 12, url: "https://github.com/acme/app/pull/12", how: "created-fallback" });
    expect(calls).toHaveLength(3);
    expect(calls[2]?.method).toBe("POST");
    expect(calls[2]?.path).toBe("repos/acme/app/pulls");
    expect(calls[2]?.body).toEqual({ title: "[DRAFT] Cloud runs", head: BRANCH, base: "main", body: `# Morning list\n\nnone\n\n${MARKER}` });
    expect(calls[2]?.body).not.toHaveProperty("draft");
  });

  it("looks again on a 422 saying one already exists, and never takes the fallback", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [] },
      ALREADY_EXISTS,
      { status: 200, json: [openPr(14, `raced\n\n${MARKER}`)] },
      { status: 200, json: openPr(14, "new") },
    ]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 14, url: "https://github.com/acme/app/pull/14", how: "existing" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET ${LOOKUP}`,
      "POST repos/acme/app/pulls",
      `GET ${LOOKUP}`,
      "PATCH repos/acme/app/pulls/14",
    ]);
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(1);
  });

  it("reports not done, and takes no fallback, on a 422 that only echoes a branch holding the word draft", async () => {
    const head = "stamity/2026-10-16_draft-notes";
    const { gh, calls } = scriptedGh([
      { status: 200, json: [] },
      { status: 422, json: { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: `No commits between main and ${head}` }] } },
    ]);

    expect(await ensureDraftPr(gh, { ...REQUEST, head })).toEqual({
      notDone: `draft PR not opened (${head}): GitHub answered HTTP 422: no commits between main and ${head}`,
    });
    expect(calls).toHaveLength(2);
  });

  it("names the host the repository was matched on in every call, and the host reaches gh's argument vector", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [openPr(9, "A person's description.")] }, { status: 201, json: { id: 1 } }]);

    await ensureDraftPr(gh, { ...REQUEST, host: "ghe.example.com" });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.hostname, call.path).toBe("ghe.example.com");
      expect(ghApiArgs(call).slice(0, 3), call.path).toEqual(["api", "--hostname", "ghe.example.com"]);
    }
  });

  it("reports not done when the re-lookup after 'already exists' finds nothing", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, ALREADY_EXISTS, { status: 200, json: [] }]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({
      notDone: `draft PR not opened (${BRANCH}): GitHub said one already exists, and the second lookup found none open`,
    });
    expect(calls).toHaveLength(3);
  });

  it("reports not done on a 422 that names neither drafts nor an existing one", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [] },
      { status: 422, json: { message: "Validation Failed", errors: [{ field: "base", code: "invalid" }] } },
    ]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ notDone: `draft PR not opened (${BRANCH}): GitHub answered HTTP 422: the base branch was refused` });
    expect(calls).toHaveLength(2);
  });

  it("reports not done, and posts nothing, when the lookup is not answered", async () => {
    const { gh, calls } = scriptedGh([{ status: 404, json: { message: "Not Found" } }]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ notDone: `draft PR not opened (${BRANCH}): the lookup answered HTTP 404` });
    expect(calls).toHaveLength(1);
  });

  it("reads a pull request the lookup returns for another branch as none (GitHub ignores a head filter it cannot read)", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [openPr(3, `x\n\n${MARKER}`, "someone/else")] }, CREATED]);

    expect(await ensureDraftPr(gh, REQUEST)).toMatchObject({ number: 12, how: "created" });
    expect(calls.some((call) => call.path.includes("/pulls/3"))).toBe(false);
  });

  it("takes the run's own pull request whose label spells the owner in GitHub's canonical case (pr/12)", async () => {
    // The origin URL spells the owner `acme`; GitHub's `head=` filter matches it caselessly and labels the head `Acme:`.
    const canonical = { ...openPr(7, `old list\n\n${MARKER}\n`), head: { ref: BRANCH, label: `Acme:${BRANCH}` } };
    const { gh, calls } = scriptedGh([{ status: 200, json: [canonical] }, { status: 200, json: openPr(7, "new") }]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ number: 7, url: "https://github.com/acme/app/pull/7", how: "existing" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET ${LOOKUP}`, "PATCH repos/acme/app/pulls/7"]);
  });

  it("opens a draft into the default branch when the branch's only open pull request targets another base", async () => {
    // GitHub keeps one open pull request per head and base, so a kept branch may already have a person's one into a release branch.
    const release = { ...openPr(7, `old list\n\n${MARKER}\n`), base: { ref: "release/1.x" } };
    const { gh, calls } = scriptedGh([{ status: 200, json: [release] }, CREATED]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ number: 12, url: "https://github.com/acme/app/pull/12", how: "created" });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([`GET ${LOOKUP}`, "POST repos/acme/app/pulls"]);
    expect(calls[1]?.body).toMatchObject({ head: BRANCH, base: "main", draft: true });
    expect(calls.some((call) => call.method === "PATCH" || call.path.includes("/issues/7/"))).toBe(false);
  });

  it("still reads a pull request from another owner's branch of the same name as none (pr/12)", async () => {
    const fork = { ...openPr(3, `x\n\n${MARKER}`), head: { ref: BRANCH, label: `other:${BRANCH}` } };
    const { gh, calls } = scriptedGh([{ status: 200, json: [fork] }, CREATED]);

    expect(await ensureDraftPr(gh, REQUEST)).toMatchObject({ number: 12, how: "created" });
    expect(calls.some((call) => call.path.includes("/pulls/3"))).toBe(false);
  });

  it("answers gh not found, and does not throw, when the seam cannot start gh", async () => {
    const missing = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    const { gh } = scriptedGh([missing]);

    await expect(ensureDraftPr(gh, REQUEST)).resolves.toEqual({ notDone: `draft PR not opened (${BRANCH}): gh not found` });
  });

  it("names each failure by its class after the prefix, never gh's stderr nor GitHub's text (review/199)", async () => {
    const stderr = "To get started with GitHub CLI, please run:  gh auth login";
    const noLogin = Object.assign(new Error(`gh api answered no HTTP status: ${stderr}`), { code: "GH_NOT_LOGGED_IN" });
    const noStatus = Object.assign(new Error("gh api answered no HTTP status: dial tcp: lookup api.github.com: no such host"), {
      code: "GH_NO_STATUS",
    });
    const timedOut = Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" });
    const cases: [string, Answer[], string][] = [
      ["no login", [noLogin], "gh is not logged in"],
      ["no status", [noStatus], "gh answered no HTTP status (no network, or gh failed before GitHub answered)"],
      ["timed out", [timedOut], "gh did not finish in time"],
      ["a lookup 403", [{ status: 403, json: { message: "Resource not accessible by integration" } }], "the lookup answered HTTP 403"],
      ["an open 500", [{ status: 200, json: [] }, { status: 500, json: { message: "Server Error" } }], "opening it answered HTTP 500"],
      ["a PATCH 403", [{ status: 200, json: [openPr(5, `old\n\n${MARKER}`)] }, { status: 403, json: null }], "the body update of #5 answered HTTP 403"],
      ["a comment 404", [{ status: 200, json: [openPr(6, "A person's.")] }, { status: 404, json: null }], "the comment on #6 answered HTTP 404"],
      ["a 201 naming nothing", [{ status: 200, json: [] }, { status: 201, json: {} }], "GitHub's answer to opening it named no pull request"],
      [
        "an unnamed 422",
        [{ status: 200, json: [] }, { status: 422, json: { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: "steered text" }] } }],
        "GitHub answered HTTP 422 (validation failed)",
      ],
    ];
    const outcomes = await Promise.all(cases.map(([, answers]) => ensureDraftPr(scriptedGh(answers).gh, REQUEST)));
    for (const [index, [name, , cause]] of cases.entries()) {
      const outcome = outcomes[index];
      expect(outcome, name).toEqual({ notDone: `draft PR not opened (${BRANCH}): ${cause}` });
      const text = JSON.stringify(outcome);
      for (const echoed of ["gh auth login", "no such host", "Resource not accessible", "steered text", "Server Error"]) expect(text, name).not.toContain(echoed);
    }
  });

  it("answers gh not found through the real runner where no PATH entry holds gh", async () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-no-gh-"));
    try {
      // The real seam, with a PATH that holds no program: no gh starts, so nothing reaches the network.
      const outcome = await ensureDraftPr((request) => ghApi(request, { cwd: empty, env: { PATH: empty } }), REQUEST);
      expect(outcome).toEqual({ notDone: `draft PR not opened (${BRANCH}): gh not found` });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("encodes the head branch into the lookup's query, so a branch cannot add a parameter", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, CREATED]);

    await ensureDraftPr(gh, { ...REQUEST, head: "feat/a&state=closed" });

    expect(calls[0]?.path).toBe("repos/acme/app/pulls?head=acme%3Afeat%2Fa%26state%3Dclosed&state=open&base=main");
  });

  it("encodes the ! ' ( ) a git branch name may hold, so the lookup passes the runner's path check", async () => {
    const head = "fix(auth)!'s";
    const { gh, calls } = scriptedGh([{ status: 200, json: [openPr(5, `x\n\n${MARKER}`, head)] }, { status: 200, json: openPr(5, "new") }]);

    expect(await ensureDraftPr(gh, { ...REQUEST, head })).toMatchObject({ number: 5, how: "existing" });
    expect(calls[0]?.path).toBe("repos/acme/app/pulls?head=acme%3Afix%28auth%29%21%27s&state=open&base=main");
    for (const call of calls) expect(() => ghApiArgs(call), call.path).not.toThrow();
  });

  it("refuses crafted names before any call, naming the part that failed", async () => {
    const crafted: [Partial<DraftPrRequest>, string][] = [
      [{ host: "evil.example/x" }, "host"],
      [{ host: "--hostname=evil.example" }, "host"],
      [{ owner: "acme/app/pulls/1/merge" }, "owner"],
      [{ repo: ".." }, "repository"],
      [{ repo: "app?x=1" }, "repository"],
      [{ head: "feat x" }, "head branch"],
      [{ head: "-delete" }, "head branch"],
      [{ head: "a..b" }, "head branch"],
      [{ base: "main:refs/tags/v1" }, "base branch"],
      [{ runId: "x --> <!-- y" }, "run id"],
    ];
    const runs = crafted.map(async ([change, part]) => {
      const { gh, calls } = scriptedGh([]);
      return { change, part, outcome: await ensureDraftPr(gh, { ...REQUEST, ...change }), calls };
    });
    for (const { change, part, outcome, calls } of await Promise.all(runs)) {
      expect(outcome, JSON.stringify(change)).toEqual({ notDone: `draft PR not opened (${part} failed validation)` });
      expect(calls, JSON.stringify(change)).toEqual([]);
    }
  });
});

describe("resolveRepo", () => {
  it("reads a github.com origin in each transport spelling", () => {
    // TEST CHANGE, justified (REQ-PLUGIN-033): the credentialed URL is split at its `@` and joined
    // at run time, byte-identical, so the source carries no URL with a user:password pair.
    for (const url of ["https://github.com/acme/app.git", "git@github.com:acme/app.git", "ssh://git@github.com/acme/app", ["https://x-access-token:t", "@github.com/acme/app"].join("")]) {
      expect(resolveRepo({}, url), url).toEqual({ host: "github.com", owner: "acme", repo: "app" });
    }
  });

  it("reads Claude Code's proxy shape on github.com, only while GH_HOST is unset or names github.com", () => {
    const proxy = "http://local_proxy@127.0.0.1:1234/git/o/r";
    const onGithub = { host: "github.com", owner: "o", repo: "r" };
    expect(resolveRepo({}, proxy)).toEqual(onGithub);
    expect(resolveRepo({ GH_HOST: "" }, proxy)).toEqual(onGithub);
    expect(resolveRepo({ GH_HOST: "github.com" }, proxy)).toEqual(onGithub);
    expect(resolveRepo({ GH_HOST: "https://GitHub.com/" }, proxy)).toEqual(onGithub);
    expect(resolveRepo({}, "http://local_proxy@127.0.0.1:41000/git/acme/app.git")).toEqual({ host: "github.com", owner: "acme", repo: "app" });
    // GH_HOST naming another host: the proxy origin is github.com, so it is null, as a github.com origin is.
    expect(resolveRepo({ GH_HOST: "ghe.example.com" }, proxy)).toBeNull();
    expect(resolveRepo({ GH_HOST: "ghe.example.com" }, "https://github.com/o/r.git")).toBeNull();
  });

  it("returns null for any other host", () => {
    expect(resolveRepo({}, "https://gitlab.com/acme/app.git")).toBeNull();
    expect(resolveRepo({}, "git@bitbucket.org:acme/app.git")).toBeNull();
    expect(resolveRepo({}, "http://127.0.0.1:1234/acme/app")).toBeNull();
    expect(resolveRepo({}, "/srv/git/app.git")).toBeNull();
  });

  it("reads the GH_HOST host, and no github.com origin while GH_HOST names another host", () => {
    const env = { GH_HOST: "ghe.example.com" };
    expect(resolveRepo(env, "https://ghe.example.com/acme/app.git")).toEqual({ host: "ghe.example.com", owner: "acme", repo: "app" });
    expect(resolveRepo({ GH_HOST: "https://GHE.example.com/" }, "git@ghe.example.com:acme/app.git")).toEqual({
      host: "ghe.example.com",
      owner: "acme",
      repo: "app",
    });
    expect(resolveRepo(env, "https://github.com/acme/app.git")).toBeNull();
    expect(resolveRepo({ GH_HOST: "github.com" }, "https://github.com/acme/app.git")).toEqual({ host: "github.com", owner: "acme", repo: "app" });
  });

  it("returns null for an owner or repository outside the validated alphabet", () => {
    expect(resolveRepo({ GH_HOST: "ghe.example.com" }, "https://ghe.example.com/group/sub/app.git")).toBeNull();
    expect(resolveRepo({}, "http://u@127.0.0.1:1234/git/o%2F..%2Fx/r")).toBeNull();
  });
});

describe("the host grammar has one home (review/202)", () => {
  it("is exported from pullRequest.ts, and preflight.ts and the gh runner hold no copy of it", () => {
    expect(HOST_NAME.test("ghe.example.com")).toBe(true);
    expect(HOST_NAME.test("GitHub.com")).toBe(false);
    expect(hostOf(" https://GHE.example.com:8443/api ")).toBe("ghe.example.com");
    expect(CLAUDE_PROXY_ORIGIN.exec("http://proxy@127.0.0.1:41000/git/acme/app.git")?.slice(1)).toEqual(["acme", "app"]);
    // A copy is what drifts: the proxy shape, the host function and the host regex live in pullRequest.ts alone.
    for (const file of ["../../src/runs/preflight.ts", "../../src/cli/engine/ghRunner.ts"]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/127\\\.0\\\.0\\\.1/);
      expect(source, file).not.toMatch(/function hostOf\b/);
      expect(source, file).not.toContain("(?:[a-z0-9-]*[a-z0-9])?");
    }
  });
});
