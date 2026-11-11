import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { LAND_CLOCK } from "../../../src/cli/commands/runLand.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import type * as GhRunnerModule from "../../../src/cli/engine/ghRunner.ts";
import type * as ChangeRangeModule from "../../../src/cli/engine/changeRange.ts";
import type * as AtomicWriteModule from "../../../src/merge/atomicWrite.ts";
import type * as FsModule from "node:fs";
import type * as PersonOnlyModule from "../../../src/hooks/personOnly.ts";
import { prRecordText } from "../../../src/runs/pullRequest.ts";
import { createWorktreeReceipt, writeWorktreeReceipt } from "../../../src/worktree/receipt.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The shared set-up of the `stamity run land` suites, `runLand.test.ts` and the `runLand.<block>.test.ts` files beside it.
 * Each suite imports this module first, so the module mocks below are registered before any module they stand in for
 * loads. Not a test file: vitest collects only names ending in `.test.ts`.
 */

/**
 * a6-land-verb (REQ-FLOW-132, REQ-FLOW-133, REQ-FLOW-120): `stamity run land`, through the in-process funnel. Git runs
 * for real in a scratch repository whose origin names a GitHub repository and whose `ls-remote` and push go to a real
 * bare remote (the spy below); GitHub's answers are recorded routes. What landed is read from the record, the calls
 * made, and the remote's refs.
 */

export const RUN = "2026-10-23_overnight";
export const RUN_BRANCH = `stamity/${RUN}`;
export const RUN_DIR = `.stamity/runs/${RUN}`;
export const MARKER = `<!-- stamity:run ${RUN} -->`;

export type Answer = { status: number; json: unknown };

/**
 * Every GitHub call the verb made, in order, with the `gh` program it was told to start, and the answers. A route or
 * the thread answer may be a list: each read takes the next one, the last one repeating.
 * TEST CHANGE, justified (review/72, review/75, review/79): answers in sequence (a second thread read, a merge state
 * computed late) and the program each call names are what this round's rows are about; one answer reads as before.
 */
const gh = vi.hoisted(() => ({
  calls: [] as { kind: string; method?: string; path?: string; query?: string | undefined; body?: unknown; program?: string | undefined; cwd?: string | undefined; env?: string[] }[],
  /**
   * review/95, review/96: when set, each REST call also runs a stand-in shim in the folder the verb gave gh, which
   * reads a version file there and in each parent folder, as mise and asdf do; what it read is kept here.
   */
  probe: null as string[] | null,
  routes: new Map<string, Answer | Answer[]>(),
  /** Routes where `gh` fails before GitHub answers. */
  failing: new Set<string>(),
  merge: { status: 200, json: { merged: true } as unknown },
  threads: [] as unknown[],
  /** The comment editors' GraphQL answers (`ghCommentEditors`), in order; a rejection stands for a cloud whose proxy refuses GraphQL. */
  editors: [] as unknown[],
  editorsRefused: false,
  /** The answer every thread resolve gets (`ghResolveReviewThread`); `null` stands for `gh` failing before GitHub answers. */
  resolve: { status: 200, json: { data: { resolveReviewThread: { thread: { isResolved: true } } } } as unknown } as Answer | null,
  /** review/68: the fields the pull request reads with after a thread resolve, in order; empty leaves it as it reads. */
  afterResolve: [] as Record<string, unknown>[],
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
// TEST CHANGE, justified (REQ-FLOW-157, a2-land-closes-issue): the stand-in for `ghApi` accepted a write the real door
// refuses before gh starts, so a close of the run's issue sent through it passed here and closed nothing in a real job.
// Each write now goes through the real `ghApiArgs` check first: a refused one rejects as the real call does, reaches no
// route, and is kept as `refused <method> <path>`, no method field, so no case reads it as a write GitHub answered. The
// issue close is its own fixed-purpose call, `ghCloseIssue`, stood in for below on the real `ghCloseIssueArgs`.
vi.mock("../../../src/cli/engine/ghRunner.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof GhRunnerModule>();
  return {
    withoutVersionChoice: actual.withoutVersionChoice,
    ghApi: (request: { method: "GET" | "POST" | "PATCH"; path: string; body?: unknown; hostname: string }, opts?: { program?: string; cwd?: string; env?: Record<string, string | undefined> }) => {
      const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
      if (request.method !== "GET") {
        try {
          actual.ghApiArgs(request);
        } catch (error) {
          gh.calls.push({ kind: `refused ${request.method} ${path}`, program: opts?.program });
          return Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
      gh.calls.push({ kind: "api", method: request.method, path, query: /\?(.*)$/.exec(request.path)?.[1], body: request.body, program: opts?.program, cwd: opts?.cwd, env: Object.keys(opts?.env ?? {}) });
      // Mock reason (review/95): no version manager is installed for the suite; this program reads a version file from
      // its working folder as a shim does, so the case sees whether the run's folder reaches one.
      if (gh.probe !== null) {
        const walk = 'd=$(pwd -P); while :; do cat "$d/.tool-versions" 2>/dev/null; [ "$d" = / ] && break; d=$(dirname "$d"); done; true';
        gh.probe.push(execFileSync("/bin/sh", ["-c", walk], { cwd: opts?.cwd, encoding: "utf8" }));
      }
      if (gh.failing.has(`${request.method} ${path}`)) return Promise.reject(new Error("gh failed"));
      const answer = gh.routes.get(`${request.method} ${path}`);
      return Promise.resolve(answer === undefined ? { status: 404, json: { message: "Not Found" } } : next(answer));
    },
    ghMergePull: (request: Record<string, unknown>, opts?: { program?: string }) => {
      gh.calls.push({ kind: "merge", body: request, program: opts?.program });
      return Promise.resolve(gh.merge);
    },
    // The issue close, through the runner's own argument building: a request it refuses rejects before any route, as the
    // real call does before gh starts. Kept as `close <path>`, the path the real builder made, with the request the verb
    // passed as its body, and answered from the route `<method> <path>` of the built vector, so a case routes it as before.
    ghCloseIssue: (request: Parameters<typeof GhRunnerModule.ghCloseIssue>[0], opts?: { program?: string }) => {
      let args: string[];
      try {
        args = actual.ghCloseIssueArgs(request);
      } catch (error) {
        gh.calls.push({ kind: "refused close", body: request, program: opts?.program });
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      const path = args.at(-1) ?? "";
      const key = `${args[args.indexOf("--method") + 1] ?? ""} ${path}`;
      gh.calls.push({ kind: `close ${path}`, path, body: request, program: opts?.program });
      if (gh.failing.has(key)) return Promise.reject(new Error("gh failed"));
      const answer = gh.routes.get(key);
      return Promise.resolve(answer === undefined ? { status: 404, json: { message: "Not Found" } } : next(answer));
    },
    ghReviewThreads: (_request: unknown, opts?: { program?: string }) => {
      gh.calls.push({ kind: "threads", program: opts?.program });
      return Promise.resolve({ status: 200, json: next(gh.threads) });
    },
    ghCommentEditors: (_request: unknown, opts?: { program?: string }) => {
      gh.calls.push({ kind: "editors", program: opts?.program });
      return gh.editorsRefused ? Promise.reject(new Error("gh failed")) : Promise.resolve({ status: 200, json: next(gh.editors) });
    },
    ghResolveReviewThread: (request: { id: string }, opts?: { program?: string }) => {
      gh.calls.push({ kind: "resolve", body: request.id, program: opts?.program });
      const pr = gh.routes.get("GET repos/o/r/pulls/7");
      const json = (Array.isArray(pr) ? pr[0] : pr)?.json as object;
      if (gh.afterResolve.length > 0) gh.routes.set("GET repos/o/r/pulls/7", gh.afterResolve.map((fields) => ({ status: 200, json: { ...json, ...fields } })));
      return gh.resolve === null ? Promise.reject(new Error("gh failed")) : Promise.resolve(gh.resolve);
    },
    ghMarkReady: (request: { id: string }, opts?: { program?: string }) => {
      gh.calls.push({ kind: "ready", body: request, program: opts?.program });
      const pr = gh.routes.get(`GET repos/o/r/pulls/7`);
      const json = (Array.isArray(pr) ? pr[0] : pr)?.json as object;
      gh.routes.set("GET repos/o/r/pulls/7", gh.afterReady.map((state) => ({ status: 200, json: { ...json, draft: false, mergeable_state: state, ...gh.afterReadyPr } })));
      return Promise.resolve({ status: 200, json: { data: { markPullRequestReadyForReview: { pullRequest: { isDraft: false } } } } });
    },
    ghProgramPath: () => gh.program,
  };
});

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
export function threadsPage(nodes: unknown[], viewer = "runner", author = "runner"): unknown {
  return {
    data: { viewer: { login: viewer }, repository: { pullRequest: { author: { login: author }, reviewThreads: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } } } },
  };
}

/** A page of comment editors, as the constant query answers. */
export function editorsPage(nodes: unknown[], pageInfo: unknown = { hasNextPage: false, endCursor: null }): unknown {
  return { data: { repository: { pullRequest: { comments: { nodes, pageInfo } } } } };
}

/** One review thread: resolved or not, by whom, and its comments' authors as `[__typename, login]`. */
export function thread(isResolved: boolean, resolvedBy: string | null, ...authors: [string, string][]): unknown {
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

/** A refusal a case hands the range read in place of the real one; `null` runs the real read. */
const range = vi.hoisted(() => ({ refusal: null as Error | null }));

// A spy over the real read, which runs in every case but three. Mock reason: a case must see that the verb reads no range
// at all, and that a failure of the read that is no coded refusal stands, and no real repository reaches either.
vi.mock("../../../src/cli/engine/changeRange.ts", async (importOriginal) => {
  const real = await importOriginal<typeof ChangeRangeModule>();
  return {
    ...real,
    classifyRange: (...args: Parameters<typeof real.classifyRange>) => (range.refusal === null ? real.classifyRange(...args) : Promise.reject(range.refusal)),
  };
});

/** review/190: a path suffix whose atomic write a case makes fail; `null` writes every path for real. */
const atomic = vi.hoisted(() => ({ failing: null as string | null }));

// A spy over the real write, which runs in every case but one. Mock reason (review/190): `run end` writes the empty ledger
// only where nothing is at its path, so no file a case can put there makes that one write fail and leaves the rest to run.
vi.mock("../../../src/merge/atomicWrite.ts", async (importOriginal) => {
  const real = await importOriginal<typeof AtomicWriteModule>();
  return {
    ...real,
    atomicWriteFile: (...args: Parameters<typeof real.atomicWriteFile>) =>
      atomic.failing !== null && args[0].replaceAll("\\", "/").endsWith(atomic.failing) ? Promise.reject(new Error("disk full")) : real.atomicWriteFile(...args),
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

export function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...ENV } }).trim();
}

/** Where a run verb records the pull request it opened, under the repository's git directory. */
export const PR_RECORD = ".git/stamity/run-pull-request.json";

export const row = (id: string, severity: string, state: string): string => `${JSON.stringify({ id, phase: "review", source: "r", severity, evidence: "e", state, rationale: "" })}\n`;

/** A repository the land runs in, as {@link landHarness}'s `seed` leaves it. */
export interface Seeded {
  repo: string;
  remote: string;
  base: string;
  head: string;
}

/**
 * The suite's own set-up, called once at the top of each `stamity run land` suite: a temp folder per case, the stand-ins'
 * state reset before each case, and the helpers the cases share. Each suite file runs in its own module graph, so
 * nothing here is shared across files.
 */
export function landHarness() {
  const getRoot = useTempDir("run-land");

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    gh.calls.length = 0;
    gh.routes.clear();
    gh.failing.clear();
    gh.afterResolve = [];
    gh.merge = { status: 200, json: { merged: true } };
    gh.threads = [threadsPage([])];
    gh.editors = [editorsPage([])];
    gh.editorsRefused = false;
    gh.resolve = { status: 200, json: { data: { resolveReviewThread: { thread: { isResolved: true } } } } };
    range.refusal = null;
    atomic.failing = null;
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
    // TEST CHANGE, justified: a land now refuses with no manifest at the top of the default branch, so GitHub answers with the one `main` holds.
    if (opts.manifest !== null) route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(opts.manifest ?? '{"version":1}\n').toString("base64"), encoding: "base64" });
    // TEST CHANGE, justified (the login source, review/r2): the login now comes from the thread query's viewer, so
    // `GET user` answers as an app installation token's would, refused, in every case.
    route("GET user", { message: "Resource not accessible by integration" }, 403);
    route("GET repos/o/r/pulls", [{ number: 7, html_url: "https://github.com/o/r/pull/7", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" }, body: `The list.\n\n${MARKER}` }]);
    route("GET repos/o/r/pulls/7", pull(head));
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
    route("GET repos/o/r/rules/branches/main", [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
    route("GET repos/o/r/branches/main", { commit: { sha: base }, protection: { enabled: false } });
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
    // TEST CHANGE, justified (land-wiring, REQ-FLOW-153): the verb reads the tip's check runs for the brake, and this fake
    // answers 404 on an unknown route, which reads as a tip it could not read; every seeded tip is green.
    route(`GET repos/o/r/commits/${base}/check-runs`, { total_count: 1, check_runs: [{ id: 2, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
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

  return { getRoot, fakeClock, seed, pull, route, put, run, record, kinds };
}

type LandHarness = ReturnType<typeof landHarness>;

/** A lane in the seed's farm on its own branch, its receipt tagged with `run`, as `worktree setup --run` leaves one. */
export async function taggedLane(repo: string, name: string, tag: string): Promise<string> {
  const path = join(dirname(repo), ".stamity-worktrees", "repo", name);
  git(repo, ["worktree", "add", "-q", "-b", `lane/${name}`, path]);
  await writeWorktreeReceipt(
    git(path, ["rev-parse", "--absolute-git-dir"]),
    createWorktreeReceipt({ createdAt: "2026-11-09T00:00:00.000Z", engineVersion: "0.0.0-test", run: tag, worktree: { path, branch: `lane/${name}`, head: git(path, ["rev-parse", "HEAD"]) }, entries: [] }),
  );
  return path;
}

/** Job mode's set-up (REQ-FLOW-157), shared by its two suite files, built on the suite's own helpers. */
export function jobModeHarness({ seed, record, put, route, pull }: LandHarness) {
  const LAND_ON = '{"version":1,"autonomy":{"landJob":{"workflows":["CI"]}}}\n';
  const LANDS = ["land", "--job", "--pr", "7", "--ready"];
  /** GitHub's own account for a job's token: what the thread query's `viewer` names there. */
  const BOT = "github-actions";
  const END_LINES = "PR: 7\nLogin: runner\n";

  /**
   * A fresh checkout of a run that ended: its record closed at the head, with the lines `run end` commits, and nothing
   * under the git directory, neither the pull-request record nor a pre-flight's surface record.
   */
  // TEST CHANGE, justified (REQ-FLOW-157, amended 2026-11-10): `ledger` passes through to `seed`, so a case can hand the
  // job a head with no ledger; every case that names none seeds the ledger it did before.
  async function seedJob(
    opts: { status?: string; lines?: string; extra?: string; morning?: string; manifest?: string; mode?: "attended" | "unattended"; files?: Record<string, string>; ledger?: string | null } = {},
  ): Promise<Seeded> {
    const seeded = await seed({
      mode: opts.mode ?? "unattended",
      prRecord: false,
      manifest: opts.manifest ?? LAND_ON,
      ...(opts.files === undefined ? {} : { files: opts.files }),
      ...(opts.ledger === undefined ? {} : { ledger: opts.ledger }),
    });
    const { repo, remote } = seeded;
    const closed = (await record(repo)).replace("Status: in progress", `Status: ${opts.status ?? "closed 2026-11-04"}`);
    await put(repo, `${RUN_DIR}/record.md`, `${closed}${opts.extra ?? ""}${opts.lines ?? END_LINES}`);
    if (opts.morning !== undefined) await put(repo, `${RUN_DIR}/morning.md`, opts.morning);
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "end"]);
    git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    route("GET repos/o/r/pulls/7", pull(head));
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
    route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
    gh.threads = [threadsPage([], BOT)];
    return { ...seeded, head };
  }

  /** The pull request's body as the job last wrote it, where it wrote one. */
  const lastBody = (): string | undefined => (gh.calls.findLast((call) => call.method === "PATCH")?.body as { body: string } | undefined)?.body;
  const PATCHED = "PATCH repos/o/r/pulls/7";
  const writes = (): string[] => gh.calls.filter((call) => call.kind !== "api" ? !["threads", "editors"].includes(call.kind) : call.method !== "GET").map((call) => (call.kind === "api" ? `${call.method ?? ""} ${call.path ?? ""}` : call.kind));

  return { LAND_ON, LANDS, BOT, END_LINES, seedJob, lastBody, PATCHED, writes };
}

export { gh, links, range, atomic, table };
