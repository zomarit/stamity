import { execFileSync } from "node:child_process";
// Type-only, so the `importOriginal<...>()` argument below adds no runtime
// import that could race the `vi.mock` hoisting.
import type * as ChildProcessModule from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, isAbsolute, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gitCheckRunner } from "../../src/cli/engine/gitStatus.ts";
import {
  detectPlatformFromRemote,
  detectRepoGitIdentity,
  parseGitDefaultBranch,
  parseGitRemote,
  type GitRunner,
} from "../../src/workspace/git.ts";
import type { Platform } from "../../src/types/core.ts";
import { NO_GIT_CONFIG } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Every program this file's module graph hands `execFileSync`, with its
 * arguments, in call order. A spy, not a stub: the real `execFileSync` still
 * runs. How the default seam names git is the subject of one case below, only
 * the real call site spells it, and what git answered cannot tell a start by an
 * absolute path from a start by the bare name on a host whose `PATH` is clean.
 */
const started = vi.hoisted(() => ({ calls: [] as { program: string; args: string[] }[] }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcessModule>();
  const original = actual.execFileSync as unknown as (...args: unknown[]) => unknown;
  return {
    ...actual,
    execFileSync: (...args: unknown[]): unknown => {
      if (Array.isArray(args[1])) started.calls.push({ program: String(args[0]), args: args[1].map(String) });
      return original(...args);
    },
  };
});

const REMOTE_ARGS = ["remote", "get-url", "origin"];
const SYMREF_ARGS = ["symbolic-ref", "refs/remotes/origin/HEAD"];

interface ScriptedGit {
  runner: GitRunner;
  calls: { args: string[]; cwd: string }[];
}

/**
 * A {@link GitRunner} scripted by the joined argument vector. An unscripted
 * call throws by name, so a probe that starts issuing a different command
 * fails loudly instead of silently reading someone else's output.
 */
function scriptedGit(script: Record<string, string | Error>): ScriptedGit {
  const calls: { args: string[]; cwd: string }[] = [];
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

const notARepository = new Error("fatal: not a git repository (or any of the parent directories)");
const noSuchRemote = new Error("fatal: No such remote 'origin'");

describe("parseGitRemote", () => {
  it("normalises every transport spelling of one repository to the same triple", () => {
    const expected = { host: "github.com", owner: "acme", repo: "app" };

    for (const url of [
      "git@github.com:acme/app.git",
      "git@github.com:acme/app",
      "https://github.com/acme/app",
      "https://github.com/acme/app.git",
      "https://github.com/acme/app/",
      "https://token@github.com/acme/app.git",
      "ssh://git@github.com/acme/app",
      "ssh://git@github.com:22/acme/app.git",
      "  https://github.com/acme/app.git  ",
    ]) {
      expect(parseGitRemote(url), url).toEqual(expected);
    }
  });

  it("lowercases the host and leaves the namespace case alone", () => {
    // Hosts are case-insensitive; owner and repo are not — GitHub renders and
    // routes them as written, so folding their case would corrupt the identity.
    expect(parseGitRemote("https://GitHub.com/Acme/App.git")).toEqual({
      host: "github.com",
      owner: "Acme",
      repo: "App",
    });
  });

  it("keeps the full group path on a nested-namespace host, port and all", () => {
    const expected = { host: "gitlab.example.com", owner: "group/sub", repo: "repo" };

    for (const url of [
      "gitlab.example.com:8443/group/sub/repo.git",
      "https://gitlab.example.com:8443/group/sub/repo.git",
      "ssh://git@gitlab.example.com:8443/group/sub/repo.git",
      "git@gitlab.example.com:group/sub/repo.git",
    ]) {
      expect(parseGitRemote(url), url).toEqual(expected);
    }

    expect(parseGitRemote("git@gitlab.com:group/sub/deeper/repo.git")).toEqual({
      host: "gitlab.com",
      owner: "group/sub/deeper",
      repo: "repo",
    });
  });

  it("reads an Azure DevOps repository out of both of its URL layouts", () => {
    expect(parseGitRemote("https://dev.azure.com/org/project/_git/repo")).toEqual({
      host: "dev.azure.com",
      owner: "org/project",
      repo: "repo",
    });
    expect(parseGitRemote("git@ssh.dev.azure.com:v3/org/project/repo")).toEqual({
      host: "ssh.dev.azure.com",
      owner: "org/project",
      repo: "repo",
    });
    expect(parseGitRemote("https://acme.visualstudio.com/project/_git/repo")).toEqual({
      host: "acme.visualstudio.com",
      owner: "project",
      repo: "repo",
    });
  });

  it("ignores segments past owner/repo on GitHub, which has no nested namespaces", () => {
    // A pasted web URL is the common source of the extra segments.
    expect(parseGitRemote("https://github.com/acme/app/tree/main")).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "app",
    });
    expect(parseGitRemote("https://github.com/acme/app.git/tree/main")).toEqual({
      host: "github.com",
      owner: "acme",
      repo: "app",
    });
  });

  it("drops a query string or fragment before splitting segments", () => {
    expect(parseGitRemote("https://gitlab.example.com/group/repo.git?ref=main#top")).toEqual({
      host: "gitlab.example.com",
      owner: "group",
      repo: "repo",
    });
  });

  it("returns null for anything without a host and two path segments", () => {
    for (const url of [
      "",
      "   ",
      "not a url",
      "/srv/git/repo.git",
      "./sub/repo.git",
      "file:///srv/git/repo.git",
      "https://github.com/acme",
      "https://github.com/",
      "github.com",
      "git@github.com:",
      "C:\\repos\\app",
    ]) {
      expect(parseGitRemote(url), url).toBeNull();
    }
  });
});

describe("parseGitDefaultBranch", () => {
  it("resolves the arrow form and the plain form to the same branch", () => {
    expect(parseGitDefaultBranch("refs/remotes/origin/HEAD -> origin/main")).toBe("main");
    expect(parseGitDefaultBranch("origin/main")).toBe("main");
    expect(parseGitDefaultBranch("refs/remotes/origin/main")).toBe("main");
    expect(parseGitDefaultBranch("refs/heads/main")).toBe("main");
    expect(parseGitDefaultBranch("  origin/main\n")).toBe("main");
  });

  it("keeps slashes that belong to the branch name", () => {
    expect(parseGitDefaultBranch("origin/release/2.x")).toBe("release/2.x");
    expect(parseGitDefaultBranch("refs/remotes/origin/release/2.x")).toBe("release/2.x");
    expect(parseGitDefaultBranch("refs/remotes/origin/HEAD -> origin/release/2.x")).toBe(
      "release/2.x",
    );
  });

  it("reads only the first line, so a multi-line listing still resolves", () => {
    const listing = "  origin/HEAD -> origin/develop\n  origin/develop\n  origin/feature/x\n";
    expect(parseGitDefaultBranch(listing)).toBe("develop");
  });

  it("returns null when the output names no branch", () => {
    for (const output of [
      "",
      "   \n",
      "refs/remotes/origin/HEAD",
      "origin/HEAD",
      "fatal: ref refs/remotes/origin/HEAD is not a symbolic ref",
      "origin/bad..name",
      "origin/bad~name",
      "origin/tip@{0}",
      "origin/",
    ]) {
      expect(parseGitDefaultBranch(output), JSON.stringify(output)).toBeNull();
    }
  });
});

describe("detectPlatformFromRemote", () => {
  const cases: [string, Platform | null][] = [
    ["https://github.com/acme/app.git", "github"],
    ["git@github.com:acme/app.git", "github"],
    ["ssh://git@github.com/acme/app.git", "github"],
    ["github.com/acme/app", "github"],
    ["ssh://git@github.acme.com/acme/app.git", "github"],
    ["https://dev.azure.com/org/project/_git/repo", "azure-devops"],
    ["git@ssh.dev.azure.com:v3/org/project/repo", "azure-devops"],
    ["https://acme.visualstudio.com/project/_git/repo", "azure-devops"],
    ["git@gitlab.com:group/repo.git", "gitlab"],
    ["https://gitlab.example.com:8443/group/sub/repo.git", "gitlab"],
    ["ssh://git@git.gitlab.acme.com/group/repo.git", "gitlab"],
    ["https://bitbucket.org/acme/app.git", null],
    ["https://git.acme.com/acme/app.git", null],
    ["/srv/git/repo.git", null],
    ["", null],
  ];

  it.each(cases)("maps %s to %s", (url, expected) => {
    expect(detectPlatformFromRemote(url)).toBe(expected);
  });

  it("decides on the host, never on a token inside the path", () => {
    // A repository named after another vendor is still hosted where its host says.
    expect(detectPlatformFromRemote("https://github.com/acme/gitlab-mirror.git")).toBe("github");
    expect(detectPlatformFromRemote("https://github.com/acme/dev.azure.com.git")).toBe("github");
    // ...and a host that merely contains the word is not that vendor.
    expect(detectPlatformFromRemote("https://mygitlab.com/acme/app.git")).toBeNull();
  });
});

describe("detectRepoGitIdentity", () => {
  it("reads remote, default branch, and platform from one repository", () => {
    const { runner, calls } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: "  git@gitlab.example.com:group/sub/repo.git\n",
      [SYMREF_ARGS.join(" ")]: "refs/remotes/origin/HEAD -> origin/develop\n",
    });

    expect(detectRepoGitIdentity("/repos/app", runner)).toEqual({
      remoteUrl: "git@gitlab.example.com:group/sub/repo.git",
      defaultBranch: "develop",
      platform: "gitlab",
    });
    // The seam contract: exactly these two probes, in this directory.
    expect(calls).toEqual([
      { args: REMOTE_ARGS, cwd: "/repos/app" },
      { args: SYMREF_ARGS, cwd: "/repos/app" },
    ]);
  });

  it("returns an all-null identity when the directory is not a repository", () => {
    const { runner, calls } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: notARepository,
      [SYMREF_ARGS.join(" ")]: notARepository,
    });

    let identity;
    expect(() => {
      identity = detectRepoGitIdentity("/tmp/plain-dir", runner);
    }).not.toThrow();
    expect(identity).toEqual({ remoteUrl: null, defaultBranch: null, platform: null });
    expect(calls).toHaveLength(2);
  });

  it("treats a repository with no origin remote as unknown, not as a failure", () => {
    const { runner } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: noSuchRemote,
      [SYMREF_ARGS.join(" ")]: noSuchRemote,
    });

    expect(detectRepoGitIdentity("/repos/no-remote", runner)).toEqual({
      remoteUrl: null,
      defaultBranch: null,
      platform: null,
    });
  });

  it("reads empty git output as absent rather than as an empty remote", () => {
    const { runner } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: "  \n",
      [SYMREF_ARGS.join(" ")]: "",
    });

    expect(detectRepoGitIdentity("/repos/blank", runner)).toEqual({
      remoteUrl: null,
      defaultBranch: null,
      platform: null,
    });
  });

  it("resolves each field independently, so one failed probe does not blank the rest", () => {
    // Real state: origin was removed while its remote-tracking refs survive.
    const { runner } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: noSuchRemote,
      [SYMREF_ARGS.join(" ")]: "refs/remotes/origin/HEAD -> origin/main",
    });

    expect(detectRepoGitIdentity("/repos/stale", runner)).toEqual({
      remoteUrl: null,
      defaultBranch: "main",
      platform: null,
    });
  });

  it("returns a null platform for a remote on an unmapped host", () => {
    const { runner } = scriptedGit({
      [REMOTE_ARGS.join(" ")]: "https://bitbucket.org/acme/app.git",
      [SYMREF_ARGS.join(" ")]: "refs/remotes/origin/HEAD -> origin/trunk",
    });

    expect(detectRepoGitIdentity("/repos/bb", runner)).toEqual({
      remoteUrl: "https://bitbucket.org/acme/app.git",
      defaultBranch: "trunk",
      platform: null,
    });
  });
});

// Run 2026-10-11_release-1-14-0, fix/30. The default seam of this module starts git by the
// absolute path it resolved on `PATH`, and is plain git in every other way: neither of the two
// options the CLI's verbs pass, no look before git, and the caller's whole environment. Both
// callers in the CLI hand in the pinned runner (`gitCheckRunner`,
// `src/cli/engine/gitStatus.ts`), so no verb reaches the default; a caller of the library that
// passes no runner does. The module sits below the look in the wave map
// (`test/architecture/boundaries.test.ts`), so the default takes no look and `SECURITY.md` says
// whose the claim is. This case holds the default whole: how a call with no runner starts git
// and what it reads at a folder in the shape of a bare repository, and what the same call reads
// through the pinned runner. The folder is a real bare repository with an origin of its own, as
// in `test/cli/commands/initPlan.test.ts`; it skips on a host with no git.
//
// TEST CHANGE, justified: this case held the default as plain git, started by its bare name,
// and said so here and in its title. The default now resolves git on `PATH` and starts the
// absolute path it found (`src/shared/programPath.ts::gitProgramFor`), so the case also reads
// each start's program and arguments off the spy at the top of this file, and that the pinned
// runner starts no program at all. What it asserted before stands unchanged: the folder's own
// origin with no runner passed, and nothing through the pinned runner.
describe("detectRepoGitIdentity (default runner, a folder in the shape of a bare repository)", () => {
  const getRoot = useTempDir("workspace-git-default");
  const PLANTED_ORIGIN = "https://github.com/planted/planted.git";

  it("starts git by an absolute path with none of the pinned options and reads the folder's own origin with no runner passed, and nothing through the pinned runner", async (ctx) => {
    const root = getRoot().path("shaped");
    await mkdir(root, { recursive: true });
    const seedGit = (args: readonly string[]): string =>
      execFileSync("git", [...args], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_CONFIG_SYSTEM: NO_GIT_CONFIG },
        windowsHide: true,
      }).trim();
    try {
      seedGit(["init", "-q", "--bare", "."]);
    } catch {
      ctx.skip();
    }
    seedGit(["config", "--file", "config", "remote.origin.url", PLANTED_ORIGIN]);

    // The default runner keeps the caller's environment, so the host's own git settings are cut
    // here: one that already refuses a discovered bare repository would hide what the default does.
    // The setting itself is held at `all`, the value git ships, through git's own environment
    // form, so the case does not turn on a later git shipping another default. The pinned runner
    // drops every `GIT_*` variable and takes its look before git, so none of this reaches it.
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("XDG_CONFIG_HOME", home);
    vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
    vi.stubEnv("GIT_CONFIG_GLOBAL", NO_GIT_CONFIG);
    vi.stubEnv("GIT_CONFIG_SYSTEM", NO_GIT_CONFIG);
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "safe.bareRepository");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "all");
    try {
      started.calls.length = 0;
      expect(detectRepoGitIdentity(root)).toEqual({
        remoteUrl: PLANTED_ORIGIN,
        defaultBranch: null,
        platform: "github",
      });
      // The two probes and nothing ahead of either: none of the options the pinned runner passes.
      // Each names git by a full path to a file that exists, never by the bare name the runtime
      // would look up for itself.
      const byDefault = [...started.calls];
      expect(byDefault.map((call) => call.args)).toEqual([REMOTE_ARGS, SYMREF_ARGS]);
      for (const { program } of byDefault) {
        expect(isAbsolute(program), program).toBe(true);
        expect(existsSync(program), program).toBe(true);
      }

      started.calls.length = 0;
      expect(detectRepoGitIdentity(root, gitCheckRunner())).toEqual({
        remoteUrl: null,
        defaultBranch: null,
        platform: null,
      });
      // By its look, before any program: the pinned runner started none.
      expect(started.calls).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * Which program the default seam starts. The stand-ins are scripts this suite
 * writes into its own temp folder, and Windows starts no shebang script, so the
 * cases that start one run on POSIX hosts. There an empty `PATH` entry and a
 * relative one both name the folder the child runs in, which is how a bare
 * program name comes to be looked up there.
 */
describe("detectRepoGitIdentity — the default seam starts the git an absolute PATH entry holds", () => {
  const getRoot = useTempDir("workspace-git-path");
  const NOTHING = { remoteUrl: null, defaultBranch: null, platform: null };

  /** A script under git's name in `folder` that answers the remote probe with `url`, fails the other, and leaves `marker`. */
  async function seedScript(folder: string, url: string, marker: string): Promise<void> {
    await mkdir(folder, { recursive: true });
    const script = `#!/bin/sh\n: > '${getRoot().path(marker)}'\ncase "$1" in remote) printf '%s\\n' '${url}' ;; *) exit 1 ;; esac\n`;
    await writeFile(join(folder, "git"), script, "utf8");
    await chmod(join(folder, "git"), 0o755);
  }

  /** Runs `read` with `PATH` set on this process, which the seam's child inherits; restored after. */
  function withPath<T>(path: string, read: () => T): T {
    const previous = process.env["PATH"];
    process.env["PATH"] = path;
    try {
      return read();
    } finally {
      if (previous === undefined) delete process.env["PATH"];
      else process.env["PATH"] = previous;
    }
  }

  it.skipIf(process.platform === "win32")("never a file of git's name in the working folder, whatever PATH says of that folder", async () => {
    const work = getRoot().path("work");
    const standIn = getRoot().path("stand-in");
    await seedScript(work, "https://gitlab.com/planted/app.git", "working-folder-file-ran");
    await seedScript(standIn, "https://github.com/acme/app.git", "stand-in-ran");

    for (const path of [`${delimiter}${standIn}`, `.${delimiter}${standIn}`, `${work}${delimiter}${standIn}`]) {
      expect(withPath(path, () => detectRepoGitIdentity(work)), path).toEqual({
        remoteUrl: "https://github.com/acme/app.git",
        defaultBranch: null,
        platform: "github",
      });
    }

    expect(existsSync(getRoot().path("stand-in-ran"))).toBe(true);
    expect(existsSync(getRoot().path("working-folder-file-ran"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")("reads nothing where only the working folder holds a file of git's name", async () => {
    const work = getRoot().path("work");
    await seedScript(work, "https://gitlab.com/planted/app.git", "working-folder-file-ran");

    for (const path of ["", ".", work]) {
      expect(withPath(path, () => detectRepoGitIdentity(work)), path).toEqual(NOTHING);
    }

    expect(existsSync(getRoot().path("working-folder-file-ran"))).toBe(false);
  });

  it("reads nothing where no PATH entry holds git, on every host", async () => {
    const work = getRoot().path("work");
    const empty = getRoot().path("empty");
    await mkdir(work);
    await mkdir(empty);

    expect(withPath(empty, () => detectRepoGitIdentity(work))).toEqual(NOTHING);
  });
});
