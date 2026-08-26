import { access, readFile, stat, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { TestContext } from "vitest";
import {
  buildChildEnv,
  makeCliFixture,
  spawnCollect,
  useCliFixture,
  type CliFixture,
} from "./cliHarness.ts";
import { seedGitRepo, toolTraceFiles, tsRepoFiles } from "./repoFixtures.ts";

const ENOENT = { code: "ENOENT" };
const packageJson = createRequire(import.meta.url)("../../package.json") as { version: string };

/** Converts a missing-git failure into a vitest skip; anything else propagates. */
async function gitFixture(
  ctx: TestContext,
  opts?: { seed?: Record<string, string>; git?: boolean },
): Promise<CliFixture> {
  try {
    return await makeCliFixture({ ...opts, git: true });
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
    throw error;
  }
}

describe("makeCliFixture().run", () => {
  const getFixture = useCliFixture();

  it("runs --version against the live entry from the fixture repo dir and exits 0", async () => {
    const result = await getFixture().run(["--version"]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("exits 2 on an unknown command through the child process", async () => {
    const result = await getFixture().run(["definitely-not-a-command"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("unknown command");
  });

  it("defaults the child cwd to the fixture repo dir", async () => {
    const fixture = getFixture();
    const probe = await spawnCollect(process.execPath, ["-p", "process.cwd()"], {
      cwd: fixture.repoDir,
      env: buildChildEnv(fixture.home),
    });

    expect(probe.code).toBe(0);
    expect(probe.stdout.trim()).toBe(fixture.repoDir);
  });

  it("delivers stdin bytes to the child and closes the stream", async () => {
    const fixture = getFixture();
    // Echo probe through the same spawn path run() uses: proves delivery + EOF.
    const echo = await spawnCollect(
      process.execPath,
      [
        "-e",
        'process.stdin.setEncoding("utf8"); let data = ""; process.stdin.on("data", (c) => { data += c; }); process.stdin.on("end", () => { process.stdout.write("got:" + data); });',
      ],
      { cwd: fixture.repoDir, env: buildChildEnv(fixture.home), stdin: "hello\nworld" },
    );

    expect(echo.code).toBe(0);
    expect(echo.stdout).toBe("got:hello\nworld");

    // CLI lane: a run with stdin provided completes instead of hanging.
    const help = await fixture.run(["--help"], { stdin: "ignored\n" });
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("stamity");
  });

  // Windows reports forced termination as a plain exit code, not a signal, and
  // neither CI (ubuntu-only) nor the dev platform runs this lane on win32.
  it.skipIf(process.platform === "win32")(
    "maps a signal death (null exit code) to code -1 with the signal named in stderr",
    async () => {
      const fixture = getFixture();
      const killed = await spawnCollect(
        process.execPath,
        ["-e", 'process.kill(process.pid, "SIGKILL");'],
        { cwd: fixture.repoDir, env: buildChildEnv(fixture.home) },
      );

      expect(killed.code).toBe(-1);
      expect(killed.stderr).toContain("terminated by signal SIGKILL");
    },
  );
});

describe("fixture layout", () => {
  const getFixture = useCliFixture();

  it("hands out realpath-resolved, path.join-derived paths", async () => {
    const fixture = getFixture();

    // macOS /var -> /private/var: every path must already be canonical so
    // assertions never compare a symlinked spelling against a resolved one.
    expect(await realpath(fixture.repoDir)).toBe(fixture.repoDir);
    expect(await realpath(fixture.home.home)).toBe(fixture.home.home);

    // join-derived (never string-concatenated), so separators are per-platform.
    expect(fixture.home.configDir).toBe(join(fixture.home.home, ".config"));
    expect(fixture.home.cacheDir).toBe(join(fixture.home.home, ".cache"));
    expect(fixture.home.stateDir).toBe(join(fixture.home.home, ".local", "state"));
    expect(dirname(fixture.repoDir)).toBe(dirname(fixture.home.home));
  });

  it("seed() writes repo-relative files and rejects escapes from the repo dir", async () => {
    const fixture = getFixture();

    await fixture.seed({ "docs/nested/readme.md": "seeded" });
    expect(await readFile(join(fixture.repoDir, "docs", "nested", "readme.md"), "utf8")).toBe(
      "seeded",
    );

    // "../home/..." stays inside the fixture TREE (tempDir's guard passes),
    // but escapes the repo dir — the repo-scoped guard must reject it.
    await expect(fixture.seed({ "../home/evil.md": "nope" })).rejects.toThrow(/escapes/);
    await expect(fixture.seed({ "": "nope" })).rejects.toThrow(/not a file path/);
    await expect(access(join(fixture.home.home, "evil.md"))).rejects.toMatchObject(ENOENT);
  });

  it("cleanup removes the fixture tree and double cleanup is a no-op", async () => {
    const fixture = await makeCliFixture({ seed: { "a.md": "x" } });

    await fixture.cleanup();

    await expect(access(fixture.repoDir)).rejects.toMatchObject(ENOENT);
    await expect(access(fixture.home.home)).rejects.toMatchObject(ENOENT);
    await expect(fixture.cleanup()).resolves.toBeUndefined();
  });
});

describe("buildChildEnv", () => {
  const getFixture = useCliFixture();

  it("points HOME and every XDG dir inside the pseudo-home and pins the defaults", () => {
    const fixture = getFixture();
    const env = buildChildEnv(fixture.home);

    expect(env["HOME"]).toBe(fixture.home.home);
    expect(env["USERPROFILE"]).toBe(fixture.home.home);
    expect(env["XDG_CONFIG_HOME"]).toBe(fixture.home.configDir);
    expect(env["XDG_CACHE_HOME"]).toBe(fixture.home.cacheDir);
    expect(env["XDG_STATE_HOME"]).toBe(fixture.home.stateDir);
    for (const key of ["XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_STATE_HOME"] as const) {
      expect(env[key]?.startsWith(`${fixture.home.home}${sep}`)).toBe(true);
    }

    expect(env["NO_COLOR"]).toBe("1");
    expect(env["STAMITY_NO_UPDATE_CHECK"]).toBe("1");
    expect(env["TERM"]).toBe("dumb");
    expect(env["PATH"]).toBe(process.env["PATH"]);
  });

  it("builds fresh: never carries CI, NO_UPDATE_NOTIFIER, or arbitrary parent vars", () => {
    const fixture = getFixture();
    vi.stubEnv("CI", "true");
    vi.stubEnv("NO_UPDATE_NOTIFIER", "1");
    vi.stubEnv("HARNESS_CANARY", "leaks-if-spread");
    vi.stubEnv("NODE_FIXTURE_PROBE", "carried");
    try {
      const env = buildChildEnv(fixture.home);

      expect(Object.hasOwn(env, "CI")).toBe(false);
      expect(Object.hasOwn(env, "NO_UPDATE_NOTIFIER")).toBe(false);
      expect(Object.hasOwn(env, "HARNESS_CANARY")).toBe(false);
      // NODE_* rides along so the child runtime behaves as configured.
      expect(env["NODE_FIXTURE_PROBE"]).toBe("carried");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("applies per-run overrides; an undefined value deletes the key", () => {
    const fixture = getFixture();
    const env = buildChildEnv(fixture.home, {
      NO_COLOR: undefined,
      FORCE_COLOR: "1",
      STAMITY_NO_UPDATE_CHECK: "0",
    });

    expect(Object.hasOwn(env, "NO_COLOR")).toBe(false);
    expect(env["FORCE_COLOR"]).toBe("1");
    expect(env["STAMITY_NO_UPDATE_CHECK"]).toBe("0");
  });

  it("gives the child process the pseudo-home, never the real HOME", async () => {
    const fixture = getFixture();
    const probe = await spawnCollect(
      process.execPath,
      [
        "-p",
        'JSON.stringify({ home: process.env.HOME ?? null, ci: process.env.CI ?? null, xdgConfig: process.env.XDG_CONFIG_HOME ?? null })',
      ],
      { cwd: fixture.repoDir, env: buildChildEnv(fixture.home) },
    );

    expect(probe.code).toBe(0);
    const seen = JSON.parse(probe.stdout) as {
      home: string | null;
      ci: string | null;
      xdgConfig: string | null;
    };
    expect(seen.home).toBe(fixture.home.home);
    expect(seen.xdgConfig).toBe(fixture.home.configDir);
    expect(seen.ci).toBeNull();
    expect(seen.home).not.toBe(process.env["HOME"] ?? "");
  });
});

describe("seedGitRepo", () => {
  it("produces exactly the pinned authors and commit count", async (ctx) => {
    const fixture = await gitFixture(ctx, {});
    // Fixture starts with 1 default commit (git: true); build a second repo
    // in-place is not supported, so use a fresh plain fixture for custom opts.
    await fixture.cleanup();

    const plain = await makeCliFixture();
    try {
      try {
        await seedGitRepo(plain.repoDir, {
          commits: 3,
          authors: [
            { name: "Alice Fixture", email: "alice@fixture.invalid" },
            { name: "Bob Fixture", email: "bob@fixture.invalid" },
          ],
        });
      } catch (error) {
        if (error instanceof Error && error.name === "GitUnavailableError") ctx.skip();
        throw error;
      }

      const log = await spawnCollect("git", ["log", "--format=%an <%ae>"], {
        cwd: plain.repoDir,
        env: buildChildEnv(plain.home),
      });
      expect(log.code).toBe(0);
      // Newest first: commit 3 (Alice), commit 2 (Bob), commit 1 (Alice).
      expect(log.stdout.trim().split("\n")).toEqual([
        "Alice Fixture <alice@fixture.invalid>",
        "Bob Fixture <bob@fixture.invalid>",
        "Alice Fixture <alice@fixture.invalid>",
      ]);
    } finally {
      await plain.cleanup();
    }
  });

  it("is deterministic: two identically-seeded repos share one HEAD sha", async (ctx) => {
    const first = await gitFixture(ctx, {});
    const second = await gitFixture(ctx, {});
    try {
      const shas = await Promise.all(
        [first, second].map(async (fixture) => {
          const head = await spawnCollect("git", ["rev-parse", "HEAD"], {
            cwd: fixture.repoDir,
            env: buildChildEnv(fixture.home),
          });
          expect(head.code).toBe(0);
          return head.stdout.trim();
        }),
      );

      expect(shas[0]).toMatch(/^[0-9a-f]{40}$/);
      // Equal shas pin author, committer, dates, message, and tree bytes.
      expect(shas[0]).toBe(shas[1]);
    } finally {
      await first.cleanup();
      await second.cleanup();
    }
  });

  it("rejects a non-positive commit count before touching git", async () => {
    const fixture = await makeCliFixture();
    try {
      await expect(seedGitRepo(fixture.repoDir, { commits: 0 })).rejects.toThrow(
        /positive integer/,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it('throws an Error named "GitUnavailableError" when git cannot be resolved', async () => {
    const fixture = await makeCliFixture();
    // Empty PATH makes the git binary unresolvable on every platform, so the
    // unavailable branch is exercised even on machines that have git.
    vi.stubEnv("PATH", "");
    try {
      const error = await seedGitRepo(fixture.repoDir).then(
        () => {
          throw new Error("expected seedGitRepo to reject without a resolvable git");
        },
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("GitUnavailableError");
      expect((error as Error).message).toContain("git");
    } finally {
      vi.unstubAllEnvs();
      await fixture.cleanup();
    }
  });

  it("makeCliFixture({ git: true }) seeds git after the seed map, leaving a clean tree", async (ctx) => {
    const fixture = await gitFixture(ctx, { seed: tsRepoFiles() });
    try {
      expect((await stat(join(fixture.repoDir, ".git"))).isDirectory()).toBe(true);

      const parsed = JSON.parse(
        await readFile(join(fixture.repoDir, "package.json"), "utf8"),
      ) as { name: string };
      expect(parsed.name).toBe("fixture-app");

      const env = buildChildEnv(fixture.home);
      const count = await spawnCollect("git", ["rev-list", "--count", "HEAD"], {
        cwd: fixture.repoDir,
        env,
      });
      expect(count.stdout.trim()).toBe("1");

      // Seed ran before git, so the seeded files landed in the first commit.
      const status = await spawnCollect("git", ["status", "--porcelain"], {
        cwd: fixture.repoDir,
        env,
      });
      expect(status.code).toBe(0);
      expect(status.stdout).toBe("");
    } finally {
      await fixture.cleanup();
    }
  });
});

describe("repo fixture maps", () => {
  it("tsRepoFiles is a minimal parseable TypeScript repo", () => {
    const files = tsRepoFiles();

    expect(Object.keys(files).toSorted()).toEqual(["package.json", "src/index.ts", "tsconfig.json"]);
    expect(JSON.parse(files["package.json"] ?? "")).toMatchObject({ name: "fixture-app" });
    expect(JSON.parse(files["tsconfig.json"] ?? "")).toMatchObject({
      compilerOptions: { strict: true },
    });
  });

  it("toolTraceFiles plants exactly the requested tool traces", () => {
    expect(Object.keys(toolTraceFiles(["claude", "cursor", "copilot", "codex"])).toSorted()).toEqual(
      [
        ".claude/settings.json",
        ".codex/config.toml",
        ".cursor/rules/fixture.mdc",
        ".github/copilot-instructions.md",
      ],
    );
    expect(Object.keys(toolTraceFiles(["codex"]))).toEqual([".codex/config.toml"]);
    expect(toolTraceFiles([])).toEqual({});
    // Duplicates collapse instead of colliding.
    expect(Object.keys(toolTraceFiles(["claude", "claude"]))).toEqual([".claude/settings.json"]);
  });
});

describe("useCliFixture", () => {
  const getFixture = useCliFixture({ seed: { "marker.md": "present" } });
  let firstRepoDir = "";

  it("gives the running test a live, seeded fixture", async () => {
    const fixture = getFixture();
    firstRepoDir = fixture.repoDir;

    expect(await readFile(join(fixture.repoDir, "marker.md"), "utf8")).toBe("present");
  });

  it("cleans the previous test's fixture and hands out a different one", async () => {
    expect(firstRepoDir).not.toBe("");
    await expect(access(firstRepoDir)).rejects.toMatchObject(ENOENT);
    expect(getFixture().repoDir).not.toBe(firstRepoDir);
  });

  afterAll(() => {
    expect(() => getFixture()).toThrow(/call the getter inside it\(\)\/test\(\)/);
  });
});
