import { describe, expect, it } from "vitest";
import {
  detectPlatformFromRemote,
  detectRepoGitIdentity,
  parseGitDefaultBranch,
  parseGitRemote,
  type GitRunner,
} from "../../src/workspace/git.ts";
import type { Platform } from "../../src/types/core.ts";

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
