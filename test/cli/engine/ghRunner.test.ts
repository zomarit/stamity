import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  COMMENT_EDITORS_QUERY,
  ghApi,
  ghApiArgs,
  ghCloseIssue,
  ghCloseIssueArgs,
  ghCommentEditors,
  ghGraphqlArgs,
  ghMarkReady,
  ghResolveReviewThread,
  ghMergeArgs,
  ghMergePull,
  ghRequestReview,
  ghRequestReviewArgs,
  ghReviewThreads,
  MARK_READY_MUTATION,
  parseGhInclude,
  RESOLVE_THREAD_MUTATION,
  REVIEW_THREADS_QUERY,
  type GhRequest,
} from "../../../src/cli/engine/ghRunner.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The `gh api` door: the argument vector, the closed method and path sets
 * (refused before `gh` starts), the status read from `--include`'s head, and
 * the start itself through a stand-in `gh` on `PATH`.
 */

const HOST = "github.com";

describe("ghApiArgs", () => {
  it("builds api --hostname <host> --include --method <M> <path>, with --input - only for a body", () => {
    expect(ghApiArgs({ method: "GET", path: "/repos/acme/app/pulls?head=acme%3Ax&state=open", hostname: HOST })).toEqual([
      "api",
      "--hostname",
      "github.com",
      "--include",
      "--method",
      "GET",
      "repos/acme/app/pulls?head=acme%3Ax&state=open",
    ]);
    expect(ghApiArgs({ method: "POST", path: "repos/acme/app/pulls", body: { draft: true }, hostname: "ghe.example.com" })).toEqual([
      "api",
      "--hostname",
      "ghe.example.com",
      "--include",
      "--method",
      "POST",
      "--input",
      "-",
      "repos/acme/app/pulls",
    ]);
  });

  it("accepts the writes the draft pull request makes", () => {
    for (const request of [
      { method: "POST", path: "repos/acme/app/pulls", body: {}, hostname: HOST },
      { method: "PATCH", path: "repos/acme/app/pulls/7", body: {}, hostname: HOST },
      { method: "POST", path: "repos/acme/app/issues/7/comments", body: {}, hostname: HOST },
      { method: "POST", path: "repos/acme/app/pulls/7/comments", body: {}, hostname: HOST },
    ] as const) {
      expect(() => ghApiArgs(request), request.path).not.toThrow();
    }
  });

  it("refuses a method outside GET, POST and PATCH, graphql, a flag-shaped path, a URL of its own, a bad host and every other write", () => {
    const refused: Omit<GhRequest, "hostname">[] = [
      { method: "PUT" as GhRequest["method"], path: "repos/acme/app/pulls/7/merge" },
      { method: "DELETE" as GhRequest["method"], path: "repos/acme/app/git/refs/heads/x" },
      { method: "POST", path: "graphql", body: { query: "mutation { markPullRequestReadyForReview }" } },
      { method: "GET", path: "/graphql" },
      { method: "GET", path: "--method=PUT" },
      { method: "GET", path: "repos/acme/app/pulls {owner}" },
      { method: "GET", path: "repos/acme/../other/pulls" },
      { method: "POST", path: "repos/acme/app/pulls/7/merge", body: {} },
      { method: "PATCH", path: "repos/acme/app/pulls/7/merge", body: {} },
      { method: "POST", path: "repos/acme/app/git/refs", body: {} },
      { method: "PATCH", path: "repos/acme/app/git/refs/heads/main", body: {} },
      { method: "POST", path: "repos/acme/app/merges", body: {} },
      { method: "PATCH", path: "repos/acme/app/rulesets/1", body: {} },
      { method: "POST", path: "repos/acme/app/pulls?x=1", body: {} },
      { method: "PATCH", path: "repos/acme/app/pulls/0", body: {} },
      { method: "GET", path: "https://example.net/x" },
      { method: "GET", path: "http://example.net/repos/acme/app" },
      { method: "GET", path: "//example.net/x" },
      { method: "GET", path: "repos//example.net/x" },
      { method: "GET", path: "repos/acme:app/pulls" },
    ];
    for (const request of refused) {
      expect(() => ghApiArgs({ ...request, hostname: HOST }), `${request.method} ${request.path}`).toThrow(/gh api:/);
    }
    for (const hostname of ["", "--method=PUT", "-github.com", "Github.com", "github.com/x", "github.com:8443", "https://github.com", "a..b"]) {
      expect(() => ghApiArgs({ method: "GET", path: "repos/acme/app", hostname }), hostname).toThrow(/gh api: the host/);
    }
    expect(() => ghApiArgs({ method: "GET", path: "repos/acme/app" } as GhRequest)).toThrow(/gh api: the host/);
  });
});

// a6-land-verb (REQ-FLOW-132): the land verb's three fixed-purpose calls, beside the door that still refuses them.
describe("the land verb's calls", () => {
  const PULL = { hostname: HOST, owner: "acme", repo: "app", number: 7 };
  const SHA = "c".repeat(40);

  it("builds the merge as PUT repos/<owner>/<repo>/pulls/<n>/merge with the body on stdin", () => {
    expect(ghMergeArgs({ ...PULL, sha: SHA, method: "squash" })).toEqual(["api", "--hostname", "github.com", "--include", "--method", "PUT", "--input", "-", "repos/acme/app/pulls/7/merge"]);
  });

  it("refuses a merge of a part that fails validation, a short or uppercase head, and an unknown method", () => {
    const bad = [
      { ...PULL, owner: "acme/x" },
      { ...PULL, repo: ".." },
      { ...PULL, number: 0 },
      { ...PULL, hostname: "https://github.com" },
      { ...PULL, sha: "c".repeat(12) },
      { ...PULL, sha: "C".repeat(40) },
      { ...PULL, method: "admin" },
    ];
    for (const request of bad) {
      expect(() => ghMergeArgs({ sha: SHA, method: "merge", ...request } as Parameters<typeof ghMergeArgs>[0]), JSON.stringify(request)).toThrow(/gh merge:/);
    }
  });

  // TEST CHANGE, justified (land-wiring, REQ-FLOW-154): a third constant document joins the two, the comment editors' read.
  // TEST CHANGE, justified (build/29, signed off): a fourth joins them, the fixed-purpose thread resolve.
  it("sends graphql only with its four constant documents, any other refused before gh starts", async () => {
    expect(ghGraphqlArgs({ hostname: HOST, query: REVIEW_THREADS_QUERY })).toEqual(["api", "--hostname", "github.com", "--include", "--method", "POST", "--input", "-", "graphql"]);
    expect(() => ghGraphqlArgs({ hostname: HOST, query: MARK_READY_MUTATION })).not.toThrow();
    expect(() => ghGraphqlArgs({ hostname: HOST, query: COMMENT_EDITORS_QUERY })).not.toThrow();
    expect(() => ghGraphqlArgs({ hostname: HOST, query: RESOLVE_THREAD_MUTATION })).not.toThrow();
    for (const query of [`${REVIEW_THREADS_QUERY} `, "mutation { mergePullRequest(input:{}) { clientMutationId } }", ""]) {
      expect(() => ghGraphqlArgs({ hostname: HOST, query }), query).toThrow(/gh graphql: the document/);
    }
    await expect(ghMarkReady({ hostname: HOST, id: "x y" }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
    await expect(ghReviewThreads({ ...PULL, owner: "a b" }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
    await expect(ghCommentEditors({ ...PULL, number: 0 }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
    await expect(ghResolveReviewThread({ hostname: HOST, id: "x y" }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
  });

  it("names each thread's id in the threads' document, which the resolve needs, and resolves one thread by a variable", () => {
    expect(REVIEW_THREADS_QUERY).toContain("reviewThreads(first:100,after:$after){nodes{id isResolved ");
    expect(RESOLVE_THREAD_MUTATION).toBe("mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}");
  });

  it("names a comment's editor and its edit time, and pages, in the editors' document", () => {
    expect(COMMENT_EDITORS_QUERY).toContain("comments(first:100,after:$after){nodes{databaseId lastEditedAt editor{__typename login}}pageInfo{hasNextPage endCursor}}");
  });
});

// run-end-notice (REQ-FLOW-156): the one review request, beside the door that still refuses its path.
describe("the run end notice's call", () => {
  const PULL = { hostname: HOST, owner: "acme", repo: "app", number: 7 };

  it("builds the request as POST repos/<owner>/<repo>/pulls/<n>/requested_reviewers with the body on stdin", () => {
    expect(ghRequestReviewArgs({ ...PULL, reviewers: ["a-person"], teamReviewers: [] })).toEqual(["api", "--hostname", "github.com", "--include", "--method", "POST", "--input", "-", "repos/acme/app/pulls/7/requested_reviewers"]);
    expect(() => ghRequestReviewArgs({ ...PULL, reviewers: [], teamReviewers: ["core_team.v2"] })).not.toThrow();
  });

  it("refuses a bad part, a reviewer outside GitHub's shape, and a request naming nobody, before gh starts", async () => {
    const bad = [
      { ...PULL, owner: "acme/x", reviewers: ["a"] },
      { ...PULL, repo: "..", reviewers: ["a"] },
      { ...PULL, number: 0, reviewers: ["a"] },
      { ...PULL, hostname: "https://github.com", reviewers: ["a"] },
      { ...PULL, reviewers: ["@a"] },
      { ...PULL, reviewers: ["a b"] },
      { ...PULL, reviewers: ["org/team"] },
      { ...PULL, reviewers: ["-a"] },
      { ...PULL, reviewers: ["a".repeat(40)] },
      { ...PULL, reviewers: ["a[bot]"] },
      { ...PULL, reviewers: ["a\n"] },
      { ...PULL, teamReviewers: ["org/team"] },
      { ...PULL, teamReviewers: ["@team"] },
      { ...PULL, reviewers: ["a"], teamReviewers: ["two words"] },
      { ...PULL },
    ];
    for (const request of bad) {
      expect(() => ghRequestReviewArgs({ reviewers: [], teamReviewers: [], ...request }), JSON.stringify(request)).toThrow(/gh review request:/);
    }
    await expect(ghRequestReview({ ...PULL, reviewers: ["a b"], teamReviewers: [] }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
  });

  it("stays out of the door: ghApi still refuses the path, so nothing but this function reaches it", () => {
    expect(() => ghApiArgs({ method: "POST", path: "repos/acme/app/pulls/7/requested_reviewers", body: { reviewers: ["a"] }, hostname: HOST })).toThrow(/gh api:/);
  });
});

// a2-land-closes-issue (REQ-FLOW-157): the land job's close of the run's issue, one fixed-purpose call beside the door,
// which still refuses a write to an issue.
describe("the land job's issue close", () => {
  const ISSUE = { hostname: HOST, owner: "acme", repo: "app", number: 12 };

  /** The code `build` threw with, or `built` where it threw nothing: a refusal is `GH_REFUSED`, whatever its words. */
  function outcomeOf(build: () => unknown): unknown {
    try {
      build();
      return "built";
    } catch (error) {
      return (error as { code?: unknown }).code;
    }
  }

  it("builds the close as PATCH repos/<owner>/<repo>/issues/<n> with the body on stdin, and refuses none of a valid shape", () => {
    expect(ghCloseIssueArgs(ISSUE)).toEqual(["api", "--hostname", "github.com", "--include", "--method", "PATCH", "--input", "-", "repos/acme/app/issues/12"]);
    expect(ghCloseIssueArgs({ hostname: "ghe.example.com", owner: "a.b_c-d", repo: "x.y", number: 1 })).toEqual([
      "api",
      "--hostname",
      "ghe.example.com",
      "--include",
      "--method",
      "PATCH",
      "--input",
      "-",
      "repos/a.b_c-d/x.y/issues/1",
    ]);
  });

  it("refuses a number that is not a positive integer, an owner or repository outside the shape, a dot segment and a bad host", () => {
    const bad: Record<string, unknown>[] = [
      { ...ISSUE, number: 0 },
      { ...ISSUE, number: -12 },
      { ...ISSUE, number: 1.5 },
      { ...ISSUE, number: Number.NaN },
      { ...ISSUE, number: Number.POSITIVE_INFINITY },
      { ...ISSUE, number: 2 ** 53 },
      { ...ISSUE, number: "12" },
      { ...ISSUE, owner: "acme/x" },
      { ...ISSUE, owner: "a b" },
      { ...ISSUE, owner: "" },
      { ...ISSUE, owner: "acme%2Fx" },
      { ...ISSUE, owner: "acme\n" },
      { ...ISSUE, repo: "app/../other" },
      { ...ISSUE, repo: "app?state=open" },
      { ...ISSUE, repo: "app#1" },
      { ...ISSUE, repo: "app:1" },
      { ...ISSUE, owner: ".." },
      { ...ISSUE, owner: "." },
      { ...ISSUE, repo: ".." },
      { ...ISSUE, repo: "." },
      { ...ISSUE, hostname: "https://github.com" },
      { ...ISSUE, hostname: "" },
    ];
    for (const request of bad) {
      expect(outcomeOf(() => ghCloseIssueArgs(request as Parameters<typeof ghCloseIssueArgs>[0])), JSON.stringify(request)).toBe("GH_REFUSED");
    }
  });

  it("refuses a bad shape before gh starts", async () => {
    await expect(ghCloseIssue({ ...ISSUE, number: 0 }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
    await expect(ghCloseIssue({ ...ISSUE, repo: ".." }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
  });

  it("stays out of the door: ghApi still refuses a PATCH to an issue, so nothing but this function closes one", async () => {
    expect(() => ghApiArgs({ method: "PATCH", path: "repos/acme/app/issues/12", body: { state: "closed", state_reason: "completed" }, hostname: HOST })).toThrow(/gh api:/);
    await expect(ghApi({ method: "PATCH", path: "repos/acme/app/issues/12", body: { state: "closed" }, hostname: HOST }, { env: { PATH: "" } })).rejects.toMatchObject({ code: "GH_REFUSED" });
  });
});

describe("parseGhInclude", () => {
  it("reads the status from the head's first line and the JSON after the blank line", () => {
    const stdout = 'HTTP/2.0 422 Unprocessable Entity\r\nContent-Type: application/json\r\n\r\n{"message":"Validation Failed"}';
    expect(parseGhInclude(stdout)).toEqual({ status: 422, json: { message: "Validation Failed" } });
  });

  it("reads LF heads, an empty body as null, and a non-JSON body as null", () => {
    expect(parseGhInclude('HTTP/1.1 201 Created\nX: y\n\n[{"number":1}]\n')).toEqual({ status: 201, json: [{ number: 1 }] });
    expect(parseGhInclude("HTTP/2.0 204 No Content\r\nX: y\r\n\r\n")).toEqual({ status: 204, json: null });
    expect(parseGhInclude("HTTP/2.0 502 Bad Gateway\r\n\r\n<html>")).toEqual({ status: 502, json: null });
  });

  it("returns null for output with no HTTP head", () => {
    expect(parseGhInclude("")).toBeNull();
    expect(parseGhInclude('{"status":"200"}')).toBeNull();
  });
});

describe("ghApi", () => {
  const getRoot = useTempDir("gh-runner");

  it("rejects a refused request before gh starts, and an absent gh with ENOENT", async () => {
    const empty = getRoot().path("empty");
    await mkdir(empty);

    await expect(ghApi({ method: "POST", path: "graphql", body: {}, hostname: HOST }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "GH_REFUSED",
    });
    await expect(ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: empty, env: { PATH: empty } })).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  // The stand-in takes gh's place on PATH. Mock reason: the real gh calls
  // GitHub's network under the operator's login, which no test may do. It logs
  // its arguments, its stdin and one variable, then prints a canned
  // `--include` answer; like gh, it colours the body when CLICOLOR_FORCE or
  // GH_FORCE_TTY reaches it, and the colour variables it got go to `env.log`.
  // Windows starts no shebang script, so these cases run on POSIX hosts; the
  // argument vector itself is proven on every host above.
  async function standIn(
    answer: string,
    exitCode: number,
    opts: { coloured?: string; readsStdin?: boolean; stderr?: string } = {},
  ): Promise<{ bin: string; work: string; log: string; input: string; envLog: string }> {
    const bin = getRoot().path("bin");
    const work = getRoot().path("work");
    const log = getRoot().path("argv.log");
    const input = getRoot().path("stdin.log");
    const envLog = getRoot().path("env.log");
    const canned = getRoot().path("answer.txt");
    const colouredFile = getRoot().path("coloured.txt");
    const stderrFile = getRoot().path("stderr.txt");
    await mkdir(bin);
    await mkdir(work);
    await writeFile(canned, answer, "utf8");
    await writeFile(colouredFile, opts.coloured ?? answer, "utf8");
    await writeFile(stderrFile, opts.stderr ?? "", "utf8");
    const readStdin = opts.readsStdin === false ? "" : `/bin/cat > '${input}'\n`;
    await writeFile(
      join(bin, "gh"),
      "#!/bin/sh\n" +
        `printf '%s\\n' "$@" "prompt=$GH_PROMPT_DISABLED" > '${log}'\n` +
        `printf '%s\\n' "NO_COLOR=$NO_COLOR" "CLICOLOR_FORCE=$CLICOLOR_FORCE" "GH_FORCE_TTY=$GH_FORCE_TTY" > '${envLog}'\n` +
        readStdin +
        `if [ -n "$CLICOLOR_FORCE" ] || [ -n "$GH_FORCE_TTY" ]; then /bin/cat '${colouredFile}'; else /bin/cat '${canned}'; fi\n` +
        `/bin/cat '${stderrFile}' >&2\n` +
        `exit ${exitCode}\n`,
      "utf8",
    );
    await chmod(join(bin, "gh"), 0o755);
    return { bin, work, log, input, envLog };
  }

  it.skipIf(process.platform === "win32")("starts gh with the argument vector, hands the body on stdin and reads the status", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{"number":12}', 0);

    const response = await ghApi(
      { method: "POST", path: "/repos/acme/app/pulls", body: { title: "t", draft: true }, hostname: "ghe.example.com" },
      { cwd: work, env: { PATH: bin } },
    );

    expect(response).toEqual({ status: 201, json: { number: 12 } });
    expect(await readFile(log, "utf8")).toBe(
      "api\n--hostname\nghe.example.com\n--include\n--method\nPOST\n--input\n-\nrepos/acme/app/pulls\nprompt=1\n",
    );
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ title: "t", draft: true });
  });

  it.skipIf(process.platform === "win32")("starts the merge and the thread read with their bodies on stdin (a6-land-verb)", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"merged":true}', 0);
    const sha = "d".repeat(40);

    await expect(ghMergePull({ hostname: HOST, owner: "acme", repo: "app", number: 7, sha, method: "merge" }, { cwd: work, env: { PATH: bin } })).resolves.toEqual({
      status: 200,
      json: { merged: true },
    });
    expect(await readFile(log, "utf8")).toBe("api\n--hostname\ngithub.com\n--include\n--method\nPUT\n--input\n-\nrepos/acme/app/pulls/7/merge\nprompt=1\n");
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ sha, merge_method: "merge" });

    await ghReviewThreads({ hostname: HOST, owner: "acme", repo: "app", number: 7 }, { cwd: work, env: { PATH: bin } });
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ query: REVIEW_THREADS_QUERY, variables: { owner: "acme", repo: "app", number: 7, after: null } });

    await ghCommentEditors({ hostname: HOST, owner: "acme", repo: "app", number: 7, after: "Y3Vyc29y" }, { cwd: work, env: { PATH: bin } });
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ query: COMMENT_EDITORS_QUERY, variables: { owner: "acme", repo: "app", number: 7, after: "Y3Vyc29y" } });

    await ghResolveReviewThread({ hostname: HOST, id: "PRRT_kwDOabc" }, { cwd: work, env: { PATH: bin } });
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ query: RESOLVE_THREAD_MUTATION, variables: { id: "PRRT_kwDOabc" } });
  });

  it.skipIf(process.platform === "win32")("starts the review request with reviewers and team_reviewers alone on stdin (run-end-notice)", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 201 Created\r\nContent-Type: application/json\r\n\r\n{"number":7}', 0);

    await expect(ghRequestReview({ hostname: HOST, owner: "acme", repo: "app", number: 7, reviewers: ["a-person"], teamReviewers: ["core"] }, { cwd: work, env: { PATH: bin } })).resolves.toEqual({
      status: 201,
      json: { number: 7 },
    });
    expect(await readFile(log, "utf8")).toBe("api\n--hostname\ngithub.com\n--include\n--method\nPOST\n--input\n-\nrepos/acme/app/pulls/7/requested_reviewers\nprompt=1\n");
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ reviewers: ["a-person"], team_reviewers: ["core"] });
  });

  it.skipIf(process.platform === "win32")("starts the issue close with its one constant body on stdin, whatever else the request carries (a2-land-closes-issue)", async () => {
    const { bin, work, log, input } = await standIn('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"number":12,"state":"closed"}', 0);
    // Fields a caller might try to slip in: none of them is a part of the request, so none may reach the path or the body.
    const request = { hostname: HOST, owner: "acme", repo: "app", number: 12, body: "reopened by text", state: "open", state_reason: "not_planned", labels: [], path: "repos/acme/app/git/refs" };

    await expect(ghCloseIssue(request as Parameters<typeof ghCloseIssue>[0], { cwd: work, env: { PATH: bin } })).resolves.toEqual({
      status: 200,
      json: { number: 12, state: "closed" },
    });
    expect(await readFile(log, "utf8")).toBe("api\n--hostname\ngithub.com\n--include\n--method\nPATCH\n--input\n-\nrepos/acme/app/issues/12\nprompt=1\n");
    expect(JSON.parse(await readFile(input, "utf8"))).toEqual({ state: "closed", state_reason: "completed" });
  });

  it.skipIf(process.platform === "win32")("starts the program it is given, not one PATH names, and refuses a relative one (review/75)", async () => {
    const { bin, work, log } = await standIn('HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n{"login":"runner"}', 0);
    const empty = getRoot().path("no-gh");
    await mkdir(empty);

    await expect(ghApi({ method: "GET", path: "user", hostname: HOST }, { cwd: work, env: { PATH: empty }, program: join(bin, "gh") })).resolves.toEqual({
      status: 200,
      json: { login: "runner" },
    });
    expect(await readFile(log, "utf8")).toContain("user\n");
    await expect(ghApi({ method: "GET", path: "user", hostname: HOST }, { cwd: work, env: { PATH: bin }, program: "gh" })).rejects.toMatchObject({ code: "GH_REFUSED" });
  });

  it.skipIf(process.platform === "win32")("starts a shim-style link by its own path, so a target that picks the tool by its name runs gh (review/91)", async () => {
    // A stand-in for a version manager's shim: one program, linked under each tool's name, that reads the name it was
    // started under. Mock reason: no real version manager is installed for the suite, and the real gh reaches GitHub.
    const lib = getRoot().path("shim-lib");
    const bin = getRoot().path("shim-bin");
    const work = getRoot().path("shim-work");
    await Promise.all([mkdir(lib), mkdir(bin), mkdir(work)]);
    const shim = join(lib, "shim");
    await writeFile(
      shim,
      "#!/bin/sh\n" +
        'case "$0" in */gh) ;; *) echo "shim: unknown command $1" >&2; exit 2 ;; esac\n' +
        "/bin/cat > /dev/null\n" +
        "printf 'HTTP/2.0 200 OK\\r\\nContent-Type: application/json\\r\\n\\r\\n{\"ok\":true}'\n",
      "utf8",
    );
    await chmod(shim, 0o755);
    await symlink(shim, join(bin, "gh"));

    await expect(ghApi({ method: "GET", path: "user", hostname: HOST }, { cwd: work, env: { PATH: bin }, program: join(bin, "gh") })).resolves.toEqual({ status: 200, json: { ok: true } });
    await expect(ghApi({ method: "GET", path: "user", hostname: HOST }, { cwd: work, env: { PATH: bin }, program: shim })).rejects.toThrow(/no HTTP status/);
  });

  it.skipIf(process.platform === "win32")("resolves a 4xx answer gh exits 1 on as its status", async () => {
    const { bin, work } = await standIn('HTTP/2.0 422 Unprocessable Entity\r\n\r\n{"message":"Validation Failed"}', 1);

    await expect(
      ghApi({ method: "POST", path: "repos/acme/app/pulls", body: {}, hostname: HOST }, { cwd: work, env: { PATH: bin } }),
    ).resolves.toEqual({
      status: 422,
      json: { message: "Validation Failed" },
    });
  });

  it.skipIf(process.platform === "win32")("parses the body with CLICOLOR_FORCE and GH_FORCE_TTY set in the parent environment", async () => {
    const head = "HTTP/2.0 200 OK\r\nContent-Type: application/json\r\n\r\n";
    const { bin, work, envLog } = await standIn(`${head}[{"number":7}]`, 0, {
      coloured: `${head}\u001b[1;38m[\u001b[m{\u001b[1;34m"number"\u001b[m:7}\u001b[1;38m]\u001b[m`,
    });

    // No `env` option: the runner reads the process's own, where both are set.
    vi.stubEnv("PATH", bin);
    vi.stubEnv("CLICOLOR_FORCE", "1");
    vi.stubEnv("GH_FORCE_TTY", "1");
    let response: unknown;
    try {
      response = await ghApi({ method: "GET", path: "repos/acme/app/pulls", hostname: HOST }, { cwd: work });
    } finally {
      vi.unstubAllEnvs();
    }

    expect(response).toEqual({ status: 200, json: [{ number: 7 }] });
    expect(await readFile(envLog, "utf8")).toBe("NO_COLOR=1\nCLICOLOR_FORCE=\nGH_FORCE_TTY=\n");
  });

  it.skipIf(process.platform === "win32")("rejects, and throws nothing uncaught, when gh exits before reading a large body", async () => {
    const { bin, work } = await standIn("", 4, { readsStdin: false });
    const body = { body: "x".repeat(4 * 1024 * 1024) };

    await expect(
      ghApi({ method: "POST", path: "repos/acme/app/pulls", body, hostname: HOST }, { cwd: work, env: { PATH: bin } }),
    ).rejects.toThrow(/no HTTP status/);
  });

  it.skipIf(process.platform === "win32")("rejects when gh printed no HTTP head", async () => {
    const { bin, work } = await standIn("", 4);

    await expect(ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: work, env: { PATH: bin } })).rejects.toThrow(
      /no HTTP status/,
    );
  });

  it.skipIf(process.platform === "win32")("classes a no-status failure by its code: no login, or no status (review/199)", async () => {
    const login = await standIn("", 4, { stderr: "To get started with GitHub CLI, please run:  gh auth login\n" });
    await expect(
      ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: login.work, env: { PATH: login.bin } }),
    ).rejects.toMatchObject({ code: "GH_NOT_LOGGED_IN" });
  });

  it.skipIf(process.platform === "win32")("classes a failure with no login words as GH_NO_STATUS (review/199)", async () => {
    const offline = await standIn("", 1, { stderr: "error connecting to api.github.com\n" });
    await expect(
      ghApi({ method: "GET", path: "repos/acme/app", hostname: HOST }, { cwd: offline.work, env: { PATH: offline.bin } }),
    ).rejects.toMatchObject({ code: "GH_NO_STATUS" });
  });
});
