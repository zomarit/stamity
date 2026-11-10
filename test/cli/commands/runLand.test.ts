import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync as fsRealpath } from "node:fs";
import { appendFile, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gateCommand, gitSurfaceRecordPath, readRunGitSurface } from "../../../src/cli/commands/gate.ts";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { LAND_CLOCK } from "../../../src/cli/commands/runLand.ts";
import type * as GitWriteModule from "../../../src/cli/engine/gitWrite.ts";
import type * as GhRunnerModule from "../../../src/cli/engine/ghRunner.ts";
import type * as ChangeRangeModule from "../../../src/cli/engine/changeRange.ts";
import type * as AtomicWriteModule from "../../../src/merge/atomicWrite.ts";
import type * as FsModule from "node:fs";
import { resolveAutonomy } from "../../../src/config/autonomy.ts";
import { LAND_JOB_NAME } from "../../../src/adapters/landWorkflow.ts";
import { CLAUDE_HOOKS_DIR } from "../../../src/hooks/model.ts";
import type * as PersonOnlyModule from "../../../src/hooks/personOnly.ts";
import { buildPersonOnlyGuardScript, PERSON_ONLY_GUARD_FILE } from "../../../src/hooks/scripts.ts";
import { surfaceRecord } from "../../../src/runs/gitSurface.ts";
import { insideAny } from "../../../src/runs/landEvidence.ts";
import { prRecordText } from "../../../src/runs/pullRequest.ts";
import { requestMarker } from "../../../src/runs/reviewTool.ts";
import { createWorktreeReceipt, writeWorktreeReceipt } from "../../../src/worktree/receipt.ts";
import { EngineError } from "../../../src/types/errors.ts";
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
vi.mock("../../../src/cli/engine/ghRunner.ts", async (importOriginal) => ({
  withoutVersionChoice: (await importOriginal<typeof GhRunnerModule>()).withoutVersionChoice,
  ghApi: (request: { method: string; path: string; body?: unknown }, opts?: { program?: string; cwd?: string; env?: Record<string, string | undefined> }) => {
    const path = request.path.replace(/^\//, "").replace(/\?.*$/, "");
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

/** A page of comment editors, as the constant query answers. */
function editorsPage(nodes: unknown[], pageInfo: unknown = { hasNextPage: false, endCursor: null }): unknown {
  return { data: { repository: { pullRequest: { comments: { nodes, pageInfo } } } } };
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

  // REQ-FLOW-168: the session's lookup and own-check find the marker before a client's footer, as the job's read does.
  it("lands the run's own pull request whose client added a footer after the marker, found by the lookup too", async () => {
    const { repo, head } = await seed();
    const body = `The list.\n\n${MARKER}\n\nGenerated by [Claude Code](https://claude.ai/code)`;
    route("GET repos/o/r/pulls", [{ number: 7, html_url: "https://github.com/o/r/pull/7", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" }, body }]);
    route("GET repos/o/r/pulls/7", pull(head, { body }));

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.doc).toMatchObject({ outcome: "landed", pr: { number: 7, head } });
    const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
    expect(patched.body).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at [^\\n]+\\n\\n${MARKER}$`));
  });

  describe("a landed run's clean-up (d-run-cleanup, REQ-FLOW-176)", () => {
    it("removes the run's tagged clean lane, keeps its branch the checkout has, and records the act", async () => {
      const { repo } = await seed({ files: { ".gitignore": "captures/\n" } });
      const kept = await taggedLane(repo, "p-kept", RUN);
      await mkdir(join(kept, "captures"), { recursive: true });
      await writeFile(join(kept, "captures", "run.log"), "a capture\n");
      const gone = await taggedLane(repo, "p-gone", RUN);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({
        outcome: "landed",
        notDone: [],
        cleanup: {
          removed: [gone],
          kept: [
            { path: kept, reason: "it holds ignored files: captures/" },
            { path: RUN_BRANCH, reason: `checked out at ${repo}` },
          ],
        },
      });
      expect(existsSync(gone)).toBe(false);
      expect(existsSync(join(kept, "captures", "run.log"))).toBe(true);
      expect((await record(repo)).split("\n").filter((line) => line.includes(" cleanup: "))).toEqual([expect.stringMatching(/^- \S+Z cleanup: removed lane p-gone$/)]);
    });

    it("cleans up on a pull request already merged at the head too", async () => {
      const { repo, head } = await seed();
      const gone = await taggedLane(repo, "p-after", RUN);
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true }));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "already-landed", cleanup: { removed: [gone] } });
      expect(existsSync(gone)).toBe(false);
    });

    it("cleans up nothing on a land that refuses", async () => {
      const { repo } = await seed();
      const lane = await taggedLane(repo, "p-stays", RUN);
      gh.threads = [threadsPage([thread(false, null, ["Bot", "codex"])])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused" });
      expect(result.doc).not.toHaveProperty("cleanup");
      expect(existsSync(lane)).toBe(true);
    });
  });

  /** A lane in the seed's farm on its own branch, its receipt tagged with `run`, as `worktree setup --run` leaves one. */
  async function taggedLane(repo: string, name: string, tag: string): Promise<string> {
    const path = join(dirname(repo), ".stamity-worktrees", "repo", name);
    git(repo, ["worktree", "add", "-q", "-b", `lane/${name}`, path]);
    await writeWorktreeReceipt(
      git(path, ["rev-parse", "--absolute-git-dir"]),
      createWorktreeReceipt({ createdAt: "2026-11-09T00:00:00.000Z", engineVersion: "0.0.0-test", run: tag, worktree: { path, branch: `lane/${name}`, head: git(path, ["rev-parse", "HEAD"]) }, entries: [] }),
    );
    return path;
  }

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

  describe("a closed thread someone beside its closer wrote in", () => {
    const ASKS = "a person decides on closed review threads that someone beside the closer wrote in, or that did not read whole: T1";
    const named = (entry: unknown): unknown => ({ ...(entry as object), id: "T1" });

    it.each([
      ["a closer's reply under a person's comment", thread(true, "bob", ["User", "alice"], ["User", "bob"])],
      ["a closer who wrote first", thread(true, "bob", ["User", "bob"], ["User", "alice"])],
      ["a closer who wrote nothing", thread(true, "bob", ["User", "alice"])],
      ["an app closing over a person's comment", thread(true, "review-bot", ["Bot", "review-bot"], ["User", "alice"])],
    ])("asks and merges nothing, on %s", async (_name, entry) => {
      const { repo, head } = await seed();
      gh.threads = [threadsPage([named(entry)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS], act: "pr-merge", head }, evidence: { threads: { unresolved: 0 } } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on one that did not read whole, whoever it seems to hold", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([{ ...(named(thread(true, "bob", ["User", "bob"])) as object), comments: { totalCount: 101, nodes: [{ author: { __typename: "User", login: "bob" } }] } }])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect(kinds()).not.toContain("merge");
    });

    it("lands on a person's approval of that head, and no approval of another head carries it", async () => {
      const { repo, head } = await seed();
      gh.threads = [threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN, "--approved", "f".repeat(40)])).doc).toMatchObject({ outcome: "refused" });
      expect(kinds()).not.toContain("merge");

      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "landed", approved: { sha: head, reasons: [ASKS] } });
      expect(kinds()).toContain("merge");
    });

    it("stops an unattended run on the ask, which no approval there reaches", async () => {
      const { repo, head } = await seed({ mode: "unattended" });
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      vi.stubEnv("HOME", home);
      vi.stubEnv("XDG_CONFIG_HOME", home);
      vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
      vi.stubEnv("GH_HOST", undefined);
      vi.stubEnv("STAMITY_UNATTENDED", undefined);
      const place = await gitSurfaceRecordPath(repo);
      const surface = await readRunGitSurface(repo);
      if ("unreadable" in place || "unreadable" in surface) throw new Error("the seed's git surface could not be read");
      await mkdir(dirname(place.path), { recursive: true });
      await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString(), false))}\n`);
      gh.threads = [threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "refused" });
      expect(kinds()).not.toContain("merge");
    });

    it("asks when the thread closes after the first read, on the read just before the act", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([]), threadsPage([named(thread(true, "bob", ["User", "alice"], ["User", "bob"]))])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [ASKS] } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["a person closing their own thread", thread(true, "alice", ["User", "alice"])],
      ["a person closing an app's thread", thread(true, "alice", ["Bot", "codex"])],
      ["the run's own reply beside the closer", thread(true, "alice", ["User", "alice"], ["User", "runner"])],
      ["the run's own close, one account in the thread", thread(true, "runner", ["Bot", "codex"], ["User", "runner"])],
      ["an app closing its own thread", thread(true, "review-bot", ["Bot", "review-bot"], ["User", "runner"])],
    ])("still lands with no ask, on %s", async (_name, entry) => {
      const { repo } = await seed();
      gh.threads = [threadsPage([named(entry)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { threads: { unresolved: 0 } } });
    });
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

  it("asks for a diff editing a nested setup's client settings or the script its declaration names, from a run at the git top (REQ-FLOW-102)", async () => {
    const declaring = `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/lint.mjs"] }] })}\n`;
    const { repo } = await seed({ files: { "apps/web/.stamity/manifest.json": "{}\n", "apps/web/.stamity/hooks/lint.json": declaring, "apps/web/tools/lint.mjs": "base lint\n" } });
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "apps/web/.claude/settings.json" }, { filename: "apps/web/tools/lint.mjs" }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({
      outcome: "asks",
      asks: { act: "pr-merge", reason: "the diff touches paths that define the evidence: apps/web/.claude/settings.json, apps/web/tools/lint.mjs" },
      evidence: { held: ["apps/web/.claude/settings.json", "apps/web/tools/lint.mjs"] },
    });
    expect(kinds()).not.toContain("merge");
  });

  it("asks for a diff adding a setup below the top with its client settings, the setup only at the head (REQ-FLOW-102)", async () => {
    const { repo, remote } = await seed();
    await put(repo, "apps/api/.stamity/manifest.json", "{}\n");
    await put(repo, "apps/api/.cursor/hooks.json", "{}\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "a setup"]);
    git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
    const head = git(repo, ["rev-parse", "HEAD"]);
    route("GET repos/o/r/pulls/7", pull(head));
    route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
    route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: "apps/api/.stamity/manifest.json" }, { filename: "apps/api/.cursor/hooks.json" }]);

    const result = await run(repo, ["land", "--run", RUN]);

    expect(result.code).toBe(1);
    expect(result.doc).toMatchObject({ outcome: "asks", evidence: { held: ["apps/api/.cursor/hooks.json", "apps/api/.stamity/manifest.json"] } });
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

  it("asks when the baked guard reads `ask` though all three manifests read autonomous (review/15)", async () => {
    const guard = buildPersonOnlyGuardScript({ tool: "claude", layout: "claude", autonomy: resolveAutonomy({ autonomy: { mode: "ask" } }) });
    const { repo } = await seed({ files: { [`${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`]: guard } });
    route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}').toString("base64"), encoding: "base64" });

    expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reason: "autonomy.mode is ask", act: "pr-merge" } });
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
    // TEST CHANGE, justified (land-wiring, REQ-FLOW-153): this case moves the tip, so the brake reads that tip's check runs.
    route(`GET repos/o/r/commits/${tip}/check-runs`, { total_count: 1, check_runs: [{ id: 2, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
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
    // TEST CHANGE, justified (review/45, signed off): the pull request leaves the manifest alone, so no key is named as
    // loosened, and these words go back to what they were before land-wiring. The pin stands: a reason added after the
    // approval does not stop the land.
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

  describe("the brake (REQ-FLOW-153)", () => {
    const failing = { total_count: 1, check_runs: [{ id: 3, name: "test", status: "completed", conclusion: "failure", app: { id: 15368 } }] };

    it("asks while a required check fails on the tip, naming it, and merges nothing", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"], act: "pr-merge" }, evidence: { defaultBranch: { failing: ["test"], unread: null } } });
      expect(kinds()).not.toContain("merge");
    });

    it("lets --approved pass the brake, but not a refusal", async () => {
      const { repo, base, head } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);

      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "landed", approved: { reasons: ["main is red: test failing on its tip"] } });

      gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];
      expect((await run(repo, ["land", "--run", RUN, "--approved", head])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
    });

    it("still asks with a red tip on --fast-forward", async () => {
      const { repo, base } = await seed();
      route("GET repos/o/r/rules/branches/main", [{ type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } }]);
      route(`GET repos/o/r/commits/${base}/check-runs`, failing);
      route(`GET repos/o/r/compare/${base}...${git(repo, ["rev-parse", "HEAD"])}`, { status: "ahead" });

      expect((await run(repo, ["land", "--run", RUN, "--fast-forward"])).doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"], act: "push-default" } });
    });

    it("asks when the tip's read fails, naming the read", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, { message: "Bad Gateway" }, 502);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["main's tip could not be read (the check runs read answered HTTP 502), so whether it is red is not known"] },
      });
    });

    it("reads a required context missing or pending on the tip as not red, and says so in the evidence line", async () => {
      const { repo, base } = await seed();
      route(`GET repos/o/r/commits/${base}/check-runs`, { total_count: 1, check_runs: [{ id: 3, name: "other", status: "completed", conclusion: "failure", app: { id: 15368 } }] });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { defaultBranch: { failing: [], notRed: ["test"] } } });
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain("0 open Critical/Warning rows; main's tip reads not red with test missing or pending");
    });

    /** The default branch's answers: each read takes the next tip, the last repeating. */
    const tips = (...shas: string[]): void => {
      gh.routes.set("GET repos/o/r/branches/main", shas.map((sha) => ({ status: 200, json: { commit: { sha }, protection: { enabled: false } } })));
    };
    const NEWER = "9".repeat(40);

    it("reads the branch again just before the act, so a newer commit that went red asks (review/44, review/54)", async () => {
      const { repo, base } = await seed();
      tips(base, base, NEWER);
      route(`GET repos/o/r/commits/${NEWER}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is red: test failing on its tip"] }, evidence: { defaultBranch: { failing: ["test"] } } });
      expect(kinds()).not.toContain("merge");
    });

    it("reads the branch again on every --wait poll (review/44, review/54)", async () => {
      fakeClock();
      const { repo, base, head } = await seed();
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });
      tips(base, base, NEWER);
      route(`GET repos/o/r/commits/${NEWER}/check-runs`, failing);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "1"]);

      expect(result.doc).toMatchObject({ outcome: "refused", evidence: { defaultBranch: { failing: ["test"] } } });
    });

    it("asks when the branch stops reading on the re-read, naming the read", async () => {
      const { repo, base } = await seed();
      gh.routes.set("GET repos/o/r/branches/main", [
        { status: 200, json: { commit: { sha: base }, protection: { enabled: false } } },
        { status: 200, json: { commit: { sha: base }, protection: { enabled: false } } },
        { status: 502, json: { message: "Bad Gateway" } },
      ]);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["main's tip could not be read (the default branch read answered HTTP 502), so whether it is red is not known"] },
      });
      expect(kinds()).not.toContain("merge");
    });
  });

  describe("auto-ship (REQ-FLOW-152)", () => {
    const manifestOn = (autoShip: Record<string, unknown>): string =>
      `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"], autoShip: { maxFiles: 10, maxLines: 100, classes: ["product", "records"], ...autoShip } } })}\n`;
    /** GitHub's word on what merges: the merge base its compare names, and the pull request's line counts, as git counts that range. */
    const github = (repo: string, tip: string, head: string, mergeBase = tip, over: Record<string, unknown> = {}): number => {
      route(`GET repos/o/r/compare/${tip}...${head}`, { status: "ahead", merge_base_commit: { sha: mergeBase } });
      const rows = git(repo, ["diff", "--numstat", mergeBase, head]).split("\n").map((line) => line.split("\t"));
      const additions = rows.reduce((sum, [added]) => sum + Number(added), 0);
      const deletions = rows.reduce((sum, [, removed]) => sum + Number(removed), 0);
      route("GET repos/o/r/pulls/7", pull(head, { additions, deletions, ...over }));
      return additions + deletions;
    };
    // TEST CHANGE, justified (review/52, signed off): the verb takes the merge base from GitHub and holds the range against the
    // pull request's file list and line counts, so a seeded land that fits has GitHub agree with the range it reads.
    const seedOn = async (autoShip: Record<string, unknown> = {}): Promise<Seeded> => {
      const manifest = manifestOn(autoShip);
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);
      return seeded;
    };
    const green = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
    const seededFiles = [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }];
    const incomplete = (why: string): object => ({
      outcome: "asks",
      asks: { reasons: ["main is named in autonomy.deployingBranches", `auto-ship: the classification is incomplete: ${why}`] },
    });
    const CLASS_READ = "repos/o/r/contents/.stamity/change-classes.json";
    /** A file as GitHub's contents read answers one. */
    const fileAnswer = (text: string): object => ({ type: "file", encoding: "base64", content: Buffer.from(text).toString("base64") });
    const raisesTheChange = `${JSON.stringify({ classes: { "security-sensitive": ["a.txt"] } })}\n`;

    it("merges onto a deploying branch with no ask when the change fits, the evidence line naming the rules", async () => {
      const { repo } = await seedOn();

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true } } });
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toMatch(/; auto-ship rules met: 3 of at most 10 files; \d+ of at most 100 lines; class /);
    });

    it("counts a rename's two sides through the real range read, and a change that fits still lands", async () => {
      const { repo, remote, base } = await seedOn();
      git(repo, ["mv", "a.txt", "b.txt"]);
      git(repo, ["commit", "-q", "-m", "a rename"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      // TEST CHANGE, justified (review/52, signed off): the range is held against GitHub's list, so the list names what moved.
      github(repo, base, head);
      route("GET repos/o/r/pulls/7/files", [{ filename: "b.txt", previous_filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true, evidence: expect.stringContaining("auto-ship rules met: 4 of at most 10 files") } } });
    });

    // TEST CHANGE, justified (review/42): a change over the file limit now stops on GitHub's count before any read, so this
    // case keeps to the rules the range answers, and the next one pins the file limit.
    it("asks, naming each rule the change fails", async () => {
      const { repo } = await seedOn({ maxLines: 1, classes: ["records"] });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: {
          reasons: [
            "main is named in autonomy.deployingBranches",
            expect.stringMatching(/^auto-ship: \d+ lines are over autonomy\.autoShip\.maxLines \(1\)$/),
            "auto-ship: product is outside autonomy.autoShip.classes (records)",
          ],
        },
      });
      expect(kinds()).not.toContain("merge");
    });

    it("stops on GitHub's count over the file limit, before any range or class file is read (review/42)", async () => {
      const { repo } = await seedOn({ maxFiles: 2 });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", "auto-ship: 3 files are over autonomy.autoShip.maxFiles (2)"] } });
      expect(kinds().filter((kind) => kind.includes("/compare/") || kind.includes("change-classes"))).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    // TEST CHANGE, justified (review/52, signed off): the base is GitHub's now, so a shallow clone reaches this as a base GitHub
    // names and the clone does not hold, with no spy in the way; a local shallow file no longer decides anything.
    it("asks on a shallow clone, whose store lacks the base GitHub names, rather than failing", async () => {
      const { repo, base, head } = await seedOn();
      const absent = "d".repeat(40);
      route(`GET repos/o/r/compare/${base}...${head}`, { status: "ahead", merge_base_commit: { sha: absent } });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the base ${absent} is not a commit the object store holds, so the range cannot be classified`));
      expect(kinds()).not.toContain("merge");
    });

    it("takes the merge base from GitHub, so a planted local parent override cannot shrink what is read (review/52)", async () => {
      // TEST CHANGE, justified (review/42): the limit here was maxFiles, which GitHub's count now answers with no read, so the
      // planted override would go unread. maxLines is answered by the range alone, so the read stays what this case proves.
      const { repo, remote, base, head: work } = await seedOn({ maxLines: 1 });
      await put(repo, "c.txt", "c\n");
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "a small last step"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      github(repo, base, head, base, { changed_files: 4 });
      route("GET repos/o/r/pulls/7/files", [...seededFiles, { filename: "c.txt" }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);
      // TEST CHANGE, justified (integration round 7): `work` loses its parent too. `work` descends from `base`, so giving `base`
      // the parent `work` alone made a loop, and on a loop git found a merge base only when the two commits shared a second.
      await put(repo, ".git/info/grafts", `${base} ${work}\n${work}\n`);
      // The override is live: local git now calls a commit of the run's the merge base, and the one-file range would fit.
      expect(git(repo, ["merge-base", base, head])).toBe(work);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", expect.stringMatching(/^auto-ship: \d+ lines are over autonomy\.autoShip\.maxLines \(1\)$/)] } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["answers 502", { status: 502, json: { message: "Bad Gateway" } }, "HTTP 502"],
      ["names no merge base", { status: 200, json: { status: "ahead" } }, "HTTP 200"],
      ["names something that is no commit id", { status: 200, json: { merge_base_commit: { sha: "--all" } } }, "HTTP 200"],
    ])("asks when GitHub's compare %s, naming it (review/52)", async (_name, answer, words) => {
      const { repo, base, head } = await seedOn();
      gh.routes.set(`GET repos/o/r/compare/${base}...${head}`, answer);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`GitHub's compare of ${base} and ${head} named no merge base (${words})`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where the range and the pull request's file list differ, naming the path (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      github(repo, base, head, base, { changed_files: 4 });
      route("GET repos/o/r/pulls/7/files", [...seededFiles, { filename: "other.txt" }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete("the range read and GitHub's file list differ on other.txt"));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where the range's line total is not the pull request's, naming both (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      const counted = github(repo, base, head);
      route("GET repos/o/r/pulls/7", pull(head, { additions: counted + 1, deletions: 0 }));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the range read counts ${counted} lines and GitHub ${counted + 1}`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks where GitHub names no line counts for the pull request (review/52)", async () => {
      const { repo, base, head } = await seedOn();
      const counted = github(repo, base, head);
      route("GET repos/o/r/pulls/7", pull(head));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`the range read counts ${counted} lines and GitHub none`));
      expect(kinds()).not.toContain("merge");
    });

    it("judges the change by the tip's class file, not the one its fork point holds (review/53)", async () => {
      const { repo, base, head } = await seedOn();
      git(repo, ["switch", "-q", "main"]);
      await put(repo, ".stamity/change-classes.json", raisesTheChange);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "a rule tightened after the run forked"]);
      const tip = git(repo, ["rev-parse", "HEAD"]);
      git(repo, ["switch", "-q", RUN_BRANCH]);
      route("GET repos/o/r/branches/main", { commit: { sha: tip }, protection: { enabled: false } });
      route(`GET repos/o/r/commits/${tip}/check-runs`, green);
      github(repo, tip, head, base);
      // TEST CHANGE, justified (review/69, signed off): the tip's class file is read from GitHub now, so GitHub answers with it.
      route(`GET ${CLASS_READ}`, fileAnswer(raisesTheChange));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { autoShip: { eligible: false, reasons: expect.arrayContaining([expect.stringContaining("security-sensitive")]) } } });
      expect(kinds()).not.toContain("merge");
    });

    it("reads the class file from GitHub at the tip's own commit, whatever the clone holds there (review/69)", async () => {
      const { repo, base } = await seedOn();
      route(`GET ${CLASS_READ}`, fileAnswer(raisesTheChange));

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { autoShip: { eligible: false, reasons: expect.arrayContaining([expect.stringContaining("security-sensitive")]) } } });
      expect(gh.calls.filter((call) => call.path === CLASS_READ).map((call) => call.query)).toEqual([`ref=${base}`]);
      expect(kinds()).not.toContain("merge");
    });

    it("takes no rule from a class file only the clone holds (review/69)", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { ".stamity/change-classes.json": raisesTheChange } });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { autoShip: { eligible: true } } });
    });

    it.each([
      ["answers 502", { status: 502, json: { message: "Bad Gateway" } }, "HTTP 502"],
      ["answers a folder", { status: 200, json: [{ type: "file", name: "x" }] }, "GitHub's answer is no file"],
      ["answers a link", { status: 200, json: { type: "symlink", target: "x" } }, "GitHub's answer is no file"],
      ["answers a file too large to carry its bytes", { status: 200, json: { type: "file", encoding: "none", content: "" } }, "GitHub's answer is no file"],
    ])("asks when the class file's read %s, naming it (review/69)", async (_name, answer, words) => {
      const { repo, base } = await seedOn();
      gh.routes.set(`GET ${CLASS_READ}`, answer);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`.stamity/change-classes.json did not read from GitHub at ${base} (${words})`));
      expect(kinds()).not.toContain("merge");
    });

    it("asks when gh fails on the class file's read, naming it (review/69)", async () => {
      const { repo, base } = await seedOn();
      gh.failing.add(`GET ${CLASS_READ}`);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject(incomplete(`.stamity/change-classes.json did not read from GitHub at ${base} (gh failed)`));
      expect(kinds()).not.toContain("merge");
    });

    // TEST CHANGE, justified: this case pinned a project's own class file judging its change (review/69); the class file no longer follows the start folder, so it pins the ask.
    it("does not auto-ship a land started below the top, whatever class file the project holds", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { "apps/web/.stamity/manifest.json": manifest } });
      const web = join(seeded.repo, "apps/web");
      route("GET repos/o/r/contents/apps/web/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route(`GET ${CLASS_READ}`, fileAnswer(`${JSON.stringify({ classes: { "security-sensitive": ["apps/web/app.txt"] } })}\n`));
      route("GET repos/o/r/contents/apps/web/.stamity/change-classes.json", fileAnswer(`${JSON.stringify({ classes: { records: ["app.txt"] } })}\n`));
      await put(web, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\nBase: ${seeded.base}\n`);
      await put(web, `${RUN_DIR}/ledger.jsonl`, row(`${RUN}/review/1`, "Warning", "fixed"));
      await put(web, "app.txt", "a change the top's class file raises\n");
      git(seeded.repo, ["add", "-A"]);
      git(seeded.repo, ["commit", "-q", "-m", "the project's own change"]);
      git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(seeded.repo, ["rev-parse", "HEAD"]);
      // The tip has moved to the run's first commit, so what merges lies in the project alone.
      route("GET repos/o/r/branches/main", { commit: { sha: seeded.head }, protection: { enabled: false } });
      route(`GET repos/o/r/commits/${seeded.head}/check-runs`, green);
      github(seeded.repo, seeded.head, head, seeded.head, { changed_files: 3 });
      route("GET repos/o/r/pulls/7/files", [{ filename: "apps/web/app.txt" }, { filename: `apps/web/${RUN_DIR}/record.md` }, { filename: `apps/web/${RUN_DIR}/ledger.jsonl` }]);
      route(`GET repos/o/r/commits/${head}/check-runs`, green);
      // The spy above finds the bare remote beside the verb's cwd.
      await symlink(seeded.remote, join(seeded.repo, "apps", "remote.git"));

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        notDone: [],
        evidence: { autoShip: { eligible: false, reasons: ["auto-ship is judged only from the repository's top, and this land started in apps/web/"] } },
      });
      expect(gh.calls.map((call) => call.path)).not.toContain("repos/o/r/contents/apps/web/.stamity/change-classes.json");
      expect(kinds()).not.toContain("merge");
    });

    it("keeps auto-ship at the top where a project elsewhere names nothing of it", async () => {
      const manifest = manifestOn({});
      const seeded = await seed({ manifest, files: { "test/fixture/.stamity/manifest.json": '{"version":1}\n' } });
      route("GET repos/o/r/contents/test/fixture/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64"), encoding: "base64" });
      github(seeded.repo, seeded.base, seeded.head);

      const result = await run(seeded.repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", notDone: [], evidence: { autoShip: { eligible: true } } });
    });

    it("reads the range's refusal of an absent commit as incomplete, so the land asks instead of failing", async () => {
      const { repo } = await seedOn();
      range.refusal = new EngineError("the base x is not a commit the object store holds", { code: "VALIDATION_ERROR" });

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches", "auto-ship: the classification is incomplete: the base x is not a commit the object store holds"] } });
    });

    it("lets any other failure of the range read stand", async () => {
      const { repo } = await seedOn();
      range.refusal = new Error("a defect");

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).not.toHaveProperty("outcome");
      expect(kinds()).not.toContain("merge");
    });

    it("still asks for --fast-forward, the rules met", async () => {
      // TEST CHANGE, justified (review/52, signed off): this case's own compare route named no merge base, which now reads as
      // incomplete; `seedOn` routes the compare with one, so the rules are met as the title says.
      const { repo } = await seedOn();
      route("GET repos/o/r/rules/branches/main", []);

      expect((await run(repo, ["land", "--run", RUN, "--fast-forward"])).doc).toMatchObject({ outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches"], act: "push-default" } });
    });

    it("reads no range where the default branch is not deploying", async () => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { autoShip: { maxFiles: 1, maxLines: 1, classes: ["docs"] } } })}\n`;
      const { repo } = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      range.refusal = new Error("a range was read");

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { autoShip: null } });
    });
  });

  describe("the review tool (REQ-FLOW-154)", () => {
    const LOGIN = "chatgpt-codex-connector[bot]";
    const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
    const block = (sha: string, status = "completed", findings = false): string =>
      `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: sha, has_any_findings: findings, has_unresolved_findings: findings, status } })} -->`;
    const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
    const comment = (id: number, login: string, type: string, body: string, createdAt = minutesAgo(5)): unknown => ({ id, user: { login, type }, body, created_at: createdAt });
    const fromRun = (id: number, head: string, createdAt?: string): unknown => comment(id, "runner", "User", `@codex review\n\n${requestMarker(head)}`, createdAt);
    const fromTool = (id: number, body: string): unknown => comment(id, LOGIN, "Bot", body);
    const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
    const editedBy = (id: number, type: string, login: string): unknown => ({ databaseId: id, lastEditedAt: minutesAgo(1), editor: { __typename: type, login } });
    // The bot's real `+1` reads `User` in REST: the type is no filter, the login is.
    const plusOne = { user: { login: LOGIN, type: "User" }, content: "+1" };

    const seedTool = async (tool: Record<string, unknown> = TOOL): Promise<Seeded> => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { reviewTool: tool } })}\n`;
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
      return seeded;
    };
    /** The three REST reads, and the editors as the tool's own edit reads: GraphQL's bare name on a `Bot`. */
    const answers = (comments: unknown[], reactions: unknown[] = [plusOne], reviews: unknown[] = []): void => {
      route("GET repos/o/r/issues/7/comments", comments);
      route("GET repos/o/r/issues/7/reactions", reactions);
      route("GET repos/o/r/pulls/7/reviews", reviews);
    };
    const posted = (): string[] => gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body);

    it("reads no comment, posts nothing and asks no editor with no review tool set", async () => {
      const { repo } = await seed();

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { review: null } });
      expect(kinds().filter((kind) => kind.includes("issues/") || kind.includes("/reviews") || kind === "editors")).toEqual([]);
    });

    it("merges on a clean state comment the tool last edited, joined through GraphQL's bare name, with its +1", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1), editedBy(2, "Bot", "chatgpt-codex-connector")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" } } });
      expect(posted()).toEqual([]);
      // The editors after the bodies, so an edit landing between the two reads shows as a foreign editor rather than being missed.
      expect(kinds().indexOf("editors")).toBeGreaterThan(kinds().indexOf("GET repos/o/r/issues/7/comments"));
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain(`${LOGIN} reads clean on ${head.slice(0, 7)}`);
    });

    it("re-reads all three reads just before the act: a +1 taken back holds the merge", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.routes.set("GET repos/o/r/issues/7/reactions", [{ status: 200, json: [plusOne] }, { status: 200, json: [] }]);
      gh.editors = [editorsPage([never(1), never(2)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting", reason: expect.stringContaining("+1") } } });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses on a head moved between the verdict and the act", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1), never(2)])];
      gh.routes.set("GET repos/o/r/pulls/7", [{ status: 200, json: pull(head) }, { status: 200, json: pull("c".repeat(40)) }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${"c".repeat(40)} is not HEAD ${head}`] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the tool once on a head with no run, and leaves the rest for the next call", async () => {
      const { repo, head } = await seedTool();
      answers([]);
      gh.routes.set("GET repos/o/r/issues/7/comments", [{ status: 200, json: [] }, { status: 200, json: [fromRun(1, head)] }]);
      gh.editors = [editorsPage([never(1)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { act: "pr-merge", head, pending: true, reasons: [expect.stringContaining("waiting for")] },
        evidence: { review: { state: "waiting" } },
      });
      expect(kinds()).not.toContain("merge");
    });

    it("does not ask again on a head already asked, and --approved does not pass a wait", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head)]);
      gh.editors = [editorsPage([never(1)])];

      const result = await run(repo, ["land", "--run", RUN, "--approved", head]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
      expect(kinds()).not.toContain("merge");
    });

    it("starts the clock with the marker alone where a run is already going on the head", async () => {
      const { repo, head } = await seedTool();
      answers([fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(2)])];

      await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([requestMarker(head)]);
    });

    it("writes nothing on a dry run", async () => {
      const { repo } = await seedTool();
      answers([]);

      const result = await run(repo, ["land", "--run", RUN, "--dry-run"]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
    });

    it("posts no request while a plain gap stands, so no round goes on a head that cannot land", async () => {
      const { repo } = await seedTool();
      answers([]);
      gh.threads = [threadsPage([thread(false, null, ["User", "alice"])])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([]);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", expect.stringContaining("no request on this head yet")] });
    });

    // TEST CHANGE, justified (review/49): this pinned `asks` with `asks.pending`. With no marker no wait can end, so that told a
    // token that cannot comment to call again on every call; a request that did not post is a plain refusal now.
    it("refuses where the request did not post, naming it, and waits on nothing", async () => {
      const { slept } = fakeClock();
      const { repo } = await seedTool();
      answers([]);
      route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "5"]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("no request on this head yet")] });
      expect(result.doc).not.toHaveProperty("asks");
      expect(slept).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    describe("a head the tool finished with findings before the land was called (review/47)", () => {
      const EARLIER = "e".repeat(40);

      it("posts the marker alone, so that round counts and the rounds read spent", async () => {
        const { repo, head } = await seedTool();
        const finished = fromTool(2, block(head, "completed", true));
        answers([]);
        gh.routes.set("GET repos/o/r/issues/7/comments", [
          { status: 200, json: [fromRun(1, EARLIER, minutesAgo(90)), finished] },
          { status: 200, json: [fromRun(1, EARLIER, minutesAgo(90)), finished, fromRun(3, head)] },
        ]);
        gh.editors = [editorsPage([never(1), never(2), never(3)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([requestMarker(head)]);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "spent" } }, notDone: [expect.stringContaining("2 of 2 review rounds spent")] });
        expect(kinds()).not.toContain("merge");
      });

      it("reads findings still while rounds remain, and posts nothing on a head already marked", async () => {
        const { repo, head } = await seedTool();
        answers([fromRun(1, head, minutesAgo(5)), fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(1), never(2)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "findings" } } });
      });

      it("writes nothing on a dry run, nor on a pull request that does not read as the run's own", async () => {
        const { repo, head } = await seedTool();
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];

        await run(repo, ["land", "--run", RUN, "--dry-run"]);
        route("GET repos/o/r/pulls/7", pull(head, { body: "someone rewrote this" }));
        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "refused" });
      });

      it("posts nothing on a pull request already merged at the head", async () => {
        const { repo, head } = await seedTool();
        route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true, mergeable_state: null }));
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([]);
        expect(result.doc).toMatchObject({ outcome: "already-landed", evidence: { review: { state: "findings" } } });
      });

      // A head with no marker has spent no round, so even `rounds: 1` reads findings here: why no page says "never as findings".
      it("names a marker that did not post, and the findings stand with no round spent", async () => {
        const { repo, head } = await seedTool({ ...TOOL, rounds: 1 });
        answers([fromTool(2, block(head, "completed", true))]);
        gh.editors = [editorsPage([never(2)])];
        route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

        const result = await run(repo, ["land", "--run", RUN]);

        expect(posted()).toEqual([requestMarker(head)]);
        expect(result.code).toBe(1);
        expect(result.doc).toMatchObject({
          outcome: "refused",
          evidence: { review: { state: "findings" } },
          notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("reports findings")],
        });
        expect(result.doc).not.toHaveProperty("asks");
      });
    });

    it("ends the wait and refuses where the marker alone did not post, with no pending ask", async () => {
      const { slept } = fakeClock();
      const { repo, head } = await seedTool();
      answers([fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(2)])];
      route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

      const result = await run(repo, ["land", "--run", RUN, "--wait", "5"]);

      expect(posted()).toEqual([requestMarker(head)]);
      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review request was not posted to #7 (HTTP 403)", expect.stringContaining("no request on this head yet")] });
      expect(result.doc).not.toHaveProperty("asks");
      expect(slept).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("keeps polling on --wait while the tool works, then lands on its word", async () => {
      fakeClock();
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.routes.set("GET repos/o/r/issues/7/comments", [
        { status: 200, json: [fromRun(1, head), fromTool(2, block(head, "running"))] },
        { status: 200, json: [fromRun(1, head), fromTool(2, block(head))] },
      ]);
      gh.editors = [editorsPage([never(1), editedBy(2, "Bot", "chatgpt-codex-connector")])];

      expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed" });
    });

    it("ends a wait past the verb's budget as asks with a pending line, for the next call", async () => {
      const { slept } = fakeClock();
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head, "running"))]);
      gh.editors = [editorsPage([never(1), never(2)])];

      const result = await run(repo, ["land", "--run", RUN, "--wait", "9"]);

      expect(slept.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(9 * 60_000);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true } });
      expect(kinds()).not.toContain("merge");

      // The person's lines, which `--json` leaves out: the wait is named, and no approval is offered for it.
      const plain = await runInProcess([runCommand], ["run", "land", "--run", RUN], { cwd: repo });
      expect(plain.stdout).toContain("pending: run land again");
      expect(plain.stdout).toContain("review: waiting:");
      expect(plain.stdout).not.toContain("approve with");
    });

    it.each([
      ["a person", "User", "a-person", "last edited by a-person"],
      ["a person holding the bot's bare name", "User", "chatgpt-codex-connector", "last edited by chatgpt-codex-connector"],
    ])("holds a state comment last edited by %s rather than dropping it from the count", async (_name, type, login, words) => {
      const { repo, head } = await seedTool();
      // The tool's other comment holds a block too, and alone it would read clean.
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block("d".repeat(40))), fromTool(3, block(head))]);
      gh.editors = [editorsPage([never(1), editedBy(2, type, login), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(words)], evidence: { review: { state: "silent" } } });
      expect(kinds()).not.toContain("merge");
    });

    it.each([
      ["GraphQL refused", () => (gh.editorsRefused = true)],
      ["a page with errors", () => (gh.editors = [{ errors: [{ message: "denied" }] }])],
      ["a comment missing from the answer", () => (gh.editors = [editorsPage([])])],
      ["paging cut short", () => (gh.editors = [editorsPage([never(2)], { hasNextPage: true, endCursor: "x" }), { errors: [{ message: "denied" }] }])],
    ])("reads an editor it could not read as unknown, never as null, on %s", async (_name, arrange) => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block(head))]);
      arrange();

      const result = await run(repo, ["land", "--run", RUN]);

      // TEST CHANGE, justified (review/50): "last edited by unknown" told a person to look for an edit that never happened.
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("the last editor of its comment did not read")] });
      expect(kinds()).not.toContain("merge");
    });

    it("reads every page of the editors", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      gh.editors = [editorsPage([never(1)], { hasNextPage: true, endCursor: "x" }), editorsPage([never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it.each([
      ["findings", () => "findings", "reports findings"],
      ["no +1 past the wait", () => "no-plus-one", "+1"],
    ])("holds on %s", async (_name, which, words) => {
      const { repo, head } = await seedTool();
      const kind = which();
      answers([fromRun(1, head, minutesAgo(90)), fromTool(2, block(head, "completed", kind === "findings"))], kind === "findings" ? [plusOne] : []);
      gh.editors = [editorsPage([never(1), never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(words)] });
    });

    it("holds for a person when the rounds are spent, naming them", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, "e".repeat(40), minutesAgo(200)), fromRun(2, "f".repeat(40), minutesAgo(100)), fromTool(3, block("f".repeat(40), "completed", true))]);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("2 of 2 review rounds spent")] });
      expect(posted()).toEqual([]);
      expect(head).not.toBe("e".repeat(40));
    });

    it("counts only the run's own request markers, so a stranger's cannot spend a round or stand for a request", async () => {
      const { repo, head } = await seedTool();
      const strangers = [comment(1, "stranger", "User", requestMarker("e".repeat(40))), comment(2, "stranger", "User", requestMarker("f".repeat(40))), comment(3, "stranger", "User", requestMarker(head))];
      answers(strangers);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting" } } });
      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
    });

    it("counts no marker a stranger's text would rejoin into after one strip (review/55)", async () => {
      const { repo, head } = await seedTool();
      const rejoining = (sha: string): string => {
        const whole = requestMarker(sha);
        return `${whole.slice(0, 9)}${whole}${whole.slice(9)}`;
      };
      answers([comment(1, "stranger", "User", rejoining("e".repeat(40))), comment(2, "stranger", "User", rejoining("f".repeat(40))), comment(3, "stranger", "User", rejoining(head))]);
      gh.editors = [editorsPage([never(1), never(2), never(3)])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ evidence: { review: { state: "waiting" } } });
      expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
    });

    it("reads an app's own request markers in REST's spelling, where viewer names the bare login", async () => {
      const { repo, head } = await seedTool();
      gh.threads = [threadsPage([], "stamity-app", "stamity-app")];
      answers([comment(1, "stamity-app[bot]", "Bot", requestMarker(head))]);
      gh.editors = [editorsPage([never(1)])];

      await run(repo, ["land", "--run", RUN]);

      expect(posted()).toEqual([]);
    });

    it("passes a pasted block from a person for nothing", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), comment(2, "a-person", "User", block(head))]);
      gh.editors = [editorsPage([never(1), never(2)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { pending: true }, evidence: { review: { state: "waiting" } } });
    });

    it("reads review-state's review over REST, paged reads naming no other route", async () => {
      const { repo, head } = await seedTool({ login: "reviewer[bot]", request: "please review", clean: "review-state", waitMinutes: 40, rounds: 2 });
      answers([fromRun(1, head)], [], [{ user: { login: "reviewer[bot]" }, commit_id: head, state: "APPROVED" }]);
      gh.editors = [editorsPage([never(1)])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it("refuses when a comment read fails, naming it, and when a list is no list", async () => {
      const { repo } = await seedTool();
      answers([]);
      route("GET repos/o/r/issues/7/comments", { message: "Bad Gateway" }, 502);
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the pull request's comments read answered HTTP 502"] });

      route("GET repos/o/r/issues/7/comments", { message: "not a list" });
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the pull request's comments read did not read"] });
    });

    it("refuses past the pages it reads, so a comment past the last page cannot go unseen", async () => {
      const { repo } = await seedTool();
      answers(Array.from({ length: 100 }, (_, index) => comment(index + 1, "someone", "User", "text")));

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("more than 1000 entries")] });
    });

    it("asks, naming every leg, where the legs disagree, and judges nothing on the first leg's tool", async () => {
      const { repo, head } = await seedTool();
      answers([fromRun(1, head), fromTool(2, block(head))]);
      const other = { ...TOOL, login: "another-reviewer[bot]" };
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { reviewTool: other } })}\n`);

      const result = await run(repo, ["land", "--run", RUN]);

      // TEST CHANGE, justified (review/51): the ask also says the tool's word was not read, since no review is read here.
      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: [expect.stringMatching(/^the legs disagree on autonomy\.reviewTool, and no leg wins: the default branch's manifest, the manifest committed at `HEAD`, the manifest on disk; the review tool's word was not read$/)] },
        evidence: { review: null },
      });
      expect(kinds().filter((kind) => kind.includes("issues/7") || kind === "editors")).toEqual([]);
    });

    it("asks, naming the legs, where they differ on the request alone", async () => {
      const { repo } = await seedTool();
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { reviewTool: { ...TOOL, request: "@codex look away" } } })}\n`);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [expect.stringContaining("the legs disagree on autonomy.reviewTool")] } });
    });
  });

  describe("the tool's own threads (build/29)", () => {
    const LOGIN = "chatgpt-codex-connector[bot]";
    const BARE = "chatgpt-codex-connector";
    const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
    const block = (sha: string, status = "completed", findings = false): string =>
      `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: sha, has_any_findings: findings, has_unresolved_findings: findings, status } })} -->`;
    const minutesAgo = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();
    const comment = (id: number, login: string, type: string, body: string, createdAt = minutesAgo(5)): unknown => ({ id, user: { login, type }, body, created_at: createdAt });
    const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
    const plusOne = { user: { login: LOGIN, type: "User" }, content: "+1" };
    /** A thread with GitHub's id on it; the first comment is the tool's, unless `authors` name others after it. */
    const named = (id: string, ...authors: [string, string][]): object => ({ ...(thread(false, null, ...authors) as object), id });
    const fromTool = (id: string, ...replies: [string, string][]): object => named(id, ["Bot", BARE], ...replies);
    const closed = (id: string): object => ({ ...(thread(true, "runner", ["Bot", BARE]) as object), id });

    /** A pull request the tool reads clean on, the run's request and the tool's block both on the head. */
    const seedClean = async (tool: Record<string, unknown> = TOOL): Promise<Seeded> => {
      const manifest = `${JSON.stringify({ version: 1, autonomy: { reviewTool: tool } })}\n`;
      const seeded = await seed({ manifest });
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(manifest).toString("base64"), encoding: "base64" });
      route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
      route("GET repos/o/r/issues/7/comments", [comment(1, "runner", "User", `@codex review\n\n${requestMarker(seeded.head)}`), comment(2, LOGIN, "Bot", block(seeded.head))]);
      route("GET repos/o/r/issues/7/reactions", [plusOne]);
      route("GET repos/o/r/pulls/7/reviews", []);
      gh.editors = [editorsPage([never(1), never(2)])];
      return seeded;
    };
    const resolved = (): unknown[] => gh.calls.filter((call) => call.kind === "resolve").map((call) => call.body);

    it("resolves the tool's own thread on its clean word, just before the act, re-reads the threads, and merges", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" }, threads: { unresolved: 0 } } });
      expect(resolved()).toEqual(["T1"]);
      const order = kinds();
      const at = order.indexOf("resolve");
      expect(order.slice(at).indexOf("threads")).toBeGreaterThan(0);
      expect(order.indexOf("merge")).toBeGreaterThan(at);
      expect(order.lastIndexOf("threads")).toBeLessThan(order.indexOf("PATCH repos/o/r/pulls/7"));
      const patched = gh.calls.find((call) => call.method === "PATCH")?.body as { body: string };
      expect(patched.body).toContain("0 open threads");
      expect(patched.body).toContain("1 of the tool's review threads resolved on its clean word");
    });

    it("leaves a person's thread and a thread a person replied to, and the land stays refused", async () => {
      const { repo } = await seedClean();
      const page = threadsPage([fromTool("T1"), named("T2", ["User", "alice"]), fromTool("T3", ["User", "alice"]), named("T4", ["User", BARE])]);
      gh.threads = [page];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["3 review threads are unresolved"] });
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("resolves the tool's thread the run replied to, since the run's own reply is no person's objection", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1", ["User", "runner"])]), threadsPage([fromTool("T1", ["User", "runner"])]), threadsPage([closed("T1")])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
      expect(resolved()).toEqual(["T1"]);
    });

    /** What a fix round leaves: the run's request and the tool's block both on the earlier head, and nothing yet on this one. */
    const afterAFixRound = (): unknown[] => [comment(1, "runner", "User", `@codex review\n\n${requestMarker("e".repeat(40))}`, minutesAgo(90)), comment(2, LOGIN, "Bot", block("e".repeat(40)))];

    it("counts the tool's thread as a pending gap on a new head, so the request posts, and resolves nothing (skills-prose W-4)", async () => {
      const { repo, head } = await seedClean();
      route("GET repos/o/r/issues/7/comments", afterAFixRound());
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body)).toEqual([`@codex review\n\n${requestMarker(head)}`]);
      expect(result.doc).toMatchObject({ outcome: "asks", asks: { pending: true }, evidence: { review: { state: "waiting" } } });
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("keeps polling on --wait over the tool's thread, then resolves it and lands on the clean word (skills-prose W-4)", async () => {
      fakeClock();
      const { repo, head } = await seedClean();
      const asked = comment(1, "runner", "User", requestMarker(head));
      gh.routes.set("GET repos/o/r/issues/7/comments", [
        { status: 200, json: [asked, comment(2, LOGIN, "Bot", block(head, "running"))] },
        { status: 200, json: [asked, comment(2, LOGIN, "Bot", block(head))] },
      ]);
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];

      expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed" });
      expect(resolved()).toEqual(["T1"]);
    });

    it.each([
      ["a person's thread beside it", () => [fromTool("T1"), named("T2", ["User", "alice"])]],
      ["a person's reply in the tool's thread", () => [fromTool("T1", ["User", "alice"])]],
    ])("keeps %s a plain gap while waiting, so no request goes on a head that cannot land", async (_name, nodes) => {
      const { repo } = await seedClean();
      route("GET repos/o/r/issues/7/comments", afterAFixRound());
      gh.threads = [threadsPage(nodes())];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]), evidence: { review: { state: "waiting" } } });
      expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      expect(resolved()).toEqual([]);
    });

    it.each([
      ["findings", (head: string) => [comment(1, "runner", "User", requestMarker(head)), comment(2, LOGIN, "Bot", block(head, "completed", true))], "findings"],
      ["silence past the wait", (head: string) => [comment(1, "runner", "User", requestMarker(head), minutesAgo(90))], "silent"],
      ["rounds spent", () => [comment(1, "runner", "User", requestMarker("e".repeat(40)), minutesAgo(200)), comment(2, "runner", "User", requestMarker("f".repeat(40)), minutesAgo(100))], "spent"],
    ])("keeps the tool's thread a plain gap and resolves nothing on %s", async (_name, comments, state) => {
      const { repo, head } = await seedClean();
      route("GET repos/o/r/issues/7/comments", comments(head));
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]), evidence: { review: { state } } });
      expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it("resolves nothing on a clean read that names no commit: a reaction proves no exact head", async () => {
      const { repo } = await seedClean({ login: LOGIN, request: "@codex review", clean: "reaction", waitMinutes: 40, rounds: 2 });
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"], evidence: { review: { state: "clean" } } });
      expect(resolved()).toEqual([]);
    });

    it("resolves nothing with no review tool set, the thread a gap as ever", async () => {
      const { repo } = await seed();
      gh.threads = [threadsPage([fromTool("T1")])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
      expect(resolved()).toEqual([]);
    });

    it("resolves nothing on a dry run, and nothing while a person still has to answer an ask", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];
      expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "would-land" });

      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks" });

      expect(resolved()).toEqual([]);
      expect(kinds()).not.toContain("merge");
    });

    it.each<[string, () => void, string]>([
      ["gh failing", () => (gh.resolve = null), "gh failed before GitHub answered"],
      ["a refusal", () => (gh.resolve = { status: 403, json: { message: "Forbidden" } }), "HTTP 403"],
      ["GraphQL errors", () => (gh.resolve = { status: 200, json: { errors: [{ message: "denied" }] } }), "GitHub did not say it closed"],
      ["a thread left open", () => (gh.resolve = { status: 200, json: { data: { resolveReviewThread: { thread: { isResolved: false } } } } }), "GitHub did not say it closed"],
    ])("reads a failed resolve as a gap, on %s, so the land does not merge", async (_name, arrange, words) => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];
      arrange();

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`the tool's review thread T1 was not resolved (${words})`, "1 review thread is unresolved"] });
      expect(kinds()).not.toContain("merge");
    });

    it("trusts the re-read over the resolve's answer: a thread still open there holds the merge", async () => {
      const { repo } = await seedClean();
      gh.threads = [threadsPage([fromTool("T1")])];

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
      expect(resolved()).toEqual(["T1"]);
      expect(kinds()).not.toContain("merge");
    });

    it("holds a thread a person replied to between the last read and the resolve", async () => {
      const { repo } = await seedClean();
      const replied = { ...(thread(true, "runner", ["Bot", BARE], ["User", "alice"]) as object), id: "T1" };
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([replied])];

      // TEST CHANGE, justified: review/120, the reason naming the thread now stands beside the count, whatever other stops there are.
      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", expect.stringContaining("review thread T1")] });
      expect(kinds()).not.toContain("merge");
    });

    it("holds a thread two people wrote in that closed between the last read and the resolve, since no one was shown that ask", async () => {
      const { repo } = await seedClean();
      const other = { ...(thread(true, "bob", ["User", "alice"], ["User", "bob"]) as object), id: "T2" };
      gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1"), other])];

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("closed review threads")] });
      expect(resolved()).toEqual(["T1"]);
      expect(kinds()).not.toContain("merge");
    });

    describe("under a rule requiring resolved conversations (review/68)", () => {
      const HOLDS = "mergeable_state is blocked: an admin merge past the branch's rules asks";
      /** Where such a rule leaves a clean head: the pull request reads `blocked` while the tool's thread stays open. */
      const seedHeld = async (): Promise<Seeded> => {
        const seeded = await seedClean();
        route("GET repos/o/r/pulls/7", pull(seeded.head, { mergeable_state: "blocked" }));
        gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];
        return seeded;
      };

      it("resolves before it judges the merge state, reads the pull request again, and merges", async () => {
        const { repo } = await seedHeld();
        gh.afterResolve = [{ mergeable_state: "clean" }];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "landed", evidence: { mergeableState: "clean", threads: { unresolved: 0 } } });
        expect(resolved()).toEqual(["T1"]);
        const order = kinds();
        expect(order.lastIndexOf("GET repos/o/r/pulls/7")).toBeGreaterThan(order.indexOf("resolve"));
        expect(order.lastIndexOf("GET repos/o/r/pulls/7")).toBeLessThan(order.indexOf("PATCH repos/o/r/pulls/7"));
        expect(order.indexOf("merge")).toBeGreaterThan(order.indexOf("resolve"));
      });

      it("reads the pull request again until GitHub has moved the merge state", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();
        gh.afterResolve = [{ mergeable_state: "blocked" }, { mergeable_state: "unknown" }, { mergeable_state: "clean" }];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", evidence: { mergeableState: "clean" } });
        expect(slept).toEqual([5_000, 5_000]);
      });

      it("refuses where `blocked` outlasts the resolve, so another rule holds it, with the threads closed and no merge", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [HOLDS], evidence: { mergeableState: "blocked" } });
        expect(resolved()).toEqual(["T1"]);
        expect(slept).toEqual(Array.from({ length: 12 }, () => 5_000));
        expect(kinds()).not.toContain("merge");
      });

      it("refuses where the read after the resolve finds another head", async () => {
        const { repo, head } = await seedHeld();
        const moved = "e".repeat(40);
        gh.afterResolve = [{ mergeable_state: "clean", head: { ref: RUN_BRANCH, sha: moved, repo: { full_name: "o/r" } } }];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${moved} is not HEAD ${head}`] });
        expect(kinds()).not.toContain("merge");
      });

      it("reads a failed resolve as a gap and waits on no merge state after it", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([fromTool("T1")])];
        gh.resolve = { status: 403, json: { message: "Forbidden" } };

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the tool's review thread T1 was not resolved (HTTP 403)", "1 review thread is unresolved", HOLDS] });
        expect(slept).toEqual([]);
        expect(kinds()).not.toContain("merge");
      });

      it("keeps `blocked` a plain gap beside a person's thread, and resolves nothing", async () => {
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([fromTool("T1"), named("T2", ["User", "alice"])])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });
        expect(resolved()).toEqual([]);
        expect(kinds()).not.toContain("merge");
      });

      it("keeps `blocked` a plain gap with none of the tool's threads open: nothing is left to resolve", async () => {
        const { repo } = await seedHeld();
        gh.threads = [threadsPage([])];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [HOLDS] });
      });

      it("resolves nothing on a dry run, and says the merge state waits on the resolve", async () => {
        const { repo } = await seedHeld();

        expect((await run(repo, ["land", "--run", RUN, "--dry-run"])).doc).toMatchObject({ outcome: "would-land", evidence: { mergeableState: "blocked" } });

        gh.threads = [threadsPage([fromTool("T1")])];
        const plain = await runInProcess([runCommand], ["run", "land", "--run", RUN, "--dry-run"], { cwd: repo });
        expect(plain.stdout).toContain("threads: would resolve 1 of the tool's own, and only then is the merge state judged");
        expect(resolved()).toEqual([]);
      });

      it("resolves nothing while a person still has to answer an ask", async () => {
        const { repo } = await seedHeld();
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks" });
        expect(resolved()).toEqual([]);
      });

      it("posts the request on a new head that reads `blocked`, so the tool can still read clean", async () => {
        const { repo, head } = await seedHeld();
        route("GET repos/o/r/issues/7/comments", afterAFixRound());
        gh.threads = [threadsPage([fromTool("T1")])];

        const result = await run(repo, ["land", "--run", RUN]);

        expect(gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body)).toEqual([`@codex review\n\n${requestMarker(head)}`]);
        expect(result.doc).toMatchObject({
          outcome: "asks",
          asks: { pending: true, reasons: expect.arrayContaining(["mergeable_state is blocked, and the tool's open review threads may be what holds it"]) },
          evidence: { review: { state: "waiting" } },
        });
        expect(resolved()).toEqual([]);
      });

      it("keeps a person's thread a plain gap on a new head, so no request goes on a head that cannot land", async () => {
        const { repo } = await seedHeld();
        route("GET repos/o/r/issues/7/comments", afterAFixRound());
        gh.threads = [threadsPage([fromTool("T1"), named("T2", ["User", "alice"])])];

        expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: expect.arrayContaining(["1 review thread is unresolved"]) });
        expect(gh.calls.filter((call) => call.method === "POST")).toEqual([]);
      });

      it("runs the whole loop on --wait: the request, the tool's clean word, the resolve, the read and the merge", async () => {
        fakeClock();
        const { repo, head } = await seedHeld();
        const asked = comment(3, "runner", "User", requestMarker(head));
        const [earlier] = afterAFixRound();
        gh.routes.set("GET repos/o/r/issues/7/comments", [
          { status: 200, json: afterAFixRound() },
          { status: 200, json: [...afterAFixRound(), asked] },
          { status: 200, json: [earlier, comment(2, LOGIN, "Bot", block(head)), asked] },
        ]);
        gh.editors = [editorsPage([never(1), never(2), never(3)])];
        gh.threads = [threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([fromTool("T1")]), threadsPage([closed("T1")])];
        gh.afterResolve = [{ mergeable_state: "clean" }];

        expect((await run(repo, ["land", "--run", RUN, "--wait", "2"])).doc).toMatchObject({ outcome: "landed", notDone: [], evidence: { mergeableState: "clean" } });
        expect(resolved()).toEqual(["T1"]);
      });
    });
  });

  describe("a change that loosens a key (REQ-FLOW-138)", () => {
    it("names the key beside the path", async () => {
      const { repo, remote } = await seed();
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64"), encoding: "base64" });
      await writeFile(join(repo, ".stamity/manifest.json"), `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["release"], adminRuleProof: true } })}\n`);
      git(repo, ["add", "-A"]);
      git(repo, ["commit", "-q", "-m", "loosen"]);
      git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(repo, ["rev-parse", "HEAD"]);
      route("GET repos/o/r/pulls/7", pull(head));
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".stamity/manifest.json" }, { filename: `${RUN_DIR}/record.md` }]);

      const result = await run(repo, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({
        outcome: "asks",
        asks: { reasons: ["the diff touches paths that define the evidence: .stamity/manifest.json", "the head's manifest loosens autonomy.adminRuleProof against main's"] },
      });
    });

    it("names nothing where the pull request leaves the manifest alone, whatever the default branch tightened since (review/45)", async () => {
      const { repo } = await seed();
      const tightened = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["release/*"] } })}\n`;
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from(tightened).toString("base64"), encoding: "base64" });

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });
    });

    it("refuses a default-branch read that answers neither 200 nor 404, through the same catch", async () => {
      const { repo } = await seed();
      route("GET repos/o/r/contents/.stamity/manifest.json", { message: "Bad Gateway" }, 502);

      expect((await run(repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
    });
  });

  describe("a verb started below the top reads the repository's setting too (REQ-FLOW-132, REQ-FLOW-138)", () => {
    const PROJECT = "apps/web";
    const MANIFEST = ".stamity/manifest.json";
    const TOP_READ = `GET repos/o/r/contents/${MANIFEST}`;
    const PROJECT_READ = `GET repos/o/r/contents/${PROJECT}/${MANIFEST}`;
    const PLAIN = '{"version":1}\n';
    const NAMED = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"] } })}\n`;
    const DEPLOYING = "main is named in autonomy.deployingBranches";
    const NO_TOP = `main holds no ${MANIFEST} at the repository's top, so nothing a run cannot write binds this land: a person places one there first`;
    const GREEN = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
    const onGitHub = (text: string): Record<string, string> => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });

    /** The run's record and ledger in the project, committed and pushed as the head; `disk` is a manifest there that no commit holds. */
    async function project(seeded: Seeded, opts: { mode?: "attended" | "unattended"; disk?: string } = {}): Promise<string> {
      const web = join(seeded.repo, PROJECT);
      await put(web, `${RUN_DIR}/record.md`, `# Run ${RUN}\n\nStatus: in progress\nMode: ${opts.mode ?? "attended"}\nBranch: ${RUN_BRANCH}\nBase: ${seeded.base}\n`);
      await put(web, `${RUN_DIR}/ledger.jsonl`, row(`${RUN}/review/1`, "Warning", "fixed"));
      git(seeded.repo, ["add", "-A"]);
      git(seeded.repo, ["commit", "-q", "-m", "the project's own record"]);
      git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
      const head = git(seeded.repo, ["rev-parse", "HEAD"]);
      route("GET repos/o/r/pulls/7", pull(head, { changed_files: 5 }));
      route("GET repos/o/r/pulls/7/files", [
        { filename: "a.txt" },
        { filename: `${RUN_DIR}/record.md` },
        { filename: `${RUN_DIR}/ledger.jsonl` },
        { filename: `${PROJECT}/${RUN_DIR}/record.md` },
        { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
      ]);
      route(`GET repos/o/r/commits/${head}/check-runs`, GREEN);
      // The spy above finds the bare remote beside the verb's cwd.
      await symlink(seeded.remote, join(seeded.repo, "apps", "remote.git"));
      if (opts.disk !== undefined) await put(web, MANIFEST, opts.disk);
      return web;
    }

    /** A passing pre-flight record, written where the verb reads it, under the environment the verb runs in. */
    async function preflightPassed(repo: string): Promise<void> {
      const home = getRoot().path("home");
      await mkdir(home, { recursive: true });
      for (const [key, value] of Object.entries({ HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" })) vi.stubEnv(key, value);
      const place = await gitSurfaceRecordPath(repo);
      const surface = await readRunGitSurface(repo);
      if ("unreadable" in place || "unreadable" in surface) throw new Error("the seed's git surface could not be read");
      await mkdir(dirname(place.path), { recursive: true });
      await writeFile(place.path, `${JSON.stringify(surfaceRecord(surface, randomBytes(16).toString("hex"), new Date().toISOString(), false))}\n`);
    }

    it("asks at the top on what a project the default branch holds names, the top naming nothing", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the same unattended at the top, on a passing pre-flight record", async () => {
      const seeded = await seed({ mode: "unattended", files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await preflightPassed(seeded.repo);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks in a sibling folder on what a project the default branch holds names", async () => {
      const seeded = await seed({ files: { [`apps/api/${MANIFEST}`]: NAMED } });
      route(`GET repos/o/r/contents/apps/api/${MANIFEST}`, onGitHub(NAMED));
      const web = await project(seeded, { disk: PLAIN });

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses a failed read of a project elsewhere, the top's reading well", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(PROJECT_READ, { message: "Bad Gateway" }, 502);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses at the top where the default branch's only setup sits below it", async () => {
      const seeded = await seed({ manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await put(seeded.repo, MANIFEST, PLAIN);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses the same unattended, on a passing pre-flight record", async () => {
      const seeded = await seed({ mode: "unattended", manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(PROJECT_READ, onGitHub(NAMED));
      await put(seeded.repo, MANIFEST, PLAIN);
      await preflightPassed(seeded.repo);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses at the top where the setup is only the run's own, on its branch and in its work tree", async () => {
      const seeded = await seed();
      route(TOP_READ, { message: "Not Found" }, 404);

      expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the top's default branch manifest, a folder with no manifest there starting the verb", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(NAMED));
      const web = await project(seeded, { disk: PLAIN });

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks the same unattended, on a passing pre-flight record", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(NAMED));
      const web = await project(seeded, { mode: "unattended", disk: PLAIN });
      await preflightPassed(seeded.repo);

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING], act: "pr-merge" }, notDone: [] });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the manifest the top's HEAD alone names", async () => {
      const seeded = await seed({ manifest: NAMED });
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      await writeFile(join(seeded.repo, MANIFEST), PLAIN);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the manifest the top's work tree alone names", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      await writeFile(join(seeded.repo, MANIFEST), NAMED);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("asks on the guard the top alone holds", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      const web = await project(seeded, { disk: PLAIN });
      const guard = buildPersonOnlyGuardScript({ tool: "claude", layout: "claude", autonomy: resolveAutonomy({ autonomy: { deployingBranches: ["main"] } }) });
      await put(seeded.repo, `${CLAUDE_HOOKS_DIR}/${PERSON_ONLY_GUARD_FILE}`, guard);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("names the key a head loosens in the top's manifest", async () => {
      const seeded = await seed();
      route(TOP_READ, onGitHub(PLAIN));
      await writeFile(join(seeded.repo, MANIFEST), `${JSON.stringify({ version: 1, autonomy: { adminRuleProof: true } })}\n`);
      const web = await project(seeded, { disk: PLAIN });
      route("GET repos/o/r/pulls/7/files", [
        { filename: "a.txt" },
        { filename: MANIFEST },
        { filename: `${RUN_DIR}/record.md` },
        { filename: `${RUN_DIR}/ledger.jsonl` },
        { filename: `${PROJECT}/${RUN_DIR}/record.md` },
        { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
      ]);
      route("GET repos/o/r/pulls/7", pull(git(seeded.repo, ["rev-parse", "HEAD"]), { changed_files: 6 }));

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "asks", asks: { reasons: [`the diff touches paths that define the evidence: ${MANIFEST}`, "the head's manifest loosens autonomy.adminRuleProof against main's"] } });
    });

    describe("a head that changes another setup's manifest", () => {
      const OTHER = `apps/api/${MANIFEST}`;
      const HELD = `the diff touches paths that define the evidence: ${OTHER}`;
      const LOOSENED = "the head's manifest loosens autonomy.deployingBranches against main's";

      /** `main` holding `held` at {@link OTHER}, as GitHub answers it. */
      async function holding(held: string): Promise<Seeded> {
        const seeded = await seed({ files: { [OTHER]: held } });
        route(`GET repos/o/r/contents/${OTHER}`, onGitHub(held));
        return seeded;
      }

      /** What the seed's head changed in the work tree, committed and pushed as the head, the pull request naming {@link OTHER} beside the seed's files. */
      function asTheHead(seeded: Seeded): void {
        git(seeded.repo, ["add", "-A"]);
        git(seeded.repo, ["commit", "-q", "-m", "the change"]);
        git(seeded.repo, ["push", "-q", seeded.remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
        const head = git(seeded.repo, ["rev-parse", "HEAD"]);
        route("GET repos/o/r/pulls/7", pull(head, { changed_files: 4 }));
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: OTHER }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
        route(`GET repos/o/r/commits/${head}/check-runs`, GREEN);
      }

      it("names the key it takes out, beside the path, started at the top", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), PLAIN);
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names the key its deletion takes, beside the path, started at the top", async () => {
        const seeded = await holding(NAMED);
        await rm(join(seeded.repo, OTHER));
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names the key it takes out, started in a sibling folder", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), PLAIN);
        const web = await project(seeded, { disk: PLAIN });
        route("GET repos/o/r/pulls/7", pull(git(seeded.repo, ["rev-parse", "HEAD"]), { changed_files: 6 }));
        route("GET repos/o/r/pulls/7/files", [
          { filename: "a.txt" },
          { filename: OTHER },
          { filename: `${RUN_DIR}/record.md` },
          { filename: `${RUN_DIR}/ledger.jsonl` },
          { filename: `${PROJECT}/${RUN_DIR}/record.md` },
          { filename: `${PROJECT}/${RUN_DIR}/ledger.jsonl` },
        ]);

        expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, LOOSENED, DEPLOYING] }, notDone: [] });
        expect(kinds()).not.toContain("merge");
      });

      it("names no key for a change that loosens none, as a sync's", async () => {
        const seeded = await holding(NAMED);
        await writeFile(join(seeded.repo, OTHER), `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"] }, ledger: [] })}\n`);
        asTheHead(seeded);

        expect((await run(seeded.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [HELD, DEPLOYING] }, notDone: [] });
      });
    });

    it("lands a project the default branch holds, where it and the top agree, reading both", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, onGitHub(PLAIN));
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed", notDone: [] });
      expect(kinds()).toEqual(expect.arrayContaining([TOP_READ, PROJECT_READ]));
    });

    it("refuses a project the default branch holds where the top holds no setup at all, which waits for a person to place one", async () => {
      const seeded = await seed({ manifest: null, files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("keeps the project's own setting, which tightens the top's", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: NAMED } });
      route(TOP_READ, onGitHub(PLAIN));
      route(PROJECT_READ, onGitHub(NAMED));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("lets no project below the top loosen the top's setting", async () => {
      const seeded = await seed({ manifest: NAMED, files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, onGitHub(NAMED));
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "asks", asks: { reasons: [DEPLOYING] } });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses where the default branch holds no manifest for the top or the project, so the run's own files would be the whole setting", async () => {
      const seeded = await seed({ manifest: null });
      const web = await project(seeded, { disk: PLAIN });

      const result = await run(web, ["land", "--run", RUN]);

      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [NO_TOP] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses a failed read of the top's manifest, the project's reading well", async () => {
      const seeded = await seed({ files: { [`${PROJECT}/${MANIFEST}`]: PLAIN } });
      route(TOP_READ, { message: "Bad Gateway" }, 502);
      route(PROJECT_READ, onGitHub(PLAIN));
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] });
      expect(kinds()).not.toContain("merge");
    });

    it("refuses as no setup found where no leg holds a manifest, at the top or below it", async () => {
      const seeded = await seed({ manifest: null });
      const web = await project(seeded);

      expect((await run(web, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringMatching(/^no setup found/)] });
    });
  });

  it("takes --title, --paths, --wait past 9 and --method with --fast-forward as usage errors", async () => {
    const { repo } = await seed();
    for (const argv of [["--title", "t"], ["--paths", "a.txt"], ["--wait", "10"], ["--fast-forward", "--method", "squash"]]) {
      // oxlint-disable-next-line no-await-in-loop -- the cases share one repository and the process environment the runner stubs
      expect((await run(repo, ["land", "--run", RUN, ...argv])).code, argv.join(" ")).toBe(2);
    }
    expect(gh.calls).toEqual([]);
  });

  describe("job mode (REQ-FLOW-157)", () => {
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

    // d-run-cleanup (REQ-FLOW-176): the clean-up is a session's; a job's fresh checkout started nothing to remove.
    it("cleans up nothing when it lands, a lane the run's receipt tags included", async () => {
      const { repo } = await seedJob();
      const lane = await taggedLane(repo, "p-job", RUN);

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed" });
      expect(result.doc).not.toHaveProperty("cleanup");
      expect(existsSync(lane)).toBe(true);
      expect(git(repo, ["branch", "--list", RUN_BRANCH])).toContain(RUN_BRANCH);
    });

    it("merges on the evidence with the job's token as viewer, reading nothing a session left under the git directory", async () => {
      const { repo, head } = await seedJob();
      const before = await record(repo);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ subcommand: "land", run: RUN, outcome: "landed", pr: { number: 7, head }, notDone: [] });
      expect(gh.calls.find((call) => call.kind === "merge")?.body).toMatchObject({ number: 7, sha: head });
      expect(writes()).toEqual(["PATCH repos/o/r/pulls/7", "merge"]);
      expect(gh.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ body: expect.stringContaining("evidence checked at") });
      // No `land:` line: the body's evidence line stands, and a job's work tree is gone when it ends.
      expect(await record(repo)).toBe(before);
    });

    it("reads origin's tip from REST, and refuses a branch that moved past the head", async () => {
      const { repo, head } = await seedJob();
      route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: "f".repeat(40) } });
      const result = await run(repo, LANDS);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`origin's ${RUN_BRANCH} is at ${"f".repeat(40)}, not HEAD ${head}`] });
      expect(writes()).toEqual([]);
    });

    it("keeps a thread a person opened and the run closed unresolved under a bot viewer: a hold on the status line, never a red job", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], BOT)];

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } }, notDone: ["1 review thread is unresolved"] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("merge waits on: 1 review thread is unresolved");
    });

    it("counts a thread the same whichever account the job's token is", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], "stamity-land-app")];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved"] });

      // A thread a person closed is theirs to close, in the job as at the run's own land.
      gh.threads = [threadsPage([thread(true, "alice", ["User", "alice"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("holds on a closed thread someone beside its closer wrote in: a status line, a green job, and a person merges by hand", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([{ ...(thread(true, "bob", ["User", "alice"], ["User", "bob"]) as object), id: "T1" }], BOT)];

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "asks", evidence: { threads: { unresolved: 0 } } });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("merge waits on: a person decides on closed review threads");
    });

    it("counts a resolver GitHub names as null over a person's comment, in a job and in a session with the job off (review/119)", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, null, ["User", "alice"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
      expect(kinds()).not.toContain("merge");

      const session = await seed();
      gh.threads = [threadsPage([thread(true, null, ["User", "alice"])])];
      expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
      expect(kinds()).not.toContain("merge");
    });

    it("leaves a thread only bots wrote in, whoever closed it: a null resolver holds a person's comment, and no bot closing its own", async () => {
      const session = await seed();
      gh.threads = [threadsPage([thread(true, null, ["Bot", "review-bot"])])];
      expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "landed" });

      const { repo } = await seedJob();
      gh.threads = [threadsPage([thread(true, null, ["Bot", "review-bot"])], BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("holds the author against the run's login, not the job's viewer", async () => {
      const { repo } = await seedJob();
      gh.threads = [threadsPage([], BOT, BOT)];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7 was opened by ${BOT}, not by the run's login runner`] });

      gh.threads = [threadsPage([], BOT, "mallory")];
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 was opened by mallory, not by the run's login runner"] });
      expect(writes()).toEqual([]);
    });

    it.each([
      ["open", { status: "in progress" }, "does not read Status: closed"],
      ["empty", { status: "" }, "does not read Status: closed"],
      ["another word", { status: "merged 2026-11-04" }, "does not read Status: closed"],
    ])("refuses a run whose record reads %s, exit 0 and writing nothing: the run is still its own", async (_name, opts, reason) => {
      const { repo } = await seedJob(opts);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(reason)] });
      expect(writes()).toEqual([]);
    });

    it.each([
      ["blocked", { status: "closed 2026-11-04 (blocked: the plan is unclear)" }, "reads (blocked:"],
      ["refused in the record", { extra: "\n## Refused\n\n- the pre-flight refused\n\n## Log\n\n" }, "the record at"],
      ["refused in the morning list", { morning: "# Morning list\n\n## Refused\n\n- pre-flight exited 1\n\n## Decisions\n\nnone\n" }, "the morning list at"],
      ["no PR line", { lines: "Login: runner\n" }, "on a PR: line"],
      ["another pull request's line", { lines: "PR: 8\nLogin: runner\n" }, "on a PR: line"],
      ["no Login line", { lines: "PR: 7\n" }, "names no Login:"],
    ])("holds a run whose record reads %s: exit 0, no merge, and the reason on the status line", async (_name, opts, reason) => {
      const { repo } = await seedJob(opts);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining(reason)] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain(reason);
    });

    it("reads an empty ## Refused section as no row, and the line a later end wrote as the one that stands", async () => {
      const { repo } = await seedJob({ morning: "# Morning list\n\n## Refused\n\nnone\n\n## Decisions\n\n- a row\n", lines: "PR: 6\nLogin: gone\nPR: 7\nLogin: runner\n" });
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("reads the record at the head, not the work tree's copy", async () => {
      const { repo } = await seedJob({ status: "in progress" });
      await writeFile(join(repo, RUN_DIR, "record.md"), (await record(repo)).replace("Status: in progress", "Status: closed 2026-11-04"));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("does not read Status: closed")] });
    });

    it("exits 0 naming a running check on the status line, since one outside the watched workflows sends no event, and lands on the next start", async () => {
      const { repo, head } = await seedJob();
      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });

      const waiting = await run(repo, LANDS);

      expect(waiting.code).toBe(0);
      expect(waiting.doc).toMatchObject({ outcome: "pending", notDone: [`required check test is still running on ${head}`] });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain(`merge waits on: required check test is still running on ${head}`);

      route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    describe("the review tool, which a cloud run cannot ask (W-2)", () => {
      const LOGIN = "chatgpt-codex-connector[bot]";
      const TOOL = { login: LOGIN, request: "@codex review", clean: "state-comment", stateMarker: "codex-review-state:v1", stateSection: "code_review", waitMinutes: 40, rounds: 2 };
      const JOB_TOOL = `${JSON.stringify({ version: 1, autonomy: { reviewTool: TOOL, landJob: { workflows: ["CI"] } } })}\n`;
      /** The clock {@link fakeClock} starts from, so a comment reads as made when the job started. */
      const STARTED = new Date(1_000_000).toISOString();
      const comment = (id: number, login: string, type: string, body: string): unknown => ({ id, user: { login, type }, body, created_at: STARTED });
      const asked = (id: number, head: string, login = "github-actions[bot]"): unknown => comment(id, login, "Bot", `@codex review\n\n${requestMarker(head)}`);
      const clean = (id: number, head: string): unknown =>
        comment(id, LOGIN, "Bot", `<!-- codex-review-state:v1 ${JSON.stringify({ code_review: { commit_sha: head, has_any_findings: false, has_unresolved_findings: false, status: "completed" } })} -->`);
      const never = (id: number): unknown => ({ databaseId: id, lastEditedAt: null, editor: null });
      const posted = (): string[] => gh.calls.filter((call) => call.method === "POST").map((call) => (call.body as { body: string }).body);

      function answers(reads: unknown[][], reactions: unknown[] = []): void {
        route("POST repos/o/r/issues/7/comments", { id: 900 }, 201);
        route("GET repos/o/r/pulls/7/reviews", []);
        route("GET repos/o/r/issues/7/reactions", reactions);
        gh.routes.set("GET repos/o/r/issues/7/comments", reads.map((json) => ({ status: 200, json })));
        gh.editors = [editorsPage([never(1), never(2), never(3)])];
      }

      it("posts the request itself, once, its own marker counts, and the wait runs out to a hold the status line shows", async () => {
        const { slept } = fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[], [asked(1, head)]]);

        const result = await run(repo, LANDS);

        expect(posted()).toEqual([`@codex review\n\n${requestMarker(head)}`]);
        // Every two minutes: a wait at the verb's 30 s would spend most of GITHUB_TOKEN's hourly allowance.
        expect(new Set(slept)).toEqual(new Set([120_000]));
        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "refused", evidence: { review: { state: "silent" } }, notDone: [expect.stringContaining("within 40 minutes")] });
        const body = (gh.calls.find((call) => call.method === "PATCH")?.body as { body: string } | undefined)?.body;
        expect(body).toMatch(new RegExp(`merge waits on: ${LOGIN.replace(/[[\]]/g, "\\$&")} gave .* within 40 minutes\\n\\n${MARKER}$`));
        expect(kinds()).not.toContain("merge");
      });

      it("lands on the tool's clean word while it waits, a viewer spelled with [bot] reading the same", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        gh.threads = [threadsPage([], "github-actions[bot]")];
        answers([[], [asked(1, head)], [asked(1, head)], [asked(1, head), clean(2, head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "landed", evidence: { review: { state: "clean" } } });
        expect(posted()).toHaveLength(1);
      });

      it("stops at once where the request does not post, naming that on the status line, since no marker means the wait can never end", async () => {
        const { slept } = fakeClock();
        const { repo } = await seedJob({ manifest: JOB_TOOL });
        answers([[]]);
        route("POST repos/o/r/issues/7/comments", { message: "Forbidden" }, 403);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "pending" });
        expect(slept).toEqual([]);
        expect(lastBody()).toContain("the review request was not posted to #7 (HTTP 403)");
      });

      describe("a person who joins a tool's thread (W-1 of the security lens)", () => {
        const BARE = "chatgpt-codex-connector";
        const open = (...authors: [string, string][]): object => ({ ...(thread(false, null, ["Bot", BARE], ...authors) as object), id: "T1" });
        const closedBy = (who: string | null, ...authors: [string, string][]): object => ({ ...(thread(true, who, ["Bot", BARE], ...authors) as object), id: "T1" });
        /** What the status line tells a person to do about a thread GitHub shows as resolved (review/120). */
        const REMEDY = "a person reopens it and closes it";

        async function cleanJob(): Promise<Seeded> {
          const seeded = await seedJob({ manifest: JOB_TOOL });
          answers([[asked(1, seeded.head), clean(2, seeded.head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);
          return seeded;
        }

        it("stops the land when the re-read after the resolve shows the person's comment, the job's own token having closed it", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused" });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("merge waits on: 1 review thread is unresolved");
          expect(lastBody()).toContain("review thread T1");
          expect(lastBody()).toContain(REMEDY);
        });

        it("names the thread and the remedy beside any other stop (review/120)", async () => {
          const { repo } = await cleanJob();
          gh.resolve = { status: 403, json: { message: "Forbidden" } };
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];

          await run(repo, LANDS);

          expect(lastBody()).toContain("was not resolved (HTTP 403)");
          expect(lastBody()).toContain(REMEDY);
        });

        it("says the threads did not read, and names nobody, where the re-read after the resolve fails", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), { errors: [{ message: "Something went wrong" }] }];

          const result = await run(repo, LANDS);

          // This read fails into a decision: it ends as `Held`, leaves `jobFailed` false, and so exits 0 with its status line.
          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["the review threads could not be read"] });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("merge waits on: the review threads could not be read");
          expect(lastBody()).not.toContain("someone else wrote");
        });

        it("stops it whoever closed the thread", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open()], BOT), threadsPage([open()], BOT), threadsPage([closedBy("alice", ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("T1");
        });

        it("goes on where only the tool and the run's own login wrote there", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([open(["User", "runner"])], BOT), threadsPage([open(["User", "runner"])], BOT), threadsPage([closedBy(BOT, ["User", "runner"])], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        });

        it("does not forget it: a later job, and a session's land, count the thread the job closed over a person", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(BOT, ["User", "alice"])], BOT)];
          // TEST CHANGE, justified: review/120, GitHub shows this thread resolved, so the count alone left a person nothing to act on.
          const stops = ["1 review thread is unresolved", expect.stringContaining("review thread T1")];
          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: stops });
          expect(lastBody()).toContain(REMEDY);

          const session = await seed({ manifest: JOB_TOOL });
          answers([[asked(1, session.head, "runner"), clean(2, session.head)]], [{ user: { login: LOGIN, type: "User" }, content: "+1" }]);
          gh.threads = [threadsPage([closedBy("github-actions", ["User", "alice"])])];
          expect((await run(session.repo, ["land", "--run", RUN])).doc).toMatchObject({ outcome: "refused", notDone: stops });
          expect(lastBody()).toContain(REMEDY);
        });

        it("holds the next start where the job's own close reads null, and names the thread (review/119)", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(null, ["User", "alice"])], BOT)];

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
          expect(kinds()).not.toContain("merge");
          expect(lastBody()).toContain("review thread T1");
          expect(lastBody()).toContain(REMEDY);
        });

        it("reads a null resolver over a thread not read whole as a person's comment", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([{ ...closedBy(null), comments: { totalCount: 101, nodes: [{ author: { __typename: "Bot", login: BARE } }] } }], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", evidence: { threads: { unresolved: 1 } } });
          expect(kinds()).not.toContain("merge");
        });

        it("goes on past a null resolver where only the tool and the run's own login wrote there", async () => {
          const { repo } = await cleanJob();
          gh.threads = [threadsPage([closedBy(null, ["User", "runner"])], BOT)];

          expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        });
      });

      it("counts a marker from the run's login, and asks nothing more", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[asked(1, head, "runner")]]);

        await run(repo, LANDS);

        expect(posted()).toEqual([]);
      });

      it("counts a marker from whatever login the job's token proves to be", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        gh.threads = [threadsPage([], "stamity-land-app")];
        answers([[asked(1, head, "stamity-land-app[bot]")]]);

        await run(repo, LANDS);

        expect(posted()).toEqual([]);
      });

      it("stops waiting on a draft whose head moved, so the job for the new head does not queue behind a dead wait", async () => {
        const { slept } = fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        answers([[asked(1, head)]]);
        const draft = pull(head, { draft: true, mergeable_state: "draft" });
        gh.routes.set("GET repos/o/r/pulls/7", [draft, draft, pull("c".repeat(40), { draft: true, mergeable_state: "draft" })].map((json) => ({ status: 200, json })));

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`pull request #7's head ${"c".repeat(40)} is not HEAD ${head}`] });
        expect(slept).toHaveLength(1);
        expect(writes()).toEqual([]);
      });

      it("counts no one else's marker: a stranger's neither stands for a request nor spends a round", async () => {
        fakeClock();
        const { repo, head } = await seedJob({ manifest: JOB_TOOL });
        const stranger = comment(1, "mallory", "User", requestMarker(head));
        answers([[stranger], [stranger, asked(2, head)]]);

        const result = await run(repo, LANDS);

        expect(posted()).toHaveLength(1);
        expect(result.doc).toMatchObject({ evidence: { review: { state: "silent" } } });
      });

      it("reads the job's marker at a session's land where landJob is on, and not where it is off", async () => {
        const on = await seed({ manifest: JOB_TOOL });
        answers([[asked(1, on.head)]]);
        await run(on.repo, ["land", "--run", RUN]);
        expect(posted()).toEqual([]);

        gh.calls.length = 0;
        const off = await seed({ manifest: `${JSON.stringify({ version: 1, autonomy: { reviewTool: TOOL } })}\n` });
        answers([[asked(1, off.head)]]);
        await run(off.repo, ["land", "--run", RUN]);
        expect(posted()).toHaveLength(1);
      });
    });

    it("leaves an attended run's pull request alone, which no end stamped: a person lands it, and a red job would say nothing new", async () => {
      const { repo } = await seedJob({ mode: "attended", lines: "" });

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run" });
      expect(writes()).toEqual([]);
    });

    it("waits out a merge state GitHub has not computed, the one start an event gives", async () => {
      fakeClock();
      const { repo, head } = await seedJob();
      gh.routes.set("GET repos/o/r/pulls/7", [{ status: 200, json: pull(head, { mergeable_state: "unknown" }) }, { status: 200, json: pull(head) }]);
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
    });

    it("marks a draft ready once the rest holds, then merges", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { draft: true, mergeable_state: "draft" }));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
      expect(writes()).toEqual(["ready", "PATCH repos/o/r/pulls/7", "merge"]);
    });

    it("ends already-landed, exit 0, on a pull request merged before it started, whose head branch is gone", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed", merged: true }));
      gh.routes.delete(`GET repos/o/r/branches/${RUN_BRANCH}`);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "already-landed", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("exits 0 and touches nothing on a pull request closed unmerged", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { state: "closed" }));
      expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "not-a-run" } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("exits 1 for a true failure alone: a read GitHub did not answer", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/pulls/7/files", { message: "Bad gateway" }, 502);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(1);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("HTTP 502")] });
      expect(writes()).toEqual([]);
    });

    describe("the merge method, read at run time", () => {
      const merged = (): unknown => (gh.calls.find((call) => call.kind === "merge")?.body as { method?: string } | undefined)?.method;
      const rule = (...methods: string[]): unknown => ({ type: "pull_request", parameters: { allowed_merge_methods: methods } });
      const REQUIRED = { type: "required_status_checks", parameters: { required_status_checks: [{ context: "test" }] } };
      const LINEAR = { type: "required_linear_history" };

      it.each([
        ["a ruleset's one method", [rule("squash")], {}, "squash"],
        ["squash before rebase in a ruleset, in the preferred order", [rule("rebase", "squash")], {}, "squash"],
        ["merge first", [rule("rebase", "squash", "merge")], {}, "merge"],
        // TEST CHANGE, justified: review/82, a method must pass both sides, so this row's old pair (a ruleset's one method, the flag
        // off for it) moved to the holds below, and what stands here is the case it hid: a ruleset listing all three over a squash-only repository.
        ["what both allow, a ruleset's three methods over a squash-only repository", [rule("merge", "squash", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false }, "squash"],
        ["what both allow, the flags narrowing a ruleset's list to rebase", [rule("merge", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true }, "rebase"],
        ["what every ruleset allows, where two apply", [rule("merge", "squash"), rule("squash", "rebase")], {}, "squash"],
        ["the repository's flags with no ruleset's list", [], { allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: true }, "rebase"],
        ["squash from the flags before rebase", [], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: true }, "squash"],
        ["merge where nothing says otherwise", [], {}, "merge"],
        ["squash where a linear-history rule takes merge out, with no flag shown", [LINEAR], {}, "squash"],
        ["squash where a linear-history rule takes merge out, its flag still on", [LINEAR], { allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true }, "squash"],
        ["rebase where a linear-history rule and a ruleset's list leave it alone", [LINEAR, rule("merge", "rebase")], {}, "rebase"],
      ])("takes %s", async (_name, rules, flags, method) => {
        const { repo } = await seedJob();
        route("GET repos/o/r/rules/branches/main", [REQUIRED, ...rules]);
        route("GET repos/o/r", { default_branch: "main", ...flags });

        expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "landed" });
        expect(merged()).toBe(method);
      });

      it.each([
        ["an empty list in a ruleset", [rule()], {}],
        ["two rulesets with nothing in common", [rule("merge"), rule("rebase")], {}],
        ["every flag off", [], { allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: false }],
        ["a ruleset's one method, its flag off", [rule("rebase")], { allow_rebase_merge: false, allow_merge_commit: true }],
        ["a ruleset's list and the flags with nothing in common", [rule("merge", "rebase")], { allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false }],
        ["a linear-history rule over a repository allowing merge commits alone", [LINEAR], { allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false }],
        ["a linear-history rule over a ruleset's list of merge alone", [LINEAR, rule("merge")], {}],
      ])("reads %s as a hold, not a failure", async (_name, rules, flags) => {
        const { repo } = await seedJob();
        route("GET repos/o/r/rules/branches/main", [REQUIRED, ...rules]);
        route("GET repos/o/r", { default_branch: "main", ...flags });

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(kinds()).not.toContain("merge");
        expect(lastBody()).toContain("merge waits on: no merge method");
      });
    });

    it("reads the land job's own failed run on the tip as no red, by name, and still reads any other", async () => {
      const { repo, base } = await seedJob();
      route("GET repos/o/r/rules/branches/main", []);
      const failed = (name: string): unknown => ({ total_count: 1, check_runs: [{ id: 2, name, status: "completed", conclusion: "failure", app: { id: 15368 } }] });

      route(`GET repos/o/r/commits/${base}/check-runs`, failed(LAND_JOB_NAME));
      expect((await run(repo, [...LANDS, "--dry-run"])).doc).toMatchObject({ outcome: "would-land", evidence: { defaultBranch: { failing: [] } } });

      route(`GET repos/o/r/commits/${base}/check-runs`, failed("build"));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "asks", evidence: { defaultBranch: { failing: ["build"] } } });
    });

    it("exits 0 and touches nothing on a pull request no run opened", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: "A person's change." }));

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    // REQ-FLOW-168: Claude's cloud added "Generated by Claude Code" after the marker on 2026-11-06, and the job answered
    // not-a-run. The run is now found before that footer, and the body it writes ends with the one marker again.
    it("lands a run whose client added a footer after the marker, and writes the body with one marker, last", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\nGenerated by [Claude Code](https://claude.ai/code)\n` }));

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed", pr: { number: 7 } });
      const body = lastBody() ?? "";
      expect(body).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at \\S+ for ${head}: [^\\n]+\\n\\n${MARKER}$`));
      expect(body.split(MARKER)).toHaveLength(2);
    });

    // REQ-FLOW-168, amended 2026-11-10: Claude's web cloud wrote a rule line and an emphasised generator line after the
    // marker in a real run, and the job answered not-a-run. The run is now found before that footer too.
    it("lands a run whose body ends in Claude's web footer, a rule line and an emphasised generator line", async () => {
      const { repo, head } = await seedJob();
      const footer = "---\n_Generated by [Claude Code](https://claude.ai/code/session_01GPSuhyX3k1SdW3wb9wrvKv)_";
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\n${footer}` }));

      const result = await run(repo, LANDS);

      expect(result.doc).toMatchObject({ outcome: "landed", pr: { number: 7 } });
      const body = lastBody() ?? "";
      expect(body).toMatch(new RegExp(`^The list\\.\\n\\nevidence checked at \\S+ for ${head}: [^\\n]+\\n\\n${MARKER}$`));
      expect(body.split(MARKER)).toHaveLength(2);
    });

    it("exits 0 and touches nothing where a heading follows the run's marker", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\n${MARKER}\n\n## A person's notes` }));

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "not-a-run", pr: { number: 7 } });
      expect(gh.calls.map((call) => call.path)).toEqual(["repos/o/r/pulls/7"]);
    });

    it("refuses a fork's pull request by the same check the run's own land reads", async () => {
      const { repo, head } = await seedJob();
      route("GET repos/o/r/pulls/7", pull(head, { head: { ref: RUN_BRANCH, sha: head, repo: { full_name: "someone/r" } } }));
      expect((await run(repo, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: ["pull request #7 comes from a fork, not o/r"] });
      expect(writes()).toEqual([]);
    });

    it("refuses where a leg of the setting is off, so a head cannot turn the job on for itself", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/contents/.stamity/manifest.json", { content: Buffer.from('{"version":1}\n').toString("base64") });

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("autonomy.landJob is not on in every leg")] });
      expect(writes()).toEqual([PATCHED]);
    });

    it("stops at an ask: no approval reaches a job, so the person's act stays the person's", async () => {
      const { repo } = await seedJob();
      route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "asks" });
      expect(writes()).toEqual([PATCHED]);
      expect(lastBody()).toContain("(a person decides: pr-merge)");
    });

    it("leaves the pull request open when a head pushed meanwhile fails the merge on its sha (409)", async () => {
      const { repo } = await seedJob();
      const before = await record(repo);
      gh.merge = { status: 409, json: { message: "Head branch was modified" } };

      const result = await run(repo, LANDS);

      expect(result.code).toBe(0);
      expect(result.doc).toMatchObject({ outcome: "refused", notDone: [expect.stringContaining("HTTP 409")] });
      expect(await record(repo)).toBe(before);
      // The new head's own job speaks for it: this one adds no line over the evidence it wrote.
      expect(lastBody()).toContain("evidence checked at");
    });

    // REQ-FLOW-157 (1.19.1): GitHub does not apply a body's Closes line to a merge the job's token makes, so the job closes
    // the run's issue itself after its merge, and only one every check names as the run's; else the land stands, and
    // the reason is on Not done: and in one comment on the pull request.
    describe("the run's issue after the job's merge", () => {
      const ISSUE = "repos/o/r/issues/12";
      const READY = { name: "stamity:ready" };
      const GREEN_RUNS = { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] };
      const contractOf = (item: string): string =>
        ["run-contract: 1", `item: "${item}"`, "base: 02e040eb", "acceptance: done", "scope: { in: [src] }", 'answerer: "@maintainer"', ""].join("\n");
      const issueJson = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ number: 12, state: "open", labels: [READY], ...over });
      /** Every read or write of an issue itself, in any repository: a comment on the pull request is not one. */
      const issueCalls = (): string[] => kinds().filter((kind) => /^(?:GET|PATCH) repos\/[^/]+\/[^/]+\/issues\/\d+$/.test(kind));
      const issuePatches = (): string[] => issueCalls().filter((kind) => kind.startsWith("PATCH "));
      const comments = () => gh.calls.filter((call) => call.method === "POST" && call.path === "repos/o/r/issues/7/comments");
      const staysOpen = (reason: string): string => `the run's issue o/r#12 stays open: ${reason}`;
      const commentFor = (reason: string): string => `The land job merged this pull request, and the run's issue o/r#12 stays open: ${reason}. Close it by hand.\n\n${MARKER}`;
      const NO_RIGHT = "closing it answered HTTP 403, so the land workflow's token may lack issues: write; run stamity sync to write it, then close the issue by hand";

      /**
       * The seeded run with a `contract.yml` naming `item` committed at the head, the body's Closes line naming `closes`, and
       * GitHub answering for an open issue #12 labelled `stamity:ready`, its close and the comment.
       */
      async function withIssue(seeded: Seeded, item = "o/r#12", closes = "o/r#12"): Promise<Seeded> {
        const { repo, remote } = seeded;
        await put(repo, `${RUN_DIR}/contract.yml`, contractOf(item));
        git(repo, ["add", "-A"]);
        git(repo, ["commit", "-q", "-m", "contract"]);
        git(repo, ["push", "-q", remote, `HEAD:refs/heads/${RUN_BRANCH}`]);
        const head = git(repo, ["rev-parse", "HEAD"]);
        route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\n\nCloses ${closes}\n\n${MARKER}` }));
        route(`GET repos/o/r/commits/${head}/check-runs`, GREEN_RUNS);
        route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
        route(`GET ${ISSUE}`, issueJson());
        route(`PATCH ${ISSUE}`, { number: 12, state: "closed" });
        route("POST repos/o/r/issues/7/comments", { id: 901 }, 201);
        return { ...seeded, head };
      }

      it("closes the issue the contract and the Closes line name, open and labelled stamity:ready, only after the merge answered", async () => {
        const { repo } = await withIssue(await seedJob());

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: true }, notDone: [] });
        expect(writes()).toEqual([PATCHED, "merge", `PATCH ${ISSUE}`]);
        // The issue's read too comes after the merge: nothing about the issue happens before the merge call answered 200.
        const order = kinds();
        expect(order.indexOf(`GET ${ISSUE}`)).toBeGreaterThan(order.indexOf("merge"));
        expect(gh.calls.find((call) => call.method === "PATCH" && call.path === ISSUE)?.body).toEqual({ state: "closed", state_reason: "completed" });
        // The label stays on: the close sends nothing but the state.
        expect(comments()).toEqual([]);

        const text = await runInProcess([runCommand], ["run", ...LANDS], { cwd: repo });
        expect(text.stdout).toContain("issue: closed o/r#12\n");
      });

      it("keeps the land when the close is refused, naming the right the token may lack in Not done: and in one comment", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`PATCH ${ISSUE}`, { message: "Resource not accessible by integration" }, 403);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false, reason: expect.stringContaining("HTTP 403") }, notDone: [staysOpen(NO_RIGHT)] });
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([commentFor(NO_RIGHT)]);
        expect(writes()).toEqual([PATCHED, "merge", `PATCH ${ISSUE}`, "POST repos/o/r/issues/7/comments"]);
      });

      it("writes nothing to an issue already closed, and says so", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ state: "closed" }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12" }, notDone: [] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toEqual([]);

        const text = await runInProcess([runCommand], ["run", ...LANDS], { cwd: repo });
        expect(text.stdout).toContain("issue: o/r#12 was already closed\n");
      });

      it("reads and closes no issue where the contract's item is in another repository, a Closes line naming it in the body", async () => {
        const { repo } = await withIssue(await seedJob(), "x/y#3", "x/y#3");
        // Both answer as an issue every other check passes, so only the repository check stops a close.
        route("GET repos/x/y/issues/3", issueJson({ number: 3 }));
        route("GET repos/o/r/issues/3", issueJson({ number: 3 }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed" });
        expect(issueCalls()).toEqual([]);
      });

      it("leaves the issue open where the body's Closes line names another issue", async () => {
        const { repo } = await withIssue(await seedJob(), "o/r#12", "o/r#13");
        // #13 answers as an issue every other check passes, so a close by the body's own number would show.
        route("GET repos/o/r/issues/13", issueJson({ number: 13 }));
        route("PATCH repos/o/r/issues/13", { number: 13, state: "closed" });

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("the body's Closes line does not name it")] });
        expect(issuePatches()).toEqual([]);
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([commentFor("the body's Closes line does not name it")]);
      });

      it("leaves it open where GitHub answers the number as a pull request", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ pull_request: { url: "https://api.github.com/repos/o/r/pulls/12" } }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("it is a pull request")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      it("leaves it open where the issue no longer carries stamity:ready", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, issueJson({ labels: [{ name: "bug" }] }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("it no longer carries stamity:ready")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      // edgeCases: any status other than 200 on the read leaves the issue open, whatever the status.
      it("leaves it open where the issue's read answers other than 200", async () => {
        const { repo } = await withIssue(await seedJob());
        route(`GET ${ISSUE}`, { message: "Not Found" }, 404);

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false }, notDone: [staysOpen("its read answered HTTP 404")] });
        expect(issuePatches()).toEqual([]);
        expect(comments()).toHaveLength(1);
      });

      it("touches no issue where the merge answers 409", async () => {
        const { repo } = await withIssue(await seedJob());
        gh.merge = { status: 409, json: { message: "Head branch was modified" } };

        const result = await run(repo, LANDS);

        expect(result.doc).toMatchObject({ outcome: "refused" });
        expect(result.doc).not.toHaveProperty("issue");
        expect(issueCalls()).toEqual([]);
        expect(comments()).toEqual([]);
      });

      it("touches no issue at a session's land, whose merge GitHub applies the Closes line to", async () => {
        const { repo } = await withIssue(await seed());

        const result = await run(repo, ["land", "--run", RUN]);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed" });
        expect(result.doc).not.toHaveProperty("issue");
        expect(issueCalls()).toEqual([]);
        expect(comments()).toEqual([]);
      });

      // Signed off (1.19.1): a body written with CRLF line ends still carries the Closes line the job closes on.
      it("closes the issue where the body's lines end in CRLF", async () => {
        const { repo, head } = await withIssue(await seedJob());
        route("GET repos/o/r/pulls/7", pull(head, { body: `The list.\r\n\r\nCloses o/r#12\r\n\r\n${MARKER}` }));

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: true }, notDone: [] });
        expect(issuePatches()).toEqual([`PATCH ${ISSUE}`]);
        expect(comments()).toEqual([]);
      });

      // Signed off (1.19.1): an item in another repository is left open with its own reason: no issue call, one Not done:
      // line, and the one comment on the pull request.
      it("leaves an item in another repository open with its own reason, in Not done: and in one comment", async () => {
        const { repo } = await withIssue(await seedJob(), "x/y#3", "x/y#3");
        // Both answer as an issue every other check passes, so a read or a close of either would show.
        route("GET repos/x/y/issues/3", issueJson({ number: 3 }));
        route("GET repos/o/r/issues/3", issueJson({ number: 3 }));
        const reason = "it is in another repository";

        const result = await run(repo, LANDS);

        expect(result.code).toBe(0);
        expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "x/y#3", closed: false, reason }, notDone: [`the run's issue x/y#3 stays open: ${reason}`] });
        expect(issueCalls()).toEqual([]);
        expect(comments().map((call) => (call.body as { body: string }).body)).toEqual([
          `The land job merged this pull request, and the run's issue x/y#3 stays open: ${reason}. Close it by hand.\n\n${MARKER}`,
        ]);
      });

      // Signed off (1.19.1): a failure at the issue's read, its close or the comment after the merge never moves the
      // outcome or the exit code; its Not done: line names the failure's class, never its message, which may hold a path.
      describe("a failure after the merge", () => {
        const MACHINE_PATH = "/home/runner/work/_tool/gh/bin/gh";
        const MESSAGE = `spawn ${MACHINE_PATH} ENOENT`;
        const COMMENTS = "POST repos/o/r/issues/7/comments";
        const STEPS = { read: `GET ${ISSUE}`, close: `PATCH ${ISSUE}`, comment: COMMENTS } as const;
        /**
         * An answer that rejects as `gh` does when it fails to start: a code, and a message naming the machine's path.
         * Mock reason: the stand-in's `failing` set rejects with one fixed message that names no path, and this case is
         * about a message that does; a rejected promise as the route makes the stand-in's own `Promise.resolve` hand it back.
         */
        const spawnFailure = (): Answer => {
          const failed = Promise.reject(Object.assign(new Error(MESSAGE), { code: "ENOENT" }));
          // Marked handled here, so the suite reports no stray rejection; the verb's own await still rejects with it.
          failed.catch(() => undefined);
          return failed as unknown as Answer;
        };
        /** A `/` that starts a word: the mark of an absolute path in a line. */
        const ABSOLUTE = /(?:^|[\s("'])\/[^\s/]/;

        it.each([
          ["the read", "thrown", "read", "ENOENT"],
          ["the read", "non-200", "read", "HTTP 500"],
          ["the close", "thrown", "close", "ENOENT"],
          ["the close", "non-200", "close", "HTTP 500"],
          ["the comment", "thrown", "comment", "ENOENT"],
          ["the comment", "non-200", "comment", "HTTP 500"],
        ] as const)("keeps the land and exit 0 where %s fails (%s), naming its class and no path", async (_name, how, step, failureClass) => {
          const { repo } = await withIssue(await seedJob());
          // The comment posts only where the issue is left open, so that step's case leaves it open on the label first.
          if (step === "comment") route(`GET ${ISSUE}`, issueJson({ labels: [{ name: "bug" }] }));
          if (how === "thrown") gh.routes.set(STEPS[step], spawnFailure());
          else route(STEPS[step], { message: "Server Error" }, 500);

          const result = await run(repo, LANDS);

          expect(result.code).toBe(0);
          expect(result.doc).toMatchObject({ outcome: "landed", issue: { ref: "o/r#12", closed: false } });
          const notDone = (result.doc as { notDone: string[] }).notDone;
          // The issue's own line where the read or the close failed; for the comment, the label's line and the comment's.
          expect(notDone).toHaveLength(step === "comment" ? 2 : 1);
          const failed = notDone.at(-1) ?? "";
          expect(failed).toContain(failureClass);
          expect(failed).toContain(step === "comment" ? "was not posted to #7" : "the run's issue o/r#12 stays open: ");
          for (const line of notDone) {
            expect(line).not.toContain(MESSAGE);
            expect(line).not.toContain(MACHINE_PATH);
            expect(line).not.toMatch(ABSOLUTE);
          }
          expect(JSON.stringify(result.doc)).not.toContain(MACHINE_PATH);
          // The close was never sent where the read failed, and the comment was asked for every time the issue stayed open.
          if (step === "read") expect(issuePatches()).toEqual([]);
          expect(comments()).toHaveLength(1);
        });
      });
    });

    it("holds on the status line when GitHub refuses the merge, and fails only where GitHub itself failed", async () => {
      const { repo } = await seedJob();
      gh.merge = { status: 405, json: { message: "Pull Request is not mergeable" } };
      const refused = await run(repo, LANDS);
      expect(refused.code).toBe(0);
      expect(lastBody()).toContain("merge waits on: GitHub refused the merge (HTTP 405)");

      gh.merge = { status: 503, json: { message: "Unavailable" } };
      expect((await run(repo, LANDS)).code).toBe(1);
    });

    describe("what the setting stops, in a job and out of it", () => {
      const TOP_READ = "GET repos/o/r/contents/.stamity/manifest.json";
      const OTHER = "apps/api/.stamity/manifest.json";
      const OTHER_READ = `GET repos/o/r/contents/${OTHER}`;
      const NO_TOP = "main holds no .stamity/manifest.json at the repository's top, so nothing a run cannot write binds this land: a person places one there first";
      const JOB_OFF = "autonomy.landJob is not on in every leg of the setting, so the job does not land here";
      const FILES_READ = "GET repos/o/r/pulls/7/files";
      const onGitHub = (text: string): Record<string, string> => ({ content: Buffer.from(text).toString("base64"), encoding: "base64" });
      const SESSION = ["land", "--run", RUN];
      /** Each way in, what starts it, and the exit a stop gives there: a hold in a job, a refusal in a session. */
      const WAYS_IN = [
        ["a job", (files: Record<string, string>) => seedJob({ files }), LANDS, 0],
        ["a session", (files: Record<string, string>) => seed({ manifest: LAND_ON, files }), SESSION, 1],
      ] as [string, (files: Record<string, string>) => Promise<Seeded>, string[], number][];

      it.each(WAYS_IN)("stops %s where the default branch holds no manifest at the top", async (_way, arrange, args, code) => {
        const { repo } = await arrange({});
        route(TOP_READ, { message: "Not Found" }, 404);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: [NO_TOP] } });
        expect(kinds()).not.toContain("merge");
      });

      it("puts that stop on a job's status line", async () => {
        const { repo } = await seedJob();
        route(TOP_READ, { message: "Not Found" }, 404);

        await run(repo, LANDS);

        expect(writes()).toEqual([PATCHED]);
        expect(lastBody()).toContain("merge waits on: main holds no .stamity/manifest.json");
      });

      it("holds a job with the key off ahead of the reads that can fail", async () => {
        const { repo } = await seedJob();
        route(TOP_READ, onGitHub('{"version":1}\n'));
        route(FILES_READ, { message: "Bad gateway" }, 502);

        expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "refused", notDone: [JOB_OFF] } });
        expect(kinds()).not.toContain(FILES_READ);
      });

      it("leaves a session with the key off to meet that failed read, the key binding only a job", async () => {
        const { repo } = await seed({ manifest: LAND_ON });
        route(TOP_READ, onGitHub('{"version":1}\n'));
        route(FILES_READ, { message: "Bad gateway" }, 502);

        expect(await run(repo, SESSION)).toMatchObject({ code: 1, doc: { outcome: "refused", notDone: ["the changed files read answered HTTP 502"] } });
      });

      it.each(WAYS_IN)("stops %s on a setup elsewhere whose read GitHub answers with a failure", async (_way, arrange, args, code) => {
        const { repo } = await arrange({ [OTHER]: LAND_ON });
        route(OTHER_READ, { message: "Bad gateway" }, 502);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: ["the default branch's manifest read answered HTTP 502"] } });
        expect(kinds()).not.toContain("merge");
      });

      it.each(WAYS_IN)("stops %s on a setup elsewhere whose read GitHub never answers", async (_way, arrange, args, code) => {
        const { repo } = await arrange({ [OTHER]: LAND_ON });
        gh.failing.add(OTHER_READ);

        const result = await run(repo, args);

        expect(result).toMatchObject({ code, doc: { outcome: "refused", notDone: [expect.stringContaining("a read failed before GitHub answered")] } });
        expect(kinds()).not.toContain("merge");
      });

      const ELSEWHERE_JOB = '{"version":1,"autonomy":{"landJob":{"workflows":["Elsewhere"]}}}\n';

      it("holds a job on a setup elsewhere that names another land job, once the list is read", async () => {
        const { repo } = await seedJob({ files: { [OTHER]: ELSEWHERE_JOB } });
        route(OTHER_READ, onGitHub(ELSEWHERE_JOB));

        expect(await run(repo, LANDS)).toMatchObject({ code: 0, doc: { outcome: "refused", notDone: [JOB_OFF] } });
        expect(kinds()).toContain(FILES_READ);
        expect(kinds()).not.toContain("merge");
      });

      it("lands a session past that setup, the key binding only a job", async () => {
        const { repo } = await seed({ manifest: LAND_ON, files: { [OTHER]: ELSEWHERE_JOB } });
        route(OTHER_READ, onGitHub(ELSEWHERE_JOB));

        expect(await run(repo, SESSION)).toMatchObject({ code: 0, doc: { outcome: "landed" } });
      });

      it.each(WAYS_IN)("asks in %s where a setup elsewhere names the default branch as deploying", async (_way, arrange, args, code) => {
        const named = `${JSON.stringify({ version: 1, autonomy: { deployingBranches: ["main"], landJob: { workflows: ["CI"] } } })}\n`;
        const { repo } = await arrange({ [OTHER]: named });
        route(OTHER_READ, onGitHub(named));

        expect(await run(repo, args)).toMatchObject({ code, doc: { outcome: "asks", asks: { reasons: ["main is named in autonomy.deployingBranches"] } } });
        expect(kinds()).not.toContain("merge");
      });
    });

    describe("a hold whose status line does not write (review/121)", () => {
      const WRITES = [
        ["answers a refusal", () => route(PATCHED, { message: "Forbidden" }, 403), "HTTP 403"],
        ["answers a failure", () => route(PATCHED, { message: "Bad gateway" }, 502), "HTTP 502"],
        ["fails before GitHub answers", () => gh.failing.add(PATCHED), "gh failed before GitHub answered"],
      ] as [string, () => void, string][];

      it.each(WRITES)("exits 1 where the write %s, since a green job and no line would hide the hold", async (_name, arrange, words) => {
        const { repo } = await seedJob();
        gh.threads = [threadsPage([thread(true, "runner", ["User", "alice"])], BOT)];
        arrange();

        const result = await run(repo, LANDS);

        expect(result.code).toBe(1);
        expect(result.doc).toMatchObject({ outcome: "refused", notDone: ["1 review thread is unresolved", `why the merge waits was not written into #7's body (${words})`] });
        expect(kinds()).not.toContain("merge");
      });

      it("exits 1 on a hold the run's own record makes", async () => {
        const { repo } = await seedJob({ status: "closed 2026-11-04 (blocked: the plan is unclear)" });
        gh.failing.add(PATCHED);
        expect((await run(repo, LANDS)).code).toBe(1);
      });

      it("exits 1 on a pending job, which no later event may follow", async () => {
        const { repo, head } = await seedJob();
        route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "in_progress", conclusion: null, app: { id: 15368 } }] });
        gh.failing.add(PATCHED);
        expect(await run(repo, LANDS)).toMatchObject({ code: 1, doc: { outcome: "pending" } });
      });

      it("exits 1 on an ask, which no approval reaches in a job", async () => {
        const { repo } = await seedJob();
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: ".github/workflows/ci.yml" }, { filename: "b" }]);
        gh.failing.add(PATCHED);
        expect(await run(repo, LANDS)).toMatchObject({ code: 1, doc: { outcome: "asks" } });
      });
    });

    it("refuses at the command line: an approval, a run, a wait and a fast-forward are a session's", async () => {
      const { repo } = await seedJob();
      const sha = "a".repeat(40);
      for (const argv of [
        ["land", "--job", "--pr", "7", "--approved", sha],
        ["land", "--job", "--pr", "7", "--run", RUN],
        ["land", "--job", "--pr", "7", "--wait", "1"],
        ["land", "--job", "--pr", "7", "--fast-forward"],
        ["land", "--job", "--pr", "7", "--method", "squash"],
        ["land", "--job"],
        ["land", "--job", "--pr"],
        ["land", "--job", "--pr", "seven"],
        ["land", "--run", RUN, "--pr", "7"],
        ["checkpoint", "--run", RUN, "--pr", "7", "--title", "t"],
      ]) {
        // oxlint-disable-next-line no-await-in-loop -- the cases share one repository and the process environment the runner stubs
        expect((await run(repo, argv)).code, argv.join(" ")).toBe(2);
      }
      expect(gh.calls).toEqual([]);
    });

    describe("the lines run end commits at the head", () => {
      // TEST CHANGE, justified (REQ-FLOW-157, amended 2026-11-10): `ledger` passes through to `seed`, `null` for a run whose
      // reviews found nothing and so wrote no ledger; a case that names none seeds the ledger with a row, as before.
      async function ending(manifest: string, ledger?: string | null): Promise<Seeded> {
        const seeded = await seed({ manifest, prRecord: false, ...(ledger === undefined ? {} : { ledger }) });
        const { repo } = seeded;
        await put(repo, `${RUN_DIR}/record.md`, (await record(repo)).replace("Status: in progress", "Status: closed 2026-11-04"));
        return seeded;
      }

      it("commits PR: and Login: at the head with landJob on, the job's read of them landing from a clean clone", async () => {
        const { repo, head: before, remote } = await ending(LAND_ON);

        const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

        expect(result.code, JSON.stringify(result.doc)).toBe(0);
        expect(result.doc).toMatchObject({ pushed: true, pr: { number: 7 }, notDone: [] });
        const head = git(repo, ["rev-parse", "HEAD"]);
        expect(git(repo, ["rev-list", "--count", `${before}..${head}`])).toBe("2");
        expect(git(repo, ["show", `${head}:${RUN_DIR}/record.md`])).toMatch(/\nPR: 7\nLogin: runner$/);
        expect(git(remote, ["rev-parse", `refs/heads/${RUN_BRANCH}`])).toBe(head);

        // A second end has nothing to add, and makes no commit for it.
        expect((await run(repo, ["end", "--run", RUN, "--title", "t"])).code).toBe(0);
        expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);

        const clone = join(dirname(repo), "job");
        git(dirname(repo), ["clone", "-q", "-b", RUN_BRANCH, remote, clone]);
        git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
        route("GET repos/o/r/pulls/7", pull(head));
        route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
        route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
        route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: `${RUN_DIR}/ledger.jsonl` }]);
        gh.threads = [threadsPage([], BOT)];
        expect((await run(clone, LANDS)).doc).toMatchObject({ outcome: "landed", pr: { number: 7, head } });
      });

      // REQ-FLOW-168, amended 2026-11-10: on Claude's web cloud, `run end` met its own pull request with this footer after
      // the marker, commented instead of taking the body as the run's, and wrote neither line, so the job then refused.
      it("takes its own pull request whose body ends in Claude's web footer, and commits PR: and Login: with landJob on", async () => {
        const { repo } = await ending(LAND_ON);
        const footer = "---\n_Generated by [Claude Code](https://claude.ai/code/session_01GPSuhyX3k1SdW3wb9wrvKv)_";
        route("GET repos/o/r/pulls", [{ number: 7, html_url: "https://github.com/o/r/pull/7", head: { ref: RUN_BRANCH, label: `o:${RUN_BRANCH}` }, base: { ref: "main" }, body: `The list.\n\n${MARKER}\n\n${footer}` }]);

        const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

        expect(result.code, JSON.stringify(result.doc)).toBe(0);
        expect(result.doc).toMatchObject({ pr: { number: 7, how: "existing" }, notDone: [] });
        const head = git(repo, ["rev-parse", "HEAD"]);
        expect(git(repo, ["show", `${head}:${RUN_DIR}/record.md`])).toMatch(/\nPR: 7\nLogin: runner$/);
      });

      // REQ-FLOW-157, amended 2026-11-10: a real cloud run whose review found nothing wrote no ledger, `ledger append` with
      // no findings writing none, and the job refused a run that was otherwise clean for the ledger missing at the head.
      describe("the ledger a clean run never wrote", () => {
        const LEDGER = `${RUN_DIR}/ledger.jsonl`;

        it("commits an empty ledger beside PR: and Login: with landJob on, and the job's evidence reads no open row", async () => {
          const { repo, head: before, remote } = await ending(LAND_ON, null);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ pushed: true, pr: { number: 7 }, notDone: [] });
          const head = git(repo, ["rev-parse", "HEAD"]);
          expect(git(repo, ["rev-list", "--count", `${before}..${head}`])).toBe("2");
          expect(git(repo, ["ls-tree", head, "--", LEDGER])).toMatch(/^100644 blob [0-9a-f]+\t/);
          expect(git(repo, ["cat-file", "-s", `${head}:${LEDGER}`])).toBe("0");
          expect(git(repo, ["show", `${head}:${RUN_DIR}/record.md`])).toMatch(/\nPR: 7\nLogin: runner$/);
          expect(git(remote, ["rev-parse", `refs/heads/${RUN_BRANCH}`])).toBe(head);

          // A second end finds the ledger and the lines standing, and makes no commit.
          expect((await run(repo, ["end", "--run", RUN, "--title", "t"])).code).toBe(0);
          expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);

          const clone = join(dirname(repo), "job");
          git(dirname(repo), ["clone", "-q", "-b", RUN_BRANCH, remote, clone]);
          git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
          route("GET repos/o/r/pulls/7", pull(head));
          route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
          route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
          route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: LEDGER }]);
          gh.threads = [threadsPage([], BOT)];
          expect((await run(clone, LANDS)).doc).toMatchObject({ outcome: "landed", pr: { number: 7, head }, evidence: { ledger: { open: [] } }, notDone: [] });
        });

        it("leaves a ledger with rows byte-identical with landJob on", async () => {
          const { repo } = await ending(LAND_ON, `${row(`${RUN}/review/1`, "Warning", "fixed")}${row(`${RUN}/review/2`, "Minor", "open")}`);
          const held = await readFile(join(repo, LEDGER));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [] });
          expect((await readFile(join(repo, LEDGER))).equals(held)).toBe(true);
          // The blob the head commits is the one the work tree held, byte for byte.
          expect(git(repo, ["rev-parse", `HEAD:${LEDGER}`])).toBe(git(repo, ["hash-object", "--", LEDGER]));
        });

        it("writes no ledger with landJob off", async () => {
          const { repo } = await ending('{"version":1}\n', null);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(existsSync(join(repo, LEDGER))).toBe(false);
          expect(git(repo, ["ls-tree", "HEAD", "--", LEDGER])).toBe("");
        });

        it("writes none where the run's history holds a ledger the work tree lost, naming it in Not done:", async () => {
          const { repo } = await ending(LAND_ON);
          await rm(join(repo, LEDGER));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          // TEST CHANGE, justified (review/190): the spec says the exit code does not move, so the case holds it to 0.
          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [`empty ledger not written: ${LEDGER} was committed before and the work tree no longer holds it, so the land job refuses this run`] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
          expect(git(repo, ["ls-tree", "HEAD", "--", LEDGER])).toBe("");
        });

        // review/188: a finding whose append was skipped, or refused for a block that did not parse, reached no ledger, and
        // the reports that hold it sit git-ignored in the work tree; an empty ledger would land that run as clean.
        const REPORTS = `${RUN_DIR}/reports`;
        const findings = (inner: string): string => `# r1\n\n\`\`\`stamity-findings\n${inner}\`\`\`\n`;
        const WARNING = `${JSON.stringify({ id: "W-1", severity: "Warning", locator: "a.txt:1", summary: "b is wrong" })}\n`;
        const fenced = (open: string, close: string): string => `# r1\n\n${open}\n${WARNING}${close}\n`;
        const held = (entry: string): string => `empty ledger not written: ${REPORTS} holds findings no ledger row carries, or what ledger append refuses: ${entry}, so the land job refuses this run`;

        // review/191: each shape `ledger append --report` refuses, by its fence (blocks.ts, the exact opening alone) or by the
        // file's name (ledgerStore.ts, the report-name check), so no row carries what it holds.
        const DOES_NOT_READ = "a findings fence ledger append does not read";
        it.each([
          ["holds a finding", "u1-reviewer-r1.md", findings(WARNING), "holds findings"],
          ["holds a findings block that does not parse", "u1-reviewer-r1.md", findings("not json\n"), "a findings block that does not parse"],
          ["holds two exact findings blocks", "u1-reviewer-r1.md", `${findings("")}${findings("")}`, "a findings block that does not parse"],
          ["holds a tilde findings fence", "u1-reviewer-r1.md", fenced("~~~stamity-findings", "~~~"), DOES_NOT_READ],
          ["holds a findings fence in another case", "u1-reviewer-r1.md", fenced("```Stamity-Findings", "```"), DOES_NOT_READ],
          ["holds a findings fence with a space before its info string", "u1-reviewer-r1.md", fenced("``` stamity-findings ", "```"), DOES_NOT_READ],
          ["holds a fence named findings", "u1-reviewer-r1.md", fenced("```findings", "```"), DOES_NOT_READ],
          ["holds a findings fence of four backticks", "u1-reviewer-r1.md", fenced("````stamity-findings", "````"), DOES_NOT_READ],
          ["holds a findings fence indented four spaces", "u1-reviewer-r1.md", fenced("    ```stamity-findings", "    ```"), DOES_NOT_READ],
          ["holds a findings fence in a blockquote", "u1-reviewer-r1.md", fenced("> ```stamity-findings", "> ```"), DOES_NOT_READ],
          ["holds a findings fence in a list item", "u1-reviewer-r1.md", fenced("- ```stamity-findings", "  ```"), DOES_NOT_READ],
          ["holds an empty exact block beside a near-miss one", "u1-reviewer-r1.md", `${findings("")}${fenced("~~~ Stamity Findings", "~~~")}`, DOES_NOT_READ],
          ["is a .md whose name is not a report name", "u1-reviewer-1.md", findings(WARNING), "not a report name"],
          ["is a .md whose name is not a report name, with no findings block", "notes.md", "# notes\n", "not a report name"],
          ["is a file of a kind the folder does not hold", "full-suite-r1.log", "all green\n", "not a report name"],
          ["is a diff patch whose context lines hold a finding", "u1-diff-r1.patch", ` \`\`\`stamity-findings\n ${WARNING} \`\`\`\n`, "holds findings"],
          // REQ-FLOW-157 (1.19.1): a fence close to the opening but not exact, by a letter dropped, misspelt or doubled, or
          // another separator, is one no row reads, as a fence naming `findings` already was.
          ["holds a findings fence one letter short", "u1-reviewer-r1.md", fenced("```stamity-finding", "```"), DOES_NOT_READ],
          ["holds a misspelt findings fence", "u1-reviewer-r1.md", fenced("```stamity-findngs", "```"), DOES_NOT_READ],
          ["holds a findings fence with a letter doubled", "u1-reviewer-r1.md", fenced("```stamity-findiings", "```"), DOES_NOT_READ],
          ["holds a findings fence with an underscore", "u1-reviewer-r1.md", fenced("```stamity_findings", "```"), DOES_NOT_READ],
          ["holds an empty exact block beside a fence one letter short", "u1-reviewer-r1.md", `${findings("")}${fenced("```stamity-finding", "```")}`, DOES_NOT_READ],
          ["is a diff patch whose context lines hold a near findings fence", "u1-diff-r1.patch", ` \`\`\`stamity-finding\n ${WARNING} \`\`\`\n`, DOES_NOT_READ],
          // An operating system's own file is taken by name, and still read: a findings block in one reaches no row.
          ["is an AppleDouble file holding a finding", "._x.md", findings(WARNING), "holds findings"],
        ])("writes none where a reports entry %s, naming it in Not done:, and the job refuses", async (_case, name, text, why) => {
          const { repo, remote } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/${name}`, text);
          await put(repo, `${REPORTS}/u1-test-runner-r1.md`, "# gates\n\nall green\n");

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          // TEST CHANGE, justified (review/191): the line names each entry with why it stops the write.
          expect(result.doc).toMatchObject({ notDone: [held(`${name} (${why})`)] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
          const head = git(repo, ["rev-parse", "HEAD"]);
          expect(git(repo, ["ls-tree", head, "--", LEDGER])).toBe("");

          const clone = join(dirname(repo), "job");
          git(dirname(repo), ["clone", "-q", "-b", RUN_BRANCH, remote, clone]);
          git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
          route("GET repos/o/r/pulls/7", pull(head));
          route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
          route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
          gh.threads = [threadsPage([], BOT)];
          expect((await run(clone, LANDS)).doc).toMatchObject({ outcome: "refused", notDone: [`the ledger at ${head} does not read: ${LEDGER} is missing from the commit`] });
          expect(writes()).not.toContain("merge");
        });

        it("writes none where a report-named path does not read, a link in its place", async () => {
          const { repo } = await ending(LAND_ON, null);
          await mkdir(join(repo, REPORTS), { recursive: true });
          await symlink(join(repo, "a.txt"), join(repo, REPORTS, "u1-reviewer-r1.md"));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          // TEST CHANGE, justified (review/191): the line names each entry with why it stops the write.
          expect(result.doc).toMatchObject({ notDone: [held("u1-reviewer-r1.md (did not read)")] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        // review/191: a report moved into a subfolder is not one `ledger append --report` reads.
        it("writes none where the reports folder holds a folder, naming each stopping entry in Not done:", async () => {
          const { repo } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/sub/u1-reviewer-r1.md`, findings(WARNING));
          await put(repo, `${REPORTS}/notes.md`, "# notes\n");

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [held("notes.md (not a report name), sub (not a report name)")] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        // review/191: what a real clean run leaves in its reports folder: the ignore file the ledger writer makes, report-named
        // reports whose findings block is exact and empty or absent, another fenced block, and the orchestrator's diff patch.
        it("writes the empty ledger where every reports entry is one ledger append takes as clean, and the job lands", async () => {
          const { repo, remote } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/.gitignore`, "*\n");
          await put(repo, `${REPORTS}/u1-reviewer-r1.md`, `${findings("")}\n\`\`\`stamity-closures\n\`\`\`\n\n\`\`\`json\n{"findings":0}\n\`\`\`\n`);
          await put(repo, `${REPORTS}/u1-security-r1.md`, `# security\n\n  \`\`\`stamity-findings  \n\n\`\`\`\n`);
          await put(repo, `${REPORTS}/u1-test-runner-r1.md`, "# gates\n\nall green\n");
          await put(repo, `${REPORTS}/u1-diff-r1.patch`, "diff --git a/a.txt b/a.txt\n+b\n");

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [] });
          const head = git(repo, ["rev-parse", "HEAD"]);
          expect(git(repo, ["cat-file", "-s", `${head}:${LEDGER}`])).toBe("0");

          const clone = join(dirname(repo), "job");
          git(dirname(repo), ["clone", "-q", "-b", RUN_BRANCH, remote, clone]);
          git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
          route("GET repos/o/r/pulls/7", pull(head));
          route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
          route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
          route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: LEDGER }]);
          gh.threads = [threadsPage([], BOT)];
          expect((await run(clone, LANDS)).doc).toMatchObject({ outcome: "landed", pr: { number: 7, head }, evidence: { ledger: { open: [] } }, notDone: [] });
        });

        // REQ-FLOW-157 (1.19.1): other fences beside an exact empty block are not near ones, so the clean run's ledger lands.
        it("writes the empty ledger where a report's exact empty block sits beside text, sh, json, stamity-morning and stamity-closures fences", async () => {
          const { repo } = await ending(LAND_ON, null);
          const others = ["text", "sh", "json", "stamity-morning", "stamity-closures"].map((info) => `\`\`\`${info}\nx\n\`\`\`\n`).join("\n");
          await put(repo, `${REPORTS}/u1-reviewer-r1.md`, `${findings("")}\n${others}`);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [] });
          expect(git(repo, ["cat-file", "-s", `HEAD:${LEDGER}`])).toBe("0");
        });

        // REQ-FLOW-157 (1.19.1): a real run's reports folder on macOS or Windows can hold the system's own files, which no
        // agent wrote and which hold no finding; they no longer stop a clean run's empty ledger.
        it("writes the empty ledger where the reports folder holds .DS_Store, Thumbs.db, desktop.ini and an AppleDouble file", async () => {
          const { repo } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/u1-reviewer-r1.md`, findings(""));
          // Binary bytes, as Finder writes them: the `Bud1` magic among NULs and bytes that are not UTF-8.
          await writeFile(join(repo, REPORTS, ".DS_Store"), Buffer.from([0, 0, 0, 1, 0x42, 0x75, 0x64, 0x31, 0, 0, 0x10, 0, 0xff, 0xfe, 0x80]));
          await writeFile(join(repo, REPORTS, "Thumbs.db"), Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]));
          await writeFile(join(repo, REPORTS, "desktop.ini"), "[.ShellClassInfo]\r\nIconResource=C:\\x.ico,0\r\n");
          await writeFile(join(repo, REPORTS, "._u1-reviewer-r1.md"), Buffer.from([0, 5, 0x16, 7, 0, 2, 0, 0, 0x4d, 0x61, 0x63, 0x20, 0x4f, 0x53, 0x20, 0x58]));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [] });
          expect(git(repo, ["cat-file", "-s", `HEAD:${LEDGER}`])).toBe("0");
        });

        // REQ-FLOW-157 (1.19.1): the system's file is taken by its name only where it is a regular file the cap reads whole.
        it.each([
          ["a folder", async (repo: string) => mkdir(join(repo, REPORTS, ".DS_Store"))],
          ["a link", async (repo: string) => symlink(join(repo, "a.txt"), join(repo, REPORTS, ".DS_Store"))],
          ["over the read cap", async (repo: string) => writeFile(join(repo, REPORTS, ".DS_Store"), Buffer.alloc(1_048_577))],
        ])("writes none where .DS_Store is %s, naming it in Not done:", async (_case, make) => {
          const { repo } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/u1-reviewer-r1.md`, findings(""));
          await make(repo);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [held(".DS_Store (did not read)")] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        // review/191, amended (S105): a real cloud run saved its `gate held --json` result in its reports folder, the path the
        // Verdict dispatch names for the reviewer. The text is the command's own output, so the shape cannot drift.
        async function heldResult(repo: string, digest?: string): Promise<{ code: number; text: string }> {
          const argv = ["gate", "held", "--paths", "a.txt", ...(digest === undefined ? [] : ["--expect", digest]), "--json"];
          const result = await runInProcess([gateCommand], argv, { cwd: repo });
          return { code: result.code, text: result.stdout };
        }

        it.each([
          ["matches no expectation", undefined, 0],
          ["names a changed held test", `sha256:${"0".repeat(64)}`, 1],
        ])("writes the empty ledger beside a saved gate held result that %s, and the job lands", async (_case, digest, exit) => {
          const { repo, remote } = await ending(LAND_ON, null);
          const saved = await heldResult(repo, digest);
          expect(saved.code).toBe(exit);
          expect(JSON.parse(saved.text)).toMatchObject({ ok: exit === 0, command: "gate", subcommand: "held", paths: [{ path: "a.txt", sha256: expect.any(String) }] });
          await put(repo, `${REPORTS}/.gitignore`, "*\n");
          await put(repo, `${REPORTS}/branch-held-r1.json`, saved.text);
          await put(repo, `${REPORTS}/u1-reviewer-r1.md`, findings(""));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [] });
          const head = git(repo, ["rev-parse", "HEAD"]);
          expect(git(repo, ["cat-file", "-s", `${head}:${LEDGER}`])).toBe("0");

          const clone = join(dirname(repo), "job");
          git(dirname(repo), ["clone", "-q", "-b", RUN_BRANCH, remote, clone]);
          git(clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
          route("GET repos/o/r/pulls/7", pull(head));
          route(`GET repos/o/r/commits/${head}/check-runs`, { total_count: 1, check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "success", app: { id: 15368 } }] });
          route(`GET repos/o/r/branches/${RUN_BRANCH}`, { commit: { sha: head } });
          route("GET repos/o/r/pulls/7/files", [{ filename: "a.txt" }, { filename: `${RUN_DIR}/record.md` }, { filename: LEDGER }]);
          gh.threads = [threadsPage([], BOT)];
          expect((await run(clone, LANDS)).doc).toMatchObject({ outcome: "landed", pr: { number: 7, head }, evidence: { ledger: { open: [] } }, notDone: [] });
        });

        const reshaped = (text: string, change: (doc: Record<string, unknown>) => void): string => {
          const doc = JSON.parse(text) as Record<string, unknown>;
          change(doc);
          return `${JSON.stringify(doc)}\n`;
        };
        it.each([
          ["an extra key", (text: string) => reshaped(text, (doc) => (doc["note"] = "x"))],
          ["a findings array", (text: string) => reshaped(text, (doc) => (doc["findings"] = [JSON.parse(WARNING)]))],
          ["a severity key", (text: string) => reshaped(text, (doc) => (doc["severity"] = "Warning"))],
          ["an extra key on a path row", (text: string) => reshaped(text, (doc) => ((doc["paths"] as Record<string, unknown>[])[0]!["summary"] = "b is wrong"))],
          ["a required key missing", (text: string) => reshaped(text, (doc) => delete doc["digest"])],
          ["another command's envelope", (text: string) => reshaped(text, (doc) => (doc["command"] = "ledger"))],
          ["bad JSON", () => "{not json\n"],
          ["a JSON array", () => "[]\n"],
        ])("writes none where a reports .json is not a gate held result, it holding %s, naming it in Not done:", async (_case, make) => {
          const { repo } = await ending(LAND_ON, null);
          await put(repo, `${REPORTS}/branch-held-r1.json`, make((await heldResult(repo)).text));

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [held("branch-held-r1.json (not a gate held result)")] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        it.each([
          ["a link in its place", async (repo: string) => symlink(join(repo, "a.txt"), join(repo, REPORTS, "branch-held-r1.json"))],
          ["over the read cap", async (repo: string) => writeFile(join(repo, REPORTS, "branch-held-r1.json"), " ".repeat(1_048_577))],
        ])("writes none where a reports .json does not read, %s, naming it in Not done:", async (_case, make) => {
          const { repo } = await ending(LAND_ON, null);
          await mkdir(join(repo, REPORTS), { recursive: true });
          await make(repo);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [held("branch-held-r1.json (did not read)")] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        // review/189: a merge whose side branch added and deleted the ledger leaves both parents without one, so git's default
        // history simplification prunes that side and a plain `git log HEAD -- <ledger>` finds nothing.
        it("writes none where a merged side branch added and deleted the ledger", async () => {
          const { repo } = await ending(LAND_ON, null);
          git(repo, ["switch", "-q", "-c", "side"]);
          await put(repo, LEDGER, row(`${RUN}/review/1`, "Warning", "open"));
          git(repo, ["add", "--", LEDGER]);
          git(repo, ["commit", "-q", "-m", "ledger"]);
          git(repo, ["rm", "-q", "--", LEDGER]);
          git(repo, ["commit", "-q", "-m", "lost"]);
          git(repo, ["switch", "-q", RUN_BRANCH]);
          git(repo, ["merge", "-q", "--no-ff", "-m", "merge side", "side"]);
          git(repo, ["branch", "-q", "-D", "side"]);
          expect(git(repo, ["log", "-1", "--format=%H", "HEAD", "--", LEDGER])).toBe("");

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [`empty ledger not written: ${LEDGER} was committed before and the work tree no longer holds it, so the land job refuses this run`] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        it("writes none where the ledger's history does not read, naming it in Not done:", async () => {
          const { repo } = await ending(LAND_ON, null);
          // A ref naming an object the repository does not hold: `git log --all` stops on it.
          await put(repo, ".git/refs/heads/broken", `${"0".repeat(39)}1\n`);

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: expect.arrayContaining([`empty ledger not written: the history of ${LEDGER} did not read, so the land job refuses this run`]) });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
        });

        it("names a ledger write that fails in Not done:, the exit code unmoved", async () => {
          const { repo } = await ending(LAND_ON, null);
          atomic.failing = LEDGER;

          const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

          expect(result.code, JSON.stringify(result.doc)).toBe(0);
          expect(result.doc).toMatchObject({ notDone: [`empty ledger not written: ${LEDGER} (disk full), so the land job refuses this run`] });
          expect(existsSync(join(repo, LEDGER))).toBe(false);
          expect(git(repo, ["show", `HEAD:${RUN_DIR}/record.md`])).toMatch(/\nPR: 7\nLogin: runner$/);
        });

        it("leaves the job refusing a head with no ledger, unchanged", async () => {
          const { repo, head } = await seedJob({ ledger: null });

          const result = await run(repo, LANDS);

          expect(result.doc).toMatchObject({ outcome: "refused", notDone: [`the ledger at ${head} does not read: ${LEDGER} is missing from the commit`] });
          expect(writes()).not.toContain("merge");
        });
      });

      it("keeps the first pass's Not done:, so a file the scan could not read is still named once the stamp's pass has run", async () => {
        const { repo } = await ending(LAND_ON);
        await writeFile(join(repo, "x.ts"), Buffer.from("export const x = 1;\n\0\n"));

        const result = await run(repo, ["end", "--run", RUN, "--title", "t", "--paths", "x.ts"]);

        expect(result.code, JSON.stringify(result.doc)).toBe(0);
        expect(result.doc).toMatchObject({ notDone: ["secret scan: 1 files unscanned (x.ts)"] });
        expect(await record(repo)).toMatch(/\nPR: 7\n/);
      });

      it("spells an app's login as the thread query does, with no [bot]", async () => {
        const { repo, head } = await ending(LAND_ON);
        route("GET repos/o/r/pulls/7", pull(head, { user: { login: "claude[bot]" } }));
        expect((await run(repo, ["end", "--run", RUN, "--title", "t"])).code).toBe(0);
        expect(await record(repo)).toMatch(/\nLogin: claude\n$/);
      });

      it("adds neither line nor commit with landJob off", async () => {
        const { repo } = await ending('{"version":1}\n');
        const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);
        expect(result.code, JSON.stringify(result.doc)).toBe(0);
        expect(await record(repo)).not.toMatch(/^(?:PR|Login): /m);
        expect(git(repo, ["log", "-1", "--format=%s"])).toBe(`chore(run): checkpoint ${RUN}`);
        expect(git(repo, ["rev-list", "--count", `${git(repo, ["rev-parse", "HEAD~1"])}..HEAD`])).toBe("1");
      });

      it("ends with a Not done: line where the author does not read, and the job then refuses for want of the lines", async () => {
        const { repo } = await ending(LAND_ON);
        route("GET repos/o/r/pulls/7", { message: "Bad gateway" }, 502);

        const result = await run(repo, ["end", "--run", RUN, "--title", "t"]);

        expect(result.doc).toMatchObject({ notDone: [expect.stringContaining("land job lines not written")] });
        expect(await record(repo)).not.toMatch(/^PR: /m);
      });

      it("writes nothing for a refused end", async () => {
        const { repo } = await ending(LAND_ON);
        await run(repo, ["end", "--run", RUN, "--title", "t", "--refused"]);
        expect(await record(repo)).not.toMatch(/^PR: /m);
      });
    });
  });
});
