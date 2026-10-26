import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync as fsRealpath } from "node:fs";
import { appendFile, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitSurfaceRecordPath, readRunGitSurface } from "../../../src/cli/commands/gate.ts";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { LAND_CLOCK } from "../../../src/cli/commands/runLand.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import type * as GhRunnerModule from "../../../src/cli/engine/ghRunner.ts";
import type * as FsModule from "node:fs";
import type * as PersonOnlyModule from "../../../src/hooks/personOnly.ts";
import { surfaceRecord } from "../../../src/runs/gitSurface.ts";
import { insideAny } from "../../../src/runs/landEvidence.ts";
import { prRecordText } from "../../../src/runs/pullRequest.ts";
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

type Answer = { status: number; json: unknown };

/**
 * Every GitHub call the verb made, in order, with the `gh` program it was told to start, and the answers. A route or
 * the thread answer may be a list: each read takes the next one, the last one repeating.
 * TEST CHANGE, justified (review/72, review/75, review/79): answers in sequence (a second thread read, a merge state
 * computed late) and the program each call names are what this round's rows are about; one answer reads as before.
 */
const gh = vi.hoisted(() => ({
  calls: [] as { kind: string; method?: string; path?: string; body?: unknown; program?: string | undefined; cwd?: string | undefined; env?: string[] }[],
  /**
   * review/95, review/96: when set, each REST call also runs a stand-in shim in the folder the verb gave gh, which
   * reads a version file there and in each parent folder, as mise and asdf do; what it read is kept here.
   */
  probe: null as string[] | null,
  routes: new Map<string, Answer | Answer[]>(),
  merge: { status: 200, json: { merged: true } as unknown },
  threads: [] as unknown[],
  /** The merge states the pull request reads with after the ready mark, in order. */
  afterReady: ["clean"] as (string | null)[],
  /** review/110: fields the pull request reads with after the ready mark, beside its merge state (a head that moved). */
  afterReadyPr: {} as Record<string, unknown>,
  program: "/usr/bin/gh" as string | null,
}));

function next<T>(answer: T | T[]): T {
  if (!Array.isArray(answer)) return answer;
  return (answer.length > 1 ? answer.shift() : answer[0]) as T;
}

// Mocked: the real runner starts `gh`, which calls GitHub over the network under the machine's login; a unit test can
// reach neither. Each call is recorded and answered from the routes above.
// TEST CHANGE, justified (review/95): the real environment filter passes through; only the calls that reach gh are stood in for.
vi.mock("../../../src/cli/engine/ghRunner.ts", async (importOriginal) => ({
  withoutVersionChoice: (await importOriginal<typeof GhRunnerModule>()).withoutVersionChoice,
  ghApi: (request: { method: string; path: string; body?: unknown }, opts?: { program?: string; cwd?: string; env?: Record<string, string | undefined> }) => {
    const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
    gh.calls.push({ kind: "api", method: request.method, path, body: request.body, program: opts?.program, cwd: opts?.cwd, env: Object.keys(opts?.env ?? {}) });
    // Mock reason (review/95): no version manager is installed for the suite; this program reads a version file from
    // its working folder as a shim does, so the case sees whether the run's folder reaches one.
    if (gh.probe !== null) {
      const walk = 'd=$(pwd -P); while :; do cat "$d/.tool-versions" 2>/dev/null; [ "$d" = / ] && break; d=$(dirname "$d"); done; true';
      gh.probe.push(execFileSync("/bin/sh", ["-c", walk], { cwd: opts?.cwd, encoding: "utf8" }));
    }
    const answer = gh.routes.get(`${request.method} ${path}`);
    return Promise.resolve(answer === undefined ? { status: 404, json: { message: "Not Found" } } : next(answer));
  },
  ghMergePull: (request: Record<string, unknown>, opts?: { program?: string }) => {
    gh.calls.push({ kind: "merge", body: request, program: opts?.program });
    return Promise.resolve(gh.merge);
  },
  ghReviewThreads: (_request: unknown, opts?: { program?: string }) => {
    gh.calls.push({ kind: "threads", program: opts?.program });
    return Promise.resolve({ status: 200, json: next(gh.threads) });
  },
  ghMarkReady: (request: { id: string }, opts?: { program?: string }) => {
    gh.calls.push({ kind: "ready", body: request, program: opts?.program });
    const pr = gh.routes.get(`GET repos/o/r/pulls/7`);
    const json = (Array.isArray(pr) ? pr[0] : pr)?.json as object;
    gh.routes.set("GET repos/o/r/pulls/7", gh.afterReady.map((state) => ({ status: 200, json: { ...json, draft: false, mergeable_state: state, ...gh.afterReadyPr } })));
    return Promise.resolve({ status: 200, json: { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } } });
  },
  ghProgramPath: () => gh.program,
}));

/**
 * Link targets a case gives a path that does not exist on disk, as `realpathSync` would read a link there.
 * TEST CHANGE, justified (review/91): the verb checks a `gh` PATH entry and its link target apart, and starts the entry.
 */
const links = vi.hoisted(() => new Map<string, string>());

// A spy, not a stand-in: every `realpathSync` goes to the real one except a path a case maps. Mock reason: a shim-style
// link outside the temp folders and the work tree (which the verb refuses) cannot be made in a unit test.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof FsModule>();
  // TEST CHANGE, justified (build/18): the verb now reads places through `realpathSync.native`, so a mapped link
  // answers there too.
  const realpathSync = Object.assign(
    (path: Parameters<typeof real.realpathSync>[0], options?: Parameters<typeof real.realpathSync>[1]) => links.get(String(path)) ?? real.realpathSync(path, options),
    {
      native: (path: Parameters<typeof real.realpathSync.native>[0], options?: Parameters<typeof real.realpathSync.native>[1]) =>
        links.get(String(path)) ?? real.realpathSync.native(path, options),
    },
  );
  return { ...real, default: { ...real, realpathSync }, realpathSync };
});

/**
 * A threads page holding `nodes`, as the constant query answers, read as `viewer`, the pull request opened by `author`.
 * TEST CHANGE, justified (review/94): the query names the pull request's author too, in viewer's spelling.
 */
function threadsPage(nodes: unknown[], viewer = "runner", author = "runner"): unknown {
  return {
    data: { viewer: { login: viewer }, repository: { pullRequest: { author: { login: author }, reviewThreads: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } },
  };
}

/** One review thread: resolved or not, by whom, and its comments' authors as `[__typename, login]`. */
function thread(isResolved: boolean, resolvedBy: string | null, ...authors: [string, string][]): unknown {
  return {
    isResolved,
    resolvedBy: resolvedBy === null ? null : { login: resolvedBy },
    comments: { totalCount: authors.length, nodes: authors.map(([type, login]) => ({ author: { __typename: type, login } })) },
  };
}

// A spy, not a stand-in: every call goes to the real runner; `ls-remote` and `push` alone get an `insteadOf` in the
// environment so origin's GitHub URL reaches the case's bare remote. Mock reason: the verb reads origin's tip and
// pushes a fast-forward through origin, which names GitHub, and a test cannot reach GitHub.
vi.mock("../../../src/cli/engine/gitWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof GitWriteModule>();
  return {
    ...real,
    gitWrite: (cwd: string, args: readonly string[], opts?: Parameters<typeof real.gitWrite>[2]) => {
      const remote = join(dirname(cwd), "remote.git");
      // TEST CHANGE, justified (review/74): the verb fetches the default branch's tip where the clone lacks it, so a
      // fetch goes to the bare remote as the push and ls-remote do.
      if ((args[0] !== "push" && args[0] !== "ls-remote" && args[0] !== "fetch") || !existsSync(remote)) return real.gitWrite(cwd, args, opts);
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

/** review/177: a verdict a case hands the fast-forward's push check in place of the real table's; `null` reads the real one. */
const table = vi.hoisted(() => ({ push: null as PersonOnlyModule.PersonOnlyVerdict | null, commands: [] as string[] }));

// A spy over the real table: every command gets the real verdict unless a case sets `push`. Mock reason: the land
// decision asks for every deploying default branch first, so no real input brings an unapproved `push-deploying`
// verdict to the push check; the order of that check and the body write is reachable only through a stand-in.
vi.mock("../../../src/hooks/personOnly.ts", async (importOriginal) => {
  const real = await importOriginal<typeof PersonOnlyModule>();
  return {
    ...real,
    personOnlyVerdict: (command: string, ctx: PersonOnlyModule.PersonOnlyContext): PersonOnlyModule.PersonOnlyVerdict => {
      table.commands.push(command);
      return table.push !== null && command.startsWith("git push ") ? table.push : real.personOnlyVerdict(command, ctx);
    },
  };
});

const ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_AUTHOR_NAME: "A", GIT_AUTHOR_EMAIL: "a@example.com", GIT_COMMITTER_NAME: "A", GIT_COMMITTER_EMAIL: "a@example.com" };

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...ENV } }).trim();
}

/** Where a run verb records the pull request it opened, under the repository's git directory. */
const PR_RECORD = ".git/stamity/run-pull-request.json";

const row = (id: string, severity: string, state: string): string => `${JSON.stringify({ id, phase: "review", source: "r", severity, evidence: "e", state, rationale: "" })}\n`;

describe("stamity run land", () => {
  const getRoot = useTempDir("run-land");

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    gh.calls.length = 0;
    gh.routes.clear();
    gh.merge = { status: 200, json: { merged: true } };
    gh.threads = [threadsPage([])];
    gh.afterReady = ["clean"];
    gh.afterReadyPr = {};
    gh.program = "/usr/bin/gh";
    gh.probe = null;
    links.clear();
    table.push = null;
    table.commands.length = 0;
  });

  /**
   * The land verb's clock made to advance only when it sleeps. Mock reason: `--wait` polls every 30 s and the read
   * after a ready mark every 5 s for up to 60 s, which a unit test cannot wait out; what is proven is the reads made.
   */
  function fakeClock(): { slept: number[] } {
    let now = 1_000_000;
    const slept: number[] = [];
    vi.spyOn(LAND_CLOCK, "now").mockImplementation(() => now);
    vi.spyOn(LAND_CLOCK, "sleep").mockImplementation((ms: number) => {
      slept.push(ms);
      now += ms;
      return Promise.resolve();
    });
    return { slept };
  }

  interface Seeded {
    repo: string;
    remote: string;
    base: string;
    head: string;
  }

  /**
   * A repository whose `main` holds the manifest, then the run's branch with its record (`mode`) and ledger committed
   * and pushed to the bare remote; GitHub's routes answer for a clean, green, open pull request #7 from that branch.
   * `files` puts a case's own files in `main`'s seed commit, hook declarations and the scripts they name among them.
   * TEST CHANGE, justified (review/73): the seed also writes the pull-request record a run verb writes on opening the
   * draft, unless `prRecord` is false; `ledger: null` commits no ledger (review/83).
   */
  async function seed(
    opts: { mode?: "attended" | "unattended"; ledger?: string | null; manifest?: string | null; files?: Record<string, string>; prRecord?: boolean } = {},
  ): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    await appendFile(join(repo, ".git", "config"), "[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n");
    // TEST CHANGE, justified (build/19): the repository's own identity, as runCheckpoint.test.ts sets it, so a commit the
    // verb makes (run checkpoint --pr) needs no global identity, which a CI runner lacks.
    git(repo, ["config", "user.name", "Alice Example"]);
    git(repo, ["config", "user.email", "alice@example.com"]);
    await writeFile(join(repo, "a.txt"), "a\n");
    if (opts.manifest !== null) await put(repo, ".stamity/manifest.json", opts.manifest ?? '{"version":1}\n');
    await Promise.all(Object.entries(opts.files ?? {}).map(([path, text]) => put(repo, path, text)));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", "https://github.com/o/r.git"]);
    const base = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["push", "-q", remote, "HEAD:refs/heads/main"]);
    git(repo, ["switch", "-q", "-c", RUN_BRANCH]);
    await put(repo, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: ${opts.mode ?? "attended"}\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`);
    if (opts.ledger !== null) await put(repo, `${RUN_DIR}/ledger.jsonl`, opts.ledger ?? row(`${RUN}/review/1`, "Warning", "fixed"));
    await writeFile(join(repo, "a.txt"), "a\nb\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "work"]);
    git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    if (opts.prRecord !== false) await put(repo, PR_RECORD, prRecordText({ run: RUN, host: "github.com", owner: "o", repo: "r", number: 7 }));
    route("GET repos/o/r", { default_branch: "main" });
    // TEST CHANGE, justified (the login source, review/r2): the login now comes from the thread query's viewer, so
    // `GET user` answers as an app installation token's would, refused, in every case.
    route("GET user", { message: "Resource not accessible by integration" }, 403);
    route("GET repos/o/r/pulls", [{ number: 7, html_url: "https://github.com/o/r/pull/7", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" }, body: `The list.\n\n${MARKER}` }]);
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
      user: { login: "runner" },
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

  /** TEST CHANGE, justified (review/95): `env`, where given, is the verb's own environment, as a case needs to set gh's. */
  async function run(cwd: string, argv: readonly string[], env?: Record<string, string>) {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    for (const [key, value] of Object.entries({ HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" })) vi.stubEnv(key, value);
    vi.stubEnv("GH_HOST", undefined);
    vi.stubEnv("STAMITY_UNATTENDED", undefined);
    const result = await runInProcess([runCommand], ["run", ...argv, "--json"], { cwd, ...(env === undefined ? {} : { env }) });
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
    // TEST CHANGE, justified (review/107): a required check with no check run reads "no check run yet".
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`required check ci/status has no check run yet on ${head} (commit statuses do not count)`] });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses one unresolved review thread, and a person's thread the run's login resolved", async () => {
    const { repo } = await seed();
    // TEST CHANGE, justified (review/71): the page carries every comment's author and their count; the verdicts are the same.
    gh.threads = [threadsPage([thread(false, null, ["Bot", "codex"])])];
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });

    gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])])];
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });

    // review/71: a person's reply under an app's first comment holds the thread open once the run resolved it.
    gh.threads = [threadsPage([thread(true, "runner", ["Bot", "codex"], ["User", "alice"])])];
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
    // TEST CHANGE, justified (build/6, REQ-FLOW-132): an asks outcome now writes why the merge waits into the run's own
    // body, and nothing else: no evidence line, no merge.
    expect(gh.calls.filter((call) => call.method === "PATCH").map((call) => (call.body as { body: string }).body)).toEqual([
      `The list.\n\nmerge waits on: the diff touches paths that define the evidence: .github/workflows/ci.yml (a person decides: pr-merge)\n\n${MARKER}`,
    ]);
  });

  it("asks, attended, for a diff editing a script a repository hook declaration at Base: names (build/2)", async () => {
    const declaring = `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs"] }] })}\n`;
    const { repo } = await seed({ files: { ".stamity/hooks/guard.json": declaring, "tools/guard.mjs": "base guard\n" } });
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "tools/guard.mjs" }, { filename: "b" }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({ outcome: "asks", asks: { act: "pr-merge", reason: expect.stringContaining("tools/guard.mjs") }, evidence: { held: ["tools/guard.mjs"] } });
    expect(kinds()).not.toContain("merge");
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

    // TEST CHANGE, justified (review/107): the wording of a check with no check run yet.
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [`required check any check run has no check run yet on ${head} (commit statuses do not count)`] });
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

  it("re-reads the threads on every --wait poll and merges nothing when the second read holds an open thread (review/72)", async () => {
    const { repo, head } = await seed();
    const { slept } = fakeClock();
    const running = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] };
    const green = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
    gh.routes.set(`GET repos/o/r/commits/${head}/check-runs`, [{ status: 200, json: running }, { status: 200, json: green }]);
    gh.threads = [threadsPage([]), threadsPage([thread(false, null, ["User", "alice"])])];

    const result = await run(repo, ["land", "--run", RUN, "--wait", "1"]);

    expect(slept).toEqual([30_000]);
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"], evidence: { threads: { unresolved: 1 } } });
    expect(kinds()).not.toContain("merge");
  });

  it("re-reads the threads after the ready mark, just before the merge, and merges nothing on an open one (review/72, review/78)", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    gh.threads = [threadsPage([]), threadsPage([]), threadsPage([thread(true, "runner", ["Bot", "codex"], ["User", "alice"])])];

    const result = await run(repo, ["land", "--run", RUN, "--ready"]);

    expect(kinds()).toContain("ready");
    expect(kinds()).not.toContain("merge");
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
  });

  it("reads the threads again just before the evidence line it writes, whose count is that last read's (review/78)", async () => {
    const { repo } = await seed();
    gh.threads = [threadsPage([]), threadsPage([])];

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { threads: { unresolved: 0 } } });
    const order = kinds();
    const reads = order.flatMap((kind, index) => (kind === "threads" ? [index] : []));
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(reads.at(-1)).toBeLessThan(order.indexOf("PATCH repos/o/r/pulls/7"));
    const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
    expect(patched.body).toContain(", 0 open threads,");
  });

  it("refuses a pull request another login opened, though branch, head and marker are the run's (review/73)", async () => {
    const { repo } = await seed();
    // TEST CHANGE, justified (review/94): the author is read from the thread query, not REST's user.login.
    gh.threads = [threadsPage([], "runner", "alice")];

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 was opened by alice, not by the run's login runner"] });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses with no pull-request record, a record of another number, and one that is a link (review/73)", async () => {
    const missing = await seed({ prRecord: false });
    expect((await run(missing.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringMatching(/^no pull-request record \(stamity\/run-pull-request\.json in the git directory is missing/)] });

    const other = await seed();
    await writeFile(join(other.repo, PR_RECORD), prRecordText({ run: RUN, host: "github.com", owner: "o", repo: "r", number: 8 }));
    expect((await run(other.repo, ["land", "--run", RUN])).doc).toMatchObject({
      outcome: "refused",
      notDone: [`the pull-request record names #8 of o/r for run ${RUN}, not #7 of o/r for run ${RUN}`],
    });

    const linked = await seed();
    const elsewhere = join(dirname(linked.repo), "record.json");
    await writeFile(elsewhere, prRecordText({ run: RUN, host: "github.com", owner: "o", repo: "r", number: 7 }));
    await rm(join(linked.repo, PR_RECORD));
    await symlink(elsewhere, join(linked.repo, PR_RECORD));
    expect((await run(linked.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("is not a regular file")] });
    expect(kinds()).not.toContain("merge");
  });

  it("lands the pull request run checkpoint --pr recorded when it updated the draft (review/73)", async () => {
    const { repo } = await seed({ prRecord: false });
    await writeFile(join(repo, "a.txt"), "a\nb\nc\n");

    const checkpoint = await run(repo, ["checkpoint", "--run", RUN, "--pr", "--title", "t", "--paths", "a.txt"]);
    expect(checkpoint.doc).toMatchObject({ pushed: true, pr: { number: 7, how: "existing" }, notDone: [] });

    const head = git(repo, ["rev-parse", "HEAD"]);
    route("GET repos/o/r/pulls/7", pull(head));
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", pr: { number: 7, head } });
  });

  it("asks for a diff editing a script a declaration on the default branch's tip names, landed after Base: and fetched (review/74, review/80)", async () => {
    const { repo, remote, base } = await seed();
    const other = join(dirname(repo), "other");
    git(dirname(repo), ["clone", "-q", "-b", "main", remote, other]);
    await put(other, ".stamity/hooks/guard.json", `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs"] }] })}\n`);
    git(other, ["add", "-A"]);
    git(other, ["commit", "-q", "-m", "a hook on main"]);
    git(other, ["push", "-q", "origin", "HEAD:refs/heads/main"]);
    const tip = git(other, ["rev-parse", "HEAD"]);
    expect(tip).not.toBe(base);
    route("GET repos/o/r/branches/main", { commit: { sha: tip }, protection: { enabled: false } });
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "tools/guard.mjs" }, { filename: "b" }]);
    expect(() => git(repo, ["cat-file", "-e", `${tip}^{commit}`])).toThrow();

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "asks", asks: { act: "pr-merge", reason: expect.stringContaining("tools/guard.mjs") }, evidence: { held: ["tools/guard.mjs"] } });
    expect(kinds()).not.toContain("merge");
  });

  it("words an unreadable hook declaration's ask with the next step, never a restart of the run (review/81)", async () => {
    const { repo } = await seed({ files: { ".stamity/hooks/broken.json": "{ not json\n" } });

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "asks", asks: { reason: expect.stringContaining("fix the declaration on main, then run land again, or a person decides") } });
    expect(JSON.stringify(result.doc)).not.toMatch(/start the run again|pushes nothing/);
  });

  it("starts every gh call with the one program it checked (review/75)", async () => {
    const { repo } = await seed();
    gh.program = "/opt/tools/bin/gh";

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    expect(gh.calls.length).toBeGreaterThan(5);
    expect(new Set(gh.calls.map((call) => call.program))).toEqual(new Set(["/opt/tools/bin/gh"]));
  });

  it("after the ready mark, reads the pull request again until its merge state is computed, then merges (review/79)", async () => {
    const { repo, head } = await seed();
    const { slept } = fakeClock();
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    gh.afterReady = ["unknown", null, "clean"];

    const result = await run(repo, ["land", "--run", RUN, "--ready"]);

    expect(result.doc).toMatchObject({ outcome: "landed" });
    expect(slept).toEqual([5_000, 5_000]);
  });

  it("after the ready mark, refuses a merge state still not computed after 60 s, whatever --wait says (review/79)", async () => {
    const { repo, head } = await seed();
    const { slept } = fakeClock();
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    gh.afterReady = ["unknown"];

    const result = await run(repo, ["land", "--run", RUN, "--ready"]);

    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state is not computed yet, run it again"] });
    expect(slept.reduce((sum, ms) => sum + ms, 0)).toBe(60_000);
    expect(kinds()).not.toContain("merge");
  });

  it("previews would-land under --dry-run, exit 0, writing and merging nothing, and runs the merge-state check (review/82)", async () => {
    const { repo, head } = await seed();

    const result = await run(repo, ["land", "--run", RUN, "--dry-run"]);

    expect(result.code).toBe(0);
    expect(result.doc).toMatchObject({ outcome: "would-land", dryRun: true, notDone: [] });
    expect(kinds().filter((kind) => !kind.startsWith("GET ") && kind !== "threads")).toEqual([]);
    expect(await record(repo)).not.toMatch(/ land: /);

    route("GET repos/o/r/pulls/7", pull(head, { mergeable_state: "blocked" }));
    expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state is blocked: an admin merge past the branch's rules asks"] });

    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    const draft = await run(repo, ["land", "--run", RUN, "--dry-run", "--ready"]);
    expect(draft.doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state reads draft: GitHub computes it after the ready mark, which a dry run does not make"] });
    expect(kinds()).not.toContain("ready");
  });

  it("refuses a ledger missing from the head commit (review/83)", async () => {
    const { repo } = await seed({ ledger: null });

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
      outcome: "refused",
      notDone: [`the ledger at ${git(repo, ["rev-parse", "HEAD"])} does not read: ${RUN_DIR}/ledger.jsonl is missing from the commit`],
    });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses a gh that resolves inside the work tree before any GitHub call (review/83)", async () => {
    const { repo } = await seed();
    gh.program = join(repo, "bin", "gh");

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["gh resolves to a program inside the work tree, whose answers the run could write"] });
    expect(gh.calls).toEqual([]);
  });

  it("lands where GET user is refused, as for an app installation token, taking the login from the thread query (r2 login source)", async () => {
    const { repo } = await seed();

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    expect(kinds()).not.toContain("GET user");
  });

  it("refuses where the thread query names no login, before any merge (r2 login source)", async () => {
    const { repo } = await seed();
    gh.threads = [threadsPage([], "")];

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
      outcome: "refused",
      notDone: ["the review threads could not be read, nor with them the login gh is authenticated as"],
    });
    expect(kinds()).not.toContain("merge");
  });

  it("ends within the 9-minute budget in the worst case, --wait 9 --ready with checks green only at the end and the merge state uncomputed (review/90)", async () => {
    const { repo, head } = await seed();
    const { slept } = fakeClock();
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    gh.afterReady = ["unknown"];
    const running = { status: 200, json: { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] } };
    const green = { status: 200, json: { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] } };
    gh.routes.set(`GET repos/o/r/commits/${head}/check-runs`, [...Array.from({ length: 17 }, () => running), green]);

    const result = await run(repo, ["land", "--run", RUN, "--wait", "9", "--ready"]);

    expect(kinds()).toContain("ready");
    expect(kinds()).not.toContain("merge");
    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["mergeable_state is not computed yet, run it again"] });
    expect(slept.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(9 * 60_000 - 30_000);
  });

  it("starts gh by its absolute PATH entry, not the entry's link target, so a shim sees its own name (review/91)", async () => {
    const { repo } = await seed();
    gh.program = "/opt/shim/bin/gh";
    links.set("/opt/shim/bin/gh", "/opt/shim/lib/mise");

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    expect(new Set(gh.calls.map((call) => call.program))).toEqual(new Set(["/opt/shim/bin/gh"]));
  });

  it("refuses a gh PATH entry inside a temp folder whose target lies outside, and a relative entry (review/91)", async () => {
    const { repo } = await seed();
    const entryDir = getRoot().path("shim-bin");
    await mkdir(entryDir, { recursive: true });
    // TEST CHANGE, justified (build/18): the precondition reads the folder as the verb does, real and normalised, so
    // Windows' short and long names of the temp folder read alike.
    expect(insideAny(entryDir, [tmpdir(), "/tmp"], { platform: process.platform, realpath: (path) => fsRealpath.native(path) })).toBe(true);
    gh.program = join(entryDir, "gh");
    links.set(join(entryDir, "gh"), "/usr/local/opt/gh/bin/gh");
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["gh resolves to a program inside a temp folder, whose answers the run could write"] });

    gh.program = "gh";
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["gh resolves to a PATH entry that is not an absolute path"] });
    expect(gh.calls).toEqual([]);
  });

  it("lands for an app installation token, whose login GraphQL spells app and REST app[bot], comparing one source (review/94)", async () => {
    const { repo, head } = await seed();
    gh.threads = [threadsPage([], "app", "app")];
    route("GET repos/o/r/pulls/7", pull(head, { user: { login: "app[bot]" } }));
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });

    gh.calls.length = 0;
    gh.threads = [threadsPage([], "app", "someone-else")];
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 was opened by someone-else, not by the run's login app"] });
    expect(kinds()).not.toContain("merge");
  });

  // TEST CHANGE, justified (review/96, REQ-FLOW-132): the folder gh starts in moved from a fresh one under the temp
  // folder to the filesystem's root, so the shim now reads every parent too and a file is planted in the temp folder.
  it.skipIf(process.platform === "win32")("starts gh at the filesystem root, so a shim reading each parent folder never sees a version file planted in the work tree or the temp folder (review/95, review/96)", async () => {
    const { repo } = await seed();
    await writeFile(join(repo, ".tool-versions"), "gh path:/run/controlled/gh\n");
    // The suite's own temp root (vitest.config.ts points TMPDIR at a private folder per run), so nothing else reads it.
    const planted = join(tmpdir(), ".tool-versions");
    expect(existsSync(planted)).toBe(false);
    await writeFile(planted, "gh path:/run/controlled/gh\n");
    gh.probe = [];
    try {
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    } finally {
      await rm(planted, { force: true });
    }
    expect(gh.probe.length).toBeGreaterThan(5);
    expect(new Set(gh.probe)).toEqual(new Set([""]));
    expect(new Set(gh.calls.filter((call) => call.kind === "api").map((call) => call.cwd))).toEqual(new Set(["/"]));
  });

  it("drops the version managers' version-choosing variables from gh's environment and keeps those that locate an install (review/95)", async () => {
    const { repo } = await seed();
    const choosing = ["MISE_GH_VERSION", "ASDF_GH_VERSION", "RTX_GH_VERSION", "MISE_ENV", "MISE_OVERRIDE_CONFIG_FILENAMES", "ASDF_DEFAULT_TOOL_VERSIONS_FILENAME", "VOLTA_BYPASS"];
    const locating = ["MISE_DATA_DIR", "ASDF_DATA_DIR", "VOLTA_HOME"];
    const env = Object.fromEntries([...choosing, ...locating].map((name) => [name, "/somewhere"]));

    const result = await run(repo, ["land", "--run", RUN], env);

    expect(result.doc).toMatchObject({ outcome: "landed" });
    const seen = new Set(gh.calls.filter((call) => call.kind === "api").flatMap((call) => call.env ?? []));
    for (const name of choosing) expect(seen.has(name), name).toBe(false);
    for (const name of locating) expect(seen.has(name), name).toBe(true);
  });

  /** The bodies the verb wrote into #7, in order. */
  const bodies = (): string[] => gh.calls.filter((call) => call.method === "PATCH").map((call) => (call.body as { body: string }).body);

  it("writes why the merge waits into the run's own body on a refused outcome, never that it landed (build/6)", async () => {
    const { repo } = await seed();
    gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
    expect(bodies()).toEqual([`The list.\n\nmerge waits on: 1 review thread is unresolved\n\n${MARKER}`]);
    expect(bodies().join("")).not.toMatch(/landed|evidence checked/);
  });

  it("writes nothing into a pull request that is not the run's own, nor before the pull request is known (build/6)", async () => {
    const other = await seed();
    gh.threads = [threadsPage([], "runner", "alice")];
    expect((await run(other.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused" });

    const unrecorded = await seed({ prRecord: false });
    gh.threads = [threadsPage([])];
    expect((await run(unrecorded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringMatching(/^no pull-request record/)] });
    expect(bodies()).toEqual([]);
  });

  it("writes nothing under --dry-run, an asks outcome included (build/6)", async () => {
    const { repo } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: ".github/workflows/ci.yml" }, { filename: "a.txt" }, { filename: "b" }]);

    expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "asks" });
    expect(bodies()).toEqual([]);
  });

  it("replaces an earlier merge-waits line with the evidence line when it later lands (build/6)", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\nmerge waits on: 1 review thread is unresolved\n\n${MARKER}` }));

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    const [written] = bodies();
    expect(written).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at \\S+ for ${head}: [^\\n]+\\n\\n${MARKER}$`));
    expect(written).not.toContain("merge waits on");
  });

  it("lands an asks outcome the person approved with --approved, and says so in the evidence and the record (review/103)", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

    // TEST CHANGE, justified (review/110): --approved takes the head commit the person approved; the evidence and the
    // record name it.
    const result = await run(repo, ["land", "--run", RUN, "--approved", head]);

    expect(result.code).toBe(0);
    expect(result.doc).toMatchObject({ outcome: "landed", approved: { sha: head, act: "pr-merge", reason: expect.stringContaining(".github/workflows/ci.yml") } });
    expect(kinds()).toContain("merge");
    expect(bodies()).toEqual([expect.stringContaining(`; approved by the person for ${head} over: the diff touches paths that define the evidence: .github/workflows/ci.yml`)]);
    expect((await record(repo)).split("\n").filter((line) => line.includes(" land: "))).toEqual([
      expect.stringMatching(new RegExp(`^- \\S+Z land: #7 ${head} merged \\(approved by the person for ${head}\\)$`)),
    ]);
  });

  it("fast-forwards an approved asks outcome, its record line saying so (review/103)", async () => {
    const { repo, remote, base, head } = await seed();
    route("GET repos/o/r/rules/branches/main", [{ type: "pull_request" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
    route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead" });

    // TEST CHANGE, justified (review/110): --approved names the head commit.
    expect((await run(repo, ["land", "--run", RUN, "--fast-forward", "--approved", head])).doc).toMatchObject({ outcome: "landed", approved: { sha: head, act: "push-default" } });
    expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(head);
    expect(await record(repo)).toMatch(new RegExp(` land: #7 ${head} fast-forwarded \\(approved by the person for ${head}\\)\\n$`));
  });

  it("fast-forwards a default branch the setting names as deploying once the person approved it (REQ-FLOW-132, review/177)", async () => {
    const { repo, remote, base, head } = await seed({ manifest: '{"version":1,"autonomy":{"deployingBranches":["main"]}}\n' });
    route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead" });

    const result = await run(repo, ["land", "--run", RUN, "--fast-forward", "--approved", head]);

    expect(result.doc).toMatchObject({ outcome: "landed", approved: { sha: head, act: "push-default", reasons: ["main is named in autonomy.deployingBranches"] } });
    expect(table.commands).toEqual([`git push origin ${head}:refs/heads/main`]);
    expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(head);
    expect(bodies()).toEqual([expect.stringContaining(`; approved by the person for ${head} over: main is named in autonomy.deployingBranches`)]);
  });

  it("refuses a fast-forward whose push check refuses before it writes the evidence into the body (REQ-FLOW-132, review/177)", async () => {
    const { repo, remote, base, head } = await seed();
    route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead" });
    table.push = { deny: true, rule: "push-deploying", act: "A push to a branch the repository names as deploying", reason: "a deploying branch, unapproved", ask: true };

    const result = await run(repo, ["land", "--run", RUN, "--fast-forward"]);

    expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["push refused: a deploying branch, unapproved"] });
    expect(table.commands).toEqual([`git push origin ${head}:refs/heads/main`]);
    // The one write is why the merge waits, as on every refusal (build/6); no evidence line was written before it.
    expect(bodies()).toEqual([`The list.\n\nmerge waits on: push refused: a deploying branch, unapproved\n\n${MARKER}`]);
    expect(git(remote, ["rev-parse", "refs/heads/main"])).toBe(base);
  });

  it("lands on an approval given before the default branch's setting added a reason, the evidence naming both (review/174, pin)", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
    const paths = "the diff touches paths that define the evidence: .github/workflows/ci.yml";
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [paths], head } });

    const deploying = Buffer.from('{"version":1,"autonomy":{"deployingBranches":["main"]}}\n').toString("base64");
    route("GET repos/o/r/contents/.stamity/manifest.json", { content: deploying });
    const result = await run(repo, ["land", "--run", RUN, "--approved", head]);

    // The approval names the head, not the reasons (the SECURITY.md residual): the reason added after it does not stop
    // the land. The evidence line marks every reason found when the land acted as approved, the later one too, and the
    // land replaces the `merge waits on:` line the person was shown, so no record tells the reasons they saw apart.
    expect(result.doc).toMatchObject({ outcome: "landed", approved: { sha: head, reasons: [paths, "main is named in autonomy.deployingBranches"] } });
    expect(bodies().at(-1)).toContain(`; approved by the person for ${head} over: ${paths}; main is named in autonomy.deployingBranches`);
  });

  it("still refuses a refused outcome with --approved, and leaves an asks outcome unchanged without it (review/103)", async () => {
    const { repo, head } = await seed();
    gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];
    // TEST CHANGE, justified (review/110): --approved names the head commit.
    expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
    expect(kinds()).not.toContain("merge");

    gh.threads = [threadsPage([])];
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks" });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses --approved in an unattended run before any GitHub call (review/103)", async () => {
    const { repo, head } = await seed({ mode: "unattended" });

    // TEST CHANGE, justified (review/110): --approved names the head commit.
    expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({
      outcome: "refused",
      notDone: ["--approved is the person's answer to an asks outcome, and this run is unattended, so no person gave it"],
    });
    expect(gh.calls).toEqual([]);
  });

  it("waits with --wait for a required check that has no check run yet, then lands once it is green (review/107)", async () => {
    const { repo, head } = await seed();
    const { slept } = fakeClock();
    const green = { status: 200, json: { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] } };
    gh.routes.set(`GET repos/o/r/commits/${head}/check-runs`, [{ status: 200, json: { total_count: 0, check_runs: [] } }, green]);

    expect((await run(repo, ["land", "--run", RUN, "--wait", "1"])).doc).toMatchObject({ outcome: "landed" });
    expect(slept).toEqual([30_000]);
  });

  it("refuses an approval for another commit than the head, naming both (review/110)", async () => {
    const { repo, head, base } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

    expect((await run(repo, ["land", "--run", RUN, "--approved", base])).doc).toMatchObject({
      outcome: "refused",
      notDone: [`the head moved since the approval: ${base} → ${head}`],
    });
    expect(kinds()).not.toContain("merge");
  });

  it("refuses an approval whose head moves between the first read and the act (review/110)", async () => {
    const { repo, head } = await seed();
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
    route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
    const moved = "b".repeat(40);
    gh.afterReadyPr = { head: { ref: RUN_BRANCH, sha: moved, repo: { full_name: "o/r" } } };

    expect((await run(repo, ["land", "--run", RUN, "--ready", "--approved", head])).doc).toMatchObject({
      outcome: "refused",
      notDone: [`the head moved since the approval: ${head} → ${moved}`],
    });
    expect(kinds()).toContain("ready");
    expect(kinds()).not.toContain("merge");
  });

  it("takes --approved only as a full 40-character commit, anything else a usage error (review/110)", async () => {
    const { repo, head } = await seed();
    for (const value of [head.slice(0, 12), `${head}0`, "z".repeat(40), "--json"]) {
      // oxlint-disable-next-line no-await-in-loop -- the cases share one repository and the process environment the runner stubs
      expect((await run(repo, ["land", "--run", RUN, "--approved", value])).code, value).toBe(2);
    }
    expect(gh.calls).toEqual([]);
  });

  it("names every asks reason and the head an approval must carry, in the JSON and the text (review/110)", async () => {
    const { repo, head } = await seed({ manifest: '{"version":1,"autonomy":{"mode":"ask"}}\n' });
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

    const result = await run(repo, ["land", "--run", RUN]);
    expect(result.doc).toMatchObject({
      outcome: "asks",
      asks: {
        reason: "autonomy.mode is ask",
        reasons: ["autonomy.mode is ask", "the diff touches paths that define the evidence: .github/workflows/ci.yml"],
        act: "pr-merge",
        head,
      },
    });

    const text = await runInProcess([runCommand], ["run", "land", "--run", RUN], { cwd: repo });
    expect(text.stdout).toContain("asks: autonomy.mode is ask\n");
    expect(text.stdout).toContain("asks: the diff touches paths that define the evidence: .github/workflows/ci.yml\n");
    expect(text.stdout).toContain(`approve with: --approved ${head}`);
  });

  /** review/114: makes `object` read as `replacement` for every git call that honours replace refs. */
  function replace(repo: string, object: string, replacement: string): void {
    git(repo, ["replace", object, replacement]);
    expect(git(repo, ["cat-file", "-p", object])).toBe(git(repo, ["--no-replace-objects", "cat-file", "-p", replacement]));
  }

  it("reads the ledger the head commit holds, not a replace ref's clean copy (review/114)", async () => {
    const { repo, head } = await seed({ ledger: row(`${RUN}/review/1`, "Warning", "open") });
    const clean = row(`${RUN}/review/1`, "Warning", "fixed");
    await writeFile(join(repo, RUN_DIR, "ledger.jsonl"), clean);
    const held = git(repo, ["rev-parse", `${head}:${RUN_DIR}/ledger.jsonl`]);
    replace(repo, held, execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: clean, encoding: "utf8" }).trim());

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("checkpoint first")] });
    expect(kinds()).not.toContain("merge");
  });

  it("reads a hook declaration at Base: as its commit holds it, not a replace ref naming no script (review/114)", async () => {
    const declaring = `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs"] }] })}\n`;
    const { repo, base } = await seed({ files: { ".stamity/hooks/guard.json": declaring, "tools/guard.mjs": "base guard\n" } });
    const declared = git(repo, ["rev-parse", `${base}:.stamity/hooks/guard.json`]);
    replace(repo, declared, execFileSync("git", ["hash-object", "-w", "--stdin"], { cwd: repo, input: '{"hooks":[]}\n', encoding: "utf8" }).trim());
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "tools/guard.mjs" }, { filename: "b" }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "asks", evidence: { held: ["tools/guard.mjs"] } });
    expect(kinds()).not.toContain("merge");
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
