import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyRunCleanup, closingRef, planRunCleanup } from "../../src/runs/runCleanup.ts";
import { runGit, type WorktreeGitRunner } from "../../src/worktree/git.ts";
import { createWorktreeReceipt, sha256Hex, writeWorktreeReceipt, type WorktreeReceiptEntry } from "../../src/worktree/receipt.ts";
import { NO_GIT_CONFIG } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * d-run-cleanup (REQ-FLOW-176): a landed run cleans up what it started, and nothing else. Real git throughout, in
 * temp repositories with a real bare origin beside them: what is asserted is what git did to the lanes, the branch
 * and the refs, read back from git. No seam is stood in for.
 */

const RUN = "2026-11-09_cleanup-case";
const OTHER_RUN = "2026-11-08_another-run";
const BRANCH = `stamity/${RUN}`;
const TRACKING = `refs/remotes/origin/${BRANCH}`;

const ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_AUTHOR_NAME: "A", GIT_AUTHOR_EMAIL: "a@example.com", GIT_COMMITTER_NAME: "A", GIT_COMMITTER_EMAIL: "a@example.com" };

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...ENV } }).trim();
}

const hasRef = (repo: string, ref: string): boolean => {
  try {
    git(repo, ["show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
};

describe("a landed run's clean-up", () => {
  const getRoot = useTempDir("run-cleanup");

  beforeEach(() => {
    // The engine's git runner reads the process environment; the case's git must read no machine-wide config.
    for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  interface Seeded {
    dir: string;
    repo: string;
    remote: string;
    farm: string;
  }

  /**
   * A repository on `main` with a bare origin, `.gitignore` naming `captures/` and `.env`, and the run's branch
   * `stamity/<run-id>` pushed with its upstream set and merged into `main` with a merge commit, as a landed run leaves it.
   */
  async function seed(): Promise<Seeded> {
    const dir = getRoot().path(`case-${Math.random().toString(36).slice(2, 8)}`);
    const repo = join(dir, "repo");
    const remote = join(dir, "remote.git");
    await mkdir(repo, { recursive: true });
    git(dir, ["init", "-q", "--bare", remote]);
    git(repo, ["-c", "init.defaultBranch=main", "init", "-q"]);
    await appendFile(join(repo, ".git", "config"), "[gc]\n\tauto = 0\n[maintenance]\n\tauto = false\n");
    await writeFile(join(repo, ".gitignore"), "captures/\n.env\n");
    await writeFile(join(repo, "a.txt"), "a\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "seed"]);
    git(repo, ["remote", "add", "origin", remote]);
    git(repo, ["push", "-q", "origin", "main"]);
    git(repo, ["switch", "-q", "-c", BRANCH]);
    await writeFile(join(repo, "b.txt"), "b\n");
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "work"]);
    git(repo, ["push", "-q", "-u", "origin", BRANCH]);
    git(repo, ["switch", "-q", "main"]);
    git(repo, ["merge", "-q", "--no-ff", "-m", "land", BRANCH]);
    return { dir, repo, remote, farm: join(dir, ".stamity-worktrees", "repo") };
  }

  /** A lane in the farm on its own branch, its receipt tagged with `run` (none where `null`), carrying `entries`. */
  async function lane(at: Seeded, name: string, run: string | null, entries: WorktreeReceiptEntry[] = []): Promise<string> {
    const path = join(at.farm, name);
    git(at.repo, ["worktree", "add", "-q", "-b", `lane/${name}`, path]);
    const gitDir = resolve(path, git(path, ["rev-parse", "--git-dir"]));
    await writeWorktreeReceipt(
      gitDir,
      createWorktreeReceipt({
        createdAt: "2026-11-09T00:00:00.000Z",
        engineVersion: "0.0.0-test",
        ...(run === null ? {} : { run }),
        worktree: { path, branch: `lane/${name}`, head: git(path, ["rev-parse", "HEAD"]) },
        entries,
      }),
    );
    return path;
  }

  it("removes the run's tagged clean lane, deletes its merged branch, and writes one act each", async () => {
    const at = await seed();
    const path = await lane(at, "p-one", RUN);

    const plan = await planRunCleanup(at.repo, RUN);
    expect(plan).toEqual({ run: RUN, lanes: [{ path, ignored: [], dirty: false }], branch: { name: BRANCH, merged: true }, staleTracking: [] });

    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: at.repo });

    expect(done).toEqual({ removed: [path, BRANCH], kept: [], acts: ["removed lane p-one", `deleted branch ${BRANCH}`] });
    expect(existsSync(path)).toBe(false);
    expect(git(at.repo, ["worktree", "list", "--porcelain"])).not.toContain(path);
    expect(hasRef(at.repo, `refs/heads/${BRANCH}`)).toBe(false);
    // The lane's own branch and the remote branch are not the run branch's clean-up: both stay.
    expect(hasRef(at.repo, "refs/heads/lane/p-one")).toBe(true);
    expect(git(at.remote, ["branch", "--list", BRANCH])).toContain(BRANCH);
  });

  it("keeps a lane holding an ignored file and names the file, and removes one whose only ignored file is its unchanged placed copy", async () => {
    const at = await seed();
    const kept = await lane(at, "p-capture", RUN);
    await mkdir(join(kept, "captures"), { recursive: true });
    await writeFile(join(kept, "captures", "run.txt"), "a capture\n");
    const env = "TOKEN_NAME=placeholder\n";
    const placed = await lane(at, "p-placed", RUN, [{ path: ".env", strategy: "copy", sha256: sha256Hex(env) }]);
    await writeFile(join(placed, ".env"), env);
    const edited = await lane(at, "p-edited", RUN, [{ path: ".env", strategy: "copy", sha256: sha256Hex(env) }]);
    await writeFile(join(edited, ".env"), "TOKEN_NAME=edited\n");

    const plan = await planRunCleanup(at.repo, RUN);
    expect(plan.lanes).toEqual([
      { path: kept, ignored: ["captures/"], dirty: false },
      { path: edited, ignored: [".env"], dirty: false },
      { path: placed, ignored: [], dirty: false },
    ]);
    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: at.repo });

    expect(done.kept).toEqual([
      { path: kept, reason: "it holds ignored files: captures/" },
      { path: edited, reason: "it holds ignored files: .env" },
    ]);
    expect(done.removed).toContain(placed);
    expect(existsSync(join(kept, "captures", "run.txt"))).toBe(true);
    expect(existsSync(join(edited, ".env"))).toBe(true);
    expect(existsSync(placed)).toBe(false);
  });

  it("keeps a dirty lane and touches no untagged lane, no other run's lane, and no lane the verb runs in", async () => {
    const at = await seed();
    const dirty = await lane(at, "p-dirty", RUN);
    await writeFile(join(dirty, "a.txt"), "changed\n");
    const untagged = await lane(at, "p-hand", null);
    const other = await lane(at, "p-other", OTHER_RUN);
    const inside = await lane(at, "p-inside", RUN);

    const plan = await planRunCleanup(at.repo, RUN);
    expect(plan.lanes.map((entry) => entry.path).toSorted()).toEqual([dirty, inside].toSorted());
    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: inside });

    expect(done.kept).toEqual(
      expect.arrayContaining([
        { path: dirty, reason: "it holds uncommitted changes" },
        { path: inside, reason: "the verb runs inside it" },
      ]),
    );
    for (const path of [dirty, untagged, other, inside]) expect(existsSync(path)).toBe(true);
  });

  it("keeps a branch that is not merged, and one that a checkout has", async () => {
    const at = await seed();
    git(at.repo, ["switch", "-q", BRANCH]);
    git(at.repo, ["branch", "-q", "--unset-upstream"]);
    await writeFile(join(at.repo, "c.txt"), "c\n");
    git(at.repo, ["add", "-A"]);
    git(at.repo, ["commit", "-q", "-m", "not pushed, not merged"]);

    const held = await planRunCleanup(at.repo, RUN);
    expect(held.branch).toEqual({ name: BRANCH, merged: true });
    expect((await applyRunCleanup(held, { dryRun: false, rootDir: at.repo })).kept).toEqual([{ path: BRANCH, reason: `checked out at ${at.repo}` }]);

    git(at.repo, ["switch", "-q", "main"]);
    const unmerged = await planRunCleanup(at.repo, RUN);
    expect(unmerged.branch).toEqual({ name: BRANCH, merged: false });
    const done = await applyRunCleanup(unmerged, { dryRun: false, rootDir: at.repo });

    expect(done.kept).toEqual([{ path: BRANCH, reason: "not merged into its upstream or HEAD, so git branch -d would refuse it" }]);
    expect(hasRef(at.repo, `refs/heads/${BRANCH}`)).toBe(true);
  });

  it("drops the tracking ref only once origin no longer has the branch", async () => {
    const at = await seed();
    expect((await planRunCleanup(at.repo, RUN)).staleTracking).toEqual([]);

    // GitHub's delete-on-merge, as the bare origin sees it; the local tracking ref is left behind.
    git(at.remote, ["branch", "-q", "-D", BRANCH]);
    const plan = await planRunCleanup(at.repo, RUN);
    expect(plan.staleTracking).toEqual([TRACKING]);
    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: at.repo });

    expect(done.removed).toEqual([BRANCH, TRACKING]);
    expect(done.acts).toEqual([`deleted branch ${BRANCH}`, `dropped origin/${BRANCH}, which origin no longer has`]);
    expect(hasRef(at.repo, TRACKING)).toBe(false);
  });

  it("acts on nothing in a dry run, naming what would go", async () => {
    const at = await seed();
    const path = await lane(at, "p-dry", RUN);

    const done = await applyRunCleanup(await planRunCleanup(at.repo, RUN), { dryRun: true, rootDir: at.repo });

    expect(done).toEqual({ removed: [path, BRANCH], kept: [], acts: [] });
    expect(existsSync(path)).toBe(true);
    expect(hasRef(at.repo, `refs/heads/${BRANCH}`)).toBe(true);
  });

  // review/43: `git worktree remove` takes a detached HEAD's reflog with the lane, so commits only it holds would be lost.
  it("keeps a detached lane, its commit on no ref, and names why", async () => {
    const at = await seed();
    const path = await lane(at, "p-detached", RUN);
    git(path, ["switch", "-q", "--detach"]);
    await writeFile(join(path, "d.txt"), "d\n");
    git(path, ["add", "-A"]);
    git(path, ["commit", "-q", "-m", "on no branch"]);
    const tip = git(path, ["rev-parse", "HEAD"]);

    const plan = await planRunCleanup(at.repo, RUN);
    expect(plan.lanes).toEqual([{ path, ignored: [], dirty: false, head: "detached" }]);
    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: at.repo });

    expect(done.kept).toEqual([{ path, reason: "its HEAD is detached, so commits only it holds would drop off every ref" }]);
    expect(done.acts).toEqual([`deleted branch ${BRANCH}`]);
    expect(existsSync(path)).toBe(true);
    expect(git(path, ["rev-parse", "HEAD"])).toBe(tip);
  });

  // review/39: past its wall time the runner rejects; the tracking ref stays and the local clean-up still runs.
  it("keeps the tracking ref when origin's read never finishes, and still removes the lane and the branch", async () => {
    const at = await seed();
    const path = await lane(at, "p-slow", RUN);
    git(at.remote, ["branch", "-q", "-D", BRANCH]);
    const timeouts: (number | undefined)[] = [];
    // Mock reason: a network read that hangs past its wall time cannot be brought about against a local bare origin.
    const slow: WorktreeGitRunner = (invocation) => {
      if (invocation.args[0] !== "ls-remote") return runGit(invocation);
      timeouts.push(invocation.timeoutMs);
      return Promise.reject(new Error("git did not finish within its wall time"));
    };

    const plan = await planRunCleanup(at.repo, RUN, slow);
    expect(timeouts).toEqual([60_000]);
    expect(plan.staleTracking).toEqual([]);
    const done = await applyRunCleanup(plan, { dryRun: false, rootDir: at.repo, git: slow });

    expect(done.removed).toEqual([path, BRANCH]);
    expect(hasRef(at.repo, TRACKING)).toBe(true);
  });

  // review/40: an act that throws after a lane went is a kept row, so the lane's act still reaches the record.
  it("keeps the acts already done when a later step throws", async () => {
    const at = await seed();
    const path = await lane(at, "p-first", RUN);
    // Mock reason: the runner rejecting on one call (git not finishing) cannot be brought about with a real git.
    const failing: WorktreeGitRunner = (invocation) =>
      invocation.args[0] === "branch" && invocation.args[1] === "-d" ? Promise.reject(new Error("git did not finish within its wall time")) : runGit(invocation);

    const done = await applyRunCleanup(await planRunCleanup(at.repo, RUN), { dryRun: false, rootDir: at.repo, git: failing });

    expect(done.acts).toEqual(["removed lane p-first"]);
    expect(done.removed).toEqual([path]);
    expect(done.kept).toEqual([{ path: BRANCH, reason: "the branch was not deleted: git did not finish within its wall time" }]);
    expect(hasRef(at.repo, `refs/heads/${BRANCH}`)).toBe(true);
  });

  it("reads no branch and no lane for a run that started none", async () => {
    const at = await seed();

    expect(await planRunCleanup(at.repo, OTHER_RUN)).toEqual({ run: OTHER_RUN, lanes: [], branch: null, staleTracking: [] });
    await expect(planRunCleanup(at.repo, "not a run")).rejects.toThrow(/is not a run id/);
  });
});

describe("closingRef", () => {
  const origin = { owner: "Octo", repo: "Repo" };

  it("names an item in origin's repository, its case as written", () => {
    expect(closingRef("octo/repo#42", origin)).toBe("octo/repo#42");
    // review/38: an owner with `_`, as every Enterprise Managed Users login carries.
    expect(closingRef("jdoe_acme/app#5", { owner: "jdoe_acme", repo: "app" })).toBe("jdoe_acme/app#5");
  });

  it("names nothing for no item, an item elsewhere, or a value of another shape", () => {
    expect(closingRef(undefined, origin)).toBeNull();
    expect(closingRef("octo/other#42", origin)).toBeNull();
    expect(closingRef("someone/repo#42", origin)).toBeNull();
    expect(closingRef("octo/repo#0", origin)).toBeNull();
    expect(closingRef("octo/..#1", { owner: "octo", repo: ".." })).toBeNull();
    expect(closingRef("octo/repo#42 -->", origin)).toBeNull();
  });
});
