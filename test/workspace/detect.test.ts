import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectSubRepos,
  detectWorkspaceContext,
  isWorkspaceRoot,
  shouldSuggestWorkspace,
  type DetectedRepo,
} from "../../src/workspace/detect.ts";
import { WORKSPACE_MANIFEST_FILE } from "../../src/workspace/model.ts";
import { useTempDir } from "../support/tempDir.ts";

/**
 * Real temp directories rather than the virtual-fs lane: every contract here is
 * a filesystem fact the module reads directly — `.git` as a directory versus a
 * file, a manifest name held by a directory, and an upward walk that has to
 * terminate at the real filesystem root.
 */
const getRoot = useTempDir("workspace-detect");

/** A member repository in the classic shape: a `.git` directory, nothing else. */
const gitRepo = (path: string): Record<string, string> => ({
  [`${path}/.git/HEAD`]: "ref: main\n",
});

/** The workspace manifest body is never parsed by detection — presence is the whole signal. */
const MANIFEST = `{"version":"1.0.0"}\n`;

const paths = (repos: readonly DetectedRepo[]): string[] => repos.map((repo) => repo.path);

describe("detectSubRepos", () => {
  it("reports each repository with its name and what marks it", async () => {
    const root = getRoot();
    await root.seedFiles({
      ...gitRepo("api"),
      "web/.stamity/manifest.json": MANIFEST,
      "docs/README.md": "# docs\n",
    });

    expect(await detectSubRepos(root.dir)).toEqual([
      { path: "api", name: "api", hasGit: true, hasManifest: false },
      { path: "web", name: "web", hasGit: false, hasManifest: true },
    ]);
  });

  it("counts a `.git` file, the shape a worktree or submodule checkout leaves", async () => {
    const root = getRoot();
    await root.seedFiles({ "linked/.git": "gitdir: ../main/.git/worktrees/linked\n" });

    expect(await detectSubRepos(root.dir)).toEqual([
      { path: "linked", name: "linked", hasGit: true, hasManifest: false },
    ]);
  });

  it("skips node_modules and dot-directories, hiding vendored and internal checkouts", async () => {
    const root = getRoot();
    await root.seedFiles({
      ...gitRepo("keep"),
      ...gitRepo("node_modules/some-dep"),
      ...gitRepo(".cache/vendored"),
      // A submodule's real repository lives under the parent's `.git/modules`; the
      // dot-directory skip is what keeps that internal checkout out of the results.
      "keep/.git/modules/sub/HEAD": "ref: main\n",
    });

    expect(paths(await detectSubRepos(root.dir))).toEqual(["keep"]);
  });

  it("descends the default depth and stops below it", async () => {
    const root = getRoot();
    await root.seedFiles({
      ...gitRepo("apps/area/team/near"),
      ...gitRepo("apps/area/team/deeper/far"),
    });

    expect(paths(await detectSubRepos(root.dir))).toEqual(["apps/area/team/near"]);
  });

  it("honours an explicit maxDepth in both directions", async () => {
    const root = getRoot();
    await root.seedFiles({ ...gitRepo("top"), ...gitRepo("apps/area/team/deeper/far") });

    expect(paths(await detectSubRepos(root.dir, { maxDepth: 1 }))).toEqual(["top"]);
    expect(paths(await detectSubRepos(root.dir, { maxDepth: 5 }))).toEqual([
      "apps/area/team/deeper/far",
      "top",
    ]);
  });

  it("clamps a zero or negative depth to one level, never to an empty tree", async () => {
    const root = getRoot();
    await root.seedFiles(gitRepo("top"));

    expect(paths(await detectSubRepos(root.dir, { maxDepth: 0 }))).toEqual(["top"]);
    expect(paths(await detectSubRepos(root.dir, { maxDepth: -3 }))).toEqual(["top"]);
  });

  it("stops at the first repository on a branch", async () => {
    const root = getRoot();
    await root.seedFiles({ ...gitRepo("outer"), ...gitRepo("outer/vendor/inner") });

    expect(paths(await detectSubRepos(root.dir))).toEqual(["outer"]);
  });

  it("never counts the scanned root itself, even when it is a repository", async () => {
    const root = getRoot();
    await root.seedFiles({
      ".git/HEAD": "ref: main\n",
      ".stamity/manifest.json": MANIFEST,
      ...gitRepo("api"),
      ...gitRepo("web"),
    });

    expect(paths(await detectSubRepos(root.dir))).toEqual(["api", "web"]);
  });

  it("sorts by path so the same tree scans to the same list", async () => {
    const root = getRoot();
    await root.seedFiles({ ...gitRepo("zeta"), ...gitRepo("alpha"), ...gitRepo("mid") });

    expect(paths(await detectSubRepos(root.dir))).toEqual(["alpha", "mid", "zeta"]);
  });

  it("reports an empty list for a directory that does not exist", async () => {
    const root = getRoot();

    expect(await detectSubRepos(root.path("absent"))).toEqual([]);
  });
});

describe("detectWorkspaceContext", () => {
  it("classifies the directory holding the manifest as the root", async () => {
    const root = getRoot();
    await root.seedFiles({ [WORKSPACE_MANIFEST_FILE]: MANIFEST });

    expect(await detectWorkspaceContext(root.dir)).toEqual({
      role: "workspace-root",
      workspaceRoot: root.dir,
      manifestPath: root.path(WORKSPACE_MANIFEST_FILE),
    });
  });

  it("walks up from a nested member directory to the root manifest", async () => {
    const root = getRoot();
    await root.seedFiles({
      [WORKSPACE_MANIFEST_FILE]: MANIFEST,
      "apps/web/src/index.ts": "export {};\n",
    });

    expect(await detectWorkspaceContext(root.path("apps", "web", "src"))).toEqual({
      role: "workspace-member",
      workspaceRoot: root.dir,
      manifestPath: root.path(WORKSPACE_MANIFEST_FILE),
    });
  });

  it("normalizes the directory it was handed before classifying", async () => {
    const root = getRoot();
    await root.seedFiles({ [WORKSPACE_MANIFEST_FILE]: MANIFEST, "apps/web/keep": "" });

    const context = await detectWorkspaceContext(join(root.dir, "apps", "..", "apps", "web"));

    expect(context.role).toBe("workspace-member");
    expect(context.workspaceRoot).toBe(root.dir);
  });

  it("prefers the nearest enclosing workspace", async () => {
    const root = getRoot();
    await root.seedFiles({
      [WORKSPACE_MANIFEST_FILE]: MANIFEST,
      [`inner/${WORKSPACE_MANIFEST_FILE}`]: MANIFEST,
      "inner/api/src/main.ts": "export {};\n",
    });

    const context = await detectWorkspaceContext(root.path("inner", "api"));

    expect(context.workspaceRoot).toBe(root.path("inner"));
  });

  it("keeps walking past an ancestor where the manifest name is a directory", async () => {
    const root = getRoot();
    await root.seedFiles({
      [WORKSPACE_MANIFEST_FILE]: MANIFEST,
      [`mid/${WORKSPACE_MANIFEST_FILE}/notes.txt`]: "not a manifest\n",
      "mid/api/src/main.ts": "export {};\n",
    });

    // The nearest-wins rule reads presence of a *file*; a directory wearing the
    // name must not shadow the real workspace above it.
    expect((await detectWorkspaceContext(root.path("mid", "api"))).workspaceRoot).toBe(root.dir);
  });

  it("classifies standalone with nulls when no manifest encloses the directory", async () => {
    const root = getRoot();
    await root.seedFiles({ "solo/package.json": "{}\n" });

    expect(await detectWorkspaceContext(root.path("solo"))).toEqual({
      role: "standalone",
      workspaceRoot: null,
      manifestPath: null,
    });
  });

  it("gives up at the parent-walk cap instead of climbing to the filesystem root", async () => {
    const root = getRoot();
    const deep = "a/b/c/d/e/f/g/h/i/j/k/l";
    await root.seedFiles({ [WORKSPACE_MANIFEST_FILE]: MANIFEST, [`${deep}/keep`]: "" });

    // Twelve levels below the manifest: the cap stops the walk two directories short of it.
    expect((await detectWorkspaceContext(root.path(deep))).role).toBe("standalone");
    expect((await detectWorkspaceContext(root.path("a/b/c/d/e/f/g/h/i/j"))).role).toBe(
      "workspace-member",
    );
  });
});

describe("shouldSuggestWorkspace", () => {
  it("suggests a workspace once a directory holds two repositories", async () => {
    const root = getRoot();
    await root.seedFiles({ ...gitRepo("api"), ...gitRepo("web") });

    expect(await shouldSuggestWorkspace(root.dir)).toBe(true);
  });

  it("declines for a single repository", async () => {
    const root = getRoot();
    await root.seedFiles(gitRepo("api"));

    expect(await shouldSuggestWorkspace(root.dir)).toBe(false);
  });

  it("declines when the directory is already a workspace root", async () => {
    const root = getRoot();
    await root.seedFiles({
      [WORKSPACE_MANIFEST_FILE]: MANIFEST,
      ...gitRepo("api"),
      ...gitRepo("web"),
    });

    expect(await shouldSuggestWorkspace(root.dir)).toBe(false);
  });

  it("still suggests when the directory is itself a repository holding checkouts", async () => {
    const root = getRoot();
    await root.seedFiles({
      ".git/HEAD": "ref: main\n",
      ...gitRepo("vendor/api"),
      ...gitRepo("vendor/web"),
    });

    expect(await shouldSuggestWorkspace(root.dir)).toBe(true);
  });
});

describe("isWorkspaceRoot", () => {
  it("answers yes for a directory holding the manifest file", async () => {
    const root = getRoot();
    await root.seedFiles({ [WORKSPACE_MANIFEST_FILE]: MANIFEST });

    expect(await isWorkspaceRoot(root.dir)).toBe(true);
  });

  it("answers no for a directory without one", async () => {
    const root = getRoot();

    expect(await isWorkspaceRoot(root.dir)).toBe(false);
    expect(await isWorkspaceRoot(root.path("absent"))).toBe(false);
  });

  it("answers no when the manifest name is taken by a directory", async () => {
    const root = getRoot();
    await root.seedFiles({ [`${WORKSPACE_MANIFEST_FILE}/notes.txt`]: "not a manifest\n" });

    expect(await isWorkspaceRoot(root.dir)).toBe(false);
  });
});
