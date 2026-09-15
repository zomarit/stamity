import { describe, expect, it } from "vitest";
import { EngineError } from "../../src/types/errors.ts";
import {
  addWorktree,
  type GitInvocation,
  type GitOutcome,
  type WorktreeGitRunner,
} from "../../src/worktree/git.ts";

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

describe("addWorktree and the commondir race", () => {
  it("retries once after the race and lands the worktree", async () => {
    const { run, calls } = scriptedRunner([outcome(128, COMMONDIR_RACE_STDERR), outcome(0)]);

    await addWorktree(run, "/repo", REQUEST);

    expect(calls).toHaveLength(2);
    // The retry re-runs the IDENTICAL command: same argv, same cwd. A retry that
    // altered either would be a second decision, not a second attempt.
    expect(calls[0]?.args).toEqual(["worktree", "add", "-b", "alpha", "/repo/.worktrees/alpha"]);
    expect(calls[1]?.args).toEqual(calls[0]?.args);
    expect(calls[1]?.cwd).toBe("/repo");
  });

  it("does not retry a 128 that is not the race, and propagates it", async () => {
    const { run, calls } = scriptedRunner([outcome(128, OTHER_128_STDERR)]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("FS_ERROR");
    expect((error as EngineError).why).toContain("invalid reference");
    expect((error as EngineError).message).not.toContain("retried");
    expect(calls).toHaveLength(1);
  });

  it("treats a second race stderr as a real failure and says it retried once", async () => {
    const { run, calls } = scriptedRunner([
      outcome(128, COMMONDIR_RACE_STDERR),
      outcome(128, COMMONDIR_RACE_STDERR),
    ]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("FS_ERROR");
    expect((error as EngineError).message).toContain("/repo/.worktrees/alpha");
    expect((error as EngineError).message).toContain("retried once after the commondir race");
    expect((error as EngineError).why).toContain("commondir");
    expect(calls).toHaveLength(2);
  });

  it("classifies the retry's own answer, so a partial first attempt still refuses", async () => {
    // The first attempt lost the race after creating the directory; git answers
    // the re-run with "already exists". That is a VALIDATION_ERROR the operator
    // can act on, not the FS_ERROR the raced attempt would have produced.
    const { run, calls } = scriptedRunner([
      outcome(128, COMMONDIR_RACE_STDERR),
      outcome(128, "fatal: '/repo/.worktrees/alpha' already exists\n"),
    ]);

    const error = await addWorktree(run, "/repo", REQUEST).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).code).toBe("VALIDATION_ERROR");
    expect((error as EngineError).message).toContain("already exists");
    expect(calls).toHaveLength(2);
  });

  it("does not retry a non-128 status carrying the race sentence", async () => {
    // The pair is the signal: git reports this race as 128. A different status
    // with the same words is a different failure, and waiting on it only delays
    // the message.
    const { run, calls } = scriptedRunner([outcome(1, COMMONDIR_RACE_STDERR)]);

    await expect(addWorktree(run, "/repo", REQUEST)).rejects.toBeInstanceOf(EngineError);

    expect(calls).toHaveLength(1);
  });
});
