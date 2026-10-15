import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ghApi } from "../../src/cli/engine/ghRunner.ts";
import {
  ensureDraftPr,
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
  owner: "acme",
  repo: "app",
  head: BRANCH,
  base: "main",
  title: "Cloud runs",
  body: "# Morning list\n\nnone\n",
  runId: RUN,
};

const LOOKUP = `repos/acme/app/pulls?head=${encodeURIComponent(`acme:${BRANCH}`)}&state=open`;

type Answer = RestResponse | Error;

/** A recorded stand-in for `ghApi`: answers each call from `answers` in order and records it; an unscripted call fails the test. */
function scriptedGh(answers: readonly Answer[]): { gh: GhApi; calls: RestRequest[] } {
  const calls: RestRequest[] = [];
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

function openPr(number: number, body: string | null, head = BRANCH): Record<string, unknown> {
  return { number, html_url: `https://github.com/acme/app/pull/${number}`, body, head: { ref: head, label: `acme:${head}` } };
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
  it("replaces only the body of an open pull request carrying this run's marker, and posts nothing", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [openPr(7, `old list\n\n${MARKER}\n`)] },
      { status: 200, json: openPr(7, "new") },
    ]);

    const outcome = await ensureDraftPr(gh, REQUEST);

    expect(outcome).toEqual({ number: 7, url: "https://github.com/acme/app/pull/7", how: "existing" });
    expect(calls).toEqual([
      { method: "GET", path: LOOKUP },
      { method: "PATCH", path: "repos/acme/app/pulls/7", body: { body: `# Morning list\n\nnone\n\n${MARKER}` } },
    ]);
    expectNoPersonOnlyCall(calls);
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
    expectNoPersonOnlyCall(calls);
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
      body: { title: "Cloud runs", head: BRANCH, base: "main", body: `# Morning list\n\nnone\n\n${MARKER}`, draft: true },
    });
    expectNoPersonOnlyCall(calls);
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
    expectNoPersonOnlyCall(calls);
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
    expectNoPersonOnlyCall(calls);
  });

  it("reports not done when the re-lookup after 'already exists' finds nothing", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, ALREADY_EXISTS, { status: 200, json: [] }]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ notDone: `draft PR not opened (${BRANCH})` });
    expect(calls).toHaveLength(3);
  });

  it("reports not done on a 422 that names neither drafts nor an existing one", async () => {
    const { gh, calls } = scriptedGh([
      { status: 200, json: [] },
      { status: 422, json: { message: "Validation Failed", errors: [{ field: "base", code: "invalid" }] } },
    ]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ notDone: `draft PR not opened (${BRANCH})` });
    expect(calls).toHaveLength(2);
  });

  it("reports not done, and posts nothing, when the lookup is not answered", async () => {
    const { gh, calls } = scriptedGh([{ status: 404, json: { message: "Not Found" } }]);

    expect(await ensureDraftPr(gh, REQUEST)).toEqual({ notDone: `draft PR not opened (${BRANCH})` });
    expect(calls).toHaveLength(1);
  });

  it("reads a pull request the lookup returns for another branch as none (GitHub ignores a head filter it cannot read)", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [openPr(3, `x\n\n${MARKER}`, "someone/else")] }, CREATED]);

    expect(await ensureDraftPr(gh, REQUEST)).toMatchObject({ number: 12, how: "created" });
    expect(calls.some((call) => call.path.includes("/pulls/3"))).toBe(false);
  });

  it("answers gh not found, and does not throw, when the seam cannot start gh", async () => {
    const missing = Object.assign(new Error("spawn gh ENOENT"), { code: "ENOENT" });
    const { gh } = scriptedGh([missing]);

    await expect(ensureDraftPr(gh, REQUEST)).resolves.toEqual({ notDone: "gh not found" });
  });

  it("answers gh not found through the real runner where no PATH entry holds gh", async () => {
    const empty = mkdtempSync(join(tmpdir(), "stamity-no-gh-"));
    try {
      // The real seam, with a PATH that holds no program: no gh starts, so nothing reaches the network.
      const outcome = await ensureDraftPr((request) => ghApi(request, { cwd: empty, env: { PATH: empty } }), REQUEST);
      expect(outcome).toEqual({ notDone: "gh not found" });
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  it("encodes the head branch into the lookup's query, so a branch cannot add a parameter", async () => {
    const { gh, calls } = scriptedGh([{ status: 200, json: [] }, CREATED]);

    await ensureDraftPr(gh, { ...REQUEST, head: "feat/a&state=closed" });

    expect(calls[0]?.path).toBe("repos/acme/app/pulls?head=acme%3Afeat%2Fa%26state%3Dclosed&state=open");
  });

  it("refuses crafted names before any call", async () => {
    const crafted: Partial<DraftPrRequest>[] = [
      { owner: "acme/app/pulls/1/merge" },
      { repo: ".." },
      { repo: "app?x=1" },
      { head: "feat x" },
      { head: "-delete" },
      { head: "a..b" },
      { base: "main:refs/tags/v1" },
      { runId: "x --> <!-- y" },
    ];
    const runs = crafted.map(async (change) => {
      const { gh, calls } = scriptedGh([]);
      return { change, outcome: await ensureDraftPr(gh, { ...REQUEST, ...change }), calls };
    });
    for (const { change, outcome, calls } of await Promise.all(runs)) {
      expect(outcome, JSON.stringify(change)).toHaveProperty("notDone");
      expect(calls, JSON.stringify(change)).toEqual([]);
    }
  });
});

describe("resolveRepo", () => {
  it("reads a github.com origin in each transport spelling", () => {
    for (const url of ["https://github.com/acme/app.git", "git@github.com:acme/app.git", "ssh://git@github.com/acme/app", "https://x-access-token:t@github.com/acme/app"]) {
      expect(resolveRepo({}, url), url).toEqual({ owner: "acme", repo: "app" });
    }
  });

  it("reads Claude Code's proxy shape", () => {
    expect(resolveRepo({}, "http://local_proxy@127.0.0.1:1234/git/o/r")).toEqual({ owner: "o", repo: "r" });
    expect(resolveRepo({}, "http://local_proxy@127.0.0.1:41000/git/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
  });

  it("returns null for any other host", () => {
    expect(resolveRepo({}, "https://gitlab.com/acme/app.git")).toBeNull();
    expect(resolveRepo({}, "git@bitbucket.org:acme/app.git")).toBeNull();
    expect(resolveRepo({}, "http://127.0.0.1:1234/acme/app")).toBeNull();
    expect(resolveRepo({}, "/srv/git/app.git")).toBeNull();
  });

  it("reads the GH_HOST host, and no github.com origin while GH_HOST names another host", () => {
    const env = { GH_HOST: "ghe.example.com" };
    expect(resolveRepo(env, "https://ghe.example.com/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
    expect(resolveRepo(env, "https://github.com/acme/app.git")).toBeNull();
    expect(resolveRepo({ GH_HOST: "github.com" }, "https://github.com/acme/app.git")).toEqual({ owner: "acme", repo: "app" });
  });

  it("returns null for an owner or repository outside the validated alphabet", () => {
    expect(resolveRepo({ GH_HOST: "ghe.example.com" }, "https://ghe.example.com/group/sub/app.git")).toBeNull();
    expect(resolveRepo({}, "http://u@127.0.0.1:1234/git/o%2F..%2Fx/r")).toBeNull();
  });
});
