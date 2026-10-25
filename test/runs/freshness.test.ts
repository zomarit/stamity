import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, rm, symlink, utimes, writeFile } from "node:fs/promises";
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

/** Symbolic links need a privilege Windows runners do not grant by default; CI's Windows legs run the rest. */
const WINDOWS = process.platform === "win32";

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

/** Plant a symbolic link at `path` pointing at `target`, commit it alone, and return the new HEAD as the stamp. */
async function linkAndCommit(cwd: string, path: string, target: string): Promise<string> {
  await symlink(target, join(cwd, path));
  writeGit(cwd, ["add", "--", path]);
  writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `link ${path}`]);
  return head(cwd);
}

/**
 * Record `path` in HEAD's tree with `mode`, its blob holding `content`, while the disk holds a plain
 * file with the same content: a link (120000) as a checkout with `core.symlinks=false` stores it, or a
 * gitlink (160000) naming `content` as its commit. No file-system link, so it runs on every platform.
 * Commits it alone and returns the new HEAD.
 */
async function treeEntryAndCommit(cwd: string, path: string, mode: "120000" | "160000", content: string): Promise<string> {
  let object = content;
  if (mode === "120000") {
    const target = join(cwd, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    object = writeGit(cwd, ["hash-object", "-w", "--", path]).trim();
  } else {
    await mkdir(join(cwd, path), { recursive: true });
  }
  writeGit(cwd, ["update-index", "--add", "--cacheinfo", `${mode},${object},${path}`]);
  writeGit(cwd, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", `tree entry ${path}`]);
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

  it.skipIf(WINDOWS)("reads a linked read path as stale, though only its target moved since the stamp", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await linkAndCommit(cwd, "docs/link.md", "a.md");
    await touchAndCommit(cwd, "docs/a.md", "the target moved");

    // The link's own history is untouched since the stamp, so a history count alone reads it fresh.
    expect(writeGit(cwd, ["rev-list", "--count", `${stamp}..HEAD`, "--", "docs/link.md"]).trim()).toBe("0");
    expect(await freshness(git, cwd, stamp, ["docs/link.md"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/link.md", reason: "link" }],
      exempt: [],
      unresolved: false,
    });
  });

  it.skipIf(WINDOWS)("reads a path under a linked folder as stale, and leaves the real path beside it to history", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await linkAndCommit(cwd, "linkdir", "docs");
    await touchAndCommit(cwd, "docs/a.md", "the target moved");

    expect(await freshness(git, cwd, stamp, ["linkdir/a.md", "src/b.ts"])).toEqual({
      verdict: "stale",
      stale: [{ path: "linkdir/a.md", reason: "link" }],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: the path the link points to is judged by its own history.
    expect(await freshness(git, cwd, stamp, ["docs/a.md"])).toMatchObject({ stale: [{ path: "docs/a.md", reason: "moved" }] });
  });

  it.skipIf(WINDOWS)("decides a link before any history count, and no chain base exempts it", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await linkAndCommit(cwd, "docs/link.md", "a.md");
    const base = await touchAndCommit(cwd, "history.md", "the chain's run base");
    await touchAndCommit(cwd, "src/b.ts", "the chain's first file");
    const seen: string[][] = [];
    // A recording wrapper around the real runner, so the paths git counted can be read.
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };

    expect(await freshness(recording, cwd, stamp, ["docs/link.md", "src/b.ts"], { exemptSince: base })).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/link.md", reason: "link" }],
      exempt: ["src/b.ts"],
      unresolved: false,
    });
    const counted = seen.filter((args) => args.includes("rev-list")).map((args) => args.at(-1));
    expect(counted).not.toContain("docs/link.md");
    expect(counted).toContain("src/b.ts");
  });

  it("reads a link HEAD's tree records as stale, though the disk holds it as a plain file", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await treeEntryAndCommit(cwd, "docs/link.md", "120000", "a.md");
    await touchAndCommit(cwd, "docs/a.md", "the target moved");

    // The disk walk alone sees a regular file, and the link's own history is untouched since the stamp.
    expect((await lstat(join(cwd, "docs/link.md"))).isSymbolicLink()).toBe(false);
    expect(writeGit(cwd, ["rev-list", "--count", `${stamp}..HEAD`, "--", "docs/link.md"]).trim()).toBe("0");
    expect(await freshness(git, cwd, stamp, ["docs/link.md", "src/b.ts"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/link.md", reason: "link" }],
      exempt: [],
      unresolved: false,
    });
  });

  it("reads a folder whose tree at HEAD holds a link as stale, and counts a folder without one as before", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await treeEntryAndCommit(cwd, "docs/deep/up.md", "120000", "../../src/b.ts");
    await touchAndCommit(cwd, "src/b.ts", "the target moved");

    // The folder's own history is untouched since the stamp, so a history count alone reads it fresh.
    expect(writeGit(cwd, ["rev-list", "--count", `${stamp}..HEAD`, "--", "docs"]).trim()).toBe("0");
    expect(await freshness(git, cwd, stamp, ["docs"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs", reason: "link" }],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: a folder holding no link is judged by its history, moved or not.
    expect(await freshness(git, cwd, stamp, ["src", "notes with space"])).toEqual({
      verdict: "stale",
      stale: [{ path: "src", reason: "moved" }],
      exempt: [],
      unresolved: false,
    });
  });

  it("refuses a read path not in git's plain form before any walk or count", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = head(cwd);
    await touchAndCommit(cwd, "docs/a.md", "moved after the stamp");
    const seen: string[][] = [];
    // A recording wrapper around the real runner, so the paths git was given can be read.
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };
    const spellings = [
      "docs/a.md/",
      "/docs/a.md",
      "docs//a.md",
      "./docs/a.md",
      "docs/./a.md",
      "docs/../docs/a.md",
      "docs/a.md/.",
      "..",
      "docs\\a.md",
      "C:/docs/a.md",
      "",
    ];

    expect(await freshness(recording, cwd, stamp, spellings)).toEqual({
      verdict: "stale",
      stale: spellings.map((path) => ({ path, reason: "spelling" })),
      exempt: [],
      unresolved: false,
    });
    const handed = seen.filter((args) => args.includes("--")).flatMap((args) => args.slice(args.indexOf("--") + 1));
    expect(handed.filter((path) => spellings.includes(path))).toEqual([]);
    // An unresolved stamp still names the spelling, which needs no git to decide.
    expect(await freshness(git, cwd, "0000000deadbeef", ["docs/a.md/"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/a.md/", reason: "spelling" }],
      exempt: [],
      unresolved: true,
    });
    // Non-degenerate: the plain spelling of the same file reads moved.
    expect(await freshness(git, cwd, stamp, ["docs/a.md"])).toMatchObject({ stale: [{ path: "docs/a.md", reason: "moved" }] });
  });

  it("reads a path on disk that HEAD's tree does not hold as untracked, and passes a gitlink", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await treeEntryAndCommit(cwd, "vendor/sub", "160000", head(cwd));
    await writeFile(join(cwd, "docs/new.md"), "never committed\n", "utf8");
    await writeFile(join(cwd, "vendor/sub/inside.md"), "the submodule's own file\n", "utf8");
    await writeFile(join(cwd, ".gitignore"), "ignored.md\n", "utf8");
    await writeFile(join(cwd, "ignored.md"), "ignored\n", "utf8");

    expect(await freshness(git, cwd, stamp, ["docs/new.md", "vendor/sub/inside.md", "ignored.md", "vendor/sub", "docs/a.md"])).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/new.md", reason: "untracked" },
        { path: "vendor/sub/inside.md", reason: "untracked" },
        { path: "ignored.md", reason: "untracked" },
      ],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: a path missing from disk and from HEAD stays `missing`.
    expect(await freshness(git, cwd, stamp, ["docs/gone.md"])).toMatchObject({ stale: [{ path: "docs/gone.md", reason: "missing" }] });
  });

  it("reads a tracked folder as untracked once it holds a file outside HEAD's tree, ignored or not", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    const stamp = await touchAndCommit(cwd, ".gitignore", "*.out");
    await writeFile(join(cwd, "docs/extra.md"), "never committed\n", "utf8");
    await writeFile(join(cwd, "src/build.out"), "ignored output\n", "utf8");
    // The ignored case is real: git itself reads the file as ignored (check-ignore exits 0 only then).
    expect(writeGit(cwd, ["check-ignore", "--", "src/build.out"]).trim()).toBe("src/build.out");
    const seen: string[][] = [];
    // A recording wrapper around the real runner, so the paths the added listing read can be checked.
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };

    // No commit since the stamp touched either folder, so a history count alone reads both fresh.
    expect(writeGit(cwd, ["rev-list", "--count", `${stamp}..HEAD`, "--", "docs", "src"]).trim()).toBe("0");
    expect(await freshness(recording, cwd, stamp, ["docs", "src", "notes with space", "docs/a.md"])).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs", reason: "untracked" },
        { path: "src", reason: "untracked" },
      ],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: a clean tracked folder and a tracked file beside the new one stay fresh,
    // and the listing ran once per folder path, never for a file.
    const listed = seen.filter((args) => args.includes("ls-files")).map((args) => args.at(-1));
    expect(listed).toEqual(["docs", "src", "notes with space"]);
    expect(await freshness(git, cwd, stamp, ["notes with space", "docs/a.md"])).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: [],
      unresolved: false,
    });
  });

  it("reads a tracked folder as untracked once its index holds an entry HEAD's tree does not, staged or intent-to-add", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await writeFile(join(cwd, "docs/staged.md"), "staged, never committed\n", "utf8");
    writeGit(cwd, ["add", "--", "docs/staged.md"]);
    await writeFile(join(cwd, "src/intent.ts"), "export const intent = 1;\n", "utf8");
    writeGit(cwd, ["add", "--intent-to-add", "--", "src/intent.ts"]);

    // The disk listing alone sees neither: both are in the index.
    expect(writeGit(cwd, ["ls-files", "--others", "--", "docs", "src"])).toBe("");
    expect(await freshness(git, cwd, stamp, ["docs", "src", "notes with space"])).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs", reason: "untracked" },
        { path: "src", reason: "untracked" },
      ],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: the same staged file named as its own read path reads the same way, and a
    // tracked file whose change is staged is not an entry outside HEAD's tree.
    // TEST CHANGE, justified (REQ-FLOW-091, Package 20's unit R3, round 2's W-2): a staged edit to a tracked file
    // now reads stale `uncommitted`; the pin still holds that it is not read as `untracked`.
    await writeFile(join(cwd, "docs/a.md"), "a staged edit\n", { encoding: "utf8", flag: "a" });
    writeGit(cwd, ["add", "--", "docs/a.md"]);
    expect(await freshness(git, cwd, stamp, ["docs/staged.md", "docs/a.md", "notes with space"])).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/staged.md", reason: "untracked" },
        { path: "docs/a.md", reason: "uncommitted" },
      ],
      exempt: [],
      unresolved: false,
    });
  });

  it("reads a tracked path whose work tree or index differs from HEAD as uncommitted, as a file and below a folder", async (ctx) => {
    await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await touchAndCommit(cwd, "lib/c.ts", "export const c = 1;");
    const stamp = await touchAndCommit(cwd, "lib/d.ts", "export const d = 1;");
    await writeFile(join(cwd, "docs/a.md"), "an edit on disk\n", { encoding: "utf8", flag: "a" });
    await writeFile(join(cwd, "src/b.ts"), "export const staged = 2;\n", { encoding: "utf8", flag: "a" });
    writeGit(cwd, ["add", "--", "src/b.ts"]);
    await rm(join(cwd, SPACED));
    await rm(join(cwd, "lib/c.ts"));
    await mkdir(join(cwd, "lib/c.ts"));
    await writeFile(join(cwd, "lib/c.ts/inner.md"), "a folder where a file was\n", "utf8");

    // HEAD is the stamp, so a history count alone reads each fresh: an edit on disk (a file path), a staged
    // edit below a folder, a deletion below a folder, and a file the disk now holds as a folder.
    expect(await freshness(git, cwd, stamp, ["docs/a.md", "src", "notes with space", "lib/c.ts"])).toEqual({
      verdict: "stale",
      stale: [
        { path: "docs/a.md", reason: "uncommitted" },
        { path: "src", reason: "uncommitted" },
        { path: "notes with space", reason: "uncommitted" },
        { path: "lib/c.ts", reason: "uncommitted" },
      ],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: an edit on disk below a folder reads the same, and a clean sibling stays fresh.
    expect(await freshness(git, cwd, stamp, ["docs", "lib/d.ts"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs", reason: "uncommitted" }],
      exempt: [],
      unresolved: false,
    });
  });

  it.skipIf(WINDOWS)("reads a folder whose tracked file the disk holds as a link, uncommitted, as uncommitted", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await rm(join(cwd, "src/b.ts"));
    await symlink("../docs/a.md", join(cwd, "src/b.ts"));

    // The index still holds a plain file there, so neither listing below the folder sees it.
    expect(writeGit(cwd, ["ls-files", "--others", "--", "src"])).toBe("");
    expect(await freshness(git, cwd, stamp, ["src"])).toEqual({
      verdict: "stale",
      stale: [{ path: "src", reason: "uncommitted" }],
      exempt: [],
      unresolved: false,
    });
    // Non-degenerate: the file named alone is a link on the disk walk, which comes first.
    expect(await freshness(git, cwd, stamp, ["src/b.ts"])).toMatchObject({ stale: [{ path: "src/b.ts", reason: "link" }] });
  });

  it("keeps a touched but unchanged file and a clean tree fresh, writing no index, one status read per tracked path", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    // Same bytes, new modification time: the index's stat data no longer matches the file.
    const later = new Date(Date.now() + 60_000);
    await utimes(join(cwd, "docs/a.md"), later, later);
    const index = await readFile(join(cwd, ".git/index"));
    const seen: string[][] = [];
    const recording: GitRunner = (args, dir) => {
      seen.push([...args]);
      return git(args, dir);
    };

    expect(await freshness(recording, cwd, stamp, ["docs/a.md", "src", SPACED, "docs/gone.md"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs/gone.md", reason: "missing" }],
      exempt: [],
      unresolved: false,
    });
    expect(await readFile(join(cwd, ".git/index"))).toEqual(index);
    // One status read per tracked path on disk; none for the missing one.
    const statusRead = seen.filter((args) => args.includes("status"));
    expect(statusRead.map((args) => args.at(-1))).toEqual(["docs/a.md", "src", SPACED]);
    expect(statusRead[0]).toEqual(["--literal-pathspecs", "status", "--porcelain=v1", "-z", "--untracked-files=no", "--", "docs/a.md"]);
    expect(await freshness(git, cwd, stamp, ["docs/a.md", "src", SPACED])).toEqual({
      verdict: "fresh",
      stale: [],
      exempt: [],
      unresolved: false,
    });
  });

  it("names a listing past the runner's output bound as that, not as a timeout", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    // A fake overflow for the listing alone, with the fields Node sets when it stops a child past `maxBuffer`.
    const overflowing: GitRunner = (args, dir) => {
      if (args.includes("ls-files")) throw Object.assign(new Error("spawnSync git ENOBUFS"), { code: "ENOBUFS", signal: "SIGTERM", status: null });
      return git(args, dir);
    };

    expect(await freshness(overflowing, cwd, stamp, ["docs"])).toEqual({
      verdict: "stale",
      stale: [],
      exempt: [],
      unresolved: false,
      error: "git ls-files printed more than the runner reads",
    });
  });

  it("counts a nested repository inside a tracked folder, and not an empty untracked folder", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    await mkdir(join(cwd, "docs/inner"), { recursive: true });
    writeGit(join(cwd, "docs/inner"), ["init", "--quiet"]);
    await writeFile(join(cwd, "docs/inner/file.md"), "the nested repository's own file\n", "utf8");
    await mkdir(join(cwd, "src/empty/deeper"), { recursive: true });

    expect(await freshness(git, cwd, stamp, ["docs", "src"])).toEqual({
      verdict: "stale",
      stale: [{ path: "docs", reason: "untracked" }],
      exempt: [],
      unresolved: false,
    });
  });

  it("reports a failed listing below a tracked folder as an error, the verdict stale", async (ctx) => {
    const stamp = await seededRepo(() => ctx.skip());
    const cwd = tempDir().dir;
    // A fake failure for the listing alone: real git does not fail on demand, and every other call stays real.
    const failing: GitRunner = (args, dir) => {
      if (args.includes("ls-files")) throw Object.assign(new Error("listing failed"), { status: 128 });
      return git(args, dir);
    };

    expect(await freshness(failing, cwd, stamp, ["docs"])).toEqual({
      verdict: "stale",
      stale: [],
      exempt: [],
      unresolved: false,
      error: "git ls-files exited 128",
    });
    // Non-degenerate: a read path that is a file runs no listing, so the same runner answers fresh.
    expect(await freshness(failing, cwd, stamp, ["docs/a.md"])).toEqual({
      verdict: "fresh",
      stale: [],
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
