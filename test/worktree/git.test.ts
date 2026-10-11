import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { EngineError } from "../../src/types/errors.ts";
import {
  addWorktree,
  readDirtyCounts,
  runGit,
  type GitInvocation,
  type GitOutcome,
  type WorktreeGitRunner,
} from "../../src/worktree/git.ts";
import { NO_GIT_CONFIG } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * U3: `addWorktree`'s retry of the Windows `commondir` race.
 *
 * **Stubbed runner, deliberately** — the sibling suite (`engine.test.ts`) drives
 * real git for everything git actually decides, and says so in its own header.
 * This one cannot: the behaviour under test is a race inside Git's OWN
 * administrative write (`.git/worktrees/<other>/commondir`) that only Windows
 * loses, observed on the CI Windows leg and not reproducible on demand on any
 * platform — darwin and Linux run the same two concurrent adds green every time.
 * What is replayable is the exit status and the stderr git printed when it lost,
 * both recorded verbatim below, and what this file asserts is entirely OUR
 * decision over them: retry once, or do not. No claim about git is made here.
 */

/** Git 2.55.0.windows.5, recorded on the CI Windows leg: two concurrent adds. */
const COMMONDIR_RACE_STDERR =
  "Preparing worktree (new branch 'alpha')\n" +
  "fatal: failed to read .git/worktrees/beta/commondir: No error\n";

/** A 128 that is git answering the request, not losing a race with itself. */
const OTHER_128_STDERR = "fatal: invalid reference: origin/does-not-exist\n";

function outcome(status: number, stderr = ""): GitOutcome {
  return { status, stdout: "", stderr };
}

/** Replays `outcomes` in order and records what each call was invoked with. */
function scriptedRunner(outcomes: readonly GitOutcome[]): {
  run: WorktreeGitRunner;
  calls: GitInvocation[];
} {
  const calls: GitInvocation[] = [];
  const run: WorktreeGitRunner = (invocation) => {
    calls.push(invocation);
    const next = outcomes[calls.length - 1];
    if (next === undefined) throw new Error(`unscripted git call #${calls.length}`);
    return Promise.resolve(next);
  };
  return { run, calls };
}

const REQUEST = { path: "/repo/.worktrees/alpha", branch: "alpha", kind: "create" } as const;

/**
 * TEST CHANGE (prove/9): `addWorktree` now reads `refs/heads/<branch>` before a
 * `create` or `track` add, and again after a lost race, so every scripted
 * sequence below opens with that `show-ref` answer. Status 1 is "no such ref".
 */
const NO_BRANCH = outcome(1);
const HAS_BRANCH = outcome(0);

/** Git's refusal of `-b` for a branch that exists (git 2.52.0, exit 255). */
const BRANCH_EXISTS_STDERR = "fatal: a branch named 'alpha' already exists\n";

describe("addWorktree and the commondir race", () => {
  it("retries once after the race and lands the worktree", async () => {
    const { run, calls } = scriptedRunner([
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      NO_BRANCH,
      outcome(0),
    ]);

    await addWorktree(run, "/repo", REQUEST);

    expect(calls).toHaveLength(4);
    // TEST CHANGE (prove/9): the pin moved from calls[0]/[1] to calls[1]/[3]
    // for the two `show-ref` reads. When the raced attempt left no branch, the
    // retry still re-runs the IDENTICAL command: same argv, same cwd.
    expect(calls[1]?.args).toEqual(["worktree", "add", "-b", "alpha", "/repo/.worktrees/alpha"]);
    expect(calls[3]?.args).toEqual(calls[1]?.args);
    expect(calls[3]?.cwd).toBe("/repo");
  });

  it("attaches on the retry when the raced attempt left the branch it created", async () => {
    // prove/9: git creates the `-b` branch before it reads the sibling's
    // commondir, so the lost attempt leaves the branch and no directory.
    const { run, calls } = scriptedRunner([
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      HAS_BRANCH,
      outcome(0),
    ]);

    await addWorktree(run, "/repo", REQUEST);

    expect(calls).toHaveLength(4);
    expect(calls[0]?.args).toEqual(["show-ref", "--verify", "--quiet", "refs/heads/alpha"]);
    expect(calls[2]?.args).toEqual(["show-ref", "--verify", "--quiet", "refs/heads/alpha"]);
    expect(calls[3]?.args).toEqual(["worktree", "add", "/repo/.worktrees/alpha", "alpha"]);
    expect(calls[3]?.cwd).toBe("/repo");
  });

  it("treats a race on `track` like one on `create`", async () => {
    const { run, calls } = scriptedRunner([
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      HAS_BRANCH,
      outcome(0),
    ]);

    await addWorktree(run, "/repo", { ...REQUEST, kind: "track" });

    expect(calls).toHaveLength(4);
    expect(calls[1]?.args).toEqual([
      "worktree",
      "add",
      "--track",
      "-b",
      "alpha",
      "/repo/.worktrees/alpha",
      "origin/alpha",
    ]);
    expect(calls[3]?.args).toEqual(["worktree", "add", "/repo/.worktrees/alpha", "alpha"]);
  });

  it("never attaches to a branch that existed before the call, and still refuses", async () => {
    const { run, calls } = scriptedRunner([
      HAS_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      outcome(255, BRANCH_EXISTS_STDERR),
    ]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).message).toContain('The branch "alpha" already exists');
    // No second `show-ref`, and the retry is the same `-b` command.
    expect(calls).toHaveLength(3);
    expect(calls[2]?.args).toEqual(calls[1]?.args);
  });

  it("names the branch, not the path, when git refuses `-b` for an existing branch", async () => {
    const { run } = scriptedRunner([NO_BRANCH, outcome(255, BRANCH_EXISTS_STDERR)]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).message).toContain('The branch "alpha" already exists');
    expect((error as EngineError).message).not.toContain("/repo/.worktrees/alpha already exists");
  });

  it("does not retry a 128 that is not the race, and propagates it", async () => {
    const { run, calls } = scriptedRunner([NO_BRANCH, outcome(128, OTHER_128_STDERR)]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("FS_ERROR");
    expect((error as EngineError).why).toContain("invalid reference");
    expect((error as EngineError).message).not.toContain("retried");
    expect(calls).toHaveLength(2);
  });

  it("treats a second race stderr as a real failure and says it retried once", async () => {
    const { run, calls } = scriptedRunner([
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
    ]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("FS_ERROR");
    expect((error as EngineError).message).toContain("/repo/.worktrees/alpha");
    expect((error as EngineError).message).toContain("retried once after the commondir race");
    expect((error as EngineError).why).toContain("commondir");
    expect(calls).toHaveLength(4);
  });

  it("classifies the retry's own answer, so a partial first attempt still refuses", async () => {
    // The first attempt lost the race after creating the directory; git answers
    // the re-run with "already exists". That is a VALIDATION_ERROR the operator
    // can act on, not the FS_ERROR the raced attempt would have produced.
    const { run, calls } = scriptedRunner([
      NO_BRANCH,
      outcome(128, COMMONDIR_RACE_STDERR),
      NO_BRANCH,
      outcome(128, "fatal: '/repo/.worktrees/alpha' already exists\n"),
    ]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).message).toContain("already exists");
    expect(calls).toHaveLength(4);
  });

  it("does not retry a non-128 status carrying the race sentence", async () => {
    // The pair is the signal: git reports this race as 128. A different status
    // with the same words is a different failure, and waiting on it only delays
    // the message.
    const { run, calls } = scriptedRunner([NO_BRANCH, outcome(1, COMMONDIR_RACE_STDERR)]);

    await expect(addWorktree(run, "/repo", REQUEST)).rejects.toBeInstanceOf(EngineError);

    expect(calls).toHaveLength(2);
  });
});

/**
 * The lane's one spawn, against the real binary: the two options ahead of every
 * command are git's own to honour, so no stub can stand in for it. The folder is
 * the shape `test/cli/engine/gitStatus.test.ts` builds for the pinned reads
 * (review/112), marker-writing monitor included, and nothing more.
 */
describe("runGit at a root shaped like a bare repository", () => {
  const getRoot = useTempDir("worktree-git");

  /** Sync git for seeding only, the host's global and system config cut off. */
  function seedGit(cwd: string, args: readonly string[]): void {
    execFileSync("git", [...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
        GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
        GIT_AUTHOR_NAME: "Fixture One",
        GIT_AUTHOR_EMAIL: "fixture.invalid",
        GIT_COMMITTER_NAME: "Fixture One",
        GIT_COMMITTER_EMAIL: "fixture.invalid",
      },
      windowsHide: true,
    });
  }

  /** The lane keeps its caller's environment, so the read is isolated by `HOME`, restored after. */
  async function withEmptyHome<T>(home: string, body: () => Promise<T>): Promise<T> {
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: home, GIT_CEILING_DIRECTORIES: getRoot().dir };
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      return await body();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("fails the dirty count and runs no file-system monitor the folder configures", async (ctx) => {
    const root = getRoot().path("planted");
    await mkdir(root);
    const marker = getRoot().path("ran").replaceAll("\\", "/");
    try {
      seedGit(root, ["init", "-q", "--bare", "."]);
    } catch {
      ctx.skip();
    }
    await getRoot().seedFiles({ "planted/AGENTS.md": "# Charter\n" });
    seedGit(root, ["--git-dir=.", "--work-tree=.", "add", "--", "AGENTS.md"]);
    seedGit(root, ["--git-dir=.", "--work-tree=.", "commit", "-q", "-m", "planted"]);
    seedGit(root, ["config", "--file", "config", "core.bare", "false"]);
    seedGit(root, ["config", "--file", "config", "core.worktree", "."]);
    seedGit(root, ["config", "--file", "config", "core.fsmonitor", `touch '${marker}'; false`]);

    const failure = await withEmptyHome(getRoot().path("home"), () =>
      readDirtyCounts(runGit, root).then(
        () => null,
        (error: unknown) => error,
      ),
    );

    expect(existsSync(marker)).toBe(false);
    expect(failure).toBeInstanceOf(EngineError);
    expect((failure as EngineError).code).toBe("FS_ERROR");
  });

  it("still counts a real checkout's changes", async (ctx) => {
    const root = getRoot().path("repo");
    await mkdir(root);
    try {
      seedGit(root, ["init", "-q"]);
    } catch {
      ctx.skip();
    }
    await getRoot().seedFiles({ "repo/tracked.txt": "one\n", "repo/untracked.txt": "x\n" });
    seedGit(root, ["add", "--", "tracked.txt"]);

    const counts = await withEmptyHome(getRoot().path("home"), () => readDirtyCounts(runGit, root));

    expect(counts).toEqual({ modified: 1, untracked: 1 });
  });
});
