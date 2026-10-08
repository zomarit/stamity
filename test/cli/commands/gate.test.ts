import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gateCommand, toProjectPath } from "../../../src/cli/commands/gate.ts";
import { gitCheckRunner } from "../../../src/cli/engine/gitStatus.ts";
import { runInProcess } from "../../support/inProcess.ts";
import { NO_GIT_CONFIG } from "../../support/repoFixtures.ts";
import { useTempDir } from "../../support/tempDir.ts";

/**
 * p1a-classifier-verb (REQ-FLOW-061): `stamity gate classify --paths`, through
 * the in-process funnel, so each case also covers the 0/1/2 exit contract and
 * the one JSON document. `--paths` classifies by path rules alone and reads no
 * file and no git, so no fixture repository is needed and nothing is stubbed.
 *
 * p1c-classify-git-reads: without `--paths` the verb reads the change from git.
 * Those cases run real git in scratch repositories, never a scripted runner:
 * the hardened runner and the NUL-separated parse are the thing under test.
 */

const run = (argv: readonly string[], opts?: { cwd?: string }) =>
  runInProcess([gateCommand], ["gate", ...argv], opts);

describe("stamity gate classify --paths", () => {
  it("prints the JSON document for a docs path", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc).toEqual({
      ok: true,
      command: "gate",
      version: expect.any(String) as string,
      subcommand: "classify",
      base: null,
      paths: ["docs/x.md"],
      class: "docs",
      checks: ["scan", "tests-selected", "review-once"],
      lenses: [],
      reason: expect.stringContaining("no base was given") as string,
      byPath: [{ path: "docs/x.md", class: "docs", rule: "docs/**" }],
    });
  });

  it("takes several paths and reports the strongest class", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", ".stamity/manifest.json", "--json"]);

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc["class"]).toBe("security-sensitive");
    expect(doc["lenses"]).toEqual(["stamity-security"]);
    expect(doc["paths"]).toEqual(["docs/x.md", ".stamity/manifest.json"]);
  });

  it("prints the class, checks, lenses, reason and one row per path for a person", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "src/x.ts"]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("class: product");
    expect(result.stdout).toContain("checks: scan, gates-all, review");
    expect(result.stdout).toContain("lenses: none");
    expect(result.stdout).toContain("reason: ");
    expect(result.stdout).toMatch(/^ {2}docs\/x\.md {2}docs {2}\(docs\/\*\*\)$/m);
    expect(result.stdout).toMatch(/^ {2}src\/x\.ts {2}product /m);
  });

  it("strips control characters from a path before it reaches the terminal", async () => {
    const result = await run(["classify", "--paths", "docs/a\u001b[31m.md"]);

    expect(result.code).toBe(0);
    expect(result.stdout).not.toContain("\u001b");
  });

  it("exits 2 on an unknown subcommand", async () => {
    const result = await run(["bogus", "--paths", "docs/x.md"]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("bogus");
    expect(result.stdout).toBe("");
  });

  // TEST CHANGE, justified (2026-10-09, p1c-classify-git-reads): this case
  // asserted that `classify` with no `--paths` exits 2, because p1a had no other
  // path source. p1c makes git that source (REQ-FLOW-061), so a bare `classify`
  // now reads the change and reports. The exit-2 refusal it pinned moves to the
  // input p1c still refuses before git runs, a `--base` that starts with `-`
  // (covered below, in a scratch repository, with no file written).
  it("without --paths reads the change from git instead of refusing", async () => {
    const result = await run(["classify", "--json"], { cwd: process.cwd() });

    expect(result.code).toBe(0);
    const doc = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(doc["subcommand"]).toBe("classify");
    expect(doc["base"]).toBeNull();
  });

  it("exits 2 on an unknown option", async () => {
    const result = await run(["classify", "--paths", "docs/x.md", "--bogus"]);

    expect(result.code).toBe(2);
  });

  it("is hidden and reads only: no --dry-run is registered", async () => {
    expect(gateCommand.hidden).toBe(true);
    expect(gateCommand.mutating).toBe(false);
    const result = await run(["classify", "--paths", "docs/x.md", "--dry-run"]);
    expect(result.code).toBe(2);
  });
});

describe("toProjectPath", () => {
  it("keeps a top-level path whole at the top-level", () => {
    expect(toProjectPath("", "docs/x.md")).toBe("docs/x.md");
  });

  it("strips the project's prefix from a path inside it", () => {
    expect(toProjectPath("app/", "app/.stamity/manifest.json")).toBe(".stamity/manifest.json");
    expect(toProjectPath("pkg/app/", "pkg/app/src/x.ts")).toBe("src/x.ts");
  });

  it("answers null for a path outside the project, a sibling sharing the prefix's letters included", () => {
    expect(toProjectPath("app/", "other/x.ts")).toBeNull();
    expect(toProjectPath("app/", "application/x.ts")).toBeNull();
    expect(toProjectPath("app/", "app/")).toBeNull();
  });
});

// ── Reading the change from git (p1c) ────────────────────────────────────────

const gitAvailable = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Seeding isolation, as in `test/cli/engine/gitStatus.test.ts`: the host's
 * global and system config never reach a seeding call. The verb's runner drops
 * every `GIT_*` variable, so these values cut nothing for the read; the read is
 * isolated by {@link classifyIn}, which points `HOME` at an empty folder.
 */
const SEED_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: NO_GIT_CONFIG,
  GIT_CONFIG_SYSTEM: NO_GIT_CONFIG,
  GIT_AUTHOR_NAME: "Alice Example",
  GIT_AUTHOR_EMAIL: "alice@example.com",
  GIT_COMMITTER_NAME: "Alice Example",
  GIT_COMMITTER_EMAIL: "alice@example.com",
} as const;

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...SEED_ENV },
  });
}

interface Classified {
  code: number;
  stdout: string;
  stderr: string;
  doc: Record<string, unknown>;
}

describe.skipIf(!gitAvailable)("stamity gate classify reading the change from git", () => {
  const getRoot = useTempDir("gate-git");

  /** A repository at `<root>/<name>` holding `files`, committed once; returns its path. */
  async function seedRepo(name: string, files: Record<string, string>): Promise<string> {
    const repo = getRoot().path(name);
    await mkdir(repo, { recursive: true });
    git(repo, ["init", "-q"]);
    await getRoot().seedFiles(Object.fromEntries(Object.entries(files).map(([path, body]) => [`${name}/${path}`, body])));
    git(repo, ["add", "-A"]);
    git(repo, ["commit", "-q", "-m", "base"]);
    return repo;
  }

  /**
   * Runs `gate classify … --json` in `cwd` with `HOME` at an empty folder, so no
   * global config of the host reaches the verb's git. The runner reads this
   * process's environment, so the overrides go there for the run's duration.
   */
  async function classifyIn(cwd: string, argv: readonly string[], env: Record<string, string> = {}): Promise<Classified> {
    const home = getRoot().path("home");
    await mkdir(home, { recursive: true });
    const overrides: Record<string, string> = { HOME: home, XDG_CONFIG_HOME: home, ...env };
    const previous = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const result = await run(["classify", ...argv, "--json"], { cwd });
      const doc = result.stdout === "" ? {} : (JSON.parse(result.stdout) as Record<string, unknown>);
      return { ...result, doc };
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  it("lists a staged, an unstaged and an untracked change, and reads a rename as a rename", async () => {
    const repo = await seedRepo("repo", {
      "docs/a.md": "one line that the rename keeps\nand a second one\n",
      "docs/staged.md": "base\n",
      "docs/unstaged.md": "base\n",
    });
    await getRoot().seedFiles({
      "repo/docs/staged.md": "staged\n",
      "repo/docs/unstaged.md": "unstaged\n",
      "repo/docs/untracked.md": "new\n",
    });
    git(repo, ["add", "--", "docs/staged.md"]);
    await mkdir(join(repo, "src"));
    git(repo, ["mv", "docs/a.md", "src/a.ts"]);
    const head = git(repo, ["rev-parse", "HEAD"]).trim();

    const { code, doc } = await classifyIn(repo, ["--base", "HEAD"]);

    expect(code).toBe(0);
    expect(doc["base"]).toBe(head);
    expect((doc["paths"] as string[]).toSorted()).toEqual(
      ["docs/a.md", "docs/staged.md", "docs/unstaged.md", "docs/untracked.md", "src/a.ts"].toSorted(),
    );
    expect(doc["class"]).toBe("product");
    // Read as a deletion plus an addition, no rename clause would name both sides.
    expect(doc["reason"]).toContain("the rename docs/a.md -> src/a.ts crosses docs and product");
  });

  it("round-trips a file name with non-ASCII characters byte for byte", async () => {
    const repo = await seedRepo("repo", { "docs/base.md": "base\n" });
    await getRoot().seedFiles({
      "repo/docs/naïve résumé 日本.md": "untracked\n",
      "repo/docs/ünïcödé.md": "staged\n",
    });
    git(repo, ["add", "--", "docs/ünïcödé.md"]);

    const { code, doc } = await classifyIn(repo, []);

    expect(code).toBe(0);
    expect((doc["paths"] as string[]).toSorted()).toEqual(["docs/naïve résumé 日本.md", "docs/ünïcödé.md"].toSorted());
    expect(doc["class"]).toBe("docs");
  });

  it("reads the same paths whatever the repository's diff and quoting config says", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n", "src/b.ts": "export {};\n" });
    await getRoot().seedFiles({
      "repo/docs/a.md": "changed\n",
      "repo/src/b.ts": "export const b = 1;\n",
      "repo/docs/ünïcödé.md": "new\n",
    });
    const before = await classifyIn(repo, ["--base", "HEAD"]);

    // The external diff sits outside the repository, so it is no untracked change itself.
    const marker = getRoot().path("external-diff-ran").replaceAll("\\", "/");
    const script = getRoot().path("external-diff.sh");
    await getRoot().seedFiles({ "external-diff.sh": `#!/bin/sh\ntouch '${marker}'\n` });
    await chmod(script, 0o755);
    git(repo, ["config", "diff.external", script.replaceAll("\\", "/")]);
    git(repo, ["config", "color.diff", "always"]);
    git(repo, ["config", "color.ui", "always"]);
    git(repo, ["config", "diff.noprefix", "true"]);
    git(repo, ["config", "core.quotePath", "true"]);
    const after = await classifyIn(repo, ["--base", "HEAD"]);

    expect(before.code).toBe(0);
    expect((before.doc["paths"] as string[]).length).toBe(3);
    expect(after.code).toBe(0);
    expect(after.doc["paths"]).toEqual(before.doc["paths"]);
    expect(after.doc["class"]).toBe(before.doc["class"]);
    expect(existsSync(marker)).toBe(false);
  });

  it.each([["--output=x"], ["-x"]])("refuses --base %s with exit 2 before git runs, writing no file", async (ref) => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });

    const { code, stdout, stderr } = await classifyIn(repo, ["--base", ref]);

    expect(code).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("--base");
    expect(existsSync(join(repo, "x"))).toBe(false);
  });

  it("says at least product, naming the ref, for a base that does not resolve", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });

    const { code, doc } = await classifyIn(repo, ["--base", "no-such-ref"]);

    expect(code).toBe(0);
    expect(doc["class"]).toBe("product");
    expect(doc["base"]).toBeNull();
    expect(doc["reason"]).toContain("no-such-ref");
    expect(doc["checks"]).toEqual(["scan", "gates-all", "review"]);
  });

  it("says product, naming the cause, in a directory that is no git work tree", async () => {
    const plain = getRoot().path("plain");
    await mkdir(plain);
    await getRoot().seedFiles({ "plain/docs/a.md": "x\n" });

    const { code, doc } = await classifyIn(plain, []);

    expect(code).toBe(0);
    expect(doc["class"]).toBe("product");
    expect(doc["base"]).toBeNull();
    expect(doc["reason"]).toContain("no git work tree");
  });

  it("says product, naming the cause, when no git binary runs", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });
    const emptyPath = getRoot().path("no-binaries");
    await mkdir(emptyPath);

    const { code, doc } = await classifyIn(repo, [], { PATH: emptyPath, Path: emptyPath });

    expect(code).toBe(0);
    expect(doc["class"]).toBe("product");
    expect(doc["reason"]).toContain("git could not run");
  });

  it("never reads a committed folder shaped like a bare repository, nor runs its fsmonitor", async () => {
    const root = getRoot().path("planted");
    await mkdir(root);
    const marker = getRoot().path("fsmonitor-ran").replaceAll("\\", "/");
    git(root, ["init", "-q", "--bare", "."]);
    await getRoot().seedFiles({ "planted/docs/a.md": "# planted\n" });
    git(root, ["--git-dir=.", "--work-tree=.", "add", "--", "docs/a.md"]);
    git(root, ["--git-dir=.", "--work-tree=.", "commit", "-q", "-m", "planted"]);
    git(root, ["config", "--file", "config", "core.bare", "false"]);
    git(root, ["config", "--file", "config", "core.worktree", "."]);
    git(root, ["config", "--file", "config", "core.fsmonitor", `touch '${marker}'; false`]);

    const { code, doc } = await classifyIn(root, []);

    expect(code).toBe(0);
    expect(existsSync(marker)).toBe(false);
    expect(doc["class"]).toBe("product");
  });

  it("with no --base reads against HEAD and says docs for a docs-only change, no base given", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n", "src/b.ts": "export {};\n" });
    await getRoot().seedFiles({ "repo/docs/a.md": "changed\n" });

    const { code, doc } = await classifyIn(repo, []);

    expect(code).toBe(0);
    expect(doc["class"]).toBe("docs");
    expect(doc["base"]).toBeNull();
    expect(doc["paths"]).toEqual(["docs/a.md"]);
    expect(doc["reason"]).toContain("no base was given");
  });

  it("classifies --paths against a resolved --base, reading no diff", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n" });
    await getRoot().seedFiles({ "repo/src/b.ts": "untracked\n" });
    const head = git(repo, ["rev-parse", "HEAD"]).trim();

    const { code, doc } = await classifyIn(repo, ["--paths", "docs/x.md", "--base", "HEAD"]);

    expect(code).toBe(0);
    expect(doc["base"]).toBe(head);
    expect(doc["paths"]).toEqual(["docs/x.md"]);
    expect(doc["class"]).toBe("docs");
    expect(doc["reason"]).not.toContain("no base was given");
  });

  it("reads the whole project from a run folder under the top-level .stamity/, as from the root", async () => {
    const repo = await seedRepo("repo", { ".stamity/manifest.json": "{}\n", "docs/a.md": "base\n" });
    await mkdir(join(repo, ".stamity", "runs", "x"), { recursive: true });
    await getRoot().seedFiles({ "repo/.stamity/manifest.json": '{"changed":true}\n', "repo/docs/a.md": "changed\n" });

    const fromRoot = await classifyIn(repo, ["--base", "HEAD"]);
    const fromRun = await classifyIn(join(repo, ".stamity", "runs", "x"), ["--base", "HEAD"]);

    expect(fromRoot.doc["class"]).toBe("security-sensitive");
    expect(fromRun.code).toBe(0);
    expect(fromRun.doc["class"]).toBe(fromRoot.doc["class"]);
    expect(fromRun.doc["paths"]).toEqual(fromRoot.doc["paths"]);
    expect(fromRun.doc["reason"]).not.toContain("outside the project");
  });

  it("takes the git top-level as the project when no ancestor holds .stamity/", async () => {
    const repo = await seedRepo("repo", { "docs/a.md": "base\n", "src/b.ts": "export {};\n" });
    await getRoot().seedFiles({ "repo/docs/a.md": "changed\n", "repo/src/b.ts": "export const b = 1;\n" });

    const { code, doc } = await classifyIn(join(repo, "docs"), []);

    expect(code).toBe(0);
    expect((doc["paths"] as string[]).toSorted()).toEqual(["docs/a.md", "src/b.ts"]);
    expect(doc["class"]).toBe("product");
  });

  describe("a project below the git top-level", () => {
    const PROJECT_FILES = {
      "app/.stamity/manifest.json": "{}\n",
      "app/docs/x.md": "base\n",
      "other/x.ts": "export {};\n",
    };

    it("classifies by the project's own layout and counts a path outside it", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({ "repo/app/.stamity/manifest.json": '{"changed":true}\n', "repo/other/x.ts": "export const x = 1;\n" });

      const { code, doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("security-sensitive");
      expect(doc["paths"]).toEqual([".stamity/manifest.json"]);
      expect(doc["byPath"]).toEqual([
        { path: ".stamity/manifest.json", class: "security-sensitive", rule: ".stamity/manifest.json" },
      ]);
      expect(doc["reason"]).toContain("1 changed path outside the project left out");
    });

    it("reads the same paths with diff.relative set, and lists an untracked file by its project path", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({ "repo/app/docs/x.md": "changed\n", "repo/app/new.md": "new\n" });
      const before = await classifyIn(join(repo, "app"), []);
      git(repo, ["config", "diff.relative", "true"]);
      const after = await classifyIn(join(repo, "app"), []);

      expect(before.code).toBe(0);
      expect((before.doc["paths"] as string[]).toSorted()).toEqual(["docs/x.md", "new.md"]);
      expect(after.doc["paths"]).toEqual(before.doc["paths"]);
      expect(after.doc["class"]).toBe("docs");
    });

    it("says at least product when only paths outside the project changed", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({ "repo/other/x.ts": "export const x = 1;\n" });

      const { code, doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["class"]).toBe("product");
      expect(doc["paths"]).toEqual([]);
      expect(doc["reason"]).toContain("1 changed path outside the project left out");
      expect(doc["reason"]).toContain("no changed path was named");
    });

    // Amended 2026-10-09 (re-review r3, ledger plan/63): the project root is the
    // nearest ancestor of the cwd, up to the top-level, that holds `.stamity/`,
    // so a run started in a subfolder of the project still sees all of it.
    it("reads the whole project from a subfolder of it, as from its root", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      await getRoot().seedFiles({
        "repo/app/.stamity/manifest.json": '{"changed":true}\n',
        "repo/app/docs/x.md": "changed\n",
        "repo/other/x.ts": "export const x = 1;\n",
      });

      const fromRoot = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);
      const fromDocs = await classifyIn(join(repo, "app", "docs"), ["--base", "HEAD"]);

      expect(fromRoot.doc["class"]).toBe("security-sensitive");
      expect((fromRoot.doc["paths"] as string[]).toSorted()).toEqual([".stamity/manifest.json", "docs/x.md"]);
      expect(fromDocs.code).toBe(0);
      expect(fromDocs.doc["class"]).toBe(fromRoot.doc["class"]);
      expect(fromDocs.doc["paths"]).toEqual(fromRoot.doc["paths"]);
      expect(fromDocs.doc["reason"]).toContain("1 changed path outside the project left out");
    });

    it("keeps the inside side of a rename that crosses the project's edge", async () => {
      const repo = await seedRepo("repo", PROJECT_FILES);
      git(repo, ["mv", "other/x.ts", "app/x.ts"]);

      const { code, doc } = await classifyIn(join(repo, "app"), ["--base", "HEAD"]);

      expect(code).toBe(0);
      expect(doc["paths"]).toEqual(["x.ts"]);
      expect(doc["reason"]).toContain("1 changed path outside the project left out");
    });
  });
});

describe.skipIf(!gitAvailable)("gitCheckRunner", () => {
  it("passes its output bound to git: a bound below the output fails the call", () => {
    expect(gitCheckRunner({ timeoutMs: 60_000, maxBuffer: 64 * 1024 * 1024 })(["--version"], process.cwd())).toMatch(
      /^git version /,
    );
    expect(() => gitCheckRunner({ timeoutMs: 60_000, maxBuffer: 4 })(["--version"], process.cwd())).toThrow();
  });
});
