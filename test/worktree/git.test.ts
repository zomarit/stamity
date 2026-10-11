import { execFileSync } from "node:child_process";
// Type-only, so the `importOriginal<...>()` argument below adds no runtime
// import that could race the `vi.mock` hoisting.
import type * as ChildProcessModule from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
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
 * Every argument array the lane hands `spawn` for git, and the program each
 * call named. A spy, not a stub: the real `spawn` still runs. The options the
 * lane puts ahead of each command are the subject, only the real call site
 * spells them, and a case that looks at what git did cannot tell them from a
 * refusal that came from somewhere else.
 *
 * TEST CHANGE, justified: the lane starts git by the absolute path it resolved
 * on `PATH`, where it used to hand `spawn` the bare name, so the spy matched
 * `args[0] === "git"` and would now record nothing. It matches the program's
 * file name instead, bare or under a folder, and keeps the program so a case
 * can pin how git was named. Every existing assertion over `args` is unchanged.
 */
const gitSpawns = vi.hoisted(() => ({ args: [] as string[][], programs: [] as string[] }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcessModule>();
  const original = actual.spawn as unknown as (...args: unknown[]) => unknown;
  return {
    ...actual,
    spawn: (...args: unknown[]): unknown => {
      if (/(?:^|[\\/])git(?:\.exe|\.com)?$/i.test(String(args[0])) && Array.isArray(args[1])) {
        gitSpawns.programs.push(String(args[0]));
        gitSpawns.args.push(args[1].map(String));
      }
      return original(...args);
    },
  };
});

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

  /** The lane keeps its caller's environment, so the read is isolated by `HOME`, restored after; `extra` rides along. */
  async function withEmptyHome<T>(home: string, body: () => Promise<T>, extra: Record<string, string> = {}): Promise<T> {
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: home, GIT_CEILING_DIRECTORIES: getRoot().dir, ...extra };
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

  // A git older than 2.38 does not know `safe.bareRepository`, so the lane looks
  // at the folder before it starts git: the refusal below is the lane's own,
  // in the shape of git's (status 128, nothing on stdout), on any git version.
  it("is not handed to git: the refusal is the lane's own, shaped like git's", async (ctx) => {
    const root = getRoot().path("planted");
    await mkdir(root);
    try {
      seedGit(root, ["init", "-q", "--bare", "."]);
    } catch {
      ctx.skip();
    }
    seedGit(root, ["config", "--file", "config", "core.bare", "false"]);
    seedGit(root, ["config", "--file", "config", "core.worktree", "."]);
    const below = getRoot().path("planted", "packages");
    await mkdir(below);
    gitSpawns.args.length = 0;

    const outcomes = await withEmptyHome(getRoot().path("home"), () =>
      Promise.all([root, below].map((cwd) => runGit({ args: ["rev-parse", "--show-toplevel"], cwd }))),
    );

    for (const refusal of outcomes) {
      expect(refusal.status).toBe(128);
      expect(refusal.stdout).toBe("");
      expect(refusal.stderr).toContain("git was not started");
      // The mark a caller reads to tell this refusal from git's own (fix/21): the stderr text
      // is for a person, and git's own refusals are translated by locale.
      expect(refusal.keptFromGit).toBe(true);
    }
    expect(gitSpawns.args).toEqual([]);
  });

  // review/46 of run 2026-10-11_release-1-14-0, signed off: the lane keeps its
  // environment, and with `GIT_DIR` in it git runs no discovery, so the folder
  // it runs in cannot answer and the look is not taken. Without the variable
  // the same folder is not handed to git. The folder is empty files under the
  // names git looks for; the repository `GIT_DIR` names is a plain one.
  it("takes no look where GIT_DIR names the repository, and refuses the same folder without it", async (ctx) => {
    const repo = getRoot().path("repo");
    await mkdir(repo);
    try {
      seedGit(repo, ["init", "-q"]);
    } catch {
      ctx.skip();
    }
    seedGit(repo, ["config", "fixture.answers", "repo"]);
    await getRoot().seedFiles({ "shaped/HEAD": "", "shaped/objects/keep": "", "shaped/refs/keep": "" });
    const read = { args: ["config", "--get", "fixture.answers"], cwd: getRoot().path("shaped") };
    gitSpawns.args.length = 0;

    const named = await withEmptyHome(getRoot().path("home"), () => runGit(read), { GIT_DIR: getRoot().path("repo", ".git") });
    const discovered = await withEmptyHome(getRoot().path("home"), () => runGit(read));

    expect({ status: named.status, stdout: named.stdout.trim() }).toEqual({ status: 0, stdout: "repo" });
    expect(discovered.status).toBe(128);
    expect(discovered.stderr).toContain("git was not started");
    // Marked where the lane refused, and on no outcome git itself gave.
    expect(discovered.keptFromGit).toBe(true);
    expect(named).not.toHaveProperty("keptFromGit");
    expect(gitSpawns.args).toHaveLength(1);
  });

  it("still counts a real checkout's changes, with both options ahead of the command", async (ctx) => {
    const root = getRoot().path("repo");
    await mkdir(root);
    try {
      seedGit(root, ["init", "-q"]);
    } catch {
      ctx.skip();
    }
    await getRoot().seedFiles({ "repo/tracked.txt": "one\n", "repo/untracked.txt": "x\n" });
    seedGit(root, ["add", "--", "tracked.txt"]);
    gitSpawns.args.length = 0;

    const counts = await withEmptyHome(getRoot().path("home"), () => readDirtyCounts(runGit, root));

    expect(counts).toEqual({ modified: 1, untracked: 1 });
    // The two options are pinned here, where git is started: the case above no
    // longer reaches git, so it cannot show them.
    expect(gitSpawns.args).toEqual([
      ["-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", "status", "--porcelain"],
    ]);
  });
});

/**
 * Which program the lane starts. The stand-ins are scripts this suite writes
 * into its own temp folder, and Windows starts no shebang script, so the cases
 * that start one run on POSIX hosts. There an empty `PATH` entry and a relative
 * one both name the folder the child runs in, which is how a bare program name
 * comes to be looked up there.
 */
describe("runGit starts the git an absolute PATH entry holds", () => {
  const getRoot = useTempDir("worktree-git-path");

  /** A script under git's name in `folder` that prints `word`. */
  async function seedScript(folder: string, word: string): Promise<void> {
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "git"), `#!/bin/sh\nprintf '%s' '${word}'\nexit 0\n`, "utf8");
    await chmod(join(folder, "git"), 0o755);
  }

  /** Runs `body` with `PATH` set on this process, which the lane's child inherits; restored after. */
  async function withPath<T>(path: string, body: () => Promise<T>): Promise<T> {
    const previous = process.env["PATH"];
    process.env["PATH"] = path;
    try {
      return await body();
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
    }
  }

  const READ = ["rev-parse", "--is-inside-work-tree"];

  it.skipIf(process.platform === "win32")("never a file of git's name in the working folder, whatever PATH says of that folder", async () => {
    const work = getRoot().path("work");
    const standIn = getRoot().path("stand-in");
    await seedScript(work, "the file in the working folder");
    await seedScript(standIn, "the git on PATH");
    gitSpawns.programs.length = 0;

    for (const path of [`${delimiter}${standIn}`, `.${delimiter}${standIn}`, `${work}${delimiter}${standIn}`]) {
      // oxlint-disable-next-line no-await-in-loop -- each row sets PATH on this process; two at once would start under each other's
      const answer = await withPath(path, () => runGit({ args: READ, cwd: work }));
      expect(answer, path).toEqual({ status: 0, stdout: "the git on PATH", stderr: "" });
    }

    expect(gitSpawns.programs).toEqual([join(standIn, "git"), join(standIn, "git"), join(standIn, "git")]);
  });

  it.skipIf(process.platform === "win32")("answers as it does with no git installed where only the working folder holds a file of its name", async () => {
    const work = getRoot().path("work");
    await seedScript(work, "the file in the working folder");
    gitSpawns.programs.length = 0;

    for (const path of ["", ".", work]) {
      // oxlint-disable-next-line no-await-in-loop -- each row sets PATH on this process; two at once would start under each other's
      const answer = await withPath(path, () => runGit({ args: READ, cwd: work }));
      expect(answer, path).toEqual({ status: 127, stdout: "", stderr: "spawn git ENOENT" });
    }

    expect(gitSpawns.programs).toEqual([]);
  });

  it("answers status 127 where no PATH entry holds git, on every host", async () => {
    const work = getRoot().path("work");
    const empty = getRoot().path("empty");
    await mkdir(work);
    await mkdir(empty);

    const answer = await withPath(empty, () => runGit({ args: READ, cwd: work }));

    expect(answer).toEqual({ status: 127, stdout: "", stderr: "spawn git ENOENT" });
  });

  // On every host: the program the lane hands `spawn` is a full path to a file
  // that exists, never a bare name the runtime would look up for itself.
  it("starts the host's git by an absolute path", async (ctx) => {
    const work = getRoot().path("work");
    await mkdir(work);
    gitSpawns.programs.length = 0;

    const answer = await runGit({ args: ["--version"], cwd: work });
    if (answer.status === 127) ctx.skip();

    expect(answer.stdout).toContain("git version");
    expect(gitSpawns.programs).toHaveLength(1);
    expect(isAbsolute(gitSpawns.programs[0] ?? "")).toBe(true);
    expect(existsSync(gitSpawns.programs[0] ?? "")).toBe(true);
  });
});
