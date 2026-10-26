import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { gitWrite } from "../../src/cli/engine/gitWrite.ts";
import { hookPathsAt, hookPathsRead, setupRootsAt, type HookGitRead, type HookScratch } from "../../src/runs/hookPaths.ts";
import { NO_GIT_CONFIG } from "../support/repoFixtures.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * build/2 (REQ-FLOW-133, review/175): the hook files and declared scripts a commit's hook declarations name, read from
 * its tree objects through an injected git and an injected scratch folder. Both are real here: git over a scratch
 * repository, the scratch folder under the temp folder. The run verbs' suites (test/cli/commands/runCheckpoint.test.ts,
 * runEnd.test.ts, runLand.test.ts) cover the callers.
 */

const ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: NO_GIT_CONFIG, GIT_AUTHOR_NAME: "A", GIT_AUTHOR_EMAIL: "a@example.com", GIT_COMMITTER_NAME: "A", GIT_COMMITTER_EMAIL: "a@example.com" };

const declaring = (...scripts: string[]): string => `${JSON.stringify({ hooks: scripts.map((script) => ({ event: "pre_tool_use", command: ["node", script] })) })}\n`;

describe("hookPathsAt", () => {
  const getRoot = useTempDir("hook-paths");

  /** A repository whose one commit holds `files`; its full commit id. */
  async function commit(files: Record<string, string>): Promise<{ repo: string; sha: string }> {
    const repo = getRoot().path(`repo-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(repo, { recursive: true });
    const run = (args: string[]): string => execFileSync("git", args, { cwd: repo, encoding: "utf8", env: { ...process.env, ...ENV } }).trim();
    run(["init", "-q"]);
    await Promise.all(
      Object.entries(files).map(async ([path, text]) => {
        await mkdir(dirname(join(repo, path)), { recursive: true });
        await writeFile(join(repo, path), text);
      }),
    );
    run(["add", "-A"]);
    run(["commit", "-q", "-m", "seed"]);
    return { repo, sha: run(["rev-parse", "HEAD"]) };
  }

  /** The real git in `repo`, as the run verbs' runner answers. */
  const gitIn =
    (repo: string): HookGitRead =>
    (args) =>
      new Promise((resolve) => {
        execFile("git", [...args], { cwd: repo, encoding: "utf8", env: { ...process.env, ...ENV } }, (error, stdout, stderr) => {
          resolve({ code: error === null ? 0 : typeof error.code === "number" ? error.code : 1, stdout, stderr });
        });
      });

  /** A real scratch folder, counting the folders made and removed. */
  function scratch(): HookScratch & { made: number; removed: number } {
    const counts = { made: 0, removed: 0 };
    return Object.assign(counts, {
      create: () => {
        counts.made += 1;
        return mkdtempSync(join(tmpdir(), "stamity-hooks-test-"));
      },
      place: (root: string, path: string, text: string) => {
        const file = join(root, ...path.split("/"));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      },
      remove: (root: string) => {
        counts.removed += 1;
        rmSync(root, { recursive: true, force: true });
      },
    });
  }

  it("holds the hook files and the script each declaration names, whether or not the commit holds it, and removes its scratch folder", async () => {
    const { repo, sha } = await commit({ ".stamity/manifest.json": "{}\n", ".stamity/hooks/guard.json": declaring("tools/guard.mjs", "tools/new.mjs"), "tools/guard.mjs": "guard\n" });
    const folder = scratch();

    expect(await hookPathsAt({ git: gitIn(repo), scratch: folder }, "", sha)).toEqual([".stamity/hooks", ".stamity/manifest.json", ".stamity/packs", "tools/guard.mjs", "tools/new.mjs"]);
    expect(folder).toMatchObject({ made: 1, removed: 1 });
  });

  it("reads a project below the git top from its own folder, every path written from the top", async () => {
    const { repo, sha } = await commit({ "app/.stamity/manifest.json": "{}\n", "app/.stamity/hooks/guard.json": declaring("tools/guard.mjs"), "app/tools/guard.mjs": "guard\n" });

    expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, "app/", sha)).toEqual(["app/.stamity/hooks", "app/.stamity/manifest.json", "app/.stamity/packs", "app/tools/guard.mjs"]);
  });

  it("refuses a declaration that does not parse, and a script path that leaves the repository", async () => {
    const broken = await commit({ ".stamity/hooks/broken.json": "{ not json\n" });
    expect(await hookPathsAt({ git: gitIn(broken.repo), scratch: scratch() }, "", broken.sha)).toBe(
      "hold refused: .stamity/hooks/broken.json at Base: does not parse, so the hook scripts it names are unknown and the run pushes nothing; fix it on the base branch, then start the run again from it",
    );
    const outside = await commit({ ".stamity/hooks/guard.json": declaring("/etc/guard.mjs") });
    expect(await hookPathsAt({ git: gitIn(outside.repo), scratch: scratch() }, "", outside.sha)).toMatch(/^hold refused: \.stamity\/hooks\/guard\.json at Base: /);
  });

  it("names a failed read by its error code, never its message, which can hold a machine's path (review/108)", async () => {
    const { repo, sha } = await commit({ ".stamity/hooks/guard.json": declaring("tools/guard.mjs") });
    const folder = scratch();
    const failing: HookScratch = {
      ...folder,
      place: (root, path, text) => {
        if (path.endsWith(".json")) throw Object.assign(new Error("EACCES: permission denied, open '/Users/someone/secret/place.json'"), { code: "EACCES" });
        folder.place(root, path, text);
      },
    };

    const read = await hookPathsAt({ git: gitIn(repo), scratch: failing }, "", sha);

    expect(read).toBe(
      "hold refused: the hook declarations at Base: could not be read (EACCES), so the hook scripts they name are unknown and the run pushes nothing; fix it on the base branch, then start the run again from it",
    );
    expect(read).not.toContain("/Users/someone");
  });

  it("holds a declared script through the write runner though a replace ref makes its declaration name none (review/114)", async () => {
    const { repo, sha } = await commit({ ".stamity/hooks/guard.json": declaring("tools/guard.mjs"), "tools/guard.mjs": "guard\n" });
    const run = (args: string[], input?: string): string => execFileSync("git", args, { cwd: repo, encoding: "utf8", ...(input === undefined ? {} : { input }), env: { ...process.env, ...ENV } }).trim();
    const declared = run(["rev-parse", `${sha}:.stamity/hooks/guard.json`]);
    run(["replace", declared, run(["hash-object", "-w", "--stdin"], '{"hooks":[]}\n')]);
    expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, "", sha)).not.toContain("tools/guard.mjs");

    expect(await hookPathsAt({ git: (args) => gitWrite(repo, args), scratch: scratch() }, "", sha)).toContain("tools/guard.mjs");
  });

  // review/203: a drive-relative argument has no separator, so it was read as a bare name and held as written, while a
  // Windows hook resolves it on the drive's current folder, a file the hold never named.
  it.each([
    { shape: "a drive-led argument", argument: "C:x" },
    { shape: "a drive-led option value", argument: "--out=C:x" },
  ])("refuses the hold for $shape, naming the drive", async ({ argument }) => {
    const { repo, sha } = await commit({
      ".stamity/manifest.json": "{}\n",
      ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", argument] }] })}\n`,
      "tools/guard.mjs": "guard\n",
    });

    expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, "", sha)).toMatch(
      /^hold refused: \.stamity\/hooks\/guard\.json at Base: names C:x, which is absolute or names a drive or a scheme/,
    );
  });

  it("still skips a scheme value of two or more letters, neither holding nor refusing it (review/203)", async () => {
    const { repo, sha } = await commit({
      ".stamity/manifest.json": "{}\n",
      ".stamity/hooks/guard.json": `${JSON.stringify({ hooks: [{ event: "pre_tool_use", command: ["node", "tools/guard.mjs", "https:x"] }] })}\n`,
      "tools/guard.mjs": "guard\n",
    });

    expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, "", sha)).toEqual([".stamity/hooks", ".stamity/manifest.json", ".stamity/packs", "tools/guard.mjs"]);
  });

  it("names only the hook folders where the commit declares no hook", async () => {
    const { repo, sha } = await commit({ "a.txt": "a\n" });
    const folder = scratch();

    expect(await hookPathsAt({ git: gitIn(repo), scratch: folder }, "", sha)).toEqual([".stamity/hooks", ".stamity/manifest.json", ".stamity/packs"]);
    expect(folder.made).toBe(0);
  });

  describe("every setup root in the repository (REQ-FLOW-102)", () => {
    /** A setup at the top whose declaration names a script, and a second setup below it. */
    const TWO_SETUPS = {
      ".stamity/manifest.json": "{}\n",
      ".stamity/hooks/guard.json": declaring("tools/guard.mjs"),
      "tools/guard.mjs": "guard\n",
      "apps/web/.stamity/manifest.json": "{}\n",
      "apps/web/.stamity/hooks/lint.json": declaring("tools/lint.mjs"),
      "apps/web/tools/lint.mjs": "lint\n",
      "apps/web/src/a.ts": "a\n",
    };

    it("lists each folder whose tree holds a manifest, the top as the empty root, from the commit alone", async () => {
      const { repo, sha } = await commit({ ...TWO_SETUPS, "x/.STAMITY/Manifest.json": "{}\n", "y/stamity/manifest.json": "{}\n", "z/.stamity/manifest.json.bak": "{}\n" });
      await mkdir(join(repo, "w", ".stamity"), { recursive: true });
      await writeFile(join(repo, "w", ".stamity", "manifest.json"), "{}\n");

      // A manifest spelled in another letter case is a root a case-folding checkout reads; the work tree's own is not read.
      expect(await setupRootsAt(gitIn(repo), sha)).toEqual(["", "apps/web/", "x/"]);
    });

    it("lists no root for a tree with no manifest, and the hold then reads the run's own prefix as before", async () => {
      const { repo, sha } = await commit({ ".stamity/hooks/guard.json": declaring("tools/guard.mjs"), "tools/guard.mjs": "guard\n" });

      expect(await setupRootsAt(gitIn(repo), sha)).toEqual([]);
      const today = await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, "", sha);
      expect(today).toEqual([".stamity/hooks", ".stamity/manifest.json", ".stamity/packs", "tools/guard.mjs"]);
      expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, [""], sha)).toEqual(today);
    });

    it("names the commit's listing failure by git's exit code", async () => {
      const { repo } = await commit({ "a.txt": "a\n" });

      expect(await setupRootsAt(gitIn(repo), "0".repeat(40))).toMatch(/^hold refused: the setups in the tree of 0{40} could not be listed \(git ls-tree answered \d+\)/);
    });

    it("holds the script the top's declaration names for a run below it, and each root's own, read from that root", async () => {
      const { repo, sha } = await commit(TWO_SETUPS);
      const roots = await setupRootsAt(gitIn(repo), sha);
      if (typeof roots === "string") throw new Error(roots);
      const folder = scratch();

      const read = await hookPathsRead({ git: gitIn(repo), scratch: folder }, ["apps/web/", ...roots], sha);

      expect(read).toEqual([
        ".stamity/hooks",
        ".stamity/manifest.json",
        ".stamity/packs",
        "apps/web/.stamity/hooks",
        "apps/web/.stamity/manifest.json",
        "apps/web/.stamity/packs",
        "apps/web/tools/lint.mjs",
        "tools/guard.mjs",
      ]);
      // The run's own prefix and the listed root are one root, read once.
      expect(folder).toMatchObject({ made: 2, removed: 2 });
    });

    it("refuses where a second root's manifest does not parse, naming that root's file", async () => {
      const { repo, sha } = await commit({ ...TWO_SETUPS, "apps/web/.stamity/manifest.json": "{ not json\n" });

      expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, ["", "apps/web/"], sha)).toBe(
        "hold refused: apps/web/.stamity/manifest.json at Base: does not parse, so the hook scripts it names are unknown and the run pushes nothing; fix it on the base branch, then start the run again from it",
      );
    });

    it("refuses where a second root's manifest is a link, as the run's own is", async () => {
      const { repo } = await commit(TWO_SETUPS);
      const run = (args: string[], input?: string): string => execFileSync("git", args, { cwd: repo, encoding: "utf8", ...(input === undefined ? {} : { input }), env: { ...process.env, ...ENV } }).trim();
      run(["rm", "-q", "--cached", "apps/web/.stamity/manifest.json"]);
      run(["update-index", "--add", "--cacheinfo", `120000,${run(["hash-object", "-w", "--stdin"], "../../.stamity/manifest.json")},apps/web/.stamity/manifest.json`]);
      run(["commit", "-q", "-m", "link"]);
      const sha = run(["rev-parse", "HEAD"]);

      expect(await setupRootsAt(gitIn(repo), sha)).toEqual(["", "apps/web/"]);
      expect(await hookPathsAt({ git: gitIn(repo), scratch: scratch() }, ["", "apps/web/"], sha)).toMatch(/^hold refused: apps\/web\/\.stamity\/manifest\.json at Base: passes through a link/);
    });
  });
});
