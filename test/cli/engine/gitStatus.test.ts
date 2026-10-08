import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parsePorcelainStatus,
  parseShortlogContributors,
  readHistoryFacts,
  readWorkingTreeStatus,
} from "../../../src/cli/engine/gitStatus.ts";
import type { GitRunner } from "../../../src/workspace/git.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * Two lanes, mirroring the module's own split. The parse functions and the
 * scripted-runner cases need no git at all. The real-repository lane exercises
 * the default execFile seam end to end against locally seeded repos; it skips
 * when the host has no git, per the unit brief.
 */

const UNAVAILABLE = { available: false, dirty: false, changedCount: 0 };

interface ScriptedCall {
  args: string[];
  cwd: string;
}

/**
 * A {@link GitRunner} scripted by the joined argument vector. An unscripted
 * call throws by name, so a reader that starts issuing a different command
 * fails loudly instead of silently reading someone else's output.
 */
function scriptedGit(script: Record<string, string | Error>): {
  runner: GitRunner;
  calls: ScriptedCall[];
} {
  const calls: ScriptedCall[] = [];
  const runner: GitRunner = (args, cwd) => {
    const key = args.join(" ");
    calls.push({ args: [...args], cwd });
    const outcome = script[key];
    if (outcome === undefined) throw new Error(`unscripted git call: git ${key}`);
    if (outcome instanceof Error) throw outcome;
    return outcome;
  };
  return { runner, calls };
}

const gitFailed = new Error("fatal: not a git repository (or any of the parent directories)");

describe("parsePorcelainStatus", () => {
  it("reads empty output as a clean tree", () => {
    expect(parsePorcelainStatus("")).toEqual({ dirty: false, changedCount: 0 });
  });

  it("reads a bare trailing newline as a clean tree", () => {
    expect(parsePorcelainStatus("\n")).toEqual({ dirty: false, changedCount: 0 });
  });

  it("counts one entry per changed path", () => {
    expect(parsePorcelainStatus(" M a.ts\n?? b.ts\n")).toEqual({ dirty: true, changedCount: 2 });
  });

  it("parses CRLF output identically to LF", () => {
    expect(parsePorcelainStatus(" M a.ts\r\n?? b.ts\r\n")).toEqual({
      dirty: true,
      changedCount: 2,
    });
  });

  it("counts a rename line once", () => {
    expect(parsePorcelainStatus("R  old.ts -> new.ts\n")).toEqual({ dirty: true, changedCount: 1 });
  });
});

describe("parseShortlogContributors", () => {
  it("counts count-tab-name lines", () => {
    expect(parseShortlogContributors("    12\tAlice Example\n     3\tBob Jones\n")).toBe(2);
  });

  it("counts UTF-8 author names", () => {
    expect(parseShortlogContributors("     5\t山田 太郎\n     1\tÅsa Öberg\n")).toBe(2);
  });

  it("accepts space-separated counts, not only git's tab", () => {
    expect(parseShortlogContributors("12 Alice\n")).toBe(1);
  });

  it("returns 0 for empty stdout and for blank lines", () => {
    expect(parseShortlogContributors("")).toBe(0);
    expect(parseShortlogContributors("\n\n")).toBe(0);
  });

  it("ignores lines that are not contributor rows", () => {
    expect(parseShortlogContributors("warning: something odd\n     2\tAlice Example\n")).toBe(1);
  });
});

describe("readWorkingTreeStatus (scripted runner)", () => {
  it("issues `git status --porcelain` in the given cwd", () => {
    const { runner, calls } = scriptedGit({ "status --porcelain": " M a.ts\n" });
    expect(readWorkingTreeStatus("/repo", runner)).toEqual({
      available: true,
      dirty: true,
      changedCount: 1,
    });
    expect(calls).toEqual([{ args: ["status", "--porcelain"], cwd: "/repo" }]);
  });

  it("reads empty stdout as an available, clean tree", () => {
    const { runner } = scriptedGit({ "status --porcelain": "" });
    expect(readWorkingTreeStatus("/repo", runner)).toEqual({
      available: true,
      dirty: false,
      changedCount: 0,
    });
  });

  it("collapses a throwing runner to unavailable, never a throw", () => {
    const { runner } = scriptedGit({ "status --porcelain": gitFailed });
    expect(readWorkingTreeStatus("/nowhere", runner)).toEqual(UNAVAILABLE);
  });
});

describe("readHistoryFacts (scripted runner)", () => {
  it("combines rev-list and shortlog into history facts", () => {
    const { runner, calls } = scriptedGit({
      "rev-list --count HEAD": "3\n",
      "shortlog -sn HEAD": "     2\tAlice Example\n     1\tÅsa Öberg\n",
    });
    expect(readHistoryFacts("/repo", runner)).toEqual({ commitCount: 3, contributorCount: 2 });
    expect(calls.map((call) => call.cwd)).toEqual(["/repo", "/repo"]);
  });

  it("returns null when the runner throws", () => {
    const { runner } = scriptedGit({ "rev-list --count HEAD": gitFailed });
    expect(readHistoryFacts("/nowhere", runner)).toBeNull();
  });

  it("returns null when shortlog fails after rev-list succeeded", () => {
    const { runner } = scriptedGit({
      "rev-list --count HEAD": "3\n",
      "shortlog -sn HEAD": gitFailed,
    });
    expect(readHistoryFacts("/repo", runner)).toBeNull();
  });

  it("returns null for non-numeric or empty rev-list stdout instead of NaN", () => {
    for (const output of ["", "\n", "fatal: bad revision", "3 apples"]) {
      const { runner } = scriptedGit({
        "rev-list --count HEAD": output,
        "shortlog -sn HEAD": "     1\tAlice Example\n",
      });
      expect(readHistoryFacts("/repo", runner), JSON.stringify(output)).toBeNull();
    }
  });

  it("treats a parsed zero as data, not as unavailability", () => {
    // Only failure means null — a resolvable HEAD with zero counted commits
    // (e.g. exotic shallow states) still answers.
    const { runner } = scriptedGit({ "rev-list --count HEAD": "0\n", "shortlog -sn HEAD": "" });
    expect(readHistoryFacts("/repo", runner)).toEqual({ commitCount: 0, contributorCount: 0 });
  });
});

// ── Real-repository lane ─────────────────────────────────────────────────────

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Config isolation for every spawned git: the host's global/system config must
 * not leak into seeding (commit.gpgsign would break commits) or into reads
 * (status.showUntrackedFiles=no would blank the porcelain output). Both
 * readers' default runner strips every `GIT_*` variable (review/112,
 * build/69), so these values, and the discovery ceiling, reach only the
 * seeding; the reads are isolated by {@link readEnv} instead, which points
 * `HOME` and `XDG_CONFIG_HOME` at an empty folder so no global config is found
 * (build/70).
 */
const ISOLATED_GIT_ENV = {
  // Git for Windows also reads a ProgramData-level config that GIT_CONFIG_SYSTEM alone does not cut.
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
} as const;

function git(cwd: string, args: readonly string[], extraEnv: Record<string, string> = {}): void {
  execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...ISOLATED_GIT_ENV, ...extraEnv },
  });
}

function commit(cwd: string, message: string, author: { name: string; email: string }): void {
  git(cwd, ["commit", "--allow-empty", "-m", message], {
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_COMMITTER_NAME: author.name,
    GIT_COMMITTER_EMAIL: author.email,
  });
}

/**
 * The environment a read runs under: the seeding isolation (which the runner
 * strips, and which therefore cuts nothing for the read), plus `HOME` and
 * `XDG_CONFIG_HOME` at an empty folder, so git finds no global config.
 */
async function readEnv(home: string, extra: Record<string, string> = {}): Promise<Record<string, string>> {
  await mkdir(home, { recursive: true });
  return { ...ISOLATED_GIT_ENV, HOME: home, XDG_CONFIG_HOME: home, ...extra };
}

/** Runs `fn` with env overrides on this process, so the default runner's children inherit them. */
function withProcessEnv<T>(overrides: Record<string, string>, fn: () => T): T {
  const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe.skipIf(!gitAvailable)("against a real repository (default runner)", () => {
  const getRoot = useTempDir("gitstatus");

  const ALICE = { name: "Alice Example", email: "alice@example.com" };
  const ASA = { name: "Åsa Öberg", email: "asa@example.com" };

  it("reads {commitCount: 3, contributorCount: 2} from a seeded repo, UTF-8 author included", async () => {
    const repo = getRoot().path("repo");
    await mkdir(repo);
    git(repo, ["init", "-q"]);
    commit(repo, "one", ALICE);
    commit(repo, "two", ASA);
    commit(repo, "three", ALICE);

    withProcessEnv(await readEnv(getRoot().path("home")), () => {
      expect(readHistoryFacts(repo)).toEqual({ commitCount: 3, contributorCount: 2 });
      expect(readWorkingTreeStatus(repo)).toEqual({
        available: true,
        dirty: false,
        changedCount: 0,
      });
    });

    await getRoot().seedFiles({ "repo/untracked.txt": "x\n" });
    withProcessEnv(await readEnv(getRoot().path("home")), () => {
      expect(readWorkingTreeStatus(repo)).toEqual({
        available: true,
        dirty: true,
        changedCount: 1,
      });
    });
  });

  it("answers null history but available working tree for a zero-commit repo", async () => {
    const fresh = getRoot().path("fresh");
    await mkdir(fresh);
    git(fresh, ["init", "-q"]);

    withProcessEnv(await readEnv(getRoot().path("home")), () => {
      // rev-list cannot resolve an unborn HEAD -> null; status still answers.
      expect(readHistoryFacts(fresh)).toBeNull();
      expect(readWorkingTreeStatus(fresh)).toEqual({
        available: true,
        dirty: false,
        changedCount: 0,
      });
    });
  });

  it("reports unavailable outside any repository", async () => {
    const plain = getRoot().path("plain");
    await mkdir(plain);

    // The ceiling pins discovery inside the temp dir, so the test cannot
    // accidentally find a repository above tmpdir on some exotic host.
    withProcessEnv(await readEnv(getRoot().path("home"), { GIT_CEILING_DIRECTORIES: getRoot().dir }), () => {
      expect(readWorkingTreeStatus(plain)).toEqual(UNAVAILABLE);
      expect(readHistoryFacts(plain)).toBeNull();
    });
  });

  // review/112: `sync`, `check` and `init` read the working tree through this
  // call, so it runs git the way the overwrite lane's tracked-and-clean check
  // does (`src/merge/safeWrite.ts::runGitCheck`): a folder a repository writer
  // committed in the shape of a bare repository never answers it, and no
  // configured file-system monitor command runs.
  it("never runs a planted bare repository's core.fsmonitor at the setup root, nor reads its history", async () => {
    const root = getRoot().path("planted");
    await mkdir(root);
    const marker = getRoot().path("ran").replaceAll("\\", "/");
    git(root, ["init", "-q", "--bare", "."]);
    await getRoot().seedFiles({ "planted/AGENTS.md": "# Charter\n" });
    git(root, ["--git-dir=.", "--work-tree=.", "add", "--", "AGENTS.md"]);
    git(root, ["--git-dir=.", "--work-tree=.", "commit", "-q", "-m", "planted"], {
      GIT_AUTHOR_NAME: ALICE.name,
      GIT_AUTHOR_EMAIL: ALICE.email,
      GIT_COMMITTER_NAME: ALICE.name,
      GIT_COMMITTER_EMAIL: ALICE.email,
    });
    git(root, ["config", "--file", "config", "core.bare", "false"]);
    git(root, ["config", "--file", "config", "core.worktree", "."]);
    git(root, ["config", "--file", "config", "core.fsmonitor", `touch '${marker}'; false`]);

    const env = await readEnv(getRoot().path("home"), { GIT_CEILING_DIRECTORIES: getRoot().dir });
    const status = withProcessEnv(env, () => readWorkingTreeStatus(root));
    // build/69: the history reader runs git the same way, so it reads no history here.
    const history = withProcessEnv(env, () => readHistoryFacts(root));

    expect(existsSync(marker)).toBe(false);
    expect(status).toEqual(UNAVAILABLE);
    expect(history).toBeNull();
  });

  it("reads the setup root's own repository and history whatever GIT_DIR names", async () => {
    const other = getRoot().path("other");
    const target = getRoot().path("target");
    await mkdir(other);
    await mkdir(target);
    git(other, ["init", "-q"]);
    commit(other, "base", ALICE);
    git(target, ["init", "-q"]);
    commit(target, "base", ALICE);
    await getRoot().seedFiles({ "other/untracked.txt": "x\n" });

    commit(other, "second", ALICE);
    const env = await readEnv(getRoot().path("home"), { GIT_DIR: join(other, ".git"), GIT_WORK_TREE: other });
    const status = withProcessEnv(env, () => readWorkingTreeStatus(target));
    // build/69: the history reader counts the target's one commit, not the other repository's two.
    const history = withProcessEnv(env, () => readHistoryFacts(target));

    expect(status).toEqual({ available: true, dirty: false, changedCount: 0 });
    expect(history).toEqual({ commitCount: 1, contributorCount: 1 });
  });
});
