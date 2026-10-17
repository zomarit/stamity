import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { RUN_ENDED_MARKER_FILE } from "../../../src/mcp/env.ts";
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

  // The guard's table counts main and master whatever the repository's default is (src/hooks/personOnly.ts:96),
  // so a run kept on either would have every push refused as push-default.
  it.each(["main", "master"])("leaves %s even where the REST read names another default (develop)", async (branch) => {
    const repo = await seedRepo({ branch });
    restDefault("develop");

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true });
    expect(current(repo)).toBe(RUN_BRANCH);
    expect(rest.calls).toHaveLength(1);
  });

  it("matches the default branch without case, as the guard's table does (HEAD on Trunk, REST names trunk)", async () => {
    const repo = await seedRepo({ branch: "Trunk" });
    restDefault("trunk");

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch: RUN_BRANCH, created: true });
    expect(current(repo)).toBe(RUN_BRANCH);
  });

  // origin/HEAD is set at clone and kept through a default-branch rename on GitHub, so REST must decide over it.
  it.each([
    { on: "trunk", branch: RUN_BRANCH, created: true },
    { on: "develop", branch: "develop", created: false },
  ])("lets the REST read decide over a different origin/HEAD (REST trunk, origin/HEAD develop, HEAD on $on)", async ({ on, branch, created }) => {
    const repo = await seedRepo({ branch: "trunk" });
    restDefault("trunk");
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["branch", "develop"]);
    git(repo, ["update-ref", "refs/remotes/origin/develop", head]);
    git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop"]);
    git(repo, ["switch", "-q", on]);

    const { code, doc } = await run(repo, START);

    expect(code).toBe(0);
    expect(doc).toMatchObject({ branch, created });
    expect(current(repo)).toBe(branch);
    expect(rest.calls).toHaveLength(1);
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
    // TEST CHANGE, justified: review/209 has start write the run folder's origin pin, untracked until a checkpoint stages it.
    expect(git(repo, ["status", "--porcelain", "--untracked-files=all"]).split("\n")).toEqual(["M a.txt", `?? .stamity/runs/${RUN}/origin.json`]);
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

  describe("the origin pin (review/209)", () => {
    const PIN = `.stamity/runs/${RUN}/origin.json`;

    it("writes origin's repository to the run folder, and keeps it on a second start", async () => {
      const repo = await seedRepo();
      restDefault("main");

      expect((await run(repo, START)).code).toBe(0);
      expect(await readFile(join(repo, PIN), "utf8")).toBe('{"host":"github.com","owner":"o","repo":"r"}\n');

      const again = await run(repo, ["start", "--run", RUN]);
      expect(again.code).toBe(0);
      expect(again.stdout).toContain(`origin: github.com/o/r (pinned in ${PIN}, kept)`);
    });

    it("refuses as origin changed where origin names another repository than the pin, leaving the pin", async () => {
      const repo = await seedRepo();
      restDefault("main");
      expect((await run(repo, START)).code).toBe(0);
      git(repo, ["remote", "set-url", "origin", "https://github.com/elsewhere/r.git"]);

      const { code, doc } = await run(repo, START);

      expect(code).toBe(1);
      expect(JSON.stringify(doc["error"])).toContain("Not done: origin changed");
      expect(JSON.stringify(doc["error"])).toContain("pins github.com/o/r, and origin now names github.com/elsewhere/r");
      expect(await readFile(join(repo, PIN), "utf8")).toBe('{"host":"github.com","owner":"o","repo":"r"}\n');
    });

    it("pins the push as git resolves it: a pushInsteadOf moving it pins nothing, or refuses a pin already there", async () => {
      const moved = await seedRepo();
      const pinned = await seedRepo();
      restDefault("main");
      git(moved, ["config", "url.https://github.com/elsewhere/.pushInsteadOf", "https://github.com/o/"]);
      expect((await run(pinned, START)).code).toBe(0);
      git(pinned, ["config", "url.https://github.com/elsewhere/.pushInsteadOf", "https://github.com/o/"]);

      const fresh = await run(moved, ["start", "--run", RUN]);
      const again = await run(pinned, START);

      expect(fresh.code).toBe(0);
      expect(fresh.stdout).toContain("origin: not pinned (a push URL of origin names another repository than its fetch URL)");
      expect(existsSync(join(moved, PIN))).toBe(false);
      expect(again.code).toBe(1);
      expect(JSON.stringify(again.doc["error"])).toContain("Not done: origin changed");
    });

    /** A run branch whose tip commits `pin` at the pin's path, the checkout back on main. */
    async function branchWithPin(pin: string): Promise<string> {
      const repo = await seedRepo();
      git(repo, ["switch", "-q", "-c", RUN_BRANCH]);
      await mkdir(join(repo, ".stamity", "runs", RUN), { recursive: true });
      await writeFile(join(repo, PIN), pin);
      git(repo, ["add", "--", PIN]);
      git(repo, ["commit", "-q", "-m", "checkpoint"]);
      git(repo, ["switch", "-q", "main"]);
      return repo;
    }

    // pr/4: the pin is read once the run is on its branch, so a resumed run's committed pin is compared, not shadowed.
    it("checks out an existing run branch that tracks its pin, keeping it, the checkout clean", async () => {
      const repo = await branchWithPin('{"host":"github.com","owner":"o","repo":"r"}\n');
      restDefault("main");

      const { code, stdout } = await run(repo, ["start", "--run", RUN]);

      expect(code).toBe(0);
      expect(current(repo)).toBe(RUN_BRANCH);
      expect(stdout).toContain(`origin: github.com/o/r (pinned in ${PIN}, kept)`);
      expect(git(repo, ["status", "--porcelain", "--untracked-files=all"])).toBe("");
    });

    it("refuses as origin changed where the existing run branch's committed pin names another repository", async () => {
      const repo = await branchWithPin('{"host":"github.com","owner":"elsewhere","repo":"r"}\n');
      restDefault("main");

      const { code, doc } = await run(repo, START);

      expect(code).toBe(1);
      expect(JSON.stringify(doc["error"])).toContain("Not done: origin changed");
      expect(JSON.stringify(doc["error"])).toContain("pins github.com/elsewhere/r, and origin now names github.com/o/r");
    });

    // pr/27: the refusal comes after the switch, so it says where the checkout was left.
    it("names the run branch the checkout is left on when it refuses as origin changed after the switch", async () => {
      const repo = await branchWithPin('{"host":"github.com","owner":"elsewhere","repo":"r"}\n');
      restDefault("main");

      const { code, doc } = await run(repo, START);

      expect(code).toBe(1);
      expect(current(repo)).toBe(RUN_BRANCH);
      expect(JSON.stringify(doc["error"])).toContain(`origin now names github.com/o/r; the checkout is on ${RUN_BRANCH} now`);
    });

    // pr/28: a dry run switches nothing, so the existing branch's pin is read from its tree, as the real start reads it.
    it("previews an existing run branch's committed pin under --dry-run: kept where it matches, origin changed where not", async () => {
      const kept = await branchWithPin('{"host":"github.com","owner":"o","repo":"r"}\n');
      const moved = await branchWithPin('{"host":"github.com","owner":"elsewhere","repo":"r"}\n');
      restDefault("main");

      const same = await run(kept, ["start", "--run", RUN, "--dry-run"]);
      const other = await run(moved, [...START, "--dry-run"]);

      expect(same.code).toBe(0);
      expect(same.stdout).toContain(`origin: github.com/o/r (pinned in ${PIN}, kept)`);
      expect(same.stdout).not.toContain("would be pinned");
      expect(other.code).toBe(1);
      expect(JSON.stringify(other.doc["error"])).toContain("Not done: origin changed");
      expect(JSON.stringify(other.doc["error"])).toContain("pins github.com/elsewhere/r, and origin now names github.com/o/r");
      expect(JSON.stringify(other.doc["error"])).not.toContain("the checkout is on");
      for (const repo of [kept, moved]) {
        expect(current(repo)).toBe("main");
        expect(existsSync(join(repo, PIN))).toBe(false);
      }
    });

    it("pins nothing for an origin naming no GitHub repository, nor under --dry-run", async () => {
      const local = await seedRepo({ url: null });
      const dry = await seedRepo();
      restDefault("main");

      const none = await run(local, ["start", "--run", RUN]);
      const planned = await run(dry, ["start", "--run", RUN, "--dry-run"]);

      expect(none.code).toBe(0);
      expect(none.stdout).toContain("origin: not pinned (origin names no GitHub repository gh reaches)");
      expect(existsSync(join(local, PIN))).toBe(false);
      expect(planned.code).toBe(0);
      expect(planned.stdout).toContain(`origin: github.com/o/r (would be pinned in ${PIN})`);
      expect(existsSync(join(dry, PIN))).toBe(false);
    });
  });

  // pr/17: a new run closes the last one's final question round, which the ask gate reads off run end's marker.
  it("deletes the run-ended marker an earlier run end wrote, and keeps it under --dry-run", async () => {
    const repo = await seedRepo();
    const dry = await seedRepo();
    restDefault("main");
    await Promise.all(
      [repo, dry].map(async (at) => {
        await mkdir(join(at, ".stamity"), { recursive: true });
        await writeFile(join(at, RUN_ENDED_MARKER_FILE), `${JSON.stringify({ run: "2026-10-15_earlier" })}\n`);
      }),
    );

    expect((await run(repo, START)).code).toBe(0);
    expect((await run(dry, [...START, "--dry-run"])).code).toBe(0);

    expect(existsSync(join(repo, RUN_ENDED_MARKER_FILE))).toBe(false);
    expect(existsSync(join(dry, RUN_ENDED_MARKER_FILE))).toBe(true);
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
