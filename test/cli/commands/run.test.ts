import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCommand } from "../../../src/cli/commands/run.ts";
import { PERSON_ONLY_GUARD_FILE, planCoreHookScripts } from "../../../src/hooks/scripts.ts";
import { RUN_ENDED_MARKER_FILE } from "../../../src/mcp/env.ts";
import { canonical } from "../../support/identity.ts";
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

  // The guard's table counts main and master whatever the repository's default is (src/hooks/personOnly.ts:796),
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

  describe("a continuation on another machine: the run's branch only on origin (v21, REQ-FLOW-105)", () => {
    /** Git's auto maintenance off before any push or commit, so no detached child outlives a case (runCheckpoint.test.ts, prove/12). */
    const NO_AUTO_MAINTENANCE = "[receive]\n\tautogc = false\n[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n";
    const RECORD = `.stamity/runs/${RUN}/record.md`;
    const PIN = `.stamity/runs/${RUN}/origin.json`;

    interface Continuation {
      clone: string;
      remote: string;
      tip: string;
      recordBase: string;
    }

    /**
     * A bare remote holding `main` and the run's branch one commit ahead of it, that commit carrying the run's record
     * (`Base:` main's tip, or a side commit the tip does not descend from, or no record at all), and a fresh clone of
     * the remote on `main`, as a cloud machine that came back has: `stamity/<run-id>` only as origin's.
     */
    async function seedContinuation(
      opts: { base?: "main" | "side"; record?: boolean | "no Base:" | "link"; recordBase?: string; pin?: string } = {},
    ): Promise<Continuation> {
      const source = await seedRepo({ url: null });
      await writeFile(join(source, ".git", "config"), NO_AUTO_MAINTENANCE, { flag: "a" });
      const remote = getRoot().path(`remote-${Math.random().toString(36).slice(2, 8)}.git`);
      git(source, ["-c", "init.defaultBranch=main", "init", "-q", "--bare", remote]);
      await writeFile(join(remote, "config"), NO_AUTO_MAINTENANCE, { flag: "a" });
      git(source, ["push", "-q", remote, "main"]);
      let recordBase = git(source, ["rev-parse", "HEAD"]);
      if (opts.base === "side") {
        git(source, ["switch", "-q", "-c", "side", "HEAD~1"]);
        await writeFile(join(source, "side.txt"), "side\n");
        git(source, ["add", "--", "side.txt"]);
        git(source, ["commit", "-q", "-m", "side"]);
        recordBase = git(source, ["rev-parse", "HEAD"]);
        git(source, ["push", "-q", remote, "side"]);
        git(source, ["switch", "-q", "main"]);
      }
      if (opts.recordBase !== undefined) recordBase = opts.recordBase;
      git(source, ["switch", "-q", "-c", RUN_BRANCH]);
      const head = `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\n`;
      if (opts.record === false) {
        await writeFile(join(source, "c.txt"), "c\n");
        git(source, ["add", "--", "c.txt"]);
      } else if (opts.record === "link") {
        // A link at the record's path whose target text is a whole record, committed by its mode alone (no link is
        // made on disk): only the entry's mode tells it from the record.
        await writeFile(join(source, "target.txt"), `${head}Base: ${recordBase}\n`);
        const target = git(source, ["hash-object", "-w", "--", "target.txt"]);
        git(source, ["update-index", "--add", "--cacheinfo", `120000,${target},${RECORD}`]);
      } else {
        await mkdir(join(source, ".stamity", "runs", RUN), { recursive: true });
        await writeFile(join(source, RECORD), opts.record === "no Base:" ? head : `${head}Base: ${recordBase}\n`);
        git(source, ["add", "--", RECORD]);
      }
      if (opts.pin !== undefined) {
        await mkdir(join(source, ".stamity", "runs", RUN), { recursive: true });
        await writeFile(join(source, PIN), opts.pin);
        git(source, ["add", "--", PIN]);
      }
      git(source, ["commit", "-q", "-m", "checkpoint"]);
      const tip = git(source, ["rev-parse", "HEAD"]);
      git(source, ["push", "-q", remote, RUN_BRANCH]);
      const clone = getRoot().path(`clone-${Math.random().toString(36).slice(2, 8)}`);
      git(getRoot().path(), ["clone", "-q", remote, clone]);
      await writeFile(join(clone, ".git", "config"), NO_AUTO_MAINTENANCE, { flag: "a" });
      git(clone, ["config", "user.name", "Alice Example"]);
      git(clone, ["config", "user.email", "alice@example.com"]);
      return { clone, remote, tip, recordBase };
    }

    it("creates the run's branch at origin's tip, its base, so the next checkpoint pushes as a fast-forward", async () => {
      const { clone, remote, tip } = await seedContinuation();
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");

      const { code, doc } = await run(clone, START);

      expect(code).toBe(0);
      expect(doc).toEqual({ subcommand: "start", run: RUN, branch: RUN_BRANCH, created: true, base: tip });
      expect(current(clone)).toBe(RUN_BRANCH);
      expect(git(clone, ["rev-parse", "HEAD"])).toBe(tip);

      await writeFile(join(clone, "a.txt"), "the next unit's change\n");
      const checkpoint = await run(clone, ["checkpoint", "--run", RUN, "--paths", "a.txt", "--json"]);

      expect(checkpoint.code).toBe(0);
      expect(checkpoint.doc).toMatchObject({ branch: RUN_BRANCH, pushed: true, notDone: [] });
      const pushed = git(remote, ["rev-parse", `refs/heads/${RUN_BRANCH}`]);
      expect(pushed).not.toBe(tip);
      expect(git(remote, ["rev-parse", `${pushed}^`])).toBe(tip);
    });

    it("names origin's branch and its tip as the base under --dry-run, switching nothing", async () => {
      const { clone, tip } = await seedContinuation();

      const { code, stdout } = await run(clone, ["start", "--run", RUN, "--dry-run"]);

      expect(code).toBe(0);
      expect(stdout).toContain(`branch: ${RUN_BRANCH} (created from origin's ${RUN_BRANCH})`);
      expect(stdout).toContain(`base: ${tip}`);
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");
    });

    it("refuses origin's tip where it does not descend from its record's Base:, naming both, creating no branch", async () => {
      const { clone, tip, recordBase } = await seedContinuation({ base: "side" });

      const { code, doc } = await run(clone, START);

      expect(code).toBe(1);
      const error = JSON.stringify(doc["error"]);
      expect(error).toContain(`origin's ${RUN_BRANCH} at ${tip} does not descend from its record's Base: ${recordBase}`);
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");
    });

    it("refuses origin's tip where it carries no run record, creating no branch", async () => {
      const { clone, tip } = await seedContinuation({ record: false });

      const { code, doc } = await run(clone, START);

      expect(code).toBe(1);
      expect(JSON.stringify(doc["error"])).toContain(`origin's ${RUN_BRANCH} at ${tip} carries no run record at ${RECORD}`);
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");
    });

    // review/5: each of originRunTip's other refusals, every one before anything is switched.
    it.each([
      { shape: "a record that names no Base:", opts: { record: "no Base:" as const }, says: "carries a run record that names no Base:" },
      {
        shape: "a record whose Base: names no commit here",
        opts: { recordBase: "0123456789abcdef0123456789abcdef01234567" },
        says: "carries a run record whose Base: 0123456789abcdef0123456789abcdef01234567 names no commit here",
      },
      { shape: "a link at the record's path", opts: { record: "link" as const }, says: `carries no run record at ${RECORD}` },
    ])("refuses origin's tip carrying $shape, creating no branch", async ({ opts, says }) => {
      const { clone, tip } = await seedContinuation(opts);

      const { code, doc } = await run(clone, START);

      expect(code).toBe(1);
      expect(JSON.stringify(doc["error"])).toContain(`origin's ${RUN_BRANCH} at ${tip} ${says}`);
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");
    });

    it("refuses origin's tip where git merge-base cannot read the history between it and its Base:, creating no branch", async () => {
      const { clone } = await seedContinuation();
      // Origin's tip two commits past Base:, the middle commit's object gone from this clone.
      const base = git(clone, ["rev-parse", "main"]);
      git(clone, ["switch", "-q", "-c", "scratch"]);
      await mkdir(join(clone, ".stamity", "runs", RUN), { recursive: true });
      await writeFile(join(clone, RECORD), `# Run ${RUN}\n\nStatus: in progress\nMode: attended\nBranch: ${RUN_BRANCH}\nBase: ${base}\n`);
      git(clone, ["add", "--", RECORD]);
      git(clone, ["commit", "-q", "-m", "middle"]);
      const middle = git(clone, ["rev-parse", "HEAD"]);
      await writeFile(join(clone, "c.txt"), "c\n");
      git(clone, ["add", "--", "c.txt"]);
      git(clone, ["commit", "-q", "-m", "tip"]);
      const tip = git(clone, ["rev-parse", "HEAD"]);
      git(clone, ["switch", "-q", "main"]);
      git(clone, ["branch", "-q", "-D", "scratch"]);
      git(clone, ["update-ref", `refs/remotes/origin/${RUN_BRANCH}`, tip]);
      await rm(join(clone, ".git", "objects", middle.slice(0, 2), middle.slice(2)));

      const { code, doc } = await run(clone, START);

      expect(code).toBe(1);
      expect(JSON.stringify(doc["error"])).toContain(`origin's ${RUN_BRANCH} at ${tip} could not be read against its record's Base: ${base} (git merge-base answered`);
      expect(current(clone)).toBe("main");
      expect(git(clone, ["branch", "--list", RUN_BRANCH])).toBe("");
    });

    // review/4: a shallow clone's cut history reads as a tip that does not descend from its Base:; the refusal names a
    // deeper fetch rather than sending a person to a history that is fine.
    it("names a deeper fetch where a shallow clone refuses origin's tip as not descending from its Base:", async () => {
      const { remote, tip, recordBase } = await seedContinuation();
      const shallow = getRoot().path(`shallow-${Math.random().toString(36).slice(2, 8)}`);
      git(getRoot().path(), ["clone", "-q", "--depth", "1", "--no-single-branch", pathToFileURL(remote).href, shallow]);
      await writeFile(join(shallow, ".git", "config"), NO_AUTO_MAINTENANCE, { flag: "a" });

      const { code, doc } = await run(shallow, START);

      expect(code).toBe(1);
      const error = JSON.stringify(doc["error"]);
      expect(error).toContain(`origin's ${RUN_BRANCH} at ${tip} does not descend from its record's Base: ${recordBase}`);
      expect(error).toContain("this clone is shallow");
      expect(error).toContain("git fetch --unshallow origin");
      expect(current(shallow)).toBe("main");
    });

    it("names no deeper fetch where a full clone refuses origin's tip as not descending from its Base:", async () => {
      const { clone } = await seedContinuation({ base: "side" });

      const { doc } = await run(clone, START);

      expect(JSON.stringify(doc["error"])).not.toContain("--unshallow");
    });

    // review/5: on a continuation the pin is the one origin's tip commits, read from its tree under --dry-run and from
    // the checkout after the switch, as for an existing branch (pr/4, pr/28).
    it("compares origin with the pin origin's tip commits, under --dry-run and after the switch", async () => {
      const pin = '{"host":"github.com","owner":"o","repo":"r"}\n';
      const kept = await seedContinuation({ pin });
      const moved = await seedContinuation({ pin });
      git(kept.clone, ["remote", "set-url", "origin", "https://github.com/o/r.git"]);
      git(moved.clone, ["remote", "set-url", "origin", "https://github.com/elsewhere/r.git"]);
      restDefault("main");

      const preview = await run(kept.clone, ["start", "--run", RUN, "--dry-run"]);
      const previewMoved = await run(moved.clone, [...START, "--dry-run"]);

      expect(preview.code).toBe(0);
      expect(preview.stdout).toContain(`origin: github.com/o/r (pinned in ${PIN}, kept)`);
      expect(previewMoved.code).toBe(1);
      expect(JSON.stringify(previewMoved.doc["error"])).toContain("pins github.com/o/r, and origin now names github.com/elsewhere/r");
      expect(JSON.stringify(previewMoved.doc["error"])).not.toContain("the checkout is on");
      for (const { clone } of [kept, moved]) expect(current(clone)).toBe("main");

      const started = await run(kept.clone, ["start", "--run", RUN]);
      const refused = await run(moved.clone, START);

      expect(started.code).toBe(0);
      expect(started.stdout).toContain(`origin: github.com/o/r (pinned in ${PIN}, kept)`);
      expect(git(kept.clone, ["rev-parse", "HEAD"])).toBe(kept.tip);
      expect(refused.code).toBe(1);
      expect(JSON.stringify(refused.doc["error"])).toContain(`pins github.com/o/r, and origin now names github.com/elsewhere/r; the checkout is on ${RUN_BRANCH} now`);
    });
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

  describe("origin/HEAD, the shell guard's default branch (pr/55)", () => {
    const originHead = (repo: string): string | null => {
      try {
        return git(repo, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);
      } catch {
        return null;
      }
    };

    /**
     * The person-only guard's decision on `command` in `repo`, the guard emitted where the engine writes it: the
     * reason it stops the call with, an ask's or a refusal's, or null when it lets the call through.
     */
    async function guardDenies(repo: string, command: string): Promise<string | null> {
      const guard = planCoreHookScripts("../../agent-tool-policies.json", "claude", { packageName: canonical().name, version: "1.0.0-golden", personOnlyGuard: true }).find(
        (script) => script.fileName === PERSON_ONLY_GUARD_FILE,
      );
      if (guard === undefined) throw new Error("the plan carried no person-only guard");
      const dir = join(repo, ".stamity", "generated", "hooks", "claude");
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, guard.fileName), guard.content);
      const env = { ...process.env };
      delete env.STAMITY_UNATTENDED;
      delete env.STAMITY_REPO_ROOT;
      const input = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: "." });
      const result = spawnSync(process.execPath, [join(dir, guard.fileName)], { input, encoding: "utf8", env });
      // TEST CHANGE (v0a2, REQ-FLOW-123, REQ-FLOW-124): attended, Claude Code's guard now asks for an act that can be
      // undone (a push of the default branch among them) through its `hookSpecificOutput` ask on stdout with exit 0, and
      // refuses only a deletion, a force push or an act that cannot be undone, on exit 2. Either one stops the call.
      if (result.status !== 0) return String(result.stderr);
      if (String(result.stdout).trim() === "") return null;
      const output = JSON.parse(String(result.stdout)) as { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } };
      const decided = output.hookSpecificOutput;
      return decided?.permissionDecision === "ask" ? String(decided.permissionDecisionReason) : null;
    }

    it("points an absent origin/HEAD at the default branch REST names, so the guard then refuses its push", async () => {
      const repo = await seedRepo({ branch: "develop" });
      restDefault("develop");
      // Non-degenerate: with no origin/HEAD the guard counts only main and master, and lets this push through.
      expect(await guardDenies(repo, "git push origin develop")).toBeNull();

      const { code, stdout } = await run(repo, ["start", "--run", RUN]);

      expect(code).toBe(0);
      expect(originHead(repo)).toBe("refs/remotes/origin/develop");
      expect(stdout).toContain("origin/HEAD: pointed at refs/remotes/origin/develop (was absent), so the shell guard counts develop as the default branch");
      expect(await guardDenies(repo, "git push origin develop")).toContain("push-default");
      expect(await guardDenies(repo, "git push origin feat/y")).toBeNull();
    });

    it("rewrites a stale origin/HEAD naming main to the branch REST names, on a kept branch too", async () => {
      const repo = await seedRepo();
      restDefault("develop");
      git(repo, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
      git(repo, ["switch", "-q", "-c", "feat/x"]);

      const { code, stdout } = await run(repo, ["start", "--run", RUN]);

      expect(code).toBe(0);
      expect(current(repo)).toBe("feat/x");
      expect(originHead(repo)).toBe("refs/remotes/origin/develop");
      expect(stdout).toContain("origin/HEAD: pointed at refs/remotes/origin/develop (was naming refs/remotes/origin/main)");
    });

    it("leaves origin/HEAD alone where it already names the default, and where REST gives no answer", async () => {
      const named = await seedRepo();
      const silent = await seedRepo();
      const absent = await seedRepo({ url: "https://gitlab.com/o/r.git" });
      git(named, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
      git(silent, ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
      restDefault("main");

      const same = await run(named, ["start", "--run", RUN]);
      rest.routes.clear();
      const none = await run(silent, ["start", "--run", RUN]);
      const off = await run(absent, ["start", "--run", RUN]);

      expect([same.code, none.code, off.code]).toEqual([0, 0, 0]);
      expect(originHead(named)).toBe("refs/remotes/origin/main");
      expect(originHead(silent)).toBe("refs/remotes/origin/trunk");
      expect(originHead(absent)).toBeNull();
      for (const result of [same, none, off]) expect(result.stdout).not.toContain("origin/HEAD:");
    });

    it("writes nothing under --dry-run, and says what it would point the ref at", async () => {
      const repo = await seedRepo({ branch: "develop" });
      restDefault("develop");

      const { code, stdout } = await run(repo, ["start", "--run", RUN, "--dry-run"]);

      expect(code).toBe(0);
      expect(originHead(repo)).toBeNull();
      expect(stdout).toContain("origin/HEAD: would point at refs/remotes/origin/develop (absent)");
    });

    it("refuses an unattended start where only the main/master fallback answered, and lets an attended one keep the branch", async () => {
      const byVariable = await seedRepo({ branch: "develop", url: null });
      const byRecord = await seedRepo({ branch: "develop", url: null });
      const attended = await seedRepo({ branch: "develop", url: null });
      await mkdir(join(byRecord, ".stamity", "runs", RUN), { recursive: true });
      await writeFile(join(byRecord, ".stamity", "runs", RUN, "record.md"), "# Run\n\nStatus: in progress\nMode: unattended\n");

      const refused = await run(byVariable, START, { STAMITY_UNATTENDED: "1" });
      const fromRecord = await run(byRecord, START);
      const kept = await run(attended, START);

      for (const [result, repo] of [[refused, byVariable], [fromRecord, byRecord]] as const) {
        expect(result.code).toBe(1);
        expect(JSON.stringify(result.doc["error"])).toContain("run start refused: no source named the default branch");
        expect(current(repo)).toBe("develop");
        expect(existsSync(join(repo, ".stamity", "runs", RUN, "origin.json"))).toBe(false);
      }
      expect(kept.code).toBe(0);
      expect(kept.doc).toMatchObject({ branch: "develop", created: false });
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
