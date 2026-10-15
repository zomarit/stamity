import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitWrite, gitWriteArgs, gitWriteEnv } from "../../../src/cli/engine/gitWrite.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * The write runner: the pinned options ahead of every command, the
 * environment it keeps and drops, the look that starts no git in a folder
 * shaped like a bare repository, and real writes against local repositories
 * and a local bare remote (no network).
 */

const PINNED = ["-c", "safe.bareRepository=explicit", "-c", "core.fsmonitor=false", "-c", "push.followTags=false"];

describe("gitWriteArgs", () => {
  it("puts the three -c options ahead of the caller's arguments, unchanged", () => {
    expect(gitWriteArgs(["push", "origin", "HEAD:refs/heads/stamity/x"])).toEqual([...PINNED, "push", "origin", "HEAD:refs/heads/stamity/x"]);
    expect(gitWriteArgs(["-c", "user.name=T", "commit", "-m", "x"]).slice(0, 6)).toEqual(PINNED);
  });
});

describe("gitWriteEnv", () => {
  it("keeps credentials and identity, drops the repository-location variables, and turns the prompt off", () => {
    const env = gitWriteEnv({
      PATH: "/usr/bin",
      GH_TOKEN: "t",
      GIT_ASKPASS: "/bin/askpass",
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_AUTHOR_NAME: "A",
      GIT_TERMINAL_PROMPT: "1",
      GIT_DIR: "/elsewhere/.git",
      git_work_tree: "/elsewhere",
      GIT_INDEX_FILE: "/elsewhere/index",
      GIT_OBJECT_DIRECTORY: "/elsewhere/objects",
      GIT_COMMON_DIR: "/elsewhere/.git",
    });

    expect(env).toEqual({
      PATH: "/usr/bin",
      GH_TOKEN: "t",
      GIT_ASKPASS: "/bin/askpass",
      GIT_SSH_COMMAND: "ssh -i key",
      GIT_AUTHOR_NAME: "A",
      GIT_TERMINAL_PROMPT: "0",
    });
  });
});

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** No system or global config reaches either the fixtures' git or the runner's (which keeps the caller's environment). */
const ISOLATED = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
  GIT_AUTHOR_NAME: "Fixture One",
  GIT_AUTHOR_EMAIL: "one@fixture.invalid",
  GIT_COMMITTER_NAME: "Fixture One",
  GIT_COMMITTER_EMAIL: "one@fixture.invalid",
} as const;

describe.skipIf(!gitAvailable)("gitWrite against real repositories", () => {
  const getRoot = useTempDir("git-write");

  beforeEach(() => {
    for (const [key, value] of Object.entries(ISOLATED)) vi.stubEnv(key, value);
    const home = getRoot().path("home");
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /** Plain git, for the fixtures and the controls: the process's (stubbed) environment, no runner options. */
  function git(cwd: string, args: readonly string[]): string {
    return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env });
  }

  async function repoWithCommit(name: string): Promise<string> {
    const dir = getRoot().path(name);
    await mkdir(dir, { recursive: true });
    git(dir, ["-c", "init.defaultBranch=main", "init", "-q"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "base"]);
    return dir;
  }

  it("pushes the branch and no tag, whatever push.followTags the repository sets", async () => {
    const repo = await repoWithCommit("repo");
    const remote = getRoot().path("remote.git");
    const control = getRoot().path("control.git");
    git(getRoot().dir, ["init", "-q", "--bare", remote]);
    git(getRoot().dir, ["init", "-q", "--bare", control]);
    git(repo, ["remote", "add", "origin", remote]);
    git(repo, ["remote", "add", "control", control]);
    git(repo, ["config", "push.followTags", "true"]);
    git(repo, ["tag", "-a", "v9.9.9", "-m", "a release nobody asked for"]);

    // Control, non-degenerate: plain git under the same config does carry the tag.
    git(repo, ["push", "-q", "control", "HEAD:refs/heads/stamity/x"]);
    expect(git(control, ["tag", "--list"])).toContain("v9.9.9");

    const result = await gitWrite(repo, ["push", "-q", "origin", "HEAD:refs/heads/stamity/x"]);

    expect(result.code).toBe(0);
    expect(git(remote, ["branch", "--list"])).toContain("stamity/x");
    expect(git(remote, ["tag", "--list"])).toBe("");
  });

  it("resolves a refused write with git's exit status and keeps its stderr", async () => {
    const repo = await repoWithCommit("repo");

    const result = await gitWrite(repo, ["push", "no-such-remote", "HEAD"]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no-such-remote/);
    expect(result.keptFromGit).toBeUndefined();
  });

  it("writes into the working folder's repository whatever GIT_DIR names", async () => {
    const target = await repoWithCommit("target");
    const other = await repoWithCommit("other");
    vi.stubEnv("GIT_DIR", join(other, ".git"));
    vi.stubEnv("GIT_WORK_TREE", other);

    const pending = gitWrite(target, ["commit", "-q", "--allow-empty", "-m", "second"]);
    // The runner read its environment when called; the fixtures' own git below must not see these.
    vi.stubEnv("GIT_DIR", undefined);
    vi.stubEnv("GIT_WORK_TREE", undefined);
    const result = await pending;

    expect(result.code).toBe(0);
    expect(git(target, ["rev-list", "--count", "HEAD"]).trim()).toBe("2");
    expect(git(other, ["rev-list", "--count", "HEAD"]).trim()).toBe("1");
  });

  it("runs no core.fsmonitor command the repository configures", async () => {
    const repo = await repoWithCommit("repo");
    const marker = getRoot().path("fsmonitor-ran").replaceAll("\\", "/");
    git(repo, ["config", "core.fsmonitor", `touch '${marker}'; false`]);
    await writeFile(join(repo, "a.txt"), "a\n", "utf8");

    const result = await gitWrite(repo, ["add", "--", "a.txt"]);

    expect(result.code).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(git(repo, ["diff", "--cached", "--name-only"]).trim()).toBe("a.txt");

    // Control, non-degenerate: plain git runs the configured command on the same write.
    // On POSIX hosts only: how Git for Windows starts a configured hook command is not this suite's subject.
    if (process.platform !== "win32") {
      await writeFile(join(repo, "b.txt"), "b\n", "utf8");
      git(repo, ["add", "--", "b.txt"]);
      expect(existsSync(marker)).toBe(true);
    }
  });

  async function plantedBare(): Promise<{ root: string; marker: string }> {
    const root = getRoot().path("planted");
    await mkdir(root);
    const marker = getRoot().path("planted-ran").replaceAll("\\", "/");
    git(root, ["init", "-q", "--bare", "."]);
    git(root, ["config", "--file", "config", "core.bare", "false"]);
    git(root, ["config", "--file", "config", "core.worktree", "."]);
    git(root, ["config", "--file", "config", "core.fsmonitor", `touch '${marker}'; false`]);
    await mkdir(join(root, "sub"));
    await writeFile(join(root, "sub", "a.txt"), "a\n", "utf8");
    return { root, marker };
  }

  it("refuses a folder shaped like a bare repository, and one below it, before git starts", async () => {
    const { root, marker } = await plantedBare();

    const cwds = [root, join(root, "sub")];
    const results = await Promise.all(cwds.map((cwd) => gitWrite(cwd, ["add", "-A"])));
    for (const [index, cwd] of cwds.entries()) {
      const result = results[index];
      expect(result, cwd).toMatchObject({ code: 128, stdout: "", keptFromGit: true });
      expect(result?.stderr, cwd).toMatch(/layout of a bare repository/);
    }
    expect(existsSync(marker)).toBe(false);
  });

  // A stand-in takes git's place on PATH, so the argv and the environment the
  // started process receives are read where the process receives them, and so
  // the bare look is proven to start no program at all. Mock reason: no real
  // git reports the options it was started with. Windows starts no shebang
  // script, so the case runs on POSIX hosts; the argv is proven on every host
  // by `gitWriteArgs` above.
  it.skipIf(process.platform === "win32")("starts git by absolute path with the pinned argv and GIT_TERMINAL_PROMPT=0, and starts none at a planted folder", async () => {
    const { root } = await plantedBare();
    const plain = getRoot().path("plain");
    await mkdir(plain);
    const bin = getRoot().path("stand-in");
    const log = getRoot().path("started.log");
    await mkdir(bin);
    await writeFile(join(bin, "git"), `#!/bin/sh\nprintf '%s|prompt=%s\\n' "$*" "$GIT_TERMINAL_PROMPT" >> '${log}'\nexit 0\n`, "utf8");
    await chmod(join(bin, "git"), 0o755);
    vi.stubEnv("PATH", bin);
    vi.stubEnv("GIT_TERMINAL_PROMPT", "1");

    expect(await gitWrite(plain, ["push", "origin", "HEAD:refs/heads/stamity/x"])).toEqual({ code: 0, stdout: "", stderr: "" });
    const started = `${PINNED.join(" ")} push origin HEAD:refs/heads/stamity/x|prompt=0\n`;
    expect(readFileSync(log, "utf8")).toBe(started);

    await gitWrite(root, ["push", "origin", "HEAD"]);
    expect(readFileSync(log, "utf8")).toBe(started);
  });

  it("rejects with ENOENT, and starts nothing, where no PATH entry holds git", async () => {
    const repo = await repoWithCommit("repo");
    const empty = getRoot().path("empty");
    await mkdir(empty);
    vi.stubEnv("PATH", empty);

    await expect(gitWrite(repo, ["status"])).rejects.toMatchObject({ code: "ENOENT" });
  });
});
