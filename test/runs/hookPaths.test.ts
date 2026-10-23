import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { hookPathsAt, type HookGitRead, type HookScratch } from "../../src/runs/hookPaths.ts";
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

  it("names only the hook folders where the commit declares no hook", async () => {
    const { repo, sha } = await commit({ "a.txt": "a\n" });
    const folder = scratch();

    expect(await hookPathsAt({ git: gitIn(repo), scratch: folder }, "", sha)).toEqual([".stamity/hooks", ".stamity/manifest.json", ".stamity/packs"]);
    expect(folder.made).toBe(0);
  });
});
