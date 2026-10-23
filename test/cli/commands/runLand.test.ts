import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitSurfaceRecordPath, readRunGitSurface } from "../../../src/cli/commands/gate.ts";
import { runCommand } from "../../../src/cli/commands/run.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import { surfaceRecord } from "../../../src/runs/gitSurface.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * a6-land-verb (REQ-FLOW-132, REQ-FLOW-133, REQ-FLOW-120): `stamity run land`, through the in-process funnel. Git runs
 * for real in a scratch repository whose origin names a GitHub repository and whose `ls-remote` and push go to a real
 * bare remote (the spy below); GitHub's answers are recorded routes. What landed is read from the record, the calls
 * made, and the remote's refs.
 */

const RUN = "2026-10-23_overnight";
const RUN_BRANCH = `stamity/${RUN}`;
const RUN_DIR = `.stamity/runs/${RUN}`;
const MARKER = `<!-- stamity:run ${RUN} -->`;

/** Every GitHub call the verb made, in order, and the answer each `METHOD path` (query dropped) gets. */
const gh = vi.hoisted(() => ({
  calls: [] as { kind: string; method?: string; path?: string; body?: unknown }[],
  routes: new Map<string, { status: number; json: unknown }>(),
  merge: { status: 200, json: { merged: true } as unknown },
  threads: { data: { viewer: { login: "runner" }, repository: { pullRequest: { reviewThreads: { nodes: [] as unknown[], pageInfo: { hasNextPage: false, endCursor: null } } } } } } as unknown,
  program: "/usr/bin/gh" as string | null,
}));

// Mocked: the real runner starts `gh`, which calls GitHub over the network under the machine's login; a unit test can
// reach neither. Each call is recorded and answered from the routes above.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { method: string; path: string; body?: unknown }) => {
    const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
    gh.calls.push({ kind: "api", method: request.method, path, body: request.body });
    return Promise.resolve(gh.routes.get(`${request.method} ${path}`) ?? { status: 404, json: { message: "Not Found" } });
  },
  ghMergePull: (request: Record<string, unknown>) => {
    gh.calls.push({ kind: "merge", body: request });
    return Promise.resolve(gh.merge);
  },
  ghReviewThreads: () => {
    gh.calls.push({ kind: "threads" });
    return Promise.resolve({ status: 200, json: gh.threads });
  },
  ghMarkReady: (request: { id: string }) => {
    gh.calls.push({ kind: "ready", body: request });
    const pr = gh.routes.get(`GET repos/o/r/pulls/7`);
    if (pr !== undefined) gh.routes.set("GET repos/o/r/pulls/7", { ...pr, json: { ...(pr.json as object), draft: false, mergeable_state: "clean" } });
    return Promise.resolve({ status: 200, json: { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } } });
  },
  ghProgramPath: () => gh.program,
}));

// A spy, not a stand-in: every call goes to the real runner; `ls-remote` and `push` alone get an `insteadOf` in the
// environment so origin's GitHub URL reaches the case's bare remote. Mock reason: the verb reads origin's tip and
// pushes a fast-forward through origin, which names GitHub, and a test cannot reach GitHub.
vi.mock("../../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (cwd: string, args: readonly string[], opts?: Parameters<typeof real.gitWrite>[2]) => {
      const remote = join(dirname(cwd), "remote.git");
      if ((args[0] !== "push" && args[0] !== "ls-remote") || !existsSync(remote)) return real.gitWrite(cwd, args, opts);
      const mapping = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`, GIT_CONFIG_VALUE_0: "https://github.com/o/r.git" };
      const previous = Object.fromEntries(Object.keys(mapping).map((key) => [key, process.env[key]]));
      Object.assign(process.env, mapping);
      try {
        return real.gitWrite(cwd, args, opts);
      } finally {
        for (const [key, value] of Object.entries(previous)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    },
  };
});

const ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_AUTHOR_NAME: "A", GIT_AUTHOR_EMAIL: "a@example.com", GIT_COMMITTER_NAME: "A", GIT_COMMITTER_EMAIL: "a@example.com" };

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...ENV } }).trim();
}

const row = (id: string, severity: string, state: string): string => `${JSON.stringify({ id, phase: "review", source: "r", severity, evidence: "e", state, rationale: "" })}\n`;

describe("stamity run land", () => {
  const getRoot = useTempDir("run-land");

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    gh.calls.length = 0;
    gh.routes.clear();
    gh.merge = { status: 200, json: { merged: true } };
    gh.threads = { data: { viewer: { login: "runner" }, repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
    gh.program = "/usr/bin/gh";
  });

  interface Seeded {
    repo: string;
    remote: string;
    base: string;
    head: string;
  }

  /**
   * A repository whose `main` holds the manifest, then the run's branch with its record (`mode`) and ledger committed
   * and pushed to the bare remote; GitHub's routes answer for a clean, green, open pull request #7 from that branch.
   */
  async function seed(opts: { mode?: "attended" | "unattended"; ledger?: string; manifest?: string | null } = {}): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    await appendFile(join(repo, ".git", "config"), "[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n");
    await writeFile(join(repo, "a.txt"), "a\n");
    if (opts.manifest !== null) await put(repo, ".stamity/manifest.json", opts.manifest ?? '{"version":1}\n');
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["push", "-q", remote, "HEAD:refs/heads/main"]);
    git(repo, ["switch", "-q", "-c", RUN_BRANCH]);
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: ${opts.mode ?? "attended"}\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`);
    await put(repo, `${RUN_DIR}/ledger.jsonl`, opts.ledger ?? row(`${RUN}/review/1`, "Warning", "fixed"));
    await writeFile(join(repo, "a.txt"), "a\nb\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "work"]);
    git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    route("GET repos/o/r", { default_branch: "main" });
    route("GET repos/o/r/pulls", [{ number: 7, head: { ref: RUN_BRANCH }, body: `The list.\n\n${MARKER}` }]);
    route("GET repos/o/r/pulls/7", pull(head));
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
    route("GET repos/o/r/rules/branches/main", [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
    route("GET repos/o/r/branches/main", { commit: { sha: base }, protection: { enabled: false } });
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
    route("PATCH repos/o/r/pulls/7", { number: 7 });
    return { repo, remote, base, head };
  }

  function pull(head: string, over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      number: 7,
      html_url: "https://github.com/o/r/pull/7",
      node_id: "PR_kwDO7",
      state: "open",
      merged: false,
      draft: false,
      head: { ref: RUN_BRANCH, sha: head, repo: { full_name: "o/r" } },
      base: { ref: "main" },
      body: `The list.\n\n${MARKER}`,
      mergeable_state: "clean",
      changed_files: 3,
      ...over,
    };
  }

  function route(key: string, json: unknown, status = 200): void {
    gh.routes.set(key, { status, json });
  }

  async function put(repo: string, path: string, text: string): Promise<void> {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await writeFile(join(repo, path), text);
  }

  async function run(cwd: string, argv: readonly string[]) {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    for (const [key, value] of Object.entries({ HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" })) vi.stubEnv(key, value);
    vi.stubEnv("GH_HOST", undefined);
    vi.stubEnv("STAMITY_UNATTENDED", undefined);
    const result = await runInProcess([runCommand], ["run", ...argv, "--json"], { cwd });
    const envelope = result.stdout === "" ? {} : (JSON.parse(result.stdout) as Record<string, unknown>);
    const { ok, command, version, ...doc } = envelope;
    void ok;
    void command;
    void version;
    return { ...result, doc };
  }

  const record = (repo: string): Promise<string> => readFile(join(repo, RUN_DIR, "record.md"), "utf8");
  const kinds = (): string[] => gh.calls.map((call) => (call.kind === "api" ? `${call.method ?? ""} ${call.path ?? ""}` : call.kind));

  it("merges the run's own pull request at HEAD when the evidence holds, the evidence written before and the landed line after", async () => {
    const { repo, head } = await seed();

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(0);
    expect(result.doc).toMatchObject({ subcommand: "land", outcome: "landed", pr: { number: 7, head }, evidence: { threads: { unresolved: 0 }, ledger: { open: [] }, held: [], mergeableState: "clean" }, notDone: [] });
    expect(gh.calls.find((call) => call.kind === "merge")?.body).toMatchObject({ owner: "o", repo: "r", number: 7, sha: head, method: "merge" });
    const order = kinds();
    expect(order.indexOf("PATCH repos/o/r/pulls/7")).toBeLessThan(order.indexOf("merge"));
    const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
    expect(patched.body).toMatch(new RegExp(`evidence checked at \\S+ for ${head}: 1 required check runs green, 0 open threads, 0 open Critical/Warning rows\\n\\n${MARKER}$`));
    expect(patched.body).not.toMatch(/landed/);
    const lines = (await record(repo)).split("\n").filter((line) => line.includes(" land: "));
    expect(lines).toEqual([expect.stringMatching(new RegExp(`^- \\S+Z land: #7 ${head} merged$`))]);
  });

  it("refuses a required context only a commit status carries, naming that statuses do not count", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/rules/branches/main", [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }, { context: "ci/status" }] } }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`required check ci/status has no check run on ${head} (commit statuses do not count)`] });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses one unresolved review thread, and a person's thread the run's login resolved", async () => {
    const { repo } = await seed();
    const page = (node: unknown) => ({ data: { viewer: { login: "runner" }, repository: { pullRequest: { reviewThreads: { nodes: [node], pageInfo: { hasNextPage: false, endCursor: null } } } } } });
    gh.threads = page({ isResolved: false, resolvedBy: null, comments: { nodes: [{ author: { __typename: "Bot", login: "codex" } }] } });
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });

    gh.threads = page({ isResolved: true, resolvedBy: { login: "runner" }, comments: { nodes: [{ author: { __typename: "User", login: "alice" } }] } });
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses an open Warning row in the ledger at the head, and one only the work tree's ledger holds as checkpoint first", async () => {
    const open = await seed({ ledger: row(`${RUN}/review/1`, "Warning", "open") });
    expect((await run(open.repo, ["land", "--run", RUN])).doc).toMatchObject({
      outcome: "refused",
      notDone: [`the ledger at ${open.head} holds open Critical or Warning rows: ${RUN}/review/1`],
      evidence: { ledger: { open: [`${RUN}/review/1`] } },
    });

    const local = await seed();
    await appendFile(join(local.repo, RUN_DIR, "ledger.jsonl"), row(`${RUN}/review/2`, "Warning", "open"));
    expect((await run(local.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("checkpoint first")] });
    expect(kinds()).not.toContain("merge");
  });

  it("asks, with no merge call, for a diff touching a workflow, a renamed workflow's old path included", async () => {
    const { repo } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "ci-notes.yml", previous_filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({ outcome: "asks", asks: { act: "pr-merge", reason: expect.stringContaining(".github/workflows/ci.yml") }, evidence: { held: [".github/workflows/ci.yml"] } });
    expect(kinds()).not.toContain("merge");
    expect(kinds()).not.toContain("PATCH repos/o/r/pulls/7");
  });

  it("reads a work-tree ledger that differs from the commit's only in CRLF line ends as the same ledger", async () => {
    const { repo } = await seed();
    const path = join(repo, RUN_DIR, "ledger.jsonl");
    await writeFile(path, (await readFile(path, "utf8")).replaceAll("\n", "\r\n"));

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
  });

  it("asks in mode ask, the strictest of the three manifests deciding, and prints the evidence", async () => {
    const { repo } = await seed();
    route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}').toString("base64"), encoding: "base64" });
    await writeFile(join(repo, ".stamity/manifest.json"), '{"version":1,"autonomy":{"mode":"ask"}}\n');

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "asks", asks: { reason: "autonomy.mode is ask", act: "pr-merge" }, evidence: { checks: [{ name: "test", state: "green" }] } });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses where no manifest is on the default branch, at HEAD or in the work tree", async () => {
    const { repo } = await seed({ manifest: null });
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringMatching(/^no setup found/)] });
  });

  it("refuses a blocked merge state as an admin merge, an unknown one as not computed yet, and a fork", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7", pull(head, { mergeable_state: "blocked" }));
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state is blocked: an admin merge past the branch's rules asks"] });
    route("GET repos/o/r/pulls/7", pull(head, { mergeable_state: "unknown" }));
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state is not computed yet, run it again"] });
    route("GET repos/o/r/pulls/7", pull(head, { head: { ref: RUN_BRANCH, sha: head, repo: { full_name: "fork/r" } } }));
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 comes from a fork, not o/r"] });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses a 409 from the merge, the body saying only what was checked and the record no landed line", async () => {
    const { repo, head } = await seed();
    gh.merge = { status: 409, json: { message: "Head branch was modified" } };

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`GitHub refused the merge (HTTP 409): the head moved since ${head}; run it again`] });
    expect(await record(repo)).not.toMatch(/ land: /);
  });

  it("reports a pull request merged at HEAD as already landed, exit 0, with no second record line", async () => {
    const { repo, head } = await seed();
    await appendFile(join(repo, RUN_DIR, "record.md"), `- 2026-10-23T08:00:00.000Z land: #7 ${head} merged\n`);
    route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true, mergeable_state: null }));

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(0);
    expect(result.doc).toMatchObject({ outcome: "already-landed" });
    expect((await record(repo)).match(/ land: /g)).toHaveLength(1);
    expect(kinds()).not.toContain("merge");
  });

  it("falls back to every check run when the rules answer 403, and refuses a head with none", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/rules/branches/main", { message: "Forbidden" }, 403);
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 0, check_runs: [] });

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [`required check any check run has no check run on ${head} (commit statuses do not count)`] });
  });

  it("refuses a draft without --ready, and with it marks the draft ready only once the evidence holds, then merges", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the pull request is a draft: mark it ready first, or pass --ready", expect.any(String)] });

    gh.calls.length = 0;
    const result = await run(repo, ["land", "--run", RUN, "--ready"]);

    expect(result.doc).toMatchObject({ outcome: "landed" });
    const order = kinds();
    expect(order.indexOf("ready")).toBeGreaterThan(-1);
    expect(order.indexOf("ready")).toBeLessThan(order.indexOf("merge"));
  });

  it("asks before any ready mark where the setting names pr-ready as deploying", async () => {
    const { repo, head } = await seed({ manifest: '{"version":1,"autonomy":{"deployingActs":["pr-ready"]}}\n' });
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));

    expect((await run(repo, ["land", "--run", RUN, "--ready"])).doc).toMatchObject({ outcome: "asks", asks: { act: "pr-ready" } });
    expect(kinds()).not.toContain("ready");
  });

  it("refuses a gh that resolves inside a temp folder before any GitHub call", async () => {
    const { repo } = await seed();
    gh.program = join(getRoot().path("bin"), "gh");

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("gh resolves to a program inside")] });
    expect(gh.calls).toEqual([]);
  });

  it("fast-forwards the default branch to the head with no force, through the guard's table, and records it", async () => {
    const { repo, remote, base, head } = await seed();
    route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead" });

    const result = await run(repo, ["land", "--run", RUN, "--fast-forward"]);

    expect(result.code).toBe(0);
    expect(result.doc).toMatchObject({ outcome: "landed" });
    expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(head);
    expect(kinds()).not.toContain("merge");
    expect(await record(repo)).toMatch(new RegExp(` land: #7 ${head} fast-forwarded\\n$`));
  });

  it("asks before a fast-forward where a rule requires a pull request", async () => {
    const { repo, remote, base, head } = await seed();
    route("GET repos/o/r/rules/branches/main", [{ type: "pull_request" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
    route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead" });

    expect((await run(repo, ["land", "--run", RUN, "--fast-forward"])).doc).toMatchObject({ outcome: "asks", asks: { act: "push-default" } });
    expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(base);
  });

  it("unattended, refuses a pre-flight record marked refused, and lands on a passing one", async () => {
    const { repo } = await seed({ mode: "unattended" });
    const write = async (refused: boolean): Promise<void> => {
      const place = await gitSurfaceRecordPath(repo);
      const surface = await readRunGitSurface(repo);
      if ("unreadable" in place || "unreadable" in surface) throw new Error("the seed's git surface could not be read");
      await mkdir(dirname(place.path), { recursive: true });
      await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString(), refused))}\n`);
    };
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", home);
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GH_HOST", undefined);
    vi.stubEnv("STAMITY_UNATTENDED", undefined);

    await write(true);
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["no pre-flight record (the pre-flight refused)"] });
    expect(gh.calls).toEqual([]);

    await write(false);
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
  });

  it("takes --title, --paths, --wait past 9 and --method with --fast-forward as usage errors", async () => {
    const { repo } = await seed();
    for (const argv of [["--title", "t"], ["--paths", "a.txt"], ["--wait", "10"], ["--fast-forward", "--method", "squash"]]) {
      // oxlint-disable-next-line no-await-in-loop -- the cases share one repository and the process environment the runner stubs
      expect((await run(repo, ["land", "--run", RUN, ...argv])).code, argv.join(" ")).toBe(2);
    }
    expect(gh.calls).toEqual([]);
  });
});
