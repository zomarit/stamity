import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GIT_PROGRAM_VARIABLES, gitProgramVariablesIn, gitWrite, gitWriteArgs, gitWriteEnv } from "../../../src/cli/engine/gitWrite.ts";
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
  it("puts the three -c options, and no global pathspec flag, ahead of arguments that carry no `--`, unchanged", () => {
    expect(gitWriteArgs(["push", "origin", "HEAD:refs/heads/stamity/x"])).toEqual([...PINNED, "push", "origin", "HEAD:refs/heads/stamity/x"]);
    expect(gitWriteArgs(["-c", "user.name=T", "commit", "-m", "x"])).toEqual([...PINNED, "-c", "user.name=T", "commit", "-m", "x"]);
  });

  it("gives every argument after the first `--` the :(literal) magic, a later `--` and a leading colon included, and leaves an empty one empty", () => {
    expect(gitWriteArgs(["add", "--", "[ab].txt", "*.md", ":(glob)x", "--", ""])).toEqual([
      ...PINNED,
      "add",
      "--",
      ":(literal)[ab].txt",
      ":(literal)*.md",
      ":(literal):(glob)x",
      ":(literal)--",
      "",
    ]);
    expect(gitWriteArgs(["commit", "-q", "--message=--", "--"])).toEqual([...PINNED, "commit", "-q", "--message=--", "--"]);
  });
});

describe("gitWriteEnv", () => {
  it("keeps credentials and identity, drops the repository-location and pathspec variables, and turns the prompt off", () => {
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
      GIT_LITERAL_PATHSPECS: "0",
      GIT_GLOB_PATHSPECS: "1",
      git_noglob_pathspecs: "1",
      GIT_ICASE_PATHSPECS: "1",
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

  // v0c (REQ-FLOW-122): unattended, git's program-valued variables are removed too, an empty one included.
  const PROGRAMS = {
    GIT_EXEC_PATH: "/tmp/planted-exec-path",
    GIT_SSH_COMMAND: "planted-ssh",
    GIT_ASKPASS: "/tmp/planted-askpass",
    git_pager: "planted-pager",
    GIT_EDITOR: "",
  };
  const KEPT = {
    PATH: "/usr/bin",
    HOME: "/home/a",
    XDG_CONFIG_HOME: "/home/a/.config",
    GH_TOKEN: "t",
    GIT_AUTHOR_NAME: "A",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "url./tmp/remote.git.insteadOf",
    GIT_CONFIG_VALUE_0: "https://github.com/o/r.git",
    GIT_CONFIG_GLOBAL: "/tmp/global",
    GIT_CONFIG_PARAMETERS: "'core.quotepath'='false'",
  };

  it("unattended, removes every program-valued variable, an empty one and another case included, and keeps the GIT_CONFIG_* ones, PATH, HOME and XDG_CONFIG_HOME", () => {
    const env = gitWriteEnv({ ...KEPT, ...PROGRAMS, GIT_DIR: "/elsewhere/.git" }, { unattended: true });

    expect(env).toEqual({ ...KEPT, GIT_TERMINAL_PROMPT: "0" });
  });

  it("attended, as when the option is omitted, keeps every program-valued variable", () => {
    const base = { ...KEPT, ...PROGRAMS };

    expect(gitWriteEnv(base, { unattended: false })).toEqual({ ...base, GIT_TERMINAL_PROMPT: "0" });
    expect(gitWriteEnv(base)).toEqual({ ...base, GIT_TERMINAL_PROMPT: "0" });
  });
});

describe("gitProgramVariablesIn", () => {
  it("names each program-valued variable set, an empty one included, in the list's order, and nothing else", () => {
    expect(gitProgramVariablesIn({ GIT_CONFIG_COUNT: "1", GIT_EDITOR: "", PATH: "/usr/bin", GIT_EXEC_PATH: "/x", GIT_ASKPASS: "/y" })).toEqual([
      "GIT_EDITOR",
      "GIT_ASKPASS",
      "GIT_EXEC_PATH",
    ]);
    expect(gitProgramVariablesIn({ git_ssh: "x" })).toEqual(["git_ssh"]);
  });

  it("names none where none is set, an unset (undefined) entry included", () => {
    expect(gitProgramVariablesIn({ PATH: "/usr/bin", GIT_CONFIG_COUNT: "1", GIT_SSH: undefined })).toEqual([]);
  });

  it("returns names only, never a value", () => {
    const names = gitProgramVariablesIn({ GIT_SSH_COMMAND: "ssh -i /secret/key" });

    expect(names).toEqual(["GIT_SSH_COMMAND"]);
    expect(names.join(" ")).not.toContain("secret");
  });
});

/** The guard's program-valued variables, as `src/hooks/personOnly.ts` spells them in its own constant. */
function guardProgramVariables(): string[] {
  const source = readFileSync(fileURLToPath(new URL("../../../src/hooks/personOnly.ts", import.meta.url)), "utf8");
  const match = /const PROGRAM_VARIABLES =\s*"([^"]+)"/.exec(source);
  if (match?.[1] === undefined) throw new Error("src/hooks/personOnly.ts holds no PROGRAM_VARIABLES string constant");
  return match[1].split("|");
}

describe("GIT_PROGRAM_VARIABLES", () => {
  // REQ-FLOW-122: the guard module stays self-contained, so the list is held twice; this keeps the two equal.
  it("names the same variables as the guard's line-wide rule in src/hooks/personOnly.ts", () => {
    const guard = guardProgramVariables();

    expect(guard.length).toBeGreaterThan(0);
    expect(GIT_PROGRAM_VARIABLES.toSorted()).toEqual(guard.toSorted());
  });

  it("fails the comparison when the two lists differ, either way", () => {
    const guard = guardProgramVariables().toSorted();

    expect(GIT_PROGRAM_VARIABLES.slice(1).toSorted()).not.toEqual(guard);
    expect([...GIT_PROGRAM_VARIABLES, "GIT_NEW_PROGRAM"].toSorted()).not.toEqual(guard);
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

  // pr/49: a list too long for the command line goes on stdin; without `input` stdin still ends at once.
  it("hands `input` to git on stdin, ends stdin at once without it, and answers by git's exit where git leaves the input unread", async () => {
    const repo = await repoWithCommit("repo");
    const head = git(repo, ["rev-parse", "HEAD"]).trim();

    const fed = await gitWrite(repo, ["rev-list", "--stdin"], { input: "HEAD\n" });
    const none = await gitWrite(repo, ["rev-list", "--stdin"]);
    // Far more than a pipe holds, to a git that never reads stdin: the write fails once git exits, git's exit answers.
    const unread = await gitWrite(repo, ["--version"], { input: "x".repeat(4 * 1024 * 1024) });

    expect(fed).toMatchObject({ code: 0, stdout: `${head}\n` });
    expect(none).toMatchObject({ code: 0, stdout: "" });
    expect(unread.code).toBe(0);
    expect(unread.stdout).toMatch(/^git version /);
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

  it("stages a listed path as a name, not a pattern, whatever GIT_*_PATHSPECS the caller sets", async () => {
    const repo = await repoWithCommit("repo");
    // `[ab].txt` is a valid name on every host, and as a glob it also matches `a.txt`.
    await writeFile(join(repo, "[ab].txt"), "x\n", "utf8");
    await writeFile(join(repo, "a.txt"), "a\n", "utf8");
    vi.stubEnv("GIT_GLOB_PATHSPECS", "1");

    const result = await gitWrite(repo, ["add", "--", "[ab].txt"]);

    expect(result.code).toBe(0);
    expect(git(repo, ["diff", "--cached", "--name-only"]).trim()).toBe("[ab].txt");

    // Control, non-degenerate: plain git reads the same path as a pattern and stages `a.txt` too.
    vi.stubEnv("GIT_GLOB_PATHSPECS", undefined);
    git(repo, ["add", "--", "[ab].txt"]);
    expect(git(repo, ["diff", "--cached", "--name-only"]).trim().split("\n")).toEqual(["[ab].txt", "a.txt"]);
  });

  it("leaves the repository's pre-commit hook in its own pathspec mode: no GIT_LITERAL_PATHSPECS, its glob matches, while a glob-shaped name stages alone", async () => {
    const repo = await repoWithCommit("repo");
    const log = getRoot().path("hook.log").replaceAll("\\", "/");
    // What a hand-written hook does: select the staged files by a glob pathspec.
    const hook = `#!/bin/sh\nprintf '%s|%s\\n' "\${GIT_LITERAL_PATHSPECS-unset}" "$(git diff --cached --name-only -- '*.py')" >> '${log}'\nexit 0\n`;
    await writeFile(join(repo, ".git", "hooks", "pre-commit"), hook, "utf8");
    await chmod(join(repo, ".git", "hooks", "pre-commit"), 0o755);
    await writeFile(join(repo, "[ab].txt"), "x\n", "utf8");
    await writeFile(join(repo, "a.txt"), "a\n", "utf8");
    await writeFile(join(repo, "x.py"), "print(1)\n", "utf8");
    // A caller's literal variable is dropped too: it would reach the hook, and it would refuse the magic.
    vi.stubEnv("GIT_LITERAL_PATHSPECS", "1");

    const added = await gitWrite(repo, ["add", "--", "[ab].txt", "x.py"]);
    const committed = gitWrite(repo, ["commit", "-q", "-m", "fixed"]);
    vi.stubEnv("GIT_LITERAL_PATHSPECS", undefined);

    expect(added.code).toBe(0);
    expect((await committed).code).toBe(0);
    expect(git(repo, ["show", "--name-only", "--format=", "HEAD"]).trim().split("\n")).toEqual(["[ab].txt", "x.py"]);
    expect(readFileSync(log, "utf8")).toBe("unset|x.py\n");

    // Control, non-degenerate: the global flag the runner used to pin reaches the hook, and its glob then matches nothing.
    await writeFile(join(repo, "x.py"), "print(2)\n", "utf8");
    git(repo, ["add", "--", "x.py"]);
    git(repo, ["--literal-pathspecs", "commit", "-q", "-m", "control"]);
    expect(readFileSync(log, "utf8")).toBe("unset|x.py\n1|\n");
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

  // v0c (REQ-FLOW-122): the stand-in prints the program-valued variables it was started with, so what the started
  // process receives is read where it receives it. Mock reason as above: a real git started with GIT_EXEC_PATH at a
  // folder holding no git programs fails before it could report them. POSIX only, as above.
  it.skipIf(process.platform === "win32")("unattended, starts git without GIT_EXEC_PATH, GIT_SSH_COMMAND and GIT_ASKPASS, the GIT_CONFIG_* ones kept; attended, they reach it", async () => {
    const plain = getRoot().path("plain");
    await mkdir(plain);
    const bin = getRoot().path("stand-in");
    const log = getRoot().path("env.log");
    await mkdir(bin);
    const fields = ["GIT_EXEC_PATH", "GIT_SSH_COMMAND", "GIT_ASKPASS", "GIT_CONFIG_COUNT"].map((name) => `\${${name}-unset}`).join("|");
    await writeFile(join(bin, "git"), `#!/bin/sh\nprintf '%s\\n' "${fields}" >> '${log}'\nexit 0\n`, "utf8");
    await chmod(join(bin, "git"), 0o755);
    vi.stubEnv("PATH", bin);
    vi.stubEnv("GIT_EXEC_PATH", getRoot().path("no-git-programs"));
    vi.stubEnv("GIT_SSH_COMMAND", "planted-ssh");
    vi.stubEnv("GIT_ASKPASS", "");
    vi.stubEnv("GIT_CONFIG_COUNT", "0");

    expect(await gitWrite(plain, ["push", "origin", "HEAD"], { unattended: true })).toEqual({ code: 0, stdout: "", stderr: "" });
    expect(readFileSync(log, "utf8")).toBe("unset|unset|unset|0\n");

    await gitWrite(plain, ["push", "origin", "HEAD"]);
    expect(readFileSync(log, "utf8")).toBe(`unset|unset|unset|0\n${getRoot().path("no-git-programs")}|planted-ssh||0\n`);
  });

  it("rejects with ENOENT, and starts nothing, where no PATH entry holds git", async () => {
    const repo = await repoWithCommit("repo");
    const empty = getRoot().path("empty");
    await mkdir(empty);
    vi.stubEnv("PATH", empty);

    await expect(gitWrite(repo, ["status"])).rejects.toMatchObject({ code: "ENOENT" });
  });
});
