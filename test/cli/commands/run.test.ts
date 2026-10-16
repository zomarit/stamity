import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * u18-run-verb (REQ-FLOW-092, REQ-FLOW-093): `stamity run start`, through the
 * in-process funnel, so each case also covers the exit contract and the one
 * JSON document. Git runs for real in scratch repositories, through the verb's
 * own write runner: which branch the run lands on is what git's refs say
 * afterwards, so a scripted runner would prove nothing. Only `gh api` is
 * replaced, below.
 */

/** Every REST call the verb made, and the answer each path gets. */
const rest = vi.hoisted(() => ({
  calls: [] as { path: string; hostname: string; method: string }[],
  routes: new Map<string, { status: number; json: unknown }>(),
}));

// Mocked: the real `ghApi` starts `gh`, which calls GitHub over the network
// under the machine's login; a unit test can reach neither. The verb's own
// work (which host, which path, what it does with the answer) is unchanged.
vi.mock("../../../src/cli/engine/ghRunner.ts", () => ({
  ghApi: (request: { path: string; hostname: string; method: string }) => {
    const path = request.path.replace(/^\//, "");
    rest.calls.push({ path, hostname: request.hostname, method: request.method });
    return Promise.resolve(rest.routes.get(path) ?? { status: 404, json: { message: "Not Found" } });
  },
}));

const SEED_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_AUTHOR_NAME: "Alice Example",
  GIT_AUTHOR_EMAIL: "alice@example.com",
  GIT_COMMITTER_NAME: "Alice Example",
  GIT_COMMITTER_EMAIL: "alice@example.com",
} as const;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...SEED_ENV } }).trim();
}

const RUN = "2026-10-16_overnight";
const RUN_BRANCH = `stamity/${RUN}`;

describe("stamity run start", () => {
  const getRoot = useTempDir("run-verb");

  beforeEach(() => {
    rest.calls.length = 0;
    rest.routes.clear();
  });

  /** A repository with two commits on `branch`, and `origin` at `url` unless it is null. */
  async function seedRepo(opts: { branch?: string; url?: string | null } = {}): Promise<string> {
    const repo = getRoot().path(`repo-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(repo, { recursive: true });
    git(repo, ["-c", `init.defaultBranch=${opts.branch ?? "main"}`, "init", "-q"]);
    const names = ["a.txt", "b.txt"];
    await Promise.all(names.map((name) => writeFile(join(repo, name), `${name}\n`)));
    for (const name of names) {
      git(repo, ["add", "--", name]);
      git(repo, ["commit", "-q", "-m", name]);
    }
    if (opts.url !== null) git(repo, ["remote", "add", "origin", opts.url ?? "https://github.com/o/r.git"]);
    return repo;
  }

  /** The repository's default branch as GitHub's REST answer names it. */
  function restDefault(branch: string): void {
    rest.routes.set("repos/o/r", { status: 200, json: { default_branch: branch } });
  }

  /**
   * Runs the verb in `cwd` with `HOME` at an empty folder and git's system
   * config off, so no host config (a global hook path, a default branch name)
   * reaches the write runner, which reads this process's environment.
   */
  async function run(cwd: string, argv: readonly string[], env: Record<string, string> = {}) {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides = { HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
    const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const result = await runInProcess([runCommand], ["run", ...argv], { cwd, env });
      const envelope = argv.includes("--json") && result.stdout !== "" ? (JSON.parse(result.stdout) as Record<string, unknown>) : {};
      // The funnel's three envelope keys, set aside so `doc` is the verb's own document.
      const { ok, command, version, ...doc } = envelope;
      return { ...result, ok, command, version, doc };
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  const START = ["start", "--run", RUN, "--json"];
  const current = (repo: string): string => git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);

  it("creates and checks out stamity/<run-id> on the default branch the REST read names, on its host", async () => {
    const repo = await seedRepo();
    restDefault("main");
    const head = git(repo, ["rev-parse", "HEAD"]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toEqual({ subcommand: "start", run: RUN, branch: RUN_BRANCH, created: true, base: head });
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(git(repo, ["rev-parse", RUN_BRANCH])).toBe(head);
    expect(rest.calls).toEqual([{ path: "repos/o/r", hostname: "github.com", method: "GET" }]);
  });

  it("names GH_HOST's host on the REST read for an origin on that host", async () => {
    const repo = await seedRepo({ url: "https://ghe.example.com/o/r.git" });
    restDefault("main");

    const { code, doc } = await run(repo, START, { GH_HOST: "ghe.example.com" });

    expect(code).toBe(0);
    expect(doc["created"]).toBe(true);
    expect(rest.calls).toEqual([{ path: "repos/o/r", hostname: "ghe.example.com", method: "GET" }]);
  });

  it("leaves a default branch of any name: one only the REST read calls default, origin/HEAD absent", async () => {
    const repo = await seedRepo({ branch: "trunk" });
    restDefault("trunk");

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true });
    expect(current(repo)).toBe(RUN_BRANCH);
  });

  it("keeps a branch that is not the default, created false, and switches nothing", async () => {
    const repo = await seedRepo();
    restDefault("main");
    git(repo, ["switch", "-q", "-c", "feat/x"]);
    const head = git(repo, ["rev-parse", "HEAD"]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toEqual({ subcommand: "start", run: RUN, branch: "feat/x", created: false, base: head });
    expect(current(repo)).toBe("feat/x");
    expect(git(repo, ["branch", "--list", RUN_BRANCH])).toBe("");
  });

  it("keeps a platform's own branch (claude/…)", async () => {
    const repo = await seedRepo();
    restDefault("main");
    git(repo, ["switch", "-q", "-c", "claude/fix-login-a1b2"]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: "claude/fix-login-a1b2", created: false });
  });

  it("falls back to refs/remotes/origin/HEAD where REST names no default (a non-GitHub origin), calling no REST", async () => {
    const repo = await seedRepo({ branch: "develop", url: "https://gitlab.com/o/r.git" });
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["update-ref", "refs/remotes/origin/develop", head]);
    git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true, base: head });
    expect(rest.calls).toEqual([]);
  });

  it("falls back to refs/remotes/origin/HEAD where the REST read answers no repository", async () => {
    const repo = await seedRepo({ branch: "develop" });
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["update-ref", "refs/remotes/origin/develop", head]);
    git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true });
    expect(rest.calls).toHaveLength(1);
  });

  it.each(["main", "master"])("falls back to %s with no origin at all", async (branch) => {
    const repo = await seedRepo({ branch, url: null });

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true });
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(rest.calls).toEqual([]);
  });

  it("creates the run's branch at a detached HEAD, based on that commit", async () => {
    const repo = await seedRepo();
    restDefault("main");
    const first = git(repo, ["rev-parse", "HEAD~1"]);
    git(repo, ["switch", "-q", "--detach", first]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toEqual({ subcommand: "start", run: RUN, branch: RUN_BRANCH, created: true, base: first });
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(git(repo, ["rev-parse", RUN_BRANCH])).toBe(first);
  });

  it("checks out an existing stamity/<run-id> rather than recreating it, its own tip kept", async () => {
    const repo = await seedRepo();
    restDefault("main");
    const first = git(repo, ["rev-parse", "HEAD~1"]);
    git(repo, ["branch", RUN_BRANCH, first]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toEqual({ subcommand: "start", run: RUN, branch: RUN_BRANCH, created: false, base: first });
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(git(repo, ["rev-parse", RUN_BRANCH])).toBe(first);
  });

  it("carries uncommitted work onto the run's branch", async () => {
    const repo = await seedRepo();
    restDefault("main");
    await writeFile(join(repo, "a.txt"), "changed\n");

    const { code } = await run(repo, START);

    expect(code).toBe(0);
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(git(repo, ["status", "--porcelain"])).toBe("M a.txt");
  });

  it("prints the branch and the base without --json", async () => {
    const repo = await seedRepo();
    restDefault("main");
    const head = git(repo, ["rev-parse", "HEAD"]);

    const { code, stdout } = await run(repo, ["start", "--run", RUN]);

    expect(code).toBe(0);
    expect(stdout).toContain(`branch: ${RUN_BRANCH} (created from main, the default branch)`);
    expect(stdout).toContain(`base: ${head}`);
  });

  it("switches nothing under --dry-run, and reports what it would do", async () => {
    const repo = await seedRepo();
    restDefault("main");

    const { code, doc } = await run(repo, [...START, "--dry-run"]);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ dryRun: true, branch: RUN_BRANCH, created: true });
    expect(current(repo)).toBe("main");
    expect(git(repo, ["branch", "--list", RUN_BRANCH])).toBe("");
  });

  it("refuses a run id outside the run folder's grammar, creating no branch", async () => {
    const repo = await seedRepo();
    restDefault("main");

    const { code } = await run(repo, ["start", "--run", "../main", "--json"]);

    expect(code).toBe(1);
    expect(current(repo)).toBe("main");
    expect(git(repo, ["for-each-ref", "--format=%(refname)", "refs/heads/"])).toBe("refs/heads/main");
  });

  it("is a usage error without --run (exit 2)", async () => {
    const repo = await seedRepo();

    const { code, stderr } = await run(repo, ["start", "--json"]);

    expect(code).toBe(2);
    expect(stderr).toContain("--run");
    expect(current(repo)).toBe("main");
  });

  it("refuses a repository with no commit to base the run on", async () => {
    const repo = getRoot().path("empty");
    await mkdir(repo, { recursive: true });
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);

    const { code } = await run(repo, START);

    expect(code).toBe(1);
    expect(git(repo, ["for-each-ref", "--format=%(refname)", "refs/heads/"])).toBe("");
  });

  it("names the failed switch and stays put when git refuses it", async () => {
    const repo = await seedRepo();
    restDefault("main");
    const first = git(repo, ["rev-parse", "HEAD~1"]);
    git(repo, ["branch", RUN_BRANCH, first]);
    // b.txt does not exist at the run branch's tip, so switching would overwrite this untracked-to-it change.
    await writeFile(join(repo, "b.txt"), "local edit\n");

    const { code, ok, doc } = await run(repo, START);

    expect(code).toBe(1);
    expect(ok).toBe(false);
    expect(JSON.stringify(doc["error"])).toContain(RUN_BRANCH);
    expect(current(repo)).toBe("main");
  });
});
