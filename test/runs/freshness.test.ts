import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitCheckRunner } from "../../src/cli/engine/gitStatus.ts";
import { freshness } from "../../src/runs/freshness.ts";
import type { GitRunner } from "../../src/workspace/git.ts";
import { NO_GIT_CONFIG, seedGitRepo } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * The freshness guard over real repositories: each case seeds history with
 * the real git binary and reads it through the CLI's hardened runner, so the
 * ranges, the pathspecs and the ancestry checks are git's own answers.
 */

const tempDir = useTempDir("freshness");

/** The production runner the CLI passes (`gate`, `plan check`). */
const git: GitRunner = gitCheckRunner();

const SPACED = "notes with space/c.md";

/** Sync git for writing history only, the host's global and system config cut off. */
function writeGit(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
      GIT_AUTHOR_NAME: "Fixture One",
      GIT_AUTHOR_EMAIL: "one@fixture.invalid",
      GIT_COMMITTER_NAME: "Fixture One",
      GIT_COMMITTER_EMAIL: "one@fixture.invalid",
    },
  });
}

function head(cwd: string): string {
  return writeGit(cwd, ["rev-parse", "HEAD"]).trim();
}

/** Append to `path` and commit it alone; returns the new HEAD. */
async function touchAndCommit(cwd: string, path: string, line: string): Promise<string> {
  const target = join(cwd, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${line}\n`, { encoding: "utf8", flag: "a" });
  writeGit(cwd, ["add", "--", path]);
  writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `touch ${path}`]);
  return head(cwd);
}

/** A repository holding three read paths, one of them with a space; returns the stamp. */
async function seededRepo(skip: () => void): Promise<string> {
  const handle = tempDir();
  await handle.seedFiles({
    "docs/a.md": "a\n",
    "src/b.ts": "export const b = 1;\n",
    [SPACED]: "c\n",
  });
  try {
    await seedGitRepo(handle.dir);
  } catch (error) {
    if (error instanceof Error && error.name === "GitUnavailableError") skip();
    throw error;
  }
  return head(handle.dir);
}

describe("freshness", () => {
  it("reads an untouched path fresh and a path a later commit moved as stale", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, "src/b.ts", "export const later = 2;");

    expect(await freshness(git, cwd, stamp, ["docs/a.md"])).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: [],
      unresolved: false,
    });
    expect(await freshness(git, cwd, stamp, ["docs/a.md", "src/b.ts"])).toEqual({
      verdict: "stale",
      stale: [{ path: "src/b.ts", reason: "moved" }],
      exempt: [],
      unresolved: false,
    });
  });

  it("reads a deleted path as missing, committed or not", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    writeGit(cwd, ["rm", "--quiet", "--", "docs/a.md"]);
    writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "drop a"]);
    await rm(join(cwd, "src/b.ts"));

    const result = await freshness(git, cwd, stamp, ["docs/a.md", "src/b.ts", SPACED]);
    expect(result).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/a.md", reason: "missing" },
        { path: "src/b.ts", reason: "missing" },
      ],
      exempt: [],
      unresolved: false,
    });
  });

  it("reads a stamp rebased away as unresolved, though its object still exists", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const rewritten = await touchAndCommit(cwd, "docs/a.md", "rewritten");
    writeGit(cwd, ["reset", "--quiet", "--hard", "HEAD~1"]);
    await touchAndCommit(cwd, "src/b.ts", "replacement");

    // The object is still in the store: only its absence from HEAD's history unresolves it.
    expect(writeGit(cwd, ["cat-file", "-t", rewritten]).trim()).toBe("commit");
    expect(await freshness(git, cwd, rewritten, ["docs/a.md"])).toEqual({
      verdict: "stale",
      stale: [],
      exempt: [],
      unresolved: true,
    });
  });

  it("reads a stamp that names no commit as unresolved, and passes no option-shaped stamp to git", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const seen: string[][] = [];
    // A recording wrapper around the real runner, so the argv each call carried can be read.
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };

    for (const bad of ["0000000deadbeef", "--output=/tmp/x", "HEAD", ""]) {
      // oxlint-disable-next-line no-await-in-loop -- each stamp is its own assertion
      const result = await freshness(recording, cwd, bad, ["docs/a.md"]);
      expect(result.unresolved).toBe(true);
      expect(result.verdict).toBe("stale");
    }
    expect(seen.flat().some((arg) => arg.includes("--output"))).toBe(false);
    // Non-degenerate: the same repository resolves its real stamp.
    expect((await freshness(recording, cwd, stamp, ["docs/a.md"])).unresolved).toBe(false);
  });

  it("exempts a path moved only after the chain's base, and keeps one moved before it stale", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, "docs/a.md", "between stamp and base");
    const base = await touchAndCommit(cwd, "history.md", "the chain's run base");
    await touchAndCommit(cwd, "src/b.ts", "the chain's first file");
    await touchAndCommit(cwd, "docs/a.md", "the chain again");

    const reads = ["docs/a.md", "src/b.ts", SPACED];
    expect(await freshness(git, cwd, stamp, reads, { exemptSince: base })).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/a.md", reason: "moved" }],
      exempt: ["src/b.ts"],
      unresolved: false,
    });
    // Without the base, the chain's own commit stales the path too.
    expect(await freshness(git, cwd, stamp, reads)).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/a.md", reason: "moved" },
        { path: "src/b.ts", reason: "moved" },
      ],
      exempt: [],
      unresolved: false,
    });
  });

  it("grants no exemption from a base the stamp does not lead to", async (ctx) => {
    const older = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await touchAndCommit(cwd, "history.md", "the plan's stamp");
    await touchAndCommit(cwd, "src/b.ts", "moved after the stamp");

    // A base older than the stamp would exempt everything if the range alone decided.
    expect(await freshness(git, cwd, stamp, ["src/b.ts"], { exemptSince: older })).toEqual({
      verdict: "stale",
      stale: [{ path: "src/b.ts", reason: "moved" }],
      exempt: [],
      unresolved: false,
    });
    expect(
      await freshness(git, cwd, stamp, ["src/b.ts"], { exemptSince: "not-a-sha" }),
    ).toMatchObject({ verdict: "stale", exempt: [] });
  });

  it("grants no exemption from a base on a side branch, though it descends from the stamp", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const line = writeGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]).trim();
    writeGit(cwd, ["checkout", "--quiet", "-b", "side"]);
    const sideBase = await touchAndCommit(cwd, "history.md", "a base off HEAD's line");
    writeGit(cwd, ["checkout", "--quiet", line]);
    const lineBase = await touchAndCommit(cwd, "history.md", "a base on HEAD's line");
    await touchAndCommit(cwd, "src/b.ts", "moved on HEAD's own line");

    // stamp..sideBase never touched src/b.ts, so the range alone would exempt it.
    expect(await freshness(git, cwd, stamp, ["src/b.ts"], { exemptSince: sideBase })).toEqual({
      verdict: "stale",
      stale: [{ path: "src/b.ts", reason: "moved" }],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: a base on HEAD's line exempts the same move.
    expect(await freshness(git, cwd, stamp, ["src/b.ts"], { exemptSince: lineBase })).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: ["src/b.ts"],
      unresolved: false,
    });
  });

  it("exempts a path the chain deleted after its base, and keeps one deleted before it missing", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    writeGit(cwd, ["rm", "--quiet", "--", "docs/a.md"]);
    writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "drop a before the base"]);
    const base = await touchAndCommit(cwd, "history.md", "the chain's run base");
    writeGit(cwd, ["rm", "--quiet", "--", "src/b.ts"]);
    writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "the chain's first file drops b"]);
    // Deleted in the working tree only: no commit since the stamp touched it.
    await rm(join(cwd, SPACED));

    expect(
      await freshness(git, cwd, stamp, ["docs/a.md", "src/b.ts", SPACED], { exemptSince: base }),
    ).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/a.md", reason: "missing" },
        { path: SPACED, reason: "missing" },
      ],
      exempt: ["src/b.ts"],
      unresolved: false,
    });
  });

  it("reports a folder git is kept from as an error, not as an unresolved stamp", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    // A folder inside the repository shaped like a bare repository: the runner refuses it before git starts.
    const shaped = join(cwd, "planted");
    await mkdir(join(shaped, "objects"), { recursive: true });
    await mkdir(join(shaped, "refs"), { recursive: true });
    await writeFile(join(shaped, "HEAD"), "ref: refs/heads/main\n", "utf8");

    const result = await freshness(git, shaped, stamp, ["absent.md"]);
    expect(result).toMatchObject({
      verdict: "stale",
      stale: [{ path: "absent.md", reason: "missing" }],
      exempt: [],
      unresolved: false,
    });
    expect(result.error).toMatch(/bare repository/);
    // Non-degenerate: the repository around it resolves the same stamp.
    expect(await freshness(git, cwd, stamp, ["docs/a.md"])).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: [],
      unresolved: false,
    });
  });

  it("reports a stamp past a shallow clone's history as an error, not as an unresolved stamp", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, "src/b.ts", "after the stamp");
    const shallow = join(cwd, "shallow");
    writeGit(cwd, ["clone", "--quiet", "--depth", "1", `file://${cwd}`, shallow]);
    expect(writeGit(shallow, ["rev-parse", "--is-shallow-repository"]).trim()).toBe("true");

    const result = await freshness(git, shallow, stamp, ["docs/a.md"]);
    expect(result).toMatchObject({ verdict: "stale", stale: [], exempt: [], unresolved: false });
    expect(result.error).toMatch(/shallow clone/);
    // Non-degenerate: the clone's own tip resolves, and a full repository reads the same stamp.
    expect((await freshness(git, shallow, head(shallow), ["docs/a.md"])).error).toBeUndefined();
    expect((await freshness(git, cwd, stamp, ["docs/a.md"])).error).toBeUndefined();
  });

  it("passes a path holding a space as one argv entry and reads it literally", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, SPACED, "moved");
    const seen: string[][] = [];
    // A recording wrapper around the real runner, so the argv each call carried can be read.
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };

    expect(await freshness(recording, cwd, stamp, [SPACED])).toEqual({
      verdict: "stale",
      stale: [{ path: SPACED, reason: "moved" }],
      exempt: [],
      unresolved: false,
    });
    const counts = seen.filter((args) => args.includes("rev-list"));
    expect(counts).toHaveLength(1);
    expect(counts[0]?.at(-1)).toBe(SPACED);
    expect(counts[0]).toContain("--literal-pathspecs");
  });

  it("reads an empty reads list as fresh", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, "src/b.ts", "moved");

    expect(await freshness(git, cwd, stamp, [])).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: [],
      unresolved: false,
    });
  });
});
